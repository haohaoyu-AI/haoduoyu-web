import test from 'node:test';
import assert from 'node:assert/strict';
import {state,runtime} from '../web/core/state.mjs';
import {defaultFilters} from '../web/core/constants.mjs';
import {renderArticles,articleFilterPanel} from '../web/pages/articles.mjs';
import {renderDashboardSummary} from '../web/pages/dashboard.mjs';
import {renderArticleLedgerSummary} from '../web/pages/article-ledger-overview.mjs';

const statuses=['drafting','illustrated','draft_saved','published','failed'];
const accounts=[{id:'account-a',platform:'zhihu',name:'合成甲账号'},{id:'account-b',platform:'toutiao',name:'合成乙账号'}];
const makeRows=()=>Array.from({length:80},(_,index)=>{
  const status=index>=75?null:statuses[index%5],published=status==='published';
  return {id:'synthetic-'+String(index).padStart(3,'0'),account_id:index%2?'account-a':'account-b',account_name:index%2?'合成甲账号':'合成乙账号',
    platform:index%2?'zhihu':'toutiao',title:'合成文章 '+index,status,writer:null,slot:null,run_date:'2026-10-25',
    published_at:published?'2026-10-25T00:00:00.000Z':null,created_at:'2026-10-25T00:00:00.000Z',updated_at:'2026-10-25T00:00:00.000Z',
    production_mode:'manual',duration_seconds:null,summary:'',notes:'',warnings:[],missing_metrics:[],
    latest_metrics:published?index===3?{reads:0,likes:0,comments:0}:index===8?null:{reads:index,likes:0,comments:0}:null,
    latest_as_of:published?'2026-10-25T01:00:00.000Z':null};
});
function service(rows) {
  const calls=[];
  return {calls,async fetch(path) {
    const url=new URL(path,'http://localhost'),query=url.searchParams;calls.push(url);
    if(url.pathname==='/api/v1/article-reconciliation')return Response.json({data:{complete:true,total:rows.length,rows,
      counts:Object.fromEntries([...statuses,'unknown'].map(status=>[status,rows.filter(row=>(statuses.includes(row.status)?row.status:'unknown')===status).length])),
      dates:[],schedule:{configured:false,expected:null,missing:null,overdue:null},
      insurance:{basis:'explicit_gzh_slot',recorded:0,numbered:0,unique_count:0,highest:null,lowest:null,duplicate_numbers:[],
        observed_gap_ranges:[],start:null,target:null,sample_mapping:'unknown',counts:Object.fromEntries([...statuses,'unknown'].map(status=>[status,0]))}}});
    if(url.pathname.startsWith('/api/v1/articles/'))return Response.json({data:rows.find(row=>row.id===decodeURIComponent(url.pathname.split('/').at(-1)))});
    assert.equal(url.pathname,'/api/v1/articles');
    const cohort=rows.filter(row=>row.status===query.get('status')&&(!query.get('account_id')||row.account_id===query.get('account_id')));
    const page=Number(query.get('page')),page_size=Number(query.get('page_size')),offset=(page-1)*page_size;
    return Response.json({data:cohort.slice(offset,offset+page_size),meta:{total:cohort.length,unfiltered_total:cohort.length,
      page,page_size,offset,has_more:offset+page_size<cohort.length}});
  }};
}
function setup(t,rows=makeRows()) {
  const before=structuredClone(state),oldFetch=globalThis.fetch,epoch=runtime.sessionEpoch,generation=runtime.articleIndexGeneration;
  const mock=service(rows);globalThis.fetch=mock.fetch;
  Object.assign(state,{me:{id:'synthetic-session'},accounts:structuredClone(accounts),account:'',filters:{...defaultFilters(),status:'all'},
    columns:new Set(['account','status','reads','likes','comments']),pageSize:100,listPage:1,articles:[]});
  t.after(()=>{globalThis.fetch=oldFetch;Object.assign(state,before);runtime.sessionEpoch=epoch;runtime.articleIndexGeneration=generation;});
  return mock;
}

test('all articles view retains all eighty rows including unknown lifecycle and real zero/missing readings',async t=>{
  const mock=setup(t),html=await renderArticles(runtime.renderVersion);
  assert.equal(state.articleMeta.total,80);assert.equal(state.articles.length,80);
  assert.equal(new Set(state.articles.map(row=>row.id)).size,80);
  assert.ok(state.articles.some(row=>row.status===null));
  assert.match(html,/<option value="all" selected>全部文章/);assert.match(html,/状态未确认/);
  assert.match(html,/>0<\/strong>/);assert.match(html,/未采集/);
  assert.ok(mock.calls.every(url=>!['all','unknown'].includes(url.searchParams.get('status'))));
  assert.doesNotMatch(html,/data-action="new-article"/);
});

test('unknown lifecycle filter and single-account selection retain identity and never send unsupported status',async t=>{
  const mock=setup(t);state.account='account-a';state.filters.status='unknown';
  const html=await renderArticles(runtime.renderVersion);
  assert.equal(state.articleMeta.total,3);
  assert.ok(state.articles.every(row=>row.account_id==='account-a'&&row.status===null));
  assert.match(html,/<option value="unknown" selected>状态未确认/);
  assert.ok(mock.calls.every(url=>!['all','unknown'].includes(url.searchParams.get('status'))));
});

test('overview shows all lifecycle counts beside published-only genuine metrics and folds writer detail',()=>{
  const counts={drafting:15,illustrated:15,draft_saved:15,published:15,failed:15,unknown:5};
  const summary={verified:true,total:80,counts,writers:[{writer:'human',unpublished:65,published:15,total:80}]};
  const overview={cumulative:{article_count:15,totals:{reads:0,likes:null,comments:0},coverage:null},accounts:[],top_articles:[],
    platform_comparison:[],trend:[],due_reviews:[],series:{}};
  const html=renderDashboardSummary(overview,summary);
  assert.match(html,/全部文章<\/dt><dd>80<\/dd>/);assert.match(html,/状态未确认<\/dt><dd>5<\/dd>/);
  assert.match(html,/已发布文章<\/dt><dd class="">15<\/dd>/);
  assert.match(html,/累计阅读<\/dt><dd class="">0<\/dd>/);
  assert.match(html,/互动（赞\+评）<\/dt><dd class="missing-value">—/);
  assert.match(html,/<details class="article-writer-details"><summary>按写作者查看/);
  assert.doesNotMatch(html,/data-action="article-overview-mode"|data-action="new-article"/);
  assert.match(renderArticleLedgerSummary(),/数量未取得/);
});

test('all status filter leaves every pipeline field available through the existing field selector',t=>{
  setup(t);const html=articleFilterPanel();
  assert.match(html,/<option value="all" selected>全部文章/);
  for(const name of ['draft_ref','slot','writer','warnings','verify','char_count','image_count','total_duration'])
    assert.match(html,new RegExp('name="columns"\\s+value="'+name+'"'));
});
