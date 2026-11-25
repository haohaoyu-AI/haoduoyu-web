import test from 'node:test';
import assert from 'node:assert/strict';
import {matchPublishedDraft, platformArticleId} from '../shared/review-draft-match.mjs';
import {reviewPublishLabel, reviewPublishState} from '../shared/review-publish-state.mjs';
import {reviewOverviewMetrics} from '../web/core/review-overview-metrics.mjs';
import {renderBenchmarkLibrary} from '../web/pages/review-benchmark-library.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';
import {normalizeReviewData} from '../web/core/review-data.mjs';

const draft = extra => ({id:'draft',account:'V字',publish_status:'pending',platform_article_id:'item-1',title:'草稿标题',
  alternate_titles:['备选甲','备选乙','备选丙','备选丁'],sample_title:'对标原文',sample_url:'https://www.toutiao.com/article/sample',
  reference_article_id:'sample-1',...extra});
const opening = '工厂试验台在复验阶段更换陶瓷轴承，三号传感器在下午第一次测得回流口温度恢复到规定范围。';
const firstPassage = '后续检查记录了电机绕组和绝缘层的组装顺序，两位值班技师分别测量了固定夹具的偏心量。';
const secondPassage = '复核组最终把室温升高了六度，原来超过27.4%的重复故障都来自转轴停机后的冷却过程。';
const facts = {people:['林工'],events:['陶瓷轴承量产试验'],numbers:['27.4%','73摄氏度']};
const evidence = (intro = opening) => ({...facts, body:[intro, firstPassage, secondPassage,
  '参考资料', '[复核报告](https://example.org/paper?number=73&utm_source=app)',
  'https://example.org/test-notes#review'].join('\n\n')});

test('repeating an unmatched publication does not treat that row as the draft', () => {
  const pending = draft({platform_article_id:null,match_evidence:evidence()});
  const flagged = {id:'import',account:'V字',publish_status:'unmatched',platform_article_id:'published-item',title:'另一篇'};
  const again = matchPublishedDraft([pending, flagged], {account:'V字',platform_article_id:'published-item',title:'另一篇',
    sample_title:'别的原文',sample_url:'https://www.toutiao.com/article/other'});
  assert.equal(again.kind,'unmatched-repeat');
  assert.equal(again.row.id,'import');
  const linked = matchPublishedDraft([pending, flagged], {account:'V字',platform_article_id:'published-item',title:'备选甲',
    sample_title:'对标原文',sample_url:'https://www.toutiao.com/article/sample',match_evidence:evidence()});
  assert.equal(linked.kind,'corroborated');
  assert.equal(linked.row.id,'draft');
});

test('platform item id matches the same draft even when the published title is a new alternate', () => {
  const match = matchPublishedDraft([draft()], {account:'V字',platform_article_id:'item-1',title:'临时新标题',sample_title:'别的原文',sample_url:'https://example.com/other'});
  assert.equal(match.kind,'id');
  assert.equal(match.row.id,'draft');
});

test('title and benchmark agreement do not identify a draft', () => {
  const rows = [draft({platform_article_id:null})];
  const bySample = matchPublishedDraft(rows, {account:'V字',title:'备选乙',sample_title:'对标原文',sample_url:'https://www.toutiao.com/article/sample'});
  assert.equal(bySample.kind,'none');
  const titleOnly = matchPublishedDraft(rows, {account:'V字',title:'备选乙'});
  assert.equal(titleOnly.kind,'none');
  const wrongSample = matchPublishedDraft(rows, {account:'V字',title:'备选乙',sample_title:'另一篇',sample_url:'https://www.toutiao.com/article/else'});
  assert.equal(wrongSample.kind,'none');
});

test('V字 and Z极客 draft boxes never match each other, and two candidates stay flagged', () => {
  const rows = [draft(), draft({id:'other',account:'Z极客',platform_article_id:null, match_evidence:evidence()})];
  assert.equal(matchPublishedDraft(rows, {account:'Z极客',title:'备选乙',match_evidence:evidence()}).row.id,'other');
  assert.equal(matchPublishedDraft(rows, {account:'Z极客',platform_article_id:'item-1',title:'备选乙'}).kind,'none');
  const ambiguous = matchPublishedDraft([draft({match_evidence:evidence()}),
    draft({id:'second',platform_article_id:null, title:'同名发布稿', match_evidence:evidence()})],
  {account:'V字',title:'同名发布稿',match_evidence:evidence()});
  assert.equal(ambiguous.kind,'ambiguous');
  assert.equal(reviewPublishLabel({publish_status:'pending'}),'待发布');
  assert.equal(reviewPublishState({}),'published');
});

test('uses precise string platform IDs from scoped draft references or approved platform article links', () => {
  const platformId = '7702864660600570431';
  const pending = draft({platform_article_id:null,draft_ref:{pgc_id:platformId},platform:'toutiao'});
  const live = {account:'V字',title:'另一个标题',url:`https://www.toutiao.com/article/${platformId}/?source=feed`};
  assert.equal(platformArticleId(live),platformId);
  assert.equal(matchPublishedDraft([pending],live).kind,'id');
  assert.equal(matchPublishedDraft([pending],{...live,platform:'wechat',platform_article_id:platformId}).kind,'none');
  assert.equal(matchPublishedDraft([pending],{...live,account:'Z极客'}).kind,'none');
  assert.equal(platformArticleId({url:`https://www.toutiao.com.example.org/article/${platformId}`}), '');
  assert.equal(platformArticleId({platform:'wechat',draft_ref:{appmsgid:platformId}}),platformId);
});

test('corroborates changed titles and IDs using body passages, footer links, and precise facts', () => {
  const pending = draft({match_evidence:evidence()});
  const incoming = {account:'V字',platform_article_id:'new-id',title:'发布时重写的标题',
    match_evidence:evidence('从试产到重复试验，研究组先比较了三种固定结构，最后决定重新排列传感器。')};
  const match = matchPublishedDraft([pending],incoming);
  assert.equal(match.kind,'corroborated');
  assert.equal(match.row.id,'draft');
  assert.deepEqual(match.evidence,{body:true,sources:2,cover:false,facts:true,numbers:2,title:false});
});

test('similar titles, facts, and source links are insufficient when articles have different bodies', () => {
  const pending = draft({match_evidence:evidence()});
  const incoming = {account:'V字',title:pending.title,match_evidence:{...facts,
    source_urls:['https://example.org/paper?number=73','https://example.org/test-notes'],
    body:['质检组只比较成品的锈蚀速度，将样件分成四组后分别投入潮湿的库房，按检定表顺序检查。',
      '这次试验观察的是大型钢板在运输过程中的表面颜色变化，设备功率和冷却时间并未纳入本轮统计。'].join('\n')}};
  assert.equal(matchPublishedDraft([pending],incoming).kind,'none');
});

test('an established publication with the exact ID takes priority over a similar pending draft', () => {
  const pending = draft({match_evidence:evidence()});
  const published = {id:'live',account:'V字',platform_article_id:'live-id',publish_status:'published'};
  const incoming = {...published,match_evidence:evidence()};
  assert.equal(matchPublishedDraft([pending,published],incoming).row.id,'live');
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
  assert.match(html,/样本发布时间/);
  assert.match(html,/仿写发布时间/);
  assert.match(html,/data-label="样本发布时间">2026-11-01 09:00/);
  assert.match(html,/data-label="仿写发布时间">2026-11-02 11:30/);
  assert.match(html,/data-label="仿写数据">待发布/);
  const page = renderContentReviewContent(normalizeReviewData({articles:[{id:'box',account:'V字',title:'草稿',publish_status:'pending',draft_saved_at:'2026-11-02T01:00:00Z'}]}),
    {account:'V字',view:'overview',secondary:'cockpit',now:'2026-11-02T04:00:00Z',filters:{metricsRange:'this'},article:'',loading:false,error:''});
  assert.match(page,/review-publish-pending">待发布/);
  assert.match(page,/review-publish-published">已发布/);
  assert.match(page,/不进入这些数字/);
});
