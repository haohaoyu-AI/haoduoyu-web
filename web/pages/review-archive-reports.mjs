import {e} from '../core/dom.mjs';
import {archiveDate} from '../core/review-archive-state.mjs';
import {archiveButton,archiveEmpty,archivePanel,archiveSelect} from './review-archive.mjs';

const reportTypes = {review:'复盘日报与周报',ai:'AI 汇报'};
const periods = {day:'日报',week:'周报',daily:'日报',weekly:'周报'};

function reportLabel(row,type) {
  if (type==='ai') return [row.author,archiveDate(row.created_at)].filter(Boolean).map(e).join(' · ');
  return [periods[row.period] || periods[row.period_type] || '复盘报告',row.period_end || row.report_date || row.period_start]
    .filter(Boolean).map(e).join(' · ');
}

function reportHistory(data,type) {
  const versions = data.history || data.versions || [];
  const rows = versions.map(row => {
    const snapshot = row.report || row.previous || row.payload || row.record || row.data || row;
    const content = type==='ai' ? snapshot.content : snapshot.summary_md;
    const at = archiveDate(row.saved_at || row.changed_at || row.created_at);
    return `<details><summary>${e(at)}${row.version ? ` · 版本 ${e(row.version)}` : ''}</summary>` +
      `<pre class="review-archive-text">${e(content || '未填')}</pre></details>`;
  }).join('');
  return archivePanel('修订历史',rows || archiveEmpty('尚无修订历史。'));
}

function reportEditor(row,type) {
  const label = type==='ai' ? '汇报内容' : '复盘摘要';
  const contentKey = type==='ai' ? 'content' : 'summary_md';
  const author = type==='ai' ? `<label>署名<input class="input" type="text" name="author" required value="${e(row.author)}"></label>` : '';
  if (!row.content_hash) return '<p class="review-note">此报告缺少可核实的当前版本。</p>';
  const confirm = row.requires_v_account_confirmation ?
    '<label class="review-archive-checkbox"><input type="checkbox" name="confirm_v_account" required> 确认这份汇报属于 V字</label>' : '';
  return `<form data-archive-form="report-edit" class="review-archive-editor">${author}${confirm}<label>${label}` +
    `<textarea class="input" name="${contentKey}" rows="9">${e(row[contentKey] || '')}</textarea></label>` +
    '<div class="review-toolbar"><button type="submit" class="btn primary">保存修订</button>' +
    '<p class="review-note" data-archive-status role="status"></p></div></form>';
}

function reportDetail(response,type) {
  const row = response.item || response.record || response.report || response;
  return archivePanel('报告详情',`<h4>${reportLabel(row,type)}</h4><p class="review-note">原记录 ${e(row.id)}</p>` +
    reportEditor(row,type)) + reportHistory(response,type) +
    (response.history_has_more ? archiveButton('report-history-more','读取更早版本') : '');
}

export function renderArchiveReports(state) {
  const choices = `<label>报告类型${archiveSelect('report_type',reportTypes,state.reportType)}</label>`;
  const chooser = `<form class="review-filters" data-archive-form="report-list">${choices}` +
    '<button class="btn" type="submit">读取报告</button></form>';
  const rows = (state.reports || []).map(row => `<li><button type="button" class="review-title-button" ` +
    `data-archive-action="report-detail" data-archive-id="${e(row.id)}">${reportLabel(row,state.reportType)}</button></li>`).join('');
  const listing = rows ? `<ul class="review-archive-items">${rows}</ul>` : archiveEmpty('此类报告没有记录。');
  const lookup = state.reportType==='ai' ? '<form class="review-filters" data-archive-form="report-lookup">' +
    '<label>待核 AI 汇报标识<input class="input" type="text" name="report_id" required></label>' +
    '<button class="btn" type="submit">查阅原记录</button></form>' : '';
  return `<div class="review-archive-stack">${archivePanel('报告版本',chooser+listing)}` +
    `${state.reportMore ? archiveButton('report-more','读取更多报告') : ''}${lookup}` +
    `${state.reportDetail ? archiveButton('report-close','收起当前报告') + reportDetail(state.reportDetail,state.reportType) : ''}</div>`;
}
