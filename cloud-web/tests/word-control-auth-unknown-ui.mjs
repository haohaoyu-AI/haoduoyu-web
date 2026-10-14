// Execute the real component hooks and intent handler with inert deferred fetch.
// Timeout and reads are synthetic; there are no browser, API or provider calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadUiSource} from './ui-source-module.mjs';

const nativeRequire=createRequire(import.meta.url),publish=loadUiSource('components/publish-focus.ts'),capability=loadUiSource('components/word-recovery-capability.ts');
const code=ts.transpileModule(fs.readFileSync(process.env.WORD_CONTROL_SOURCE||'components/word-stage-progress.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const baseline=JSON.parse(fs.readFileSync('evidence/word-progress/v1-partial-fixture.json','utf8'));
const make=()=>{
 const p=structuredClone(baseline);p.can_control_word=true;
 p.attempt={attempt_id:'11111111-1111-4111-8111-111111111111',generation:1,state:'running',started_at:p.read_at,active_elapsed_ms:1000,active_started_at:p.read_at,read_at:p.read_at,timeout_ms:3600000,timeout_due:false,stop_requested_at:null,reason:'none',restarts_used:0,max_restarts:2};
 p.recovery={version:3,epoch:2,desired:'run',status:'running',reason:'none',heartbeat_at:p.read_at,heartbeat_overdue:false,retry_count:0,retry_after:null,execution_confirmed:true,automatic_dispatch_available:false,resource_class:'prepare',queue_reason:null,queue_revision:0,serial_mode:true,safety_stop_pending:false,attempt:p.attempt};return p;
};
const children=node=>Array.isArray(node?.props?.children)?node.props.children:[node?.props?.children];
const nodeText=node=>typeof node==='string'?node:Array.isArray(node)?node.map(nodeText).join(''):node?.props?nodeText(node.props.children):'';
function buttons(node,result=[]){if(Array.isArray(node)){node.forEach(value=>buttons(value,result));return result;}if(!node||typeof node!=='object')return result;if(node.type==='button')result.push(node);children(node).forEach(value=>buttons(value,result));return result;}
function mounted(initial,extra={},clock=null,wallClock=null){
 let cursor=0,slots=[],effects=[],dirty=false,tree,props={progress:initial,...extra};const requests=[],deadlines=[];
 const hooks={...React,
  useState(initialValue){const index=cursor++;if(!(index in slots))slots[index]=typeof initialValue==='function'?initialValue():initialValue;return [slots[index],value=>{const next=typeof value==='function'?value(slots[index]):value;if(!Object.is(next,slots[index])){slots[index]=next;dirty=true;}}];},
  useRef(value){const index=cursor++;return slots[index]??={current:value};},
  useEffect(fn,deps){const index=cursor++,old=slots[index];if(!old||deps.length!==old.deps.length||deps.some((value,i)=>!Object.is(value,old.deps[i]))){slots[index]={deps,cleanup:old?.cleanup};effects.push(()=>{old?.cleanup?.();slots[index].cleanup=fn();});}}
 };
 const componentExports={};
 vm.runInNewContext(code,{exports:componentExports,Date:wallClock?class extends Date{static now(){return wallClock.value;}}:Date,...(clock?{performance:{now:()=>clock.value}}:{}),Intl,window:{setInterval:()=>1,clearInterval:()=>{}},AbortSignal:{timeout:delay=>{const controller=new AbortController();deadlines.push({delay,controller});return controller.signal;}},require:name=>name==='react'?hooks:name==='./publish-focus'?publish:name==='./word-recovery-capability'?capability:nativeRequire(name),fetch:(url,options)=>{
  assert.equal(url,'/api/word-recovery');assert.equal(options.method,'POST');
  let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const request={url,options,resolve,reject,body:JSON.parse(options.body)};requests.push(request);
  options.signal?.addEventListener('abort',()=>reject(options.signal.reason),{once:true});return promise;
 }});
 function flush(progress){if(progress)props={...props,progress};let turns=0;do{assert.ok(++turns<20,'effects must settle');cursor=0;dirty=false;tree=componentExports.default(props);const run=effects;effects=[];run.forEach(fn=>fn());}while(dirty||effects.length);return renderToStaticMarkup(tree);}
 const button=label=>buttons(tree).find(value=>nodeText(value)===label);
 return {requests,deadlines,flush,button,update(flags){props={...props,...flags};return flush();},invoke(label){const target=button(label);assert.ok(target,`expected ${label}`);return target.props.onClick();},click(label='暂停'){const target=button(label);assert.ok(target,`expected ${label}`);assert.equal(!!target.props.disabled,false);const promise=target.props.onClick();flush();return promise;},expire(){assert.equal(deadlines.length,1);assert.equal(deadlines[0].delay,20000,'only webpage wait has a 20-second deadline');assert.equal(requests[0].options.signal,deadlines[0].controller.signal);deadlines[0].controller.abort(new DOMException('Synthetic webpage wait deadline','TimeoutError'));},respond(index,recovery){requests[index].resolve({ok:true,json:async()=>({recovery})});}};
}

let passed=0;const failures=[];
const test=async(name,fn)=>{try{await fn();passed++;console.log('PASS '+name);}catch(error){failures.push(name);console.error('FAIL '+name+': '+error.message);}};
const fresh=(original,step=1)=>{
 const p=structuredClone(original);p.read_at=new Date(Date.parse(original.read_at)+step*1000).toISOString();
 if(p.attempt){p.attempt.read_at=p.read_at;p.recovery.attempt=p.attempt;}return p;
};
for(const status of [401,403])await test('plain-text '+status+' hides old private progress and denies repeat writes before json parsing',async()=>{
 let invalid=0;const ui=mounted(make(),{onAuthRequired:()=>invalid++});const original=ui.flush(),handler=ui.button('暂停').props.onClick,pending=ui.click();
 assert.match(original,/任务编号/);ui.requests[0].resolve(new Response('synthetic-private-raw-denial',{status}));await pending;
 const html=ui.flush();assert.equal(invalid,1);assert.doesNotMatch(html,/任务编号|最后更新|已确定|搜集图片|本次配图|synthetic-private-raw-denial|操作结果未确认/);assert.match(html,/登录|账号|权限/);assert.equal(ui.button('暂停'),undefined);
 await handler();assert.equal(ui.requests.length,1,'a retained handler must not dispatch a second POST after an auth denial');
});
await test('unknown timeout keeps both controls locked, including retained handlers, until readback',async()=>{
 const ui=mounted(make());ui.flush();const handler=ui.button('暂停').props.onClick,pending=ui.click();ui.expire();await pending;
 const html=ui.flush();assert.match(html,/操作结果未确认/);assert.doesNotMatch(html,/正在保存|已暂停/);assert.equal(ui.button('暂停').props.disabled,true);assert.equal(ui.button('取消处理').props.disabled,true);
 await handler();await ui.invoke('取消处理');assert.equal(ui.requests.length,1,'manual attempts through current or retained handlers cannot resend unknown work');
});
await test('periodic progress, control or storage props cannot unlock an unknown request',async()=>{
 const initial=make(),ui=mounted(initial);ui.flush();const pending=ui.click();ui.expire();await pending;
 const projected=fresh(initial);projected.recovery={...projected.recovery,version:4,epoch:3,status:'await_executor',execution_confirmed:false};ui.flush(projected);
 assert.equal(ui.button('暂停').props.disabled,true);await ui.invoke('暂停');assert.equal(ui.requests.length,1);
});
await test('only explicit GET begun after the unknown outcome with a fresh same-scope raw DTO unlocks',async()=>{
 let reads=0;const initial=make(),ui=mounted(initial,{onReadProgress:()=>reads++});ui.flush();const pending=ui.click();ui.expire();await pending;
 ui.update({readback:fresh(initial),readbackStartedAt:Date.now()+100});assert.equal(ui.button('暂停').props.disabled,true,'a raw GET update without explicit reconciliation remains locked');
 const readButton=ui.button('重新读取进度');assert.ok(readButton);await ui.invoke('重新读取进度');assert.equal(reads,1);assert.equal(ui.requests.length,1,'reconciliation calls the supplied GET-only callback');
 const actual=fresh(initial,2);ui.update({progress:actual,readback:actual,readbackStartedAt:Date.now()+200});assert.equal(ui.button('暂停').props.disabled,false);
 const next=ui.click();assert.equal(ui.requests.length,2,'a later explicit action is allowed only after the real read');ui.respond(1,{...actual.recovery,version:4,epoch:3,desired:'paused',status:'paused',safety_stop_pending:false,attempt:{...actual.attempt,state:'paused_safe',active_started_at:null}});await next;assert.match(ui.flush(),/已暂停/);
});
await test('failed GET, pre-unknown GET, stale sample, foreign scope and old control cannot unlock',async()=>{
 const variants=[
  ['GET begun before unknown',p=>p,()=>0],
  ['old response read_at',p=>({...p,read_at:make().read_at}),()=>Date.now()+100],
  ['old attempt read_at',p=>({...p,attempt:{...p.attempt,read_at:make().attempt.read_at},recovery:{...p.recovery,attempt:{...p.attempt,read_at:make().attempt.read_at}}}),()=>Date.now()+100],
  ['foreign target',p=>({...p,target_id:'22222222-2222-4222-8222-222222222222'}),()=>Date.now()+100],
  ['foreign source',p=>({...p,input_sha256:'b'.repeat(64)}),()=>Date.now()+100],
  ['prior attempt',p=>({...p,attempt:{...p.attempt,generation:0},recovery:{...p.recovery,attempt:{...p.attempt,generation:0}}}),()=>Date.now()+100],
  ['old control',p=>({...p,recovery:{...p.recovery,version:2,epoch:1}}),()=>Date.now()+100],
 ];
 for(const [label,mutate,started] of variants){const initial=make(),ui=mounted(initial,{onReadProgress:()=>{}});ui.flush();const pending=ui.click();ui.expire();await pending;await ui.invoke('重新读取进度');ui.update({reading:true});ui.update({reading:false});assert.equal(ui.button('暂停').props.disabled,true,'failed GET supplies no successful raw readback');ui.update({readback:mutate(fresh(initial)),readbackStartedAt:started()});assert.equal(ui.button('暂停').props.disabled,true,label);await ui.invoke('暂停');assert.equal(ui.requests.length,1,label+' cannot create another write');}
});
await test('formal same-task GET of paused_safe enables the existing resume request with its new control version',async()=>{
 const initial=make(),ui=mounted(initial,{onReadProgress:()=>{}});ui.flush();const unknown=ui.click();ui.expire();await unknown;await ui.invoke('重新读取进度');
 const paused=fresh(initial,2);paused.attempt={...paused.attempt,state:'paused_safe',active_started_at:null};paused.recovery={...paused.recovery,version:4,epoch:3,desired:'paused',status:'paused',execution_confirmed:false,safety_stop_pending:false,attempt:paused.attempt};
 ui.update({progress:paused,readback:paused,readbackStartedAt:Date.now()+100});assert.equal(ui.button('重试并续接').props.disabled,false);
 const resume=ui.click('重试并续接');assert.equal(ui.requests.length,2);assert.deepEqual(ui.requests[1].body,{target_kind:initial.target_kind,target_id:initial.target_id,input_sha256:initial.input_sha256,expected_version:4,intent:'run'});
 ui.respond(1,{...paused.recovery,version:5,epoch:4,desired:'run',status:'await_executor'});await resume;assert.match(ui.flush(),/继续请求已保存/);assert.doesNotMatch(ui.flush(),/已重新配图|已取得执行权限|<strong>(?:Word 已就绪|云端 Word 已就绪)<\/strong>|旧执行已结束/);
});
await test('a server-recorded next generation keeps its own normal controls rather than inheriting an old unknown lock',async()=>{
 const initial=make(),ui=mounted(initial);ui.flush();const unknown=ui.click();ui.expire();await unknown;
 const next=fresh(initial,3);next.attempt={...next.attempt,attempt_id:'22222222-2222-4222-8222-222222222222',generation:2,state:'queued',started_at:null,active_started_at:null,active_elapsed_ms:0};next.recovery={...next.recovery,version:5,epoch:4,status:'queued',execution_confirmed:false,attempt:next.attempt};next.steps=next.steps.map(step=>({...step,state:'pending',action:null,counts:null,evidence:null}));
 const html=ui.flush(next);assert.match(html,/排队中/);assert.doesNotMatch(html,/操作结果未确认|已确定 18/);assert.equal(ui.button('暂停').props.disabled,false);assert.equal(ui.requests.length,1,'reading the new durable generation never auto-dispatches a POST');
});
await test('same-millisecond or rolled-back wall clocks do not block a real GET with newer monotonic dispatch provenance',async()=>{
 for(const rollback of [false,true]){
  const initial=make(),clock={value:100.1},wall={value:2000},ui=mounted(initial,{onReadProgress:()=>{}},clock,wall);ui.flush();const pending=ui.click();ui.expire();await pending;
  await ui.invoke('重新读取进度');if(rollback)wall.value=1000;clock.value=100.2;
  const actual=fresh(initial,2);ui.update({progress:actual,readback:actual,readbackStartedAt:clock.value});assert.equal(ui.button('暂停').props.disabled,false,'shared performance clock orders the fresh request even when Date.now does not advance');
 }
});
await test('reconciliation must be newer than the progress known at failure, not just the POST dispatch snapshot',async()=>{
 const initial=make(),ui=mounted(initial,{onReadProgress:()=>{}});ui.flush();const pending=ui.click(),known=fresh(initial,3);ui.flush(known);ui.expire();await pending;await ui.invoke('重新读取进度');
 const older=fresh(initial,2);older.read_at=fresh(initial,4).read_at;ui.update({readback:older,readbackStartedAt:Date.now()+100});assert.equal(ui.button('暂停').props.disabled,true,'a later response carrying an older attempt sample cannot confirm the unknown result');
 ui.update({readback:known,readbackStartedAt:Date.now()+200});assert.equal(ui.button('暂停').props.disabled,true,'the sample already known when the write failed cannot confirm it');
 const actual=fresh(initial,5);ui.update({progress:actual,readback:actual,readbackStartedAt:Date.now()+300});assert.equal(ui.button('暂停').props.disabled,false);
});
await test('late auth and unknown results from a prior article, source or attempt do not poison the new scope',async()=>{
 for(const mutate of [p=>{p.target_id='22222222-2222-4222-8222-222222222222';},p=>{p.input_sha256='b'.repeat(64);},p=>{p.attempt={...p.attempt,attempt_id:'22222222-2222-4222-8222-222222222222',generation:2};p.recovery={...p.recovery,attempt:p.attempt};}])for(const status of [401,403,503]){
  let invalid=0;const ui=mounted(make(),{onAuthRequired:()=>invalid++});ui.flush();const pending=ui.click(),next=make();mutate(next);ui.flush(next);ui.requests[0].resolve(new Response('old scope denial',{status}));await pending;const html=ui.flush();assert.equal(invalid,0);assert.doesNotMatch(html,/操作结果未确认|旧.*详情.*隐藏|登录状态已变化/);assert.equal(ui.button('暂停').props.disabled,false);
 }
});
await test('malformed, null, foreign-attempt, wrong-desired and non-advancing intent receipts remain unknown and locked',async()=>{
 const p=make(),ack={...p.recovery,version:4,epoch:3,desired:'paused',status:'paused'};
 for(const [label,initial,body] of [
  ['missing recovery with no prior control',{...p,recovery:null,attempt:null},{}],
  ['null recovery with no prior control',{...p,recovery:null,attempt:null},{recovery:null}],
  ['incomplete recovery',p,{recovery:{version:4,epoch:3,desired:'paused'}}],
  ['wrong existing attempt',p,{recovery:{...ack,attempt:{...p.attempt,attempt_id:'77777777-7777-4777-8777-777777777777'}}}],
  ['new generation in POST',p,{recovery:{...ack,attempt:{...p.attempt,generation:2}}}],
  ['first attempt in intent POST',{...p,recovery:null,attempt:null},{recovery:{...ack,version:1,epoch:1}}],
  ['wrong desired',p,{recovery:{...ack,desired:'run'}}],
  ['same version',p,{recovery:{...ack,version:3}}],
  ['same epoch',p,{recovery:{...ack,epoch:2}}],
 ]){
  const ui=mounted(initial);ui.flush();const retained=ui.button('暂停').props.onClick,pending=ui.click();ui.requests[0].resolve(Response.json(body));await pending;
  const html=ui.flush();assert.match(html,/操作结果未确认/,label);assert.doesNotMatch(html,/暂停请求已保存|继续请求已保存/,label);assert.equal(ui.button('暂停').props.disabled,true,label);await retained();assert.equal(ui.requests.length,1,label);
 }
});
await test('full initial intent receipt without an attempt saves its actual control intent',async()=>{
 const initial={...make(),recovery:null,attempt:null},ui=mounted(initial);ui.flush();const pending=ui.click();
 ui.respond(0,{...make().recovery,version:1,epoch:1,desired:'paused',status:'paused',attempt:null,execution_confirmed:false});await pending;
 assert.match(ui.flush(),/暂停请求已保存/);assert.doesNotMatch(ui.flush(),/操作结果未确认|执行已停止并结清/);assert.equal(ui.button('重试并续接').props.disabled,false);
});
await test('auth-hidden same-task desktop compatibility recovers only through a real later GET',async()=>{
 const initial=make(),clock={value:20},ui=mounted(initial,{onAuthRequired:()=>{}},clock);ui.flush();const handler=ui.button('暂停').props.onClick,pending=ui.click();ui.requests[0].resolve(new Response('denied',{status:401}));await pending;ui.flush();
 ui.update({progress:null,readback:null});const actual=fresh(initial,2);
 ui.update({progress:actual});assert.equal(ui.button('暂停'),undefined,'restoring a bridge/list projection alone cannot undo the auth denial');
 ui.update({readback:actual,readbackStartedAt:19});assert.equal(ui.button('暂停'),undefined,'GET begun before denial cannot undo it');
 ui.update({readback:actual,readbackStartedAt:21});assert.equal(ui.button('暂停').props.disabled,false);assert.doesNotMatch(ui.flush(),/旧 Word 详情已隐藏|执行已停止并结清/);assert.equal(ui.requests.length,1,'successful authenticated GET never resends the old write');
 const next=handler();assert.equal(ui.requests.length,2);ui.respond(1,{...actual.recovery,version:4,epoch:3,desired:'paused',status:'paused'});await next;
});
await test('malformed GET DTO cannot enter merging, render private details or confirm an unknown write',async()=>{
 const initial=make(),ui=mounted(initial,{onReadProgress:()=>{}});ui.flush();const pending=ui.click();ui.expire();await pending;await ui.invoke('重新读取进度');
 for(const field of ['execution','save','steps','output','version','read_at']){
  const dto=fresh(initial,2);delete dto[field];assert.doesNotThrow(()=>ui.update({readback:dto,readbackStartedAt:Date.now()+100}));assert.equal(ui.button('暂停').props.disabled,true,field);
  const isolated=mounted(dto);assert.doesNotThrow(()=>isolated.flush());assert.doesNotMatch(isolated.flush(),/任务编号|正在找图片|已确定/);assert.equal(isolated.button('暂停'),undefined);
 }
});
console.log(JSON.stringify({passed,failed:failures.length,failures,external_calls:0,business_writes:0,scope:'actual component hooks; auth status before parsing; unknown write fence; explicit raw GET readback provenance only'}));
if(failures.length)process.exitCode=1;
