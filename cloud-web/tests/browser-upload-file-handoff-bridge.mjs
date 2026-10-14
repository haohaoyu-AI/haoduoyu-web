import assert from 'node:assert/strict';
import {createArticleUploadBridge} from '../scripts/browser-upload/bridge.mjs';

const article_id='synthetic-download-handoff', platform='toutiao', target_account='61556093362', sha256='a'.repeat(64), size=123;
const file={filename:'named.docx',absolute_path:'/synthetic/action/named.docx',browser_session:'synthetic-browser',visible_in_browser:false,visibility_unproven:true,sha256,size,checked_at:new Date().toISOString(),handoff:{kind:'same_browser_download',download_path:'/synthetic/download/actual-event',download_browser_session:'synthetic-browser',executor_id:'synthetic-executor',source_sha256:sha256,source_size:size,verified_in_cua:true,copied_in_same_executor:true,chooser_prepared:true,chooser_prepared_at:new Date().toISOString()}};
const request=(operation,f=file)=>({status:'bridge_required',operation,args:{article_id,platform,target_account,...(operation==='reserve_article_upload'?{mode:'new_import',word_sha256:sha256,word_size:size,preflight:{file:structuredClone(f)}}:{attempt_id:'synthetic-attempt',file_confirmation:structuredClone(f)})}});
const scope=()=>({article_id,platforms:[platform],file_handoff:{[platform]:structuredClone(file)}});
const setup=(approvedScope=scope(),alterResponse=x=>x)=>{
 const calls=[];
 const bridge=createArticleUploadBridge({approvedScope,currentClaim:async()=>'synthetic-private-claim',call:async(operation,args)=>{calls.push({operation,args});return operation==='reserve_article_upload'?alterResponse({reserved:true,attempt:{preflight:{file:structuredClone(args.preflight.file)}}}):{execute_import:true};}});
 return {bridge,calls};
};
let tests=0;
async function test(name,run){await run();tests++;console.log('PASS',name);}
await test('exact inspected download and named bytes retain visibility unproven through reserve and consume',async()=>{
 const x=setup();const r=await x.bridge(request('reserve_article_upload'));assert.equal(r.attempt.preflight.file.visible_in_browser,false);assert.equal(r.attempt.preflight.file.visibility_unproven,true);assert.equal((await x.bridge(request('consume_article_upload'))).execute_import,true);assert.equal(x.calls.length,2);assert.equal(x.calls[1].args.file_confirmation.handoff.download_path,file.handoff.download_path);
});
await test('unknown path availability needs a frozen host scope and genuine prepared chooser evidence',async()=>{
 for(const patch of [{visible_in_browser:true},{visibility_unproven:false},{filename:'other.docx'},{absolute_path:'/other/named.docx'},{browser_session:'other'},{sha256:'b'.repeat(64)},{size:124},{checked_at:'2001-01-01T00:00:00.000Z'},{handoff:undefined}]){
  const x=setup();await assert.rejects(x.bridge(request('reserve_article_upload',{...file,...patch})),/handoff/);assert.equal(x.calls.length,0);
 }
 for(const patch of [{kind:'filesystem_stat'},{download_path:'/other/download'},{download_browser_session:'other'},{executor_id:'other'},{source_sha256:'b'.repeat(64)},{source_size:124},{verified_in_cua:false},{copied_in_same_executor:false},{chooser_prepared:false},{chooser_prepared_at:'invalid'},{unexpected:'extra'}]){
  const x=setup();await assert.rejects(x.bridge(request('reserve_article_upload',{...file,handoff:{...file.handoff,...patch}})),/handoff/);assert.equal(x.calls.length,0);
 }
 const x=setup({article_id,platforms:[platform]});await assert.rejects(x.bridge(request('reserve_article_upload')),/handoff/);assert.equal(x.calls.length,0);
});
await test('host scope is frozen and neither response nor consume can swap the inspected download',async()=>{
 const s=scope(),x=setup(s);s.file_handoff[platform].absolute_path='/later/named.docx';assert.equal((await x.bridge(request('reserve_article_upload'))).reserved,true);
 await assert.rejects(x.bridge(request('consume_article_upload',{...file,handoff:{...file.handoff,download_path:'/later/download'}})),/handoff/);assert.equal(x.calls.length,1);
 assert.equal((await x.bridge(request('consume_article_upload'))).execute_import,true);
 const y=setup(scope(),r=>{r.attempt.preflight.file.handoff.executor_id='other';return r;});await assert.rejects(y.bridge(request('reserve_article_upload')),/handoff/);assert.equal(y.calls.length,1);
});
await test('a browser request cannot refresh stale byte checks or change their timestamp in response or consume',async()=>{
 const old=scope();old.file_handoff[platform].checked_at='2001-01-01T00:00:00.000Z';const x=setup(old);await assert.rejects(x.bridge(request('reserve_article_upload')),/handoff/);assert.equal(x.calls.length,0);
 const y=setup(scope(),r=>{r.attempt.preflight.file.checked_at='2001-01-01T00:00:00.000Z';return r;});await assert.rejects(y.bridge(request('reserve_article_upload')),/handoff/);
 const z=setup();await z.bridge(request('reserve_article_upload'));await assert.rejects(z.bridge(request('consume_article_upload',{...file,checked_at:'2001-01-01T00:00:00.000Z'})),/handoff/);assert.equal(z.calls.length,1);
});
console.log(JSON.stringify({tests,real_platform_calls:0,model_calls:0,production_db_writes:0}));
