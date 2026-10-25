import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import worker from '../dist/server/index.js';
import {fixture,applyFixtureMigrations} from './harness.mjs';
import {exportBackup,restoreIntoEmptyDatabase} from '../src/backup.mjs';
import {digest,stable} from '../src/security.mjs';

const DAY='2026-10-25';
async function setup(t,options={}) {
  const app=await fixture(t,options),session=await app.login();
  const owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1',
    PUBLIC_BUSINESS_USER_ID:owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'["toutiao-haoduoyu"]'};
  const call=async(path,{method='GET',body,session:useSession}={})=>{
    const headers=new Headers({'Origin':app.origin,'X-Public-Business':'1'});
    if(body)headers.set('Content-Type','application/json');
    if(useSession){headers.set('Cookie',useSession.cookie);headers.set('X-CSRF-Token',useSession.csrfToken);}
    const response=await worker.fetch(new Request(app.origin+'/api/v1'+path,{method,headers,body:body?JSON.stringify(body):undefined}),env);
    const json=await response.json();return {status:response.status,data:json.data,json};
  };
  return {...app,session,owner,env,call};
}
test('0007 only adds work storage and preserves all eighteen existing tables and rows',async t=>{
  const app=await setup(t,{migrationCount:7});
  const old=await app.call('/daily-notes/'+DAY,{method:'PUT',body:{version:0,save_id:randomUUID(),text:'旧内容不分析、不移动'}});
  assert.equal(old.status,200);
  const catalog=(await app.db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='table' AND name LIKE 'matrix_%' ORDER BY name").all()).results;
  assert.equal(catalog.length,18);const rows={};
  for(const {name} of catalog)rows[name]=(await app.db.prepare('SELECT * FROM '+name+' ORDER BY rowid').all()).results;
  await applyFixtureMigrations(app.db);
  for(const {name,sql} of catalog) {
    assert.equal((await app.db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").bind(name).first()).sql,sql);
    assert.deepEqual((await app.db.prepare('SELECT * FROM '+name+' ORDER BY rowid').all()).results,rows[name],name);
  }
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_daily_work_notes').first()).n,0);
  assert.deepEqual((await app.call('/daily-notes?date='+DAY)).data,old.data);
  const journal=JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json',import.meta.url)));
  assert.equal(journal.entries.length,8);assert.equal(journal.entries[7].tag,'0007_work_daily_notes');
  const previous=JSON.parse(await readFile(new URL('../drizzle/meta/0006_snapshot.json',import.meta.url)));
  const current=JSON.parse(await readFile(new URL('../drizzle/meta/0007_snapshot.json',import.meta.url)));
  assert.equal(current.prevId,previous.id);assert.equal(Object.keys(current.tables).length,19);
  for(const [name,table]of Object.entries(previous.tables))assert.deepEqual(current.tables[name],table,name);
});
test('life compatibility and work CRUD have independent CAS, receipts, deletion and date lists',async t=>{
  const app=await setup(t),save_id=randomUUID();
  const life=await app.call('/daily-notes/'+DAY,{method:'PUT',body:{version:0,save_id,text:'兼容生活'}});
  const work=await app.call('/daily-notes/'+DAY+'?category=work',{method:'PUT',body:{version:0,save_id,text:'独立工作'}});
  assert.equal(life.status,200);assert.equal(work.status,200);assert.equal(work.data.version,1);
  assert.equal((await app.call('/daily-notes?date='+DAY)).data.text,'兼容生活');
  assert.equal((await app.call('/daily-notes?date='+DAY+'&category=life')).data.text,'兼容生活');
  assert.equal((await app.call('/daily-notes?date='+DAY+'&category=work')).data.text,'独立工作');
  const replay=await app.call('/daily-notes/'+DAY+'?category=work',{method:'PUT',body:{version:0,save_id,text:'独立工作'}});
  assert.equal(replay.status,200);assert.equal(replay.data.version,1);
  assert.equal((await app.call('/daily-notes/'+DAY+'?category=work',{method:'PUT',body:{version:0,save_id:randomUUID(),text:'不能覆盖'}})).status,409);
  const removed=await app.call('/daily-notes/'+DAY+'?category=work',{method:'DELETE',body:{version:1,save_id:randomUUID()}});
  assert.equal(removed.status,200);assert.equal(removed.data.deleted,true);
  assert.deepEqual((await app.call('/daily-notes/dates?category=work')).data.dates,[]);
  assert.deepEqual((await app.call('/daily-notes/dates')).data.dates,[DAY]);
  const restored=await app.call('/daily-notes/'+DAY+'/restore?category=work',{method:'POST',body:{version:2,save_id:randomUUID()}});
  assert.equal(restored.status,200);assert.equal(restored.data.text,'独立工作');
  assert.equal((await app.call('/daily-notes?category=invalid')).status,400);
  assert.equal((await app.call('/daily-notes?category=work&category=life')).status,400);
  const badOrigin=await worker.fetch(new Request('https://other.invalid/api/v1/daily-notes/'+DAY+'?category=work',{
    method:'PUT',headers:{Origin:'https://other.invalid','Content-Type':'application/json','X-Public-Business':'1'},
    body:JSON.stringify({text:'跨站不得写',version:3,save_id:randomUUID()})}),app.env);
  assert.equal(badOrigin.status,403);assert.equal((await app.call('/daily-notes?date='+DAY)).data.version,1);
});
test('legacy snapshot v1 stays unchanged while explicit v2 includes work and work-only dates',async t=>{
  const app=await setup(t);
  await app.call('/daily-notes/'+DAY,{method:'PUT',body:{version:0,save_id:randomUUID(),text:'生活记录'}});
  const before=await app.call('/snapshot?date='+DAY);assert.equal(before.status,200);
  await app.call('/daily-notes/'+DAY+'?category=work',{method:'PUT',body:{version:0,save_id:randomUUID(),text:'工作记录'}});
  await app.call('/daily-notes/2026-10-24?category=work',{method:'PUT',body:{version:0,save_id:randomUUID(),text:'只有工作'}});
  const legacy=await app.call('/snapshot?date='+DAY);assert.equal(legacy.data.content_hash,before.data.content_hash);
  assert.equal(legacy.data.snapshot_format,'haoduoyu-daily-snapshot-v1');assert.equal(legacy.data.data.work_notes,undefined);
  const full=await app.call('/snapshot?date='+DAY+'&notes=all');assert.equal(full.status,200);
  assert.equal(full.data.snapshot_format,'haoduoyu-daily-snapshot-v2');
  assert.equal(full.data.data.notes[0].text,'生活记录');assert.equal(full.data.data.work_notes[0].text,'工作记录');
  assert.notEqual(full.data.content_hash,legacy.data.content_hash);
  const index=await app.call('/snapshot/index?notes=all');assert.equal(index.data.snapshot_format,'haoduoyu-daily-snapshot-index-v2');
  assert.ok(index.data.dates.some(row=>row.date==='2026-10-24'));
  assert.ok(!(await app.call('/snapshot/index')).data.dates.some(row=>row.date==='2026-10-24'));
});
test('v8 backups preserve work and tombstones, accept old v7 into empty targets and reject nonempty targets',async t=>{
  const app=await setup(t);
  await app.call('/daily-notes/'+DAY,{method:'PUT',body:{version:0,save_id:randomUUID(),text:'旧生活'}});
  await app.call('/daily-notes/'+DAY+'?category=work',{method:'PUT',body:{version:0,save_id:randomUUID(),text:'工作备份'}});
  await app.call('/daily-notes/'+DAY+'?category=work',{method:'DELETE',body:{version:1,save_id:randomUUID()}});
  const other=randomUUID();
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,created_at FROM matrix_users WHERE id=?')
    .bind(other,'synthetic-other-work-owner',app.owner).run();
  await app.db.prepare('INSERT INTO matrix_daily_work_notes(user_id,date,text,version,change_seq,created_at,updated_at,deleted_at) SELECT ?,date,?,version,change_seq,created_at,updated_at,deleted_at FROM matrix_daily_work_notes WHERE user_id=?')
    .bind(other,'other owner canary',app.owner).run();
  const scoped=await exportBackup(app.db,{todoUserId:app.owner});
  assert.equal(scoped.data.tables.daily_work_notes.length,1);assert.equal(scoped.data.tables.daily_work_notes[0].user_id,app.owner);
  const hidden=await app.call('/daily-notes?date='+DAY+'&category=work');
  assert.equal(hidden.data.text,'');assert.equal(hidden.data.deleted,true);
  const backup=await exportBackup(app.db);assert.equal(backup.data.format,'haoduoyu-matrix-d1-v8');
  assert.equal(backup.data.tables.daily_work_notes.length,2);assert.ok(backup.data.tables.daily_work_notes.every(row=>row.deleted_at));
  const empty=await fixture(t,{bootstrap:false});await restoreIntoEmptyDatabase(empty.db,backup,{allowEmptyRestore:true});
  assert.deepEqual((await empty.db.prepare('SELECT * FROM matrix_daily_work_notes').all()).results,backup.data.tables.daily_work_notes);
  const data=structuredClone(backup.data);data.format='haoduoyu-matrix-d1-v7';delete data.tables.daily_work_notes;
  const legacy={data,sha256:digest(JSON.stringify(stable(data)))},target=await fixture(t,{bootstrap:false});
  await restoreIntoEmptyDatabase(target.db,legacy,{allowEmptyRestore:true});
  assert.equal((await target.db.prepare('SELECT count(*) AS n FROM matrix_daily_work_notes').first()).n,0);
  await assert.rejects(restoreIntoEmptyDatabase(empty.db,legacy,{allowEmptyRestore:true}),error=>error.code==='RESTORE_NOT_EMPTY');
});
