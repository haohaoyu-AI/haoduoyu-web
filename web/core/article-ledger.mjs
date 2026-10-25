import { e } from "./dom.mjs";
import { duration, num, time } from "./format.mjs";
import { illustratorLabels, modeLabels, slotLabels, statusLabels, writerLabels } from "./constants.mjs";
import { dashboardMetric } from "../ui/components.mjs";

const warningLabels = { TOUTIAO_TITLE_TOO_LONG: "头条标题超过 30 字", CHAR_COUNT_OUT_OF_RANGE: "字数不在 2000–2300",
  SUBHEADING_COUNT_OUT_OF_RANGE: "小标题不在 5–7", ENTERTAINMENT_IMAGES_TOO_FEW: "文娱配图不足 25 张",
  DRAFT_CREDENTIAL_MISSING: "缺少草稿凭证" };
const isPublished = row => !Object.hasOwn(row, "status") || row.status === "published";
function safeLedgerURL(value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}
function safeDraftReference(row) {
  const value = row.draft_ref && typeof row.draft_ref === "object" ? row.draft_ref : {}, refs = [];
  for (const [key, label] of [["pgc_id", "PGC"], ["appmsgid", "APPMSG"]]) {
    if (typeof value[key] === "string" && value[key].trim()) refs.push({ label: `${label} ${value[key]}` });
  }
  if (safeLedgerURL(value.editor_url)) refs.push({ label: "草稿编辑链接", href: value.editor_url });
  return refs;
}
function pipelineDuration(row) {
  if (typeof row.started_at !== "string" || typeof row.timings?.finished_at !== "string") return null;
  const start = Date.parse(row.started_at), end = Date.parse(row.timings.finished_at);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.round((end - start) / 1000) : null;
}
function ledgerTopic(row) {
  if (row.slot === "gzh") return "保险";
  return ["zh1", "zh2", "zh3", "tt1", "tt2", "tt3"].includes(row.slot) ? "文娱" : "未标注";
}
function ledgerCell(row, key) {
  if (["reads", "likes", "comments", "approvals", "as_of"].includes(key)) {
    if (!isPublished(row)) return '<span class="article-ledger-muted">未发布</span>';
    return key === "as_of" && row.latest_as_of ? e(time(row.latest_as_of, true)) : dashboardMetric(row, key);
  }
  if (key === "status") return e(statusLabels[row.status] || (isPublished(row) ? "已发布" : "未确认"));
  if (key === "slot") return e(slotLabels[row.slot] || "未标注");
  if (key === "writer") return e(writerLabels[row.writer] || "未记录");
  if (["char_count", "subheading_count", "image_count"].includes(key)) return row[key] == null ? "未取得" : e(num(row[key]));
  if (key === "draft_ref") return safeDraftReference(row).map(ref => ref.href ?
    `<a href="${e(ref.href)}" target="_blank" rel="noopener noreferrer">${e(ref.label)} ↗</a>` : `<span>${e(ref.label)}</span>`).join("<br>") || "未取得";
  if (key === "total_duration") { const seconds = pipelineDuration(row); return seconds === null ? "未取得" : e(duration(seconds)); }
  if (key === "warnings") return Array.isArray(row.warnings) ? row.warnings.map(code => e(warningLabels[code] || code)).join("；") || "无警告" : "未取得";
  if (key === "verify") return row.has_pending_verify === true ? "有待处理" : row.verify_state === "complete" ? "已核对" : "未确认";
  if (key === "topic") return e(ledgerTopic(row));
  if (key === "mode") return e(modeLabels[row.production_mode] || "未记录");
  if (key === "duration") return row.duration_seconds == null ? "未取得" : e(duration(row.duration_seconds));
  if (key === "account") return e(row.account_name || "未记录");
  return !isPublished(row) ? "未发布" : row.published_at ? e(time(row.published_at, true)) : "未取得";
}
export { illustratorLabels, isPublished, ledgerCell, ledgerTopic, pipelineDuration, safeDraftReference, safeLedgerURL,
  slotLabels, statusLabels, warningLabels, writerLabels };
