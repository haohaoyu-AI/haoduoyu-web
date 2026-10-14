// Execute the actual page TSX with the existing controlled hooks/transport.
// No browser, backend write, provider, production receiver or platform action.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const root = path.resolve(process.env.DEDAO_PENDING_UI_SOURCE_ROOT || process.cwd());
const helper = path.resolve('tests/offline-eight-interactions-ui.mjs');
const source = fs.readFileSync(helper, 'utf8'), helperEnd = source.indexOf('const discovery =');
assert.ok(helperEnd > 0, 'reuse only the existing hook harness, without its scenarios');
const exports = {};
vm.runInNewContext(ts.transpileModule(source.slice(0, helperEnd)
  .replaceAll('import.meta.url', JSON.stringify(pathToFileURL(helper).href)) +
  '\nexports.harness=harness;exports.text=text;exports.elements=elements;',
  {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText,
{exports, require: createRequire(pathToFileURL(helper)), URL, Response, AbortSignal, AbortController, DOMException});
const {harness, text} = exports;
const ownerA = 'OFFLINE-VERIFIED-OWNER-A', ownerB = 'OFFLINE-VERIFIED-OWNER-B';
const recoveryLabel = '恢复本篇成文';
const cloud = (task, owner_scope = ownerA, ready = true) => ({owner_scope, connection: {ready, notice: 'OFFLINE connection status'}, task,
  instructions: {conversation_url: 'https://example.test/offline-conversation', stages: []}});
const pending = (request_key = randomUUID(), change = {}) => ({id: randomUUID(), request_key, state: 'queued', article_id: null,
  updated: '2026-10-14T00:00:00.000Z', dispatch_state: 'pending', private_drafts_complete: false,
  writer_ended: false, writing_executor_registered: false, downstream_status: 'not_bound', ...change});
const posts = h => h.requests.filter(request => request.options.method === 'POST');
const page = options => harness(path.join(root, 'app/dedao/page.tsx'), options);
async function initial(h, task = null, owner = ownerA, ready = true) {
  await h.start(); h.requests[0].respond(cloud(task, owner, ready)); await h.settle();
}
function assertOriginalPost(request, task, owner = ownerA) {
  assert.equal(request.options.method, 'POST'); assert.equal(request.body.request_key, task.request_key);
  assert.equal(request.body.owner_scope, owner); assert.deepEqual(Object.keys(request.body).sort(), ['owner_scope', 'request_key']);
}

await test('POST 409 then same-key GET offers explicit recovery and repeated clicks send one original-key POST', async () => {
  const h = page(); await initial(h); await h.click('一键成文');
  const first = h.requests[1], saved = pending(first.body.request_key);
  first.respond({error: '启动结果未确认，请读取同一次请求'}, 409); await h.settle();
  assert.equal(h.requests.length, 3); assert.equal(h.requests[2].options.method, undefined);
  h.requests[2].respond(cloud(saved)); await h.settle();
  const recovery = h.button(recoveryLabel); assert.ok(recovery, 'durable pending task must expose a recovery action');
  assert.equal(recovery.props.disabled, false); assert.equal(posts(h).length, 1);
  recovery.props.onClick(); recovery.props.onClick(); await h.settle();
  assert.equal(posts(h).length, 2); assertOriginalPost(posts(h)[1], saved);
  assert.equal(h.button('正在提交…').props.disabled, true);
  assert.equal(JSON.parse(h.storage.get('dedao-cloud-request')).key, saved.request_key);
  posts(h)[1].respond(cloud({...saved, dispatch_state: 'accepted'})); await h.settle();
  assert.equal(h.button(recoveryLabel), undefined); assert.equal(h.button('当前文章处理中').props.disabled, true);
  assert.equal(h.storage.has('dedao-cloud-request'), false); assert.match(text(h.tree), new RegExp(saved.id));
});

for (const options of [{}, {storageUnavailable: true}]) {
  await test(`reload discovers original pending task and recovers without a local pointer ${JSON.stringify(options)}`, async () => {
    const h = page(options), saved = pending(); await initial(h, saved);
    assert.equal(posts(h).length, 0); assert.equal(h.button(recoveryLabel).props.disabled, false);
    await h.poll(5000); h.requests[1].respond(cloud(saved)); await h.settle();
    await h.event('focus'); h.requests[2].respond(cloud(saved)); await h.settle();
    assert.equal(posts(h).length, 0, 'reads and focus never dispatch automatically');
    await h.click(recoveryLabel); assert.equal(posts(h).length, 1); assertOriginalPost(posts(h)[0], saved);
    posts(h)[0].respond(cloud({...saved, dispatch_state: 'accepted'})); await h.settle();
    assert.equal(h.button(recoveryLabel), undefined); assert.doesNotMatch(text(h.tree), /storage disabled/);
  });
}

await test('the persisted task key overrides a different same-owner optional local pointer only on explicit recovery', async () => {
  const saved = pending(), old = randomUUID(), h = page({storageSeed: [['dedao-cloud-request', JSON.stringify({key: old, owner_scope: ownerA})]]});
  await initial(h, saved); assert.equal(posts(h).length, 0); await h.click(recoveryLabel);
  assertOriginalPost(posts(h)[0], saved); assert.notEqual(posts(h)[0].body.request_key, old);
});

for (const change of [
  {dispatch_state: 'sending'}, {dispatch_state: 'unknown'}, {dispatch_state: 'accepted'},
  {writing_executor_registered: true}, {writing_executor_registered: undefined},
  {state: 'writing'}, {state: 'processing'}, {state: 'completed'}, {request_key: ''}, {request_key: 'not-a-valid-original-key'},
]) {
  await test(`no recovery entry or implicit POST for ${JSON.stringify(change)}`, async () => {
    const h = page(), saved = pending(randomUUID(), change); await initial(h, saved);
    assert.equal(h.button(recoveryLabel), undefined); assert.equal(posts(h).length, 0);
    if (saved.state !== 'completed') {
      const main = h.button('当前文章处理中'); assert.ok(main); assert.equal(main.props.disabled, true);
      main.props.onClick(); await h.settle(); assert.equal(posts(h).length, 0);
    }
  });
}

await test('disconnected pending task keeps its key and requires a verified connection read before recovery', async () => {
  const h = page(), saved = pending(); await initial(h, saved, ownerA, false);
  const recovery = h.button(recoveryLabel); assert.ok(recovery); assert.equal(recovery.props.disabled, true);
  recovery.props.onClick(); await h.settle(); assert.equal(posts(h).length, 0);
  await h.poll(5000); h.requests[1].respond(cloud(saved)); await h.settle();
  await h.click(recoveryLabel); assertOriginalPost(posts(h)[0], saved);
});

await test('failed recovery only reads; a verified pending result allows another explicit same-key action', async () => {
  const h = page(), saved = pending(); await initial(h, saved); await h.click(recoveryLabel);
  posts(h)[0].respond({error: 'OFFLINE recovery result is uncertain'}, 409); await h.settle();
  const readback = h.requests[2]; assert.equal(readback.options.method, undefined);
  readback.respond(cloud(saved)); await h.settle(); assert.equal(posts(h).length, 1);
  await h.click(recoveryLabel); assert.equal(posts(h).length, 2); assertOriginalPost(posts(h)[1], saved);
});

await test('a lost recovery/readback retains the same key until an explicit successful GET', async () => {
  const h = page(), saved = pending(); await initial(h, saved); const staleButton = h.button(recoveryLabel); await h.click(recoveryLabel);
  posts(h)[0].reject(Error('OFFLINE POST receipt loss')); await h.settle();
  h.requests[2].reject(Error('OFFLINE GET receipt loss')); await h.settle();
  assert.equal(JSON.parse(h.storage.get('dedao-cloud-request')).key, saved.request_key);
  assert.equal(h.button(recoveryLabel).props.disabled, true); assert.equal(posts(h).length, 1);
  staleButton.props.onClick(); await h.settle(); assert.equal(posts(h).length, 1, 'unknown POST/GET results invalidate even a retained old handler');
  await h.click('重试读取'); h.requests[3].respond(cloud(saved)); await h.settle();
  assert.equal(posts(h).length, 1); await h.click(recoveryLabel); assertOriginalPost(posts(h)[1], saved);
});

await test('a current pending read failure fences old recovery handlers until a verified GET', async () => {
  const h = page(), saved = pending(); await initial(h, saved); const staleButton = h.button(recoveryLabel);
  await h.poll(5000); h.requests[1].reject(Error('OFFLINE current pending GET failure')); await h.settle();
  assert.equal(h.button(recoveryLabel).props.disabled, true); staleButton.props.onClick(); await h.settle();
  assert.equal(posts(h).length, 0);
  await h.click('重试读取'); h.requests[2].respond(cloud(saved)); await h.settle();
  await h.click(recoveryLabel); assertOriginalPost(posts(h)[0], saved);
});

for (const change of [{dispatch_state: 'unknown'}, {dispatch_state: 'sending'}, {dispatch_state: 'accepted'},
  {state: 'writing', writing_executor_registered: true}, {state: 'processing', writing_executor_registered: true}, {state: 'completed'}]) {
  await test(`unknown POST readback ${JSON.stringify(change)} cannot resend via the retained old button`, async () => {
    const h = page(), saved = pending(); await initial(h, saved);
    const staleButton = h.button(recoveryLabel); await h.click(recoveryLabel);
    posts(h)[0].reject(Error('OFFLINE POST receipt loss')); await h.settle();
    h.requests[2].respond(cloud({...saved, ...change})); await h.settle();
    assert.equal(h.button(recoveryLabel), undefined); assert.equal(posts(h).length, 1);
    staleButton.props.onClick(); await h.settle(); assert.equal(posts(h).length, 1, 'old closure cannot retry a newer protected state or create another key');
  });
}

await test('a pending GET begun before recovery cannot overwrite the accepted same-owner POST', async () => {
  const h = page({ignoreAbort: true}), saved = pending(); await initial(h, saved);
  await h.poll(5000); const stale = h.requests[1]; await h.click(recoveryLabel);
  posts(h)[0].respond(cloud({...saved, dispatch_state: 'accepted'})); await h.settle();
  stale.respond(cloud(saved)); await h.settle();
  assert.equal(h.button(recoveryLabel), undefined); assert.equal(posts(h).length, 1);
});

for (const status of [200, 401, 403]) {
  await test(`late owner-A recovery POST/GET ${status} cannot resurrect A or replace owner B's key`, async () => {
    const h = page({ignoreAbort: true}), saved = pending(); await initial(h, saved);
    const oldButton = h.button(recoveryLabel); await h.click(recoveryLabel); const oldPost = posts(h)[0];
    await h.event('focus'); const oldRead = h.requests[2]; await h.event('visibilitychange');
    h.requests[3].respond(cloud(null, ownerB)); await h.settle();
    assert.equal(h.storage.has('dedao-cloud-request'), false); assert.equal(h.button('正在提交…').props.disabled, true);
    oldRead.respond(status === 200 ? cloud(saved) : {error: 'OFFLINE old owner refusal'}, status);
    oldPost.respond(status === 200 ? cloud({...saved, dispatch_state: 'accepted'}) : {error: 'OFFLINE old owner refusal'}, status);
    await h.settle(); assert.doesNotMatch(text(h.tree), new RegExp(saved.id)); assert.doesNotMatch(text(h.tree), /old owner refusal/);
    assert.equal(h.button(recoveryLabel), undefined); oldButton.props.onClick(); await h.settle(); assert.equal(posts(h).length, 1);
    await h.click('一键成文'); const next = posts(h)[1];
    assert.equal(next.body.owner_scope, ownerB); assert.notEqual(next.body.request_key, saved.request_key);
  });
}

for (const status of [401, 403]) {
  await test(`recovery POST ${status} clears account data/pointer and does not issue an automatic GET`, async () => {
    const h = page(), saved = pending(); await initial(h, saved); await h.click(recoveryLabel);
    posts(h)[0].respond({error: 'OFFLINE current authentication refusal'}, status); await h.settle();
    assert.equal(h.requests.length, 2); assert.equal(h.storage.has('dedao-cloud-request'), false);
    assert.equal(h.button(recoveryLabel), undefined); assert.doesNotMatch(text(h.tree), new RegExp(saved.id));
    await h.click('重试读取'); h.requests[2].respond(cloud(null, ownerB)); await h.settle();
    await h.click('一键成文'); assert.equal(posts(h)[1].body.owner_scope, ownerB);
    assert.notEqual(posts(h)[1].body.request_key, saved.request_key);
  });
}

await test('an unverified response owner cannot expose recovery or silently replace a legacy unresolved intent', async () => {
  const h = page(), saved = pending(); await h.start();
  const invalid = cloud(saved); delete invalid.owner_scope; h.requests[0].respond(invalid); await h.settle();
  assert.equal(h.button(recoveryLabel), undefined); assert.equal(posts(h).length, 0);
  const legacy = page({storageSeed: [['dedao-cloud-request', 'OFFLINE-unscoped-unknown-request']]}); await initial(legacy, saved);
  assert.equal(legacy.button(recoveryLabel).props.disabled, true); legacy.button(recoveryLabel).props.onClick(); await legacy.settle();
  assert.equal(posts(legacy).length, 0); assert.match(text(legacy.tree), /旧请求的登录账号尚未核对/);
});
