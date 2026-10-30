import {bodyFor,authenticate,digest,stable,fail} from './security.mjs';
import {noteEditor,limitNoteWrites} from './public-note-access.mjs';
import {storeFor,consistentRead,mutate} from './storage.mjs';
import {dailyNotesOwner} from './daily-notes.mjs';

const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const hashPattern=/^[a-f0-9]{64}$/;
const reportHash=row=>digest(JSON.stringify(stable({id:row.id,author:row.author,content:row.content,created_at:row.created_at})));
const tombstoneActor=owner=>'ai-reports-tombstone:'+owner;
const tombstoneKey=id=>'ai-report-deleted:'+id;
export function reportText(value,kind) {
  if(typeof value!=='string'||!value.isWellFormed()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
    throw fail(400,'VALIDATION_ERROR','请填写有效的署名和实际工作内容');
  value=value.replace(/\r\n?/g,'\n').trim();
  if(!value||kind==='author'&&(/[\n\t]/.test(value)||[...value].length>120)||kind==='content'&&Buffer.byteLength(value,'utf8')>16384)
    throw fail(400,'VALIDATION_ERROR',kind==='author'?'署名须为 1–120 个字符':'工作内容须为 1–16 KiB');
  return value;
}
// Explicit credentials must never fall back to the anonymous public actor.
async function reportActor(store,request,owner,env,origin,write=false) {
  const hasAuthorization=request.headers.has('authorization');
  const hasSession=/(?:^|;\s*)matrix_session(?:\s*=|\s*(?:;|$))/.test(request.headers.get('cookie')||'');
  if(hasAuthorization&&!request.headers.get('authorization'))throw fail(401,'UNAUTHORIZED','授权凭证无效');
  if(hasAuthorization||hasSession)await authenticate(store,request,write?'write':'read');
  const actor=await noteEditor(store,request,owner,env,'ai-reports',origin,{write});
  if(!actor)throw fail(hasAuthorization||hasSession?403:401,hasAuthorization||hasSession?'FORBIDDEN':'UNAUTHORIZED','无权访问此汇报');
  return actor;
}
export async function handleAiReports(db,request,route,env,origin,initialRevision) {
  const owner=dailyNotesOwner(env),url=new URL(request.url);
  const query=url.searchParams;
  if([...query.keys()].some(key=>key!=='offset'||query.getAll(key).length!==1)||
    query.has('offset')&&!/^(0|[1-9][0-9]{0,8})$/.test(query.get('offset'))||
    request.method!=='GET'&&query.size)throw fail(400,'VALIDATION_ERROR','查询参数无效');
  const offset=Number(query.get('offset')||0);
  if(route==='/ai-reports'&&request.method==='GET') return consistentRead(db,async store=>{
    await reportActor(store,request,owner,env,origin);
    const items=await store.all('SELECT id,author,content,created_at FROM matrix_ai_reports WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 101 OFFSET ?',owner,offset);
    return Response.json({data:{items:items.slice(0,100).map(row=>({...row,content_hash:reportHash(row)})),has_more:items.length>100}});
  },initialRevision);
  const match=/^\/ai-reports\/([a-f0-9-]+)$/.exec(route);
  if(!match||!uuid.test(match[1])||!['PUT','DELETE'].includes(request.method))throw fail(404,'NOT_FOUND','汇报接口不存在');
  const preflightActor=await reportActor(storeFor(db),request,owner,env,origin,true);
  if(preflightActor.kind==='public')limitNoteWrites(owner,'ai-reports');
  const input=await bodyFor(request);
  const id=match[1];
  if(request.method==='DELETE') {
    if(Object.keys(input).sort().join(',')!=='expected_hash,save_id'||
      typeof input.expected_hash!=='string'||!hashPattern.test(input.expected_hash)||
      typeof input.save_id!=='string'||!uuid.test(input.save_id))throw fail(400,'VALIDATION_ERROR','删除需要有效的汇报版本和保存标识');
    const key='ai-report-delete:'+input.save_id;
    const requestHash=digest(JSON.stringify(stable({method:'DELETE',id,...input})));
    return (await mutate(db,async store=>{
      const actor=await reportActor(store,request,owner,env,origin,true);
      const saved=await store.get('SELECT request_hash FROM idempotency WHERE actor=? AND key=?',actor.actor,key);
      const row=await store.get('SELECT id,author,content,created_at FROM matrix_ai_reports WHERE user_id=? AND id=?',owner,id);
      if(saved) {
        if(saved.request_hash!==requestHash)throw fail(409,'IDEMPOTENCY_CONFLICT','保存标识已用于不同请求');
        if(row)throw fail(409,'VERSION_CONFLICT','汇报已发生变化，请刷新后核对');
        return {replayed:true,response:Response.json({data:{deleted:true,id}})};
      }
      if(!row)throw fail(404,'NOT_FOUND','汇报不存在');
      if(reportHash(row)!==input.expected_hash)throw fail(409,'VERSION_CONFLICT','汇报已发生变化，请刷新后核对');
      store.queue('DELETE FROM matrix_ai_reports WHERE user_id=? AND id=? AND author=? AND content=? AND created_at=?',owner,id,row.author,row.content,row.created_at);
      store.expectChange();
      const time=new Date().toISOString(),receipt=JSON.stringify({deleted:true,id});
      store.queue('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,200,?)',actor.actor,key,requestHash,receipt,time);
      store.queue('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,200,?) ON CONFLICT(actor,key) DO UPDATE SET request_hash=excluded.request_hash,response_json=excluded.response_json,created_at=excluded.created_at',tombstoneActor(owner),tombstoneKey(id),input.expected_hash,receipt,time);
      return {actor,response:Response.json({data:{deleted:true,id}})};
    })).response;
  }
  if(Object.keys(input).sort().join(',')!=='author,content')throw fail(400,'VALIDATION_ERROR','汇报字段无效');
  const author=reportText(input.author,'author'),content=reportText(input.content,'content');
  return (await mutate(db,async store=>{
    const actor=await reportActor(store,request,owner,env,origin,true);
    if(await store.get('SELECT key FROM idempotency WHERE actor=? AND key=?',tombstoneActor(owner),tombstoneKey(id)))
      throw fail(409,'AI_REPORT_DELETED','该汇报已永久删除');
    const existing=await store.get('SELECT id,author,content,created_at FROM matrix_ai_reports WHERE user_id=? AND id=?',owner,id);
    if(existing) {
      if(existing.author!==author||existing.content!==content)throw fail(409,'IDEMPOTENCY_CONFLICT','汇报标识已用于其他内容');
      return {replayed:true,response:Response.json({data:existing})};
    }
    const row={id,author,content,created_at:new Date().toISOString()};
    store.queue('INSERT INTO matrix_ai_reports(user_id,id,author,content,created_at) VALUES(?,?,?,?,?)',owner,id,author,content,row.created_at);
    return {actor,response:Response.json({data:row}, {status:201})};
  })).response;
}
