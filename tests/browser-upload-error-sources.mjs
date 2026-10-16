import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

// An optional local module path permits the exact production negative control.
// Every response below is synthetic; no real article, token or request is used.
const moduleUrl=process.env.UPLOAD_TOOL_HOST_SOURCE?pathToFileURL(process.env.UPLOAD_TOOL_HOST_SOURCE):new URL('../scripts/browser-upload/tool-host.mjs',import.meta.url);
const {createArticleUploadHost,createUploadToolCall,summarizeUploadToolError,unwrapUploadToolResponse}=await import(moduleUrl);
const fallback='Authenticated upload operation failed; retain state and reconcile.';
const summary='Unconsumed recovery snapshot or scope changed',otherSummary='Upload child lineage is invalid';
const secret=crypto.randomUUID();
const text=value=>({type:'text',text:typeof value==='string'?value:JSON.stringify(value)});
const envelope=content=>({isError:true,structuredContent:{error_code:'INVALID_ARGUMENT'},content:[text(content)]});
const request={status:'bridge_required',operation:'recover_article_unconsumed_upload',args:{}};
async function observe(result,args={},thrown=false){
 let calls=0;const emitted=[],markers=[];
 const call=createUploadToolCall({recover_article_unconsumed_upload:async()=>{calls++;if(thrown)throw result;return result;}});
 const host=createArticleUploadHost({bridge:(_request,diagnose)=>call('recover_article_unconsumed_upload',args,diagnose),emit:value=>emitted.push(value),emitDiagnostic:value=>markers.push(value)});
 const id=crypto.randomUUID(),receipt=await host.execute(id,request);
 return {host,id,receipt,emitted,markers,calls:()=>calls};
}
const errorMarker=value=>value.receipt.diagnostics.find(marker=>marker.stage==='tool_result_error'||marker.stage==='tool_call_threw');

// Proven shadowing: nonempty structuredContent has code only. Single text
// carries a whitelisted summary, as plain text or JSON; both channels survive.
for(const content of [summary,{error:summary},{error_code:'INVALID_ARGUMENT',error:summary}]){
 const value=await observe(envelope(content));
 assert.deepEqual(value.receipt.error,{code:'INVALID_ARGUMENT',summary});
 const marker=errorMarker(value);
 assert.equal(marker.shape,'structured_content');assert.equal(marker.code_conflict,false);assert.equal(marker.summary_conflict,false);
 assert.equal(marker.summary_source,typeof content==='string'?'content_text':'content_json');
 assert.equal(marker.error_sources.length,2);
 assert.deepEqual(marker.error_sources[0],{source:'structured_content',fields:['error_code'],codes:['INVALID_ARGUMENT'],summaries:[]});
 assert.deepEqual(marker.error_sources[1].summaries,[summary]);
 assert.equal(marker.code_source,Object.hasOwn(content,'error_code')?'multiple':'structured_content');
 const outline=value.receipt.diagnostics.find(marker=>marker.stage==='tool_call_returned');
 assert.deepEqual(outline,{stage:'tool_call_returned',envelope_keys:['content','isError','structuredContent'],other_keys_present:false,structured_kind:'object',text_kind:typeof content==='string'?'plain_text':'json_object',is_error:'true'});
 assert.equal(value.receipt.source,'actual_bridge_error');assert.equal(value.calls(),1);
 assert.equal((await value.host.deliver(value.id,()=>assert.fail('errors never reach CUA'))).outcome,'error');
 const original=structuredClone(value.receipt);
 marker.error_sources[1].summaries[0]='observer replacement';value.markers.at(-1).error_sources.length=0;value.emitted[0].diagnostics.length=0;
 assert.deepEqual(value.host.read(value.id),original);assert.deepEqual(await value.host.execute(value.id,request),original);assert.equal(value.calls(),1);
 assert.deepEqual(summarizeUploadToolError(envelope(content)),{code:'INVALID_ARGUMENT',summary});
 const thrown=await observe(envelope(content),{},true);
 assert.deepEqual(thrown.receipt.error,{code:'INVALID_ARGUMENT',summary});assert.equal(errorMarker(thrown).summary_source,typeof content==='string'?'content_text':'content_json');assert.equal(thrown.calls(),1);
}
console.log('PASS synthetic current-envelope shadowing, plain/JSON content, returned/thrown source provenance, error handoff stopped, immutable receipt and same-request replay.');

// Conflicting known codes cannot be combined with one channel's summary.
for(const content of [{error_code:'CONFLICT',error:summary},{error_code:'CONFLICT',error:otherSummary}]){
 const value=await observe({...envelope(content),structuredContent:{error_code:'INVALID_ARGUMENT',error:summary}});
 assert.deepEqual(value.receipt.error,{code:'UPLOAD_OPERATION_FAILED',summary:fallback});
 const marker=errorMarker(value);assert.equal(marker.code_conflict,true);assert.equal(marker.code_source,'conflict');
 assert.deepEqual(marker.error_sources.map(source=>source.codes),[['INVALID_ARGUMENT'],['CONFLICT']]);
 assert.equal(marker.summary_conflict,content.error!==summary);
}
const summaryConflict=await observe({...envelope({error_code:'INVALID_ARGUMENT',error:otherSummary}),structuredContent:{error_code:'INVALID_ARGUMENT',error:summary}});
assert.deepEqual(summaryConflict.receipt.error,{code:'INVALID_ARGUMENT',summary:fallback});
assert.equal(errorMarker(summaryConflict).summary_conflict,true);assert.equal(errorMarker(summaryConflict).summary_source,'conflict');
const nestedConflict=await observe(envelope({code:'INVALID_ARGUMENT',error:{code:'CONFLICT',message:summary}}));
assert.equal(nestedConflict.receipt.error.code,'UPLOAD_OPERATION_FAILED');assert.equal(errorMarker(nestedConflict).code_conflict,true);
console.log('PASS conflicting source/nested known codes and summaries fail closed; each fixed source remains auditable.');
// Top-level envelope fields are distinct from structuredContent, including
// when the overall error shape is structured. Preserve that source on throws.
for(const thrown of [false,true]){
 const value=await observe({...envelope({error:summary}),code:'CONFLICT',message:otherSummary},{},thrown);
 const marker=errorMarker(value);assert.deepEqual(value.receipt.error,{code:'UPLOAD_OPERATION_FAILED',summary:fallback});
 assert.deepEqual(marker.error_sources.map(source=>source.source),['envelope','structured_content','content_json']);
 assert.deepEqual(marker.error_sources[0],{source:'envelope',fields:['code','message'],codes:['CONFLICT'],summaries:[otherSummary]});
 assert.deepEqual(marker.error_sources[1],{source:'structured_content',fields:['error_code'],codes:['INVALID_ARGUMENT'],summaries:[]});
 assert.equal(marker.code_conflict,true);assert.equal(marker.summary_conflict,true);assert.equal(value.calls(),1);
}

// Unknown values and malformed/multiple/over-limit text never become summaries.
for(const content of [secret,{error:secret,stack:secret,consume_token:secret},{error:summary+' '+secret},'{'+secret,'x'.repeat(20000)+secret]){
 const value=await observe({...envelope(content),[secret]:secret,cookie:secret,authorization:secret});
 assert.deepEqual(value.receipt.error,{code:'INVALID_ARGUMENT',summary:fallback});
 assert.equal(JSON.stringify([value.receipt,value.emitted,value.markers]).includes(secret),false);
 const outline=value.receipt.diagnostics.find(marker=>marker.stage==='tool_call_returned');
 assert.equal(outline.other_keys_present,true);assert.deepEqual(outline.envelope_keys,['content','isError','structuredContent']);
}
for(const content of [[text(summary),text(secret)],[{type:'image',data:secret}],[]]){
 const value=await observe({isError:true,structuredContent:{error_code:'INVALID_ARGUMENT'},content});
 assert.deepEqual(value.receipt.error,{code:'INVALID_ARGUMENT',summary:fallback});assert.equal(errorMarker(value).error_sources.length,1);
 assert.equal(JSON.stringify(value.receipt).includes(secret),false);
}
for(const structuredContent of [null,undefined,[],secret]){
 const value=await observe({isError:true,structuredContent,content:[text({error_code:'INVALID_ARGUMENT',error:summary})]});
 assert.deepEqual(value.receipt.error,{code:'INVALID_ARGUMENT',summary});
}
for(const execution_claim of [secret,summary,'INVALID_ARGUMENT']){
 const polluted=envelope({error_code:'INVALID_ARGUMENT',error:execution_claim});
 const value=await observe(polluted,{execution_claim});
 assert.equal(value.receipt.error.summary,fallback);
 assert.equal(value.receipt.error.code,execution_claim===secret?'INVALID_ARGUMENT':'UPLOAD_OPERATION_FAILED');
 assert.equal(JSON.stringify([value.receipt,value.markers,value.emitted]).includes(execution_claim),false);
 const thrown=await observe(polluted,{execution_claim},true);assert.equal(JSON.stringify(thrown.receipt).includes(execution_claim),false);
}
console.log('PASS unknown raw fields/keys, malformed/multiple/over-limit text, null fallback and known credential collisions never retained.');

// Success priority is unchanged: poisonous companion content has no influence,
// and no content error source or fixed message is added to a success journal.
const success={reserved:false,execute_import:false};
for(const content of [summary,{error_code:'CONFLICT',error:summary},{consume_token:secret,error:secret},'{'+secret]){
 const value=await observe({isError:false,structuredContent:success,content:[text(content)],cookie:secret,[secret]:secret});
 assert.equal(value.receipt.outcome,'response');assert.deepEqual(value.receipt.result,success);
 assert.equal(value.receipt.diagnostics.find(marker=>marker.stage==='tool_call_returned').text_kind,'uninspected');
 assert.equal(value.receipt.diagnostics.some(marker=>marker.error_sources),false);
 assert.equal(JSON.stringify(value.receipt).includes(secret),false);assert.equal(JSON.stringify(value.receipt).includes(summary),false);
}
const jsonRpc=await observe({jsonrpc:'2.0',id:secret,result:envelope({error:summary})});
assert.deepEqual(jsonRpc.receipt.error,{code:'INVALID_ARGUMENT',summary});
assert.deepEqual(jsonRpc.receipt.diagnostics.find(marker=>marker.stage==='tool_call_returned').envelope_keys,['id','jsonrpc','result']);
assert.equal(JSON.stringify(jsonRpc.receipt).includes(secret),false);
assert.throws(()=>unwrapUploadToolResponse({isError:true,structuredContent:{error_code:'INVALID_ARGUMENT'},content:[text({error:summary})]}),error=>error.message===summary);
console.log('PASS structured success priority with poisoned content and explicit JSON-RPC source boundary; external calls=0.');

// Only static enums/whitelist values are accepted even from a polluted observer.
const filteredHost=createArticleUploadHost({bridge:async(_request,diagnose)=>{
 diagnose({stage:'tool_result_error',envelope_keys:['content',secret],other_keys_present:secret,text_kind:secret,structured_kind:secret,is_error:secret,
  error_sources:[{source:secret,codes:['INVALID_ARGUMENT'],summaries:[summary]},{source:'content_json',fields:['error',secret],codes:['INVALID_ARGUMENT',secret],summaries:[summary,secret],raw:secret}],
  code_source:secret,summary_source:secret,code_conflict:secret,summary_conflict:secret,raw:secret});throw Error(secret);
}});
const filtered=await filteredHost.execute(crypto.randomUUID(),request);
assert.deepEqual(filtered.diagnostics,[{stage:'tool_result_error',envelope_keys:['content'],error_sources:[{source:'content_json',fields:['error'],codes:['INVALID_ARGUMENT'],summaries:[summary]}]}]);
assert.equal(JSON.stringify(filtered).includes(secret),false);
const standalone=execFileSync(process.execPath,['scripts/browser-upload/emit-tool-host-module.mjs'],{encoding:'utf8'});
const context={crypto,TextEncoder};vm.runInNewContext(standalone+'\n globalThis.testExports={createArticleUploadHost,createUploadToolCall};',context);
const standaloneCall=context.testExports.createUploadToolCall({recover_article_unconsumed_upload:async()=>envelope({error:summary})});
const standaloneHost=context.testExports.createArticleUploadHost({bridge:(_request,diagnose)=>standaloneCall('recover_article_unconsumed_upload',{},diagnose)});
const standaloneReceipt=await standaloneHost.execute(crypto.randomUUID(),request);
assert.deepEqual(JSON.parse(JSON.stringify(standaloneReceipt.error)),{code:'INVALID_ARGUMENT',summary});
assert.equal(standaloneReceipt.diagnostics.find(marker=>marker.stage==='tool_result_error').summary_source,'content_json');
console.log('PASS diagnostic whitelist/pollution and emitted same-cell definitions without structuredClone; no production calls or permit changes.');
