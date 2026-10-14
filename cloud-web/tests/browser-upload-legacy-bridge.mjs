import assert from 'node:assert/strict';
import {createArticleUploadBridge} from '../scripts/browser-upload/bridge.mjs';

const article_id='synthetic-legacy',platform='toutiao',target_account='61556093362',word_sha256='a'.repeat(64),word_size=123;
const authorization={expected_attempt_id:null,confirm_unrecorded_history:true,current_task_id:'legacy-manual-task',authorization_key:'legacy-action',confirmation_message_id:'owner-legacy-approval',prior_executor_end_reference:'actual-ended-executor',prior_executor_stopped:true,confirm_reimport:true,confirm_new_draft:true,preserve_existing_draft:true,prior_draft_identity:'unknown_without_editor_url',current_word_sha256:word_sha256,word_size};
const recoveryApproval={expected_lease_fingerprint:'b'.repeat(64),confirm_article_id:article_id,confirm_prior_executor_ended:true,confirm_read_only_recovery:true,confirm_existing_results_checked:true};
const scope={article_id,platforms:['toutiao','zhihu'],reimport:{toutiao:authorization,zhihu:authorization},claim_recovery:{toutiao:recoveryApproval}};
const request=(operation,args={})=>({status:'bridge_required',operation,args:{article_id,platform,...args}});
const reserve=extra=>request('reserve_article_upload',{mode:'owner_confirmed_legacy_reimport',target_account,word_sha256,...authorization,...extra});
const consume=extra=>request('consume_article_upload',{attempt_id:'legacy-root',target_account,reimport_editor_confirmation:{target_account,current_editor_url:'https://mp.toutiao.com/profile_v4/graphic/publish',editor_empty:true,private_draft:true},...extra});
const winner=()=>({reserved:true,legacy_reimport_permission_ready:true,execution_claim:'synthetic-new-execution-secret',consume_token:'synthetic-new-consume-secret',attempt:{attempt_id:'legacy-root',article_id,platform,target_account,word_sha256,word_size,previous_attempt_id:null,authorization_kind:'owner_confirmed_legacy_reimport',state:'reserved',consumed_at:null,editor_urls:[]}});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
let tests=0;
async function test(name,run){await run();tests++;console.log('PASS',name);}
await test('exact legacy authorization defaults to exact scope and keeps fresh credentials exclusively in the bridge',async()=>{
 const calls=[];let reservations=0;
 const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>'synthetic-old-execution-secret',call:async(operation,args)=>{calls.push({operation,args});if(operation==='reserve_article_upload')return ++reservations===1?winner():{reserved:false,cached:true,execute_import:false,attempt:{...winner().attempt,state:'outcome_unknown'}};return {execute_import:true};}});
 const clean=await bridge(reserve());assert.equal(clean.legacy_reimport_permission_ready,true);assert.equal(clean.attempt.previous_attempt_id,null);assert.equal('execution_claim' in clean,false);assert.equal('consume_token' in clean,false);assert.equal(JSON.stringify(clean).includes('secret'),false);
 assert.equal(calls[0].args.authorization_scope,'exact_reimport');assert.equal(calls[0].args.execution_claim,'synthetic-old-execution-secret');assert.equal(calls[0].args.expected_attempt_id,null);assert.equal('previous_attempt_id' in calls[0].args,false);
 assert.equal((await bridge(consume())).execute_import,true);assert.equal(calls[1].args.execution_claim,'synthetic-new-execution-secret');assert.equal(calls[1].args.consume_token,'synthetic-new-consume-secret');
 await assert.rejects(bridge(consume()),/permission unavailable/);assert.equal(calls.length,2);
 const replay=await bridge(reserve());assert.equal(replay.reserved,false);assert.equal('execution_claim' in replay,false);assert.equal('consume_token' in replay,false);await assert.rejects(bridge(consume()),/permission unavailable/);assert.equal(calls.length,3);
});
await test('unknown legacy authorization cannot be replaced by never-submitted, invented parent, different task or browser credentials',async()=>{
 for(const patch of [{expected_attempt_id:'invented-parent'},{confirm_unrecorded_history:false},{previous_attempt_id:null},{previous_attempt_id:'invented-parent'},{current_task_id:'different-task'},{authorization_key:'different-action'},{confirmation_message_id:'different-owner'},{prior_executor_end_reference:'different-end'},{prior_executor_stopped:false},{confirm_reimport:false},{word_sha256:'c'.repeat(64)},{word_size:124},{prior_draft_identity:'known_editor_url'},{existing_editor_url:'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=123'},{execution_claim:'browser-old-token'},{consume_token:'browser-old-token'}]){
  let calls=0;const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>'old',call:async()=>{calls++;return winner();}});await assert.rejects(bridge(reserve(patch)));assert.equal(calls,0);
 }
 let calls=0;const noApproval=createArticleUploadBridge({approvedScope:{article_id,platforms:[platform]},currentClaim:async()=>'old',call:async()=>{calls++;return winner();}});await assert.rejects(noApproval(reserve()));assert.equal(calls,0);
 await assert.rejects(noApproval(request('reserve_article_upload',{mode:'owner_confirmed_first_import',confirm_never_submitted:true})),/first-import confirmation missing/);assert.equal(calls,0);
});
await test('standing approval stays bound to the exact manual bootstrap and requires duplicate-tolerant confirmation',async()=>{
 const standing={...authorization,authorization_scope:'duplicate_tolerant_task',confirm_duplicate_tolerant_task:true};let calls=0;
 const bridge=createArticleUploadBridge({approvedScope:{...scope,reimport:{[platform]:standing}},currentClaim:async()=>'old',call:async()=>{calls++;return winner();}});
 await assert.rejects(bridge(reserve({...standing,confirm_duplicate_tolerant_task:false})));await assert.rejects(bridge(reserve({...standing,current_task_id:'other-task'})));assert.equal(calls,0);
 assert.equal((await bridge(reserve(standing))).legacy_reimport_permission_ready,true);assert.equal(calls,1);
});
await test('legacy winners require a matching fresh root and two new distinct credentials',async()=>{
 for(const patch of [{legacy_reimport_permission_ready:false},{execution_claim:'old-secret'},{consume_token:'old-secret'},{consume_token:'synthetic-new-execution-secret'},{attempt:{previous_attempt_id:'invented-parent'}},{attempt:{authorization_kind:'owner_confirmed_reimport'}},{attempt:{target_account:'other-account'}},{attempt:{word_size:124}},{attempt:{state:'outcome_unknown'}},{attempt:{platform:'zhihu'}}]){
  const response={...winner(),...patch,attempt:{...winner().attempt,...patch.attempt}};let calls=0;const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>'old-secret',call:async()=>{calls++;return response;}});await assert.rejects(bridge(reserve()),/Unsafe legacy reimport response/);await assert.rejects(bridge(consume()),/permission unavailable/);assert.equal(calls,1);
 }
});
await test('cached legacy reservation has no import permission and fresh editor evidence is mandatory before consume',async()=>{
 const cached=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>'old',call:async()=>({reserved:false,cached:true,attempt:winner().attempt})});const response=await cached(reserve());assert.equal(response.legacy_reimport_permission_ready,undefined);await assert.rejects(cached(consume()),/permission unavailable/);
 const calls=[];const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>'old',call:async(operation,args)=>{calls.push({operation,args});return operation==='reserve_article_upload'?winner():{execute_import:true};}});await bridge(reserve());await assert.rejects(bridge(consume({reimport_editor_confirmation:undefined})),/private editor confirmation required/);assert.equal(calls.length,1);assert.equal((await bridge(consume())).execute_import,true);assert.equal(calls.length,2);
});
await test('wrong-platform or recovered-old permission never reaches consume and ambiguity burns the token',async()=>{
 const calls=[];const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async p=>'old-'+p,call:async(operation,args)=>{calls.push({operation,args});if(operation==='reserve_article_upload')return winner();if(operation==='recover_article_claim')return {article_id,platform,old_claim_fenced:true,new_upload_allowed:false,claim_token:'synthetic-recovered-secret'};return {execute_import:true};}});
 await bridge(reserve());await assert.rejects(bridge(consume({platform:'zhihu',target_account:'ren-zhe-ai-chi-yu-52'})),/differs from platform/);assert.equal(calls.length,1);assert.equal((await bridge(consume())).execute_import,true);
 const fresh=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>'old',call:async(operation)=>operation==='reserve_article_upload'?winner():operation==='recover_article_claim'?{article_id,platform,old_claim_fenced:true,new_upload_allowed:false,claim_token:'synthetic-recovered-secret'}:{execute_import:true}});await fresh(reserve());await fresh(request('recover_article_claim',recoveryApproval));await assert.rejects(fresh(consume()),/permission unavailable/);
 let ambiguousCalls=0;const ambiguous=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>'old',call:async operation=>{ambiguousCalls++;if(operation==='reserve_article_upload')return winner();throw Error('synthetic transport error');}});await ambiguous(reserve());await assert.rejects(ambiguous(consume()),/retain state/);await assert.rejects(ambiguous(consume()),/permission unavailable/);assert.equal(ambiguousCalls,2);
});
await test('pending legacy reservation and consume remain single flight',async()=>{
 const gate=deferred(),entered=deferred();let calls=0;const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>'old',call:async operation=>{calls++;if(operation==='reserve_article_upload'){entered.resolve();return gate.promise;}return {execute_import:true};}});
 const pending=bridge(reserve());await entered.promise;await assert.rejects(bridge(reserve()),{status:'bridge_operation_pending'});await assert.rejects(bridge(consume()),{status:'bridge_operation_pending'});assert.equal(calls,1);gate.resolve(winner());await pending;assert.equal((await bridge(consume())).execute_import,true);assert.equal(calls,2);
});
console.log(JSON.stringify({tests,real_platform_calls:0,model_calls:0,production_db_writes:0}));
