// Actual in-memory SQLite integration. All provider/network calls are forbidden.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {testOutline} from './fixtures/writing-outline.mjs';

const sql = new DatabaseSync(':memory:'), nativeRequire = createRequire(import.meta.url);
for (const file of fs.readdirSync('drizzle').filter(n => n.endsWith('.sql')).sort()) sql.exec(fs.readFileSync('drizzle/' + file, 'utf8'));
let mockFetch = null, mockedProviderCalls = 0;
let provider = 0, dispatches = 0, puts = 0, writes = 0, connected = true, batches = Promise.resolve();
const objects = new Map();
const db = {
 batch(statements) {const task = batches.then(async () => {sql.exec('BEGIN'); try {const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec('COMMIT'); return results;} catch (error) {sql.exec('ROLLBACK'); throw error;}}); batches = task.catch(() => {}); return task;},
 prepare(query) {return {bind: (...args) => ({first: async () => sql.prepare(query).get(...args) || null, all: async () => ({results: sql.prepare(query).all(...args)}), run: async () => {writes++; return {meta: {changes: Number(sql.prepare(query).run(...args).changes)}};}})};},
};
const bucket = {async put(key, bytes) {puts++; objects.set(key, new Uint8Array(bytes));}, async get(key) {const bytes = objects.get(key); return bytes ? {arrayBuffer: async () => bytes.buffer} : null;}};
const globals = {crypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Set, Date, Error, URL, btoa, atob, Request, Response, File, ReadableStream, AbortSignal, setInterval, clearInterval};
const modules = {};
function load(name) {
 if (modules[name]) return modules[name]; const ex = {}; modules[name] = ex;
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/' + name + '.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {...globals, exports: ex, require: name => name === 'cloudflare:workers' ? {env: {DB: db, BUCKET: bucket, CLAUDE_CONFIG_KEY: btoa('01234567890123456789012345678901')}} : name === './events' ? {readiness: async () => ({connected}), dispatch: async () => {dispatches++; return '事件已送达';}} : name.startsWith('./') ? load(name.slice(2)) : nativeRequire(name), fetch: async (...args) => {if (mockFetch) {mockedProviderCalls++; return mockFetch(...args);} provider++; throw Error('Network/provider disabled in offline test');}});
 return ex;
}
const w = load('writing'), r = load('text-revision'), f = load('daily-editorial-finalize');
const day = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const article = {title: '日更合成初稿', paragraphs: Array.from({length: 25}, (_, index) => String(index).padStart(2, '0') + '证'.repeat(98))};
const rewritten = {title: '日更合成改稿', paragraphs: article.paragraphs.map(text => text.replace(/证/g, '文'))};
const sources = [{title: '合成来源一', url: 'https://example.com/one', published: day}, {title: '合成来源二', url: 'https://example.com/two', published: day}];
const topic = {topic: '独立离线测试选题', materials: '用于本地测试的合成研究材料，不代表真实新闻事实。'.repeat(10), outline: testOutline, sources};
const review = {status: 'completed', issues: [{id: 'issue-1', paragraph: 1, quote: article.paragraphs[0].slice(0, 12), problem: '表达需改进', recommendation: '使用更自然的表达', source_urls: [sources[0].url]}]};
const rewrite = {status: 'completed', article: rewritten, changes: [{issue_id: 'issue-1', paragraph: 1, quote: rewritten.paragraphs[0].slice(0, 12), change: '已落实表达修改'}]};
const verify = {status: 'completed', passed: true, checks: [{issue_id: 'issue-1', paragraph: 1, quote: rewritten.paragraphs[0].slice(0, 12), resolved: true, reason: '逐项核对已修正'}], remaining_problems: []};
const count = table => sql.prepare('SELECT count(*) n FROM ' + table).get().n;
const snapshot = () => JSON.stringify(['writing_runs', 'daily_editorial_drafts', 'manual_writing_batches', 'claude_attempts', 'articles'].map(table => sql.prepare('SELECT * FROM ' + table + ' ORDER BY 1').all()));
const clone = value => JSON.parse(JSON.stringify(value));
async function initial(owner, writer = 'xiaoyu', legacy = false) {
 const claim = await w.writingCall(owner, 'claim_writing_run', {day, writer});
 if (legacy) {const row = sql.prepare('SELECT input_snapshot FROM writing_runs WHERE article_id=?').get(claim.article_id); const input = JSON.parse(row.input_snapshot); delete input.editorial_contract_version; sql.prepare('UPDATE writing_runs SET input_snapshot=? WHERE article_id=?').run(JSON.stringify(input), claim.article_id);}
 await w.writingCall(owner, 'prepare_writing_input', {article_id: claim.article_id, token: claim.token, ...topic});
 const input = JSON.parse(sql.prepare('SELECT input_snapshot FROM writing_runs WHERE article_id=?').get(claim.article_id).input_snapshot);
 assert.equal(input.editorial_contract_version, legacy ? undefined : 1);
 let providerResponse;
 if (writer === 'claude') {
  providerResponse = JSON.stringify({text: JSON.stringify(article), requested_model: 'synthetic-provider-model', snapshot: {day, article_id: claim.article_id, topic: topic.topic, model: 'synthetic-provider-model', expected_model: 'synthetic-provider-model', max_output_tokens: 14000, sources}});
  sql.prepare('INSERT INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,?,?,?)').run(owner + ':' + day, owner, day, 'completed', providerResponse, new Date().toISOString());
 }
 const args = {day, writer, token: claim.token, ...article, topic: topic.topic, sources};
 await assert.rejects(w.writingCall(owner + '-other', 'save_writing_article', args));
 await assert.rejects(w.writingCall(owner, 'save_writing_article', {...args, token: crypto.randomUUID()}));
 const saved = await w.writingCall(owner, 'save_writing_article', args);
 const participants = Object.fromEntries(['review', 'rewrite', 'verify'].map(stage => [stage, {actor_id: crypto.randomUUID(), model: 'synthetic-agent-' + stage}]));
 const create = {day, writer, writer_actor_id: crypto.randomUUID(), writer_execution_id: crypto.randomUUID(), participants, expected_prompt_version: input.prompt_version, confirm: true};
 return {owner, writer, claim, args, saved, create, providerResponse};
}
async function claim(owner, flow, stage, extra = {}) {return r.claimTextRevisionStage(owner, {flow_id: flow.flow_id, stage, expected_version: stage === 'verify' ? 2 : 1, expected_model: flow.snapshot.participants[stage].model, expected_prompt_version: flow.snapshot.prompt_version, confirm: true, ...extra});}
function saveArgs(flow, claimed, report, extra = {}) {return {flow_id: flow.flow_id, stage: claimed.stage, item_id: claimed.item_id, token: claimed.token, execution_id: crypto.randomUUID(), actor_id: claimed.prompts.participant.actor_id, expected_model: claimed.prompts.participant.model, expected_version: claimed.prompts.input_version, expected_prompt_version: claimed.prompts.prompt_version, input_sha256: claimed.prompts.input_sha256, raw_result: JSON.stringify(report), confirm: true, ...extra};}
async function stage(owner, flow, name, report) {const claimed = await claim(owner, flow, name), args = saveArgs(flow, claimed, report); return {claimed, args, saved: await r.saveTextRevisionStage(owner, args)};}
const finalizeArgs = flow => ({flow_id: flow.flow_id, expected_body_sha256: flow.rewritten_version?.body_sha256 || flow.initial_version.body_sha256, confirm: true});

// Both writers freeze initial text without articles, R2 writes, dispatches or paid calls.
const xa = await initial('daily-pair'), ca = await initial('daily-pair', 'claude');
assert.equal(count('claude_settings'), 0);
const cl = load('claude'), editorial = load('daily-editorial');
// Provider initial_saved writeback is deliberately absent in this seeded receipt.
const providerBeforeRead = sql.prepare('SELECT response FROM claude_attempts WHERE id=?').get(ca.owner + ':' + day).response;
const initialRead = await cl.readClaudeDailyResult(ca.owner, day);
const initialStatus = (await cl.claudeStatus(ca.owner)).writing_attempts.daily;
assert.equal(initialStatus.initial_saved, true); assert.equal(initialStatus.final_saved, false); assert.equal(initialStatus.editorial_phase, 'review_pending');
assert.equal(initialRead.initial_saved, true); assert.equal(initialRead.saved, false); assert.equal(initialRead.editorial_phase, 'review_pending');
assert.equal((await editorial.readDailyEditorialProgress(ca.owner, day)).delivery_state, 'review_pending');
assert.equal(sql.prepare('SELECT response FROM claude_attempts WHERE id=?').get(ca.owner + ':' + day).response, providerBeforeRead);
for (const row of await w.writingList(ca.owner)) {assert.equal(row.title, article.title); assert.equal(row.initial_saved, true); assert.equal(row.initial_writer, row.writer); assert.equal(row.final_source, null);}

for (const fixture of [xa, ca]) {
 assert.equal(fixture.saved.initial_saved, true); assert.equal(fixture.saved.editorial_phase, 'review_pending');
 assert.equal(sql.prepare('SELECT state FROM writing_runs WHERE article_id=?').get(fixture.claim.article_id).state, 'review_pending');
 await assert.rejects(w.writingCall(fixture.owner, 'submit_writing_article', {day, writer: fixture.writer}));
 const before = snapshot(), writeCount = writes; await w.writingCall(fixture.owner, 'save_writing_article', fixture.args); assert.equal(snapshot(), before); assert.equal(writes, writeCount);
 await assert.rejects(w.writingCall(fixture.owner, 'save_writing_article', {...fixture.args, title: '不得替换初稿'}));
}
assert.equal(count('articles'), 0); assert.equal(puts, 0); assert.equal(dispatches, 0); assert.equal(provider, 0);
console.log('PASS both daily initial drafts: frozen exact text, review_pending, no article/object/event/provider; Xiaoyu needs no Claude configuration');

async function changeSettings(owner, model = 'changed-unrelated-model', enabled = '0', secret = 'opaque.synthetic.changed.secret') {
 const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('01234567890123456789012345678901'), {name: 'AES-GCM'}, false, ['encrypt']);
 const iv = crypto.getRandomValues(new Uint8Array(12)), data = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(owner)}, key, new TextEncoder().encode(secret));
 const enc = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
 sql.prepare('INSERT OR REPLACE INTO claude_settings(owner,model,secret,enabled,updated) VALUES(?,?,?,?,?)').run(owner, model, JSON.stringify({iv: enc(iv), data: enc(data)}), enabled, new Date().toISOString());
}
const flows = [];
let firstReviewExecution;
for (const fixture of [xa, ca]) {
 const before = snapshot();
 for (const extra of [{confirm: false}, {expected_prompt_version: 'wrong'}, {writer_actor_id: 'not-a-uuid'}, {writer_actor_id: fixture.create.participants.review.actor_id}, {writer_actor_id: fixture.create.participants.verify.actor_id.toUpperCase()}, {participants: {...fixture.create.participants, verify: fixture.create.participants.rewrite}}, {participants: {...fixture.create.participants, review: fixture.create.participants.rewrite}}]) await assert.rejects(r.createDailyTextRevision(fixture.owner, {...fixture.create, ...extra}));
 await assert.rejects(r.createDailyTextRevision('other-owner', fixture.create)); assert.equal(snapshot(), before);
 const concurrent = await Promise.all([r.createDailyTextRevision(fixture.owner, fixture.create), r.createDailyTextRevision(fixture.owner, fixture.create)]);
 assert.equal(concurrent.filter(flow => flow.created).length, 1); assert.equal(concurrent[0].flow_id, concurrent[1].flow_id); const flow = concurrent[0]; flows.push(flow);
 assert.equal(flow.paid_scope.provider_enabled, false); assert.equal(flow.paid_scope.approved_calls, 0); assert.equal(flow.paid_scope.used_calls, 0);
 assert.deepEqual(clone(flow.initial_version.article), article);
 await assert.rejects(f.finalizeVerifiedDailyRevision(fixture.owner, finalizeArgs(flow)));
 await assert.rejects(claim(fixture.owner, flow, 'rewrite'));
 await assert.rejects(claim('other-owner', flow, 'review'));
 await assert.rejects(r.readTextRevision('other-owner', {flow_id: flow.flow_id}));
 // Changing/disabling provider settings cannot gate stages that make zero provider calls.
 await changeSettings(fixture.owner);
 for (const extra of [{confirm: false}, {expected_model: 'wrong'}, {expected_version: 2}, {expected_prompt_version: 'wrong'}]) await assert.rejects(claim(fixture.owner, flow, 'review', extra));
 const claims = await Promise.all([claim(fixture.owner, flow, 'review'), claim(fixture.owner, flow, 'review')]); assert.equal(claims.filter(value => value.claimed).length, 1);
 const c = claims.find(value => value.claimed), args = saveArgs(flow, c, review);
 assert.equal('token' in claims.find(value => !value.claimed), false);
 for (const extra of [{confirm: false}, {actor_id: fixture.create.writer_actor_id}, {actor_id: fixture.create.participants.rewrite.actor_id}, {execution_id: fixture.create.writer_execution_id}, {input_sha256: 'wrong'}, {expected_version: 2}, {expected_model: 'wrong'}, {token: fixture.claim.token}]) await assert.rejects(r.saveTextRevisionStage(fixture.owner, {...args, ...extra}));
 await assert.rejects(r.saveTextRevisionStage('other-owner', args));
 if (firstReviewExecution) await assert.rejects(r.saveTextRevisionStage(fixture.owner, {...args, execution_id: firstReviewExecution.toUpperCase()}));
 else firstReviewExecution = args.execution_id;
 const saves = await Promise.all([r.saveTextRevisionStage(fixture.owner, args), r.saveTextRevisionStage(fixture.owner, args)]); assert.equal(saves.filter(value => !value.read_only).length, 1);
 const beforeReplay = snapshot(), replayWrites = writes; await r.saveTextRevisionStage(fixture.owner, args); await r.readTextRevision(fixture.owner, {flow_id: flow.flow_id}); assert.equal(snapshot(), beforeReplay); assert.equal(writes, replayWrites);
 await assert.rejects(r.saveTextRevisionStage(fixture.owner, {...args, raw_result: JSON.stringify({status: 'completed', issues: []})}));
 const rewriteClaim = await claim(fixture.owner, flow, 'rewrite');
 await assert.rejects(r.saveTextRevisionStage(fixture.owner, saveArgs(flow, rewriteClaim, rewrite, {execution_id: args.execution_id.toUpperCase()})));
 const rewrittenFlow = await r.saveTextRevisionStage(fixture.owner, saveArgs(flow, rewriteClaim, rewrite));
 assert.equal(rewrittenFlow.rewritten_version.source, 'agent_text');
 await assert.rejects(f.finalizeVerifiedDailyRevision(fixture.owner, finalizeArgs(rewrittenFlow)));
 await assert.rejects(w.writingCall(fixture.owner, 'submit_writing_article', {day, writer: fixture.writer}));
 const verified = await stage(fixture.owner, flow, 'verify', verify); assert.equal(verified.saved.current_phase, 'verified');
 for (const [name, report] of Object.entries({review, rewrite, verify})) {
  const receipt = verified.saved.results[name];
  assert.equal(receipt.source, 'owner_attested_agent_result');
  assert.equal(receipt.raw_result, JSON.stringify(report));
  assert.equal(receipt.actor_id, fixture.create.participants[name].actor_id);
 }
 assert.equal(JSON.stringify(verified.saved).includes(c.token), false);
 assert.equal(count('articles'), 0); assert.equal(puts, 0); assert.equal(dispatches, 0);
 await assert.rejects(r.confirmTextRevision(fixture.owner, {...finalizeArgs(verified.saved), expected_version: 2}));
 fixture.verified = verified.saved;
 const progress = await editorial.readDailyEditorialProgress(fixture.owner, day, fixture.writer);
 assert.equal(progress.editorial_phase, 'verified'); assert.equal(progress.final_saved, false); assert.equal(progress.resume_action, 'finalize_verified');
}
assert.notEqual(flows[0].flow_id, flows[1].flow_id); assert.notEqual(flows[0].paid_scope.id, flows[1].paid_scope.id);
console.log('PASS independent actor/execution/hash/model/owner binding, atomic claims/saves, zero-write replay, separate writer flows, changed Claude configuration never gates zero-paid stages');

for (const fixture of [xa, ca]) {
 const args = finalizeArgs(fixture.verified), before = snapshot(), oldPuts = puts, oldEvents = dispatches;
 for (const extra of [{confirm: false}, {expected_body_sha256: 'wrong'}, {body: rewritten}, {article: rewritten}, {expected_version: 2}]) await assert.rejects(f.finalizeVerifiedDailyRevision(fixture.owner, {...args, ...extra}));
 await assert.rejects(f.finalizeVerifiedDailyRevision('other-owner', args)); assert.equal(snapshot(), before); assert.equal(puts, oldPuts); assert.equal(dispatches, oldEvents);
 // A changed source/input binding must invalidate even an already verified flow.
 const frozen = sql.prepare('SELECT initial_json,input_snapshot FROM daily_editorial_drafts WHERE article_id=?').get(fixture.claim.article_id);
 sql.prepare('UPDATE daily_editorial_drafts SET initial_json=? WHERE article_id=?').run(JSON.stringify(rewritten), fixture.claim.article_id);
 await assert.rejects(f.finalizeVerifiedDailyRevision(fixture.owner, args));
 sql.prepare('UPDATE daily_editorial_drafts SET initial_json=?,input_snapshot=? WHERE article_id=?').run(frozen.initial_json, '{}', fixture.claim.article_id);
 await assert.rejects(f.finalizeVerifiedDailyRevision(fixture.owner, args));
 sql.prepare('UPDATE daily_editorial_drafts SET input_snapshot=? WHERE article_id=?').run(frozen.input_snapshot, fixture.claim.article_id);
 assert.equal(puts, oldPuts); assert.equal(dispatches, oldEvents);
 const results = await Promise.all([f.finalizeVerifiedDailyRevision(fixture.owner, args), f.finalizeVerifiedDailyRevision(fixture.owner, args)]);
 assert.ok(results.every(value => value.saved)); assert.equal(dispatches, oldEvents);
 const stored = sql.prepare('SELECT * FROM articles WHERE id=?').get(fixture.claim.article_id), manifest = JSON.parse(stored.artifact_manifest);
 assert.deepEqual(JSON.parse(stored.paragraphs), [rewritten.title, ...rewritten.paragraphs]); assert.equal(stored.state,'text_saved'); assert.equal(manifest.output_mode,'text_only'); assert.equal(manifest.author, 'agent_text'); assert.equal(manifest.text_revision.final_source, 'agent_text'); assert.equal(manifest.text_revision.initial_writer, fixture.writer); assert.equal(manifest.text_revision.flow_id, args.flow_id);
 assert.equal(sql.prepare('SELECT initial_json FROM daily_editorial_drafts WHERE article_id=?').get(fixture.claim.article_id).initial_json, JSON.stringify(article));
 assert.equal(new TextDecoder().decode(objects.get(stored.source_key)), [rewritten.title, ...rewritten.paragraphs].join('\n\n'));
 const repeated = snapshot(), repeatedPuts = puts, repeatedEvents = dispatches; assert.equal((await f.finalizeVerifiedDailyRevision(fixture.owner, args)).already_saved, true); assert.equal(snapshot(), repeated); assert.equal(puts, repeatedPuts); assert.equal(dispatches, repeatedEvents);
}
assert.equal(sql.prepare('SELECT response FROM claude_attempts WHERE id=?').get(ca.owner + ':' + day).response, ca.providerResponse);
assert.equal(count('articles'), 2); assert.equal(provider, 0);
const finalRead = await cl.readClaudeDailyResult(ca.owner, day);
const finalStatus = (await cl.claudeStatus(ca.owner)).writing_attempts.daily;
assert.equal(finalStatus.initial_saved, true); assert.equal(finalStatus.final_saved, true); assert.equal(finalStatus.editorial_phase, 'verified'); assert.equal(finalStatus.outcome, 'saved'); assert.equal(finalStatus.delivery_state, 'text_saved');
const visibleRows = await w.writingList(ca.owner);
assert.equal(visibleRows.length, 2); assert.ok(visibleRows.every(row => !row.run_kind.startsWith('text_revision:')));
assert.deepEqual(Array.from(visibleRows, row => row.article_id).sort(), [xa.claim.article_id, ca.claim.article_id].sort());
assert.equal(sql.prepare("SELECT count(*) n FROM writing_runs WHERE owner=? AND run_kind LIKE 'text_revision:%'").get(ca.owner).n, 6, 'stage leases remain stored but are not displayed as articles');
assert.equal(finalRead.initial_saved, true); assert.equal(finalRead.saved, true); assert.equal(finalRead.editorial_phase, 'verified'); assert.equal(finalRead.outcome, 'saved'); assert.equal(finalRead.delivery_state, 'text_saved');
for (const row of (await w.writingList(ca.owner)).filter(row => row.run_kind === 'daily')) {assert.equal(row.final_source, 'agent_text'); assert.equal(row.editorial_phase, 'verified'); assert.equal(row.final_saved, true); assert.equal(row.delivery_state, 'text_saved');}
assert.equal(sql.prepare('SELECT response FROM claude_attempts WHERE id=?').get(ca.owner + ':' + day).response, providerBeforeRead);
console.log('PASS verified-only server-held finalizer, rejects supplied body, same article identity, exact immutable provider receipt, honest agent provenance, concurrent event-free text completion and replay');

// A zero-issue independent review still requires rewrite and verification receipts, but may retain original text.
const clean = await initial('zero-issues'), cleanFlow = await r.createDailyTextRevision(clean.owner, clean.create);
await stage(clean.owner, cleanFlow, 'review', {status: 'completed', issues: []});
await stage(clean.owner, cleanFlow, 'rewrite', {status: 'completed', article, changes: []});
const cleanVerified = await stage(clean.owner, cleanFlow, 'verify', {status: 'completed', passed: true, checks: [], remaining_problems: []});
assert.equal(cleanVerified.saved.rewritten_version.body_sha256, cleanFlow.initial_version.body_sha256);
connected = false; const offlineEvents = dispatches; const pending = await f.finalizeVerifiedDailyRevision(clean.owner, finalizeArgs(cleanVerified.saved)); assert.equal(pending.saved, true); assert.equal(pending.pipeline.state,'text_saved'); assert.equal(dispatches, offlineEvents);
connected = true; await f.finalizeVerifiedDailyRevision(clean.owner, finalizeArgs(cleanVerified.saved)); assert.equal(dispatches, offlineEvents);

// Failed verification cannot release an article or emit an event.
const failed = await initial('failed-verification'), failedFlow = await r.createDailyTextRevision(failed.owner, failed.create);
await stage(failed.owner, failedFlow, 'review', review); await stage(failed.owner, failedFlow, 'rewrite', rewrite);
const rejected = await stage(failed.owner, failedFlow, 'verify', {...verify, passed: false, checks: [{...verify.checks[0], resolved: false}], remaining_problems: ['问题仍在']});
assert.equal(rejected.saved.current_phase, 'verification_failed'); const failedBefore = snapshot(), failedPuts = puts, failedEvents = dispatches;
await assert.rejects(f.finalizeVerifiedDailyRevision(failed.owner, finalizeArgs(rejected.saved))); await assert.rejects(w.writingCall(failed.owner, 'submit_writing_article', {day}));
assert.equal(snapshot(), failedBefore); assert.equal(puts, failedPuts); assert.equal(dispatches, failedEvents);

// The contract is opt-in via frozen input: old snapshots without a marker retain their inputs and save terminal text without dispatch.
const legacyEvents = dispatches, legacyObjects = puts; const legacy = await initial('old-frozen-input', 'xiaoyu', true);
assert.equal(legacy.saved.saved, true); assert.equal(dispatches, legacyEvents); assert.equal(puts, legacyObjects + 1);
assert.equal(sql.prepare('SELECT state FROM articles WHERE id=?').get(legacy.claim.article_id).state, 'text_saved');
await assert.rejects(r.createDailyTextRevision(legacy.owner, legacy.create));
assert.equal(provider, 0); assert.equal(count('article_deliveries'), 0);
console.log('PASS zero-issue original retention, offline finalization recovery, failed verification block, legacy no-marker compatibility, provider/network calls=0');

// Exercise the real daily transport through mocked fetch, never a provider connection.
const currentKey = 'opaque.synthetic.changed.secret';
const unicode = text => [...text].map(char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')).join('');
const genericKey = 'sk-' + 'Z'.repeat(32);
async function transportFixture(name) {
 const owner = 'transport-' + name;
 await changeSettings(owner, 'claude-offline-test', '1');
 const lease = await w.writingCall(owner, 'claim_writing_run', {day, writer: 'claude'});
 const input = {day, article_id: lease.article_id, token: lease.token, expected_model: 'claude-offline-test', ...topic};
 return {owner, lease, input};
}
const makeResponse = extra => ({model: 'claude-offline-test', stop_reason: 'end_turn', usage: {input_tokens: 7, output_tokens: 14}, content: [{type: 'text', text: JSON.stringify(article)}], ...extra});
const responseCases = [
 ['rotated-unicode-old-key', fixture => JSON.stringify(makeResponse({metadata: {note: unicode(currentKey)}}))],
 ['rotated-unicode-old-token', fixture => JSON.stringify(makeResponse({metadata: {note: unicode(fixture.lease.token)}}))],
 ['rotated-failed-old-key', fixture => JSON.stringify(makeResponse({stop_reason: 'max_tokens', metadata: {note: unicode(currentKey)}}))],
 ['rotated-truncated-old-key', fixture => '{"content":[{"type":"text","text":"' + unicode(currentKey) + '"}],"metadata":'],
 ['unicode-current-key', fixture => JSON.stringify(makeResponse({metadata: {note: unicode(currentKey)}}))],
 ['unicode-claim-token', fixture => JSON.stringify(makeResponse({metadata: {note: unicode(fixture.lease.token.toUpperCase())}}))],
 ['generic-model', fixture => JSON.stringify(makeResponse({model: genericKey}))],
 ['nested-metadata', fixture => JSON.stringify(makeResponse({metadata: JSON.stringify({authorization: 'Bearer ' + 'Q'.repeat(32)})}))],
 ['failed-max-tokens', fixture => JSON.stringify(makeResponse({stop_reason: 'max_tokens', metadata: {password: 'R'.repeat(32)}}))],
 ['failed-invalid-json', fixture => '{"content":[{"type":"text","text":"' + unicode(currentKey) + '"}],"metadata":'],
 ['truncated-stream', fixture => '{"content":[{"type":"text","text":"' + unicode(fixture.lease.token) + '"}],"metadata":'],
];
const transportEvents = dispatches, transportPuts = puts, transportArticles = count('articles'), transportDrafts = count('daily_editorial_drafts');
for (const [name, payload] of responseCases) {
 const fixture = await transportFixture(name), raw = payload(fixture), prepared = await cl.prepareClaudeDailyRun(fixture.owner, fixture.input);
 mockFetch = async (url, options) => {
  assert.equal(url, 'https://app.yylx.io/v1/messages'); assert.equal(options.redirect, 'manual');
  assert.equal(options.headers.authorization, 'Bearer ' + currentKey);
  const request = JSON.parse(options.body); assert.equal(request.model, 'claude-offline-test'); assert.equal(request.max_tokens, 14000);
  if (name.startsWith('rotated-')) {
   await changeSettings(fixture.owner, 'claude-offline-test', '1', 'opaque.replacement.key.after.request');
   if (name === 'rotated-unicode-old-token') sql.prepare('UPDATE writing_runs SET token=? WHERE article_id=?').run(crypto.randomUUID(), fixture.lease.article_id);
  }
  if (name === 'truncated-stream' || name === 'rotated-truncated-old-key') {
   let sent = false;
   return new Response(new ReadableStream({pull(controller) {if (!sent) {sent = true; controller.enqueue(new TextEncoder().encode(raw));} else controller.error(Error('synthetic stream interruption'));}}, {highWaterMark: 0}), {headers: {'content-type': 'application/json'}});
  }
  return new Response(raw, {headers: {'content-type': 'application/json'}});
 };
 const beforeCalls = mockedProviderCalls, direct = await cl.executeClaudeDailyRun(prepared);
 assert.equal(mockedProviderCalls, beforeCalls + 1); assert.equal(direct.state, 'failed', name + ': unsafe response must fail closed');
 const stored = sql.prepare('SELECT state,response FROM claude_attempts WHERE id=?').get(fixture.owner + ':' + day);
 assert.equal(stored.state, 'failed'); const payloadRow = JSON.parse(stored.response);
 for (const key of ['text', 'partial_text', 'raw_partial_response']) assert.ok(payloadRow[key] === null || payloadRow[key] === undefined, name + ': no response payload may be persisted');
 const readback = await cl.readClaudeDailyResult(fixture.owner, day);
 const publicAndStored = JSON.stringify({direct, readback, stored: payloadRow});
 for (const unsafe of [currentKey, unicode(currentKey), fixture.lease.token, fixture.lease.token.toUpperCase(), unicode(fixture.lease.token), unicode(fixture.lease.token.toUpperCase()), genericKey, 'Q'.repeat(32), 'R'.repeat(32), article.paragraphs[0]]) assert.equal(publicAndStored.includes(unsafe), false, name + ': direct/storage/readback payload leak');
 if (name === 'rotated-unicode-old-token') sql.prepare('UPDATE writing_runs SET token=? WHERE article_id=?').run(fixture.lease.token, fixture.lease.article_id);
 // Failed reservations remain consumed, and read/repeat never reconnects.
 const replay = await cl.executeClaudeDailyRun(prepared); assert.equal(replay.cached, true); assert.equal(mockedProviderCalls, beforeCalls + 1);
}
mockFetch = null;
assert.equal(provider, 0); assert.equal(dispatches, transportEvents); assert.equal(puts, transportPuts); assert.equal(count('articles'), transportArticles); assert.equal(count('daily_editorial_drafts'), transportDrafts);
console.log('PASS real daily transport with mocked fetch: Unicode key/token including in-flight key/lease rotation, generic/nested metadata, failed/truncated responses fail closed with zero payload persistence, no direct/readback leaks and no retries');

// Request-side opaque/escaped credential material must stop before network or input persistence.
for (const name of ['unicode-key-input', 'unicode-token-input', 'generic-input', 'nested-input']) {
 const fixture = await transportFixture(name);
 const unsafe = name === 'unicode-key-input' ? unicode(currentKey) : name === 'unicode-token-input' ? unicode(fixture.lease.token) : name === 'generic-input' ? genericKey : JSON.stringify({authorization: 'Bearer ' + 'Q'.repeat(32)});
 const beforeInput = sql.prepare('SELECT input_snapshot FROM writing_runs WHERE article_id=?').get(fixture.lease.article_id).input_snapshot;
 const beforeCalls = mockedProviderCalls;
 await assert.rejects(cl.prepareClaudeDailyRun(fixture.owner, {...fixture.input, materials: topic.materials + unsafe}));
 assert.equal(sql.prepare('SELECT input_snapshot FROM writing_runs WHERE article_id=?').get(fixture.lease.article_id).input_snapshot, beforeInput);
 assert.equal(sql.prepare('SELECT response FROM claude_attempts WHERE id=?').get(fixture.owner + ':' + day), undefined);
 assert.equal(mockedProviderCalls, beforeCalls); assert.equal(provider, 0);
}
console.log('PASS request-side credential guard before frozen input persistence and before mocked or real network calls');

// Safe mock provider output still reaches only an initial draft, never delivery.
const safeTransport = await transportFixture('safe-complete');
mockFetch = async () => new Response(JSON.stringify(makeResponse()), {headers: {'content-type': 'application/json'}});
const safePrepared = await cl.prepareClaudeDailyRun(safeTransport.owner, safeTransport.input);
const safeResult = await cl.executeClaudeDailyRun(safePrepared);
mockFetch = null;
assert.equal(safeResult.state, 'completed'); assert.equal(safeResult.initial_saved, true); assert.equal(safeResult.saved, false);
const safeRead = await cl.readClaudeDailyResult(safeTransport.owner, day);
assert.equal(safeRead.editorial_phase, 'review_pending'); assert.equal(safeRead.text, JSON.stringify(article));
assert.equal(count('articles'), transportArticles); assert.equal(dispatches, transportEvents); assert.equal(puts, transportPuts); assert.equal(provider, 0);
console.log('PASS safe mocked provider generation preserves exact initial response and stops at independent review');
