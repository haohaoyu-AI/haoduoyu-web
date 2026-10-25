import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {exportBackup,restoreIntoEmptyDatabase} from '../src/backup.mjs';
import {digest,stable} from '../src/security.mjs';
import {createSourceInventory,verifyBackupInventory,verifyRestoredInventory} from '../scripts/migration-inventory.mjs';

const sign=data=>({data,sha256:digest(JSON.stringify(stable(data)))});
const stamp='2026-10-24T01:02:03.000Z';
const rows=async(db,name)=>(await db.prepare('SELECT * FROM matrix_'+name+' ORDER BY rowid').all()).results;
async function apply(db,index) {
  const journal=JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  const sql=await readFile(new URL('../drizzle/'+journal.entries[index].tag+'.sql',import.meta.url),'utf8');
  await db.batch(sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
}
async function database(t,{through=5}={}) {
  const runtime=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
  const mf=new Miniflare({modules:true,cf:false,script:'export default {fetch(){return new Response(null,{status:404})}}',
    compatibilityDate:runtime.compatibility_date,compatibilityFlags:runtime.compatibility_flags,
    d1Databases:['DB'],d1Persist:false,outboundService:()=>new Response(null,{status:502})});
  t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB');
  for(let index=0;index<through;index++)await apply(db,index);
  return db;
}
async function seed(db,{notes=true}={}) {
  const owner=randomUUID(),other=randomUUID(),todo=randomUUID(),template=randomUUID();
  for(const [id,name] of [[owner,'synthetic-owner'],[other,'synthetic-other']])
    await db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)')
      .bind(id,name,'synthetic-password-hash-canary',stamp).run();
  await db.batch([
    db.prepare('INSERT INTO matrix_control(id,initialized,revision) VALUES(1,1,19)'),
    db.prepare('INSERT INTO matrix_todos(user_id,id,date,text,completed,version,created_at,updated_at,deleted_at) VALUES(?,?,?,?,1,3,?,?,?)')
      .bind(owner,todo,'2026-10-23','合成历史待办',stamp,stamp,stamp),
    db.prepare('INSERT INTO matrix_todo_templates(user_id,id,text,version,created_at,updated_at) VALUES(?,?,?,2,?,?)')
      .bind(owner,template,'合成历史模板',stamp,stamp),
    db.prepare('INSERT INTO matrix_todo_template_links(user_id,todo_id,template_id,created_with_todo) VALUES(?,?,?,0)')
      .bind(owner,todo,template),
    db.prepare('INSERT INTO matrix_todo_preferences(user_id,completed_mode,version,updated_at) VALUES(?,?,2,?)')
      .bind(owner,'hide',stamp),
    db.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
      .bind('synthetic-session-hash',owner,'2099-01-01'),
    db.prepare('INSERT INTO matrix_login_attempts(bucket,attempts,window_start) VALUES(?,1,1)').bind('synthetic-bucket'),
  ]);
  if(notes)for(const [id,text,deleted] of [[owner,'<img src=x onerror=alert(1)> 合成笔记',stamp],[other,'OTHER-USER-NOTE-CANARY',null]])
    await db.prepare('INSERT INTO matrix_daily_notes(user_id,date,text,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,4,19,?,?,?)')
      .bind(id,'2026-10-24',text,stamp,stamp,deleted).run();
  return {owner,other,todo,template};
}
function historical(input,version) {
  const data=structuredClone(input);data.format='haoduoyu-matrix-d1-v'+version;
  delete data.source_revision;
  delete data.tables.daily_notes;
  if(version<4) {
    delete data.tables.todo_preferences;
    for(const row of data.tables.todos)delete row.deleted_at;
    for(const row of data.tables.todo_template_links)delete row.created_with_todo;
  }
  if(version<3){delete data.tables.todo_templates;delete data.tables.todo_template_links;}
  if(version<2)delete data.tables.todos;
  return data;
}

test('0004 is additive on an existing database and leaves every todo row/schema unchanged',async t=>{
  const db=await database(t,{through:4});await seed(db,{notes:false});
  const names=['todos','todo_templates','todo_template_links','todo_preferences'];
  const before=Object.fromEntries(await Promise.all(names.map(async n=>[n,await rows(db,n)])));
  const schemaBefore=(await db.prepare("SELECT name,sql FROM sqlite_schema WHERE name LIKE 'matrix_todo%' ORDER BY name").all()).results;
  await apply(db,4);
  for(const name of names)assert.deepEqual(await rows(db,name),before[name]);
  assert.deepEqual((await db.prepare("SELECT name,sql FROM sqlite_schema WHERE name LIKE 'matrix_todo%' ORDER BY name").all()).results,schemaBefore);
  assert.deepEqual(await rows(db,'daily_notes'),[]);
  const old=JSON.parse(await readFile(new URL('../drizzle/meta/0003_snapshot.json',import.meta.url),'utf8'));
  const current=JSON.parse(await readFile(new URL('../drizzle/meta/0004_snapshot.json',import.meta.url),'utf8'));
  for(const [name,value] of Object.entries(old.tables))assert.deepEqual(current.tables[name],value,name);
});

test('v5 scopes daily notes to the user while full operator backup preserves all users and tombstones',async t=>{
  const db=await database(t),{owner}=await seed(db);
  await db.batch([
    db.prepare('UPDATE matrix_control SET revision=99 WHERE id=1'),
    db.prepare('INSERT INTO matrix_idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,200,?)')
      .bind('synthetic-notion-notes','cursor',digest('synthetic'),'{"cursor":98}',stamp),
  ]);
  const scoped=await exportBackup(db,{todoUserId:owner}),full=await exportBackup(db);
  assert.equal(full.data.format,'haoduoyu-matrix-d1-v5');
  assert.equal(full.data.source_revision,99);
  assert.equal(Object.keys(full.data.tables).length,13);
  assert.equal(scoped.data.tables.daily_notes.length,1);assert.equal(scoped.data.tables.daily_notes[0].user_id,owner);
  assert.ok(!JSON.stringify(scoped.data.tables.daily_notes).includes('OTHER-USER-NOTE-CANARY'));
  assert.ok(scoped.data.tables.daily_notes[0].deleted_at);
  assert.equal(full.data.tables.daily_notes.length,2);
  const inventory=await createSourceInventory(db);
  assert.equal(Object.keys(inventory.tables).length,16);
  assert.throws(()=>verifyBackupInventory(scoped,inventory),/MIGRATION_INVENTORY_MISMATCH/);
  assert.deepEqual(verifyBackupInventory(full,inventory),{verified:true,restored_tables:13,reset_tables:3});
  const target=await database(t);
  const restored=await restoreIntoEmptyDatabase(target,full,{allowEmptyRestore:true});
  assert.equal(restored.counts.daily_notes,2);
  for(const name of ['daily_notes','todos','todo_templates','todo_template_links','todo_preferences'])
    assert.deepEqual(await rows(target,name),await rows(db,name));
  await verifyRestoredInventory(target,full,inventory);
  assert.deepEqual(await rows(target,'sessions'),[]);assert.deepEqual(await rows(target,'login_attempts'),[]);
  assert.equal((await target.prepare('SELECT initialized FROM matrix_control').first()).initialized,1);
  assert.equal((await target.prepare('SELECT revision FROM matrix_control').first()).revision,100);
  const nextSeq=(await target.prepare('SELECT revision+1 AS seq FROM matrix_control').first()).seq;
  assert.ok(nextSeq>Math.max(...full.data.tables.daily_notes.map(row=>row.change_seq)),'post-restore updates cannot fall behind old note cursors');
  const restoredCursor=JSON.parse((await target.prepare('SELECT response_json FROM matrix_idempotency WHERE actor=? AND key=?')
    .bind('synthetic-notion-notes','cursor').first()).response_json).cursor;
  assert.ok(nextSeq>restoredCursor,'the preserved cursor may be higher than every individual note change_seq');
  await target.prepare('UPDATE matrix_control SET revision=? WHERE id=1').bind(full.data.source_revision).run();
  await assert.rejects(verifyRestoredInventory(target,full,inventory),/MIGRATION_INVENTORY_MISMATCH/,
    'independent restoration verification rejects a cursor reset even when all persistent rows match');
});

test('v1-v4 restore into empty upgraded databases with no invented notes and exact historic todo semantics',async t=>{
  const db=await database(t);await seed(db);
  const full=await exportBackup(db),sourceTodos=await rows(db,'todos');
  for(const version of [1,2,3,4]) {
    const input=historical(full.data,version),before=structuredClone(input),target=await database(t);
    const result=await restoreIntoEmptyDatabase(target,sign(input),{allowEmptyRestore:true});
    assert.equal(result.counts.daily_notes,0);assert.deepEqual(await rows(target,'daily_notes'),[]);
    const expected=version===1?[]:version===4?sourceTodos:sourceTodos.map(row=>({...row,deleted_at:null}));
    assert.deepEqual(await rows(target,'todos'),expected);
    const links=await rows(target,'todo_template_links');
    assert.equal(links.length,version>=3?1:0);
    if(links.length)assert.equal(links[0].created_with_todo,version===4?0:1);
    assert.deepEqual(input,before,'restore does not mutate historical backup');
    assert.deepEqual((await target.prepare('PRAGMA foreign_key_check').all()).results,[]);
    assert.equal(Object.values((await target.prepare('PRAGMA quick_check').all()).results[0])[0],'ok');
  }
});

test('all versions refuse nonempty notes before writes; current format rejects missing/invalid note columns',async t=>{
  const db=await database(t);await seed(db);const full=await exportBackup(db);
  for(const version of [1,2,3,4,5]) {
    let writes=0,checks=0;
    const target={prepare(sql){
      if(sql.startsWith('SELECT count(*) AS n FROM '))return {bind(){return this;},async first(){
        if(sql.endsWith('matrix_daily_notes')){checks++;return {n:1};}return {n:0};
      }};
      writes++;throw Error('nonempty restore must not write');
    }};
    const data=version===5?full.data:historical(full.data,version);
    await assert.rejects(restoreIntoEmptyDatabase(target,sign(data),{allowEmptyRestore:true}),e=>e.code==='RESTORE_NOT_EMPTY');
    assert.equal(checks,1);assert.equal(writes,0);
  }
  const variants=[];
  const missing=structuredClone(full.data);delete missing.tables.daily_notes;variants.push(missing);
  for(const value of [undefined,-1,1.5,Number.MAX_SAFE_INTEGER-1,Number.MAX_SAFE_INTEGER]) {
    const invalid=structuredClone(full.data);invalid.source_revision=value;variants.push(invalid);
  }
  const tooEarly=structuredClone(full.data);tooEarly.source_revision=1;variants.push(tooEarly);
  for(const value of [0,-1,1.5])for(const key of ['version','change_seq']) {
    const invalid=structuredClone(full.data);invalid.tables.daily_notes[0][key]=value;variants.push(invalid);
  }
  const extra=structuredClone(full.data);extra.tables.daily_notes[0].password='synthetic';variants.push(extra);
  const target=await database(t);
  for(const data of variants)await assert.rejects(restoreIntoEmptyDatabase(target,sign(data),{allowEmptyRestore:true}),e=>e.code==='INVALID_BACKUP');
  const tampered=structuredClone(full);tampered.data.tables.daily_notes[0].text='changed';
  await assert.rejects(restoreIntoEmptyDatabase(target,tampered,{allowEmptyRestore:true}),e=>e.code==='INVALID_BACKUP');
  assert.deepEqual(await rows(target,'users'),[]);assert.deepEqual(await rows(target,'control'),[]);
});

test('foreign-key corruption remains fenced and notes constraints reject duplicate owner/date or nonpositive counters',async t=>{
  const db=await database(t),{owner}=await seed(db),full=await exportBackup(db);
  for(const [version,seq] of [[0,1],[1,0]])
    await assert.rejects(db.prepare('INSERT INTO matrix_daily_notes(user_id,date,text,version,change_seq,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .bind(owner,'2026-10-25','',version,seq,stamp,stamp).run(),/CHECK constraint failed/);
  await assert.rejects(db.prepare('INSERT INTO matrix_daily_notes(user_id,date,text,version,change_seq,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .bind(owner,'2026-10-24','duplicate',1,1,stamp,stamp).run(),/UNIQUE constraint failed/);
  const bad=structuredClone(full.data);bad.tables.daily_notes[0].user_id=randomUUID();
  const target=await database(t);
  await assert.rejects(restoreIntoEmptyDatabase(target,sign(bad),{allowEmptyRestore:true}),/FOREIGN KEY constraint failed/);
  assert.equal((await target.prepare('SELECT initialized FROM matrix_control').first()).initialized,2);
  await assert.rejects(restoreIntoEmptyDatabase(target,full,{allowEmptyRestore:true}),e=>e.code==='RESTORE_NOT_EMPTY');
});

test('largest supported revision rebases safely without overflowing the next note change cursor',async t=>{
  const db=await database(t);await seed(db);
  await db.prepare('UPDATE matrix_control SET revision=? WHERE id=1').bind(Number.MAX_SAFE_INTEGER-2).run();
  const backup=await exportBackup(db),inventory=await createSourceInventory(db),target=await database(t);
  verifyBackupInventory(backup,inventory);
  await restoreIntoEmptyDatabase(target,backup,{allowEmptyRestore:true});
  const row=await target.prepare('SELECT revision FROM matrix_control').first();
  assert.equal(row.revision,Number.MAX_SAFE_INTEGER-1);
  assert.equal(Number.isSafeInteger(row.revision+1),true);
  assert.equal(row.revision+1,Number.MAX_SAFE_INTEGER);
});
