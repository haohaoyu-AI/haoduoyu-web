// Actual owner-scoped articleCall metadata, offline synthetic SQLite/R2 only.
// No production database, HTTP request, platform, credential, CUA or upload.
// The fake Word bytes and official-looking labels are not real host evidence.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createSyntheticHarness} from './word-recovery-harness.mjs';

const h=createSyntheticHarness({projectRoot:process.cwd()}),load=h.loader();
const {articleCall,articleTools}=load('article-tools');
const {articleUploadRuntime}=load('article-upload-runtime');
const bytes=new TextEncoder().encode('OFFLINE SYNTHETIC METADATA INPUT — NOT A WORD DOCUMENT');
const sha256=createHash('sha256').update(bytes).digest('hex');
const stamp=()=>new Date().toISOString();
let checks=0;
async function fixture({main='word_ready',delivery='pending',guard=1,word=true,badHash=false,attempt=null,draft=null}={}){
 const owner='offline-coordinate-'+randomUUID(),id=randomUUID(),claim=randomUUID();
 const key=word?`articles/${id}/offline-result`:null;
 const meta=word?JSON.stringify({output_id:randomUUID(),sha256:badHash?'not-a-sha':sha256,size:bytes.length,verification:{synthetic_only:true}}):null;
 h.sql.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state,claim_token,claim_expires,result_key,result_meta,upload_guard_version,draft_url) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .run(id,owner,'离线合成完整原标题','offline-source.txt',`articles/${id}/offline-source`,'["离线合成完整原标题","离线合成完整正文"]',stamp(),main,claim,new Date(Date.now()+3600000).toISOString(),key,meta,guard,draft);
 if(key)await h.bucket.put(key,bytes);
 if(delivery!==null)h.sql.prepare('INSERT INTO article_deliveries(id,owner,article_id,platform,state,updated,draft_url) VALUES(?,?,?,?,?,?,?)')
  .run(`${id}:zhihu`,owner,id,'zhihu',delivery,stamp(),delivery==='saved'?'https://zhuanlan.zhihu.com/p/2082089809443566588/edit':null);
 if(attempt)h.sql.prepare('INSERT INTO article_upload_attempts(id,owner,article_id,platform,target_account,word_sha256,word_size,authorization_kind,claim_hash,preflight,baseline,state,editor_urls,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .run(randomUUID(),owner,id,attempt,attempt==='toutiao'?'61556093362':'ren-zhe-ai-chi-yu-52',sha256,bytes.length,'offline-synthetic','0'.repeat(64),'{}','{}','outcome_unknown','[]',stamp(),stamp());
 return {owner,id,claim};
}
const snapshot=()=>JSON.stringify({
 articles:h.sql.prepare('SELECT * FROM articles ORDER BY id').all(),
 deliveries:h.sql.prepare('SELECT * FROM article_deliveries ORDER BY id').all(),
 attempts:h.sql.prepare('SELECT * FROM article_upload_attempts ORDER BY id').all(),
 ends:h.sql.prepare('SELECT * FROM article_upload_executor_ends ORDER BY attempt_id').all(),
 claims:h.sql.prepare('SELECT * FROM article_claim_credential_hashes ORDER BY owner,sha256').all()
});
async function handoff(f){
 const before=snapshot(),writes={run:h.counts.run||0,batch:h.counts.batch||0,put:h.counts['bucket.put']||0,get:h.counts['bucket.get']||0};
 const value=await articleCall(f.owner,'read_article_handoff',{article_id:f.id});
 assert.equal(snapshot(),before,'a metadata read must preserve task/delivery/attempt/history/claim rows');
 for(const key of ['run','batch'])assert.equal(h.counts[key]||0,writes[key]);
 assert.equal(h.counts['bucket.put']||0,writes.put);
 assert.equal(h.counts['bucket.get']||0,writes.get,'handoff should use immutable file metadata rather than remaking or downloading Word');
 assert.equal(JSON.stringify(value).includes(f.claim),false,'claim must not enter the public handoff');
 assert.equal(value.execute_import,false);
 checks++;
 return value;
}
try{
 const f=await fixture(),value=await handoff(f);
 for(const platform of ['toutiao','zhihu']){
  const route=value.destinations.find(item=>item.platform===platform);
  assert.equal(route.upload_method,'coordinate');assert.equal(route.method_name,'坐标法');assert.equal(route.picker_mode,'native');assert.equal(route.execution_contract,'host_transfer');
  const method=value.draft_delivery.methods[platform];
  assert.equal(method.upload_method,'coordinate');assert.equal(method.picker_mode,'native');assert.equal(method.execution_contract,'host_transfer');
  assert.equal(value.browser_preflight.picker.default_by_platform[platform],'native');
  assert.equal(value.browser_preflight.picker.method_by_platform[platform],'coordinate');
  assert.equal(value.upload_coordination[platform+'_normal_first_import'],'host_transfer');
  assert.equal(value.host_transfer.normal_first_import_candidates[platform],true);
 }
 assert.equal(value.upload_coordination.zhihu,'host_transfer');
 assert.equal(value.upload_coordination.host_transfer_requires_runner_or_bridge,false);
 assert.equal(value.upload_coordination.automatic_fallback,false);
 assert.equal(value.upload_coordination.host_entrypoint,'createNativeStepSession');
 assert.equal(value.upload_coordination.parent_business_core_only,true);
 assert.equal(value.upload_coordination.full_baseline_in_cua,false);
 assert.equal(value.upload_coordination.one_official_call_per_callback,true);
 assert.equal(value.upload_coordination.observation_steps_read_only,true);
 assert.equal(value.upload_coordination.single_physical_action_per_commit,true);
 assert.equal(value.upload_coordination.commit_has_no_pre_dispatch_await,true);
 assert.equal(value.upload_coordination.model_review_outside_host_call,true);
 const nativePicker=value.browser_preflight.native_picker;
 assert.equal(nativePicker.host_entrypoint,'createNativeStepSession');
 assert.equal(nativePicker.coordinate_contract,'native-step-single-action-v3');
 assert.deepEqual(JSON.parse(JSON.stringify(nativePicker.host_callbacks)),['inspectFile','readTab','readWindows','captureScreenshot','click','typeFilename']);
 assert.equal(nativePicker.one_official_call_per_callback,true);
 assert.equal(nativePicker.observation_steps_read_only,true);
 assert.equal(nativePicker.single_physical_action_per_commit,true);
 assert.equal(nativePicker.commit_has_no_pre_dispatch_await,true);
 assert.equal(nativePicker.model_review_outside_host_call,true);
 assert.equal(nativePicker.parent_business_core_only,true);
 assert.equal(nativePicker.full_baseline_in_cua,false);
 assert.match(nativePicker.capability_declaration,/exactly one current documented official tool call/);
 assert.match(nativePicker.capability_declaration,/void click result remains a project call record/);
 assert.match(nativePicker.installation,/definitions once/);
 assert.match(nativePicker.prepare,/model review outside the host call/);
 assert.match(nativePicker.prepare,/validate.*read-only/);
 assert.match(nativePicker.prepare,/dispatch_ready/);
 assert.match(nativePicker.prepare,/separate physical commit/);
 assert.match(nativePicker.prepare,/native_pending/);
 assert.match(nativePicker.submit,/without Enter/);
 assert.match(nativePicker.submit,/external focus\/path verification/);
 assert.match(nativePicker.cleanup,/cancellation immediately fences new dispatch/);
 assert.equal(value.draft_delivery.methods.zhihu.cover_required,true);
 assert.equal(value.draft_delivery.private_only,true);assert.equal(value.draft_delivery.reuse_final_word,true);
 for(const field of ['generate_images','public_publish','scheduled_publish','edit_or_delete_user_drafts'])assert.equal(value.draft_delivery[field],false);
 assert.equal(value.host_transfer.candidate_is_not_permission_or_history_proof,true);
 assert.equal(value.host_transfer.execute_import,false);
 assert.equal(value.host_transfer.version,'2026-10-11-native-step-host-3');
 assert.equal(value.host_transfer.source.entrypoint,'createNativeStepSession');
 assert.deepEqual(JSON.parse(JSON.stringify(value.host_transfer.source.components)),['native_action_ledger','native_step_session']);
 assert.equal(value.host_transfer.source.contains_parent_business,false);
 assert.equal(value.host_transfer.source.contains_private_baseline,false);
 assert.equal(value.host_transfer.source.complete_program,true);
 assert.equal(value.host_transfer.parent_source.version,'2026-10-11-native-step-parent-3');
 assert.equal(value.host_transfer.parent_source.entrypoint,'createParentNativeStepBridge');
 assert.equal(value.host_transfer.parent_source.parent_memory_only,true);
 assert.equal(value.host_transfer.parent_source.cua_submission_prohibited,true);
 assert.equal(value.host_transfer.parent_source.contains_platform_business_core,true);
 assert.equal(value.host_transfer.parent_source.contains_full_acceptance,true);
 assert.equal(value.word.sha256,sha256);assert.equal(value.word.size,bytes.length);assert.equal(value.word.browser_visibility_proven,false);
 assert.match(value.upload_protocol,/NORMAL FIRST IMPORTS \(Toutiao and Zhihu\)/);
 assert.match(value.upload_protocol,/EXPLICIT COMPATIBILITY ONLY/);

 // The compatibility descriptor must tell the truth about the unchanged legacy
 // runtime. Merely changing metadata cannot silently migrate its picker method.
 assert.equal(value.upload_runtime.compatibility_only,true);
 assert.equal(value.upload_runtime.recommended_for_normal_first_import,false);
 assert.equal(value.upload_runtime.automatic_fallback,false);
 assert.deepEqual(JSON.parse(JSON.stringify(value.upload_runtime.picker_selection.default_by_platform)),{toutiao:'browser',zhihu:'native'});
 assert.deepEqual(JSON.parse(JSON.stringify(value.upload_runtime.picker_selection.method_by_platform)),{toutiao:'codex',zhihu:'coordinate'});
 assert.equal(articleUploadRuntime.picker_selection.default_by_platform.toutiao,'browser');
 assert.equal(articleUploadRuntime.destinations.toutiao.upload_method,'codex');
 assert.equal(value.browser_preflight.browser_picker.compatibility_only,true);
 assert.equal(value.browser_preflight.browser_picker.recommended_for_normal_first_import,false);
 assert.equal(value.browser_preflight.browser_picker.automatic_fallback,false);
 assert.equal(value.browser_preflight.picker.explicit_picker_mode_compatibility.requires_explicit_mode,true);
 assert.equal(value.browser_preflight.picker.explicit_picker_mode_compatibility.automatic_fallback,false);
 assert.equal('native_source_modules' in value.upload_runtime,false,'auxiliary native programs are distinct from legacy compatibility metadata');

 for(const module of ['native_coordinate','native_parent']){
  const descriptor=value.native_source_modules[module];
  assert.equal(descriptor.module,module);assert.equal(descriptor.complete_program,true);
  assert.equal(descriptor.read_only,true);assert.equal(descriptor.execute_import,false);
  assert.equal(descriptor.cua_execution_authorized,false);assert.equal(descriptor.installed_or_platform_verified,false);
  assert.equal(descriptor.parent_memory_only,module==='native_parent');assert.equal(descriptor.cua_submission_prohibited,module==='native_parent');
 }
 assert.equal(value.native_source_modules.native_coordinate.version,value.host_transfer.version);
 assert.equal(value.native_source_modules.native_parent.version,value.host_transfer.parent_source.version);
 assert.deepEqual(JSON.parse(JSON.stringify(value.native_source_modules.native_coordinate.entrypoints)),['createNativeStepSession']);
 assert.ok(value.native_source_modules.native_parent.entrypoints.includes('createPrivateDraftTransfer'));
 assert.ok(value.native_source_modules.native_parent.entrypoints.includes('createParentNativeStepBridge'));

 // Production main completion must not suppress a separate unstarted Zhihu
 // delivery. A candidate is still an observation hint, never import authority.
 for(const item of [
  {options:{main:'completed',draft:'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=7312345678901234567'},toutiao:false,zhihu:true},
  {options:{main:'completed',delivery:null},toutiao:false,zhihu:true},
  {options:{main:'completed',delivery:'saved'},toutiao:false,zhihu:false},
  {options:{delivery:'needs_verification'},toutiao:true,zhihu:false},
  {options:{attempt:'toutiao'},toutiao:false,zhihu:true},
  {options:{attempt:'zhihu'},toutiao:true,zhihu:false},
  {options:{word:false},toutiao:false,zhihu:false},
  {options:{badHash:true},toutiao:false,zhihu:false},
  {options:{guard:0},toutiao:false,zhihu:false}
 ]){
  const result=await handoff(await fixture(item.options));
  assert.equal(result.host_transfer.normal_first_import_candidates.toutiao,item.toutiao);
  assert.equal(result.host_transfer.normal_first_import_candidates.zhihu,item.zhihu);
  assert.equal(result.host_transfer.normal_first_import_candidate,item.toutiao||item.zhihu);
  assert.equal(result.host_transfer.candidate_is_not_permission_or_history_proof,true);
  assert.equal(result.execute_import,false);
  assert.ok(result.destinations.some(d=>d.platform==='zhihu'),'unstarted destination is represented without creating a delivery row');
 }

 const articleBefore=snapshot(),raw=await articleCall(f.owner,'read_article',{article_id:f.id});
 assert.equal(snapshot(),articleBefore);
 assert.equal(raw.upload_coordination.toutiao_normal_first_import,'host_transfer');
 assert.equal(raw.upload_coordination.zhihu_normal_first_import,'host_transfer');
 assert.equal(raw.upload_runtime.compatibility_only,true);
 assert.equal(raw.upload_runtime.picker_selection.default_by_platform.toutiao,'browser');
 assert.equal(raw.host_transfer.picker_mode,'native');assert.equal(raw.host_transfer.upload_method,'coordinate');
 assert.equal(JSON.stringify(raw).includes(f.claim),false);
 checks++;

 const readExecutor=articleTools.find(item=>item.name==='read_article_delivery_executor');
 const readRuntime=articleTools.find(item=>item.name==='read_article_upload_runtime');
 const readHandoff=articleTools.find(item=>item.name==='read_article_handoff');
 for(const definition of [readExecutor,readRuntime,readHandoff]){
  assert.equal(definition.annotations.readOnlyHint,true);assert.equal(definition.annotations.destructiveHint,false);
  assert.equal(definition.inputSchema.additionalProperties,false);
 }
 assert.match(readExecutor.description,/both Toutiao and Zhihu/);
 assert.match(readExecutor.description,/same prepared native file window/);
 assert.match(readExecutor.description,/createNativeStepSession/);
 assert.match(readExecutor.description,/definitions once/);
 assert.match(readExecutor.description,/model review outside the call/);
 assert.match(readExecutor.description,/exactly one documented official call/);
 assert.match(readExecutor.description,/business core, gate, full frozen baseline/);
 assert.match(readExecutor.description,/complete actual installation call/);
 assert.match(readHandoff.description,/Both Toutiao and Zhihu use 坐标法/);
 assert.match(readHandoff.description,/read-only validate/);
 assert.match(readHandoff.description,/physical commit.*no preceding await/);
 assert.match(readRuntime.description,/parent-memory-only/);assert.match(readRuntime.description,/must never enter CUA/);
 assert.match(readRuntime.description,/containing the business core, gate and bridge/);
 assert.match(readRuntime.inputSchema.properties.expected_version.description,/host and parent native modules have distinct versions/);
 assert.deepEqual(JSON.parse(JSON.stringify(readRuntime.inputSchema.properties.module.enum)),['runner','bridge','native_coordinate','native_parent']);
 assert.equal('source_target' in readExecutor.inputSchema.properties,false,'primary source is one complete program, not selectable fragments');
 const metadata=await articleCall(f.owner,'read_article_delivery_executor',{article_id:f.id,expected_version:value.host_transfer.version,metadata_only:true});
 assert.equal(metadata.execute_import,false);assert.equal(metadata.read_only,true);assert.equal(metadata.source_text,undefined);
 assert.equal(metadata.entrypoint,'createNativeStepSession');assert.equal(metadata.complete_program,true);
 assert.equal(metadata.contains_parent_business,false);assert.equal(metadata.contains_private_baseline,false);
 assert.equal(metadata.complete_call_budget_verified,false);
 assert.equal(metadata.sha256,value.host_transfer.source.sha256);assert.equal(metadata.size,value.host_transfer.source.size);
 await assert.rejects(articleCall('offline-other-owner','read_article_handoff',{article_id:f.id}));
 await assert.rejects(articleCall('offline-other-owner','read_article_delivery_executor',{article_id:f.id,expected_version:value.host_transfer.version}));
 assert.equal(h.externalCalls,0);
 console.log(`PASS ${checks} read-only handoff/article groups: dual-platform native step-session primary route, single installation, external model review and read-only validate followed by one physical commit without a preceding await, parent-only business core/gate/full baseline, unchanged explicit legacy defaults, per-platform candidates including completed-main/pending-Zhihu, exact source metadata, owner/credential/history isolation; platform/CUA/network calls=0.`);
}finally{h.close();}
