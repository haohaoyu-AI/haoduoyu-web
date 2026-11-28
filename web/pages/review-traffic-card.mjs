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
const money = value => {
  const n = valid(value);
  return n === null ? '—' : `¥${n.toFixed(2)}`;
};

// 同一组数一起判断：全部不超过 1 时当小数（0.58 = 58%），否则当百分数。不能逐个判断，否则 0.48% 会被读成 48%。
const scaleOf = values => {
  const numbers = values.map(finiteNumber).filter(n => n !== null && n >= 0);
  return numbers.length && numbers.every(n => n <= 1) ? 100 : 1;
};
const pct = (value, scale) => {
  const n = finiteNumber(value);
  if (n === null || n < 0) return null;
  const scaled = n * scale;
  return scaled <= 100 ? scaled : null;
};

/** 流量来源：{名称: 占比} 或 [{name, rate}]，返回按占比从大到小的列表。 */
export function trafficSourceList(value) {
  if (!value || typeof value !== 'object') return [];
  const pairs = Array.isArray(value) ? value.map(item => [item?.name, item?.rate ?? item?.value]) : Object.entries(value);
  const scale = scaleOf(pairs.map(([, rate]) => rate));
  return pairs.map(([name, rate]) => [typeof name === 'string' ? name.trim() : '', pct(rate, scale)])
    .filter(([name, rate]) => name && rate !== null).sort((a, b) => b[1] - a[1]);
}

/**
 * 读者流失曲线：读到全文 x% 时还剩 y% 的人。
 * 接受 [[x, y]]、[{at, remain}]，以及头条原样的 [{read_rate, jump_rate}]（jump_rate 就是还在读的比例）。
 */
export function completionCurvePoints(value) {
  if (!Array.isArray(value)) return [];
  const raw = value.map(item => Array.isArray(item) ? [item[0], item[1]] :
    [item?.at ?? item?.read_rate ?? item?.x, item?.remain ?? item?.jump_rate ?? item?.y]);
  const xScale = scaleOf(raw.map(([x]) => x)), yScale = scaleOf(raw.map(([, y]) => y));
  const points = raw.map(([x, y]) => [pct(x, xScale), pct(y, yScale)])
    .filter(([x, y]) => x !== null && y !== null).sort((a, b) => a[0] - b[0]);
  return points.length >= 2 ? points : [];
}

function remainAt(points, at) {
  let best = null;
  for (const point of points) if (!best || Math.abs(point[0] - at) < Math.abs(best[0] - at)) best = point;
  return best ? best[1] : null;
}

function curveSection(points) {
  if (!points.length) return '';
  const path = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${(100 - y).toFixed(1)}`).join(' ');
  const early = remainAt(points, 10), half = remainAt(points, 50), end = points[points.length - 1][1];
  const facts = [
    early !== null ? `读到 10% 已走 <b>${(100 - early).toFixed(0)}%</b>` : '',
    half !== null ? `读到一半还剩 <b>${half.toFixed(0)}%</b>` : '',
    `读到结尾还剩 <b>${end.toFixed(0)}%</b>`,
  ].filter(Boolean).join('<span aria-hidden="true">·</span>');
  return `<div class="review-traffic-block"><h4>读者在哪里走的</h4>` +
    `<svg class="review-retention" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="读者流失曲线">` +
    `<line x1="50" y1="0" x2="50" y2="100" class="review-retention-mid"/><path d="${path}" class="review-retention-line"/></svg>` +
    `<div class="review-retention-axis"><span>开头</span><span>一半</span><span>结尾</span></div>` +
    `<p class="review-traffic-facts">${facts}</p></div>`;
}

function sourcesSection(list) {
  if (!list.length) return '';
  const top = list.slice(0, 4);
  return `<div class="review-traffic-block"><h4>展现从哪来</h4><ul class="review-source-list">${top.map(([name, rate]) =>
    `<li><span class="review-source-name">${e(name)}</span><svg class="review-source-bar" viewBox="0 0 100 6" preserveAspectRatio="none" ` +
    `aria-hidden="true"><rect class="review-source-track" width="100" height="6" rx="3"/>` +
    `<rect class="review-source-fill" width="${Math.max(1, rate).toFixed(1)}" height="6" rx="3"/></svg>` +
    `<b>${rate.toFixed(1)}%</b></li>`).join('')}</ul></div>`;
}

function shareOf(map, pick) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return null;
  const entries = Object.entries(map).map(([k, v]) => [k, finiteNumber(v)]).filter(([, v]) => v !== null && v >= 0);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (!total) return null;
  return pick(entries, total);
}

/** 读者画像：只取三句话——男性占比、最大年龄段、前三省份。 */
export function audienceFacts(value) {
  if (!value || typeof value !== 'object') return [];
  const age = value.age ?? value.fansage, gender = value.gender ?? value.fansgender, province = value.province ?? value.fansprovince;
  const facts = [];
  const male = shareOf(gender, (entries, total) => {
    const hit = entries.find(([k]) => k === '男' || k === 'male');
    return hit ? hit[1] / total * 100 : null;
  });
  if (male !== null) facts.push(`男性 ${male.toFixed(0)}%`);
  const topAge = shareOf(age, (entries, total) => {
    const [name, v] = [...entries].sort((a, b) => b[1] - a[1])[0];
    return {name, share: v / total * 100};
  });
  if (topAge) {
    const raw = topAge.name.trim();
    const label = raw.startsWith('>') ? `${raw.slice(1)} 岁以上` : raw.startsWith('<') ? `${raw.slice(1)} 岁以下` : `${raw} 岁`;
    facts.push(`${label}最多（${topAge.share.toFixed(0)}%）`);
  }
  const provinces = shareOf(province, entries => [...entries].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k));
  if (provinces?.length) facts.push(`${provinces.join('、')}读者最多`);
  return facts;
}

function audienceSection(facts) {
  if (!facts.length) return '';
  return `<div class="review-traffic-block"><h4>谁在读</h4><p class="review-traffic-facts">${facts.map(e).join('<span aria-hidden="true">·</span>')}</p></div>`;
}

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
  if (valid(snapshot?.revenue) !== null) secondary.push(['收益', money(snapshot.revenue)]);
  const extra = curveSection(completionCurvePoints(snapshot?.completion_curve)) + sourcesSection(trafficSourceList(snapshot?.traffic_sources)) +
    audienceSection(audienceFacts(snapshot?.audience));
  return `<section class="review-traffic-card" aria-label="文章流量数据">${snapshot ? `<div class="review-traffic-date">数据日期 ${e(snapshot.snapshot_date)}</div>` :
    ''}<dl class="review-traffic-primary">${primary.map(([label,value,subLabel,subValue]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd><div ` +
      `class="review-traffic-fan">${e(subLabel)} <span>${e(subValue)}</span></div></div>`).join('')}</dl><dl ` +
        `class="review-traffic-secondary is-${secondary.length}">` +
        `${secondary.map(([label,value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>` +
    (extra ? `<div class="review-traffic-extra">${extra}</div>` : '') + `</section>`;
}
