import { loadUnscheduledTodos, paintUnscheduledTodos, renderUnscheduledTodos } from "./unscheduled-todos.mjs";
import { api } from "../core/api.mjs";
import { $, e } from "../core/dom.mjs";
import { bjtDate } from "../core/format.mjs";
import { isRequestAbort } from "../core/requests.mjs";
import { updateRoute } from "../core/router.mjs";
import { runtime, state } from "../core/state.mjs";
import { mergeTodo, syncTodoDay, todoDate, todoDay, todoOwner, todoSessionActive, todoTemplateAdded, validTodoDate } from "../core/todos-state.mjs";
import { todosState } from "../core/todos-state.mjs";
import { loadTodoTemplates, paintTodoTemplates, refreshOpenTodoTemplates, renderInlineTodoTemplates, renderTodoTemplates } from "./todo-templates.mjs";
import { renderTodoUndo, todoBusy } from "./todo-actions.mjs";
import {
  paintTodoPreferences, receiveTodoPreferences, renderTodoPreferences, todoCompletedMode, todoPreferences
} from "./todo-preferences.mjs";
let todoClock = null;
let monthSnapshot = {month:"", owner:"", days:new Map(), loading:false, error:""};
const savingTimes = new WeakMap(), savingTimers = new WeakMap();
function todoCalendarMonth(date) {
  if (todosState.calendarDate !== date || !validTodoDate(`${todosState.calendarMonth}-01`)) {
    todosState.calendarDate = date;
    todosState.calendarMonth = date.slice(0, 7);
  }
  return todosState.calendarMonth;
}
function todoCalendarDay(date, selected) {
  const today = date === bjtDate(), active = date === selected;
  const items = (monthSnapshot.days.get(date) || []).filter(item => !item.deleted_at);
  const content = items.slice(0, 4).map(item => `<span class="todo-calendar-task${item.completed ? " is-complete" : ""}">${item.completed ? "✓" : "○"} ${e(item.text)}</span>`).join("");
  return `<button class="todo-calendar-day${active ? " is-selected" : ""}${today ? " is-today" : ""}" type="button"
data-action="todo-calendar-date" data-date="${e(date)}" aria-label="${e(date)}" aria-pressed="${active}"
${today ? 'aria-current="date"' : ""}><span class="todo-calendar-day-head"><strong>${Number(date.slice(-2))}</strong><small>${monthSnapshot.days.has(date) ? items.length + " 项" : ""}</small></span>${content}</button>`;
}
function todoCalendar(date) {
  const month = todoCalendarMonth(date), first = new Date(`${month}-01T00:00:00Z`), last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const blanks = (first.getUTCDay() + 6) % 7;
  const days = Array.from({ length: last.getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const cells = [...Array(blanks).fill(null), ...days];
  const index = Math.max(0, cells.indexOf(date));
  const visible = todosState.calendarView === "week" ? cells.slice(Math.floor(index / 7) * 7, Math.floor(index / 7) * 7 + 7) : cells;
  const all = [...monthSnapshot.days.values()].flat().filter(item => !item.deleted_at), done = all.filter(item => item.completed).length;
  const stats = monthSnapshot.loading ? "" : monthSnapshot.error ? `<p role="alert">${e(monthSnapshot.error)}</p>` : `<div class="todo-calendar-stats"><span>本月 ${all.length}</span><span>已完成 ${done}</span><span>未完成 ${all.length-done}</span></div>`;
  return `${stats}<div class="todo-calendar-head"><button type="button" class="btn" data-todo-calendar-view="week" aria-pressed="${todosState.calendarView === "week"}">周</button><button type="button" class="btn" data-todo-calendar-view="month" aria-pressed="${todosState.calendarView !== "week"}">月</button><button class="icon-button" type="button" data-action="todo-calendar-prev"
aria-label="上一月" ${month === "0001-01" ? "disabled" : ""}>‹</button>
<span id="todo-calendar-month" aria-live="polite">${Number(month.slice(0, 4))}年${Number(month.slice(5))}月</span>
<button class="icon-button" type="button" data-action="todo-calendar-next" aria-label="下一月"
${month === "9999-12" ? "disabled" : ""}>›</button></div>
<div class="todo-calendar-grid" role="group" aria-labelledby="todo-calendar-month">
${["一", "二", "三", "四", "五", "六", "日"].map((day) => `<span class="todo-calendar-weekday" aria-hidden="true">${day}</span>`).join("")}
${visible.map(day => day ? todoCalendarDay(day, date) : '<span aria-hidden="true"></span>').join("")}</div>`;
}
function moveTodoMonth(offset) {
  if (!todosVisible()) return;
  if (state.todoPanel === "templates" && $("#todo-templates")?.dataset.loaded !== "true") void loadTodoTemplates();
  const day = todoDay(), date = new Date(`${todoCalendarMonth(day.date)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  const month = date.toISOString().slice(0, 7);
  if (!validTodoDate(`${month}-01`)) return;
  todosState.calendarMonth = month;
  const calendar = $("#todo-calendar"), action = document.activeElement?.dataset?.action;
  if (!calendar) return;
  paintTodoCalendar(day.date); void loadTodoMonth(month);
  if (["todo-calendar-prev", "todo-calendar-next"].includes(action)) $(`[data-action="${action}"]`, calendar)?.focus();
}
function paintTodoCalendar(date) {
  const calendar = $("#todo-calendar"), month = todoCalendarMonth(date), today = bjtDate();
  if (!calendar) return;
  if (!calendar.dataset.viewBound) {
    calendar.addEventListener('click', event => {
      const button = event.target.closest('[data-todo-calendar-view]'); if (!button) return;
      todosState.calendarView = button.dataset.todoCalendarView; calendar.dataset.month = ""; paintTodoCalendar(todoDay().date);
    });
    calendar.dataset.viewBound = "true";
  }
  if (calendar.dataset.month === month && calendar.dataset.today === today) return;
  const focusedDate = document.activeElement?.dataset?.date;
  calendar.innerHTML = todoCalendar(date);
  calendar.dataset.month = month;
  calendar.dataset.today = today;
  if (focusedDate) $(`[data-date="${CSS.escape(focusedDate)}"]`, calendar)?.focus();
}
async function loadTodoMonth(month) {
  const owner = todoOwner();
  if (monthSnapshot.month === month && monthSnapshot.owner === owner && (monthSnapshot.loading || monthSnapshot.days.size)) return;
  const snapshot = {month, owner, days:new Map(), loading:true, error:""}; monthSnapshot = snapshot;
  const first = new Date(`${month}-01T00:00:00Z`), last = new Date(first); last.setUTCMonth(last.getUTCMonth()+1); last.setUTCDate(0);
  try {
    for (let start=1; start<=last.getUTCDate(); start+=5) {
      const dates = Array.from({length:Math.min(5,last.getUTCDate()-start+1)},(_,i)=>`${month}-${String(start+i).padStart(2,"0")}`);
      const results = await Promise.all(dates.map(date => api(`/todos?date=${encodeURIComponent(date)}`)));
      if (monthSnapshot !== snapshot || !todoSessionActive(owner)) return;
      for (let i=0;i<dates.length;i++) snapshot.days.set(dates[i], results[i].items || []);
    }
  } catch (error) { snapshot.days.clear(); snapshot.error = error.message || "月记录读取失败，请重试"; }
  finally { snapshot.loading = false; if (monthSnapshot === snapshot && todosVisible()) { const node = $("#todo-calendar"); if (node) { node.dataset.month=""; paintTodoCalendar(todoDay().date); } } }
}
function todoDateControls(date) {
  return `<div class="daily-todo-dates"><button class="btn small" data-action="todo-prev" aria-label="前一天">‹</button>
<label for="todo-date" class="sr-only">选择计划日期</label><input class="input" id="todo-date" type="date" value="${e(date)}">
<button class="btn small" data-action="todo-next" aria-label="后一天">›</button>
<button class="btn small" data-action="todo-today">今天</button></div>`;
}
function todoRow(item, day) {
  const pending = todoBusy(day, item.id);
  const completed = day.updates.has(item.id) ? day.updates.get(item.id) : item.completed;
  const removal = day.removals.get(item.id), deleted = removal ? removal.phase !== "restoring" : Boolean(item.deleted_at);
  if (deleted || (completed && todoCompletedMode() === "hide" && state.todoPanel !== "history")) return "";
  return `<li class="daily-todo-row${completed ? " is-complete" : ""}" data-id="${e(item.id)}" data-date="${e(day.date)}">
<label><input type="checkbox" data-todo-id="${e(item.id)}" data-date="${e(day.date)}" ${completed ? "checked" : ""}
aria-disabled="${pending}"><span class="daily-todo-text">${e(item.text)}</span></label>

<button class="todo-row-menu icon-button" type="button" data-action="todo-menu" data-id="${e(item.id)}" data-date="${e(day.date)}"
aria-label="事项操作" aria-haspopup="menu" aria-expanded="false" ${pending ? "disabled" : ""}>⋯</button></li>`;
}
function todoForm(day) {
  const label = day.date === bjtDate() ? "今天想完成什么？" : "这一天的计划";
  return `<form id="todo-form" class="daily-todo-form" data-date="${e(day.date)}" aria-label="添加 ${e(day.date)} 的计划">
<label for="todo-text" class="sr-only">${label}</label><input id="todo-text" class="input" name="text" maxlength="500" required
autocomplete="off" placeholder="${label}" value="${e(day.draft)}" >
<button class="btn primary" type="submit" ${day.adding ? "disabled" : ""}>添加</button></form>`;
}
function todoCaption(day) {
  const today = day.date === bjtDate();
  return `<time datetime="${e(day.date)}" title="北京时间">${today ? "今天 · " : ""}${e(day.date)}</time>`;
}
function todoHeading(day) {
  const selected=state.todoPanel||"today";
  return `<span id="todo-caption" hidden>${todoCaption(day)}</span><nav class="todo-page-tabs" aria-label="待办页面">
${[["today","今日"],["future","未来待办"],["history","历史"],["templates","常用"]].map(([panel,label])=>
  `<button class="btn todo-page-tab" type="button" data-action="todo-panel" data-panel="${panel==='today'?'':panel}"
  aria-current="${selected===panel?'page':'false'}" ${panel==='templates'?'aria-label="管理常用"':''}>${label}</button>`).join("")}</nav>`;
}
function renderTodoHistory(day) {
  return `<section id="todo-history" class="todo-view" aria-label="待办日历" ${state.todoPanel === "history" ? "" : "hidden"}>
<div class="todo-view-head"><h2>待办日历</h2><button class="btn" data-action="todo-panel-close">‹ 返回今日待办</button></div>
<div id="todo-calendar" class="daily-todo-calendar" data-month="${todoCalendarMonth(day.date)}" data-today="${bjtDate()}">
${todoCalendar(day.date)}</div>${todoDateControls(day.date)}</section>`;
}
function paintTodoPanels(root) {
  const panel = state.todoPanel || "";
  for (const [id, value] of [["todo-main", ""], ["todo-history", "history"], ["todo-templates", "templates"], ["todo-future", "future"]]) {
    const node = $("#" + id, root); if (node) node.hidden = id === "todo-main" ? ["templates", "future"].includes(panel) : panel !== value;
  }
  root?.querySelectorAll(".todo-list-options").forEach(node => { node.hidden = panel === "history"; });
  const back = $("#todo-return-today", root); if (back) back.hidden = !state.todoDate || Boolean(panel);
  root?.querySelectorAll('[data-action="todo-panel"]').forEach(button => {
    button.setAttribute("aria-current", button.dataset.panel === panel ? "page" : "false");
  });
}
async function setTodoPanel(panel) {
  if (!todosVisible()) return;
  state.todoPanel = ["history", "templates", "future"].includes(panel) ? panel : "";
  if (!state.todoPanel) state.todoDate = "";
  updateRoute(true); paintTodos();
  if (state.todoPanel === "future") await loadUnscheduledTodos();
  else { await loadTodos(); if (state.todoPanel === "history") void loadTodoMonth(todoCalendarMonth(todoDay().date)); }
  const selector = state.todoPanel === 'future' ? '#todo-future-text' : state.todoPanel ?
    '#todo-' + state.todoPanel + ' [data-action="todo-panel-close"]' : '#todo-text';
  $(selector)?.focus();
}
function todoPending(day) {
  return Boolean(day.adding || day.updates.size || day.templateWrites.size ||
    [...day.removals.values()].some(ticket => ticket.phase !== "ready") || todoPreferences().pending);
}
function todoStatus(day) {
  if (todoPending(day) || day.error || todoPreferences().error) return "";
  return day.loading && !day.loaded ? "" : day.notice;
}
function paintTodoSaving(root, day) {
  const busy = todoPending(day);
  root.setAttribute("aria-busy", String(busy));
  if (!busy) {
    clearTimeout(savingTimers.get(day)); savingTimers.delete(day); savingTimes.delete(day); return;
  }
  if (!savingTimes.has(day)) {
    savingTimes.set(day, Date.now());
    savingTimers.set(day, setTimeout(() => { if (todosVisible() && todoDay() === day) paintTodos(); }, 900));
  } else if (Date.now() - savingTimes.get(day) >= 900) $("#todo-status", root).textContent = "正在同步…";
}
function pendingTodo(day) {
  return day.adding && day.submitting ? `<li class="todo-pending-row" aria-label="待添加">
<span class="todo-pending-marker" aria-hidden="true"></span><span>${e(day.submitting.text)}</span></li>` : "";
}
function todoFeedback(day) {
  const error = [day.error, todoPreferences().error].filter(Boolean).join(" ");
  return error ? `${e(error)} ${day.failedCreate ? `<span>「${e(day.failedCreate.text)}」</span>
<button class="btn text small" data-action="todo-retry-add">重试添加</button>` : ""} <button class="btn text small" data-action="todo-reload">重新读取</button>` : "";
}
function todoHistoryEmpty(day) {
  return state.todoPanel === "history" && day.loaded && !day.items.some(item => !item.deleted_at) ? "这一天还没有待办。" : "";
}
function renderTodos() {
  const day = todoDay();
  return `<section id="daily-todos" class="daily-todos daily-todos-primary" data-date="${e(day.date)}" aria-label="每日计划">
<div id="todo-heading" class="daily-todo-toolbar">${todoHeading(day)}</div>
${renderTodoHistory(day)}<div id="todo-main" ${["templates", "future"].includes(state.todoPanel) ? "hidden" : ""}>${todoForm(day)}${renderInlineTodoTemplates()}
<div id="todo-feedback" class="form-message" role="alert">${todoFeedback(day)}</div>
<p id="todo-status" class="daily-todo-status" role="status">${todoStatus(day)}</p>
<div id="todo-undo" class="todo-undo" role="status">${renderTodoUndo(day)}</div>${renderTodoPreferences()}
<p id="todo-history-empty" class="daily-todo-status">${todoHistoryEmpty(day)}</p>
<ul id="todo-items" class="daily-todo-items">${day.items.map((item) => todoRow(item, day)).join("")}${pendingTodo(day)}</ul></div>
${renderTodoTemplates()}${renderUnscheduledTodos()}</section>`;
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
    "todo-items": day.items.map((item) => todoRow(item, day)).join("") + pendingTodo(day), "todo-feedback": todoFeedback(day),
    "todo-history-empty": todoHistoryEmpty(day) };
  for (const [id, html] of Object.entries(parts)) {
    const node = $("#" + id, root);
    if (node && node.innerHTML !== html) node.innerHTML = html;
  }
  paintTodoCalendar(day.date);
  const input = $("#todo-text", root), button = $("#todo-form button[type=submit]", root);
  const prompt = day.date === bjtDate() ? "今天想完成什么？" : "这一天的计划", label = $('label[for="todo-text"]', root);
  if (input && input.value !== day.draft) input.value = day.draft;
  if (input) { input.readOnly = false; input.placeholder = prompt; }
  if (label) label.textContent = prompt;
  if (button) {
    button.disabled = day.adding;
    button.textContent = "添加";
    button.setAttribute("aria-busy", String(day.adding));
  }
  paintTodoSaving(root, day);
  paintTodoPanels(root);
  paintUnscheduledTodos();
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
  if (state.todoPanel === "future") { await loadUnscheduledTodos(); return; }
  void loadTodoTemplates({ ensure: true });
  const day = todoDay(), date = day.date, owner = todoOwner(), version = runtime.renderVersion;
  const sequence = ++day.sequence, revision = day.revision;
  day.loading = true;
  day.error = "";
  paintTodos();
  try {
    const data = await api(`/todos?date=${encodeURIComponent(date)}`, { context });
    if (!todoReadActive(owner, version, date, day, sequence)) return;
    if (day.revision !== revision) return loadTodos(context);
    receiveTodoPreferences(data.completed_mode, data.preferences_version);
    day.items = data.items;
    day.loaded = true;
    if (monthSnapshot.owner === owner && monthSnapshot.month === date.slice(0, 7) && !monthSnapshot.loading) {
      monthSnapshot.days.set(date, data.items);
      const calendar = $("#todo-calendar"); if (calendar) calendar.dataset.month = "";
    }
    if (state.todoPanel === "templates") paintTodoTemplates();
  } catch (error) {
    if (todoReadActive(owner, version, date, day, sequence) && !isRequestAbort(error) && !error.staleSession) day.error = error.message;
  } finally {
    if (todoReadActive(owner, version, date, day, sequence)) {
      day.loading = false;
      paintTodos();
      if (state.todoPanel === "history") void loadTodoMonth(todoCalendarMonth(date));
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
  const owner = todoOwner(), submittedDraft = day.draft;
  day.adding = true; day.submitting = request; day.failedCreate = null;
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
      if (day.draft === submittedDraft && submittedDraft.trim() === request.text) day.draft = "";
      day.create = null;
    }
    setTodoNotice(day, "已添加");
  } catch (error) {
    if (todoSessionActive(owner)) {
      day.failedCreate = request;
      showTodoFailure(day, error);
      if (error.status === 410) {
        if (templateId) day.templateCreates.delete(templateId);
        else day.create = null;
        day.error = "原事项已被删除，输入已保留，可再次添加。";
      }
    }
  } finally {
    if (todoSessionActive(owner)) {
      day.adding = false; day.submitting = null;
      day.revision++;
      paintTodos();
    }
  }
}
async function retryTodoCreate() {
  const day = todoDay();
  if (todosVisible() && day.failedCreate && !day.adding)
    await saveTodo(day, day.failedCreate, day.failedCreate.template_id || "");
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
  if (day.adding || todoTemplateAdded(day, template.id)) return;
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
  state.todoDate = date;
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
  paintTodos();
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
  inputTodo, loadTodos, moveTodoDate, moveTodoMonth, paintTodos, refreshTodos, registerTodosClock, renderTodos, retryTodoCreate,
  selectTodoDate, setTodoNotice, setTodoPanel, submitTodo, submitTodoTemplate, toggleTodo
};
