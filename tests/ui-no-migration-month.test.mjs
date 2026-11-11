import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {applyLocalSchemaMigrations} from '../scripts/migration-contract.mjs';
import {handleNoteMonth,noteMonthQueries,noteMonthSources} from '../src/note-month.mjs';
import {checkedNoteMonth,noteMonthWeeks,shiftNoteMonth} from '../web/core/notes-month.mjs';
import {beijingDay} from '../src/lib/time.mjs';

const date=beijingDay(Date.now()), month=date.slice(0,7), stamp=date+'T12:00:00Z';
const previous=new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10);
const day=previous.startsWith(month+'-')?previous:date;
const priorMonthDay=(()=>{const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);d.setUTCDate(2);return d.toISOString().slice(0,10);})();

test('month history reads both categories and legacy records on the current schema',async t=>{
  const runtime=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
  const mf=new Miniflare({modules:true,cf:false,script:'export default {fetch(){return new Response(null)}}',
    compatibilityDate:runtime.compatibility_date,compatibilityFlags:runtime.compatibility_flags,d1Databases:['DB'],
    outboundService:()=>new Response(null,{status:502})});
  t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');await applyLocalSchemaMigrations(db);
  await db.prepare('INSERT INTO matrix_control(id) VALUES(1)').run();
  const time=stamp;
  for(const id of ['owner','other'])await db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)')
    .bind(id,id,'synthetic-hash',time).run();
  for(const [table,text] of [['matrix_daily_notes','旧生活'],['matrix_daily_work_notes','旧工作']])
    await db.prepare('INSERT INTO '+table+'(user_id,date,text,version,change_seq,created_at,updated_at) VALUES(?,?,?,1,1,?,?)')
      .bind('owner',day,text,time,time).run();
  for(const [id,owner,category,entryDate,deleted] of [['life','owner','life',day,null],
    ['work','owner','work',day,null],['deleted','owner','life',day,time],
    ['foreign','other','life',day,null],['prior','owner','life',priorMonthDay,null]])
    await db.prepare('INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at,deleted_at) '+
      'VALUES(?,?,?,?,?,1,1,?,?,?)').bind(owner,id,category,entryDate,id,time,time,deleted).run();
  const request=new Request('http://test.invalid/api/v1/note-entries/month?month='+month,{headers:{'X-Note-Labels-Version':'1'}});
  const response=await handleNoteMonth(db,request,'owner'),{data}=await response.json();
  assert.equal(response.status,200);assert.equal(data.labels_version,1);assert.equal(data.days.length,1);
  assert.equal(data.days[0].items.length,4);assert.ok(data.days[0].items.every(item=>item.label===null));
  assert.deepEqual(new Set(data.days[0].items.map(item=>item.source)),new Set(['note_entry','legacy_daily_note']));
  assert.equal(checkedNoteMonth(data,month).get(day).length,4);
  const names=(await db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'matrix_%'").all()).results;
  assert.equal(names.length,42);
  await assert.rejects(handleNoteMonth(db,new Request(request,{method:'POST'}),'owner'),error=>error.status===405);
  await assert.rejects(handleNoteMonth(db,new Request('http://test.invalid/?month='+month+'&month='+priorMonthDay.slice(0,7)),'owner'),error=>error.status===400);
});

test('month bounds and UI validation reject incomplete or label-bearing results',()=>{
  for(const source of noteMonthSources) {
    const query=noteMonthQueries(source);assert.ok(!/\bJOIN\b|unscheduled/.test(query.rows));
    assert.match(query.stat,/LIMIT \?/);assert.match(query.rows,/deleted_at IS NULL/);
  }
  assert.equal(noteMonthWeeks('2026-02').flat().filter(Boolean).length,28);
  assert.equal(shiftNoteMonth('2026-01',-1),'2025-12');
  const data={format:'haoduoyu-note-month-v1',month,complete:true,labels_version:1,days:[]};
  assert.equal(checkedNoteMonth(data,month).size,0);
  const sample={entity_id:'note-entry:sample',source:'note_entry',category:'life',label:null,text:'合成',
    created_at:day+'T00:00:00Z',updated_at:day+'T00:00:00Z'};
  assert.equal(checkedNoteMonth({...data,days:[{date:day,items:[sample]}]},month).get(day).length,1);
  assert.throws(()=>checkedNoteMonth({...data,complete:false},month),/不完整/);
  assert.throws(()=>checkedNoteMonth({...data,labels_version:0},month),/不完整/);
});
