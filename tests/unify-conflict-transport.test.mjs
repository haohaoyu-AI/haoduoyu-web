import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createConflictPreparation} from '../web/offline/conflict-transport.mjs';

const scope = 'a'.repeat(64), date = '2026-10-26', stamp = '2026-10-26T01:00:00.000Z';
const prefixes = {todo: 'todo:', template: 'template:', note_entry: 'note-entry:',
  memo_group: 'memo-group:', memo_note: 'memo-note:'};
const invalid = error => error.code === 'OFFLINE_RESPONSE_INVALID';
const metadata = (id = randomUUID()) => ({id, title: '【自动测试】分组或笔记', position: 0,
  version: 2, change_seq: 5, created_at: stamp, updated_at: stamp, deleted_at: null});
const note = id => ({id, category: 'life', date, text: '【自动测试】完整线上正文', version: 2, change_seq: 5,
  created_at: stamp, updated_at: stamp, deleted: false, deleted_at: null, can_edit: true, content_hash: 'c'.repeat(64)});
function setup(type = 'note_entry') {
  const id = randomUUID(), group = metadata(), entity_id = prefixes[type] + id;
  const local = {id, category: 'life', date, text: '【自动测试】本机正文', group_id: group.id};
  const conflict = {scope, entity_id, local, operation: {scope, entity_id, entity_type: type, source_id: id}};
  let remote = type === 'note_entry' ? note(id) : type === 'todo' ?
    {id, date, text: '【自动测试】待办', completed: false, version: 2, deleted_at: null} :
    type === 'template' ? {id, text: '【自动测试】常用项', version: 2} : {...metadata(id), can_edit: true};
  if (type === 'memo_note') remote = {...remote, group_id: group.id, body: '【自动测试】完整备忘录正文'};
  const index = {can_edit: true, groups: type === 'memo_group' ? [{...remote, active_note_count: 0}] : [group],
    notes: type === 'memo_note' ? [{...remote}] : []};
  if (index.notes[0]) { delete index.notes[0].body; delete index.notes[0].can_edit; }
  const state = {remote, index, collection: {category: 'life', date, can_edit: true, entries: []}, onRead: null, onNetwork: null};
  const calls = [];
  const prepare = createConflictPreparation({
    readRemote: async operation => {
      calls.push({kind: 'remote', operation: structuredClone(operation)});
      if (state.onRead) await state.onRead();
      return structuredClone(state.remote);
    },
    network: async (owner, path) => {
      calls.push({kind: 'network', scope: owner, path});
      if (state.onNetwork) await state.onNetwork();
      return structuredClone(path === '/memos' ? state.index : state.collection);
    }
  });
  return {id, group, conflict, state, calls, prepare};
}

test('a complete editable note is returned as fresh server evidence without mutating its hash-associated body', async () => {
  const f = setup(), before = structuredClone(f.state.remote), result = await f.prepare(f.conflict);
  assert.deepEqual(result, {remote: before, groups: []}); assert.notEqual(result.remote, f.state.remote);
  assert.deepEqual(f.state.remote, before); assert.deepEqual(f.calls.map(call => call.kind), ['remote']);
});

test('a malformed or noneditable fresh note cannot be accepted even for a server choice', async t => {
  const changes = [row => { delete row.content_hash; }, row => { row.content_hash = 'fake'; },
    row => { delete row.change_seq; }, row => { row.version = 0; }, row => { row.can_edit = false; },
    row => { row.id = randomUUID(); }, row => { row.date = '2026-02-30'; }, row => { delete row.text; },
    row => { row.text = '\ud800'; }, row => { row.text = '未规范\r\n正文'; }, row => { row.entity_type = 'life_note'; }];
  for (let index = 0; index < changes.length; index++) await t.test(String(index + 1), async () => {
    const f = setup(); changes[index](f.state.remote);
    await assert.rejects(f.prepare(f.conflict), invalid); assert.equal(f.calls.length, 1);
  });
});

test('note absence is accepted only after a complete editable collection confirms the target is absent', async () => {
  const f = setup(); f.state.remote = null;
  const result = await f.prepare(f.conflict);
  assert.deepEqual(result, {remote: null, groups: []});
  assert.deepEqual(f.calls[1], {kind: 'network', scope, path: '/note-entries?category=life&date=' + date});
});

test('an incomplete collection or a contradictory existing note cannot impersonate confirmed absence', async t => {
  const values = [undefined, {}, {category: 'life', date, entries: []}, {category: 'life', date, can_edit: false, entries: []},
    {category: 'work', date, can_edit: true, entries: []}, {category: 'life', date: '2026-10-25', can_edit: true, entries: []}];
  for (let index = 0; index < values.length; index++) await t.test(String(index + 1), async () => {
    const f = setup(); f.state.remote = null; f.state.collection = values[index];
    await assert.rejects(f.prepare(f.conflict), invalid);
  });
  const f = setup(); f.state.remote = null; f.state.collection.entries = [note(f.id)];
  await assert.rejects(f.prepare(f.conflict), invalid);
  const repeated = setup(), different = note(randomUUID()); repeated.state.remote = null;
  repeated.state.collection.entries = [different, different];
  await assert.rejects(repeated.prepare(repeated.conflict), invalid);
});

test('a null note reread uses the reviewed local category and date rather than a changed route or missing delete body', async () => {
  const f = setup(); f.state.remote = null;
  f.conflict.review_local = {...f.conflict.local, category: 'work', date: '2026-10-25'};
  f.state.collection = {category: 'work', date: '2026-10-25', can_edit: true, entries: []};
  await f.prepare(f.conflict);
  assert.equal(f.calls[1].path, '/note-entries?category=work&date=2026-10-25');
});

test('a fresh todo preserves its validated identity, text, date and boolean completion', async () => {
  const f = setup('todo'), result = await f.prepare(f.conflict);
  assert.deepEqual(result, {remote: f.state.remote, groups: []});
  delete f.state.remote.id;
  Object.assign(f.state.remote, {source_id: f.id, entity_id: 'todo:' + f.id});
  assert.deepEqual((await f.prepare(f.conflict)).remote, f.state.remote);
});

test('a verified todo tombstone may omit content while retaining a real identity, date and version', async () => {
  const f = setup('todo'); f.state.remote = {id: f.id, date, version: 3, deleted_at: stamp};
  assert.deepEqual((await f.prepare(f.conflict)).remote, f.state.remote);
  f.state.remote = {id: f.id, date, version: 3, deleted: true};
  assert.deepEqual((await f.prepare(f.conflict)).remote, f.state.remote);
});

test('malformed live todos, invalid tombstones and mismatched source identities fail closed', async t => {
  const changes = [row => { row.id = randomUUID(); }, row => { row.source_id = randomUUID(); },
    row => { row.entity_id = 'todo:' + randomUUID(); }, row => { row.version = 1.5; },
    row => { row.completed = 1; }, row => { row.text = ''; }, row => { row.text = 'a'.repeat(501); },
    row => { row.date = '2026-02-30'; }, row => { row.deleted_at = 'not-a-time'; },
    row => { row.deleted = false; row.deleted_at = stamp; }];
  for (let index = 0; index < changes.length; index++) await t.test(String(index + 1), async () => {
    const f = setup('todo'); changes[index](f.state.remote); await assert.rejects(f.prepare(f.conflict), invalid);
  });
});

test('template evidence requires a matching UUID, positive version and a valid live text', async () => {
  const f = setup('template'); assert.deepEqual((await f.prepare(f.conflict)).remote, f.state.remote);
  f.state.remote.text = ''; await assert.rejects(f.prepare(f.conflict), invalid);
  f.state.remote = {id: f.id, version: 3, deleted_at: stamp};
  assert.deepEqual((await f.prepare(f.conflict)).remote, f.state.remote);
  f.state.remote = null; assert.deepEqual(await f.prepare(f.conflict), {remote: null, groups: []});
});

test('memo group preparation uses one complete editable index and does not issue a second group detail request', async () => {
  const f = setup('memo_group'), result = await f.prepare(f.conflict);
  assert.deepEqual(result.remote, {...f.state.index.groups[0], can_edit: true});
  assert.deepEqual(result.groups, f.state.index.groups); assert.deepEqual(f.calls, [{kind: 'network', scope, path: '/memos'}]);
});

test('complete memo metadata includes deleted groups and notes without dropping them from the returned parent evidence', async () => {
  const f = setup('memo_note'), deleted = {...metadata(), deleted_at: stamp};
  f.state.index.groups.push(deleted);
  f.state.index.notes.push({...metadata(), group_id: deleted.id, deleted_at: stamp});
  const result = await f.prepare(f.conflict);
  assert.deepEqual(result.remote, f.state.remote); assert.equal(result.groups.length, 2);
  assert.equal(result.groups[1].deleted_at, stamp); assert.equal(f.calls.length, 2);
});

test('memo index bounds, permissions, metadata and parent identity must all be complete before detail reads', async t => {
  const changes = [value => { value.can_edit = false; }, value => { delete value.notes; },
    value => { value.groups = Array.from({length: 33}, () => metadata()); },
    value => { value.notes = Array.from({length: 201}, () => ({...metadata(), group_id: value.groups[0].id})); },
    value => { value.groups[0].position = -1; }, value => { delete value.groups[0].change_seq; },
    value => { delete value.groups[0].deleted_at; }, value => { value.groups[0].title = '多行\n标题'; },
    value => { value.groups.push(value.groups[0]); }, value => { value.notes[0].group_id = randomUUID(); },
    value => { value.notes.push(value.notes[0]); }, value => { value.groups[0].active_note_count = 201; }];
  for (let index = 0; index < changes.length; index++) await t.test(String(index + 1), async () => {
    const f = setup('memo_note'); changes[index](f.state.index);
    await assert.rejects(f.prepare(f.conflict), invalid); assert.equal(f.calls.length, 1);
  });
});

test('memo note preparation requires the complete normalized body and matching current index metadata', async t => {
  const changes = [row => { delete row.body; }, row => { row.body = 'a'.repeat(65537); },
    row => { row.body = '\ud800'; }, row => { row.body = '正文\r\n尚未规范'; }, row => { row.can_edit = false; },
    row => { row.id = randomUUID(); }, row => { row.group_id = randomUUID(); },
    row => { row.version++; }, row => { row.updated_at = 'not-a-time'; }, row => { row.deleted_at = stamp; }];
  for (let index = 0; index < changes.length; index++) await t.test(String(index + 1), async () => {
    const f = setup('memo_note'); changes[index](f.state.remote); await assert.rejects(f.prepare(f.conflict), invalid);
  });
});

test('a metadata-only note cannot disappear through a null detail fallback', async () => {
  const f = setup('memo_note'); f.state.remote = null;
  await assert.rejects(f.prepare(f.conflict), invalid);
  f.state.index.notes = [];
  assert.deepEqual(await f.prepare(f.conflict), {remote: null, groups: f.state.index.groups});
});

test('a memo detail not declared by the complete index is a changed read, never silently adopted', async () => {
  const f = setup('memo_note'); f.state.index.notes = [];
  await assert.rejects(f.prepare(f.conflict), invalid);
});

test('deleted memo note detail still requires its original body and exact complete metadata', async () => {
  const f = setup('memo_note'); f.state.remote.deleted_at = stamp; f.state.index.notes[0].deleted_at = stamp;
  const result = await f.prepare(f.conflict);
  assert.equal(result.remote.body, f.state.remote.body); assert.equal(result.remote.deleted_at, stamp);
  delete f.state.remote.body; await assert.rejects(f.prepare(f.conflict), invalid);
});

test('unknown conflict types or mismatched operation identities reject before any network request', async t => {
  const changes = [value => { value.operation.entity_type = 'daily_note'; },
    value => { value.operation.source_id = randomUUID(); }, value => { value.operation.scope = 'b'.repeat(64); },
    value => { value.entity_id = 'note-entry:' + randomUUID(); }];
  for (let index = 0; index < changes.length; index++) await t.test(String(index + 1), async () => {
    const f = setup(); changes[index](f.conflict); await assert.rejects(f.prepare(f.conflict), invalid);
    assert.deepEqual(f.calls, []);
  });
});

test('an abort or identity guard raised after a remote read prevents any absence request or return value', async () => {
  const f = setup(); f.state.remote = null; let cancelled = false;
  f.state.onRead = async () => { cancelled = true; };
  const assertActive = () => { if (cancelled) throw new DOMException('cancelled', 'AbortError'); };
  await assert.rejects(f.prepare(f.conflict, {assertActive}), error => error.name === 'AbortError');
  assert.equal(f.calls.length, 1);
});

test('an abort after a memo index read prevents the dependent detail request', async () => {
  const f = setup('memo_note'); let cancelled = false;
  f.state.onNetwork = async () => { cancelled = true; };
  const assertActive = () => { if (cancelled) throw new DOMException('cancelled', 'AbortError'); };
  await assert.rejects(f.prepare(f.conflict, {assertActive}), error => error.name === 'AbortError');
  assert.equal(f.calls.length, 1);
});

test('network authentication failures propagate and cannot be turned into an empty verified collection', async () => {
  const f = setup(); f.state.remote = null;
  f.state.onNetwork = async () => { throw Object.assign(new Error('Synthetic auth rejected'), {status: 403}); };
  await assert.rejects(f.prepare(f.conflict), error => error.status === 403);
});
