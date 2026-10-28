import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';

test('custom labels persist, preserve legacy edits, tombstones and idempotent receipts',async t=>{
  const app=await fixture(t,{migrationCount:10}),session=await app.login();
  const owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const migration=await readFile(new URL('../drizzle/0010_note_labels.sql',import.meta.url),'utf8');
  await app.db.batch(migration.split('--> statement-breakpoint').filter(x=>x.trim()).map(sql=>app.db.prepare(sql)));
  const env={DB:app.db,SITE_ORIGIN:app.origin,DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,
    PUBLIC_BUSINESS_ACCOUNT_IDS:'["toutiao-haoduoyu"]'};
  async function call(path,method='GET',body) {
    const headers=new Headers({Origin:app.origin,'X-Public-Business':'1'});
    if(body)headers.set('Content-Type','application/json');
    const response=await worker.fetch(new Request(app.origin+'/api/v1'+path,{method,headers,body:body?JSON.stringify(body):undefined}),env);
    return {status:response.status,...await response.json()};
  }
  const save_id=randomUUID(),id=randomUUID(),body={category:'life',date:'2026-10-28',text:'示例',version:0,save_id,label:'  兴趣  '};
  const created=await call('/note-entries/'+id,'PUT',body);
  assert.equal(created.status,200);assert.equal(created.data.label,'兴趣');
  const replay=await call('/note-entries/'+id,'PUT',body);assert.equal(replay.data.version,1);assert.equal(replay.data.label,'兴趣');
  assert.equal((await call('/note-entries/'+id,'PUT',{...body,label:'其他'})).status,409);
  assert.equal((await call('/note-entries?category=life&date=2026-10-28')).data.entries[0].label,'兴趣');
  const edited=await call('/note-entries/'+id,'PUT',{category:'life',date:body.date,text:'旧客户端编辑',version:1,save_id:randomUUID()});
  assert.equal(edited.data.label,'兴趣');assert.equal(edited.data.version,2);
  assert.equal((await call('/note-entries/'+id,'PUT',{...body,version:2,save_id:randomUUID(),label:'其他'})).status,400);
  const deleted=await call('/note-entries/'+id,'DELETE',{version:2,save_id:randomUUID()});assert.equal(deleted.data.label,'兴趣');
  const restored=await call('/note-entries/'+id+'/restore','POST',{version:3,save_id:randomUUID()});assert.equal(restored.data.label,'兴趣');
  const empty={name:'阅读',save_id:randomUUID()};
  assert.equal((await call('/note-entries/labels','POST',empty)).status,200);
  assert.equal((await call('/note-entries/labels','POST',empty)).status,200);
  assert.deepEqual((await call('/note-entries/labels')).data.labels.map(row=>row.name),['兴趣','阅读']);
  assert.equal((await call('/note-entries/labels','POST',{name:'工作',save_id:randomUUID()})).status,400);
  assert.equal((await call('/note-entries/labels','POST',{name:'其他',save_id:empty.save_id})).status,409);
  const sampleTime='2026-10-28T08:00:00.000Z',statements=[];
  for(let i=0;i<55;i++) {
    const entryId=randomUUID();
    statements.push(app.db.prepare('INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at) VALUES(?,?,?,?,?,1,1,?,?)')
      .bind(owner,entryId,'life',body.date,'批量样例',sampleTime,sampleTime));
    statements.push(app.db.prepare('INSERT INTO matrix_note_entry_labels(user_id,entry_id,label) VALUES(?,?,?)').bind(owner,entryId,'兴趣'));
  }
  await app.db.batch(statements);
  const page=await call('/note-entries?category=life&date=2026-10-28');
  assert.equal(page.status,200);assert.equal(page.data.entries.length,56);assert.ok(page.data.entries.every(row=>row.label==='兴趣'));
});

test('additive migration preserves existing note rows and labels cannot reference another owner',async t=>{
  const app=await fixture(t,{migrationCount:10}),session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const id=randomUUID(),time='2026-10-25T08:00:00.000Z';
  await app.db.prepare('INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(owner,id,'work','2026-10-25','旧记录',1,1,time,time,null).run();
  const before=await app.db.prepare('SELECT * FROM matrix_note_entries WHERE user_id=? AND id=?').bind(owner,id).first();
  const sql=await readFile(new URL('../drizzle/0010_note_labels.sql',import.meta.url),'utf8');
  await app.db.batch(sql.split('--> statement-breakpoint').filter(x=>x.trim()).map(x=>app.db.prepare(x)));
  assert.deepEqual(await app.db.prepare('SELECT * FROM matrix_note_entries WHERE user_id=? AND id=?').bind(owner,id).first(),before);
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_note_entry_labels').first()).n,0);
  await assert.rejects(app.db.prepare('INSERT INTO matrix_note_entry_labels(user_id,entry_id,label) VALUES(?,?,?)').bind(owner,id,'不存在').run());
});
