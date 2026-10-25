import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemosStore} from '../web/core/memos-state.mjs';

const owner = '10000000-0000-4000-8000-000000000001';
const groupId = '20000000-0000-4000-8000-000000000001';
const noteId = '30000000-0000-4000-8000-000000000001';
const initial = () => ({id: noteId, group_id: groupId, title: '合成笔记', body: '合成正文', position: 1,
  version: 1, change_seq: 1, deleted_at: null, can_edit: true, updated_at: '2026-10-25T00:00:00Z'});
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return {promise, resolve, reject}; };
const storage = () => { const values = new Map(); return {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), values}; };
function setup(t, {saved = storage(), canEdit = true, ownerId = owner, online = () => true,
  draftScope = 'test-tab', restoreDraftScope} = {}) {
  let note = initial(), sequence = 10, send, receipt = {found: false};
  const calls = [];
  const group = {id: groupId, title: '合成分组', position: 1, version: 1, active_note_count: 1, deleted_at: null};
  const request = async (path, options = {}) => {
    calls.push({path, ...structuredClone(options)});
    if (options.method) {
      if (send) return send(path, options);
      note = {...note, ...options.body, id: path.split('/')[3], version: options.body.version + 1};
      delete note.save_id; return structuredClone(note);
    }
    if (path === '/memos') return {groups: [structuredClone(group)], notes: [{...note, body: undefined}], can_edit: canEdit};
    if (path.startsWith('/memos/operations/')) return structuredClone(receipt);
    return structuredClone(note);
  };
  const store = createMemosStore({request, storage: saved, ownerId, online, draftScope, restoreDraftScope, delay: 60000,
    uuid: () => '90000000-0000-4000-8000-' + String(++sequence).padStart(12, '0')});
  t.after(() => store.dispose());
  return {store, calls, saved, group, setNote: value => { note = value; }, getNote: () => note,
    setSend: value => { send = value; }, setReceipt: value => { receipt = value; }};
}

test('memo editing preserves newer keystrokes while an earlier save is in flight and normalizes once', async t => {
  const f = setup(t); await f.store.load();
  f.store.edit('body', '已发送\r\n正文'); f.store.edit('title', ' 标题 ');
  const gate = deferred(); f.setSend(() => gate.promise);
  const saving = f.store.saveNote();
  const sent = f.calls.at(-1).body;
  assert.equal(sent.title, '标题'); assert.equal(sent.body, '已发送\n正文');
  f.store.edit('body', '保存期间继续输入');
  gate.resolve({...initial(), ...sent, version: 2}); await saving;
  const item = f.store.drafts.get(noteId);
  assert.equal(item.body, '保存期间继续输入'); assert.equal(item.version, 2); assert.equal(item.dirty, true);
  assert.equal(item.phase, 'dirty'); assert.equal(item.pending, null);
  f.setSend(null); await f.store.saveNote();
  assert.equal(item.dirty, false); assert.equal(item.title, '标题'); assert.equal(item.version, 3);
});

test('memo unknown writes persist before sending, check receipts, and require explicit exact-key retry', async t => {
  const f = setup(t); await f.store.load(); f.store.edit('body', '不可丢失的合成草稿');
  f.setSend((path, options) => {
    const persisted = JSON.parse([...f.saved.values.values()][0]);
    assert.equal(persisted.drafts[0].pending.body.save_id, options.body.save_id);
    throw new Error('Synthetic response lost');
  });
  await f.store.saveNote(); const item = f.store.drafts.get(noteId), first = structuredClone(item.pending);
  assert.equal(item.phase, 'unknown'); assert.equal(f.calls.filter(call => call.method).length, 1);
  await f.store.checkNote();
  assert.equal(item.pending.retryReady, true); assert.equal(f.calls.filter(call => call.method).length, 1);
  f.setSend(null); await f.store.retryPending();
  assert.deepEqual(f.calls.filter(call => call.method).at(-1).body, first.body);
  assert.equal(item.phase, 'saved'); assert.equal(item.dirty, false);
});

test('memo receipt resolves committed unknown save and preserves edits made after submission', async t => {
  const f = setup(t); await f.store.load(); f.store.edit('body', '第一稿');
  f.setSend((path, options) => { f.setNote({...initial(), ...options.body, version: 2}); throw new Error('lost'); });
  await f.store.saveNote(); f.store.edit('body', '尚未发送的第二稿');
  f.setReceipt({found: true, kind: 'notes', id: noteId, version: 2});
  await f.store.checkNote();
  const item = f.store.drafts.get(noteId);
  assert.equal(item.body, '尚未发送的第二稿'); assert.equal(item.version, 2); assert.equal(item.phase, 'dirty');
  assert.equal(item.pending, null); assert.equal(f.calls.filter(call => call.method).length, 1);
});

test('memo CAS conflict preserves local text and only explicit draft adoption writes the fetched version', async t => {
  const f = setup(t); await f.store.load(); f.store.edit('body', '本地稿');
  f.setSend(() => { f.setNote({...initial(), body: '远端稿', version: 5}); throw Object.assign(new Error('conflict'), {status: 409}); });
  await f.store.saveNote();
  const item = f.store.drafts.get(noteId);
  assert.equal(item.phase, 'conflict'); assert.equal(item.body, '本地稿'); assert.equal(item.remote.body, '远端稿');
  await f.store.saveNote(); assert.equal(f.calls.filter(call => call.method).length, 1);
  f.setSend(null); await f.store.useDraft();
  assert.equal(f.calls.filter(call => call.method).at(-1).body.version, 5); assert.equal(item.version, 6);
});

test('memo offline drafts survive reload for their owner and never hydrate in public or another owner session', async t => {
  const saved = storage(), f = setup(t, {saved, online: () => false});
  await f.store.load(); f.store.edit('body', '离线合成草稿'); await f.store.saveNote();
  assert.equal(f.store.drafts.get(noteId).phase, 'offline'); assert.equal(f.calls.filter(call => call.method).length, 0);
  f.store.dispose();
  const restored = setup(t, {saved}); await restored.store.load();
  assert.equal(restored.store.drafts.get(noteId).body, '离线合成草稿');
  assert.equal(restored.calls.filter(call => call.method).length, 0);
  const publicView = setup(t, {saved, canEdit: false, ownerId: 'public-business'}); await publicView.store.load();
  assert.equal(publicView.store.drafts.get(noteId).body, '合成正文'); assert.equal(publicView.store.state.canEdit, false);
  publicView.store.edit('body', 'forbidden'); await publicView.store.saveNote();
  assert.equal(publicView.calls.filter(call => call.method).length, 0);
  const other = setup(t, {saved, ownerId: '10000000-0000-4000-8000-000000000002'}); await other.store.load();
  assert.equal(other.store.drafts.get(noteId).body, '合成正文');
});

test('memo hydrated unknown saves must recheck a receipt even if a prior tab was checking or allowed retry', async t => {
  const saved = storage(), f = setup(t, {saved}); await f.store.load(); f.store.edit('body', '待核对');
  f.setSend(() => { throw new Error('lost'); }); await f.store.saveNote();
  const item = f.store.drafts.get(noteId); item.pending.checking = true; item.pending.retryReady = true;
  f.store.dispose();
  const restored = setup(t, {saved}); await restored.store.load();
  const value = restored.store.drafts.get(noteId);
  assert.equal(value.phase, 'unknown'); assert.equal(value.pending.checking, false); assert.equal(value.pending.retryReady, false);
  await restored.store.retryPending(); assert.equal(restored.calls.filter(call => call.method).length, 0);
  await restored.store.checkNote(); assert.equal(value.pending.retryReady, true);
});

test('memo group deletion blocks dirty drafts and uses version/title/count; unknown operations retain exact identity', async t => {
  const f = setup(t); await f.store.load(); f.store.edit('body', '未保存');
  await f.store.removeGroup(groupId); assert.equal(f.calls.filter(call => call.method).length, 0);
  await f.store.saveNote();
  f.setSend(() => { throw new Error('lost'); }); await f.store.removeGroup(groupId);
  const operation = f.store.state.operation;
  assert.equal(operation.phase, 'unknown');
  assert.equal(operation.pending.body.confirm_title, '合成分组'); assert.equal(operation.pending.body.confirm_note_count, 1);
  const original = structuredClone(operation.pending.body);
  await f.store.checkOperation(); assert.equal(operation.retryReady, true);
  assert.equal(f.calls.filter(call => call.method === 'DELETE').length, 1);
  await f.store.retryOperation();
  assert.deepEqual(f.calls.filter(call => call.method === 'DELETE').at(-1).body, original);
});

test('memo source changes after receipt produce a conflict rather than adopting or overwriting later content', async t => {
  const f = setup(t); await f.store.load(); f.store.edit('body', '自己的稿');
  f.setSend(() => { throw new Error('lost'); }); await f.store.saveNote();
  f.setReceipt({found: true, kind: 'notes', id: noteId, version: 2});
  f.setNote({...initial(), version: 3, body: '随后编辑的稿'});
  await f.store.checkNote(); const item = f.store.drafts.get(noteId);
  assert.equal(item.phase, 'conflict'); assert.equal(item.body, '自己的稿'); assert.equal(item.remote.version, 3);
  assert.equal(f.calls.filter(call => call.method).length, 1);
});

test('memo separate tabs never replace another tab offline draft snapshot', async t => {
  const saved = storage(), first = setup(t, {saved, draftScope: 'tab-a', online: () => false});
  const second = setup(t, {saved, draftScope: 'tab-b'});
  await first.store.load(); await second.store.load();
  first.store.edit('body', '仅 A 的离线稿'); await first.store.saveNote();
  await second.store.selectNote(noteId); await second.store.load();
  first.store.dispose();
  const reopened = setup(t, {saved, draftScope: 'tab-a'}); await reopened.store.load();
  assert.equal(reopened.store.drafts.get(noteId).body, '仅 A 的离线稿');
  assert.equal(second.store.drafts.get(noteId).body, '合成正文');
});

test('memo delayed note/group deletion prevents edits arriving during structural mutation', async t => {
  for (const kind of ['note', 'group']) {
    const f = setup(t); await f.store.load(); const gate = deferred(); f.setSend(() => gate.promise);
    const deleting = kind === 'note' ? f.store.removeNote(noteId) : f.store.removeGroup(groupId);
    f.store.edit('body', '删除途中不得接受的新稿');
    assert.equal(f.store.drafts.get(noteId).body, '合成正文');
    assert.equal(f.store.drafts.get(noteId).dirty, false);
    gate.reject(new Error('lost')); await deleting;
    f.store.edit('body', '结果不明时仍不可编辑');
    assert.equal(f.store.drafts.get(noteId).body, '合成正文');
  }
});

test('memo owner can select deleted groups in trash and keep that selection during refresh', async t => {
  const f = setup(t); f.group.deleted_at = '2026-10-25T01:00:00Z';
  await f.store.load();
  assert.equal(f.store.state.groupId, '');
  f.store.state.trash = true; await f.store.selectGroup(groupId);
  assert.equal(f.store.state.groupId, groupId); assert.equal(f.store.state.trash, true);
  await f.store.load();
  assert.equal(f.store.state.groupId, groupId); assert.equal(f.store.state.trash, true);
});

test('memo initial loading placeholder rejects edits until detail ownership fields arrive', async t => {
  const gate = deferred();
  const store = createMemosStore({ownerId: owner, draftScope: 'placeholder-test', storage: storage(),
    request: path => path === '/memos' ? Promise.resolve({groups: [{id: groupId, deleted_at: null}],
      notes: [{id: noteId, group_id: groupId, deleted_at: null}], can_edit: true}) : gate.promise});
  t.after(() => store.dispose());
  const loading = store.load(); await Promise.resolve(); await Promise.resolve();
  store.edit('body', 'too early');
  assert.equal(store.drafts.get(noteId).dirty, false);
  gate.resolve(initial()); await loading;
  assert.equal(store.drafts.get(noteId).body, '合成正文'); assert.equal(store.drafts.get(noteId).phase, 'saved');
});

test('memo duplicated-tab recovery reads prior scope without overwriting original live drafts', async t => {
  const saved = storage(), original = setup(t, {saved, draftScope: 'original', online: () => false});
  await original.store.load(); original.store.edit('body', '复制时原稿'); await original.store.saveNote();
  const duplicate = setup(t, {saved, draftScope: 'duplicate', restoreDraftScope: 'original'}); await duplicate.store.load();
  assert.equal(duplicate.store.drafts.get(noteId).body, '复制时原稿');
  original.store.edit('body', '原页签新稿'); await original.store.saveNote();
  duplicate.store.edit('body', '副本的新稿');
  original.store.dispose();
  const reloaded = setup(t, {saved, draftScope: 'original-reload', restoreDraftScope: 'original'});
  await reloaded.store.load(); assert.equal(reloaded.store.drafts.get(noteId).body, '原页签新稿');
  assert.equal(duplicate.store.drafts.get(noteId).body, '副本的新稿');
});

test('memo deletion rejects a confirmation whose title/version/count changed while displayed', async t => {
  const f = setup(t); await f.store.load();
  const snapshot = {...f.store.state.groups[0]};
  f.store.state.groups[0].active_note_count++;
  await f.store.removeGroup(groupId, snapshot);
  assert.match(f.store.state.error, /重新核对/); assert.equal(f.calls.filter(call => call.method).length, 0);
});

test('memo manually recovered closed-tab draft does not overwrite a different current draft or autosave', async t => {
  const f = setup(t); await f.store.load();
  const raw = {...initial(), body: '已关闭页签的稿', dirty: true, phase: 'offline', server: initial()};
  assert.equal(await f.store.recoverDraft(raw), true);
  assert.equal(f.store.drafts.get(noteId).body, raw.body);
  assert.equal(f.calls.filter(call => call.method).length, 0);
  assert.equal(await f.store.recoverDraft({...raw, body: '另一份不可覆盖的稿'}), false);
  assert.equal(f.store.drafts.get(noteId).body, raw.body);
  assert.match(f.store.state.error, /未覆盖/);
  assert.equal(await f.store.recoverDraft({...raw, pending: {path: '/arbitrary'}}), false);
});

test('memo recovered structural operation requires receipt check before exact retry', async t => {
  const f = setup(t); await f.store.load();
  const pending = {kind: 'groups', id: groupId, method: 'DELETE', path: '/memos/groups/' + groupId,
    body: {version: 1, confirm_title: '合成分组', confirm_note_count: 1, save_id: '90000000-0000-4000-8000-000000000099'}};
  assert.equal(f.store.recoverOperation({pending, retryReady: true}), true);
  await f.store.retryOperation(); assert.equal(f.calls.filter(call => call.method).length, 0);
  await f.store.checkOperation(); assert.equal(f.store.state.operation.retryReady, true);
  f.setSend(() => { throw new Error('lost'); }); await f.store.retryOperation();
  assert.deepEqual(f.calls.filter(call => call.method).at(-1).body, pending.body);
});
