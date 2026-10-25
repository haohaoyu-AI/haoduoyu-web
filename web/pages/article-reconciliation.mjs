import { warningLabels } from "../core/article-ledger.mjs";
import { api } from "../core/api.mjs";
import { e } from "../core/dom.mjs";
import { slotLabels, statusLabels, writerLabels } from "../core/constants.mjs";
let reconciliationData = null;
const fieldLabels = { run_date: "日期", status: "状态", slot: "槽位", writer: "写作者", series_no: "编号" };
const label = (choices, value) => choices[value] || "未知";
function options(values, choices) {
  return '<option value="">全部</option>' + values.map(value =>
    `<option value="${e(value)}">${e(choices ? label(choices, value) : value)}</option>`).join("");
}
function statusCounts(counts) {
  return Object.entries(counts).map(([key, value]) => `${label(statusLabels, key)} ${value}`).join(" · ");
}
function insurance(data) {
  const value = data.insurance;
  return `<section class="card"><h2 title="仅按公众号槽位统计">保险编号进度</h2>
<dl class="article-ledger-stats"><div><dt>实际记录</dt><dd>${e(value.recorded)}</dd></div><div><dt>去重编号</dt><dd>${e(value.unique_count)}</dd></div>
<div><dt>最高编号</dt><dd>${e(value.highest ?? "未知")}</dd></div></dl><p>${e(statusCounts(value.counts))}</p>
<p>重复号：${e(value.duplicate_numbers.map(row => `${row.number}（${row.article_ids.length}条）`).join("、") || "无")}</p>
<p>缺号候选：${e(value.observed_gap_ranges.map(row => row.from === row.to ? row.from : `${row.from}–${row.to}`).join("、") || "未观察到内部间隔")}</p>
<details><summary>编号口径</summary><p>起点、目标与样本编号映射未知；候选仅为已记录编号之间的间隔。</p></details></section>`;
}
function articleRows(rows) {
  return rows.map(row => `<tr><td><button class="btn text" data-action="article-detail" data-id="${e(row.id)}">${e(row.title)}</button></td>
<td>${e(row.run_date ?? "未标注")}</td><td>${e(label(slotLabels, row.slot))}</td><td>${e(label(statusLabels, row.status))}</td>
<td>${e(label(writerLabels, row.writer))}</td><td>${e(row.series_no ?? "未知")}</td>
<td>${e(row.missing_fields.map(key => fieldLabels[key] || key).join("、") || "无")}</td>
<td>${e(row.has_pending_verify === true ? "待核" : row.verify_state === "complete" ? "已核" : "未知")}</td>
<td>${e(row.warnings.length ? row.warnings.map(key => warningLabels[key] || key).join("；") : "无")}</td><td>${row.sample == null ? "未知" :
    `<details><summary>原始样本记录</summary><pre>${e(JSON.stringify(row.sample, null, 2))}</pre></details>`}</td></tr>`).join("");
}
function table(data, filters = {}) {
  const rows = data.rows.filter(row => ["run_date", "slot", "writer", "status"].every(key =>
    !filters[key] || (row[key] ?? "unknown") === filters[key]));
  return `<p role="status">筛选结果 ${e(rows.length)} 条</p>${rows.length ?
    `<div class="table-scroll"><table class="data-table"><thead><tr><th>文章</th><th>存稿日期</th><th>槽位</th><th>状态</th>
<th>写作者</th><th>编号</th><th>缺字段</th><th>待核</th><th>警告</th><th>样本</th></tr></thead><tbody>${articleRows(rows)}</tbody></table></div>` :
    '<p class="muted">没有符合条件的实际文章记录。</p>'}`;
}
export function changeReconciliationFilters(element) {
  const form = element.closest("#reconciliation-filters");
  if (!form || !reconciliationData) return false;
  document.querySelector("#reconciliation-results").innerHTML = table(reconciliationData, Object.fromEntries(new FormData(form)));
  return true;
}
export function renderReconciliation(data) {
  if (data?.complete !== true || !Array.isArray(data.rows)) throw new Error("发布情况未完整取得，请重试。");
  reconciliationData = data;
  const values = key => [...new Set(data.rows.map(row => row[key] ?? "unknown"))].sort();
  const dates = Object.fromEntries(values("run_date").map(value => [value, value === "unknown" ? "日期未标注" : value]));
  return `<div class="article-ledger-overview article-reconciliation"><section class="card"><h2>发布情况</h2>
<p>应产出：未配置 · 缺产：未配置 · 逾期：未配置</p><p>${e(statusCounts(data.counts))}</p>
<form id="reconciliation-filters" class="filters">
<label class="form-field">日期<select class="input" name="run_date">${options(values("run_date"), dates)}</select></label>
<label class="form-field">槽位<select class="input" name="slot">${options(values("slot"), slotLabels)}</select></label>
<label class="form-field">写作者<select class="input" name="writer">${options(values("writer"), writerLabels)}</select></label>
<label class="form-field">状态<select class="input" name="status">${options(values("status"), statusLabels)}</select></label></form>
<div id="reconciliation-results">${table(data)}</div></section>${insurance(data)}</div>`;
}
export async function loadReconciliation(context) {
  return api("/article-reconciliation", { context });
}
