import {authenticate,bodyFor,fail,now,requireAdmin,requireCsrf} from './security.mjs';
import {consistentRead,mutate,storeFor} from './storage.mjs';
import {beijingDay,shiftDay} from './lib/time.mjs';

const fields='id,text,version,created_at,updated_at';
const json=(data,status=200)=>Response.json({data},{status});
const item=row=>({...row,habit_status:row.completed_days>=21?'habit':'todo'});

export function templateWindow(at=Date.now()) {
  const today=beijingDay(at);
  return {today,window_start:shiftDay(today,-29)};
}

export function templateId(value) {
  if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw fail(400,'VALIDATION_ERROR','模板标识需要使用 UUID');
  return value.toLowerCase();
}

export async function requireActiveTemplate(store,userId,id) {
  if(!await store.get('SELECT id FROM matrix_todo_templates WHERE user_id=? AND id=? AND deleted_at IS NULL',userId,id))
    throw fail(404,'NOT_FOUND','模板不存在');
}

function validate(input,method) {
  const required=method==='POST'?['id','text']:method==='PATCH'?['text','version']:['version'];
  const keys=Object.keys(input).sort();
  if(keys.length!==required.length||keys.some((key,index)=>key!==required[index]))
    throw fail(400,'VALIDATION_ERROR','请求字段不符合模板接口要求');
  const result={...input};
  if(method==='POST') result.id=templateId(input.id);
  if(method!=='DELETE') {
    if(typeof input.text!=='string'||input.text.length>500||!input.text.trim()||input.text.includes('\0'))
      throw fail(400,'VALIDATION_ERROR','模板内容需要 1 至 500 个字符');
    result.text=input.text.trim();
  }
  if(method!=='POST'&&(!Number.isSafeInteger(input.version)||input.version<1||input.version>=Number.MAX_SAFE_INTEGER))
    throw fail(400,'VALIDATION_ERROR','模板版本需要为正整数');
  return result;
}

export async function describeTemplate(store,userId,value) {
  const {today,window_start}=templateWindow();
  const count=await store.get('SELECT count(DISTINCT d.date) AS completed_days FROM matrix_todo_template_links AS l JOIN matrix_todos AS d ON d.user_id=l.user_id AND d.id=l.todo_id WHERE l.user_id=? AND l.template_id=? AND d.completed=1 AND d.deleted_at IS NULL AND d.date>=? AND d.date<=?',userId,value.id,window_start,today);
  return item({...value,completed_days:count.completed_days});
}

async function readTemplates(db,request,initialRevision) {
  return consistentRead(db,async store=>{
    const actor=await authenticate(store,request);requireAdmin(actor);
    if(new URL(request.url).search) throw fail(400,'VALIDATION_ERROR','模板查询不接受查询参数');
    const window=templateWindow();
    const rows=await store.all('SELECT t.id,t.text,t.version,t.created_at,t.updated_at,count(DISTINCT CASE WHEN d.completed=1 AND d.deleted_at IS NULL AND d.date>=? AND d.date<=? THEN d.date END) AS completed_days FROM matrix_todo_templates AS t LEFT JOIN matrix_todo_template_links AS l ON l.user_id=t.user_id AND l.template_id=t.id LEFT JOIN matrix_todos AS d ON d.user_id=l.user_id AND d.id=l.todo_id WHERE t.user_id=? AND t.deleted_at IS NULL GROUP BY t.user_id,t.id ORDER BY t.created_at,t.rowid',window.window_start,window.today,actor.id);
    return json({...window,items:rows.map(item)});
  },initialRevision);
}

async function createTemplate(store,actor,input) {
  const current=await store.get('SELECT '+fields+',deleted_at FROM matrix_todo_templates WHERE user_id=? AND id=?',actor.id,input.id);
  if(current) {
    if(current.deleted_at!==null) throw fail(410,'TEMPLATE_DELETED','模板已删除，请使用新的标识创建');
    if(current.text!==input.text) throw fail(409,'IDEMPOTENCY_CONFLICT','同一模板标识已经用于不同内容');
    const {deleted_at,...value}=current;
    return {replayed:true,response:json(await describeTemplate(store,actor.id,value))};
  }
  const stamp=now(),value={...input,version:1,created_at:stamp,updated_at:stamp};
  store.queue('INSERT INTO matrix_todo_templates(user_id,id,text,version,created_at,updated_at) VALUES(?,?,?,1,?,?)',actor.id,input.id,input.text,stamp,stamp);
  return {actor,response:json(item({...value,completed_days:0}),201)};
}

async function changeTemplate(store,actor,id,input,method) {
  const current=await store.get('SELECT '+fields+' FROM matrix_todo_templates WHERE user_id=? AND id=? AND deleted_at IS NULL',actor.id,id);
  if(!current) throw fail(404,'NOT_FOUND','模板不存在');
  if(current.version!==input.version) throw fail(409,'VERSION_CONFLICT','模板已更新，请刷新后重试');
  const stamp=now();
  if(method==='DELETE') {
    store.queue('UPDATE matrix_todo_templates SET deleted_at=?,updated_at=?,version=version+1 WHERE user_id=? AND id=? AND version=? AND deleted_at IS NULL',stamp,stamp,actor.id,id,input.version);
    store.expectChange();
    return {actor,response:json({id,deleted:true})};
  }
  store.queue('UPDATE matrix_todo_templates SET text=?,updated_at=?,version=version+1 WHERE user_id=? AND id=? AND version=? AND deleted_at IS NULL',input.text,stamp,actor.id,id,input.version);
  store.expectChange();
  const value={...current,text:input.text,version:current.version+1,updated_at:stamp};
  return {actor,response:json(await describeTemplate(store,actor.id,value))};
}

export async function handleTodoTemplates(db,request,route,origin,initialRevision) {
  const method=request.method;
  if(method==='GET'&&route==='/todo-templates') return readTemplates(db,request,initialRevision);
  const first=await authenticate(storeFor(db),request,method==='GET'?'read':'write');requireAdmin(first);
  const match=/^\/todo-templates\/([^/]+)$/.exec(route);
  if(!(method==='POST'&&route==='/todo-templates')&&!(['PATCH','DELETE'].includes(method)&&match))
    throw fail(404,'NOT_FOUND','接口不存在');
  requireCsrf(request,first,origin);
  if(new URL(request.url).search) throw fail(400,'VALIDATION_ERROR','模板写入不接受查询参数');
  const input=validate(await bodyFor(request),method),id=match?templateId(match[1]):null;
  return (await mutate(db,async store=>{
    const actor=await authenticate(store,request,'write');requireAdmin(actor);requireCsrf(request,actor,origin);
    return method==='POST'?createTemplate(store,actor,input):changeTemplate(store,actor,id,input,method);
  })).response;
}
