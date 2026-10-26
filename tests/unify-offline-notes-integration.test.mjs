import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {beijingDay} from '../src/lib/time.mjs';
import {createMemoryDB} from '../web/offline/db.mjs';
import {createOfflineRuntime} from '../web/offline/runtime.mjs';
import {createNoteEntriesStore} from '../web/core/note-entries-state.mjs';
import {documentState, isLocalDocument} from '../web/offline/document.mjs';

const pathFor = (category, date) => '/note-entries?category=' + category + '&date=' + date;
const offline = () => Object.assign(new Error('Synthetic network unavailable'), {code: 'NETWORK_UNAVAILABLE'});
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ?
  Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
function apiHash(row) {
  const fields = ['id', 'category', 'date', 'text', 'version', 'change_seq', 'created_at', 'updated_at', 'deleted_at'];
  return createHash('sha256').update(JSON.stringify(stable(Object.fromEntries(fields.map(key => [key, row[key]]))))).digest('hex');
}
async function setup(t) {
  const source = {online: true, session: null, afterResponse: null}, runtimes = [], stores = [];
  t.after(() => { source.online = false; for (const store of stores) store.dispose(); for (const runtime of runtimes) runtime.stop(); });
  const app = await fixture(t); source.session = await app.login();
  const owner = (await app.request('/api/v1/auth/me', {session: source.session})).data.id;
  const env = {DB: app.db, SITE_ORIGIN: app.origin, PUBLIC_BUSINESS_MODE: '0', PUBLIC_BUSINESS_USER_ID: owner,
    PUBLIC_BUSINESS_ACCOUNT_IDS: '[]', DAILY_NOTES_OWNER_ID: owner, MEMOS_OWNER_ID: owner};
  const db = createMemoryDB(), calls = [], clock = {value: Date.now()}, date = beijingDay(clock.value);
  const yesterday = new Date(Date.parse(date + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
  async function live(path, {method = 'GET', body, signal} = {}) {
    calls.push({path, method, body: body === undefined ? null : structuredClone(body)});
    const headers = {Cookie: source.session.cookie, 'X-CSRF-Token': source.session.csrfToken, Origin: app.origin};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await worker.fetch(new Request(app.origin + '/api/v1' + path, {method, headers, signal,
      body: body === undefined ? undefined : JSON.stringify(body)}), env);
    const payload = await response.json();
    if (!response.ok) throw Object.assign(new Error(payload.error.message), {status: response.status, code: payload.error.code});
    return payload.data;
  }
  async function request(path, options) {
    if (!source.online) throw offline();
    const result = await live(path, options);
    return source.afterResponse ? source.afterResponse(path, options || {}, result) : result;
  }
  async function runtime() {
    const value = createOfflineRuntime({db, request, now: () => clock.value, online: () => source.online});
    runtimes.push(value); await value.call('/auth/me'); return value;
  }
  async function notes(runtime, category = 'life', day = date) {
    const value = createNoteEntriesStore({category, uuid: randomUUID,
      load: (date, options) => options?.localOnly ? runtime.localRead(pathFor(category, date)) : runtime.call(pathFor(category, date)),
      loadEntry: (id, options) => options?.localOnly ? runtime.localRead('/note-entries/' + id) : runtime.call('/note-entries/' + id),
      loadOperation: id => runtime.call('/note-entries/operations/' + id),
      put: (id, body, options) => runtime.call('/note-entries/' + id, {...options, method: 'PUT', body}),
      remove: (id, body, options) => runtime.call('/note-entries/' + id, {...options, method: 'DELETE', body}),
      restore: (id, body, options) => runtime.call('/note-entries/' + id + '/restore', {...options, method: 'POST', body}),
      setTimer: () => 1, clearTimer: () => {}});
    stores.push(value); await value.read(day); return value;
  }
  return {...app, d1: app.db, db, owner, source, calls, clock, date, yesterday, live, runtime, notes};
}
const writes = (app, id) => app.calls.filter(call => call.path === '/note-entries/' + id && call.method !== 'GET');

test('real runtime/state local acknowledgements survive reopening and deliver independent life/work records in FIFO order', async t => {
  const f = await setup(t), runtime = await f.runtime(), life = await f.notes(runtime), work = await f.notes(runtime, 'work');
  f.source.online = false;
  const first = life.start(f.date);
  for (const text of ['【自动测试】第一稿', '【自动测试】第二稿', '【自动测试】第三稿']) {
    life.edit(first.id, text); await life.save(first.id);
  }
  const second = life.start(f.date); life.edit(second.id, '【自动测试】同日独立第二条'); await life.save(second.id);
  const workItem = work.start(f.date); work.edit(workItem.id, '【自动测试】工作分类独立条目'); await work.save(workItem.id);
  assert.notEqual(first.id, second.id); assert.equal(first.version, 0); assert.equal(first.contentHash, '');
  assert.equal(first.serverText, ''); assert.equal(first.localVersion, 3); assert.equal(first.phase, 'queued');
  const queue = await runtime.queue(); assert.equal(queue.operations.length, 5);
  assert.deepEqual(queue.operations.filter(row => row.source_id === first.id).map(row => row.expected_version), [0, 1, 2]);
  const document = await runtime.localRead('/note-entries/' + first.id);
  assert.equal(isLocalDocument(document), true); assert.equal(document.content_hash, undefined); assert.equal(document.change_seq, undefined);
  assert.equal(documentState(document).server, null); assert.equal(writes(f, first.id).length, 0);
  const reopened = await f.runtime(), restoredLife = await f.notes(reopened), restoredWork = await f.notes(reopened, 'work');
  assert.equal(restoredLife.entry(first.id).durableText, '【自动测试】第三稿');
  assert.equal(restoredLife.page(f.date).ids.length, 2); assert.equal(restoredWork.page(f.date).ids.length, 1);
  assert.equal(restoredLife.entry(first.id).version, 0); assert.equal(restoredLife.entry(first.id).contentHash, '');
  f.source.online = true; f.source.session = await f.login();
  await reopened.sync(); await restoredLife.read(f.date, {localOnly: true}); await restoredWork.read(f.date, {localOnly: true});
  assert.equal((await reopened.queue()).operations.length, 0);
  const confirmed = await f.live('/note-entries/' + first.id);
  assert.equal(confirmed.version, 3); assert.equal(confirmed.text, '【自动测试】第三稿'); assert.equal(confirmed.content_hash, apiHash(confirmed));
  assert.equal(restoredLife.entry(first.id).version, 3); assert.equal(restoredLife.entry(first.id).contentHash, confirmed.content_hash);
  assert.equal(restoredLife.entry(first.id).localQueued, false);
  assert.deepEqual(writes(f, first.id).map(row => row.body.version), [0, 1, 2]);
  assert.equal((await f.live(pathFor('life', f.date))).entries.length, 2); assert.equal((await f.live(pathFor('work', f.date))).entries.length, 1);
  const stored = await f.db.transaction(['entities', 'outbox', 'meta'], 'readonly', async tx =>
    JSON.stringify(await Promise.all(['entities', 'outbox', 'meta'].map(name => tx.getAll(name)))));
  assert.equal(stored.includes(f.source.session.cookie), false); assert.equal(stored.includes(f.source.session.csrfToken), false);
});

test('a real offline DELETE becomes a versioned server tombstone while preserving the original text', async t => {
  const f = await setup(t), runtime = await f.runtime(), store = await f.notes(runtime);
  f.source.online = false;
  const item = store.start(f.date); store.edit(item.id, '【自动测试】墓碑保留原文'); await store.save(item.id);
  await store.deleteEntry(item.id); assert.equal(item.deleted, true); assert.equal(item.localVersion, 2); assert.equal(item.version, 0);
  f.source.online = true; await runtime.sync(); await store.read(f.date, {localOnly: true});
  const remote = await f.live('/note-entries/' + item.id);
  assert.equal(remote.deleted, true); assert.equal(remote.version, 2); assert.equal(remote.text, '【自动测试】墓碑保留原文');
  assert.equal(remote.content_hash, apiHash(remote)); assert.equal(item.version, 2); assert.equal(item.localQueued, false);
  assert.deepEqual((await f.live(pathFor('life', f.date))).entries, []);
  const row = await f.d1.prepare('SELECT text,version,deleted_at FROM matrix_note_entries WHERE user_id=? AND id=?')
    .bind(f.owner, item.id).first();
  assert.equal(row.text, remote.text); assert.equal(row.version, 2); assert.ok(row.deleted_at);
});

test('real online version conflict preserves both original bodies and never implicitly resurrects a deleted note', async t => {
  const f = await setup(t), id = randomUUID();
  await f.live('/note-entries/' + id, {method: 'PUT', body: {category: 'life', date: f.date, text: '【自动测试】原有线上稿', version: 0,
    save_id: randomUUID()}});
  const runtime = await f.runtime(), store = await f.notes(runtime), item = store.entry(id);
  f.source.online = false; store.edit(id, '【自动测试】本机离线新稿'); await store.save(id);
  await f.live('/note-entries/' + id, {method: 'DELETE', body: {version: 1, save_id: randomUUID()}});
  f.source.online = true; await runtime.sync(); await store.read(f.date, {localOnly: true});
  const queue = await runtime.queue(); assert.equal(queue.conflicts.length, 1); assert.equal(queue.operations[0].status, 'conflict');
  const conflict = queue.conflicts[0]; assert.equal(conflict.local.text, '【自动测试】本机离线新稿');
  assert.equal(conflict.remote.text, '【自动测试】原有线上稿'); assert.equal(conflict.remote.deleted, true);
  assert.equal(item.phase, 'conflict'); assert.equal(item.draft, '【自动测试】本机离线新稿');
  assert.equal(item.localConflict.remote.deleted, true);
  assert.equal(item.remote.deleted, true, 'the conflict view must use the actual current remote tombstone');
  await runtime.resolve(conflict.key, 'use-local'); assert.equal((await runtime.queue()).conflicts.length, 1);
  await store.useDraft(id); assert.equal(item.phase, 'conflict');
  assert.equal(f.calls.some(call => call.path.endsWith('/restore')), false);
  const remote = await f.live('/note-entries/' + id); assert.equal(remote.deleted, true); assert.equal(remote.version, 2);
});

test('a lost committed response is confirmed by its original real receipt without a duplicate PUT', async t => {
  const f = await setup(t), runtime = await f.runtime(), store = await f.notes(runtime);
  f.source.online = false; const item = store.start(f.date); store.edit(item.id, '【自动测试】响应丢失由收据确认'); await store.save(item.id);
  const original = (await runtime.queue()).operations[0], originalBody = structuredClone(original.body);
  let lost = false;
  f.source.afterResponse = (path, options, result) => {
    if (path === '/note-entries/' + item.id && options.method === 'PUT' && !lost) { lost = true; throw offline(); }
    return result;
  };
  f.source.online = true; await runtime.sync();
  assert.equal((await runtime.queue()).operations[0].status, 'unknown'); assert.equal(writes(f, item.id).length, 1);
  await store.read(f.date, {localOnly: true}); assert.equal(item.phase, 'queued'); assert.equal(item.version, 0);
  f.clock.value += 5000; await runtime.sync(); await store.read(f.date, {localOnly: true});
  assert.equal((await runtime.queue()).operations.length, 0); assert.equal(writes(f, item.id).length, 1);
  assert.deepEqual(writes(f, item.id)[0].body, originalBody);
  assert.ok(f.calls.some(call => call.path === '/note-entries/operations/' + original.save_id));
  const receipt = await f.live('/note-entries/operations/' + original.save_id), remote = await f.live('/note-entries/' + item.id);
  assert.equal(receipt.found, true); assert.equal(receipt.content_hash, remote.content_hash);
  assert.equal(item.contentHash, remote.content_hash); assert.equal(item.phase, 'saved');
});

test('importing an already uncertain original save is atomically unknown and checks a real receipt before any resend', async t => {
  const f = await setup(t), id = randomUUID(), saveId = randomUUID();
  const body = {category: 'life', date: f.date, text: '【自动测试】旧未确认保存', version: 0, save_id: saveId};
  await f.live('/note-entries/' + id, {method: 'PUT', body});
  const runtime = await f.runtime(); await f.notes(runtime); f.source.online = false;
  const local = await runtime.call('/note-entries/' + id, {method: 'PUT', body, offlineUnknown: true});
  assert.equal(isLocalDocument(local), true); const [operation] = (await runtime.queue()).operations;
  assert.equal(operation.status, 'unknown'); assert.equal(operation.save_id, saveId); assert.deepEqual(operation.body, body);
  f.source.online = true; await runtime.sync();
  assert.equal((await runtime.queue()).operations.length, 0); assert.equal(writes(f, id).length, 1);
  assert.ok(f.calls.some(call => call.path === '/note-entries/operations/' + saveId));
  assert.equal((await f.live('/note-entries/' + id)).version, 1);
});

test('draft journals preserve an old unknown operation verbatim across reopenings and never manufacture server evidence', async t => {
  const f = await setup(t), runtime = await f.runtime(); await f.notes(runtime, 'work', f.yesterday); await runtime.sync();
  const id = randomUUID(), pending = {kind: 'put', version: 2, saveId: randomUUID(), text: '【自动测试】旧原请求稿',
    uncertain: true, checking: false, retryReady: false};
  const raw = {kind: 'note_entry', id, category: 'work', date: f.yesterday, draft: '【自动测试】后续未提交的工作草稿',
    version: 2, serverText: '旧基线仅作恢复元数据', contentHash: 'prior-unverified-baseline', dirty: true, phase: 'unknown', pending};
  await runtime.retainDrafts([raw]); f.source.online = false;
  const reopened = await f.runtime(), store = await f.notes(reopened, 'work', f.yesterday);
  const [saved] = await reopened.retainedDrafts('note_entry'); assert.deepEqual(saved.pending, pending);
  const item = store.restoreDraft(saved);
  assert.equal(item.phase, 'unknown'); assert.equal(item.version, 0); assert.equal(item.contentHash, '');
  assert.equal(item.pending.saveId, pending.saveId); assert.equal(item.pending.version, pending.version);
  assert.equal(item.category, 'work'); assert.equal(item.date, f.yesterday); assert.equal(writes(f, id).length, 0);
  await reopened.retainDrafts([{...raw, ...item, kind: 'note_entry', category: item.category}]);
  const secondRuntime = await f.runtime(), secondStore = await f.notes(secondRuntime, 'work', f.yesterday);
  const retained = await secondRuntime.retainedDrafts('note_entry');
  assert.equal(retained.length, 2); // Independent tabs retain their own journal record, even with equal synthetic timestamps.
  const again = retained.find(row => row.recoveredBaseline); assert.deepEqual(again.pending, pending);
  assert.equal(again.recoveredBaseline.contentHash, raw.contentHash); assert.equal(again.recoveredBaseline.version, raw.version);
  const recovered = secondStore.restoreDraft(again);
  assert.equal(recovered.draft, raw.draft); assert.equal(recovered.category, 'work'); assert.equal(recovered.date, f.yesterday);
  assert.equal(recovered.pending.saveId, pending.saveId); assert.equal(writes(f, id).length, 0);
  assert.equal(recovered.recoveredBaseline.contentHash, raw.contentHash); assert.equal(recovered.version, 0); assert.equal(recovered.contentHash, '');
  assert.equal(f.calls.some(call => call.path === '/note-entries/operations/' + pending.saveId), false);
});

test('a recovered unsubmitted draft retains its original category/day across a second reopen without automatic PUT', async t => {
  const f = await setup(t), runtime = await f.runtime(); await f.notes(runtime, 'work', f.yesterday); await runtime.sync();
  const id = randomUUID(), draft = {kind: 'note_entry', id, category: 'work', date: f.yesterday,
    draft: '【自动测试】跨午夜的未提交原稿', version: 0, serverText: '', contentHash: '', dirty: true, phase: 'error', pending: null};
  await runtime.retainDrafts([draft]); f.source.online = false;
  for (let opening = 0; opening < 2; opening++) {
    const next = await f.runtime(), store = await f.notes(next, 'work', f.yesterday), [saved] = await next.retainedDrafts('note_entry');
    const item = store.restoreDraft(saved); assert.equal(item.draft, draft.draft);
    assert.equal(item.category, 'work'); assert.equal(item.date, f.yesterday); assert.equal(item.phase, 'error');
    assert.equal(item.pending, null); assert.equal(item.localQueued, false); assert.equal(writes(f, id).length, 0);
    await next.retainDrafts([{...draft, ...item, kind: 'note_entry', category: item.category}]);
  }
  assert.equal((await runtime.queue()).operations.length, 0);
});
