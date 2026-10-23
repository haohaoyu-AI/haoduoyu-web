import {authenticate,bodyFor,fail,now,requireAdmin,requireCsrf} from './security.mjs';
import {consistentRead,mutate,storeFor} from './storage.mjs';
import {beijingDay} from './lib/time.mjs';
import {templateId,requireActiveTemplate,describeTemplate,templateWindow} from './todo-templates.mjs';
import {todoPreferences} from './todo-preferences.mjs';

const fields='id,date,text,completed,version,created_at,updated_at,deleted_at';
const json=(data,status=200)=>Response.json({data},{status});
const item=row=>({...row,completed:row.completed===1||row.completed===true});

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

function targetedInput(input,template=false) {
  exactFields(input,template?['date','version','template_id','template_version']:['date','version']);
  validDate(input.date);
  if(!Number.isSafeInteger(input.version)||input.version<1||input.version>=Number.MAX_SAFE_INTEGER)
    throw fail(400,'VALIDATION_ERROR','待办版本需要为正整数');
  if(template) {
    if(!Number.isSafeInteger(input.template_version)||input.template_version<0||input.template_version>=Number.MAX_SAFE_INTEGER)
      throw fail(400,'VALIDATION_ERROR','模板版本无效');
    return {...input,template_id:templateId(input.template_id)};
  }
  return input;
}

async function linkedItem(store,userId,value) {
  const link=await store.get('SELECT t.id AS template_id,t.version AS template_version,t.deleted_at FROM matrix_todo_template_links AS l JOIN matrix_todo_templates AS t ON t.user_id=l.user_id AND t.id=l.template_id WHERE l.user_id=? AND l.todo_id=?',userId,value.id);
  return {...item(value),...(link?{template_id:link.template_id,template_version:link.template_version,template_active:link.deleted_at===null}:{})};
}

async function readTodos(db,request,initialRevision) {
  return consistentRead(db,async store=>{
    const actor=await authenticate(store,request);requireAdmin(actor);
    const query=new URL(request.url).searchParams;
    if([...query.keys()].some(key=>key!=='date')||query.getAll('date').length>1)
      throw fail(400,'VALIDATION_ERROR','待办查询只接受一个 date 参数');
    const today=todoToday(),date=query.has('date')?validDate(query.get('date')):today;
    const rows=await store.all('SELECT '+fields+' FROM matrix_todos WHERE user_id=? AND date=? AND deleted_at IS NULL ORDER BY created_at,rowid',actor.id,date);
    const links=await store.all('SELECT l.todo_id,l.template_id,p.version AS template_version,p.deleted_at FROM matrix_todo_template_links AS l JOIN matrix_todos AS t ON t.user_id=l.user_id AND t.id=l.todo_id JOIN matrix_todo_templates AS p ON p.user_id=l.user_id AND p.id=l.template_id WHERE l.user_id=? AND t.date=? AND t.deleted_at IS NULL',actor.id,date);
    const templates=new Map(links.map(link=>[link.todo_id,{template_id:link.template_id,template_version:link.template_version,template_active:link.deleted_at===null}]));
    const preferences=await todoPreferences(store,actor.id);
    return json({date,today,completed_mode:preferences.completed_mode,preferences_version:preferences.version,
      items:rows.map(row=>({...item(row),...templates.get(row.id)}))});
  },initialRevision);
}

async function createTodo(store,actor,input) {
  const existing=await store.get('SELECT '+fields+' FROM matrix_todos WHERE user_id=? AND id=?',actor.id,input.id);
  if(existing) {
    const link=await store.get('SELECT template_id,created_with_todo FROM matrix_todo_template_links WHERE user_id=? AND todo_id=?',actor.id,input.id);
    const originalTemplate=link?.created_with_todo===1?link.template_id:undefined;
    if(existing.date!==input.date||existing.text!==input.text||originalTemplate!==input.template_id)
      throw fail(409,'IDEMPOTENCY_CONFLICT','同一待办标识已经用于不同内容');
    if(existing.deleted_at!==null) throw fail(410,'TODO_DELETED','待办已删除，请使用恢复操作');
    return {replayed:true,response:json(await linkedItem(store,actor.id,existing))};
  }
  if(input.template_id) await requireActiveTemplate(store,actor.id,input.template_id);
  const stamp=now(),value={...input,completed:false,version:1,created_at:stamp,updated_at:stamp,deleted_at:null};
  store.queue('INSERT INTO matrix_todos(user_id,id,date,text,completed,version,created_at,updated_at) VALUES(?,?,?,?,0,1,?,?)',actor.id,input.id,input.date,input.text,stamp,stamp);
  if(input.template_id) store.queue('INSERT INTO matrix_todo_template_links(user_id,todo_id,template_id) VALUES(?,?,?)',actor.id,input.id,input.template_id);
  if(input.template_id) {
    const template=await store.get('SELECT version FROM matrix_todo_templates WHERE user_id=? AND id=?',actor.id,input.template_id);
    value.template_version=template.version;value.template_active=true;
  }
  return {actor,response:json(value,201)};
}

async function updateTodo(store,actor,id,input) {
  const current=await store.get('SELECT '+fields+' FROM matrix_todos WHERE user_id=? AND id=?',actor.id,id);
  if(!current) throw fail(404,'NOT_FOUND','待办不存在');
  if(current.deleted_at!==null) throw fail(410,'TODO_DELETED','待办已删除，请使用恢复操作');
  if(current.version!==input.version) throw fail(409,'VERSION_CONFLICT','待办已更新，请刷新后重试');
  const value={...item(current),completed:input.completed,version:current.version+1,updated_at:now()};
  store.queue('UPDATE matrix_todos SET completed=?,version=version+1,updated_at=? WHERE user_id=? AND id=? AND version=?',Number(input.completed),value.updated_at,actor.id,id,input.version);
  store.expectChange();
  return {actor,response:json(await linkedItem(store,actor.id,value))};
}

async function setDeleted(store,actor,id,input,deleted) {
  const current=await store.get('SELECT '+fields+' FROM matrix_todos WHERE user_id=? AND id=? AND date=?',actor.id,id,input.date);
  if(!current) throw fail(404,'NOT_FOUND','待办不存在');
  if((current.deleted_at!==null)===deleted&&(current.version===input.version||current.version===input.version+1))
    return {replayed:true,response:json(await linkedItem(store,actor.id,current))};
  if(current.version!==input.version) throw fail(409,'VERSION_CONFLICT','待办已更新，请刷新后重试');
  const stamp=now(),value={...current,deleted_at:deleted?stamp:null,version:current.version+1,updated_at:stamp};
  store.queue('UPDATE matrix_todos SET deleted_at=?,version=version+1,updated_at=? WHERE user_id=? AND id=? AND date=? AND version=?',value.deleted_at,stamp,actor.id,id,input.date,input.version);
  store.expectChange();
  return {actor,response:json(await linkedItem(store,actor.id,value))};
}

async function addTemplate(store,actor,id,input) {
  const current=await store.get('SELECT '+fields+' FROM matrix_todos WHERE user_id=? AND id=? AND date=? AND deleted_at IS NULL',actor.id,id,input.date);
  if(!current) throw fail(404,'NOT_FOUND','待办不存在');
  const link=await store.get('SELECT template_id FROM matrix_todo_template_links WHERE user_id=? AND todo_id=?',actor.id,id);
  const template=await store.get('SELECT id,text,version,created_at,updated_at,deleted_at FROM matrix_todo_templates WHERE user_id=? AND id=?',actor.id,input.template_id);
  if(link) {
    if(link.template_id!==input.template_id) throw fail(409,'IDEMPOTENCY_CONFLICT','待办已经关联其他模板');
    const {deleted_at,...value}=template;
    const matchesTodo=current.version===input.version;
    if(deleted_at===null) {
      const replay=matchesTodo&&(value.version===input.template_version||value.version===input.template_version+1);
      const initialReplay=input.template_version===0&&value.version===1&&current.version===input.version+1;
      if(replay||initialReplay) return {replayed:true,response:json({todo:await linkedItem(store,actor.id,current),template:await describeTemplate(store,actor.id,value)})};
    }
    if(!matchesTodo||value.version!==input.template_version) throw fail(409,'VERSION_CONFLICT','待办或模板已更新，请刷新后重试');
    const stamp=now(),restored={...value,version:value.version+1,updated_at:stamp};
    store.queue('UPDATE matrix_todo_templates SET deleted_at=NULL,version=version+1,updated_at=? WHERE user_id=? AND id=? AND version=? AND deleted_at IS NOT NULL',stamp,actor.id,input.template_id,input.template_version);
    store.expectChange();
    return {actor,response:json({todo:{...item(current),template_id:restored.id,template_version:restored.version,template_active:true},template:await describeTemplate(store,actor.id,restored)})};
  }
  if(current.version!==input.version) throw fail(409,'VERSION_CONFLICT','待办已更新，请刷新后重试');
  if(template||input.template_version!==0) throw fail(409,'IDEMPOTENCY_CONFLICT','模板标识已使用或版本无效');
  const stamp=now(),value={id:input.template_id,text:current.text,version:1,created_at:stamp,updated_at:stamp};
  store.queue('INSERT INTO matrix_todo_templates(user_id,id,text,version,created_at,updated_at) VALUES(?,?,?,1,?,?)',actor.id,value.id,value.text,stamp,stamp);
  store.queue('INSERT INTO matrix_todo_template_links(user_id,todo_id,template_id,created_with_todo) VALUES(?,?,?,0)',actor.id,id,value.id);
  store.queue('UPDATE matrix_todos SET version=version+1,updated_at=? WHERE user_id=? AND id=? AND version=?',stamp,actor.id,id,input.version);
  store.expectChange();
  const {today,window_start}=templateWindow(),completed_days=current.completed===1&&current.date>=window_start&&current.date<=today?1:0;
  return {actor,response:json({todo:{...item(current),version:current.version+1,updated_at:stamp,template_id:value.id,template_version:1,template_active:true},template:{...value,completed_days,habit_status:'todo'}})};
}

export async function handleTodos(db,request,route,origin,initialRevision) {
  const method=request.method;
  if(method==='GET'&&route==='/todos') return readTodos(db,request,initialRevision);
  const first=await authenticate(storeFor(db),request,method==='GET'?'read':'write');requireAdmin(first);
  const match=/^\/todos\/([^/]+)$/.exec(route),restore=/^\/todos\/([^/]+)\/restore$/.exec(route),template=/^\/todos\/([^/]+)\/template$/.exec(route);
  const operation=method==='POST'&&route==='/todos'?'create':method==='PATCH'&&match?'completed':method==='DELETE'&&match?'delete':method==='POST'&&restore?'restore':method==='POST'&&template?'template':null;
  if(!operation) throw fail(404,'NOT_FOUND','接口不存在');
  requireCsrf(request,first,origin);
  if(new URL(request.url).search) throw fail(400,'VALIDATION_ERROR','待办写入不接受查询参数');
  const body=await bodyFor(request);
  const id=operation==='create'?null:validId((match||restore||template)[1]);
  const input=operation==='create'?createInput(body):operation==='completed'?updateInput(body):targetedInput(body,operation==='template');
  return (await mutate(db,async store=>{
    const actor=await authenticate(store,request,'write');requireAdmin(actor);requireCsrf(request,actor,origin);
    if(operation==='create') return createTodo(store,actor,input);
    if(operation==='completed') return updateTodo(store,actor,id,input);
    if(operation==='template') return addTemplate(store,actor,id,input);
    return setDeleted(store,actor,id,input,operation==='delete');
  })).response;
}
