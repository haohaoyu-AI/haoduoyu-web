// Targeted quality-candidate V3 integration. SQLite, credentials, metadata, bucket and events are local mocks.
// No production data, real credential, browser, network, paid request or deployment.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import ts from 'typescript';

const sourceRoot = process.env.TEST_V3_RUNTIME_SOURCE || new URL('..', import.meta.url).pathname.replace(/\/$/u, '');
const native = createRequire(import.meta.url), sql = new DatabaseSync(':memory:');
const uuidQueue = [];
let clock = Date.now(), captureNextBatch = false, admitCapture = null, admitSnapshot = null;
class FakeDate extends Date {constructor(...args) {super(...(args.length ? args : [clock]));} static now() {return clock;}}
const testCrypto = {subtle: crypto.subtle, randomUUID: () => uuidQueue.length ? uuidQueue.shift() : crypto.randomUUID()};
for (const file of fs.readdirSync(sourceRoot + '/drizzle').filter(name => name.endsWith('.sql')).sort()) sql.exec(fs.readFileSync(sourceRoot + '/drizzle/' + file, 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const model = 'claude-opus-5-5', xmodel = 'gpt-6.1-sol', limit = 32768;
const secret = 'sk-synthetic-private-abcdefghijklmnopqrstuvwxy';
let batchTail = Promise.resolve(), beforeRun = null, beforeBatch = null;
let dbWrites = 0, providerCalls = 0, metadataCalls = 0, networkCalls = 0, eventCalls = 0, bucketPuts = 0;
let connected = true, throwDispatch = false, dispatchHook = null, providerHook = null, hold = null;
let capabilityLimit = limit,metadataFailureCode=null;
let response = null, providerState = 'completed', returnedModel = model, providerUsage = {input_tokens: 31, output_tokens: 2111, thinking_tokens: 7};
const providerTrace = [], bucketFiles = new Map();
const db = {
 prepare(query) {
  const bound = args => ({
   query, args,
   first: async () => sql.prepare(query).get(...args) || null,
   all: async () => ({results: sql.prepare(query).all(...args)}),
   run: async () => {dbWrites++; if (beforeRun) await beforeRun(query, args); return {meta: {changes: Number(sql.prepare(query).run(...args).changes)}};},
  });
  return {...bound([]), bind: (...args) => bound(args)};
 },
 batch(statements) {
  if (captureNextBatch) {captureNextBatch = false; admitCapture = statements.map(({query, args}) => ({query, args: clone(args)}));}
  const task = batchTail.then(async () => {
   if (beforeBatch) await beforeBatch(statements);
   sql.exec('BEGIN');
   try {const result = []; for (const statement of statements) result.push(await statement.run()); sql.exec('COMMIT'); return result;}
   catch (error) {sql.exec('ROLLBACK'); throw error;}
  });
  batchTail = task.catch(() => {}); return task;
 },
};
async function capability(requested) {
 metadataCalls++;if(metadataFailureCode)throw Object.assign(Error('private synthetic provider exception '+secret),{editorial_binding_stage:'live_configuration',editorial_binding_code:metadataFailureCode});
 const base = {model: requested, max_output_tokens: capabilityLimit, source_url: 'https://app.yylx.io/v1/models', checked_at: '2026-10-06T10:00:00.000Z', relay_limit_verified: true, evidence_kind: 'relay_metadata', metadata_source_url: 'https://app.yylx.io/v1/models'};
 return {...base, capability_sha256: hash(base)};
}
const claude = {
 readClaudeOutputCapability: async (_owner, requested) => capability(requested),
 protectPreparedArticleForOwner: async (_owner, value) => ({hit: JSON.stringify(value).includes(secret)}),
 requestOutlineClaudeOnce: async () => {providerCalls++; throw Error('Model calls forbidden in targeted quality integration');},
};
const modules = {};
function load(name) {
 if (modules[name]) return modules[name];
 const exports = {}; modules[name] = exports;
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(sourceRoot + '/lib/' + name + '.ts', 'utf8').replace(/export const editorialCloudHttpPaidEnabled = (?:true|false);/u,'export const editorialCloudHttpPaidEnabled = false;'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {
  exports, crypto: testCrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Date: FakeDate, Error, URL, Request, Response, File, ReadableStream, AbortSignal, setInterval, clearInterval,
  setTimeout: (fn, ms) => {assert.equal(ms, 330000, 'Only the fixed zero-model probe timer may run'); clock += ms; queueMicrotask(fn); return 1;}, clearTimeout: () => {},
  require: path => path === './test-store' ? {db: () => db} : path === './claude' ? claude : path === './articles' ? {bucket: () => ({put: async (key, bytes, options) => {bucketPuts++; bucketFiles.set(key, {text: new TextDecoder().decode(bytes), options});}})} : path === './events' ? {readiness: async () => ({connected}), dispatchEditorialRequest: async () => {eventCalls++; return true;}, dispatch: async (owner, article_id, created, event) => {eventCalls++; if (dispatchHook) await dispatchHook({owner, article_id, created, event}); if (throwDispatch) throw Error('Synthetic event timeout'); return '事件已送达，offline mock';}} : path.startsWith('./') ? load(path.slice(2)) : native(path),
  fetch: () => {networkCalls++; throw Error('Real network forbidden');},
 });
 return exports;
}
const authority = load('editorial-authority-v3'), runtime = load('editorial-v3-runtime'), prompt = load('writing-supplement'), round = load('editorial-round-contract');
const day = authority.editorialV3BeijingDay();
const sources = [
 {id: 'S1', title: '合成公开采访', url: 'https://example.com/interview', published: day, event_date: day, accessed: day, context: day + '公开采访，仅谈作品的拍摄经历。'},
 {id: 'S2', title: '合成公开放映', url: 'https://example.org/screening', published: day, event_date: day, accessed: day, context: day + '公开放映，未涉及任何私人行为。'},
];
const facts = [{id: 'F1', text: '影片在公开场合放映。', source_ids: ['S2'], context: sources[1].context}];
const outline = {title: '作品里的戏', core_argument: '公开证据能够支撑作品评论。', opening: '从公开放映入手。', sections: [{heading: '作品观察', target_chars: 1600, fact_ids: ['F1'], source_ids: ['S2'], argument: '区分公开作品与私人动机。'}], turn: '把热度转回作品。', ending: '落在作品中的具体观察。', target_chars: 2400, source_ids: ['S1', 'S2'], fact_gaps: {blocked: false, items: []}};
const article = {title: outline.title, paragraphs: [facts[0].text + '叙'.repeat(1200 - facts[0].text.length), '述'.repeat(1200)]};
const at = (input, paragraph) => paragraph === 0 ? input.title : input.paragraphs[paragraph - 1] || '';
const changes = (before, after) => Array.from({length: Math.max(before.paragraphs.length, after.paragraphs.length) + 1}, (_, paragraph) => ({paragraph, before: at(before, paragraph), after: at(after, paragraph), reason: '完整记录确切位置的实际变化。'})).filter(item => item.before !== item.after);
const issue = (input, id = 'issue-1', paragraph = 1, type = 'expression') => ({id, paragraph, quote: at(input, paragraph).slice(0, 16), type, severity: 'medium', basis: '该位置需要明确证据边界。' + id, revision_goal: '结合冻结公开材料完善论证。' + id});
const review = (issues = []) => ({status: 'completed', decision: issues.length ? 'revise' : 'pass', reason: '完成确切输入标题和完整全文的独立审查。', issues});
const opinion = (paragraph, quote) => ({paragraph, quote, classification: 'opinion', verdict: 'not_applicable', source_ids: [], source_dates: [], context: '作者作品评论，不暗示私人事实。'});
function factReport(input, passed = true, issues = []) {
 const coverage = [opinion(0, input.title)];
 for (const [index, paragraph] of input.paragraphs.entries()) {
  if (paragraph.startsWith(facts[0].text)) {
   coverage.push({paragraph: index + 1, quote: facts[0].text, classification: 'fact', verdict: 'confirmed', source_ids: ['S2'], source_dates: [day], context: sources[1].context});
   if (paragraph.length > facts[0].text.length) coverage.push(opinion(index + 1, paragraph.slice(facts[0].text.length)));
  } else coverage.push(opinion(index + 1, paragraph));
 }
 return {status: 'completed', passed, coverage, issues, unconfirmed: [], checks: {paragraphs: true, names: true, numbers: true, metaphors: true, quote_time_context: true}};
}
const evidence = 'OFFLINE SYNTHETIC OWNER APPROVAL: only Haoduoyu daily two-author editorial and writing-pipeline tests; necessary issue-driven revisions without a fixed call-count or currency ceiling; no other spending.';
const grants = new Map();
async function grant(owner) {
 if (grants.has(owner)) return grants.get(owner);
 sql.prepare('INSERT INTO claude_settings(owner,model,secret,enabled,updated) VALUES(?,?,?,?,?)').run(owner, model, 'encrypted.offline', '1', day);
 const xactor = crypto.randomUUID(), cactor = crypto.randomUUID();
 const g = await authority.createEditorialAuthorityV3(owner, {authorization_key: 'runtime-offline-v3', source_kind: 'owner_chat', source_message_id: 'offline-owner-message-' + owner, quoted_evidence: evidence, quoted_evidence_sha256: hash(evidence), confirmed_scope: authority.editorialAuthorityV3Scope, xiaoyu_actor_id: xactor, xiaoyu_model: xmodel, claude_actor_id: cactor, expected_claude_model: model, expected_prompt_version: prompt.effectiveWritingStyleVersion, expected_max_output_tokens: limit, confirm: true});
 grants.set(owner, g); return g;
}
function startArgs(g, writer = 'claude_provider', parent = 'offline:runtime-fixture') {return {authority_id: g.authority_id, run_kind: 'workflow_test', writer, parent_test_intent_key: parent, test_intent_key: parent + '/' + writer, expected_bindings_sha256: g.bindings_sha256, expected_writer_model: writer === 'claude_provider' ? model : xmodel, topic: '合成作品观察', angle: '冻结公开材料边界', confirm: true};}
async function create(owner, writer = 'claude_provider', parent, overrides = {}) {
 const g = await grant(owner), started = await authority.startEditorialRunV3(owner, startArgs(g, writer, parent));
 if(parent==='offline:exact-body-continuation'){const target='bd6d4434-273b-426e-a17f-9390fc124c84',old=sql.prepare('SELECT * FROM editorial_runs_v3 WHERE id=?').get(started.run_id),snapshot=JSON.parse(old.snapshot_json);snapshot.run_id=target;sql.prepare('UPDATE editorial_runs_v3 SET id=?,snapshot_json=?,snapshot_sha256=? WHERE id=?').run(target,JSON.stringify(snapshot),hash(snapshot),started.run_id);started.run_id=target;started.snapshot_sha256=hash(snapshot);}
 const participants = Object.fromEntries(['writer', 'outline_reviewer', 'structure_reviewer', 'fact_checker', 'verifier'].map(role => [role, {actor_id: role === 'writer' ? g.bindings[writer].actor_id : crypto.randomUUID(), model: role === 'writer' ? g.bindings[writer].model : 'offline-independent-' + role}]));
 const args = {run_id: started.run_id, expected_input_sha256: started.input_sha256, topic: '合成作品观察', angle: '冻结公开材料边界', style_requirements: '自然中文，作品分析，保持证据边界。', materials: '这是仅供离线回归的合成公开素材。'.repeat(20), sources, facts, participants, research: {actor_id: crypto.randomUUID(), execution_id: crypto.randomUUID(), model: 'offline-research'}, confirm: true};
 Object.assign(args, overrides);
 const initialized = await runtime.initializeEditorialV3(owner, args);
 return {owner, g, started, initialized, initArgs: args, run_id: started.run_id, article_id: started.article_id, snapshot_sha256: initialized.snapshot_sha256, participants};
}
const read = r => runtime.readEditorialV3(r.owner, {run_id: r.run_id});
const row = r => sql.prepare('SELECT * FROM editorial_runs_v3 WHERE id=?').get(r.run_id);
const stageRow = lease => sql.prepare('SELECT * FROM editorial_stages_v3 WHERE id=?').get(lease.stage_id);
const receiptKey = (r, lease) => `editorial_v3:${r.owner}:${r.run_id}:${lease.stage_id}`;
const claim = r => runtime.claimEditorialV3Stage(r.owner, {run_id: r.run_id, expected_snapshot_sha256: r.snapshot_sha256, confirm: true});
const prepare = (r, lease) => runtime.prepareEditorialV3Stage(r.owner, {run_id: r.run_id, stage_id: lease.stage_id, token: lease.token, expected_model: model, expected_input_sha256: lease.input_sha256, confirm: true});
function attestedArgs(r, lease, artifact, execution_id = crypto.randomUUID()) {return {run_id: r.run_id, stage_id: lease.stage_id, ...(lease.token ? {token: lease.token} : {}), expected_snapshot_sha256: r.snapshot_sha256, expected_input_sha256: lease.input_sha256, actor_id: lease.input.actor_id, execution_id, model: lease.input.model, raw_result: JSON.stringify(artifact), confirm: true};}
async function saveReview(r, artifact, lease) {lease ||= await claim(r); assert.equal(lease.claimed, true); await runtime.saveEditorialV3Review(r.owner, attestedArgs(r, lease, artifact)); return lease;}

const realRaw = fs.readFileSync(new URL('./fixtures/editorial-v3-quality-candidate-1879.json', import.meta.url), 'utf8');
const realArticle = JSON.parse(realRaw), realRawHash = '0b38eafa3da38b9d65f3389ee0e872d2dde9a842d068669b67e6be310bb08b1e';
const runId = 'bd6d4434-273b-426e-a17f-9390fc124c84', failedId = '5b4832c6-4fbf-4f48-b4cf-fd5b927f71ee', bodyId = '383496c8-a6e7-4c93-8f18-44d0e3bacdec';
const checks = [];
async function check(name, operation) {await operation(); checks.push(name); console.log('PASS ' + name);}
function packet(r, lease, text, state = 'completed') {
 return {state, stage: lease.stage, stage_id: lease.stage_id, input_sha256: lease.input_sha256, snapshot_sha256: r.snapshot_sha256, requested_model: model, returned_model: state === 'completed' ? model : null, text: state === 'completed' ? text : null, partial_text: null, raw_partial_response: null, raw_response: null, usage: {input_tokens: 31, output_tokens: 1879, thinking_tokens: 7}, diagnostic: {stage: state === 'completed' ? 'completed' : 'failed', http_status: state === 'completed' ? 200 : 524, stop_reason: state === 'completed' ? 'end_turn' : null, eof_received: state === 'completed', incomplete_frame: false, message_stop_received: state === 'completed', request_stream: true, transport_version: 'anthropic_sse_buffered_v2', inspection_version: 'buffered_v2', raw_retained: false, safety_subcause: null, transport_subcause: state === 'completed' ? null : 'timeout'}};
}
function seedReceipt(r, lease, text, state = 'completed') {
 const id = receiptKey(r, lease), response = JSON.stringify(packet(r, lease, text, state));
 sql.prepare('INSERT INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,?,?,?)').run(id, r.owner, day, state, response, day);
 sql.prepare("UPDATE editorial_stages_v3 SET state='requested',receipt_id=? WHERE id=?").run(id, lease.stage_id);
 return response;
}
async function seedWriter(r, value) {
 const lease = await claim(r); assert.equal(lease.claimed, true);
 seedReceipt(r, lease, JSON.stringify(value));
 const result = await runtime.recoverEditorialV3Stage(r.owner, {run_id: r.run_id, stage_id: lease.stage_id, confirm: true});
 assert.equal(result.recovered, true); return lease;
}
function renameStage(lease, id) {
 const input = {...lease.input, stage_id: id};
 sql.prepare('UPDATE editorial_stages_v3 SET id=?,input_json=?,input_sha256=? WHERE id=?').run(id, JSON.stringify(input), hash(input), lease.stage_id);
 return {...lease, stage_id: id, input, input_sha256: hash(input)};
}
const admitArgs = {run_id: runId, stage_id: bodyId, quality_candidate: true, expected_provider_text_sha256: realRawHash, confirm: true};
const receiptRow = (r, id) => sql.prepare('SELECT * FROM claude_attempts WHERE owner=? AND id=?').get(r.owner, id);
const roundContext = input => ({validation_version: 3, sources, facts, input_article: input.input_article, previous_report: input.previous_report, quality_candidate_anchor: input.quality_candidate_anchor, input_binding: input.input_binding, bound_input_binding: input.input_binding});
let r, body, originalReceipt, oldFailedReceipt, originalError, originalBodyInput, originalBodyHash;
await check('seed exact real run/body continuation using original 1879 text; zero model calls', async () => {
 assert.equal(hash(realRaw), realRawHash);
 assert.equal(Array.from(realArticle.paragraphs.join('').replace(/\s/gu, '')).length, 1879);
 r = await create('offline-quality-runtime', 'claude_provider', 'offline:exact-body-continuation');
 assert.equal(r.run_id, runId);
 await seedWriter(r, outline); await saveReview(r, review());
 const failed = renameStage(await claim(r), failedId);
 const failedReceiptId = receiptKey(r, failed);
 seedReceipt(r, failed, null, 'failed');
 await runtime.recoverEditorialV3Stage(r.owner, {run_id: runId, stage_id: failedId, confirm: true});
 assert.equal(row(r).state, 'technical_failed');
 oldFailedReceipt = JSON.stringify(receiptRow(r, failedReceiptId));
 const preview = await runtime.previewEditorialV3BodyContinuation(r.owner, {run_id: runId, failed_stage_id: failedId});
 const quote = 'OFFLINE SYNTHETIC OWNER approves exactly one additional body attempt for this fixed failed stage.';
 uuidQueue.push('00000000-0000-4000-8000-000000000201', bodyId, '00000000-0000-4000-8000-000000000202');
 const continuation = await runtime.authorizeEditorialV3BodyContinuation(r.owner, {authorization_key: 'offline-quality-continuation', run_id: runId, failed_stage_id: failedId, source_kind: 'owner_chat', source_message_id: 'offline-quality-message', quoted_evidence: quote, quoted_evidence_sha256: hash(quote), confirmed_scope: 'editorial_v3_one_explicit_failed_body_continuation', expected_receipt_sha256: preview.expected_receipt_sha256, expected_input_sha256: preview.expected_input_sha256, expected_snapshot_sha256: preview.expected_snapshot_sha256, confirm: true});
 assert.equal(continuation.new_stage_id, bodyId); assert.equal(uuidQueue.length, 0);
 body = await claim(r); assert.equal(body.stage_id, bodyId);
 seedReceipt(r, body, realRaw);
 originalReceipt = JSON.stringify(receiptRow(r, receiptKey(r, body)));
 await assert.rejects(runtime.recoverEditorialV3Stage(r.owner, {run_id: runId, stage_id: bodyId, confirm: true}), error => error.message.includes('2000'));
 originalError = stageRow(body).error; originalBodyInput = stageRow(body).input_json; originalBodyHash = stageRow(body).input_sha256;
 assert.equal(stageRow(body).state, 'content_invalid'); assert.equal(row(r).state, 'content_invalid');
 assert.equal(stageRow(body).artifact_json, null); assert.equal(providerCalls, 0); assert.equal(networkCalls, 0);
});
await check('pre-admission read is mutation-free and does not silently accept a failed body', async () => {
 const before = dbWrites, beforeRows = JSON.stringify(sql.prepare('SELECT * FROM editorial_stages_v3 WHERE run_id=? ORDER BY sequence').all(runId));
 const view = await read(r);
 assert.equal(view.state, 'content_invalid'); assert.equal(view.stages[bodyId].state, 'content_invalid');
 assert.equal(view.artifacts[bodyId], undefined); assert.notEqual(view.current_version?.version_id, bodyId);
 assert.equal(dbWrites, before); assert.equal(JSON.stringify(sql.prepare('SELECT * FROM editorial_stages_v3 WHERE run_id=? ORDER BY sequence').all(runId)), beforeRows);
 assert.equal(JSON.stringify(receiptRow(r, receiptKey(r, body))), originalReceipt);
 const writes = dbWrites; await assert.rejects(runtime.recoverEditorialV3Stage(r.owner, {...admitArgs, expected_provider_text_sha256: 'f'.repeat(64)})); assert.equal(dbWrites, writes);
});
await check('explicit admission stores immutable article/evidence proof wrapper; error, failed state and receipts remain', async () => {
 admitSnapshot = Object.fromEntries(['editorial_authority_v3', 'editorial_runs_v3', 'editorial_stages_v3', 'claude_attempts', 'workflow_controls'].map(table => [table, clone(sql.prepare('SELECT * FROM ' + table).all())]));
 captureNextBatch = true;
 const result = await runtime.recoverEditorialV3Stage(r.owner, admitArgs);
 assert.equal(admitCapture.length, 3);
 assert.equal(result.recovered, true); assert.equal(result.quality_candidate, true); assert.equal(result.quality_passed, false); assert.equal(result.model_request_sent, false);
 const stage = stageRow(body), wrapper = JSON.parse(stage.artifact_json);
 assert.deepEqual(Object.keys(wrapper), ['article', 'quality_evidence']); assert.deepEqual(wrapper.article, realArticle);
 assert.equal(wrapper.quality_evidence.source_text_sha256, realRawHash); assert.equal(wrapper.quality_evidence.article_sha256, hash(realArticle));
 assert.equal(wrapper.quality_evidence.receipt_sha256, hash(receiptRow(r, receiptKey(r, body)).response));
 assert.equal(wrapper.quality_evidence.char_count, 1879); assert.equal(wrapper.quality_evidence.quality_passed, false); assert.equal(wrapper.quality_evidence.reason, 'length');
 assert.equal(stage.artifact_sha256, hash(stage.artifact_json)); assert.equal(stage.state, 'content_invalid'); assert.equal(stage.error, originalError);
 assert.equal(stage.input_json, originalBodyInput); assert.equal(stage.input_sha256, originalBodyHash);
 assert.equal(JSON.stringify(receiptRow(r, receiptKey(r, body))), originalReceipt);
 assert.equal(JSON.stringify(receiptRow(r, `editorial_v3:${r.owner}:${runId}:${failedId}`)), oldFailedReceipt);
 assert.equal(row(r).state, 'structure_review'); assert.equal(row(r).final_sha256, null);
 assert.deepEqual(clone(result.current_version.article), realArticle); assert.equal(result.current_version.version_id, bodyId); assert.equal(result.current_version.quality_passed, false);
 const before = dbWrites, replay = await runtime.recoverEditorialV3Stage(r.owner, admitArgs);
 assert.equal(replay.read_only, true); assert.equal(replay.recovered, false); assert.equal(dbWrites, before);
});
await check('changing only receipt usage with the same author article invalidates persisted proof and all follow-on actions', async () => {
 const id = receiptKey(r, body), original = receiptRow(r, id).response, modified = JSON.parse(original);
 modified.usage.output_tokens++;
 assert.equal(modified.text, JSON.parse(original).text);
 sql.prepare('UPDATE claude_attempts SET response=? WHERE id=?').run(JSON.stringify(modified), id);
 const writes = dbWrites;
 for (const action of [() => read(r), () => claim(r), () => runtime.recoverEditorialV3Stage(r.owner, admitArgs), () => runtime.freezeEditorialV3(r.owner, {run_id: runId, expected_final_sha256: hash(realArticle), confirm: true})]) await assert.rejects(action());
 assert.equal(dbWrites, writes); assert.equal(bucketPuts, 0);
 sql.prepare('UPDATE claude_attempts SET response=? WHERE id=?').run(original, id);
 assert.equal((await read(r)).current_version.quality_evidence.receipt_sha256, hash(original));
});
// Synthetic, explicitly test-only anchored reports. They are not a new audit of
// the author's actual article and make no semantic claim about its facts.
const structureIssue = {id: 'MOCK-STRUCTURE', paragraph: 1, quote: realArticle.paragraphs[0].slice(0, 12), type: 'structure', severity: 'high', basis: 'OFFLINE MOCK: exercise exact quote and decision binding only.', revision_goal: 'OFFLINE MOCK: produce a complete revision responding to the anchored issue.'};
const structureReport = {status: 'completed', decision: 'revise', reason: 'OFFLINE MOCK independent structure report; no claim of production review.', issues: [structureIssue]};
const factualIssue = {id: 'MOCK-FACT', paragraph: 2, quote: realArticle.paragraphs[1], type: 'fact', severity: 'high', basis: 'OFFLINE MOCK evidence unavailable; tests a concrete exact factual issue only.', revision_goal: 'OFFLINE MOCK: qualify or remove the exact unconfirmed claim.'};
const initialFacts = {status: 'completed', passed: false, coverage: [realArticle.title, ...realArticle.paragraphs].map((quote, paragraph) => paragraph === 2 ? {paragraph, quote, classification: 'fact', verdict: 'unconfirmed', source_ids: [], source_dates: [], context: 'OFFLINE MOCK: unavailable evidence for this exact quote.'} : {paragraph, quote, classification: 'opinion', verdict: 'not_applicable', source_ids: [], source_dates: [], context: 'OFFLINE MOCK coverage mechanics only; no real semantic classification claim.'}), issues: [factualIssue], unconfirmed: [factualIssue.quote], checks: {paragraphs: true, names: true, numbers: true, metaphors: true, quote_time_context: true}};
let structure, factual, revision;
await check('candidate cannot pass structure review; anchored mock revise goes first to complete fact check', async () => {
 structure = await claim(r); assert.equal(structure.stage, 'structure_review');
 assert.equal(structure.input.quality_candidate_anchor.version_id, bodyId); assert.equal(structure.input.input_binding.sha256, hash(realArticle));
 assert.deepEqual(clone(structure.input.input_article), realArticle);
 const writes = dbWrites;
 await assert.rejects(runtime.saveEditorialV3Review(r.owner, attestedArgs(r, structure, review()))); assert.equal(dbWrites, writes);
 await saveReview(r, structureReport, structure); assert.equal(row(r).state, 'fact_check');
 factual = await claim(r); assert.equal(factual.stage, 'fact_check');
 assert.equal(factual.input.input_binding.version_id, bodyId); assert.equal(factual.input.input_binding.sha256, hash(realArticle));
 assert.deepEqual(clone(factual.input.input_article), realArticle);
 await saveReview(r, initialFacts, factual); assert.equal(row(r).state, 'structure_revision');
});
await check('structure revision input freezes original candidate plus both independent reports and their exact hashes', async () => {
 revision = await claim(r); assert.equal(revision.stage, 'structure_revision');
 const i = revision.input, bodyWrapper = JSON.parse(stageRow(body).artifact_json), structureStored = stageRow(structure), factStored = stageRow(factual);
 assert.deepEqual(clone(i.input_article), realArticle); assert.deepEqual(clone(i.previous_report), structureReport);
 assert.equal(i.previous_report_sha256, structureStored.artifact_sha256); assert.equal(i.previous_report_sha256, hash(structureReport));
 assert.equal(i.initial_fact_report.stage_id, factual.stage_id); assert.equal(i.initial_fact_report.input_sha256, factStored.input_sha256);
 assert.equal(i.initial_fact_report.artifact_sha256, factStored.artifact_sha256); assert.deepEqual(clone(i.initial_fact_report.report), initialFacts);
 assert.equal(i.quality_candidate_anchor.version_id, bodyId); assert.equal(i.quality_candidate_anchor.sha256, hash(realArticle));
 assert.equal(i.quality_candidate_anchor.receipt_sha256, bodyWrapper.quality_evidence.receipt_sha256);
 const user = JSON.parse(i.user_prompt);
 assert.deepEqual(user.previous_report, structureReport); assert.equal(user.previous_report_sha256, hash(structureReport));
 assert.deepEqual(user.initial_fact_report, clone(i.initial_fact_report)); assert.deepEqual(user.input_article, realArticle);
 const reread = await claim(r); assert.equal(reread.claimed, false); assert.equal(reread.input_sha256, revision.input_sha256);
 assert.equal(stageRow(revision).input_sha256, hash(stageRow(revision).input_json));
 const noRevision = {article: realArticle, decisions: [{issue_id: structureIssue.id, action: 'rejected', reason: 'OFFLINE MOCK rejects issue.'}], changes: []};
 assert.throws(() => round.parseRoundArtifact('structure_revision', JSON.stringify(noRevision), roundContext(i)));
});
await check('actual runtime candidate→dual reports→normal-owner revision HTTP delegation and zero-model probe/read', async () => {
 const cloud = load('editorial-cloud-http-v3');
 const credentials = {stage_id: revision.stage_id, token: revision.token};
 const beforeCalls = providerCalls, beforeAttempts = sql.prepare('SELECT COUNT(*) n FROM claude_attempts').get().n;
 const delegated = await cloud.delegateEditorialV3CloudHttpOnce(r.owner, {run_id: runId, ...credentials, transport: 'cloud_http_once', confirm: true});
 assert.equal(delegated.created, true); assert.equal(delegated.stage, 'structure_revision');
 const delegation = sql.prepare('SELECT * FROM editorial_revision_cloud_delegations_v3 WHERE stage_id=?').get(revision.stage_id), frozen = JSON.parse(delegation.frozen_json);
 assert.equal(delegation.state, 'delegated'); assert.equal(frozen.source_receipt_sha256, hash(receiptRow(r, receiptKey(r, body)).response));
 assert.equal(frozen.input_json, stageRow(revision).input_json); assert.equal(frozen.input_sha256, revision.input_sha256);
 assert.equal(delegation.frozen_sha256, hash(delegation.frozen_json));
 const writes = dbWrites, readback = await cloud.readEditorialV3CloudStage(credentials);
 assert.equal(readback.stage, 'structure_revision'); assert.equal(readback.state, 'claimed'); assert.equal(readback.read_only, true);
 const probe = await cloud.probeEditorialV3CloudStage(credentials);
 assert.equal(probe.probe, true); assert.equal(probe.target_ms, 330000); assert.equal(probe.elapsed_ms, 330000); assert.equal(probe.model_request_sent, false); assert.equal(probe.reservation_consumed, false);
 assert.equal(dbWrites, writes); assert.equal(providerCalls, beforeCalls); assert.equal(sql.prepare('SELECT COUNT(*) n FROM claude_attempts').get().n, beforeAttempts);
 assert.equal(sql.prepare('SELECT state FROM editorial_revision_cloud_delegations_v3 WHERE stage_id=?').get(revision.stage_id).state, 'delegated');
 assert.equal((await cloud.delegateEditorialV3CloudHttpOnce(r.owner, {run_id: runId, ...credentials, transport: 'cloud_http_once', confirm: true})).read_only, true);
 assert.equal(dbWrites, writes);
 assert.equal(JSON.stringify(receiptRow(r, receiptKey(r, body))), originalReceipt);
});
await check('all-pass short-article attempts cannot be verified, frozen or uploaded, even with forged final lifecycle state', async () => {
 const beforeState = row(r).state, beforeRound = row(r).round;
 sql.prepare("UPDATE editorial_runs_v3 SET state='final_verify' WHERE id=?").run(runId);
 const final = await claim(r); assert.equal(final.stage, 'final_verify');
 const fullPass = {...initialFacts, passed: true, issues: [], unconfirmed: [], coverage: [realArticle.title, ...realArticle.paragraphs].map((quote, paragraph) => opinion(paragraph, quote))};
 const writes = dbWrites;
 await assert.rejects(runtime.saveEditorialV3Review(r.owner, attestedArgs(r, final, fullPass))); assert.equal(dbWrites, writes);
 sql.prepare("UPDATE editorial_runs_v3 SET state='verified' WHERE id=?").run(runId);
 const guarded = await read(r); assert.notEqual(guarded.state, 'verified'); assert.equal(guarded.current_version.quality_passed, false);
 await assert.rejects(runtime.freezeEditorialV3(r.owner, {run_id: runId, expected_final_sha256: hash(realArticle), confirm: true}));
 assert.equal(bucketPuts, 0); assert.equal(row(r).final_sha256, null);
 // A fabricated persisted pass still fails the normal exact-input stage parser.
 sql.prepare("UPDATE editorial_stages_v3 SET state='completed',artifact_json=?,artifact_sha256=?,actor_id=?,execution_id=?,model=?,provenance='owner_attested_independent_agent' WHERE id=?").run(JSON.stringify(fullPass), hash(fullPass), final.input.actor_id, crypto.randomUUID(), final.input.model, final.stage_id);
 await assert.rejects(read(r)); await assert.rejects(runtime.freezeEditorialV3(r.owner, {run_id: runId, expected_final_sha256: hash(realArticle), confirm: true}));
 assert.equal(bucketPuts, 0); assert.equal(sql.prepare('SELECT COUNT(*) n FROM articles WHERE id=?').get(r.article_id).n, 0);
 sql.prepare('DELETE FROM editorial_stages_v3 WHERE id=?').run(final.stage_id);
 sql.prepare('UPDATE editorial_runs_v3 SET state=?,round=? WHERE id=?').run(beforeState, beforeRound, runId);
 assert.equal((await read(r)).state, 'structure_revision');
});
function failedFactsFor(input) {
 return {...clone(initialFacts), coverage: [input.title, ...input.paragraphs].map((quote, paragraph) => paragraph === 2 ? {paragraph, quote, classification: 'fact', verdict: 'unconfirmed', source_ids: [], source_dates: [], context: 'OFFLINE MOCK: same unresolved issue after a genuine changed version.'} : opinion(paragraph, quote))};
}
async function saveSeededRevision(lease, before, after, issue) {
 const artifact = {article: after, decisions: [{issue_id: issue.id, action: 'accepted', reason: 'OFFLINE MOCK: exact anchored position changed, without claiming semantic resolution.'}], changes: changes(before, after)};
 seedReceipt(r, lease, JSON.stringify(artifact));
 await runtime.recoverEditorialV3Stage(r.owner, {run_id: runId, stage_id: lease.stage_id, confirm: true});
 return artifact;
}
let formalArticle, formalFactLease, formalFactReport;
await check('a valid structure revision followed by the initial factual issue on the first formal check reaches fact_revision', async () => {
 formalArticle = clone(realArticle); formalArticle.paragraphs[0] += '测'.repeat(621);
 assert.equal(Array.from(formalArticle.paragraphs.join('').replace(/\s/gu, '')).length, 2500);
 await saveSeededRevision(revision, realArticle, formalArticle, structureIssue);
 assert.equal(row(r).state, 'structure_review');
 const cleanStructure = await claim(r); assert.equal(cleanStructure.input.quality_candidate_anchor, undefined);
 await saveReview(r, review(), cleanStructure); assert.equal(row(r).state, 'fact_check');
 formalFactLease = await claim(r); assert.equal(formalFactLease.input.quality_candidate_anchor, undefined);
 formalFactReport = failedFactsFor(formalArticle);
 assert.deepEqual(formalFactReport.issues, initialFacts.issues); assert.deepEqual(formalFactReport.unconfirmed, initialFacts.unconfirmed);
 await saveReview(r, formalFactReport, formalFactLease);
 assert.equal(row(r).state, 'fact_revision'); assert.equal(providerCalls, 0);
});
await check('the identical article cannot reopen formal fact checking even when a candidate signature is excluded', async () => {
 const saved = {state: row(r).state, round: row(r).round};
 sql.prepare("UPDATE editorial_runs_v3 SET state='fact_check' WHERE id=?").run(runId);
 const duplicate = await claim(r); assert.equal(duplicate.claimed, true);
 assert.equal(duplicate.input.input_binding.sha256, formalFactLease.input.input_binding.sha256);
 await saveReview(r, formalFactReport, duplicate); assert.equal(row(r).state, 'no_progress');
 sql.prepare('DELETE FROM editorial_stages_v3 WHERE id=?').run(duplicate.stage_id);
 sql.prepare('UPDATE editorial_runs_v3 SET state=?,round=? WHERE id=?').run(saved.state, saved.round, runId);
 assert.equal((await read(r)).state, 'fact_revision');
});
await check('later identical formal factual issue signatures still stop the normal revision/final-review loop', async () => {
 let previous = formalArticle;
 const first = await claim(r); assert.equal(first.stage, 'fact_revision');
 let after = clone(previous); after.paragraphs[1] = '合成测试限定：' + after.paragraphs[1];
 await saveSeededRevision(first, previous, after, factualIssue); assert.equal(row(r).state, 'final_verify');
 let final = await claim(r); await saveReview(r, failedFactsFor(after), final); assert.equal(row(r).state, 'fact_revision');
 previous = after; after = clone(previous); after.paragraphs[1] = '第二次合成限定：' + after.paragraphs[1];
 const second = await claim(r); await saveSeededRevision(second, previous, after, factualIssue); assert.equal(row(r).state, 'final_verify');
 final = await claim(r); await saveReview(r, failedFactsFor(after), final); assert.equal(row(r).state, 'no_progress');
 assert.equal(row(r).final_sha256, null); assert.equal(bucketPuts, 0); assert.equal(providerCalls, 0);
});
if (process.argv.includes('--d1')) {
 await check('captured exact three admission CAS statements succeed atomically in local workerd D1', async () => {
  process.env.CLOUDFLARE_CF_FETCH_ENABLED = 'false';
  const {Miniflare} = await import('miniflare');
  const mf = new Miniflare({cf: false, modules: true, script: 'export default {fetch(){return new Response("local only")}}', compatibilityDate: '2026-05-22', d1Databases: {DB: 'local-quality-cas-d1'}, outboundService: () => {networkCalls++; return new Response('External network disabled', {status: 403});}});
  try {
   const d1 = await mf.getD1Database('DB');
   for (const row of sql.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) await d1.prepare(row.sql).run();
   for (const row of sql.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name").all()) await d1.prepare(row.sql).run();
   const tables = Object.keys(admitSnapshot);
   async function reset() {
    for (const table of tables.toReversed()) await d1.prepare('DELETE FROM ' + table).run();
    for (const table of tables) for (const row of admitSnapshot[table]) {const keys = Object.keys(row); await d1.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).bind(...Object.values(row)).run();}
   }
   const statements = () => admitCapture.map(({query, args}) => {assert.ok(args.length <= 100); return d1.prepare(query).bind(...args);});
   async function notAdmitted() {
    const run = await d1.prepare('SELECT state,final_sha256 FROM editorial_runs_v3 WHERE id=?').bind(runId).first();
    const body = await d1.prepare('SELECT state,error,artifact_json,artifact_sha256 FROM editorial_stages_v3 WHERE id=?').bind(bodyId).first();
    assert.equal(run.state, 'content_invalid'); assert.equal(run.final_sha256, null); assert.equal(body.state, 'content_invalid'); assert.equal(body.error, originalError); assert.equal(body.artifact_json, null); assert.equal(body.artifact_sha256, null);
   }
   await reset();
   const receiptBefore = JSON.stringify(await d1.prepare('SELECT * FROM claude_attempts WHERE id=?').bind(receiptKey(r, body)).first());
   const result = await d1.batch(statements()); assert.equal(result[0].meta.changes, 1); assert.equal(result[1].meta.changes, 1); assert.equal(result[2].results[0].quality_admitted, 1);
   const stored = await d1.prepare('SELECT state,error,artifact_json,artifact_sha256 FROM editorial_stages_v3 WHERE id=?').bind(bodyId).first();
   assert.equal(stored.state, 'content_invalid'); assert.equal(stored.error, originalError); assert.equal(stored.artifact_sha256, hash(stored.artifact_json)); assert.deepEqual(JSON.parse(stored.artifact_json).article, realArticle);
   assert.equal((await d1.prepare('SELECT state FROM editorial_runs_v3 WHERE id=?').bind(runId).first()).state, 'structure_review');
   assert.equal(JSON.stringify(await d1.prepare('SELECT * FROM claude_attempts WHERE id=?').bind(receiptKey(r, body)).first()), receiptBefore);
   console.log('PASS exact admission D1 success: 3 statements, no provider/network/production');
   for (const [label, mutation] of [
    ['receipt bytes', () => d1.prepare("UPDATE claude_attempts SET response=response||' ' WHERE id=?").bind(receiptKey(r, body)).run()],
    ['body input hash', () => d1.prepare('UPDATE editorial_stages_v3 SET input_sha256=? WHERE id=?').bind('f'.repeat(64), bodyId).run()],
    ['snapshot binding', () => d1.prepare('UPDATE editorial_runs_v3 SET snapshot_sha256=? WHERE id=?').bind('f'.repeat(64), runId).run()],
    ['authority revoked', () => d1.prepare("UPDATE editorial_authority_v3 SET state='revoked'").run()],
   ]) {await reset(); await mutation(); await assert.rejects(d1.batch(statements())); await notAdmitted(); console.log('PASS exact admission D1 binding tamper rejection: ' + label);}
   await reset();
   const beforeMutation = JSON.stringify(await d1.prepare('SELECT * FROM claude_attempts WHERE id=?').bind(receiptKey(r, body)).first());
   await d1.prepare(`CREATE TRIGGER synthetic_quality_mutate_receipt AFTER UPDATE OF artifact_json ON editorial_stages_v3 WHEN NEW.id='${bodyId}' AND NEW.artifact_json IS NOT NULL BEGIN UPDATE claude_attempts SET response=response||' ' WHERE id='${receiptKey(r, body)}'; END`).run();
   await assert.rejects(d1.batch(statements())); await notAdmitted();
   assert.equal(JSON.stringify(await d1.prepare('SELECT * FROM claude_attempts WHERE id=?').bind(receiptKey(r, body)).first()), beforeMutation);
   await d1.prepare('DROP TRIGGER synthetic_quality_mutate_receipt').run();
   console.log('PASS actual workerd D1 mid-batch receipt mutation rolls back both prior CAS and trigger change');
  } finally {await mf.dispose();}
 });
}
assert.equal(providerCalls, 0); assert.equal(networkCalls, 0); assert.equal(eventCalls, 0); assert.equal(bucketPuts, 0);
console.log(`PASS targeted quality runtime V3: ${checks.length}/${checks.length} integration checks; model calls 0, network calls 0, bucket puts 0; peak RSS ${process.resourceUsage().maxRSS} KB`);
