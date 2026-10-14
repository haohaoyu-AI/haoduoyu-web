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

function visibleElements(node,predicate,result=[]){if(Array.isArray(node)){for(const child of node)visibleElements(child,predicate,result);return result;}if(!node||typeof node!=='object'||node.props?.hidden||node.props?.inert)return result;if(predicate(node))result.push(node);for(const child of children(node))visibleElements(child,predicate,result);return result;}
const cards=h=>visibleElements(h.tree,node=>node.type==='article');
const visibleActions=h=>visibleElements(h.tree,node=>node.type===Clear);
const selectors=h=>elements(h.tree,node=>node.type==='button'&&typeof node.props['aria-label']==='string'&&node.props['aria-label'].startsWith('查看文章：'));
const selector=(h,index)=>selectors(h).find(node=>node.props['aria-label']===`查看文章：合成客户端回归 ${index}`);
const writes=h=>h.requests.filter(request=>request.options.method==='POST');
const saved=index=>row(index,{state:'completed',has_result:true,toutiao_verified_readback:true,draft_url:'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=123',deliveries:[{platform:'zhihu',state:'saved',verified_readback:true,draft_url:'https://zhuanlan.zhihu.com/p/321/edit'}],recovery:{unfinished:true,can_notify:false,can_retry:false,lease_expires:'2099-01-01T00:00:00.000Z'}});
async function select(h,index){const button=selector(h,index);assert.ok(button,'other unfinished article has a read-only selection');assert.equal(button.props.disabled,false);button.props.onClick();h.render();await h.settle();}
function selected(h,index){assert.equal(cards(h).length,1,'exactly one complete article card is visible');assert.match(text(cards(h)[0]),new RegExp(`合成客户端回归 ${index}(?![0-9])`));const hidden=elements(h.tree,node=>node.type==='details'&&node.props.className==='publish-fold publish-current-item'&&node.props.hidden);for(const detail of hidden){assert.equal(detail.props.inert,true,'retained inactive instances cannot be used through the UI');assert.equal(detail.props['aria-hidden'],true);}}
let passed=0;const failures=[];
async function check(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(error){failures.push(name);console.error('FAIL '+name+': '+error.message);}}
await check('initial multi-work list displays one card and read-only selectors with complete clear scope',async()=>{
 const h=home();await h.start();await h.list(rows(1,3));selected(h,1);assert.equal(selectors(h).length,2);assert.deepEqual(visibleIds(h),[id(1),id(2),id(3)]);assert.equal(visibleActions(h).length,2,'bulk clear and selected-card delete only');assert.equal(writes(h).length,0);h.unmount();
});
await check('initial selection prefers the article actually in processing over a newer upload',async()=>{
 const h=home();await h.start();await h.list([row(4,{state:'uploaded'}),row(5,{state:'processing'}),row(6,{state:'queued'})]);selected(h,5);assert.equal(writes(h).length,0);h.unmount();
});
await check('selecting another article replaces the complete card without submit or Word controls',async()=>{
 const h=home();await h.start();await h.list(rows(10,3));await select(h,12);selected(h,12);assert.equal(selectors(h).length,2);assert.equal(visibleActions(h).find(action=>!action.props.label).props.ids[0],id(12));assert.equal(writes(h).length,0);h.unmount();
});
await check('new background articles and reordering preserve the selected article',async()=>{
 const h=home();await h.start();await h.list(rows(20,3));await select(h,22);await h.poll();await h.list([row(19,{state:'uploaded'}),...rows(20,3).reverse()]);selected(h,22);assert.equal(selectors(h).length,3);assert.equal(writes(h).length,0);h.unmount();
});
await check('pagination preserves every loaded ID and makes older articles selectable with one visible card',async()=>{
 const h=home();await h.start();await h.list(rows(30,25),{pending_total:28,next_offset:25});await h.click('加载更多待处理文章');await h.list(rows(30,25),{pending_total:28,next_offset:25});assert.equal(h.pendingList().url,'/api/articles?pending_offset=25');await h.list(rows(55,3),{pending_total:28,next_offset:null});assert.equal(visibleIds(h).length,28);await select(h,57);selected(h,57);assert.equal(selectors(h).length,27);assert.match(h.markup(),/28 篇待处理/);assert.equal(writes(h).length,0);h.unmount();
});
await check('selected article removal chooses another readable article without writes',async()=>{
 const h=home();await h.start();await h.list(rows(60,3));await select(h,62);await h.poll();await h.list(rows(60,2));selected(h,60);assert.equal(selector(h,62),undefined);assert.equal(writes(h).length,0);h.unmount();
});
await check('same-session selection restores one article and legacy multi-focus storage still displays one card',async()=>{
 const storage=new Map(),first=home(storage);await first.start();await first.list(rows(70,3));await select(first,72);first.unmount();const next=home(storage);await next.start();await next.list(rows(70,3));selected(next,72);next.unmount();
 const legacy=new Map([['publish-studio-focus-v1',JSON.stringify({at:Date.now(),value:{seen:[id(70),id(71),id(72)],current:{[id(70)]:{complete:false,open:true},[id(71)]:{complete:false,open:true}}}})]]),old=home(legacy);await old.start();await old.list(rows(70,3));assert.equal(cards(old).length,1);assert.equal(selectors(old).length,2);old.unmount();
});
await check('owner change rejects detached selection and clears old cards, selectors and late progress',async()=>{
 const h=home();await h.start();await h.list(rows(80,3,'processing'));const old=selector(h,82);assert.ok(old);const late=h.pendingWord();await h.click('刷新');await h.list(rows(90,2),{owner_scope:scope('B')});assert.equal(cards(h).length,0);assert.equal(selectors(h).length,0);await h.click('刷新');await h.list(rows(90,2),{owner_scope:scope('B')});old.props.onClick();h.render();await h.settle();for(const request of late)await h.wordResponse(request,progress(id(80),99));selected(h,90);assert.deepEqual(visibleIds(h),[id(90),id(91)]);assert.equal(writes(h).length,0);h.unmount();
});
await check('late progress for the previously selected article cannot replace the new card',async()=>{
 const h=home();await h.start();await h.list(rows(100,2,'processing'));const old=h.pendingWord().find(request=>request.url.includes(id(100)));assert.ok(old);await select(h,101);await h.wordResponse(old,progress(id(100),10,99));selected(h,101);assert.equal(writes(h).length,0);h.unmount();
});
await check('active execution protection and exact current-delete scope survive read-only selection',async()=>{
 const h=home();await h.start();const active=row(111,{state:'needs_verification',recovery:{unfinished:true,can_notify:false,can_retry:false,lease_expires:'2099-01-01T00:00:00.000Z'}});await h.list([row(110,{state:'uploaded'}),active]);await select(h,111);selected(h,111);assert.equal(elements(cards(h)[0],node=>node.type==='button'&&/求助/.test(text(node))).length,0);assert.deepEqual(Array.from(visibleActions(h).find(action=>!action.props.label).props.ids),[id(111)]);assert.deepEqual(visibleIds(h),[id(110),id(111)]);assert.equal(writes(h).length,0);h.unmount();
});
await check('unknown same-article submit remains fenced after selecting away and back',async()=>{
 const h=home();await h.start();await h.list(rows(120,2));await h.click('求助小鱼');writes(h)[0].reject(new Error('synthetic lost submit'));await h.settle();await h.list(rows(120,2));await select(h,121);selected(h,121);await select(h,120);selected(h,120);const submit=elements(cards(h)[0],node=>node.type==='button'&&text(node)==='求助小鱼')[0];assert.equal(submit.props.disabled,true);assert.equal(writes(h).length,1);h.unmount();
});
await check('confirmed current removal falls back while the previously frozen bulk range remains exact',async()=>{
 const h=home();await h.start();await h.list(rows(130,3));const frozen=bulk(h),original=Array.from(frozen.props.ids);await select(h,132);await h.clear([id(132)]);selected(h,130);assert.deepEqual(original,[id(130),id(131),id(132)]);assert.deepEqual(visibleIds(h),[id(130),id(131)]);await h.list(rows(130,2));selected(h,130);assert.equal(writes(h).length,0);h.unmount();
});
await check('completed current draft yields to new processing work but stays available for explicit read-only review',async()=>{
 const h=home();await h.start();await h.list([row(140,{state:'processing'})]);selected(h,140);await h.poll();await h.list([saved(140),row(141,{state:'processing'})]);selected(h,141);await select(h,140);selected(h,140);assert.match(h.markup(),/当前草稿成果/);assert.match(text(cards(h)[0]),/两平台草稿已验收/);await h.poll();await h.list([saved(140),row(141,{state:'processing'})]);selected(h,140);assert.equal(writes(h).length,0);h.unmount();
});
await check('verified but still protected work rows remain visible and selectable without implying executor settlement',async()=>{
 const h=home();await h.start();await h.list([saved(145),saved(146)]);selected(h,145);assert.equal(selectors(h).length,1);await select(h,146);selected(h,146);assert.match(h.markup(),/当前草稿成果/);assert.deepEqual(visibleIds(h),[id(145),id(146)]);assert.equal(writes(h).length,0);h.unmount();
});
await check('old selected recent history cannot replace current work or render private history controls',async()=>{
 const storage=new Map([['publish-studio-focus-v1',JSON.stringify({at:Date.now(),value:{seen:[id(149)],selected:id(149),pinnedComplete:true,current:{[id(149)]:{complete:true,open:true}}}})]]),h=home(storage);await h.start();await h.list([saved(149),row(150,{state:'uploaded'})].map(article=>article.id===id(149)?{...article,list_section:'recent'}:article));selected(h,150);assert.doesNotMatch(h.markup(),/合成客户端回归 149/);assert.equal(selectors(h).length,0);assert.equal(writes(h).length,0);h.unmount();
});
await check('saved text-only work is labelled as text and does not claim platform draft verification',async()=>{
 const h=home();await h.start();await h.list([row(155,{state:'text_saved',output_mode:'text_only'})]);selected(h,155);assert.match(h.markup(),/当前文字稿/);assert.match(h.markup(),/文字稿已保存/);assert.doesNotMatch(h.markup(),/草稿已验收/);assert.equal(writes(h).length,0);h.unmount();
});
await check('empty current list mounts no card or hidden article operations',async()=>{
 const h=home();await h.start();await h.list([]);assert.equal(cards(h).length,0);assert.equal(selectors(h).length,0);assert.equal(actions(h).length,1);assert.equal(writes(h).length,0);h.unmount();
});
for(const [path,hash] of sourceHashes)assert.equal(createHash('sha256').update(fs.readFileSync(path)).digest('hex'),hash,'source must remain fixed during a regression run');
console.log(JSON.stringify({passed,failed:failures.length,failures,production_writes:0,platform_actions:0,scope:'actual Home hooks/handlers with inert GET fixtures; one visible complete card, safely retained hidden/inert instances, stable selection, loaded-ID scope and identity fences'}));
if(failures.length)process.exitCode=1;
