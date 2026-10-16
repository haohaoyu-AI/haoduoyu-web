// Execute the actual, otherwise dependency-free source assembly function.
// No TypeScript compiler, browser, tool bridge, article or platform action runs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';

const contractSource=fs.readFileSync('lib/article-upload-runtime.ts','utf8');
const version=/export const articleUploadRuntimeVersion='([^']+)';/.exec(contractSource)?.[1];
assert.equal(version,'2026-10-10-private-draft-executor-8');
assert.match(contractSource,/contract_version:7,/);
const declaration="export function uploadRuntimeSource(module:'runner'|'bridge',sources:{runner:string;bridge:string;host:string;errors:string})";
const start=contractSource.indexOf(declaration);
assert.ok(start>0,'Actual source assembly signature must be reviewed if changed');
const actualAssembly=contractSource.replace(/^export const /gm,'const ').replace(declaration,'function uploadRuntimeSource(module,sources)');
const assemblyScope={TextEncoder};
vm.runInNewContext(`${actualAssembly}\nglobalThis.assemble=uploadRuntimeSource;globalThis.contract=articleUploadRuntime;`,assemblyScope);
assert.equal(assemblyScope.contract.native_file_picker.continuation_api.pending_status,'native_pending');
assert.equal(assemblyScope.contract.native_file_picker.continuation_api.resume,'resumeNative');
assert.equal(assemblyScope.contract.native_file_picker.continuation_api.settle_closed,'settleNative');
assert.equal(assemblyScope.contract.picker_selection.default_by_platform.toutiao,'browser');
assert.equal(assemblyScope.contract.picker_selection.default_by_platform.zhihu,'native');
assert.equal(assemblyScope.contract.picker_selection.method_by_platform.toutiao,'codex');
assert.equal(assemblyScope.contract.picker_selection.method_by_platform.zhihu,'coordinate');
assert.equal(assemblyScope.contract.native_file_picker.coordinate_contract,'screenshot-single-click-open-v1');
assert.deepEqual(Array.from(assemblyScope.contract.picker_selection.explicit_picker_mode_compatibility.values),['native','browser']);
assert.equal(assemblyScope.contract.picker_selection.explicit_picker_mode_compatibility.requires_explicit_mode,true);
assert.equal(assemblyScope.contract.picker_selection.explicit_picker_mode_compatibility.named_method,false);
assert.equal(assemblyScope.contract.picker_selection.explicit_picker_mode_compatibility.automatic_fallback,false);
const read=name=>fs.readFileSync('scripts/browser-upload/'+name,'utf8');
const sources={runner:read('private-draft-executor.mjs'),bridge:read('bridge.mjs'),host:read('tool-host.mjs'),errors:read('public-errors.mjs')};
let networkCalls=0;
const digest=value=>createHash('sha256').update(value).digest('hex');
const report={version,contract_version:7,modules:{},definition_load_network_calls:0,real_platform_calls:0};
assert.equal(assemblyScope.contract.modules.runner.entrypoint,'createPrivateDraftExecutor');
assert.equal(assemblyScope.contract.execution_contract.project_budget.max_source_utf8_bytes,61000);
assert.equal(assemblyScope.contract.execution_contract.project_budget.max_json_quoted_utf8_bytes,62000);
const independentDefinitions='function createPrivateDraftExecutor(){}\nfunction createZhihuAccountReader(){}\n';
const tooLargeSource=independentDefinitions+'//'+ 'x'.repeat(61001)+'\n';
assert.ok(Buffer.byteLength(tooLargeSource)>61000);
assert.ok(Buffer.byteLength(JSON.stringify(tooLargeSource))<62000,'The source-budget regression must stay below the quote budget');
assert.throws(()=>assemblyScope.assemble('runner',{...sources,runner:tooLargeSource}),/complete-call source budget/);
const tooLargeQuoted=independentDefinitions+'//'+ '\\'.repeat(32000)+'\n';
assert.ok(Buffer.byteLength(tooLargeQuoted)<61000,'The quote-budget regression must be below the source budget');
assert.ok(Buffer.byteLength(JSON.stringify(tooLargeQuoted))>62000);
assert.throws(()=>assemblyScope.assemble('runner',{...sources,runner:tooLargeQuoted}),/complete-call source budget/);
const fixtureSource=runner=>assemblyScope.assemble('runner',{...sources,runner});
const baseSource=independentDefinitions+'//';
const atSourceLimit=baseSource+'x'.repeat(61000-Buffer.byteLength(fixtureSource(baseSource)));
assert.equal(Buffer.byteLength(fixtureSource(atSourceLimit)),61000);
assert.throws(()=>fixtureSource(atSourceLimit+'x'),/complete-call source budget/);
const baseQuoted=independentDefinitions+'//'+ '\\'.repeat(30000);
const atQuoteLimit=baseQuoted+'x'.repeat(62000-Buffer.byteLength(JSON.stringify(fixtureSource(baseQuoted))));
assert.equal(Buffer.byteLength(JSON.stringify(fixtureSource(atQuoteLimit))),62000);
assert.ok(Buffer.byteLength(fixtureSource(atQuoteLimit))<61000);
assert.throws(()=>fixtureSource(atQuoteLimit+'x'),/complete-call source budget/);
assert.equal(networkCalls,0,'Refused definitions never run or trigger any action');
for(const module of ['runner','bridge']){
  const source=assemblyScope.assemble(module,sources);
  assert.ok(Buffer.byteLength(source)<=61000);
  assert.ok(Buffer.byteLength(JSON.stringify(source))<=62000);
  const definitionCallWire=JSON.stringify({code:source});
  assert.ok(Buffer.byteLength(definitionCallWire)<64000,'The complete definition-call JSON must be below the actual tool limit');
  assert.doesNotMatch(source,/^import |^export /m);
  const scope={URL,TextEncoder,Uint8Array,crypto:webcrypto,fetch:()=>{networkCalls++;throw Error('Definition loading must not call the network');}};
  vm.runInNewContext(source,scope);
  const entries=module==='runner'?['createPrivateDraftExecutor','createZhihuAccountReader']:['createUploadToolCall','createArticleUploadHost','createArticleUploadBridge'];
  for(const entry of entries){assert.equal(typeof scope[entry],'function');assert.equal(scope[entry].runtimeVersion,version);}
  if(module==='runner'){
    assert.equal(scope.createDraftUploadRuntime,undefined,'The independent source cannot load the rejected legacy implementation');
    const runtime=scope.createPrivateDraftExecutor({browser:{}});
    assert.equal(typeof runtime.resumeNative,'function');assert.equal(typeof runtime.settleNative,'function');assert.equal(typeof runtime.diagnostic,'function');
    assert.equal(runtime.native_protocol_version,2);
    for(const [platform,target_account] of [['toutiao','61556093362'],['zhihu','ren-zhe-ai-chi-yu-52']]){
      const input={article_id:'assembly-'+platform,platform,target_account,browser_session:'assembly-browser',executor_id:'assembly-executor',word_sha256:'a'.repeat(64),word_size:123,baseline:{title:'offline assembly',paragraphs:['unchanged'],images:[]},ui:{}};
      const normal=runtime.createSession(input);
      assert.equal(normal.picker_mode,platform==='toutiao'?'browser':'native');
      assert.equal(normal.upload_method,platform==='toutiao'?'codex':'coordinate');
      for(const picker_mode of ['native','browser']){
        const explicit=runtime.createSession({...input,article_id:input.article_id+'-'+picker_mode,picker_mode});
        assert.equal(explicit.picker_mode,picker_mode);assert.equal(explicit.upload_method,null);
      }
    }
  }
  const chunks=[];
  for(let offset=0;offset<source.length;){
    let end=Math.min(offset+24000,source.length);
    if(end<source.length&&/[\uD800-\uDBFF]/.test(source[end-1])&&/[\uDC00-\uDFFF]/.test(source[end]))end++;
    const text=source.slice(offset,end);chunks.push({text,sha256:digest(text)});offset=end;
  }
  assert.equal(chunks.map(chunk=>chunk.text).join(''),source);
  for(const chunk of chunks)assert.equal(digest(chunk.text),chunk.sha256);
  report.modules[module]={size:Buffer.byteLength(source),json_quoted_size:Buffer.byteLength(JSON.stringify(source)),definition_call_wire_size:Buffer.byteLength(definitionCallWire),sha256:digest(source),chunks:chunks.length};
}
assert.equal(networkCalls,0);
const jointScope={URL,TextEncoder,Uint8Array,crypto:webcrypto,fetch:()=>{networkCalls++;throw Error('No pair-load network action');}};
const freshRunner=assemblyScope.assemble('runner',sources),freshBridge=assemblyScope.assemble('bridge',sources);
vm.runInNewContext(freshRunner+'\n'+freshBridge,jointScope);
assert.equal(jointScope.createPrivateDraftExecutor.runtimeVersion,jointScope.createArticleUploadBridge.runtimeVersion);
assert.equal(jointScope.createPrivateDraftExecutor.runtimeVersion,version);
const previousVersion='2026-10-10-private-draft-executor-7';
const previousBridge=freshBridge.replaceAll(JSON.stringify(version),JSON.stringify(previousVersion));
const previousScope={URL,TextEncoder,Uint8Array,crypto:webcrypto,fetch:()=>{networkCalls++;throw Error('Stale bridge loading must not perform an action');}};
vm.runInNewContext(previousBridge,previousScope);
assert.equal(previousScope.createArticleUploadBridge.runtimeVersion,previousVersion);
assert.equal(digest(previousBridge),'9e10aa2a582c626d0f48cbd2af476a6cc98e33627644bc0f51fa3bf990ef3209');
assert.notEqual(digest(previousBridge),report.modules.bridge.sha256,'The previously loaded bridge SHA is not the fresh pair');
assert.notEqual(previousScope.createArticleUploadBridge.runtimeVersion,version,'A stale bridge version cannot match the new runner');
assert.equal(networkCalls,0);
console.log('PASS actual local standalone assembly, entrypoint versions, UTF-8 size and full/chunk hashes; definitions load without actions');
console.log(JSON.stringify(report));
