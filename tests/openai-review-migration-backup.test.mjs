import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {fixture} from './harness.mjs';
import {exportBackup,restoreIntoEmptyDatabase} from '../src/backup.mjs';
import {digest,stable} from '../src/security.mjs';
import {openaiReviewMigrationTag,validateOpenaiReviewMigrationSource} from '../scripts/migration-contract.mjs';
import {createSourceInventory,verifyRestoredInventory} from '../scripts/migration-inventory.mjs';
const stamp='2026-11-07T00:00:00.000Z';
const source=tag=>readFileSync(new URL('../drizzle/'+tag+'.sql',import.meta.url),'utf8');
const run=(user,id,status='succeeded')=>({user_id:user,id,account:'V字',status,mode:'full',requested_mode:'full',beijing_date:'2026-11-07',created_at:stamp,completed_at:status==='succeeded'?stamp:null,released_at:null,model:'synthetic-model',instruction_version:1,instructions:'private instructions',baseline_run_id:null,source_revision:0,source_manifest_json:'{}',source_data_json:'{"private":"full capture"}',input_json:'{"delta":[]}',report_markdown:'private report',summary_json:'{}',error_code:null,error_message:null,provider_response_id:null,provider_calls:1});
async function insert(db,table,row){const cols=Object.keys(row);await db.prepare(`INSERT INTO ${table}(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).bind(...Object.values(row)).run();}
test('0020 is additive, hash pinned, UUID checked, and unresolved runs serialize only the same owner/account',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('PRAGMA foreign_keys=ON');
 const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url)));
 for(const {tag} of journal.entries.slice(0,20))db.exec(source(tag));
 db.prepare('INSERT INTO matrix_users VALUES(?,?,?,?)').run('owner','owner','synthetic',stamp);
 db.prepare('INSERT INTO matrix_review_articles(user_id,id,title,created_at,updated_at) VALUES(?,?,?,?,?)').run('owner','legacy','unchanged',stamp,stamp);
 const before=db.prepare('SELECT * FROM matrix_review_articles').all();
 const sql=source(openaiReviewMigrationTag);assert.throws(()=>validateOpenaiReviewMigrationSource(openaiReviewMigrationTag,sql+' '));
 for(const statement of validateOpenaiReviewMigrationSource(openaiReviewMigrationTag,sql))db.exec(statement);
 assert.deepEqual(db.prepare('SELECT * FROM matrix_review_articles').all(),before);
 function add(row){const cols=Object.keys(row);return db.prepare(`INSERT INTO matrix_openai_review_runs(${cols.join(',')}) VALUES(${cols.map(()=>'?')})`).run(...Object.values(row));}
 add(run('owner',randomUUID()));add(run('owner',randomUUID()));
 assert.throws(()=>add(run('owner','bad-id')));
 for(const beijing_date of ['2026-02-30','2026-99-99','bad'])assert.throws(()=>add({...run('owner',randomUUID()),beijing_date}));
 add(run('owner',randomUUID(),'uncertain'));
 assert.throws(()=>add(run('owner',randomUUID(),'running')));
 db.prepare("UPDATE matrix_openai_review_runs SET released_at=? WHERE status='uncertain'").run(stamp);
 add(run('owner',randomUUID(),'running'));
 assert.equal(db.prepare('SELECT count(*) AS n FROM matrix_openai_review_runs').get().n,4);
 assert.equal(db.prepare("SELECT status FROM matrix_openai_review_runs WHERE released_at IS NOT NULL").get().status,'uncertain');
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('v17 retains every review table and full run source, scopes both owners, and round trips an independent inventory',async t=>{
 const src=await fixture(t),owner=(await src.db.prepare('SELECT id FROM matrix_users').first()).id,other=randomUUID();
 await src.db.prepare('INSERT INTO matrix_users VALUES(?,?,?,?)').bind(other,'other','synthetic',stamp).run();
 for(const user of [owner,other]) {
  await insert(src.db,'matrix_openai_review_config',{user_id:user,account:'V字',instructions:'private '+user,version:1,updated_at:stamp});
  for(const status of ['succeeded','failed','uncertain'])await insert(src.db,'matrix_openai_review_runs',run(user,randomUUID(),status));
  await insert(src.db,'matrix_openai_review_runs',{...run(user,randomUUID(),'uncertain'),released_at:stamp});
  const article=randomUUID(),benchmark=randomUUID();
  await src.db.prepare('INSERT INTO matrix_review_articles(user_id,id,title,created_at,updated_at) VALUES(?,?,?,?,?)').bind(user,article,'retained article',stamp,stamp).run();
  await insert(src.db,'matrix_review_snapshots',{user_id:user,id:randomUUID(),article_id:article,snapshot_date:'2026-11-07'});
  await insert(src.db,'matrix_review_reports',{user_id:user,id:randomUUID(),account:'V字',period_type:'daily',period_start:'2026-11-07',period_end:'2026-11-07',created_at:stamp});
  await insert(src.db,'matrix_review_playbooks',{user_id:user,id:randomUUID(),account:'V字',version:1,published_on:'2026-11-07',created_at:stamp});
  await insert(src.db,'matrix_review_benchmark_accounts',{user_id:user,id:benchmark,account:'V字',platform:'toutiao',name:'retained benchmark',created_at:stamp,updated_at:stamp});
  await insert(src.db,'matrix_review_benchmark_articles',{user_id:user,id:randomUUID(),benchmark_account_id:benchmark,title:'retained comparison',url:'https://example.invalid/article',created_at:stamp,updated_at:stamp});
  await insert(src.db,'matrix_review_notes',{user_id:user,id:randomUUID(),account:'V字',note_date:'2026-11-07',kind:'decision',title:'retained note',created_at:stamp,updated_at:stamp});
  await insert(src.db,'matrix_review_account_health',{user_id:user,id:randomUUID(),account:'V字',platform:'toutiao',observed_on:'2026-11-07',created_at:stamp,updated_at:stamp});
 }
 const full=await exportBackup(src.db),scoped=await exportBackup(src.db,{todoUserId:owner});
 assert.equal(full.data.format,'haoduoyu-matrix-d1-v18');assert.equal(Object.keys(full.data.tables).length,39);
 assert.deepEqual(full.data.tables.review_article_diagnoses,[]);
 for(const name of Object.keys(full.data.tables).filter(name=>!['review_prompt_versions','review_article_diagnoses'].includes(name)&&(name.startsWith('review_')||name.startsWith('openai_review_')))) {
  assert.ok(full.data.tables[name].length>=2,name);assert.ok(scoped.data.tables[name].length>=1,name);
  assert.ok(scoped.data.tables[name].every(row=>row.user_id===owner),name);
 }
 assert.equal(full.data.tables.openai_review_runs.length,8);
 assert.equal(scoped.data.tables.openai_review_runs.length,4);
 assert.ok(!Object.keys(full.data.tables.openai_review_config[0]).some(key=>/secret|token|api_key/.test(key)));
 const target=await fixture(t,{bootstrap:false}),inventory=await createSourceInventory(src.db);
 await restoreIntoEmptyDatabase(target.db,full,{allowEmptyRestore:true});
 assert.deepEqual(await verifyRestoredInventory(target.db,full,inventory),{verified:true,restored_tables:39,reset_tables:3});
});
test('v15 backups remain restorable without inventing review history or losing todo fields',async t=>{
 const src=await fixture(t),backup=await exportBackup(src.db);
 for(const name of Object.keys(backup.data.tables).filter(name=>name.startsWith('review_')||name.startsWith('openai_review_')||name==='daily_scores')) {assert.deepEqual(backup.data.tables[name],[]);delete backup.data.tables[name];}
 backup.data.format='haoduoyu-matrix-d1-v15';backup.sha256=digest(JSON.stringify(stable(backup.data)));
 const target=await fixture(t,{bootstrap:false});
 const result=await restoreIntoEmptyDatabase(target.db,backup,{allowEmptyRestore:true});
 assert.equal(result.counts.openai_review_runs,0);assert.equal(result.counts.review_articles,0);
});
