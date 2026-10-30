import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from 'node:child_process';
import { normalizeReviewData, finiteNumber, latestSnapshots, aggregate, dailySummary, periodSummary, diffRules, periodsFor, metricDiscrepancies, dailySeries, day, reviewDateTime, articleRows } from "../web/core/review-data.mjs";

const fixture = () => normalizeReviewData({
  articles: [{ id: "a", published_at: "2026-10-29T11:00:00Z", topic_category: "剧评" }, { id: "b", published_at: "2026-10-30T11:00:00Z" }],
  snapshots: [
    { id: "s1", article_id: "a", snapshot_date: "2026-10-29", reads: 10, ctr: 5, revenue: 0 },
    { id: "s2", article_id: "a", snapshot_date: "2026-10-30", reads: 30, ctr: 6 },
    { id: "s3", article_id: "b", snapshot_date: "2026-10-30", reads: "20", ctr: "", completion_curve: "{bad" },
    { id: "future", article_id: "b", snapshot_date: "2026-10-31", reads: 900, ctr: 99 },
  ],
  reports: [{ id: "r", period_type: "daily", period_start: "2026-10-30", period_end: "2026-10-30", verdicts: '{"a":{"verdict":"爆","reason":"真实原因"},"b":{"verdict":"扑"}}', metrics: '{"total_reads":999}' }],
});

test("missing and malformed source values never become zero", () => {
  for (const value of [null, undefined, "", " ", false, [], {}, "bad", Infinity]) assert.equal(finiteNumber(value), null);
  assert.equal(finiteNumber("0"), 0);
  const data = fixture();
  assert.equal(data.snapshots[2].ctr, null);
  assert.equal(data.snapshots[2].completion_curve, null);
  const summary = aggregate([{ snapshot: { reads: 0, ctr: 5 } }, { snapshot: null }]);
  assert.equal(summary.reads, 0);
  assert.equal(summary.partial.reads, true);
  assert.equal(summary.revenue, null);
  assert.equal(summary.hits, null);
});

test("period snapshots honor cutoff and publication cohort", () => {
  const data = fixture();
  assert.equal(latestSnapshots(data.snapshots, "2026-10-30").get("b").reads, 20);
  const result = periodSummary(data, { start: "2026-10-30", end: "2026-10-30", periodType: "daily" });
  assert.equal(result.current.reads, 20);
  assert.equal(result.current.ctr, null);
  assert.equal(result.previous.reads, 10);
  assert.equal(result.changes.reads.delta, 10);
  assert.equal(result.rows[0].verdict, "扑");
  assert.equal(dailySummary(data, "2026-10-30").stats.recent_hits, 1);
  assert.equal(dailySummary(data, "2026-10-30").previousStats.recent_hits, null);
});

test("rules compare stable IDs and author metrics are separate evidence", () => {
  const result = diffRules([{ rule_id: "same", text: "旧文", section: "标题" }, { rule_id: "gone", text: "删除" }], [{ rule_id: "same", text: "新文", section: "标题" }, { rule_id: "new", text: "新增" }]);
  assert.deepEqual(result.removed.map(rule => rule.rule_id), ["same", "gone"]);
  assert.deepEqual(result.added.map(rule => rule.rule_id), ["same", "new"]);
  assert.equal(result.changed.length, 1);
  assert.equal(metricDiscrepancies(fixture().reports[0], { reads: 20 })[0].mismatch, true);
});

test("available periods and charts use actual dates only", () => {
  const data = fixture();
  assert.equal(periodsFor(data, "daily")[0].end, "2026-10-30");
  assert.deepEqual(dailySeries(data, { start: "2026-10-28", end: "2026-10-30" }).map(point => [point.date, point.reads]), [["2026-10-29", 10], ["2026-10-30", 50]]);
  assert.deepEqual(periodsFor({}, "weekly"), []);
});

test('publication instants cross the Shanghai day boundary while calendar dates remain unchanged', () => {
  assert.equal(day('2026-10-26T15:59:59Z'), '2026-10-26');
  assert.equal(day('2026-10-26T16:00:00Z'), '2026-10-27');
  assert.equal(day('2026-10-27T00:00:00+08:00'), '2026-10-27');
  assert.equal(reviewDateTime('2026-10-26T20:05:00Z'), '2026-10-27 04:05');
  assert.equal(reviewDateTime('2026-10-27T04:05:00+08:00'), '2026-10-27 04:05');
  assert.equal(day('2026-10-29'), '2026-10-29');
  assert.equal(reviewDateTime('2026-10-29'), '2026-10-29');
  for (const value of ['', null, undefined, 'unknown', '2026-02-30', '2026-02-30T16:00:00Z', '2026-10-26T20:05:00', '2026-10-26T24:00:00Z']) {
    assert.equal(day(value), '');
    assert.equal(reviewDateTime(value), '');
  }
});

test('daily cohorts use Shanghai publication dates without moving snapshot or report dates', () => {
  const data = normalizeReviewData({
    articles: [{id:'before',published_at:'2026-10-26T15:59:59Z'}, {id:'after',published_at:'2026-10-26T16:00:00Z'},
      {id:'date-only',published_at:'2026-10-26'}, {id:'offset',published_at:'2026-10-27T00:00:00+08:00'}],
    snapshots:[{id:'s',article_id:'before',snapshot_date:'2026-10-26',reads:7}],
    reports:[{id:'r',period_type:'daily',period_start:'2026-10-26',period_end:'2026-10-26'}],
  });
  assert.deepEqual(articleRows(data,{start:'2026-10-26',end:'2026-10-26'}).map(row=>row.id).sort(), ['before','date-only']);
  assert.deepEqual(articleRows(data,{start:'2026-10-27',end:'2026-10-27'}).map(row=>row.id).sort(), ['after','offset']);
  assert.equal(dailySummary(data,'2026-10-27').stats.published_count,2);
  assert.equal(periodsFor(data,'daily')[0].end,'2026-10-26');
  assert.equal(dailySeries(data,{start:'2026-10-26',end:'2026-10-26'})[0].date,'2026-10-26');
});

test('publication dates and displayed times do not depend on the client timezone', () => {
  const url = new URL('../web/core/review-data.mjs',import.meta.url).href;
  const code = `import {day,reviewDateTime} from ${JSON.stringify(url)}; console.log(JSON.stringify([day('2026-10-26T16:00:00Z'),reviewDateTime('2026-10-26T20:05:00Z'),day('2026-10-29')]));`;
  for (const zone of ['UTC','America/Los_Angeles','Asia/Tokyo']) {
    const child = spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',env:{...process.env,TZ:zone}});
    assert.equal(child.status,0,child.stderr);
    assert.deepEqual(JSON.parse(child.stdout),['2026-10-27','2026-10-27 04:05','2026-10-29']);
  }
});

test('explicit timestamp input requires seconds to match the API format', () => {
  for (const value of ['2026-10-26T16:00Z','2026-10-27T00:00+08:00']) {
    assert.equal(day(value),'');
    assert.equal(reviewDateTime(value),'');
  }
  assert.equal(day('2026-10-26T16:00:00Z'),'2026-10-27');
  assert.equal(day('2026-10-27T00:00:00+08:00'),'2026-10-27');
});

test('a 07:13 Beijing post stays on that civil day and a daily verdict fills later cohorts', () => {
  assert.equal(day('2026-10-27T23:13:00.000Z'), '2026-10-28');
  assert.equal(reviewDateTime('2026-10-27T23:13:00.000Z'), '2026-10-28 07:13');
  const morning = normalizeReviewData({articles:[{id:'m', published_at:'2026-10-27T23:13:00.000Z'}]});
  assert.deepEqual(articleRows(morning, {start:'2026-10-28', end:'2026-10-28'}).map(row => row.id), ['m']);
  assert.deepEqual(articleRows(morning, {start:'2026-10-27', end:'2026-10-27'}), []);
  const rows = articleRows(fixture(), {start:'2026-10-30', end:'2026-10-30', periodType:'three_day'});
  assert.equal(rows.find(row => row.id === 'b').verdict, '扑');
});
