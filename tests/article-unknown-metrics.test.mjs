import test from 'node:test';
import assert from 'node:assert/strict';
import {state} from '../web/core/state.mjs';
import {isPublished,ledgerCell} from '../web/core/article-ledger.mjs';
import {articleTable} from '../web/pages/articles.mjs';
import {renderArticleAnalytics,renderArticleDetailBody} from '../web/pages/detail.mjs';

const row=()=>({id:'synthetic-unknown',title:'真实旧指标',status:null,account_id:'synthetic-account',account_name:'合成账号',platform:'zhihu',
  published_at:null,run_date:null,production_mode:'unknown',warnings:[],latest_metrics:{reads:0,likes:null,comments:2},
  latest_as_of:'2026-10-25T01:02:03.000Z',latest_collected_at:'2026-10-25T02:02:03.000Z',
  observations:[{id:'synthetic-observation',kind:'latest',as_of:'2026-10-25T01:02:03.000Z',collected_at:'2026-10-25T02:02:03.000Z',
    metrics:{reads:0,comments:2},source:'已有来源 <img src=x>',note:'已有观察正文'}],
  nodes:[{kind:'d1',status:'not_due',due_at:'2099-01-01T00:00:00.000Z'}]});

test('unknown lifecycle preserves genuine zero, missing metrics and observation text without claiming publication or due dates',t=>{
  const previousColumns=state.columns,previousFilters=state.filters;
  state.columns=new Set(['status','reads','likes','comments']);state.filters={sort:'published_at',order:'desc',group:''};
  t.after(()=>{state.columns=previousColumns;state.filters=previousFilters;});
  const article=row(),before=structuredClone(article),html=renderArticleDetailBody(article),table=articleTable([article]);
  assert.equal(isPublished(article),false);assert.match(ledgerCell(article,'reads'),/>0<\/strong>/);
  assert.match(table,/>0<\/strong>/);assert.match(table,/未取得/);assert.match(table,/未确认/);
  assert.match(html,/<h3>状态未确认<\/h3>/);assert.match(html,/>0<\/strong>/);assert.match(html,/未取得/);
  assert.match(html,/已有观察正文/);assert.match(html,/已有来源 &lt;img src=x&gt;/);assert.doesNotMatch(html,/<img /);
  assert.doesNotMatch(html,/已发布|观察节点|2099-01-01|data-action="review-article"|发布后再记录/);
  assert.deepEqual(article,before);
});

test('unknown history remains visible without a latest summary while known draft display and lifecycle predicates stay unchanged',()=>{
  const article={...row(),status:'future-status',latest_metrics:null,latest_as_of:null,latest_collected_at:null};
  const html=renderArticleAnalytics(article);
  assert.match(html,/状态未确认/);assert.match(html,/最新汇总指标未取得/);assert.match(html,/已有观察正文/);assert.match(html,/>0<\/strong>/);
  assert.doesNotMatch(html,/已发布|观察节点|2099-01-01/);
  for(const status of ['drafting','illustrated','draft_saved','failed']) {
    const draft={...row(),status};assert.equal(isPublished(draft),false);
    assert.match(renderArticleAnalytics(draft),/<strong>未发布<\/strong>/);
    assert.doesNotMatch(renderArticleAnalytics(draft),/已有观察正文|>0<\/strong>/);
    assert.match(ledgerCell(draft,'reads'),/未发布/);
  }
  assert.equal(isPublished({id:'legacy-with-omitted-status'}),true);
});
