// Independent adversarial checks against the actual Site TypeScript and isolated
// workerd D1. All identities, text, proof references and object bytes are synthetic.
// The instrumented D1 adapter delegates every SQL statement/transaction to workerd;
// it only supplies deterministic asynchronous barriers and response-loss injection.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
import {createSyntheticHarness, barrier, withDeadline} from './word-recovery-harness.mjs';
import {hash, owner, seed, native, base, operations} from './word-phase-pool-fixture.mjs';
import {png, docx} from './word-recovery-artifact-fixture.mjs';

const mf = new Miniflare({cf:false, modules:true,
  script:'export default {fetch(){return new Response("SYNTHETIC INDEPENDENT PREWORD RECOVERY")}}',
  compatibilityDate:'2026-05-22', d1Databases:{DB:'synthetic-article-word-recovery-independent'}});
const h = createSyntheticHarness({projectRoot:process.cwd(), migrate:false});
const hooks = [];
let passed = 0;
const pass = name => { passed++; console.log(`PASS ${name}`); };
const on = (method, match, action, phase='before') => hooks.push({method, match, action, phase});
async function notify(method, phase, context) {
  const hook=hooks.find(x=>x.method===method&&x.phase===phase&&x.match(context));
  if(hook){hooks.splice(hooks.indexOf(hook),1);await hook.action(context);}
}
function instrument(db) {
  function prepare(source, values=[]) {
    const statement={source, values, native:db.prepare(source).bind(...values),
      bind:(...bound)=>prepare(source,bound)};
    for(const method of ['first','all','run']) statement[method]=async(...args)=>{
      await notify(method,'before',statement);
      const result=await statement.native[method](...args);
      await notify(method,'after',{...statement,result});return result;
    };
    return statement;
  }
  return {prepare,exec:source=>db.exec(source),async batch(statements){
    const context={source:statements.map(x=>x.source).join('\n'),statements};
    await notify('batch','before',context);
    const result=await db.batch(statements.map(x=>x.native));
    await notify('batch','after',{...context,result});return result;
  }};
}

try {
  const raw = await mf.getD1Database('DB');
  await migrate(drizzle(raw),{migrationsFolder:'drizzle'});
  await migrate(drizzle(raw),{migrationsFolder:'drizzle'});
  const d1=instrument(raw);h.env.DB=d1;
  const load=h.loader(), recovery=load('article-word-recovery'), w=load('word-recovery'),
    p=load('word-progress'), article=load('article-tools'), queue=load('article-help-queue'),
    diagnostics=load('article-upload-diagnostics'), op=operations(w,p);
  const call=(job,name,args)=>recovery.articleWordRecoveryCall(job.owner,name,{article_id:job.target_id,...args});
  const preview=job=>call(job,'preview_article_word_recovery',{});
  const receipt=(job,key)=>call(job,'read_article_word_recovery_receipt',{request_key:key});
  const row=job=>d1.prepare('SELECT * FROM articles WHERE owner=? AND id=?').bind(job.owner,job.target_id).first();
  const control=job=>d1.prepare("SELECT * FROM word_recovery WHERE owner=? AND target_kind='article' AND target_id=?").bind(job.owner,job.target_id).first();
  const count=(table,job)=>d1.prepare(`SELECT COUNT(*) n FROM ${table} WHERE owner=?`).bind(job.owner).first('n');
  const update=(job,set,...values)=>d1.prepare(`UPDATE articles SET ${set} WHERE owner=? AND id=?`).bind(...values,job.owner,job.target_id).run();
  const noSecret=(value,tokens)=>{const raw=JSON.stringify(value);for(const token of tokens) assert.ok(!raw.includes(token),'response contains a credential');};
  const stopped=async(job,extra={})=>{
    const c=await control(job),args={claim_token:job.claim_token,execution_token:job.execution_token,
      execution_id:job.execution_id,epoch:c?.epoch,input_sha256:job.input_sha256,request_key:randomUUID(),
      confirm_all_actions_stopped:true,confirm_all_actions_settled:true,settled_reference:'synthetic-all-original-actions-settled',end_reference:'synthetic-normal-executor-stopped',...extra};
    const result=await call(job,'end_article_word_execution',args);
    return {args,result};
  };
  const recoveryArgs=async(job,termination,extra={})=>{
    const view=await preview(job);
    assert.match(view.expected_fingerprint,/^[a-f0-9]{64}$/);
    return {request_key:randomUUID(),next_claim_token:randomUUID(),expected_fingerprint:view.expected_fingerprint,
      input_sha256:job.input_sha256,confirm_same_article:true,confirm_existing_results_checked:true,
      confirmation_reference:'synthetic-authorized-same-article-recovery',confirm_original_executor_match:true,
      termination,...extra};
  };
  const recover=(job,args)=>call(job,'recover_article_word_execution',args);
  const fixture=async(label,{scope='prepare',who=owner(label),acquire=true,fresh=acquire}={})=>{
    const job=await seed(d1,who);if(fresh){await update(job,"state='queued',claim_token=NULL,claim_expires=NULL");const issued=await article.articleCall(who,'claim_article',{article_id:job.target_id});assert.equal(issued.claimed,true);job.claim_token=issued.claim_token;assert.equal((await d1.prepare('SELECT COUNT(*) n FROM word_claim_origins WHERE owner=? AND target_id=? AND claim_hash=?').bind(who,job.target_id,hash(job.claim_token)).first('n')),1);}if(acquire)assert.equal((await op.acquire(job,scope)).acquired,true);
    return job;
  };
  const holderProof=end=>({kind:'holder_end_receipt',end_request_key:end.args.request_key});
  const recoveredFixture=async(label,opts={})=>{
    const job=await fixture(label,opts),end=await stopped(job),args=await recoveryArgs(job,holderProof(end));
    const result=await recover(job,args);return {job,end,args,result};
  };
  const promote=(job,args)=>({...job,claim_token:args.next_claim_token,execution_id:randomUUID(),execution_token:randomUUID(),request_key:randomUUID()});
  const addCheckpoint=async(job,id=randomUUID())=>{
    const bytes=Buffer.from('synthetic-retained-image-prefix');
    const key=`synthetic/${job.target_id}/${id}/0`,parts=[{key,size:bytes.length,sha256:hash(bytes)}];
    await h.bucket.put(key,bytes);
    await d1.prepare("INSERT INTO word_checkpoints(owner,target_kind,target_id,input_sha256,asset_id,kind,sha256,size,chunks,metadata_json,verification_json,parts_json,state,created) VALUES(?,'article',?,?,?,'image',?,?,2,?,NULL,?,'incomplete',?)")
      .bind(job.owner,job.target_id,job.input_sha256,id,hash(Buffer.concat([bytes,bytes])),bytes.length*2,
        JSON.stringify({source_url:'https://images.example.org/image.png',after_paragraph:0}),JSON.stringify(parts),new Date().toISOString()).run();
    return {id,key,bytes};
  };
  const retained=async job=>({article:await row(job),checkpoints:(await d1.prepare('SELECT * FROM word_checkpoints WHERE owner=? AND target_id=? ORDER BY asset_id').bind(job.owner,job.target_id).all()).results,
    candidates:(await d1.prepare('SELECT * FROM word_image_candidates WHERE owner=? AND target_id=? ORDER BY candidate_id').bind(job.owner,job.target_id).all()).results,
    progress:(await d1.prepare('SELECT * FROM word_progress_events WHERE owner=? AND target_id=? ORDER BY version').bind(job.owner,job.target_id).all()).results});
  const attachQueue=async(job,key,created)=>{
    const handoff=randomUUID(),event=`synthetic_event_${randomUUID()}`;
    await update(job,'created=?,claim_expires=?',created,new Date(Date.now()-60000).toISOString());
    await d1.prepare('INSERT INTO article_handoffs(id,owner,article_id,event_id,state,created,updated,expires) VALUES(?,?,?,? ,\'delivered\',?,?,?)')
      .bind(handoff,job.owner,job.target_id,event,created,created,created).run();
    await d1.prepare('INSERT INTO article_help_queue_claims(owner,request_key,article_id,handoff_id,event_id,claim_hash,created) VALUES(?,?,?,?,?,?,?)')
      .bind(job.owner,key,job.target_id,handoff,event,hash(job.claim_token),created).run();
  };
  const outputFixture=async(label,complete=false)=>{
    const job=await fixture(label,{acquire:false,fresh:true}),bytes=Buffer.from(docx(png())),mid=Math.floor(bytes.length/2),
      partBytes=[bytes.subarray(0,mid),bytes.subarray(mid)],output_id=randomUUID(),parts=[];
    for(let index=0;index<(complete?2:1);index++){
      const key=`articles/${job.target_id}/output/${output_id}/${index}-${hash(partBytes[index])}`;
      await h.bucket.put(key,partBytes[index]);parts.push({key,sha256:hash(partBytes[index]),size:partBytes[index].length});
    }
    const meta={output_id,sha256:hash(bytes),size:bytes.length,chunks:2,parts,bytes:parts.reduce((n,x)=>n+x.size,0)};
    await update(job,'result_meta=?',JSON.stringify(meta));assert.equal((await op.acquire(job,'heavy')).acquired,true);
    return {job,bytes,partBytes,meta};
  };

  assert.ok((await d1.prepare('PRAGMA table_info(article_word_executor_ends)').all()).results.length);
  assert.ok((await d1.prepare('PRAGMA table_info(article_word_claim_recoveries)').all()).results.length);
  pass('all production migrations apply and repeat safely in actual isolated workerd D1');

  const expiry=await fixture('expired-is-not-ended');
  await update(expiry,'claim_expires=?',new Date(Date.now()-60000).toISOString());
  await d1.prepare('UPDATE word_recovery SET lease_until=? WHERE owner=? AND target_id=?').bind(new Date(Date.now()-60000).toISOString(),expiry.owner,expiry.target_id).run();
  const expiryBefore=await row(expiry),noProof=await recoveryArgs(expiry,{kind:'holder_end_receipt',end_request_key:randomUUID()});
  await assert.rejects(recover(expiry,noProof));
  await assert.rejects(recover(expiry,{...noProof,termination:undefined}));
  assert.equal((await row(expiry)).claim_token,expiryBefore.claim_token);
  assert.equal(await count('article_word_claim_recoveries',expiry),0);
  pass('expired main claim and subordinate lease with no true end receipt cannot recover or mint audit/grant');

  const falseHolder=await fixture('wrong-holder-end'),falseEpoch=(await control(falseHolder)).epoch;
  for(const bad of [{claim_token:randomUUID()},{execution_token:randomUUID()},{execution_id:randomUUID()},
    {epoch:falseEpoch+1},{confirm_all_actions_stopped:false},{confirm_all_actions_settled:false},{confirm_all_actions_settled:undefined},{settled_reference:undefined},{settled_reference:''},{input_sha256:'f'.repeat(64)}])await assert.rejects(stopped(falseHolder,bad));
  assert.equal(await count('article_word_executor_ends',falseHolder),0);assert.ok((await control(falseHolder)).token_hash);
  await update(falseHolder,'claim_expires=?',new Date(Date.now()-60000).toISOString());
  await d1.prepare('UPDATE word_recovery SET lease_until=? WHERE owner=? AND target_id=?').bind(new Date(Date.now()-60000).toISOString(),falseHolder.owner,falseHolder.target_id).run();
  assert.equal((await stopped(falseHolder)).result.ended,true);
  pass('wrong holder/token/executor/epoch/input or missing stop confirmation cannot end; original expired holder may end its own exact task without gaining new authority');

  const holder=await fixture('holder-end'),holderBefore=await control(holder),end=await stopped(holder);
  const endControl=await control(holder);
  assert.equal((await row(holder)).claim_token,holder.claim_token);
  assert.equal(endControl.token_hash,null);assert.equal(endControl.lease_until,null);
  assert.ok(endControl.epoch>holderBefore.epoch);assert.ok(endControl.version>holderBefore.version);
  noSecret(end.result,[holder.claim_token,holder.execution_token]);
  assert.equal(await count('article_word_executor_ends',holder),1);
  await assert.rejects(op.progress(holder,'read_source','completed',{action:'read_frozen_source',reason:'none'}));
  pass('actual current holder end fences only its old execution without rotating business claim or granting a successor');

  const endReplay=await call(holder,'end_article_word_execution',end.args);
  assert.equal(await count('article_word_executor_ends',holder),1);noSecret(endReplay,[holder.claim_token,holder.execution_token]);
  await assert.rejects(call(holder,'end_article_word_execution',{...end.args,end_reference:'different-reference'}));
  await assert.rejects(call(holder,'end_article_word_execution',{...end.args,unexpected:true}));
  await assert.rejects(call({...holder,owner:owner('foreign-end')},'end_article_word_execution',end.args));
  pass('same-key end replay is durable, conflicts/additional properties/foreign owner cannot revise the immutable proof');

  const args=await recoveryArgs(holder,holderProof(end));
  for(const bad of [{input_sha256:'0'.repeat(64)},{confirm_same_article:false},{confirm_existing_results_checked:false},
    {confirm_original_executor_match:false},{next_claim_token:holder.claim_token},{unexpected:true},
    {termination:{kind:'holder_end_receipt',end_request_key:randomUUID()}},
    {termination:{...holderProof(end),unexpected:true}}]) await assert.rejects(recover(holder,{...args,...bad}));
  await assert.rejects(recover({...holder,owner:owner('foreign-recovery')},args));
  assert.equal(await count('article_word_claim_recoveries',holder),0);
  pass('recovery enforces same owner/input/current stopped executor, explicit authorizations, fresh token and strict arguments');

  const raced=await fixture('two-key-cas'),racedEnd=await stopped(raced),first=await recoveryArgs(raced,holderProof(racedEnd)),second={...first,request_key:randomUUID(),next_claim_token:randomUUID()};
  const racers=await Promise.allSettled([first,second].map(a=>recover(raced,a)));
  assert.equal(racers.filter(x=>x.status==='fulfilled').length,1);
  const winner=racers[0].status==='fulfilled'?first:second,actual=await row(raced),racedControl=await control(raced);
  assert.equal(actual.claim_token,winner.next_claim_token);assert.equal(await count('article_word_claim_recoveries',raced),1);
  assert.equal(racedControl.claim_hash,hash(winner.next_claim_token));assert.equal(racedControl.token_hash,null);
  assert.equal(racedControl.status,'await_executor');assert.equal(racedControl.desired,'run');
  noSecret(racers.find(x=>x.status==='fulfilled').value,[raced.claim_token,raced.execution_token,winner.next_claim_token]);
  pass('two different recovery keys against one exact fingerprint yield one atomic main-claim winner and no Word token grant');

  const recoveredPreview=await preview(raced);
  assert.equal(recoveredPreview.executor.adopted,true);
  assert.equal(recoveredPreview.executor.current_executor_recorded,false);
  assert.equal(recoveredPreview.executor.execution_id,null);
  assert.equal(recoveredPreview.executor.prior_execution_id,raced.execution_id);
  assert.equal(recoveredPreview.executor.epoch,racedControl.epoch);
  assert.equal(recoveredPreview.executor.version,racedControl.version);
  assert.equal(recoveredPreview.new_execution_grant,false);
  noSecret(recoveredPreview,[raced.claim_token,raced.execution_token,winner.next_claim_token]);
  pass('fresh recovered claim preview honestly shows no current executor grant; old execution ID is only historical audit identity');

  const lost=await fixture('lost-response'),lostEnd=await stopped(lost),lostArgs=await recoveryArgs(lost,holderProof(lostEnd));
  on('batch',c=>c.source.includes('article_word_claim_recoveries'),()=>{throw Error('SYNTHETIC_RESPONSE_LOST_AFTER_COMMIT');},'after');
  await assert.rejects(recover(lost,lostArgs),/SYNTHETIC_RESPONSE_LOST_AFTER_COMMIT/);
  const committed=await row(lost),lostControl=await control(lost);
  assert.equal(committed.claim_token,lostArgs.next_claim_token);
  const read=await receipt(lost,lostArgs.request_key),replayed=await recover(lost,lostArgs);
  assert.equal(read.recorded,true);assert.equal(read.applicable,true);
  assert.equal(replayed.duplicate,true);assert.equal(await count('article_word_claim_recoveries',lost),1);
  assert.equal((await control(lost)).epoch,lostControl.epoch);assert.equal((await row(lost)).claim_token,committed.claim_token);
  noSecret([read,replayed],[lost.claim_token,lost.execution_token,lostArgs.next_claim_token]);
  await assert.rejects(recover(lost,{...lostArgs,next_claim_token:randomUUID()}));
  const absent=await receipt(lost,randomUUID());assert.equal(absent.recorded,false);assert.equal(absent.new_execution_grant,false);
  pass('lost response after actual D1 commit is resolved with same-key read/replay without rotation, returned token or new grant');

  const repeated=await fixture('same-key-concurrency'),repeatedEnd=await stopped(repeated),repeatedArgs=await recoveryArgs(repeated,holderProof(repeatedEnd)),repeatedBefore=await control(repeated);
  const repetitionResults=await Promise.allSettled(Array.from({length:10},()=>recover(repeated,repeatedArgs))),repetitions=[];
  for(const result of repetitionResults){if(result.status==='fulfilled')repetitions.push(result.value);else{assert.match(result.reason.message,/credential_source_changed/);repetitions.push(await recover(repeated,repeatedArgs));}}
  assert.ok(repetitions.every(x=>x.recorded&&x.applicable));
  assert.equal(repetitions.filter(x=>x.claim_rotated===true).length,1);
  assert.equal((await control(repeated)).epoch,repeatedBefore.epoch+1);assert.equal(await count('article_word_claim_recoveries',repeated),1);
  noSecret(repetitions,[repeated.claim_token,repeated.execution_token,repeatedArgs.next_claim_token]);
  const sameOwnerOther=await fixture('cross-article-key',{who:repeated.owner}),otherEnd=await stopped(sameOwnerOther),otherArgs=await recoveryArgs(sameOwnerOther,holderProof(otherEnd),{request_key:repeatedArgs.request_key});
  await assert.rejects(recover(sameOwnerOther,otherArgs));
  assert.equal((await row(sameOwnerOther)).claim_token,sameOwnerOther.claim_token);
  assert.equal((await receipt({...repeated,owner:owner('foreign-receipt')},repeatedArgs.request_key)).recorded,false);
  pass('ten simultaneous same-key recoveries rotate once; key reuse for another article and foreign-owner read cannot alias the recorded grant');

  const rollback=await fixture('full-batch-rollback'),rollbackEnd=await stopped(rollback),rollbackArgs=await recoveryArgs(rollback,holderProof(rollbackEnd)),rollbackBefore=await control(rollback);
  await d1.prepare(`CREATE TRIGGER synthetic_recovery_fail BEFORE UPDATE OF claim_hash ON word_recovery WHEN NEW.target_id='${rollback.target_id}' BEGIN SELECT RAISE(ABORT,'SYNTHETIC_RECOVERY_ROLLBACK'); END`).run();
  await assert.rejects(recover(rollback,rollbackArgs),/SYNTHETIC_RECOVERY_ROLLBACK/);
  assert.equal((await row(rollback)).claim_token,rollback.claim_token);assert.deepEqual(await control(rollback),rollbackBefore);
  assert.equal(await count('article_word_claim_recoveries',rollback),0);assert.equal((await receipt(rollback,rollbackArgs.request_key)).recorded,false);
  await d1.prepare('DROP TRIGGER synthetic_recovery_fail').run();
  assert.equal((await recover(rollback,rollbackArgs)).claim_rotated,true);
  pass('actual D1 transaction rollback prevents orphan success audit/rotated main claim when control update fails; unknown same key retries safely');

  const sensitive=await fixture('credential-references'),sensitiveEnd=await stopped(sensitive),sensitiveArgs=await recoveryArgs(sensitive,holderProof(sensitiveEnd));
  for(const text of [sensitive.claim_token,sensitive.execution_token,[...sensitive.claim_token].map(c=>'%'+c.charCodeAt(0).toString(16)).join(''),sensitiveArgs.next_claim_token])
    await assert.rejects(recover(sensitive,{...sensitiveArgs,confirmation_reference:`synthetic-reference-${text}`}));
  const unended=await fixture('end-credential-reference');
  await assert.rejects(stopped(unended,{end_reference:`synthetic-reference-${unended.claim_token}`}));
  await assert.rejects(stopped(unended,{end_reference:`synthetic-reference-${unended.execution_token}`}));
  assert.equal(await count('article_word_executor_ends',unended),0);assert.equal(await count('article_word_claim_recoveries',sensitive),0);
  pass('actual credential boundaries refuse old/new claim and Word token in stored recovery/end proof references before any audit write');

  const preserved=await fixture('preserve-artifacts');
  const checkpoint=await addCheckpoint(preserved);
  await d1.prepare("INSERT INTO word_image_candidates(owner,target_kind,target_id,candidate_id,input_sha256,source_url,source_title,outcome,reason,payload_sha256,created) VALUES(?,'article',?,?,?,?,?,'download_failed','http_403',?,?)")
    .bind(preserved.owner,preserved.target_id,randomUUID(),preserved.input_sha256,'https://images.example.org/failed.jpg','Synthetic related image',hash('candidate'),new Date().toISOString()).run();
  await op.progress(preserved,'read_source','completed',{action:'read_frozen_source',reason:'none'});
  await op.progress(preserved,'collect_images','waiting',{action:'search_public_images',reason:'waiting_for_images',candidate_urls:['https://images.example.org/candidate.jpg']});
  const beforePreserved=await retained(preserved),preservedEnd=await stopped(preserved),preservedArgs=await recoveryArgs(preserved,holderProof(preservedEnd));
  await recover(preserved,preservedArgs);const afterPreserved=await retained(preserved);
  for(const k of ['checkpoints','candidates','progress'])assert.deepEqual(afterPreserved[k],beforePreserved[k]);
  for(const k of ['id','owner','paragraphs','title','filename','source_key','result_key','result_meta','artifact_manifest','state'])assert.equal(afterPreserved.article[k],beforePreserved.article[k]);
  assert.deepEqual(h.objects.get(checkpoint.key).bytes,new Uint8Array(checkpoint.bytes));
  pass('same article/source/state and all incomplete image bytes, candidate failures and proved six-step observations survive recovery exactly');

  for(const desired of ['paused','cancelled']){
    const job=await fixture(`preserve-${desired}`),jobEnd=await stopped(job);
    await op.intent(job,desired);const before=await control(job),a=await recoveryArgs(job,holderProof(jobEnd));
    await recover(job,a);const after=await control(job);
    assert.equal(after.desired,desired);assert.equal(after.token_hash,null);assert.ok(after.epoch>before.epoch);
    await assert.rejects(op.acquire(promote(job,a),'prepare'));
    pass(`${desired} user intent remains exact; recovery does not secretly resume or obtain a pool slot`);
  }

  for(const mutation of ['checkpoint','manifest','native-meta','control','input']){
    const job=await fixture(`snapshot-${mutation}`),jobEnd=await stopped(job),a=await recoveryArgs(job,holderProof(jobEnd));
    on('batch',c=>c.source.includes('article_word_claim_recoveries'),async()=>{
      if(mutation==='checkpoint')await addCheckpoint(job);
      if(mutation==='manifest')await update(job,'artifact_manifest=?',JSON.stringify({contract_version:1,layout:null,synthetic:'new-layout-snapshot'}));
      if(mutation==='native-meta')await update(job,'result_meta=?',JSON.stringify({output_id:randomUUID(),sha256:hash('synthetic'),size:12,chunks:1,bytes:0,parts:[]}));
      if(mutation==='control')await d1.prepare("UPDATE word_recovery SET reason='synthetic_changed',version=version+1 WHERE owner=? AND target_id=?").bind(job.owner,job.target_id).run();
      if(mutation==='input')await update(job,'paragraphs=?',JSON.stringify(['Changed synthetic input']));
    });
    await assert.rejects(recover(job,a));
    assert.equal((await row(job)).claim_token,job.claim_token);assert.equal(await count('article_word_claim_recoveries',job),0);
    pass(`actual D1 fingerprint/CAS refuses ${mutation} change after preview before commit without overwriting newer work`);
  }

  // Legacy intake has no Word control. Only the actual persisted queue receipt plus
  // explicit owner-attested normal Codex terminal observation can map its execution.
  const legacy=await fixture('legacy-mapping',{acquire:false}),acquisitionKey=randomUUID(),acquiredAt=new Date(Date.now()-120000).toISOString();
  await attachQueue(legacy,acquisitionKey,acquiredAt);
  const terminal={kind:'codex_terminal_observation',execution_id:randomUUID(),thread_id:randomUUID(),turn_id:randomUUID(),terminal_state:'completed',
    ended_at:new Date(Date.now()-30000).toISOString(),observed_at:new Date(Date.now()-10000).toISOString(),
    observation_reference:'synthetic-normal-codex-read-terminal',execution_mapping_reference:'synthetic-original-turn-queue-acquisition-receipt',
    original_acquisition_request_key:acquisitionKey,confirm_all_actions_settled:true,settled_reference:'synthetic-normal-tool-all-actions-settled'};
  const legacyArgs=await recoveryArgs(legacy,terminal);
  for(const change of [{terminal_state:'active'},{terminal_state:'idle'},{ended_at:new Date(Date.now()+60000).toISOString()},
    {observed_at:new Date(Date.now()+60000).toISOString()},{ended_at:new Date(Date.now()-300000).toISOString()},
    {observed_at:new Date(Date.now()-60000).toISOString()},{execution_mapping_reference:''},
    {observation_reference:''},{original_acquisition_request_key:randomUUID()},
    {original_acquisition_request_key:undefined},{thread_id:''},{turn_id:''}])await assert.rejects(recover(legacy,{...legacyArgs,termination:{...terminal,...change}}));
  assert.equal(await count('article_word_claim_recoveries',legacy),0);
  pass('legacy normal Codex proof rejects active/idle, future/pre-acquisition/inverted time, absent refs and unmapped acquisition identities');
  const legacyResult=await recover(legacy,legacyArgs),newLegacy=await row(legacy),legacyControl=await control(legacy);
  assert.equal(newLegacy.claim_token,legacyArgs.next_claim_token);assert.equal(legacyControl.token_hash,null);
  noSecret(legacyResult,[legacy.claim_token,legacyArgs.next_claim_token]);
  const oldQueue=await queue.articleHelpQueueCall(legacy.owner,'read_article_help_claim',{request_key:acquisitionKey});
  assert.equal(oldQueue.claimed,false);assert.equal(oldQueue.status,'claim_unavailable');assert.equal(Object.hasOwn(oldQueue,'claim_token'),false);
  pass('mapped legacy queue owner-attestation rotates one claim without inventing image history; immutable old queue receipt cannot reveal successor token');

  const legacyHolder=await fixture('legacy-holder',{acquire:false}),legacyHolderKey=randomUUID();
  await attachQueue(legacyHolder,legacyHolderKey,new Date(Date.now()-120000).toISOString());
  const legacyHolderEnd=await stopped(legacyHolder,{execution_token:undefined,epoch:undefined}),legacyHolderArgs=await recoveryArgs(legacyHolder,holderProof(legacyHolderEnd));
  assert.equal((await recover(legacyHolder,legacyHolderArgs)).recorded,true);assert.equal((await control(legacyHolder)).token_hash,null);
  pass('legacy original holder with exact persisted intake/handoff and original main token can explicitly end its own task; no invented subordinate epoch/token');

  const unmapped=await fixture('direct-unmapped',{acquire:false}),unmappedArgs=await recoveryArgs(unmapped,{...terminal,original_acquisition_request_key:undefined});
  await assert.rejects(recover(unmapped,unmappedArgs));assert.equal(await count('article_word_claim_recoveries',unmapped),0);
  pass('legacy direct claim with neither Word executor binding nor exact original queue mapping refuses invented executor identity');

  const bound=await fixture('bound-terminal'),boundArgs=await recoveryArgs(bound,{...terminal,execution_id:bound.execution_id,original_acquisition_request_key:undefined});
  await assert.rejects(recover(bound,{...boundArgs,termination:{...boundArgs.termination,execution_id:randomUUID()}}));
  const boundBefore=await control(bound);
  await assert.rejects(recover(bound,{...boundArgs,termination:{...boundArgs.termination,ended_at:new Date(Date.parse(boundBefore.updated)-60000).toISOString()}}));
  pass('bound subordinate executor and grant chronology cannot be replaced with a different terminal executor observation');

  const knownTerminal=await fixture('known-terminal-positive');
  await update(knownTerminal,'claim_expires=?',new Date(Date.now()-60000).toISOString());
  const terminalAt=new Date().toISOString(),knownProof={...terminal,execution_id:knownTerminal.execution_id,original_acquisition_request_key:undefined,ended_at:terminalAt,observed_at:terminalAt},
    knownArgs=await recoveryArgs(knownTerminal,knownProof),knownResult=await recover(knownTerminal,knownArgs);
  assert.equal(knownResult.recorded,true);assert.equal(knownResult.new_execution_grant,false);
  assert.equal((await control(knownTerminal)).token_hash,null);
  const knownAudit=await d1.prepare('SELECT termination_json FROM article_word_claim_recoveries WHERE owner=? AND request_key=?').bind(knownTerminal.owner,knownArgs.request_key).first();
  assert.equal(JSON.parse(knownAudit.termination_json).server_verified,false);
  assert.equal(JSON.parse(knownAudit.termination_json).evidence,'authenticated_owner_attested_codex_tool_observation');
  pass('known exact execution terminal observation can fence a stale token but audit labels thread/turn evidence owner-attested, never server verified');

  const diagnosticArgs=(stage,extra={})=>({platform:'toutiao',operation_id:randomUUID(),executor_id:randomUUID(),stage,outcome:'failed',cause:'tool_unavailable',observed_at:new Date().toISOString(),...extra});
  for(const stage of ['file_handoff','chooser_wait']){
    const j=await fixture(`observed-${stage}`),record=diagnosticArgs(stage);await diagnostics.recordUploadDiagnostic(j.owner,j.target_id,record);
    const before=(await d1.prepare('SELECT * FROM article_upload_diagnostics WHERE owner=? AND article_id=?').bind(j.owner,j.target_id).all()).results,
      ended=await stopped(j),a=await recoveryArgs(j,holderProof(ended));await recover(j,a);
    assert.deepEqual((await d1.prepare('SELECT * FROM article_upload_diagnostics WHERE owner=? AND article_id=?').bind(j.owner,j.target_id).all()).results,before);
    pass(`${stage} diagnostic without submission identity remains unchanged and does not invent platform submission or prevent safe Word-only recovery`);
  }
  for(const stage of ['file_submission','platform_import','draft_readback']){
    const j=await fixture(`forbid-${stage}`);await diagnostics.recordUploadDiagnostic(j.owner,j.target_id,diagnosticArgs(stage));
    await assert.rejects(preview(j));assert.equal(await count('article_word_claim_recoveries',j),0);
    pass(`${stage} diagnostic is preserved and excludes uncertain platform history from pre-Word recovery`);
  }
  const diagnosticRace=await fixture('diagnostic-cas'),diagnosticEnd=await stopped(diagnosticRace),diagnosticRecovery=await recoveryArgs(diagnosticRace,holderProof(diagnosticEnd));
  on('batch',c=>c.source.includes('article_word_claim_recoveries'),()=>diagnostics.recordUploadDiagnostic(diagnosticRace.owner,diagnosticRace.target_id,diagnosticArgs('chooser_wait')));
  await assert.rejects(recover(diagnosticRace,diagnosticRecovery));
  assert.equal((await row(diagnosticRace)).claim_token,diagnosticRace.claim_token);assert.equal(await count('article_word_claim_recoveries',diagnosticRace),0);
  pass('diagnostic added after preview invalidates complete snapshot CAS even when its stage is otherwise eligible');

  for(const desired of ['paused','cancelled']){
    const j=await fixture(`external-${desired}`),at=new Date().toISOString();
    const external={...terminal,execution_id:j.execution_id,original_acquisition_request_key:undefined,ended_at:at,observed_at:at};
    await op.intent(j,desired);await update(j,'claim_expires=?',new Date(Date.now()-60000).toISOString());
    const a=await recoveryArgs(j,external);assert.equal((await recover(j,a)).recorded,true);
    assert.equal((await control(j)).desired,desired);assert.equal((await control(j)).token_hash,null);
    await assert.rejects(op.acquire(promote(j,a),'prepare'));
    pass(`real terminal observation before later owner ${desired} control remains usable while preserving intent and refusing old/new execution`);
  }

  for(const action of ['heartbeat','progress','candidate','checkpoint','native-chunk']){
    const f=action==='native-chunk'?await outputFixture('terminal-before-native-chunk'):null,
      j=f?.job||await fixture(`terminal-before-${action}`,{scope:action==='checkpoint'?'heavy':'prepare'}),at=new Date().toISOString();
    // Real fixture writes below must occur strictly later than the asserted end.
    await new Promise(resolve=>setTimeout(resolve,5));
    if(action==='heartbeat')await w.wordRecoveryCall(j.owner,'heartbeat_word_execution',{...base(j),request_key:randomUUID(),epoch:(await control(j)).epoch});
    if(action==='progress')await op.progress(j,'read_source','completed',{action:'read_frozen_source',reason:'none'});
    if(action==='candidate')await w.recordImageResult(j.owner,{...base(j),candidate_id:randomUUID(),source_url:'https://images.example.org/terminal-too-early.png',source_title:'Synthetic failed source',outcome:'download_failed',reason:'http_403'});
    if(action==='checkpoint'){
      const image=Buffer.from(png());await w.checkpointCall(j.owner,'begin_word_checkpoint',{...base(j),asset_id:randomUUID(),kind:'image',sha256:hash(image),size:image.length,chunks:1,
        metadata:{source_url:'https://images.example.org/terminal-checkpoint.png',source_title:'Synthetic raster',after_paragraph:1}});
    }
    if(action==='native-chunk')await article.articleCall(j.owner,'put_article_output_chunk',{...native(j),output_id:f.meta.output_id,index:1,data_base64:f.partBytes[1].toString('base64')});
    await update(j,'claim_expires=?',new Date(Date.now()-60000).toISOString());
    const a=await recoveryArgs(j,{...terminal,execution_id:j.execution_id,original_acquisition_request_key:undefined,ended_at:at,observed_at:new Date().toISOString()});
    await assert.rejects(recover(j,a));assert.equal((await row(j)).claim_token,j.claim_token);
    pass(`terminal observation older than actual recorded ${action} cannot authorize recovery; genuine later executor work is preserved`);
  }

  const queuedOwner=owner('zero-grant'),fillers=[];
  for(let i=0;i<1;i++)fillers.push(await fixture(`zero-fill-${i}`,{who:queuedOwner}));
  const queued=await fixture('zero-grant-target',{who:queuedOwner,acquire:false,fresh:true});assert.equal((await op.acquire(queued,'prepare')).queued,true);
  const zeroControl=await control(queued);assert.equal(zeroControl.version,0);assert.equal(zeroControl.epoch,0);assert.equal(zeroControl.token_hash,null);
  const zeroPreview=await preview(queued);
  assert.equal(zeroPreview.executor.adopted,true);assert.equal(zeroPreview.executor.current_executor_recorded,false);
  assert.equal(zeroPreview.executor.execution_id,null);assert.equal(zeroPreview.executor.prior_execution_id,null);
  assert.equal(zeroPreview.executor.version,0);assert.equal(zeroPreview.executor.epoch,0);
  const queuedKey=randomUUID();await attachQueue(queued,queuedKey,new Date(Date.now()-120000).toISOString());
  const queuedAt=new Date().toISOString(),queuedArgs=await recoveryArgs(queued,{...terminal,execution_id:queued.execution_id,original_acquisition_request_key:queuedKey,ended_at:queuedAt,observed_at:queuedAt});
  assert.equal((await recover(queued,queuedArgs)).recorded,true);
  assert.equal((await control(queued)).status,'await_executor');assert.equal((await control(queued)).token_hash,null);
  assert.equal((await d1.prepare('SELECT COUNT(*) n FROM word_execution_queue WHERE owner=? AND target_id=?').bind(queued.owner,queued.target_id).first()).n,0);
  assert.equal((await d1.prepare('SELECT COUNT(*) n FROM word_execution_requests WHERE owner=? AND target_id=?').bind(queued.owner,queued.target_id).first()).n,1);
  const newQueued=promote(queued,queuedArgs);assert.equal((await op.acquire(newQueued,'prepare')).queued,true);
  assert.equal((await op.receipt(queued)).applicable,false);await assert.rejects(op.acquire(queued,'prepare'));
  pass('legitimate first-acquisition owner-serial queue with control 0/0 recovers same article only after mapped terminal proof; old queue clears and immutable history remains');

  for(const corruption of ['token','receipt']){
    const j=await fixture(`zero-corrupt-${corruption}`,{who:queuedOwner,acquire:false,fresh:true});assert.equal((await op.acquire(j,'prepare')).queued,true);
    if(corruption==='token')await d1.prepare('UPDATE word_recovery SET token_hash=? WHERE owner=? AND target_id=?').bind(hash(randomUUID()),j.owner,j.target_id).run();
    else await d1.prepare("INSERT INTO word_execution_receipts(owner,request_key,target_kind,target_id,input_sha256,claim_hash,token_hash,execution_id,epoch,created) VALUES(?,?,'article',?,?,?,?,?,0,?)")
      .bind(j.owner,randomUUID(),j.target_id,j.input_sha256,hash(j.claim_token),hash(randomUUID()),randomUUID(),new Date().toISOString()).run();
    await assert.rejects(preview(j));
    pass(`forged zero-version/zero-epoch control with ${corruption} grant evidence fails rather than being treated as never-granted legacy history`);
  }

  const recovered=await recoveredFixture('late-writes',{scope:'heavy'}),{job:old,args:replace}=recovered;
  await assert.rejects(op.acquire(old,'heavy'));assert.equal((await op.receipt(old)).applicable,false);
  await assert.rejects(op.progress(old,'read_source','completed',{action:'read_frozen_source',reason:'none'}));
  await assert.rejects(article.articleCall(old.owner,'begin_article_output',{...native(old),size:10,sha256:hash('not-docx'),chunks:1}));
  await assert.rejects(article.articleCall(old.owner,'put_article_output_chunk',{...native(old),output_id:randomUUID(),index:0,data_base64:Buffer.from('late').toString('base64')}));
  await assert.rejects(article.articleCall(old.owner,'finalize_article_output',{...native(old),output_id:randomUUID()}));
  const successor=promote(old,replace);assert.equal((await op.acquire(successor,'prepare')).acquired,true);
  await assert.rejects(op.acquire(old,'heavy'));noSecret(await op.receipt(old),[old.claim_token,old.execution_token,replace.next_claim_token]);
  pass('old business claim, Word token and immutable acquisition request cannot progress/chunk/finalize or revive after recovery and fresh successor adoption');

  const endedId=await recoveredFixture('ended-id-reuse'),endedSuccessor=promote(endedId.job,endedId.args);
  endedSuccessor.execution_id=endedId.job.execution_id;
  await assert.rejects(op.acquire(endedSuccessor,'prepare'));
  assert.equal((await control(endedSuccessor)).token_hash,null);
  pass('explicitly ended execution ID cannot acquire again with a new request key/token/main claim; only a genuinely new successor execution may adopt');

  const oldEndpoint=await outputFixture('legacy-recovery-bypass'),oldPreview=await article.articleCall(oldEndpoint.job.owner,'preview_article_claim_recovery',{article_id:oldEndpoint.job.target_id,platform:'toutiao'});
  const oldRecoverArgs={article_id:oldEndpoint.job.target_id,platform:'toutiao',expected_lease_fingerprint:oldPreview.lease_fingerprint||'0'.repeat(64),
    confirm_article_id:oldEndpoint.job.target_id,confirm_prior_executor_ended:true,confirm_read_only_recovery:true,confirm_existing_results_checked:true};
  await assert.rejects(article.articleCall(oldEndpoint.job.owner,'recover_article_claim',oldRecoverArgs));
  assert.equal((await row(oldEndpoint.job)).claim_token,oldEndpoint.job.claim_token);
  pass('older recover_article_claim boolean-only endpoint cannot rotate partial pre-Word manual identity around the new explicit termination protocol');

  const oldCall=load('article-claim-recovery'),staleEndpoint=await outputFixture('stale-legacy-recovery-cas');
  await update(staleEndpoint.job,'source_key=?',`synthetic-legacy/${staleEndpoint.job.target_id}/source`);
  const staleArticle=await row(staleEndpoint.job),stalePreview=await oldCall.articleClaimRecoveryCall(staleEndpoint.job.owner,staleArticle,'preview_article_claim_recovery',{platform:'toutiao'});
  on('batch',c=>c.source.includes('UPDATE articles SET claim_token=?,claim_expires=?,state=?,result_meta=?'),()=>update(staleEndpoint.job,'source_key=?',`articles/${staleEndpoint.job.target_id}/source`));
  await assert.rejects(oldCall.articleClaimRecoveryCall(staleEndpoint.job.owner,staleArticle,'recover_article_claim',{...oldRecoverArgs,article_id:staleEndpoint.job.target_id,
    confirm_article_id:staleEndpoint.job.target_id,expected_lease_fingerprint:stalePreview.lease_fingerprint}));
  assert.equal((await row(staleEndpoint.job)).claim_token,staleEndpoint.job.claim_token);
  assert.equal((await row(staleEndpoint.job)).result_meta,staleArticle.result_meta);
  pass('older recovery final SQL guard refuses captured stale article when it becomes canonical manual pre-Word before the atomic rotation');

  const partial=await outputFixture('partial-native-resume'),partialBefore=await row(partial.job),partialControl=await control(partial.job),
    partialEnd=await stopped(partial.job),partialArgs=await recoveryArgs(partial.job,holderProof(partialEnd));
  await recover(partial.job,partialArgs);
  assert.equal((await row(partial.job)).result_meta,partialBefore.result_meta);
  assert.equal((await control(partial.job)).legacy_output_binding,partialControl.legacy_output_binding);
  const continuation=promote(partial.job,partialArgs);assert.equal((await op.acquire(continuation,'heavy')).acquired,true);
  const declaration=await article.articleCall(continuation.owner,'begin_article_output',{...native(continuation),sha256:partial.meta.sha256,size:partial.meta.size,chunks:partial.meta.chunks});
  assert.equal(declaration.output_id,partial.meta.output_id);assert.equal(declaration.parts.length,1);
  await assert.rejects(article.articleCall(continuation.owner,'begin_article_output',{...native(continuation),sha256:hash('replacement'),size:partial.meta.size,chunks:partial.meta.chunks}));
  const continued=await article.articleCall(continuation.owner,'put_article_output_chunk',{...native(continuation),output_id:partial.meta.output_id,index:1,data_base64:partial.partBytes[1].toString('base64')});
  assert.equal(continued.accepted,true);
  const finalized=await article.articleCall(continuation.owner,'finalize_article_output',{...native(continuation),output_id:partial.meta.output_id});
  assert.equal(finalized.ready,true);
  const actualWord=await h.bucket.get((await row(continuation)).result_key);
  assert.equal(hash(Buffer.from(await actualWord.arrayBuffer())),partial.meta.sha256);
  assert.equal((await p.readWordProgress(continuation.owner,'article',continuation.target_id)).save.independently_confirmed,true);
  pass('frozen partial native Word ID/hash/prefix and immutable legacy binding survive recovery; actual suffix/finalize/independent digest read completes the same synthetic DOCX');

  for(const name of ['begin_article_output','put_article_output_chunk']){
    const late=await outputFixture(`cached-${name}`),j=late.job,gate=barrier(),before=(await row(j)).result_meta;
    on('first',c=>c.source.startsWith("SELECT 1 FROM articles WHERE owner=? AND id=? AND state='processing'"),()=>gate.arrive());
    const args=name==='begin_article_output'?{...native(j),sha256:late.meta.sha256,size:late.meta.size,chunks:2}
      :{...native(j),output_id:late.meta.output_id,index:0,data_base64:late.partBytes[0].toString('base64')};
    const rejection=assert.rejects(article.articleCall(j.owner,name,args));
    await withDeadline(gate.ready,10000);const ended=await stopped(j),replacement=await recoveryArgs(j,holderProof(ended));await recover(j,replacement);
    gate.release();await withDeadline(rejection,10000);
    assert.equal((await row(j)).result_meta,before);assert.equal((await row(j)).result_key,null);
    pass(`${name}: cached declaration/duplicate acknowledgement revalidates the actual D1 fence after end/recovery and rejects the late old caller`);
  }

  for(const name of ['put_article_output_chunk','finalize_article_output']){
    const late=await outputFixture(`r2-late-${name}`,name==='finalize_article_output'),j=late.job,gate=barrier(),before=(await row(j)).result_meta;
    h.on({method:'bucket.put',phase:'after',action:()=>gate.arrive()});
    const args=name==='put_article_output_chunk'?{...native(j),output_id:late.meta.output_id,index:1,data_base64:late.partBytes[1].toString('base64')}
      :{...native(j),output_id:late.meta.output_id};
    const rejection=assert.rejects(article.articleCall(j.owner,name,args));
    await withDeadline(gate.ready,10000);const ended=await stopped(j),replacement=await recoveryArgs(j,holderProof(ended));await recover(j,replacement);
    gate.release();await withDeadline(rejection,10000);
    assert.equal((await row(j)).result_meta,before);assert.equal((await row(j)).result_key,null);
    assert.equal((await row(j)).state,'processing');
    pass(`${name}: actual async R2 return after ended-executor recovery cannot commit a chunk/final-save receipt or replace the frozen output`);
  }

  const oldObservation=await fixture('late-cached-progress'),observation=await op.progress(oldObservation,'read_source','completed',{action:'read_frozen_source',reason:'none'}),progressGate=barrier();
  on('first',c=>c.source.startsWith("SELECT 1 FROM articles WHERE owner=? AND id=? AND state='processing'"),()=>progressGate.arrive());
  const rejectedProgress=assert.rejects(p.recordWordProgress(oldObservation.owner,observation.event));
  await withDeadline(progressGate.ready,10000);const progressEnd=await stopped(oldObservation),progressReplace=await recoveryArgs(oldObservation,holderProof(progressEnd));await recover(oldObservation,progressReplace);
  progressGate.release();await withDeadline(rejectedProgress,10000);
  assert.equal((await p.readWordProgress(oldObservation.owner,'article',oldObservation.target_id)).version,1);
  pass('cached progress event replay held before actual permission SQL rejects late old holder after recovery without appending history');

  const lateCheckpoint=await fixture('late-checkpoint',{scope:'heavy'}),checkpointAsset=randomUUID(),image=Buffer.from(png()),imageArgs={...base(lateCheckpoint),asset_id:checkpointAsset};
  await w.checkpointCall(lateCheckpoint.owner,'begin_word_checkpoint',{...imageArgs,kind:'image',sha256:hash(image),size:image.length,chunks:1,
    metadata:{source_url:'https://images.example.org/actual-fixture.png',source_title:'Synthetic retained raster',after_paragraph:1}});
  const checkpointGate=barrier();h.on({method:'bucket.put',phase:'after',action:()=>checkpointGate.arrive()});
  const checkpointRejection=assert.rejects(w.checkpointCall(lateCheckpoint.owner,'put_word_checkpoint_chunk',{...imageArgs,index:0,data_base64:image.toString('base64')}));
  await withDeadline(checkpointGate.ready,10000);const checkpointEnd=await stopped(lateCheckpoint),checkpointReplace=await recoveryArgs(lateCheckpoint,holderProof(checkpointEnd));await recover(lateCheckpoint,checkpointReplace);
  checkpointGate.release();await withDeadline(checkpointRejection,10000);
  assert.equal((await d1.prepare('SELECT parts_json FROM word_checkpoints WHERE owner=? AND target_id=? AND asset_id=?').bind(lateCheckpoint.owner,lateCheckpoint.target_id,checkpointAsset).first()).parts_json,'[]');
  pass('actual checkpoint R2 upload arriving after recovery remains unaccepted; image count and committed checkpoint prefix never advance');

  for(const table of ['article_word_executor_ends','article_word_claim_recoveries']){
    const key=table==='article_word_executor_ends'?end.args.request_key:lostArgs.request_key,j=table==='article_word_executor_ends'?holder:lost;
    await assert.rejects(d1.prepare(`UPDATE ${table} SET created=? WHERE owner=? AND request_key=?`).bind(new Date().toISOString(),j.owner,key).run());
    await assert.rejects(d1.prepare(`DELETE FROM ${table} WHERE owner=? AND request_key=?`).bind(j.owner,key).run());
    const audit=await d1.prepare(`SELECT * FROM ${table} WHERE owner=? AND request_key=?`).bind(j.owner,key).first();
    noSecret(audit,[j.claim_token,j.execution_token,...(j===lost?[lostArgs.next_claim_token]:[])]);
  }
  pass('both durable audit tables reject UPDATE/DELETE and store only credential hashes, never old/new plaintext tokens');

  const terminalJob=await fixture('completed-read-only'),terminalEnd=await stopped(terminalJob),terminalArgs=await recoveryArgs(terminalJob,holderProof(terminalEnd));
  await update(terminalJob,"state='word_ready',result_key=?",`articles/${terminalJob.target_id}/retained-final.docx`);
  await assert.rejects(recover(terminalJob,terminalArgs));
  await assert.rejects(stopped(terminalJob));
  assert.equal(await count('article_word_claim_recoveries',terminalJob),0);
  pass('finalized records remain read-only; old exact fingerprint/end cannot reopen or replace a completed Word');

  const bypass=await fixture('ordinary-claim-bypass');
  await update(bypass,'claim_expires=?',new Date(Date.now()-60000).toISOString());
  const bypassResult=await article.articleCall(bypass.owner,'claim_article',{article_id:bypass.target_id});
  assert.equal(bypassResult.claimed,false);assert.equal((await row(bypass)).claim_token,bypass.claim_token);
  noSecret(bypassResult,[bypass.claim_token,bypass.execution_token]);
  pass('ordinary claim_article cannot silently regrant an expired pre-Word task outside explicit ended-executor recovery');

  const claimRace=await fixture('ordinary-claim-cas-race',{acquire:false});await update(claimRace,'claim_token=NULL,claim_expires=NULL');
  on('run',c=>c.source.startsWith('UPDATE articles SET state=?,claim_token=?,claim_expires=?'),()=>update(claimRace,'claim_token=?,claim_expires=?',claimRace.claim_token,new Date(Date.now()-60000).toISOString()));
  const claimRaceResult=await article.articleCall(claimRace.owner,'claim_article',{article_id:claimRace.target_id});
  assert.equal(claimRaceResult.claimed,false);assert.equal((await row(claimRace)).claim_token,claimRace.claim_token);
  pass('ordinary claim SQL repeats pre-Word recovery guard and rejects an expired old claim inserted after its read-time check');

  const poolOwner=owner('recovered-pool'),pool=[];
  for(let i=0;i<8;i++){
    const j=await fixture(`pool-${i}`,{who:poolOwner,acquire:false}),key=randomUUID(),created=new Date(Date.now()-120000).toISOString();
    await attachQueue(j,key,created);
    const a=await recoveryArgs(j,{...terminal,execution_id:randomUUID(),thread_id:randomUUID(),turn_id:randomUUID(),original_acquisition_request_key:key});
    await recover(j,a);pool.push(promote(j,a));
  }
  const preparations=await Promise.all(pool.map(j=>op.acquire(j,'prepare')));
  assert.equal(preparations.filter(x=>x.acquired).length,1);
  assert.equal((await d1.prepare("SELECT COUNT(*) n FROM word_recovery WHERE owner=? AND token_hash IS NOT NULL AND desired='run' AND status='running'").bind(poolOwner).first()).n,1);
  const winners=pool.filter((_,i)=>preparations[i].acquired),ta=await Promise.all(winners.map(j=>op.transitionArgs(j,'heavy')));
  const heavies=await Promise.all(winners.map((j,i)=>op.transition(j,ta[i])));assert.equal(heavies.filter(x=>x.acquired).length,1);
  assert.equal((await d1.prepare("SELECT COUNT(*) n FROM word_recovery WHERE owner=? AND token_hash IS NOT NULL AND desired='run' AND status='running' AND execution_scope='heavy'").bind(poolOwner).first()).n,1);
  pass('eight recovered same-owner tasks admit one serial preparation holder which converts to heavy within the retained seven/two resource ceilings; recovery itself never autogrants');

  assert.equal(h.externalCalls,0);assert.equal(hooks.length,0);
  console.log(`RESULT ${passed} independent groups PASS; actual Site TypeScript/workerd D1, synthetic records and R2 fixture bytes only, zero production/network calls; no real Word or computer-chain acceptance claimed`);
} finally { h.close();await mf.dispose(); }
