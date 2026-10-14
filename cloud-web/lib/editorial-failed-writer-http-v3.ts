import {tagEditorialCloudExecutionFailure,type EditorialCloudExecutionPhase,type EditorialCloudConsumption} from './editorial-cloud-execution-diagnostics-v3';
import {db} from './test-store';
import {hashText} from './writing-input';
import {prepareEditorialV3Stage,executeEditorialV3Stage,loadEditorialV3FailedWriterPlan,verifyEditorialV3FailedWriterStageLineage} from './editorial-v3-runtime';
import {editorialFailedWriterContinuationScope,editorialFailedWriterContinuationSqlFence,editorialFailedWriterSourceDelegationSqlFence,type FailedWriterContinuationPlan} from './editorial-failed-writer-continuation-v3';
import {editorialReceiptDiagnostics} from './editorial-receipt-diagnostics';
import {numericCredentialSafeUsage} from './credential-boundary';
import {editorialCredentialHit} from './editorial-credential-boundary';

/** Only a separately owner-authorized failed-writer or invalid-output repair may receive
 * this new one-stage transport. No old body/revision capability is renewed. */
const transport='cloud_http_once',path='/api/editorial-v3-cloud',probeMilliseconds=330000;
const errors={invalid:'失败主笔云委托参数无效',denied:'失败主笔云委托未获允许',binding:'失败主笔云委托冻结绑定不一致',stopped:'失败主笔云委托已停止或过期',unknown:'失败主笔调用结果待对账，只读同一阶段，不重复请求'} as const;
export function editorialFailedWriterHttpPublicError(error:unknown){return error instanceof Error&&Object.values(errors).some(message=>message===error.message)?error.message:errors.unknown;}
type Row=Record<string,unknown>;
type Delegation={stage_id:string;owner:string;run_id:string;continuation_id:string;stage_kind:string;current_round:number;transport:string;token_sha256:string;frozen_json:string;frozen_sha256:string;expires:string;state:'delegated'|'started';created:string;started:string|null};
type Current={plan:FailedWriterContinuationPlan;run:Row;step:Row;authority:Row;grant:Row;source:Row;sourceReceipt:Row;receipt:Row|null;input:Row};
type Bound=Current&{d:Delegation};
const runColumns=['id','owner','authority_id','request_key','run_kind','day','writer','test_intent_key','input_json','input_sha256','snapshot_json','snapshot_sha256','state','round','initialized','article_id','final_sha256','error','expires','created','updated'];
const stageColumns=['id','owner','run_id','stage','round','sequence','token','input_json','input_sha256','state','artifact_json','artifact_sha256','actor_id','execution_id','model','provenance','receipt_id','error','created','updated'];
const authorityColumns=['id','owner','authorization_key','scope','state','start_day','evidence_json','evidence_sha256','frozen_bindings_json','frozen_bindings_sha256','policy_json','created','updated'];
const grantColumns=['id','owner','authorization_key','run_id','source_stage_id','stage_kind','scope','state','request_json','request_sha256','evidence_json','evidence_sha256','frozen_json','frozen_sha256','old_receipt_id','old_receipt_sha256','old_delegation_sha256','new_stage_id','new_input_sha256','new_token_sha256','expires','created'];
const receiptColumns=['id','owner','day','state','response','created'];
const delegationColumns=['stage_id','owner','run_id','continuation_id','stage_kind','current_round','transport','token_sha256','frozen_json','frozen_sha256','expires','state','created','started'];
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(value);
function object(value:unknown):Row{if(!value||typeof value!=='object'||Array.isArray(value))throw Error(errors.invalid);return value as Row;}
function parse(value:unknown){try{if(typeof value!=='string')throw Error();return object(JSON.parse(value));}catch{throw Error(errors.binding);}}
function keys(value:unknown,allowed:string[]){const v=object(value);if(Object.keys(v).some(key=>!allowed.includes(key))||allowed.some(key=>!(key in v)))throw Error(errors.invalid);return v;}
function credentials(value:unknown){const v=keys(value,['stage_id','token']);if(!uuid(v.stage_id)||!uuid(v.token))throw Error(errors.invalid);return v as {stage_id:string;token:string};}
const receiptId=(owner:string,run:string,stage:string)=>`editorial_v3:${owner}:${run}:${stage}`;
function selected(row:Row,columns:string[]){return Object.fromEntries(columns.map(key=>[key,row[key]??null]));}
function balancedAnd(parts:string[]):string{if(!parts.length)throw Error(errors.binding);if(parts.length===1)return parts[0];const middle=Math.floor(parts.length/2);return `(${balancedAnd(parts.slice(0,middle))} AND ${balancedAnd(parts.slice(middle))})`;}
function rowFence(alias:string,row:Row,columns:string[],bindings:unknown[]){bindings.push(JSON.stringify(columns.map(key=>row[key]??null)));const frozen=alias+'_fence';return `EXISTS(SELECT 1 FROM (SELECT ? AS frozen_row) ${frozen} WHERE ${balancedAnd(columns.map((key,index)=>`${alias}.${key} IS json_extract(${frozen}.frozen_row,'$[${index}]')`))})`;}
async function tokens(owner:string){return (await db().prepare('SELECT token FROM editorial_stages_v3 WHERE owner=?').bind(owner).all<{token:string}>()).results.map(row=>row.token);}

export async function hasEditorialFailedWriterContinuation(owner:string,stage:string){return Boolean(await db().prepare('SELECT new_stage_id FROM editorial_failed_writer_continuations_v3 WHERE owner=? AND new_stage_id=?').bind(owner,stage).first());}
export async function hasEditorialFailedWriterHttpDelegation(stage:string){return Boolean(await db().prepare('SELECT stage_id FROM editorial_failed_writer_cloud_delegations_v3 WHERE stage_id=?').bind(stage).first());}
async function current(owner:string,stage:string,token:string):Promise<Current>{
 const grant=await db().prepare('SELECT * FROM editorial_failed_writer_continuations_v3 WHERE owner=? AND new_stage_id=?').bind(owner,stage).first<Row>();if(!grant||grant.scope!==editorialFailedWriterContinuationScope||grant.state!=='allocated')throw Error(errors.denied);
 const plan=await loadEditorialV3FailedWriterPlan(owner,String(grant.run_id)) as unknown as FailedWriterContinuationPlan;
 const step=plan.steps.find(row=>row.id===stage),source=plan.steps.find(row=>row.id===grant.source_stage_id);if(!step||!source||step.token!==token||await hashText(token)!==grant.new_token_sha256||grant.new_input_sha256!==step.input_sha256||grant.stage_kind!==step.stage||grant.expires!==plan.row.expires)throw Error(errors.binding);
 const verified=await verifyEditorialV3FailedWriterStageLineage(owner,plan,stage,'history');if(await hashText(JSON.stringify(selected(grant,grantColumns)))!==verified.continuation_row_sha256)throw Error(errors.binding);
 const authority=await db().prepare('SELECT * FROM editorial_authority_v3 WHERE owner=? AND id=?').bind(owner,plan.row.authority_id).first<Row>();
 const sourceReceipt=await db().prepare('SELECT * FROM claude_attempts WHERE owner=? AND id=?').bind(owner,grant.old_receipt_id).first<Row>();if(!authority||!sourceReceipt)throw Error(errors.binding);
 const receipt=await db().prepare('SELECT * FROM claude_attempts WHERE owner=? AND id=?').bind(owner,receiptId(owner,plan.row.id,stage)).first<Row>();
 return {plan,run:plan.row as unknown as Row,step:step as unknown as Row,authority,grant,source:source as unknown as Row,sourceReceipt,receipt,input:parse(step.input_json)};
}
async function frozenBinding(c:Current,tokenHash:string){const repair=parse(c.grant.frozen_json).output_repair;return {contract_version:1,...(repair?{recovery_kind:'invalid_output_repair',candidate_article_sha256:object(repair).candidate_article_sha256,feedback_sha256:object(repair).feedback_sha256}:{}),transport,owner:c.run.owner,run_id:c.run.id,article_id:c.run.article_id,authority_id:c.run.authority_id,continuation_id:c.grant.id,stage_id:c.step.id,stage_kind:c.step.stage,current_round:c.step.round,sequence:c.step.sequence,role:'writer',actor_id:c.input.actor_id,model:c.input.model,max_output_tokens:c.input.max_output_tokens,token_sha256:tokenHash,input_json:c.step.input_json,input_sha256:c.step.input_sha256,run_input_json:c.run.input_json,run_input_sha256:c.run.input_sha256,snapshot_json:c.run.snapshot_json,snapshot_sha256:c.run.snapshot_sha256,authority:selected(c.authority,authorityColumns.filter(key=>!['state','updated'].includes(key))),grant_sha256:await hashText(JSON.stringify(selected(c.grant,grantColumns))),expires:c.run.expires};}
async function bound(value:unknown,historicalOwner?:string):Promise<Bound>{
 const v=credentials(value),d=await db().prepare('SELECT * FROM editorial_failed_writer_cloud_delegations_v3 WHERE stage_id=?').bind(v.stage_id).first<Delegation>();
 if(!d||d.transport!==transport||await hashText(v.token)!==d.token_sha256||(historicalOwner!==undefined&&historicalOwner!==d.owner))throw Error(errors.denied);
 if(await hashText(d.frozen_json)!==d.frozen_sha256)throw Error(errors.binding);
 const c=await current(d.owner,d.stage_id,v.token);if(d.run_id!==c.run.id||d.continuation_id!==c.grant.id||d.stage_kind!==c.step.stage||d.current_round!==c.step.round||d.expires!==c.run.expires||await hashText(v.token)!==c.grant.new_token_sha256||JSON.stringify(await frozenBinding(c,d.token_sha256))!==d.frozen_json)throw Error(errors.binding);
 if(historicalOwner===undefined&&(!Number.isFinite(Date.parse(d.expires))||Date.parse(d.expires)<=Date.now()||c.authority.state!=='active'))throw Error(errors.stopped);
 return {...c,d};
}
async function live(c:Current){const control=await db().prepare("SELECT state FROM workflow_controls WHERE owner=? AND scope='editorial_v3' AND run_id=?").bind(c.run.owner,c.run.id).first<Row>();if(c.authority.state!=='active'||!Number.isFinite(Date.parse(String(c.run.expires)))||Date.parse(String(c.run.expires))<=Date.now()||['paused','archived'].includes(String(control?.state))||c.run.state!==c.step.stage||c.run.round!==c.step.round)throw Error(errors.stopped);}
async function liveFence(c:Current,bindings:unknown[],time:string){
 const terms=[rowFence('r',c.run,runColumns,bindings),rowFence('s',c.step,stageColumns,bindings),rowFence('a',c.authority,authorityColumns,bindings),rowFence('k',c.grant,grantColumns,bindings),"a.state='active'","s.state='claimed'",'r.state=s.stage','r.round=s.round','s.receipt_id IS NULL','s.artifact_json IS NULL','s.artifact_sha256 IS NULL',editorialFailedWriterContinuationSqlFence('s')];
 bindings.push(time);terms.push('r.expires>?');terms.push(`EXISTS(SELECT 1 FROM editorial_stages_v3 old WHERE ${rowFence('old',c.source,stageColumns,bindings)})`);terms.push(`EXISTS(SELECT 1 FROM claude_attempts prior WHERE ${rowFence('prior',c.sourceReceipt,receiptColumns,bindings)})`);
 terms.push("NOT EXISTS(SELECT 1 FROM workflow_controls w WHERE w.owner=r.owner AND w.scope='editorial_v3' AND w.run_id=r.id AND w.state IN ('paused','archived'))");bindings.push(receiptId(String(c.run.owner),String(c.run.id),String(c.step.id)));terms.push('NOT EXISTS(SELECT 1 FROM claude_attempts x WHERE x.owner=r.owner AND x.id=?)');
 terms.push(await editorialFailedWriterSourceDelegationSqlFence(String(c.run.owner),c.plan,c.source as unknown as FailedWriterContinuationPlan['steps'][number],c.grant,'r.owner',bindings));
 return `EXISTS(SELECT 1 FROM editorial_runs_v3 r JOIN editorial_stages_v3 s ON s.run_id=r.id AND s.owner=r.owner JOIN editorial_authority_v3 a ON a.id=r.authority_id AND a.owner=r.owner JOIN editorial_failed_writer_continuations_v3 k ON k.owner=s.owner AND k.new_stage_id=s.id WHERE ${balancedAnd(terms)})`;
}
function descriptor(d:Delegation,created:boolean,paidEnabled:boolean){const f=parse(d.frozen_json);return {...(f.recovery_kind?{recovery_kind:f.recovery_kind,candidate_article_sha256:f.candidate_article_sha256}:{}),created,read_only:!created,stage_id:d.stage_id,stage:d.stage_kind,transport,path,expires:d.expires,paid_execution_enabled:paidEnabled,automatic_paid_retry:false,probe_seconds:330};}
export async function delegateEditorialV3FailedWriterHttpOnce(owner:string,value:unknown,paidEnabled:boolean){
 if(typeof owner!=='string'||!owner.trim()||owner.length>500)throw Error(errors.denied);const v=keys(value,['run_id','stage_id','token','transport','confirm']);if(!uuid(v.run_id)||!uuid(v.stage_id)||!uuid(v.token)||v.transport!==transport||v.confirm!==true)throw Error(errors.denied);
 const prior=await db().prepare('SELECT * FROM editorial_failed_writer_cloud_delegations_v3 WHERE stage_id=?').bind(v.stage_id).first<Delegation>();if(prior)return descriptor((await bound({stage_id:v.stage_id,token:v.token},owner)).d,false,paidEnabled);
 const c=await current(owner,v.stage_id,v.token);if(c.run.id!==v.run_id||c.receipt||c.step.state!=='claimed')throw Error(errors.denied);await live(c);await verifyEditorialV3FailedWriterStageLineage(owner,c.plan,String(c.step.id),'before_new_execution');
 const prepared=await prepareEditorialV3Stage(owner,{run_id:c.run.id,stage_id:c.step.id,token:v.token,expected_model:c.input.model,expected_input_sha256:c.step.input_sha256,confirm:true});if(prepared.step.input_json!==c.step.input_json||prepared.loaded.row.snapshot_json!==c.run.snapshot_json)throw Error(errors.binding);
 const tokenHash=await hashText(v.token),raw=JSON.stringify(await frozenBinding(c,tokenHash)),time=new Date().toISOString(),bindings:unknown[]=[],fence=await liveFence(c,bindings,time);
 const inserted=await db().prepare(`INSERT OR IGNORE INTO editorial_failed_writer_cloud_delegations_v3(stage_id,owner,run_id,continuation_id,stage_kind,current_round,transport,token_sha256,frozen_json,frozen_sha256,expires,state,created) SELECT ?,?,?,?,?,?,?,?,?,?,?,'delegated',? WHERE ${fence} AND NOT EXISTS(SELECT 1 FROM editorial_cloud_delegations_v3 old WHERE old.stage_id=?) AND NOT EXISTS(SELECT 1 FROM editorial_revision_cloud_delegations_v3 old WHERE old.stage_id=?)`).bind(c.step.id,owner,c.run.id,c.grant.id,c.step.stage,c.step.round,transport,tokenHash,raw,await hashText(raw),c.run.expires,time,...bindings,c.step.id,c.step.id).run();
 const after=await bound({stage_id:v.stage_id,token:v.token});return descriptor(after.d,inserted.meta.changes===1,paidEnabled);
}
const stepStates=new Set(['claimed','requested','completed','technical_failed','content_invalid','unknown']);
async function projection(b:Bound,paidEnabled:boolean){
 if(b.authority.state!=='active'||Date.parse(b.d.expires)<=Date.now())throw Error(errors.stopped);const control=await db().prepare("SELECT state FROM workflow_controls WHERE owner=? AND scope='editorial_v3' AND run_id=?").bind(b.d.owner,b.d.run_id).first<Row>();const controlState=['paused','archived'].includes(String(control?.state))?String(control?.state):'active',rowState=stepStates.has(String(b.step.state))?String(b.step.state):'unknown';
 let packet:Row={},identity=false,suppressed=false;if(b.receipt){try{packet=parse(b.receipt.response);identity=packet.state===b.receipt.state&&packet.stage===b.step.stage&&packet.stage_id===b.step.id&&packet.input_sha256===b.step.input_sha256&&packet.snapshot_sha256===b.run.snapshot_sha256&&packet.requested_model===b.input.model&&b.step.receipt_id===receiptId(b.d.owner,b.d.run_id,b.d.stage_id);suppressed=await editorialCredentialHit(b.d.owner,packet,await tokens(b.d.owner));}catch{suppressed=true;}}
 const result={stage_id:b.d.stage_id,stage:b.d.stage_kind,state:controlState==='active'?rowState:controlState,row_state:rowState,authority_state:'active',control_state:controlState,delegation_state:b.d.state,receipt_state:b.receipt&&['requested','completed','failed'].includes(String(b.receipt.state))?b.receipt.state:null,binding_status:identity?'bound_to_stage_input':'unconfirmed',...editorialReceiptDiagnostics(identity?packet:{},suppressed),usage:identity&&!suppressed?numericCredentialSafeUsage(packet.usage):null,read_only:true,automatic_paid_retry:false,paid_execution_enabled:paidEnabled};
 if(await editorialCredentialHit(b.d.owner,result,await tokens(b.d.owner)))return {...result,diagnostic:null,requested_model:null,returned_model:null,usage:null,response_suppressed:true};return result;
}
export async function readEditorialV3FailedWriterHttpStage(value:unknown,paidEnabled:boolean){return projection(await bound(value),paidEnabled);}
export async function probeEditorialV3FailedWriterHttpStage(value:unknown,signal?:AbortSignal){const b=await bound(value);await live(b);if(Date.parse(b.d.expires)-Date.now()<probeMilliseconds||signal?.aborted)throw Error(errors.stopped);const started=Date.now();await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(Error(errors.stopped));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},probeMilliseconds);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();});await bound(value);return {stage_id:b.d.stage_id,transport,probe:true,state:'completed',elapsed_ms:Math.max(0,Date.now()-started),target_ms:probeMilliseconds,model_request_sent:false,reservation_consumed:false,read_only:true};}
/** The exact paid-write predicates can also be evaluated by a read-only SELECT.
 * Each call loads/verifies fresh; no proof or prepared state crosses requests. */
async function prepareConsumeFence(b:Bound,v:{stage_id:string;token:string},requestLive:()=>void,phase:(value:EditorialCloudExecutionPhase)=>void){
 phase('live_control');await live(b);requestLive();phase('linked_lineage');await verifyEditorialV3FailedWriterStageLineage(b.d.owner,b.plan,b.d.stage_id,'before_new_execution');requestLive();
 phase('stage_prepare');const prepared=await prepareEditorialV3Stage(b.d.owner,{run_id:b.d.run_id,stage_id:b.d.stage_id,token:v.token,expected_model:b.input.model,expected_input_sha256:b.step.input_sha256,confirm:true});requestLive();phase('prepared_binding');if(prepared.step.input_json!==b.step.input_json||prepared.loaded.row.snapshot_json!==b.run.snapshot_json)throw Error(errors.binding);
 phase('consume_fence');const time=new Date().toISOString(),bindings:unknown[]=[],dFence=rowFence('editorial_failed_writer_cloud_delegations_v3',b.d as unknown as Row,delegationColumns,bindings),fence=await liveFence(b,bindings,time);requestLive();return {prepared,time,bindings,where:balancedAnd([dFence,fence])};
}
/** Only an already delegated linked writer nonce may run these checks. This
 * performs the same live/lineage/prepare/full CAS checks as POST, without a
 * transport update, provider reservation or model request. */
export async function preflightEditorialV3FailedWriterHttpStage(value:unknown,paidEnabled:boolean,signal?:AbortSignal){
 let phase:EditorialCloudExecutionPhase='delegation_read';const requestLive=()=>{if(signal?.aborted)throw Error(errors.stopped);};
 try{requestLive();const v=credentials(value),b=await bound(v);requestLive();
  if(b.d.state!=='delegated'||b.receipt||b.step.state!=='claimed'){phase='existing_attempt_read';return {...await projection(b,paidEnabled),preflight:true,check_passed:false,preflight_reason:'existing_attempt',diagnostic_model_request_sent:false,diagnostic_reservation_consumed:false,diagnostic_transport_consumed:false};}
  if(!paidEnabled){phase='paid_gate';return {...await projection(b,paidEnabled),preflight:true,check_passed:false,blocked:true,diagnostic_model_request_sent:false,diagnostic_reservation_consumed:false,diagnostic_transport_consumed:false};}
  const prepared=await prepareConsumeFence(b,v,requestLive,next=>{phase=next;});
  const matched=await db().prepare(`SELECT COUNT(*) AS matches FROM editorial_failed_writer_cloud_delegations_v3 WHERE ${prepared.where}`).bind(...prepared.bindings).first<{matches:number}>();requestLive();
  return {stage_id:b.d.stage_id,stage:b.d.stage_kind,state:'claimed',preflight:true,check_passed:matched?.matches===1,consume_cas_matches:matched?.matches===1,execution_phase:phase,diagnostic_model_request_sent:false,diagnostic_reservation_consumed:false,diagnostic_transport_consumed:false,read_only:true,automatic_paid_retry:false};
 }catch(error){throw tagEditorialCloudExecutionFailure(error,phase,'not_attempted',signal);}
}
export async function executeEditorialV3FailedWriterHttpStage(value:unknown,paidEnabled:boolean,signal?:AbortSignal){
 let phase:EditorialCloudExecutionPhase='delegation_read',consumption:EditorialCloudConsumption='not_attempted';const requestLive=()=>{if(signal?.aborted)throw Error(errors.stopped);};
 try{requestLive();const v=credentials(value),b=await bound(v);requestLive();if(b.d.state==='started'||b.receipt||b.step.state!=='claimed'){phase='existing_attempt_read';return await projection(b,paidEnabled);}if(!paidEnabled){phase='paid_gate';return {...await projection(b,paidEnabled),blocked:true};}
  const prepared=await prepareConsumeFence(b,v,requestLive,next=>{phase=next;});
  phase='consume_write';consumption='unconfirmed';const changed=await db().prepare(`UPDATE editorial_failed_writer_cloud_delegations_v3 SET state='started',started=? WHERE ${prepared.where}`).bind(prepared.time,...prepared.bindings).run();if(!changed.meta.changes){consumption='zero_changes';phase='consume_reconcile';return await readEditorialV3FailedWriterHttpStage(v,paidEnabled);}consumption='committed';requestLive();phase='runtime_execute';
  try{const execution=await executeEditorialV3Stage(prepared.prepared,{signal});if('storage_pending' in execution&&execution.storage_pending===true){phase='result_read';return {...await readEditorialV3FailedWriterHttpStage(v,paidEnabled),state:'unknown',storage_pending:true,execution_diagnostic:execution.diagnostic};}}catch{const diagnostic={stage:'execution_unconfirmed',code:signal?.aborted?'request_cancelled':'execution_error'};console.error(JSON.stringify({component:'editorial-v3-cloud',stage_id:b.d.stage_id,...diagnostic}));phase='result_read';return {...await readEditorialV3FailedWriterHttpStage(v,paidEnabled),state:'unknown',execution_diagnostic:diagnostic};}
  phase='result_read';return await readEditorialV3FailedWriterHttpStage(v,paidEnabled);
 }catch(error){throw tagEditorialCloudExecutionFailure(error,phase,consumption,signal);}
}
