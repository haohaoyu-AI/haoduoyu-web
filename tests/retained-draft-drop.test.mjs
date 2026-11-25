import test from 'node:test';
import assert from 'node:assert/strict';
import {createNoteEntriesStore} from '../web/core/note-entries-state.mjs';

// Deleting a retained draft from the archive must also clear the copy the page restored into memory,
// otherwise the next local capture writes the same text straight back.
const date = '2026-11-03', id = '00000000-0000-4000-8000-000000000001';
const saved = {id, category:'life', date, text:'saved text', labels:['生活'], labels_version:3, version:2, deleted:false,
  can_edit:true, created_at:'2026-11-03T04:00:00Z', updated_at:'2026-11-03T04:00:00Z', content_hash:'hash'};
function store(entries = []) {
  return createNoteEntriesStore({category:'life', manualSave:true, multiLabels:true,
    load:async()=>({category:'life', date, entries, can_edit:true, labels_version:3}),
    loadVerified:async()=>({category:'life', date, entries, can_edit:true}), loadEntry:async()=>{ throw new Error('unexpected'); },
    loadOperation:async()=>({found:false}), put:async()=>{ throw new Error('no writes expected'); }});
}
const restore = (s, extra = {}) => s.restoreDraft({id, category:'life', date, draft:'recovered text', labels:['生活'], labelKnown:true,
  version:2, serverText:'saved text', ...extra});

test('a recovered draft of a saved entry returns to the saved text', async()=>{
  const s = store([saved]); await s.read(date);
  const item = restore(s); assert.equal(item.dirty, true); assert.ok(item.recoveredBaseline);
  assert.equal(s.dropRestoredDraft(id, 'other text'), false, 'a different text is a different draft');
  assert.equal(s.dropRestoredDraft(id, 'recovered text'), true);
  assert.equal(item.draft, 'saved text'); assert.equal(item.dirty, false); assert.equal(item.phase, 'saved');
  assert.equal(item.recoveredBaseline, null); assert.equal(item.error, '');
  assert.equal(s.dropRestoredDraft(id, 'saved text'), false, 'only recovered copies are dropped');
});
test('an entry that existed only as the recovered draft disappears', async()=>{
  const s = store(); await s.read(date);
  restore(s, {version:0, serverText:''}); assert.deepEqual(s.page(date).ids, [id]);
  assert.equal(s.dropRestoredDraft(id, 'recovered text'), true);
  assert.equal(s.entry(id), undefined); assert.deepEqual(s.page(date).ids, []);
});
test('an editor in use or a live save keeps its text', async()=>{
  const s = store([saved]); await s.read(date);
  const item = restore(s);
  item.composing = true; assert.equal(s.dropRestoredDraft(id, 'recovered text'), false); item.composing = false;
  item.pending = {kind:'put', version:2, saveId:'00000000-0000-4000-8000-000000000009', text:'recovered text', uncertain:false};
  assert.equal(s.dropRestoredDraft(id, 'recovered text'), false);
  item.pending.uncertain = true; assert.equal(s.dropRestoredDraft(id, 'recovered text'), true, 'a recovered unconfirmed save is local only');
  assert.equal(item.pending, null);
});
