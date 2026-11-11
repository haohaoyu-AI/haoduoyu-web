import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openAiRunDay, openAiDiaryLink, openAiRunsForDate, readOpenAiRuns, openAiSessionAvailable,
  openAiDraft, editOpenAiDraft, saveOpenAiDraft} from '../web/core/openai-review-state.mjs';
import {createOpenAiRunner} from '../web/core/openai-review-runner.mjs';
import {openAiReviewTimeout} from '../web/openai-review-controller.mjs';
import {runReviewProvider} from '../src/openai-review-provider.mjs';
import {REVIEW_LIMITS} from '../src/openai-review-data.mjs';
import {renderOpenAiRun, renderOpenAiSettings, renderOpenAiReviewPanel, openAiRunModeLabel} from '../web/pages/openai-review.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {state} from '../web/core/state.mjs';
import {apiNetwork} from '../web/core/api.mjs';
import {paintOpenAiDiary} from '../web/pages/ai-reports.mjs';
import {readRoute, updateRoute} from '../web/core/router.mjs';
const saved = {account:'V字',version:1,instructions:'完整指令',configured:true,model:'fixture-model'};
const completed = {id:'run-1',status:'succeeded',created_at:'2026-11-07T17:00:00Z',report_markdown:'# 结果\n- 有效',model:'fixture-model'};
function memory() {
  const map = new Map();
  return {getItem:key=>map.get(key) || null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};
}
function fixture(request, storage = memory(), key = 'owner:V字') {
  const changes = [];
  const runner = createOpenAiRunner({request,storage,key,uuid:()=>completed.id,onChange:value=>changes.push(value)});
  return {runner,storage,changes,key};
}

test('OpenAI diary uses actual Beijing run date and keeps all same-day runs in stable order', async () => {
  const rows=[completed,{...completed,id:'run-2',created_at:'2026-11-08T01:00:00Z'},
    {...completed,id:'prior',created_at:'2026-11-07T15:59:59Z'}];
  assert.equal(openAiRunDay(rows[0]),'2026-11-08');
  assert.equal(openAiRunDay(rows[2]),'2026-11-07');
  assert.deepEqual(openAiRunsForDate(rows,'2026-11-08').map(x=>x.id),['run-2','run-1']);
  assert.equal(rows[0].id,'run-1');
  const paths=[];
  const result=await readOpenAiRuns(async path=>{
    paths.push(path);return paths.length===1 ? {items:[rows[0]],has_more:true} : {items:[rows[1]],has_more:false};
  },'2026-11-08');
  assert.equal(result.length,2);
  assert.deepEqual(paths,['/openai-review/runs?offset=0&date=2026-11-08','/openai-review/runs?offset=1&date=2026-11-08']);
  assert.match(openAiDiaryLink(completed),/diagnosis_tab=reports&date=2026-11-08&openai_run=run-1/);
});

test('diary invalid pagination and stale reads never present incomplete success', async () => {
  await assert.rejects(readOpenAiRuns(async()=>({items:[],has_more:true})),/不完整/);
  await assert.rejects(readOpenAiRuns(async()=>({items:[completed],has_more:true})),/发生变化/);
  assert.equal(await readOpenAiRuns(async()=>({items:[completed],has_more:false}),'',()=>false),null);
});

test('diary Markdown and metadata escape script, URL, attribute and internal-field payloads',()=>{
  const html=renderOpenAiRun({...completed,model:'<script>model</script>',id:'" onclick="bad',
    pending_verification:'PRIVATE-CANARY',summary:'PRIVATE-SUMMARY',
    report_markdown:'# 标题\n<script>x</script>\n[bad](javascript:alert(1))\n**重点**'});
  assert.match(html,/<h3>标题<\/h3>/);assert.match(html,/<strong>重点<\/strong>/);
  assert.doesNotMatch(html,/<script|href="javascript:|" onclick="|PRIVATE-CANARY|PRIVATE-SUMMARY/);
  assert.match(html,/2026\/11\/08 01:00:00（北京时间）/);
});

test('public-business and signed-in sessions use OpenAI while absent and nonconfigured sessions remain gated',()=>{
  assert.equal(openAiSessionAvailable({id:'public-business',publicBusiness:true}),true);
  assert.equal(openAiSessionAvailable({publicBusiness:true}),false);
  assert.equal(openAiSessionAvailable(null),false);
  assert.equal(openAiSessionAvailable({id:'owner',publicBusiness:false}),true);
  for(const html of [renderOpenAiReviewPanel({owner:false}),renderOpenAiSettings({owner:false})]) {
    assert.match(html,/>登录<\/a>/);assert.doesNotMatch(html,/<textarea|data-openai-action="(?:start|full)"/);
  }
  const html=renderOpenAiReviewPanel({owner:true,config:{...saved,configured:false}});
  assert.match(html,/尚未配置/);assert.match(html,/data-openai-action="start"\s+disabled/);
  assert.doesNotMatch(html,/已连接|已连通|api[_-]?key.*input/i);
});

test('content review no longer contains a duplicate API entry',()=>{
  const vm={account:'V字',filters:{},secondary:'articles'},data=normalizeReviewData({articles:[{id:'article',account:'V字',title:'示例'}]});
  const html=renderContentReviewContent(data,vm);
  assert.doesNotMatch(html,/id="openai-review-panel"/);
  assert.match(html,/data-review-articles-expanded="false"/);
  assert.doesNotMatch(renderContentReviewContent(data,{...vm,account:'其他'}),/id="openai-review-panel"/);
});

test('rapid clicks produce one POST and persist identity before submitting',async()=>{
  let resolve, calls=0;
  const storage=memory();
  const {runner,key}=fixture(async(path,options)=>{
    calls++;assert.equal(path,'/openai-review/runs');
    assert.equal(storage.getItem(key),options.body.run_id);
    return new Promise(done=>{resolve=done;});
  },storage);
  const first=runner.start();await runner.start();await runner.start('full');
  assert.equal(calls,1);assert.equal(runner.state.busy,true);
  resolve(completed);await first;
  assert.equal(runner.state.busy,false);assert.equal(runner.state.pendingId,'');assert.equal(storage.getItem(key),null);
});

test('network uncertainty, reload and 404 perform GET-only recovery without another paid call',async()=>{
  const storage=memory(),calls=[];
  const first=fixture(async(path,options)=>{
    calls.push([path,options?.method || 'GET']);throw new Error('network');
  },storage);
  await first.runner.start();assert.equal(first.runner.state.pendingId,completed.id);
  first.runner.dispose();
  const resumed=fixture(async(path,options)=>{
    calls.push([path,options?.method || 'GET']);throw Object.assign(new Error('not found'),{status:404});
  },storage);
  await resumed.runner.start();await resumed.runner.recover();await resumed.runner.start();
  assert.deepEqual(calls.map(x=>x[1]),['POST','GET']);
  assert.equal(resumed.runner.state.pendingId,completed.id);
  assert.match(resumed.runner.state.error,/不会自动重复提交/);
});

test('successful status reconciliation releases only the matching local request',async()=>{
  const storage=memory();storage.setItem('owner:V字',completed.id);
  const {runner}=fixture(async()=>completed,storage);
  await runner.recover();assert.equal(runner.state.run.id,completed.id);assert.equal(runner.state.pendingId,'');
  storage.setItem('other:V字','other-run');
  assert.equal(storage.getItem('other:V字'),'other-run');
});

test('foreign-tab active request blocks another POST, backend in-flight IDs are recovered separately',async()=>{
  const storage=memory();let calls=0;
  const {runner,key}=fixture(async()=>{calls++;throw Object.assign(new Error('active'),{code:'OPENAI_REVIEW_IN_FLIGHT',run_id:'existing'});},storage);
  storage.setItem(key,'other-tab');await runner.start();assert.equal(calls,0);assert.equal(runner.state.pendingId,'other-tab');
  const second=fixture(async()=>{throw Object.assign(new Error('active'),{code:'OPENAI_REVIEW_IN_FLIGHT',run_id:'existing'});});
  await second.runner.start();assert.equal(second.runner.state.pendingId,'existing');
});

test('storage failure prevents API calls, dispose prevents later events exposing prior-user results',async()=>{
  let calls=0;
  const broken={getItem:()=>null,setItem:()=>{throw new Error('storage blocked');},removeItem:()=>{}};
  const first=fixture(async()=>{calls++;},broken);await first.runner.start();assert.equal(calls,0);
  let resolve;
  const second=fixture(()=>new Promise(done=>{resolve=done;}));
  const pending=second.runner.start();second.runner.dispose();const count=second.changes.length;
  resolve(completed);await pending;assert.equal(second.changes.length,count);
});

test('explicit preflight rejection unlocks; unknown rejection remains guarded',async()=>{
  for(const code of ['OPENAI_REVIEW_NOT_CONFIGURED','OPENAI_REVIEW_INVALID_KEY_FORMAT','OPENAI_REVIEW_NO_DATA','OPENAI_REVIEW_INPUT_LIMIT','OPENAI_REVIEW_RATE_LIMIT']) {
    const {runner}=fixture(async()=>{throw Object.assign(new Error(code),{code});});
    await runner.start();assert.equal(runner.state.pendingId,'');assert.equal(runner.state.error,code);
  }
  const {runner}=fixture(async()=>{throw Object.assign(new Error('unexpected'),{status:500});});
  await runner.start();assert.equal(runner.state.pendingId,completed.id);
});

test('uncertain release never restarts analysis and uses its explicit acknowledgement',async()=>{
  const calls=[];
  const {runner}=fixture(async(path,options)=>{
    calls.push([path,options]);return {...completed,status:'uncertain',released_at:'2026-11-08T01:30:00Z'};
  });
  runner.adopt({...completed,status:'uncertain'});
  await runner.start();assert.equal(calls.length,0);
  await runner.release();assert.equal(calls.length,1);
  assert.equal(calls[0][0],'/openai-review/runs/run-1/release');
  assert.equal(calls[0][1].body.acknowledgement,'provider_outcome_unknown_no_automatic_retry');
  assert.equal(runner.state.pendingId,'');assert.equal(runner.state.run.status,'uncertain');
});

test('editable instructions save exact text and version, then advance only from confirmed server response',async()=>{
  const draft=editOpenAiDraft(openAiDraft(saved),'新指令\n完整内容');let sent;
  const result=await saveOpenAiDraft(draft,async(path,options)=>{
    sent={path,...options};return {...saved,version:2,instructions:options.body.instructions};
  });
  assert.deepEqual(sent,{path:'/openai-review/config',method:'PATCH',body:{instructions:draft.text,version:1}});
  assert.equal(result.dirty,false);assert.equal(result.saved.version,2);assert.equal(result.text,draft.text);
});

test('save error and version conflict keep draft; reload retains original edit version until explicit comparison',async()=>{
  const draft=editOpenAiDraft(openAiDraft(saved),'本机修改');
  for(const status of [409,500]) {
    const result=await saveOpenAiDraft(draft,async()=>{throw Object.assign(new Error('failure'),{status});});
    assert.equal(result.text,'本机修改');assert.equal(result.dirty,true);assert.equal(result.conflict,status===409);
    assert.equal(result.saved.version,1);
  }
  const loaded=openAiDraft({...saved,version:2,instructions:'其他修改'},{text:'本机修改',version:1});
  assert.equal(loaded.conflict,true);assert.equal(loaded.baseVersion,1);
  const edited=editOpenAiDraft(loaded,'再次修改');assert.equal(edited.baseVersion,1);
  let calls=0;await saveOpenAiDraft(edited,async()=>{calls++;});assert.equal(calls,0);
  const html=renderOpenAiSettings({owner:true,draft:loaded});
  assert.match(html,/版本已变化/);assert.match(html,/>本机修改<\/textarea>/);
});

test('AI module and date deep links survive router normalization and browser navigation',()=>{
  const previous={location:globalThis.location,history:globalThis.history,window:globalThis.window,localStorage:globalThis.localStorage};
  globalThis.location=new URL('https://example.test/?page=ai-reports&ai_tab=openai&date=2026-11-08&openai_run=run-1');
  globalThis.history={replaceState(_state,_title,url){globalThis.location=new URL(url);}};
  globalThis.window={matchMedia:()=>({matches:false})};globalThis.localStorage=memory();
  try {
    readRoute();updateRoute();assert.equal(state.page,'ai-diagnosis');assert.equal(state.diagnosisTab,'reports');assert.equal(state.aiDailyDate,'2026-11-08');
    assert.equal(location.searchParams.get('diagnosis_tab'),'reports');assert.equal(location.searchParams.get('date'),'2026-11-08');
    assert.equal(location.searchParams.get('openai_run'),'run-1');
    state.aiDailyDate='2026-10-01';updateRoute();assert.equal(location.searchParams.get('diagnosis_tab'),'reports');
    state.page='review';updateRoute();assert.equal(location.searchParams.has('ai_tab'),false);
  } finally { Object.assign(globalThis,previous); }
});

test('OpenAI operations bypass offline transport and do not alter global public-business permissions',async()=>{
  const files=await Promise.all(['web/openai-review-controller.mjs','web/openai-settings-controller.mjs'].map(path=>readFile(path,'utf8')));
  for(const source of files) {assert.match(source,/apiNetwork/);assert.match(source,/suppressAuthRedirect: true/);assert.doesNotMatch(source,/outbox|offlineRequest/);}
  const controller=await readFile('web/controller.mjs','utf8');
  assert.match(controller,/state\.me\?\.publicBusiness \? \{todo: settingsTabs.todo, openai: settingsTabs.openai\}/);
});

test('unregistered UUID remains blocked across repeated404 until explicit server cancellation receipt',async()=>{
  const storage=memory(),calls=[];storage.setItem('owner:V字',completed.id);
  const {runner}=fixture(async(path,options)=>{
    calls.push({path,method:options?.method||'GET'});
    if(!options?.method)throw Object.assign(new Error('not found'),{status:404});
    assert.equal(path,'/openai-review/runs/run-1/release');
    return {...completed,status:'failed',released_at:'2026-11-08T01:30:00Z',report_markdown:''};
  },storage);
  await runner.recover();await runner.recover();await runner.start();
  assert.equal(runner.state.notFound,true);assert.equal(runner.state.pendingId,completed.id);
  assert.deepEqual(calls.map(x=>x.method),['GET','GET']);
  assert.match(renderOpenAiReviewPanel({owner:true,config:saved,...runner.state}),/data-openai-action="release"/);
  await runner.release();assert.equal(runner.state.pendingId,'');assert.equal(runner.state.notFound,false);
  assert.deepEqual(calls.map(x=>x.path),['/openai-review/runs/run-1','/openai-review/runs/run-1','/openai-review/runs/run-1/release']);
});


test('first full analysis and later full rechecks use the persisted baseline fact, not a fictional mode',()=>{
  assert.equal(openAiRunModeLabel({mode:'full',baseline_run_id:null}),'首次全量分析');
  assert.equal(openAiRunModeLabel({mode:'full',baseline_run_id:'previous-success'}),'全量重查');
  assert.equal(openAiRunModeLabel({mode:'incremental',baseline_run_id:'previous-success'}),'累计复盘');
  assert.equal(openAiRunModeLabel({mode:'full'}),'全量分析');
  assert.equal(openAiRunModeLabel({}),'文章复盘');
  const first=renderOpenAiRun({...completed,mode:'full',baseline_run_id:null});
  assert.match(first,/首次全量分析/);assert.doesNotMatch(first,/全量重查/);
  assert.match(renderOpenAiRun({...completed,mode:'full',baseline_run_id:'previous-success'}),/全量重查/);
});


test('prior successful record is explicitly historical while the current request remains unresolved',()=>{
  const html=renderOpenAiReviewPanel({owner:true,config:saved,run:completed,pendingId:'new-request',
    error:'请求结果尚未确认，请核查状态。不会自动重复提交。'});
  assert.match(html,/最近记录：分析完成/);
  assert.match(html,/请求结果尚未确认/);
  assert.match(html,/在诊断报告查看这条记录/);
  assert.match(html,/data-openai-action="start"\s+disabled/);
});

test('uncertain diary records explain billing uncertainty, retain escaped server text and link to recovery',()=>{
  const html=renderOpenAiRun({...completed,status:'uncertain',report_markdown:'',
    error_message:'API 执行结果尚未确认，可能已经计费；不会自动重试 <script>bad</script>'});
  assert.match(html,/结果待确认/);assert.match(html,/可能已经计费/);assert.match(html,/不会自动重试/);
  assert.match(html,/&lt;script&gt;bad&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>/);
  assert.match(html,/href="\?page=ai-diagnosis&amp;diagnosis_tab=help">前往求助API核查状态/);
  const missing=renderOpenAiRun({...completed,status:'uncertain',report_markdown:''});
  assert.match(missing,/API 执行结果尚未确认，可能已经计费；不会自动重试。/);
  assert.doesNotMatch(renderOpenAiRun(completed),/可能已经计费|前往求助API核查状态/);
});


test('paid analysis timeout allows all actual provider deadlines plus save overhead without extending reads or release',async t=>{
  const deadlines=[],schedule=globalThis.setTimeout;
  t.mock.method(globalThis,'setTimeout',(callback,delay,...args)=>{deadlines.push(delay);return schedule(callback,delay,...args);});
  await runReviewProvider({key:'synthetic-timeout-check',model:'gpt-test',instructions:'synthetic',input:{},beforeCall:async()=>{},lookup:async()=>{},
    request:async()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({report_markdown:'synthetic',cumulative_summary:'synthetic',pending_verification:[]})}]}]})});
  assert.deepEqual(deadlines,[180000],'the real default provider timer must match the client budget');
  const clientTimeout=openAiReviewTimeout('/openai-review/runs',{method:'POST'});
  assert.equal(clientTimeout,780000);assert.equal(REVIEW_LIMITS.providerCalls,4);
  assert.ok(clientTimeout >= REVIEW_LIMITS.providerCalls*deadlines[0]+60000);
  for(const [path,options] of [
    ['/openai-review/runs',{}],['/openai-review/runs',{method:'GET'}],['/openai-review/runs?offset=0',{}],
    ['/openai-review/runs/run-1',{}],['/openai-review/config',{}],['/openai-review/config',{method:'PATCH'}],
    ['/openai-review/runs/run-1/release',{method:'POST'}]
  ]) assert.equal(openAiReviewTimeout(path,options),75000);
});


test('public review offers 求助API without settings links and preserves the independent editable instructions',()=>{
  const owner=openAiSessionAvailable({id:'public-business',publicBusiness:true});
  for(const busy of [false,true]) {
    const html=renderOpenAiReviewPanel({owner,config:saved,busy});
    assert.match(html,/data-openai-action="start"[\s\S]*?>求助API<\/button>/);
    assert.doesNotMatch(html,/管理员|分析指令与设置|page=settings|一键 OpenAI 分析/);
    assert.doesNotMatch(html,/data-openai-action="full"|更多分析选项/);
    assert.match(html,/id="openai-model"/);
  }
  const settings=renderOpenAiSettings({owner,draft:openAiDraft(saved)});
  assert.match(settings,/<textarea[^>]*id="openai-instructions"[\s\S]*?>完整指令<\/textarea>/);
  assert.match(settings,/保存指令/);assert.doesNotMatch(settings,/仅管理员|管理员登录|page=login/);
});

test('public diary still renders only the safe report view and does not request login',()=>{
  const previous=globalThis.document,nodes=new Map();
  globalThis.document={querySelector:()=>({querySelector(selector){
    if(!nodes.has(selector))nodes.set(selector,{});return nodes.get(selector);
  }})};
  try {
    paintOpenAiDiary([{...completed,pending_verification:'INTERNAL',report_markdown:'<script>bad</script>'}],
      {owner:openAiSessionAvailable({id:'public-business',publicBusiness:true})});
    const html=nodes.get('#openai-diary-list').innerHTML;
    assert.match(html,/&lt;script&gt;bad&lt;\/script&gt;/);
    assert.doesNotMatch(html,/<script>|INTERNAL|page=login|管理员/);
  } finally {globalThis.document=previous;}
});

test('public OpenAI writes use the existing same-origin header; private sessions retain CSRF and genuine auth errors',async()=>{
  const previous={fetch:globalThis.fetch,me:state.me},calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({data:saved}),{status:200});};
  try {
    state.me={id:'public-business',publicBusiness:true};
    for(const [path,method,body] of [
      ['/openai-review/config','GET',undefined],['/openai-review/config','PATCH',{instructions:'new',version:1}],
      ['/openai-review/runs','POST',{run_id:'synthetic',mode:'incremental'}],
      ['/openai-review/runs/synthetic/release','POST',{acknowledgement:'provider_outcome_unknown_no_automatic_retry'}]
    ]) {
      await apiNetwork(path,{method,body,suppressAuthRedirect:true});
      const {options}=calls.at(-1);
      assert.equal(options.credentials,'same-origin');
      assert.equal(options.headers['X-Public-Business'],method==='GET'?undefined:'1');
      assert.equal(options.headers['X-CSRF-Token'],undefined);assert.equal(options.headers.Authorization,undefined);
    }
    state.me={id:'signed-in',csrfToken:'synthetic-csrf'};
    await apiNetwork('/openai-review/config',{method:'PATCH',body:{instructions:'private',version:1},suppressAuthRedirect:true});
    assert.equal(calls.at(-1).options.headers['X-CSRF-Token'],'synthetic-csrf');
    assert.equal(calls.at(-1).options.headers['X-Public-Business'],undefined);
    for(const status of [401,403]) {
      let attempts=0;
      globalThis.fetch=async()=>{attempts++;return new Response(JSON.stringify({error:{code:'FORBIDDEN',message:'真实权限错误'}}),{status});};
      await assert.rejects(apiNetwork('/openai-review/config',{suppressAuthRedirect:true}),error=>error.status===status&&error.message==='真实权限错误');
      assert.equal(attempts,1);assert.equal(state.me.publicBusiness,undefined);
    }
  } finally {globalThis.fetch=previous.fetch;state.me=previous.me;}
});

test('public recovery throttling keeps its request and permits only GET checks until explicit retry',async()=>{
  const calls=[],{runner}=fixture(async(path,options)=>{
    calls.push({path,method:options?.method||'GET'});
    if(options?.method==='POST')throw Object.assign(new Error('取消请求过多'),{status:429,code:'OPENAI_REVIEW_RECOVERY_RATE_LIMIT'});
    throw Object.assign(new Error('not found'),{status:404});
  });
  runner.adopt({...completed,status:'uncertain'});
  await runner.release();assert.equal(runner.state.pendingId,completed.id);
  assert.match(runner.state.error,/取消请求过多.*稍后只读核查状态/);
  await runner.start();assert.equal(calls.length,1);
  await runner.recover();assert.deepEqual(calls.map(x=>x.method),['POST','GET']);
  const running=fixture(async()=>{assert.fail('normal running release must not send a request');}).runner;
  running.adopt({...completed,status:'running'});await running.release();
  assert.doesNotMatch(renderOpenAiReviewPanel({owner:true,config:saved,...running.state}),/data-openai-action="release"/);
});

test('model selection is sent once with persisted request ID; GET observations never repeat POST',async()=>{
  let completePost; const calls=[];
  const {runner}=fixture(async(path,options)=>{
    calls.push({path,options});
    if(options?.method === 'POST') return new Promise(resolve=>{completePost=resolve;});
    return {...completed,status:'running',stage:'awaiting_provider',provider_calls:1,report_markdown:''};
  });
  const pending=runner.start('incremental','gpt-6.1-sol');
  await runner.observe(); await runner.start('incremental','gpt-6-astra');
  assert.equal(calls.filter(x=>x.options?.method==='POST').length,1);
  assert.equal(calls[0].options.body.model,'gpt-6.1-sol');
  assert.equal(runner.state.run.stage,'awaiting_provider');
  completePost(completed); await pending;
  assert.equal(runner.state.pendingId,'');
});

test('a released uncertain history cannot suppress GET observation of a new run',async()=>{
  const {openAiPendingRunUncertain}=await import('../web/core/openai-review-state.mjs');
  let finishPost;const calls=[];
  const {runner}=fixture(async(path,options)=>{
    calls.push({path,method:options?.method||'GET'});
    if(options?.method==='POST')return new Promise(resolve=>{finishPost=resolve;});
    return {...completed,status:'running',stage:'awaiting_provider',provider_calls:1};
  });
  runner.adopt({...completed,id:'previous-run',status:'uncertain',released_at:'2026-11-08T03:22:56.555Z'});
  const pending=runner.start();
  assert.equal(runner.state.run.id,'previous-run');
  assert.equal(openAiPendingRunUncertain(runner.state),false);
  const {renderOpenAiReviewStatus}=await import('../web/pages/openai-review.mjs');
  const firstPaint=renderOpenAiReviewStatus(runner.state);
  assert.match(firstPaint,/请求已发出，等待服务器确认/);
  assert.doesNotMatch(firstPaint,/<strong>结果待确认|用时 /);
  assert.match(firstPaint,/data-openai-elapsed/);
  await runner.observe();await runner.start();
  assert.deepEqual(calls.map(call=>call.method),['POST','GET']);
  assert.equal(calls[1].path,'/openai-review/runs/'+completed.id);
  assert.equal(runner.state.run.stage,'awaiting_provider');
  // Once this new ID itself becomes uncertain, stop observation and preserve its lock.
  runner.adopt({...completed,status:'uncertain'});
  assert.equal(openAiPendingRunUncertain(runner.state),true);
  await runner.observe();await runner.start();assert.equal(calls.length,2);
  finishPost({...completed,status:'uncertain'});await pending;
  assert.equal(runner.state.pendingId,completed.id);
  const source=await readFile('web/openai-review-controller.mjs','utf8');
  const schedule=source.slice(source.indexOf('function scheduleCheck'),source.indexOf('export async function loadOpenAiReview'));
  assert.match(schedule,/openAiPendingRunUncertain\(runner\?\.state\)/);
});

test('late GET cannot resurrect a completed request and a confirmed GET result survives POST transport failure',async()=>{
  let finishPost,finishGet;
  const {runner}=fixture((path,options)=>new Promise(resolve=>{
    if(options?.method==='POST') finishPost=resolve; else finishGet=resolve;
  }));
  const post=runner.start(), get=runner.observe();
  finishPost(completed); await post;
  finishGet({...completed,status:'running'}); await get;
  assert.equal(runner.state.run.status,'succeeded');assert.equal(runner.state.pendingId,'');
  let rejectPost;
  const other=fixture((path,options)=>options?.method==='POST' ? new Promise((_,reject)=>{rejectPost=reject;}) : Promise.resolve(completed));
  const pending=other.runner.start(); await other.runner.observe();rejectPost(new Error('transport'));await pending;
  assert.equal(other.runner.state.run.status,'succeeded');assert.equal(other.runner.state.error,'');
});

test('observation is single-flight, early404 is harmless, disposal prevents late adoption',async()=>{
  let finishGet,finishPost,calls=0;
  const {runner,storage,key}=fixture((path,options)=>{
    calls++;
    return new Promise(resolve=>{if(options?.method==='POST')finishPost=resolve;else finishGet=resolve;});
  });
  const post=runner.start(),get=runner.observe();await runner.observe();assert.equal(calls,2);
  runner.dispose();finishGet(completed);finishPost(completed);await Promise.all([post,get]);
  assert.equal(storage.getItem(key),completed.id);
});

test('AI diagnosis navigation is available on mobile and desktop and old API diary is removed',async()=>{
  const {sidebarNavigation,mobileNavigation}=await import('../web/ui/workbench.mjs');
  const {renderAiReports}=await import('../web/pages/ai-reports.mjs');
  const {renderAiDiagnosis}=await import('../web/ai-diagnosis-controller.mjs');
  state.page='ai-diagnosis';
  for(const html of [sidebarNavigation(),mobileNavigation()]) assert.match(html,/data-nav="ai-diagnosis"[^>]*aria-current="page"/);
  assert.doesNotMatch(renderAiReports(),/data-ai-daily-tab="openai"|openai-diary-list/);
  const html=renderAiDiagnosis();
  assert.match(html,/data-diagnosis-tab="help">求助API/);
  assert.match(html,/data-diagnosis-tab="reports">诊断报告/);
  assert.match(html,/id="ai-report-calendar"/);
});

test('diagnosis routes preserve calendar date and record through Back/Forward and legacy trigger redirect',()=>{
  const previous={location:globalThis.location,history:globalThis.history,window:globalThis.window,localStorage:globalThis.localStorage};
  const entries=['https://example.test/?page=review&account=V%E5%AD%97#openai-review-panel'];let index=0;
  globalThis.location=new URL(entries[0]);globalThis.localStorage=memory();
  globalThis.window={matchMedia:()=>({matches:true})};
  globalThis.history={replaceState(_,__,url){entries[index]=String(url);globalThis.location=new URL(url);},
    pushState(_,__,url){entries.splice(++index);entries[index]=String(url);globalThis.location=new URL(url);}};
  try {
    readRoute();updateRoute();assert.equal(state.page,'ai-diagnosis');assert.equal(state.diagnosisTab,'help');assert.equal(location.hash,'');
    state.diagnosisTab='reports';state.aiDailyDate='2026-11-08';state.openAiRun='run-1';updateRoute(true);
    state.diagnosisTab='help';updateRoute(true);
    globalThis.location=new URL(entries[--index]);readRoute();assert.equal(state.diagnosisTab,'reports');
    assert.equal(state.aiDailyDate,'2026-11-08');assert.equal(state.openAiRun,'run-1');
    globalThis.location=new URL(entries[++index]);readRoute();assert.equal(state.diagnosisTab,'help');
  } finally {Object.assign(globalThis,previous);}
});

test('progress shows only durable stages, no percentage, and uncertainty stops animation',async()=>{
  const {openAiReviewFeedback,openAiElapsed}=await import('../web/core/openai-review-progress.mjs');
  const {renderOpenAiReviewStatus}=await import('../web/pages/openai-review.mjs');
  const vm={pendingId:'run-1',operation:'start',startedAt:100,run:{...completed,status:'running',stage:'preparing',provider_calls:0}};
  assert.match(openAiReviewFeedback(vm).title,/准备/);
  assert.match(openAiReviewFeedback({...vm,run:{...vm.run,stage:'awaiting_provider',provider_calls:1}}).title,/已登记调用/);
  const html=renderOpenAiReviewStatus(vm);assert.match(html,/<progress aria-label=/);assert.doesNotMatch(html,/value=|\d+%/);
  const uncertain={...vm,run:{...vm.run,status:'uncertain'}};
  assert.doesNotMatch(renderOpenAiReviewStatus(uncertain),/<progress|data-openai-elapsed/);
  assert.equal(openAiElapsed(1000,62000),'1分1秒');
  const modelHtml=renderOpenAiReviewPanel({owner:true,config:{...saved,supported_models:[{id:'gpt-6.1-sol',label:'GPT-6.1 Sol'},{id:'gpt-6-astra',label:'GPT-6 Astra'}]},selectedModel:'gpt-6-astra'});
  assert.match(modelHtml,/value="gpt-6-astra"\s+selected/);assert.doesNotMatch(modelHtml,/gpt-6.1-astra/);
});

test('completed duration remains static in help and diary, with timestamp fallback and no uncertain duration claim',async()=>{
  const {openAiCompletedElapsed}=await import('../web/core/openai-review-progress.mjs');
  const {renderOpenAiReviewStatus}=await import('../web/pages/openai-review.mjs');
  const run={...completed,elapsed_ms:61500};
  assert.equal(openAiCompletedElapsed(run),'1分1秒');
  assert.equal(openAiCompletedElapsed({...completed,completed_at:'2026-11-07T17:02:03Z'}),'2分3秒');
  assert.equal(openAiCompletedElapsed({...run,status:'uncertain'}),'');
  assert.equal(openAiCompletedElapsed({...run,elapsed_ms:-1}),'');
  assert.equal(openAiCompletedElapsed(completed),'');
  for(const html of [renderOpenAiReviewStatus({run}),renderOpenAiRun(run)]) {
    assert.match(html,/用时 1分1秒/);assert.doesNotMatch(html,/data-openai-elapsed|<progress/);
  }
});

test('help does not show server default as the selected model and polling guards hidden documents',async()=>{
  const html=renderOpenAiReviewPanel({owner:true,selectedModel:'gpt-6.1-sol',config:{...saved,model:'gpt-6.1-terra',
    supported_models:[{id:'gpt-6.1-sol',label:'Sol'},{id:'gpt-6.1-terra',label:'Terra'}]}});
  assert.match(html,/value="gpt-6.1-sol"\s+selected/);assert.doesNotMatch(html,/可发起分析 · gpt-6.1-terra/);
  const source=await readFile('web/openai-review-controller.mjs','utf8');
  const schedule=source.slice(source.indexOf('function scheduleCheck'),source.indexOf('export async function loadOpenAiReview'));
  assert.match(schedule,/visibilityState === 'hidden'/);assert.match(schedule,/visibilityState !== 'hidden'/);
});

test('settling an active request notifies report refresh once without a repeated POST',async()=>{
  const {openAiPendingRunSettled}=await import('../web/core/openai-review-state.mjs');
  let prior={},finishPost,refreshes=0,posts=0;
  const runner=createOpenAiRunner({storage:memory(),key:'completion-refresh',uuid:()=>completed.id,
    request:async(path,options)=>{
      if(options?.method==='POST') {posts++;return new Promise(resolve=>{finishPost=resolve;});}
      return {...completed,status:'running',provider_calls:1,stage:'awaiting_provider'};
    },onChange(next){if(openAiPendingRunSettled(prior,next))refreshes++;prior={...next};}});
  const pending=runner.start();await runner.observe();assert.equal(refreshes,0);
  finishPost(completed);await pending;assert.equal(refreshes,1);assert.equal(posts,1);
  runner.adopt(completed);assert.equal(refreshes,1);
  assert.equal(openAiPendingRunSettled({pendingId:'other'}, {run:completed}),false);
  const uncertain={...completed,status:'uncertain'};
  assert.equal(openAiPendingRunSettled({pendingId:completed.id,run:{...completed,status:'running'}},{run:uncertain}),true);
  assert.equal(openAiPendingRunSettled({pendingId:completed.id,run:uncertain},{run:uncertain}),false);
});

test('report completion event only refreshes current session and reports tab through the stale-safe loader',async()=>{
  const source=await readFile('web/ai-diagnosis-controller.mjs','utf8');
  const listener=source.slice(source.indexOf("document.addEventListener('openai-run-settled'"),source.indexOf("document.addEventListener('click'"));
  assert.match(listener,/sessionEpoch !== runtime.sessionEpoch/);assert.match(listener,/userId !== state.me\?\.id/);
  assert.match(listener,/state.page !== 'ai-diagnosis'/);assert.match(listener,/state.diagnosisTab !== 'reports'/);
  assert.match(listener,/void loadAiDiagnosis\(\)/);assert.doesNotMatch(listener,/POST|setInterval|setTimeout/);
  assert.match(source,/ticket === sequence && epoch === runtime.sessionEpoch/);
});


test('invalid private configuration is visible without displaying or requesting its value',()=>{
  const config={...saved,configured:false,configuration_error:'OPENAI_REVIEW_INVALID_KEY_FORMAT',configuration_error_message:'服务器密钥配置格式无效，未调用 API'};
  const html=renderOpenAiReviewPanel({owner:true,config});
  assert.match(html,/配置格式无效/);assert.doesNotMatch(html,/尚未配置 OpenAI API/);
  assert.match(html,/data-openai-action="start"\s+disabled/);
});
