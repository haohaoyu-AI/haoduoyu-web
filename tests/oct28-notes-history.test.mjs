import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateNoteDay, filterNoteDay, loadNoteDay} from '../web/core/notes-history.mjs';
const date = '2026-10-27';
const row = (id, category, text, label, time) => ({id, category, date, text, label:label ?? null, labels_version:1, deleted:false, updated_at:time});
const collection = (category, entries=[]) => ({category, date, entries});
const legacy = (text='', updated_at=null) => ({date,text,version:text?1:0,deleted:false,updated_at});
const input = () => ({lifeEntries:collection('life',[
  row('1','life','重复','兴趣','2026-10-27T03:00:00Z'),
  row('2','life','重复',undefined,'2026-10-27T02:00:00Z')]),
  workEntries:collection('work',[row('3','work','工作',undefined,'2026-10-27T01:00:00Z')]),
  lifeLegacy:legacy('旧生活'), workLegacy:legacy('旧工作','2026-10-27T00:00:00Z')});
test('all labels preserve independent IDs, old content and actual timestamps', () => {
  const rows=aggregateNoteDay(date,input());
  assert.deepEqual(rows.map(r=>r.key),['note-entry:1','note-entry:2','note-entry:3','legacy-work:2026-10-27','legacy-life:2026-10-27']);
  assert.deepEqual(rows.map(r=>r.label),['兴趣','生活','工作','工作','生活']);
  assert.equal(rows[4].time,null); assert.equal(filterNoteDay(rows,'生活').length,2);
  assert.equal(filterNoteDay(rows,'工作').length,2); assert.equal(filterNoteDay(rows,'兴趣').length,1);
  assert.equal(filterNoteDay(rows).length,5);
});
test('incomplete reads fail rather than showing a partial day', async () => {
  const data=input(); data.workEntries.entries[0].id='1';
  assert.throws(()=>aggregateNoteDay(date,data),/读取不完整/);
  const requests=[];
  await assert.rejects(loadNoteDay(async path=>{requests.push(path); if(path.includes('category=work')) throw new Error('offline'); return {};},date),/offline/);
  assert.equal(requests.length,4);
});

test('date index combines all categories and legacy sources without silently truncating', async () => {
  const {loadNoteHistoryDates} = await import('../web/core/notes-history.mjs');
  const result = await loadNoteHistoryDates(async path => {
    if (path.startsWith('/note-entries/dates?category=life') && !path.includes('&before='))
      return {dates:['2026-10-27'],has_more:true,next_before:'2026-10-27'};
    if (path.includes('&before=')) return {dates:['2026-10-25'],has_more:false,next_before:null};
    if (path.startsWith('/daily-notes/dates?category=work')) return {dates:['2026-10-26'],has_more:false,next_before:null};
    return {dates:[],has_more:false,next_before:null};
  });
  assert.deepEqual(result,['2026-10-27','2026-10-26','2026-10-25']);
  await assert.rejects(loadNoteHistoryDates(async ()=>({dates:['2026-10-27'],has_more:true,next_before:'2026-10-27'}),{maxPagesPerSource:1}),/无法完整读取/);
});

test('old unversioned responses never assert a missing life label',()=>{
  const data=input(); delete data.lifeEntries.entries[1].label; delete data.lifeEntries.entries[1].labels_version;
  const rows=aggregateNoteDay(date,data);
  assert.equal(rows.find(row=>row.key==='note-entry:2').label,'标签待核实');
  assert.equal(filterNoteDay(rows,'生活').some(row=>row.key==='note-entry:2'),false);
});
