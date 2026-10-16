import {env} from 'cloudflare:workers';
import {db} from './test-store';
import {hashText,publicSourceUrl} from './writing-input';
import type {WordTarget} from './word-progress-contract';
import type {ArtifactManifest} from './article-manifest';
import {assertArticleProcessingAllowed} from './article-output-mode';
import {assertWordCredentialFree,redactWordCredentialText} from './word-credentials';
import {wordAttemptView,wordAttemptSelectionSql,currentWordAttemptId,wordSerialCapacitySql,wordAttemptWriteSql,wordGrantAttemptStatements,requestWordAttemptStop,enforceWordAttemptDeadline,wordUnstartedClaimKnownSql} from './word-attempts';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest=/^[a-f0-9]{64}$/;
const now=()=>new Date().toISOString();
const clock="strftime('%Y-%m-%dT%H:%M:%fZ','now')";
export const wordWriteNames=new Set(['record_article_images','begin_article_output','put_article_output_chunk','finalize_article_output','record_local_word_images','begin_local_word_output','put_local_word_output_chunk','finalize_local_word_output','fail_local_word_job']);
export class WordRecoveryError extends Error {}
function fail(message:string):never{throw new WordRecoveryError(message);}
function parse(raw:string|null){return raw?JSON.parse(raw):null;}
function automaticFence(kind:WordTarget,alias='articles'){return kind==='article'?" AND NOT EXISTS(SELECT 1 FROM writing_runs w WHERE w.owner=articles.owner AND w.article_id=articles.id) AND NOT EXISTS(SELECT 1 FROM editorial_runs_v3 e WHERE e.owner=articles.owner AND e.article_id=articles.id) AND NOT EXISTS(SELECT 1 FROM editorial_flows f WHERE f.owner=articles.owner AND f.article_id=articles.id)".replaceAll('articles.',alias+'.'):` AND ${alias==='articles'?'':alias+'.'}source_kind='local_desktop' AND ${alias==='articles'?'':alias+'.'}output_mode='word_only' AND ${alias==='articles'?'':alias+'.'}destinations_json='[]'`;}
function exact(a:Record<string,unknown>,keys:string[]){if(!a||Array.isArray(a)||Object.keys(a).some(k=>!keys.includes(k)))fail('恢复参数无效');}
async function row(owner:string,kind:WordTarget,id:string){
 if(!owner||!['article','local_word'].includes(kind)||!(kind==='article'?uuid.test(id):id.startsWith('localword_')&&uuid.test(id.slice(10))))fail('任务范围无效');
 const r:any=await db().prepare(`SELECT * FROM ${kind==='article'?'articles':'local_word_jobs'} WHERE owner=? AND id=?`).bind(owner,id).first();
 if(!r||r.state==='deleting'||(kind==='local_word'&&(r.source_kind!=='local_desktop'||r.output_mode!=='word_only'||r.destinations_json!=='[]'))||(kind==='article'&&parse(r.artifact_manifest)?.output_mode==='text_only'))fail('没有找到本人的配图 Word 任务');
 return r;
}
async function input(kind:WordTarget,r:any){const value=kind==='article'?await hashText(JSON.stringify(JSON.parse(r.paragraphs))):await hashText(r.input_json);if(kind==='local_word'&&value!==r.input_sha256)fail('冻结输入不一致');return value;}
async function live(owner:string,kind:WordTarget,id:string,token:unknown,sha:unknown){
 const r=await row(owner,kind,id);if(kind==='article')await assertArticleProcessingAllowed(owner,r);if(typeof token!=='string'||!uuid.test(token)||!digest.test(String(sha))||r.state!=='processing'||r.result_key||!r.claim_expires||Date.parse(r.claim_expires)<=Date.now()||(kind==='article'?r.claim_token!==token:r.claim_hash!==await hashText(token))||await input(kind,r)!==sha)fail('认领或冻结输入已失效；读取同一任务，不重新制作');return r;
}
export type WordResource='prepare'|'heavy';
type Control={attempt_id:string|null;execution_scope:WordResource;queue_revision:number;owner:string;target_kind:WordTarget;target_id:string;input_sha256:string;claim_hash:string;version:number;epoch:number;desired:string;execution_id:string|null;token_hash:string|null;lease_until:string|null;heartbeat_at:string|null;status:string;reason:string;retry_count:number;retry_after:string|null;minimum_images:number|null;legacy_output_binding:string|null};
async function control(owner:string,kind:WordTarget,id:string){return db().prepare('SELECT * FROM word_recovery WHERE owner=? AND target_kind=? AND target_id=?').bind(owner,kind,id).first<Control>();}
function verifiedPixels(value:any){return value?.pixel_decode_verified===true&&value.decode_version===1&&value.format==='png'&&Number.isSafeInteger(value.width)&&value.width>0&&Number.isSafeInteger(value.height)&&value.height>0;}
export async function wordRecoveryAdopted(owner:string,kind:WordTarget,id:string){return !!await control(owner,kind,id);}
export async function checkpointImageCount(owner:string,kind:WordTarget,id:string,images:{sha256:string}[]){
 const c=await control(owner,kind,id);if(!c)return null;
 const cached=await db().prepare(`SELECT sha256,verification_json FROM word_checkpoints WHERE owner=? AND target_kind=? AND target_id=? AND input_sha256=? AND kind='image' AND state='ready' AND ${wordAttemptSelectionSql(owner,kind,id)} LIMIT 31`).bind(owner,kind,id,c.input_sha256).all<any>();
 const verified=new Set(cached.results.filter(x=>verifiedPixels(parse(x.verification_json))).map(x=>x.sha256));
 return new Set(images.filter(x=>verified.has(x.sha256)).map(x=>x.sha256)).size;
}
export async function currentWordExecutionId(owner:string,kind:WordTarget,id:string){return (await control(owner,kind,id))?.execution_id||null;}
// Only the first adoption may bind a previously declared native output. Store
// hashes, never copy historical free text or credential-shaped identifiers.
async function legacyOutputBinding(kind:WordTarget,r:any){
 const m=parse(kind==='article'?r.result_meta:r.output_meta);
 if(!m||!uuid.test(String(m.output_id))||!digest.test(String(m.sha256))||!Number.isSafeInteger(m.size)||m.size<1||m.size>20971520||!Number.isSafeInteger(m.chunks)||m.chunks<1||m.chunks>400||!Array.isArray(m.parts)||m.parts.length>m.chunks)return null;
 return JSON.stringify({contract_version:1,output_id_sha256:await hashText(m.output_id),sha256:m.sha256,size:m.size,chunks:m.chunks,manifest_sha256:await hashText(JSON.stringify(r.artifact_manifest??null)),prefix_chunks:m.parts.length,prefix_sha256:await hashText(JSON.stringify(m.parts))});
}
export async function requireNativeFinalizeImages(owner:string,kind:WordTarget,id:string,r:any){
 const c=await control(owner,kind,id);if(!c)return null;
 // Verify exactly the server snapshot used to assemble bytes and final CAS.
 // A second row read here could mix two snapshots during an ABA race.
 if(!r||r.owner!==owner||r.id!==id)fail('已有 Word 续接范围不匹配');
 const m=parse(kind==='article'?r.result_meta:r.output_meta);
 if(c.legacy_output_binding!=null){
  let binding:any;try{binding=parse(c.legacy_output_binding);}catch{fail('已有 Word 续接绑定不可核对；读取原任务');}
  if(!binding||typeof binding!=='object'||Array.isArray(binding)||binding.contract_version!==1||!Number.isSafeInteger(binding.prefix_chunks)||binding.prefix_chunks<0||binding.prefix_chunks>binding.chunks||!digest.test(String(binding.prefix_sha256))||!digest.test(String(binding.manifest_sha256))||!m||await input(kind,r)!==c.input_sha256||await hashText(String(m.output_id))!==binding.output_id_sha256||m.sha256!==binding.sha256||m.size!==binding.size||m.chunks!==binding.chunks||await hashText(JSON.stringify(r.artifact_manifest??null))!==binding.manifest_sha256||!Array.isArray(m.parts)||m.parts.length<binding.prefix_chunks||await hashText(JSON.stringify(m.parts.slice(0,binding.prefix_chunks)))!==binding.prefix_sha256)fail('已有 Word 续接绑定已变化；读取原任务，不替换原成品');
  // The original native text, whole-file SHA and manifest checks still run.
  // This proves no new image decode, search or page-inspection history.
  return {contract:'legacy_declared_output_v1' as const,pixel_history:'unrecorded' as const};
 }
 await requireCheckpointImages(owner,kind,id,parse(r.artifact_manifest)?.layout?.images);return null;
}

export async function verifyCheckpointPixels(owner:string,kind:WordTarget,id:string,images:{sha256:string;width:number;height:number;after_paragraph:number}[]){
 if(!await control(owner,kind,id))return;for(const image of images){const cp:any=await db().prepare(`SELECT verification_json,metadata_json FROM word_checkpoints WHERE owner=? AND target_kind=? AND target_id=? AND kind='image' AND sha256=? AND state='ready' AND ${wordAttemptSelectionSql(owner,kind,id)} LIMIT 1`).bind(owner,kind,id,image.sha256).first();const v=cp&&parse(cp.verification_json),m=cp&&parse(cp.metadata_json);if(!verifiedPixels(v)||v.width!==image.width||v.height!==image.height||m.after_paragraph!==image.after_paragraph)fail('像素观察须匹配已核验的真实图片字节');}
}
function sqlText(value:string){return `CAST(X'${Array.from(new TextEncoder().encode(value)).map(n=>n.toString(16).padStart(2,'0')).join('')}' AS TEXT)`;}
function sqlValue(value:string|number|null){return value===null?'NULL':typeof value==='number'?String(value):sqlText(value);}
type ExecutionQueue={capacity_reason?:'total_capacity'|'heavy_capacity';owner:string;request_key:string;target_kind:WordTarget;target_id:string;input_sha256:string;claim_hash:string;token_hash:string;execution_id:string;execution_scope:WordResource;operation:'acquire'|'transition';from_epoch:number|null;from_version:number|null;from_token_hash:string|null;created:string};
async function executionQueue(owner:string,kind:WordTarget,id:string){return db().prepare('SELECT * FROM word_execution_queue WHERE owner=? AND target_kind=? AND target_id=?').bind(owner,kind,id).first<ExecutionQueue>();}
async function applicableQueue(owner:string,kind:WordTarget,id:string,r:any,c:Control|null,provided?:ExecutionQueue|null){
 const q=provided===undefined?await executionQueue(owner,kind,id):provided;if(!q||!c||c.desired!=='run'||c.status==='blocked'||c.input_sha256!==q.input_sha256||c.claim_hash!==q.claim_hash||r.state!=='processing'||r.result_key||!r.claim_expires||Date.parse(r.claim_expires)<=Date.now()||await input(kind,r)!==q.input_sha256||(kind==='article'?await hashText(r.claim_token||''):r.claim_hash)!==q.claim_hash)return null;
 if(q.operation==='transition'&&(c.epoch!==q.from_epoch||c.version!==q.from_version||c.token_hash!==q.from_token_hash||c.execution_id!==q.execution_id||c.status!=='running'||!c.lease_until||Date.parse(c.lease_until)<=Date.now()))return null;
 if(q.operation==='acquire'&&c.token_hash&&c.lease_until&&Date.parse(c.lease_until)>Date.now())return null;
 return q;
}
// Count only actual active leases, across both business kinds. Excluding this one
// target permits an atomic scope conversion without double-counting its lease.
function capacity(owner:string,scope:WordResource,kind:WordTarget,id:string,executionId?:string){
 const active=`owner=${sqlText(owner)} AND NOT(target_kind=${sqlText(kind)} AND target_id=${sqlText(id)}) AND token_hash IS NOT NULL AND desired='run' AND status='running' AND lease_until>${clock} AND ((target_kind='article' AND EXISTS(SELECT 1 FROM articles a WHERE a.owner=word_recovery.owner AND a.id=word_recovery.target_id AND a.state='processing' AND a.result_key IS NULL AND a.claim_expires>${clock})) OR (target_kind='local_word' AND EXISTS(SELECT 1 FROM local_word_jobs j WHERE j.owner=word_recovery.owner AND j.id=word_recovery.target_id AND j.state='processing' AND j.result_key IS NULL AND j.claim_expires>${clock})))`;
 return `${wordSerialCapacitySql(owner,kind,id,executionId)} AND (SELECT COUNT(*) FROM word_recovery WHERE ${active})<7${scope==='heavy'?` AND (SELECT COUNT(*) FROM word_recovery WHERE ${active} AND execution_scope='heavy')<2`:''}`;
}
const queueKeys=['owner','request_key','target_kind','target_id','input_sha256','claim_hash','token_hash','execution_id','execution_scope','operation','from_epoch','from_version','from_token_hash'] as const;
function queueIdentity(q:ExecutionQueue){return queueKeys.map(k=>`${k} IS ${sqlValue(q[k])}`).join(' AND ');}
function queuePermitted(q:ExecutionQueue){return `NOT EXISTS(SELECT 1 FROM word_execution_queue WHERE owner=${sqlText(q.owner)} AND (request_key=${sqlText(q.request_key)} OR token_hash=${sqlText(q.token_hash)} OR (target_kind=${sqlText(q.target_kind)} AND target_id=${sqlText(q.target_id)})) AND NOT(${queueIdentity(q)}))`;}
function freshExecution(q:ExecutionQueue){
 const ended=q.target_kind==='article'?` AND NOT EXISTS(SELECT 1 FROM article_word_executor_ends WHERE owner=${sqlText(q.owner)} AND article_id=${sqlText(q.target_id)} AND execution_id=${sqlText(q.execution_id)}) AND NOT EXISTS(SELECT 1 FROM article_word_claim_recoveries WHERE owner=${sqlText(q.owner)} AND article_id=${sqlText(q.target_id)} AND json_extract(termination_json,'$.execution_id')=${sqlText(q.execution_id)})`:'';
 return `NOT EXISTS(SELECT 1 FROM word_attempt_requests WHERE owner=${sqlText(q.owner)} AND target_kind=${sqlText(q.target_kind)} AND target_id=${sqlText(q.target_id)} AND operation='settle' AND json_extract(receipt_json,'$.execution_id')=${sqlText(q.execution_id)}) AND NOT EXISTS(SELECT 1 FROM word_execution_receipts WHERE owner=${sqlText(q.owner)} AND (request_key=${sqlText(q.request_key)} OR token_hash=${sqlText(q.token_hash)})) AND NOT EXISTS(SELECT 1 FROM word_execution_requests WHERE owner=${sqlText(q.owner)} AND (request_key=${sqlText(q.request_key)} OR token_hash=${sqlText(q.token_hash)}) AND NOT((${queueIdentity(q)}) AND EXISTS(SELECT 1 FROM word_execution_queue WHERE ${queueIdentity(q)}))) AND ${queuePermitted(q)}${ended}`;
}
function queueReason(q:ExecutionQueue|null){return q?.capacity_reason||null;}
export async function wordRecoveryView(owner:string,kind:WordTarget,id:string){
 const r=await row(owner,kind,id),c=await db().prepare(`SELECT c.*,CASE WHEN q.owner IS NULL THEN NULL ELSE json_object(${[...queueKeys,'capacity_reason','created'].map(k=>`'${k}',q.${k}`).join(',')}) END AS queue_snapshot FROM word_recovery c LEFT JOIN word_execution_queue q ON q.owner=c.owner AND q.target_kind=c.target_kind AND q.target_id=c.target_id WHERE c.owner=? AND c.target_kind=? AND c.target_id=?`).bind(owner,kind,id).first<Control&{queue_snapshot:string|null}>();
 if(!c)return null;
 const complete=!!r.result_key,liveClaim=r.state==='processing'&&!!r.claim_expires&&Date.parse(r.claim_expires)>Date.now()&&(kind==='article'?await hashText(r.claim_token||'')===c.claim_hash:r.claim_hash===c.claim_hash)&&await input(kind,r)===c.input_sha256;
 const active=liveClaim&&c.desired==='run'&&!!c.token_hash&&!!c.lease_until&&Date.parse(c.lease_until)>Date.now()&&c.status==='running';
 const q=complete?null:await applicableQueue(owner,kind,id,r,c,parse(c.queue_snapshot));
 const attempt=await wordAttemptView(owner,kind,id),stopPending=!!attempt&&['stop_requested','waiting_safe_stop'].includes(attempt.state);
 const incident=complete?null:await db().prepare("SELECT reason FROM word_service_incidents WHERE owner=? AND reason IN ('http_403','login_required','captcha') AND state<>'resolved' ORDER BY last_seen DESC LIMIT 1").bind(owner).first<{reason:string}>();
 const unknownUnstarted=!c.attempt_id&&!complete&&r.state==='processing'&&!!(kind==='article'?r.claim_token:r.claim_hash)&&!await db().prepare(`SELECT 1 FROM ${kind==='article'?'articles':'local_word_jobs'} a WHERE a.owner=? AND a.id=? AND ${wordUnstartedClaimKnownSql(kind)}`).bind(owner,id).first();
 const unresolvedLegacy=unknownUnstarted||!c.attempt_id&&!!c.execution_id&&!active&&!!await db().prepare(`SELECT 1 FROM word_execution_receipts g WHERE owner=? AND target_kind=? AND target_id=? AND claim_hash=? AND execution_id=? ${kind==='article'?"AND NOT EXISTS(SELECT 1 FROM article_word_executor_ends x WHERE x.owner=g.owner AND x.article_id=g.target_id AND x.claim_hash=g.claim_hash AND x.execution_id=g.execution_id AND json_extract(x.proof_json,'$.confirm_all_actions_settled')=1)":''}`).bind(owner,kind,id,c.claim_hash,c.execution_id).first();
 return {version:c.version,epoch:c.epoch,desired:c.desired,status:complete?'saved':stopPending||unresolvedLegacy?'waiting_safe_stop':c.desired==='paused'?'paused':c.desired==='cancelled'?'cancelled':incident?'blocked':active?'running':c.status==='blocked'?'blocked':c.status==='backoff'&&c.retry_after&&Date.parse(c.retry_after)>Date.now()?'backoff':q?'queued':'await_executor',reason:incident?incident.reason:c.status==='blocked'?c.reason:stopPending?attempt!.reason:unresolvedLegacy?'legacy_executor_end_unconfirmed':c.reason,attempt,serial_mode:true,safety_stop_pending:stopPending||unresolvedLegacy,resource_class:c.execution_scope||'heavy',queue_revision:c.queue_revision,queue_reason:queueReason(q),heartbeat_at:c.heartbeat_at,heartbeat_overdue:!!c.heartbeat_at&&Date.now()-Date.parse(c.heartbeat_at)>120000,retry_count:c.retry_count,retry_after:c.retry_after,execution_confirmed:active&&!incident&&!!c.heartbeat_at,automatic_dispatch_available:false,legacy_declared_output:!!c.legacy_output_binding};
}
async function receiptRead(owner:string,kind:WordTarget,id:string,key:string){
 const r=await row(owner,kind,id),sha=await input(kind,r),table=kind==='article'?'articles':'local_word_jobs',source=kind==='article'?'paragraphs':'input_json';
 const receipt:any=await db().prepare('SELECT * FROM word_execution_receipts WHERE owner=? AND request_key=? AND target_kind=? AND target_id=?').bind(owner,key,kind,id).first();
 if(!receipt){const c=await control(owner,kind,id),q=await applicableQueue(owner,kind,id,r,c),queued=!!q&&q.request_key===key,history=await db().prepare('SELECT execution_scope,operation FROM word_execution_requests WHERE owner=? AND target_kind=? AND target_id=? AND request_key=?').bind(owner,kind,id,key).first<ExecutionQueue>();return {recorded:false,epoch:null,applicable:false,queued,request_state:queued?'queued':history?'expired':'not_recorded',resource_class:queued?q!.execution_scope:history?.execution_scope||null,operation:queued?q!.operation:history?.operation||null,queue_reason:queued?queueReason(q):null,new_execution_grant:false};}
 const valid=await db().prepare(`SELECT 1 FROM word_execution_receipts e JOIN word_recovery c ON c.owner=e.owner AND c.target_kind=e.target_kind AND c.target_id=e.target_id JOIN ${table} a ON a.owner=e.owner AND a.id=e.target_id WHERE e.owner=? AND e.request_key=? AND e.target_kind=? AND e.target_id=? AND e.input_sha256=? AND c.input_sha256=e.input_sha256 AND c.epoch=e.epoch AND c.token_hash=e.token_hash AND c.claim_hash=e.claim_hash AND c.execution_scope=e.execution_scope AND c.desired='run' AND c.status='running' AND c.lease_until>${clock} AND a.state='processing' AND a.result_key IS NULL AND a.claim_expires>${clock} AND a.${source}=? AND a.${kind==='article'?'claim_token':'claim_hash'}=? ${automaticFence(kind,'a')} AND (c.attempt_id IS NULL OR EXISTS(SELECT 1 FROM word_serial_slots s JOIN word_attempts t ON t.owner=s.owner AND t.target_kind=s.target_kind AND t.target_id=s.target_id AND t.attempt_id=s.attempt_id WHERE s.owner=c.owner AND s.target_kind=c.target_kind AND s.target_id=c.target_id AND s.attempt_id=c.attempt_id AND s.claim_hash=c.claim_hash AND s.execution_id=c.execution_id AND s.token_hash=c.token_hash AND s.epoch=c.epoch AND s.state='held' AND t.state='running'))`).bind(owner,key,kind,id,sha,r[source],kind==='article'?r.claim_token:r.claim_hash).first();
 const sameClaim=kind==='article'?await hashText(r.claim_token||'')===receipt.claim_hash:r.claim_hash===receipt.claim_hash;
 return {recorded:true,epoch:receipt.epoch,applicable:!!valid&&sameClaim,queued:false,request_state:valid&&sameClaim?'granted':'expired',resource_class:receipt.execution_scope||'heavy',operation:receipt.operation||'acquire',queue_reason:null,new_execution_grant:false};
}
// The returned predicate is used inside each actual CAS after asynchronous R2 I/O.
// Values interpolated below are derived hashes or validated UUIDs, never input SQL.
export async function wordWriteFence(owner:string,kind:WordTarget,id:string,claim:unknown,execution:unknown,requiredResource:WordResource='heavy'){
 if(!['prepare','heavy'].includes(requiredResource))fail('Word 资源范围无效');
 if(typeof claim!=='string'||!uuid.test(claim))fail('Word 认领凭据无效');
 const r=await row(owner,kind,id);
 const c=await control(owner,kind,id),hash=typeof execution==='string'&&uuid.test(execution)?await hashText(execution):'';
 if(!c)fail('先取得同一任务实际 Word 执行位；主 claim 或首次认领来源记录不授予配图写入');
 if(!c.attempt_id)fail('原执行的实际配图计时和安全结束尚未核实；不能用未授予的控制记录写入');
 if(c&&requiredResource==='heavy'&&c.execution_scope!=='heavy')fail('当前仅有配图准备权限；等待 Word 处理位');
 if(c){const r=await live(owner,kind,id,claim,c.input_sha256);if(c.claim_hash!==await hashText(String(claim))||c.desired!=='run'||c.token_hash!==hash||!c.lease_until||Date.parse(c.lease_until)<=Date.now()||c.status!=='running'||await input(kind,r)!==c.input_sha256)fail('Word 执行租约已失效或已暂停；读取同一任务');}
 if(c?.attempt_id&&!await enforceWordAttemptDeadline(owner,kind,id))fail('本次配图等待安全停止；不再写入或启动新执行');
 const claimHash=await hashText(String(claim));
 const ownerHex=Array.from(new TextEncoder().encode(owner)).map(n=>n.toString(16).padStart(2,'0')).join('');
 const key=`owner=CAST(X'${ownerHex}' AS TEXT) AND target_kind='${kind}' AND target_id='${id}'`;
 const source=kind==='article'?'paragraphs':'input_json',hex=Array.from(new TextEncoder().encode(r[source])).map(n=>n.toString(16).padStart(2,'0')).join('');
 return ` AND ${kind==='article'?`claim_token='${claim}'`:`claim_hash='${claimHash}'`} AND claim_expires>${clock} AND ${source}=CAST(X'${hex}' AS TEXT) ${automaticFence(kind)} AND EXISTS(SELECT 1 FROM word_recovery WHERE ${key} AND version=${c.version} AND epoch=${c.epoch} AND claim_hash='${claimHash}' AND token_hash='${hash}' AND desired='run' AND status='running' AND lease_until>${clock} AND execution_scope ${requiredResource==='heavy'?"='heavy'":"IN ('prepare','heavy')"})${wordAttemptWriteSql(owner,kind,id,claimHash,hash,c.epoch)}`;
}
// Idempotent/cached responses are permissions reads too. Re-check the actual
// database clock and captured owner/input/claim/scope/version/epoch immediately
// before acknowledging; asynchronous validation must not retain an old lease.
export async function assertCurrentWordWritePermission(owner:string,kind:WordTarget,id:string,claim:unknown,execution:unknown,requiredResource:WordResource='heavy'){
 const fence=await wordWriteFence(owner,kind,id,claim,execution,requiredResource),table=kind==='article'?'articles':'local_word_jobs';
 const valid=await db().prepare(`SELECT 1 FROM ${table} WHERE owner=? AND id=? AND state='processing' AND result_key IS NULL ${fence}`).bind(owner,id).first();
 if(!valid)fail('Word 执行权限已变化；读取同一任务');
}
export async function setWordIntent(owner:string,a:Record<string,unknown>){
 exact(a,['target_kind','target_id','input_sha256','expected_version','intent']);const kind=a.target_kind as WordTarget,id=String(a.target_id),r=await row(owner,kind,id),sha=await input(kind,r);
 if(kind==='article')await assertArticleProcessingAllowed(owner,r);
 if(r.result_key||r.state!=='processing')fail('已完成或非处理中的任务只读');
 if(a.input_sha256!==sha||!['paused','run','cancelled'].includes(String(a.intent))||!Number.isSafeInteger(a.expected_version))fail('任务输入或控制版本无效');
 const claimHash=kind==='article'?await hashText(r.claim_token||''):r.claim_hash||await hashText('');
 // Pausing a legacy executor blocks every subsequent Word CAS too. It does not
 // revoke a platform permit, assert that a launched external action was undone,
 // or change the business claim. Continue always awaits a new Word-only lease.
 const c=await control(owner,kind,id),pending=await executionQueue(owner,kind,id);
 const table=kind==='article'?'articles':'local_word_jobs',source=kind==='article'?'paragraphs':'input_json',raw=r[source],outputField=kind==='article'?'result_meta':'output_meta',claimField=kind==='article'?'claim_token':'claim_hash';
 if(!c&&a.expected_version===0){const legacyBinding=await legacyOutputBinding(kind,r);await db().prepare(`INSERT OR IGNORE INTO word_recovery(owner,target_kind,target_id,input_sha256,claim_hash,version,epoch,desired,status,reason,retry_count,legacy_output_binding,updated) SELECT ?,?,?,?,?,1,1,?,'await_executor','user_intent',0,?,? WHERE EXISTS(SELECT 1 FROM ${table} WHERE owner=? AND id=? AND ${source}=? AND ${claimField} IS ? AND ${outputField} IS ? AND artifact_manifest IS ? AND state='processing' AND result_key IS NULL ${automaticFence(kind)})`).bind(owner,kind,id,sha,claimHash,a.intent,legacyBinding,now(),owner,id,raw,r[claimField],r[outputField],r.artifact_manifest).run();}
 else if(c){const changed=await db().prepare(`UPDATE word_recovery SET desired=?,version=version+1,epoch=epoch+1,token_hash=NULL,lease_until=NULL,status='await_executor',reason='user_intent',updated=? WHERE owner=? AND target_kind=? AND target_id=? AND version=? AND input_sha256=? AND EXISTS(SELECT 1 FROM ${table} WHERE owner=? AND id=? AND ${source}=? AND state='processing' AND result_key IS NULL ${automaticFence(kind)})`).bind(a.intent,now(),owner,kind,id,a.expected_version,sha,owner,id,raw).run();if(!changed.meta.changes)fail('控制状态已变化；读取同一任务');}
 if(pending)await db().prepare('DELETE FROM word_execution_queue WHERE owner=? AND target_kind=? AND target_id=? AND request_key=?').bind(owner,kind,id,pending.request_key).run();
 if(a.intent==='paused'||a.intent==='cancelled')await requestWordAttemptStop(owner,kind,id,a.intent==='paused'?'pause':'cancel');
 const saved=await control(owner,kind,id);if(!saved||saved.desired!==a.intent||saved.input_sha256!==sha)fail('暂停或继续结果待核对；读取同一任务');return {recovery:await wordRecoveryView(owner,kind,id),external_actions_revoked:false};
}
export async function wordRecoveryCall(owner:string,name:string,a:Record<string,unknown>){
 const kind=a.target_kind as WordTarget,id=String(a.target_id),base=['target_kind','target_id'];
 if(name==='read_word_execution_receipt'){exact(a,[...base,'request_key']);if(typeof a.request_key!=='string'||!uuid.test(a.request_key))fail('回执键无效');return receiptRead(owner,kind,id,a.request_key);}
 if(name==='read_word_recovery'){exact(a,base);const businessRow=await row(owner,kind,id);const assets=await db().prepare('SELECT asset_id,kind,sha256,size,chunks,parts_json,metadata_json,verification_json,state FROM word_checkpoints WHERE owner=? AND target_kind=? AND target_id=? AND '+wordAttemptSelectionSql(owner,kind,id)+' ORDER BY asset_id LIMIT 40').bind(owner,kind,id).all<any>();const candidates=await db().prepare('SELECT candidate_id,source_url,source_title,outcome,reason,replacement_for,asset_id FROM word_image_candidates WHERE owner=? AND target_kind=? AND target_id=? AND '+wordAttemptSelectionSql(owner,kind,id)+' ORDER BY created LIMIT 200').bind(owner,kind,id).all();const incidents=await db().prepare('SELECT dependency,reason,state,last_seen FROM word_service_incidents WHERE owner=? ORDER BY last_seen DESC LIMIT 12').bind(owner).all();const c=await control(owner,kind,id),readyImages=new Set(assets.results.filter(x=>x.kind==='image'&&x.state==='ready'&&verifiedPixels(parse(x.verification_json))).map(x=>x.sha256)).size;const texts=await redactWordCredentialText(owner,assets.results.map(x=>parse(x.metadata_json)),[businessRow.claim_token]);const identity=await redactWordCredentialText(owner,assets.results.map(x=>({asset_id:x.asset_id})),[businessRow.claim_token]);const candidateText=await redactWordCredentialText(owner,candidates.results.map((x:any)=>({source_url:x.source_url,source_title:x.source_title})),[businessRow.claim_token]);const candidateIds=await redactWordCredentialText(owner,candidates.results.map((x:any)=>({candidate_id:x.candidate_id,replacement_for:x.replacement_for,asset_id:x.asset_id})),[businessRow.claim_token]);return {recovery:await wordRecoveryView(owner,kind,id),checkpoints:assets.results.map((x,index)=>({...x,asset_id:identity[index].asset_id===x.asset_id?x.asset_id:undefined,identity_withheld:identity[index].asset_id!==x.asset_id,parts_json:undefined,metadata_json:undefined,verification_json:undefined,metadata:texts[index],verification:parse(x.verification_json),needs_pixel_verification:x.kind==='image'&&x.state==='ready'&&!verifiedPixels(parse(x.verification_json)),parts:parse(x.parts_json).map((p:any,index:number)=>({index,size:p.size,sha256:p.sha256})),next_index:parse(x.parts_json).length})),image_candidates:candidates.results.map((x:any,index)=>{const safe=JSON.stringify(candidateIds[index])===JSON.stringify({candidate_id:x.candidate_id,replacement_for:x.replacement_for,asset_id:x.asset_id});return {...x,...candidateText[index],candidate_id:safe?x.candidate_id:undefined,replacement_for:safe?x.replacement_for:undefined,asset_id:safe?x.asset_id:undefined,identity_withheld:!safe};}),image_checkpoint_profile:{format:'png',bit_depth:8,color_types:['RGB','RGBA'],interlaced:false,max_pixels:4000000,max_dimension:8192},image_materials:{ready_images:readyImages,minimum_images:c?.minimum_images||null,adequacy:c?.minimum_images?(readyImages>=c.minimum_images?'declared_floor_met':'insufficient'):'unrecorded',semantic_relevance_server_proven:false},service_incidents:incidents.results,new_execution_grant:false};}
 if(name==='set_word_intent')return setWordIntent(owner,a);
 exact(a,[...base,'claim_token','input_sha256','execution_token','execution_id','request_key','epoch','reason','execution_scope','expected_version','next_execution_token']);
 const r=await live(owner,kind,id,a.claim_token,a.input_sha256),claimHash=await hashText(String(a.claim_token));
 if(typeof a.execution_token!=='string'||!uuid.test(a.execution_token)||typeof a.request_key!=='string'||!uuid.test(a.request_key))fail('执行回执参数无效');
 const tokenHash=await hashText(a.execution_token),c=await control(owner,kind,id),stamp=now(),until=new Date(Date.now()+600000).toISOString();
 if(c?.attempt_id&&!await enforceWordAttemptDeadline(owner,kind,id)&&name==='heartbeat_word_execution')return {recovery:await wordRecoveryView(owner,kind,id),progress_advanced:false,stop_required:true,external_stop_confirmed:false,new_execution_grant:false};
 const table=kind==='article'?'articles':'local_word_jobs',claimField=kind==='article'?'claim_token':'claim_hash',source=kind==='article'?'paragraphs':'input_json';
 const business=`EXISTS(SELECT 1 FROM ${table} WHERE owner=? AND id=? AND ${claimField}=? AND ${source}=? AND claim_expires>${clock} AND state='processing' AND result_key IS NULL ${automaticFence(kind)})`;
 const bindings=[owner,id,kind==='article'?a.claim_token:claimHash,r[source]];
 const firstAdoption= `${business} AND EXISTS(SELECT 1 FROM ${table} WHERE owner=? AND id=? AND ${kind==='article'?'result_meta':'output_meta'} IS ? AND artifact_manifest IS ?)`;
 const adoptionBindings=[...bindings,owner,id,kind==='article'?r.result_meta:r.output_meta,r.artifact_manifest];
 if(name==='acquire_word_execution'||name==='transition_word_execution'){
  if(c&&!c.attempt_id&&c.execution_id&&await db().prepare('SELECT 1 FROM word_execution_receipts WHERE owner=? AND target_kind=? AND target_id=? AND claim_hash=? AND execution_id=? LIMIT 1').bind(owner,kind,id,c.claim_hash,c.execution_id).first())fail('原执行已授予但安全结束和实际用时历史未核实；先走原执行结束与同稿恢复，不重置计时');
  const transition=name==='transition_word_execution',scope=(a.execution_scope??'heavy') as WordResource;
  if(!['prepare','heavy'].includes(scope)||typeof a.execution_id!=='string'||!uuid.test(a.execution_id))fail('需真实执行实例及资源范围');
  if(transition&&(typeof a.next_execution_token!=='string'||!uuid.test(a.next_execution_token)||!Number.isSafeInteger(a.epoch)||Number(a.epoch)<1||!Number.isSafeInteger(a.expected_version)||Number(a.expected_version)<1||a.execution_scope===undefined))fail('转换凭据或版本无效');
  const nextHash=transition?await hashText(String(a.next_execution_token)):tokenHash;
  if(transition&&nextHash===tokenHash)fail('资源转换必须更换执行凭据');
  await assertWordCredentialFree(owner,{target_id:id,request_key:a.request_key,execution_id:a.execution_id},[a.claim_token,a.execution_token,a.next_execution_token]);
  const q:ExecutionQueue={owner,request_key:String(a.request_key),target_kind:kind,target_id:id,input_sha256:String(a.input_sha256),claim_hash:claimHash,token_hash:nextHash,execution_id:String(a.execution_id),execution_scope:scope,operation:transition?'transition':'acquire',from_epoch:transition?Number(a.epoch):null,from_version:transition?Number(a.expected_version):null,from_token_hash:transition?tokenHash:null,created:stamp};
  const receipt:any=await db().prepare('SELECT * FROM word_execution_receipts WHERE owner=? AND request_key=?').bind(owner,a.request_key).first();
  if(receipt){if(queueKeys.some(k=>!['owner','from_version'].includes(k)&&receipt[k]!==q[k])||receipt.from_version!==q.from_version)fail('执行回执键冲突');const read=await receiptRead(owner,kind,id,String(a.request_key));if(!read.applicable)fail('既有执行回执已过期；不得复活旧 token');return {acquired:true,...(transition?{transitioned:true}:{}),duplicate:true,epoch:receipt.epoch,new_execution_grant:false,recovery:await wordRecoveryView(owner,kind,id)};}
  let pending=await executionQueue(owner,kind,id),stale:ExecutionQueue|null=null;
  if(pending&&queueKeys.some(k=>pending![k]!==q[k])){if(await applicableQueue(owner,kind,id,r,c))fail('已有不同排队请求；读取同一任务与原回执');stale=pending;pending=null;}
  if(await db().prepare('SELECT 1 FROM word_execution_receipts WHERE owner=? AND token_hash=?').bind(owner,nextHash).first())fail('旧执行 token 不可复用');
  const history:any=await db().prepare('SELECT * FROM word_execution_requests WHERE owner=? AND (request_key=? OR token_hash=?) LIMIT 1').bind(owner,a.request_key,nextHash).first();
  if(history&&(!pending||queueKeys.some(k=>history[k]!==q[k])||!await applicableQueue(owner,kind,id,r,c)))fail('旧排队请求或凭据已结束；不得复活');
  if(transition){if(!c||c.execution_id!==a.execution_id||c.epoch!==a.epoch||c.version!==a.expected_version||c.token_hash!==tokenHash||c.claim_hash!==claimHash||c.input_sha256!==a.input_sha256||c.execution_scope===scope||c.desired!=='run'||c.status!=='running'||!c.lease_until||Date.parse(c.lease_until)<=Date.now())fail('旧执行者、转换版本或权限已失效');}
  else if(c&&(c.desired!=='run'||c.status==='blocked'||c.retry_after&&Date.parse(c.retry_after)>Date.now()||c.token_hash&&c.lease_until&&Date.parse(c.lease_until)>Date.now()))fail('已有执行者、暂停或等待条件；读取同一任务');
  const cap=capacity(owner,scope,kind,id,String(a.execution_id)),fresh=freshExecution(q),statements=[];
  if(stale){const validControl=`owner=${sqlText(owner)} AND target_kind=${sqlText(kind)} AND target_id=${sqlText(id)} AND desired='run' AND status!='blocked' AND input_sha256=${sqlText(stale.input_sha256)} AND claim_hash=${sqlText(stale.claim_hash)}${stale.operation==='transition'?` AND epoch=${stale.from_epoch} AND version=${stale.from_version} AND token_hash=${sqlText(stale.from_token_hash!)} AND execution_id=${sqlText(stale.execution_id)} AND status='running' AND lease_until>${clock}`:` AND (token_hash IS NULL OR lease_until<=${clock})`}`;const changedBinding=stale.input_sha256!==a.input_sha256||stale.claim_hash!==claimHash;statements.push(db().prepare(`DELETE FROM word_execution_queue WHERE ${queueIdentity(stale)} AND (${changedBinding?'1':`NOT EXISTS(SELECT 1 FROM word_recovery WHERE ${validControl})`}) AND ${business}`).bind(...bindings));}
  if(!c){const legacyBinding=await legacyOutputBinding(kind,r);statements.push(db().prepare(`INSERT OR IGNORE INTO word_recovery(owner,target_kind,target_id,input_sha256,claim_hash,version,epoch,desired,status,reason,retry_count,legacy_output_binding,execution_scope,updated) SELECT ?,?,?,?,?,0,0,'run','await_executor','none',0,?,'heavy',? WHERE ${firstAdoption} AND ${fresh}`).bind(owner,kind,id,a.input_sha256,claimHash,legacyBinding,stamp,...adoptionBindings));}
  const eligible=transition?`version=${a.expected_version} AND epoch=${a.epoch} AND token_hash=${sqlText(tokenHash)} AND execution_id=${sqlText(String(a.execution_id))} AND execution_scope!=${sqlText(scope)} AND status='running' AND lease_until>${clock}`:`version=${c?.version||0} AND (token_hash IS NULL OR lease_until<=${clock}) AND status!='blocked' AND (retry_after IS NULL OR retry_after<=${clock})`;
  const target=`owner=${sqlText(owner)} AND target_kind=${sqlText(kind)} AND target_id=${sqlText(id)} AND input_sha256=${sqlText(String(a.input_sha256))} ${transition?`AND claim_hash=${sqlText(claimHash)}`:''} AND desired='run' AND ${eligible}`;
  const grantIndex=statements.length;
  statements.push(db().prepare(`UPDATE word_recovery SET claim_hash=?,version=version+1,epoch=epoch+1,execution_id=?,request_key=?,token_hash=?,lease_until=?,heartbeat_at=?,execution_scope=?,status='running',reason='none',updated=? WHERE ${target} AND ${cap} AND ${business} AND ${fresh}`).bind(claimHash,a.execution_id,a.request_key,nextHash,until,stamp,scope,stamp,...bindings));
  statements.push(db().prepare(`INSERT OR IGNORE INTO word_execution_receipts(owner,request_key,target_kind,target_id,input_sha256,claim_hash,token_hash,execution_id,epoch,execution_scope,operation,from_epoch,from_version,from_token_hash,created) SELECT owner,request_key,target_kind,target_id,input_sha256,claim_hash,token_hash,execution_id,epoch,execution_scope,?,?,?, ?,? FROM word_recovery WHERE owner=? AND target_kind=? AND target_id=? AND request_key=? AND token_hash=?`).bind(q.operation,q.from_epoch,q.from_version,q.from_token_hash,stamp,owner,kind,id,a.request_key,nextHash));
  statements.push(...await wordGrantAttemptStatements(owner,kind,id,String(a.request_key),claimHash,String(a.execution_id),nextHash,(c?.epoch||0)+1,r.artifact_manifest));
  if(!transition&&c&&c.claim_hash!==claimHash){statements.push(db().prepare(`UPDATE word_recovery SET claim_hash=?,version=version+1,epoch=epoch+1,token_hash=NULL,lease_until=NULL WHERE ${target} AND NOT(${cap}) AND ${business} AND ${fresh}`).bind(claimHash,...bindings));}
  const queueTarget=!transition&&c&&c.claim_hash!==claimHash?target.replace(`version=${c.version} AND`, `version=${c.version+1} AND`):target;
  const queueIndex=statements.length;
  statements.push(db().prepare(`INSERT OR IGNORE INTO word_execution_queue(${queueKeys.join(',')},capacity_reason,created) SELECT ${queueKeys.map(()=>'?').join(',')},CASE WHEN NOT(${capacity(owner,'prepare',kind,id,String(a.execution_id))}) THEN 'total_capacity' ELSE 'heavy_capacity' END,? WHERE EXISTS(SELECT 1 FROM word_recovery WHERE ${queueTarget}) AND NOT(${cap}) AND ${business} AND ${fresh}`).bind(...queueKeys.map(k=>q[k]),stamp,...bindings));
  statements.push(db().prepare(`INSERT OR IGNORE INTO word_execution_requests(${queueKeys.join(',')},capacity_reason,created) SELECT ${queueKeys.map(()=>'?').join(',')},(SELECT capacity_reason FROM word_execution_queue WHERE ${queueIdentity(q)}),? WHERE EXISTS(SELECT 1 FROM word_execution_receipts WHERE ${queueIdentity(q)}) OR EXISTS(SELECT 1 FROM word_execution_queue WHERE ${queueIdentity(q)})`).bind(...queueKeys.map(k=>q[k]),stamp));
  statements.push(db().prepare(`DELETE FROM word_execution_queue WHERE owner=? AND target_kind=? AND target_id=? AND request_key=? AND EXISTS(SELECT 1 FROM word_execution_receipts e WHERE e.owner=word_execution_queue.owner AND e.request_key=word_execution_queue.request_key AND e.token_hash=word_execution_queue.token_hash)`).bind(owner,kind,id,a.request_key));
  const result=await db().batch(statements),read=await receiptRead(owner,kind,id,String(a.request_key));
  if(read.recorded&&read.applicable)return {acquired:true,...(transition?{transitioned:true}:{}),duplicate:!result[grantIndex].meta.changes,epoch:read.epoch,new_execution_grant:!!result[grantIndex].meta.changes,recovery:await wordRecoveryView(owner,kind,id)};
  if(read.queued){const recovery=await wordRecoveryView(owner,kind,id);return {acquired:false,...(transition?{transitioned:false}:{}),queued:true,duplicate:!result[queueIndex].meta.changes,epoch:recovery?.epoch||0,new_execution_grant:false,recovery};}
  fail('执行状态或排队请求已变化；先读取同一任务与原回执');
 }
 if(!c||c.epoch!==a.epoch||c.token_hash!==tokenHash||c.claim_hash!==claimHash||c.input_sha256!==a.input_sha256||c.desired!=='run'||!c.lease_until||Date.parse(c.lease_until)<=Date.now())fail('旧执行者回执已失效');
 if(name==='heartbeat_word_execution'){
  const change=await db().prepare(`UPDATE word_recovery SET heartbeat_at=?,lease_until=?,updated=? WHERE owner=? AND target_kind=? AND target_id=? AND epoch=? AND token_hash=? AND desired='run' AND status='running' AND lease_until>${clock} AND ${business}`).bind(stamp,until,stamp,owner,kind,id,c.epoch,tokenHash,...bindings).run();if(!change.meta.changes)fail('心跳租约已失效');return {recovery:await wordRecoveryView(owner,kind,id),progress_advanced:false};
 }
 if(name==='report_word_interruption'){
  const pending=await executionQueue(owner,kind,id);
  const transient=['network_timeout','response_unknown','rate_limited','service_unavailable'].includes(String(a.reason));
  if(!transient&&!['http_403','login_required','captcha','no_executor','executor_ended','repair_failed','repair_unknown'].includes(String(a.reason)))fail('中断原因无效');
  const retries=c.retry_count+Number(transient),backoff=transient&&retries<=3,newRetry=backoff?new Date(Date.now()+[5000,30000,120000][retries-1]).toISOString():null;
  const interruption=[db().prepare(`UPDATE word_recovery SET version=version+1,epoch=epoch+1,token_hash=NULL,lease_until=NULL,status=?,reason=?,retry_count=?,retry_after=?,updated=? WHERE owner=? AND target_kind=? AND target_id=? AND epoch=? AND token_hash=? AND desired='run' AND lease_until>${clock} AND ${business}`).bind(backoff?'backoff':'blocked',a.reason,retries,newRetry,stamp,owner,kind,id,c.epoch,tokenHash,...bindings)];
  if(['http_403','login_required','captcha','service_unavailable','repair_failed','repair_unknown'].includes(String(a.reason)))interruption.push(db().prepare(`INSERT INTO word_service_incidents(owner,dependency,reason,state,first_seen,last_seen) SELECT ?,'public_images',?,'await_executor',?,? WHERE changes()>0 ON CONFLICT(owner,dependency,reason) DO UPDATE SET last_seen=excluded.last_seen,state='await_executor'`).bind(owner,a.reason,stamp,stamp));
  const interrupted=await db().batch(interruption);if(!interrupted[0].meta.changes)fail('中断结果已过期');
  if(pending)await db().prepare('DELETE FROM word_execution_queue WHERE owner=? AND target_kind=? AND target_id=? AND request_key=?').bind(owner,kind,id,pending.request_key).run();
  await requestWordAttemptStop(owner,kind,id,'owner_request');
  return {recovery:await wordRecoveryView(owner,kind,id),automatic_repair_started:false,accepted_outputs_preserved:true};
 }
 fail('恢复操作无效');
}

export async function readCheckpointBytes(owner:string,a:Record<string,unknown>){
 exact(a,['target_kind','target_id','asset_id','index']);const kind=a.target_kind as WordTarget,id=String(a.target_id);const r=await row(owner,kind,id);await assertWordCredentialFree(owner,{asset_id:a.asset_id},kind==='article'?[r.claim_token]:[]);
 const cp:any=await db().prepare('SELECT * FROM word_checkpoints WHERE owner=? AND target_kind=? AND target_id=? AND asset_id=?').bind(owner,kind,id,a.asset_id).first();
 if(!cp||cp.input_sha256!==await input(kind,r)||!Number.isSafeInteger(a.index))fail('断点身份不匹配');const part=parse(cp.parts_json)[Number(a.index)];if(!part)fail('该块未确认保存');
 const stored=await env.BUCKET?.get(part.key);if(!stored)fail('断点字节暂不可读');const bytes=new Uint8Array(await stored.arrayBuffer());if(bytes.length!==part.size||await byteHash(bytes)!==part.sha256)fail('断点字节校验失败');let s='';for(const byte of bytes)s+=String.fromCharCode(byte);return {asset_id:cp.asset_id,index:a.index,size:bytes.length,sha256:part.sha256,data_base64:btoa(s),read_only:true};
}
export async function byteHash(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource))).map(x=>x.toString(16).padStart(2,'0')).join('');}

export async function requireCheckpointImages(owner:string,kind:WordTarget,id:string,images:unknown){
 const c=await control(owner,kind,id);if(!c)return;
 if(!Array.isArray(images)||images.length<(c.minimum_images||1)||images.length>30||new Set(images.map(i=>i?.sha256)).size!==images.length)fail('真实去重配图不足，不能凑图保存');
 const r=await row(owner,kind,id),sha=await input(kind,r),anchors=kind==='article'?JSON.parse(r.paragraphs).filter((p:string)=>p.trim()).length:(()=>{const i=JSON.parse(r.input_json);return [i.title,...i.paragraphs].filter((p:string)=>p.trim()).length;})();
 for(const image of images){const cp:any=await db().prepare(`SELECT metadata_json,verification_json FROM word_checkpoints WHERE owner=? AND target_kind=? AND target_id=? AND input_sha256=? AND kind='image' AND sha256=? AND state='ready' AND ${wordAttemptSelectionSql(owner,kind,id)} LIMIT 1`).bind(owner,kind,id,sha,image?.sha256||'').first();const m=cp&&parse(cp.metadata_json),v=cp&&parse(cp.verification_json);if(!m||!v||publicSourceUrl(m.source_url)!==publicSourceUrl(image.source_url)||m.source_title!==image.source_title||m.after_paragraph!==image.after_paragraph||image.after_paragraph>=anchors||!verifiedPixels(v))fail('配图须先持久保存并核验同一图片字节、来源与锚点');}
}
export async function declareImageFloor(owner:string,a:Record<string,unknown>){
 exact(a,['target_kind','target_id','claim_token','input_sha256','execution_token','minimum_images']);const kind=a.target_kind as WordTarget,id=String(a.target_id),r=await live(owner,kind,id,a.claim_token,a.input_sha256),c=await control(owner,kind,id),fence=await wordWriteFence(owner,kind,id,a.claim_token,a.execution_token);
 if(!c||!Number.isSafeInteger(a.minimum_images)||Number(a.minimum_images)<1||Number(a.minimum_images)>30)fail('实际配图数量要求无效');
 if(c.minimum_images!==null){if(c.minimum_images!==a.minimum_images)fail('配图数量要求已冻结');await assertCurrentWordWritePermission(owner,kind,id,a.claim_token,a.execution_token);return {recorded:true,duplicate:true,minimum_images:c.minimum_images};}
 if(parse(r.artifact_manifest)?.layout||r.result_meta||r.output_meta)fail('配图或输出已冻结，不能改数量要求');const table=kind==='article'?'articles':'local_word_jobs';const saved=await db().prepare(`UPDATE word_recovery SET minimum_images=?,version=version+1 WHERE owner=? AND target_kind=? AND target_id=? AND minimum_images IS NULL AND version=? AND EXISTS(SELECT 1 FROM ${table} WHERE owner=? AND id=? AND state='processing' AND result_key IS NULL AND artifact_manifest IS ? AND ${kind==='article'?'result_meta':'output_meta'} IS NULL ${fence})`).bind(a.minimum_images,owner,kind,id,c.version,owner,id,r.artifact_manifest).run();if(!saved.meta.changes)fail('配图要求或执行租约已变化');return {recorded:true,duplicate:false,minimum_images:a.minimum_images,semantic_relevance_server_proven:false};
}
export async function readNativeOutputChunk(owner:string,a:Record<string,unknown>){
 exact(a,['target_kind','target_id','output_id','index']);const kind=a.target_kind as WordTarget,id=String(a.target_id),r=await row(owner,kind,id),m=parse(kind==='article'?r.result_meta:r.output_meta);if(!m||m.output_id!==a.output_id||!Number.isSafeInteger(a.index)||Number(a.index)<0)fail('已有输出身份无效');const part=m.parts?.[Number(a.index)];if(!part)fail('该输出分块尚未确认');const object=await env.BUCKET?.get(part.key);if(!object)fail('已有输出分块暂不可读');const bytes=new Uint8Array(await object.arrayBuffer());if(bytes.length!==part.size||await byteHash(bytes)!==part.sha256)fail('已有输出分块校验失败');let raw='';for(const n of bytes)raw+=String.fromCharCode(n);return {output_id:m.output_id,index:a.index,size:bytes.length,sha256:part.sha256,data_base64:btoa(raw),read_only:true,new_upload_allowed:false};
}
export async function requireCheckpointWord(owner:string,kind:WordTarget,id:string,sha:unknown,size:unknown){
 const c=await control(owner,kind,id);if(!c)return;const r=await row(owner,kind,id),images=parse(r.artifact_manifest)?.layout?.images;if(!Array.isArray(images)||images.length<(c.minimum_images||1))fail('实际配图清单尚未冻结或数量不足；不能生成无图成品');await requireCheckpointImages(owner,kind,id,images);const found=await db().prepare(`SELECT 1 FROM word_checkpoints WHERE owner=? AND target_kind=? AND target_id=? AND input_sha256=? AND kind='word' AND sha256=? AND size=? AND state='ready' AND ${wordAttemptSelectionSql(owner,kind,id)}`).bind(owner,kind,id,await input(kind,r),sha,size).first();if(!found)fail('先持久保存并核验同一完整 Word 字节，再申报原生输出');
}
export async function recordImageResult(owner:string,a:Record<string,unknown>){
 exact(a,['target_kind','target_id','claim_token','input_sha256','execution_token','candidate_id','source_url','source_title','outcome','reason','replacement_for','asset_id']);
 const kind=a.target_kind as WordTarget,id=String(a.target_id);await live(owner,kind,id,a.claim_token,a.input_sha256);const requiredResource:WordResource=a.outcome==='ready'?'heavy':'prepare',fence=await wordWriteFence(owner,kind,id,a.claim_token,a.execution_token,requiredResource);
 if(!await control(owner,kind,id))fail('先取得同一 Word 执行租约');
 await assertWordCredentialFree(owner,{candidate_id:a.candidate_id,source_url:a.source_url,source_title:a.source_title,replacement_for:a.replacement_for,asset_id:a.asset_id},[a.claim_token,a.execution_token]);
 if(!uuid.test(String(a.candidate_id))||!publicUrl(a.source_url,[String(a.claim_token),String(a.execution_token)])||typeof a.source_title!=='string'||!a.source_title.trim()||a.source_title.length>200||!['download_failed','skipped','ready'].includes(String(a.outcome))||!['http_403','network_timeout','bad_image','not_relevant','source_unavailable','none'].includes(String(a.reason))||JSON.stringify({url:a.source_url,title:a.source_title}).includes(String(a.claim_token))||JSON.stringify({url:a.source_url,title:a.source_title}).includes(String(a.execution_token)))fail('候选图片结果无效');
 if(a.outcome==='ready'){const cp:any=await db().prepare(`SELECT metadata_json,verification_json FROM word_checkpoints WHERE owner=? AND target_kind=? AND target_id=? AND asset_id=? AND input_sha256=? AND kind='image' AND state='ready' AND ${wordAttemptSelectionSql(owner,kind,id)}`).bind(owner,kind,id,a.asset_id||'',a.input_sha256).first();if(!cp||!verifiedPixels(parse(cp.verification_json))||parse(cp.metadata_json).source_url!==a.source_url||a.reason!=='none')fail('可用图片须有同源已核验字节断点');}
 else if(a.reason==='none'||a.asset_id)fail('失败候选不得声称已有可用字节');
 if(a.replacement_for){if(!uuid.test(String(a.replacement_for))||!await db().prepare(`SELECT 1 FROM word_image_candidates WHERE owner=? AND target_kind=? AND target_id=? AND candidate_id=? AND outcome IN ('download_failed','skipped') AND ${wordAttemptSelectionSql(owner,kind,id)}`).bind(owner,kind,id,a.replacement_for).first())fail('换源必须对应已跳过的候选');}
 const attemptId=await currentWordAttemptId(owner,kind,id);
 const candidatePayload={input:a.input_sha256,url:a.source_url,title:a.source_title,outcome:a.outcome,reason:a.reason,replacement:a.replacement_for||null,asset:a.asset_id||null};
 const payload=await hashText(JSON.stringify(attemptId?{attempt_id:attemptId,...candidatePayload}:candidatePayload));
 const prior:any=await db().prepare('SELECT payload_sha256,attempt_id FROM word_image_candidates WHERE owner=? AND target_kind=? AND target_id=? AND candidate_id=?').bind(owner,kind,id,a.candidate_id).first();
 if(prior){const legacyReplay=prior.attempt_id===null&&(!attemptId||(await wordAttemptView(owner,kind,id))?.generation===1)&&prior.payload_sha256===await hashText(JSON.stringify(candidatePayload));if(prior.payload_sha256!==payload&&!legacyReplay)fail('同一候选结果不可替换');await assertCurrentWordWritePermission(owner,kind,id,a.claim_token,a.execution_token,requiredResource);return {recorded:true,duplicate:true,whole_job_blocked:false};}
 // The replacement budget and a denied source URL belong to the whole frozen
 // job. A new material strategy may change candidates, never reset those guards.
 const table=kind==='article'?'articles':'local_word_jobs';const saved=await db().prepare(`INSERT OR IGNORE INTO word_image_candidates(owner,target_kind,target_id,candidate_id,input_sha256,attempt_id,source_url,source_title,outcome,reason,replacement_for,asset_id,payload_sha256,created) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM word_image_candidates WHERE owner=? AND target_kind=? AND target_id=? AND ${wordAttemptSelectionSql(owner,kind,id)})<200 AND (? IS NULL OR (SELECT COUNT(*) FROM word_image_candidates WHERE owner=? AND target_kind=? AND target_id=? AND replacement_for IS NOT NULL)<6) AND NOT EXISTS(SELECT 1 FROM word_image_candidates WHERE owner=? AND target_kind=? AND target_id=? AND source_url=? AND (${wordAttemptSelectionSql(owner,kind,id)} OR reason IN ('http_403','login_required','captcha'))) AND EXISTS(SELECT 1 FROM ${table} WHERE owner=? AND id=? AND state='processing' AND result_key IS NULL ${fence})`).bind(owner,kind,id,a.candidate_id,a.input_sha256,attemptId,a.source_url,a.source_title,a.outcome,a.reason,a.replacement_for||null,a.asset_id||null,payload,now(),owner,kind,id,a.replacement_for||null,owner,kind,id,owner,kind,id,a.source_url,owner,id).run();if(!saved.meta.changes)fail('候选已处理、原来源受阻、全稿换源上限或租约变化；读取同一任务');return {recorded:true,duplicate:false,whole_job_blocked:false,replacement_limit:6};
}
export async function legacyWordManifest(owner:string,id:string):Promise<ArtifactManifest|null>{
 if(!await control(owner,'article',id))return null;const r=await row(owner,'article',id);if(r.artifact_manifest)return parse(r.artifact_manifest);if(r.result_meta||r.result_key)fail('已有输出沿用原契约，不补造配图历史');const sha=await input('article',r);
 return {contract_version:1,author:'manual_frozen_word_source',input_sha256:sha,prompt_sha256:await hashText('manual-word-recovery-v1'),original_sha256:sha,sources_sha256:await hashText('[]'),sources:[],frozen_at:now(),layout:null};
}

function publicUrl(value:unknown,secrets:string[]=[]){try{if(typeof value!=='string'||value.length>2048)return false;const u=new URL(value);let decoded=value;for(let n=0;n<4;n++){const next=decodeURIComponent(decoded);if(next===decoded)break;decoded=next;}return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hostname.includes(':')&&u.hostname.includes('.')&&!/^[0-9.]+$/.test(u.hostname)&&!/(^|\.)(local|localhost|internal|test|invalid)$/.test(u.hostname)&&!/%[a-f0-9]{2}/i.test(decoded)&&!secrets.some(s=>decoded.toLowerCase().includes(s.toLowerCase()))&&![...u.searchParams.keys()].some(k=>/token|secret|auth|signature|session|password|key|sig/i.test(k));}catch{return false;}}
export async function checkpointCall(owner:string,name:string,a:Record<string,unknown>){
 if(name==='read_word_checkpoint_chunk')return readCheckpointBytes(owner,a);
 exact(a,['target_kind','target_id','claim_token','input_sha256','execution_token','asset_id','kind','sha256','size','chunks','metadata','index','data_base64']);
 const kind=a.target_kind as WordTarget,id=String(a.target_id),r=await live(owner,kind,id,a.claim_token,a.input_sha256);
 if(typeof a.asset_id!=='string'||!uuid.test(a.asset_id))fail('断点 ID 无效');
 await assertWordCredentialFree(owner,{asset_id:a.asset_id,metadata:a.metadata},[a.claim_token,a.execution_token]);
 const fence=await wordWriteFence(owner,kind,id,a.claim_token,a.execution_token),businessTable=kind==='article'?'articles':'local_word_jobs';
 // Explicitly opted-in execution is required for new checkpoints. Legacy Word
 // writers remain compatible, but can never manufacture durable checkpoint proof.
 if(!await control(owner,kind,id))fail('先取得同一 Word 执行租约');
 const business=`EXISTS(SELECT 1 FROM ${businessTable} WHERE owner=? AND id=? AND state='processing' AND result_key IS NULL ${fence})`;
 const cp:any=await db().prepare('SELECT * FROM word_checkpoints WHERE owner=? AND target_kind=? AND target_id=? AND asset_id=? AND '+wordAttemptSelectionSql(owner,kind,id)).bind(owner,kind,id,a.asset_id).first();
 const attemptId=await currentWordAttemptId(owner,kind,id);
 if(name==='begin_word_checkpoint'){
  if(!['image','word'].includes(String(a.kind))||!digest.test(String(a.sha256))||!Number.isSafeInteger(a.size)||Number(a.size)<1||Number(a.size)>20*1024*1024||!Number.isSafeInteger(a.chunks)||Number(a.chunks)!==Math.ceil(Number(a.size)/65536))fail('断点声明无效');
  const m=a.metadata as Record<string,unknown>;exact(m||{},a.kind==='image'?['source_url','source_title','after_paragraph']:[]);
  if(a.kind==='image'&&(!publicUrl(m.source_url,[String(a.claim_token),String(a.execution_token)])||typeof m.source_title!=='string'||m.source_title.length>200||!Number.isSafeInteger(m.after_paragraph)||Number(m.after_paragraph)<0||Number(m.after_paragraph)>5000||JSON.stringify(m).includes(String(a.claim_token))||JSON.stringify(m).includes(String(a.execution_token))))fail('真实图片来源或锚点无效');
  const declaration=JSON.stringify(m),output=parse(kind==='article'?r.result_meta:r.output_meta);
  if(a.kind==='word'&&output&&output.sha256!==a.sha256)fail('Word 断点不得替换已有输出');
  if(cp){if(cp.input_sha256!==a.input_sha256||cp.kind!==a.kind||cp.sha256!==a.sha256||cp.size!==a.size||cp.chunks!==a.chunks||cp.metadata_json!==declaration)fail('同一断点声明冲突');await assertCurrentWordWritePermission(owner,kind,id,a.claim_token,a.execution_token);return {asset_id:cp.asset_id,next_index:parse(cp.parts_json).length,state:cp.kind==='image'&&cp.state==='ready'&&!verifiedPixels(parse(cp.verification_json))?'needs_pixel_verification':cp.state,duplicate:true};}
  const saved=await db().prepare(`INSERT OR IGNORE INTO word_checkpoints(owner,target_kind,target_id,input_sha256,attempt_id,asset_id,kind,sha256,size,chunks,metadata_json,parts_json,state,created) SELECT ?,?,?,?,?,?,?,?,?,?,?,'[]','incomplete',? WHERE (SELECT COUNT(*) FROM word_checkpoints WHERE owner=? AND target_kind=? AND target_id=? AND ${wordAttemptSelectionSql(owner,kind,id)})<31 AND COALESCE((SELECT SUM(size) FROM word_checkpoints WHERE owner=? AND target_kind=? AND target_id=? AND ${wordAttemptSelectionSql(owner,kind,id)}),0)+?<=41943040 AND COALESCE((SELECT SUM(size) FROM word_checkpoints WHERE owner=? AND target_kind=? AND target_id=?),0)+?<=125829120 AND ${business}`).bind(owner,kind,id,a.input_sha256,attemptId,a.asset_id,a.kind,a.sha256,a.size,a.chunks,declaration,now(),owner,kind,id,owner,kind,id,a.size,owner,kind,id,a.size,owner,id).run();if(!saved.meta.changes)fail('断点并发变化或存储限额；读取同一任务');return {asset_id:a.asset_id,next_index:0,state:'incomplete'};
 }
 if(!cp||cp.input_sha256!==a.input_sha256)fail('断点绑定不一致');const parts=parse(cp.parts_json);
 if(name==='put_word_checkpoint_chunk'){
  if(!Number.isSafeInteger(a.index)||Number(a.index)<0||Number(a.index)>=cp.chunks||typeof a.data_base64!=='string'||a.data_base64.length>87384||!/^[A-Za-z0-9+/]*={0,2}$/.test(a.data_base64))fail('断点分块无效');
  const bytes=Uint8Array.from(atob(a.data_base64),c=>c.charCodeAt(0)),index=Number(a.index),sha=await byteHash(bytes),expected=index===cp.chunks-1?cp.size-index*65536:65536;
  if(bytes.length!==expected)fail('断点分块大小不一致');
  if(index<parts.length){if(parts[index].sha256!==sha)fail('断点分块冲突');await assertCurrentWordWritePermission(owner,kind,id,a.claim_token,a.execution_token);return {accepted:true,duplicate:true,next_index:parts.length};}
  if(index!==parts.length||cp.state!=='incomplete')fail('先回读已保存的断点块');
  const key=`${kind==='article'?'articles':'local-word-jobs'}/${id}/checkpoints/${cp.asset_id}/${index}-${sha}`;if(kind==='article'){const {writeArticleObject}=await import('./article-source-write');await writeArticleObject(owner,id,key,bytes);}else await env.BUCKET!.put(key,bytes);parts.push({key,size:bytes.length,sha256:sha});
  const changed=await db().prepare(`UPDATE word_checkpoints SET parts_json=? WHERE owner=? AND target_kind=? AND target_id=? AND asset_id=? AND parts_json=? AND state='incomplete' AND ${wordAttemptSelectionSql(owner,kind,id)} AND ${business}`).bind(JSON.stringify(parts),owner,kind,id,a.asset_id,cp.parts_json,owner,id).run();if(!changed.meta.changes)fail('断点租约或版本已变化；回读同一断点');return {accepted:true,next_index:parts.length};
 }
 if(name==='finalize_word_checkpoint'){
  if(parts.length!==cp.chunks)fail('断点仍未完整');const bytes=new Uint8Array(cp.size);let at=0;for(const part of parts){const stored=await env.BUCKET!.get(part.key);if(!stored)fail('断点字节不可读');const data=new Uint8Array(await stored.arrayBuffer());if(data.length!==part.size||await byteHash(data)!==part.sha256)fail('断点字节校验失败');bytes.set(data,at);at+=data.length;}
  if(at!==cp.size||await byteHash(bytes)!==cp.sha256)fail('断点整体 SHA 不一致');
  let verification:unknown;
  if(cp.kind==='image'){const {verifyWordRasterPixels}=await import('./word-raster');verification=verifyWordRasterPixels(bytes);}else{const {assertOriginalText,parseArticle}=await import('./article-format');const source=kind==='article'?JSON.parse(r.paragraphs):(()=>{const i=JSON.parse(r.input_json);return [...Array(i.leading_blank_paragraphs||0).fill(''),i.title,...i.paragraphs];})();assertOriginalText(source,parseArticle(bytes,'checkpoint.docx',true));verification={frozen_text_verified:true};}
  const changed=await db().prepare(`UPDATE word_checkpoints SET state='ready',verification_json=? WHERE owner=? AND target_kind=? AND target_id=? AND asset_id=? AND parts_json=? AND ${wordAttemptSelectionSql(owner,kind,id)} AND ${business}`).bind(JSON.stringify(verification),owner,kind,id,a.asset_id,cp.parts_json,owner,id).run();if(!changed.meta.changes)fail('断点 finalize 回执已过期');return {asset_id:cp.asset_id,sha256:cp.sha256,size:cp.size,state:'ready',word_saved:false,page_inspection_proven:false};
 }
 fail('断点操作无效');
}
