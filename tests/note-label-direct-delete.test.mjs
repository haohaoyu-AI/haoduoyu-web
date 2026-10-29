import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleNoteEntries} from '../src/note-entries.mjs';

function fixture() {
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
  for(const name of ['0000_lively_stellaris','0001_daily_todos','0002_todo_templates','0003_todo_recovery_preferences','0004_daily_notes','0005_article_pipeline','0006_long_term_memos','0007_work_daily_notes','0008_workbench_updates','0009_unscheduled_todos','0010_note_labels','0011_note_entry_multi_labels','0012_note_entry_label_sets','0013_note_label_archives'])
    for(const stmt of readFileSync(new URL('../drizzle/'+name+'.sql',import.meta.url),'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))sql.exec(stmt);
  const db={prepare(text){let values=[];return {bind(...v){values=v;return this},async first(){return sql.prepare(text).get(...values)||null},async all(){return {results:sql.prepare(text).all(...values)}},async run(){return {meta:{changes:Number(sql.prepare(text).run(...values).changes)}}}}},async batch(statements){sql.exec('BEGIN');try{for(const s of statements)await s.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};
  const owner=randomUUID(), other=randomUUID(), entry=randomUUID(), otherEntry=randomUUID(),time='2026-10-28T08:00:00.000Z';
  for(const [id,username] of [[owner,'owner'],[other,'other']])sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(id,username,'hash',time);
  sql.exec('INSERT INTO matrix_control(id,revision,initialized) VALUES(1,1,1)');
  for(const [user,id] of [[owner,entry],[other,otherEntry]]) {
    sql.prepare('INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at) VALUES(?,?,?,?,?,1,1,?,?)').run(user,id,'life','2026-10-28','不要删除的正文',time,time);
    for(const name of ['兴趣','保留'])sql.prepare('INSERT INTO matrix_note_labels(user_id,name,created_at) VALUES(?,?,?)').run(user,name,time);
    sql.prepare('INSERT INTO matrix_note_entry_labels(user_id,entry_id,label) VALUES(?,?,?)').run(user,id,'兴趣');
    sql.prepare('INSERT INTO matrix_note_entry_label_overrides(user_id,entry_id,labels_json) VALUES(?,?,?)').run(user,id,JSON.stringify(['兴趣','保留']));
    sql.prepare('INSERT INTO matrix_note_entry_label_sets(user_id,entry_id,labels_json) VALUES(?,?,?)').run(user,id,JSON.stringify(['生活','兴趣']));
  }
  const env={DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1'};
  async function call(path,method='GET',body) {
    const headers=new Headers({Origin:'http://localhost','X-Public-Business':'1','X-Note-Labels-Version':'3','X-Note-Labels-Archive':'1'});
    if(body)headers.set('Content-Type','application/json');
    const request=new Request('http://localhost'+path,{method,headers,body:body?JSON.stringify(body):undefined});
    return (await (await handleNoteEntries(db,request,new URL(request.url).pathname,env,'http://localhost')).json()).data;
  }
  return {sql,owner,other,entry,otherEntry,time,call};
}

test('direct custom label deletion is idempotent, preserves note bodies, isolates users and detects stale edits',async()=>{
  const f=fixture(), {sql,owner,other,entry,otherEntry,time,call}=f, path='/note-entries/labels';
  const command={action:'delete',name:'兴趣',save_id:randomUUID()};
  const result=await call(path,'POST',command);
  assert.deepEqual(result,{name:'兴趣',deleted:true,mode:'deleted',labels_version:3});
  assert.deepEqual(await call(path,'POST',command),result);
  await assert.rejects(call(path,'POST',{...command,name:'保留'}),e=>e.status===409);
  const row=sql.prepare('SELECT text,version,updated_at FROM matrix_note_entries WHERE user_id=? AND id=?').get(owner,entry);
  assert.equal(row.text,'不要删除的正文');assert.equal(row.version,2);assert.equal(row.updated_at,time);
  assert.equal(sql.prepare('SELECT count(*) n FROM matrix_note_labels WHERE user_id=? AND name=?').get(owner,'兴趣').n,0);
  assert.equal(sql.prepare('SELECT count(*) n FROM matrix_note_entry_labels WHERE user_id=? AND label=?').get(owner,'兴趣').n,0);
  assert.deepEqual(JSON.parse(sql.prepare('SELECT labels_json FROM matrix_note_entry_label_overrides WHERE user_id=? AND entry_id=?').get(owner,entry).labels_json),['保留']);
  assert.deepEqual(JSON.parse(sql.prepare('SELECT labels_json FROM matrix_note_entry_label_sets WHERE user_id=? AND entry_id=?').get(owner,entry).labels_json),['生活']);
  assert.equal(sql.prepare('SELECT count(*) n FROM matrix_note_labels WHERE user_id=? AND name=?').get(other,'兴趣').n,1);
  assert.equal(sql.prepare('SELECT version FROM matrix_note_entries WHERE user_id=? AND id=?').get(other,otherEntry).version,1);
  assert.deepEqual((await call('/note-entries/'+entry)).labels,['保留','生活'].sort());
  await assert.rejects(call('/note-entries/'+entry,'PUT',{category:'life',date:'2026-10-28',text:'旧编辑',version:1,save_id:randomUUID(),labels:['生活','兴趣']}),e=>e.status===409);
  assert.equal(sql.prepare('SELECT text FROM matrix_note_entries WHERE user_id=? AND id=?').get(owner,entry).text,'不要删除的正文');
});

test('existing archives are not deleted; built-in categories use a compatibility marker',async()=>{
  const {sql,owner,entry,time,call}=fixture(),path='/note-entries/labels';
  sql.prepare('INSERT INTO matrix_note_label_archives(user_id,name,archived_at) VALUES(?,?,?)').run(owner,'兴趣',time);
  await assert.rejects(call(path,'POST',{action:'delete',name:'兴趣',save_id:randomUUID()}),e=>e.status===404);
  assert.equal(sql.prepare('SELECT count(*) n FROM matrix_note_labels WHERE user_id=? AND name=?').get(owner,'兴趣').n,1);
  assert.equal(sql.prepare('SELECT archived_at FROM matrix_note_label_archives WHERE user_id=? AND name=?').get(owner,'兴趣').archived_at,time);
  const deleted=await call(path,'POST',{action:'delete',name:'生活',save_id:randomUUID()});
  assert.equal(deleted.mode,'builtin-hidden');
  assert.ok((await call(path)).archived_labels.some(row=>row.name==='生活'));
  assert.equal((await call('/note-entries/'+entry)).text,'不要删除的正文');
});
