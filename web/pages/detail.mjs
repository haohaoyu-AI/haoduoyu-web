import { beginModalRequests } from "../core/requests.mjs";
import { kindLabels, metrics, modeLabels } from "../core/constants.mjs";
import { e } from "../core/dom.mjs";
import { accountName, displayTime, duration, metricData, safeURL } from "../core/format.mjs";
import { modalRequest } from "../core/modal-request.mjs";
import { runtime } from "../core/state.mjs";
import { comparisonHTML, detailInfo, metricSummary, platformLogo, renderSnapshot } from "../ui/components.mjs";
import { openModal } from "../ui/modal.mjs";
function renderArticleAnalytics(a) {
  const timeline = a.timeline || [], nodes = a.nodes || [];
  return `${metricSummary(a)}<p class="cell-sub">截至 ${a.latest_metrics == null ? "未采集" : e(displayTime(a.latest_as_of))} · 采集于 ${a.
  latest_metrics == null ? "未采集" : e(displayTime(a.latest_collected_at))}</p><section class="detail-section"><h3>观察节点</h3><ol class="s\
napshot-nodes">${nodes.map((n) => {
    const unknown = n.kind !== "latest" && a.date_status === "unverified" && !n.snapshot, status = unknown ? "unknown" : n.status, label = unknown ?
    "日期待核实" : { recorded: "已记录", before_due: "记录早于节点", not_due: "未到期", not_collected: "未采集" }[status] ||
    "状态未知";
    return `<li class="node ${e(status)}"><strong>${e(kindLabels[n.kind] || n.kind)}</strong><span>${e(label)}</span><small>${e(displayTime(
    n.snapshot?.as_of || n.due_at))}</small></li>`;
  }).join("")}</ol><h3>快照时间线 ${detailInfo("按截至时间排序；相邻累计快照差值不等同每日新增。节点类型不代表先后。",
  "时间线口径", "timeline")}</h3>${timeline.length < 2 ? `<p class="insufficient">${timeline.length ? "只有一期数据，暂不显示增长。" :
  "尚未采集快照。"}</p>` : ""}<ol class="snapshot-timeline">${timeline.map((r) => `<li>${renderSnapshot(r)}${r.changes ? `<div class=\
"snapshot-changes">${["reads", "likes",
    "comments", "approvals"].filter((key) => metricData(r)[key] != null).map((key) => `<span>${e(metrics[key])}${comparisonHTML(
  r.changes[key])}${detailInfo(r.changes[key]?.reason || "指标未取得", metrics[key] + "变化说明", r.id + "-" + key)}</span>`).join(
  "")}</div>` : ""}</li>`).join("")}</ol></section>`;
}
async function articleDetail(id) {
  const context = beginModalRequests();
  const ticket = ++runtime.modalRequestVersion, version = runtime.renderVersion, a = await modalRequest(`/articles/${encodeURIComponent(id)}`,
  ticket, version, context);
  if (ticket !== runtime.modalRequestVersion || version !== runtime.renderVersion) return;
  const fields = [["生产方式", modeLabels[a.production_mode] || "未记录"], ["原始发布时间", displayTime(a.published_at)], ["选题时\
间", displayTime(a.started_at)], ["耗时", duration(a.duration_seconds)], ["录入者", a.recorded_by?.label || "未记录"], ["修改者",
  `${a.last_modified_by?.label || "未记录"} · ${displayTime(a.last_modified_by?.at)}`], ["录入时间", displayTime(a.created_at)], ["修\
改时间", displayTime(a.updated_at)]];
  openModal(a.title, `<div class="head-actions">${safeURL(a.url) ? `<a class="btn small" href="${e(a.url)}" target="_blank" rel="noopener no\
referrer">原文 ↗</a>` : ""}<button class="btn small" data-action="edit-article" data-id="${e(a.id)}">编辑</button><button class="btn small\
 primary" data-action="review-article" data-id="${e(a.id)}">+ 补充数据</button></div>${renderArticleAnalytics(a)}<details class="detail-\
section"><summary>记录信息</summary><dl class="detail-grid">${fields.map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</\
dd></div>`).join("")}</dl></details>${[["summary", "概况"], ["notes", "备注"]].filter(([key]) => a[key]?.trim()).map(([key, label]) => `\
<section class="detail-section"><h3>${e(label)}</h3><p>${e(a[key])}</p></section>`).join("")}`, { drawer: true, context: `<div class="accoun\
t-title">${platformLogo(a.platform)}${e(a.account_name || accountName(a.account_id))} · ${a.date_status === "unverified" ? "日期待核实" :
  e(displayTime(a.published_at))}</div>` });
}
export {
  articleDetail,
  renderArticleAnalytics
};
