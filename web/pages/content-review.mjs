import {e} from '../core/dom.mjs';
import {aggregate, articleRows, dailySeries, dailySummary, day, diffRules, finiteNumber, groupPerformance,
  metricDiscrepancies, periodSummary, reviewDateTime} from '../core/review-data.mjs';

export const REVIEW_VIEWS = [['daily','每日复盘'],['three_day','每 3 天复盘'],['weekly','每周复盘'],['articles','文章库'],['playbooks','写作手册']];
const metricLabels = {impressions:'展现',fan_impressions:'粉丝展现',reads:'阅读',fan_reads:'粉丝阅读',ctr:'CTR',completion_rate:'完读率',
  avg_read_seconds:'平均阅读秒数',likes:'点赞',comments:'评论',reposts:'转发',shares:'分享',favorites:'收藏',revenue:'收益',hits:'爆款',flops:'扑街',count:'篇数'};
const ratios = new Set(['ctr','completion_rate']);
const verdicts = new Set(['爆','中','扑']);
export function reviewNumber(value, key = '', partial = false) {
  const n = finiteNumber(value);
  if (n === null) return '未采集';
  const prefix = partial ? (ratios.has(key) ? '部分：' : '≥ ') : '';
  const money = key === 'revenue' ? '¥' : '';
  const digits = ratios.has(key) || key === 'revenue' ? 2 : 1;
  return `${prefix}${money}${n.toLocaleString('zh-CN',{maximumFractionDigits:digits})}${ratios.has(key) ? '%' : ''}`;
}
export function safeReviewUrl(value) {
  try { const url = new URL(String(value)); return ['https:','http:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
}
function inline(text) {
  return String(text).split(/(\[[^\]\n]+\]\([^\)\n]+\)|\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map(part => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = safeReviewUrl(link[2]);
      return href ? `<a href="${e(href)}" target="_blank" rel="noopener noreferrer">${e(link[1])}</a>` : e(link[1]);
    }
    if (part.startsWith('**') && part.endsWith('**')) return `<strong>${e(part.slice(2,-2))}</strong>`;
    if (part.startsWith('`') && part.endsWith('`')) return `<code>${e(part.slice(1,-1))}</code>`;
    return e(part);
  }).join('');
}
// Deliberately small Markdown grammar: raw HTML and arbitrary URL schemes never enter the DOM.
export function renderReviewMarkdown(value) {
  const lines = String(value || '').replace(/\r\n?/g,'\n').split('\n');
  let list = false, code = false, out = '';
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (list) { out += '</ul>'; list = false; }
      out += code ? '</code></pre>' : '<pre><code>';
      code = !code;
      continue;
    }
    if (code) { out += e(line) + '\n'; continue; }
    const item = line.match(/^\s*[-*]\s+(.+)$/);
    if (item) { if (!list) out += '<ul>'; list = true; out += `<li>${inline(item[1])}</li>`; continue; }
    if (list) { out += '</ul>'; list = false; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 5);
      out += `<h${level}>${inline(heading[2])}</h${level}>`;
    } else if (line.trim()) {
      out += /^>\s?/.test(line) ? `<blockquote>${inline(line.replace(/^>\s?/,''))}</blockquote>` : `<p>${inline(line)}</p>`;
    }
  }
  return out + (list ? '</ul>' : '') + (code ? '</code></pre>' : '');
}
const empty = (title, text = '相应资料写入复盘接口后会显示在这里。') =>
  `<div class="review-empty"><strong>${e(title)}</strong><p>${e(text)}</p></div>`;
const panel = (title, body, note = '') =>
  `<section class="review-panel"><div class="review-panel-head"><h2>${e(title)}</h2>${note ? `<span class="review-note">${e(note)}</span>` : ''}</div>${body}</section>`;
const options = (rows, value) => rows.map(([id,label]) =>
  `<option value="${e(id)}"${String(id) === String(value) ? ' selected' : ''}>${e(label)}</option>`).join('');
function external(url, label) {
  const safe = safeReviewUrl(url);
  return safe ? `<a href="${e(safe)}" target="_blank" rel="noopener noreferrer">${e(label)}</a>` : '';
}
function shown(value, key = '', partial = false) {
  if (finiteNumber(value) === null) return '—';
  return reviewNumber(value, key, partial && !ratios.has(key));
}
function delta(value, key = '') {
  if (value && typeof value === 'object') value = value.delta;
  if (value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value) === 0) return '';
  const n = Number(value);
  const mark = n > 0 ? '↑' : n < 0 ? '↓' : '—';
  const tone = n > 0 ? 'positive' : n < 0 ? 'negative' : '';
  const unit = ratios.has(key) ? ' 个百分点' : '';
  const text = `${mark} ${Math.abs(n).toLocaleString('zh-CN',{maximumFractionDigits:2})}${unit}`;
  return `<span class="review-change ${tone}">${text}</span>`;
}
function keyline(items) {
  const cells = items.map(item => {
    const change = item.change === undefined ? '' : delta(item.change, item.key);
    const note = change && item.compare ? `<span class="review-note">${e(item.compare)}</span>` : '';
    const partial = item.partial && ratios.has(item.key) ? '<span class="review-note">部分</span>' : '';
    const text = item.text !== undefined ? item.text : shown(item.value, item.key, item.partial);
    return `<div class="review-key"><span>${e(item.label)}</span><strong>${e(String(text))}</strong>${partial}${change}${note}</div>`;
  }).join('');
  return `<div class="review-keyline">${cells}</div>`;
}
function periodKeys(summary, compare) {
  const current = summary.current, changes = summary.changes;
  return keyline([
    {label:'篇数', value:current.count, change:changes.count, compare},
    {label:'总阅读', value:current.reads, key:'reads', change:changes.reads, compare, partial:current.partial?.reads},
    {label:'平均 CTR', value:current.ctr, key:'ctr', change:changes.ctr, compare, partial:current.partial?.ctr},
    {label:'爆', value:current.hits, change:changes.hits, compare},
    {label:'扑', value:current.flops, change:changes.flops, compare},
  ]);
}
function oneLine(value, limit = 42) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(text);
  return chars.length > limit ? `${chars.slice(0, limit).join('')}…` : text;
}
function lead(report) {
  const text = oneLine(String(report?.summary_md || '').replace(/^#{1,4}\s*/gm, '').replace(/\*\*/g, ''), 72);
  return text ? `<p class="review-lead">${e(text)}</p>` : '';
}
function more(parts) {
  const body = parts.filter(Boolean).join('');
  return body ? `<details class="review-more"><summary>展开更多</summary>${body}</details>` : '';
}
function tag(verdict) {
  const tone = verdict === '爆' ? 'hit' : verdict === '扑' ? 'flop' : '';
  return `<span class="review-tag ${tone}">${e(verdict)}</span>`;
}
function metrics(row, full = false) {
  const snapshot = row.snapshot || {};
  const preferred = ['impressions','reads','ctr','completion_rate','likes','comments','revenue'];
  const keys = (full ? Object.keys(metricLabels) : preferred)
    .filter(key => !['count','hits','flops'].includes(key) && finiteNumber(snapshot[key]) !== null);
  if (!keys.length) return '';
  const cells = keys.map(key => `<div><dt>${metricLabels[key]}</dt><dd>${e(reviewNumber(snapshot[key], key))}</dd></div>`);
  return `<dl class="review-metrics">${cells.join('')}</dl>`;
}
function articleCard(row, full = false) {
  const when = reviewDateTime(row.published_at);
  const verdict = verdicts.has(row.verdict) ? tag(row.verdict) : '';
  const head = `<div class="review-article-head">${when ? `<span class="review-note">${e(when)}</span>` : ''}${verdict}</div>`;
  const title = `<h3><button type="button" class="review-title-button" data-review-article="${e(row.id)}">${e(row.title || '未命名文章')}</button></h3>`;
  const tags = [row.topic_category, row.title_pattern].filter(Boolean)
    .map(item => `<span class="review-tag">${e(item)}</span>`).join('');
  const reason = row.reason ? `<p class="review-reason">${e(row.reason)}</p>` : '';
  const foot = [];
  if (row.snapshot?.snapshot_date) foot.push(`快照 ${e(row.snapshot.snapshot_date)}`);
  const link = external(row.url, '原文');
  if (link) foot.push(link);
  const footHtml = foot.length ? `<div class="review-note">${foot.join(' · ')}</div>` : '';
  return `<article class="review-article-card">${head}${title}${tags ? `<div class="review-tags">${tags}</div>` : ''}${metrics(row, full)}${reason}${footHtml}</article>`;
}
function reportFor(data, type, start, end) {
  return data.reports.find(report => report.period_type === type && report.period_start === start && report.period_end === end)
    || data.reports.find(report => report.period_type === type && report.period_end === end);
}
function findingItem(item, report, data, css) {
  const rule = typeof item === 'string' ? item : item.rule_id;
  const detail = typeof item === 'object' ? item.reason || item.text || item.evidence || '' : '';
  const exists = data.playbooks.some(book => book.rules.some(entry => entry.rule_id === rule));
  const version = e(report.playbook_version || '');
  const label = exists
    ? `<button type="button" class="review-text-button" data-review-rule="${e(rule)}" data-review-version="${version}">${e(rule)}</button>`
    : `<span>${e(rule || '未标注规则')}${rule ? '（手册中未找到）' : ''}</span>`;
  return `<li class="${css}">${label}${detail ? `：${e(detail)}` : ''}</li>`;
}
function findings(report, data) {
  const groups = [['verified','已验证','review-rule-add'],['overturned','已推翻','review-rule-remove']];
  const blocks = groups.map(([key, label, css]) => {
    const items = Array.isArray(report.findings?.[key]) ? report.findings[key] : [];
    if (!items.length) return '';
    return `<div><h3>${label}</h3><ul>${items.map(item => findingItem(item, report, data, css)).join('')}</ul></div>`;
  }).filter(Boolean);
  return blocks.length ? `<div class="review-findings">${blocks.join('')}</div>` : '';
}
function authorMetrics(report, mismatch) {
  const entries = Object.entries(report.metrics || {}).filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (!entries.length) return '';
  const note = mismatch.length ? ' · 与快照计算存在不一致' : '';
  const rows = entries.map(([key, value]) => {
    const text = typeof value === 'object' ? JSON.stringify(value) : value;
    return `<div><dt>${e(metricLabels[key] || key)}</dt><dd>${e(text)}</dd></div>`;
  }).join('');
  const names = mismatch.map(item => item.field || item.key).join('、');
  const warning = mismatch.length ? `<p class="review-warning">不一致字段：${e(names)}</p>` : '';
  return `<details class="review-author-metrics"><summary>报告附带指标${note}</summary><dl class="review-metrics">${rows}</dl>${warning}</details>`;
}
function reportPanel(report, data, computed) {
  if (!report) return '';
  const mismatch = metricDiscrepancies(report, computed).filter(item => item.mismatch);
  const summary = report.summary_md ? `<div class="review-markdown">${renderReviewMarkdown(report.summary_md)}</div>` : '';
  const found = findings(report, data);
  const extra = authorMetrics(report, mismatch);
  if (!summary && !found && !extra) return '';
  return panel('复盘结论', `${summary}${found}${extra}`, report.playbook_version ? `手册 ${report.playbook_version}` : '');
}
const sectionLabels = {keep_topic:'保留选题', drop_topic:'停掉的题', title:'标题', body:'正文', audience:'读者', checklist:'清单'};
function table(headers, rows, caption = '', compact = false) {
  const cls = compact ? 'review-table compact' : 'review-table';
  const cap = caption && !compact ? `<caption>${e(caption)}</caption>` : '';
  const head = headers.map(header => `<th scope="col">${e(header)}</th>`).join('');
  return `<div class="review-table-wrap" tabindex="0" role="region" aria-label="${e(caption || '可横向滚动的数据表')}"><table class="${cls}">${cap}<thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function articleCells(row, dateOnly) {
  const when = dateOnly ? (day(row.published_at) || '—') : (reviewDateTime(row.published_at) || '—');
  const reads = finiteNumber(row.snapshot?.reads);
  const ctr = finiteNumber(row.snapshot?.ctr);
  const reason = oneLine(row.reason);
  const title = `<button type="button" class="review-title-button" data-review-article="${e(row.id)}">${e(row.title || '未命名文章')}</button>`;
  const head = dateOnly ? title : `${title}<span class="review-note">${e(when)}</span>`;
  const dateCell = dateOnly ? `<td>${e(when)}</td>` : '';
  const verdict = verdicts.has(row.verdict) ? tag(row.verdict) : '—';
  const readCell = reads === null ? '<td>—</td>' : `<td>${e(reviewNumber(reads, 'reads'))}</td>`;
  const ctrCell = ctr === null ? '<td>—</td>' : `<td>${e(reviewNumber(ctr, 'ctr'))}</td>`;
  const reasonCell = `<td class="review-reason-cell">${reason ? e(reason) : '—'}</td>`;
  return `<tr><th scope="row">${head}</th>${dateCell}<td>${verdict}</td>${readCell}${ctrCell}${reasonCell}</tr>`;
}
function articleTable(rows, dateOnly = false) {
  if (!rows.length) return empty('本周期暂无文章', '还没有该周期发布的文章。');
  const headers = dateOnly ? ['文章','发布日期','判定','阅读','CTR','原因'] : ['文章','判定','阅读','CTR','原因'];
  return table(headers, rows.map(row => articleCells(row, dateOnly)), '文章、判定与一句话原因', true);
}
function groupRow(group, max) {
  const reads = finiteNumber(group.average_reads);
  const hitRate = finiteNumber(group.hit_rate);
  const bar = reads === null ? '—' : `<svg class="review-bar" viewBox="0 0 160 14" role="img" aria-label="平均阅读 ${e(reads)}"><rect width="${Math.max(0, reads / max * 160).toFixed(2)}" height="14" rx="3"/></svg>`;
  return `<tr><th scope="row">${e(group.name)}</th><td>${e(reviewNumber(group.count))}</td><td>${e(shown(reads))}</td><td>${e(shown(group.ctr, 'ctr'))}</td><td>${e(shown(hitRate, 'ctr'))}</td><td>${bar}</td></tr>`;
}
function groupTable(groups) {
  if (!groups.length) return '';
  const max = Math.max(...groups.map(group => finiteNumber(group.average_reads) || 0), 1);
  return table(['类别','篇数','平均阅读','平均 CTR','爆率','平均阅读比较'], groups.map(group => groupRow(group, max)), '分类表现');
}
function titleTable(groups) {
  const rows = groups.map(group => `<tr><th scope="row">${e(group.name)}</th><td>${e(reviewNumber(group.count))}</td><td>${e(shown(group.ctr, 'ctr'))}</td></tr>`);
  return table(['标题类型','篇数','平均 CTR'], rows, '标题类型', true);
}
function diffMarkup(previous, current) {
  if (!current) return '';
  const diff = diffRules(previous, current);
  const added = diff.added || [], removed = diff.removed || [];
  const note = previous ? `${e(previous.version)} → ${e(current.version)}` : '首个版本，尚无前一版。';
  const same = !added.length && !removed.length ? '<p class="review-note">没有规则变动。</p>' : '';
  const gone = removed.map(rule => `<p class="review-rule-remove">− ${e(rule.rule_id)} · ${e(rule.text)}</p>`).join('');
  const next = added.map(rule => `<p class="review-rule-add">+ ${e(rule.rule_id)} · ${e(rule.text)}</p>`).join('');
  return `<div class="review-diff"><p class="review-note">${note}</p>${same}${gone}${next}</div>`;
}
function versionMeta(playbook) {
  if (!playbook) return '';
  const published = playbook.published_on ? `<span>发布 ${e(playbook.published_on)}</span>` : '';
  const sent = playbook.sent_to_gemini_at ? `<span>Gemini ${e(reviewDateTime(playbook.sent_to_gemini_at))}</span>` : '';
  return `<div class="review-version-meta"><strong>${e(playbook.version)}</strong>${published}${sent}</div>`;
}
function daily(data, vm) {
  const summary = dailySummary(data, vm.date);
  const selected = reportFor(data, 'daily', vm.date, vm.date);
  const recent = summary.recentRows || [];
  const hits = recent.filter(row => row.verdict === '爆');
  const flops = recent.filter(row => row.verdict === '扑');
  return `${periodKeys(summary, '较上一日')}${lead(selected)}${articleTable(summary.rows)}${more([
    hits.length ? panel('近 3 天 · 爆', articleTable(hits)) : '',
    flops.length ? panel('近 3 天 · 扑', articleTable(flops)) : '',
    reportPanel(selected, data, summary.current),
  ])}`;
}
function threeDay(data, vm) {
  const summary = periodSummary(data, {start:vm.start, end:vm.end, periodType:'three_day'});
  const report = reportFor(data, 'three_day', vm.start, vm.end);
  const book = data.playbooks.find(item => item.version === report?.playbook_version);
  const index = data.playbooks.indexOf(book);
  const previous = index >= 0 ? data.playbooks[index + 1] : null;
  const named = field => groupPerformance(summary.rows, field).filter(group => group.name !== '未分类');
  const handbook = book ? panel('本期手册', `${versionMeta(book)}${diffMarkup(previous, book)}`) : '';
  return `${periodKeys(summary, '较前 3 天')}${lead(report)}${articleTable(summary.rows)}${more([
    named('topic_category').length ? panel('分类表现', groupTable(named('topic_category'))) : '',
    named('title_pattern').length ? panel('标题类型', titleTable(named('title_pattern'))) : '',
    handbook,
    reportPanel(report, data, summary.current),
  ])}`;
}
function chartPoint(points, index, key, label, x, y) {
  const n = finiteNumber(points[index][key]);
  if (n === null) return '';
  const cx = x(index).toFixed(2), cy = y(n).toFixed(2);
  const title = `${e(points[index].date || points[index].day)} · ${label} ${e(reviewNumber(n, key))}`;
  return `<circle class="review-point" cx="${cx}" cy="${cy}" r="4" tabindex="0"><title>${title}</title></circle>`;
}
function lineChart(points, books = [], key = 'reads', label = '阅读') {
  const available = points.filter(point => finiteNumber(point[key]) !== null);
  if (!available.length) return '';
  const values = available.map(point => Number(point[key]));
  const max = Math.max(...values, 1), width = 680, height = 180;
  const dated = points.every(point => day(String(point.date || point.day)));
  const first = dated ? Date.parse(points[0].date || points[0].day) : 0;
  const last = dated ? Date.parse(points.at(-1).date || points.at(-1).day) : 0;
  const dateX = date => 48 + (first === last ? width / 2 : (Date.parse(date) - first) / (last - first) * width);
  const x = index => dated ? dateX(points[index].date || points[index].day) : 48 + (points.length <= 1 ? width / 2 : index / (points.length - 1) * width);
  const y = n => 24 + height - Math.max(0, n) / max * height;
  let segments = '', segment = [];
  const flush = () => { if (segment.length) segments += `<polyline class="${key === 'ctr' ? 'review-line-ctr' : 'review-line-reads'}" points="${segment.join(' ')}"/>`; segment = []; };
  const dots = points.map((point, index) => {
    const n = finiteNumber(point[key]);
    if (n === null) { flush(); return ''; }
    const previous = points[index - 1];
    if (dated && index && Date.parse(point.date || point.day) - Date.parse(previous.date || previous.day) > 86400000) flush();
    segment.push(`${x(index).toFixed(2)},${y(n).toFixed(2)}`);
    return chartPoint(points, index, key, label, x, y);
  });
  flush();
  const upgrades = books.map(book => {
    const date = day(String(book.published_on || '')), stamp = Date.parse(date);
    if (!dated || !date || stamp < first || stamp > last) return '';
    const px = dateX(date).toFixed(2);
    return `<g class="review-upgrade"><line x1="${px}" x2="${px}" y1="18" y2="208"/><text x="${px}" y="12" text-anchor="middle">${e(book.version)}</text><title>手册升级 ${e(book.version)} · ${e(date)}</title></g>`;
  }).join('');
  const labels = points.map((point, index) => `<text x="${x(index).toFixed(2)}" y="232" text-anchor="middle">${e(dated ? String(point.date || point.day).slice(5) : String(point.date || point.day))}</text>`).join('');
  return `<div class="review-chart"><svg viewBox="0 0 760 245" role="img" aria-label="${e(label)}逐日趋势，虚线为手册升级"><line class="review-axis" x1="48" x2="728" y1="204" y2="204"/><text x="4" y="29">${e(reviewNumber(max, key))}</text><text x="18" y="207">0</text>${upgrades}${segments}${dots.join('')}${labels}</svg></div>`;
}
function scatter(rows) {
  const points = rows.filter(row => finiteNumber(row.snapshot?.ctr) !== null && finiteNumber(row.snapshot?.completion_rate) !== null);
  if (!points.length) return '';
  const maxX = Math.max(...points.map(row => Number(row.snapshot.ctr)), 1);
  const maxY = Math.max(...points.map(row => Number(row.snapshot.completion_rate)), 1);
  const dots = points.map(row => {
    const cx = (56 + Number(row.snapshot.ctr) / maxX * 650).toFixed(2);
    const cy = (220 - Number(row.snapshot.completion_rate) / maxY * 180).toFixed(2);
    const tone = row.verdict === '爆' ? 'hit' : row.verdict === '扑' ? 'flop' : '';
    const title = `${e(row.title)} · CTR ${e(reviewNumber(row.snapshot.ctr, 'ctr'))} · 完读率 ${e(reviewNumber(row.snapshot.completion_rate, 'completion_rate'))}`;
    return `<circle class="review-scatter ${tone}" cx="${cx}" cy="${cy}" r="6" tabindex="0"><title>${title}</title></circle>`;
  }).join('');
  return `<div class="review-chart"><svg viewBox="0 0 760 270" role="img" aria-label="文章 CTR 与完读率散点图"><line class="review-axis" x1="56" x2="728" y1="220" y2="220"/><line class="review-axis" x1="56" x2="56" y1="26" y2="220"/><text x="9" y="16">完读率</text><text x="674" y="255">CTR →</text><text x="8" y="34">${e(reviewNumber(maxY, 'completion_rate'))}</text><text x="663" y="235">${e(reviewNumber(maxX, 'ctr'))}</text>${dots}</svg></div>`;
}
function weekly(data, vm) {
  const summary = periodSummary(data, {start:vm.start, end:vm.end, periodType:'weekly'});
  const report = reportFor(data, 'weekly', vm.start, vm.end);
  const series = dailySeries(data, {start:vm.start, end:vm.end});
  const reads = lineChart(series, data.playbooks, 'reads', '阅读');
  const ctr = lineChart(series, data.playbooks, 'ctr', 'CTR');
  const points = scatter(summary.rows);
  return `${periodKeys(summary, '较上周')}${lead(report)}${articleTable(summary.rows)}${more([
    reads ? panel('逐日阅读', reads, '虚线：手册升级') : '',
    ctr ? panel('逐日 CTR', ctr) : '',
    points ? panel('CTR × 完读率', points) : '',
    reportPanel(report, data, summary.current),
  ])}`;
}
function libraryRows(data, filters) {
  const all = articleRows(data, {});
  const rows = all.filter(row => {
    const published = day(row.published_at);
    const ranged = !(filters.from || filters.to) || Boolean(published);
    return ranged && (!filters.from || published >= filters.from) && (!filters.to || published <= filters.to)
      && (!filters.verdict || row.verdict === filters.verdict)
      && (!filters.category || row.topic_category === filters.category)
      && (!filters.pattern || row.title_pattern === filters.pattern);
  });
  const sortKey = ['reads','ctr','completion_rate','revenue'].includes(filters.sort) ? filters.sort : 'reads';
  rows.sort((a, b) => {
    const left = finiteNumber(a.snapshot?.[sortKey]), right = finiteNumber(b.snapshot?.[sortKey]);
    if (left === null) return right === null ? String(b.published_at).localeCompare(String(a.published_at)) : 1;
    return right === null ? -1 : right - left;
  });
  return {all, rows, sortKey};
}
function choiceList(rows, field) {
  return [...new Set(rows.map(row => row[field]).filter(Boolean))].sort().map(value => [value, value]);
}
function library(data, vm) {
  const filters = vm.filters || {};
  const {all, rows, sortKey} = libraryRows(data, filters);
  const current = aggregate(rows);
  const categories = choiceList(all, 'topic_category');
  const patterns = choiceList(all, 'title_pattern');
  const category = categories.length ? `<label>类别<select class="input" data-review-filter="category">${options([['','全部'], ...categories], filters.category)}</select></label>` : '';
  const pattern = patterns.length ? `<label>标题类型<select class="input" data-review-filter="pattern">${options([['','全部'], ...patterns], filters.pattern)}</select></label>` : '';
  const sorts = options([['reads','阅读 · 从高到低'],['ctr','CTR · 从高到低'],['completion_rate','完读率 · 从高到低'],['revenue','收益 · 从高到低']], sortKey);
  const controls = `<div class="review-filters"><label>发布日期从<input class="input" type="date" data-review-filter="from" value="${e(filters.from || '')}"></label><label>至<input class="input" type="date" data-review-filter="to" value="${e(filters.to || '')}"></label><label>判定<select class="input" data-review-filter="verdict">${options([['','全部'],['爆','爆'],['中','中'],['扑','扑']], filters.verdict)}</select></label>${category}${pattern}<label>排序<select class="input" data-review-filter="sort">${sorts}</select></label><button class="btn text" type="button" data-review-action="reset-filters">重置筛选</button></div>`;
  const keys = keyline([
    {label:'篇数', value:current.count},
    {label:'总阅读', value:current.reads, key:'reads', partial:current.partial?.reads},
    {label:'平均 CTR', value:current.ctr, key:'ctr', partial:current.partial?.ctr},
    {label:'爆', value:current.hits},
    {label:'扑', value:current.flops},
  ]);
  const list = rows.length ? articleTable(rows, true) : empty(data.articles.length ? '没有符合筛选条件的文章' : '文章库为空', data.articles.length ? '调整日期、类别或判定筛选后重试。' : '尚无内容复盘文章。');
  return `${keys}${controls}${list}`;
}
function objectPairs(value) {
  if (Array.isArray(value)) return value.map((item, index) => typeof item === 'object' && item
    ? [item.name ?? item.label ?? item.source ?? item.position ?? String(index + 1), finiteNumber(item.percent ?? item.value ?? item.count ?? item.rate)]
    : [String(index + 1), finiteNumber(item)]).filter(([, n]) => n !== null);
  if (value && typeof value === 'object') return Object.entries(value).map(([key, item]) => [key, finiteNumber(item)]).filter(([, n]) => n !== null);
  return [];
}
function breakdown(value, label) {
  const pairs = objectPairs(value);
  if (!pairs.length) return '';
  const total = pairs.reduce((sum, [, n]) => sum + n, 0);
  const max = Math.max(...pairs.map(([, n]) => n), 1);
  const rows = pairs.map(([key, n]) => {
    const width = Math.max(0, n / max * 160).toFixed(2);
    const share = total > 0 ? ` ${e((n / total * 100).toFixed(1))}%` : '';
    return `<tr><th scope="row">${e(key)}</th><td>${e(reviewNumber(n))}</td><td><svg class="review-bar" viewBox="0 0 160 14" role="img" aria-label="${e(key)} ${e(n)}"><rect width="${width}" height="14" rx="3"/></svg>${share}</td></tr>`;
  });
  return table([label,'数值','占比'], rows);
}
function audience(value) {
  if (!value || typeof value !== 'object' || !Object.keys(value).length) return '';
  return Object.entries(value).map(([name, item]) => {
    const body = item && typeof item === 'object' ? breakdown(item, name) : (item ? `<p>${e(item)}</p>` : '');
    return body ? `<div><h3>${e(name)}</h3>${body}</div>` : '';
  }).filter(Boolean).join('');
}
function snapshotTable(snapshots) {
  const rows = snapshots.map((snapshot, index) => {
    const reads = finiteNumber(snapshot.reads);
    const previous = finiteNumber(snapshots[index - 1]?.reads);
    const growth = index && reads !== null && previous !== null ? (reads - previous).toLocaleString('zh-CN') : '—';
    const ctr = finiteNumber(snapshot.ctr);
    const readCell = reads === null ? '—' : reviewNumber(reads, 'reads');
    const ctrCell = ctr === null ? '—' : reviewNumber(ctr, 'ctr');
    return `<tr><th scope="row">${e(snapshot.snapshot_date)}</th><td>${e(readCell)}</td><td>${e(ctrCell)}</td><td>${e(growth)}</td></tr>`;
  });
  return table(['快照日','阅读','CTR','阅读增长'], rows, '逐日快照与累计阅读增长', true);
}
function detailMeta(row) {
  const lines = [];
  if (row.sample_title || safeReviewUrl(row.sample_url)) {
    const bits = [row.sample_title ? e(row.sample_title) : '', external(row.sample_url, '样本链接')].filter(Boolean);
    lines.push(`<p>样本：${bits.join(' · ')}</p>`);
  }
  if (finiteNumber(row.image_count) !== null) lines.push(`<p>配图数：${e(reviewNumber(row.image_count))}</p>`);
  if (row.source_chat) {
    const chat = safeReviewUrl(row.source_chat) ? external(row.source_chat, 'Gemini 对话') : e(row.source_chat);
    lines.push(`<p>Gemini 对话：${chat}</p>`);
  }
  if (row.platform_article_id) lines.push(`<p class="review-note">平台文章 ID：${e(row.platform_article_id)}</p>`);
  return lines.length ? `<div class="review-detail-meta">${lines.join('')}</div>` : '';
}
function detailExtras(snapshots, latest) {
  const curve = objectPairs(latest?.completion_curve);
  const chart = curve.length ? lineChart(curve.map(([name, n]) => ({date:String(name), completion_rate:n})), [], 'completion_rate', '完读率') : '';
  const people = audience(latest?.audience);
  return [
    snapshots.length ? panel('逐日快照增长', snapshotTable(snapshots)) : '',
    breakdown(latest?.traffic_sources, '来源') ? panel('流量来源', breakdown(latest?.traffic_sources, '来源')) : '',
    chart ? panel('完读曲线', chart) : '',
    people ? panel('读者画像', people) : '',
  ];
}
function detail(data, vm) {
  const row = articleRows(data, {}).find(item => item.id === vm.article);
  const back = `<button class="btn review-back" data-review-action="close-article" type="button">← 返回${vm.view === 'articles' ? '文章库' : '复盘'}</button>`;
  if (!row) return `${back}${empty('未找到这篇文章', '该链接中的文章可能已被移除，或不属于当前账号。')}`;
  const snapshots = data.snapshots.filter(item => item.article_id === row.id).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  return `${back}${panel('文章详情', articleCard(row, true) + detailMeta(row))}${more(detailExtras(snapshots, snapshots.at(-1)))}`;
}
function ruleTable(rules) {
  if (!rules.length) return '';
  const rows = rules.map(rule => {
    const id = `review-rule-${encodeURIComponent(rule.rule_id)}`;
    const section = sectionLabels[rule.section] || rule.section || '—';
    return `<tr id="${e(id)}" tabindex="-1"><th scope="row">${e(rule.rule_id)}</th><td>${e(section)}</td><td class="review-reason-cell">${e(oneLine(rule.text, 72) || '—')}</td></tr>`;
  });
  return table(['规则','分区','内容'], rows, '手册规则', true);
}
function playbooks(data, vm) {
  if (!data.playbooks.length) return empty('写作手册为空', '新账号还没有发布的手册版本。');
  const book = data.playbooks.find(item => item.version === vm.version) || data.playbooks[0];
  const index = data.playbooks.indexOf(book);
  const previous = data.playbooks.find(item => item.version === vm.compare) || data.playbooks[index + 1];
  const versions = data.playbooks.map(item => [item.version, `${item.version} · ${item.published_on || '日期未提供'}`]);
  const others = data.playbooks.filter(item => item !== book).map(item => [item.version, `${item.version} · ${item.published_on || '日期未提供'}`]);
  const controls = `<div class="review-filters"><label>阅读版本<select class="input" data-review-select="version">${options(versions, book.version)}</select></label><label>比较版本<select class="input" data-review-select="compare">${options([['','选择比较版本'], ...others], previous?.version || '')}</select></label></div>`;
  const keys = keyline([
    {label:'版本', text:String(book.version)},
    {label:'规则', text:String(book.rules.length)},
    {label:'发布', text:book.published_on || '—'},
  ]);
  const gemini = book.sent_to_gemini_at ? `<p class="review-note">Gemini ${e(reviewDateTime(book.sent_to_gemini_at))}</p>` : '';
  const full = book.content_md ? panel('手册全文', `<div class="review-markdown">${renderReviewMarkdown(book.content_md)}</div>`) : '';
  const changelog = book.changelog_md ? panel('版本变更', `<div class="review-markdown">${renderReviewMarkdown(book.changelog_md)}</div>`) : '';
  const list = `<ol class="review-version-list">${data.playbooks.map(item => `<li><button type="button" class="review-text-button" data-review-version="${e(item.version)}">${e(item.version)}</button> · ${e(item.published_on || '—')}</li>`).join('')}</ol>`;
  return `${controls}${keys}${gemini}${ruleTable(book.rules)}${more([full, panel('版本比较', diffMarkup(previous, book)), changelog, panel('全部版本', list)])}`;
}
export function renderContentReview() {
  return '<section id="content-review" class="content-review" aria-label="内容复盘"><p class="review-status" role="status" aria-live="polite">正在读取内容复盘…</p></section>';
}
function viewBody(data, vm) {
  if (vm.article) return detail(data, vm);
  if (vm.view === 'articles') return library(data, vm);
  if (vm.view === 'playbooks') return playbooks(data, vm);
  if (vm.view === 'three_day') return threeDay(data, vm);
  if (vm.view === 'weekly') return weekly(data, vm);
  return daily(data, vm);
}
export function renderContentReviewContent(data, vm) {
  const tabs = REVIEW_VIEWS.map(([id, label]) => `<button type="button" data-review-view="${id}" aria-pressed="${vm.view === id}">${label}</button>`).join('');
  let controls = '';
  if (vm.view === 'daily') controls = `<label>统计日期<input class="input" type="date" data-review-select="date" value="${e(vm.date)}"></label><button class="btn text" data-review-action="latest" type="button">最新日期</button>`;
  else if (['three_day','weekly'].includes(vm.view)) {
    const periods = options(vm.periods.map(period => [`${period.start}|${period.end}`, period.label || `${period.start} 至 ${period.end}`]), `${vm.start}|${vm.end}`);
    controls = `<label>选择周期<select class="input" data-review-select="period">${periods}</select></label>`;
  }
  const header = `<div class="review-toolbar"><div class="review-account"><strong>${e(vm.account)}</strong><span class="review-note">内容复盘 · 阅读工作台</span></div><button class="btn text" type="button" data-review-action="refresh">刷新</button></div><div class="review-tabs" role="group" aria-label="复盘视图">${tabs}</div><div class="review-period">${controls}</div>`;
  if (vm.loading) return header + '<p class="review-status" role="status" aria-live="polite">正在读取内容复盘…</p>';
  if (vm.error) return header + `<div class="review-empty" role="alert"><strong>内容复盘读取失败</strong><p>${e(vm.error)}</p><button class="btn" type="button" data-review-action="refresh">重新读取</button></div>`;
  const isEmpty = !data.articles.length && !data.snapshots.length && !data.reports.length && !data.playbooks.length;
  const body = isEmpty ? empty('尚无内容复盘数据', '当前账号尚未录入文章、快照、复盘报告或手册。接入真实资料后即可阅读，不会自动迁入旧图文台账。') : viewBody(data, vm);
  return `${header}<div class="review-body">${body}</div><p class="review-note review-data-note">按北京时间归日。阅读和 CTR 来自快照，爆 / 扑和原因来自复盘报告。</p>`;
}
