import test from 'node:test';
import assert from 'node:assert/strict';
import {runReviewProvider} from '../src/openai-review-provider.mjs';
import {REVIEW_LIMITS} from '../src/openai-review-data.mjs';
import {state} from '../web/core/state.mjs';
import {apiNetwork} from '../web/core/api.mjs';
import {readRoute, updateRoute} from '../web/core/router.mjs';

function memory() {
  const map = new Map();
  return {getItem:key=>map.get(key) || null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};
}

test('AI reports route and legacy ai-diagnosis / reminder links canonicalize to ai-reports',()=>{
  const previous={location:globalThis.location,history:globalThis.history,window:globalThis.window,localStorage:globalThis.localStorage};
  globalThis.localStorage=memory();
  globalThis.window={matchMedia:()=>({matches:false})};
  globalThis.history={replaceState(_state,_title,url){globalThis.location=new URL(url);}};
  try {
    for (const rawUrl of [
      'https://example.test/?page=ai-reports&ai_tab=openai&date=2026-11-08&openai_run=run-1',
      'https://example.test/?page=ai-diagnosis&diagnosis_tab=reports&date=2026-11-08',
      'https://example.test/?page=reminders&date=2026-11-08'
    ]) {
      globalThis.location=new URL(rawUrl);
      readRoute();updateRoute();
      assert.equal(state.page,'ai-reports');
      assert.equal(state.aiDailyTab,'reports');
      assert.equal(globalThis.location.searchParams.get('page'),'ai-reports');
      assert.equal(globalThis.location.searchParams.has('diagnosis_tab'),false);
      assert.equal(globalThis.location.searchParams.has('openai_run'),false);
    }
    state.aiDailyDate='2026-10-01';updateRoute();
    assert.equal(globalThis.location.searchParams.get('date'),'2026-10-01');
    state.page='review';updateRoute();
    assert.equal(globalThis.location.searchParams.has('ai_tab'),false);
  } finally { Object.assign(globalThis,previous); }
});

test('old AI diagnosis navigation is gone and only AI reports tab markup remains',async()=>{
  const {sidebarNavigation,mobileNavigation}=await import('../web/ui/workbench.mjs');
  const {renderAiReports}=await import('../web/pages/ai-reports.mjs');
  state.page='review';
  for(const html of [sidebarNavigation(),mobileNavigation()]) assert.doesNotMatch(html,/data-nav="ai-diagnosis"/);
  assert.doesNotMatch(renderAiReports(),/data-ai-daily-tab="openai"|openai-diary-list/);
});

test('provider deadline timer matches server budget',async t=>{
  const deadlines=[],schedule=globalThis.setTimeout;
  t.mock.method(globalThis,'setTimeout',(callback,delay,...args)=>{deadlines.push(delay);return schedule(callback,delay,...args);});
  await runReviewProvider({key:'synthetic-timeout-check',model:'gpt-test',instructions:'synthetic',input:{},beforeCall:async()=>{},lookup:async()=>{},
    request:async()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({report_markdown:'synthetic',cumulative_summary:'synthetic',pending_verification:[]})}]}]})});
  assert.deepEqual(deadlines,[180000],'the real default provider timer must match the client budget');
  assert.equal(REVIEW_LIMITS.providerCalls,4);
});

test('public OpenAI API transport keeps same-origin headers and preserves private CSRF tokens',async()=>{
  const previous={fetch:globalThis.fetch,me:state.me},calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({data:{ok:true}}),{status:200});};
  try {
    state.me={id:'public-business',publicBusiness:true};
    await apiNetwork('/openai-review/config',{suppressAuthRedirect:true});
    assert.equal(calls.at(-1).options.credentials,'same-origin');
    assert.equal(calls.at(-1).options.headers['X-CSRF-Token'],undefined);
    state.me={id:'signed-in',csrfToken:'synthetic-csrf'};
    await apiNetwork('/openai-review/config',{method:'PATCH',body:{instructions:'private',version:1},suppressAuthRedirect:true});
    assert.equal(calls.at(-1).options.headers['X-CSRF-Token'],'synthetic-csrf');
  } finally {globalThis.fetch=previous.fetch;state.me=previous.me;}
});
