import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {reviewTrends,trendBounds} from '../web/core/review-trends.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';
import {renderReviewTrends} from '../web/pages/review-trends.mjs';
import {reviewRoute} from '../web/review-controller.mjs';
import {enrichArticles} from '../shared/review-analytics.mjs';

const now='2026-11-10T04:00:00Z',account='V字';
const row=(id,published_at='2026-11-07',extra={})=>({id,account,title:id,published_at,...extra});
const snap=(article_id,reads,extra={})=>({id:'s-'+article_id,article_id,snapshot_date:'2026-11-08',age_hours:24,reads,...extra});
const data=(articles=[],snapshots=[])=>normalizeReviewData({articles,snapshots});
const build=(source,options={})=>reviewTrends(source,{now,account,range:'7d',...options});
const model={account,now,secondary:'trends',loading:false,error:'',filters:{},trends:{range:'7d'}};

test('thirty Shanghai dates by default, seven days, inclusive custom and bounded valid dates',()=>{
  assert.deepEqual(trendBounds({now}),{range:'30d',start:'2026-10-12',end:'2026-11-10',today:'2026-11-10',days:30});
  assert.deepEqual(trendBounds({now,range:'7d'}),{range:'7d',start:'2026-11-04',end:'2026-11-10',today:'2026-11-10',days:7});
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
test('verdict baseline uses whole account before date and shared verdict filtering',()=>{
  const articles=Array.from({length:10},(_,i)=>row('a'+i,`2026-11-${String(i+1).padStart(2,'0')}`));
  const snapshots=articles.map((a,i)=>snap(a.id,i*100,{snapshot_date:'2026-11-10'}));
  const result=build(data(articles,snapshots),{verdict:'爆'});
  assert.equal(result.summary.record_count,2);assert.equal(result.summary.hits,2);
  assert.equal(result.rows[0].verdict_basis.sample_count,10);assert.equal(result.summary.fixed_threshold_count,0);
});
test('future, undated and explicitly unpublished rows do not change the list baseline when excluded from trends',()=>{
  for(const excluded of [row('excluded','2026-11-11'),row('excluded',null),row('excluded','2026-11-07',{status:'draft_saved'})]) {
    const articles=Array.from({length:9},(_,i)=>row('a'+i));
    const snapshots=articles.map((a,i)=>snap(a.id,(i+1)*100));
    const snapshot_date=excluded.published_at==='2026-11-11'?'2026-11-12':'2026-11-08';
    const source=data([...articles,excluded],[...snapshots,snap(excluded.id,1000,{snapshot_date})]);
    const list=enrichArticles(source,{account}),result=build(source);
    assert.equal(result.summary.record_count,9);
    for(const trend of result.rows) {
      const original=list.find(item=>item.id===trend.id);
      assert.equal(trend.verdict,original.verdict);
      assert.deepEqual(trend.verdict_basis,original.verdict_basis);
    }
    assert.equal(result.rows.find(item=>item.id==='a8').verdict,'爆');
    assert.equal(build(source,{verdict:'爆'}).summary.record_count,1);
  }
});
test('recent30 sample identities match the list even when future records fill the baseline',()=>{
  const articles=[row('target'),...Array.from({length:31},(_,i)=>row('f'+String(i).padStart(2,'0'),'2026-11-11'))];
  const source=data(articles,articles.map((a,i)=>snap(a.id,i?10000+i:900,{snapshot_date:i?'2026-11-12':'2026-11-08'})));
  const original=enrichArticles(source,{account}).find(item=>item.id==='target'),result=build(source);
  assert.equal(result.summary.record_count,1);assert.equal(result.excluded.future,31);
  assert.equal(result.rows[0].verdict,original.verdict);
  assert.deepEqual(result.rows[0].verdict_basis,original.verdict_basis);
  assert.equal(result.rows[0].verdict_basis.sample_count,30);
});
test('future snapshots and snapshots predating publication do not contaminate values',()=>{
  const s=build(data([row('a')],[snap('a',99999,{id:'future',snapshot_date:'2026-11-11'}),
    snap('a',10000,{id:'before',snapshot_date:'2026-11-06'}),snap('a',0,{id:'valid'})])).summary;
  assert.equal(s.average_reads,0);assert.equal(s.coverage.average_reads,1);
});
test('invalid snapshot filtering changes only the trend sample, never the shared verdict thresholds',()=>{
  const articles=Array.from({length:10},(_,i)=>row('a'+i));
  const snapshots=articles.map((a,i)=>snap(a.id,(i+1)*100));
  snapshots[9]=snap('a9',99999,{id:'future',snapshot_date:'2026-11-11'});
  snapshots.push(snap('a9',0,{id:'valid',age_hours:25}));
  const source=data(articles,snapshots),list=enrichArticles(source,{account}).find(item=>item.id==='a9');
  const trend=build(source).rows.find(item=>item.id==='a9');
  assert.equal(list.sample24h.id,'future');assert.equal(trend.sample24h.id,'valid');
  assert.deepEqual(trend.verdict_basis,list.verdict_basis);
  assert.equal(trend.reads_24h,0);assert.equal(trend.verdict,'扑');
  assert.match(renderReviewTrends(source,model),/两处所用样本可能不同/);
});
test('navigation, empty data, daily table, validation, account isolation and HTML escaping',()=>{
  const source=data([row('<script>')],[snap('<script>',100)]);
  source.loadedAt='2026-11-10T03:59:00Z';
  const html=renderContentReviewContent(source,model);
  for(const text of ['数据趋势','发文数','阅读中位数','爆款率','点击率中位数','阅读走势','点击率走势','统计口径与数据时间','逐日数据','2026-11-10 11:59','今天尚未结束','未判定'])assert.ok(html.includes(text),text);
  assert.match(html,/data-review-secondary="cockpit"[^>]+aria-selected="true"/);
  assert.match(html,/class="review-overview-metrics"/);
  assert.doesNotMatch(html,/data-review-secondary="trends"/);
  assert.match(html,/class="review-trend-dot/);assert.doesNotMatch(html,/<script>/);
  assert.doesNotMatch(html,/ style="/,'the strict style policy forbids inline styles');
  const empty=renderContentReviewContent(data(),model);assert.match(empty,/data-review-secondary="cockpit"/);assert.match(empty,/暂无内容复盘数据/);
  assert.match(renderReviewTrends(data(),model),/没有可绘制的有效数据/);
  const invalid=renderReviewTrends(source,{...model,trends:{range:'custom',from:'2026-11-11',to:'2026-11-01'}});
  assert.match(invalid,/role="alert"/);assert.match(invalid,/结束日期不能早于/);
  const blank=renderReviewTrends(data(),{...model,trends:{range:'custom',from:'',to:'2026-11-10'}});
  assert.match(blank,/role="alert"/);assert.match(blank,/请选择有效/);
});
test('trend routes default to thirty days, restore custom dates and ignore the retired metric picker',()=>{
  const route=reviewRoute('https://example.invalid/?page=review&account=V%E5%AD%97&review_section=trends&review_trend_range=custom&review_trend_from=2026-11-01&review_trend_to=2026-11-07&review_trend_metric=hits');
  assert.equal(route.secondary,'cockpit');assert.deepEqual(route.trends,{range:'custom',from:'2026-11-01',to:'2026-11-07'});
  assert.equal(reviewRoute('https://example.invalid/?review_trend_range=bad').trends.range,'30d');
});
test('headline uses medians so one viral article cannot move it, and compares the previous equal period',()=>{
  const current=['a','b','c'].map(id=>row(id,'2026-11-07')),earlier=['x','y','z'].map(id=>row(id,'2026-10-31'));
  const source=data([...current,...earlier],[snap('a',100,{ctr:10}),snap('b',300,{ctr:12}),snap('c',250000,{ctr:20}),
    snap('x',100,{snapshot_date:'2026-11-01',ctr:8}),snap('y',200,{snapshot_date:'2026-11-01',ctr:10}),snap('z',400,{snapshot_date:'2026-11-01',ctr:11})]);
  const result=build(source),tile=key=>result.kpis.find(item=>item.key===key);
  assert.deepEqual(result.previous,{start:'2026-10-28',end:'2026-11-03'});
  assert.equal(result.summary.median_reads,300);assert.ok(result.summary.average_reads>80000);
  assert.deepEqual(tile('record_count'),{key:'record_count',unit:'count',value:3,previous:3,delta:0});
  assert.equal(tile('median_reads').previous,200);assert.equal(tile('median_reads').delta,50);
  assert.equal(tile('median_ctr').value,12);assert.equal(tile('median_ctr').delta,2);
  assert.equal(tile('hit_rate').sample,3);assert.equal(tile('hit_rate').hits,result.summary.hits);
  assert.equal(result.top.id,'c');
  const html=renderReviewTrends(source,model);
  assert.match(html,/较上期 ↑ 50\.0%/);assert.match(html,/较上期 ↑ 2\.0 个百分点/);assert.match(html,/较上期 持平/);
  const alone=build(data(current,[snap('a',100)]));
  assert.ok(alone.kpis.every(item=>item.previous===null&&item.delta===null),'no earlier records means no comparison, not a change from zero');
  const lonely=renderReviewTrends(data(current,[snap('a',100)]),model);
  assert.doesNotMatch(lonely,/review-trend-delta/);assert.match(lonely,/暂不对比/);
});
test('the key curve is a trailing seven-day median that reaches before the range and breaks without enough articles',()=>{
  const articles=[row('p1','2026-11-02'),row('p2','2026-11-03'),row('p3','2026-11-04'),row('late','2026-11-10T01:00:00Z')];
  const source=data(articles,[snap('p1',100,{snapshot_date:'2026-11-05'}),snap('p2',200,{snapshot_date:'2026-11-05'}),snap('p3',900,{snapshot_date:'2026-11-05'})]);
  const result=build(source),on=date=>result.series.find(point=>point.date===date);
  assert.deepEqual(result.rolling,{days:7,min_samples:3});
  assert.equal(on('2026-11-04').rolling_reads,200,'articles before the range still inform the first day');
  assert.equal(on('2026-11-08').rolling_reads,200);
  assert.equal(on('2026-11-09').rolling_reads,null,'two samples left in the window is not a trend');
  const html=renderReviewTrends(source,model);
  assert.equal((html.match(/<line class="review-trend-line"/g)||[]).length,4,'five consecutive days make four segments');
  assert.equal((html.match(/<circle class="review-trend-dot/g)||[]).length,1,'only in-range articles with reads are drawn');
});
test('points sit at their Beijing publication time and the plot starts at the first record',()=>{
  const source=data([row('noon','2026-11-07T04:00:00Z'),row('dated','2026-11-09'),row('old','2026-11-01')],
    [snap('noon',500),snap('dated',700,{snapshot_date:'2026-11-10',ctr:30})]);
  const result=build(source),point=id=>result.points.find(item=>item.id===id);
  assert.deepEqual(result.plot,{start:'2026-11-07',end:'2026-11-10',days:4});
  assert.equal(point('noon').position,.125);assert.equal(point('noon').timed,true);
  assert.equal(point('dated').position,.625,'a date-only record is drawn mid-day');assert.equal(point('dated').timed,false);
  assert.equal(result.series.length,7,'the daily table still lists the whole range');
  assert.equal(result.series[0].position,null);assert.equal(result.series.at(-1).position,.875);
  assert.equal(result.points.some(item=>item.id==='old'),false);
});
test('two pixel-sized SVGs: logarithmic reads with the hit line, linear click rate, and openable points',()=>{
  const articles=Array.from({length:10},(_,i)=>row('a'+i,'2026-11-0'+(4+i%5)));
  const source=data(articles,articles.map((a,i)=>snap(a.id,(i+1)*1000,{snapshot_date:'2026-11-09',ctr:i+1})));
  const html=renderReviewTrends(source,model);
  assert.equal((html.match(/<svg /g)||[]).length,2);
  assert.doesNotMatch(html,/viewBox=/,'axes must not shrink with a fixed-width viewBox');
  assert.match(html,/<svg height="260" role="img"/);assert.match(html,/<svg height="190" role="img"/);
  assert.match(html,/>1,000<\/text>/);assert.match(html,/>1 万<\/text>/);assert.match(html,/>10%<\/text>/);
  assert.match(html,/爆款线 8,000/);
  assert.match(html,/class="review-trend-dot hit"[^>]+r="5.5"\s+data-review-row="a9" data-trend-readout="2026-11-08《a9》阅读 1\.0 万 · 点击率 10\.0% · 爆"/);
  assert.match(html,/data-trend-readout-target data-default="最高：2026-11-08《a9》/);
  const young=renderReviewTrends(data([row('y','2026-11-10T00:00:00Z')],[snap('y',50,{snapshot_date:'2026-11-10',age_hours:4})]),model);
  assert.match(young,/没有可绘制的有效数据/);
  const early=renderReviewTrends(data([row('e','2026-11-09T10:00:00Z')],[snap('e',50,{snapshot_date:'2026-11-10',age_hours:14})]),model);
  assert.match(early,/class="review-trend-dot [a-z]+ provisional"/);assert.match(early,/空心点 1 篇只有发布后不满 24 小时的数据/);
});
