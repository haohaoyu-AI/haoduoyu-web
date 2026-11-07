import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openAiRunDay, openAiDiaryLink, openAiRunsForDate, readOpenAiRuns, openAiOwnerSession,
  openAiDraft, editOpenAiDraft, saveOpenAiDraft} from '../web/core/openai-review-state.mjs';
import {createOpenAiRunner} from '../web/core/openai-review-runner.mjs';
import {openAiReviewTimeout} from '../web/openai-review-controller.mjs';
import {renderOpenAiRun, renderOpenAiSettings, renderOpenAiReviewPanel, openAiRunModeLabel} from '../web/pages/openai-review.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {state} from '../web/core/state.mjs';
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
  assert.match(openAiDiaryLink(completed),/ai_tab=openai&date=2026-11-08&openai_run=run-1/);
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

test('public, absent and nonconfigured sessions cannot render a paid action or prompt editor',()=>{
  assert.equal(openAiOwnerSession({id:'owner',publicBusiness:true}),false);
  assert.equal(openAiOwnerSession(null),false);
  assert.equal(openAiOwnerSession({id:'owner',publicBusiness:false}),true);
  for(const html of [renderOpenAiReviewPanel({owner:false}),renderOpenAiSettings({owner:false})]) {
    assert.match(html,/管理员登录/);assert.doesNotMatch(html,/<textarea|data-openai-action="(?:start|full)"/);
  }
  const html=renderOpenAiReviewPanel({owner:true,config:{...saved,configured:false}});
  assert.match(html,/尚未配置/);assert.match(html,/data-openai-action="start"\s+disabled/);
  assert.doesNotMatch(html,/已连接|已连通|api[_-]?key.*input/i);
});

test('one-click entry stays outside the collapsed article list and only appears for V字',()=>{
  const vm={account:'V字',filters:{},secondary:'benchmarks'},data=normalizeReviewData({articles:[{id:'article',account:'V字',title:'示例'}]});
  const html=renderContentReviewContent(data,vm);
  assert.ok(html.indexOf('id="openai-review-panel"') < html.indexOf('data-review-articles-expanded'));
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
  for(const code of ['OPENAI_REVIEW_NOT_CONFIGURED','OPENAI_REVIEW_NO_DATA','OPENAI_REVIEW_INPUT_LIMIT','OPENAI_REVIEW_RATE_LIMIT']) {
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
    readRoute();updateRoute();assert.equal(state.aiDailyTab,'openai');assert.equal(state.aiDailyDate,'2026-11-08');
    assert.equal(location.searchParams.get('ai_tab'),'openai');assert.equal(location.searchParams.get('date'),'2026-11-08');
    assert.equal(location.searchParams.get('openai_run'),'run-1');
    state.aiDailyDate='2026-10-01';updateRoute();assert.equal(location.searchParams.get('ai_tab'),'openai');
    state.page='review';updateRoute();assert.equal(location.searchParams.has('ai_tab'),false);
  } finally { Object.assign(globalThis,previous); }
});

test('private operations bypass offline transport and do not alter global public-business permissions',async()=>{
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
  assert.match(html,/在 AI 日报查看这条记录/);
  assert.match(html,/data-openai-action="start"\s+disabled/);
});

test('uncertain diary records explain billing uncertainty, retain escaped server text and link to recovery',()=>{
  const html=renderOpenAiRun({...completed,status:'uncertain',report_markdown:'',
    error_message:'API 执行结果尚未确认，可能已经计费；不会自动重试 <script>bad</script>'});
  assert.match(html,/结果待确认/);assert.match(html,/可能已经计费/);assert.match(html,/不会自动重试/);
  assert.match(html,/&lt;script&gt;bad&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>/);
  assert.match(html,/href="\?page=review&amp;account=V%E5%AD%97#openai-review-panel">前往复盘页核查状态/);
  const missing=renderOpenAiRun({...completed,status:'uncertain',report_markdown:''});
  assert.match(missing,/API 执行结果尚未确认，可能已经计费；不会自动重试。/);
  assert.doesNotMatch(renderOpenAiRun(completed),/可能已经计费|前往复盘页核查状态/);
});


test('paid analysis timeout allows four provider rounds plus overhead without extending normal reads or release',()=>{
  assert.equal(openAiReviewTimeout('/openai-review/runs',{method:'POST'}),210000);
  assert.ok(openAiReviewTimeout('/openai-review/runs',{method:'POST'}) >= 4*45000+30000);
  for(const [path,options] of [
    ['/openai-review/runs',{}],['/openai-review/runs',{method:'GET'}],['/openai-review/runs?offset=0',{}],
    ['/openai-review/runs/run-1',{}],['/openai-review/config',{}],['/openai-review/config',{method:'PATCH'}],
    ['/openai-review/runs/run-1/release',{method:'POST'}]
  ]) assert.equal(openAiReviewTimeout(path,options),75000);
});
