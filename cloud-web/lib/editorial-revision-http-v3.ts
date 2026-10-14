import {db} from './test-store';
import {hashText} from './writing-input';
import {prepareEditorialV3Stage,executeEditorialV3Stage} from './editorial-v3-runtime';
import {editorialAuthorityV3Policy,editorialAuthorityV3Scope} from './editorial-authority-v3';
import {editorialReceiptDiagnostics} from './editorial-receipt-diagnostics';
import {numericCredentialSafeUsage} from './credential-boundary';
import {editorialCredentialHit} from './editorial-credential-boundary';
import {verifyEditorialRevisionContinuationLineage,editorialRevisionContinuationSqlFence,type RevisionContinuationPlan} from './editorial-revision-continuation-v3';

/** This is issue-driven writing on the original run. It never renews the
 * consumed one-body continuation, grants authority, or allocates a stage. */
export const editorialRevisionHttpRunId='bd6d4434-273b-426e-a17f-9390fc124c84' as const;
const transport='cloud_http_once',path='/api/editorial-v3-cloud',probeMilliseconds=330_000;
const errors={invalid:'云修订单阶段参数无效',denied:'云修订单阶段委托未获允许',binding:'云修订单阶段冻结绑定不一致',stopped:'云修订单阶段授权已停止或过期',unknown:'云修订结果待对账，只读同一阶段，不重复请求'} as const;
export function editorialRevisionHttpPublicError(error:unknown){return error instanceof Error&&Object.values(errors).some(v=>v===error.message)?error.message:errors.unknown;}
type Row=Record<string,unknown>;
type StageKind='structure_revision'|'fact_revision';
type Delegation={stage_id:string;owner:string;run_id:string;article_id:string;stage_kind:StageKind;current_round:number;transport:string;token_sha256:string;frozen_json:string;frozen_sha256:string;expires:string;state:'delegated'|'started';created:string;started:string|null};
type Current={run:Row;step:Row;authority:Row;source:Row;sourceReceipt:Row;report:Row;initialFact:Row|null;receipt:Row|null;input:Row;snapshot:Row;issues:unknown[]};
type Bound=Current&{d:Delegation;f:Row};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(v);
const sha=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v);
const revision=(v:unknown):v is StageKind=>v==='structure_revision'||v==='fact_revision';
function object(v:unknown):Row{if(!v||typeof v!=='object'||Array.isArray(v))throw Error(errors.invalid);return v as Row;}
function parse(raw:unknown){try{if(typeof raw!=='string')throw Error();return object(JSON.parse(raw));}catch{throw Error(errors.binding);}}
function keys(value:unknown,allowed:string[]){const v=object(value);if(Object.keys(v).some(k=>!allowed.includes(k))||allowed.some(k=>!(k in v)))throw Error(errors.invalid);return v;}
function credentials(value:unknown){const v=keys(value,['stage_id','token']);if(!uuid(v.stage_id)||!uuid(v.token))throw Error(errors.invalid);return v as {stage_id:string;token:string};}
const receiptId=(owner:string,run:string,stage:string)=>`editorial_v3:${owner}:${run}:${stage}`;
const runColumns=['id','owner','authority_id','request_key','run_kind','day','writer','test_intent_key','input_json','input_sha256','snapshot_json','snapshot_sha256','state','round','initialized','article_id','final_sha256','error','expires','created','updated'];
const stageColumns=['id','owner','run_id','stage','round','sequence','token','input_json','input_sha256','state','artifact_json','artifact_sha256','actor_id','execution_id','model','provenance','receipt_id','error','created','updated'];
const authorityColumns=['id','owner','authorization_key','scope','state','start_day','evidence_json','evidence_sha256','frozen_bindings_json','frozen_bindings_sha256','policy_json','created','updated'];
const receiptColumns=['id','owner','day','state','response','created'];
const delegationColumns=['stage_id','owner','run_id','article_id','stage_kind','current_round','transport','token_sha256','frozen_json','frozen_sha256','expires','state','created','started'];
function balancedAnd(parts:string[]):string{if(!parts.length)throw Error(errors.binding);if(parts.length===1)return parts[0];const middle=Math.floor(parts.length/2);return `(${balancedAnd(parts.slice(0,middle))} AND ${balancedAnd(parts.slice(middle))})`;}
/** Every scalar stays NULL-safe and byte-exact. One array per row keeps D1
 * under 100 parameters; balanced conjunctions stay under workerd depth 100. */
function rowFence(alias:string,row:Row,columns:string[],bindings:unknown[]){bindings.push(JSON.stringify(columns.map(k=>row[k]??null)));const frozen=`${alias}_fence`;return `EXISTS(SELECT 1 FROM (SELECT ? AS frozen_row) ${frozen} WHERE ${balancedAnd(columns.map((k,i)=>`${alias}.${k} IS json_extract(${frozen}.frozen_row,'$[${i}]')`))})`;}
function selected(row:Row,columns:string[]){return Object.fromEntries(columns.map(k=>[k,row[k]??null]));}
async function frozenStage(row:Row){const value=selected(row,stageColumns.filter(k=>k!=='token'));return {...value,token_sha256:await hashText(String(row.token))};}
async function assertHash(row:Row,json:string,hash:string){if(typeof row[json]!=='string'||!sha(row[hash])||await hashText(String(row[json]))!==row[hash])throw Error(errors.binding);}
async function tokens(owner:string){return (await db().prepare('SELECT token FROM editorial_stages_v3 WHERE owner=?').bind(owner).all<{token:string}>()).results.map(v=>v.token);}
async function safe(owner:string,value:unknown){if(await editorialCredentialHit(owner,value,await tokens(owner)))throw Error(errors.binding);}

async function reportFor(owner:string,run:Row,step:Row,input:Row,kind:string,raw:unknown,hash:unknown){
 if(!sha(hash))throw Error(errors.binding);const artifact=JSON.stringify(raw);
 const found=(await db().prepare('SELECT * FROM editorial_stages_v3 WHERE owner=? AND run_id=? AND stage=? AND artifact_sha256=? AND sequence<?').bind(owner,run.id,kind,hash,step.sequence).all<Row>()).results;
 if(found.length!==1)throw Error(errors.binding);const report=found[0];
 await assertHash(report,'input_json','input_sha256');await assertHash(report,'artifact_json','artifact_sha256');
 const ri=parse(report.input_json),r=parse(report.artifact_json),snapshot=parse(run.snapshot_json),actors=object(snapshot.participants),actor=object(actors[kind==='structure_review'?'structure_reviewer':kind==='final_verify'?'verifier':'fact_checker']);
 if(report.state!=='completed'||report.artifact_json!==artifact||report.provenance!=='owner_attested_independent_agent'||report.receipt_id!==null||report.actor_id!==actor.actor_id||report.model!==actor.model||!uuid(report.execution_id)||report.execution_id===actor.actor_id||(report.round as number)>(step.round as number)||ri.run_id!==run.id||ri.stage_id!==report.id||ri.stage!==kind||ri.round!==report.round||ri.sequence!==report.sequence||ri.snapshot_sha256!==run.snapshot_sha256||ri.actor_id!==actor.actor_id||ri.model!==actor.model||JSON.stringify(ri.input_binding)!==JSON.stringify(input.input_binding)||JSON.stringify(ri.input_article)!==JSON.stringify(input.input_article))throw Error(errors.binding);
 if(!Array.isArray(r.issues))throw Error(errors.binding);
 await safe(owner,{input:ri,report:r});return report;
}
async function current(owner:string,stage:string,token:string):Promise<Current>{
 const step=await db().prepare('SELECT * FROM editorial_stages_v3 WHERE owner=? AND id=?').bind(owner,stage).first<Row>();
 if(!step||!revision(step.stage))throw Error(errors.denied);
 const run=await db().prepare('SELECT * FROM editorial_runs_v3 WHERE owner=? AND id=?').bind(owner,step.run_id).first<Row>();
 if(!run||run.id!==editorialRevisionHttpRunId||step.run_id!==run.id||run.owner!==owner||run.initialized!==1||!['claude','claude_provider'].includes(String(run.writer))||step.token!==token)throw Error(errors.denied);
 const authority=await db().prepare('SELECT * FROM editorial_authority_v3 WHERE owner=? AND id=?').bind(owner,run.authority_id).first<Row>();
 if(!authority||authority.scope!==editorialAuthorityV3Scope||authority.policy_json!==JSON.stringify(editorialAuthorityV3Policy))throw Error(errors.denied);
 await assertHash(run,'input_json','input_sha256');await assertHash(run,'snapshot_json','snapshot_sha256');await assertHash(step,'input_json','input_sha256');await assertHash(authority,'evidence_json','evidence_sha256');await assertHash(authority,'frozen_bindings_json','frozen_bindings_sha256');
 const input=parse(step.input_json),snapshot=parse(run.snapshot_json),binding=object(input.input_binding),actors=object(snapshot.participants),writer=object(actors.writer),capability=object(snapshot.capability);
 if(input.contract_version!==3||input.run_id!==run.id||input.stage_id!==step.id||input.stage!==step.stage||input.round!==step.round||input.sequence!==step.sequence||input.snapshot_sha256!==run.snapshot_sha256||input.actor_id!==writer.actor_id||input.model!==writer.model||input.model!==snapshot.model||input.writer_kind!=='claude_provider'||input.max_output_tokens!==capability.max_output_tokens||!uuid(binding.version_id)||!sha(binding.sha256)||await hashText(JSON.stringify(input.input_article))!==binding.sha256)throw Error(errors.binding);
 const user=parse(input.user_prompt);
 if(JSON.stringify(user.input_article)!==JSON.stringify(input.input_article)||JSON.stringify(user.input_binding)!==JSON.stringify(binding)||JSON.stringify(user.previous_report)!==JSON.stringify(input.previous_report)||user.previous_report_sha256!==input.previous_report_sha256)throw Error(errors.binding);
 const source=await db().prepare('SELECT * FROM editorial_stages_v3 WHERE owner=? AND run_id=? AND id=?').bind(owner,run.id,binding.version_id).first<Row>();
 if(!source||!['body','structure_revision','fact_revision'].includes(String(source.stage))||(source.sequence as number)>=(step.sequence as number)||!((source.state==='completed'&&source.provenance==='claude_provider_text')||(source.stage==='body'&&source.state==='content_invalid'&&source.provenance==='claude_provider_quality_candidate_v1'))||source.actor_id!==writer.actor_id||source.model!==writer.model||source.execution_id!==receiptId(owner,String(run.id),String(source.id))||source.receipt_id!==source.execution_id)throw Error(errors.binding);
 await assertHash(source,'input_json','input_sha256');await assertHash(source,'artifact_json','artifact_sha256');
 const sourceArtifact=parse(source.artifact_json),article=source.stage==='body'&&source.provenance!=='claude_provider_quality_candidate_v1'?sourceArtifact:object(sourceArtifact.article);
 if(JSON.stringify(article)!==JSON.stringify(input.input_article)||await hashText(JSON.stringify(article))!==binding.sha256)throw Error(errors.binding);
 const sourceReceipt=await db().prepare('SELECT * FROM claude_attempts WHERE owner=? AND id=?').bind(owner,source.receipt_id).first<Row>();
 if(!sourceReceipt)throw Error(errors.binding);const packet=parse(sourceReceipt.response);
 if(sourceReceipt.state!=='completed'||packet.state!=='completed'||packet.stage!==source.stage||packet.stage_id!==source.id||packet.input_sha256!==source.input_sha256||packet.snapshot_sha256!==run.snapshot_sha256||packet.requested_model!==input.model||packet.returned_model!==input.model||typeof packet.text!=='string'||editorialReceiptDiagnostics(packet).response_suppressed)throw Error(errors.binding);
 // The strict runtime is responsible for reparsing the provider text and
 // checking quality-candidate provenance against this completed source receipt.
 const kind='structure_review';
 let report:Row;
 if(step.stage==='fact_revision'){
  const matches=(await db().prepare("SELECT stage FROM editorial_stages_v3 WHERE owner=? AND run_id=? AND stage IN ('fact_check','final_verify') AND artifact_sha256=? AND sequence<?").bind(owner,run.id,input.previous_report_sha256,step.sequence).all<Row>()).results;
  if(matches.length!==1)throw Error(errors.binding);report=await reportFor(owner,run,step,input,String(matches[0].stage),input.previous_report,input.previous_report_sha256);
 }else report=await reportFor(owner,run,step,input,kind,input.previous_report,input.previous_report_sha256);
 const previous=parse(report.artifact_json),issues=previous.issues as unknown[];
 if(!issues.length||(step.stage==='structure_revision'?previous.decision!=='revise':previous.passed!==false))throw Error(errors.denied);
 let initialFact:Row|null=null;
 if(input.initial_fact_report!==undefined){
  if(step.stage!=='structure_revision'||JSON.stringify(user.initial_fact_report)!==JSON.stringify(input.initial_fact_report))throw Error(errors.binding);
  const evidence=keys(input.initial_fact_report,['stage_id','input_sha256','artifact_sha256','report']);
  const savedInitial=await reportFor(owner,run,step,input,'fact_check',evidence.report,evidence.artifact_sha256);
  if(evidence.stage_id!==savedInitial.id||evidence.input_sha256!==savedInitial.input_sha256)throw Error(errors.binding);initialFact=savedInitial;
 }
 const receipt=await db().prepare('SELECT * FROM claude_attempts WHERE owner=? AND id=?').bind(owner,receiptId(owner,String(run.id),stage)).first<Row>();
 await safe(owner,{input,snapshot,source_packet:packet});return {run,step,authority,source,sourceReceipt,report,initialFact,receipt,input,snapshot,issues};
}
async function frozenBinding(c:Current,tokenHash:string){return {contract_version:1,transport,owner:c.run.owner,run_id:c.run.id,article_id:c.run.article_id,authority_id:c.run.authority_id,stage_id:c.step.id,stage_kind:c.step.stage,current_round:c.step.round,sequence:c.step.sequence,role:'writer',actor_id:c.input.actor_id,token_sha256:tokenHash,run_input_json:c.run.input_json,run_input_sha256:c.run.input_sha256,input_json:c.step.input_json,input_sha256:c.step.input_sha256,snapshot_json:c.run.snapshot_json,snapshot_sha256:c.run.snapshot_sha256,model:c.input.model,authority:selected(c.authority,authorityColumns.filter(k=>!['state','updated'].includes(k))),source_stage:await frozenStage(c.source),source_receipt:selected(c.sourceReceipt,receiptColumns),source_receipt_sha256:await hashText(String(c.sourceReceipt.response)),previous_report_id:c.report.id,previous_report:await frozenStage(c.report),previous_report_json:c.report.artifact_json,previous_report_sha256:c.report.artifact_sha256,previous_report_input_json:c.report.input_json,previous_report_input_sha256:c.report.input_sha256,actual_issues:c.issues,initial_fact_report:c.initialFact?await frozenStage(c.initialFact):null,expires:c.run.expires};}
function descriptor(d:Delegation,created:boolean,paidEnabled:boolean){return {created,read_only:!created,stage_id:d.stage_id,stage:d.stage_kind,transport,path,expires:d.expires,paid_execution_enabled:paidEnabled,automatic_paid_retry:false,probe_seconds:330};}
async function live(c:Current){if(!Number.isFinite(Date.parse(String(c.run.expires)))||Date.parse(String(c.run.expires))<=Date.now()||c.authority.state!=='active')throw Error(errors.stopped);const control=await db().prepare("SELECT state FROM workflow_controls WHERE owner=? AND scope='editorial_v3' AND run_id=?").bind(c.run.owner,c.run.id).first<Row>();if(['paused','archived'].includes(String(control?.state))||c.run.state!==c.step.stage||c.run.round!==c.step.round)throw Error(errors.stopped);}
async function priorTerminalChanged(c:Current,paidEnabled:boolean){
 // Once this new receipt exists, an old late result is history, not the new
 // attempt's result. Before reservation it requires conservative reconciliation.
 if(c.receipt)return null;const grant=await db().prepare('SELECT new_stage_id FROM editorial_revision_continuations_v3 WHERE owner=? AND run_id=? AND new_stage_id=?').bind(c.run.owner,c.run.id,c.step.id).first();if(!grant)return null;
 const steps=(await db().prepare('SELECT * FROM editorial_stages_v3 WHERE owner=? AND run_id=? ORDER BY sequence').bind(c.run.owner,c.run.id).all<Row>()).results;
 const checked=await verifyEditorialRevisionContinuationLineage(String(c.run.owner),{row:c.run,s:c.snapshot,steps,authority:c.authority} as unknown as RevisionContinuationPlan,String(c.step.id),{assertSafe:safe},{mode:'before_new_execution'});
 return checked.new_execution_allowed?null:{created:false,stage_id:String(c.step.id),stage:c.step.stage,state:'prior_terminal_changed' as const,prior_receipt_state:checked.original_receipt_state,read_only:true,new_execution_allowed:false,automatic_paid_retry:false,paid_execution_enabled:paidEnabled,model_request_sent:false};
}
export async function hasEditorialRevisionHttpDelegation(stage:string){return Boolean(await db().prepare('SELECT stage_id FROM editorial_revision_cloud_delegations_v3 WHERE stage_id=?').bind(stage).first());}
async function bound(value:unknown,historicalOwner?:string):Promise<Bound>{
 const v=credentials(value),d=await db().prepare('SELECT * FROM editorial_revision_cloud_delegations_v3 WHERE stage_id=?').bind(v.stage_id).first<Delegation>();
 if(!d||d.transport!==transport||await hashText(v.token)!==d.token_sha256||(historicalOwner!==undefined&&historicalOwner!==d.owner))throw Error(errors.denied);
 await assertHash(d,'frozen_json','frozen_sha256');
 if(historicalOwner===undefined){if(!Number.isFinite(Date.parse(d.expires))||Date.parse(d.expires)<=Date.now())throw Error(errors.stopped);const a=await db().prepare('SELECT state FROM editorial_authority_v3 WHERE owner=? AND id=?').bind(d.owner,parse(d.frozen_json).authority_id).first<Row>();if(a?.state!=='active')throw Error(errors.stopped);}
 const c=await current(d.owner,d.stage_id,v.token),f=parse(d.frozen_json);
 if(JSON.stringify(await frozenBinding(c,d.token_sha256))!==d.frozen_json||d.run_id!==c.run.id||d.article_id!==c.run.article_id||d.stage_kind!==c.step.stage||d.current_round!==c.step.round||d.expires!==c.run.expires||f.token_sha256!==d.token_sha256)throw Error(errors.binding);
 return {...c,d,f};
}
/** Exact row fences apply both when delegating and when consuming. They bind
 * all immutable source/report bytes, original authority and current live phase. */
function liveFence(c:Current,bindings:unknown[],time:string){
 const terms=[rowFence('r',c.run,runColumns,bindings),rowFence('s',c.step,stageColumns,bindings),rowFence('a',c.authority,authorityColumns,bindings),"a.state='active'","s.state='claimed'",'r.state=s.stage','r.round=s.round',"s.receipt_id IS NULL","s.artifact_json IS NULL","s.artifact_sha256 IS NULL"];
 bindings.push(time);terms.push('r.expires>?');
 terms.push(`EXISTS(SELECT 1 FROM editorial_stages_v3 source WHERE ${rowFence('source',c.source,stageColumns,bindings)})`);
 terms.push(`EXISTS(SELECT 1 FROM claude_attempts original_receipt WHERE ${rowFence('original_receipt',c.sourceReceipt,receiptColumns,bindings)})`);
 terms.push(`EXISTS(SELECT 1 FROM editorial_stages_v3 report WHERE ${rowFence('report',c.report,stageColumns,bindings)})`);
 if(c.initialFact)terms.push(`EXISTS(SELECT 1 FROM editorial_stages_v3 initial_fact WHERE ${rowFence('initial_fact',c.initialFact,stageColumns,bindings)})`);
 terms.push("NOT EXISTS(SELECT 1 FROM workflow_controls w WHERE w.owner=r.owner AND w.scope='editorial_v3' AND w.run_id=r.id AND w.state IN ('paused','archived'))");
 bindings.push(receiptId(String(c.run.owner),String(c.run.id),String(c.step.id)));terms.push('NOT EXISTS(SELECT 1 FROM claude_attempts x WHERE x.owner=r.owner AND x.id=?)');
 // The independent new attempt may not begin after a newly visible old terminal.
 // Unknown progress may change; only the original identity/phase is frozen.
 terms.push(editorialRevisionContinuationSqlFence('s'));
 return `EXISTS(SELECT 1 FROM editorial_runs_v3 r JOIN editorial_stages_v3 s ON s.run_id=r.id AND s.owner=r.owner JOIN editorial_authority_v3 a ON a.id=r.authority_id AND a.owner=r.owner WHERE ${balancedAnd(terms)})`;
}
export async function delegateEditorialV3RevisionHttpOnce(owner:string,value:unknown,paidEnabled:boolean){
 if(typeof owner!=='string'||!owner.trim()||owner.length>500)throw Error(errors.denied);
 const v=keys(value,['run_id','stage_id','token','transport','confirm']);if(v.run_id!==editorialRevisionHttpRunId||v.transport!==transport||v.confirm!==true||!uuid(v.stage_id)||!uuid(v.token))throw Error(errors.denied);
 const prior=await db().prepare('SELECT * FROM editorial_revision_cloud_delegations_v3 WHERE stage_id=?').bind(v.stage_id).first<Delegation>();
 if(prior)return descriptor((await bound({stage_id:v.stage_id,token:v.token},owner)).d,false,paidEnabled);
 const c=await current(owner,v.stage_id,v.token);if(c.receipt||c.step.state!=='claimed'||c.step.receipt_id!==null||c.step.artifact_json!==null||c.step.artifact_sha256!==null)throw Error(errors.denied);await live(c);const terminal=await priorTerminalChanged(c,paidEnabled);if(terminal)return terminal;
 const prepared=await prepareEditorialV3Stage(owner,{run_id:c.run.id,stage_id:c.step.id,token:v.token,expected_model:c.input.model,expected_input_sha256:c.step.input_sha256,confirm:true});
 if(prepared.step.input_json!==c.step.input_json||prepared.loaded.row.input_json!==c.run.input_json||prepared.loaded.row.snapshot_json!==c.run.snapshot_json)throw Error(errors.binding);
 const tokenHash=await hashText(v.token),raw=JSON.stringify(await frozenBinding(c,tokenHash)),time=new Date().toISOString(),bindings:unknown[]=[];
 const fence=liveFence(c,bindings,time);
 const inserted=await db().prepare(`INSERT OR IGNORE INTO editorial_revision_cloud_delegations_v3(stage_id,owner,run_id,article_id,stage_kind,current_round,transport,token_sha256,frozen_json,frozen_sha256,expires,state,created) SELECT ?,?,?,?,?,?,?,?,?,?,?,'delegated',? WHERE ${fence} AND NOT EXISTS(SELECT 1 FROM editorial_cloud_delegations_v3 old WHERE old.stage_id=?)`).bind(c.step.id,owner,c.run.id,c.run.article_id,c.step.stage,c.step.round,transport,tokenHash,raw,await hashText(raw),c.run.expires,time,...bindings,c.step.id).run();
 const after=await bound({stage_id:v.stage_id,token:v.token});return descriptor(after.d,inserted.meta.changes===1,paidEnabled);
}
const stepStates=new Set(['claimed','requested','completed','technical_failed','content_invalid','unknown']);
async function projection(b:Bound,paidEnabled:boolean){
 const control=await db().prepare("SELECT state FROM workflow_controls WHERE owner=? AND scope='editorial_v3' AND run_id=?").bind(b.d.owner,b.d.run_id).first<Row>();
 const authorityState=['active','revoked','cancelled'].includes(String(b.authority.state))?String(b.authority.state):'unknown';
 if(authorityState!=='active'||!Number.isFinite(Date.parse(b.d.expires))||Date.parse(b.d.expires)<=Date.now())throw Error(errors.stopped);
 const rowState=stepStates.has(String(b.step.state))?String(b.step.state):'unknown',controlState=['paused','archived'].includes(String(control?.state))?String(control?.state):'active';
 const state=controlState!=='active'?controlState:['paused','archived','cancelled','unknown','dispatch_unknown'].includes(String(b.run.state))?String(b.run.state):rowState;
 let packet:Row={},identity=false,suppressed=false;const ownerTokens=await tokens(b.d.owner);
 if(b.receipt){try{packet=parse(b.receipt.response);identity=packet.stage===b.d.stage_kind&&packet.stage_id===b.d.stage_id&&packet.input_sha256===b.step.input_sha256&&packet.snapshot_sha256===b.run.snapshot_sha256&&packet.state===b.receipt.state&&packet.requested_model===b.f.model&&b.step.receipt_id===receiptId(b.d.owner,b.d.run_id,b.d.stage_id);suppressed=await editorialCredentialHit(b.d.owner,packet,ownerTokens);}catch{suppressed=true;}}
 const result={stage_id:b.d.stage_id,stage:b.d.stage_kind,state,row_state:rowState,authority_state:authorityState,control_state:controlState,delegation_state:b.d.state,receipt_state:b.receipt&&['requested','completed','failed'].includes(String(b.receipt.state))?b.receipt.state:null,binding_status:identity?'bound_to_stage_input':'unconfirmed',...editorialReceiptDiagnostics(identity?packet:{},suppressed),usage:identity&&!suppressed?numericCredentialSafeUsage(packet.usage):null,read_only:true,automatic_paid_retry:false,paid_execution_enabled:paidEnabled};
 if(await editorialCredentialHit(b.d.owner,result,ownerTokens))return {...result,diagnostic:null,requested_model:null,returned_model:null,usage:null,response_suppressed:true};return result;
}
export async function readEditorialV3RevisionHttpStage(value:unknown,paidEnabled:boolean){const b=await bound(value);return await priorTerminalChanged(b,paidEnabled)||await projection(b,paidEnabled);}
export async function probeEditorialV3RevisionHttpStage(value:unknown,signal?:AbortSignal){
 const b=await bound(value);await live(b);const terminal=await priorTerminalChanged(b,false);if(terminal)return terminal;if(Date.parse(b.d.expires)-Date.now()<probeMilliseconds||signal?.aborted)throw Error(errors.stopped);const start=Date.now();
 await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(Error(errors.stopped));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},probeMilliseconds);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();});await bound(value);
 return {stage_id:b.d.stage_id,transport,probe:true,state:'completed',elapsed_ms:Math.max(0,Date.now()-start),target_ms:probeMilliseconds,model_request_sent:false,reservation_consumed:false,read_only:true};
}
export async function executeEditorialV3RevisionHttpStage(value:unknown,paidEnabled:boolean,signal?:AbortSignal){
 const requestLive=()=>{if(signal?.aborted)throw Error(errors.stopped);};requestLive();const v=credentials(value),b=await bound(v);requestLive();const terminal=await priorTerminalChanged(b,paidEnabled);if(terminal)return terminal;if(b.d.state==='started'||b.receipt||b.step.state!=='claimed')return projection(b,paidEnabled);
 if(!paidEnabled)return {...await projection(b,paidEnabled),blocked:true,error:'云正文付费执行尚未开放，仅可零调用探针或只读对账'};
 await live(b);requestLive();
 const prepared=await prepareEditorialV3Stage(b.d.owner,{run_id:b.d.run_id,stage_id:b.d.stage_id,token:v.token,expected_model:b.f.model,expected_input_sha256:b.f.input_sha256,confirm:true});
 requestLive();if(prepared.step.input_json!==b.step.input_json||prepared.loaded.row.input_json!==b.run.input_json||prepared.loaded.row.snapshot_json!==b.run.snapshot_json)throw Error(errors.binding);
 const time=new Date().toISOString(),bindings:unknown[]=[],delegationFence=rowFence('editorial_revision_cloud_delegations_v3',b.d,delegationColumns,bindings),fence=liveFence(b,bindings,time);
 requestLive();const changed=await db().prepare(`UPDATE editorial_revision_cloud_delegations_v3 SET state='started',started=? WHERE ${balancedAnd([delegationFence,fence])}`).bind(time,...bindings).run();
 if(!changed.meta.changes)return readEditorialV3RevisionHttpStage(v,paidEnabled);requestLive();
 // Consumption never resets. Runtime owns the existing attempt uniqueness and
 // actual provider response parsing. AbortSignal stays request-bound.
 try{const execution=await executeEditorialV3Stage(prepared,{signal});if('storage_pending' in execution&&execution.storage_pending===true)return {...await readEditorialV3RevisionHttpStage(v,paidEnabled),state:'unknown',storage_pending:true,execution_diagnostic:execution.diagnostic};}catch{
  const diagnostic={stage:'execution_unconfirmed',code:signal?.aborted?'request_cancelled':'execution_error'};console.error(JSON.stringify({component:'editorial-v3-cloud',stage_id:b.d.stage_id,...diagnostic}));return {...await readEditorialV3RevisionHttpStage(v,paidEnabled),state:'unknown',execution_diagnostic:diagnostic};
 }
 return readEditorialV3RevisionHttpStage(v,paidEnabled);
}
