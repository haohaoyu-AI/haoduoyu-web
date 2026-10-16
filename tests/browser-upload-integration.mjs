// Run the exact existing real SQLite/MCP harness plus a GUI-runtime integration.
// Generated module is local and always removed; no platform/network/model calls.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const temporary = new URL(`./.browser-upload-integration-${process.pid}.mjs`, import.meta.url);
const harness = fs.readFileSync(new URL('./upload-attempt-guards.mjs', import.meta.url), 'utf8');
const appended = String.raw`
const {createDraftUploadRuntime} = await import('../scripts/browser-upload/cua-draft-runner.mjs');
const {createArticleUploadBridge} = await import('../scripts/browser-upload/bridge.mjs');
let guiFixture = await fixture('real-ledger-GUI-integration');
const guiPlatform = 'toutiao';
const guiAccount = guards.authorizedUploadAccounts.toutiao;
const guiUrl = 'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=999999999';
let guiBaseline = {title: guiFixture.title, paragraphs: guiFixture.paragraphs, images: imagePlan.map(r => ({sha256:r.sha256,after_paragraph:r.after_paragraph}))};
let guiSubmissions = 0, guiTabId = 0;
const guiRows = () => guiFixture.paragraphs.flatMap((p,i) => [...imagePlan.filter(r=>r.after_paragraph===i).map(r=>({kind:'image',sha:r.sha256,src:'https://img.example.test/'+r.sha256+'.png'})),{kind:'paragraph',text:p}]).concat(imagePlan.filter(r=>r.after_paragraph===guiFixture.paragraphs.length).map(r=>({kind:'image',sha:r.sha256,src:'https://img.example.test/'+r.sha256+'.png'})));
function guiDom(r) {
 if(r.kind==='image')return {nodeType:1,tagName:'IMG',currentSrc:r.src,complete:true,naturalWidth:100,naturalHeight:80,matches:q=>q==='img'};
 return {nodeType:1,tagName:'P',parentElement:{tagName:'DIV'},childNodes:[{nodeType:3,textContent:r.text}],children:[],matches:q=>q.split(',').includes('p')};
}
function guiTab(content={}) {
 const t={id:'gui-'+(++guiTabId), state:{title:'',rows:[],url:'https://mp.toutiao.com/profile_v4/graphic/publish',saved:false,...content}};
 t.url=async()=>t.state.url;t.goto=async u=>{t.state.url=u;};
 t.playwright={domSnapshot:async()=> 'synthetic private editor',locator:key=>({count:async()=>1,isVisible:async()=>key!=='saved'||t.state.saved,isEnabled:async()=>true,innerText:async()=>key==='account'?guiAccount:key==='saved'?'草稿已保存':'',getAttribute:async()=>null,click:async()=>{},evaluate:async(fn,arg)=> key==='title'?fn({value:t.state.title}):key==='body'?fn({nodeType:1,tagName:'DIV',matches:()=>false,children:t.state.rows.map(guiDom),childNodes:t.state.rows.map(guiDom),querySelectorAll:()=>[]},arg):key==='list'?fn({querySelectorAll:()=>[]}):fn({tagName:'INPUT',getAttribute:name=>name==='type'?'file':null})}),waitForEvent:async()=>({setFiles:async()=>{guiSubmissions++;t.state={title:guiFixture.title,rows:guiRows(),url:guiUrl,saved:true};}})};
 return t;
}
const guiEditor=guiTab(),guiList=guiTab();
const guiRuntime=createDraftUploadRuntime({now:instant,browser:{tabs:{new:async()=>guiTab(structuredClone(guiEditor.state))}}});
const guiBinding=css=>({css,identity:{tag:'INPUT',type:'file'},observed_url:'https://example.test/mock',observed_at:instant()});
const guiSession=guiRuntime.createSession({article_id:guiFixture.id,platform:guiPlatform,target_account:guiAccount,word_sha256:guiFixture.hash,word_size:guiFixture.bytes.length,browser_session:'synthetic-GUI',baseline:guiBaseline,ui:{account:guiBinding('account'),title:guiBinding('title'),body:{...guiBinding('body'),image_css:'img'},draftList:guiBinding('list'),importFile:guiBinding('file'),saved:{...guiBinding('saved'),allowed_texts:['草稿已保存']}},owned_new_draft:true});
const guiBridge=createArticleUploadBridge({approvedScope:{article_id:guiFixture.id,platforms:['toutiao']},currentClaim:async()=>guiFixture.claim,call:(op,args)=>tools.articleCall(guiFixture.owner,op,args)});
let guiRequest=await guiRuntime.preflight(guiSession,{editorTab:guiEditor,listTab:guiList,fileEvidence:{filename:'synthetic.docx',absolute_path:'/synthetic/synthetic.docx',browser_session:'synthetic-GUI',visible_in_browser:true,sha256:guiFixture.hash,size:guiFixture.bytes.length,checked_at:instant(),native_chooser_cancelled:true,native_open_used:false},history:{prior_submission:'never_attempted',evidence_reference:'synthetic zero submission history'}});
assert.equal(guiRequest.operation,'reserve_article_upload');
guiRequest=await guiRuntime.acceptReserve(guiSession,await guiBridge(guiRequest));
assert.equal(guiRequest.operation,'consume_article_upload');
guiRequest=await guiRuntime.acceptConsume(guiSession,await guiBridge(guiRequest));
assert.equal(guiRequest.operation,'record_article_status');
guiRequest=await guiRuntime.submitAfterSaving(guiSession,await guiBridge(guiRequest));
assert.equal(guiSubmissions,1);assert.equal(guiRequest.operation,'record_article_upload');
await guiRuntime.acceptObserved(guiSession,await guiBridge(guiRequest));
guiRequest=await guiRuntime.verify(guiSession,{inspectedBindings:imagePlan.map(r=>({observed_url:'https://img.example.test/'+r.sha256+'.png',reference_sha256:r.sha256,checked_at:instant(),inspected:true,reference_width:100,reference_height:80}))});
assert.equal(guiRequest.operation,'record_article_upload');
guiRequest=await guiRuntime.acceptVerified(guiSession,await guiBridge(guiRequest));
assert.equal(guiRequest.operation,'record_article_status');
const guiDone=await guiRuntime.acceptCompleted(guiSession,await guiBridge(guiRequest));
assert.equal(guiDone.status,'done');assert.equal(guiSubmissions,1);
assert.equal(sql.prepare('SELECT state FROM articles WHERE id=?').get(guiFixture.id).state,'completed');
assert.equal(sql.prepare('SELECT state FROM article_upload_attempts WHERE article_id=? AND platform=?').get(guiFixture.id,guiPlatform).state,'verified');
assert.equal(networkCalls,0);
console.log('PASS actual Cua runtime + bridge + existing articleCall + real SQLite Word/ledger state: one mock setFiles, verified receipt, completed; network/platform/provider=0.');

// Real ledger linked child: end the consumed source, rotate only inside the bridge,
// then execute one mock setFiles and record the actual child's different draft.
guiFixture=await fixture('real-linked-GUI-integration');
guiBaseline={title:guiFixture.title,paragraphs:guiFixture.paragraphs,images:imagePlan.map(r=>({sha256:r.sha256,after_paragraph:r.after_paragraph}))};
const sourceReservation=await reserve(guiFixture),sourceConsumed=await consume(guiFixture,sourceReservation);
const linkedAuthorization={authorization_scope:'duplicate_tolerant_task',current_task_id:'synthetic-manual-task',confirmation_message_id:'synthetic-owner-standing-approval',current_word_sha256:guiFixture.hash,word_size:guiFixture.bytes.length,confirm_reimport:true,confirm_duplicate_tolerant_task:true};
const linkedBridge=createArticleUploadBridge({approvedScope:{article_id:guiFixture.id,platforms:['toutiao'],reimport:{toutiao:linkedAuthorization}},currentClaim:async()=>guiFixture.claim,call:(op,args)=>tools.articleCall(guiFixture.owner,op,args)});
await linkedBridge({status:'bridge_required',operation:'record_article_upload_executor_end',args:{article_id:guiFixture.id,platform:'toutiao',attempt_id:sourceConsumed.attempt.attempt_id,target_account:guiAccount,word_sha256:guiFixture.hash,word_size:guiFixture.bytes.length,expected_attempt_revision:sourceConsumed.attempt.revision,prior_draft_identity:'unknown_without_editor_url',prior_executor_stopped:true,prior_executor_end_reference:'synthetic-executor-ended'}});
const linkedEditor=guiTab(),linkedList=guiTab(),linkedRuntime=createDraftUploadRuntime({now:instant,browser:{tabs:{new:async()=>guiTab(structuredClone(linkedEditor.state))}}});
const linkedSession=linkedRuntime.createSession({article_id:guiFixture.id,platform:'toutiao',target_account:guiAccount,word_sha256:guiFixture.hash,word_size:guiFixture.bytes.length,browser_session:'synthetic-GUI',baseline:guiBaseline,ui:guiSession.ui,owned_new_draft:true,import_mode:'owner_confirmed_reimport',reimport:{...linkedAuthorization,previous_attempt_id:sourceConsumed.attempt.attempt_id,prior_draft_identity:'unknown_without_editor_url',prior_executor_stopped:true,prior_executor_end_reference:'synthetic-executor-ended',authorization_key:'synthetic-distinct-action',confirm_new_draft:true,preserve_existing_draft:true}});
let linkedRequest=await linkedRuntime.preflight(linkedSession,{editorTab:linkedEditor,listTab:linkedList,fileEvidence:{filename:'synthetic.docx',absolute_path:'/synthetic/synthetic.docx',browser_session:'synthetic-GUI',visible_in_browser:true,sha256:guiFixture.hash,size:guiFixture.bytes.length,checked_at:instant()}});
assert.equal(linkedRequest.args.mode,'owner_confirmed_reimport');
const linkedReserved=await linkedBridge(linkedRequest);assert.equal(linkedReserved.reimport_permission_ready,true);assert.equal('execution_claim' in linkedReserved,false);assert.equal('consume_token' in linkedReserved,false);
linkedRequest=await linkedRuntime.acceptReserve(linkedSession,linkedReserved);
linkedRequest=await linkedRuntime.acceptConsume(linkedSession,await linkedBridge(linkedRequest));
linkedRequest=await linkedRuntime.submitAfterSaving(linkedSession,await linkedBridge(linkedRequest));
assert.equal(guiSubmissions,2);assert.equal(linkedRequest.operation,'record_article_upload');
assert.equal((await linkedRuntime.acceptObserved(linkedSession,await linkedBridge(linkedRequest))).status,'inspect');
assert.equal(sql.prepare('SELECT state FROM article_upload_attempts WHERE id=?').get(sourceConsumed.attempt.attempt_id).state,'outcome_unknown');
assert.equal(sql.prepare('SELECT previous_attempt_id FROM article_upload_attempts WHERE id=?').get(linkedSession.attempt_id).previous_attempt_id,sourceConsumed.attempt.attempt_id);
assert.equal(sql.prepare('SELECT state FROM article_upload_attempts WHERE id=?').get(linkedSession.attempt_id).state,'draft_observed');
assert.equal(networkCalls,0);
console.log('PASS real SQLite linked child + runner + volatile bridge: ended source retained, new claim/token consumed once, child draft recorded; external calls=0.');

// A truly untracked legacy intake gets a separately authorized root; no fake
// historical consumed attempt or executor-end row is manufactured to bridge it.
guiFixture=await fixture('real-untracked-legacy-GUI-integration');
sql.prepare('UPDATE articles SET upload_guard_version=0,artifact_manifest=NULL WHERE id=?').run(guiFixture.id);
guiBaseline={title:guiFixture.title,paragraphs:guiFixture.paragraphs,images:imagePlan.map(r=>({sha256:r.sha256,after_paragraph:r.after_paragraph}))};
const legacyBefore=sql.prepare('SELECT * FROM articles WHERE id=?').get(guiFixture.id);
const legacyAuthorization={expected_attempt_id:null,confirm_unrecorded_history:true,prior_draft_identity:'unknown_without_editor_url',current_task_id:'synthetic-untracked-manual-task',authorization_key:'synthetic-untracked-action',confirmation_message_id:'synthetic-untracked-owner-approval',prior_executor_end_reference:'synthetic-untracked-executor-ended',prior_executor_stopped:true,confirm_reimport:true,confirm_new_draft:true,preserve_existing_draft:true,current_word_sha256:guiFixture.hash,word_size:guiFixture.bytes.length};
const legacyFile={filename:'synthetic.docx',absolute_path:'/synthetic/action/synthetic.docx',browser_session:'synthetic-GUI',visible_in_browser:false,visibility_unproven:true,sha256:guiFixture.hash,size:guiFixture.bytes.length,checked_at:instant(),handoff:{kind:'same_browser_download',download_path:'/synthetic/download/actual-event',download_browser_session:'synthetic-GUI',executor_id:'synthetic-GUI-executor',source_sha256:guiFixture.hash,source_size:guiFixture.bytes.length,verified_in_cua:true,copied_in_same_executor:true}};
const legacyBridge=createArticleUploadBridge({approvedScope:{article_id:guiFixture.id,platforms:['toutiao'],reimport:{toutiao:legacyAuthorization},file_handoff:{toutiao:legacyFile}},currentClaim:async()=>guiFixture.claim,call:(op,args)=>tools.articleCall(guiFixture.owner,op,args)});
const legacyEditor=guiTab(),legacyList=guiTab(),legacyRuntime=createDraftUploadRuntime({now:instant,browser:{tabs:{new:async()=>guiTab(structuredClone(legacyEditor.state))}}});
const legacySession=legacyRuntime.createSession({article_id:guiFixture.id,platform:'toutiao',target_account:guiAccount,word_sha256:guiFixture.hash,word_size:guiFixture.bytes.length,browser_session:'synthetic-GUI',executor_id:'synthetic-GUI-executor',baseline:guiBaseline,ui:guiSession.ui,owned_new_draft:true,import_mode:'owner_confirmed_legacy_reimport',reimport:legacyAuthorization});
let legacyRequest=await legacyRuntime.preflight(legacySession,{editorTab:legacyEditor,listTab:legacyList,fileEvidence:legacyFile});
assert.equal(legacyRequest.args.preflight.file.visible_in_browser,false);assert.equal(legacyRequest.args.preflight.file.visibility_unproven,true);assert.equal(legacyRequest.args.preflight.file.handoff.chooser_prepared,true);assert.equal(guiSubmissions,2);
assert.equal(legacyRequest.args.preflight.existing_drafts.prior_submission,'submitted_unknown');assert.equal(legacyRequest.args.expected_attempt_id,null);assert.equal('previous_attempt_id' in legacyRequest.args,false);
const legacyReserved=await legacyBridge(legacyRequest);assert.equal(legacyReserved.legacy_reimport_permission_ready,true);assert.equal(legacyReserved.attempt.previous_attempt_id,null);assert.equal('execution_claim' in legacyReserved,false);assert.equal('consume_token' in legacyReserved,false);
const legacyRoot=sql.prepare('SELECT * FROM article_upload_attempts WHERE article_id=?').get(guiFixture.id),legacyAfter=sql.prepare('SELECT * FROM articles WHERE id=?').get(guiFixture.id);
assert.equal(legacyRoot.authorization_kind,'owner_confirmed_legacy_reimport');assert.equal(legacyRoot.consumed_at,null);assert.equal(JSON.parse(legacyRoot.reimport_authorization).prior_history,'untracked_unknown');assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM article_upload_executor_ends WHERE article_id=?').get(guiFixture.id).n,0);
assert.equal(JSON.parse(legacyRoot.preflight).file.visible_in_browser,false);assert.equal(JSON.parse(legacyRoot.preflight).file.handoff.download_path,legacyFile.handoff.download_path);
for(const field of ['source_key','result_key','result_meta','paragraphs','artifact_manifest','draft_url','draft_readback','upload_guard_version'])assert.equal(legacyAfter[field],legacyBefore[field]);
legacyRequest=await legacyRuntime.acceptReserve(legacySession,legacyReserved);
const consumeLegacyRequest=structuredClone(legacyRequest);assert.equal(legacyRequest.args.reimport_editor_confirmation.editor_empty,true);
legacyRequest=await legacyRuntime.acceptConsume(legacySession,await legacyBridge(legacyRequest));await assert.rejects(legacyBridge(consumeLegacyRequest),/permission unavailable/);
legacyRequest=await legacyRuntime.submitAfterSaving(legacySession,await legacyBridge(legacyRequest));assert.equal(guiSubmissions,3);assert.equal(legacyRequest.operation,'record_article_upload');await legacyRuntime.acceptObserved(legacySession,await legacyBridge(legacyRequest));
legacyRequest=await legacyRuntime.verify(legacySession,{inspectedBindings:imagePlan.map(r=>({observed_url:'https://img.example.test/'+r.sha256+'.png',reference_sha256:r.sha256,checked_at:instant(),inspected:true,reference_width:100,reference_height:80}))});
legacyRequest=await legacyRuntime.acceptVerified(legacySession,await legacyBridge(legacyRequest));assert.equal((await legacyRuntime.acceptCompleted(legacySession,await legacyBridge(legacyRequest))).status,'done');
assert.equal(guiSubmissions,3);assert.equal(sql.prepare('SELECT state FROM articles WHERE id=?').get(guiFixture.id).state,'completed');assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM article_upload_attempts WHERE article_id=?').get(guiFixture.id).n,1);assert.equal(networkCalls,0);
console.log('PASS real SQLite untracked legacy root + same-browser-download handoff + runner + volatile bridge: visibility/history stay unproven, chooser before grant, one consumed permission, independently verified draft completed; external calls=0.');

// Simulate the exact missing receipt: the tool succeeds, receiving approval rejects,
// then the old runtime is cancelled/settled. No original consumed end is fabricated.
const {createArticleUploadHost,createUploadToolCall} = await import('../scripts/browser-upload/tool-host.mjs');
guiFixture=await fixture('real-unconsumed-GUI-integration');
guiBaseline={title:guiFixture.title,paragraphs:guiFixture.paragraphs,images:imagePlan.map(r=>({sha256:r.sha256,after_paragraph:r.after_paragraph}))};
const originalApproval={...legacyAuthorization,current_task_id:'synthetic-unconsumed-task',authorization_key:'synthetic-unconsumed-root',confirmation_message_id:'synthetic-unconsumed-original-approval',current_word_sha256:guiFixture.hash,word_size:guiFixture.bytes.length};
const originalFile={...legacyFile,sha256:guiFixture.hash,size:guiFixture.bytes.length,handoff:{...legacyFile.handoff,source_sha256:guiFixture.hash,source_size:guiFixture.bytes.length}};
const originalEditor=guiTab(),originalList=guiTab(),originalRuntime=createDraftUploadRuntime({now:instant,browser:{tabs:{new:async()=>guiTab(structuredClone(originalEditor.state))}}});
const originalSession=originalRuntime.createSession({article_id:guiFixture.id,platform:'toutiao',target_account:guiAccount,word_sha256:guiFixture.hash,word_size:guiFixture.bytes.length,browser_session:'synthetic-GUI',executor_id:'synthetic-GUI-executor',baseline:guiBaseline,ui:guiSession.ui,owned_new_draft:true,import_mode:'owner_confirmed_legacy_reimport',reimport:originalApproval});
const originalBridge=createArticleUploadBridge({approvedScope:{article_id:guiFixture.id,platforms:['toutiao'],reimport:{toutiao:originalApproval},file_handoff:{toutiao:originalFile}},currentClaim:async()=>guiFixture.claim,call:(op,args)=>tools.articleCall(guiFixture.owner,op,args)});
const originalRequest=await originalRuntime.preflight(originalSession,{editorTab:originalEditor,listTab:originalList,fileEvidence:originalFile});
const emitted=[];const originalHost=createArticleUploadHost({bridge:originalBridge,emit:r=>emitted.push(r)}),originalOperation=crypto.randomUUID();
const actualReceipt=await originalHost.execute(originalOperation,originalRequest);
assert.equal(actualReceipt.result.reserved,true);assert.equal(actualReceipt.source,'actual_authenticated_bridge_response');
const rejectedDelivery=await originalHost.deliver(originalOperation,async()=>{throw Error('Synthetic official receiving approval rejected');});
assert.equal(rejectedDelivery.status,'receipt_delivery_unknown');assert.equal(emitted.length,1);assert.equal(guiSubmissions,3);
const unconsumedParent=sql.prepare('SELECT * FROM article_upload_attempts WHERE article_id=?').get(guiFixture.id);assert.equal(unconsumedParent.consumed_at,null);
originalRuntime.cancel(originalSession);assert.equal(originalSession.cancelled,true);assert.equal(originalSession.chooser,null);assert.equal(originalSession.grant,false); // fixture has no pending browser/write calls

const recoveryPreview=await tools.articleCall(guiFixture.owner,'preview_article_unconsumed_upload_recovery',{article_id:guiFixture.id,platform:'toutiao'});
const continuationApproval={previous_attempt_id:unconsumedParent.id,expected_attempt_revision:unconsumedParent.revision,expected_recovery_fingerprint:recoveryPreview.recovery_fingerprint,target_account:guiAccount,word_sha256:guiFixture.hash,word_size:guiFixture.bytes.length,current_task_id:originalApproval.current_task_id,authorization_key:'synthetic-explicit-continuation',confirmation_message_id:'synthetic-owner-explicit-recovery-approval',prior_executor_end_reference:'actual-synthetic-original-runtime-cancelled-settled',prior_executor_stopped:true,confirm_unconsumed_recovery:true,confirm_new_draft:true,preserve_existing_draft:true,prior_submission:recoveryPreview.attempt.submission_state,retained_editor_urls:recoveryPreview.retained_editor_urls};
const continuationEditor=guiTab(),continuationList=guiTab(),continuationRuntime=createDraftUploadRuntime({now:instant,browser:{tabs:{new:async()=>guiTab(structuredClone(continuationEditor.state))}}});
const continuationSession=continuationRuntime.createSession({article_id:guiFixture.id,platform:'toutiao',target_account:guiAccount,word_sha256:guiFixture.hash,word_size:guiFixture.bytes.length,browser_session:'synthetic-GUI',executor_id:'synthetic-GUI-executor',baseline:guiBaseline,ui:guiSession.ui,owned_new_draft:true,import_mode:'continue_unconsumed',reimport:continuationApproval});
const officialCall=createUploadToolCall(Object.fromEntries(['reserve_article_upload','recover_article_unconsumed_upload','consume_article_upload','record_article_status','record_article_upload'].map(op=>[op,async args=>({content:[{type:'text',text:JSON.stringify(await tools.articleCall(guiFixture.owner,op,args))}]})])));
const continuationBridge=createArticleUploadBridge({approvedScope:{article_id:guiFixture.id,platforms:['toutiao'],unconsumed_recovery:{toutiao:continuationApproval},file_handoff:{toutiao:originalFile}},currentClaim:async()=>assert.fail('lost claim must not be reconstructed'),priorExecutionStopped:scope=>scope.attempt_id===unconsumedParent.id&&scope.recovery_fingerprint===recoveryPreview.recovery_fingerprint&&originalSession.cancelled&&!originalSession.chooser&&!originalSession.grant,call:officialCall});
let continuationRequest=await continuationRuntime.preflight(continuationSession,{editorTab:continuationEditor,listTab:continuationList,fileEvidence:originalFile});
assert.equal(continuationRequest.operation,'recover_article_unconsumed_upload');assert.equal(continuationRequest.args.mode,undefined);assert.equal(guiSubmissions,3);
const continuationReceipt=await continuationBridge(continuationRequest);assert.equal(continuationReceipt.unconsumed_continuation_permission_ready,true);assert.equal(continuationReceipt.attempt.preflight.file.visible_in_browser,false);
continuationRequest=await continuationRuntime.acceptReserve(continuationSession,continuationReceipt);
continuationRequest=await continuationRuntime.acceptConsume(continuationSession,await continuationBridge(continuationRequest));
continuationRequest=await continuationRuntime.submitAfterSaving(continuationSession,await continuationBridge(continuationRequest));assert.equal(guiSubmissions,4);
await continuationRuntime.acceptObserved(continuationSession,await continuationBridge(continuationRequest));
continuationRequest=await continuationRuntime.verify(continuationSession,{inspectedBindings:imagePlan.map(r=>({observed_url:'https://img.example.test/'+r.sha256+'.png',reference_sha256:r.sha256,checked_at:instant(),inspected:true,reference_width:100,reference_height:80}))});
continuationRequest=await continuationRuntime.acceptVerified(continuationSession,await continuationBridge(continuationRequest));assert.equal((await continuationRuntime.acceptCompleted(continuationSession,await continuationBridge(continuationRequest))).status,'done');
assert.deepEqual(sql.prepare('SELECT * FROM article_upload_attempts WHERE id=?').get(unconsumedParent.id),unconsumedParent);assert.equal(sql.prepare('SELECT COUNT(*) n FROM article_upload_executor_ends WHERE article_id=?').get(guiFixture.id).n,0);assert.equal(networkCalls,0);
console.log('PASS exact reserved legacy root, real response provenance + rejected mock receipt handoff + actual mock runtime cancellation + explicitly approved continuation + false/unproven chooser + one mock setFiles + independently reopened full text/images: SQLite audit retained; external calls=0.');

`;
try {
  fs.writeFileSync(temporary, harness + '\n' + appended, {flag:'wx'});
  const result=spawnSync(process.execPath,[fileURLToPath(temporary)],{encoding:'utf8',cwd:fileURLToPath(new URL('..',import.meta.url))});
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exitCode=result.status??1;
} finally {fs.unlinkSync(temporary);}
