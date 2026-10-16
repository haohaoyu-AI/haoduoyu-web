// Synthetic, offline tool host. No browser, platform, provider or production writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createArticleUploadBridge} from '../scripts/browser-upload/bridge.mjs';

const article_id='synthetic-finish',platform='toutiao';
const approval={expected_lease_fingerprint:'b'.repeat(64),confirm_article_id:article_id,confirm_prior_executor_ended:true,confirm_read_only_recovery:true,confirm_existing_results_checked:true};
const authorization={authorization_scope:'duplicate_tolerant_task',current_task_id:'synthetic-task',confirmation_message_id:'synthetic-approved',current_word_sha256:'a'.repeat(64),word_size:123,confirm_reimport:true,confirm_duplicate_tolerant_task:true};
const scope={article_id,platforms:['toutiao','zhihu'],claim_recovery:{toutiao:approval,zhihu:approval},reimport:{toutiao:authorization,zhihu:authorization}};
const request=(operation,extra={})=>({status:'bridge_required',operation,args:{article_id,platform,...extra}});
const finishRequest=()=>request('finish_article_upload_execution',{executor_stopped:true});
const released=p=>({article_id,platform:p,released:true,execute_import:false,new_upload_allowed:false,unconsumed_permits_fenced:true,history_preserved:true});
const linked=(p,id=p+'-child')=>({reserved:true,execution_claim:'synthetic-linked-'+p,consume_token:'synthetic-permit-'+p,attempt:{attempt_id:id,article_id,platform:p,previous_attempt_id:'previous',authorization_kind:'owner_confirmed_reimport',state:'reserved'}});
const reserve=p=>request('reserve_article_upload',{platform:p,mode:'owner_confirmed_reimport',previous_attempt_id:'previous',...authorization});
const consume=p=>request('consume_article_upload',{platform:p,attempt_id:p+'-child',reimport_editor_confirmation:{editor_empty:true}});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
let cases=0;
async function test(name,action){await action();cases++;console.log('PASS '+name);}

await test('stopped host finishes its own current lease once and never falls back after close',async()=>{
 const calls=[];let lookups=0;
 const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>{lookups++;return 'synthetic-initial';},executionStopped:()=>true,call:async(op,args)=>{calls.push({op,args});return op==='finish_article_upload_execution'?released(args.platform):{recorded:true};}});
 const input=finishRequest(),result=await bridge(input);
 assert.deepEqual(result,released(platform));assert.equal(calls[0].op,'finish_article_upload_execution');assert.equal(calls[0].args.execution_claim,'synthetic-initial');assert.equal(calls[0].args.executor_stopped,true);assert.equal('execution_claim' in input.args,false);assert.equal(JSON.stringify(result).includes('synthetic-initial'),false);
 for(const operation of ['finish_article_upload_execution','record_article_upload','record_article_status','record_article_upload_executor_end'])await assert.rejects(bridge(operation==='finish_article_upload_execution'?input:request(operation)),{status:'execution_closed'});
 assert.equal(calls.length,1);assert.equal(lookups,1);
 await bridge(request('read_article_upload'));await bridge(request('record_article_upload_diagnostic'));assert.equal(calls.length,3);assert.equal(lookups,1);
});
await test('a normal JSON tool host without structuredClone can safely finish',async()=>{
 const context=vm.createContext({});assert.equal(vm.runInContext('typeof structuredClone',context),'undefined');
 const source=fs.readFileSync(new URL('../scripts/browser-upload/bridge.mjs',import.meta.url),'utf8').replace(/^export\s+/m,'');
 const factory=vm.runInContext(source+'\ncreateArticleUploadBridge',context);let calls=0;
 const bridge=factory({approvedScope:scope,currentClaim:async()=>'synthetic-portable-secret',executionStopped:()=>true,call:async()=>{calls++;return released(platform);}});
 const result=await bridge(finishRequest());assert.equal(result.released,true);assert.equal(JSON.stringify(result).includes('synthetic-portable-secret'),false);
 await assert.rejects(bridge(request('record_article_upload')),{status:'execution_closed'});assert.equal(calls,1);
});
await test('browser assertion alone cannot finish before the host cancels and settles',async()=>{
 for(const executionStopped of [undefined,()=>false,()=>Promise.resolve(true),()=>{throw Error('synthetic-sensitive-host-error');}]){let calls=0,lookups=0;
  const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>{lookups++;return 'synthetic-current';},executionStopped,call:async()=>{calls++;return {};}});
  await assert.rejects(bridge(finishRequest()),error=>error.status==='execution_not_stopped'&&!error.message.includes('synthetic-sensitive'));assert.equal(calls,0);assert.equal(lookups,0);
 }
 let stopped=false,calls=0;const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>'synthetic-current',executionStopped:()=>stopped,call:async()=>{calls++;return released(platform);}});
 await assert.rejects(bridge(finishRequest()),{status:'execution_not_stopped'});stopped=true;assert.equal((await bridge(finishRequest())).released,true);assert.equal(calls,1);
});
await test('a mistaken asynchronous stop callback cannot leak an unhandled rejection',async()=>{
 let unhandled=0,lookups=0,calls=0;const listener=()=>{unhandled++;};process.on('unhandledRejection',listener);
 try {
  const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>{lookups++;return 'synthetic-current';},executionStopped:async()=>{throw Error('synthetic-sensitive-stop-error');},call:async()=>{calls++;return {};}});
  await assert.rejects(bridge(finishRequest()),error=>error.status==='execution_not_stopped'&&!error.message.includes('synthetic-sensitive'));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(unhandled,0);assert.equal(lookups,0);assert.equal(calls,0);
 }finally {process.off('unhandledRejection',listener);}
});
await test('scope, stopped flag and injected browser credentials are refused without tool calls',async()=>{
 let calls=0;const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>'synthetic-current',executionStopped:()=>true,call:async()=>{calls++;return {};}});
 for(const changed of [{article_id:'other'},{platform:'baijiahao'},{execution_claim:'browser-secret'},{claim_token:'browser-secret'},{consume_token:'browser-secret'},{executor_stopped:false}])await assert.rejects(bridge(request('finish_article_upload_execution',{executor_stopped:true,...changed})));
 assert.equal(calls,0);
});
await test('finish closes on transport failure, emits a safe error and does not auto retry',async()=>{
 let calls=0,lookups=0;const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>{lookups++;return 'synthetic-secret';},executionStopped:()=>true,call:async()=>{calls++;throw Error('request execution_claim=synthetic-secret');}});
 await assert.rejects(bridge(finishRequest()),error=>error.status==='execution_finish_unknown'&&error.new_platform_upload_allowed===false&&!error.message.includes('synthetic-secret'));
 await assert.rejects(bridge(finishRequest()),{status:'execution_closed'});await assert.rejects(bridge(request('record_article_upload')),{status:'execution_closed'});assert.equal(calls,1);assert.equal(lookups,1);
});
await test('missing or failing claim lookup closes the requested finish without leaking host errors',async()=>{
 for(const currentClaim of [async()=>null,async()=>{throw Error('synthetic-sensitive-lookup');}]){let calls=0;
  const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim,executionStopped:()=>true,call:async()=>{calls++;return {};}});
  await assert.rejects(bridge(finishRequest()),error=>error.status==='execution_finish_unknown'&&!error.message.includes('synthetic-sensitive'));
  await assert.rejects(bridge(request('record_article_upload')),{status:'execution_closed'});assert.equal(calls,0);
 }
});
await test('an ordinary mutation also suppresses sensitive claim-lookup errors',async()=>{
 let calls=0,fail=true;const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>{if(fail)throw Error('execution_claim=synthetic-sensitive-lookup');return 'synthetic-current';},executionStopped:()=>true,call:async()=>{calls++;return {recorded:true};}});
 await assert.rejects(bridge(request('record_article_upload')),error=>error.status==='lease_lookup_failed'&&!error.message.includes('synthetic-sensitive'));
 assert.equal(calls,0);fail=false;assert.equal((await bridge(request('record_article_upload'))).recorded,true);assert.equal(calls,1);
});
await test('every finish response identity, safety flag and credential leak is checked',async()=>{
 const mutations=[value=>{value.article_id='other';},value=>{value.platform='zhihu';},value=>{value.released=false;},value=>{value.execute_import=true;},value=>{value.new_upload_allowed=true;},value=>{delete value.unconsumed_permits_fenced;},value=>{value.history_preserved=false;},value=>{value.extra='synthetic-secret';},value=>{value.cookie='opaque';}];
 for(const mutate of mutations){let calls=0;const value=released(platform);mutate(value);const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>'synthetic-secret',executionStopped:()=>true,call:async()=>{calls++;return value;}});
  await assert.rejects(bridge(finishRequest()),{status:'execution_finish_unknown'});await assert.rejects(bridge(request('record_article_upload')),{status:'execution_closed'});assert.equal(calls,1);
 }
 for(const value of [null,()=>{}]){const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>'synthetic-current',executionStopped:()=>true,call:async()=>value});await assert.rejects(bridge(finishRequest()),{status:'execution_finish_unknown'});}
});
await test('finish uses a rotated claim and destroys only its platform permit',async()=>{
 for(const confirmed of [true,false]){
  const calls=[];const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async p=>'synthetic-initial-'+p,executionStopped:()=>true,call:async(op,args)=>{calls.push({op,args});if(op==='reserve_article_upload')return linked(args.platform);if(op==='finish_article_upload_execution'){if(!confirmed)throw Error('synthetic-response-unknown');return released(args.platform);}if(op==='recover_article_claim')return {article_id,platform:args.platform,old_claim_fenced:true,new_upload_allowed:false,claim_token:'synthetic-recovered-toutiao'};return {execute_import:true};}});
  await bridge(reserve('toutiao'));await bridge(reserve('zhihu'));
  if(confirmed)await bridge(finishRequest());else await assert.rejects(bridge(finishRequest()),{status:'execution_finish_unknown'});
  assert.equal(calls.at(-1).args.execution_claim,'synthetic-linked-toutiao');
  await assert.rejects(bridge(consume('toutiao')),{status:'execution_closed'});assert.equal((await bridge(consume('zhihu'))).execute_import,true);assert.equal(calls.at(-1).args.consume_token,'synthetic-permit-zhihu');
  // A confirmed release uses normal successor claim, not recover. Only the unknown
  // response branch models an existing lease with an independently authorized recovery.
  if(!confirmed){await bridge(request('recover_article_claim',approval));const count=calls.length;await assert.rejects(bridge(consume('toutiao')),/permission unavailable/);assert.equal(calls.length,count,'closing and recovery never restore the old permit');}
 }
});
await test('single-flight starts before asynchronous claim lookup',async()=>{
 const lookup=deferred(),entered=deferred();let calls=0;
 const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>{entered.resolve();return lookup.promise;},executionStopped:()=>true,call:async()=>{calls++;return released(platform);}});
 const finishing=bridge(finishRequest());await entered.promise;
 await assert.rejects(bridge(finishRequest()),{status:'bridge_operation_pending'});await assert.rejects(bridge(request('recover_article_claim',approval)),{status:'bridge_operation_pending'});await assert.rejects(bridge(request('record_article_upload')),{status:'bridge_operation_pending'});assert.equal(calls,0);
 lookup.resolve('synthetic-current');assert.equal((await finishing).released,true);assert.equal(calls,1);
});
await test('a pending finish cannot be overtaken by recovery; a later exact recovery opens only its new lease',async()=>{
 const pending=deferred(),entered=deferred(),calls=[];
 const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>'synthetic-initial',executionStopped:()=>true,call:async(op,args)=>{calls.push({op,args});if(op==='finish_article_upload_execution'){entered.resolve();return pending.promise;}if(op==='recover_article_claim')return {article_id,platform,old_claim_fenced:true,new_upload_allowed:false,claim_token:'synthetic-new-recovered'};return {recorded:true};}});
 const finishing=bridge(finishRequest());await entered.promise;await assert.rejects(bridge(request('recover_article_claim',approval)),{status:'bridge_operation_pending'});
 assert.equal((await bridge(request('record_article_upload',{platform:'zhihu'}))).recorded,true);
 pending.reject(Error('synthetic-transport-secret'));await assert.rejects(finishing,{status:'execution_finish_unknown'});
 const recovered=await bridge(request('recover_article_claim',approval));assert.equal('claim_token' in recovered,false);await bridge(request('record_article_upload'));assert.equal(calls.at(-1).args.execution_claim,'synthetic-new-recovered');
});
await test('pending reimport reservation excludes finish and cannot reinstall a late old claim',async()=>{
 const pending=deferred(),entered=deferred(),calls=[];
 const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>'synthetic-initial',executionStopped:()=>true,call:async(op,args)=>{calls.push({op,args});if(op==='reserve_article_upload'){entered.resolve();return pending.promise;}return released(args.platform);}});
 const reservation=bridge(reserve(platform));await entered.promise;await assert.rejects(bridge(finishRequest()),{status:'bridge_operation_pending'});assert.equal(calls.length,1);
 pending.resolve(linked(platform));await reservation;await bridge(finishRequest());assert.equal(calls.at(-1).args.execution_claim,'synthetic-linked-toutiao');await assert.rejects(bridge(consume(platform)),{status:'execution_closed'});assert.equal(calls.length,2);
});
await test('pending consume excludes finish and its one-use permission cannot be replayed',async()=>{
 const pending=deferred(),entered=deferred(),calls=[];
 const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>'synthetic-initial',executionStopped:()=>true,call:async(op,args)=>{calls.push({op,args});if(op==='reserve_article_upload')return linked(platform);if(op==='consume_article_upload'){entered.resolve();return pending.promise;}return released(platform);}});
 await bridge(reserve(platform));const consumption=bridge(consume(platform));await entered.promise;await assert.rejects(bridge(finishRequest()),{status:'bridge_operation_pending'});
 pending.resolve({execute_import:true});await consumption;await assert.rejects(bridge(consume(platform)),/permission unavailable/);await bridge(finishRequest());assert.equal(calls.length,3);
});
await test('bad recovery never reopens a bridge already closed by finish',async()=>{
 for(const response of [{article_id,platform,claim_token:'synthetic-recovered'},null]){let lookups=0;
  const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:async()=>{lookups++;return 'synthetic-initial';},executionStopped:()=>true,call:async(op)=>op==='finish_article_upload_execution'?released(platform):response});
  await bridge(finishRequest());await assert.rejects(bridge(request('recover_article_claim',approval)));await assert.rejects(bridge(request('record_article_upload')),{status:'execution_closed'});assert.equal(lookups,1);
 }
});
console.log(`${cases} bridge-finish security/concurrency groups passed; real browser/platform/provider/production writes=0.`);
