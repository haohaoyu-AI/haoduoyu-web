import {submitUnscheduledTodo} from "./pages/unscheduled-todos.mjs";
import { isRequestAbort } from "./core/requests.mjs";
import { init, renderPage, renderShell } from "./controller.mjs";
import { api } from "./core/api.mjs";
import { $, e, icon } from "./core/dom.mjs";
import { runtime, state } from "./core/state.mjs";
import { renderLogin } from "./pages/login.mjs";
import { submitTodo } from "./pages/todos.mjs";
import { submitTodoCount, submitTodoNote, submitTodoText } from "./pages/todo-actions.mjs";
import { submitIdeaTodo } from "./pages/ideas.mjs";
import { submitTodoTemplateEdit, submitTodoTemplateForm } from "./pages/todo-templates.mjs";
import { closeModal, openModal } from "./ui/modal.mjs";
import { toast } from "./ui/toast.mjs";
async function submitLoginForm({ data }) {
  await api("/auth/login", { method: "POST", body: { username: data.username, password: data.password } });
  await init({ freshLogin: true });
}
async function submitAccountForm({ form, data, values }) {
  const id = form.dataset.id, epoch = runtime.sessionEpoch, ticket = runtime.modalRequestVersion;
  const profile = String(data.profile_url || "").trim();
  const body = id ? { name: data.name.trim(), active: values.has("active") } : {};
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
  if (saved.profile_reused) toast(`该主页已关联「${saved.name}」，已使用现有账号。访问状态未自动验证。`);
  else toast("账号已保存。请打开主页自行核验；访问状态未自动验证。");
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
  "login-form": submitLoginForm,
  "key-form": submitKeyForm,
  "revoke-form": submitRevokeForm,
  "password-form": submitPasswordForm
};
async function handleFormSubmit(event) {
  const form = event.target;
  if (form.id === 'idea-todo-form') { event.preventDefault(); await submitIdeaTodo({form,data:Object.fromEntries(new FormData(form))}); return; }
  if (form.id === 'todo-text-form') { event.preventDefault(); await submitTodoText({form,data:Object.fromEntries(new FormData(form))}); return; }
  if (form.id === 'todo-count-form') { event.preventDefault(); await submitTodoCount({form,data:Object.fromEntries(new FormData(form))}); return; }
  if (form.id === 'todo-note-form') { event.preventDefault(); await submitTodoNote({form,data:Object.fromEntries(new FormData(form))}); return; }
  if (["todo-template-form", "todo-template-edit-form"].includes(form.id)) {
    event.preventDefault();
    const handler = form.id === "todo-template-form" ? submitTodoTemplateForm : submitTodoTemplateEdit;
    await handler({ form, data: Object.fromEntries(new FormData(form)) });
    return;
  }
  if (form.id === "todo-future-form") {
    event.preventDefault();
    await submitUnscheduledTodo({data: Object.fromEntries(new FormData(form))});
    return;
  }
  if (form.id === "todo-form") {
    event.preventDefault();
    await submitTodo({ form, data: Object.fromEntries(new FormData(form)) });
    return;
  }
  if (!form.matches("#login-form,#key-form,#password-form,#revoke-form")) return;
  event.preventDefault();
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
    if (message && message.isConnected) message.textContent = err.message;
    else toast(err.message, true);
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}
export {
  handleFormSubmit
};
