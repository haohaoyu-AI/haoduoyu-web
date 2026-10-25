// Diagnostic gate only. This is not an approved migration or a production tool.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {applyFixtureMigrations} from './harness.mjs';

const stamp='2026-10-24T00:00:00.000Z';
async function database(t,{children=false}={}) {
  const settings=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
  const mf=new Miniflare({modules:true,cf:false,script:'export default {fetch(){return new Response(null,{status:404})}}',
    compatibilityDate:settings.compatibility_date,compatibilityFlags:settings.compatibility_flags,
    d1Databases:['DB'],d1Persist:false,outboundService:()=>new Response('External requests disabled',{status:502})});
  t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');
  await applyFixtureMigrations(db,{through:5});
  await db.batch([
    db.prepare('INSERT INTO matrix_control(id,initialized,revision) VALUES(1,1,19)'),
    db.prepare('INSERT INTO matrix_accounts VALUES(?,?,?,?,?)').bind('synthetic-account','other','合成账号',1,stamp),
    db.prepare('INSERT INTO matrix_users VALUES(?,?,?,?)').bind('synthetic-owner','synthetic-owner','SYNTHETIC-NON-CREDENTIAL',stamp),
    db.prepare('INSERT INTO matrix_todos(user_id,id,date,text,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .bind('synthetic-owner','synthetic-todo','2026-10-24','合成待办保全',stamp,stamp),
    db.prepare('INSERT INTO matrix_daily_notes(user_id,date,text,version,change_seq,created_at,updated_at) VALUES(?,?,?,1,19,?,?)')
      .bind('synthetic-owner','2026-10-24','合成笔记保全',stamp,stamp),
  ]);
  if(children)await seedArticle(db,true);
  return db;
}
async function seedArticle(db,children=false) {
  await db.prepare('INSERT INTO matrix_articles(id,account_id,title,url,published_at,version,created_at,updated_at) VALUES(?,?,?,?,?,7,?,?)')
    .bind('synthetic-article','synthetic-account','合成文章','https://example.invalid/article',stamp,stamp,stamp).run();
  if(children)await db.batch([
    db.prepare('INSERT INTO matrix_observations(id,article_id,as_of,collected_at,kind,metrics_json,source,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind('synthetic-observation','synthetic-article',stamp,stamp,'latest','{"reads":1}','synthetic',stamp),
    db.prepare('INSERT INTO matrix_daily_metrics VALUES(?,?,?,?,?,?,?)')
      .bind('synthetic-daily','synthetic-account','synthetic-article','2026-10-24','{"reads":1}','synthetic',stamp),
  ]);
}
async function checkpoint(db) {
  const schema=(await db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name LIKE 'matrix_%' ORDER BY type,name").all()).results;
  const rows={};
  for(const {name} of schema.filter(row=>row.type==='table')) {
    assert.match(name,/^matrix_[a-z_]+$/);
    rows[name]=(await db.prepare('SELECT * FROM '+name+' ORDER BY rowid').all()).results;
  }
  return {schema,rows};
}
async function candidate(db,{injectFailure=false}={}) {
  const original=(await db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='matrix_articles'").first()).sql;
  const create=original.replaceAll('matrix_articles','matrix_articles_next')
    .replace('`url` text NOT NULL','`url` text').replace('`published_at` text NOT NULL','`published_at` text');
  assert.match(create,/matrix_articles_next/);
  assert.ok(!create.includes('`url` text NOT NULL')&&!create.includes('`published_at` text NOT NULL'));
  const indexes=(await db.prepare("SELECT sql FROM sqlite_schema WHERE type='index' AND tbl_name='matrix_articles' AND sql IS NOT NULL ORDER BY name").all()).results;
  assert.equal(indexes.length,3);
  const sql=['PRAGMA defer_foreign_keys=ON',create,'INSERT INTO matrix_articles_next SELECT * FROM matrix_articles',
    'DROP TABLE matrix_articles',...(injectFailure?['SELECT * FROM synthetic_deliberate_missing_table']:[]),
    'ALTER TABLE matrix_articles_next RENAME TO matrix_articles',...indexes.map(row=>row.sql)];
  return db.batch(sql.map(statement=>db.prepare(statement)));
}

test('D1 control: parent replacement without child rows preserves articles and the three indexes',async t=>{
  const db=await database(t);await seedArticle(db);const before=await checkpoint(db);
  await candidate(db);const after=await checkpoint(db);
  assert.deepEqual(after.rows,before.rows);
  assert.equal(after.schema.filter(row=>row.type==='index'&&row.tbl_name==='matrix_articles').length,3);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  t.diagnostic('Control succeeded; this does not validate a migration with referencing observations/daily_metrics.');
});

test('D1 gate: NO ACTION metric children reject deferred parent replacement and retain the complete original state',async t=>{
  const db=await database(t,{children:true}),before=await checkpoint(db);
  const foreign=(await db.prepare('PRAGMA foreign_key_list(matrix_observations)').all()).results;
  assert.equal(foreign.find(row=>row.table==='matrix_articles').on_delete,'NO ACTION');
  await assert.rejects(candidate(db),error=>/FOREIGN KEY constraint failed/.test(error.message));
  // Read after the failed batch, allowing D1 to re-open its reset Durable Object.
  assert.deepEqual(await checkpoint(db),before);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  assert.equal(Object.values((await db.prepare('PRAGMA quick_check').all()).results[0])[0],'ok');
  assert.equal(await db.prepare("SELECT name FROM sqlite_schema WHERE name='matrix_articles_next'").first(),null);
  t.diagnostic('BLOCKED candidate; real Miniflare D1; all 16 original matrix tables and schemas survived.');
});

test('D1 failure after DROP rolls back the whole candidate including schema, indexes and unrelated data',async t=>{
  const db=await database(t);await seedArticle(db);const before=await checkpoint(db);
  await assert.rejects(candidate(db,{injectFailure:true}),/synthetic_deliberate_missing_table/);
  assert.deepEqual(await checkpoint(db),before);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
});
