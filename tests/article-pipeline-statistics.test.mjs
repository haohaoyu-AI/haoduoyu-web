import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {isPublishedArticle} from '../src/article-lifecycle.mjs';
import {articleFacts, summarizeArticles, cumulativeOverview} from '../src/analytics.mjs';
import {buildOverview, buildDueReviews, pendingReviewEvents} from '../src/overview.mjs';
import {nextOverviewChange} from '../src/overview-cache-time.mjs';

// Execute the fixed pre-Phase-2B pure functions, without building an old Worker
// or touching a database. Time/error primitives are pinned to that commit too.
const BASELINE = 'fc38d66704c86de8f255751795125bfa71fc7bc7';
function baselineURL(file, replacements = {}) {
  const source = execFileSync('git', ['show', BASELINE + ':src/' + file], {
    cwd: new URL('../', import.meta.url), encoding: 'utf8',
  }).replace(/from (['"])([^'"]+)\1/g, (_all, _quote, specifier) => 'from ' + JSON.stringify(
    replacements[specifier] || (specifier.startsWith('.') ? new URL('../src/' + specifier.slice(2), import.meta.url).href : specifier)));
  return 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
}
const oldPrimitives = {'./lib/time.mjs': baselineURL('lib/time.mjs'), './lib/errors.mjs': baselineURL('lib/errors.mjs')};
const oldAnalyticsURL = baselineURL('analytics.mjs', oldPrimitives);
const oldOverviewURL = baselineURL('overview.mjs', {...oldPrimitives, './analytics.mjs': oldAnalyticsURL});
const oldCacheURL = baselineURL('overview-cache-time.mjs', {
  './analytics.mjs': oldAnalyticsURL, './overview.mjs': oldOverviewURL,
});
const oldAnalytics = await import(oldAnalyticsURL), oldOverview = await import(oldOverviewURL), oldCache = await import(oldCacheURL);
const NOW = Date.parse('2026-10-24T04:00:00Z'), DAY = 86400000;
const account = (id, platform) => ({id, platform, name: id, active: 1, created_at: '2026-01-01T00:00:00Z'});
const accounts = [account('toutiao-haoduoyu', 'toutiao'), account('zhihu-haoduoyu', 'zhihu'), account('wechat-xiaoyuer', 'wechat')];
function article(id, extra = {}) {
  return {id, account_id: accounts[0].id, account_name: accounts[0].name, platform: 'toutiao',
    title: id, url: 'https://example.invalid/pipeline-statistics/' + id,
    published_at: '2026-10-20T04:00:00Z', started_at: null, production_mode: 'manual',
    latest_metrics: null, latest_as_of: null, latest_collected_at: null, duration_seconds: null,
    created_at: '2026-10-20T04:00:00Z', updated_at: '2026-10-23T04:00:00Z', notes: '', ...extra};
}
function daily(id, date, metrics, articleId = null, accountId = accounts[0].id) {
  return {id, account_id: accountId, article_id: articleId, date, metrics, updated_at: '2026-10-23T06:00:00Z'};
}
function fixture() {
  const published = [
    article('published', {status: 'published', production_mode: 'automatic', duration_seconds: 120,
      latest_metrics: {reads: 25, likes: 0, comments: 1}, latest_as_of: '2026-10-23T05:00:00Z'}),
    article('legacy-no-status', {account_id: accounts[1].id, account_name: accounts[1].name, platform: 'zhihu',
      duration_seconds: 0, latest_metrics: {reads: 0, likes: 0, comments: 0, approvals: 3}}),
    article('unknown-date-published', {status: 'published', notes: '[date-unverified]'}),
    article('insurance', {status: 'published', account_id: accounts[2].id, account_name: accounts[2].name, platform: 'wechat',
      title: '【保险200篇·第3篇】合成文章', latest_metrics: {reads: 50, likes: 2, comments: 0}}),
  ];
  const drafts = ['drafting', 'illustrated', 'draft_saved', 'failed', null, undefined].map((status, i) =>
    article('not-published-' + i, {status, url: null, published_at: i % 2 ? null : '2026-10-01T04:00:00Z',
      duration_seconds: NaN, notes: '[date-unverified]', latest_metrics: {reads: Number.MAX_SAFE_INTEGER, likes: 999}}));
  const rows = Array.from({length: 60}, (_, i) => {
    const date = new Date(Date.parse('2026-08-25T00:00:00Z') + i * DAY).toISOString().slice(0, 10);
    return daily('overall-' + i, date, {reads: i % 3, likes: 0, comments: 1});
  });
  rows.push(daily('published-day', '2026-10-23', {reads: 6, likes: 0, comments: 0}, published[0].id));
  rows.push(...drafts.map((row, i) => daily('draft-day-' + i, '2026-10-23',
    {reads: Number.MAX_SAFE_INTEGER, likes: 999}, row.id)));
  const observations = [
    {article_id: published[0].id, kind: 'd1', as_of: '2026-10-21T05:00:00Z', collected_at: '2026-10-21T06:00:00Z'},
    ...drafts.map(row => ({article_id: row.id, kind: 'latest', as_of: '2026-10-23T00:00:00Z', collected_at: '2099-01-01T00:00:00Z'})),
  ];
  return {published, drafts, daily: rows, observations};
}

test('lifecycle distinguishes omitted legacy status from explicit null, undefined and non-published states', () => {
  assert.equal(isPublishedArticle(article('legacy')), true);
  assert.equal(isPublishedArticle(article('explicit', {status: 'published'})), true);
  for (const status of [null, undefined, 'drafting', 'illustrated', 'draft_saved', 'failed', '', 'PUBLISHED', false])
    assert.equal(isPublishedArticle(article('not-published', {status})), false);
  assert.equal(isPublishedArticle(null), false);
});

test('articleFacts preserves published baseline and marks drafts inapplicable rather than unverified or missing metrics', () => {
  const {published, drafts} = fixture();
  for (const row of published) assert.deepEqual(articleFacts(row), oldAnalytics.articleFacts(row));
  for (const row of drafts) {
    const before = structuredClone(row), facts = articleFacts(row);
    assert.equal(facts.date_status, 'not_published');
    assert.equal(facts.snapshot_status, 'not_applicable');
    assert.deepEqual(facts.missing_metrics, []);
    assert.equal(facts.duration_seconds, null);
    assert.deepEqual(row, before);
  }
});

test('summary and cumulative views retain every published baseline field while excluding mixed draft metrics', () => {
  const {published, drafts} = fixture(), mixed = [...published, ...drafts];
  assert.deepEqual(summarizeArticles(mixed.map(articleFacts)), oldAnalytics.summarizeArticles(published.map(oldAnalytics.articleFacts)));
  for (const topPlatform of ['', 'wechat', 'zhihu']) {
    const options = {accounts, topN: 3, topPlatform, now: NOW};
    assert.deepEqual(cumulativeOverview(mixed, options), oldAnalytics.cumulativeOverview(published, options));
  }
  const summary = cumulativeOverview(mixed, {accounts, now: NOW});
  assert.equal(summary.cumulative.article_count, 4);
  assert.equal(summary.cumulative.totals.reads, 75);
  assert.equal(summary.cumulative.unverified_date_count, 1);
  assert.equal(summary.cumulative.no_snapshot_count, 1);
  assert.equal(summary.missing_articles.some(row => row.id.startsWith('not-published-')), false);
});

test('all period/attention/publication and account statistics exactly match the old published-only baseline', () => {
  const {published, drafts, daily: rows, observations} = fixture();
  const input = {accounts, articles: [...published, ...drafts], daily: rows, observations, now: NOW};
  const before = structuredClone(input);
  for (const period of ['yesterday', '7d', '30d']) {
    const actual = buildOverview({...input, period});
    const expected = oldOverview.buildOverview({...input, articles: published, period});
    assert.deepEqual(actual, expected, period + ': every legacy statistic stays exact');
    assert.equal(actual.totals.article_count, 4);
    assert.equal(actual.attention_articles.some(row => !isPublishedArticle(row)), false);
  }
  assert.deepEqual(input, before);
});

test('draft-only articles do not remove account-wide daily zeros or become missing-publication counts', () => {
  const {drafts} = fixture();
  const result = buildOverview({accounts: [accounts[0]], articles: drafts, observations: [],
    daily: [daily('account-zero', '2026-10-23', {reads: 0, likes: 0, comments: 0}),
      daily('rejected-draft-metrics', '2026-10-23', {reads: Number.MAX_SAFE_INTEGER}, drafts[0].id)], now: NOW});
  assert.equal(result.totals.article_count, 0);
  assert.deepEqual(result.accounts[0].period_metrics, {reads: 0, likes: 0, comments: 0});
  assert.equal(result.accounts[0].coverage.source, 'account');
  assert.deepEqual(result.attention_articles, []);
  const cumulative = cumulativeOverview(drafts, {accounts, now: NOW}).cumulative;
  assert.equal(cumulative.article_count, 0);
  assert.equal(cumulative.no_snapshot_count, 0);
  assert.equal(cumulative.unverified_date_count, 0);
  assert.equal(cumulative.totals.reads, null);
});

test('pending/due and cache deadlines reject valid-date drafts and preserve real published scheduling', () => {
  const {published, drafts, observations} = fixture();
  const futureDraft = article('future-draft', {status: 'draft_saved', account_id: accounts[2].id,
    platform: 'wechat', title: '【保险200篇·第199篇】尚未发布', published_at: new Date(NOW + 1000).toISOString()});
  const mixed = [...published, ...drafts, futureDraft];
  assert.deepEqual(pendingReviewEvents(mixed, observations), oldOverview.pendingReviewEvents(published, observations));
  assert.deepEqual(buildDueReviews({articles: mixed, observations, now: NOW}),
    oldOverview.buildDueReviews({articles: published, observations, now: NOW}));
  assert.deepEqual(nextOverviewChange({accounts, articles: mixed, observations, now: NOW}),
    oldCache.nextOverviewChange({accounts, articles: published, observations, now: NOW}));
  assert.ok(buildDueReviews({articles: mixed, observations, now: NOW}).length > 0);
  assert.deepEqual(buildDueReviews({articles: drafts, observations: [], now: NOW}), []);
  assert.equal(nextOverviewChange({accounts, articles: [futureDraft], observations: [], now: NOW}),
    Date.parse('2026-10-24T16:00:00Z'));
});

test('draft historical peers cannot change a genuine published attention baseline', () => {
  const target = article('attention-target', {status: 'published', published_at: '2026-10-20T01:00:00Z'});
  const peers = Array.from({length: 5}, (_, i) => article('published-peer-' + i,
    {status: 'published', published_at: '2026-10-01T01:00:00Z'}));
  const drafts = Array.from({length: 6}, (_, i) => article('draft-peer-' + i,
    {status: i === 0 ? null : 'draft_saved', published_at: '2026-10-01T01:00:00Z'}));
  const rows = [daily('current', '2026-10-23', {reads: 30}, target.id),
    ...peers.map(row => daily('peer-day-' + row.id, '2026-10-04', {reads: 10}, row.id)),
    ...drafts.map(row => daily('draft-peer-day-' + row.id, '2026-10-04', {reads: 9999}, row.id))];
  const input = {accounts: [accounts[0]], articles: [target, ...peers, ...drafts], daily: rows, observations: [], now: NOW};
  const actual = buildOverview(input);
  assert.deepEqual(actual, oldOverview.buildOverview({...input, articles: [target, ...peers]}));
  const finding = actual.attention_articles.find(row => row.id === target.id).attention;
  assert.equal(finding.kind, 'up'); assert.equal(finding.sample_size, 5); assert.equal(finding.median, 10);
});

test('published arithmetic errors still surface instead of being swallowed by lifecycle/cache filtering', () => {
  const invalidPublished = article('invalid-published', {status: 'published', latest_metrics: {reads: Number.MAX_SAFE_INTEGER + 1}});
  assert.throws(() => cumulativeOverview([invalidPublished], {accounts, now: NOW}), error => error.code === 'METRIC_OVERFLOW');
  assert.throws(() => buildOverview({accounts, articles: [], observations: [], now: NOW,
    daily: [daily('invalid-overall', '2026-10-23', {reads: Number.MAX_SAFE_INTEGER + 1})]}),
  error => error.code === 'METRIC_OVERFLOW');
});
