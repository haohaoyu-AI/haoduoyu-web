// Entirely offline. UI requests use in-memory fetch stubs; no live calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const root = process.cwd(), requireRoot = Module.createRequire(root + '/package.json');
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => {let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {promise, resolve, reject};};
const response = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'content-type': 'application/json'}});
const id = number => `${String(number).padStart(8, '0')}-0000-4000-8000-000000000000`;
const makeRequest = (state = 'queued', request_id = id(1)) => ({request_id, state, dispatch_state: 'pending', flow_id: null, progress: [], article: null, sources: [], final_sha256: null, error: null, created: '2026-10-06T00:00:00Z', topic: '本次公开文娱选题'});
const makeSummary = current => ({configured: true, model: 'claude-exact-current-model', prompt_version: '好多鱼 V2.2·完整测试版本', max_provider_requests: 4, max_output_tokens: 64000, connected: false, current, items: current ? [{request_id: current.request_id, state: current.state, topic: current.topic}] : []});
const originalFetch = global.fetch, originalWindow = global.window;

function harness({realReact = false, ownerScope = 'owner-a'} = {}) {
 const slots = [], effects = [], timers = new Map(), listeners = new Map(), calls = [];
 let cursor = 0, dirty = false, tree, ended = false, timerId = 0;
 let currentFetch = () => {throw Error('Unexpected fetch; live network is forbidden');};
 const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
 const hooks = {...React,
  useState(initial) {const i = cursor++; if (!slots[i]) slots[i] = {value: typeof initial === 'function' ? initial() : initial}; return [slots[i].value, next => {slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; dirty = true;}];},
  useRef(initial) {const i = cursor++; return slots[i] ??= {current: initial};},
  useEffect(fn, deps) {const i = cursor++, old = slots[i]; if (!old || !same(old.deps, deps)) {slots[i] = {deps, cleanup: old?.cleanup}; effects.push(() => {slots[i].cleanup?.(); slots[i].cleanup = fn();});}},
  useCallback(fn, deps) {const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = {deps, value: fn}; return slots[i].value;},
 };
 const cache = new Map();
 function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file); cache.set(file, mod); mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod.require = name => {
   if (name === 'react') return realReact ? React : hooks;
   if (name.startsWith('.')) {
    const dest = path.resolve(path.dirname(file), name);
    if (dest.endsWith('/app/chatgpt-auth')) return {requireChatGPTUser: async returnTo => {calls.push({auth: returnTo}); return {userId: ownerScope};}};
    for (const suffix of ['', '.ts', '.tsx']) if (fs.existsSync(dest + suffix) && fs.statSync(dest + suffix).isFile()) return load(dest + suffix);
   }
   if (/cloudflare|test-store|editorial-flow/.test(name)) throw Error('Forbidden server/provider dependency');
   return requireRoot(name);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true}}).outputText, file);
  return mod.exports;
 }
 const exported = load(root + '/components/editorial-request.tsx');
 const window = {
  location: {search: ''},
  get sessionStorage() {throw Error('Progress must not use browser recovery storage');},
  get localStorage() {throw Error('Progress must not use browser recovery storage');},
  setTimeout(fn, delay) {const id = ++timerId; timers.set(id, {fn, delay}); return id;}, clearTimeout(id) {timers.delete(id);},
  addEventListener(name, fn) {if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn);},
  removeEventListener(name, fn) {listeners.get(name)?.delete(fn);},
 };
 global.window = window;
 global.fetch = async (url, options = {}) => {
  assert.match(String(url), /^\/api\/writing\/editorial-request(?:\?request_id=[0-9a-f-]+)?$/);
  assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-store');
  assert.equal(options.body, undefined); assert.equal(options.headers, undefined);
  calls.push({url, options}); return currentFetch(url, options);
 };
 const props = {ownerScope};
 function render() {if (ended) return; cursor = 0; dirty = false; tree = exported.default(props); for (const effect of effects.splice(0)) effect();}
 async function flush() {for (let i = 0; i < 180; i++) {await Promise.resolve(); if (dirty) render();}}
 function nodes() {const found = []; function visit(value) {if (!value || typeof value !== 'object') return; if (Array.isArray(value)) {value.forEach(visit); return;} if (value.type) {found.push(value); visit(typeof value.type === 'function' ? value.type(value.props) : value.props.children);}} visit(tree); return found;}
 function text(value) {if (value == null || typeof value === 'boolean') return ''; if (Array.isArray(value)) return value.map(text).join(''); if (typeof value === 'object') return text(typeof value.type === 'function' ? value.type(value.props) : value.props?.children); return String(value);}
 const button = label => {const found = nodes().find(n => n.type === 'button' && text(n).includes(label)); assert.ok(found, 'button exists: ' + label); return found;};
 return {
  exported, load, props, calls, timers, nodes, text, button, render, flush,
  setFetch(fn) {currentFetch = fn;},
  async start(search = '') {window.location.search = search; render(); for (const [id, timer] of [...timers]) if (timer.delay === 0) {timers.delete(id); timer.fn();} await flush();},
  async tick(delay) {for (const [id, timer] of [...timers]) if (timer.delay === delay) {timers.delete(id); timer.fn();} await flush();},
  async navigate(search = '') {window.location.search = search; for (const fn of listeners.get('popstate') || []) fn(); await flush();},
  async owner(nextOwner) {props.ownerScope = nextOwner; render(); await flush();},
  async click(label) {const found = button(label); assert.equal(!!found.props.disabled, false); found.props.onClick?.(); await flush();},
  async event(name) {for (const fn of listeners.get(name) || []) fn(); await flush();},
  async stop() {ended = true; for (const slot of slots) slot?.cleanup?.(); await Promise.resolve();},
  get tree() {return tree;},
 };
}

const pollCount = h => [...h.timers.values()].filter(timer => timer.delay === 10000).length;
const noSetup = h => {
 assert.equal(h.nodes().some(node => ['form', 'input', 'textarea', 'select'].includes(node.type)), false);
 assert.deepEqual(h.nodes().filter(node => node.type === 'button').map(node => h.text(node)), ['刷新状态']);
 assert.doesNotMatch(h.text(h.tree), /启动配置|开始这篇文章|预算|我确认|通知连接|接收通道|完成配置|08计划|恢复同一委托通知|取消后续推进/);
};

try {
 const source = fs.readFileSync('components/editorial-request.tsx', 'utf8');
 assert.doesNotMatch(source, /\/api\/claude|\/api\/mcp|setInterval|localStorage|sessionStorage|request_key|start_preview|POST|claim_token|review_json|actor_id|JSON\.stringify|perform\(|<form|<input|<textarea/);
 assert.match(source, /method: 'GET'/);
 const ssr = harness({realReact: true});
 const html = renderToStaticMarkup(React.createElement(ssr.exported.default, {ownerScope: 'owner-a'}));
 assert.equal(ssr.calls.length, 0);
 assert.match(html, /自动写作进度|正在读取已有任务进度/);
 assert.match(html, /aria-label="主要页面"/);
 assert.doesNotMatch(html, /JSON|参与者|认领|execution_id|<form|<input|<textarea|启动配置|最多授权|设置|开始这篇文章/);
 const page = ssr.load(root + '/app/writing/editorial-run/page.tsx'), pageElement = await page.default();
 assert.equal(page.dynamic, 'force-dynamic'); assert.equal(pageElement.type, ssr.exported.default);
 assert.equal(pageElement.props.ownerScope, 'owner-a'); assert.equal(pageElement.key, 'owner-a');
 assert.equal(pageElement.props.promptVersion, undefined);
 const helper = ssr.load(root + '/app/writing/editorial-helper/page.tsx'), helperElement = await helper.default();
 assert.equal(helperElement.props.ownerScope, 'owner-a'); assert.notEqual(helperElement.type, ssr.exported.default);
 assert.deepEqual(ssr.calls.filter(call => call.auth).map(call => call.auth), ['/writing/editorial-run', '/writing/editorial-helper']);
 const writingPage = fs.readFileSync('app/writing/page.tsx', 'utf8');
 assert.match(writingPage, /href="\/writing\/editorial-run">查看自动写作进度<\/a>/);
 assert.doesNotMatch(writingPage, /开始完整写作链路/);
 assert.match(writingPage, /<StudioNav current="writing"/); assert.match(writingPage, /writing-fold writing-current-item/);
 await ssr.stop();
 console.log('PASS real React SSR creates no requests, owner-auth pages, preserved helper/navigation/fold layout and progress-only writing entry.');

 let h = harness(), summary = makeSummary(null);
 summary.configured = false; summary.model = ''; summary.max_output_tokens = null; summary.connected = false;
 h.setFetch(async () => response(clone(summary)));
 await h.start(); assert.equal(h.calls[0].url, '/api/writing/editorial-request');
 assert.match(h.text(h.tree), /没有正在执行的自动写作任务，已有授权任务执行时这里显示进度/);
 assert.equal(pollCount(h), 0); noSetup(h);
 await h.click('刷新状态'); await h.event('focus'); await h.event('pageshow');
 assert.equal(h.calls.length, 4); assert.ok(h.calls.every(call => call.url === '/api/writing/editorial-request'));
 assert.equal(pollCount(h), 0); noSetup(h); await h.stop();
 console.log('PASS empty/disconnected/unconfigured progress view needs no setup, consent, paid scope, storage or capability preparation; refresh is GET only.');

 h = harness(); let current = makeRequest(); summary = makeSummary(current);
 h.setFetch(async () => response(clone(summary)));
 await h.start(); assert.match(h.text(h.tree), /任务待执行/); assert.match(h.text(h.tree), /尚未开始模型写作/);
 assert.doesNotMatch(h.text(h.tree), /正在写作|正在研究/); assert.equal(pollCount(h), 1); noSetup(h);
 current.dispatch_state = 'accepted'; summary = makeSummary(current); await h.tick(10000);
 assert.match(h.text(h.tree), /尚无接手或写作结果/);
 current.state = 'body'; current.flow_id = id(3);
 current.progress = [{phase: 'outline', state: 'completed', note: '真实框架已存', at: current.created}, {phase: 'body', state: 'requested', note: '等待实际提供方回执', at: current.created}, {phase: 'final_verify', state: 'not_started', note: '尚未执行', at: current.created}];
 summary = makeSummary(current); await h.tick(10000);
 assert.match(h.text(h.tree), /当前环节：完整正文/); assert.match(h.text(h.tree), /已发出请求，等候实际回执/); assert.match(h.text(h.tree), /尚未执行/);
 const exactArticle = {title: '确切完整成稿', paragraphs: ['首段完整文本。', '第二段\n保留原始换行。', '末段完整文本，保留空白。  ']};
 current.state = 'submitted'; current.article = clone(exactArticle); current.final_sha256 = 'f'.repeat(64);
 current.sources = [{id: 'S1', title: '实际公开来源', url: 'https://news.example.org/entertainment', published: '2026-10-05', event_date: '2026-10-04', accessed: '2026-10-06', context: '公开报道正文'}];
 current.progress.push({phase: 'fact_revision', state: 'skipped', note: '零待改项，保留同一全文', at: current.created});
 summary = makeSummary(current); await h.tick(10000);
 assert.match(h.text(h.tree), /确切完整成稿|成稿 SHA-256/); assert.match(h.text(h.tree), /无待改项，保留同一全文/);
 assert.match(h.text(h.tree), /公开资料来源|发布：2026-10-05|事件：2026-10-04|查阅：2026-10-06/);
 assert.deepEqual(h.nodes().filter(node => node.props['data-paragraph']).map(node => node.props.children), exactArticle.paragraphs, 'frozen full body stays byte-for-byte unchanged');
 assert.equal(pollCount(h), 0); assert.deepEqual(current.article, exactArticle); noSetup(h);
 const finishedReads = h.calls.length; await h.tick(10000); assert.equal(h.calls.length, finishedReads);
 await h.click('刷新状态'); assert.equal(h.calls.length, finishedReads + 1, 'terminal may still be explicitly read'); await h.stop();
 console.log('PASS real queue/stage receipts, unexecuted phases, zero-issue skip, unchanged complete frozen body/source dates/hash and terminal polling stop.');

 // History and URL selection remain owner-only server reads, with no client recovery key.
 h = harness(); const latest = makeRequest('submitted', id(10)), historical = makeRequest('technical_failed', id(11));
 latest.topic = '最新任务'; historical.topic = '同账号历史任务'; historical.error = '真实技术请求未完成，本次停止';
 const recent = {...makeSummary(latest), items: [{request_id: latest.request_id, state: latest.state, topic: latest.topic}, {request_id: historical.request_id, state: historical.state, topic: historical.topic}]};
 h.setFetch(async url => response(clone(String(url).includes('request_id=') ? makeSummary(historical) : recent)));
 await h.start();
 const history = h.nodes().find(node => node.type === 'details' && node.props.className === 'writing-fold');
 assert.ok(history); assert.equal(history.props.open, undefined);
 assert.ok(h.nodes().some(node => node.type === 'a' && node.props.href === '/writing/editorial-run?request_id=' + historical.request_id));
 await h.navigate('?request_id=' + historical.request_id); assert.equal(h.calls.at(-1).url, '/api/writing/editorial-request?request_id=' + historical.request_id);
 assert.match(h.text(h.tree), /同账号历史任务/); assert.doesNotMatch(h.text(h.tree), /最新任务/); assert.equal(pollCount(h), 0);
 await h.click('刷新状态'); await h.event('pageshow');
 assert.ok(h.calls.slice(1).every(call => call.url.endsWith('?request_id=' + historical.request_id)));
 await h.navigate(); assert.equal(h.calls.at(-1).url, '/api/writing/editorial-request'); assert.match(h.text(h.tree), /最新任务/);
 await h.stop();
 h = harness(); h.setFetch(async url => {assert.equal(url, '/api/writing/editorial-request?request_id=' + id(11)); return response(makeSummary(historical));});
 await h.start('?request_id=' + id(11)); await h.click('刷新状态'); assert.equal(h.calls.length, 2); await h.stop();
 for (const invalid of ['not-a-request', '', '00000000']) {
  h = harness(); await h.start('?request_id=' + invalid); assert.equal(h.calls.length, 0); assert.match(h.text(h.tree), /任务标识无效/); assert.equal(pollCount(h), 0); await h.stop();
 }
 console.log('PASS folded same-owner history, exact-ID direct reads/refresh, Back/Forward selection and invalid-ID fail-closed without fallback.');

 // Concurrent reads/navigation cannot overwrite a newer selection or a new owner.
 h = harness(); const oldRead = deferred(), newRequest = makeRequest('body', id(22)); newRequest.topic = '新导航实际任务';
 h.setFetch(async url => String(url).includes('request_id=') ? response(makeSummary(newRequest)) : oldRead.promise);
 await h.start(); assert.equal(h.calls.length, 1);
 await h.event('focus'); await h.event('pageshow'); assert.equal(h.calls.length, 1, 'in-flight GETs are single-flight');
 await h.navigate('?request_id=' + newRequest.request_id); assert.equal(h.calls.length, 2); assert.equal(h.calls[0].options.signal.aborted, true);
 assert.match(h.text(h.tree), /新导航实际任务/);
 const stale = makeRequest('body', id(21)); stale.topic = 'STALE-PRIVATE-TASK'; oldRead.resolve(response(makeSummary(stale))); await h.flush();
 assert.doesNotMatch(h.text(h.tree), /STALE-PRIVATE-TASK/); assert.equal(pollCount(h), 1); await h.stop();
 h = harness(); current = makeRequest('body'); current.topic = 'OWNER-A-PRIVATE';
 h.setFetch(async () => response(makeSummary(current))); await h.start(); assert.match(h.text(h.tree), /OWNER-A-PRIVATE/);
 await h.owner('owner-b'); assert.doesNotMatch(h.text(h.tree), /OWNER-A-PRIVATE/);
 h.setFetch(async () => response(makeSummary(null))); await h.tick(0); assert.match(h.text(h.tree), /没有正在执行/); await h.stop();
 h = harness(); const ownerRead = deferred(); h.setFetch(async () => ownerRead.promise); await h.start(); await h.owner('owner-b');
 h.setFetch(async () => response(makeSummary(null))); await h.tick(0);
 ownerRead.resolve(response(makeSummary(current))); await h.flush(); assert.doesNotMatch(h.text(h.tree), /OWNER-A-PRIVATE/); await h.stop();
 console.log('PASS read single-flight, interrupted navigation invalidates stale replies, and owner change clears private view and rejects prior-owner responses.');

 for (const status of [401, 403]) {
  h = harness(); current = makeRequest('body'); current.topic = 'PRIVATE-TOPIC'; current.model = 'PRIVATE-MODEL'; current.prompt_version = 'PRIVATE-VERSION';
  current.progress = [{phase: 'outline', state: 'completed', note: 'PRIVATE-NOTE', at: current.created}];
  summary = {...makeSummary(current), items: [{request_id: id(60), state: 'submitted', topic: 'PRIVATE-HISTORY'}]};
  let deny = false; h.setFetch(async () => deny ? response({error: 'not owner'}, status) : response(clone(summary)));
  await h.start(); assert.match(h.text(h.tree), /PRIVATE-NOTE|PRIVATE-HISTORY/); deny = true; await h.tick(10000);
  assert.match(h.text(h.tree), /使用本人账号登录/);
  assert.doesNotMatch(h.text(h.tree), /PRIVATE-NOTE|PRIVATE-HISTORY|PRIVATE-TOPIC|PRIVATE-MODEL|PRIVATE-VERSION|00000001/);
  assert.equal(pollCount(h), 0); assert.equal(h.nodes().some(node => node.type === 'button'), false);
  deny = false; await h.event('focus'); assert.match(h.text(h.tree), /PRIVATE-NOTE/); assert.equal(pollCount(h), 1); await h.stop();
 }
 console.log('PASS 401/403 erase all private progress/history/model data and stop polling; authenticated focus recovery remains GET only.');

 // A read failure never starts or retries writing, and unknown states are not treated as active work.
 h = harness(); summary = makeSummary(makeRequest('outline')); let fail = false;
 h.setFetch(async () => {if (fail) throw Error('Failed to fetch'); return response(clone(summary));}); await h.start();
 fail = true; await h.tick(10000); assert.match(h.text(h.tree), /进度暂未确认|保留此前读取的实际记录/); assert.equal(pollCount(h), 1);
 fail = false; summary.current.state = 'technical_failed'; summary.current.error = '技术请求未完成，本次停止'; await h.tick(10000);
 assert.match(h.text(h.tree), /技术请求未完成，本次停止/); assert.equal(pollCount(h), 0); await h.stop();
 for (const state of ['unknown', 'unexpected_future_state']) {
  h = harness(); h.setFetch(async () => response(makeSummary(makeRequest(state)))); await h.start();
  assert.match(h.text(h.tree), /状态待核验/); assert.equal(pollCount(h), 0); await h.stop();
 }
 h = harness(); h.setFetch(async () => response({...makeSummary(null), items: [{request_id: id(70), state: 'unknown'}]})); await h.start();
 assert.match(h.text(h.tree), /已有任务状态暂无法核验/); assert.doesNotMatch(h.text(h.tree), /没有正在执行/); assert.equal(pollCount(h), 0); await h.stop();
 for (const failure of [
  () => response({error: '未找到本人的写作委托'}, 400),
  () => response(makeSummary(makeRequest('submitted', id(72)))),
  () => response(makeSummary(null)),
  () => response({unexpected: true}),
  () => new Response('unconfirmed response', {status: 200}),
  () => Promise.reject(Error('D1_ERROR password=SECRET')),
 ]) {
  h = harness(); h.setFetch(async () => failure()); await h.start('?request_id=' + id(71));
  assert.match(h.text(h.tree), /未找到本人|无法核验|尚未确认|暂未确认/); assert.doesNotMatch(h.text(h.tree), /SECRET|D1_ERROR|00000072|没有正在执行/);
  assert.equal(pollCount(h), 0); await h.click('刷新状态'); assert.equal(h.calls.length, 2);
  assert.ok(h.calls.every(call => call.url.endsWith('?request_id=' + id(71)))); await h.stop();
 }
 h = harness(); h.setFetch(async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('Aborted')))));
 await h.start(); await h.tick(20000); assert.match(h.text(h.tree), /连接超时或中断/); assert.equal(pollCount(h), 0); await h.stop();
 console.log('PASS transient GET failure keeps actual prior progress and resumes reads; unknown/foreign/missing/malformed/timeout outcomes fail closed with no inferred execution.');

 // Pause/archive preserve their actual meaning and stop periodic reads. Explicit
 // refresh can observe a later visibility restore, without starting any stage.
 for (const [state, label] of [['paused', '已暂停'], ['archived', '已归档']]) {
  h = harness(); let view = makeRequest(state); h.setFetch(async () => response(makeSummary(view))); await h.start();
  assert.match(h.text(h.tree), new RegExp(label)); assert.doesNotMatch(h.text(h.tree), /已取消|状态待核验/); assert.equal(pollCount(h), 0); noSetup(h);
  const reads = h.calls.length; await h.tick(10000); assert.equal(h.calls.length, reads);
  view = makeRequest('body'); await h.click('刷新状态'); assert.equal(h.calls.length, reads + 1); assert.equal(pollCount(h), 1); await h.stop();
 }
 h = harness(); h.setFetch(async () => response(makeSummary(makeRequest('outline_needs_revision')))); await h.start();
 assert.match(h.text(h.tree), /四阶段冻结授权不含框架修订/); assert.match(h.text(h.tree), /正文与新增收费已停止/); assert.equal(pollCount(h), 0); noSetup(h); await h.stop();
 console.log('PASS paused/archive labels remain truthful, periodic polling stops until explicit read; frozen-four outline blocker cannot imply extra fee or stage controls.');

 const safe = harness({realReact: true}); const rendered = makeRequest('submitted');
 rendered.article = {title: '<script>title</script>', paragraphs: ['完整段落一', '完整段落二\n原有换行和空白  ']}; rendered.final_sha256 = 'a'.repeat(64);
 rendered.progress = [{phase: 'final_verify', state: 'completed', note: '实际全文复核已存', at: rendered.created, actor_id: 'PRIVATE-ACTOR', execution_id: 'PRIVATE-EXECUTION', review_json: {private: true}}];
 rendered.sources = [{id: 'S1', title: '无效链接', url: 'javascript:alert(1)'}, {id: 'S2', title: '带凭证链接', url: 'https://news.example.org/?access_token=SECRET'}, {id: 'S3', title: '有效公开来源', url: 'https://news.example.org/article'}];
 const resultHtml = renderToStaticMarkup(React.createElement(safe.exported.EditorialRequestResult, {request: rendered}));
 assert.match(resultHtml, /完整段落一/); assert.match(resultHtml, /完整段落二\n原有换行和空白  /); assert.match(resultHtml, /有效公开来源/); assert.match(resultHtml, new RegExp('a'.repeat(64)));
 assert.doesNotMatch(resultHtml, /href="javascript:|SECRET|PRIVATE-ACTOR|PRIVATE-EXECUTION|review_json|<script>/);
 rendered.final_sha256 = null;
 assert.doesNotMatch(renderToStaticMarkup(React.createElement(safe.exported.EditorialRequestResult, {request: rendered})), /完整段落一|冻结成稿完整正文/);
 for (const state of ['cancelled', 'paused', 'archived', 'expired', 'failed', 'submitted', 'dispatch_unknown', 'content_blocked', 'content_invalid', 'technical_failed', 'verification_failed', 'outline_needs_revision']) assert.equal(safe.exported.isEditorialRequestTerminal(state), true);
 for (const state of ['queued', 'claimed', 'outline', 'body', 'verified', 'frozen', 'dispatching']) assert.equal(safe.exported.isEditorialRequestTerminal(state), false);
 await safe.stop();
 console.log('PASS escaped unchanged complete frozen text, public-source-only links, no actor/report/JSON leakage and freeze/terminal-state gates.');
} finally {global.fetch = originalFetch; global.window = originalWindow;}
