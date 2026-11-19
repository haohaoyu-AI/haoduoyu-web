import {e} from '../core/dom.mjs';
import {safeReviewUrl} from '../core/review-markdown.mjs';
import {
  archiveAssociation,archiveDate,archiveGroups,archiveKinds,archiveLabels,archiveMetrics,archiveMissing,archiveProduction,
  archivePublication,archiveTimeLabels,archiveTitle
} from '../core/review-archive-state.mjs';

const reviewHref = '?page=review&amp;account=V%E5%AD%97';
const views = {items:'文章档案',completeness:'完整性检查',imports:'导入与对账',reports:'报告版本'};
const filterChoices = [
  ['kind','内容类型',archiveKinds],['production_status','制作状态',archiveProduction],
  ['publication_status','发布状态',archivePublication],['association_status','原稿关联',archiveAssociation]
];
const metricColumns = ['reads','impressions','ctr','interactions','likes','comments','shares','favorites','reposts'];
const refKind = {draft:'草稿',publication:'发布',published:'发布'};
const refRole = {primary:'主要版本',duplicate:'重复草稿',other:'关联版本'};

export const archiveButton = (action,label,extra='') =>
  `<button class="btn" type="button" data-archive-action="${e(action)}"${extra}>${e(label)}</button>`;
const description = (title,value) => `<div><dt>${e(title)}</dt><dd>${value}</dd></div>`;
const message = value => `<p class="review-note">${e(value)}</p>`;
export const archiveEmpty = value => `<p class="review-empty">${e(value)}</p>`;
export function archivePanel(title,html) {
  return `<section class="review-panel"><h3>${e(title)}</h3>${html}</section>`;
}

export function renderReviewArchiveShell(allowed) {
  const beginning = '<section id="review-archive" class="content-review review-archive" aria-label="V字档案">';
  if (allowed) return beginning + '<p class="review-status" role="status">正在读取档案…</p></section>';
  return beginning + '<div class="review-empty"><strong>此档案仅对站点所有者开放</strong>' +
    `<p><a href="${reviewHref}">返回内容复盘</a></p></div></section>`;
}

export function renderArchiveFrame(view,body,{error='',notice=''}={}) {
  const tabs = Object.entries(views).map(([key,label]) => `<button type="button" data-archive-action="view" ` +
    `data-archive-view="${key}" aria-pressed="${view === key}">${label}</button>`).join('');
  const feedback = error ? `<p class="review-archive-alert" role="alert">${e(error)}</p>` :
    notice ? `<p class="review-note" role="status">${e(notice)}</p>` : '';
  return `<div class="review-panel-head"><h2>V字档案</h2><a class="btn text" href="${reviewHref}">返回内容复盘</a></div>` +
    `<nav class="review-secondary-tabs review-archive-tabs" aria-label="档案页面">${tabs}</nav>${feedback}${body}`;
}

function archiveOverview(overview) {
  if (!overview) return '';
  const {counts={},metrics={},attribution={}}=overview;
  const totals = [['published','已发布'],['pending','待发布'],['scheduled','定时'],['deleted','已删除'],
    ['association_pending','原稿待核'],['undated','无日期']];
  const countsHtml = totals.filter(([key])=>Number.isFinite(counts[key])).map(([key,label])=>description(label,e(counts[key]))).join('');
  const metricsHtml = [['reads','阅读'],['impressions','展现'],['ctr','平均点击率']].map(([key,label])=>{
    const value=metrics[key];
    return value ? description(label,`${metricValue({[key]:value.value},key)} <small>${e(value.unknown)} 篇缺值</small>`) : '';
  }).join('');
  const attributionHtml = Number.isFinite(attribution.eligible) ?
    description('可作样本归因',`${e(attribution.eligible)} 篇 <small>${e(attribution.excluded)} 篇不计归因</small>`) : '';
  const cards = countsHtml+metricsHtml+attributionHtml;
  return cards ? `<dl class="review-archive-grid review-archive-totals">${cards}</dl>` : '';
}

export function archiveSelect(name,choices,selected,first='') {
  const empty = first ? `<option value="">${e(first)}</option>` : '';
  const options = Object.entries(choices).map(([key,label]) =>
    `<option value="${e(key)}"${key===selected?' selected':''}>${e(label)}</option>`).join('');
  return `<select class="input" name="${e(name)}">${empty}${options}</select>`;
}

function archiveFilters(filters) {
  const selects = filterChoices.map(([name,label,choices]) =>
    `<label>${label}${archiveSelect(name,choices,filters[name] || '','全部')}</label>`).join('');
  const dates = [['from','起始日期'],['to','结束日期']].map(([key,label]) =>
    `<label>${label}<input class="input" type="date" name="${key}" value="${e(filters[key] || '')}"></label>`).join('');
  return `<form class="review-filters" data-archive-form="filter">${selects}${dates}<button class="btn" type="submit">筛选</button>` +
    `${archiveButton('reset-filters','清除筛选')}</form>`;
}

function archiveBadges(row) {
  const parts = [archiveKinds[row.kind],archiveProduction[row.production_status],archivePublication[row.publication_status],
    archiveAssociation[row.association_status]].filter(Boolean);
  return `<span class="review-archive-badges">${parts.map(x=>`<span class="review-publish">${e(x)}</span>`).join('')}</span>`;
}

function renderListRow(row) {
  return `<li class="review-archive-row"><button type="button" class="review-title-button" data-archive-action="detail" ` +
    `data-archive-id="${e(row.id)}">${e(archiveTitle(row))}</button>${archiveBadges(row)}` +
    `<span class="review-note">${e(archiveDate(row.sort_at,'无日期'))}</span></li>`;
}

export function renderArchiveItems({items=[],filters={},more=false,overview=null,loading=false}={}) {
  const header = `<div class="review-toolbar">${archiveButton('create','新增档案')}${archiveButton('legacy','查看现有复盘')}` +
    `${archiveButton('refresh','重新读取')}</div>`;
  const groups = archiveGroups(items).map(({date,rows}) =>
    `<section class="review-archive-group"><h3>${e(date || '无日期')}</h3><ul>${rows.map(renderListRow).join('')}</ul></section>`).join('');
  const list = groups || (!loading ? archiveEmpty('没有符合条件的档案。') : '');
  const tail = loading ? '<p role="status">正在读取档案…</p>' : more ? archiveButton('more','读取下一页') : '';
  return `<div class="review-archive-stack">${archiveOverview(overview)}${header}${archiveFilters(filters)}${list}${tail}</div>`;
}

export function renderArchiveLegacyPage(page) {
  const rows = (page.items || []).map(row => `<li class="review-archive-row">` +
    `<button class="review-title-button" type="button" data-archive-action="legacy-select" data-archive-id="${e(row.legacy_id)}">` +
    `${e(archiveTitle(row))} · 归档</button><span>${e(row.platform_article_id || '编号未填')}</span></li>`).join('');
  return `<div class="review-archive-stack">${archiveButton('back','返回文章档案')}` +
    `${archivePanel('现有复盘记录',rows ? `<ul class="review-archive-items">${rows}</ul>` : archiveEmpty('没有现有复盘记录。'))}` +
    `${page.more ? archiveButton('legacy-more','读取下一页') : ''}</div>`;
}

export function archiveLink(value,label='打开链接') {
  const url = safeReviewUrl(value);
  if (!url) return '';
  const parsed = new URL(url);
  if (parsed.username || parsed.password) return '';
  return `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(label)}</a>`;
}

function dataValue(row,field) {
  const value = row[field], state = row.field_states?.[field];
  if (value == null || value === '' || Array.isArray(value) && !value.length) {
    return e(archiveMissing(state || (Array.isArray(value) ? 'none' : 'missing')));
  }
  return `${e(value)}${state==='unverified'||state==='unknown'?' <small>无法核实</small>':''}`;
}

function timeValue(row,field) {
  return e(archiveDate(row[field],archiveMissing(row.field_states?.[field])));
}

function renderTitles(row) {
  const alternate = Array.isArray(row.alternate_titles) && row.alternate_titles.length ?
    `<ol>${row.alternate_titles.map(title=>`<li>${e(title)}</li>`).join('')}</ol>` : dataValue(row,'alternate_titles');
  const titleRows = ['original_title','published_title','alternate_titles'].map(field =>
    description(archiveLabels[field],field==='alternate_titles'?alternate:dataValue(row,field))).join('');
  return archivePanel('标题变化',`<dl class="review-archive-grid">${titleRows}</dl>`);
}

function renderTimeline(row) {
  const values = Object.entries(archiveTimeLabels).filter(([field])=>field!=='sample_published_at')
    .map(([field,label])=>description(label,timeValue(row,field))).join('');
  return archivePanel('制作与发布时间（北京时间）',`<dl class="review-archive-grid">${values}</dl>`);
}

function renderOrigin(row) {
  const sourceNote = dataValue(row,'source_note');
  const sampled = row.sample || {};
  const info = {...row,sample_title:row.sample_title || sampled.title,sample_url:row.sample_url || sampled.url,
    sample_published_at:row.sample_published_at || sampled.published_at};
  const sample = [
    description('样本标题',dataValue(info,'sample_title')),description('样本链接',archiveLink(info.sample_url) || dataValue(info,'sample_url')),
    description('样本发布时间',timeValue(info,'sample_published_at')),description('样本库关联',dataValue(row,'sample_reference_id'))
  ].join('');
  const tags = Array.isArray(row.tags) && row.tags.length ? row.tags.map(e).join('、') : dataValue(row,'tags');
  const refs = `${description('平台链接',archiveLink(row.platform_url,'查看平台页面') || dataValue(row,'platform_url'))}` +
    `${description('来源说明',sourceNote)}${description('标签',tags)}`;
  return archivePanel('样本与来源说明',`<dl class="review-archive-grid">${sample}${refs}</dl>`);
}

function renderSources(row) {
  const sources = Array.isArray(row.sources) ? row.sources : [];
  const list = sources.length ? `<ol>${sources.map(source => `<li>${archiveLink(source.url,source.title || source.url) || e(source.title || source.url)}` +
    '</li>').join('')}</ol>` : `<p>${dataValue(row,'sources')}</p>`;
  return archivePanel('文末来源',list);
}

const imageLabel = {total:'总图数',real:'真实图数',ai:'AI 图数'};
function renderImages(row) {
  const counts = Object.entries(imageLabel).map(([key,label])=>description(label,
    row.images?.[key] == null ? e(archiveMissing(row.field_states?.[`images.${key}`] ?? row.field_states?.images)) : e(row.images[key]))).join('');
  const cover = row.cover ? archiveLink(row.cover.url,'打开封面记录') || e(row.cover.alt || '已有封面记录') : dataValue(row,'cover');
  const assets = Array.isArray(row.images?.assets) ? row.images.assets : [];
  const assetList = assets.length ? `<ol>${assets.map(asset => `<li>${archiveLink(asset.url,asset.alt || '打开配图记录') ||
    e(asset.alt || asset.kind || '已附配图记录')}</li>`).join('')}</ol>` : '';
  return archivePanel('AI 封面与配图',`<dl class="review-archive-grid">${counts}${description('AI 封面',cover)}</dl>${assetList}`);
}

function renderBodies(row) {
  return archivePanel('正文', ['original_body','published_body'].map(field => `<details><summary>${archiveLabels[field]}</summary>` +
    `<pre class="review-archive-text">${dataValue(row,field)}</pre></details>`).join(''));
}

function renderReference(ref,editable) {
  const identity = [refKind[ref.kind],ref.platform_id,refRole[ref.role]].filter(Boolean).map(e).join(' · ');
  const details = `<span class="review-note">${e(archiveDate(ref.saved_at))}</span>`;
  const edit = editable && ref.id ? archiveButton('edit-ref','更正',` data-archive-id="${e(ref.id)}"`) : '';
  const state = ref.state==='disputed' ? '<span class="review-note">存疑</span>' : '';
  return `<li><strong>${identity}</strong> ${archiveLink(ref.url,ref.title || '平台入口') || e(ref.title || '')} ${details}${state}${edit}</li>`;
}

function renderReferences(row) {
  const refs = Array.isArray(row.refs) ? row.refs : [];
  const list = refs.length ? `<ul>${refs.map(ref=>renderReference(ref,!row.merged_into&&ref.item_id===row.id)).join('')}</ul>` :
    archiveEmpty('尚无平台标识记录。');
  const legacy = row.legacy_ids?.length ? message(`关联现有复盘 ${row.legacy_ids.join('、')}`) : '';
  return archivePanel('平台标识',list+legacy);
}

function metricValue(metrics,key) {
  const value = metrics?.[key];
  if (value == null) return '未填';
  if (typeof value === 'number') {
    const formatted = new Intl.NumberFormat('zh-CN',{maximumFractionDigits:4}).format(value);
    return e(formatted + (['ctr','completion_rate'].includes(key) ? '%' : ''));
  }
  return e(typeof value === 'string' ? value : JSON.stringify(value));
}

function snapshotRow(snapshot,columns) {
  const metrics = snapshot.metrics || {};
  const when = archiveDate(snapshot.observed_at || snapshot.observed_date || snapshot.snapshot_date);
  const cells = columns.map(key=>`<td>${metricValue(metrics,key)}</td>`).join('');
  const source = snapshot.source==='legacy_review_date' ? `旧复盘 · ${snapshot.legacy_source || '来源未填'}` : snapshot.source || '未填';
  return `<tr><th scope="row">${e(when)}</th><td>${e(source)}</td>${cells}</tr>`;
}

export function renderArchiveSnapshots(snapshots=[]) {
  if (!snapshots.length) return archivePanel('指标历史',archiveEmpty('没有快照。'));
  const keys = new Set(metricColumns);
  for (const row of snapshots) for (const name of Object.keys(row.metrics || {})) keys.add(name);
  const columns = [...keys];
  const heading = columns.map(key=>`<th scope="col">${e(archiveMetrics[key] || key)}</th>`).join('');
  const rows = snapshots.map(row=>snapshotRow(row,columns)).join('');
  return archivePanel('指标历史（北京时间）',`<div class="review-archive-table"><table><thead><tr><th scope="col">采集时间</th>` +
    `<th scope="col">来源</th>${heading}</tr></thead><tbody>${rows}</tbody></table></div>`);
}

function renderEvents(row) {
  const events = row.history || [];
  if (!events.length) return '';
  const rows = events.map(renderEvent).join('');
  return archivePanel('关联修订记录',`<ol>${rows}</ol>`);
}

function renderEvent(event) {
  const labels = {association:'关联纠错',merge:'合并',unmerge:'撤销合并',reference_corrected:'更正平台标识',
    reference_added:'登记平台标识',create:'创建档案',update:'更新档案',snapshot_added:'采集快照',import:'导入数据'};
  const details=event.details || {};
  const titles=Object.entries(details.titles || {}).map(([field,values])=>
    `<li>${e(archiveLabels[field] || field)}从「${e(values.before ?? '未填')}」变为「${e(values.after ?? '未填')}」</li>`).join('');
  const status=details.result ? ` · ${e(archiveAssociation[details.result] || details.result)}` : '';
  const confidence=details.confidence ? ` · 可信度 ${e(details.confidence==='manual'?'人工核对':details.confidence)}` : '';
  const values = Array.isArray(details.evidence) ? details.evidence : [];
  const evidence=values.length ? `<span class="review-note">${e(values.join('、'))}</span>` : '';
  return `<li>${e(archiveDate(event.created_at))} · ${e(labels[event.action] || event.action || '修订')}${status}${confidence} ` +
    `${e(details.reason || '')} ${e(details.related_id || '')}${evidence}${titles?`<ul>${titles}</ul>`:''}</li>`;
}

function renderVariants(row) {
  const variants=(row.variants || []).map(item=>`<li>${archiveButton('detail',archiveTitle(item),` data-archive-id="${e(item.id)}"`)}` +
    `<span class="review-note">档案标识 ${e(item.id)} · 版本 ${e(item.version)}</span></li>`).join('');
  return variants ? archivePanel('合并保留的版本',`<ul>${variants}</ul>`) : '';
}

export function renderArchiveDetail(row,editor='') {
  const changes = row.merged_into ? archiveButton('detail','查看主要档案',` data-archive-id="${e(row.merged_into)}"`) :
    archiveButton('edit','编辑档案') + archiveButton('reference','登记平台标识') + archiveButton('associate','纠正关联') +
    archiveButton('merge','合并或撤销合并');
  return `<div class="review-archive-stack"><div class="review-toolbar">${archiveButton('back','返回文章档案')}${changes}</div>` +
    `<h3>${e(archiveTitle(row))}</h3>${archiveBadges(row)}` +
    `${message(`档案标识 ${row.id} · 版本 ${row.version}`)}${editor}` +
    `${renderTitles(row)}${renderTimeline(row)}${renderOrigin(row)}${renderSources(row)}${renderImages(row)}` +
    `${renderBodies(row)}${renderReferences(row)}${renderVariants(row)}${renderArchiveSnapshots(row.snapshots || [])}${renderEvents(row)}</div>`;
}

function renderCompletenessField(item) {
  const states = Object.entries(item.states || {}).map(([state,count])=>`${e(archiveMissing(state))} ${e(count)}`).join('、');
  const details = (item.items || []).map(row => `<li><button class="review-title-button" type="button" data-archive-action="detail" ` +
    `data-archive-id="${e(row.id)}">${e(row.title || '未填标题')}</button> ${e(archiveMissing(row.state))}</li>`).join('');
  return `<details class="review-panel"><summary>${e(archiveLabels[item.field] || item.field)} · 缺 ${e(item.missing ?? 0)} 篇</summary>` +
    `${states ? message(states) : ''}${details ? `<ul>${details}</ul>` : message('没有缺失记录。')}</details>`;
}

export function renderArchiveCompleteness(data) {
  const unsupportedLabels={image_binary_storage:'存储原图文件',automatic_platform_collection:'自动采集平台资料'};
  if (!data) return '<p role="status">正在读取完整性检查…</p>';
  const unsupported = (data.unsupported || []).map(value => {
    const field = typeof value === 'string' ? value : value?.field;
    const label = typeof value === 'object' ? value?.label : '';
    return `<li>${e(label || unsupportedLabels[field] || archiveLabels[field] || field)}</li>`;
  }).join('');
  const fields = (data.fields || []).map(renderCompletenessField).join('');
  return `<div class="review-archive-stack"><h3>${e(data.total ?? 0)} 篇档案</h3>${fields || archiveEmpty('没有可检查的数据。')}` +
    `${unsupported ? archivePanel('功能未支持',`<ul>${unsupported}</ul>`) : ''}</div>`;
}
