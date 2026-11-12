import { api } from "../core/api.mjs";
import { $, e } from "../core/dom.mjs";
import { isRequestAbort } from "../core/requests.mjs";
import { state } from "../core/state.mjs";
import { mergeTodoTemplate, templateState } from "../core/todo-templates-state.mjs";
import { mergeTodo, todoDate, todoDay, todoOwner, todoSessionActive, validTodoDate } from "../core/todos-state.mjs";
import { popover } from "../ui/popover.mjs";
import { closeModal, openModal } from "../ui/modal.mjs";
import { TODO_COUNT_MAX, todoCount, todoCountChange } from "../core/todo-count.mjs";
import { refreshOpenTodoTemplates } from "./todo-templates.mjs";
import { futureRepainting, futureTodoView, paintUnscheduledTodos } from "./unscheduled-todos.mjs";
import { loadTodos, paintTodos, setTodoNotice, todoRepainting } from "./todos.mjs";
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
  const count = todoCount(item.note);
  const counting = count ? `<button data-action="todo-count-set" ${attributes}>修改次数（${count.target} 次）</button>
${count.done ? `<button data-action="todo-count-undo" ${attributes}>撤回一次</button>` : ""}
<button data-action="todo-count-clear" ${attributes}>取消计次</button>` : `<button data-action="todo-count-set" ${attributes}>设置次数</button>`;
  popover(trigger, `${counting}<button data-action="${commonAction}" ${attributes}>${commonLabel}</button>
<button data-action="todo-delete" ${attributes}>删除</button>`, { menu: true, label: "事项操作" });
}
// Counting writes through the ordinary note endpoint, one versioned save per tap.
async function changeTodoCount(options, action, target = 0) {
  const context = todoActionContext({ ...options, owner: options.owner || todoOwner() });
  if (!context || todoBusy(context.day, context.item.id) || context.day.countWrites?.has(context.item.id)) return false;
  const { day, item, owner } = context, note = todoCountChange(item.note, action, target);
  if (note === null) return false;
  (day.countWrites ||= new Set()).add(item.id);
  try {
    const saved = await api(`/todos/${encodeURIComponent(item.id)}/note`, { method: "PATCH", body: { note, version: item.version } });
    if (!todoSessionActive(owner)) return false;
    mergeTodo(day, saved); day.noteError = "";
    return true;
  } catch (error) {
    if (isRequestAbort(error) || !todoSessionActive(owner)) return false;
    setTodoNotice(day, error.status === 404 ? "这项待办可能仍在同步，请稍后再记。" : error.message || "没有记上，请重试");
    return false;
  } finally {
    day.countWrites.delete(item.id);
    if (todoSessionActive(owner)) paintTodos();
  }
}
function openTodoCount({ id, date, owner }) {
  const context = todoActionContext({ id, date, owner: owner || todoOwner() });
  if (!context) return;
  const count = todoCount(context.item.note);
  openModal("设置次数", `<form id="todo-count-form" data-id="${e(id)}" data-date="${e(date)}" data-owner="${e(context.owner)}">
<p class="muted">${e(context.item.text)}</p>
<label for="todo-count-target">一共要做几次</label>
<input class="input" id="todo-count-target" name="target" type="number" inputmode="numeric" min="1" max="${TODO_COUNT_MAX}" step="1" required
  value="${count?.target ?? ""}">
<p class="muted">设置后每做一次点“+1”，备注会自动显示“2/5 次”。次数满了仍由你点左边的圆圈完成。</p>
<p class="form-message" role="alert"></p>
<div class="form-actions"><button class="btn primary" type="submit">确定</button></div></form>`);
}
async function submitTodoCount({ form, data }) {
  const target = Number(data.target), message = form.querySelector(".form-message"), button = form.querySelector("button[type=submit]");
  if (!Number.isInteger(target) || target < 1 || target > TODO_COUNT_MAX) { message.textContent = `请填 1 到 ${TODO_COUNT_MAX} 之间的整数`; return; }
  if (button.disabled) return;
  button.disabled = true; message.textContent = "";
  const saved = await changeTodoCount({ id: form.dataset.id, date: form.dataset.date, owner: form.dataset.owner }, "set", target);
  if (saved) closeModal(); else { button.disabled = false; message.textContent = "没有保存，请重试"; }
}
function readNote(node) {
  const raw = node?.isContentEditable ? node.textContent : node?.value;
  return String(raw ?? "").replace(/\r?\n/g, "").slice(0, 4000);
}
function placeNoteCaret(node) {
  if (!node) return;
  node.focus();
  const selection = window.getSelection?.();
  if (!selection || !node.isContentEditable) {
    const end = node.value?.length || 0;
    node.setSelectionRange?.(end, end);
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
function rememberNote(node) {
  const text = readNote(node);
  const shown = node.isContentEditable ? node.textContent : node.value;
  if (shown !== text) {
    if (node.isContentEditable) node.textContent = text;
    else node.value = text;
    placeNoteCaret(node);
  }
  if (node.dataset.future === "1") {
    const view = futureTodoView();
    if (view.noteEdit?.id === node.dataset.id) view.noteEdit.text = text;
    return;
  }
  const day = todoDay(node.dataset.date);
  if (day.noteEdit?.id === node.dataset.id) day.noteEdit.text = text;
}
function watchTodoNotes() {
  if (watchTodoNotes.ready || typeof document === "undefined") return;
  watchTodoNotes.ready = true;
  document.addEventListener("beforeinput", event => {
    const node = event.target;
    if (!node?.matches?.("[data-todo-note-input]")) return;
    if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
      event.preventDefault();
      node.blur();
    }
  });
  document.addEventListener("paste", event => {
    const node = event.target?.closest?.("[data-todo-note-input]");
    if (!node) return;
    event.preventDefault();
    const text = (event.clipboardData?.getData("text/plain") || "").replace(/\r?\n/g, "");
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  document.addEventListener("input", event => {
    if (event.target?.matches?.("[data-todo-note-input]")) rememberNote(event.target);
  });
  document.addEventListener("focusout", event => {
    if (event.target?.matches?.("[data-todo-note-input]")) void commitTodoNote(event.target);
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Enter" && event.target?.matches?.("[data-todo-note-input]")) {
      event.preventDefault();
      event.target.blur();
    }
  });
}
function openFutureNote(options) {
  const view=futureTodoView(),id=options.id || options.target?.dataset.id;
  const item=view.items.find(row=>row.id===id&&!row.deleted_at&&!row.deleted);
  if(!item||view.pending||view.uncertain[id])return;
  view.noteEdit={id:item.id,text:item.note || ""};
  view.noteError="";
  paintUnscheduledTodos();
  placeNoteCaret(document.querySelector(`#todo-future [data-todo-note-input][data-id="${CSS.escape(item.id)}"]`));
}
function openTodoNote(options) {
  watchTodoNotes();
  if(options.target?.dataset.future==="1")return openFutureNote(options);
  const context=todoActionContext({...options,date:options.date || options.target?.dataset.date,owner:options.owner || options.target?.dataset.owner});
  if(!context||todoBusy(context.day,context.item.id))return;
  const {item,day}=context;
  day.noteEdit={id:item.id,text:item.note || ""};
  day.noteError="";
  paintTodos();
  placeNoteCaret(document.querySelector(`[data-todo-note-input][data-id="${CSS.escape(item.id)}"]`));
}
async function commitFutureNote(input) {
  if(futureRepainting())return;
  const view=futureTodoView(),item=view.items.find(row=>row.id===input.dataset.id);
  if(!item||view.noteEdit?.id!==item.id||view.noteEdit.committing)return;
  const text=readNote(input);
  if(text===(item.note || "")){view.noteEdit=null;view.noteError="";paintUnscheduledTodos();return;}
  view.noteEdit.committing=true; view.noteEdit.text=text;
  try {
    const saved=await api(`/todos/${encodeURIComponent(item.id)}/note`,{method:"PATCH",body:{note:text,version:item.version}});
    Object.assign(item,saved);
    if(!saved.note)delete item.note;
    if(view.noteEdit?.id===item.id)view.noteEdit=null;
    view.noteError="";
  } catch(error) {
    if(isRequestAbort(error))return;
    if(view.noteEdit?.id===item.id){
      view.noteEdit.committing=false;
      view.noteError=error.status===404?"这项待办可能仍在同步，请稍后重试；备注内容已保留。":error.message||"保存失败，请重试";
    }
  }
  paintUnscheduledTodos();
  if(view.noteEdit?.id===item.id)document.querySelector(`#todo-future [data-todo-note-input][data-id="${CSS.escape(item.id)}"]`)?.focus();
}
async function commitTodoNote(input) {
  if(input?.dataset?.future==="1")return commitFutureNote(input);
  if (todoRepainting()) return;
  const context=todoActionContext({id:input.dataset.id,date:input.dataset.date});
  if(!context)return;
  const {day,item,owner}=context;
  if(day.noteEdit?.id!==item.id||day.noteEdit.committing)return;
  const text=readNote(input);
  if(text===(item.note || "")){day.noteEdit=null;day.noteError="";paintTodos();return;}
  day.noteEdit.committing=true; day.noteEdit.text=text;
  try {
    const saved=await api(`/todos/${encodeURIComponent(item.id)}/note`,{method:"PATCH",body:{note:text,version:item.version}});
    if(!todoSessionActive(owner))return;
    mergeTodo(day,saved);
    if(day.noteEdit?.id===item.id)day.noteEdit=null;
    day.noteError="";
  } catch(error) {
    if(!todoSessionActive(owner))return;
    if(day.noteEdit?.id===item.id){
      day.noteEdit.committing=false;
      day.noteError=error.status===404?"这项待办可能仍在同步，请稍后重试；备注内容已保留。":error.message||"保存失败，请重试";
    }
  }
  if(todoSessionActive(owner)){
    paintTodos();
    if(day.noteEdit?.id===item.id)document.querySelector(`[data-todo-note-input][data-id="${CSS.escape(item.id)}"]`)?.focus();
  }
}
async function submitTodoNote({form,data}) {
  const context=todoActionContext({id:form.dataset.id,date:form.dataset.date,owner:form.dataset.owner});
  if(!context)return;
  const button=form.querySelector('button[type=submit]'),message=form.querySelector('.form-message');
  if(button.disabled)return;
  button.disabled=true; message.textContent='';
  try {
    const saved=await api(`/todos/${encodeURIComponent(context.item.id)}/note`, {
      method:'PATCH',body:{note:String(data.note ?? ''),version:Number(form.dataset.version)}
    });
    if(!todoSessionActive(context.owner))return;
    mergeTodo(context.day,saved); context.day.revision++; closeModal(); paintTodos();
    await loadTodos();
  } catch(error) { message.textContent=error.status===404 ? '这项待办可能仍在同步，请稍后重试；备注内容已保留。' : error.message || '保存失败，请重试'; }
  finally { button.disabled=false; }
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
export { changeTodoCount, openTodoCount, submitTodoCount, canOpenTodoMenu, changeTodoTemplate, deleteTodo, openTodoMenu, openTodoNote, submitTodoNote,
  renderTodoUndo, restoreTodo, todoBusy };
