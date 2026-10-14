// Offline source/read-only contract checks. No real host, CUA or platform action.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createHash,randomUUID} from 'node:crypto';
import {after,test} from 'node:test';
import {createSyntheticHarness} from './word-recovery-harness.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const h=createSyntheticHarness({projectRoot:process.cwd()}),load=h.loader();
const runtime=load('article-upload-runtime-source');
const {articleUploadRuntimeVersion:legacyVersion}=load('article-upload-runtime');
const {articleCall,articleTools}=load('article-tools');
const owner='synthetic-native-runtime-owner',id=randomUUID(),claim=randomUUID();
h.sql.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state,claim_token,claim_expires) VALUES(?,?,?,?,?,?,?,?,?,?)')
 .run(id,owner,'Synthetic native source title','synthetic.txt',`articles/${id}/source`,'["Synthetic native source title"]',new Date().toISOString(),'word_ready',claim,new Date(Date.now()+3600000).toISOString());
h.sql.prepare('INSERT INTO article_deliveries(id,owner,article_id,platform,state,updated) VALUES(?,?,?,?,?,?)')
 .run(`${id}:zhihu`,owner,id,'zhihu','needs_verification',new Date().toISOString());
const before=JSON.stringify({articles:h.sql.prepare('SELECT * FROM articles').all(),deliveries:h.sql.prepare('SELECT * FROM article_deliveries').all(),attempts:h.sql.prepare('SELECT * FROM article_upload_attempts').all()});
const writes={run:h.counts.run||0,batch:h.counts.batch||0};
const read=(runtimeModule,args={})=>articleCall(owner,'read_article_upload_runtime',{article_id:id,module:runtimeModule,expected_version:runtime.uploadRuntimeModuleVersion(runtimeModule),...args});
let routeSourceReads=0;
const route={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/articles/upload-runtime/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {exports:route,Response,URL,require:name=>{
  if(name.endsWith('/test-store'))return load('test-store'); // Actual unchanged owner helper.
  if(name.endsWith('/article-upload-runtime-source'))return {...runtime,currentUploadRuntimeSource:runtimeModule=>{routeSourceReads++;return runtime.currentUploadRuntimeSource(runtimeModule);}};
  throw Error('Unexpected route dependency');
 }});
after(()=>h.close());

test('the selected module controls its version and tool schema',()=>{
 assert.equal(runtime.nativeCoordinateVersion,'2026-10-11-native-step-host-3');
 assert.equal(runtime.nativeParentVersion,'2026-10-11-native-step-parent-3');
 assert.equal(legacyVersion,'2026-10-10-private-draft-executor-8');
 for(const runtimeModule of ['runner','bridge','native_coordinate','native_parent']){
  assert.equal(runtime.uploadRuntimeModule(runtimeModule),true);
  assert.equal(runtime.uploadRuntimeModuleVersion(runtimeModule),runtimeModule==='native_parent'?runtime.nativeParentVersion:runtimeModule==='native_coordinate'?runtime.nativeCoordinateVersion:legacyVersion);
 }
 for(const value of [null,undefined,'native',['native_parent'],{},42])assert.equal(runtime.uploadRuntimeModule(value),false);
 const definition=articleTools.find(value=>value.name==='read_article_upload_runtime');
 assert.deepEqual([...definition.inputSchema.properties.module.enum],['runner','bridge','native_coordinate','native_parent']);
 assert.equal(definition.annotations.readOnlyHint,true);
 assert.equal(definition.annotations.destructiveHint,false);
});

test('legacy complete runner and bridge keep V155 source identities',async()=>{
 const expected={runner:{sha256:'6a95b623fde7b0616a3dac7c959e42c01d0279b3cf93fafdb3b92ff12d754a2e',size:60952},bridge:{sha256:'ba3a71a68bf3dec6b6a706dda70fd65a4295799dfce9f3fc29c6bb5f71cfc328',size:46849}};
 for(const runtimeModule of Object.keys(expected)){
  const source=await runtime.currentUploadRuntimeSource(runtimeModule);
  assert.equal(source.sha256,expected[runtimeModule].sha256);
  assert.equal(source.size,expected[runtimeModule].size);
  assert.equal(digest(source.source),expected[runtimeModule].sha256);
 }
});

test('primary owner-scoped source is only the complete small native step actor',async()=>{
 const draft=load('article-draft-transfer'),contract=await draft.draftTransferContract();
 const source=await articleCall(owner,'read_article_delivery_executor',{article_id:id,expected_version:draft.draftTransferVersion});
 assert.equal(draft.draftTransferVersion,'2026-10-11-native-step-host-3');
 assert.equal(source.entrypoint,'createNativeStepSession');assert.equal(source.complete_program,true);
 assert.equal(source.version,contract.version);assert.equal(source.sha256,digest(source.source_text));
 assert.equal(source.size,Buffer.byteLength(source.source_text));assert.ok(source.size<=28000);
 assert.ok(Buffer.byteLength(JSON.stringify(source.source_text))<=64000);
 assert.equal(source.contains_parent_business,false);assert.equal(source.contains_private_baseline,false);
 assert.equal(source.complete_call_budget_verified,false);assert.equal(source.current_official_host_acceptance_required,true);
 assert.deepEqual([...contract.explicit_import_channels],['native_file_dialog']);
 assert.deepEqual([...contract.source.components],['native_action_ledger','native_step_session']);
 assert.equal(contract.source.actual_complete_call_budget.strict_max_utf8_bytes,64000);
 assert.equal(contract.source.source_packaging_budget.max_source_utf8_bytes,28000);
 assert.equal(contract.source.actual_complete_call_budget.planned_transport_reserve_utf8_bytes,8000);
 assert.equal(contract.source.actual_complete_call_budget.planned_transport_reserve_is_hard_limit,false);
 assert.equal(contract.source.source_packaging_budget.internal_budget_revision.previous_definition_failure.measured_utf8_bytes,24101);
 assert.equal(contract.source.source_packaging_budget.internal_budget_revision.previous_definition_failure.complete_call_budget_verified,false);
 assert.match(contract.interaction,/ready result ends the call -> parent checks cancellation\/current authority -> separate single physical commit/);
 assert.equal(contract.parent_source.module,'native_parent');assert.equal(contract.parent_source.version,runtime.nativeParentVersion);
 assert.equal(contract.parent_source.cua_submission_prohibited,true);
 assert.equal(contract.workflow_execution_environment,'authenticated_parent_memory_only');
 assert.deepEqual([...contract.host_methods],['inspectFile','readTab','readWindows','captureScreenshot','click','typeFilename']);
 assert.doesNotMatch(source.source_text,/createPrivateDraftTransfer|createParentImportGate|createParentNativeStepBridge|record_article_upload|record_article_delivery|claim_article|b\.paragraphs|authenticateCurrentChain|makeChooserCleanupState|createNativeCoordinateAdapter/);
 const context={URL,TextEncoder,Uint8Array,crypto};vm.createContext(context);vm.runInContext(source.source_text,context);
 assert.equal(context.createNativeStepSession.runtimeVersion,source.version);
 assert.equal(context.createPrivateDraftTransfer,undefined);assert.equal(context.createParentImportGate,undefined);
});

test('primary metadata-only source has no execution grant or parent source leak',async()=>{
 const draft=load('article-draft-transfer'),args={article_id:id,expected_version:draft.draftTransferVersion};
 const metadata=await articleCall(owner,'read_article_delivery_executor',{...args,metadata_only:true});
 assert.equal(metadata.source_text,undefined);assert.equal(metadata.execute_import,false);
 assert.equal(metadata.complete_call_budget_verified,false);
 assert.equal(metadata.source_packaging_budget.max_source_utf8_bytes,28000);
 assert.equal(metadata.actual_complete_call_budget.strict_max_utf8_bytes,64000);
 assert.equal(metadata.actual_complete_call_budget.component_max_utf8_bytes.adapter,20000);
 assert.equal(metadata.actual_complete_call_budget.component_max_utf8_bytes.initialization,8000);
 assert.equal(metadata.source_packaging_budget.internal_budget_revision.strict_limit_changed,false);
 await assert.rejects(articleCall('foreign-owner','read_article_delivery_executor',args));
 await assert.rejects(articleCall(owner,'read_article_delivery_executor',{...args,expected_version:runtime.nativeParentVersion}));
 await assert.rejects(articleCall(owner,'read_article_delivery_executor',{...args,expected_sha256:'0'.repeat(64)}));
 await assert.rejects(articleCall(owner,'read_article_delivery_executor',{...args,offset:0}));
 await assert.rejects(draft.readDraftTransferSource(id,{...args,[Symbol('hidden')]:true}));
});

for(const runtimeModule of ['native_coordinate','native_parent']){
 test(`${runtimeModule} returns one complete source with actual UTF-8 size and SHA`,async()=>{
  const value=await read(runtimeModule),source=await runtime.currentUploadRuntimeSource(runtimeModule);
  assert.equal(value.version,runtime.uploadRuntimeModuleVersion(runtimeModule));
  assert.equal(value.source_text,source.source);
  assert.equal(value.sha256,digest(value.source_text));
  assert.equal(value.size,Buffer.byteLength(value.source_text));
  assert.equal(value.total_characters,value.source_text.length);
  assert.equal(value.complete,true);assert.equal(value.complete_program,true);
  for(const field of ['offset','next_offset','chunk_sha256'])assert.equal(Object.hasOwn(value,field),false);
  assert.ok(value.size<=value.project_budget.max_source_utf8_bytes);
  assert.ok(Buffer.byteLength(JSON.stringify(value.source_text))<=value.project_budget.max_json_quoted_utf8_bytes);
  assert.doesNotMatch(value.source_text,/^\s*(?:import|export)\b/m);
  assert.doesNotThrow(()=>new vm.Script(value.source_text));
  for(const privateValue of [id,owner,claim])assert.equal(value.source_text.includes(privateValue),false);
 });

 test(`${runtimeModule} metadata and budget cannot claim host approval or readiness`,async()=>{
  const value=await read(runtimeModule,{metadata_only:true});
  assert.equal(value.metadata_only,true);assert.equal(Object.hasOwn(value,'source_text'),false);
  assert.equal(value.read_only,true);assert.equal(value.execute_import,false);
  assert.equal(value.cua_execution_authorized,false);assert.equal(value.complete_call_budget_verified,false);
  assert.equal(value.current_official_host_acceptance_required,true);assert.equal(value.source_is_not_approval,true);
  assert.equal(value.installed_or_platform_verified,false);
  assert.equal(value.parent_memory_only,runtimeModule==='native_parent');
  assert.equal(value.cua_submission_prohibited,runtimeModule==='native_parent');
  if(runtimeModule==='native_parent'){
   assert.equal(value.execution_environment,'authenticated_parent_memory_only');
   assert.equal(value.project_budget.max_source_utf8_bytes,262144);
   assert.equal(value.project_budget.max_json_quoted_utf8_bytes,270000);
   assert.match(value.instruction,/Never send this program, parent credentials, raw claims/);
  }else{
   assert.equal(value.project_budget.max_source_utf8_bytes,28000);
   assert.equal(value.project_budget.max_json_quoted_utf8_bytes,64000);
   assert.equal(value.project_budget.planned_transport_reserve_utf8_bytes,8000);
   assert.equal(value.project_budget.planned_transport_reserve_is_hard_limit,false);
   assert.equal(value.project_budget.internal_budget_revision.previous_definition_failure.limit_utf8_bytes,24000);
   assert.equal(value.project_budget.budget_kind,'definition_packaging_only');
   assert.match(value.instruction,/whole JSON tool request plus known wrapper must fit strict 64000/);
   assert.match(value.instruction,/measuring actual adapter, initialization and tool arguments in parent memory/);
   assert.equal(value.contains_parent_business,false);assert.equal(value.contains_private_baseline,false);
   assert.equal(value.second_execution_pipeline,false);
  }
 });

 test(`${runtimeModule} rejects execution fragments, mixed version/hash and unsupported fields`,async()=>{
  const source=await runtime.currentUploadRuntimeSource(runtimeModule);
  for(const args of [{offset:1,expected_sha256:source.sha256},{metadata_only:true,offset:1,expected_sha256:source.sha256},
   {offset:-1},{offset:0.5},{offset:NaN},{expected_version:legacyVersion},{expected_sha256:'0'.repeat(64)},
   {metadata_only:'true'},{execute_import:true},{[Symbol('hidden')]:true}])await assert.rejects(read(runtimeModule,args));
  assert.equal((await read(runtimeModule,{offset:0,expected_sha256:source.sha256})).sha256,source.sha256);
  await assert.rejects(articleCall('foreign-owner','read_article_upload_runtime',{article_id:id,module:runtimeModule,expected_version:runtime.uploadRuntimeModuleVersion(runtimeModule)}));
  await assert.rejects(articleCall('','read_article_upload_runtime',{article_id:id,module:runtimeModule,expected_version:runtime.uploadRuntimeModuleVersion(runtimeModule)}));
  await assert.rejects(read(runtimeModule,{expected_version:runtimeModule==='native_parent'?runtime.nativeCoordinateVersion:runtime.nativeParentVersion}));
  await assert.rejects(read(runtimeModule,{article_id:randomUUID()}));
 });

 test(`${runtimeModule} defines entrypoints offline without any host or network action`,async()=>{
  const value=await read(runtimeModule);let network=0;
  const context={URL,TextEncoder,TextDecoder,Uint8Array,crypto,fetch:()=>{network++;throw Error('Definition source cannot act');}};
  vm.createContext(context);vm.runInContext(value.source_text,context);
  for(const name of value.entrypoints){assert.equal(typeof context[name],'function');assert.equal(context[name].runtimeVersion,runtime.uploadRuntimeModuleVersion(runtimeModule));}
  if(runtimeModule==='native_coordinate'){
   assert.equal(typeof context.createNativeStepSession,'function');
   for(const name of ['createPrivateDraftTransfer','createParentImportGate','createParentNativeStepBridge','createNativeCoordinateAdapter','createChooserCleanupAdapter','measureCompleteCallBudget'])assert.equal(context[name],undefined);
   assert.doesNotMatch(value.source_text,/record_article_upload|record_article_delivery|claim_article|b\.paragraphs|authenticateCurrentChain|model_visual_callback/);
  }
  assert.equal(network,0);
 });
}

test('native descriptors are separate from unchanged legacy contract modules',async()=>{
 const contract=await runtime.currentUploadRuntimeContract();
 assert.deepEqual(Object.keys(contract.modules),['runner','bridge']);
 assert.equal(contract.picker_selection.default_by_platform.toutiao,'browser');
 assert.equal(contract.picker_selection.default_by_platform.zhihu,'native');
 assert.deepEqual(Object.keys(contract.native_source_modules),['native_coordinate','native_parent']);
 for(const runtimeModule of Object.keys(contract.native_source_modules)){
  const descriptor=contract.native_source_modules[runtimeModule],source=await runtime.currentUploadRuntimeSource(runtimeModule);
  assert.equal(descriptor.sha256,source.sha256);assert.equal(descriptor.size,source.size);
  assert.equal(descriptor.version,runtime.uploadRuntimeModuleVersion(runtimeModule));
  assert.equal(descriptor.complete_program,true);assert.equal(descriptor.read_only,true);assert.equal(descriptor.execute_import,false);
  assert.equal(descriptor.complete_call_budget_verified,false);assert.equal(descriptor.current_official_host_acceptance_required,true);
  assert.equal(descriptor.cua_submission_prohibited,runtimeModule==='native_parent');
 }
});

test('HTTP source route preserves actual owner guard before reading any source',async()=>{
 const startingReads=routeSourceReads;
 for(const headers of [{},{'oai-authenticated-user-id':''},{authorization:'Bearer synthetic'}]){
  const response=await route.GET(new Request('https://example.test/api/articles/upload-runtime?module=native_parent',{headers}));
  assert.equal(response.status,401);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 }
 for(const runtimeModule of ['', 'unknown'])assert.equal((await route.GET(new Request('https://example.test/api/articles/upload-runtime?module='+runtimeModule,{headers:{'oai-authenticated-user-id':owner}}))).status,400);
 assert.equal(routeSourceReads,startingReads);
});

test('owner HTTP downloads match each complete module and selected version exactly',async()=>{
 for(const runtimeModule of ['runner','bridge','native_coordinate','native_parent']){
  const source=await runtime.currentUploadRuntimeSource(runtimeModule),response=await route.GET(new Request('https://example.test/api/articles/upload-runtime?module='+runtimeModule,{headers:{'oai-authenticated-user-id':owner}}));
  assert.equal(response.status,200);assert.equal(await response.text(),source.source);
  assert.equal(response.headers.get('X-Haoduoyu-Upload-Source-SHA256'),source.sha256);
  assert.equal(response.headers.get('X-Haoduoyu-Upload-Runtime-Version'),runtime.uploadRuntimeModuleVersion(runtimeModule));
  assert.equal(response.headers.get('Content-Type'),'application/javascript; charset=utf-8');
  assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
  if(runtimeModule.startsWith('native_')){
   assert.equal(response.headers.get('X-Haoduoyu-Complete-Call-Budget-Verified'),'false');
   assert.equal(response.headers.get('X-Haoduoyu-Host-Acceptance-Required'),'true');
   assert.equal(response.headers.get('X-Haoduoyu-Source-Environment'),runtimeModule==='native_parent'?'parent-memory-only':'documented-host-review-required');
  }else assert.equal(response.headers.get('X-Haoduoyu-Complete-Call-Budget-Verified'),null);
 }
});

test('source compiler refuses static dependencies and oversized complete programs',()=>{
 const raw=fs.readFileSync('scripts/browser-upload/coordinate/host-program.mjs','utf8');
 assert.throws(()=>runtime.nativeCoordinateSource('native_coordinate','import missing from "missing";\n'+raw),/complete standalone/);
 assert.throws(()=>runtime.nativeCoordinateSource('native_coordinate',raw+'\n/*'+'x'.repeat(100000)+'*/'),/complete-program source budget/);
 assert.throws(()=>runtime.nativeCoordinateSource('native_parent',raw+'\n/*'+'x'.repeat(262144)+'*/'),/complete-program source budget/);
 const quotedOversize='function createNativeStepSession(){}\n/*'+'\\'.repeat(30000)+'*/';
 assert.ok(Buffer.byteLength(quotedOversize)>28000);
 assert.throws(()=>runtime.nativeCoordinateSource('native_coordinate',quotedOversize),/complete-program source budget/);
});

test('all source reads leave article, delivery, attempts and objects unchanged',()=>{
 assert.equal(JSON.stringify({articles:h.sql.prepare('SELECT * FROM articles').all(),deliveries:h.sql.prepare('SELECT * FROM article_deliveries').all(),attempts:h.sql.prepare('SELECT * FROM article_upload_attempts').all()}),before);
 assert.equal(h.counts.run||0,writes.run);assert.equal(h.counts.batch||0,writes.batch);
 for(const operation of ['bucket.get','bucket.head','bucket.put'])assert.equal(h.counts[operation]||0,0);
 assert.equal(h.externalCalls,0);
});
