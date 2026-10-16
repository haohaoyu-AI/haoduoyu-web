// Actual migrated SQLite, real articleCall, synthetic Word/R2. External requests are forbidden.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('./article-upload-reimport.mjs',import.meta.url),'utf8').split('let cases = 0, failures = 0;')[0]
 .replace("from 'typescript'",`from ${JSON.stringify(import.meta.resolve('typescript'))}`)
 .replace("from 'fflate'",`from ${JSON.stringify(import.meta.resolve('fflate'))}`)
 .replace('createRequire(import.meta.url)',`createRequire(${JSON.stringify(new URL('../package.json',import.meta.url).href)})`);
const harness=await import('data:text/javascript;base64,'+Buffer.from(source+`\nexport {sql,db,objects,fixture,call,reserveArgs,receipt,guards,tools,instant};
export const setBeforeRun=v=>{beforeRun=v;}; export const setAfterRun=v=>{afterRun=v;}; export const advance=v=>{tick+=v;}; export const networkCount=()=>networkCalls;`).toString('base64'));
const {sql,db,fixture,call,reserveArgs,receipt,guards,tools,instant,setBeforeRun,setAfterRun,advance,networkCount}=harness;
const history=f=>sql.prepare('SELECT * FROM article_upload_attempts WHERE owner=? AND article_id=? ORDER BY attempt_version').all(f.owner,f.id);
const latest=f=>history(f).at(-1);
async function root(label,platform='toutiao',kind='legacy',guard=1){
 const f=await fixture(label);f.platform=platform;f.account=guards.authorizedUploadAccounts[platform];
 sql.prepare('UPDATE articles SET upload_guard_version=? WHERE id=?').run(guard,f.id);
 if(platform==='zhihu'){const lease=await call(f,'claim_article_delivery',{platform});f.claim=lease.delivery_token;}
 const p=reserveArgs(f,platform,f.claim);
 if(kind==='legacy')Object.assign(p,{mode:'owner_confirmed_legacy_reimport',expected_attempt_id:null,confirm_unrecorded_history:true,prior_draft_identity:'unknown_without_editor_url',authorization_scope:'duplicate_tolerant_task',confirm_duplicate_tolerant_task:true,current_task_id:'task-'+f.id,current_word_sha256:f.hash,authorization_key:'root-'+f.id,confirmation_message_id:'original-owner-'+f.id,prior_executor_end_reference:'original-unknown-ended',prior_executor_stopped:true,confirm_reimport:true,confirm_new_draft:true,preserve_existing_draft:true});
 if(kind==='legacy')Object.assign(p.preflight.existing_drafts,{prior_submission:'submitted_unknown',editor_empty:true,private_draft:true});
 if(kind==='first')Object.assign(p,{mode:'owner_confirmed_first_import',confirm_never_submitted:true});
 f.root=await call(f,'reserve_article_upload',p);f.claim=f.root.execution_claim??f.claim;return f;
}
async function recovery(f){
 const preview=await call(f,'preview_article_unconsumed_upload_recovery',{platform:f.platform}),p=reserveArgs(f,f.platform,f.claim);
 Object.assign(p.preflight.existing_drafts,{prior_submission:preview.attempt.submission_state,matching_editor_urls:preview.retained_editor_urls,editor_empty:true,private_draft:true});
 return {...p,mode:'continue_unconsumed',previous_attempt_id:preview.attempt.attempt_id,expected_attempt_revision:preview.attempt.revision,expected_recovery_fingerprint:preview.recovery_fingerprint,current_task_id:'task-'+f.id,authorization_key:'recovery-'+preview.attempt.attempt_id,confirmation_message_id:'explicit-recovery-owner-'+preview.attempt.attempt_id,prior_executor_end_reference:'actual-cancelled-and-settled-'+preview.attempt.attempt_id,prior_executor_stopped:true,confirm_unconsumed_recovery:true,confirm_new_draft:true,preserve_existing_draft:true};
}
const reserve=(f,a)=>call(f,'reserve_article_upload',a);
const consume=(f,out,file)=>call(f,'consume_article_upload',{platform:f.platform,attempt_id:out.attempt.attempt_id,execution_claim:out.execution_claim??f.claim,consume_token:out.consume_token,target_account:f.account,file_confirmation:file??out.attempt.preflight.file,reimport_editor_confirmation:{target_account:f.account,current_editor_url:f.platform==='toutiao'?'https://mp.toutiao.com/profile_v4/graphic/publish':'https://zhuanlan.zhihu.com/write',editor_empty:true,private_draft:true,checked_at:instant()}});
let cases=0;
async function test(name,fn){try{await fn();cases++;console.log('PASS '+name);}finally{setBeforeRun(null);setAfterRun(null);}}
await test('flat tool schema advertises exact preview and independently confirmed continuation',async()=>{
 const t=tools.articleTools.find(t=>t.name==='reserve_article_upload');assert.ok(t.inputSchema.properties.mode.enum.includes('continue_unconsumed'));assert.equal(t.inputSchema.allOf,undefined);assert.equal(t.inputSchema.properties.confirm_unconsumed_recovery.const,true);assert.ok(tools.articleTools.some(t=>t.name==='preview_article_unconsumed_upload_recovery'));
});
await test('both destinations and guard versions preserve legacy root verbatim; child single-consumes; no old secrets reissue',async()=>{
 for(const platform of ['toutiao','zhihu'])for(const guard of [0,1]){
  const f=await root(platform+guard,platform,'legacy',guard),before=JSON.stringify(latest(f)),a=await recovery(f),out=await reserve(f,a);
  assert.equal(out.reserved,true);assert.equal(out.old_permit_fenced,true);assert.equal(out.execute_import,false);assert.equal(out.attempt.previous_attempt_id,f.root.attempt.attempt_id);assert.equal(out.attempt.attempt_version,2);assert.equal(out.attempt.prior_history,'untracked_unknown');assert.equal(out.attempt.submission_state,'submitted_unknown');assert.equal(JSON.stringify(history(f)[0]),before);assert.equal(latest(f).confirmation_message_id,null);assert.equal(sql.prepare('SELECT COUNT(*) n FROM article_upload_executor_ends WHERE article_id=?').get(f.id).n,0);
  await assert.rejects(consume(f,f.root));assert.equal((await consume(f,out)).execute_import,true);assert.equal((await consume(f,out)).execute_import,false);
  const replay=await reserve(f,a);assert.equal(replay.cached,true);assert.equal(replay.reserved,false);assert.equal(replay.execution_claim,undefined);assert.equal(replay.consume_token,undefined);assert.equal(replay.attempt.attempt_id,out.attempt.attempt_id);assert.equal(history(f).length,2);assert.equal(JSON.stringify(history(f)[0]),before);
 }
});
await test('owner exact recovery needs no lost bearer and fences live, expired and normally released lease snapshots on both platforms',async()=>{
 for(const platform of ['toutiao','zhihu'])for(const leaseState of ['lost-live','expired','released']){
  const f=await root('lost-all-'+platform+leaseState,platform);if(leaseState==='expired')sql.prepare('UPDATE '+(platform==='toutiao'?'articles':'article_deliveries')+' SET claim_expires=? WHERE '+(platform==='toutiao'?'id':'article_id')+'=?').run('2020-01-01T00:00:00Z',f.id);if(leaseState==='released')await call(f,'finish_article_upload_execution',{platform,execution_claim:f.claim,executor_stopped:true});
  const a=await recovery(f);delete a.execution_claim;delete a.mode;const before=JSON.stringify(latest(f));const out=await call(f,'recover_article_unconsumed_upload',a);assert.equal(out.reserved,true);assert.equal(out.old_permit_fenced,true);assert.equal(JSON.stringify(history(f)[0]),before);assert.equal((await consume(f,out)).execute_import,true);const replay=await call(f,'recover_article_unconsumed_upload',a);assert.equal(replay.cached,true);assert.equal(replay.execution_claim,undefined);assert.equal(replay.consume_token,undefined);
 }
});
await test('ordinary first grants, finish then normal claim, and two successive lost permits retain immutable lineage',async()=>{
 for(const kind of ['new','first','legacy']){
  const f=await root('handoff-'+kind,'toutiao',kind,kind==='first'?0:1),first=JSON.stringify(latest(f));
  await call(f,'finish_article_upload_execution',{platform:f.platform,execution_claim:f.claim,executor_stopped:true});const claim=await call(f,'claim_article',{});f.claim=claim.claim_token;
  for(let i=0;i<2;i++){const a=await recovery(f),out=await reserve(f,a);assert.equal(out.reserved,true);f.claim=out.execution_claim;if(i===1)assert.equal((await consume(f,out)).execute_import,true);}
  assert.equal(history(f).length,3);assert.equal(JSON.stringify(history(f)[0]),first);
 }
});
await test('unconsumed reimport permit preserves its genuinely consumed unknown ancestor and exact executor end',async()=>{
 const f=await root('reimport-parent','toutiao','new');await consume(f,f.root);const consumed=latest(f);
 await call(f,'record_article_upload_executor_end',{platform:f.platform,attempt_id:consumed.id,execution_claim:f.claim,target_account:f.account,word_sha256:f.hash,word_size:f.bytes.length,expected_attempt_revision:consumed.revision,prior_draft_identity:'unknown_without_editor_url',prior_executor_stopped:true,prior_executor_end_reference:'genuine-synthetic-ancestor-ended'});
 const p=reserveArgs(f);Object.assign(p.preflight.existing_drafts,{prior_submission:'submitted_unknown',editor_empty:true,private_draft:true});
 const reimport=await call(f,'reserve_article_upload',{...p,mode:'owner_confirmed_reimport',previous_attempt_id:consumed.id,prior_draft_identity:'unknown_without_editor_url',authorization_scope:'duplicate_tolerant_task',confirm_duplicate_tolerant_task:true,current_task_id:'task-'+f.id,current_word_sha256:f.hash,authorization_key:'actual-consumed-reimport-'+f.id,confirmation_message_id:'actual-standing-owner-'+f.id,prior_executor_end_reference:'genuine-synthetic-ancestor-ended',prior_executor_stopped:true,confirm_reimport:true,confirm_new_draft:true,preserve_existing_draft:true});f.claim=reimport.execution_claim;
 const before=JSON.stringify(history(f)),endBefore=JSON.stringify(sql.prepare('SELECT * FROM article_upload_executor_ends WHERE article_id=?').all(f.id));const a=await recovery(f),child=await reserve(f,a);assert.equal(child.attempt.attempt_version,3);assert.equal(JSON.stringify(history(f).slice(0,2)),before);assert.equal(JSON.stringify(sql.prepare('SELECT * FROM article_upload_executor_ends WHERE article_id=?').all(f.id)),endBefore);assert.equal((await consume(f,child)).execute_import,true);
});
await test('missing confirmation, stopped reference, scope/task/Word/revision/fingerprint changes never allocate',async()=>{
 const f=await root('negative'),a=await recovery(f);
 for(const change of [v=>delete v.confirm_unconsumed_recovery,v=>v.prior_executor_stopped=false,v=>v.prior_executor_end_reference='',v=>v.confirmation_message_id='',v=>v.previous_attempt_id=crypto.randomUUID(),v=>v.expected_attempt_revision++,v=>v.expected_recovery_fingerprint='0'.repeat(64),v=>v.current_task_id='another-task',v=>v.target_account='another-account',v=>v.word_size++,v=>v.word_sha256='0'.repeat(64),v=>v.preflight.existing_drafts.editor_empty=false,v=>v.preflight.existing_drafts.prior_submission='never_attempted']){const v=structuredClone(a);change(v);await assert.rejects(reserve(f,v));assert.equal(history(f).length,1);}
 await assert.rejects(tools.articleCall('other-owner','reserve_article_upload',{article_id:f.id,...a}));
});
await test('consumed, unknown without consumption, verified, observed, verify-only and terminal parents stay closed',async()=>{
 for(const state of ['consumed','outcome_unknown','draft_observed','verified','verify_only','terminal']){
  const f=await root(state),a=await recovery(f);
  if(state==='consumed')await consume(f,f.root);else if(state==='terminal')sql.prepare("UPDATE articles SET state='completed' WHERE id=?").run(f.id);else if(state==='verify_only'){
   // Separate genuine verify-only root: do not defeat immutable identity trigger.
   const v=await fixture('verify-only');const p=reserveArgs(v);p.mode='verify_existing';p.preflight.existing_drafts.prior_submission='submitted_unknown';await call(v,'reserve_article_upload',p);await assert.rejects(call(v,'preview_article_unconsumed_upload_recovery',{platform:'toutiao'}));continue;
  }else sql.prepare('UPDATE article_upload_attempts SET state=? WHERE id=?').run(state,latest(f).id);
  await assert.rejects(reserve(f,a));assert.equal(history(f).length,1);
 }
});
await test('published, scheduled and user-edited destination phases never receive continuation',async()=>{
 for(const platform of ['toutiao','zhihu'])for(const state of ['published','scheduled','user_edited',platform==='toutiao'?'completed':'saved']){const f=await root('protected-'+platform+state,platform),a=await recovery(f);if(platform==='toutiao')sql.prepare('UPDATE articles SET state=? WHERE id=?').run(state,f.id);else sql.prepare('UPDATE article_deliveries SET state=? WHERE article_id=? AND platform=?').run(state,f.id,platform);await assert.rejects(reserve(f,a));assert.equal(history(f).length,1);}
 const f=await root('published-main','zhihu'),a=await recovery(f);sql.prepare("UPDATE articles SET state='published' WHERE id=?").run(f.id);await assert.rejects(reserve(f,a));assert.equal(history(f).length,1);
});
await test('changed artifact/destination/lease/source and user readback fail exact snapshot CAS at insertion',async()=>{
 for(const field of ['word','text','lease','phase','guard','source','readback','parent']){
  const f=await root(field),a=await recovery(f);let fired=false;
  setBeforeRun(q=>{if(q.startsWith('INSERT OR IGNORE INTO article_upload_attempts')){setBeforeRun(null);fired=true;if(field==='word')sql.prepare('UPDATE articles SET result_meta=? WHERE id=?').run('{}',f.id);if(field==='text')sql.prepare('UPDATE articles SET paragraphs=? WHERE id=?').run('["user edit"]',f.id);if(field==='lease')sql.prepare('UPDATE articles SET claim_token=? WHERE id=?').run(crypto.randomUUID(),f.id);if(field==='phase')sql.prepare("UPDATE articles SET state='toutiao_saving' WHERE id=?").run(f.id);if(field==='guard')sql.prepare('UPDATE articles SET upload_guard_version=0 WHERE id=?').run(f.id);if(field==='source')sql.prepare('UPDATE articles SET source_key=? WHERE id=?').run('changed/source',f.id);if(field==='readback')sql.prepare('UPDATE articles SET draft_readback=? WHERE id=?').run('{"user_edit":true}',f.id);if(field==='parent')sql.prepare('UPDATE article_upload_attempts SET revision=revision+1 WHERE id=?').run(f.root.attempt.attempt_id);}});
  await assert.rejects(reserve(f,a));assert.equal(fired,true);assert.equal(history(f).length,1);
 }
});
await test('genuine committed recovery with lost batch response returns only the same cached child, never credentials',async()=>{
 const f=await root('lost-batch'),a=await recovery(f),original=db.batch;
 db.batch=async statements=>{await original(statements);throw Error('synthetic response lost AFTER actual COMMIT');};
 let out;try{out=await reserve(f,a);}finally{db.batch=original;}
 assert.equal(out.reserved,false);assert.equal(out.cached,true);assert.equal(out.execute_import,false);assert.equal(out.execution_claim,undefined);assert.equal(out.consume_token,undefined);assert.equal(history(f).length,2);assert.equal(latest(f).consumed_at,null);assert.equal(out.attempt.attempt_id,latest(f).id);
});
await test('same-key and different-key simultaneous recovery have one child, one new permit and one consume winner',async()=>{
 for(const same of [true,false]){const f=await root('race-'+same),a=await recovery(f),b=same?structuredClone(a):{...a,authorization_key:'other-request-'+f.id};const results=await Promise.allSettled([reserve(f,a),reserve(f,b)]),winners=results.filter(r=>r.status==='fulfilled'&&r.value.reserved).map(r=>r.value);assert.equal(winners.length,1);assert.equal(history(f).length,2);const outcomes=await Promise.all([consume(f,winners[0]),consume(f,winners[0])]);assert.equal(outcomes.filter(v=>v.execute_import).length,1);}
});
await test('late old consume vs recovery linearize in either order; no hidden parent rewrite',async()=>{
 for(const consumeFirst of [true,false]){const f=await root('old-race-'+consumeFirst),a=await recovery(f),parent=JSON.stringify(latest(f));
  if(consumeFirst){setBeforeRun(async q=>{if(q.startsWith('INSERT OR IGNORE INTO article_upload_attempts')){setBeforeRun(null);assert.equal((await consume(f,f.root)).execute_import,true);}});await assert.rejects(reserve(f,a));assert.equal(history(f).length,1);}else{let out;setBeforeRun(async q=>{if(q.startsWith("UPDATE article_upload_attempts SET state='outcome_unknown'")){setBeforeRun(null);out=await reserve(f,a);}});assert.equal((await consume(f,f.root)).execute_import,false);assert.equal(out.reserved,true);assert.equal(JSON.stringify(history(f)[0]),parent);assert.equal((await consume(f,out)).execute_import,true);}
 }
});
await test('child consume repeats full source/guard/text/readback scope CAS and rejects changed file',async()=>{
 for(const field of ['source','guard','text','readback','file']){const f=await root('child-'+field),a=await recovery(f),out=await reserve(f,a);if(field==='file'){const file={...out.attempt.preflight.file,size:f.bytes.length+1};await assert.rejects(consume(f,out,file));}else{setBeforeRun(q=>{if(q.startsWith("UPDATE article_upload_attempts SET state='outcome_unknown'")){setBeforeRun(null);const updates={source:['source_key','changed'],guard:['upload_guard_version',0],text:['paragraphs','["edited"]'],readback:['draft_readback','{"edited":true}']};const [k,v]=updates[field];sql.prepare('UPDATE articles SET '+k+'=? WHERE id=?').run(v,f.id);}});assert.equal((await consume(f,out)).execute_import,false);}assert.equal(latest(f).consumed_at,null);}
});
await test('parent becomes immutable; old historical URL cannot become child result; independent saved full readback succeeds',async()=>{
 const f=await root('readback'),a=await recovery(f),old='https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=999';a.preflight.existing_drafts.matching_editor_urls=[old];const out=await reserve(f,a);await assert.rejects(async()=>sql.prepare('UPDATE article_upload_attempts SET revision=revision+1 WHERE id=?').run(f.root.attempt.attempt_id),/immutable/);await assert.rejects(async()=>sql.prepare('DELETE FROM article_upload_attempts WHERE id=?').run(f.root.attempt.attempt_id),/immutable_history_requires_confirmed_article_purge/);
 await consume(f,out);const common={platform:f.platform,attempt_id:out.attempt.attempt_id,execution_claim:out.execution_claim};await assert.rejects(call(f,'record_article_upload',{...common,state:'draft_observed',editor_url:old}));await call(f,'record_article_status',{claim_token:out.execution_claim,state:'toutiao_saving'});
 const r=receipt(f);await call(f,'record_article_upload',{...common,state:'draft_observed',editor_url:r.draft_url});await call(f,'record_article_upload',{...common,state:'verified',readback:r});await call(f,'record_article_status',{claim_token:out.execution_claim,state:'completed',draft_url:r.draft_url});assert.equal(latest(f).state,'verified');
});
await test('expired old preflight may be refreshed only by exact newly approved recovery, never ordinary replay',async()=>{
 const f=await root('freshness');advance(16*60000);await assert.rejects(consume(f,f.root),/Fresh/);const a=await recovery(f),out=await reserve(f,a);assert.equal((await consume(f,out)).execute_import,true);assert.equal(history(f).length,2);
});
assert.equal(networkCount(),0);console.log(`${cases} unconsumed recovery groups passed; actual SQLite/migrations/indices, synthetic Word/R2; external calls=0.`);
