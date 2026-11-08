import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryDB} from '../frontend/web/offline/db.mjs';
import {createLocalApi, LOCAL_OWNER_ID} from '../frontend/web/local/api.mjs';
import {createNoteEntriesStore} from '../frontend/web/core/note-entries-state.mjs';
import {createMemosStore} from '../frontend/web/core/memos-state.mjs';
import {loadNoteDay, loadNoteHistoryDates} from '../frontend/web/core/notes-history.mjs';
import {dailyNotesToday} from '../frontend/web/core/daily-notes-state.mjs';
const id = n => '20000000-0000-4000-8000-' + String(n).padStart(12, '0');
const fixture = () => {const db = createMemoryDB(); return {db, api: createLocalApi({db})};};
function noteStore(api) {
  let index = 1;
  return createNoteEntriesStore({category: 'life', manualSave: true, multiLabels: true, uuid: () => id(index++),
    load: date => api('/note-entries?category=life&date=' + date),
    loadEntry: id => api('/note-entries/' + id), loadVerified: date => api('/note-entries?category=life&date=' + date),
    loadOperation: id => api('/note-entries/operations/' + id),
    put: (id, body) => api('/note-entries/' + id, {method: 'PUT', body}),
    remove: (id, body) => api('/note-entries/' + id, {method: 'DELETE', body}),
    restore: (id, body) => api('/note-entries/' + id + '/restore', {method: 'POST', body}),
  });
}
test('unmodified original note store accepts complete local lifecycle and reload', async () => {
  const {api} = fixture(), store = noteStore(api), date = dailyNotesToday();
  try {
    await store.read(date); assert.equal(store.page(date).error, '');
    const item = store.start(date, {labels: ['生活', '测试']}); assert.ok(item);
    store.edit(item.id, '虚构测试原文'); await store.save(item.id);
    assert.equal(item.error, ''); assert.equal(item.version, 1); assert.equal(item.phase, 'saved');
    store.edit(item.id, '虚构测试修改'); await store.save(item.id);
    assert.equal(item.version, 2); assert.equal(item.draft, '虚构测试修改');
    await store.deleteEntry(item.id); assert.equal(item.deleted, true);
    await store.restoreEntry(item.id); assert.equal(item.deleted, false); assert.equal(item.draft, '虚构测试修改');
    const second = noteStore(api);
    try {await second.read(date); assert.equal(second.page(date).error, ''); assert.equal(second.entry(item.id).draft, '虚构测试修改');}
    finally {second.dispose();}
  } finally {store.dispose();}
});
test('original combined note history validates local note and legacy source contracts', async () => {
  const {api} = fixture(), date = dailyNotesToday();
  await api('/note-entries/' + id(1), {method: 'PUT', body: {version: 0, save_id: id(2), date, category: 'life', text: 'history', labels: ['学习']}});
  assert.deepEqual(await loadNoteHistoryDates(api), [date]);
  const rows = await loadNoteDay((path) => api(path, {headers: {'X-Note-Labels-Version': '1'}}), date);
  assert.equal(rows.length, 1); assert.equal(rows[0].label, '学习');
});
test('unmodified original memo store creates, edits, deletes and restores without network', async () => {
  const {api} = fixture(); let counter = 1; const values = new Map();
  const storage = {getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
  const store = createMemosStore({request: api, ownerId: LOCAL_OWNER_ID, storage, draftScope: id(100), online: () => true, delay: 100000, uuid: () => id(counter++)});
  try {
    await store.load(); assert.equal(store.state.error, ''); assert.equal(store.state.canEdit, true);
    const groupId = await store.createGroup('本机测试'); assert.ok(groupId); assert.equal(store.state.groups.length, 1);
    const noteId = await store.createNote(groupId, '仅虚构测试'); assert.ok(noteId);
    const draft = store.drafts.get(noteId); assert.equal(draft.phase, 'saved'); assert.equal(draft.error, '');
    store.edit('body', '第二版虚构正文'); await store.saveNote(noteId);
    assert.equal(draft.version, 2); assert.equal(draft.phase, 'saved');
    await store.removeNote(noteId); assert.ok(store.state.notes.find(note => note.id === noteId).deleted_at);
    await store.restore('notes', noteId); assert.equal(store.state.notes.find(note => note.id === noteId).deleted_at, null);
    await store.selectNote(noteId); assert.equal(store.drafts.get(noteId).body, '第二版虚构正文');
  } finally {store.dispose();}
});
