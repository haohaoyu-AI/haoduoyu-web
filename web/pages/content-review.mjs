import {e} from '../core/dom.mjs';
import {day, finiteNumber, parseJson, reviewDateTime, shiftDay} from '../core/review-data.mjs';
import {buildOverview, enrichArticles, recentArticles} from '../../shared/review-analytics.mjs';

export const REVIEW_VIEWS = [['overview','总览'],['articles','文章库'],['playbook','手册']];
const percentageKeys = new Set(['ctr','completion_rate','ctr_24h','completion_24h','hit_rate','flop_rate','median_ctr']);
export function reviewNumber(value,key = '') {
  const n = finiteNumber(value);
  if (n === null) return '—';
  if (percentageKeys.has(key)) return `${n.toFixed(1)}%`;
  return Math.abs(n) >= 10000 ? `${(n / 10000).toFixed(1)} 万` : n.toLocaleString('zh-CN',{maximumFractionDigits:1});
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
    if (item) { if (!list) { out += '<ul>'; list = true; } out += `<li>${inline(item[1])}</li>`; continue; }
    if (list) { out += '</ul>'; list = false; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) { const h = Math.min(heading[1].length + 1,5); out += `<h${h}>${inline(heading[2])}</h${h}>`; }
    else if (line.trim()) out += /^>\s?/.test(line) ? `<blockquote>${inline(line.replace(/^>\s?/,''))}</blockquote>` : `<p>${inline(line)}</p>`;
  }
  return out + (list ? '</ul>' : '') + (code ? '</code></pre>' : '');
}
const empty = (title,text = '') => `<div class="review-empty"><strong>${e(title)}</strong>${text ? `<p>${e(text)}</p>` : ''}</div>`;
const panel = (title,body,note = '',css = '') => `<section class="review-panel ${css}"><div class="review-panel-head"><h2>${e(title)}</h2>${note ? `<span class="review-note">${e(note)}</span>` : ''}</div>${body}</section>`;
const options = (rows,value) => rows.map(([id,label]) => `<option value="${e(id)}"${String(id) === String(value) ? ' selected' : ''}>${e(label)}</option>`).join('');
const firstSentence = value => String(value || '').replace(/^#+\s*/gm,'').trim().match(/^[\s\S]*?[。！？!?](?:[”」』])?|^[^\n]+/)?.[0] || '';
function external(url,label) { const safe = safeReviewUrl(url); return safe ? `<a href="${e(safe)}" target="_blank" rel="noopener noreferrer">${e(label)}</a>` : '<span class="review-note">未提供原文链接</span>'; }
function tag(verdict,reliable = true) { return `<span class="review-tag ${verdict === '爆' ? 'hit' : verdict === '扑' ? 'flop' : verdict === '中' ? 'middle' : 'unjudged'}">${e(verdict || '待判定')}</span>${verdict && !reliable ? '<span class="review-sample-icon" tabindex="0" role="img" aria-label="近期可比样本不足，当前判定仅供参考" title="近期可比样本不足，当前判定仅供参考">ⓘ</span>' : ''}`; }
function delta(value,key) {
  const n = finiteNumber(typeof value === 'object' && value ? value.delta : value);
  return n === null ? '<span class="review-change">较前一周 —</span>' : `<span class="review-change">较前一周 ${n > 0 ? '+' : n < 0 ? '−' : ''}${e(percentageKeys.has(key) ? Math.abs(n).toFixed(1) : reviewNumber(Math.abs(n)))}${percentageKeys.has(key) ? ' 个百分点' : ''}</span>`;
}
function chart(points,{small = false} = {}) {
  if (!points.some(p => finiteNumber(p.ctr_24h) !== null || finiteNumber(p.reads_24h) !== null)) return empty('暂无趋势数据','采集后显示阅读与 CTR 中位数。');
  const width = 720, height = small ? 120 : 180, left = 28, right = 692, top = 18, bottom = top + height;
  const x = i => left + (points.length < 2 ? (right-left)/2 : i / (points.length-1) * (right-left));
  const max = key => Math.max(1,...points.map(p => finiteNumber(p[key]) ?? 0));
  let lines = '', dots = '';
  for (const [key,css,label] of [['reads_24h','reads','阅读'],['ctr_24h','ctr','CTR']]) {
    let segment = [];
    const flush = () => { if (segment.length) lines += `<polyline class="review-line-${css}" points="${segment.join(' ')}"/>`; segment = []; };
    points.forEach((p,i) => {
      const n = finiteNumber(p[key]); if (n === null) { flush(); return; }
      const px = x(i).toFixed(2), py = (bottom - n / max(key) * height).toFixed(2);
      segment.push(`${px},${py}`);
      dots += `<circle class="review-point review-point-${css}" cx="${px}" cy="${py}" r="3" tabindex="0"><title>${e(p.date)} · ${label} ${e(reviewNumber(n,key))} · 当日 ${e(p.count ?? 0)} 篇</title></circle>`;
    }); flush();
  }
  const labels = [...new Set([0,Math.floor((points.length-1)/2),points.length-1])].map(i => `<text x="${x(i).toFixed(2)}" y="${bottom+24}" text-anchor="${i === 0 ? 'start' : i === points.length-1 ? 'end' : 'middle'}">${e(String(points[i].date).slice(5))}</text>`).join('');
  const bandWidth = (right-left) / Math.max(points.length-1,1);
  const hover = small ? '' : points.map((p,i) => `<rect class="review-hover-band" x="${Math.max(left,x(i)-bandWidth/2).toFixed(2)}" y="${top}" width="${(i === 0 || i === points.length-1 ? bandWidth/2 : bandWidth).toFixed(2)}" height="${height}" tabindex="0"><title>${e(p.date)} · 当日 ${e(p.count ?? 0)} 篇 · 阅读中位数 ${e(reviewNumber(p.reads_24h))} · CTR 中位数 ${e(reviewNumber(p.ctr_24h,'ctr'))}</title></rect>`).join('');
  return `<div class="review-chart"><div class="review-chart-legend"><span class="reads">${small ? '阅读' : '阅读中位数'}</span><span class="ctr">${small ? 'CTR' : 'CTR 中位数'}</span>${small ? '' : '<span class="review-note">独立纵轴 · 悬停或聚焦查看当日篇数</span>'}</div><svg viewBox="0 0 ${width} ${bottom+36}" role="img" aria-label="阅读和 CTR 趋势，两条线分别按各自纵轴绘制"><line class="review-axis" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/>${lines}${dots}${hover}${labels}</svg><div class="review-chart-scale"><span>阅读轴 0 – ${e(reviewNumber(max('reads_24h')))}</span><span>CTR 轴 0 – ${e(reviewNumber(max('ctr_24h'),'ctr'))}</span></div></div>`;
}
function sampleFor(row,data) {
  const reference = (data.benchmarkArticles || []).find(item => String(item.id) === String(row.reference_article_id));
  return reference ? {title:reference.title, url:reference.url, reads:reference.reads} :
    row.sample_title || row.sample_url ? {title:row.sample_title || '参考爆文',url:row.sample_url,reads:null} : null;
}
function sampleLabel(row,data) {
  const sample = sampleFor(row,data);
  if (!sample) return '';
  const label = `仿：${sample.title || '参考爆文'}${sample.reads == null ? '' : `（阅读 ${reviewNumber(sample.reads)}）`}`;
  const href = safeReviewUrl(sample.url);
  return `<span class="review-reference">${href ? `<a href="${e(href)}" target="_blank" rel="noopener noreferrer">${e(label)}</a>` : e(label)}</span>`;
}
function articleReason(row,data,account) {
  return (data.reports || []).filter(report => report.account === account)
    .map(report => report.verdicts?.[row.id]).filter(Boolean).map(v => typeof v === 'object' ? v.reason : '').find(Boolean) || '';
}
function reasonPreview(value) {
  const chars = Array.from(firstSentence(value));
  return chars.length > 40 ? `${chars.slice(0,40).join('')}…` : chars.join('');
}
function healthRows(data,account) {
  return (data.accountHealth || []).filter(row => row.account === account).sort((a,b) => String(b.observed_on || '').localeCompare(String(
a.observed_on || '')) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')) || String(b.id || '').localeCompare(String(a.id || '')));
}
function healthLabel(row) { return ({normal:'正常','限流':'限流','降权':'降权','封禁':'封禁'})[row?.judgement] || '未记录'; }
function collapsed(title,body,id = '') { return `<details class="review-panel review-extra"${id ? ` id="${e(id)}"` : ''}><summary>${e(
title)}</summary>${body}</details>`; }
export const REVIEW_SECTIONS = [['accounts','对标号'],['benchmarks','爆文库'],['notes','笔记'],['playbook','规则与手册'],['trend','趋势'],['attention','需要关注']];
function legacyDaily(data) {
  const reports = (data.reports || []).filter(r => r.period_type === 'daily').sort((a,b) => String(b.period_end || '').localeCompare(String(a.period_end || '')) || String(b.id || '').localeCompare(String(a.id || '')));
  if (!reports.length) return '';
  return '<section class="review-legacy"><h3>历史日报 · 只读</h3>' + reports.map(report => {
    const numbers = Object.entries(report.metrics || {}).filter(([key,value]) => !['notes_md','benchmark_accounts','account_health'].includes(key) && finiteNumber(value) !== null);
    return `<details class="review-extra-item"><summary>${e(day(report.period_end) || '日期未提供')}</summary>${report.summary_md ? `<div class="review-markdown">${renderReviewMarkdown(report.summary_md)}</div>` : ''}${numbers.length ? `<dl class="review-legacy-metrics">${numbers.map(([key,value]) => `<div><dt>${e(key)}</dt><dd>${e(reviewNumber(value,key))}</dd></div>`).join('')}</dl>` : ''}</details>`;
  }).join('') + '</section>';
}
function noteTone(kind) { return ({insight:0,decision:1,diagnosis:2,account_health:3})[kind] ?? 0; }
function archives(data,vm,summary,trend,alerts) {
  const accounts = data.benchmarkAccounts || [], articles = data.benchmarkArticles || [], notes = [...(data.notes || [])].sort((a,b) => String(b.note_date || '').localeCompare(String(a.note_date || '')) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')) || String(b.id || '').localeCompare(String(a.id || ''))), health = healthRows(data,vm.account);
  const accountCards = accounts.map(a => `<article class="review-extra-item"><strong>${e(a.name || '未命名')}</strong> ${external(a.profile_url,'主页 ↗')}<p>${e([a.platform,a.fans == null ? '' : `粉丝 ${reviewNumber(a.fans)}`,a.posting_cadence,a.topic_focus].filter(Boolean).join(' · '))}</p><div class="review-markdown">${renderReviewMarkdown(a.structure_notes_md)}</div>${Array.isArray(a.title_patterns) && a.title_patterns.length ? `<p>标题模式：${e(a.title_patterns.join('、'))}</p>` : ''}</article>`).join('');
  const articleCards = articles.map(a => `<article class="review-extra-item"><strong>${e(a.title || '未命名')}</strong> ${external(a.url,'原文 ↗')}<p>${e([a.reads == null ? '' : `阅读 ${reviewNumber(a.reads)}`,a.title_pattern,a.topic,a.collected_on ? `收录 ${a.collected_on}` : ''].filter(Boolean).join(' · '))}</p>${a.news_hook ? `<p>${e(a.news_hook)}</p>` : ''}</article>`).join('');
  const noteCards = notes.map(n => `<details class="review-note-card"><summary><span class="review-note-heading"><strong>${e(n.title || '未命名笔记')}</strong><span class="review-kind review-kind-${noteTone(n.kind)}">${e(n.kind || '笔记')}</span></span><span class="review-note-meta">${e([n.note_date,n.decided_by].filter(Boolean).join(' · '))}</span><span class="review-note-preview">${e(String(n.body_md || '').replace(/[#*`>]/g,'').trim() || '暂无正文')}</span></summary><div class="review-markdown">${renderReviewMarkdown(n.body_md)}</div>${Array.isArray(n.tags) && n.tags.length ? `<p class="review-note">${e(n.tags.join(' · '))}</p>` : ''}</details>`).join('');
  const healthCards = health.map(h => `<article class="review-extra-item"><strong>${e(h.observed_on || '日期未提供')} · ${e(healthLabel(h))}</strong><p>${e([h.platform,h.impressions_per_day == null ? '' : `日展现 ${reviewNumber(h.impressions_per_day)}`,h.reads_per_day == null ? '' : `日阅读 ${reviewNumber(h.reads_per_day)}`,h.ctr == null ? '' : `CTR ${reviewNumber(h.ctr,'ctr')}`].filter(Boolean).join(' · '))}</p>${h.platform_notice ? `<p>平台通知：${e(typeof h.platform_notice === 'object' ? JSON.stringify(h.platform_notice) : h.platform_notice)}</p>` : ''}${h.action ? `<p>行动：${e(h.action)}</p>` : ''}${h.since_date || h.resume_on ? `<p>${e([h.since_date ? `起始 ${h.since_date}` : '',h.resume_on ? `恢复 ${h.resume_on}` : ''].filter(Boolean).join(' · '))}</p>` : ''}</article>`).join('');
  const selected = REVIEW_SECTIONS.some(([id]) => id === vm.secondary) ? vm.secondary : 'accounts';
  const bodies = {accounts:accountCards || empty('暂无对标号'),benchmarks:articleCards || empty('暂无对标爆文'),notes:(noteCards || empty('暂无复盘笔记')) + legacyDaily(data),playbook:playbook(data,vm),trend:chart(trend || []),attention:`<div class="review-attention"><h3>${vm.week === 'last' ? '上周结论' : '本周结论'}</h3><p class="review-conclusion">${e(summary)}</p>${alerts.length ? `<ul class="review-alerts">${alerts.map(a => `<li><strong>${a.code === 'missing_24h' ? '24h 数据缺失' : '采集可能中断'}</strong><p>${e(a.message || '')}</p></li>`).join('')}</ul>` : ''}<section id="review-health-history" tabindex="-1"><h3>账号健康历史</h3>${healthCards || empty('暂无账号健康记录')}</section></div>`};
  return `<section class="review-secondary"><div class="review-secondary-tabs" role="tablist" aria-label="复盘资料">${REVIEW_SECTIONS.map(([id,label]) => `<button type="button" id="review-secondary-${id}" role="tab" data-review-secondary="${id}" aria-controls="review-secondary-panel" aria-selected="${selected === id}" tabindex="${selected === id ? '0' : '-1'}">${label}</button>`).join('')}</div><div class="review-secondary-panel" id="review-secondary-panel" role="tabpanel" aria-labelledby="review-secondary-${selected}">${bodies[selected]}</div></section>`;
}

function overview(data,vm) {
  const s = buildOverview(data,{account:vm.account,range:'30d',week:vm.week || 'this',now:vm.now || new Date().toISOString()});
  const current = s.current || {}, matched = s.rows.filter(row => sampleFor(row,data)).length, health = healthRows(data,vm.account)[0];
  const toggle = `<div class="review-week-toggle" role="group" aria-label="统计周">${[['this','本周'],['last','上周']].map(([key,label]) => `<button type="button" data-review-week="${key}" aria-pressed="${(vm.week || 'this') === key}">${label}</button>`).join('')}</div>`;
  const cards = `<section class="review-overview-metrics"><div class="review-panel-head"><div><h2>${vm.week === 'last' ? '上周表现' : '本周表现'}</h2><p \
class="review-note">${e(s.start)} — ${e(s.end)} · 上海时间，周一至周日</p></div>${toggle}</div><div class="review-stats"><article class="review-stat"><span>发布篇数\
</span><strong>${e(current.published_count)}<small>篇</small></strong></article><article class="review-stat"><span>爆 / 中 / 扑</span><strong>${e(
current.hits)} / ${e(current.judged_count - current.hits - current.flops)} / ${e(current.flops)}</strong></article><article class="review-stat"><span>\
CTR 中位数</span><strong>${e(reviewNumber(current.median_ctr,'ctr'))}</strong></article><article class="review-stat"><span>仿对标爆文</span>\
<strong>${matched} / ${s.rows.length}<small>篇</small></strong></article><article class="review-stat"><span>账号健康</span><strong>${e(healthLabel(
health))}</strong></article></div></section>`;
  const summary = firstSentence(s.conclusion) || '本周尚未生成周报';
  const alerts = Array.isArray(s.alerts) ? s.alerts : [];
  return cards + panel('文章列表',articleLibrary(enrichArticles(data,{account:vm.account}),vm,data)) + archives(data,vm,summary,s.trend || [],alerts);
}
function articleLibrary(rows,vm,data = {}) {
  const f = vm.filters || {}, range = f.range || '30d', today = day(vm.now || new Date().toISOString()), from = range === 'all' ? '' : shiftDay(today,range === '7d' ? -6 : -29);
  const selected = rows.filter(r => (!from || (day(r.published_at) && day(r.published_at) >= from && day(r.published_at) <= today)) && (!f.from || day(r.published_at) >= f.from && day(r.published_at)) && (!f.to || day(r.published_at) <= f.to && day(r.published_at)) && (!f.verdict || (f.verdict === 'unjudged' ? !r.verdict : r.verdict === f.verdict))).sort(recentArticles);
  const filters = `<div class="review-filters"><label>发布时间<select class="input" data-review-filter="range">${options([['7d','近 7 天'],['30d','近 30 天'],['all','全部时间']],range)}</select></label><label>表现判定<select class="input" data-review-filter="verdict">${options([['','全部判定'],['爆','爆'],['中','中'],['扑','扑'],['unjudged','待判定']],f.verdict || '')}</select></label><span class="review-note">${selected.length} 篇 · 发布时间从新到旧</span></div>`;
  if (!selected.length) return filters + empty('当前筛选下没有文章','试试更大的时间范围或其他判定。');
  const cells = row => {
    const reason = reasonPreview(articleReason(row,data,vm.account));
    const hint = !row.sample24h ? '暂无 24h 样本' : row.verdict && !(row.verdict_reliable ?? row.reliable) ? '近期可比样本不足，当前判定仅供参考' : '';
    return [['发布时间',e(reviewDateTime(row.published_at) || '—')],['标题',`<button type="button" class="review-title-button" \
data-review-article="${e(row.id)}" aria-haspopup="dialog">${e(row.title || '未命名文章')}</button>${sampleLabel(row,data)}${reason ? `<span class="review-reason-preview">${e(reason)}</span>` : ''}`],
      ['24h 阅读',e(reviewNumber(row.reads_24h))],['24h CTR',e(reviewNumber(row.ctr_24h,'ctr'))],
      ['判定',`<span class="review-verdict-cell">${tag(row.verdict)}${hint ? `<span class="review-sample-icon" tabindex="0" role="img" aria-label="${e(hint)}" title="${e(hint)}">ⓘ</span>` : ''}</span>`]];
  };
  return filters + `<div class="review-table-wrap"><table class="review-table review-articles-table"><caption class="review-sr-only">\
文章表现，点击文章行查看完整原因、全部快照和应用规则</caption><thead><tr>${['发布时间','标题','24h 阅读','24h CTR','判定'].map(t => `<th \
scope="col">${t}</th>`).join('')}</tr></thead><tbody>${selected.map(row => `<tr data-review-row="${e(row.id)}">${cells(row).map(([label,body]) => `<td\
 data-label="${label}">${body}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="review-note review-footnote">判定基于可比较的 24h \
样本；缺失年龄或未采集的数值显示 —，原始数据可在详情中查看。</p>`;
}
const sections = [['keep_topic','保留选题'],['drop_topic','放弃选题'],['title','标题'],['body','正文'],['audience','读者'],['checklist','发布检查']];
const statuses = [['candidate','待验证'],['trial','试用中'],['kept','有效'],['dropped','无效'],['hold','观察中']];
function evidence(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value !== 'object') return String(value);
  if (!value.metric) return '—';
  const labels = {ctr:'CTR',ctr_24h:'CTR',reads:'阅读',reads_24h:'阅读',completion_rate:'完读率',completion_24h:'完读率',avg_read_seconds:'平均阅读时长'};
  const key = value.metric, label = labels[key] || key;
  return `命中 ${reviewNumber(value.n_with)} 篇，${label} ${reviewNumber(value.with_median,key)}；未命中 ${reviewNumber(value.n_without)} 篇，${label} ${reviewNumber(value.without_median,key)}`;
}
function ruleCard(rule,index = '',historical = false) {
  const status = statuses.find(([key]) => key === rule.status) || statuses[0];
  return `<article class="review-rule"${historical ? '' : ` id="review-rule-${e(encodeURIComponent(rule.rule_id))}" tabindex="-1"`}><div \
class="review-rule-head"><span class="review-rule-id">${e(rule.rule_id || index)}</span><span class="review-rule-status ${e(status[0])}">${status[
1]}</span></div><p>${e(rule.text || '未提供规则内容')}</p><dl class="review-rule-evidence"><div><dt>证据</dt><dd>${e(evidence(
rule.evidence))}${rule.evidence_note ? `<br>${e(rule.evidence_note)}` : ''}</dd></div><div><dt>试验</dt><dd>${e(evidence(rule.trials))}</dd></div></dl>\
</article>`;
}
function articleRules(row) {
  const ids = parseJson(row.applied_rule_ids,null);
  if (!Array.isArray(ids)) return '<p class="review-note">未记录命中规则。</p>';
  if (!ids.length) return '<p class="review-note">已记录：无命中规则。</p>';
  const resolved = row.applied_rules || [];
  const known = new Set(resolved.map(rule => String(rule.rule_id)));
  const missing = ids.filter(id => !known.has(String(id)));
  return `<p class="review-note">已记录 ${ids.length} 条命中规则。</p>${resolved.length ? `<div class="review-rule-list">${resolved.map((rule,i) => ruleCard(rule,i,true)).join('')}</div>` : ''}${missing.length ? `<p class="review-note">未找到对应规则：${missing.map(id => e(String(id))).join('、')}</p>` : ''}`;
}
function playbook(data,vm) {
  const books = [...data.playbooks].filter(p => !vm.account || p.account === vm.account).sort((a,b) => String(b.published_on || '').localeCompare(String(a.published_on || '')) || String(b.version).localeCompare(String(a.version),undefined,{numeric:true}));
  if (!books.length) return empty('还没有写作手册','发布手册后，这里将显示当前规则与历史版本。');
  const bookStatus = p => p.status ?? (p.id === '8f553af0-302a-45fb-9fde-16d6d537c888' && p.account === 'V字' ? 'draft' : 'active');
  const book = books.filter(p => bookStatus(p) === 'active').sort((a,b) => Number(b.version) - Number(a.version) || String(b.published_on ||
 '').localeCompare(String(a.published_on || '')))[0];
  const status = vm.filters?.status || '', rules = book?.rules || [];
  const intro = book ? `<section class="review-playbook-intro"><div class="review-panel-head"><div><span class="review-note">当前手册</span><h2>${e(
book.version)}</h2></div><span class="review-note">生效日期 ${e(day(book.published_on) || '—')}${book.sent_to_gemini_at == null ? ' · 草稿·未发送' : ''}</span>\
</div><p class="review-conclusion">${e(firstSentence(book.content_md) || '本版本尚未提供手册摘要。')}</p></section>` : empty('暂无生效手册','草稿和归档版本可在历史版本中查看。');
  const filter = `<div class="review-filters"><label>规则状态<select class="input" data-review-filter="status">${options([['','全部状态'],...statuses],status)}</select></label><span class="review-note">规则按六个写作环节归档</span></div>`;
  const groups = sections.map(([id,label]) => { const selected = rules.filter(r => r.section === id && (!status || (r.status || 'candidate') === status)); return panel(label,selected.length ? `<div class="review-rule-list">${selected.map((r,i) => ruleCard(r,i)).join('')}</div>` : '<p class="review-note">此状态下暂无规则。</p>',`${selected.length} 条`); }).join('');
  const historical = books.filter(p => p !== book);
  const history = historical.length ? `<details class="review-panel review-history"${vm.version && String(vm.version) !== String(book?.version) ?
 ' open' : ''}><summary>历史版本 · ${historical.length} 版</summary><div class="review-version-list">${historical.map(p => `<details \
class="review-historical-version"${String(vm.version) === String(p.version) ? ' open' : ''}><summary>${e(p.version)} <span class="review-note">${e(
day(p.published_on) || '—')} · ${e(p.sent_to_gemini_at == null ? '草稿·未发送' : bookStatus(p) === 'draft' ? '草稿' : bookStatus(p) === 'archived' ? '已归档' :
 '生效')} · 只读</span></summary><div class="review-markdown">${renderReviewMarkdown(p.content_md)}</div><div class="review-rule-list">${(p.rules || [
]).map((r,i) => ruleCard(r,i,true)).join('')}</div></details>`).join('')}</div></details>` : '';
  return intro + filter + `<div class="review-playbook-sections">${groups}</div>` + history;
}
function drawer(data,rows,vm) {
  if (!vm.article) return '';
  const row = rows.find(r => String(r.id) === String(vm.article));
  const close = '<button class="btn text review-drawer-close" type="button" data-review-action="close-article" aria-label="关闭文章详情">关闭 <span aria-hidden="true">×</span></button>';
  if (!row) return `<div class="review-drawer-overlay"><aside class="review-drawer" role="dialog" aria-modal="true" aria-labelledby="review-detail-title" tabindex="-1">${close}<h2 id="review-detail-title">未找到文章</h2><p>文章可能已移除或不属于当前账号。</p></aside></div>`;
  const snapshots = data.snapshots.filter(s => String(s.article_id) === String(row.id)).sort((a,b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)) || String(a.id).localeCompare(String(b.id)));
  const points = snapshots.map(s => ({date:reviewDateTime(s.snapshot_date) || s.snapshot_date,reads_24h:s.reads,ctr_24h:s.ctr,count:1}));
  const raw = snapshots.map(s => `<article class="review-snapshot"><div class="review-panel-head"><h4>${e(reviewDateTime(s.snapshot_date) || '日期未提供')}</h4><span class="review-note">快照年龄 ${s.age_hours === null || s.age_hours === undefined ? '—' : `${e(reviewNumber(s.age_hours))}h`}</span></div><dl class="review-snapshot-metrics">${[['reads','阅读'],['ctr','CTR'],['completion_rate','完读率'],['impressions','展现'],['likes','点赞'],['comments','评论']].map(([key,label]) => `<div><dt>${label}</dt><dd>${e(reviewNumber(s[key],key))}</dd></div>`).join('')}</dl><details class="review-raw"><summary>全部原始字段</summary><pre>${e(JSON.stringify(s,null,2))}</pre></details></article>`).join('');
  return `<div class="review-drawer-overlay"><button class="review-drawer-backdrop" type="button" data-review-action="close-article" tabindex="-1" aria-label="关闭文章详情"></button><aside class="review-drawer" role="dialog" aria-modal="true" aria-labelledby="review-detail-title" tabindex="-1"><div class="review-drawer-header"><span class="review-note">文章详情</span>${close}</div><div class="review-detail-heading"><span class="review-note">${e(reviewDateTime(row.published_at) || '发布时间未提供')} · 上海时间</span><h2 id="review-detail-title">${e(row.title || '未命名文章')}</h2><div class="review-detail-links">${tag(row.verdict)}${external(row.url,'查看原文 ↗')}</div><p class="review-note">${e(!row.sample24h ? '暂无 24h 样本，以下保留原始采集数据。' : (row.verdict_reliable ?? row.reliable) ? '判定采用同账号近期 24h 阅读分位数。' : '近期可比样本不足，当前判定仅供参考。')}</p></div>${panel('判定原因',`<div class="review-markdown">${renderReviewMarkdown(articleReason(row,data,vm.account) || '暂无判定原因。')}</div>`)}${panel('快照变化',chart(points,{small:true}),'原始快照 · 时间顺序')}${panel('应用规则',articleRules(row),row.playbook_version_used ? `手册 ${row.playbook_version_used}` : '')}${panel('全部快照',raw || empty('暂无快照'),`${snapshots.length} 条 · 从早到晚`)}</aside></div>`;
}
export function renderContentReview() { return '<section id="content-review" class="content-review" aria-label="内容复盘"><p class="review-status" role="status" aria-live="polite">正在读取内容复盘…</p></section>'; }
function scopedReviewData(data,account) {
  const result = {...data};
  for (const key of ['articles','reports','playbooks','benchmarkAccounts','notes','accountHealth']) result[key] = (data[key] || []).filter(row => row.account === account);
  const benchmarkIds = new Set(result.benchmarkAccounts.map(row => String(row.id)));
  result.benchmarkArticles = (data.benchmarkArticles || []).filter(row => benchmarkIds.has(String(row.benchmark_account_id)) && (row.account == null || row.account === account));
  const ids = new Set(result.articles.map(row => String(row.id)));
  result.snapshots = (data.snapshots || []).filter(row => ids.has(String(row.article_id)));
  return result;
}
export function renderContentReviewContent(data,vm) {
  data = scopedReviewData(data,vm.account);
  const header = `<div class="review-toolbar"><div class="review-account"><strong>内容复盘</strong><span class="review-version">v1.2.2</span><span class="review-note">${e(vm.account)}</span> <button class="review-health-badge" type="button" data-review-action="show-health">${e(healthLabel(healthRows(data,vm.account)[0]))}</button></div><button class="btn text" type="button" data-review-action="refresh">刷新</button></div>`;
  if (vm.loading) return header + '<p class="review-status" role="status" aria-live="polite">正在读取完整数据…</p>';
  if (vm.error) return header + `<div class="review-empty" role="alert"><strong>内容复盘读取失败</strong><p>${e(vm.error)}</p><button class="btn" type="button" data-review-action="refresh">重新读取</button></div>`;
  const rows = enrichArticles(data,{account:vm.account});
  const hasData = ['articles','snapshots','reports','playbooks','benchmarkAccounts','benchmarkArticles','notes','accountHealth'].some(key => data[key].length);
  const body = hasData ? overview(data,vm) : empty('暂无内容复盘数据','当前账号尚未录入文章、快照、复盘报告或手册。');
  return `${header}<div class="review-body"${vm.article ? ' inert' : ''}>${body}</div>${drawer(data,rows,vm)}`;
}
