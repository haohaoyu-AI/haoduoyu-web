import {randomUUID} from 'node:crypto';
import {bodyFor,fail} from './security.mjs';
import {storeFor,consistentRead,mutate} from './storage.mjs';
import {limitNoteWrites} from './public-note-access.mjs';
import {beijingDay} from './lib/time.mjs';

const base='/openai-review/connectivity',uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const startedAction='openai-review.connectivity.started',finishedAction='openai-review.connectivity.finished';
const scope=owner=>'openai-review-connectivity:'+owner;
const timeoutMs=120000,staleMs=180000;
const json=(data,status=200)=>Response.json({data},{status,headers:{'Cache-Control':'no-store'}});
const invalid=()=>{throw fail(400,'VALIDATION_ERROR','最小测试需要唯一 test_id 和受支持的模型');};
const messages={
  OPENAI_CONNECTIVITY_AUTH:'API 授权未通过，请检查服务器私有配置',
  OPENAI_CONNECTIVITY_RATE_LIMIT:'API 暂时限流，最小测试未通过',
  OPENAI_CONNECTIVITY_REJECTED:'API 未接受最小测试，请检查模型与配置',
  OPENAI_CONNECTIVITY_TIMEOUT:'最小测试等待超时，结果尚未确认；不会自动重复调用',
  OPENAI_CONNECTIVITY_CONNECTION:'未取得完整 API 响应，结果尚未确认；不会自动重复调用',
  OPENAI_CONNECTIVITY_INVALID_OUTPUT:'API 已响应，但未返回最小测试要求的 OK',
  OPENAI_CONNECTIVITY_UNKNOWN:'最小测试结果尚未确认；只读核查不会重复调用',
};

export const isOpenAiConnectivityRoute=route=>route===base||route.startsWith(base+'/');
function parseDetail(row) {
  if(!row)return null;
  try {return JSON.parse(row.detail_json);} catch {throw fail(503,'OPENAI_CONNECTIVITY_STATE','最小测试记录暂时无法读取');}
}
async function readRecord(store,owner,id=null) {
  const started=await store.get('SELECT entity_id,detail_json FROM audit WHERE actor=? AND action=?'+(id?' AND entity_id=?':'')+' ORDER BY created_at DESC,rowid DESC LIMIT 1',scope(owner),startedAction,...(id?[id]:[]));
  if(!started)return null;
  const detail=parseDetail(started);
  const finished=await store.get('SELECT detail_json FROM audit WHERE actor=? AND action=? AND entity_id=? ORDER BY rowid DESC LIMIT 1',scope(owner),finishedAction,started.entity_id);
  return {id:started.entity_id,...detail,...(parseDetail(finished)||{})};
}
function view(record,at) {
  const stale=record.status==='running'&&at-Date.parse(record.created_at)>=staleMs;
  const status=stale?'uncertain':record.status;
  const code=stale?'OPENAI_CONNECTIVITY_UNKNOWN':record.error_code;
  return {id:record.id,kind:'connectivity',status,stage:status==='running'?'awaiting_provider':status,
    model:record.model,created_at:record.created_at,completed_at:record.completed_at??null,
    elapsed_ms:Math.max(0,(record.completed_at?Date.parse(record.completed_at):at)-Date.parse(record.created_at)),
    provider_calls:1,error_code:code??null,error_message:messages[code]??null,
    ...(Number.isInteger(record.http_status)&&record.http_status>=100&&record.http_status<=599?{http_status:record.http_status}:{}),
    ...(status==='succeeded'?{response:'OK'}:{})};
}
async function limitTests(store,owner,at) {
  const day=beijingDay(at),actor=scope(owner);
  const count=await store.get("SELECT count(*) AS n FROM audit WHERE actor=? AND action=? AND json_extract(detail_json,'$.beijing_date')=?",actor,startedAction,day);
  const latest=parseDetail(await store.get('SELECT detail_json FROM audit WHERE actor=? AND action=? ORDER BY created_at DESC,rowid DESC LIMIT 1',actor,startedAction));
  if(count.n>=20||latest&&at-Date.parse(latest.created_at)<30000)
    throw fail(429,'OPENAI_CONNECTIVITY_TEST_LIMIT','最小测试间隔至少 30 秒，每个北京时间日期最多 20 次');
}
function queueAudit(store,owner,action,id,detail,stamp) {
  // Fixed event schema only. Provider text, source records and credentials are never stored.
  store.queue('INSERT INTO audit(id,actor,action,entity_id,detail_json,created_at) VALUES(?,?,?,?,?,?)',randomUUID(),scope(owner),action,id,JSON.stringify(detail),stamp);
}
async function boundedData(response) {
  const reader=response.body?.getReader();if(!reader)throw new Error('response_body_missing');
  const chunks=[];let size=0;
  try {
    for(;;) {const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>16384){await reader.cancel().catch(()=>{});throw Object.assign(new Error('response_too_large'),{invalidOutput:true});}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch {throw Object.assign(new Error('response_invalid'),{invalidOutput:true});}
}

// Caller supplies the same owner-scoped authorization used by the review routes.
// This operation intentionally never reads article data or writes review checkpoints.
export async function handleOpenAiConnectivity({db,request,route,owner,settings,models,authorize,providerRequest=fetch,clock=Date.now}) {
  const method=request.method,q=new URL(request.url).searchParams,id=route.startsWith(base+'/')?route.slice(base.length+1):null;
  if(!isOpenAiConnectivityRoute(route)||id!==null&&!uuid.test(id)||q.size||!['GET','POST'].includes(method)||method==='POST'&&id!==null)
    throw fail(404,'NOT_FOUND','最小测试接口不存在');
  const checkedActor=async(store,write)=>{const actor=await authorize(store,write);if(actor?.id!==owner)throw fail(403,'FORBIDDEN','此身份无权访问最小测试');return actor;};
  if(method==='GET')return consistentRead(db,async store=>{
    await checkedActor(store,false);const record=await readRecord(store,owner,id);
    if(id&&!record)throw fail(404,'NOT_FOUND','最小测试记录不存在');
    return json(record?view(record,clock()):null);
  });
  const initialActor=await checkedActor(storeFor(db),true);
  if(initialActor.kind==='public')limitNoteWrites(owner,'openai-review-connectivity',clock());
  const input=await bodyFor(request),allowed=models.map(model=>typeof model==='string'?model:model.id);
  if(Object.keys(input).sort().join(',')!=='model,test_id'||!uuid.test(input.test_id)||typeof input.model!=='string'||!allowed.includes(input.model))invalid();
  // All local request construction precedes the durable dispatch intent.
  if(!settings.key||!settings.model)throw fail(503,'OPENAI_REVIEW_NOT_CONFIGURED','服务器尚未配置有效 API 密钥和模型，未调用 API');
  const body=JSON.stringify({model:input.model,store:false,input:'Reply with exactly OK.',reasoning:{effort:'low'},max_output_tokens:256});
  let headers;
  try {headers=new Headers({Authorization:'Bearer '+settings.key,'Content-Type':'application/json'});}
  catch {throw fail(503,'OPENAI_REVIEW_INVALID_KEY_FORMAT','服务器密钥配置格式无效，未调用 API');}
  const reserved=await mutate(db,async store=>{
    const actor=await checkedActor(store,true),existing=await readRecord(store,owner,input.test_id);
    if(existing) {
      if(existing.model!==input.model)throw fail(409,'IDEMPOTENCY_CONFLICT','该测试编号已用于其他模型');
      return {replayed:true,record:existing};
    }
    const at=clock();
    const unresolved=await store.get('SELECT started.entity_id,started.detail_json FROM audit AS started WHERE started.actor=? AND started.action=? AND NOT EXISTS(SELECT 1 FROM audit AS finished WHERE finished.actor=started.actor AND finished.entity_id=started.entity_id AND finished.action=?) ORDER BY started.created_at DESC,started.rowid DESC LIMIT 1',scope(owner),startedAction,finishedAction);
    if(unresolved&&at-Date.parse(parseDetail(unresolved).created_at)<staleMs)return {replayed:true,conflict:unresolved.entity_id};
    await limitTests(store,owner,at);
    const record={id:input.test_id,status:'running',model:input.model,created_at:new Date(at).toISOString(),beijing_date:beijingDay(at)};
    queueAudit(store,owner,startedAction,record.id,record,record.created_at);return {actor,record};
  });
  if(reserved.conflict)return Response.json({error:{code:'OPENAI_CONNECTIVITY_IN_FLIGHT',message:'已有最小测试正在执行，请只读核查状态',test_id:reserved.conflict}},{status:409,headers:{'Cache-Control':'no-store'}});
  if(reserved.replayed)return json(view(reserved.record,clock()),view(reserved.record,clock()).status==='running'?202:200);
  const controller=new AbortController();let timedOut=false,httpStatus,result;
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
  try {
    const response=await providerRequest('https://api.openai.com/v1/responses',{method:'POST',headers,body,redirect:'manual',signal:controller.signal});
    httpStatus=response.status;
    if(!response.ok) {
      await response.body?.cancel().catch(()=>{});
      result={status:response.status>=500||response.status===408?'uncertain':'failed',error_code:
        [401,403].includes(response.status)?'OPENAI_CONNECTIVITY_AUTH':response.status===429?'OPENAI_CONNECTIVITY_RATE_LIMIT':'OPENAI_CONNECTIVITY_REJECTED'};
    } else {
      const data=await boundedData(response);
      const output=Array.isArray(data?.output)?data.output.filter(item=>item?.type==='message').flatMap(item=>Array.isArray(item.content)?item.content:[]).filter(item=>item?.type==='output_text').map(item=>typeof item.text==='string'?item.text:'').join('').trim():'';
      result=data?.status==='completed'&&output==='OK'?{status:'succeeded',error_code:null}:{status:'failed',error_code:'OPENAI_CONNECTIVITY_INVALID_OUTPUT'};
    }
  } catch(error) {
    result={status:error?.invalidOutput&&!timedOut?'failed':'uncertain',error_code:timedOut?'OPENAI_CONNECTIVITY_TIMEOUT':error?.invalidOutput?'OPENAI_CONNECTIVITY_INVALID_OUTPUT':'OPENAI_CONNECTIVITY_CONNECTION'};
  } finally {clearTimeout(timer);}
  const completedAt=new Date(clock()).toISOString(),outcome={...result,completed_at:completedAt,...(Number.isInteger(httpStatus)?{http_status:httpStatus}:{})};
  const finished=await mutate(db,async store=>{
    const existing=await readRecord(store,owner,input.test_id);
    if(existing?.status!=='running')return {replayed:true,record:existing};
    queueAudit(store,owner,finishedAction,input.test_id,outcome,completedAt);
    return {record:{...existing,...outcome}};
  });
  return json(view(finished.record,clock()),201);
}
