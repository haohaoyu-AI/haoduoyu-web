import { api } from "../core/api.mjs";
import { safeLedgerURL } from "../core/article-ledger.mjs";
import { illustratorLabels, modeLabels, slotLabels, statusLabels, writerLabels } from "../core/constants.mjs";
import { localDateTime } from "../core/format.mjs";
import { runtime } from "../core/state.mjs";

const textValue = value => typeof value === "string" ? value.trim() : "";
const objectValue = value => value && typeof value === "object" && !Array.isArray(value);
function articleFormCurrent(form, cache = runtime.articleFormRecord) {
  return !!cache && cache === runtime.articleFormRecord && cache.sessionEpoch === runtime.sessionEpoch &&
    cache.ticket === runtime.modalRequestVersion && form.isConnected &&
    (cache.record?.id || "") === (form.dataset.id || "") &&
    String(cache.record?.version || "") === (form.dataset.version || "");
}
function articleFormRecord(form) {
  const cache = runtime.articleFormRecord, id = form.dataset.id || "";
  if (!articleFormCurrent(form, cache) || !objectValue(cache.record) ||
    (id && (!Number.isSafeInteger(cache.record.version) || cache.record.version < 1))) {
    throw new Error("表单记录已失效，请关闭后重新打开再保存。");
  }
  return cache;
}
function nullableNumber(value, label, minimum = 0) {
  const raw = textValue(value);
  if (!raw) return null;
  const number = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(number) || number < minimum) {
    throw new Error(`${label}请填写${minimum ? "正" : "非负"}整数，未知时留空。`);
  }
  return number;
}
function choice(value, choices, label, fallback = null) {
  const raw = textValue(value);
  if (!raw) return fallback;
  if (!Object.hasOwn(choices, raw)) throw new Error(`${label}无效，请重新选择。`);
  return raw;
}
function articleTime(value, label, original) {
  const raw = textValue(value);
  if (!raw) return null;
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(raw);
  if (!parts) throw new Error(`${label}请填写有效的北京时间。`);
  const canonical = `${parts[1]}T${parts[2]}:${parts[3] || "00"}.${(parts[4] || "").padEnd(3, "0")}`;
  const stamp = new Date(`${canonical}+08:00`);
  if (!Number.isFinite(stamp.getTime()) || new Date(stamp.getTime() + 8 * 36e5).toISOString().slice(0, 23) !== canonical) {
    throw new Error(`${label}请填写真实日期和时间。`);
  }
  if (original && raw === localDateTime(original)) return new Date(original).toISOString();
  return stamp.toISOString();
}
function mergedObject(original, fields) {
  if (original != null && !objectValue(original)) throw new Error("原记录的 JSON 字段无法安全编辑，请重新打开核对。");
  const result = original == null ? {} : structuredClone(original);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null || Object.hasOwn(result, key)) result[key] = value;
  }
  return Object.keys(result).length || original != null ? result : null;
}
function publicationFields(data, original, status) {
  const raw = textValue(data.url), time = textValue(data.published_at);
  if (status !== "published" && (raw || time)) {
    throw new Error("未发布状态不能保留公开链接或发布时间，请明确清空发布信息或选择已发布。");
  }
  if (status !== "published") return { url: null, published_at: null };
  if (!raw || !time || !safeLedgerURL(raw)) throw new Error("已发布文章须填写真实的 HTTP/HTTPS 链接和实际发布时间。");
  const url = new URL(raw); url.hash = "";
  return { url: url.toString(), published_at: articleTime(time, "实际发布时间", original.published_at) };
}
function buildArticleFormPayload(data, original = {}) {
  const status = choice(data.status, statusLabels, "文章状态");
  if (!status) throw new Error("请明确选择文章状态，未确认的状态不会自动保存为草稿或已发布。");
  const body = { account_id: textValue(data.account_id), title: textValue(data.title), status,
    ...publicationFields(data, original, status), started_at: articleTime(data.started_at, "流水线开始", original.started_at),
    production_mode: choice(data.production_mode, modeLabels, "生产方式", "unknown"), summary: textValue(data.summary),
    notes: textValue(data.notes), platform_article_id: textValue(data.platform_article_id) || null,
    slot: choice(data.slot, slotLabels, "槽位"), writer: choice(data.writer, writerLabels, "写作者"),
    illustrator: choice(data.illustrator, illustratorLabels, "配图者"), run_dir: textValue(data.run_dir) || null,
    run_date: textValue(data.run_date) || null, series_no: nullableNumber(data.series_no, "系列编号", 1),
    char_count: nullableNumber(data.char_count, "字数"), subheading_count: nullableNumber(data.subheading_count, "小标题数"),
    image_count: nullableNumber(data.image_count, "图数") };
  if (!body.account_id || !body.title) throw new Error("请填写文章标题并选择所属运营账号。");
  if (body.published_at && body.started_at && body.started_at > body.published_at) {
    throw new Error("流水线开始时间不能晚于发布时间。");
  }
  const editor = textValue(data.draft_editor_url);
  if (editor && !safeLedgerURL(editor)) throw new Error("草稿编辑链接请使用有效的 HTTP/HTTPS 地址。");
  body.draft_ref = mergedObject(original.draft_ref, { pgc_id: textValue(data.draft_pgc_id) || null,
    appmsgid: textValue(data.draft_appmsgid) || null, editor_url: editor || null });
  body.timings = mergedObject(original.timings, { finished_at: articleTime(data.finished_at, "流水线结束", original.timings?.finished_at) });
  if (original.id) body.version = original.version;
  return body;
}
function equalValue(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equalValue(a[key], b[key]));
}
function savedArticle(value, pending) {
  return typeof value?.id === "string" && !!value.id && (!pending.id || value.id === pending.id) &&
    Number.isSafeInteger(value.version) && value.version > (pending.body.version || 0) &&
    Object.entries(pending.body).every(([key, expected]) => key === "version" || equalValue(value[key], expected));
}
function uncertainArticleSave(cache, message) {
  cache.saveAttempt.phase = "unknown";
  return new Error(message || "保存结果尚未确认，请先在文章列表核对；当前表单不会重复提交，请勿重复新建。");
}
async function reconcileArticleSave(cache, request, isCurrent) {
  if (!cache.saveAttempt.id) throw uncertainArticleSave(cache);
  let remote;
  try { remote = await request(`/articles/${encodeURIComponent(cache.saveAttempt.id)}`); } catch {
    if (!isCurrent()) return null;
    throw uncertainArticleSave(cache, "保存结果尚未确认，当前表单不会再次提交。请稍后重新打开记录核对。");
  }
  if (!isCurrent()) return null;
  if (savedArticle(remote, cache.saveAttempt)) return remote;
  throw uncertainArticleSave(cache, "保存结果与当前记录未能确认一致，当前表单不会再次提交。请重新打开最新记录核对。");
}
async function saveArticleForm({ form, data }, { request = api, uuid = () => crypto.randomUUID() } = {}) {
  const cache = articleFormRecord(form), isCurrent = () => articleFormCurrent(form, cache);
  if (cache.saveAttempt) throw new Error("此表单已有保存请求，请关闭后核对文章列表或最新详情，不要重复新建。");
  const body = buildArticleFormPayload(data, cache.record), id = form.dataset.id || "";
  cache.saveAttempt = { id, body: structuredClone(body), key: uuid(), phase: "saving" };
  let value;
  try {
    value = await request(id ? `/articles/${encodeURIComponent(id)}` : "/articles", {
      method: id ? "PUT" : "POST", body, headers: { "Idempotency-Key": cache.saveAttempt.key }
    });
  } catch (error) {
    if (!isCurrent()) return null;
    if (error.status >= 400 && error.status < 500) {
      if (error.status === 409 && error.code === "VERSION_CONFLICT") cache.saveAttempt.phase = "conflict";
      else delete cache.saveAttempt;
      throw error;
    }
    value = await reconcileArticleSave(cache, request, isCurrent);
  }
  if (!isCurrent()) return null;
  if (!savedArticle(value, cache.saveAttempt)) value = await reconcileArticleSave(cache, request, isCurrent);
  if (!isCurrent()) return null;
  cache.saveAttempt.phase = "saved";
  return value;
}
export { articleFormCurrent, articleFormRecord, buildArticleFormPayload, saveArticleForm };
