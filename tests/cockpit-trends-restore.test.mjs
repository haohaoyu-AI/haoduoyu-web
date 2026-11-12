import test from 'node:test';
import assert from 'node:assert/strict';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';
import {reviewOverviewMetrics} from '../web/core/review-overview-metrics.mjs';
import {reviewTrends} from '../web/core/review-trends.mjs';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {cockpitFixture,cockpitNow as now,cockpitAccount as account} from './cockpit-trends-fixture.mjs';

const data = normalizeReviewData(cockpitFixture);
const view = range => renderContentReviewContent(data,{account,now,secondary:'cockpit',filters:{metricsRange:range}});
test('cockpit restores exactly two article charts without changing six cards or the single range selector', () => {
  for (const range of ['this','last','30d']) {
    const html = view(range);
    assert.equal((html.match(/class="review-stat"/g) || []).length,6);
    assert.equal((html.match(/data-review-filter="metricsRange"/g) || []).length,1);
    assert.equal((html.match(/class="review-trend-figure"/g) || []).length,2);
    assert.match(html,/<option value="this"[^>]*>本周<\/option>/);
    assert.match(html,/<option value="last"[^>]*>上周<\/option>/);
    assert.match(html,/<option value="30d"[^>]*>近30天<\/option>/);
    assert.doesNotMatch(html,/review-cockpit-charts|review-trend-controls|review-trend-stats|统计口径与数据时间|逐日数据|逐日数字见下方表格/);
  }
});
test('restored charts use the same cockpit date window and existing v101 article computations', () => {
  for (const range of ['this','last','30d']) {
    const {window} = reviewOverviewMetrics(data,{account,now,range});
    const result = reviewTrends(data,{account,now,range:'custom',from:window.start,to:window.end});
    const html = view(range), expected = result.points.filter(point => point.reads !== null).length +
      result.points.filter(point => point.ctr !== null).length;
    assert.equal((html.match(/<circle class="review-trend-dot /g) || []).length,expected);
    for (const point of result.points) assert.ok(html.includes(`data-review-row="${point.id}"`));
    const pointIds = new Set(result.points.map(point => point.id));
    for (const row of data.articles.filter(row => !pointIds.has(row.id))) assert.ok(!html.includes(`data-review-row="${row.id}"`));
  }
});
test('v101 visual semantics, per-chart highest article, log reading ticks and note are retained', () => {
  const html = view('30d');
  for (const token of ['阅读走势','点击率走势','review-trend-dot hit','review-trend-dot middle','review-trend-dot flop',
    ' provisional','近 7 天中位数','review-trend-line','review-trend-threshold','爆款线','按发布日期统计','缺失不补零','不满 24 小时']) {
    assert.ok(html.includes(token),token);
  }
  assert.equal((html.match(/data-default="最高：/g) || []).length,2);
  const reads = html.split('<h3>阅读走势</h3>')[1].split('<h3>点击率走势</h3>')[0];
  for (const tick of ['1','10','100','1,000','1 万','10 万']) assert.ok(reads.includes(`>${tick}</text>`),tick);
  assert.match(reads,/25\.6 万/);
});
test('empty selected periods keep two honest empty chart states without fabricated points', () => {
  const old = normalizeReviewData({articles:[{id:'old',account,published_at:'2026-10-01'}]});
  const html = renderContentReviewContent(old,{account,now,secondary:'cockpit',filters:{metricsRange:'this'}});
  assert.equal((html.match(/当前范围没有可绘制的有效数据/g) || []).length,2);
  assert.doesNotMatch(html,/<circle class="review-trend-dot /);
  assert.match(html,/缺失值不补零/);
});
test('provisional note counts only articles with a drawable point', () => {
  const young = normalizeReviewData({articles:[{id:'young',account,published_at:'2026-11-11T07:00:00Z'}]});
  const html = renderContentReviewContent(young,{account,now,secondary:'cockpit',filters:{metricsRange:'this'}});
  assert.doesNotMatch(html,/空心点 \d+ 篇/);
});
