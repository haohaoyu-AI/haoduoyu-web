import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';

const account = 'V字';
const vm = secondary => ({account, secondary, now:'2026-11-02T04:00:00Z', filters:{range:'all',status:'kept'}, article:'', loading:false, error:''});
const data = normalizeReviewData({
  articles:[{id:'a',account,title:'文章甲',published_at:'2026-11-01',reference_article_id:'ref'}],
  benchmarkAccounts:[
    {id:'b',account,name:'对标甲',topic_focus:'科技产业',title_patterns:['提问式标题'],structure_notes_md:'- 分析结构'},
    {id:'foreign',account:'其他',name:'FOREIGN_ACCOUNT',topic_focus:'FOREIGN_FEATURE'},
  ],
  benchmarkArticles:[{id:'ref',account,benchmark_account_id:'b',title:'BENCHMARK_ARTICLE',reads:1000},
    {id:'foreign-ref',account:'其他',benchmark_account_id:'foreign',title:'FOREIGN_REFERENCE'}],
  playbooks:[{account,status:'active',version:1,rules:[
    {rule_id:'R1',section:'title',status:'kept',text:'规则第一行\n规则第二行完整内容'},
    {rule_id:'R2',section:'body',status:'dropped',text:'另一条完整规则'},
    {rule_id:'R3',section:'other',text:'未分类规则也完整保留'},
  ]}],
  notes:[{account,title:'NOTE_SECRET',body_md:'NOTE_BODY'}],
  reports:[{account,period_type:'daily',summary_md:'DAILY_SECRET'}],
});
const html = secondary => renderContentReviewContent(data,vm(secondary));

test('benchmark tab shows account features and scoped benchmark library', () => {
  const view = html('benchmarks');
  for (const text of ['对标账号','规则','对标甲','科技产业','提问式标题','分析结构']) assert.ok(view.includes(text),text);
  assert.doesNotMatch(view,/复盘与规则|FOREIGN_ACCOUNT|FOREIGN_FEATURE|FOREIGN_REFERENCE/);
  const panel = view.split('id="review-secondary-panel"')[1];
  assert.match(panel,/对标甲/);
  assert.doesNotMatch(panel,/BENCHMARK_ARTICLE|review-benchmark-ref/);
  const library = html('library').split('id="review-secondary-panel"')[1];
  assert.match(library,/BENCHMARK_ARTICLE/);
  assert.match(library,/review-benchmark-ref/);
  assert.match(library,/爆文库/);
});

test('rules remain fully visible regardless of status and notes and daily summaries stay hidden', () => {
  const view = html('review');
  assert.match(view,/<p>规则第一行<\/p><p>规则第二行完整内容<\/p>/);
  assert.match(view,/另一条完整规则/);
  assert.match(view,/未分类规则也完整保留/);
  assert.doesNotMatch(view,/data-review-filter="status"|review-v13-status|review-rule-status|review-v13-expand|NOTE_SECRET|NOTE_BODY|DAILY_SECRET|review-v13-notes/);
});
