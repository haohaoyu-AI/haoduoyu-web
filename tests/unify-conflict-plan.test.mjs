import test from 'node:test';
import assert from 'node:assert/strict';
import {planConflictResolution} from '../web/offline/conflict-plan.mjs';
import {noteEntryInput} from '../src/note-entry-validation.mjs';
import {memoInput} from '../src/memos-validation.mjs';

const id = '11111111-1111-4111-8111-111111111111', group = '22222222-2222-4222-8222-222222222222';
const otherGroup = '33333333-3333-4333-8333-333333333333', oldSave = '44444444-4444-4444-8444-444444444444';
const prefixes = {todo: 'todo:', template: 'template:', note_entry: 'note-entry:', memo_note: 'memo-note:', memo_group: 'memo-group:'};
const defaults = {
  todo: {date: '2026-10-26', text: '本机待办', completed: false}, template: {text: '本机模板'},
  note_entry: {category: 'work', date: '2026-10-26', text: '本机碎碎念'},
  memo_group: {title: '本机分组', position: 3}, memo_note: {title: '本机笔记', position: 4, group_id: group, body: '完整本机正文'}
};
function setup(type, local = {}, remote = {}) {
  let sequence = 10;
  const conflict = {scope: 'owner-a', entity_id: prefixes[type] + id,
    operation: {scope: 'owner-a', entity_type: type, source_id: id, save_id: oldSave},
    local: {id, version: 2, ...defaults[type], ...local}};
  const latest = {id, version: 8, deleted: false, deleted_at: null, ...defaults[type], ...remote};
  const uuid = () => '00000000-0000-4000-8000-' + String(sequence++).padStart(12, '0');
  return {conflict, remote: latest, uuid, choice: 'use-local', groups: [{id: group, version: 5, deleted_at: null}]};
}
function fields(body, expected) { assert.deepEqual(Object.keys(body).sort(), [...expected].sort()); }
function noForgedServerEvidence(operation) {
  assert.equal(Object.hasOwn(operation.local, 'content_hash'), false);
  assert.equal(Object.hasOwn(operation.local, 'change_seq'), false);
  assert.equal(operation.local.can_edit, true);
}

test('server choice makes no mutation even when the local draft cannot be uploaded', () => {
  const input = setup('memo_note'); input.choice = 'use-server'; input.conflict.local.body = undefined;
  assert.deepEqual(planConflictResolution(input), {mode: 'server', target_id: id, operations: []});
});
test('todo live replacement uses the fresh remote version and only the supported completion API', () => {
  const result = planConflictResolution(setup('todo', {completed: true})), [op] = result.operations;
  assert.equal(result.mode, 'replace'); assert.equal(result.target_id, id);
  assert.equal(op.path, '/todos/' + id); assert.equal(op.method, 'PATCH');
  assert.deepEqual(op.body, {completed: true, version: 8}); assert.equal(op.local.version, 9);
  assert.equal(op.local.text, '本机待办'); assert.equal(op.scope, 'owner-a'); noForgedServerEvidence(op);
});
test('todo replacement cannot change immutable date/text and falls back to a fresh independent copy', () => {
  for (const remote of [{date: '2026-10-25'}, {text: '线上不同正文'}, {deleted_at: '2026-10-26T01:00:00Z'}]) {
    const result = planConflictResolution(setup('todo', {template_id: group}, remote)), [op] = result.operations;
    assert.equal(result.mode, 'copy'); assert.notEqual(result.target_id, id); assert.equal(op.method, 'POST');
    fields(op.body, ['id', 'date', 'text']); assert.equal(op.body.id, result.target_id);
    assert.equal(op.base, null); assert.equal(op.local.deleted, false); assert.equal(op.local.version, 1);
    assert.equal(Object.hasOwn(op.local, 'template_id'), false); noForgedServerEvidence(op);
  }
});
test('a completed todo copy queues create false then FIFO completion true at version one', () => {
  const result = planConflictResolution({...setup('todo', {completed: true}), choice: 'keep-both'});
  const [create, patch] = result.operations;
  assert.equal(create.entity_id, patch.entity_id); assert.equal(create.path, '/todos');
  assert.equal(create.local.completed, false); assert.equal(create.local.version, 1);
  assert.equal(patch.path, '/todos/' + result.target_id); assert.equal(patch.method, 'PATCH');
  assert.deepEqual(patch.body, {completed: true, version: 1}); assert.equal(patch.local.completed, true);
  assert.equal(patch.local.version, 2); assert.equal(patch.base, null);
});
test('live deletion intents use exact deletion API fields while preserving text locally', () => {
  for (const type of ['todo', 'template', 'note_entry']) {
    const result = planConflictResolution(setup(type, {deleted: true})), [op] = result.operations;
    assert.equal(result.mode, 'replace'); assert.equal(op.method, 'DELETE'); assert.equal(op.body.version, 8);
    fields(op.body, type === 'todo' ? ['date', 'version'] : type === 'template' ? ['version'] : ['version', 'save_id']);
    assert.equal(op.local.deleted, true); assert.equal(op.local.text, defaults[type].text);
    if (type === 'note_entry') noteEntryInput(op.body, 'DELETE');
  }
});
test('copying a local deletion preserves before-delete content under a fresh live identity', () => {
  for (const type of ['todo', 'template', 'note_entry']) {
    const result = planConflictResolution({...setup(type, {deleted: true}), choice: 'keep-both', remote: null});
    const [op] = result.operations;
    assert.equal(result.mode, 'copy'); assert.notEqual(result.target_id, id);
    assert.equal(op.local.text, defaults[type].text); assert.equal(op.local.deleted, false);
    assert.equal(op.local.deleted_at, null); assert.match(result.explanation, /删除前/);
  }
});
test('a local deletion whose remote is absent confirms the achieved goal without creating a live copy', () => {
  for (const type of ['todo', 'template', 'note_entry']) {
    const result = planConflictResolution({...setup(type, {deleted: true}), remote: null,
      uuid: () => { throw Error('an achieved deletion must not allocate another intent'); }});
    assert.deepEqual(result.operations, []); assert.equal(result.mode, 'server'); assert.equal(result.target_id, id);
    assert.match(result.explanation, /确认删除结果/);
  }
});
test('a local deletion with a verified remote tombstone preserves both deletion-before bodies without upload', () => {
  for (const type of ['todo', 'template', 'note_entry']) {
    const input = setup(type, {deleted: true}, {deleted: true, deleted_at: '2026-10-26T01:00:00Z'});
    const before = structuredClone({local: input.conflict.local, remote: input.remote});
    const result = planConflictResolution(input);
    assert.equal(result.mode, 'server'); assert.deepEqual(result.operations, []);
    assert.deepEqual({local: input.conflict.local, remote: input.remote}, before);
  }
});
test('memo deletion goals already achieved remotely can be accepted while live-remote intents remain blocked', () => {
  for (const type of ['memo_note', 'memo_group']) {
    const input = setup(type, {deleted_at: '2026-10-26T01:00:00Z'});
    for (const remote of [null, {...input.remote, deleted_at: '2026-10-26T01:00:00Z'}]) {
      const result = planConflictResolution({...input, remote});
      assert.equal(result.mode, 'server'); assert.deepEqual(result.operations, []); assert.equal(result.target_id, id);
    }
    assert.equal(planConflictResolution(input).mode, 'blocked');
  }
});
test('template replacement and copying have exact API bodies and never revive the old identity', () => {
  const replace = planConflictResolution(setup('template')), [op] = replace.operations;
  assert.equal(op.method, 'PATCH'); assert.deepEqual(op.body, {version: 8, text: '本机模板'});
  const copy = planConflictResolution({...setup('template'), remote: null}), [created] = copy.operations;
  assert.equal(created.method, 'POST'); assert.equal(created.path, '/todo-templates'); fields(created.body, ['id', 'text']);
  assert.notEqual(created.body.id, id); assert.equal(created.local.version, 1);
});
test('note replacement retains category/date and sends a fresh save ID without server evidence', () => {
  const result = planConflictResolution(setup('note_entry', {text: '第一行\r\n第二行', content_hash: 'old', change_seq: 99}));
  const [op] = result.operations; assert.equal(result.mode, 'replace'); assert.equal(op.method, 'PUT');
  fields(op.body, ['category', 'date', 'text', 'version', 'save_id']); noteEntryInput(op.body, 'PUT');
  assert.equal(op.body.text, '第一行\n第二行'); assert.equal(op.body.version, 8); assert.notEqual(op.body.save_id, oldSave);
  noForgedServerEvidence(op);
});
test('notes with another immutable category/date are copied with version zero and distinct new IDs', () => {
  for (const remote of [{category: 'life'}, {date: '2026-10-25'}]) {
    const result = planConflictResolution(setup('note_entry', {}, remote)), [op] = result.operations;
    assert.equal(result.mode, 'copy'); assert.equal(op.body.version, 0); assert.equal(op.path, '/note-entries/' + result.target_id);
    assert.notEqual(op.body.save_id, oldSave); assert.notEqual(op.body.save_id, result.target_id); noteEntryInput(op.body, 'PUT');
  }
});
test('memo replacement uses complete local body and exact server fields with fresh remote CAS', () => {
  for (const type of ['memo_note', 'memo_group']) {
    const result = planConflictResolution(setup(type)), [op] = result.operations, kind = type === 'memo_note' ? 'notes' : 'groups';
    assert.equal(result.mode, 'replace'); assert.equal(op.method, 'PUT'); assert.equal(op.path, '/memos/' + kind + '/' + id);
    fields(op.body, ['title', 'position', 'version', 'save_id', ...(type === 'memo_note' ? ['group_id', 'body'] : [])]);
    memoInput(structuredClone(op.body), kind, 'PUT', false); assert.equal(op.body.version, 8); noForgedServerEvidence(op);
    if (type === 'memo_note') {
      assert.equal(op.body.body, '完整本机正文'); assert.equal(op.protocol, 2);
      assert.deepEqual(op.depends_on, ['memo-group:' + group]);
    }
  }
});
test('memo note cannot move to a different group under its old ID and copies into its verified local parent', () => {
  const input = setup('memo_note', {}, {group_id: otherGroup});
  const result = planConflictResolution(input), [op] = result.operations;
  assert.equal(result.mode, 'copy'); assert.notEqual(result.target_id, id); assert.equal(op.body.group_id, group);
  assert.equal(op.body.version, 0); assert.equal(op.base, null); assert.equal(op.local.version, 1);
  assert.equal(op.protocol, 2); assert.deepEqual(op.depends_on, ['memo-group:' + group]);
  memoInput(structuredClone(op.body), 'notes', 'PUT', false);
});
test('unavailable memo parent copies into the first active flat group by position then ID', () => {
  const earlier = '00000000-0000-4000-8000-000000000002';
  const input = setup('memo_note');
  input.groups = [{id: group, version: 5, position: 0, deleted_at: '2026-10-26T01:00:00Z'},
    {id: otherGroup, version: 2, position: 1, deleted_at: null}, {id: earlier, version: 1, position: 1, deleted_at: null}];
  const result = planConflictResolution(input), [op] = result.operations;
  assert.equal(result.mode, 'copy'); assert.notEqual(result.target_id, id); assert.equal(result.operations.length, 1);
  assert.equal(op.body.group_id, earlier); assert.equal(op.body.version, 0); assert.equal(op.body.body, '完整本机正文');
  assert.equal(op.base, null); assert.equal(op.protocol, 2); assert.deepEqual(op.depends_on, ['memo-group:' + earlier]);
  assert.equal(op.path, '/memos/notes/' + result.target_id); assert.match(result.explanation, /另存为新笔记/);
  memoInput(structuredClone(op.body), 'notes', 'PUT', false);
});
test('missing, deleted or unverified memo parents create a fresh group before its dependent note copy', () => {
  for (const groups of [[], [{id: group, version: 5, deleted_at: '2026-10-26T01:00:00Z'}], [{id: group, version: 5}]]) {
    const input = {...setup('memo_note'), groups}, result = planConflictResolution(input), [parent, note] = result.operations;
    assert.equal(result.mode, 'copy'); assert.equal(result.operations.length, 2);
    assert.equal(parent.entity_type, 'memo_group'); assert.notEqual(parent.entity_id, group); assert.notEqual(parent.entity_id, id);
    assert.equal(parent.body.title, '本机冲突副本'); assert.equal(parent.body.position, 0); assert.equal(parent.body.version, 0);
    assert.equal(parent.path, '/memos/groups/' + parent.entity_id); assert.equal(Object.hasOwn(parent, 'depends_on'), false);
    assert.equal(note.entity_type, 'memo_note'); assert.equal(note.body.group_id, parent.entity_id);
    assert.equal(note.entity_id, result.target_id); assert.notEqual(note.entity_id, id); assert.equal(note.body.version, 0);
    assert.equal(note.protocol, 2); assert.deepEqual(note.depends_on, ['memo-group:' + parent.entity_id]);
    assert.equal(parent.base, null); assert.equal(note.base, null); assert.match(result.explanation, /另存为新笔记/);
    assert.equal(new Set([parent.entity_id, parent.body.save_id, note.entity_id, note.body.save_id]).size, 4);
    memoInput(structuredClone(parent.body), 'groups', 'PUT', false); memoInput(structuredClone(note.body), 'notes', 'PUT', false);
  }
});
test('memo group copies contain group metadata only and never duplicate or reparent its children', () => {
  const result = planConflictResolution({...setup('memo_group'), choice: 'keep-both'}), [op] = result.operations;
  assert.equal(result.mode, 'copy'); assert.equal(result.operations.length, 1); assert.equal(op.entity_type, 'memo_group');
  fields(op.body, ['title', 'position', 'version', 'save_id']); assert.equal(op.body.version, 0);
  assert.equal(Object.hasOwn(op.local, 'body'), false); assert.equal(Object.hasOwn(op, 'depends_on'), false);
});
test('memo local deletion remains blocked because its structural API requires online confirmation', () => {
  for (const type of ['memo_note', 'memo_group']) {
    const result = planConflictResolution(setup(type, {deleted_at: '2026-10-26T01:00:00Z'}));
    assert.equal(result.mode, 'blocked'); assert.deepEqual(result.operations, []); assert.match(result.explanation, /删除/);
  }
});
test('planner preserves inputs and clones the actual remote baseline', () => {
  const input = setup('note_entry'), before = structuredClone({conflict: input.conflict, remote: input.remote});
  const result = planConflictResolution(input); result.operations[0].base.text = '修改计划副本';
  assert.deepEqual({conflict: input.conflict, remote: input.remote}, before);
});
test('incomplete body, invalid dates, excessive content and unsafe versions never produce operations', () => {
  const invalid = [setup('memo_note', {body: undefined}), setup('note_entry', {text: '鱼'.repeat(21846)}),
    setup('todo', {date: '2026-02-30'}), setup('todo', {completed: 1}), setup('template', {text: ''}),
    setup('memo_group', {title: 'x'.repeat(121)}), setup('note_entry', {}, {version: Number.MAX_SAFE_INTEGER})];
  for (const input of invalid) assert.throws(() => planConflictResolution(input), TypeError);
});
test('generated copy and save IDs must be valid, new and mutually distinct', () => {
  assert.throws(() => planConflictResolution({...setup('todo'), choice: 'keep-both', uuid: () => id}), TypeError);
  assert.throws(() => planConflictResolution({...setup('note_entry'), uuid: () => oldSave}), TypeError);
  const duplicate = '55555555-5555-4555-8555-555555555555';
  assert.throws(() => planConflictResolution({...setup('note_entry'), choice: 'keep-both', uuid: () => duplicate}), TypeError);
  assert.throws(() => planConflictResolution({...setup('todo'), choice: 'keep-both',
    uuid: () => '00000000-0000-0000-0000-000000000001'}), TypeError);
});
test('conflicting source identity or owner cannot be used to plan a different entity mutation', () => {
  for (const property of [{scope: 'other-owner'}, {source_id: group}, {entity_id: 'note-entry:' + group}]) {
    const input = setup('note_entry'); Object.assign(input.conflict.operation, property);
    assert.throws(() => planConflictResolution(input), TypeError);
  }
});
