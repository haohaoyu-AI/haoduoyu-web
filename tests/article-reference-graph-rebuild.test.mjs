import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {applyFixtureMigrations} from './harness.mjs';
import {applyGraphCandidate,graphMigration,candidateStatements} from './article-graph-migration.mjs';
import {captureGraphState,assertGraphPreserved} from './article-graph-invariants.mjs';

const stamp='2026-10-24T00:00:00.000Z';
async function database(t,{empty=false}={}) {
  const runtime=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
  const mf=new Miniflare({modules:true,cf:false,script:'export default {fetch(){return new Response(null,{status:404})}}',
    compatibilityDate:runtime.compatibility_date,compatibilityFlags:runtime.compatibility_flags,
    d1Databases:['DB'],d1Persist:false,outboundService:()=>new Response('External requests disabled',{status:502})});
  t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');await applyFixtureMigrations(db,{through:5});
  if(!empty)await seed(db);
  return db;
}
async function seed(db) {
  await db.batch([
    db.prepare('INSERT INTO matrix_control(id,initialized,revision) VALUES(1,1,99)'),
    db.prepare('INSERT INTO matrix_accounts VALUES(?,?,?,?,?)').bind('graph-account','wechat','合成账号',1,stamp),
    db.prepare('INSERT INTO matrix_users VALUES(?,?,?,?)').bind('graph-owner','synthetic-graph-owner','SYNTHETIC-HASH',stamp),
    db.prepare('INSERT INTO matrix_todos(rowid,user_id,id,date,text,completed,version,created_at,updated_at,deleted_at) VALUES(7,?,?,?,?,1,3,?,?,?)')
      .bind('graph-owner','graph-todo','2026-10-24','保全合成待办',stamp,stamp,stamp),
    db.prepare('INSERT INTO matrix_todo_templates(user_id,id,text,version,created_at,updated_at) VALUES(?,?,?,2,?,?)')
      .bind('graph-owner','graph-template','合成模板',stamp,stamp),
    db.prepare('INSERT INTO matrix_todo_template_links VALUES(?,?,?,0)').bind('graph-owner','graph-todo','graph-template'),
    db.prepare('INSERT INTO matrix_todo_preferences VALUES(?,?,3,?)').bind('graph-owner','hide',stamp),
    db.prepare('INSERT INTO matrix_daily_notes(user_id,date,text,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,4,99,?,?,?)')
      .bind('graph-owner','2026-10-24','保全合成笔记',stamp,stamp,stamp),
    db.prepare('INSERT INTO matrix_sessions VALUES(?,?,?)').bind('SYNTHETIC-SESSION-HASH','graph-owner','2099-01-01'),
    db.prepare('INSERT INTO matrix_api_keys VALUES(?,?,?,?,?,?,?,?)')
      .bind('graph-key','synthetic','SYNTHETIC-KEY-HASH','["graph-account"]','["read"]',stamp,null,null),
    db.prepare('INSERT INTO matrix_audit VALUES(?,?,?,?,?,?)').bind('graph-audit','synthetic','synthetic.seed',null,'{}',stamp),
    db.prepare('INSERT INTO matrix_idempotency VALUES(?,?,?,?,?,?)').bind('synthetic','graph-receipt','SYNTHETIC-DIGEST','{"saved":true}',200,stamp),
    db.prepare('INSERT INTO matrix_login_attempts VALUES(?,?,?)').bind('synthetic',2,42),
  ].filter(Boolean));
  for(const [rowid,id,external] of [[4,'graph-a','platform-a'],[19,'graph-b',null],[100,'graph-c','']]) {
    await db.prepare('INSERT INTO matrix_articles(rowid,id,account_id,title,url,platform_article_id,published_at,started_at,production_mode,summary,notes,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(rowid,id,'graph-account',id==='graph-a'?'【保险200篇·第109篇】合成标题':id,'https://example.invalid/'+id,
        external,stamp,'2026-10-23T23:30:00.000Z','manual','合成概况','原备注\n原换行',7,stamp,stamp).run();
  }
  for(const [rowid,id,article,kind,metrics] of [[6,'graph-o-a','graph-a','latest','{ "reads" : 0, "likes":2 }'],
    [21,'graph-o-b','graph-b','d1','{\n"reads":3,"comments":1\n}']])
    await db.prepare('INSERT INTO matrix_observations(rowid,id,article_id,as_of,collected_at,kind,metrics_json,source,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .bind(rowid,id,article,stamp,stamp,kind,metrics,'synthetic','原指标备注',stamp).run();
  for(const [rowid,id,article,metrics] of [[8,'graph-d-account',null,'{"reads":0}'],[88,'graph-d-article','graph-a','{ "reads":7 }']])
    await db.prepare('INSERT INTO matrix_daily_metrics(rowid,id,account_id,article_id,date,metrics_json,source,updated_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(rowid,id,'graph-account',article,'2026-10-24',metrics,'synthetic',stamp).run();
}
const ledger=async db=>(await db.prepare('SELECT name FROM __fixture_migrations ORDER BY name').all()).results;
async function integrity(db) {
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  assert.equal(Object.values((await db.prepare('PRAGMA quick_check').all()).results[0])[0],'ok');
  assert.equal((await db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name LIKE '%_next' OR name='matrix_article_pipeline_assert'").first()).n,0);
}
async function assertOriginal(db,before,beforeLedger) {
  assertGraphPreserved(before,await captureGraphState(db),{pipelineAdded:false});
  assert.deepEqual(await ledger(db),beforeLedger);await integrity(db);
}

test('real D1 graph replacement preserves all 16 tables, rowids, JSON, constraints and atomic ledger',async t=>{
  const db=await database(t),before=await captureGraphState(db),oldLedger=await ledger(db);
  let prepared=0;
  const counted={prepare(sql){prepared++;return db.prepare(sql);},batch:db.batch.bind(db)};
  const result=await applyGraphCandidate(counted);
  assertGraphPreserved(before,await captureGraphState(db),{pipelineAdded:true});await integrity(db);
  assert.deepEqual(await ledger(db),[...oldLedger,{name:graphMigration}]);
  assert.equal(result.statements,27);assert.ok(result.peakBytes>0);
  assert.equal(prepared,46);assert.ok(result.beforeBytes>0);
  t.diagnostic(JSON.stringify({batchStatements:result.statements,totalStatementsWithPreflight:prepared,beforeBytes:result.beforeBytes,
    peakBytes:result.peakBytes,rowsRead:result.rowsRead,rowsWritten:result.rowsWritten,
    scope:'synthetic local D1 only; production capacity is unverified'}));
  const after=await captureGraphState(db);
  await assert.rejects(applyGraphCandidate(db),/GRAPH_SOURCE_TABLE_CHANGED|GRAPH_ALREADY_APPLIED/);
  assert.deepEqual(await captureGraphState(db),after);
});

test('empty real D1 candidate creates no business rows and retains all unrelated schema',async t=>{
  const db=await database(t,{empty:true}),before=await captureGraphState(db);
  await applyGraphCandidate(db);assertGraphPreserved(before,await captureGraphState(db),{pipelineAdded:true});await integrity(db);
});

test('graph candidate failure at every DDL/copy/assert/index phase restores the complete original database and ledger',async t=>{
  for(const injectAfter of [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,19,21,22,23,24])await t.test('after statement '+injectAfter,async t=>{
    const db=await database(t),before=await captureGraphState(db),beforeLedger=await ledger(db);
    await assert.rejects(applyGraphCandidate(db,{injectAfter}),/synthetic_injected_graph_failure/);
    await assertOriginal(db,before,beforeLedger);
  });
});

test('copy mismatch and final ledger failure abort all DDL and retain original data',async t=>{
  for(const options of [{corruptCopy:true},{ledgerFailure:true}])await t.test(JSON.stringify(options),async t=>{
    const db=await database(t),before=await captureGraphState(db),beforeLedger=await ledger(db);
    await assert.rejects(applyGraphCandidate(db,options),/CHECK constraint failed|UNIQUE constraint failed/);
    await assertOriginal(db,before,beforeLedger);
  });
});

test('unknown incoming references, views, triggers and changed source indexes fail before graph mutation',async t=>{
  for(const ddl of [
    'CREATE TABLE synthetic_inbound(id TEXT PRIMARY KEY,article_id TEXT REFERENCES matrix_articles(id))',
    'CREATE VIEW synthetic_view AS SELECT id FROM matrix_articles',
    'CREATE TRIGGER synthetic_trigger AFTER UPDATE ON matrix_articles BEGIN SELECT 1; END',
    'CREATE INDEX synthetic_extra_index ON matrix_articles(title)',
  ])await t.test(ddl.split(' ').slice(0,3).join(' '),async t=>{
    const db=await database(t);await db.prepare(ddl).run();const before=await captureGraphState(db),beforeLedger=await ledger(db);
    await assert.rejects(applyGraphCandidate(db),/GRAPH_UNKNOWN_|GRAPH_SOURCE_INDEX_CHANGED/);
    assert.deepEqual(await captureGraphState(db),before);assert.deepEqual(await ledger(db),beforeLedger);
    const name=/^CREATE (?:TABLE|VIEW|TRIGGER|INDEX) ([A-Za-z_][A-Za-z0-9_]*)/.exec(ddl)[1];
    assert.ok(await db.prepare('SELECT name FROM sqlite_schema WHERE name=?').bind(name).first());
  });
});

test('catalog change between preflight and batch is rejected atomically without touching graph rows',async t=>{
  const db=await database(t),before=await captureGraphState(db),beforeLedger=await ledger(db);
  await assert.rejects(applyGraphCandidate(db,{changeCatalog:()=>db.prepare('CREATE TABLE synthetic_catalog_race(id TEXT)').run()}),/CHECK constraint failed/);
  assertGraphPreserved(before,await captureGraphState(db),{pipelineAdded:false});assert.deepEqual(await ledger(db),beforeLedger);
  assert.ok(await db.prepare("SELECT name FROM sqlite_schema WHERE name='synthetic_catalog_race'").first());await integrity(db);
});

test('candidate new storage retains NULL semantics, exact enum/JSON containers and both unique business keys',async t=>{
  const db=await database(t);await applyGraphCandidate(db);
  const create=async(id,extra={})=>{
    const data={id,account_id:'graph-account',title:'合成草稿',url:null,published_at:null,created_at:stamp,updated_at:stamp,...extra};
    const keys=Object.keys(data);return db.prepare('INSERT INTO matrix_articles('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')')
      .bind(...keys.map(key=>data[key])).run();
  };
  await create('draft-a',{status:'draft_saved'});await create('draft-b',{status:'draft_saved'});
  await create('null-state',{status:null});
  assert.equal((await db.prepare('SELECT status FROM matrix_articles WHERE id=?').bind('null-state').first()).status,null);
  await create('legacy-default',{url:'https://example.invalid/legacy',published_at:stamp});
  assert.equal((await db.prepare('SELECT status FROM matrix_articles WHERE id=?').bind('legacy-default').first()).status,'published');
  const json='{ "future_key" : {"boolean":true,"unknown":[0,null,"保留"]} }';
  await create('metadata-a',{status:'draft_saved',run_dir:'gzh/109',slot:'gzh',run_date:'2026-10-24',sample_json:json,
    draft_ref_json:'{"pgc_id":"7699934907375567402"}',blockers_json:'[{"future":true}]',verify_items_json:'[]'});
  assert.equal((await db.prepare('SELECT sample_json FROM matrix_articles WHERE id=?').bind('metadata-a').first()).sample_json,json);
  await create('metadata-b',{run_dir:'gzh_109'});
  await assert.rejects(create('duplicate-run',{run_dir:'gzh/109'}),/UNIQUE constraint failed/);
  await assert.rejects(create('duplicate-slot',{slot:'gzh',run_date:'2026-10-24'}),/UNIQUE constraint failed/);
  for(const [key,value] of [['status','unknown'],['slot','unknown'],['writer','unknown'],['illustrator','unknown'],
    ['char_count',-1],['series_no',0],['image_count',1.5],['subheading_count','not-an-integer'],
    ['sample_json','[]'],['sample_json','null'],['sample_json','broken'],['draft_ref_json','[]'],
    ['timings_json','[]'],['reruns_json','[]'],['blockers_json','{}'],['verify_items_json','{}']])
    await assert.rejects(create('invalid-'+key,{[key]:value}),/CHECK constraint failed/);
  await integrity(db);
  assert.ok((await candidateStatements()).every(sql=>!(/\bREPLACE\b|\bIGNORE\b|PRAGMA\s+defer_foreign_keys|PRAGMA\s+foreign_keys/i.test(sql))));
});
