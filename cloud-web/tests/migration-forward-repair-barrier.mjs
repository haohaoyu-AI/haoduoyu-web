// Synthetic recovery-contract probes. Never imports application environment,
// touches production, edits historical migrations or authorizes a deployment.
// The injected truncation is NOT evidence of the Sites hosted executor.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';

const reportArg=process.argv.indexOf('--report');
const reportPath=reportArg<0?null:process.argv[reportArg+1];
if(reportArg>=0&&!reportPath)throw Error('--report requires a filename');
const sha=value=>createHash('sha256').update(value).digest('hex');
const base='CREATE TABLE support_items (id TEXT PRIMARY KEY);';
const complete='CREATE TRIGGER support_guard BEFORE INSERT ON support_items BEGIN SELECT 1; END;';
const truncated=complete.slice(0,-4); // Explicit synthetic loss of END; only.
const repair='CREATE TABLE IF NOT EXISTS support_append_repair (id TEXT PRIMARY KEY);';
const fixtureRoot=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-forward-repair-'));
const report={started_at:new Date().toISOString(),scope:'Pinned local Drizzle and isolated workerd D1; injected failure only',
 limits:['Not the Sites hosted executor or its actual failed input.','No claim about the production ledger, partial schema or transaction policy.','Generic fixture statements are not project migrations or a proposed production repair.'],
 fixture:{base,complete,truncated,repair,complete_sha256:sha(complete),truncated_sha256:sha(truncated)},checks:[]};
let mf,externalCalls=0;
async function check(name,action){const evidence=await action();report.checks.push({name,passed:true,evidence});console.log('PASS '+name);}
function folder(count){
 const dir=path.join(fixtureRoot,String(count));fs.mkdirSync(path.join(dir,'meta'),{recursive:true});
 const sources=[base,complete,repair];
 const entries=sources.slice(0,count).map((source,idx)=>{
  const tag=String(idx).padStart(4,'0')+'_synthetic_support';
  fs.writeFileSync(path.join(dir,tag+'.sql'),source);
  return {idx,version:'6',when:1000+idx,tag,breakpoints:true};
 });
 fs.writeFileSync(path.join(dir,'meta/_journal.json'),JSON.stringify({version:'7',dialect:'sqlite',entries}));
 return dir;
}
const folders=[null,folder(1),folder(2),folder(3)];
function observed(database,inject=false){
 const trace={batches:[],transformed_inputs:[]};
 return {trace,database:{
  prepare(source){
   if(inject&&source===complete){trace.transformed_inputs.push({source_sha256:sha(source),actual_sha256:sha(truncated)});return database.prepare(truncated);}
   return database.prepare(source);
  },
  async batch(statements){trace.batches.push(statements.length);return database.batch(statements);},
 }};
}
async function has(database,name){return !!await database.prepare("SELECT name FROM sqlite_master WHERE name=?").bind(name).first();}
async function ledgerCount(database){return Number((await database.prepare('SELECT count(*) AS n FROM __drizzle_migrations').first()).n);}
async function expectFailure(action,pattern){
 let captured;
 try{await action();}catch(error){captured=error;}
 assert.ok(captured,'expected an isolated migration failure');
 const text=[captured.message,captured.cause?.message].filter(Boolean).join(' | ');
 assert.match(text,pattern);
 return text;
}
try{
 const packageJson=JSON.parse(fs.readFileSync(new URL('../node_modules/drizzle-orm/package.json',import.meta.url)));
 assert.equal(packageJson.version,'0.45.2');
 report.drizzle_version=packageJson.version;
 await check('complete minimal trigger is valid SQLite; deliberately truncated input is incomplete',()=>{
  const db=new DatabaseSync(':memory:');
  try{db.exec(base);db.exec(complete);assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='support_guard'").get());
   db.exec('DROP TRIGGER support_guard');
   assert.throws(()=>db.exec(truncated),error=>error.message==='incomplete input');
   return {sqlite_version:db.prepare('SELECT sqlite_version() AS v').get().v,error:'incomplete input',real_platform_input:false};
  }finally{db.close();}
 });
 mf=new Miniflare({cf:false,modules:true,script:'export default {fetch(){throw Error("SYNTHETIC CONTRACT ONLY")}}',compatibilityDate:'2026-05-22',
  d1Databases:{PENDING:'synthetic-pending-repair',APPLIED:'synthetic-applied-repair',PARTIAL:'synthetic-partial-repair',GAP:'synthetic-ledger-gap'},
  outboundService:()=>{externalCalls++;throw Error('External calls forbidden');}});
 await check('a pending truncated predecessor prevents the appended repair under genuine Drizzle D1 batch execution',async()=>{
  const d1=await mf.getD1Database('PENDING');await migrate(drizzle(d1),{migrationsFolder:folders[1]});
  await d1.prepare("INSERT INTO support_items VALUES('SYNTHETIC-existing')").run();
  const probe=observed(d1,true);
  const error=await expectFailure(()=>migrate(drizzle(probe.database),{migrationsFolder:folders[3]}),/incomplete input/);
  assert.deepEqual(probe.trace.batches,[4]);assert.equal(probe.trace.transformed_inputs.length,1);
  assert.equal(await has(d1,'support_guard'),false);assert.equal(await has(d1,'support_append_repair'),false);assert.equal(await ledgerCount(d1),1);
  assert.equal(Number((await d1.prepare('SELECT count(*) AS n FROM support_items').first()).n),1);
  // Same unchanged source succeeds once the synthetic input transformation is absent.
  const normal=observed(d1);await migrate(drizzle(normal.database),{migrationsFolder:folders[3]});
  assert.equal(await has(d1,'support_guard'),true);assert.equal(await has(d1,'support_append_repair'),true);assert.equal(await ledgerCount(d1),3);
  return {injected_failure:error,failed_batch_inputs:4,append_reached_after_failure:false,prior_row_preserved:true,untransformed_same_source_succeeds:true};
 });
 await check('an already recorded predecessor is skipped and an idempotent append can run and rerun without a pending batch',async()=>{
  const d1=await mf.getD1Database('APPLIED');await migrate(drizzle(d1),{migrationsFolder:folders[2]});
  const probe=observed(d1,true);await migrate(drizzle(probe.database),{migrationsFolder:folders[3]});
  assert.deepEqual(probe.trace.batches,[2]);assert.equal(probe.trace.transformed_inputs.length,0);assert.equal(await has(d1,'support_append_repair'),true);
  await migrate(drizzle(probe.database),{migrationsFolder:folders[3]});assert.deepEqual(probe.trace.batches,[2]);assert.equal(await ledgerCount(d1),3);
  return {predecessor_replayed:false,append_inputs:2,rerun_additional_batches:0,production_ledger_proven:false};
 });
 await check('partial predecessor DDL without its ledger entry also blocks a later append even with complete input',async()=>{
  const d1=await mf.getD1Database('PARTIAL');await migrate(drizzle(d1),{migrationsFolder:folders[1]});
  await d1.prepare(complete).run(); // Explicit synthetic partially-applied state.
  const probe=observed(d1);const error=await expectFailure(()=>migrate(drizzle(probe.database),{migrationsFolder:folders[3]}),/trigger support_guard already exists/i);
  assert.equal(await has(d1,'support_guard'),true);assert.equal(await has(d1,'support_append_repair'),false);assert.equal(await ledgerCount(d1),1);
  return {error,append_reached:false,preexisting_trigger_retained:true,hosted_partial_state_proven:false};
 });
 await check('IF NOT EXISTS alone does not repair an existing object with a different definition',()=>{
  const db=new DatabaseSync(':memory:');
  try{db.exec(base);db.exec("CREATE TRIGGER support_guard BEFORE INSERT ON support_items BEGIN SELECT RAISE(ABORT,'SYNTHETIC-old-definition'); END;");
   const before=db.prepare("SELECT sql FROM sqlite_master WHERE name='support_guard'").get().sql;
   db.exec(complete.replace('CREATE TRIGGER','CREATE TRIGGER IF NOT EXISTS'));
   assert.equal(db.prepare("SELECT sql FROM sqlite_master WHERE name='support_guard'").get().sql,before);
   assert.throws(()=>db.exec("INSERT INTO support_items VALUES('SYNTHETIC')"),/SYNTHETIC-old-definition/);
   return {name_presence_is_definition_equivalence:false,existing_definition_unchanged:true};
  }finally{db.close();}
 });
 await check('a greatest ledger timestamp alone is not proof of a complete applied prefix',async()=>{
  const d1=await mf.getD1Database('GAP');await migrate(drizzle(d1),{migrationsFolder:folders[1]});
  // Deliberately inconsistent LOCAL fixture; not an assertion about production.
  await d1.prepare('INSERT INTO __drizzle_migrations (hash,created_at) VALUES (?,?)').bind('SYNTHETIC-not-a-real-migration-hash',1002).run();
  const probe=observed(d1);await migrate(drizzle(probe.database),{migrationsFolder:folders[3]});
  assert.deepEqual(probe.trace.batches,[]);assert.equal(await has(d1,'support_guard'),false);assert.equal(await has(d1,'support_append_repair'),false);assert.equal(await ledgerCount(d1),2);
  return {pending_batches:0,missing_predecessor_and_append:true,hash_prefix_validated_by_this_migrator:false,fixture_is_intentionally_inconsistent:true};
 });
 assert.equal(externalCalls,0);report.external_calls=externalCalls;report.passed=true;
}catch(error){report.passed=false;report.failure={message:error.message,cause:error.cause?.message??null};throw error;
}finally{
 if(mf)await mf.dispose();fs.rmSync(fixtureRoot,{recursive:true,force:true});report.finished_at=new Date().toISOString();report.check_count=report.checks.length;
 if(reportPath)fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
}
