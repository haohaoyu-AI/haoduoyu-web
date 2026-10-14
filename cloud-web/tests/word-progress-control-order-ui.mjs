// Actual presentation source, public synthetic snapshots, no server or network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadUiSource} from './ui-source-module.mjs';

const {default:View,mergeWordProgress}=loadUiSource('components/word-stage-progress.tsx');
const {wordProgressSummary,publishStatus,wordSettlementApplies}=loadUiSource('components/publish-focus.ts');
const baseline=JSON.parse(fs.readFileSync('evidence/word-progress/v1-partial-fixture.json','utf8'));
const stamp=seconds=>`2026-10-14T04:00:${String(seconds).padStart(2,'0')}.000Z`;
const make=(version=10,seconds=20)=>{
 const p=structuredClone(baseline);p.version=version;p.read_at=stamp(seconds);p.can_control_word=true;
 p.steps[1]={...p.steps[1],state:'current',counts:{completed:12,total:null,unit:'candidates'}};p.steps[2]={...p.steps[2],state:'pending',counts:null};
 p.attempt={attempt_id:'11111111-1111-4111-8111-111111111111',generation:1,state:'running',started_at:stamp(0),active_elapsed_ms:1000,active_started_at:stamp(0),read_at:p.read_at,timeout_ms:3600000,timeout_due:false,stop_requested_at:null,reason:'none',restarts_used:0,max_restarts:2};
 p.recovery={version:3,epoch:2,desired:'run',status:'running',reason:'none',heartbeat_at:p.read_at,heartbeat_overdue:false,retry_count:0,retry_after:null,execution_confirmed:true,automatic_dispatch_available:false,resource_class:'prepare',queue_reason:null,queue_revision:0,serial_mode:true,safety_stop_pending:false,attempt:p.attempt};
 return p;
};
const pause=(p,version=4,epoch=3)=>{
 p.attempt={...p.attempt,state:'stop_requested',stop_requested_at:p.read_at};
 p.recovery={...p.recovery,version,epoch,desired:'paused',status:'waiting_safe_stop',execution_confirmed:false,safety_stop_pending:true,attempt:p.attempt};return p;
};
const deadlineSample=(p,seconds)=>{
 const start='2026-10-14T03:00:15.000Z';
 p.attempt={...p.attempt,started_at:start,active_started_at:start,active_elapsed_ms:0,read_at:stamp(seconds),timeout_due:seconds>15};p.recovery={...p.recovery,attempt:p.attempt};return p;
};
const render=p=>renderToStaticMarkup(React.createElement(View,{progress:p}));
let passed=0;
const test=(name,fn)=>{fn();passed++;console.log('PASS '+name);};

test('older observation preserves fresh steps while accepting newer persisted pause and stop',()=>{
 const current=make(),next=pause(make(9,10));next.steps[1].counts.completed=2;
 const before=structuredClone({current,next}),merged=mergeWordProgress(current,next);
 assert.equal(merged.version,10);assert.equal(merged.read_at,stamp(20));assert.equal(merged.steps[1].counts.completed,12);
 assert.equal(merged.recovery.version,4);assert.equal(merged.recovery.epoch,3);assert.equal(merged.recovery.desired,'paused');assert.equal(merged.attempt.state,'stop_requested');
 assert.equal(wordProgressSummary(merged).label,'等待暂停完成');assert.equal(publishStatus({id:merged.target_id,state:'processing',word_progress:merged}),'等待暂停完成');
 assert.match(render(merged),/等待暂停完成/);assert.match(render(merged),/<button[^>]*disabled[^>]*>等待停止确认/);assert.doesNotMatch(render(merged),/正在找图片|已暂停|执行已停止并结清/);
 assert.deepEqual({current,next},before,'merge never mutates either server snapshot');
});
test('same observation version and earlier read still carries a newer control clock',()=>{
 const merged=mergeWordProgress(make(),pause(make(10,10)));
 assert.equal(merged.read_at,stamp(20));assert.equal(merged.recovery.version,4);assert.equal(wordProgressSummary(merged).label,'等待暂停完成');
});
test('new control attempt projection supersedes the same response stale observation attempt',()=>{
 const current=make(),next=pause(make(9,10));next.attempt=structuredClone(current.attempt);
 const merged=mergeWordProgress(current,next);assert.equal(merged.attempt.state,'stop_requested');assert.equal(merged.attempt.stop_requested_at,stamp(10));assert.equal(wordProgressSummary(merged).label,'等待暂停完成');
});
test('newer observation cannot revive older running control or its running timer',()=>{
 const paused=mergeWordProgress(make(),pause(make(9,10))),newer=make(11,30);newer.steps[1].counts.completed=20;
 const merged=mergeWordProgress(paused,newer);
 assert.equal(merged.version,11);assert.equal(merged.steps[1].counts.completed,20);assert.equal(merged.recovery.version,4);assert.equal(merged.attempt.state,'stop_requested');
 assert.equal(wordProgressSummary(merged).label,'等待暂停完成');
});
test('control epoch cannot regress even behind a higher observation/control version',()=>{
 const current=pause(make(),4,3),next=make(11,30);next.recovery.version=99;next.recovery.epoch=2;
 const merged=mergeWordProgress(current,next);assert.equal(merged.version,11);assert.equal(merged.recovery.epoch,3);assert.equal(merged.recovery.desired,'paused');
});
test('queue revision advances independently while stale queue revisions are rejected',()=>{
 const current=make(),next=make(9,10);next.recovery={...next.recovery,status:'queued',execution_confirmed:false,queue_revision:2,queue_reason:'total_capacity'};
 const merged=mergeWordProgress(current,next);assert.equal(merged.recovery.queue_revision,2);assert.equal(wordProgressSummary(merged).label,'排队中');
 const old=make(11,30);old.recovery.queue_revision=1;assert.equal(mergeWordProgress(merged,old).recovery.queue_revision,2);
});
test('control read provenance permits fresh equal-clock reads without using observation time',()=>{
 const current=make();current.attempt=null;current.recovery.attempt=null;
 const next=make(9,10);next.attempt=null;next.recovery={...next.recovery,version:4,epoch:3,desired:'paused',status:'paused',attempt:null};
 const merged=mergeWordProgress(current,next);assert.equal(merged.read_at,stamp(20));assert.equal(merged.recovery_read_at,stamp(10));
 const fresh=structuredClone(next);fresh.read_at=stamp(15);fresh.recovery.heartbeat_overdue=true;
 const refreshed=mergeWordProgress(merged,fresh);assert.equal(refreshed.recovery.heartbeat_overdue,true);assert.equal(refreshed.recovery_read_at,stamp(15));
 const late=structuredClone(next);late.read_at=stamp(12);late.recovery.heartbeat_overdue=false;
 assert.equal(mergeWordProgress(refreshed,late).recovery.heartbeat_overdue,true);
});
test('foreign target and frozen-input scopes never inherit an earlier pause',()=>{
 const current=pause(make());
 for(const mutate of [p=>{p.target_kind='local_word';},p=>{p.target_id='22222222-2222-4222-8222-222222222222';},p=>{p.input_sha256='b'.repeat(64);}]){
  const next=make(0,1);mutate(next);assert.equal(mergeWordProgress(current,next),next);assert.equal(mergeWordProgress(current,next).recovery.desired,'run');
 }
});
test('new actual generation resets the old pause and old generation never reappears',()=>{
 const current=pause(make()),next=make(0,30);next.attempt={...next.attempt,attempt_id:'22222222-2222-4222-8222-222222222222',generation:2,state:'queued'};next.recovery={...next.recovery,version:5,epoch:4,status:'queued',attempt:next.attempt};
 assert.equal(mergeWordProgress(current,next),next);
 const old=pause(make(99,40),99,99);assert.equal(mergeWordProgress(next,old),next);
});
test('same generation with another attempt and mismatched nested attempt cannot inject control',()=>{
 const current=make(),different=pause(make(99,40),99,99);different.attempt={...different.attempt,attempt_id:'22222222-2222-4222-8222-222222222222'};different.recovery.attempt=different.attempt;
 assert.equal(mergeWordProgress(current,different),current);
 const nested=pause(make(9,10),99,99);nested.recovery.attempt={...nested.attempt,attempt_id:different.attempt.attempt_id};
 assert.equal(mergeWordProgress(current,nested).recovery,current.recovery);
});
test('new control invalidates only the old settlement binding',()=>{
 const current=make();current.execution.state='ended_settled';current.settlement={execution:'ended_settled',main_claim:'settled'};
 current.attempt={...current.attempt,state:'ended',active_started_at:null};current.recovery={...current.recovery,status:'blocked',execution_confirmed:false,attempt:current.attempt};assert.equal(wordSettlementApplies(current),true);
 const next=pause(make(9,10));next.attempt={...next.attempt,state:'ended',active_started_at:null};next.recovery={...next.recovery,status:'paused',safety_stop_pending:false,attempt:next.attempt};
 const merged=mergeWordProgress(current,next);assert.equal(merged.settlement,null);assert.equal(wordSettlementApplies(merged),false);assert.equal(wordProgressSummary(merged).label,'已暂停');
 const same=structuredClone(current);same.version=9;same.read_at=stamp(30);same.recovery.attempt={...same.attempt,read_at:stamp(30)};
 assert.deepEqual(mergeWordProgress(current,same).settlement,current.settlement,'same control binding retains actual settlement evidence');
});
test('independently confirmed saved bytes retain priority while new control is retained',()=>{
 const current=make();current.save={...current.save,state:'cloud_ready',cloud_ready:true,independently_confirmed:true};current.execution.state='saved';current.output={output_id:'synthetic-output',sha256:'c'.repeat(64),size:1,next_index:1,chunks:1};
 const next=pause(make(9,10));next.save=structuredClone(current.save);next.output=structuredClone(current.output);
 const merged=mergeWordProgress(current,next);assert.equal(merged.save.independently_confirmed,true);assert.equal(merged.recovery.desired,'paused');assert.equal(wordProgressSummary(merged).label,'Word 已就绪');
});
test('a later failed byte read revokes confirmation while accepting the newer control',()=>{
 const current=make();current.save={...current.save,state:'cloud_ready',cloud_ready:true,independently_confirmed:true};current.execution.state='saved';current.output={output_id:'synthetic-output',sha256:'c'.repeat(64),size:1,next_index:1,chunks:1};
 const next=pause(make(9,30));next.save={...next.save,state:'readback_pending'};
 const merged=mergeWordProgress(current,next);assert.equal(merged.version,10);assert.equal(merged.save.independently_confirmed,false);assert.equal(merged.save.state,'readback_pending');assert.deepEqual(merged.output,current.output);assert.equal(merged.recovery.version,4);assert.equal(wordProgressSummary(merged).label,'成品等待读回确认');
 const readBack=structuredClone(next);readBack.read_at=stamp(40);readBack.save=structuredClone(current.save);readBack.output=structuredClone(current.output);readBack.execution={...current.execution};
 const confirmed=mergeWordProgress(current,readBack);assert.equal(confirmed.save.independently_confirmed,true);assert.equal(confirmed.recovery.version,4);
});
test('storage-only reads cannot advance the retained control response clock',()=>{
 const current=make();current.save={...current.save,state:'cloud_ready',cloud_ready:true,independently_confirmed:true};current.execution.state='saved';current.output={output_id:'synthetic-output',sha256:'c'.repeat(64),size:1,next_index:1,chunks:1};
 const olderControl=make(9,40);olderControl.recovery.version=2;olderControl.recovery.epoch=1;
 const merged=mergeWordProgress(current,olderControl);assert.equal(merged.read_at,stamp(40));assert.equal(merged.recovery_read_at,stamp(20));
 const fresh=make(8,30);fresh.recovery.heartbeat_overdue=true;
 assert.equal(mergeWordProgress(merged,fresh).recovery.heartbeat_overdue,true,'equal-clock control read at 30 is newer than the retained control source at 20, regardless of storage read at 40');
});
test('a later response cannot replace a newer same-control attempt sample or clear its timeout',()=>{
 const current=deadlineSample(make(10,22),20),late=deadlineSample(make(10,30),10);
 const merged=mergeWordProgress(current,late);
 assert.equal(merged.attempt.read_at,stamp(20));assert.equal(merged.attempt.timeout_due,true);
 assert.equal(wordProgressSummary(merged).state,'blocked');assert.match(render(merged),/配图超时/);assert.doesNotMatch(render(merged),/当前步骤：/);
});
test('a newer attempt sample applies even when its response completed before the retained response',()=>{
 const current=deadlineSample(make(10,30),10),fresh=deadlineSample(make(10,22),20);
 const merged=mergeWordProgress(current,fresh);
 assert.equal(merged.read_at,stamp(30));assert.equal(merged.attempt.read_at,stamp(20));assert.equal(merged.attempt.timeout_due,true);assert.equal(wordProgressSummary(merged).state,'blocked');
});
test('same-control attempt clocks remain ordered through repeated response merges',()=>{
 const current=deadlineSample(make(10,22),20),late=deadlineSample(make(11,30),10);late.steps[1].counts.completed=20;
 const first=mergeWordProgress(current,late);assert.equal(first.version,11);assert.equal(first.steps[1].counts.completed,20);assert.equal(first.attempt.read_at,stamp(20));
 const again=deadlineSample(make(12,40),12);
 const merged=mergeWordProgress(first,again);assert.equal(merged.version,12);assert.equal(merged.attempt.read_at,stamp(20));assert.equal(merged.attempt.timeout_due,true);assert.match(render(merged),/本次配图已用 60分5秒/);
});

console.log(JSON.stringify({passed,failed:0,external_calls:0,scope:'actual React/static presentation source; independent observation/control clocks; public synthetic snapshots'}));
