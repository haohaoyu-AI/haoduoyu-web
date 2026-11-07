import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {createNoteEntriesStore} from '../web/core/note-entries-state.mjs';

mock.timers.enable({apis:['Date'], now:new Date('2026-10-24T08:42:00Z')});
const date = '2026-10-24', id = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const record = (entryId, text = 'draft') => ({id:entryId, category:'life', date, text, labels:[], labels_version:3,
  version:1, deleted:false, can_edit:true, created_at:'2026-10-24T08:00:00Z', updated_at:'2026-10-24T08:00:00Z', content_hash:'hash'});
function fixture(verify) {
  const writes = [];
  const empty = {category:'life', date, entries:[], can_edit:true, labels_version:3};
  const store = createNoteEntriesStore({category:'life', manualSave:true, multiLabels:true,
    load:async()=>empty, loadVerified:verify, loadEntry:async()=>{throw new Error('unexpected')},
    loadOperation:async()=>({found:false}), uuid:()=>other,
    put:async (key, body)=>{writes.push({key,body}); return record(key,body.text);}});
  return {store,writes};
}
async function recover(f) {
  await f.store.read(date);
  return f.store.restoreDraft({id,category:'life',date,draft:'draft',labels:[],labelKnown:true,version:0});
}
test('existing same record is confirmed without writing or removing the recovered draft', async()=>{
  const f=fixture(async()=>({category:'life',date,entries:[record(id)],can_edit:true}));
  const item=await recover(f); await f.store.save(id);
  assert.equal(f.writes.length,0); assert.equal(item.draft,'draft'); assert.equal(item.dirty,true);
  assert.match(item.error,/线上已有/);
});
test('matching text under another id is not assumed to be the same record', async()=>{
  const f=fixture(async()=>({category:'life',date,entries:[record(other)],can_edit:true}));
  const item=await recover(f); await f.store.save(id);
  assert.equal(f.writes.length,0); assert.match(item.error,/内容相同/);
});
test('failed verification retains the draft and does not send', async()=>{
  const f=fixture(async()=>{throw new Error('offline')}); const item=await recover(f);
  await f.store.save(id); assert.equal(f.writes.length,0); assert.equal(item.draft,'draft');
  assert.match(item.error,/无法核对/);
});
test('a changed record with the same id is not overwritten', async()=>{
  const f=fixture(async()=>({category:'life',date,entries:[record(id,'different')],can_edit:true}));
  const item=await recover(f); await f.store.save(id);
  assert.equal(f.writes.length,0); assert.equal(item.draft,'draft'); assert.match(item.error,/线上状态发生变化/);
});
test('only an explicitly requested, verified missing entry is sent', async()=>{
  const f=fixture(async()=>({category:'life',date,entries:[],can_edit:true})); const item=await recover(f);
  assert.equal(f.writes.length,0); await f.store.save(id); assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].key,id); assert.equal(item.draft,'draft');
});
test('edits during verification cancel the stale send', async()=>{
  let finish; const gate=new Promise(resolve=>{finish=resolve});
  const f=fixture(()=>gate); const item=await recover(f); const saving=f.store.save(id);
  f.store.edit(id,'new draft'); finish({category:'life',date,entries:[],can_edit:true}); await saving;
  assert.equal(f.writes.length,0); assert.equal(item.draft,'new draft');
});
