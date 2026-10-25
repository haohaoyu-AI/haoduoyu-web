import {api} from './core/api.mjs';
import {state, runtime} from './core/state.mjs';
import {updateRoute} from './core/router.mjs';
import {createDailyNotesStore, dailyNotesRouteDate, dailyNotesToday,
  setDailyNotesRouteDate, validDailyNotesDate} from './core/daily-notes-state.mjs';
import {paintDailyNotes} from './pages/daily-notes.mjs';
import {renderLogin} from './pages/login.mjs';

let notesStore, notesIdentity = '', notesEventsRegistered = false, notesConfirmDate = '';
let notesDateIndex = {dates: [], hasMore: false, cursor: null, loading: false, error: '', sequence: 0};
const notesIdentityNow = () => String(runtime.sessionEpoch) + ':' + String(state.me?.id || '') + ':' + String(state.me?.csrfToken || '');
const notesVisible = () => state.page === 'notes' && notesIdentity === notesIdentityNow();
function ensureDailyNotesStore() {
  const next = notesIdentityNow();
  if (!notesStore || notesIdentity !== next) {
    notesStore?.dispose(); notesIdentity = next; notesConfirmDate = '';
    notesDateIndex = {dates: [], hasMore: false, cursor: null, loading: false, error: '', sequence: 0};
    const expected = next;
    const active = () => {
      if (notesIdentityNow() !== expected) { store.dispose(); throw new DOMException('请求已取消', 'AbortError'); }
    };
    const request = async (path, options) => {
      active(); const value = await api(path, options); active(); return value;
    };
    const store = createDailyNotesStore({
      load: date => request('/daily-notes?date=' + encodeURIComponent(date)),
      put: (date, body) => request('/daily-notes/' + encodeURIComponent(date), {method: 'PUT', body}),
      remove: (date, body) => request('/daily-notes/' + encodeURIComponent(date), {method: 'DELETE', body}),
      onChange: () => { if (expected === notesIdentityNow()) paintDailyNotesPage(); },
      onSaved: () => { if (expected === notesIdentityNow()) void loadNoteDates(); }
    });
    notesStore = store;
  }
  return notesStore;
}
export function paintDailyNotesPage() {
  if (!notesVisible()) return;
  const root = document.querySelector('#daily-notes');
  if (!root) return;
  const item = notesStore.page(dailyNotesRouteDate());
  const drafts = [...notesStore.pages.values()].filter(value => value.dirty || value.pending ||
    ['unknown', 'conflict', 'oversize'].includes(value.phase));
  paintDailyNotes(root, item, {drafts, dates: notesDateIndex.dates, hasMore: notesDateIndex.hasMore,
    datesLoading: notesDateIndex.loading, datesError: notesDateIndex.error});
  root.querySelector('#notes-delete-confirm').hidden = notesConfirmDate !== item.date;
}
async function loadNoteDates(more = false) {
  ensureDailyNotesStore();
  if (more && (!notesDateIndex.hasMore || notesDateIndex.loading)) return;
  const expected = notesIdentity, current = notesDateIndex, sequence = ++current.sequence;
  const before = more ? current.cursor : null;
  current.loading = true; current.error = ''; paintDailyNotesPage();
  try {
    const result = await api('/daily-notes/dates?page_size=30' + (before ? '&before=' + encodeURIComponent(before) : ''));
    if (expected !== notesIdentityNow() || current !== notesDateIndex || sequence !== current.sequence) return;
    if (!Array.isArray(result?.dates) || result.dates.some(value => !validDailyNotesDate(value)) ||
        typeof result.has_more !== 'boolean' || result.has_more &&
        (!validDailyNotesDate(result.next_before) || before && result.next_before >= before))
      throw new Error('日期列表不完整，请稍后重新读取。');
    current.dates = [...new Set([...(more ? current.dates : []), ...result.dates])].sort().reverse();
    current.hasMore = result.has_more; current.cursor = result.next_before;
  } catch (error) {
    if (expected === notesIdentityNow() && sequence === current.sequence) current.error = error.message;
  } finally {
    if (expected === notesIdentityNow() && current === notesDateIndex && sequence === current.sequence) {
      current.loading = false; paintDailyNotesPage();
    }
  }
}
async function selectDailyNotesDate(value) {
  if (!validDailyNotesDate(value) || value > dailyNotesToday()) return;
  ensureDailyNotesStore(); notesConfirmDate = ''; setDailyNotesRouteDate(value); updateRoute(true);
  paintDailyNotesPage(); await notesStore.read(value);
}
function shiftedNotesDate(date, delta) {
  return new Date(Date.parse(date + 'T12:00:00Z') + delta * 86400000).toISOString().slice(0, 10);
}
function registerDailyNotesEvents() {
  if (notesEventsRegistered) return;
  notesEventsRegistered = true;
  document.addEventListener('input', event => {
    if (!notesVisible() || event.target.id !== 'notes-editor') return;
    ensureDailyNotesStore().edit(event.target.dataset.date, event.target.value, {composing: event.isComposing});
  });
  document.addEventListener('compositionend', event => {
    if (notesVisible() && event.target.id === 'notes-editor')
      ensureDailyNotesStore().edit(event.target.dataset.date, event.target.value);
  });
  document.addEventListener('change', event => {
    if (notesVisible() && event.target.id === 'notes-date') void selectDailyNotesDate(event.target.value);
  });
  document.addEventListener('click', async event => {
    if (!notesVisible()) return;
    const root = document.querySelector('#daily-notes'), target = event.target.closest('[data-notes-action],[data-notes-date]');
    if (!target || !root?.contains(target)) return;
    event.preventDefault();
    if (target.dataset.notesDate) { await selectDailyNotesDate(target.dataset.notesDate); return; }
    const store = ensureDailyNotesStore(), date = dailyNotesRouteDate(), action = target.dataset.notesAction;
    if (action === 'previous' || action === 'next') await selectDailyNotesDate(shiftedNotesDate(date, action === 'previous' ? -1 : 1));
    else if (action === 'login') renderLogin();
    else if (action === 'today') await selectDailyNotesDate(dailyNotesToday());
    else if (action === 'save') await store.save(date);
    else if (action === 'delete') { notesConfirmDate = date; paintDailyNotesPage(); }
    else if (action === 'cancel-delete') { notesConfirmDate = ''; paintDailyNotesPage(); }
    else if (action === 'confirm-delete') { notesConfirmDate = ''; await store.deletePage(date); paintDailyNotesPage(); }
    else if (action === 'check') {
      if (store.page(date).phase === 'unknown') await store.reconcile(date);
      else await store.read(date);
    } else if (action === 'use-server') store.useServer(date);
    else if (action === 'retry') await store.retryPending(date);
    else if (action === 'use-draft') await store.useDraft(date);
    else if (action === 'more') await loadNoteDates(true);
  });
  window.addEventListener('beforeunload', event => {
    if (notesIdentity !== notesIdentityNow() || !notesStore) return;
    if ([...notesStore.pages.values()].some(item => item.dirty || item.pending || item.phase === 'unknown')) {
      event.preventDefault(); event.returnValue = '';
    }
  });
}
export async function loadDailyNotes() {
  registerDailyNotesEvents(); const store = ensureDailyNotesStore();
  await Promise.all([store.read(dailyNotesRouteDate()), loadNoteDates()]);
  paintDailyNotesPage();
}
