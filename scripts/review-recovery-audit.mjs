// Offline only. The caller supplies two independently obtained local copies of one data cut.
import {createHash} from 'node:crypto';
import {readFileSync,statSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {reviewArchiveMigrationTag,validateReviewArchiveMigrationSource} from './migration-contract.mjs';
import {resetTables,restoredTablesForFormat} from './migration-inventory.mjs';

const namesFor=version=>[...restoredTablesForFormat('haoduoyu-matrix-d1-v'+version),...resetTables].map(name=>'matrix_'+name);
const beforeTables=namesFor(18).sort(),afterTables=namesFor(19).sort();
const newTables=afterTables.filter(name=>!beforeTables.includes(name));
const draftFields=['publish_status','draft_saved_at','alternate_titles_json'];
const receiptPrefix='review-publication:';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const serial=value=>typeof value==='bigint'?['integer',value.toString()]:
  value instanceof Uint8Array?['blob',Buffer.from(value).toString('hex')]:[typeof value,value];
const rowValues=(row,fields=Object.keys(row).sort())=>fields.map(field=>[field,serial(row[field])]);
const identity=(row,fields)=>hash(rowValues(row,fields));
const fail=(section,table)=>{throw Object.assign(new Error('Recovery verification failed'),{section,table});};

function tableNames(db) {
  return db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name GLOB 'matrix_*' ORDER BY name").all().map(row=>row.name);
}
const equals=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
function checkIntegrity(db) {
  const integrity=db.prepare('PRAGMA quick_check').all();
  if(integrity.length!==1||Object.values(integrity[0])[0]!=='ok')fail('integrity');
  if(db.prepare('PRAGMA foreign_key_check').iterate().next().done!==true)fail('foreign_keys');
}
function shape(db,name) {
  return db.prepare('SELECT type,name,sql FROM sqlite_schema WHERE tbl_name=? ORDER BY type,name').all(name);
}
function readableRows(db,name) {
  const statement=db.prepare('SELECT * FROM '+name);
  statement.setReadBigInts(true);
  return statement.iterate();
}
function tableRows(db,name) {
  const fields=db.prepare('PRAGMA table_info('+name+')').all();
  if(name==='matrix_review_articles'&&draftFields.some(field=>!fields.some(column=>column.name===field)))
    fail('draft_columns',name);
  const primary=fields.filter(column=>column.pk>0).sort((a,b)=>a.pk-b.pk).map(column=>column.name);
  const summaries=[];
  for(const row of readableRows(db,name)) {
    const sha=identity(row);
    summaries.push([primary.length?identity(row,primary):sha,sha]);
  }
  return summaries.sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]));
}
function reviewSummaries(db) {
  const articles=new Set(),drafts=[],receipts=[],aliases=[],snapshots=[];
  const present=Object.fromEntries(draftFields.map(field=>[field,0]));
  for(const row of readableRows(db,'matrix_review_articles')) {
    articles.add(identity(row,['user_id','id']));
    drafts.push(identity(row,['user_id','id',...draftFields]));
    for(const field of draftFields)if(row[field]!==null)present[field]++;
  }
  let aliasesNeedingReview=0;
  for(const row of readableRows(db,'matrix_idempotency')) {
    if(!row.actor.startsWith(receiptPrefix))continue;
    receipts.push(identity(row));
    const proof=JSON.parse(row.response_json);
    if(!proof||typeof proof!=='object'||Array.isArray(proof))fail('publication_receipt','matrix_idempotency');
    if(!proof.canonical_id)continue;
    const owner=row.actor.slice(receiptPrefix.length);
    aliases.push(hash([owner,row.key,proof.canonical_id]));
    if(![row.key,proof.canonical_id].every(id=>articles.has(identity({user_id:owner,id},['user_id','id']))))aliasesNeedingReview++;
  }
  for(const row of readableRows(db,'matrix_review_snapshots'))
    snapshots.push([identity(row,['user_id','id']),identity(row,['user_id','article_id']),identity(row)]);
  const summarize=records=>({count:records.length,sha256:hash(records.sort())});
  return {drafts:summarize(drafts),receipts:summarize(receipts),aliases:summarize(aliases),snapshots:summarize(snapshots),
    present,aliases_needing_review:aliasesNeedingReview};
}

function checkNewArchiveTables(target) {
  const migration=new URL(`../drizzle/${reviewArchiveMigrationTag}.sql`,import.meta.url);
  const statements=validateReviewArchiveMigrationSource(reviewArchiveMigrationTag,readFileSync(migration,'utf8'));
  const expected=new DatabaseSync(':memory:');
  try {
    for(const statement of statements)expected.exec(statement);
    for(const name of newTables) {
      if(!equals(shape(expected,name),shape(target,name)))fail('table_schema',name);
      if(!target.prepare('SELECT 1 FROM '+name+' LIMIT 1').iterate().next().done)fail('archive_not_empty',name);
    }
  }finally {
    expected.close();
  }
}

export function auditReviewRecovery(source,target,{phase='restore'}={}) {
  if(!['restore','migrate'].includes(phase))fail('phase');
  const sourceTables=tableNames(source),targetTables=tableNames(target);
  if(!equals(sourceTables,beforeTables)&&!equals(sourceTables,afterTables))fail('source_tables');
  if(phase==='migrate'&&!equals(sourceTables,beforeTables))fail('source_tables');
  if(!equals(targetTables,phase==='migrate'?afterTables:sourceTables))fail('target_tables');
  checkIntegrity(source);
  checkIntegrity(target);
  let rowsChecked=0;
  const tableDigests={};
  for(const name of sourceTables) {
    if(!equals(shape(source,name),shape(target,name)))fail('table_schema',name);
    const original=tableRows(source,name),restored=tableRows(target,name);
    if(!equals(original,restored))fail('table_rows',name);
    tableDigests[name]={rows:original.length,sha256:hash(original)};
    rowsChecked+=original.length;
  }
  if(phase==='migrate')checkNewArchiveTables(target);
  const original=reviewSummaries(source),restored=reviewSummaries(target);
  if(!equals(original,restored))fail('review_details');
  return {verified:true,phase,tables_checked:sourceTables.length,rows_checked:rowsChecked,table_digests:tableDigests,review:restored};
}

function run(argv) {
  const [phase,source,target,...rest]=argv;
  if(rest.length||!['restore','migrate'].includes(phase)||!source||!target)fail('arguments');
  const left=statSync(source),right=statSync(target);
  if(!left.isFile()||!right.isFile()||left.dev===right.dev&&left.ino===right.ino)fail('files');
  const opened=[];
  try {
    for(const path of [source,target]) {
      const db=new DatabaseSync(path,{readOnly:true});
      opened.push(db);
      db.exec('BEGIN');
    }
    const result=auditReviewRecovery(...opened,{phase});
    // Individual row digests are used in memory. The terminal summary omits digests, IDs, paths and content.
    const {review,tables_checked,rows_checked}=result;
    process.stdout.write(JSON.stringify({verified:true,phase,tables_checked,rows_checked,
      draft_fields_present:review.present,publication_receipts:review.receipts.count,
      original_draft_links:review.aliases.count,aliases_needing_review:review.aliases_needing_review,
      historical_snapshots:review.snapshots.count})+'\n');
  }finally {
    for(const db of opened.reverse())db.close();
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {run(process.argv.slice(2));}
  catch(error) {
    process.stderr.write(JSON.stringify({verified:false,section:error.section??'unavailable',
      ...(error.table?{table:error.table}:{})})+'\n');
    process.exitCode=1;
  }
}
