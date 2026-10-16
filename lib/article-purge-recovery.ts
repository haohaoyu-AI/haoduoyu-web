import { db } from './test-store';
import { ArticleDeletionError } from './article-deletion';
import { assertWordCredentialFree } from './word-credentials';
import { wordSerialCapacitySql } from './word-attempts';

// An owner-observed terminal receipt is a separate evidence type. It is never
// an original-holder acknowledgement or server verification of a Codex process.
// Original source fences and the serial admission predicates remain unchanged.
type Row = Record<string, any>;
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const now = () => new Date().toISOString();
const identityFields = ['owner','article_id','operation_id','claim_sha256','execution_sha256','input_sha256','grant_request_key','token_sha256','epoch','acquisition_request_key','holder_mode'] as const;
const hash = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))).map(v => v.toString(16).padStart(2,'0')).join('');
function fail(message: string, code = 409): never { throw new ArticleDeletionError(message, code); }
function timestamp(value: unknown): value is string { return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function reference(value: unknown) { if (typeof value !== 'string' || !value.trim() || value.length > 240 || /[\x00-\x1f\x7f]/.test(value)) fail('需要真实工具观察及动作结清引用',400); }

async function context(owner: string, articleId: string) {
 if (!owner || !uuid(articleId)) fail('删除任务范围无效',400);
 const b = await db().prepare('SELECT * FROM article_purge_serial_blocks WHERE owner=? AND article_id=?').bind(owner,articleId).first<Row>();
 if (!b) fail('没有找到本人的原执行保护记录',404);
 const o = await db().prepare('SELECT * FROM article_list_deletions WHERE owner=? AND id=?').bind(owner,b.operation_id).first<Row>();
 const tombstone = await db().prepare("SELECT id,operation_id,state,deleted_at FROM article_deletions WHERE owner=? AND id=? AND operation_id=? AND state='deleted'").bind(owner,articleId,b.operation_id).first<Row>();
 const live = await db().prepare('SELECT id FROM articles WHERE owner=? AND id=?').bind(owner,articleId).first();
 if (!o || o.scope !== 'all_articles' || o.state !== 'deleted' || !o.confirmed_at || !tombstone || live) fail('仅可核验已完成永久删除的原任务，不能恢复或抢占现有文章');
 let targets: Row[];
 try { targets = JSON.parse(o.snapshot_json); } catch { fail('原删除快照不可核验'); }
 if (!Array.isArray(targets) || await hash(o.snapshot_json) !== o.snapshot_sha256 || !targets.some(x => x.id === articleId)) fail('原删除快照身份不一致');
 const fences = (await db().prepare('SELECT entity_kind,entity_key,article_id,operation_id FROM article_content_fences WHERE owner=? AND article_id=? ORDER BY entity_kind,entity_key').bind(owner,articleId).all<Row>()).results;
 // The original purge protects the primary article with its immutable deletion
 // tombstone. It does not manufacture an entity_kind=articles fence. Related
 // acquisition/handoff fences below must still match the exact original scope.
 const graph = targets[0]?.graph;
 const receipt = Array.isArray(graph) ? graph.find((g: Row) => g.table === 'article_help_queue_claims' && g.article_id === articleId && JSON.stringify(g.keys) === '["request_key"]' && Array.isArray(g.values) && g.values.length === 1 && g.values[0] === b.acquisition_request_key && g.action === 'delete') : null;
 const hasWordGrant = Array.isArray(graph) && graph.some((g: Row) => g.article_id === articleId && ['word_execution_receipts','word_serial_slots'].includes(g.table));
 const eligible = b.holder_mode === 'manual_help' && digest(b.claim_sha256) && digest(b.input_sha256) && uuid(b.acquisition_request_key)
  && b.execution_sha256 === null && b.token_sha256 === null && b.epoch === null && b.grant_request_key === null && !hasWordGrant
  && digest(receipt?.fingerprint) && fences.some(f => f.entity_kind === 'article_help_queue_claims' && f.entity_key === b.acquisition_request_key && f.operation_id === b.operation_id);
 const snapshot = await hash(JSON.stringify({ contract_version:1, block:Object.fromEntries(identityFields.map(k => [k,b[k]])), block_created:b.created,
  purge_snapshot_sha256:o.snapshot_sha256, tombstone, fences, original_receipt_sha256:receipt?.fingerprint ?? null }));
 return { b,o,tombstone,fences,receipt,eligible:!!eligible,snapshot };
}

export async function previewDeletedArticleExecutorRecovery(owner: string, articleId: string) {
 const c = await context(owner,articleId);
 const end = await db().prepare('SELECT request_key,evidence_kind FROM article_purge_executor_ends WHERE owner=? AND article_id=? AND operation_id=? LIMIT 1').bind(owner,articleId,c.b.operation_id).first<Row>();
 return { article_id:articleId,operation_id:c.b.operation_id,context_sha256:c.snapshot,holder_mode:c.b.holder_mode,
  input_sha256:c.b.input_sha256,original_acquisition_request_key:c.b.acquisition_request_key,original_receipt_sha256:c.receipt?.fingerprint ?? null,
  eligible_for_observation:c.eligible,serial_safety_block_resolved:!!end,end_request_key:end?.request_key ?? null,evidence_kind:end?.evidence_kind ?? null,
  requires_real_execution_mapping:true,required_evidence:['original_receipt_handoff_event_created','exact_acquisition_to_actual_execution_thread_turn_tool_trace','actual_terminal_tool_observation','all_issued_actions_stopped_and_settled'],
  reason:c.eligible?'可提交精确原领取映射和真实终态证据；预检不是停止证明，也不授予新执行':'原领取映射不完整或包含Word grant，保留原持有者协议和串行保护',
  server_verified:false,external_stop_confirmed:false,new_execution_grant:false };
}

export async function readWordSerialAdmission(owner: string, kind: 'article'|'local_word', id: string) {
 if (!owner || !['article','local_word'].includes(kind) || !(kind === 'article' ? uuid(id) : id.startsWith('localword_') && uuid(id.slice(10)))) fail('Word 任务范围无效',400);
 const table = kind === 'article' ? 'articles' : 'local_word_jobs';
 const claimColumn = kind === 'article' ? 'claim_token' : 'claim_hash';
 const current = await db().prepare(`SELECT c.execution_id FROM ${table} r LEFT JOIN word_recovery c ON c.owner=r.owner AND c.target_kind=? AND c.target_id=r.id WHERE r.owner=? AND r.id=?`).bind(kind,owner,id).first<Row>();
 if (!current) fail('没有找到本人的Word任务',404);
 // Use the unchanged admission predicate. A control replacement between these
 // reads makes the old execution identity fail closed, never grants permission.
 const gate = wordSerialCapacitySql(owner,kind,id,uuid(current.execution_id) ? current.execution_id : undefined);
 const match = identityFields.map(k => `e.${k} IS b.${k}`).join(' AND ');
 const r = await db().prepare(`SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now') AS read_at,
  (${gate}) AS possible,
  (r.state='processing' AND r.result_key IS NULL AND r.${claimColumn} IS NOT NULL AND r.claim_expires>strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS claim_live,
  (SELECT COUNT(*) FROM article_purge_serial_blocks b WHERE b.owner=r.owner AND NOT EXISTS(SELECT 1 FROM article_purge_executor_ends e WHERE ${match} AND e.all_actions_stopped=1 AND e.all_actions_settled=1 AND e.server_verified=0)) AS purge_count,
  EXISTS(SELECT 1 FROM word_serial_slots s WHERE s.owner=r.owner) AS slot_present,
  EXISTS(SELECT 1 FROM word_serial_slots s WHERE s.owner=r.owner AND s.target_kind=? AND s.target_id=r.id AND s.state='held') AS owns_slot,
  (SELECT COUNT(*) FROM word_service_incidents i WHERE i.owner=r.owner AND i.reason IN ('http_403','login_required','captcha') AND i.state<>'resolved') AS incident_count
  FROM ${table} r WHERE r.owner=? AND r.id=?`).bind(kind,owner,id).first<Row>();
 if (!r) fail('任务在回读期间改变；重新读取同一任务');
 return {target_kind:kind,target_id:id,read_at:r.read_at,serial_admission_possible:!!r.possible,business_claim_live:!!r.claim_live,
  unresolved_purge_count:r.purge_count,owner_slot_present:!!r.slot_present,current_target_owns_slot:!!r.owns_slot,blocking_incident_count:r.incident_count,
  other_serial_blockers_possible:!r.possible&&!r.purge_count&&!r.slot_present&&!r.incident_count,
  new_execution_grant:false,automatic_dispatch_available:false,read_only:true};
}

export type DeletedArticleExecutorObservation = {
 article_id:string;operation_id:string;request_key:string;expected_snapshot_sha256:string;input_sha256:string;original_acquisition_request_key:string;
 receipt_handoff_id:string;receipt_event_id:string;receipt_created:string;execution_id:string;thread_id:string;turn_id:string;
 evidence_source:'codex_app_tools';terminal_state:'completed'|'failed'|'cancelled';ended_at:string;observed_at:string;
 execution_mapping_reference:string;end_reference:string;settled_reference:string;confirm_all_actions_stopped:true;confirm_all_actions_settled:true;
};
const observationKeys = ['article_id','operation_id','request_key','expected_snapshot_sha256','input_sha256','original_acquisition_request_key','receipt_handoff_id','receipt_event_id','receipt_created','execution_id','thread_id','turn_id','evidence_source','terminal_state','ended_at','observed_at','execution_mapping_reference','end_reference','settled_reference','confirm_all_actions_stopped','confirm_all_actions_settled'];

export async function readDeletedArticleExecutorObservation(owner: string, articleId: string, requestKey: string) {
 if (!owner || !uuid(articleId) || !uuid(requestKey)) fail('回执范围无效',400);
 const r = await db().prepare('SELECT article_id,operation_id,request_key,snapshot_sha256,payload_sha256,terminal_state,acquired_at,ended_at,observed_at,created FROM article_purge_executor_observations WHERE owner=? AND request_key=?').bind(owner,requestKey).first<Row>();
 if (!r) return {article_id:articleId,request_key:requestKey,recorded:false,retry_same_request_key:true,new_execution_grant:false};
 if (r.article_id !== articleId) fail('原回执键属于另一任务');
 const end = await db().prepare("SELECT request_key FROM article_purge_executor_ends WHERE owner=? AND request_key=? AND article_id=? AND operation_id=? AND payload_sha256=? AND evidence_kind='owner_observed_codex_terminal'").bind(owner,requestKey,articleId,r.operation_id,r.payload_sha256).first();
 return {article_id:articleId,operation_id:r.operation_id,request_key:requestKey,recorded:!!end,observation_recorded:true,context_sha256:r.snapshot_sha256,
  terminal_state:r.terminal_state,acquired_at:r.acquired_at,ended_at:r.ended_at,observed_at:r.observed_at,recorded_at:r.created,
  evidence_kind:'owner_observed_codex_terminal',server_verified:false,external_stop_confirmed:false,serial_safety_block_resolved:!!end,
  retry_same_request_key:!end,new_execution_grant:false};
}

export async function recordDeletedArticleExecutorObservation(owner: string, a: DeletedArticleExecutorObservation) {
 if (!a || typeof a !== 'object' || Array.isArray(a) || Object.keys(a).some(k => !observationKeys.includes(k)) || observationKeys.some(k => !Object.hasOwn(a,k))) fail('原执行工具观察字段不完整',400);
 for (const value of [a.article_id,a.operation_id,a.request_key,a.original_acquisition_request_key,a.receipt_handoff_id,a.execution_id,a.thread_id,a.turn_id]) if (!uuid(value)) fail('需要系统实际身份及原领取编号',400);
 if (!(typeof a.receipt_event_id === 'string' && (a.receipt_event_id.startsWith('article_wake_') && uuid(a.receipt_event_id.slice(13)) || uuid(a.receipt_event_id)))) fail('需要原领取回执中的实际事件编号',400);
 if (!digest(a.expected_snapshot_sha256) || !digest(a.input_sha256) || a.evidence_source !== 'codex_app_tools' || !['completed','failed','cancelled'].includes(a.terminal_state)
  || a.confirm_all_actions_stopped !== true || a.confirm_all_actions_settled !== true) fail('不能以删除、失联、idle、超时或owner意愿代替真实终态与动作结清',400);
 for (const value of [a.receipt_created,a.ended_at,a.observed_at]) if (!timestamp(value)) fail('需要准确UTC毫秒时间',400);
 if (Date.parse(a.receipt_created) > Date.parse(a.ended_at) || Date.parse(a.ended_at) > Date.parse(a.observed_at) || Date.parse(a.observed_at) > Date.now()) fail('原领取、终态或观察时间顺序不可核验');
 for (const value of [a.execution_mapping_reference,a.end_reference,a.settled_reference]) reference(value);
 await assertWordCredentialFree(owner,a);
 const c = await context(owner,a.article_id), b = c.b;
 if (!c.eligible || b.operation_id !== a.operation_id || c.snapshot !== a.expected_snapshot_sha256 || b.input_sha256 !== a.input_sha256 || b.acquisition_request_key !== a.original_acquisition_request_key) fail('原任务、领取或冻结快照不匹配；不能释放其他持有者');
 // Rebuild the exact original D1 row in its immutable schema order. The purge
 // retained only its SHA; guessed timestamps or a new mapping cannot match it.
 const originalReceipt = {owner,request_key:b.acquisition_request_key,article_id:b.article_id,handoff_id:a.receipt_handoff_id,event_id:a.receipt_event_id,claim_hash:b.claim_sha256,created:a.receipt_created};
 const receiptHash = await hash(JSON.stringify(originalReceipt));
 if (receiptHash !== c.receipt.fingerprint || Date.parse(a.receipt_created) > Date.parse(b.created)
  || !c.fences.some(f => f.entity_kind === 'article_handoffs' && f.entity_key === a.receipt_handoff_id && f.operation_id === b.operation_id)) fail('原领取工具回执与冻结历史不匹配；不补造时间或执行映射');
 const executionHash = await hash(a.execution_id), threadHash = await hash(a.thread_id), turnHash = await hash(a.turn_id);
 const mappingHash = await hash(a.execution_mapping_reference), endHash = await hash(a.end_reference), settledHash = await hash(a.settled_reference);
 const stored = {owner,request_key:a.request_key,article_id:b.article_id,operation_id:b.operation_id,snapshot_sha256:c.snapshot,purge_snapshot_sha256:c.o.snapshot_sha256,
  claim_sha256:b.claim_sha256,input_sha256:b.input_sha256,acquisition_request_key:b.acquisition_request_key,original_receipt_sha256:receiptHash,
  observed_execution_sha256:executionHash,thread_sha256:threadHash,turn_sha256:turnHash,mapping_reference_sha256:mappingHash,end_reference_sha256:endHash,settled_reference_sha256:settledHash,
  acquired_at:a.receipt_created,ended_at:a.ended_at,observed_at:a.observed_at,terminal_state:a.terminal_state,evidence_source:a.evidence_source,all_actions_stopped:1,all_actions_settled:1,server_verified:0};
 const payload = await hash(JSON.stringify(stored));
 const prior = await db().prepare('SELECT payload_sha256 FROM article_purge_executor_observations WHERE owner=? AND request_key=?').bind(owner,a.request_key).first<Row>();
 const priorEnd = await db().prepare('SELECT payload_sha256,evidence_kind FROM article_purge_executor_ends WHERE owner=? AND request_key=?').bind(owner,a.request_key).first<Row>();
 if (prior && prior.payload_sha256 !== payload || priorEnd && (priorEnd.payload_sha256 !== payload || priorEnd.evidence_kind !== 'owner_observed_codex_terminal')) fail('原请求键已绑定不同任务或证据；未知响应只能回读同键');
 const time = now(), columns = [...Object.keys(stored),'payload_sha256','created'];
 const exactBlock = identityFields.map(k => `${k} IS ?`).join(' AND '), blockBindings = identityFields.map(k => b[k]);
 await db().batch([
  db().prepare(`INSERT OR IGNORE INTO article_purge_executor_observations(${columns.join(',')}) SELECT ${columns.map(() => '?').join(',')} WHERE EXISTS(SELECT 1 FROM article_purge_serial_blocks WHERE ${exactBlock})`).bind(...Object.values(stored),payload,time,...blockBindings),
  db().prepare(`INSERT OR IGNORE INTO article_purge_executor_ends(owner,article_id,operation_id,request_key,payload_sha256,claim_sha256,execution_sha256,input_sha256,grant_request_key,token_sha256,epoch,acquisition_request_key,holder_mode,observed_execution_sha256,evidence_kind,end_reference_sha256,settled_reference_sha256,all_actions_stopped,all_actions_settled,server_verified,created)
   SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,'owner_observed_codex_terminal',?,?,1,1,0,p.created FROM article_purge_executor_observations p WHERE p.owner=? AND p.request_key=? AND p.payload_sha256=? AND EXISTS(SELECT 1 FROM article_purge_serial_blocks WHERE ${exactBlock})`)
   .bind(owner,b.article_id,b.operation_id,a.request_key,payload,b.claim_sha256,b.execution_sha256,b.input_sha256,b.grant_request_key,b.token_sha256,b.epoch,b.acquisition_request_key,b.holder_mode,executionHash,endHash,settledHash,owner,a.request_key,payload,...blockBindings),
 ]);
 // A competing payload can win after the initial prior read. OR IGNORE must
 // never acknowledge that winner as this caller's successful observation.
 const saved = await db().prepare('SELECT o.payload_sha256,o.article_id,o.operation_id,e.payload_sha256 AS end_payload,e.evidence_kind FROM article_purge_executor_observations o LEFT JOIN article_purge_executor_ends e ON e.owner=o.owner AND e.request_key=o.request_key WHERE o.owner=? AND o.request_key=?').bind(owner,a.request_key).first<Row>();
 if (saved && (saved.payload_sha256 !== payload || saved.article_id !== a.article_id || saved.operation_id !== a.operation_id || saved.end_payload && (saved.end_payload !== payload || saved.evidence_kind !== 'owner_observed_codex_terminal'))) fail('并发回执键已绑定不同任务或证据；未接受本次观察');
 const read = await readDeletedArticleExecutorObservation(owner,a.article_id,a.request_key);
 if (!read.recorded) fail('结束回执尚未独立读回；只回读并重试同一请求键',503);
 return {...read,duplicate:!!prior,existing_source_fences_preserved:true,article_restored:false};
}
