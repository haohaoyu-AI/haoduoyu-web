import {db} from './test-store';
import {hashText} from './writing-input';
import {assertWordCredentialFree,hasWordCredential,redactWordCredentialText} from './word-credentials';
import {hasArticleClaimCredential} from './article-claim-credentials';
import {createEditorialCredentialScanContext} from './editorial-credential-boundary';
import {dedaoWordOriginExpressions,dedaoWordOriginSql,verifyDedaoWordOrigin,DedaoWordOriginError,type DedaoWordOrigin} from './dedao-word-origin';
import {wordVerifiedEndStatements} from './word-attempts';

// This protocol verifies Site identity, frozen data, fencing and receipt applicability.
// External normal Codex observations are explicitly owner-attested, never server-verified.
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const sha=/^[a-f0-9]{64}$/;
const clock="strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const now=()=>new Date().toISOString();
type Row=Record<string,any>;
type Snapshot={owner:string;id:string;raw:Record<string,string>;article:Row;control:Row|null;input:string;claimHash:string;fingerprint:string;origin:DedaoWordOrigin|null};
export class ArticleWordRecoveryError extends Error {}
function fail(message:string):never{throw new ArticleWordRecoveryError(message);}
function exact(value:unknown,allowed:string[],required=allowed):asserts value is Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key))||required.some(key=>!Object.prototype.hasOwnProperty.call(value,key)))fail('配图恢复参数不完整或含未声明字段');
}
function identity(value:unknown,label:string):asserts value is string{if(typeof value!=='string'||!uuid.test(value))fail(`${label}无效`);}
function reference(value:unknown,label:string):asserts value is string{if(typeof value!=='string'||!value.trim()||value.length>240||/[\x00-\x1f\x7f]/.test(value))fail(`${label}必须是实际工具或结束记录的简短引用`);}
function canonicalDate(value:unknown,label:string){if(typeof value!=='string'||value.length>40||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail(`${label}须为准确UTC时间`);return Date.parse(value);}
function parse(raw:string|null|undefined,label='已有记录'){try{return raw?JSON.parse(raw):null;}catch{fail(`${label}不可核对；只读取原任务`);}}
function sqlText(value:string){return `CAST(X'${Array.from(new TextEncoder().encode(value)).map(n=>n.toString(16).padStart(2,'0')).join('')}' AS TEXT)`;}
function fields(names:string[]){return `json_object(${names.flatMap(name=>[`'${name}'`,name]).join(',')})`;}

const articleFields=['id','owner','title','filename','source_key','paragraphs','created','state','error','claim_token','claim_expires','word_claim_origin_hash','result_key','result_meta','draft_url','artifact_manifest','draft_readback','upload_guard_version'];
const controlFields=['owner','target_kind','target_id','input_sha256','claim_hash','version','epoch','desired','execution_id','request_key','token_hash','lease_until','heartbeat_at','status','reason','retry_count','retry_after','minimum_images','execution_scope','queue_revision','legacy_output_binding','updated','attempt_id'];
const queueFields=['owner','request_key','target_kind','target_id','input_sha256','claim_hash','token_hash','execution_id','execution_scope','capacity_reason','operation','from_epoch','from_version','from_token_hash','created'];
const receiptFields=['owner','request_key','target_kind','target_id','input_sha256','claim_hash','token_hash','execution_id','epoch','execution_scope','operation','from_epoch','from_version','from_token_hash','created'];
const endFields=['owner','article_id','request_key','input_sha256','claim_hash','execution_id','epoch','token_hash','lease_fingerprint','proof_json','payload_sha256','created'];
const recoveryFields=['owner','article_id','request_key','input_sha256','old_claim_hash','next_claim_hash','expected_fingerprint','termination_json','confirmation_reference','payload_sha256','control_version','control_epoch','created'];
// Each aggregate is lossless and ordered. The complete DB snapshot is compared again in
// the atomic INSERT, including parts/verification values that have no updated column.
function expressions(owner:string,id:string){
 const o=sqlText(owner),i=sqlText(id),target=`owner=${o} AND target_kind='article' AND target_id=${i}`;
 const aggregate=(table:string,columns:string[],where:string,order:string)=>`(SELECT COALESCE(json_group_array(${fields(columns)}),'[]') FROM (SELECT ${columns.join(',')} FROM ${table} WHERE ${where} ORDER BY ${order}))`;
 const byArticle=`owner=${o} AND article_id=${i}`;
 const prohibited=['article_upload_attempts','article_deliveries','writing_runs','editorial_runs_v3','editorial_flows','outline_flows'];
 return {
  article:`(SELECT ${fields(articleFields)} FROM articles WHERE owner=${o} AND id=${i})`,
  control:aggregate('word_recovery',controlFields,target,'target_id'),
  checkpoints:aggregate('word_checkpoints',['owner','target_kind','target_id','input_sha256','asset_id','kind','sha256','size','chunks','metadata_json','verification_json','parts_json','state','created','attempt_id'],target,'asset_id'),
  candidates:aggregate('word_image_candidates',['owner','target_kind','target_id','candidate_id','input_sha256','source_url','source_title','outcome','reason','replacement_for','asset_id','payload_sha256','created','attempt_id'],target,'candidate_id'),
  progress:aggregate('word_progress_events',['owner','target_kind','target_id','version','event_id','input_sha256','payload_sha256','snapshot_json','created','attempt_id'],target,'version,event_id'),
  queue:aggregate('word_execution_queue',queueFields,target,'request_key'),
  receipts:aggregate('word_execution_receipts',receiptFields,target,'request_key'),
  history:aggregate('word_execution_requests',queueFields,target,'request_key'),
  help:aggregate('article_help_queue_claims',['owner','request_key','article_id','handoff_id','event_id','claim_hash','created'],byArticle,'request_key'),
  handoffs:aggregate('article_handoffs',['id','owner','article_id','event_id','state','created','updated','expires'],byArticle,'id'),
  restarts:aggregate('article_output_restarts',['id','owner','article_id','previous_output_id','previous_meta','new_output_id','reason','created'],byArticle,'id'),
  diagnostics:aggregate('article_upload_diagnostics',['id','owner','article_id','platform','executor_id','attempt_id','stage','outcome','cause','observed_at','created'],byArticle,'id'),
  ends:aggregate('article_word_executor_ends',endFields,byArticle,'request_key'),
  recoveries:aggregate('article_word_claim_recoveries',recoveryFields,byArticle,'request_key'),
  serial_slot:aggregate('word_serial_slots',['owner','target_kind','target_id','input_sha256','attempt_id','claim_hash','execution_id','grant_request_key','token_hash','epoch','state','version','held_at','updated'],`owner=${o}`,'owner'),
  attempts:aggregate('word_attempts',['owner','target_kind','target_id','attempt_id','generation','input_sha256','creation_request_key','previous_attempt_id','strategy_sha256','strategy_reference','state','started_at','active_elapsed_ms','active_started_at','stop_requested_at','ended_at','reason','initial_manifest_json','created','updated'],target,'generation,attempt_id'),
  attempt_requests:aggregate('word_attempt_requests',['owner','request_key','target_kind','target_id','attempt_id','operation','payload_sha256','receipt_json','created'],target,'request_key'),
  service_incidents:aggregate('word_service_incidents',['owner','dependency','reason','state','first_seen','last_seen'],`owner=${o}`,'dependency,reason'),
  claim_origins:aggregate('word_claim_origins',['owner','target_kind','target_id','claim_hash','origin','proof_reference','created'],target,'claim_hash'),
  ...dedaoWordOriginExpressions(owner,id),
  exclusions:`json_object(${[...prohibited.flatMap(table=>[`'${table}'`,`(SELECT COUNT(*) FROM ${table} WHERE article_id=${i})`]),"'article_deletions'",`(SELECT COUNT(*) FROM article_deletions WHERE id=${i})`,"'submission_diagnostics'",`(SELECT COUNT(*) FROM article_upload_diagnostics WHERE article_id=${i} AND (attempt_id IS NOT NULL OR stage IN ('file_submission','platform_import','draft_readback')))`].join(',')})`
 };
}
function conjunction(parts:string[]):string{if(parts.length<=4)return `(${parts.join(' AND ')})`;const middle=Math.ceil(parts.length/2);return `(${conjunction(parts.slice(0,middle))} AND ${conjunction(parts.slice(middle))})`;}
function snapshotPredicate(s:Snapshot){const expression=expressions(s.owner,s.id);return {sql:conjunction(Object.entries(expression).map(([key,value])=>`${value} IS ?`)),binds:Object.keys(expression).map(key=>s.raw[key])};}
function manualScope(owner:string,id:string){
 const o=sqlText(owner),i=sqlText(id),conditions=[`a.owner=${o}`,`a.id=${i}`,"a.state='processing'","a.source_key='articles/'||a.id||'/source'","a.result_key IS NULL","a.claim_token IS NOT NULL","a.claim_expires IS NOT NULL","a.draft_url IS NULL","a.draft_readback IS NULL","a.upload_guard_version=0","json_valid(a.paragraphs)","json_type(a.paragraphs)='array'","json_array_length(a.paragraphs)>0","(a.artifact_manifest IS NULL OR (json_valid(a.artifact_manifest) AND COALESCE(json_extract(a.artifact_manifest,'$.output_mode'),'')<>'text_only'))","NOT EXISTS(SELECT 1 FROM article_deletions d WHERE d.id=a.id)","NOT EXISTS(SELECT 1 FROM article_upload_diagnostics d WHERE d.article_id=a.id AND (d.attempt_id IS NOT NULL OR d.stage IN ('file_submission','platform_import','draft_readback')))",...['article_upload_attempts','article_deliveries','writing_runs','editorial_runs_v3','editorial_flows','outline_flows'].map(table=>`NOT EXISTS(SELECT 1 FROM ${table} p WHERE p.article_id=a.id)`),`(NOT EXISTS(SELECT 1 FROM dedao_items p WHERE p.article_id=a.id) OR (${dedaoWordOriginSql(owner,id)}))`];
 return `EXISTS(SELECT 1 FROM articles a WHERE ${conjunction(conditions)})`;
}

/** Ordinary expired claiming must not silently replace this protocol. Pure UI/guard hint. */
export function articleWordRecoveryNeedsSupportedRecovery(row:{id?:string;state?:string;source_key?:string;sourceKey?:string;claim_token?:string|null;claimToken?:string|null;result_key?:string|null;resultKey?:string|null;artifact_manifest?:string|null;artifactManifest?:string|null}){
 const manifest=row.artifact_manifest??row.artifactManifest;let mode:unknown;try{mode=manifest?JSON.parse(manifest)?.output_mode:null;}catch{return true;}
 return row.state==='processing'&&(row.source_key??row.sourceKey)===`articles/${row.id}/source`&&!!(row.claim_token??row.claimToken)&&!(row.result_key??row.resultKey)&&mode!=='text_only';
}
function validatePartialOutput(a:Row){
 const output=parse(a.result_meta,'已冻结 Word 身份');if(output===null)return null;
 if(!output||typeof output!=='object'||Array.isArray(output)||!uuid.test(String(output.output_id))||!sha.test(String(output.sha256))||!Number.isSafeInteger(output.size)||output.size<1||output.size>20971520||!Number.isSafeInteger(output.chunks)||output.chunks<1||output.chunks>400||!Array.isArray(output.parts)||output.parts.length>output.chunks||!Number.isSafeInteger(output.bytes)||output.bytes<0||output.bytes>output.size||output.parts.some((part:any)=>!part||typeof part.key!=='string'||!sha.test(String(part.sha256))||!Number.isSafeInteger(part.size)||part.size<1||part.size>65536)||output.parts.reduce((sum:number,part:any)=>sum+part.size,0)!==output.bytes)fail('已有 Word 身份或分块待核验；不得重建或替换');
 if(output.word_claim_recoveries?.some((entry:any)=>entry?.scope!=='word_output_only'))fail('已有平台恢复历史，不能进入人工配图恢复');
 return output;
}
async function legacyBinding(a:Row){
 const output=validatePartialOutput(a);if(!output)return null;
 return JSON.stringify({contract_version:1,output_id_sha256:await hashText(output.output_id),sha256:output.sha256,size:output.size,chunks:output.chunks,manifest_sha256:await hashText(JSON.stringify(a.artifact_manifest??null)),prefix_chunks:output.parts.length,prefix_sha256:await hashText(JSON.stringify(output.parts))});
}
async function load(owner:string,id:string):Promise<Snapshot>{
 if(!owner||owner.length>512)fail('配图恢复身份无效');identity(id,'文章身份');
 const expression=expressions(owner,id),raw=await db().prepare(`SELECT ${Object.entries(expression).map(([key,value])=>`${value} AS ${key}`).join(',')}`).first<Record<string,string>>();
 if(!raw?.article)fail('未找到本人原文章');
 const article=parse(raw.article),controls=parse(raw.control);if(controls.length>1)fail('执行控制身份待核验');
 const paragraphs=parse(article.paragraphs,'冻结原文');
 if(article.state!=='processing'||article.source_key!==`articles/${id}/source`||article.result_key!==null||!article.claim_token||!article.claim_expires||!uuid.test(article.claim_token)||!Number.isFinite(Date.parse(article.claim_expires))||article.draft_url!==null||article.draft_readback!==null||article.upload_guard_version!==0||!Array.isArray(paragraphs)||!paragraphs.length||paragraphs.some(item=>typeof item!=='string')||Object.values(parse(raw.exclusions)).some(count=>count!==0))fail('仅支持没有平台行为的原手工上传或严格核实得到来源的配图处理中任务');
 const input=await hashText(JSON.stringify(paragraphs)),claimHash=await hashText(article.claim_token),manifest=parse(article.artifact_manifest,'冻结交付清单'),control=controls[0]||null;
 if(manifest&&(manifest.contract_version!==1||manifest.output_mode==='text_only'||manifest.original_sha256!==input))fail('冻结原文与既有交付清单不一致');
 if(control){
  if(control.input_sha256!==input||control.claim_hash!==claimHash||!Number.isSafeInteger(control.version)||control.version<0||!Number.isSafeInteger(control.epoch)||control.epoch<0||!['run','paused','cancelled'].includes(control.desired))fail('原执行、认领与冻结输入不一致；只读核查');
  if(control.version===0||control.epoch===0){
   // V135 first acquisition can persist a 0/0 control plus a queued request when
   // capacity is full. That request is never a grant or an execution/token binding.
   const queued=parse(raw.queue),history=parse(raw.history),receipts=parse(raw.receipts);
   if(control.version!==0||control.epoch!==0||control.execution_id!==null||control.request_key!==null||control.token_hash!==null||control.lease_until!==null||control.attempt_id!==null||parse(raw.attempts).length||receipts.length||queued.length!==1||queued[0].input_sha256!==input||queued[0].claim_hash!==claimHash||queued[0].operation!=='acquire'||!history.some((entry:Row)=>queueFields.filter(key=>!['created','capacity_reason'].includes(key)).every(key=>entry[key]===queued[0][key])))fail('零版本等待记录须有未授予、完整匹配的原排队历史；不得借此绕过执行证据');
  }
 }
 validatePartialOutput(article);
 let origin:DedaoWordOrigin|null;try{origin=await verifyDedaoWordOrigin(owner,id,raw,article,input,claimHash);}catch(error){if(error instanceof DedaoWordOriginError)fail(error.message);throw error;}
 return {owner,id,raw,article,control,input,claimHash,origin,fingerprint:await hashText(JSON.stringify({...raw,source_origin:origin?.provenance??null}))};
}
function latestRecordedWrite(s:Snapshot){
 // Pause/cancel/continue are owner control observations, not late executor actions.
 // Their updated timestamp must not falsify a genuine earlier terminal observation.
 const output=parse(s.article.result_meta),manifest=parse(s.article.artifact_manifest);
 const dates=[s.article.created,['user_intent','waiting_safe_stop','executor_ended_settled','new_attempt_queued'].includes(s.control?.reason)?null:s.control?.updated,s.control?.heartbeat_at,output?.progress_updated_at,manifest?.layout?.recorded_at];
 for(const key of ['checkpoints','candidates','progress','queue','receipts','history','help','restarts'])for(const row of parse(s.raw[key]))dates.push(row.created);
 // Existing parts have no updated column. Their complete values are still fenced by CAS;
 // this date floor never claims invented historical per-chunk write timestamps.
 for(const slot of parse(s.raw.serial_slot))if(slot.target_kind==='article'&&slot.target_id===s.id)dates.push(slot.held_at);
 for(const attempt of parse(s.raw.attempts))dates.push(attempt.started_at);
 const known=dates.filter((value):value is string=>typeof value==='string').map(value=>Date.parse(value));
 if(known.some(value=>!Number.isFinite(value)))fail('历史写入时间不可核对');return Math.max(...known);
}
async function evidenceSafe(owner:string,value:unknown,known:(string|null|undefined)[]){
 const tokens=known.filter((token):token is string=>typeof token==='string'&&!!token),scan=await createEditorialCredentialScanContext(owner);
 await assertWordCredentialFree(owner,value,tokens);
 if(await hasArticleClaimCredential(owner,value)||await scan.inspect(value,tokens))fail('恢复引用含敏感凭据或暂不可核对；未保存');
 await scan.assertFresh();
}
async function preview(s:Snapshot){
 const output=validatePartialOutput(s.article),assets=parse(s.raw.checkpoints),candidates=parse(s.raw.candidates),ends=parse(s.raw.ends).filter((entry:Row)=>entry.claim_hash===s.claimHash&&entry.input_sha256===s.input);
 const attempt=s.control?.attempt_id?parse(s.raw.attempts).find((entry:Row)=>entry.attempt_id===s.control!.attempt_id):null;
 const currentAttemptRecorded=!s.control?.attempt_id||!!(attempt?.started_at&&attempt.state!=='queued'&&s.control.reason!=='new_attempt_queued');
 const currentExecutor=currentAttemptRecorded&&!!s.control?.execution_id&&parse(s.raw.receipts).some((entry:Row)=>entry.input_sha256===s.input&&entry.claim_hash===s.claimHash&&entry.execution_id===s.control!.execution_id);
 const result={article_id:s.id,state:s.article.state,scope:s.origin?'confirmed_dedao_word_before_final_save':'manual_word_before_final_save',source_origin:s.origin?.provenance??{kind:'direct_manual_upload'},input_sha256:s.input,expected_fingerprint:s.fingerprint,claim_present:true,claim_expires:s.article.claim_expires,claim_expired:Date.parse(s.article.claim_expires)<=Date.now(),termination_required:true,executor:{adopted:!!s.control,current_executor_recorded:currentExecutor,execution_id:currentExecutor?s.control!.execution_id:null,prior_execution_id:currentExecutor?null:s.control?.execution_id||null,epoch:s.control?.epoch??null,version:s.control?.version??null,desired:s.control?.desired||null,status:s.control?.status||null},existing_output:output?{output_id:output.output_id,sha256:output.sha256,size:output.size,chunks:output.chunks,accepted_chunks:output.parts.length,accepted_bytes:output.bytes}:null,retained:{image_checkpoints:assets.filter((entry:Row)=>entry.kind==='image').length,word_checkpoints:assets.filter((entry:Row)=>entry.kind==='word').length,accepted_checkpoint_bytes:assets.reduce((sum:number,entry:Row)=>sum+parse(entry.parts_json).reduce((n:number,part:Row)=>n+part.size,0),0),candidate_results:candidates.length,progress_events:parse(s.raw.progress).length,layout_frozen:!!parse(s.article.artifact_manifest)?.layout},holder_end_receipts:ends.map((entry:Row)=>({request_key:entry.request_key,execution_id:entry.execution_id,recorded_at:entry.created,evidence:'current_holder_task_end_acknowledgement'})),new_execution_grant:false,new_platform_upload_allowed:false,limitation:'Expiry is not termination. External Codex observations are owner-attested, not server-verified. Read existing output/checkpoint receipts before continuing; no search or page counts are reconstructed. A retained prior execution ID is never a new claim execution binding. Dedao source import evidence never proves Word termination. Source re-head and D1 snapshot CAS do not form an atomic cross-storage transaction.'};
 await s.origin?.assertFresh();return redactWordCredentialText(s.owner,result,[s.article.claim_token]);
}
async function recoveryReceipt(owner:string,id:string,key:string){return db().prepare('SELECT * FROM article_word_claim_recoveries WHERE owner=? AND article_id=? AND request_key=?').bind(owner,id,key).first<Row>();}
async function readRecoveryReceipt(owner:string,id:string,key:string){
 await assertWordCredentialFree(owner,{article_id:id,request_key:key});
 const receipt=await recoveryReceipt(owner,id,key);if(!receipt)return {article_id:id,request_key:key,recorded:false,applicable:false,status:'not_recorded',retry_same_request_key:true,new_execution_grant:false};
 let applicable=false;
 try{
  const s=await load(owner,id);
  if(s.claimHash===receipt.next_claim_hash&&s.input===receipt.input_sha256){
   // Storage/credential checks yield. Repeat every complete DB snapshot, the exact
   // current claim/input and a fresh database clock; a read never renews authority.
   const condition=snapshotPredicate(s);await s.origin?.assertFresh();
   applicable=!!await db().prepare(`SELECT 1 AS applicable WHERE ${manualScope(owner,id)} AND ${condition.sql} AND EXISTS(SELECT 1 FROM articles WHERE owner=? AND id=? AND claim_token=? AND paragraphs=? AND claim_expires>${clock}) AND EXISTS(SELECT 1 FROM word_recovery WHERE owner=? AND target_kind='article' AND target_id=? AND input_sha256=? AND claim_hash=? AND epoch>=? AND version>=?)`).bind(...condition.binds,owner,id,s.article.claim_token,s.article.paragraphs,owner,id,receipt.input_sha256,receipt.next_claim_hash,receipt.control_epoch,receipt.control_version).first();
  }
 }catch(error){if(!(error instanceof ArticleWordRecoveryError||error instanceof DedaoWordOriginError))throw error;}
 const proof=parse(receipt.termination_json);
 return {article_id:id,request_key:key,recorded:true,applicable,status:applicable?'claim_recovered_await_executor':'recorded_no_longer_applicable',input_sha256:receipt.input_sha256,recorded_at:receipt.created,control_version:receipt.control_version,control_epoch:receipt.control_epoch,termination_kind:proof.kind,evidence:proof.evidence,existing_results_preserved:true,same_article:true,retry_same_request_key:false,new_execution_grant:false,new_platform_upload_allowed:false};
}
function endPayload(a:Record<string,unknown>,claimHash:string,tokenHash:string|null){return {article_id:a.article_id,request_key:a.request_key,claim_hash:claimHash,token_hash:tokenHash,execution_id:a.execution_id,epoch:a.epoch??null,input_sha256:a.input_sha256,confirm_all_actions_stopped:a.confirm_all_actions_stopped,confirm_all_actions_settled:a.confirm_all_actions_settled,settled_reference:a.settled_reference,end_reference:a.end_reference,...(a.settlement_request_key===undefined?{}:{settlement_request_key:a.settlement_request_key})};}
// Explicitly select an immutable original-holder settlement. Never infer process
// termination from a fenced/expired control or search for a vaguely matching end.
async function settledOriginalHolder(s:Snapshot,a:Record<string,unknown>,tokenHash:string|null){
 const c=s.control,entry=parse(s.raw.attempt_requests).find((row:Row)=>row.request_key===a.settlement_request_key);
 if(!c?.attempt_id||!tokenHash||a.epoch===undefined||!entry||entry.owner!==s.owner||entry.target_kind!=='article'||entry.target_id!==s.id||entry.operation!=='settle'||entry.attempt_id!==c.attempt_id)fail('须显式选择同一当前尝试的原持有者结清回执');
 const proof=parse(entry.receipt_json,'原持有者结清回执');
 exact(proof,['target_kind','target_id','input','attempt','claimHash','tokenHash','execution_id','epoch','state','settled_reference','terminal_reference','confirm_all_actions_settled','confirm_executor_ended','application_nonce']);
 identity(proof.application_nonce,'结清应用身份');reference(proof.settled_reference,'原动作结清引用');reference(proof.terminal_reference,'原执行终止引用');
 const safe={target_kind:'article',target_id:s.id,input:s.input,attempt:c.attempt_id,claimHash:s.claimHash,tokenHash,execution_id:a.execution_id,epoch:a.epoch,state:'ended',settled_reference:a.settled_reference,terminal_reference:a.end_reference,confirm_all_actions_settled:true,confirm_executor_ended:true};
 if(Object.entries(safe).some(([key,value])=>proof[key]!==value)||entry.payload_sha256!==await hashText(JSON.stringify(safe)))fail('结清回执须完整匹配原认领、输入、执行、凭据、epoch及真实引用');
 const grant=parse(s.raw.receipts).find((row:Row)=>row.request_key===c.request_key);
 const grantRequest=grant&&parse(s.raw.history).find((row:Row)=>row.request_key===grant.request_key&&queueFields.filter(key=>!['created','capacity_reason'].includes(key)).every(key=>row[key]===grant[key]));
 const attempt=parse(s.raw.attempts).find((row:Row)=>row.attempt_id===c.attempt_id);
 if(!grant||!grantRequest||grant.owner!==s.owner||grant.target_kind!=='article'||grant.target_id!==s.id||grant.input_sha256!==s.input||grant.claim_hash!==s.claimHash||grant.execution_id!==a.execution_id||grant.token_hash!==tokenHash||grant.epoch!==a.epoch||!['acquire','transition'].includes(grant.operation)||c.execution_id!==a.execution_id||c.epoch<=Number(a.epoch)||c.token_hash!==null||c.lease_until!==null||c.status!=='await_executor'||c.reason!=='executor_ended_settled'||!attempt||attempt.owner!==s.owner||attempt.target_kind!=='article'||attempt.target_id!==s.id||attempt.input_sha256!==s.input||attempt.state!=='ended'||attempt.active_started_at!==null||!attempt.started_at||!attempt.ended_at||parse(s.raw.queue).length||parse(s.raw.serial_slot).some((row:Row)=>row.target_kind==='article'&&row.target_id===s.id))fail('原授予或当前尝试已变化、未实际结束或已有后继；不能结清业务认领');
 const granted=canonicalDate(grant.created,'原授予时间'),settled=canonicalDate(entry.created,'原结清记录时间'),ended=canonicalDate(attempt.ended_at,'尝试结束时间');
 if(granted>settled||settled>ended||ended>Date.now())fail('原授予、结清及结束顺序不可核对');
 return {request_key:entry.request_key,attempt_id:entry.attempt_id,grant_request_key:grant.request_key,grant_epoch:grant.epoch,recorded_at:entry.created,evidence:'persisted_original_holder_end_and_actions_settled_attestation',server_verified:false};
}
function endResult(id:unknown,key:unknown,saved:Row,duplicate:boolean){
 const proof=parse(saved.proof_json,'结束回执');
 return {article_id:id,request_key:key,recorded:true,duplicate,ended:true,evidence:'current_holder_task_end_acknowledgement',...(proof.settlement?{settlement:proof.settlement}:{}),existing_results_preserved:true,new_execution_grant:false,new_platform_upload_allowed:false};
}
/** Read-only status projection. No credentials, execution grants or guessed ends. */
export async function articleWordSettlementView(owner:string,id:string,expected?:{input_sha256:string;attempt_id:string;generation:number;recovery_version:number}):Promise<{execution:'ended_settled';main_claim:'settled'|'unsettled_active'|'unsettled_expired'}|null>{
 try{
  const s=await load(owner,id),c=s.control;
  if(!c?.attempt_id)return null;
  if(expected&&(s.input!==expected.input_sha256||c.attempt_id!==expected.attempt_id||c.version!==expected.recovery_version||!parse(s.raw.attempts).some((row:Row)=>row.attempt_id===c.attempt_id&&row.generation===expected.generation)))return null;
  const entries=parse(s.raw.attempt_requests).filter((row:Row)=>row.attempt_id===c.attempt_id&&row.operation==='settle');
  let verified:{settlement:Awaited<ReturnType<typeof settledOriginalHolder>>;entry:Row;proof:Row}|null=null;
  for(const entry of entries){
   const proof=parse(entry.receipt_json),a={settlement_request_key:entry.request_key,execution_id:proof?.execution_id,epoch:proof?.epoch,settled_reference:proof?.settled_reference,end_reference:proof?.terminal_reference};
   try{
    const settlement=await settledOriginalHolder(s,a,proof?.tokenHash??null);
    // More than one applicable immutable settlement is ambiguous, not stronger proof.
    if(verified)return null;verified={settlement,entry,proof};
   }catch(error){if(!(error instanceof ArticleWordRecoveryError))throw error;}
  }
  if(!verified)return null;
  let mainSettled=false;
  for(const end of parse(s.raw.ends)){
   const proof=parse(end.proof_json),selected=proof?.settlement;
   if(end.claim_hash!==s.claimHash||end.input_sha256!==s.input||end.execution_id!==verified.proof.execution_id||end.epoch!==verified.proof.epoch||end.token_hash!==verified.proof.tokenHash||proof?.kind!=='holder_end_receipt'||proof.evidence!=='current_holder_task_end_acknowledgement'||proof.all_actions_stopped!==true||proof.all_actions_settled!==true||proof.confirm_all_actions_settled!==true||proof.execution_id!==end.execution_id||proof.epoch!==end.epoch||proof.input_sha256!==s.input||proof.settled_reference!==verified.proof.settled_reference||proof.end_reference!==verified.proof.terminal_reference||!selected||Object.entries(verified.settlement).some(([key,value])=>selected[key]!==value))continue;
   const a={article_id:id,request_key:end.request_key,execution_id:end.execution_id,epoch:end.epoch,input_sha256:s.input,confirm_all_actions_stopped:true,confirm_all_actions_settled:true,settled_reference:proof.settled_reference,end_reference:proof.end_reference,settlement_request_key:verified.entry.request_key};
   if(end.payload_sha256===await hashText(JSON.stringify(endPayload(a,s.claimHash,end.token_hash)))&&canonicalDate(end.created,'业务结清记录时间')>=Date.parse(verified.entry.created)&&Date.parse(end.created)<=Date.now()&&Date.parse(s.article.claim_expires)<=Date.now()){mainSettled=true;break;}
  }
  const condition=snapshotPredicate(s);await s.origin?.assertFresh();
  if(!await db().prepare(`SELECT 1 AS unchanged WHERE ${condition.sql}`).bind(...condition.binds).first())return null;
  return {execution:'ended_settled',main_claim:mainSettled?'settled':Date.parse(s.article.claim_expires)<=Date.now()?'unsettled_expired':'unsettled_active'};
 }catch(error){if(error instanceof ArticleWordRecoveryError||error instanceof DedaoWordOriginError)return null;throw error;}
}
async function endExecution(owner:string,a:Record<string,unknown>){
 exact(a,['article_id','claim_token','execution_token','execution_id','epoch','input_sha256','request_key','confirm_all_actions_stopped','confirm_all_actions_settled','settled_reference','end_reference','settlement_request_key'],['article_id','claim_token','execution_id','input_sha256','request_key','confirm_all_actions_stopped','confirm_all_actions_settled','settled_reference','end_reference']);
 for(const key of ['article_id','claim_token','execution_id','request_key'])identity(a[key],key);reference(a.end_reference,'结束引用');reference(a.settled_reference,'实际动作结清回执引用');
 if(!sha.test(String(a.input_sha256))||a.confirm_all_actions_stopped!==true||a.confirm_all_actions_settled!==true)fail('必须先停止并结清本执行的全部实际动作，再确认冻结输入');
 if(a.execution_token!==undefined)identity(a.execution_token,'Word执行凭据');if(a.epoch!==undefined&&(!Number.isSafeInteger(a.epoch)||Number(a.epoch)<1))fail('执行epoch无效');
 if(a.settlement_request_key!==undefined)identity(a.settlement_request_key,'原结清请求键');
 const claimHash=await hashText(String(a.claim_token)),tokenHash=a.execution_token===undefined?null:await hashText(String(a.execution_token)),payload=await hashText(JSON.stringify(endPayload(a,claimHash,tokenHash)));
 await evidenceSafe(owner,{article_id:a.article_id,request_key:a.request_key,execution_id:a.execution_id,end_reference:a.end_reference,settled_reference:a.settled_reference,...(a.settlement_request_key===undefined?{}:{settlement_request_key:a.settlement_request_key})},[String(a.claim_token),a.execution_token as string|undefined]);
 const prior=await db().prepare('SELECT * FROM article_word_executor_ends WHERE owner=? AND request_key=?').bind(owner,a.request_key).first<Row>();
 if(prior){
  if(prior.article_id!==a.article_id||prior.payload_sha256!==payload)fail('结束请求键已有不同回执');
  if(a.settlement_request_key!==undefined){
   const s=await load(owner,String(a.article_id));
   if(s.article.claim_token!==a.claim_token||s.input!==a.input_sha256)fail('原claim或冻结输入已变化；历史回执不能结束后继');
   await settledOriginalHolder(s,a,tokenHash);
   const condition=snapshotPredicate(s);await s.origin?.assertFresh();
   if(!await db().prepare(`SELECT 1 AS unchanged WHERE ${manualScope(owner,s.id)} AND ${condition.sql}`).bind(...condition.binds).first())fail('当前原claim、尝试或执行已变化；不重放历史结束');
  }
  return endResult(a.article_id,a.request_key,prior,true);
 }
 const s=await load(owner,String(a.article_id));if(s.article.claim_token!==a.claim_token||s.input!==a.input_sha256)fail('仅原当前claim持有者能结束自己的执行');
 const settlement=a.settlement_request_key===undefined?null:await settledOriginalHolder(s,a,tokenHash);
 if(settlement&&parse(s.raw.ends).some((entry:Row)=>entry.claim_hash===s.claimHash&&entry.input_sha256===s.input&&entry.execution_id===a.execution_id))fail('原执行已有业务结束回执；读取或重放原请求键，不追加新结束');
 if(settlement){/* Already stopped: only the business claim is ended below. */}
 else if(s.control?.execution_id){if(s.control.execution_id!==a.execution_id||s.control.epoch!==a.epoch||!tokenHash||s.control.token_hash!==tokenHash)fail('须原执行的当前Word凭据、epoch与执行身份；过期只准结束');}
 else {
  if(a.execution_token!==undefined||a.epoch!==undefined)fail('未采用执行不得填写并不存在的Word凭据或epoch');
  if(s.control?.token_hash||!parse(s.raw.help).some((entry:Row)=>entry.claim_hash===claimHash&&entry.article_id===s.id&&parse(s.raw.handoffs).some((h:Row)=>h.id===entry.handoff_id&&h.event_id===entry.event_id)))fail('未记录的原执行须有同一原始手工领取回执；未知执行只读');
 }
 await evidenceSafe(owner,s.origin?.provenance??null,[String(a.claim_token),a.execution_token as string|undefined]);
 const condition=snapshotPredicate(s),stamp=now(),proof=JSON.stringify({kind:'holder_end_receipt',evidence:'current_holder_task_end_acknowledgement',execution_id:a.execution_id,epoch:a.epoch??null,input_sha256:s.input,end_reference:a.end_reference,settled_reference:a.settled_reference,all_actions_stopped:true,all_actions_settled:true,confirm_all_actions_settled:true,...(settlement?{settlement}:{}),source_origin:s.origin?.provenance??null,ended_at:stamp});
 const marker=`EXISTS(SELECT 1 FROM article_word_executor_ends e WHERE e.owner=? AND e.article_id=? AND e.request_key=? AND e.payload_sha256=? AND e.lease_fingerprint=?)`;
 const markerBinds=[owner,s.id,a.request_key,payload,s.fingerprint];
 const controlPredicate=s.control?`${expressions(owner,s.id).control} IS ?`:'0';
 await s.origin?.assertFresh();
 const result=await db().batch([
  db().prepare(`INSERT OR IGNORE INTO article_word_executor_ends(${endFields.join(',')}) SELECT ${endFields.map(()=>'?').join(',')} WHERE ${manualScope(owner,s.id)} AND ${condition.sql} AND NOT EXISTS(SELECT 1 FROM article_word_claim_recoveries WHERE owner=? AND old_claim_hash=?)`).bind(owner,s.id,a.request_key,s.input,claimHash,a.execution_id,a.epoch??null,tokenHash,s.fingerprint,proof,payload,stamp,...condition.binds,owner,claimHash),
  db().prepare(`UPDATE articles SET claim_expires=CASE WHEN claim_expires>${clock} THEN ${clock} ELSE claim_expires END WHERE changes()>0 AND owner=? AND id=? AND claim_token=? AND state='processing' AND result_key IS NULL AND ${marker}`).bind(owner,s.id,a.claim_token,...markerBinds),
  ...(!settlement?[
   db().prepare(`UPDATE word_recovery SET version=version+1,epoch=epoch+1,token_hash=NULL,lease_until=NULL,status='await_executor',reason='executor_ended',retry_after=NULL,updated=? WHERE owner=? AND target_kind='article' AND target_id=? AND claim_hash=? AND ${controlPredicate} AND ${marker}`).bind(stamp,owner,s.id,claimHash,...(s.control?[s.raw.control]:[]),...markerBinds),
   db().prepare(`DELETE FROM word_execution_queue WHERE owner=? AND target_kind='article' AND target_id=? AND claim_hash=? AND ${marker}`).bind(owner,s.id,claimHash,...markerBinds)
  ]:[]),
  db().prepare(`INSERT OR IGNORE INTO article_claim_credential_hashes(owner,sha256,created) SELECT ?,?,? WHERE ${marker}`).bind(owner,claimHash,stamp,...markerBinds),
  ...(!settlement?wordVerifiedEndStatements({owner,kind:'article',id:s.id,inputSha256:s.input,claimHash:s.claimHash,executionId:String(a.execution_id),proofSql:marker,proofBinds:markerBinds,state:'ended',reason:'holder_all_actions_settled'}):[])
 ]);
 const saved=await db().prepare('SELECT payload_sha256,proof_json FROM article_word_executor_ends WHERE owner=? AND article_id=? AND request_key=?').bind(owner,s.id,a.request_key).first<Row>();
 if(saved?.payload_sha256!==payload)fail('文章、成果或原执行已变化；未结束，读取同一任务');
 return endResult(s.id,a.request_key,saved!,!result[0].meta.changes);
}
async function terminationProof(s:Snapshot,value:unknown){
 exact(value,['kind','end_request_key','execution_id','thread_id','turn_id','terminal_state','ended_at','observed_at','observation_reference','execution_mapping_reference','original_acquisition_request_key','confirm_all_actions_settled','settled_reference'],['kind']);
 if(value.kind==='holder_end_receipt'){
  exact(value,['kind','end_request_key']);identity(value.end_request_key,'结束回执键');
  const end=parse(s.raw.ends).find((entry:Row)=>entry.request_key===value.end_request_key);
  if(!end||end.claim_hash!==s.claimHash||end.input_sha256!==s.input)fail('结束回执不属于当前原claim与冻结输入');
  const proof=parse(end.proof_json);if(proof.evidence!=='current_holder_task_end_acknowledgement'||proof.all_actions_stopped!==true||proof.all_actions_settled!==true||proof.confirm_all_actions_settled!==true||proof.execution_id!==end.execution_id||proof.input_sha256!==s.input||!Number.isFinite(Date.parse(end.created))||Date.parse(end.created)>Date.now())fail('结束凭证不可核对');
  reference(proof.settled_reference,'原结束动作结清引用');
  if(s.control?.execution_id&&(end.execution_id!==s.control.execution_id||end.epoch===null||s.control.epoch<end.epoch+1||s.control.token_hash!==null))fail('结束回执与当前原执行fence不一致');
  return {kind:'holder_end_receipt',end_request_key:value.end_request_key,execution_id:end.execution_id,ended_at:end.created,evidence:'current_holder_task_end_acknowledgement',all_actions_settled:true,confirm_all_actions_settled:true,source_origin:s.origin?.provenance??null};
 }
 if(value.kind!=='codex_terminal_observation')fail('只接受同claim结束回执或实际Codex终态工具观察');
 exact(value,['kind','execution_id','thread_id','turn_id','terminal_state','ended_at','observed_at','observation_reference','execution_mapping_reference','original_acquisition_request_key','confirm_all_actions_settled','settled_reference'],['kind','execution_id','thread_id','turn_id','terminal_state','ended_at','observed_at','observation_reference','execution_mapping_reference','confirm_all_actions_settled','settled_reference']);
 for(const key of ['execution_id','thread_id','turn_id'])identity(value[key],key);reference(value.observation_reference,'实际终态观察引用');reference(value.execution_mapping_reference,'原领取至执行任务映射引用');reference(value.settled_reference,'实际动作结清回执引用');if(value.confirm_all_actions_settled!==true)fail('必须确认所有外部动作已实际结清');
 if(!['completed','interrupted','failed','ended'].includes(String(value.terminal_state)))fail('active、idle、超时或失联不是原执行终态');
 const ended=canonicalDate(value.ended_at,'实际结束时间'),observed=canonicalDate(value.observed_at,'实际读取时间');
 if(ended>observed||observed>Date.now()||ended<latestRecordedWrite(s))fail('终态证据早于原领取/已记录写入、晚于当前时间或顺序无效');
 const known=s.control?.execution_id;
 if(known){
  if(known!==value.execution_id)fail('终态观察不是当前原执行');
  if(!parse(s.raw.receipts).some((entry:Row)=>entry.input_sha256===s.input&&entry.claim_hash===s.claimHash&&entry.execution_id===known))fail('原执行身份没有属于当前原claim的不可变授予回执；旧终态不能套到恢复后的新claim');
  if(value.original_acquisition_request_key!==undefined)identity(value.original_acquisition_request_key,'原领取键');
 }
 else {
  identity(value.original_acquisition_request_key,'未记录执行的原领取键');
  const original=parse(s.raw.help).find((entry:Row)=>entry.request_key===value.original_acquisition_request_key&&entry.claim_hash===s.claimHash&&entry.article_id===s.id);
  if(!original||!parse(s.raw.handoffs).some((h:Row)=>h.id===original.handoff_id&&h.event_id===original.event_id)||ended<Date.parse(original.created))fail('无可核对原任务映射的旧记录不能恢复；不能用新填UUID代替原执行');
 }
 return {...value,evidence:'authenticated_owner_attested_codex_tool_observation',server_verified:false};
}
function recoveryPayload(a:Record<string,unknown>,nextHash:string){return {article_id:a.article_id,request_key:a.request_key,next_claim_hash:nextHash,expected_fingerprint:a.expected_fingerprint,input_sha256:a.input_sha256,confirm_same_article:a.confirm_same_article,confirm_existing_results_checked:a.confirm_existing_results_checked,confirmation_reference:a.confirmation_reference,termination:a.termination,confirm_original_executor_match:a.confirm_original_executor_match};}
async function recoverExecution(owner:string,a:Record<string,unknown>){
 exact(a,['article_id','request_key','next_claim_token','expected_fingerprint','input_sha256','confirm_same_article','confirm_existing_results_checked','confirmation_reference','termination','confirm_original_executor_match']);
 for(const key of ['article_id','request_key','next_claim_token'])identity(a[key],key);reference(a.confirmation_reference,'原文章与原执行确认引用');
 if(!sha.test(String(a.expected_fingerprint))||!sha.test(String(a.input_sha256))||a.confirm_same_article!==true||a.confirm_existing_results_checked!==true||a.confirm_original_executor_match!==true)fail('须明确确认同文章、既有成果与准确原执行并提供新鲜fingerprint');
 // Validate the nested contract even on a duplicate request. OneOf is enforced here,
 // rather than trusting whichever MCP wrapper happens to advertise the tool.
 const t=a.termination;exact(t,['kind','end_request_key','execution_id','thread_id','turn_id','terminal_state','ended_at','observed_at','observation_reference','execution_mapping_reference','original_acquisition_request_key','confirm_all_actions_settled','settled_reference'],['kind']);
 if(t.kind==='holder_end_receipt'){exact(t,['kind','end_request_key']);identity(t.end_request_key,'结束回执键');}
 else if(t.kind==='codex_terminal_observation'){exact(t,['kind','execution_id','thread_id','turn_id','terminal_state','ended_at','observed_at','observation_reference','execution_mapping_reference','original_acquisition_request_key','confirm_all_actions_settled','settled_reference'],['kind','execution_id','thread_id','turn_id','terminal_state','ended_at','observed_at','observation_reference','execution_mapping_reference','confirm_all_actions_settled','settled_reference']);for(const key of ['execution_id','thread_id','turn_id'])identity(t[key],key);if(!['completed','interrupted','failed','ended'].includes(String(t.terminal_state)))fail('只接受实际终态');reference(t.observation_reference,'终态观察引用');reference(t.execution_mapping_reference,'原领取映射引用');reference(t.settled_reference,'实际动作结清回执引用');if(t.confirm_all_actions_settled!==true)fail('必须确认所有外部动作已实际结清');canonicalDate(t.ended_at,'结束时间');canonicalDate(t.observed_at,'读取时间');if(t.original_acquisition_request_key!==undefined)identity(t.original_acquisition_request_key,'原领取键');}
 else fail('终止凭证种类无效');
 const nextHash=await hashText(String(a.next_claim_token)),payload=await hashText(JSON.stringify(recoveryPayload(a,nextHash))),prior=await recoveryReceipt(owner,String(a.article_id),String(a.request_key));
 if(prior){if(prior.payload_sha256!==payload)fail('同恢复请求键的参数或客户端凭据不同；只回读原回执');return {...await readRecoveryReceipt(owner,String(a.article_id),String(a.request_key)),duplicate:true};}
 const s=await load(owner,String(a.article_id));
 if(s.input!==a.input_sha256||s.fingerprint!==a.expected_fingerprint)fail('原文章、成果或执行已变化；读取新preview并重新核对');
 if(Date.parse(s.article.claim_expires)>Date.now())fail('原主claim仍有效；不能抢占，租约过期也不是终止证明');
 if(nextHash===s.claimHash||await hasWordCredential(owner,a.next_claim_token)||await hasArticleClaimCredential(owner,a.next_claim_token))fail('新主claim凭据须全新，不得复用任何历史执行/claim token');
 const proof={...await terminationProof(s,t),source_origin:s.origin?.provenance??null};
 await evidenceSafe(owner,{article_id:a.article_id,request_key:a.request_key,confirmation_reference:a.confirmation_reference,termination:t,source_origin:s.origin?.provenance??null},[s.article.claim_token,String(a.next_claim_token)]);
 const condition=snapshotPredicate(s),stamp=now(),version=(s.control?.version||0)+1,epoch=(s.control?.epoch||0)+1,binding=s.control?.legacy_output_binding??await legacyBinding(s.article);
 const freshToken=`NOT EXISTS(SELECT 1 FROM article_claim_credential_hashes WHERE owner=? AND sha256=?) AND NOT EXISTS(SELECT 1 FROM articles WHERE owner=? AND claim_token=?) AND NOT EXISTS(SELECT 1 FROM word_execution_receipts WHERE owner=? AND (token_hash=? OR from_token_hash=? OR claim_hash=?)) AND NOT EXISTS(SELECT 1 FROM word_execution_requests WHERE owner=? AND (token_hash=? OR from_token_hash=? OR claim_hash=?)) AND NOT EXISTS(SELECT 1 FROM word_execution_queue WHERE owner=? AND (token_hash=? OR from_token_hash=? OR claim_hash=?)) AND NOT EXISTS(SELECT 1 FROM word_recovery WHERE owner=? AND (token_hash=? OR claim_hash=?)) AND NOT EXISTS(SELECT 1 FROM article_word_executor_ends WHERE owner=? AND (claim_hash=? OR token_hash=?)) AND NOT EXISTS(SELECT 1 FROM local_word_jobs WHERE owner=? AND claim_hash=?) AND NOT EXISTS(SELECT 1 FROM local_word_queue_claims WHERE owner=? AND claim_hash=?) AND NOT EXISTS(SELECT 1 FROM article_word_claim_recoveries WHERE owner=? AND (old_claim_hash=? OR next_claim_hash=?)) AND NOT EXISTS(SELECT 1 FROM word_serial_slots WHERE owner=? AND (claim_hash=? OR token_hash=?)) AND NOT EXISTS(SELECT 1 FROM word_attempt_requests WHERE owner=? AND (json_extract(CASE WHEN json_valid(receipt_json) THEN receipt_json ELSE '{}' END,'$.claimHash')=? OR json_extract(CASE WHEN json_valid(receipt_json) THEN receipt_json ELSE '{}' END,'$.tokenHash')=?))`;
 const freshBinds=[owner,nextHash,owner,a.next_claim_token,owner,nextHash,nextHash,nextHash,owner,nextHash,nextHash,nextHash,owner,nextHash,nextHash,nextHash,owner,nextHash,nextHash,owner,nextHash,nextHash,owner,nextHash,owner,nextHash,owner,nextHash,nextHash,owner,nextHash,nextHash,owner,nextHash,nextHash];
 const marker=`EXISTS(SELECT 1 FROM article_word_claim_recoveries r WHERE r.owner=? AND r.article_id=? AND r.request_key=? AND r.payload_sha256=? AND r.next_claim_hash=?)`,markerBinds=[owner,s.id,a.request_key,payload,nextHash];
 const controlExpr=expressions(owner,s.id).control;
 await s.origin?.assertFresh();
 const results=await db().batch([
  db().prepare(`INSERT OR IGNORE INTO article_word_claim_recoveries(${recoveryFields.join(',')}) SELECT ${recoveryFields.map(()=>'?').join(',')} WHERE ${manualScope(owner,s.id)} AND EXISTS(SELECT 1 FROM articles WHERE owner=? AND id=? AND claim_expires<=${clock}) AND ${condition.sql} AND ${conjunction(freshToken.split(" AND NOT EXISTS").map((part,index)=>index?`NOT EXISTS${part}`:part))}`).bind(owner,s.id,a.request_key,s.input,s.claimHash,nextHash,s.fingerprint,JSON.stringify(proof),a.confirmation_reference,payload,version,epoch,stamp,owner,s.id,...condition.binds,...freshBinds),
  db().prepare(`UPDATE articles SET claim_token=?,claim_expires=strftime('%Y-%m-%dT%H:%M:%fZ','now','+6 hours'),word_claim_origin_hash=? WHERE changes()>0 AND owner=? AND id=? AND claim_token=? AND claim_expires<=${clock} AND state='processing' AND result_key IS NULL AND ${marker}`).bind(a.next_claim_token,nextHash,owner,s.id,s.article.claim_token,...markerBinds),
  ...(s.control?[db().prepare(`UPDATE word_recovery SET claim_hash=?,version=version+1,epoch=epoch+1,token_hash=NULL,lease_until=NULL,status='await_executor',reason='claim_recovered',retry_after=NULL,updated=? WHERE owner=? AND target_kind='article' AND target_id=? AND ${controlExpr} IS ? AND ${marker} AND EXISTS(SELECT 1 FROM articles WHERE owner=? AND id=? AND claim_token=? AND claim_expires>${clock})`).bind(nextHash,stamp,owner,s.id,s.raw.control,...markerBinds,owner,s.id,a.next_claim_token)]:[db().prepare(`INSERT OR IGNORE INTO word_recovery(owner,target_kind,target_id,input_sha256,claim_hash,version,epoch,desired,status,reason,retry_count,execution_scope,legacy_output_binding,updated) SELECT ?,'article',?,?,?,1,1,'run','await_executor','claim_recovered',0,'heavy',?,? WHERE ${marker} AND EXISTS(SELECT 1 FROM articles WHERE owner=? AND id=? AND claim_token=? AND claim_expires>${clock}) AND ${controlExpr} IS ?`).bind(owner,s.id,s.input,nextHash,binding,stamp,...markerBinds,owner,s.id,a.next_claim_token,s.raw.control)]),
  db().prepare(`DELETE FROM word_execution_queue WHERE owner=? AND target_kind='article' AND target_id=? AND claim_hash=? AND ${marker} AND EXISTS(SELECT 1 FROM articles WHERE owner=? AND id=? AND claim_token=?)`).bind(owner,s.id,s.claimHash,...markerBinds,owner,s.id,a.next_claim_token),
  db().prepare(`INSERT OR IGNORE INTO article_claim_credential_hashes(owner,sha256,created) SELECT ?,?,? WHERE ${marker}`).bind(owner,s.claimHash,stamp,...markerBinds),
  db().prepare(`INSERT OR IGNORE INTO article_claim_credential_hashes(owner,sha256,created) SELECT ?,?,? WHERE ${marker}`).bind(owner,nextHash,stamp,...markerBinds),
  ...wordVerifiedEndStatements({owner,kind:'article',id:s.id,inputSha256:s.input,claimHash:s.claimHash,executionId:String(proof.execution_id),proofSql:marker,proofBinds:markerBinds,state:'ended',reason:'recovery_all_actions_settled'})
 ]);
 const saved=await recoveryReceipt(owner,s.id,String(a.request_key));if(saved?.payload_sha256!==payload)fail('原文章、结束证据或并发恢复已变化；只回读同一请求，不换key抢占');
 // Final fresh read is evidence of this claim rotation only. It is never subordinate
 // Word execution permission, and unknown callers must retain their own next token.
 return {...await readRecoveryReceipt(owner,s.id,String(a.request_key)),duplicate:!results[0].meta.changes,claim_rotated:!!results[0].meta.changes,subordinate_execution_required:true};
}
export async function articleWordRecoveryCall(owner:string,name:string,a:Record<string,unknown>){
 if(name==='end_article_word_execution')return endExecution(owner,a);
 if(name==='recover_article_word_execution')return recoverExecution(owner,a);
 if(name==='preview_article_word_recovery'){exact(a,['article_id']);identity(a.article_id,'文章身份');return preview(await load(owner,a.article_id));}
 if(name==='read_article_word_recovery_receipt'){exact(a,['article_id','request_key']);identity(a.article_id,'文章身份');identity(a.request_key,'恢复回执键');return readRecoveryReceipt(owner,a.article_id,a.request_key);}
 fail('未知人工配图恢复操作');
}
