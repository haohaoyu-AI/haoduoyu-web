'use client';
import {useEffect,useRef,useState} from 'react';
import type {WordProgress,WordStep,WordRecoveryView,WordAttemptView} from '../lib/word-progress-contract';
import {retainedWordAdvice,wordRecoveryActionCapability} from './word-recovery-capability';
import {wordSettlementApplies,platformProgress,wordProgressSummary,wordStageTitle,safeRecordId,type PublishRow} from './publish-focus';

function recordedInteger(value:unknown){return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;}

export function wordStepDetail(step:WordStep){
 const count=step.counts;
 if(!count)return '';
 const completed=recordedInteger(count.completed),total=count.total===null?null:recordedInteger(count.total);
 if(completed===null||(count.total!==null&&total===null))return '数量暂无可信记录';
 const fraction=`${completed}${total===null?'':`/${total}`}`;
 if(count.unit==='candidates')return `已找到候选 ${completed} 张`;
 if(count.unit==='images')return `${step.evidence==='site_record'?'已冻结清单':'已确定'} ${fraction} 张`;
 if(count.unit==='pages')return `已检查 ${fraction} 页`;
 return count.unit==='chunks'?`已保存 ${fraction} 块`:'数量暂无可信记录';
}
export function wordAttemptDuration(attempt:WordAttemptView|null|undefined,now:number,historical=false){
 if(!attempt)return '配图耗时暂无记录';
 if(!attempt.started_at)return '配图尚未开始，排队不计时';
 const clock=historical?Date.parse(attempt.read_at):now;
 if(!Number.isFinite(clock))return '配图耗时暂无记录';
 if(recordedInteger(attempt.active_elapsed_ms)===null)return '配图耗时暂无记录';
 const active=attempt.active_started_at?Math.max(0,clock-Date.parse(attempt.active_started_at)):0,ms=attempt.active_elapsed_ms+active;
 if(!Number.isFinite(ms)||ms<0)return '配图耗时暂无记录';
 const minutes=Math.floor(ms/60000),seconds=Math.floor(ms/1000)%60;
 return `${historical?'上次记录：':''}本次配图已用 ${minutes?`${minutes}分`:''}${seconds}秒`;
}
function updated(value:string|null){if(!value||!Number.isFinite(Date.parse(value)))return '最后更新暂无记录';return `最后更新 ${new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value))}`;}
function displayedStepDetail(step:WordStep,historical:boolean){const detail=wordStepDetail(step);return historical&&!step.counts&&detail&&step.state==='current'?`上次动作：${detail.replace(/^正在/,'')}`:detail;}
function olderRecovery(next:WordRecoveryView,current:WordRecoveryView){return next.version<current.version||next.epoch<current.epoch||(next.version===current.version&&next.epoch===current.epoch&&(next.queue_revision||0)<(current.queue_revision||0));}
function sameAttempt(a:WordAttemptView|null|undefined,b:WordAttemptView|null|undefined){return (a?.attempt_id||null)===(b?.attempt_id||null)&&(a?.generation||0)===(b?.generation||0);}
function controlReadAt(progress:WordProgress){return progress.recovery_read_at||progress.read_at;}
function applicableRecovery(progress:WordProgress){return progress.recovery&&(!progress.recovery.attempt||sameAttempt(progress.recovery.attempt,progress.attempt))?progress.recovery:null;}
function recordedTime(value:unknown){return value===null||typeof value==='string'&&Number.isFinite(Date.parse(value));}
function validAttempt(value:unknown):value is WordAttemptView{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const a=value as WordAttemptView;
 return typeof a.attempt_id==='string'&&a.attempt_id.length>0&&recordedInteger(a.generation)!==null&&a.generation>0&&typeof a.state==='string'&&recordedTime(a.started_at)&&recordedTime(a.active_started_at)&&typeof a.read_at==='string'&&Number.isFinite(Date.parse(a.read_at))&&recordedInteger(a.active_elapsed_ms)!==null&&recordedInteger(a.timeout_ms)!==null&&a.timeout_ms>0&&typeof a.timeout_due==='boolean'&&recordedTime(a.stop_requested_at)&&typeof a.reason==='string'&&recordedInteger(a.restarts_used)!==null&&recordedInteger(a.max_restarts)!==null;
}
function recoveryShape(value:unknown):value is WordRecoveryView{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const r=value as WordRecoveryView;
 return recordedInteger(r.version)!==null&&recordedInteger(r.epoch)!==null&&typeof r.desired==='string'&&typeof r.status==='string'&&typeof r.reason==='string'&&recordedTime(r.heartbeat_at)&&typeof r.heartbeat_overdue==='boolean'&&recordedInteger(r.retry_count)!==null&&recordedTime(r.retry_after)&&typeof r.execution_confirmed==='boolean'&&r.automatic_dispatch_available===false&&(r.attempt==null||validAttempt(r.attempt))&&(r.queue_revision===undefined||recordedInteger(r.queue_revision)!==null)&&(r.serial_mode===undefined||typeof r.serial_mode==='boolean')&&(r.safety_stop_pending===undefined||typeof r.safety_stop_pending==='boolean');
}
// Frontend DTO integrity only. A valid shape grants no execution, saved-byte or
// settlement authority; those independent gates still decide presentation.
export function validateWordProgressDto(value:unknown):value is WordProgress{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const p=value as WordProgress,e=p.execution,s=p.save;
 if(p.contract_version!==1||!['article','local_word'].includes(p.target_kind)||typeof p.target_id!=='string'||!p.target_id||typeof p.input_sha256!=='string'||!/^[a-f0-9]{64}$/.test(p.input_sha256)||recordedInteger(p.version)===null||typeof p.legacy!=='boolean'||!recordedTime(p.started_at)||!recordedTime(p.updated_at)||!recordedTime(p.completed_at)||typeof p.read_at!=='string'||!Number.isFinite(Date.parse(p.read_at))||p.can_control_word!==undefined&&typeof p.can_control_word!=='boolean')return false;
 if(!e||typeof e!=='object'||Array.isArray(e)||typeof e.state!=='string'||typeof e.reason!=='string'||typeof e.reason_text!=='string'||typeof e.claim_active!=='boolean'||typeof e.update_overdue!=='boolean'||!s||typeof s!=='object'||Array.isArray(s)||typeof s.state!=='string'||typeof s.cloud_ready!=='boolean'||typeof s.independently_confirmed!=='boolean'||s.desktop_saved!==null)return false;
 if(!Array.isArray(p.steps)||p.steps.length!==6||!p.steps.every(step=>step&&typeof step==='object'&&typeof step.id==='string'&&typeof step.label==='string'&&typeof step.state==='string'&&(step.action===null||typeof step.action==='string')&&(step.evidence===null||typeof step.evidence==='string')&&(step.counts===null||step.counts&&typeof step.counts==='object'&&!Array.isArray(step.counts)&&Object.hasOwn(step.counts,'completed')&&Object.hasOwn(step.counts,'total')&&typeof step.counts.unit==='string')))return false;
 if(p.attempt!=null&&!validAttempt(p.attempt)||p.recovery!=null&&!recoveryShape(p.recovery))return false;
 if(p.recovery?.attempt&&!sameAttempt(p.recovery.attempt,p.attempt))return false;
 const o=p.output;
 return o===null||!!o&&typeof o==='object'&&!Array.isArray(o)&&typeof o.output_id==='string'&&typeof o.sha256==='string'&&recordedInteger(o.size)!==null&&recordedInteger(o.next_index)!==null&&recordedInteger(o.chunks)!==null;
}
function validRecovery(value:unknown,prior:WordAttemptView|null|undefined):value is WordRecoveryView{
 if(!recoveryShape(value))return false;
 const r=value;
 if(!['run','paused','cancelled'].includes(r.desired)||!['running','paused','cancelled','backoff','blocked','await_executor','saved','queued','stop_requested','waiting_safe_stop'].includes(r.status))return false;
 const a=r.attempt;
 if(!a)return !prior;
 return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(a.attempt_id)&&['queued','running','stop_requested','waiting_safe_stop','paused_safe','ended','saved','blocked'].includes(a.state)&&sameAttempt(a,prior);
}
// Shared with Home's GET dispatch provenance; never an execution/end clock.
function clientReadOrder(){return typeof performance==='undefined'?Date.now():performance.now();}
function mergeWordObservation(current:WordProgress,next:WordProgress):WordProgress{
 const earlier=Date.parse(next.read_at)<Date.parse(current.read_at),later=Date.parse(next.read_at)>Date.parse(current.read_at);
 if(next.version===current.version&&earlier)return current;
 const olderVersion=next.version<current.version;
 const compatibleOutput=!!current.output&&(!next.output||(next.output.output_id===current.output.output_id&&next.output.sha256===current.output.sha256));
 if(current.save.cloud_ready&&compatibleOutput&&next.version<=current.version){
  if(!next.save.cloud_ready){
   if(!later)return current;
   // A slow read can carry an older row and a later completion timestamp.
   // Preserve known native finalize, but do not reuse its old byte confirmation.
   return {...current,read_at:next.read_at,can_control_word:false,save:{...current.save,state:'readback_pending',independently_confirmed:false},execution:{...current.execution,state:'waiting',reason:'saved_readback_pending',reason_text:'本站成品暂未读回，等待核对'},steps:current.steps.map(step=>step.id==='save_final'?{...step,state:'current',action:'本站成品暂未读回，等待核对'}:step)};
  }
  if(olderVersion&&later&&next.output){
   // Current storage evidence is independent of the executor observation version.
   return {...current,read_at:next.read_at,can_control_word:false,save:next.save,execution:next.execution,output:next.output,steps:current.steps.map(step=>step.id==='save_final'?next.steps.find(value=>value.id==='save_final')||step:step)};
  }
 }
 return olderVersion?current:next;
}
export function mergeWordProgress(current:WordProgress|null,next:WordProgress|null):WordProgress|null{
 if(next&&!validateWordProgressDto(next))return current&&validateWordProgressDto(current)?current:null;
 if(current&&!validateWordProgressDto(current))current=null;
 if(!current||!next)return next;
 // A scope switch starts from its own server snapshot; never transplant control
 // or saved evidence from another task, frozen input or execution generation.
 if(current.target_kind!==next.target_kind||current.target_id!==next.target_id||current.input_sha256!==next.input_sha256)return next;
 const currentGeneration=current.attempt?.generation||0,nextGeneration=next.attempt?.generation||0;
 if(nextGeneration!==currentGeneration)return nextGeneration<currentGeneration?current:next;
 if(!sameAttempt(current.attempt,next.attempt))return current;
 const observation=mergeWordObservation(current,next),currentRecovery=applicableRecovery(current),nextRecovery=applicableRecovery(next);
 if(!currentRecovery&&!nextRecovery&&!observation.recovery)return observation;
 let controlSource=currentRecovery?current:next;
 if(nextRecovery&&(!currentRecovery||(!olderRecovery(nextRecovery,currentRecovery)&&(olderRecovery(currentRecovery,nextRecovery)||Date.parse(controlReadAt(next))>=Date.parse(controlReadAt(current))))))controlSource=next;
 const recovery=controlSource===current?currentRecovery:nextRecovery;
 const controlChanged=observation.recovery?.version!==recovery?.version||observation.recovery?.epoch!==recovery?.epoch||(observation.recovery?.queue_revision||0)!==(recovery?.queue_revision||0);
 const nestedAttempt=recovery?.attempt;
 const controlledAttempt=nestedAttempt&&(controlChanged||Date.parse(nestedAttempt.read_at)>Date.parse(controlSource.attempt?.read_at||''))?nestedAttempt:controlSource.attempt;
 let attempt=recovery&&sameAttempt(controlledAttempt,observation.attempt)?controlledAttempt:observation.attempt;
 // Response completion can lag its attempt query. Within the same persisted
 // control version/epoch, order the other snapshot's attempt by its own clock.
 // A new pause/control fence still owns its projection even with an earlier clock.
 const otherSource=controlSource===current?next:current,otherRecovery=controlSource===current?nextRecovery:currentRecovery;
 const otherNested=otherRecovery?.attempt;
 const otherAttempt=otherNested&&Date.parse(otherNested.read_at)>Date.parse(otherSource.attempt?.read_at||'')?otherNested:otherSource.attempt;
 if(recovery&&otherRecovery&&recovery.version===otherRecovery.version&&recovery.epoch===otherRecovery.epoch&&sameAttempt(otherAttempt,attempt)&&Date.parse(otherAttempt?.read_at||'')>Date.parse(attempt?.read_at||''))attempt=otherAttempt;
 if(recovery===observation.recovery&&attempt===observation.attempt&&controlReadAt(observation)===controlReadAt(controlSource))return observation;
 // Settlement belongs to the server snapshot's exact control version/epoch.
 // An independent control update cannot inherit that old end attestation.
 const settlementApplies=observation.recovery?.version===recovery?.version&&observation.recovery?.epoch===recovery?.epoch;
 return {...observation,recovery,attempt,recovery_read_at:controlReadAt(controlSource),settlement:settlementApplies?observation.settlement:null};
}
type UnknownControl={key:string;progress:WordProgress;control:WordRecoveryView|null;failed_at:number;rechecking:boolean;readback:WordProgress|null};
function freshReadback(pending:UnknownControl,readback:WordProgress|null,startedAt:number|undefined){
 if(!validateWordProgressDto(readback)||readback===pending.readback||typeof startedAt!=='number'||!Number.isFinite(startedAt)||startedAt<=pending.failed_at)return false;
 const original=pending.progress,recovery=applicableRecovery(readback);
 if(readback.target_kind!==original.target_kind||readback.target_id!==original.target_id||readback.input_sha256!==original.input_sha256||!sameAttempt(readback.attempt,original.attempt)||Date.parse(readback.read_at)<=Date.parse(original.read_at))return false;
 if(original.attempt&&(!readback.attempt||Date.parse(readback.attempt.read_at)<=Date.parse(original.attempt.read_at)))return false;
 return !(readback.recovery&&!recovery||pending.control&&(!recovery||olderRecovery(recovery,pending.control)));
}
export default function WordStageProgress({progress:providedProgress,article,unavailable=false,deferred=false,reading=false,onReadProgress,onAuthRequired,readback=null,readbackStartedAt,readError=false,networkOffline=false}:{progress:WordProgress|null|undefined;article?:PublishRow;unavailable?:boolean;deferred?:boolean;reading?:boolean;onReadProgress?:()=>void;onAuthRequired?:()=>void;readback?:WordProgress|null;readbackStartedAt?:number;readError?:boolean;networkOffline?:boolean}){
 const invalidProgress=!!providedProgress&&!validateWordProgressDto(providedProgress),incomingProgress=invalidProgress?null:providedProgress;
 const [now,setNow]=useState(0);
 const intentBusy=useRef(false);
 const targetKey=JSON.stringify([incomingProgress?.target_kind,incomingProgress?.target_id,incomingProgress?.input_sha256]);
 const [progressState,setProgressState]=useState<{key:string;progress:WordProgress|null}>({key:targetKey,progress:incomingProgress||null});
 const progress=progressState.key===targetKey?mergeWordProgress(progressState.progress,incomingProgress||null):incomingProgress;
 const latestProgress=useRef(progress);
 useEffect(()=>{latestProgress.current=progress;},[progress]);
 useEffect(()=>{setProgressState(previous=>({key:targetKey,progress:previous.key===targetKey?mergeWordProgress(previous.progress,incomingProgress||null):incomingProgress||null}));},[incomingProgress,targetKey]);
 // Reject a late prior-generation read before changing the control/request scope.
 const scopeKey=JSON.stringify([targetKey,progress?.attempt?.attempt_id,progress?.attempt?.generation]);
 // Control versions advance independently from executor observation versions.
 const incomingRecovery=progress?.recovery||null;
 const scope=useRef({key:scopeKey,generation:0,request:0});
 if(scope.current.key!==scopeKey)scope.current={key:scopeKey,generation:scope.current.generation+1,request:scope.current.request+1};
 const [controlState,setControlState]=useState<{key:string;recovery:WordRecoveryView|null}>({key:scopeKey,recovery:incomingRecovery}),[changing,setChanging]=useState(false),[notice,setNotice]=useState('');
 const unknownControl=useRef<UnknownControl|null>(null),deniedScope=useRef<string|null>(null),authFailure=useRef<UnknownControl|null>(null);
 const [unknownKey,setUnknownKey]=useState<string|null>(null),[authScope,setAuthScope]=useState<string|null>(null);
 const controlUnknown=unknownKey===scopeKey,authDenied=authScope===scopeKey;
 const control=controlState.key===scopeKey?controlState.recovery:incomingRecovery;
 const latestControl=useRef(control);latestControl.current=control;
 const observedAttempt=progress?.attempt||null,controlAttempt=control?.attempt||null;
 const newerAttemptClock=!!controlAttempt&&!!observedAttempt&&(Date.parse(controlAttempt.read_at)>Date.parse(observedAttempt.read_at)||(controlAttempt.read_at===observedAttempt.read_at&&(control?.version||0)>(progress?.recovery?.version||0)));
 const attempt=controlAttempt&&(!observedAttempt||(controlAttempt.attempt_id===observedAttempt.attempt_id&&controlAttempt.generation===observedAttempt.generation&&newerAttemptClock))?controlAttempt:observedAttempt;
 const elapsedScope=JSON.stringify([scopeKey,attempt?.read_at||progress?.read_at]);
 const elapsedClock=useRef({key:elapsedScope,received_at:Date.now()});
 if(elapsedClock.current.key!==elapsedScope)elapsedClock.current={key:elapsedScope,received_at:Date.now()};
 useEffect(()=>{setControlState(previous=>({key:scopeKey,recovery:previous.key===scopeKey&&previous.recovery&&(!incomingRecovery||olderRecovery(incomingRecovery,previous.recovery))?previous.recovery:incomingRecovery}));},[incomingRecovery,scopeKey]);
 useEffect(()=>{setNotice('');setChanging(false);},[scopeKey]);
 useEffect(()=>{
  const denied=authFailure.current;
  if(denied?.key===scopeKey&&freshReadback(denied,readback,readbackStartedAt)){
   deniedScope.current=null;authFailure.current=null;setAuthScope(null);setNotice('已重新读取同一任务；请按当前本站记录核对。');
  }
  const pending=unknownControl.current;
  if(!pending||pending.key!==scopeKey||!pending.rechecking||!freshReadback(pending,readback,readbackStartedAt)||!readback)return;
  // Only a successful, applicable GET begun after the unknown result can
  // reconcile this client write. List/storage projections cannot supply it.
  const recovery=applicableRecovery(readback);
  if(incomingRecovery&&(!recovery||olderRecovery(recovery,incomingRecovery))||latestControl.current&&(!recovery||olderRecovery(recovery,latestControl.current)))return;
  unknownControl.current=null;setUnknownKey(null);setNotice('已读取同一任务的新进度，请按当前记录核对后再操作。');
 },[readback,readbackStartedAt,scopeKey,incomingRecovery]);
 useEffect(()=>{const tick=()=>setNow(Date.now());tick();const timer=window.setInterval(tick,1000);return()=>window.clearInterval(timer);},[]);
 const requestReadProgress=()=>{if(!onReadProgress)return;const pending=unknownControl.current;if(pending?.key===scopeKey)unknownControl.current={...pending,rechecking:true,readback};onReadProgress();};
 const requestRead=(event:{currentTarget:{open:boolean}})=>{if(event.currentTarget.open&&!reading&&!networkOffline&&!readError&&(unavailable||deferred||!progress))requestReadProgress();};
 if(authDenied)return <p className="word-stage-notice" role="alert">登录状态已变化，旧 Word 详情已隐藏；请使用本人账号重新登录并读取文章。</p>;
 if(invalidProgress)return <p className="word-stage-notice" role="status">Word 进度格式待核对，编号未展示，最后更新暂无记录；请重新读取本站进度。</p>;
 if(!progress)return unavailable||deferred||reading?<details className="word-stage-progress" onToggle={requestRead}><summary>{networkOffline?'网页网络已断开':readError?'网页连接中断':reading?'正在读取 Word 进度':unavailable?'Word 进度暂不可用':'查看 Word 进度'}</summary><p className="word-stage-notice" role="status">{networkOffline||readError?'暂时无法读取新状态；后台执行情况未确认':reading?'正在读取本站已有进度和成果。':unavailable?'暂时无法读取 Word 进度；可继续查看任务状态和已有成品。':'展开后读取本站已有进度和成果。'}</p>{unavailable&&!reading&&!networkOffline&&!readError&&onReadProgress&&<button type="button" onClick={requestReadProgress}>重读进度</button>}</details>:null;
 const current=progress.steps.find(step=>step.state==='current');
 // Interpolate from the server's real read clock, not the device's UTC clock.
 const elapsedNow=Date.parse(attempt?.read_at||progress.read_at)+(now?Math.max(0,now-elapsedClock.current.received_at):0);
 const stale=unavailable||networkOffline||readError||reading||deferred;
 const observedPresentation=wordProgressSummary(progress,{stale,control,attempt});
 const presentation=controlUnknown&&observedPresentation.state==='running'?wordProgressSummary(progress,{stale:true,control,attempt}):observedPresentation;
 const endedSettled=wordSettlementApplies(progress,attempt,control);
 const recoveryAction=wordRecoveryActionCapability({...progress,recovery:control,attempt},stale);
 const draftStages=article&&progress.target_kind==='article'?(['toutiao','zhihu'] as const).map(platform=>({platform,...platformProgress(article,platform)})):[];
 const queueEligible=!progress.save.cloud_ready&&!progress.save.independently_confirmed&&progress.save.state!=='readback_pending'&&progress.execution.state!=='saved'&&control?.desired==='run'&&(control.status==='queued'||control.status==='running'||attempt?.state==='queued');
 const queueReason=queueEligible?control?.queue_reason:null;
 const serialQueued=!!control?.serial_mode&&queueEligible&&(control.status==='queued'||attempt?.state==='queued');
 const queueLabel=serialQueued?'排队中':queueReason==='prepare_capacity'?'等待配图准备':queueReason==='total_capacity'?'等待处理':queueReason==='heavy_capacity'?'等待 Word 处理':null;
 const queuedHistory=queueEligible&&(control?.status==='queued'||serialQueued);
 const stopPending=!!control?.safety_stop_pending||['stop_requested','waiting_safe_stop'].includes(control?.status||'')||['stop_requested','waiting_safe_stop'].includes(attempt?.state||'');
 const deadlineWaiting=!!attempt?.timeout_due&&attempt.state==='running'&&!stopPending;
 const historical=stale||queuedHistory||stopPending||deadlineWaiting||presentation.state!=='running';
 const elapsedLabel=serialQueued&&!attempt&&!progress.legacy?'配图尚未开始，排队不计时':wordAttemptDuration(attempt,elapsedNow,historical);
 const recoveryLabel=stopPending?'等待安全停止':endedSettled?'执行已停止并结清':deadlineWaiting?'配图超时':control?.desired==='paused'?'已暂停':control?.desired==='cancelled'?'已取消':control?.status==='blocked'||attempt?.state==='blocked'?'等待条件恢复':control?.status==='backoff'?'等待重试':queueLabel?(control?.status==='running'&&control.resource_class==='prepare'?`配图准备 · ${queueLabel}`:queueLabel):control?.status==='await_executor'?'尚未开始处理':control?.status==='queued'?(control.serial_mode?'排队中':'等待处理'):control?.status==='running'?(control.resource_class==='prepare'?'配图准备':control.resource_class==='heavy'?'Word 处理':'执行中'):null;
 const label=networkOffline?'网页网络已断开':readError?'网页连接中断':reading?'正在读取进度':unavailable?'进度暂不可用':deferred?'上次读取的进度':presentation.label;
 const timeoutStop=attempt?.timeout_due||attempt?.reason==='timeout_60m'||attempt?.reason==='timeout';
 const stopReason=timeoutStop?'本次配图已超过 60 分钟；等待确认旧动作已结束，已有成果保留。':attempt?.stop_requested_at?'停止请求已保存；等待确认旧动作已结束，已有成果保留。':'原执行结束尚未确认；等待安全停止与实际结束证据，已有成果保留。';
 const reason=networkOffline||readError?'暂时无法读取新状态；后台执行情况未确认':reading?'正在读取新进度；以下为上次读取的记录。':unavailable?'暂时无法读取 Word 进度；以下为上次读取的记录，可继续查看任务状态和已有成品。':deferred?'展开后读取最新进度；以下为上次读取的记录。':stopPending?stopReason:deadlineWaiting?'本次配图已超过 60 分钟，等待正常停止及结束核对；尚未重新配图。':serialQueued?'本篇排队中，等待配图处理；排队时间不计入配图耗时。':queueReason==='prepare_capacity'?'任务已排队，等待配图准备；已有进度和成果保留。':queueReason==='total_capacity'?'任务已排队，等待处理；已有进度和成果保留。':queueReason==='heavy_capacity'?'任务已排队，等待 Word 处理；是否仍在处理以新进度为准。':presentation.reason;
 const states={completed:'已完成',current:'当前',pending:'待开始',unrecorded:'无历史记录'};
 const interruptionLabels:Record<string,string>={http_403:'公网图片访问被拒绝，等待网络能力恢复',login_required:'等待登录条件恢复',captcha:'等待验证条件恢复',no_executor:'等待可用执行器',executor_ended:'执行者已明确结束',network_timeout:'网络请求超时，先核对已有回执',response_unknown:'请求结果未确认，先读取已有回执',service_unavailable:'服务暂不可用',repair_failed:'修复未成功，已有成果保留',repair_unknown:'修复结果未确认，已有成果保留',rate_limited:'请求暂时受限'};
 async function intent(value:'paused'|'run'|'cancelled'){
  if(!progress||intentBusy.current||unknownControl.current?.key===scopeKey||deniedScope.current===scopeKey)return;intentBusy.current=true;const generation=scope.current.generation,request=++scope.current.request;const applicable=()=>scope.current.key===scopeKey&&scope.current.generation===generation&&scope.current.request===request;setChanging(true);setNotice('');
  // Only bound the webpage wait; a timeout never certifies a server-side stop.
  try{
   const response=await fetch('/api/word-recovery',{method:'POST',headers:{'Content-Type':'application/json','x-xiaoyu-upload':'1'},body:JSON.stringify({target_kind:progress.target_kind,target_id:progress.target_id,input_sha256:progress.input_sha256,expected_version:control?.version||0,intent:value}),signal:AbortSignal.timeout(20000)});
   if(!applicable())return;
   if(response.status===401||response.status===403){deniedScope.current=scopeKey;authFailure.current={key:scopeKey,progress:latestProgress.current||progress,control:latestControl.current,failed_at:clientReadOrder(),rechecking:false,readback};setAuthScope(scopeKey);onAuthRequired?.();return;}
   const body=await response.json() as {recovery?:unknown}|null;
   if(!applicable())return;
   const recovered=body?.recovery;
   // Intent writes retain this attempt. A malformed or foreign receipt cannot
   // certify success; a new durable attempt must arrive through a normal GET.
   if(!response.ok||!validRecovery(recovered,progress.attempt)||recovered.desired!==value||recovered.version<=(control?.version||0)||recovered.epoch<=(control?.epoch||0))throw Error();
   if(latestControl.current&&olderRecovery(recovered,latestControl.current)){setNotice('已收到先前操作回执；当前状态以最新记录为准');return;}
   setControlState(previous=>({key:scopeKey,recovery:previous.key===scopeKey&&previous.recovery&&olderRecovery(recovered,previous.recovery)?previous.recovery:recovered}));
   setNotice(value==='cancelled'?'取消请求已保存，等待原操作实际结束；成果保留，尚未删除。':value==='paused'?'暂停请求已保存，等待原操作实际结束。':'继续请求已保存；将续接同一任务和已有成果。');
  }
  catch{if(applicable()){unknownControl.current={key:scopeKey,progress:latestProgress.current||progress,control:latestControl.current,failed_at:clientReadOrder(),rechecking:false,readback};setUnknownKey(scopeKey);setNotice('操作结果未确认，请先刷新核对；勿重复操作。');}}finally{intentBusy.current=false;if(applicable())setChanging(false);}
 }
 return <details className="word-stage-progress" onToggle={requestRead}>
  <summary><span className="word-stage-headline"><strong>{label}</strong>{current&&<span className="word-stage-current">{historical?'上次记录：':'当前步骤：'}{wordStageTitle(current.id)}</span>}</span>{current&&<span className="word-stage-summary-count">{displayedStepDetail(current,historical)}</span>}{presentation.reason&&<span className="word-stage-summary-reason">{presentation.reason}</span>}<span className="word-stage-help">{presentation.help}</span><span className="word-stage-time">{elapsedLabel} · {updated(progress.updated_at)}</span><span className="word-stage-expand">查看{draftStages.length?'八步':'六步'}详情</span></summary>
  {(stale?reason:presentation.reason)&&<p className="word-stage-notice" role="status">{stale?reason:presentation.reason}</p>}
  {unavailable&&!reading&&!networkOffline&&!readError&&onReadProgress&&<p className="word-stage-notice"><button type="button" onClick={requestReadProgress}>重读进度</button></p>}
  {progress.can_control_word&&!endedSettled&&!stale&&!progress.save.cloud_ready&&!progress.save.independently_confirmed&&progress.execution.state!=='saved'&&<p className="word-stage-notice"><button type="button" disabled={changing||stopPending||controlUnknown} onClick={()=>intent(control?.desired==='paused'||control?.desired==='cancelled'?'run':'paused')}>{changing?'正在保存…':stopPending?'等待停止确认':control?.desired==='paused'||control?.desired==='cancelled'?'重试并续接':'暂停'}</button> <button type="button" disabled={changing||stopPending||controlUnknown||control?.desired==='cancelled'} onClick={()=>intent('cancelled')}>取消处理</button></p>}
  {progress.target_kind==='article'&&!progress.save.independently_confirmed&&!progress.save.cloud_ready&&<div className="word-stage-notice"><p>{retainedWordAdvice(progress,stale)}</p><button type="button" disabled aria-describedby={`word-recovery-disabled-${safeRecordId(progress.target_id)}`}>{recoveryAction.title}</button><p id={`word-recovery-disabled-${safeRecordId(progress.target_id)}`}>{recoveryAction.reasons.join(' ')}</p>{onReadProgress&&!reading&&!networkOffline&&<button type="button" onClick={requestReadProgress}>重新读取进度</button>}</div>}
  {notice&&<p className="word-stage-notice" role="status">{notice}</p>}
  {controlUnknown&&progress.target_kind!=='article'&&onReadProgress&&!reading&&!networkOffline&&<button type="button" onClick={requestReadProgress}>重新读取进度</button>}
  <ol>{progress.steps.map((step,i)=><li key={step.id} data-state={Object.hasOwn(states,step.state)?step.state:'unknown'}><span className="word-stage-number">{i+1}</span><span className="word-stage-title">{wordStageTitle(step.id)}</span><span className="word-stage-state">{step.state==='current'?(historical?'上次记录 · ':'')+presentation.label:(Object.hasOwn(states,step.state)?states[step.state]:'待确认')}</span>{(wordStepDetail(step)||step.state==='unrecorded')&&<span className="word-stage-detail">{displayedStepDetail(step,historical)||'缺少可核验的历史记录'}</span>}</li>)}{draftStages.map((draft,i)=><li key={draft.platform} data-state={draft.state}><span className="word-stage-number">{progress.steps.length+i+1}</span><span className="word-stage-title">{draft.platform==='toutiao'?'头条':'知乎'}私人草稿</span><span className="word-stage-state">{draft.label}</span><span className="word-stage-detail">{draft.reason} {draft.help}</span></li>)}</ol>
  <details className="processing-details word-technical-details"><summary>技术记录</summary>
   <p className="processing-log">任务编号：{safeRecordId(progress.target_id)} · 进度版本：{recordedInteger(progress.version)??'暂无记录'}{attempt?` · 本次配图：${recordedInteger(attempt.generation)??'暂无记录'}`:''}</p>
   {control?.heartbeat_at&&<p className="word-stage-notice">执行者心跳 · {updated(control.heartbeat_at).replace('最后更新 ','')}</p>}
   {reason&&<p className="processing-log">{reason}</p>}
   {control&&Object.hasOwn(interruptionLabels,control.reason)&&<p className="processing-log">{interruptionLabels[control.reason]}</p>}
   {recoveryLabel&&<p className="processing-log">上次控制记录：{recoveryLabel}</p>}
  </details>
  {progress.target_kind==='local_word'&&<p className="word-stage-notice">{progress.save.independently_confirmed?'云端 Word 已就绪；桌面落盘请查看本地回执':'云端 Word 尚未完成读回确认'}</p>}
 </details>;
}
