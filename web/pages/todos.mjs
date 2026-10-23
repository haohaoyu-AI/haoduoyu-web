import { api } from "../core/api.mjs";
import { $, e, icon } from "../core/dom.mjs";
import { bjtDate } from "../core/format.mjs";
import { isRequestAbort } from "../core/requests.mjs";
import { updateRoute } from "../core/router.mjs";
import { runtime, state } from "../core/state.mjs";
import { mergeTodo, syncTodoDay, todoDate, todoDay, todoOwner, todoSessionActive, validTodoDate } from "../core/todos-state.mjs";
let todoClock = null;
function todoDateControls(date) {
  return `<div class="daily-todo-dates"><button class="btn small" data-action="todo-prev" aria-label="前一天">‹</button>
<label for="todo-date" class="sr-only">查看日期</label><input class="input" id="todo-date" type="date" value="${e(date)}">
<button class="btn small" data-action="todo-next" aria-label="后一天">›</button>
<button class="btn small" data-action="todo-today">今天</button></div>`;
}
function todoRow(item, day) {
  const pending = day.updates.has(item.id);
  return `<li class="daily-todo-row${item.completed ? " is-complete" : ""}" data-id="${e(item.id)}">
<label><input type="checkbox" data-todo-id="${e(item.id)}" data-date="${e(day.date)}" ${item.completed ? "checked" : ""}
aria-disabled="${pending}"><span class="daily-todo-text">${e(item.text)}</span></label>
${pending ? '<span class="cell-sub" role="status">保存中…</span>' : ""}</li>`;
}
function todoForm(day) {
  const label = day.date === bjtDate() ? "今天想完成什么？" : "这一天的计划";
  return `<form id="todo-form" class="daily-todo-form" data-date="${e(day.date)}" aria-label="添加每日计划">
<label for="todo-text" class="sr-only">${label}</label><input id="todo-text" class="input" name="text" maxlength="500" required
autocomplete="off" placeholder="${label}" value="${e(day.draft)}" ${day.adding ? "readonly" : ""}>
<button class="btn primary" type="submit" ${day.adding ? "disabled" : ""}>${day.adding ? "保存中…" : "添加"}</button></form>`;
}
function todoCaption(day) {
  const today = day.date === bjtDate();
  const completed = day.items.filter((item) => item.completed).length;
  return `<h2 id="daily-todos-title">${today ? "今日计划" : "每日计划"}</h2>
<p class="cell-sub">${e(day.date)} · 北京时间${day.items.length ? ` · 已完成 ${completed}/${day.items.length}` : ""}</p>`;
}
function todoHeading(day) {
  const history = state.page === "todos";
  return `<div id="todo-caption">${todoCaption(day)}</div>
${history ? todoDateControls(day.date) : '<a class="btn text" href="?page=todos" data-nav="todos">历史记录 ' + icon("arrow", 14) + "</a>"}`;
}
function todoStatus(day) {
  return day.loading ? "正在读取计划…" : day.loaded && !day.items.length ? "还没有计划，写下第一件想做的事吧。" : "";
}
function todoFeedback(day) {
  return day.error ? `${e(day.error)} <button class="btn text small" data-action="todo-reload">重新读取</button>` : "";
}
function renderTodos() {
  const day = todoDay(), history = state.page === "todos";
  return `<section id="daily-todos" class="card daily-todos" data-date="${e(day.date)}" aria-labelledby="daily-todos-title">
<div id="todo-heading" class="section-heading">${todoHeading(day)}</div>
${todoForm(day)}
<div id="todo-feedback" class="form-message" role="alert">${todoFeedback(day)}</div>
<p id="todo-status" class="daily-todo-status" role="status">${todoStatus(day)}</p>
<ul id="todo-items" class="daily-todo-items">${day.items.map((item) => todoRow(item, day)).join("")}</ul>
${history ? '<p class="daily-todo-note">每天独立记录，未完成的计划也保留在原日期。</p>' : ""}</section>`;
}
function todosVisible() {
  return Boolean(state.me) && ["dashboard", "todos"].includes(state.page);
}
function paintTodos() {
  const root = $("#daily-todos");
  if (!root || !todosVisible()) return;
  const day = todoDay(), checkbox = document.activeElement?.dataset?.todoId;
  if (root.dataset.date !== day.date) {
    root.outerHTML = renderTodos();
    return;
  }
  const parts = { "todo-caption": todoCaption(day), "todo-status": todoStatus(day),
    "todo-items": day.items.map((item) => todoRow(item, day)).join(""), "todo-feedback": todoFeedback(day) };
  for (const [id, html] of Object.entries(parts)) {
    const node = $("#" + id, root);
    if (node && node.innerHTML !== html) node.innerHTML = html;
  }
  const input = $("#todo-text", root), button = $("button[type=submit]", root);
  if (input && input.value !== day.draft) input.value = day.draft;
  if (input) input.readOnly = day.adding;
  if (button) {
    button.disabled = day.adding;
    button.textContent = day.adding ? "保存中…" : "添加";
  }
  if (checkbox) $(`[data-todo-id="${CSS.escape(checkbox)}"]`, root)?.focus();
}
function todoReadActive(owner, version, date, day, sequence) {
  return todoSessionActive(owner) && version === runtime.renderVersion && todoDate() === date && day.sequence === sequence && todosVisible();
}
async function loadTodos(context) {
  if (!todosVisible()) return;
  const day = todoDay(), date = day.date, owner = todoOwner(), version = runtime.renderVersion;
  const sequence = ++day.sequence, revision = day.revision;
  day.loading = true;
  paintTodos();
  try {
    const data = await api(`/todos?date=${encodeURIComponent(date)}`, { context });
    if (!todoReadActive(owner, version, date, day, sequence)) return;
    if (day.revision !== revision) return loadTodos(context);
    day.items = data.items;
    day.loaded = true;
  } catch (error) {
    if (todoReadActive(owner, version, date, day, sequence) && !isRequestAbort(error) && !error.staleSession) day.error = error.message;
  } finally {
    if (todoReadActive(owner, version, date, day, sequence)) {
      day.loading = false;
      paintTodos();
    }
  }
}
function inputTodo(target) {
  const date = target.form?.dataset.date;
  if (target.id === "todo-text" && validTodoDate(date)) todoDay(date).draft = target.value;
}
function showTodoFailure(day, error) {
  if (!isRequestAbort(error) && !error.staleSession) day.error = error.message;
}
async function submitTodo({ form, data }) {
  if (!todosVisible() || !validTodoDate(form.dataset.date)) return;
  const day = todoDay(form.dataset.date), owner = todoOwner(), text = String(data.text || "").trim();
  if (day.adding) return;
  day.draft = String(data.text || "");
  if (day.date !== todoDate()) {
    paintTodos();
    return;
  }
  if (!text || text.length > 500) {
    day.error = "请填写 1–500 字的计划。";
    paintTodos();
    return;
  }
  if (!day.create || day.create.text !== text) day.create = { id: crypto.randomUUID(), date: day.date, text };
  day.adding = true;
  day.error = "";
  day.revision++;
  paintTodos();
  try {
    const item = await api("/todos", { method: "POST", body: day.create });
    if (!todoSessionActive(owner)) return;
    mergeTodo(day, item);
    day.draft = "";
    day.create = null;
  } catch (error) {
    if (todoSessionActive(owner)) showTodoFailure(day, error);
  } finally {
    if (todoSessionActive(owner)) {
      day.adding = false;
      day.revision++;
      paintTodos();
    }
  }
}
async function toggleTodo(target) {
  if (!todosVisible()) return;
  const day = todoDay(target.dataset.date), owner = todoOwner();
  const item = day.items.find((row) => row.id === target.dataset.todoId);
  if (!item || day.date !== todoDate()) return;
  if (day.updates.has(item.id)) {
    target.checked = item.completed;
    return;
  }
  const completed = target.checked;
  day.updates.set(item.id, true);
  day.error = "";
  day.revision++;
  paintTodos();
  try {
    const updated = await api(`/todos/${encodeURIComponent(item.id)}`, { method: "PATCH", body: { completed, version: item.version } });
    if (todoSessionActive(owner)) mergeTodo(day, updated);
  } catch (error) {
    if (!todoSessionActive(owner)) return;
    showTodoFailure(day, error);
    if (error.status === 409 && day.date === todoDate()) {
      day.error = "这项计划已更新，已重新读取，请核对后再操作。";
      await loadTodos();
    }
  } finally {
    if (todoSessionActive(owner)) {
      day.updates.delete(item.id);
      day.revision++;
      paintTodos();
    }
  }
}
function selectTodoDate(date) {
  if (!validTodoDate(date) || state.page !== "todos") return;
  state.todoDate = date === bjtDate() ? "" : date;
  updateRoute(true);
  paintTodos();
  loadTodos();
}
function moveTodoDate(offset) {
  const date = new Date(`${todoDate()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  selectTodoDate(date.toISOString().slice(0, 10));
}
function refreshTodos() {
  if (!todosVisible()) return;
  todoDay().error = "";
  loadTodos();
}
function checkTodoDay() {
  if (!state.me || !syncTodoDay() || !todosVisible()) return;
  paintTodos();
  loadTodos();
}
function scheduleTodoClock() {
  clearTimeout(todoClock);
  const midnight = Date.parse(`${bjtDate()}T00:00:00+08:00`) + 86400000;
  todoClock = setTimeout(() => {
    checkTodoDay();
    scheduleTodoClock();
  }, Math.max(20, Math.min(60000, midnight - Date.now() + 20)));
  todoClock?.unref?.();
}
function registerTodosClock() {
  window.addEventListener("focus", checkTodoDay);
  document.addEventListener("visibilitychange", checkTodoDay);
  scheduleTodoClock();
}
export {
  inputTodo, loadTodos, moveTodoDate, paintTodos, refreshTodos, registerTodosClock, renderTodos, selectTodoDate, submitTodo, toggleTodo
};
