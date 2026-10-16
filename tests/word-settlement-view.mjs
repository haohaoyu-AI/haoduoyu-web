// Public synthetic presentation fixtures only; no browser, network or API calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadUiSource} from './ui-source-module.mjs';

const view=loadUiSource('components/word-stage-progress.tsx').default;
const {wordProgressSummary,publishStatus,wordSettlementApplies}=loadUiSource('components/publish-focus.ts');
const fixture=JSON.parse(fs.readFileSync('evidence/word-progress/v1-partial-fixture.json','utf8'));
const make=()=>{
 const p=structuredClone(fixture);
 p.target_kind='article';p.output=null;p.can_control_word=false;
 p.settlement={execution:'ended_settled',main_claim:'unsettled_active'};
 p.execution={...p.execution,state:'ended_settled',claim_active:true,update_overdue:false};
 p.save={state:'not_started',cloud_ready:false,independently_confirmed:false,desktop_saved:null};
 p.attempt={attempt_id:'11111111-1111-1111-1111-111111111111',generation:1,state:'ended',started_at:'2026-10-12T06:30:00.000Z',active_elapsed_ms:120000,active_started_at:null,read_at:'2026-10-12T06:49:31.000Z',timeout_ms:3600000,timeout_due:false,stop_requested_at:'2026-10-12T06:47:37.000Z',reason:'executor_ended_settled',restarts_used:0,max_restarts:2};
 p.recovery={version:3,epoch:3,desired:'run',status:'blocked',reason:'http_403',heartbeat_at:null,heartbeat_overdue:false,retry_count:0,retry_after:null,execution_confirmed:false,automatic_dispatch_available:false,resource_class:'heavy',queue_reason:null,serial_mode:true,safety_stop_pending:false,attempt:p.attempt};
 return p;
};
const render=(p,extra={})=>renderToStaticMarkup(React.createElement(view,{progress:p,...extra}));
let passed=0;
const pass=name=>{passed++;console.log(`PASS ${name}`);};

const p=make(),original=structuredClone(p),summary=wordProgressSummary(p);
assert.equal(summary.label,'执行已停止并结清');assert.equal(summary.state,'blocked');
assert.match(summary.reason,/文章认领尚未结束/);assert.match(summary.reason,/图片访问阻断记录仍待正规核验/);
const html=render(p);
assert.match(html,/执行已停止并结清/);assert.match(html,/已有进度和成果保留/);
assert.doesNotMatch(html,/>暂停<|>继续<|两平台草稿已验收|云端 Word 已就绪/);
assert.equal((html.match(/<li /g)||[]).length,6);assert.deepEqual(p,original);
pass('settled execution is separate from a still-live main claim; network blocker, six stages and retained evidence remain visible');

const settled=make();settled.settlement.main_claim='settled';settled.execution.claim_active=false;
assert.match(render(settled),/文章认领已结束/);assert.match(render(settled),/图片访问阻断记录仍待正规核验/);
assert.equal(wordProgressSummary(settled).state,'blocked');assert.equal(settled.save.cloud_ready,false);
pass('ended main claim is not a saved Word or permission to restart while network is blocked');

const expired=make();expired.settlement.main_claim='unsettled_expired';expired.execution.claim_active=false;
assert.match(render(expired),/文章认领已到期，结束回执尚未确认/);
pass('lease expiry is displayed separately from a recorded main-claim end');

const unconfirmed=make();unconfirmed.settlement.main_claim='unconfirmed';
assert.match(render(unconfirmed),/文章认领结束情况尚待核对/);
pass('unknown main-claim status does not turn into ended or completed');

for(const [name,mutate] of [
 ['no trusted settlement',p=>{p.settlement=null;}],
 ['unfinished original attempt',p=>{p.attempt.state='waiting_safe_stop';p.recovery.safety_stop_pending=true;}],
 ['paused_safe is not ended',p=>{p.attempt.state='paused_safe';}],
 ['active timer still open',p=>{p.attempt.active_started_at='2026-10-12T06:49:31.000Z';}],
 ['current execution still running',p=>{p.recovery.status='running';p.recovery.execution_confirmed=true;}],
 ['current request is queued',p=>{p.recovery.status='queued';}],
 ['local Word uses its own contract',p=>{p.target_kind='local_word';}]
]){
 const changed=make();mutate(changed);
 assert.equal(wordSettlementApplies(changed),false);assert.notEqual(wordProgressSummary(changed).label,'执行已停止并结清');
 pass(name);
}

for(const [name,attempt,control] of [
 ['later attempt identity',{...p.attempt,attempt_id:'22222222-2222-2222-2222-222222222222'},p.recovery],
 ['later generation',{...p.attempt,generation:2},p.recovery],
 ['later control snapshot',p.attempt,{...p.recovery,version:4,status:'running',execution_confirmed:true}]
]){
 assert.equal(wordSettlementApplies(p,attempt,control),false);
 assert.notEqual(wordProgressSummary(p,{attempt,control}).label,'执行已停止并结清');
 pass(name);
}

for(const [name,extra] of [['offline',{networkOffline:true}],['read failure',{readError:true}],['deferred read',{deferred:true}],['unavailable read',{unavailable:true}]]){
 const stale=render(make(),extra);
 assert.match(stale,/上次|暂不可用|网络已断开|连接中断/);
 assert.notEqual(wordProgressSummary(make(),{stale:true}).label,'执行已停止并结清');
 pass(name+' preserves historical observations without claiming fresh settlement');
}

const saved=make();saved.execution.state='saved';saved.save={state:'cloud_ready',cloud_ready:true,independently_confirmed:true,desktop_saved:null};
assert.equal(wordProgressSummary(saved).state,'completed');assert.doesNotMatch(render(saved),/文章认领尚未结束/);
const pending=make();pending.save={state:'readback_pending',cloud_ready:false,independently_confirmed:false,desktop_saved:null};
assert.match(render(pending),/成品等待读回确认/);assert.doesNotMatch(render(pending),/文章认领尚未结束/);
pass('independent saved/readback states have priority over an older settlement projection');

assert.equal(publishStatus({id:p.target_id,state:'processing',has_result:false,word_progress:p}),'执行已停止并结清');
assert.equal(publishStatus({id:p.target_id,state:'processing',has_result:false,word_progress:p,word_progress_deferred:true}),'进度待确认');
pass('article list and detail share the truthful settled headline and stale guard');

console.log(JSON.stringify({passed,failed:0,external_calls:0,rendering:'actual React component, synthetic public fixtures',production_verification:false}));
