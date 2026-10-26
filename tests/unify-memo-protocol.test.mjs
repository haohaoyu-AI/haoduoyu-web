import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {createMemoryDB} from '../web/offline/db.mjs';
import {createOfflineRuntime} from '../web/offline/runtime.mjs';
import {createMemosStore} from '../web/core/memos-state.mjs';

const memoryStorage = () => { const data = new Map();
  return {getItem: key => data.get(key), setItem: (key, value) => data.set(key, value)}; };
async function setup(t) {
  const app = await fixture(t), session = await app.login();
  const owner = (await app.request('/api/v1/auth/me', {session})).data.id;
  const env = {DB: app.db, SITE_ORIGIN: app.origin, PUBLIC_BUSINESS_MODE: '0', PUBLIC_BUSINESS_USER_ID: owner,
    PUBLIC_BUSINESS_ACCOUNT_IDS: '[]', MEMOS_OWNER_ID: owner, DAILY_NOTES_OWNER_ID: owner};
  const db = createMemoryDB(), clock = {value: Date.now()}, network = {online: true, after: null}, calls = [];
  async function live(path, options = {}) {
    const method = options.method || 'GET', body = options.body;
    calls.push({path, method, body: body === undefined ? null : structuredClone(body)});
    const headers = {Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken, Origin: app.origin};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await worker.fetch(new Request(app.origin + '/api/v1' + path, {method, headers,
      body: body === undefined ? undefined : JSON.stringify(body)}), env);
    const payload = await response.json();
    if (!response.ok) throw Object.assign(new Error(payload.error.message), {status: response.status, code: payload.error.code});
    return payload.data;
  }
  const request = async (path, options = {}) => {
    if (!network.online) throw Object.assign(new Error('synthetic offline'), {code: 'NETWORK_UNAVAILABLE'});
    const value = await live(path, options);
    return network.after ? network.after(path, options, value) : value;
  };
  const runtime = createOfflineRuntime({db, request, online: () => network.online, now: () => clock.value});
  const makeStore = (options = {}) => {
    const store = createMemosStore({request: runtime.call, readLocal: runtime.readMemo, durable: true,
      resolveLocal: runtime.resolve, ownerId: owner, storage: memoryStorage(), draftScope: randomUUID(),
      online: () => network.online, delay: 60000, ...options});
    t.after(() => store.dispose()); return store;
  };
  t.after(() => runtime.stop());
  await runtime.call('/auth/me');
  return {...app, owner, db, runtime, clock, network, calls, live, makeStore};
}
const puts = (app, path) => app.calls.filter(call => call.path === path && call.method === 'PUT');
async function seed(f) {
  const group = randomUUID(), id = randomUUID();
  await f.live('/memos/groups/' + group, {method: 'PUT',
    body: {title: '【自动测试】既有分组', position: 0, version: 0, save_id: randomUUID()}});
  await f.live('/memos/notes/' + id, {method: 'PUT',
    body: {group_id: group, title: '【自动测试】既有笔记', body: '【自动测试】线上原文', position: 0,
      version: 0, save_id: randomUUID()}});
  return {group, id};
}

test('real Worker persists offline memo group and three edits in dependency order after reopen', async t => {
  const f = await setup(t), store = f.makeStore(); await store.load(); f.network.online = false;
  const group = await store.createGroup('【自动测试】本机创建组'), id = await store.createNote(group, '【自动测试】本机笔记');
  for (const text of ['【自动测试】一稿', '【自动测试】二稿', '【自动测试】三稿']) {
    store.edit('body', text); await store.saveNote();
  }
  assert.equal(store.drafts.get(id).version, 0); assert.equal(store.drafts.get(id).localVersion, 4);
  store.dispose(); const reopened = f.makeStore(); await reopened.load();
  assert.equal(reopened.drafts.get(id).body, '【自动测试】三稿');
  f.network.online = true; await f.runtime.sync(); await reopened.load({local: true});
  const note = await f.live('/memos/notes/' + id);
  assert.equal(note.body, '【自动测试】三稿'); assert.equal(note.version, 4);
  assert.equal(reopened.drafts.get(id).version, 4); assert.equal(reopened.drafts.get(id).localQueued, false);
  assert.equal(puts(f, '/memos/groups/' + group).length, 1); assert.equal(puts(f, '/memos/notes/' + id).length, 4);
  assert.equal((await f.runtime.queue()).operations.length, 0);
});

test('real committed-but-unknown parent receipt must be confirmed before its child can send', async t => {
  const f = await setup(t), store = f.makeStore(); await store.load(); f.network.online = false;
  const group = await store.createGroup('【自动测试】待核对父组'), id = await store.createNote(group, '【自动测试】子笔记');
  let lost = false;
  f.network.after = (path, options, value) => {
    if (path === '/memos/groups/' + group && options.method === 'PUT' && !lost) {
      lost = true; throw new Error('synthetic loss after real parent commit');
    }
    return value;
  };
  f.network.online = true; await f.runtime.sync();
  const index = await f.live('/memos'); assert.equal(index.groups.length, 1); assert.equal(index.notes.length, 0);
  const pending = (await f.runtime.queue()).operations;
  assert.equal(pending.find(row => row.entity_type === 'memo_group').status, 'unknown');
  assert.equal(puts(f, '/memos/notes/' + id).length, 0);
  f.clock.value += 5000; await f.runtime.sync();
  assert.equal(puts(f, '/memos/groups/' + group).length, 1); assert.equal(puts(f, '/memos/notes/' + id).length, 1);
  assert.equal((await f.runtime.queue()).operations.length, 0);
});

test('a real remote soft deletion creates a two-copy conflict without reviving the memo', async t => {
  const f = await setup(t), {id} = await seed(f), store = f.makeStore(); await store.load();
  f.network.online = false; store.edit('body', '【自动测试】本机未发正文'); await store.saveNote();
  await f.live('/memos/notes/' + id, {method: 'DELETE', body: {version: 1, save_id: randomUUID()}});
  f.network.online = true; await f.runtime.sync(); await store.load({local: true});
  const [conflict] = (await f.runtime.queue()).conflicts;
  assert.equal(conflict.local.body, '【自动测试】本机未发正文');
  assert.equal(conflict.remote.body, '【自动测试】线上原文'); assert.ok(conflict.remote.deleted_at);
  assert.equal(store.drafts.get(id).phase, 'conflict'); assert.equal(store.drafts.get(id).body, '【自动测试】本机未发正文');
  const server = await f.live('/memos/notes/' + id);
  assert.equal(server.version, 2); assert.ok(server.deleted_at);
  assert.ok(!f.calls.some(call => call.path.endsWith('/restore')));
});

test('real old unknown memo save imports its original receipt and never reissues its successful PUT', async t => {
  const f = await setup(t), {id} = await seed(f), saved = memoryStorage(), draftScope = randomUUID();
  await f.runtime.call('/memos');
  const legacy = f.makeStore({durable: false, storage: saved, draftScope, request: async (path, options) => {
    const value = await f.live(path, options);
    if (path === '/memos/notes/' + id && options?.method === 'PUT') throw new Error('synthetic old unknown response');
    return value;
  }});
  await legacy.load(); legacy.edit('body', '【自动测试】旧页已提交正文'); await legacy.saveNote();
  const original = structuredClone(legacy.drafts.get(id).pending); legacy.dispose();
  f.network.online = false;
  const reopened = f.makeStore({storage: saved, draftScope}); await reopened.load(); await reopened.checkNote();
  const [pending] = (await f.runtime.queue()).operations;
  assert.equal(pending.status, 'unknown'); assert.equal(pending.save_id, original.body.save_id);
  f.network.online = true; await f.runtime.sync(); await reopened.load({local: true});
  assert.equal((await f.runtime.queue()).operations.length, 0);
  assert.equal(puts(f, '/memos/notes/' + id).length, 2);
  assert.equal(reopened.drafts.get(id).body, '【自动测试】旧页已提交正文'); assert.equal(reopened.drafts.get(id).version, 2);
});
