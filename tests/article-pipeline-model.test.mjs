import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {Miniflare} from 'miniflare';
import {articleMigrationTag,articleMigrationSha256,validateMigrationSource,loadArticleMigration,
  applyLocalSchemaMigrations,applyArticleMigration,prepareArticleMigration} from '../scripts/migration-contract.mjs';
import {captureGraphState,assertGraphPreserved} from './article-graph-invariants.mjs';

const base='fc38d66704c86de8f255751795125bfa71fc7bc7';
const root=new URL('../',import.meta.url),stamp='2026-10-24T00:00:00.000Z';
async function database(t,{through=5}={}) {
  const settings=JSON.parse(await readFile(new URL('runtime.json',root),'utf8'));
  const mf=new Miniflare({modules:true,cf:false,script:'export default {fetch(){return new Response(null,{status:404})}}',
    compatibilityDate:settings.compatibility_date,compatibilityFlags:settings.compatibility_flags,
    d1Databases:['DB'],d1Persist:false,outboundService:()=>new Response('External requests disabled',{status:502})});
  t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');await applyLocalSchemaMigrations(db,{through});return db;
}
async function seed(db) {
  await db.batch([
    db.prepare('INSERT INTO matrix_control(id,initialized,revision) VALUES(1,1,99)'),
    db.prepare('INSERT INTO matrix_accounts VALUES(?,?,?,?,?)').bind('synthetic-account','other','合成账号',1,stamp),
    db.prepare('INSERT INTO matrix_users VALUES(?,?,?,?)').bind('synthetic-owner','synthetic-owner','SYNTHETIC-HASH',stamp),
    db.prepare('INSERT INTO matrix_todos(user_id,id,date,text,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .bind('synthetic-owner','synthetic-todo','2026-10-24','原待办',stamp,stamp),
    db.prepare('INSERT INTO matrix_daily_notes(user_id,date,text,version,change_seq,created_at,updated_at) VALUES(?,?,?,1,99,?,?)')
      .bind('synthetic-owner','2026-10-24','原笔记',stamp,stamp),
    db.prepare('INSERT INTO matrix_articles(rowid,id,account_id,title,url,published_at,version,created_at,updated_at) VALUES(?,?, ?,?,?,?,?,?,?)')
      .bind('9007199254740993','synthetic-article','synthetic-account','合成文章','https://example.invalid/original',stamp,7,stamp,stamp),
    db.prepare('INSERT INTO matrix_observations(rowid,id,article_id,as_of,collected_at,kind,metrics_json,source,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .bind(17,'synthetic-observation','synthetic-article',stamp,stamp,'latest','{ "reads" : 0 }','synthetic','原备注',stamp),
    db.prepare('INSERT INTO matrix_daily_metrics(rowid,id,account_id,article_id,date,metrics_json,source,updated_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(28,'synthetic-daily','synthetic-account',null,'2026-10-24','{"reads":0}','synthetic',stamp),
  ]);
}
const ledger=async db=>(await db.prepare('SELECT name FROM __fixture_migrations ORDER BY name').all()).results;

test('active migration is the exact approved SQL; old SQL and all non-article metadata stay frozen',async()=>{
  const sql=await readFile(new URL('drizzle/'+articleMigrationTag+'.sql',root),'utf8');
  assert.equal(articleMigrationSha256,'b45a31900d6b7153a423b8c7fa870b0a98da3e5b074b6d6f62ac044f7782a2ba');
  assert.equal(validateMigrationSource(articleMigrationTag,sql).length,25);
  assert.equal((await loadArticleMigration()).length,25);
  assert.equal(sql,await readFile(new URL('migration-candidates/'+articleMigrationTag+'.sql',root),'utf8'));
  const journal=JSON.parse(await readFile(new URL('drizzle/meta/_journal.json',root),'utf8'));
  assert.deepEqual(journal.entries.map(entry=>entry.tag),[
    '0000_lively_stellaris','0001_daily_todos','0002_todo_templates','0003_todo_recovery_preferences','0004_daily_notes',
    articleMigrationTag,'0006_long_term_memos','0007_work_daily_notes','0008_workbench_updates',
    '0009_unscheduled_todos','0010_note_labels',
  ]);assert.equal(journal.entries[5].tag,articleMigrationTag);
  assert.equal(journal.entries[8].tag,'0008_workbench_updates');
  for(const entry of journal.entries.slice(0,5)) {
    const path='drizzle/'+entry.tag+'.sql';
    assert.equal(await readFile(new URL(path,root),'utf8'),execFileSync('git',['show',base+':'+path],{cwd:root,encoding:'utf8'}));
  }
  const old=JSON.parse(await readFile(new URL('drizzle/meta/0004_snapshot.json',root),'utf8'));
  const current=JSON.parse(await readFile(new URL('drizzle/meta/0005_snapshot.json',root),'utf8'));
  assert.equal(current.prevId,old.id);assert.equal(Object.keys(current.tables).length,16);
  for(const [name,table] of Object.entries(old.tables))if(name!=='matrix_articles')assert.deepEqual(current.tables[name],table,name);
  assert.equal(Object.keys(current.tables.matrix_articles.columns).length,30);
  assert.equal(current.tables.matrix_articles.columns.url.notNull,false);
  assert.equal(current.tables.matrix_articles.columns.published_at.notNull,false);
  assert.equal(current.tables.matrix_articles.columns.status.default,"'published'");
});

test('exact hash and statement allowlist reject edits, reordered DDL, extra mutations and unknown tags',async()=>{
  const sql=await readFile(new URL('drizzle/'+articleMigrationTag+'.sql',root),'utf8');
  for(const invalid of [sql+'\nDROP TABLE matrix_users;',sql.replace('NO-OP','x')+'\n',
    sql.replace('DROP TABLE `matrix_articles`;','DROP TABLE `matrix_accounts`;'),
    sql.split('--> statement-breakpoint').reverse().join('--> statement-breakpoint')])
    assert.throws(()=>validateMigrationSource(articleMigrationTag,invalid),/reviewed hash|allowlist/);
  assert.throws(()=>validateMigrationSource('0006_unreviewed',sql),/Only the reviewed/);
});

test('active local executor atomically upgrades populated schema and fixture ledger, preserving 64-bit ROWID and unrelated data',async t=>{
  const db=await database(t);await seed(db);const before=await captureGraphState(db),beforeLedger=await ledger(db);
  const prepared=await prepareArticleMigration(db);assert.equal(prepared.statements.length,27);
  await db.batch(prepared.statements);
  const after=await captureGraphState(db);assertGraphPreserved(before,after,{pipelineAdded:true});
  assert.equal(after.tables.matrix_articles.rows[0].__graph_rowid__,'9007199254740993');
  assert.deepEqual(await ledger(db),[...beforeLedger,{name:articleMigrationTag}]);
  await applyLocalSchemaMigrations(db,{through:6});
  assert.deepEqual(await captureGraphState(db),after,'reopening an already migrated fixture does not rewrite data');
  await assert.rejects(applyArticleMigration(db),/GRAPH_ALREADY_APPLIED/);
});

test('active executor failure at final ledger write rolls back DDL and data; catalog race is rejected before business changes',async t=>{
  const db=await database(t);await seed(db);const before=await captureGraphState(db),beforeLedger=await ledger(db);
  const first=await prepareArticleMigration(db);
  const duplicate=db.prepare('INSERT INTO __fixture_migrations(name) VALUES(?)').bind('0004_daily_notes');
  await assert.rejects(db.batch([...first.statements.slice(0,-1),duplicate]),/UNIQUE constraint failed/);
  assert.deepEqual(await captureGraphState(db),before);assert.deepEqual(await ledger(db),beforeLedger);
  const second=await prepareArticleMigration(db);
  await db.prepare('CREATE TABLE synthetic_schema_race(id TEXT)').run();
  await assert.rejects(db.batch(second.statements),/CHECK constraint failed/);
  assert.deepEqual(await captureGraphState(db),before);assert.deepEqual(await ledger(db),beforeLedger);
});

test('unverified transport and incomplete prior ledger fail closed; article migration schema has only 16 matrix tables',async t=>{
  const db=await database(t);
  await assert.rejects(applyArticleMigration(db,{ledgerTable:'d1_migrations'}),/Unverified migration ledger/);
  await db.prepare('DELETE FROM __fixture_migrations WHERE name=?').bind('0004_daily_notes').run();
  await assert.rejects(applyArticleMigration(db),/GRAPH_PRIOR_LEDGER_MISMATCH/);
  const target=await database(t,{through:6}),state=await captureGraphState(target);
  assert.equal(state.tableNames.length,16);
  for(const table of Object.values(state.tables))assert.equal(table.rows.length,0);
  assert.equal((await ledger(target)).length,6);
  assert.deepEqual((await target.prepare('PRAGMA foreign_key_check').all()).results,[]);
  assert.equal(Object.values((await target.prepare('PRAGMA quick_check').all()).results[0])[0],'ok');
});
