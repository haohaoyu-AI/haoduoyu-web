// Offline synthetic-only contract checks against actual Site TypeScript and workerd D1.
// Fixture IDs, proofs, Word bytes and manuscripts are synthetic; never production inputs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
import {createSyntheticHarness} from './word-recovery-harness.mjs';
import {hash,owner,seed,base,operations} from './word-phase-pool-fixture.mjs';

const mf=new Miniflare({cf:false,modules:true,script:'export default {fetch(){return new Response("SYNTHETIC ARTICLE WORD SETTLEMENT")}}',compatibilityDate:'2026-05-22',d1Databases:{DB:'synthetic-article-word-settlement'}});
const h=createSyntheticHarness({projectRoot:process.cwd(),migrate:false});
const hooks=[];
const on=(match,action,phase='before')=>hooks.push({match,action,phase});
async function notify(phase,context){const hook=hooks.find(x=>x.phase===phase&&x.match(context));if(hook){hooks.splice(hooks.indexOf(hook),1);await hook.action(context);}}
function instrument(db){
  function prepare(source,values=[]){const statement={source,values,native:db.prepare(source).bind(...values),bind:(...bound)=>prepare(source,bound)};for(const method of ['first','all','run'])statement[method]=async(...args)=>{if(method==='first')await notify('read-before',statement);const result=await statement.native[method](...args);return result;};return statement;}
  return {prepare,exec:source=>db.exec(source),async batch(statements){const context={source:statements.map(x=>x.source).join('\n'),statements};await notify('before',context);const result=await db.batch(statements.map(x=>x.native));await notify('after',{...context,result});return result;}};
}
let passed=0;
const pass=name=>{passed++;console.log(`PASS ${name}`);};
try{
  const raw=await mf.getD1Database('DB');await migrate(drizzle(raw),{migrationsFolder:'drizzle'});
  const d1=instrument(raw);h.env.DB=d1;
  const load=h.loader(),article=load('article-tools'),word=load('word-recovery'),attempts=load('word-attempts'),recovery=load('article-word-recovery'),progress=load('word-progress'),op=operations(word,progress);
  const sql=(source,...values)=>d1.prepare(source).bind(...values).run();
  const get=job=>d1.prepare('SELECT * FROM articles WHERE owner=? AND id=?').bind(job.owner,job.target_id).first();
  const control=job=>d1.prepare("SELECT * FROM word_recovery WHERE owner=? AND target_kind='article' AND target_id=?").bind(job.owner,job.target_id).first();
  const attempt=job=>d1.prepare("SELECT * FROM word_attempts WHERE owner=? AND target_kind='article' AND target_id=? ORDER BY generation DESC LIMIT 1").bind(job.owner,job.target_id).first();
  const count=(table,job)=>d1.prepare(`SELECT COUNT(*) n FROM ${table} WHERE owner=?`).bind(job.owner).first('n');
  const update=(job,set,...values)=>sql(`UPDATE articles SET ${set} WHERE owner=? AND id=?`,...values,job.owner,job.target_id);
  const acall=(job,name,args)=>attempts.wordAttemptCall(job.owner,name,{target_kind:'article',target_id:job.target_id,...args});
  const end=(job,args)=>recovery.articleWordRecoveryCall(job.owner,'end_article_word_execution',{article_id:job.target_id,...args});
  const endArgs=(job,extra={})=>({claim_token:job.claim_token,execution_token:job.execution_token,execution_id:job.execution_id,epoch:job.epoch,input_sha256:job.input_sha256,request_key:randomUUID(),confirm_all_actions_stopped:true,confirm_all_actions_settled:true,settled_reference:'synthetic-original-actions-settled',end_reference:'synthetic-original-executor-ended',...(job.settlement_request_key?{settlement_request_key:job.settlement_request_key}:{}),...extra});
  const snapshot=async job=>Object.fromEntries(await Promise.all(['articles','word_recovery','word_execution_receipts','word_execution_requests','word_execution_queue','word_attempts','word_attempt_requests','word_serial_slots','word_progress_events','word_checkpoints','word_image_candidates','word_claim_origins','word_service_incidents','article_word_executor_ends','article_word_claim_recoveries','article_claim_credential_hashes','article_help_queue_claims','article_handoffs'].map(async table=>[table,(await d1.prepare(`SELECT * FROM ${table} WHERE owner=? ORDER BY rowid`).bind(job.owner).all()).results])));
  const noSecret=(value,job)=>{const text=JSON.stringify(value);for(const token of [job.claim_token,job.execution_token])assert.ok(!text.includes(token),'credential exposed by public receipt');};
  async function fresh(label,{who=owner(label),acquire=true}={}){
    const job=await seed(d1,who);await update(job,"state='queued',claim_token=NULL,claim_expires=NULL");
    const claim=await article.articleCall(who,'claim_article',{article_id:job.target_id});assert.equal(claim.claimed,true);job.claim_token=claim.claim_token;
    const created=new Date().toISOString(),handoff=randomUUID(),event=`synthetic-help-event-${randomUUID()}`;
    await sql("INSERT INTO article_handoffs(id,owner,article_id,event_id,state,created,updated,expires) VALUES(?,?,?,?,'delivered',?,?,?)",handoff,who,job.target_id,event,created,created,created);
    await sql('INSERT INTO article_help_queue_claims(owner,request_key,article_id,handoff_id,event_id,claim_hash,created) VALUES(?,?,?,?,?,?,?)',who,randomUUID(),job.target_id,handoff,event,hash(job.claim_token),created);
    if(acquire){const grant=await op.acquire(job,'heavy');assert.equal(grant.acquired,true);job.epoch=grant.epoch;assert.equal(job.epoch,1);}
    return job;
  }
  async function settle(job,{interrupt=true,state='ended'}={}){
    if(interrupt){const interruption=await word.wordRecoveryCall(job.owner,'report_word_interruption',{...base(job),request_key:randomUUID(),epoch:job.epoch,reason:'http_403'});assert.equal(interruption.automatic_repair_started,false);assert.equal((await control(job)).token_hash,null);assert.ok((await control(job)).epoch>job.epoch);}
    else await acall(job,'request_word_safe_stop',{input_sha256:job.input_sha256,attempt_id:(await attempt(job)).attempt_id,request_key:randomUUID(),reason:'owner_request'});
    const a={input_sha256:job.input_sha256,attempt_id:(await attempt(job)).attempt_id,claim_token:job.claim_token,execution_token:job.execution_token,execution_id:job.execution_id,epoch:job.epoch,request_key:randomUUID(),confirm_all_actions_settled:true,settled_reference:'synthetic-original-actions-settled',confirm_executor_ended:true,terminal_reference:'synthetic-original-executor-ended',state};
    const result=await acall(job,'acknowledge_word_attempt_stopped',a);assert.equal(result.recorded,true);job.settlement_request_key=a.request_key;
    assert.equal(await count('word_serial_slots',job),0);assert.equal((await attempt(job)).state,state);return job;
  }
  const settled=async(label,opts={})=>settle(await fresh(label,opts),opts);
  const before=await settled('before-reproduction'),withoutKey=endArgs(before);delete withoutKey.settlement_request_key;
  const beforeSnapshot=await snapshot(before);let beforeError;
  try{await end(before,withoutKey);}catch(error){beforeError={name:error.name,message:error.message};}
  assert.ok(beforeError,'legacy end must still refuse a fenced original grant without explicitly selected settle evidence');assert.deepEqual(await snapshot(before),beforeSnapshot);
  assert.equal((await get(before)).state,'processing');assert.ok(Date.parse((await get(before)).claim_expires)>Date.now());
  const summary={synthetic_only:true,fixture_identity:'synthetic-fresh-manual-help-heavy-http403-ack-ended',original_grant_epoch:before.epoch,current_control_epoch:(await control(before)).epoch,word_token_revoked:(await control(before)).token_hash===null,attempt_state:(await attempt(before)).state,serial_slot_released:await count('word_serial_slots',before)===0,main_claim_still_live:Date.parse((await get(before)).claim_expires)>Date.now(),article_state:(await get(before)).state,end_receipt_count:await count('article_word_executor_ends',before),raw_failure_receipt:beforeError};
  const logDir=fs.mkdtempSync('/tmp/synthetic-article-word-settlement-');fs.writeFileSync(`${logDir}/before-summary.json`,JSON.stringify(summary,null,2)+'\n');console.log(`BEFORE_SUMMARY ${logDir}/before-summary.json`);
  pass('actual synthetic manual-help heavy epoch1 → HTTP403 revocation → original-slot ended acknowledgement reproduces legacy end rejection and live main claim');
  if(process.argv.includes('--before')){console.log(`PASS ${passed} synthetic before checks`);}else{
    const isEnd=context=>context.source.includes('INSERT OR IGNORE INTO article_word_executor_ends');
    const insertRow=(table,row)=>sql(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`,...Object.values(row));
    const selectedReceipt=job=>d1.prepare('SELECT * FROM word_attempt_requests WHERE owner=? AND request_key=?').bind(job.owner,job.settlement_request_key).first();
    const copiedReceipt=async(job,change={},rowChange={})=>{
      const receipt=await selectedReceipt(job),payload={...JSON.parse(receipt.receipt_json),...change};
      const key=randomUUID();await insertRow('word_attempt_requests',{...receipt,request_key:key,receipt_json:JSON.stringify(payload),...rowChange});return key;
    };
    async function rejectUnchanged(job,args,invoke=end,label='rejected settlement'){
      const before=await snapshot(job);await assert.rejects(invoke(job,args),undefined,label);assert.deepEqual(await snapshot(job),before,`${label} mutated state`);
      assert.equal(await count('article_word_executor_ends',job),0,`${label} wrote an end proof`);
    }
    const exact=await settled('exact-success'),exactBefore=await snapshot(exact),exactArgs=endArgs(exact),exactResult=await end(exact,exactArgs),exactAfter=await snapshot(exact);
    assert.equal(exactResult.ended,true);assert.equal(exactResult.recorded,true);assert.equal(exactResult.new_execution_grant,false);assert.equal(exactResult.new_platform_upload_allowed,false);noSecret(exactResult,exact);
    assert.equal((await get(exact)).claim_token,exact.claim_token);assert.ok(Date.parse((await get(exact)).claim_expires)<=Date.now());assert.equal((await get(exact)).state,'processing');assert.equal((await get(exact)).result_key,null);
    const beforeArticle={...exactBefore.articles[0]},afterArticle={...exactAfter.articles[0]};delete beforeArticle.claim_expires;delete afterArticle.claim_expires;assert.deepEqual(afterArticle,beforeArticle);
    for(const table of Object.keys(exactBefore).filter(x=>!['articles','article_word_executor_ends','article_claim_credential_hashes'].includes(x)))assert.deepEqual(exactAfter[table],exactBefore[table],`${table} preserved`);
    assert.equal(exactAfter.article_word_executor_ends.length,1);
    const proof=JSON.parse(exactAfter.article_word_executor_ends[0].proof_json);assert.equal(proof.execution_id,exact.execution_id);assert.equal(proof.epoch,1);assert.equal(proof.confirm_all_actions_settled,true);
    pass('exact immutable original grant and selected ended-settle receipt expire only the main claim, preserve processing/blocked evidence and mint no execution or completion');

    const projected=await settled('actual-progress-projection'),projectedBefore=await snapshot(projected),beforeProgress=await progress.readWordProgress(projected.owner,'article',projected.target_id);
    assert.deepEqual(JSON.parse(JSON.stringify(beforeProgress.settlement)),{execution:'ended_settled',main_claim:'unsettled_active'});assert.equal(beforeProgress.execution.state,'ended_settled');assert.equal(beforeProgress.execution.claim_active,true);assert.equal(beforeProgress.can_control_word,false);assert.equal(beforeProgress.recovery.reason,'http_403');assert.equal(beforeProgress.recovery.status,'blocked');assert.equal(beforeProgress.recovery.execution_confirmed,false);assert.equal(beforeProgress.save.cloud_ready,false);assert.equal(beforeProgress.save.independently_confirmed,false);assert.equal(beforeProgress.completed_at,null);assert.notEqual(beforeProgress.steps[5].state,'completed');assert.deepEqual(await snapshot(projected),projectedBefore);noSecret(beforeProgress,projected);
    await end(projected,endArgs(projected));const projectedCommitted=await snapshot(projected),afterProgress=await progress.readWordProgress(projected.owner,'article',projected.target_id);
    assert.deepEqual(JSON.parse(JSON.stringify(afterProgress.settlement)),{execution:'ended_settled',main_claim:'settled'});assert.equal(afterProgress.execution.state,'ended_settled');assert.equal(afterProgress.execution.claim_active,false);assert.equal(afterProgress.can_control_word,false);assert.equal(afterProgress.recovery.reason,'http_403');assert.equal(afterProgress.recovery.status,'blocked');assert.equal(afterProgress.recovery.execution_confirmed,false);assert.equal(afterProgress.save.state,'not_started');assert.equal(afterProgress.save.cloud_ready,false);assert.equal(afterProgress.save.independently_confirmed,false);assert.equal(afterProgress.completed_at,null);assert.notEqual(afterProgress.steps[5].state,'completed');assert.deepEqual(await snapshot(projected),projectedCommitted);noSecret(afterProgress,projected);
    pass('actual readWordProgress distinguishes ended-settled execution from active/settled main claim, preserves HTTP403 and remains read-only without saved/completed/control or credential claims');
    for(const state of ['unended','paused_safe','invalid_grant_binding']){
      const job=state==='unended'?await fresh('progress-unended'):await settled(`progress-${state}`,state==='paused_safe'?{state:'paused_safe'}:{});if(state==='invalid_grant_binding')await sql('UPDATE word_recovery SET request_key=? WHERE owner=? AND target_id=?',randomUUID(),job.owner,job.target_id);
      const beforeRead=await snapshot(job),view=await progress.readWordProgress(job.owner,'article',job.target_id);assert.equal(view.settlement,null);assert.notEqual(view.execution.state,'ended_settled');assert.deepEqual(await snapshot(job),beforeRead);noSecret(view,job);
    }
    const localJob=await seed(d1,owner('progress-local-word'),'local_word'),localTools=load('local-word-jobs');await sql("UPDATE local_word_jobs SET state='queued',claim_hash=NULL,claim_expires=NULL WHERE owner=? AND id=?",localJob.owner,localJob.target_id);const localClaim=await localTools.localWordCall(localJob.owner,'claim_local_word_job',{job_id:localJob.target_id});assert.equal(localClaim.claimed,true);localJob.claim_token=localClaim.claim_token;const localGrant=await op.acquire(localJob,'heavy');assert.equal(localGrant.acquired,true);const localAttempt=await attempts.wordAttemptView(localJob.owner,'local_word',localJob.target_id);
    await attempts.wordAttemptCall(localJob.owner,'request_word_safe_stop',{target_kind:'local_word',target_id:localJob.target_id,input_sha256:localJob.input_sha256,attempt_id:localAttempt.attempt_id,request_key:randomUUID(),reason:'owner_request'});await attempts.wordAttemptCall(localJob.owner,'acknowledge_word_attempt_stopped',{target_kind:'local_word',target_id:localJob.target_id,input_sha256:localJob.input_sha256,attempt_id:localAttempt.attempt_id,claim_token:localJob.claim_token,execution_token:localJob.execution_token,execution_id:localJob.execution_id,epoch:localGrant.epoch,request_key:randomUUID(),confirm_all_actions_settled:true,settled_reference:'synthetic-local-word-actions-settled',confirm_executor_ended:true,terminal_reference:'synthetic-local-word-executor-ended',state:'ended'});
    const localBeforeRead=await d1.prepare('SELECT * FROM local_word_jobs WHERE owner=?').bind(localJob.owner).first(),localView=await progress.readWordProgress(localJob.owner,'local_word',localJob.target_id);assert.equal(localView.attempt.state,'ended');assert.equal(localView.settlement,null);assert.notEqual(localView.execution.state,'ended_settled');assert.equal(localView.save.cloud_ready,false);assert.deepEqual(await d1.prepare('SELECT * FROM local_word_jobs WHERE owner=?').bind(localJob.owner).first(),localBeforeRead);noSecret(localView,localJob);
    pass('actual progress reads of unended/paused-safe/unverifiable article proof and a genuinely stopped local Word holder cannot claim article business settlement');

    const wrong=await settled('wrong-identity'),wrongArgs=endArgs(wrong);
    for(const [label,bad] of [
      ['claim',{claim_token:randomUUID()}],['Word token',{execution_token:randomUUID()}],['missing Word token',{execution_token:undefined}],
      ['epoch',{epoch:wrong.epoch+1}],['current fenced epoch',{epoch:(await control(wrong)).epoch}],['missing epoch',{epoch:undefined}],
      ['execution id',{execution_id:randomUUID()}],['frozen input',{input_sha256:'0'.repeat(64)}],['unknown settle key',{settlement_request_key:randomUUID()}],
      ['malformed settle key',{settlement_request_key:'synthetic-not-a-uuid'}],['empty settle key',{settlement_request_key:''}],['null settle key',{settlement_request_key:null}],
      ['settle reference',{settled_reference:'synthetic-different-settled-proof'}],['end reference',{end_reference:'synthetic-different-terminal-proof'}],
      ['unsettled',{confirm_all_actions_settled:false}],['unstopped',{confirm_all_actions_stopped:false}],['additional property',{unexpected:true}]
    ])await rejectUnchanged(wrong,{...wrongArgs,...bad},end,label);
    await rejectUnchanged(wrong,wrongArgs,(_,a)=>end({...wrong,owner:owner('foreign-owner')},a),'foreign owner');
    const foreignArticle=await fresh('foreign-article',{who:wrong.owner,acquire:false});await rejectUnchanged(wrong,wrongArgs,(_,a)=>end(foreignArticle,a),'another article');
    const foreignSettle=await settled('foreign-settle-key');await rejectUnchanged(wrong,{...wrongArgs,settlement_request_key:foreignSettle.settlement_request_key});
    pass('owner/article/claim/token/original epoch/execution/input/key/references and explicit confirmations must all match; invalid requests are read-only');

    // Production immutable receipt triggers remain enabled: malformed evidence is
    // inserted as a new synthetic row, never by altering a real recorded receipt.
    for(const [label,change,rowChange] of [
      ['state paused_safe',{state:'paused_safe'},{}],['false settled',{confirm_all_actions_settled:false},{}],['false ended',{confirm_executor_ended:false},{}],
      ['wrong token hash',{tokenHash:hash(randomUUID())},{}],['wrong claim hash',{claimHash:hash(randomUUID())},{}],['wrong execution',{execution_id:randomUUID()},{}],
      ['wrong epoch',{epoch:9},{}],['wrong input',{input:'f'.repeat(64)},{}],['wrong attempt',{attempt:randomUUID()},{}],['wrong target',{target_id:randomUUID()},{}],
      ['bad payload digest',{}, {payload_sha256:'f'.repeat(64)}],['wrong operation',{}, {operation:'stop'}],['wrong receipt attempt',{}, {attempt_id:randomUUID()}],
      ['malformed JSON object',{}, {receipt_json:'{}'}],['malformed JSON array',{}, {receipt_json:'[]'}],['null JSON',{}, {receipt_json:'null'}]
    ]){
      const job=await settled(`tampered-${label.replaceAll(' ','-')}`),key=await copiedReceipt(job,change,rowChange);await rejectUnchanged(job,endArgs(job,{settlement_request_key:key}),end,label);pass(`selected immutable receipt rejects ${label}`);
    }
    const incomplete=await fresh('fabricated-with-no-real-settle');
    await word.wordRecoveryCall(incomplete.owner,'report_word_interruption',{...base(incomplete),request_key:randomUUID(),epoch:incomplete.epoch,reason:'http_403'});
    const incompleteAttempt=await attempt(incomplete),fabricatedSafe={target_kind:'article',target_id:incomplete.target_id,input:incomplete.input_sha256,attempt:incompleteAttempt.attempt_id,claimHash:hash(incomplete.claim_token),tokenHash:hash(incomplete.execution_token),execution_id:incomplete.execution_id,epoch:incomplete.epoch,state:'ended',settled_reference:'synthetic-original-actions-settled',terminal_reference:'synthetic-original-executor-ended',confirm_all_actions_settled:true,confirm_executor_ended:true};
    const fabricatedKey=randomUUID();await insertRow('word_attempt_requests',{owner:incomplete.owner,request_key:fabricatedKey,target_kind:'article',target_id:incomplete.target_id,attempt_id:incompleteAttempt.attempt_id,operation:'settle',payload_sha256:hash(JSON.stringify(fabricatedSafe)),receipt_json:JSON.stringify({...fabricatedSafe,application_nonce:randomUUID()}),created:new Date().toISOString()});
    await rejectUnchanged(incomplete,endArgs(incomplete,{settlement_request_key:fabricatedKey}));assert.equal(await count('word_serial_slots',incomplete),1);
    pass('a fabricated self-consistent receipt without an actual ended attempt and released original slot cannot expire a live main claim');

    const paused=await settled('paused-is-not-ended',{state:'paused_safe'});await rejectUnchanged(paused,endArgs(paused));
    const live=await fresh('no-actual-settle');await rejectUnchanged(live,endArgs(live,{settlement_request_key:randomUUID()}));
    for(const [label,mutate] of [
      ['token restored',job=>sql('UPDATE word_recovery SET token_hash=? WHERE owner=? AND target_id=?',hash(job.execution_token),job.owner,job.target_id)],
      ['lease restored',job=>sql('UPDATE word_recovery SET lease_until=? WHERE owner=? AND target_id=?',new Date(Date.now()+60000).toISOString(),job.owner,job.target_id)],
      ['control different grant',job=>sql('UPDATE word_recovery SET request_key=? WHERE owner=? AND target_id=?',randomUUID(),job.owner,job.target_id)],
      ['control different execution',job=>sql('UPDATE word_recovery SET execution_id=? WHERE owner=? AND target_id=?',randomUUID(),job.owner,job.target_id)],
      ['control unfenced epoch',job=>sql('UPDATE word_recovery SET epoch=? WHERE owner=? AND target_id=?',job.epoch,job.owner,job.target_id)],
      ['attempt running',job=>sql("UPDATE word_attempts SET state='running',active_started_at=? WHERE owner=? AND target_id=?",new Date().toISOString(),job.owner,job.target_id)],
      ['attempt timer active',job=>sql('UPDATE word_attempts SET active_started_at=? WHERE owner=? AND target_id=?',new Date().toISOString(),job.owner,job.target_id)],
      ['attempt ended_at absent',job=>sql('UPDATE word_attempts SET ended_at=NULL WHERE owner=? AND target_id=?',job.owner,job.target_id)],
      ['attempt ended_at invalid',job=>sql("UPDATE word_attempts SET ended_at='synthetic-not-a-date' WHERE owner=? AND target_id=?",job.owner,job.target_id)]
    ]){const job=await settled(`reject-${label.replaceAll(' ','-')}`);await mutate(job);await rejectUnchanged(job,endArgs(job));pass(`stale settlement refuses ${label}`);}
    const restoredSlot=await settled('slot-still-held');const slotControl=await control(restoredSlot);await insertRow('word_serial_slots',{owner:restoredSlot.owner,target_kind:'article',target_id:restoredSlot.target_id,input_sha256:restoredSlot.input_sha256,attempt_id:slotControl.attempt_id,claim_hash:hash(restoredSlot.claim_token),execution_id:restoredSlot.execution_id,grant_request_key:restoredSlot.request_key,token_hash:hash(restoredSlot.execution_token),epoch:restoredSlot.epoch,state:'held',version:1,held_at:new Date().toISOString(),updated:new Date().toISOString()});await rejectUnchanged(restoredSlot,endArgs(restoredSlot));
    const pending=await settled('pending-queue'),pendingGrant=await d1.prepare('SELECT * FROM word_execution_requests WHERE owner=?').bind(pending.owner).first();await insertRow('word_execution_queue',{...pendingGrant,capacity_reason:'heavy_capacity',request_key:randomUUID(),token_hash:hash(randomUUID()),execution_id:randomUUID()});await rejectUnchanged(pending,endArgs(pending));
    for(const state of ['queued','running','ended']){
      const job=await settled(`successor-${state}`),old=await attempt(job),successor={...old,attempt_id:randomUUID(),generation:2,previous_attempt_id:old.attempt_id,creation_request_key:randomUUID(),state,active_started_at:state==='running'?new Date().toISOString():null};await insertRow('word_attempts',successor);await sql('UPDATE word_recovery SET attempt_id=? WHERE owner=? AND target_id=?',successor.attempt_id,job.owner,job.target_id);await rejectUnchanged(job,endArgs(job));
    }
    pass('no actual settle, paused_safe, held original slot, queued authority and current successor generations cannot borrow an older terminal receipt');

    const promoted=await fresh('later-real-grant',{acquire:false}),prepare=await op.acquire(promoted,'prepare');assert.equal(prepare.acquired,true);promoted.epoch=prepare.epoch;
    const originalGrant={...promoted},transition=await op.transitionArgs(promoted,'heavy'),heavy=await op.transition(promoted,transition);assert.equal(heavy.acquired,true);op.adoptTransition(promoted,transition,heavy);await settle(promoted);
    await rejectUnchanged(promoted,endArgs(originalGrant,{settlement_request_key:promoted.settlement_request_key}));assert.equal((await end(promoted,endArgs(promoted))).ended,true);
    pass('actual prepare→heavy transition requires the immutable final original grant; an earlier token/epoch cannot borrow its later stopped-holder receipt');
    for(const successorStage of ['queued','active','ended']){
      const job=await settled(`actual-successor-${successorStage}`,{interrupt:false}),old=await attempt(job);
      const restart=await acall(job,'restart_word_attempt',{input_sha256:job.input_sha256,attempt_id:old.attempt_id,expected_generation:old.generation,request_key:randomUUID(),strategy_sha256:hash('synthetic-authorized-new-strategy'),strategy_reference:'synthetic-authorized-new-strategy',confirm_same_frozen_input:true,confirm_existing_results_read:true});assert.equal(restart.recorded,true);assert.equal(restart.attempt.generation,2);
      if(successorStage!=='queued'){
        const successor={...job,request_key:randomUUID(),execution_id:randomUUID(),execution_token:randomUUID()};delete successor.settlement_request_key;
        const grant=await op.acquire(successor,'heavy');assert.equal(grant.acquired,true);successor.epoch=grant.epoch;if(successorStage==='ended')await settle(successor,{interrupt:false});
      }
      await rejectUnchanged(job,endArgs(job));pass(`actual restarted ${successorStage} generation refuses the prior generation settle proof`);
    }
    for(const [label,change,rowChange] of [
      ['extra receipt field',{unexpected:true},{}],['bad nonce',{application_nonce:'synthetic-invalid-nonce'},{}],
      ['receipt created before grant',{}, {created:'2020-01-01T00:00:00.000Z'}],['receipt future timestamp',{}, {created:'2099-01-01T00:00:00.000Z'}],['receipt noncanonical timestamp',{}, {created:'2026-01-01'}]
    ]){const job=await settled(`strict-${label.replaceAll(' ','-')}`),key=await copiedReceipt(job,change,rowChange);await rejectUnchanged(job,endArgs(job,{settlement_request_key:key}));pass(`selected receipt rejects ${label}`);}
    const expired=await settled('already-expired-main-claim');await update(expired,'claim_expires=?','2020-01-01T00:00:00.000Z');assert.equal((await end(expired,endArgs(expired))).ended,true);assert.equal((await get(expired)).claim_expires,'2020-01-01T00:00:00.000Z');
    pass('already expired claim still requires exact real end evidence and keeps its original expiry when settled');
    const rollback=await settled('end-transaction-rollback'),rollbackArgs=endArgs(rollback),rollbackBefore=await snapshot(rollback);
    await sql(`CREATE TRIGGER synthetic_settlement_claim_expiry_fail BEFORE UPDATE OF claim_expires ON articles WHEN NEW.id='${rollback.target_id}' BEGIN SELECT RAISE(ABORT,'SYNTHETIC_SETTLEMENT_ROLLBACK'); END`);
    await assert.rejects(end(rollback,rollbackArgs),/SYNTHETIC_SETTLEMENT_ROLLBACK/);assert.deepEqual(await snapshot(rollback),rollbackBefore);await sql('DROP TRIGGER synthetic_settlement_claim_expiry_fail');assert.equal((await end(rollback,rollbackArgs)).ended,true);
    pass('actual D1 batch rollback leaves no end audit or expired claim on expiry-write failure; identical retry then commits once');

    const preserved=await fresh('retained-word-and-images'),bytes=Buffer.from('synthetic-existing-word-prefix'),outputId=randomUUID(),key=`synthetic-settlement/${randomUUID()}/word-prefix`;await h.bucket.put(key,bytes);
    const partial={output_id:outputId,sha256:hash(Buffer.concat([bytes,bytes])),size:bytes.length*2,chunks:2,parts:[{key,sha256:hash(bytes),size:bytes.length}],bytes:bytes.length};await update(preserved,'result_meta=?',JSON.stringify(partial));
    for(const kind of ['image','word'])await insertRow('word_checkpoints',{owner:preserved.owner,target_kind:'article',target_id:preserved.target_id,input_sha256:preserved.input_sha256,asset_id:randomUUID(),kind,sha256:hash(Buffer.concat([bytes,bytes])),size:bytes.length*2,chunks:2,metadata_json:JSON.stringify({synthetic:true}),verification_json:null,parts_json:JSON.stringify(partial.parts),state:'incomplete',created:new Date().toISOString(),attempt_id:(await attempt(preserved)).attempt_id});
    await word.recordImageResult(preserved.owner,{...base(preserved),candidate_id:randomUUID(),source_url:'https://images.example.org/synthetic-denied.png',source_title:'Synthetic denied image',outcome:'download_failed',reason:'http_403'});
    await op.progress(preserved,'read_source','completed',{action:'read_frozen_source',reason:'none'});await settle(preserved);
    const preservedBefore=await snapshot(preserved),objectBefore=new Uint8Array(h.objects.get(key).bytes);await end(preserved,endArgs(preserved));const preservedAfter=await snapshot(preserved);
    for(const table of ['word_checkpoints','word_image_candidates','word_progress_events','word_attempts','word_recovery','word_service_incidents','word_attempt_requests','word_execution_receipts','word_execution_requests'])assert.deepEqual(preservedAfter[table],preservedBefore[table]);
    assert.equal(preservedAfter.articles[0].result_meta,JSON.stringify(partial));assert.equal(preservedAfter.articles[0].result_key,null);assert.deepEqual(h.objects.get(key).bytes,objectBefore);
    await assert.rejects(op.acquire({...preserved,request_key:randomUUID(),execution_id:randomUUID(),execution_token:randomUUID()},'heavy'));
    const oldAttempt=await attempt(preserved);await assert.rejects(acall(preserved,'restart_word_attempt',{input_sha256:preserved.input_sha256,attempt_id:oldAttempt.attempt_id,expected_generation:oldAttempt.generation,request_key:randomUUID(),strategy_sha256:hash('synthetic-new-strategy'),strategy_reference:'synthetic-new-strategy',confirm_same_frozen_input:true,confirm_existing_results_read:true}));
    assert.deepEqual((await snapshot(preserved)).word_service_incidents,preservedBefore.word_service_incidents);
    pass('partial native Word, incomplete Word/image checkpoints, actual failure candidate, proved progress and HTTP403 incident survive exactly; settlement permits neither regrant nor restart');

    const isolated=await settled('other-holder-isolation',{interrupt:false}),other=await fresh('other-real-article-holder',{who:isolated.owner});await insertRow('word_service_incidents',{owner:isolated.owner,dependency:'public_images',reason:'http_403',state:'await_executor',first_seen:new Date().toISOString(),last_seen:new Date().toISOString()});
    const isolatedBefore=await snapshot(isolated);await end(isolated,endArgs(isolated));const isolatedAfter=await snapshot(isolated);assert.deepEqual(isolatedAfter.word_serial_slots,isolatedBefore.word_serial_slots);assert.equal(isolatedAfter.word_serial_slots[0].target_id,other.target_id);assert.deepEqual(isolatedAfter.word_service_incidents,isolatedBefore.word_service_incidents);assert.deepEqual(isolatedAfter.articles.find(x=>x.id===other.target_id),isolatedBefore.articles.find(x=>x.id===other.target_id));
    pass('settling one already stopped article preserves another article actual held slot/claim and owner HTTP403 incident');

    const lost=await settled('end-lost-response'),lostArgs=endArgs(lost);on(isEnd,()=>{throw Error('SYNTHETIC_END_RESPONSE_LOST_AFTER_COMMIT');},'after');await assert.rejects(end(lost,lostArgs),/SYNTHETIC_END_RESPONSE_LOST_AFTER_COMMIT/);assert.equal(await count('article_word_executor_ends',lost),1);const lostCommitted=await snapshot(lost),lostReplay=await end(lost,lostArgs);assert.equal(lostReplay.duplicate,true);assert.deepEqual(await snapshot(lost),lostCommitted);noSecret(lostReplay,lost);
    await assert.rejects(end(lost,{...lostArgs,end_reference:'synthetic-conflicting-reference'}));await assert.rejects(end(lost,{...lostArgs,settlement_request_key:randomUUID()}));await assert.rejects(end(lost,{...lostArgs,request_key:randomUUID()}));assert.deepEqual(await snapshot(lost),lostCommitted);
    pass('lost committed end response resolves by same-key replay; conflicting payload/settle key and new request key cannot append a second end');

    const replacedBefore=await settled('replaced-before-record');await update(replacedBefore,'claim_token=?',randomUUID());await rejectUnchanged(replacedBefore,endArgs(replacedBefore));
    const replaced=await settled('recorded-then-real-main-claim-recovery'),replacedArgs=endArgs(replaced);await end(replaced,replacedArgs);
    const recoveryPreview=await recovery.articleWordRecoveryCall(replaced.owner,'preview_article_word_recovery',{article_id:replaced.target_id}),newClaim=randomUUID();
    const recoveryResult=await recovery.articleWordRecoveryCall(replaced.owner,'recover_article_word_execution',{article_id:replaced.target_id,request_key:randomUUID(),next_claim_token:newClaim,expected_fingerprint:recoveryPreview.expected_fingerprint,input_sha256:replaced.input_sha256,confirm_same_article:true,confirm_existing_results_checked:true,confirmation_reference:'synthetic-authorized-recovery-after-original-end',confirm_original_executor_match:true,termination:{kind:'holder_end_receipt',end_request_key:replacedArgs.request_key}});assert.equal(recoveryResult.claim_rotated,true);assert.equal((await get(replaced)).claim_token,newClaim);
    const replacedCurrent=await snapshot(replaced);await assert.rejects(end(replaced,replacedArgs));await assert.rejects(end(replaced,{...replacedArgs,request_key:randomUUID()}));assert.deepEqual(await snapshot(replaced),replacedCurrent);assert.equal(await count('article_word_executor_ends',replaced),1);assert.equal(await count('article_word_claim_recoveries',replaced),1);
    pass('main claim replacement before record or after actual recovery makes old same-key replay and new-key end refuse without touching the replacement claim');

    for(const mutation of ['claim replacement','owner incident']){
      const job=await settled(`duplicate-read-race-${mutation.replaceAll(' ','-')}`),args=endArgs(job);await end(job,args);const committed=await snapshot(job);
      on(context=>context.source.startsWith('SELECT 1 AS unchanged'),async()=>{
        if(mutation==='claim replacement')await update(job,'claim_token=?',randomUUID());else await sql("UPDATE word_service_incidents SET state='resolved' WHERE owner=?",job.owner);
      },'read-before');
      await assert.rejects(end(job,args));const raced=await snapshot(job);
      for(const table of Object.keys(committed).filter(x=>x!==(mutation==='claim replacement'?'articles':'word_service_incidents')))assert.deepEqual(raced[table],committed[table]);assert.equal(raced.articles[0].claim_expires,committed.articles[0].claim_expires);assert.equal(raced.article_word_executor_ends.length,1);
      pass(`same-key read-only replay detects concurrent ${mutation} after its verified snapshot and creates no second proof`);
    }

    const concurrent=await settled('same-key-concurrent-end'),concurrentArgs=endArgs(concurrent),concurrentResults=await Promise.allSettled(Array.from({length:8},()=>end(concurrent,concurrentArgs)));
    const successful=[];for(const result of concurrentResults){if(result.status==='fulfilled')successful.push(result.value);else successful.push(await end(concurrent,concurrentArgs));}assert.equal(successful.filter(x=>x.duplicate===false).length,1);assert.equal(await count('article_word_executor_ends',concurrent),1);assert.ok(successful.every(x=>x.ended&&!x.new_execution_grant));noSecret(successful,concurrent);
    const keysRace=await settled('different-key-concurrent-end'),raceArgs=endArgs(keysRace),race=await Promise.allSettled([end(keysRace,raceArgs),end(keysRace,{...raceArgs,request_key:randomUUID()})]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal(await count('article_word_executor_ends',keysRace),1);
    pass('eight same-key concurrent calls record once; two different keys admit one atomic end winner');

    for(const [label,mutate] of [
      ['article frozen text',job=>update(job,'paragraphs=?',JSON.stringify(['Synthetic changed title','Synthetic changed body']))],
      ['article output prefix',job=>update(job,'result_meta=?',JSON.stringify({output_id:randomUUID(),sha256:hash('synthetic-late-output'),size:1,chunks:1,parts:[],bytes:0}))],
      ['control',job=>sql('UPDATE word_recovery SET retry_count=retry_count+1 WHERE owner=? AND target_id=?',job.owner,job.target_id)],
      ['attempt timer',job=>sql('UPDATE word_attempts SET active_elapsed_ms=active_elapsed_ms+1 WHERE owner=? AND target_id=?',job.owner,job.target_id)],
      ['service incident',job=>sql("UPDATE word_service_incidents SET state='resolved' WHERE owner=?",job.owner)],
      ['new owner service incident',job=>insertRow('word_service_incidents',{owner:job.owner,dependency:'public_images',reason:'captcha',state:'await_executor',first_seen:new Date().toISOString(),last_seen:new Date().toISOString()})],
      ['handoff state',job=>sql("UPDATE article_handoffs SET state='unknown' WHERE owner=?",job.owner)],
      ['help claim record',job=>sql('UPDATE article_help_queue_claims SET created=? WHERE owner=?','2026-01-01T00:00:00.000Z',job.owner)],
      ['new checkpoint',async job=>insertRow('word_checkpoints',{owner:job.owner,target_kind:'article',target_id:job.target_id,input_sha256:job.input_sha256,asset_id:randomUUID(),kind:'image',sha256:hash('synthetic-race-image'),size:1,chunks:1,metadata_json:'{}',verification_json:null,parts_json:'[]',state:'incomplete',created:new Date().toISOString(),attempt_id:(await attempt(job)).attempt_id})],
      ['new settle receipt',job=>copiedReceipt(job)],
      ['new immutable grant',async job=>{const old=await d1.prepare('SELECT * FROM word_execution_receipts WHERE owner=?').bind(job.owner).first();await insertRow('word_execution_receipts',{...old,request_key:randomUUID(),token_hash:hash(randomUUID()),execution_id:randomUUID(),epoch:old.epoch+1});}],
      ['new immutable request history',async job=>{const old=await d1.prepare('SELECT * FROM word_execution_requests WHERE owner=?').bind(job.owner).first();await insertRow('word_execution_requests',{...old,request_key:randomUUID(),token_hash:hash(randomUUID()),execution_id:randomUUID()});}],
      ['new failure candidate',async job=>insertRow('word_image_candidates',{owner:job.owner,target_kind:'article',target_id:job.target_id,candidate_id:randomUUID(),input_sha256:job.input_sha256,source_url:'https://images.example.org/synthetic-race-denied.png',source_title:'Synthetic race failure',outcome:'download_failed',reason:'http_403',replacement_for:null,asset_id:null,payload_sha256:hash('synthetic-candidate'),created:new Date().toISOString(),attempt_id:(await attempt(job)).attempt_id})],
      ['new progress observation',async job=>insertRow('word_progress_events',{owner:job.owner,target_kind:'article',target_id:job.target_id,version:1,event_id:randomUUID(),input_sha256:job.input_sha256,payload_sha256:hash('synthetic-new-progress'),snapshot_json:'{}',created:new Date().toISOString(),attempt_id:(await attempt(job)).attempt_id})],
      ['frozen layout manifest',job=>update(job,'artifact_manifest=?',JSON.stringify({contract_version:1,original_sha256:job.input_sha256,layout:{synthetic:true}}))],
      ['pending queue',async job=>{const grant=await d1.prepare('SELECT * FROM word_execution_requests WHERE owner=?').bind(job.owner).first();await insertRow('word_execution_queue',{...grant,capacity_reason:'heavy_capacity',request_key:randomUUID(),token_hash:hash(randomUUID()),execution_id:randomUUID()});}],
      ['another held serial slot',async job=>{const c=await control(job);await insertRow('word_serial_slots',{owner:job.owner,target_kind:'article',target_id:randomUUID(),input_sha256:job.input_sha256,attempt_id:c.attempt_id,claim_hash:hash(job.claim_token),execution_id:randomUUID(),grant_request_key:randomUUID(),token_hash:hash(randomUUID()),epoch:1,state:'held',version:1,held_at:new Date().toISOString(),updated:new Date().toISOString()});}]
    ]){
      const job=await settled(`cas-${label.replaceAll(' ','-')}`),args=endArgs(job),oldArticle=await get(job);on(isEnd,()=>mutate(job));await assert.rejects(end(job,args),undefined,label);assert.equal(await count('article_word_executor_ends',job),0);assert.equal((await get(job)).claim_token,oldArticle.claim_token);assert.equal((await get(job)).claim_expires,oldArticle.claim_expires);pass(`full-snapshot end CAS refuses concurrent ${label} mutation`);
    }
    assert.equal(h.externalCalls,0);assert.equal(hooks.length,0);console.log(`PASS ${passed} synthetic settlement contracts; external_calls=0`);
  }
}finally{await mf.dispose();h.close();}
