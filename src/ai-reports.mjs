import {bodyFor,authenticate,digest,stable,fail} from './security.mjs';
import {noteEditor,limitNoteWrites} from './public-note-access.mjs';
import {storeFor,consistentRead,mutate} from './storage.mjs';
import {dailyNotesOwner} from './daily-notes.mjs';

const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const hashPattern=/^[a-f0-9]{64}$/;
const reportHash=row=>digest(JSON.stringify(stable({id:row.id,author:row.author,content:row.content,created_at:row.created_at})));
const tombstoneActor=owner=>'ai-reports-tombstone:'+owner;
const tombstoneKey=id=>'ai-report-deleted:'+id;
const REVISE='ai-reports.revise';
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
  const history=/^\/ai-reports\/([a-f0-9-]+)\/revisions$/.exec(route);
  if(history&&uuid.test(history[1])&&request.method==='GET')return readRevisions(db,request,owner,env,origin,history[1],initialRevision);
  const match=/^\/ai-reports\/([a-f0-9-]+)$/.exec(route);
  if(!match||!uuid.test(match[1])||!['PUT','PATCH','DELETE'].includes(request.method))throw fail(404,'NOT_FOUND','汇报接口不存在');
  const preflightActor=await reportActor(storeFor(db),request,owner,env,origin,true);
  if(preflightActor.kind==='public')limitNoteWrites(owner,'ai-reports');
  const input=await bodyFor(request);
  const id=match[1];
  if(request.method==='PATCH')return reviseReport(db,request,owner,env,origin,id,input);
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
      // A permanent delete also removes the earlier wordings kept as revisions.
      store.queue('DELETE FROM audit WHERE entity_id=? AND action=?',id,REVISE);
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

// In-place edit of one report. Either the whole content, or one exact passage replaced by another;
// expected_hash guards against overwriting a newer version and save_id makes a retry safe.
// Each edit keeps the previous wording as a revision (owner-scoped through the report it belongs to).
function revisedContent(row,input) {
  const keys=Object.keys(input).sort().join(',');
  if(!['content,expected_hash,save_id','expected_hash,replace,save_id'].includes(keys)||
    typeof input.expected_hash!=='string'||!hashPattern.test(input.expected_hash)||
    typeof input.save_id!=='string'||!uuid.test(input.save_id))
    throw fail(400,'VALIDATION_ERROR','修改需要 expected_hash、save_id，以及 content 或 replace 其中之一');
  if(input.content!==undefined)return reportText(input.content,'content');
  const {replace}=input;
  if(!replace||typeof replace!=='object'||Array.isArray(replace)||Object.keys(replace).sort().join(',')!=='from,to'||
    typeof replace.from!=='string'||!replace.from||typeof replace.to!=='string')
    throw fail(400,'VALIDATION_ERROR','replace 须为 {from, to}，from 不能为空');
  if(!row)return null;
  const at=row.content.indexOf(replace.from);
  if(at<0)throw fail(409,'REPLACE_NOT_FOUND','汇报里找不到要替换的原文，请刷新后核对');
  if(row.content.indexOf(replace.from,at+1)>=0)throw fail(409,'REPLACE_AMBIGUOUS','要替换的原文出现了不止一次，请多带几个字让它唯一');
  return reportText(row.content.slice(0,at)+replace.to+row.content.slice(at+replace.from.length),'content');
}
async function reviseReport(db,request,owner,env,origin,id,input) {
  revisedContent(null,input);
  const key='ai-report-patch:'+input.save_id;
  const requestHash=digest(JSON.stringify(stable({method:'PATCH',id,...input})));
  return (await mutate(db,async store=>{
    const actor=await reportActor(store,request,owner,env,origin,true);
    const saved=await store.get('SELECT request_hash,response_json FROM idempotency WHERE actor=? AND key=?',actor.actor,key);
    if(saved) {
      if(saved.request_hash!==requestHash)throw fail(409,'IDEMPOTENCY_CONFLICT','保存标识已用于不同请求');
      return {replayed:true,response:Response.json(JSON.parse(saved.response_json))};
    }
    const row=await store.get('SELECT id,author,content,created_at FROM matrix_ai_reports WHERE user_id=? AND id=?',owner,id);
    if(!row)throw fail(404,'NOT_FOUND','汇报不存在');
    if(reportHash(row)!==input.expected_hash)throw fail(409,'VERSION_CONFLICT','汇报已发生变化，请刷新后核对');
    const content=revisedContent(row,input);
    const next={...row,content},body={data:{...next,content_hash:reportHash(next)}};
    if(content!==row.content) {
      store.queue('UPDATE matrix_ai_reports SET content=? WHERE user_id=? AND id=? AND content=?',content,owner,id,row.content);
      store.expectChange();
      store.audit(actor.actor,REVISE,id,{previous_content:row.content,previous_hash:input.expected_hash,content_hash:body.data.content_hash,
        save_id:input.save_id,...(input.replace?{replace:input.replace}:{})});
    }
    store.queue('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,200,?)',
      actor.actor,key,requestHash,JSON.stringify(body),new Date().toISOString());
    return {actor,response:Response.json(body)};
  })).response;
}
async function readRevisions(db,request,owner,env,origin,id,initialRevision) {
  return consistentRead(db,async store=>{
    await reportActor(store,request,owner,env,origin);
    const row=await store.get('SELECT id,author,content,created_at FROM matrix_ai_reports WHERE user_id=? AND id=?',owner,id);
    if(!row)throw fail(404,'NOT_FOUND','汇报不存在');
    const rows=await store.all('SELECT detail_json,created_at FROM audit WHERE entity_id=? AND action=?'+
      ' ORDER BY created_at DESC,rowid DESC LIMIT 100',id,REVISE);
    const items=rows.map(entry=>{const detail=JSON.parse(entry.detail_json);return {revised_at:entry.created_at,previous_content:detail.previous_content,
      previous_hash:detail.previous_hash,content_hash:detail.content_hash,...(detail.replace?{replace:detail.replace}:{})};});
    return Response.json({data:{id,content_hash:reportHash(row),items}});
  },initialRevision);
}
