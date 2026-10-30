import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {exportBackup,restoreIntoEmptyDatabase} from '../src/backup.mjs';
import {digest,stable} from '../src/security.mjs';
import {ARTICLE_PIPELINE_FIELDS} from '../src/article-pipeline-fields.mjs';
import {applyLocalSchemaMigrations} from '../scripts/migration-contract.mjs';
import {createSourceInventory,verifyBackupInventory,verifyRestoredInventory} from '../scripts/migration-inventory.mjs';

const stamp='2026-10-25T01:02:03.000Z';
const sign=data=>({data,sha256:digest(JSON.stringify(stable(data)))});
const rows=async(db,name)=>(await db.prepare('SELECT * FROM matrix_'+name+' ORDER BY rowid').all()).results;
async function database(t,{through=Infinity}={}) {
  const runtime=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
  const mf=new Miniflare({modules:true,cf:false,script:'export default {fetch(){return new Response(null,{status:404})}}',
    compatibilityDate:runtime.compatibility_date,compatibilityFlags:runtime.compatibility_flags,
    d1Databases:['DB'],d1Persist:false,outboundService:()=>new Response(null,{status:502})});
  t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');await applyLocalSchemaMigrations(db,{through});return db;
}
async function seed(db,{memos=true}={}) {
  const owner=randomUUID(),other=randomUUID(),group=randomUUID(),note=randomUUID(),deletedNote=randomUUID();
  await db.prepare('INSERT INTO matrix_control(id,initialized,revision) VALUES(1,1,99)').run();
  for(const [user,name] of [[owner,'synthetic-owner'],[other,'synthetic-other']]) {
    await db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)')
      .bind(user,name,'SYNTHETIC-LOCAL-HASH',stamp).run();
    await db.prepare('INSERT INTO matrix_todos(user_id,id,date,text,completed,version,created_at,updated_at,deleted_at) VALUES(?,?,?,?,1,4,?,?,?)')
      .bind(user,randomUUID(),'2026-10-24','合成旧待办',stamp,stamp,stamp).run();
    await db.prepare('INSERT INTO matrix_daily_notes(user_id,date,text,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,3,75,?,?,?)')
      .bind(user,'2026-10-24','合成旧碎碎念',stamp,stamp,stamp).run();
    if(!memos)continue;
    await db.prepare('INSERT INTO matrix_memo_groups(user_id,id,title,position,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,0,5,80,?,?,?)')
      .bind(user,group,'合成分组',stamp,stamp,user===owner?stamp:null).run();
    for(const [id,deleted] of [[note,null],[deletedNote,stamp]])
      await db.prepare('INSERT INTO matrix_memo_notes(user_id,id,group_id,title,body,position,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,0,4,79,?,?,?)')
        .bind(user,id,group,'合成笔记',user===owner?'合成正文 <script>plain text</script>':'OTHER-MEMO-CANARY',stamp,stamp,deleted).run();
  }
  await db.prepare('INSERT INTO matrix_idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,200,?)')
    .bind('user:'+owner,'memo:'+randomUUID(),digest('synthetic-request'),JSON.stringify({kind:'notes',id:note,version:4}),stamp).run();
  return {owner,other,group,note,deletedNote};
}
function historical(input,version) {
  const data=structuredClone(input);data.format='haoduoyu-matrix-d1-v'+version;
  for(const [introduced,name] of [[14,'ai_reports'],[13,'note_label_archives'],[12,'note_entry_label_sets'],[11,'note_entry_label_overrides']]) {
    if(version<introduced) { assert.deepEqual(data.tables[name],[],'historical fixture cannot hide new data: '+name);delete data.tables[name]; }
  }
  if(version<10)for(const name of ['unscheduled_todos','note_labels','note_entry_labels']) {
    assert.deepEqual(data.tables[name],[],'historical fixture cannot hide new data: '+name);delete data.tables[name];
  }
  if(version<9)for(const name of ['note_entries','work_reminders','account_profiles']) {
    assert.deepEqual(data.tables[name],[],'historical fixture cannot hide workbench data: '+name);delete data.tables[name];
  }
  if(version<8)delete data.tables.daily_work_notes;
  if(version<7){delete data.tables.memo_groups;delete data.tables.memo_notes;}
  if(version<6)for(const row of data.tables.articles)for(const name of ARTICLE_PIPELINE_FIELDS)delete row[name];
  if(version<5){delete data.source_revision;delete data.tables.daily_notes;}
  if(version<4) {
    delete data.tables.todo_preferences;
    for(const row of data.tables.todos)delete row.deleted_at;
    for(const row of data.tables.todo_template_links)delete row.created_with_todo;
  }
  if(version<3){delete data.tables.todo_templates;delete data.tables.todo_template_links;}
  if(version<2)delete data.tables.todos;
  return data;
}

test('0006 adds exactly two memo tables without changing any prior schema/data and generated snapshot preserves all previous tables',async t=>{
  const db=await database(t,{through:6});await seed(db,{memos:false});
  const before=await createSourceInventory(db);
  const catalog=(await db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name LIKE 'matrix_%' ORDER BY name").all()).results;
  await applyLocalSchemaMigrations(db,{through:7});
  const after=await createSourceInventory(db);
  assert.equal(Object.keys(after.tables).length,18);
  for(const [name,value] of Object.entries(before.tables))assert.deepEqual(after.tables[name],value,name);
  const kept=(await db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name LIKE 'matrix_%' AND name NOT LIKE 'matrix_memo_%' ORDER BY name").all()).results;
  assert.deepEqual(kept,catalog);
  const previous=JSON.parse(await readFile(new URL('../drizzle/meta/0005_snapshot.json',import.meta.url),'utf8'));
  const current=JSON.parse(await readFile(new URL('../drizzle/meta/0006_snapshot.json',import.meta.url),'utf8'));
  assert.equal(current.prevId,previous.id);assert.equal(Object.keys(current.tables).length,18);
  for(const [name,table] of Object.entries(previous.tables))assert.deepEqual(current.tables[name],table,name);
  const prior=await readFile(new URL('../drizzle/0005_article_pipeline.sql',import.meta.url));
  assert.equal(createHash('sha256').update(prior).digest('hex'),'b45a31900d6b7153a423b8c7fa870b0a98da3e5b074b6d6f62ac044f7782a2ba');
});

test('v7 scopes memos by owner and restores hidden children, independent tombstones, receipts and high-water mark exactly',async t=>{
  const db=await database(t),{owner}=await seed(db);
  const full=await exportBackup(db),scoped=await exportBackup(db,{todoUserId:owner});
  assert.equal(full.data.format,'haoduoyu-matrix-d1-v14');assert.equal(Object.keys(full.data.tables).length,26);
  assert.equal(scoped.data.tables.memo_groups.length,1);assert.equal(scoped.data.tables.memo_notes.length,2);
  assert.ok(!JSON.stringify([scoped.data.tables.memo_groups,scoped.data.tables.memo_notes]).includes('OTHER-MEMO-CANARY'));
  assert.ok(scoped.data.tables.memo_groups[0].deleted_at);
  assert.equal(scoped.data.tables.memo_notes.filter(row=>row.deleted_at===null).length,1);
  const inventory=await createSourceInventory(db),target=await database(t);
  assert.throws(()=>verifyBackupInventory(scoped,inventory),/MIGRATION_INVENTORY_MISMATCH/);
  await restoreIntoEmptyDatabase(target,full,{allowEmptyRestore:true});
  assert.deepEqual(await verifyRestoredInventory(target,full,inventory),{verified:true,restored_tables:26,reset_tables:3});
  for(const name of ['memo_groups','memo_notes','todos','daily_notes','idempotency'])
    assert.deepEqual(await rows(target,name),await rows(db,name),name);
  assert.equal((await target.prepare('SELECT revision FROM matrix_control').first()).revision,100);
  await assert.rejects(restoreIntoEmptyDatabase(target,full,{allowEmptyRestore:true}),e=>e.code==='RESTORE_NOT_EMPTY');
});

test('all v1-v6 backups restore into upgraded empty schema with no invented memos and original todo/notes deletion semantics',async t=>{
  const db=await database(t);await seed(db);const full=await exportBackup(db);
  for(const version of [1,2,3,4,5,6]) {
    const data=historical(full.data,version),before=structuredClone(data),target=await database(t);
    await restoreIntoEmptyDatabase(target,sign(data),{allowEmptyRestore:true});
    assert.deepEqual(await rows(target,'memo_groups'),[]);assert.deepEqual(await rows(target,'memo_notes'),[]);
    assert.deepEqual(data,before);
    const todos=await rows(target,'todos'),notes=await rows(target,'daily_notes');
    assert.equal(todos.length,version>=2?2:0);assert.ok(todos.every(row=>row.deleted_at===(version>=4?stamp:null)));
    assert.equal(notes.length,version>=5?2:0);assert.ok(notes.every(row=>row.deleted_at===stamp));
    assert.equal((await target.prepare('SELECT revision FROM matrix_control').first()).revision,version>=5?100:2);
  }
});

test('v7 validates ownership, two-level linkage, duplicate IDs, counters, lengths and quotas before any restore writes',async t=>{
  const db=await database(t);await seed(db);const full=await exportBackup(db),target=await database(t);
  const changes=[
    data=>data.tables.memo_notes[0].group_id=randomUUID(),
    data=>data.tables.memo_notes[0].user_id=randomUUID(),
    data=>data.tables.memo_notes[0].id='invalid',
    data=>data.tables.memo_notes[0].body='x'.repeat(65537),
    data=>data.tables.memo_notes[0].body='\u0000',
    data=>data.tables.memo_notes[0].title='x'.repeat(121),
    data=>data.tables.memo_groups[0].title='\n',
    data=>data.tables.memo_notes[0].version=0,
    data=>data.tables.memo_notes[0].position=1000001,
    data=>data.tables.memo_notes[0].change_seq=100,
    data=>data.tables.memo_notes[0].updated_at='2026-02-30T00:00:00.000Z',
    data=>data.tables.memo_groups[0].parent_id=randomUUID(),
    data=>data.tables.memo_notes.push(structuredClone(data.tables.memo_notes[0])),
    data=>{for(let i=0;i<32;i++)data.tables.memo_groups.push({...data.tables.memo_groups[0],id:randomUUID()});},
    data=>{for(let i=0;i<200;i++)data.tables.memo_notes.push({...data.tables.memo_notes[0],id:randomUUID()});},
  ];
  for(const change of changes) {
    const data=structuredClone(full.data);change(data);
    await assert.rejects(restoreIntoEmptyDatabase(target,sign(data),{allowEmptyRestore:true}),e=>e.code==='INVALID_BACKUP');
  }
  assert.deepEqual(await rows(target,'users'),[]);assert.deepEqual(await rows(target,'control'),[]);
});

test('all formats refuse nonempty memo tables before writing and composite foreign key prevents cross-owner notes',async t=>{
  const db=await database(t),{owner,other,group}=await seed(db),full=await exportBackup(db);
  for(const version of [1,2,3,4,5,6,7])for(const name of ['memo_groups','memo_notes']) {
    let writes=0;
    const target={prepare(sql){
      if(sql.startsWith('SELECT count(*) AS n FROM '))return {bind(){return this;},async first(){return {n:sql.endsWith('matrix_'+name)?1:0};}};
      writes++;throw Error('must reject before writing');
    }};
    await assert.rejects(restoreIntoEmptyDatabase(target,sign(historical(full.data,version)),{allowEmptyRestore:true}),e=>e.code==='RESTORE_NOT_EMPTY');
    assert.equal(writes,0);
  }
  const exclusive=randomUUID();
  await db.prepare('INSERT INTO matrix_memo_groups(user_id,id,title,position,version,change_seq,created_at,updated_at) VALUES(?,?,?,0,1,99,?,?)')
    .bind(owner,exclusive,'合成独有分组',stamp,stamp).run();
  await assert.rejects(db.prepare('INSERT INTO matrix_memo_notes(user_id,id,group_id,title,body,position,version,change_seq,created_at,updated_at) VALUES(?,?,?,?,?,0,1,99,?,?)')
    .bind(other,randomUUID(),exclusive,'合成越权笔记','',stamp,stamp).run(),/FOREIGN KEY constraint failed/);
  assert.ok(group);
});

test('v6 source inventory and backup remain verifiable after isolated restore into memo-enabled schema',async t=>{
  const old=await database(t,{through:6});await seed(old,{memos:false});const inventory=await createSourceInventory(old);
  await applyLocalSchemaMigrations(old);const full=await exportBackup(old),v6=sign(historical(full.data,6));
  assert.deepEqual(verifyBackupInventory(v6,inventory),{verified:true,restored_tables:13,reset_tables:3});
  const target=await database(t);await restoreIntoEmptyDatabase(target,v6,{allowEmptyRestore:true});
  await verifyRestoredInventory(target,v6,inventory);
});
