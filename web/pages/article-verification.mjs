import { api } from "../core/api.mjs";
import { runtime } from "../core/state.mjs";

const copy = (value) => structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function validArticle(value, id) {
  return value?.id === id && Number.isSafeInteger(value.version) && value.version > 0 &&
    (value.verify_items === null || Array.isArray(value.verify_items));
}
function verificationIntent(index, done) {
  return `第 ${index + 1} 项设为${done ? "已处理" : "待处理"}`;
}
function createArticleVerificationStore({ article, load, put, uuid = () => crypto.randomUUID(), onChange = () => {}, isCurrent = () => true }) {
  let current = copy(article), phase = "idle", message = "", pending = null, busy = false, retryReady = false;
  const snapshot = () => ({ article: copy(current), phase, message, busy, retryReady });
  const notify = () => onChange(snapshot());
  function received(value) {
    if (!validArticle(value, current.id)) throw new Error("详情读取不完整，请重新打开核对。");
    current = copy(value);
  }
  async function reconcile(conflict = false) {
    let remote;
    try { remote = await load(current.id); } catch {
      phase = "unknown"; retryReady = false;
      message = "保存结果尚未确认，请重新核对；不会自动重发。";
      return false;
    }
    if (!validArticle(remote, current.id)) {
      phase = "unknown"; retryReady = false; message = "详情读取不完整，保存结果尚未确认。"; return false;
    }
    if (pending && remote.version > pending.body.version && same(remote.verify_items, pending.body.verify_items)) {
      received(remote); pending = null; phase = "saved"; retryReady = false;
      message = "已核对服务器记录，当前选择已保存。"; return false;
    }
    if (conflict || pending && remote.version !== pending.body.version) {
      const intent = pending ? verificationIntent(pending.index, pending.done) : "本次选择";
      received(remote); pending = null; phase = "conflict"; retryReady = false;
      message = `${intent}未保存；已显示最新版本，请核对后重新选择。`; return false;
    }
    received(remote); phase = pending ? "unknown" : "idle";
    retryReady = !!pending && same(remote.verify_items, pending.before);
    message = pending ? retryReady ? "原保存尚未确认；已读取当前版本，可显式重试原保存。" :
      "记录状态尚未确认，请重新核对；不会重发保存。" : "已重新读取最新记录。";
    return retryReady;
  }
  async function send() {
    if (!isCurrent()) return;
    phase = "saving"; message = "正在保存…"; retryReady = false; notify();
    let response;
    try { response = await put(current.id, copy(pending.body), pending.key); } catch (error) {
      if (error.status >= 400 && error.status < 500 && error.status !== 409) {
        pending = null; phase = "error"; message = error.message || "保存被拒绝，请核对后重试。";
      } else await reconcile(error.status === 409);
      return;
    }
    if (!validArticle(response, current.id) || response.version <= pending.body.version ||
      !same(response.verify_items, pending.body.verify_items)) { await reconcile(); return; }
    received({ ...current, ...response }); pending = null; phase = "saved"; message = "已保存。";
    try {
      const remote = await load(current.id);
      if (validArticle(remote, current.id) && remote.version >= current.version) {
        const matches = same(remote.verify_items, current.verify_items); received(remote);
        if (!matches) { phase = "conflict"; message = "保存后记录又有更新，已显示最新内容。"; }
      }
    } catch { message = "已保存，最新详情暂未读取。"; }
  }
  async function save(index, done) {
    if (busy || pending || !Number.isSafeInteger(index) || typeof done !== "boolean" ||
      !Array.isArray(current.verify_items) || !current.verify_items[index] ||
      typeof current.verify_items[index] !== "object") return;
    if (current.verify_items[index].done === done) return;
    const items = copy(current.verify_items); items[index].done = done;
    pending = { index, done, before: copy(current.verify_items), body: { version: current.version, verify_items: items }, key: uuid() };
    busy = true;
    try { await send(); } finally { busy = false; notify(); }
  }
  async function refresh() {
    if (busy) return;
    busy = true; notify();
    try { await reconcile(); } finally { busy = false; notify(); }
  }
  async function retry() {
    if (busy || !pending) return;
    busy = true; notify();
    try { if (await reconcile()) await send(); } finally { busy = false; notify(); }
  }
  return { snapshot, save, refresh, retry };
}

let binding = null;
function bindArticleVerification(article, { isCurrent, render }) {
  const epoch = runtime.sessionEpoch, value = { articleId: article.id, epoch, isCurrent, render, store: null };
  value.store = createArticleVerificationStore({ article,
    isCurrent: () => binding === value && epoch === runtime.sessionEpoch && isCurrent(),
    load: (id) => api(`/articles/${encodeURIComponent(id)}`),
    put: (id, body, key) => api(`/articles/${encodeURIComponent(id)}`, {
      method: "PUT", body, headers: { "Idempotency-Key": key }
    }),
    onChange: (state) => { if (binding === value && epoch === runtime.sessionEpoch && isCurrent()) render(state); }
  });
  binding = value;
  return value.store.snapshot();
}
function activeBinding() {
  return binding && binding.epoch === runtime.sessionEpoch && binding.isCurrent() ? binding : null;
}
async function handleArticleVerificationChange(target) {
  const active = activeBinding();
  if (!active || target.dataset.articleId !== active.articleId) return;
  const index = Number(target.dataset.articleVerifyIndex);
  const value = target.type === "checkbox" ? target.checked : target.value === "true" ? true : target.value === "false" ? false : null;
  if (typeof value === "boolean") {
    try { await active.store.save(index, value); } catch (error) { verificationFeedback(error); }
  }
}
function verificationFeedback(error) {
  if (!activeBinding()) return;
  const status = document.querySelector("#overlay [data-article-verify-status]");
  if (status) status.textContent = error.message || "详情暂时无法刷新，请重新打开核对。";
}
async function refreshArticleVerification() {
  try { await activeBinding()?.store.refresh(); } catch (error) { verificationFeedback(error); }
}
async function retryArticleVerification() {
  try { await activeBinding()?.store.retry(); } catch (error) { verificationFeedback(error); }
}
export { bindArticleVerification, createArticleVerificationStore, handleArticleVerificationChange,
  refreshArticleVerification, retryArticleVerification };
