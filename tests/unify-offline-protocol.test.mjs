import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {beijingDay, shiftDay} from '../src/lib/time.mjs';
import {createMemoryDB, entityKey} from '../web/offline/db.mjs';
import {createOutbox} from '../web/offline/outbox.mjs';

async function setup(t) {
  const app = await fixture(t), session = await app.login();
  const owner = (await app.request('/api/v1/auth/me', {session})).data.id;
  const env = {DB: app.db, SITE_ORIGIN: app.origin, PUBLIC_BUSINESS_MODE: '0', PUBLIC_BUSINESS_USER_ID: owner,
    PUBLIC_BUSINESS_ACCOUNT_IDS: '[]', DAILY_NOTES_OWNER_ID: owner, MEMOS_OWNER_ID: owner};
  const calls = [], clock = {value: Date.now()}, db = createMemoryDB(), date = beijingDay(clock.value);
  async function live(path, {method = 'GET', body, signal} = {}) {
    calls.push({path, method, body: body === undefined ? null : structuredClone(body)});
    const headers = {Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken, Origin: app.origin};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await worker.fetch(new Request(app.origin + '/api/v1' + path, {method, headers, signal,
      body: body === undefined ? undefined : JSON.stringify(body)}), env);
    const payload = await response.json();
    if (!response.ok) throw Object.assign(new Error(payload.error.message),
      {status: response.status, code: payload.error.code});
    return payload.data;
  }
  const scope = (await live('/workbench-snapshot/scope')).scope_id;
  function queue(request = live, options = {}) {
    return createOutbox({db, request, getScope: () => scope, now: () => clock.value, ...options});
  }
  return {...app, d1: app.db, owner, scope, date, calls, clock, db, live, queue};
}
const read = (app, id) => app.db.transaction(['entities'], 'readonly', tx => tx.get('entities', entityKey(app.scope, id)));
const writes = (app, path) => app.calls.filter(call => call.path === path && call.method !== 'GET');
const noteBody = (date, text, version = 0) => ({category: 'life', date, text, version});

test('real Worker/D1 uses a recent window and rejects the retired snapshot protocols', async t => {
  const app = await setup(t);
  const recentId = randomUUID(), olderId = randomUUID();
  const recentDate = shiftDay(app.date, -1), olderDate = shiftDay(app.date, -61);
  for (const [id, date] of [[recentId, recentDate], [olderId, olderDate]]) {
    await app.live('/todos', {method: 'POST', body: {id, date, text: '【自动测试】快照窗口事项'}});
  }
  const before = beijingDay(Date.now());
  const recent = await app.live('/workbench-snapshot?window=recent&version=2');
  const after = beijingDay(Date.now());
  assert.equal(recent.batch_format, 'haoduoyu-workbench-window-v1');
  assert.equal(recent.index.snapshot_format, 'haoduoyu-workbench-snapshot-v2');
  assert.equal(recent.index.scope_id, app.scope);
  assert.equal(recent.index.complete, true);
  assert.ok([before, after].includes(recent.coverage.to), 'the window ends on the current Beijing date');
  assert.equal(recent.coverage.from, shiftDay(recent.coverage.to, -59));
  assert.deepEqual(recent.data.todos.map(row => row.source_id), [recentId]);
  const older = await app.live('/workbench-snapshot?window=date&date=' + olderDate + '&version=2');
  assert.deepEqual(older.coverage, {from: olderDate, to: olderDate});
  assert.deepEqual(older.data.todos.map(row => row.source_id), [olderId]);
  for (const path of ['/workbench-snapshot/index', '/workbench-snapshot/index?version=2',
    '/workbench-snapshot?date=' + olderDate + '&version=2']) {
    await assert.rejects(app.live(path), {status: 426, code: 'SNAPSHOT_UPGRADE_REQUIRED'});
  }
});

test('real Worker/D1 todo UUID and template survive lost-create response then ordered check/delete/undo', async t => {
  const app = await setup(t), id = randomUUID(), template = randomUUID();
  await app.live('/todo-templates', {method: 'POST', body: {id: template, text: '【自动测试】合成常用项'}});
  let lost = false;
  const queue = app.queue(async (path, options) => {
    const result = await app.live(path, options);
    if (path === '/todos' && options.method === 'POST' && !lost) {
      lost = true; throw new Error('synthetic lost response after D1 commit');
    }
    return result;
  });
  await queue.enqueue({scope: app.scope, entity_type: 'todo', entity_id: id, method: 'POST',
    body: {id, date: app.date, text: '【自动测试】合成离线待办', template_id: template}});
  await queue.enqueue({scope: app.scope, entity_type: 'todo', entity_id: id, method: 'PATCH',
    body: {completed: true, version: 1}});
  await queue.enqueue({scope: app.scope, entity_type: 'todo', entity_id: id, method: 'DELETE',
    body: {date: app.date, version: 2}});
  await queue.enqueue({scope: app.scope, entity_type: 'todo', entity_id: id, method: 'POST',
    path: '/todos/' + id + '/restore', body: {date: app.date, version: 3}});
  assert.equal((await queue.drain()).phase, 'pending'); assert.equal(writes(app, '/todos').length, 1);
  app.clock.value += 5000; assert.equal((await queue.drain()).phase, 'synced');
  const rows = (await app.live('/todos?date=' + app.date)).items;
  assert.equal(rows.length, 1); assert.equal(rows[0].id, id); assert.equal(rows[0].template_id, template);
  assert.equal(rows[0].completed, true); assert.equal(rows[0].version, 4); assert.equal(rows[0].deleted_at, null);
  assert.equal(writes(app, '/todos').length, 1);
  assert.deepEqual(app.calls.filter(call => call.method !== 'GET' && call.path.includes('/todos'))
    .map(call => [call.method, call.body.version ?? 0]), [['POST', 0], ['PATCH', 1], ['DELETE', 2], ['POST', 3]]);
  const link = await app.d1.prepare('SELECT template_id,created_with_todo FROM matrix_todo_template_links WHERE user_id=? AND todo_id=?')
    .bind(app.owner, id).first();
  assert.deepEqual(link, {template_id: template, created_with_todo: 1});
});

test('real create with a corrupted template acknowledgement remains unknown until a matching fresh read', async t => {
  const app = await setup(t), id = randomUUID(), template = randomUUID(), wrong = randomUUID();
  await app.live('/todo-templates', {method: 'POST', body: {id: template, text: '【自动测试】真实模板'}});
  const queue = app.queue(async (path, options) => {
    const result = await app.live(path, options);
    return path === '/todos' && options.method === 'POST' ? {...result, template_id: wrong} : result;
  });
  await queue.enqueue({scope: app.scope, entity_type: 'todo', entity_id: id, method: 'POST',
    body: {id, date: app.date, text: '【自动测试】核对真实关联', template_id: template}});
  assert.equal((await queue.drain()).phase, 'pending');
  assert.equal((await queue.list(app.scope))[0].status, 'unknown');
  assert.equal((await read(app, 'todo:' + id)).dirty, true);
  app.clock.value += 5000; assert.equal((await queue.drain()).phase, 'synced');
  assert.equal((await read(app, 'todo:' + id)).server.template_id, template);
  assert.equal(writes(app, '/todos').length, 1);
});

test('real note timeout confirms its receipt, and uncommitted loss retries the identical save UUID once', async t => {
  const app = await setup(t), committedId = randomUUID(), retryId = randomUUID();
  let committed, attempted = false, beforeBodies = [];
  const committedDone = new Promise(resolve => { committed = resolve; });
  const queue = app.queue(async (path, options) => {
    if (path === '/note-entries/' + retryId && options.method === 'PUT') {
      beforeBodies.push(structuredClone(options.body));
      if (!attempted) { attempted = true; throw new Error('synthetic failure before request dispatch'); }
    }
    const result = await app.live(path, options);
    if (path === '/note-entries/' + committedId && options.method === 'PUT') {
      committed(); return new Promise(() => {});
    }
    return result;
  }, {timeout: 1000});
  await queue.enqueue({scope: app.scope, entity_type: 'note_entry', entity_id: committedId, method: 'PUT',
    body: noteBody(app.date, '【自动测试】已提交但响应超时')});
  const firstDrain = queue.drain(); await committedDone; await firstDrain;
  app.clock.value += 5000; assert.equal((await queue.drain()).phase, 'synced');
  assert.equal(writes(app, '/note-entries/' + committedId).length, 1);
  await queue.enqueue({scope: app.scope, entity_type: 'note_entry', entity_id: retryId, method: 'PUT',
    body: noteBody(app.date, '【自动测试】未发送后的稳定重试')});
  await queue.drain(); app.clock.value += 5000;
  assert.equal((await queue.drain()).phase, 'synced'); assert.equal(beforeBodies.length, 2);
  assert.deepEqual(beforeBodies[0], beforeBodies[1]);
  assert.equal(writes(app, '/note-entries/' + retryId).length, 1);
  const rows = (await app.live('/note-entries?category=life&date=' + app.date)).entries;
  assert.equal(rows.length, 2); assert.ok(rows.every(row => row.version === 1));
  const receipts = await app.d1.prepare("SELECT count(*) AS n FROM matrix_idempotency WHERE key LIKE 'note-entry:%'").first();
  assert.equal(receipts.n, 2);
});

test('real memo receipt verifies the stored row hash and a later remote deletion preserves both versions', async t => {
  const app = await setup(t), id = randomUUID(), group = randomUUID();
  await app.live('/memos/groups/' + group, {method: 'PUT',
    body: {title: '【自动测试】合成组', position: 0, version: 0, save_id: randomUUID()}});
  let lost = false;
  const queue = app.queue(async (path, options) => {
    const result = await app.live(path, options);
    if (path === '/memos/notes/' + id && options.method === 'PUT' && !lost) {
      lost = true; throw new Error('synthetic memo response loss after commit');
    }
    return result;
  });
  const body = {group_id: group, title: '【自动测试】合成备忘', body: '【自动测试】线上原文', position: 0, version: 0};
  await queue.enqueue({scope: app.scope, entity_type: 'memo_note', entity_id: id, method: 'PUT', body});
  await queue.drain(); app.clock.value += 5000; assert.equal((await queue.drain()).phase, 'synced');
  assert.equal(writes(app, '/memos/notes/' + id).length, 1);
  const base = await app.live('/memos/notes/' + id);
  await app.live('/memos/notes/' + id, {method: 'DELETE', body: {version: 1, save_id: randomUUID()}});
  await queue.enqueue({scope: app.scope, entity_type: 'memo_note', entity_id: id, method: 'PUT', base,
    body: {...body, body: '【自动测试】本机离线修改', version: 1}});
  assert.equal((await queue.drain()).phase, 'conflict');
  const [conflict] = await queue.conflicts.list(app.scope);
  assert.equal(conflict.reason, 'deleted'); assert.equal(conflict.local.body, '【自动测试】本机离线修改');
  assert.equal(conflict.remote.body, '【自动测试】线上原文'); assert.ok(conflict.remote.deleted_at);
  assert.ok(!app.calls.some(call => call.path.includes('/restore')));
  const row = await app.d1.prepare('SELECT version,body,deleted_at FROM matrix_memo_notes WHERE user_id=? AND id=?')
    .bind(app.owner, id).first();
  assert.equal(row.version, 2); assert.equal(row.body, '【自动测试】线上原文'); assert.ok(row.deleted_at);
});

test('real template DELETE minimal acknowledgement preserves the cached text and confirmed CAS version', async t => {
  const app = await setup(t), id = randomUUID();
  const base = await app.live('/todo-templates', {method: 'POST', body: {id, text: '【自动测试】删除仍保留文本'}});
  let response;
  const queue = app.queue(async (path, options) => { response = await app.live(path, options); return response; });
  await queue.enqueue({scope: app.scope, entity_type: 'template', entity_id: id, method: 'DELETE', body: {version: 1}, base});
  assert.equal((await queue.drain()).phase, 'synced'); assert.deepEqual(response, {id, deleted: true});
  const entity = await read(app, 'template:' + id);
  assert.equal(entity.server.text, base.text); assert.equal(entity.server.version, 2);
  assert.equal(entity.local.text, base.text); assert.equal(entity.local.version, 2);
  assert.equal(entity.dirty, false); assert.equal(entity.server.deleted, true);
  const row = await app.d1.prepare('SELECT version,text,deleted_at FROM matrix_todo_templates WHERE user_id=? AND id=?')
    .bind(app.owner, id).first();
  assert.equal(row.version, entity.server.version); assert.equal(row.text, entity.server.text); assert.ok(row.deleted_at);
});
