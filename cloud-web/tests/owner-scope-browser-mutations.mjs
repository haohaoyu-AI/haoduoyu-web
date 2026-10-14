// Actual browser page/route/library source and all54 migrations on isolated
// SQLite. Auth and event delivery are offline doubles; no external requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {loadTS} from './hot-discovery-loader.mjs';
import {createSyntheticHarness,sha256} from './word-recovery-harness.mjs';

const sourceRoot=path.resolve(process.env.OWNER_SCOPE_MUTATION_SOURCE_ROOT||process.cwd());
const helper=path.resolve('tests/offline-eight-interactions-ui.mjs');
const helperSource=fs.readFileSync(helper,'utf8');
const helperEnd=helperSource.indexOf('const discovery =');
assert.ok(helperEnd>0,'the existing isolated UI harness must remain identifiable');
const uiExports={};
vm.runInNewContext(ts.transpileModule(helperSource.slice(0,helperEnd)
 .replaceAll('import.meta.url',JSON.stringify(pathToFileURL(helper).href))+
 '\nexports.harness=harness;exports.text=text;exports.elements=elements;',
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,
 {exports:uiExports,require:createRequire(pathToFileURL(helper)),URL,Response,AbortSignal,AbortController,DOMException});
const {harness,text,elements}=uiExports;
const ownerA='OFFLINE-owner-A',ownerB='OFFLINE-owner-B',origin='http://127.0.0.1:9999';
const scope=(kind,owner)=>sha256((kind==='cloud'?'dedao-cloud-owner:':'hot-benchmark-owner:')+owner);
let passed=0;
function fixture(){
 let storage,authenticatedOwner=ownerA,readinessCalls=0;
 const events=[];
 storage=createSyntheticHarness({projectRoot:sourceRoot,mocks:{
  './test-store':{db:()=>storage.d1},'./articles':{bucket:()=>storage.bucket},
  './writing-input':{hashText:async value=>sha256(value)},
  './events':{readiness:async()=>{readinessCalls++;return {connected:true};},dispatchCloudDedao:async(owner,id)=>{events.push({owner,id});return true;}},
 }});
 const load=storage.loader(),cloud=load('dedao-cloud'),hot=load('hot-article-discovery-store');
 const route=(file,name,module)=>loadTS(path.join(sourceRoot,file),{
  '../../../../lib/test-store':{owner:()=>authenticatedOwner},
  ['../../../../lib/'+name]:module,'../../../../lib/writing-input':{hashText:async value=>sha256(value)},
 });
 const routes={cloud:route('app/api/dedao/cloud/route.ts','dedao-cloud',cloud),hot:route('app/api/imitation/discovery/route.ts','hot-article-discovery-store',hot)};
 const invoke=(kind,method,body)=>routes[kind][method](new Request(origin+(kind==='cloud'?'/api/dedao/cloud':'/api/imitation/discovery'),{
  method,headers:{Origin:origin,'Content-Type':'application/json',[kind==='cloud'?'x-dedao-cloud':'x-hot-article-discovery']:'1'},
  ...(method==='POST'?{body:JSON.stringify(body)}:{}),
 }));
 const effects=()=>JSON.stringify({db:storage.counts,readinessCalls,events});
 return {storage,cloud,hot,events,routes,invoke,effects,setOwner(owner){authenticatedOwner=owner;},
  async respond(kind,request){const response=await invoke(kind,request.options.method||'GET',request.body);const value=await response.json();request.respond(value,response.status);return response.status;},
  close(){assert.equal(storage.externalCalls,0);storage.close();},
 };
}
async function check(name,run){const f=fixture();try{await run(f);passed++;console.log('PASS '+name);}finally{f.close();}}

for(const action of ['cloud','add','remove','refresh'])await check(action+' freezes owner A at the browser POST and rejects a silent server switch to B',async f=>{
 const kind=action==='cloud'?'cloud':'hot';
 if(kind==='hot')await f.hot.addBenchmark(ownerA,{name:'PRIVATE-A-电影账号',url:'https://www.toutiao.com/c/user/123456789/'});
 const ui=harness(path.join(sourceRoot,kind==='cloud'?'app/dedao/page.tsx':'app/imitation/page.tsx'));
 await ui.start();assert.equal(await f.respond(kind,ui.requests[0]),200);await ui.settle();
 if(action==='add'){
  await ui.click('添加账号');elements(ui.tree,'input')[0].props.onChange({target:{value:'PRIVATE-A-UNSAVED'}});elements(ui.tree,'input')[1].props.onChange({target:{value:'https://www.toutiao.com/c/user/234567890/'}});await ui.settle();
  elements(ui.tree,'form')[0].props.onSubmit({preventDefault(){}});await ui.settle();
 }else await ui.click(action==='cloud'?'一键成文':action==='remove'?'移除':'刷新热文');
 const post=ui.requests[1],before=f.effects();f.setOwner(ownerB);
 const status=await f.respond(kind,post);
 console.log(JSON.stringify({action,posted_scope:post.body.owner_scope??null,authenticated_owner:'OFFLINE-B',response_status:status,
  business_effects_unchanged:f.effects()===before,cloud_tasks_B:f.storage.sql.prepare('SELECT count(*) n FROM dedao_cloud_requests WHERE owner=?').get(ownerB).n,
  accounts_B:f.storage.sql.prepare('SELECT count(*) n FROM hot_benchmark_accounts WHERE owner=?').get(ownerB).n,event_calls:f.events.length}));
 assert.equal(post.body.owner_scope,scope(kind,ownerA),'the request must carry the verified page owner, never infer identity after submission');
 assert.equal(status,403);assert.equal(f.effects(),before,'scope refusal must precede receipt/database/readiness/event access');
 await ui.settle();assert.equal(ui.requests.length,2,'a refused mutation cannot retry or perform recovery implicitly');assert.doesNotMatch(text(ui.tree),/PRIVATE-A/);
 if(kind==='cloud')assert.equal(ui.storage.has('dedao-cloud-request'),false);
});

for(const kind of ['cloud','hot'])await check(kind+' refuses absent, malformed and foreign scopes before all business effects',async f=>{
 const payload=kind==='cloud'?{request_key:randomUUID()}:{action:'add',name:'OFFLINE account',url:'https://www.toutiao.com/c/user/123456789/'};
 for(const invalid of [undefined,null,'',42,scope(kind,ownerB)]){
  const before=f.effects(),response=await f.invoke(kind,'POST',{...payload,...(invalid===undefined?{}:{owner_scope:invalid})});
  assert.equal(response.status,403);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(f.effects(),before);
 }
});

for(const kind of ['cloud','hot'])await check(kind+' delayed refusal cannot clear a newer verified owner view',async f=>{
 if(kind==='hot'){
  await f.hot.addBenchmark(ownerA,{name:'PRIVATE-A-电影账号',url:'https://www.toutiao.com/c/user/123456789/'});
  await f.hot.addBenchmark(ownerB,{name:'PRIVATE-B-电影账号',url:'https://www.toutiao.com/c/user/234567890/'});
 }
 const ui=harness(path.join(sourceRoot,kind==='cloud'?'app/dedao/page.tsx':'app/imitation/page.tsx'),{ignoreAbort:true});
 await ui.start();await f.respond(kind,ui.requests[0]);await ui.settle();await ui.click(kind==='cloud'?'一键成文':'刷新热文');const pending=ui.requests[1];
 f.setOwner(ownerB);await ui.event('focus');await f.respond(kind,ui.requests[2]);await ui.settle();
 const before=f.effects();assert.equal(await f.respond(kind,pending),403);assert.equal(f.effects(),before);await ui.settle();assert.doesNotMatch(text(ui.tree),/PRIVATE-A|当前账号暂无访问权限|请重新使用本人/);
 if(kind==='cloud'){assert.equal(ui.button('一键成文').props.disabled,false);await ui.click('一键成文');assert.equal(ui.requests[3].body.owner_scope,scope(kind,ownerB));assert.notEqual(ui.requests[3].body.request_key,pending.body.request_key);}
 else assert.match(text(ui.tree),/PRIVATE-B-电影账号/);
});

await check('matching cloud owner works, same key is idempotent, and mismatch cannot read a prior receipt',async f=>{
 const key=randomUUID(),payload={request_key:key,owner_scope:scope('cloud',ownerA)};
 assert.equal((await f.invoke('cloud','POST',payload)).status,200);assert.equal(f.events.length,1);
 assert.equal((await f.invoke('cloud','POST',payload)).status,200);assert.equal(f.events.length,1);
 const before=f.effects();f.setOwner(ownerB);assert.equal((await f.invoke('cloud','POST',payload)).status,403);assert.equal(f.effects(),before);
});
await check('matching hot owner adds/removes normally and direct owner-scoped libraries remain compatible',async f=>{
 const added=await f.invoke('hot','POST',{action:'add',name:'OFFLINE 电影账号',url:'https://www.toutiao.com/c/user/123456789/',owner_scope:scope('hot',ownerA)});assert.equal(added.status,200);
 const id=(await added.json()).accounts[0].id;assert.equal((await f.invoke('hot','POST',{action:'remove',id,owner_scope:scope('hot',ownerA)})).status,200);
 assert.equal((await f.hot.addBenchmark(ownerA,{name:'OFFLINE direct library',url:'https://www.toutiao.com/c/user/234567890/'})).accounts.length,1);
 assert.equal((await f.cloud.startCloudDedao(ownerA,{request_key:randomUUID()})).task.state,'queued');
});
console.log(JSON.stringify({passed,failed:0,source_root:sourceRoot,external_calls:0,scope:'actual browser/route/library sources,54 isolated SQLite migrations; auth and events are doubles'}));
