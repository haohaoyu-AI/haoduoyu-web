import {e} from '../core/dom.mjs';
import {day, finiteNumber, reviewDateTime, shiftDay} from '../core/review-data.mjs';
import {formatReviewListMetric} from '../core/review-list-metrics.mjs';
import {reviewListObservation, reviewObservationHours} from '../core/review-list-observation.mjs';
import {activityArticles, recentArticles} from '../../shared/review-analytics.mjs';
import {reviewPublishState} from '../../shared/review-publish-state.mjs';

const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
const verdicts = ['爆','中','扑'];
const columns = [
  ['published','发布时间',true], ['title','标题'], ['title-pattern','标题套路'], ['article-pattern','文章套路'],
  ['reads','24h 阅读',true], ['ctr','点击率',true], ['completion_rate','完成率',true], ['verdict','判定']
];
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

function summary(rows) {
  const counts = verdicts.map(verdict => rows.filter(row => row.verdict === verdict).length);
  const judged = counts.reduce((total,count) => total + count,0);
  return {counts,hitRate:judged ? 100 * counts[0] / judged : null,
    reads:middle(rows.map(row => row.reads_24h)),ctr:middle(rows.map(row => row.ctr_24h))};
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
export function articlePatternGroups(rows,tags,dimension) {
  return [...groupBy(rows,row => patternValue(tags,row.id,dimension) || '未分类')]
    .map(([name,rows]) => ({name,rows,...summary(rows)}))
    .sort((a,b) => tailRank(a.name) - tailRank(b.name) || (a.rows.length < 5) - (b.rows.length < 5) ||
      (b.hitRate ?? -1) - (a.hitRate ?? -1) || (b.reads ?? -1) - (a.reads ?? -1) || a.name.localeCompare(b.name,'zh-CN'));
}

export function articleWeekGroups(rows) {
  return [...groupBy(rows,row => {
    const date = day(row.published_at);
    return date ? shiftDay(date,-((weekday(date) + 6) % 7)) : '';
  })].map(([start,rows]) => ({start,end:shiftDay(start,6),rows,...summary(rows)}));
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
  const value = row => {
    const metric = finiteNumber(observations.get(row.id)?.snapshot?.[key]);
    return metric !== null && metric >= 0 && (key === 'reads' || metric <= 100) ? metric : null;
  };
  if (key === 'published') {
    return [...rows].sort((a,b) => Number(!day(a.published_at)) - Number(!day(b.published_at)) || -direction * recentArticles(a,b));
  }
  return [...rows].sort((a,b) => compareNullable(value(a),value(b),direction) || recentArticles(a,b));
}

const choose = (choices,value) => choices.map(([id,label]) =>
  `<option value="${e(id)}"${id === value ? ' selected' : ''}>${e(label)}</option>`).join('');

function viewControls(dimensions,group,count) {
  const views = [[TABLE_VIEW,'总表'],[dimensions[0],'按标题套路'],[dimensions[1],'按文章套路']];
  return `<div class="review-view-row"><div class="segmented review-view-switch" role="group" aria-label="文章列表显示方式">` +
    views.map(([value,label]) => `<button type="button" class="btn" data-review-view="${e(value || '')}" ` +
      `aria-pressed="${Boolean(value) && group === value}"${value ? '' : ' disabled title="还没有套路标签"'}>${label}</button>`).join('') +
    `</div><span class="review-view-count">已发布 ${count}${dimensions.some(Boolean) ? '' : ' · 还没有套路标签'}</span></div>`;
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

function patternButton(tags,row,dimension) {
  const name = patternValue(tags,row.id,dimension);
  return name ? `<button type="button" class="review-pattern-label" data-review-pattern="${e(name)}" ` +
    `data-review-dimension="${e(dimension)}" title="${e(name)}">${e(name)}</button>` : '—';
}

export function renderDetailPatterns(row,tags) {
  const labels = ['标题套路','文章套路'];
  return `<dl class="review-detail-patterns">${articlePatternDimensions(tags).map((dimension,index) =>
    `<div><dt>${labels[index]}</dt><dd>${e(patternValue(tags,row.id,dimension) || '—')}</dd></div>`).join('')}</dl>`;
}

function rowHtml(row,observation,tags,dimensions,tag) {
  const judgement = observation.kind === 'longtail' ? '<span class="review-tag">长尾</span>' : row.verdict ? tag(row.verdict) : '—';
  const published = articleListDate(row.published_at);
  const date = published.replace(/ (\d{2}:\d{2})$/, ' <span class="review-publish-clock">$1</span>');
  const reads = e(formatReviewListMetric(observation,'reads'));
  const observed = observation.hours === null ? reads :
    `<span title="发布后 ${e(reviewObservationHours(observation.hours))} 小时">${reads}</span>`;
  const cells = [date,titleButton(row),...dimensions.map(dimension => patternButton(tags,row,dimension)),observed,
    ...['ctr','completion_rate'].map(key => e(formatReviewListMetric(observation,key))),judgement];
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

const medianText = (value,key) => formatReviewListMetric({snapshot:{[key]:value}},key);
const countsText = counts => verdicts.map((label,i) => `<span>${label} <b>${counts[i]}</b></span>`).join('');

function weekBody(week,lines) {
  const date = week.start ? `${week.start.slice(5)} 至 ${week.end.slice(5)}` : '发布时间未提供';
  return `<tbody><tr class="review-week-summary"><th scope="rowgroup" colspan="8"><div><strong>${date}</strong>` +
    `<span>${week.rows.length} 篇</span>${countsText(week.counts)}<span>阅读中位 ${medianText(week.reads,'reads')}</span>` +
    `</div></th></tr>${lines(week.rows)}</tbody>`;
}

function patternGroup(group,dimension,headers,lines) {
  const few = group.rows.length < 5 ? ' <small class="review-note">样本少</small>' : '';
  const rate = group.hitRate === null ? '—' : `${group.hitRate.toFixed(1)}%`;
  return `<details class="review-article-group" data-review-keep-open="${e(JSON.stringify([dimension,group.name]))}"><summary>` +
    `<span class="review-article-group-name">${e(group.name)}${few}</span><span class="review-article-group-figures">` +
    `<span><b>${group.rows.length}</b> 篇</span>${countsText(group.counts)}<span>爆率 <b>${rate}</b></span>` +
    `<span>24h 阅读中位 <b>${medianText(group.reads,'reads')}</b></span><span>点击率中位 <b>${medianText(group.ctr,'ctr')}</b></span>` +
    `</span></summary>${table(headers,`<tbody>${lines(group.rows)}</tbody>`)}</details>`;
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
  const lines = list => list.map(row => rowHtml(row,observations.get(row.id),vm.tags,dimensions,tag)).join('');
  const headers = columnHeaders(filters.sort);
  if (group !== TABLE_VIEW) {
    const groups = articlePatternGroups(ordered,vm.tags,group);
    return top + `<div class="review-article-groups">${groups.map(entry => patternGroup(entry,group,headers,lines)).join('')}</div>`;
  }
  const bodies = filters.sort ? `<tbody>${lines(ordered)}</tbody>` : articleWeekGroups(ordered).map(week => weekBody(week,lines)).join('');
  return top + table(headers,bodies);
}
