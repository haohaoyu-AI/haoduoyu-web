import { beginModalRequests } from "../core/requests.mjs";
import { api } from "../core/api.mjs";
import { articleIndex } from "../core/article-index.mjs";
import { kindLabels, metrics } from "../core/constants.mjs";
import { e } from "../core/dom.mjs";
import { accountName, bjtDate, displayTime, localDateTime, metricData, num, selectedQuery } from "../core/format.mjs";
import { clearArticleIndexes } from "../core/session-index-state.mjs";
import { runtime, state } from "../core/state.mjs";
import { accountFilter, accountOptions, empty, field, formEnd } from "../ui/components.mjs";
import { openModal } from "../ui/modal.mjs";
import { platformFilter, segmented } from "../ui/segmented.mjs";
async function renderReviews(version = runtime.renderVersion, context) {
  const generation = runtime.articleIndexGeneration, tab = state.reviewTab, pending = tab === "pending", query = selectedQuery(), matches = (id) => !state.
  filters.platform || state.accounts.find((a) => a.id === id)?.platform === state.filters.platform;
  const [articles, rows, dueRows] = await Promise.all([articleIndex(query, context), pending ? [] : api(`/${tab === "observations" ? "observ\
ations" : "daily-metrics"}?${query}`, { context }), api(`/due-reviews${query ? "?" + query : ""}`, { context })]);
  if (version !== runtime.renderVersion) return "";
  if (generation !== runtime.articleIndexGeneration) return renderReviews(version, context);
  state.reviewArticles = articles;
  const account = (r) => r.account_id || articles.find((a) => a.id === r.article_id)?.account_id, records = rows.filter((r) => matches(account(
  r))), due = dueRows.filter((r) => matches(r.account_id));
  state.reviewRecords = records;
  const tabs = `${segmented("review-tab", [["pending", `待办 ${num(due.length)}`], ["observations", "文章快照"], ["daily", "每日数据"]],
  tab, "数据类型", "tab", "page-tabs")}<div class="review-summary">${platformFilter("review-platform", state.filters.platform, "数据平台")}${accountFilter()}\
</div>`;
  const items = pending ? due : records, columns = pending ? [["account", "账号"], ["due_kind", "观察节点"], ["due_at", "目标时间"]] :
  [["account", "账号"], ...Object.entries(metrics).filter(([key]) => records.some((r) => metricData(r)[key] != null)).map(([key, label]) => [
  key, ["likes", "approvals"].includes(key) ? `${label}（${key}）` : label]), [tab === "observations" ? "as_of" : "source", tab === "obser\
vations" ? "数据截至" : "来源"]];
  const cell = (r, key) => key === "account" ? e(accountName(account(r))) : key === "due_kind" ? e(kindLabels[r.due_kind] || r.due_kind) : [
  "as_of", "due_at"].includes(key) ? e(displayTime(r[key])) : key === "source" ? e(r.source || "未标注来源") : metricData(r)[key] == null ?
  '<span class="missing-value">未取得</span>' : e(num(metricData(r)[key]));
  return tabs + `<section class="card">${items.length ? `<div class="table-scroll"><table class="data-table dashboard-table review-table"><t\
head><tr><th>${pending ? "文章" : tab === "observations" ? "文章／观察节点" : "日期／统计范围"}</th>${columns.map(([, label]) => `\
<th>${e(label)}</th>`).join("")}<th>操作</th></tr></thead><tbody>${items.map((r) => {
    const id = pending ? r.id : r.article_id, a = articles.find((a2) => a2.id === id);
    return `<tr><td class="title-cell">${id ? `<button class="article-link" data-action="article-detail" data-id="${e(id)}">${e(r.title || r.
    article_title || a?.title || "文章记录")}</button>` : e(r.date)}${pending ? "" : `<div class="cell-sub">${e(tab === "observations" ?
    kindLabels[r.kind] || r.kind : r.article_id ? r.date : "账号总体")}</div>`}</td>${columns.map(([key, label]) => `<td data-label="${e(
    label)}">${cell(r, key)}</td>`).join("")}<td>${pending ? `<button class="btn small" data-action="review-article" data-id="${e(id)}" data\
-kind="${e(r.due_kind)}">补录快照</button>` : `<button class="btn small" data-action="record-detail" data-id="${e(r.id)}">详情</button>`}\
</td></tr>`;
  }).join("")}</tbody></table></div><div class="table-footer">共 ${e(num(items.length))} 条</div>` : empty(pending ? "暂无到期提醒" :
  "暂无记录", "", pending ? "" : '<button class="btn" data-action="new-review">录入数据</button>')}</section>`;
}
async function reviewModal(articleId = "", kind = "latest", indexRetry = false) {
  const context = beginModalRequests();
  const ticket = ++runtime.modalRequestVersion, version = runtime.renderVersion, generation = runtime.articleIndexGeneration;
  const directArticle = Boolean(articleId);
  let articles;
  try {
    articles = await articleIndex("", context);
  } catch (err) {
    if (ticket !== runtime.modalRequestVersion || version !== runtime.renderVersion) return;
    throw err;
  }
  if (ticket !== runtime.modalRequestVersion || version !== runtime.renderVersion) return;
  if (generation !== runtime.articleIndexGeneration) return reviewModal(articleId, kind, indexRetry);
  if (directArticle && !articles.some((a) => a.id === articleId)) {
    if (indexRetry) throw new Error("文章不存在或无权访问，请刷新后重试。");
    clearArticleIndexes();
    return reviewModal(articleId, kind, true);
  }
  if (!articleId && state.account) articleId = articles.find((a) => a.account_id === state.account)?.id || "";
  state.reviewArticles = articles;
  const daily = state.reviewTab === "daily" && !directArticle;
  if (!articles.length && !daily) {
    openModal("录入复盘数据", empty("请先记录文章", "", '<button class="btn primary" data-action="new-article">记录发布</button>'));
    return;
  }
  const accountId = state.account || articles.find((a) => a.id === articleId)?.account_id || state.accounts.find((a) => a.active)?.id || "";
  openModal(daily ? "填写每日新增数据" : "追加文章累计快照", `<form id="review-form" data-type="${daily ? "daily" : "observa\
tion"}"><p class="form-context">北京时间</p><div class="form-grid">${daily ? `<div class="form-field"><label for="review-account">所属账号 <\
span class="required">*</span></label><select class="input" name="account_id" id="review-account" required>${accountOptions(accountId, false,
  true)}</select></div><div class="form-field"><label for="review-article">统计范围</label><select class="input" name="article_id" id="review-ar\
ticle"><option value="">账号总体</option>${articles.filter((a) => a.account_id === accountId).map((a) => `<option value="${e(a.id)}">${e(
  a.title)}</option>`).join("")}</select></div>${field("date", '数据所属日期 <span class="required">*</span>', "date", bjtDate(), `max\
="${bjtDate()}" required`)}` : `<div class="form-field full"><label for="review-article">文章 <span class="required">*</span></label><select c\
lass="input" name="article_id" id="review-article" required>${articles.map((a) => `<option value="${e(a.id)}" ${a.id === articleId ? "select\
ed" : ""}>${e(a.title)} · ${e(accountName(a.account_id))}</option>`).join("")}</select></div><div class="form-field"><label for="field-kind\
">观察节点</label><select class="input" id="field-kind" name="kind">${Object.entries(kindLabels).map(([key, label]) => `<option value="${key}\
" ${key === kind ? "selected" : ""}>${label}</option>`).join("")}</select></div>${field("as_of", '数据截至时间 <span class="required">*</span>',
  "datetime-local", localDateTime(/* @__PURE__ */ new Date()), "required")}${field("collected_at", '实际采集时间 <span class="required">*</span>',
  "datetime-local", localDateTime(/* @__PURE__ */ new Date()), "required")}`}${field("source", '数据来源 <span class="required">*</span>',
  "text", "", 'required maxlength="200"')}<div class="form-field full"><span class="field-label">${daily ? "当天新增指标" : "累计指标"}\
</span><span class="hint">至少一项；缺失留空，真实为零才填 0。</span></div>${Object.entries(metrics).map(([key, label]) => field(
  `metric_${key}`, label, "number", "", 'min="0" step="1" inputmode="numeric" placeholder="未取得"')).join("")}${daily ? "" : `<div class\
="form-field full"><label for="field-note">复盘备注</label><textarea class="input" name="note" id="field-note" maxlength="10000"></textarea></di\
v>`}</div>${formEnd(daily ? "保存每日数据" : "追加快照")}</form>`);
}
export {
  renderReviews,
  reviewModal
};
