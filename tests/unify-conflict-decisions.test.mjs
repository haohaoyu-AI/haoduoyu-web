import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryDB, entityKey} from '../web/offline/db.mjs';
import {createConflictDecisions, conflictDecisionToken} from '../web/offline/conflict-decisions.mjs';

const scope = 'a'.repeat(64), otherScope = 'b'.repeat(64), date = '2026-10-26';
const stamp = '2026-10-26T01:00:00.000Z';
const prefixes = {todo: 'todo:', template: 'template:', note_entry: 'note-entry:',
  memo_group: 'memo-group:', memo_note: 'memo-note:'};
const read = (db, store, key) => db.transaction([store], 'readonly', tx => tx.get(store, key));
const rows = (db, store) => db.transaction([store], 'readonly', tx => tx.getAll(store));
const changed = error => error.code === 'OFFLINE_CONFLICT_CHANGED';
function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return {promise, resolve};
}
async function snapshot(db) {
  const names = ['entities', 'outbox', 'conflicts', 'meta'];
  return db.transaction(names, 'readonly', async tx => Object.fromEntries(
    await Promise.all(names.map(async name => [name, (await tx.getAll(name)).sort((a, b) => a.key.localeCompare(b.key))]))));
}
function noteRow(id, version, text) {
  return {id, category: 'life', date, text, version, can_edit: true, deleted: false, deleted_at: null,
    created_at: stamp, updated_at: stamp, change_seq: version, content_hash: String(version).repeat(64)};
}
async function fixture(options = {}) {
  const db = createMemoryDB(), id = randomUUID(), entity_id = 'note-entry:' + id, originalSave = randomUUID();
  const remote = noteRow(id, 2, '【自动测试】线上原文'), local = noteRow(id, 2, '【自动测试】本机原文');
  const operation = {id: randomUUID(), scope, entity_id, source_id: id, entity_type: 'note_entry', protocol: 1,
    method: 'PUT', path: '/note-entries/' + id, expected_version: 1, save_id: originalSave,
    body: {category: 'life', date, text: local.text, version: 1, save_id: originalSave},
    local: structuredClone(local), base: noteRow(id, 1, '【自动测试】旧基线'), status: 'conflict', seq: 1,
    claim_owner: 'synthetic-claim', attempts: 1, next_attempt_at: 0};
  operation.key = entityKey(scope, 'operation:' + operation.id);
  const key = entityKey(scope, 'conflict:' + operation.id);
  const conflict = {key, scope, entity_id, operation: structuredClone(operation), local: structuredClone(local),
    remote: structuredClone(remote), reason: 'VERSION_CONFLICT', created_at: 100, resolved_at: null};
  const entity = {key: entityKey(scope, entity_id), scope, entity_id, local: structuredClone(local),
    server: structuredClone(remote), dirty: true, conflict: key};
  await db.transaction(['entities', 'outbox', 'conflicts', 'meta'], 'readwrite', async tx => {
    await tx.put('entities', entity); await tx.put('outbox', operation); await tx.put('conflicts', conflict);
    await tx.put('meta', {key: entityKey(scope, 'outbox-sequence'), value: 1});
  });
  const state = {scope, fresh: structuredClone(remote), prepareCalls: 0, appended: 0, beforePrepare: null, beforeAppend: null};
  const append = async (tx, inputs) => {
    const result = [];
    for (const input of inputs) {
      const source_id = input.entity_id, entityId = prefixes[input.entity_type] + source_id;
      const key = entityKey(scope, entityId), old = await tx.get('entities', key);
      const sequenceKey = entityKey(scope, 'outbox-sequence'), sequence = (await tx.get('meta', sequenceKey)).value + 1;
      const expected_version = input.body.version || 0, save_id = input.body.save_id || randomUUID();
      const next = {...structuredClone(input), id: randomUUID(), source_id, entity_id: entityId,
        expected_version, save_id, status: 'queued', seq: sequence, claim_owner: null};
      next.key = entityKey(scope, 'operation:' + next.id);
      const value = {...old, key, scope, entity_id: entityId, server: input.base || old?.server || null,
        local: {...structuredClone(input.local), id: source_id, version: expected_version + 1}, dirty: true, conflict: null};
      await tx.put('outbox', next); await tx.put('entities', value);
      await tx.put('meta', {key: sequenceKey, value: sequence});
      state.appended++; result.push({operation: next, entity: value});
    }
    if (state.beforeAppend) await state.beforeAppend(tx, inputs);
    return result;
  };
  const prepare = async (current, settings) => {
    state.prepareCalls++;
    if (state.beforePrepare) await state.beforePrepare(current, settings);
    return {remote: structuredClone(state.fresh), groups: []};
  };
  const create = () => createConflictDecisions({db, getScope: () => state.scope, now: () => 1000,
    uuid: randomUUID, prepare, append, canDispatch: options.canDispatch || (() => true)});
  return {db, id, entity_id, key, operation, conflict, entity, remote, local, state, create,
    current: () => read(db, 'conflicts', key), active: async () => (await rows(db, 'outbox')).filter(row => row.status !== 'archived')};
}

test('use-local creates a fresh CAS intent while retaining both evidence bodies and the original request verbatim', async () => {
  const f = await fixture(), original = structuredClone(f.operation);
  const resolved = await f.create().resolve(f.key, 'use-local', {expected: conflictDecisionToken(f.conflict)});
  const [next] = await f.active(), archived = await read(f.db, 'outbox', f.operation.key), evidence = await f.current();
  const {archived_by, ...preserved} = archived;
  assert.equal(archived_by, resolved.resolution.id); assert.deepEqual({...preserved, status: original.status}, original);
  assert.equal(next.body.version, 2); assert.equal(next.body.text, f.local.text);
  assert.notEqual(next.save_id, original.save_id); assert.equal(next.body.save_id, next.save_id);
  assert.equal(next.status, 'queued'); assert.equal(next.source_id, f.id);
  assert.deepEqual(evidence.local, f.conflict.local); assert.deepEqual(evidence.remote, f.conflict.remote);
  assert.deepEqual(evidence.original_operation, f.conflict.operation); assert.equal(evidence.resolved_at, null);
  assert.equal(evidence.operation.protocol, 3); assert.deepEqual(evidence.operation.body, f.conflict.operation.body);
  assert.equal(evidence.operation.save_id, f.conflict.operation.save_id);
  assert.equal(evidence.resolution.state, 'queued');
  assert.equal(resolved.resolution.mode, 'replace'); assert.deepEqual(resolved.resolution.operation_keys, [next.key]);
  assert.equal((await read(f.db, 'entities', f.entity.key)).dirty, true);
});

test('keep-both queues a new UUID without changing the remote original or falsely acknowledging the new copy', async () => {
  const f = await fixture(), resolved = await f.create().resolve(f.key, 'keep-both');
  const [next] = await f.active();
  assert.notEqual(next.source_id, f.id); assert.equal(next.body.version, 0); assert.equal(next.body.text, f.local.text);
  assert.equal(resolved.resolution.mode, 'copy'); assert.equal(resolved.resolution.target_id, next.source_id);
  const original = await read(f.db, 'entities', f.entity.key), copy = await read(f.db, 'entities', entityKey(scope, next.entity_id));
  assert.deepEqual(original.server, f.remote); assert.deepEqual(original.local, f.remote); assert.equal(original.dirty, false);
  assert.equal(copy.dirty, true); assert.equal(copy.server, null); assert.equal(copy.local.text, f.local.text);
});

test('use-server archives the branch but preserves the original local and server conflict evidence', async () => {
  const f = await fixture(), resolved = await f.create().resolve(f.key, 'use-server');
  assert.deepEqual(await f.active(), []); assert.equal(f.state.appended, 0);
  assert.equal(resolved.resolution.mode, 'server'); assert.deepEqual(resolved.resolution.operation_keys, []);
  const entity = await read(f.db, 'entities', f.entity.key), conflict = await f.current();
  assert.deepEqual(entity.local, f.remote); assert.deepEqual(entity.server, f.remote); assert.equal(entity.dirty, false);
  assert.deepEqual(conflict.local, f.local); assert.deepEqual(conflict.remote, f.remote);
});

test('an exact FIFO branch is replaced atomically while unrelated operations retain their original status and bytes', async () => {
  const f = await fixture(), tail = {...structuredClone(f.operation), id: randomUUID(), seq: 2, status: 'queued'};
  tail.key = entityKey(scope, 'operation:' + tail.id); tail.body = {...tail.body, version: 2, save_id: randomUUID()};
  tail.save_id = tail.body.save_id;
  const unrelated = {...structuredClone(f.operation), id: randomUUID(), entity_id: 'note-entry:' + randomUUID(), seq: 3, status: 'unknown'};
  unrelated.key = entityKey(scope, 'operation:' + unrelated.id);
  await f.db.transaction(['outbox', 'meta'], 'readwrite', async tx => {
    await tx.put('outbox', tail); await tx.put('outbox', unrelated);
    await tx.put('meta', {key: entityKey(scope, 'outbox-sequence'), value: 3});
  });
  await f.create().resolve(f.key, 'use-local');
  assert.equal((await read(f.db, 'outbox', tail.key)).status, 'archived');
  assert.deepEqual(await read(f.db, 'outbox', unrelated.key), unrelated);
  const active = await f.active(), replacement = active.find(row => row.entity_id === f.entity_id);
  assert.equal(replacement.seq, 4); assert.equal(replacement.body.version, f.remote.version);
});

test('repeated clicks and a reopened resolver reuse the committed decision and never enqueue a second copy', async () => {
  const f = await fixture(), first = await f.create().resolve(f.key, 'keep-both');
  const count = f.state.appended, stored = await snapshot(f.db), second = await f.create().resolve(f.key, 'keep-both');
  assert.equal(second.already_resolved, true); assert.deepEqual(second.resolution, first.resolution);
  assert.equal(f.state.appended, count); assert.deepEqual(await snapshot(f.db), stored);
});

test('two tabs resolving the same conflict concurrently commit one stable decision and one new operation', async () => {
  const f = await fixture(), gate = deferred(), entered = deferred(); let preparing = 0;
  f.state.beforePrepare = async () => { if (++preparing === 2) entered.resolve(); await gate.promise; };
  const one = f.create().resolve(f.key, 'keep-both'), two = f.create().resolve(f.key, 'keep-both');
  await entered.promise; gate.resolve();
  const [first, second] = await Promise.all([one, two]);
  assert.deepEqual(first.resolution, second.resolution); assert.equal(f.state.appended, 1);
  assert.equal((await f.active()).length, 1); assert.ok(first.already_resolved || second.already_resolved);
});

test('a fresh remote change is shown for comparison before a second deliberate choice can replace it', async () => {
  const f = await fixture(); f.state.fresh = noteRow(f.id, 3, '【自动测试】刚出现的线上新稿');
  const first = await f.create().resolve(f.key, 'use-local', {expected: conflictDecisionToken(f.conflict)});
  assert.equal(first.needs_recompare, true); assert.equal(f.state.appended, 0);
  assert.deepEqual(await read(f.db, 'outbox', f.operation.key), f.operation);
  const current = await f.current();
  assert.deepEqual(current.remote, f.remote); assert.deepEqual(current.review_remote, f.state.fresh);
  assert.equal(current.resolved_at, null);
  const second = await f.create().resolve(f.key, 'use-local', {expected: conflictDecisionToken(current)});
  assert.equal(second.resolution.mode, 'replace'); assert.equal((await f.active())[0].body.version, 3);
});

test('a second fresh remote change retains both earlier comparisons before a later deliberate choice', async () => {
  const f = await fixture(), firstFresh = noteRow(f.id, 3, '【自动测试】第一次新稿');
  f.state.fresh = firstFresh;
  await f.create().resolve(f.key, 'use-local', {expected: conflictDecisionToken(f.conflict)});
  const firstReview = await f.current();
  assert.deepEqual(firstReview.remote_history, [f.remote]);
  const secondFresh = noteRow(f.id, 4, '【自动测试】第二次新稿'); f.state.fresh = secondFresh;
  const secondReview = await f.create().resolve(f.key, 'use-local', {expected: conflictDecisionToken(firstReview)});
  assert.equal(secondReview.needs_recompare, true); assert.equal(f.state.appended, 0);
  assert.deepEqual(secondReview.remote_history, [f.remote, firstFresh]);
  assert.deepEqual(secondReview.remote, f.remote); assert.deepEqual(secondReview.review_remote, secondFresh);
  const result = await f.create().resolve(f.key, 'use-local', {expected: conflictDecisionToken(secondReview)});
  assert.equal(result.resolution.state, 'queued'); assert.equal(result.resolved_at, null);
  assert.equal((await f.active())[0].body.version, 4);
  assert.deepEqual((await f.current()).remote_history, [f.remote, firstFresh]);
});

test('a stale comparison token cannot apply an earlier choice after the visible remote was refreshed', async () => {
  const f = await fixture(), expected = conflictDecisionToken(f.conflict);
  f.state.fresh = noteRow(f.id, 3, '【自动测试】更新的线上正文');
  await f.create().resolve(f.key, 'keep-both', {expected});
  const before = await snapshot(f.db);
  await assert.rejects(f.create().resolve(f.key, 'keep-both', {expected}), changed);
  assert.deepEqual(await snapshot(f.db), before); assert.equal(f.state.appended, 0);
});

test('a failed append rolls back archived operations, conflict resolution, entity adoption and sequence together', async () => {
  const f = await fixture(), before = await snapshot(f.db);
  f.state.beforeAppend = async () => { throw new Error('synthetic durable quota failure'); };
  await assert.rejects(f.create().resolve(f.key, 'keep-both'), /quota/);
  assert.deepEqual(await snapshot(f.db), before);
});

test('an owner switch during the fresh read cancels the decision and retains every old-scope byte', async () => {
  const f = await fixture(), before = await snapshot(f.db);
  f.state.beforePrepare = async () => { f.state.scope = otherScope; };
  await assert.rejects(f.create().resolve(f.key, 'use-local'), error => error.code === 'OFFLINE_SCOPE_CHANGED');
  assert.deepEqual(await snapshot(f.db), before); assert.equal(f.state.appended, 0);
});

test('an explicit cancellation after the fresh read prevents all durable decision writes', async () => {
  const f = await fixture(), before = await snapshot(f.db); let cancelled = false;
  f.state.beforePrepare = async () => { cancelled = true; };
  const assertActive = () => { if (cancelled) throw new DOMException('cancelled', 'AbortError'); };
  await assert.rejects(f.create().resolve(f.key, 'use-local', {assertActive}), error => error.name === 'AbortError');
  assert.deepEqual(await snapshot(f.db), before); assert.equal(f.state.appended, 0);
});

test('a late owner switch after append rolls back the entire decision instead of publishing old-scope input', async () => {
  const f = await fixture(), before = await snapshot(f.db);
  f.state.beforeAppend = async () => { f.state.scope = otherScope; };
  await assert.rejects(f.create().resolve(f.key, 'keep-both'), error => error.code === 'OFFLINE_SCOPE_CHANGED');
  assert.deepEqual(await snapshot(f.db), before);
});

test('local content newer than the displayed conflict requires a fresh deliberate comparison before replacement', async () => {
  const f = await fixture(), latest = {...f.entity, local: {...f.local, text: '【自动测试】已经保留的新本机稿'}};
  await f.db.transaction(['entities'], 'readwrite', tx => tx.put('entities', latest));
  const first = await f.create().resolve(f.key, 'use-local', {expected: conflictDecisionToken(f.conflict)});
  assert.equal(first.needs_recompare, true); assert.equal(f.state.appended, 0); assert.equal(f.state.prepareCalls, 0);
  const current = await f.current();
  assert.deepEqual(current.local, f.local); assert.deepEqual(current.review_local, latest.local);
  await f.create().resolve(f.key, 'use-local', {expected: conflictDecisionToken(current)});
  assert.equal((await f.active())[0].body.text, latest.local.text);
});

test('new local content arriving during the fresh read cannot be overwritten by the earlier choice', async () => {
  const f = await fixture(); let retained;
  f.state.beforePrepare = async () => {
    retained = {...f.entity, local: {...f.local, text: '【自动测试】选择后继续输入的正文'}};
    await f.db.transaction(['entities'], 'readwrite', tx => tx.put('entities', retained));
  };
  await assert.rejects(f.create().resolve(f.key, 'use-local'), changed);
  assert.deepEqual(await read(f.db, 'entities', f.entity.key), retained);
  assert.deepEqual(await read(f.db, 'outbox', f.operation.key), f.operation);
  assert.equal((await f.current()).resolved_at, null); assert.equal(f.state.appended, 0);
});

test('a new FIFO tail arriving during the fresh read remains queued and invalidates the earlier branch decision', async () => {
  const f = await fixture(), tail = {...structuredClone(f.operation), id: randomUUID(), seq: 2, status: 'queued'};
  tail.key = entityKey(scope, 'operation:' + tail.id); tail.save_id = randomUUID();
  tail.body = {...tail.body, version: 2, save_id: tail.save_id, text: '【自动测试】新追加正文'};
  f.state.beforePrepare = async () => f.db.transaction(['outbox'], 'readwrite', tx => tx.put('outbox', tail));
  await assert.rejects(f.create().resolve(f.key, 'keep-both'), changed);
  assert.deepEqual(await read(f.db, 'outbox', tail.key), tail);
  assert.deepEqual(await read(f.db, 'outbox', f.operation.key), f.operation); assert.equal(f.state.appended, 0);
});

test('an input journal changed during the fresh read survives and prevents the earlier choice from consuming it', async () => {
  const f = await fixture(), draft = {key: entityKey(scope, 'draft:note_entry:' + f.id + ':tab'), scope,
    draft_kind: 'note_entry', draft_owner: 'tab', data: {id: f.id, draft: '【自动测试】尚未提交的输入', dirty: true}, saved_at: 999};
  f.state.beforePrepare = async () => f.db.transaction(['meta'], 'readwrite', tx => tx.put('meta', draft));
  await assert.rejects(f.create().resolve(f.key, 'use-server'), changed);
  assert.deepEqual(await read(f.db, 'meta', draft.key), draft);
  assert.deepEqual(await read(f.db, 'outbox', f.operation.key), f.operation); assert.equal(f.state.appended, 0);
});

test('an existing unresolved input journal remains untouched after a deliberate durable conflict choice', async () => {
  const f = await fixture(), draft = {key: entityKey(scope, 'draft:note_entry:' + f.id + ':tab'), scope,
    draft_kind: 'note_entry', draft_owner: 'tab', data: {id: f.id, draft: '【自动测试】另外保留的输入', dirty: true}, saved_at: 999};
  await f.db.transaction(['meta'], 'readwrite', tx => tx.put('meta', draft));
  await f.create().resolve(f.key, 'use-server');
  assert.deepEqual(await read(f.db, 'meta', draft.key), draft);
});

test('unsupported branches fail closed before remote preparation or queue mutation', async () => {
  const f = await fixture({canDispatch: () => false}), before = await snapshot(f.db);
  await assert.rejects(f.create().resolve(f.key, 'keep-both'), error => error.code === 'OFFLINE_UPGRADE_REQUIRED');
  assert.equal(f.state.prepareCalls, 0); assert.deepEqual(await snapshot(f.db), before);
});

test('a missing local body cannot produce an empty conflict copy or mark the original conflict resolved', async () => {
  const f = await fixture(); delete f.conflict.local.text; delete f.entity.local.text;
  await f.db.transaction(['entities', 'conflicts'], 'readwrite', async tx => {
    await tx.put('entities', f.entity); await tx.put('conflicts', f.conflict);
  });
  const before = await snapshot(f.db);
  await assert.rejects(f.create().resolve(f.key, 'keep-both'), /内容|正文|incomplete/i);
  assert.deepEqual(await snapshot(f.db), before); assert.equal(f.state.appended, 0);
});
