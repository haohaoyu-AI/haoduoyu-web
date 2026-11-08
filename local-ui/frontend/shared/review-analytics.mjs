// Pure review analytics, shared by the API and browser. Dates are Shanghai
// business dates; stored timestamps are never changed by this module.
const array = value => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
const id = value => String(value ?? '');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function parsed(value, fallback) {
  if (typeof value !== 'string') return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
export function finiteNumber(value) {
  if (!['number', 'string'].includes(typeof value) || typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const stamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value ? value : '';
}
const clock = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
function parts(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !calendarDate(match[1]) || +match[2] > 23 || +match[3] > 59 || +match[4] > 59 ||
      match[5] !== 'Z' && (+match[5].slice(1, 3) > 23 || +match[5].slice(4, 6) > 59)) return null;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? Object.fromEntries(clock.formatToParts(stamp).map(part => [part.type, part.value])) : null;
}
export function day(value) {
  if (calendarDate(value)) return value;
  const p = parts(value);
  return p ? calendarDate(`${p.year.padStart(4, '0')}-${p.month}-${p.day}`) : '';
}
export function reviewDateTime(value) {
  if (calendarDate(value)) return value;
  const p = parts(value);
  return p ? `${day(value)} ${p.hour}:${p.minute}` : '';
}
export function shiftDay(value, amount) {
  const date = day(value);
  return date && Number.isInteger(amount) ? new Date(Date.parse(`${date}T00:00:00Z`) + amount * 86400000).toISOString().slice(0, 10) : '';
}
export function median(values = []) {
  const sorted = values.map(finiteNumber).filter(value => value !== null).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length ? sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 : null;
}
const nonnegative = value => { const n = finiteNumber(value); return n !== null && n >= 0 ? n : null; };
const rate = value => { const n = nonnegative(value); return n !== null && n <= 100 ? n : null; };
const validAge = snapshot => { const n = finiteNumber(snapshot.age_hours); return n !== null && Number.isInteger(n) && n >= 12 && n <= 72; };

/** Recorded integer ages only. Ties: lower age, ascending snapshot_date, ascending id.
 * A date-only collection date never supplies an invented age. */
export function select24hSnapshot(snapshots = [], articleId) {
  return array(snapshots).filter(snapshot => snapshot && (articleId === undefined || id(snapshot.article_id) === id(articleId)) && validAge(snapshot))
    .sort((a, b) => Math.abs(Number(a.age_hours) - 24) - Math.abs(Number(b.age_hours) - 24) || Number(a.age_hours) - Number(b.age_hours) ||
      compare(id(a.snapshot_date), id(b.snapshot_date)) || compare(id(a.id), id(b.id)))[0] ?? null;
}
export const selectSample24h = select24hSnapshot;

/** Legacy rules remain candidates on read; no evidence or status is invented. */
export function normalizeRule(rule) {
  return rule && typeof rule === 'object' && !Array.isArray(rule) ? { ...rule, status: rule.status ?? 'candidate' } : null;
}
export function normalizeRules(rules) {
  return array(parsed(rules, [])).map(normalizeRule).filter(Boolean);
}
export function normalizePlaybook(playbook) {
  return { ...playbook, rules: normalizeRules(playbook?.rules ?? playbook?.rules_json) };
}
export function appliedRules(article, playbooks = []) {
  const version = finiteNumber(article?.playbook_version_used);
  const specified = parsed(article?.applied_rule_ids, null);
  if (version === null || !Array.isArray(specified)) return [];
  const playbook = array(playbooks).filter(item => item.account === article.account && finiteNumber(item.version) === version)
    .sort((a, b) => compare(id(a.id), id(b.id)))[0];
  if (!playbook) return [];
  const rules = normalizeRules(playbook.rules ?? playbook.rules_json);
  return rules.filter(rule => specified.includes(rule.rule_id));
}
export function recentArticles(a, b) {
  const dateOrder = compare(day(b.published_at), day(a.published_at));
  if (dateOrder) return dateOrder;
  const aTimed = Boolean(parts(a.published_at)), bTimed = Boolean(parts(b.published_at));
  // Date-only publications sort after explicit times on that day. This is an
  // ordering convention, not an inferred midnight publication timestamp.
  return (aTimed && bTimed ? Date.parse(b.published_at) - Date.parse(a.published_at) : Number(bTimed) - Number(aTimed)) || compare(id(a.id), id(b.id));
}
function quantile(sorted, fraction) { return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null; }

/** Recent30 means the 30 most recently published articles with valid reads_24h,
 * per account. Undated articles sort last, then stable id. Nearest-rank q80/q30:
 * 爆 >q80; 扑 <=q30 and <q80; all other values 中. Boundary ties are never split,
 * and an all-equal cohort is all 中. These are empirical cutoffs, not quotas. */
export function enrichArticles(data = {}, { account } = {}) {
  const articles = array(data.articles).filter(article => article && (account === undefined || article.account === account));
  const rows = articles.map(article => {
    const sample24h = select24hSnapshot(data.snapshots, article.id);
    return { ...article, sample24h, reads_24h: nonnegative(sample24h?.reads), ctr_24h: rate(sample24h?.ctr),
      completion_24h: rate(sample24h?.completion_rate), applied_rules: appliedRules(article, data.playbooks) };
  });
  const cohorts = new Map();
  for (const row of rows) {
    if (!cohorts.has(row.account)) {
      const samples = rows.filter(item => item.account === row.account && item.reads_24h !== null).sort(recentArticles).slice(0, 30);
      const values = samples.map(item => item.reads_24h).sort((a, b) => a - b);
      cohorts.set(row.account, { sample_count: values.length, low: quantile(values, .3), high: quantile(values, .8), sample_ids: samples.map(item => item.id) });
    }
    const cohort = cohorts.get(row.account), reliable = cohort.sample_count >= 10 && row.reads_24h !== null;
    let verdict = null;
    if (row.reads_24h !== null) verdict = reliable ? row.reads_24h > cohort.high ? '爆' : row.reads_24h <= cohort.low && row.reads_24h < cohort.high ? '扑' : '中' : row.reads_24h >= 1000 ? '爆' : row.reads_24h <= 100 ? '扑' : '中';
    Object.assign(row, { verdict, reliable, verdict_reliable: reliable, verdict_basis: { method: cohort.sample_count >= 10 ? 'recent30_quantiles' : 'fixed_thresholds',
      sample_count: cohort.sample_count, sample_ids: cohort.sample_ids, high_threshold: cohort.sample_count >= 10 ? cohort.high : 1000,
      low_threshold: cohort.sample_count >= 10 ? cohort.low : 100, high_inclusive: cohort.sample_count < 10,
      low_inclusive: true, ties: 'never_split', missing_reads: row.reads_24h === null } });
  }
  return rows.sort(recentArticles);
}
export function enrichArticle(article, snapshots = [], playbooks = [], reports = [], articles = [article]) {
  const cohort = [...array(articles).filter(item => id(item.id) !== id(article.id)), article];
  return enrichArticles({ articles: cohort, snapshots, playbooks, reports }).find(item => id(item.id) === id(article.id));
}

export function weekBounds(now = new Date().toISOString(), week = 'this') {
  const today = day(now instanceof Date ? now.toISOString() : now);
  if (!today) throw new TypeError('now must be a valid date or explicit ISO timestamp');
  if (!['this', 'last'].includes(week)) throw new TypeError('week must be this or last');
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const start = shiftDay(today, -(weekday + 6) % 7 - (week === 'last' ? 7 : 0));
  return { today, start, end: shiftDay(start, 6), previousStart: shiftDay(start, -7), previousEnd: shiftDay(start, -1) };
}
export function summarizeArticles(rows = []) {
  const judged = rows.filter(row => nonnegative(row.reads_24h) !== null && ['爆', '中', '扑'].includes(row.verdict));
  const ctrs = rows.map(row => rate(row.ctr_24h)).filter(value => value !== null);
  const hits = judged.filter(row => row.verdict === '爆').length, flops = judged.filter(row => row.verdict === '扑').length;
  return { count: rows.length, published_count: rows.length, hits, flops, judged_count: judged.length,
    hit_rate: judged.length ? hits / judged.length * 100 : null, flop_rate: judged.length ? flops / judged.length * 100 : null,
    miss_rate: judged.length ? flops / judged.length * 100 : null, median_ctr: median(ctrs), ctr_median: median(ctrs),
    ctr_count: ctrs.length, missing_24h_count: rows.filter(row => !row.sample24h).length,
    reliable_count: judged.filter(row => row.reliable).length,
    rate_denominator: 'Articles in this publication week with valid reads_24h and a computed verdict; includes provisional fixed-threshold judgments.' };
}
function summarySentence(current, week) {
  const label = week === 'last' ? '上周' : '本周';
  const judged = current.judged_count;
  return `${label}发布 ${current.count} 篇，${judged ? `可判定 ${judged} 篇，爆款 ${current.hits} 篇、扑街 ${current.flops} 篇` : '暂无有效 24h 阅读样本'}。`;
}
/** Plain first sentence for a text-only display. No markdown is rendered here. */
export function firstSentence(markdown) {
  if (typeof markdown !== 'string') return '';
  const text = markdown.replace(/^\s{0,3}(?:#{1,6}\s+|>\s?)/gm, '').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, '').replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim();
  const ending = /[。！？!?][”’"')）]*|\.(?=\s|$)/.exec(text);
  return ending ? text.slice(0, ending.index + ending[0].length) : text;
}
function weeklyConclusion(reports, account, bounds, week) {
  // Only an exact calendar week is a certain match. An adjacent or multi-week
  // report is never substituted when this week's report does not exist.
  const report = array(reports).filter(item => item?.account === account && item.period_type === 'weekly' &&
    day(item.period_start) === bounds.start && day(item.period_end) === bounds.end)
    .sort((a, b) => compare(id(b.created_at), id(a.created_at)) || compare(id(a.id), id(b.id)))[0];
  return firstSentence(report?.summary_md) || `${week === 'last' ? '上周' : '本周'}尚未生成周报`;
}
export function buildOverview(data = {}, options = {}) {
  const { account, week = 'this', range = '7d', now = new Date().toISOString() } = options;
  if (!['7d', '30d'].includes(range)) throw new TypeError('range must be 7d or 30d');
  const bounds = weekBounds(now, week), allRows = enrichArticles(data, { account });
  const cohort = (start, end) => allRows.filter(row => { const published = day(row.published_at); return published && published >= start && published <= end; });
  const rows = cohort(bounds.start, bounds.end), previousRows = cohort(bounds.previousStart, bounds.previousEnd);
  const current = summarizeArticles(rows), previous = summarizeArticles(previousRows), changes = {};
  for (const field of ['count', 'published_count', 'hits', 'flops', 'hit_rate', 'flop_rate', 'miss_rate', 'median_ctr', 'ctr_median']) {
    changes[field] = { current: current[field], previous: previous[field], delta: current[field] !== null && previous[field] !== null ? current[field] - previous[field] : null,
      unit: ['hit_rate', 'flop_rate', 'miss_rate', 'median_ctr', 'ctr_median'].includes(field) ? 'percentage_points' : 'count' };
  }
  const trendDays = range === '30d' ? 30 : 7;
  const trend = Array.from({ length: trendDays }, (_, index) => {
    const date = shiftDay(bounds.today, index - trendDays + 1), daily = cohort(date, date), result = { date, count: daily.length, published_count: daily.length };
    for (const field of ['reads_24h', 'ctr_24h', 'completion_24h']) {
      const values = daily.map(row => row[field]).filter(value => value !== null);
      result[field] = median(values); result[`${field}_count`] = values.length;
    }
    return { ...result, reads_median: result.reads_24h, ctr_median: result.ctr_24h, completion_median: result.completion_24h };
  });
  const alerts = [];
  if (current.missing_24h_count) alerts.push({ code: 'missing_24h', count: current.missing_24h_count, last_snapshot_date: null, days_since_snapshot: null,
    message: `${current.missing_24h_count} 篇缺少已记录年龄 12–72 小时的快照；24h 指标暂缺。` });
  const articleIds = new Set(allRows.map(row => id(row.id)));
  const dates = array(data.snapshots).filter(snapshot => articleIds.has(id(snapshot.article_id))).map(snapshot => day(snapshot.snapshot_date)).filter(Boolean).sort();
  const latest = dates.at(-1) ?? null;
  const elapsed = latest ? Math.round((Date.parse(`${bounds.today}T00:00:00Z`) - Date.parse(`${latest}T00:00:00Z`)) / 86400000) : null;
  if (allRows.length && (latest === null || elapsed > 2)) alerts.push({ code: 'collection_interruption', count: allRows.length, last_snapshot_date: latest, days_since_snapshot: elapsed,
    message: latest ? `最近快照为 ${latest}，距今 ${elapsed} 个上海日历日，已超过 2 日采集间隔。` : '已有文章但尚无有效日期的采集快照，无法确认采集连续性。' });
  const summary = summarySentence(current, week);
  const conclusion = weeklyConclusion(data.reports, account, bounds, week);
  return { account: account ?? null, week, range, ...bounds, rows, previousRows, current, previous, changes, trend, alerts, summary, conclusion };
}
