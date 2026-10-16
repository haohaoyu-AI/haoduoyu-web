import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import ts from 'typescript';

// All secrets, metadata, database reads and fetches are local synthetic fixtures.
// Deliberately no network-capable fetch is given to the implementation VM.
const keyText = '01234567890123456789012345678901', secret = 'opaque.provider.Q9vN2mX7pR4tL6cZ';
const token = '3fc4463d-10cf-4eba-a851-6028521d9cae', model = 'claude-gateway-exact-fixture';
const encryptionKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(keyText), {name: 'AES-GCM'}, false, ['encrypt']);
const iv = crypto.getRandomValues(new Uint8Array(12));
const encrypted = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('owner')}, encryptionKey, new TextEncoder().encode(secret));
const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const configuration = {enabled: '1', model, secret: JSON.stringify({iv: encode(iv), data: encode(encrypted)})};
let settingsMode = 'ok', catalog = '', responseRaw = '', responseStatus = 200, responseMedia = 'application/json', responseUrl = '', interrupted = false, thrownName = '', requests = [], timeouts = [], chunkSize = 0, hanging = false, fastTimeout = false;
let virtualClock=null,virtualMode='',virtualCaller=null,virtualTimers=[],bodyPrefix='',abortDuringDecode=false,virtualInvalidBytes=false,inspectionRaceCause='';
const NativeTextDecoder=TextDecoder;
const DeadlineRaceDecoder=class extends NativeTextDecoder{decode(value,options){if(abortDuringDecode&&value&&(value[0]===0x65||value[0]===0xc3)){abortDuringDecode=false;advance(900000);}return super.decode(value,options);}};
const VirtualDate=class extends Date{constructor(...args){super(...(args.length?args:[virtualClock??Date.now()]));}static now(){return virtualClock??Date.now();}};
function advance(ms){virtualClock+=ms;for(const timer of virtualTimers)if(!timer.controller.signal.aborted&&timer.at<=virtualClock){const error=Error('synthetic deadline');error.name='TimeoutError';timer.controller.abort(error);}}
const db = {prepare(sql) {
 assert.equal(sql, 'SELECT * FROM claude_settings WHERE owner=?');
 return {bind(owner) {assert.equal(owner, 'owner'); return {async first() {if (settingsMode === 'error') throw Error(secret); if (settingsMode === 'missing') return null; if (settingsMode === 'changed') return {...configuration, model: 'claude-other'}; if (settingsMode === 'invalid-secret') return {...configuration, secret: secret}; return configuration;}};}};
}};
const mockFetch = async (url, options) => {
 requests.push({url, options});
 assert.equal(options.redirect, 'manual'); assert.equal(options.headers.authorization, `Bearer ${secret}`);
 assert.equal(options.headers['anthropic-version'], '2023-06-01');
 assert.equal(url, options.method === 'GET' ? 'https://app.yylx.io/v1/models' : 'https://app.yylx.io/v1/messages');
 if (thrownName) {const error = Error(secret + token); error.name = thrownName; throw error;}
 let body = options.method === 'GET' ? catalog : responseRaw;
 if (virtualMode&&options.method!=='GET'){let at=0;body=new ReadableStream({pull(controller){if(at++===0){controller.enqueue(virtualInvalidBytes?new Uint8Array([0xc3,0x28]):new TextEncoder().encode(bodyPrefix||start+block+delta('合成安全正文')));return;}if(at===2){advance(virtualMode==='deadline'?900000:500000);if(virtualMode==='cancel')virtualCaller.abort(Error(secret+token));if(virtualMode==='complete')controller.enqueue(new TextEncoder().encode(close+finish('end_turn')));return;}if(virtualMode==='complete')controller.close();}},{highWaterMark:0});}
 else if (interrupted || chunkSize || hanging) {
  const bytes = new TextEncoder().encode(body), parts = []; for (let at = 0; at < bytes.length; at += chunkSize || 200) parts.push(bytes.slice(at, at + (chunkSize || 200)));
  body = new ReadableStream({pull(controller) {if (parts.length) controller.enqueue(parts.shift()); else if (interrupted) controller.error(Error(secret + token)); else if (!hanging) controller.close();}}, {highWaterMark: 0});
 }
 const result = new Response(body, {status: responseStatus, headers: {'content-type': responseMedia}});
 if (responseUrl) Object.defineProperty(result, 'url', {value: responseUrl});
 return result;
};
const cache = {};
function load(name) {
 if (cache[name]) return cache[name];
 const exports = {}; cache[name] = exports;
 const js = ts.transpileModule(fs.readFileSync(`lib/${name}.ts`, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js, {exports, Error, crypto, TextEncoder, TextDecoder:DeadlineRaceDecoder, Uint8Array, ArrayBuffer, Set, URL, btoa, atob, Date:VirtualDate, Response, ReadableStream, fetch: mockFetch, AbortSignal: {any:signals=>AbortSignal.any(signals),timeout(ms) {timeouts.push(ms);if(virtualClock!==null){const controller=new AbortController();virtualTimers.push({at:virtualClock+ms,controller});return controller.signal;} return AbortSignal.timeout(fastTimeout ? 10 : ms);}}, require(path) {
  if (path === 'cloudflare:workers') return {env: {CLAUDE_CONFIG_KEY: btoa(keyText)}};
  if (path === './test-store') return {db: () => db};
  if (path === './legacy-generation') return {retiredGenerationNames: new Set()};
  if (path === './editorial-binding-diagnostics' || path === './credential-boundary' || path === './claude-model-capability' || path === './claude-outline-stream' || path === './stream-credential-buffer' || path === './editorial-credential-text') return load(path.slice(2));
  return {};
 }});
 return exports;
}
const c = load('claude'), pure = load('claude-model-capability');
const unicode = value => [...value].map(char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')).join('');
const clean = value => {const raw = JSON.stringify(value); for (const forbidden of [secret, token, unicode(secret), unicode(token)]) assert.equal(raw.includes(forbidden), false);};
const reset = () => {requests = []; timeouts = []; responseStatus = 200; responseMedia = 'application/json'; responseUrl = ''; interrupted = false; thrownName = ''; settingsMode = 'ok'; chunkSize = 0; hanging = false; fastTimeout = false;virtualClock=null;virtualMode='';virtualCaller=null;virtualTimers=[];bodyPrefix='';abortDuringDecode=false;virtualInvalidBytes=false;inspectionRaceCause='';};
const capabilityFails = async () => {await assert.rejects(c.readClaudeOutputCapability('owner', model), error => {assert.equal(error.message, c.CLAUDE_OUTPUT_CAPABILITY_UNCONFIRMED); clean(error.message); return true;}); assert.equal(requests.some(r => r.options.method === 'POST'), false);};
reset();
catalog = JSON.stringify({data: [{id: model, max_output_tokens: 131072}], has_more: false});
const capability = await c.readClaudeOutputCapability('owner', model);
assert.equal(capability.model, model); assert.equal(capability.max_output_tokens, 131072); assert.equal(capability.source_url, 'https://app.yylx.io/v1/models'); assert.equal(Number.isNaN(Date.parse(capability.checked_at)), false);
const {capability_sha256, ...base} = capability;
assert.equal(capability_sha256, createHash('sha256').update(JSON.stringify(base)).digest('hex'));
assert.deepEqual(timeouts, [20000]); assert.equal(requests.length, 1); assert.equal(requests[0].options.body, undefined); clean(capability);
for (const payload of [null, [], {}, {data: []}, {data: [{id: 'claude-opus-5-5', max_output_tokens: 131072}]}, {data: [{id: model}]}, {data: [{id: model, max_tokens: 131072}]}, {data: [{id: model, context_window: 1000000}]}, {data: [{id: model, limits: {max_output_tokens: 131072}}]}, {data: [{id: model, max_output_tokens: 1}, {id: model, max_output_tokens: 1}]}, {data: [{id: model, max_output_tokens: 131072}], has_more: true}, ...[null, '131072', 0, -1, 1.5, true, {}, [], Number.MAX_SAFE_INTEGER + 1].map(limit => ({data: [{id: model, max_output_tokens: limit}]}))]) {reset(); catalog = JSON.stringify(payload); await capabilityFails();}
for (const raw of ['{', `{"data":[{"id":"${model}","max_output_tokens":128000,"max_output_tokens":64000}]}`, `{"data":[{"id":"${model}","max_output_tokens":128000,"max_output_\\u0074okens":64000}]}`, `{"data":[{"id":"${model}","max_output_tokens":128000}],"note":"${secret}"}`, `{"data":[{"id":"${model}","max_output_tokens":128000}],"note":"${unicode(secret)}"}`, 'x'.repeat(200001)]) {reset(); catalog = raw; await capabilityFails();}
for (const status of [301, 401, 403, 429, 500]) {reset(); responseStatus = status; catalog = secret; await capabilityFails();}
for (const value of ['https://evil.example/v1/models', 'https://app.yylx.io/v1/models?other=1']) {reset(); responseUrl = value; await capabilityFails();}
for (const name of ['TimeoutError', 'TypeError', 'ProviderPrivateError']) {reset(); thrownName = name; await capabilityFails();}
for (const mode of ['missing', 'changed', 'error', 'invalid-secret']) {reset(); settingsMode = mode; await assert.rejects(c.readClaudeOutputCapability('owner', model), error => error.message === c.CLAUDE_OUTLINE_CONFIGURATION_CHANGED); assert.equal(requests.length, 0);}
reset(); configuration.model = 'claude-opus-5-5';
catalog = JSON.stringify({data: [{id: 'claude-opus-5-5', object: 'model'}]});
const fallback = await c.readClaudeOutputCapability('owner', 'claude-opus-5-5');
assert.equal(fallback.max_output_tokens, 128000); assert.equal(fallback.relay_limit_verified, false); assert.equal(fallback.evidence_kind, 'documented_upstream_bound');
assert.equal(fallback.source_url, 'https://platform.claude.com/docs/en/models/opus-5-5/overview');
assert.equal(fallback.metadata_source_url, 'https://app.yylx.io/v1/models');
assert.equal(fallback.provider_mapping_source_url, 'https://yylx.io/blog/2026/09/23/claude-opus-5-5-vs-opus-5-vs-fable-5/');
assert.equal(fallback.provider_base_source_url, 'https://docs.yylx.io/access/claude-code');
assert.equal(requests.length, 1); assert.equal(requests[0].options.method, 'GET'); clean(fallback);
for (const row of [{id: 'claude-opus-5-5', max_output_tokens: null}, {id: 'claude-opus-5-5', max_output_tokens: '128000'}, {id: 'claude-opus-5-5', limits: {max_output_tokens: 4096}}, {id: 'claude-opus-5-5', max_tokens: 4096}]) {reset(); catalog = JSON.stringify({data: [row]}); await assert.rejects(c.readClaudeOutputCapability('owner', 'claude-opus-5-5'), error => error.message === c.CLAUDE_OUTPUT_CAPABILITY_UNCONFIRMED); assert.equal(requests.length, 1);}
reset(); catalog = JSON.stringify({data: [{id: 'claude-opus-5-5', max_output_tokens: 64000}]});
const verified = await c.readClaudeOutputCapability('owner', 'claude-opus-5-5'); assert.equal(verified.max_output_tokens, 64000); assert.equal(verified.relay_limit_verified, true); assert.equal(verified.evidence_kind, 'relay_metadata');
configuration.model = model;
console.log('PASS capability: exact fixed-origin metadata, verified numeric limits, exact-model 128000 documentary fallback labelled relay_limit_verified=false, source provenance, no alias inference or paid probes, other missing/ambiguous/unsafe evidence fails closed');

const snapshot = {model, max_output_tokens: 131072, system_prompt: '完整合成系统提示词', user_prompt: '合成选题资料，请独立拟定框架。'};
const response = (overrides = {}) => JSON.stringify({model: 'gateway-returned-fixture', usage: {input_tokens: 123, output_tokens: 456, output_tokens_details: {thinking_tokens: 9}}, stop_reason: 'end_turn', content: [{type: 'text', text: '框架正文：' + '合成论证推进。'.repeat(12000)}], ...overrides});
reset(); responseRaw = response(); let progress = [];
const result = await c.requestOutlineClaudeOnce('owner', snapshot, [token], p => {progress.push(p);});
assert.equal(result.state, 'completed'); assert.equal(result.raw_response, responseRaw); assert.equal(result.text.length > 50000, true); assert.equal(result.diagnostic.response_bytes > 200000, true); assert.equal(result.requested_model, model); assert.equal(result.returned_model, 'gateway-returned-fixture'); assert.equal(result.usage.thinking_tokens, 9); assert.equal(result.diagnostic.progress_persist_failed, false);
assert.deepEqual(timeouts, [300000]); assert.equal(requests.length, 1); const sent = JSON.parse(requests[0].options.body);
assert.equal(sent.max_tokens, 131072); assert.equal(sent.max_output_tokens, undefined); assert.equal(sent.system, snapshot.system_prompt); assert.equal(sent.messages[0].content, snapshot.user_prompt); assert.equal(sent.stream, true); assert.equal(sent.model, model); assert.equal(requests[0].options.body.includes(token), false); assert.equal(progress.length > 0, true); clean(progress); clean(result);
reset(); configuration.model = 'claude-opus-5-5'; responseRaw = response(); const fallbackRequest = await c.requestOutlineClaudeOnce('owner', {...snapshot, model: 'claude-opus-5-5', max_output_tokens: 128000}, [token]); assert.equal(fallbackRequest.state, 'completed'); assert.equal(JSON.parse(requests[0].options.body).max_tokens, 128000); assert.equal(requests.length, 1); configuration.model = model;
for (const change of [{max_output_tokens: '131072'}, {max_output_tokens: 0}, {max_output_tokens: Infinity}, {max_output_tokens: Number.MAX_SAFE_INTEGER + 1}, {model: 'x'}, {system_prompt: ''}, {user_prompt: null}, {timeout_ms: 1}]) {reset(); await assert.rejects(c.requestOutlineClaudeOnce('owner', {...snapshot, ...change}, [token]), error => error.message === c.CLAUDE_OUTLINE_INPUT_INVALID); assert.equal(requests.length, 0);}
for (const value of [secret, token, unicode(secret), unicode(unicode(token)), 'sk-' + 'Z'.repeat(32)]) {reset(); await assert.rejects(c.requestOutlineClaudeOnce('owner', {...snapshot, user_prompt: snapshot.user_prompt + value}, [token]), error => error.message === c.CLAUDE_OUTLINE_INPUT_UNSAFE); assert.equal(requests.length, 0);}
for (const mode of ['missing', 'changed', 'error', 'invalid-secret']) {reset(); settingsMode = mode; await assert.rejects(c.requestOutlineClaudeOnce('owner', snapshot, [token]), error => error.message === c.CLAUDE_OUTLINE_CONFIGURATION_CHANGED); assert.equal(requests.length, 0);}
console.log('PASS one-shot transport: dynamic verified snapshot max_tokens above 14000, unchanged prompts, 300-second timeout, safe progress, safe preflight errors, no retry');

const run = async () => {progress = []; const value = await c.requestOutlineClaudeOnce('owner', snapshot, [token], p => {progress.push(p);}); assert.equal(requests.length, 1); clean(value); clean(progress); return value;};
for (const [label, raw] of [
 ['plain key', response({content: [{type: 'text', text: secret}]})],
 ['escaped key', response({content: [{type: 'text', text: unicode(secret)}]})],
 ['nested key', response({content: [{type: 'text', text: unicode(unicode(secret))}]})],
 ['token', response({model: token})],
 ['usage field', response({usage: {input_tokens: 12, output_tokens: 34, extra: {authorization: secret}}})],
 ['metadata key', response({[secret]: 'hidden'})],
 ['stop reason', response({stop_reason: token})],
 ['generic key', response({extra: {api_key: 'Q'.repeat(32)}})],
 ['partial escaped', `{"usage":{"input_tokens":1,"output_tokens":2},"content":[{"type":"text","text":"${unicode(secret)}\\u0`],
 ['partial plain', `{"usage":{"input_tokens":1,"output_tokens":2},"content":[{"type":"text","text":"${secret}`],
]) {reset(); responseRaw = raw; const value = await run(); assert.equal(value.state, 'failed', label); assert.equal(value.diagnostic.response_suppressed, true, label); assert.equal(value.text, null); assert.equal(value.raw_response, null); assert.equal(value.partial_text, null); assert.equal(value.raw_partial_response, null); assert.equal(value.returned_model, null); assert.equal(value.error, c.CLAUDE_OUTLINE_RESPONSE_UNSAFE);}
reset(); responseRaw = response(); responseMedia = secret; assert.equal((await run()).diagnostic.response_suppressed, true);
reset(); responseRaw = response({stop_reason: 'max_tokens'}); const truncated = await run(); assert.equal(truncated.state, 'failed'); assert.equal(truncated.diagnostic.code, 'output_truncated'); assert.equal(truncated.raw_partial_response, responseRaw); assert.equal(truncated.usage.output_tokens, 456); assert.equal(truncated.error, c.CLAUDE_OUTLINE_OUTPUT_TRUNCATED);
reset(); responseRaw = response({stop_reason: 'pause_turn'}); assert.equal((await run()).diagnostic.code, 'stop_reason_unknown');
reset(); responseRaw = response({content: [{type: 'text', text: '   '}]}); assert.equal((await run()).diagnostic.code, 'missing_text');
reset(); responseRaw = '{"usage":{"input_tokens":17,"output_tokens":18},"content":[{"type":"text","text":"安全但未完成'; interrupted = true; const partial = await run(); assert.equal(partial.diagnostic.code, 'outline_body_interrupted'); assert.equal(partial.usage.output_tokens, 18); assert.equal(partial.partial_text, '安全但未完成'); assert.equal(progress.length, 1);
reset(); responseRaw = response({usage: {input_tokens: secret, output_tokens: '999', output_tokens_details: {thinking_tokens: -1}}}); const unsafeUsage = await run(); assert.equal(unsafeUsage.usage, null); assert.equal(progress.length, 0);
reset(); responseRaw = response({usage: {input_tokens: 7, output_tokens: 9, extra: token}}); const numericOnly = await run(); assert.equal(numericOnly.usage.input_tokens, 7); assert.equal(numericOnly.usage.output_tokens, 9); assert.equal(numericOnly.diagnostic.response_suppressed, true); clean(progress);
reset(); responseStatus = 400; responseRaw = response({error: {message: 'max_tokens exceeds gateway support'}}); const rejectedParameters = await run(); assert.equal(rejectedParameters.diagnostic.code, 'upstream_parameters_rejected'); assert.equal(rejectedParameters.error, c.CLAUDE_OUTLINE_PARAMETERS_REJECTED);
for (const status of [301, 401, 429, 500]) {reset(); responseStatus = status; responseRaw = response({error: '合成中转站错误'}); const value = await run(); assert.equal(value.diagnostic.code, 'upstream_http_error'); assert.equal(value.usage.output_tokens, 456);}
for (const [name, code] of [['TimeoutError', 'timeout'], ['AbortError', 'aborted'], ['TypeError', 'request_failed']]) {reset(); thrownName = name; assert.equal((await run()).diagnostic.code, code);}
reset(); responseUrl = 'https://evil.example/v1/messages'; responseRaw = response(); assert.equal((await run()).diagnostic.code, 'outline_unexpected_origin');
reset(); responseRaw = response(); const callbackFailed = await c.requestOutlineClaudeOnce('owner', snapshot, [token], () => {throw Error(secret + token);}); clean(callbackFailed); assert.equal(callbackFailed.state, 'completed'); assert.equal(callbackFailed.diagnostic.progress_persist_failed, true); assert.equal(requests.length, 1);
assert.equal(pure.partialOutlineUsage('{"content":[{"text":"\\\"usage\\\":{\\\"input_tokens\\\":999}"}],"usage":{"input_tokens":1,"output_tokens":2},').input_tokens, 1);
assert.equal(pure.partialOutlineUsage('{"usage":{"input_tokens":1},"usage":{"input_tokens":2},'), null);
assert.equal(pure.outlineNumericUsage({input_tokens: '42', output_tokens: -1}), null);
console.log('PASS provider failures: partial/unsafe/escaped/HTTP/timeout/redirect/callback errors are credential-safe, numeric usage retained promptly, one request maximum');
console.log('PASS all tests are offline mocks; zero real provider calls, database writes, online changes or deployments');

// Real SSE envelopes, wholly offline. No imitation JSON-as-SSE fallback.
const event = (type, fields = {}) => `event: ${type}\ndata: ${JSON.stringify({type, ...fields})}\n\n`;
const start = event('message_start', {message: {type: 'message', role: 'assistant', content: [], model, stop_reason: null, usage: {input_tokens: 123, output_tokens: 1}}});
const block = event('content_block_start', {index: 0, content_block: {type: 'text', text: ''}});
const delta = text => event('content_block_delta', {index: 0, delta: {type: 'text_delta', text}});
const close = event('content_block_stop', {index: 0});
const finish = reason => event('message_delta', {delta: {stop_reason: reason}, usage: {output_tokens: 456}}) + event('message_stop');
const sse = (text = '中文正文😀', reason = 'end_turn') => start + event('ping') + block + delta(text) + close + finish(reason);
for (const size of [0, 1, 7, 37, 1024]) {
 reset(); responseMedia = 'Text/Event-Stream; charset=utf-8'; responseRaw = '\uFEFF' + sse().replaceAll('\n', '\r\n'); chunkSize = size;
 const value = await run(); assert.equal(value.state, 'completed'); assert.equal(value.text, '中文正文😀'); assert.equal(value.raw_response, responseRaw); assert.equal(value.diagnostic.message_stop_received, true); assert.equal(value.returned_model, model); assert.equal(value.usage.input_tokens, 123); assert.equal(value.usage.output_tokens, 456); assert.equal(value.diagnostic.response_bytes, new TextEncoder().encode(responseRaw).length);
}
reset(); responseMedia = 'text/event-stream'; responseRaw = sse().replaceAll('\n', '\r'); chunkSize = 1; assert.equal((await run()).state, 'completed');
reset(); responseMedia = 'text/event-stream'; responseRaw = sse().replace('data: {"type":"message_stop"}', 'data: {\ndata: "type":"message_stop"}'); assert.equal((await run()).state, 'completed');
for (const [raw, code] of [
 [start + block + delta('保留部分正文'), 'outline_stream_incomplete'],
 [sse().replace(event('message_stop'), ''), 'outline_stream_incomplete'],
 [sse().slice(0, -1), 'outline_stream_incomplete'],
 [start + block + delta('部分') + event('error', {error: {type: 'overloaded_error'}}), 'outline_stream_error'],
 [start + delta('越序'), 'outline_invalid_stream'],
 [start + block + delta('部分') + finish('end_turn'), 'outline_invalid_stream'],
 [sse() + event('message_stop'), 'outline_invalid_stream'],
 [sse().replace('event: message_stop', 'event: message_delta'), 'outline_invalid_stream'],
 [sse().replace('"type":"message_stop"', '"type":"message_stop","type":"ping"'), 'outline_invalid_stream'],
 [sse('截断', 'max_tokens'), 'output_truncated'],
 [sse('暂停', 'pause_turn'), 'stop_reason_unknown'],
 ['data: ' + 'x'.repeat(1024 * 1024 + 1), 'outline_stream_event_too_large'],
]) {reset(); responseMedia = 'text/event-stream'; responseRaw = raw; const value = await run(); assert.equal(value.state, 'failed', code); assert.equal(value.diagnostic.code, code);}
reset(); responseMedia = 'text/event-stream'; responseRaw = start + event('future_event', {future: true}) + block + delta('兼容') + close + finish('end_turn'); assert.equal((await run()).state, 'completed');
reset(); responseMedia = 'text/event-stream'; responseRaw = start + block + delta('安全部分'); interrupted = true; const streamPartial = await run(); assert.equal(streamPartial.partial_text, '安全部分'); assert.equal(streamPartial.raw_partial_response, responseRaw); assert.equal(streamPartial.usage.input_tokens, 123); assert.equal(streamPartial.usage.output_tokens, 1); assert.equal(streamPartial.diagnostic.code, 'outline_body_interrupted'); assert.equal(streamPartial.diagnostic.message_stop_received, false);
for (const raw of [sse(secret), sse(unicode(secret)), start + block + delta(secret.slice(0, 12)) + delta(secret.slice(12)) + close + finish('end_turn'), start + event('future_event', {api_key: 'Q'.repeat(32)}) + block + delta('正文') + close + finish('end_turn')]) {reset(); responseMedia = 'text/event-stream'; responseRaw = raw; const value = await run(); assert.equal(value.diagnostic.response_suppressed, true); assert.equal(value.partial_text, null); assert.equal(value.raw_partial_response, null);}
reset(); responseMedia = 'text/plain'; responseRaw = response(); assert.equal((await run()).diagnostic.code, 'outline_unsupported_media_type');
reset(); responseMedia = 'application/json'; responseRaw = sse(); assert.equal((await run()).diagnostic.code, 'invalid_response_json');
reset(); responseMedia = 'text/event-stream'; responseRaw = response(); assert.equal((await run()).state, 'failed');
reset(); responseMedia = 'text/plain'; responseStatus = 524; responseRaw = 'error code: 524\n'; const cloudflare = await run(); assert.equal(cloudflare.diagnostic.code, 'upstream_http_error'); assert.equal(cloudflare.raw_partial_response, responseRaw); assert.equal(cloudflare.usage, null);
reset(); responseMedia = 'application/json'; responseRaw = 'x'.repeat(16 * 1024 * 1024 + 1); const oversized = await run(); assert.equal(oversized.diagnostic.code, 'outline_response_too_large'); assert.equal(oversized.diagnostic.response_bytes, 16 * 1024 * 1024 + 1);
// Keep Node alive while its native AbortSignal.timeout (unref'ed timer) fires.
const keepAlive = setInterval(() => {}, 1000);
try {reset(); responseMedia = 'text/event-stream'; responseRaw = start + block + delta('超时部分'); hanging = true; fastTimeout = true; const timed = await run(); assert.equal(timed.diagnostic.code, 'timeout'); assert.equal(timed.partial_text, '超时部分'); assert.equal(timed.diagnostic.message_stop_received, false);} finally {clearInterval(keepAlive);}
console.log('PASS SSE: split UTF-8/BOM/CRLF/CR/multiline frames, cumulative usage, strict lifecycle/EOF, malformed/error/truncation, future events, credential fragments, true media types, 524 diagnostics, exact 16 MiB byte bound and bounded hanging reader; zero retries');

reset(); responseMedia = 'text/event-stream'; responseRaw = new Uint8Array([0xc3, 0x28]); const utf8 = await run(); assert.equal(utf8.state, 'failed'); assert.equal(utf8.diagnostic.response_suppressed, true); assert.equal(utf8.diagnostic.response_bytes, 2);
reset(); responseMedia = 'application/json'; responseRaw = 'x'.repeat(16 * 1024 * 1024); const exactLimit = await run(); assert.notEqual(exactLimit.diagnostic.code, 'outline_response_too_large'); assert.equal(exactLimit.diagnostic.response_bytes, 16 * 1024 * 1024);
const callbackKeepAlive = setInterval(() => {}, 1000);
try {reset(); responseMedia = 'text/event-stream'; responseRaw = sse(); fastTimeout = true; const stalledPersistence = await c.requestOutlineClaudeOnce('owner', snapshot, [token], () => new Promise(() => {})); assert.equal(stalledPersistence.state, 'failed'); assert.equal(stalledPersistence.diagnostic.code, 'timeout'); assert.equal(stalledPersistence.diagnostic.progress_persist_failed, true); assert.equal(requests.length, 1);} finally {clearInterval(callbackKeepAlive);}
console.log('PASS invalid UTF-8 exact byte counts, inclusive 16 MiB boundary and stalled progress persistence deadline');

const initialBlock = (index, content_block) => event('content_block_start', {index, content_block}) + event('content_block_stop', {index});
reset(); responseMedia = 'text/event-stream'; responseRaw = start + initialBlock(0, {type: 'text', text: secret.slice(0, 12)}) + initialBlock(1, {type: 'text', text: secret.slice(12)}) + finish('end_turn'); const initialEcho = await run(); assert.equal(initialEcho.state, 'failed'); assert.equal(initialEcho.diagnostic.response_suppressed, true); assert.equal(initialEcho.raw_partial_response, null);
for (const raw of [start + block + delta('正文') + event('content_block_delta', {index: 0, delta: {type: 'future_text_delta', text: '不能静默遗漏'}}) + close + finish('end_turn'), start + initialBlock(0, {type: 'text', text: '正文'}) + initialBlock(1, {type: 'unexpected_block', text: '不能遗漏'}) + finish('end_turn')]) {reset(); responseMedia = 'text/event-stream'; responseRaw = raw; const value = await run(); assert.equal(value.state, 'failed'); assert.equal(value.diagnostic.code, 'outline_invalid_stream');}
reset(); responseMedia = 'text/event-stream'; responseRaw = start + event('content_block_start', {index: 0, content_block: {type: 'thinking', thinking: '', signature: ''}}) + event('content_block_delta', {index: 0, delta: {type: 'thinking_delta', thinking: '合成思考'}}) + event('content_block_delta', {index: 0, delta: {type: 'signature_delta', signature: 'fixture'}}) + close + initialBlock(1, {type: 'redacted_thinking', data: 'fixture'}) + initialBlock(2, {type: 'text', text: '实际正文'}) + finish('end_turn'); const thinking = await run(); assert.equal(thinking.state, 'completed'); assert.equal(thinking.text, '实际正文'); assert.equal(thinking.diagnostic.transport_version, 'anthropic_sse_v1'); assert.equal(thinking.diagnostic.request_stream, true);
console.log('PASS independent audit regressions: split initial block credentials suppressed, unknown content block/delta rejected, supported thinking/signature/redacted blocks preserve exact prose, immutable transport diagnostics');

reset(); responseMedia = 'text/event-stream'; responseRaw = start + event('future_event', {metadata: secret.slice(0, 12)}) + event('future_event', {metadata: secret.slice(12)}) + block + delta('正文') + close + finish('end_turn'); const metadataEcho = await run(); assert.equal(metadataEcho.state, 'failed'); assert.equal(metadataEcho.diagnostic.response_suppressed, true); assert.equal(metadataEcho.raw_partial_response, null);
console.log('PASS concatenated future-event metadata credential suppression');

reset(); responseMedia = 'text/event-stream'; responseRaw = start + block + delta('安全已接收正文') + 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"不完整尾部'; const unfinishedTail = await run(); assert.equal(unfinishedTail.state, 'failed'); assert.equal(unfinishedTail.partial_text, '安全已接收正文'); assert.equal(unfinishedTail.raw_partial_response, null);
console.log('PASS unparsed SSE tail never returned as raw, safe complete-event prose retained');

reset(); responseMedia = 'text/event-stream'; responseRaw = start + block + delta('安全正文') + 'event: future_event\ndata: {"type":"future_event","metadata":"' + secret.slice(0, 12) + '","metadata":"' + secret.slice(12) + '"}\n\n'; const rejectedFrame = await run(); assert.equal(rejectedFrame.state, 'failed'); assert.equal(rejectedFrame.diagnostic.code, 'outline_invalid_stream'); assert.equal(rejectedFrame.raw_partial_response, null); assert.equal(rejectedFrame.partial_text, '安全正文'); assert.equal(rejectedFrame.usage.input_tokens, 123);
console.log('PASS delimiter-consumed invalid JSON frame cannot persist unaudited raw metadata; reviewed text/accounting retained');

// A generated JSON artifact is opaque prose to the wire decoder, never unescaped twice.
const escapedArtifact=JSON.stringify({title:'合成标题',opening:'所谓"热门"仍须查证，保留路径\\note及换行\n。',sections:[{argument:'"赔率"和"作品"'}]});
assert.ok(escapedArtifact.includes('\\"热门\\"'));
for(const media of ['application/json','text/event-stream'])for(const size of [0,1,13]){
 reset();responseMedia=media;chunkSize=size;responseRaw=media==='application/json'?response({content:[{type:"text",text:escapedArtifact}]}):sse(escapedArtifact);
 const exact=await run();assert.equal(exact.state,'completed');assert.equal(exact.text,escapedArtifact);assert.equal(createHash('sha256').update(exact.text).digest('hex'),createHash('sha256').update(escapedArtifact).digest('hex'));assert.equal(JSON.parse(exact.text).opening,'所谓"热门"仍须查证，保留路径\\note及换行\n。');
}
console.log('PASS actual SSE/JSON provider extraction preserves escaped inner quotes/backslash/newline artifact byte-for-byte across 1-byte/13-byte chunks; no double unescape or real provider');

// Explicit future V3 mode; no real provider, model fee or business storage.
const v2 = async(options={})=>{const value=await c.requestOutlineClaudeOnce('owner',snapshot,[token],undefined,load('editorial-credential-text').editorialCredentialInspection,{inspectionVersion:'buffered_v2',...options});clean(value);return value;};
for(const size of [0,1,13]){reset();responseMedia='text/event-stream';chunkSize=size;responseRaw=start+block+delta('\\u4')+delta('e00')+close+finish('end_turn');const value=await v2();assert.equal(value.state,'completed');assert.equal(value.text,'\\u4e00');assert.equal(value.raw_response,null);assert.equal(value.raw_partial_response,null);assert.equal(value.diagnostic.eof_received,true);assert.equal(value.diagnostic.safety_subcause,null);assert.equal(value.diagnostic.transport_version,'anthropic_sse_buffered_v2');}
for(const body of [secret,unicode(secret),encodeURIComponent(secret)]){reset();responseMedia='text/event-stream';responseRaw=start+block+delta(body.slice(0,Math.ceil(body.length/2)))+delta(body.slice(Math.ceil(body.length/2)))+close+finish('end_turn');const value=await v2();assert.equal(value.state,'failed');assert.equal(value.diagnostic.safety_subcause,'credential_match');assert.equal(value.text,null);assert.equal(value.partial_text,null);assert.equal(value.raw_partial_response,null);}
for(const [raw,expected] of [[start+block+delta('unfinished')+close,'eof_without_message_stop'],[start+block+delta('unfinished')+'event: content_block_delta\ndata: {','incomplete_frame_at_eof']]){reset();responseMedia='text/event-stream';responseRaw=raw;const value=await v2();assert.equal(value.state,'failed');assert.equal(value.diagnostic.eof_received,true);assert.equal(value.diagnostic.transport_subcause,expected);assert.equal(value.diagnostic.safety_subcause,'stream_incomplete');assert.equal(value.partial_text,null);assert.equal(value.raw_partial_response,null);}
reset();responseMedia='text/event-stream';responseRaw=new Uint8Array([0xc3,0x28]);const invalidV2=await v2();assert.equal(invalidV2.diagnostic.safety_subcause,'invalid_utf8');assert.equal(invalidV2.partial_text,null);
reset();responseMedia='text/event-stream';responseRaw=sse('safe complete');const completeV2=await v2();assert.equal(completeV2.text,'safe complete');assert.equal(completeV2.raw_response,null);
console.log('PASS future buffered_v2 provider: exact split Unicode, private final author-only text, source/EOF/subcause diagnostics, true raw/Unicode/percent credentials blocked, invalid UTF8, legacy fields unchanged, real fee/network0');

for(const extra of [{debug:unicode(secret)},{content:[{type:'thinking',thinking:unicode(secret)},{type:'text',text:'safe body'}]}]){reset();responseMedia='application/json';responseRaw=response(extra);const value=await v2();assert.equal(value.state,'failed');assert.equal(value.diagnostic.response_suppressed,true);assert.equal(value.text,null);assert.equal(value.partial_text,null);assert.equal(value.raw_response,null);}
for(const stop of ['max_tokens','refusal','tool_use']){reset();responseMedia='text/event-stream';responseRaw=sse('safe stopped',stop);const value=await v2();assert.equal(value.state,'failed');assert.equal(value.diagnostic.code,stop==='max_tokens'?'output_truncated':'stop_reason_unknown');assert.equal(value.diagnostic.safety_subcause,null);assert.equal(value.diagnostic.transport_subcause,'completed_output_rejected');assert.equal(value.diagnostic.stop_reason,stop);assert.equal(value.diagnostic.message_stop_received,true);assert.equal(value.diagnostic.eof_received,true);assert.equal(value.diagnostic.incomplete_frame,false);assert.equal(value.partial_text,null);assert.equal(value.raw_response,null);}
console.log('PASS independent V74 followups: full JSON metadata/thinking credential gate retained; complete safe EOF output rejection keeps real stop reason without fake stream-incomplete or retry');

// Closed capability diagnostics retain the original public message, never raw exception values.
for(const [name,code] of [['TimeoutError','capability_metadata_timeout'],['AbortError','capability_metadata_unconfirmed'],['TypeError','capability_metadata_unconfirmed'],['ProviderPrivateError','capability_metadata_unconfirmed']]){reset();configuration.model=model;thrownName=name;await assert.rejects(c.readClaudeOutputCapability('owner',model),error=>{assert.equal(error.editorial_binding_code,code);assert.equal(error.message,c.CLAUDE_OUTPUT_CAPABILITY_UNCONFIRMED);clean({message:error.message,stage:error.editorial_binding_stage,code:error.editorial_binding_code});return true;});assert.equal(requests.length,1);assert.equal(requests[0].options.method,'GET');assert.deepEqual(timeouts,[20000]);}
reset();settingsMode='invalid-secret';await assert.rejects(c.readClaudeOutputCapability('owner',model),error=>error.editorial_binding_code==='provider_configuration_unconfirmed'&&error.message===c.CLAUDE_OUTLINE_CONFIGURATION_CHANGED);assert.equal(requests.length,0);console.log('PASS capability timeout/config/unconfirmed closed diagnostics; exactly one GET or zero config-denied fetches, no messages call or raw error leak');

// Virtual time proves the trusted V3 deadline without waiting or using a provider.
for(const bad of [299999,1800001,NaN,Infinity,900000.5,'900000',null]){reset();await assert.rejects(v2({providerTimeoutMs:bad}),e=>e.message===c.CLAUDE_OUTLINE_INPUT_INVALID);assert.equal(requests.length,0);}
reset();await assert.rejects(c.requestOutlineClaudeOnce('owner',snapshot,[token],undefined,undefined,{providerTimeoutMs:900000}),e=>e.message===c.CLAUDE_OUTLINE_INPUT_INVALID);assert.equal(requests.length,0);
reset();responseMedia='text/event-stream';virtualClock=0;virtualMode='complete';const oldBound=await v2();assert.equal(oldBound.state,'failed');assert.equal(oldBound.diagnostic.code,'timeout');assert.equal(oldBound.diagnostic.response_suppressed,true);assert.equal(oldBound.diagnostic.provider_timeout_ms,300000);assert.equal(oldBound.diagnostic.provider_deadline_fired,true);assert.equal(oldBound.partial_text,null);assert.equal(oldBound.raw_partial_response,null);assert.deepEqual(timeouts,[300000]);assert.equal(requests.length,1);
reset();responseMedia='text/event-stream';virtualClock=0;virtualMode='complete';const beyond300=await v2({providerTimeoutMs:900000});assert.equal(beyond300.state,'completed');assert.equal(beyond300.text,'合成安全正文');assert.equal(beyond300.diagnostic.elapsed_ms,500000);assert.equal(beyond300.diagnostic.provider_timeout_ms,900000);assert.equal(beyond300.diagnostic.provider_deadline_fired,false);assert.equal(beyond300.diagnostic.message_stop_received,true);assert.equal(beyond300.diagnostic.eof_received,true);assert.deepEqual(timeouts,[900000]);assert.equal(requests.length,1);assert.deepEqual(JSON.parse(requests[0].options.body),{model:snapshot.model,max_tokens:snapshot.max_output_tokens,stream:true,system:snapshot.system_prompt,messages:[{role:'user',content:snapshot.user_prompt}]});
for(const mode of ['deadline','cancel']){reset();responseMedia='text/event-stream';virtualClock=0;virtualMode=mode;virtualCaller=new AbortController();const value=await v2({providerTimeoutMs:900000,signal:virtualCaller.signal});assert.equal(value.state,'failed');assert.equal(value.diagnostic.code,mode==='deadline'?'timeout':'aborted');assert.equal(value.diagnostic.transport_subcause,mode==='deadline'?'timeout':'cancelled');assert.equal(value.diagnostic.safety_subcause,'stream_incomplete');assert.equal(value.diagnostic.response_suppressed,true);assert.equal(value.diagnostic.provider_deadline_fired,mode==='deadline');assert.equal(value.diagnostic.message_stop_received,false);assert.equal(value.diagnostic.eof_received,false);for(const field of ['text','partial_text','raw_response','raw_partial_response','returned_model'])assert.equal(value[field],null);assert.equal(requests.length,1);}
for(const cause of ['credential_match','incomplete_escape','protocol_invalid']){reset();responseMedia='text/event-stream';virtualClock=0;virtualMode='deadline';bodyPrefix=cause==='credential_match'?start+block+delta(secret)+close:cause==='incomplete_escape'?start+block+delta('\\u4')+close:start+block+event('future_event',{metadata:{secret:'syntheticlongvalue'}});if(cause==='protocol_invalid')bodyPrefix=start+block+event('content_block_delta',{index:1,delta:{type:'text_delta',text:'bad index'}});const value=await v2({providerTimeoutMs:900000});assert.equal(value.state,'failed');assert.equal(value.diagnostic.code,'unsafe_response');assert.equal(value.diagnostic.safety_subcause,cause);assert.equal(value.diagnostic.response_suppressed,true);assert.equal(value.partial_text,null);assert.equal(value.raw_partial_response,null);assert.equal(requests.length,1);}
const streamInspection=load('stream-credential-buffer'),originalStreamInspection=streamInspection.inspectStreamCredentialValue;streamInspection.inspectStreamCredentialValue=(value,known,options)=>{const result=originalStreamInspection(value,known,options);if(inspectionRaceCause&&((inspectionRaceCause==='protocol_invalid'&&value?.type==='content_block_delta'&&value.index===1)||(inspectionRaceCause==='budget_exceeded'&&result.subcause==='budget_exceeded'))){inspectionRaceCause='';advance(900000);}return result;};
for(const cause of ['invalid_utf8','protocol_invalid','budget_exceeded']){reset();responseMedia='text/event-stream';virtualClock=0;virtualMode='deadline';abortDuringDecode=cause==='invalid_utf8';virtualInvalidBytes=cause==='invalid_utf8';inspectionRaceCause=cause==='invalid_utf8'?'':cause;if(cause==='protocol_invalid')bodyPrefix=start+block+event('content_block_delta',{index:1,delta:{type:'text_delta',text:'wrong block'}});if(cause==='budget_exceeded')bodyPrefix=start+block+event('future_event',{metadata:Array.from({length:21000},()=>0)});const value=await v2({providerTimeoutMs:900000});assert.equal(value.state,'failed');assert.equal(value.diagnostic.code,'unsafe_response');assert.equal(value.diagnostic.safety_subcause,cause);assert.equal(value.diagnostic.provider_deadline_fired,true);assert.equal(value.diagnostic.response_suppressed,true);assert.equal(value.partial_text,null);assert.equal(value.raw_partial_response,null);assert.equal(requests.length,1);}
const diagnostics=(()=>{const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/editorial-receipt-diagnostics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});return exports;})();
for(const values of [{provider_timeout_ms:900000,provider_deadline_fired:true},{provider_timeout_ms:secret,provider_deadline_fired:secret},{provider_timeout_ms:299999,provider_deadline_fired:1},{provider_timeout_ms:1800001,provider_deadline_fired:{private:secret}}]){const projected=diagnostics.editorialReceiptDiagnostics({diagnostic:{inspection_version:'buffered_v2',...values}});clean(projected);assert.equal(projected.diagnostic.provider_timeout_ms,values.provider_timeout_ms===900000?900000:null);assert.equal(projected.diagnostic.provider_deadline_fired,values.provider_deadline_fired===true?true:null);}
console.log('PASS virtual V3 deadline: >300s completes exactly once under trusted900s;900s expiry/cancel remain suppressed failed; hard safety causes keep unsafe precedence; invalid/legacy overrides denied; exact payload/hash-equivalent body and typed deadline diagnostics, 0 real provider/network.');
