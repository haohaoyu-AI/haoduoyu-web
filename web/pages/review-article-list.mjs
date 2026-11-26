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
// 头条导出的前 30 小时左右没有完读率和阅读时长：24 小时观测里没有这两项时，取最近一次有值的采集；其余指标只取 24 小时观测。
export const LATEST_METRICS = new Set(['completion_rate','avg_read_seconds']);
const metricColumns = [
  ['reads','24h 阅读',true],
  ['ctr','点击率',true],
  ['completion_rate','完读率',true],
  ['avg_read_seconds','阅读时长',true],
  ['impressions','展现量',false],
  ['fan_reads','粉丝阅读',false],
  ['fan_impressions','粉丝展现',false],
];
export const DENSITIES = ['compact','full'];
const columnsFor = density => [['published','文章',true], ...metricColumns.filter(([, ,core]) => density === 'full' || core)
  .map(([key,label]) => [key,label,true])];
const columns = columnsFor('full');
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

// Display roster only. Do not rewrite tags returned by GET /api/v1/review/ai/tags.
// Current names stay as written. The alias lists only absorb leftover old labels.
const PATTERN_ORDER = {
  title: ['中外交锋','引用外媒','身份反差','细节引大案'],
  article: ['两方对决','人物来路','败局复盘','预期反转'],
};
const PATTERN_PRESENTATION = {
  title: {
    '中外交锋': {aliases:['谁跟谁较劲']},
    '引用外媒': {aliases:['别人怎么说']},
    '身份反差': {aliases:['谁做了什么']},
    '细节引大案': {aliases:['一件小事引出大事']},
  },
  article: {
    '两方对决': {aliases:['双方怎么争','历史名场面与暗战纪实','脑洞怪题与硬核剥笋流']},
    '人物来路': {aliases:['一个人怎么走到这一步','市井切片与江湖高人传']},
    '败局复盘': {aliases:['事情怎么搞砸的','商业败局与作死复盘流']},
    '预期反转': {aliases:['为什么跟想的不一样']},
  },
};
// Retired backup names must not form their own group. Orphans stay out of the four current categories.
const PATTERN_RETIRED = ['赛博罪案与猫鼠博弈流','草根江湖与赛博淘金流','隐形冠军与暴利商战流'];
const PATTERN_ORPHANS = ['悬念问答','暴利数字','败局揭底'];
const PATTERN_OTHER = '其他';
const PATTERN_ALIASES = Object.fromEntries(Object.entries(PATTERN_PRESENTATION).map(([kind,entries]) =>
  [kind,new Map(Object.entries(entries).flatMap(([name,{aliases = []}]) => aliases.map(alias => [alias,name])))]));
const RETIRED_PATTERNS = new Set(PATTERN_RETIRED);
const ORPHAN_PATTERNS = new Set(PATTERN_ORPHANS);
function patternKind(tags,dimension) {
  if (!dimension) return '';
  const [title,article] = articlePatternDimensions(tags);
  return dimension === title ? 'title' : dimension === article ? 'article' : '';
}
function displayPattern(kind,name) {
  if (!name) return '';
  const aliased = PATTERN_ALIASES[kind]?.get(name);
  if (aliased) return aliased;
  if (RETIRED_PATTERNS.has(name) || ORPHAN_PATTERNS.has(name)) return PATTERN_OTHER;
  return name;
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

function metricSnapshot(observation,key) {
  if (!LATEST_METRICS.has(key) || finiteNumber(observation?.snapshot?.[key]) !== null) return observation?.snapshot;
  return observation?.latest?.snapshot || observation?.snapshot;
}
function metricValue(observation,key) {
  const value = finiteNumber(metricSnapshot(observation,key)?.[key]);
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

const tailRank = name => name === '未分类' ? 2 : name === PATTERN_OTHER ? 1 : 0;
const byPerformance = (a,b) => tailRank(a.name) - tailRank(b.name) || (a.rows.length < 5) - (b.rows.length < 5) ||
  (b.hitRate ?? -1) - (a.hitRate ?? -1) || (b.reads ?? -1) - (a.reads ?? -1) || a.name.localeCompare(b.name,'zh-CN');

function patternGroupEntry(name,groupRows,rawNames,kind,observations) {
  const presentation = PATTERN_PRESENTATION[kind]?.[name] || {};
  const observed = new Set(groupRows.map(row => rawNames.get(row)).filter(Boolean));
  const legacyNames = (presentation.aliases || []).filter(alias => observed.has(alias));
  if (name === PATTERN_OTHER) for (const orphan of PATTERN_ORPHANS) if (observed.has(orphan)) legacyNames.push(orphan);
  const retired = name === PATTERN_OTHER ? PATTERN_RETIRED.filter(item => observed.has(item)) : [];
  const note = retired.length ? `旧备用名，须重打：${retired.join('、')}` : (presentation.note || '');
  return {name,rows:groupRows,legacyNames,note,...summary(groupRows,observations)};
}

export function articlePatternGroups(rows,tags,dimension,observations) {
  const kind = patternKind(tags,dimension);
  const rawNames = new Map(rows.map(row => [row,patternValue(tags,row.id,dimension)]));
  const grouped = groupBy(rows,row => displayPattern(kind,rawNames.get(row)) || '未分类');
  const listed = new Set(PATTERN_ORDER[kind] || []);
  const entries = [...listed].map(name => patternGroupEntry(name,grouped.get(name) || [],rawNames,kind,observations));
  const rest = [...grouped.entries()]
    .filter(([name,list]) => !listed.has(name) && list.length)
    .map(([name,list]) => patternGroupEntry(name,list,rawNames,kind,observations))
    .sort(byPerformance);
  return [...entries,...rest];
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
  const pattern = filters.pattern;
  const kind = patternKind(tags,pattern?.dimension);
  const patternName = displayPattern(kind,pattern?.name);
  return {
    range,
    published:rows.filter(row => reviewPublishState(row) === 'published' && filterDate(row.published_at,from,today) &&
      matchesTitle(row) && (!filters.verdict || row.verdict === filters.verdict) &&
      (!pattern || displayPattern(kind,patternValue(tags,row.id,pattern.dimension)) === patternName)),
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

function viewControls(dimensions,group,count,density) {
  const views = [[TABLE_VIEW,'全部文章'],[dimensions[0],'标题套路'],[dimensions[1],'文章套路']];
  const densityButton = (value,label) => `<button type="button" class="btn" data-review-density="${value}" ` +
    `aria-pressed="${density === value}">${label}</button>`;
  return `<div class="segmented review-view-switch" role="group" aria-label="文章列表显示方式">` +
    views.map(([value,label]) => `<button type="button" class="btn" data-review-view="${e(value || '')}" ` +
      `aria-pressed="${Boolean(value) && group === value}"${value ? '' : ' disabled title="还没有套路标签"'}>${label}</button>`).join('') +
    `</div><div class="review-view-actions"><span class="review-view-count">已发布 <b>${count}</b> 篇${dimensions.some(Boolean) ? '' : ' · 还没有套路标签'}</span>` +
    `<div class="segmented review-density-switch" role="group" aria-label="显示多少指标">${densityButton('compact','精简')}` +
    `${densityButton('full','完整')}</div>` +
    `<button class="btn text" type="button" data-review-action="toggle-fullscreen" aria-pressed="false">全屏展示</button></div>`;
}

function articleFilters(filters,range) {
  const dates = choose([['7d','近 7 天'],['30d','近 30 天'],['all','全部时间']],range);
  const choices = choose([['','全部判定'],...verdicts.map(verdict => [verdict,'只看' + verdict])],filters.verdict || '');
  const pattern = filters.pattern;
  return `<div class="review-filters review-article-filters"><select class="input" data-review-filter="range" aria-label="发布时间">${dates}</select>` +
    `<select class="input" data-review-filter="verdict" aria-label="表现判定">${choices}</select>` +
    `<input type="search" class="input review-article-search" data-review-search aria-label="标题关键词" ` +
    `value="${e(filters.query || '')}" placeholder="搜索标题">` +
    (pattern ? `<button type="button" class="btn review-pattern-filter" data-review-pattern-clear ` +
      `aria-label="移除套路筛选：${e(pattern.dimension)} · ${e(pattern.name)}">${e(pattern.name)} ×</button>` : '') + '</div>';
}

const medianText = (value,key) => formatReviewListMetric({snapshot:{[key]:value}},key);
const countsHtml = counts => verdicts.map((label,i) =>
  `<span class="review-count-pill ${verdictClass[label]}">${label} <b>${counts[i]}</b></span>`).join('');

// One line instead of four cards: the same medians, readable at a glance.
function summaryStrip(stats,total,density) {
  const rate = stats.hitRate === null ? '—' : `${stats.hitRate.toFixed(1)}%`;
  const item = (label,value) => `<span class="review-summary-item">${label} <b>${e(value)}</b></span>`;
  const extra = density === 'full' ? item('展现中位',medianText(stats.impressions,'impressions')) +
    item('粉丝阅读中位',medianText(stats.fan_reads,'fan_reads')) + item('粉丝展现中位',medianText(stats.fan_impressions,'fan_impressions')) : '';
  return `<div class="review-article-summary" aria-label="当前筛选汇总"><span class="review-summary-total">${total} 篇</span>` +
    `${countsHtml(stats.counts)}${item('爆率',rate)}${item('阅读中位',medianText(stats.reads,'reads'))}` +
    `${item('点击中位',medianText(stats.ctr,'ctr'))}${item('完读中位',medianText(stats.completion_rate,'completion_rate'))}` +
    `${item('时长中位',medianText(stats.avg_read_seconds,'avg_read_seconds'))}${extra}</div>`;
}

function titleButton(row) {
  const title = e(row.title || '未命名文章');
  return `<button type="button" class="review-title-button" data-review-article="${e(row.id)}" ` +
    `aria-haspopup="dialog" title="${title}">${title}</button>`;
}

function draftBox(rows) {
  if (!rows.length) return '';
  return `<details class="review-article-drafts" data-review-keep-open="drafts"><summary>草稿箱 ${rows.length} 篇</summary>` +
    `<ul>${rows.map(row => `<li><time>${e(articleListDate(row.draft_saved_at || row.created_at))}</time>` +
      `${titleButton(row)}</li>`).join('')}</ul></details>`;
}

// Pattern names as quiet text on the meta line; clicking one filters the list to that pattern.
function patternButton(tags,row,dimension,kind) {
  const name = displayPattern(kind,patternValue(tags,row.id,dimension));
  if (!name) return '';
  return `<button type="button" class="review-pattern-label is-${kind}" data-review-pattern="${e(name)}" ` +
    `data-review-dimension="${e(dimension)}" title="${kind === 'title' ? '标题套路' : '文章套路'}：${e(name)}，点击只看这一类">${e(name)}</button>`;
}

export function renderDetailPatterns(row,tags) {
  const labels = ['标题套路','文章套路'];
  return `<dl class="review-detail-patterns">${articlePatternDimensions(tags).map((dimension,index) => {
    const raw = patternValue(tags,row.id,dimension);
    const shown = displayPattern(patternKind(tags,dimension),raw) || raw;
    return `<div><dt>${labels[index]}</dt><dd>${e(shown || '—')}</dd></div>`;
  }).join('')}</dl>`;
}

function verdictChip(row,observation) {
  if (observation.kind === 'longtail') return '<span title="发布 72 小时后才有数据" class="review-article-verdict longtail review-tag">长尾</span>';
  if (row.verdict && verdictClass[row.verdict]) {
    return `<span class="review-tag ${verdictClass[row.verdict]} review-article-verdict">${e(row.verdict)}</span>`;
  }
  return '<span class="review-article-verdict unjudged" aria-label="未判定"></span>';
}

function readsBar(readsValue,maxLog,verdictKey,provisional) {
  if (readsValue === null || readsValue <= 0 || maxLog <= 0) return '';
  const pct = Math.max(6, Math.min(100, Math.round(Math.log10(Math.max(readsValue, 1)) / maxLog * 100)));
  return `<svg class="review-rank-bar review-article-bar" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">` +
    `<rect class="review-rank-bar-track" width="100" height="4" rx="2"/>` +
    `<rect class="review-rank-bar-fill ${verdictKey}${provisional ? ' provisional' : ''}" width="${pct}" height="4" rx="2"/></svg>`;
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

function metricCell(observation,key) {
  const text = e(formatReviewListMetric({snapshot:metricSnapshot(observation,key)},key));
  if (!LATEST_METRICS.has(key) || text === '—' || metricSnapshot(observation,key) === observation?.snapshot) return text;
  const hours = observation?.latest?.hours;
  if (hours === null || hours === undefined) return text;
  const title = `24 小时数据里还没有，这是发布后 ${e(reviewObservationHours(hours))} 小时的采集`;
  return `<span class="review-latest-value" title="${title}">${text}</span>`;
}

function rowHtml(row,observation,tags,dimensions,maxLog,cols) {
  const published = articleListDate(row.published_at);
  const patterns = [patternButton(tags,row,dimensions[0],'title'),patternButton(tags,row,dimensions[1],'article')].filter(Boolean);
  const identity = `<div class="review-article-identity">${verdictChip(row,observation)}` +
    `<div class="review-article-main">${titleButton(row)}<div class="review-article-meta">` +
    `<span class="review-article-date">${e(published)}</span>${patterns.map(item => '<span aria-hidden="true">·</span>' + item).join('')}` +
    `</div></div></div>`;
  const readsFormatted = observation.kind === 'immature' ? '未满24h' : e(formatReviewListMetric(observation,'reads'));
  const readsVal = metricValue(observation,'reads');
  const vKey = verdictClass[row.verdict] || 'unjudged';
  const provisional = observation.hours !== null && observation.hours < 24;
  const readsCell = (observation.hours === null ? readsFormatted :
    `<span title="发布后 ${e(reviewObservationHours(observation.hours))} 小时">${readsFormatted}</span>`) +
    readsBar(readsVal,maxLog,vKey,provisional);
  const cell = key => key === 'published' ? identity : key === 'reads' ? readsCell : metricCell(observation,key);
  return `<tr data-review-row="${e(row.id)}">${cols.map(([key,label]) =>
    `<td data-label="${label}" class="review-cell-${key}">${cell(key)}</td>`).join('')}</tr>`;
}

function table(headers,bodies,density) {
  return `<div class="review-table-wrap"><table class="review-table review-articles-table is-${density}"><caption class="review-sr-only">文章表现</caption>` +
    `<thead><tr>${headers}</tr></thead>${bodies}</table></div>`;
}

function columnHeaders(sort,cols) {
  return cols.map(([key,label,sortable]) => {
    const text = key === 'published' ? '文章 / 发布时间' : label;
    const note = LATEST_METRICS.has(key) ? '<sup class="review-latest-mark" title="24 小时数据没有这一项时，取最近一次采集">*</sup>' : '';
    if (!sortable) return `<th scope="col" class="review-cell-${key}">${text}</th>`;
    const direction = sort?.key === key ? sort.direction : !sort && key === 'published' ? 'descending' : '';
    const arrow = direction === 'ascending' ? '↑' : direction === 'descending' ? '↓' : '';
    return `<th scope="col" class="review-cell-${key}"${direction ? ` aria-sort="${direction}"` : ''}>` +
      `<button type="button" data-review-sort="${key}">${text}${note}<span aria-hidden="true">${arrow}</span></button></th>`;
  }).join('');
}

function weekBody(week,lines,cols) {
  const date = week.start ? `${week.start.slice(5).replace('-','月')}日 – ${week.end.slice(5).replace('-','月')}日` : '发布时间未提供';
  return `<tbody><tr class="review-week-summary"><th scope="rowgroup" colspan="${cols.length}"><div>` +
    `<strong class="review-week-label">${date}</strong><span class="review-week-count">${week.rows.length} 篇</span>` +
    `${countsHtml(week.counts)}<span class="review-week-stat">阅读中位 <b>${e(medianText(week.reads,'reads'))}</b></span>` +
    `<span class="review-week-stat">点击中位 <b>${e(medianText(week.ctr,'ctr'))}</b></span>` +
    `</div></th></tr>${lines(week.rows)}</tbody>`;
}

function patternGroup(group,dimension,headers,lines,density) {
  const few = group.rows.length > 0 && group.rows.length < 5 ? '<span class="review-sample-badge" title="少于 5 篇，结论先别当真">样本少</span>' : '';
  const rate = group.hitRate === null ? '—' : `${group.hitRate.toFixed(1)}%`;
  const annotations = [
    group.legacyNames.length ? `含旧名：${group.legacyNames.join('、')}` : '',
    group.note,
  ].filter(Boolean).map(note => `<span class="review-group-count">${e(note)}</span>`).join('');
  const figure = (label,value,css = '') => `<div${css ? ` class="${css}"` : ''}><dt>${label}</dt><dd>${e(value)}</dd></div>`;
  const full = density === 'full' ? figure('展现中位',medianText(group.impressions,'impressions')) +
    figure('粉丝阅读中位',medianText(group.fan_reads,'fan_reads')) + figure('粉丝展现中位',medianText(group.fan_impressions,'fan_impressions')) : '';
  return `<details class="review-article-group" data-review-keep-open="${e(JSON.stringify([dimension,group.name]))}"><summary>` +
    `<span class="review-article-group-name">${e(group.name)}</span>${annotations}<span class="review-group-count">${group.rows.length} 篇</span>${few}` +
    `<span class="review-group-mix">${verdictMixBar(group.counts)}${countsHtml(group.counts)}</span>` +
    `<dl class="review-article-group-figures">${figure('爆率',rate,group.hitRate > 0 ? 'is-hitrate is-positive' : 'is-hitrate')}` +
    `${figure('阅读中位',medianText(group.reads,'reads'))}${figure('点击中位',medianText(group.ctr,'ctr'))}` +
    `${figure('完读中位',medianText(group.completion_rate,'completion_rate'))}${figure('时长中位',medianText(group.avg_read_seconds,'avg_read_seconds'))}` +
    `${full}</dl></summary>${group.rows.length ? table(headers,`<tbody>${lines(group.rows)}</tbody>`,density) : ''}</details>`;
}

// The latest snapshot of an article that has a given metric (完读率 and 阅读时长 arrive only after about 30 hours).
function latestObservation(snapshots) {
  let best = null;
  for (const snapshot of snapshots || []) {
    if (finiteNumber(snapshot?.completion_rate) === null && finiteNumber(snapshot?.avg_read_seconds) === null) continue;
    const hours = finiteNumber(snapshot.age_hours);
    const rank = [hours ?? -1, String(snapshot.snapshot_date || ''), String(snapshot.id || '')];
    if (!best || rank[0] > best.rank[0] || rank[0] === best.rank[0] && (rank[1] > best.rank[1] || rank[1] === best.rank[1] && rank[2] > best.rank[2]))
      best = {snapshot,hours,rank};
  }
  return best ? {snapshot:best.snapshot,hours:best.hours} : null;
}

export function articleDensity(value) { return DENSITIES.includes(value) ? value : 'compact'; }

export function renderArticleList(rows,vm,snapshots,flagged,tag) {
  const now = vm.now || new Date().toISOString(), filters = {...vm.filters};
  if (filters.pattern) {
    const {dimension,name} = filters.pattern;
    filters.pattern = {dimension,name:displayPattern(patternKind(vm.tags,dimension),name)};
  }
  const density = articleDensity(filters.density), cols = columnsFor(density);
  const dimensions = availableDimensions(vm.tags,rows.filter(row => reviewPublishState(row) === 'published'));
  const group = filters.group && dimensions.includes(filters.group) ? filters.group : TABLE_VIEW;
  const {published,drafts,range} = filterArticles(rows,filters,vm.tags,now);
  const status = draftBox(drafts) + flagged;
  const top = `<div class="review-view-row">${viewControls(dimensions,group,published.length,density)}</div>` +
    articleFilters(filters,range) + (status ? `<div class="review-article-status">${status}</div>` : '');
  if (!published.length) return top + '<div class="review-empty"><strong>当前筛选下没有文章</strong></div>';
  const byArticle = groupBy(snapshots || [],snapshot => String(snapshot.article_id));
  const observations = new Map(published.map(row => {
    const own = byArticle.get(String(row.id));
    return [row.id,{...reviewListObservation(row,own,now),latest:latestObservation(own)}];
  }));
  const ordered = sortReviewArticles(published,observations,filters.sort);
  const maxReads = Math.max(10, ...ordered.map(row => metricValue(observations.get(row.id),'reads') ?? 0));
  const maxLog = Math.log10(maxReads);
  const stats = summary(ordered,observations);
  const lines = list => list.map(row => rowHtml(row,observations.get(row.id),vm.tags,dimensions,maxLog,cols)).join('');
  const headers = columnHeaders(filters.sort,cols);
  const note = '<p class="review-latest-note">* 头条 24 小时数据常常还没有完读率和阅读时长，缺的时候取最近一次采集（鼠标停在数字上看是发布后几小时）；其余指标都是发布后 24 小时。</p>';
  const head = summaryStrip(stats,ordered.length,density);
  if (group !== TABLE_VIEW) {
    const groups = articlePatternGroups(ordered,vm.tags,group,observations);
    // A pattern filter already removed the other articles. Don't paint those groups as 0.
    const shown = filters.pattern ? groups.filter(entry => entry.rows.length) : groups;
    return top + head + `<div class="review-article-groups">${shown.map(entry => patternGroup(entry,group,headers,lines,density)).join('')}</div>` + note;
  }
  const bodies = filters.sort ? `<tbody>${lines(ordered)}</tbody>` :
    articleWeekGroups(ordered,observations).map(week => weekBody(week,lines,cols)).join('');
  return top + head + table(headers,bodies,density) + note;
}
