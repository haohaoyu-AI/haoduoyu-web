// Real HTTP route, MCP route and tool dispatch; synthetic backend only, no live mutation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const owner='SYNTHETIC-OWNER',operation='00000000-0000-4000-8000-000000000099',key='00000000-0000-4000-8000-000000000100',id='00000000-0000-4000-8000-000000000001';
const value={operation_id:operation,owner,scope:'all_articles',state:'previewed',snapshot_sha256:'a'.repeat(64),count:1,items:[{article_id:id}]};
const payload={operation_id:operation,confirm_owner:owner,confirm_scope:'all_articles',confirm_ids:[id],snapshot_sha256:value.snapshot_sha256,confirm_permanent:true};
const cleanupNames=['preview_all_article_deletion','read_all_article_deletion','delete_all_articles_permanently'];
const endNames=['read_deleted_article_executor_end','record_deleted_article_executor_end'];
const abandonName='abandon_article_deletion_preview';
// Credentials are fixed synthetic test strings; this fixture is not end or mapping evidence.
const wordEnd={article_id:id,operation_id:operation,request_key:key,claim_token:'synthetic-original-claim',input_sha256:'b'.repeat(64),execution_id:'00000000-0000-4000-8000-000000000010',execution_token:'synthetic-original-word-token',epoch:2,grant_request_key:'00000000-0000-4000-8000-000000000011',evidence_kind:'holder_acknowledgement',confirm_all_actions_stopped:true,confirm_all_actions_settled:true,end_reference:'synthetic original holder actual end',settled_reference:'synthetic original holder settled actions'};
const manualEnd={...wordEnd,original_acquisition_request_key:'00000000-0000-4000-8000-000000000012'};delete manualEnd.execution_token;delete manualEnd.epoch;delete manualEnd.grant_request_key;
const endValue={article_id:id,operation_id:operation,holder_acknowledged:true,server_verified:false,end_reference_sha256:'c'.repeat(64),settled_reference_sha256:'d'.repeat(64),new_execution_grant:false};
class ArticleDeletionError extends Error{constructor(message,status=409){super(message);this.status=status;}}
const calls=[],queries=[];let error=null;
// Execute the exact abandon CAS against isolated SQLite, without article content or production storage.
const previewDb=new DatabaseSync(':memory:');previewDb.exec("CREATE TABLE article_list_deletions(id TEXT PRIMARY KEY,owner TEXT,scope TEXT,state TEXT,confirmed_at TEXT,lock_token TEXT,request_key TEXT)");
previewDb.prepare("INSERT INTO article_list_deletions(id,owner,scope,state,request_key) VALUES(?,?,'all_articles','previewed',?)").run(operation,owner,key);let readPreviewState=false;
const backend={
 previewArticleContentDeletion:async(u,k)=>{calls.push({name:'preview',owner:u,key:k});if(error)throw error;return value;},
 readArticleContentDeletion:async(u,k)=>{calls.push({name:'read',owner:u,id:k});if(error)throw error;if(readPreviewState){const row=previewDb.prepare('SELECT state FROM article_list_deletions WHERE owner=? AND id=?').get(u,k);if(!row)throw new ArticleDeletionError('未找到本人原操作',404);return {...value,state:row.state};}return value;},
 confirmArticleContentDeletion:async(u,a)=>{calls.push({name:'confirm',owner:u,args:a});if(error)throw error;return value;},
 readArticlePurgeExecutorEnd:async(u,k)=>{calls.push({name:'read_end',owner:u,id:k});if(error)throw error;return endValue;},
 settleArticlePurgeExecutor:async(u,a)=>{calls.push({name:'record_end',owner:u,args:a});if(error)throw error;return endValue;},
};
const store={owner:r=>r.headers.get('oai-authenticated-user-id'),db:()=>({prepare:query=>({bind:(...args)=>({first:async()=>{queries.push({query,args});return args[0]===owner&&args[1]===key?{id:operation}:null;},run:async()=>{queries.push({query,args});return previewDb.prepare(query).run(...args);}})})})};
const dispatch={};
vm.runInNewContext(compile('lib/article-content-deletion-tools.ts'),{exports:dispatch,require:name=>name==='./article-content-deletion'?backend:name==='./article-deletion'?{ArticleDeletionError}:store,Error,Object,Parameters:undefined});
const route={};
vm.runInNewContext(compile('app/api/articles/purge/route.ts'),{exports:route,require:name=>name.endsWith('/test-store')?store:name.endsWith('/article-deletion')?{ArticleDeletionError}:dispatch,Request,Response,URL,TextDecoder,Error,Object,JSON});
const request=(body,headers={})=>new Request('https://site.test/api/articles/purge',{method:'POST',headers:{origin:'https://site.test','x-xiaoyu-content-delete':'1','content-type':'application/json','oai-authenticated-user-id':owner,...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const get=(query,headers={'oai-authenticated-user-id':owner})=>route.GET(new Request('https://site.test/api/articles/purge?'+query,{headers}));
let cases=0;
async function test(name,fn){await fn();cases++;console.log('PASS '+name);}
await test('owner authentication, exact-origin/custom-header and JSON format precede every destructive backend call',async()=>{
 const before=calls.length;
 for(const headers of [{'oai-authenticated-user-id':''},{origin:'https://foreign.test'},{origin:''},{'x-xiaoyu-content-delete':''},{'content-type':'text/plain'}]){
  const r=await route.POST(request({action:'confirm',...payload},headers));assert.equal(r.status,headers['oai-authenticated-user-id']===''?401:headers['content-type']?415:403);assert.equal(r.headers.get('cache-control'),'private, no-store');
 }
 assert.equal(calls.length,before);assert.equal((await get('operation_id='+operation,{})).status,401);assert.equal(calls.length,before);
});
await test('HTTP preview, original-operation GET, original-key GET and confirmation share exact dispatch and authenticated owner',async()=>{
 const preview=await route.POST(request({action:'preview',request_key:key}));assert.equal(preview.status,200);assert.equal(preview.headers.get('cache-control'),'private, no-store');assert.equal((await preview.json()).operation_id,operation);assert.deepEqual(calls.at(-1),{name:'preview',owner,key});
 assert.equal((await get('operation_id='+operation)).status,200);assert.deepEqual(calls.at(-1),{name:'read',owner,id:operation});
 assert.equal((await get('request_key='+key)).status,200);assert.deepEqual(calls.at(-1),{name:'read',owner,id:operation});assert.match(queries.at(-1).query,/owner=\? AND request_key=\? AND scope='all_articles'/);assert.deepEqual(queries.at(-1).args,[owner,key]);
 const confirm=await route.POST(request({action:'confirm',...payload}));assert.equal(confirm.status,200);assert.equal(calls.at(-1).owner,owner);assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).args)),payload);
});
await test('dispatcher rejects owner or claim injection, unrelated scope fields, missing confirmation members and ambiguous recovery selectors',async()=>{
 for(const [name,args] of [
  ['preview_all_article_deletion',{request_key:key,owner:'other'}],
  ['preview_all_article_deletion',{request_key:key,claim_token:'synthetic'}],
  ['preview_all_article_deletion',{request_key:key,article_ids:[id]}],
  ['delete_all_articles_permanently',{...payload,confirm_owner:undefined,claim_token:'synthetic'}],
  ['delete_all_articles_permanently',{operation_id:operation}],
  ['read_all_article_deletion',{}],
  ['read_all_article_deletion',{request_key:key,operation_id:operation}],
  ['other_tool',{request_key:key}],
 ]){const before=calls.length;await assert.rejects(dispatch.articleContentDeletionCall(owner,name,args),error=>error.status===400);assert.equal(calls.length,before);}
 const before=calls.length;await assert.rejects(dispatch.articleContentDeletionCall('OTHER','read_all_article_deletion',{request_key:key}),error=>error.status===404);assert.equal(calls.length,before);
 assert.equal((await route.POST(request({action:'confirm',...payload,owner:'other'}))).status,400);assert.equal((await route.POST(request({action:'generate',article_id:id}))).status,400);
});
await test('HTTP body is bounded and all failures preserve no-store and hide private internal errors',async()=>{
 const before=calls.length;const oversized=await route.POST(request({action:'preview',request_key:key,extra:'x'.repeat(128000)}));assert.equal(oversized.status,413);assert.equal(calls.length,before);
 for(const body of [[],null,12])assert.equal((await route.POST(request(body))).status,400);
 error=new Error('PRIVATE_STORAGE_DETAILS synthetic-body');const failed=await route.POST(request({action:'confirm',...payload}));assert.equal(failed.status,503);assert.equal(failed.headers.get('cache-control'),'private, no-store');assert.doesNotMatch(JSON.stringify(await failed.json()),/PRIVATE_STORAGE_DETAILS|synthetic-body/);
 error=new ArticleDeletionError('原快照已变化',409);assert.equal((await route.POST(request({action:'confirm',...payload}))).status,409);error=null;
});
const mcp={};
const emptyModule=new Proxy({},{get:(_,name)=>String(name).endsWith('Tools')?[]:name==='retiredGenerationNames'||name==='wordAttemptNames'?new Set():String(name).endsWith('Error')?class extends Error{}:()=>{throw Error('Unexpected unrelated dependency');}});
vm.runInNewContext(compile('app/mcp/route.ts'),{exports:mcp,require:name=>name.endsWith('/article-content-deletion-tools')?dispatch:name.endsWith('/test-store')?store:name.endsWith('/article-deletion')?{ArticleDeletionError,articleDeletionTools:[]}:emptyModule,Request,Response,URL,Error,TextEncoder,console:{info(){}}});
const invoke=(name,args,headers={})=>mcp.POST(new Request('https://site.test/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name,arguments:args}})}));
await test('MCP exposes owner-scoped exact deletion schema and destructive annotation while read remains read-only',async()=>{
 const result=await(await mcp.POST(new Request('https://site.test/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})}))).json();
 const tools=result.result.tools.filter(t=>t&&cleanupNames.includes(t.name));assert.equal(tools.length,3);
 assert.equal(result.result.tools.filter(t=>t&&dispatch.articleContentDeletionTools.some(p=>p.name===t.name)).length,6);
 for(const t of tools){assert.equal(t.inputSchema.additionalProperties,false);assert.ok(!Object.hasOwn(t.inputSchema.properties,'owner'));assert.ok(!Object.hasOwn(t.inputSchema.properties,'claim_token'));}
 const read=tools.find(t=>t.name==='read_all_article_deletion'),confirm=tools.find(t=>t.name==='delete_all_articles_permanently');assert.equal(read.annotations.readOnlyHint,true);assert.equal(confirm.annotations.destructiveHint,true);assert.equal(confirm.inputSchema.properties.confirm_scope.const,'all_articles');assert.equal(confirm.inputSchema.properties.confirm_permanent.const,true);assert.equal(confirm.inputSchema.properties.confirm_ids.maxItems,200);assert.deepEqual(confirm.inputSchema.required,Object.keys(payload));
});
await test('MCP routes through authenticated owner only; no bearer/claim substitutes and no cross-origin mutation',async()=>{
 for(const [name,args] of [['preview_all_article_deletion',{request_key:key}],['read_all_article_deletion',{operation_id:operation}],['delete_all_articles_permanently',payload]]){
  const before=calls.length;for(const headers of [{},{authorization:'Bearer synthetic'},{'x-xiaoyu-claim-token':'synthetic'}])assert.equal((await invoke(name,args,headers)).status,401);assert.equal(calls.length,before);
  assert.equal((await invoke(name,args,{'oai-authenticated-user-id':owner,origin:'https://foreign.test'})).status,403);assert.equal(calls.length,before);
  const r=await invoke(name,args,{'oai-authenticated-user-id':owner});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');const out=await r.json();assert.deepEqual(JSON.parse(out.result.content[0].text),value);assert.equal(calls.at(-1).owner,owner);
 }
 error=new Error('PRIVATE_STORAGE_DETAILS');const out=await(await invoke('delete_all_articles_permanently',payload,{'oai-authenticated-user-id':owner})).json();assert.equal(out.result.isError,true);assert.doesNotMatch(JSON.stringify(out),/PRIVATE_STORAGE_DETAILS/);error=null;
});
await test('new end tools have separate narrow schemas and never add holder credentials to the three purge tools',async()=>{
 const result=await(await mcp.POST(new Request('https://site.test/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/list'})}))).json();
 const tools=result.result.tools.filter(t=>t&&endNames.includes(t.name));assert.equal(tools.length,2);
 for(const t of tools){assert.equal(t.inputSchema.additionalProperties,false);assert.equal(t.annotations.destructiveHint,false);assert.equal(t.annotations.openWorldHint,false);assert.ok(!Object.hasOwn(t.inputSchema.properties,'owner'));assert.ok(!Object.hasOwn(t.inputSchema.properties,'new_execution_grant'));}
 const read=tools.find(t=>t.name===endNames[0]),record=tools.find(t=>t.name===endNames[1]);assert.equal(read.annotations.readOnlyHint,true);assert.deepEqual(read.inputSchema.required,['article_id']);assert.deepEqual(Object.keys(read.inputSchema.properties),['article_id']);assert.equal(record.annotations.readOnlyHint,false);
 for(const field of ['article_id','operation_id','request_key','claim_token','input_sha256','execution_id','evidence_kind','confirm_all_actions_stopped','confirm_all_actions_settled','end_reference','settled_reference'])assert.ok(record.inputSchema.required.includes(field));
 for(const field of ['execution_token','epoch','grant_request_key','original_acquisition_request_key'])assert.ok(Object.hasOwn(record.inputSchema.properties,field));assert.equal(record.inputSchema.properties.evidence_kind.const,'holder_acknowledgement');assert.equal(record.inputSchema.properties.confirm_all_actions_stopped.const,true);assert.equal(record.inputSchema.properties.confirm_all_actions_settled.const,true);
 for(const t of result.result.tools.filter(t=>t&&cleanupNames.includes(t.name)))for(const field of ['claim_token','execution_token','epoch','grant_request_key','original_acquisition_request_key'])assert.ok(!Object.hasOwn(t.inputSchema.properties,field),'original cleanup schema must not widen');
});
await test('end dispatch forwards exact article, original Word mapping and manual acquisition mapping without allocating or replacing credentials',async()=>{
 const read=await dispatch.articleContentDeletionCall(owner,endNames[0],{article_id:id});assert.deepEqual(read,endValue);assert.deepEqual(calls.at(-1),{name:'read_end',owner,id});
 for(const args of [wordEnd,manualEnd]){const result=await dispatch.articleContentDeletionCall(owner,endNames[1],args);assert.deepEqual(result,endValue);assert.equal(calls.at(-1).name,'record_end');assert.equal(calls.at(-1).owner,owner);assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).args)),args);assert.equal(result.server_verified,false);assert.equal(result.new_execution_grant,false);}
 for(const [name,args] of [[endNames[0],{}],[endNames[0],{article_id:'invalid'}],[endNames[0],{article_id:id,claim_token:wordEnd.claim_token}],[endNames[0],{article_id:id,owner:'OTHER'}],[endNames[1],{...wordEnd,owner:'OTHER'}],[endNames[1],{...wordEnd,new_execution_grant:true}],[endNames[1],{article_id:id,operation_id:operation}]]){const before=calls.length;await assert.rejects(dispatch.articleContentDeletionCall(owner,name,args),error=>error.status===400);assert.equal(calls.length,before);}
 // The frontend HTTP route deliberately remains preview/confirm-only.
 const before=calls.length;assert.equal((await route.POST(request({action:endNames[1],...wordEnd}))).status,400);assert.equal(calls.length,before);
});
await test('end MCP calls require owner authentication and exact same origin; claim or Word tokens never substitute for authentication',async()=>{
 for(const [name,args] of [[endNames[0],{article_id:id}],[endNames[1],wordEnd],[endNames[1],manualEnd]]){
  const before=calls.length;for(const headers of [{},{authorization:'Bearer synthetic'},{'x-xiaoyu-claim-token':wordEnd.claim_token},{'x-word-execution-token':wordEnd.execution_token}])assert.equal((await invoke(name,args,headers)).status,401);assert.equal(calls.length,before);
  assert.equal((await invoke(name,args,{'oai-authenticated-user-id':owner,origin:'https://foreign.test'})).status,403);assert.equal(calls.length,before);
  const r=await invoke(name,args,{'oai-authenticated-user-id':owner,origin:'https://site.test'});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');const result=await r.json();assert.deepEqual(JSON.parse(result.result.content[0].text),endValue);assert.equal(calls.at(-1).owner,owner);assert.doesNotMatch(JSON.stringify(result),/synthetic-original-claim|synthetic-original-word-token|synthetic original holder actual end|synthetic original holder settled actions/);
 }
 const before=calls.length;const rejected=await(await invoke(endNames[1],{...wordEnd,owner:'OTHER'},{'oai-authenticated-user-id':owner})).json();assert.equal(rejected.result.isError,true);assert.equal(calls.length,before);
 error=new ArticleDeletionError('原执行映射缺失，仍为未知',409);const unknown=await(await invoke(endNames[1],manualEnd,{'oai-authenticated-user-id':owner})).json();assert.equal(unknown.result.isError,true);assert.match(unknown.result.content[0].text,/仍为未知/);error=new Error('PRIVATE_STORAGE_DETAILS synthetic-original-claim');const failed=await(await invoke(endNames[1],wordEnd,{'oai-authenticated-user-id':owner})).json();assert.equal(failed.result.isError,true);assert.doesNotMatch(JSON.stringify(failed),/PRIVATE_STORAGE_DETAILS|synthetic-original-claim/);error=null;
});
await test('abandon is a separate exact-operation owner tool and never accepts article lists, credential fields or broader scope',async()=>{
 const tool=dispatch.articleContentDeletionTools.find(t=>t.name===abandonName);assert.ok(tool);assert.equal(tool.inputSchema.additionalProperties,false);assert.deepEqual(Array.from(tool.inputSchema.required),['operation_id']);assert.deepEqual(Object.keys(tool.inputSchema.properties),['operation_id']);assert.equal(tool.annotations.readOnlyHint,false);assert.equal(tool.annotations.destructiveHint,false);
 for(const args of [{},{operation_id:'invalid'},{operation_id:operation,owner:'OTHER'},{operation_id:operation,claim_token:wordEnd.claim_token},{operation_id:operation,confirm_ids:[id]},{operation_id:operation,scope:'all_articles'}]){const before=queries.length;await assert.rejects(dispatch.articleContentDeletionCall(owner,abandonName,args),error=>error.status===400);assert.equal(queries.length,before);}
});
await test('actual isolated SQLite abandon CAS requires same owner/scope, unconfirmed preview and no lock; concurrent-confirm winners are rejected',async()=>{
 readPreviewState=true;
 const reset=(state='previewed',confirmed=null,lock=null,scope='all_articles')=>previewDb.prepare('UPDATE article_list_deletions SET state=?,confirmed_at=?,lock_token=?,scope=? WHERE id=?').run(state,confirmed,lock,scope,operation);
 const state=()=>previewDb.prepare('SELECT state FROM article_list_deletions WHERE id=?').get(operation).state;
 reset();const abandoned=await dispatch.articleContentDeletionCall(owner,abandonName,{operation_id:operation});assert.equal(abandoned.state,'cancelled');assert.equal(state(),'cancelled');assert.equal((await dispatch.articleContentDeletionCall(owner,abandonName,{operation_id:operation})).state,'cancelled','already-cancelled readback is idempotent');
 for(const args of [['deleting','synthetic-confirm-time',null,'all_articles'],['previewed','synthetic-confirm-time',null,'all_articles'],['previewed',null,'synthetic-lock','all_articles'],['unknown',null,null,'all_articles'],['previewed',null,null,'publish']]){reset(...args);await assert.rejects(dispatch.articleContentDeletionCall(owner,abandonName,{operation_id:operation}),error=>error.status===409);assert.equal(state(),args[0]);}
 reset();await assert.rejects(dispatch.articleContentDeletionCall('OTHER',abandonName,{operation_id:operation}),error=>error.status===404);assert.equal(state(),'previewed');reset();readPreviewState=false;
});
await test('abandon HTTP and MCP share authenticated exact-operation dispatch, origin guards and no-store errors without exposing end actions',async()=>{
 readPreviewState=true;previewDb.prepare("UPDATE article_list_deletions SET state='previewed',confirmed_at=NULL,lock_token=NULL,scope='all_articles' WHERE id=?").run(operation);
 const before=queries.length;for(const headers of [{'oai-authenticated-user-id':''},{origin:'https://foreign.test'},{'x-xiaoyu-content-delete':''}]){const r=await route.POST(request({action:'abandon_preview',operation_id:operation},headers));assert.equal(r.status,headers['oai-authenticated-user-id']===''?401:403);}assert.equal(queries.length,before);
 const http=await route.POST(request({action:'abandon_preview',operation_id:operation}));assert.equal(http.status,200);assert.equal(http.headers.get('cache-control'),'private, no-store');assert.equal((await http.json()).state,'cancelled');const independent=await get('operation_id='+operation);assert.equal((await independent.json()).state,'cancelled');
 const baseline=queries.length;for(const headers of [{},{authorization:'Bearer synthetic'},{'x-xiaoyu-claim-token':wordEnd.claim_token}])assert.equal((await invoke(abandonName,{operation_id:operation},headers)).status,401);assert.equal(queries.length,baseline);assert.equal((await invoke(abandonName,{operation_id:operation},{'oai-authenticated-user-id':owner,origin:'https://foreign.test'})).status,403);assert.equal(queries.length,baseline);
 const reply=await invoke(abandonName,{operation_id:operation},{'oai-authenticated-user-id':owner,origin:'https://site.test'});assert.equal(reply.headers.get('cache-control'),'private, no-store');assert.equal(JSON.parse((await reply.json()).result.content[0].text).state,'cancelled');
 previewDb.prepare("UPDATE article_list_deletions SET state='deleting',confirmed_at='synthetic-confirm-time' WHERE id=?").run(operation);const blocked=await route.POST(request({action:'abandon_preview',operation_id:operation}));assert.equal(blocked.status,409);assert.equal(previewDb.prepare('SELECT state FROM article_list_deletions WHERE id=?').get(operation).state,'deleting');
 for(const action of endNames)assert.equal((await route.POST(request({action,...wordEnd}))).status,400);assert.equal((await route.POST(request({action:'abandon_preview',operation_id:operation,claim_token:wordEnd.claim_token}))).status,400);readPreviewState=false;
});
console.log(`PASS ${cases} real purge API/MCP/dispatcher synthetic wiring scenarios; no production I/O.`);
