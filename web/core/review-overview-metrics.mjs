import {day, finiteNumber, shiftDay} from './review-data.mjs';
import {enrichArticles, median} from '../../shared/review-analytics.mjs';

// Only explicit instants can establish membership of a rolling 24-hour window.
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !day(value)) return null;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? stamp : null;
}
function metricSample(rows, valueOf, maximum = Infinity) {
  const entries = rows.map(row => ({value:finiteNumber(valueOf(row)), hours:finiteNumber(row.sample24h?.age_hours)}))
    .filter(({value,hours}) => value !== null && value >= 0 && value <= maximum && hours !== null);
  const hours = entries.map(entry => entry.hours);
  return {values:entries.map(entry => entry.value), sample:{count:entries.length,
    minHours:hours.length ? Math.min(...hours) : null, maxHours:hours.length ? Math.max(...hours) : null}};
}
function average(values) {
  return values.length ? values.reduce((sum,value) => sum + value,0) / values.length : null;
}
function mondayOf(today) {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return shiftDay(today,-((weekday + 6) % 7));
}
function metricWindow(range, today) {
  const monday = mondayOf(today);
  if (range === '24h') return {rolling:true};
  if (range === '30d') return {start:shiftDay(today,-29), end:today, label:'较前30天',
    previous:{start:shiftDay(today,-59), end:shiftDay(today,-30), closed:true}};
  if (range === 'last') return {start:shiftDay(monday,-7), end:shiftDay(monday,-1), closed:true, label:'较上上周',
    previous:{start:shiftDay(monday,-14), end:shiftDay(monday,-8), closed:true}};
  return {start:monday, end:today, label:'较上周', previous:{start:shiftDay(monday,-7), end:shiftDay(monday,-1), closed:true}};
}
function publishedIn(row, bounds, nowMs) {
  const publishedDay = day(row.published_at);
  const publishedMs = instant(row.published_at);
  if (bounds.rolling) return publishedMs !== null && publishedMs >= nowMs - 86400000 && publishedMs <= nowMs;
  return Boolean(publishedDay && publishedDay >= bounds.start && publishedDay <= bounds.end &&
    (bounds.closed || publishedMs === null || publishedMs <= nowMs));
}
function summarize(rows) {
  const hits = rows.filter(row => row.verdict === '爆').length;
  const middle = rows.filter(row => row.verdict === '中').length;
  const flops = rows.filter(row => row.verdict === '扑').length;
  const unknownVerdicts = rows.length > 0 && hits + middle + flops === 0;
  const reads = metricSample(rows,row => row.reads_24h);
  const ctr = metricSample(rows,row => row.ctr_24h,100);
  const seconds = metricSample(rows,row => row.sample24h?.avg_read_seconds);
  const completion = metricSample(rows,row => row.completion_24h,100);
  const judged = metricSample(rows,row => row.verdict ? row.reads_24h : null);
  return {count:rows.length,observedCount:rows.filter(row => row.sample24h).length,hits:unknownVerdicts ? null : hits,
    middle:unknownVerdicts ? null : middle,flops:unknownVerdicts ? null : flops,readsMedian:median(reads.values),
    ctrMedian:median(ctr.values),avgReadSeconds:average(seconds.values),completion:average(completion.values),
    samples:{judged:judged.sample,readsMedian:reads.sample,ctrMedian:ctr.sample,avgReadSeconds:seconds.sample,completion:completion.sample}};
}
export function metricDelta(current, previous) {
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (current === previous) return 0;
  if (previous === 0) return null;
  const rounded = Math.round((current - previous) / Math.abs(previous) * 100);
  return Number.isFinite(rounded) ? rounded : null;
}

function dailySeries(rows, bounds, nowMs) {
  if (!bounds.start || !bounds.end) return [];
  const days = [];
  for (let date = bounds.start; date <= bounds.end; date = shiftDay(date, 1)) {
    const dayRows = rows.filter(row => publishedIn(row, {start:date, end:date, closed:true}, nowMs));
    days.push({date, ...summarize(dayRows)});
  }
  return days;
}

/** Publication cohort in Shanghai time; samples retain their recorded observation ages. */
export function reviewOverviewMetrics(data, {account, range = '24h', now = new Date().toISOString()} = {}) {
  const nowMs = instant(now);
  if (nowMs === null) throw new TypeError('now must be an explicit ISO timestamp');
  const bounds = metricWindow(range, day(now));
  const rows = enrichArticles(data,{account});
  const current = summarize(rows.filter(row => publishedIn(row, bounds, nowMs)));
  if (!bounds.previous) return current;
  const previous = summarize(rows.filter(row => publishedIn(row, bounds.previous, nowMs)));
  return {...current, previous, comparisonLabel:bounds.label, window:{start:bounds.start, end:bounds.end},
    series:dailySeries(rows, bounds, nowMs)};
}
export function reviewDuration(value) {
  const n = finiteNumber(value);
  if (n === null || n < 0) return '—';
  const seconds = Math.round(n);
  return `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2,'0')}秒`;
}
