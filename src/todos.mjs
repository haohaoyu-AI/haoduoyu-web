import {authenticate,bodyFor,fail,now,requireAdmin,requireCsrf} from './security.mjs';
import {consistentRead,mutate,storeFor} from './storage.mjs';
import {beijingDay} from './lib/time.mjs';
import {templateId,requireActiveTemplate} from './todo-templates.mjs';

const fields='id,date,text,completed,version,created_at,updated_at';
const json=(data,status=200)=>Response.json({data},{status});
const item=row=>({...row,completed:row.completed===1});

export const todoToday=(at=Date.now())=>beijingDay(at);

function validDate(value) {
  if(typeof value!=='string'||!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value))
    throw fail(400,'VALIDATION_ERROR','日期需要使用有效的 YYYY-MM-DD');
  const parsed=new Date(value+'T00:00:00.000Z');
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)
    throw fail(400,'VALIDATION_ERROR','日期需要使用有效的 YYYY-MM-DD');
  return value;
}

function validId(value) {
  if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw fail(400,'VALIDATION_ERROR','待办标识需要使用 UUID');
  return value.toLowerCase();
}

function exactFields(input,names) {
  const actual=Object.keys(input).sort(),expected=[...names].sort();
  if(actual.length!==expected.length||actual.some((name,index)=>name!==expected[index]))
    throw fail(400,'VALIDATION_ERROR','请求字段不符合待办接口要求');
}

function createInput(input) {
  exactFields(input,Object.hasOwn(input,'template_id')?['id','date','text','template_id']:['id','date','text']);
  const id=validId(input.id),date=validDate(input.date);
  if(typeof input.text!=='string'||input.text.length>500||!input.text.trim()||input.text.includes('\0'))
    throw fail(400,'VALIDATION_ERROR','待办内容需要 1 至 500 个字符');
  return {id,date,text:input.text.trim(),...(Object.hasOwn(input,'template_id')?{template_id:templateId(input.template_id)}:{})};
}

function updateInput(input) {
  exactFields(input,['completed','version']);
  if(typeof input.completed!=='boolean'||!Number.isSafeInteger(input.version)||input.version<1||input.version>=Number.MAX_SAFE_INTEGER)
    throw fail(400,'VALIDATION_ERROR','完成状态需要为布尔值，版本需要为正整数');
  return input;
}

async function readTodos(db,request,initialRevision) {
  return consistentRead(db,async store=>{
    const actor=await authenticate(store,request);requireAdmin(actor);
    const query=new URL(request.url).searchParams;
    if([...query.keys()].some(key=>key!=='date')||query.getAll('date').length>1)
      throw fail(400,'VALIDATION_ERROR','待办查询只接受一个 date 参数');
    const today=todoToday(),date=query.has('date')?validDate(query.get('date')):today;
    const rows=await store.all('SELECT '+fields+' FROM matrix_todos WHERE user_id=? AND date=? ORDER BY created_at,rowid',actor.id,date);
    const links=await store.all('SELECT l.todo_id,l.template_id FROM matrix_todo_template_links AS l JOIN matrix_todos AS t ON t.user_id=l.user_id AND t.id=l.todo_id WHERE l.user_id=? AND t.date=?',actor.id,date);
    const templates=new Map(links.map(link=>[link.todo_id,link.template_id]));
    return json({date,today,items:rows.map(row=>({...item(row),...(templates.has(row.id)?{template_id:templates.get(row.id)}:{})}))});
  },initialRevision);
}

async function createTodo(store,actor,input) {
  const existing=await store.get('SELECT '+fields+' FROM matrix_todos WHERE user_id=? AND id=?',actor.id,input.id);
  if(existing) {
    const link=await store.get('SELECT template_id FROM matrix_todo_template_links WHERE user_id=? AND todo_id=?',actor.id,input.id);
    if(existing.date!==input.date||existing.text!==input.text||link?.template_id!==input.template_id)
      throw fail(409,'IDEMPOTENCY_CONFLICT','同一待办标识已经用于不同内容');
    return {replayed:true,response:json({...item(existing),...(link?{template_id:link.template_id}:{})})};
  }
  if(input.template_id) await requireActiveTemplate(store,actor.id,input.template_id);
  const stamp=now(),value={...input,completed:false,version:1,created_at:stamp,updated_at:stamp};
  store.queue('INSERT INTO matrix_todos(user_id,id,date,text,completed,version,created_at,updated_at) VALUES(?,?,?,?,0,1,?,?)',actor.id,input.id,input.date,input.text,stamp,stamp);
  if(input.template_id) store.queue('INSERT INTO matrix_todo_template_links(user_id,todo_id,template_id) VALUES(?,?,?)',actor.id,input.id,input.template_id);
  return {actor,response:json(value,201)};
}

async function updateTodo(store,actor,id,input) {
  const current=await store.get('SELECT '+fields+' FROM matrix_todos WHERE user_id=? AND id=?',actor.id,id);
  if(!current) throw fail(404,'NOT_FOUND','待办不存在');
  if(current.version!==input.version) throw fail(409,'VERSION_CONFLICT','待办已更新，请刷新后重试');
  const value={...item(current),completed:input.completed,version:current.version+1,updated_at:now()};
  const link=await store.get('SELECT template_id FROM matrix_todo_template_links WHERE user_id=? AND todo_id=?',actor.id,id);
  if(link) value.template_id=link.template_id;
  store.queue('UPDATE matrix_todos SET completed=?,version=version+1,updated_at=? WHERE user_id=? AND id=? AND version=?',Number(input.completed),value.updated_at,actor.id,id,input.version);
  store.expectChange();
  return {actor,response:json(value)};
}

export async function handleTodos(db,request,route,origin,initialRevision) {
  const method=request.method;
  if(method==='GET'&&route==='/todos') return readTodos(db,request,initialRevision);
  const first=await authenticate(storeFor(db),request,method==='GET'?'read':'write');requireAdmin(first);
  const match=/^\/todos\/([^/]+)$/.exec(route);
  if(!(method==='POST'&&route==='/todos')&&!(method==='PATCH'&&match))
    throw fail(404,'NOT_FOUND','接口不存在');
  requireCsrf(request,first,origin);
  if(new URL(request.url).search) throw fail(400,'VALIDATION_ERROR','待办写入不接受查询参数');
  const body=await bodyFor(request);
  const id=match?validId(match[1]):null,input=method==='POST'?createInput(body):updateInput(body);
  return (await mutate(db,async store=>{
    const actor=await authenticate(store,request,'write');requireAdmin(actor);requireCsrf(request,actor,origin);
    return method==='POST'?createTodo(store,actor,input):updateTodo(store,actor,id,input);
  })).response;
}
