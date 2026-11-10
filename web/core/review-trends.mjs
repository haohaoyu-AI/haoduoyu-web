import {day, finiteNumber, shiftDay} from './review-data.mjs';
import {enrichArticles, median} from '../../shared/review-analytics.mjs';

/** Trailing window, in Beijing days, behind every point of the key curve. */
export const ROLLING_DAYS = 7;
/** A rolling median over fewer articles is noise, so the curve breaks instead. */
export const ROLLING_MIN_SAMPLES = 3;
const DAY_MS = 86400000, BEIJING_OFFSET_MS = 8 * 3600000;
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

export function trendBounds({range = '30d', from = '', to = '', now = new Date().toISOString()} = {}) {
  const today = day(now);
  if (!today || stamp(now) === null) throw new TypeError('趋势需要带时区的当前时间。');
  if (!['7d','30d','custom'].includes(range)) throw new TypeError('请选择近 7 天、近 30 天或自定义日期。');
  const start = range === 'custom' ? from : shiftDay(today,range === '30d' ? -29 : -6);
  const end = range === 'custom' ? to : today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || day(start) !== start || !/^\d{4}-\d{2}-\d{2}$/.test(end) || day(end) !== end)
    throw new TypeError('请选择有效的开始日期和结束日期。');
  const days = (Date.parse(end) - Date.parse(start)) / DAY_MS + 1;
  if (days < 1) throw new TypeError('结束日期不能早于开始日期。');
  if (end > today) throw new TypeError('结束日期不能晚于今天。');
  if (days > 366) throw new TypeError('自定义范围最多 366 天。');
  return {range, start, end, today, days};
}
function summarize(rows) {
  const sample = (key,max) => rows.map(row => number(row.sample24h?.[key],max)).filter(value => value !== null);
  const mean = values => values.length ? values.reduce((sum,value) => sum + value,0) / values.length : null;
  const reads = sample('reads'), ctr = sample('ctr',100), completion = sample('completion_rate',100), seconds = sample('avg_read_seconds');
  const judged = rows.filter(row => row.verdict), verdicts = name => judged.filter(row => row.verdict === name).length;
  const hits = verdicts('爆');
  const unknown = rows.filter(row => !confirmed(row)).length;
  const dates = rows.map(row => day(row.sample24h?.snapshot_date)).filter(Boolean).sort();
  const ages = rows.map(row => number(row.sample24h?.age_hours)).filter(value => value !== null);
  return {record_count:rows.length, published_count:unknown ? null : rows.length,
    confirmed_count:rows.length - unknown, unverified_count:unknown,
    median_reads:median(reads), median_ctr:median(ctr),
    average_reads:mean(reads), average_ctr:mean(ctr), average_completion:mean(completion), average_seconds:mean(seconds),
    hits:judged.length || !rows.length ? hits : null, middles:verdicts('中'), flops:verdicts('扑'),
    hit_rate:judged.length ? hits / judged.length * 100 : null,
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
/** Headline numbers with the equally long period immediately before, when it has records. */
function headline(current,previous) {
  const comparable = previous.record_count > 0;
  const both = key => comparable && current[key] !== null && previous[key] !== null;
  const tile = (key,unit,extra = {}) => ({key,unit,value:current[key],previous:comparable ? previous[key] : null,
    // Reads span orders of magnitude, so their change is relative; rates change in percentage points.
    delta:!both(key) ? null : unit === 'relative' ? previous[key] ? (current[key] - previous[key]) / previous[key] * 100 : null
      : current[key] - previous[key],...extra});
  return [tile('record_count','count'),
    tile('median_reads','relative',{sample:current.coverage.average_reads}),
    tile('hit_rate','points',{hits:current.hits,sample:current.coverage.hits}),
    tile('median_ctr','points',{sample:current.coverage.average_ctr})];
}

/** Read-only publication-date cohorts, not daily growth or platform publication verification.
 * The result is shaped for display: `kpis` (headline numbers against the previous period),
 * `points` (one per article), `series` (one per Beijing day, with the rolling-median key curve)
 * and `thresholds` (the account's hit line). `summary`/`rows`/`excluded` keep the audit detail. */
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
  const rows = enrichArticles({...data,articles,snapshots},{account,baselineData:data}).map(row => {
    const published = stamp(row.published_at), age = number(row.sample24h?.age_hours);
    const elapsed = published === null ? null : (nowMs - published) / 3600000;
    return {...row,trend_provisional:elapsed !== null && elapsed < 24 || age !== null && age < 24,
      trend_unknown_age:published === null && age === null && day(row.published_at) >= shiftDay(bounds.today,-1)};
  });
  // Counts exclude ineligible records, but thresholds retain the list's complete account baseline.
  const pool = rows.filter(row => !verdict || row.verdict === verdict);
  const between = (start,end) => pool.filter(row => day(row.published_at) >= start && day(row.published_at) <= end);
  const selected = between(bounds.start,bounds.end);
  const previous = {start:shiftDay(bounds.start,-bounds.days),end:shiftDay(bounds.start,-1)};
  const rolling = (date,key) => {
    const values = between(shiftDay(date,1 - ROLLING_DAYS),date).map(row => row[key]).filter(value => value !== null);
    return values.length >= ROLLING_MIN_SAMPLES ? median(values) : null;
  };
  // Plot from the first day that has a record, so a young account is not drawn as mostly empty space.
  const first = selected.map(row => day(row.published_at)).sort()[0];
  const plot = {start:first || bounds.start,end:bounds.end};
  const startMs = Date.parse(`${plot.start}T00:00:00Z`);
  plot.days = (Date.parse(`${plot.end}T00:00:00Z`) - startMs) / DAY_MS + 1;
  const series = Array.from({length:bounds.days},(_,index) => {
    const date = shiftDay(bounds.start,index);
    // The window reaches back before the range, so the curve already has history on day one.
    // Days before the plot have no position and are listed in the table only.
    return {date,position:date < plot.start ? null : ((Date.parse(`${date}T00:00:00Z`) - startMs) / DAY_MS + .5) / plot.days,
      ...summarize(between(date,date)),
      rolling_reads:rolling(date,'reads_24h'),rolling_ctr:rolling(date,'ctr_24h')};
  });
  const points = selected.map(row => {
    const date = day(row.published_at), published = stamp(row.published_at);
    // A date-only record sits mid-day; this is a drawing position, never an inferred time.
    const position = published === null ? ((Date.parse(`${date}T00:00:00Z`) - startMs) / DAY_MS + .5) / plot.days
      : (published + BEIJING_OFFSET_MS - startMs) / (plot.days * DAY_MS);
    return {id:row.id,title:row.title || '',date,published_at:row.published_at,timed:published !== null,
      position:Math.min(1,Math.max(0,position)),reads:row.reads_24h,ctr:row.ctr_24h,verdict:row.verdict,
      provisional:row.trend_provisional || row.trend_unknown_age};
  }).sort((a,b) => a.position - b.position);
  const basis = rows[0]?.verdict_basis;
  const summary = summarize(selected);
  return {...bounds,account,verdict,previous,plot,kpis:headline(summary,summarize(between(previous.start,previous.end))),
    points,series,top:points.filter(point => point.reads !== null).sort((a,b) => b.reads - a.reads)[0] || null,
    thresholds:basis ? {hit:basis.high_threshold,flop:basis.low_threshold,method:basis.method,sample_count:basis.sample_count} : null,
    rolling:{days:ROLLING_DAYS,min_samples:ROLLING_MIN_SAMPLES},rows:selected,summary,
    excluded:{unpublished:source.filter(unpublished).length,
      undated:source.filter(row => !unpublished(row) && !day(row.published_at)).length,
      future:source.filter(row => !unpublished(row) && day(row.published_at) && !past(row)).length},
    loaded_at:data.loadedAt || null,generated_at:now};
}
