import test from 'node:test';
import assert from 'node:assert/strict';
import {createNoteEntriesStore} from '../web/core/note-entries-state.mjs';
import {selectedFloatingEntry} from '../web/daily-notes-controller.mjs';

test('an in-progress floating note stays on its original date across midnight', async () => {
  const oldDate='2026-10-28', nextDate='2026-10-29', id='00000000-0000-4000-8000-000000000001';
  const stamp='2026-10-28T15:59:00.000Z', writes=[];
  const store=createNoteEntriesStore({category:'life',manualSave:true,uuid:()=>id,
    load:async date=>({category:'life',date,can_edit:true,entries:[]}),
    loadEntry:async()=>{throw new Error('unexpected read');},loadOperation:async()=>({found:false}),
    put:async (key,body)=>{writes.push(body);return {id:key,category:'life',date:body.date,text:body.text,
      version:body.version+1,deleted:false,can_edit:true,created_at:stamp,updated_at:stamp,content_hash:'synthetic'};},
    remove:async()=>{throw new Error('unexpected deletion');},restore:async()=>{throw new Error('unexpected restore');}});
  await store.read(oldDate);
  const draft=store.start(oldDate); store.edit(draft.id,'before midnight');
  assert.equal(store.page(nextDate).loaded,false);
  const selected=selectedFloatingEntry(store,draft.id,oldDate);
  assert.equal(selected,draft);
  store.edit(selected.id,'before midnight and after midnight');
  assert.equal(store.entry(draft.id).draft,'before midnight and after midnight');
  assert.equal(store.entry(draft.id).date,oldDate);
  assert.deepEqual(store.page(nextDate).ids,[]);
  await store.save(draft.id);
  assert.equal(writes[0].date,oldDate);
  assert.equal(selectedFloatingEntry(store,draft.id,nextDate),null);
  store.dispose();
});
