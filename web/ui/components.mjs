import { kindLabels, metrics, modeLabels, nav } from "../core/constants.mjs";
import { e, icon } from "../core/dom.mjs";
import { accountLabel, bjtDate, displayTime, metricData, num, rowsForAccount, time } from "../core/format.mjs";
import { state } from "../core/state.mjs";
const platformLogo = (p) => `<span class="platform-logo platform-${e(["toutiao", "zhihu", "wechat"].includes(p) ? p : "other")}">${e({ toutiao: "\
头", zhihu: "知", wechat: "微" }[p] || "文")}</span>`;
function detailInfo(reason, label, id) {
  return `<button class="icon-button" data-action="detail-info" data-reason="${e(reason)}" aria-label="${e(label)}" aria-expanded="false" ar\
ia-controls="detail-info-${e(id)}">${icon("info", 14)}</button>`;
}
function empty(title, description = "", action = "") {
  return `<div class="empty"><span class="empty-icon">${icon("articles", 22)}</span><h3>${e(title)}</h3>${description ? `<p>${e(description)}\
</p>` : ""}${action}</div>`;
}
function badgeMode(mode) {
  return `<span class="badge ${mode === "automatic" ? "up" : mode === "mixed" ? "neutral" : ""}">${e(modeLabels[mode] || modeLabels.unknown)}\
</span>`;
}
function headerActions() {
  if (state.page === "dashboard") return `${dashboardInfo("metrics", "总览数据口径", "header")}<button class="icon-button" data-action\
="refresh" title="刷新数据" aria-label="刷新数据">${icon("refresh")}</button><button class="btn primary" data-action="new-article">${icon(
  "plus")}记录发布</button>`;
  if (state.page === "articles") return `<a class="btn" href="/api/v1/export" download>${icon("download")}导出 CSV</a><button class="btn prima\
ry" data-action="new-article">${icon("plus")}记录发布</button>`;
  if (state.page === "reviews") return `<button class="btn primary" data-action="new-review">${icon("plus")}录入数据</button>`;
  if (state.settingsTab === "accounts") return `<button class="btn primary" data-action="new-account">${icon("plus")}添加账号</button>`;
  if (state.settingsTab === "keys") return `<button class="icon-button" data-action="key-help" aria-label="AI 凭据用途" aria-expanded="false" ar\
ia-controls="key-help">${icon("info")}</button><a href="/api-docs" class="btn" target="_blank" rel="noopener noreferrer">${icon("link", 14)}\
接入文档</a><button class="btn primary" data-action="new-key">${icon("plus")}创建凭证</button>`;
  return `<button class="btn" data-action="refresh">${icon("refresh")}刷新</button>`;
}
function accountOptions(selected = "", all = true, activeOnly = false) {
  return `${all ? '<option value="">全部账号</option>' : ""}${state.accounts.filter((a) => !activeOnly || a.active || a.id === selected).
  map((a) => `<option value="${e(a.id)}" ${a.id === selected ? "selected" : ""}>${e(accountLabel(a))}${a.active ? "" : "（已停用）"}</o\
ption>`).join("")}`;
}
function accountFilter() {
  return `<label class="account-select"><span class="sr-only">切换运营账号</span><select id="global-account" aria-label="切换运营账号">${accountOptions(
  state.account)}</select></label>`;
}
function pageHeader() {
  const count = state.page === "articles" ? state.articleMeta?.total : state.page === "settings" && state.settingsTab === "accounts" ? rowsForAccount(
  state.accounts).length : null;
  const account = state.page === "settings" && state.settingsTab === "accounts";
  return `<div class="heading-left"><h1>${e(nav.find((n) => n.id === state.page)?.label || "总览")}</h1><span id="page-count" class="page-\
count" ${count == null ? "hidden" : ""}>${count == null ? "" : e(num(count))}</span></div><div class="head-actions">${account ? accountFilter() :
  ""}${headerActions()}<button class="icon-button" data-action="page-menu" aria-label="更多页面操作" aria-haspopup="menu" aria-expanded="false" ar\
ia-controls="page-menu">⋯</button></div>`;
}
function skeleton() {
  return '<div class="skeleton" role="status" aria-label="正在读取数据"><span></span><span></span><span></span><span class="sr-only">正在读取数据…</span\
></div>';
}
function comparisonHTML(comparison) {
  if (!comparison?.comparable) return `<span class="comparison muted" title="${e(comparison?.reason || "缺少完整的可比数据")}">暂不可比\
</span>`;
  const delta = Number(comparison.delta), direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const change = delta === 0 ? "持平" : `${delta > 0 ? "+" : ""}${num(delta)}`;
  const percent = comparison.percent == null ? "" : `（${Number(comparison.percent) > 0 ? "+" : ""}${num(comparison.percent)}%）`;
  return `<span class="comparison ${direction}" title="${e(comparison.reason || "与前一等长周期比较")}">${change}${percent}</span>`;
}
function dashboardInfo(kind, label, id = "") {
  return `<button class="icon-button" data-action="dashboard-info" data-kind="${e(kind)}" data-id="${e(id)}" aria-label="${e(label)}" aria-e\
xpanded="false" aria-controls="info-${e(kind)}-${e(id)}">${icon("info", 14)}</button>`;
}
function platformColor(platform) {
  return `var(--p-${["toutiao", "zhihu", "wechat"].includes(platform) ? platform : "other"})`;
}
function freshness(c, now = Date.now()) {
  const stamp = [c.as_of, c.collected_at].find((v) => v && Number.isFinite(Date.parse(v)));
  if (!stamp) return { kind: "unknown", label: "数据新鲜度未知" };
  const days = Math.floor((Date.parse(bjtDate(now)) - Date.parse(bjtDate(stamp))) / 864e5);
  return days < 0 ? { kind: "unknown", label: "数据日期待核实" } : { kind: days <= 1 ? "up" : days <= 3 ? "warn" : "danger", label: `\
数据截至 ${time(stamp, true)} · ${days === 0 ? "今天更新" : `已 ${days} 天未更新`}` };
}
function dashboardMetric(article, key) {
  return article.latest_metrics == null ? '<span class="missing-value" title="未采集">—<span class="sr-only">未采集</span></span>' :
  article.latest_metrics[key] == null ? '<span class="missing-value">未取得</span>' : `<strong class="number">${e(num(article.latest_metrics[key]))}\
</strong>`;
}
function metricCoverageHTML(article, key) {
  const expected = Number(article.coverage?.expected_days || 0), recorded = Number(article.coverage?.metric_days?.[key] || 0);
  return article.period_metrics?.[key] != null && expected > 0 && recorded < expected ? `<span class="metric-coverage">部分数据 ${recorded}\
/${expected} 天</span>` : "";
}
function metricSummary(a) {
  return `<dl class="detail-stats">${["reads", "likes", "comments", ...a.latest_metrics?.approvals != null ? ["approvals"] : []].map((key) => `\
<div class="stat"><dt>${e(metrics[key])}${key === "likes" ? dashboardInfo("metrics", "指标口径", "detail") : ""}</dt><dd>${dashboardMetric(
  a, key)}</dd></div>`).join("")}</dl>`;
}
function articleSelect(name, label, choices, value) {
  return `<label class="form-field">${e(label)}<select name="${e(name)}" class="input" aria-label="${e(label)}"><option value="">全部</option>${Object.
  entries(choices).map(([key, text]) => `<option value="${e(key)}" ${value === key ? "selected" : ""}>${e(text)}</option>`).join("")}</selec\
t></label>`;
}
function field(name, label, type = "text", value = "", options = "", full = false) {
  return `<div class="form-field${full ? " full" : ""}"><label for="field-${e(name)}">${label}</label><input id="field-${e(name)}" class="in\
put" name="${e(name)}" type="${type}" value="${e(value)}" ${options}></div>`;
}
function formEnd(label = "保存") {
  return `<p class="form-message" role="alert"></p><div class="form-actions"><button type="button" class="btn" data-action="close-modal">取消<\
/button><button class="btn primary" type="submit">${e(label)}</button></div>`;
}
function renderSnapshot(row) {
  const m = metricData(row);
  return `<article class="snapshot"><div class="snapshot-head"><span class="badge ${row.kind === "latest" ? "up" : "neutral"}">${e(kindLabels[row.
  kind] || row.kind || "每日数据")}</span><span class="snapshot-time">${e(row.date || displayTime(row.as_of))}</span></div><div class="s\
napshot-metrics">${Object.entries(metrics).filter(([key]) => m[key] != null).map(([key, label]) => `<span>${e(label)} <strong>${e(num(m[key]))}\
</strong></span>`).join("") || "未记录指标"}</div><p class="cell-sub">来源 ${e(row.source || "未记录")}${row.collected_at ? " · 采集\
 " + e(displayTime(row.collected_at)) : ""}</p>${row.note ? `<p class="cell-sub">${e(row.note)}</p>` : ""}</article>`;
}
export {
  accountFilter,
  accountOptions,
  articleSelect,
  badgeMode,
  comparisonHTML,
  dashboardInfo,
  dashboardMetric,
  detailInfo,
  empty,
  field,
  formEnd,
  freshness,
  headerActions,
  metricCoverageHTML,
  metricSummary,
  pageHeader,
  platformColor,
  platformLogo,
  renderSnapshot,
  skeleton
};
