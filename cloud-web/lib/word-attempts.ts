import {db} from './test-store';
import {hashText} from './writing-input';
import {assertArticleProcessingAllowed} from './article-output-mode';
import {assertWordCredentialFree,redactWordCredentialText} from './word-credentials';
import type {WordTarget} from './word-progress-contract';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest=/^[a-f0-9]{64}$/;
export const wordAttemptTimeoutMs=3600000;
export const wordAttemptMaxRestarts=2;
export const wordAttemptClock="strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const millis="CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER)";
type Row=Record<string,any>;
export class WordAttemptError extends Error {}
export type WordAttemptView={attempt_id:string;generation:number;state:string;started_at:string|null;active_elapsed_ms:number;active_started_at:string|null;read_at:string;timeout_ms:number;timeout_due:boolean;stop_requested_at:string|null;reason:string;restarts_used:number;max_restarts:number};
function fail(message:string):never{throw new WordAttemptError(message);}
function parse(value:string|null|undefined){try{return value?JSON.parse(value):null;}catch{fail('既有尝试记录不可核对；只读取原任务');}}
export function wordAttemptSqlText(value:string){return `CAST(X'${Array.from(new TextEncoder().encode(value)).map(n=>n.toString(16).padStart(2,'0')).join('')}' AS TEXT)`;}
function target(owner:string,kind:WordTarget,id:string,alias=''){const p=alias?`${alias}.`:'';return `${p}owner=${wordAttemptSqlText(owner)} AND ${p}target_kind=${wordAttemptSqlText(kind)} AND ${p}target_id=${wordAttemptSqlText(id)}`;}
function exact(a:Record<string,unknown>,keys:string[]){if(!a||Array.isArray(a)||Object.keys(a).some(k=>!keys.includes(k)))fail('配图尝试参数无效');}
function identity(value:unknown){if(typeof value!=='string'||!uuid.test(value))fail('尝试身份或请求键无效');}
function reference(value:unknown){if(typeof value!=='string'||!value.trim()||value.length>240||/[\x00-\x1f\x7f]/.test(value))fail('需要实际执行或策略的简短引用');}
async function owned(owner:string,kind:WordTarget,id:string){
 if(!owner||!['article','local_word'].includes(kind)||!(kind==='article'?uuid.test(id):id.startsWith('localword_')&&uuid.test(id.slice(10))))fail('配图尝试范围无效');
 const r=await db().prepare(`SELECT * FROM ${kind==='article'?'articles':'local_word_jobs'} WHERE owner=? AND id=?`).bind(owner,id).first<Row>();
 if(!r||r.state==='deleting'||(kind==='local_word'&&(r.source_kind!=='local_desktop'||r.output_mode!=='word_only'||r.destinations_json!=='[]')))fail('没有找到本人的配图任务');
 if(kind==='article'){await assertArticleProcessingAllowed(owner,r as any);if(r.source_key!==`articles/${id}/source`||await db().prepare('SELECT 1 FROM outline_flows WHERE article_id=? LIMIT 1').bind(id).first())fail('该来源没有同稿配图重配契约');}
 const sha=kind==='article'?await hashText(JSON.stringify(parse(r.paragraphs))):await hashText(r.input_json);
 if(kind==='local_word'&&sha!==r.input_sha256)fail('冻结原文不一致');
 return {r,sha,table:kind==='article'?'articles':'local_word_jobs',source:kind==='article'?'paragraphs':'input_json',output:kind==='article'?'result_meta':'output_meta'};
}
export async function currentWordAttemptId(owner:string,kind:WordTarget,id:string){return (await db().prepare('SELECT attempt_id FROM word_recovery WHERE owner=? AND target_kind=? AND target_id=?').bind(owner,kind,id).first<{attempt_id:string|null}>())?.attempt_id||null;}
// Server-only hook: callers must put this immediately after a successful actual
// queued, never-claimed main-claim UPDATE in the same D1 batch. proofSql repeats
// that immutable acquisition marker; it is never inferred from a control row.
export function wordFreshClaimOriginStatement(p:{owner:string;kind:WordTarget;id?:string;claimHash:string;proofReference:string;proofSql:string;proofBinds?:any[]}){
 const table=p.kind==='article'?'articles':'local_word_jobs',binding=p.kind==='article'?'word_claim_origin_hash':'claim_hash';
 return db().prepare(`INSERT OR IGNORE INTO word_claim_origins(owner,target_kind,target_id,claim_hash,origin,proof_reference,created) SELECT a.owner,?,a.id,?,'fresh_claim',?,${wordAttemptClock} FROM ${table} a WHERE changes()>0 AND a.owner=? ${p.id?'AND a.id=?':''} AND a.state='processing' AND a.result_key IS NULL AND a.${binding}=? AND (${p.proofSql})`).bind(p.kind,p.claimHash,p.proofReference,p.owner,...(p.id?[p.id]:[]),p.claimHash,...(p.proofBinds||[]));
}
export function wordUnstartedClaimKnownSql(kind:WordTarget,alias='a'){
 const binding=kind==='article'?`${alias}.word_claim_origin_hash`:`${alias}.claim_hash`;
 const fresh=`EXISTS(SELECT 1 FROM word_claim_origins g WHERE g.owner=${alias}.owner AND g.target_kind=${wordAttemptSqlText(kind)} AND g.target_id=${alias}.id AND g.claim_hash=${binding} AND g.origin='fresh_claim')`;
 if(kind==='local_word')return fresh;
 return `(${fresh} OR EXISTS(SELECT 1 FROM word_recovery c JOIN article_word_claim_recoveries x ON x.owner=c.owner AND x.article_id=c.target_id AND x.next_claim_hash=c.claim_hash WHERE c.owner=${alias}.owner AND c.target_kind='article' AND c.target_id=${alias}.id AND x.next_claim_hash=${binding} AND json_extract(x.termination_json,'$.confirm_all_actions_settled')=1))`;
}
export function wordAttemptSelectionSql(owner:string,kind:WordTarget,id:string,alias=''){
 const p=alias?`${alias}.`:'';const current=`(SELECT attempt_id FROM word_recovery WHERE ${target(owner,kind,id)})`;
 // First adoption may reuse genuinely recorded legacy bytes/observations. A new
 // generation never borrows their counts or readiness merely from an input hash.
 return `(${p}attempt_id IS ${current} OR (${p}attempt_id IS NULL AND EXISTS(SELECT 1 FROM word_attempts a WHERE ${target(owner,kind,id,'a')} AND a.attempt_id=${current} AND a.generation=1)))`;
}
async function attempt(owner:string,kind:WordTarget,id:string){return db().prepare(`SELECT a.* FROM word_attempts a JOIN word_recovery c ON c.owner=a.owner AND c.target_kind=a.target_kind AND c.target_id=a.target_id AND c.attempt_id=a.attempt_id WHERE ${target(owner,kind,id,'a')}`).bind().first<Row>();}
export async function wordAttemptView(owner:string,kind:WordTarget,id:string):Promise<WordAttemptView|null>{
 const a=await db().prepare(`SELECT a.*,${wordAttemptClock} AS read_at,${millis} AS read_ms FROM word_attempts a JOIN word_recovery c ON c.owner=a.owner AND c.target_kind=a.target_kind AND c.target_id=a.target_id AND c.attempt_id=a.attempt_id WHERE ${target(owner,kind,id,'a')}`).bind().first<Row>();
 if(!a)return null;const elapsed=a.active_elapsed_ms+(a.active_started_at?Math.max(0,a.read_ms-Date.parse(a.active_started_at)):0);
 return {attempt_id:a.attempt_id,generation:a.generation,state:a.state,started_at:a.started_at,active_elapsed_ms:a.active_elapsed_ms,active_started_at:a.active_started_at,read_at:a.read_at,timeout_ms:wordAttemptTimeoutMs,timeout_due:elapsed>wordAttemptTimeoutMs,stop_requested_at:a.stop_requested_at,reason:a.reason,restarts_used:a.generation-1,max_restarts:wordAttemptMaxRestarts};
}
// A lease is write authority, never evidence that its process has stopped. These
// predicates deliberately ignore claim/Word lease expiry and heartbeat age.
// The caller supplies a trusted SQL owner expression, never unescaped user text.
// An append-only original-holder end settles only its exact retained identities;
// the article/source fence and the historical safety block remain immutable.
export function articlePurgeUnresolvedSql(ownerExpression:string){
 const fields=['owner','article_id','operation_id','claim_sha256','execution_sha256','input_sha256','grant_request_key','token_sha256','epoch','acquisition_request_key','holder_mode'];
 const match=fields.map(k=>`e.${k} IS b.${k}`).join(' AND ');
 return `EXISTS(SELECT 1 FROM article_purge_serial_blocks b WHERE b.owner=${ownerExpression} AND NOT EXISTS(SELECT 1 FROM article_purge_executor_ends e WHERE ${match} AND e.all_actions_stopped=1 AND e.all_actions_settled=1 AND e.server_verified=0))`;
}
export function wordSerialCapacitySql(owner:string,kind:WordTarget,id:string,executionId?:string){
 const o=wordAttemptSqlText(owner),k=wordAttemptSqlText(kind),i=wordAttemptSqlText(id),e=executionId?wordAttemptSqlText(executionId):'NULL';
 const settled=`EXISTS(SELECT 1 FROM article_word_executor_ends x WHERE x.owner=c.owner AND x.article_id=c.target_id AND x.claim_hash=c.claim_hash AND x.execution_id=c.execution_id AND json_extract(x.proof_json,'$.confirm_all_actions_settled')=1) OR EXISTS(SELECT 1 FROM article_word_claim_recoveries x WHERE x.owner=c.owner AND x.article_id=c.target_id AND x.old_claim_hash=c.claim_hash AND json_extract(x.termination_json,'$.execution_id')=c.execution_id AND json_extract(x.termination_json,'$.confirm_all_actions_settled')=1)`;
 const unresolved=`EXISTS(SELECT 1 FROM word_recovery c WHERE c.owner=${o} AND c.attempt_id IS NULL AND EXISTS(SELECT 1 FROM word_execution_receipts g WHERE g.owner=c.owner AND g.target_kind=c.target_kind AND g.target_id=c.target_id AND g.claim_hash=c.claim_hash AND g.execution_id=c.execution_id) AND ((c.target_kind='article' AND EXISTS(SELECT 1 FROM articles a WHERE a.owner=c.owner AND a.id=c.target_id AND a.state='processing' AND a.result_key IS NULL) AND NOT(${settled})) OR (c.target_kind='local_word' AND EXISTS(SELECT 1 FROM local_word_jobs a WHERE a.owner=c.owner AND a.id=c.target_id AND a.state='processing' AND a.result_key IS NULL))))`;
 const legacyArticle=`EXISTS(SELECT 1 FROM articles a WHERE a.owner=${o} AND a.state='processing' AND a.result_key IS NULL AND a.claim_token IS NOT NULL AND NOT EXISTS(SELECT 1 FROM word_recovery c JOIN word_attempts t ON t.owner=c.owner AND t.target_kind=c.target_kind AND t.target_id=c.target_id AND t.attempt_id=c.attempt_id WHERE c.owner=a.owner AND c.target_kind='article' AND c.target_id=a.id) AND NOT(${wordUnstartedClaimKnownSql('article')}) AND NOT EXISTS(SELECT 1 FROM writing_runs w WHERE w.owner=a.owner AND w.article_id=a.id) AND NOT EXISTS(SELECT 1 FROM editorial_runs_v3 w WHERE w.owner=a.owner AND w.article_id=a.id) AND NOT EXISTS(SELECT 1 FROM editorial_flows w WHERE w.owner=a.owner AND w.article_id=a.id) AND NOT EXISTS(SELECT 1 FROM outline_flows w WHERE w.owner=a.owner AND w.article_id=a.id))`;
 const legacyLocal=`EXISTS(SELECT 1 FROM local_word_jobs a WHERE a.owner=${o} AND a.state='processing' AND a.result_key IS NULL AND a.claim_hash IS NOT NULL AND a.source_kind='local_desktop' AND a.output_mode='word_only' AND a.destinations_json='[]' AND NOT EXISTS(SELECT 1 FROM word_recovery c JOIN word_attempts t ON t.owner=c.owner AND t.target_kind=c.target_kind AND t.target_id=c.target_id AND t.attempt_id=c.attempt_id WHERE c.owner=a.owner AND c.target_kind='local_word' AND c.target_id=a.id AND c.claim_hash=a.claim_hash) AND NOT(${wordUnstartedClaimKnownSql('local_word')}))`;
 const attemptPermitted=`NOT EXISTS(SELECT 1 FROM word_attempts a JOIN word_recovery c ON c.owner=a.owner AND c.target_kind=a.target_kind AND c.target_id=a.target_id AND c.attempt_id=a.attempt_id WHERE ${target(owner,kind,id,'a')} AND (a.state IN ('stop_requested','waiting_safe_stop','blocked','saved') OR a.active_elapsed_ms+CASE WHEN a.active_started_at IS NULL THEN 0 ELSE MAX(0,${millis}-CAST(ROUND((julianday(a.active_started_at)-2440587.5)*86400000) AS INTEGER)) END>${wordAttemptTimeoutMs}))`;
 return `${attemptPermitted} AND NOT (${articlePurgeUnresolvedSql(o)}) AND NOT(${unresolved}) AND NOT(${legacyArticle}) AND NOT(${legacyLocal}) AND NOT EXISTS(SELECT 1 FROM word_service_incidents WHERE owner=${o} AND reason IN ('http_403','login_required','captcha') AND state<>'resolved') AND (NOT EXISTS(SELECT 1 FROM word_serial_slots s WHERE s.owner=${o}) OR EXISTS(SELECT 1 FROM word_serial_slots s WHERE s.owner=${o} AND s.target_kind=${k} AND s.target_id=${i} AND s.execution_id=${e} AND s.state='held'))`;
}
export function wordAttemptWriteSql(owner:string,kind:WordTarget,id:string,claimHash:string,tokenHash:string,epoch:number){
 return ` AND EXISTS(SELECT 1 FROM word_serial_slots s JOIN word_attempts a ON a.owner=s.owner AND a.target_kind=s.target_kind AND a.target_id=s.target_id AND a.attempt_id=s.attempt_id JOIN word_recovery c ON c.owner=s.owner AND c.target_kind=s.target_kind AND c.target_id=s.target_id AND c.attempt_id=s.attempt_id WHERE ${target(owner,kind,id,'s')} AND s.claim_hash=${wordAttemptSqlText(claimHash)} AND s.token_hash=${wordAttemptSqlText(tokenHash)} AND s.epoch=${epoch} AND s.execution_id=c.execution_id AND s.state='held' AND a.state='running' AND a.input_sha256=c.input_sha256 AND a.active_elapsed_ms+CASE WHEN a.active_started_at IS NULL THEN 0 ELSE MAX(0,${millis}-CAST(ROUND((julianday(a.active_started_at)-2440587.5)*86400000) AS INTEGER)) END<=${wordAttemptTimeoutMs})`;
}
export async function wordGrantAttemptStatements(owner:string,kind:WordTarget,id:string,requestKey:string,claimHash:string,executionId:string,tokenHash:string,epoch:number,initialManifest:string|null){
 await assertWordCredentialFree(owner,{initial_manifest:parse(initialManifest)});
 const previous=await attempt(owner,kind,id),attemptId=previous?.attempt_id||crypto.randomUUID(),initialStrategy=await hashText('initial-frozen-word-input-v1');
 const marker=`EXISTS(SELECT 1 FROM word_execution_receipts g JOIN word_recovery c ON c.owner=g.owner AND c.target_kind=g.target_kind AND c.target_id=g.target_id WHERE g.owner=? AND g.target_kind=? AND g.target_id=? AND g.request_key=? AND g.claim_hash=? AND g.execution_id=? AND g.token_hash=? AND c.request_key=g.request_key AND c.token_hash=g.token_hash AND c.epoch=g.epoch)`;
 const binds=[owner,kind,id,requestKey,claimHash,executionId,tokenHash];
 return [
  db().prepare(`INSERT OR IGNORE INTO word_attempts(owner,target_kind,target_id,attempt_id,generation,input_sha256,creation_request_key,strategy_sha256,strategy_reference,state,started_at,active_elapsed_ms,active_started_at,reason,initial_manifest_json,created,updated) SELECT c.owner,c.target_kind,c.target_id,?,1,c.input_sha256,?,?,'initial_frozen_input','running',${wordAttemptClock},0,${wordAttemptClock},'none',?,${wordAttemptClock},${wordAttemptClock} FROM word_recovery c WHERE c.owner=? AND c.target_kind=? AND c.target_id=? AND c.attempt_id IS NULL AND ${marker}`).bind(attemptId,requestKey,initialStrategy,initialManifest,owner,kind,id,...binds),
  db().prepare(`UPDATE word_recovery SET attempt_id=? WHERE owner=? AND target_kind=? AND target_id=? AND attempt_id IS NULL AND ${marker} AND EXISTS(SELECT 1 FROM word_attempts WHERE owner=? AND target_kind=? AND target_id=? AND attempt_id=?)`).bind(attemptId,owner,kind,id,...binds,owner,kind,id,attemptId),
  db().prepare(`UPDATE word_attempts SET state='running',started_at=COALESCE(started_at,${wordAttemptClock}),active_started_at=COALESCE(active_started_at,${wordAttemptClock}),reason='none',updated=${wordAttemptClock} WHERE ${target(owner,kind,id)} AND attempt_id=? AND state IN ('queued','paused_safe','ended','running') AND ${marker}`).bind(attemptId,...binds),
  db().prepare(`INSERT INTO word_serial_slots(owner,target_kind,target_id,input_sha256,attempt_id,claim_hash,execution_id,grant_request_key,token_hash,epoch,state,version,held_at,updated) SELECT c.owner,c.target_kind,c.target_id,c.input_sha256,c.attempt_id,c.claim_hash,c.execution_id,c.request_key,c.token_hash,c.epoch,'held',1,${wordAttemptClock},${wordAttemptClock} FROM word_recovery c WHERE c.owner=? AND c.target_kind=? AND c.target_id=? AND c.attempt_id=? AND ${marker} ON CONFLICT(owner) DO UPDATE SET token_hash=excluded.token_hash,epoch=excluded.epoch,grant_request_key=excluded.grant_request_key,version=word_serial_slots.version+1,updated=excluded.updated WHERE word_serial_slots.target_kind=excluded.target_kind AND word_serial_slots.target_id=excluded.target_id AND word_serial_slots.attempt_id=excluded.attempt_id AND word_serial_slots.execution_id=excluded.execution_id AND word_serial_slots.claim_hash=excluded.claim_hash AND word_serial_slots.state='held'`).bind(owner,kind,id,attemptId,...binds)
 ];
}
type VerifiedEnd={owner:string;kind:WordTarget;id:string;inputSha256:string;claimHash:string;executionId:string;proofSql:string;proofBinds?:any[];state:'ended'|'paused_safe';reason:string};
// Called only inside the caller's D1 batch after its immutable validated end
// marker. This hook does not authenticate an external terminal observation.
export function wordVerifiedEndStatements(p:VerifiedEnd){
 const scope=`${target(p.owner,p.kind,p.id,'s')} AND s.input_sha256=${wordAttemptSqlText(p.inputSha256)} AND s.claim_hash=${wordAttemptSqlText(p.claimHash)} AND s.execution_id=${wordAttemptSqlText(p.executionId)}`;
 const marker=`EXISTS(SELECT 1 FROM word_serial_slots s WHERE ${scope}) AND (${p.proofSql})`,binds=p.proofBinds||[];
 return [
  db().prepare(`UPDATE word_attempts SET state=?,active_elapsed_ms=active_elapsed_ms+CASE WHEN active_started_at IS NULL THEN 0 ELSE MAX(0,${millis}-CAST(ROUND((julianday(active_started_at)-2440587.5)*86400000) AS INTEGER)) END,active_started_at=NULL,ended_at=${wordAttemptClock},reason=?,updated=${wordAttemptClock} WHERE ${target(p.owner,p.kind,p.id)} AND attempt_id=(SELECT s.attempt_id FROM word_serial_slots s WHERE ${scope}) AND ${marker}`).bind(p.state,p.reason,...binds),
  db().prepare(`DELETE FROM word_serial_slots AS s WHERE ${scope} AND (${p.proofSql}) AND EXISTS(SELECT 1 FROM word_attempts a WHERE a.owner=s.owner AND a.target_kind=s.target_kind AND a.target_id=s.target_id AND a.attempt_id=s.attempt_id AND a.state IN ('ended','paused_safe'))`).bind(...binds)
 ];
}
export async function confirmWordAttemptSaved(owner:string,kind:WordTarget,id:string,outputId:string,sha:string,size:number){
 const table=kind==='article'?'articles':'local_word_jobs',output=kind==='article'?'result_meta':'output_meta';
 const proof=`EXISTS(SELECT 1 FROM ${table} r WHERE r.owner=? AND r.id=? AND r.result_key IS NOT NULL AND json_extract(r.${output},'$.output_id')=? AND json_extract(r.${output},'$.sha256')=? AND json_extract(r.${output},'$.size')=?)`;
 const binds=[owner,id,outputId,sha,size],a=await attempt(owner,kind,id);if(!a)return;
 await db().batch([
  db().prepare(`UPDATE word_attempts SET state='saved',active_elapsed_ms=active_elapsed_ms+CASE WHEN active_started_at IS NULL THEN 0 ELSE MAX(0,${millis}-CAST(ROUND((julianday(active_started_at)-2440587.5)*86400000) AS INTEGER)) END,active_started_at=NULL,ended_at=${wordAttemptClock},reason='native_finalize_full_readback',updated=${wordAttemptClock} WHERE ${target(owner,kind,id)} AND attempt_id=? AND state<>'saved' AND ${proof}`).bind(a.attempt_id,...binds),
  db().prepare(`DELETE FROM word_serial_slots WHERE ${target(owner,kind,id)} AND attempt_id=? AND ${proof} AND EXISTS(SELECT 1 FROM word_attempts WHERE ${target(owner,kind,id)} AND attempt_id=? AND state='saved')`).bind(a.attempt_id,...binds,a.attempt_id)
 ]);
}
async function receipt(owner:string,key:string){return db().prepare('SELECT * FROM word_attempt_requests WHERE owner=? AND request_key=?').bind(owner,key).first<Row>();}
async function requestStop(owner:string,kind:WordTarget,id:string,a:Record<string,any>){
 exact(a,['target_kind','target_id','input_sha256','attempt_id','request_key','reason']);identity(a.attempt_id);identity(a.request_key);
 if(!['timeout','pause','cancel','owner_request'].includes(a.reason))fail('停止原因无效');const scope=await owned(owner,kind,id),current=await attempt(owner,kind,id);
 if(!current||current.attempt_id!==a.attempt_id||scope.sha!==a.input_sha256||scope.r.result_key)fail('停止请求范围已变化；先读取同一任务');
 const payload=await hashText(JSON.stringify({kind,id,input:a.input_sha256,attempt:a.attempt_id,reason:a.reason})),prior=await receipt(owner,a.request_key);
 if(prior){if(prior.payload_sha256!==payload||prior.operation!=='stop')fail('停止请求键冲突');return {recorded:true,duplicate:true,attempt:await wordAttemptView(owner,kind,id),external_stop_confirmed:false};}
 const elapsed=`active_elapsed_ms+CASE WHEN active_started_at IS NULL THEN 0 ELSE MAX(0,${millis}-CAST(ROUND((julianday(active_started_at)-2440587.5)*86400000) AS INTEGER)) END`;
 const due=a.reason==='timeout'?` AND ${elapsed}>${wordAttemptTimeoutMs}`:'';
 const applicationNonce=crypto.randomUUID(),marker=`EXISTS(SELECT 1 FROM word_attempt_requests WHERE owner=? AND request_key=? AND payload_sha256=? AND json_extract(receipt_json,'$.application_nonce')=?)`,binds=[owner,a.request_key,payload,applicationNonce];
 const result=await db().batch([
  db().prepare(`INSERT OR IGNORE INTO word_attempt_requests(owner,request_key,target_kind,target_id,attempt_id,operation,payload_sha256,receipt_json,created) SELECT ?,?,?,?,?, 'stop',?,json_object('reason',?,'external_stop_confirmed',json('false'),'application_nonce',?),${wordAttemptClock} WHERE EXISTS(SELECT 1 FROM word_attempts WHERE ${target(owner,kind,id)} AND attempt_id=? AND state IN ('running','stop_requested','waiting_safe_stop')${due})`).bind(owner,a.request_key,kind,id,a.attempt_id,payload,a.reason,applicationNonce,a.attempt_id),
  db().prepare(`UPDATE word_attempts SET state='waiting_safe_stop',reason=CASE WHEN stop_requested_at IS NULL THEN ? ELSE reason END,stop_requested_at=COALESCE(stop_requested_at,${wordAttemptClock}),updated=${wordAttemptClock} WHERE ${target(owner,kind,id)} AND attempt_id=? AND ${marker}`).bind(a.reason,a.attempt_id,...binds),
  db().prepare(`UPDATE word_serial_slots SET state='waiting_safe_stop',version=version+1,updated=${wordAttemptClock} WHERE ${target(owner,kind,id)} AND attempt_id=? AND ${marker}`).bind(a.attempt_id,...binds),
  db().prepare(`UPDATE word_recovery SET version=version+1,epoch=epoch+1,token_hash=NULL,lease_until=NULL,status='await_executor',reason='waiting_safe_stop',updated=${wordAttemptClock} WHERE ${target(owner,kind,id)} AND attempt_id=? AND ${marker} AND token_hash IS NOT NULL`).bind(a.attempt_id,...binds)
 ]);
 const saved=await receipt(owner,a.request_key);
 if(!saved)fail('未到停止边界或原执行已经变化；不请求重开');
 if(saved.payload_sha256!==payload||saved.operation!=='stop'||saved.target_kind!==kind||saved.target_id!==id)fail('停止请求键已有不同回执；不接受冲突请求');
 return {recorded:true,duplicate:!result[0].meta.changes,attempt:await wordAttemptView(owner,kind,id),external_stop_confirmed:false,new_execution_grant:false};
}
export async function requestWordAttemptStop(owner:string,kind:WordTarget,id:string,reason:'timeout'|'pause'|'cancel'|'owner_request',requestKey?:string){const c=await attempt(owner,kind,id);if(!c||c.state!=='running')return null;return requestStop(owner,kind,id,{target_kind:kind,target_id:id,input_sha256:c.input_sha256,attempt_id:c.attempt_id,request_key:requestKey||crypto.randomUUID(),reason});}
export async function enforceWordAttemptDeadline(owner:string,kind:WordTarget,id:string){const view=await wordAttemptView(owner,kind,id);if(view?.timeout_due&&view.state==='running'){await requestWordAttemptStop(owner,kind,id,'timeout');return false;}return view?.state==='running';}
async function acknowledge(owner:string,kind:WordTarget,id:string,a:Record<string,any>){
 exact(a,['target_kind','target_id','input_sha256','attempt_id','claim_token','execution_token','execution_id','epoch','request_key','confirm_all_actions_settled','settled_reference','confirm_executor_ended','terminal_reference','state']);
 for(const k of ['attempt_id','claim_token','execution_token','execution_id','request_key'])identity(a[k]);reference(a.settled_reference);reference(a.terminal_reference);
 if(a.confirm_all_actions_settled!==true||a.confirm_executor_ended!==true||!['ended','paused_safe'].includes(a.state)||!Number.isSafeInteger(a.epoch))fail('实际执行结束及全部动作安全停止证据必需');
 const claimHash=await hashText(a.claim_token),tokenHash=await hashText(a.execution_token);
 await assertWordCredentialFree(owner,{settled_reference:a.settled_reference,terminal_reference:a.terminal_reference,execution_id:a.execution_id,request_key:a.request_key},[a.claim_token,a.execution_token]);
 const safe={target_kind:kind,target_id:id,input:a.input_sha256,attempt:a.attempt_id,claimHash,tokenHash,execution_id:a.execution_id,epoch:a.epoch,state:a.state,settled_reference:a.settled_reference,terminal_reference:a.terminal_reference,confirm_all_actions_settled:true,confirm_executor_ended:true};
 const payload=await hashText(JSON.stringify(safe)),prior=await receipt(owner,a.request_key);
 if(prior){if(prior.payload_sha256!==payload||prior.operation!=='settle'||prior.target_kind!==kind||prior.target_id!==id)fail('结束回执键冲突');return {recorded:true,duplicate:true,attempt:await wordAttemptView(owner,kind,id),new_execution_grant:false};}
 const {r,sha}=await owned(owner,kind,id);
 if(sha!==a.input_sha256||(kind==='article'?r.claim_token!==a.claim_token:r.claim_hash!==claimHash))fail('仅原当前认领者可报告自己的安全结束');
 const exactSlot=`${target(owner,kind,id)} AND attempt_id=? AND input_sha256=? AND claim_hash=? AND token_hash=? AND execution_id=? AND epoch=?`,slotBinds=[a.attempt_id,a.input_sha256,claimHash,tokenHash,a.execution_id,a.epoch];
 const applicationNonce=crypto.randomUUID(),marker="EXISTS(SELECT 1 FROM word_attempt_requests WHERE owner=? AND request_key=? AND payload_sha256=? AND json_extract(receipt_json,'$.application_nonce')=?)",markerBinds=[owner,a.request_key,payload,applicationNonce];
 const result=await db().batch([
  db().prepare(`INSERT OR IGNORE INTO word_attempt_requests(owner,request_key,target_kind,target_id,attempt_id,operation,payload_sha256,receipt_json,created) SELECT ?,?,?,?,?, 'settle',?,?,${wordAttemptClock} WHERE EXISTS(SELECT 1 FROM word_serial_slots WHERE ${exactSlot})`).bind(owner,a.request_key,kind,id,a.attempt_id,payload,JSON.stringify({...safe,application_nonce:applicationNonce}),...slotBinds),
  ...wordVerifiedEndStatements({owner,kind,id,inputSha256:a.input_sha256,claimHash,executionId:a.execution_id,proofSql:marker,proofBinds:markerBinds,state:a.state,reason:'executor_ended_settled'}),
  db().prepare(`UPDATE word_recovery SET version=version+1,epoch=epoch+1,token_hash=NULL,lease_until=NULL,status='await_executor',reason='executor_ended_settled',updated=${wordAttemptClock} WHERE ${target(owner,kind,id)} AND attempt_id=? AND ${marker}`).bind(a.attempt_id,...markerBinds)
 ]);
 const saved=await receipt(owner,a.request_key);
 if(!saved)fail('原执行身份已变化；不接受未知或晚到结束');
 if(saved.payload_sha256!==payload||saved.operation!=='settle'||saved.target_kind!==kind||saved.target_id!==id)fail('结束请求键已有不同回执；不接受冲突请求');
 return {recorded:true,duplicate:!result[0].meta.changes,attempt:await wordAttemptView(owner,kind,id),existing_results_preserved:true,new_execution_grant:false,evidence:'current_holder_end_and_actions_settled_attestation'};
}
async function restart(owner:string,kind:WordTarget,id:string,a:Record<string,any>){
 exact(a,['target_kind','target_id','input_sha256','attempt_id','expected_generation','request_key','strategy_sha256','strategy_reference','confirm_same_frozen_input','confirm_existing_results_read']);
 identity(a.attempt_id);identity(a.request_key);reference(a.strategy_reference);
 if(!digest.test(a.strategy_sha256)||!Number.isSafeInteger(a.expected_generation)||a.confirm_same_frozen_input!==true||a.confirm_existing_results_read!==true)fail('重配需要原文、原成果回读和新素材策略');
 await assertWordCredentialFree(owner,{request_key:a.request_key,strategy_reference:a.strategy_reference});
 const payload=await hashText(JSON.stringify({kind,id,input:a.input_sha256,attempt:a.attempt_id,generation:a.expected_generation,strategy:a.strategy_sha256,reference:a.strategy_reference})),prior=await receipt(owner,a.request_key);
 if(prior){if(prior.payload_sha256!==payload||prior.operation!=='restart')fail('重配请求键冲突');return {recorded:true,duplicate:true,attempt:await wordAttemptView(owner,kind,id),new_execution_grant:false};}
 const s=await owned(owner,kind,id),c=await db().prepare('SELECT * FROM word_recovery WHERE owner=? AND target_kind=? AND target_id=?').bind(owner,kind,id).first<Row>(),old=await attempt(owner,kind,id);
 if(!old||old.attempt_id!==a.attempt_id||old.generation!==a.expected_generation||s.sha!==a.input_sha256||s.r.state!=='processing'||s.r.result_key||s.r[s.output]!==null)fail('已有正式或未知 Word 输出须先读同一身份；不能重配覆盖');
 if(old.generation>=wordAttemptMaxRestarts+1)fail('自动重配次数已达上限；已有成果保留');
 if(old.state!=='ended'&&old.state!=='paused_safe')fail('旧执行尚未确认安全结束；等待安全停止');
 if(c?.status==='blocked'||['http_403','login_required','captcha'].includes(c?.reason)||['http_403','login_required','captcha'].includes(old.reason)||await db().prepare("SELECT 1 FROM word_service_incidents WHERE owner=? AND reason IN ('http_403','login_required','captcha') AND state<>'resolved' LIMIT 1").bind(owner).first())fail('既有访问或权限阻碍未解除；不自动刷新重试');
 if(old.strategy_sha256===a.strategy_sha256||await db().prepare("SELECT 1 FROM word_checkpoints WHERE owner=? AND target_kind=? AND target_id=? AND kind='word' LIMIT 1").bind(owner,kind,id).first())fail('需不同素材策略；已有完整或部分 Word 必须先回读，不能重制');
 const next=crypto.randomUUID(),manifest=parse(s.r.artifact_manifest),nextManifest=manifest?JSON.stringify({...manifest,layout:null}):null;
 const eligible=`EXISTS(SELECT 1 FROM word_attempts WHERE ${target(owner,kind,id)} AND attempt_id=? AND generation=? AND generation<3 AND state IN ('ended','paused_safe') AND reason NOT IN ('http_403','login_required','captcha')) AND NOT EXISTS(SELECT 1 FROM word_serial_slots WHERE owner=?) AND NOT EXISTS(SELECT 1 FROM word_service_incidents WHERE owner=${wordAttemptSqlText(owner)} AND reason IN ('http_403','login_required','captcha') AND state<>'resolved') AND NOT EXISTS(SELECT 1 FROM word_checkpoints WHERE ${target(owner,kind,id)} AND kind='word') AND EXISTS(SELECT 1 FROM ${s.table} WHERE owner=? AND id=? AND ${s.source}=? AND ${s.output} IS NULL AND result_key IS NULL AND state='processing' AND artifact_manifest IS ?) AND EXISTS(SELECT 1 FROM word_recovery WHERE ${target(owner,kind,id)} AND attempt_id=? AND version=? AND status<>'blocked' AND reason NOT IN ('http_403','login_required','captcha'))`;
 const eligibleBinds=[old.attempt_id,old.generation,owner,owner,id,s.r[s.source],s.r.artifact_manifest,old.attempt_id,c!.version];
 const marker='EXISTS(SELECT 1 FROM word_attempt_requests WHERE owner=? AND request_key=? AND payload_sha256=? AND attempt_id=?)',binds=[owner,a.request_key,payload,next];
 const result=await db().batch([
  db().prepare(`INSERT OR IGNORE INTO word_attempt_requests(owner,request_key,target_kind,target_id,attempt_id,operation,payload_sha256,receipt_json,created) SELECT ?,?,?,?,?, 'restart',?,?,${wordAttemptClock} WHERE ${eligible}`).bind(owner,a.request_key,kind,id,next,payload,JSON.stringify({previous_attempt_id:old.attempt_id,generation:old.generation+1,strategy_sha256:a.strategy_sha256,strategy_reference:a.strategy_reference,archived_manifest_json:s.r.artifact_manifest,new_execution_grant:false}),...eligibleBinds),
  db().prepare(`INSERT OR IGNORE INTO word_attempts(owner,target_kind,target_id,attempt_id,generation,input_sha256,creation_request_key,previous_attempt_id,strategy_sha256,strategy_reference,state,active_elapsed_ms,reason,initial_manifest_json,created,updated) SELECT ?,?,?,?,?,?,?,?,?,?,'queued',0,'new_material_strategy',?,${wordAttemptClock},${wordAttemptClock} WHERE ${marker}`).bind(owner,kind,id,next,old.generation+1,s.sha,a.request_key,old.attempt_id,a.strategy_sha256,a.strategy_reference,nextManifest,...binds),
  db().prepare(`UPDATE ${s.table} SET artifact_manifest=? WHERE owner=? AND id=? AND artifact_manifest IS ? AND ${s.source}=? AND ${s.output} IS NULL AND result_key IS NULL AND ${marker}`).bind(nextManifest,owner,id,s.r.artifact_manifest,s.r[s.source],...binds),
  db().prepare(`UPDATE word_recovery SET attempt_id=?,version=version+1,epoch=epoch+1,token_hash=NULL,lease_until=NULL,status='await_executor',reason='new_attempt_queued',updated=${wordAttemptClock} WHERE ${target(owner,kind,id)} AND attempt_id=? AND version=? AND ${marker}`).bind(next,old.attempt_id,c!.version,...binds),
  db().prepare(`DELETE FROM word_execution_queue WHERE ${target(owner,kind,id)} AND ${marker}`).bind(...binds)
 ]);
 const saved=await receipt(owner,a.request_key);
 if(!saved)fail('原尝试、输出或停止状态已变化；先读同一任务');
 if(saved.payload_sha256!==payload||saved.operation!=='restart'||saved.target_kind!==kind||saved.target_id!==id)fail('重配请求键已有不同回执；不接受冲突请求');
 return {recorded:true,duplicate:!result[0].meta.changes,attempt:await wordAttemptView(owner,kind,id),same_article:true,original_input_preserved:true,previous_results_preserved:true,new_execution_grant:false};
}
export async function wordAttemptCall(owner:string,name:string,a:Record<string,any>){
 const kind=a.target_kind as WordTarget,id=String(a.target_id);
 if(name==='read_word_attempt'){exact(a,['target_kind','target_id','request_key']);await owned(owner,kind,id);if(a.request_key!==undefined)identity(a.request_key);const prior=a.request_key?await receipt(owner,a.request_key):null;if(prior&&(prior.target_kind!==kind||prior.target_id!==id))fail('回执不属于当前文章');return {attempt:await wordAttemptView(owner,kind,id),request_receipt:a.request_key?prior?{recorded:true,request_key:prior.request_key,operation:prior.operation,attempt_id:prior.attempt_id,created:prior.created}: {recorded:false,request_key:a.request_key}:null,serial_mode:true,automatic_external_stop_available:false,new_execution_grant:false};}
 if(name==='request_word_safe_stop')return requestStop(owner,kind,id,a);
 if(name==='acknowledge_word_attempt_stopped')return acknowledge(owner,kind,id,a);
 if(name==='restart_word_attempt')return restart(owner,kind,id,a);
 fail('配图尝试操作无效');
}
