import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createMemoryDB, entityKey} from '../web/offline/db.mjs';
import {createOutbox as createDOutbox} from './fixtures/unify-d-consumer/web/offline/outbox.mjs';
import {createOfflineRuntime as createDRuntime} from './fixtures/unify-d-consumer/web/offline/runtime.mjs';

const scope = 'a'.repeat(64), date = '2026-10-26';
const dOptions = {enabledTypes: ['todo', 'template', 'note_entry', 'memo_group', 'memo_note'],
  supportedProtocols: [1, 2], supportedDependencies: true};
async function snapshot(db) {
  const names = ['entities', 'outbox', 'conflicts', 'meta'];
  return db.transaction(names, 'readonly', async tx => Object.fromEntries(await Promise.all(
    names.map(async name => [name, (await tx.getAll(name)).sort((a, b) => a.key.localeCompare(b.key))]))));
}
async function decisionRows(db, status = 'queued') {
  const resolutionId = randomUUID(), group = randomUUID(), note = randomUUID(), todo = randomUUID(), memo = randomUUID();
  const root = entityKey(scope, 'conflict:' + randomUUID());
  const values = [
    {entity_type: 'todo', source_id: todo, entity_id: 'todo:' + todo, method: 'POST', path: '/todos',
      body: {id: todo, date, text: '【自动测试】E 决策待办'}},
    {entity_type: 'note_entry', source_id: note, entity_id: 'note-entry:' + note, method: 'PUT', path: '/note-entries/' + note,
      body: {category: 'life', date, text: '【自动测试】E 决策碎碎念', version: 0, save_id: randomUUID()}},
    {entity_type: 'memo_group', source_id: group, entity_id: 'memo-group:' + group, method: 'PUT', path: '/memos/groups/' + group,
      body: {title: '【自动测试】E 副本分组', position: 0, version: 0, save_id: randomUUID()}},
    {entity_type: 'memo_note', source_id: memo, entity_id: 'memo-note:' + memo, method: 'PUT', path: '/memos/notes/' + memo,
      body: {group_id: group, title: '【自动测试】E 子笔记', body: '【自动测试】子笔记正文不能丢',
        position: 0, version: 0, save_id: randomUUID()}, depends_on: ['memo-group:' + group]}];
  const operations = values.map((value, index) => {
    const id = randomUUID(), save_id = value.body.save_id || randomUUID();
    return {...value, id, key: entityKey(scope, 'operation:' + id), scope, protocol: 3, resolution_id: resolutionId,
      origin_conflict: root, resolution_receipt: 1, expected_version: 0, save_id, created_at: 1000, attempts: 0,
      next_attempt_at: 0, status, seq: index + 1, claim_owner: null, error: null, base: null,
      local: {...value.body, id: value.source_id, version: 1, deleted: false, deleted_at: null, can_edit: true}};
  });
  const original = {...operations[1], protocol: 1, status: 'conflict'};
  delete original.resolution_id; delete original.origin_conflict; delete original.resolution_receipt;
  const conflict = {key: root, scope, entity_id: original.entity_id, original_operation: original,
    operation: {...original, protocol: 3, resolution_id: resolutionId, origin_conflict: root, resolution_receipt: 1},
    local: original.local, remote: {...original.local, text: '【自动测试】原线上正文', version: 2},
    resolved_at: null, created_at: 999, resolution: {id: resolutionId, state: 'queued', mode: 'copy',
      operation_keys: operations.map(row => row.key), target_id: note}};
  await db.transaction(['entities', 'outbox', 'conflicts', 'meta'], 'readwrite', async tx => {
    for (const operation of operations) {
      await tx.put('outbox', operation);
      await tx.put('entities', {key: entityKey(scope, operation.entity_id), scope, entity_id: operation.entity_id,
        local: operation.local, server: null, dirty: true, conflict: operation.entity_id === original.entity_id ? root : null});
    }
    await tx.put('conflicts', conflict); await tx.put('meta', {key: entityKey(scope, 'outbox-sequence'), value: operations.length});
  });
  return {operations, conflict};
}

test('the retained D consumer fixture is byte-for-byte pinned to its frozen source manifest', async () => {
  const root = new URL('./fixtures/unify-d-consumer/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.source_commit, 'cc98a9786576d17b2eb33f8a1f94d78e36ae7b4b');
  assert.deepEqual(manifest.changes, []); assert.equal(Object.keys(manifest.files).length, 14);
  for (const [path, pin] of Object.entries(manifest.files))
    assert.equal(createHash('sha256').update(await readFile(new URL(path, root))).digest('hex'), pin.sha256, path);
});

test('the actual frozen D dispatcher retains every E decision operation and ledger without an HTTP request', async () => {
  const db = createMemoryDB(), {operations} = await decisionRows(db), before = await snapshot(db), calls = [];
  const old = createDOutbox({...dOptions, db, getScope: () => scope, request: async (...args) => { calls.push(args); }});
  const result = await old.drain();
  assert.deepEqual(calls, []); assert.equal(result.phase, 'upgrade-required');
  assert.equal(result.pending, 4); assert.equal(result.unsupported, 4);
  assert.deepEqual(await old.list(scope), operations); assert.deepEqual(await old.retryable(scope), []);
  assert.deepEqual(await snapshot(db), before);
});

test('matching hypothetical receipts cannot make D acknowledge or delete unknown E resolution requests', async () => {
  const db = createMemoryDB(), {operations} = await decisionRows(db, 'unknown'), before = await snapshot(db), calls = [];
  const old = createDOutbox({...dOptions, db, getScope: () => scope, request: async (path, options = {}) => {
    calls.push({path, options});
    const row = operations.find(value => path.includes(value.save_id) || path.endsWith(value.source_id)) || operations[1];
    return path.includes('/operations/') ? {found: true, id: row.source_id, version: 1, content_hash: 'c'.repeat(64)} :
      {...row.local, content_hash: 'c'.repeat(64), change_seq: 1};
  }});
  assert.equal((await old.drain()).unsupported, 4); assert.deepEqual(calls, []);
  assert.deepEqual(await snapshot(db), before);
});

test('declaring protocol three in D options cannot enable code that D does not implement', async () => {
  const db = createMemoryDB(), {operations} = await decisionRows(db), before = await snapshot(db);
  const old = createDOutbox({...dOptions, supportedProtocols: [1, 2, 3], db, getScope: () => scope,
    request: () => assert.fail('D must not send a protocol-three decision')});
  assert.ok(operations.every(operation => old.canDispatch(operation) === false));
  assert.equal((await old.drain()).unsupported, 4); assert.deepEqual(await old.retryable(scope), []);
  assert.deepEqual(await snapshot(db), before);
});

test('the actual old runtime marks E root conflicts as needing upgrade and cannot archive their decision through use-server', async t => {
  const db = createMemoryDB(), {conflict} = await decisionRows(db), before = await snapshot(db);
  const old = createDRuntime({db, online: () => false, request: () => assert.fail('old runtime must not request E decision data')});
  t.after(() => old.stop());
  Object.assign(old.state, {scope, identity: {id: 'synthetic-owner', username: 'Synthetic owner'}});
  const queue = await old.queue(); assert.equal(queue.operations.length, 4); assert.equal(queue.conflicts.length, 1);
  assert.ok(queue.operations.every(row => row.needs_upgrade)); assert.equal(queue.conflicts[0].needs_upgrade, true);
  for (const choice of ['use-local', 'use-server', 'keep-both'])
    await assert.rejects(old.resolve(conflict.key, choice), error => error.code === 'OFFLINE_UPGRADE_REQUIRED');
  assert.deepEqual(await snapshot(db), before);
});

test('unsupported E rows never enter D fast retry or paused-resume paths', async t => {
  const db = createMemoryDB(), {operations} = await decisionRows(db, 'paused'), before = await snapshot(db); let calls = 0;
  const old = createDOutbox({...dOptions, db, getScope: () => scope, request: () => { calls++; }});
  assert.equal(await old.resume(scope), 0); assert.deepEqual(await old.retryable(scope), []);
  const runtime = createDRuntime({db, online: () => false, request: () => { calls++; }}); t.after(() => runtime.stop());
  Object.assign(runtime.state, {scope, identity: {id: 'synthetic-owner', username: 'Synthetic owner'}});
  await runtime.sync(); assert.equal(runtime.state.unsupported, operations.length); assert.equal(runtime.state.pending, operations.length);
  await new Promise(resolve => setTimeout(resolve, 350)); assert.equal(calls, 0);
  assert.deepEqual(await snapshot(db), before);
});
