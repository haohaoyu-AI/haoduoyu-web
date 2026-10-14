// Actual local workerd/D1; synthetic sources only. No event, model, image,
// platform, browser, user desktop or production job access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash,webcrypto} from 'node:crypto';
import ts from 'typescript';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
const nativeRequire=createRequire(import.meta.url),hash=v=>createHash('sha256').update(v).digest('hex');
const baseline=fs.mkdtempSync(path.join(os.tmpdir(),'local-word-queue-d1-'));
const target=fs.mkdtempSync(path.join(os.tmpdir(),'local-word-queue-target-'));
const mf=new Miniflare({cf:false,modules:true,script:'export default {fetch(){return new Response("OFFLINE SYNTHETIC");}}',compatibilityDate:'2026-05-22',d1Databases:{DB:'local-word-queue-offline'}});
let groups=0;async function check(name,fn){await fn();groups++;console.log('PASS '+name);}
try{
 const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json','utf8'));const targetIndex=journal.entries.findIndex(e=>e.tag==='0035_local_word_queue');assert.ok(targetIndex>=0);journal.entries=journal.entries.slice(0,targetIndex+1);
 fs.mkdirSync(path.join(target,'meta'));fs.writeFileSync(path.join(target,'meta/_journal.json'),JSON.stringify(journal));
 for(const e of journal.entries)fs.copyFileSync('drizzle/'+e.tag+'.sql',path.join(target,e.tag+'.sql'));
 journal.entries.pop();
 fs.mkdirSync(path.join(baseline,'meta'));fs.writeFileSync(path.join(baseline,'meta/_journal.json'),JSON.stringify(journal));
 for(const e of journal.entries)fs.copyFileSync('drizzle/'+e.tag+'.sql',path.join(baseline,e.tag+'.sql'));
 const d1=await mf.getD1Database('DB'),orm=drizzle(d1);await migrate(orm,{migrationsFolder:baseline});
 const oldSchema=(await d1.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all()).results;
 await check('0035 adds only isolated receipts; all v110 schema preserved; migration rerun idempotent',async()=>{
  await migrate(orm,{migrationsFolder:target});
  assert.deepEqual((await d1.prepare("SELECT name,sql FROM sqlite_master WHERE tbl_name<>'local_word_queue_claims' ORDER BY name").all()).results,oldSchema);
  await migrate(orm,{migrationsFolder:target});
 });
 // Existing 0035 invariants above stay exact; exercise current core with all append-only migrations.
 await migrate(orm,{migrationsFolder:'drizzle'});
 const modules={};let io=0;const blocked=()=>{io++;throw Error('Offline test forbids external action');};
 function load(name){if(modules[name])return modules[name];const exports={};modules[name]=exports;
  const js=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{exports,structuredClone,require:n=>n==='cloudflare:workers'?{env:{DB:d1}}:n==='./test-store'?{db:()=>d1}:n==='./events'?{readiness:async()=>({connected:false}),dispatchLocalWord:blocked}:n==='./articles'?{bucket:blocked}:n.startsWith('./')?load(n.slice(2)):nativeRequire(n),process:{env:{}},setTimeout,clearTimeout,AbortSignal,ReadableStream,crypto:webcrypto,TextEncoder,TextDecoder,Date,Error,Set,Map,URL,Uint8Array,ArrayBuffer,DataView,atob,btoa,Response,fetch:blocked,console:{info:blocked}},{filename:name});return exports;
 }
 const queue=load('local-word-queue'),core=load('local-word-jobs');
 const uuid=()=>webcrypto.randomUUID(),exec=(suffix='one')=>'codex/thread/01a10c16-2e81-7091-a11d-1f51ca4740d5/run/'+suffix;
 const call=(owner,key,execution=exec(),name='claim_pending_local_word_job')=>queue.localWordQueueCall(owner,name,{claim_request_key:key,execution_id:execution});
 const read=(owner,key,execution=exec())=>call(owner,key,execution,'read_local_word_claim_receipt');
 const row=id=>d1.prepare('SELECT * FROM local_word_jobs WHERE id=?').bind(id).first();
 async function seed(owner){const title='OFFLINE synthetic title',paragraphs=['Synthetic body','','Synthetic heading','Synthetic ending'];return (await core.createLocalWordJob(owner,{request_key:uuid(),filename:'offline.txt',source_sha256:hash('OFFLINE synthetic bytes'),title,leading_blank_paragraphs:2,paragraphs,subheading_indices:[2],original_sha256:hash(JSON.stringify(['','',title,...paragraphs]))})).job;}
 const owner='SYNTHETIC-RACE',first=await seed(owner),second=await seed(owner),key=uuid();let winner;
 await check('8 same-key callers: one new grant, stable original token/input, no plaintext token in D1',async()=>{
  const replies=await Promise.all(Array.from({length:8},()=>call(owner,key)));winner=replies.find(r=>r.new_execution_grant);
  assert.equal(replies.filter(r=>r.new_execution_grant).length,1);assert.ok(replies.every(r=>r.claimed&&r.job_id===first.id&&r.claim_token===winner.claim_token));
  assert.equal(winner.input.leading_blank_paragraphs,2);assert.deepEqual(Array.from(winner.input.subheading_indices),[2]);assert.notEqual(winner.input.request_key,key);
  const receipt=await d1.prepare('SELECT * FROM local_word_queue_claims WHERE owner=?').bind(owner).first();assert.equal(receipt.execution_id,exec());
  assert.equal(receipt.claim_hash,hash(winner.claim_token));assert.equal(JSON.stringify(receipt).includes(winner.claim_token),false);assert.equal(JSON.stringify(await row(first.id)).includes(winner.claim_token),false);
  assert.equal((await row(second.id)).state,'queued');
 });
 await check('lost reply reconciles same key/execution; read creates no grant and never takes next job',async()=>{
  const recovered=await read(owner,key);assert.equal(recovered.claimed,true);assert.equal(recovered.new_execution_grant,false);assert.equal(recovered.same_claim_recovery,true);assert.equal(recovered.claim_token,winner.claim_token);
  assert.equal((await call(owner,key)).new_execution_grant,false);assert.equal((await row(second.id)).state,'queued');
  const missingKey=uuid();assert.equal((await read(owner,missingKey)).status,'not_recorded');assert.equal((await read(owner,missingKey)).retry_same_claim_request_key,true);
  assert.equal((await call(owner,missingKey)).job_id,second.id);
 });
 await check('cross-owner gives no data/token; different execution rejects even same authenticated owner/key',async()=>{
  const foreign=await read('SYNTHETIC-OTHER',key);assert.equal(foreign.status,'not_recorded');assert.equal('claim_token' in foreign,false);assert.equal('job_id' in foreign,false);
  await assert.rejects(read(owner,key,exec('other')));await assert.rejects(call(owner,key,exec('other')));
  for(const args of [{claim_request_key:key},{claim_request_key:key,execution_id:''},{claim_request_key:key,execution_id:exec(),owner},{claim_request_key:key,execution_id:exec(),destinations:['toutiao']}])await assert.rejects(queue.localWordQueueCall(owner,'claim_pending_local_word_job',args));
  await assert.rejects(call('',key));
 });
 await check('different keys racing one candidate: one new grant, loser immutable empty',async()=>{
  const o='SYNTHETIC-DIFFERENT-KEY',job=await seed(o),keys=Array.from({length:8},uuid);const replies=await Promise.all(keys.map(k=>call(o,k)));
  assert.equal(replies.filter(r=>r.new_execution_grant).length,1);assert.equal(replies.find(r=>r.new_execution_grant).job_id,job.id);
  await seed(o);for(let i=0;i<keys.length;i++)if(replies[i].status==='empty')assert.equal((await read(o,keys[i])).status,'empty');
 });
 await check('same key racing distinct executions: one binding, all foreign executions denied',async()=>{
  const o='SYNTHETIC-EXEC-RACE',job=await seed(o),k=uuid();const results=await Promise.allSettled([call(o,k,exec('a')),call(o,k,exec('b'))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.equal(results.find(r=>r.status==='fulfilled').value.job_id,job.id);
 });
 await check('live/expired/unknown prior execution, failed, completed, image plan and output are never queued anew',async()=>{
  for(const kind of ['live','expired','unknown','failed','completed','image_plan','output','result','error']){
   const o='SYNTHETIC-PROTECTED-'+kind,job=await seed(o);
   if(['live','expired'].includes(kind)){await core.localWordCall(o,'claim_local_word_job',{job_id:job.id});if(kind==='expired')await d1.prepare("UPDATE local_word_jobs SET claim_expires='2000-01-01T00:00:00.000Z' WHERE id=?").bind(job.id).run();}
   if(kind==='unknown')await d1.prepare("UPDATE local_word_jobs SET claim_hash=? WHERE id=?").bind(hash('unknown execution'),job.id).run();
   if(kind==='failed'||kind==='completed')await d1.prepare('UPDATE local_word_jobs SET state=? WHERE id=?').bind(kind==='failed'?'failed':'word_completed',job.id).run();
   if(kind==='image_plan'){const j=await row(job.id),manifest=JSON.parse(j.artifact_manifest);manifest.layout={sha256:hash('frozen images')};await d1.prepare('UPDATE local_word_jobs SET artifact_manifest=? WHERE id=?').bind(JSON.stringify(manifest),job.id).run();}
   if(kind==='output')await d1.prepare("UPDATE local_word_jobs SET output_meta='{}' WHERE id=?").bind(job.id).run();
   if(kind==='result')await d1.prepare("UPDATE local_word_jobs SET result_key='OFFLINE_RESULT' WHERE id=?").bind(job.id).run();
   if(kind==='error')await d1.prepare("UPDATE local_word_jobs SET error='OFFLINE unknown' WHERE id=?").bind(job.id).run();
   const before=await row(job.id);assert.equal((await call(o,uuid())).status,'empty');assert.deepEqual(await row(job.id),before);
  }
 });
 await check('source submission request key cannot masquerade as queue acquisition key',async()=>{const o='SYNTHETIC-SEPARATE-KEY',job=await seed(o),j=await row(job.id);await assert.rejects(call(o,j.request_key));assert.equal((await read(o,j.request_key)).status,'not_recorded');assert.equal((await row(job.id)).state,'queued');});
 await check('scope/destinations CHECK and frozen input guard reject platform-bearing or altered source',async()=>{
  const o='SYNTHETIC-SCOPE',job=await seed(o);
  for(const change of ["destinations_json='[\"toutiao\"]'","source_kind='web'","output_mode='text_only'","input_json='{}'"])await assert.rejects(d1.prepare('UPDATE local_word_jobs SET '+change+' WHERE id=?').bind(job.id).run());
 });
 await check('incomplete/noncanonical source excluded even if hand-inserted: no phantom generation',async()=>{
  const o='SYNTHETIC-INCOMPLETE',job=await seed(o);const j=await row(job.id);const fields=Object.keys(j),values=fields.map(k=>j[k]);values[fields.indexOf('id')]='localword_'+uuid();values[fields.indexOf('owner')]='SYNTHETIC-BAD-FREEZE';values[fields.indexOf('input_sha256')]=hash('bad input');
  await d1.prepare('INSERT INTO local_word_jobs('+fields.join(',')+') VALUES('+fields.map(()=>'?').join(',')+')').bind(...values).run();assert.equal((await call('SYNTHETIC-BAD-FREEZE',uuid())).status,'empty');
 });
 await check('expired/replaced/terminal receipts stay read-only without token or renewed grant',async()=>{
  for(const kind of ['expired','replaced','failed','completed']){
   const o='SYNTHETIC-RECEIPT-'+kind,job=await seed(o),k=uuid(),r=await call(o,k);
   if(kind==='expired')await d1.prepare("UPDATE local_word_jobs SET claim_expires='2000-01-01T00:00:00.000Z' WHERE id=?").bind(job.id).run();
   if(kind==='replaced')await d1.prepare('UPDATE local_word_jobs SET claim_hash=? WHERE id=?').bind(hash('replacement'),job.id).run();
   if(['failed','completed'].includes(kind))await d1.prepare('UPDATE local_word_jobs SET state=? WHERE id=?').bind(kind==='failed'?'failed':'word_completed',job.id).run();
   await seed(o);const before=await row(job.id);for(const response of [await read(o,k),await call(o,k)]){assert.equal(response.claimed,false);assert.equal(response.new_execution_grant,false);assert.equal('claim_token' in response,false);assert.equal(response.job_id,r.job_id);}assert.deepEqual(await row(job.id),before);
  }
 });
 await check('frozen upload recoverable only through original grant/exact job, queue does not regenerate',async()=>{
  const o='SYNTHETIC-UPLOAD',job=await seed(o),k=uuid(),r=await call(o,k);const meta={output_id:uuid(),size:100,sha256:hash('frozen bytes'),chunks:1,bytes:0,parts:[]};
  await d1.prepare('UPDATE local_word_jobs SET output_meta=? WHERE id=?').bind(JSON.stringify(meta),job.id).run();const recovered=await read(o,k);assert.equal(recovered.output.sha256,meta.sha256);assert.equal(recovered.new_execution_grant,false);assert.equal(recovered.claim_token,r.claim_token);
  assert.equal((await call(o,uuid())).status,'empty');await assert.rejects(core.localWordCall(o,'begin_local_word_output',{job_id:job.id,claim_token:r.claim_token,size:101,sha256:hash('different bytes'),chunks:1}));
  await assert.rejects(core.localWordCall(o,'finalize_local_word_output',{job_id:job.id,claim_token:r.claim_token,output_id:meta.output_id,execution:{executor:'xiaoyu_agent',execution_id:exec('foreign'),model:'OFFLINE',rendered_pages:1,verification_summary:'OFFLINE no real rendering'}}),/执行回执/);
 });
 await check('empty forever; immutable receipts resist updates/deletes',async()=>{
  const o='SYNTHETIC-EMPTY',k=uuid();assert.equal((await call(o,k)).status,'empty');await seed(o);assert.equal((await call(o,k)).status,'empty');assert.equal((await read(o,k)).status,'empty');
  await assert.rejects(d1.prepare("UPDATE local_word_queue_claims SET execution_id='changed' WHERE owner=?").bind(o).run());await assert.rejects(d1.prepare('DELETE FROM local_word_queue_claims WHERE owner=?').bind(o).run());
 });
 await check('receipt + ordinary lease rollback together on CAS failure; original key safe to retry',async()=>{
  const o='SYNTHETIC-ROLLBACK',job=await seed(o),k=uuid();await d1.prepare("CREATE TRIGGER offline_fail_word_claim BEFORE UPDATE ON local_word_jobs WHEN NEW.owner='SYNTHETIC-ROLLBACK' BEGIN SELECT RAISE(ABORT,'OFFLINE_ROLLBACK'); END").run();
  await assert.rejects(call(o,k));assert.equal((await read(o,k)).status,'not_recorded');assert.equal((await row(job.id)).state,'queued');await d1.prepare('DROP TRIGGER offline_fail_word_claim').run();assert.equal((await call(o,k)).new_execution_grant,true);
 });
 await check('exact event job ID path still claims once and reads unchanged frozen input',async()=>{
  const o='SYNTHETIC-EXACT',job=await seed(o),before=await core.localWordCall(o,'read_local_word_job',{job_id:job.id});const r=await core.localWordCall(o,'claim_local_word_job',{job_id:job.id});assert.equal(r.claimed,true);assert.deepEqual(r.input,before.input);assert.equal((await core.localWordCall(o,'claim_local_word_job',{job_id:job.id})).claimed,false);assert.equal((await call(o,uuid())).status,'empty');
 });
 assert.equal(io,0);assert.equal((await d1.prepare('SELECT count(*) n FROM articles').first()).n,0);assert.equal((await d1.prepare('SELECT count(*) n FROM event_subscriptions').first()).n,0);
 console.log(`PASS ${groups} actual D1/crypto queue groups; no external I/O, provider, production data, event or subscriptions.`);
}finally{await mf.dispose();fs.rmSync(baseline,{recursive:true,force:true});fs.rmSync(target,{recursive:true,force:true});}
