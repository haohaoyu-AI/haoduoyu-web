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

/** Publication cohort in Shanghai time; samples retain their recorded observation ages. */
export function reviewOverviewMetrics(data, {account, range = '24h', now = new Date().toISOString()} = {}) {
  const nowMs = instant(now);
  if (nowMs === null) throw new TypeError('now must be an explicit ISO timestamp');
  const today = day(now);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = shiftDay(today,-((weekday + 6) % 7));
  const start = range === 'last' ? shiftDay(monday,-7) : monday;
  const end = range === 'last' ? shiftDay(monday,-1) : today;
  const rows = enrichArticles(data,{account}).filter(row => {
    const publishedDay = day(row.published_at);
    const publishedMs = instant(row.published_at);
    if (range === '24h') return publishedMs !== null && publishedMs >= nowMs - 86400000 && publishedMs <= nowMs;
    return Boolean(publishedDay && publishedDay >= start && publishedDay <= end && (range === 'last' || publishedMs === null || publishedMs <= nowMs));
  });
  const hits = rows.filter(row => row.verdict === '爆').length;
  const middle = rows.filter(row => row.verdict === '中').length;
  const flops = rows.filter(row => row.verdict === '扑').length;
  const unknownVerdicts = rows.length > 0 && hits + middle + flops === 0;
  const reads = metricSample(rows,row => row.reads_24h);
  const ctr = metricSample(rows,row => row.ctr_24h,100);
  const seconds = metricSample(rows,row => row.sample24h?.avg_read_seconds);
  const completion = metricSample(rows,row => row.completion_24h,100);
  const judged = metricSample(rows,row => row.verdict ? row.reads_24h : null);
  return {count:rows.length,observedCount:rows.filter(row => row.sample24h).length,hits:unknownVerdicts ? null : hits,middle:unknownVerdicts ? null : middle,
    flops:unknownVerdicts ? null : flops,
    readsMedian:median(reads.values),ctrMedian:median(ctr.values),avgReadSeconds:average(seconds.values),completion:average(completion.values),
    samples:{judged:judged.sample,readsMedian:reads.sample,ctrMedian:ctr.sample,avgReadSeconds:seconds.sample,completion:completion.sample}};
}
export function reviewDuration(value) {
  const n = finiteNumber(value);
  if (n === null || n < 0) return '—';
  const seconds = Math.round(n);
  return `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2,'0')}秒`;
}
