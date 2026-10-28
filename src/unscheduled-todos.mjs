import {bodyFor,fail,now} from './security.mjs';
import {authenticateBusiness as authenticate,requireBusinessUser as requireUser,requireBusinessCsrf as requireCsrf} from './business-access.mjs';
import {consistentRead,mutate,storeFor} from './storage.mjs';

const fields='id,text,completed,version,created_at,updated_at,deleted_at';
const json=(data,status=200)=>Response.json({data},{status});
const item=row=>({...row,completed:row.completed===1||row.completed===true});
function idOf(value) {
  if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw fail(400,'VALIDATION_ERROR','待办标识需要使用 UUID');
  return value.toLowerCase();
}
function exact(input,names) {
  const keys=Object.keys(input).sort(),expected=[...names].sort();
  if(keys.length!==expected.length||keys.some((key,i)=>key!==expected[i])) throw fail(400,'VALIDATION_ERROR','请求字段不符合待办接口要求');
}
function versionOf(value) {
  if(!Number.isSafeInteger(value)||value<1||value>=Number.MAX_SAFE_INTEGER)throw fail(400,'VALIDATION_ERROR','待办版本需要为正整数');
  return value;
}
function inputFor(body,operation) {
  if(operation==='create') {
    exact(body,['id','text']);
    if(typeof body.text!=='string'||!body.text.trim()||body.text.length>500||body.text.includes('\0'))
      throw fail(400,'VALIDATION_ERROR','待办内容需要 1 至 500 个字符');
    return {id:idOf(body.id),text:body.text.trim()};
  }
  exact(body,operation==='completed'?['completed','version']:['version']);versionOf(body.version);
  if(operation==='completed'&&typeof body.completed!=='boolean')throw fail(400,'VALIDATION_ERROR','完成状态需要为布尔值');
  return body;
}
async function find(store,userId,id) {
  return store.get('SELECT '+fields+' FROM matrix_unscheduled_todos WHERE user_id=? AND id=?',userId,id);
}
async function write(store,actor,operation,id,input) {
  if(operation==='create') {
    const current=await find(store,actor.id,input.id);
    if(current) {
      if(current.text!==input.text)throw fail(409,'IDEMPOTENCY_CONFLICT','同一待办标识已经用于不同内容');
      if(current.deleted_at!==null)throw fail(410,'TODO_DELETED','待办已删除，请使用恢复操作');
      return {replayed:true,response:json(item(current))};
    }
    const stamp=now(),value={...input,completed:false,version:1,created_at:stamp,updated_at:stamp,deleted_at:null};
    store.queue('INSERT INTO matrix_unscheduled_todos(user_id,id,text,completed,version,created_at,updated_at) VALUES(?,?,?,0,1,?,?)',actor.id,input.id,input.text,stamp,stamp);
    return {actor,response:json(value,201)};
  }
  const current=await find(store,actor.id,id);
  if(!current)throw fail(404,'NOT_FOUND','待办不存在');
  if(operation==='completed'&&current.deleted_at!==null)throw fail(410,'TODO_DELETED','待办已删除，请使用恢复操作');
  const deleted=operation==='delete',restoring=operation==='restore';
  if((deleted||restoring)&&(current.deleted_at!==null)===deleted&&(current.version===input.version||current.version===input.version+1))
    return {replayed:true,response:json(item(current))};
  if(current.version!==input.version)throw fail(409,'VERSION_CONFLICT','待办已更新，请刷新后重试');
  const stamp=now(),value={...current,version:current.version+1,updated_at:stamp};
  if(operation==='completed') {
    value.completed=input.completed;
    store.queue('UPDATE matrix_unscheduled_todos SET completed=?,version=version+1,updated_at=? WHERE user_id=? AND id=? AND version=? AND deleted_at IS NULL',Number(input.completed),stamp,actor.id,id,input.version);
  } else {
    value.deleted_at=deleted?stamp:null;
    store.queue('UPDATE matrix_unscheduled_todos SET deleted_at=?,version=version+1,updated_at=? WHERE user_id=? AND id=? AND version=?',value.deleted_at,stamp,actor.id,id,input.version);
  }
  store.expectChange();return {actor,response:json(item(value))};
}
export async function handleUnscheduledTodos(db,request,route,origin,initialRevision) {
  const method=request.method;
  if(new URL(request.url).search)throw fail(400,'VALIDATION_ERROR','未来待办接口不接受查询参数');
  const single=/^\/unscheduled-todos\/([^/]+)$/.exec(route);
  if(method==='GET'&&(route==='/unscheduled-todos'||single))return consistentRead(db,async store=>{
    const actor=await authenticate(store,request);requireUser(actor);
    if(single) {
      const row=await find(store,actor.id,idOf(single[1]));
      if(!row)throw fail(404,'NOT_FOUND','待办不存在');
      return json(item(row));
    }
    const rows=await store.all('SELECT '+fields+' FROM matrix_unscheduled_todos WHERE user_id=? AND deleted_at IS NULL ORDER BY created_at,id',actor.id);
    return json({items:rows.map(item)});
  },initialRevision);
  const first=await authenticate(storeFor(db),request,method==='GET'?'read':'write');requireUser(first);
  const match=/^\/unscheduled-todos\/([^/]+)$/.exec(route),restore=/^\/unscheduled-todos\/([^/]+)\/restore$/.exec(route);
  const operation=method==='POST'&&route==='/unscheduled-todos'?'create':method==='PATCH'&&match?'completed':method==='DELETE'&&match?'delete':method==='POST'&&restore?'restore':null;
  if(!operation)throw fail(404,'NOT_FOUND','接口不存在');
  requireCsrf(request,first,origin);
  const body=await bodyFor(request),id=operation==='create'?null:idOf((match||restore)[1]),input=inputFor(body,operation);
  return (await mutate(db,async store=>{
    const actor=await authenticate(store,request,'write');requireUser(actor);requireCsrf(request,actor,origin);
    return write(store,actor,operation,id,input);
  })).response;
}
