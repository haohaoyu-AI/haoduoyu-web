// Exercise the real route and bounded HTTP parser. Persistence/identity here are
// explicit offline doubles; real SQL/idempotency is covered by hot-article-runtime.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const globals={Request,Response,URL,TextDecoder,TextEncoder,ReadableStream,Error};
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const http={};vm.runInNewContext(compile('lib/hot-article-http.ts'),{...globals,exports:http});
class HotArticleError extends Error{}
let writes=0,reads=0,settingsBindings=null,lastRead=null,readFailure=null;
const intents=new Map(),scope='haoduoyu_hot_article_imitation',user='OFFLINE_SYNTHETIC_OWNER';
const imitation={HotArticleError,createHotArticleBatch:async(owner,args)=>{
 writes++;const key=owner+':'+args.request_key;
 if(!intents.has(key))intents.set(key,{batch:{id:'OFFLINE_BATCH',request_key:args.request_key,writer:args.writer,state:'source_unavailable'}});
 return intents.get(key);
},readHotArticleBatch:async(owner,args)=>{reads++;lastRead={owner,args};if(readFailure)throw readFailure;return args.request_key?intents.get(owner+':'+args.request_key):{batches:[]};}};
const db={prepare:query=>{assert.match(query,/owner=\? AND scope=\?/);return {bind:(...args)=>{settingsBindings=args;return {all:async()=>({results:[]})};}};}};
const route={};vm.runInNewContext(compile('app/api/imitation/route.ts'),{...globals,exports:route,require:name=>name.endsWith('/hot-article-http')?http:name.endsWith('/hot-article-imitation')?imitation:name.endsWith('/test-store')?{owner:request=>request.headers.get('oai-authenticated-user-id'),db:()=>db}:name.endsWith('/editorial-authority-v3')?{imitationAuthorityV3Scope:scope}:name.endsWith('/events')?{readiness:async(owner,event)=>{assert.equal(owner,user);assert.equal(event,'hot_article.research_requested');return {connected:true};}}:(()=>{throw Error('Unexpected import '+name);})()});
const auth={'oai-authenticated-user-id':user},postHeaders={...auth,origin:'https://site.test','content-type':'application/json','x-hot-article-imitation':'1'};
const get=(query='',headers=auth)=>route.GET(new Request('https://site.test/api/imitation'+query,{headers}));
const post=(body,headers=postHeaders)=>route.POST(new Request('https://site.test/api/imitation',{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)}));
const privateResponse=response=>{assert.match(response.headers.get('cache-control'),/private, no-store/);assert.equal(response.headers.get('pragma'),'no-cache');};
for(const response of [await get('',{}),await post({},{}),await post({},{...postHeaders,origin:'https://foreign.test'}),await post({},{...postHeaders,'x-hot-article-imitation':'0'})]){assert.ok([401,403].includes(response.status));privateResponse(response);}assert.equal(writes,0);assert.equal(reads,0);
for(const query of ['?view=other','?view=settings&id=x','?id=x&request_key=y','?id=x&id=y','?limit=999','?id=']){const response=await get(query);assert.equal(response.status,400);privateResponse(response);}assert.equal(reads,0);
const settingsResponse=await get('?view=settings'),settings=await settingsResponse.json();privateResponse(settingsResponse);assert.deepEqual(settingsBindings,[user,scope]);assert.equal(settings.connected,true);assert.equal(settings.executor.automatic_writing_available,false,'subscription alone cannot prove real executor wiring');
for(const [body,headers,status] of [['invalid',postHeaders,400],[{unexpected:true},postHeaders,400],[{}, {...postHeaders,'content-type':'text/plain'},415],['x'.repeat(3001),postHeaders,413]]){const response=await post(body,headers);assert.equal(response.status,status);privateResponse(response);}assert.equal(writes,0);
const request_key='OFFLINE_STABLE_REQUEST',args={request_key,writer:'xiaoyu_agent0YYLX'};
const created=await post(args);assert.equal(created.status,200);privateResponse(created);const original=await created.json();const duplicate=await(await post(args)).json();assert.deepEqual(duplicate,original);assert.equal(intents.size,1);
const recovered=await get('?request_key='+request_key);assert.deepEqual(await recovered.json(),original);assert.equal(lastRead.owner,user);assert.equal(lastRead.args.request_key,request_key);
const exact=await get('?id=OFFLINE_BATCH');assert.equal(exact.status,200);assert.equal(lastRead.args.batch_id,'OFFLINE_BATCH');
readFailure=Error('PRIVATE_SYNTHETIC_TRANSPORT_SECRET');const failed=await get('?request_key='+request_key);assert.equal(failed.status,500);const failure=await failed.text();assert.ok(!failure.includes('PRIVATE_SYNTHETIC'));assert.match(failure,/同一刷新意图/);privateResponse(failed);assert.equal(intents.size,1);
readFailure=new HotArticleError('公开可恢复状态');const expected=await get();assert.equal(expected.status,400);assert.equal((await expected.json()).error,'公开可恢复状态');
console.log('PASS real hot API handlers: owner/origin/header isolation, no-store, bounded malformed input, exact query, scoped settings, truthful executor blocker, same-key recovery and private error suppression; offline doubles, zero real provider/network/production writes');
