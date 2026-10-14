import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {createArticleUploadHost,createUploadToolCall,summarizeUploadToolError} from '../scripts/browser-upload/tool-host.mjs';
import {createArticleUploadBridge} from '../scripts/browser-upload/bridge.mjs';

// Synthetic official tool envelopes only: no browser, server, article mutation
// or real credential. The server diagnostic remains a denied-import observation.
const article_id=crypto.randomUUID(),secret=crypto.randomUUID();
const diagnostic={stage:'consume_cas',outcome:'unconfirmed',execute_import:false,next_action:'read_existing_record',error_kind:'database_expression_limit'};
const envelope=value=>({isError:true,structuredContent:{error_code:'INVALID_ARGUMENT',diagnostic:value},content:[{type:'text',text:'Word checksum failed'}]});
const marker=receipt=>receipt.diagnostics.find(event=>event.stage==='tool_result_error');
async function observe(value,{platform='toutiao',credential=secret,wrap=result=>result}={}){
 let calls=0,delivered=0;const emitted=[];
 const call=createUploadToolCall({consume_article_upload:async args=>{calls++;assert.equal(args.execution_claim,credential);return wrap(envelope(value));}});
 const bridge=createArticleUploadBridge({call,currentClaim:async()=>credential,approvedScope:{article_id,platforms:['toutiao','zhihu']},summarizeToolError:summarizeUploadToolError});
 const host=createArticleUploadHost({bridge,emit:receipt=>emitted.push(receipt)});
 const id=crypto.randomUUID(),request={status:'bridge_required',operation:'consume_article_upload',args:{article_id,platform,attempt_id:crypto.randomUUID()}};
 const receipt=await host.execute(id,request);
 assert.equal(receipt.outcome,'error');assert.equal(receipt.error.code,'INVALID_ARGUMENT');
 await host.deliver(id,()=>{delivered++;});assert.equal(delivered,0,'isError must never deliver an import response to the runner');
 assert.deepEqual(await host.execute(id,request),receipt);assert.equal(calls,1,'the diagnostic cannot retry or authorize another call');
 return {host,id,receipt,emitted};
}

for(const platform of ['toutiao','zhihu']){
 const value=await observe(diagnostic,{platform});
 assert.deepEqual(marker(value.receipt).server_diagnostic,diagnostic);
 assert.equal(value.receipt.error.summary,'Word checksum failed');
 const original=structuredClone(value.receipt);
 marker(value.receipt).server_diagnostic.execute_import=true;
 marker(value.emitted[0]).server_diagnostic.stage='observer replacement';
 assert.deepEqual(value.host.read(value.id),original,'the server observation is retained as immutable receipt evidence');
 assert.equal(JSON.stringify([value.receipt,value.emitted,value.host.read(value.id)]).includes(secret),false);
}
const rpc=await observe(diagnostic,{wrap:result=>({jsonrpc:'2.0',id:secret,result})});
assert.deepEqual(marker(rpc.receipt).server_diagnostic,diagnostic);assert.equal(JSON.stringify(rpc.receipt).includes(secret),false);

// Prevent phase drift between the server and the emitted browser-free host.
const serverPhases=new Set();
for(const [file,name] of [['lib/article-upload-consume-diagnostics.ts','consumeUploadStages'],['lib/workflow-errors.ts','reserveUploadStages']]){
 const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
 const declaration=source.match(new RegExp('export const '+name+'=\\[([\\s\\S]*?)\\] as const;'));
 assert.ok(declaration,'the actual fixed server phase declaration must be found');
 for(const match of declaration[1].matchAll(/'([^']+)'/g))serverPhases.add(match[1]);
}
for(const stage of serverPhases){
 const value=await observe({...diagnostic,stage});assert.equal(marker(value.receipt).server_diagnostic.stage,stage);
}
for(const error_kind of ['database_expression_limit','database_parser_limit']){
 const value=await observe({...diagnostic,error_kind});assert.equal(marker(value.receipt).server_diagnostic.error_kind,error_kind);
}
const withoutKind={...diagnostic};delete withoutKind.error_kind;
assert.deepEqual(marker((await observe(withoutKind)).receipt).server_diagnostic,withoutKind);
console.log('PASS both platform error receipts preserve every actual fixed server phase and database-limit category, deny runner delivery and retain immutable same-request evidence.');

// Raw fields are never copied or inspected. Extra error contents cannot become
// capabilities, even alongside a valid fixed diagnostic.
const polluted={...diagnostic,execution_claim:secret,consume_token:secret,sql:'SELECT '+secret,stack:secret,execute_grant:true};
Object.defineProperty(polluted,'raw',{enumerable:true,get(){throw Error(secret);}});
const projected=await observe(polluted);
assert.deepEqual(marker(projected.receipt).server_diagnostic,diagnostic);
assert.equal(JSON.stringify([projected.receipt,projected.emitted]).includes(secret),false);
assert.equal(JSON.stringify(projected.receipt).includes('SELECT'),false);
for(const value of [null,[],secret,Object.create(diagnostic),{...diagnostic,stage:secret},{...diagnostic,outcome:'verified'},
 {...diagnostic,execute_import:true},{...diagnostic,execute_import:'false'},{...diagnostic,next_action:'submit_file'},
 {...diagnostic,error_kind:'unknown_limit'},{...diagnostic,error_kind:secret},{...diagnostic,error_kind:null}]){
 const observed=await observe(value);assert.equal('server_diagnostic' in marker(observed.receipt),false);
 assert.equal(JSON.stringify([observed.receipt,observed.emitted]).includes(secret),false);
}
for(const field of ['stage','outcome','execute_import','next_action','error_kind']){
 const poisoned={...diagnostic};Object.defineProperty(poisoned,field,{get(){throw Error(secret);}});
 const value=await observe(poisoned);assert.equal('server_diagnostic' in marker(value.receipt),false);
 assert.equal(JSON.stringify(value.receipt).includes(secret),false);
}
for(const field of ['stage','outcome','execute_import','next_action']){
 const incomplete={...diagnostic};delete incomplete[field];
 assert.equal('server_diagnostic' in marker((await observe(incomplete)).receipt),false);
}
for(const credential of ['consume_cas','unconfirmed','read_existing_record','database_expression_limit']){
 const value=await observe(diagnostic,{credential});assert.equal('server_diagnostic' in marker(value.receipt),false);
 assert.equal(JSON.stringify(value.receipt).includes(credential),false,'known credentials cannot collide into the fixed diagnostic');
}
const callbackHost=createArticleUploadHost({bridge:async(_request,diagnose)=>{
 diagnose({stage:'tool_result_decoded',server_diagnostic:diagnostic});throw Error('Word checksum failed');
}});
const successMarkerReceipt=await callbackHost.execute(crypto.randomUUID(),{});
assert.equal('server_diagnostic' in successMarkerReceipt.diagnostics[0],false,'server observations are accepted only on tool_result_error');
const poisonedObserverHost=createArticleUploadHost({bridge:async(_request,diagnose)=>{
 const event={stage:'tool_result_error'};Object.defineProperty(event,'server_diagnostic',{get(){throw Error(secret);}});
 diagnose(event);throw Error('Word checksum failed');
}});
const poisonedObserver=await poisonedObserverHost.execute(crypto.randomUUID(),{});
assert.equal('server_diagnostic' in poisonedObserver.diagnostics[0],false);
assert.equal(poisonedObserver.error.summary,'Word checksum failed');assert.equal(JSON.stringify(poisonedObserver).includes(secret),false);
console.log('PASS secret/SQL projection, forged grants, unknown phases/kinds, incomplete/inherited shapes, throwing getters and known credential collisions fail closed; no import or retry.');

const standalone=execFileSync(process.execPath,['scripts/browser-upload/emit-tool-host-module.mjs'],{encoding:'utf8'});
const context={crypto,TextEncoder};vm.runInNewContext(standalone+'\n globalThis.testExports={createArticleUploadHost,createUploadToolCall};',context);
const call=context.testExports.createUploadToolCall({consume_article_upload:async()=>envelope(polluted)});
const host=context.testExports.createArticleUploadHost({bridge:(request,diagnose)=>call('consume_article_upload',request.args,diagnose)});
const receipt=await host.execute(crypto.randomUUID(),{args:{execution_claim:secret}});
assert.deepEqual(JSON.parse(JSON.stringify(marker(receipt).server_diagnostic)),diagnostic);
assert.equal(receipt.outcome,'error');assert.equal(JSON.stringify(receipt).includes(secret),false);
console.log('PASS exact emitted same-cell host retains only the fixed denied-import diagnostic without structuredClone, eval, HTTP or external calls.');
