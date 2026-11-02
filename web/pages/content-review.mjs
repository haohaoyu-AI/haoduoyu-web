import {e} from '../core/dom.mjs';
import {day, finiteNumber, parseJson, reviewDateTime, shiftDay} from '../core/review-data.mjs';
import {enrichArticles, recentArticles, median} from '../../shared/review-analytics.mjs';

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
function tag(verdict) {
  if (!['爆','中','扑'].includes(verdict)) return '';
  const css = verdict === '爆' ? 'hit' : verdict === '扑' ? 'flop' : 'middle';
  return `<span class="review-tag ${css}">${e(verdict)}</span>`;
}
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
export const REVIEW_SECTIONS = [['benchmarks','对标爆文'],['review','复盘与规则']];

const v13BenchmarkNames = ['浅黑科技','首席商业洞察','人工智能学家'];
function noteTone(kind) { return ({insight:0,decision:1,diagnosis:2,account_health:3})[kind] ?? 0; }
function v13Samples(data,vm) {
  const order = new Map(v13BenchmarkNames.map((name,index) => [name,index]));
  const accounts = (data.benchmarkAccounts || []).filter(a => order.has(String(a.name || '').trim()))
    .sort((a,b) => order.get(String(a.name).trim()) - order.get(String(b.name).trim()));
  if (!accounts.length) return empty('暂无对标爆文');
  return accounts.map(account => {
    const rows = (data.benchmarkArticles || []).filter(a => String(a.benchmark_account_id) === String(account.id))
      .sort((a,b) => {
        const av=finiteNumber(a.reads), bv=finiteNumber(b.reads);
        if (av === null && bv !== null) return 1;
        if (bv === null && av !== null) return -1;
        return (bv ?? 0) - (av ?? 0) || String(a.title || '').localeCompare(String(b.title || ''),'zh-CN');
      });
    const structure = String(account.structure_notes_md || '').trim();
    const details = structure ? `<details class="review-v13-structure"><summary>结构说明</summary><div class="review-markdown">${renderReviewMarkdown(structure)}</div></details>` : '';
    const sampleRows = rows.map(sample => {
      const href = safeReviewUrl(sample.url), title = e(sample.title || '未命名文章');
      const titleMarkup = href ? `<a href="${e(href)}" target="_blank" rel="noopener noreferrer">${title}</a>` : title;
      const used = (data.articles || []).filter(article => String(article.reference_article_id || '') === String(sample.id));
      const usedMarkup = used.map(article => {
        const url = safeReviewUrl(article.url);
        const local = `?page=review&account=${encodeURIComponent(vm.account)}&review_article=${encodeURIComponent(article.id)}`;
        return `<span class="review-v13-used">已仿 → <a href="${e(url || local)}"${url ? ' target="_blank" rel="noopener noreferrer"' : ''}>${e(article.title || '未命名文章')}</a></span>`;
      }).join('');
      return `<article class="review-v13-sample-row"><div class="review-v13-sample-title">${titleMarkup}${usedMarkup}</div><span>${e(reviewNumber(sample.reads))}</span><span>${e(sample.topic || '')}</span><time>${e(day(sample.collected_on) || '')}</time></article>`;
    }).join('');
    const home = safeReviewUrl(account.profile_url);
    return `<section class="review-v13-benchmark-group"><div class="review-v13-group-head"><h3>${e(account.name)}</h3><span class="review-v13-group-meta">粉丝 ${e(reviewNumber(account.fans))}</span><span class="review-v13-group-meta">发文节奏 ${e(account.posting_cadence || '—')}</span>${home ? `<a href="${e(home)}" target="_blank" rel="noopener noreferrer">主页 ↗</a>` : ''}</div>${details}<div class="review-v13-sample-row review-v13-sample-header" aria-hidden="true"><span>标题</span><span>阅读量</span><span>题材</span><span>收录日期</span></div><div class="review-v13-samples">${sampleRows || empty('暂无对标文章')}</div></section>`;
  }).join('');
}
function v13Notes(data) {
  const notes=(data.notes || []).map(n => ({id:String(n.id || ''),date:day(n.note_date) || '',kind:n.kind || '笔记',title:n.title || '',body:n.body_md || ''}));
  const reports=(data.reports || []).filter(r => r.period_type === 'daily' && String(r.summary_md || '').trim())
    .map(r => ({id:'report:'+String(r.id || ''),date:day(r.period_end) || '',kind:'日报',title:'',body:r.summary_md}));
  const all=[...notes,...reports].sort((a,b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const cards=all.map(n => {
    const preview=String(n.body || '').replace(/[#*\x60>]/g,'').trim();
    return `<details class="review-note-card"><summary><span class="review-note-heading"><time>${e(n.date || '日期未提供')}</time><span class="review-kind review-kind-${noteTone(n.kind)}">${e(n.kind)}</span>${n.title ? `<strong>${e(n.title)}</strong>` : ''}</span><span class="review-note-preview">${e(preview)}</span></summary><div class="review-markdown">${renderReviewMarkdown(n.body)}</div></details>`;
  }).join('');
  return `<section class="review-v13-notes"><h2>笔记</h2>${cards || empty('暂无复盘笔记')}</section>`;
}
function archives(data,vm) {
  const selected = REVIEW_SECTIONS.some(([id]) => id === vm.secondary) ? vm.secondary : 'benchmarks';
  const bodies = {benchmarks:v13Samples(data,vm),review:playbook(data,vm)+v13Notes(data)};
  return `<section class="review-secondary"><div class="review-secondary-tabs" role="tablist" aria-label="复盘资料">${REVIEW_SECTIONS.map(([id,label]) => `<button type="button" id="review-secondary-${id}" role="tab" data-review-secondary="${id}" aria-controls="review-secondary-panel" aria-selected="${selected === id}" tabindex="${selected === id ? '0' : '-1'}">${label}</button>`).join('')}</div><div class="review-secondary-panel" id="review-secondary-panel" role="tabpanel" aria-labelledby="review-secondary-${selected}">${bodies[selected]}</div></section>`;
}

function overview(data,vm) {
  const rows = enrichArticles(data,{account:vm.account});
  const today = day(vm.now || new Date().toISOString());
  const yesterday = shiftDay(today,-1), weekStart = shiftDay(today,-6);
  const yesterdayCount = rows.filter(row => day(row.published_at) === yesterday).length;
  const hits = rows.filter(row => { const date = day(row.published_at); return date && date >= weekStart && date <= today && row.verdict === '爆'; }).length;
  const readsMedian = median(rows.map(row => row.reads_24h));
  const ctrMedian = median(rows.map(row => row.ctr_24h));
  const cards = `<section class="review-overview-metrics" aria-label="关键指标"><div class="review-panel-head"><div><h2>关键指标</h2><p class="review-note">中位数按当前账号全部已加载且有合格 24h 数据的文章计算</p></div></div><div class="review-stats"><article class="review-stat"><span>昨日发文数</span><strong>${e(yesterdayCount)}<small>篇</small></strong></article><article class="review-stat"><span>24h 阅读中位数</span><strong>${e(reviewNumber(readsMedian))}</strong></article><article class="review-stat"><span>24h CTR 中位数</span><strong>${e(reviewNumber(ctrMedian,'ctr'))}</strong></article><article class="review-stat"><span>近 7 天爆文数</span><strong>${e(hits)}<small>篇</small></strong></article></div></section>`;
  return cards + panel('文章列表',articleLibrary(rows,vm,data),'','review-articles-panel') + archives(data,vm,'',[],[]);
}
function articleLibrary(rows,vm,data = {}) {
  const f = vm.filters || {}, range = f.range || '30d', today = day(vm.now || new Date().toISOString()), from = range === 'all' ? '' : shiftDay(today,range === '7d' ? -6 : -29);
  const selected = rows.filter(r => (!from || (day(r.published_at) && day(r.published_at) >= from && day(r.published_at) <= today)) && (!f.from || day(r.published_at) >= f.from && day(r.published_at)) && (!f.to || day(r.published_at) <= f.to && day(r.published_at)) && (!f.verdict || r.verdict === f.verdict)).sort(recentArticles);
  const filters = `<div class="review-filters"><label>发布时间<select class="input" data-review-filter="range">${options([['7d','近 7 天'],['30d','近 30 天'],['all','全部时间']],range)}</select></label><label>表现判定<select class="input" data-review-filter="verdict">${options([['','全部判定'],['爆','爆'],['中','中'],['扑','扑']],f.verdict || '')}</select></label><span class="review-note">${selected.length} 篇 · 发布时间从新到旧</span></div>`;
  if (!selected.length) return filters + empty('当前筛选下没有文章','试试更大的时间范围或其他判定。');
  const cells = row => [
    ['发布时间',e(reviewDateTime(row.published_at) || '—')],
    ['标题',`<button type="button" class="review-title-button" data-review-article="${e(row.id)}" aria-haspopup="dialog">${e(row.title || '未命名文章')}</button>${sampleLabel(row,data)}`],
    ['24h 阅读',e(reviewNumber(row.reads_24h))],
    ['判定',tag(row.verdict)]
  ];
  return filters + `<div class="review-table-wrap"><table class="review-table review-articles-table"><caption class="review-sr-only">文章表现，点击文章行查看详细指标与判定依据</caption><thead><tr>${['发布时间','标题','24h 阅读','判定'].map(t => `<th scope="col">${t}</th>`).join('')}</tr></thead><tbody>${selected.map(row => `<tr data-review-row="${e(row.id)}">${cells(row).map(([label,body]) => `<td data-label="${label}">${body}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
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

const v13RuleGroups = [['keep_topic','选题'],['drop_topic','放弃选题'],['title','标题'],['body','正文'],['audience','读者'],['checklist','自检清单']];
const v13RuleStatuses = [['kept','有效/保留'],['hold','观察'],['candidate','候选'],['trial','待验证'],['dropped','淘汰']];
function v13Evidence(rule) {
  const note = String(rule.evidence_note || '').trim();
  if (note) return firstSentence(note);
  if (rule.evidence === null || rule.evidence === undefined || rule.evidence === '') return '';
  const value = evidence(rule.evidence);
  return value === '—' ? '' : firstSentence(value);
}
function v13RuleRow(rule,index) {
  const status = v13RuleStatuses.find(([key]) => key === rule.status) || v13RuleStatuses[2];
  const text = String(rule.text || '').trim();
  return `<article class="review-v13-rule-row" id="review-rule-${e(encodeURIComponent(rule.rule_id || index))}"><span class="review-v13-rule-id">${e(rule.rule_id || index)}</span><details class="review-v13-expand"><summary aria-label="展开或收起规则"><span class="review-v13-preview">${e(text)}</span></summary><div class="review-v13-expanded">${e(text)}</div></details><span class="review-v13-status ${e(status[0])}">${e(status[1])}</span><span class="review-v13-rule-evidence">${e(v13Evidence(rule))}</span></article>`;
}
function playbook(data,vm) {
  const book = [...(data.playbooks || [])].filter(p => p.account === vm.account && p.status === 'active')
    .sort((a,b) => Number(b.version) - Number(a.version) || String(b.published_on || '').localeCompare(String(a.published_on || '')))[0];
  if (!book) return empty('暂无生效手册');
  const rules=Array.isArray(book.rules) ? book.rules : [], status=vm.filters?.status || '';
  const lines=String(book.content_md || '').replace(/\r\n?/g,'\n').split('\n');
  const firstSection=lines.findIndex(line => /^##\s/.test(line));
  const content=(firstSection < 0 ? lines : lines.slice(0,firstSection))
    .filter(line => !/^#\s/.test(line) && !/^\s*[-*_]{3,}\s*$/.test(line)).join('\n').trim();
  const intro=content ? `<details class="review-v13-expand review-v13-intro"><summary aria-label="展开或收起总纲"><span class="review-v13-preview">${e(content)}</span></summary><div class="review-v13-expanded review-markdown">${renderReviewMarkdown(content)}</div></details>` : '';
  const filter=`<div class="review-filters review-v13-rule-filter"><label>规则状态<select class="input" data-review-filter="status">${options([['','全部状态'],...v13RuleStatuses],status)}</select></label></div>`;
  const groups=v13RuleGroups.map(([id,label]) => {
    const group=rules.filter(rule => rule.section === id);
    const shown=group.filter(rule => !status || (rule.status || 'candidate') === status);
    return `<details class="review-v13-rule-group" open><summary>${e(label)} · ${shown.length} 条</summary>${shown.map((rule,index) => v13RuleRow(rule,index+1)).join('')}</details>`;
  }).join('');
  return `<section class="review-v13-rules"><div class="review-v13-rule-meta"><h2>规则手册 ${e(book.version)}</h2><span class="review-note">生效日 ${e(day(book.published_on) || '—')}</span><span class="review-note">共 ${rules.length} 条规则</span></div>${intro}${filter}${groups}</section>`;
}

function verdictBasis(row) {
  if (!row.verdict || !row.verdict_basis) return '';
  const b = row.verdict_basis;
  if (b.method === 'recent30_quantiles') return `同账号最近 ${reviewNumber(b.sample_count)} 篇有效样本；爆 > ${reviewNumber(b.high_threshold)}，扑 ≤ ${reviewNumber(b.low_threshold)}`;
  if (b.method === 'fixed_thresholds') return `有效样本 ${reviewNumber(b.sample_count)} 篇；暂按阅读量 ≥ ${reviewNumber(b.high_threshold)} 判爆，≤ ${reviewNumber(b.low_threshold)} 判扑`;
  return '';
}
function drawer(data,rows,vm) {
  if (!vm.article) return '';
  const row = rows.find(r => String(r.id) === String(vm.article));
  const close = '<button class="btn text review-drawer-close" type="button" data-review-action="close-article" aria-label="关闭文章详情">关闭 <span aria-hidden="true">×</span></button>';
  if (!row) return `<div class="review-drawer-overlay"><aside class="review-drawer" role="dialog" aria-modal="true" aria-labelledby="review-detail-title" tabindex="-1">${close}<h2 id="review-detail-title">未找到文章</h2><p>文章可能已移除或不属于当前账号。</p></aside></div>`;
  const metrics = [['24h CTR',reviewNumber(row.ctr_24h,'ctr')],['24h 完成率',reviewNumber(row.completion_24h,'completion_rate')],['配图数',reviewNumber(row.image_count)],['标题模板',row.title_pattern || '—'],['判定依据',verdictBasis(row) || '—']];
  return `<div class="review-drawer-overlay"><button class="review-drawer-backdrop" type="button" data-review-action="close-article" tabindex="-1" aria-label="关闭文章详情"></button><aside class="review-drawer" role="dialog" aria-modal="true" aria-labelledby="review-detail-title" tabindex="-1"><div class="review-drawer-header"><span class="review-note">文章详情</span>${close}</div><div class="review-detail-heading"><span class="review-note">${e(reviewDateTime(row.published_at) || '发布时间未提供')} · 上海时间</span><h2 id="review-detail-title">${e(row.title || '未命名文章')}</h2><div class="review-detail-links">${tag(row.verdict)}${external(row.url,'查看原文 ↗')}</div></div><dl class="review-v13-article-metrics">${metrics.map(([label,value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>${panel('原因全文',`<div class="review-markdown">${renderReviewMarkdown(articleReason(row,data,vm.account)) || '<p>—</p>'}</div>`)}</aside></div>`;
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
  const header = `<div class="review-toolbar"><div class="review-account"><strong>内容复盘</strong><span class="review-version">v1.3</span><span class="review-note">${e(vm.account)}</span></div><button class="btn text" type="button" data-review-action="refresh">刷新</button></div>`;
  if (vm.loading) return header + '<p class="review-status" role="status" aria-live="polite">正在读取完整数据…</p>';
  if (vm.error) return header + `<div class="review-empty" role="alert"><strong>内容复盘读取失败</strong><p>${e(vm.error)}</p><button class="btn" type="button" data-review-action="refresh">重新读取</button></div>`;
  const rows = enrichArticles(data,{account:vm.account});
  const hasData = ['articles','snapshots','reports','playbooks','benchmarkAccounts','benchmarkArticles','notes'].some(key => data[key].length);
  const body = hasData ? overview(data,vm) : empty('暂无内容复盘数据','当前账号尚未录入文章、快照、复盘报告或手册。');
  return `${header}<div class="review-body"${vm.article ? ' inert' : ''}>${body}</div>${drawer(data,rows,vm)}`;
}
