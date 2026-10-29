import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleNoteEntries} from '../src/note-entries.mjs';
import {exportBackup,restoreIntoEmptyDatabase} from '../src/backup.mjs';
import {digest,stable} from '../src/security.mjs';
function database() {
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const name of ['0000_lively_stellaris','0001_daily_todos','0002_todo_templates','0003_todo_recovery_preferences','0004_daily_notes','0005_article_pipeline','0006_long_term_memos','0007_work_daily_notes','0008_workbench_updates','0009_unscheduled_todos','0010_note_labels']) {
  for(const stmt of readFileSync(new URL('../drizzle/'+name+'.sql',import.meta.url),'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean)) {
   sql.exec(stmt);
  }
 }
 const db={prepare(text){let values=[];return {bind(...v){values=v;return this},async first(){return sql.prepare(text).get(...values)||null},async all(){return {results:sql.prepare(text).all(...values)}},async run(){const result=sql.prepare(text).run(...values);return {meta:{changes:Number(result.changes)}}}}},async batch(statements){sql.exec('BEGIN');try{for(const s of statements)await s.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};return {sql,db};
}
test('additive migration preserves original row; multi-label read, update, old API, and receipt',async()=>{
 const {sql,db}=database(),owner=randomUUID(),id=randomUUID(),time='2026-10-28T08:00:00.000Z';
 sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'demo','hash',time);
 sql.exec('INSERT INTO matrix_control(id,revision,initialized) VALUES(1,1,1)');
 sql.prepare('INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(owner,id,'life','2026-10-28','old text',1,1,time,time,null);
 sql.prepare('INSERT INTO matrix_note_labels(user_id,name,created_at) VALUES(?,?,?)').run(owner,'old',time);
 sql.prepare('INSERT INTO matrix_note_entry_labels(user_id,entry_id,label) VALUES(?,?,?)').run(owner,id,'old');
 const before=sql.prepare('SELECT * FROM matrix_note_entries').get(),old=sql.prepare('SELECT * FROM matrix_note_entry_labels').get();
 sql.exec(readFileSync(new URL('../drizzle/0011_note_entry_multi_labels.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../drizzle/0012_note_entry_label_sets.sql',import.meta.url),'utf8'));
 const env={DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1'};
 async function call(path,method='GET',body,version='2') {
  const headers=new Headers({Origin:'http://localhost','X-Public-Business':'1','X-Note-Labels-Version':version});if(body)headers.set('Content-Type','application/json');
  const request=new Request('http://localhost'+path,{method,headers,body:body?JSON.stringify(body):undefined});
  return (await (await handleNoteEntries(db,request,new URL(request.url).pathname,env,'http://localhost')).json()).data;
 }
 assert.deepEqual((await call('/note-entries/'+id)).labels,['old']);
 const save_id=randomUUID(),body={category:'life',date:'2026-10-28',text:'old text',version:1,save_id,labels:['old','third','second']};
 const saved=await call('/note-entries/'+id,'PUT',body);assert.deepEqual(saved.labels,['old','second','third']);
 assert.deepEqual((await call('/note-entries/'+id,'PUT',body)).labels,saved.labels);
 assert.deepEqual((await call('/note-entries/'+id)).labels,saved.labels);
 assert.deepEqual((await call('/note-entries/operations/'+save_id)).labels,saved.labels);
 assert.equal((await call('/note-entries/'+id,'GET',undefined,'1')).label,'old');
 const month=await call('/note-entries/month?month=2026-10');assert.deepEqual(month.days[0].items[0].labels,saved.labels);
 const saved2=await call('/note-entries/'+id,'PUT',{...body,version:2,save_id:randomUUID(),labels:[]});assert.deepEqual(saved2.labels,[]);
 assert.deepEqual(sql.prepare('SELECT * FROM matrix_note_entry_labels').get(),old);
 assert.equal(sql.prepare('SELECT text FROM matrix_note_entries').get().text,before.text);
 assert.deepEqual((await call('/note-entries/'+id)).labels,[]);
 const legacy=await call('/note-entries/'+id,'PUT',{category:'life',date:'2026-10-28',text:'legacy edit',version:3,save_id:randomUUID()},'1');assert.equal(legacy.label,null);
 assert.deepEqual((await call('/note-entries/'+id)).labels,[]);
});

test('backup and restore retains both original label and override',async()=>{
 const source=database(),target=database(),migration=readFileSync(new URL('../drizzle/0011_note_entry_multi_labels.sql',import.meta.url),'utf8');
 source.sql.exec(migration);target.sql.exec(migration);
 const setsMigration=readFileSync(new URL('../drizzle/0012_note_entry_label_sets.sql',import.meta.url),'utf8');
 source.sql.exec(setsMigration);target.sql.exec(setsMigration);
 const archivesMigration=readFileSync(new URL('../drizzle/0013_note_label_archives.sql',import.meta.url),'utf8');
 source.sql.exec(archivesMigration);target.sql.exec(archivesMigration);
 const user=randomUUID(),entry=randomUUID(),time='2026-10-28T08:00:00.000Z';
 source.sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(user,'demo','hash',time);
 source.sql.exec('INSERT INTO matrix_control(id,revision,initialized) VALUES(1,1,1)');
 source.sql.prepare('INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(user,entry,'life','2026-10-28','original',1,1,time,time,null);
 for(const tag of ['old','new','third'])source.sql.prepare('INSERT INTO matrix_note_labels(user_id,name,created_at) VALUES(?,?,?)').run(user,tag,time);
 source.sql.prepare('INSERT INTO matrix_note_entry_labels(user_id,entry_id,label) VALUES(?,?,?)').run(user,entry,'old');
 source.sql.prepare('INSERT INTO matrix_note_entry_label_overrides(user_id,entry_id,labels_json) VALUES(?,?,?)').run(user,entry,JSON.stringify(['old','new','third']));
 const backup=await exportBackup(source.db);assert.equal(backup.data.format,'haoduoyu-matrix-d1-v13');
 await restoreIntoEmptyDatabase(target.db,backup,{allowEmptyRestore:true});
 assert.deepEqual({...target.sql.prepare('SELECT * FROM matrix_note_entry_labels').get()},{user_id:user,entry_id:entry,label:'old'});
 assert.deepEqual(JSON.parse(target.sql.prepare('SELECT labels_json FROM matrix_note_entry_label_overrides').get().labels_json),['old','new','third']);
 assert.equal(target.sql.prepare('SELECT text FROM matrix_note_entries').get().text,'original');
 const legacy=structuredClone(backup);legacy.data.format='haoduoyu-matrix-d1-v10';delete legacy.data.tables.note_entry_label_overrides;delete legacy.data.tables.note_entry_label_sets;delete legacy.data.tables.note_label_archives;legacy.sha256=digest(JSON.stringify(stable(legacy.data)));
 const oldTarget=database();oldTarget.sql.exec(migration);oldTarget.sql.exec(setsMigration);oldTarget.sql.exec(archivesMigration);await restoreIntoEmptyDatabase(oldTarget.db,legacy,{allowEmptyRestore:true});
 assert.equal(oldTarget.sql.prepare('SELECT label FROM matrix_note_entry_labels').get().label,'old');
 assert.equal(oldTarget.sql.prepare('SELECT count(*) AS n FROM matrix_note_entry_label_overrides').get().n,0);
});
