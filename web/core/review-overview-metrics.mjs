import {day, finiteNumber, shiftDay} from './review-data.mjs';
import {enrichArticles, median} from '../../shared/review-analytics.mjs';

// Only explicit instants can establish membership of a rolling 24-hour window.
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !day(value)) return null;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? stamp : null;
}
function average(values, maximum = Infinity) {
  const valid = values.map(finiteNumber).filter(value => value !== null && value >= 0 && value <= maximum);
  return valid.length ? valid.reduce((sum,value) => sum + value,0) / valid.length : null;
}

export function exact24hArticles(data, account) {
  const snapshots = (data.snapshots || []).filter(snapshot => finiteNumber(snapshot.age_hours) === 24);
  return enrichArticles({...data,snapshots},{account});
}

/** Publication cohort in Shanghai time; article metrics use only recorded age=24 snapshots. */
export function reviewOverviewMetrics(data, {account, range = '24h', now = new Date().toISOString()} = {}) {
  const nowMs = instant(now);
  if (nowMs === null) throw new TypeError('now must be an explicit ISO timestamp');
  const today = day(now);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = shiftDay(today,-((weekday + 6) % 7));
  const start = range === 'last' ? shiftDay(monday,-7) : monday;
  const end = range === 'last' ? shiftDay(monday,-1) : today;
  const rows = exact24hArticles(data,account).filter(row => {
    const publishedDay = day(row.published_at);
    const publishedMs = instant(row.published_at);
    if (range === '24h') return publishedMs !== null && publishedMs >= nowMs - 86400000 && publishedMs <= nowMs;
    return Boolean(publishedDay && publishedDay >= start && publishedDay <= end && (range === 'last' || publishedMs === null || publishedMs <= nowMs));
  });
  const hits = rows.filter(row => row.verdict === '爆').length;
  const middle = rows.filter(row => row.verdict === '中').length;
  const flops = rows.filter(row => row.verdict === '扑').length;
  const unknownVerdicts = rows.length > 0 && hits + middle + flops === 0;
  return {count:rows.length,hits:unknownVerdicts ? null : hits,middle:unknownVerdicts ? null : middle,flops:unknownVerdicts ? null : flops,readsMedian:median(rows.map(row => row.reads_24h)),ctrMedian:median(rows.map(row => row.ctr_24h)),
    avgReadSeconds:average(rows.map(row => row.sample24h?.avg_read_seconds)),completion:average(rows.map(row => row.completion_24h),100)};
}
export function reviewDuration(value) {
  const n = finiteNumber(value);
  if (n === null || n < 0) return '—';
  const seconds = Math.round(n);
  return `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2,'0')}秒`;
}
