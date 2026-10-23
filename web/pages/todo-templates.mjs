import { api } from "../core/api.mjs";
import { $, e } from "../core/dom.mjs";
import { isRequestAbort } from "../core/requests.mjs";
import { runtime, state } from "../core/state.mjs";
import { mergeTodoTemplate, templateSessionActive, templateState } from "../core/todo-templates-state.mjs";
import { todoDay } from "../core/todos-state.mjs";
import { loadTodos, submitTodoTemplate } from "./todos.mjs";
function todoTemplateRows(store) {
  const adding = todoDay().adding;
  return store.items.map((item) => `<li class="todo-template-row" data-template-id="${e(item.id)}">
<div class="todo-template-line"><button class="todo-template-use" data-action="todo-template-use" data-id="${e(item.id)}"
aria-label="添加：${e(item.text)}" ${adding || store.pending.has(item.id) ? "disabled" : ""}>${e(item.text)}</button>
<button class="btn text small" data-action="todo-template-edit" data-id="${e(item.id)}" ${store.pending.has(item.id) ? "disabled" : ""}>改名</button>
<button class="btn text small" data-action="todo-template-delete" data-id="${e(item.id)}" ${store.pending.has(item.id) ? "disabled" : ""}>删除</button></div>
<p class="todo-template-progress"><span data-template-status>${item.habit_status === "habit" ? "习惯" : "待办"}</span> ·
<span data-template-count>近30天已完成 ${Number(item.completed_days || 0)} 天</span></p></li>`).join("");
}
function todoTemplateEditor(store) {
  if (!store.editing) return "";
  return `<form id="todo-template-edit-form" class="todo-template-form" data-id="${e(store.editing.id)}">
<label for="todo-template-edit-text" class="sr-only">修改常用待办</label>
<input id="todo-template-edit-text" class="input" name="text" maxlength="500" required value="${e(store.editDraft)}">
<button class="btn" type="submit">保存</button><button class="btn text" type="button" data-action="todo-template-cancel">取消</button></form>`;
}
function renderTodoTemplates() {
  const store = templateState();
  return `<details id="todo-templates" class="daily-todo-templates"><summary>常用</summary><div class="todo-template-content">
<form id="todo-template-form" class="todo-template-form" ${store.editing ? "hidden" : ""}>
<label for="todo-template-text" class="sr-only">新建常用待办</label>
<input id="todo-template-text" class="input" name="text" maxlength="500" required placeholder="新建常用待办" value="${e(store.draft)}">
<button class="btn" type="submit">保存</button></form><div id="todo-template-editor">${todoTemplateEditor(store)}</div>
<p id="todo-template-feedback" class="form-message" role="alert">${e(store.error)}</p>
<p id="todo-template-status" class="daily-todo-status" role="status">${store.loading ? "正在读取…" : ""}</p>
<ul id="todo-template-items" class="todo-template-items">${todoTemplateRows(store)}</ul></div></details>`;
}
function syncTemplateForm(root, id, value, pending) {
  const input = $(id, root);
  if (!input) return;
  if (input.value !== value) input.value = value;
  input.readOnly = pending;
  const button = $("button[type=submit]", input.form);
  if (button) {
    button.disabled = pending;
    button.textContent = pending ? "保存中…" : "保存";
  }
}
function paintTodoTemplates() {
  const root = $("#todo-templates");
  if (!root || state.page !== "todos" || !state.me) return;
  const store = templateState(), editor = $("#todo-template-editor", root), form = $("#todo-template-edit-form", root);
  if (editor && (form?.dataset.id || null) !== (store.editing?.id || null)) editor.innerHTML = todoTemplateEditor(store);
  const create = $("#todo-template-form", root);
  if (create) create.hidden = Boolean(store.editing);
  syncTemplateForm(root, "#todo-template-text", store.draft, store.adding);
  syncTemplateForm(root, "#todo-template-edit-text", store.editDraft, store.pending.has(store.editing?.id));
  for (const [id, html] of Object.entries({ "todo-template-items": todoTemplateRows(store),
    "todo-template-feedback": e(store.error), "todo-template-status": store.loading ? "正在读取…" : "" })) {
    const node = $("#" + id, root);
    if (node && node.innerHTML !== html) node.innerHTML = html;
  }
}
function templateReadActive(store, owner, sequence, version) {
  return templateSessionActive(owner) && store.sequence === sequence && version === runtime.renderVersion && state.page === "todos";
}
async function loadTodoTemplates() {
  if (state.page !== "todos" || !state.me) return;
  const store = templateState(), owner = store.owner, sequence = ++store.sequence, revision = store.revision, version = runtime.renderVersion;
  store.loading = true;
  paintTodoTemplates();
  try {
    const data = await api("/todo-templates");
    if (!templateReadActive(store, owner, sequence, version)) return;
    if (revision !== store.revision) return loadTodoTemplates();
    store.items = data.items;
    store.loaded = true;
  } catch (error) {
    if (templateReadActive(store, owner, sequence, version) && !isRequestAbort(error) && !error.staleSession) store.error = error.message;
  } finally {
    if (templateReadActive(store, owner, sequence, version)) {
      store.loading = false;
      paintTodoTemplates();
    }
  }
}
function inputTodoTemplate(target) {
  if (target.id === "todo-template-text") templateState().draft = target.value;
  if (target.id === "todo-template-edit-text") templateState().editDraft = target.value;
}
async function templateWriteError(error, store, owner, editing = null) {
  if (!templateSessionActive(owner) || isRequestAbort(error) || error.staleSession) return;
  store.error = error.message;
  if (error.status === 409) {
    store.error = "这项常用待办已更新，草稿已保留，请核对后再保存。";
    await loadTodoTemplates();
    if (!templateSessionActive(owner) || !editing || store.editing !== editing) return;
    const latest = store.items.find((item) => item.id === editing.id);
    if (latest) editing.version = latest.version;
  }
}
async function submitTodoTemplateForm({ data }) {
  const store = templateState(), owner = store.owner, text = String(data.text || "").trim();
  if (store.adding || !state.me) return;
  store.draft = String(data.text || "");
  if (!text || text.length > 500) {
    store.error = "请填写 1–500 字的常用待办。";
    paintTodoTemplates();
    return;
  }
  if (!store.create || store.create.text !== text) store.create = { id: crypto.randomUUID(), text };
  store.adding = true;
  store.error = "";
  store.revision++;
  paintTodoTemplates();
  try {
    const item = await api("/todo-templates", { method: "POST", body: store.create });
    if (!templateSessionActive(owner)) return;
    mergeTodoTemplate(item);
    store.draft = "";
    store.create = null;
  } catch (error) {
    if (!templateSessionActive(owner)) return;
    await templateWriteError(error, store, owner);
    if (!templateSessionActive(owner)) return;
    if (error.status === 410) {
      store.create = null;
      store.error = "这个模板已被删除，输入已保留，再次保存可新建。";
    }
  } finally {
    if (templateSessionActive(owner)) {
      store.adding = false;
      store.revision++;
      paintTodoTemplates();
    }
  }
}
function editTodoTemplate(id) {
  const store = templateState(), item = store.items.find((row) => row.id === id);
  if (!item || store.pending.has(id)) return;
  store.editing = { id, version: item.version };
  store.editDraft = item.text;
  store.error = "";
  paintTodoTemplates();
  $("#todo-template-edit-text")?.focus();
}
function cancelTodoTemplateEdit() {
  const store = templateState();
  if (store.pending.has(store.editing?.id)) return;
  store.editing = null;
  store.editDraft = "";
  paintTodoTemplates();
}
async function writeTodoTemplate(id, text, remove = false) {
  const store = templateState(), owner = store.owner, item = store.items.find((row) => row.id === id);
  if (!item || store.pending.has(id)) return;
  const editing = store.editing?.id === id ? store.editing : null;
  const version = remove ? item.version : editing?.version;
  store.pending.add(id);
  store.error = "";
  store.revision++;
  paintTodoTemplates();
  try {
    const saved = await api(`/todo-templates/${encodeURIComponent(id)}`, {
      method: remove ? "DELETE" : "PATCH", body: remove ? { version } : { text, version }
    });
    if (!templateSessionActive(owner)) return;
    if (remove) store.items = store.items.filter((row) => row.id !== id);
    else mergeTodoTemplate(saved);
    if (store.editing?.id === id) store.editing = null;
    if (remove && state.page === "todos") await loadTodos();
  } catch (error) {
    if (templateSessionActive(owner)) await templateWriteError(error, store, owner, editing);
  } finally {
    if (templateSessionActive(owner)) {
      store.pending.delete(id);
      store.revision++;
      paintTodoTemplates();
    }
  }
}
async function submitTodoTemplateEdit({ form, data }) {
  const store = templateState(), text = String(data.text || "").trim();
  store.editDraft = String(data.text || "");
  if (!store.editing || store.editing.id !== form.dataset.id) return;
  if (!text || text.length > 500) {
    store.error = "请填写 1–500 字的常用待办。";
    paintTodoTemplates();
    return;
  }
  await writeTodoTemplate(store.editing.id, text);
}
async function useTodoTemplate(id) {
  const store = templateState(), item = store.items.find((row) => row.id === id);
  if (item && !store.pending.has(id)) await submitTodoTemplate(item);
}
function refreshOpenTodoTemplates() {
  const store = templateState();
  store.revision++;
  if ($("#todo-templates")?.open) loadTodoTemplates();
}
export {
  cancelTodoTemplateEdit, editTodoTemplate, inputTodoTemplate, loadTodoTemplates, paintTodoTemplates, refreshOpenTodoTemplates,
  renderTodoTemplates, submitTodoTemplateEdit, submitTodoTemplateForm, useTodoTemplate, writeTodoTemplate
};
