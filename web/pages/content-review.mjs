import {e} from '../core/dom.mjs';
import {day, finiteNumber, reviewDateTime, shiftDay} from '../core/review-data.mjs';
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
function tag(verdict,reliable = true) { return `<span class="review-tag ${verdict === '爆' ? 'hit' : verdict === '扑' ? 'flop' : verdict === '中' ? 'middle' : 'unjudged'}">${e(verdict || '待判定')}</span>${verdict && !reliable ? '<span class="review-sample-note">样本不足，仅供参考</span>' : ''}`; }
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
  if (!sample) return '<span class="review-no-sample">无样本</span>';
  const label = `仿：${sample.title || '参考爆文'}${sample.reads == null ? '' : `（${reviewNumber(sample.reads)}）`}`;
  const href = safeReviewUrl(sample.url);
  return href ? `<a href="${e(href)}" target="_blank" rel="noopener noreferrer">${e(label)}</a>` : e(label);
}
function healthRows(data,account) {
  return (data.accountHealth || []).filter(row => row.account === account).sort((a,b) => String(b.observed_on || '').localeCompare(String(
a.observed_on || '')) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')) || String(b.id || '').localeCompare(String(a.id || '')));
}
function healthLabel(row) { return ({normal:'正常','限流':'限流','降权':'降权','封禁':'封禁'})[row?.judgement] || '未记录'; }
function collapsed(title,body,id = '') { return `<details class="review-panel review-extra"${id ? ` id="${e(id)}"` : ''}><summary>${e(
title)}</summary>${body}</details>`; }
function legacyReports(data,account,key) {
  return (data.reports || []).filter(report => report.account === account && report.metrics?.[key] != null)
    .sort((a,b) => String(b.period_end || '').localeCompare(String(a.period_end || '')) || String(b.id || '').localeCompare(String(a.id || '')));
}
function legacySource(report) { return `<p class="review-note">历史日报 ${e(day(report.period_end) || '日期未提供')} · 只读</p>`; }
function legacyCards(data,account,key,articlesOnly = false) {
  return legacyReports(data,account,key).map(report => {
    const value = report.metrics[key];
    if (key === 'notes_md') return typeof value === 'string' ? `<article class="review-extra-item">${legacySource(report)}<div \
class="review-markdown">${renderReviewMarkdown(value)}</div></article>` : '';
    if (key === 'benchmark_accounts' && Array.isArray(value)) return value.filter(a => a && typeof a === 'object').map(a =>
      `<article class="review-extra-item">${legacySource(report)}<strong>${e(a.name || '未命名')}</strong> ${articlesOnly ? '' : `${external(
a.profile_url,'主页 ↗')}<p>${e([a.platform,a.fans == null ? '' : `粉丝 ${a.fans}`].filter(Boolean).join(' · '))}</p>`}${articlesOnly && Array.isArray(
a.top_articles) && a.top_articles.length ? `<ul>${a.top_articles.filter(Array.isArray).map(item => `<li>${e(item[0] || '未命名')} · 阅读 ${e(reviewNumber(
item[1]))}</li>`).join('')}</ul>` : ''}</article>`).join('');
    if (key === 'account_health' && value && typeof value === 'object' && !Array.isArray(value)) return `<article \
class="review-extra-item">${legacySource(report)}<strong>观察对象：${e(value.account || '未标明')} · 原始判断：${e(value.judgement || '未标明')}</strong><p>${e([
value.impressions_per_day == null ? '' : `日展现 ${reviewNumber(value.impressions_per_day)}`,value.reads_per_day == null ? '' : `日阅读 ${reviewNumber(
value.reads_per_day)}`,value.ctr_lt == null ? '' : `CTR 低于 ${reviewNumber(value.ctr_lt,'ctr')}`,value.since ? `起始 ${value.since}` : ''].filter(
Boolean).join(' · '))}</p>${value.notice ? `<p>平台通知：${e(value.notice)}</p>` : ''}${value.action ? `<p>行动：${e(value.action)}</p>` : ''}</article>`;
    return '';
  }).join('');
}
function archives(data,vm) {
  const accounts = data.benchmarkAccounts || [], articles = data.benchmarkArticles || [], notes = data.notes || [], health = healthRows(data,vm.account);
  const accountCards = accounts.map(a => `<article class="review-extra-item"><strong>${e(a.name || '未命名')}</strong> ${external(a.profile_url,
'主页 ↗')}<p>${e([a.platform,a.fans == null ? '' : `粉丝 ${reviewNumber(a.fans)}`,a.posting_cadence,a.topic_focus].filter(Boolean).join(' · '))}</p><div \
class="review-markdown">${renderReviewMarkdown(a.structure_notes_md)}</div>${Array.isArray(a.title_patterns) && a.title_patterns.length ? `<p>\
标题模式：${e(a.title_patterns.join('、'))}</p>` : ''}</article>`).join('');
  const articleCards = articles.map(a => `<article class="review-extra-item"><strong>${e(a.title || '未命名')}</strong> ${external(a.url,'原文 ↗')}<p>${e([
a.reads == null ? '' : `阅读 ${reviewNumber(a.reads)}`,a.title_pattern,a.topic,a.collected_on ? `收录 ${a.collected_on}` : ''].filter(Boolean).join(
' · '))}</p>${a.news_hook ? `<p>${e(a.news_hook)}</p>` : ''}</article>`).join('');
  const noteCards = notes.map(n => `<article class="review-extra-item"><strong>${e(n.title || '未命名笔记')}</strong><p class="review-note">${e([
n.note_date,n.kind,n.decided_by].filter(Boolean).join(' · '))}</p><div class="review-markdown">${renderReviewMarkdown(
n.body_md)}</div>${Array.isArray(n.tags) && n.tags.length ? `<p>${e(n.tags.join(' · '))}</p>` : ''}</article>`).join('');
  const healthCards = health.map(h => `<article class="review-extra-item"><strong>${e(h.observed_on || '日期未提供')} · ${e(healthLabel(h))}</strong>\
<p>${e([h.platform,h.impressions_per_day == null ? '' : `日展现 ${reviewNumber(h.impressions_per_day)}`,h.reads_per_day == null ? '' : `日阅读\
 ${reviewNumber(h.reads_per_day)}`,h.ctr == null ? '' : `CTR ${reviewNumber(h.ctr,'ctr')}`].filter(Boolean).join(' · '))}</p>${h.platform_notice ?
 `<p>平台通知：${e(typeof h.platform_notice === 'object' ? JSON.stringify(h.platform_notice) : h.platform_notice)}</p>` : ''}${h.action ? `<p>行动：${e(
h.action)}</p>` : ''}${h.since_date || h.resume_on ? `<p>${e([h.since_date ? `起始 ${h.since_date}` : '',h.resume_on ? `恢复 ${h.resume_on}` : ''].filter(
Boolean).join(' · '))}</p>` : ''}</article>`).join('');
  const combined = (current,legacy,title) => current + legacy || empty(title);
  return `<div class="review-archives">${collapsed(`对标号档案${accounts.length ? ` · ${accounts.length} 条新记录` : ''}`,combined(accountCards,legacyCards(
data,vm.account,'benchmark_accounts'),'暂无对标号'))}${collapsed(`对标爆文库${articles.length ? ` · ${articles.length} 条新记录` : ''}`,combined(articleCards,
legacyCards(data,vm.account,'benchmark_accounts',true),'暂无对标爆文'))}${collapsed(`复盘笔记${notes.length ? ` · ${notes.length} 条新记录` : ''}`,combined(
noteCards,legacyCards(data,vm.account,'notes_md'),'暂无复盘笔记'))}${collapsed('规则与手册版本',playbook(data,vm))}${collapsed(`账号健康历史${health.length ? ` ·\
 ${health.length} 条新记录` : ''}`,combined(healthCards,legacyCards(data,vm.account,'account_health'),'暂无账号健康记录'),'review-health-history')}</div>`;
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
  return cards + panel('文章列表',articleLibrary(enrichArticles(data,{account:vm.account}),vm,data)) + archives(data,vm) + collapsed('近 30 天趋势',chart(
s.trend || [])) + collapsed(vm.week === 'last' ? '上周结论' : '本周结论',`<p class="review-conclusion">${e(summary)}</p>`) + (alerts.length ? collapsed(
'需要关注',`<ul class="review-alerts">${alerts.map(a => `<li><strong>${a.code === 'missing_24h' ? '24h 数据缺失' : '采集可能中断'}</strong><p>${e(a.message ||
 '')}</p></li>`).join('')}</ul>`) : '');
}
function articleLibrary(rows,vm,data = {}) {
  const f = vm.filters || {}, range = f.range || '30d', today = day(vm.now || new Date().toISOString()), from = range === 'all' ? '' : shiftDay(today,range === '7d' ? -6 : -29);
  const selected = rows.filter(r => (!from || (day(r.published_at) && day(r.published_at) >= from && day(r.published_at) <= today)) && (!f.from || day(r.published_at) >= f.from && day(r.published_at)) && (!f.to || day(r.published_at) <= f.to && day(r.published_at)) && (!f.verdict || (f.verdict === 'unjudged' ? !r.verdict : r.verdict === f.verdict))).sort(recentArticles);
  const filters = `<div class="review-filters"><label>发布时间<select class="input" data-review-filter="range">${options([['7d','近 7 天'],['30d','近 30 天'],['all','全部时间']],range)}</select></label><label>表现判定<select class="input" data-review-filter="verdict">${options([['','全部判定'],['爆','爆'],['中','中'],['扑','扑'],['unjudged','待判定']],f.verdict || '')}</select></label><span class="review-note">${selected.length} 篇 · 发布时间从新到旧</span></div>`;
  if (!selected.length) return filters + empty('当前筛选下没有文章','试试更大的时间范围或其他判定。');
  const cells = row => [['发布时间',e(reviewDateTime(row.published_at) || '—')],['标题',`<button type="button" class="review-title-button" \
data-review-article="${e(row.id)}" aria-haspopup="dialog">${e(row.title || '未命名文章')}</button>${!row.sample24h ?
 '<span class="review-sample-note">暂无 24h 样本</span>' : ''}`],['24h 阅读',e(reviewNumber(row.reads_24h))],['24h CTR',e(reviewNumber(row.ctr_24h,'ctr'))],
['24h 完读率',e(reviewNumber(row.completion_24h,'completion_rate'))],['判定',tag(row.verdict,row.verdict_reliable ?? row.reliable)],['原因',e(firstSentence((
data.reports || []).map(report => report.verdicts?.[row.id]).filter(Boolean).map(v => typeof v === 'object' ? v.reason : '').find(Boolean)) || (
row.verdict ? `24h 阅读 ${reviewNumber(row.reads_24h)}，${row.reliable ? '按近期可比文章判定' : '按暂定阈值判定'}` : '缺少可判定的 24h 样本'))],['参考爆文',sampleLabel(row,data)],[
'命中规则',e(reviewNumber(Array.isArray(row.applied_rule_ids) ? row.applied_rule_ids.length : null))]];
  return filters + `<div class="review-table-wrap"><table class="review-table review-articles-table"><caption class="review-sr-only">\
文章表现，点击文章行查看全部快照和应用规则</caption><thead><tr>${['发布时间','标题','24h 阅读','24h CTR','24h 完读率','判定','原因','参考爆文','命中规则'].map(t => `<th \
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
  return `<div class="review-drawer-overlay"><button class="review-drawer-backdrop" type="button" data-review-action="close-article" tabindex="-1" aria-label="关闭文章详情"></button><aside class="review-drawer" role="dialog" aria-modal="true" aria-labelledby="review-detail-title" tabindex="-1"><div class="review-drawer-header"><span class="review-note">文章详情</span>${close}</div><div class="review-detail-heading"><span class="review-note">${e(reviewDateTime(row.published_at) || '发布时间未提供')} · 上海时间</span><h2 id="review-detail-title">${e(row.title || '未命名文章')}</h2><div class="review-detail-links">${tag(row.verdict)}${external(row.url,'查看原文 ↗')}</div><p class="review-note">${e(!row.sample24h ? '暂无 24h 样本，以下保留原始采集数据。' : (row.verdict_reliable ?? row.reliable) ? '判定采用同账号近期 24h 阅读分位数。' : '近期可比样本不足，当前判定仅供参考。')}</p></div>${panel('快照变化',chart(points,{small:true}),'原始快照 · 时间顺序')}${panel('应用规则',row.applied_rules?.length ? `<div class="review-rule-list">${row.applied_rules.map((r,i) => ruleCard(r,i,true)).join('')}</div>` : '<p class="review-note">未记录应用规则。</p>',row.playbook_version_used ? `手册 ${row.playbook_version_used}` : '')}${panel('全部快照',raw || empty('暂无快照'),`${snapshots.length} 条 · 从早到晚`)}</aside></div>`;
}
export function renderContentReview() { return '<section id="content-review" class="content-review" aria-label="内容复盘"><p class="review-status" role="status" aria-live="polite">正在读取内容复盘…</p></section>'; }
export function renderContentReviewContent(data,vm) {
  const view = vm.view === 'playbooks' ? 'playbook' : REVIEW_VIEWS.some(([id]) => id === vm.view) ? vm.view : 'overview';
  const header = `<div class="review-toolbar"><div class="review-account"><span class="review-note">${e(vm.account)}</span> <button \
class="review-health-badge" type="button" data-review-action="show-health">${e(healthLabel(healthRows(data,vm.account)[0]))}</button></div><button \
class="btn text" type="button" data-review-action="refresh">刷新</button></div><div class="review-tabs" role="tablist" \
aria-label="复盘视图">${REVIEW_VIEWS.map(([id,label]) => `<button type="button" id="review-tab-${id}" role="tab" data-review-view="${id}" \
aria-controls="review-tabpanel" aria-selected="${view === id}" tabindex="${view === id ? '0' : '-1'}">${label}</button>`).join('')}</div>`;
  if (vm.loading) return header + '<p class="review-status" role="status" aria-live="polite">正在读取完整数据…</p>';
  if (vm.error) return header + `<div class="review-empty" role="alert"><strong>内容复盘读取失败</strong><p>${e(vm.error)}</p><button class="btn" type="button" data-review-action="refresh">重新读取</button></div>`;
  const rows = enrichArticles(data,{account:vm.account});
  const body = !data.articles.length && !data.snapshots.length && !data.reports.length && !data.playbooks.length && !(data.benchmarkAccounts || [
]).length && !(data.benchmarkArticles || []).length && !(data.notes || []).length && !(data.accountHealth || []).length ? empty('暂无内容复盘数据',
'当前账号尚未录入文章、快照、复盘报告或手册。') + (view === 'overview' ? collapsed('账号健康历史 · 0',empty('暂无账号健康记录'),'review-health-history') : '') : view === 'articles' ?
 articleLibrary(rows,vm,data) : view === 'playbook' ? playbook(data,vm) : overview(data,vm);
  return `${header}<div class="review-body" id="review-tabpanel" role="tabpanel" aria-labelledby="review-tab-${view}"${vm.article ? ' inert' : ''}>${body}</div>${drawer(data,rows,vm)}`;
}
