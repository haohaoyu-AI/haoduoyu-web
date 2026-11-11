import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {applyLocalSchemaMigrations} from '../scripts/migration-contract.mjs';
import {handleNoteMonth,noteMonthQueries,noteMonthSources} from '../src/note-month.mjs';
import {checkedNoteMonth,noteMonthWeeks,shiftNoteMonth} from '../web/core/notes-month.mjs';

test('month history reads both categories and legacy records on the unchanged production schema',async t=>{
  const runtime=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
  const mf=new Miniflare({modules:true,cf:false,script:'export default {fetch(){return new Response(null)}}',
    compatibilityDate:runtime.compatibility_date,compatibilityFlags:runtime.compatibility_flags,d1Databases:['DB'],
    outboundService:()=>new Response(null,{status:502})});
  t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');await applyLocalSchemaMigrations(db);
  await db.prepare('INSERT INTO matrix_control(id) VALUES(1)').run();
  const time='2026-10-01T12:00:00Z';
  for(const id of ['owner','other'])await db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)')
    .bind(id,id,'synthetic-hash',time).run();
  for(const [table,text] of [['matrix_daily_notes','旧生活'],['matrix_daily_work_notes','旧工作']])
    await db.prepare('INSERT INTO '+table+'(user_id,date,text,version,change_seq,created_at,updated_at) VALUES(?,?,?,1,1,?,?)')
      .bind('owner','2026-10-02',text,time,time).run();
  for(const [id,owner,category,date,deleted] of [['life','owner','life','2026-10-02',null],
    ['work','owner','work','2026-10-02',null],['deleted','owner','life','2026-10-02',time],
    ['foreign','other','life','2026-10-02',null],['prior','owner','life','2026-09-02',null]])
    await db.prepare('INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at,deleted_at) '+
      'VALUES(?,?,?,?,?,1,1,?,?,?)').bind(owner,id,category,date,id,time,time,deleted).run();
  const request=new Request('http://test.invalid/api/v1/note-entries/month?month=2026-10');
  const response=await handleNoteMonth(db,request,'owner'),{data}=await response.json();
  assert.equal(response.status,200);assert.equal(data.labels_version,0);assert.equal(data.days.length,1);
  assert.equal(data.days[0].items.length,4);assert.ok(data.days[0].items.every(item=>item.label===null));
  assert.deepEqual(new Set(data.days[0].items.map(item=>item.source)),new Set(['note_entry','legacy_daily_note']));
  assert.equal(checkedNoteMonth(data,'2026-10').get('2026-10-02').length,4);
  const names=(await db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'matrix_%'").all()).results;
  assert.equal(names.length,22);assert.ok(names.every(row=>!/(?:unscheduled|note_labels|entry_labels)/.test(row.name)));
  await assert.rejects(handleNoteMonth(db,new Request(request,{method:'POST'}),'owner'),error=>error.status===405);
  await assert.rejects(handleNoteMonth(db,new Request('http://test.invalid/?month=2026-10&month=2026-09'),'owner'),error=>error.status===400);
});

test('month bounds and UI validation reject incomplete or label-bearing results',()=>{
  for(const source of noteMonthSources) {
    const query=noteMonthQueries(source);assert.ok(!/JOIN|label|unscheduled/.test(query.rows));
    assert.match(query.stat,/LIMIT \?/);assert.match(query.rows,/deleted_at IS NULL/);
  }
  assert.equal(noteMonthWeeks('2026-02').flat().filter(Boolean).length,28);
  assert.equal(shiftNoteMonth('2026-01',-1),'2025-12');
  const data={format:'haoduoyu-note-month-v1',month:'2026-10',complete:true,labels_version:0,days:[]};
  assert.equal(checkedNoteMonth(data,'2026-10').size,0);
  const empty={entity_id:'note-entry:empty',source:'note_entry',category:'life',label:null,text:'',
    created_at:'2026-10-02T00:00:00Z',updated_at:'2026-10-02T00:00:00Z'};
  assert.equal(checkedNoteMonth({...data,days:[{date:'2026-10-02',items:[empty]}]},'2026-10').get('2026-10-02').length,1);
  assert.throws(()=>checkedNoteMonth({...data,complete:false},'2026-10'),/不完整/);
  assert.throws(()=>checkedNoteMonth({...data,labels_version:1},'2026-10'),/不完整/);
});
