import {authenticate,requireAdmin,requireCsrf,bodyFor,fail} from './security.mjs';
import {storeFor,consistentRead,mutate} from './storage.mjs';
import {dailyNotesOwner} from './daily-notes.mjs';
import {beijingDay} from './lib/time.mjs';
import {reviewDate} from './content-review-validation.mjs';
import {REVIEW_ACCOUNT,DEFAULT_REVIEW_INSTRUCTIONS,captureReviewSources,buildReviewInput,evidenceFromCapture,bytes} from './openai-review-data.mjs';
import {runReviewProvider} from './openai-review-provider.mjs';

const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const staleMs=5*60000;
const json=(data,status=200)=>Response.json({data},{status,headers:{'Cache-Control':'no-store'}});
const invalid=message=>{throw fail(400,'VALIDATION_ERROR',message);};
export function openaiReviewSettings(env) {
  const key=env.OPENAI_API_KEY,model=env.OPENAI_REVIEW_MODEL;
  return {key:typeof key==='string'&&key.length>=20&&key.length<=512&&!/[\x00-\x20\x7f]/.test(key)?key:null,
    model:typeof model==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(model)?model:null};
}
async function ownerActor(store,request,owner,origin,write=false) {
  // Unlike public review routes, no public actor or business-key fallback is valid.
  if(request.headers.has('authorization'))throw fail(403,'FORBIDDEN','OpenAI API 仅限所有者管理会话');
  const actor=await authenticate(store,request,write?'write':'read');requireAdmin(actor);
  if(actor.id!==owner)throw fail(403,'FORBIDDEN','OpenAI API 仅限明确配置的所有者');
  if(write)requireCsrf(request,actor,origin);
  return actor;
}
function runView(row,at=Date.now()) {
  const stale=row.status==='running'&&at-Date.parse(row.created_at)>=staleMs;
  return {id:row.id,account:row.account,status:stale?'uncertain':row.status,mode:row.mode,baseline_run_id:row.baseline_run_id??null,beijing_date:row.beijing_date,created_at:row.created_at,completed_at:row.completed_at,
    report_markdown:row.report_markdown,model:row.model,instruction_version:row.instruction_version,released_at:row.released_at??null,
    error_message:stale?'执行结果尚未确认，请只读查看记录；不会自动重新调用 API':row.error_message??null};
}
async function configView(store,owner,settings) {
  const saved=await store.get('SELECT instructions,version FROM matrix_openai_review_config WHERE user_id=? AND account=?',owner,REVIEW_ACCOUNT);
  const last=await store.get("SELECT completed_at FROM matrix_openai_review_runs WHERE user_id=? AND account=? AND status='succeeded' ORDER BY completed_at DESC,id DESC LIMIT 1",owner,REVIEW_ACCOUNT);
  return {account:REVIEW_ACCOUNT,instructions:saved?.instructions??DEFAULT_REVIEW_INSTRUCTIONS,version:saved?.version??0,configured:Boolean(settings.key&&settings.model),model:settings.model,connectivity:'untested',last_success_at:last?.completed_at??null};
}
function instructionsFor(value,key) {
  if(typeof value!=='string'||!value.isWellFormed()||!value.trim()||bytes(value)>32768||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))invalid('完整指令须为非空文本，最多 32 KiB');
  if(key&&value.includes(key)||/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}/.test(value))invalid('请勿在指令中填写 API Key');
  return value.replace(/\r\n?/g,'\n');
}
const failureMessages={
  OPENAI_REVIEW_PROVIDER_AUTH:'API 授权未通过，请检查服务器私有配置',
  OPENAI_REVIEW_PROVIDER_RATE_LIMIT:'API 暂时限流，本次未得到可用报告',
  OPENAI_REVIEW_PROVIDER_REJECTED:'API 未接受本次请求，请检查模型与配置',
  OPENAI_REVIEW_PROVIDER_UNKNOWN:'API 执行结果尚未确认，可能已经计费；只读核查前不会自动重试',
  OPENAI_REVIEW_INVALID_OUTPUT:'API 已响应，但未返回完整有效报告；本次未推进累计摘要',
  OPENAI_REVIEW_BUDGET:'本次已达到安全处理限额，未生成完整报告；累计摘要未推进',
};
async function finish(db,owner,id,changes) {
  return mutate(db,async store=>{
    const current=await store.get('SELECT * FROM matrix_openai_review_runs WHERE user_id=? AND id=?',owner,id);
    if(!current||current.status!=='running'||current.released_at)return {replayed:true,row:current};
    const fields=Object.keys(changes);
    store.queue('UPDATE matrix_openai_review_runs SET '+fields.map(field=>field+'=?').join(',')+" WHERE user_id=? AND id=? AND status='running' AND released_at IS NULL",...fields.map(field=>changes[field]),owner,id);
    store.expectChange();
    store.audit('user:'+owner,'openai-review.finished',id,{status:changes.status});
    return {row:{...current,...changes}};
  });
}
// Dependencies are injectable in native tests only, never from user JSON or env.
export async function handleOpenaiReview(db,request,route,env,origin,initialRevision,{request:providerRequest=fetch,clock=Date.now}={}) {
  const owner=dailyNotesOwner(env),settings=openaiReviewSettings(env),method=request.method,q=new URL(request.url).searchParams;
  const detail=/^\/openai-review\/runs\/([a-f0-9-]+)(\/release)?$/.exec(route);
  if(detail&&!uuid.test(detail[1]))throw fail(404,'NOT_FOUND','分析记录不存在');
  if(route!=='/openai-review/config'&&route!=='/openai-review/runs'&&!detail)throw fail(404,'NOT_FOUND','接口不存在');
  const list=route==='/openai-review/runs'&&method==='GET';
  if([...q.keys()].some(k=>!list||!['date','offset'].includes(k)||q.getAll(k).length!==1))invalid('查询参数无效');
  if(q.has('date'))reviewDate(q.get('date'));
  if(q.has('offset')&&(!/^(0|[1-9]\d{0,8})$/.test(q.get('offset'))))invalid('分页参数无效');
  if(method==='GET'&&!detail?.[2])return consistentRead(db,async store=>{
    await ownerActor(store,request,owner,origin);
    if(route==='/openai-review/config')return json(await configView(store,owner,settings));
    if(detail){const row=await store.get('SELECT * FROM matrix_openai_review_runs WHERE user_id=? AND id=? AND account=?',owner,detail[1],REVIEW_ACCOUNT);if(!row)throw fail(404,'NOT_FOUND','分析记录不存在');return json(runView(row,clock()));}
    const rows=await store.all('SELECT * FROM matrix_openai_review_runs WHERE user_id=? AND account=?'+(q.has('date')?' AND beijing_date=?':'')+' ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET ?',owner,REVIEW_ACCOUNT,...(q.has('date')?[q.get('date')]:[]),Number(q.get('offset')||0));
    return json({items:rows.slice(0,50).map(row=>runView(row,clock())),has_more:rows.length>50});
  },initialRevision);
  await ownerActor(storeFor(db),request,owner,origin,true);
  const input=await bodyFor(request);
  if(route==='/openai-review/config'&&method==='PATCH') {
    if(Object.keys(input).sort().join(',')!=='instructions,version'||!Number.isSafeInteger(input.version)||input.version<0)invalid('保存指令需要完整文本和当前版本');
    const instructions=instructionsFor(input.instructions,settings.key);
    return (await mutate(db,async store=>{
      const actor=await ownerActor(store,request,owner,origin,true),current=await configView(store,owner,settings);
      if(current.version!==input.version)throw fail(409,'VERSION_CONFLICT','指令已被修改，请重新读取后再保存');
      if(current.version>=Number.MAX_SAFE_INTEGER)throw fail(409,'VERSION_CONFLICT','指令版本需要维护');
      store.queue('INSERT INTO matrix_openai_review_config(user_id,account,instructions,version,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,account) DO UPDATE SET instructions=excluded.instructions,version=excluded.version,updated_at=excluded.updated_at',owner,REVIEW_ACCOUNT,instructions,current.version+1,new Date(clock()).toISOString());
      store.audit(actor.actor,'openai-review.config.updated',null,{version:current.version+1});
      return {actor,response:json({...current,instructions,version:current.version+1})};
    })).response;
  }
  if(detail?.[2]&&method==='POST') {
    if(Object.keys(input).join(',')!=='acknowledgement'||input.acknowledgement!=='provider_outcome_unknown_no_automatic_retry')invalid('解除占用需要明确确认：API 结果未知且不会自动重试');
    return (await mutate(db,async store=>{
      const actor=await ownerActor(store,request,owner,origin,true),row=await store.get('SELECT * FROM matrix_openai_review_runs WHERE user_id=? AND id=? AND account=?',owner,detail[1],REVIEW_ACCOUNT);
      if(!row) {
        // Cancel an unknown UUID with a durable receipt. A delayed original POST
        // will replay this row and can never dispatch a paid request.
        const stamp=new Date(clock()).toISOString(),revision=(await store.get('SELECT revision FROM matrix_control WHERE id=1')).revision;
        const cancelled={user_id:owner,id:detail[1],account:REVIEW_ACCOUNT,status:'failed',mode:'incremental',requested_mode:'incremental',beijing_date:beijingDay(clock()),created_at:stamp,completed_at:stamp,released_at:stamp,model:settings.model??'not-dispatched',instruction_version:1,instructions:'',baseline_run_id:null,source_revision:revision,source_manifest_json:'{}',source_data_json:'{}',input_json:'{}',report_markdown:'',summary_json:null,error_code:'OPENAI_REVIEW_CANCELLED_BEFORE_START',error_message:'已取消尚未登记的运行标识；任何延迟到达的原请求都不会调用 API',provider_response_id:null,provider_calls:0};
        const columns=Object.keys(cancelled);store.queue('INSERT INTO matrix_openai_review_runs('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')',...columns.map(field=>cancelled[field]));
        store.audit(actor.actor,'openai-review.unstarted.cancelled',cancelled.id);
        return {actor,response:json(runView(cancelled,clock()))};
      }
      if(row.released_at)return {replayed:true,response:json(runView(row,clock()))};
      if(row.status!=='uncertain'&&!(row.status==='running'&&clock()-Date.parse(row.created_at)>=staleMs))throw fail(409,'OPENAI_REVIEW_NOT_RELEASABLE','该记录尚未进入结果未知状态，不能解除占用');
      const released=new Date(clock()).toISOString(),result={...row,status:'uncertain',released_at:released,error_message:'已确认结果仍未知并解除占用；可能已计费，本记录不会自动重试'};
      store.queue("UPDATE matrix_openai_review_runs SET status='uncertain',released_at=?,error_message=? WHERE user_id=? AND id=? AND released_at IS NULL",released,result.error_message,owner,row.id);store.expectChange();
      store.audit(actor.actor,'openai-review.uncertain.released',row.id);
      return {actor,response:json(runView(result,clock()))};
    })).response;
  }
  if(route!=='/openai-review/runs'||method!=='POST')throw fail(404,'NOT_FOUND','接口不存在');
  if(Object.keys(input).sort().join(',')!=='mode,run_id'||!uuid.test(input.run_id)||!['full','incremental'].includes(input.mode))invalid('分析需要唯一 UUID run_id 和明确的 mode');
  const reserved=await mutate(db,async store=>{
    const actor=await ownerActor(store,request,owner,origin,true),old=await store.get('SELECT * FROM matrix_openai_review_runs WHERE user_id=? AND id=?',owner,input.run_id);
    if(old){if(old.error_code!=='OPENAI_REVIEW_CANCELLED_BEFORE_START'&&old.requested_mode!==input.mode)throw fail(409,'IDEMPOTENCY_CONFLICT','该运行标识已用于不同请求');return {replayed:true,row:old};}
    const active=await store.get("SELECT id FROM matrix_openai_review_runs WHERE user_id=? AND account=? AND status IN ('running','uncertain') AND released_at IS NULL LIMIT 1",owner,REVIEW_ACCOUNT);
    if(active)return {replayed:true,conflict:active.id};
    if(!settings.key||!settings.model)throw fail(503,'OPENAI_REVIEW_NOT_CONFIGURED','服务器尚未同时配置 OpenAI Key 和模型；未调用 API');
    const at=clock(),created=new Date(at).toISOString(),date=beijingDay(at);
    const recent=await store.get("SELECT created_at FROM matrix_openai_review_runs WHERE user_id=? AND account=? AND (error_code IS NULL OR error_code<>'OPENAI_REVIEW_CANCELLED_BEFORE_START') ORDER BY created_at DESC LIMIT 1",owner,REVIEW_ACCOUNT);
    const daily=await store.get("SELECT count(*) AS n FROM matrix_openai_review_runs WHERE user_id=? AND account=? AND beijing_date=? AND (error_code IS NULL OR error_code<>'OPENAI_REVIEW_CANCELLED_BEFORE_START')",owner,REVIEW_ACCOUNT,date);
    if(recent&&at-Date.parse(recent.created_at)<30000||daily.n>=20)throw fail(429,'OPENAI_REVIEW_RATE_LIMIT','分析间隔至少 30 秒，每个北京时间日期最多 20 次');
    const config=await configView(store,owner,settings);
    // Persist the default on first run so every successful run pins a saved version.
    const version=config.version||1,instructions=instructionsFor(config.instructions,settings.key);
    const baseline=await store.get("SELECT id,source_manifest_json,summary_json FROM matrix_openai_review_runs WHERE user_id=? AND account=? AND status='succeeded' ORDER BY completed_at DESC,id DESC LIMIT 1",owner,REVIEW_ACCOUNT);
    const source=await captureReviewSources(store,owner);
    if(!source.articles.length&&!baseline)throw fail(409,'OPENAI_REVIEW_NO_DATA','尚无 V字文章可分析，本次未调用 API');
    const built=buildReviewInput(source,baseline,input.mode);
    // Reject secret-shaped accidental evidence instead of transmitting or storing it.
    const sourceJson=JSON.stringify(source),inputJson=JSON.stringify(built.input);
    if(sourceJson.includes(settings.key)||/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}/.test(sourceJson))throw fail(409,'OPENAI_REVIEW_SOURCE_INVALID','复盘资料疑似包含凭据，请先移除后再分析');
    const revision=(await store.get('SELECT revision FROM matrix_control WHERE id=1')).revision;
    const row={user_id:owner,id:input.run_id,account:REVIEW_ACCOUNT,status:'running',mode:built.mode,requested_mode:input.mode,beijing_date:date,created_at:created,completed_at:null,model:settings.model,instruction_version:version,instructions,baseline_run_id:baseline?.id??null,source_revision:revision,source_manifest_json:JSON.stringify(built.manifest),source_data_json:sourceJson,input_json:inputJson,report_markdown:'',summary_json:null,error_code:null,error_message:null,provider_response_id:null,provider_calls:0,released_at:null};
    // D1 has a 2 MB row/string/BLOB limit. Keep combined captured input,
    // manifest and final output comfortably below it, not merely each column.
    if(bytes(row)>1536*1024)throw fail(413,'OPENAI_REVIEW_INPUT_LIMIT','运行资料超过安全存储上限，未调用 API');
    if(!config.version)store.queue('INSERT INTO matrix_openai_review_config(user_id,account,instructions,version,updated_at) VALUES(?,?,?,?,?)',owner,REVIEW_ACCOUNT,instructions,version,created);
    const fields=Object.keys(row);store.queue('INSERT INTO matrix_openai_review_runs('+fields.join(',')+') VALUES('+fields.map(()=>'?').join(',')+')',...fields.map(field=>row[field]));
    store.audit(actor.actor,'openai-review.started',row.id,{mode:row.mode,instruction_version:version});
    return {actor,row,source,input:built.input};
  });
  if(reserved.conflict)return Response.json({error:{code:'OPENAI_REVIEW_IN_FLIGHT',message:'已有运行尚未结束或结果未知，请先查看已有记录',run_id:reserved.conflict}},{status:409,headers:{'Cache-Control':'no-store'}});
  if(reserved.replayed)return json(runView(reserved.row,clock()),reserved.row.status==='running'?202:200);
  const row=reserved.row;
  let output;
  try {
    output=await runReviewProvider({key:settings.key,model:row.model,instructions:row.instructions,input:reserved.input,request:providerRequest,
      beforeCall:()=>mutate(db,async store=>{
        const active=await store.get('SELECT status,provider_calls,released_at FROM matrix_openai_review_runs WHERE user_id=? AND id=?',owner,row.id);
        if(active?.status!=='running'||active.released_at)throw fail(409,'OPENAI_REVIEW_CLAIM_CHANGED','运行状态已改变，不再调用 API');
        store.queue("UPDATE matrix_openai_review_runs SET provider_calls=provider_calls+1 WHERE user_id=? AND id=? AND status='running' AND released_at IS NULL",owner,row.id);store.expectChange();return {};
      }),
      lookup:async args=>{
        let previous=[],capture=reserved.source;
        if(args?.kind==='runs'&&args.source_run_id!==null)return {error:'Report search uses source_run_id null'};
        if(args?.source_run_id!==null) {
          if(typeof args?.source_run_id!=='string'||!uuid.test(args.source_run_id))return {error:'Invalid historical capture ID'};
          const historical=await consistentRead(db,store=>store.get("SELECT source_data_json FROM matrix_openai_review_runs WHERE user_id=? AND account=? AND id=? AND status='succeeded' AND completed_at<=?",owner,REVIEW_ACCOUNT,args.source_run_id,row.created_at));
          if(!historical)return {error:'Historical capture not available in this owner/account scope'};
          capture=JSON.parse(historical.source_data_json);
        }
        if(args?.kind==='runs'&&Array.isArray(args.ids)&&args.ids.length<=5&&args.ids.every(id=>typeof id==='string'&&uuid.test(id))&&typeof args.query==='string'&&args.query.length<=120)previous=await consistentRead(db,store=>store.all("SELECT id,report_markdown,created_at,completed_at FROM matrix_openai_review_runs WHERE user_id=? AND account=? AND status='succeeded' AND completed_at<=? AND (?='[]' OR id IN (SELECT value FROM json_each(?))) AND (?='' OR instr(lower(report_markdown),lower(?))>0) ORDER BY completed_at DESC,id DESC LIMIT 6",owner,REVIEW_ACCOUNT,row.created_at,JSON.stringify(args.ids),JSON.stringify(args.ids),args.query.trim(),args.query.trim()));
        return evidenceFromCapture(capture,previous,args);
      }});
  } catch(error) {
    const code=Object.hasOwn(failureMessages,error.reviewCode)?error.reviewCode:'OPENAI_REVIEW_PROVIDER_UNKNOWN',uncertain=error.uncertain!==false;
    const done=await finish(db,owner,row.id,{status:uncertain?'uncertain':'failed',completed_at:new Date(clock()).toISOString(),error_code:code,error_message:failureMessages[code]});
    return json(runView(done.row,clock()));
  }
  const saved=await finish(db,owner,row.id,{status:'succeeded',completed_at:new Date(clock()).toISOString(),report_markdown:output.report_markdown,summary_json:JSON.stringify({cumulative_summary:output.cumulative_summary,pending_verification:output.pending_verification}),provider_response_id:output.provider_response_id});
  return json(runView(saved.row,clock()),201);
}
