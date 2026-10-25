import {api} from './core/api.mjs';
import {navigate} from './controller.mjs';
import {storage} from './core/storage.mjs';
import {runtime, state} from './core/state.mjs';
import {createMemosStore} from './core/memos-state.mjs';
import {paintMemos} from './pages/memos.mjs';
import {renderLogin} from './pages/login.mjs';
import {openMemoRecovery, resetMemoRecovery, selectMemoRecovery, restoreMemoRecovery} from './memos-recovery.mjs';
export {renderMemos} from './pages/memos.mjs';

let memoStore, memoIdentity = '', memoEvents = false, memoDialog = null, memoDraftScope, memoCreating = false, memoTool = '';
let memoEditorFocus = null, memoDeleting = '', memoDeleteWait = null;
export function requestMemoTool(tool) { memoTool = ['trash', 'recovery'].includes(tool) ? tool : ''; }
function draftStorageScope() {
  if (memoDraftScope) return memoDraftScope;
  const generated = globalThis.crypto.randomUUID();
  try {
    const key = 'haoduoyu.memos.tab.v1', saved = window.sessionStorage.getItem(key);
    const previous = /^[a-f0-9-]{36}$/i.test(saved || '') ? saved : '';
    window.sessionStorage.setItem(key, generated);
    memoDraftScope = {draftScope: generated, restoreDraftScope: previous, storagePersistent: true};
  } catch { memoDraftScope = {draftScope: generated, storagePersistent: false}; }
  return memoDraftScope;
}
const currentIdentity = () => String(runtime.sessionEpoch) + ':' + String(state.me?.id || '') + ':' + String(state.me?.csrfToken || '');
const settingsTrash = () => state.page === 'settings' && state.settingsTab === 'workspace';
const visible = () => (state.page === 'memos' || settingsTrash()) && memoIdentity === currentIdentity();
function ensureStore() {
  const identity = currentIdentity();
  if (memoStore && memoIdentity === identity) return memoStore;
  memoDeleteWait?.(true); memoDeleteWait = null; memoDeleting = ''; memoEditorFocus = null;
  memoStore?.dispose(); memoIdentity = identity; memoDialog = null; resetMemoRecovery();
  const active = () => {
    if (currentIdentity() !== identity) throw new DOMException('登录状态已经改变', 'AbortError');
  };
  const request = async (path, options) => { active(); const value = await api(path, options); active(); return value; };
  let local;
  try { local = window.localStorage; } catch { local = null; }
  memoStore = createMemosStore({request, storage: local, ...draftStorageScope(),
    ownerId: state.me?.publicBusiness ? '' : String(state.me?.id || ''),
    onChange: () => { if (identity === currentIdentity()) { memoDeleteWait?.(); paintMemosPage(); } }});
  return memoStore;
}
function paintDialog(root) {
  const find = query => root.querySelector(query), dialog = memoDialog;
  find('#memo-dialog').hidden = !dialog;
  if (!dialog) return;
  find('#memo-dialog-heading').textContent = dialog.heading;
  find('#memo-dialog-description').textContent = dialog.description || '';
  find('#memo-dialog-label').hidden = !dialog.input;
  find('#memo-dialog-title').hidden = !dialog.input;
  find('[data-memo-action="confirm"]').disabled = Boolean(dialog.saving);
  find('[data-memo-action="cancel"]').disabled = Boolean(dialog.saving);
}
export function paintMemosPage() {
  if (!visible() || !memoStore) return;
  const root = document.querySelector('#memos');
  if (!root) return;
  paintMemos(root, memoStore); paintDialog(root); setupMemoSplit(root);
  if (memoDeleting) root.querySelectorAll('[data-memo-action="delete-note"]')
    .forEach(button => { if (button.dataset.memoTarget === memoDeleting) button.disabled = true; });
  if (memoCreating) root.querySelectorAll('[data-memo-action="new-group"],[data-memo-action="new-note"]')
    .forEach(button => { button.disabled = true; });
}
function openDialog(kind, id = '') {
  const s = memoStore.state, group = s.groups.find(row => row.id === (id || s.groupId));
  const note = memoStore.drafts.get(id || s.noteId);
  const descriptions = {
    'new-group': {heading: '新建分组', input: true, value: ''},
    'new-note': {heading: '新建笔记', input: true, value: '新笔记'},
    'rename-group': {heading: '重命名分组', input: true, value: group?.title || ''},
    'delete-group': {heading: '删除整个分组？', input: false,
      description: '“' + (group?.title || '') + '”及其中 ' + (group?.active_note_count || 0) +
        ' 篇笔记将从公开页面隐藏。可在回收站恢复整个分组。'},
    'delete-note': {heading: '删除这篇笔记？', input: false,
      description: '“' + (note?.title || '') + '”将从公开页面隐藏。可在回收站恢复。'},
    'use-draft': {heading: '用草稿更新服务器版本？', input: false,
      description: '请先核对下方服务器内容。确认后，此草稿会保存为新版本。'},
    'use-server': {heading: '采用服务器内容？', input: false,
      description: '当前本机未保存的草稿将被替换，请先复制需要保留的文字。'}
  };
  memoDialog = {kind, id: id || (kind.includes('group') ? s.groupId : s.noteId), ...descriptions[kind],
    groupSnapshot: group ? {version: group.version, title: group.title, active_note_count: group.active_note_count} : null};
  paintMemosPage();
  const input = document.querySelector('#memo-dialog-title');
  input.value = memoDialog.value || '';
  if (memoDialog.input) { input.focus(); input.select(); }
  else document.querySelector('[data-memo-action="cancel"]')?.focus();
}
async function confirmDialog() {
  const dialog = memoDialog;
  if (!dialog || dialog.saving) return;
  const title = document.querySelector('#memo-dialog-title')?.value.trim() || '';
  if (dialog.input && !title) {
    dialog.description = '名称不能为空。'; paintMemosPage(); return;
  }
  dialog.saving = true; paintMemosPage();
  try {
    if (dialog.kind === 'new-group') await memoStore.createGroup(title);
    else if (dialog.kind === 'new-note') await memoStore.createNote(memoStore.state.groupId, title);
    else if (dialog.kind === 'rename-group') await memoStore.renameGroup(dialog.id, title);
    else if (dialog.kind === 'delete-group') await memoStore.removeGroup(dialog.id, dialog.groupSnapshot);
    else if (dialog.kind === 'delete-note') await memoStore.removeNote(dialog.id);
    else if (dialog.kind === 'use-draft') await memoStore.useDraft(dialog.id);
    else if (dialog.kind === 'use-server') await memoStore.useServer(dialog.id);
    if (memoDialog === dialog) memoDialog = null;
  } finally {
    dialog.saving = false; paintMemosPage();
  }
}
async function createMemo(action, target) {
  if (memoCreating || !memoStore.state.canEdit) return;
  const store = memoStore; memoCreating = true; paintMemosPage();
  try {
    if (action === 'new-group') await store.createGroup('未命名分组');
    else {
      let group = store.state.groups.find(row => row.id === store.state.groupId && !row.deleted_at) ||
        store.state.groups.find(row => !row.deleted_at);
      if (!group) {
        const id = await store.createGroup('笔记');
        group = store.state.groups.find(row => row.id === id && !row.deleted_at);
      }
      if (!group || store !== memoStore || !visible()) return;
      const pending = store.createNote(group.id, '未命名笔记');
      paintMemosPage();
      const field = document.querySelector('#memo-title');
      if (visible() && store === memoStore) { field?.focus(); field?.select(); }
      await pending;
    }
  } finally { memoCreating = false; paintMemosPage(); }
  if (action === 'new-group' && visible() && store === memoStore)
    document.querySelector('[data-memo-action="new-group"]')?.focus();
}
async function selectVisibleMemo(store) {
  const s = store.state, selected = store.drafts.get(s.noteId);
  const rows = s.notes.filter(note => Boolean(note.deleted_at || s.groups.find(group => group.id === note.group_id)?.deleted_at) === s.trash);
  if (rows.some(note => note.id === s.noteId)) return;
  s.noteId = rows[0]?.id || '';
  if (s.noteId) await store.selectNote(s.noteId, {open: false});
  else s.pane = 'notes';
}
async function removeMemo(id) {
  const store = memoStore, item = store.drafts.get(id);
  if (memoDeleting || !store.state.canEdit) return;
  memoDeleting = id; store.state.error = ''; paintMemosPage();
  try {
    if (item?.pending && item.phase === 'saving') await new Promise(resolve => {
      memoDeleteWait = force => { if (force || item.phase !== 'saving') resolve(); };
    });
    if (store !== memoStore || memoIdentity !== currentIdentity()) return;
    memoDeleteWait = null;
    if (item?.dirty && !item.pending) await store.saveNote(id);
    if (item?.dirty || item?.pending) {
      store.state.error = '笔记尚未确认保存，未删除。请先核对保留的草稿。'; return;
    }
    await store.removeNote(id); await selectVisibleMemo(store);
  } finally {
    if (store === memoStore) { memoDeleting = ''; memoDeleteWait = null; paintMemosPage(); }
  }
}
async function restoreMemo(id) {
  const store = memoStore, note = store.state.notes.find(row => row.id === id);
  if (!note) return;
  if (store.state.groups.find(row => row.id === note.group_id)?.deleted_at) await store.restore('groups', note.group_id);
  if (store.state.groups.find(row => row.id === note.group_id)?.deleted_at) return;
  if (note.deleted_at) await store.restore('notes', id);
  await selectVisibleMemo(store);
}
function toggleMemoFullscreen(expanded) {
  const root = document.querySelector('#memos'), dialog = root?.querySelector('#memo-fullscreen');
  if (!dialog) return;
  const editor = root.querySelector('.memo-editor'), field = root.contains(memoEditorFocus) ? memoEditorFocus : root.querySelector('#memo-body');
  const selection = field ? {start: field.selectionStart, end: field.selectionEnd, direction: field.selectionDirection, scroll: field.scrollTop} : null;
  if (expanded ?? !dialog.open) {
    dialog.append(editor); dialog.showModal();
  } else { dialog.close(); root.querySelector('.memo-layout').append(editor); }
  paintMemosPage();
  if (field && !field.hidden && !field.disabled) {
    field.focus({preventScroll: true}); field.setSelectionRange(selection.start, selection.end, selection.direction); field.scrollTop = selection.scroll;
  }
}
async function clickAction(action, target) {
  const store = ensureStore(), s = store.state;
  if (['new-group', 'new-note'].includes(action)) return createMemo(action, target);
  if (action === 'delete-note') return removeMemo(target?.dataset.memoTarget || s.noteId);
  if (action === 'restore-note') return restoreMemo(target?.dataset.memoTarget || s.noteId);
  if (action === 'fullscreen') return toggleMemoFullscreen();
  if (['rename-group', 'delete-group', 'use-draft', 'use-server'].includes(action)) {
    if (s.canEdit) openDialog(action, target?.dataset.memoTarget); return;
  }
  if (action === 'cancel') memoDialog = null;
  else if (action === 'confirm') await confirmDialog();
  else if (action === 'login') { renderLogin(); return; }
  else if (action === 'refresh') await store.load();
  else if (action === 'recovery') openMemoRecovery(document.querySelector('#memos'), store, store.state.draftOwner);
  else if (action === 'close-recovery') document.querySelector('#memo-recovery').hidden = true;
  else if (action === 'restore-draft') await restoreMemoRecovery(document.querySelector('#memos'), store);
  else if (action === 'save') await store.saveNote();
  else if (action === 'check') await store.checkNote(s.noteId);
  else if (action === 'retry') await store.retryPending(s.noteId);
  else if (action === 'operation-check') await store.checkOperation();
  else if (action === 'operation-retry') await store.retryOperation();
  else if (action === 'restore-group') await store.restore('groups', target?.dataset.memoTarget || s.groupId);
  else if (action === 'back-groups') s.pane = 'groups';
  else if (action === 'back-notes') s.pane = 'notes';
  else if (action === 'exit-trash') { navigate('settings', 'workspace'); return; }
  else if (action === 'trash' && s.canEdit) { navigate('memos', 'trash'); return; }
  paintMemosPage();
}
function run(action) {
  Promise.resolve().then(action).catch(error => {
    if (!visible() || error.name === 'AbortError' || error.staleSession) return;
    memoStore.state.error = error.message || '操作失败，未保存草稿仍保留。'; paintMemosPage();
  });
}
function editing(event, composing) {
  if (!visible() || !['memo-title', 'memo-body'].includes(event.target.id)) return;
  const root = document.querySelector('#memos');
  if (!root?.contains(event.target)) return;
  memoStore.edit(event.target.id === 'memo-title' ? 'title' : 'body', event.target.value,
    {composing: composing || event.target.dataset.composing === 'true'});
}
function registerEvents() {
  if (memoEvents) return;
  memoEvents = true; registerMemoSplitEvents();
  document.addEventListener('focusin', event => {
    if (visible() && ['memo-title', 'memo-body'].includes(event.target.id)) memoEditorFocus = event.target;
  });
  document.addEventListener('cancel', event => {
    if (visible() && event.target.id === 'memo-fullscreen') { event.preventDefault(); toggleMemoFullscreen(false); }
  }, true);
  document.addEventListener('input', event => editing(event, event.isComposing));
  document.addEventListener('compositionstart', event => {
    if (visible() && ['memo-title', 'memo-body'].includes(event.target.id)) event.target.dataset.composing = 'true';
  });
  document.addEventListener('compositionend', event => {
    if (['memo-title', 'memo-body'].includes(event.target.id)) event.target.dataset.composing = 'false';
    editing(event, false);
  });
  document.addEventListener('click', event => {
    if (!visible()) return;
    const target = event.target.closest('[data-memo-action],[data-memo-group],[data-memo-note],[data-memo-draft],[data-memo-recovery]');
    if (!target || !document.querySelector('#memos')?.contains(target)) return;
    event.preventDefault();
    run(async () => {
      if (target.dataset.memoAction) return clickAction(target.dataset.memoAction, target);
      if (target.dataset.memoRecovery !== undefined) {
        selectMemoRecovery(document.querySelector('#memos'), Number(target.dataset.memoRecovery)); return;
      }
      memoDialog = null;
      if (target.dataset.memoGroup) await memoStore.selectGroup(target.dataset.memoGroup);
      else await memoStore.selectNote(target.dataset.memoNote || target.dataset.memoDraft);
      paintMemosPage();
    });
  });
  document.addEventListener('keydown', event => {
    if (!visible() || !memoDialog || !document.querySelector('#memo-dialog')?.contains(event.target)) return;
    if (event.key === 'Escape' && !memoDialog.saving) { memoDialog = null; paintMemosPage(); }
    if (event.key === 'Enter' && event.target.id === 'memo-dialog-title') { event.preventDefault(); run(confirmDialog); }
  });
  window.addEventListener('beforeunload', event => {
    if (memoIdentity !== currentIdentity() || !memoStore?.state.canEdit) return;
    if (memoStore.state.operation?.pending || [...memoStore.drafts.values()].some(item => item.dirty || item.pending)) {
      event.preventDefault(); event.returnValue = '';
    }
  });
  window.addEventListener('online', () => { if (visible()) paintMemosPage(); });
  window.addEventListener('offline', () => { if (visible()) paintMemosPage(); });
}
export async function loadMemos() {
  registerEvents(); const store = ensureStore();
  const trash = settingsTrash() || state.memoView === 'trash';
  if (store.state.trash !== trash) { store.state.noteId = ''; store.state.groupId = ''; store.state.pane = 'notes'; }
  store.state.trash = trash;
  await store.load(); await selectVisibleMemo(store);
  const tool = memoTool; memoTool = '';
  if (!tool && !store.state.trash && store.state.noteId) store.state.pane = 'editor';
  if (tool && visible() && store.state.canEdit) {
    if (tool === 'trash') { store.state.trash = true; store.state.pane = 'groups'; store.state.groupId = ''; store.state.noteId = ''; }
    paintMemosPage();
    if (tool === 'recovery') openMemoRecovery(document.querySelector('#memos'), store, store.state.draftOwner);
  }
  paintMemosPage();
}

let memoSplitRoot = null, memoSplitObserver = null, memoSplitRatio, memoSplitDrag = null;
const memoSplitStorage = 'haoduoyu.memos.split-ratio.v1';
function applyMemoSplit(width = null, persist = false) {
  const root = memoSplitRoot, layout = root?.querySelector('.memo-layout'), handle = root?.querySelector('#memo-resizer');
  if (!root?.isConnected || !layout || !handle) return;
  const mobile = window.innerWidth <= 760; handle.hidden = mobile;
  if (mobile) { root.style.removeProperty('--memo-list-w'); return; }
  const area = layout.clientWidth - 10, min = area < 400 ? 120 : 160;
  const max = Math.max(min, Math.floor(Math.min(480, area - 200, area * .65)));
  if (memoSplitRatio === undefined) {
    const saved = Number(storage.get(memoSplitStorage));
    memoSplitRatio = Number.isFinite(saved) && saved >= .1 && saved <= .8 ? saved : .3;
  }
  const value = Math.round(Math.max(min, Math.min(max, width ?? area * memoSplitRatio)));
  root.style.setProperty('--memo-list-w', value + 'px');
  for (const [name, number] of Object.entries({min, max, now:value})) handle.setAttribute('aria-value' + name, String(number));
  handle.setAttribute('aria-valuetext', '笔记列表宽度 ' + value + ' 像素');
  if (width !== null) memoSplitRatio = value / area;
  if (persist) storage.set(memoSplitStorage, String(memoSplitRatio));
}
function setupMemoSplit(root) {
  if (root === memoSplitRoot) return;
  memoSplitObserver?.disconnect(); memoSplitRoot = root;
  if (typeof ResizeObserver === 'function') {
    memoSplitObserver = new ResizeObserver(() => applyMemoSplit());
    memoSplitObserver.observe(root.querySelector('.memo-layout'));
  }
  applyMemoSplit();
}
function finishMemoSplit(cancel = false) {
  const drag = memoSplitDrag; if (!drag) return;
  memoSplitDrag = null;
  if (cancel) { memoSplitRatio = drag.ratio; applyMemoSplit(); }
  else applyMemoSplit(Number(drag.handle.getAttribute('aria-valuenow')), true);
  drag.root.classList.remove('memo-resizing');
  if (drag.handle.hasPointerCapture?.(drag.pointer)) drag.handle.releasePointerCapture(drag.pointer);
}
function startMemoSplit(event) {
  const handle = event.target.closest?.('#memo-resizer');
  if (!handle || handle.hidden || event.button !== 0 || event.isPrimary === false) return;
  event.preventDefault(); finishMemoSplit();
  memoSplitDrag = {root:memoSplitRoot,handle,pointer:event.pointerId,x:event.clientX,
    width:Number(handle.getAttribute('aria-valuenow')),ratio:memoSplitRatio};
  memoSplitRoot.classList.add('memo-resizing'); handle.focus({preventScroll:true}); handle.setPointerCapture(event.pointerId);
}
function keyMemoSplit(event) {
  if (memoSplitDrag && event.key === 'Escape') {
    event.preventDefault(); event.stopPropagation(); finishMemoSplit(true); return;
  }
  const handle = event.target.closest?.('#memo-resizer');
  if (!handle || handle.hidden || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  const value = event.key === 'Home' ? Number(handle.getAttribute('aria-valuemin')) : event.key === 'End' ?
    Number(handle.getAttribute('aria-valuemax')) : Number(handle.getAttribute('aria-valuenow')) +
    (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 32 : 16);
  applyMemoSplit(value, true);
}
function registerMemoSplitEvents() {
  document.addEventListener('pointerdown', startMemoSplit);
  document.addEventListener('pointermove', event => {
    if (event.pointerId === memoSplitDrag?.pointer) { event.preventDefault(); applyMemoSplit(memoSplitDrag.width + event.clientX - memoSplitDrag.x); }
  });
  document.addEventListener('pointerup', event => { if (event.pointerId === memoSplitDrag?.pointer) finishMemoSplit(); });
  document.addEventListener('pointercancel', event => { if (event.pointerId === memoSplitDrag?.pointer) finishMemoSplit(true); });
  document.addEventListener('lostpointercapture', event => { if (event.pointerId === memoSplitDrag?.pointer) finishMemoSplit(); });
  document.addEventListener('keydown', keyMemoSplit, true);
  window.addEventListener('resize', () => { finishMemoSplit(true); applyMemoSplit(); });
}
