import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleNoteLabels} from '../src/note-labels.mjs';

function database() {
  const sql=new DatabaseSync(':memory:'); sql.exec('PRAGMA foreign_keys=ON');
  for(const name of ['0000_lively_stellaris','0001_daily_todos','0002_todo_templates','0003_todo_recovery_preferences','0004_daily_notes','0005_article_pipeline','0006_long_term_memos','0007_work_daily_notes','0008_workbench_updates','0009_unscheduled_todos','0010_note_labels']) {
    for(const stmt of readFileSync(new URL('../drizzle/'+name+'.sql',import.meta.url),'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))sql.exec(stmt);
  }
  sql.exec('CREATE TABLE matrix_note_label_archives(user_id TEXT NOT NULL,name TEXT NOT NULL,archived_at TEXT NOT NULL,PRIMARY KEY(user_id,name))');
  let tail=Promise.resolve();
  const db={prepare(text){let values=[];return {bind(...v){values=v;return this},async first(){return sql.prepare(text).get(...values)||null},async all(){return {results:sql.prepare(text).all(...values)}},async run(){return {meta:{changes:Number(sql.prepare(text).run(...values).changes)}}}}},async batch(statements){const previous=tail;let release;tail=new Promise(resolve=>{release=resolve});await previous;try{sql.exec('BEGIN');try{for(const s of statements)await s.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}finally{release()}}};
  return {sql,db};
}

test('label archiving persists without deleting labels, entry associations, or legacy visibility',async()=>{
  const {sql,db}=database(),owner=randomUUID(),id=randomUUID(),time='2026-10-28T08:00:00.000Z';
  sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'demo','hash',time);
  sql.exec('INSERT INTO matrix_control(id,revision,initialized) VALUES(1,1,1)');
  sql.prepare('INSERT INTO matrix_note_labels(user_id,name,created_at) VALUES(?,?,?)').run(owner,'兴趣',time);
  sql.prepare('INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at) VALUES(?,?,?,?,?,1,1,?,?)').run(owner,id,'life','2026-10-28','sample',time,time);
  sql.prepare('INSERT INTO matrix_note_entry_labels(user_id,entry_id,label) VALUES(?,?,?)').run(owner,id,'兴趣');
  const env={DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1'};
  async function call(method='GET',body,archive=true) {
    const headers=new Headers({Origin:'http://localhost','X-Public-Business':'1','X-Note-Labels-Version':'3'});
    if(archive)headers.set('X-Note-Labels-Archive','1');
    if(body)headers.set('Content-Type','application/json');
    const request=new Request('http://localhost/note-entries/labels',{method,headers,body:body?JSON.stringify(body):undefined});
    return (await (await handleNoteLabels(db,request,owner,env,'http://localhost')).json()).data;
  }
  assert.deepEqual((await call()).archived_labels,[]);
  const command={action:'archive',name:'兴趣',save_id:randomUUID()};
  const saved=await call('POST',command);
  assert.equal(saved.name,'兴趣');assert.ok(saved.archived_at);
  assert.deepEqual(await call('POST',command),saved);
  await assert.rejects(call('POST',{...command,action:'restore'}),e=>e.status===409);
  assert.deepEqual((await call()).archived_labels,[{name:'兴趣',archived_at:saved.archived_at}]);
  const legacy=await call('GET',undefined,false);
  assert.equal(Object.hasOwn(legacy,'archived_labels'),false);
  assert.deepEqual(legacy.labels.map(row=>row.name),['兴趣']);
  assert.equal(sql.prepare('SELECT count(*) n FROM matrix_note_entry_labels WHERE entry_id=? AND label=?').get(id,'兴趣').n,1);
  const sameName=await call('POST',{name:'兴趣',save_id:randomUUID()},false);assert.equal(sameName.name,'兴趣');
  assert.equal((await call()).archived_labels[0].name,'兴趣');
  const builtin=await call('POST',{action:'archive',name:'生活',save_id:randomUUID()});assert.ok(builtin.archived_at);
  await assert.rejects(call('POST',{action:'archive',name:'不存在',save_id:randomUUID()}),e=>e.status===404);
  const restored=await call('POST',{action:'restore',name:'兴趣',save_id:randomUUID()});assert.equal(restored.archived_at,null);
  assert.deepEqual((await call()).archived_labels,[{name:'生活',archived_at:builtin.archived_at}]);
  assert.equal(sql.prepare('SELECT count(*) n FROM matrix_note_labels WHERE user_id=? AND name=?').get(owner,'兴趣').n,1);
  assert.equal(sql.prepare('SELECT count(*) n FROM matrix_note_entry_labels WHERE entry_id=? AND label=?').get(id,'兴趣').n,1);
});


test('concurrent archive requests serialize and preserve distinct receipts',async()=>{
  const {sql,db}=database(),owner=randomUUID(),time='2026-10-28T08:00:00.000Z';
  sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'demo','hash',time);
  sql.exec('INSERT INTO matrix_control(id,revision,initialized) VALUES(1,1,1)');
  const env={DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1'};
  const headers={Origin:'http://localhost','X-Public-Business':'1','X-Note-Labels-Version':'3','X-Note-Labels-Archive':'1','Content-Type':'application/json'};
  async function archive(body){const req=new Request('http://localhost/note-entries/labels',{method:'POST',headers,body:JSON.stringify(body)});return (await (await handleNoteLabels(db,req,owner,env,'http://localhost')).json()).data;}
  const requests=Array.from({length:2},()=>({action:'archive',name:'工作',save_id:randomUUID()}));
  const results=await Promise.all(requests.map(archive));
  assert.equal(results[0].archived_at,results[1].archived_at);
  assert.equal(sql.prepare('SELECT count(*) n FROM matrix_note_label_archives WHERE user_id=?').get(owner).n,1);
  assert.deepEqual(await archive(requests[0]),results[0]);
});
