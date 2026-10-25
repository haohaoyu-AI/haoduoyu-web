import { fail } from './lib/errors.mjs';
import { DAY, beijingDay, shift, distance, dates, median } from './lib/time.mjs';
// Read-only calculations over recorded daily increments. Cumulative snapshots are
// used only to determine review due dates, never to synthesize daily performance.
import { articleFacts, beijingDate } from './analytics.mjs';
import { isPublishedArticle } from './article-lifecycle.mjs';
export const OVERVIEW_METRICS = ['reads', 'impressions', 'likes', 'comments', 'favorites', 'shares', 'approvals', 'reading_users'];
const MIN_SAMPLES = 5;
const latest = values => values.filter(Boolean).sort().at(-1) ?? null;

export function overviewWindow(period = 'yesterday', now = Date.now()) {
  if (!['yesterday', '7d', '30d'].includes(period)) fail(400, 'VALIDATION_ERROR', 'period 仅支持 yesterday、7d 或 30d');
  if (!Number.isFinite(Number(now))) fail(400, 'VALIDATION_ERROR', '总览当前时间无效');
  const today = beijingDay(now), days = period === '30d' ? 30 : period === '7d' ? 7 : 1;
  return { from: shift(today, -days), to: shift(today, -1), days, period,
    previous_from: shift(today, -days * 2), previous_to: shift(today, -days - 1),
    timezone: 'Asia/Shanghai', todayIncomplete: false };
}

function add(target, incoming) {
  for (const [key, value] of Object.entries(incoming)) {
    const sum = (target[key] ?? 0) + value;
    if (!Number.isSafeInteger(sum)) fail(422, 'METRIC_OVERFLOW', '指标汇总超出安全整数范围');
    target[key] = sum;
  }
}

function accountDay(day, rows) {
  const overall = rows.find(row => row.article_id === null);
  const selected = overall ? [overall] : rows.filter(row => row.article_id !== null);
  const metrics = {}, metricDays = {};
  for (const row of selected) add(metrics, row.metrics);
  for (const key of Object.keys(metrics)) metricDays[key] = selected.every(row => Object.hasOwn(row.metrics, key)) ? 1 : 0;
  const source = overall ? 'account' : selected.length ? 'articles' : 'missing';
  return { metrics, coverage: { source, days: selected.length ? 1 : 0, missing_dates: selected.length ? [] : [day],
    metric_days: metricDays, ...(source === 'articles' ? { article_count: selected.length } : {}),
    label: source === 'account' ? '平台账号整体日数据' : source === 'articles' ? `仅已录入的 ${selected.length} 篇文章，不代表账号全量` : '当日数据未取得' } };
}

function sumDays(dayRows, expectedDates) {
  const metrics = {}, metricDays = {}, missing = [], sources = new Set();
  for (const [i, row] of dayRows.entries()) {
    if (row.coverage.source === 'missing') missing.push(expectedDates[i]);
    else {
      sources.add(row.coverage.source); add(metrics, row.metrics);
      for (const key of Object.keys(row.metrics)) metricDays[key] = (metricDays[key] ?? 0) + (row.coverage.metric_days[key] ?? 0);
    }
  }
  const source = sources.size > 1 ? 'mixed' : [...sources][0] ?? 'missing';
  const labels = { account: '账号整体数据', articles: '仅已录入文章，不代表账号全量', mixed: '账号整体与已录入文章按日组合', missing: '本期日数据未取得' };
  return { metrics, coverage: { source, days: expectedDates.length - missing.length, expected_days: expectedDates.length,
    missing_dates: missing, metric_days: metricDays,
    label: labels[source] + (missing.length ? ` · 缺 ${missing.length} 天` : '') +
      (Object.values(metricDays).some(count => count < expectedDates.length) ? ' · 部分指标未覆盖全部日期' : '') } };
}

function compare(current, previous, days, accountLevel = false) {
  return Object.fromEntries(OVERVIEW_METRICS.map(metric => {
    const a = current.metrics[metric] ?? null, b = previous.metrics[metric] ?? null;
    let reason = '';
    if (a === null || b === null) reason = '本期或上期该指标未取得，不能将缺失当作零';
    else if (current.coverage.expected_days !== days || previous.coverage.expected_days !== days) reason = '文章尚未覆盖两个完整同长度周期';
    else if (current.coverage.metric_days[metric] !== days || previous.coverage.metric_days[metric] !== days) reason = '本期或上期该指标缺日，暂不可比较';
    else if (accountLevel && (current.coverage.source !== 'account' || previous.coverage.source !== 'account')) reason = '仅文章明细或混合覆盖，不与账号全量比较';
    const comparable = !reason;
    return [metric, { current: a, previous: b, delta: comparable ? a - b : null,
      percent: comparable && b !== 0 ? (a - b) / b * 100 : null, comparable,
      reason: reason || (b === 0 ? '上期为真实零，提供差值；百分比无定义' : '同口径完整自然日比较') }];
  }));
}

export function publicationAgeBand(age) {
  if (age < 0) return null;
  return age === 0 ? 'D0' : age <= 2 ? 'D1–2' : age <= 6 ? 'D3–6' : age <= 13 ? 'D7–13' : age <= 29 ? 'D14–29' : 'D30+';
}

function articlePeriod(article, byDate, from, to) {
  const published = beijingDay(Date.parse(article.published_at));
  const expected = dates(published > from ? published : from, to);
  const summary = sumDays(expected.map(day => {
    const row = byDate.get(day);
    return row ? { metrics: row.metrics, coverage: { source: 'articles', metric_days: Object.fromEntries(Object.keys(row.metrics).map(key => [key, 1])) } }
      : { metrics: {}, coverage: { source: 'missing', metric_days: {} } };
  }), expected);
  summary.coverage.label = expected.length ? `该文章 ${expected.length} 个自然日新增数据` + (summary.coverage.missing_dates.length ? ` · 缺 ${summary.coverage.missing_dates.length} 天` : '') : '文章在该周期尚未发布';
  return summary;
}

const attentionMetrics = platform => ['reads', ...(platform === 'zhihu' ? ['approvals', 'comments', 'favorites', 'shares'] : platform === 'wechat' ? ['likes', 'comments', 'shares', 'favorites'] : ['likes', 'comments', 'favorites', 'shares'])];
const mainMetrics = () => ['reads', 'likes', 'comments'];

function markMainCoverage(summary, platform, days) {
  summary.coverage.missing_metrics = mainMetrics(platform).filter(metric => summary.coverage.metric_days[metric] !== days);
  if (summary.coverage.missing_metrics.length) {
    const labels = { reads: '阅读', approvals: '赞同', likes: '点赞', comments: '评论' };
    summary.coverage.label += ' · 未完整取得：' + summary.coverage.missing_metrics.map(metric => labels[metric]).join('、');
  }
}

function attentionFor(article, current, articles, dailyByArticle, window, cache) {
  const age = distance(beijingDay(Date.parse(article.published_at)), window.to), band = publicationAgeBand(age);
  const days = current.coverage.expected_days;
  const insufficient = (reason, sampleSize = 0, metric = null) => ({ kind: 'insufficient', reason,
    baseline: '同账号、同发布年龄段、同长度完整日窗口；每篇历史文章最多一份，至少 5 篇，以中位数比较',
    metric, sample_size: sampleSize, minimum_samples: MIN_SAMPLES, median: null, current: metric ? current.metrics[metric] : null, ratio: null, age_band: band });
  if (!days || !Object.keys(current.metrics).length) return insufficient('本期文章每日新增数据未取得，待积累');
  let bestSize = 0, bestMetric = null, normal = null, zeroBaseline = null;
  for (const metric of attentionMetrics(article.platform)) {
    if (current.coverage.metric_days[metric] !== days) continue;
    const cacheKey = JSON.stringify([article.account_id, article.platform, age, days, metric]);
    if (!cache.has(cacheKey)) {
      const samples = [];
      for (const peer of articles) {
        if (peer.account_id !== article.account_id || peer.platform !== article.platform) continue;
        const rows = dailyByArticle.get(peer.id) ?? new Map(), published = beijingDay(Date.parse(peer.published_at));
        const ends = [...rows.keys()].filter(end => end < window.from && publicationAgeBand(distance(published, end)) === band && shift(end, 1 - days) >= published)
          .sort((a, b) => Math.abs(distance(published, a) - age) - Math.abs(distance(published, b) - age) || b.localeCompare(a));
        for (const end of ends) {
          const values = dates(shift(end, 1 - days), end).map(day => rows.get(day)?.metrics[metric]);
          if (values.some(value => value === undefined)) continue;
          const total = {}; for (const value of values) add(total, { [metric]: value });
          samples.push({ article_id: peer.id, value: total[metric] });
          break;
        }
      }
      cache.set(cacheKey, samples);
    }
    const samples = cache.get(cacheKey).filter(sample => sample.article_id !== article.id);
    if (samples.length > bestSize) { bestSize = samples.length; bestMetric = metric; }
    if (samples.length < MIN_SAMPLES) continue;
    const baseline = median(samples.map(sample => sample.value));
    if (baseline <= 0) {
      zeroBaseline ??= { ...insufficient('历史中位数为真实零，无法给出稳定的倍数判断', samples.length, metric), median: 0 };
      continue;
    }
    const value = current.metrics[metric], ratio = value / baseline;
    const kind = ratio >= 2 ? 'up' : ratio <= 0.5 ? 'down' : 'normal';
    const finding = { kind, reason: kind === 'up' ? '本期新增达到历史同龄窗口中位数的 2 倍或以上' : kind === 'down' ? '本期新增不高于历史同龄窗口中位数的一半' : '本期新增处于历史同龄窗口中位数的 0.5 至 2 倍之间',
      baseline: `同账号 ${samples.length} 篇历史文章 · ${band} · 每篇 ${days} 个完整自然日 · ${metric} 中位数 ${baseline}；历史窗口均在本期之前`,
      metric, sample_size: samples.length, minimum_samples: MIN_SAMPLES, median: baseline, current: value, ratio, age_band: band,
      thresholds: { up: 2, down: 0.5 }, method: 'historical_article_window_median' };
    if (kind !== 'normal') return finding;
    normal ??= finding;
  }
  return normal ?? zeroBaseline ?? insufficient(bestSize ? '完整同龄历史样本不足 5 篇，待积累' : '该指标缺日或没有完整同龄历史样本，待积累', bestSize, bestMetric);
}

// Shared pending schedule: numeric future instants avoid formatting invalid far-future dates.
export function pendingReviewEvents(articles, observations) {
  const reviewMap = new Map();
  for (const row of observations) {
    if (!reviewMap.has(row.article_id)) reviewMap.set(row.article_id, []);
    reviewMap.get(row.article_id).push(row);
  }
  const events = [];
  for (const article of articles.filter(isPublishedArticle).map(articleFacts).filter(row => row.date_status === 'recorded'))
    for (const [kind, days] of [['d1', 1], ['d3', 3], ['d7', 7]]) {
      const dueAt = Date.parse(article.published_at) + days * DAY;
      if (!(reviewMap.get(article.id) ?? []).some(row => row.kind === kind && Date.parse(row.as_of) >= dueAt))
        events.push({article, kind, dueAt});
    }
  return events;
}
export function buildDueReviews({articles, observations, now = Date.now()}) {
  return pendingReviewEvents(articles, observations).filter(event => event.dueAt <= Number(now))
    .map(({article, kind, dueAt}) => ({id: article.id, title: article.title, account_id: article.account_id,
      account_name: article.account_name, due_kind: kind, due_at: new Date(dueAt).toISOString()}))
    .sort((a, b) => a.due_at.localeCompare(b.due_at) || a.id.localeCompare(b.id));
}

export function buildOverview({ accounts, articles, daily, observations, period = 'yesterday', now = Date.now() }) {
  const window = overviewWindow(period, now);
  const selectedDays = dates(window.from, window.to), previousDays = dates(window.previous_from, window.previous_to);
  // Inputs are already scoped by records.mjs; retain this join filter so records
  // outside the selected accounts can never enter aggregates or peer baselines.
  const accountIds = new Set(accounts.map(row => row.id));
  articles = articles.filter(row => accountIds.has(row.account_id) && isPublishedArticle(row));
  const articleIds = new Set(articles.map(row => row.id));
  daily = daily.filter(row => accountIds.has(row.account_id) && (row.article_id === null || articleIds.has(row.article_id)) && row.date <= window.to);
  observations = observations.filter(row => articleIds.has(row.article_id));
  const dailyByAccount = new Map(), dailyByArticle = new Map();
  for (const row of daily) {
    const key = JSON.stringify([row.account_id, row.date]);
    if (!dailyByAccount.has(key)) dailyByAccount.set(key, []);
    dailyByAccount.get(key).push(row);
    if (row.article_id !== null) {
      if (!dailyByArticle.has(row.article_id)) dailyByArticle.set(row.article_id, new Map());
      dailyByArticle.get(row.article_id).set(row.date, row);
    }
  }
  const dayFor = (accountId, date) => accountDay(date, dailyByAccount.get(JSON.stringify([accountId, date])) ?? []);
  const trend = selectedDays.map(date => ({ date, accounts: accounts.map(row => ({ account_id: row.id, ...dayFor(row.id, date) })) }));
  const publicationRows=articles.map(articleFacts).filter(a=>a.date_status==='recorded');
  const publication_trend=selectedDays.map(date=>({date,accounts:accounts.map(account=>({account_id:account.id,count:publicationRows.filter(a=>a.account_id===account.id&&beijingDate(a.published_at)===date).length}))}));
  const accountRows = accounts.map(row => {
    const current = sumDays(selectedDays.map(date => dayFor(row.id, date)), selectedDays);
    const previous = sumDays(previousDays.map(date => dayFor(row.id, date)), previousDays);
    markMainCoverage(current, row.platform, window.days);
    markMainCoverage(previous, row.platform, window.days);
    const ownArticles = articles.filter(article => article.account_id === row.id), ownIds = new Set(ownArticles.map(article => article.id));
    return { ...row, article_count: ownArticles.length, period_metrics: current.metrics, coverage: current.coverage,
      previous_metrics: previous.metrics, previous_coverage: previous.coverage, comparisons: compare(current, previous, window.days, true),
      last_updated: latest([...daily.filter(value => value.account_id === row.id && value.date >= window.previous_from).map(value => value.updated_at),
        ...observations.filter(value => ownIds.has(value.article_id)).map(value => value.collected_at), ...ownArticles.map(value => value.updated_at)]) };
  });
  const cache = new Map();
  const attention = publicationRows.filter(article => beijingDay(Date.parse(article.published_at)) <= window.to).map(article => {
    const rows = dailyByArticle.get(article.id) ?? new Map();
    const current = articlePeriod(article, rows, window.from, window.to), previous = articlePeriod(article, rows, window.previous_from, window.previous_to);
    return { ...article, period_metrics: current.metrics, previous_metrics: previous.metrics, coverage: current.coverage, previous_coverage: previous.coverage,
      comparisons: compare(current, previous, window.days), attention: attentionFor(article, current, publicationRows, dailyByArticle, window, cache) };
  });
  const rank = { up: 0, down: 1, normal: 2, insufficient: 3 };
  attention.sort((a, b) => rank[a.attention.kind] - rank[b.attention.kind] || b.published_at.localeCompare(a.published_at) || a.id.localeCompare(b.id));
  const due = buildDueReviews({articles: publicationRows, observations, now});
  const complete = accountRows.filter(row => row.coverage.source === 'account' && row.coverage.days === window.days &&
    row.coverage.missing_metrics.length === 0).map(row => row.id);
  return { window, accounts: accountRows, trend, publication_trend, publication_note:'本站已记录的发布量；日期待核实的记录不计入日期趋势。', attention_articles: attention, due_reviews: due,
    totals: { article_count: articles.length, automatic_count: articles.filter(row => row.production_mode === 'automatic').length,
      unknown_mode_count: articles.filter(row => row.production_mode === 'unknown').length,
      median_duration_seconds: median(articles.map(row => row.duration_seconds).filter(value => value !== null && value !== undefined)) },
    data_status: { last_updated: latest(accountRows.map(row => row.last_updated)), complete_accounts: complete,
      missing_accounts: accounts.filter(row => !complete.includes(row.id)).map(row => row.id) } };
}
