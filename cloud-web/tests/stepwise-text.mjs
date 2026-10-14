import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {testOutline, invalidOutlines} from './fixtures/writing-outline.mjs';

// Every provider, event and storage boundary below is a local mock. No network.
const nativeRequire = createRequire(import.meta.url), sql = new DatabaseSync(':memory:');
for (const f of fs.readdirSync('drizzle').filter(n => n.endsWith('.sql')).sort()) sql.exec(fs.readFileSync('drizzle/' + f, 'utf8'));
let calls = 0, dispatches = 0, platform = 0, objects = 0, mutations = 0, failCommitOwner = '', reserveModelChangeOwner = '';
const db = {batch: async stmts => {sql.exec('BEGIN'); try {const results = []; for (const s of stmts) results.push(await s.run()); sql.exec('COMMIT'); return results;} catch (e) {sql.exec('ROLLBACK'); throw e;}}, prepare: statement => ({bind: (...values) => ({first: async () => sql.prepare(statement).get(...values) || null, all: async () => ({results: sql.prepare(statement).all(...values)}), run: async () => {
 if (/UPDATE claude_attempts SET state=\?,response=\?/.test(statement) && values[3] === failCommitOwner) throw Error('DB_PRIVATE_SENTINEL');
 if (/JOIN claude_settings c/.test(statement) && values[4] === reserveModelChangeOwner) sql.prepare('UPDATE claude_settings SET model=? WHERE owner=?').run('changed-model', reserveModelChangeOwner);
 mutations++; return {meta: {changes: Number(sql.prepare(statement).run(...values).changes)}};
}})})};
const bucket = {put: async () => {objects++; throw Error('Unexpected object write');}, get: async () => {throw Error('Unexpected object read');}};
let mode = 'success', latency = 0, lastRequest, lastTimeout, echoToken = '';
const mockKey = 'opaque.Q9vN2mX7pR4tL6cZ';
const unicode = value => [...value].map(char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')).join('');
const paragraphs = Array.from({length: 25}, (_, i) => String(i).padStart(2, '0') + '证'.repeat(98));
let modelText = JSON.stringify({title: 'Claude独立离线原稿', paragraphs});
let rawResponse = '';
const mockFetch = async (url, options) => {
 assert.equal(url, 'https://app.yylx.io/v1/messages'); calls++;
 assert.equal(options.redirect, 'manual'); assert.equal(options.headers.authorization, 'Bearer ' + mockKey);
 assert.equal(options.headers['anthropic-version'], '2023-06-01');
 lastRequest = JSON.parse(options.body); assert.equal(lastRequest.model, 'claude-opus-5-5'); assert.equal(lastRequest.max_tokens, 14000); assert.equal(lastRequest.stream, false);
 if (latency) await new Promise(resolve => setTimeout(resolve, latency));
 if (mode === 'timeout') {const e = Error('PRIVATE_TIMEOUT_SENTINEL'); e.name = 'TimeoutError'; throw e;}
 if (mode === 'throw') throw Error('PRIVATE_PROVIDER_SENTINEL');
 if (mode === 'partial' || mode === 'escaped_partial') {
  rawResponse = '{"model":"claude-opus-5-5","stop_reason":"max_tokens","usage":{"input_tokens":17,"output_tokens":14000,"output_tokens_details":{"thinking_tokens":9}},"content":[{"type":"text","text":"第一段"},{"type":"text","text":"第二段未完';
  if (mode === 'escaped_partial') rawResponse = rawResponse + unicode(mockKey) + unicode(echoToken) + '\\u00';
  const bytes = new TextEncoder().encode(rawResponse), chunks = [bytes.slice(0, 45), bytes.slice(45)];
  return new Response(new ReadableStream({pull(c) {if (chunks.length) c.enqueue(chunks.shift()); else c.error(Error('PRIVATE_CUT_SENTINEL'));}}, {highWaterMark: 0}), {status: 200});
 }
 let text = mode === 'echo' ? JSON.stringify({title: '响应回显', paragraphs: [echoToken, mockKey]}) : mode === 'invalid_article' ? '{"title":"短稿","paragraphs":["不足字数"]}' : modelText;
 if (mode.startsWith('escaped_')) text = JSON.stringify({title: '原稿凭证边界测试', paragraphs: [paragraphs[0] + mockKey + echoToken, ...paragraphs.slice(1)]});
 if (mode === 'escaped_nested') text = text.split(mockKey).join(unicode(mockKey)).split(echoToken).join(unicode(echoToken));
 if (mode === 'escaped_mixed') text = text.split(mockKey).join(unicode(unicode(unicode(mockKey))));
 if (mode === 'generic_credential') text = JSON.stringify({title: '通用凭证失败关闭测试', paragraphs: [paragraphs[0] + 'sk-' + 'z'.repeat(32), ...paragraphs.slice(1)]});
 rawResponse = mode === 'invalid_json' ? 'PRIVATE_INVALID_SENTINEL:{' : JSON.stringify({model: 'gateway-returned-model', stop_reason: mode === 'truncated' || mode === 'escaped_truncated' ? 'max_tokens' : mode === 'stop_unknown' ? 'pause_turn' : 'end_turn', usage: {input_tokens: 100, output_tokens: 200, cache_read_input_tokens: 17, output_tokens_details: {thinking_tokens: 9}}, content: [{type: 'text', text}]});
 if (mode.startsWith('generic_') && mode !== 'generic_credential') {
  const data = JSON.parse(rawResponse), leaked = 'sk-' + 'z'.repeat(32);
  if (mode === 'generic_short') data.content[0].text = JSON.stringify({title: '短稿', paragraphs: [leaked]});
  if (mode === 'generic_unicode') data.content[0].text = unicode(unicode(leaked));
  if (mode === 'generic_usage') data.usage.nested = {authorization: 'Bearer ' + 'A'.repeat(32)};
  if (mode === 'generic_meta') data[leaked] = 'metadata';
  if (mode === 'generic_http' || mode === 'generic_truncated') data.error = {api_key: 'A'.repeat(32)};
  if (mode === 'generic_truncated') data.stop_reason = 'max_tokens';
  rawResponse = mode === 'generic_invalid' ? '{"api_key":"' + 'A'.repeat(32) + '"} trailing' : JSON.stringify(data);
 }
 if (mode === 'escaped_usage' || mode === 'escaped_meta') {
  const data = JSON.parse(rawResponse); data.content[0].text = modelText;
  data.usage.nested = [{[mockKey]: [echoToken, {credential: mockKey}]}];
  if (mode === 'escaped_meta') {data.model = mockKey; data.stop_reason = echoToken;}
  rawResponse = JSON.stringify(data);
 }
 if (mode.startsWith('escaped_') && mode !== 'escaped_nested') for (const credential of [mockKey, echoToken]) rawResponse = rawResponse.split(credential).join(unicode(credential));
 if (mode === 'escaped_invalid') rawResponse = '{"content":[{"type":"text","text":"' + unicode(mockKey) + unicode(echoToken) + '\\u00';
 if (mode === 'safe_unicode') rawResponse = rawResponse.split('证').join(unicode('证'));
 return new Response(rawResponse, {status: mode === 'http' ? 500 : mode === 'escaped_http' ? 401 : 200, headers: {'content-type': 'application/json'}});
};
const globals = {crypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Set, Error, URL, btoa, atob, Date, File, ReadableStream, Request, Response, AbortSignal: {timeout(ms) {lastTimeout = ms; return AbortSignal.timeout(ms);}}, setInterval, clearInterval};
const modules = {};
function load(name) {
 if (modules[name]) return modules[name]; const ex = {}; modules[name] = ex;
 const js = ts.transpileModule(fs.readFileSync('lib/' + name + '.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js, {...globals, exports: ex, require: n => n === 'cloudflare:workers' ? {env: {DB: db, BUCKET: bucket, CLAUDE_CONFIG_KEY: btoa('01234567890123456789012345678901')}} : n === './events' ? {readiness: async () => ({connected: true}), dispatch: async () => {dispatches++; throw Error('Unexpected dispatch');}, subscribe: async () => {platform++; throw Error('Unexpected platform');}} : n.startsWith('./') ? load(n.slice(2)) : nativeRequire(n), fetch: mockFetch});
 return ex;
}
function route(file) {
 const ex = {}; const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js, {...globals, exports: ex, require: n => n.includes('/lib/') ? load(n.split('/').at(-1)) : nativeRequire(n), console: {info() {}}}); return ex;
}
const s = load('stepwise-text'), err = load('stepwise-text-errors'), old = load('writing'), oldManual = load('manual-batch');
const time = new Date().toISOString();
async function config(owner) {
 // Direct mock fixture encryption: never /models, configure, credentials or network tools.
 const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('01234567890123456789012345678901'), {name: 'AES-GCM'}, false, ['encrypt']);
 const iv = crypto.getRandomValues(new Uint8Array(12)), data = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(owner)}, key, new TextEncoder().encode(mockKey));
 const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
 sql.prepare('INSERT INTO claude_settings(owner,model,secret,enabled,updated) VALUES(?,?,?,?,?)').run(owner, 'claude-opus-5-5', JSON.stringify({iv: encode(iv), data: encode(data)}), '1', time);
}
const sources = [{title: '合成来源一', url: 'https://example.com/one', published: '2026-10-05'}, {title: '合成来源二', url: 'https://example.com/two', published: '2026-10-05'}];
const topic = {topic: '小鱼合成独立选题', materials: '已离线合成并核验的结构性资料，仅用于测试，不是真实新闻报道。'.repeat(8), outline: testOutline, sources};
const create = {confirm: true, expected_model: 'claude-opus-5-5', expected_prompt_version: load('writing-supplement').effectiveWritingStyleVersion, xiaoyu: topic, claude: {...topic, topic: 'Claude另一合成选题'}};
async function newBatch(owner) {await config(owner); return s.createStepwiseTextTest(owner, create);}
async function newClaude(owner) {const batch = await newBatch(owner), claim = await s.claimStepwiseTextWriter(owner, {run_id: batch.run_id, writer: 'claude', confirm: true}); return {batch, claim, input: {run_id: batch.run_id, item_id: claim.item_id, token: claim.token, expected_model: create.expected_model, confirm: true}};}
const expire = owner => sql.prepare("UPDATE writing_runs SET expires='2000-01-01T00:00:00.000Z' WHERE owner=? AND run_kind LIKE 'stepwise_text:%'").run(owner);
const rows = () => JSON.stringify({runs: sql.prepare('SELECT * FROM writing_runs ORDER BY id').all(), attempts: sql.prepare('SELECT * FROM claude_attempts ORDER BY id').all(), batches: sql.prepare('SELECT * FROM manual_writing_batches ORDER BY id').all()});
async function genericCredentialRegression() {
 const generic = await newClaude('generic-credential'); mode = 'generic_credential'; const genericCalls = calls;
 const genericResult = await s.executeStepwiseClaude(await s.prepareStepwiseClaude('generic-credential', generic.input));
 assert.equal(genericResult.state, 'failed'); assert.equal(calls, genericCalls + 1);
 const genericView = await s.readStepwiseTextTest('generic-credential'), genericOutput = genericView.writers.claude.output;
 assert.equal(genericOutput.diagnostic.code, 'credential_echo'); assert.equal(genericOutput.diagnostic.response_suppressed, true); assert.equal(genericOutput.usage.input_tokens, 100);
 for (const field of ['text', 'raw_response', 'partial_text', 'raw_partial_response', 'provider_usage', 'article']) assert.ok(genericOutput[field] == null);
 const genericStored = sql.prepare('SELECT response FROM claude_attempts WHERE id=?').get(s.stepwiseTextAttemptId('generic-credential', generic.batch.run_id, 'claude')).response;
 assert.equal(genericStored.includes('sk-' + 'z'.repeat(32)), false); assert.equal(JSON.stringify(genericView).includes('sk-' + 'z'.repeat(32)), false);
 const genericBeforeReplay = rows(); assert.equal((await s.executeStepwiseClaude(await s.prepareStepwiseClaude('generic-credential', generic.input))).cached, true); assert.equal(calls, genericCalls + 1); assert.equal(rows(), genericBeforeReplay); mode = 'success';
 assert.equal(sql.prepare('SELECT count(*) n FROM articles').get().n, 0); assert.equal(dispatches, 0); assert.equal(platform, 0); assert.equal(objects, 0);
 console.log('PASS generic credential fail-closed: an unrelated sk- key in otherwise valid prose fails; original text/raw/provider payload never persists or reads back; numeric usage remains; replay cannot charge again; articles/events/platform/objects=0');
}
if (process.argv.includes('--generic-credential-only')) {await genericCredentialRegression(); process.exit(0);}

await config('owner');
// All historical quotas remain byte-identical, including an already-used old manual slot.
const oldBatchId = crypto.randomUUID();
sql.prepare('INSERT INTO manual_writing_batches(id,owner,authorization_key,day,input_hash,snapshot,created) VALUES(?,?,?,?,?,?,?)').run(oldBatchId, 'owner', oldManual.manualAuthorizationKey, '2026-10-05', 'old-hash', '{"old":true}', time);
for (const kind of ['sample', 'daily', 'workflow_test', 'workflow_rewrite_v2', 'manual:' + oldBatchId]) {
 const id = 'old-' + kind; sql.prepare('INSERT INTO writing_runs(id,owner,day,writer,run_kind,state,article_id,created,updated) VALUES(?,?,?,?,?,?,?,?,?)').run(id, 'owner', '2026-10-05', 'claude', kind, 'submitted', id + '-item', time, time);
 sql.prepare('INSERT INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,?,?,?)').run(id, 'owner', '2026-10-05', 'completed', '{"old":"quota-consumed"}', time);
}
const oldState = JSON.stringify({runs: sql.prepare("SELECT * FROM writing_runs WHERE id LIKE 'old-%'").all(), attempts: sql.prepare("SELECT * FROM claude_attempts WHERE id LIKE 'old-%'").all(), batch: sql.prepare('SELECT * FROM manual_writing_batches WHERE id=?').get(oldBatchId), config: sql.prepare('SELECT * FROM claude_settings WHERE owner=?').get('owner')});
assert.equal((await s.readStepwiseTextTest('owner')).state, 'not_created');
for (const invalid of [{confirm: false}, {confirm: undefined}, {day: '2099-01-01'}, {authorization_key: 'new'}, {max_requests: 2}, {retry: true}, {expected_model: 'wrong'}, {expected_prompt_version: 'wrong'}, {gpt: topic}, {xiaoyu: {...topic, token: 'extra'}}, {claude: {...create.claude, sources: [sources[0], sources[0]]}}, {xiaoyu: {...topic, materials: 'api_key=' + 'z'.repeat(40)}}, {xiaoyu: {...topic, sources: [{...sources[0], url: 'https://example.com/a?token=secret'}, sources[1]]}}]) await assert.rejects(s.createStepwiseTextTest('owner', {...create, ...invalid}));
for (const writer of ['xiaoyu', 'claude']) for (const outline of invalidOutlines) await assert.rejects(s.createStepwiseTextTest('owner', {...create, [writer]: {...create[writer], outline}}));
assert.equal(calls, 0); assert.equal(sql.prepare('SELECT count(*) n FROM manual_writing_batches').get().n, 1);
for (const unsafe of [
 {xiaoyu: {...topic, topic: topic.topic + mockKey}},
 {claude: {...create.claude, materials: topic.materials + mockKey}},
 {xiaoyu: {...topic, materials: topic.materials + unicode(mockKey)}},
 {xiaoyu: {...topic, outline: testOutline + '\n补充：' + mockKey}},
 {claude: {...create.claude, sources: [{...sources[0], title: mockKey}, sources[1]]}},
 {claude: {...create.claude, sources: [{...sources[0], url: 'https://example.com/' + mockKey}, sources[1]]}},
]) await assert.rejects(s.createStepwiseTextTest('owner', {...create, ...unsafe}), /含凭证/);
assert.equal(calls, 0); assert.equal(sql.prepare('SELECT count(*) n FROM manual_writing_batches').get().n, 1);
const pair = await Promise.all([s.createStepwiseTextTest('owner', create), s.createStepwiseTextTest('owner', create)]);
assert.equal(pair.filter(r => r.created).length, 1); assert.equal(pair[0].run_id, pair[1].run_id); const batch = pair[0];
assert.equal(batch.authorization_key, '2026-10-05-stepwise-text-pair'); assert.equal(batch.snapshot.max_requests, 1);
assert.equal(batch.snapshot.writers.claude.writing_prompt, load('writing-supplement').effectiveWritingPrompt);
assert.equal(batch.snapshot.writers.claude.system_prompt, load('claude-prompt').providerSystemPrompt(load('writing-supplement').effectiveWritingPrompt) + '\n\n' + s.stepwiseTextInstructions);
assert.equal(batch.snapshot.writers.claude.system_prompt.includes(load('writing-fixed-references').fixedWritingReferences), true);
assert.equal(createHash('sha256').update(JSON.stringify(batch.snapshot)).digest('hex'), batch.input_hash);
for (const changed of [{xiaoyu: {...topic, topic: '改变标题'}}, {claude: {...create.claude, materials: topic.materials + '改变'}}, {claude: {...create.claude, outline: testOutline.replace('电影排片变化', '电影场次变化')}}, {claude: {...create.claude, sources: [{...sources[0], title: '改变来源'}, sources[1]]}}]) await assert.rejects(s.createStepwiseTextTest('owner', {...create, ...changed}));
await assert.rejects(s.readStepwiseTextTest('other', {run_id: batch.run_id})); await assert.rejects(oldManual.getManualBatch('owner', batch.run_id));
for (const invalid of [{confirm: false}, {confirm: undefined}, {writer: 'gpt'}, {day: '2026-10-05'}, {run_kind: 'daily'}]) await assert.rejects(s.claimStepwiseTextWriter('owner', {run_id: batch.run_id, writer: 'claude', confirm: true, ...invalid}));
const claims = await Promise.all([s.claimStepwiseTextWriter('owner', {run_id: batch.run_id, writer: 'claude', confirm: true}), s.claimStepwiseTextWriter('owner', {run_id: batch.run_id, writer: 'claude', confirm: true})]);
assert.equal(claims.filter(r => r.claimed).length, 1); assert.equal(claims.find(r => !r.claimed).token, undefined); const cc = claims.find(r => r.claimed), xc = await s.claimStepwiseTextWriter('owner', {run_id: batch.run_id, writer: 'xiaoyu', confirm: true});
assert.notEqual(cc.item_id, xc.item_id); assert.equal(JSON.stringify(cc.prompts), JSON.stringify(batch.snapshot.writers.claude));
assert.equal(calls, 0); assert.equal(sql.prepare('SELECT count(*) n FROM articles').get().n, 0);
await assert.rejects(old.writingCall('owner', 'claim_writing_run', {day: batch.day, writer: 'claude', run_kind: s.stepwiseTextKind(batch.run_id)}));
await assert.rejects(old.writingCall('owner', 'prepare_writing_input', {article_id: cc.item_id, token: cc.token, ...topic}));
console.log('PASS create/read/claim: zero provider requests; canonical outline gates for both writers; immutable prompts/model/hash; owner/key isolation; exactly one token issuance per writer; old APIs cannot use new rows');

const xs = {run_id: batch.run_id, item_id: xc.item_id, token: xc.token, title: '小鱼父线程原稿', paragraphs, confirm: true};
for (const invalid of [{confirm: false}, {writer: 'claude'}, {token: cc.token}, {item_id: cc.item_id}, {paragraphs: ['短稿']}, {paragraphs: Array(31).fill('字'.repeat(100))}, {paragraphs: ['', ...paragraphs]}, {paragraphs: [cc.token, ...paragraphs.slice(1)]}]) await assert.rejects(s.saveStepwiseXiaoyuText('owner', {...xs, ...invalid}));
await assert.rejects(s.saveStepwiseXiaoyuText('other', xs));
for (const credential of [mockKey, unicode(mockKey)]) await assert.rejects(s.saveStepwiseXiaoyuText('owner', {...xs, paragraphs: [paragraphs[0] + credential, ...paragraphs.slice(1)]}), /含凭证/);
assert.equal(sql.prepare('SELECT count(*) n FROM claude_attempts WHERE id LIKE ?').get('stepwise_text:%').n, 0); assert.equal(calls, 0);
const saves = await Promise.all([s.saveStepwiseXiaoyuText('owner', xs), s.saveStepwiseXiaoyuText('owner', xs)]); assert.equal(saves.filter(r => !r.read_only).length, 1);
const beforeReplay = rows(), beforeMutations = mutations; assert.equal((await s.saveStepwiseXiaoyuText('owner', xs)).read_only, true); assert.equal(rows(), beforeReplay); assert.equal(mutations, beforeMutations);
await assert.rejects(s.saveStepwiseXiaoyuText('owner', {...xs, title: '替换冻结稿'})); assert.equal(calls, 0);
const input = {run_id: batch.run_id, item_id: cc.item_id, token: cc.token, expected_model: create.expected_model, confirm: true};
for (const invalid of [{confirm: false}, {confirm: undefined}, {item_id: xc.item_id}, {token: xc.token}, {token: crypto.randomUUID()}, {expected_model: 'wrong'}, {topic: '改变'}, {max_output_tokens: 9000}, {timeout_ms: 1}, {retry: true}, {day: batch.day}]) await assert.rejects(s.prepareStepwiseClaude('owner', {...input, ...invalid}));
await assert.rejects(s.prepareStepwiseClaude('other', input));
sql.prepare('UPDATE claude_settings SET model=? WHERE owner=?').run('changed-model', 'owner'); await assert.rejects(s.prepareStepwiseClaude('owner', input)); sql.prepare('UPDATE claude_settings SET model=? WHERE owner=?').run(create.expected_model, 'owner');
assert.equal(calls, 0);

const runRoute = route('app/api/claude/stepwise-text-run/route.ts'), readRoute = route('app/api/writing/stepwise-text/route.ts');
const req = (owner, body, origin = 'https://example.com', header = '1') => new Request('https://example.com/api/claude/stepwise-text-run', {method: 'POST', headers: {origin, 'x-xiaoyu-stepwise-text-run': header, 'oai-authenticated-user-id': owner || ''}, body: typeof body === 'string' ? body : JSON.stringify(body)});
const get = owner => new Request('https://example.com/api/writing/stepwise-text', {headers: {'oai-authenticated-user-id': owner || ''}});
assert.equal((await runRoute.POST(req('', input))).status, 401); assert.equal((await runRoute.POST(req('owner', input, 'https://evil.example'))).status, 403); assert.equal((await runRoute.POST(req('owner', input, 'https://example.com', ''))).status, 403);
const bad = await runRoute.POST(req('owner', 'TOKEN_PARSE_SENTINEL')); assert.equal(bad.status, 400); assert.equal((await bad.text()).includes('TOKEN_PARSE_SENTINEL'), false);
assert.equal((await runRoute.POST(req('owner', 'x'.repeat(8001)))).status, 413); assert.equal((await readRoute.GET(get(''))).status, 401); assert.equal(calls, 0);
latency = 50; const responses = await Promise.all([runRoute.POST(req('owner', input)), runRoute.POST(req('owner', input))]); const events = await Promise.all(responses.map(async r => (await r.text()).trim().split('\n').map(JSON.parse))); latency = 0;
assert.equal(calls, 1); assert.equal(lastTimeout, 300000); assert.equal(events.flat().filter(e => e.terminal && !e.cached && e.success).length, 1);
assert.equal(lastRequest.system, batch.snapshot.writers.claude.system_prompt); assert.equal(lastRequest.messages[0].content, batch.snapshot.writers.claude.user_prompt); assert.equal(lastRequest.messages[0].content.includes(testOutline), true); assert.equal(lastRequest.messages[0].content.includes(JSON.stringify(sources)), true);
const view = await s.readStepwiseTextTest('owner');
assert.equal(view.writers.claude.output.raw_response, rawResponse); assert.equal(view.writers.claude.output.text, modelText); assert.equal(view.writers.claude.output.returned_model, 'gateway-returned-model'); assert.equal(view.writers.claude.output.usage.thinking_tokens, 9); assert.equal(view.writers.claude.output.provider_usage.cache_read_input_tokens, 17);
assert.equal(view.writers.xiaoyu.output.source, 'agent_text'); assert.equal(view.writers.claude.output.source, 'provider_text'); assert.equal(view.writers.xiaoyu.output.usage, null);
assert.deepEqual(JSON.parse(JSON.stringify(view.writers.xiaoyu.output.article)), {title: xs.title, paragraphs}); assert.deepEqual(JSON.parse(JSON.stringify(view.writers.claude.output.article)), {title: 'Claude独立离线原稿', paragraphs});
assert.equal(JSON.stringify(view).includes(cc.token), false); assert.equal(JSON.stringify(view).includes(xc.token), false); assert.equal(JSON.stringify(view).includes(mockKey), false); assert.equal(JSON.stringify(events).includes(cc.token), false);
const beforeReads = rows(), readsMutations = mutations; await s.readStepwiseTextTest('owner'); await readRoute.GET(get('owner')); await (await runRoute.POST(req('owner', input))).text(); await s.saveStepwiseXiaoyuText('owner', xs); assert.equal(rows(), beforeReads); assert.equal(mutations, readsMutations); assert.equal(calls, 1);
sql.prepare('UPDATE claude_settings SET model=? WHERE owner=?').run('changed-after-completion', 'owner'); await assert.rejects(s.prepareStepwiseClaude('owner', input)); await s.readStepwiseTextTest('owner'); assert.equal(calls, 1); sql.prepare('UPDATE claude_settings SET model=? WHERE owner=?').run(create.expected_model, 'owner');
expire('owner'); assert.equal((await s.claimStepwiseTextWriter('owner', {run_id: batch.run_id, writer: 'claude', confirm: true})).claimed, false); assert.equal((await s.saveStepwiseXiaoyuText('owner', xs)).read_only, true); await assert.rejects(s.prepareStepwiseClaude('owner', input)); await s.readStepwiseTextTest('owner'); assert.equal(calls, 1);
console.log('PASS concurrent generation: one paid mock request, 14000/300000 limits, full frozen three references + canonical outline + sources; exact raw/text/usage + parsed body; independent agent/provider provenance; token-free owner-only read; replay is read-only');

const expired = await newClaude('expired'); expire('expired'); await assert.rejects(s.prepareStepwiseClaude('expired', expired.input));
const expiredX = await s.claimStepwiseTextWriter('expired', {run_id: expired.batch.run_id, writer: 'xiaoyu', confirm: true}); expire('expired'); await assert.rejects(s.saveStepwiseXiaoyuText('expired', {...xs, run_id: expired.batch.run_id, item_id: expiredX.item_id, token: expiredX.token})); assert.equal(calls, 1);
const stale = await newClaude('stale'), prepared = await s.prepareStepwiseClaude('stale', stale.input); sql.prepare('UPDATE claude_settings SET enabled=? WHERE owner=?').run('0', 'stale'); await assert.rejects(s.executeStepwiseClaude(prepared)); assert.equal(calls, 1);
const corrupt = await newClaude('corrupt'); sql.prepare('UPDATE manual_writing_batches SET snapshot=? WHERE id=?').run(JSON.stringify({...corrupt.batch.snapshot, model: 'changed'}), corrupt.batch.run_id); await assert.rejects(s.prepareStepwiseClaude('corrupt', corrupt.input)); assert.equal(calls, 1);
const reservationRace = await newClaude('model-race'); reserveModelChangeOwner = 'model-race'; await assert.rejects(s.executeStepwiseClaude(await s.prepareStepwiseClaude('model-race', reservationRace.input))); reserveModelChangeOwner = ''; assert.equal(calls, 1);

for (const failureMode of ['generic_short', 'generic_unicode', 'generic_usage', 'generic_meta', 'generic_http', 'generic_truncated', 'generic_invalid', 'http', 'timeout', 'throw', 'partial', 'truncated', 'stop_unknown', 'invalid_json', 'invalid_article', 'echo', 'escaped_content', 'escaped_usage', 'escaped_meta', 'escaped_nested', 'escaped_mixed', 'escaped_http', 'escaped_truncated', 'escaped_invalid', 'escaped_partial']) {
 const owner = 'failed-' + failureMode, fixture = await newClaude(owner); mode = failureMode; echoToken = fixture.claim.token;
 const before = calls, result = await s.executeStepwiseClaude(await s.prepareStepwiseClaude(owner, fixture.input)); assert.equal(calls, before + 1); assert.equal(result.state, 'failed');
 const failureView = await s.readStepwiseTextTest(owner), output = failureView.writers.claude.output;
 if (failureMode === 'partial') {assert.equal(output.raw_partial_response, rawResponse); assert.equal(output.partial_text, '第一段\n第二段未完'); assert.equal(output.usage.thinking_tokens, 9); assert.equal(output.diagnostic.code, 'body_interrupted');}
 if (failureMode === 'http' || failureMode === 'truncated') assert.equal(output.raw_partial_response, rawResponse);
 if (failureMode === 'timeout') assert.equal(output.diagnostic.code, 'timeout');
 if (failureMode === 'invalid_article') {assert.equal(output.raw_response, rawResponse); assert.equal(output.diagnostic.code, 'invalid_article');}
 assert.equal(JSON.stringify(failureView).includes(fixture.claim.token), false); assert.equal(JSON.stringify(failureView).includes(mockKey), false); assert.equal(result.error?.includes('PRIVATE'), false);
 const persisted = sql.prepare('SELECT response FROM claude_attempts WHERE id=?').get(s.stepwiseTextAttemptId(owner, fixture.batch.run_id, 'claude')).response;
 for (const data of [persisted, JSON.stringify(failureView)]) for (const credential of [mockKey, fixture.claim.token]) {assert.equal(data.includes(credential), false); assert.equal(data.includes(unicode(credential)), false);}
 if (failureMode.startsWith('escaped_') && !['escaped_invalid', 'escaped_partial'].includes(failureMode)) {assert.equal(output.diagnostic.code, 'credential_echo'); assert.equal(output.diagnostic.response_suppressed, true); assert.equal(output.raw_response, undefined); assert.equal(output.article, undefined); assert.equal(output.raw_partial_response, null); assert.equal(output.partial_text, null); assert.equal(output.provider_usage, null);}
 if (failureMode === 'escaped_invalid' || failureMode === 'escaped_partial') {assert.equal(output.raw_partial_response, null); assert.equal(output.partial_text, null); assert.equal(output.diagnostic.response_suppressed, true);}
 if (failureMode.startsWith('generic_')) {
  assert.equal(output.diagnostic.response_suppressed, true);
  for (const payload of [persisted, JSON.stringify(failureView)]) {assert.equal(payload.includes('sk-' + 'z'.repeat(32)), false); assert.equal(payload.includes('A'.repeat(32)), false);}
  assert.equal(output.raw_response, undefined); assert.equal(output.raw_partial_response, null); assert.equal(output.partial_text, null); assert.equal(output.article, undefined);
 }
 const beforeFailureReplay = rows(), failureMutations = mutations;
 assert.equal((await s.executeStepwiseClaude(await s.prepareStepwiseClaude(owner, fixture.input))).cached, true); await s.readStepwiseTextTest(owner); assert.equal(calls, before + 1); assert.equal(rows(), beforeFailureReplay); assert.equal(mutations, failureMutations);
 expire(owner); await assert.rejects(s.prepareStepwiseClaude(owner, fixture.input)); await s.readStepwiseTextTest(owner); assert.equal(calls, before + 1);
}
mode = 'success';
const safeUnicode = await newClaude('safe-unicode'); mode = 'safe_unicode'; const safeResult = await s.executeStepwiseClaude(await s.prepareStepwiseClaude('safe-unicode', safeUnicode.input)); assert.equal(safeResult.state, 'completed'); assert.equal((await s.readStepwiseTextTest('safe-unicode')).writers.claude.output.raw_response, rawResponse); mode = 'success';
// Read is an additional server-side safety boundary for an unsafe old record,
// including nested usage keys and JSON text. It never rewrites that record.
const unsafeRead = await newClaude('unsafe-read'), unsafeId = s.stepwiseTextAttemptId('unsafe-read', unsafeRead.batch.run_id, 'claude');
const injectedOutput = {namespace_version: 1, writer: 'claude', source: 'provider_text', run_id: unsafeRead.batch.run_id, item_id: unsafeRead.claim.item_id, input_hash: unsafeRead.batch.input_hash, text: unicode(mockKey), raw_response: JSON.stringify({content: [{text: unicode(unsafeRead.claim.token)}]}), usage: {[mockKey]: unsafeRead.claim.token}};
sql.prepare('INSERT INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,?,?,?)').run(unsafeId, 'unsafe-read', unsafeRead.batch.day, 'completed', JSON.stringify({stepwise_text: injectedOutput}), time);
const unsafeBefore = rows(), unsafeMutations = mutations, safeRead = await s.readStepwiseTextTest('unsafe-read'); assert.equal(safeRead.writers.claude.attempt_state, 'failed'); assert.equal(JSON.stringify(safeRead).includes(mockKey), false); assert.equal(JSON.stringify(safeRead).includes(unsafeRead.claim.token), false); assert.equal(JSON.stringify(safeRead).includes(unicode(mockKey)), false); assert.equal(rows(), unsafeBefore); assert.equal(mutations, unsafeMutations);
console.log('PASS credential boundary: current opaque key blocks frozen input and Xiaoyu text; decoded Unicode and nested keys/usage/content/model/stop_reason are scrubbed before persistence; HTTP401/error/truncated/incomplete-escape results fail safely; safe Unicode raw stays exact; unsafe historical read is sanitized without mutation');
await genericCredentialRegression();
const unknown = await newClaude('unknown'); failCommitOwner = 'unknown'; const beforeUnknown = calls; const unknownResult = await s.executeStepwiseClaude(await s.prepareStepwiseClaude('unknown', unknown.input)); failCommitOwner = '';
assert.equal(unknownResult.state, 'requested'); assert.equal(calls, beforeUnknown + 1); sql.prepare('UPDATE claude_attempts SET created=? WHERE owner=?').run('2000-01-01T00:00:00.000Z', 'unknown');
assert.equal((await s.readStepwiseTextTest('unknown')).writers.claude.outcome, 'outcome_unknown'); assert.equal((await s.executeStepwiseClaude(await s.prepareStepwiseClaude('unknown', unknown.input))).cached, true); assert.equal(calls, beforeUnknown + 1);
const unknownX = await s.claimStepwiseTextWriter('unknown', {run_id: unknown.batch.run_id, writer: 'xiaoyu', confirm: true}); await s.saveStepwiseXiaoyuText('unknown', {...xs, run_id: unknown.batch.run_id, item_id: unknownX.item_id, token: unknownX.token}); assert.equal((await s.readStepwiseTextTest('unknown')).writers.xiaoyu.output.source, 'agent_text');
const disconnect = await newClaude('disconnect'); latency = 60; const disconnected = await runRoute.POST(req('disconnect', disconnect.input)); await disconnected.body.cancel();
for (let i = 0; i < 200 && sql.prepare('SELECT state FROM claude_attempts WHERE owner=?').get('disconnect')?.state !== 'completed'; i++) await new Promise(resolve => setTimeout(resolve, 10)); latency = 0;
assert.equal((await s.readStepwiseTextTest('disconnect')).writers.claude.attempt_state, 'completed'); const beforeDisconnectReplay = calls; await (await runRoute.POST(req('disconnect', disconnect.input))).text(); assert.equal(calls, beforeDisconnectReplay);
console.log('PASS no-charge guards: bad/missing confirmation, altered inputs, cross-owner/writer, old or expired token, live-model race/change, corrupted freeze; failure/timeout/truncation/partial/invalid/unknown/connection loss cannot retry; exact partial recovery remains read-only');

const mcp = route('app/mcp/route.ts');
const rpc = (method, params, owner = 'owner') => new Request('https://example.com/mcp', {method: 'POST', headers: {'oai-authenticated-user-id': owner, origin: 'https://example.com'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
const listed = (await (await mcp.POST(rpc('tools/list'))).json()).result.tools;
assert.equal(listed.filter(t => t.name.includes('stepwise')).length, 4); assert.equal(listed.some(t => /generate.*stepwise|retry.*stepwise|renew.*stepwise/.test(t.name)), false);
for (const t of listed.filter(t => t.name.includes('stepwise') && t.name !== 'read_stepwise_text_test')) assert.equal(t.inputSchema.required.includes('confirm'), true);
const unsafe = await mcp.POST(rpc('tools/call', {name: 'claim_stepwise_text_writer', arguments: {run_id: 'TOKEN_ERROR_SENTINEL', writer: 'claude', confirm: true}})); assert.equal((await unsafe.text()).includes('TOKEN_ERROR_SENTINEL'), false);
assert.equal(err.stepwisePublicError(Error('SQL_TOKEN_PRIVATE_SENTINEL')), err.stepwiseErrors.unknown);
const component = fs.readFileSync('components/stepwise-text-run.tsx', 'utf8'), page = fs.readFileSync('app/writing/stepwise-text-run/page.tsx', 'utf8');
assert.equal(/localStorage|sessionStorage|URLSearchParams|console\./.test(component), false); assert.equal(component.includes('type="password"'), true); assert.equal(component.includes('onSubmit={execute}'), true); assert.equal(component.includes('name="confirm" type="checkbox" required'), true); assert.equal(page.includes("requireChatGPTUser('/writing/stepwise-text-run')"), true);
const jsx = {}; vm.runInNewContext(ts.transpileModule(component, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}}).outputText, {...globals, exports: jsx, require: n => n === './daily-run-stream' ? {} : nativeRequire(n)});
const markup = renderToStaticMarkup(React.createElement(jsx.default)); assert.match(markup, /type="password"/); assert.match(markup, /只刷新本次状态/); assert.match(markup, /执行 Claude 本次唯一请求/);

// Exercise the normal form handler and stream reader with local routes, including
// the required checkbox and a second click. No browser fetch/evaluate workaround.
const ui = await newClaude('ui-form'), slots = [], refs = [], effects = []; let slotIndex = 0, refIndex = 0, collectEffects = true, uiPosts = 0;
const fakeReact = {useState(initial) {const i = slotIndex++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => {slots[i] = typeof v === 'function' ? v(slots[i]) : v;}];}, useRef(initial) {const i = refIndex++; return refs[i] || (refs[i] = {current: initial});}, useCallback(fn) {return fn;}, useEffect(fn) {if (collectEffects) effects.push(fn);}};
const streamModule = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/daily-run-stream.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {...globals, exports: streamModule});
class FakeInput {constructor(value) {this.value = value;}}
class FakeFormData {constructor(form) {this.form = form;} get(key) {return key === 'token' ? this.form.token.value : this.form.data[key];}}
const uiModule = {};
vm.runInNewContext(ts.transpileModule(component, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}}).outputText, {...globals, exports: uiModule, require: n => n === 'react' ? fakeReact : n === './daily-run-stream' ? streamModule : nativeRequire(n), window: {addEventListener() {}, removeEventListener() {}}, FormData: FakeFormData, HTMLInputElement: FakeInput, fetch: async (url, options) => {if (!options?.method) return readRoute.GET(get('ui-form')); assert.equal(url, '/api/claude/stepwise-text-run'); uiPosts++; return runRoute.POST(req('ui-form', options.body));}});
const renderUi = () => {slotIndex = 0; refIndex = 0; return uiModule.default();};
const findForm = node => {if (!node || typeof node !== 'object') return null; if (node.type === 'form') return node; for (const child of [node.props?.children].flat(Infinity)) {const form = findForm(child); if (form) return form;} return null;};
renderUi(); for (const effect of effects) effect(); collectEffects = false; await new Promise(resolve => setTimeout(resolve, 0));
let formNode = findForm(renderUi()); assert.ok(formNode);
const form = {data: {run_id: ui.input.run_id, item_id: ui.input.item_id, expected_model: ui.input.expected_model, confirm: null}, token: new FakeInput(ui.input.token), elements: {namedItem() {return form.token;}}};
const event = {preventDefault() {}, currentTarget: form}, uiCallsBefore = calls;
await formNode.props.onSubmit(event); assert.equal(uiPosts, 0); assert.equal(calls, uiCallsBefore);
form.data.confirm = 'on'; latency = 30; const firstSubmit = formNode.props.onSubmit(event); const repeatedSubmit = formNode.props.onSubmit(event); await Promise.all([firstSubmit, repeatedSubmit]); latency = 0;
assert.equal(uiPosts, 1); assert.equal(calls, uiCallsBefore + 1); assert.equal(form.token.value, '');
formNode = findForm(renderUi()); form.token.value = ui.input.token; await formNode.props.onSubmit(event); assert.equal(uiPosts, 1); assert.equal(calls, uiCallsBefore + 1);
assert.equal(JSON.stringify(slots).includes(ui.input.token), false); assert.equal(slots[0].writers.claude.attempt_state, 'completed');

assert.equal(JSON.stringify({runs: sql.prepare("SELECT * FROM writing_runs WHERE id LIKE 'old-%'").all(), attempts: sql.prepare("SELECT * FROM claude_attempts WHERE id LIKE 'old-%'").all(), batch: sql.prepare('SELECT * FROM manual_writing_batches WHERE id=?').get(oldBatchId), config: sql.prepare('SELECT * FROM claude_settings WHERE owner=?').get('owner')}), oldState);
assert.equal(sql.prepare('SELECT count(*) n FROM articles').get().n, 0); assert.equal(sql.prepare('SELECT count(*) n FROM article_deliveries').get().n, 0); assert.equal(dispatches, 0); assert.equal(platform, 0); assert.equal(objects, 0);
assert.equal(fs.readFileSync('lib/stepwise-text.ts', 'utf8').includes("from './writing'"), false);
console.log('PASS MCP/helper: four separated short tools, private authenticated form + required confirmation, protected NDJSON, no credentials/body in URL/storage/logs; articles=0 events=0 platform=0 objects=0; all prior daily/manual/test/rewrite/sample rows and quotas unchanged');
