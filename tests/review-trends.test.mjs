import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {reviewTrends,trendBounds} from '../web/core/review-trends.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';
import {renderReviewTrends} from '../web/pages/review-trends.mjs';
import {reviewRoute} from '../web/review-controller.mjs';

const now='2026-11-10T04:00:00Z',account='V字';
const row=(id,published_at='2026-11-07',extra={})=>({id,account,title:id,published_at,...extra});
const snap=(article_id,reads,extra={})=>({id:'s-'+article_id,article_id,snapshot_date:'2026-11-08',age_hours:24,reads,...extra});
const data=(articles=[],snapshots=[])=>normalizeReviewData({articles,snapshots});
const build=(source,options={})=>reviewTrends(source,{now,account,...options});
const model={account,now,secondary:'trends',loading:false,error:'',filters:{},trends:{}};

test('seven Shanghai dates by default, thirty days, inclusive custom and bounded valid dates',()=>{
  assert.deepEqual(trendBounds({now}),{range:'7d',start:'2026-11-04',end:'2026-11-10',today:'2026-11-10',days:7});
  assert.equal(build(data(),{range:'30d'}).series.length,30);
  assert.equal(build(data(),{range:'custom',from:'2026-11-01',to:'2026-11-02'}).series.length,2);
  for(const [from,to] of [['2026-02-30','2026-11-02'],['2026-11-02','2026-11-01'],['2026-11-01','2026-11-11'],['2024-11-01','2026-11-01']])
    assert.throws(()=>build(data(),{range:'custom',from,to}));
  const midnight=build(data([row('utc','2026-11-03T16:15:00Z')],[snap('utc',7,{snapshot_date:'2026-11-05'})]));
  assert.equal(midnight.series[0].record_count,1);
});
test('average is arithmetic, zero remains real, missing values have their own denominators',()=>{
  const source=data([row('a'),row('b'),row('c'),row('missing')],[snap('a',0,{ctr:0}),snap('b',100,{ctr:null}),snap('c',1100,{ctr:12})]);
  const before=JSON.stringify(source),result=build(source),s=result.summary;
  assert.equal(s.average_reads,400);assert.equal(s.coverage.average_reads,3);assert.equal(s.record_count,4);
  assert.equal(s.average_ctr,6);assert.equal(s.coverage.average_ctr,2);assert.equal(s.average_seconds,null);
  assert.equal(s.hits,1);assert.equal(s.coverage.hits,3);assert.ok(Math.abs(s.hit_rate - 100/3) < 1e-10);
  assert.equal(s.published_count,null);assert.equal(s.unverified_count,4);
  assert.equal(s.unjudged_count,1);assert.equal(s.provisional_judged_count,3);
  assert.equal(result.series.find(point=>point.date==='2026-11-06').average_reads,null);
  assert.equal(JSON.stringify(source),before,'no writes or mutation of source data');
});
test('future, explicit draft/failed records and unknown dates cannot become published counts',()=>{
  const source=data([row('old'),row('confirmed','2026-11-07',{status:'published'}),row('draft','2026-11-07',{status:'draft_saved'}),
    row('failed','2026-11-07',{status:'failed'}),row('scheduled','2026-11-07',{publication_status:'scheduled'}),
    row('future-day','2026-11-11'),row('future-time','2026-11-10T05:00:00Z'),row('unknown',null),row('foreign','2026-11-07',{account:'other'})]);
  const result=build(source);
  assert.equal(result.summary.record_count,2);assert.equal(result.summary.confirmed_count,1);assert.equal(result.summary.published_count,null);
  assert.deepEqual(result.excluded,{unpublished:3,undated:1,future:2});
  assert.equal(build(data([row('a','2026-11-07',{status:'published'})])).summary.published_count,1);
});
test('uses the existing nearest24 rule and never substitutes longtail or another snapshot for missing metrics',()=>{
  const source=data([row('a'),row('longtail'),row('missing')],[snap('a',99,{id:'12',age_hours:12}),snap('a',null,{id:'24',age_hours:24,ctr:0}),
    snap('longtail',9000,{age_hours:80}),snap('missing',500,{age_hours:null})]);
  const s=build(source).summary;
  assert.equal(s.average_reads,null);assert.equal(s.hits,null);assert.equal(s.average_ctr,0);assert.equal(s.coverage.average_ctr,1);
  assert.equal(s.snapshot_start,'2026-11-08');assert.equal(s.min_hours,24);
});
test('under24 samples and young publications are provisional; missing exact time is not invented',()=>{
  const source=data([row('sample12','2026-11-07'),row('young','2026-11-10T00:00:00Z'),row('date-only','2026-11-10')],
    [snap('sample12',1300,{age_hours:12}),snap('young',500,{snapshot_date:'2026-11-10',age_hours:24})]);
  const result=build(source);
  assert.equal(result.summary.provisional_count,2);assert.equal(result.summary.unknown_age_count,1);
  assert.equal(result.rows.find(row=>row.id==='young').sample24h,null,'impossible future observation is not counted');
  assert.equal(result.summary.hits,1);assert.equal(result.summary.fixed_threshold_count,1);
});
test('verdict baseline uses whole eligible account before date and shared verdict filtering',()=>{
  const articles=Array.from({length:10},(_,i)=>row('a'+i,`2026-11-${String(i+1).padStart(2,'0')}`));
  const snapshots=articles.map((a,i)=>snap(a.id,i*100,{snapshot_date:'2026-11-10'}));
  const result=build(data(articles,snapshots),{verdict:'爆'});
  assert.equal(result.summary.record_count,2);assert.equal(result.summary.hits,2);
  assert.equal(result.rows[0].verdict_basis.sample_count,10);assert.equal(result.summary.fixed_threshold_count,0);
});
test('future snapshots and snapshots predating publication do not contaminate values',()=>{
  const s=build(data([row('a')],[snap('a',99999,{id:'future',snapshot_date:'2026-11-11'}),
    snap('a',10000,{id:'before',snapshot_date:'2026-11-06'}),snap('a',0,{id:'valid'})])).summary;
  assert.equal(s.average_reads,0);assert.equal(s.coverage.average_reads,1);
});
test('navigation, empty data, accessible daily table, validation, account isolation and HTML escaping',()=>{
  const source=data([row('<script>')],[snap('<script>',100)]);
  source.loadedAt='2026-11-10T03:59:00Z';
  const html=renderContentReviewContent(source,model);
  for(const text of ['数据趋势','平均阅读','已发布篇数','状态待核实','统计口径与数据时间','逐日数据与样本分母','2026-11-10 11:59','今天尚未结束','未判定'])assert.ok(html.includes(text),text);
  assert.match(html,/data-review-secondary="trends"[^>]+aria-selected="true"/);
  assert.match(html,/class="review-trend-point/);assert.doesNotMatch(html,/<script>/);
  const empty=renderContentReviewContent(data(),model);assert.match(empty,/data-review-secondary="trends"/);assert.match(empty,/没有可绘制的有效数据/);
  const invalid=renderReviewTrends(source,{...model,trends:{range:'custom',from:'2026-11-11',to:'2026-11-01'}});
  assert.match(invalid,/role="alert"/);assert.match(invalid,/结束日期不能早于/);
});
test('trend routes restore custom dates and metrics, reject unsupported option values',()=>{
  const route=reviewRoute('https://example.invalid/?page=review&account=V%E5%AD%97&review_section=trends&review_trend_range=custom&review_trend_from=2026-11-01&review_trend_to=2026-11-07&review_trend_metric=hits');
  assert.equal(route.secondary,'trends');assert.deepEqual(route.trends,{range:'custom',from:'2026-11-01',to:'2026-11-07',metric:'hits'});
  assert.equal(reviewRoute('https://example.invalid/?review_trend_metric=bad&review_trend_range=bad').trends.metric,'average_reads');
});

 test('blank custom dates stay invalid and line segments never bridge missing days',()=>{
  const blank=renderReviewTrends(data(),{...model,trends:{range:'custom',from:'',to:'2026-11-10'}});
  assert.match(blank,/role="alert"/);assert.match(blank,/请选择有效/);
  const articles=['04','05','07','08'].map(date=>row('a'+date,'2026-11-'+date));
  const snapshots=articles.map(article=>snap(article.id,100,{snapshot_date:'2026-11-09'}));
  const html=renderReviewTrends(data(articles,snapshots),model);
  assert.equal((html.match(/<polyline class="review-trend-line"/g)||[]).length,2);
  assert.equal((html.match(/<circle class="review-trend-point/g)||[]).length,4);
});
