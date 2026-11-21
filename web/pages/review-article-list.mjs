import {e} from '../core/dom.mjs';
import {day, finiteNumber, reviewDateTime, shiftDay} from '../core/review-data.mjs';
import {formatReviewListMetric} from '../core/review-list-metrics.mjs';
import {reviewListObservation, reviewObservationHours} from '../core/review-list-observation.mjs';
import {activityArticles, recentArticles} from '../../shared/review-analytics.mjs';
import {reviewPublishState} from '../../shared/review-publish-state.mjs';

const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
const verdicts = ['爆','中','扑'];
const verdictClass = {爆:'hit',中:'middle',扑:'flop'};
const percentageKeys = new Set(['ctr','completion_rate']);
const metricColumns = [
  ['reads','24h 阅读'],
  ['impressions','展现量'],
  ['ctr','点击率'],
  ['completion_rate','完读率'],
  ['avg_read_seconds','阅读时长'],
  ['fan_reads','粉丝阅读'],
  ['fan_impressions','粉丝展现'],
];
const columns = [['published','发布时间',true], ...metricColumns.map(([key,label]) => [key,label,true])];
export const TABLE_VIEW = '@table';
export const reviewSortKeys = columns.filter(([, ,sortable]) => sortable).map(([key]) => key);

function weekday(date) { return new Date(date + 'T00:00:00Z').getUTCDay(); }

export function articleListDate(value) {
  const when = reviewDateTime(value);
  if (!when) return '—';
  return [when.slice(5,10),weekdays[weekday(when.slice(0,10))],when.slice(11)].filter(Boolean).join(' ');
}

export function articlePatternDimensions(tags) {
  const dimensions = tags?.dimensions || [];
  const title = dimensions.find(name => /标题/.test(name));
  const article = dimensions.find(name => name !== title && /文章|正文|篇章/.test(name));
  // Older tag payloads may use custom dimension names. Two opaque dimensions retain their supplied order.
  if (!title && !article && dimensions.length === 2) return dimensions;
  return [title,article];
}

function patternValue(tags,id,dimension) {
  if (!dimension || !Object.hasOwn(tags?.tags || {},id)) return '';
  const entry = tags.tags[id];
  return entry && Object.hasOwn(entry,dimension) && typeof entry[dimension] === 'string' ? entry[dimension].trim() : '';
}

function availableDimensions(tags,rows) {
  return articlePatternDimensions(tags).map(dimension => rows.some(row => patternValue(tags,row.id,dimension)) ? dimension : '');
}

const middle = values => {
  const list = values.filter(Number.isFinite).sort((a,b) => a - b);
  const center = Math.floor(list.length / 2);
  if (!list.length) return null;
  return list.length % 2 ? list[center] : (list[center - 1] + list[center]) / 2;
};

function metricValue(observation,key) {
  const value = finiteNumber(observation?.snapshot?.[key]);
  if (value === null || value < 0) return null;
  return percentageKeys.has(key) && value > 100 ? null : value;
}

function summary(rows,observations) {
  const counts = verdicts.map(verdict => rows.filter(row => row.verdict === verdict).length);
  const judged = counts.reduce((total,count) => total + count,0);
  const pick = (key,fallback) => middle(rows.map(row => {
    const observed = observations ? metricValue(observations.get(row.id),key) : null;
    if (observed !== null) return observed;
    return fallback ? finiteNumber(row[fallback]) : null;
  }));
  return {
    counts,
    judged,
    hitRate:judged ? 100 * counts[0] / judged : null,
    reads:pick('reads','reads_24h'),
    impressions:pick('impressions'),
    ctr:pick('ctr','ctr_24h'),
    completion_rate:pick('completion_rate'),
    avg_read_seconds:pick('avg_read_seconds'),
    fan_reads:pick('fan_reads'),
    fan_impressions:pick('fan_impressions'),
  };
}

function groupBy(rows,keyFor) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(row);
  }
  return groups;
}

const tailRank = name => name === '未分类' ? 2 : name === '其他' ? 1 : 0;
export function articlePatternGroups(rows,tags,dimension,observations) {
  return [...groupBy(rows,row => patternValue(tags,row.id,dimension) || '未分类')]
    .map(([name,rows]) => ({name,rows,...summary(rows,observations)}))
    .sort((a,b) => tailRank(a.name) - tailRank(b.name) || (a.rows.length < 5) - (b.rows.length < 5) ||
      (b.hitRate ?? -1) - (a.hitRate ?? -1) || (b.reads ?? -1) - (a.reads ?? -1) || a.name.localeCompare(b.name,'zh-CN'));
}

export function articleWeekGroups(rows,observations) {
  return [...groupBy(rows,row => {
    const date = day(row.published_at);
    return date ? shiftDay(date,-((weekday(date) + 6) % 7)) : '';
  })].map(([start,rows]) => ({start,end:shiftDay(start,6),rows,...summary(rows,observations)}));
}

function filterDate(value,from,today) {
  const date = day(value);
  return !from || Boolean(date && date >= from && date <= today);
}

export function filterArticles(rows,filters,tags,now) {
  const range = ['7d','30d','all'].includes(filters.range) ? filters.range : '30d';
  const today = day(now), from = range === 'all' ? '' : shiftDay(today,range === '7d' ? -6 : -29);
  const query = (filters.query || '').trim().toLocaleLowerCase();
  const matchesTitle = row => !query || (row.title || '').toLocaleLowerCase().includes(query);
  return {
    range,
    published:rows.filter(row => reviewPublishState(row) === 'published' && filterDate(row.published_at,from,today) &&
      matchesTitle(row) && (!filters.verdict || row.verdict === filters.verdict) &&
      (!filters.pattern || patternValue(tags,row.id,filters.pattern.dimension) === filters.pattern.name)),
    drafts:rows.filter(row => reviewPublishState(row) === 'pending' && matchesTitle(row)).sort(activityArticles)
  };
}

function compareNullable(left,right,direction) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return (left - right) * direction;
}

export function sortReviewArticles(rows,observations,sort) {
  const direction = sort?.direction === 'ascending' ? 1 : -1;
  const key = sort?.key || 'published';
  if (key === 'published') {
    return [...rows].sort((a,b) => Number(!day(a.published_at)) - Number(!day(b.published_at)) || -direction * recentArticles(a,b));
  }
  return [...rows].sort((a,b) => compareNullable(metricValue(observations.get(a.id),key),metricValue(observations.get(b.id),key),direction) ||
    recentArticles(a,b));
}

const choose = (choices,value) => choices.map(([id,label]) =>
  `<option value="${e(id)}"${id === value ? ' selected' : ''}>${e(label)}</option>`).join('');

function viewControls(dimensions,group,count) {
  const views = [[TABLE_VIEW,'全部文章'],[dimensions[0],'标题套路'],[dimensions[1],'文章套路']];
  return `<div class="review-view-row"><div class="segmented review-view-switch" role="group" aria-label="文章列表显示方式">` +
    views.map(([value,label]) => `<button type="button" class="btn" data-review-view="${e(value || '')}" ` +
      `aria-pressed="${Boolean(value) && group === value}"${value ? '' : ' disabled title="还没有套路标签"'}>${label}</button>`).join('') +
    `</div><div class="review-view-actions"><span class="review-view-count">已发布 <b>${count}</b> 篇${dimensions.some(Boolean) ? '' : ' · 还没有套路标签'}</span>` +
    `<button class="btn text" type="button" data-review-action="toggle-fullscreen" aria-pressed="false">全屏展示</button></div></div>`;
}

function articleFilters(filters,range) {
  const dates = choose([['7d','近7天'],['30d','近30天'],['all','全部']],range);
  const choices = choose([['','全部判定'],...verdicts.map(verdict => [verdict,verdict])],filters.verdict || '');
  const pattern = filters.pattern;
  return `<div class="review-filters review-article-filters"><label>发布时间<select class="input" data-review-filter="range">${dates}</select></label>` +
    `<label>表现判定<select class="input" data-review-filter="verdict">${choices}</select></label>` +
    `<label class="review-article-search">标题关键词<input type="search" class="input" data-review-search ` +
    `value="${e(filters.query || '')}" placeholder="搜索标题"></label></div>` +
    (pattern ? `<button type="button" class="btn review-pattern-filter" data-review-pattern-clear ` +
      `aria-label="移除套路筛选：${e(pattern.dimension)} · ${e(pattern.name)}">${e(pattern.dimension)} · ${e(pattern.name)} ×</button>` : '');
}

const medianText = (value,key) => formatReviewListMetric({snapshot:{[key]:value}},key);
const countsHtml = counts => verdicts.map((label,i) =>
  `<span class="review-count-pill ${verdictClass[label]}">${label} <b>${counts[i]}</b></span>`).join('');

function summaryStrip(stats,total) {
  const rate = stats.hitRate === null ? '—' : `${stats.hitRate.toFixed(1)}%`;
  return `<div class="review-article-kpis" aria-label="当前筛选汇总">` +
    `<article class="review-article-kpi"><span>爆 / 中 / 扑</span><strong>${stats.counts[0]} / ${stats.counts[1]} / ${stats.counts[2]}</strong>` +
    `<small>共 ${total} 篇 · 爆率 ${rate}</small></article>` +
    `<article class="review-article-kpi"><span>24h 阅读中位</span><strong>${e(medianText(stats.reads,'reads'))}</strong>` +
    `<small>展现中位 ${e(medianText(stats.impressions,'impressions'))}</small></article>` +
    `<article class="review-article-kpi"><span>点击 / 完读中位</span><strong>${e(medianText(stats.ctr,'ctr'))}</strong>` +
    `<small>完读中位 ${e(medianText(stats.completion_rate,'completion_rate'))}</small></article>` +
    `<article class="review-article-kpi"><span>时长 / 粉丝阅读</span><strong>${e(medianText(stats.avg_read_seconds,'avg_read_seconds'))}</strong>` +
    `<small>粉阅 ${e(medianText(stats.fan_reads,'fan_reads'))} · 粉展 ${e(medianText(stats.fan_impressions,'fan_impressions'))}</small></article>` +
    `</div>`;
}

function titleButton(row) {
  const title = e(row.title || '未命名文章');
  return `<button type="button" class="review-title-button" data-review-article="${e(row.id)}" ` +
    `aria-haspopup="dialog" title="${title}">${title}</button>`;
}

function draftBox(rows) {
  return `<details class="review-article-drafts" data-review-keep-open="drafts"><summary>草稿箱 ${rows.length} 篇</summary>` +
    (rows.length ? `<ul>${rows.map(row => `<li><time>${e(articleListDate(row.draft_saved_at || row.created_at))}</time>` +
      `${titleButton(row)}</li>`).join('')}</ul>` : '<p class="review-note">草稿箱为空</p>') + '</details>';
}

function patternButton(tags,row,dimension,prefix,kind) {
  const name = patternValue(tags,row.id,dimension);
  if (!name) return '';
  return `<button type="button" class="review-pattern-label is-${kind}" data-review-pattern="${e(name)}" ` +
    `data-review-dimension="${e(dimension)}" title="${e(dimension)}：${e(name)}"><span class="review-pattern-prefix">${prefix}</span>${e(name)}</button>`;
}

export function renderDetailPatterns(row,tags) {
  const labels = ['标题套路','文章套路'];
  return `<dl class="review-detail-patterns">${articlePatternDimensions(tags).map((dimension,index) =>
    `<div><dt>${labels[index]}</dt><dd>${e(patternValue(tags,row.id,dimension) || '—')}</dd></div>`).join('')}</dl>`;
}

function verdictChip(row,observation) {
  if (observation.kind === 'longtail') return '<span class="review-article-verdict longtail review-tag">长尾</span>';
  if (row.verdict && verdictClass[row.verdict]) {
    return `<span class="review-tag ${verdictClass[row.verdict]} review-article-verdict">${e(row.verdict)}</span>`;
  }
  return '<span class="review-article-verdict unjudged" aria-label="未判定">—</span>';
}

function readsBar(readsValue,maxLog,verdictKey,provisional) {
  if (readsValue === null || readsValue <= 0 || maxLog <= 0) return '';
  const pct = Math.max(6, Math.min(100, Math.round(Math.log10(Math.max(readsValue, 1)) / maxLog * 100)));
  return `<svg class="review-rank-bar review-article-bar" viewBox="0 0 100 5" preserveAspectRatio="none" aria-hidden="true">` +
    `<rect class="review-rank-bar-track" width="100" height="5" rx="2.5"/>` +
    `<rect class="review-rank-bar-fill ${verdictKey}${provisional ? ' provisional' : ''}" width="${pct}" height="5" rx="2.5"/></svg>`;
}

function verdictMixBar(counts) {
  const total = counts.reduce((sum,n) => sum + n,0);
  if (!total) return '';
  const hitW = Math.round(counts[0] / total * 100);
  const midW = Math.round(counts[1] / total * 100);
  const flopW = Math.max(0, 100 - hitW - midW);
  return `<svg class="review-mix-bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">` +
    `<rect class="review-mix-hit" x="0" width="${hitW}" height="6"/>` +
    `<rect class="review-mix-middle" x="${hitW}" width="${midW}" height="6"/>` +
    `<rect class="review-mix-flop" x="${hitW + midW}" width="${flopW}" height="6"/></svg>`;
}

function rowHtml(row,observation,tags,dimensions,maxLog) {
  const published = articleListDate(row.published_at);
  const date = published.replace(/ (\d{2}:\d{2})$/, ' <span class="review-publish-clock">$1</span>');
  const titleTag = patternButton(tags,row,dimensions[0],'标','title');
  const articleTag = patternButton(tags,row,dimensions[1],'文','article');
  const patterns = (titleTag || articleTag) ? `<span class="review-row-patterns">${titleTag}${articleTag}</span>` : '';
  const identity = `<div class="review-article-identity">${verdictChip(row,observation)}` +
    `<div class="review-article-main">${titleButton(row)}<div class="review-article-meta">` +
    `<span class="review-article-date">${date}</span>${patterns}</div></div></div>`;
  const readsFormatted = e(formatReviewListMetric(observation,'reads'));
  const readsVal = metricValue(observation,'reads');
  const vKey = verdictClass[row.verdict] || 'unjudged';
  const provisional = observation.hours !== null && observation.hours < 24;
  const readsCell = (observation.hours === null ? readsFormatted :
    `<span title="发布后 ${e(reviewObservationHours(observation.hours))} 小时">${readsFormatted}</span>`) +
    readsBar(readsVal,maxLog,vKey,provisional);
  const cells = [identity, readsCell, ...metricColumns.slice(1).map(([key]) => e(formatReviewListMetric(observation,key)))];
  return `<tr data-review-row="${e(row.id)}">${columns.map(([key,label],index) =>
    `<td data-label="${label}" class="review-cell-${key}">${cells[index]}</td>`).join('')}</tr>`;
}

function table(headers,bodies) {
  return `<div class="review-table-wrap"><table class="review-table review-articles-table"><caption class="review-sr-only">文章表现</caption>` +
    `<thead><tr>${headers}</tr></thead>${bodies}</table></div>`;
}

function columnHeaders(sort) {
  return columns.map(([key,label,sortable]) => {
    if (!sortable) return `<th scope="col" class="review-cell-${key}">${label}</th>`;
    const direction = sort?.key === key ? sort.direction : !sort && key === 'published' ? 'descending' : '';
    const arrow = direction === 'ascending' ? '↑' : direction === 'descending' ? '↓' : '↕';
    return `<th scope="col" class="review-cell-${key}"${direction ? ` aria-sort="${direction}"` : ''}>` +
      `<button type="button" data-review-sort="${key}">${label} <span aria-hidden="true">${arrow}</span></button></th>`;
  }).join('');
}

function weekBody(week,lines) {
  const date = week.start ? `${week.start.slice(5)} 至 ${week.end.slice(5)}` : '发布时间未提供';
  return `<tbody><tr class="review-week-summary"><th scope="rowgroup" colspan="${columns.length}"><div>` +
    `<strong class="review-week-label">${date}</strong><span class="review-week-count">${week.rows.length} 篇</span>` +
    `${countsHtml(week.counts)}<span class="review-week-stat">阅读中位 <b>${e(medianText(week.reads,'reads'))}</b></span>` +
    `<span class="review-week-stat">点击中位 <b>${e(medianText(week.ctr,'ctr'))}</b></span>` +
    `<span class="review-week-stat">完读中位 <b>${e(medianText(week.completion_rate,'completion_rate'))}</b></span>` +
    `</div></th></tr>${lines(week.rows)}</tbody>`;
}

function patternGroup(group,dimension,headers,lines) {
  const few = group.rows.length < 5 ? '<span class="review-sample-badge">样本少</span>' : '';
  const rate = group.hitRate === null ? '—' : `${group.hitRate.toFixed(1)}%`;
  const hitTone = group.hitRate > 0 ? ' is-hitrate is-positive' : ' is-hitrate';
  return `<details class="review-article-group" data-review-keep-open="${e(JSON.stringify([dimension,group.name]))}"><summary>` +
    `<div class="review-group-top"><span class="review-article-group-name">${e(group.name)}</span>` +
    `<span class="review-group-count">${group.rows.length} 篇</span>${few}` +
    `<div class="review-group-mix">${verdictMixBar(group.counts)}${countsHtml(group.counts)}</div></div>` +
    `<dl class="review-article-group-figures">` +
    `<div class="${hitTone.trim()}"><dt>爆率</dt><dd>${rate}</dd></div>` +
    `<div><dt>阅读中位</dt><dd>${e(medianText(group.reads,'reads'))}</dd></div>` +
    `<div><dt>展现中位</dt><dd>${e(medianText(group.impressions,'impressions'))}</dd></div>` +
    `<div><dt>点击中位</dt><dd>${e(medianText(group.ctr,'ctr'))}</dd></div>` +
    `<div><dt>完读中位</dt><dd>${e(medianText(group.completion_rate,'completion_rate'))}</dd></div>` +
    `<div><dt>时长中位</dt><dd>${e(medianText(group.avg_read_seconds,'avg_read_seconds'))}</dd></div>` +
    `<div><dt>粉阅中位</dt><dd>${e(medianText(group.fan_reads,'fan_reads'))}</dd></div>` +
    `<div><dt>粉展中位</dt><dd>${e(medianText(group.fan_impressions,'fan_impressions'))}</dd></div>` +
    `</dl></summary>${table(headers,`<tbody>${lines(group.rows)}</tbody>`)}</details>`;
}

export function renderArticleList(rows,vm,snapshots,flagged,tag) {
  const now = vm.now || new Date().toISOString(), filters = vm.filters || {};
  const dimensions = availableDimensions(vm.tags,rows.filter(row => reviewPublishState(row) === 'published'));
  const group = filters.group && dimensions.includes(filters.group) ? filters.group : TABLE_VIEW;
  const {published,drafts,range} = filterArticles(rows,filters,vm.tags,now);
  const top = viewControls(dimensions,group,published.length) + articleFilters(filters,range) + draftBox(drafts) + flagged;
  if (!published.length) return top + '<div class="review-empty"><strong>当前筛选下没有文章</strong></div>';
  const byArticle = groupBy(snapshots || [],snapshot => String(snapshot.article_id));
  const observations = new Map(published.map(row => [row.id,reviewListObservation(row,byArticle.get(String(row.id)),now)]));
  const ordered = sortReviewArticles(published,observations,filters.sort);
  const maxReads = Math.max(10, ...ordered.map(row => metricValue(observations.get(row.id),'reads') ?? 0));
  const maxLog = Math.log10(maxReads);
  const stats = summary(ordered,observations);
  const lines = list => list.map(row => rowHtml(row,observations.get(row.id),vm.tags,dimensions,maxLog)).join('');
  const headers = columnHeaders(filters.sort);
  const kpis = summaryStrip(stats,ordered.length);
  if (group !== TABLE_VIEW) {
    const groups = articlePatternGroups(ordered,vm.tags,group,observations);
    return top + kpis + `<div class="review-article-groups">${groups.map(entry => patternGroup(entry,group,headers,lines)).join('')}</div>`;
  }
  const bodies = filters.sort ? `<tbody>${lines(ordered)}</tbody>` : articleWeekGroups(ordered,observations).map(week => weekBody(week,lines)).join('');
  return top + kpis + table(headers,bodies);
}
