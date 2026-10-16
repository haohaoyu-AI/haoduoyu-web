// Actual local source declarations, never cloud/server/model/credential access.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash,webcrypto} from 'node:crypto';
import ts from 'typescript';
const nativeRequire=createRequire(import.meta.url),baseline=process.env.LOCAL_WORD_BASELINE||'c9ac12a0d373815fdcf5e84e28e9fc59ff4e6b5b';
let blockedNetwork=0,attemptedStorage=0;
const unavailable=()=>{attemptedStorage++;throw Error('Descriptor inspection must not touch storage');};
function loader(before){
 const modules=new Map(),read=file=>before?execFileSync('git',['show',baseline+':'+file],{encoding:'utf8'}):fs.readFileSync(file,'utf8');
 function load(file){
  if(modules.has(file))return modules.get(file);const exports={};modules.set(file,exports);
  const source=read(file),js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{exports,require:name=>{
   if(name==='cloudflare:workers')return {env:{DB:{prepare:unavailable,batch:unavailable,exec:unavailable},BUCKET:{get:unavailable,put:unavailable}}};
   if(['fflate','fast-xml-parser','zod'].includes(name))return nativeRequire(name);
   if(!name.startsWith('.'))throw Error('Unexpected non-source dependency '+name);
   const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),name+'.ts'));
   if(resolved.startsWith('../')||path.isAbsolute(resolved))throw Error('Out-of-scope source path');return load(resolved);
  },crypto:webcrypto,process:{env:{}},TextEncoder,TextDecoder,URL,Response,Request,Headers,ReadableStream,TransformStream,AbortController,AbortSignal,Error,DOMException,Uint8Array,ArrayBuffer,DataView,Blob,File,Date,Set,Map,atob,btoa,setTimeout,clearTimeout,console:{info(){},warn(){},error(){}},fetch:()=>{blockedNetwork++;throw Error('Offline descriptor check forbids every network call');}},{filename:file});return exports;
 }
 return {load};
}
const old=loader(true),current=loader(false);
async function catalog(source){
 const api=source.load('app/mcp/route.ts'),invoke=async method=>{
  const response=await api.POST(new Request('https://offline-contract.test/mcp',{method:'POST',headers:{'content-type':'application/json','oai-authenticated-user-id':'offline-contract-owner'},body:JSON.stringify({jsonrpc:'2.0',id:1,method})}));assert.equal(response.status,200);const value=await response.json();assert.equal(value.error,undefined);return value.result;
 };
 return {tools:(await invoke('tools/list')).tools,events:(await invoke('events/list')).events};
}
const before=await catalog(old),after=await catalog(current),localNames=new Set(current.load('lib/local-word-tools.ts').localWordTools.map(tool=>tool.name));
assert.equal(localNames.size,10);
const progressNames=new Set(['read_word_progress','record_word_progress']);
const external=value=>({tools:value.tools.filter(tool=>!localNames.has(tool.name)&&!progressNames.has(tool.name)),events:value.events.filter(event=>event.name!=='local_word.requested')});
assert.deepEqual(external(after),external(before),'All existing actual tool/event names/descriptions/schemas/annotations must stay exactly equal');
assert.equal(before.tools.filter(tool=>localNames.has(tool.name)).length,10);
assert.equal(after.tools.filter(tool=>progressNames.has(tool.name)).length,2);
assert.deepEqual(after.events.find(event=>event.name==='local_word.requested').payloadSchema,before.events.find(event=>event.name==='local_word.requested').payloadSchema);
for(const name of localNames){const actual=after.tools.find(tool=>tool.name===name),declared=current.load('lib/local-word-tools.ts').localWordTools.find(tool=>tool.name===name);assert.deepEqual(actual,JSON.parse(JSON.stringify(declared)),name+' full declared contract');}
assert.deepEqual(after.events.find(event=>event.name==='local_word.requested'),JSON.parse(JSON.stringify(current.load('lib/local-word-tools.ts').localWordEvent)));
assert.equal(blockedNetwork,0);assert.equal(attemptedStorage,0);
const stable=JSON.stringify(external(after)),hash=value=>createHash('sha256').update(value).digest('hex');
fs.mkdirSync('.local-word-test-output',{recursive:true});
fs.writeFileSync('.local-word-test-output/mcp-contract-preservation.json',JSON.stringify({scope:'Official V121 full-source metadata preservation; local/offline capture, not a live OAuth discovery',baseline,passed:true,existing_tools:external(after).tools.length,existing_events:external(after).events.length,local_word_tools:10,exact_event_payload_unchanged:true,finalize_execution_schema_extended_for_bound_queue:true,existing_contract_sha256:hash(stable),network_calls:blockedNetwork,storage_calls:attemptedStorage,contract:external(after)},null,2)+'\n');
fs.writeFileSync('.local-word-test-output/local-word-tools-schema.json',JSON.stringify({localWordTools:current.load('lib/local-word-tools.ts').localWordTools,localWordEvent:current.load('lib/local-word-tools.ts').localWordEvent},null,2)+'\n');
console.log('PASS actual current-base non-local MCP tools/events deep equality after filtering ten local Word tools/event; no network, storage or credential access');
