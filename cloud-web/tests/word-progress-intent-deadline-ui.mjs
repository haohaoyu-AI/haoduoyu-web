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
const code=ts.transpileModule(fs.readFileSync('components/word-stage-progress.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const baseline=JSON.parse(fs.readFileSync('evidence/word-progress/v1-partial-fixture.json','utf8'));
const make=()=>{
 const p=structuredClone(baseline);p.can_control_word=true;
 p.attempt={attempt_id:'11111111-1111-4111-8111-111111111111',generation:1,state:'running',started_at:p.read_at,active_elapsed_ms:1000,active_started_at:p.read_at,read_at:p.read_at,timeout_ms:3600000,timeout_due:false,stop_requested_at:null,reason:'none',restarts_used:0,max_restarts:2};
 p.recovery={version:3,epoch:2,desired:'run',status:'running',reason:'none',heartbeat_at:p.read_at,heartbeat_overdue:false,retry_count:0,retry_after:null,execution_confirmed:true,automatic_dispatch_available:false,resource_class:'prepare',queue_reason:null,queue_revision:0,serial_mode:true,safety_stop_pending:false,attempt:p.attempt};return p;
};
const children=node=>Array.isArray(node?.props?.children)?node.props.children:[node?.props?.children];
const nodeText=node=>typeof node==='string'?node:Array.isArray(node)?node.map(nodeText).join(''):node?.props?nodeText(node.props.children):'';
function buttons(node,result=[]){if(Array.isArray(node)){node.forEach(value=>buttons(value,result));return result;}if(!node||typeof node!=='object')return result;if(node.type==='button')result.push(node);children(node).forEach(value=>buttons(value,result));return result;}
function mounted(initial){
 let cursor=0,slots=[],effects=[],dirty=false,tree,props={progress:initial};const requests=[],deadlines=[];
 const hooks={...React,
  useState(initialValue){const index=cursor++;if(!(index in slots))slots[index]=typeof initialValue==='function'?initialValue():initialValue;return [slots[index],value=>{const next=typeof value==='function'?value(slots[index]):value;if(!Object.is(next,slots[index])){slots[index]=next;dirty=true;}}];},
  useRef(value){const index=cursor++;return slots[index]??={current:value};},
  useEffect(fn,deps){const index=cursor++,old=slots[index];if(!old||deps.length!==old.deps.length||deps.some((value,i)=>!Object.is(value,old.deps[i]))){slots[index]={deps,cleanup:old?.cleanup};effects.push(()=>{old?.cleanup?.();slots[index].cleanup=fn();});}}
 };
 const componentExports={};
 vm.runInNewContext(code,{exports:componentExports,Date,Intl,window:{setInterval:()=>1,clearInterval:()=>{}},AbortSignal:{timeout:delay=>{const controller=new AbortController();deadlines.push({delay,controller});return controller.signal;}},require:name=>name==='react'?hooks:name==='./publish-focus'?publish:name==='./word-recovery-capability'?capability:nativeRequire(name),fetch:(url,options)=>{
  assert.equal(url,'/api/word-recovery');assert.equal(options.method,'POST');
  let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const request={url,options,resolve,reject,body:JSON.parse(options.body)};requests.push(request);
  options.signal?.addEventListener('abort',()=>reject(options.signal.reason),{once:true});return promise;
 }});
 function flush(progress){if(progress)props={progress};let turns=0;do{assert.ok(++turns<20,'effects must settle');cursor=0;dirty=false;tree=componentExports.default(props);const run=effects;effects=[];run.forEach(fn=>fn());}while(dirty||effects.length);return renderToStaticMarkup(tree);}
 const button=label=>buttons(tree).find(value=>nodeText(value)===label);
 return {requests,deadlines,flush,button,click(label='暂停'){const target=button(label);assert.ok(target,`expected ${label}`);assert.equal(!!target.props.disabled,false);const promise=target.props.onClick();flush();return promise;},expire(){assert.equal(deadlines.length,1);assert.equal(deadlines[0].delay,20000,'only webpage wait has a 20-second deadline');assert.equal(requests[0].options.signal,deadlines[0].controller.signal);deadlines[0].controller.abort(new DOMException('Synthetic webpage wait deadline','TimeoutError'));},respond(index,recovery){requests[index].resolve({ok:true,json:async()=>({recovery})});}};
}
let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};

await test('never-returning intent stops webpage wait, keeps unknown server outcome and never retries',async()=>{
 const original=make(),ui=mounted(original);ui.flush();const handler=ui.button('暂停').props.onClick,pending=ui.click();
 assert.equal(ui.requests.length,1);assert.equal(ui.requests[0].body.expected_version,3);assert.equal(ui.requests[0].body.intent,'paused');
 assert.match(ui.flush(),/正在保存/);assert.equal(ui.button('正在保存…').props.disabled,true);
 await handler();assert.equal(ui.requests.length,1,'busy ref prevents a duplicate intent even through a retained handler');
 ui.expire();await pending;const html=ui.flush();
 assert.match(html,/操作结果未确认，请先刷新核对；勿重复操作/);assert.doesNotMatch(html,/正在保存|暂停请求已保存|已暂停|已停止|已经结束/);assert.equal(ui.button('暂停').props.disabled,true,'the webpage wait ended, but unknown work remains locked until a fresh explicit GET');await handler();assert.equal(ui.requests.length,1,'a retained handler cannot resend unknown work after the deadline');
 assert.equal(ui.requests.length,1,'timeout cannot automatically resend the intent');assert.equal(original.recovery.desired,'run','timeout is no server-state write or rollback');
 const late={...original.recovery,version:99,epoch:99,desired:'paused',status:'paused'};ui.respond(0,late);await Promise.resolve();assert.doesNotMatch(ui.flush(),/已暂停|暂停请求已保存/,'an ignored resolution of the aborted fetch cannot change the page');
});
await test('new server pause read stays authoritative when old intent webpage wait times out',async()=>{
 const ui=mounted(make());ui.flush();const pending=ui.click(),stopping=make();
 stopping.version--;stopping.read_at='2026-10-09T05:05:48.000Z';stopping.attempt={...stopping.attempt,state:'stop_requested',stop_requested_at:stopping.read_at,read_at:stopping.read_at};stopping.recovery={...stopping.recovery,version:4,epoch:3,desired:'paused',status:'waiting_safe_stop',safety_stop_pending:true,execution_confirmed:false,attempt:stopping.attempt};
 ui.flush(stopping);ui.expire();await pending;const html=ui.flush();assert.match(html,/等待暂停完成/);assert.match(html,/操作结果未确认/);assert.equal(ui.button('等待停止确认').props.disabled,true);assert.equal(ui.requests.length,1);
});
await test('timeout and late response of a prior article, source or attempt cannot change the new scope',async()=>{
 for(const mutate of [p=>{p.target_id='22222222-2222-4222-8222-222222222222';},p=>{p.input_sha256='b'.repeat(64);},p=>{p.attempt={...p.attempt,attempt_id:'22222222-2222-4222-8222-222222222222',generation:2};p.recovery={...p.recovery,attempt:p.attempt};}]){
  const ui=mounted(make());ui.flush();const pending=ui.click(),next=make();mutate(next);ui.flush(next);ui.expire();await pending;
  ui.respond(0,{...make().recovery,version:99,epoch:99,desired:'paused',status:'paused'});await Promise.resolve();const html=ui.flush();
  assert.doesNotMatch(html,/操作结果未确认|正在保存|暂停请求已保存|已暂停/);assert.equal(ui.button('暂停').props.disabled,false);assert.equal(ui.requests.length,1);
 }
});
await test('a later successful control response remains fenced by the latest recovery epoch/version',async()=>{
 const ui=mounted(make());ui.flush();const pending=ui.click(),latest=make();latest.recovery={...latest.recovery,version:5,epoch:4,status:'await_executor',execution_confirmed:false};ui.flush(latest);
 ui.respond(0,{...make().recovery,version:4,epoch:3,desired:'paused',status:'paused'});await pending;
 const html=ui.flush();assert.match(html,/已收到先前操作回执/);assert.doesNotMatch(html,/已暂停|暂停请求已保存/);assert.equal(ui.requests.length,1);
});
await test('mounted reads retain the newer attempt sample when response completion order is reversed',async()=>{
 const current=make();current.read_at='2026-10-14T04:00:22.000Z';current.started_at='2026-10-14T03:00:15.000Z';current.execution={...current.execution,state:'running',reason:'none',update_overdue:false};
 current.attempt={...current.attempt,started_at:current.started_at,active_started_at:current.started_at,active_elapsed_ms:0,read_at:'2026-10-14T04:00:20.000Z',timeout_due:true};current.recovery={...current.recovery,attempt:current.attempt};
 const late=structuredClone(current);late.read_at='2026-10-14T04:00:30.000Z';late.attempt={...late.attempt,read_at:'2026-10-14T04:00:10.000Z',timeout_due:false};late.recovery={...late.recovery,attempt:late.attempt};
 for(const snapshots of [[current,late],[late,current]]){
  const ui=mounted(snapshots[0]);ui.flush();ui.flush(snapshots[1]);
  const html=ui.flush();assert.match(html,/配图超时/);assert.match(html,/本次配图已用 60分5秒/);assert.doesNotMatch(html,/当前步骤：|正在选图片/);assert.equal(ui.requests.length,0,'reads only merge real samples and never dispatch an intent');
 }
});
console.log(JSON.stringify({passed,failed:0,external_calls:0,scope:'actual component hooks and deferred synthetic fetch/abort; 20000ms page deadline only; no server cancellation or retry'}));
