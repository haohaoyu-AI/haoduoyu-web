import {bodyFor,authenticate,fail} from './security.mjs';
import {noteEditor,limitNoteWrites} from './public-note-access.mjs';
import {storeFor,consistentRead,mutate} from './storage.mjs';
import {dailyNotesOwner} from './daily-notes.mjs';

const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
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
    return Response.json({data:{items:items.slice(0,100),has_more:items.length>100}});
  },initialRevision);
  const match=/^\/ai-reports\/([a-f0-9-]+)$/.exec(route);
  if(!match||!uuid.test(match[1])||request.method!=='PUT')throw fail(404,'NOT_FOUND','汇报接口不存在');
  const preflightActor=await reportActor(storeFor(db),request,owner,env,origin,true);
  if(preflightActor.kind==='public')limitNoteWrites(owner,'ai-reports');
  const input=await bodyFor(request);
  if(Object.keys(input).sort().join(',')!=='author,content')throw fail(400,'VALIDATION_ERROR','汇报字段无效');
  const author=reportText(input.author,'author'),content=reportText(input.content,'content'),id=match[1];
  return (await mutate(db,async store=>{
    const actor=await reportActor(store,request,owner,env,origin,true);
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
