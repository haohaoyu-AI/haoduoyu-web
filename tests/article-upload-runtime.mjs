import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import nodePath from 'node:path';
import ts from 'typescript';
import {createHash} from 'node:crypto';

const modules={};
function load(path){
 if(modules[path])return modules[path];
 const exports={};modules[path]=exports;
 const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{exports,require:name=>{
  if(name.endsWith('?raw'))return {__esModule:true,default:fs.readFileSync(nodePath.resolve(nodePath.dirname(path),name.slice(0,-4)),'utf8')};
  if(name.endsWith('/test-store'))return {owner:request=>request.headers.get('oai-authenticated-user-id')};
  if(name==='./article-upload-runtime'||name.endsWith('/article-upload-runtime'))return load('lib/article-upload-runtime.ts');
  if(name==='./article-draft-transfer')return load('lib/article-draft-transfer.ts');
  if(name.endsWith('/complete-call-budget.js'))return load('scripts/browser-upload/coordinate/src/complete-call-budget.js');
  if(name.endsWith('/article-upload-runtime-source')||name==='./article-upload-runtime-source')return load('lib/article-upload-runtime-source.ts');
  throw Error('Unexpected runtime source dependency');
 },Response,Request,URL,TextEncoder,Uint8Array,crypto});
 return exports;
}
const {GET}=load('app/api/articles/upload-runtime/route.ts');
const {articleUploadRuntime:contract,articleUploadRuntimeVersion:version}=load('lib/article-upload-runtime.ts');
assert.equal(contract.execute_import,false);
assert.equal(version,'2026-10-10-private-draft-executor-8');
assert.equal(contract.contract_version,7);
assert.equal(contract.modules.runner.entrypoint,'createPrivateDraftExecutor');
assert.equal(contract.modules.runner.implementation,'independent_normal_private_draft_fsm_v1');
assert.equal(contract.execution_contract.project_budget.max_source_utf8_bytes,61000);
assert.equal(contract.execution_contract.project_budget.max_json_quoted_utf8_bytes,62000);
assert.equal(contract.execution_contract.project_budget.reserved_call_utf8_bytes,2000);
assert.match(contract.execution_contract.loading,/One complete readable definition program/);
assert.match(contract.execution_contract.approval,/do not prove approval or browser\/native capability/);
assert.equal(contract.picker_selection.immutable_after_session_creation,true);
assert.deepEqual(JSON.parse(JSON.stringify(contract.picker_selection.default_by_platform)),{toutiao:'browser',zhihu:'native'});
assert.deepEqual(JSON.parse(JSON.stringify(contract.picker_selection.method_by_platform)),{toutiao:'codex',zhihu:'coordinate'});
assert.deepEqual(JSON.parse(JSON.stringify(contract.picker_selection.explicit_picker_mode_compatibility.values)),['native','browser']);
assert.equal(contract.picker_selection.explicit_picker_mode_compatibility.requires_explicit_mode,true);
assert.equal(contract.picker_selection.explicit_picker_mode_compatibility.named_method,false);
assert.equal(contract.picker_selection.explicit_picker_mode_compatibility.automatic_fallback,false);
assert.equal(contract.picker_selection.preferred_when_supported,undefined);
assert.equal(contract.destinations.toutiao.method_name,'Codex 法');
assert.equal(contract.destinations.toutiao.picker_mode,'browser');
assert.equal(contract.destinations.zhihu.method_name,'坐标法');
assert.equal(contract.destinations.zhihu.picker_mode,'native');
assert.equal(contract.browser_file_picker.platform,'toutiao');
assert.match(contract.browser_file_picker.prepare,/wait first/);
assert.equal(contract.native_file_picker.platform,'zhihu');
assert.equal(contract.native_file_picker.coordinate_contract,'screenshot-single-click-open-v1');
assert.equal(contract.destinations.zhihu.import_stages.join(','),'menu,dialog,file');
assert.equal((await GET(new Request('https://example.com/api/articles/upload-runtime?module=runner'))).status,401);
const headers={'oai-authenticated-user-id':'synthetic-owner'};
assert.equal((await GET(new Request('https://example.com/api/articles/upload-runtime?module=unknown',{headers}))).status,400);
let calls=0;
for(const runtimeModule of ['runner','bridge']){
 const response=await GET(new Request('https://example.com'+contract.modules[runtimeModule].download_path,{headers}));
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 assert.equal(response.headers.get('X-Haoduoyu-Upload-Runtime-Version'),version);
 const source=await response.text();
 assert.ok(Buffer.byteLength(source)<=61000,'Complete source must meet the project budget');
 assert.ok(Buffer.byteLength(JSON.stringify(source))<=62000,'The entire JSON-quoted program must meet the reserved-call budget');
 assert.ok(Buffer.byteLength(JSON.stringify({code:source}))<64000,'The complete documented definition-call JSON must remain below the actual limit');
 assert.equal(response.headers.get('X-Haoduoyu-Upload-Source-SHA256'),createHash('sha256').update(source).digest('hex'));
 assert.doesNotMatch(source,/^import |^export /m);
 const context={URL,TextEncoder,Uint8Array,crypto,fetch:()=>{calls++;throw Error('Runtime loading cannot make network calls');}};
 vm.createContext(context);vm.runInContext(source,context);
 const entrypoint=context[contract.modules[runtimeModule].entrypoint];
 assert.equal(typeof entrypoint,'function');assert.equal(entrypoint.runtimeVersion,version);
 if(runtimeModule==='bridge'){
  assert.equal(typeof context.createUploadToolCall,'function');
  assert.equal(typeof context.createArticleUploadHost,'function');
  assert.equal(context.createUploadToolCall.runtimeVersion,version);
 }else{
  assert.equal(typeof context.createPrivateDraftExecutor,'function');
  assert.equal(context.createDraftUploadRuntime,undefined,'The new independent definition cannot include the rejected legacy runner');
  assert.equal(typeof context.createZhihuAccountReader,'function');
  assert.equal(context.createZhihuAccountReader.runtimeVersion,version);
 }
}
assert.equal(calls,0);
console.log('PASS authenticated standalone runner/host+bridge downloads: matching version/SHA, missing auth and unknown module refused, loading invokes no platform or network action.');
