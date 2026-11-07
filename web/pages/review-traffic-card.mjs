import {e} from '../core/dom.mjs';
import {finiteNumber, latestSnapshots} from '../core/review-data.mjs';

const valid = (value, max = Infinity) => {
  const n = finiteNumber(value);
  return n !== null && n >= 0 && n <= max ? n : null;
};
const count = value => {
  const n = valid(value);
  return n === null ? '—' : n.toLocaleString('zh-CN', {maximumFractionDigits: 1});
};
const percent = value => {
  const n = valid(value, 100);
  return n === null ? '—' : `${n.toFixed(1)}%`;
};
const duration = value => {
  const n = valid(value);
  if (n === null) return '—';
  const seconds = Math.round(n);
  return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
};

/** Render values from one recorded snapshot, never mixing observation dates. */
export function renderTrafficCard(snapshots, articleId) {
  const matching = (Array.isArray(snapshots) ? snapshots : []).filter(s => String(s?.article_id) === String(articleId));
  const snapshot = latestSnapshots(matching).get(String(articleId));
  const primary = [
    ['展现量', count(snapshot?.impressions), '粉丝展现量', count(snapshot?.fan_impressions)],
    ['阅读量', count(snapshot?.reads), '粉丝阅读量', count(snapshot?.fan_reads)],
  ];
  const secondary = [
    ['点击率', percent(snapshot?.ctr)],
    ['平均阅读完成率', percent(snapshot?.completion_rate)],
    ['平均阅读时长', duration(snapshot?.avg_read_seconds)],
  ];
  return `<section class="review-traffic-card" aria-label="文章流量数据">${snapshot ? `<div class="review-traffic-date">数据日期 ${e(snapshot.snapshot_date)}</div>` : ''}<dl class="review-traffic-primary">${primary.map(([label,value,subLabel,subValue]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd><div class="review-traffic-fan">${e(subLabel)} <span>${e(subValue)}</span></div></div>`).join('')}</dl><dl class="review-traffic-secondary">${secondary.map(([label,value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl></section>`;
}
