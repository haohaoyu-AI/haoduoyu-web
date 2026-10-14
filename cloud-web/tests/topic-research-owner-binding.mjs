import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import Module from 'node:module';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';

// Execute the actual component and route with synthetic identity/storage/event
// adapters. This is an offline HTTP admission regression, never production QA.
const root = path.resolve(process.env.TOPIC_OWNER_SOURCE_ROOT || process.cwd());
const require = Module.createRequire(process.cwd() + '/package.json');
const ts = require('typescript');
const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const scope = owner => createHash('sha256').update('topic-research-owner:' + owner).digest('hex');
const calls = [], requests = [], runs = new Map();
const stamp = new Date().toISOString();
const makeRun = (id, state = 'queued') => ({ id, generation: 1, state, created: stamp, updated: stamp, input_hash: 'a'.repeat(64), input: { boards: [], history: {} }, result: state === 'completed' ? { featured: [], additional: [], coverage: { notice: 'OFFLINE fixture', checked_at: stamp }, shortfall: 'OFFLINE fixture' } : null, error: null, dispatch_state: 'pending', claim_expires: null, claimable: state === 'queued' });
const writingInput = {};
vm.runInNewContext(transpile(fs.readFileSync(path.join(root, 'lib/writing-input.ts'), 'utf8')), { exports: writingInput, require: () => ({}), crypto: webcrypto, TextEncoder });
class TopicResearchError extends Error {}
const route = {};
vm.runInNewContext(transpile(fs.readFileSync(path.join(root, 'app/api/topics/research/route.ts'), 'utf8')), {
  exports: route, Response, Request, URL, TextEncoder,
  require(name) {
    if (name.endsWith('/test-store')) return { owner: request => request.headers.get('oai-authenticated-user-id') };
    if (name.endsWith('/writing-input')) return writingInput;
    if (name.endsWith('/topic-research')) return { TopicResearchError, readTopicResearch: async (owner, id) => ({ owner_scope: scope(owner), connected: true, [id ? 'run' : 'current']: runs.get(owner) || null }) };
    if (name.endsWith('/topic-research-tools')) return { topicResearchCall: async (owner, name, args) => { calls.push({ owner, name, args }); const run = runs.get(owner) || makeRun('OFFLINE-' + owner); runs.set(owner, run); return { owner_scope: scope(owner), connected: true, run }; } };
    throw Error('Unexpected route dependency: ' + name);
  },
});
function post(owner, action, ownerScope) {
  return route.POST(new Request('https://offline.test/api/topics/research', { method: 'POST', headers: { origin: 'https://offline.test', 'x-topic-research': '1', ...(owner ? { 'oai-authenticated-user-id': owner } : {}), ...(ownerScope !== undefined ? { 'x-topic-owner-scope': ownerScope } : {}) }, body: JSON.stringify({ action, request_key: 'OFFLINE-key', research_id: 'OFFLINE-run' }) }));
}
for (const action of ['create', 'dispatch']) {
  for (const ownerScope of [scope('A'), undefined, '', 'invalid', 'A'.repeat(64)]) {
    const before = calls.length;
    const response = await post('B', action, ownerScope);
    assert.equal(response.status, 403, `${action} refuses wrong, missing or invalid owner scope before business admission`);
    assert.equal(calls.length, before);
    assert.match(response.headers.get('cache-control'), /private, no-store/);
  }
  const before = calls.length;
  assert.equal((await post('A', action, scope('A'))).status, 200);
  assert.equal(calls.length, before + 1, 'same-owner action is admitted exactly once');
}
assert.equal((await post(null, 'create', scope('A'))).status, 401);
for (const action of ['read', 'claim', 'save', 'fail', 'renew', 'recovery_preview', 'recover', 'settle']) {
  const before = calls.length;
  assert.equal((await post('A', action)).status, 200, action + ' retains its existing HTTP admission contract');
  assert.equal(calls.length, before + 1);
}
const beforeGet = calls.length;
assert.equal((await route.GET(new Request('https://offline.test/api/topics/research', { headers: { 'oai-authenticated-user-id': 'A' } }))).status, 200);
assert.equal(calls.length, beforeGet, 'GET stays read-only');
console.log('PASS actual route: wrong/missing/invalid scopes block create and dispatch before calls; matching scopes, GET and other actions retain admission');

// Reuse the established hook harness; its entrypoint is excluded. The harness
// loads actual TSX from root and runs the real shared useResearchClient.
const uiSource = fs.readFileSync(path.join(process.cwd(), 'tests/topic-research-ui.mjs'), 'utf8');
const prefix = uiSource.slice(0, uiSource.indexOf('(async()=>{')).replace('const root = process.cwd();', `const root = ${JSON.stringify(root)};`);
const harnessModule = new Module(path.join(process.cwd(), 'tests/topic-owner-harness.cjs'));
harnessModule.filename = path.join(process.cwd(), 'tests/topic-owner-harness.cjs');
harnessModule.paths = Module._nodeModulePaths(process.cwd());
harnessModule._compile(transpile(prefix + '\nmodule.exports = {harness, deferred};'), harnessModule.filename);
const { harness, deferred } = harnessModule.exports;
const postFlights = new Set();
const settle = async h => { await h.flush(); while (postFlights.size) { await Promise.allSettled([...postFlights]); await h.flush(); } };
let owner = 'A', adapter = null;
const transport = async (url, options) => {
  requests.push({ owner, method: options.method, body: options.body ? JSON.parse(options.body) : null, scope: options.headers?.['x-topic-owner-scope'] });
  if (adapter) { const override = await adapter(url, options); if (override) return override; }
  const request = new Request('https://offline.test' + url, { ...options, headers: { ...options.headers, origin: 'https://offline.test', 'oai-authenticated-user-id': owner } });
  if (options.method !== 'POST') return route.GET(request);
  const pending = route.POST(request); postFlights.add(pending);
  try { return await pending; } finally { postFlights.delete(pending); }
};
const resultNodes = h => h.nodes().filter(node => node.type === h.Component.ResearchResultView || node.props['data-previous-research-result']);
function reset() { owner = 'A'; adapter = null; runs.clear(); calls.length = 0; requests.length = 0; }

reset(); runs.set('A', makeRun('OLD-A', 'completed'));
let h = harness('components/topics/ResearchPanel.tsx'); h.setFetch(transport); h.render();
assert.ok(h.mainButton().props.disabled, 'initial unverified panel cannot write');
await h.start(); assert.equal(h.mainButton().props.disabled, false); assert.ok(resultNodes(h).length);
const lateA = deferred(); let holdRead = true;
adapter = async (_, options) => options.method === 'GET' && holdRead ? (holdRead = false, lateA.promise) : null;
await h.tick(30_000); owner = 'B'; await h.refresh(); await settle(h);
assert.equal(requests.find(request => request.method === 'POST').scope, scope('A'), 'POST carries the GET-confirmed A scope, never guessed B');
assert.equal(calls.length, 0, 'A view cannot admit a new B create');
assert.equal(resultNodes(h).length, 0); assert.ok(h.mainButton().props.disabled);
lateA.resolve(h.json({ current: makeRun('OLD-A', 'completed'), connected: true, owner_scope: scope('A') })); await h.flush();
assert.equal(resultNodes(h).length, 0, 'late A read cannot restore A after denial');
adapter = null; await h.event('focus'); assert.equal(h.mainButton().props.disabled, false); await h.refresh(); await settle(h);
assert.equal(calls.length, 1); assert.equal(calls[0].owner, 'B'); assert.equal(requests.at(-1).scope, scope('B'));
await h.stop();
console.log('PASS actual panel + route: A GET, silent auth B, A-scoped create denied; old private views and late A cleared; confirmed B remains usable');

for (const status of [401, 403]) {
  reset(); runs.set('A', makeRun('OLD-A', 'completed')); h = harness('components/topics/ResearchPanel.tsx'); h.setFetch(transport); await h.start();
  adapter = async (_, options) => options.method === 'POST' ? new Response('Denied', { status }) : null;
  await h.refresh(); assert.equal(calls.length, 0); assert.equal(resultNodes(h).length, 0); assert.ok(h.mainButton().props.disabled); await h.stop();
}
reset(); h = harness('components/topics/ResearchPanel.tsx'); h.setFetch(transport); await h.start();
let lost = true, readFailed = true;
adapter = async (_, options) => { if (options.method === 'POST' && lost) { lost = false; throw Error('OFFLINE lost response'); } if (options.method === 'GET' && readFailed) throw Error('OFFLINE read failed'); return null; };
await h.refresh(); assert.ok(h.button('刷新选题').props.disabled, 'unknown creation plus failed formal read cannot write');
const firstKey = requests.find(request => request.method === 'POST').body.request_key;
readFailed = false; await h.click('重新读取状态'); assert.equal(calls.length, 0, 'manual recovery is GET-only'); await h.refresh(); await settle(h);
assert.equal(requests.filter(request => request.method === 'POST').at(-1).body.request_key, firstKey);
assert.equal(calls.length, 1); await h.stop();
console.log('PASS status/unknown: plaintext 401/403 clears views; failed read blocks writes; confirmed same-scope recovery retains exact create key');

reset(); h = harness('app/topics/research-helper/page.tsx'); h.setFetch(transport); h.render();
assert.ok(h.button('刷新并创建研究').props.disabled); await h.start(); await h.click('刷新并创建研究'); await settle(h);
assert.equal(calls.length, 1); assert.equal(requests.find(request => request.method === 'POST').scope, scope('A'));
await h.click('重试待认领通知'); await settle(h); assert.equal(calls.length, 2); assert.equal(calls[1].name, 'retry_topic_research_dispatch'); assert.equal(requests.at(-1).scope, scope('A'));
owner = 'B'; await h.click('重试待认领通知'); await settle(h); assert.equal(calls.length, 2, 'helper A scope cannot dispatch under B');
assert.ok(!h.nodes().some(node => node.props['aria-label'] === '完整冻结研究输入')); assert.ok(h.button('刷新并创建研究').props.disabled); await h.stop();
reset(); h = harness('app/topics/research-helper/page.tsx'); h.setFetch(transport);
adapter = async () => { throw Error('OFFLINE initial read failed'); }; await h.start(); assert.ok(h.button('刷新并创建研究').props.disabled);
adapter = null; await h.click('读取最新任务'); await h.click('刷新并创建研究'); await settle(h); assert.equal(calls.length, 1); await h.stop();
reset(); h = harness('app/topics/research-helper/page.tsx'); h.setFetch(transport); await h.start();
let helperLost = true;
adapter = async (_, options) => { if (options.method === 'POST' && helperLost) { helperLost = false; throw Error('OFFLINE lost helper response'); } return null; };
await h.click('刷新并创建研究'); await settle(h);
const helperKey = requests.find(request => request.method === 'POST').body.request_key;
await h.click('重试同一创建请求'); await settle(h);
assert.equal(requests.filter(request => request.method === 'POST').at(-1).body.request_key, helperKey);
assert.equal(requests.at(-1).scope, scope('A')); assert.equal(calls.length, 1);
helperLost = true; await h.click('重试待认领通知'); await settle(h); assert.equal(calls.length, 1, 'unknown helper dispatch readback never creates another run');
await h.click('重试待认领通知'); await settle(h); assert.equal(calls.length, 2); assert.equal(calls[1].args.research_id, 'OFFLINE-A'); await h.stop();
console.log('PASS actual helper + shared client + route: initial/failed reads block create; confirmed create and dispatch work; wrong scope clears private helper view');
console.log('LIMITS: actual component/shared client/HTTP handler/hashText, synthetic identity/storage/business adapters only; zero production, provider, platform, schema or MCP tool changes.');
