import { api } from "../core/api.mjs";
import { $, e } from "../core/dom.mjs";
import { bjtDate } from "../core/format.mjs";
import { isRequestAbort } from "../core/requests.mjs";
import { updateRoute } from "../core/router.mjs";
import { runtime, state } from "../core/state.mjs";
import { mergeTodo, syncTodoDay, todoDate, todoDay, todoOwner, todoSessionActive, validTodoDate } from "../core/todos-state.mjs";
import { todosState } from "../core/todos-state.mjs";
import { paintTodoTemplates, refreshOpenTodoTemplates, renderTodoTemplates } from "./todo-templates.mjs";
import { renderTodoUndo, todoBusy } from "./todo-actions.mjs";
import {
  paintTodoPreferences, receiveTodoPreferences, renderTodoPreferences, todoCompletedMode, todoPreferences
} from "./todo-preferences.mjs";
let todoClock = null;
function todoCalendarMonth(date) {
  if (todosState.calendarDate !== date || !validTodoDate(`${todosState.calendarMonth}-01`)) {
    todosState.calendarDate = date;
    todosState.calendarMonth = date.slice(0, 7);
  }
  return todosState.calendarMonth;
}
function todoCalendarDay(date, selected) {
  const today = date === bjtDate(), active = date === selected;
  return `<button class="todo-calendar-day${active ? " is-selected" : ""}${today ? " is-today" : ""}" type="button"
data-action="todo-calendar-date" data-date="${e(date)}" aria-label="${e(date)}" aria-pressed="${active}"
${today ? 'aria-current="date"' : ""}>${Number(date.slice(-2))}</button>`;
}
function todoCalendar(date) {
  const month = todoCalendarMonth(date), first = new Date(`${month}-01T00:00:00Z`), last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const blanks = (first.getUTCDay() + 6) % 7;
  const days = Array.from({ length: last.getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  return `<div class="todo-calendar-head"><button class="icon-button" type="button" data-action="todo-calendar-prev"
aria-label="上一月" ${month === "0001-01" ? "disabled" : ""}>‹</button>
<span id="todo-calendar-month" aria-live="polite">${Number(month.slice(0, 4))}年${Number(month.slice(5))}月</span>
<button class="icon-button" type="button" data-action="todo-calendar-next" aria-label="下一月"
${month === "9999-12" ? "disabled" : ""}>›</button></div>
<div class="todo-calendar-grid" role="group" aria-labelledby="todo-calendar-month">
${["一", "二", "三", "四", "五", "六", "日"].map((day) => `<span class="todo-calendar-weekday" aria-hidden="true">${day}</span>`).join("")}
${'<span aria-hidden="true"></span>'.repeat(blanks)}${days.map((day) => todoCalendarDay(day, date)).join("")}</div>`;
}
function moveTodoMonth(offset) {
  if (!todosVisible()) return;
  const day = todoDay(), date = new Date(`${todoCalendarMonth(day.date)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  const month = date.toISOString().slice(0, 7);
  if (!validTodoDate(`${month}-01`)) return;
  todosState.calendarMonth = month;
  const calendar = $("#todo-calendar"), action = document.activeElement?.dataset?.action;
  if (!calendar) return;
  paintTodoCalendar(day.date);
  if (["todo-calendar-prev", "todo-calendar-next"].includes(action)) $(`[data-action="${action}"]`, calendar)?.focus();
}
function paintTodoCalendar(date) {
  const calendar = $("#todo-calendar"), month = todoCalendarMonth(date), today = bjtDate();
  if (!calendar || (calendar.dataset.month === month && calendar.dataset.today === today)) return;
  const focusedDate = document.activeElement?.dataset?.date;
  calendar.innerHTML = todoCalendar(date);
  calendar.dataset.month = month;
  calendar.dataset.today = today;
  if (focusedDate) $(`[data-date="${CSS.escape(focusedDate)}"]`, calendar)?.focus();
}
function todoDateControls(date) {
  return `<div class="daily-todo-dates"><button class="btn small" data-action="todo-prev" aria-label="前一天">‹</button>
<label for="todo-date" class="sr-only">查看日期</label><input class="input" id="todo-date" type="date" value="${e(date)}">
<button class="btn small" data-action="todo-next" aria-label="后一天">›</button>
<button class="btn small" data-action="todo-today">今天</button></div>`;
}
function todoRow(item, day) {
  const pending = todoBusy(day, item.id);
  const completed = day.updates.has(item.id) ? day.updates.get(item.id) : item.completed;
  const removal = day.removals.get(item.id), deleted = removal ? removal.phase !== "restoring" : Boolean(item.deleted_at);
  if (deleted || (completed && todoCompletedMode() === "hide")) return "";
  return `<li class="daily-todo-row${completed ? " is-complete" : ""}" data-id="${e(item.id)}" data-date="${e(day.date)}">
<label><input type="checkbox" data-todo-id="${e(item.id)}" data-date="${e(day.date)}" ${completed ? "checked" : ""}
aria-disabled="${pending}"><span class="daily-todo-text">${e(item.text)}</span></label>
${pending ? '<span class="cell-sub" role="status">保存中…</span>' : ""}
<button class="todo-row-menu icon-button" type="button" data-action="todo-menu" data-id="${e(item.id)}" data-date="${e(day.date)}"
aria-label="事项操作" aria-haspopup="menu" aria-expanded="false" ${pending ? "disabled" : ""}>⋯</button></li>`;
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
  return `<time datetime="${e(day.date)}" title="北京时间">${today ? "今天 · " : ""}${e(day.date)}</time>`;
}
function todoHeading(day) {
  return `<span id="todo-caption">${todoCaption(day)}</span>
<details id="todo-history" class="daily-todo-history" ${day.date !== bjtDate() ? "open" : ""}><summary>日历 / 历史</summary>
<div id="todo-calendar" class="daily-todo-calendar" data-month="${todoCalendarMonth(day.date)}" data-today="${bjtDate()}">
${todoCalendar(day.date)}</div>${todoDateControls(day.date)}</details>${renderTodoTemplates()}`;
}
function todoStatus(day) {
  const removing = [...day.removals.values()].some((ticket) => ticket.phase !== "ready");
  if (day.adding || day.updates.size || day.templateWrites.size || removing || todoPreferences().pending) return "保存中…";
  if (day.error || todoPreferences().error) return "";
  return day.loading && !day.loaded ? "正在读取…" : day.notice;
}
function todoFeedback(day) {
  const error = [day.error, todoPreferences().error].filter(Boolean).join(" ");
  return error ? `${e(error)} <button class="btn text small" data-action="todo-reload">重新读取</button>` : "";
}
function renderTodos() {
  const day = todoDay();
  return `<section id="daily-todos" class="daily-todos daily-todos-primary" data-date="${e(day.date)}" aria-label="每日计划">
<div id="todo-heading" class="daily-todo-toolbar">${todoHeading(day)}</div>
${todoForm(day)}
<div id="todo-feedback" class="form-message" role="alert">${todoFeedback(day)}</div>
<p id="todo-status" class="daily-todo-status" role="status">${todoStatus(day)}</p>
<div id="todo-undo" class="todo-undo" role="status">${renderTodoUndo(day)}</div>${renderTodoPreferences()}
<ul id="todo-items" class="daily-todo-items">${day.items.map((item) => todoRow(item, day)).join("")}</ul></section>`;
}
function todosVisible() {
  return Boolean(state.me) && state.page === "todos";
}
function paintTodos() {
  const root = $("#daily-todos");
  if (!root || !todosVisible()) return;
  const day = todoDay(), checkbox = document.activeElement?.dataset?.todoId;
  const menu = document.activeElement?.dataset?.action === "todo-menu" ? document.activeElement.dataset.id : null;
  if (root.dataset.date !== day.date) {
    root.outerHTML = renderTodos();
    paintTodoTemplates();
    return;
  }
  const parts = { "todo-caption": todoCaption(day), "todo-status": todoStatus(day), "todo-undo": renderTodoUndo(day),
    "todo-items": day.items.map((item) => todoRow(item, day)).join(""), "todo-feedback": todoFeedback(day) };
  for (const [id, html] of Object.entries(parts)) {
    const node = $("#" + id, root);
    if (node && node.innerHTML !== html) node.innerHTML = html;
  }
  paintTodoCalendar(day.date);
  const input = $("#todo-text", root), button = $("#todo-form button[type=submit]", root);
  if (input && input.value !== day.draft) input.value = day.draft;
  if (input) input.readOnly = day.adding;
  if (button) {
    button.disabled = day.adding;
    button.textContent = day.adding ? "保存中…" : "添加";
  }
  paintTodoPreferences();
  const focus = checkbox ? `[data-todo-id="${CSS.escape(checkbox)}"]` : menu ? `[data-action="todo-menu"][data-id="${CSS.escape(menu)}"]` : "";
  if (focus) ($(focus, root) || $("[data-todo-id]", root) || $("#todo-completed-mode", root))?.focus();
  paintTodoTemplates();
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
    receiveTodoPreferences(data.completed_mode, data.preferences_version);
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
function setTodoNotice(day, text) {
  const owner = todoOwner(), version = ++day.noticeVersion;
  day.notice = text;
  const timer = setTimeout(() => {
    if (!todoSessionActive(owner) || day.noticeVersion !== version) return;
    day.notice = "";
    if (day.date === todoDate()) paintTodos();
  }, 2500);
  timer?.unref?.();
}
async function saveTodo(day, request, templateId = "") {
  const owner = todoOwner();
  day.adding = true;
  day.error = "";
  day.notice = "";
  day.revision++;
  paintTodos();
  try {
    const item = await api("/todos", { method: "POST", body: request });
    if (!todoSessionActive(owner)) return;
    mergeTodo(day, item);
    if (templateId) day.templateCreates.delete(templateId);
    else {
      day.draft = "";
      day.create = null;
    }
    setTodoNotice(day, "已添加");
  } catch (error) {
    if (todoSessionActive(owner)) {
      showTodoFailure(day, error);
      if (error.status === 410) {
        if (templateId) day.templateCreates.delete(templateId);
        else day.create = null;
        day.error = "原事项已被删除，输入已保留，可再次添加。";
      }
    }
  } finally {
    if (todoSessionActive(owner)) {
      day.adding = false;
      day.revision++;
      paintTodos();
    }
  }
}
async function submitTodo({ form, data }) {
  if (!todosVisible() || !validTodoDate(form.dataset.date)) return;
  const day = todoDay(form.dataset.date), text = String(data.text || "").trim();
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
  await saveTodo(day, day.create);
}
async function submitTodoTemplate(template) {
  if (!todosVisible()) return;
  const day = todoDay();
  if (day.adding) return;
  let request = day.templateCreates.get(template.id);
  if (!request || request.text !== template.text) {
    request = { id: crypto.randomUUID(), date: day.date, text: template.text, template_id: template.id };
    day.templateCreates.set(template.id, request);
  }
  await saveTodo(day, request, template.id);
}
async function toggleTodo(target) {
  if (!todosVisible()) return;
  const day = todoDay(target.dataset.date), owner = todoOwner();
  const item = day.items.find((row) => row.id === target.dataset.todoId);
  if (!item || item.deleted_at || day.date !== todoDate()) return;
  if (todoBusy(day, item.id)) {
    target.checked = day.updates.has(item.id) ? day.updates.get(item.id) : item.completed;
    return;
  }
  const completed = target.checked;
  day.updates.set(item.id, completed);
  day.error = "";
  day.notice = "";
  day.revision++;
  paintTodos();
  try {
    const updated = await api(`/todos/${encodeURIComponent(item.id)}`, { method: "PATCH", body: { completed, version: item.version } });
    if (todoSessionActive(owner)) {
      mergeTodo(day, updated);
      setTodoNotice(day, "已保存");
      if (updated.template_id) refreshOpenTodoTemplates();
    }
  } catch (error) {
    if (!todoSessionActive(owner)) return;
    day.updates.set(item.id, item.completed);
    showTodoFailure(day, error);
    if (error.status === 409 && day.date === todoDate()) {
      day.error = "这项计划已更新，已重新读取，请核对后再操作。";
      await loadTodos();
      if (todoSessionActive(owner) && item.template_id) refreshOpenTodoTemplates();
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
  todosState.calendarDate = date;
  todosState.calendarMonth = date.slice(0, 7);
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
  todoPreferences().error = "";
  loadTodos();
}
function checkTodoDay() {
  if (!state.me || !syncTodoDay() || !todosVisible()) return;
  const commonOpen = $("#todo-templates")?.open;
  paintTodos();
  const common = $("#todo-templates");
  if (common && commonOpen) common.open = true;
  refreshOpenTodoTemplates();
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
  inputTodo, loadTodos, moveTodoDate, moveTodoMonth, paintTodos, refreshTodos, registerTodosClock, renderTodos,
  selectTodoDate, setTodoNotice, submitTodo, submitTodoTemplate, toggleTodo
};
