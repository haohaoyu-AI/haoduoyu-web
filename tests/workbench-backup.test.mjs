import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {exportBackup,restoreIntoEmptyDatabase} from '../src/backup.mjs';
import {digest,stable} from '../src/security.mjs';
import {applyLocalSchemaMigrations} from '../scripts/migration-contract.mjs';
import {createSourceInventory,verifyBackupInventory,verifyRestoredInventory} from '../scripts/migration-inventory.mjs';
import {ARTICLE_PIPELINE_FIELDS} from '../src/article-pipeline-fields.mjs';

const stamp='2026-10-25T01:02:03.000Z';
const newTables=['note_entries','work_reminders','account_profiles'];
const sign=data=>({data,sha256:digest(JSON.stringify(stable(data)))});
const rows=async(db,name)=>(await db.prepare('SELECT * FROM matrix_'+name+' ORDER BY rowid').all()).results;
async function database(t,{through=Infinity}={}) {
  const runtime=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
  const mf=new Miniflare({modules:true,cf:false,script:'export default {fetch(){return new Response(null,{status:404})}}',
    compatibilityDate:runtime.compatibility_date,compatibilityFlags:runtime.compatibility_flags,
    d1Databases:['DB'],d1Persist:false,outboundService:()=>new Response(null,{status:502})});
  t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');await applyLocalSchemaMigrations(db,{through});return db;
}
async function seedOld(db) {
  const owner=randomUUID(),other=randomUUID(),todo=randomUUID(),template=randomUUID(),group=randomUUID();
  const bind=(sql,...values)=>db.prepare(sql).bind(...values);
  await db.batch([
    bind('INSERT INTO matrix_control(id,initialized,revision) VALUES(1,1,99)'),
    bind('INSERT INTO matrix_accounts VALUES(?,?,?,?,?)','synthetic-account','zhihu','合成账号',1,stamp),
    ...[[owner,'owner'],[other,'other']].map(([id,name])=>bind('INSERT INTO matrix_users VALUES(?,?,?,?)',id,'synthetic-'+name,'LOCAL-HASH',stamp)),
    bind('INSERT INTO matrix_todos(user_id,id,date,text,completed,version,created_at,updated_at,deleted_at) VALUES(?,?,?,?,1,3,?,?,?)',
      owner,todo,'2026-10-24','合成旧待办',stamp,stamp,stamp),
    bind('INSERT INTO matrix_todo_templates(user_id,id,text,version,created_at,updated_at,deleted_at) VALUES(?,?,?,3,?,?,?)',
      owner,template,'合成旧模板',stamp,stamp,stamp),
    bind('INSERT INTO matrix_todo_template_links VALUES(?,?,?,0)',owner,todo,template),
    bind('INSERT INTO matrix_todo_preferences VALUES(?,?,?,?)',owner,'hide',3,stamp),
    ...['daily_notes','daily_work_notes'].map(name=>bind('INSERT INTO matrix_'+name+' VALUES(?,?,?,3,75,?,?,?)',
      owner,'2026-10-24','合成旧逐日记录',stamp,stamp,stamp)),
    bind('INSERT INTO matrix_articles(id,account_id,title,url,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
      'synthetic-article','synthetic-account','合成旧文章','https://example.invalid/article',stamp,stamp,stamp),
    bind('INSERT INTO matrix_observations(id,article_id,as_of,collected_at,kind,metrics_json,source,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
      'synthetic-observation','synthetic-article',stamp,stamp,'latest','{"reads":0}','合成来源','合成快照',stamp),
    bind('INSERT INTO matrix_daily_metrics VALUES(?,?,?,?,?,?,?)',
      'synthetic-daily','synthetic-account',null,'2026-10-24','{"reads":0}','合成来源',stamp),
    bind('INSERT INTO matrix_api_keys(id,name,token_hash,account_ids_json,permissions_json,created_at) VALUES(?,?,?,?,?,?)',
      'synthetic-key','合成凭证','LOCAL-TOKEN-HASH','["synthetic-account"]','["read"]',stamp),
    bind('INSERT INTO matrix_audit VALUES(?,?,?,?,?,?)','synthetic-audit','user:'+owner,'article.create','synthetic-article','{}',stamp),
    bind('INSERT INTO matrix_idempotency VALUES(?,?,?,?,?,?)','user:'+owner,'synthetic-save',digest('request'),'{}',200,stamp),
    bind('INSERT INTO matrix_memo_groups VALUES(?,?,?,0,3,80,?,?,?)',owner,group,'合成旧分组',stamp,stamp,stamp),
    bind('INSERT INTO matrix_memo_notes VALUES(?,?,?,?,?,0,3,80,?,?,?)',owner,randomUUID(),group,'合成旧笔记','合成正文',stamp,stamp,stamp),
    bind('INSERT INTO matrix_sessions VALUES(?,?,?)','LOCAL-SESSION-HASH',owner,'2027-10-25T01:02:03.000Z'),
    bind('INSERT INTO matrix_login_attempts VALUES(?,?,?)','synthetic-bucket',1,123),
  ]);
  return {owner,other};
}
async function seedWorkbench(db,{owner,other}) {
  const note=randomUUID(),reminder=randomUUID();
  const bind=(sql,...values)=>db.prepare(sql).bind(...values);
  await db.batch([
    ...[[owner,'合成多条碎碎念'],[other,'OTHER-WORKBENCH-CANARY']].flatMap(([user,text])=>[
      bind('INSERT INTO matrix_note_entries VALUES(?,?,?,?,?,3,90,?,?,?)',user,note,'work','2026-10-24',text,stamp,stamp,null),
      bind('INSERT INTO matrix_note_entries VALUES(?,?,?,?,?,4,91,?,?,?)',user,randomUUID(),'life','2026-10-24','合成已删记录',stamp,stamp,stamp),
      bind('INSERT INTO matrix_work_reminders VALUES(?,?,?,?,?,3,92,?,?,?)',user,reminder,'2026-10-24','manual:'+reminder,text,stamp,stamp,null),
      bind('INSERT INTO matrix_work_reminders VALUES(?,?,?,?,?,4,93,?,?,?)',user,randomUUID(),'2026-10-24','deleted:'+reminder,'合成已删提醒',stamp,stamp,stamp),
    ]),
    bind('INSERT INTO matrix_account_profiles VALUES(?,?,?,?,?)','synthetic-account',
      'https://www.zhihu.com/people/synthetic-account','zhihu:people:synthetic-account',stamp,stamp),
  ]);
}
function v8Data(input) {
  const data=structuredClone(input);data.format='haoduoyu-matrix-d1-v8';
  for(const name of ['unscheduled_todos','note_labels','note_entry_labels','note_entry_label_overrides','note_entry_label_sets','note_label_archives']) {
    assert.deepEqual(data.tables[name],[],'historical fixture cannot hide new data: '+name);delete data.tables[name];
  }
  for(const name of newTables)delete data.tables[name];
  return data;
}
function historical(input,version) {
  const data=v8Data(input);data.format='haoduoyu-matrix-d1-v'+version;
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

test('0008 migration adds exactly three tables and preserves all nineteen prior tables, schemas and rows',async t=>{
  const db=await database(t,{through:8});await seedOld(db);
  const before=await createSourceInventory(db);
  assert.equal(Object.keys(before.tables).length,19);
  const sql="SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name LIKE 'matrix_%'";
  const catalog=(await db.prepare(sql+' ORDER BY type,name').all()).results;
  await applyLocalSchemaMigrations(db,{through:9});
  const after=await createSourceInventory(db);
  assert.equal(Object.keys(after.tables).length,22);
  for(const [name,value] of Object.entries(before.tables))assert.deepEqual(after.tables[name],value,name);
  const kept=(await db.prepare(sql+" AND tbl_name NOT IN ('matrix_note_entries','matrix_work_reminders','matrix_account_profiles') ORDER BY type,name").all()).results;
  assert.deepEqual(kept,catalog);
  const previous=JSON.parse(await readFile(new URL('../drizzle/meta/0007_snapshot.json',import.meta.url),'utf8'));
  const current=JSON.parse(await readFile(new URL('../drizzle/meta/0008_snapshot.json',import.meta.url),'utf8'));
  assert.equal(current.prevId,previous.id);assert.equal(Object.keys(current.tables).length,22);
  for(const [name,table] of Object.entries(previous.tables))assert.deepEqual(current.tables[name],table,name);
});

test('v10 exports owner-scoped entries and reminders and restores complete data, tombstones and the high-water mark',async t=>{
  const db=await database(t),users=await seedOld(db);await seedWorkbench(db,users);
  const full=await exportBackup(db),scoped=await exportBackup(db,{todoUserId:users.owner});
  assert.equal(full.data.format,'haoduoyu-matrix-d1-v13');assert.equal(Object.keys(full.data.tables).length,25);
  for(const name of ['note_entries','work_reminders']) {
    assert.equal(full.data.tables[name].length,4);assert.equal(scoped.data.tables[name].length,2);
    assert.ok(scoped.data.tables[name].some(row=>row.deleted_at===stamp));
    assert.ok(!JSON.stringify(scoped.data.tables[name]).includes('OTHER-WORKBENCH-CANARY'));
  }
  const inventory=await createSourceInventory(db),target=await database(t);
  assert.throws(()=>verifyBackupInventory(scoped,inventory),/MIGRATION_INVENTORY_MISMATCH/);
  await restoreIntoEmptyDatabase(target,full,{allowEmptyRestore:true});
  assert.deepEqual(await verifyRestoredInventory(target,full,inventory),{verified:true,restored_tables:25,reset_tables:3});
  for(const name of Object.keys(full.data.tables))assert.deepEqual(await rows(target,name),await rows(db,name),name);
  assert.equal((await target.prepare('SELECT revision FROM matrix_control').first()).revision,100);
  assert.deepEqual(await rows(target,'sessions'),[]);assert.deepEqual(await rows(target,'login_attempts'),[]);
});

test('v8 backup inventory remains exact and restores into the new empty schema with no invented workbench rows',async t=>{
  const source=await database(t,{through:8});await seedOld(source);const inventory=await createSourceInventory(source);
  await applyLocalSchemaMigrations(source);
  const backup=sign(v8Data((await exportBackup(source)).data)),before=structuredClone(backup),target=await database(t);
  assert.deepEqual(verifyBackupInventory(backup,inventory),{verified:true,restored_tables:16,reset_tables:3});
  const result=await restoreIntoEmptyDatabase(target,backup,{allowEmptyRestore:true});
  await verifyRestoredInventory(target,backup,inventory);
  for(const name of newTables){assert.deepEqual(await rows(target,name),[]);assert.equal(result.counts[name],0);}
  assert.deepEqual(backup,before);
});

test('v1-v7 formats still restore their exact historical data into an empty current database',async t=>{
  const source=await database(t);await seedOld(source);const full=await exportBackup(source);
  for(const version of [1,2,3,4,5,6,7]) {
    const data=historical(full.data,version),before=structuredClone(data),target=await database(t);
    await restoreIntoEmptyDatabase(target,sign(data),{allowEmptyRestore:true});
    for(const name of newTables)assert.deepEqual(await rows(target,name),[]);
    assert.equal((await rows(target,'articles')).length,1);
    assert.equal((await rows(target,'accounts')).length,1);
    assert.equal((await target.prepare('SELECT revision FROM matrix_control').first()).revision,version>=5?100:2);
    assert.deepEqual(data,before);
  }
});

test('v9 rejects malformed records, ownership, duplicate identities, counters, unsafe profile URLs and quotas before writes',async t=>{
  const source=await database(t),users=await seedOld(source);await seedWorkbench(source,users);
  const full=await exportBackup(source),target=await database(t);
  const changes=[
    data=>data.tables.note_entries[0].id='invalid',
    data=>data.tables.note_entries[0].user_id=randomUUID(),
    data=>data.tables.note_entries[0].category='secret',
    data=>data.tables.note_entries[0].date='2026-02-30',
    data=>data.tables.note_entries[0].version=0,
    data=>data.tables.note_entries[0].change_seq=100,
    data=>data.tables.note_entries[0].updated_at='2026-02-30T00:00:00.000Z',
    data=>data.tables.note_entries[0].text='\u0000',
    data=>data.tables.note_entries[0].text='x'.repeat(65537),
    data=>data.tables.note_entries.push({...data.tables.note_entries[0]}),
    data=>data.tables.work_reminders[0].summary='x'.repeat(16385),
    data=>data.tables.work_reminders[0].source_key='secret\nkey',
    data=>data.tables.work_reminders[0].deleted_at='bad',
    data=>data.tables.work_reminders.push({...data.tables.work_reminders[0],id:randomUUID()}),
    data=>data.tables.account_profiles[0].profile_url='javascript:alert(1)',
    data=>data.tables.account_profiles[0].profile_url='https://evil.invalid/profile',
    data=>data.tables.account_profiles[0].profile_url+='?session=private',
    data=>data.tables.account_profiles[0].platform_identity='zhihu:people:wrong-account',
    data=>data.tables.account_profiles[0].account_id='unowned',
    data=>data.tables.account_profiles.push({...data.tables.account_profiles[0]}),
    data=>{for(let i=0;i<200;i++)data.tables.note_entries.push({...data.tables.note_entries[0],id:randomUUID()});},
    data=>{for(let i=0;i<100;i++)data.tables.work_reminders.push({...data.tables.work_reminders[0],id:randomUUID(),source_key:'synthetic-'+i});},
  ];
  for(const change of changes) {
    const data=structuredClone(full.data);change(data);
    await assert.rejects(restoreIntoEmptyDatabase(target,sign(data),{allowEmptyRestore:true}),error=>error.code==='INVALID_BACKUP');
  }
  assert.deepEqual(await rows(target,'users'),[]);assert.deepEqual(await rows(target,'control'),[]);
});

test('both v8 and v9 refuse populated new tables before any restore writes',async t=>{
  const source=await database(t);await seedOld(source);const full=await exportBackup(source);
  for(const data of [full.data,v8Data(full.data)])for(const name of newTables) {
    let writes=0;
    const target={prepare(sql){
      if(sql.startsWith('SELECT count(*) AS n FROM '))return {bind(){return this;},async first(){return {n:sql.endsWith('matrix_'+name)?1:0};}};
      writes++;throw Error('restore should reject before writing');
    }};
    await assert.rejects(restoreIntoEmptyDatabase(target,sign(data),{allowEmptyRestore:true}),error=>error.code==='RESTORE_NOT_EMPTY');
    assert.equal(writes,0);
  }
});
