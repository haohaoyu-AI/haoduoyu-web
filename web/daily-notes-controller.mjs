import {api} from './core/api.mjs';
import {state, runtime} from './core/state.mjs';
import {updateRoute} from './core/router.mjs';
import {renderShell} from './controller.mjs';
import {createDailyNotesStore, dailyNotesRouteDate, dailyNotesToday,
  setDailyNotesRouteDate, validDailyNotesDate, dailyNotesRouteCategory, setDailyNotesRouteCategory} from './core/daily-notes-state.mjs';
import {createNoteEntriesStore} from './core/note-entries-state.mjs';
import {createNotesEditorView} from './core/notes-editor-view.mjs';
import {paintNoteEntries} from './pages/daily-notes.mjs';
import {renderLogin} from './pages/login.mjs';

let notesStore, entryStore, notesIdentity = '', notesEventsRegistered = false,
  notesConfirmDate = '', notesConfirmEntry = '', notesActiveCategory = '';
const notesStores = new Map(), entryStores = new Map(), editorViews = createNotesEditorView();
const notesIdentityNow = () => String(runtime.sessionEpoch) + ':' + String(state.me?.id || '') + ':' + String(state.me?.csrfToken || '');
const notesVisible = () => state.page === 'notes' && notesIdentity === notesIdentityNow();
function ensureDailyNotesStore() {
  const next = notesIdentityNow(), category = dailyNotesRouteCategory();
  if (notesIdentity !== next) {
    for (const store of [...notesStores.values(), ...entryStores.values()]) store.dispose();
    notesStores.clear(); entryStores.clear(); editorViews.clear(); notesIdentity = next;
    notesConfirmDate = ''; notesConfirmEntry = '';
  }
  if (notesActiveCategory !== category) { notesActiveCategory = category; notesConfirmDate = ''; notesConfirmEntry = ''; }
  if (!notesStores.has(category)) {
    const expected = next;
    const active = () => {
      if (notesIdentityNow() !== expected) {
        legacy.dispose(); entries.dispose(); throw new DOMException('请求已取消', 'AbortError');
      }
    };
    const request = async (path, options) => { active(); const value = await api(path, options); active(); return value; };
    const suffix = separator => category === 'work' ? separator + 'category=work' : '';
    const changed = () => { if (expected === notesIdentityNow() && category === dailyNotesRouteCategory()) paintDailyNotesPage(); };
    // Compatibility records retain their original API, CAS rules and unknown-write flow.
    const legacy = createDailyNotesStore({delay: 400,
      load: date => request('/daily-notes?date=' + encodeURIComponent(date) + suffix('&')),
      put: (date, body) => request('/daily-notes/' + encodeURIComponent(date) + suffix('?'), {method: 'PUT', body}),
      restore: (date, body) => request('/daily-notes/' + encodeURIComponent(date) + '/restore' + suffix('?'), {method: 'POST', body}),
      remove: (date, body) => request('/daily-notes/' + encodeURIComponent(date) + suffix('?'), {method: 'DELETE', body}),
      onChange: changed, onSaved: changed
    });
    const entries = createNoteEntriesStore({category,
      load: date => request('/note-entries?category=' + category + '&date=' + encodeURIComponent(date)),
      loadEntry: id => request('/note-entries/' + encodeURIComponent(id)),
      loadOperation: id => request('/note-entries/operations/' + encodeURIComponent(id)),
      put: (id, body) => request('/note-entries/' + encodeURIComponent(id), {method: 'PUT', body}),
      remove: (id, body) => request('/note-entries/' + encodeURIComponent(id), {method: 'DELETE', body}),
      restore: (id, body) => request('/note-entries/' + encodeURIComponent(id) + '/restore', {method: 'POST', body}),
      onChange: changed, onSaved: changed
    });
    notesStores.set(category, legacy); entryStores.set(category, entries);
  }
  notesStore = notesStores.get(category); entryStore = entryStores.get(category);
  return notesStore;
}
function retainedDrafts() {
  const result = [];
  for (const [category, store] of notesStores) for (const item of store.pages.values()) {
    if (item.dirty || item.pending || ['unknown', 'conflict', 'oversize', 'error'].includes(item.phase)) result.push({category, ...item});
  }
  for (const [category, store] of entryStores) for (const item of store.entries.values()) {
    if (item.dirty || item.pending || ['unknown', 'conflict', 'oversize', 'error'].includes(item.phase)) result.push({category, ...item});
  }
  return result;
}
export function paintDailyNotesPage() {
  if (!notesVisible()) return;
  const root = document.querySelector('#daily-notes');
  if (!root || !notesStore || !entryStore) return;
  const date = dailyNotesRouteDate(), category = dailyNotesRouteCategory(), legacy = notesStore.page(date), current = entryStore.page(date);
  const host = root.querySelector('#notes-composer'), view = editorViews.page(category, date), active = view.active;
  const field = active === 'legacy' ? root.querySelector('#notes-editor') : host.querySelector('[data-note-entry-editor="' + active + '"]');
  const selected = editorViews.sync(category, date, current.ids.map(id => entryStore.entry(id)).filter(Boolean), legacy,
    {focused: host.contains(document.activeElement), composing: field?.dataset.composing === 'true'});
  paintNoteEntries(root, entryStore, current, legacy, {drafts: retainedDrafts(), confirmId: notesConfirmEntry, active: selected.active});
  root.querySelector('#notes-delete-confirm').hidden = notesConfirmDate !== date;
}
async function selectDailyNotesDate(value) {
  if (!validDailyNotesDate(value) || value > dailyNotesToday()) return;
  ensureDailyNotesStore(); notesConfirmDate = ''; notesConfirmEntry = ''; setDailyNotesRouteDate(value); updateRoute(true);
  const legacy = notesStore, entries = entryStore;
  paintDailyNotesPage(); await Promise.all([legacy.read(value), entries.read(value)]);
}
function shiftedNotesDate(date, delta) {
  return new Date(Date.parse(date + 'T12:00:00Z') + delta * 86400000).toISOString().slice(0, 10);
}
function openEditor(key) {
  editorViews.activate(dailyNotesRouteCategory(), dailyNotesRouteDate(), key); paintDailyNotesPage();
  const editor = key === 'legacy' ? document.querySelector('#notes-editor') :
    document.querySelector('#notes-active-entry [data-note-entry-editor="' + key + '"]');
  editor?.focus(); document.querySelector('#notes-composer')?.scrollIntoView?.({block: 'nearest', behavior: 'smooth'});
}
function requestEditorCollapse(event) {
  if (!notesVisible() || !event.target.closest('#notes-composer')) return;
  const root = document.querySelector('#daily-notes'), host = root?.querySelector('#notes-composer');
  if (!host || host.contains(event.relatedTarget) || event.relatedTarget?.closest(
    '[data-note-entry-action="edit"],[data-notes-action="new"],[data-notes-action="edit-legacy"]')) return;
  const category = root.dataset.category, date = root.dataset.date, {active, revision} = editorViews.page(category, date);
  setTimeout(() => {
    editorViews.requestCollapse(category, date, active, revision);
    if (notesVisible() && category === dailyNotesRouteCategory() && date === dailyNotesRouteDate()) paintDailyNotesPage();
  }, 0);
}
function registerNotesInputEvents() {
  document.addEventListener('input', event => {
    if (!notesVisible()) return;
    const composing = event.isComposing || event.target.dataset.composing === 'true';
    if (event.target.id === 'notes-editor') notesStores.get(event.target.dataset.category)?.edit(event.target.dataset.date, event.target.value, {composing});
    else if (event.target.dataset.noteEntryEditor) {
      entryStores.get(event.target.dataset.category)?.edit(event.target.dataset.noteEntryEditor, event.target.value, {composing});
    }
  });
  document.addEventListener('compositionstart', event => {
    if (notesVisible() && (event.target.id === 'notes-editor' || event.target.dataset.noteEntryEditor)) event.target.dataset.composing = 'true';
  });
  document.addEventListener('compositionend', event => {
    if (event.target.id !== 'notes-editor' && !event.target.dataset.noteEntryEditor) return;
    event.target.dataset.composing = 'false';
    if (!notesVisible()) return;
    if (event.target.id === 'notes-editor') notesStores.get(event.target.dataset.category)?.edit(event.target.dataset.date, event.target.value);
    else entryStores.get(event.target.dataset.category)?.edit(event.target.dataset.noteEntryEditor, event.target.value);
  });
  document.addEventListener('change', event => {
    if (notesVisible() && event.target.id === 'notes-date') void selectDailyNotesDate(event.target.value);
  });
  document.addEventListener('focusout', requestEditorCollapse);
}
async function handleEntryAction(target, entries) {
  const id = target.closest('[data-note-entry]')?.dataset.noteEntry, item = entries.entry(id);
  if (!item) return;
  const action = target.dataset.noteEntryAction;
  if (action === 'edit') openEditor(id);
  else if (action === 'save') await entries.save(id);
  else if (action === 'restore') await entries.restoreEntry(id);
  else if (action === 'delete') { notesConfirmEntry = id; paintDailyNotesPage(); }
  else if (action === 'cancel-delete') { notesConfirmEntry = ''; paintDailyNotesPage(); }
  else if (action === 'confirm-delete') { notesConfirmEntry = ''; await entries.deleteEntry(id); paintDailyNotesPage(); }
  else if (action === 'check') { if (item.phase === 'unknown') await entries.reconcile(id); else await entries.readOne(id); }
  else if (action === 'retry') await entries.retryPending(id);
  else if (action === 'use-server') entries.useServer(id);
  else if (action === 'use-draft') await entries.useDraft(id);
}
async function handleNotesClick(event) {
  if (!notesVisible()) return;
  const root = document.querySelector('#daily-notes');
  const target = event.target.closest('[data-notes-action],[data-notes-date],[data-notes-category],[data-note-entry-action]');
  if (!target || !root?.contains(target)) return;
  event.preventDefault();
  if (target.dataset.notesCategory) {
    setDailyNotesRouteCategory(target.dataset.notesCategory); updateRoute(true); renderShell(); return;
  }
  if (target.dataset.notesDate) {
    if (target.dataset.notesDraftCategory && target.dataset.notesDraftCategory !== dailyNotesRouteCategory()) {
      setDailyNotesRouteCategory(target.dataset.notesDraftCategory); setDailyNotesRouteDate(target.dataset.notesDate);
      updateRoute(true); renderShell();
    } else await selectDailyNotesDate(target.dataset.notesDate);
    return;
  }
  const store = ensureDailyNotesStore(), entries = entryStore, date = dailyNotesRouteDate();
  if (target.dataset.noteEntryAction) { await handleEntryAction(target, entries); return; }
  const action = target.dataset.notesAction;
  if (action === 'new') { const item = entries.start(date); if (item) openEditor(item.id); }
  else if (action === 'edit-legacy') openEditor('legacy');
  else if (action === 'collapse') {
    const {active, revision} = editorViews.page(dailyNotesRouteCategory(), date);
    editorViews.requestCollapse(dailyNotesRouteCategory(), date, active, revision, {explicit: true}); paintDailyNotesPage();
  } else if (action === 'previous' || action === 'next') await selectDailyNotesDate(shiftedNotesDate(date, action === 'previous' ? -1 : 1));
  else if (action === 'login') renderLogin();
  else if (action === 'today') await selectDailyNotesDate(dailyNotesToday());
  else if (action === 'save') await store.save(date);
  else if (action === 'restore') await store.restorePage(date);
  else if (action === 'delete') { notesConfirmDate = date; paintDailyNotesPage(); }
  else if (action === 'cancel-delete') { notesConfirmDate = ''; paintDailyNotesPage(); }
  else if (action === 'confirm-delete') { notesConfirmDate = ''; await store.deletePage(date); paintDailyNotesPage(); }
  else if (action === 'check') { if (store.page(date).phase === 'unknown') await store.reconcile(date); else await store.read(date); }
  else if (action === 'use-server') store.useServer(date);
  else if (action === 'retry') await store.retryPending(date);
  else if (action === 'use-draft') await store.useDraft(date);
}
function registerDailyNotesEvents() {
  if (notesEventsRegistered) return;
  notesEventsRegistered = true; registerNotesInputEvents();
  document.addEventListener('click', event => { void handleNotesClick(event); });
  window.addEventListener('beforeunload', event => {
    if (notesIdentity !== notesIdentityNow() || !notesStore) return;
    if (retainedDrafts().some(item => item.dirty || item.pending || item.phase === 'unknown')) {
      event.preventDefault(); event.returnValue = '';
    }
  });
}
export async function loadDailyNotes() {
  registerDailyNotesEvents(); setDailyNotesRouteDate(dailyNotesRouteDate());
  const store = ensureDailyNotesStore(), entries = entryStore, date = dailyNotesRouteDate();
  await Promise.all([store.read(date), entries.read(date)]); paintDailyNotesPage();
}
