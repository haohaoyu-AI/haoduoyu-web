import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

// Actual route and domain modules run with in-memory storage and a network fence.
// Fixture inserts use SQLite directly; all application writes are forbidden.
const nativeRequire = createRequire(import.meta.url);
const sql = new DatabaseSync(':memory:');
for (const file of fs.readdirSync('drizzle').filter(file => file.endsWith('.sql')).sort()) {
 sql.exec(fs.readFileSync('drizzle/' + file, 'utf8'));
}
let providerCalls = 0, applicationWrites = 0, applicationReads = 0, externalEffects = 0;
const logs = [];
const networkFence = async () => {providerCalls++; throw Error('OFFLINE_NETWORK_FENCE');};
const effectFence = async () => {externalEffects++; throw Error('OFFLINE_EFFECT_FENCE');};
const db = {
 batch: async () => {applicationWrites++; throw Error('APPLICATION_WRITE_FORBIDDEN');},
 prepare: statement => ({bind: (...values) => ({
  first: async () => {applicationReads++; assert.match(statement, /^\s*SELECT\b/i); return sql.prepare(statement).get(...values) || null;},
  all: async () => {applicationReads++; assert.match(statement, /^\s*SELECT\b/i); return {results: sql.prepare(statement).all(...values)};},
  run: async () => {applicationWrites++; throw Error('APPLICATION_WRITE_FORBIDDEN');},
 })}),
};
const globals = {
 crypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Set, Error, URL,
 btoa, atob, Date, File, ReadableStream, Request, Response, AbortSignal,
 setTimeout, clearTimeout, setInterval, clearInterval, fetch: networkFence,
 console: {info: value => logs.push(value), error: value => logs.push(value)},
};
const modules = new Map();
function evaluate(file, overrides = {}) {
 const exports = {};
 const source = fs.readFileSync(file, 'utf8');
 const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js, {...globals, ...overrides, exports, require: name => {
  if (name === 'cloudflare:workers') return {env: {DB: db, BUCKET: {put: effectFence, get: effectFence}, CLAUDE_CONFIG_KEY: btoa('01234567890123456789012345678901')}};
  if (name.startsWith('.')) {
   const relative = path.posix.normalize(path.posix.join(path.posix.dirname(file), name));
   if (relative === 'lib/events') return {readiness: effectFence, dispatch: effectFence, subscribe: effectFence, unsubscribe: effectFence};
   return load(relative.endsWith('.ts') ? relative : relative + '.ts');
  }
  return nativeRequire(name);
 }});
 return exports;
}
function load(file) {
 if (modules.has(file)) return modules.get(file);
 // Support the existing claude/writing/manual module cycle.
 const placeholder = {}; modules.set(file, placeholder);
 Object.assign(placeholder, evaluate(file));
 return placeholder;
}
const legacy = load('lib/legacy-generation.ts');
const claude = load('lib/claude.ts');
const mcp = load('app/mcp/route.ts');
const history = load('app/api/claude/history/route.ts');
const retired = [
 'generate_claude_article', 'generate_claude_test_article',
 'retry_claude_test_article_once', 'retry_claude_test_article_14000',
 'generate_claude_rewrite_v2', 'retry_claude_rewrite_v2',
];
assert.deepEqual([...legacy.retiredGenerationNames], retired);
const owner = 'history-owner-a', other = 'history-owner-b', day = '2026-10-05';
const opaque = 'opaque.test.key.Q9vN2mX7pR4tL6cZ';
const leaseToken = '182b824d-3a6e-4b88-a3eb-1fd74841d5c5';
const now = new Date().toISOString(), old = new Date(Date.now() - 600000).toISOString();
const prefixes = {
 daily: '', workflow_test: 'workflow-test:', explicit_test_retry: 'workflow-test-retry:',
 extended_test_retry: 'workflow-test-extended:', v2_rewrite: 'workflow-rewrite-v2:',
 v2_confirmed_retry: 'workflow-rewrite-v2-confirmed-retry:',
};
async function addConfiguration(user) {
 const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('01234567890123456789012345678901'), {name: 'AES-GCM'}, false, ['encrypt']);
 const iv = crypto.getRandomValues(new Uint8Array(12));
 const data = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(user)}, key, new TextEncoder().encode(opaque));
 const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
 sql.prepare('INSERT INTO claude_settings(owner,model,secret,enabled,updated) VALUES(?,?,?,?,?)').run(user, 'claude-offline-test', JSON.stringify({iv: encode(iv), data: encode(data)}), '1', now);
}
await addConfiguration(owner); await addConfiguration(other);
for (const user of [owner, other]) {
 for (const [scope, prefix] of Object.entries(prefixes)) {
  const state = scope === 'v2_rewrite' ? 'requested' : scope === 'explicit_test_retry' ? 'failed' : 'completed';
  const result = {text: '原文-' + user + '-' + scope, partial_text: scope === 'explicit_test_retry' ? '保留的部分响应' : null, saved: scope === 'daily', diagnostic: {stage: state === 'failed' ? 'failed' : 'completed', http_status: 200}, usage: {input_tokens: 7, output_tokens: 12}};
  sql.prepare('INSERT INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,?,?,?)').run(prefix + user + ':' + day, user, day, state, JSON.stringify(result), old);
 }
 sql.prepare('INSERT INTO writing_runs(id,owner,day,writer,run_kind,state,token,expires,article_id,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('fixture-' + user, user, day, 'claude', 'workflow_rewrite_v2', 'writing', leaseToken, old, crypto.randomUUID(), old, old);
}
const snapshot = () => JSON.stringify(['claude_attempts', 'writing_runs', 'claude_settings', 'manual_writing_batches', 'articles', 'article_deliveries'].map(table => sql.prepare('SELECT * FROM ' + table + ' ORDER BY 1').all()));
const noEffects = before => {
 assert.equal(providerCalls, 0); assert.equal(applicationWrites, 0); assert.equal(externalEffects, 0);
 assert.equal(snapshot(), before, 'read/retired operation changed persistent records or quota');
};
function rpc(method, params, user = owner, origin = 'https://site.test') {
 return mcp.POST(new Request('https://site.test/mcp', {method: 'POST', headers: {'content-type': 'application/json', origin, ...(user ? {'oai-authenticated-user-id': user} : {})}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})}));
}
const rpcValue = response => response.json().then(body => JSON.parse(body.result.content[0].text));
const marker = 'UNTRUSTED_ARGUMENT_SHOULD_NOT_ECHO';
const baseline = snapshot(), readsBeforeRetired = applicationReads;
for (const name of retired) {
 for (const args of [{}, {day, confirm: true, confirm_test: true, token: leaseToken, materials: marker + opaque, retry: true}, {day: '2099-12-31', run_kind: 'daily', article_id: marker}]) {
  const response = await rpc('tools/call', {name, arguments: args});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const result = await rpcValue(response);
  assert.equal(result.state, 'retired'); assert.equal(result.read_only, true);
  assert.equal(result.model_request_sent, false); assert.equal(result.automatic_retry, false);
  assert.equal(JSON.stringify(result).includes(marker), false); assert.equal(JSON.stringify(result).includes(opaque), false);
 }
 assert.equal((await rpc('tools/call', {name, arguments: {}}, '')).status, 401);
 assert.equal((await rpc('tools/call', {name, arguments: {}}, owner, 'https://evil.test')).status, 403);
}
assert.equal(applicationReads, readsBeforeRetired, 'retired MCP must stop before storage/model handling');
const tools = (await (await rpc('tools/list')).json()).result.tools;
for (const name of retired) {
 const definition = tools.find(tool => tool.name === name);
 assert.ok(definition); assert.equal(definition.annotations.readOnlyHint, true); assert.equal(definition.annotations.openWorldHint, false);
}
noEffects(baseline);
console.log('PASS actual MCP: all six retired operations stop before storage/provider; auth, origin, compatibility metadata and no argument echo');

for (const [file, header] of [['rewrite-v2', 'x-xiaoyu-rewrite'], ['retry-test', 'x-xiaoyu-retry']]) {
 const route = load('app/api/claude/' + file + '/route.ts');
 const request = (user = owner, origin = 'https://site.test', approvedHeader = '1') => new Request('https://site.test/api/claude/' + file, {method: 'POST', headers: {origin, [header]: approvedHeader, ...(user ? {'oai-authenticated-user-id': user} : {})}, body: marker + opaque});
 const response = await route.POST(request()); assert.equal(response.status, 410);
 const result = await response.json(); assert.equal(result.state, 'retired'); assert.equal(result.model_request_sent, false); assert.equal(JSON.stringify(result).includes(marker), false);
 assert.equal((await route.POST(request(''))).status, 401);
 assert.equal((await route.POST(request(owner, 'https://evil.test'))).status, 403);
 assert.equal((await route.POST(request(owner, 'https://site.test', ''))).status, 403);
}
noEffects(baseline);
console.log('PASS actual retired HTTP routes: authenticated 410, unauthorized/cross-origin/header rejection, zero writes and zero calls');

const historyRequest = (scope, user = owner, selectedDay = day, suffix = '') => new Request('https://site.test/api/claude/history?' + new URLSearchParams({scope, day: selectedDay}) + suffix, {headers: user ? {'oai-authenticated-user-id': user} : {}});
for (const scope of Object.keys(prefixes)) {
 const response = await history.GET(historyRequest(scope)); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
 const result = await response.json(); assert.equal(result.scope, scope); assert.equal(result.read_only, true); assert.equal(result.model_request_sent, false); assert.equal(result.automatic_retry, false);
 assert.equal(result.result.text, '原文-' + owner + '-' + scope); assert.equal(JSON.stringify(result).includes('原文-' + other), false);
 if (scope === 'v2_rewrite') {assert.equal(result.state, 'requested'); assert.equal(result.outcome, 'outcome_unknown'); assert.equal(result.resume_action, 'read_only');}
 if (scope === 'explicit_test_retry') assert.equal(result.result.partial_text, '保留的部分响应');
 const viaMcp = await rpcValue(await rpc('tools/call', {name: 'read_claude_historical_result', arguments: {day, scope}}));
 assert.deepEqual(viaMcp, result);
 const otherRead = await (await history.GET(historyRequest(scope, other))).json(); assert.equal(otherRead.result.text, '原文-' + other + '-' + scope);
}
assert.equal((await history.GET(historyRequest('daily', ''))).status, 401);
assert.equal((await (await history.GET(historyRequest('daily', 'unknown-owner'))).json()).state, 'not_found');
assert.equal((await (await history.GET(historyRequest('daily', owner, '2026-10-04'))).json()).state, 'not_found');
assert.equal((await (await history.GET(historyRequest('daily', owner, day, '&owner=' + other))).json()).result.text, '原文-' + owner + '-daily');
for (const scope of ['__proto__', 'constructor', 'toString', 'manual', 'stepwise_text', 'workflow-rewrite-v2:' + other + ':' + day, '../daily', marker]) {
 const response = await history.GET(historyRequest(scope)); assert.equal(response.status, 400); assert.equal((await response.text()).includes(marker), false);
 await assert.rejects(claude.readClaudeHistoricalResult(owner, {day, scope}));
}
for (const value of [null, [], {day, scope: 'daily', owner: other}, {day, scope: 'daily', id: marker}, {day: 'bad-date', scope: 'daily'}, {day}, {scope: 'daily'}]) await assert.rejects(claude.readClaudeHistoricalResult(owner, value));
noEffects(baseline);
console.log('PASS history: six whitelist mappings, actual GET and MCP agree, exact owner/day isolation, unknown requested remains immutable and read-only');

const historyId = prefixes.workflow_test + owner + ':' + day;
const unicode = value => [...value].map(char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')).join('');
const generic = 'sk-' + 'q'.repeat(32);
for (const unsafe of [opaque, leaseToken.toUpperCase(), generic, unicode(opaque), unicode(unicode(generic)), {usage: {[opaque]: [leaseToken]}}, {raw_response: JSON.stringify({text: unicode(leaseToken)})}, {authorization: 'Bearer ' + 'b'.repeat(32)}]) {
 sql.prepare('UPDATE claude_attempts SET response=? WHERE id=?').run(JSON.stringify({text: 'historical text', payload: unsafe}), historyId);
 const before = snapshot();
 const response = await history.GET(historyRequest('workflow_test')); assert.equal(response.status, 200);
 const result = await response.json(); assert.equal(result.response_suppressed, true); assert.equal(result.result, null);
 const visible = JSON.stringify(result); for (const secret of [opaque, leaseToken, generic, unicode(opaque)]) assert.equal(visible.includes(secret), false);
 noEffects(before);
}
sql.prepare('UPDATE claude_attempts SET response=? WHERE id=?').run('{"PRIVATE_PARSE_SENTINEL":', historyId);
let before = snapshot(); const malformed = await (await history.GET(historyRequest('workflow_test'))).json();
assert.equal(malformed.outcome, 'result_unreadable'); assert.equal(malformed.result, null); assert.equal(JSON.stringify(malformed).includes('PRIVATE_PARSE_SENTINEL'), false); noEffects(before);
console.log('PASS history safety: opaque/generic/token/Unicode/nested response suppression and malformed-record recovery, no record mutation');

// Older read surfaces must not bypass the same owner-wide credential boundary.
const manualBatch = load('lib/manual-batch.ts'), manual = load('lib/manual-claude.ts');
const runId = crypto.randomUUID(), manualId = manualBatch.manualAttemptId(owner, runId);
sql.prepare('INSERT INTO manual_writing_batches(id,owner,authorization_key,day,input_hash,snapshot,created) VALUES(?,?,?,?,?,?,?)').run(runId, owner, manualBatch.manualAuthorizationKey, day, 'fixture-hash', '{}', old);
sql.prepare('INSERT INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,?,?,?)').run(manualId, owner, day, 'completed', '{}', old);
const crossDayToken = 'other-day-writing-lease-P8Q4K7', articleToken = 'article-claim-token-T9M2A4', deliveryToken = 'delivery-claim-token-R2H6K9';
sql.prepare('INSERT INTO writing_runs(id,owner,day,writer,run_kind,state,token,expires,article_id,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('cross-day-run', owner, '2025-01-01', 'xiaoyu', 'daily', 'writing', crossDayToken, old, crypto.randomUUID(), old, old);
const articleId = crypto.randomUUID();
sql.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state,claim_token) VALUES(?,?,?,?,?,?,?,?,?)').run(articleId, owner, 'offline fixture', 'fixture.txt', 'fixture-only', '[]', old, 'processing', articleToken);
sql.prepare('INSERT INTO article_deliveries(id,owner,article_id,platform,state,claim_token,updated) VALUES(?,?,?,?,?,?,?)').run('fixture-delivery', owner, articleId, 'zhihu', 'saving', deliveryToken, old);
const payloadFields = ['text', 'partial_text', 'raw_partial_response', 'snapshot', 'diagnostic', 'usage', 'error', 'requested_model', 'returned_model', 'save_error'];
for (const unsafe of [opaque, generic, unicode(generic), crossDayToken, articleToken, unicode(deliveryToken), {nested: {[leaseToken]: unicode(opaque)}}]) {
 const stored = {saved: true, text: 'safe-looking prose', partial_text: 'safe partial', raw_response: JSON.stringify({usage: unsafe}), snapshot: {diagnostic: unsafe}, usage: {nested: unsafe}, error: 'fixture error'};
 for (const id of [owner + ':' + day, manualId]) sql.prepare('UPDATE claude_attempts SET response=? WHERE id=?').run(JSON.stringify(stored), id);
 const frozenRows = snapshot();
 const daily = await rpcValue(await rpc('tools/call', {name: 'read_claude_daily_result', arguments: {day}}));
 const manualRead = await rpcValue(await rpc('tools/call', {name: 'read_claude_manual_result', arguments: {run_id: runId}}));
 for (const result of [daily, manualRead]) {
  assert.equal(result.response_suppressed, true); assert.equal(result.state, 'completed'); assert.equal(result.saved, true);
  for (const field of payloadFields) assert.equal(result[field], null, 'old reader retained unsafe payload field ' + field);
  assert.equal(result.automatic_retry, false);
 }
 assert.equal(manualRead.raw_response, null);
 const historical = await (await history.GET(historyRequest('daily'))).json(); assert.equal(historical.response_suppressed, true); assert.equal(historical.result, null);
 noEffects(frozenRows);
}
const safeStored = {saved: false, text: '完整安全原稿', partial_text: null, raw_response: '{"safe":true}', usage: {input_tokens: 4, output_tokens: 8}, diagnostic: {stage: 'completed', http_status: 200}};
for (const id of [owner + ':' + day, manualId]) sql.prepare('UPDATE claude_attempts SET response=? WHERE id=?').run(JSON.stringify(safeStored), id);
let frozenRows = snapshot();
assert.equal((await claude.readClaudeDailyResult(owner, day)).text, safeStored.text);
assert.equal((await manual.readClaudeManualResult(owner, runId)).raw_response, safeStored.raw_response);
assert.equal((await claude.readClaudeDailyResult('unknown-owner', day)).state, 'not_found');
await assert.rejects(manual.readClaudeManualResult(other, runId)); noEffects(frozenRows);

const currentDay = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const currentDailyId = owner + ':' + currentDay, connectionId = 'probe:' + owner + ':' + currentDay + ':' + now;
sql.prepare('INSERT OR REPLACE INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,?,?,?)').run(currentDailyId, owner, currentDay, 'completed', JSON.stringify({saved: true, text: 'safe body', error: crossDayToken, diagnostic: {nested: unicode(generic)}}), old);
frozenRows = snapshot();
const summary = await rpcValue(await rpc('tools/call', {name: 'read_claude_config', arguments: {}}));
assert.equal(summary.short_connection_generation_enabled, false); assert.equal(summary.writing_attempts.daily.response_suppressed, true);
assert.equal(summary.writing_attempts.daily.state, 'completed'); assert.equal(summary.writing_attempts.daily.outcome, 'saved');
assert.equal(summary.writing_attempts.daily.error, null); assert.equal(summary.writing_attempts.daily.diagnostic, null); assert.equal(summary.writing_attempts.daily.has_text, false); noEffects(frozenRows);
for (const unsafe of [opaque, unicode(generic), crossDayToken, articleToken, deliveryToken]) {
 sql.prepare('INSERT OR REPLACE INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,?,?,?)').run(connectionId, owner, currentDay, 'completed', JSON.stringify({exact_match: true, raw_response: JSON.stringify({nested: unsafe})}), old);
 frozenRows = snapshot();
 const status = await rpcValue(await rpc('tools/call', {name: 'read_claude_config', arguments: {}}));
 assert.equal(status.response_suppressed, true); assert.equal(status.connection_test, null); assert.equal(status.writing_attempts, null);
 assert.equal(status.short_connection_generation_enabled, false); assert.equal(JSON.stringify(status).includes(unsafe), false); noEffects(frozenRows);
}
sql.prepare('INSERT INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,?,?,?)').run('no-config:' + day, 'no-config', day, 'completed', JSON.stringify({text: unicode(generic)}), old);
frozenRows = snapshot();
assert.equal((await claude.readClaudeDailyResult('no-config', day)).response_suppressed, true);
assert.equal((await (await history.GET(historyRequest('daily', 'no-config'))).json()).response_suppressed, true); noEffects(frozenRows);
console.log('PASS actual old daily/manual/status reads: owner-wide three-table and cross-day tokens, generic/opaque/Unicode protection, safe payload unchanged, trusted status/saved preserved, original rows immutable');

function fakeClock() {
 let time = 1000000, nextId = 1, ticks = 0; const intervals = new Map();
 class ClockDate extends Date {constructor(...args) {super(...(args.length ? args : [time]));} static now() {return time;}}
 return {
  Date: ClockDate,
  setInterval(fn, delay) {const id = nextId++; intervals.set(id, {fn, delay, next: time + delay}); return id;},
  clearInterval(id) {intervals.delete(id);},
  get size() {return intervals.size;}, get ticks() {return ticks;},
  advance(ms) {
   const end = time + ms;
   for (;;) {
    const eligible = [...intervals.entries()].filter(([, task]) => task.next <= end).sort((a, b) => a[1].next - b[1].next)[0];
    if (!eligible) break;
    const [, task] = eligible; time = task.next; task.next += task.delay; ticks++; task.fn();
   }
   time = end;
  },
 };
}
const clock = fakeClock();
const probe = evaluate('app/api/claude/transport-probe/route.ts', {Date: clock.Date, setInterval: clock.setInterval, clearInterval: clock.clearInterval});
const probeRequest = user => new Request('https://site.test/api/claude/transport-probe?seconds=1', {headers: user ? {'oai-authenticated-user-id': user} : {}});
before = snapshot();
assert.equal((await probe.GET(probeRequest(''))).status, 401); assert.equal(clock.size, 0);
const response = await probe.GET(probeRequest(owner)); assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /application\/x-ndjson/); assert.match(response.headers.get('cache-control'), /no-store/);
const [inspectStream, parserStream] = response.body.tee();
const events = [], parse = load('components/daily-run-stream.ts').readDailyNdjson(parserStream, event => events.push(event));
const reader = inspectStream.getReader(), decoder = new TextDecoder();
const readEvent = async () => {const item = await reader.read(); assert.equal(item.done, false); return JSON.parse(decoder.decode(item.value));};
const first = await readEvent(); assert.equal(first.elapsed, 0); assert.equal(first.target_seconds, 310); assert.equal(first.model_request_sent, false);
clock.advance(300000);
for (let seconds = 10; seconds <= 300; seconds += 10) {const item = await readEvent(); assert.equal(item.elapsed, seconds); assert.equal(item.state, 'running'); assert.notEqual(item.terminal, true); assert.equal(item.model_request_sent, false);}
assert.equal(clock.size, 1); clock.advance(10000);
const final = await readEvent(); assert.equal(final.elapsed, 310); assert.equal(final.state, 'completed'); assert.equal(final.terminal, true); assert.equal(final.success, true); assert.equal(final.model_request_sent, false);
assert.equal((await reader.read()).done, true); reader.releaseLock();
const parsedFinal = await parse; assert.equal(parsedFinal.terminal, true); assert.equal(parsedFinal.success, true); assert.equal(events.length, 32); assert.equal(events.filter(event => event.terminal).length, 1); assert.equal(clock.size, 0);
const cancelResponse = await probe.GET(probeRequest(owner)), cancelReader = cancelResponse.body.getReader();
await cancelReader.read(); assert.equal(clock.size, 1); await cancelReader.cancel(); assert.equal(clock.size, 0);
const priorTicks = clock.ticks; clock.advance(600000); assert.equal(clock.ticks, priorTicks); assert.equal((await cancelReader.read()).done, true); cancelReader.releaseLock();
noEffects(before);
assert.equal(logs.some(line => String(line).includes(opaque) || String(line).includes(leaseToken) || String(line).includes(marker)), false);
console.log('PASS actual probe + real NDJSON parser: fixed 310 seconds, 10-second heartbeats, one verified terminal, cancellation clears timer; no model/storage effects');
console.log('PASS legacy-generation-safety: provider=0 application_writes=0 external_effects=0 (all fixtures and clock offline)');
