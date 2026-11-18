import test from 'node:test';
import assert from 'node:assert/strict';
import {matchPublishedDraft, reviewPublishLabel, reviewPublishState} from '../shared/review-draft-match.mjs';
import {reviewOverviewMetrics} from '../web/core/review-overview-metrics.mjs';
import {renderBenchmarkLibrary} from '../web/pages/review-benchmark-library.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';
import {normalizeReviewData} from '../web/core/review-data.mjs';

const draft = extra => ({id:'draft',account:'V字',publish_status:'pending',platform_article_id:'item-1',title:'草稿标题',
  alternate_titles:['备选甲','备选乙','备选丙','备选丁'],sample_title:'对标原文',sample_url:'https://www.toutiao.com/article/sample',
  reference_article_id:'sample-1',...extra});

test('platform item id matches the same draft even when the published title is a new alternate', () => {
  const match = matchPublishedDraft([draft()], {account:'V字',platform_article_id:'item-1',title:'临时新标题',sample_title:'别的原文',sample_url:'https://example.com/other'});
  assert.equal(match.kind,'id');
  assert.equal(match.row.id,'draft');
});

test('a changed title matches only together with the benchmark original, never by title alone', () => {
  const rows = [draft({platform_article_id:null})];
  const bySample = matchPublishedDraft(rows, {account:'V字',title:'备选乙',sample_title:'对标原文',sample_url:'https://www.toutiao.com/article/sample'});
  assert.equal(bySample.kind,'corroborated');
  const titleOnly = matchPublishedDraft(rows, {account:'V字',title:'备选乙'});
  assert.equal(titleOnly.kind,'none');
  const wrongSample = matchPublishedDraft(rows, {account:'V字',title:'备选乙',sample_title:'另一篇',sample_url:'https://www.toutiao.com/article/else'});
  assert.equal(wrongSample.kind,'none');
});

test('V字 and Z极客 draft boxes never match each other, and two candidates stay flagged', () => {
  const rows = [draft(), draft({id:'other',account:'Z极客',platform_article_id:null})];
  assert.equal(matchPublishedDraft(rows, {account:'Z极客',title:'备选乙',sample_title:'对标原文',sample_url:'https://www.toutiao.com/article/sample'}).kind,'corroborated');
  assert.equal(matchPublishedDraft(rows, {account:'Z极客',platform_article_id:'item-1',title:'备选乙'}).kind,'none');
  const ambiguous = matchPublishedDraft([draft({platform_article_id:null}), draft({id:'second',platform_article_id:null})],
    {account:'V字',title:'备选甲',sample_url:'https://www.toutiao.com/article/sample'});
  assert.equal(ambiguous.kind,'ambiguous');
  assert.equal(reviewPublishLabel({publish_status:'pending'}),'待发布');
  assert.equal(reviewPublishState({}),'published');
});

test('daily stats count a saved draft and keep its missing reads out of the published median', () => {
  const now = '2026-11-02T04:00:00Z';
  const articles = [
    {id:'live',account:'V字',published_at:'2026-11-02T03:00:00Z',publish_status:'published'},
    {id:'box',account:'V字',publish_status:'pending',draft_saved_at:'2026-11-02T02:00:00Z',created_at:'2026-11-02T02:00:00Z'},
    {id:'lost',account:'V字',publish_status:'unmatched',published_at:'2026-11-02T03:30:00Z'}
  ];
  const snapshots = [
    {id:'a',article_id:'live',age_hours:24,reads:100,ctr:4},
    {id:'b',article_id:'box',age_hours:24,reads:99999,ctr:99},
    {id:'c',article_id:'lost',age_hours:24,reads:99999,ctr:99}
  ];
  const value = reviewOverviewMetrics({articles,snapshots},{account:'V字',range:'24h',now});
  assert.equal(value.count,1);
  assert.equal(value.pendingCount,1);
  assert.equal(value.unmatchedCount,1);
  assert.equal(value.readsMedian,100);
  assert.equal(value.ctrMedian,4);
});

test('爆文库 shows when the sample was published and when the imitation was saved', () => {
  const html = renderBenchmarkLibrary({
    benchmarkAccounts:[{id:'ba',account:'V字',name:'对标号'}],
    benchmarkArticles:[{id:'sample',account:'V字',benchmark_account_id:'ba',title:'样本标题',url:'https://example.com/sample',published_at:'2026-11-01T01:00:00Z',reads:1200}],
    articles:[{id:'ours',account:'V字',title:'仿写标题',reference_article_id:'sample',publish_status:'pending',draft_saved_at:'2026-11-02T03:30:00Z'}]
  },'V字');
  assert.match(html,/样本什么时候发的/);
  assert.match(html,/我们什么时候仿写入库的/);
  assert.match(html,/data-label="样本什么时候发的">2026-11-01 09:00/);
  assert.match(html,/data-label="我们什么时候仿写入库的">2026-11-02 11:30/);
  assert.match(html,/data-label="仿写数据">待发布/);
  const page = renderContentReviewContent(normalizeReviewData({articles:[{id:'box',account:'V字',title:'草稿',publish_status:'pending',draft_saved_at:'2026-11-02T01:00:00Z'}]}),
    {account:'V字',view:'overview',secondary:'cockpit',now:'2026-11-02T04:00:00Z',filters:{metricsRange:'this'},article:'',loading:false,error:''});
  assert.match(page,/review-publish-pending">待发布/);
  assert.match(page,/review-publish-published">已发布/);
  assert.match(page,/不进入这些数字/);
});
