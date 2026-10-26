import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {createMemoryDB, entityKey, openOfflineDB} from '../web/offline/db.mjs';
import {createOutbox, RETRY_DELAYS} from '../web/offline/outbox.mjs';

const scope = 'a'.repeat(64), other = 'b'.repeat(64), date = '2026-10-26';
const error = (status, code) => Object.assign(new Error(code), {status, code});
function setup(request, options = {}) {
  const db = options.db || createMemoryDB(), clock = {value: 1000}, identity = {value: scope};
  const outbox = createOutbox({db, request, getScope: () => identity.value, now: () => clock.value, ...options});
  return {db, outbox, clock, identity};
}
const get = (db, store, key) => db.transaction([store], 'readonly', tx => tx.get(store, key));
const all = (db, store) => db.transaction([store], 'readonly', tx => tx.getAll(store));
test('B2 per-call cancellation during a durable transaction rolls back both entity and operation', async () => {
  const app = setup(async () => assert.fail('cancelled operation must never send'));
  let checkpoints = 0;
  await assert.rejects(app.outbox.enqueue({...note(), assertActive() {
    if (++checkpoints === 4) throw new DOMException('cancelled', 'AbortError');
  }}), error => error.name === 'AbortError');
  assert.equal(checkpoints, 4);
  assert.deepEqual(await all(app.db, 'entities'), []);
  assert.deepEqual(await all(app.db, 'outbox'), []);
});
test('importing an uncertain note atomically starts unknown and checks its original receipt before any write', async () => {
  const calls = [], id = randomUUID(), save_id = randomUUID(); let operation;
  const app = setup(async (path, opts = {}) => {
    calls.push({path, method: opts.method || 'GET'});
    if (path.includes('/operations/')) return {found: true, id, version: 1, content_hash: 'c'.repeat(64)};
    if (opts.method) assert.fail('receipt-confirmed uncertain import must not be rewritten');
    return noteResponse(operation);
  });
  const input = {...note('原未确认正文', 0, id), initial_status: 'unknown'}; input.body.save_id = save_id;
  const saved = await app.outbox.enqueue(input); operation = saved.operation;
  assert.equal((await all(app.db, 'outbox'))[0].status, 'unknown');
  assert.deepEqual(operation.body, input.body);
  const again = await app.outbox.enqueue(input);
  assert.equal(again.operation.id, operation.id); assert.equal((await all(app.db, 'outbox')).length, 1);
  await app.outbox.drain(); assert.equal(calls[0].path, '/note-entries/operations/' + save_id);
  assert.equal(calls.filter(row => row.method !== 'GET').length, 0);
});
test('uncertain imports require the existing save id and cannot change its body or release later FIFO edits early', async () => {
  const app = setup(async () => { throw new Error('receipt unavailable'); });
  await assert.rejects(app.outbox.enqueue({...note(), initial_status: 'unknown'}), /original save_id/);
  const input = {...note('原内容'), initial_status: 'unknown'}; input.body.save_id = randomUUID();
  const first = await app.outbox.enqueue(input);
  await assert.rejects(app.outbox.enqueue({...input, body: {...input.body, text: '偷换内容'}}), /cannot change/);
  await app.outbox.enqueue({...note('后续内容', 1, first.operation.source_id), body:
    {...note('后续内容', 1).body, save_id: randomUUID()}});
  await app.outbox.drain();
  const rows = await app.outbox.list(scope); assert.equal(rows[0].status, 'unknown'); assert.equal(rows[1].status, 'queued');
});
function note(text = '本机正文', version = 0, id = randomUUID()) {
  return {scope, entity_type: 'note_entry', entity_id: id, method: 'PUT',
    body: {category: 'life', date, text, version}, local: {category: 'life', date, text}};
}
function noteResponse(operation) {
  return {...operation.body, id: operation.source_id, version: operation.expected_version + 1,
    can_edit: true, deleted: false, deleted_at: null, content_hash: 'c'.repeat(64), change_seq: 1,
    created_at: '2026-10-26T01:00:00Z', updated_at: '2026-10-26T01:00:00Z'};
}
test('a note HTTP success without complete server hash, sequence and timestamps cannot acknowledge a durable operation', async () => {
  let operation;
  const app = setup(async () => ({...noteResponse(operation), content_hash: undefined, change_seq: undefined}));
  operation = (await app.outbox.enqueue(note())).operation;
  assert.equal((await app.outbox.drain()).phase, 'pending');
  const [pending] = await app.outbox.list(scope); assert.equal(pending.status, 'unknown');
  assert.equal((await get(app.db, 'entities', entityKey(scope, operation.entity_id))).dirty, true);
});
test('the daily note capacity is checked inside the entity/outbox transaction before acknowledging another local create', async () => {
  const app = setup(async () => assert.fail('offline capacity must not send'));
  await app.db.transaction(['entities'], 'readwrite', async tx => {
    for (let n = 0; n < 200; n++) {
      const id = randomUUID(), entity_id = 'note-entry:' + id;
      await tx.put('entities', {key: entityKey(scope, entity_id), scope, entity_id,
        server: {id, category: 'life', date, text: '合成容量项', version: 1, deleted: false}});
    }
  });
  await assert.rejects(app.outbox.enqueue(note()), error => error.code === 'OFFLINE_CACHE_LIMIT');
  assert.equal((await all(app.db, 'entities')).length, 200); assert.deepEqual(await all(app.db, 'outbox'), []);
});

test('enqueue commits entity and outbox together before returning, and never claims network success offline', async () => {
  let calls = 0;
  const app = setup(async () => { calls++; throw new TypeError('offline'); });
  const saved = await app.outbox.enqueue(note());
  assert.equal(calls, 0); assert.equal(saved.entity.dirty, true);
  assert.equal((await get(app.db, 'entities', saved.entity.key)).local.text, '本机正文');
  assert.equal((await get(app.db, 'outbox', saved.operation.key)).save_id, saved.operation.body.save_id);
  const result = await app.outbox.drain();
  assert.equal(result.phase, 'pending'); assert.equal(result.pending, 1); assert.equal(calls, 1);
  assert.equal((await app.outbox.list(scope))[0].status, 'unknown');
});

test('failed durable transaction rolls back the entity and queue, and unavailable IDB has no memory fallback', async () => {
  const db = createMemoryDB();
  await assert.rejects(db.transaction(['entities', 'outbox'], 'readwrite', async tx => {
    await tx.put('entities', {key: 'entry', text: 'must rollback'});
    throw new Error('synthetic quota failure');
  }), /quota/);
  assert.deepEqual(await all(db, 'entities'), []);
  await assert.rejects(openOfflineDB({indexedDB: null}), /unavailable/);
});

test('credentials, legacy daily records and unapproved scope cannot be queued', async () => {
  const app = setup(async () => assert.fail('must not request'));
  for (const property of ['headers', 'csrfToken', 'authorization', 'token']) {
    await assert.rejects(app.outbox.enqueue({...note(), body: {...note().body, [property]: 'never-persist'}}), /Credentials/);
  }
  await assert.rejects(app.outbox.enqueue({...note(), entity_type: 'daily_note'}), /read-only/);
  await assert.rejects(app.outbox.enqueue({...note(), scope: other}), /identity/);
  assert.deepEqual(await all(app.db, 'outbox'), []);
  assert.ok(!JSON.stringify(await all(app.db, 'entities')).includes('never-persist'));
});

test('timeout reconciles the matching receipt and current item without resending a committed create', async () => {
  let operation, writes = 0;
  const app = setup(async (path, opts) => {
    if (opts.method) { writes++; return new Promise(() => {}); }
    if (path.includes('/operations/')) return {found: true, id: operation.source_id, version: 1, content_hash: 'c'.repeat(64)};
    return noteResponse(operation);
  }, {timeout: 5});
  operation = (await app.outbox.enqueue(note())).operation;
  await app.outbox.drain(); app.clock.value += 5000;
  assert.equal((await app.outbox.drain()).phase, 'synced'); assert.equal(writes, 1);
  assert.equal((await get(app.db, 'entities', entityKey(scope, operation.entity_id))).dirty, false);
});

test('receipt-confirmed absence retries the original payload and save UUID after backoff', async () => {
  const bodies = []; let operation;
  const app = setup(async (path, opts) => {
    if (opts.method) {
      bodies.push(structuredClone(opts.body));
      if (bodies.length === 1) throw new Error('response outcome unknown');
      return noteResponse(operation);
    }
    if (path.includes('/operations/')) return {found: false};
    if (path.includes('?')) return {category: 'life', date, can_edit: true, entries: []};
    throw error(404, 'NOT_FOUND');
  });
  operation = (await app.outbox.enqueue(note())).operation;
  await app.outbox.drain(); await app.outbox.drain(); assert.equal(bodies.length, 1);
  app.clock.value += 5000; await app.outbox.drain();
  assert.equal(bodies.length, 2); assert.deepEqual(bodies[1], bodies[0]);
  assert.equal((await app.outbox.list(scope)).length, 0);
});

test('same-text later versions cannot impersonate the saved receipt, and both conflict copies survive', async () => {
  let operation;
  const app = setup(async (path, opts) => {
    if (opts.method) throw new Error('unknown');
    if (path.includes('/operations/')) return {found: true, id: operation.source_id, version: 1, content_hash: 'c'.repeat(64)};
    return {...noteResponse(operation), version: 2, text: '线上第二版', content_hash: 'd'.repeat(64)};
  });
  operation = (await app.outbox.enqueue(note())).operation;
  await app.outbox.drain(); app.clock.value += 5000;
  assert.equal((await app.outbox.drain()).phase, 'conflict');
  const [conflict] = await app.outbox.conflicts.list(scope);
  assert.equal(conflict.local.text, '本机正文'); assert.equal(conflict.remote.text, '线上第二版');
});

test('three changes of an entity are sent in durable sequence and later edits wait for acknowledgement', async () => {
  const versions = [], id = randomUUID(); let release;
  const gate = new Promise(resolve => { release = resolve; });
  const app = setup(async (path, opts) => {
    versions.push(opts.body.version);
    if (versions.length === 1) await gate;
    return noteResponse({body: opts.body, source_id: id, expected_version: opts.body.version});
  });
  await app.outbox.enqueue(note('one', 1, id)); await app.outbox.enqueue(note('two', 2, id));
  await app.outbox.enqueue(note('three', 3, id));
  const run = app.outbox.drain();
  while (!versions.length) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(versions, [1]); assert.equal(app.outbox.drain(), run);
  release(); await run; assert.deepEqual(versions, [1, 2, 3]);
  const row = await get(app.db, 'entities', entityKey(scope, 'note-entry:' + id));
  assert.equal(row.local.text, 'three'); assert.equal(row.dirty, false);
});

test('two tabs share the atomic lease and do not concurrently send one operation', async () => {
  const db = createMemoryDB(), calls = []; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const request = async (path, opts) => { calls.push(path); await gate;
    return noteResponse({body: opts.body, source_id: path.split('/').at(-1), expected_version: 0}); };
  const one = setup(request, {db}), two = setup(request, {db});
  await one.outbox.enqueue(note()); const running = one.outbox.drain();
  while (!calls.length) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await two.outbox.drain()).phase, 'busy'); assert.equal(calls.length, 1);
  release(); await running; assert.equal((await two.outbox.drain()).phase, 'synced'); assert.equal(calls.length, 1);
});

test('online tombstone produces a preserved conflict and is never implicitly restored', async () => {
  const id = randomUUID(), methods = [];
  const app = setup(async (path, opts) => {
    if (opts.method) { methods.push(opts.method); throw error(409, 'NOTE_ENTRY_DELETED'); }
    return {id, text: '删除前正文', version: 3, deleted_at: '2026-10-26T00:00:00Z', can_edit: true};
  });
  await app.outbox.enqueue(note('离线修改仍保留', 1, id));
  assert.equal((await app.outbox.drain()).phase, 'conflict'); await app.outbox.drain();
  assert.deepEqual(methods, ['PUT']);
  const [conflict] = await app.outbox.conflicts.list(scope);
  assert.equal(conflict.reason, 'deleted'); assert.equal(conflict.local.text, '离线修改仍保留');
  assert.equal(conflict.remote.text, '删除前正文');
  await assert.rejects(app.outbox.conflicts.resolve(conflict.key, 'use-server', {scope: other}), /scope/);
  await app.outbox.conflicts.resolve(conflict.key, 'keep-both', {scope});
  assert.equal((await app.outbox.list(scope))[0].status, 'conflict'); assert.equal(methods.length, 1);
  assert.equal((await app.outbox.conflicts.list(scope)).length, 1);
});

test('a changed identity pauses old operations instead of sending them in a different scope', async () => {
  let calls = 0;
  const app = setup(async () => { calls++; throw new Error('offline'); });
  const saved = await app.outbox.enqueue(note()); app.identity.value = other;
  assert.equal((await app.outbox.drain()).phase, 'synced'); assert.equal(calls, 0);
  assert.equal((await get(app.db, 'outbox', saved.operation.key)).scope, scope);
  app.identity.value = scope; await app.outbox.drain(); assert.equal(calls, 1);
});

test('unknown todo create reads versions first and never creates a second client UUID', async () => {
  const id = randomUUID(), bodies = []; let saved = null;
  const app = setup(async (path, opts) => {
    if (opts.method) { bodies.push(opts.body); saved = {...opts.body, completed: false, version: 1}; throw new Error('lost response'); }
    assert.equal(path, '/todos?date=' + date); return {date, items: [saved]};
  });
  await app.outbox.enqueue({scope, entity_type: 'todo', entity_id: id, method: 'POST', body: {id, date, text: '离线待办'},
    local: {id, date, text: '离线待办', completed: false}});
  await app.outbox.drain(); app.clock.value += 5000;
  assert.equal((await app.outbox.drain()).phase, 'synced'); assert.equal(bodies.length, 1); assert.equal(bodies[0].id, id);
});

test('unverifiable todo absence and failed receipt reads stay unknown rather than retry writes', async () => {
  let writes = 0;
  const app = setup(async (path, opts) => {
    if (opts.method) { writes++; throw new Error('offline'); }
    if (path.startsWith('/todos?')) return {date, items: []};
    throw error(503, 'SNAPSHOT_BUDGET');
  });
  const id = randomUUID();
  await app.outbox.enqueue({scope, entity_type: 'todo', entity_id: id, method: 'POST', body: {id, date, text: '保留待办'}});
  await app.outbox.drain(); app.clock.value += 5000; await app.outbox.drain();
  assert.equal(writes, 1); assert.equal((await app.outbox.list(scope))[0].status, 'unknown');
  assert.deepEqual(RETRY_DELAYS, [5000, 15000, 60000, 300000]);
  assert.equal((await app.outbox.list(scope))[0].next_attempt_at, app.clock.value + 15000);
});

test('malformed HTTP success retains its durable payload as unknown, rather than showing synced', async () => {
  const id = randomUUID(), app = setup(async () => ({id}));
  await app.outbox.enqueue(note('必须保留的正文', 0, id));
  assert.equal((await app.outbox.drain()).phase, 'pending');
  const [operation] = await app.outbox.list(scope);
  assert.equal(operation.status, 'unknown'); assert.equal(operation.body.text, '必须保留的正文');
  assert.equal((await get(app.db, 'entities', entityKey(scope, operation.entity_id))).dirty, true);
});

test('partial todo mutations preserve the stored text/date and mark local deletion explicitly', async () => {
  const app = setup(async () => assert.fail('not yet sent')), id = randomUUID();
  const key = entityKey(scope, 'todo:' + id), base = {id, date, text: '保留名称', completed: false, version: 1};
  await app.db.transaction(['entities'], 'readwrite', tx => tx.put('entities', {
    key, scope, entity_id: 'todo:' + id, server: base, dirty: false}));
  await app.outbox.enqueue({scope, entity_type: 'todo', entity_id: id, method: 'PATCH', body: {completed: true, version: 1}});
  const saved = await app.outbox.enqueue({scope, entity_type: 'todo', entity_id: id, method: 'DELETE', body: {date, version: 2}});
  assert.equal(saved.entity.local.text, base.text); assert.equal(saved.entity.local.date, date);
  assert.equal(saved.entity.local.completed, true); assert.equal(saved.entity.local.deleted, true);
  assert.equal(saved.entity.local.version, 3);
});

test('a committed todo deletion reconciles a versioned snapshot tombstone without requiring omitted text', async () => {
  const id = randomUUID(), base = {id, date, text: '已删正文', completed: false, version: 1};
  let writes = 0;
  const app = setup(async (path, opts) => {
    if (opts.method) { writes++; throw new Error('lost after delete'); }
    if (path.startsWith('/todos?')) return {date, items: []};
    return {complete: true, scope_id: scope, data: {todos: [{source_id: id, date, version: 2, deleted_at: '2026-10-26T01:00:00Z'}]}};
  });
  await app.outbox.enqueue({scope, entity_type: 'todo', entity_id: id, method: 'DELETE', body: {date, version: 1}, base});
  await app.outbox.drain(); app.clock.value += 5000;
  assert.equal((await app.outbox.drain()).phase, 'synced'); assert.equal(writes, 1);
});

test('memo unknown responses verify the metadata receipt hash against a complete fresh item', async () => {
  const id = randomUUID(), group_id = randomUUID(), stamp = '2026-10-26T01:00:00Z'; let writes = 0;
  const row = {id, title: '备忘标题', position: 0, version: 1, change_seq: 4, created_at: stamp,
    updated_at: stamp, deleted_at: null, group_id, body: '备忘正文'};
  const stable = Object.fromEntries(Object.keys(row).sort().map(key => [key, row[key]]));
  const hash = createHash('sha256').update(JSON.stringify(stable)).digest('hex');
  const app = setup(async (path, opts) => {
    if (opts.method) { writes++; throw new Error('lost response'); }
    if (path.includes('/operations/')) return {found: true, kind: 'notes', id, version: 1, entity_hash: hash};
    return {...row, can_edit: true};
  });
  await app.outbox.enqueue({scope, entity_type: 'memo_note', entity_id: id, method: 'PUT',
    body: {group_id, title: row.title, body: row.body, position: 0, version: 0}});
  await app.outbox.drain(); app.clock.value += 5000;
  assert.equal((await app.outbox.drain()).phase, 'synced'); assert.equal(writes, 1);
});

test('same-scope reauthentication resumes a paused queue through reconciliation before retrying', async () => {
  let operation, writes = 0, reauthenticated = false, checks = 0;
  const app = setup(async (path, opts) => {
    if (opts.method) {
      writes++; if (!reauthenticated) throw error(401, 'UNAUTHORIZED');
      return noteResponse(operation);
    }
    checks++;
    if (path.includes('/operations/')) return {found: false};
    if (path.includes('?')) return {entries: [], can_edit: true};
    throw error(404, 'NOT_FOUND');
  });
  operation = (await app.outbox.enqueue(note())).operation;
  await app.outbox.drain(); assert.equal((await app.outbox.list(scope))[0].status, 'paused');
  reauthenticated = true; assert.equal(await app.outbox.resume(scope), 1);
  assert.equal((await app.outbox.drain()).phase, 'synced'); assert.equal(writes, 2); assert.equal(checks, 3);
});

test('an expired old-tab claim cannot poison a new-tab write or erase its eventual acknowledgement', async () => {
  const db = createMemoryDB(), clock = {value: 1000}; let rejectOld, finishNew, operation;
  const oldGate = new Promise((_, reject) => { rejectOld = reject; });
  const newGate = new Promise(resolve => { finishNew = resolve; });
  let oldStarted = false, newStarted = false;
  const old = setup(async () => { oldStarted = true; return oldGate; }, {db, now: () => clock.value});
  const newer = setup(async (path, opts) => {
    if (opts.method) { newStarted = true; await newGate; return noteResponse(operation); }
    if (path.includes('/operations/')) return {found: false};
    if (path.includes('?')) return {can_edit: true, entries: []};
    throw error(404, 'NOT_FOUND');
  }, {db, now: () => clock.value});
  operation = (await old.outbox.enqueue(note())).operation;
  const oldRun = old.outbox.drain();
  while (!oldStarted) await new Promise(resolve => setImmediate(resolve));
  clock.value += 100000; const newRun = newer.outbox.drain();
  while (!newStarted) await new Promise(resolve => setImmediate(resolve));
  rejectOld(error(409, 'VERSION_CONFLICT')); await oldRun;
  assert.equal((await newer.outbox.list(scope))[0].status, 'sending');
  assert.deepEqual(await newer.outbox.conflicts.list(scope), []);
  finishNew(); assert.equal((await newRun).phase, 'synced');
});

test('repeating an old conflict resolution cannot archive a later fresh edit', async () => {
  const id = randomUUID(); let online = false;
  const app = setup(async (path, opts) => {
    if (opts.method && !online) throw error(409, 'VERSION_CONFLICT');
    return {id, date, category: 'life', text: '线上正文', version: 2, deleted_at: null, can_edit: true};
  });
  await app.outbox.enqueue(note('本机副本', 1, id)); await app.outbox.drain();
  const [conflict] = await app.outbox.conflicts.list(scope);
  await app.outbox.conflicts.resolve(conflict.key, 'use-server', {scope});
  const later = await app.outbox.enqueue(note('稍后新编辑', 2, id)); online = true;
  const repeated = await app.outbox.conflicts.resolve(conflict.key, 'use-server', {scope});
  assert.equal(repeated.already_resolved, true);
  assert.equal((await get(app.db, 'outbox', later.operation.key)).status, 'queued');
  assert.equal((await get(app.db, 'entities', later.entity.key)).local.text, '稍后新编辑');
});

test('an explicit todo undo follows its queued delete and preserves the completion state', async () => {
  const id = randomUUID(), calls = [];
  let remote = {id, date, text: '明确撤销删除', completed: true, version: 1, deleted_at: null};
  const app = setup(async (path, opts) => {
    calls.push([path, opts.method, opts.body.version]);
    remote = {...remote, version: remote.version + 1,
      deleted_at: opts.method === 'DELETE' ? '2026-10-26T00:00:00Z' : null};
    return remote;
  });
  await app.outbox.enqueue({scope, entity_type: 'todo', entity_id: id, method: 'DELETE',
    body: {date, version: 1}, base: remote});
  const undo = await app.outbox.enqueue({scope, entity_type: 'todo', entity_id: id, method: 'POST',
    path: '/todos/' + id + '/restore', body: {date, version: 2}});
  assert.equal(undo.entity.local.completed, true); assert.equal(undo.entity.local.deleted, false);
  assert.equal((await app.outbox.drain()).phase, 'synced');
  assert.deepEqual(calls, [['/todos/' + id, 'DELETE', 1], ['/todos/' + id + '/restore', 'POST', 2]]);
  assert.equal(remote.deleted_at, null); assert.equal(remote.version, 3);
});
