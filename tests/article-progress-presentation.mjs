// Synthetic public fixtures rendered through the real presentation source.
// No production reads, platform operations, API writes, or visual-QA claim.
import assert from 'node:assert/strict';
import {syntheticDraftLinks,hiddenDiagnostic,diagnosticProbes,forbiddenDraftLinks} from './presentation-security-fixture.mjs';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadUiSource} from './ui-source-module.mjs';

const presentation=loadUiSource('components/publish-focus.ts');
const stages=loadUiSource('components/word-stage-progress.tsx');
const contract=loadUiSource('lib/word-progress-contract.ts');
const {platformProgress,wordProgressSummary,publishComplete,publishStatus,articleHandlingSummary,safeDiagnosticText,safeDraftLink,safeRecordId}=presentation;
const stamp='2026-10-10T02:00:01.000Z';
const source=JSON.parse(fs.readFileSync('evidence/word-progress/v1-partial-fixture.json','utf8'));
const fixture=()=>({...structuredClone(source),target_id:'synthetic-article',read_at:stamp,updated_at:stamp});
const render=(progress,article,flags={})=>renderToStaticMarkup(React.createElement(stages.default,{progress,article,...flags}));
const receipt={id:'synthetic-article',state:'completed',has_result:true,toutiao_verified_readback:true,draft_url:syntheticDraftLinks.toutiao,deliveries:[{platform:'zhihu',state:'saved',verified_readback:true,draft_url:syntheticDraftLinks.zhihu,updated:stamp}]};
const recovery={version:1,epoch:1,desired:'run',status:'running',reason:'none',heartbeat_at:stamp,heartbeat_overdue:false,retry_count:0,retry_after:null,execution_confirmed:true,automatic_dispatch_available:false};
const checks=[];
function check(name,fn){fn();checks.push(name);}

check('the real six backend stages stay unchanged; article presentation adds two separate platform stages',()=>{
 assert.deepEqual(Array.from(contract.wordStages),['read_source','collect_images','confirm_images','generate_word','inspect_pages','save_final']);
 const progress=fixture(),six=render(progress),eight=render(progress,receipt),local=render({...progress,target_kind:'local_word'},receipt);
 assert.equal((six.match(/<li /g)||[]).length,6);
 assert.equal((eight.match(/<li /g)||[]).length,8);
 assert.equal((local.match(/<li /g)||[]).length,6,'local Word jobs do not gain platform stages');
 assert.match(eight,/头条私人草稿/);assert.match(eight,/知乎私人草稿/);
 assert.deepEqual(progress.steps.map(step=>step.id),Array.from(contract.wordStages),'rendering must not mutate the real progress model');
 for(const html of [six,eight,local])assert.doesNotMatch(html,/<details[^>]*\sopen(?:[ =>])/,'both progress and technical details are closed by default');
 assert.doesNotMatch(eight,/\d+%|预计|即将完成/,'no invented time-based percentage or forecast');
});

check('actual stage and startup evidence determine plain running, queued, waiting, and unstarted status',()=>{
 for(const [id,label] of [['collect_images','正在找图片'],['confirm_images','正在选图片'],['generate_word','正在排版']]){
  const progress=fixture();progress.steps.forEach(step=>{step.state=step.id===id?'current':'pending';});progress.steps.find(step=>step.id===id).action='合成已记录动作';progress.recovery={...recovery};
  assert.equal(wordProgressSummary(progress).state,'running');assert.equal(wordProgressSummary(progress).label,label);
  assert.equal(publishStatus({id:'synthetic-article',state:'processing',word_progress:progress}),label);
 }
 const queued=fixture();queued.recovery={...recovery,status:'queued',execution_confirmed:false};assert.equal(wordProgressSummary(queued).state,'queued');assert.match(wordProgressSummary(queued).reason,/排队时间不计入配图耗时/);
 const waiting=fixture();waiting.execution.state='waiting';waiting.execution.reason='waiting_for_images';assert.equal(wordProgressSummary(waiting).state,'waiting');assert.match(wordProgressSummary(waiting).reason,/等待可用图片/);
 const fresh=fixture();fresh.started_at=null;fresh.steps=contract.emptyWordSteps();assert.equal(wordProgressSummary(fresh).state,'pending');assert.equal(wordProgressSummary(fresh).label,'尚未开始');
 const uploaded={...fresh,execution:{...fresh.execution,state:'waiting',reason:'legacy_no_observations',reason_text:'尚无实时执行记录'}};assert.equal(wordProgressSummary(uploaded).label,'尚未开始','the actual uploaded GET waiting projection with untouched stages has not started');assert.equal(publishStatus({id:'synthetic-article',state:'uploaded',word_progress:uploaded}),'尚未开始');
 const freshQueue={...uploaded,recovery:{...recovery,status:'queued',execution_confirmed:false}};assert.equal(wordProgressSummary(freshQueue).label,'排队中','a real queued control record takes priority over untouched stages');
 const unknownFresh={...fresh,execution:{...fresh.execution,state:'synthetic_unknown'}};assert.equal(wordProgressSummary(unknownFresh).state,'unknown','empty stages alone cannot certify an unknown executor has not started');
 const noStart=fixture();noStart.started_at=null;assert.notEqual(wordProgressSummary(noStart).state,'running','a current step without actual startup does not prove execution');
 assert.equal(publishStatus({id:'synthetic-article',state:'queued'}),'排队中');assert.equal(publishStatus({id:'synthetic-article',state:'processing'}),'进度待确认');
});

check('deferred or unavailable progress stays unconfirmed and a Word login issue is not assigned to a platform',()=>{
 for(const flag of ['word_progress_deferred','word_progress_unavailable'])for(const state of ['uploaded','queued','processing'])assert.equal(publishStatus({id:'synthetic-article',state,word_progress:null,[flag]:true}),'进度待确认','business state cannot overwrite an unread pause or control record');
 const login={id:'synthetic-article',state:'needs_login',has_result:false};assert.equal(platformProgress(login,'toutiao').label,'暂无状态记录','Word-side login requirement does not prove Toutiao upload started');
 assert.equal(publishStatus(login),'需要处理');
 const uploadLogin={...login,has_result:true};assert.equal(platformProgress(uploadLogin,'toutiao').label,'需要登录','existing platform evidence retains its actual login requirement');
});

check('Word readiness does not imply two-platform completion, and each platform retains its own receipt',()=>{
 const progress=fixture();progress.save={...progress.save,cloud_ready:true,independently_confirmed:true,state:'cloud_ready'};progress.execution.state='saved';progress.steps.forEach(step=>{step.state='completed';});
 const wordOnly={id:'synthetic-article',state:'word_ready',has_result:true,word_progress:progress,deliveries:[{platform:'zhihu',state:'not_started'}]};
 assert.equal(wordProgressSummary(progress).label,'Word 已就绪');assert.equal(publishComplete(wordOnly),false);assert.equal(publishStatus(wordOnly),'等待上传头条');
 const toutiaoOnly={...receipt,deliveries:[{...receipt.deliveries[0],state:'failed',verified_readback:false}]};
 assert.equal(platformProgress(toutiaoOnly,'toutiao').state,'completed');assert.equal(platformProgress(toutiaoOnly,'zhihu').state,'blocked');assert.equal(publishComplete(toutiaoOnly),false);assert.equal(publishStatus(toutiaoOnly),'需要处理');
 const zhihuOnly={...receipt,state:'failed',draft_url:null,toutiao_verified_readback:false,deliveries:[{platform:'toutiao',state:'failed',verified_readback:false},receipt.deliveries[0]]};
 assert.equal(platformProgress(zhihuOnly,'toutiao').state,'blocked');assert.equal(platformProgress(zhihuOnly,'zhihu').state,'completed');assert.equal(publishComplete(zhihuOnly),false);
 assert.equal(publishComplete(receipt),true);assert.equal(publishStatus(receipt),'两平台草稿已验收');
 assert.equal(platformProgress(receipt,'zhihu').updated,stamp,'the real platform update time is retained');
 const independent={...receipt,toutiao_verified_readback:false,draft_url:null,deliveries:[{platform:'toutiao',state:'saved',verified_readback:1,draft_url:syntheticDraftLinks.toutiao},receipt.deliveries[0]]};assert.equal(publishComplete(independent),true,'a distinct verified Toutiao delivery can carry its own outcome');
 const extra={...receipt,deliveries:[...receipt.deliveries,{platform:'other',state:'pending'}]};assert.equal(publishComplete(extra),false,'the existing completion boundary keeps extra platform work visible');assert.equal(publishStatus(extra),'两平台已验收，其他平台待处理');
 for(const platform of ['toutiao','zhihu']){
  const missing=structuredClone(receipt);if(platform==='toutiao')delete missing.toutiao_verified_readback;else delete missing.deliveries[0].verified_readback;
  assert.equal(publishComplete(missing),false);assert.equal(platformProgress(missing,platform).label,'等待验收确认','saved plus URL without independent verification is pending acceptance');
 }
 const text={id:'synthetic-text',state:'text_saved',has_result:false,deliveries:[]};assert.equal(publishComplete(text),true);assert.equal(publishStatus(text),'文字稿已保存');
});

check('pause, pending stop, blocked, expired, stale and unknown execution cannot pretend to keep running',()=>{
 const paused=fixture();paused.recovery={...recovery,desired:'paused',status:'paused'};assert.equal(wordProgressSummary(paused).state,'paused');assert.equal(wordProgressSummary(paused).label,'已暂停');
 const stopping=fixture();stopping.recovery={...recovery,desired:'paused',status:'waiting_safe_stop',safety_stop_pending:true};assert.equal(wordProgressSummary(stopping).label,'等待暂停完成');assert.notEqual(wordProgressSummary(stopping).state,'paused');
 const blocked=fixture();blocked.execution={...blocked.execution,state:'failed',reason:'http_403'};assert.equal(wordProgressSummary(blocked).state,'blocked');assert.match(wordProgressSummary(blocked).reason,/图片暂时无法访问/);
 for(const reason of ['execution','control','desired','overdue','heartbeat','unconfirmed','stale']){
  const progress=fixture();let options={};
  if(reason==='execution')progress.execution.state='synthetic_unknown';
  if(reason==='control')progress.recovery={...recovery,status:'synthetic_unknown'};
  if(reason==='desired')progress.recovery={...recovery,desired:'synthetic_unknown'};
  if(reason==='overdue')progress.execution.update_overdue=true;
  if(reason==='heartbeat')progress.recovery={...recovery,heartbeat_overdue:true};
  if(reason==='unconfirmed')progress.recovery={...recovery,execution_confirmed:false};
  if(reason==='stale')options={stale:true};
  assert.equal(wordProgressSummary(progress,options).state,'unknown',reason+' must remain unknown');assert.doesNotMatch(wordProgressSummary(progress,options).label,/正在|已完成/);
 }
 for(const flags of [{unavailable:true},{networkOffline:true},{readError:true},{deferred:true}]){
  const html=render(fixture(),receipt,flags);assert.match(html,/上次记录：确定配图/);assert.match(html,/已确定 18\/22 张/);assert.doesNotMatch(html,/<strong>正在/,'unconfirmed execution uses a historical summary');
 }
});

check('invalid timestamps never invent execution or elapsed time, and actual elapsed segments exclude queue time',()=>{
 const invalid=fixture();invalid.started_at='not-a-date';invalid.updated_at='not-a-date';assert.notEqual(wordProgressSummary(invalid).state,'running');assert.match(render(invalid),/最后更新暂无记录/);
 const attempt={attempt_id:'synthetic-attempt',generation:1,state:'running',started_at:stamp,active_elapsed_ms:120000,active_started_at:'2026-10-10T01:58:01.000Z',read_at:stamp,timeout_ms:3600000,timeout_due:false,stop_requested_at:null,reason:'none',restarts_used:0,max_restarts:2};
 assert.equal(stages.wordAttemptDuration(attempt,Date.parse(stamp)),'本次配图已用 4分0秒');
 assert.equal(stages.wordAttemptDuration({...attempt,active_started_at:'not-a-date'},Date.parse(stamp)),'配图耗时暂无记录');
 assert.equal(stages.wordAttemptDuration({...attempt,started_at:null,state:'queued'},Date.parse(stamp)),'配图尚未开始，排队不计时');
 assert.equal(stages.wordAttemptDuration({...attempt,active_started_at:null,read_at:'not-a-date'},Date.parse(stamp),true),'配图耗时暂无记录');
});

check('sensitive diagnostics and draft links remain hidden even inside folded details',()=>{
 for(const probe of diagnosticProbes){
  assert.equal(safeDiagnosticText(probe),hiddenDiagnostic,'every nonempty raw diagnostic receives the same closed display');
  const progress=fixture();progress.execution.reason_text=probe;progress.steps[2].action=probe;progress.steps[2].label=probe;progress.steps[2].counts=null;
  const html=render(progress);assert.ok(!html.includes(probe),'the entire real Word DOM hides the raw probe');assert.doesNotMatch(html,/synthetic-secret|unrecognized public diagnostic prose/);assert.match(html,/确定配图/,'step title comes from its canonical stage ID');
 }
 for(const empty of ['',null,undefined])assert.equal(safeDiagnosticText(empty),'');
 for(const url of forbiddenDraftLinks)assert.equal(safeDraftLink(url),null,url);
 assert.equal(safeDraftLink(syntheticDraftLinks.toutiao,'toutiao'),syntheticDraftLinks.toutiao);
 assert.equal(safeDraftLink(syntheticDraftLinks.zhihu,'zhihu'),syntheticDraftLinks.zhihu);
 assert.equal(safeDraftLink(syntheticDraftLinks.toutiao,'zhihu'),null,'a Toutiao URL cannot establish a Zhihu outcome');
 assert.equal(safeDraftLink(syntheticDraftLinks.zhihu,'toutiao'),null,'a Zhihu URL cannot establish a Toutiao outcome');
 for(const platform of ['',null,'unknown','__proto__'])for(const url of Object.values(syntheticDraftLinks))assert.equal(safeDraftLink(url,platform),null,'only an omitted platform may infer the official URL type');
 for(const url of Object.values(syntheticDraftLinks))assert.equal(safeDraftLink(url),url,'omitting the platform retains official URL inference');
 const dangerous={...receipt,draft_url:syntheticDraftLinks.toutiao+'&session=synthetic-secret'};assert.equal(platformProgress(dangerous,'toutiao').url,null);assert.equal(publishComplete(dangerous),false);
 const wrongPlatform={...receipt,deliveries:[{...receipt.deliveries[0],draft_url:syntheticDraftLinks.toutiao}]};assert.equal(platformProgress(wrongPlatform,'zhihu').url,null);assert.equal(publishComplete(wrongPlatform),false);
});

check('record identifiers and numeric fields cannot disclose raw diagnostics',()=>{
 const canonical='00000000-0000-4000-8000-000000000001';assert.equal(safeRecordId(canonical),canonical);assert.equal(safeRecordId('localword_'+canonical),'localword_'+canonical);
 for(const value of [canonical+'\n',canonical+'\r\n','localword_'+canonical+'\n'])assert.equal(safeRecordId(value),'编号未展示','record IDs must match the complete canonical string');
 for(const value of ['',null,undefined,'synthetic-secret','session=synthetic-secret','%','00000000-0000-4000-8000-000000000001?jwt=synthetic-secret'])assert.equal(safeRecordId(value),'编号未展示');
 for(const value of ['session=synthetic-secret',Infinity,NaN,1.5]){
  const progress=fixture();progress.target_id='session=synthetic-secret';progress.version=value;progress.steps[2].counts={completed:value,total:value,unit:'images'};
  const html=render(progress);assert.doesNotMatch(html,/synthetic-secret|NaN|Infinity|1\.5/,'only finite integer record fields enter Word DOM');assert.match(html,/编号未展示/);
 }
 const unknown=fixture();unknown.steps[2].id='session=synthetic-secret';unknown.steps[2].label='jwt=synthetic-secret';unknown.steps[2].action='access_key=synthetic-secret';unknown.steps[2].state='credential=synthetic-secret';unknown.steps[2].counts=null;assert.doesNotMatch(render(unknown),/synthetic-secret/,'unknown stage and state stay inside a closed display');
});

check('prototype names are unknown enum values and cannot escape the closed stage or reason maps',()=>{
 for(const value of ['__proto__','constructor','toString']){
  const progress=fixture();progress.steps[2].id=value;progress.steps[2].state=value;progress.steps[2].label=value;progress.steps[2].action=value;progress.steps[2].counts=null;
  assert.doesNotThrow(()=>render(progress),'an inherited property name is never a React child or callable action');assert.equal(wordProgressSummary(progress).state,'unknown');
  const current=fixture();current.steps[2].id=value;assert.equal(wordProgressSummary(current).state,'unknown','a current stage still needs its own canonical action identity');
  const blocked=fixture();blocked.execution.state='failed';blocked.execution.reason=value;assert.equal(typeof wordProgressSummary(blocked).reason,'string');assert.doesNotThrow(()=>render(blocked));
  const state=fixture();state.execution.state=value;assert.equal(wordProgressSummary(state).state,'unknown');assert.equal(publishStatus({id:'synthetic-article',state:value}),'进度待确认');
  assert.equal(articleHandlingSummary({id:'synthetic-article',state:value}),null);
 }
});

check('native legacy action text without counts never becomes an invented current or historical action',()=>{
 for(const state of ['pending','unrecorded','current','completed'])assert.equal(stages.wordStepDetail({id:'generate_word',label:'生成 Word',state,action:'已申报 Word 字节与上传身份',counts:null,evidence:'site_record'}),'','native action prose does not constitute progress detail');
 const progress=fixture();progress.legacy=true;progress.started_at=null;progress.execution.state='recovering';progress.steps.forEach(step=>{step.state='unrecorded';step.action='已申报 Word 字节与上传身份';step.counts=null;});progress.steps[4].state='current';progress.steps[4].action='Word 输出已更正，等待检查当前文件';
 const html=render(progress);assert.match(html,/等待恢复确认/);assert.match(html,/上次记录：逐页检查/);assert.doesNotMatch(html,/已申报 Word 字节与上传身份|Word 输出已更正|上次动作|正在排版|正在检查页面/,'the real rendered legacy record retains known stage identity without inventing activity');
 progress.steps[4].state='unrecorded';progress.steps[5].state='current';progress.steps[5].action='正在保存本站 Word 分块';progress.steps[5].counts={completed:1,total:2,unit:'chunks'};const counts=render(progress);assert.match(counts,/已保存 1\/2 块/);assert.doesNotMatch(counts,/正在保存本站 Word 分块/,'real native counts remain available independently of raw action prose');
});

check('blocked summaries state exactly who should act and do not claim that an unknown executor is running',()=>{
 const login=articleHandlingSummary({id:'synthetic-article',state:'needs_login'});assert.ok(login);assert.match(login.help,/请完成本人登录/);
 for(const state of ['needs_verification','failed']){const summary=articleHandlingSummary({id:'synthetic-article',state});assert.ok(summary);assert.match(summary.help,/请让小鱼核对/);assert.equal(summary.state,state==='needs_verification'?'unknown':'blocked');assert.doesNotMatch(summary.help,/无需处理/);}
 assert.equal(articleHandlingSummary({id:'synthetic-article',state:'uploaded'}),null);
 const platformLogin=platformProgress({...receipt,deliveries:[{...receipt.deliveries[0],state:'needs_login'}]},'zhihu');assert.match(platformLogin.help,/请完成(?:本人|平台)登录/);
 const stopped=fixture();stopped.recovery={...recovery,desired:'paused',status:'waiting_safe_stop',safety_stop_pending:true};assert.match(wordProgressSummary(stopped).reason,/尚未确认/);assert.match(wordProgressSummary(stopped).help,/等待|等待读回/);assert.notEqual(wordProgressSummary(stopped).state,'paused');
 const unknown=wordProgressSummary(null);assert.equal(unknown.state,'unknown');assert.doesNotMatch(unknown.help,/正在|已开始|仍在|正常运行/);
});

check('refresh/reopen uses the same stored progress and safe merge retains verified observations',()=>{
 const retained=fixture(),restored=JSON.parse(JSON.stringify(retained));assert.equal(render(restored,receipt),render(retained,receipt),'remount renders the same persisted server observation');
 const late=fixture();late.version=retained.version-1;late.steps[2].counts.completed=1;assert.equal(stages.mergeWordProgress(retained,late),retained,'late lower-version response cannot erase confirmed counts');
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const focus=presentation.reconcilePublishFocus({seen:[],current:{}},[{...receipt,state:'word_ready'}]);focus.current['synthetic-article'].open=false;presentation.savePublishFocus(storage,focus);
 const reopen=presentation.reconcilePublishFocus(presentation.readPublishFocus(storage),[{...receipt,state:'word_ready'}]);assert.equal(reopen.current['synthetic-article'].open,false,'manual folding survives a refresh of incomplete work');
});

console.log(`PASS article progress presentation: ${checks.length} synthetic groups — real six stages / eight article stages, independent verified platform outcomes, Word-only incomplete, plain states, unknown/stale safeguards, valid clocks, credential guards, closed details and stored progress restoration. Download and original Home actions are covered by publish-ui.mjs; actual narrow-screen layout needs browser QA.`);
