// Execute the actual desktop page hooks, GET handler and shared progress merge.
// The bridge and transport are inert synthetic fixtures. The Word marker only
// observes the props supplied by the real page; this is not browser acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {loadUiSource} from './ui-source-module.mjs';

const pagePath='app/desktop-word-only/page.tsx',stagePath='components/word-stage-progress.tsx';
const pageSource=fs.readFileSync(process.env.DESKTOP_PAGE_SOURCE||pagePath,'utf8');
const pageCode=ts.transpileModule(pageSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const stages=loadUiSource(stagePath);
assert.equal(typeof stages.mergeWordProgress,'function','the harness must execute the actual shared merge');
assert.equal(typeof stages.validateWordProgressDto,'function','the page must share the frontend DTO integrity gate');
const bridgeModule={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/desktop-word-bridge.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:bridgeModule,exports:bridgeModule.exports,Error,URLSearchParams});
const baseline=JSON.parse(fs.readFileSync('evidence/word-progress/v1-partial-fixture.json','utf8'));
const id=index=>`localword_00000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
const stamp=seconds=>new Date(Date.parse('2026-10-14T04:00:00.000Z')+seconds*1000).toISOString();
const make=()=>{
 const p=structuredClone(baseline);p.target_kind='local_word';p.target_id=id(1);p.input_sha256='a'.repeat(64);p.version=10;p.read_at=stamp(20);p.updated_at=stamp(19);p.can_control_word=true;
 p.attempt={attempt_id:'11111111-1111-4111-8111-111111111111',generation:1,state:'running',started_at:stamp(0),active_elapsed_ms:1000,active_started_at:stamp(0),read_at:p.read_at,timeout_ms:3600000,timeout_due:false,stop_requested_at:null,reason:'none',restarts_used:0,max_restarts:2};
 p.recovery={version:3,epoch:2,desired:'run',status:'running',reason:'none',heartbeat_at:p.read_at,heartbeat_overdue:false,retry_count:0,retry_after:null,execution_confirmed:true,automatic_dispatch_available:false,resource_class:'prepare',queue_reason:null,queue_revision:0,serial_mode:true,safety_stop_pending:false,attempt:p.attempt};
 assert.equal(stages.validateWordProgressDto(p),true,'the synthetic baseline must satisfy the actual DTO contract');return p;
};
const fresh=(original,seconds=30)=>{
 const p=structuredClone(original);p.version++;p.read_at=stamp(seconds);p.updated_at=stamp(seconds-1);
 if(p.attempt){p.attempt.read_at=p.read_at;p.recovery.attempt=p.attempt;}return p;
};
const job=p=>({id:p.target_id,input_sha256:p.input_sha256,source_kind:'local_desktop',output_mode:'word_only',destinations:[],word_progress:p,word_progress_unavailable:false});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const children=node=>Array.isArray(node?.props?.children)?node.props.children:[node?.props?.children];
function elements(node,predicate,result=[]){
 if(Array.isArray(node)){node.forEach(value=>elements(value,predicate,result));return result;}
 if(!node||typeof node!=='object')return result;if(predicate(node))result.push(node);
 children(node).forEach(value=>elements(value,predicate,result));return result;
}
const nodeText=node=>typeof node==='string'?node:Array.isArray(node)?node.map(nodeText).join(''):node?.props?nodeText(node.props.children):'';
const sameDeps=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
const WordMarker=()=>null;
function mounted(initial=make()){
 let slots=[],cursor=0,effects=[],dirty=true,tree,unmounted=false,lateCommits=0,storageReads=0;
 const requests=[],runs=[],deadlines=[],clock={value:100.125},wallClock={value:2000};
 const window={location:{hash:'#'+new URLSearchParams({nonce:'a'.repeat(64),batch_id:'b'.repeat(32),local_origin:'http://127.0.0.1:8876'}),pathname:'/desktop-word-only'},history:{replaceState(){window.location.hash='';}}};
 for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){storageReads++;throw Error('Synthetic capability must remain in memory');}});
 const hooks={
  useState(initialValue){const index=cursor++;if(!(index in slots))slots[index]=typeof initialValue==='function'?initialValue():initialValue;return [slots[index],value=>{if(unmounted){lateCommits++;throw Error('An unmounted desktop page must not commit state');}const next=typeof value==='function'?value(slots[index]):value;if(!Object.is(next,slots[index])){slots[index]=next;dirty=true;}}];},
  useRef(value){const index=cursor++;return slots[index]??={current:value};},
  useEffect(callback,deps){const index=cursor++,old=slots[index];if(!old||!sameDeps(old.deps,deps)){slots[index]={deps,cleanup:old?.cleanup};effects.push(()=>{old?.cleanup?.();slots[index].cleanup=callback();});}}
 };
 const pageModule={exports:{}};
 vm.runInNewContext(pageCode,{
  module:pageModule,exports:pageModule.exports,Error,Date:class extends Date{static now(){return wallClock.value;}},performance:{now:()=>clock.value},AbortController,
  AbortSignal:{any:signals=>AbortSignal.any(signals),timeout:delay=>{const controller=new AbortController();deadlines.push({delay,controller});return controller.signal;}},window,
  fetch(url,options){
   assert.match(url,/^\/api\/local-word-jobs\/localword_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,'the real handler may only GET an existing same-site local Word task');
   assert.equal(options.method,'GET','no POST, execution, dispatch or local path is allowed');assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');assert.ok(options.signal instanceof AbortSignal);
   const pending=deferred(),request={url,options,...pending,jsonCalls:0,responded:false};
   request.respond=(status,body,{raw='synthetic-only',jsonError,jsonGate}={})=>{request.responded=true;request.resolve({status,ok:status>=200&&status<300,text:async()=>raw,json:async()=>{request.jsonCalls++;if(jsonError)throw Error('Synthetic JSON parse failure');return jsonGate?await jsonGate.promise:body;}});};
   requests.push(request);return pending.promise;
  },
  require(name){
   if(name==='react')return hooks;
   if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
   if(name==='../../components/word-stage-progress')return {...stages,default:WordMarker};
   if(name==='../../lib/desktop-word-bridge')return {
    parseBridgeFragment:bridgeModule.exports.parseBridgeFragment,
    runDesktopWordBridge(spec,onState,signal,transport,onProgress){const pending=deferred();runs.push({spec,onState,signal,transport,onProgress,...pending});return pending.promise;}
   };
   throw Error('Unexpected desktop source import '+name);
  }
 });
 function flush(){assert.equal(unmounted,false);let turns=0;do{assert.ok(++turns<20,'synthetic page hooks must settle');cursor=0;dirty=false;tree=pageModule.exports.default();const pending=effects;effects=[];pending.forEach(run=>run());}while(dirty||effects.length);return tree;}
 async function settle(){for(let turn=0;turn<12;turn++)await Promise.resolve();if(!unmounted&&dirty)flush();}
 function word(){const values=elements(tree,node=>node.type===WordMarker);assert.equal(values.length,1);return values[0].props;}
 function button(label){return elements(tree,node=>node.type==='button'&&nodeText(node)===label)[0];}
 function publish(value,lost=false,unavailable=false){runs.at(-1).onProgress(value,lost,unavailable);if(!unmounted)flush();}
 function read(){word().onReadProgress();flush();return requests.at(-1);}
 function retry(){const control=button('重新读取本站进度');assert.ok(control,'the existing same-task GET recovery control must remain available');assert.equal(!!control.props.disabled,false);control.props.onClick();flush();return requests.at(-1);}
 function unmount(){for(const slot of slots)slot?.cleanup?.();unmounted=true;}
 flush();assert.equal(runs.length,1,'the bridge is an inert callback source, never a real local transport');assert.equal(window.location.hash,'');
 if(initial)publish(initial);
 return {requests,runs,deadlines,clock,wallClock,word,button,publish,read,retry,flush,settle,unmount,text:()=>nodeText(tree),get lateCommits(){return lateCommits;},get storageReads(){return storageReads;}};
}

let passed=0;const failures=[],cases=[];
async function check(name,run){cases.push(name);try{await run();passed++;console.log('PASS '+name);}catch(error){failures.push({name,message:error.message});console.error('FAIL '+name+': '+error.message);}}
const noProof=h=>{assert.equal(h.word().readback??null,null,'only an applicable successful GET may supply raw readback');assert.equal(h.word().readbackStartedAt,undefined,'projection or failure cannot supply GET dispatch provenance');};
const confirm=async(h,p,request=h.requests.at(-1))=>{request.respond(200,{job:job(p)});await h.settle();};

await check('bridge progress and saved projections never supply GET readback proof',async()=>{
 const initial=make(),h=mounted(initial);noProof(h);assert.equal(h.requests.length,0);
 const projected=fresh(initial);projected.save={state:'cloud_ready',cloud_ready:true,independently_confirmed:true,desktop_saved:null};projected.output={output_id:'synthetic-word-output',sha256:'c'.repeat(64),size:7,next_index:1,chunks:1};projected.execution.state='saved';
 h.publish(projected);assert.equal(h.word().progress,projected);noProof(h);assert.equal(h.requests.length,0);assert.equal(h.storageReads,0);h.unmount();
});
await check('actual existing same-scope GET supplies the raw DTO and its monotonic dispatch time',async()=>{
 const initial=make(),h=mounted(initial),before=structuredClone(initial),request=h.read();assert.equal(h.word().reading,true);noProof(h);assert.equal(request.url,'/api/local-word-jobs/'+initial.target_id);
 assert.equal(h.deadlines.length,1);assert.equal(h.deadlines[0].delay,20000,'the timeout only bounds this webpage read');
 const raw=fresh(initial);h.wallClock.value=1000;h.clock.value=101.5;await confirm(h,raw,request);
 assert.equal(h.word().progress,raw);assert.equal(h.word().readback,raw);assert.equal(h.word().readbackStartedAt,100.125,'dispatch provenance uses performance.now even when the UTC clock rolls back');assert.equal(h.word().reading,false);assert.equal(h.word().unavailable,false);assert.equal(h.word().readError,false);assert.deepEqual(initial,before);assert.match(h.text(),/同一任务/);
 const projected=fresh(raw,35);h.publish(projected);assert.equal(h.word().readback,raw,'later bridge projections cannot masquerade as a new independent GET');assert.equal(h.word().readbackStartedAt,100.125);h.unmount();
});
await check('GET readback retains raw independent observation and control clocks after the real merge',async()=>{
 const initial=make(),h=mounted(initial),request=h.read(),raw=fresh(initial,10);raw.version=9;raw.steps[2].counts.completed=2;raw.attempt={...raw.attempt,state:'stop_requested',stop_requested_at:raw.read_at};raw.recovery={...raw.recovery,version:4,epoch:3,desired:'paused',status:'waiting_safe_stop',execution_confirmed:false,safety_stop_pending:true,attempt:raw.attempt};
 const snapshot=structuredClone(raw);await confirm(h,raw,request);
 assert.notEqual(h.word().progress,raw,'the displayed snapshot must execute the actual independent-clock merge');assert.equal(h.word().progress.version,10);assert.equal(h.word().progress.steps[2].counts.completed,18);assert.equal(h.word().progress.recovery.epoch,3);assert.equal(h.word().readback,raw,'readback proof must be the response DTO, never the merged presentation');assert.equal(h.word().readbackStartedAt,100.125);assert.deepEqual(raw,snapshot);h.unmount();
});
await check('a pending GET cannot be duplicated by either existing read control',async()=>{
 const h=mounted();h.read();h.word().onReadProgress();h.button('重新读取本站进度').props.onClick();h.flush();assert.equal(h.requests.length,1);assert.equal(h.button('重新读取本站进度').props.disabled,true);noProof(h);await confirm(h,fresh(make()));h.unmount();
});

for(const [label,respond] of [
 ['GET 503',request=>request.respond(503,{error:'synthetic service unavailable'})],
 ['GET network rejection',request=>request.reject(Error('Synthetic failed read'))],
 ['GET malformed JSON',request=>request.respond(200,null,{jsonError:true})],
 ['GET webpage timeout',(_request,h)=>h.deadlines[0].controller.abort(new DOMException('Synthetic webpage read deadline','TimeoutError'))]
])await check(label+' supplies no proof and normal same-task GET can recover',async()=>{
 const initial=make(),h=mounted(initial),request=h.read();respond(request,h);
 if(label==='GET webpage timeout'){assert.equal(request.options.signal.aborted,true);request.reject(request.options.signal.reason);}
 await h.settle();noProof(h);assert.equal(h.word().progress,initial);assert.equal(h.word().reading,false);
 const retry=h.retry(),raw=fresh(initial);assert.equal(retry.url,request.url);await confirm(h,raw,retry);assert.equal(h.word().readback,raw);assert.equal(h.requests.length,2);h.unmount();
});

const invalidJobs=[
 ['missing job',()=>({})],
 ['wrong job ID',p=>({job:{...job(p),id:id(2)}})],
 ['wrong job source hash',p=>({job:{...job(p),input_sha256:'b'.repeat(64)}})],
 ['wrong source kind',p=>({job:{...job(p),source_kind:'remote_upload'}})],
 ['wrong output mode',p=>({job:{...job(p),output_mode:'article'}})],
 ['nonempty destinations',p=>({job:{...job(p),destinations:['synthetic-platform']}})],
 ['missing destinations',p=>{const value=job(p);delete value.destinations;return {job:value};}],
 ['unavailable Word projection',p=>({job:{...job(p),word_progress_unavailable:true}})],
 ['foreign progress target',p=>({job:{...job(p),word_progress:{...p,target_id:id(2)}}})],
 ['foreign progress input',p=>({job:{...job(p),word_progress:{...p,input_sha256:'b'.repeat(64)}}})],
 ['article progress target kind',p=>({job:{...job(p),word_progress:{...p,target_kind:'article'}}})]
];
for(const [label,body] of invalidJobs)await check('invalid '+label+' cannot supply proof',async()=>{
 const initial=make(),h=mounted(initial),request=h.read();request.respond(200,body(fresh(initial)));await h.settle();noProof(h);assert.equal(h.word().progress,initial);assert.equal(h.word().reading,false);assert.equal(h.word().unavailable,true);h.unmount();
});
const invalidDtos=[
 ['missing execution',p=>{delete p.execution;}],
 ['null execution',p=>{p.execution=null;}],
 ['missing save',p=>{delete p.save;}],
 ['null save',p=>{p.save=null;}],
 ['null step',p=>{p.steps[0]=null;}],
 ['missing step state',p=>{delete p.steps[0].state;}],
 ['missing step counts',p=>{delete p.steps[0].counts;}],
 ['invalid version',p=>{p.version=-1;}],
 ['invalid response read clock',p=>{p.read_at='synthetic-invalid-date';}],
 ['invalid attempt',p=>{delete p.attempt.read_at;}],
 ['invalid control',p=>{delete p.recovery.status;}],
 ['invalid output',p=>{p.output={output_id:'synthetic-incomplete-output'};}]
];
for(const [label,mutate] of invalidDtos)await check('malformed DTO '+label+' cannot manufacture readback proof',async()=>{
 const initial=make(),h=mounted(initial),request=h.read(),raw=fresh(initial);mutate(raw);assert.equal(stages.validateWordProgressDto(raw),false,'the actual shared validator must reject this fixture');request.respond(200,{job:job(raw)});await h.settle();noProof(h);assert.equal(h.word().progress,initial);assert.equal(h.word().reading,false);assert.equal(h.word().unavailable,true);h.unmount();
});

const newerScopes=[
 ['task target',p=>{p.target_id=id(2);}],
 ['frozen input',p=>{p.input_sha256='b'.repeat(64);}],
 ['attempt generation',p=>{p.attempt={...p.attempt,attempt_id:'22222222-2222-4222-8222-222222222222',generation:2};p.recovery={...p.recovery,version:5,epoch:4,attempt:p.attempt};}],
 ['control epoch',p=>{p.recovery={...p.recovery,version:4,epoch:3,desired:'paused',status:'paused',execution_confirmed:false};}]
];
for(const [label,mutate] of newerScopes)for(const phase of ['before response','while reading JSON'])await check('late old '+label+' GET '+phase+' cannot refill current state or proof',async()=>{
 const initial=make(),h=mounted(initial),request=h.read(),gate=deferred();
 if(phase==='while reading JSON'){request.respond(200,null,{jsonGate:gate});await h.settle();assert.equal(request.jsonCalls,1);}
 const next=fresh(initial,40);mutate(next);h.publish(next);assert.equal(request.options.signal.aborted,true,'a scope change aborts its prior read');assert.equal(h.word().reading,false);noProof(h);const selected=h.word().progress;
 const late={job:job(fresh(initial,50))};if(phase==='while reading JSON')gate.resolve(late);else request.respond(200,late);await h.settle();assert.equal(h.word().progress,selected);noProof(h);assert.equal(h.word().unavailable,false);assert.equal(h.word().readError,false);assert.doesNotMatch(h.text(),/读取未确认|登录或访问状态已变化/);
 const live=h.retry(),raw=fresh(next,55);assert.equal(live.url,'/api/local-word-jobs/'+next.target_id);await confirm(h,raw,live);assert.equal(h.word().readback,raw);h.unmount();
});
for(const [label,mutate] of newerScopes)await check('late old '+label+' auth denial cannot hide the newer private task',async()=>{
 const initial=make(),h=mounted(initial),request=h.read(),next=fresh(initial,40);mutate(next);h.publish(next);const selected=h.word().progress;request.respond(403,null,{raw:'synthetic-old-private-denial'});await h.settle();assert.equal(request.jsonCalls,0);assert.equal(h.word().progress,selected);noProof(h);assert.doesNotMatch(h.text(),/登录或访问状态已变化|synthetic-old-private-denial/);h.unmount();
});
for(const [label,mutate] of [
 ['prior generation',p=>{p.attempt={...p.attempt,attempt_id:'33333333-3333-4333-8333-333333333333',generation:1};p.recovery={...p.recovery,attempt:p.attempt};}],
 ['different attempt in the same generation',p=>{p.attempt={...p.attempt,attempt_id:'33333333-3333-4333-8333-333333333333'};p.recovery={...p.recovery,attempt:p.attempt};}],
 ['older control version',p=>{p.recovery.version--;}],
 ['older control epoch',p=>{p.recovery.epoch--;}]
])await check('a '+label+' response cannot provide applicable readback proof',async()=>{
 const initial=make();initial.attempt.generation=2;const h=mounted(initial),request=h.read(),raw=fresh(initial,50);raw.version=99;mutate(raw);await confirm(h,raw,request);noProof(h);assert.equal(h.word().progress,initial);assert.equal(h.word().reading,false);h.unmount();
});

for(const status of [401,403,404])await check('plain-text GET '+status+' hides private details before parsing and same-task normal GET restores them',async()=>{
 const initial=make(),h=mounted(initial),first=h.read(),prior=fresh(initial);await confirm(h,prior,first);assert.equal(h.word().readback,prior);
 h.clock.value=101.25;const denied=h.retry();denied.respond(status,null,{raw:'synthetic-private-denial-'+status,jsonError:true});await h.settle();assert.equal(denied.jsonCalls,0,'HTTP auth status must be handled before any response body parse');assert.equal(h.word().progress,null);noProof(h);assert.equal(h.word().reading,false);assert.equal(h.word().unavailable,false);assert.equal(h.word().readError,false);assert.equal(h.runs[0].signal.aborted,true,'old bridge private callbacks must stop');assert.match(h.text(),/旧 Word 详情已隐藏/);assert.doesNotMatch(h.text(),/synthetic-private-denial/);
 h.runs[0].onProgress(fresh(initial,45),false,false);h.runs[0].onState('synthetic-stale-private-message');h.flush();assert.equal(h.word().progress,null);noProof(h);assert.doesNotMatch(h.text(),/synthetic-stale-private-message/);
 h.clock.value=102.5;const restored=h.retry();assert.equal(restored.url,denied.url,'recovery reuses the original selected task without another bridge or execution');assert.equal(h.runs.length,1);const raw=fresh(prior,50);await confirm(h,raw,restored);assert.equal(h.word().progress,raw);assert.equal(h.word().readback,raw);assert.equal(h.word().readbackStartedAt,102.5);assert.doesNotMatch(h.text(),/旧 Word 详情已隐藏/);assert.equal(h.requests.length,3);h.unmount();
});
await check('a captured old Word auth callback cannot hide a different current task or generation',async()=>{
 for(const [,mutate] of newerScopes){
  const initial=make(),h=mounted(initial),oldAuth=h.word().onAuthRequired,next=fresh(initial,40);mutate(next);h.publish(next);const selected=h.word().progress;
  oldAuth();h.flush();assert.equal(h.word().progress,selected);assert.equal(h.runs[0].signal.aborted,false);assert.doesNotMatch(h.text(),/旧 Word 详情已隐藏/);assert.equal(h.requests.length,0);h.unmount();
 }
});

for(const phase of ['before response','while reading JSON'])await check('unmount '+phase+' aborts bridge and GET; late fulfillment makes no state commit',async()=>{
 const initial=make(),h=mounted(initial),request=h.read(),gate=deferred();if(phase==='while reading JSON'){request.respond(200,null,{jsonGate:gate});await h.settle();assert.equal(request.jsonCalls,1);}
 h.unmount();assert.equal(request.options.signal.aborted,true);assert.equal(h.runs[0].signal.aborted,true);if(phase==='while reading JSON')gate.resolve({job:job(fresh(initial))});else request.respond(200,{job:job(fresh(initial))});await h.settle();h.runs[0].onProgress(fresh(initial),false,false);h.runs[0].onState('synthetic-late-unmounted-message');h.runs[0].reject(Error('Synthetic late bridge failure'));await h.settle();assert.equal(h.lateCommits,0,'late reads and bridge callbacks must never call an unmounted state setter');
});

console.log(JSON.stringify({passed,failed:failures.length,failures,checks:cases.length,external_calls:0,provider_calls:0,platform_calls:0,business_writes:0,scope:'actual desktop page hooks and GET handler with actual shared merge/DTO gate; inert bridge; Word marker props; synthetic transport; no DOM/browser or paid execution',sources:{[pagePath]:createHash('sha256').update(pageSource).digest('hex'),[stagePath]:createHash('sha256').update(fs.readFileSync(stagePath)).digest('hex')}},null,2));
if(failures.length)process.exitCode=1;
