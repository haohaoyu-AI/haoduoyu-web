import {e} from '../core/dom.mjs';
import {
  archiveAssociation,archiveKinds,archiveLabels,archiveProduction,archivePublication,archiveTimeLabels
} from '../core/review-archive-state.mjs';
import {archiveButton,archivePanel,archiveSelect} from './review-archive.mjs';

const mainFields = {
  original_title:'原稿标题',published_title:'发布标题',platform_url:'平台链接',sample_title:'样本标题',
  sample_url:'样本链接',sample_reference_id:'样本库记录标识'
};
const kinds = {draft:'草稿',publication:'发布'};
const roles = {other:'关联版本',primary:'主要版本',duplicate:'重复草稿'};
const stateChoices = {not_filled:'未填',none:'没有',unverified:'无法核实',not_applicable:'不适用'};
const missingNames = ['original_body','published_body','cover','sources','images.total','images.real','images.ai','sample_title','sample_url'];
const missingLabels = {...archiveLabels,'images.total':'总图数','images.real':'真实图数','images.ai':'AI 图数'};

function textInput(name,label,value,{type='text',extra=''}={}) {
  return `<label>${e(label)}<input class="input" name="${e(name)}" type="${e(type)}" value="${e(value ?? '')}"${extra}></label>`;
}
function area(name,label,value,rows=4) {
  return `<label>${e(label)}<textarea class="input" rows="${rows}" name="${e(name)}">${e(value ?? '')}</textarea></label>`;
}
function select(name,label,choices,value) {
  return `<label>${e(label)}${archiveSelect(name,choices,value)}</label>`;
}
const json = value => value == null ? '' : JSON.stringify(value,null,2);
const list = value => Array.isArray(value) ? value.join('\n') : '';
const actions = (label='保存') => `<div class="review-toolbar"><button class="btn primary" type="submit">${e(label)}</button>` +
  `${archiveButton('cancel','取消')}<p class="review-note" data-archive-status role="status"></p></div>`;

function inputFields(row) {
  const kind = row.legacy_id && !row.kind ? '<label>内容类型<select class="input" name="kind" required><option value="">请选择真实类型</option>' +
    '<option value="article">长文</option><option value="micro">微头条</option></select></label>' :
    select('kind','内容类型',archiveKinds,row.kind || 'article');
  const selects = [
    kind,
    select('production_status','制作状态',archiveProduction,row.production_status || 'unknown'),
    select('publication_status','发布状态',archivePublication,row.publication_status || 'unknown')
  ].join('');
  const texts = Object.entries(mainFields).map(([field,label]) => textInput(field,label,row[field])).join('');
  const dates = Object.entries(archiveTimeLabels).map(([field,label]) =>
    textInput(field,label,row[field],{extra:' placeholder="日期或带时区的完整时间"'})).join('');
  return `<div class="review-archive-edit-grid">${selects}${texts}${dates}</div>`;
}

function absenceFields(row) {
  return missingNames.map(field => `<label>${e(missingLabels[field])}${archiveSelect(`state:${field}`,stateChoices,
    row.field_states?.[field] || '', '按已有资料')}</label>`).join('');
}

function verificationFields(row) {
  const fields = ['original_title','published_title','original_body','published_body','sources','cover','images','sample_title','sample_url'];
  const choices = fields.map(field=>`<label class="review-archive-checkbox"><input type="checkbox" name="verify:${field}"` +
    `${row.verified?.includes(field)?' checked disabled':''}> ${e(archiveLabels[field])}</label>`).join('');
  return `<details><summary>标记已核实的资料</summary><div class="review-archive-edit-grid">${choices}</div></details>`;
}

export function renderArchiveItemEditor(row={}) {
  const details = area('alternate_titles','备选标题（可选，每行一条）',list(row.alternate_titles)) +
    area('tags','标签（每行一个）',list(row.tags)) + area('source_note','来源说明',row.source_note);
  const bodies = `<details><summary>正文与来源</summary>${area('original_body','原稿正文',row.original_body,8)}` +
    `${area('published_body','发布正文',row.published_body,8)}${area('sources','有序来源（JSON 列表）',json(row.sources),6)}</details>`;
  const images = `<details><summary>封面与配图</summary>${area('cover','封面记录（JSON）',json(row.cover))}` +
    `${area('images','总图、真实图、AI 图与配图记录（JSON）',json(row.images),6)}</details>`;
  const absence = `<details><summary>缺失原因</summary><div class="review-archive-edit-grid">${absenceFields(row)}</div></details>`;
  const legacyInfo = !row.id && row.legacy_id ?
    `<p class="review-note">归档现有复盘 ${e(row.legacy_id)}，并保留关联的历史快照。</p>` : '';
  return archivePanel(row.id?'编辑档案':'新增档案',`<form data-archive-form="item" class="review-archive-editor">${inputFields(row)}` +
    `${legacyInfo}${details}${bodies}${images}${absence}${row.id?verificationFields(row):''}${actions()}</form>`);
}

const blankAsNull = value => String(value ?? '').trim() || null;
function readJson(fields,key) {
  const value = blankAsNull(fields[key]);
  if (value === null) return null;
  try { return JSON.parse(value); }
  catch { throw new Error(`${archiveLabels[key]}的 JSON 格式无效。`); }
}

function readList(fields,key,previous) {
  const entries = String(fields[key] ?? '').split(/\r?\n/u).map(x=>x.trim()).filter(Boolean);
  if (entries.length) return entries;
  return Array.isArray(previous) && !previous.length ? [] : null;
}

export function readArchiveItemEditor(fields,row={}) {
  const choices = ['kind','production_status','publication_status'];
  const lines = [...Object.keys(mainFields),...Object.keys(archiveTimeLabels),'source_note','original_body','published_body'];
  const result = Object.fromEntries(choices.map(key=>[key,fields[key]]));
  for (const key of lines) result[key] = blankAsNull(fields[key]);
  for (const key of ['alternate_titles','tags']) result[key] = readList(fields,key,row[key]);
  for (const key of ['sources','cover','images']) result[key] = readJson(fields,key);
  const states = {...row.field_states};
  for (const field of missingNames) {
    const value = fields[`state:${field}`];
    if (value) states[field] = value;
    else delete states[field];
  }
  result.field_states = states;
  if (!row.id) return Object.fromEntries(Object.entries(result).filter(([,value])=>value != null));
  return Object.fromEntries(Object.entries(result).filter(([key,value])=>JSON.stringify(row[key] ?? null)!==JSON.stringify(value)));
}

export function readArchiveVerification(fields) {
  return Object.keys(fields).filter(key=>key.startsWith('verify:')&&fields[key]==='on').map(key=>key.slice(7));
}

function refEditor(ref) {
  const kind = select('kind','平台记录类型',kinds,ref?.kind || 'draft');
  const structure = kind + select('role','版本作用',roles,ref?.role || 'other') +
    textInput('platform_id','平台编号',ref?.platform_id,{extra:' required'}) +
    textInput('title','平台记录标题',ref?.title) + textInput('url','平台链接',ref?.url) +
    textInput('saved_at','存入草稿箱时间',ref?.saved_at,{extra:' placeholder="日期或带时区的完整时间"'}) +
    select('state','编号核对',{active:'有效',disputed:'存疑'},ref?.state || 'active');
  const reason = ref ? area('reason','更正依据（更换编号或类型时必填）','') : '';
  return archivePanel(ref?'更正平台标识':'登记平台标识',`<form data-archive-form="reference" class="review-archive-editor">` +
    `<div class="review-archive-edit-grid">${structure}</div>${reason}${actions()}</form>`);
}

function associationEditor(row) {
  return archivePanel('纠正原稿关联',`<form data-archive-form="associate" class="review-archive-editor">` +
    `${select('status','原稿关联',archiveAssociation,row.association_status)}${area('reason','核对依据','')}${actions()}</form>`);
}

function mergeEditor() {
  const steps = select('action','操作',{merge:'合并到当前档案',unmerge:'撤销合并'},'merge') +
    textInput('other_id','另一条档案标识','',{extra:' required'}) +
    textInput('other_version','另一条档案的版本','',{type:'number',extra:' min="1" required'});
  return archivePanel('合并或撤销合并',`<form data-archive-form="merge" class="review-archive-editor">` +
    `<div class="review-archive-edit-grid">${steps}</div>${area('reason','核对依据','')}${actions()}</form>`);
}

export function renderArchiveDetailEditor(editor,row,reference=null) {
  if (editor==='item') return renderArchiveItemEditor(row);
  if (editor==='reference') return refEditor(reference);
  if (editor==='associate') return associationEditor(row);
  if (editor==='merge') return mergeEditor();
  return '';
}
