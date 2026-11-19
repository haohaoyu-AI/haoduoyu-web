import {e} from '../core/dom.mjs';
import {archiveDate,archiveKinds} from '../core/review-archive-state.mjs';
import {archiveButton,archiveEmpty,archivePanel} from './review-archive.mjs';

const kinds = {directory:'文章目录',drafts:'草稿清单',metrics:'历史指标'};
const actions = {new:'新建',update:'更新',unchanged:'重复或已登记',conflict:'冲突',unrecognized:'未识别'};
const outcomes = {success:'成功',failure:'失败',omission:'遗漏'};
const groups = {platform_only:'平台有，本站缺',site_only:'本站有，平台未见',
  suspected_duplicate:'疑似重复',status_conflict:'状态冲突'};

export async function readArchiveImportFile(file,resumeId='') {
  if (!file || typeof file.text!=='function' || !file.size || file.size>230000) throw new Error('请选择不超过 230 KB 的一页 JSON。');
  let input;
  try { input = JSON.parse(await file.text()); } catch { throw new Error('这一页并非有效 JSON。'); }
  if (!input || Array.isArray(input) || !Array.isArray(input.rows)) throw new Error('档案导入需要包含 rows 的一页 JSON。');
  if (resumeId && input.run_id && input.run_id!==resumeId) throw new Error('文件中的批次标识与当前续传批次不符。');
  return {...input,run_id:resumeId || input.run_id || crypto.randomUUID()};
}

function coverageLabel(coverage={}) {
  if (coverage.complete === true) return '采集覆盖已核实';
  if (coverage.closed === true || coverage.last_page === true) return '已读到最后一页，覆盖仍待核实';
  return '覆盖未完成';
}

function importForm(checkpoint) {
  const resume = checkpoint && !checkpoint.closed && !checkpoint.completed_at ? checkpoint : null;
  const info = resume ? `<p class="review-note">继续 ${e(resume.id)} · 下一页 ${e(resume.next_page)}</p>` : '';
  return archivePanel(resume?'续传导入':'导入一页',`<form class="review-archive-editor" data-archive-form="import">${info}` +
    '<p class="review-note">选择一页规范化 JSON。预览会列出新建、更新、冲突及未识别项。</p>' +
    '<label>导入文件<input class="input" name="page_file" type="file" accept=".json,application/json" required></label>' +
    '<div class="review-toolbar"><button class="btn primary" type="submit">预览这一页</button>' +
    '<p class="review-note" data-archive-status role="status"></p></div></form>');
}

function renderRows(rows=[]) {
  if (!rows.length) return archiveEmpty('该页没有记录。');
  const cells = rows.map(row => {
    const label = [actions[row.action],outcomes[row.status]].filter(Boolean).join(' · ');
    const id = row.item_id ?
      `<button class="review-title-button" type="button" data-archive-action="detail" data-archive-id="${e(row.item_id)}">查看记录</button>` : '';
    return `<tr><th scope="row">${e(row.key)}</th><td>${e(label)}</td><td>${e(row.code || '—')}</td><td>${id}</td></tr>`;
  }).join('');
  return '<div class="review-archive-table"><table><thead><tr><th scope="col">来源标识</th><th scope="col">结果</th>' +
    '<th scope="col">说明代码</th><th scope="col">站内档案</th></tr></thead><tbody>' + cells + '</tbody></table></div>';
}

function renderCounts(counts) {
  const labels = {...actions,...outcomes};
  const values = Object.entries(counts || {}).filter(([key,count])=>labels[key] && Number.isInteger(count))
    .map(([key,count])=>`${e(labels[key])} ${e(count)}`).join(' · ');
  return values ? `<p class="review-note">${values}</p>` : '';
}

function importPreview(preview) {
  const note = `<p class="review-note">批次 ${e(preview.run_id)} · 第 ${e(preview.page)} 页</p>`;
  const apply = preview.preview_hash ? archiveButton('import-apply','提交已预览的这一页') : '';
  return archivePanel('本页预览',note+renderCounts(preview.counts)+renderRows(preview.rows)+apply);
}

function importSummary(run) {
  const scope = run.scope || {};
  const range = scope.from || scope.to ? `${scope.from || '未设起始'} 至 ${scope.to || '未设结束'}` : '未设日期窗口';
  return [kinds[run.kind],archiveKinds[scope.kind],run.source,archiveDate(scope.collected_at),range].filter(Boolean).map(e).join(' · ');
}

function runPicker(runs) {
  const rows = runs.map(run => `<li><button class="review-title-button" type="button" data-archive-action="import-detail" ` +
    `data-archive-id="${e(run.id)}">${importSummary(run)}</button><span class="review-note">${e(run.id)} · ` +
    `${run.completed_at?'覆盖已核':'检查点已保存'}</span></li>`).join('');
  return archivePanel('已保存的批次',rows ? `<ul class="review-archive-items">${rows}</ul>` : archiveEmpty('尚无已保存批次。'));
}

function runHistory(run) {
  const pages = (run.pages || []).map(page => `<details><summary>第 ${e(page.page)} 页${page.replayed?' · 已重放':''}</summary>` +
    `${renderCounts(page.counts)}${renderRows(page.rows)}</details>`).join('');
  const coverage = `<p class="review-note">${e(coverageLabel({...run.coverage,closed:run.closed}))}</p>`;
  return archivePanel('批次检查点', `<p>${importSummary(run)}</p><p class="review-note">${e(run.id)}</p>${coverage}` +
    `${pages || archiveEmpty('尚无提交完成的页面。')}${archiveButton('reconcile','查看对账结果')}`);
}

function reconcileSection(group,values) {
  const rows = values.map(row => {
    if (typeof row==='string') return `<li>${e(row)}</li>`;
    const details = [row.title,row.platform_id,row.key,row.code].filter(Boolean).map(e).join(' · ');
    const label = details || e(row.id || row.item_id || '待核记录');
    const id = row.item_id || row.id;
    const link = id && /^[a-f0-9-]{36}$/u.test(id) ?
      `<button type="button" class="review-title-button" data-archive-action="detail" data-archive-id="${e(id)}">${label}</button>` : label;
    return `<li>${link}</li>`;
  }).join('');
  return `<details><summary>${e(groups[group])} · ${e(values.length)}</summary><ul>${rows}</ul></details>`;
}

function renderReconciliation(reconcile) {
  const info = reconcile.site_only_assessed===false ?
    '<p class="review-note">采集范围尚未核实，本站有而清单未见的档案需在全量对账后再判定。</p>' : '';
  const sections = Object.keys(groups).map(key=>reconcileSection(key,reconcile[key] || [])).join('');
  return archivePanel('对账结果',info+sections);
}

export function renderArchiveImports(view) {
  return '<div class="review-archive-stack">' + importForm(view.checkpoint) +
    (view.preview ? importPreview(view.preview) : '') +
    (view.checkpoint ? runHistory(view.checkpoint) : '') +
    (view.reconcile ? renderReconciliation(view.reconcile) : '') + runPicker(view.runs || []) + '</div>';
}
