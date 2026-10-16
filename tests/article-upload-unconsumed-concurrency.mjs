// Execute captured ACTUAL service SQL on two independent SQLite WAL connections.
// All Word, claims and approvals are synthetic. No network/platform/provider.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
const source=fs.readFileSync(new URL('./article-upload-reimport.mjs',import.meta.url),'utf8').split('let cases = 0, failures = 0;')[0]
 .replace("from 'typescript'",`from ${JSON.stringify(import.meta.resolve('typescript'))}`).replace("from 'fflate'",`from ${JSON.stringify(import.meta.resolve('fflate'))}`)
 .replace('createRequire(import.meta.url)',`createRequire(${JSON.stringify(new URL('../package.json',import.meta.url).href)})`);
const h=await import('data:text/javascript;base64,'+Buffer.from(source+`\nexport {sql,fixture,call,reserveArgs,instant}; export const setBeforeRun=v=>{beforeRun=v;}; export const networkCount=()=>networkCalls;`).toString('base64'));
const {sql,fixture,call,reserveArgs,instant,setBeforeRun,networkCount}=h;
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'unconsumed-wal-'));
const workerSource=`const {parentPort,workerData}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(workerData.file);db.exec('PRAGMA busy_timeout=10000');const sync=new Int32Array(workerData.barrier);Atomics.add(sync,0,1);Atomics.notify(sync,0);Atomics.wait(sync,1,0);let result;try{db.exec('BEGIN IMMEDIATE');result=workerData.statements.map(s=>Number(db.prepare(s.q).run(...s.values).changes));db.exec('COMMIT');result={committed:true,changes:result};}catch{try{db.exec('ROLLBACK');}catch{}result={committed:false,changes:[]};}finally{db.close();}parentPort.postMessage(result);`;
async function race(file,groups){
 const barrier=new SharedArrayBuffer(8),sync=new Int32Array(barrier);
 const jobs=groups.map(statements=>new Promise((resolve,reject)=>{const w=new Worker(workerSource,{eval:true,workerData:{file,statements,barrier}});w.once('message',resolve);w.once('error',reject);}));
 // Poll readiness without blocking the main event loop; no provider/tool actions.
 while(Atomics.load(sync,0)<2)await new Promise(resolve=>setTimeout(resolve,5));Atomics.store(sync,1,1);Atomics.notify(sync,1);
 return Promise.all(jobs);
}
function snapshot(name){const file=path.join(directory,name+'.sqlite');sql.exec("VACUUM INTO '"+file+"'");const copy=new DatabaseSync(file);copy.exec('PRAGMA journal_mode=WAL');copy.close();return file;}
async function prepared(name){
 const f=await fixture(name),p=reserveArgs(f);f.root=await call(f,'reserve_article_upload',p);
 const preview=await call(f,'preview_article_unconsumed_upload_recovery',{platform:'toutiao'}),a={...reserveArgs(f),mode:'continue_unconsumed',previous_attempt_id:preview.attempt.attempt_id,expected_attempt_revision:preview.attempt.revision,expected_recovery_fingerprint:preview.recovery_fingerprint,current_task_id:'task-'+f.id,authorization_key:'action-'+f.id,confirmation_message_id:'explicit-owner-'+f.id,prior_executor_end_reference:'original-executor-actually-ended',prior_executor_stopped:true,confirm_unconsumed_recovery:true,confirm_new_draft:true,preserve_existing_draft:true};Object.assign(a.preflight.existing_drafts,{editor_empty:true,private_draft:true});
 const before=snapshot(name),oldConsume=[];
 sql.exec('BEGIN');setBeforeRun((q,values)=>{if(q.startsWith("UPDATE article_upload_attempts SET state='outcome_unknown'"))oldConsume.push({q,values:[...values]});});
 await call(f,'consume_article_upload',{platform:'toutiao',attempt_id:f.root.attempt.attempt_id,execution_claim:f.claim,target_account:f.account,file_confirmation:f.root.attempt.preflight.file});sql.exec('ROLLBACK');setBeforeRun(null);
 const statements=[];setBeforeRun((q,values)=>{if(q.startsWith('INSERT OR IGNORE INTO article_upload_attempts')||q.startsWith('UPDATE articles SET claim_token='))statements.push({q,values:[...values]});});
 const ownerArgs={...a};delete ownerArgs.mode;delete ownerArgs.execution_claim;const child=await call(f,'recover_article_unconsumed_upload',ownerArgs);setBeforeRun(null);assert.equal(statements.length,2);return {f,a,before,statements,child,oldConsume};
}
try{
 const same=await prepared('two-reserves');const results=await race(same.before,[same.statements,same.statements]);assert.equal(results.filter(r=>r.committed&&r.changes[0]===1).length,1);let copy=new DatabaseSync(same.before);assert.equal(copy.prepare('SELECT COUNT(*) n FROM article_upload_attempts WHERE article_id=?').get(same.f.id).n,2);assert.equal(copy.prepare('SELECT consumed_at FROM article_upload_attempts WHERE id=?').get(same.f.root.attempt.attempt_id).consumed_at,null);copy.close();
 console.log('PASS two independent SQLite WAL writers execute actual recovery insert+rotation: one child/lease winner, immutable unconsumed parent.');
 const childFile=snapshot('two-child-consumes'),consumes=[];setBeforeRun((q,values)=>{if(q.startsWith("UPDATE article_upload_attempts SET state='outcome_unknown'"))consumes.push({q,values:[...values]});});
 const c={platform:'toutiao',attempt_id:same.child.attempt.attempt_id,execution_claim:same.child.execution_claim,consume_token:same.child.consume_token,target_account:same.f.account,file_confirmation:same.child.attempt.preflight.file,reimport_editor_confirmation:{target_account:same.f.account,current_editor_url:'https://mp.toutiao.com/profile_v4/graphic/publish',editor_empty:true,private_draft:true,checked_at:instant()}};await call(same.f,'consume_article_upload',c);setBeforeRun(null);assert.equal(consumes.length,1);
 const consumeResults=await race(childFile,[consumes,consumes]);assert.equal(consumeResults.filter(r=>r.committed&&r.changes[0]===1).length,1);copy=new DatabaseSync(childFile);assert.notEqual(copy.prepare('SELECT consumed_at FROM article_upload_attempts WHERE id=?').get(same.child.attempt.attempt_id).consumed_at,null);copy.close();console.log('PASS two independent SQLite WAL writers execute actual child consume CAS: exactly one grant.');
 const oldRace=await prepared('old-consume-recovery');
 const duel=await race(oldRace.before,[oldRace.oldConsume,oldRace.statements]);copy=new DatabaseSync(oldRace.before);
 const parent=copy.prepare('SELECT * FROM article_upload_attempts WHERE id=?').get(oldRace.f.root.attempt.attempt_id),children=copy.prepare('SELECT COUNT(*) n FROM article_upload_attempts WHERE previous_attempt_id=?').get(parent.id).n;
 assert.equal(Number(parent.consumed_at!==null)+children,1);copy.close();assert.equal(duel.filter(r=>r.committed&&r.changes[0]===1).length,1);
 console.log('PASS independent WAL old consume vs actual recovery transaction: either old consumption OR new child, never both.');
 assert.equal(networkCount(),0);
}finally{setBeforeRun(null);fs.rmSync(directory,{recursive:true,force:true});}
