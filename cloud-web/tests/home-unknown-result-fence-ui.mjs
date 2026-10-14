// Synthetic client regression: executes the actual Home component, hooks,
// effects and handlers with inert deferred GET fixtures. No production data,
// API writes, browser DOM, layout or visual acceptance is represented here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import nodePath from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
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
const stageSource=process.env.HAODUOYU_HOME_WORD_SOURCE||'components/word-stage-progress.tsx';
const stages=loadModule(stageSource,{'./publish-focus':publish});
// Seed the real child's hooks to inspect its actual details/read handlers. Home
// owns all asynchronous state in these cases; this is not a DOM emulator.
const stageEvents=loadModule(stageSource,{'./publish-focus':publish,react:{...React,useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useRef:initial=>({current:initial}),useEffect:()=>{}}});
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
function home(storageState=new Map(),monotonicClock=null){
 let slots=[],cursor=0,effects=[],dirty=true,tree,unmounted=false;
 const requests=[],listeners=new Map(),timers=new Map(),storage=storageState;
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
 vm.runInNewContext(pageCode,{exports,require:name=>name==='react'?hooks:name==='../components/article-list-clear'||name==='../components/article-content-clear'||name==='../components/article-workspace-action'?{default:Clear}:name==='../components/word-stage-progress'?stages:name==='../components/publish-focus'?publish:name==='../components/studio-nav'?nav:name==='../components/upload-progress'?upload:require(name),AbortController,AbortSignal,Response,FormData,Date,Intl,performance:monotonicClock?{now:()=>monotonicClock.current}:undefined,crypto:{subtle:{digest:async(algorithm,bytes)=>{assert.equal(algorithm,'SHA-256');return new Uint8Array(createHash('sha256').update(new Uint8Array(bytes)).digest()).buffer;}}},navigator:{onLine:true},window,fetch:(url,options={})=>{
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
  requests,render,settle,storage,
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


const scope=owner=>createHash('sha256').update('article-data-owner:'+owner).digest('hex');
const actions=h=>elements(h.tree,node=>node.type===Clear);
const bulk=h=>actions(h).find(node=>node.props.label==='一键清空当前列表');
const visibleIds=h=>Array.from(bulk(h).props.ids);
const rows=(start,count,state='uploaded')=>Array.from({length:count},(_,index)=>row(start+index,{state,word_progress_unavailable:false}));

const nodeButton=(h,label)=>elements(h.tree,node=>node.type==='button'&&text(node)===label)[0];
const originalBody='PURE SYNTHETIC ORIGINAL BODY - UNKNOWN FENCE';
async function choose(h,body=originalBody,name='offline-original.txt'){
 const input=elements(h.tree,node=>node.type==='input'&&node.props.type==='file')[0];assert.ok(input);
 const chosen=new File([body],name);input.props.ref.current={files:[chosen],value:name};input.props.onChange({target:{files:[chosen]}});h.render();await h.settle();return input;
}
const writes=h=>h.requests.filter(value=>value.options.method==='POST');
const newReceipt=(index,extra={})=>row(index,{state:'queued',word_progress_unavailable:false,notification_state:'unknown',notification_created:'2026-10-14T10:00:10.000Z',notification_updated:'2026-10-14T10:00:11.000Z',recovery:{unfinished:true,can_notify:true,can_retry:true,lease_expires:null},...extra});
let passed=0;const failures=[];
async function check(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(error){failures.push(name);console.error('FAIL '+name+': '+error.message);}}
for(const mode of ['lost-post','invalid-success-body','invalid-success-id'])await check(mode+' + GET503 fences original bytes through successful list read and rename',async()=>{
 const h=home();await h.start();await h.list(rows(1700,1));await choose(h);const retained=nodeButton(h,'上传文章').props.onClick;await h.click('上传文章');const first=writes(h)[0];assert.ok(first);
 if(mode==='lost-post')first.reject(new Error('synthetic lost receipt'));else if(mode==='invalid-success-id')first.resolve({id:'malformed synthetic ID'});else first.resolve({unexpected:'synthetic malformed success'});
 await h.settle();assert.ok(h.pendingList());h.pendingList().respond(503,{error:'synthetic unavailable'});await h.settle();
 assert.match(h.markup(),/上传结果待核实/);assert.equal(nodeButton(h,'上传文章').props.disabled,true,'unknown original stays fenced after failed read');
 await retained();await h.settle();assert.equal(writes(h).length,1,'retained handler cannot resend during failed read');
 await h.click('刷新');await h.list(rows(1700,1));assert.equal(nodeButton(h,'上传文章').props.disabled,true,'a successful list without exact upload identity cannot release bytes');
 await choose(h,originalBody,'renamed-same-original.txt');assert.equal(nodeButton(h,'上传文章').props.disabled,true,'renaming cannot release the byte fence');await retained();await h.settle();assert.equal(writes(h).length,1);
 await choose(h,'PURE SYNTHETIC DISTINCT ORIGINAL','different-original.txt');assert.equal(nodeButton(h,'上传文章').props.disabled,false,'a different original remains usable after a confirming same-owner list read');await h.click('上传文章');assert.equal(writes(h).length,2);assert.equal(writes(h)[1].options.body.get('article').name,'different-original.txt');
 writes(h)[1].resolve({id:id(1701)});await h.settle();await h.list(rows(1701,1));assert.match(h.markup(),/文章已上传/);h.unmount();
});
await check('unknown upload stores fingerprints only and survives normal same-owner remount',async()=>{
 const storage=new Map(),h=home(storage);await h.start();await h.list(rows(1800,1));await choose(h);await h.click('上传文章');writes(h)[0].reject(new Error('synthetic lost receipt'));await h.settle();await h.list(rows(1800,1));
 const saved=storage.get('haoduoyu-unconfirmed-original-upload-v1:'+scope('A'));assert.ok(saved);assert.match(saved,/^\["[a-f0-9]{64}"\]$/);assert.doesNotMatch(saved,/PURE SYNTHETIC|offline-original/);h.unmount();
 const next=home(storage);await next.start();await next.list(rows(1800,1));await choose(next,originalBody,'renamed-after-reload.txt');assert.equal(nodeButton(next,'上传文章').props.disabled,true);assert.equal(writes(next).length,0);next.unmount();
});
await check('optional storage failure cannot release mounted unknown-original fence',async()=>{
 const storage={get:()=>null,set:()=>{throw Error('synthetic denied storage');},delete:()=>{throw Error('synthetic denied storage');}},h=home(storage);await h.start();await h.list(rows(1900,1));await choose(h);await h.click('上传文章');writes(h)[0].reject(new Error('synthetic lost receipt'));await h.settle();await h.list(rows(1900,1));await choose(h,originalBody,'same-bytes-no-storage.txt');assert.equal(nodeButton(h,'上传文章').props.disabled,true);assert.equal(writes(h).length,1);h.unmount();
});
await check('in-flight upload fingerprint survives a reload before any POST response',async()=>{
 const storage=new Map(),h=home(storage);await h.start();await h.list(rows(2000,1));await choose(h);await h.click('上传文章');assert.equal(writes(h).length,1);h.unmount();
 const next=home(storage);await next.start();await next.list(rows(2000,1));await choose(next);assert.equal(nodeButton(next,'上传文章').props.disabled,true);assert.equal(writes(next).length,0);next.unmount();
});
await check('known upload receipt removes only its own temporary fingerprint',async()=>{
 const storage=new Map(),h=home(storage);await h.start();await h.list(rows(2100,1));await choose(h);await h.click('上传文章');writes(h)[0].resolve({id:id(2101)});await h.settle();await h.list(rows(2101,1));assert.equal(storage.has('haoduoyu-unconfirmed-original-upload-v1:'+scope('A')),false);await choose(h);assert.equal(nodeButton(h,'上传文章').props.disabled,false);h.unmount();
});
await check('failed storage removal cannot restore a known-success fingerprint in the mounted page',async()=>{
 const values=new Map(),storage={get:key=>values.get(key)||null,set:(key,value)=>values.set(key,value),delete:()=>{throw Error('synthetic removal refused');}},h=home(storage);await h.start();await h.list(rows(2150,1));await choose(h);await h.click('上传文章');writes(h)[0].resolve({id:id(2151)});await h.settle();await h.list(rows(2151,1));assert.ok(values.get('haoduoyu-unconfirmed-original-upload-v1:'+scope('A')));await choose(h);assert.equal(nodeButton(h,'上传文章').props.disabled,false);await h.click('刷新');await h.list(rows(2151,1));assert.equal(nodeButton(h,'上传文章').props.disabled,false);h.unmount();
});
await check('unknown submit behind a poll cannot use that prior GET as confirmation',async()=>{
 const h=home();await h.start();await h.list(rows(2200,1));const retained=nodeButton(h,'求助小鱼').props.onClick;await h.click('求助小鱼');await h.poll();const old=h.pendingList();assert.ok(old);writes(h)[0].reject(new Error('synthetic lost submit'));await h.settle();assert.equal(nodeButton(h,'求助小鱼').props.disabled,true,'no-op load behind poll cannot re-enable help');
 old.resolve({owner_scope:scope('A'),items:[newReceipt(2200)],connected:true,pending_total:1,next_offset:null});await h.settle();assert.equal(nodeButton(h,'重试求助').props.disabled,true,'a GET dispatched before unknown cannot be the confirming read');await retained();await h.settle();assert.equal(writes(h).length,1);
 await h.click('刷新');await h.list(rows(2200,1));assert.equal(nodeButton(h,'求助小鱼').props.disabled,true,'uploaded/null is no receipt');
 await h.click('刷新');await h.list([]);assert.equal(writes(h).length,1,'an absent row is not a failed-submit attestation');
 await h.click('刷新');await h.list([newReceipt(2200)]);assert.equal(nodeButton(h,'重试求助').props.disabled,false,'a changed persistent receipt and normal can_retry gate allow explicit same-task recovery');await h.click('重试求助');assert.equal(writes(h).length,2);assert.equal(writes(h)[1].url,writes(h)[0].url);writes(h)[1].resolve({id:id(2200),state:'queued',notification:{state:'delivered'}});await h.settle();await h.list([newReceipt(2200,{notification_state:'delivered',recovery:{unfinished:true,can_notify:true,can_retry:false,lease_expires:null}})]);h.unmount();
});
await check('unknown submit + GET503 remains fenced after a successful uploaded/null read',async()=>{
 const h=home();await h.start();await h.list(rows(2250,1));await h.click('求助小鱼');writes(h)[0].reject(new Error('synthetic lost submit'));await h.settle();h.pendingList().respond(503,{error:'synthetic unavailable'});await h.settle();assert.equal(nodeButton(h,'求助小鱼').props.disabled,true);await h.click('刷新');await h.list(rows(2250,1));assert.equal(nodeButton(h,'求助小鱼').props.disabled,true);assert.equal(writes(h).length,1);h.unmount();
});
for(const mutate of [p=>{p.recovery.can_notify=false;},p=>{delete p.recovery;},p=>{p.recovery.can_retry=false;}])await check('missing or refused normal retry gate cannot release unknown submit',async()=>{
 const h=home();await h.start();await h.list(rows(2260,1));await h.click('求助小鱼');writes(h)[0].reject(new Error('synthetic lost submit'));await h.settle();const p=newReceipt(2260);mutate(p);await h.list([p]);const retry=nodeButton(h,'重试求助');if(retry)assert.equal(retry.props.disabled,true);assert.equal(writes(h).length,1);h.unmount();
});
await check('fresh post-unknown GET permits existing unknown same-ID retry through current server gate',async()=>{
 const old=newReceipt(2300),h=home();await h.start();await h.list([old]);await h.click('重试求助');writes(h)[0].reject(new Error('synthetic lost retry'));await h.settle();await h.list([old]);assert.equal(nodeButton(h,'重试求助').props.disabled,false,'unchanged timestamps are not a prohibition when the newly read normal server retry gate permits');await h.click('重试求助');assert.equal(writes(h).length,2);assert.equal(writes(h)[0].url,writes(h)[1].url);h.unmount();
});
for(const state of ['sending','delivered'])await check(state+' projection alone cannot grant repeat-submit permission',async()=>{
 const h=home();await h.start();await h.list(rows(2400,1));await h.click('求助小鱼');writes(h)[0].reject(new Error('synthetic lost submit'));await h.settle();await h.list([newReceipt(2400,{state:'failed',notification_state:state,recovery:{unfinished:true,can_notify:true,can_retry:false,lease_expires:null}})]);assert.equal(nodeButton(h,'重试求助'),undefined);assert.equal(writes(h).length,1);h.unmount();
});
for(const state of ['failed','sending'])await check('fresh normal '+state+' retry gate allows the supported same-ID continuation',async()=>{
 const h=home();await h.start();await h.list(rows(2450,1));await h.click('求助小鱼');writes(h)[0].reject(new Error('synthetic lost submit'));await h.settle();await h.list([newReceipt(2450,{state:state==='failed'?'failed':'queued',notification_state:state==='failed'?null:'sending'})]);assert.equal(nodeButton(h,'重试求助').props.disabled,false);await h.click('重试求助');assert.equal(writes(h).length,2);assert.equal(writes(h)[0].url,writes(h)[1].url);h.unmount();
});
await check('exact known409 pre-write connection refusal recovers only after a new connected owner read',async()=>{
 const h=home();await h.start();await h.list(rows(2460,1));await h.click('求助小鱼');await h.poll();const old=h.pendingList();writes(h)[0].respond(409,{error:'文章处理连接尚未启用，文章已安全保存'});await h.settle();old.resolve({owner_scope:scope('A'),items:rows(2460,1),connected:true,pending_total:1,next_offset:null});await h.settle();assert.equal(nodeButton(h,'求助小鱼').props.disabled,true,'old poll is not renewed connection confirmation');await h.click('刷新');await h.list(rows(2460,1),{connected:false});assert.equal(nodeButton(h,'求助小鱼').props.disabled,true);await h.click('刷新');await h.list(rows(2460,1),{connected:true});assert.equal(nodeButton(h,'求助小鱼').props.disabled,false);await h.click('求助小鱼');assert.equal(writes(h).length,2);h.unmount();
});
await check('unrecognized409 remains unknown and cannot use uploaded/null to repeat',async()=>{
 const h=home();await h.start();await h.list(rows(2470,1));await h.click('求助小鱼');writes(h)[0].respond(409,{error:'synthetic unknown server conflict'});await h.settle();await h.list(rows(2470,1));assert.equal(nodeButton(h,'求助小鱼').props.disabled,true);assert.equal(writes(h).length,1);h.unmount();
});
await check('raw per-card GET provenance uses browser monotonic dispatch order',async()=>{
 const clock={current:15.75},h=home(new Map(),clock);await h.start();await h.list([row(2480,{state:'uploaded',word_progress:progress(id(2480)),word_progress_unavailable:false})]);h.word(id(2480)).props.onReadProgress();h.render();await h.settle();await h.wordResponse(h.pendingWord()[0],progress(id(2480),2));assert.equal(h.word(id(2480)).props.readbackStartedAt,15.75);h.unmount();
});
await check('ordinary list failure disables actual upload/submit and successful same-owner read restores known actions',async()=>{
 const h=home();await h.start();await h.list(rows(2500,1));await choose(h,'PURE SYNTHETIC KNOWN FILE');await h.click('刷新');h.pendingList().respond(503,{error:'synthetic unavailable'});await h.settle();assert.equal(nodeButton(h,'上传文章').props.disabled,true);assert.equal(nodeButton(h,'求助小鱼').props.disabled,true);await h.click('刷新');await h.list(rows(2500,1));assert.equal(nodeButton(h,'上传文章').props.disabled,false);assert.equal(nodeButton(h,'求助小鱼').props.disabled,false);h.unmount();
});
await check('Word auth callback clears current owner while detached old callback cannot clear new owner',async()=>{
 const h=home();await h.start();await h.list(rows(2600,1,'processing'));const old=h.word(id(2600));assert.equal(typeof old.props.onAuthRequired,'function');old.props.onAuthRequired();h.render();await h.settle();assert.deepEqual(visibleIds(h),[]);await h.click('刷新');await h.list(rows(2700,1,'processing'),{owner_scope:scope('B')});old.props.onAuthRequired();h.render();await h.settle();assert.deepEqual(visibleIds(h),[id(2700)]);h.word(id(2700)).props.onAuthRequired();h.render();await h.settle();assert.deepEqual(visibleIds(h),[]);h.unmount();
});
await check('list DTO cannot forge raw Word readback; failed GET creates none; successful GET retains raw provenance',async()=>{
 const h=home();await h.start();const p=progress(id(2800));await h.list([row(2800,{state:'uploaded',word_progress:p,word_progress_unavailable:false,word_progress_readback:p,word_progress_readback_started_at:9999999999999})]);assert.equal(h.word(id(2800)).props.readback,undefined);assert.equal(h.word(id(2800)).props.readbackStartedAt,undefined);
 h.word(id(2800)).props.onReadProgress();h.render();await h.settle();const first=h.pendingWord()[0];assert.ok(first);first.respond(503,{error:'synthetic unavailable'});await h.settle();assert.equal(h.word(id(2800)).props.readback,undefined);
 const before=Date.now();h.word(id(2800)).props.onReadProgress();h.render();await h.settle();const second=h.pendingWord()[0];assert.ok(second);await h.wordResponse(second,progress(id(2800),2));const raw=h.word(id(2800)).props.readback,start=h.word(id(2800)).props.readbackStartedAt;assert.equal(raw.version,2);assert.equal(raw.target_id,id(2800));assert.ok(start>=before&&start<=Date.now());
 await h.poll();await h.list([row(2800,{state:'uploaded',word_progress:progress(id(2800),3),word_progress_unavailable:false,word_progress_readback:progress(id(2800),999),word_progress_readback_started_at:9999999999999})]);assert.equal(h.word(id(2800)).props.readback,raw);assert.equal(h.word(id(2800)).props.readbackStartedAt,start);h.unmount();
});
for(const missing of ['execution','save'])await check('actual per-card GET missing '+missing+' is rejected without a crash or raw proof; valid same-task retry recovers',async()=>{
 const h=home();await h.start();const prior=progress(id(2900),1);await h.list([row(2900,{state:'uploaded',word_progress:prior,word_progress_unavailable:false})]);
 h.word(id(2900)).props.onReadProgress();h.render();await h.settle();const invalid=progress(id(2900),2);delete invalid[missing];await h.wordResponse(h.pendingWord()[0],invalid);
 assert.doesNotThrow(()=>h.markup(),'actual Word render must survive an incomplete successful GET');assert.equal(h.word(id(2900)).props.unavailable,true);assert.equal(h.word(id(2900)).props.readback,undefined,'bad DTO must never become raw successful-read proof');assert.equal(h.word(id(2900)).props.readbackStartedAt,undefined);assert.equal(h.word(id(2900)).props.progress.version,1,'prior valid observation is retained');
 h.word(id(2900)).props.onReadProgress();h.render();await h.settle();await h.wordResponse(h.pendingWord()[0],progress(id(2900),3));assert.doesNotThrow(()=>h.markup());assert.equal(h.word(id(2900)).props.unavailable,false);assert.equal(h.word(id(2900)).props.readback.version,3);assert.equal(h.word(id(2900)).props.readback.target_id,id(2900));assert.equal(writes(h).length,0,'recovery uses only the existing per-card GET');h.unmount();
});
for(const missing of ['execution','save'])await check('list DTO missing '+missing+' cannot crash Home summaries or manufacture Word proof',async()=>{
 const h=home();await h.start();const invalid=progress(id(3000),2);delete invalid[missing];await h.list([row(3000,{state:'uploaded',word_progress:invalid,word_progress_unavailable:false})]);assert.doesNotThrow(()=>h.markup());assert.equal(h.word(id(3000)).props.unavailable,true);assert.equal(h.word(id(3000)).props.progress,null);assert.equal(h.word(id(3000)).props.readback,undefined);assert.equal(h.word(id(3000)).props.readbackStartedAt,undefined);
 h.word(id(3000)).props.onReadProgress();h.render();await h.settle();await h.wordResponse(h.pendingWord()[0],progress(id(3000),3,3,{can_control_word:true}));assert.doesNotThrow(()=>h.markup());assert.equal(h.word(id(3000)).props.readback.version,3);const raw=h.word(id(3000)).props.readback,start=h.word(id(3000)).props.readbackStartedAt;assert.match(h.markup(),/>暂停<\/button>/);await h.poll();await h.list([row(3000,{state:'uploaded',word_progress:invalid,word_progress_unavailable:false,word_progress_deferred:true})]);assert.equal(h.word(id(3000)).props.progress.version,3);assert.equal(h.word(id(3000)).props.unavailable,true,'prior valid observation remains stale after a malformed list snapshot');assert.equal(h.word(id(3000)).props.readback,raw);assert.equal(h.word(id(3000)).props.readbackStartedAt,start);assert.doesNotMatch(h.markup(),/>暂停<\/button>/,'stale preserved observation cannot expose control actions');assert.equal(writes(h).length,0);h.unmount();
});
for(const [path,hash]of sourceHashes)assert.equal(createHash('sha256').update(fs.readFileSync(path)).digest('hex'),hash,'actual source unchanged during synthetic regression');
console.log(JSON.stringify({passed,failed:failures.length,failures,real_network_calls:0,real_platform_calls:0,production_writes:0,scope:'actual Home hooks/fetch handlers; exact synthetic file bytes, storage, same-owner successful reads and raw per-card provenance'}));
if(failures.length)process.exitCode=1;
