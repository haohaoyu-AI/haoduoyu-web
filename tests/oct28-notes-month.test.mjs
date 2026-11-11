import test from 'node:test';
import assert from 'node:assert/strict';
import {validNoteMonth,shiftNoteMonth,noteMonthWeeks,checkedNoteMonth,coalesceNoteMonthFlight} from '../web/core/notes-month.mjs';
test('month grids start Monday and preserve crossing years and leap days',()=>{
 assert.equal(validNoteMonth('2026-13'),false);
 assert.equal(shiftNoteMonth('2026-01',-1),'2025-12');
 assert.equal(shiftNoteMonth('2026-12',1),'2027-01');
 const october=noteMonthWeeks('2026-10');assert.deepEqual(october[0],[null,null,null,'2026-10-01','2026-10-02','2026-10-03','2026-10-04']);
 assert.equal(noteMonthWeeks('2024-02').flat().filter(Boolean).length,29);
 assert.equal(noteMonthWeeks('2026-11').length,6);
});
test('month requests merge only the same live scope, target, root and generation',()=>{
 const root={}, current={root,target:'2026-10',expected:'owner-1',sequence:1,chosenDate:'2026-10-01'};
 assert.equal(coalesceNoteMonthFlight(current,{...current,chosenDate:'2026-10-05'}),true);
 assert.equal(current.chosenDate,'2026-10-05');
 for (const change of [{root:{}},{target:'2026-11'},{expected:'owner-2'},{sequence:2}])
  assert.equal(coalesceNoteMonthFlight(current,{...current,...change}),false);
 assert.equal(coalesceNoteMonthFlight(null,current),false);
});
test('month must be complete and preserve verified labels and old timestamps',()=>{
 const data={month:'2026-10',complete:true,labels_version:1,days:[{date:'2026-10-02',items:[
  {entity_id:'note-entry:1',source:'note_entry',category:'life',label:'兴趣',text:'同文',created_at:'2026-10-02T03:00:00Z',updated_at:'2026-10-02T04:00:00Z'},
  {entity_id:'legacy-work:2026-10-02',source:'legacy_daily_note',category:'work',label:null,text:'同文',created_at:null,updated_at:'2026-10-02T05:00:00Z'}]}]};
 const days=checkedNoteMonth(data,'2026-10');assert.deepEqual(days.get('2026-10-02').map(row=>row.displayLabel),['兴趣','工作']);
 assert.equal(days.get('2026-10-02')[1].created_at,null);
 assert.throws(()=>checkedNoteMonth({...data,complete:false},'2026-10'),/不完整/);
 assert.throws(()=>checkedNoteMonth({...data,labels_version:undefined},'2026-10'),/不完整/);
 assert.throws(()=>checkedNoteMonth({...data,days:[...data.days,...data.days]},'2026-10'),/不完整/);
});
