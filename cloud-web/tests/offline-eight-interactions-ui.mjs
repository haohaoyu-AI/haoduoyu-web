// Execute the actual client pages with synthetic transport and hook state.
// No browser, provider, production API or platform request is made.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
import React from 'react';

const native = createRequire(import.meta.url);
const equal = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
function elements(node, type, result = []) {
 if (Array.isArray(node)) { node.forEach(child => elements(child, type, result)); return result; }
 if (!node?.props) return result;
 if (node.type === type) result.push(node);
 elements(node.props.children, type, result);
 return result;
}
const text = node => Array.isArray(node) ? node.map(text).join('') : typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props ? text(node.props.children) : '';

function harness(filename, {storageUnavailable = false, storageSeed = [], ignoreAbort = false, props = {}} = {}) {
 const slots = [], requests = [], timeouts = [], timers = new Map(), listeners = new Map(), storage = new Map(storageSeed), modules = new Map();
 let cursor = 0, timerId = 0, effects = [], dirty = true, tree;
 const hooks = {...React,
  useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; dirty = true; }]; },
  useRef(initial) { const index = cursor++; return slots[index] ??= {current: initial}; },
  useCallback(fn, deps) { const index = cursor++; if (!slots[index] || !equal(slots[index].deps, deps)) slots[index] = {fn, deps}; return slots[index].fn; },
  useMemo(fn, deps) { const index = cursor++; if (!slots[index] || !equal(slots[index].deps, deps)) slots[index] = {value: fn(), deps}; return slots[index].value; },
  useEffect(fn, deps) { const index = cursor++, previous = slots[index]; if (!previous || !equal(previous.deps, deps)) { const next = {deps, cleanup: previous?.cleanup}; slots[index] = next; effects.push(() => { previous?.cleanup?.(); next.cleanup = fn(); }); } },
 };
 const timer = (fn, delay, repeat) => { const id = ++timerId; timers.set(id, {fn, delay, repeat}); return id; };
 const sessionStorage = Object.fromEntries(['getItem', 'setItem', 'removeItem'].map(method => [method, (key, value) => {
  if (storageUnavailable) throw Error('storage disabled');
  return method === 'getItem' ? storage.get(key) ?? null : method === 'setItem' ? storage.set(key, value) : storage.delete(key);
 }]));
 const window = {sessionStorage, setTimeout: (fn, delay) => timer(fn, delay, false), clearTimeout: id => timers.delete(id),
  setInterval: (fn, delay) => timer(fn, delay, true), clearInterval: id => timers.delete(id),
  addEventListener(name, fn) { listeners.set(name, [...(listeners.get(name) ?? []), fn]); }, removeEventListener(name, fn) { listeners.set(name, (listeners.get(name) ?? []).filter(listener => listener !== fn)); },
 };
 const document = {visibilityState: 'visible', addEventListener: window.addEventListener, removeEventListener: window.removeEventListener};
 const signals = {any: values => AbortSignal.any(values), timeout(delay) {const controller = new AbortController(); timeouts.push({delay, controller}); return controller.signal;}};
 function load(file) {
  file = path.resolve(file); if (modules.has(file)) return modules.get(file);
  const exports = {}; modules.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code, {exports, require(name) {
   if (name === 'react') return hooks;
   if (name.endsWith('.css')) return {default: new Proxy({}, {get: (_, key) => String(key)})};
   if (name.includes('studio-nav')) return {default: () => null};
   if (name === 'next/link') return {default: () => null};
   if (!name.startsWith('.')) return native(name);
   const base = path.resolve(path.dirname(file), name);
   return load([base, `${base}.ts`, `${base}.tsx`].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()));
  }, Date, Intl, URL, Error, AbortController, AbortSignal: signals, crypto: webcrypto, sessionStorage, window, document,
  setInterval: (fn, delay) => timer(fn, delay, true), clearInterval: id => timers.delete(id),
  setTimeout: (fn, delay) => timer(fn, delay, false), clearTimeout: id => timers.delete(id),
  fetch(url, options = {}) {
   assert.match(url, /^\/api\/(?:imitation\/discovery|dedao\/cloud|topics|word-recovery)(?:\?[\w=&-]+)?$/);
   let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
   const request = {url, options, body: options.body ? JSON.parse(options.body) : null,
    respond(body, status = 200) { resolve(new Response(JSON.stringify(body), {status})); }, reject};
   if (!ignoreAbort) options.signal?.addEventListener('abort', () => reject(options.signal.reason), {once: true});
   requests.push(request); return promise;
  }});
  return exports;
 }
 const component = load(filename), Page = component.default ?? component.ResearchPanel;
 function render() {
  let turns = 0;
  do { assert.ok(++turns < 30); cursor = 0; dirty = false; tree = Page(props); const pending = effects; effects = []; pending.forEach(fn => fn()); } while (dirty || effects.length);
  return tree;
 }
 async function settle() { for (let i = 0; i < 15; i++) { await Promise.resolve(); if (dirty || effects.length) render(); } return tree; }
 const button = label => elements(tree, 'button').find(node => text(node) === label);
 return {requests, storage, render, settle, button,
  get tree() { return tree; },
  async start() { render(); for (const [id, entry] of [...timers]) if (!entry.repeat && entry.delay === 0) {timers.delete(id); entry.fn();} return settle(); },
  async click(label) { const node = button(label); assert.ok(node, `missing button ${label}`); assert.equal(!!node.props.disabled, false, `${label} is enabled`); node.props.onClick(); render(); return settle(); },
  async poll(delay) { const entry = [...timers.values()].find(value => value.repeat && value.delay === delay); assert.ok(entry); entry.fn(); render(); return settle(); },
  async event(name, visibility = 'visible') { document.visibilityState = visibility; for (const listener of [...(listeners.get(name) ?? [])]) listener(); render(); return settle(); },
  async expire(delay) { const pending = timeouts.filter(value => value.delay === delay && !value.controller.signal.aborted); assert.ok(pending.length, `missing ${delay} ms deadline`); pending.forEach(value => value.controller.abort(new DOMException('Synthetic timeout', 'TimeoutError'))); return settle(); },
 };
}
const discovery = {owner_scope: 'synthetic-owner-a', accounts: [{id: 'synthetic-account', name: '合成文娱账号', url: 'https://www.toutiao.com/c/user/1/'}], scan: null};
const cloud = (task, owner_scope = 'synthetic-owner-a') => ({owner_scope, connection: {ready: true, notice: '合成离线连接'}, task, instructions: {conversation_url: 'https://example.test/conversation', stages: ['合成阶段']}});
const task = {id: 'synthetic-task', request_key: 'saved-key', state: 'queued', article_id: null, updated: '2026-10-14T00:00:00.000Z', dispatch_state: 'accepted', private_drafts_complete: false, writer_ended: false};
let cases = 0;
async function check(name, fn) { await fn(); cases++; console.log(`PASS ${name}`); }

await check('initial account-pool read failure has a GET retry and consecutive retries share one request', async () => {
 const h = harness('app/imitation/page.tsx'); await h.start(); h.requests[0].reject(Error('合成读取失败')); await h.settle();
 const retry = h.button('重试读取账号池'); assert.ok(retry, 'failed initial read must offer a retry');
 retry.props.onClick(); retry.props.onClick(); await h.settle(); assert.equal(h.requests.length, 2); assert.equal(h.requests[1].options.method, undefined);
 h.requests[1].respond(discovery); await h.settle(); assert.equal(h.button('添加账号').props.disabled, false); assert.equal(h.button('刷新热文').props.disabled, false);
});

await check('older cloud GET cannot replace the task accepted by a newer POST', async () => {
 const h = harness('app/dedao/page.tsx'); await h.start(); h.requests[0].respond(cloud(null)); await h.settle();
 await h.poll(5000); const oldRead = h.requests[1]; await h.click('一键成文');
 const post = h.requests[2]; assert.equal(post.options.method, 'POST'); post.respond(cloud({...task, request_key: post.body.request_key})); await h.settle();
 oldRead.respond(cloud(null)); await h.settle(); assert.ok(h.button('当前文章处理中'), 'late GET must preserve the saved active task'); assert.equal(h.button('当前文章处理中').props.disabled, true);
});

await check('optional storage failure cannot misreport a successful cloud POST or trigger extra readback', async () => {
 const h = harness('app/dedao/page.tsx', {storageUnavailable: true}); await h.start(); h.requests[0].respond(cloud(null)); await h.settle(); await h.click('一键成文');
 const post = h.requests[1]; post.respond(cloud({...task, request_key: post.body.request_key})); await h.settle();
 assert.equal(h.requests.length, 2, 'storage is optional after the server confirms success'); assert.doesNotMatch(text(h.tree), /storage disabled|请求编号保留/); assert.match(text(h.tree), /任务已保存，等待实际云端执行/);
});

await check('account form cannot mutate a collecting pool and can still be cancelled', async () => {
 const h = harness('app/imitation/page.tsx'); await h.start(); h.requests[0].respond(discovery); await h.settle(); await h.click('添加账号');
 await h.click('刷新热文'); const post = h.requests[1]; post.respond({...discovery, scan: {request_key: post.body.request_key, state: 'collecting', created: new Date().toISOString(), result: null}}); await h.settle();
 assert.equal(h.button('保存账号').props.disabled, true); assert.ok(elements(h.tree, 'input').every(input => input.props.disabled));
 elements(h.tree, 'form')[0].props.onSubmit({preventDefault() {}}); await h.settle(); assert.equal(h.requests.length, 2, 'even the actual form handler preserves the scanning lock');
 await h.click('取消添加'); assert.equal(elements(h.tree, 'form').length, 0); assert.equal(h.requests.length, 2);
});

await check('cloud manual retry shows loading, blocks repeated reads, and restores the confirmed task', async () => {
 const h = harness('app/dedao/page.tsx'); await h.start(); h.requests[0].reject(Error('合成读取失败')); await h.settle();
 const retry = h.button('重试读取'); retry.props.onClick(); retry.props.onClick(); await h.settle();
 assert.equal(h.requests.length, 2); assert.equal(h.button('读取中…').props.disabled, true);
 h.requests[1].respond(cloud(task)); await h.settle(); assert.ok(h.button('当前文章处理中')); assert.doesNotMatch(text(h.tree), /合成读取失败/);
});

await check('cloud authentication failure removes private task details while ordinary network failures retain them', async () => {
 for (const status of [401, 403]) {
  const h = harness('app/dedao/page.tsx'); await h.start(); h.requests[0].respond(cloud({...task, id: 'SYNTHETIC-PRIVATE-OWNER-A-TASK', article_id: 'synthetic-private-article'})); await h.settle();
  await h.poll(5000); h.requests[1].reject(Error('合成网络中断')); await h.settle(); assert.match(text(h.tree), /SYNTHETIC-PRIVATE-OWNER-A-TASK/);
  await h.click('重试读取'); h.requests[2].respond({error: 'synthetic authentication failure'}, status); await h.settle();
  assert.doesNotMatch(text(h.tree), /SYNTHETIC-PRIVATE-OWNER-A-TASK|查看配图与草稿进度|打开得到写作对话/); assert.equal(h.button('一键成文').props.disabled, true); assert.ok(elements(h.tree, 'a').some(node => node.props.href === '/signin-with-chatgpt?return_to=%2Fdedao')); assert.equal(h.requests.filter(request => request.options.method === 'POST').length, 0);
 }
});

await check('source-board and history timeouts release read locks and source retry stays GET-only', async () => {
 const h = harness('app/topics/page.tsx'); await h.start(); assert.equal(h.requests.length, 3);
 await h.expire(20000);
 const retry = h.button('重试读取今日头条榜单'); assert.ok(retry); assert.ok(h.button('重试读取微博榜单')); assert.match(text(h.tree), /近期文章读取失败/);
 retry.props.onClick(); retry.props.onClick(); await h.settle(); assert.equal(h.requests.length, 4); assert.equal(h.requests[3].options.method, undefined); assert.equal(h.requests[3].url, '/api/topics?view=platform&platform=toutiao'); assert.equal(h.button('读取中…').props.disabled, true);
 const platform = {platform: 'toutiao', label: '今日头条', provider: '合成离线来源', status: 'ok', fetched_at: new Date().toISOString(), attempted_at: null, upstream_updated_at: null, cache_hit: false, item_count: 0, source_count: 0, returned_count: 0, invalid_count: 0, truncated: false, next_refresh_at: null, error: null, provider_attempts: []};
 h.requests[3].respond({version: 'haoduoyu-topic-board-1', platform, rows: [], candidates: [], checked_at: platform.fetched_at}); await h.settle();
 assert.equal(h.button('重试读取今日头条榜单'), undefined); assert.equal(h.requests.filter(request => request.options.method === 'POST').length, 0);
});

const privateDiscovery = (state = 'ready') => ({...discovery, scan: {id: 'synthetic-private-scan', request_key: 'synthetic-scan-key', state, created: new Date().toISOString(), pool_changed: false, result: {observations: [], articles: [{id: 'synthetic-private-card', account_id: 'synthetic-account', title: '合成电影私有卡片', url: 'https://www.toutiao.com/article/1234567890123456789/', published_at: new Date().toISOString(), reads: {display: '10000阅读', lower_bound: 10000}, likes: {display: null}, comments: {display: null}}]}}});
const assertHotIdentityCleared = h => {assert.doesNotMatch(text(h.tree), /合成文娱账号|合成电影私有卡片/); assert.ok(elements(h.tree, 'a').some(node => node.props.href === '/signin-with-chatgpt?return_to=%2Fimitation')); assert.equal(elements(h.tree, 'form').length, 0); assert.equal(h.button('添加账号').props.disabled, true);};

await check('hot refresh auth refusal clears account/card/form and never retries the refused POST automatically', async () => {
 for (const status of [401, 403]) {
  const h = harness('app/imitation/page.tsx'); await h.start(); h.requests[0].respond(privateDiscovery()); await h.settle(); await h.click('添加账号'); await h.click('刷新热文');
  h.requests[1].respond({error: 'synthetic auth failure'}, status); await h.settle(); assertHotIdentityCleared(h); assert.equal(h.requests.length, 2);
 }
});

await check('hot add and remove auth refusals clear every protected field without retrying the mutation', async () => {
 for (const action of ['add', 'remove']) for (const status of [401, 403]) {
  const h = harness('app/imitation/page.tsx'); await h.start(); h.requests[0].respond(privateDiscovery()); await h.settle();
  if (action === 'add') {await h.click('添加账号'); elements(h.tree, 'input')[0].props.onChange({target: {value: 'OWNER-A-UNSAVED'}}); elements(h.tree, 'input')[1].props.onChange({target: {value: 'https://example.test/owner-a'}}); await h.settle(); elements(h.tree, 'form')[0].props.onSubmit({preventDefault() {}}); await h.settle();} else await h.click('移除');
  h.requests[1].respond({error: 'synthetic auth refusal'}, status); await h.settle(); assertHotIdentityCleared(h); assert.equal(h.requests.length, 2);
 }
});

await check('hot refresh receipt auth refusal clears protected results instead of reporting an unknown scan', async () => {
 for (const status of [401, 403]) {
  const h = harness('app/imitation/page.tsx'); await h.start(); h.requests[0].respond(privateDiscovery()); await h.settle(); await h.click('刷新热文');
  h.requests[1].reject(Error('synthetic POST response loss')); await h.settle(); assert.match(h.requests[2].url, /request_key=/);
  h.requests[2].respond({error: 'synthetic auth failure'}, status); await h.settle(); assertHotIdentityCleared(h); assert.doesNotMatch(text(h.tree), /刷新结果暂未确认/);
 }
});

await check('hot poll auth refusal clears the identity, and a late prior poll cannot resurrect it', async () => {
 for (const status of [401, 403]) {
  const h = harness('app/imitation/page.tsx', {ignoreAbort: true}); await h.start(); h.requests[0].respond(privateDiscovery('collecting')); await h.settle();
  await h.poll(2500); h.requests[1].respond({error: 'synthetic poll auth failure'}, status); await h.settle(); assertHotIdentityCleared(h);
  const late = harness('app/imitation/page.tsx', {ignoreAbort: true}); await late.start(); late.requests[0].respond(privateDiscovery('collecting')); await late.settle(); await late.poll(2500); await late.event('focus');
  late.requests[2].respond({error: 'synthetic focus auth failure'}, status); await late.settle(); late.requests[1].respond(privateDiscovery()); await late.settle(); assertHotIdentityCleared(late);
 }
});

await check('hot focus and visible transitions revalidate owner by GET, clear old input/intent, and fence pending POST', async () => {
 for (const event of ['focus', 'visibilitychange']) {
  const h = harness('app/imitation/page.tsx'); await h.start(); h.requests[0].respond(privateDiscovery()); await h.settle(); await h.click('添加账号');
  elements(h.tree, 'input')[0].props.onChange({target: {value: 'OWNER-A-UNSAVED'}}); elements(h.tree, 'input')[1].props.onChange({target: {value: 'https://example.test/owner-a'}}); await h.settle(); await h.click('刷新热文'); const old = h.requests[1];
  await h.event(event, 'hidden'); assert.equal(h.requests.length, 2); await h.event(event); assert.equal(h.requests.length, 3, 'returning to a visible page must revalidate identity'); assert.equal(h.requests[2].url, '/api/imitation/discovery'); assert.equal(h.requests[2].options.method, undefined);
  const next = {...discovery, owner_scope: 'synthetic-owner-b', accounts: [{...discovery.accounts[0], id: 'owner-b-account', name: 'OWNER-B-电影账号'}]}; h.requests[2].respond(next); await h.settle(); assert.doesNotMatch(text(h.tree), /合成文娱账号|合成电影私有卡片|OWNER-A-UNSAVED/); assert.equal(elements(h.tree, 'form').length, 0);
  old.respond(event === 'focus' ? privateDiscovery() : {error: 'late owner-a auth refusal'}, event === 'focus' ? 200 : 403); await h.settle(); assert.match(text(h.tree), /OWNER-B-电影账号/); assert.doesNotMatch(text(h.tree), /合成文娱账号|合成电影私有卡片/);
  await h.click('添加账号'); assert.ok(elements(h.tree, 'input').every(input => input.props.value === '')); await h.click('取消添加');
  await h.click('刷新热文'); assert.notEqual(h.requests[3].body.request_key, old.body.request_key); assert.equal(h.requests.length, 4);
 }
});

await check('hot network failures preserve the original retry key but require GET-only identity confirmation after focus loss', async () => {
 const h = harness('app/imitation/page.tsx'); await h.start(); h.requests[0].respond(privateDiscovery()); await h.settle(); await h.click('刷新热文'); const key = h.requests[1].body.request_key;
 h.requests[1].reject(Error('synthetic POST loss')); await h.settle(); h.requests[2].reject(Error('synthetic receipt loss')); await h.settle(); assert.match(text(h.tree), /合成文娱账号/); assert.match(text(h.tree), /合成电影私有卡片/);
 await h.event('focus'); h.requests[3].reject(Error('synthetic focus loss')); await h.settle(); assert.doesNotMatch(text(h.tree), /合成文娱账号|合成电影私有卡片/); assert.equal(h.button('刷新热文').props.disabled, true); assert.equal(h.requests.filter(request => request.options.method === 'POST').length, 1);
 await h.click('重试读取账号池'); assert.equal(h.requests[4].options.method, undefined); h.requests[4].respond(privateDiscovery()); await h.settle(); assert.match(text(h.tree), /合成文娱账号/); assert.match(text(h.tree), /合成电影私有卡片/); assert.equal(h.requests.filter(request => request.options.method === 'POST').length, 1, 'identity confirmation never replays the unknown scan');
 await h.click('刷新热文'); assert.equal(h.requests[5].body.request_key, key); assert.equal(h.requests[5].body.owner_scope, discovery.owner_scope);
});

await check('missing hot owner scope cannot keep protected data or enable mutations', async () => {
 const h = harness('app/imitation/page.tsx'); await h.start(); h.requests[0].respond(privateDiscovery()); await h.settle(); await h.event('focus');
 const invalid = privateDiscovery(); delete invalid.owner_scope; h.requests[1].respond(invalid); await h.settle(); assert.doesNotMatch(text(h.tree), /合成文娱账号|合成电影私有卡片/); assert.equal(h.button('添加账号').props.disabled, true); assert.ok(h.button('重试读取账号池'));
});

await check('cloud POST auth refusal clears the scoped recovery key without an automatic GET and next owner gets a fresh key', async () => {
 for (const status of [401, 403]) {
  const h = harness('app/dedao/page.tsx'); await h.start(); h.requests[0].respond(cloud(null)); await h.settle(); await h.click('一键成文'); const original = h.requests[1].body.request_key;
  assert.equal(JSON.parse(h.storage.get('dedao-cloud-request')).owner_scope, 'synthetic-owner-a'); h.requests[1].respond({error: 'synthetic auth refusal'}, status); await h.settle(); assert.equal(h.storage.has('dedao-cloud-request'), false); assert.equal(h.requests.length, 2);
  await h.click('重试读取'); h.requests[2].respond(cloud(null, 'synthetic-owner-b')); await h.settle(); await h.click('一键成文'); assert.notEqual(h.requests[3].body.request_key, original);
 }
});

await check('cloud receipt auth refusal clears memory/storage, while ordinary unknown responses retain the same scoped key', async () => {
 for (const status of [401, 403]) {
  const h = harness('app/dedao/page.tsx'); await h.start(); h.requests[0].respond(cloud(null)); await h.settle(); await h.click('一键成文'); const old = h.requests[1].body.request_key;
  h.requests[1].reject(Error('synthetic POST loss')); await h.settle(); h.requests[2].respond({error: 'synthetic auth refusal'}, status); await h.settle(); assert.equal(h.storage.has('dedao-cloud-request'), false);
  await h.click('重试读取'); h.requests[3].respond(cloud(null, 'synthetic-owner-b')); await h.settle(); await h.click('一键成文'); assert.notEqual(h.requests[4].body.request_key, old);
 }
 const h = harness('app/dedao/page.tsx'); await h.start(); h.requests[0].respond(cloud(null)); await h.settle(); await h.click('一键成文'); const original = h.requests[1].body.request_key;
 h.requests[1].reject(Error('synthetic POST loss')); await h.settle(); h.requests[2].reject(Error('synthetic receipt loss')); await h.settle(); assert.equal(JSON.parse(h.storage.get('dedao-cloud-request')).key, original);
 await h.click('重试读取'); h.requests[3].respond(cloud(null)); await h.settle(); await h.click('一键成文'); assert.equal(h.requests[4].body.request_key, original);
});

await check('cloud owner revalidation fences pending old POST and late GET without releasing the old write lock early', async () => {
 for (const status of [200, 401, 403]) {
  const h = harness('app/dedao/page.tsx', {ignoreAbort: true}); await h.start(); h.requests[0].respond(cloud(null)); await h.settle(); await h.click('一键成文'); const old = h.requests[1]; await h.event('focus'); const stale = h.requests[2]; await h.event('visibilitychange');
  h.requests[3].respond(cloud(null, 'synthetic-owner-b')); await h.settle(); assert.equal(h.button('正在提交…').props.disabled, true); assert.equal(h.storage.has('dedao-cloud-request'), false);
  stale.respond(status === 200 ? cloud({...task, id: 'PRIVATE-OLD-GET'}) : {error: 'late owner-a auth refusal'}, status); old.respond(cloud({...task, id: 'PRIVATE-OLD-POST', request_key: old.body.request_key})); await h.settle(); assert.doesNotMatch(text(h.tree), /PRIVATE-OLD/); await h.click('一键成文'); const next = h.requests[4]; assert.notEqual(next.body.request_key, old.body.request_key); assert.equal(JSON.parse(h.storage.get('dedao-cloud-request')).owner_scope, 'synthetic-owner-b');
 }
});

await check('cloud requires owner scope and unscoped legacy recovery can only be resolved by a matching read', async () => {
 const missing = cloud(task); delete missing.owner_scope;
 for (const invalid of [missing, null, [], {...cloud(task), owner_scope: ''}]) {
  const h = harness('app/dedao/page.tsx'); await h.start(); h.requests[0].respond(invalid); await h.settle(); assert.doesNotMatch(text(h.tree), /synthetic-task/); assert.equal(h.button('一键成文').props.disabled, true); assert.match(text(h.tree), /登录身份尚未确认/);
 }
 const legacy = harness('app/dedao/page.tsx', {storageSeed: [['dedao-cloud-request', 'legacy-unknown-key']]}); await legacy.start(); legacy.requests[0].respond(cloud(null)); await legacy.settle(); assert.equal(legacy.button('一键成文').props.disabled, true); assert.match(text(legacy.tree), /旧请求的登录账号尚未核对/);
 await legacy.click('重试读取'); legacy.requests[1].respond(cloud({...task, request_key: 'legacy-unknown-key'})); await legacy.settle(); assert.equal(legacy.storage.has('dedao-cloud-request'), false); assert.equal(legacy.requests.filter(request => request.options.method === 'POST').length, 0);
});

await check('cloud downstream projection displays real platform blocks without declaring completion or starting another task', async () => {
 for (const [state, label] of [['needs_login', '平台需要登录，等待处理'], ['needs_verification', '平台草稿待核验'], ['failed', '平台处理暂未完成']]) {
  const h = harness('app/dedao/page.tsx'); await h.start(); h.requests[0].respond(cloud({...task, state: 'processing', downstream_status: 'available', article_state: 'processing', deliveries: [{platform: 'zhihu', state, message: null}]})); await h.settle(); assert.equal(text(elements(h.tree, 'h3')[0]), label); assert.match(text(h.tree), /同一任务与已有成果保留/); assert.equal(h.button('当前文章处理中').props.disabled, true); assert.equal(h.requests.length, 1);
 }
 const h = harness('app/dedao/page.tsx'); await h.start(); h.requests[0].respond(cloud({...task, state: 'processing', downstream_status: 'unavailable', article_state: null, deliveries: []})); await h.settle(); assert.equal(text(elements(h.tree, 'h3')[0]), '平台处理状态暂未读取'); assert.match(text(h.tree), /暂时无法核对本篇文章的平台进度/); assert.equal(h.requests.filter(request => request.options.method === 'POST').length, 0);
});

console.log(`PASS ${cases} actual offline client interaction scenarios; synthetic I/O only.`);
