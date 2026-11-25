import {finiteNumber} from './review-data.mjs';
import {reviewDuration} from './review-overview-metrics.mjs';

// Every metric is read from reviewListObservation's one selected snapshot.
export const REVIEW_LIST_METRICS = Object.freeze([
  {key:'reads', label:'阅读'},
  {key:'impressions', label:'展现量'},
  {key:'fan_impressions', label:'粉丝展现量'},
  {key:'fan_reads', label:'粉丝阅读量'},
  {key:'ctr', label:'点击率'},
  {key:'avg_read_seconds', label:'平均阅读时长'},
  {key:'completion_rate', label:'平均阅读完成率'},
]);

/** Format only the selected observation; no cross-snapshot fallback is allowed. */
export function formatReviewListMetric(observation, key) {
  if (!REVIEW_LIST_METRICS.some(metric => metric.key === key)) return '—';
  if (observation?.kind === 'immature' && key === 'reads') return '未满24h';
  const number = finiteNumber(observation?.snapshot?.[key]);
  if (number === null || number < 0) return '—';
  if (key === 'ctr' || key === 'completion_rate') return number <= 100 ? `${number.toFixed(1)}%` : '—';
  if (key === 'avg_read_seconds') return reviewDuration(number);
  return number >= 10000 ? `${(number / 10000).toFixed(1)} 万` : number.toLocaleString('zh-CN',{maximumFractionDigits:1});
}
