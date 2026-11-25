import {e} from '../core/dom.mjs';
import {finiteNumber} from '../core/review-data.mjs';
import {reviewDuration} from '../core/review-overview-metrics.mjs';

const known = value => value !== null && value !== undefined && Number.isFinite(value);
function formatMetric(key, value) {
  if (!known(value)) return '—';
  if (key === 'avgReadSeconds') return reviewDuration(value);
  if (key === 'ctrMedian' || key === 'completion') return `${value.toFixed(1)}%`;
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1)} 万`;
  return value.toLocaleString('zh-CN', {maximumFractionDigits: 1});
}
function linePath(points, x, y) {
  let previous = null, path = '';
  for (const point of points) {
    if (!known(point.value)) { previous = null; continue; }
    const now = `${x(point.index).toFixed(2)},${y(point.value).toFixed(2)}`;
    path += previous ? ` L${now}` : `M${now}`;
    previous = now;
  }
  return path;
}
function metricChart(title, series, keys, labels) {
  const width = 720, height = 150, left = 36, right = 700, top = 14, bottom = 118;
  const rows = keys.map((key, lane) => ({
    key, label: labels[lane],
    points: series.map((day, index) => ({index, date: day.date, value: finiteNumber(day[key])})),
  }));
  const values = rows.flatMap(row => row.points.map(point => point.value)).filter(known);
  if (!values.length) {
    return `<section class="review-cockpit-chart"><h3>${e(title)}</h3>
      <p class="review-trend-empty" role="status">当前范围没有可绘制的有效数据。</p></section>`;
  }
  const max = Math.max(1, ...values), min = Math.min(0, ...values);
  const span = Math.max(max - min, 1);
  const x = index => left + (series.length < 2 ? (right - left) / 2 : index / (series.length - 1) * (right - left));
  const y = value => bottom - (value - min) / span * (bottom - top);
  const marks = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])]
    .filter(index => series[index]).map(index => `<text x="${x(index).toFixed(2)}" y="${bottom + 22}" text-anchor="${
      index === 0 ? 'start' : index === series.length - 1 ? 'end' : 'middle'}">${e(String(series[index].date).slice(5))}</text>`).join('');
  const lines = rows.map((row, lane) => {
    const path = linePath(row.points, x, y);
    return path ? `<path class="review-cockpit-line lane-${lane}" d="${path}" fill="none"/>` : '';
  }).join('');
  const dots = rows.flatMap((row, lane) => row.points.filter(point => known(point.value)).map(point =>
    `<circle class="review-cockpit-dot lane-${lane}" cx="${x(point.index).toFixed(2)}" cy="${y(point.value).toFixed(2)}" r="3">
      <title>${e(point.date)} · ${e(row.label)} ${e(formatMetric(row.key, point.value))}</title></circle>`)).join('');
  const legend = rows.length > 1 ? `<ul class="review-cockpit-legend">${rows.map((row, lane) =>
    `<li><i class="lane-${lane}" aria-hidden="true"></i>${e(row.label)}</li>`).join('')}</ul>` : '';
  return `<section class="review-cockpit-chart"><h3>${e(title)}</h3>${legend}
    <div class="review-chart"><svg viewBox="0 0 ${width} ${bottom + 30}" role="img" aria-label="${e(title)}">
      <line class="review-axis" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/>${lines}${dots}${marks}
    </svg></div></section>`;
}
export function renderCockpitCharts(series = []) {
  if (!Array.isArray(series) || !series.length) return '';
  return `<div class="review-cockpit-charts" aria-label="指标变化">
    ${metricChart('发文数', series, ['count'], ['发文数'])}
    ${metricChart('爆 / 中 / 扑', series, ['hits', 'middle', 'flops'], ['爆', '中', '扑'])}
    ${metricChart('阅读中位数', series, ['readsMedian'], ['阅读中位数'])}
    ${metricChart('CTR 中位数', series, ['ctrMedian'], ['CTR 中位数'])}
    ${metricChart('平均阅读时长', series, ['avgReadSeconds'], ['平均阅读时长'])}
    ${metricChart('平均阅读完成率', series, ['completion'], ['平均阅读完成率'])}
  </div>`;
}
