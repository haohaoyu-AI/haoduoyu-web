import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMemoryDB, entityKey} from '../web/offline/db.mjs';
import {recordResolutionAck, recordResolutionConflict, recordResolutionFailure,
  finishServerResolution} from '../web/offline/resolution-ledger.mjs';

const scope = 'a'.repeat(64), otherScope = 'b'.repeat(64), resolutionId = 'synthetic-resolution';
const stores = ['entities', 'outbox', 'conflicts', 'meta'];
const read = (db, name, key) => db.transaction([name], 'readonly', tx => tx.get(name, key));
const transaction = (db, callback) => db.transaction(stores, 'readwrite', callback);
const snapshot = db => db.transaction(stores, 'readonly', async tx => Object.fromEntries(
  await Promise.all(stores.map(async name => [name, await tx.getAll(name)]))));
function operation(index, parent = resolutionId) {
  return {key: entityKey(scope, 'operation:copy-' + index), scope, entity_id: 'todo:copy', save_id: 'save-copy-' + index,
    resolution_id: parent, method: index === 1 ? 'POST' : 'PATCH', expected_version: index - 1, status: 'queued'};
}
function remoteTodo(version) {
  return {id: 'copy', date: '2026-10-26', text: '【自动测试】完成待办副本', completed: version === 2,
    version, deleted_at: null};
}
async function fixture(count = 2) {
  const db = createMemoryDB(), operations = Array.from({length: count}, (_, index) => operation(index + 1));
  const root = {key: entityKey(scope, 'conflict:original'), scope, entity_id: 'todo:original', resolved_at: null,
    local: {id: 'original', text: '【自动测试】本机原文', completed: true},
    remote: {id: 'original', text: '【自动测试】线上原文', completed: false},
    operation: {key: entityKey(scope, 'operation:original'), scope, save_id: 'original-save', status: 'conflict'},
    resolution: {id: resolutionId, mode: 'copy', target_id: 'copy', state: 'queued',
      operation_keys: operations.map(row => row.key)}};
  const original = {key: entityKey(scope, root.entity_id), scope, entity_id: root.entity_id,
    server: structuredClone(root.remote), local: structuredClone(root.remote), dirty: false};
  const copy = {key: entityKey(scope, 'todo:copy'), scope, entity_id: 'todo:copy',
    server: null, local: {id: 'copy', text: root.local.text, completed: true}, dirty: true};
  await transaction(db, async tx => {
    await tx.put('conflicts', root); await tx.put('entities', original); await tx.put('entities', copy);
    for (const row of operations) await tx.put('outbox', row);
  });
  return {db, root, operations, original, copy, current: () => read(db, 'conflicts', root.key)};
}

test('a completed-copy resolution stays open after creation and resolves only after the final FIFO ACK', async () => {
  const f = await fixture(), [create, complete] = f.operations;
  await transaction(f.db, tx => recordResolutionAck(tx, create, remoteTodo(1), 100));
  const pending = await f.current();
  assert.equal(pending.resolved_at, null); assert.equal(pending.resolution.state, 'queued');
  assert.equal(pending.resolution.acknowledgements.length, 1);
  assert.equal(pending.resolution.acknowledgements[0].remote.completed, false);
  await transaction(f.db, tx => recordResolutionAck(tx, complete, remoteTodo(2), 200));
  const finished = await f.current();
  assert.equal(finished.resolved_at, 200); assert.equal(finished.resolution.state, 'synced');
  assert.equal(finished.resolution.completed_at, 200); assert.equal(finished.resolution.acknowledgements.length, 2);
  assert.deepEqual(finished.resolution.acknowledgements.map(row => row.remote.version), [1, 2]);
  assert.deepEqual(finished.local, f.root.local); assert.deepEqual(finished.remote, f.root.remote);
  assert.deepEqual(finished.operation, f.root.operation);
});
test('the ledger retains full acknowledged server evidence including its unchanged hash', async () => {
  const f = await fixture(1), op = f.operations[0];
  const remote = {id: 'copy', category: 'work', date: '2026-10-26', text: '【自动测试】确认原文', version: 1,
    change_seq: 42, can_edit: true, deleted: false, deleted_at: null,
    content_hash: createHash('sha256').update('synthetic confirmed note row').digest('hex')};
  await transaction(f.db, tx => recordResolutionAck(tx, op, remote, 100));
  const proof = (await f.current()).resolution.acknowledgements[0];
  assert.deepEqual(proof.remote, remote); assert.equal(proof.remote.content_hash, remote.content_hash);
  assert.equal(proof.save_id, op.save_id); assert.equal(proof.operation_key, op.key); assert.equal(proof.acknowledged_at, 100);
});
test('duplicate acknowledgements cannot add proof entries or finish a multi-operation choice early', async () => {
  const f = await fixture(), first = f.operations[0];
  await transaction(f.db, tx => recordResolutionAck(tx, first, remoteTodo(1), 100));
  await transaction(f.db, tx => recordResolutionAck(tx, first, remoteTodo(1), 150));
  assert.equal((await f.current()).resolution.acknowledgements.length, 1); assert.equal((await f.current()).resolved_at, null);
  await transaction(f.db, tx => recordResolutionAck(tx, f.operations[1], remoteTodo(2), 200));
  const finished = await snapshot(f.db);
  await transaction(f.db, tx => recordResolutionAck(tx, first, remoteTodo(1), 300));
  assert.deepEqual(await snapshot(f.db), finished);
});
test('wrong owner, resolution identity or operation key cannot acknowledge a different decision', async () => {
  const f = await fixture(), before = await snapshot(f.db);
  for (const fields of [{scope: otherScope}, {resolution_id: 'different-resolution'}, {key: 'different-operation'}, {resolution_id: null}]) {
    await transaction(f.db, tx => recordResolutionAck(tx, {...f.operations[0], ...fields}, remoteTodo(1), 100));
  }
  assert.deepEqual(await snapshot(f.db), before);
});
test('failure and child-conflict notifications with another owner or resolution leave the root unchanged', async () => {
  const f = await fixture(), before = await snapshot(f.db);
  const child = {key: entityKey(scope, 'conflict:unrelated'), scope, resolved_at: null};
  for (const fields of [{scope: otherScope}, {resolution_id: 'different-resolution'}, {resolution_id: null}]) {
    const op = {...f.operations[0], ...fields};
    await transaction(f.db, async tx => {
      await recordResolutionFailure(tx, op, {status: 'blocked', error: 'different operation'});
      assert.deepEqual(await recordResolutionConflict(tx, op, child), child);
    });
  }
  assert.deepEqual(await snapshot(f.db), before);
});
test('a child conflict links back to the queued choice while retaining every original local and remote copy', async () => {
  const f = await fixture(), before = await snapshot(f.db);
  const child = {key: entityKey(scope, 'conflict:child'), scope, entity_id: 'todo:copy', resolved_at: null,
    local: {id: 'copy', text: '【自动测试】副本本机原文'}, remote: {id: 'copy', text: '【自动测试】副本线上原文'}};
  await transaction(f.db, async tx => {
    await tx.put('conflicts', await recordResolutionConflict(tx, f.operations[0], child));
  });
  const parent = await f.current(), savedChild = await read(f.db, 'conflicts', child.key);
  assert.equal(parent.resolved_at, null); assert.equal(parent.resolution.state, 'conflict');
  assert.deepEqual(parent.resolution.conflict_keys, [child.key]); assert.equal(savedChild.resolution_parent, parent.key);
  assert.deepEqual(parent.local, f.root.local); assert.deepEqual(parent.remote, f.root.remote);
  assert.deepEqual(savedChild.local, child.local); assert.deepEqual(savedChild.remote, child.remote);
  const after = await snapshot(f.db);
  assert.deepEqual(after.entities, before.entities); assert.deepEqual(after.outbox, before.outbox);
});
async function descendant(f, state) {
  const middle = {key: entityKey(scope, 'conflict:middle'), scope, resolved_at: null, resolution_parent: f.root.key,
    resolution: {id: 'middle-resolution', state: 'conflict', operation_keys: ['middle-operation']}};
  const child = {key: entityKey(scope, 'conflict:child'), scope, resolved_at: state === 'accepted-server' ? 300 : null,
    resolution_parent: middle.key, resolution: {id: 'child-resolution', state, operation_keys: ['child-operation']}};
  await transaction(f.db, async tx => {
    for (const op of f.operations) await tx.put('outbox', {...op, status: 'archived'});
    await tx.put('conflicts', middle); await tx.put('conflicts', child);
  });
  return {middle, child};
}
test('an explicit server choice on a child finishes ancestors as superseded without claiming old-intent ACKs', async () => {
  const f = await fixture(), {middle, child} = await descendant(f, 'accepted-server');
  await transaction(f.db, tx => finishServerResolution(tx, child, 300));
  for (const key of [middle.key, f.root.key]) {
    const row = await read(f.db, 'conflicts', key);
    assert.equal(row.resolution.state, 'superseded'); assert.equal(row.resolved_at, 300);
    assert.equal(row.resolution.completed_by, child.key); assert.equal(row.resolution.completed_at, 300);
    assert.equal(row.resolution.acknowledgements, undefined);
  }
  const root = await f.current(); assert.deepEqual(root.local, f.root.local); assert.deepEqual(root.remote, f.root.remote);
});
test('a child resolution with a true final ACK supersedes its ancestors and keeps its own proof', async () => {
  const f = await fixture(), {middle, child} = await descendant(f, 'queued');
  const op = {...f.operations[0], key: 'child-operation', resolution_id: 'child-resolution'};
  await transaction(f.db, tx => recordResolutionAck(tx, op, remoteTodo(1), 400));
  const completed = await read(f.db, 'conflicts', child.key);
  assert.equal(completed.resolution.state, 'synced'); assert.equal(completed.resolved_at, 400);
  assert.deepEqual(completed.resolution.acknowledgements[0].remote, remoteTodo(1));
  for (const key of [middle.key, f.root.key]) {
    const row = await read(f.db, 'conflicts', key);
    assert.equal(row.resolution.state, 'superseded'); assert.equal(row.resolved_at, 400);
    assert.equal(row.resolution.acknowledgements, undefined); assert.equal(row.resolution.completed_by, child.key);
  }
});
test('unknown, blocked and paused outcomes retain the open root and its evidence', async () => {
  for (const [status, state] of [['unknown', 'queued'], ['blocked', 'blocked'], ['paused', 'paused']]) {
    const f = await fixture();
    await transaction(f.db, tx => recordResolutionFailure(tx, f.operations[0], {status, error: 'synthetic-' + status}));
    const root = await f.current();
    assert.equal(root.resolved_at, null); assert.equal(root.resolution.state, state);
    assert.equal(root.resolution.last_error, 'synthetic-' + status);
    assert.equal(root.resolution.acknowledgements, undefined);
    assert.deepEqual(root.local, f.root.local); assert.deepEqual(root.remote, f.root.remote);
  }
});
async function memoFamily() {
  const f = await fixture(), group = {...f.operations[0], entity_id: 'memo-group:new-parent', entity_type: 'memo_group'};
  const note = {...f.operations[1], entity_id: 'memo-note:new-note', entity_type: 'memo_note',
    depends_on: ['memo-group:new-parent']};
  const child = {key: entityKey(scope, 'conflict:group-child'), scope, entity_id: group.entity_id, operation: group,
    resolved_at: null, local: {title: '【自动测试】本机冲突副本'}, remote: {title: '【自动测试】线上分组', deleted_at: 'deleted'}};
  await transaction(f.db, async tx => {
    await tx.put('outbox', group); await tx.put('outbox', note);
    await tx.put('conflicts', await recordResolutionConflict(tx, group, child));
    await tx.put('outbox', {...group, status: 'conflict'});
  });
  return {...f, group, note, child: await read(f.db, 'conflicts', child.key)};
}
async function acceptChild(db, child, time) {
  const accepted = {...child, resolved_at: time, resolution: {id: child.key + ':server', state: 'accepted-server', operation_keys: []}};
  await transaction(db, async tx => {
    await tx.put('outbox', {...child.operation, status: 'archived'});
    await tx.put('conflicts', accepted); await finishServerResolution(tx, accepted, time);
  });
  return accepted;
}
test('finishing a failed copied parent group cannot close the root while its dependent note is still queued', async () => {
  const f = await memoFamily(), ancestor = {key: entityKey(scope, 'conflict:ancestor'), scope, resolved_at: null,
    resolution: {id: 'ancestor-resolution', state: 'conflict', operation_keys: []}};
  await transaction(f.db, async tx => {
    await tx.put('conflicts', ancestor);
    await tx.put('conflicts', {...await tx.get('conflicts', f.root.key), resolution_parent: ancestor.key});
  });
  const before = await f.current();
  await acceptChild(f.db, f.child, 300);
  const root = await f.current();
  assert.equal(root.resolved_at, null); assert.equal(root.resolution.state, 'conflict');
  assert.deepEqual(root.resolution.completed_children, [f.child.key]);
  assert.equal((await read(f.db, 'outbox', f.note.key)).status, 'queued');
  assert.deepEqual(root.local, before.local); assert.deepEqual(root.remote, before.remote);
  assert.equal(root.resolution.acknowledgements, undefined);
  assert.deepEqual(await read(f.db, 'conflicts', ancestor.key), ancestor);
});
test('ACK and retry failure of another operation cannot hide an unresolved child conflict', async () => {
  const f = await memoFamily();
  await transaction(f.db, async tx => {
    await tx.delete('outbox', f.note.key); await recordResolutionAck(tx, f.note, {id: 'new-note', version: 1, body: '确认正文'}, 200);
    await recordResolutionFailure(tx, f.group, {status: 'unknown', error: 'response lost'});
  });
  const waiting = await f.current();
  assert.equal(waiting.resolved_at, null); assert.equal(waiting.resolution.state, 'conflict');
  assert.equal(waiting.resolution.acknowledgements.length, 1);
  await acceptChild(f.db, f.child, 300);
  const finished = await f.current();
  assert.equal(finished.resolved_at, 300); assert.equal(finished.resolution.state, 'superseded');
  assert.equal(finished.resolution.acknowledgements.length, 1);
  assert.equal(finished.resolution.acknowledgements[0].operation_key, f.note.key);
});
test('a final sibling ACK completes a root only after the earlier child branch was explicitly settled', async () => {
  const f = await memoFamily(); await acceptChild(f.db, f.child, 300);
  assert.equal((await f.current()).resolved_at, null);
  await transaction(f.db, async tx => {
    await tx.delete('outbox', f.note.key); await recordResolutionAck(tx, f.note, {id: 'new-note', version: 1, body: '确认正文'}, 400);
  });
  const root = await f.current();
  assert.equal(root.resolved_at, 400); assert.equal(root.resolution.state, 'superseded');
  assert.deepEqual(root.resolution.completed_children, [f.child.key]); assert.equal(root.resolution.acknowledgements.length, 1);
});
test('a dependent note child must finish its own explicit server or fresh ACK choice before the root can close', async () => {
  for (const choice of ['server', 'fresh-ack']) {
    const f = await memoFamily(), acceptedGroup = await acceptChild(f.db, f.child, 300);
    const child = {key: entityKey(scope, 'conflict:note-child'), scope, entity_id: f.note.entity_id,
      operation: f.note, resolved_at: null, local: {body: '【自动测试】未丢的本机正文'}, remote: {body: '【自动测试】线上正文'}};
    await transaction(f.db, async tx => {
      await tx.put('conflicts', await recordResolutionConflict(tx, f.note, child));
      await tx.put('outbox', {...f.note, status: 'conflict'});
    });
    const linked = await read(f.db, 'conflicts', child.key); assert.equal((await f.current()).resolved_at, null);
    if (choice === 'server') await acceptChild(f.db, linked, 500);
    else {
      const replacement = {...f.note, key: 'new-note-choice', resolution_id: 'new-note-resolution', status: 'queued'};
      await transaction(f.db, async tx => {
        await tx.put('outbox', {...f.note, status: 'archived'}); await tx.put('outbox', replacement);
        await tx.put('conflicts', {...linked, resolution: {id: replacement.resolution_id, state: 'queued',
          operation_keys: [replacement.key]}});
      });
      await transaction(f.db, tx => finishServerResolution(tx, acceptedGroup, 450));
      assert.equal((await f.current()).resolved_at, null);
      await transaction(f.db, async tx => {
        await tx.delete('outbox', replacement.key);
        await recordResolutionAck(tx, replacement, {id: 'copied-again', version: 1, body: linked.local.body}, 500);
      });
    }
    const root = await f.current();
    assert.equal(root.resolved_at, 500); assert.equal(root.resolution.state, 'superseded');
    assert.deepEqual(root.resolution.completed_children, [f.child.key, child.key]);
    assert.equal(root.resolution.acknowledgements, undefined);
    assert.deepEqual((await read(f.db, 'conflicts', child.key)).local, child.local);
    assert.deepEqual(root.local, f.root.local); assert.deepEqual(root.remote, f.root.remote);
  }
});
test('a failed durable transaction rolls ACK proof, completion, entity adoption and outbox status back together', async () => {
  const f = await fixture(1), before = await snapshot(f.db), op = f.operations[0];
  await assert.rejects(transaction(f.db, async tx => {
    await tx.put('outbox', {...op, status: 'acked'});
    await tx.put('entities', {...f.copy, server: remoteTodo(1), local: remoteTodo(1), dirty: false});
    await recordResolutionAck(tx, op, remoteTodo(1), 500);
    throw new Error('synthetic quota failure');
  }), /quota/);
  assert.deepEqual(await snapshot(f.db), before);
});
