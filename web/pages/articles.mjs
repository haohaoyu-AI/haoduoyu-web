import { beginModalRequests } from "../core/requests.mjs";
import { api } from "../core/api.mjs";
import { articleChoices, articleColumns, articleStatuses, defaultFilters, modeLabels, platforms } from "../core/constants.mjs";
import { statusLabels, slotLabels, writerLabels, illustratorLabels, ledgerCell, ledgerTopic, hasRecordedUnknownMetrics } from "../core/article-ledger.mjs";
import { e } from "../core/dom.mjs";
import { accountName, duration, localDateTime, num, safeURL, time } from "../core/format.mjs";
import { modalRequest } from "../core/modal-request.mjs";
import { normalizeArticlePipelineFilters } from "../core/router.mjs";
import { runtime, state } from "../core/state.mjs";
import { accountOptions, articleSelect, badgeMode, dashboardInfo, dashboardMetric, empty, field, formEnd, platformLogo } from "../ui/components.mjs";
import { openModal } from "../ui/modal.mjs";
import { platformFilter } from "../ui/segmented.mjs";
import { sortHeading } from "../ui/table.mjs";
import { toast } from "../ui/toast.mjs";

const pipelineColumns = new Set(["status", "slot", "writer", "char_count", "subheading_count", "image_count",
  "draft_ref", "total_duration", "warnings", "verify", "topic"]);
const pipelineFilters = ["slot", "writer", "has_warnings", "has_pending_verify", "series_no_min", "series_no_max"];
const boolChoices = { true: "是", false: "否" };
const publishedArticle = article => !Object.hasOwn(article, "status") || article.status === "published";

function statusSelect(value = "draft_saved", allowUnknown = false) {
  const known = Object.hasOwn(statusLabels, value);
  const unknown = allowUnknown && !known;
  if (!unknown && !known) value = "draft_saved";
  return `<label class="form-field">状态<select name="status" class="input" aria-label="文章状态">
${unknown ? '<option value="" selected disabled>未确认，请选择状态</option>' : ""}
${Object.entries(statusLabels).map(([key, label]) => `<option value="${e(key)}" ${value === key ? "selected" : ""}>${e(label)}</option>`).join("")}
</select></label>`;
}
function filterChips(f) {
  const labels = { platform: "平台", data_status: "数据状态", from: "发布自", to: "发布至", mode: "生产方式", topic: "旧题材筛选",
    group: "分组", slot: "槽位", writer: "写作者", has_warnings: "有警告", has_pending_verify: "待核", series_no_min: "系列自", series_no_max: "系列至" };
  const choices = { platform: platforms, data_status: articleStatuses, slot: slotLabels, writer: writerLabels,
    has_warnings: boolChoices, has_pending_verify: boolChoices, ...articleChoices };
  const chips = [["account", "账号", state.account ? accountName(state.account) : ""], ...Object.entries(labels)
    .map(([key, label]) => [key, label, choices[key]?.[f[key]] || f[key]])].filter(([, , value]) => value);
  if (!chips.length) return "";
  return `<div class="selected-filters" aria-label="已选条件">${chips.map(([key, label, value]) =>
    `<button class="badge" data-action="remove-filter" data-filter="${e(key)}"
aria-label="移除${e(label)}：${e(value)}">${e(label)}：${e(value)} ×</button>`).join("")}
<button class="btn text" data-action="reset-filters">清空</button></div>`;
}
function articlePagination(meta) {
  const sizes = [...new Set([10, 20, 50, 100, state.pageSize])].sort((a, b) => a - b);
  return `<div class="pagination"><span>共 ${e(num(meta.total))} 篇</span><label>每页
<select id="page-size" class="input">${sizes.map(n => `<option value="${e(n)}" ${state.pageSize === n ? "selected" : ""}>${e(n)}</option>`)
    .join("")}</select></label><button class="btn" data-action="list-prev" aria-label="上一页" ${state.listPage <= 1 ? "disabled" : ""}>‹</button>
<span>${e(num(state.listPage))} / ${e(num(Math.max(1, Math.ceil(meta.total / state.pageSize))))}</span>
<button class="btn" data-action="list-next" aria-label="下一页" ${meta.has_more ? "" : "disabled"}>›</button></div>`;
}
async function renderArticles(version = runtime.renderVersion, context) {
  state.filters.status = "published";
  const f = { ...state.filters }, params = new URLSearchParams(), account = state.account, epoch = runtime.sessionEpoch;
  if (account) params.set("account_id", account);
  for (const key of ["mode", "from", "to", "sort", "order", "platform", "topic", "data_status", ...pipelineFilters]) {
    if (f[key]) params.set(key, f[key]);
  }
  params.set("status", "published");
  params.set("page", state.listPage);
  params.set("page_size", state.pageSize);
  const payload = await api(`/articles?${params}`, { envelope: true, context });
  if (version !== runtime.renderVersion || epoch !== runtime.sessionEpoch || account !== state.account) return "";
  const allowed = new Set(state.accounts.map(row => row.id));
  if (!Array.isArray(payload.data) || payload.data.some(row => row?.status !== "published" || !allowed.has(row.account_id) ||
    account && row.account_id !== account)) {
    throw Object.assign(new Error("已发布文章读取未完成，请重新加载。"), { code: "ARTICLE_PAGE_INCOMPLETE" });
  }
  const articles = payload.data, meta = payload.meta || { total: articles.length, unfiltered_total: articles.length, has_more: false };
  state.articles = articles;
  state.articleMeta = meta;
  const content = articles.length ? articleTable(articles) : empty(meta.unfiltered_total ? "筛选无结果" : "暂无已发布文章",
    "", '<button class="btn" data-action="reset-filters">清空筛选</button>');
  return `<section class="card article-list article-ledger article-ledger-list" aria-label="已发布文章详情"><form id="article-filters" class="filters">
${platformFilter("article-platform", f.platform, "文章平台")}
</form>${filterChips(f)}${content}${articlePagination(meta)}</section>`;
}
function pipelineFilterFields(f) {
  return `${articleSelect("slot", "槽位", slotLabels, f.slot)}
${articleSelect("writer", "写作者", writerLabels, f.writer)}${articleSelect("has_warnings", "有警告", boolChoices, f.has_warnings)}
${articleSelect("has_pending_verify", "有明确待核", boolChoices, f.has_pending_verify)}
${field("series_no_min", "系列编号自", "number", f.series_no_min, 'min="1" step="1"')}
${field("series_no_max", "系列编号至", "number", f.series_no_max, 'min="1" step="1"')}`;
}
function articleFilterPanel({ filters: f = state.filters, columns: c = state.columns, account = state.account } = {}) {
  return `<form id="filter-panel">${["platform", "data_status"].map(key =>
    `<input type="hidden" name="${e(key)}" value="${e(f[key])}">`).join("")}
<h2>文章筛选 <span class="badge">应用后生效</span></h2><div class="form-grid"><label class="form-field full">运营账号
<select name="account" class="input" aria-label="运营账号">${accountOptions(account)}</select></label>${pipelineFilterFields(f)}
${field("from", "发布自", "date", f.from)}${field("to", "发布至", "date", f.to)}
${Object.entries({ mode: "生产方式", group: "分组" }).map(([key, label]) => articleSelect(key, label, articleChoices[key], f[key])).join("")}
<fieldset class="form-field full permission-fields"><legend>显示字段</legend><div class="checkboxes">
${Object.entries(articleColumns).map(([key, [label]]) => `<label class="check-option"><input type="checkbox" name="columns"
value="${e(key)}" ${c.has(key) ? "checked" : ""}>${e(label)}</label>`).join("")}</div></fieldset>
<div class="form-field full"><span>更多排序</span><input type="hidden" name="sort" value="${e(f.sort)}">
<input type="hidden" name="order" value="${e(f.order)}"><div class="head-actions">${sortChoices(f, c)}</div></div>
<div class="form-field full"><label for="filter-view">常用视图（筛选和字段）</label><select id="filter-view" class="input">
<option value="">选择视图后应用</option>${state.savedViews.map(v => `<option value="${e(v.id)}">${e(v.name)}</option>`).join("")}
</select><button type="button" class="btn" data-action="save-view">保存已应用视图</button></div></div>
<div class="form-actions"><button type="button" class="btn" data-action="reset-draft">重置草稿</button>
<button type="submit" class="btn">应用</button></div></form>`;
}
function sortChoices(f, columns) {
  return Object.entries(articleColumns).filter(([, [, sort]]) => sort).map(([key, [label, sort]]) =>
    `<button type="button" class="btn small" data-action="draft-sort" data-visible="${sort === "published_at" || columns.has(key)}"
data-sort="${e(sort)}" aria-pressed="${f.sort === sort}">${e(label)} ${f.sort === sort ? f.order === "asc" ? "↑" : "↓" : "↕"}</button>`)
    .join("") || "使用表头排序";
}
function articleDraft(form) {
  const values = new FormData(form), filters = { ...state.filters };
  for (const key of ["platform", "data_status", "from", "to", "mode", "group", "sort", "order", ...pipelineFilters]) {
    filters[key] = String(values.get(key) || "");
  }
  filters.topic = "";
  filters.status = "published";
  if (!Object.values(articleColumns).some(([, sort]) => sort === filters.sort)) filters.sort = "published_at";
  if (!["asc", "desc"].includes(filters.order)) filters.order = "desc";
  return { filters: normalizeArticlePipelineFilters(filters), columns: new Set(values.getAll("columns").filter(c => Object.hasOwn(articleColumns, c))),
    account: String(values.get("account") || "") };
}
function viewDraft(view) {
  return { filters: normalizeArticlePipelineFilters({ ...defaultFilters(), ...Object.fromEntries(Object.entries(view.filters).filter(([key]) =>
    Object.hasOwn(defaultFilters(), key))) }), columns: new Set([...view.columns.filter(key => Object.hasOwn(articleColumns, key)),
    ...view.version !== 2 && !view.columns.includes("as_of") ? ["likes", "comments", "as_of"] : []]), account: state.account };
}
function articleCell(article, key) {
  if (pipelineColumns.has(key)) return ledgerCell(article, key);
  if (["reads", "likes", "comments", "approvals", "as_of"].includes(key) && !publishedArticle(article) &&
    !hasRecordedUnknownMetrics(article)) return "未发布";
  if (key === "published" && !publishedArticle(article)) return hasRecordedUnknownMetrics(article) ?
    article.published_at ? e(time(article.published_at, true)) : "未取得" : "未发布";
  if (["reads", "likes", "comments", "approvals"].includes(key)) return dashboardMetric(article, key);
  if (key === "as_of") return article.latest_as_of ? e(time(article.latest_as_of, true)) : dashboardMetric(article, "as_of");
  if (key === "mode") return badgeMode(article.production_mode);
  if (key === "duration") return publishedArticle(article) ? e(duration(article.duration_seconds)) : "未发布";
  if (key === "account") return e(article.account_name);
  return article.date_status === "unverified" ? "日期待核实" : e(time(article.published_at, true));
}
function articleSubtitle(article) {
  const stamp = publishedArticle(article) ? article.date_status === "unverified" ? "日期待核实" : time(article.published_at, true)
    : article.run_date || "日期未标注";
  return `${platformLogo(article.platform)} ${e(article.account_name)} · ${e(stamp)} · ${e(ledgerTopic(article))}`;
}
function articleRow(article, columns) {
  return `<tr><td class="title-cell"><button class="article-link" data-action="article-detail" data-id="${e(article.id)}">
${e(article.title)}</button><div class="cell-sub">${articleSubtitle(article)}</div></td>
${columns.map(([key, [label]]) => `<td data-label="${e(label)}">${articleCell(article, key)}</td>`).join("")}
<td><button class="icon-button" data-action="article-menu" data-id="${e(article.id)}" aria-label="操作：${e(article.title)}"
aria-haspopup="menu" aria-expanded="false" aria-controls="article-menu-${e(article.id)}">⋯</button></td></tr>`;
}
function articleTable(rows) {
  const columns = Object.entries(articleColumns).filter(([key]) => state.columns.has(key));
  let previous = null;
  return `<div class="table-scroll article-desktop"><table class="data-table article-table"><thead><tr>
<th aria-sort="${!state.columns.has("published") && state.filters.sort === "published_at" ?
    state.filters.order === "asc" ? "ascending" : "descending" : "none"}">${state.columns.has("published") ? "标题" :
    sortHeading("published_at", "标题 / 发布")}</th>${columns.map(([key, [label, sort]]) => `<th ${sort ?
    `aria-sort="${state.filters.sort === sort ? state.filters.order === "asc" ? "ascending" : "descending" : "none"}"` : ""}>
${sort ? sortHeading(sort, label) : e(label)}${key === "likes" ? dashboardInfo("metrics", "点赞口径", "articles") : ""}</th>`).join("")}
<th>操作</th></tr></thead><tbody class="article-cards">${rows.map(article => {
    const group = state.filters.group ? state.filters.group === "account" ? article.account_name : modeLabels[article.production_mode] : null;
    const heading = group && group !== previous ?
      `<tr class="group-row"><td colspan="${e(columns.length + 2)}">${e(group)}</td></tr>` : "";
    previous = group;
    return heading + articleRow(article, columns);
  }).join("")}</tbody></table></div>`;
}
function articleMenu(article) {
  return `<button role="menuitem" data-action="article-detail" data-id="${e(article.id)}">详情</button>${safeURL(article.url) ?
    `<a role="menuitem" href="${e(article.url)}" target="_blank" rel="noopener noreferrer">原文 ↗</a>` : ""}
<button role="menuitem" data-action="edit-article" data-id="${e(article.id)}">编辑</button>${publishedArticle(article) ?
    `<button role="menuitem" data-action="review-article" data-id="${e(article.id)}">补充数据</button>` : ""}`;
}
function nullableSelect(name, label, choices, value) {
  return `<label class="form-field">${e(label)}<select class="input" name="${e(name)}"><option value="">未标注</option>
${Object.entries(choices).map(([key, text]) => `<option value="${e(key)}" ${value === key ? "selected" : ""}>${e(text)}</option>`).join("")}
</select></label>`;
}
function articleMetadataFields(article) {
  const status = Object.hasOwn(article, "status") ? article.status : "published";
  return `${statusSelect(status, true)}${nullableSelect("slot", "槽位", slotLabels, article.slot)}
${nullableSelect("writer", "写作者", writerLabels, article.writer)}${nullableSelect("illustrator", "配图者", illustratorLabels, article.illustrator)}
${field("run_dir", "流水线标识（保留斜杠）", "text", article.run_dir, 'maxlength="512"')}
${field("run_date", "存稿日期", "date", article.run_date)}${field("series_no", "系列编号", "number", article.series_no, 'min="1" step="1"')}
${field("char_count", "字数", "number", article.char_count, 'min="0" step="1"')}
${field("subheading_count", "小标题数", "number", article.subheading_count, 'min="0" step="1"')}
${field("image_count", "图数", "number", article.image_count, 'min="0" step="1"')}
${field("finished_at", "流水线结束", "datetime-local", localDateTime(article.timings?.finished_at))}
${field("draft_pgc_id", "头条草稿 pgc_id", "text", article.draft_ref?.pgc_id, 'maxlength="300"')}
${field("draft_appmsgid", "公众号草稿 appmsgid", "text", article.draft_ref?.appmsgid, 'maxlength="300"')}
${field("draft_editor_url", "草稿编辑链接（HTTP/HTTPS）", "url", article.draft_ref?.editor_url, 'placeholder="https://…"')}`;
}
function articleForm(article, id) {
  return `<form id="article-form" class="article-ledger article-ledger-form" data-id="${e(id)}" data-version="${e(article.version || "")}">
<p class="form-context">北京时间</p><div class="form-grid">
${field("title", '文章标题 <span class="required">*</span>', "text", article.title, 'maxlength="300" required', true)}
<label class="form-field full">所属运营账号 <span class="required">*</span><select class="input" id="field-account_id"
name="account_id" required>${accountOptions(article.account_id, false, true)}</select></label>${articleMetadataFields(article)}
${field("url", "已发布文章链接（发布时必填）", "url", article.url, 'placeholder="https://…"', true)}
${field("published_at", "实际发布时间（发布时必填）", "datetime-local", localDateTime(article.published_at))}
${field("started_at", "流水线开始（可选）", "datetime-local", localDateTime(article.started_at))}
${nullableSelect("production_mode", "原生产方式", modeLabels, article.production_mode)}
${field("platform_article_id", "平台文章标识（可选）", "text", article.platform_article_id)}
<label class="form-field full" for="field-summary">文章概况<textarea class="input" name="summary" id="field-summary"
maxlength="10000">${e(article.summary)}</textarea></label><label class="form-field full" for="field-notes">备注
<textarea class="input" name="notes" id="field-notes" maxlength="20000">${e(article.notes)}</textarea></label>
</div>${formEnd(id ? "保存修改" : "保存文章")}</form>`;
}
async function articleModal(id = "") {
  const context = beginModalRequests(), ticket = ++runtime.modalRequestVersion, version = runtime.renderVersion;
  let article = { account_id: state.account, production_mode: "unknown", status: "draft_saved" };
  if (id) article = await modalRequest(`/articles/${encodeURIComponent(id)}`, ticket, version, context);
  if (ticket !== runtime.modalRequestVersion || version !== runtime.renderVersion) return;
  const active = state.accounts.filter(account => account.active || account.id === article.account_id);
  if (!active.length) { toast("请先添加一个启用的运营账号。", true); return; }
  openModal(id ? "编辑文章" : "记录文章", articleForm(article, id));
  runtime.articleFormRecord = { record: article, sessionEpoch: runtime.sessionEpoch, ticket: runtime.modalRequestVersion };
}
export { articleDraft, articleFilterPanel, articleMenu, articleModal, articleTable, renderArticles, viewDraft };
