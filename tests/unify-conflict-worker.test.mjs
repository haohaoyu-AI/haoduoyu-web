import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {beijingDay} from '../src/lib/time.mjs';
import {createMemoryDB} from '../web/offline/db.mjs';
import {createOfflineRuntime} from '../web/offline/runtime.mjs';

const read = (db, store, key) => db.transaction([store], 'readonly', tx => tx.get(store, key));
const notePath = id => '/note-entries/' + id;
const memoPath = id => '/memos/notes/' + id;
const noteBody = (date, text, version = 0) => ({category: 'life', date, text, version, save_id: randomUUID()});
const groupBody = (title, version = 0) => ({title, position: 0, version, save_id: randomUUID()});
const memoBody = (group_id, body, version = 0) => ({group_id, title: '【自动测试】冲突笔记', body,
  position: 0, version, save_id: randomUUID()});
async function setup(t) {
  const app = await fixture(t), session = await app.login();
  const owner = (await app.request('/api/v1/auth/me', {session})).data.id;
  const env = {DB: app.db, SITE_ORIGIN: app.origin, PUBLIC_BUSINESS_MODE: '0', PUBLIC_BUSINESS_USER_ID: owner,
    PUBLIC_BUSINESS_ACCOUNT_IDS: '[]', DAILY_NOTES_OWNER_ID: owner, MEMOS_OWNER_ID: owner};
  const db = createMemoryDB(), calls = [], clock = {value: Date.now()}, source = {online: true, afterResponse: null}, runtimes = [];
  t.after(() => { source.online = false; for (const runtime of runtimes) runtime.stop(); });
  async function live(path, {method = 'GET', body, signal, headers: extraHeaders = {}} = {}) {
    const call = {path, method, body: body === undefined ? null : structuredClone(body)}; calls.push(call);
    const headers = {Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken, Origin: app.origin, ...extraHeaders};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await worker.fetch(new Request(app.origin + '/api/v1' + path, {method, headers, signal,
      ...(body === undefined ? {} : {body: JSON.stringify(body)})}), env);
    call.status = response.status;
    const value = await response.json();
    if (!response.ok) throw Object.assign(new Error(value.error.message), {status: response.status, code: value.error.code});
    return value.data;
  }
  async function request(path, options) {
    if (!source.online) throw Object.assign(new Error('Synthetic offline'), {code: 'NETWORK_UNAVAILABLE'});
    const result = await live(path, options);
    return source.afterResponse ? source.afterResponse(path, options || {}, result) : result;
  }
  async function runtime() {
    const result = createOfflineRuntime({db, request, now: () => clock.value, online: () => source.online});
    runtimes.push(result); await result.call('/auth/me'); return result;
  }
  return {db, calls, clock, source, live, runtime, date: beijingDay(clock.value)};
}
// The synthetic clock is frozen: an overlapping sync may legitimately record an
// unknown network result while the fixture switches offline. Advance only to the
// persisted retry deadline and require the same durable operation to be reconciled.
async function syncUntil(f, runtime, predicate) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await runtime.sync();
    const queue = await runtime.queue();
    if (await predicate(queue)) return;
    const retry = queue.operations.filter(row => row.status === 'unknown' || row.status === 'retry');
    if (retry.length) {
      assert.ok(retry.every(row => Number.isFinite(row.next_attempt_at) && row.next_attempt_at > 0));
      f.clock.value = Math.max(f.clock.value, ...retry.map(row => row.next_attempt_at));
    }
  }
  assert.fail('the durable operation did not reach the expected conflict or server acknowledgement');
}
async function clash(f, runtime, path, method, local, remote) {
  f.source.online = false; await runtime.call(path, {method, body: local});
  const operation = (await runtime.queue()).operations.find(row => row.path === path);
  assert.ok(operation, 'the original local request must be durable');
  await f.live(path, {method, body: remote});
  f.source.online = true; await syncUntil(f, runtime, queue => queue.conflicts.some(row => row.entity_id === operation.entity_id));
  const conflict = (await runtime.queue()).conflicts.find(row => row.entity_id === operation.entity_id);
  assert.ok(conflict, 'the real Worker version conflict must retain both bodies');
  return {conflict, operation};
}
async function choose(f, runtime, conflict, choice, options = {}) {
  const result = await runtime.resolve(conflict.key, choice, options); f.source.online = false;
  assert.ok(result.resolution, result.resolution_message || 'a real decision must be queued');
  assert.equal(result.resolution.state, 'queued'); assert.equal(result.resolved_at, null);
  const operations = (await runtime.queue()).operations.filter(row => row.resolution_id === result.resolution.id);
  assert.ok(operations.length); assert.ok(operations.every(row => row.protocol === (conflict.operation.protocol === 5 ? 5 : 3) && row.resolution_receipt === 1));
  return {result, operations};
}
async function complete(f, runtime, key) {
  f.source.online = true; await syncUntil(f, runtime, async () => (await read(f.db, 'conflicts', key))?.resolution?.state === 'synced');
  const conflict = await read(f.db, 'conflicts', key);
  assert.equal(conflict.resolution.state, 'synced'); assert.equal(conflict.resolved_at, f.clock.value);
  assert.ok(conflict.resolution.acknowledgements.length); return conflict;
}
async function preserved(f, operation) {
  const archived = await read(f.db, 'outbox', operation.key);
  assert.equal(archived.status, 'archived'); assert.equal(archived.save_id, operation.save_id);
  assert.deepEqual(archived.body, operation.body); return archived;
}
async function seedNote(f, runtime, text = '【自动测试】原碎碎念') {
  const id = randomUUID(); await f.live(notePath(id), {method: 'PUT', body: noteBody(f.date, text)});
  await runtime.call('/note-entries?category=life&date=' + f.date); return id;
}
async function seedMemo(f, runtime, group = randomUUID()) {
  const index = await f.live('/memos');
  if (!index.groups.some(row => row.id === group))
    await f.live('/memos/groups/' + group, {method: 'PUT', body: groupBody('【自动测试】原分组')});
  const id = randomUUID(); await f.live(memoPath(id), {method: 'PUT', body: memoBody(group, '【自动测试】原笔记正文')});
  await runtime.call('/memos'); await runtime.call(memoPath(id)); return {id, group};
}

test('real note use-local writes fresh CAS and a new save id, then closes its ledger only on an actual ACK', async t => {
  const f = await setup(t), runtime = await f.runtime(), id = await seedNote(f, runtime);
  const {conflict, operation} = await clash(f, runtime, notePath(id), 'PUT',
    noteBody(f.date, '【自动测试】选择本机稿', 1), noteBody(f.date, '【自动测试】独立线上稿', 1));
  const {result, operations} = await choose(f, runtime, conflict, 'use-local');
  assert.equal(operations.length, 1); assert.equal(operations[0].body.version, 2);
  assert.notEqual(operations[0].save_id, operation.save_id); assert.equal(operations[0].source_id, id);
  await preserved(f, operation); await complete(f, runtime, conflict.key);
  const remote = await f.live(notePath(id));
  assert.equal(remote.version, 3); assert.equal(remote.text, '【自动测试】选择本机稿');
  assert.match(remote.content_hash, /^[a-f0-9]{64}$/);
  const ledger = await read(f.db, 'conflicts', conflict.key);
  assert.deepEqual(ledger.original_operation, conflict.operation); assert.equal(ledger.resolution.id, result.resolution.id);
  assert.equal(ledger.local.text, conflict.local.text); assert.equal(ledger.remote.text, conflict.remote.text);
});

test('real note keep-both creates one new UUID and leaves the original remote version and text intact', async t => {
  const f = await setup(t), runtime = await f.runtime(), id = await seedNote(f, runtime);
  const {conflict, operation} = await clash(f, runtime, notePath(id), 'PUT',
    noteBody(f.date, '【自动测试】需要留存的本机稿', 1), noteBody(f.date, '【自动测试】需要留存的线上稿', 1));
  const {result, operations} = await choose(f, runtime, conflict, 'keep-both');
  const copy = result.resolution.target_id; assert.notEqual(copy, id); assert.equal(operations[0].body.version, 0);
  await preserved(f, operation); await complete(f, runtime, conflict.key);
  const original = await f.live(notePath(id)), copied = await f.live(notePath(copy));
  assert.equal(original.version, 2); assert.equal(original.text, '【自动测试】需要留存的线上稿');
  assert.equal(copied.version, 1); assert.equal(copied.text, '【自动测试】需要留存的本机稿');
  assert.equal((await f.live('/note-entries?category=life&date=' + f.date)).entries.length, 2);
});

test('real todo decisions use supported completion CAS and create a completed copy through ordered POST then PATCH', async t => {
  const f = await setup(t), runtime = await f.runtime();
  async function conflict() {
    const id = randomUUID(); await f.live('/todos', {method: 'POST', body: {id, date: f.date, text: '【自动测试】冲突待办'}});
    await runtime.call('/todos?date=' + f.date);
    return {id, ...await clash(f, runtime, '/todos/' + id, 'PATCH', {completed: true, version: 1}, {completed: false, version: 1})};
  }
  const first = await conflict(), replace = await choose(f, runtime, first.conflict, 'use-local');
  assert.deepEqual(replace.operations[0].body, {completed: true, version: 2}); await complete(f, runtime, first.conflict.key);
  const second = await conflict(), copied = await choose(f, runtime, second.conflict, 'keep-both');
  assert.deepEqual(copied.operations.map(row => [row.method, row.body.version ?? 0]), [['POST', 0], ['PATCH', 1]]);
  await complete(f, runtime, second.conflict.key);
  const items = (await f.live('/todos?date=' + f.date)).items;
  assert.equal(items.find(row => row.id === first.id).completed, true);
  assert.equal(items.find(row => row.id === second.id).completed, false);
  const copy = items.find(row => row.id === copied.result.resolution.target_id);
  assert.equal(copy.completed, true); assert.equal(copy.version, 2); assert.equal(items.length, 3);
  const writes = f.calls.filter(row => row.method !== 'GET' &&
    (row.body?.id === copy.id || row.path === '/todos/' + copy.id));
  assert.deepEqual(writes.map(row => row.method), ['POST', 'PATCH']);
});

test('real template choices PATCH the fresh version or create a new independent template UUID', async t => {
  const f = await setup(t), runtime = await f.runtime();
  async function conflict() {
    const id = randomUUID(); await f.live('/todo-templates', {method: 'POST', body: {id, text: '【自动测试】原常用项'}});
    await runtime.call('/todo-templates');
    return {id, ...await clash(f, runtime, '/todo-templates/' + id, 'PATCH',
      {text: '【自动测试】本机常用项', version: 1}, {text: '【自动测试】线上常用项', version: 1})};
  }
  const first = await conflict(), replaced = await choose(f, runtime, first.conflict, 'use-local');
  assert.equal(replaced.operations[0].body.version, 2); await complete(f, runtime, first.conflict.key);
  const second = await conflict(), copied = await choose(f, runtime, second.conflict, 'keep-both');
  assert.notEqual(copied.result.resolution.target_id, second.id); await complete(f, runtime, second.conflict.key);
  const items = (await f.live('/todo-templates')).items;
  assert.equal(items.find(row => row.id === first.id).text, '【自动测试】本机常用项');
  assert.equal(items.find(row => row.id === second.id).text, '【自动测试】线上常用项');
  assert.equal(items.find(row => row.id === copied.result.resolution.target_id).text, '【自动测试】本机常用项');
});

test('real memo note overwrite and copy retain full bodies with a verified live parent group', async t => {
  const f = await setup(t), runtime = await f.runtime(), first = await seedMemo(f, runtime);
  async function conflict(entry) {
    return clash(f, runtime, memoPath(entry.id), 'PUT', memoBody(entry.group, '【自动测试】本机完整正文', 1),
      memoBody(entry.group, '【自动测试】线上完整正文', 1));
  }
  const one = await conflict(first), replacement = await choose(f, runtime, one.conflict, 'use-local');
  assert.equal(replacement.operations[0].body.version, 2); await complete(f, runtime, one.conflict.key);
  assert.equal((await f.live(memoPath(first.id))).body, '【自动测试】本机完整正文');
  const second = await seedMemo(f, runtime, first.group), two = await conflict(second);
  const copied = await choose(f, runtime, two.conflict, 'keep-both'); await complete(f, runtime, two.conflict.key);
  const copy = await f.live(memoPath(copied.result.resolution.target_id));
  assert.equal(copy.body, '【自动测试】本机完整正文'); assert.equal(copy.group_id, first.group); assert.equal(copy.version, 1);
  assert.equal((await f.live(memoPath(second.id))).body, '【自动测试】线上完整正文'); await preserved(f, two.operation);
});

test('a real deleted memo parent produces a new fallback parent and dependent copy without restoring either old ID', async t => {
  const f = await setup(t), runtime = await f.runtime(), entry = await seedMemo(f, runtime);
  f.source.online = false;
  await runtime.call(memoPath(entry.id), {method: 'PUT', body: memoBody(entry.group, '【自动测试】删除分组后仍保留正文', 1)});
  await f.live('/memos/groups/' + entry.group, {method: 'DELETE', body: {version: 1, save_id: randomUUID(),
    confirm_title: '【自动测试】原分组', confirm_note_count: 1}});
  f.source.online = true; await runtime.sync();
  const conflict = (await runtime.queue()).conflicts.find(row => row.entity_id === 'memo-note:' + entry.id);
  assert.ok(conflict); const {operations, result} = await choose(f, runtime, conflict, 'keep-both');
  assert.equal(operations.length, 2); assert.deepEqual(operations.map(row => row.entity_type), ['memo_group', 'memo_note']);
  const group = operations[0].source_id;
  assert.notEqual(group, entry.group); assert.deepEqual(operations[1].depends_on, ['memo-group:' + group]);
  await complete(f, runtime, conflict.key);
  const index = await f.live('/memos'), copy = await f.live(memoPath(result.resolution.target_id));
  assert.ok(index.groups.find(row => row.id === entry.group).deleted_at); assert.equal(copy.group_id, group);
  assert.equal(copy.body, '【自动测试】删除分组后仍保留正文'); assert.equal((await f.live(memoPath(entry.id))).version, 1);
  assert.equal(f.calls.filter(row => row.method === 'POST' && row.path.endsWith('/restore')).length, 0);
  const sent = f.calls.filter(row => row.method === 'PUT' && ['/memos/groups/' + group, memoPath(copy.id)].includes(row.path));
  assert.deepEqual(sent.map(row => row.path), ['/memos/groups/' + group, memoPath(copy.id)]);
});

test('two tabs and a reopen retain one copy intent; a lost real committed response closes by receipt with exactly one PUT', async t => {
  const f = await setup(t), first = await f.runtime(), id = await seedNote(f, first);
  const {conflict} = await clash(f, first, notePath(id), 'PUT', noteBody(f.date, '【自动测试】待复制本机稿', 1),
    noteBody(f.date, '【自动测试】保留线上稿', 1));
  const second = await f.runtime();
  const decisions = await Promise.all([first.resolve(conflict.key, 'keep-both'), second.resolve(conflict.key, 'keep-both')]);
  f.source.online = false;
  assert.equal(decisions[0].resolution.id, decisions[1].resolution.id);
  const copy = decisions[0].resolution.target_id, pending = (await first.queue()).operations.filter(row => row.source_id === copy);
  assert.equal(pending.length, 1); const saveId = pending[0].save_id; let lost = false;
  f.source.afterResponse = (path, options, value) => {
    if (!lost && path === notePath(copy) && options.method === 'PUT') {
      lost = true; throw Object.assign(new Error('Synthetic response lost after D1 commit'), {code: 'NETWORK_UNAVAILABLE'});
    }
    return value;
  };
  f.source.online = true; await first.sync();
  const unknown = (await first.queue()).operations.find(row => row.source_id === copy);
  assert.equal(unknown.status, 'unknown'); assert.equal(unknown.save_id, saveId);
  assert.equal((await read(f.db, 'conflicts', conflict.key)).resolved_at, null);
  f.clock.value += 5000; const reopened = await f.runtime(); await complete(f, reopened, conflict.key);
  assert.equal((await f.live(notePath(copy))).text, '【自动测试】待复制本机稿');
  assert.equal(f.calls.filter(row => row.path === notePath(copy) && row.method === 'PUT').length, 1);
  assert.ok(f.calls.some(row => row.path === '/note-entries/operations/' + saveId));
});
