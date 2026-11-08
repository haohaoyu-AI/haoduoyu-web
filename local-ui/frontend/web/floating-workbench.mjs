import {bjtDate} from './core/format.mjs';
import {state} from './core/state.mjs';
import {todoDay, todoOwner, todoSessionActive} from './core/todos-state.mjs';
import {todoBusy} from './pages/todo-actions.mjs';
import {floatingTodoSupported, loadFloatingToday, observeTodoChanges, toggleTodo} from './pages/todos.mjs';
import {checkFloatingNote, editFloatingNote, floatingNotesSnapshot, hasFloatingNoteDraft, labelFloatingNote,
  loadFloatingNotes, markFloatingNoteComposing, newFloatingNote, observeFloatingNotes, selectFloatingNote,
  sendFloatingNote} from './daily-notes-controller.mjs';
import {onOfflineRuntime} from './offline/runtime.mjs';
import {offlineStatusLabel} from './offline/ui.mjs';
import {toast} from './ui/toast.mjs';

let activeWindow = null, opening = false;
function node(doc, tag, text = '', className = '') {
  const result = doc.createElement(tag); result.textContent = text;
  if (className) result.className = className;
  return result;
}
function makeView(pip) {
  const doc = pip.document;
  doc.title = '好多鱼桌面便签';
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) doc.head.append(link.cloneNode());
  doc.body.className = 'floating-workbench';
  const main = node(doc, 'main', '', 'floating-main');
  const head = node(doc, 'header', '', 'floating-head');
  head.append(node(doc, 'time', '', 'floating-date'));
  const close = node(doc, 'button', '', 'floating-close'); close.type = 'button';
  close.setAttribute('aria-label', '关闭便签'); head.append(close); close.addEventListener('click', () => pip.close());
  const tabs = node(doc, 'nav', '', 'floating-tabs'); tabs.setAttribute('aria-label', '便签内容');
  for (const [id, text] of [['todos','今日待办'],['notes','今日碎碎念']]) {
    const button = node(doc, 'button', text); button.type = 'button'; button.dataset.tab = id; tabs.append(button);
  }
  const offline = node(doc, 'p', '', 'floating-offline'); offline.setAttribute('role', 'status');
  const todo = node(doc, 'section', '', 'floating-panel'); todo.dataset.panel = 'todos';
  todo.append(node(doc, 'h2', '⌄  今日待办', 'floating-group-title'));
  const todoMessage = node(doc, 'p', '', 'floating-message'); todoMessage.setAttribute('role', 'alert');
  const todoList = node(doc, 'ul', '', 'floating-list'); todo.append(todoMessage, todoList);
  const notes = node(doc, 'section', '', 'floating-panel'); notes.dataset.panel = 'notes'; notes.hidden = true;
  notes.append(node(doc, 'h2', '⌄  今日碎碎念', 'floating-group-title'));
  const noteList = node(doc, 'ul', '', 'floating-note-list');
  const newNote = node(doc, 'button', '写一条'); newNote.type = 'button';
  const notesInput = node(doc, 'textarea'); notesInput.placeholder = '写下一点想说的话…';
  notesInput.setAttribute('aria-label', '碎碎念内容'); notesInput.rows = 5;
  const labels = node(doc, 'fieldset', '', 'floating-labels'); labels.append(node(doc, 'legend', '标签（可多选）'));
  const options = node(doc, 'div'); labels.append(options);
  const noteMessage = node(doc, 'p', '', 'floating-message'); noteMessage.setAttribute('role', 'status');
  const noteActions = node(doc, 'div', '', 'floating-actions');
  const send = node(doc, 'button', '发送'); send.type = 'button';
  const check = node(doc, 'button', '核对保存结果'); check.type = 'button'; check.hidden = true;
  const retry = node(doc, 'button', '重试原保存'); retry.type = 'button'; retry.hidden = true;
  noteActions.append(send, check, retry); notes.append(noteList, newNote, notesInput, labels, noteMessage, noteActions);
  main.append(head, tabs, offline, todo, notes); doc.body.replaceChildren(main);
  return {doc, head, tabs, offline, todo, todoMessage, todoList,
    notes, noteList, newNote, notesInput, labels, options, noteMessage, send, check, retry};
}
function paintTodo(view) {
  const day = todoDay(bjtDate());
  view.head.querySelector('time').textContent = day.date;
  view.todoMessage.textContent = day.error || (!day.loaded && day.loading ? '正在读取待办…' : '');
  const fragment = view.doc.createDocumentFragment();
  for (const item of day.items) {
    const removal = day.removals.get(item.id);
    if (item.deleted_at || removal && removal.phase !== 'restoring') continue;
    const li = node(view.doc, 'li'), label = node(view.doc, 'label'), check = node(view.doc, 'input');
    check.type = 'checkbox'; check.dataset.todoId = item.id; check.dataset.date = day.date;
    check.checked = day.updates.has(item.id) ? day.updates.get(item.id) : Boolean(item.completed);
    check.disabled = !day.loaded || todoBusy(day, item.id); label.append(check, node(view.doc, 'span', item.text)); li.append(label);
    if (check.checked) li.classList.add('is-complete'); fragment.append(li);
  }
  if (!day.items.some(item => !item.deleted_at) && day.loaded) fragment.append(node(view.doc, 'li', '今天还没有待办。', 'floating-empty'));
  view.todoList.replaceChildren(fragment);
}
function paintNotes(view) {
  const snap = floatingNotesSnapshot(), item = snap?.item, page = snap?.page;
  const previousDate = Boolean(item && item.date !== snap?.date);
  const text = item?.draft || '';
  const fragment = view.doc.createDocumentFragment();
  for (const record of snap?.entries || []) {
    const row = node(view.doc, 'li');
    const content = record.legacy ? node(view.doc, 'div') : node(view.doc, 'button');
    if (!record.legacy) { content.type = 'button'; content.dataset.noteId = record.id; content.dataset.category = record.category; }
    const time = record.createdAt || record.localCreatedAt || record.updatedAt;
    const caption = time && Number.isFinite(Date.parse(time)) ? new Intl.DateTimeFormat('zh-CN',
      {timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(time)) : '';
    content.append(node(view.doc, 'small', [caption, record.legacy ? '原有记录 · 只读' : record.dirty ? '草稿' : ''].filter(Boolean).join(' · ')),
      node(view.doc, 'span', record.dirty ? record.draft : record.draft ?? record.serverText ?? ''));
    row.append(content); fragment.append(row);
  }
  view.noteList.replaceChildren(fragment);
  view.newNote.disabled = !page?.loaded || !page.canEdit;
  if ((view.doc.activeElement !== view.notesInput || !view.doc.hasFocus()) && view.notesInput.value !== text)
    view.notesInput.value = text;
  view.notesInput.disabled = !page?.loaded || !page.canEdit || item?.canEdit === false;
  view.notesInput.readOnly = Boolean(view.frozen);
  view.labels.disabled = Boolean(view.frozen) || !snap?.labelsVerified || !page?.canEdit || Boolean(item?.pending) || item?.labelComplete === false;
  const current = [...view.options.querySelectorAll('input')].map(input => input.value);
  const available = [...new Set([...(snap?.labels || []), ...(item?.labels || [])])];
  if (JSON.stringify(current) !== JSON.stringify(available)) {
    const fragment = view.doc.createDocumentFragment();
    for (const name of available) {
      const label = node(view.doc, 'label'), input = node(view.doc, 'input'); input.type = 'checkbox'; input.value = name;
      label.append(input, node(view.doc, 'span', name)); fragment.append(label);
    }
    view.options.replaceChildren(fragment);
  }
  for (const input of view.options.querySelectorAll('input')) input.checked = Boolean(item?.labels?.includes(input.value));
  const blocked = item?.pending || item?.composing || ['unknown','conflict','oversize'].includes(item?.phase);
  view.send.disabled = Boolean(view.frozen) || !item?.dirty || Boolean(blocked) || !item.canEdit || previousDate;
  view.check.hidden = item?.phase !== 'unknown'; view.check.disabled = Boolean(view.frozen || item?.pending?.checking);
  view.retry.hidden = item?.phase !== 'unknown' || !item?.pending?.retryReady; view.retry.disabled = Boolean(view.frozen);
  view.newNote.disabled ||= Boolean(view.frozen);
  view.noteMessage.textContent = item?.error || snap?.error || page?.error || snap?.draftError || snap?.labelError ||
    (previousDate ? `此草稿属于 ${item.date}，请在原日期处理；点击“写一条”可继续今日记录。` :
      !page?.loaded ? '正在读取碎碎念…' : !page.canEdit ? '当前身份为只读。' : item?.phase === 'queued' ? '已存本机，待同步。' : '');
}
function bindOfflineStatus(view, active) {
  let unsubscribe = () => {};
  const stop = onOfflineRuntime(runtime => {
    unsubscribe(); unsubscribe = runtime.subscribe(value => {
      if (active()) view.offline.textContent = [offlineStatusLabel(value),
        value.partial ? '仅显示本机已保存事项，完整列表需联网读取。' : ''].filter(Boolean).join(' ');
    });
  });
  return () => { stop(); unsubscribe(); };
}
function mountFloating(pip) {
  const view = makeView(pip), owner = todoOwner();
  let alive = true, tab = 'todos', notesLoaded = false, composing = false, date = bjtDate();
  const active = () => alive && !pip.closed && todoSessionActive(owner);
  const paint = () => { if (active()) { paintTodo(view); if (tab === 'notes') paintNotes(view); } };
  const stopTodos = observeTodoChanges(paint), stopNotes = observeFloatingNotes(paint);
  const stopRuntime = bindOfflineStatus(view, active);
  const beforeUnload = event => {
    if (active() && hasFloatingNoteDraft()) {
      event.preventDefault(); event.returnValue = '';
    }
  };
  const beforeRefresh = event => {
    if (!active() || typeof event.detail?.waitUntil !== 'function') return;
    if (composing) {
      event.detail.waitUntil(Promise.reject(new Error('输入尚未完成，请结束输入后再刷新。'))); return;
    }
    const current = floatingNotesSnapshot()?.item;
    if (tab === 'notes' && view.notesInput.value !== (current?.draft || '')) editFloatingNote(view.notesInput.value);
    view.frozen = true; paint();
    event.detail.onFailure?.(() => { view.frozen = false; if (active()) paint(); });
  };
  const reset = () => { if (alive) pip.close(); };
  const focus = () => { if (active()) { void loadFloatingToday(); if (tab === 'notes') void loadFloatingNotes(); } };
  const timer = setInterval(() => {
    if (!active()) { if (alive) pip.close(); return; }
    if (date !== bjtDate()) {
      if (hasFloatingNoteDraft()) toast('前一天仍有未发送内容，请确认保存后再关闭主页面。');
      date = bjtDate(); notesLoaded = false; void loadFloatingToday();
      if (tab === 'notes') { notesLoaded = true; void loadFloatingNotes(); }
    }
  }, 30000);
  function cleanup() {
    if (!alive) return;
    if (composing && todoSessionActive(owner)) { editFloatingNote(view.notesInput.value, false); composing = false; }
    markFloatingNoteComposing(false);
    const draft = hasFloatingNoteDraft();
    alive = false; clearInterval(timer); stopTodos(); stopNotes(); stopRuntime();
    window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('haoduoyu:before-refresh', beforeRefresh);
    window.removeEventListener('haoduoyu-todos-reset', reset); pip.removeEventListener('focus', focus);
    if (activeWindow === pip) activeWindow = null;
    if (draft && todoSessionActive(owner)) toast('未发送内容仍在当前页面，请确认保存后再关闭主页面。');
  }
  view.tabs.addEventListener('click', event => {
    const button = event.target.closest('button[data-tab]'); if (!button) return;
    tab = button.dataset.tab; view.todo.hidden = tab !== 'todos'; view.notes.hidden = tab !== 'notes';
    for (const control of view.tabs.querySelectorAll('button')) control.setAttribute('aria-pressed', String(control === button));
    if (tab === 'notes' && !notesLoaded) { notesLoaded = true; void loadFloatingNotes(); }
    paint();
  });
  view.todoList.addEventListener('change', event => {
    const input = event.target; if (input.dataset.todoId) void toggleTodo(input, {floating:true});
  });
  view.newNote.addEventListener('click', () => { newFloatingNote(); paint(); view.notesInput.focus(); });
  view.noteList.addEventListener('click', event => {
    const button = event.target.closest('[data-note-id]');
    if (button) selectFloatingNote(button.dataset.noteId, button.dataset.category);
  });
  view.notesInput.addEventListener('compositionstart', () => { composing = true; markFloatingNoteComposing(true); });
  view.notesInput.addEventListener('input', event => {
    editFloatingNote(view.notesInput.value, composing || event.isComposing);
    if (composing || event.isComposing) markFloatingNoteComposing(true);
  });
  view.notesInput.addEventListener('compositionend', () => {
    composing = false; editFloatingNote(view.notesInput.value); markFloatingNoteComposing(false);
  });
  view.options.addEventListener('change', () => {
    labelFloatingNote([...view.options.querySelectorAll('input:checked')].map(input => input.value)); paint();
  });
  view.send.addEventListener('click', () => { void sendFloatingNote(); });
  view.check.addEventListener('click', () => { void checkFloatingNote(); });
  view.retry.addEventListener('click', () => { void checkFloatingNote(true); });
  window.addEventListener('beforeunload', beforeUnload); window.addEventListener('haoduoyu:before-refresh', beforeRefresh);
  window.addEventListener('haoduoyu-todos-reset', reset); pip.addEventListener('focus', focus);
  pip.addEventListener('pagehide', cleanup, {once:true});
  view.tabs.querySelector('[data-tab="todos"]').setAttribute('aria-pressed', 'true');
  paint(); void loadFloatingToday();
}
export async function openFloatingWorkbench() {
  if (!floatingTodoSupported()) { toast('当前浏览器不支持置顶便签。', true); return; }
  if (activeWindow && !activeWindow.closed) { activeWindow.focus(); return; }
  if (opening || !state.me) return;
  // requestWindow must be called directly within the user gesture, before awaiting anything.
  opening = true;
  try {
    const request = window.documentPictureInPicture.requestWindow({width:390,height:520});
    todoDay(bjtDate()); const owner = todoOwner();
    const pip = await request;
    if (!todoSessionActive(owner) || pip.closed) { if (!pip.closed) pip.close(); return; }
    activeWindow = pip;
    try { mountFloating(pip); } catch (error) { activeWindow = null; pip.close(); throw error; }
  } catch (error) { toast('无法打开置顶便签：' + (error?.message || '请稍后重试。'), true); }
  finally { opening = false; }
}
