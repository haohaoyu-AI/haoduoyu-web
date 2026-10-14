// Synthetic client regression: executes the actual Home component, hooks,
// effects and handlers with inert deferred GET fixtures. No production data,
// API writes, browser DOM, layout or visual acceptance is represented here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import nodePath from 'node:path';
import {createRequire} from 'node:module';
import {createHash,webcrypto} from 'node:crypto';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const require=createRequire(import.meta.url);
const sourceHashes=new Map();
const compile=path=>{const source=fs.readFileSync(path,'utf8');sourceHashes.set(path,createHash('sha256').update(source).digest('hex'));return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;};
function loadModule(path,dependencies={}){
 const exports={};
 vm.runInNewContext(compile(path),{exports,require:name=>dependencies[name]||(name.startsWith('.')?loadModule(nodePath.join(nodePath.dirname(path),name+'.ts'),dependencies):require(name)),Date,Intl,URL});
 return exports;
}
const publish=loadModule('components/publish-focus.ts');
const nav=loadModule('components/studio-nav.tsx');
const upload=loadModule('components/upload-progress.ts');
const stages=loadModule('components/word-stage-progress.tsx',{'./publish-focus':publish});
// Seed the real child's hooks to inspect its actual details/read handlers. Home
// owns all asynchronous state in these cases; this is not a DOM emulator.
const stageEvents=loadModule('components/word-stage-progress.tsx',{'./publish-focus':publish,react:{...React,useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useRef:initial=>({current:initial}),useEffect:()=>{}}});
const contract=loadModule('lib/word-progress-contract.ts');
const pageCode=compile('app/page.tsx');
// The clear component is left unmounted. Its actual Home callback is invoked
// directly, so this test never sends a delete preview or confirmation.
const Clear=()=>null;
const depsEqual=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
const children=node=>Array.isArray(node?.props?.children)?node.props.children:[node?.props?.children];
function elements(node,predicate,result=[]){
 if(Array.isArray(node)){for(const child of node)elements(child,predicate,result);return result;}
 if(!node||typeof node!=='object')return result;
 if(predicate(node))result.push(node);
 for(const child of children(node))elements(child,predicate,result);
 return result;
}
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
const id=index=>`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
const row=(index,extra={})=>({id:id(index),title:`合成客户端回归 ${index}`,state:'processing',list_section:'work',word_progress:null,word_progress_unavailable:true,...extra});
function progress(target,version=1,count=3,extra={}){
 const value={contract_version:1,target_kind:'article',target_id:target,input_sha256:'a'.repeat(64),version,legacy:false,started_at:null,updated_at:'2026-10-10T02:00:00.000Z',completed_at:null,read_at:'2026-10-10T02:00:01.000Z',steps:contract.emptyWordSteps(),execution:{state:'running',reason:'none',reason_text:'',claim_active:true,update_overdue:false},save:{state:'not_started',cloud_ready:false,independently_confirmed:false,desktop_saved:null},output:null,attempt:null,can_control_word:false,...extra};
 value.steps[0]={...value.steps[0],state:'completed',action:'正在读取冻结原文',evidence:'executor_report'};
 value.steps[1]={...value.steps[1],state:'current',action:'正在搜集公开图片',counts:{completed:count,total:null,unit:'candidates'},evidence:'executor_report'};
 return value;
}
function home(){
 let slots=[],cursor=0,effects=[],dirty=true,tree,unmounted=false;
 const requests=[],listeners=new Map(),timers=new Map(),storage=new Map();
 let timerId=0;
 const hooks={...React,
  useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],value=>{assert.equal(unmounted,false,'unmounted Home must not commit a late read');const next=typeof value==='function'?value(slots[index]):value;if(!Object.is(next,slots[index])){slots[index]=next;dirty=true;}}];},
  useRef(initial){const index=cursor++;return slots[index]??={current:initial};},
  useCallback(fn,deps){const index=cursor++,prior=slots[index];if(!prior||!depsEqual(prior.deps,deps))slots[index]={fn,deps};return slots[index].fn;},
  useMemo(fn,deps){const index=cursor++,prior=slots[index];if(!prior||!depsEqual(prior.deps,deps))slots[index]={value:fn(),deps};return slots[index].value;},
  useEffect(fn,deps){const index=cursor++,prior=slots[index];if(!prior||!depsEqual(prior.deps,deps)){const next={deps,cleanup:prior?.cleanup,effect:true};slots[index]=next;effects.push(()=>{prior?.cleanup?.();next.cleanup=fn();});}}
 };
 const window={
  sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  setTimeout:(fn,delay)=>{const key=++timerId;timers.set(key,{fn,delay,repeat:false});return key;},
  clearTimeout:key=>timers.delete(key),
  setInterval:(fn,delay)=>{const key=++timerId;timers.set(key,{fn,delay,repeat:true});return key;},
  clearInterval:key=>timers.delete(key),
  addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},
  removeEventListener:(name,fn)=>listeners.get(name)?.delete(fn)
 };
 const exports={};
 vm.runInNewContext(pageCode,{exports,require:name=>name==='react'?hooks:name==='../components/article-list-clear'||name==='../components/article-content-clear'||name==='../components/article-workspace-action'?{default:Clear}:name==='../components/word-stage-progress'?stages:name==='../components/publish-focus'?publish:name==='../components/studio-nav'?nav:name==='../components/upload-progress'?upload:require(name),AbortController,AbortSignal,Response,FormData,Date,Intl,crypto:{subtle:{digest:async(algorithm,bytes)=>{assert.equal(algorithm,'SHA-256');return new Uint8Array(createHash('sha256').update(new Uint8Array(bytes)).digest()).buffer;}}},navigator:{onLine:true},window,fetch:(url,options={})=>{
  if(options.method==='POST')assert.match(url,/^\/api\/articles(?:\/[^/]+\/submit)?$/,'only inert original-upload or same-article submit fixtures');
  else assert.match(url,/^\/api\/articles(?:\?pending_offset=\d+|\/[^/]+\/word-progress)?$/,'only normal article and Word progress GETs are permitted');
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const request={url,options,resolve:body=>{assert.equal(request.settled,false,'fixture response is single-use');request.settled=true;resolve(new Response(JSON.stringify(body),{status:200}));},respond:(status,body)=>{assert.equal(request.settled,false);request.settled=true;resolve(new Response(JSON.stringify(body),{status}));},reject:reason=>{assert.equal(request.settled,false);request.settled=true;reject(reason);},settled:false};
  requests.push(request);return promise;
 }});
 function render(){assert.equal(unmounted,false);let turns=0;do{assert.ok(++turns<30,'Home effects must settle without a read loop');cursor=0;dirty=false;tree=exports.default();const run=effects;effects=[];run.forEach(fn=>fn());}while(dirty||effects.length);return tree;}
 async function settle(){for(let i=0;i<12;i++){await new Promise(resolve=>setImmediate(resolve));if(dirty||effects.length)render();}return tree;}
 const findButton=label=>elements(tree,node=>node.type==='button'&&text(node)===label)[0];
 return {
  requests,render,settle,
  get tree(){return tree;},
  markup(){return renderToStaticMarkup(tree);},
  word(target){const card=elements(tree,node=>node.type==='article'&&text(node).includes(`合成客户端回归 ${Number(target.slice(-12))}`))[0];assert.ok(card,'expected actual Home article');return elements(card,node=>node.type===stages.default)[0];},
  async click(label){const button=findButton(label);assert.ok(button,`expected Home button ${label}`);assert.equal(!!button.props.disabled,false,`${label} must be enabled`);button.props.onClick();render();return settle();},
  async toggleWord(target,open=true){const element=this.word(target);assert.ok(element,'expected Word component');const details=elements(stageEvents.default(element.props),node=>node.type==='details')[0];assert.ok(details?.props.onToggle,'actual Word details must bind the read event');details.props.onToggle({currentTarget:{open}});render();return settle();},
  async retryWord(target){const element=this.word(target);const button=elements(stageEvents.default(element.props),node=>node.type==='button'&&text(node)==='重读进度')[0];assert.ok(button,'actual Word read error must expose retry');button.props.onClick();render();return settle();},
  async start(){render();const initial=[...timers].filter(([,timer])=>!timer.repeat&&timer.delay===0);assert.ok(initial.length,'actual mount effect must schedule initial list GET');for(const [key,timer] of initial){timers.delete(key);timer.fn();}return settle();},
  pendingList(){return requests.find(request=>!request.settled&&!request.options.signal?.aborted&&(request.options.method||'GET')==='GET'&&!request.url.includes('/word-progress'));},
  pendingWord(){return requests.filter(request=>!request.settled&&!request.options.signal?.aborted&&request.url.includes('/word-progress'));},
  async list(rows,extra={}){const request=this.pendingList();assert.ok(request,'expected deferred list GET');request.resolve({owner_scope:scope('A'),items:rows,connected:true,pending_total:rows.filter(value=>value.list_section!=='recent').length,next_offset:null,...extra});return settle();},
  async wordResponse(request,value,extra={}){request.resolve({article_id:decodeURIComponent(request.url.split('/')[3]),output_mode:null,word_progress:value,word_progress_unavailable:!value,...extra});return settle();},
  async event(name,event={}){for(const fn of [...(listeners.get(name)||[])])fn(event);render();return settle();},
  async poll(){const interval=[...timers.values()].find(timer=>timer.repeat&&timer.delay>=8000);assert.ok(interval);interval.fn();render();return settle();},
  async clear(ids){const control=elements(tree,node=>node.type===Clear)[0];assert.ok(control,'expected actual Home clear callback');(control.props.onChanged||control.props.onDeleted)(ids);render();return settle();},
  unmount(){for(const slot of slots)if(slot?.effect)slot.cleanup?.();unmounted=true;},
  async drainLate(){for(let i=0;i<12;i++)await Promise.resolve();}
 };
}

const requestTarget=request=>decodeURIComponent(request.url.split('/')[3]);
const readCalls=h=>h.requests.filter(request=>request.url.includes('/word-progress'));

const scope=owner=>createHash('sha256').update('article-data-owner:'+owner).digest('hex');
const actions=h=>elements(h.tree,node=>node.type===Clear);
const bulk=h=>actions(h).find(node=>node.props.label==='一键清空当前列表');
const visibleIds=h=>Array.from(bulk(h).props.ids);
const rows=(start,count,state='uploaded')=>Array.from({length:count},(_,index)=>row(start+index,{state,word_progress_unavailable:false}));
let passed=0;const failures=[];
async function check(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(error){failures.push(name);console.error('FAIL '+name+': '+error.message);}}
await check('actual upload route rejects stale or missing owner scope before createArticle and accepts same-owner scope',async()=>{
 const writing={};vm.runInNewContext(compile('lib/writing-input.ts'),{exports:writing,require:()=>({}),crypto:webcrypto,TextEncoder,Uint8Array,Date});
 const routeExports={},writes=[];
 vm.runInNewContext(compile('app/api/articles/route.ts'),{exports:routeExports,require:name=>name.endsWith('/test-store')?{owner:request=>request.headers.get('x-offline-owner')}:name.endsWith('/writing-input')?writing:name.endsWith('/events')?{}:{createArticle:async(owner,file)=>{writes.push({owner,name:file.name});return {id:id(1400)};}},Response,Request,URL,TextEncoder,File,TransformStream,console});
 const uploadRequest=owner_scope=>{const form=new FormData();form.append('article',new File(['OFFLINE ORIGINAL BODY'],'offline.txt'));return new Request('https://offline.test/api/articles',{method:'POST',headers:{'x-offline-owner':'B',Origin:'https://offline.test','x-xiaoyu-upload':'1',...(owner_scope===undefined?{}:{'x-article-owner-scope':owner_scope})},body:form});};
 for(const selectedScope of [scope('A'),undefined,'']){const response=await routeExports.POST(uploadRequest(selectedScope));assert.equal(response.status,403,'old A selection/current B authentication must be refused before file storage');assert.equal(writes.length,0);}
 const normal=await routeExports.POST(uploadRequest(scope('B')));assert.equal(normal.status,201);assert.deepEqual(writes,[{owner:'B',name:'offline.txt'}]);
});
await check('actual API returns stable SHA256 owner scope for every offset and empty lists',async()=>{
 const writing={};vm.runInNewContext(compile('lib/writing-input.ts'),{exports:writing,require:()=>({}),crypto:webcrypto,TextEncoder,Uint8Array,Date});
 const routeExports={},calls=[];
 vm.runInNewContext(compile('app/api/articles/route.ts'),{exports:routeExports,require:name=>name.endsWith('/events')?{readiness:async owner=>{calls.push(['connection',owner]);return {connected:true};}}:name.endsWith('/test-store')?{owner:request=>request.headers.get('x-offline-owner')}:name.endsWith('/writing-input')?writing:{articleWorklist:async(owner,offset)=>{calls.push(['worklist',owner,offset]);return {items:[],pending_total:0,next_offset:null};},articleListReadFailureCode:()=>{throw Error('unexpected error');}},Response,Request,URL,TextEncoder,console});
 for(const owner of ['A','A','B'])for(const offset of [0,25]){const response=await routeExports.GET(new Request('https://offline.test/api/articles?pending_offset='+offset,{headers:{'x-offline-owner':owner}}));const value=await response.json();assert.equal(response.status,200);assert.equal(value.owner_scope,scope(owner));assert.equal(response.headers.get('cache-control'),'private, no-store');assert.ok(!JSON.stringify(value).includes('article-data-owner:'));}
 const denied=await routeExports.GET(new Request('https://offline.test/api/articles'));assert.equal(denied.status,401);assert.equal(calls.length,12,'authentication failure never invokes article or connection reads');
});
await check('owner A first page and owner B continuation never produce a mixed 50-ID confirmation',async()=>{
 const h=home();await h.start();const a=rows(100,25),b=rows(200,25);
 await h.list(a,{owner_scope:scope('A'),pending_total:50,next_offset:25});await h.click('加载更多待处理文章');
 await h.list(a,{owner_scope:scope('A'),pending_total:50,next_offset:25});assert.equal(h.pendingList().url,'/api/articles?pending_offset=25');
 await h.list(b,{owner_scope:scope('B'),pending_total:50,next_offset:null});
 assert.deepEqual(visibleIds(h),[]);assert.equal(bulk(h).props.disabled,true);assert.doesNotMatch(h.markup(),/合成客户端回归 (?:1|2)\d\d/);assert.match(h.markup(),/登录账号已变化/);
 await h.click('刷新');assert.equal(h.pendingList().url,'/api/articles','scope invalidation resets pagination to page zero');await h.list(b,{owner_scope:scope('B')});assert.deepEqual(visibleIds(h),b.map(value=>value.id));h.unmount();
});
await check('both actual Home workspace entries carry known owner scope and invalidation callbacks',async()=>{
 const h=home();await h.start();await h.list(rows(300,2),{owner_scope:scope('A')});
 const entries=actions(h);assert.equal(entries.length,3);for(const action of entries){assert.equal(action.props.ownerScope,scope('A'));assert.equal(typeof action.props.onScopeInvalid,'function');}
 entries.find(value=>!value.props.label).props.onScopeInvalid();h.render();await h.settle();assert.deepEqual(visibleIds(h),[]);assert.equal(bulk(h).props.disabled,true);h.unmount();
});
await check('scope mismatch aborts two Word reads, drops their queue and rejects late old-owner results',async()=>{
 const h=home();await h.start();const a=rows(400,6,'processing');await h.list(a,{owner_scope:scope('A'),pending_total:31,next_offset:25});const old=h.pendingWord();assert.equal(old.length,2);
 await h.click('加载更多待处理文章');await h.list(a,{owner_scope:scope('A'),pending_total:31,next_offset:25});await h.list(rows(500,25),{owner_scope:scope('B')});
 assert.ok(old.every(request=>request.options.signal.aborted));assert.equal(h.pendingWord().length,0);assert.equal(readCalls(h).length,2,'old-owner queued Word work never dispatches');
 await h.click('刷新');await h.list(rows(600,1),{owner_scope:scope('B')});for(const request of old)await h.wordResponse(request,progress(requestTarget(request),99,999));
 assert.deepEqual(visibleIds(h),[id(600)]);assert.doesNotMatch(h.markup(),/合成客户端回归 40\d|999 张/);h.unmount();
});
for(const status of [401,403])await check('middle page '+status+' clears private rows, pagination and late Word reads',async()=>{
 const h=home();await h.start();await h.list(rows(700,3,'processing'),{pending_total:28,next_offset:25});const old=h.pendingWord();await h.click('加载更多待处理文章');await h.list(rows(700,3,'processing'),{pending_total:28,next_offset:25});h.pendingList().respond(status,{error:'OFFLINE owner denied'});await h.settle();
 assert.deepEqual(visibleIds(h),[]);assert.ok(old.every(request=>request.options.signal.aborted));assert.equal(h.pendingWord().length,0);for(const request of old)await h.wordResponse(request,progress(requestTarget(request),99,999));assert.deepEqual(visibleIds(h),[]);h.unmount();
});
await check('retained owner mismatch and missing scope clear rather than retain private rows',async()=>{
 for(const badScope of [scope('B'),undefined,'']){const h=home();await h.start();await h.list(rows(800,1));await h.click('刷新');await h.list(rows(900,1),{owner_scope:badScope});assert.deepEqual(visibleIds(h),[]);h.unmount();}
});
await check('old action invalidation or confirmed callback cannot clear a freshly read different owner',async()=>{
 const h=home();await h.start();await h.list(rows(1000,1));const prior=bulk(h);assert.equal(typeof prior.props.onScopeInvalid,'function');prior.props.onScopeInvalid();h.render();await h.settle();
 await h.click('刷新');await h.list(rows(1100,1),{owner_scope:scope('B')});prior.props.onScopeInvalid();prior.props.onChanged([id(1100)]);h.render();await h.settle();assert.deepEqual(visibleIds(h),[id(1100)]);assert.equal(h.pendingList(),undefined,'old detached callbacks must not start a new read');h.unmount();
});
await check('bfcache reset fences late old-owner page and reads the fresh owner only from page zero',async()=>{
 const h=home();await h.start();await h.list(rows(1200,25),{pending_total:50,next_offset:25});await h.click('加载更多待处理文章');await h.list(rows(1200,25),{pending_total:50,next_offset:25});await h.list(rows(1250,25),{pending_total:50,next_offset:null});await h.click('刷新');await h.list(rows(1200,25),{pending_total:50,next_offset:25});const old=h.pendingList();assert.equal(old.url,'/api/articles?pending_offset=25');
 await h.event('pageshow',{persisted:true});assert.equal(old.options.signal.aborted,true);assert.equal(h.pendingList().url,'/api/articles');await h.list(rows(1300,1),{owner_scope:scope('B')});old.resolve({owner_scope:scope('A'),items:rows(1200,25),connected:true,pending_total:50,next_offset:null});await h.settle();assert.deepEqual(visibleIds(h),[id(1300)]);h.unmount();
});
await check('actual Home original upload binds its known owner and late upload/submit replies cannot restore another scope',async()=>{
 for(const operation of ['upload','submit']){
  const h=home();await h.start();await h.list(rows(1500,1));const prior=bulk(h);
  if(operation==='upload'){const input=elements(h.tree,node=>node.type==='input'&&node.props.type==='file')[0];assert.ok(input);input.props.ref.current={files:[new File(['OFFLINE ORIGINAL BODY'],'offline.txt')],value:'offline.txt'};await h.click('上传文章');}
  else await h.click('求助小鱼');
  const request=h.requests.find(value=>value.options.method==='POST');assert.ok(request);
  if(operation==='upload'){assert.equal(request.options.headers['x-article-owner-scope'],scope('A'));assert.equal(request.options.body.get('article').name,'offline.txt');}
  prior.props.onScopeInvalid();h.render();await h.settle();await h.click('刷新');await h.list(rows(1600,1),{owner_scope:scope('B')});
  request.resolve({id:id(1500),state:'queued',notification:{state:'delivered'}});await h.settle();
  assert.deepEqual(visibleIds(h),[id(1600)]);assert.equal(h.pendingList(),undefined,'a prior-owner write reply cannot launch another list read');assert.doesNotMatch(h.markup(),/文章已上传|已提交，等待|本次 · 合成客户端回归 1500/);h.unmount();
 }
});
for(const [path,hash] of sourceHashes)assert.equal(createHash('sha256').update(fs.readFileSync(path)).digest('hex'),hash,'source must not mutate during synthetic regression');
console.log(JSON.stringify({passed,failed:failures.length,failures,external_calls:0,business_writes:0,scope:'actual Home hooks, GET/deferred handlers and actual API handler/hashText; public synthetic owner scopes'}));
if(failures.length)process.exitCode=1;
