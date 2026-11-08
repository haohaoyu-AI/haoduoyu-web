import { beginModalRequests } from "../core/requests.mjs";
import { kindLabels, metrics, modeLabels } from "../core/constants.mjs";
import { e } from "../core/dom.mjs";
import { accountName, displayTime, duration, metricData } from "../core/format.mjs";
import { modalRequest } from "../core/modal-request.mjs";
import { runtime } from "../core/state.mjs";
import { comparisonHTML, detailInfo, metricSummary, platformLogo, renderSnapshot } from "../ui/components.mjs";
import { openModal } from "../ui/modal.mjs";
import { bindArticleVerification } from "./article-verification.mjs";
import { hasRecordedUnknownMetrics } from "../core/article-ledger.mjs";

const articleStatus = { drafting: "撰写中", illustrated: "已配图", draft_saved: "草稿已存", published: "已发布", failed: "失败" };
const articleWriter = { dedao: "得到大脑", gemini_web: "Gemini", human: "本人", other: "其他" };
const warningLabels = { TOUTIAO_TITLE_TOO_LONG: "头条标题超过 30 字", CHAR_COUNT_OUT_OF_RANGE: "字数不在 2000–2300",
  SUBHEADING_COUNT_OUT_OF_RANGE: "小标题不在 5–7", ENTERTAINMENT_IMAGES_TOO_FEW: "文娱图片少于 25 张",
  DRAFT_CREDENTIAL_MISSING: "草稿凭证未确认" };
const isPublished = (a) => !Object.hasOwn(a, "status") || a.status === "published";
const observed = (value) => value === null || value === undefined ? "未取得" : String(value);
function safeDetailURL(value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\u007f]/u.test(value)) return false;
  try { const url = new URL(value); return !!url.hostname && !url.username && !url.password; } catch { return false; }
}
function jsonText(value) { return JSON.stringify(value, null, 2) ?? "未取得"; }
function readonlyJSON(label, value) {
  return `<details class="detail-section article-ledger-json"><summary>${e(label)}</summary><pre>${e(
    value === null || value === undefined ? "未取得" : jsonText(value))}</pre></details>`;
}
function draftReference(a) {
  const ref = a.draft_ref || {}, ids = [["pgc_id", "头条草稿"], ["appmsgid", "公众号草稿"]]
    .filter(([key]) => typeof ref[key] === "string" && ref[key].trim());
  return `<section class="detail-section"><h3>草稿凭证</h3>${ids.map(([key, label]) =>
    `<p>${e(label)} · <code>${e(ref[key])}</code></p>`).join("")}${safeDetailURL(ref.editor_url) ?
    `<p><a href="${e(ref.editor_url)}" target="_blank" rel="noopener noreferrer">草稿编辑链接 ↗</a></p>` : ""}${
    !ids.length && !safeDetailURL(ref.editor_url) ? '<p class="cell-sub">未确认</p>' : ""}<p class="cell-sub">链接只校验格式，未验证远端权限或草稿是否存在。</p></section>`;
}
function itemText(item) {
  const label = ["label", "description", "text", "message", "title", "key"].find((name) => typeof item[name] === "string" && item[name]);
  return label ? item[label] : jsonText(item);
}
function verificationControl(a, item, index, disabled) {
  const attrs = `data-article-id="${e(a.id)}" data-article-verify-index="${index}" ${disabled ? "disabled" : ""}`;
  if (typeof item.done === "boolean") return `<label class="check-option"><input type="checkbox" ${attrs} ${item.done ? "checked" : ""}>\
<span>${e(itemText(item))}</span><small>${item.done ? "已处理" : "待处理"}</small></label>`;
  return `<label class="article-verify-unknown"><span>${e(itemText(item))}</span><span class="badge">未确认</span><select \
class="input" aria-label="第 ${index + 1} 项处理状态" ${attrs}><option value="" selected>未确认，请明确选择</option>\
<option value="false">标记待处理</option><option value="true">标记已处理</option></select></label>`;
}
function verificationSection(a, view) {
  const items = Array.isArray(a.verify_items) ? a.verify_items : null;
  const disabled = view.busy || view.phase === "unknown";
  const stateLabel = { pending: "有待处理项", complete: "已确认处理状态", unknown: "状态未确认" }[a.verify_state] || "状态未确认";
  return `<section class="detail-section article-verification"><h3>待核清单 <span class="badge">${e(stateLabel)}</span></h3>${items ?
    items.length ? `<ul class="article-verification-items">${items.map((item, index) => `<li>${verificationControl(a, item, index,
      disabled)}<details><summary>原始信息</summary><pre>${e(jsonText(item))}</pre></details></li>`).join("")}</ul>` :
    '<p class="cell-sub">清单为空，没有已记录的待核项。</p>' : '<p class="cell-sub">未取得清单，不能判断是否已处理。</p>'}\
<p class="article-verify-status" data-article-verify-status role="status" aria-live="polite">${e(view.message || "修改后按当前版本保存。")}</p>\
<div class="head-actions">${view.phase === "unknown" ? `<button class="btn small" data-action="article-verify-refresh" ${view.busy ?
    "disabled" : ""}>重新核对</button>${view.retryReady ? `<button class="btn small" data-action="article-verify-retry" ${view.busy ?
      "disabled" : ""}>重试原保存</button>` : ""}` :
    ""}</div></section>`;
}
function articlePipelineFields(a) {
  const topic = a.slot === "gzh" ? "保险" : ["zh1", "zh2", "zh3", "tt1", "tt2", "tt3"].includes(a.slot) ? "文娱" : "未标注";
  const seconds = a.started_at && a.timings?.finished_at ? (Date.parse(a.timings.finished_at) - Date.parse(a.started_at)) / 1000 : null;
  return [["状态", articleStatus[a.status] || "未确认"], ["槽位", a.slot || "未标注"], ["题材", topic],
    ["写作者", articleWriter[a.writer] || "未标注"], ["配图者", a.illustrator || "未标注"], ["字数", observed(a.char_count)],
    ["小标题", observed(a.subheading_count)], ["图数", observed(a.image_count)], ["流水线开始", displayTime(a.started_at)],
    ["流水线结束", displayTime(a.timings?.finished_at)], ["流水线总耗时", Number.isFinite(seconds) && seconds >= 0 ? duration(seconds) : "未取得"]];
}
function renderArticleDetailBody(a, view = { phase: "idle", busy: false, retryReady: false, message: "" }) {
  const publication = isPublished(a) ? displayTime(a.published_at) : hasRecordedUnknownMetrics(a) ?
    a.published_at ? displayTime(a.published_at) : "未取得" : "未发布";
  const info = [["生产方式", modeLabels[a.production_mode] || "未记录"], ["原始发布时间", publication],
    ["录入者", a.recorded_by?.label || "未记录"], ["修改者", a.last_modified_by?.label || "未记录"], ["录入时间", displayTime(a.created_at)],
    ["修改时间", displayTime(a.updated_at)]];
  return `<div class="article-ledger-detail" data-article-detail="${e(a.id)}"><div class="head-actions">${isPublished(a) && safeDetailURL(a.url) ?
    `<a class="btn small" href="${e(a.url)}" target="_blank" rel="noopener noreferrer">原文 ↗</a>` : ""}\
<button class="btn small" data-action="edit-article" data-id="${e(a.id)}">编辑</button>${isPublished(a) ?
    `<button class="btn small primary" data-action="review-article" data-id="${e(a.id)}">+ 补充数据</button>` : ""}</div>\
<dl class="detail-grid">${articlePipelineFields(a).map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join("")}</dl>\
${Array.isArray(a.warnings) && a.warnings.length ? `<p class="info-line warn">${a.warnings.map((code) => e(warningLabels[code] || code)).join(" · ")}</p>` :
    ""}${draftReference(a)}${readonlyJSON("样本来源", a.sample)}${readonlyJSON("阶段时间线", a.timings)}${readonlyJSON("阻塞记录", a.blockers)}\
${verificationSection(a, view)}${renderArticleAnalytics(a)}<details class="detail-section"><summary>记录信息</summary><dl class="detail-grid">\
${info.map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join("")}</dl></details>${[["summary", "概况"], ["notes", "备注"]]
    .filter(([key]) => typeof a[key] === "string" && a[key].trim()).map(([key, label]) => `<section class="detail-section"><h3>${e(label)}</h3><p>${e(
      a[key])}</p></section>`).join("")}</div>`;
}
function renderArticleAnalytics(a) {
  const unconfirmed = hasRecordedUnknownMetrics(a);
  if (!isPublished(a) && !unconfirmed) return '<section class="detail-section article-unpublished"><h3>阅读与复盘</h3><strong>未发布</strong>\
<p class="cell-sub">发布后再记录阅读指标和复盘节点。</p></section>';
  const timeline = a.timeline || a.observations || [], nodes = a.nodes || [], missing = unconfirmed ? "未取得" : "未采集";
  const summary = unconfirmed && a.latest_metrics == null ? '<p class="cell-sub">最新汇总指标未取得。</p>' : metricSummary(a);
  return `${unconfirmed ? '<section class="detail-section"><h3>状态未确认</h3><p>以下为已有指标与历史记录。</p></section>' : ""}\
${summary}<p class="cell-sub">截至 ${a.latest_metrics == null ? missing : e(displayTime(a.latest_as_of))} · 采集于 ${a.
  latest_metrics == null ? missing : e(displayTime(a.latest_collected_at))}</p><section class="detail-section">${unconfirmed ? "" :
  `<h3>观察节点</h3><ol \
class="snapshot-nodes">${nodes.map((n) => {
    const unknown = n.kind !== "latest" && a.date_status === "unverified" && !n.snapshot, status = unknown ? "unknown" : n.status, label = unknown ?
    "日期待核实" : { recorded: "已记录", before_due: "记录早于节点", not_due: "未到期", not_collected: "未采集" }[status] ||
    "状态未知";
    return `<li class="node ${e(status)}"><strong>${e(kindLabels[n.kind] || n.kind)}</strong><span>${e(label)}</span><small>${e(displayTime(
    n.snapshot?.as_of || n.due_at))}</small></li>`;
  }).join("")}</ol>`}<h3>快照时间线 ${detailInfo("按截至时间排序；相邻累计快照差值不等同每日新增。节点类型不代表先后。",
  "时间线口径", "timeline")}</h3>${timeline.length < 2 ? `<p class="insufficient">${timeline.length ? "只有一期数据，暂不显示增长。" :
  unconfirmed ? "没有已记录的历史快照。" : "尚未采集快照。"}</p>` : ""}<ol class="snapshot-timeline">${timeline.map((r) => `<li>${renderSnapshot(r)}${r.changes ? `<div \
class="snapshot-changes">${["reads", "likes",
    "comments", "approvals"].filter((key) => metricData(r)[key] != null).map((key) => `<span>${e(metrics[key])}${comparisonHTML(
  r.changes[key])}${detailInfo(r.changes[key]?.reason || "指标未取得", metrics[key] + "变化说明", r.id + "-" + key)}</span>`).join(
  "")}</div>` : ""}</li>`).join("")}</ol></section>`;
}
async function articleDetail(id) {
  const context = beginModalRequests();
  const ticket = ++runtime.modalRequestVersion, version = runtime.renderVersion, a = await modalRequest(`/articles/${encodeURIComponent(id)}`,
  ticket, version, context);
  if (ticket !== runtime.modalRequestVersion || version !== runtime.renderVersion) return;
  openModal(a.title, renderArticleDetailBody(a), { drawer: true, context: `<div class="account-title">${platformLogo(a.platform)}${e(
    a.account_name || accountName(a.account_id))} · ${e(articleStatus[a.status] || "未确认")}</div>` });
  const modal = runtime.modalRequestVersion, epoch = runtime.sessionEpoch;
  const isCurrent = () => modal === runtime.modalRequestVersion && version === runtime.renderVersion && epoch === runtime.sessionEpoch &&
    document.querySelector("#overlay .article-ledger-detail")?.dataset.articleDetail === a.id;
  bindArticleVerification(a, { isCurrent, render(view) {
    if (!isCurrent()) return;
    const focused = document.activeElement?.dataset?.articleVerifyIndex;
    document.querySelector("#overlay .article-ledger-detail").outerHTML = renderArticleDetailBody(view.article, view);
    document.querySelector("#modal-title").textContent = view.article.title;
    if (focused !== undefined && !view.busy) Array.from(document.querySelectorAll("#overlay [data-article-verify-index]"))
      .find((node) => node.dataset.articleVerifyIndex === focused)?.focus();
  } });
}
export {
  articleDetail,
  renderArticleDetailBody,
  renderArticleAnalytics
};
