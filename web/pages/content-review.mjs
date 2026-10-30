import {e} from '../core/dom.mjs';
import {articleRows, dailySummary, dailySeries, day, diffRules, finiteNumber, groupPerformance,
  metricDiscrepancies, periodSummary, shiftDay} from '../core/review-data.mjs';

export const REVIEW_VIEWS = [['daily','每日复盘'],['three_day','每 3 天复盘'],['weekly','每周复盘'],['articles','文章库'],['playbooks','写作手册']];
const metricLabels = {impressions:'展现',fan_impressions:'粉丝展现',reads:'阅读',fan_reads:'粉丝阅读',ctr:'CTR',completion_rate:'完读率',
  avg_read_seconds:'平均阅读秒数',likes:'点赞',comments:'评论',reposts:'转发',shares:'分享',favorites:'收藏',revenue:'收益',hits:'爆款',flops:'扑街',count:'篇数'};
const ratios = new Set(['ctr','completion_rate']);
export function reviewNumber(value, key = '', partial = false) {
  const n = finiteNumber(value);
  return n === null ? '未采集' : `${partial ? ratios.has(key) ? '部分：' : '≥ ' : ''}${key === 'revenue' ? '¥' : ''}${n.toLocaleString('zh-CN',{maximumFractionDigits:ratios.has(key) || key === 'revenue' ? 2 : 1})}${ratios.has(key) ? '%' : ''}`;
}
export function safeReviewUrl(value) {
  try { const url = new URL(String(value)); return ['https:','http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
function inline(text) {
  return String(text).split(/(\[[^\]\n]+\]\([^\)\n]+\)|\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map(part => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) { const href = safeReviewUrl(link[2]); return href ? `<a href="${e(href)}" target="_blank" rel="noopener noreferrer">${e(link[1])}</a>` : e(link[1]); }
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
    if (/^\s*```/.test(line)) { if (list) { out += '</ul>'; list = false; } out += code ? '</code></pre>' : '<pre><code>'; code = !code; continue; }
    if (code) { out += e(line) + '\n'; continue; }
    const item = line.match(/^\s*[-*]\s+(.+)$/);
    if (item) { if (!list) out += '<ul>'; list = true; out += `<li>${inline(item[1])}</li>`; continue; }
    if (list) { out += '</ul>'; list = false; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) { const h = Math.min(heading[1].length + 1,5); out += `<h${h}>${inline(heading[2])}</h${h}>`; }
    else if (line.trim()) out += /^>\s?/.test(line) ? `<blockquote>${inline(line.replace(/^>\s?/,''))}</blockquote>` : `<p>${inline(line)}</p>`;
  }
  return out + (list ? '</ul>' : '') + (code ? '</code></pre>' : '');
}
const empty = (title, text = '相应资料写入复盘接口后会显示在这里。') => `<div class="review-empty"><strong>${e(title)}</strong><p>${e(text)}</p></div>`;
const panel = (title, body, note = '') => `<section class="review-panel"><div class="review-panel-head"><h2>${e(title)}</h2>${note ? `<span class="review-note">${e(note)}</span>` : ''}</div>${body}</section>`;
const options = (rows, value) => rows.map(([id,label]) => `<option value="${e(id)}"${String(id) === String(value) ? ' selected' : ''}>${e(label)}</option>`).join('');
function external(url,label) { const safe = safeReviewUrl(url); return safe ? `<a href="${e(safe)}" target="_blank" rel="noopener noreferrer">${e(label)}</a>` : `<span class="review-note">${e(label)}：未提供有效链接</span>`; }
function delta(value, key = '') {
  if (value && typeof value === 'object') value = value.delta;
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '<span class="review-change">无可比数据</span>';
  const n = Number(value); return `<span class="review-change ${n > 0 ? 'positive' : n < 0 ? 'negative' : ''}">${n > 0 ? '↑' : n < 0 ? '↓' : '—'} ${Math.abs(n).toLocaleString('zh-CN',{maximumFractionDigits:2})}${ratios.has(key) ? ' 个百分点' : ''}</span>`;
}
function stats(items) { return `<div class="review-stats">${items.map(item => `<article class="review-stat"><span>${e(item.label)}</span><strong>${e(reviewNumber(item.value,item.key,item.partial))}</strong><div>${delta(item.change,item.key)}<span class="review-note"> ${e(item.compare || '较前一日')}</span></div></article>`).join('')}</div>`; }
function tag(verdict) { return `<span class="review-tag ${verdict === '爆' ? 'hit' : verdict === '扑' ? 'flop' : ''}">${e(verdict || '未判定')}</span>`; }
function metrics(row, full = false) {
  const s = row.snapshot || {};
  const keys = full ? Object.keys(metricLabels).filter(k => !['count','hits','flops'].includes(k)) : ['impressions','reads','ctr','completion_rate','likes','comments','revenue'];
  return `<dl class="review-metrics">${keys.map(key => `<div><dt>${metricLabels[key]}</dt><dd>${e(reviewNumber(s[key],key))}</dd></div>`).join('')}</dl>`;
}
function articleCard(row, full = false) {
  return `<article class="review-article-card"><div class="review-article-head"><span class="review-note">${e(String(row.published_at || '').slice(0,16).replace('T',' '))} · ${e(row.platform || '平台未提供')}</span>${tag(row.verdict)}</div><h3><button type="button" class="review-title-button" data-review-article="${e(row.id)}">${e(row.title || '未命名文章')}</button></h3><div class="review-tags"><span class="review-tag">${e(row.topic_category || '类别未提供')}</span><span class="review-tag">${e(row.title_pattern || '标题类型未提供')}</span></div>${metrics(row,full)}<p class="review-reason">${e(row.reason || '尚无复盘判定原因。')}</p><div class="review-note">${row.snapshot ? `快照 ${e(row.snapshot.snapshot_date)}` : '暂无数据快照'} · ${external(row.url,'原文')}</div></article>`;
}
function cards(rows, full = false) { return rows.length ? `<div class="review-article-grid">${rows.map(row => articleCard(row,full)).join('')}</div>` : empty('本周期暂无文章','还没有该周期发布的文章；不会从旧图文台账迁入数据。'); }
function reportFor(data,type,start,end) { return data.reports.find(r => r.period_type === type && r.period_start === start && r.period_end === end) || data.reports.find(r => r.period_type === type && r.period_end === end); }
function findings(report,data) {
  const groups = [['verified','已验证','review-rule-add'],['overturned','已推翻','review-rule-remove']];
  return `<div class="review-findings">${groups.map(([key,label,css]) => `<div><h3>${label}</h3>${Array.isArray(report.findings?.[key]) && report.findings[key].length ? `<ul>${report.findings[key].map(item => {
    const rule = typeof item === 'string' ? item : item.rule_id;
    const detail = typeof item === 'object' ? item.reason || item.text || item.evidence || '' : '';
    const exists = data.playbooks.some(p => p.rules.some(r => r.rule_id === rule));
    return `<li class="${css}">${exists ? `<button type="button" class="review-text-button" data-review-rule="${e(rule)}" data-review-version="${e(report.playbook_version || '')}">${e(rule)}</button>` : `<span>${e(rule || '未标注规则')}${rule ? '（手册中未找到）' : ''}</span>`}${detail ? `：${e(detail)}` : ''}</li>`;
  }).join('')}</ul>` : '<p class="review-note">本期未记录。</p>'}</div>`).join('')}</div>`;
}
function reportPanel(report,data,computed) {
  if (!report) return panel('复盘结论',empty('本周期还没有复盘报告','快照指标仍按实际采集资料显示；复盘判断由报告提供。'));
  const mismatch = metricDiscrepancies(report,computed).filter(item => item.mismatch);
  const authorMetrics = report.metrics && Object.keys(report.metrics).length ? `<details class="review-author-metrics"><summary>报告附带指标${mismatch.length ? ' · 与快照计算存在不一致' : ''}</summary><p class="review-note">此处为报告作者填写的额外信息，统计卡以快照计算为准。</p><dl class="review-metrics">${Object.entries(report.metrics).map(([k,v]) => `<div><dt>${e(metricLabels[k] || k)}</dt><dd>${e(typeof v === 'object' ? JSON.stringify(v) : v)}</dd></div>`).join('')}</dl>${mismatch.length ? `<p class="review-warning">不一致字段：${e(mismatch.map(x => typeof x === 'string' ? x : x.field || x.key).join('、'))}</p>` : ''}</details>` : '';
  return panel('复盘结论',`<div class="review-markdown">${report.summary_md ? renderReviewMarkdown(report.summary_md) : '<p class="review-note">报告未提供正文。</p>'}</div>${findings(report,data)}${authorMetrics}`,report.playbook_version ? `手册 ${report.playbook_version}` : '未标注手册版本');
}
function daily(data,vm) {
  const summary = dailySummary(data,vm.date), {stats:s,statChanges:c} = summary;
  const selected = reportFor(data,'daily',vm.date,vm.date);
  const recents = summary.recentRows || [];
  return `<p class="review-note review-method">统计日 ${e(vm.date)} · 指标取该日及以前的最新快照；缺失值标记“未采集”，部分采集的合计以 ≥ 标识。昨日指所选日报的统计日。</p>${stats([
    {label:'昨日发文数',value:s.published_count,change:c.published_count},
    {label:'昨日文章总阅读',value:s.total_reads,key:'reads',change:c.total_reads,partial:summary.current.partial?.reads},
    {label:'平均 CTR',value:s.average_ctr,key:'ctr',change:c.average_ctr,partial:summary.current.partial?.ctr},
    {label:'近 3 天爆款',value:s.recent_hits,change:c.recent_hits}
  ])}${panel('昨日文章',cards(summary.rows,true))}<div class="review-two-col">${panel('近 3 天 · 爆',cards(recents.filter(x => x.verdict === '爆')))}${panel('近 3 天 · 扑',cards(recents.filter(x => x.verdict === '扑')))}</div>${reportPanel(selected,data,summary.current)}`;
}
function table(headers,rows,caption = '') {
  return `<div class="review-table-wrap" tabindex="0" role="region" aria-label="${e(caption || '可横向滚动的数据表')}"><table class="review-table">${caption ? `<caption>${e(caption)}</caption>` : ''}<thead><tr>${headers.map(h => `<th scope="col">${e(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function groupTable(groups) {
  if (!groups.length) return empty('暂无分类表现','有带类别与快照的文章后显示分类比较。');
  const max = Math.max(...groups.map(g => finiteNumber(g.average_reads ?? g.avg_reads ?? (g.reads === null ? null : g.reads / g.count)) || 0),1);
  return table(['类别','篇数','平均阅读','平均 CTR','爆率','平均阅读比较'],groups.map(g => {
    const m = g.metrics || g, name = g.name ?? g.label ?? g.key ?? g.value ?? '未分类';
    const reads = finiteNumber(g.average_reads ?? g.avg_reads ?? (m.reads === null ? null : m.reads / m.count));
    const hitRate = finiteNumber(g.hit_rate ?? g.hitRate);
    return `<tr><th scope="row">${e(name)}</th><td>${e(reviewNumber(m.count))}</td><td>${e(reviewNumber(reads))}</td><td>${e(reviewNumber(m.ctr,'ctr'))}</td><td>${e(reviewNumber(hitRate,'ctr'))}</td><td>${reads === null ? '未采集' : `<svg class="review-bar" viewBox="0 0 160 14" role="img" aria-label="平均阅读 ${e(reads)}"><rect width="${Math.max(0,reads / max * 160).toFixed(2)}" height="14" rx="3"/></svg>`}</td></tr>`;
  }),'分类表现');
}
function diffMarkup(previous,current) {
  if (!current) return empty('暂无手册版本');
  const diff = diffRules(previous,current);
  const added = diff.added || [], removed = diff.removed || [];
  return `<div class="review-diff"><p class="review-note">${previous ? `${e(previous.version)} → ${e(current.version)}` : '首个版本，尚无前一版。'}</p>${!added.length && !removed.length ? '<p class="review-note">没有规则变动。</p>' : ''}${removed.map(r => `<p class="review-rule-remove">− ${e(r.rule_id)} · ${e(r.text)}</p>`).join('')}${added.map(r => `<p class="review-rule-add">+ ${e(r.rule_id)} · ${e(r.text)}</p>`).join('')}</div>`;
}
function versionMeta(playbook) {
  return playbook ? `<div class="review-version-meta"><strong>${e(playbook.version)}</strong><span>发布 ${e(playbook.published_on || '未提供')}</span><span>Gemini：${e(playbook.sent_to_gemini_at ? `已发送 ${playbook.sent_to_gemini_at}` : '未记录发送')}</span></div>` : empty('此周期未关联手册','报告提供 playbook_version 后显示对应版本。');
}
function threeDay(data,vm) {
  const s = periodSummary(data,{start:vm.start,end:vm.end,periodType:'three_day'}), report = reportFor(data,'three_day',vm.start,vm.end);
  const book = data.playbooks.find(p => p.version === report?.playbook_version), index = data.playbooks.indexOf(book), previous = index >= 0 ? data.playbooks[index + 1] : null;
  const titles = groupPerformance(s.rows,'title_pattern');
  return `${stats([{label:'本期篇数',value:s.current.count,change:s.changes.count,compare:'较前 3 天'},
    {label:'总阅读',value:s.current.reads,key:'reads',change:s.changes.reads,compare:'较前 3 天',partial:s.current.partial?.reads},
    {label:'平均 CTR',value:s.current.ctr,key:'ctr',change:s.changes.ctr,compare:'较前 3 天',partial:s.current.partial?.ctr},
    {label:'爆款',value:s.current.hits,change:s.changes.hits,compare:'较前 3 天'}])}${panel('本期手册',versionMeta(book) + (book ? diffMarkup(previous,book) : ''))}${panel('分类表现',groupTable(groupPerformance(s.rows,'topic_category')))}${panel('标题类型与 CTR',titles.length ? table(['标题类型','篇数','平均 CTR'],titles.map(g => { const m = g.metrics || g; return `<tr><th scope="row">${e(g.name ?? g.label ?? g.key ?? g.value ?? '未标注')}</th><td>${e(reviewNumber(m.count))}</td><td>${e(reviewNumber(m.ctr,'ctr'))}</td></tr>`; })) : empty('暂无标题类型数据'))}${reportPanel(report,data,s.current)}`;
}
function lineChart(points,books = [],key = 'reads',label = '阅读') {
  const available = points.filter(p => finiteNumber(p[key]) !== null);
  if (!available.length) return empty(`暂无${label}曲线`,'此周期没有可绘制的真实快照。');
  const values = available.map(p => Number(p[key])), max = Math.max(...values,1), width = 680, height = 180;
  const dated = points.every(p => day(String(p.date || p.day)));
  const first = dated ? Date.parse(points[0].date || points[0].day) : 0, last = dated ? Date.parse(points.at(-1).date || points.at(-1).day) : 0;
  const dateX = date => 48 + (first === last ? width / 2 : (Date.parse(date) - first) / (last - first) * width);
  const x = i => dated ? dateX(points[i].date || points[i].day) : 48 + (points.length <= 1 ? width / 2 : i / (points.length - 1) * width);
  const y = n => 24 + height - Math.max(0,n) / max * height;
  let segments = '', segment = [];
  const flush = () => { if (segment.length) segments += `<polyline class="${key === 'ctr' ? 'review-line-ctr' : 'review-line-reads'}" points="${segment.join(' ')}"/>`; segment = []; };
  const dots = points.map((p,i) => { const n = finiteNumber(p[key]); if (n === null) { flush(); return ''; } if (dated && i && Date.parse(p.date || p.day) - Date.parse(points[i - 1].date || points[i - 1].day) > 86400000) flush(); segment.push(`${x(i).toFixed(2)},${y(n).toFixed(2)}`); return `<circle class="review-point" cx="${x(i).toFixed(2)}" cy="${y(n).toFixed(2)}" r="4" tabindex="0"><title>${e(p.date || p.day)} · ${label} ${e(reviewNumber(n,key))}</title></circle>`; }); flush();
  const upgrades = books.map(book => { const d = day(String(book.published_on || '')), stamp = Date.parse(d); if (!dated || !d || stamp < first || stamp > last) return ''; const px = dateX(d).toFixed(2); return `<g class="review-upgrade"><line x1="${px}" x2="${px}" y1="18" y2="208"/><text x="${px}" y="12" text-anchor="middle">${e(book.version)}</text><title>手册升级 ${e(book.version)} · ${e(d)}</title></g>`; }).join('');
  return `<div class="review-chart"><svg viewBox="0 0 760 245" role="img" aria-label="${e(label)}逐日趋势，虚线为手册升级"><line class="review-axis" x1="48" x2="728" y1="204" y2="204"/><text x="4" y="29">${e(reviewNumber(max,key))}</text><text x="18" y="207">0</text>${upgrades}${segments}${dots.join('')}${points.map((p,i) => `<text x="${x(i).toFixed(2)}" y="232" text-anchor="middle">${e(dated ? String(p.date || p.day).slice(5) : String(p.date || p.day))}</text>`).join('')}</svg></div>`;
}
function scatter(rows) {
  const points = rows.filter(r => finiteNumber(r.snapshot?.ctr) !== null && finiteNumber(r.snapshot?.completion_rate) !== null);
  if (!points.length) return empty('暂无 CTR / 完读率散点','需要同一篇文章的 CTR 与完读率同时存在。');
  const maxX = Math.max(...points.map(r => Number(r.snapshot.ctr)),1), maxY = Math.max(...points.map(r => Number(r.snapshot.completion_rate)),1);
  return `<div class="review-chart"><svg viewBox="0 0 760 270" role="img" aria-label="文章 CTR 与完读率散点图"><line class="review-axis" x1="56" x2="728" y1="220" y2="220"/><line class="review-axis" x1="56" x2="56" y1="26" y2="220"/><text x="9" y="16">完读率</text><text x="674" y="255">CTR →</text><text x="8" y="34">${e(reviewNumber(maxY,'completion_rate'))}</text><text x="663" y="235">${e(reviewNumber(maxX,'ctr'))}</text>${points.map(r => `<circle class="review-scatter ${r.verdict === '爆' ? 'hit' : r.verdict === '扑' ? 'flop' : ''}" cx="${(56 + Number(r.snapshot.ctr) / maxX * 650).toFixed(2)}" cy="${(220 - Number(r.snapshot.completion_rate) / maxY * 180).toFixed(2)}" r="6" tabindex="0"><title>${e(r.title)} · CTR ${e(reviewNumber(r.snapshot.ctr,'ctr'))} · 完读率 ${e(reviewNumber(r.snapshot.completion_rate,'completion_rate'))}</title></circle>`).join('')}</svg></div>`;
}
function weekly(data,vm) {
  const s = periodSummary(data,{start:vm.start,end:vm.end,periodType:'weekly'}), report = reportFor(data,'weekly',vm.start,vm.end);
  const series = dailySeries(data,{start:vm.start,end:vm.end}), ranked = s.rows.filter(r => finiteNumber(r.snapshot?.reads) !== null).sort((a,b) => b.snapshot.reads - a.snapshot.reads);
  return `${stats(['impressions','reads','ctr','completion_rate','hits','flops','revenue'].map(key => ({label:metricLabels[key],value:s.current[key],key,change:s.changes[key],compare:'较上周',partial:s.current.partial?.[key]})))}${panel('逐日阅读',lineChart(series,data.playbooks,'reads','阅读'),'虚线：手册升级；断点：该日无快照')}${panel('逐日 CTR',lineChart(series,data.playbooks,'ctr','CTR'))}${panel('CTR × 完读率',scatter(s.rows),'悬停或聚焦圆点查看文章题目')}<div class="review-two-col">${panel('阅读 Top 5',cards(ranked.slice(0,5)))}${panel('阅读 Bottom 5',cards([...ranked].reverse().slice(0,5)))}</div>${reportPanel(report,data,s.current)}`;
}
function library(data,vm) {
  const all = articleRows(data,{}), f = vm.filters || {}, fields = [['category','topic_category','类别'],['pattern','title_pattern','标题类型']];
  let rows = all.filter(r => (!f.from || String(r.published_at || '').slice(0,10) >= f.from) && (!f.to || String(r.published_at || '').slice(0,10) <= f.to) && (!f.verdict || r.verdict === f.verdict) && (!f.category || r.topic_category === f.category) && (!f.pattern || r.title_pattern === f.pattern));
  const sortKey = ['reads','ctr','completion_rate','revenue'].includes(f.sort) ? f.sort : 'reads';
  rows.sort((a,b) => { const x = finiteNumber(a.snapshot?.[sortKey]), y = finiteNumber(b.snapshot?.[sortKey]); return x === null ? y === null ? String(b.published_at).localeCompare(String(a.published_at)) : 1 : y === null ? -1 : y - x; });
  const filters = `<div class="review-filters"><label>发布日期从<input class="input" type="date" data-review-filter="from" value="${e(f.from || '')}"></label><label>至<input class="input" type="date" data-review-filter="to" value="${e(f.to || '')}"></label><label>判定<select class="input" data-review-filter="verdict">${options([['','全部'],['爆','爆'],['中','中'],['扑','扑']],f.verdict)}</select></label>${fields.map(([id,field,label]) => `<label>${label}<select class="input" data-review-filter="${id}">${options([['','全部'],...Array.from(new Set(all.map(r => r[field]).filter(Boolean))).sort().map(x => [x,x])],f[id])}</select></label>`).join('')}<label>排序<select class="input" data-review-filter="sort">${options([['reads','阅读 · 从高到低'],['ctr','CTR · 从高到低'],['completion_rate','完读率 · 从高到低'],['revenue','收益 · 从高到低']],sortKey)}</select></label><button class="btn text" type="button" data-review-action="reset-filters">重置筛选</button></div>`;
  return `${filters}<p class="review-note">共 ${rows.length} 篇 · 指标取每篇文章最新快照 · 未采集值排在末尾</p>${rows.length ? table(['文章','发布日期','判定','类别','标题类型','阅读','CTR','完读率','收益'],rows.map(r => `<tr><th scope="row"><button type="button" class="review-title-button" data-review-article="${e(r.id)}">${e(r.title || '未命名文章')}</button></th><td>${e(String(r.published_at || '').slice(0,10))}</td><td>${tag(r.verdict)}</td><td>${e(r.topic_category || '未提供')}</td><td>${e(r.title_pattern || '未提供')}</td>${['reads','ctr','completion_rate','revenue'].map(k => `<td>${e(reviewNumber(r.snapshot?.[k],k))}</td>`).join('')}</tr>`),'文章库，向右滚动查看全部指标') : empty(data.articles.length ? '没有符合筛选条件的文章' : '文章库为空',data.articles.length ? '调整日期、类别或判定筛选后重试。' : '尚无内容复盘文章；不会显示演示数据或旧台账记录。')}`;
}
function objectPairs(value) {
  if (Array.isArray(value)) return value.map((item,i) => typeof item === 'object' && item ? [item.name ?? item.label ?? item.source ?? item.position ?? String(i + 1),finiteNumber(item.percent ?? item.value ?? item.count ?? item.rate)] : [String(i + 1),finiteNumber(item)]).filter(([,n]) => n !== null);
  if (value && typeof value === 'object') return Object.entries(value).map(([k,v]) => [k,finiteNumber(v)]).filter(([,n]) => n !== null);
  return [];
}
function breakdown(value,label) {
  const pairs = objectPairs(value);
  if (!pairs.length) return empty(`暂无${label}数据`);
  const total = pairs.reduce((s,[,n]) => s + n,0), max = Math.max(...pairs.map(([,n]) => n),1);
  return table([label,'原始数值','占比 / 比较'],pairs.map(([key,n]) => `<tr><th scope="row">${e(key)}</th><td>${e(reviewNumber(n))}</td><td><svg class="review-bar" viewBox="0 0 160 14" role="img" aria-label="${e(key)} ${e(n)}"><rect width="${Math.max(0,n / max * 160).toFixed(2)}" height="14" rx="3"/></svg>${total > 0 ? ` ${e((n / total * 100).toFixed(1))}%` : ''}</td></tr>`));
}
function audience(value) {
  if (!value || typeof value !== 'object' || !Object.keys(value).length) return empty('暂无读者画像');
  return Object.entries(value).map(([name,v]) => `<div><h3>${e(name)}</h3>${v && typeof v === 'object' ? breakdown(v,name) : `<p>${e(v)}</p>`}</div>`).join('');
}
function detail(data,vm) {
  const row = articleRows(data,{}).find(r => r.id === vm.article);
  if (!row) return `<button class="btn review-back" data-review-action="close-article" type="button">← 返回</button>${empty('未找到这篇文章','该链接中的文章可能已被移除，或不属于当前账号。')}`;
  const snapshots = data.snapshots.filter(s => s.article_id === row.id).sort((a,b) => a.snapshot_date.localeCompare(b.snapshot_date)), latest = snapshots.at(-1), curve = objectPairs(latest?.completion_curve);
  const growth = table(['快照日','展现','阅读','阅读增长','CTR','完读率','收益'],snapshots.map((s,i) => { const n = finiteNumber(s.reads), prev = finiteNumber(snapshots[i - 1]?.reads); return `<tr><th scope="row">${e(s.snapshot_date)}</th><td>${e(reviewNumber(s.impressions))}</td><td>${e(reviewNumber(s.reads))}</td><td>${i && n !== null && prev !== null ? e((n - prev).toLocaleString('zh-CN')) : '无可比快照'}</td><td>${e(reviewNumber(s.ctr,'ctr'))}</td><td>${e(reviewNumber(s.completion_rate,'completion_rate'))}</td><td>${e(reviewNumber(s.revenue,'revenue'))}</td></tr>`; }),'逐日快照与累计阅读增长');
  return `<button class="btn review-back" data-review-action="close-article" type="button">← 返回${vm.view === 'articles' ? '文章库' : '复盘'}</button>${panel('文章详情',articleCard(row,true) + `<div class="review-detail-meta"><p>样本：${e(row.sample_title || '未提供')} · ${external(row.sample_url,'样本链接')}</p><p>配图数：${e(reviewNumber(row.image_count))} · ${safeReviewUrl(row.source_chat) ? external(row.source_chat,'Gemini 对话') : `Gemini 对话：${e(row.source_chat || '未提供')}`}</p><p class="review-note">平台文章 ID：${e(row.platform_article_id || '未提供')}</p></div>`)}${panel('逐日快照增长',snapshots.length ? growth : empty('暂无快照'))}${panel('流量来源',breakdown(latest?.traffic_sources,'来源'))}${panel('完读曲线',curve.length ? lineChart(curve.map(([name,n]) => ({date:String(name),completion_rate:n})),[],'completion_rate','完读率') : empty('暂无完读曲线'))}${panel('读者画像',audience(latest?.audience))}`;
}
function playbooks(data,vm) {
  if (!data.playbooks.length) return empty('写作手册为空','新账号还没有发布的手册版本。');
  const book = data.playbooks.find(p => p.version === vm.version) || data.playbooks[0], index = data.playbooks.indexOf(book), previous = data.playbooks.find(p => p.version === vm.compare) || data.playbooks[index + 1];
  const controls = `<div class="review-filters"><label>阅读版本<select class="input" data-review-select="version">${options(data.playbooks.map(p => [p.version,`${p.version} · ${p.published_on || '日期未提供'}`]),book.version)}</select></label><label>比较版本<select class="input" data-review-select="compare">${options([['','选择比较版本'],...data.playbooks.filter(p => p !== book).map(p => [p.version,`${p.version} · ${p.published_on || '日期未提供'}`])],previous?.version || '')}</select></label></div>`;
  const full = `<div class="review-markdown">${renderReviewMarkdown(book.content_md || '') || '<p class="review-note">本版本未提供手册正文。</p>'}</div>${book.rules.length ? `<div class="review-rule-list">${book.rules.map(r => `<article id="review-rule-${e(encodeURIComponent(r.rule_id))}" class="review-rule" tabindex="-1"><span class="review-note">${e(r.section || '')} · ${e(r.rule_id)}</span><p>${e(r.text)}</p></article>`).join('')}</div>` : '<p class="review-note">本版本未提供可引用规则。</p>'}`;
  return `${controls}${panel('版本信息',versionMeta(book))}${panel('规则版本比较',diffMarkup(previous,book))}${panel('写作手册全文',full)}${book.changelog_md ? panel('版本变更说明',`<div class="review-markdown">${renderReviewMarkdown(book.changelog_md)}</div>`) : ''}<details class="review-panel"><summary>全部版本 · 最新在前</summary><ol class="review-version-list">${data.playbooks.map(p => `<li><button type="button" class="review-text-button" data-review-version="${e(p.version)}">${e(p.version)}</button> · ${e(p.published_on || '日期未提供')} · ${e(p.sent_to_gemini_at ? '已发送 Gemini' : '未记录 Gemini 发送')}</li>`).join('')}</ol></details>`;
}
export function renderContentReview() {
  return '<section id="content-review" class="content-review" aria-label="内容复盘"><p class="review-status" role="status" aria-live="polite">正在读取内容复盘…</p></section>';
}
export function renderContentReviewContent(data,vm) {
  const tabs = `<div class="review-tabs" role="group" aria-label="复盘视图">${REVIEW_VIEWS.map(([id,label]) => `<button type="button" data-review-view="${id}" aria-pressed="${vm.view === id}">${label}</button>`).join('')}</div>`;
  let controls = '';
  if (vm.view === 'daily') controls = `<label>统计日期<input class="input" type="date" data-review-select="date" value="${e(vm.date)}"></label><button class="btn text" data-review-action="latest" type="button">最新日期</button>`;
  else if (['three_day','weekly'].includes(vm.view)) controls = `<label>选择周期<select class="input" data-review-select="period">${options(vm.periods.map(p => [`${p.start}|${p.end}`,p.label || `${p.start} 至 ${p.end}`]),`${vm.start}|${vm.end}`)}</select></label>`;
  const header = `<div class="review-toolbar"><div class="review-account"><strong>${e(vm.account)}</strong><span class="review-note">内容复盘 · 阅读工作台</span></div><button class="btn text" type="button" data-review-action="refresh">刷新</button></div>${tabs}<div class="review-period">${controls}</div>`;
  if (vm.loading) return header + '<p class="review-status" role="status" aria-live="polite">正在读取内容复盘…</p>';
  if (vm.error) return header + `<div class="review-empty" role="alert"><strong>内容复盘读取失败</strong><p>${e(vm.error)}</p><button class="btn" type="button" data-review-action="refresh">重新读取</button></div>`;
  const isEmpty = !data.articles.length && !data.snapshots.length && !data.reports.length && !data.playbooks.length;
  const body = isEmpty ? empty('尚无内容复盘数据','当前账号尚未录入文章、快照、复盘报告或手册。接入真实资料后即可阅读，不会自动迁入旧图文台账。') : vm.article ? detail(data,vm) : vm.view === 'articles' ? library(data,vm) : vm.view === 'playbooks' ? playbooks(data,vm) : vm.view === 'three_day' ? threeDay(data,vm) : vm.view === 'weekly' ? weekly(data,vm) : daily(data,vm);
  return `${header}<div class="review-body">${body}</div><p class="review-note review-data-note">所有统计来自当前账号的文章快照；判定与文字结论来自复盘报告。百分比按采集值显示，平均值按已采集文章等权计算。</p>`;
}
