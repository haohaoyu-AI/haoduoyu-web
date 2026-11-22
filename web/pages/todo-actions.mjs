import { api } from "../core/api.mjs";
import { $, e } from "../core/dom.mjs";
import { isRequestAbort } from "../core/requests.mjs";
import { state } from "../core/state.mjs";
import { dailyTodoDraft, persistDailyTodoDraft } from "../core/todo-note-drafts.mjs";
import { mergeTodoTemplate, templateState } from "../core/todo-templates-state.mjs";
import { mergeTodo, todoDate, todoDay, todoOwner, todoSessionActive, validTodoDate } from "../core/todos-state.mjs";
import { popover } from "../ui/popover.mjs";
import { getOfflineRuntime } from "../offline/runtime.mjs";
import { closeModal, openModal } from "../ui/modal.mjs";
import { TODO_COUNT_MAX, todoCount, todoCountChange } from "../core/todo-count.mjs";
import { refreshOpenTodoTemplates } from "./todo-templates.mjs";
import { futureRepainting, futureTodoView, paintUnscheduledTodos } from "./unscheduled-todos.mjs";
import { loadTodos, paintTodos, setTodoNotice, todoRepainting } from "./todos.mjs";
function todoBusy(day, id) {
  return day.updates.has(id) || day.noteCompletions.has(id) || day.removals.has(id) || day.templateWrites.has(id);
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
  const limit = count?.target === null ? "不限" : `${count?.target} 次`;
  const counting = count ? `<button data-action="todo-count-set" ${attributes}>修改次数（${limit}）</button>
${count.done ? `<button data-action="todo-count-undo" ${attributes}>撤回一次</button>` : ""}
<button data-action="todo-count-clear" ${attributes}>取消计次</button>` : `<button data-action="todo-count-set" ${attributes}>设置次数</button>`;
  popover(trigger, `<button data-action="todo-edit-text" ${attributes}>修改文字</button>
${counting}<button data-action="${commonAction}" ${attributes}>${commonLabel}</button>
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
    mergeTodo(day, saved);
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
<label class="todo-count-open"><input type="checkbox" name="open" value="1"${count && count.target === null ? " checked" : ""}>
  不限次数，只记做了几次</label>
<label for="todo-count-target">一共要做几次</label>
<input class="input" id="todo-count-target" name="target" type="number" inputmode="numeric" min="1" max="${TODO_COUNT_MAX}" step="1"
  value="${count?.target ?? ""}">
<p class="muted">每做一次点“+1”，备注自动显示“2/5 次”；不限次数时显示“3/∞ 次”。完成仍由你点左边的圆圈。</p>
<p class="form-message" role="alert"></p>
<div class="form-actions"><button class="btn primary" type="submit">确定</button></div></form>`);
}
async function submitTodoCount({ form, data }) {
  const target = data.open ? null : Number(data.target);
  const message = form.querySelector(".form-message"), button = form.querySelector("button[type=submit]");
  if (target !== null && (!Number.isInteger(target) || target < 1 || target > TODO_COUNT_MAX)) {
    message.textContent = `请填 1 到 ${TODO_COUNT_MAX} 之间的整数，或勾选“不限次数”`; return;
  }
  if (button.disabled) return;
  button.disabled = true; message.textContent = "";
  const saved = await changeTodoCount({ id: form.dataset.id, date: form.dataset.date, owner: form.dataset.owner }, "set", target);
  if (saved) closeModal(); else { button.disabled = false; message.textContent = "没有保存，请重试"; }
}
function readNote(node) {
  const raw = node?.value ?? node?.textContent;
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
  const draft = day.noteEdit;
  if (draft?.id !== node.dataset.id || draft.text === text) return;
  draft.text = text;
  draft.error = "";
  // Reverting to the old text is still an edit while a different value is being saved.
  if (draft.save) draft.check = true;
  persistDailyTodoDraft(day, draft);
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
      const node = event.target;
      if (node.dataset.future !== "1") void commitTodoNote(node, {retry: true});
      node.blur();
    }
  });
}
function openFutureNote(options) {
  const view=futureTodoView(),id=options.id || options.target?.dataset.id;
  const item=view.items.find(row=>row.id===id&&!row.deleted_at&&!row.deleted);
  if(!item||view.pending||view.uncertain[id])return;
  view.noteEdit={id:item.id,text:item.note || "",base:item.note || ""};
  view.noteError="";
  paintUnscheduledTodos();
  placeNoteCaret(document.querySelector(`#todo-future [data-todo-note-input][data-id="${CSS.escape(item.id)}"]`));
}
function openTodoNote(options) {
  watchTodoNotes();
  if(options.target?.dataset.future==="1")return openFutureNote(options);
  const context=todoActionContext({...options,date:options.date || options.target?.dataset.date,owner:options.owner || options.target?.dataset.owner});
  if (!context || context.item.deleted_at || todoBusy(context.day, context.item.id)) return;
  const {item, day} = context;
  const draft = dailyTodoDraft(day, item.id) || {id: item.id, text: item.note || "", base: item.note || ""};
  day.noteDrafts.set(item.id, draft);
  day.noteEdit = draft;
  paintTodos();
  placeNoteCaret(document.querySelector(`[data-todo-note-input][data-id="${CSS.escape(item.id)}"]`));
}
// A note save can race another write to the same to-do (ticking it done a moment earlier, another
// device, an AI writing through the connector). The server then answers 409 because our copy's version
// is old. Instead of telling the person to refresh (which throws away what they typed), re-read the
// to-do and save again with the fresh version. Only when the note itself was changed elsewhere do we
// stop and ask, keeping the typed text in the box.
const NOTE_RETRY_DELAYS = [0, 500, 1500];
const noteConflict = error => error?.status === 409;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
// Ticking a to-do is queued offline and sent a moment later, while a note is saved straight away.
// Wait (briefly) until that queued write for this to-do has reached the server, so both use one
// version line; afterwards record the saved note in the offline copy as well.
async function settleQueuedTodo(type, id) {
  const offline = getOfflineRuntime();
  if (!offline?.todoSettled) return true;
  for (let i = 0; i < 24; i++) {
    try { if (await offline.todoSettled(type, id)) return true; } catch { return false; }
    if (i === 0) void offline.sync?.().catch?.(() => {});
    await pause(250);
  }
  return false;
}
async function rememberSavedNote(type, row) {
  const offline = getOfflineRuntime();
  if (!offline?.acceptTodoNote || !row) return;
  try { await offline.acceptTodoNote(type, row, offline.captureRateLimitContext?.()); } catch { /* the server copy is already saved */ }
}
async function saveNoteFresh({ id, text, base, version, latest, type = "todo", active = () => true }) {
  const settled = await settleQueuedTodo(type, id);
  if (!active()) throw new DOMException("请求已取消", "AbortError");
  if (!settled && type === "todo") throw new Error("这项待办上一步还在同步，请等几秒再点一次。");
  const fresh = type === "todo" ? await latest() : await latest().catch(() => null);
  if (type === "todo" && (!fresh || fresh.deleted_at || !Number.isSafeInteger(fresh.version))) {
    throw Object.assign(new Error("这项待办暂不可用"), {status: 404});
  }
  if (!active()) throw new DOMException("请求已取消", "AbortError");
  if (fresh && Number.isSafeInteger(fresh.version)) {
    if ((fresh.note || "") === text) {
      if (type === "todo") await rememberSavedNote(type, fresh);
      return fresh;
    }
    if ((fresh.note || "") !== base) return { changedElsewhere: true, fresh };
    version = fresh.version;
  }
  const saved = await sendNote({ id, text, base, version, latest, active });
  if (active() && saved && !saved.changedElsewhere) await rememberSavedNote(type, saved);
  return saved;
}
async function sendNote({ id, text, base, version, latest, active }) {
  let lastError = null;
  for (const delay of [null, ...NOTE_RETRY_DELAYS]) {
    if (delay !== null) {
      await pause(delay);
      const fresh = await latest().catch(() => null);
      if (!fresh) throw lastError;
      if ((fresh.note || "") === text) return fresh;
      if ((fresh.note || "") !== base) return { changedElsewhere: true, fresh };
      version = fresh.version;
    }
    if (!active()) throw new DOMException("请求已取消", "AbortError");
    try {
      return await api(`/todos/${encodeURIComponent(id)}/note`, { method: "PATCH", body: { note: text, version } });
    } catch (error) {
      if (!noteConflict(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
const elsewhereMessage = note => note ? `这条备注刚在别处改成了「${note}」。你写的还在框里，点空白会用你的版本保存。` :
  "这条备注刚在别处被清空了。你写的还在框里，点空白会用你的版本保存。";
const noteFailure = error => error.status === 404 ? "这项待办可能仍在同步，请稍后重试；备注内容已保留。" :
  noteConflict(error) ? "这项待办正在别处更新，备注还没存上，内容已保留。稍后点空白再存一次。" : error.message || "保存失败，请重试";
async function commitFutureNote(input) {
  if(futureRepainting())return;
  const view=futureTodoView(),item=view.items.find(row=>row.id===input.dataset.id);
  if(!item||view.noteEdit?.id!==item.id||view.noteEdit.committing)return;
  const text=readNote(input);
  if(text===(item.note || "")){view.noteEdit=null;view.noteError="";paintUnscheduledTodos();return;}
  view.noteEdit.committing=true; view.noteEdit.text=text;
  try {
    const saved=await saveNoteFresh({id:item.id,text,base:view.noteEdit.base ?? (item.note || ""),version:item.version,
      type:'unscheduled_todo',latest:async()=>(await api('/unscheduled-todos'))?.items?.find(row=>row.id===item.id)});
    if(saved.changedElsewhere){
      Object.assign(item,saved.fresh); if(!saved.fresh.note)delete item.note;
      if(view.noteEdit?.id===item.id){view.noteEdit.committing=false;view.noteEdit.base=saved.fresh.note || "";}
      view.noteError=elsewhereMessage(saved.fresh.note);
    } else {
      Object.assign(item,saved);
      if(!saved.note)delete item.note;
      if(view.noteEdit?.id===item.id)view.noteEdit=null;
      view.noteError="";
    }
  } catch(error) {
    if(isRequestAbort(error))return;
    if(view.noteEdit?.id===item.id){
      view.noteEdit.committing=false;
      view.noteError=noteFailure(error);
    }
  }
  paintUnscheduledTodos();
  if(view.noteEdit?.id===item.id)document.querySelector(`#todo-future [data-todo-note-input][data-id="${CSS.escape(item.id)}"]`)?.focus();
}
function finishDailyTodoNote(day, draft) {
  if (day.noteEdit === draft) day.noteEdit = null;
  day.noteDrafts.delete(draft.id);
}
async function storeDailyTodoNote(day, item, owner, draft, text) {
  const active = () => todoSessionActive(owner);
  try {
    const saved = await saveNoteFresh({
      id: item.id, text, base: draft.base, version: item.version, active,
      latest: async () => {
        const data = await api(`/todos?date=${encodeURIComponent(day.date)}`, {requireNetwork: true});
        return data?.items?.find(row => row.id === item.id);
      },
    });
    if (!active()) return false;
    mergeTodo(day, saved.changedElsewhere ? saved.fresh : saved);
    day.revision++;
    if (saved.changedElsewhere) {
      const note = saved.fresh.note;
      draft.error = note ? `另一设备已保存「${note}」。你的草稿仍在，请先核对两个版本。` :
        "另一设备已清空备注。你的草稿仍在，请先核对。";
      return false;
    }
    draft.base = text;
    draft.check = false;
    persistDailyTodoDraft(day, draft);
    if (draft.text !== text) return false;
    finishDailyTodoNote(day, draft);
    return true;
  } catch (error) {
    if (active()) draft.error = `备注未保存，草稿已保留。按回车可重试。${error?.message ? " " + error.message : ""}`;
    return false;
  } finally {
    draft.save = null;
    if (active()) paintTodos();
  }
}
function saveDailyTodoNote(day, item, owner) {
  const draft = dailyTodoDraft(day, item.id);
  if (!draft) return true;
  if (draft.save) return draft.save;
  if (!draft.check && draft.text === draft.base) {
    finishDailyTodoNote(day, draft);
    return true;
  }
  draft.error = "";
  draft.save = storeDailyTodoNote(day, item, owner, draft, draft.text);
  return draft.save;
}
async function commitTodoNote(input, {retry = false} = {}) {
  if (input?.dataset?.future === "1") return commitFutureNote(input);
  if (todoRepainting()) return;
  const context = todoActionContext({id: input.dataset.id, date: input.dataset.date});
  if (!context || context.day.noteEdit?.id !== context.item.id) return;
  const {day, item, owner} = context;
  rememberNote(input);
  if (day.noteEdit.error && !retry) return;
  if (await saveDailyTodoNote(day, item, owner) && todoSessionActive(owner)) paintTodos();
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
// 修改文字: the words change in place (PATCH /todos/:id/text), so the id, done state, note and date stay.
// Like the note, it first waits for any queued tick of this to-do, then saves on the freshest version.
function textTarget({ id, date, owner, future }) {
  if (future === "1") {
    const view = futureTodoView(), item = view.items.find(row => row.id === id && !row.deleted_at && !row.deleted);
    return item && !view.pending && !view.uncertain[id] ? { item, view } : null;
  }
  const context = todoActionContext({ id, date, owner: owner || todoOwner() });
  return context && !context.item.deleted_at && !todoBusy(context.day, id) ? context : null;
}
function openTodoText(options) {
  const target = textTarget(options);
  if (!target) return;
  const { item } = target, future = options.future === "1" ? "1" : "";
  openModal("修改文字", `<form id="todo-text-form" data-id="${e(item.id)}" data-date="${e(options.date || "")}" data-owner="${e(options.owner || todoOwner())}"
data-future="${future}" data-base="${e(item.text)}">
<label for="todo-text-input">待办内容</label>
<input class="input" id="todo-text-input" name="text" maxlength="500" required value="${e(item.text)}" autocomplete="off">
<p class="muted">只改文字，勾选状态、备注和日期都不变。</p>
<p class="form-message" role="alert"></p>
<div class="form-actions"><button class="btn primary" type="submit">保存</button></div></form>`);
  const input = document.getElementById("todo-text-input");
  input?.focus(); input?.select?.();
}
async function sendText({ id, text, base, type, latest, active }) {
  const settled = await settleQueuedTodo(type, id);
  if (!active()) throw new DOMException("请求已取消", "AbortError");
  if (!settled && type === "todo") throw new Error("这项待办上一步还在同步，请等几秒再保存。");
  let lastError = null;
  for (const delay of NOTE_RETRY_DELAYS) {
    if (delay) await pause(delay);
    const fresh = await latest().catch(() => null);
    if (!fresh || fresh.deleted_at || !Number.isSafeInteger(fresh.version)) throw lastError || Object.assign(new Error("这项待办暂不可用"), { status: 404 });
    if (!active()) throw new DOMException("请求已取消", "AbortError");
    if (fresh.text === text) return fresh;
    if (fresh.text !== base) return { changedElsewhere: true, fresh };
    try {
      return await api(`/todos/${encodeURIComponent(id)}/text`, { method: "PATCH", body: { text, version: fresh.version } });
    } catch (error) {
      if (!noteConflict(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
async function submitTodoText({ form, data }) {
  const options = { ...form.dataset }, target = textTarget(options);
  const message = form.querySelector(".form-message"), button = form.querySelector("button[type=submit]");
  const text = String(data.text ?? "").replace(/\r?\n/g, " ").trim();
  if (!target) { message.textContent = "这项待办暂时不能修改，请稍后再试。"; return; }
  if (!text || text.length > 500) { message.textContent = "待办内容需要 1 至 500 个字"; return; }
  if (button.disabled) return;
  const { item } = target, future = options.future === "1", base = form.dataset.base;
  if (text === item.text) { closeModal(); return; }
  const owner = target.owner, active = () => future || todoSessionActive(owner);
  button.disabled = true; message.textContent = "";
  try {
    const saved = await sendText({ id: item.id, text, base, type: future ? "unscheduled_todo" : "todo", active,
      latest: future ? async () => (await api("/unscheduled-todos"))?.items?.find(row => row.id === item.id)
        : async () => (await api(`/todos?date=${encodeURIComponent(target.day.date)}`, { requireNetwork: true }))?.items?.find(row => row.id === item.id) });
    if (!active()) return;
    const row = saved.changedElsewhere ? saved.fresh : saved;
    if (future) { Object.assign(item, row); if (!row.note) delete item.note; paintUnscheduledTodos(); }
    else { mergeTodo(target.day, row); target.day.revision++; paintTodos(); }
    if (saved.changedElsewhere) {
      form.dataset.base = row.text;
      message.textContent = `这项待办刚在别处改成了「${row.text}」。你写的还在框里，再点保存会用你的版本。`;
      return;
    }
    await rememberSavedNote(future ? "unscheduled_todo" : "todo", row);
    closeModal();
  } catch (error) {
    if (isRequestAbort(error)) return;
    message.textContent = error.status === 404 ? "这项待办可能仍在同步，请稍后重试；你写的内容已保留。" :
      noteConflict(error) ? "这项待办正在别处更新，还没存上，内容已保留。稍后再点保存。" : error.message || "保存失败，请重试";
  } finally { button.disabled = false; }
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
export { changeTodoCount, openTodoCount, openTodoText, submitTodoText, submitTodoCount, canOpenTodoMenu, changeTodoTemplate, deleteTodo, openTodoMenu, openTodoNote, submitTodoNote,
  renderTodoUndo, restoreTodo, saveDailyTodoNote, todoBusy };
