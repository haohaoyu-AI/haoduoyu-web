import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createArticleUploadBridge} from '../scripts/browser-upload/bridge.mjs';
import {createArticleUploadHost,createUploadToolCall,unwrapUploadToolResponse,summarizeUploadToolError} from '../scripts/browser-upload/tool-host.mjs';
import {uploadPublicErrors} from '../scripts/browser-upload/public-errors.mjs';
const serverErrors=JSON.parse('['+fs.readFileSync('lib/article-upload-errors.ts','utf8').match(/uploadGuardMessages=\[([\s\S]*)\];/)[1]+']');
assert.deepEqual(uploadPublicErrors,serverErrors);
const secret=crypto.randomUUID(),permit=crypto.randomUUID(),old=crypto.randomUUID(),article_id=crypto.randomUUID(),platform='toutiao',hash='a'.repeat(64);
const approval={previous_attempt_id:crypto.randomUUID(),expected_attempt_revision:0,expected_recovery_fingerprint:'b'.repeat(64),target_account:'61556093362',word_sha256:hash,word_size:100,current_task_id:'actual-task',authorization_key:'actual-recovery-request',confirmation_message_id:'actual-owner-recovery-approval',prior_executor_end_reference:'actual-old-runtime-cancelled-and-settled',confirm_unconsumed_recovery:true,prior_executor_stopped:true,preserve_existing_draft:true,confirm_new_draft:true};
const request={status:'bridge_required',operation:'reserve_article_upload',args:{article_id,platform,mode:'continue_unconsumed',...approval}};
const response={reserved:true,execute_import:false,old_permit_fenced:true,unconsumed_continuation_permission_ready:true,execution_claim:secret,consume_token:permit,attempt:{article_id,platform,target_account:approval.target_account,word_sha256:hash,word_size:100,attempt_id:crypto.randomUUID(),previous_attempt_id:approval.previous_attempt_id,authorization_kind:'unconsumed_continuation',state:'reserved'}};
let calls=0,consumes=0,receipts=[];
const official=createUploadToolCall({reserve_article_upload:async a=>{calls++;assert.equal(a.execution_claim,old);return {structuredContent:response,content:[{type:'text',text:'Action completed.'}]};},consume_article_upload:async a=>{consumes++;assert.equal(a.consume_token,permit);assert.equal(a.execution_claim,secret);return {content:[{type:'text',text:JSON.stringify({execute_import:true,attempt:{...response.attempt,state:'outcome_unknown'}})}]};}});
const bridge=createArticleUploadBridge({approvedScope:{article_id,platforms:[platform],unconsumed_recovery:{[platform]:approval}},currentClaim:async()=>old,priorExecutionStopped:s=>s.attempt_id===approval.previous_attempt_id&&s.recovery_fingerprint===approval.expected_recovery_fingerprint,call:official});
const host=createArticleUploadHost({bridge,emit:r=>receipts.push(r)}),id=crypto.randomUUID();
const results=await Promise.all([host.execute(id,request),host.execute(id,request)]);assert.equal(calls,1);assert.deepEqual(results[0],results[1]);assert.equal(receipts.length,1);assert.equal(results[0].source,'actual_authenticated_bridge_response');
const clean=JSON.stringify(results);for(const token of [secret,permit,old])assert.equal(clean.includes(token),false);
const delivery=await host.deliver(id,async()=>{throw Error('Synthetic approval denial: '+secret);});assert.equal(delivery.status,'receipt_delivery_unknown');assert.equal(delivery.automatic_retry_allowed,false);assert.deepEqual(host.read(id),results[0]);assert.equal(JSON.stringify(delivery).includes(secret),false);await assert.rejects(host.deliver(id,()=>assert.fail()),/already completed/);
// A failed cross-tool delivery did not erase the bridge closure. Only after the
// normal receiving side's state is reconciled may that same cell continue; no retry.
const c={status:'bridge_required',operation:'consume_article_upload',args:{article_id,platform,attempt_id:response.attempt.attempt_id,target_account:approval.target_account,reimport_editor_confirmation:{}}};assert.equal((await bridge(c)).execute_import,true);await assert.rejects(bridge(c),/permission unavailable/);assert.equal(consumes,1);
await assert.rejects(host.execute(id,{...request,args:{...request.args,word_size:101}}),/bound/);
for(const probe of [undefined,()=>false,()=>Promise.resolve(true),()=>{throw Error(secret);}]){const closed=createArticleUploadBridge({approvedScope:{article_id,platforms:[platform],unconsumed_recovery:{[platform]:approval}},currentClaim:async()=>old,priorExecutionStopped:probe,call:()=>assert.fail('not stopped')});await assert.rejects(closed(request),/must be stopped/);}
const badApproval=createArticleUploadBridge({approvedScope:{article_id,platforms:[platform],unconsumed_recovery:{[platform]:{...approval,previous_attempt_id:crypto.randomUUID()}}},currentClaim:async()=>old,priorExecutionStopped:()=>true,call:()=>assert.fail('wrong owner scope')});await assert.rejects(badApproval(request),/authorization missing/);
const ownerOnly=createArticleUploadBridge({approvedScope:{article_id,platforms:[platform],unconsumed_recovery:{[platform]:approval}},currentClaim:()=>assert.fail('owner recovery must not need a lost bearer'),priorExecutionStopped:()=>true,call:async(op,args)=>{assert.equal(op,'recover_article_unconsumed_upload');assert.equal(args.execution_claim,undefined);assert.equal(args.mode,undefined);return response;}});
const ownerRequest={status:'bridge_required',operation:'recover_article_unconsumed_upload',args:{article_id,platform,...approval}};assert.equal((await ownerOnly(ownerRequest)).unconsumed_continuation_permission_ready,true);
assert.deepEqual(unwrapUploadToolResponse({content:[{type:'text',text:'{"state":"reserved"}'}]}),{state:'reserved'});
assert.throws(()=>unwrapUploadToolResponse({isError:true,content:[{type:'text',text:'Fresh browser evidence required'}]}),/Fresh browser evidence required/);
assert.throws(()=>unwrapUploadToolResponse({isError:true,structuredContent:{code:'INVALID_ARGUMENT',message:'Word checksum failed'}}),e=>e.code==='INVALID_ARGUMENT'&&e.message==='Word checksum failed');
for(const raw of [Error('SQL secret='+secret),{code:secret,message:secret},{text:secret}])assert.equal(JSON.stringify(summarizeUploadToolError(raw)).includes(secret),false);
const failures=[];const failing=createArticleUploadHost({bridge:createArticleUploadBridge({approvedScope:{article_id,platforms:[platform]},currentClaim:async()=>old,summarizeToolError:summarizeUploadToolError,call:createUploadToolCall({consume_article_upload:async()=>{throw Object.assign(Error('Fresh browser evidence required'),{code:'INVALID_ARGUMENT'});}})}),emit:r=>failures.push(r)});
const fail=await failing.execute(crypto.randomUUID(),{status:'bridge_required',operation:'consume_article_upload',args:{article_id,platform,attempt_id:crypto.randomUUID(),target_account:approval.target_account}});assert.equal(fail.error.summary,'Fresh browser evidence required');assert.equal(fail.error.code,'INVALID_ARGUMENT');assert.equal(fail.source,'actual_bridge_error');assert.equal(failures.length,1);
const unsafeEmitted=[];const unsafe=createArticleUploadHost({bridge:async()=>({consume_token:permit}),emit:r=>unsafeEmitted.push(r)});const unsafeReceipt=await unsafe.execute(crypto.randomUUID(),request);assert.equal(unsafeReceipt.outcome,'error');assert.equal(unsafeEmitted.length,1);assert.equal(JSON.stringify(unsafeReceipt).includes(permit),false);
const emission=createArticleUploadHost({bridge:async()=>({reserved:false}),emit:()=>{throw Error(secret);}}),emissionId=crypto.randomUUID(),retained=await emission.execute(emissionId,request);assert.deepEqual(emission.read(emissionId),retained);assert.equal(JSON.stringify(retained).includes(secret),false);
// A new host cannot read an old receipt or recover any token.
assert.equal(createArticleUploadHost({bridge}).read(id),null);
// Public receipt copies may be edited by callers, but never become authority.
const isolated=createArticleUploadHost({bridge:async()=>({execute_import:false,attempt:{state:'reserved'}})}),isolatedId=crypto.randomUUID();
const [left,right]=await Promise.all([isolated.execute(isolatedId,request),isolated.execute(isolatedId,request)]);
assert.notEqual(left,right);left.result.execute_import=true;left.result.attempt.state='outcome_unknown';left.source='caller-changed';
assert.equal(right.result.execute_import,false);assert.equal(isolated.read(isolatedId).result.execute_import,false);
assert.equal((await isolated.execute(isolatedId,request)).result.execute_import,false);
await isolated.deliver(isolatedId,(result,receipt)=>{assert.equal(result.execute_import,false);assert.equal(result.attempt.state,'reserved');assert.equal(receipt.source,'actual_authenticated_bridge_response');result.execute_import=true;receipt.result.execute_import=true;});
assert.equal(isolated.read(isolatedId).result.execute_import,false);
// The request hash, executed request and receipt identity share one snapshot,
// even if the caller or bridge edits its own copy while execution is pending.
const mutable=structuredClone(request),original=structuredClone(mutable),changedArticle=crypto.randomUUID();let observed;
const snapshots=createArticleUploadHost({bridge:async value=>{observed=structuredClone(value);value.operation='bridge-changed';value.args.article_id=changedArticle;return {execute_import:false};}}),snapshotId=crypto.randomUUID();
const pending=snapshots.execute(snapshotId,mutable);mutable.args.article_id=changedArticle;mutable.operation='caller-changed';
const snapshot=await pending;assert.deepEqual(observed,original);assert.equal(snapshot.article_id,original.args.article_id);assert.equal(snapshot.operation,original.operation);
assert.deepEqual(await snapshots.execute(snapshotId,original),snapshot);await assert.rejects(snapshots.execute(snapshotId,mutable),/bound/);
// Rejected identity metadata is untrusted, including UUID-shaped secrets.
const rejectedMetadata=[],rejecting=createArticleUploadHost({bridge,emit:r=>rejectedMetadata.push(r)});
for(const bad of [{...request,operation:secret},{...request,args:{...request.args,article_id:secret}},{...request,args:{...request.args,platform:secret}}]){
 const receipt=await rejecting.execute(crypto.randomUUID(),bad);assert.equal(receipt.outcome,'error');assert.equal(JSON.stringify(receipt).includes(secret),false);assert.equal(receipt.article_id,undefined);assert.equal(receipt.operation,undefined);assert.equal(receipt.platform,undefined);
}
assert.equal(JSON.stringify(rejectedMetadata).includes(secret),false);
// Caller-owned approval objects cannot drift after the bridge is created.
for(const replaceEntry of [false,true]){
 const frozenApproval=structuredClone(approval),mutableScope={article_id,platforms:[platform],unconsumed_recovery:{[platform]:structuredClone(frozenApproval)}};let recoveryCalls=0;
 const scoped=createArticleUploadBridge({approvedScope:mutableScope,currentClaim:()=>assert.fail('owner recovery needs no old bearer'),priorExecutionStopped:()=>true,call:async()=>{recoveryCalls++;return {reserved:false,execute_import:false};}});
 const changed={...frozenApproval,previous_attempt_id:crypto.randomUUID(),authorization_key:'changed-recovery',confirmation_message_id:'changed-owner'};
 if(replaceEntry)mutableScope.unconsumed_recovery[platform]=changed;else Object.assign(mutableScope.unconsumed_recovery[platform],changed);
 await assert.rejects(scoped({status:'bridge_required',operation:'recover_article_unconsumed_upload',args:{article_id,platform,...changed}}),/authorization missing/);assert.equal(recoveryCalls,0);
 assert.equal((await scoped({status:'bridge_required',operation:'recover_article_unconsumed_upload',args:{article_id,platform,...frozenApproval}})).execute_import,false);assert.equal(recoveryCalls,1);
}
console.log('PASS official-envelope unpacking, safe fixed error parity, actual response provenance, emission/delivery failure retention, pending/idempotent handoff, exact approval/stopped scope and volatile permit one-use; mock tools only, external calls=0.');
