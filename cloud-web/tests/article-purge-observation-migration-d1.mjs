// Real SQLite and isolated workerd D1 migration/guard tests, synthetic records
// only. A synthetic owner observation is not production lifecycle acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';

const root=path.resolve(import.meta.dirname,'..');
const journal=JSON.parse(fs.readFileSync(path.join(root,'drizzle/meta/_journal.json'),'utf8'));
assert.equal(journal.entries.at(-1).tag,'0049_article_purge_codex_observations');
const migration=fs.readFileSync(path.join(root,'drizzle/0049_article_purge_codex_observations.sql'),'utf8');
const statements=migration.split('--> statement-breakpoint').map(v=>v.trim()).filter(Boolean);
const hash=x=>createHash('sha256').update(typeof x==='string'||x instanceof Uint8Array?x:JSON.stringify(x)).digest('hex');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const acquired='2026-01-01T00:00:00.000Z',purged='2026-01-01T01:00:00.000Z',ended='2026-01-01T02:00:00.000Z',observed='2026-01-01T03:00:00.000Z',future='2999-01-01T00:00:00.000Z';
const checkNames=[];
const oldMigrationHashes=journal.entries.slice(0,49).map(e=>({path:`drizzle/${e.tag}.sql`,sha256:hash(fs.readFileSync(path.join(root,'drizzle',e.tag+'.sql')))}));

async function suite(label,db,apply){
 const run=(s,...v)=>db.run(s,v),get=(s,...v)=>db.get(s,v),all=(s,...v)=>db.all(s,v);
 const check=async(name,fn)=>{await fn();checkNames.push(label+': '+name);console.log('PASS '+label+': '+name)};
 const insert=(table,row)=>run(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`,...Object.values(row));
 async function block(owner,n,kind){
  const article=id(n),op=id(n+1000),acquisition=id(n+2000),claim=hash(owner+' claim'),input=hash(owner+' input');
  const receipt={owner,request_key:acquisition,article_id:article,handoff_id:id(n+3000),event_id:id(n+4000),claim_hash:claim,created:acquired};
  const safety={article_id:article,claim_sha256:claim,execution_sha256:kind==='mapped_executor'?hash(owner+' execution'):null,input_sha256:input,grant_request_key:kind==='mapped_executor'?id(n+5000):null,token_sha256:kind==='mapped_executor'?hash(owner+' token'):null,epoch:kind==='mapped_executor'?1:null,acquisition_request_key:acquisition,holder_mode:kind};
  const graph=[{table:'article_help_queue_claims',keys:['request_key'],values:[acquisition],fingerprint:hash(receipt),article_id:article,action:'delete'},{table:'article_handoffs',keys:['id'],values:[receipt.handoff_id],fingerprint:hash('synthetic handoff row'),article_id:article,action:'delete'}];
  const snapshot=[{id:article,graph,safety:[safety]}];
  await insert('article_list_deletions',{id:op,owner,scope:'all_articles',request_key:id(n+6000),state:'deleting',snapshot_json:JSON.stringify(snapshot),snapshot_sha256:hash(snapshot),created:purged,expires:future,confirmed_at:purged,lock_token:id(n+7000),lock_expires:future});
  await insert('article_deletions',{id:article,owner,state:'deleting',started_at:purged,operation_id:op,lock_token:id(n+7000),lock_expires:future});
  for(const [entity_kind,entity_key] of [['article_handoffs',receipt.handoff_id],['article_help_queue_claims',acquisition]])await insert('article_content_fences',{owner,entity_kind,entity_key,article_id:article,operation_id:op,created:purged});
  const b={owner,...safety,operation_id:op,reason:'external_end_unconfirmed',created:purged};
  await insert('article_purge_serial_blocks',b);
  await run("UPDATE article_deletions SET state='deleted',deleted_at=? WHERE id=?",purged,article);
  await run("UPDATE article_list_deletions SET state='deleted',deleted_at=?,lock_token=NULL,lock_expires=NULL WHERE id=?",purged,op);
  return {b,receipt,op,snapshot};
 }
 function endRow(c,n){return {owner:c.b.owner,article_id:c.b.article_id,operation_id:c.op,request_key:id(n),payload_sha256:hash('end payload '+n),claim_sha256:c.b.claim_sha256,execution_sha256:c.b.execution_sha256,input_sha256:c.b.input_sha256,grant_request_key:c.b.grant_request_key,token_sha256:c.b.token_sha256,epoch:c.b.epoch,acquisition_request_key:c.b.acquisition_request_key,holder_mode:c.b.holder_mode,observed_execution_sha256:c.b.execution_sha256||hash(c.b.owner+' observed execution'),evidence_kind:'holder_acknowledgement',end_reference_sha256:hash('end '+n),settled_reference_sha256:hash('settled '+n),all_actions_stopped:1,all_actions_settled:1,server_verified:0,created:observed};}
 const mapped=await block('SYNTHETIC-MAPPED',10,'mapped_executor'),manual=await block('SYNTHETIC-MANUAL',11,'manual_help'),unknown=await block('SYNTHETIC-UNKNOWN',12,'unknown');
 const legacyEnd=endRow(mapped,200);await insert('article_purge_executor_ends',legacyEnd);
 const beforeEnds=await all('SELECT * FROM article_purge_executor_ends ORDER BY owner,request_key');
 const beforeTriggers=await all("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name");
 const beforeIndexes=await all("SELECT name,sql FROM sqlite_master WHERE type='index' AND tbl_name='article_purge_executor_ends' ORDER BY name");
 await check('failed migration batch rolls back all trigger/table changes and preserves original ends',async()=>{
  await assert.rejects(apply(true));
  assert.deepEqual(await all("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name"),beforeTriggers);
  assert.deepEqual(await all('SELECT * FROM article_purge_executor_ends ORDER BY owner,request_key'),beforeEnds);
  assert.equal((await get("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name='article_purge_executor_observations'")).n,0);
 });
 await apply(false);
 await check('0000–0049 migration preserves every existing end row and index',async()=>{
  assert.deepEqual(await all('SELECT * FROM article_purge_executor_ends ORDER BY owner,request_key'),beforeEnds);
  assert.deepEqual(await all("SELECT name,sql FROM sqlite_master WHERE type='index' AND tbl_name='article_purge_executor_ends' ORDER BY name"),beforeIndexes);
 });
 await check('all 162 pre-existing triggers including 4 capacity guards remain byte-identical',async()=>{
  assert.equal(beforeTriggers.length,162);
  const after=new Map((await all("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name")).map(r=>[r.name,r.sql]));
  for(const trigger of beforeTriggers)assert.equal(after.get(trigger.name),trigger.sql,trigger.name);
  assert.equal(after.size,166);
 });
 const observation={owner:manual.b.owner,request_key:id(201),article_id:manual.b.article_id,operation_id:manual.op,snapshot_sha256:hash('synthetic server context'),purge_snapshot_sha256:hash(manual.snapshot),payload_sha256:hash('synthetic owner observation payload'),claim_sha256:manual.b.claim_sha256,input_sha256:manual.b.input_sha256,acquisition_request_key:manual.b.acquisition_request_key,original_receipt_sha256:hash(manual.receipt),observed_execution_sha256:hash('synthetic old execution'),thread_sha256:hash('synthetic original thread'),turn_sha256:hash('synthetic original turn'),mapping_reference_sha256:hash('synthetic verified mapping'),end_reference_sha256:hash('synthetic terminal'),settled_reference_sha256:hash('synthetic all issued actions settled'),acquired_at:acquired,ended_at:ended,observed_at:observed,terminal_state:'completed',evidence_source:'codex_app_tools',all_actions_stopped:1,all_actions_settled:1,server_verified:0,created:observed};
 const ownerEnd={...endRow(manual,201),payload_sha256:observation.payload_sha256,observed_execution_sha256:observation.observed_execution_sha256,evidence_kind:'owner_observed_codex_terminal',end_reference_sha256:observation.end_reference_sha256,settled_reference_sha256:observation.settled_reference_sha256};
 await check('owner-observed end cannot be inserted without an exact prior observation',async()=>{
  await assert.rejects(insert('article_purge_executor_ends',ownerEnd),/article_purge_owner_observation_required/);
  assert.equal((await get('SELECT count(*) n FROM article_purge_executor_ends')).n,1);
 });
 await check('wrong owner/block/snapshot/receipt/input/acquisition and incomplete or nonterminal evidence all reject',async()=>{
  const variants=[{owner:'FOREIGN'},{article_id:id(999)},{operation_id:id(998)},{purge_snapshot_sha256:hash('wrong purge')},{original_receipt_sha256:hash('wrong receipt')},{input_sha256:hash('wrong input')},{claim_sha256:hash('wrong claim')},{acquisition_request_key:id(997)},{all_actions_stopped:0},{all_actions_settled:0},{server_verified:1},{terminal_state:'running'},{terminal_state:'unknown'},{evidence_source:'owner_assertion'},{acquired_at:ended},{ended_at:acquired.slice(0,11)+'00:00:00.001Z',observed_at:acquired},{observed_at:acquired},{created:acquired},{thread_sha256:'G'.repeat(64)},{turn_sha256:'a'.repeat(63)}];
  for(const extra of variants)await assert.rejects(insert('article_purge_executor_observations',{...observation,...extra}));
  assert.equal((await get('SELECT count(*) n FROM article_purge_executor_observations')).n,0);
 });
 await check('mapped executor and unknown holder cannot use manual owner-observed settlement',async()=>{
  for(const c of [mapped,unknown])await assert.rejects(insert('article_purge_executor_observations',{...observation,owner:c.b.owner,article_id:c.b.article_id,operation_id:c.op,claim_sha256:c.b.claim_sha256,input_sha256:c.b.input_sha256,acquisition_request_key:c.b.acquisition_request_key,purge_snapshot_sha256:hash(c.snapshot),original_receipt_sha256:hash(c.receipt)}));
 });
 await check('exact immutable manual-help observation appends with original receipt and true evidence type',async()=>{
  await insert('article_purge_executor_observations',observation);
  assert.deepEqual(await get('SELECT * FROM article_purge_executor_observations WHERE owner=?',manual.b.owner),observation);
  for(const extra of [{request_key:id(996)},{payload_sha256:hash('wrong payload')},{observed_execution_sha256:hash('wrong execution')},{end_reference_sha256:hash('wrong terminal')},{settled_reference_sha256:hash('wrong settled')},{created:ended}])await assert.rejects(insert('article_purge_executor_ends',{...ownerEnd,...extra}));
  await insert('article_purge_executor_ends',ownerEnd);
  assert.equal((await get('SELECT evidence_kind FROM article_purge_executor_ends WHERE owner=?',manual.b.owner)).evidence_kind,'owner_observed_codex_terminal');
 });
 await check('observation and end are append-only and duplicate conflicting keys cannot overwrite',async()=>{
  for(const table of ['article_purge_executor_observations','article_purge_executor_ends']){
   await assert.rejects(run(`UPDATE ${table} SET payload_sha256=? WHERE owner=?`,hash('replacement'),manual.b.owner),/immutable/);
   await assert.rejects(run(`DELETE FROM ${table} WHERE owner=?`,manual.b.owner),/immutable/);
  }
  await assert.rejects(insert('article_purge_executor_observations',{...observation,payload_sha256:hash('replacement')}));
  await assert.rejects(insert('article_purge_executor_ends',{...ownerEnd,payload_sha256:hash('replacement')}));
 });
 await check('original blocks and source fences remain immutable and late article/help/Word regrant writes reject',async()=>{
  for(const table of ['article_purge_serial_blocks','article_content_fences']){
   await assert.rejects(run(`DELETE FROM ${table} WHERE owner=?`,manual.b.owner),/immutable/);
   await assert.rejects(run(`UPDATE ${table} SET operation_id=? WHERE owner=?`,id(995),manual.b.owner),/immutable/);
  }
  await assert.rejects(insert('articles',{id:manual.b.article_id,owner:manual.b.owner,title:'Synthetic late writer',filename:'synthetic.txt',source_key:'synthetic',paragraphs:'["SYNTHETIC ONLY"]',state:'queued',created:observed}),/PERMANENTLY_DELETED/);
  await assert.rejects(insert('article_help_queue_claims',manual.receipt),/PERMANENTLY_DELETED/);
  const r={owner:manual.b.owner,request_key:id(994),target_kind:'article',target_id:manual.b.article_id,input_sha256:manual.b.input_sha256,claim_hash:manual.b.claim_sha256,token_hash:hash('late grant token'),execution_id:id(993),epoch:1,created:observed};
  await assert.rejects(insert('word_execution_receipts',r),/PERMANENTLY_DELETED/);
 });
 await check('unknown old holder still blocks new targets while safely settled manual holder restores only its owner capacity',async()=>{
  const newReceipt=(owner,n)=>({owner,request_key:id(n),target_kind:'article',target_id:id(n+100),input_sha256:hash('new input'),claim_hash:hash('new claim'),token_hash:hash('new token '+owner),execution_id:id(n+200),epoch:1,created:observed});
  await assert.rejects(insert('word_execution_receipts',newReceipt(unknown.b.owner,500)),/external_word_executor_end_unconfirmed/);
  await insert('word_execution_receipts',newReceipt(manual.b.owner,501));
  assert.equal((await get('SELECT count(*) n FROM article_purge_serial_blocks WHERE owner=?',manual.b.owner)).n,1);
  assert.equal((await get('SELECT count(*) n FROM article_content_fences WHERE owner=?',manual.b.owner)).n,2);
 });
 return {oldTriggers:beforeTriggers.length,trigger_hashes:beforeTriggers.map(t=>({name:t.name,sha256:hash(t.sql)})),preserved_end_rows:beforeEnds.length};
}

const sqlite=new DatabaseSync(':memory:');
let sqliteResult,d1Result;
try {
 for(const e of journal.entries.slice(0,49))sqlite.exec(fs.readFileSync(path.join(root,'drizzle',e.tag+'.sql'),'utf8'));
 sqliteResult=await suite('SQLite',{run:async(s,v)=>sqlite.prepare(s).run(...v),get:async(s,v)=>Object.assign({},sqlite.prepare(s).get(...v)),all:async(s,v)=>sqlite.prepare(s).all(...v).map(r=>({...r}))},async(fail)=>{sqlite.exec('BEGIN');try{for(const s of statements)sqlite.exec(s);if(fail)sqlite.exec("INSERT INTO article_purge_executor_observations(owner) VALUES('SYNTHETIC_ROLLBACK_ONLY')");sqlite.exec('COMMIT')}catch(e){sqlite.exec('ROLLBACK');throw e}});
}finally{sqlite.close()}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'purge-observation-baseline-'));
fs.mkdirSync(path.join(tmp,'meta'));
fs.writeFileSync(path.join(tmp,'meta/_journal.json'),JSON.stringify({...journal,entries:journal.entries.slice(0,49)}));
for(const e of journal.entries.slice(0,49))fs.copyFileSync(path.join(root,'drizzle',e.tag+'.sql'),path.join(tmp,e.tag+'.sql'));
const mf=new Miniflare({cf:false,port:0,modules:true,script:'export default {fetch(){return new Response("SYNTHETIC OBSERVATION MIGRATION ONLY")}}',compatibilityDate:'2026-05-22',d1Databases:{DB:'purge-observation-migration-isolated'}});
try {
 const d1=await mf.getD1Database('DB');await migrate(drizzle(d1),{migrationsFolder:tmp});
 d1Result=await suite('actual workerd D1',{run:(s,v)=>d1.prepare(s).bind(...v).run(),get:(s,v)=>d1.prepare(s).bind(...v).first(),all:async(s,v)=>(await d1.prepare(s).bind(...v).all()).results},async(fail)=>fail?await d1.batch([...statements,"INSERT INTO article_purge_executor_observations(owner) VALUES('SYNTHETIC_ROLLBACK_ONLY')"].map(s=>d1.prepare(s))):await migrate(drizzle(d1),{migrationsFolder:path.join(root,'drizzle')}));
 await migrate(drizzle(d1),{migrationsFolder:path.join(root,'drizzle')});console.log('PASS actual workerd D1: repeated full migration is idempotent');checkNames.push('actual workerd D1: repeated full migration is idempotent');
}finally{await mf.dispose();fs.rmSync(tmp,{recursive:true,force:true})}
const result={result:'PASS',checks:checkNames.length,check_names:checkNames,migrations:'0000–0049',original_migration_hashes:oldMigrationHashes,migration_0049_sha256:hash(migration),sqlite:sqliteResult,workerd_d1:d1Result,production_writes:0,remote_calls:0,real_lifecycle_observed:false,source_data:'synthetic only'};
const output=process.env.PURGE_OBSERVATION_MIGRATION_EVIDENCE;
if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n')}
console.log(JSON.stringify({result:result.result,checks:result.checks,migrations:result.migrations,production_writes:0,remote_calls:0,real_lifecycle_observed:false},null,2));
