import test from 'node:test';
import assert from 'node:assert/strict';
import { day, reviewDateTime, finiteNumber, select24hSnapshot, enrichArticles, enrichArticle, normalizeRule, appliedRules, weekBounds, buildOverview, firstSentence, median } from '../shared/review-analytics.mjs';

const article = (id, published_at = '2026-10-30', account = 'Claude') => ({ id: String(id), account, published_at });
const snapshot = (article_id, reads, overrides = {}) => ({ id: `s${article_id}`, article_id: String(article_id), snapshot_date: '2026-10-30', age_hours: 24, reads, ...overrides });
const dataFor = (values, account = 'Claude') => ({ articles: values.map((_, i) => article(i, '2026-10-30', account)), snapshots: values.map((value, i) => snapshot(i, value)) });

test('strict Shanghai days preserve date-only data and require explicit valid timestamps', () => {
  assert.equal(day('2026-10-25T16:00:00Z'), '2026-10-26');
  assert.equal(reviewDateTime('2026-10-25T16:00:00Z'), '2026-10-26 00:00');
  assert.equal(day('2026-10-25'), '2026-10-25');
  assert.equal(reviewDateTime('2026-10-25'), '2026-10-25');
  for (const value of [null, '', '2026-02-30', '2026-02-30T16:00:00Z', '2026-10-30T24:00:00Z', '2026-10-30T12:00:00', '2026-10-30T12:00Z']) assert.equal(day(value), '');
  for (const value of [null, undefined, '', ' ', false, [], {}, Infinity]) assert.equal(finiteNumber(value), null);
  assert.equal(finiteNumber('0'), 0);
});

test('recorded ages choose nearest24, lower age tie, date then id; dates cannot supply age', () => {
  const rows = [snapshot('a', 9999, { id: 'missing', age_hours: null }), snapshot('a', 72, { id: '72', age_hours: 72 }),
    snapshot('a', 26, { id: 'upper', age_hours: 26 }), snapshot('a', 22, { id: 'z', age_hours: 22 }),
    snapshot('a', 21, { id: 'b', age_hours: 22, snapshot_date: '2026-10-29' }), snapshot('a', 20, { id: 'a', age_hours: 22, snapshot_date: '2026-10-29' }),
    snapshot('b', 24), snapshot('a', 100, { age_hours: 24.1 }), snapshot('a', 100, { age_hours: 11 })];
  assert.equal(select24hSnapshot(rows, 'a').id, 'a');
  assert.equal(select24hSnapshot([...rows].reverse(), 'a').id, 'a');
  assert.equal(select24hSnapshot([snapshot('a', 8, { age_hours: null })], 'a'), null);
  assert.equal(select24hSnapshot([snapshot('a', 8, { age_hours: 12 })], 'a').age_hours, 12);
  assert.equal(select24hSnapshot([snapshot('a', 8, { age_hours: 72 })], 'a').age_hours, 72);
});

test('selected snapshot metrics preserve zero and never substitute another snapshot for missing reads', () => {
  const data = { articles: [article('a'), article('b')], snapshots: [snapshot('a', null, { ctr: 0, completion_rate: 0 }), snapshot('a', 9999, { id: 'later', age_hours: 25 }), snapshot('b', 0)] };
  const [a, b] = enrichArticles(data);
  assert.equal(a.reads_24h, null);
  assert.equal(a.verdict, null);
  assert.equal(a.reliable, false);
  assert.equal(a.ctr_24h, 0);
  assert.equal(a.completion_24h, 0);
  assert.equal(b.reads_24h, 0);
  assert.equal(b.verdict, '扑');
  assert.equal(b.reliable, false);
  assert.equal(b.verdict_reliable, b.reliable);
  assert.deepEqual(enrichArticle(data.articles[1], data.snapshots), b);
});

test('fewer than ten valid samples use inclusive provisional fixed thresholds', () => {
  const rows = enrichArticles(dataFor([0, 100, 101, 999, 1000, null, -1]));
  assert.deepEqual(rows.map(row => row.verdict), ['扑', '扑', '中', '中', '爆', null, null]);
  assert.ok(rows.every(row => !row.reliable));
  assert.equal(rows[0].verdict_basis.sample_count, 5);
});

test('ten valid samples use empirical nearest-rank boundaries with unsplit ties', () => {
  const rows = enrichArticles(dataFor([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  assert.equal(rows.filter(row => row.verdict === '爆').length, 2);
  assert.equal(rows.filter(row => row.verdict === '扑').length, 3);
  assert.ok(rows.every(row => row.reliable));
  assert.equal(rows[0].verdict_basis.high_threshold, 8);
  assert.equal(rows[0].verdict_basis.low_threshold, 3);
  assert.ok(enrichArticles(dataFor(Array(10).fill(100))).every(row => row.verdict === '中'));
  const tied = enrichArticles(dataFor([1, 1, 1, 1, 5, 6, 7, 8, 8, 8]));
  assert.equal(tied.filter(row => row.verdict === '爆').length, 0);
  assert.equal(tied.filter(row => row.verdict === '扑').length, 4);
});

test('latest30 cohort is account-isolated, valid-only and ordered by Shanghai instant then stable id', () => {
  const data = dataFor(Array.from({ length: 32 }, (_, i) => i));
  data.articles.forEach((row, i) => row.published_at = `2026-10-${String(i % 28 + 1).padStart(2, '0')}`);
  data.articles[0].published_at = '2026-10-30T16:00:00Z';
  data.articles[1].published_at = '2026-10-31T00:00:00.001+08:00';
  data.articles.push(article('other', '2026-10-31', 'Other'));
  data.snapshots.push(snapshot('other', 100000));
  data.articles.push(article('invalid', '2026-10-31'));
  data.snapshots.push(snapshot('invalid', null));
  const rows = enrichArticles(data, { account: 'Claude' });
  assert.equal(rows[0].id, '1');
  const basis = rows[0].verdict_basis;
  assert.equal(basis.sample_count, 30);
  assert.ok(!basis.sample_ids.includes('other'));
  assert.ok(!basis.sample_ids.includes('invalid'));
  assert.deepEqual(enrichArticles({ articles: [...data.articles].reverse(), snapshots: [...data.snapshots].reverse() }, { account: 'Claude' })[0].verdict_basis, basis);
  assert.equal(enrichArticles(data, { account: 'Other' })[0].reliable, false);
});

test('rules use the recorded account/version, preserve source metadata, and normalize legacy status only on read', () => {
  const legacy = { rule_id: 'r', text: 'Original', section: 'title', trials: [{ article_id: 'x' }] };
  assert.equal(normalizeRule(legacy).status, 'candidate');
  assert.equal(Object.hasOwn(legacy, 'status'), false);
  const playbooks = [{ id: 'old', account: 'Claude', version: 1, rules: [legacy] }, { id: 'new', account: 'Claude', version: 2, rules: [{ ...legacy, text: 'New' }] }, { account: 'Other', version: 1, rules: [{ ...legacy, text: 'Other' }] }];
  assert.deepEqual(appliedRules(article('a'), playbooks), []);
  const row = { ...article('a'), playbook_version_used: 1, applied_rule_ids: ['r'] };
  assert.equal(appliedRules(row, playbooks)[0].text, 'Original');
  assert.deepEqual(appliedRules({ ...row, applied_rule_ids: [] }, playbooks), []);
  assert.deepEqual(appliedRules({ ...row, playbook_version_used: 3 }, playbooks), []);
});

test('calendar weeks are Monday-Sunday in Shanghai, with preceding comparison week', () => {
  assert.deepEqual(weekBounds('2026-10-25T16:00:00Z'), { today: '2026-10-26', start: '2026-10-26', end: '2026-11-01', previousStart: '2026-10-19', previousEnd: '2026-10-25' });
  assert.equal(weekBounds('2026-10-25T15:59:59Z').start, '2026-10-19');
  assert.equal(weekBounds('2026-10-30', 'last').start, '2026-10-19');
  assert.throws(() => weekBounds('invalid'), TypeError);
});

test('overview uses publication counts, valid verdict denominator, median CTR, point deltas and thirty days', () => {
  const data = { articles: [article('a', '2026-10-26'), article('b', '2026-10-27'), article('c', '2026-10-28'), article('d', '2026-10-19'), article('e', null), article('other', '2026-10-27', 'Other')],
    snapshots: [snapshot('a', 1000, { ctr: 0 }), snapshot('b', 0, { ctr: 10 }), snapshot('c', null, { age_hours: null }), snapshot('d', 100, { ctr: 4 }), snapshot('other', 9999, { ctr: 99 })] };
  const result = buildOverview(data, { account: 'Claude', now: '2026-10-30', range: '30d' });
  assert.equal(result.current.count, 3);
  assert.equal(result.current.judged_count, 2);
  assert.equal(result.current.hit_rate, 50);
  assert.equal(result.current.flop_rate, 50);
  assert.equal(result.current.median_ctr, 5);
  assert.equal(result.current.ctr_median, 5);
  assert.equal(result.current.miss_rate, result.current.flop_rate);
  assert.equal(result.changes.hit_rate.delta, 50);
  assert.equal(result.changes.flop_rate.delta, -50);
  assert.equal(result.changes.median_ctr.delta, 1);
  assert.equal(result.changes.hit_rate.unit, 'percentage_points');
  assert.deepEqual(result.changes.miss_rate, result.changes.flop_rate);
  assert.equal(result.changes.count.delta, 2);
  assert.equal(result.trend.length, 30);
  assert.equal(result.trend[0].date, '2026-10-01');
  assert.equal(result.trend.at(-1).date, '2026-10-30');
  assert.equal(result.trend.find(point => point.date === '2026-10-26').ctr_24h, 0);
  assert.equal(result.trend.find(point => point.date === '2026-10-28').reads_24h, null);
  assert.equal(result.conclusion, '本周尚未生成周报');
  assert.equal(result.alerts.find(alert => alert.code === 'missing_24h').count, 1);
  const last = buildOverview(data, { account: 'Claude', now: '2026-10-30', week: 'last' });
  assert.equal(last.current.count, 1);
  assert.equal(last.trend.length, 7);
  assert.equal(last.range, '7d');
  assert.equal(last.trend[0].date, '2026-10-24');
  assert.equal(last.conclusion, '上周尚未生成周报');
  assert.ok(last.summary.startsWith('上周'));
});

test('overview conclusion is the exact selected account/week report first sentence, never computed or cross-week text', () => {
  const reports = [
    { id: 'a', account: 'Claude', period_type: 'weekly', period_start: '2026-10-26', period_end: '2026-11-01', summary_md: '**这是本周结论。** 第二句不显示。', created_at: '2026-10-30T00:00:00Z' },
    { id: 'b', account: 'Claude', period_type: 'weekly', period_start: '2026-10-19', period_end: '2026-10-25', summary_md: '# 上周的结论！\n其他内容。' },
    { id: 'c', account: 'Other', period_type: 'weekly', period_start: '2026-10-26', period_end: '2026-11-01', summary_md: '另一个账号。' },
    { id: 'd', account: 'Claude', period_type: 'daily', period_start: '2026-10-26', period_end: '2026-11-01', summary_md: '不是周报。' },
    { id: 'e', account: 'Claude', period_type: 'weekly', period_start: '2026-10-19', period_end: '2026-11-01', summary_md: '跨两周报告不作为匹配。' },
  ];
  assert.equal(buildOverview({ reports }, { account: 'Claude', now: '2026-10-30' }).conclusion, '这是本周结论。');
  assert.equal(buildOverview({ reports }, { account: 'Claude', now: '2026-10-30', week: 'last' }).conclusion, '上周的结论！');
  assert.equal(buildOverview({ reports: reports.slice(1) }, { account: 'Claude', now: '2026-10-30' }).conclusion, '本周尚未生成周报');
  assert.equal(firstSentence('[结论](https://example.test)是第一句。第二句。'), '结论是第一句。');
  assert.equal(firstSentence(null), '');
  assert.equal(firstSentence('A plain conclusion. Another sentence.'), 'A plain conclusion.');
  assert.throws(() => buildOverview({}, { range: '10d' }), TypeError);
});

test('collection interruption uses explicit two-calendar-day threshold, accounts and no guessed dates', () => {
  const data = { articles: [article('a')], snapshots: [snapshot('a', 0, { snapshot_date: '2026-10-28' }), snapshot('other', 0, { snapshot_date: '2026-10-30' })] };
  assert.ok(!buildOverview(data, { now: '2026-10-30' }).alerts.some(alert => alert.code === 'collection_interruption'));
  const stale = buildOverview(data, { now: '2026-10-31' }).alerts.find(alert => alert.code === 'collection_interruption');
  assert.equal(stale.days_since_snapshot, 3);
  assert.equal(stale.last_snapshot_date, '2026-10-28');
  const absent = buildOverview({ articles: [article('a')] }, { now: '2026-10-30' }).alerts.find(alert => alert.code === 'collection_interruption');
  assert.equal(absent.last_snapshot_date, null);
  assert.equal(absent.days_since_snapshot, null);
  assert.equal(buildOverview({}, { now: '2026-10-30' }).current.hit_rate, null);
  assert.equal(median([null, 0, 2, '']), 1);
});
