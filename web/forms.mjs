import { isRequestAbort } from "./core/requests.mjs";
import { init, renderPage, renderShell } from "./controller.mjs";
import { api } from "./core/api.mjs";
import { metrics } from "./core/constants.mjs";
import { $, e, icon } from "./core/dom.mjs";
import { iso } from "./core/format.mjs";
import { runtime, state } from "./core/state.mjs";
import { storage } from "./core/storage.mjs";
import { renderLogin } from "./pages/login.mjs";
import { articleFormCurrent, saveArticleForm } from "./pages/article-form.mjs";
import { submitTodo } from "./pages/todos.mjs";
import { submitTodoTemplateEdit, submitTodoTemplateForm } from "./pages/todo-templates.mjs";
import { closeModal, openModal } from "./ui/modal.mjs";
import { toast } from "./ui/toast.mjs";
async function submitSaveViewForm({ data }) {
  const saved = { id: crypto.randomUUID(), name: data.name.trim(), version: 2, filters: { ...state.filters }, columns: [...state.columns] };
  if (!saved.name) throw new Error("请填写视图名称。");
  state.savedViews = state.savedViews.filter((v) => v.name !== saved.name).concat(saved).slice(-20);
  storage.set("haoduoyu.views", JSON.stringify(state.savedViews));
  closeModal();
  toast("常用视图已保存在此浏览器。");
  await renderPage();
  return;
}
async function submitLoginForm({ data }) {
  await api("/auth/login", { method: "POST", body: { username: data.username, password: data.password } });
  await init({ freshLogin: true });
  return;
}
async function submitArticleForm({ form, data }) {
  const saved = await saveArticleForm({ form, data });
  if (!saved) return;
  closeModal();
  const epoch = runtime.sessionEpoch, ticket = runtime.modalRequestVersion;
  toast(form.dataset.id ? "文章已更新。" : "文章已保存。");
  try { await renderPage(); } catch {
    if (epoch === runtime.sessionEpoch && ticket === runtime.modalRequestVersion) {
      toast("文章已保存，但列表暂时无法刷新，请稍后刷新页面。", true);
    }
  }
  return;
}
async function submitReviewForm({ form, data }) {
  const m = {};
  for (const key of Object.keys(metrics)) {
    const value = data[`metric_${key}`];
    if (value !== "" && value != null) m[key] = Number(value);
  }
  if (!Object.keys(m).length) throw new Error("请至少填写一个已取得的指标。");
  let body, path;
  if (form.dataset.type === "daily") {
    path = "/daily-metrics";
    body = { account_id: data.account_id, article_id: data.article_id || null, date: data.date, metrics: m, source: data.source.trim() };
  } else {
    path = "/observations";
    body = { article_id: data.article_id, kind: data.kind, as_of: iso(data.as_of), collected_at: iso(data.collected_at), metrics: m, source: data.
    source.trim(), note: data.note };
  }
  await api(path, { method: "POST", body });
  closeModal();
  toast("数据已保存，总览会同步更新。");
  await renderPage();
  return;
}
async function submitAccountForm({ form, data, values }) {
  const id = form.dataset.id, epoch = runtime.sessionEpoch, ticket = runtime.modalRequestVersion;
  const profile = String(data.profile_url || "").trim();
  const body = id ? { name: data.name.trim(), active: values.has("active") } : { platform: data.platform, name: data.name.trim() };
  if (profile || id && (state.accountProfiles || []).some((row) => row.account_id === id)) body.profile_url = profile;
  const signature = JSON.stringify(body);
  if (form.accountSaveSignature !== signature) {
    form.accountSaveSignature = signature;
    form.accountSaveKey = crypto.randomUUID();
  }
  const saved = await api(id ? `/accounts/${encodeURIComponent(id)}` : "/accounts", {
    method: id ? "PUT" : "POST", body, headers: { "Idempotency-Key": form.accountSaveKey }
  });
  if (epoch !== runtime.sessionEpoch || ticket !== runtime.modalRequestVersion) return;
  const [accounts, profiles] = await Promise.all([api("/accounts"), api("/account-profiles")]);
  if (epoch !== runtime.sessionEpoch || ticket !== runtime.modalRequestVersion) return;
  state.accountProfiles = profiles;
  state.accounts = accounts.sort((a, b) => ["toutiao", "zhihu", "wechat", "other"].indexOf(a.platform) - ["toutiao", "zhihu",
  "wechat", "other"].indexOf(b.platform));
  closeModal();
  toast(saved.profile_reused ? `该主页已关联「${saved.name}」，已使用现有账号。` : "运营账号已保存。");
  renderShell();
  return;
}
async function submitKeyForm({ form, data, values }) {
  const ids = values.getAll("account_ids"), permissions = values.getAll("permissions");
  if (!ids.length) throw new Error("请至少选择一个允许访问的账号。");
  if (!permissions.length) throw new Error("请至少选择一种操作权限。");
  const result = await api("/api-keys", { method: "POST", body: { name: data.name.trim(), account_ids: ids, permissions } });
  openModal("凭证已创建 · 请立即保存", `<div class="info-line warn">${icon("key", 15)}<span>凭证仅显示一次，请安全保存。</span></div><pre class="token-box" \
id="created-token">${e(result.token)}</pre><div class="form-actions"><button class="btn" data-action="copy-token">${icon("copy",
  14)}复制凭证</button><button class="btn primary" data-action="close-modal">我已保存</button></div>`);
  await renderPage();
  return;
}
async function submitRevokeForm({ form }) {
  await api(`/api-keys/${encodeURIComponent(form.dataset.id)}`, { method: "DELETE" });
  closeModal();
  toast("凭证已撤销。");
  await renderPage();
  return;
}
async function submitPasswordForm({ form, data }) {
  if (data.newPassword !== data.confirmPassword) throw new Error("两次输入的新密码不一致。");
  await api("/auth/password", { method: "PUT", body: { currentPassword: data.currentPassword, newPassword: data.newPassword } });
  form.reset();
  toast("密码已更新，请使用新密码登录。");
  state.me = null;
  renderLogin();
  return;
}
const forms = {
  "save-view-form": submitSaveViewForm,
  "login-form": submitLoginForm,
  "article-form": submitArticleForm,
  "review-form": submitReviewForm,
  "account-form": submitAccountForm,
  "key-form": submitKeyForm,
  "revoke-form": submitRevokeForm,
  "password-form": submitPasswordForm
};
async function handleFormSubmit(event) {
  const form = event.target;
  if (["todo-template-form", "todo-template-edit-form"].includes(form.id)) {
    event.preventDefault();
    const handler = form.id === "todo-template-form" ? submitTodoTemplateForm : submitTodoTemplateEdit;
    await handler({ form, data: Object.fromEntries(new FormData(form)) });
    return;
  }
  if (form.id === "todo-form") {
    event.preventDefault();
    await submitTodo({ form, data: Object.fromEntries(new FormData(form)) });
    return;
  }
  if (!form.matches("#login-form,#article-form,#review-form,#account-form,#key-form,#password-form,#revoke-form,#article-filters,\
#save-view-form")) return;
  event.preventDefault();
  if (form.id === "article-filters") return;
  const button = $("button[type=submit]", form), message = $(".form-message", form), values = new FormData(form), data = Object.fromEntries(
  values);
  if (button?.disabled) return;
  if (message) message.textContent = "";
  if (button) button.disabled = true;
  try {
    const handler = forms[form.id];
    if (handler) await handler({ form, data, values });
  } catch (err) {
    if (err.staleSession || isRequestAbort(err)) return;
    if (form.id === "article-form" && !articleFormCurrent(form)) return;
    if (message && message.isConnected) message.textContent = err.code === "VERSION_CONFLICT" ? "这条记录已被其他人或 AI 更新。请关闭后重新打开，核对最新内容再保存。" :
    err.message;
    else toast(err.message, true);
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}
export {
  handleFormSubmit
};
