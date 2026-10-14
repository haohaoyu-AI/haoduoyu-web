// Real component rendering with synthetic public state; no server or production jobs.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadUiSource} from './ui-source-module.mjs';
import {diagnosticProbes} from './presentation-security-fixture.mjs';

const nativeRequire=createRequire(import.meta.url),publishFocus=loadUiSource('components/publish-focus.ts'),require=name=>name==='./publish-focus'?publishFocus:name==='./word-recovery-capability'?loadUiSource('components/word-recovery-capability.ts'):nativeRequire(name),exports={};
const compiled=ts.transpileModule(fs.readFileSync('components/word-stage-progress.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
vm.runInNewContext(compiled,{exports,require,Date,Intl});
const source=JSON.parse(fs.readFileSync('evidence/word-progress/v1-partial-fixture.json','utf8'));
const render=(progress,props={})=>renderToStaticMarkup(React.createElement(exports.default,{progress,...props}));
function fixture(overrides={}){
 const progress=structuredClone(source);
 progress.can_control_word=true;
 progress.execution.state='running';
 progress.execution.reason_text='';
 progress.steps.forEach((step,index)=>Object.assign(step,{state:index===0?'completed':index===1?'current':'pending',counts:null,action:null}));
 progress.steps[1].action='正在搜集公开图片';
 progress.recovery={version:3,epoch:2,desired:'run',status:'running',reason:'none',heartbeat_at:null,heartbeat_overdue:false,retry_count:0,retry_after:null,execution_confirmed:true,automatic_dispatch_available:false,resource_class:'prepare',queue_reason:null,queue_revision:0,...overrides};
 return progress;
}
function sixUnchangedStages(markup){assert.equal((markup.match(/<li /g)||[]).length,6);assert.match(markup,/搜集图片/);assert.match(markup,/逐页检查/);assert.doesNotMatch(markup,/投草稿箱|7 篇|七篇|\d+%|排队第|预计|即将|自动开始|自动续跑/);}

const summary=markup=>markup.match(/<summary>(.*?)<\/summary>/s)?.[1]||'';
// Disabled recovery explanations are visible but cannot grant or run work.
const noExecutableControl=markup=>assert.doesNotMatch(markup,/<button\b(?![^>]*\bdisabled\b)[^>]*>(?:暂停|重试并续接|取消处理|重试配图 \/ 继续处理|等待停止确认)<\/button>/,'no executable pause, resume, cancel or recovery control');
const preparing=render(fixture());
assert.match(summary(preparing),/正在找图片/);
assert.match(preparing,/配图准备/);
assert.doesNotMatch(preparing,/Word 处理|等待.*位/);
assert.match(preparing,/正在找图片/);
sixUnchangedStages(preparing);

const queueFixture=fixture({status:'queued',queue_reason:'prepare_capacity'});
const waitingPrepare=render(queueFixture);
assert.match(waitingPrepare,/等待配图准备/);
assert.match(waitingPrepare,/任务已排队，等待配图准备/);
assert.match(waitingPrepare,/上次记录：搜集图片/);
assert.match(waitingPrepare,/上次记录：搜集图片/);assert.doesNotMatch(waitingPrepare,/上次动作/,'counts-free raw action prose is not translated into an execution claim');
assert.doesNotMatch(waitingPrepare,/正在找图片|执行中|Word 处理/);
sixUnchangedStages(waitingPrepare);

queueFixture.steps[1].counts={completed:8,total:null,unit:'candidates'};
const candidateCount=render(queueFixture);
assert.match(candidateCount,/已找到候选 8 张/);
assert.doesNotMatch(candidateCount,/已确定 8/);

const preparingQueued=fixture({queue_reason:'heavy_capacity'});
const transitioning=render(preparingQueued);
assert.match(transitioning,/配图准备 · 等待 Word 处理/);
assert.match(transitioning,/是否仍在处理以新进度为准/);assert.doesNotMatch(transitioning,/配图准备仍可继续/);
assert.match(summary(transitioning),/等待继续处理/);
assert.match(transitioning,/上次记录：搜集图片/);assert.doesNotMatch(transitioning,/上次动作/,'counts-free raw action prose is not translated into an execution claim');
assert.doesNotMatch(summary(transitioning),/正在找图片|Word 制作中|Word 处理中/);
sixUnchangedStages(transitioning);

const waitingHeavy=fixture({status:'queued',resource_class:'heavy',queue_reason:'heavy_capacity'});
const heavyMarkup=render(waitingHeavy);
assert.match(heavyMarkup,/等待 Word 处理/);
assert.match(summary(heavyMarkup),/排队中/);assert.match(heavyMarkup,/排队时间不计入配图耗时/);assert.match(heavyMarkup,/已完成/,'verified source stage remains visible while queued');
assert.doesNotMatch(heavyMarkup,/配图准备仍可继续|执行中|Word 制作中/);

for(const props of [{networkOffline:true},{readError:true},{unavailable:true}]){
 const stale=render(waitingHeavy,props);
 assert.match(summary(stale),/上次记录：搜集图片/);
 assert.match(stale,/等待 Word 处理/);
 assert.match(stale,/上次记录：搜集图片/);
 noExecutableControl(stale);
 if(!props.unavailable)assert.match(stale,/后台执行情况未确认/);
}
const stalePreparation=render(preparingQueued,{networkOffline:true});
assert.match(stalePreparation,/等待 Word 处理/);
assert.doesNotMatch(summary(stalePreparation),/正在找图片/);
assert.match(stalePreparation,/上次记录：搜集图片/);assert.doesNotMatch(stalePreparation,/上次动作/,'counts-free raw action prose is not translated into an execution claim');
assert.doesNotMatch(stalePreparation,/正在找图片|配图准备仍可继续/);
const genericQueue=render(fixture({status:'queued'}));
assert.match(genericQueue,/等待处理/);
assert.match(genericQueue,/上次记录：搜集图片/);assert.doesNotMatch(genericQueue,/上次动作/,'counts-free raw action prose is not translated into an execution claim');
assert.doesNotMatch(genericQueue,/准备位置暂满|Word 处理位置暂满/);

for(const [overrides,label] of [[{desired:'paused'},'已暂停'],[{desired:'cancelled'},'已取消'],[{status:'blocked'},'等待条件恢复'],[{status:'backoff'},'等待重试'],[{status:'await_executor'},'尚未开始处理']]){
 const progress=fixture({...overrides,queue_reason:'heavy_capacity'});
 progress.execution.reason='network_unavailable';progress.execution.reason_text='不展示的原始网络诊断';
 const markup=render(progress);
 assert.match(markup,new RegExp(label));
 assert.match(markup,overrides.desired?/已有进度和成果保留/:/网络访问暂不可用/);assert.doesNotMatch(markup,/不展示的原始网络诊断/);
 assert.doesNotMatch(markup,/等待 Word 处理|任务已排队/);
}

const confirmed=fixture({status:'queued',queue_reason:'heavy_capacity'});
confirmed.save.cloud_ready=true;confirmed.save.independently_confirmed=true;confirmed.save.state='cloud_ready';confirmed.execution.state='saved';confirmed.steps.forEach(step=>step.state='completed');
const saved=render(confirmed);
assert.match(saved,/Word 已就绪/);
assert.doesNotMatch(summary(saved),/等待.*位/);assert.doesNotMatch(saved,/<button/);
confirmed.target_kind='local_word';
const localSaved=render(confirmed);
assert.match(localSaved,/云端 Word 已就绪/);
assert.match(localSaved,/桌面落盘请查看本地回执/);
assert.doesNotMatch(localSaved,/本地已保存|桌面已保存|<button/);

const readback=fixture({status:'queued',queue_reason:'heavy_capacity'});
readback.save.state='readback_pending';
const pending=render(readback);
assert.match(pending,/成品等待读回确认/);
assert.doesNotMatch(summary(pending),/等待.*位|Word 已就绪/);

const old=fixture();delete old.recovery.resource_class;delete old.recovery.queue_reason;
assert.match(summary(render(old)),/正在找图片/);
assert.doesNotMatch(render(old),/配图准备|等待.*位/);
delete old.recovery;
assert.match(summary(render(old)),/正在找图片/);
old.steps.forEach(step=>Object.assign(step,{state:'unrecorded',action:null,counts:null}));
assert.equal((render(old).match(/缺少可核验的历史记录/g)||[]).length,6);

const heavy=render(fixture({resource_class:'heavy'}));
assert.match(heavy,/Word 处理/);
assert.doesNotMatch(heavy,/配图准备|等待.*位/);
sixUnchangedStages(heavy);
const totalQueue=render(fixture({status:'queued',resource_class:'heavy',queue_reason:'total_capacity',queue_revision:1}));
assert.match(totalQueue,/任务已排队，等待处理/);
assert.doesNotMatch(totalQueue,/等待 Word 处理|Word 处理位置|暂满|queue_revision|queue_reason/);

// Execute the real component's hooks, effects and async intent handlers in an
// isolated lifecycle harness. Fetch is inert; this is not a browser or server.
function lifecycle(initial){
 let cursor=0,slots=[],effects=[],dirty=false,props={progress:initial},tree;
 const pending=[];
 const hooks={...React,
  useState(initialValue){const index=cursor++;if(!(index in slots))slots[index]=typeof initialValue==='function'?initialValue():initialValue;return [slots[index],value=>{const next=typeof value==='function'?value(slots[index]):value;if(!Object.is(next,slots[index])){slots[index]=next;dirty=true;}}];},
  useRef(value){const index=cursor++;return slots[index]??=( {current:value} );},
  useEffect(fn,deps){const index=cursor++,old=slots[index];if(!old||deps.length!==old.deps.length||deps.some((value,i)=>!Object.is(value,old.deps[i]))){slots[index]={deps,cleanup:old?.cleanup};effects.push(()=>{old?.cleanup?.();slots[index].cleanup=fn();});}}
 };
 const componentExports={};
 vm.runInNewContext(compiled,{exports:componentExports,require:name=>name==='react'?hooks:require(name),Date,Intl,AbortSignal,window:{setInterval:()=>1,clearInterval:()=>{}},fetch:(url,options)=>new Promise((resolve,reject)=>pending.push({url,options,resolve,reject}))});
 function flush(next,flags={}){
  if(next)props={progress:next,...flags};
  let turns=0;
  do {assert.ok(++turns<12,'component effects must settle');cursor=0;dirty=false;tree=componentExports.default(props);const run=effects;effects=[];run.forEach(fn=>fn());}while(dirty||effects.length);
  return renderToStaticMarkup(tree);
 }
 function button(node){if(!React.isValidElement(node))return null;if(node.type==='button')return node;for(const child of React.Children.toArray(node.props.children)){const found=button(child);if(found)return found;}return null;}
 return {flush,click(){const target=button(tree);assert.ok(target,'expected an intent control');const promise=target.props.onClick();flush();return promise;},resolve(recovery){const request=pending.shift();assert.ok(request,'expected an inert request');request.resolve({ok:true,json:async()=>({recovery})});return JSON.parse(request.options.body);},fail(probe,reject=false){const request=pending.shift();assert.ok(request,'expected an inert request');assert.equal(request.url,'/api/word-recovery');assert.equal(request.options.method,'POST');if(reject)request.reject(Error(probe));else request.resolve({ok:false,json:async()=>({error:probe})});return JSON.parse(request.options.body);},pending};
}
const countFixture=(version,count,recovery={})=>{const progress=fixture(recovery);progress.version=version;progress.steps[1].counts={completed:count,total:null,unit:'candidates'};return progress;};

const mounted=lifecycle(countFixture(2,8,{queue_reason:'heavy_capacity',queue_revision:2}));
assert.match(mounted.flush(),/等待 Word 处理/);
const lowQueue=countFixture(2,8,{queue_revision:1});
assert.match(mounted.flush(lowQueue),/等待 Word 处理/,'same control version with lower queue revision cannot clear the queue');
const lowControl=countFixture(2,8,{version:2,queue_revision:99});
assert.match(mounted.flush(lowControl),/等待 Word 处理/,'lower control version cannot win with a greater queue revision');
const refreshed=countFixture(2,8,{queue_revision:3,status:'await_executor'});
assert.match(mounted.flush(refreshed),/尚未开始处理/,'new durable queue revision can clear a queue at unchanged control version');
const oldProjection=countFixture(2,8);delete oldProjection.recovery.queue_revision;
assert.match(mounted.flush(oldProjection),/尚未开始处理/,'absent optional queue revision is zero');
const equalRunning=countFixture(2,8,{queue_revision:3,heartbeat_at:'2026-10-09T16:00:00.000Z',execution_confirmed:true});
assert.match(summary(mounted.flush(equalRunning)),/正在找图片/,'fresh confirmed execution restores the current action');
const equalExpired=structuredClone(equalRunning);equalExpired.recovery.status='await_executor';equalExpired.recovery.execution_confirmed=false;
const expiryMarkup=mounted.flush(equalExpired);
assert.match(expiryMarkup,/尚未开始处理/);
assert.doesNotMatch(summary(expiryMarkup),/正在找图片/,'equal tuple still accepts lease-expiry projection without inventing ongoing execution');

const newestCount=countFixture(4,12,{queue_revision:3});
assert.match(mounted.flush(newestCount),/已找到候选 12 张/);
const newerControlOldCount=countFixture(3,1,{version:4,desired:'paused',queue_revision:0});
const independent=mounted.flush(newerControlOldCount);
assert.match(independent,/已暂停/,'new control version is accepted independently of progress version');
assert.match(independent,/已找到候选 12 张/,'lower WordProgress version cannot erase established counts');
const equalSave=structuredClone(newestCount);equalSave.recovery={...newerControlOldCount.recovery};equalSave.save.cloud_ready=true;equalSave.save.independently_confirmed=true;equalSave.execution.state='saved';equalSave.steps.forEach(step=>step.state='completed');
assert.match(mounted.flush(equalSave),/Word 已就绪/,'same WordProgress version accepts independent final readback');

const output={output_id:'44444444-4444-4444-8444-444444444444',sha256:'b'.repeat(64),size:100,next_index:1,chunks:1};
const finalized=countFixture(4,12,{queue_reason:'heavy_capacity',queue_revision:2});
finalized.output=output;finalized.read_at='2026-10-09T17:00:10.000Z';finalized.save={...finalized.save,state:'cloud_ready',cloud_ready:true,independently_confirmed:true};finalized.execution.state='saved';finalized.steps.forEach(step=>step.state='completed');
const terminal=lifecycle(finalized);assert.match(terminal.flush(),/Word 已就绪/);
const beforeFinal=countFixture(4,12,{queue_reason:'heavy_capacity',queue_revision:2});beforeFinal.output=output;beforeFinal.read_at='2026-10-09T17:00:09.000Z';beforeFinal.save.state='finalizing';
const earlyFinal=terminal.flush(beforeFinal);
assert.match(earlyFinal,/Word 已就绪/);
noExecutableControl(earlyFinal);assert.doesNotMatch(earlyFinal,/任务已排队/,'older same-version projection cannot reopen a finalized task');
const equalFinal=structuredClone(beforeFinal);equalFinal.read_at=finalized.read_at;
const equalFinalMarkup=terminal.flush(equalFinal);noExecutableControl(equalFinalMarkup);assert.doesNotMatch(equalFinalMarkup,/任务已排队/,'equal read timestamp cannot undo native finalize');
const slowSnapshot=structuredClone(beforeFinal);slowSnapshot.read_at='2026-10-09T17:00:11.000Z';
const uncertain=terminal.flush(slowSnapshot);
assert.match(uncertain,/成品等待读回确认/);
noExecutableControl(uncertain);assert.doesNotMatch(uncertain,/Word 已就绪|任务已排队/,'later read timestamp on an old row preserves finalize but drops stale byte confirmation');
const unreadable=structuredClone(finalized);unreadable.read_at='2026-10-09T17:00:12.000Z';unreadable.save.state='readback_pending';unreadable.save.independently_confirmed=false;unreadable.execution.state='waiting';unreadable.steps[5].state='current';unreadable.steps[5].action='本站成品暂未读回，等待核对';
const notReadable=terminal.flush(unreadable);
assert.match(notReadable,/成品等待读回确认/);
noExecutableControl(notReadable);assert.doesNotMatch(notReadable,/Word 已就绪/,'fresh real storage failure must not retain historical confirmation');
assert.match(terminal.flush(finalized),/成品等待读回确认/,'an older successful read cannot mask the current unavailable output');
const restored=structuredClone(finalized);restored.read_at='2026-10-09T17:00:13.000Z';
assert.match(terminal.flush(restored),/Word 已就绪/,'a fresh actual same-output confirmation may restore the saved label');
const oldEventFreshStorage=structuredClone(unreadable);oldEventFreshStorage.version=3;oldEventFreshStorage.read_at='2026-10-09T17:00:14.000Z';oldEventFreshStorage.steps[1].counts={completed:1,total:null,unit:'candidates'};
const freshStorage=terminal.flush(oldEventFreshStorage);
assert.match(freshStorage,/成品等待读回确认/);
assert.match(freshStorage,/已找到候选 12 张/,'new storage evidence may update without rolling back higher-version step counts');
noExecutableControl(freshStorage);
const differentOutput=structuredClone(beforeFinal);differentOutput.read_at='2026-10-09T17:00:15.000Z';differentOutput.output={...output,output_id:'55555555-5555-4555-8555-555555555555',sha256:'c'.repeat(64)};
const replacedOutput=terminal.flush(differentOutput);
assert.doesNotMatch(replacedOutput,/Word 已就绪|成品等待读回确认/,'another explicit output identity cannot inherit the old final readback');
assert.match(replacedOutput,/任务已排队/);
const missingIdentity=lifecycle(finalized);missingIdentity.flush();const missingSnapshot=structuredClone(slowSnapshot);missingSnapshot.output=null;
const missingMarkup=missingIdentity.flush(missingSnapshot);noExecutableControl(missingMarkup);assert.doesNotMatch(missingMarkup,/任务已排队/,'a delayed missing-output projection cannot reopen a known finalized identity');

const other=countFixture(0,1);other.target_id='22222222-2222-4222-8222-222222222222';
const switched=mounted.flush(other);
assert.match(switched,/已找到候选 1 张/);
assert.doesNotMatch(switched,/已暂停|Word 已就绪|12 张/,'article scope switch resets both ordering guards');
const differentInput=countFixture(0,2);differentInput.input_sha256='a'.repeat(64);
assert.match(mounted.flush(differentInput),/已找到候选 2 张/,'input scope switch cannot retain another source counts');

const asyncUi=lifecycle(fixture({desired:'paused',status:'paused',queue_revision:0}));asyncUi.flush();
const oldIntent=asyncUi.click();
asyncUi.flush(fixture({version:4,epoch:3,queue_reason:'heavy_capacity',queue_revision:2}));
const request=asyncUi.resolve(fixture({version:4,epoch:3,queue_revision:1}).recovery);
assert.equal(request.expected_version,3,'queue revision must not change control CAS version');
await oldIntent;
const late=asyncUi.flush();
assert.match(late,/等待 Word 处理/);
assert.match(late,/已收到先前操作回执/,'late same-version lower-queue response must not overwrite current queue');

const switchUi=lifecycle(fixture());switchUi.flush();
const previousIntent=switchUi.click();
const nextArticle=fixture();nextArticle.target_id='33333333-3333-4333-8333-333333333333';switchUi.flush(nextArticle);
switchUi.resolve(fixture({version:99,desired:'paused',queue_revision:99}).recovery);
await previousIntent;
assert.doesNotMatch(switchUi.flush(),/已暂停|暂停已保存|已收到先前操作回执/,'another article must reject prior intent callbacks');
for(const probe of diagnosticProbes)for(const reject of [false,true]){
 const failed=lifecycle(fixture());failed.flush();const intent=failed.click();const body=failed.fail(probe,reject);assert.equal(body.intent,'paused','the real handler preserves its original operation scope');await intent;const html=failed.flush();assert.match(html,/操作结果未确认，请先刷新核对；勿重复操作/);assert.ok(!html.replaceAll('&quot;','"').includes(probe));assert.doesNotMatch(html,/synthetic-secret|\\u0073ynthetic|unrecognized public diagnostic prose/,'Word intent error bodies and thrown diagnostics use fixed notices');
}
console.log('PASS phase-pool UI: prepare/heavy and durable queue labels, real counts, stale/terminal/legacy/local semantics; actual component hook lifecycle rejects reordered control/queue/progress responses, preserves finalized identity and readonly under delayed same-version snapshots, shows fresh storage failures without latching success, accepts equal-version heartbeat/expiry/final reads, and isolates article/input/output/late intent callbacks. Synthetic static and hook rendering only; no production concurrency or browser acceptance claimed.');
