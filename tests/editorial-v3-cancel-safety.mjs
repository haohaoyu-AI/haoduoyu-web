// Cancellation/storage negative cases. Actual runtime and authority; SQLite/provider/metadata/logs are offline mocks.
// No production data, real credential, browser, network, paid request or deployment.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import ts from 'typescript';

const sourceRoot = process.env.TEST_SOURCE || new URL('..', import.meta.url).pathname.replace(/\/$/u, '');
const native = createRequire(import.meta.url), sql = new DatabaseSync(':memory:');
const uuidQueue = [], testCrypto = {subtle: crypto.subtle, randomUUID: () => uuidQueue.length ? uuidQueue.shift() : crypto.randomUUID()};
let metadataHook = null, afterBatch = null, readHook = null, writeFailure = null;
const capturedLogs = [];
const testConsole = Object.fromEntries(['log','warn','error','info','debug'].map(kind => [kind, (...args) => capturedLogs.push({kind, args})]));
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
   first: async () => {if (readHook) await readHook(query, args); return sql.prepare(query).get(...args) || null;},
   all: async () => ({results: sql.prepare(query).all(...args)}),
   run: async () => {if (writeFailure && writeFailure(query, args)) throw Object.assign(Error('synthetic credential ' + secret + ' raw storage response'), {raw_response: secret}); dbWrites++; if (beforeRun) await beforeRun(query, args); return {meta: {changes: Number(sql.prepare(query).run(...args).changes)}};},
  });
  return {...bound([]), bind: (...args) => bound(args)};
 },
 batch(statements) {
  const task = batchTail.then(async () => {
   if (beforeBatch) await beforeBatch(statements);
   sql.exec('BEGIN');
   try {const result = []; for (const statement of statements) result.push(await statement.run()); sql.exec('COMMIT'); if (afterBatch) await afterBatch(statements); return result;}
   catch (error) {sql.exec('ROLLBACK'); throw error;}
  });
  batchTail = task.catch(() => {}); return task;
 },
};
async function capability(requested) {
 metadataCalls++; if (metadataHook) await metadataHook(requested); if(metadataFailureCode)throw Object.assign(Error('private synthetic provider exception '+secret),{editorial_binding_stage:'live_configuration',editorial_binding_code:metadataFailureCode});
 const base = {model: requested, max_output_tokens: capabilityLimit, source_url: 'https://app.yylx.io/v1/models', checked_at: '2026-10-06T10:00:00.000Z', relay_limit_verified: true, evidence_kind: 'relay_metadata', metadata_source_url: 'https://app.yylx.io/v1/models'};
 return {...base, capability_sha256: hash(base)};
}
const claude = {
 readClaudeOutputCapability: async (_owner, requested) => capability(requested),
 protectPreparedArticleForOwner: async (_owner, value) => ({hit: JSON.stringify(value).includes(secret)}),
 requestOutlineClaudeOnce: async (owner, input, tokens, progress, inspect, options) => {
  providerCalls++;
  assert.ok(Number.isSafeInteger(options?.providerTimeoutMs)&&options.providerTimeoutMs>=300000&&options.providerTimeoutMs<=1800000);
  providerTrace.push({owner, input: clone(input), tokens: [...tokens], signal: options?.signal, providerTimeoutMs:options?.providerTimeoutMs, mocked: true, actual_fee: 0});
  if (providerHook) await providerHook(options);
  if (options?.signal?.aborted) throw Error('OFFLINE MOCK aborted before any simulated response');
  if (providerState === 'throw') throw Object.assign(Error('synthetic credential ' + secret), {raw_response: secret});
  return {state: 'completed', text: JSON.stringify(response || outline), requested_model: input.model, returned_model: input.model, usage: clone(providerUsage), diagnostic: {stage: 'completed', http_status: 200, stop_reason: 'end_turn', eof_received: true, incomplete_frame: false, message_stop_received: true, request_stream: true, transport_version: 'anthropic_sse_buffered_v2', inspection_version: 'buffered_v2', raw_retained: false, safety_subcause: null, transport_subcause: null}};
 },
};
// The transport gate is true only in this isolated VM source copy so the
// cancellation test can reach prepare/consume. No source file or live gate is changed.
const modules = {};
function load(name) {
 if (modules[name]) return modules[name];
 const exports = {}; modules[name] = exports;
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(sourceRoot + '/lib/' + name + '.ts', 'utf8').replace(/export const editorialCloudHttpPaidEnabled = (?:true|false);/u,'export const editorialCloudHttpPaidEnabled = true;'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {
  exports, crypto: testCrypto, console: testConsole, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Date, Error, URL, Request, Response, File, ReadableStream, AbortSignal, AbortController, setInterval, clearInterval,
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
async function write(r, artifact, lease) {
 lease ||= await claim(r); assert.equal(lease.claimed, true);
 if (r.started.writer === 'xiaoyu_agent0YYLX') await runtime.saveAgentEditorialV3Stage(r.owner, attestedArgs(r, lease, artifact));
 else {response = artifact; const result = await runtime.executeEditorialV3Stage(await prepare(r, lease)); assert.equal(result.saved, true, JSON.stringify(result));}
 return lease;
}
async function saveReview(r, artifact, lease) {lease ||= await claim(r); assert.equal(lease.claimed, true); await runtime.saveEditorialV3Review(r.owner, attestedArgs(r, lease, artifact)); return lease;}

const failures = []; let checks = 0;
const redacted = value => {const text = JSON.stringify(value); assert.ok(!text.includes(secret)); assert.ok(!text.includes('raw storage response')); assert.ok(!text.includes('synthetic credential'));};
const receiptsFor = r => sql.prepare('SELECT * FROM claude_attempts WHERE owner=? ORDER BY id').all(r.owner);
const receiptFor = (r, lease) => sql.prepare('SELECT * FROM claude_attempts WHERE owner=? AND id=?').get(r.owner, receiptKey(r, lease));
async function fixture(label) {
 const r = await create('offline-cancel-' + label, 'claude_provider', 'offline:cancel:' + label), lease = await claim(r), prepared = await prepare(r, lease);
 return {r, lease, prepared};
}
async function check(name, action) {
 checks++;
 try {await action(); console.log('PASS ' + name);} catch (error) {failures.push({name, message: String(error.message).replaceAll(secret, '[synthetic credential redacted]')}); console.error('FAIL ' + name + ': ' + String(error.message).replaceAll(secret, '[synthetic credential redacted]'));}
 finally {metadataHook = null; afterBatch = null; readHook = null; writeFailure = null; beforeRun = null; beforeBatch = null; providerHook = null; providerState = 'completed';}
}
await check('already-aborted runtime rejects before reprepare, reservation or provider', async () => {
 const {r, lease, prepared} = await fixture('already-aborted'), controller = new AbortController(); controller.abort(Error(secret));
 const writes = dbWrites, calls = providerCalls, metadata = metadataCalls;
 await assert.rejects(runtime.executeEditorialV3Stage(prepared, {signal: controller.signal}), error => {redacted({message: error.message}); return true;});
 assert.equal(dbWrites, writes); assert.equal(providerCalls, calls); assert.equal(metadataCalls, metadata); assert.equal(receiptsFor(r).length, 0); assert.equal(stageRow(lease).state, 'claimed');
});
await check('abort during long reprepare/authority await rejects before durable reservation and provider', async () => {
 const {r, lease, prepared} = await fixture('prepare-await'), controller = new AbortController(); let reached = 0;
 metadataHook = async () => {reached++; await new Promise(resolve => setImmediate(resolve)); controller.abort(Error(secret));};
 const writes = dbWrites, calls = providerCalls;
 await assert.rejects(runtime.executeEditorialV3Stage(prepared, {signal: controller.signal}), error => {redacted({message: error.message}); return true;});
 assert.ok(reached > 0); assert.equal(dbWrites, writes); assert.equal(providerCalls, calls); assert.equal(receiptsFor(r).length, 0); assert.equal(stageRow(lease).state, 'claimed');
});
await check('abort immediately after reservation retains one safe failed attempt, stops provider and never replays', async () => {
 const {r, lease, prepared} = await fixture('after-reservation'), controller = new AbortController(); let reached = false;
 afterBatch = async statements => {if (statements.some(statement => statement.query.includes('INSERT OR IGNORE INTO claude_attempts'))) {reached = true; afterBatch = null; controller.abort(Error(secret));}};
 const calls = providerCalls, result = await runtime.executeEditorialV3Stage(prepared, {signal: controller.signal}); redacted(result);
 assert.equal(reached, true); assert.equal(result.state, 'failed'); assert.equal(providerCalls, calls);
 const receipt = receiptFor(r, lease); assert.equal(receipt.state, 'failed'); redacted(JSON.parse(receipt.response));
 assert.equal(receiptsFor(r).length, 1); assert.equal(stageRow(lease).state, 'technical_failed');
 const original = JSON.stringify(receipt), replay = await runtime.executeEditorialV3Stage(prepared); redacted(replay);
 assert.equal(replay.cached, true); assert.equal(providerCalls, calls); assert.equal(JSON.stringify(receiptFor(r, lease)), original);
});
await check('abort in post-reservation authority await cannot reach the provider', async () => {
 const {r, lease, prepared} = await fixture('authority-after-reservation'), controller = new AbortController(); let reached = false;
 afterBatch = async statements => {if (statements.some(statement => statement.query.includes('INSERT OR IGNORE INTO claude_attempts'))) {afterBatch = null; metadataHook = async () => {reached = true; await new Promise(resolve => setImmediate(resolve)); controller.abort(Error(secret));};}};
 const calls = providerCalls, result = await runtime.executeEditorialV3Stage(prepared, {signal: controller.signal}); redacted(result);
 assert.equal(reached, true); assert.equal(result.state, 'failed'); assert.equal(providerCalls, calls); assert.equal(receiptFor(r, lease).state, 'failed'); assert.equal(receiptsFor(r).length, 1);
});
await check('unknown provider failure is safe and its reserved attempt is never replayed', async () => {
 const {r, lease, prepared} = await fixture('unknown-provider'); providerState = 'throw';
 const before = providerCalls, result = await runtime.executeEditorialV3Stage(prepared); redacted(result);
 assert.equal(result.state, 'failed'); assert.equal(providerCalls, before + 1);
 const stored = receiptFor(r, lease); assert.equal(stored.state, 'failed'); redacted(JSON.parse(stored.response));
 const original = JSON.stringify(stored), replay = await runtime.executeEditorialV3Stage(prepared); redacted(replay);
 assert.equal(replay.cached, true); assert.equal(providerCalls, before + 1); assert.equal(JSON.stringify(receiptFor(r, lease)), original);
});
await check('final receipt persistence error yields only closed storage_pending result/log and retains requested reservation', async () => {
 const {r, lease, prepared} = await fixture('receipt-storage');
 const oldOwner = 'offline-old-receipt-immutable';
 sql.prepare('INSERT INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,?,?,?)').run('offline-old-completed-receipt', oldOwner, day, 'completed', JSON.stringify({state: 'completed', text: 'original immutable model receipt', requested_model: model, returned_model: model, usage: {input_tokens: 101, output_tokens: 202, thinking_tokens: 3}, diagnostic: {stage: 'completed'}}), day);
 const oldReceipt = JSON.stringify(sql.prepare('SELECT * FROM claude_attempts WHERE owner=?').all(oldOwner)), oldHash = hash(oldReceipt), logsBefore = capturedLogs.length;
 writeFailure = (query, args) => query.includes("UPDATE claude_attempts SET state=?,response=?") && args[2] === receiptKey(r, lease);
 const calls = providerCalls, result = await runtime.executeEditorialV3Stage(prepared); redacted(result);
 assert.notEqual(result.state, 'completed'); assert.equal(result.saved, false); assert.equal(result.storage_pending, true); assert.equal(result.read_only, true); assert.equal(result.automatic_paid_retry, false);
 assert.equal(providerCalls, calls + 1); assert.equal(receiptFor(r, lease).state, 'requested'); assert.equal(JSON.parse(receiptFor(r, lease).response).state, 'requested'); assert.equal(stageRow(lease).state, 'requested'); assert.equal(stageRow(lease).artifact_json, null);
 const logs = capturedLogs.slice(logsBefore); assert.ok(logs.length >= 1); redacted(logs);
 const decoded = logs.flatMap(({args}) => args.map(value => typeof value === 'string' ? JSON.parse(value) : value));
 assert.deepEqual(clone(result.diagnostic), {stage: 'receipt_persistence', code: 'storage_error'});
 assert.deepEqual(decoded, [{component: 'editorial-v3-execution', stage_id: lease.stage_id, input_sha256: lease.input_sha256, stage: 'receipt_persistence', code: 'storage_error'}]);
 for (const packet of decoded) {assert.ok(!('message' in packet)); assert.ok(!('error' in packet)); assert.ok(!('raw_response' in packet)); assert.ok(!('owner' in packet)); assert.ok(!('input' in packet));}
 assert.equal(JSON.stringify(sql.prepare('SELECT * FROM claude_attempts WHERE owner=?').all(oldOwner)), oldReceipt); assert.equal(hash(JSON.stringify(sql.prepare('SELECT * FROM claude_attempts WHERE owner=?').all(oldOwner))), oldHash);
 writeFailure = null;
 const requested = JSON.stringify(receiptFor(r, lease)), replay = await runtime.executeEditorialV3Stage(prepared); redacted(replay);
 assert.equal(replay.cached, true); assert.equal(providerCalls, calls + 1); assert.equal(JSON.stringify(receiptFor(r, lease)), requested); assert.equal(receiptsFor(r).length, 1);
});

// This fixture directly seeds only local receipts; it never simulates a model
// call while setting up the genuine one-body continuation transport capability.
function seedReceipt(r, lease, artifact, state = 'completed') {
 const packet = {state, stage: lease.stage, stage_id: lease.stage_id, input_sha256: lease.input_sha256, snapshot_sha256: r.snapshot_sha256, requested_model: model, returned_model: state === 'completed' ? model : null, text: state === 'completed' ? JSON.stringify(artifact) : null, partial_text: null, raw_partial_response: null, raw_response: null, diagnostic: {stage: state === 'completed' ? 'completed' : 'failed'}};
 const id = receiptKey(r, lease); sql.prepare('INSERT INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,?,?,?)').run(id, r.owner, day, state, JSON.stringify(packet), day); sql.prepare("UPDATE editorial_stages_v3 SET state='requested',receipt_id=? WHERE id=?").run(id, lease.stage_id);
}
await check('actual body HTTP cancellation during long prepare does not consume delegation or reserve/start provider', async () => {
 const r = await create('offline-cancel-body-transport', 'claude_provider', 'offline:exact-body-continuation');
 const outlineLease = await claim(r); seedReceipt(r, outlineLease, outline); await runtime.recoverEditorialV3Stage(r.owner, {run_id: r.run_id, stage_id: outlineLease.stage_id, confirm: true}); await saveReview(r, review());
 let failed = await claim(r); const failedId = '5b4832c6-4fbf-4f48-b4cf-fd5b927f71ee', failedInput = {...failed.input, stage_id: failedId};
 sql.prepare('UPDATE editorial_stages_v3 SET id=?,input_json=?,input_sha256=? WHERE id=?').run(failedId, JSON.stringify(failedInput), hash(failedInput), failed.stage_id); failed = {...failed, stage_id: failedId, input: failedInput, input_sha256: hash(failedInput)};
 seedReceipt(r, failed, null, 'failed'); await runtime.recoverEditorialV3Stage(r.owner, {run_id: r.run_id, stage_id: failedId, confirm: true});
 const preview = await runtime.previewEditorialV3BodyContinuation(r.owner, {run_id: r.run_id, failed_stage_id: failedId}), quote = 'OFFLINE SYNTHETIC OWNER approves one additional original body attempt for cancellation safety tests.';
 await runtime.authorizeEditorialV3BodyContinuation(r.owner, {authorization_key: 'offline-cancel-continuation', run_id: r.run_id, failed_stage_id: failedId, source_kind: 'owner_chat', source_message_id: 'offline-cancel-message', quoted_evidence: quote, quoted_evidence_sha256: hash(quote), confirmed_scope: 'editorial_v3_one_explicit_failed_body_continuation', expected_receipt_sha256: preview.expected_receipt_sha256, expected_input_sha256: preview.expected_input_sha256, expected_snapshot_sha256: preview.expected_snapshot_sha256, confirm: true});
 const body = await claim(r), cloud = load('editorial-cloud-http-v3'), credentials = {stage_id: body.stage_id, token: body.token};
 await cloud.delegateEditorialV3CloudHttpOnce(r.owner, {run_id: r.run_id, ...credentials, transport: 'cloud_http_once', confirm: true});
 const delegationBefore = JSON.stringify(sql.prepare('SELECT * FROM editorial_cloud_delegations_v3 WHERE stage_id=?').get(body.stage_id)), receiptsBefore = JSON.stringify(receiptsFor(r));
 const controller = new AbortController(); let reached = 0; metadataHook = async () => {reached++; await new Promise(resolve => setImmediate(resolve)); controller.abort(Error(secret));};
 const writes = dbWrites, calls = providerCalls;
 let outcome, caught;
 try {outcome = await cloud.executeEditorialV3CloudStage(credentials, controller.signal);} catch (error) {caught = error;}
 if (!caught) {redacted(outcome); throw Error('Expected transport rejection; reached=' + reached + '; aborted=' + controller.signal.aborted + '; writes_delta=' + (dbWrites - writes) + '; provider_delta=' + (providerCalls - calls) + '; safe_outcome=' + JSON.stringify(outcome));}
 redacted({message: caught.message});
 assert.ok(reached > 0); assert.equal(dbWrites, writes); assert.equal(providerCalls, calls);
 assert.equal(JSON.stringify(sql.prepare('SELECT * FROM editorial_cloud_delegations_v3 WHERE stage_id=?').get(body.stage_id)), delegationBefore); assert.equal(JSON.stringify(receiptsFor(r)), receiptsBefore); assert.equal(stageRow(body).state, 'claimed');
});
await check('trusted V3 default900s is out of frozen model input; invalid deadlines fail before preparation or reservation', async () => {
 const {r,lease,prepared}=await fixture('deadline-options');
 for(const providerTimeoutMs of [299999,1800001,NaN,Infinity,900000.5,'900000',null]){const writes=dbWrites,calls=providerCalls,metadata=metadataCalls;await assert.rejects(runtime.executeEditorialV3Stage(prepared,{providerTimeoutMs}));assert.equal(dbWrites,writes);assert.equal(providerCalls,calls);assert.equal(metadataCalls,metadata);assert.equal(receiptsFor(r).length,0);}
 const frozen=stageRow(lease).input_json,calls=providerCalls;response=outline;const completed=await runtime.executeEditorialV3Stage(prepared);assert.equal(completed.saved,true);assert.equal(providerCalls,calls+1);assert.equal(providerTrace.at(-1).providerTimeoutMs,900000);assert.equal(stageRow(lease).input_json,frozen);assert.ok(!frozen.includes('providerTimeoutMs'));assert.equal(providerTrace.at(-1).input.max_output_tokens,limit);assert.equal(JSON.stringify(providerTrace.at(-1).input),JSON.stringify({model,max_output_tokens:prepared.input.max_output_tokens,system_prompt:prepared.input.system_prompt,user_prompt:prepared.input.user_prompt}));
 const before=providerCalls;await runtime.executeEditorialV3Stage(prepared,{providerTimeoutMs:1800000});assert.equal(providerCalls,before);
});
assert.equal(networkCalls, 0); assert.equal(bucketPuts, 0); assert.equal(eventCalls, 0);
console.log(`V3 cancellation/storage: ${checks - failures.length}/${checks} checks; real model/network calls 0; offline provider mocks ${providerCalls}; peak RSS ${process.resourceUsage().maxRSS} KB`);
if (failures.length) {console.error(JSON.stringify(failures)); process.exitCode = 1;}
