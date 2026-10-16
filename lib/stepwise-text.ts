import {numericCredentialSafeUsage} from './credential-boundary';
import {db} from './test-store';
import {assembleWritingInput, assertNoCredentialText, hashText, writingInputSkeleton, type WritingInputSnapshot} from './writing-input';
import {effectiveWritingStyleVersion} from './writing-supplement';
import {fixedReferenceSources} from './writing-fixed-references';
import {writingOutlineHelp, writingOutlineTemplate} from './writing-outline-template';
import {parseClaudeArticle} from './claude-article-parser';
import {requestStepwiseClaudeOnce, assertStepwiseCredentialFree, protectStepwiseOutputForOwner} from './claude';
import {stepwiseErrors as errors} from './stepwise-text-errors';

// Independent of old manual/daily/test/rewrite keys. There is no reset or retry API.
export const stepwiseTextAuthorizationKey = '2026-10-05-stepwise-text-pair';
export const stepwiseTextKind = (runId: string) => `stepwise_text:${runId}`;
export const stepwiseTextAttemptId = (owner: string, runId: string, writer: Writer) => `stepwise_text:${owner}:${runId}:${writer}`;
export const stepwiseTextInstructions = '本轮为2026年10月5日单次双作者纯文字测试。每个阶段由用户确认后才进入下一阶段。本次仅生成文章标题与正文；用户确认正文后，由系统制作无配图Word，到此结束，不触发配图、平台草稿或公开发布。此限制优先于通用提示词中自动衔接配图投递的描述。保持默认不署名、标题正文分离和冻结后不改文。模型仅执行已获准的写作阶段，按本篇冻结选题、资料与框架写作，返回指定JSON。';
type Writer = 'xiaoyu' | 'claude';
type Article = {title: string; paragraphs: string[]};
type TopicInput = {topic: unknown; materials: unknown; outline: unknown; sources: unknown};
export type StepwiseTextSnapshot = {
 namespace_version: 1; scope: typeof stepwiseTextAuthorizationKey;
 instructions: string; fixed_inputs: typeof fixedReferenceSources;
 model: string; expected_model: string; prompt_version: string;
 writers: Record<Writer, WritingInputSnapshot>;
 max_output_tokens: 14000; timeout_ms: 300000; max_requests: 1;
};
type Batch = {id: string; owner: string; day: string; input_hash: string; snapshot: StepwiseTextSnapshot; created: string};
type Lease = {state: string; token: string; expires: string; article_id: string; input_snapshot: string};
type Output = {
 namespace_version: 1; writer: Writer; source: 'agent_text' | 'provider_text';
 run_id: string; item_id: string; input_hash: string; body_sha256?: string;
 article?: Article; parse?: {repair: string | null; removedTitleDuplicate: boolean};
 text?: string | null; raw_response?: string | null; partial_text?: string | null; raw_partial_response?: string | null;
 usage?: unknown; diagnostic?: {stage: string; code?: string; [key: string]: unknown};
 requested_model?: string; returned_model?: string | null; error?: string;
};
type Attempt = {state: string; response: string; created: string};
type GenerateInput = {run_id: string; item_id: string; token: string; expected_model: string; confirm: true};
export type StepwisePrepared = {owner: string; input: GenerateInput};
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function stepwiseKeys(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
 if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw Error(errors.invalid);
}
function confirmed(value: Record<string, unknown>) { if (value.confirm !== true) throw Error(errors.confirm); }
function writerOf(value: unknown): Writer { if (value !== 'xiaoyu' && value !== 'claude') throw Error(errors.invalid); return value; }
const now = () => new Date().toISOString();
async function getBatch(owner: string, runId: unknown): Promise<Batch> {
 if (!uuid(runId)) throw Error(errors.invalid);
 const row = await db().prepare('SELECT id,owner,day,input_hash,snapshot,created FROM manual_writing_batches WHERE id=? AND owner=? AND authorization_key=?').bind(runId, owner, stepwiseTextAuthorizationKey).first<Omit<Batch, 'snapshot'> & {snapshot: string}>();
 if (!row) throw Error(errors.missing);
 const snapshot: StepwiseTextSnapshot = JSON.parse(row.snapshot);
 if (snapshot.namespace_version !== 1 || snapshot.scope !== stepwiseTextAuthorizationKey || snapshot.model !== snapshot.expected_model || snapshot.max_requests !== 1 || snapshot.max_output_tokens !== 14000 || snapshot.timeout_ms !== 300000 || await hashText(JSON.stringify(snapshot)) !== row.input_hash) throw Error(errors.changed);
 const batch = {...row, snapshot};
 await credentialCheck(owner, snapshot, await tokensFor(owner, batch));
 return batch;
}
async function leaseFor(owner: string, batch: Batch, writer: Writer) {
 return db().prepare('SELECT state,token,expires,article_id,input_snapshot FROM writing_runs WHERE owner=? AND day=? AND writer=? AND run_kind=?').bind(owner, batch.day, writer, stepwiseTextKind(batch.id)).first<Lease>();
}
async function attemptFor(owner: string, batch: Batch, writer: Writer) {
 return db().prepare('SELECT state,response,created FROM claude_attempts WHERE id=? AND owner=?').bind(stepwiseTextAttemptId(owner, batch.id, writer), owner).first<Attempt>();
}
function outputOf(row: Attempt, batch: Batch, writer: Writer, lease: Lease | null): Output {
 const envelope = JSON.parse(row.response);
 const output: Output = envelope.stepwise_text;
 if (!output || Object.keys(envelope).length !== 1 || output.namespace_version !== 1 || output.writer !== writer || output.run_id !== batch.id || output.item_id !== lease?.article_id || output.input_hash !== batch.input_hash || output.source !== (writer === 'xiaoyu' ? 'agent_text' : 'provider_text')) throw Error(errors.changed);
 return output;
}
function boundLease(lease: Lease | null, batch: Batch, writer: Writer, value: Record<string, unknown>): asserts lease is Lease {
 if (!lease || !uuid(value.item_id) || !uuid(value.token) || lease.article_id !== value.item_id || lease.token !== value.token) throw Error(errors.claim);
 if (lease.input_snapshot !== JSON.stringify(batch.snapshot.writers[writer])) throw Error(errors.changed);
}
function active(lease: Lease) { if (lease.state !== 'stepwise_claimed' || !Number.isFinite(Date.parse(lease.expires)) || Date.parse(lease.expires) <= Date.now()) throw Error(errors.expired); }
async function configuredModel(owner: string, model: unknown) {
 const config = await db().prepare('SELECT model,enabled FROM claude_settings WHERE owner=?').bind(owner).first<{model: string; enabled: string}>();
 if (!config || config.enabled !== '1' || config.model !== model) throw Error(errors.model);
 return config.model;
}
function articleOf(value: unknown): Article {
 stepwiseKeys(value, ['title', 'paragraphs']);
 if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 120 || !Array.isArray(value.paragraphs) || value.paragraphs.length < 1 || value.paragraphs.length > 160 || value.paragraphs.some(p => typeof p !== 'string' || !p.trim() || p.length > 1000)) throw Error(errors.body);
 const {article} = parseClaudeArticle(JSON.stringify(value));
 const length = article.paragraphs.join('').replace(/\s/g, '').length;
 if (length < 2000 || length > 3000) throw Error(errors.body);
 return article;
}
async function tokensFor(owner: string, batch: Batch) {
 const rows = await db().prepare('SELECT token FROM writing_runs WHERE owner=? AND day=? AND run_kind=?').bind(owner, batch.day, stepwiseTextKind(batch.id)).all<{token: string}>();
 return rows.results.map(row => row.token).filter(Boolean);
}
async function credentialCheck(owner: string, value: unknown, known: string[] = []) {
 try {assertNoCredentialText(JSON.stringify(value), known); await assertStepwiseCredentialFree(owner, value, known);} catch {throw Error(errors.credentials);}
}

export async function createStepwiseTextTest(owner: string, value: unknown) {
 stepwiseKeys(value, ['confirm', 'expected_model', 'expected_prompt_version', 'xiaoyu', 'claude']); confirmed(value);
 if (value.expected_prompt_version !== effectiveWritingStyleVersion) throw Error(errors.version);
 const model = await configuredModel(owner, value.expected_model);
 await credentialCheck(owner, value);
 const existing = await db().prepare('SELECT id,day FROM manual_writing_batches WHERE owner=? AND authorization_key=?').bind(owner, stepwiseTextAuthorizationKey).first<{id: string; day: string}>();
 const day = existing?.day || new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
 const writers = {} as Record<Writer, WritingInputSnapshot>;
 for (const writer of ['xiaoyu', 'claude'] as const) {
  const topic = value[writer]; stepwiseKeys(topic, ['topic', 'materials', 'outline', 'sources']);
  if (Array.isArray(topic.sources)) for (const source of topic.sources) stepwiseKeys(source, ['title', 'url', 'published']);
  const base = await writingInputSkeleton(day, writer);
  base.system_prompt += '\n\n' + stepwiseTextInstructions;
  base.system_prompt_sha256 = await hashText(base.system_prompt);
  writers[writer] = await assembleWritingInput(base, topic as TopicInput);
  await credentialCheck(owner, writers[writer]);
 }
 if (writers.xiaoyu.topic?.trim() === writers.claude.topic?.trim()) throw Error(errors.invalid);
 const snapshot: StepwiseTextSnapshot = {namespace_version: 1, scope: stepwiseTextAuthorizationKey, instructions: stepwiseTextInstructions, fixed_inputs: fixedReferenceSources, model, expected_model: model, prompt_version: effectiveWritingStyleVersion, writers, max_output_tokens: 14000, timeout_ms: 300000, max_requests: 1};
 const inputHash = await hashText(JSON.stringify(snapshot));
 const inserted = await db().prepare('INSERT OR IGNORE INTO manual_writing_batches(id,owner,authorization_key,day,input_hash,snapshot,created) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(), owner, stepwiseTextAuthorizationKey, day, inputHash, JSON.stringify(snapshot), now()).run();
 const stored = await db().prepare('SELECT id,input_hash FROM manual_writing_batches WHERE owner=? AND authorization_key=?').bind(owner, stepwiseTextAuthorizationKey).first<{id: string; input_hash: string}>();
 if (!stored || stored.input_hash !== inputHash) throw Error(errors.changed);
 return {created: !!inserted.meta.changes, cached: !inserted.meta.changes, ...await readStepwiseTextTest(owner, {run_id: stored.id})};
}

export async function readStepwiseTextTest(owner: string, value: unknown = {}) {
 stepwiseKeys(value, ['run_id']); let runId = value.run_id;
 if (runId === undefined) {
  const row = await db().prepare('SELECT id FROM manual_writing_batches WHERE owner=? AND authorization_key=?').bind(owner, stepwiseTextAuthorizationKey).first<{id: string}>();
  if (!row) return {state: 'not_created', authorization_key: stepwiseTextAuthorizationKey, max_batches: 1, max_articles_per_writer: 1, max_claude_requests: 1, automatic_retry: false};
  runId = row.id;
 }
 const batch = await getBatch(owner, runId);
 const writers = {} as Record<Writer, {state: string; item_id: string | null; expires: string | null; attempt_state: string; outcome: string; output: Output | null}>;
 for (const writer of ['xiaoyu', 'claude'] as const) {
  const lease = await leaseFor(owner, batch, writer), attempt = await attemptFor(owner, batch, writer);
  let output = attempt ? outputOf(attempt, batch, writer, lease) : null;
  let redacted = false;
  if (output) {
   const protection = await protectStepwiseOutputForOwner(owner, output, await tokensFor(owner, batch));
   output = protection.value; redacted = protection.hit;
   if (redacted) output = {namespace_version: 1, writer, source: writer === 'claude' ? 'provider_text' : 'agent_text', run_id: batch.id, item_id: lease!.article_id, input_hash: batch.input_hash, usage: numericCredentialSafeUsage(output.usage), error: errors.credentials, diagnostic: {stage: 'failed', code: 'credential_echo', response_suppressed: true}};
  }
  const unknown = attempt?.state === 'requested' && Date.now() - Date.parse(attempt.created) > 310000;
  writers[writer] = {state: lease?.state || 'not_claimed', item_id: lease?.article_id || null, expires: lease?.expires || null, attempt_state: redacted ? 'failed' : attempt?.state || 'not_requested', outcome: redacted ? 'failed' : unknown ? 'outcome_unknown' : attempt?.state || 'not_requested', output};
 }
 return {state: 'frozen', run_id: batch.id, day: batch.day, input_hash: batch.input_hash, authorization_key: stepwiseTextAuthorizationKey, snapshot: batch.snapshot, writers, created_at: batch.created, max_batches: 1, max_articles_per_writer: 1, max_claude_requests: 1, automatic_retry: false};
}

export async function claimStepwiseTextWriter(owner: string, value: unknown) {
 stepwiseKeys(value, ['run_id', 'writer', 'confirm']); confirmed(value);
 const writer = writerOf(value.writer), batch = await getBatch(owner, value.run_id);
 const token = crypto.randomUUID(), itemId = crypto.randomUUID(), time = now(), expires = new Date(Date.now() + 2 * 3600000).toISOString();
 const inserted = await db().prepare("INSERT OR IGNORE INTO writing_runs(id,owner,day,writer,run_kind,style_version,state,token,expires,article_id,topic,sources,input_snapshot,created,updated) VALUES(?,?,?,?,?,?,'stepwise_claimed',?,?,?,?,?,?,?,?)").bind(stepwiseTextAttemptId(owner, batch.id, writer), owner, batch.day, writer, stepwiseTextKind(batch.id), batch.snapshot.prompt_version, token, expires, itemId, batch.snapshot.writers[writer].topic, JSON.stringify(batch.snapshot.writers[writer].sources), JSON.stringify(batch.snapshot.writers[writer]), time, time).run();
 const lease = await leaseFor(owner, batch, writer); if (!lease) throw Error(errors.unknown);
 if (!inserted.meta.changes) return {claimed: false, run_id: batch.id, writer, item_id: lease.article_id, state: lease.state, read_only: true};
 return {claimed: true, run_id: batch.id, writer, item_id: itemId, token, expires, prompts: batch.snapshot.writers[writer], instructions: batch.snapshot.instructions, model: batch.snapshot.model, input_hash: batch.input_hash};
}

export async function saveStepwiseXiaoyuText(owner: string, value: unknown) {
 stepwiseKeys(value, ['run_id', 'item_id', 'token', 'title', 'paragraphs', 'confirm']); confirmed(value);
 const batch = await getBatch(owner, value.run_id), lease = await leaseFor(owner, batch, 'xiaoyu'); boundLease(lease, batch, 'xiaoyu', value);
 const article = articleOf({title: value.title, paragraphs: value.paragraphs}); await credentialCheck(owner, article, await tokensFor(owner, batch));
 const hash = await hashText(JSON.stringify(article)), previous = await attemptFor(owner, batch, 'xiaoyu');
 if (previous) {
  const output = outputOf(previous, batch, 'xiaoyu', lease);
  if (output.body_sha256 !== hash || JSON.stringify(output.article) !== JSON.stringify(article)) throw Error(errors.frozen);
  return {saved: true, read_only: true, item_id: lease.article_id, source: 'agent_text', article: output.article};
 }
 active(lease);
 const output: Output = {namespace_version: 1, writer: 'xiaoyu', source: 'agent_text', run_id: batch.id, item_id: lease.article_id, input_hash: batch.input_hash, body_sha256: hash, article, text: JSON.stringify(article), usage: null};
 const id = stepwiseTextAttemptId(owner, batch.id, 'xiaoyu'), time = now();
 const inserted = await db().prepare("INSERT OR IGNORE INTO claude_attempts(id,owner,day,state,response,created) SELECT ?,owner,day,'completed',?,? FROM writing_runs WHERE id=? AND owner=? AND token=? AND state='stepwise_claimed' AND expires>? AND input_snapshot=?").bind(id, JSON.stringify({stepwise_text: output}), time, id, owner, value.token, time, JSON.stringify(batch.snapshot.writers.xiaoyu)).run();
 if (!inserted.meta.changes) {
  const current = await attemptFor(owner, batch, 'xiaoyu');
  if (!current || outputOf(current, batch, 'xiaoyu', lease).body_sha256 !== hash) throw Error(errors.frozen);
  return {saved: true, read_only: true, item_id: lease.article_id, source: 'agent_text', article};
 }
 await db().prepare("UPDATE writing_runs SET state='stepwise_completed',body_hash=?,updated=? WHERE id=? AND owner=? AND state='stepwise_claimed'").bind(hash, time, id, owner).run();
 return {saved: true, read_only: false, item_id: lease.article_id, source: 'agent_text', article};
}

export async function prepareStepwiseClaude(owner: string, value: unknown): Promise<StepwisePrepared> {
 stepwiseKeys(value, ['run_id', 'item_id', 'token', 'expected_model', 'confirm']); confirmed(value);
 const batch = await getBatch(owner, value.run_id), lease = await leaseFor(owner, batch, 'claude'); boundLease(lease, batch, 'claude', value);
 if (value.expected_model !== batch.snapshot.model) throw Error(errors.model);
 if (!Number.isFinite(Date.parse(lease.expires)) || Date.parse(lease.expires) <= Date.now()) throw Error(errors.expired);
 await configuredModel(owner, batch.snapshot.model);
 const previous = await attemptFor(owner, batch, 'claude');
 if (previous) outputOf(previous, batch, 'claude', lease);
 else active(lease);
 return {owner, input: {...value} as GenerateInput};
}

export async function executeStepwiseClaude(prepared: StepwisePrepared) {
 prepared = await prepareStepwiseClaude(prepared.owner, prepared.input);
 const {owner, input} = prepared, batch = await getBatch(owner, input.run_id), lease = await leaseFor(owner, batch, 'claude'); boundLease(lease, batch, 'claude', input);
 const previous = await attemptFor(owner, batch, 'claude');
 if (previous) return {state: previous.state, cached: true, read_only: true, item_id: lease.article_id};
 const id = stepwiseTextAttemptId(owner, batch.id, 'claude'), time = now();
 const reserved: Output = {namespace_version: 1, writer: 'claude', source: 'provider_text', run_id: batch.id, item_id: lease.article_id, input_hash: batch.input_hash, requested_model: batch.snapshot.model, diagnostic: {stage: 'reserved'}};
 const reservedJson = JSON.stringify({stepwise_text: reserved});
 // Atomic fence also checks the live model and exact lease snapshot at the reservation point.
 const inserted = await db().prepare("INSERT OR IGNORE INTO claude_attempts(id,owner,day,state,response,created) SELECT ?,w.owner,w.day,'requested',?,? FROM writing_runs w JOIN claude_settings c ON c.owner=w.owner WHERE w.id=? AND w.owner=? AND w.article_id=? AND w.token=? AND w.state='stepwise_claimed' AND w.expires>? AND w.input_snapshot=? AND c.enabled='1' AND c.model=?").bind(id, reservedJson, time, id, owner, input.item_id, input.token, time, JSON.stringify(batch.snapshot.writers.claude), batch.snapshot.model).run();
 if (!inserted.meta.changes) {
  const current = await attemptFor(owner, batch, 'claude'); if (!current) throw Error(errors.unknown);
  outputOf(current, batch, 'claude', lease); return {state: current.state, cached: true, read_only: true, item_id: lease.article_id};
 }
 let state: string = 'failed', output: Output = {...reserved, error: errors.unknown, diagnostic: {stage: 'failed', code: 'configuration_failed'}};
 try {
  const {state: requestState, ...result} = await requestStepwiseClaudeOnce(owner, batch.snapshot, await tokensFor(owner, batch));
  output = {...reserved, ...result}; state = requestState;
  if (state === 'completed' && result.text) {
   try {
    const parsed = parseClaudeArticle(result.text), article = articleOf({title: parsed.article.title, paragraphs: parsed.article.paragraphs});
    await credentialCheck(owner, article, await tokensFor(owner, batch));
    output = {...output, article, parse: {repair: parsed.repair, removedTitleDuplicate: parsed.removedTitleDuplicate}, body_sha256: await hashText(JSON.stringify(article))};
   } catch (error: unknown) {
    state = 'failed';
    if (error && typeof error === 'object' && 'message' in error && error.message === errors.credentials) {
     // A generic credential guard may detect keys outside the configured-key
     // scrubber. Fail closed: retain only server binding and numeric usage.
     output = {...reserved, usage: numericCredentialSafeUsage(output.usage), error: errors.credentials, diagnostic: {stage: 'failed', code: 'credential_detected', response_suppressed: true}};
    } else output = {...output, error: '实际返回不满足原稿格式或字数要求；已保留，不能重试', diagnostic: {...output.diagnostic, stage: 'failed', code: 'invalid_article'}};
   }
  }
 } catch { /* Reservation remains consumed even if configuration/read transport fails. */ }
 const protection = await protectStepwiseOutputForOwner(owner, output, await tokensFor(owner, batch));
 output = protection.value;
 if (protection.hit) {state = 'failed'; output = {...reserved, usage: numericCredentialSafeUsage(output.usage), error: errors.credentials, diagnostic: {stage: 'failed', code: 'credential_echo', response_suppressed: true}};}
 try {
  const saved = await db().prepare("UPDATE claude_attempts SET state=?,response=? WHERE id=? AND owner=? AND state='requested' AND response=?").bind(state, JSON.stringify({stepwise_text: output}), id, owner, reservedJson).run();
  if (!saved.meta.changes) return {state: 'requested', item_id: lease.article_id, error: errors.unknown};
  await db().prepare("UPDATE writing_runs SET state=?,body_hash=?,error=?,updated=? WHERE id=? AND owner=? AND state='stepwise_claimed'").bind(state === 'completed' ? 'stepwise_completed' : 'stepwise_failed', output.body_sha256 || null, output.error || null, now(), id, owner).run();
 } catch { return {state: 'requested', item_id: lease.article_id, error: errors.unknown}; }
 return {state, item_id: lease.article_id, cached: false, error: output.error || null};
}

const sourceSchema = {type: 'array', minItems: 2, maxItems: 12, items: {type: 'object', properties: {title: {type: 'string'}, url: {type: 'string'}, published: {type: 'string'}}, required: ['title', 'url', 'published'], additionalProperties: false}};
const topicSchema = {type: 'object', properties: {topic: {type: 'string', maxLength: 300}, materials: {type: 'string', minLength: 100, maxLength: 18000}, outline: {type: 'string', maxLength: 8000, description: writingOutlineHelp + '\n' + writingOutlineTemplate}, sources: sourceSchema}, required: ['topic', 'materials', 'outline', 'sources'], additionalProperties: false};
const confirmSchema = {type: 'boolean', const: true};
export const stepwiseTextTools = [
 {name: 'create_stepwise_text_test', description: 'Freeze the one server-authorized stepwise text pair after explicit user confirmation. Stores current complete three fixed prompts, canonical outlines, public sources, configured model and input hashes. Does not claim, call a model, create articles, images or drafts. No caller dates, authorization keys, limits or retries.', inputSchema: {type: 'object', properties: {confirm: confirmSchema, expected_model: {type: 'string'}, expected_prompt_version: {type: 'string'}, xiaoyu: topicSchema, claude: topicSchema}, required: ['confirm', 'expected_model', 'expected_prompt_version', 'xiaoyu', 'claude'], additionalProperties: false}, annotations: {readOnlyHint: false, openWorldHint: false, destructiveHint: false}},
 {name: 'read_stepwise_text_test', description: 'Read this owner-only fixed stepwise text test and both authors’ exact frozen inputs and saved results. Never returns claim tokens, changes state, generates, retries or queues delivery. Unknown/failed requests may only be recovered by this read.', inputSchema: {type: 'object', properties: {run_id: {type: 'string'}}, additionalProperties: false}, annotations: {readOnlyHint: true, openWorldHint: false}},
 {name: 'claim_stepwise_text_writer', description: 'After separate user confirmation, atomically claim exactly one xiaoyu or claude item in this frozen test. Only the winning first call returns its token and complete frozen prompts. No model call, renewal, reclaim, image or delivery.', inputSchema: {type: 'object', properties: {run_id: {type: 'string'}, writer: {type: 'string', enum: ['xiaoyu', 'claude']}, confirm: confirmSchema}, required: ['run_id', 'writer', 'confirm'], additionalProperties: false}, annotations: {readOnlyHint: false, openWorldHint: false, destructiveHint: false}},
 {name: 'save_stepwise_xiaoyu_text', description: 'After user confirmation save the parent agent’s original xiaoyu title and 2000–3000-character ordered paragraphs as agent_text. Saves only in the isolated stepwise text namespace; no model calls, articles, events, images, platform/private drafts or Word upload. Exact replay is read-only; frozen prose cannot be replaced.', inputSchema: {type: 'object', properties: {run_id: {type: 'string'}, item_id: {type: 'string'}, token: {type: 'string'}, title: {type: 'string'}, paragraphs: {type: 'array', items: {type: 'string'}}, confirm: confirmSchema}, required: ['run_id', 'item_id', 'token', 'title', 'paragraphs', 'confirm'], additionalProperties: false}, annotations: {readOnlyHint: false, openWorldHint: false, destructiveHint: false}},
];
export async function stepwiseTextCall(owner: string, name: string, value: unknown) {
 if (name === 'create_stepwise_text_test') return createStepwiseTextTest(owner, value);
 if (name === 'read_stepwise_text_test') return readStepwiseTextTest(owner, value);
 if (name === 'claim_stepwise_text_writer') return claimStepwiseTextWriter(owner, value);
 if (name === 'save_stepwise_xiaoyu_text') return saveStepwiseXiaoyuText(owner, value);
 throw Error(errors.invalid);
}
