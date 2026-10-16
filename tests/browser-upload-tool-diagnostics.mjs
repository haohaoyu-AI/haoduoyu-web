import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {createArticleUploadBridge} from '../scripts/browser-upload/bridge.mjs';
import {createArticleUploadHost,createUploadToolCall,unwrapUploadToolResponse,summarizeUploadToolError} from '../scripts/browser-upload/tool-host.mjs';

const summary='Word checksum failed',fallback='Authenticated upload operation failed; retain state and reconcile.';
const failure={error_code:'INVALID_ARGUMENT',error:summary};
const secret=crypto.randomUUID();
const text=(value,isError=false)=>({isError,content:[{type:'text',text:typeof value==='string'?value:JSON.stringify(value)}]});
const expected={code:'INVALID_ARGUMENT',summary};
const errorFixtures=[
 failure,{error:{error_code:'INVALID_ARGUMENT',message:summary}},
 {code:'INVALID_ARGUMENT',message:summary},{error_code:'INVALID_ARGUMENT',error:JSON.stringify({message:summary})},
 JSON.stringify(failure),{text:JSON.stringify(failure)},{message:JSON.stringify(failure)},
 {isError:true,content:[{type:'text',text:JSON.stringify(failure)}]},
 {isError:true,structuredContent:null,content:[{type:'text',text:JSON.stringify(failure)}]},
 {isError:true,structuredContent:undefined,content:[{type:'text',text:JSON.stringify(failure)}]},
 {isError:true,structuredContent:failure},
];
for(const fixture of errorFixtures)assert.deepEqual(summarizeUploadToolError(fixture),expected);
for(const code of ['PERMISSION_DENIED','UNAUTHENTICATED','NOT_FOUND','CONFLICT','INTERNAL','UNAVAILABLE','DEADLINE_EXCEEDED']){
 assert.deepEqual(summarizeUploadToolError({error_code:code,error:summary}),{code,summary});
}
assert.deepEqual(summarizeUploadToolError({error:summary}),{code:'UPLOAD_OPERATION_FAILED',summary});
assert.deepEqual(summarizeUploadToolError('INVALID_ARGUMENT'),{code:'INVALID_ARGUMENT',summary:fallback});
for(const fixture of [Error(secret),{error_code:secret,error:secret},{error:{code:secret,message:secret}},{message:summary+' '+secret},
 {error:{data:{message:secret,code:secret}}},{stack:secret,cookie:secret,authorization:secret},['INVALID_ARGUMENT',summary],null,
 {text:'{"error_code":"INVALID_ARGUMENT",'+secret},{message:'x'.repeat(20000)+secret},new Proxy({}, {get(){throw Error(secret);}})]){
 const safe=summarizeUploadToolError(fixture);assert.equal(JSON.stringify(safe).includes(secret),false);
 assert.equal(Object.keys(safe).join(','),'code,summary');
}
console.log('PASS fixed error_code/string error/nested JSON/exception summaries and unknown/credential pollution; no raw output.');
// Some connectors throw a CallToolResult instead of returning it. Null/absent
// structured content must use the same usable text error on both paths.
for(const structuredContent of [null,undefined]){
 const envelope={isError:true,structuredContent,content:[{type:'text',text:JSON.stringify(failure)}]};let calls=0;
 const call=createUploadToolCall({read_article_upload:async()=>{calls++;throw envelope;}});
 await assert.rejects(call('read_article_upload',{}),error=>error.code===expected.code&&error.message===expected.summary);assert.equal(calls,1);
}

const events=[];
for(const fixture of [text(failure,true),{isError:true,structuredContent:failure},
 {isError:true,structuredContent:{error:{code:'INVALID_ARGUMENT',message:summary}}},
 text(failure,false),{isError:false,structuredContent:failure},failure]){
 assert.throws(()=>unwrapUploadToolResponse(fixture,event=>events.push(event)),error=>error.code==='INVALID_ARGUMENT'&&error.message===summary);
}
assert.throws(()=>unwrapUploadToolResponse(text(summary,true)),error=>error.code==='UPLOAD_OPERATION_FAILED'&&error.message===summary);
assert.throws(()=>unwrapUploadToolResponse({jsonrpc:'2.0',id:1,error:{code:-32602,message:secret}}),error=>error.code==='RPC_INVALID_PARAMS'&&error.message===fallback);
assert.throws(()=>unwrapUploadToolResponse({jsonrpc:'2.0',id:1,error:{code:-32099,message:secret}}),error=>error.code==='UPLOAD_OPERATION_FAILED'&&error.message===fallback);
const success={reserved:false,execute_import:false};
for(const fixture of [text(success),{...text(success),structuredContent:null},{isError:false,structuredContent:success,content:[{type:'text',text:secret}]},
 {jsonrpc:'2.0',id:2,result:text(success)}])assert.deepEqual(unwrapUploadToolResponse(fixture),success);
// Structured success is authoritative; unrelated unparsed text is never retained.
assert.equal(JSON.stringify(unwrapUploadToolResponse({structuredContent:success,content:[{type:'text',text:secret}]})).includes(secret),false);
for(const fixture of [null,[],{},success,text('not JSON '+secret),text(null),text([]),
 {structuredContent:[]},{structuredContent:null},{isError:'false',structuredContent:success},
 {content:[{type:'text',text:JSON.stringify(success)},{type:'text',text:secret}]},
 text({isError:true,content:[{type:'text',text:JSON.stringify({consume_token:secret})}]}),
 {structuredContent:{structuredContent:{consume_token:secret}}},text({jsonrpc:'2.0',result:text({consume_token:secret})})]){
 assert.throws(()=>unwrapUploadToolResponse(fixture),error=>error.message===fallback&&!JSON.stringify(error).includes(secret));
}
console.log('PASS official CallToolResult text/structured precedence, error JSON, connector/RPC errors and malformed/nested envelopes fail closed.');

const article_id=crypto.randomUUID(),platform='toutiao',request={status:'bridge_required',operation:'read_article_upload',args:{article_id,platform}};
const scope={article_id,platforms:[platform]};
const stages=receipt=>receipt.diagnostics.map(event=>event.stage);
const setup=operation=>{
 let calls=0;const emitted=[],diagnostics=[];
 const call=createUploadToolCall({read_article_upload:async args=>{calls++;return operation(args);}});
 const bridge=createArticleUploadBridge({approvedScope:scope,currentClaim:()=>assert.fail('passive reads need no claim'),call,summarizeToolError:summarizeUploadToolError});
 const host=createArticleUploadHost({bridge,emit:value=>emitted.push(value),emitDiagnostic:value=>diagnostics.push(value)});
 return {host,emitted,diagnostics,calls:()=>calls};
};
const guard=setup(()=>assert.fail('scope guard must precede tool'));
const rejected=await guard.host.execute(crypto.randomUUID(),{...request,args:{...request.args,article_id:secret}});
assert.deepEqual(stages(rejected),['bridge_guard_start','bridge_guard_failed']);assert.equal(guard.calls(),0);
assert.equal(rejected.error.summary,'Upload bridge scope differs from the owner-authorized task');
assert.equal(JSON.stringify(rejected).includes(secret),false);

const rpc=setup(()=>{throw {error_code:'UNAVAILABLE',error:secret,cookie:secret};});
const rpcReceipt=await rpc.host.execute(crypto.randomUUID(),request);
assert.deepEqual(stages(rpcReceipt),['bridge_guard_start','bridge_call_before','tool_call_before','tool_call_threw','bridge_call_failed']);
assert.equal(rpcReceipt.error.code,'UNAVAILABLE');assert.equal(rpcReceipt.error.summary,fallback);

const server=setup(()=>text(failure,true));
const serverId=crypto.randomUUID(),serverReceipt=await server.host.execute(serverId,request);
assert.deepEqual(stages(serverReceipt),['bridge_guard_start','bridge_call_before','tool_call_before','tool_call_returned','tool_result_error','bridge_call_failed']);
assert.equal(serverReceipt.diagnostics.find(event=>event.stage==='tool_result_error').shape,'content_json');
assert.deepEqual(serverReceipt.diagnostics.find(event=>event.stage==='tool_result_error').fields,['error','error_code']);
assert.deepEqual(serverReceipt.error,expected);assert.equal(serverReceipt.source,'actual_bridge_error');
assert.equal((await server.host.deliver(serverId,()=>assert.fail('error must not reach receiver'))).outcome,'error');
assert.equal(server.calls(),1);assert.deepEqual(await server.host.execute(serverId,request),serverReceipt);assert.equal(server.calls(),1);

const connector=setup(()=>text(failure));
assert.equal(stages(await connector.host.execute(crypto.randomUUID(),request)).includes('tool_connector_error'),true);
const malformed=setup(()=>text('raw token '+secret));
assert.equal(stages(await malformed.host.execute(crypto.randomUUID(),request)).includes('tool_result_invalid'),true);
const missing=createArticleUploadHost({bridge:createArticleUploadBridge({approvedScope:scope,call:createUploadToolCall({}),summarizeToolError:summarizeUploadToolError})});
assert.equal(stages(await missing.execute(crypto.randomUUID(),request)).includes('tool_mapping_missing'),true);

// Live markers distinguish before/after the tool promise, without raw args/body.
let release,entered;const enteredPromise=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
const pendingTool=setup(async()=>{entered();await gate;return text(success);});
const pendingId=crypto.randomUUID(),pending=pendingTool.host.execute(pendingId,request);
await enteredPromise;assert.deepEqual(pendingTool.diagnostics.map(event=>event.stage),['bridge_guard_start','bridge_call_before','tool_call_before']);
assert.equal(pendingTool.host.read(pendingId),null);release();const complete=await pending;
assert.deepEqual(stages(complete),['bridge_guard_start','bridge_call_before','tool_call_before','tool_call_returned','tool_result_decoded','bridge_call_returned','bridge_response_validated']);
assert.equal(complete.source,'actual_authenticated_bridge_response');
// Public copies and observer callbacks cannot rewrite the private result or trace.
const original=structuredClone(complete);complete.result.execute_import=true;complete.diagnostics[0].stage='caller-changed';pendingTool.diagnostics[0].stage='observer-changed';pendingTool.emitted[0].result.execute_import=true;
assert.deepEqual(pendingTool.host.read(pendingId),original);
assert.deepEqual(await pendingTool.host.execute(pendingId,request),original);
await pendingTool.host.deliver(pendingId,(result,receipt)=>{assert.equal(result.execute_import,false);assert.deepEqual(receipt,original);result.execute_import=true;receipt.diagnostics.length=0;});
assert.deepEqual(pendingTool.host.read(pendingId),original);assert.equal(pendingTool.calls(),1);
for(const fixture of [guard,rpc,server,connector,malformed,pendingTool]){
 assert.equal(JSON.stringify(fixture.emitted).includes(secret),false);assert.equal(JSON.stringify(fixture.diagnostics).includes(secret),false);
 for(const marker of fixture.diagnostics)assert.equal(Object.keys(marker).every(key=>['operation_id','stage','shape','fields','envelope_keys','other_keys_present','structured_kind','text_kind','is_error','error_sources','code_source','summary_source','code_conflict','summary_conflict'].includes(key)),true);
}
console.log('PASS same-cell guard/call/return/throw/decode markers, error handoff stopped, idempotency and private receipt/hash/trace mutation isolation.');

// Diagnostics themselves are filtered; observer exceptions never retry a tool.
const polluted=createArticleUploadHost({bridge:async(_request,diagnose)=>{
 diagnose({stage:secret,shape:secret,fields:[secret],consume_token:secret});
 diagnose({stage:'tool_call_before',shape:secret,fields:['error_code',secret],authorization:secret});return success;
},emitDiagnostic:()=>{throw Error(secret);}});
const filtered=await polluted.execute(crypto.randomUUID(),request);
assert.deepEqual(filtered.diagnostics,[{stage:'tool_call_before',fields:['error_code']}]);assert.equal(JSON.stringify(filtered).includes(secret),false);
const rejects=createArticleUploadHost({bridge:async(_request,diagnose)=>{diagnose({stage:'tool_call_before'});return success;},emitDiagnostic:()=>Promise.reject(Error(secret))});
assert.equal((await rejects.execute(crypto.randomUUID(),request)).outcome,'response');await new Promise(resolve=>setImmediate(resolve));
for(const token of [secret,summary,'INVALID_ARGUMENT']){
 const call=createUploadToolCall({consume_article_upload:async()=>({isError:true,structuredContent:{error_code:'INVALID_ARGUMENT',error:token}})});
 await assert.rejects(call('consume_article_upload',{execution_claim:token}),error=>error.message===fallback&&error.code===(token===secret?'INVALID_ARGUMENT':'UPLOAD_OPERATION_FAILED'));
}

// Full emitted source is the actual deployment handoff, including JSON clone
// fallback in a tool host without structuredClone. Use only synthetic callbacks.
const standalone=execFileSync(process.execPath,['scripts/browser-upload/emit-tool-host-module.mjs'],{encoding:'utf8'});
const context={crypto,TextEncoder,console};vm.runInNewContext(standalone+'\n globalThis.diagnosticExports={createArticleUploadHost,createArticleUploadBridge,createUploadToolCall,summarizeUploadToolError};',context);
const emitted=context.diagnosticExports;
const standaloneHost=emitted.createArticleUploadHost({bridge:emitted.createArticleUploadBridge({approvedScope:scope,summarizeToolError:emitted.summarizeUploadToolError,call:emitted.createUploadToolCall({read_article_upload:async()=>text(failure,true)})})});
const standaloneReceipt=await standaloneHost.execute(crypto.randomUUID(),request);
assert.equal(standaloneReceipt.error.code,'INVALID_ARGUMENT');assert.equal(standaloneReceipt.error.summary,summary);assert.equal(stages(standaloneReceipt).includes('tool_result_error'),true);
assert.equal(fs.readFileSync('scripts/browser-upload/bridge.mjs','utf8').startsWith('import '),false);
console.log('PASS diagnostic pollution/observer failure, known bearer collision scrubbing, standalone emitted actual definitions; external calls=0.');
