// All clocks, DB, provider and network are mocked. No actual long request.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';

const root = process.cwd(), toolName = 'probe_mcp_sse_duration', logs = [];
let now = 1000, serial = 0, network = 0, businessWrites = 0, domainCalls = 0;
const timers = new Map();
const timer = (fn, delay, interval = false) => {const id = ++serial; timers.set(id, {fn, delay, at: now + delay, interval}); return id;};
const advance = async delta => {
 const target = now + delta;
 while (true) {
  const due = [...timers.entries()].filter(([, value]) => value.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
  if (!due) break;
  const [id, value] = due; now = value.at;
  if (value.interval) value.at += value.delay; else timers.delete(id);
  value.fn(); await Promise.resolve();
 }
 now = target;
};
const globals = {Request, Response, URL, TextEncoder, TextDecoder, ReadableStream, Uint8Array, AbortController, atob, crypto, performance: {now: () => now}, Date,
 setTimeout: (fn, delay) => timer(fn, delay), clearTimeout: id => timers.delete(id),
 setInterval: (fn, delay) => timer(fn, delay, true), clearInterval: id => timers.delete(id),
 fetch: () => {network++; throw Error('NETWORK_FORBIDDEN');}, console: {info: value => logs.push(JSON.parse(value))},
};
const probe = evaluate(fs.readFileSync('lib/mcp-sse-probe.ts', 'utf8'), {});
function evaluate(source, overrides) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {...globals, exports,
  require(name) {
   if (name in overrides) return overrides[name];
   if (name.endsWith('/mcp-sse-probe')) return probe;
   if (name.endsWith('/test-store')) return {owner: request => request.headers.get('oai-authenticated-user-id'), db: () => {businessWrites++; throw Error('DB_FORBIDDEN');}, list: async () => []};
   if (name.endsWith('/legacy-generation')) return {retiredGenerationNames: new Set(), legacyGenerationNotice: {}};
   if (name.endsWith('/events')) return {readiness: async () => ({connected: true}), subscribe: fail, unsubscribe: fail};
   return new Proxy({}, {get(_target, key) {if (String(key).endsWith('Tools')) return []; if (String(key).endsWith('Event')) return {name: 'synthetic.event'}; if (key === 'TopicResearchError' || key === 'ArticleDeletionError') return Error; return fail;}});
  },
 });
 return exports;
}
function fail() {domainCalls++; throw Error('DOMAIN_OPERATION_FORBIDDEN');}
const source = fs.readFileSync('app/mcp/route.ts', 'utf8'), route = evaluate(source, {});
const modernMeta = {'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {}};
const body = (seconds = 330, extra = {}) => ({jsonrpc: '2.0', id: 'zero-fee-probe', method: 'tools/call', params: {name: toolName, arguments: {duration_seconds: seconds}, _meta: {...modernMeta}}, ...extra});
const headers = {'content-type': 'application/json', accept: 'application/json, text/event-stream', 'oai-authenticated-user-id': 'synthetic-owner', 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': toolName};
const request = (payload = body(), custom = {}, signal) => new Request('https://site.test/mcp', {method: 'POST', headers: {...headers, ...custom}, body: typeof payload === 'string' ? payload : JSON.stringify(payload), ...(signal ? {signal} : {})});
const decode = value => new TextDecoder().decode(value);
const error = async (payload, custom, code, status = 400) => {
 const response = await route.POST(request(payload, custom)); assert.equal(response.status, status); assert.equal((await response.json()).error.code, code); assert.equal(timers.size, 0);
};
const before = execFileSync('git', ['show', '9729d032655667c9007941e5732d6a66774df6b0:app/mcp/route.ts'], {cwd: root, encoding: 'utf8'});
const baseline = evaluate(before, {});
for (const method of ['tools/list', 'initialize', 'server/discover', 'ping', 'events/list']) {
 const payload = {jsonrpc: '2.0', id: 42, method};
 const old = await (await baseline.POST(request(payload))).json(), updated = await (await route.POST(request(payload))).json();
 if (method === 'tools/list') {
  const listed = updated.result.tools.find(tool => tool.name === toolName); assert.ok(listed); assert.equal(listed.annotations.readOnlyHint, true); assert.equal(listed.inputSchema.additionalProperties, false); assert.deepEqual(listed.inputSchema.properties.duration_seconds, {type: 'integer', minimum: 310, maximum: 330});
  updated.result.tools = updated.result.tools.filter(tool => tool.name !== toolName);
 }
 assert.deepEqual(updated, old, method + ' legacy response changed');
}
assert.equal((await route.POST(request(body(), {'oai-authenticated-user-id': ''}))).status, 401);
assert.equal((await route.POST(request(body(), {origin: 'https://evil.test'}))).status, 403);
assert.equal((await route.POST(request('x'.repeat(120001)))).status, 413);
assert.equal((await route.POST(request('{'))).status, 400);
for (const seconds of [309, 331, 310.5, '330', null]) await error(body(seconds), {}, -32602);
for (const params of [{name: toolName}, {name: toolName, arguments: []}, {name: toolName, arguments: {duration_seconds: 330, model: 'forbidden'}}, {name: toolName, arguments: {duration_seconds: 330}, extra: true}, {name: toolName, arguments: {duration_seconds: 330}, _meta: []}]) await error(body(330, {params}), {}, -32602);
for (const extra of [{extra: true}, {id: null}, {id: false}, {id: 1.5}, {id: undefined}]) await error(body(330, extra), {}, -32600);
for (const progressToken of [null, true, {}, [], 1.5]) {const q = body(); q.params._meta.progressToken = progressToken; await error(q, {}, -32602);}
for (const custom of [{'MCP-Protocol-Version': ''}, {'Mcp-Method': ''}, {'Mcp-Method': 'tools/list'}, {'Mcp-Name': 'wrong'}, {'Mcp-Name': ''}, {'Mcp-Name': '=?base64?not@@valid?='}]) await error(body(), custom, -32020);
const missingVersionMeta = body(); delete missingVersionMeta.params._meta['io.modelcontextprotocol/protocolVersion']; await error(missingVersionMeta, {}, -32020);
const differentVersionMeta = body(); differentVersionMeta.params._meta['io.modelcontextprotocol/protocolVersion'] = '2025-03-26'; await error(differentVersionMeta, {}, -32020);
const noCapabilities = body(); delete noCapabilities.params._meta['io.modelcontextprotocol/clientCapabilities']; await error(noCapabilities, {}, -32602);
await error(body(), {'MCP-Protocol-Version': '2099-01-01'}, -32022);
await error(body(), {'content-type': 'text/plain'}, -32600, 415);
for (const accept of ['', 'application/json', 'text/event-stream', 'application/json, text/event-stream;q=0', '*/*']) await error(body(), {accept}, -32600, 406);
const already = new AbortController(); already.abort(); assert.equal((await route.POST(request(body(), {}, already.signal))).status, 400); assert.equal(timers.size, 0);
console.log('PASS discovery/legacy envelopes unchanged; owner/origin/bounded body; exact probe envelope/arguments/310–330; modern metadata/header/token/content/Accept fences; zero timers before valid request.');

async function completed(seconds, id, token) {
 const q = body(seconds, {id}); if (token !== undefined) q.params._meta.progressToken = token;
 const lateAbort = new AbortController(); const response = await route.POST(request(q, {}, lateAbort.signal)); assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /^text\/event-stream/); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('x-accel-buffering'), 'no');
 assert.equal(response.headers.get('Mcp-Session-Id'), null);
 const reader = response.body.getReader(), opened = decode((await reader.read()).value); assert.match(opened, /^: mcp-sse-probe [a-f\d-]+ opened\n\n$/); assert.equal(timers.size, 2);
 const chunks = [], start = now;
 await advance(10000); chunks.push(decode((await reader.read()).value)); assert.equal(chunks[0], ': heartbeat\n\n');
 if (token !== undefined) chunks.push(decode((await reader.read()).value));
 await advance(seconds * 1000 - 10001); assert.equal(logs.at(-1).phase, 'first_byte_enqueued', 'must remain open at duration minus 1 ms');
 await advance(1); while (true) {const next = await reader.read(); if (next.done) break; chunks.push(decode(next.value));}
 const messages = chunks.filter(value => /^event: message/.test(value)).map(value => JSON.parse(value.match(/^data: (.+)$/m)[1]));
 const finals = messages.filter(value => 'id' in value); assert.equal(finals.length, 1); assert.equal(finals[0].id, id); assert.equal(finals[0].result.resultType, 'complete');
 const metrics = JSON.parse(finals[0].result.content[0].text); assert.equal(metrics.completed, true); assert.equal(metrics.elapsed_ms, seconds * 1000); assert.equal(now - start, seconds * 1000); assert.equal(metrics.protocol_version, '2026-07-28'); assert.equal(metrics.protocol_version_source, 'validated_header_and_meta'); assert.equal(metrics.has_progress_token, token !== undefined); assert.equal(metrics.server_first_byte_enqueued_elapsed_ms, 0); assert.equal(metrics.final_response_enqueued, true);
 const notifications = messages.filter(value => value.method === 'notifications/progress');
 assert.equal(notifications.length, token === undefined ? 0 : Math.ceil(seconds / 10) - 1);
 notifications.forEach((value, i) => {assert.equal(value.params.progressToken, token); assert.equal(value.params.progress, i + 1); assert.equal('total' in value.params, false); assert.match(value.params.message, /no model request/);});
 assert.ok(!chunks.join('').match(/^(?:id:|retry:|event: endpoint)/m)); assert.equal(timers.size, 0); assert.equal(logs.at(-1).phase, 'completed'); assert.equal(logs.at(-1).server_stream_ended, true);
 const logCount = logs.length; lateAbort.abort(); assert.equal(logs.length, logCount); await advance(90000); assert.equal(logs.length, logCount, 'no work/messages after EOF');
}
await completed(310, 0, undefined);
await completed(330, 'same-id-final', 'original-token-not-a-model-percent');
await completed(330, 'numeric-zero-token', 0);
await completed(310, 'empty-string-token', '');
await completed(311, 'non-tick-duration', undefined);
await completed(329, 'upper-interior-boundary', 'interior-token');
console.log('PASS mock 310/330-second boundaries, immediate comment/ten-second heartbeat, exact one complete final ID/EOF, genuine string/zero progress tokens and strictly increasing non-percentage notifications only while active.');

for (const abortRequest of [false, true]) {
 const cancellation = new AbortController(), response = await route.POST(request(body(), {}, cancellation.signal)), reader = response.body.getReader(); await reader.read(); await advance(10000); await reader.read();
 if (abortRequest) {cancellation.abort(); assert.equal((await reader.read()).done, true);} else await reader.cancel('caller-secret-reason-not-logged');
 assert.equal(timers.size, 0); assert.equal(logs.at(-1).phase, 'cancelled'); assert.equal(logs.at(-1).elapsed_ms, 10000); assert.equal(logs.at(-1).final_response_enqueued, false); assert.equal(logs.at(-1).server_stream_ended, true);
 const logCount = logs.length; await advance(400000); assert.equal(logs.length, logCount);
}
const legacy = body(); delete legacy.params._meta; const legacyHeaders = {...headers}; delete legacyHeaders['MCP-Protocol-Version']; delete legacyHeaders['Mcp-Method']; delete legacyHeaders['Mcp-Name'];
await error(legacy, {'MCP-Protocol-Version': ''}, -32020);
const oldResponse = await route.POST(new Request('https://site.test/mcp', {method: 'POST', headers: legacyHeaders, body: JSON.stringify(legacy)})); await oldResponse.body.cancel(); assert.equal(logs.at(-1).protocol_version, '2025-03-26'); assert.equal(logs.at(-1).protocol_version_source, 'legacy_no_header_assumption'); assert.equal(logs.at(-1).phase, 'transport_closed'); assert.equal(timers.size, 0);
const encoded = await route.POST(request(body(), {'Mcp-Name': '=?base64?' + Buffer.from(toolName).toString('base64') + '?=', 'Last-Event-ID': 'ignored-untrusted-resume-id', 'Mcp-Session-Id': 'ignored-untrusted-session'})); assert.equal(encoded.status, 200); await encoded.body.cancel(); assert.equal(timers.size, 0);
const first = await route.POST(request(body())), firstReader = first.body.getReader(); const firstComment = decode((await firstReader.read()).value); await firstReader.cancel();
const lastResponse = await route.POST(request(body())), lastReader = lastResponse.body.getReader(); const lastComment = decode((await lastReader.read()).value); await lastReader.cancel(); assert.notEqual(lastComment, firstComment); assert.equal(lastResponse.headers.get('Mcp-Session-Id'), null); assert.equal(timers.size, 0);
console.log('PASS modern body cancel/request abort immediately stop timers/messages; legacy disconnect is labelled separately; no session/event IDs/replay and mirrored Base64 name accepted.');
assert.equal(network, 0); assert.equal(businessWrites, 0); assert.equal(domainCalls, 0);
for (const entry of logs.filter(value => value.component === 'mcp-sse-probe')) {assert.equal(entry.provider_requests, 0); assert.equal(entry.business_db_writes, 0); assert.equal(entry.background_work, false); assert.equal(entry.resumption_supported, false); assert.equal('owner' in entry, false); assert.equal('progressToken' in entry, false);}
assert.ok(!JSON.stringify(logs).includes('caller-secret-reason-not-logged')); assert.ok(!JSON.stringify(logs).includes('original-token-not-a-model-percent'));
const moduleSource = fs.readFileSync('lib/mcp-sse-probe.ts', 'utf8'); assert.ok(!/^import\s/m.test(moduleSource)); assert.ok(!/\b(?:fetch|waitUntil|db|BUCKET|queue)\s*\(/.test(moduleSource));
assert.ok(!source.includes("name:'execute_editorial_v3_stage'"));
console.log('PASS provider/network/domain operations/business DB writes all exactly zero; no owner/token/request-ID log leakage, background job, paid execution tool or dependencies.');
