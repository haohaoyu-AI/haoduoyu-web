// Actual owner-scoped articleCall and HTTP route, synthetic SQLite only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createHash,randomUUID} from 'node:crypto';
import {createSyntheticHarness} from './word-recovery-harness.mjs';
const digest=text=>createHash('sha256').update(text).digest('hex');
const h=createSyntheticHarness({projectRoot:process.cwd()}),load=h.loader();
const {articleCall,articleTools}=load('article-tools');
const runtime=load('article-upload-runtime-source'),{articleUploadRuntimeVersion:version}=load('article-upload-runtime');
const owner='synthetic-runtime-owner',id=randomUUID(),claim=randomUUID();
h.sql.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state,claim_token,claim_expires) VALUES(?,?,?,?,?,?,?,?,?,?)')
 .run(id,owner,'Synthetic title','synthetic.txt',`articles/${id}/source`,'["Synthetic title"]',new Date().toISOString(),'word_ready',claim,new Date(Date.now()+3600000).toISOString());
h.sql.prepare('INSERT INTO article_deliveries(id,owner,article_id,platform,state,updated) VALUES(?,?,?,?,?,?)')
 .run(`${id}:zhihu`,owner,id,'zhihu','needs_verification',new Date().toISOString());
const read=args=>articleCall(owner,'read_article_upload_runtime',{article_id:id,expected_version:version,...args});
const before=JSON.stringify(h.sql.prepare('SELECT * FROM articles').all()),writes={run:h.counts.run||0,batch:h.counts.batch||0};
const definition=articleTools.find(tool=>tool.name==='read_article_upload_runtime');
assert.equal(definition.annotations.readOnlyHint,true);
assert.equal(definition.annotations.destructiveHint,false);
assert.deepEqual([...definition.inputSchema.properties.module.enum],['runner','bridge','native_coordinate','native_parent']);
assert.match(definition.inputSchema.properties.expected_version.description,/selected module/);
assert.match(definition.description,/native_parent.*must never enter CUA/);
const handoffDefinition=articleTools.find(tool=>tool.name==='read_article_handoff');
assert.match(handoffDefinition.description,/Both Toutiao and Zhihu use 坐标法 \(coordinate\/native\)/);
assert.match(handoffDefinition.description,/host_transfer primary contract/);
assert.match(handoffDefinition.description,/never silently change a channel or fall back after rejection/);
assert.doesNotMatch(handoffDefinition.description,/Prefer the real native/);

// Load the actual route with the same actual compiled source module.
const routeExports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/articles/upload-runtime/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {exports:routeExports,Response,URL,require:name=>name.endsWith('/test-store')?{owner:request=>request.headers.get('oai-authenticated-user-id')}:name.endsWith('/article-upload-runtime-source')?runtime:load('article-upload-runtime')});
try{
 const contract=await runtime.currentUploadRuntimeContract();
 assert.equal(version,'2026-10-10-private-draft-executor-8');
 assert.equal(contract.contract_version,7);
 assert.equal(contract.modules.runner.entrypoint,'createPrivateDraftExecutor');
 assert.equal(contract.source_transport.preferred,'authenticated_mcp');
 const handoff=await articleCall(owner,'read_article_handoff',{article_id:id});
 assert.equal(handoff.execute_import,false);
 assert.equal(handoff.draft_delivery.private_only,true);
 assert.equal(handoff.draft_delivery.reuse_final_word,true);
 for(const key of ['generate_images','public_publish','scheduled_publish','edit_or_delete_user_drafts'])assert.equal(handoff.draft_delivery[key],false);
 assert.equal(handoff.destinations.find(item=>item.platform==='toutiao').state,'word_ready');
 assert.equal(handoff.destinations.find(item=>item.platform==='toutiao').upload_method,'coordinate');
 assert.equal(handoff.destinations.find(item=>item.platform==='toutiao').picker_mode,'native');
 assert.equal(handoff.destinations.find(item=>item.platform==='zhihu').state,'needs_verification');
 assert.equal(handoff.destinations.find(item=>item.platform==='zhihu').upload_method,'coordinate');
 assert.equal(handoff.destinations.find(item=>item.platform==='zhihu').picker_mode,'native');
 assert.equal(handoff.browser_preflight.picker.default_by_platform.toutiao,'native');
 assert.equal(handoff.browser_preflight.picker.default_by_platform.zhihu,'native');
 assert.equal(handoff.browser_preflight.picker.explicit_picker_mode_compatibility.requires_explicit_mode,true);
 assert.equal(handoff.browser_preflight.picker.explicit_picker_mode_compatibility.automatic_fallback,false);
 assert.equal(handoff.browser_preflight.browser_picker.method,'codex');
 assert.equal(handoff.browser_preflight.browser_picker.compatibility_only,true);
 assert.equal(handoff.browser_preflight.browser_picker.recommended_for_normal_first_import,false);
 assert.equal(handoff.browser_preflight.native_picker.method,'coordinate');
 assert.equal(handoff.upload_runtime.compatibility_only,true);
 assert.equal(handoff.upload_runtime.recommended_for_normal_first_import,false);
 assert.equal(handoff.upload_runtime.picker_selection.default_by_platform.toutiao,'browser','legacy runtime default must remain truthful');
 assert.equal(handoff.upload_coordination.toutiao_normal_first_import,'host_transfer');
 assert.equal(handoff.upload_coordination.zhihu_normal_first_import,'host_transfer');
 assert.equal(handoff.upload_coordination.automatic_fallback,false);
 assert.match(handoff.upload_protocol,/Unknown outcomes are read-only/);
 let networkCalls=0;
 for(const runtimeModule of ['runner','bridge']){
  const metadata=await read({module:runtimeModule,metadata_only:true});
  assert.equal(metadata.metadata_only,true);assert.equal(metadata.read_only,true);assert.equal(metadata.execute_import,false);
  assert.equal(metadata.source_text,undefined);assert.equal(metadata.version,version);
  assert.equal(metadata.entrypoint,runtimeModule==='runner'?'createPrivateDraftExecutor':'createArticleUploadBridge');
  assert.equal(metadata.sha256,contract.modules[runtimeModule].sha256);assert.equal(metadata.size,contract.modules[runtimeModule].size);
  let offset=0,source='',pages=0;
  do{
   const chunk=await read({module:runtimeModule,offset,...(offset?{expected_sha256:metadata.sha256}:{})});
   assert.equal(chunk.offset,offset);assert.equal(chunk.sha256,metadata.sha256);assert.equal(chunk.version,version);
   assert.equal(chunk.entrypoint,metadata.entrypoint);
   assert.equal(chunk.source_format,'standalone_js');assert.equal(chunk.read_only,true);
   assert.equal(digest(chunk.source_text),chunk.chunk_sha256);assert.equal(chunk.execute_import,false);
   assert.ok(chunk.source_text.length<=runtime.uploadRuntimeChunkCharacters+1);
   source+=chunk.source_text;pages++;
   if(chunk.complete){assert.equal(chunk.next_offset,null);break;}
   assert.ok(chunk.next_offset>offset);offset=chunk.next_offset;
  }while(pages<20);
  assert.ok(pages>1&&pages<20);assert.equal(digest(source),metadata.sha256);assert.equal(Buffer.byteLength(source),metadata.size);
  assert.ok(Buffer.byteLength(source)<=61000);assert.ok(Buffer.byteLength(JSON.stringify(source))<=62000);
  assert.ok(Buffer.byteLength(JSON.stringify({code:source}))<64000);
  const http=await routeExports.GET(new Request('https://example.test/api/articles/upload-runtime?module='+runtimeModule,{headers:{'oai-authenticated-user-id':owner}}));
  assert.equal(http.status,200);assert.equal(await http.text(),source);assert.equal(http.headers.get('X-Haoduoyu-Upload-Source-SHA256'),metadata.sha256);
  assert.doesNotMatch(source,/^import |^export /m);assert.ok(!source.includes(claim));
  const context={URL,TextEncoder,Uint8Array,crypto,fetch:()=>{networkCalls++;throw Error('No definition-load network action');}};
  vm.createContext(context);vm.runInContext(source,context);
  assert.equal(context[metadata.entrypoint].runtimeVersion,version);
  if(runtimeModule==='runner')assert.equal(context.createDraftUploadRuntime,undefined);
 }
 assert.equal(networkCalls,0);
 console.log('PASS actual owner-scoped MCP source metadata/chunks, exact HTTP equality and full/chunk hashes, standalone definition loading without any network or platform action');

 for(const args of [{module:'unknown'},{module:['runner']},{module:'runner',expected_version:'stale'},
  {module:'runner',offset:-1},{module:'runner',offset:0.5},{module:'runner',offset:1048577},
  {module:'runner',offset:1},{module:'runner',offset:1,expected_sha256:'0'.repeat(64)},
  {module:'runner',metadata_only:true,offset:1,expected_sha256:contract.modules.runner.sha256},
  {module:'runner',metadata_only:'true'},{module:'runner',execute_import:true}])await assert.rejects(read(args));
 await assert.rejects(articleCall('synthetic-other-owner','read_article_upload_runtime',{article_id:id,module:'runner',expected_version:version}));
 await assert.rejects(articleCall('','read_article_upload_runtime',{article_id:id,module:'runner',expected_version:version}));
 await assert.rejects(read({article_id:randomUUID(),module:'runner'}));
 assert.equal(JSON.stringify(h.sql.prepare('SELECT * FROM articles').all()),before);
 assert.equal(h.counts.run||0,writes.run);assert.equal(h.counts.batch||0,writes.batch);
 assert.equal(h.counts['bucket.get']||0,0);assert.equal(h.counts['bucket.head']||0,0);assert.equal(h.counts['bucket.put']||0,0);
 assert.equal(h.sql.prepare('SELECT count(*) count FROM article_upload_attempts').get().count,0);
 assert.equal(h.sql.prepare('SELECT count(*) count FROM article_deliveries').get().count,1);
 assert.equal(h.externalCalls,0);
 console.log('PASS foreign/missing owner, stale/mixed version and digest, invalid offsets/modules/fields rejected; no claims, deliveries, attempts, R2 reads/writes or execution grants changed');
}finally{h.close();}
