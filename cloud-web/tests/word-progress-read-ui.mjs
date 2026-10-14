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
 vm.runInNewContext(pageCode,{exports,require:name=>name==='react'?hooks:name==='../components/article-list-clear'||name==='../components/article-content-clear'||name==='../components/article-workspace-action'?{default:Clear}:name==='../components/word-stage-progress'?stages:name==='../components/publish-focus'?publish:name==='../components/studio-nav'?nav:name==='../components/upload-progress'?upload:require(name),AbortController,AbortSignal,Response,Date,Intl,navigator:{onLine:true},window,fetch:(url,options={})=>{
  assert.equal(options.method||'GET','GET','read-chain regression must never send a business write');
  assert.match(url,/^\/api\/articles(?:\?pending_offset=\d+|\/[^/]+\/word-progress)?$/,'only normal article and Word progress GETs are permitted');
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const request={url,options,resolve:body=>{assert.equal(request.settled,false,'fixture response is single-use');request.settled=true;resolve(new Response(JSON.stringify(body),{status:200}));},respond:(status,body)=>{assert.equal(request.settled,false);request.settled=true;resolve(new Response(JSON.stringify(body),{status}));},reject:reason=>{assert.equal(request.settled,false);request.settled=true;reject(reason);},settled:false};
  requests.push(request);return promise;
 }});
 function render(){assert.equal(unmounted,false);let turns=0;do{assert.ok(++turns<30,'Home effects must settle without a read loop');cursor=0;dirty=false;tree=exports.default();const run=effects;effects=[];run.forEach(fn=>fn());}while(dirty||effects.length);return tree;}
 async function settle(){for(let i=0;i<12;i++){await Promise.resolve();if(dirty||effects.length)render();}return tree;}
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
  pendingList(){return requests.find(request=>!request.settled&&!request.options.signal?.aborted&&!request.url.includes('/word-progress'));},
  pendingWord(){return requests.filter(request=>!request.settled&&!request.options.signal?.aborted&&request.url.includes('/word-progress'));},
  async list(rows,extra={}){const request=this.pendingList();assert.ok(request,'expected deferred list GET');request.resolve({owner_scope:'a'.repeat(64),items:rows,connected:true,pending_total:rows.filter(value=>value.list_section!=='recent').length,next_offset:null,...extra});return settle();},
  async wordResponse(request,value,extra={}){request.resolve({article_id:decodeURIComponent(request.url.split('/')[3]),output_mode:null,word_progress:value,word_progress_unavailable:!value,...extra});return settle();},
  async event(name,event={}){for(const fn of [...(listeners.get(name)||[])])fn(event);render();return settle();},
  async poll(){const interval=[...timers.values()].find(timer=>timer.repeat&&timer.delay>=8000);assert.ok(interval);interval.fn();render();return settle();},
  async clear(ids){const control=elements(tree,node=>node.type===Clear)[0];assert.ok(control,'expected actual Home clear callback');(control.props.onChanged||control.props.onDeleted)(ids);render();return settle();},
  unmount(){for(const slot of slots)if(slot?.effect)slot.cleanup?.();unmounted=true;},
  async drainLate(){for(let i=0;i<12;i++)await Promise.resolve();}
 };
}

const requestTarget=request=>decodeURIComponent(request.url.split('/')[3]);
const countOf=element=>element?.props.progress?.steps.find(step=>step.id==='collect_images')?.counts?.completed;
const readCalls=h=>h.requests.filter(request=>request.url.includes('/word-progress'));
const checks=[];
async function check(name,fn){await fn();checks.push(name);}

await check('list timeout/defer recovers only missing processing Word progress with at most two GETs',async()=>{
 const h=home();await h.start();
 const rows=Array.from({length:7},(_,index)=>row(index+1));
 rows.push(row(8,{word_progress:progress(id(8),5,8),word_progress_unavailable:false}));
 for(let index=9;index<=26;index++)rows.push(row(index,{state:index===9?'word_ready':index===10?'failed':index===11?'queued':index===12?'completed':'uploaded',list_section:index>=12?'recent':'work'}));
 await h.list(rows);
 assert.equal(h.pendingWord().length,2,'automatic per-card fallback is bounded at two concurrent GETs');
 assert.deepEqual(h.pendingWord().map(requestTarget),[id(1),id(2)]);
 assert.equal(h.word(id(8)).props.progress.version,5,'a valid worklist projection needs no redundant GET');
 let iterations=0;
 while(h.pendingWord().length){
  assert.ok(++iterations<9,'one snapshot cannot form an automatic read loop');
  const request=h.pendingWord()[0],target=requestTarget(request);
  await h.wordResponse(request,progress(target,2,Number(target.slice(-12))));
  assert.ok(h.pendingWord().length<=2,'completion must not overfill the two-read capacity');
 }
 assert.equal(readCalls(h).length,7,'only the seven missing processing cards are automatically read');
 for(let index=1;index<=7;index++){
  assert.equal(countOf(h.word(id(index))),index,'actual per-card GET replaces only its own pending projection');
  assert.equal(!!h.word(id(index)).props.unavailable,false,'successful cached read clears unavailable');
 }
 assert.match(h.markup(),/已找到候选 7 张/);
 assert.doesNotMatch(Array.from({length:8},(_,index)=>renderToStaticMarkup(h.word(id(index+1)))).join(''),/排队中|Word 已就绪|本次配图已用 \d|\d+%/,'successful processing GET cannot manufacture queue, final save or attempt clock; unrelated durable queued cards retain their genuine state');
 h.unmount();
});

await check('missing nonprocessing and history cards remain lazy, and text-only cards make no Word read',async()=>{
 const h=home();await h.start();await h.list([row(30,{state:'completed',list_section:'recent'}),row(31,{state:'uploaded',list_section:'work'}),row(32,{output_mode:'text_only'}),row(33,{state:'word_ready'})]);
 assert.equal(readCalls(h).length,0,'idle history and text-only work are not part of the automatic queue');
 assert.equal(h.word(id(32)),undefined,'text-only card has no Word progress control');
 assert.doesNotMatch(h.markup(),/合成客户端回归 30/,'completed history is absent from the current processing panel');await h.toggleWord(id(33),false);assert.equal(readCalls(h).length,0,'closing details must not read');
 await h.toggleWord(id(33));assert.equal(readCalls(h).length,1,'opening actual completed-card Word details requests that card');
 assert.equal(requestTarget(h.pendingWord()[0]),id(33));
 await h.toggleWord(id(33));assert.equal(readCalls(h).length,1,'repeat toggle deduplicates the same in-flight GET');
 await h.wordResponse(h.pendingWord()[0],progress(id(33),2,6));
 await h.toggleWord(id(33));assert.equal(readCalls(h).length,1,'a healthy existing projection needs no extra toggle read');
 await h.toggleWord(id(31));assert.equal(requestTarget(h.pendingWord()[0]),id(31),'manual lazy read is scoped to the expanded history card');
 await h.wordResponse(h.pendingWord()[0],null,{output_mode:'text_only',word_progress_unavailable:false});
 assert.equal(h.word(id(31)),undefined,'actual text-only GET response hides the irrelevant Word display');
 h.unmount();
});

await check('deferred list state is a neutral lazy projection, while deferred processing receives real per-card GET',async()=>{
 const h=home();await h.start();await h.list([row(35,{state:'uploaded',list_section:'work',word_progress_deferred:true,word_progress_unavailable:false}),row(36,{word_progress_deferred:true,word_progress_unavailable:false})]);
 assert.equal(readCalls(h).length,1);assert.equal(requestTarget(h.pendingWord()[0]),id(36));
 assert.equal(h.word(id(35)).props.deferred,true);assert.equal(h.word(id(35)).props.unavailable,false);
 assert.match(h.markup(),/查看 Word 进度/,'not requested is distinct from a failed progress read');
 assert.doesNotMatch(h.markup(),/进度暂不可用/);
 await h.toggleWord(id(35));assert.equal(h.pendingWord().length,2);
 for(const request of [...h.pendingWord()])await h.wordResponse(request,progress(requestTarget(request),1,3));
 h.unmount();
});

await check('a valid cached progress survives later list nulls and cannot lose verified step counts',async()=>{
 const h=home();await h.start();const retained=progress(id(40),8,18);await h.list([row(40,{word_progress:retained,word_progress_unavailable:false})]);
 assert.equal(countOf(h.word(id(40))),18);assert.equal(readCalls(h).length,0);
 await h.click('刷新');await h.list([row(40)]);
 assert.equal(countOf(h.word(id(40))),18,'later unavailable list must retain same-article verified counts');
 assert.equal(h.word(id(40)).props.unavailable,true,'historical data remains visibly stale until a real read succeeds');
 const request=h.pendingWord()[0];assert.ok(request,'unavailable processing row schedules real per-card GET');
 await h.wordResponse(request,progress(id(40),3,1));
 assert.equal(countOf(h.word(id(40))),18,'lower executor observation version cannot roll back old verified counts');
 h.unmount();
});

await check('manual refresh keeps an in-flight read and late arrival must merge with a newer list projection',async()=>{
 const h=home();await h.start();await h.list([row(50)]);const request=h.pendingWord()[0];assert.ok(request);
 await h.click('刷新');assert.equal(request.options.signal.aborted,false,'normal refresh must not starve in-flight cached GET');
 await h.list([row(50,{word_progress:progress(id(50),9,22),word_progress_unavailable:false})]);
 await h.wordResponse(request,progress(id(50),2,2));
 assert.equal(countOf(h.word(id(50))),22,'late lower-version GET cannot overwrite successful newer list progress');
 assert.equal(readCalls(h).length,1,'refresh deduplicates the per-id in-flight read');
 h.unmount();
});

await check('null progress and network failures remain unavailable without forged stage, queue or grant',async()=>{
 const h=home();await h.start();await h.list([row(60),row(61)]);const [empty,failed]=h.pendingWord();
 await h.wordResponse(empty,null);
 failed.reject(new Error('Synthetic GET disconnected'));await h.settle();
 for(const target of [id(60),id(61)])assert.equal(h.word(target).props.progress,null);
 assert.match(h.markup(),/进度暂不可用/);
 assert.doesNotMatch(h.markup(),/排队中|Word 已就绪|读取原文|已找到候选|本次配图已用/,'failed reads cannot fabricate the six stages or output evidence');
 assert.equal(readCalls(h).length,2,'failed automatic reads do not recursively retry in the same snapshot');
 await h.poll();await h.list([row(60),row(61)]);assert.equal(readCalls(h).length,2,'same-id automatic retries obey the eight-second cooldown');
 await h.retryWord(id(60));assert.equal(readCalls(h).length,3,'explicit retry bypasses automatic cooldown');
 await h.wordResponse(h.pendingWord()[0],progress(id(60),1,4));
 h.unmount();
});

await check('a per-card 404/503 failure frees queue capacity, preserves old evidence and cannot block other cards',async()=>{
 const h=home();await h.start();await h.list([row(63,{word_progress:progress(id(63),6,12)}),row(64),row(65)]);
 const first=h.pendingWord().find(request=>requestTarget(request)===id(63));first.respond(404,{error:'Synthetic removed target'});await h.settle();
 assert.equal(countOf(h.word(id(63))),12);assert.equal(h.word(id(63)).props.unavailable,true);
 assert.ok(h.pendingWord().some(request=>requestTarget(request)===id(65)),'other cards continue after one definitive read failure');
 for(const request of [...h.pendingWord()]){
  if(requestTarget(request)===id(64)){request.respond(503,{error:'Synthetic read unavailable'});await h.settle();}
  else await h.wordResponse(request,progress(requestTarget(request),1,5));
 }
 assert.equal(countOf(h.word(id(65))),5);assert.equal(readCalls(h).length,3);
 h.unmount();
});

const control=(version,status,desired='run')=>({version,epoch:1,desired,status,reason:'none',heartbeat_at:'2026-10-10T02:00:00.000Z',heartbeat_overdue:false,retry_count:0,retry_after:null,execution_confirmed:status==='running',automatic_dispatch_available:false});
await check('delayed Word GET preserves newer list counts while accepting its independently newer pause',async()=>{
 const h=home();await h.start();
 const early=progress(id(103),2,2,{started_at:'2026-10-10T02:00:00.000Z',read_at:'2026-10-10T02:00:00.000Z',recovery:control(1,'running'),can_control_word:true});
 await h.list([row(103,{word_progress:early,word_progress_unavailable:true})]);const delayed=h.pendingWord()[0];assert.ok(delayed);
 await h.click('刷新');const before=progress(id(103),9,18,{started_at:early.started_at,recovery:control(1,'running'),can_control_word:true});
 await h.list([row(103,{word_progress:before,word_progress_unavailable:false})]);assert.equal(delayed.options.signal.aborted,false);
 const after=progress(id(103),2,2,{started_at:early.started_at,read_at:'2026-10-10T02:00:02.000Z',recovery:control(2,'paused','paused'),can_control_word:true});
 await h.wordResponse(delayed,after);const merged=h.word(id(103)).props.progress;
 assert.equal(merged.version,9);assert.equal(countOf(h.word(id(103))),18);assert.equal(merged.recovery.version,2);assert.equal(merged.recovery.desired,'paused');
 assert.match(h.markup(),/<strong>已暂停<\/strong>/);assert.doesNotMatch(h.markup(),/<strong>正在找图片<\/strong>/);
 await h.click('刷新');await h.list([row(103,{word_progress:progress(id(103),10,20,{started_at:early.started_at,read_at:'2026-10-10T02:00:03.000Z',recovery:control(1,'running'),can_control_word:true}),word_progress_unavailable:false})]);
 assert.equal(countOf(h.word(id(103))),20);assert.equal(h.word(id(103)).props.progress.recovery.version,2);assert.match(h.markup(),/<strong>已暂停<\/strong>/);
 h.unmount();
});
await check('list merge accepts newer paused control independently of its older step projection',async()=>{
 const h=home();await h.start();const started_at='2026-10-10T02:00:00.000Z';
 await h.list([row(104,{word_progress:progress(id(104),9,18,{started_at,recovery:control(1,'running')}),word_progress_unavailable:false})]);
 await h.click('刷新');await h.list([row(104,{word_progress:progress(id(104),2,2,{started_at,read_at:'2026-10-10T02:00:02.000Z',recovery:control(2,'paused','paused')}),word_progress_unavailable:false})]);
 assert.equal(h.word(id(104)).props.progress.version,9);assert.equal(countOf(h.word(id(104))),18);assert.equal(h.word(id(104)).props.progress.recovery.version,2);assert.match(h.markup(),/<strong>已暂停<\/strong>/);h.unmount();
});

const attempt=(generation)=>({attempt_id:id(200+generation),generation,state:'running',started_at:'2026-10-10T02:00:00.000Z',active_elapsed_ms:1000,active_started_at:'2026-10-10T02:00:00.000Z',read_at:'2026-10-10T02:00:01.000Z',timeout_ms:3600000,timeout_due:false,stop_requested_at:null,reason:'none',restarts_used:generation-1,max_restarts:2});
await check('attempt generation wins over observation version and the next actual attempt resets old counts',async()=>{
 const h=home();await h.start();await h.list([row(66,{word_progress:progress(id(66),8,18,{attempt:attempt(2)})})]);
 const stale=h.pendingWord()[0];await h.wordResponse(stale,progress(id(66),99,99,{attempt:attempt(1),read_at:'2026-10-10T03:00:00.000Z'}));
 assert.equal(countOf(h.word(id(66))),18);assert.equal(h.word(id(66)).props.progress.attempt.generation,2,'late previous attempt must not win by timestamp or observation version');
 await h.click('刷新');await h.list([row(66)]);await h.wordResponse(h.pendingWord()[0],progress(id(66),0,1,{attempt:attempt(3),read_at:'2026-10-10T03:00:01.000Z'}));
 assert.equal(countOf(h.word(id(66))),1);assert.equal(h.word(id(66)).props.progress.attempt.generation,3,'new actual attempt does not inherit previous attempt candidates');
 h.unmount();
});

await check('wrong article response is rejected without changing any other card',async()=>{
 const h=home();await h.start();await h.list([row(67),row(68)]);const first=h.pendingWord().find(request=>requestTarget(request)===id(67));
 await h.wordResponse(first,progress(id(68),99,999),{article_id:id(68)});
 assert.equal(h.word(id(67)).props.progress,null);assert.equal(h.word(id(67)).props.unavailable,true);
 assert.equal(h.word(id(68)).props.progress,null,'response-body target cannot reroute an earlier request');
 await h.wordResponse(h.pendingWord()[0],progress(id(68),1,8));assert.equal(countOf(h.word(id(68))),8);
 h.unmount();
});

await check('a delayed source-A GET cannot overwrite the same article after a source-B list read',async()=>{
 const h=home();await h.start();await h.list([row(69,{word_progress:progress(id(69),1,2)})]);const old=h.pendingWord()[0];assert.ok(old);
 await h.click('刷新');await h.list([row(69,{word_progress:progress(id(69),2,9,{input_sha256:'b'.repeat(64),read_at:'2026-10-10T03:00:00.000Z'}),word_progress_unavailable:false})]);
 await h.wordResponse(old,progress(id(69),99,999,{input_sha256:'a'.repeat(64),read_at:'2026-10-10T04:00:00.000Z'}));
 assert.equal(h.word(id(69)).props.progress.input_sha256,'b'.repeat(64),'changed frozen input rejects the old scope even if that GET completes later');
 assert.equal(countOf(h.word(id(69))),9);
 h.unmount();
});

await check('a dispatch without prior progress cannot overwrite a newly known different frozen source',async()=>{
 const h=home();await h.start();await h.list([row(72)]);const old=h.pendingWord()[0];
 await h.click('刷新');await h.list([row(72,{word_progress:progress(id(72),2,9,{input_sha256:'b'.repeat(64),read_at:'2026-10-10T03:00:00.000Z'}),word_progress_unavailable:false})]);
 await h.wordResponse(old,progress(id(72),99,999,{input_sha256:'a'.repeat(64),read_at:'2026-10-10T04:00:00.000Z'}));
 assert.equal(h.word(id(72)).props.progress.input_sha256,'b'.repeat(64));assert.equal(countOf(h.word(id(72))),9);
 h.unmount();
});

await check('an old text-only/null success cannot erase Word progress and output mode learned while its GET was pending',async()=>{
 const h=home();await h.start();await h.list([row(79)]);const old=h.pendingWord()[0];assert.ok(old);
 await h.click('刷新');await h.list([row(79,{output_mode:null,has_result:true,word_progress:progress(id(79),2,9,{input_sha256:'b'.repeat(64),read_at:'2026-10-10T03:00:00.000Z'}),word_progress_unavailable:false})]);
 await h.wordResponse(old,null,{output_mode:'text_only',word_progress_unavailable:false});
 assert.ok(h.word(id(79)),'the late text-only mode must not hide the newer Word component');
 assert.equal(h.word(id(79)).props.progress.input_sha256,'b'.repeat(64));assert.equal(countOf(h.word(id(79))),9);
 assert.equal(h.word(id(79)).props.unavailable,false);
 assert.match(h.markup(),new RegExp(`/api/articles/${id(79)}/download`),'the newer Word output mode retains its existing download control');
 h.unmount();
});

for(const scenario of [
 {name:'source A to B before late 503',index:76,initial:progress(id(76),1,2),next:progress(id(76),2,9,{input_sha256:'b'.repeat(64),read_at:'2026-10-10T03:00:00.000Z'}),status:503},
 {name:'attempt generation 1 to 2 before late network failure',index:77,initial:progress(id(77),1,2,{attempt:attempt(1)}),next:progress(id(77),2,9,{attempt:attempt(2),read_at:'2026-10-10T03:00:00.000Z'})},
 {name:'unknown progress to known progress before late 503',index:78,initial:null,next:progress(id(78),2,9,{read_at:'2026-10-10T03:00:00.000Z'}),status:503}
])await check(`late failure fence: ${scenario.name}`,async()=>{
 const h=home();await h.start();await h.list([row(scenario.index,{word_progress:scenario.initial})]);const old=h.pendingWord()[0];assert.ok(old);
 await h.click('刷新');await h.list([row(scenario.index,{word_progress:scenario.next,word_progress_unavailable:false})]);
 if(scenario.status)old.respond(scenario.status,{error:'Synthetic older-scope unavailable'});else old.reject(new Error('Synthetic older-scope network failure'));
 await h.settle();
 assert.equal(countOf(h.word(id(scenario.index))),9);assert.equal(h.word(id(scenario.index)).props.unavailable,false,'an old-scope failure cannot mark the newer successful read unavailable');
 assert.equal(h.word(id(scenario.index)).props.progress.input_sha256,scenario.next.input_sha256);
 assert.equal(h.word(id(scenario.index)).props.progress.attempt?.generation,scenario.next.attempt?.generation);
 h.unmount();
});

await check('metadata-only deferred list reads retain an earlier per-card failure and its existing evidence',async()=>{
 const h=home();await h.start();const old=progress(id(73),5,12);await h.list([row(73,{state:'word_ready',list_section:'work',word_progress:old,word_progress_unavailable:true})]);
 await h.toggleWord(id(73));h.pendingWord()[0].respond(503,{error:'Synthetic read failed'});await h.settle();
 await h.poll();await h.list([row(73,{state:'word_ready',list_section:'work',word_progress_deferred:true,word_progress_unavailable:false})]);
 assert.equal(countOf(h.word(id(73))),12);assert.equal(h.word(id(73)).props.unavailable,true,'unread metadata cannot erase a real earlier Word read failure');
 assert.equal(h.word(id(73)).props.deferred,true);assert.equal(readCalls(h).length,1,'history remains lazy even after the prior failure');
 assert.match(h.markup(),/进度暂不可用/);assert.match(h.markup(),/已找到候选 12 张/);
 await h.retryWord(id(73));await h.wordResponse(h.pendingWord()[0],progress(id(73),6,15));
 assert.equal(h.word(id(73)).props.unavailable,false);assert.equal(countOf(h.word(id(73))),15);
 h.unmount();
});

await check('offline display does not infer executor loss and prevents detail-triggered reads',async()=>{
 const h=home();await h.start();await h.event('offline');await h.list([row(74),row(75,{state:'word_ready',list_section:'work',word_progress:progress(id(75),2,8)})]);
 assert.equal(readCalls(h).length,0,'initial processing fallback waits while the page knows it is offline');
 await h.toggleWord(id(74));await h.toggleWord(id(75));assert.equal(readCalls(h).length,0,'offline details cannot start a new GET');
 assert.match(h.markup(),/网页网络已断开/);assert.match(h.markup(),/后台执行情况未确认/);assert.match(h.markup(),/已找到候选 8 张/);
 assert.doesNotMatch(h.markup(),/执行者已结束|后台停止|Word 已就绪/);
 h.unmount();
});

await check('bfcache pageshow aborts and fences the old account page before fresh reads',async()=>{
 const h=home();await h.start();await h.list([row(70)]);const old=h.pendingWord()[0];
 await h.event('pageshow',{persisted:true});assert.equal(old.options.signal.aborted,true);
 await h.list([row(71,{word_progress:progress(id(71),1,4),word_progress_unavailable:false})]);
 await h.wordResponse(old,progress(id(70),99,999));
 assert.equal(h.word(id(71)).props.progress.target_id,id(71));
 assert.doesNotMatch(h.markup(),/合成客户端回归 70|999 张/,'earlier account page cannot repopulate current state');
 h.unmount();
});

await check('owner auth failure cancels all old Word reads and cannot resurrect private cards',async()=>{
 const h=home();await h.start();await h.list([row(80),row(81)]);const old=h.pendingWord();
 await h.click('刷新');h.pendingList().respond(401,{error:'Synthetic authentication expired'});await h.settle();
 assert.ok(old.every(request=>request.options.signal.aborted),'authentication failure must cancel prior account reads');
 for(const request of old)await h.wordResponse(request,progress(requestTarget(request),99,999));
 assert.match(h.markup(),/请使用本人 ChatGPT 账号登录/);
 assert.doesNotMatch(h.markup(),/合成客户端回归 8[01]|999 张/);
 h.unmount();
});

await check('a Word GET 403 aborts the list, all concurrent reads and queued private-card work',async()=>{
 const h=home();await h.start();await h.list([row(83),row(84),row(85),row(86)]);const old=h.pendingWord();
 await h.click('刷新');const list=h.pendingList();assert.ok(list);old[0].respond(403,{error:'Synthetic wrong owner'});await h.settle();
 assert.equal(list.options.signal.aborted,true);assert.equal(old[1].options.signal.aborted,true);
 list.resolve({owner_scope:'a'.repeat(64),items:[row(83)],connected:true});old[1].resolve({article_id:id(84),output_mode:null,word_progress:progress(id(84),99,999),word_progress_unavailable:false});await h.settle();
 assert.equal(readCalls(h).length,2,'authentication failure removes queued requests before their dispatch');
 assert.match(h.markup(),/当前账号暂无访问权限/);assert.doesNotMatch(h.markup(),/合成客户端回归 8[3-6]|999 张/);
 h.unmount();
});

await check('actual Home clear callback removes and fences the cleared card without a deletion POST',async()=>{
 const h=home();await h.start();await h.list([row(90),row(91)]);const old=h.pendingWord();
 await h.clear([id(90)]);assert.ok(old.every(request=>request.options.signal.aborted),'clear advances the read epoch and aborts its stale queue');
 await h.list([row(91,{word_progress:progress(id(91),2,7),word_progress_unavailable:false})]);
 for(const request of old)await h.wordResponse(request,progress(requestTarget(request),99,999));
 assert.equal(countOf(h.word(id(91))),7,'pre-clear responses cannot mutate the refreshed snapshot');
 assert.doesNotMatch(h.markup(),/合成客户端回归 90|999 张/);
 h.unmount();
});

await check('unmount aborts deferred GETs and late fulfilled responses do not commit state',async()=>{
 const h=home();await h.start();await h.list([row(100),row(101)]);const old=h.pendingWord();h.unmount();
 assert.ok(old.every(request=>request.options.signal.aborted));
 for(const request of old)request.resolve({article_id:requestTarget(request),output_mode:null,word_progress:progress(requestTarget(request),99,999),word_progress_unavailable:false});
 await h.drainLate();
});

for(const [path,hash] of sourceHashes)assert.equal(createHash('sha256').update(fs.readFileSync(path)).digest('hex'),hash,'loaded source must remain unchanged during this regression run');
console.log(JSON.stringify({status:'PASS',scope:'synthetic client regression; actual Home hooks, effects and GET handlers; no production DOM/browser/visual acceptance',checks:checks.length,sources:Object.fromEntries(sourceHashes),cases:checks},null,2));
