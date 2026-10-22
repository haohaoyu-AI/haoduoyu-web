import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOverview, overviewWindow, publicationAgeBand } from '../src/overview.mjs';
import { fixture } from './harness.mjs';
import { revision } from '../src/storage.mjs';

const NOW = Date.parse('2026-10-16T04:00:00Z');
const dayShift = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const account = (id = 'a', platform = 'toutiao') => ({ id, platform, name: id, active: 1, created_at: '2026-01-01T00:00:00Z' });
const article = (id, published = '2026-10-14', accountId = 'a', platform = 'toutiao') => ({ id, account_id: accountId, platform, account_name: accountId,
  title: id, url: 'https://example.invalid/' + id, published_at: published + 'T01:00:00+08:00', production_mode: 'manual',
  duration_seconds: null, latest_metrics: null, latest_as_of: null, updated_at: '2026-10-16T00:00:00Z' });
const daily = (date, metrics, articleId = null, accountId = 'a') => ({ id: `${accountId}:${articleId}:${date}`, account_id: accountId, article_id: articleId,
  date, metrics, updated_at: '2026-10-16T00:00:00Z' });
const overview = (changes = {}) => buildOverview({ accounts: [account()], articles: [], daily: [], observations: [], now: NOW, ...changes });

test('overview pure: Beijing midnight switches yesterday and seven-day windows without including today', () => {
  const before = overviewWindow('yesterday', Date.parse('2026-10-15T15:59:59.999Z'));
  const after = overviewWindow('yesterday', Date.parse('2026-10-15T16:00:00.000Z'));
  assert.equal(before.to, '2026-10-14'); assert.equal(after.to, '2026-10-15');
  assert.deepEqual(overviewWindow('7d', NOW), { from: '2026-10-09', to: '2026-10-15', days: 7, period: '7d',
    previous_from: '2026-10-02', previous_to: '2026-10-08', timezone: 'Asia/Shanghai', todayIncomplete: false });
  for (const value of ['', 'today', 'YESTERDAY', null, ['7d']]) assert.throws(() => overviewWindow(value, NOW), error => error.code === 'VALIDATION_ERROR');
});

test('overview pure: real zeros compare, missing values remain null and zero percentages stay undefined', () => {
  const result = overview({ daily: [daily('2026-10-14', { reads: 0, likes: 10 }), daily('2026-10-15', { reads: 0 })] });
  assert.deepEqual(result.accounts[0].comparisons.reads, { current: 0, previous: 0, delta: 0, percent: null, comparable: true,
    reason: '上期为真实零，提供差值；百分比无定义' });
  assert.equal(result.accounts[0].comparisons.likes.current, null);
  assert.equal(result.accounts[0].comparisons.likes.comparable, false);
  assert.equal(result.accounts[0].comparisons.likes.delta, null);
  assert.deepEqual(result.data_status.complete_accounts, []);
  assert.deepEqual(result.accounts[0].coverage.missing_metrics, ['likes', 'comments']);
});

test('overview pure: primary coverage uses raw likes while approvals remain a separate metric', () => {
  const accounts = [account(), account('b', 'zhihu'), account('c', 'wechat')];
  const result = overview({ accounts, daily: [daily('2026-10-15', { reads: 0, likes: 0, comments: 0 }),
    daily('2026-10-15', { reads: 10, likes: 1, comments: 0 }, null, 'b'),
    daily('2026-10-15', { reads: 10 }, null, 'c')] });
  assert.deepEqual(result.data_status.complete_accounts, ['a', 'b']);
  assert.deepEqual(result.data_status.missing_accounts, ['c']);
  assert.deepEqual(result.accounts.find(row => row.id === 'b').coverage.missing_metrics, []);
  assert.match(result.accounts.find(row => row.id === 'c').coverage.label, /点赞、评论/);
  const zhihu = overview({ accounts: [account('b', 'zhihu')], daily: [daily('2026-10-15', { reads: 0, approvals: 0, comments: 0 }, null, 'b')] });
  assert.deepEqual(zhihu.data_status.complete_accounts, []);
  assert.deepEqual(zhihu.data_status.missing_accounts, ['b']);
  assert.deepEqual(zhihu.accounts[0].coverage.missing_metrics, ['likes']);
  assert.equal(zhihu.accounts[0].period_metrics.likes, undefined);
  assert.equal(zhihu.accounts[0].period_metrics.approvals, 0);
});

test('overview pure: account totals override overlapping article rows without filling omitted metrics', () => {
  const result = overview({ articles: [article('p')], daily: [daily('2026-10-14', { reads: 50 }),
    daily('2026-10-15', { reads: 100 }), daily('2026-10-15', { reads: 99, likes: 5 }, 'p')] });
  assert.deepEqual(result.accounts[0].period_metrics, { reads: 100 });
  assert.equal(result.accounts[0].comparisons.reads.percent, 100);
  assert.deepEqual(result.attention_articles[0].period_metrics, { reads: 99, likes: 5 });
  assert.equal(result.accounts[0].comparisons.likes.current, null);
});

test('overview pure: article-only and mixed account coverage cannot be compared with full account totals', () => {
  const result = overview({ articles: [article('p', '2026-10-01')], daily: [daily('2026-10-14', { reads: 100 }), daily('2026-10-15', { reads: 1 }, 'p')] });
  assert.equal(result.accounts[0].coverage.source, 'articles');
  assert.equal(result.accounts[0].comparisons.reads.comparable, false);
  assert.match(result.accounts[0].comparisons.reads.reason, /全量/);
  assert.deepEqual(result.data_status.missing_accounts, ['a']);
  const mixed = overview({ period: '7d', articles: [article('p', '2026-10-01')], daily: Array.from({ length: 14 }, (_, i) =>
    daily(dayShift('2026-10-02', i), { reads: 1 }, i === 13 ? 'p' : null)) });
  assert.equal(mixed.accounts[0].coverage.source, 'mixed');
  assert.equal(mixed.accounts[0].comparisons.reads.comparable, false);
});

test('overview pure: every metric must cover every selected day before comparison', () => {
  const result = overview({ period: '7d', daily: Array.from({ length: 14 }, (_, i) =>
    daily(dayShift('2026-10-02', i), i === 13 ? { likes: 0 } : { reads: 10, likes: 0 })) });
  assert.equal(result.accounts[0].period_metrics.reads, 60);
  assert.equal(result.accounts[0].coverage.metric_days.reads, 6);
  assert.equal(result.accounts[0].comparisons.reads.comparable, false);
  assert.equal(result.accounts[0].comparisons.likes.comparable, true);
  assert.deepEqual(result.data_status.complete_accounts, []);
  assert.equal(result.trend.length, 7); assert.equal(result.trend.at(-1).date, '2026-10-15');
});

test('overview pure: cumulative snapshots and today rows never invent yesterday increments', () => {
  const result = overview({ articles: [{ ...article('p'), latest_metrics: { reads: 99999 } }],
    daily: [daily('2026-10-16', { reads: 500 })],
    observations: [{ article_id: 'p', kind: 'latest', as_of: '2026-10-16T01:00:00Z', collected_at: '2026-10-16T01:00:00Z', metrics: { reads: 99999 } }] });
  assert.deepEqual(result.accounts[0].period_metrics, {});
  assert.deepEqual(result.attention_articles[0].period_metrics, {});
  assert.equal(result.attention_articles[0].attention.kind, 'insufficient');
  assert.equal(result.accounts[0].comparisons.reads.current, null);
});

function historicalFixture(current = 250, peers = 5, metric = 'reads') {
  const articles = [article('candidate')], rows = [daily('2026-10-15', { [metric]: current }, 'candidate')];
  for (let i = 0; i < peers; i++) {
    const published = dayShift('2026-10-01', i);
    articles.push(article('peer-' + i, published));
    rows.push(daily(dayShift(published, 1), { [metric]: 100 }, 'peer-' + i));
  }
  return { articles, daily: rows };
}
const candidate = result => result.attention_articles.find(row => row.id === 'candidate');

test('overview pure: historical same-age median flags up, real zero down and normal conservatively', () => {
  for (const [value, expected] of [[250, 'up'], [0, 'down'], [100, 'normal']]) {
    const result = candidate(overview(historicalFixture(value)));
    assert.equal(result.attention.kind, expected);
    assert.equal(result.attention.sample_size, 5); assert.equal(result.attention.median, 100);
    assert.equal(result.attention.age_band, 'D1–2');
    assert.match(result.attention.baseline, /历史窗口均在本期之前/);
  }
  assert.equal(publicationAgeBand(0), 'D0'); assert.equal(publicationAgeBand(7), 'D7–13');
  assert.equal(publicationAgeBand(30), 'D30+');
});

test('overview pure: four peers, repeated samples from one article and current-period peers cannot inflate evidence', () => {
  const data = historicalFixture(250, 4);
  data.daily.push(daily('2026-10-03', { reads: 100 }, 'peer-0'));
  data.articles.push(article('current-peer'));
  data.daily.push(daily('2026-10-15', { reads: 100 }, 'current-peer'));
  const result = candidate(overview(data));
  assert.equal(result.attention.kind, 'insufficient'); assert.equal(result.attention.sample_size, 4);
});

test('overview pure: different accounts, age bands and platform interaction names never enter the historical cohort', () => {
  const data = historicalFixture(250, 4);
  data.articles.push(article('wrong-age', '2026-09-01'), article('wrong-account', '2026-10-01', 'b', 'zhihu'));
  data.daily.push(daily('2026-10-02', { reads: 100 }, 'wrong-age'), daily('2026-10-02', { reads: 100, approvals: 100 }, 'wrong-account', 'b'));
  const result = candidate(overview({ ...data, accounts: [account(), account('b', 'zhihu')] }));
  assert.equal(result.attention.kind, 'insufficient'); assert.equal(result.attention.sample_size, 4);
  const wrongMetric = historicalFixture(250, 5, 'approvals');
  assert.equal(candidate(overview(wrongMetric)).attention.kind, 'insufficient');
});

test('overview pure: zero historical median yields insufficient evidence, not infinite growth', () => {
  const data = historicalFixture();
  for (const row of data.daily) if (row.article_id !== 'candidate') row.metrics.reads = 0;
  const result = candidate(overview(data));
  assert.equal(result.attention.kind, 'insufficient'); assert.equal(result.attention.ratio, null);
  assert.equal(result.attention.median, 0);
  assert.match(result.attention.reason, /真实零/);
});

test('overview pure: normal reads or zero read baseline do not hide independently comparable interaction changes', () => {
  for (const readBaseline of [100, 0]) {
    const data = historicalFixture(100);
    for (const row of data.daily) {
      if (row.article_id !== 'candidate') row.metrics.reads = readBaseline;
      row.metrics.likes = row.article_id === 'candidate' ? 30 : 10;
    }
    const result = candidate(overview(data));
    assert.equal(result.attention.kind, 'up'); assert.equal(result.attention.metric, 'likes');
    assert.equal(result.attention.median, 10);
  }
});

test('overview pure: seven-day historical article windows require all days of the chosen metric', () => {
  const articles = [article('candidate', '2026-10-02')], rows = [];
  for (let i = 0; i < 7; i++) rows.push(daily(dayShift('2026-10-09', i), { reads: 250 }, 'candidate'));
  for (let peer = 0; peer < 5; peer++) {
    articles.push(article('peer-' + peer, '2026-09-01'));
    for (let i = 0; i < 7; i++) rows.push(daily(dayShift('2026-09-08', i), { reads: 100 }, 'peer-' + peer));
  }
  const good = candidate(overview({ articles, daily: rows, period: '7d' }));
  assert.equal(good.attention.kind, 'up'); assert.equal(good.attention.median, 700);
  rows.find(row => row.article_id === 'peer-4' && row.date === '2026-09-10').metrics = { likes: 100 };
  const missing = candidate(overview({ articles, daily: rows, period: '7d' }));
  assert.equal(missing.attention.kind, 'insufficient'); assert.equal(missing.attention.sample_size, 4);
});

test('overview pure: selected accounts filter every output and calculations preserve input records', () => {
  const input = { accounts: [account()], articles: [article('p'), article('secret', '2026-10-01', 'b', 'zhihu')],
    daily: [daily('2026-10-15', { reads: 10 }), daily('2026-10-15', { approvals: 99 }, null, 'b')],
    observations: [{ article_id: 'secret', collected_at: '2026-10-16T03:00:00Z', kind: 'd1' }] };
  const before = structuredClone(input), result = overview(input);
  assert.deepEqual(input, before);
  assert.equal(result.totals.article_count, 1);
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.ok(!JSON.stringify(result).includes('99'));
});

test('overview pure: publication efficiency and review due dates retain dashboard definitions', () => {
  const articles = [{ ...article('one', '2026-10-01'), production_mode: 'automatic', duration_seconds: 0 },
    { ...article('two', '2026-10-01'), production_mode: 'unknown', duration_seconds: 120 }];
  const result = overview({ articles, observations: [{ article_id: 'one', kind: 'd1', as_of: '2026-10-02T01:00:00+08:00', collected_at: '2026-10-02T02:00:00Z' }] });
  assert.deepEqual(result.totals, { article_count: 2, automatic_count: 1, unknown_mode_count: 1, median_duration_seconds: 60 });
  assert.equal(result.due_reviews.length, 5);
  assert.equal(result.due_reviews.some(row => row.id === 'one' && row.due_kind === 'd1'), false);
});

test('overview API: authentication, period validation, scope, and business data are preserved', async t => {
  const app = await fixture(t), session = await app.login();
  assert.equal((await app.request('/api/v1/overview')).status, 401);
  for (const suffix of ['?period=today', '?period=', '?period=7d&period=yesterday'])
    assert.equal((await app.request('/api/v1/overview' + suffix, { session })).status, 400);
  const published = new Date(Date.now() - 3 * 86400000).toISOString();
  const created = await app.request('/api/v1/articles', { method: 'POST', session, body: { account_id: 'toutiao-haoduoyu', title: '隔离总览合成文章',
    url: 'https://example.invalid/overview', published_at: published, production_mode: 'manual' } });
  assert.equal(created.status, 201, created.text);
  const yesterday = overviewWindow('yesterday').to;
  await app.request('/api/v1/daily-metrics', { method: 'POST', session, body: { account_id: 'toutiao-haoduoyu', date: yesterday, metrics: { reads: 0 }, source: 'isolated-test' } });
  const key = await app.request('/api/v1/api-keys', { method: 'POST', session, body: { name: 'overview read-only', account_ids: ['toutiao-haoduoyu'], permissions: ['read'] } });
  const before = await revision(app.db);
  const rawBefore = (await app.db.prepare('SELECT * FROM matrix_articles').all()).results;
  const metricsBefore = (await app.db.prepare('SELECT * FROM matrix_daily_metrics').all()).results;
  const response = await app.request('/api/v1/overview', { token: key.data.token });
  assert.equal(response.status, 200, response.text);
  assert.deepEqual(response.data.accounts.map(row => row.id), ['toutiao-haoduoyu']);
  assert.equal(response.data.accounts[0].period_metrics.reads, 0);
  assert.equal(response.data.window.period, 'yesterday');
  assert.equal((await app.request('/api/v1/overview?account_id=zhihu-haoduoyu', { token: key.data.token })).status, 403);
  assert.equal((await app.request('/api/v1/overview?account_id=toutiao-haoduoyu&period=7d', { token: key.data.token })).status, 200);
  assert.equal(await revision(app.db), before);
  assert.deepEqual((await app.db.prepare('SELECT * FROM matrix_articles').all()).results, rawBefore);
  assert.deepEqual((await app.db.prepare('SELECT * FROM matrix_daily_metrics').all()).results, metricsBefore);
  const old = await app.request('/api/v1/dashboard', { session });
  assert.equal(old.data.window.todayIncomplete, true);
  assert.deepEqual(response.data.totals, { ...old.data.totals });
  await app.request('/api/v1/api-keys/' + key.data.id, { method: 'DELETE', session });
  assert.equal((await app.request('/api/v1/overview', { token: key.data.token })).status, 401);
});
