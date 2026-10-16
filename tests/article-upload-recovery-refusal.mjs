// Exact reported state shape, synthetic content/claims only; actual service SQL.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('./article-upload-reimport.mjs',import.meta.url),'utf8').split('let cases = 0, failures = 0;')[0]
 .replace("from 'typescript'",`from ${JSON.stringify(import.meta.resolve('typescript'))}`).replace("from 'fflate'",`from ${JSON.stringify(import.meta.resolve('fflate'))}`)
 .replace('createRequire(import.meta.url)',`createRequire(${JSON.stringify(new URL('../package.json',import.meta.url).href)})`);
const h=await import('data:text/javascript;base64,'+Buffer.from(source+`\nexport {sql,db,fixture,call,reserveArgs,instant,tools};export const setTick=v=>{tick=Date.parse(v);};export const setBeforeRun=v=>{beforeRun=v;};export const networkCount=()=>networkCalls;`).toString('base64'));
const {sql,db,fixture,call,reserveArgs,instant,setTick,setBeforeRun,networkCount}=h;
const rejection='Unconsumed recovery snapshot or scope changed';
const diagnosticTool=h.tools.articleTools.find(tool=>tool.name==='read_article_unconsumed_upload_diagnostics');
assert.ok(diagnosticTool);assert.deepEqual(JSON.parse(JSON.stringify(diagnosticTool.annotations)),{readOnlyHint:true,destructiveHint:false,openWorldHint:false});assert.equal(diagnosticTool.inputSchema.additionalProperties,false);assert.deepEqual(Object.keys(diagnosticTool.inputSchema.properties).sort(),['article_id','platform']);assert.deepEqual([...diagnosticTool.inputSchema.required].sort(),['article_id','platform']);
const currentTrigger=sql.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='article_upload_child_lineage'").get().sql;
const oldSql=fs.readFileSync('drizzle/0026_article_upload_reimport_history.sql','utf8');
const oldTrigger=oldSql.split('--> statement-breakpoint').find(statement=>statement.includes('CREATE TRIGGER article_upload_child_lineage'));
function replaceTrigger(definition){sql.exec('DROP TRIGGER article_upload_child_lineage');sql.exec(definition);}
const rows=f=>sql.prepare('SELECT * FROM article_upload_attempts WHERE owner=? AND article_id=? ORDER BY attempt_version').all(f.owner,f.id);
function handoff(p){const file=p.preflight.file;Object.assign(file,{visible_in_browser:false,visibility_unproven:true,handoff:{kind:'same_browser_download',download_path:'/mock/download/word.docx',download_browser_session:file.browser_session,executor_id:'offline-executor',source_sha256:file.sha256,source_size:file.size,verified_in_cua:true,copied_in_same_executor:true,chooser_prepared:true,chooser_prepared_at:instant()}});}
async function exactState(label){
 setTick('2026-10-08T18:28:16.105Z');const f=await fixture(label),p=reserveArgs(f);
 Object.assign(p,{mode:'owner_confirmed_legacy_reimport',expected_attempt_id:null,confirm_unrecorded_history:true,prior_draft_identity:'unknown_without_editor_url',authorization_scope:'duplicate_tolerant_task',confirm_duplicate_tolerant_task:true,current_task_id:'task-'+f.id,current_word_sha256:f.hash,authorization_key:'root-'+f.id,confirmation_message_id:'original-owner-'+f.id,prior_executor_end_reference:'original-unknown-ended',prior_executor_stopped:true,confirm_reimport:true,confirm_new_draft:true,preserve_existing_draft:true});
 Object.assign(p.preflight.existing_drafts,{prior_submission:'submitted_unknown',editor_empty:true,private_draft:true});handoff(p);
 f.root=await call(f,'reserve_article_upload',p);
 const article=sql.prepare('SELECT * FROM articles WHERE id=?').get(f.id),parent=rows(f)[0];
 assert.equal(article.state,'needs_verification');assert.equal(article.upload_guard_version,1);assert.equal(article.draft_url,null);assert.equal(article.claim_expires,'2026-10-09T00:28:16.105Z');assert.ok(article.claim_token);
 assert.equal(parent.authorization_kind,'owner_confirmed_legacy_reimport');assert.equal(parent.state,'reserved');assert.equal(parent.revision,0);assert.equal(parent.attempt_version,1);assert.equal(parent.previous_attempt_id,null);assert.equal(parent.consumed_at,null);assert.equal(parent.editor_urls,'[]');assert.equal(parent.readback,null);
 setTick('2026-10-09T02:54:10.514Z');const preview=await call(f,'preview_article_unconsumed_upload_recovery',{platform:'toutiao'}),fresh=reserveArgs(f);
 Object.assign(fresh.preflight.existing_drafts,{prior_submission:'submitted_unknown',editor_empty:true,private_draft:true});handoff(fresh);
 const args={...fresh,previous_attempt_id:parent.id,expected_attempt_revision:0,expected_recovery_fingerprint:preview.recovery_fingerprint,current_task_id:'task-'+f.id,authorization_key:'recover-'+f.id,confirmation_message_id:'recovery-owner-'+f.id,prior_executor_end_reference:'original-executor-cancelled-and-settled',prior_executor_stopped:true,confirm_unconsumed_recovery:true,confirm_new_draft:true,preserve_existing_draft:true};delete args.mode;delete args.execution_claim;
 return {f,args,before:JSON.stringify(rows(f)[0]),leaseBefore:article.claim_token};
}
let batchCalls=0,batchExceptions=0;const originalBatch=db.batch;
db.batch=async statements=>{batchCalls++;try{return await originalBatch(statements);}catch(error){batchExceptions++;throw error;}};
try{
 const {f,args,before}=await exactState('0037-applied-expired-guard1-legacy');
 const originalPrepare=db.prepare,reads=[];db.prepare=statement=>{assert.match(statement,/^SELECT\b/i);reads.push(statement);return originalPrepare(statement);};
 let diagnostic;try{diagnostic=await call(f,'read_article_unconsumed_upload_diagnostics',{platform:'toutiao'});}finally{db.prepare=originalPrepare;}
 assert.equal(diagnostic.read_only,true);assert.equal(diagnostic.execute_import,false);assert.equal(diagnostic.does_not_identify_past_failure_branch,true);
 assert.equal(diagnostic.schema.child_lineage,'unconsumed_v0037');assert.equal(diagnostic.schema.schema_checks_match_expected,true);
 assert.equal(diagnostic.current.upload_guard_version,1);assert.equal(diagnostic.current.destination_phase,'needs_verification');assert.equal(diagnostic.current.lease_claim_present,true);assert.equal(diagnostic.current.lease_expiry,'expired');assert.equal(diagnostic.current.parent_phase,'reserved');assert.equal(diagnostic.current.parent_authorization_kind,'owner_confirmed_legacy_reimport');assert.equal(diagnostic.current.parent_untouched_reserved,true);
 assert.ok(reads.length>=4);assert.equal(JSON.stringify(rows(f)[0]),before);
 await assert.rejects(h.call({...f,owner:'foreign-owner'},'read_article_unconsumed_upload_diagnostics',{platform:'toutiao'}));
 for(const token of [f.claim,f.root.execution_claim,f.root.consume_token])if(token)assert.equal(JSON.stringify(diagnostic).includes(token),false);
 assert.equal(JSON.stringify(diagnostic).includes('CREATE TRIGGER'),false);
 console.log('PASS actual owner-scoped read tool: SELECT-only on exact expired legacy state, fixed metadata/statuses, no claims/permits/SQL or parent writes; foreign owner rejected.');
 const out=await call(f,'recover_article_unconsumed_upload',args);
 assert.equal(out.reserved,true);assert.equal(out.execute_import,false);assert.equal(out.attempt.authorization_kind,'unconsumed_continuation');assert.equal(rows(f).length,2);assert.equal(JSON.stringify(rows(f)[0]),before);assert.equal(batchExceptions,0);
 assert.equal(out.attempt.preflight.file.visible_in_browser,false);assert.equal(out.attempt.preflight.file.visibility_unproven,true);
 assert.equal(out.attempt.prior_history,'untracked_unknown');assert.equal((await call(f,'recover_article_unconsumed_upload',args)).cached,true);
 console.log('PASS 0037 applied: exact expired lease + needs_verification + guard1 + reserved revision0/version1 legacy root allocates one child, preserves parent and false/unproven file evidence.');

 replaceTrigger(oldTrigger);const old=await exactState('0036-old-consumed-only-trigger'),count=batchCalls,exceptions=batchExceptions;
 assert.equal((await call(old.f,'read_article_unconsumed_upload_diagnostics',{platform:'toutiao'})).schema.child_lineage,'consumed_only_v0026');
 await assert.rejects(call(old.f,'recover_article_unconsumed_upload',old.args),error=>error.message===rejection);
 assert.equal(batchCalls,count+1);assert.equal(batchExceptions,exceptions+1);assert.equal(rows(old.f).length,1);assert.equal(JSON.stringify(rows(old.f)[0]),old.before);
 assert.equal(sql.prepare('SELECT claim_token FROM articles WHERE id=?').get(old.f.id).claim_token,old.leaseBefore);
 console.log('PASS old 0026/0036 consumed-only trigger: same exact state reaches db.batch, transaction rejects and rolls back, generic fixed refusal, no child/lease/parent rewrite.');

 replaceTrigger(currentTrigger);const scope=await exactState('precompare'),batchBefore=batchCalls;
 await assert.rejects(call(scope.f,'recover_article_unconsumed_upload',{...scope.args,expected_recovery_fingerprint:'0'.repeat(64)}),error=>error.message===rejection);
 assert.equal(batchCalls,batchBefore);assert.equal(rows(scope.f).length,1);
 console.log('PASS precompare mismatch: same fixed refusal before db.batch; distinguishable offline from transaction exception.');

 const zero=await exactState('zero-insert'),beforeZero=batchCalls,beforeExceptions=batchExceptions;let zeroChanges=null;
 const observer=db.batch;db.batch=async statements=>{const result=await observer(statements);zeroChanges=result[0].meta.changes;return result;};
 setBeforeRun(statement=>{if(statement.startsWith('INSERT OR IGNORE INTO article_upload_attempts')){setBeforeRun(null);sql.prepare('UPDATE articles SET draft_readback=? WHERE id=?').run(JSON.stringify({edited:true}),zero.f.id);}});
 await assert.rejects(call(zero.f,'recover_article_unconsumed_upload',zero.args),error=>error.message===rejection);db.batch=observer;
 assert.equal(batchCalls,beforeZero+1);assert.equal(batchExceptions,beforeExceptions);assert.equal(zeroChanges,0);assert.equal(rows(zero.f).length,1);assert.equal(JSON.stringify(rows(zero.f)[0]),zero.before);
 console.log('PASS zero-insert CAS race: batch succeeds with allocation changes=0, same fixed refusal, no child or parent rewrite.');
}finally{setBeforeRun(null);db.batch=originalBatch;replaceTrigger(currentTrigger);}
assert.equal(networkCount(),0);console.log('PASS all three refusal paths isolated with actual service/migrated SQLite; synthetic Word/lease only; external calls=0.');
