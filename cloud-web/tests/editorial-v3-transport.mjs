// Every runtime, DB and fetch here is an in-memory mock. No paid/model/network call.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import Module from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const root = process.cwd(), native = Module.createRequire(root + '/package.json');
const uuid = n => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const run = uuid(1), token = uuid(3), hash = 'a'.repeat(64), model = 'claude-synthetic-transport';
const args = {run_id: run, stage_id: 'outline_revision:3', token, expected_model: model, expected_input_sha256: hash, confirm: true};
const clone = value => JSON.parse(JSON.stringify(value));
const defer = () => {let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {promise, resolve, reject};};
const turns = async () => {for (let i = 0; i < 50; i++) await Promise.resolve();};
const json = (value, status = 200) => Response.json(value, {status});
const view = () => ({run_id: run, writer: 'claude', writer_kind: 'claude', state: 'outline_review', round: 3, snapshot_sha256: hash, control_state: 'active', current_version: {article: {title: '合成传输测试标题', paragraphs: ['完整首段。', '完整末段。']}, sha256: hash, version: 3}, final_sha256: null, stages: {[args.stage_id]: {state: 'completed', input_sha256: hash}}, artifacts: {}});
const globals = {Request, Response, URL, ReadableStream, TextDecoder, TextEncoder, Uint8Array, AbortController, AbortSignal, Date, Error, Object, JSON, console: {info() {}}};
let preparations = 0, executions = 0, reads = 0, providerMock = 0, durableComplete = false, hold = null, result = {state: 'completed', saved: true};
const intervals = new Map(); let intervalId = 0;
const runtimeCalls = [];
const noFailedWriterGrant=async()=>{throw Error('No generic failed-writer grant in this transport fixture');};
const runtime = new Proxy({
 previewEditorialV3FailedWriterContinuation:noFailedWriterGrant,authorizeEditorialV3FailedWriterContinuation:noFailedWriterGrant,
 editorialV3PublicError(error) {const message = error instanceof Error ? error.message : ''; return /Bearer|SQLITE_|sk-synthetic/i.test(message) ? '状态待核验；只读同一收据' : message || '状态待核验；只读同一收据';},
 async readEditorialV3(owner, input) {reads++; runtimeCalls.push({name: 'readEditorialV3', owner, input}); return view();},
 async prepareEditorialV3Stage(owner, input) {preparations++; if (input.confirm !== true || input.token !== token || input.expected_model !== model || input.expected_input_sha256 !== hash || input.run_id !== run || input.stage_id !== args.stage_id) throw Error('绑定未通过'); return {owner, input};},
 async executeEditorialV3Stage(prepared) {executions++; if (hold) await hold.promise; providerMock++; durableComplete = true; return {...result, run_id: prepared.input.run_id, stage_id: prepared.input.stage_id};},
}, {get(target, name) {return name in target ? target[name] : async (owner, input, state) => {runtimeCalls.push({name, owner, input, state}); return {saved: true, source: name};};}});
function loadRoute(file, extra = {}) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {...globals,
  setInterval(fn, delay) {const id = ++intervalId; intervals.set(id, {fn, delay}); return id;}, clearInterval(id) {intervals.delete(id);}, exports,
  require(name) {
   if (name.endsWith('/test-store')) return {owner: r => r.headers.get('oai-authenticated-user-id'), list: async () => []};
   if (name.endsWith('/editorial-v3-runtime')) return runtime;
   if (name.endsWith('/editorial-failed-writer-continuation-v3')) return {editorialFailedWriterContinuationPublicError:()=> '未授权失败主笔新增调用'};
   if (extra[name]) return extra[name];
   if (name.endsWith('/legacy-generation')) return {retiredGenerationNames: new Set(), legacyGenerationNotice: {}};
   return new Proxy({}, {get(_t, key) {if (String(key).endsWith('Tools')) return []; if (String(key).endsWith('Event')) return {name: 'mock.event'}; if (key === 'TopicResearchError' || key === 'ArticleDeletionError') return Error; return async () => ({});}});
  }, fetch() {throw Error('Real network forbidden');},
 });
 return exports;
}
const route = loadRoute('app/api/claude/editorial-v3-run/route.ts');
const req = (body = args, headers = {}) => new Request('https://site.test/api/claude/editorial-v3-run', {method: 'POST', headers: {origin: 'https://site.test', 'content-type': 'application/json', accept: 'application/x-ndjson', 'x-xiaoyu-editorial-v3-run': '1', 'oai-authenticated-user-id': 'synthetic-owner', ...headers}, body: typeof body === 'string' ? body : JSON.stringify(body)});
for (const [headers, status] of [[{'oai-authenticated-user-id': ''}, 401], [{origin: 'https://other.test'}, 403], [{origin: ''}, 403], [{'x-xiaoyu-editorial-v3-run': '0'}, 403], [{accept: 'application/json'}, 403], [{accept: ''}, 403]]) assert.equal((await route.POST(req(args, headers))).status, status);
assert.equal(preparations, 0); assert.equal(executions, 0);
for (const body of ['{', '[]', 'null', {...args, confirm: false}, {...args, prompt: 'never accept caller prompt'}, {...args, stage: 'outline'}, {run_id: run}]) assert.equal((await route.POST(req(body))).status, 400);
for (const headers of [{'content-length': '8001'}, {'content-length': 'NaN'}]) assert.equal((await route.POST(req(args, headers))).status, 400);
assert.equal((await route.POST(req({...args, expected_input_sha256: 'b'.repeat(64)}))).status, 400);
assert.equal((await route.POST(req(' '.repeat(8001)))).status, 400);
const utf8Oversized = '{"padding":"' + '汉'.repeat(3000) + '"}'; assert.ok(utf8Oversized.length < 8000); assert.equal((await route.POST(req(utf8Oversized))).status, 400);
assert.equal(executions, 0);
const invalidUtf8 = new Request('https://site.test/api/claude/editorial-v3-run', {method: 'POST', headers: req().headers, body: new Uint8Array([123, 34, 0xff, 34, 125])}); assert.equal((await route.POST(invalidUtf8)).status, 400);
console.log('PASS owner/same-origin/helper-only NDJSON accept, bounded measured UTF-8 body, exact fields/confirmation and model/hash preparation fences; no mock execution before approval.');

hold = defer(); durableComplete = false;
const response = await route.POST(req());
assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /application\/x-ndjson/); assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('x-accel-buffering'), 'no');
const reader = response.body.getReader(), decode = b => JSON.parse(new TextDecoder().decode(b));
const running = decode((await reader.read()).value); assert.equal(running.type, 'running'); assert.equal(running.run_id, run); assert.equal(running.stage_id, args.stage_id); assert.ok(!JSON.stringify(running).includes(token));
assert.equal(intervals.size, 1); assert.equal([...intervals.values()][0].delay, 10000); [...intervals.values()][0].fn(); assert.equal(decode((await reader.read()).value).type, 'running');
hold.resolve(); const terminal = decode((await reader.read()).value); assert.equal(terminal.success, true); assert.equal(terminal.terminal, true); assert.equal(terminal.stage_id, args.stage_id); assert.equal((await reader.read()).done, true); assert.equal(intervals.size, 0); assert.equal(durableComplete, true); assert.ok(providerMock > 0, 'synthetic execution completed');
reader.releaseLock(); hold = null;
result = {state: 'unknown', saved: false, error: token}; const unknown = await route.POST(req()); const unknownText = await unknown.text(); assert.ok(!unknownText.includes(token)); assert.equal(JSON.parse(unknownText.trim().split('\n').at(-1)).success, false);
result = {state: 'failed', saved: false, error: 'Bearer sk-synthetic-never-display'}; assert.ok(!(await (await route.POST(req())).text()).includes('sk-synthetic'));
const initialExec = runtime.executeEditorialV3Stage; runtime.executeEditorialV3Stage = async () => {throw Error('SQLITE_ERROR unsafe');}; const thrown = JSON.parse((await (await route.POST(req())).text()).trim().split('\n').at(-1)); assert.equal(thrown.state, 'unknown'); assert.equal(thrown.success, false); assert.ok(!thrown.error.includes('SQLITE_')); runtime.executeEditorialV3Stage = initialExec;
result = {state: 'completed', saved: false}; assert.equal(JSON.parse((await (await route.POST(req())).text()).trim().split('\n').at(-1)).success, false);
hold = defer(); durableComplete = false; const cancelled = await route.POST(req()), cancelReader = cancelled.body.getReader(); await cancelReader.read(); await cancelReader.cancel(); assert.equal(intervals.size, 0); assert.equal(durableComplete, false); hold.resolve(); await turns(); assert.equal(durableComplete, true, 'transport cancel never cancels mocked durable execution'); cancelReader.releaseLock(); hold = null;
console.log('PASS immediate and ten-second progress, complete dynamic bound terminal, saved-only success, safe errors, cleaned heartbeat and disconnect keeps same durable execution alive.');
const beforeReads = executions;
assert.equal((await route.GET(new Request('https://site.test/api/claude/editorial-v3-run?run_id=' + run))).status, 401);
for (const query of ['', '?run_id=' + run + '&stage_id=1', '?run_id=' + run + '&run_id=' + run]) assert.equal((await route.GET(new Request('https://site.test/api/claude/editorial-v3-run' + query, {headers: {'oai-authenticated-user-id': 'synthetic-owner'}}))).status, 400);
assert.equal((await route.GET(new Request('https://site.test/api/claude/editorial-v3-run?run_id=' + run, {headers: {'oai-authenticated-user-id': 'synthetic-owner'}}))).status, 200); assert.equal(executions, beforeReads); assert.equal(reads, 1);

const authorityDefinitions = loadRoute('lib/editorial-authority-v3.ts').editorialAuthorityV3Tools;
const authorityCalls = [];
const mcp = loadRoute('app/mcp/route.ts', {'../../lib/mcp-sse-probe': loadRoute('lib/mcp-sse-probe.ts'), '../../lib/editorial-authority-v3': {
 editorialAuthorityV3Tools: authorityDefinitions,
 async editorialAuthorityV3Call(owner, name, input) {authorityCalls.push({owner, name, input}); return {read_only: true, name};},
 editorialAuthorityV3PublicError: () => '新授权状态待核验',
}});
const rpc = (method, params, owner = 'synthetic-owner') => new Request('https://site.test/mcp', {method: 'POST', headers: {'content-type': 'application/json', ...(owner ? {'oai-authenticated-user-id': owner} : {})}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
const tools = (await (await mcp.POST(rpc('tools/list'))).json()).result.tools;
const names = tools.map(tool => tool.name), expected = ['read_editorial_v3', 'initialize_editorial_v3', 'claim_editorial_v3_stage', 'save_agent_editorial_v3_stage', 'save_editorial_v3_review', 'recover_editorial_v3_stage', 'freeze_editorial_v3', 'dispatch_editorial_v3', 'archive_editorial_v3', 'restore_editorial_v3', 'pause_editorial_v3'];
for (const name of expected) assert.ok(names.includes(name), name + ' discovered');
const authorityNames = ['create_editorial_authority_v3', 'read_editorial_authority_v3', 'start_editorial_run_v3', 'read_editorial_run_v3', 'revoke_editorial_authority_v3'];
for (const name of authorityNames) assert.ok(names.includes(name), name + ' actual authority schema discovered');
assert.ok(!names.some(name => /(?:execute|run|prepare).*editorial_v3/.test(name)), 'no short paid execution tool');
for (const tool of tools.filter(t => expected.includes(t.name))) {assert.equal(tool.inputSchema.additionalProperties, false); if ('stage_id' in tool.inputSchema.properties) assert.ok(!tool.inputSchema.properties.stage_id.enum, 'dynamic ID has no fixed stage enum');}
assert.equal(tools.find(t => t.name === 'read_editorial_v3').annotations.readOnlyHint, true);
for (const field of ['topic', 'angle', 'style_requirements']) assert.ok(tools.find(t => t.name === 'initialize_editorial_v3').inputSchema.required.includes(field));
assert.ok(tools.find(t => t.name === 'save_agent_editorial_v3_stage').inputSchema.required.includes('token'));
const callsBefore = runtimeCalls.length;
assert.equal((await mcp.POST(rpc('tools/call', {name: 'claim_editorial_v3_stage', arguments: {}}, ''))).status, 401); assert.equal(runtimeCalls.length, callsBefore);
for (const name of expected) {
 const input = name.includes('save_') ? {...args, expected_snapshot_sha256: hash, actor_id: uuid(20), execution_id: uuid(21), model: 'genuine-synthetic-agent', raw_result: '{"actual":"result"}'} : {run_id: run, confirm: true};
 const result = (await (await mcp.POST(rpc('tools/call', {name, arguments: input}))).json()).result;
 assert.ok(!result.isError, name + ' routes'); assert.equal(runtimeCalls.at(-1).owner, 'synthetic-owner'); assert.deepEqual(clone(runtimeCalls.at(-1).input), input);
}
assert.equal(runtimeCalls.find(call => call.state === 'archived').name, 'setEditorialV3Control'); assert.ok(runtimeCalls.some(call => call.state === 'paused')); assert.ok(runtimeCalls.some(call => call.state === 'active'));
// The new generic scope is absent here; fallback proxies must never fake approval.
for(const name of ['preview_editorial_failed_writer_continuation_v3','authorize_editorial_failed_writer_continuation_v3']){const out=(await (await mcp.POST(rpc('tools/call',{name,arguments:{run_id:run}}))).json()).result;assert.equal(out.isError,true);assert.equal(out.content[0].text,'未授权失败主笔新增调用');}
const beforeForbidden = executions; assert.equal((await (await mcp.POST(rpc('tools/call', {name: 'execute_editorial_v3_stage', arguments: args}))).json()).error.code, -32601); assert.equal(executions, beforeForbidden);
for (const name of authorityNames) {
 const input = {run_id: run, confirm: true};
 assert.ok(!(await (await mcp.POST(rpc('tools/call', {name, arguments: input}))).json()).result.isError);
 assert.equal(authorityCalls.at(-1).name, name); assert.equal(authorityCalls.at(-1).owner, 'synthetic-owner'); assert.deepEqual(clone(authorityCalls.at(-1).input), input);
}
assert.equal(executions, beforeForbidden, 'authority integration does not execute a provider');
console.log('PASS V3 MCP authenticated discovery + real-save routing, dynamic stage IDs, distinct agent writer/review APIs, reversible controls, and no short-connection Claude execution surface.');

function clientHarness(realReact = false) {
 const slots = [], effects = [], timers = new Map(), listeners = new Map(), calls = [], storage = new Map();
 let cursor = 0, dirty = false, tree, timerId = 0, stopped = false;
 let fetcher = async () => {throw Error('Real fetch forbidden');};
 const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
 const hooks = {...React,
  useState(initial) {const i = cursor++; if (!slots[i]) slots[i] = {value: typeof initial === 'function' ? initial() : initial}; return [slots[i].value, next => {slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; dirty = true;}];},
  useRef(initial) {return slots[cursor++] ??= {current: initial};},
  useCallback(fn, deps) {const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = {deps, value: fn}; return slots[i].value;},
  useEffect(fn, deps) {const i = cursor++, old = slots[i]; if (!old || !same(old.deps, deps)) {slots[i] = {deps, cleanup: old?.cleanup}; effects.push(() => {slots[i].cleanup?.(); slots[i].cleanup = fn();});}},
 };
 const cache = new Map();
 function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file); mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file)); cache.set(file, mod);
  mod.require = name => {
   if (name === 'react') return realReact ? React : hooks;
   if (name.endsWith('/chatgpt-auth')) return {requireChatGPTUser: async returnTo => {calls.push({auth: returnTo}); return {userId: 'synthetic-owner'};}};
   if (name.startsWith('.')) for (const suffix of ['', '.ts', '.tsx']) {const dest = path.resolve(path.dirname(file), name) + suffix; if (fs.existsSync(dest) && fs.statSync(dest).isFile()) return load(dest);}
   return native(name);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true}}).outputText, file); return mod.exports;
 }
 const exported = load(root + '/components/editorial-v3-helper.tsx');
 const window = {location: {search: ''}, setTimeout(fn) {const id = ++timerId; timers.set(id, fn); return id;}, clearTimeout(id) {timers.delete(id);}, addEventListener(name, fn) {if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn);}, removeEventListener(name, fn) {listeners.get(name)?.delete(fn);}, localStorage: {setItem(k, v) {storage.set(k, v);}}, sessionStorage: {setItem(k, v) {storage.set(k, v);}}};
 global.window = window; global.fetch = async (url, options = {}) => {calls.push({url, options, body: options.body ? JSON.parse(options.body) : null}); return fetcher(url, options);};
 const render = () => {if (stopped) return; cursor = 0; dirty = false; tree = exported.default({ownerScope: 'synthetic-owner'}); for (const effect of effects.splice(0)) effect();};
 const flush = async () => {for (let i = 0; i < 100; i++) {await Promise.resolve(); if (dirty) render();}};
 const text = value => value == null || typeof value === 'boolean' ? '' : Array.isArray(value) ? value.map(text).join('') : typeof value === 'object' ? text(value.props?.children) : String(value);
 const nodes = () => {const found = []; const walk = value => {if (!value || typeof value !== 'object') return; if (Array.isArray(value)) return value.forEach(walk); if (value.type) {found.push(value); walk(value.props.children);}}; walk(tree); return found;};
 const field = name => {const node = nodes().find(node => node.props.name === name); assert.ok(node, 'field exists: ' + name); return node;};
 return {exported, load, window, calls, storage, text, flush, render, nodes, field,
  async change(name, value) {const node = field(name); assert.ok(!node.props.disabled); node.props.onChange({target: node.props.type === 'checkbox' ? {checked: value} : {value}}); await flush();},
  submit(repeat = false) {const form = nodes().find(node => node.type === 'form'), event = {preventDefault() {}}; const pending = form.props.onSubmit(event); if (repeat) void form.props.onSubmit(event); return pending;},
  setFetch(fn) {fetcher = fn;}, async start(id = '') {window.location.search = id ? '?run_id=' + id : ''; render(); for (const [id, fn] of [...timers]) {timers.delete(id); fn();} await flush();}, async event(name) {for (const fn of listeners.get(name) || []) fn(); await flush();}, async stop() {stopped = true; for (const slot of slots) slot?.cleanup?.(); await turns();}, get tree() {return tree;}};
}
const originalFetch = global.fetch, originalWindow = global.window;
const ndjson = (extra = {}) => new Response(JSON.stringify({type: 'running', run_id: run, stage_id: args.stage_id, seconds: 0}) + '\n' + JSON.stringify({type: 'terminal', terminal: true, run_id: run, stage_id: args.stage_id, success: true, state: 'completed', ...extra}) + '\n', {headers: {'content-type': 'application/x-ndjson'}});
try {
 const source = fs.readFileSync('components/editorial-v3-helper.tsx', 'utf8');
 assert.doesNotMatch(source, /localStorage|sessionStorage|crypto\.randomUUID|<textarea|console\.|setInterval/);
 assert.match(source, /readDailyNdjson\(response\.body/); assert.match(source, /attempted\.current\.add\(key\)/); assert.match(source, /connection\.current\?\.abort\(\)/);
 const ssr = clientHarness(true), markup = renderToStaticMarkup(React.createElement(ssr.exported.default, {ownerScope: 'synthetic-owner'}));
 assert.match(markup, /长连接执行进度/); assert.match(markup, /助手专用已授权阶段入口/); assert.match(markup, /type="password"/); assert.doesNotMatch(markup, /<input[^>]+checked|<textarea/); assert.equal(ssr.calls.length, 0);
 const page = ssr.load(root + '/app/writing/editorial-v3-helper/page.tsx'); const element = await page.default(); assert.equal(page.dynamic, 'force-dynamic'); assert.equal(element.props.ownerScope, 'synthetic-owner'); assert.equal(ssr.calls[0].auth, '/writing/editorial-v3-helper'); await ssr.stop();
 let h = clientHarness(), pending = defer(), paid = 0;
 h.setFetch(async (url, options) => {if (options.method === 'POST') {paid++; return pending.promise;} return json(view());});
 await h.start(run); assert.equal(paid, 0); assert.ok(h.window.xiaoyuEditorialV3); assert.equal(h.calls.length, 1, 'mount only reads');
 for (const bad of [{...args, confirm: false}, {...args, stage_id: ''}, {...args, token: ''}, {...args, expected_input_sha256: ''}, {...args, prompt: 'forbidden'}]) await assert.rejects(h.window.xiaoyuEditorialV3.runPaidStage(bad));
 assert.equal(paid, 0);
 const first = h.window.xiaoyuEditorialV3.runPaidStage(args); await h.flush(); await assert.rejects(h.window.xiaoyuEditorialV3.runPaidStage(args)); assert.equal(paid, 1);
 const call = h.calls.find(c => c.options.method === 'POST'); assert.deepEqual(call.body, args); assert.equal(call.options.headers['x-xiaoyu-editorial-v3-run'], '1'); assert.equal(call.options.headers.accept, 'application/x-ndjson');
 assert.ok(!h.text(h.tree).includes(token)); assert.equal(h.storage.size, 0); pending.resolve(ndjson()); const finished = await first; await h.flush(); assert.equal(finished.success, true); assert.match(h.text(h.tree), /本阶段确切产物已保存/); assert.match(h.text(h.tree), /outline_revision:3/); assert.ok(!JSON.stringify(finished).includes(token));
 await assert.rejects(h.window.xiaoyuEditorialV3.runPaidStage(args)); assert.equal(paid, 1); await h.stop(); assert.equal(h.window.xiaoyuEditorialV3, undefined);
 console.log('PASS authenticated assistant-only helper SSR/mount, volatile winner token, dynamic model/hash forwarding, same-tick/in-flight/same-stage duplicate lock and no automatic next stage.');

 h = clientHarness(); paid = 0; pending = defer();
 h.setFetch(async (_url, options) => options.method === 'POST' ? (paid++, pending.promise) : json(view())); await h.start(run);
 assert.equal(h.field('token').props.type, 'password'); assert.equal(h.field('token').props.autoComplete, 'off'); assert.equal(h.field('token').props.value, ''); assert.equal(h.field('confirm').props.checked, false);
 for (const [name, value] of Object.entries(args)) if (name !== 'confirm') await h.change(name, value);
 assert.equal(paid, 0, 'filling the normal assistant form never requests provider');
 await h.submit(); await h.flush(); assert.equal(paid, 0, 'unchecked authorization never submits paid call'); assert.equal(h.field('token').props.value, '');
 await h.change('token', token); await h.change('confirm', true);
 const formPending = h.submit(true); await h.flush(); assert.equal(paid, 1); assert.equal(h.field('token').props.disabled, true); assert.equal(h.storage.size, 0);
 const normalPost = h.calls.find(call => call.options.method === 'POST'); assert.deepEqual(normalPost.body, args); assert.equal(normalPost.options.headers.accept, 'application/x-ndjson');
 assert.ok(h.nodes().filter(node => node.props.value === token).every(node => node.type === 'input' && node.props.type === 'password'), 'token occurs only in the necessary masked memory form');
 pending.resolve(ndjson()); await formPending; await h.flush(); assert.equal(h.field('token').props.value, ''); assert.equal(h.field('confirm').props.checked, false); assert.match(h.text(h.tree), /本阶段确切产物已保存/);
 await h.change('token', token); await h.change('confirm', true); await h.submit(); await h.flush(); assert.equal(paid, 1, 'GUI cannot paid retry same stage'); assert.equal(h.field('token').props.value, ''); await h.stop();
 console.log('PASS normal fill+submit assistant GUI runs the exact NDJSON paid route once; unchecked consent/fill/double-submit/re-entry cannot retry, token is password-masked and cleared after terminal.');

 for (const state of ['failed', 'unknown', 'technical_failed', 'content_invalid']) {
  h = clientHarness(); paid = 0; h.setFetch(async (_url, options) => options.method === 'POST' ? (paid++, ndjson({state, success: false, error: token})) : json(view())); await h.start();
  const terminal = await h.window.xiaoyuEditorialV3.runPaidStage(args); await h.flush(); assert.equal(terminal.success, false); assert.ok(!JSON.stringify(terminal).includes(token)); assert.ok(!h.text(h.tree).includes(token)); await assert.rejects(h.window.xiaoyuEditorialV3.runPaidStage(args)); assert.equal(paid, 1); await h.stop();
 }
 for (const malformed of [new Response('{"type":"running","run_id":"' + run + '","stage_id":"' + args.stage_id + '"}\n', {headers: {'content-type': 'application/x-ndjson'}}), ndjson({stage_id: 'another-round'}), ndjson({run_id: uuid(9)}), new Response('{}', {headers: {'content-type': 'application/json'}})]) {
  h = clientHarness(); paid = 0; h.setFetch(async (_url, options) => options.method === 'POST' ? (paid++, malformed) : json(view())); await h.start(); await assert.rejects(h.window.xiaoyuEditorialV3.runPaidStage(args)); await assert.rejects(h.window.xiaoyuEditorialV3.runPaidStage(args)); assert.equal(paid, 1); await h.stop();
 }
 h = clientHarness(); paid = 0; h.setFetch(async (_url, options) => {if (options.method !== 'POST') return json(view()); paid++; throw Error('Bearer sk-synthetic-unsafe');}); await h.start(); await assert.rejects(h.window.xiaoyuEditorialV3.runPaidStage(args), error => !error.message.includes('sk-synthetic')); await h.flush(); assert.ok(!h.text(h.tree).includes('sk-synthetic')); await assert.rejects(h.window.xiaoyuEditorialV3.runPaidStage(args)); assert.equal(paid, 1); await h.stop();
 console.log('PASS failed/unknown/content-invalid/truncated/mismatched/wrong-type responses never paid-retry; echoed token and unsafe error do not reach DOM or helper result.');

 h = clientHarness(); paid = 0; h.setFetch(async (_url, options) => options.method === 'POST' ? (paid++, json({error: 'login required'}, 401)) : json(view())); await h.start(run); await assert.rejects(h.window.xiaoyuEditorialV3.runPaidStage(args)); await h.flush(); assert.match(h.text(h.tree), /重新登录/); assert.doesNotMatch(h.text(h.tree), /合成传输测试标题/); await assert.rejects(h.window.xiaoyuEditorialV3.runPaidStage({...args, stage_id: 'body:4'})); assert.equal(paid, 1); await h.stop();
 h = clientHarness(); paid = 0; let aborts = 0;
 h.setFetch(async (_url, options) => {if (options.method !== 'POST') return json(view()); paid++; return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => {aborts++; reject(Error('connection aborted'));}, {once: true}));});
 await h.start(run); const navigationPending = h.window.xiaoyuEditorialV3.runPaidStage(args); await h.flush(); const rejected = assert.rejects(navigationPending); h.window.location.search = ''; await h.event('popstate'); await rejected; await h.flush(); assert.equal(aborts, 1); assert.equal(paid, 1); assert.doesNotMatch(h.text(h.tree), /合成传输测试标题/); assert.match(h.text(h.tree), /不代表后台请求已经取消/); await assert.rejects(h.window.xiaoyuEditorialV3.runPaidStage(args)); await h.stop();
 console.log('PASS auth interruption clears prior artifacts and prevents more paid execution; navigation aborts transport only, hides stale results and never represents durable cancellation.');
} finally {global.fetch = originalFetch; if (originalWindow === undefined) delete global.window; else global.window = originalWindow;}
console.log('PASS editorial V3 transport suite: offline mocks only; no paid provider, production state or network.');
