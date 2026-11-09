import {day, finiteNumber, shiftDay} from './review-data.mjs';
import {enrichArticles} from '../../shared/review-analytics.mjs';

export const TREND_METRICS = Object.freeze([
  ['average_reads','平均阅读'], ['published_count','已发布篇数'], ['hits','爆款数'],
  ['record_count','发布时间记录数'], ['hit_rate','爆款率'], ['average_ctr','平均点击率'],
  ['average_completion','平均阅读完成率'], ['average_seconds','平均阅读时长'],
]);
const instant = value => typeof value === 'string' && value.includes('T') && day(value) ? Date.parse(value) : null;
const stamp = value => Number.isFinite(instant(value)) ? instant(value) : null;
const number = (value, max = Infinity) => {
  const n = finiteNumber(value);
  return n !== null && n >= 0 && n <= max ? n : null;
};
const statusOf = row => row.publication_status ?? row.publish_status ?? row.status;
const unpublishedStatuses = ['draft','drafting','illustrated','draft_saved','scheduled','pending','failed','unpublished','deleted','retracted'];
const unpublished = row => unpublishedStatuses.includes(statusOf(row));
const confirmed = row => statusOf(row) === 'published';

export function trendBounds({range = '7d', from = '', to = '', now = new Date().toISOString()} = {}) {
  const today = day(now);
  if (!today || stamp(now) === null) throw new TypeError('趋势需要带时区的当前时间。');
  if (!['7d','30d','custom'].includes(range)) throw new TypeError('请选择近 7 天、近 30 天或自定义日期。');
  const start = range === 'custom' ? from : shiftDay(today,range === '30d' ? -29 : -6);
  const end = range === 'custom' ? to : today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || day(start) !== start || !/^\d{4}-\d{2}-\d{2}$/.test(end) || day(end) !== end)
    throw new TypeError('请选择有效的开始日期和结束日期。');
  const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  if (days < 1) throw new TypeError('结束日期不能早于开始日期。');
  if (end > today) throw new TypeError('结束日期不能晚于今天。');
  if (days > 366) throw new TypeError('自定义范围最多 366 天。');
  return {range, start, end, today, days};
}
function summarize(rows) {
  const sample = (key,max) => rows.map(row => number(row.sample24h?.[key],max)).filter(value => value !== null);
  const mean = values => values.length ? values.reduce((sum,value) => sum + value,0) / values.length : null;
  const reads = sample('reads'), ctr = sample('ctr',100), completion = sample('completion_rate',100), seconds = sample('avg_read_seconds');
  const judged = rows.filter(row => row.verdict), hits = judged.filter(row => row.verdict === '爆').length;
  const unknown = rows.filter(row => !confirmed(row)).length;
  const dates = rows.map(row => day(row.sample24h?.snapshot_date)).filter(Boolean).sort();
  const ages = rows.map(row => number(row.sample24h?.age_hours)).filter(value => value !== null);
  return {record_count:rows.length, published_count:unknown ? null : rows.length,
    confirmed_count:rows.length - unknown, unverified_count:unknown,
    average_reads:mean(reads), average_ctr:mean(ctr), average_completion:mean(completion), average_seconds:mean(seconds),
    hits:judged.length || !rows.length ? hits : null, hit_rate:judged.length ? hits / judged.length * 100 : null,
    coverage:{average_reads:reads.length,average_ctr:ctr.length,average_completion:completion.length,
      average_seconds:seconds.length,hits:judged.length,hit_rate:judged.length,published_count:rows.length-unknown,record_count:rows.length},
    provisional_count:rows.filter(row => row.trend_provisional).length,
    unknown_age_count:rows.filter(row => row.trend_unknown_age).length,
    fixed_threshold_count:judged.filter(row => !row.verdict_reliable).length,
    provisional_judged_count:judged.filter(row => row.trend_provisional || !row.verdict_reliable).length,
    unjudged_count:rows.length-judged.length,
    snapshot_start:dates[0] || null,snapshot_end:dates.at(-1) || null,
    min_hours:ages.length ? Math.min(...ages) : null,max_hours:ages.length ? Math.max(...ages) : null};
}

/** Read-only publication-date cohorts, not daily growth or platform publication verification. */
export function reviewTrends(data = {}, options = {}) {
  const {account = 'V字', verdict = '', now = new Date().toISOString()} = options;
  const bounds = trendBounds({...options,now}), nowMs = stamp(now);
  const source = (data.articles || []).filter(row => row.account === account);
  const past = row => day(row.published_at) && day(row.published_at) <= bounds.today &&
    (stamp(row.published_at) === null || stamp(row.published_at) <= nowMs);
  const articles = source.filter(row => !unpublished(row) && past(row));
  const byId = new Map(articles.map(row => [String(row.id),row]));
  const snapshots = (data.snapshots || []).filter(snapshot => {
    const row = byId.get(String(snapshot.article_id)), date = day(snapshot.snapshot_date);
    if (!row || !date || date > bounds.today || date < day(row.published_at)) return false;
    const published = stamp(row.published_at), hours = number(snapshot.age_hours);
    // Age is recorded as whole hours; allow rounding, never a future observation.
    return published === null || hours === null || hours <= (nowMs - published) / 3600000 + 1;
  });
  const rows = enrichArticles({...data,articles,snapshots},{account}).map(row => {
    const published = stamp(row.published_at), age = number(row.sample24h?.age_hours);
    const elapsed = published === null ? null : (nowMs - published) / 3600000;
    return {...row,trend_provisional:elapsed !== null && elapsed < 24 || age !== null && age < 24,
      trend_unknown_age:published === null && age === null && day(row.published_at) >= shiftDay(bounds.today,-1)};
  });
  // Compute empirical verdict thresholds across the account before date/verdict filtering.
  const selected = rows.filter(row => day(row.published_at) >= bounds.start && day(row.published_at) <= bounds.end &&
    (!verdict || row.verdict === verdict));
  const series = Array.from({length:bounds.days},(_,index) => {
    const date = shiftDay(bounds.start,index);
    return {date,...summarize(selected.filter(row => day(row.published_at) === date))};
  });
  return {...bounds,account,verdict,rows:selected,series,summary:summarize(selected),
    excluded:{unpublished:source.filter(unpublished).length,
      undated:source.filter(row => !unpublished(row) && !day(row.published_at)).length,
      future:source.filter(row => !unpublished(row) && day(row.published_at) && !past(row)).length},
    loaded_at:data.loadedAt || null,generated_at:now};
}
