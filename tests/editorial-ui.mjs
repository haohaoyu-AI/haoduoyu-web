// Offline UI tests. Every fetch is an in-memory stub; no DB, provider or network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const root = process.cwd(), requireRoot = Module.createRequire(root + '/package.json');
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};
const response = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'content-type': 'application/json'}});
const uuid = number => `${String(number).padStart(8, '0')}-0000-4000-8000-000000000000`;
const participants = Object.fromEntries(['writer', 'outline_reviewer', 'structure_reviewer', 'fact_checker', 'verifier'].map((role, index) => [role, {actor_id: uuid(index + 10), model: index ? 'independent-test-model' : 'writer-test-model'}]));
const article = {title: '完整冻结标题', paragraphs: ['标题外的第一段，保留空白和标点。', '最终完整末段。']};
const makeView = (state = 'outline') => ({
 run_id: uuid(1), article_id: uuid(2), state, snapshot_sha256: 'snapshot-hash',
 snapshot: {contract_version: 2, topic: '本次真实资料选题', angle: '角度', style_requirements: '自然表达', materials: '公开材料', model: participants.writer.model, prompt_version: 'test-version', sources: [], facts: [], participants: clone(participants)},
 current_version: null, stages: {}, artifacts: {}, control_state: 'active', final_sha256: null, expires: '2099-01-01T00:00:00Z',
});
const step = (state = 'claimed') => ({state, input_sha256: 'input-hash', receipt_state: null, usage: null, error: null, diagnostic: null, requested_model: null, returned_model: null});
const exactInput = (stage, text = article) => ({stage, actor_id: participants[stage === 'outline_review' ? 'outline_reviewer' : stage === 'structure_review' ? 'structure_reviewer' : stage === 'fact_check' ? 'fact_checker' : 'verifier'].actor_id, model: 'independent-test-model', input_article: clone(text), system_prompt: '本阶段完整契约', user_prompt: '本阶段完整材料'});
const artifact = (value, provenance = 'owner_attested_independent_agent') => ({artifact: value, sha256: 'artifact-hash', input_sha256: 'input-hash', actor_id: uuid(12), execution_id: uuid(100), model: 'independent-test-model', provenance, receipt_id: null});

function harness(exportName = 'default', realReact = false) {
 const slots = [], effects = [], timers = new Map(), listeners = new Map(), calls = [], storage = new Map();
 let cursor = 0, dirty = false, tree, stopped = false, timerId = 0;
 let currentFetch = () => {throw Error('Unexpected fetch: real network is forbidden');};
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
    if (dest.endsWith('/app/chatgpt-auth')) return {requireChatGPTUser: async returnTo => {calls.push({auth: returnTo}); return {userId: 'authenticated-test-owner'};}};
    for (const suffix of ['', '.ts', '.tsx']) if (fs.existsSync(dest + suffix) && fs.statSync(dest + suffix).isFile()) return load(dest + suffix);
   }
   if (/cloudflare|editorial-flow|test-store/.test(name)) throw Error('Forbidden DB dependency in UI test');
   return requireRoot(name);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true}}).outputText, file);
  return mod.exports;
 }
 const exported = load(root + '/components/editorial-run.tsx');
 const window = {
  location: {href: 'https://offline.invalid/writing/editorial-helper', search: ''},
  history: {pushState(_a, _b, href) {window.location.href = new URL(href, window.location.href).href; window.location.search = new URL(window.location.href).search;}},
  sessionStorage: {getItem(key) {return storage.get(key) ?? null;}, setItem(key, value) {storage.set(key, value);}},
  setTimeout(fn, delay) {const id = ++timerId; timers.set(id, {fn, delay}); return id;}, clearTimeout(id) {timers.delete(id);},
  addEventListener(name, fn) {if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn);},
  removeEventListener(name, fn) {listeners.get(name)?.delete(fn);},
 };
 global.window = window;
 global.fetch = async (url, options = {}) => {calls.push({url, options, body: options.body ? JSON.parse(options.body) : null}); return currentFetch(url, options);};
 const props = exportName === 'EditorialFold' ? {scope: 'owner:run', name: 'text', title: '完整正文', children: '正文'} : {promptVersion: 'test-version', ownerScope: 'test-owner'};
 function render() {if (stopped) return; cursor = 0; dirty = false; tree = exported[exportName](props); for (const effect of effects.splice(0)) effect();}
 async function flush() {for (let i = 0; i < 150; i++) {await Promise.resolve(); if (dirty) render();}}
 function nodes() {const found = []; function visit(v) {if (!v || typeof v !== 'object') return; if (Array.isArray(v)) {v.forEach(visit); return;} if (v.type) {found.push(v); visit(v.props.children);}} visit(tree); return found;}
 function text(v) {if (v == null || typeof v === 'boolean') return ''; if (Array.isArray(v)) return v.map(text).join(''); if (typeof v === 'object') return text(v.props?.children); return String(v);}
 const field = name => {const result = nodes().find(node => node.props.name === name); assert.ok(result, 'field exists: ' + name); return result;};
 const button = label => {const result = nodes().find(node => node.type === 'button' && text(node).includes(label)); assert.ok(result, 'button exists: ' + label); return result;};
 const formFor = name => {const target = field(name); const find = node => node === target || (Array.isArray(node?.props?.children) ? node.props.children.some(find) : findChild(node?.props?.children)); const findChild = value => value === target || (Array.isArray(value) ? value.some(find) : value && typeof value === 'object' ? find(value) : false); const result = nodes().filter(node => node.type === 'form').find(find); assert.ok(result, 'form for ' + name); return result;};
 return {
  exported, load, calls, storage, window, nodes, text, field, button, formFor, render, flush,
  setFetch(fn) {currentFetch = fn;},
  async start(id = '') {window.location.search = id ? '?run_id=' + id : ''; window.location.href += window.location.search; render(); for (const [id, timer] of [...timers]) if (timer.delay === 0) {timers.delete(id); timer.fn();} await flush();},
  async click(label) {const b = button(label); assert.ok(!b.props.disabled, 'enabled button: ' + label); b.props.onClick?.(); await flush();},
  async change(name, value) {const f = field(name); assert.ok(!f.props.disabled, 'enabled field: ' + name); f.props.onChange({target: f.props.type === 'checkbox' ? {checked: value} : {value}}); await flush();},
  async submit(name, repeat = false) {const f = formFor(name); const event = {preventDefault() {}}; const a = f.props.onSubmit(event); if (repeat) f.props.onSubmit(event); await flush(); if (!repeat) {await a; await flush();}},
  async event(name) {for (const fn of listeners.get(name) || []) fn(); await flush();},
  async stop() {stopped = true; for (const slot of slots) slot?.cleanup?.(); await Promise.resolve();},
  get tree() {return tree;},
 };
}

const originalFetch = global.fetch, originalWindow = global.window;
try {
 const source = fs.readFileSync('components/editorial-run.tsx', 'utf8');
 const pageSource = fs.readFileSync('app/writing/editorial-helper/page.tsx', 'utf8');
 assert.doesNotMatch(source, /localStorage|crypto\.randomUUID|\/api\/mcp|setInterval/);
 assert.match(source, /readDailyNdjson\(response\.body/);
 assert.match(source, /heldClaim = useRef/);
 assert.match(source, /attempted\.current\.add\(key\)/);
 assert.match(source, /heldClaim\.current = null; setOwnedStage\(null\); setPaidConfirmed\(false\)/);
 assert.match(pageSource, /requireChatGPTUser\('\/writing\/editorial-helper'\)/);
 const ssr = harness('default', true), html = renderToStaticMarkup(React.createElement(ssr.exported.default, {promptVersion: 'test-version'}));
 assert.equal(ssr.calls.length, 0, 'SSR performs no HTTP or model request');
 assert.match(html, /独立编辑流水线/); assert.match(html, /完整创建资料 JSON/);
 assert.doesNotMatch(html, /<input[^>]+checked|<details[^>]+open/);
 const template = ssr.exported.createTemplate('actual-version', 'configured-model');
 assert.equal(template.expected_prompt_version, 'actual-version');
 assert.equal(template.sources.length, 2); assert.equal(template.facts.length, 1);
 assert.equal(Object.keys(template.participants).length, 5);
 assert.ok(Object.values(template.participants).every(actor => actor.actor_id === ''), 'no fabricated participants');
 assert.ok(template.sources.every(source => ['published', 'event_date', 'accessed', 'context'].every(key => source[key] === '')));
 const page = ssr.load(root + '/app/writing/editorial-helper/page.tsx');
 const element = await page.default();
 assert.equal(page.dynamic, 'force-dynamic'); assert.equal(element.props.ownerScope, 'authenticated-test-owner');
 assert.equal(ssr.calls[0].auth, '/writing/editorial-helper');
 const facts = ssr.exported.reviewTemplate('fact_check', exactInput('fact_check'));
 assert.equal(facts.passed, false); assert.equal(facts.coverage.length, article.paragraphs.length + 1);
 assert.deepEqual(facts.coverage.map(c => c.quote), [article.title, ...article.paragraphs]);
 assert.ok(Object.values(facts.checks).every(value => value === false));
 assert.equal(ssr.exported.reviewTemplate('structure_review').decision, '填写 pass / revise / blocked');
 const completed = makeView('frozen'); completed.current_version = {article, sha256: 'final-hash', version: 3}; completed.final_sha256 = 'final-hash';
 completed.stages.outline = {...step('technical_failed'), receipt_state: 'failed', diagnostic: {http_status: 524}};
 completed.artifacts.body = {...artifact(clone(article), 'claude_provider_text'), receipt_id: 'actual-test-receipt'};
 completed.artifacts.fact_check = artifact(facts);
 const resultHtml = renderToStaticMarkup(React.createElement(ssr.exported.EditorialRunResult, {view: completed, scope: 'owner:run'}));
 assert.equal((resultHtml.match(/data-editorial-stage=/g) || []).length, 8);
 assert.match(resultHtml, /HTTP 524/); assert.match(resultHtml, /技术失败/);
 assert.match(resultHtml, /冻结成稿 · 标题与完整正文/);
 assert.match(resultHtml, /完整冻结标题/); assert.match(resultHtml, /最终完整末段/);
 assert.match(resultHtml, /Claude 实际提供方文本/); assert.match(resultHtml, /独立执行结果，由本人确认身份/);
 assert.match(resultHtml, /quote_time_context/); assert.match(resultHtml, /actual-test-receipt/);
 assert.match(ssr.exported.technicalNotice(makeView('content_blocked')), /内容阻断/);
 assert.match(ssr.exported.technicalNotice(makeView('content_invalid')), /完整提供方回执已保存/);
 assert.doesNotMatch(ssr.exported.technicalNotice(makeView('content_invalid')), /技术失败：/);
 assert.doesNotMatch(ssr.exported.provenanceLabel(artifact({text: '独立审稿文本'})), /Claude/);
 await ssr.stop();
 console.log('PASS authenticated page, SSR with all eight stages, complete non-attesting templates, exact full final text, provenance and HTTP524/content separation.');

 let h = harness(), view = makeView(), paidCalls = 0;
 const waiting = deferred();
 h.setFetch(async (url, options) => {
  if (url === '/api/claude/editorial-run') {paidCalls++; return waiting.promise;}
  if (options.method === 'POST') {
   const payload = JSON.parse(options.body); assert.equal(options.headers['x-xiaoyu-editorial-flow'], '1');
   assert.equal(payload.arguments.confirm, true);
   if (payload.action === 'claim') {
    view.stages.outline = step();
    return response({claimed: true, run_id: view.run_id, stage: 'outline', token: 'PRIVATE-WINNER-TOKEN', input_sha256: 'input-hash', expected_model: view.snapshot.model});
   }
   throw Error('Unexpected mutation');
  }
  return response(url.includes('run_id=') ? clone(view) : {items: [{run_id: view.run_id, title: view.snapshot.topic, state: view.state}]});
 });
 await h.start(view.run_id); assert.ok(h.calls.every(call => call.options.method !== 'POST'), 'mount is read-only');
 await h.click('确认认领当前阶段');
 assert.equal(paidCalls, 0, 'claim never initiates paid execution');
 assert.ok(h.button('执行这一个已认领付费阶段').props.disabled, 'paid checkbox is initially unchecked');
 assert.doesNotMatch(h.text(h.tree), /PRIVATE-WINNER-TOKEN/);
 assert.ok(!h.nodes().some(n => n.props.value?.includes?.('PRIVATE-WINNER-TOKEN')), 'token never reaches any input/textarea');
 assert.ok(![...h.storage.values()].some(value => value.includes('PRIVATE-WINNER-TOKEN')), 'token never persisted');
 await h.change('paid_confirm_outline', true);
 await h.submit('paid_confirm_outline', true);
 assert.equal(paidCalls, 1, 'same-tick double submit sends one paid request');
 const paidPayload = h.calls.find(call => call.url === '/api/claude/editorial-run');
 assert.equal(paidPayload.options.headers['x-xiaoyu-editorial-run'], '1');
 assert.equal(paidPayload.body.expected_input_sha256, 'input-hash'); assert.equal(paidPayload.body.token, 'PRIVATE-WINNER-TOKEN');
 view = makeView('outline_review'); view.stages.outline = {...step('completed'), receipt_state: 'completed'};
 waiting.resolve(new Response('{"type":"running","seconds":0}\n{"type":"terminal","terminal":true,"success":true,"state":"completed"}\n', {headers: {'content-type': 'application/x-ndjson'}}));
 await h.flush(); assert.equal(paidCalls, 1); assert.ok(h.text(h.tree).includes('本阶段确切产物已保存'));
 await h.stop();
 console.log('PASS winner-only paid request, independent unchecked consent, same-tick/in-flight guard, protected HTTP headers, token kept out of DOM/storage and no automatic next-stage execution.');

 h = harness(); view = makeView(); view.stages.outline = step();
 h.setFetch(async (url, opts) => {assert.notEqual(opts.method, 'POST'); return response(url.includes('run_id=') ? clone(view) : {items: []});});
 await h.start(view.run_id);
 assert.ok(h.button('确认认领当前阶段').props.disabled, 'refresh never reissues winning paid token');
 assert.ok(h.button('执行这一个已认领付费阶段').props.disabled);
 assert.match(h.text(h.tree), /凭证不会恢复/); await h.stop();

 h = harness(); view = makeView('fact_revision'); view.stages.fact_revision = step();
 view.current_version = {article: clone(article), sha256: 'unchanged-hash', version: 2};
 view.artifacts.fact_check = artifact({status: 'completed', passed: true, issues: [], unconfirmed: [], coverage: [{quote: article.title}]});
 const noIssues = clone(view); assert.ok(h.exported.canSkipRevision(noIssues, 'fact_revision'));
 noIssues.artifacts.fact_check.artifact.unconfirmed.push('仍未核实'); assert.equal(h.exported.canSkipRevision(noIssues, 'fact_revision'), false);
 h.setFetch(async (url, opts) => {
  if (opts.method === 'POST') {const payload = JSON.parse(opts.body); assert.equal(payload.action, 'skip_revision'); assert.equal(payload.arguments.expected_input_sha256, 'input-hash'); view.state = 'final_verify'; view.stages.fact_revision.state = 'completed'; return response(clone(view));}
  return response(url.includes('run_id=') ? clone(view) : {items: []});
 });
 await h.start(view.run_id); assert.ok(!h.nodes().some(n => n.props.name === 'paid_confirm_fact_revision'));
 await h.click('确认保留同一全文与 hash');
 assert.equal(view.current_version.sha256, 'unchanged-hash');
 assert.ok(!h.calls.some(call => call.url === '/api/claude/editorial-run'));
 assert.match(h.text(h.tree), /终审仍需实际执行/); await h.stop();
 console.log('PASS navigation claim loss fails closed and zero-issue skip explicitly retains identical full-text hash without paid calls.');
 for (const phase of ['body', 'structure_revision', 'fact_revision']) {
  h = harness(); view = makeView(phase); let requests = 0;
  h.setFetch(async (url, opts) => {
   if (url === '/api/claude/editorial-run') {requests++; const p = JSON.parse(opts.body); assert.equal(p.stage, phase); assert.equal(p.expected_input_sha256, 'input-hash'); return new Response('{"terminal":true,"success":false,"state":"failed"}\n');}
   if (opts.method === 'POST') {const p = JSON.parse(opts.body); assert.equal(p.action, 'claim'); view.stages[phase] = step(); return response({claimed: true, run_id: view.run_id, stage: phase, token: 'PRIVATE-' + phase, input_sha256: 'input-hash', expected_model: view.snapshot.model});}
   return response(url.includes('run_id=') ? clone(view) : {items: []});
  });
  await h.start(view.run_id); await h.click('确认认领当前阶段'); assert.equal(requests, 0);
  assert.equal(h.field('paid_confirm_' + phase).props.checked, false);
  await h.change('paid_confirm_' + phase, true); await h.submit('paid_confirm_' + phase);
  assert.equal(requests, 1); assert.ok(h.button('执行这一个已认领付费阶段').props.disabled); await h.stop();
 }
 console.log('PASS every paid phase separately starts unchecked, binds exact inputs and stops after failed/unknown request.');


 h = harness(); view = makeView('final_verify'); let saves = 0;
 h.setFetch(async (url, opts) => {
  if (opts.method === 'POST') {
   const payload = JSON.parse(opts.body);
   if (payload.action === 'claim') {view.stages.final_verify = step(); return response({claimed: true, run_id: view.run_id, stage: 'final_verify', input_sha256: 'input-hash', input: exactInput('final_verify')});}
   if (payload.action === 'save_review') {
    saves++; const args = payload.arguments;
    assert.equal(args.actor_id, participants.verifier.actor_id); assert.equal(args.execution_id, uuid(110)); assert.equal(args.model, participants.verifier.model);
    assert.equal(args.expected_snapshot_sha256, 'snapshot-hash'); assert.equal(args.expected_input_sha256, 'input-hash');
    const report = JSON.parse(args.raw_result); assert.equal(report.coverage.length, article.paragraphs.length + 1);
    view.state = 'verified'; return response(clone(view));
   }
   throw Error('Unexpected action');
  }
  return response(url.includes('run_id=') ? clone(view) : {items: []});
 });
 await h.start(view.run_id); await h.click('确认认领当前阶段');
 const fullTemplate = JSON.parse(h.field('review_json').props.value);
 assert.deepEqual(fullTemplate.coverage.map(c => c.quote), [article.title, ...article.paragraphs]);
 assert.equal(h.field('review_execution_id').props.value, ''); assert.equal(h.field('review_model').props.value, '');
 assert.ok(h.button('保存这一个独立报告').props.disabled);
 const report = {status: 'completed', passed: true, coverage: [article.title, ...article.paragraphs].map((quote, paragraph) => ({paragraph, quote, classification: 'opinion', verdict: 'not_applicable', source_ids: [], source_dates: [], context: '离线测试分类，并非真实审稿结论'})), issues: [], unconfirmed: [], checks: {paragraphs: true, names: true, numbers: true, metaphors: true, quote_time_context: true}};
 await h.change('review_json', JSON.stringify(report)); await h.change('review_execution_id', uuid(110)); await h.change('review_model', participants.verifier.model);
 await h.change('review_confirm', true); assert.ok(h.button('保存这一个独立报告').props.disabled, 'final full-text read independently required');
 await h.change('final_full_text_read', true); await h.submit('review_json');
 assert.equal(saves, 1); assert.ok(h.button('冻结确切成稿').props.disabled, 'freezing is a separate unchecked confirmation');
 assert.ok(!h.calls.some(call => call.url === '/api/claude/editorial-run'));
 h.setFetch(async () => response({error: 'Unauthorized'}, 401));
 await h.submit('run_id'); assert.match(h.text(h.tree), /重新登录/);
 assert.ok(!h.nodes().some(n => n.type === h.exported.EditorialRunResult));
 assert.ok(!h.nodes().some(n => n.props.name === 'review_json')); await h.stop();
 console.log('PASS hash-bound genuine identity/execution/model fields, exact final-title/full-body coverage, independent full-text attestation, separate freeze consent and auth clearing.');

 h = harness(); view = makeView(); view.stages.outline = {...step('requested'), receipt_state: 'completed'};
 let recovered = 0;
 h.setFetch(async (url, opts) => {
  if (opts.method === 'POST') {
   const payload = JSON.parse(opts.body); assert.equal(payload.action, 'recover_completed'); assert.equal(payload.arguments.stage, 'outline'); recovered++;
   view.stages.outline.state = 'completed'; view.artifacts.outline = artifact({title: '同一回执框架'}); view.state = 'outline_review'; return response(clone(view));
  }
  return response(url.includes('run_id=') ? clone(view) : {items: []});
 });
 await h.start(view.run_id); await h.click('已完成回执恢复产物');
 assert.equal(recovered, 1); assert.ok(!h.calls.some(call => call.url === '/api/claude/editorial-run')); await h.stop();

 h = harness(); view = makeView('frozen'); view.current_version = {article: clone(article), sha256: 'final-hash', version: 3}; view.final_sha256 = 'final-hash';
 let controls = [];
 h.setFetch(async (url, opts) => {
  if (opts.method === 'POST') {
   const payload = JSON.parse(opts.body); controls.push(payload.action);
   if (payload.action === 'dispatch') {assert.equal(payload.arguments.expected_final_sha256, 'final-hash'); view.state = 'submitted';}
   else {assert.equal(payload.arguments.reason, '本人本次控制原因'); view.control_state = payload.action === 'archive' ? 'archived' : payload.action === 'pause' ? 'paused' : 'active';}
   return response(clone(view));
  }
  return response(url.includes('run_id=') ? clone(view) : {items: []});
 });
 await h.start(view.run_id); assert.ok(h.button('交接本次冻结成稿').props.disabled);
 await h.change('control_reason', '本人本次控制原因'); await h.click('确认归档');
 assert.ok(h.button('交接本次冻结成稿').props.disabled); await h.click('确认恢复可见');
 assert.deepEqual(controls, ['archive', 'restore']);
 assert.ok(h.button('交接本次冻结成稿').props.disabled, 'restore never approves dispatch');
 await h.change('dispatch_confirm', true); await h.click('交接本次冻结成稿'); assert.deepEqual(controls, ['archive', 'restore', 'dispatch']);
 assert.equal(view.current_version.article.title, article.title); await h.stop();
 console.log('PASS completed-receipt-only recovery, reversible archive/restore preserving article and separate frozen private-draft dispatch.');

 h = harness('EditorialFold'); h.storage.set('editorial-fold:owner:run:text', 'open'); await h.start();
 assert.equal(h.tree.props.open, true);
 h.tree.props.onToggle({currentTarget: {open: false}}); await h.flush();
 assert.equal(h.storage.get('editorial-fold:owner:run:text'), 'closed'); await h.stop();
 const second = harness('EditorialFold'); second.storage.set('editorial-fold:owner:run:text', 'closed'); await second.start();
 assert.equal(second.tree.props.open, false); await second.stop();
 console.log('PASS owner/run-scoped disclosure folding across refresh/navigation; storage holds only UI booleans.');
} finally {
 global.fetch = originalFetch; if (originalWindow === undefined) delete global.window; else global.window = originalWindow;
}
