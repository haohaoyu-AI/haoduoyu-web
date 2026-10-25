// Synthetic local D1 candidate runner only; no Worker route or cloud connection.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

export const graphTables=['matrix_articles','matrix_observations','matrix_daily_metrics'];
export const graphMigration='0005_article_pipeline';
const scratch='matrix_article_pipeline_assert';
const quote=name=>'"'+name.replaceAll('"','""')+'"';
// D1-owned _cf_ tables are outside the application graph. Never inspect their
// foreign keys or attempt an authorizer-rejected metadata operation again.
const catalogSql="SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND substr(name,1,4)<>'_cf_' AND name<>'"+scratch+"' ORDER BY type,name";
const normalized=sql=>sql.trim().replace(/;$/,'');
export async function candidateStatements() {
  return (await readFile(new URL('../migration-candidates/0005_article_pipeline.sql',import.meta.url),'utf8'))
    .split('--> statement-breakpoint').map(sql=>sql.trim()).filter(Boolean);
}
export async function preflightGraphCandidate(db) {
  const catalog=(await db.prepare(catalogSql).all()).results;
  const source=(await readFile(new URL('../drizzle/0000_lively_stellaris.sql',import.meta.url),'utf8'))
    .split('--> statement-breakpoint').map(sql=>sql.trim()).filter(Boolean);
  if(catalog.some(row=>['view','trigger'].includes(row.type)))throw Error('GRAPH_UNKNOWN_VIEW_OR_TRIGGER');
  const tables=catalog.filter(row=>row.type==='table');
  if(tables.some(row=>!row.name.startsWith('matrix_')&&row.name!=='__fixture_migrations'))throw Error('GRAPH_UNKNOWN_USER_TABLE');
  if(tables.some(row=>row.name.endsWith('_next')||row.name===scratch))throw Error('GRAPH_TEMPORARY_OBJECT');
  assert.equal(tables.filter(row=>row.name.startsWith('matrix_')).length,16,'GRAPH_UNEXPECTED_SCHEMA');
  for(const name of graphTables) {
    const actual=catalog.find(row=>row.type==='table'&&row.name===name)?.sql;
    const expected=source.find(sql=>sql.startsWith('CREATE TABLE `'+name+'`'));
    assert.equal(normalized(actual||''),normalized(expected||''),'GRAPH_SOURCE_TABLE_CHANGED: '+name);
    const actualIndexes=catalog.filter(row=>row.type==='index'&&row.tbl_name===name&&row.sql).map(row=>normalized(row.sql)).sort();
    const expectedIndexes=source.filter(sql=>/^CREATE (?:UNIQUE )?INDEX/.test(sql)&&sql.includes(' ON `'+name+'`')).map(normalized).sort();
    assert.deepEqual(actualIndexes,expectedIndexes,'GRAPH_SOURCE_INDEX_CHANGED: '+name);
  }
  // The only non-business table allowed is our known one-column local ledger.
  // Unknown user tables fail closed above instead of widening metadata access.
  assert.equal(normalized(tables.find(row=>row.name==='__fixture_migrations')?.sql||''),
    'CREATE TABLE __fixture_migrations(name TEXT PRIMARY KEY)','GRAPH_LOCAL_LEDGER_CHANGED');
  for(const {name} of tables.filter(row=>row.name.startsWith('matrix_'))) {
    const foreign=(await db.prepare('PRAGMA foreign_key_list('+quote(name)+')').all()).results;
    for(const item of foreign.filter(row=>graphTables.includes(row.table))) {
      if(!['matrix_observations','matrix_daily_metrics'].includes(name)||item.table!=='matrix_articles'||
        item.from!=='article_id'||item.to!=='id'||item.on_delete!=='NO ACTION'||item.on_update!=='NO ACTION')
        throw Error('GRAPH_UNKNOWN_INBOUND_FOREIGN_KEY');
    }
  }
  if(!catalog.some(row=>row.name==='__fixture_migrations'))throw Error('GRAPH_LOCAL_LEDGER_REQUIRED');
  if(await db.prepare('SELECT name FROM __fixture_migrations WHERE name=?').bind(graphMigration).first())
    throw Error('GRAPH_ALREADY_APPLIED');
  return catalog;
}

export async function applyGraphCandidate(db,{injectAfter,corruptCopy,changeCatalog,ledgerFailure=false}={}) {
  const footprint=await db.prepare('SELECT count(*) AS objects FROM sqlite_schema').all();
  const catalog=await preflightGraphCandidate(db),sql=await candidateStatements();
  assert.equal(sql.length,25,'Review any change to the candidate statement set');
  assert.match(sql[0],/CREATE TABLE `matrix_article_pipeline_assert`/);
  // Validate the entire metadata snapshot again inside the same batch, after the
  // scratch table exists and before touching any business table. No schema race
  // between preflight and the batch is silently accepted.
  const catalogGuard=db.prepare(`INSERT INTO ${scratch}(ok) SELECT CASE WHEN
    (SELECT json_group_array(json_object('type',type,'name',name,'tbl_name',tbl_name,'sql',sql))
      FROM (${catalogSql}))=? THEN 1 ELSE 0 END`).bind(JSON.stringify(catalog));
  const statements=[db.prepare(sql[0]),catalogGuard];
  for(let index=1;index<sql.length;index++) {
    statements.push(db.prepare(sql[index]));
    if(corruptCopy&&index===6)statements.push(db.prepare("UPDATE matrix_observations_next SET note='synthetic-corruption'"));
    if(index===injectAfter)statements.push(db.prepare('SELECT * FROM synthetic_injected_graph_failure'));
  }
  // The local fixture ledger update is in the exact same batch as all DDL.
  // This does not claim an untested Wrangler/remote migration transport works.
  statements.push(db.prepare('INSERT INTO __fixture_migrations(name) VALUES(?)')
    .bind(ledgerFailure?'0004_daily_notes':graphMigration));
  if(changeCatalog)await changeCatalog();
  const results=await db.batch(statements);
  return {results,statements:statements.length,beforeBytes:footprint.meta?.size_after,
    peakBytes:Math.max(...results.map(row=>row.meta?.size_after||0)),
    rowsRead:results.reduce((sum,row)=>sum+(row.meta?.rows_read||0),0),
    rowsWritten:results.reduce((sum,row)=>sum+(row.meta?.rows_written||0),0)};
}
