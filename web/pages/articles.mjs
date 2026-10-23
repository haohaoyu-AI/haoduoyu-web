import { beginModalRequests } from "../core/requests.mjs";
import { api } from "../core/api.mjs";
import { articleChoices, articleColumns, articleStatuses, defaultFilters, modeLabels, platforms } from "../core/constants.mjs";
import { e, icon } from "../core/dom.mjs";
import { accountName, duration, localDateTime, num, safeURL, time } from "../core/format.mjs";
import { modalRequest } from "../core/modal-request.mjs";
import { runtime, state } from "../core/state.mjs";
import { articleLink, accountOptions, articleSelect, badgeMode, dashboardInfo, dashboardMetric, empty, field, formEnd,
  platformLogo } from "../ui/components.mjs";
import { openModal } from "../ui/modal.mjs";
import { platformFilter } from "../ui/segmented.mjs";
import { sortHeading } from "../ui/table.mjs";
import { toast } from "../ui/toast.mjs";
async function renderArticles(version = runtime.renderVersion, context) {
  const f = { ...state.filters }, params = new URLSearchParams();
  if (state.account) params.set("account_id", state.account);
  for (const key of ["q", "mode", "from", "to", "sort", "order", "platform", "topic", "data_status"]) if (f[key]) params.set(key, f[key]);
  params.set("page", state.listPage);
  params.set("page_size", state.pageSize);
  const payload = await api(`/articles?${params}`, { envelope: true, context });
  if (version !== runtime.renderVersion) return "";
  const articles = payload.data, meta = payload.meta || { total: articles.length, unfiltered_total: articles.length, has_more: false };
  state.articles = articles;
  state.articleMeta = meta;
  const chips = [["account", "账号", state.account ? accountName(state.account) : ""], ...Object.entries({ q: "搜索", platform: "平台",
  data_status: "数据状态", from: "发布自", to: "发布至", topic: "题材", mode: "生产方式", group: "分组" }).map(([key, label]) => [
  key, label, (key === "platform" ? platforms : key === "data_status" ? articleStatuses : articleChoices[key])?.[f[key]] || f[key]])].filter(
  ([, , value]) => value);
  return `<section class="card article-list"><form id="article-filters" class="filters"><label class="search">${icon("search", 15)}<input \
class="input" name="q" value="${e(f.q)}" placeholder="搜索标题或链接…" aria-label="搜索文章"></label>${platformFilter("article-platform", f.platform,
   "文章平台")}${articleSelect("data_status", "数据状态", articleStatuses, f.data_status)}<button type="button" class="btn" \
data-action="article-filter" aria-expanded="false" aria-controls="article-filter-popover">筛选 ▾</button></form>${chips.length ?
  `<div class="selected-filters" aria-label="已选条件">${chips.map(([key, label, value]) => `<button class="badge" data-action="remove-filter" \
data-filter="${e(key)}" aria-label="移除${e(label)}：${e(value)}">${e(label)}：${e(value)} ×</button>`).join("")}<button class="btn \
text" data-action="reset-filters">清空</button></div>` : ""}${articles.length ? articleTable(articles) : empty(meta.unfiltered_total ?
  "筛选无结果" : "尚未记录文章", "", '<button class="btn" data-action="reset-filters">清空筛选</button>')}<div class="pagination"><span>共 ${e(num(meta.
    total))} 篇</span><label>每页<select id="page-size" class="input">${[.../* @__PURE__ */ new Set([10, 20, 50, 100,
  state.pageSize])].sort((a, b) => a - b).map((n) => `<option value="${e(n)}" ${state.pageSize === n ? "selected" : ""}>${e(n)}</option>`).join(
  "")}</select></label><button class="btn" data-action="list-prev" aria-label="上一页" ${state.listPage <= 1 ? "disabled" :
     ""}>‹</button><span>${e(num(state.listPage))} / ${e(num(Math.max(1, Math.ceil(meta.total / state.pageSize))))}</span><button class="btn" \
data-action="list-next" aria-label="下一页" ${meta.has_more ? "" : "disabled"}>›</button></div></section>`;
}
function articleFilterPanel({ filters: f = state.filters, columns: c = state.columns, account = state.account } = {}) {
  return `<form id="filter-panel">${["q", "platform", "data_status"].map((key) => `<input type="hidden" name="${e(key)}" value="${e(f[
    key])}">`).join("")}<h2>筛选 <span class="badge">草稿 · 应用后生效</span></h2><div class="form-grid"><label class="form-field full">运营账号<select \
name="account" class="input" aria-label="运营账号">${accountOptions(account)}</select></label>${field("from", "发布自", "date", f.from)}${field(
  "to", "发布至", "date", f.to)}${Object.entries({ topic: "题材", mode: "生产方式", group: "分组" }).map(([key, label]) => articleSelect(
  key, label, articleChoices[key], f[key])).join("")}<fieldset class="form-field full permission-fields"><legend>显示字段</legend><div \
class="checkboxes">${Object.entries(articleColumns).map(([key, [label]]) => `<label class="check-option"><input type="checkbox" name="columns" \
value="${e(key)}" ${c.has(key) ? "checked" : ""}>${e(label)}</label>`).join("")}</div></fieldset><div class="form-field full"><span>更多排序</span>\
<input type="hidden" name="sort" value="${e(f.sort)}"><input type="hidden" name="order" value="${e(f.order)}"><div class="head-actions">${Object.
  entries(articleColumns).filter(([, [, sort]]) => sort).map(([key, [label, sort]]) => `<button type="button" class="btn small" \
data-action="draft-sort" data-visible="${sort === "published_at" || c.has(key)}" data-sort="${e(sort)}" aria-pressed="${f.sort === sort}">${e(label)} ${f.
  sort === sort ? f.order === "asc" ? "↑" : "↓" : "↕"}</button>`).join("") || "使用表头排序"}</div></div><div class="form-field full"><label \
for="filter-view">常用视图（筛选和字段）</label><select id="filter-view" class="input"><option value="">选择视图后应用</option>${state.
  savedViews.map((v) => `<option value="${e(v.id)}">${e(v.name)}</option>`).join("")}</select><button type="button" class="btn" \
data-action="save-view">保存已应用视图</button></div></div><div class="form-actions"><button type="button" class="btn" data-action="reset-draft">\
重置草稿</button><button type="submit" class="btn">应用</button></div></form>`;
}
function articleDraft(form) {
  const values = new FormData(form), filters = { ...state.filters };
  for (const key of ["q", "platform", "data_status", "from", "to", "topic", "mode", "group", "sort", "order"]) filters[key] = String(values.
  get(key) || "");
  if (!Object.values(articleColumns).some(([, sort]) => sort === filters.sort)) filters.sort = "published_at";
  if (!["asc", "desc"].includes(filters.order)) filters.order = "desc";
  return { filters, columns: new Set(values.getAll("columns").filter((c) => Object.hasOwn(articleColumns, c))), account: String(values.get("account") || "") };
}
function viewDraft(view) {
  return { filters: { ...defaultFilters(), ...Object.fromEntries(Object.entries(view.filters).filter(([key]) => Object.hasOwn(defaultFilters(),
  key))) }, columns: /* @__PURE__ */ new Set([...view.columns.filter((key) => Object.hasOwn(articleColumns, key)), ...view.version !== 2 && !view.
  columns.includes("as_of") ? ["likes", "comments", "as_of"] : []]), account: state.account };
}
function articleTable(rows) {
  const columns = Object.entries(articleColumns).filter(([key]) => state.columns.has(key));
  let previous = null;
  const cell = (a, key) => ["reads", "likes", "comments", "approvals"].includes(key) ? dashboardMetric(a, key) : key === "as_of" ? a.latest_as_of ?
  e(time(a.latest_as_of, true)) : dashboardMetric(a, "as_of") : key === "mode" ? badgeMode(a.production_mode) : key === "duration" ? e(duration(
  a.duration_seconds)) : key === "account" ? e(a.account_name) : a.date_status === "unverified" ? "日期待核实" : e(time(a.published_at,
  true));
  return `<div class="table-scroll article-desktop"><table class="data-table article-table"><thead><tr><th aria-sort="${!state.columns.has(
    "published") && state.filters.sort === "published_at" ? state.filters.order === "asc" ? "ascending" : "descending" : "none"}">${state.columns.
  has("published") ? "标题" : sortHeading("published_at", "标题 / 发布")}</th>${columns.map(([key, [label, sort]]) => `<th ${sort ? `aria-sort="${
    state.filters.sort === sort ? state.filters.order === "asc" ? "ascending" : "descending" : "none"}"` : ""}>${sort ? sortHeading(
  sort, label) : e(label)}${key === "likes" ? dashboardInfo("metrics", "点赞口径", "articles") : ""}</th>`).join("")}<th>操作</th></tr></thead>\
<tbody class="article-cards">${rows.map((a) => {
    const group = state.filters.group ? state.filters.group === "account" ? a.account_name : modeLabels[a.production_mode] : null, heading = group &&
    group !== previous ? `<tr class="group-row"><td colspan="${e(columns.length + 2)}">${e(group)}</td></tr>` : "";
    previous = group;
    return `${heading}<tr><td class="title-cell">${articleLink(a)}<div \
class="cell-sub">${platformLogo(a.platform)} ${e(a.account_name)} · ${a.date_status === "unverified" ? "日期待核实" : e(
    time(a.published_at, true))}</div></td>${columns.map(([key, [label]]) => `<td data-label="${e(label)}">${cell(a, key)}</td>`).join("")}<td><button \
class="icon-button" data-action="article-menu" data-id="${e(a.id)}" aria-label="操作：${e(a.title)}" aria-haspopup="menu" \
aria-expanded="false" aria-controls="article-menu-${e(a.id)}">⋯</button></td></tr>`;
  }).join("")}</tbody></table></div>`;
}
function articleMenu(a) {
  return `<button role="menuitem" data-action="article-detail" data-id="${e(a.id)}">详情</button>${safeURL(a.url) ?
     `<a role="menuitem" href="${e(a.url)}" target="_blank" rel="noopener noreferrer">原文 ↗</a>` : ""}${[["edit-article", "编辑"], ["review-article", "补充数据"]].
  map(([action, label]) => `<button role="menuitem" data-action="${e(action)}" data-id="${e(a.id)}">${e(label)}</button>`).join("")}`;
}
async function articleModal(id = "") {
  const context = beginModalRequests();
  const ticket = ++runtime.modalRequestVersion, version = runtime.renderVersion;
  let a = { account_id: state.account, production_mode: "unknown" };
  if (id) a = await modalRequest(`/articles/${encodeURIComponent(id)}`, ticket, version, context);
  if (ticket !== runtime.modalRequestVersion || version !== runtime.renderVersion) return;
  const activeAccounts = state.accounts.filter((x) => x.active || x.id === a.account_id);
  if (!activeAccounts.length) {
    toast("请先添加一个启用的运营账号。", true);
    return;
  }
  openModal(id ? "编辑发布记录" : "记录发布", `<form id="article-form" data-id="${e(id)}" data-version="${e(a.version || "")}"><p \
class="form-context">北京时间</p><div class="form-grid">${field("title", '文章标题 <span class="required">*</span>', "text", a.title,
  'maxlength="500" required', true)}<div class="form-field full"><label for="field-account_id">所属运营账号 <span class="required">*</span>\
</label><select class="input" id="field-account_id" name="account_id" required>${accountOptions(a.account_id, false, true)}</select></div>${
  field("url", '已发布文章链接 <span class="required">*</span>', "url", a.url, 'placeholder="https://…" required', true)}${field("published_at",
     '实际发布时间 <span class="required">*</span>', "datetime-local", localDateTime(a.published_at), "required")}${field("started_at",
  "选题开始时间（可选）", "datetime-local", localDateTime(a.started_at))}<div class="form-field"><label for="field-production_mode">文章生产方式</label>\
<select class="input" id="field-production_mode" name="production_mode">${Object.entries(modeLabels).map(([key, label]) =>
   `<option value="${key}" ${a.production_mode === key ? "selected" : ""}>${label}</option>`).join("")}</select></div>${field(
     "platform_article_id", "平台文章标识（可选）", "text", a.platform_article_id)}<div class="form-field full"><label for="field-summary">文章概况</label><textarea \
class="input" name="summary" id="field-summary" maxlength="5000">${e(a.summary)}</textarea></div><div class="form-field full">\
<label for="field-notes">备注</label><textarea class="input" name="notes" id="field-notes" maxlength="10000">${e(a.
  notes)}</textarea></div></div>${formEnd(id ? "保存修改" : "保存发布记录")}</form>`);
}
export {
  articleDraft,
  articleFilterPanel,
  articleMenu,
  articleModal,
  articleTable,
  renderArticles,
  viewDraft
};
