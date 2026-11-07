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
test('v3 labels round-trip and preserve legacy client edits',async()=>{
 const {sql,db}=database(),owner=randomUUID(),life=randomUUID(),work=randomUUID(),time='2026-10-28T08:00:00.000Z';
 for(const file of ['0011_note_entry_multi_labels','0012_note_entry_label_sets']) sql.exec(readFileSync(new URL('../drizzle/'+file+'.sql',import.meta.url),'utf8'));
 sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'demo','hash',time);
 sql.exec('INSERT INTO matrix_control(id,revision,initialized) VALUES(1,1,1)');
 for(const [id,category] of [[life,'life'],[work,'work']]) sql.prepare('INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(owner,id,category,'2026-10-28','old',1,1,time,time,null);
 sql.prepare('INSERT INTO matrix_note_labels(user_id,name,created_at) VALUES(?,?,?)').run(owner,'旧标签',time);
 sql.prepare('INSERT INTO matrix_note_entry_label_overrides(user_id,entry_id,labels_json) VALUES(?,?,?)').run(owner,life,JSON.stringify(['旧标签']));
 const env={DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1'};
 async function call(path,method='GET',body,version='3') {
  const headers=new Headers({Origin:'http://localhost','X-Public-Business':'1','X-Note-Labels-Version':version});if(body)headers.set('Content-Type','application/json');
  const request=new Request('http://localhost'+path,{method,headers,body:body?JSON.stringify(body):undefined});
  return (await (await handleNoteEntries(db,request,new URL(request.url).pathname,env,'http://localhost')).json()).data;
 }
 const path=id=>'/note-entries/'+id;
 const update=(id,category,version,labels,protocol='3')=>call(path(id),'PUT',{category,date:'2026-10-28',text:'updated',version,save_id:randomUUID(),labels},protocol);
 assert.deepEqual((await call(path(life))).labels,['生活','旧标签'].sort());
 assert.deepEqual((await call(path(work))).labels,['工作']);
 assert.deepEqual((await update(work,'work',1,['生活','工作','旧标签'])).labels,['工作','生活','旧标签'].sort());
 assert.deepEqual((await call(path(work),'GET',undefined,'2')).labels,[]);
 assert.deepEqual((await update(life,'life',1,['生活','工作','旧标签'])).labels,['工作','生活','旧标签'].sort());
 assert.deepEqual((await call(path(life),'GET',undefined,'2')).labels,['旧标签']);
 assert.deepEqual(JSON.parse(sql.prepare('SELECT labels_json FROM matrix_note_entry_label_overrides WHERE entry_id=?').get(life).labels_json),['旧标签']);
 await update(life,'life',2,['其他'],'2');
 assert.deepEqual((await call(path(life))).labels,['工作','生活','其他'].sort());
 assert.deepEqual((await update(life,'life',3,[])).labels,[]);
 assert.deepEqual((await call(path(life))).labels,[]);
 const month=await call('/note-entries/month?month=2026-10');
 assert.deepEqual(month.days[0].items.find(item=>item.entity_id==='note-entry:'+work).labels,['工作','生活','旧标签'].sort());
});

test('v3 accepts 200 custom labels alongside both built-ins',async()=>{
 const {sql,db}=database(),owner=randomUUID(),id=randomUUID(),time='2026-10-28T08:00:00.000Z';
 for(const file of ['0011_note_entry_multi_labels','0012_note_entry_label_sets']) sql.exec(readFileSync(new URL('../drizzle/'+file+'.sql',import.meta.url),'utf8'));
 sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'demo','hash',time);
 sql.exec('INSERT INTO matrix_control(id,revision,initialized) VALUES(1,1,1)');
 const env={DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1'},path='/note-entries/'+id;
 const labels=[...Array.from({length:200},(_,i)=>'标签'+String(i).padStart(3,'0')),'生活','工作'].sort();
 const headers={Origin:'http://localhost','X-Public-Business':'1','X-Note-Labels-Version':'3','Content-Type':'application/json'};
 const request=new Request('http://localhost'+path,{method:'PUT',headers,body:JSON.stringify({category:'life',date:'2026-10-28',text:'内容',version:0,save_id:randomUUID(),labels})});
 const saved=await (await handleNoteEntries(db,request,path,env,'http://localhost')).json();
 assert.equal(saved.data.labels_version,3);assert.deepEqual(saved.data.labels,labels);
 const read=new Request('http://localhost'+path,{headers});
 assert.deepEqual((await (await handleNoteEntries(db,read,path,env,'http://localhost')).json()).data.labels,labels);
 const labelPath='/note-entries/labels',listing=new Request('http://localhost'+labelPath,{headers});
 const list=(await (await handleNoteEntries(db,listing,labelPath,env,'http://localhost')).json()).data;
 assert.equal(list.labels_version,3);assert.equal(list.labels.length,200);
});
