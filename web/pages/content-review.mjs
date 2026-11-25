import {safeReviewUrl, renderReviewMarkdown} from '../core/review-markdown.mjs';
import {currentPlaybooks, applicableScopes, scopeOf, currentPrompts, scopeLabel, ruleCountLabel} from '../core/review-rule-scopes.mjs';
import {renderTrafficCard} from './review-traffic-card.mjs';
import {renderCockpitTrends} from './review-trends.mjs';
import {promptPageUpdateRows, renderPromptPage, rulesIntroMarkdown} from './review-prompt-page.mjs';
import {renderArticleList, renderDetailPatterns} from './review-article-list.mjs';
import {renderImitation} from './review-imitation.mjs';
import {renderArticleRemarks} from './review-remarks.mjs';
import {weeklyReviews} from './review-weekly.mjs';
import {renderBenchmarkLibrary} from './review-benchmark-library.mjs';
import {e} from '../core/dom.mjs';
import {day, finiteNumber, parseJson, reviewDateTime} from '../core/review-data.mjs';
import {enrichArticles} from '../../shared/review-analytics.mjs';
import {metricDelta, reviewOverviewMetrics, reviewDuration} from '../core/review-overview-metrics.mjs';
import {reviewPublishLabel, reviewPublishState} from '../../shared/review-publish-state.mjs';

export const REVIEW_VIEWS = [['overview','总览'],['articles','文章库'],['playbook','手册']];
const percentageKeys = new Set(['ctr','completion_rate','ctr_24h','completion_24h','hit_rate','flop_rate','median_ctr']);
export function reviewNumber(value,key = '') {
  const n = finiteNumber(value);
  if (n === null) return '—';
  if (percentageKeys.has(key)) return `${n.toFixed(1)}%`;
  return Math.abs(n) >= 10000 ? `${(n / 10000).toFixed(1)} 万` : n.toLocaleString('zh-CN',{maximumFractionDigits:1});
}
export {safeReviewUrl, renderReviewMarkdown} from '../core/review-markdown.mjs';
const empty = (title,text = '') => `<div class="review-empty"><strong>${e(title)}</strong>${text ? `<p>${e(text)}</p>` : ''}</div>`;
const panel = (title,body,note = '',css = '') => `<section class="review-panel ${css}"><div class="review-panel-head"><h2>${e(title)}</h2>${note ? `<span ` +
  `class="review-note">${e(note)}</span>` : ''}</div>${body}</section>`;
const options = (rows,value) => rows.map(([id,label]) => `<option value="${e(id)}"${String(id) === String(value) ? ' selected' : 
  ''}>${e(label)}</option>`).join('');
const firstSentence = value => String(value || '').replace(/^#+\s*/gm,'').trim().match(/^[\s\S]*?[。！？!?](?:[”」』])?|^[^\n]+/)?.[0] || '';
function external(url,label) { const safe = safeReviewUrl(url); return safe ? `<a href="${e(safe)}" target="_blank" rel="noopener noreferrer">${e(label)}</a>` 
  : '<span class="review-note">未提供原文链接</span>'; }
function publishBadge(row) {
  const state = reviewPublishState(row);
  return `<span class="review-publish review-publish-${state}">${e(reviewPublishLabel(row))}</span>`;
}
function tag(verdict) {
  if (!['爆','中','扑'].includes(verdict)) return '';
  const css = verdict === '爆' ? 'hit' : verdict === '扑' ? 'flop' : 'middle';
  return `<span class="review-tag ${css}">${e(verdict)}</span>`;
}
function delta(value,key) {
  const n = finiteNumber(typeof value === 'object' && value ? value.delta : value);
  return n === null ? '<span class="review-change">较前一周 —</span>' : `<span class="review-change">较前一周 ${n > 0 ? '+' : n < 0 ? '−' : 
    ''}${e(percentageKeys.has(key) ? Math.abs(n).toFixed(1) : reviewNumber(Math.abs(n)))}${percentageKeys.has(key) ? ' 个百分点' : ''}</span>`;
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
      dots += `<circle class="review-point review-point-${css}" cx="${px}" cy="${py}" r="3" tabindex="0"><title>${e(p.date)} · ${label} ${e(reviewNumber(n,
        key))} · 当日 ${e(p.count ?? 0)} 篇</title></circle>`;
    }); flush();
  }
  const labels = [...new Set([0,Math.floor((points.length-1)/2),points.length-1])].map(i => `<text x="${x(i).toFixed(2)}" y="${bottom+24}" text-anchor="${i === 
    0 ? 'start' : i === points.length-1 ? 'end' : 'middle'}">${e(String(points[i].date).slice(5))}</text>`).join('');
  const bandWidth = (right-left) / Math.max(points.length-1,1);
  const hover = small ? '' : points.map((p,i) => `<rect class="review-hover-band" x="${Math.max(left,x(i)-bandWidth/2).toFixed(2)}" y="${top}" width="${(i === 
    0 || i === points.length-1 ? bandWidth/2 : bandWidth).toFixed(2)}" height="${height}" tabindex="0"><title>${e(p.date)} · 当日 ${e(p.count ?? 0)} 篇 · 阅读中位数 ` +
      `${e(reviewNumber(p.reads_24h))} · CTR 中位数 ${e(reviewNumber(p.ctr_24h,'ctr'))}</title></rect>`).join('');
  return `<div class="review-chart"><div class="review-chart-legend"><span class="reads">${small ? '阅读' : '阅读中位数'}</span><span class="ctr">${small ? 'CTR' : 
    'CTR 中位数'}</span>${small ? '' : '<span class="review-note">独立纵轴 · 悬停或聚焦查看当日篇数</span>'}</div><svg viewBox="0 0 ${width} ${bottom+36}" role="img" ` +
      `aria-label="阅读和 CTR 趋势，两条线分别按各自纵轴绘制"><line class="review-axis" x1="${left}" x2="${right}" y1="${bottom}" ` +
        `y2="${bottom}"/>${lines}${dots}${hover}${labels}</svg><div class="review-chart-scale"><span>阅读轴 0 – ` +
          `${e(reviewNumber(max('reads_24h')))}</span><span>CTR 轴 0 – ${e(reviewNumber(max('ctr_24h'),'ctr'))}</span></div></div>`;
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
export const REVIEW_SECTIONS = [['cockpit','驾驶舱'],['articles','文章详情'],['benchmarks','对标账号'],['rules','规则'],['prompts','提示词'],['library','爆文库']];
// One flat row of tabs (the 看数据 / 学方法 grouping was removed at the user's request, 2026-11-22).
export const REVIEW_SECTION_GROUPS = [
  ['all', '', ['cockpit', 'articles', 'benchmarks', 'library', 'rules', 'prompts']]
];
function activeSection(vm) {
  const raw = vm.secondary === 'review' ? 'rules' : vm.secondary === 'trends' ? 'cockpit' : vm.secondary;
  if (REVIEW_SECTIONS.some(([id]) => id === raw)) return raw;
  if (vm.view === 'articles') return 'articles';
  if (vm.view === 'playbook') return 'rules';
  return 'cockpit';
}

function v13Accounts(data) {
  const accounts = data.benchmarkAccounts || [];
  if (!accounts.length) return empty('暂无对标账号');
  const benchmarkArticles = data.benchmarkArticles || [];
  const ownArticles = data.articles || [];
  const accountBySampleId = new Map(benchmarkArticles.map(item => [String(item.id), String(item.benchmark_account_id)]));
  const imitatedByAccount = new Map();
  for (const article of ownArticles) {
    if (article.reference_article_id == null) continue;
    const ownerId = accountBySampleId.get(String(article.reference_article_id));
    if (ownerId) imitatedByAccount.set(ownerId, (imitatedByAccount.get(ownerId) || 0) + 1);
  }
  const totalImitations = [...imitatedByAccount.values()].reduce((sum, count) => sum + count, 0);
  const topAccount = accounts.map(account => ({name: account.name || '未命名账号', count: imitatedByAccount.get(String(account.id)) || 0}))
    .filter(item => item.count > 0).sort((a, b) => b.count - a.count)[0] || null;
  const kpis = [
    `<article class="review-sub-kpi"><span>对标账号</span><strong>${e(reviewNumber(accounts.length))} 个</strong><small>当前账号参考库</small></article>`,
    `<article class="review-sub-kpi"><span>已仿写篇数</span><strong>${e(reviewNumber(totalImitations))} 篇</strong><small>已关联样本引用</small></article>`,
    topAccount ? `<article class="review-sub-kpi"><span>主力对标</span><strong>${e(topAccount.name)}</strong><small>仿写 ${e(reviewNumber(topAccount.count))} 篇</small></article>` : '',
    benchmarkArticles.length ? `<article class="review-sub-kpi"><span>已建档样本</span><strong>${e(reviewNumber(benchmarkArticles.length))} 篇</strong><small>爆文库可复用样本</small></article>` : ''
  ].filter(Boolean).join('');
  const cards = accounts.map(account => {
    const topic = String(account.topic_focus || '').trim();
    const rawPatterns = parseJson(account.title_patterns, []);
    const patterns = Array.isArray(rawPatterns) ? rawPatterns.filter(item => typeof item === 'string' && item.trim()) : [];
    const structure = String(account.structure_notes_md || '').trim();
    // Preserve source text while giving existing sentence boundaries visual space.
    const structureParts = structure.includes('\n') ? [structure] : structure.split(/(?<=。)(?=\S)/u);
    const details = [
      topic ? `<section class="review-account-feature is-topic"><h4>选题方向</h4><div class="review-markdown">${renderReviewMarkdown(topic)}</div></section>` : '',
      patterns.length ? `<section class="review-account-feature is-title"><h4>标题特点</h4><div class="review-markdown">${patterns.map(item => 
        renderReviewMarkdown(item)).join('')}</div></section>` : '',
      structure ? `<details class="review-account-feature review-account-more"><summary><h4>其他特点</h4></summary><div
        class="review-markdown">${structureParts.map(part => 
        renderReviewMarkdown(part)).join('')}</div></details>` : ''
    ].join('');
    const profile = safeReviewUrl(account.profile_url);
    const name = e(account.name || '未命名账号');
    const fans = finiteNumber(account.fans);
    const imitated = imitatedByAccount.get(String(account.id)) || 0;
    const pills = [
      fans !== null && fans > 0 ? `<span class="review-account-pill">${e(reviewNumber(fans))} 粉</span>` : '',
      imitated > 0 ? `<span class="review-account-pill is-hit">已仿写 ${e(reviewNumber(imitated))} 篇</span>` : ''
    ].filter(Boolean).join('');
    const cadence = String(account.posting_cadence || '').trim();
    const cadenceHtml = cadence ? `<p class="review-account-cadence${/封号|停用/.test(cadence) ? ' is-stopped' : ''}">${e(cadence)}</p>` : '';
    return `<section class="review-v13-benchmark-group"><div class="review-v13-group-head"><h3>${profile ? `<a class="review-account-link" ` +
      `href="${e(profile)}" ` +
      `target="_blank" rel="noopener noreferrer">${name}</a>` : name}</h3>${pills ? `<div class="review-account-pills">${pills}</div>` : ''}</div>${cadenceHtml}<div class="review-v13-account-features">${details || 
        '<p>暂无特点记录</p>'}</div></section>`;
  }).join('');
  return `<div class="review-benchmarks-panel"><div class="review-sub-kpis review-benchmarks-kpis">${kpis}</div><div class="review-benchmark-cards">${cards}</div></div>`;
}
function sectionBody(selected,data,vm,rows) {
  if (selected === 'articles') return articleListPanel(rows,vm,data);
  if (selected === 'benchmarks') return v13Accounts(data);
  if (selected === 'rules') return playbook(data,vm);
  if (selected === 'prompts') return promptPage(data,vm);
  if (selected === 'library') return renderBenchmarkLibrary(data,vm.account);
  return overview(data,vm);
}
// 最近更新: each tab's newest change (北京时间), and the newest of all of them in one line above the tabs.
const SECTION_ROWS = {cockpit: d => d.articles, articles: d => d.articles, benchmarks: d => d.benchmarkAccounts,
  library: d => d.benchmarkArticles, rules: d => d.playbooks, prompts: promptPageUpdateRows};
export function lastUpdated(rows = []) {
  let best = '';
  for (const row of rows || []) {
    const value = row?.updated_at || row?.created_at;
    if (typeof value === 'string' && Number.isFinite(Date.parse(value)) && (!best || Date.parse(value) > Date.parse(best))) best = value;
  }
  return best;
}
export function sectionUpdated(data,id) { return lastUpdated(SECTION_ROWS[id]?.(data) || []); }
function updatedLine(data,selected) {
  const times = REVIEW_SECTIONS.map(([id,label]) => [label,sectionUpdated(data,id)]).filter(([,time]) => time);
  if (!times.length) return '';
  const [label,time] = times.reduce((a,b) => Date.parse(b[1]) > Date.parse(a[1]) ? b : a);
  const own = sectionUpdated(data,selected);
  return `<p class="review-updated-line"><span>内容复盘最近更新 <time datetime="${e(time)}">${e(reviewDateTime(time))}</time>` +
    `<span class="review-note">（${e(label)}）</span></span>` +
    (own ? `<span class="review-section-updated">本页最近更新 <time datetime="${e(own)}">${e(reviewDateTime(own))}</time></span>` : '') +
    `<span class="review-note">北京时间</span></p>`;
}
function archives(data,vm,rows,override,archive = '') {
  const selected = activeSection(vm);
  const body = override ?? sectionBody(selected,data,vm,rows);
  const labelById = new Map(REVIEW_SECTIONS);
  const tabHtml = id => `<button type="button" id="review-secondary-${id}" role="tab" data-review-secondary="${id}" ` +
    `aria-controls="review-secondary-panel" aria-selected="${selected === id}" tabindex="${selected === id ? '0' : '-1'}">` +
    `${e(labelById.get(id) || id)}</button>`;
  const groupsHtml = REVIEW_SECTION_GROUPS.flatMap(([, , ids]) => ids).map(tabHtml).join('');
  return `<section class="review-secondary"><div class="review-secondary-bar">` +
    `<div class="review-secondary-tabs" role="tablist" aria-label="内容复盘">${groupsHtml}</div>${archive}</div>${updatedLine(data,selected)}` +
    `<div class="review-secondary-panel" id="review-secondary-panel" role="tabpanel" aria-labelledby="review-secondary-${selected}">` +
    `${body}</div></section>`;
}

function metricChange(label, current, previous, prefix = '') {
  const delta = metricDelta(current, previous);
  const head = prefix ? `${label} ${prefix}` : label;
  if (delta === null) return `<small class="review-stat-change">${e(head)} —</small>`;
  if (delta === 0) return `<small class="review-stat-change">${e(head)} 持平</small>`;
  const tone = delta > 0 ? ' up' : ' down';
  return `<small class="review-stat-change${tone}">${e(head)} ${delta > 0 ? '+' : ''}${delta}%</small>`;
}
function statCard(label, body, change) {
  return `<article class="review-stat"><span>${label}</span>${body}${change}</article>`;
}
function overview(data,vm) {
  const range = ['this','last','30d'].includes(vm.filters?.metricsRange) ? vm.filters.metricsRange : 'this';
  const current = reviewOverviewMetrics(data,{account:vm.account,range,now:vm.now || new Date().toISOString()});
  const noSample = range !== 'last' && current.observedCount === 0;
  const value = formatted => noSample ? '<strong class="review-stat-empty">数据未满24h</strong>' : `<strong>${e(formatted)}</strong>`;
  const earlier = current.previous || {};
  const change = (left,right,prefix = '') => current.comparisonLabel ? metricChange(current.comparisonLabel,left,right,prefix) : '';
  const publishSummary = `<div class="review-publish-summary" role="status" aria-label="发布状态">
    <span class="review-publish review-publish-pending">待发布 <strong>${e(current.pendingCount ?? 0)}</strong></span>
    <span class="review-publish review-publish-published">已发布 <strong>${e(current.count)}</strong></span>
    ${(current.unmatchedCount || 0) ? `<span class="review-publish review-publish-unmatched">未能对上 <strong>${e(current.unmatchedCount)}</strong></span>` : ''}
    <span class="review-note">阅读、点击率、爆 / 中 / 扑只统计已发布。待发布在草稿箱里，不进入这些数字。</span></div>`;
  const cards = [
    statCard('发文数',`<strong>${e(current.count)}<small>篇</small></strong>`,change(current.count,earlier.count)),
    statCard('爆 / 中 / 扑',`<strong>${e(reviewNumber(current.hits))} / ${e(reviewNumber(current.middle))} / ${e(reviewNumber(current.flops))}</strong>`,
      change(current.hits,earlier.hits,'爆')),
    statCard('阅读中位数',value(reviewNumber(current.readsMedian)),change(current.readsMedian,earlier.readsMedian)),
    statCard('CTR 中位数',value(reviewNumber(current.ctrMedian,'ctr')),change(current.ctrMedian,earlier.ctrMedian)),
    statCard('平均阅读时长',value(reviewDuration(current.avgReadSeconds)),change(current.avgReadSeconds,earlier.avgReadSeconds)),
    statCard('平均阅读完成率',value(reviewNumber(current.completion,'completion_rate')),change(current.completion,earlier.completion)),
  ].join('');
  return `<section class="review-overview-metrics" aria-label="文章指标"><div class="review-filters"><label>统计时间<select class="input" ` +
    `data-review-filter="metricsRange">${options([['this','本周'],['last','上周'],['30d','近30天']],range)}</select></label>` +
    `<button class="btn text review-inline-refresh" type="button" data-review-action="refresh">刷新</button></div>` +
    `<div class="review-stats">${cards}</div>${publishSummary}${renderCockpitTrends(data,vm,current.window)}</section>` +
    weeklyLink(data,vm);
}
// The weekly review moved to AI 日报 → 周报 (2026-11-22); the cockpit keeps a one-line way there.
function weeklyLink(data,vm) {
  const [latest] = weeklyReviews(data.reports, vm.account);
  if (!latest) return '';
  const week = `${String(latest.period_start || '').slice(5).replace('-','月')}日–${String(latest.period_end || '').slice(5).replace('-','月')}日`;
  return `<p class="review-weekly-link"><a href="?page=ai-reports&amp;ai_tab=weekly&amp;account=${encodeURIComponent(vm.account)}">` +
    `看周复盘（${e(week)}）→</a></p>`;
}
function articleListPanel(rows,vm,data) {
  return `<section class="review-panel review-articles-panel" data-review-articles-expanded="true">
<h2 class="review-articles-heading review-sr-only">文章列表</h2>
<div id="review-article-library" class="review-article-library">${articleLibrary(rows,vm,data)}</div></section>`;
}
function articleLibrary(rows,vm,data) {
  const unmatchedRows = rows.filter(row => reviewPublishState(row) === 'unmatched');
  const flaggedItem = row => `<li><button type="button" class="review-title-button" data-review-article="${e(row.id)}" ` +
    `aria-haspopup="dialog">${publishBadge(row)} ${e(row.title || '未命名文章')}</button></li>`;
  const flagged = unmatchedRows.length ? `<details class="review-unmatched" data-review-keep-open="unmatched"><summary>未能对上 ${e(unmatchedRows.length)} 篇` +
    `</summary><p>这些记录对不上草稿箱里的同一篇，没有计入发文、阅读和点击率。</p><ul>${unmatchedRows.map(flaggedItem).join('')}</ul></details>` : '';
  return renderArticleList(rows,vm,data.snapshots,flagged,tag);
}
const sections = [['keep_topic','保留选题'],['drop_topic','放弃选题'],['title','标题'],['body','正文'],['audience','读者'],['checklist','发布检查']];
const statuses = [['candidate','待验证'],['trial','试用中'],['kept','有效'],['dropped','无效'],['hold','观察中']];
function evidence(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value !== 'object') return String(value);
  if (!value.metric) return '—';
  const labels = {ctr:'CTR',ctr_24h:'CTR',reads:'阅读',reads_24h:'阅读',completion_rate:'完读率',completion_24h:'完读率',avg_read_seconds:'平均阅读时长'};
  const key = value.metric, label = labels[key] || key;
  return `命中 ${reviewNumber(value.n_with)} 篇，${label} ${reviewNumber(value.with_median,key)}；未命中 ${reviewNumber(value.n_without)} 篇，${label} ` +
    `${reviewNumber(value.without_median,key)}`;
}
export function ruleCard(rule,index = '',historical = false) {
  const attributes = historical ? '' : ` id="review-rule-${e(encodeURIComponent(rule.rule_id))}" tabindex="-1"`;
  return `<article class="review-rule"${attributes}>
    <div class="review-rule-head"><span class="review-rule-id">${e(rule.rule_id || index)}</span></div>
    <div class="review-markdown">${renderReviewMarkdown(rule.text || '未提供规则内容')}</div>
    <dl class="review-rule-evidence"><div><dt>证据</dt><dd>${e(evidence(rule.evidence))}
      ${rule.evidence_note ? `<br>${e(rule.evidence_note)}` : ''}</dd></div>
      <div><dt>试验</dt><dd>${e(evidence(rule.trials))}</dd></div></dl>
  </article>`;
}
function articleRules(row) {
  const ids = parseJson(row.applied_rule_ids,null);
  if (!Array.isArray(ids)) return '<p class="review-note">未记录命中规则。</p>';
  if (!ids.length) return '<p class="review-note">已记录：无命中规则。</p>';
  const resolved = row.applied_rules || [];
  const known = new Set(resolved.map(rule => String(rule.rule_id)));
  const missing = ids.filter(id => !known.has(String(id)));
  return `<p class="review-note">已记录 ${ids.length} 条命中规则。</p>${resolved.length ? `<div class="review-rule-list">${resolved.map((rule,i) => ruleCard(rule,i,
    true)).join('')}</div>` : ''}${missing.length ? `<p class="review-note">未找到对应规则：${missing.map(id => e(String(id))).join('、')}</p>` : ''}`;
}

const v13RuleGroups = [['keep_topic','选题'],['drop_topic','放弃选题'],['title','标题'],['body','正文'],['audience','读者'],['checklist','自检清单']];
function v13Evidence(rule) {
  const note = String(rule.evidence_note || '').trim();
  if (note) return firstSentence(note);
  if (rule.evidence === null || rule.evidence === undefined || rule.evidence === '') return '';
  const value = evidence(rule.evidence);
  return value === '—' ? '' : firstSentence(value);
}
function v13RuleRow(rule,index,prefix = '') {
  const text = renderReviewMarkdown(String(rule.text || '').trim());
  const overridden = rule.overriddenByScope;
  const state = overridden ? 'overridden' : 'effective';
  const id = e(encodeURIComponent(`${prefix}:${rule.section || ''}:${rule.rule_id || ''}:${index}`));
  const body = overridden ? `<details class="review-overridden-rule">
    <summary>已被${e(scopeLabel(overridden))}覆盖 · 查看原文</summary>${text}</details>` :
    `${rule.overridesScopes?.length ? '<p class="review-note">当前生效 · 覆盖上层同 ID 规则</p>' : ''}${text}`;
  return `<article class="review-v13-rule-row" id="review-rule-${id}" data-rule-state="${state}">
    <span class="review-v13-rule-id">${e(rule.rule_id || index)}</span>
    <div class="review-v13-rule-text review-markdown">${body}</div>
    <span class="review-v13-rule-evidence">${e(v13Evidence(rule))}</span>
  </article>`;
}
function renderRuleBook(book,scope) {
  const rules=book.rules.filter(rule => scopeOf(rule.scope ?? book.account) === scope);
  const ownLayer = scopeOf(book.account) === scope;
  const lines=String(ownLayer ? book.content_md || '' : '').replace(/\r\n?/g,'\n').split('\n');
  const firstSection=lines.findIndex(line => /^##\s/.test(line));
  const titleLines=firstSection < 0 ? lines : lines.slice(0,firstSection);
  const title=titleLines.map(line => line.match(/^#\s+(.+?)\s*$/)?.[1]?.trim()).find(Boolean) || (ownLayer ? `规则手册 ${book.version}` : `适用规则`);
  const content=rulesIntroMarkdown(ownLayer ? book.content_md || '' : '');
  // The version's preface is background for the AIs; fold it so the rules themselves come first.
  const intro=content ? `<details class="review-v13-intro"><summary>版本说明</summary>` +
    `<div class="review-markdown">${renderReviewMarkdown(content)}</div></details>` : '';
  const groupedCounts = [];
  const groups=v13RuleGroups.map(([id,label]) => {
    const group=rules.filter(rule => rule.section === id);
    if (group.length) groupedCounts.push([id, label, group.length]);
    return `<details class="review-v13-rule-group${group.length ? '' : ' is-empty'}" data-rule-section="${e(id)}"${group.length ? ' open' : ''}>` +
      `<summary><span class="review-rule-group-label">${e(label)}</span> · ${ruleCountLabel(group)}</summary>` +
      `${group.map((rule,index) => v13RuleRow(rule,index+1,`${scope}:${book.id}`)).join('')}</details>`;
  }).join('');
  const ungrouped=rules.filter(rule => !v13RuleGroups.some(([id]) => id === rule.section));
  if (ungrouped.length) groupedCounts.push(['other', '其他', ungrouped.length]);
  const other=ungrouped.length ? `<details class="review-v13-rule-group" data-rule-section="other" open>` +
    `<summary><span class="review-rule-group-label">其他</span> · ${ruleCountLabel(ungrouped)}</summary>` +
    `${ungrouped.map((rule,index) => v13RuleRow(rule,index+1,`${scope}:${book.id}`)).join('')}</details>` : '';
  const chips = groupedCounts.length ? `<div class="review-rule-section-chips">${groupedCounts.map(([id, label, count]) =>
    `<span class="review-rule-chip" data-rule-section="${e(id)}">${e(label)} <b>${e(count)}</b></span>`).join('')}</div>` : '';
  return `<section class="review-v13-rules">
    <div class="review-v13-rule-meta"><h2>${e(title)}</h2>
    ${ownLayer ? ruleBookTimes(book) : '<span class="review-note review-rule-meta-pill">生效于 —</span>'}</div>
    ${chips}${intro}${groups}${other}</section>`;
}
// 生效 is when this version was made (a new version); 最后更新 moves with every edit in place.
function ruleBookTimes(book) {
  const since = reviewDateTime(book.created_at) || day(book.published_on) || '—', updated = reviewDateTime(book.updated_at || book.created_at);
  return `<span class="review-note review-rule-meta-pill">生效 ${e(since)}</span>` +
    (updated ? `<span class="review-note review-rule-meta-pill">最后更新 ${e(updated)}</span>` : '');
}
const byLastUpdate = (a,b) => Date.parse(b.updated_at || b.created_at || 0) - Date.parse(a.updated_at || a.created_at || 0);
function promptPage(data,vm) {
  return renderPromptPage(data,vm);
}
function playbook(data,vm) {
  const books = currentPlaybooks(data.playbooks,vm.account);
  const layers = applicableScopes(vm.account).map(scope => {
    const matches = books.filter(book => book.rules.some(rule => scopeOf(rule.scope ?? book.account) === scope) || scopeOf(book.account) === scope);
    if (!matches.length) return '';
    const layerRules = matches.flatMap(book => book.rules.filter(rule => scopeOf(rule.scope ?? book.account) === scope));
    return `<details class="review-rule-layer" data-rule-scope="${e(scope)}"${scope === scopeOf(vm.account) ? ' open' : ''}>
      <summary class="review-rule-layer-title">${e(scopeLabel(scope))}<span class="review-note"> · ${ruleCountLabel(layerRules)}</span></summary>
      ${matches.slice().sort(byLastUpdate).map(book => renderRuleBook(book,scope)).join('')}</details>`;
  }).join('');
  return layers ? `<div class="review-rule-hierarchy">${layers}</div>` : empty('暂无生效手册');
}

function verdictBasis(row) {
  if (!row.verdict || !row.verdict_basis) return '';
  const b = row.verdict_basis;
  if (b.method === 'recent30_quantiles') return `同账号最近 ${reviewNumber(b.sample_count)} 篇有效样本；爆 > ${reviewNumber(b.high_threshold)}，扑 ≤ ` +
    `${reviewNumber(b.low_threshold)}`;
  if (b.method === 'fixed_thresholds') return `有效样本 ${reviewNumber(b.sample_count)} 篇；暂按阅读量 ≥ ${reviewNumber(b.high_threshold)} 判爆，≤ ` +
    `${reviewNumber(b.low_threshold)} 判扑`;
  return '';
}
function legacyArticleRecord(row) {
  const fields = [['topic_category','选题分类'],['title_pattern','旧标题套路'],['playbook_version_used','手册版本']];
  const values = fields.filter(([key]) => row[key] != null && String(row[key]).trim());
  return values.length ? `<details class="review-article-legacy"><summary>旧记录</summary><dl>${values.map(([key,label]) =>
    `<div><dt>${label}</dt><dd>${e(row[key])}</dd></div>`).join('')}</dl></details>` : '';
}
function drawer(data,rows,vm) {
  if (!vm.article) return '';
  const row = rows.find(r => String(r.id) === String(vm.article));
  const close = '<button class="btn text review-drawer-close" type="button" data-review-action="close-article" aria-label="关闭文章详情">关闭 <span ' +
    'aria-hidden="true">×</span></button>';
  if (!row) return `<div class="review-drawer-overlay"><aside class="review-drawer" role="dialog" aria-modal="true" aria-labelledby="review-detail-title" ` +
    `tabindex="-1">${close}<h2 id="review-detail-title">未找到文章</h2><p>文章可能已移除或不属于当前账号。</p></aside></div>`;
  const basis = verdictBasis(row);
  const originalTitle = row.original_draft_title && row.original_draft_title !== row.title ?
    `<p class="review-note"><strong>原稿标题</strong> ${e(row.original_draft_title)}</p>` : '';
  return `<div class="review-drawer-overlay"><button class="review-drawer-backdrop" type="button" data-review-action="close-article" tabindex="-1" ` +
    `aria-label="关闭文章详情"></button><aside class="review-drawer" role="dialog" aria-modal="true" aria-labelledby="review-detail-title" tabindex="-1"><div ` +
      `class="review-drawer-header"><span class="review-note">文章详情</span>${close}</div><div class="review-detail-heading"><span ` +
        `class="review-note">${publishBadge(row)} ${e(reviewPublishState(row) === 'pending' ?
          (reviewDateTime(row.draft_saved_at || row.created_at) || '入草稿时间未提供') :
          (reviewDateTime(row.published_at) || '发布时间未提供'))} · 上海时间</span><h2 id="review-detail-title">${e(row.title || 
          '未命名文章')}</h2>${originalTitle}${reviewPublishState(row) === 'pending' ?
          '<p class="review-note">这篇还在草稿箱，阅读和点击率不计入统计。发布后会更新这一行。</p>' :
          reviewPublishState(row) === 'unmatched' ? '<p class="review-unmatched-note">这篇没能对上草稿箱里的同一篇，没有计入发文、阅读和点击率。</p>' : ''}<div ` +
          `class="review-detail-links">${tag(row.verdict)}${external(row.url,'查看原文 ↗')}</div></div>${renderTrafficCard(data.snapshots,row.id)}` +
          (basis ? `<p class="review-verdict-basis"><strong>判定依据</strong> ${e(basis)}</p>` : '') +
          renderDetailPatterns(row,vm.tags) + renderImitation(row,data,vm.account) + renderArticleRemarks(row,data.notes) +
          legacyArticleRecord(row) + '</aside></div>';
}

export function renderContentReview() { return '<section id="content-review" class="content-review" aria-label="内容复盘"><p class="review-status" role="status" ' +
  'aria-live="polite">正在读取内容复盘…</p></section>'; }
function scopedReviewData(data,account) {
  const result = {...data};
  for (const key of ['articles','reports','benchmarkAccounts','notes','accountHealth']) result[key] = (data[key] || []).filter(row => row.account === account);
  result.playbooks = currentPlaybooks(data.playbooks,account);
  result.prompts = currentPrompts(data.prompts,account);
  const benchmarkIds = new Set(result.benchmarkAccounts.map(row => String(row.id)));
  result.benchmarkArticles = (data.benchmarkArticles || []).filter(row => benchmarkIds.has(String(row.benchmark_account_id)) && (row.account == null || 
    row.account === account));
  const ids = new Set(result.articles.map(row => String(row.id)));
  result.snapshots = (data.snapshots || []).filter(row => ids.has(String(row.article_id)));
  return result;
}
export function renderContentReviewContent(data,vm) {
  data = scopedReviewData(data,vm.account);
  // The 档案 entry lives in the page header pill (账号 ｜ 档案), so nothing is added here.
  const archive = '';
  if (vm.loading) return archive + '<p class="review-status" role="status" aria-live="polite">正在读取完整数据…</p>';
  if (vm.error) return archive + `<div class="review-empty" role="alert"><strong>内容复盘读取失败</strong><p>${e(vm.error)}</p><button class="btn" type="button" ` +
    `data-review-action="refresh">重新读取</button></div>`;
  const rows = enrichArticles(data,{account:vm.account});
  const hasData = ['articles','snapshots','reports','playbooks','benchmarkAccounts','benchmarkArticles','notes','prompts']
    .some(key => (data[key] || []).length);
  const selected = activeSection(vm);
  const quiet = !hasData && !['articles','trends'].includes(selected);
  const body = archives(data,vm,rows,quiet ? empty('暂无内容复盘数据') +
    '<button class="btn text" type="button" data-review-action="refresh">刷新</button>' : undefined,archive);
  return `<div class="review-body"${vm.article ? ' inert' : ''}>${body}</div>${drawer(data,rows,vm)}`;
}
