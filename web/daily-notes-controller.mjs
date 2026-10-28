import {api, apiNetwork} from './core/api.mjs';
import {state, runtime} from './core/state.mjs';
import {updateRoute} from './core/router.mjs';
import {renderShell} from './controller.mjs';
import {createDailyNotesStore, dailyNotesRouteDate, dailyNotesToday,
  setDailyNotesRouteDate, validDailyNotesDate, dailyNotesRouteCategory, setDailyNotesRouteCategory} from './core/daily-notes-state.mjs';
import {createNoteEntriesStore, validCustomNoteLabel} from './core/note-entries-state.mjs';
import {loadNoteDay, loadNoteHistoryDates, filterNoteDay} from './core/notes-history.mjs';
import {createNotesEditorView} from './core/notes-editor-view.mjs';
import {paintNoteEntries} from './pages/daily-notes.mjs';
import {renderLogin} from './pages/login.mjs';
import {getOfflineRuntime, onOfflineRuntime} from './offline/runtime.mjs';
import {registerConflictDraftGuard, createNoteConflictDraftGuard} from './offline/conflict-draft-guards.mjs';

let notesStore, entryStore, notesIdentity = '', notesEventsRegistered = false,
  notesConfirmDate = '', notesConfirmEntry = '', notesActiveCategory = '', notesRefreshPaused = false,
  notesDraftError = '', notesDraftRevision = 0;
let notesView = 'today', historyRows = [], historySequence = 0;
let notesSelectedLabel = '生活', notesLabels = [], notesLabelIntent = null, notesLabelBusy = false, notesLabelMessage = '';
const notesStores = new Map(), entryStores = new Map(), editorViews = createNotesEditorView();
const notesIdentityNow = () => JSON.stringify([runtime.sessionEpoch, state.me?.id || '',
  state.me?.publicBusiness === true, getOfflineRuntime()?.state.scope || '']);
const notesVisible = () => state.page === 'notes' && notesIdentity === notesIdentityNow();
const draftFields = ['id', 'date', 'draft', 'version', 'serverText', 'contentHash', 'label', 'labelKnown', 'createdAt', 'updatedAt', 'dirty',
  'phase', 'pending', 'remote', 'localVersion', 'durableText', 'localBacked', 'localQueued', 'recoveredBaseline'];
const hydratedDrafts = new WeakMap();
const hydrationReady = new WeakSet();
const entryIdentities = new WeakMap();
function captureNotesDrafts(legacy, entries, category) {
  const offline = getOfflineRuntime();
  if (!offline || !hydrationReady.has(entries) || entryIdentities.get(entries) !== notesIdentityNow()) return;
  const rows = [];
  for (const [kind, values] of [['legacy', legacy.pages.values()], ['note_entry', entries.entries.values()]]) for (const item of values)
    rows.push({kind, category, ...Object.fromEntries(draftFields.filter(key => item[key] !== undefined).map(key => [key, item[key]]))});
  return offline.retainDrafts(rows);
}
async function hydrateNotesDrafts(legacy, entries, category) {
  const offline = getOfflineRuntime(), expected = entryIdentities.get(entries);
  const active = () => expected === notesIdentityNow();
  if (!offline || !active()) return;
  const seen = hydratedDrafts.get(entries) || new Set(); hydratedDrafts.set(entries, seen);
  const entryDrafts = await offline.retainedDrafts('note_entry');
  if (!active()) return;
  for (const raw of entryDrafts) {
    if (raw.category !== category || seen.has(raw.id)) continue;
    entries.restoreDraft(raw); seen.add(raw.id);
  }
  const legacyDrafts = await offline.retainedDrafts('legacy');
  if (!active()) return;
  for (const raw of legacyDrafts) {
    const key = 'legacy:' + raw.date;
    if (raw.category !== category || seen.has(key)) continue;
    const item = legacy.page(raw.date);
    Object.assign(item, {draft: raw.draft, dirty: true, canEdit: false, phase: raw.phase || 'error',
      pending: raw.pending || null, remote: raw.remote || null, error: '保留的原有草稿只读，可导出；不会自动上传。'});
    seen.add(key);
  }
  hydrationReady.add(entries); await captureNotesDrafts(legacy, entries, category);
  await showRetainedArchive();
}
async function archivedDrafts() {
  const offline = getOfflineRuntime();
  return offline ? [...await offline.retainedDrafts('legacy'), ...await offline.retainedDrafts('note_entry')] : [];
}
async function showRetainedArchive() {
  const expected = notesIdentityNow(), rows = await archivedDrafts(), root = document.querySelector('#daily-notes');
  if (!root || !notesVisible() || expected !== notesIdentityNow() || !rows.length) return;
  let box = root.querySelector('#notes-retained-archive');
  if (!box) {
    box = document.createElement('details'); box.id = 'notes-retained-archive'; box.className = 'notes-drafts';
    const summary = document.createElement('summary'); box.append(summary);
    const button = document.createElement('button'); button.className = 'btn text'; button.type = 'button';
    button.dataset.notesAction = 'export-drafts'; button.textContent = '导出本机保留草稿'; box.append(button);
    const body = document.createElement('div'); body.className = 'notes-retained-texts'; box.append(body);
    box.addEventListener('toggle', async () => {
      if (!box.open || expected !== notesIdentityNow()) return;
      const current = await archivedDrafts();
      if (expected !== notesIdentityNow()) return;
      body.replaceChildren(...current.map(row => {
        const pre = document.createElement('pre'); pre.textContent =
          `${row.kind === 'legacy' ? '原有记录' : '条目'} · ${row.category === 'work' ? '工作' : '生活'} · ${row.date}\n${row.draft}`;
        return pre;
      }));
    });
    root.querySelector('#notes-drafts').after(box);
  }
  box.querySelector('summary').textContent = `本机保留草稿（${rows.length} 份，只读）`;
}
async function exportDraftArchive() {
  const expected = notesIdentityNow(), rows = await archivedDrafts();
  if (expected !== notesIdentityNow()) return;
  const text = JSON.stringify({format: 'haoduoyu-retained-drafts-v1', drafts: rows}, null, 2);
  const url = URL.createObjectURL(new Blob([text], {type: 'application/json;charset=utf-8'}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = '好多鱼本机保留草稿.json'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportLegacyDraft(item, category) {
  const text = ['好多鱼原有记录草稿（只读保留）', '分类：' + (category === 'work' ? '工作' : '生活'), '日期：' + item.date,
    '状态：' + item.phase, '原保存标识：' + (item.pending?.saveId || '无'), '', '当前草稿：', item.draft,
    ...(item.pending?.text !== undefined ? ['', '原未确认提交：', item.pending.text] : [])].join('\n');
  const url = URL.createObjectURL(new Blob([text], {type: 'text/plain;charset=utf-8'}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = '原有碎碎念草稿-' + category + '-' + item.date + '.txt';
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ensureDailyNotesStore() {
  const next = notesIdentityNow(), category = dailyNotesRouteCategory();
  if (notesIdentity !== next) {
    for (const store of [...notesStores.values(), ...entryStores.values()]) store.dispose();
    notesStores.clear(); entryStores.clear(); editorViews.clear(); notesIdentity = next;
    notesConfirmDate = ''; notesConfirmEntry = ''; notesRefreshPaused = false; notesDraftError = ''; notesDraftRevision++;
    notesView = 'today'; historyRows = []; historySequence++;
    notesSelectedLabel = '生活'; notesLabels = []; notesLabelIntent = null; notesLabelBusy = false; notesLabelMessage = '';
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
    const noteRequest = (path, options = {}) => request(path, {...options,
      headers: {...options.headers, 'X-Note-Labels-Version':'1'}});
    const suffix = separator => category === 'work' ? separator + 'category=work' : '';
    const changed = () => {
      if (expected !== notesIdentityNow()) return;
      const revision = ++notesDraftRevision, saved = captureNotesDrafts(legacy, entries, category);
      if (!getOfflineRuntime()?.state.scope && [...entries.entries.values()].some(item => item.dirty)) {
        notesDraftError = '本机草稿保存不可用，请保持页面打开或发送后再离开。';
      }
      if (saved) void saved.then(() => {
        if (expected !== notesIdentityNow() || revision !== notesDraftRevision || !notesDraftError || !getOfflineRuntime()?.state.scope) return;
        notesDraftError = ''; paintDailyNotesPage();
      }).catch(() => {
        if (expected !== notesIdentityNow() || revision !== notesDraftRevision) return;
        notesDraftError = '草稿未能保存在本机，请保持页面打开并检查存储空间。'; paintDailyNotesPage();
      });
      if (category === dailyNotesRouteCategory()) paintDailyNotesPage();
    };
    const readOnly = async () => { throw Object.assign(new Error('原有逐日记录只读，草稿可导出。'), {code: 'LEGACY_READ_ONLY'}); };
    const legacy = createDailyNotesStore({delay: 400,
      load: async date => ({...await request('/daily-notes?date=' + encodeURIComponent(date) + suffix('&')), can_edit: false}),
      put: readOnly, restore: readOnly, remove: readOnly,
      onChange: changed, onSaved: changed
    });
    const entries = createNoteEntriesStore({category, manualSave: true,
      load: (date, options) => options?.localOnly ? getOfflineRuntime().localRead('/note-entries?category=' + category + '&date=' + date) :
        noteRequest('/note-entries?category=' + category + '&date=' + encodeURIComponent(date)),
      loadEntry: (id, options) => options?.localOnly ? getOfflineRuntime().localRead('/note-entries/' + id) :
        noteRequest('/note-entries/' + encodeURIComponent(id)),
      loadOperation: id => noteRequest('/note-entries/operations/' + encodeURIComponent(id)),
      put: (id, body, options) => noteRequest('/note-entries/' + encodeURIComponent(id), {...options, method: 'PUT', body}),
      remove: (id, body, options) => noteRequest('/note-entries/' + encodeURIComponent(id), {...options, method: 'DELETE', body}),
      restore: (id, body, options) => noteRequest('/note-entries/' + encodeURIComponent(id) + '/restore', {...options, method: 'POST', body}),
      onChange: changed, onSaved: changed
    });
    entryIdentities.set(entries, expected);
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
  if (!notesVisible() || notesRefreshPaused) return;
  const root = document.querySelector('#daily-notes');
  if (!root || !notesStore || !entryStore) return;
  root.querySelector('#notes-today').hidden = notesView !== 'today';
  root.querySelector('#notes-history').hidden = notesView !== 'history';
  for (const button of root.querySelectorAll('[data-notes-view]'))
    button.setAttribute('aria-pressed', String(button.dataset.notesView === notesView));
  const date = dailyNotesRouteDate(), category = dailyNotesRouteCategory(), legacy = notesStore.page(date), current = entryStore.page(date);
  const labelSelect = root.querySelector('#notes-compose-label'), labelValues = ['生活','工作', ...notesLabels];
  if (!labelValues.includes(notesSelectedLabel)) labelValues.push(notesSelectedLabel);
  if (JSON.stringify([...labelSelect.options].map(option => option.value)) !== JSON.stringify(labelValues)) {
    labelSelect.replaceChildren(...labelValues.map(value => {
      const option = document.createElement('option'); option.value = value; option.textContent = value; return option;
    }));
  }
  labelSelect.value = notesSelectedLabel;
  root.querySelector('#notes-label-status').textContent = notesLabelMessage;
  root.querySelector('[data-notes-action="create-label"]').disabled = notesLabelBusy;
  const custom = !['生活','工作'].includes(notesSelectedLabel) ? notesSelectedLabel : '';
  const filtered = {...current, ids: current.ids.filter(id => {
    const item = entryStore.entry(id); return item && (category === 'work' || item.labelKnown && (item.label || '') === custom);
  })};
  const host = root.querySelector('#notes-composer'), view = editorViews.page(category, date), active = view.active;
  const field = active === 'legacy' ? root.querySelector('#notes-editor') : host.querySelector('[data-note-entry-editor="' + active + '"]');
  const visibleLegacy = custom ? {...legacy, version: 0, dirty: false, pending: null, phase: 'empty', serverText: '', draft: ''} : legacy;
  const selected = editorViews.sync(category, date, filtered.ids.map(id => entryStore.entry(id)).filter(Boolean), visibleLegacy,
    {focused: host.contains(document.activeElement), composing: field?.dataset.composing === 'true'});
  paintNoteEntries(root, entryStore, filtered, visibleLegacy,
    {drafts: retainedDrafts(), confirmId: notesConfirmEntry, active: selected.active});
  if (notesDraftError) {
    const message = root.querySelector('#notes-entry-message');
    message.textContent = notesDraftError; message.hidden = false;
  }
  if (category === 'life' && current.ids.some(id => !entryStore.entry(id)?.labelKnown)) {
    const message = root.querySelector('#notes-entry-message');
    if (message.hidden) { message.textContent = '部分记录标签尚未核实，请联网读取后查看。'; message.hidden = false; }
  }
  root.querySelector('#notes-delete-confirm').hidden = true;
}
async function readNoteLabels() {
  const expected = notesIdentityNow();
  try {
    const data = await apiNetwork('/note-entries/labels', {headers:{'X-Note-Labels-Version':'1'}});
    if (expected !== notesIdentityNow() || data?.labels_version !== 1 || !Array.isArray(data?.labels) ||
        data.labels.some(row => !validCustomNoteLabel(row?.name))) throw new Error('标签列表未核实。');
    notesLabels = [...new Set(data.labels.map(row => row.name))]; notesLabelMessage = '';
  } catch (error) {
    if (expected !== notesIdentityNow()) return;
    notesLabelMessage = '标签需联网核实：' + (error.message || '请稍后重试。');
  }
  paintDailyNotesPage();
}
async function createNoteLabel(root) {
  if (notesLabelBusy) return;
  const input = root.querySelector('#notes-new-label'), label = input.value.trim().normalize('NFC');
  if (!validCustomNoteLabel(label)) { notesLabelMessage = '标签须为 1–32 个字符，且不能叫生活或工作。'; paintDailyNotesPage(); return; }
  if (!notesLabelIntent || notesLabelIntent.name !== label) notesLabelIntent = {name:label, save_id:crypto.randomUUID()};
  const expected = notesIdentityNow(), intent = notesLabelIntent; notesLabelBusy = true; notesLabelMessage = '正在添加标签…'; paintDailyNotesPage();
  try {
    const saved = await apiNetwork('/note-entries/labels', {method:'POST', body:intent, headers:{'X-Note-Labels-Version':'1'}});
    if (expected !== notesIdentityNow()) return;
    if (saved?.labels_version !== 1 || saved.name !== label) throw new Error('标签保存结果尚未核实，请重试原请求。');
    notesLabels = [...new Set([...notesLabels, label])]; notesSelectedLabel = label; notesLabelIntent = null;
    notesLabelMessage = '标签已添加'; input.value = '';
    setDailyNotesRouteCategory('life'); updateRoute(true); renderShell();
  } catch (error) {
    if (expected === notesIdentityNow()) notesLabelMessage = '添加失败，输入已保留，可重试：' + (error.message || '请联网后重试。');
  } finally { notesLabelBusy = false; if (expected === notesIdentityNow()) paintDailyNotesPage(); }
}
function paintHistoryRows(root) {
  const list = root.querySelector('#notes-history-list'), label = root.querySelector('#notes-history-label').value;
  const rows = filterNoteDay(historyRows, label);
  list.replaceChildren(...rows.map(row => {
    const article = document.createElement('article'); article.className = 'note-entry note-entry-saved';
    const heading = document.createElement('div'); heading.className = 'note-entry-head';
    const meta = document.createElement('span');
    const time = row.time && Number.isFinite(Date.parse(row.time)) ?
      new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(row.time)) : '';
    meta.textContent = [row.label, time].filter(Boolean).join(' · '); heading.append(meta);
    const text = document.createElement('div'); text.className = 'note-entry-reader'; text.textContent = row.entry.text;
    article.append(heading, text); return article;
  }));
  root.querySelector('#notes-history-status').textContent = rows.length ?
    '仅展示已同步记录；待同步内容请在原日期查看。' : '这一天没有符合条件的已同步记录。';
}
async function loadHistory(date = '') {
  const root = document.querySelector('#daily-notes'), sequence = ++historySequence, expected = notesIdentityNow();
  if (!root) return;
  const active = () => notesVisible() && notesView === 'history' && sequence === historySequence && expected === notesIdentityNow();
  const status = root.querySelector('#notes-history-status'), picker = root.querySelector('#notes-history-date');
  status.textContent = '正在读取历史…'; root.querySelector('#notes-history-list').replaceChildren();
  try {
    // History uses a direct network read: old offline projections may lack a custom label.
    const network = path => apiNetwork(path, {headers:{'X-Note-Labels-Version':'1'}});
    const dates = await loadNoteHistoryDates(network); if (!active()) return;
    const selected = dates.includes(date) ? date : dates.includes(picker.value) ? picker.value : dates[0] || '';
    picker.replaceChildren(...dates.map(value => {
      const option = document.createElement('option'); option.value = value; option.textContent = value; return option;
    }));
    picker.value = selected; historyRows = [];
    if (!selected) { status.textContent = '暂无历史记录。'; return; }
    historyRows = await loadNoteDay(network, selected); if (!active()) return;
    const labels = root.querySelector('#notes-history-label'), previous = labels.value;
    const values = ['', ...new Set(['生活','工作', ...historyRows.map(row => row.label)])];
    labels.replaceChildren(...values.map(value => {
      const option = document.createElement('option'); option.value = value; option.textContent = value || '全部'; return option;
    }));
    labels.value = values.includes(previous) ? previous : ''; paintHistoryRows(root);
  } catch (error) {
    if (!active()) return;
    historyRows = []; status.textContent = '历史读取失败，标签未核实：' + (error.message || '请联网重试。');
  }
}
async function selectDailyNotesDate(value) {
  if (!validDailyNotesDate(value) || value > dailyNotesToday()) return;
  ensureDailyNotesStore(); notesConfirmDate = ''; notesConfirmEntry = ''; setDailyNotesRouteDate(value); updateRoute(true);
  const legacy = notesStore, entries = entryStore, category = dailyNotesRouteCategory(), expected = notesIdentityNow();
  paintDailyNotesPage(); await Promise.all([legacy.read(value), entries.read(value)]);
  if (expected !== notesIdentityNow()) return;
  await hydrateNotesDrafts(legacy, entries, category); paintDailyNotesPage();
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
  if (!notesVisible() || notesRefreshPaused || !event.target.closest('#notes-composer')) return;
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
    else if (notesVisible() && event.target.id === 'notes-history-date') void loadHistory(event.target.value);
    else if (notesVisible() && event.target.id === 'notes-history-label') paintHistoryRows(event.target.closest('#daily-notes'));
    else if (notesVisible() && event.target.id === 'notes-compose-label') {
      notesSelectedLabel = event.target.value;
      const category = notesSelectedLabel === '工作' ? 'work' : 'life';
      if (category !== dailyNotesRouteCategory()) { setDailyNotesRouteCategory(category); updateRoute(true); renderShell(); }
      else paintDailyNotesPage();
    }
  });
  document.addEventListener('focusout', requestEditorCollapse);
}
async function handleEntryAction(target, entries) {
  const id = target.closest('[data-note-entry]')?.dataset.noteEntry, item = entries.entry(id);
  if (!item) return;
  const action = target.dataset.noteEntryAction;
  if (action === 'edit') openEditor(id);
  else if (action === 'save') { item.manualSubmitted = true; await entries.save(id); paintDailyNotesPage(); }
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
  if (!notesVisible() || notesRefreshPaused) return;
  const root = document.querySelector('#daily-notes');
  const target = event.target.closest('[data-notes-action],[data-notes-date],[data-notes-category],[data-note-entry-action],[data-notes-view]');
  if (!target || !root?.contains(target)) return;
  event.preventDefault();
  if (target.dataset.notesView) {
    notesView = target.dataset.notesView === 'history' ? 'history' : 'today'; historySequence++;
    paintDailyNotesPage(); if (notesView === 'history') await loadHistory(); return;
  }
  if (target.dataset.notesCategory) {
    notesSelectedLabel = target.dataset.notesCategory === 'work' ? '工作' : '生活';
    setDailyNotesRouteCategory(target.dataset.notesCategory); updateRoute(true); renderShell(); return;
  }
  if (target.dataset.notesDate) {
    if (target.dataset.notesDraftCategory && target.dataset.notesDraftCategory !== dailyNotesRouteCategory()) {
      notesSelectedLabel = target.dataset.notesDraftCategory === 'work' ? '工作' : '生活';
      setDailyNotesRouteCategory(target.dataset.notesDraftCategory); setDailyNotesRouteDate(target.dataset.notesDate);
      updateRoute(true); renderShell();
    } else await selectDailyNotesDate(target.dataset.notesDate);
    return;
  }
  const store = ensureDailyNotesStore(), entries = entryStore, date = dailyNotesRouteDate();
  if (target.dataset.noteEntryAction) { await handleEntryAction(target, entries); return; }
  const action = target.dataset.notesAction;
  if (action === 'new') { const label = ['生活','工作'].includes(notesSelectedLabel) ? '' : notesSelectedLabel;
    const item = entries.start(date, {label}); if (item) openEditor(item.id); }
  else if (action === 'create-label') await createNoteLabel(root);
  else if (action === 'edit-legacy') openEditor('legacy');
  else if (action === 'collapse') {
    const {active, revision} = editorViews.page(dailyNotesRouteCategory(), date);
    editorViews.requestCollapse(dailyNotesRouteCategory(), date, active, revision, {explicit: true}); paintDailyNotesPage();
  } else if (action === 'previous' || action === 'next') await selectDailyNotesDate(shiftedNotesDate(date, action === 'previous' ? -1 : 1));
  else if (action === 'login') renderLogin();
  else if (action === 'today') await selectDailyNotesDate(dailyNotesToday());
  else if (action === 'export-legacy') exportLegacyDraft(store.page(date), dailyNotesRouteCategory());
  else if (action === 'export-drafts') await exportDraftArchive();
}
function registerDailyNotesEvents() {
  if (notesEventsRegistered) return;
  notesEventsRegistered = true; registerNotesInputEvents();
  registerConflictDraftGuard(createNoteConflictDraftGuard({getStores: () => entryStores, getIdentity: notesIdentityNow,
    getComposing: id => document.querySelector('[data-note-entry-editor="' + id + '"]')?.dataset.composing === 'true'}));
  window.addEventListener('haoduoyu:before-refresh', event => {
    if (typeof event.detail?.waitUntil !== 'function' || notesIdentity !== notesIdentityNow()) return;
    const resumes = [], expected = notesIdentityNow(), root = document.querySelector('#daily-notes');
    const controls = [...root?.querySelectorAll('button,input,select') || []].map(control => [control, control.disabled]);
    const field = root?.querySelector('#notes-active-entry textarea'), readOnly = field?.readOnly;
    const wasInert = root?.inert;
    notesRefreshPaused = true;
    if (root) root.inert = true;
    for (const [control] of controls) control.disabled = true;
    if (field) field.readOnly = true;
    event.detail.onFailure?.(() => {
      for (const resume of resumes) resume();
      if (expected !== notesIdentityNow()) return;
      notesRefreshPaused = false;
      if (root) root.inert = wasInert;
      for (const [control, disabled] of controls) control.disabled = disabled;
      if (field) field.readOnly = readOnly;
      paintDailyNotesPage();
    });
    try {
      for (const store of entryStores.values()) resumes.push(store.pauseAutosave());
      if (field) entryStores.get(field.dataset.category)?.edit(field.dataset.noteEntryEditor, field.value,
        {composing: field.dataset.composing === 'true'});
      const offline = getOfflineRuntime();
      const writes = [...notesStores.keys()].map(category => captureNotesDrafts(notesStores.get(category), entryStores.get(category), category));
      event.detail.waitUntil(Promise.allSettled(writes).then(results => {
        const failed = results.find(result => result.status === 'rejected');
        if (failed) throw failed.reason;
        return offline?.flushDrafts();
      }).then(() => {
        if (expected !== notesIdentityNow()) throw new Error('REFRESH_IDENTITY_CHANGED');
      }));
    } catch (error) { event.detail.waitUntil(Promise.reject(error)); }
  });
  onOfflineRuntime(offline => {
    let signature = '';
    offline.subscribe(value => {
      const next = JSON.stringify([value.pending, value.conflicts, value.lastSuccess, value.phase]);
      if (next === signature || value.phase === 'syncing') return;
      signature = next;
      if (notesVisible() && entryStore && hydrationReady.has(entryStore)) void entryStore.read(dailyNotesRouteDate(), {localOnly: true});
    });
  });
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
  const store = ensureDailyNotesStore(), entries = entryStore, date = dailyNotesRouteDate(),
    category = dailyNotesRouteCategory(), expected = notesIdentityNow();
  await Promise.all([store.read(date), entries.read(date)]);
  if (expected !== notesIdentityNow()) return;
  await hydrateNotesDrafts(store, entries, category); paintDailyNotesPage(); void readNoteLabels();
}
