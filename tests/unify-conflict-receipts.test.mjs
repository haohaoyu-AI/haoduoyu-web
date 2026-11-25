import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryDB, entityKey} from '../web/offline/db.mjs';
import {createOutbox} from '../web/offline/outbox.mjs';

const scope = 'a'.repeat(64), date = '2026-10-26', stamp = '2026-10-26T01:00:00.000Z';
const read = (db, store, key) => db.transaction([store], 'readonly', tx => tx.get(store, key));
async function snapshot(db) {
  const names = ['entities', 'outbox', 'conflicts', 'meta'];
  return db.transaction(names, 'readonly', async tx => Object.fromEntries(await Promise.all(
    names.map(async name => [name, (await tx.getAll(name)).sort((a, b) => a.key.localeCompare(b.key))]))));
}
function confirmed(operation) {
  return {id: operation.source_id, category: 'life', date, text: operation.body.text, version: operation.expected_version + 1,
    deleted: false, deleted_at: null, can_edit: true, content_hash: 'c'.repeat(64), change_seq: 7,
    created_at: stamp, updated_at: stamp};
}
async function fixture(request = () => assert.fail('no HTTP was authorized')) {
  const db = createMemoryDB(), clock = {value: 1000}, resolution = randomUUID(), root = entityKey(scope, 'conflict:' + randomUUID());
  const outbox = createOutbox({db, getScope: () => scope, request: (...args) => request(...args), now: () => clock.value,
    supportedProtocols: [1, 2, 3], supportedDependencies: true});
  const saved = await outbox.enqueue({scope, entity_type: 'note_entry', entity_id: randomUUID(), method: 'PUT',
    protocol: 3, resolution_id: resolution, origin_conflict: root, resolution_receipt: 1,
    body: {category: 'life', date, text: '【自动测试】决策正文', version: 0, save_id: randomUUID()},
    local: {category: 'life', date, text: '【自动测试】决策正文', deleted: false, deleted_at: null, can_edit: true}});
  const conflict = {key: root, scope, entity_id: saved.operation.entity_id, operation: saved.operation,
    local: saved.entity.local, remote: null, resolved_at: null, created_at: 999,
    resolution: {id: resolution, state: 'queued', mode: 'copy', operation_keys: [saved.operation.key],
      target_id: saved.operation.source_id}};
  const remember = () => db.transaction(['conflicts'], 'readwrite', tx => tx.put('conflicts', conflict));
  return {db, clock, outbox, conflict, remember, ...saved};
}

test('valid protocol-three markers cannot dispatch when their decision root is missing', async () => {
  let calls = 0;
  const f = await fixture(() => { calls++; });
  const body = structuredClone(f.operation.body), local = structuredClone(f.entity.local), result = await f.outbox.drain();
  assert.equal(calls, 0); assert.notEqual(result.phase, 'synced');
  const pending = await read(f.db, 'outbox', f.operation.key), entity = await read(f.db, 'entities', f.entity.key);
  assert.equal(pending.status, 'blocked'); assert.equal(pending.error, 'OFFLINE_DECISION_EVIDENCE_MISSING');
  assert.equal(pending.save_id, f.operation.save_id); assert.deepEqual(pending.body, body);
  assert.equal(entity.dirty, true); assert.deepEqual(entity.local, local); assert.equal(entity.server, null);
  assert.equal(await read(f.db, 'conflicts', f.conflict.key), undefined);
});

test('a consumer without resolution receipt support retains protocol-three operations and ledger bytes untouched', async () => {
  const f = await fixture(); await f.remember(); const before = await snapshot(f.db);
  const old = createOutbox({db: f.db, getScope: () => scope, supportedProtocols: [1, 2, 3], resolutionReceipts: false,
    request: () => assert.fail('disabled decision receipts must reject before HTTP')});
  assert.equal(old.canDispatch(f.operation), false);
  const result = await old.drain();
  assert.equal(result.unsupported, 1); assert.equal(result.phase, 'upgrade-required');
  assert.deepEqual(await old.retryable(scope), []); assert.deepEqual(await snapshot(f.db), before);
});

test('a root removed after a strict HTTP success rolls back ACK deletion and preserves the original unknown request for receipt recovery', async () => {
  let f, writes = 0;
  const calls = [];
  f = await fixture(async (path, options = {}) => {
    calls.push({path, method: options.method || 'GET'});
    if (options.method === 'PUT') {
      writes++;
      await f.db.transaction(['conflicts'], 'readwrite', tx => tx.delete('conflicts', f.conflict.key));
      return confirmed(f.operation);
    }
    if (path.includes('/operations/')) return {found: true, id: f.operation.source_id, version: 1, content_hash: 'c'.repeat(64)};
    return confirmed(f.operation);
  });
  await f.remember(); await f.outbox.drain();
  const unknown = await read(f.db, 'outbox', f.operation.key), dirty = await read(f.db, 'entities', f.entity.key);
  assert.equal(unknown.status, 'unknown'); assert.equal(unknown.error, 'OFFLINE_DECISION_EVIDENCE_MISSING');
  assert.equal(unknown.save_id, f.operation.save_id); assert.deepEqual(unknown.body, f.operation.body);
  assert.equal(dirty.dirty, true); assert.equal(dirty.server, null);
  assert.equal(await read(f.db, 'conflicts', f.conflict.key), undefined);
  await f.remember(); f.clock.value += 5000; await f.outbox.drain();
  assert.equal(writes, 1); assert.equal(await read(f.db, 'outbox', f.operation.key), undefined);
  const root = await read(f.db, 'conflicts', f.conflict.key);
  assert.equal(root.resolution.state, 'synced'); assert.equal(root.resolution.acknowledgements[0].save_id, f.operation.save_id);
  assert.ok(calls.some(call => call.path === '/note-entries/operations/' + f.operation.save_id));
});

test('a valid strict ACK atomically removes the queue row, confirms its entity and records real server proof in the decision ledger', async () => {
  let f, writes = 0;
  f = await fixture(async (_path, options) => { writes++; assert.equal(options.method, 'PUT'); return confirmed(f.operation); });
  await f.remember(); const before = structuredClone(f.conflict); const result = await f.outbox.drain();
  assert.equal(result.phase, 'synced'); assert.equal(writes, 1);
  const state = await snapshot(f.db), entity = state.entities.find(row => row.key === f.entity.key);
  const root = state.conflicts.find(row => row.key === f.conflict.key);
  assert.deepEqual(state.outbox, []); assert.equal(entity.dirty, false); assert.deepEqual(entity.server, confirmed(f.operation));
  assert.deepEqual(entity.local, entity.server); assert.equal(root.resolved_at, f.clock.value);
  assert.equal(root.resolution.state, 'synced'); assert.deepEqual(root.operation, before.operation);
  assert.deepEqual(root.local, before.local); assert.deepEqual(root.remote, before.remote);
  assert.deepEqual(root.resolution.acknowledgements, [{operation_key: f.operation.key, save_id: f.operation.save_id,
    remote: confirmed(f.operation), acknowledged_at: f.clock.value}]);
});

test('an abandoned protocol-three parent creation produces a linked child conflict without sending or resurrecting either parent', async () => {
  const db = createMemoryDB(), resolution = randomUUID(), rootKey = entityKey(scope, 'conflict:' + randomUUID()); let calls = 0;
  const outbox = createOutbox({db, getScope: () => scope, supportedDependencies: true,
    request: () => { calls++; assert.fail('an abandoned parent must prevent child HTTP'); }});
  const marker = {scope, protocol: 3, resolution_id: resolution, origin_conflict: rootKey, resolution_receipt: 1};
  const parentId = randomUUID(), parent = await outbox.enqueue({...marker, entity_type: 'memo_group', entity_id: parentId, method: 'PUT',
    body: {title: '【自动测试】放弃的新父分组', position: 0, version: 0, save_id: randomUUID()}});
  const child = await outbox.enqueue({...marker, entity_type: 'memo_note', entity_id: randomUUID(), method: 'PUT',
    depends_on: ['memo-group:' + parentId], body: {group_id: parentId, title: '【自动测试】必须保留的子笔记',
      body: '【自动测试】父分组未成功时也不能丢正文', position: 0, version: 0, save_id: randomUUID()}});
  const root = {key: rootKey, scope, entity_id: child.operation.entity_id, operation: child.operation,
    local: child.entity.local, remote: null, resolved_at: null,
    resolution: {id: resolution, state: 'queued', operation_keys: [parent.operation.key, child.operation.key]}};
  await db.transaction(['outbox', 'conflicts'], 'readwrite', async tx => {
    await tx.put('outbox', {...parent.operation, status: 'archived'}); await tx.put('conflicts', root);
  });
  await outbox.drain(); assert.equal(calls, 0);
  const pending = await read(db, 'outbox', child.operation.key), conflicts = await outbox.conflicts.list(scope);
  const linked = conflicts.find(row => row.resolution_parent === rootKey);
  assert.equal(pending.status, 'conflict'); assert.ok(linked); assert.equal(linked.reason, 'MEMO_GROUP_UNAVAILABLE');
  assert.equal(linked.local.body, child.operation.body.body);
  assert.equal((await read(db, 'entities', parent.entity.key)).server, null);
  assert.equal((await read(db, 'outbox', parent.operation.key)).status, 'archived');
  assert.equal((await read(db, 'conflicts', rootKey)).resolution.state, 'conflict');
});
