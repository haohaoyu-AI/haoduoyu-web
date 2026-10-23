import {authenticate,bodyFor,fail,now,requireAdmin,requireCsrf} from './security.mjs';
import {consistentRead,mutate,storeFor} from './storage.mjs';

const json=data=>Response.json({data});
export async function todoPreferences(store,userId) {
  return await store.get('SELECT completed_mode,version FROM matrix_todo_preferences WHERE user_id=?',userId)||{completed_mode:'strike',version:0};
}
export async function handleTodoPreferences(db,request,origin,initialRevision) {
  if(request.method==='GET') return consistentRead(db,async store=>{
    const actor=await authenticate(store,request);requireAdmin(actor);
    if(new URL(request.url).search) throw fail(400,'VALIDATION_ERROR','待办偏好不接受查询参数');
    return json(await todoPreferences(store,actor.id));
  },initialRevision);
  const first=await authenticate(storeFor(db),request,'write');requireAdmin(first);
  if(request.method!=='PATCH') throw fail(404,'NOT_FOUND','接口不存在');
  requireCsrf(request,first,origin);
  if(new URL(request.url).search) throw fail(400,'VALIDATION_ERROR','待办偏好不接受查询参数');
  const input=await bodyFor(request);
  if(Object.keys(input).sort().join(',')!=='completed_mode,version'||!['strike','hide'].includes(input.completed_mode)||!Number.isSafeInteger(input.version)||input.version<0||input.version>=Number.MAX_SAFE_INTEGER)
    throw fail(400,'VALIDATION_ERROR','完成显示偏好或版本无效');
  return (await mutate(db,async store=>{
    const actor=await authenticate(store,request,'write');requireAdmin(actor);requireCsrf(request,actor,origin);
    const current=await todoPreferences(store,actor.id);
    if(current.completed_mode===input.completed_mode&&(current.version===input.version||current.version===input.version+1))
      return {replayed:true,response:json(current)};
    if(current.version!==input.version) throw fail(409,'VERSION_CONFLICT','待办偏好已更新，请刷新后重试');
    const value={completed_mode:input.completed_mode,version:current.version+1};
    if(current.version===0) store.queue('INSERT INTO matrix_todo_preferences(user_id,completed_mode,version,updated_at) VALUES(?,?,1,?)',actor.id,input.completed_mode,now());
    else {
      store.queue('UPDATE matrix_todo_preferences SET completed_mode=?,version=version+1,updated_at=? WHERE user_id=? AND version=?',input.completed_mode,now(),actor.id,input.version);
      store.expectChange();
    }
    return {actor,response:json(value)};
  })).response;
}
