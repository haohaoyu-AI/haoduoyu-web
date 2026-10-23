import { api } from "../core/api.mjs";
import { $, e } from "../core/dom.mjs";
import { isRequestAbort } from "../core/requests.mjs";
import { state } from "../core/state.mjs";
import { mergeTodoTemplate, templateState } from "../core/todo-templates-state.mjs";
import { mergeTodo, todoDate, todoDay, todoOwner, todoSessionActive, validTodoDate } from "../core/todos-state.mjs";
import { popover } from "../ui/popover.mjs";
import { refreshOpenTodoTemplates } from "./todo-templates.mjs";
import { loadTodos, paintTodos, setTodoNotice } from "./todos.mjs";
function todoBusy(day, id) {
  return day.updates.has(id) || day.removals.has(id) || day.templateWrites.has(id);
}
function todoActionContext({ id, date, owner = todoOwner() }) {
  if (!state.me || state.page !== "todos" || !validTodoDate(date) || date !== todoDate() || !todoSessionActive(owner)) return null;
  const day = todoDay(date), item = day.items.find((row) => row.id === id);
  return item ? { day, item, owner } : null;
}
function canOpenTodoMenu({ id, date, anchor }) {
  const context = todoActionContext({ id, date });
  return Boolean(context && anchor?.isConnected && !context.item.deleted_at && !todoBusy(context.day, id));
}
function openTodoMenu({ target, id, date, anchor }) {
  date ||= target?.dataset.date;
  anchor ||= target?.closest(".daily-todo-row");
  if (!canOpenTodoMenu({ id, date, anchor })) return;
  const { item, owner } = todoActionContext({ id, date });
  const trigger = target || $('[data-action="todo-menu"]', anchor);
  if (!trigger) return;
  const attributes = `data-id="${e(id)}" data-date="${e(date)}" data-owner="${e(owner)}" role="menuitem"`;
  const commonAction = item.template_active ? "todo-remove-template" : "todo-make-template";
  const commonLabel = item.template_active ? "取消常用待办" : "添加为常用待办";
  popover(trigger, `<button data-action="${commonAction}" ${attributes}>${commonLabel}</button>
<button data-action="todo-delete" ${attributes}>删除</button>`, { menu: true, label: "事项操作" });
}
function renderTodoUndo(day) {
  return [...day.removals.entries()].map(([id, ticket]) => {
    const label = ticket.phase === "deleting" ? "删除中…" : ticket.phase === "restoring" ? "恢复中…" : "已删除";
    return `<div class="todo-undo-entry"><span>${label}：${e(ticket.item.text)}</span>
<button class="btn text small" data-action="todo-restore" data-id="${e(id)}" data-date="${e(day.date)}"
data-owner="${e(todoOwner())}" ${ticket.phase === "ready" ? "" : "disabled"}>撤销</button></div>`;
  }).join("");
}
function expireTodoUndo(day, id, ticket, owner) {
  clearTimeout(ticket.timer);
  ticket.timer = setTimeout(() => {
    if (!todoSessionActive(owner) || day.removals.get(id) !== ticket || ticket.phase !== "ready") return;
    day.removals.delete(id);
    paintTodos();
  }, 8000);
  ticket.timer?.unref?.();
}
async function todoActionFailure(day, error, owner) {
  if (!todoSessionActive(owner) || isRequestAbort(error) || error.staleSession) return;
  day.error = error.message;
  if ([404, 409].includes(error.status) && day.date === todoDate()) {
    day.error = "这项计划已更新，请核对最新内容后再操作。";
    await loadTodos();
  }
}
async function deleteTodo(options) {
  const context = todoActionContext(options);
  if (!context || context.item.deleted_at || todoBusy(context.day, context.item.id)) return;
  const { day, item, owner } = context, ticket = { item, phase: "deleting", timer: null };
  day.removals.set(item.id, ticket);
  day.error = "";
  day.notice = "";
  day.revision++;
  paintTodos();
  try {
    const saved = await api(`/todos/${encodeURIComponent(item.id)}`, { method: "DELETE", body: { date: day.date, version: item.version } });
    if (!todoSessionActive(owner)) return;
    mergeTodo(day, saved);
    ticket.item = saved;
    ticket.phase = "ready";
    expireTodoUndo(day, item.id, ticket, owner);
    if (saved.template_id) refreshOpenTodoTemplates();
  } catch (error) {
    if (!todoSessionActive(owner)) return;
    day.removals.delete(item.id);
    await todoActionFailure(day, error, owner);
    if (todoSessionActive(owner) && item.template_id && [404, 409].includes(error.status)) refreshOpenTodoTemplates();
  } finally {
    if (todoSessionActive(owner)) {
      day.revision++;
      paintTodos();
    }
  }
}
async function restoreTodo({ id, date, owner = todoOwner() }) {
  if (!state.me || state.page !== "todos" || date !== todoDate() || !todoSessionActive(owner)) return;
  const day = todoDay(date), ticket = day.removals.get(id);
  if (!ticket || ticket.phase !== "ready") return;
  clearTimeout(ticket.timer);
  ticket.phase = "restoring";
  mergeTodo(day, ticket.item);
  day.error = "";
  day.revision++;
  paintTodos();
  try {
    const saved = await api(`/todos/${encodeURIComponent(id)}/restore`, {
      method: "POST", body: { date, version: ticket.item.version }
    });
    if (!todoSessionActive(owner)) return;
    mergeTodo(day, saved);
    day.removals.delete(id);
    setTodoNotice(day, "已恢复");
    if (saved.template_id) refreshOpenTodoTemplates();
  } catch (error) {
    if (!todoSessionActive(owner)) return;
    if (error.status === 409) day.removals.delete(id);
    else {
      ticket.phase = "ready";
      expireTodoUndo(day, id, ticket, owner);
    }
    await todoActionFailure(day, error, owner);
    if (todoSessionActive(owner) && ticket.item.template_id && [404, 409].includes(error.status)) refreshOpenTodoTemplates();
  } finally {
    if (todoSessionActive(owner)) {
      day.revision++;
      paintTodos();
    }
  }
}
function todoTemplateRequest(day, item) {
  let request = day.templateLinks.get(item.id);
  if (!request || request.version !== item.version || request.template_version !== (item.template_version || 0)) {
    request = { date: day.date, version: item.version, template_id: item.template_id || crypto.randomUUID(),
      template_version: item.template_version || 0 };
    day.templateLinks.set(item.id, request);
  }
  return request;
}
async function changeTodoTemplate(options, remove = false) {
  const context = todoActionContext(options);
  if (!context || context.item.deleted_at || todoBusy(context.day, context.item.id)) return;
  const { day, item, owner } = context;
  if (remove !== Boolean(item.template_active) || templateState().pending.has(item.template_id)) return;
  day.templateWrites.add(item.id);
  day.error = "";
  day.notice = "";
  day.revision++;
  paintTodos();
  try {
    const saved = await api(remove ? `/todo-templates/${encodeURIComponent(item.template_id)}` : `/todos/${encodeURIComponent(item.id)}/template`, {
      method: remove ? "DELETE" : "POST", body: remove ? { version: item.template_version } : todoTemplateRequest(day, item)
    });
    if (!todoSessionActive(owner)) return;
    if (remove) templateState().items = templateState().items.filter((row) => row.id !== item.template_id);
    else {
      mergeTodo(day, saved.todo);
      mergeTodoTemplate(saved.template);
    }
    day.templateLinks.delete(item.id);
    setTodoNotice(day, remove ? "已取消常用，事项已保留" : "已添加为常用");
    refreshOpenTodoTemplates();
    if (remove && day.date === todoDate()) await loadTodos();
  } catch (error) {
    if (todoSessionActive(owner)) {
      await todoActionFailure(day, error, owner);
      if (todoSessionActive(owner) && [404, 409].includes(error.status)) refreshOpenTodoTemplates();
    }
  } finally {
    if (todoSessionActive(owner)) {
      day.templateWrites.delete(item.id);
      day.revision++;
      paintTodos();
    }
  }
}
export { canOpenTodoMenu, changeTodoTemplate, deleteTodo, openTodoMenu, renderTodoUndo, restoreTodo, todoBusy };
