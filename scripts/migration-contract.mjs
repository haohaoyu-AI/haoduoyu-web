// Reviewed local schema migration contract. No cloud connection or Worker route.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

export const labelMigrationTag='0011_note_entry_multi_labels';
export const labelMigrationSha256='dd7ebad5ee3a0fe47000796af30908d8d3b6bb88ace153c5bdb474f2509c0a5a';
export function validateLabelMigrationSource(tag,sql) {
  assert.equal(tag,labelMigrationTag,'Only the reviewed label migration is allowed');
  assert.equal(createHash('sha256').update(sql).digest('hex'),labelMigrationSha256,'Label migration source differs from its reviewed hash');
  return sql.split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean);
}
export const labelSetsMigrationTag='0012_note_entry_label_sets';
export const labelSetsMigrationSha256='57a95c6e93487e3b700fac667c14234e0df7bf99525b489dc447a063cafc5867';
export function validateLabelSetsMigrationSource(tag,sql) {
  assert.equal(tag,labelSetsMigrationTag,'Only the reviewed label sets migration is allowed');
  assert.equal(createHash('sha256').update(sql).digest('hex'),labelSetsMigrationSha256,'Label sets migration source differs from its reviewed hash');
  return sql.split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean);
}
export const labelArchivesMigrationTag='0013_note_label_archives';
export const labelArchivesMigrationSha256='24aedf46fb76ac8443c3bac88cf4a836361b4080ddf6d49f53bca2a8ae52d8ad';
export function validateLabelArchivesMigrationSource(tag,sql) {
  assert.equal(tag,labelArchivesMigrationTag,'Only the reviewed label archives migration is allowed');
  assert.equal(createHash('sha256').update(sql).digest('hex'),labelArchivesMigrationSha256,'Label archives migration source differs from its reviewed hash');
  return sql.split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean);
}
export const aiReportsMigrationTag='0014_ai_reports';
export function validateAiReportsMigrationSource(tag,sql) {
  assert.equal(tag,aiReportsMigrationTag);
  assert.equal(createHash('sha256').update(sql).digest('hex'),'c0701ad17ae2331e4361160236d4cd4720b6346f4ea09ba4403556f5cff5c898');
  return sql.split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean);
}
export const articleMigrationTag='0005_article_pipeline';
export const reviewMigrationTag='0015_content_review';
export const reviewAttributionMigrationTag='0016_review_attribution';
export const reviewResourcesMigrationTag='0017_review_resources';
export const reviewLegacyExtensionsMigrationTag='0018_review_legacy_extensions';
export function validateReviewResourcesMigrationSource(tag,sql) {
  assert.equal(tag,reviewResourcesMigrationTag);
  assert.equal(createHash('sha256').update(sql).digest('hex'),'54ba48ec7ddd6746c2f76899c15d273ad9ebcbc142d48936e4383ae522414077','Review resources differ from reviewed additive source');
  const statements=sql.split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean);
  assert.equal(statements.length,8);
  assert.equal(statements.filter(value=>value.startsWith('CREATE TABLE ')).length,4);
  for(const statement of statements) {
    assert.match(statement,/^CREATE (?:TABLE matrix_review_|(?:UNIQUE )?INDEX review_)/);
    assert.ok(!/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i.test(statement.replace(/ON (?:UPDATE|DELETE) (?:NO ACTION|CASCADE)/gi,'')),'New review schema cannot rewrite business rows');
  }
  return statements;
}
export function validateReviewLegacyExtensionsMigrationSource(tag,sql) {
  assert.equal(tag,reviewLegacyExtensionsMigrationTag);
  assert.equal(createHash('sha256').update(sql).digest('hex'),'4be164c77d20d6c5a7b73b8cf20c5440fcb989d364dff20edd97c801e4a6717e','Review legacy extensions differ from reviewed additive source');
  const statements=sql.split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean);
  assert.equal(statements.length,2);
  assert.match(statements[0],/^ALTER TABLE `matrix_review_articles` ADD `reference_article_id` text;$/);
  assert.match(statements[1],/^ALTER TABLE `matrix_review_playbooks` ADD `status` text CONSTRAINT /);
  for(const statement of statements)assert.ok(!/\b(?:NOT NULL|DEFAULT|INSERT|UPDATE|DELETE|DROP|CREATE|RENAME)\b/i.test(statement));
  return statements;
}
export function validateReviewAttributionMigrationSource(tag,sql) {
  assert.equal(tag,reviewAttributionMigrationTag);
  assert.equal(createHash('sha256').update(sql).digest('hex'),'b86ea49a67d9890af0bab00428f415e5d1943c5adf894256047fd40dedfb9de3','Review attribution differs from reviewed additive source');
  const statements=sql.split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean);
  assert.equal(statements.length,4);
  for(const [idx,statement] of statements.entries()) {
    const [table,column,type]=[['articles','playbook_version_used','integer'],['articles','applied_rule_ids_json','text'],['snapshots','age_hours','integer'],['snapshots','source','text']][idx];
    assert.ok(statement.startsWith('ALTER TABLE `matrix_review_'+table+'` ADD `'+column+'` '+type+' CONSTRAINT '));
    assert.ok(!/\b(?:NOT NULL|DEFAULT|INSERT|UPDATE|DELETE|DROP|CREATE|RENAME)\b/i.test(statement));
  }
  return statements;
}
export function validateReviewMigrationSource(tag,sql) {
  assert.equal(tag,reviewMigrationTag,'Only the reviewed content review migration is allowed');
  assert.equal(createHash('sha256').update(sql).digest('hex'),'112d05af48a2984fac58ac322da334f04f7861842fd4e3bc2c9ef904059cb910','Content review schema differs from its reviewed source');
  const statements=sql.split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean);
  assert.equal(statements.length,10);
  assert.equal(statements.filter(value=>value.startsWith('CREATE TABLE')).length,4);
  for(const statement of statements) {
    assert.match(statement,/^CREATE (?:TABLE|(?:UNIQUE )?INDEX) `matrix_review_/);
    assert.ok(!/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i.test(statement.replace(/ON (?:UPDATE|DELETE) (?:no action|cascade)/gi,'')),'New review schema cannot rewrite business rows');
  }
  return statements;
}
export const articleMigrationSha256='b45a31900d6b7153a423b8c7fa870b0a98da3e5b074b6d6f62ac044f7782a2ba';
const statementHashes=[
  '77a05205027ae6c5c74706b8d5093319c010b578f70f323e90da0b11420200e3',
  '159ee695ddc27d8c3fc97075665d3541620e0d5111648c4bbd7513111b3b4d48',
  '6fd30370d841fbf7108e679a11c3737fb299319bcbaf7a08bea2dafae26df3f5',
  '8a88ac60f3e7680be5bee9904c682393079d802e91d37bccd237d31c305b5676',
  'a2909f726f15c033f8e523212cf2033228c4e05d781ab754180748842a401cd5',
  'ec172c9681317ca1c65a79bd1e4aa409e712fa6dfcaaa5eb8110e4693d9af8df',
  '1e1357636078a87136db2e8920016919403ecbc143a3adf61e168457ebfc8bb1',
  'f50781c65a53fa64b3d35b50e268c62430c017d228078f9ee4882886044e8a8d',
  '86ccaf05271fa5bdd2a3963e2b2fadef9cd8267f38490a81aa659abfbd70453b',
  '951e067737a52e8ab8e697fb25ff74473e3eedc96679e93298652c72f03de603',
  '76e380b6120a1966cd0834217e4eb759572fe99881f3a3d0f7cc8fe871feb67a',
  '16ab58ed165ba3f734887b7f40b1b27e3fa74258dd034c1b920d8a68547a0d1a',
  '02f6c50bff12fd3a54779d3aea126a0d47d4088eaf2d38e04cda754dfaf53bee',
  'ee832155d59bb2b046aecdeca259a3bfbaaf2c979a56b3f68a9775c26ce3675d',
  '7386a1737eee28583e8684bd5e4aa46eee40cab6f22ab51c4e4fa4c422e9b1aa',
  '30115a28863ad85b7d892a819a6082781dc9f6664688d31ac6cadfe51d6f2624',
  '05cc2ee0f0801e45b18c2598a4334220b212bcf04a3906b7c092aeb2ec6550aa',
  '369d460b84648915274b8b225c59800c46c4b4409a5c978819054df08ba3a79f',
  '3522ad1b2de69c350d7845367cdbc245dbe834f2f1d47c6f5db5545311c11ce4',
  '1f96b2dcc050d811eb47891ea2c8ceb79cc8ee4502a9109dd444c473e4534b83',
  '3560b4699882c20430793290c077b598c7058a6e2894786aacc1ef84cfc7eba0',
  'a810185c8641e471bddbff59ad56df9c79179d0643fcf728ccef0b4a33a02649',
  '69ad61cf5cca2199f4df8c55a0b241078e4305386cfb9fedeb52b896150f9d01',
  '5138148dd372a2c94391f895a7c0b9ea481218ed2614fe8129c1181ed199f861',
  '63525ed76163edb111840ae794390f3d6c1f25da213f07ae818618369226b360',
];
const hash=value=>createHash('sha256').update(value).digest('hex');
const split=sql=>sql.split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean);
const root=new URL('../',import.meta.url);
const legacyTags=['0000_lively_stellaris','0001_daily_todos','0002_todo_templates','0003_todo_recovery_preferences','0004_daily_notes'];
const graph=['matrix_articles','matrix_observations','matrix_daily_metrics'];
const scratch='matrix_article_pipeline_assert';
const catalogSql="SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND substr(name,1,4)<>'_cf_' AND name<>'"+scratch+"' ORDER BY type,name";
const normalized=sql=>sql.trim().replace(/;$/,'');
const quote=name=>'"'+name.replaceAll('"','""')+'"';

export function validateMigrationSource(tag,sql) {
  assert.equal(tag,articleMigrationTag,'Only the reviewed article migration is allowed');
  assert.equal(hash(sql),articleMigrationSha256,'Article migration source differs from its reviewed hash');
  const statements=split(sql);
  assert.deepEqual(statements.map(hash),statementHashes,'Article migration statements differ from the exact allowlist');
  return statements;
}
export async function loadArticleMigration() {
  const sql=await readFile(new URL('drizzle/'+articleMigrationTag+'.sql',root),'utf8');
  return validateMigrationSource(articleMigrationTag,sql);
}
function checkLedger(ledgerTable) {
  // Only this local rehearsal transport is verified. No inferred cloud ledger.
  assert.equal(ledgerTable,'__fixture_migrations','Unverified migration ledger/transport');
}
export async function preflightArticleMigration(db,{ledgerTable='__fixture_migrations'}={}) {
  checkLedger(ledgerTable);
  const catalog=(await db.prepare(catalogSql).all()).results;
  const source=split(await readFile(new URL('drizzle/0000_lively_stellaris.sql',root),'utf8'));
  if(catalog.some(row=>['view','trigger'].includes(row.type)))throw Error('GRAPH_UNKNOWN_VIEW_OR_TRIGGER');
  const tables=catalog.filter(row=>row.type==='table');
  if(tables.some(row=>!row.name.startsWith('matrix_')&&row.name!==ledgerTable))throw Error('GRAPH_UNKNOWN_USER_TABLE');
  if(tables.some(row=>row.name.endsWith('_next')||row.name===scratch))throw Error('GRAPH_TEMPORARY_OBJECT');
  assert.equal(tables.filter(row=>row.name.startsWith('matrix_')).length,16,'GRAPH_UNEXPECTED_SCHEMA');
  assert.equal(normalized(tables.find(row=>row.name===ledgerTable)?.sql||''),
    'CREATE TABLE __fixture_migrations(name TEXT PRIMARY KEY)','GRAPH_LOCAL_LEDGER_CHANGED');
  const applied=(await db.prepare('SELECT name FROM __fixture_migrations ORDER BY name').all()).results.map(row=>row.name);
  if(applied.includes(articleMigrationTag))throw Error('GRAPH_ALREADY_APPLIED');
  const journal=JSON.parse(await readFile(new URL('drizzle/meta/_journal.json',root),'utf8'));
  assert.deepEqual(applied,journal.entries.slice(0,5).map(row=>row.tag).sort(),'GRAPH_PRIOR_LEDGER_MISMATCH');
  for(const name of graph) {
    assert.equal(normalized(catalog.find(row=>row.type==='table'&&row.name===name)?.sql||''),
      normalized(source.find(sql=>sql.startsWith('CREATE TABLE `'+name+'`'))||''),'GRAPH_SOURCE_TABLE_CHANGED: '+name);
    assert.deepEqual(catalog.filter(row=>row.type==='index'&&row.tbl_name===name&&row.sql).map(row=>normalized(row.sql)).sort(),
      source.filter(sql=>/^CREATE (?:UNIQUE )?INDEX/.test(sql)&&sql.includes(' ON `'+name+'`')).map(normalized).sort(),
      'GRAPH_SOURCE_INDEX_CHANGED: '+name);
  }
  for(const {name} of tables.filter(row=>row.name.startsWith('matrix_'))) {
    const foreign=(await db.prepare('PRAGMA foreign_key_list('+quote(name)+')').all()).results;
    for(const item of foreign.filter(row=>graph.includes(row.table))) {
      if(!['matrix_observations','matrix_daily_metrics'].includes(name)||item.table!=='matrix_articles'||item.from!=='article_id'||
        item.to!=='id'||item.on_delete!=='NO ACTION'||item.on_update!=='NO ACTION')throw Error('GRAPH_UNKNOWN_INBOUND_FOREIGN_KEY');
    }
  }
  return catalog;
}
export async function prepareArticleMigration(db,{ledgerTable='__fixture_migrations'}={}) {
  const catalog=await preflightArticleMigration(db,{ledgerTable}),sql=await loadArticleMigration();
  const guard=db.prepare(`INSERT INTO ${scratch}(ok) SELECT CASE WHEN
    (SELECT json_group_array(json_object('type',type,'name',name,'tbl_name',tbl_name,'sql',sql))
    FROM (${catalogSql}))=? THEN 1 ELSE 0 END`).bind(JSON.stringify(catalog));
  const statements=[db.prepare(sql[0]),guard,...sql.slice(1).map(value=>db.prepare(value)),
    db.prepare('INSERT INTO __fixture_migrations(name) VALUES(?)').bind(articleMigrationTag)];
  return {statements,catalog};
}
export async function applyArticleMigration(db,options={}) {
  const {statements}=await prepareArticleMigration(db,options);
  return db.batch(statements);
}

export async function applyLocalSchemaMigrations(db,{through=Infinity}={}) {
  const journal=JSON.parse(await readFile(new URL('drizzle/meta/_journal.json',root),'utf8'));
  assert.deepEqual(journal.entries.map(entry=>entry.tag),[...legacyTags,articleMigrationTag,'0006_long_term_memos','0007_work_daily_notes','0008_workbench_updates','0009_unscheduled_todos','0010_note_labels',labelMigrationTag,labelSetsMigrationTag,labelArchivesMigrationTag,aiReportsMigrationTag,reviewMigrationTag,reviewAttributionMigrationTag,reviewResourcesMigrationTag,reviewLegacyExtensionsMigrationTag],'Unreviewed local migration journal');
  await db.prepare('CREATE TABLE IF NOT EXISTS __fixture_migrations(name TEXT PRIMARY KEY)').run();
  const migrated=await db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='matrix_control'").first();
  if(migrated)await db.prepare('INSERT OR IGNORE INTO __fixture_migrations(name) VALUES(?)').bind(journal.entries[0].tag).run();
  for(const entry of journal.entries.slice(0,through)) {
    if(await db.prepare('SELECT name FROM __fixture_migrations WHERE name=?').bind(entry.tag).first())continue;
    if(entry.tag===articleMigrationTag)await applyArticleMigration(db);
    else {
      const sql=await readFile(new URL('drizzle/'+entry.tag+'.sql',root),'utf8');
      const statements=entry.tag===reviewLegacyExtensionsMigrationTag?validateReviewLegacyExtensionsMigrationSource(entry.tag,sql):entry.tag===reviewResourcesMigrationTag?validateReviewResourcesMigrationSource(entry.tag,sql):entry.tag===reviewAttributionMigrationTag?validateReviewAttributionMigrationSource(entry.tag,sql):entry.tag===reviewMigrationTag?validateReviewMigrationSource(entry.tag,sql):entry.tag===labelMigrationTag?validateLabelMigrationSource(entry.tag,sql):entry.tag===labelSetsMigrationTag?validateLabelSetsMigrationSource(entry.tag,sql):entry.tag===labelArchivesMigrationTag?validateLabelArchivesMigrationSource(entry.tag,sql):entry.tag===aiReportsMigrationTag?validateAiReportsMigrationSource(entry.tag,sql):split(sql);
      for(const statement of statements) {
        if(entry.tag===labelMigrationTag||entry.tag===labelSetsMigrationTag||entry.tag===reviewAttributionMigrationTag||entry.tag===reviewResourcesMigrationTag||entry.tag===reviewLegacyExtensionsMigrationTag)continue;
        if(entry.idx===3&&['ALTER TABLE `matrix_todos` ADD `deleted_at` text;',
          'ALTER TABLE `matrix_todo_template_links` ADD `created_with_todo` integer DEFAULT 1 NOT NULL;'].includes(statement))continue;
        assert.match(statement,/^CREATE (?:TABLE|(?:UNIQUE )?INDEX)\s+`matrix_/,'Unreviewed legacy migration statement');
        assert.ok(!/\b(?:INSERT|DELETE|DROP|UPDATE|ALTER)\b/i.test(statement.replace(/ON (?:UPDATE|DELETE) (?:no action|cascade)/gi,'')),
          'Unreviewed legacy mutation');
      }
      await db.batch([...statements.map(value=>db.prepare(value)),
        db.prepare('INSERT INTO __fixture_migrations(name) VALUES(?)').bind(entry.tag)]);
    }
  }
}
