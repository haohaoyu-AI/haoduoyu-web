import {delegateEditorialV3FailedWriterHttpOnce,hasEditorialFailedWriterContinuation,hasEditorialFailedWriterHttpDelegation,readEditorialV3FailedWriterHttpStage,probeEditorialV3FailedWriterHttpStage,executeEditorialV3FailedWriterHttpStage,preflightEditorialV3FailedWriterHttpStage,editorialFailedWriterHttpPublicError} from './editorial-failed-writer-http-v3';
import {delegateEditorialV3RevisionHttpOnce,hasEditorialRevisionHttpDelegation,readEditorialV3RevisionHttpStage,probeEditorialV3RevisionHttpStage,executeEditorialV3RevisionHttpStage,editorialRevisionHttpPublicError} from './editorial-revision-http-v3';
import {delegateEditorialV3DailyHttpOnce,isEditorialDailyRun,hasEditorialDailyHttpDelegation,readEditorialV3DailyHttpStage,probeEditorialV3DailyHttpStage,preflightEditorialV3DailyHttpStage,executeEditorialV3DailyHttpStage,editorialDailyHttpPublicError} from './editorial-daily-http-v3';
import {db} from './test-store';
import {hashText} from './writing-input';
import {prepareEditorialV3Stage,executeEditorialV3Stage} from './editorial-v3-runtime';
import {editorialBodyContinuationScope,editorialBodyContinuationTarget} from './editorial-body-continuation';
import {editorialReceiptDiagnostics} from './editorial-receipt-diagnostics';
import {numericCredentialSafeUsage} from './credential-boundary';
import {editorialCredentialHit} from './editorial-credential-boundary';

/** Deliberate release gate. Change only after the real 330-second private-Site
 * zero-provider cloud HTTP probe succeeds. No request/header/env can enable it. */
export const editorialCloudHttpPaidEnabled = true;
export const editorialCloudHttpTransport = 'cloud_http_once' as const;
export const editorialCloudHttpPath = '/api/editorial-v3-cloud';
export const editorialCloudHttpProbeMilliseconds = 330_000;
const errors={invalid:'云正文单阶段参数无效',denied:'云正文单阶段委托未获允许',binding:'云正文单阶段冻结绑定不一致',stopped:'云正文单阶段授权已停止或过期',disabled:'云正文付费执行尚未开放，仅可零调用探针或只读对账',unknown:'云正文结果待对账，只读同一阶段，不重复请求'} as const;
export function editorialCloudHttpPublicError(error:unknown){const revisionError=editorialRevisionHttpPublicError(error),failedError=editorialFailedWriterHttpPublicError(error),dailyError=editorialDailyHttpPublicError(error);return error instanceof Error&&(Object.values(errors).some(v=>v===error.message)||error.message===revisionError||error.message===failedError||error.message===dailyError)?error.message:errors.unknown;}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(v);
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error(errors.invalid);return v as Record<string,unknown>;};
function parse(raw:string){try{return object(JSON.parse(raw));}catch{throw Error(errors.binding);}}
function keys(value:unknown,allowed:string[]){const v=object(value);if(Object.keys(v).some(k=>!allowed.includes(k))||allowed.some(k=>!(k in v)))throw Error(errors.invalid);return v;}
function credentials(value:unknown){const v=keys(value,['stage_id','token']);if(!uuid(v.stage_id)||!uuid(v.token))throw Error(errors.invalid);return v as {stage_id:string;token:string};}
type Row=Record<string,unknown>;
type Delegation={stage_id:string;owner:string;run_id:string;continuation_id:string;transport:string;token_sha256:string;frozen_json:string;frozen_sha256:string;expires:string;state:'delegated'|'started';created:string;started:string|null};
type Bound={d:Delegation;f:Record<string,unknown>;run:Row;step:Row;c:Row;receipt:Row|null};
const receiptId=(owner:string,run:string,stage:string)=>`editorial_v3:${owner}:${run}:${stage}`;
async function rows(owner:string,stage:string){
 const step=await db().prepare('SELECT * FROM editorial_stages_v3 WHERE owner=? AND id=?').bind(owner,stage).first<Row>();
 if(!step)throw Error(errors.denied);
 const run=await db().prepare('SELECT * FROM editorial_runs_v3 WHERE owner=? AND id=?').bind(owner,step.run_id).first<Row>();
 const c=await db().prepare('SELECT * FROM editorial_body_continuations_v3 WHERE owner=? AND new_stage_id=?').bind(owner,stage).first<Row>();
 if(!run||!c)throw Error(errors.denied);
 const receipt=await db().prepare('SELECT state,response FROM claude_attempts WHERE owner=? AND id=?').bind(owner,receiptId(owner,String(run.id),stage)).first<Row>();
 return {run,step,c,receipt};
}
async function originalBinding(owner:string,run:Row,step:Row,c:Row,token:string){
 const input=parse(String(step.input_json)),snapshot=parse(String(run.snapshot_json)),frozen=parse(String(c.frozen_json));
 if(run.owner!==owner||step.owner!==owner||c.owner!==owner||run.id!==editorialBodyContinuationTarget.run_id||c.run_id!==run.id||step.run_id!==run.id||c.failed_stage_id!==editorialBodyContinuationTarget.failed_stage_id||step.id===c.failed_stage_id||c.new_stage_id!==step.id||step.stage!=='body'||c.scope!==editorialBodyContinuationScope||c.state!=='allocated'||!['claude','claude_provider'].includes(String(run.writer))||run.initialized!==1||c.expires!==run.expires||step.token!==token||!uuid(token))throw Error(errors.denied);
 if(await hashText(String(step.input_json))!==step.input_sha256||await hashText(String(run.snapshot_json))!==run.snapshot_sha256||await hashText(String(run.input_json))!==run.input_sha256||await hashText(String(c.frozen_json))!==c.frozen_sha256||await hashText(String(c.request_json))!==c.request_sha256||await hashText(String(c.evidence_json))!==c.evidence_sha256||await hashText(token)!==c.new_token_sha256||c.new_input_sha256!==step.input_sha256||frozen.owner!==owner||frozen.scope!==c.scope||frozen.new_stage_id!==step.id||frozen.new_input_json!==step.input_json||frozen.new_input_sha256!==step.input_sha256||frozen.new_token_sha256!==c.new_token_sha256||frozen.snapshot_sha256!==run.snapshot_sha256||frozen.model!==input.model||frozen.new_round!==step.round||frozen.new_sequence!==step.sequence||frozen.explicit_owner_retry_lineage!==true||frozen.additional_body_attempt_limit!==1||input.contract_version!==3||input.run_id!==run.id||input.stage_id!==step.id||input.stage!=='body'||input.round!==step.round||input.sequence!==step.sequence||input.snapshot_sha256!==run.snapshot_sha256||input.model!==snapshot.model||input.writer_kind!=='claude_provider')throw Error(errors.binding);
 return {input,snapshot};
}
function frozenBinding(owner:string,run:Row,step:Row,c:Row,tokenHash:string,input:Row){return {contract_version:1,transport:editorialCloudHttpTransport,owner,run_id:run.id,authority_id:run.authority_id,stage_id:step.id,stage:'body',round:step.round,sequence:step.sequence,token_sha256:tokenHash,run_input_json:run.input_json,run_input_sha256:run.input_sha256,input_json:step.input_json,input_sha256:step.input_sha256,snapshot_json:run.snapshot_json,snapshot_sha256:run.snapshot_sha256,model:input.model,continuation_id:c.id,continuation_json:JSON.stringify(c),expires:run.expires};}
async function bound(value:unknown,historicalOwner?:string):Promise<Bound>{
 const v=credentials(value),d=await db().prepare('SELECT * FROM editorial_cloud_delegations_v3 WHERE stage_id=?').bind(v.stage_id).first<Delegation>();
 if(!d||d.transport!==editorialCloudHttpTransport||await hashText(v.token)!==d.token_sha256||historicalOwner!==undefined&&historicalOwner!==d.owner)throw Error(errors.denied);
 if(await hashText(d.frozen_json)!==d.frozen_sha256)throw Error(errors.binding);
 // The stage nonce is never a permanent read credential. Only the normal
 // authenticated-owner delegate replay can bypass these capability gates.
 if(historicalOwner===undefined){
  if(!Number.isFinite(Date.parse(d.expires))||Date.parse(d.expires)<=Date.now())throw Error(errors.stopped);
  const authority=await db().prepare('SELECT state FROM editorial_authority_v3 WHERE owner=? AND id=?').bind(d.owner,parse(d.frozen_json).authority_id).first<Row>();
  if(authority?.state!=='active')throw Error(errors.stopped);
 }
 const f=parse(d.frozen_json),{run,step,c,receipt}=await rows(d.owner,d.stage_id),{input}=await originalBinding(d.owner,run,step,c,v.token);
 if(JSON.stringify(frozenBinding(d.owner,run,step,c,d.token_sha256,input))!==d.frozen_json||d.run_id!==run.id||d.continuation_id!==c.id||d.expires!==run.expires||f.token_sha256!==d.token_sha256)throw Error(errors.binding);
 return {d,f,run,step,c,receipt};
}
async function live(b:Bound){
 if(!Number.isFinite(Date.parse(b.d.expires))||Date.parse(b.d.expires)<=Date.now())throw Error(errors.stopped);
 const a=await db().prepare('SELECT state FROM editorial_authority_v3 WHERE owner=? AND id=?').bind(b.d.owner,b.run.authority_id).first<Row>();
 const control=await db().prepare("SELECT state FROM workflow_controls WHERE owner=? AND scope='editorial_v3' AND run_id=?").bind(b.d.owner,b.d.run_id).first<Row>();
 if(a?.state!=='active'||['paused','archived'].includes(String(control?.state))||b.run.state!=='body'||b.run.round!==b.step.round)throw Error(errors.stopped);
}
function descriptor(d:Delegation,created:boolean){return {created,read_only:!created,stage_id:d.stage_id,transport:editorialCloudHttpTransport,path:editorialCloudHttpPath,expires:d.expires,paid_execution_enabled:editorialCloudHttpPaidEnabled,automatic_paid_retry:false,probe_seconds:330};}
/** Call only from the normal dispatch-authenticated owner MCP. Never derive
 * owner from serviceaccess, body fields, nonce, or a caller-defined header.
 * This allocates no stage/provider attempt and returns no bearer credential. */
export async function delegateEditorialV3CloudHttpOnce(owner:string,value:unknown){
 if(typeof owner!=='string'||!owner.trim()||owner.length>500)throw Error(errors.denied);
 const v=keys(value,['run_id','stage_id','token','transport','confirm']);
 if(v.confirm!==true||v.transport!==editorialCloudHttpTransport||!uuid(v.run_id)||!uuid(v.stage_id)||!uuid(v.token))throw Error(errors.denied);
 if(await hasEditorialFailedWriterContinuation(owner,v.stage_id))return delegateEditorialV3FailedWriterHttpOnce(owner,v,editorialCloudHttpPaidEnabled);
 if(await isEditorialDailyRun(owner,v.run_id))return delegateEditorialV3DailyHttpOnce(owner,v,editorialCloudHttpPaidEnabled);
 if(v.run_id!==editorialBodyContinuationTarget.run_id)throw Error(errors.denied);
 const kind=await db().prepare('SELECT stage FROM editorial_stages_v3 WHERE owner=? AND id=?').bind(owner,v.stage_id).first<Row>();
 if(kind?.stage==='structure_revision'||kind?.stage==='fact_revision')return delegateEditorialV3RevisionHttpOnce(owner,v,editorialCloudHttpPaidEnabled);
 const current=await rows(owner,v.stage_id),{run,step,c,receipt}=current,{input}=await originalBinding(owner,run,step,c,v.token);
 // Exact replays are historical reads, even if already used/stopped/expired.
 const prior=await db().prepare('SELECT * FROM editorial_cloud_delegations_v3 WHERE stage_id=?').bind(v.stage_id).first<Delegation>();
 if(prior){const b=await bound({stage_id:v.stage_id,token:v.token},owner);if(b.d.owner!==owner)throw Error(errors.denied);return descriptor(b.d,false);}
 if(receipt||step.state!=='claimed'||step.receipt_id!==null||step.artifact_json!==null||step.artifact_sha256!==null||run.state!=='body'||run.round!==step.round)throw Error(errors.denied);
 // Reuse the strict runtime's lineage, authority, model/capability validation.
 const prepared=await prepareEditorialV3Stage(owner,{run_id:run.id,stage_id:step.id,token:v.token,expected_model:input.model,expected_input_sha256:step.input_sha256,confirm:true});
 if(prepared.step.id!==step.id||prepared.step.input_json!==step.input_json||prepared.loaded.row.snapshot_json!==run.snapshot_json)throw Error(errors.binding);
 const tokenHash=await hashText(v.token),raw=JSON.stringify(frozenBinding(owner,run,step,c,tokenHash,input)),time=new Date().toISOString();
 const inserted=await db().prepare(`INSERT OR IGNORE INTO editorial_cloud_delegations_v3(stage_id,owner,run_id,continuation_id,transport,token_sha256,frozen_json,frozen_sha256,expires,state,created) SELECT ?,?,?,?,?,?,?,?,?,'delegated',? WHERE EXISTS(SELECT 1 FROM editorial_runs_v3 r JOIN editorial_stages_v3 s ON s.run_id=r.id AND s.owner=r.owner JOIN editorial_body_continuations_v3 c ON c.owner=s.owner AND c.new_stage_id=s.id JOIN editorial_authority_v3 a ON a.id=r.authority_id AND a.owner=r.owner WHERE r.id=? AND r.owner=? AND r.state='body' AND r.round=s.round AND r.expires>? AND r.expires=? AND r.input_json=? AND r.input_sha256=? AND r.snapshot_json=? AND r.snapshot_sha256=? AND s.id=? AND s.stage='body' AND s.state='claimed' AND s.round=? AND s.sequence=? AND s.token=? AND s.input_json=? AND s.input_sha256=? AND s.receipt_id IS NULL AND s.artifact_json IS NULL AND s.artifact_sha256 IS NULL AND c.id=? AND c.state='allocated' AND c.frozen_json=? AND c.frozen_sha256=? AND c.request_json=? AND c.evidence_json=? AND a.state='active' AND NOT EXISTS(SELECT 1 FROM workflow_controls w WHERE w.owner=r.owner AND w.scope='editorial_v3' AND w.run_id=r.id AND w.state IN ('paused','archived')) AND NOT EXISTS(SELECT 1 FROM claude_attempts x WHERE x.id=? AND x.owner=r.owner))`).bind(step.id,owner,run.id,c.id,editorialCloudHttpTransport,tokenHash,raw,await hashText(raw),run.expires,time,run.id,owner,time,run.expires,run.input_json,run.input_sha256,run.snapshot_json,run.snapshot_sha256,step.id,step.round,step.sequence,v.token,step.input_json,step.input_sha256,c.id,c.frozen_json,c.frozen_sha256,c.request_json,c.evidence_json,receiptId(owner,String(run.id),String(step.id))).run();
 const after=await bound({stage_id:v.stage_id,token:v.token});if(after.d.owner!==owner)throw Error(errors.binding);return descriptor(after.d,inserted.meta.changes===1);
}
const stepStates=new Set(['claimed','requested','completed','technical_failed','content_invalid','unknown']);
async function projection(b:Bound){
 const authority=await db().prepare('SELECT state FROM editorial_authority_v3 WHERE owner=? AND id=?').bind(b.d.owner,b.run.authority_id).first<Row>();
 const control=await db().prepare("SELECT state FROM workflow_controls WHERE owner=? AND scope='editorial_v3' AND run_id=?").bind(b.d.owner,b.d.run_id).first<Row>();
 const rowState=stepStates.has(String(b.step.state))?String(b.step.state):'unknown';
 const authorityState=['active','revoked','cancelled'].includes(String(authority?.state))?String(authority?.state):'unknown';
 if(authorityState!=='active'||!Number.isFinite(Date.parse(b.d.expires))||Date.parse(b.d.expires)<=Date.now())throw Error(errors.stopped);
 const controlState=['paused','archived'].includes(String(control?.state))?String(control?.state):'active';
 const state=authorityState!=='active'?(authorityState==='revoked'?'authority_revoked':'authority_cancelled'):controlState!=='active'?controlState:Date.parse(b.d.expires)<=Date.now()?'expired':['paused','archived','cancelled','unknown','dispatch_unknown'].includes(String(b.run.state))?String(b.run.state):rowState;
 const tokens=(await db().prepare('SELECT token FROM editorial_stages_v3 WHERE owner=?').bind(b.d.owner).all<{token:string}>()).results.map(row=>row.token);
 let packet:Record<string,unknown>={},identity=false,suppressed=false;
 if(b.receipt){try{packet=parse(String(b.receipt.response));identity=packet.stage==='body'&&packet.stage_id===b.d.stage_id&&packet.input_sha256===b.step.input_sha256&&packet.snapshot_sha256===b.run.snapshot_sha256&&packet.state===b.receipt.state&&packet.requested_model===b.f.model&&b.step.receipt_id===receiptId(b.d.owner,b.d.run_id,b.d.stage_id);suppressed=await editorialCredentialHit(b.d.owner,packet,tokens);}catch{suppressed=true;}}
 const diagnostic=editorialReceiptDiagnostics(identity?packet:{},suppressed);
 const result={stage_id:b.d.stage_id,stage:'body',state,row_state:rowState,authority_state:authorityState,control_state:controlState,delegation_state:b.d.state,receipt_state:b.receipt&&['requested','completed','failed'].includes(String(b.receipt.state))?b.receipt.state:null,binding_status:identity?'bound_to_stage_input':'unconfirmed',...diagnostic,usage:identity&&!suppressed?numericCredentialSafeUsage(packet.usage):null,read_only:true,automatic_paid_retry:false,paid_execution_enabled:editorialCloudHttpPaidEnabled};
 if(await editorialCredentialHit(b.d.owner,result,tokens))return {...result,diagnostic:null,requested_model:null,returned_model:null,usage:null,response_suppressed:true};
 return result;
}
/** Same-stage reconciliation before original expiry/authority revocation never
 * prepares, recovers, writes, or starts work. Historical reads use owner MCP.
 * No snapshot, whole-run tree, author text, artifacts, or current_version. */
async function revisionDelegated(value:unknown){const v=credentials(value);const body=await db().prepare('SELECT stage_id FROM editorial_cloud_delegations_v3 WHERE stage_id=?').bind(v.stage_id).first();return !body&&await hasEditorialRevisionHttpDelegation(v.stage_id);}
/** Read-only diagnostic for an existing owner-delegated linked writer stage; other transports are not broadened. */
export async function preflightEditorialV3CloudStage(value:unknown,signal?:AbortSignal){const v=credentials(value);if(await hasEditorialDailyHttpDelegation(v.stage_id))return preflightEditorialV3DailyHttpStage(v,editorialCloudHttpPaidEnabled,signal);if(!await hasEditorialFailedWriterHttpDelegation(v.stage_id))throw Error(errors.denied);return preflightEditorialV3FailedWriterHttpStage(v,editorialCloudHttpPaidEnabled,signal);}
export async function readEditorialV3CloudStage(value:unknown){const v=credentials(value);if(await hasEditorialDailyHttpDelegation(v.stage_id))return readEditorialV3DailyHttpStage(v,editorialCloudHttpPaidEnabled);if(await hasEditorialFailedWriterHttpDelegation(v.stage_id))return readEditorialV3FailedWriterHttpStage(v,editorialCloudHttpPaidEnabled);if(await revisionDelegated(v))return readEditorialV3RevisionHttpStage(v,editorialCloudHttpPaidEnabled);return projection(await bound(v));}
/** A zero-provider probe on the very same private endpoint and stage delegation.
 * A timer only: no prepare, provider, reservation, or business DB write. */
export async function probeEditorialV3CloudStage(value:unknown,signal?:AbortSignal){
 const v=credentials(value);if(await hasEditorialDailyHttpDelegation(v.stage_id))return probeEditorialV3DailyHttpStage(v,signal);if(await hasEditorialFailedWriterHttpDelegation(v.stage_id))return probeEditorialV3FailedWriterHttpStage(v,signal);
 if(await revisionDelegated(value))return probeEditorialV3RevisionHttpStage(value,signal);
 const b=await bound(value);await live(b);
 if(Date.parse(b.d.expires)-Date.now()<editorialCloudHttpProbeMilliseconds||signal?.aborted)throw Error(errors.stopped);
 const start=Date.now();
 await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(Error(errors.stopped));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},editorialCloudHttpProbeMilliseconds);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();});
 await bound(value); // No successful capability response after expiry/revocation.
 return {stage_id:b.d.stage_id,transport:editorialCloudHttpTransport,probe:true,state:'completed',elapsed_ms:Math.max(0,Date.now()-start),target_ms:editorialCloudHttpProbeMilliseconds,model_request_sent:false,reservation_consumed:false,read_only:true};
}
/** A lost response or any started/unknown/inflight state cannot be paid again.
 * Nonce readback remains available only before original expiry/revocation.
 * The existing runtime retains its own durable attempt uniqueness. */
export async function executeEditorialV3CloudStage(value:unknown,signal?:AbortSignal){
 const requestLive=()=>{if(signal?.aborted)throw Error(errors.stopped);};requestLive();const checked=credentials(value),daily=await hasEditorialDailyHttpDelegation(checked.stage_id);requestLive();if(daily)return executeEditorialV3DailyHttpStage(checked,editorialCloudHttpPaidEnabled,signal);const failed=await hasEditorialFailedWriterHttpDelegation(checked.stage_id);requestLive();if(failed)return executeEditorialV3FailedWriterHttpStage(checked,editorialCloudHttpPaidEnabled,signal);const revision=await revisionDelegated(value);requestLive();if(revision)return executeEditorialV3RevisionHttpStage(value,editorialCloudHttpPaidEnabled,signal);
 const v=credentials(value),b=await bound(v);requestLive();
 if(b.d.state==='started'||b.receipt||b.step.state!=='claimed')return projection(b);
 if(!editorialCloudHttpPaidEnabled)return {...await projection(b),blocked:true,error:errors.disabled};
 await live(b);requestLive();
 const prepared=await prepareEditorialV3Stage(b.d.owner,{run_id:b.d.run_id,stage_id:b.d.stage_id,token:v.token,expected_model:b.f.model,expected_input_sha256:b.f.input_sha256,confirm:true});
 requestLive();
 // Durable consumption precedes execution. It is intentionally never reset,
 // including a failure before the provider call or a disconnected caller.
 // The request signal is forwarded to the continuation-aware runtime; no
 // waitUntil/background execution is created by this transport.
 requestLive();const time=new Date().toISOString(),changed=await db().prepare(`UPDATE editorial_cloud_delegations_v3 SET state='started',started=? WHERE stage_id=? AND owner=? AND state='delegated' AND frozen_json=? AND frozen_sha256=? AND expires>? AND EXISTS(SELECT 1 FROM editorial_runs_v3 r JOIN editorial_stages_v3 s ON s.run_id=r.id AND s.owner=r.owner JOIN editorial_authority_v3 a ON a.id=r.authority_id AND a.owner=r.owner JOIN editorial_body_continuations_v3 c ON c.new_stage_id=s.id AND c.owner=s.owner WHERE r.id=editorial_cloud_delegations_v3.run_id AND r.owner=editorial_cloud_delegations_v3.owner AND r.state='body' AND r.round=s.round AND r.expires=editorial_cloud_delegations_v3.expires AND r.input_json=? AND r.input_sha256=? AND r.snapshot_json=? AND r.snapshot_sha256=? AND s.id=editorial_cloud_delegations_v3.stage_id AND s.stage='body' AND s.state='claimed' AND s.round=? AND s.sequence=? AND s.token=? AND s.input_json=? AND s.input_sha256=? AND s.receipt_id IS NULL AND s.artifact_json IS NULL AND s.artifact_sha256 IS NULL AND c.id=editorial_cloud_delegations_v3.continuation_id AND c.state='allocated' AND c.scope=? AND c.failed_stage_id=? AND c.frozen_json=? AND c.frozen_sha256=? AND c.request_json=? AND c.request_sha256=? AND c.evidence_json=? AND c.evidence_sha256=? AND c.new_token_sha256=? AND c.new_input_sha256=? AND c.expires=? AND a.state='active' AND NOT EXISTS(SELECT 1 FROM workflow_controls w WHERE w.owner=r.owner AND w.scope='editorial_v3' AND w.run_id=r.id AND w.state IN ('paused','archived')) AND NOT EXISTS(SELECT 1 FROM claude_attempts x WHERE x.id=? AND x.owner=r.owner))`).bind(time,b.d.stage_id,b.d.owner,b.d.frozen_json,b.d.frozen_sha256,time,b.f.run_input_json,b.f.run_input_sha256,b.f.snapshot_json,b.f.snapshot_sha256,b.f.round,b.f.sequence,v.token,b.f.input_json,b.f.input_sha256,b.c.scope,b.c.failed_stage_id,b.c.frozen_json,b.c.frozen_sha256,b.c.request_json,b.c.request_sha256,b.c.evidence_json,b.c.evidence_sha256,b.c.new_token_sha256,b.c.new_input_sha256,b.c.expires,receiptId(b.d.owner,b.d.run_id,b.d.stage_id)).run();
 if(!changed.meta.changes)return readEditorialV3CloudStage(v);requestLive();
 try{const execution=await executeEditorialV3Stage(prepared,{signal});if('storage_pending' in execution&&execution.storage_pending===true)return {...await readEditorialV3CloudStage(v),state:'unknown',storage_pending:true,execution_diagnostic:execution.diagnostic};}catch{
  const diagnostic={stage:'execution_unconfirmed',code:signal?.aborted?'request_cancelled':'execution_error'};console.error(JSON.stringify({component:'editorial-v3-cloud',stage_id:b.d.stage_id,...diagnostic}));return {...await readEditorialV3CloudStage(v),state:'unknown',execution_diagnostic:diagnostic};
 }
 return readEditorialV3CloudStage(v);
}

/** The parent connects this short tool to its existing authenticated-owner MCP.
 * No paid execution or long timer occurs in the MCP tool call. */
export const editorialCloudHttpTools=[{
 name:'delegate_editorial_v3_cloud_http_once',
 description:'仅正常 authenticated owner 明确 confirm 且 transport=cloud_http_once 后，将原有效authority下当前claimed普通daily主笔阶段outline/outline_revision/body/必要structure_revision/fact_revision委托给私有Site长HTTP。普通daily使用独立委托表，冻结完整run/stage/authority及前序独审报告和作者回执；消费前完整CAS，沿用原期限、输入、模型与runtime单reservation，不分配新stage、不返回新token、不付费、不扩大授权。旧固定body/revision及独立failed-writer例外各自保留原scope和限制，不能转成普通daily重试。未知/失败/在飞/已完成仅同stage只读对账，禁止再次provider请求。零provider长HTTP探针用于验收，不制造已验证结论。',
 inputSchema:{type:'object',properties:{run_id:{type:'string',format:'uuid'},stage_id:{type:'string'},token:{type:'string'},transport:{type:'string',enum:[editorialCloudHttpTransport]},confirm:{type:'boolean',enum:[true]}},required:['run_id','stage_id','token','transport','confirm'],additionalProperties:false},
 annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
}];
