import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {exportBackup,restoreIntoEmptyDatabase} from '../src/backup.mjs';
import {digest,stable} from '../src/security.mjs';
import {ARTICLE_PIPELINE_FIELDS,ARTICLE_PIPELINE_DEFAULTS,LEGACY_ARTICLE_PIPELINE_DEFAULTS} from '../src/article-pipeline-fields.mjs';
import {createSourceInventory,verifyBackupInventory,verifyRestoredInventory} from '../scripts/migration-inventory.mjs';
import {legacyBackupEnvelope} from './todo-backup-projection.mjs';
import {applyLocalSchemaMigrations} from '../scripts/migration-contract.mjs';

const stamp='2026-10-25T01:02:03.000Z';
// Independent historic contract: a newly added field must never leak into it.
const oldArticleFields=['id','account_id','title','url','platform_article_id','published_at','started_at','production_mode','summary','notes','version','created_at','updated_at'];
const sign=data=>({data,sha256:digest(JSON.stringify(stable(data)))});
const tableRows=async(db,name)=>(await db.prepare('SELECT * FROM matrix_'+name+' ORDER BY rowid').all()).results;
async function database(t,{through}={}) {
  const runtime=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
  const mf=new Miniflare({modules:true,cf:false,script:'export default {fetch(){return new Response(null,{status:404})}}',
    compatibilityDate:runtime.compatibility_date,compatibilityFlags:runtime.compatibility_flags,
    d1Databases:['DB'],d1Persist:false,outboundService:()=>new Response(null,{status:502})});
  t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB');
  await applyLocalSchemaMigrations(db,{through});
  return db;
}
async function seed(db,{pipeline=true}={}) {
  const owner=randomUUID(),other=randomUUID(),article=randomUUID(),todo=randomUUID(),template=randomUUID();
  for(const [id,name] of [[owner,'synthetic-owner'],[other,'synthetic-other']])
    await db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)')
      .bind(id,name,'SYNTHETIC-HASH',stamp).run();
  await db.batch([
    db.prepare('INSERT INTO matrix_control(id,initialized,revision) VALUES(1,1,99)'),
    db.prepare('INSERT INTO matrix_accounts(id,platform,name,active,created_at) VALUES(?,?,?,1,?)')
      .bind('synthetic-account','wechat','合成账号',stamp),
    db.prepare('INSERT INTO matrix_todos(user_id,id,date,text,completed,version,created_at,updated_at,deleted_at) VALUES(?,?,?,?,1,4,?,?,?)')
      .bind(owner,todo,'2026-10-24','合成旧待办',stamp,stamp,stamp),
    db.prepare('INSERT INTO matrix_todo_templates(user_id,id,text,version,created_at,updated_at) VALUES(?,?,?,2,?,?)')
      .bind(owner,template,'合成后补模板',stamp,stamp),
    db.prepare('INSERT INTO matrix_todo_template_links(user_id,todo_id,template_id,created_with_todo) VALUES(?,?,?,0)')
      .bind(owner,todo,template),
    db.prepare('INSERT INTO matrix_todo_preferences(user_id,completed_mode,version,updated_at) VALUES(?,?,2,?)')
      .bind(owner,'hide',stamp),
    db.prepare('INSERT INTO matrix_idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,200,?)')
      .bind('synthetic-notes-sync','cursor',digest('synthetic'),'{"cursor":98}',stamp),
    db.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
      .bind('SYNTHETIC-SESSION-HASH',owner,'2099-01-01'),
    db.prepare('INSERT INTO matrix_login_attempts(bucket,attempts,window_start) VALUES(?,1,1)').bind('synthetic-bucket'),
  ]);
  for(const [user,text,deleted] of [[owner,'合成软删笔记',stamp],[other,'OTHER-USER-NOTE-CANARY',null]])
    await db.prepare('INSERT INTO matrix_daily_notes(user_id,date,text,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,3,75,?,?,?)')
      .bind(user,'2026-10-24',text,stamp,stamp,deleted).run();
  const published={id:article,account_id:'synthetic-account',title:'合成已发布文章',url:'https://example.com/synthetic',
    platform_article_id:'synthetic-external-id',published_at:stamp,started_at:null,production_mode:'manual',
    summary:'合成概况',notes:'合成备注',version:4,created_at:stamp,updated_at:stamp,...LEGACY_ARTICLE_PIPELINE_DEFAULTS};
  const articles=[published];
  if(pipeline)articles.push({...published,...ARTICLE_PIPELINE_DEFAULTS,id:randomUUID(),url:null,platform_article_id:null,published_at:null,
    status:'draft_saved',slot:'gzh',run_dir:'2026-10-25/Batch_A/run-01',run_date:'2028-02-29',series_no:411,
    writer:'gemini_web',illustrator:'codex',char_count:0,subheading_count:2,image_count:3,cover_desc:'纯文字封面描述',
    sample_json:' {"unknown":{"arr":[1,true,null,{"未来字段":"保留"}]},"future_proto_lookalike":{"x":1}} ',
    draft_ref_json:'{"pgc_id":"7699934907375567402","appmsgid":"00000000000000000000001","draft":"synthetic-only","future":[]}',
    timings_json:' {"finished_at":"2026-10-25T09:00:00+08:00","nested":{"anything":false}} ',
    reruns_json:'{"watchdog":0,"more":{"nested":[1,2,3]}}',blockers_json:'[ {"type":"synthetic","future":[true,{"a":1}]} ]',verify_items_json:'[{"newKey":null}]'},
    {...published,...ARTICLE_PIPELINE_DEFAULTS,id:randomUUID(),url:null,platform_article_id:null,published_at:null});
  for(const row of articles) {
    const fields=Object.keys(row);
    await db.prepare(`INSERT INTO matrix_articles(${fields.join(',')}) VALUES(${fields.map(()=>'?').join(',')})`)
      .bind(...fields.map(key=>row[key])).run();
  }
  await db.batch([
    db.prepare('INSERT INTO matrix_observations(id,article_id,as_of,collected_at,kind,metrics_json,source,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(randomUUID(),article,stamp,stamp,'latest','{"reads":0}','synthetic','','2026-10-25T02:00:00.000Z'),
    db.prepare('INSERT INTO matrix_daily_metrics(id,account_id,article_id,date,metrics_json,source,updated_at) VALUES(?,?,?,?,?,?,?)')
      .bind(randomUUID(),'synthetic-account',article,'2026-10-25','{"reads":0}','synthetic',stamp),
  ]);
  return {owner,other,articles};
}
function historical(input,version) {
  const data=structuredClone(input);data.format='haoduoyu-matrix-d1-v'+version;
  if(version<7){delete data.tables.memo_groups;delete data.tables.memo_notes;}
  for(const row of data.tables.articles)for(const name of ARTICLE_PIPELINE_FIELDS)delete row[name];
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

test('v7 round-trips all pipeline fields, raw JSON, NULL status and existing related data',async t=>{
  const source=await database(t),{owner,articles}=await seed(source),before=await exportBackup(source);
  assert.equal(before.data.format,'haoduoyu-matrix-d1-v7');
  assert.equal(Object.keys(before.data.tables.articles[0]).length,oldArticleFields.length+17);
  const scoped=await exportBackup(source,{todoUserId:owner});
  assert.equal(scoped.data.tables.daily_notes.length,1);
  assert.ok(!JSON.stringify(scoped.data.tables.daily_notes).includes('OTHER-USER-NOTE-CANARY'));
  const inventory=await createSourceInventory(source),target=await database(t);
  assert.throws(()=>verifyBackupInventory(scoped,inventory),/MIGRATION_INVENTORY_MISMATCH/);
  await restoreIntoEmptyDatabase(target,before,{allowEmptyRestore:true});
  await verifyRestoredInventory(target,before,inventory);
  for(const name of Object.keys(before.data.tables))assert.deepEqual(await tableRows(target,name),await tableRows(source,name),name);
  const restored=await tableRows(target,'articles');
  assert.equal(restored[1].run_dir,articles[1].run_dir);
  for(const name of ['sample_json','draft_ref_json','timings_json','reruns_json','blockers_json','verify_items_json'])
    assert.equal(restored[1][name],articles[1][name],name+' is preserved byte-for-byte');
  assert.equal(restored[2].status,null,'v6 NULL status never silently becomes published');
  assert.deepEqual(await tableRows(target,'sessions'),[]);assert.deepEqual(await tableRows(target,'login_attempts'),[]);
  assert.equal((await target.prepare('SELECT revision FROM matrix_control').first()).revision,100);
});

test('v1-v5 restore original article columns and only missing pipeline fields receive legacy defaults',async t=>{
  const source=await database(t);await seed(source,{pipeline:false});
  const full=await exportBackup(source),original=full.data.tables.articles.map(row=>Object.fromEntries(oldArticleFields.map(name=>[name,row[name]])));
  for(const version of [1,2,3,4,5]) {
    const data=historical(full.data,version),copy=structuredClone(data),target=await database(t);
    assert.deepEqual(Object.keys(data.tables.articles[0]).sort(),[...oldArticleFields].sort());
    await restoreIntoEmptyDatabase(target,sign(data),{allowEmptyRestore:true});
    assert.deepEqual(await tableRows(target,'articles'),original.map(row=>({...row,...LEGACY_ARTICLE_PIPELINE_DEFAULTS})));
    assert.deepEqual(data,copy,'restore leaves the historical input unchanged');
    const todos=await tableRows(target,'todos'),links=await tableRows(target,'todo_template_links');
    assert.equal(todos.length,version>=2?1:0);
    if(todos.length)assert.equal(todos[0].deleted_at,version>=4?stamp:null);
    if(links.length)assert.equal(links[0].created_with_todo,version>=4?0:1);
    assert.equal((await tableRows(target,'daily_notes')).length,version===5?2:0);
    const revision=(await target.prepare('SELECT revision FROM matrix_control').first()).revision;
    assert.equal(revision,version===5?100:2);
    assert.ok(revision+1> (version===5?98:0),'v5 preserved sync cursor remains behind a future change');
    assert.deepEqual((await target.prepare('PRAGMA foreign_key_check').all()).results,[]);
  }
});

test('v7 validates exact article fields and pipeline values before writing any row',async t=>{
  const source=await database(t);await seed(source);const backup=await exportBackup(source),target=await database(t);
  const cases=[['status','unknown'],['slot','ZH1'],['writer','bot'],['illustrator','other'],['series_no',0],
    ['series_no',Number.MAX_SAFE_INTEGER+1],['char_count',-1],['subheading_count',1.5],['image_count','1'],
    ['run_date','2026-02-29'],['run_dir','../run'],['run_dir','a//b'],['run_dir','a\\b'],
    ['sample_json','[]'],['draft_ref_json','null'],['timings_json','broken'],['reruns_json','1'],
    ['blockers_json','[1]'],['verify_items_json','[[]]'],['sample_json','{"nested":{"__proto__":{}}}'],
    ['sample_json','{"shadow":{"__proto__":{}},"shadow":{}}'],
    ['draft_ref_json','{"pgc_id":7699934907375567402}'],['timings_json','{"finished_at":"2026-02-29T00:00:00Z"}'],
    ['reruns_json','{"watchdog":-1}'],['blockers_json','[{"type":false}]'],['verify_items_json','[{"constructor":{}}]']];
  for(const [name,value] of cases) {
    const data=structuredClone(backup.data);data.tables.articles[1][name]=value;
    await assert.rejects(restoreIntoEmptyDatabase(target,sign(data),{allowEmptyRestore:true}),e=>e.code==='INVALID_BACKUP',name);
  }
  for(const name of ARTICLE_PIPELINE_FIELDS) {
    const data=structuredClone(backup.data);delete data.tables.articles[1][name];
    await assert.rejects(restoreIntoEmptyDatabase(target,sign(data),{allowEmptyRestore:true}),e=>e.code==='INVALID_BACKUP');
  }
  const tampered=structuredClone(backup);tampered.data.tables.articles[1].sample_json='{"changed":true}';
  await assert.rejects(restoreIntoEmptyDatabase(target,tampered,{allowEmptyRestore:true}),e=>e.code==='INVALID_BACKUP');
  assert.deepEqual(await tableRows(target,'users'),[]);assert.deepEqual(await tableRows(target,'control'),[]);
});

test('v5 note revisions and exact historic article contracts are validated before compatibility defaults',async t=>{
  const source=await database(t);await seed(source,{pipeline:false});const full=await exportBackup(source),target=await database(t);
  for(const version of [1,2,3,4,5])for(const [name,value] of [['url',null],['published_at',null],['status',null]]) {
    const data=historical(full.data,version);data.tables.articles[0][name]=value;
    await assert.rejects(restoreIntoEmptyDatabase(target,sign(data),{allowEmptyRestore:true}),e=>e.code==='INVALID_BACKUP');
  }
  for(const value of [undefined,1,-1,Number.MAX_SAFE_INTEGER]) {
    const data=historical(full.data,5);data.source_revision=value;
    await assert.rejects(restoreIntoEmptyDatabase(target,sign(data),{allowEmptyRestore:true}),e=>e.code==='INVALID_BACKUP');
  }
  assert.deepEqual(await tableRows(target,'users'),[]);assert.deepEqual(await tableRows(target,'control'),[]);
});

test('v7 rejects nonempty targets and failed article foreign keys stay fenced',async t=>{
  const source=await database(t);await seed(source);const full=await exportBackup(source);
  await assert.rejects(restoreIntoEmptyDatabase(source,full,{allowEmptyRestore:true}),e=>e.code==='RESTORE_NOT_EMPTY');
  const invalid=structuredClone(full.data);invalid.tables.articles[0].account_id='missing-account';
  const target=await database(t);
  await assert.rejects(restoreIntoEmptyDatabase(target,sign(invalid),{allowEmptyRestore:true}),/FOREIGN KEY constraint failed/);
  assert.equal((await target.prepare('SELECT initialized FROM matrix_control').first()).initialized,2);
  await assert.rejects(restoreIntoEmptyDatabase(target,full,{allowEmptyRestore:true}),e=>e.code==='RESTORE_NOT_EMPTY');
});

test('latest exporter cannot silently use an unmigrated schema; legacy projection refuses pipeline data',async t=>{
  const old=await database(t,{through:5});
  await old.prepare('INSERT INTO matrix_control(id,initialized,revision) VALUES(1,1,0)').run();
  await assert.rejects(exportBackup(old),/no such column/);
  const source=await database(t);await seed(source);const backup=await exportBackup(source);
  const emptyPrivate=structuredClone(backup);
  for(const name of ['todos','todo_templates','todo_template_links','todo_preferences','daily_notes'])emptyPrivate.data.tables[name]=[];
  emptyPrivate.sha256=digest(JSON.stringify(stable(emptyPrivate.data)));
  assert.throws(()=>legacyBackupEnvelope({data:emptyPrivate}),/legacy projection cannot hide pipeline data/);
});
