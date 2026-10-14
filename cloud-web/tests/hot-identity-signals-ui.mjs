// Actual page hooks, callbacks and transport scheduling; inert public fixtures.
// No browser, network, provider, production or platform request is made.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash,webcrypto} from 'node:crypto';
import ts from 'typescript';
import React from 'react';

const native=createRequire(import.meta.url),pageFile='app/imitation/page.tsx',sourceSnapshot=process.env.HOT_IDENTITY_TEST_SOURCE||pageFile;
// A read-only git-show snapshot lets the same tests demonstrate the baseline red.
const sourceText=fs.readFileSync(sourceSnapshot,'utf8'),sourceSha256=createHash('sha256').update(sourceText).digest('hex');
const equal=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
function nodes(node,type,result=[]){if(Array.isArray(node)){node.forEach(child=>nodes(child,type,result));return result;}if(!node?.props)return result;if(node.type===type)result.push(node);nodes(node.props.children,type,result);return result;}
const text=node=>Array.isArray(node)?node.map(text).join(''):typeof node==='string'||typeof node==='number'?String(node):node?.props?text(node.props.children):'';
const scope=owner=>createHash('sha256').update('hot-benchmark-owner:'+owner).digest('hex');
function view(owner){
 const account={id:`OFFLINE-${owner}-account`,name:`OFFLINE OWNER ${owner} 电影账号`,url:'https://www.toutiao.com/c/user/123456789/'};
 return {owner_scope:scope(owner),accounts:[account],scan:{id:`OFFLINE-${owner}-scan`,request_key:`OFFLINE-${owner}-scan-key`,state:'ready',created:new Date().toISOString(),pool_changed:false,result:{observations:[],articles:[{id:`OFFLINE-${owner}-card`,account_id:account.id,title:`OFFLINE OWNER ${owner} 电影卡片`,url:'https://www.toutiao.com/article/1234567890123456789/',published_at:new Date(Date.now()-60000).toISOString(),reads:{display:'10000阅读',lower_bound:10000},likes:{display:null},comments:{display:null}}]}}};
}

function harness(){
 const slots=[],requests=[],timers=new Map(),listeners=new Map(),modules=new Map();let cursor=0,timerId=0,effects=[],dirty=true,tree,unmounted=false,activeGets=0,maxActiveGets=0;
 const hooks={...React,
  useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return[slots[index],value=>{assert.equal(unmounted,false,'late work must not update an unmounted page');slots[index]=typeof value==='function'?value(slots[index]):value;dirty=true;}];},
  useRef(initial){const index=cursor++;return slots[index]??={current:initial};},
  useCallback(fn,deps){const index=cursor++;if(!slots[index]||!equal(slots[index].deps,deps))slots[index]={fn,deps};return slots[index].fn;},
  useEffect(fn,deps){const index=cursor++,previous=slots[index];if(!previous||!equal(previous.deps,deps)){const next={deps,cleanup:previous?.cleanup};slots[index]=next;effects.push(()=>{previous?.cleanup?.();next.cleanup=fn();});}},
 };
 const timer=(fn,delay,repeat)=>{const id=++timerId;timers.set(id,{fn,delay,repeat});return id;};
 const window={addEventListener(name,fn){listeners.set(name,[...(listeners.get(name)??[]),fn]);},removeEventListener(name,fn){listeners.set(name,(listeners.get(name)??[]).filter(listener=>listener!==fn));}};
 const document={visibilityState:'visible',addEventListener:window.addEventListener,removeEventListener:window.removeEventListener};
 function load(filename){
  filename=path.resolve(filename);if(modules.has(filename))return modules.get(filename);
  const exports={};modules.set(filename,exports);
  const code=ts.transpileModule(filename===path.resolve(pageFile)?sourceText:fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports,require(name){
   if(name==='react')return hooks;if(name.endsWith('.css'))return{};if(name.includes('studio-nav'))return{default:()=>null};if(!name.startsWith('.'))return native(name);
   const base=path.resolve(path.dirname(filename),name);return load([base,`${base}.ts`,`${base}.tsx`].find(candidate=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile()));
  },Date,Intl,URL,Error,AbortSignal,AbortController,crypto:webcrypto,window,document,
  setInterval:(fn,delay)=>timer(fn,delay,true),clearInterval:id=>timers.delete(id),setTimeout:(fn,delay)=>timer(fn,delay,false),clearTimeout:id=>timers.delete(id),
  fetch(url,options={}){
   assert.match(url,/^\/api\/imitation\/discovery(?:\?request_key=[\w-]+)?$/,'only the inert discovery transport is permitted');
   const method=options.method??'GET';assert.ok(['GET','POST'].includes(method));let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
   if(method==='GET'){activeGets++;maxActiveGets=Math.max(maxActiveGets,activeGets);}
   const request={url,options,method,body:options.body?JSON.parse(options.body):null,settled:false,
    respond(body,status=200){assert.equal(request.settled,false);request.settled=true;if(method==='GET')activeGets--;resolve(new Response(JSON.stringify(body),{status}));},
    reject(error){assert.equal(request.settled,false);request.settled=true;if(method==='GET')activeGets--;reject(error);}};
   // Deliberately ignore aborts: a completed/late server reply must still be fenced.
   requests.push(request);return promise;
  }});
  return exports;
 }
 const Page=load(pageFile).default;
 function render(){assert.equal(unmounted,false);let turns=0;do{assert.ok(++turns<30,'hook updates must settle');cursor=0;dirty=false;tree=Page();const pending=effects;effects=[];pending.forEach(fn=>fn());}while(dirty||effects.length);return tree;}
 async function settle(){for(let i=0;i<24;i++){await Promise.resolve();if(dirty||effects.length)render();}return tree;}
 const button=label=>nodes(tree,'button').find(node=>text(node)===label);
 return {requests,button,settle,render,get tree(){return tree;},get maxActiveGets(){return maxActiveGets;},
  mountPending(){render();assert.equal(requests.length,1);},
  async start(){render();assert.equal(requests.length,1);requests[0].respond(view('A'));return settle();},
  async event(name,visibility='visible'){document.visibilityState=visibility;for(const listener of [...(listeners.get(name)??[])])listener();render();return settle();},
  async click(label){const node=button(label);assert.ok(node,`missing ${label}`);assert.equal(!!node.props.disabled,false,`${label} must be enabled`);node.props.onClick();render();return settle();},
  unmount(){for(const slot of slots)slot?.cleanup?.();unmounted=true;},
  async drain(){for(let i=0;i<24;i++)await Promise.resolve();},
  listenerCount(){return [...listeners.values()].reduce((count,list)=>count+list.length,0);},
 };
}
const hiddenA=h=>assert.doesNotMatch(text(h.tree),/OFFLINE OWNER A/,'unverified old owner view must remain hidden');
const disabledWrites=h=>{for(const button of nodes(h.tree,'button').filter(node=>!text(node).includes('重试读取账号池')))assert.equal(!!button.props.disabled,true,'identity uncertainty must block ordinary actions');};
const posts=h=>h.requests.filter(request=>request.method==='POST');
const checks=[];
async function check(name,fn){try{await fn();checks.push({name,passed:true});console.log('PASS '+name);}catch(error){checks.push({name,passed:false,message:error.message.split('\n')[0]});console.error('FAIL '+name+': '+error.message.split('\n')[0]);}}

await check('a pending initial read cannot overwrite the owner confirmed by the latest queued identity signal',async()=>{
 const h=harness();h.mountPending();await h.event('focus');await h.event('visibilitychange');assert.equal(h.requests.length,2,'the initial read may overlap one identity GET but signals must not fan out');
 h.requests[1].respond(view('A'));await h.settle();assert.equal(h.requests.length,3);hiddenA(h);disabledWrites(h);h.requests[2].respond(view('B'));await h.settle();assert.match(text(h.tree),/OFFLINE OWNER B/);
 h.requests[0].respond(view('A'));await h.settle();hiddenA(h);assert.match(text(h.tree),/OFFLINE OWNER B/);assert.equal(h.maxActiveGets,2,'the existing initial read is separate from the serialized identity queue');assert.equal(posts(h).length,0);
});

await check('a second focus/visible signal fences late A and coalesces one current-owner GET',async()=>{
 const h=harness();await h.start();await h.event('focus');const old=h.requests[1];await h.event('focus');await h.event('visibilitychange');assert.equal(h.requests.length,2,'new signals must not fan out while the first identity GET is pending');
 old.respond(view('A'));await h.settle();assert.equal(h.requests.length,3,'the newest identity signal requires one follow-up GET');hiddenA(h);disabledWrites(h);assert.equal(posts(h).length,0);
 h.requests[2].respond(view('B'));await h.settle();assert.match(text(h.tree),/OFFLINE OWNER B/);hiddenA(h);assert.equal(h.button('刷新热文').props.disabled,false);assert.equal(h.maxActiveGets,1);await h.click('刷新热文');assert.equal(posts(h)[0].body.owner_scope,scope('B'));
});
await check('every new visible signal immediately hides the old view and fences stale action handlers',async()=>{
 const h=harness();await h.start();const oldRefresh=h.button('刷新热文').props.onClick;await h.event('focus');hiddenA(h);disabledWrites(h);await h.event('visibilitychange');oldRefresh();await h.settle();assert.equal(posts(h).length,0);
 h.requests[1].respond(view('A'));await h.settle();hiddenA(h);disabledWrites(h);h.requests[2].respond(view('B'));await h.settle();hiddenA(h);
});
await check('bursts of focus/visibility are bounded to one active read plus one latest follow-up',async()=>{
 const h=harness();await h.start();await h.event('focus');for(let i=0;i<40;i++)await h.event(i%2?'focus':'visibilitychange');assert.equal(h.requests.length,2);
 h.requests[1].respond(view('A'));await h.settle();assert.equal(h.requests.length,3);for(let i=0;i<40;i++)await h.event(i%2?'visibilitychange':'focus');assert.equal(h.requests.length,3);
 h.requests[2].respond(view('B'));await h.settle();assert.equal(h.requests.length,4);hiddenA(h);disabledWrites(h);h.requests[3].respond(view('C'));await h.settle();assert.match(text(h.tree),/OFFLINE OWNER C/);assert.doesNotMatch(text(h.tree),/OFFLINE OWNER [AB]/);assert.equal(h.maxActiveGets,1);assert.equal(posts(h).length,0);
});
await check('an expired first identity request hands off once to the latest signal without surfacing its stale failure',async()=>{
 const h=harness();await h.start();await h.event('focus');assert.ok(h.requests[1].options.signal instanceof AbortSignal);await h.event('visibilitychange');h.requests[1].reject(new DOMException('OFFLINE first identity deadline','TimeoutError'));await h.settle();assert.equal(h.requests.length,3);hiddenA(h);disabledWrites(h);assert.ok(!text(h.tree).includes('OFFLINE first identity deadline'));
 h.requests[2].respond(view('B'));await h.settle();assert.match(text(h.tree),/OFFLINE OWNER B/);hiddenA(h);assert.equal(h.maxActiveGets,1);assert.equal(posts(h).length,0);
});
await check('hidden visibility invalidates the old ticket without issuing a hidden-tab GET',async()=>{
 const h=harness();await h.start();await h.event('focus');await h.event('visibilitychange','hidden');assert.equal(h.requests.length,2);h.requests[1].respond(view('A'));await h.settle();hiddenA(h);disabledWrites(h);assert.equal(h.requests.length,2);
 await h.event('visibilitychange');assert.equal(h.requests.length,3);h.requests[2].respond(view('B'));await h.settle();assert.match(text(h.tree),/OFFLINE OWNER B/);hiddenA(h);
});
await check('unmount drops a queued follow-up and ignores a late fulfilled identity response',async()=>{
 const h=harness();await h.start();await h.event('focus');await h.event('focus');h.unmount();assert.equal(h.listenerCount(),0);h.requests[1].respond(view('A'));await h.drain();assert.equal(h.requests.length,2,'unmounted work must not launch the queued identity read');assert.equal(posts(h).length,0);
});

async function uncertainRefresh(h){await h.start();await h.click('刷新热文');const key=posts(h)[0].body.request_key;h.requests[1].reject(Error('OFFLINE POST reply lost'));await h.settle();h.requests[2].reject(Error('OFFLINE receipt unavailable'));await h.settle();return key;}
await check('latest identity network failure hides stale data but preserves the unknown same-owner intent for GET-only recovery',async()=>{
 const h=harness(),key=await uncertainRefresh(h);await h.event('focus');await h.event('focus');await h.event('visibilitychange');h.requests[3].respond(view('A'));await h.settle();assert.equal(h.requests.length,5);h.requests[4].reject(Error('OFFLINE latest identity unavailable'));await h.settle();hiddenA(h);assert.equal(h.button('刷新热文').props.disabled,true);assert.equal(posts(h).length,1);assert.ok(!text(h.tree).includes(key),'unverified intent identity is never displayed');
 await h.click('重试读取账号池');assert.equal(h.requests[5].method,'GET');h.requests[5].respond(view('A'));await h.settle();assert.match(text(h.tree),/OFFLINE OWNER A/);assert.equal(posts(h).length,1,'revalidation never replays the mutation');await h.click('刷新热文');assert.equal(posts(h)[1].body.request_key,key);assert.equal(posts(h)[1].body.owner_scope,scope('A'));
});
await check('latest 401/403 clears protected state and the old recovery key before a new-owner refresh',async()=>{
 for(const status of [401,403]){
  const h=harness(),key=await uncertainRefresh(h);await h.event('focus');await h.event('focus');h.requests[3].respond(view('A'));await h.settle();assert.equal(h.requests.length,5);h.requests[4].respond({error:'OFFLINE authentication refused'},status);await h.settle();hiddenA(h);assert.ok(nodes(h.tree,'a').some(node=>node.props.href==='/signin-with-chatgpt?return_to=%2Fimitation'));assert.equal(posts(h).length,1);
  await h.event('focus');h.requests[5].respond(view('B'));await h.settle();await h.click('刷新热文');assert.notEqual(posts(h)[1].body.request_key,key);assert.equal(posts(h)[1].body.owner_scope,scope('B'));
 }
});
await check('identity rechecks neither release an active POST lock early nor allow its late result to restore A',async()=>{
 for(const earlyPost of [false,true]){
  const h=harness();await h.start();const oldRefresh=h.button('刷新热文').props.onClick;await h.click('刷新热文');const original=posts(h)[0];await h.event('focus');await h.event('focus');await h.event('visibilitychange');h.requests[2].respond(view('A'));await h.settle();assert.equal(h.requests.length,4);
  if(earlyPost){original.respond(view('A'));await h.settle();oldRefresh();await h.settle();assert.equal(posts(h).length,1,'a settled POST cannot bypass the still-pending identity check');}
  h.requests[3].respond(view('B'));await h.settle();hiddenA(h);assert.match(text(h.tree),/OFFLINE OWNER B/);
  if(!earlyPost){assert.equal(h.button('正在刷新…').props.disabled,true,'owner B verification must not unlock owner A pending POST');original.respond({error:'OFFLINE old auth refusal'},403);await h.settle();}
  hiddenA(h);await h.click('刷新热文');const next=posts(h)[1];assert.notEqual(next.body.request_key,original.body.request_key);assert.equal(next.body.owner_scope,scope('B'));assert.equal(h.maxActiveGets,1);
 }
});

assert.equal(createHash('sha256').update(fs.readFileSync(sourceSnapshot)).digest('hex'),sourceSha256,'the tested product source remains unchanged during the run');
const results={source:pageFile,source_snapshot:sourceSnapshot,source_sha256:sourceSha256,passed:checks.filter(check=>check.passed).length,failed:checks.filter(check=>!check.passed).length,checks,scope:'actual page hooks and inert discovery transport',external_calls:0,production_writes:0,platform_writes:0};
console.log(JSON.stringify(results,null,2));
if(process.env.HOT_IDENTITY_TEST_RESULTS)fs.writeFileSync(process.env.HOT_IDENTITY_TEST_RESULTS,JSON.stringify(results,null,2)+'\n');
if(results.failed)process.exitCode=1;
