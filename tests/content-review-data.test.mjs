import test from "node:test";
import assert from "node:assert/strict";
import { normalizeReviewData, finiteNumber, latestSnapshots, aggregate, dailySummary, periodSummary, diffRules, periodsFor, metricDiscrepancies, dailySeries } from "../web/core/review-data.mjs";

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
