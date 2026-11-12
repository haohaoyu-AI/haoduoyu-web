import {api, apiNetwork} from './core/api.mjs';
import {state, runtime} from './core/state.mjs';
import {updateRoute} from './core/router.mjs';
import {renderShell} from './controller.mjs';
import {createDailyNotesStore, dailyNotesRouteDate, dailyNotesToday,
  setDailyNotesRouteDate, validDailyNotesDate, dailyNotesRouteCategory, setDailyNotesRouteCategory} from './core/daily-notes-state.mjs';
import {createNoteEntriesStore, validCustomNoteLabel} from './core/note-entries-state.mjs';
import {checkedNoteMonth, coalesceNoteMonthFlight, noteMonthWeeks, shiftNoteMonth, validNoteMonth} from './core/notes-month.mjs';
import {createNotesEditorView, noteDraftNeedsAttention} from './core/notes-editor-view.mjs';
import {paintNoteEntries} from './pages/daily-notes.mjs';
import {renderLogin} from './pages/login.mjs';
import {getOfflineRuntime, onOfflineRuntime} from './offline/runtime.mjs';
import {isLocalDocument} from './offline/document.mjs';
import {registerConflictDraftGuard, createNoteConflictDraftGuard} from './offline/conflict-draft-guards.mjs';
import {createDraftRevisionTracker, unchangedEntrySinceSnapshot, uniqueRetainedDrafts, matchesDeletedEntry, createLegacyRecoveryGuard, 
  createEntryRecoveryGuard} 
  from './offline/retained-drafts.mjs';

let notesStore, entryStore, notesIdentity = '', notesEventsRegistered = false,
  notesConfirmDate = '', notesConfirmEntry = '', notesActiveCategory = '', notesRefreshPaused = false,
  notesDraftError = '', notesDraftRevision = 0;
let notesView = 'today', historyMonth = '', historyDate = '', historyDays = new Map(), historySequence = 0;
let scoreByDate = new Map(), scoreRecord = {date:'', score:null, version:0, status:'', saveId:'', pending:null, canEdit:false};
let historyActiveLoad = null;
let notesSelectedLabel = '生活', notesLabels = [], notesArchivedLabels = [], notesLabelsVerified = false,
  notesLabelIntent = null, notesArchiveIntent = null, notesLabelBusy = false, notesLabelMessage = '', notesLabelSequence = 0;
const notesStores = new Map(), entryStores = new Map(), editorViews = createNotesEditorView();
const floatingNoteObservers = new Set();
let floatingNoteId = '', floatingNoteDate = '', floatingNoteCategory = 'life', floatingComposingId = '';
export function observeFloatingNotes(callback) {
  floatingNoteObservers.add(callback); return () => floatingNoteObservers.delete(callback);
}
const notesIdentityNow = () => JSON.stringify([runtime.sessionEpoch, state.me?.id || '',
  state.me?.publicBusiness === true, getOfflineRuntime()?.state.scope || '']);
const notesVisible = () => state.page === 'notes' && notesIdentity === notesIdentityNow();
const draftFields = ['id', 'date', 'draft', 'version', 'serverText', 'contentHash', 'label', 'labels', 'labelKnown', 'createdAt', 'updatedAt', 'dirty',
  'phase', 'pending', 'remote', 'deleted', 'localVersion', 'durableText', 'localBacked', 'localQueued', 'recoveredBaseline'];
const hydratedDrafts = new WeakMap();
const hydrationReady = new WeakSet();
const entryIdentities = new WeakMap();
const entryDraftRevision = createDraftRevisionTracker();
const legacyRecoveryGuard = createLegacyRecoveryGuard();
const entryRecoveryGuard = createEntryRecoveryGuard(draftFields);
const sendFeedbackTimers = new WeakMap();
function scheduleSendFeedback(entries, expected) {
  for (const item of entries.entries.values()) {
    if (!item.manualSubmitted || item.phase !== 'saved' || item.dirty || item.pending || sendFeedbackTimers.has(item)) continue;
    const attempt = item.manualSubmitted;
    const timer = setTimeout(() => {
      sendFeedbackTimers.delete(item);
      if (expected !== notesIdentityNow() || item.manualSubmitted !== attempt) return;
      item.manualSubmitted = null; paintDailyNotesPage();
    }, 2500);
    sendFeedbackTimers.set(item, timer);
  }
}
function captureNotesDrafts(legacy, entries, category) {
  const offline = getOfflineRuntime();
  if (!offline || !hydrationReady.has(entries) || entryIdentities.get(entries) !== notesIdentityNow()) return;
  const rows = [];
  for (const [kind, values] of [['legacy', legacy.pages.values()], ['note_entry', entries.entries.values()]]) for (const item of values) {
    if (item.discarding || kind === 'legacy' && legacyRecoveryGuard.unchanged(item)) continue;
    // A recovered snapshot remains available even after its explicit save succeeds.
    if (kind === 'note_entry' && item.recoveredBaseline && !noteDraftNeedsAttention(item)) continue;
    const recoveryProof=kind === 'note_entry' ? entryRecoveryGuard.proof(item) : null;
    rows.push({kind, category, ...Object.fromEntries(draftFields.filter(key => item[key] !== undefined).map(key => [key, item[key]])),
      ...(recoveryProof ? {recoveryProof} : {})});
  }
  return offline.retainDrafts(rows);
}
async function hydrateNotesDrafts(legacy, entries, category) {
  const offline = getOfflineRuntime(), expected = entryIdentities.get(entries);
  const active = () => expected === notesIdentityNow();
  if (!offline || !active()) return;
  const seen = hydratedDrafts.get(entries) || new Set(); hydratedDrafts.set(entries, seen);
  const originals = new Map(entries.entries);
  const epochs = new Map([...entries.entries].map(([id, item]) => [id, item.writeEpoch]));
  const revisions = new Map([...entries.entries].map(([id, item]) => [id, entryDraftRevision(item)]));
  const entryDrafts = await visibleArchive();
  if (!active()) return;
  for (const {raw,record} of entryDrafts) {
    if (!raw || raw.kind !== 'note_entry' || raw.category !== category || seen.has(raw.id)) continue;
    const current = entries.entries.get(raw.id);
    if (current && originals.get(raw.id) !== current) continue;
    if (!unchangedEntrySinceSnapshot(epochs, raw.id, current, revisions.get(raw.id), current && entryDraftRevision(current))) continue;
    if (current && (current.pending || current.composing || current.dirty)) continue;
    const restored=entries.restoreDraft(raw);
    if(restored?.recoveredBaseline) entryRecoveryGuard.remember(restored,record);
    seen.add(raw.id);
  }
  const legacyDrafts = await offline.retainedDrafts('legacy');
  if (!active()) return;
  for (const raw of legacyDrafts) {
    if (!raw) continue;
    const key = 'legacy:' + raw.date;
    if (!raw || raw.category !== category || seen.has(key)) continue;
    const item = legacy.page(raw.date);
    Object.assign(item, {draft: raw.draft, dirty: true, canEdit: false, phase: raw.phase || 'error',
      pending: raw.pending || null, remote: raw.remote || null, error: '保留的原有草稿只读，可导出；不会自动上传。'});
    legacyRecoveryGuard.remember(item); seen.add(key);
  }
  hydrationReady.add(entries); await captureNotesDrafts(legacy, entries, category);
  await showRetainedArchive();
}
async function archivedDrafts() {
  const offline = getOfflineRuntime();
  return offline ? [...await offline.retainedDrafts('legacy'), ...await offline.retainedDrafts('note_entry')] : [];
}
let visibleArchiveFlight = null, visibleArchiveSequence = 0, visibleArchiveTimer;
function scheduleArchiveRefresh(expected, force = false) {
  if (!force && !document.querySelector('#notes-retained-archive')) return;
  clearTimeout(visibleArchiveTimer);
  visibleArchiveTimer = setTimeout(async () => {
    const revision = notesDraftRevision;
    try { await getOfflineRuntime()?.flushDrafts(); } catch { return; }
    if (expected !== notesIdentityNow()) return;
    if (revision !== notesDraftRevision) return scheduleArchiveRefresh(expected, true);
    await showRetainedArchive();
  }, 300);
}
async function visibleArchive() {
  const identity = notesIdentityNow(), revision = notesDraftRevision;
  if (visibleArchiveFlight?.identity === identity && visibleArchiveFlight.revision === revision) return visibleArchiveFlight.promise;
  const promise = (async () => {
    const offline = getOfflineRuntime();
    if (!offline) return [];
    const snapshots = await offline.retainedDraftRecords('note_entry');
    const controller = new AbortController(), tombstones = new Map();
    const active = () => !controller.signal.aborted && identity === notesIdentityNow();
    const ids = [...new Set(snapshots.map(row => row.data?.id).filter(id => /^[a-f0-9-]{36}$/i.test(id || '')))];
    let timer, next = 0;
    await Promise.race([
      Promise.all(Array.from({length: Math.min(6, ids.length)}, async () => {
        while (active() && next < ids.length) {
          const id = ids[next++];
          try { tombstones.set(id, await apiNetwork('/note-entries/' + encodeURIComponent(id),
            {headers: {'X-Note-Labels-Version': '3'}, suppressAuthRedirect: true, signal: controller.signal})); }
          catch { /* Unverified drafts remain recoverable. */ }
        }
      })),
      new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve(); }, 2000); })
    ]).finally(() => clearTimeout(timer));
    const rows = uniqueRetainedDrafts(snapshots.map(record => record.data).filter(row =>
      !row || !matchesDeletedEntry(row, tombstones.get(row.id))));
    return identity === notesIdentityNow() ? rows.map(raw => ({raw,record:snapshots.find(record => record.data === raw)})) : [];
  })();
  visibleArchiveFlight = {identity, revision, promise};
  try { return await promise; } finally { if (visibleArchiveFlight?.promise === promise) visibleArchiveFlight = null; }
}
// Each page load keeps its own copy of an unresolved draft, so identical text piles up across visits.
// The archive shows one row per text and deletes every copy of it. Confirmation stays in the page:
// some browsers silently refuse window.confirm, which made the old delete button do nothing.
let archiveConfirm = '', archiveMessage = '', archiveBusy = false;
const archiveGroupKey = ({draft_kind: kind, data}) => JSON.stringify([kind, data?.kind, data?.category, data?.date, data?.draft]);
function groupArchiveRecords(records) {
  const groups = new Map();
  for (const record of records) {
    const key = archiveGroupKey(record);
    if (!groups.has(key)) groups.set(key, {key, row: record.data, records: []});
    groups.get(key).records.push(record);
  }
  return [...groups.values()];
}
function archiveButton(text, onClick, className = 'btn text') {
  const button = document.createElement('button');
  button.type = 'button'; button.className = className; button.textContent = text; button.disabled = archiveBusy;
  button.addEventListener('click', onClick); return button;
}
function archiveConfirmRow(key, question, expected) {
  const row = document.createElement('div'), text = document.createElement('span');
  row.className = 'notes-retained-confirm'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', question);
  text.textContent = question;
  const accept = archiveButton('确认删除', () => void deleteArchiveRecords(key, expected), 'btn text notes-retained-danger');
  const cancel = archiveButton('取消', () => { archiveConfirm = ''; void showRetainedArchive(); });
  row.append(text, accept, cancel); return row;
}
function askArchiveDelete(key) { archiveConfirm = key; archiveMessage = ''; void showRetainedArchive(); }
// Opening the page restores every retained draft into its entry. That restored, untouched copy may be
// deleted; an entry the user has typed into since, or one with a live save, still owns its text.
function archiveRecordBusy(record) {
  const row = record.data;
  const item = row?.kind === 'note_entry' && entryStores.get(row.category)?.entry(row.id);
  if (!item) return false;
  if (item.composing || item.discarding || item.localQueued || item.pending && !item.pending.uncertain) return true;
  if (item.recoveredBaseline) return !entryRecoveryGuard.proof(item);
  return Boolean(item.pending || item.dirty && item.draft === row.draft);
}
async function restoreLegacyAfterDiscard(row, expected) {
  if (row?.kind !== 'legacy' || expected !== notesIdentityNow()) return;
  const remaining = await getOfflineRuntime().retainedDraftRecords('legacy');
  const item = notesStores.get(row.category)?.pages.get(row.date);
  const same = ({data}) => data?.category === row.category && data?.date === row.date && data?.draft === row.draft;
  if (expected === notesIdentityNow() && !remaining.some(same) && item && legacyRecoveryGuard.unchanged(item) &&
      item.draft === row.draft && !item.pending && !item.remote) {
    item.draft = item.serverText; item.dirty = false; item.error = ''; item.phase = item.version ? 'saved' : 'empty';
    legacyRecoveryGuard.forget(item); paintDailyNotesPage();
  }
}
async function deleteArchiveRecords(key, expected) {
  const offline = getOfflineRuntime();
  if (!offline || archiveBusy || expected !== notesIdentityNow()) return;
  archiveBusy = true; archiveConfirm = ''; archiveMessage = '正在删除…'; await showRetainedArchive();
  let removed = 0, editing = 0, failed = 0;
  try {
    const records = [...await offline.retainedDraftRecords('legacy'), ...await offline.retainedDraftRecords('note_entry')];
    for (const record of records.filter(record => key === 'all' || archiveGroupKey(record) === key)) {
      if (expected !== notesIdentityNow()) return;
      if (archiveRecordBusy(record)) { editing++; continue; }
      try {
        await offline.discardSelectedDraft(record); removed++;
        const row = record.data;
        if (row?.kind === 'note_entry') entryStores.get(row.category)?.dropRestoredDraft(row.id, row.draft);
        await restoreLegacyAfterDiscard(row, expected);
      }
      catch { failed++; }
    }
    archiveMessage = [`已删除 ${removed} 份。`, editing && `${editing} 份正在编辑或等待确认，已保留。`,
      failed && `${failed} 份刚刚发生变化，未删除，请再试一次。`].filter(Boolean).join('');
  } finally {
    archiveBusy = false;
    if (expected === notesIdentityNow()) { notesDraftRevision++; await showRetainedArchive(); }
  }
}
function archiveGroupSection(group, expected) {
  const {row, records} = group, section = document.createElement('section'), pre = document.createElement('pre');
  const copies = records.length > 1 ? `（相同内容 ${records.length} 份）` : '';
  const kind = row?.kind === 'legacy' ? '原有记录' : '条目', category = row?.category === 'work' ? '工作' : '生活';
  pre.textContent = row && `${kind} · ${category} · ${row.date}${copies}\n${row.draft}`;
  section.append(pre);
  const question = `永久删除这条草稿${records.length > 1 ? `的全部 ${records.length} 份本机副本` : ''}？删除后无法恢复。`;
  if (archiveConfirm === group.key) section.append(archiveConfirmRow(group.key, question, expected));
  else section.append(archiveButton(records.length > 1 ? `删除这条（${records.length} 份）` : '删除这份草稿', () => askArchiveDelete(group.key)));
  return section;
}
function archiveBox(root, expected) {
  let box = root.querySelector('#notes-retained-archive');
  if (box) return box;
  box = document.createElement('details'); box.id = 'notes-retained-archive'; box.className = 'notes-drafts';
  const summary = document.createElement('summary'); box.append(summary);
  const tools = document.createElement('div'); tools.className = 'notes-retained-tools'; box.append(tools);
  const status = document.createElement('p'); status.className = 'notes-retained-status'; status.setAttribute('role', 'status');
  box.append(status);
  const body = document.createElement('div'); body.className = 'notes-retained-texts'; box.append(body);
  box.addEventListener('toggle', async () => {
    if (!box.open || expected !== notesIdentityNow()) return;
    void showRetainedArchive();
  });
  root.querySelector('#notes-drafts').after(box);
  return box;
}
async function showRetainedArchive() {
  const expected = notesIdentityNow(), revision = notesDraftRevision, sequence = ++visibleArchiveSequence;
  const offline = getOfflineRuntime();
  const records = offline ? [...await offline.retainedDraftRecords('legacy'), ...await offline.retainedDraftRecords('note_entry')] : [];
  const root = document.querySelector('#daily-notes');
  if (!root || !notesVisible() || expected !== notesIdentityNow() || sequence !== visibleArchiveSequence) return;
  if (revision !== notesDraftRevision) return scheduleArchiveRefresh(expected, true);
  // With nothing left the whole box disappears, which is itself the confirmation.
  if (!records.length) { root.querySelector('#notes-retained-archive')?.remove(); archiveConfirm = ''; archiveMessage = ''; return; }
  const box = archiveBox(root, expected), groups = groupArchiveRecords(records);
  const total = records.length > groups.length ? `，共 ${records.length} 份` : '';
  box.querySelector('summary').textContent = `本机保留草稿（${groups.length} 条${total}）`;
  box.querySelector('.notes-retained-status').textContent = archiveMessage;
  box.querySelector('.notes-retained-tools').replaceChildren(
    archiveButton('导出本机保留草稿', () => void exportDraftArchive()),
    ...archiveConfirm === 'all' ? [archiveConfirmRow('all', `永久删除全部 ${records.length} 份本机保留草稿？删除后无法恢复。`, expected)]
      : [archiveButton(`全部删除（${records.length} 份）`, () => askArchiveDelete('all'))]);
  if (box.open) box.querySelector('.notes-retained-texts').replaceChildren(...groups.map(group => archiveGroupSection(group, expected)));
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
function dailyNotesTransport(category, expected, active) {
  const request = async (path, options) => { active(); const value = await api(path, options); active(); return value; };
  const noteRequest = async (path, options = {}) => {
    active();
    if (options.method && options.method !== 'GET') {
      const date = options.body?.date || dailyNotesRouteDate();
      await noteRequest('/note-entries?category=' + category + '&date=' + encodeURIComponent(date));
    }
    const value = await apiNetwork(path, {...options, headers: {...options.headers, 'X-Note-Labels-Version':'3'}}); active();
    if (value?.labels_version !== 3) throw Object.assign(new Error('服务器尚不支持多标签，草稿已保留。'),
      {code:'NOTE_LABELS_VERSION', localNotSaved:!options.method || options.method === 'GET'});
    return value; };
  const noteRead = async path => {
    const cached = await request(path, {headers: {'X-Note-Labels-Version':'1'}});
    if (isLocalDocument(cached) || cached?.entries?.some(isLocalDocument)) return cached;
    try { return await noteRequest(path); }
    catch (error) { if (error.code === 'NETWORK_UNAVAILABLE') return cached; throw error; }
  };
  const noteWrite = async (path, options) => {
    try { return await noteRequest(path, options); }
    catch (error) {
      if (error.code !== 'NETWORK_UNAVAILABLE') throw error;
      const body = options.body || {}, labels = body.labels;
      if (labels)
        throw Object.assign(new Error('多标签修改需要联网，草稿已保留。'), {code:'OFFLINE_MULTI_LABEL', localNotSaved:true});
      const {labels: ignored, ...legacyBody} = body;
      return request(path, {...options, offlineUnknown:true, body:legacyBody, headers:{'X-Note-Labels-Version':'1'}});
    }
  };
  return {request, noteRequest, noteRead, noteWrite};
}
function publishNotesChange(expected, category, stores) {
  if (expected !== notesIdentityNow()) return;
  const {legacy, entries} = stores;
  for (const item of entries.entries.values()) entryDraftRevision(item);
  scheduleSendFeedback(entries, expected);
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
  paintDailyNotesPage();
  scheduleArchiveRefresh(expected);
  return saved;
}
function openCategoryNotes(category, expected) {
  const stores = {};
  const active = () => {
    if (notesIdentityNow() !== expected) {
      stores.legacy.dispose(); stores.entries.dispose(); throw new DOMException('请求已取消', 'AbortError');
    }
  };
  const {request, noteRequest, noteRead, noteWrite} = dailyNotesTransport(category, expected, active);
  const suffix = separator => category === 'work' ? separator + 'category=work' : '';
  const changed = () => publishNotesChange(expected, category, stores);
  const readOnly = async () => { throw Object.assign(new Error('原有逐日记录只读，草稿可导出。'), {code: 'LEGACY_READ_ONLY'}); };
  const legacy = createDailyNotesStore({delay: 400,
    load: async date => ({...await request('/daily-notes?date=' + encodeURIComponent(date) + suffix('&')), can_edit: false}),
    put: readOnly, restore: readOnly, remove: readOnly,
    onChange: changed, onSaved: changed
  });
  stores.legacy = legacy;
  const entries = createNoteEntriesStore({category, manualSave: true, multiLabels: true,
    load: date => noteRead('/note-entries?category=' + category + '&date=' + encodeURIComponent(date)),
    loadVerified: date => noteRequest('/note-entries?category=' + category + '&date=' + encodeURIComponent(date)),
    loadEntry: id => noteRead('/note-entries/' + encodeURIComponent(id)),
    loadOperation: id => noteRequest('/note-entries/operations/' + encodeURIComponent(id)),
    put: (id, body, options) => noteWrite('/note-entries/' + encodeURIComponent(id), {...options, method: 'PUT', body}),
    remove: (id, body, options) => noteWrite('/note-entries/' + encodeURIComponent(id), {...options, method: 'DELETE', body}),
    restore: (id, body, options) => noteRequest('/note-entries/' + encodeURIComponent(id) + '/restore', {...options, method: 'POST', body}),
    prepareDelete: async item => {
      const offline = getOfflineRuntime();
      if (!offline?.state.scope || expected !== notesIdentityNow() || !hydrationReady.has(entries)) return null;
      await offline.flushDrafts();
      if (expected !== notesIdentityNow()) throw new Error('身份已变化');
      const row = {kind:'note_entry', category, ...Object.fromEntries(
        draftFields.filter(key => item[key] !== undefined).map(key => [key, structuredClone(item[key])]))};
      return {row, snapshots:await offline.retainedDraftRecords('note_entry')};
    },
    finishDelete: async ({row, snapshots}, result) => {
      const offline = getOfflineRuntime();
      if (offline && expected === notesIdentityNow()) {
        await offline.flushDrafts();
        await offline.purgeUserDeletedNoteDrafts(row, snapshots, result, () => expected === notesIdentityNow());
        scheduleArchiveRefresh(expected, true);
      }
    },
    discardUnsent: async item => {
      const offline = getOfflineRuntime();
      if (!offline?.state.scope || expected !== notesIdentityNow() || !hydrationReady.has(entries))
        throw new Error('本机草稿暂不可用');
      await offline.flushDrafts();
      if (expected !== notesIdentityNow()) throw new Error('身份已变化');
      await offline.discardUnsentNoteDraft({kind:'note_entry', category, ...Object.fromEntries(
        draftFields.filter(key => item[key] !== undefined).map(key => [key, item[key]]))});
    },
    onChange: changed, onSaved: () => { changed(); scheduleArchiveRefresh(expected, true); }
  });
  stores.entries = entries;
  return stores;
}
function ensureDailyNotesStore(category = dailyNotesRouteCategory(), select = true) {
  const next = notesIdentityNow();
  if (notesIdentity !== next) {
    for (const store of [...notesStores.values(), ...entryStores.values()]) store.dispose();
    notesStores.clear(); entryStores.clear(); editorViews.clear(); notesIdentity = next;
    notesConfirmDate = ''; notesConfirmEntry = ''; notesRefreshPaused = false; notesDraftError = ''; notesDraftRevision++;
    notesView = 'today'; historyMonth = ''; historyDate = ''; historyDays = new Map(); historySequence++; historyActiveLoad = null;
    notesSelectedLabel = '生活'; notesLabels = []; notesArchivedLabels = []; notesLabelsVerified = false;
    notesLabelIntent = null; notesArchiveIntent = null; notesLabelBusy = false; notesLabelMessage = ''; notesLabelSequence++;
    notesActiveCategory = ''; floatingNoteId = ''; floatingNoteDate = ''; floatingNoteCategory = 'life'; floatingComposingId = '';
  }
  if (select && notesActiveCategory !== category) {
    if (category === 'work') notesSelectedLabel = '工作';
    else if (notesSelectedLabel === '工作') notesSelectedLabel = '生活';
    notesActiveCategory = category; notesConfirmDate = ''; notesConfirmEntry = '';
  }
  if (!notesStores.has(category)) {
    const {legacy, entries} = openCategoryNotes(category, next);
    entryIdentities.set(entries, next);
    notesStores.set(category, legacy); entryStores.set(category, entries);
  }
  if (select) { notesStore = notesStores.get(category); entryStore = entryStores.get(category); }
  return notesStores.get(category);
}
async function readMixedNotes(date) {
  const expected = notesIdentityNow();
  ensureDailyNotesStore();
  for (const category of ['life', 'work']) ensureDailyNotesStore(category, false);
  const pairs = ['life', 'work'].map(category => ({category, legacy: notesStores.get(category), entries: entryStores.get(category)}));
  await Promise.all([...pairs.flatMap(({legacy, entries}) => [legacy.read(date), entries.read(date)]), readDailyScore(date, expected)]);
  if (expected !== notesIdentityNow()) return;
  await Promise.all(pairs.map(({category, legacy, entries}) => hydrateNotesDrafts(legacy, entries, category)));
  if (expected === notesIdentityNow() && date === dailyNotesRouteDate()) paintDailyNotesPage();
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
// Keep the last message intact while avoiding doubled sentence punctuation
// where multiple independent read-only warnings are joined.
export function joinNotesErrors(values) {
  const messages = values.filter(Boolean).map(String);
  return messages.map((message, index) => index < messages.length - 1 ? message.replace(/[。；]+$/u, '') : message).join('；');
}
export function paintDailyNotesPage() {
  for (const callback of floatingNoteObservers) callback();
  paintDailyScore();
  if (!notesVisible() || notesRefreshPaused) return;
  const root = document.querySelector('#daily-notes');
  if (!root || !notesStore || !entryStore) return;
  root.querySelector('#notes-today').hidden = notesView !== 'today';
  root.querySelector('#notes-history').hidden = notesView !== 'history';
  root.querySelector('#notes-labels').hidden = notesView !== 'labels';
  for (const button of root.querySelectorAll('[data-notes-view]'))
    button.setAttribute('aria-pressed', String(button.dataset.notesView === notesView));
  const date = dailyNotesRouteDate(), category = dailyNotesRouteCategory(), legacy = notesStore.page(date), current = entryStore.page(date);
  root.querySelector('#notes-label-status').textContent = notesLabelMessage;
  const archivedNames = new Set(notesArchivedLabels.map(row => row.name));
  const activeLabels = [...new Set(['生活', '工作', ...notesLabels])].filter(name => !archivedNames.has(name));
  const paintLabels = (selector, names, action, buttonText) => {
    const list = root.querySelector(selector);
    list.replaceChildren(...names.map(name => {
      const item = document.createElement('li'), text = document.createElement('span'), button = document.createElement('button');
      text.textContent = name; button.type = 'button'; button.className = 'btn text';
      button.dataset.notesAction = action; button.dataset.labelName = name; button.textContent = buttonText;
      button.setAttribute('aria-label', buttonText + '标签 ' + name);
      button.disabled = notesLabelBusy || !notesLabelsVerified;
      item.append(text, button); return item;
    }));
  };
  paintLabels('#notes-label-list', activeLabels, 'delete-label', '删除');
  root.querySelector('[data-notes-action="create-label"]').disabled = notesLabelBusy || !notesLabelsVerified;
  const otherCategory = category === 'life' ? 'work' : 'life';
  const otherStore = entryStores.get(otherCategory), otherLegacy = notesStores.get(otherCategory)?.page(date);
  const otherPage = otherStore?.page(date);
  const mixedStore = {entry: id => entryStore.entry(id) || otherStore?.entry(id)};
  const mixed = {...current, ids: [...current.ids, ...(otherPage?.ids || [])],
    error: joinNotesErrors([current.error, otherPage?.error && (otherCategory === 'work' ? '工作：' : '生活：') + otherPage.error,
      legacy.error && (category === 'work' ? '工作原记录：' : '生活原记录：') + legacy.error,
      otherLegacy?.error && (otherCategory === 'work' ? '工作原记录：' : '生活原记录：') + otherLegacy.error]),
    loading: current.loading || Boolean(otherPage?.loading) || legacy.loading || Boolean(otherLegacy?.loading),
    allLoaded: current.loaded && Boolean(otherPage?.loaded) && legacy.loaded && Boolean(otherLegacy?.loaded) &&
      !current.error && !otherPage?.error && !legacy.error && !otherLegacy?.error};
  mixed.ids.sort((a, b) => {
    const first = mixedStore.entry(a), second = mixedStore.entry(b);
    return String(first?.createdAt || first?.localCreatedAt || '').localeCompare(String(second?.createdAt || second?.localCreatedAt || '')) || 
      a.localeCompare(b);
  });
  const host = root.querySelector('#notes-composer'), view = editorViews.page(category, date), active = view.active;
  const field = active === 'legacy' ? root.querySelector('#notes-editor') : host.querySelector('[data-note-entry-editor="' + active + '"]');
  const selected = editorViews.sync(category, date, mixed.ids.map(id => mixedStore.entry(id)).filter(Boolean), legacy,
    {focused: host.contains(document.activeElement), composing: field?.dataset.composing === 'true'});
  paintNoteEntries(root, mixedStore, mixed, legacy,
    {drafts: retainedDrafts(), confirmId: notesConfirmEntry, active: selected.active, otherLegacy, otherCategory, labels: activeLabels, labelsVerified: 
      notesLabelsVerified});
  if (notesDraftError) {
    const message = root.querySelector('#notes-entry-message');
    message.textContent = notesDraftError; message.hidden = false;
  }
  if (mixed.ids.some(id => mixedStore.entry(id)?.category === 'life' && !mixedStore.entry(id)?.labelKnown)) {
    const message = root.querySelector('#notes-entry-message');
    if (message.hidden) { message.textContent = '部分记录标签尚未核实，请联网读取后查看。'; message.hidden = false; }
  }
  root.querySelector('#notes-delete-confirm').hidden = true;
}
async function readNoteLabels({afterWrite = false} = {}) {
  if (notesLabelBusy && !afterWrite) return false;
  const expected = notesIdentityNow(), sequence = ++notesLabelSequence;
  try {
    const data = await apiNetwork('/note-entries/labels', {headers:{'X-Note-Labels-Version':'3', 'X-Note-Labels-Archive':'1'}});
    if (expected !== notesIdentityNow() || sequence !== notesLabelSequence) return;
    if (data?.labels_version !== 3 || !Array.isArray(data?.labels) || !Array.isArray(data?.archived_labels) ||
        data.labels.some(row => !validCustomNoteLabel(row?.name)) ||
        data.archived_labels.some(row => typeof row?.name !== 'string' ||
          !(row.name === '生活' || row.name === '工作' || validCustomNoteLabel(row.name)) ||
          typeof row.archived_at !== 'string' || !Number.isFinite(Date.parse(row.archived_at))))
      throw new Error('服务器未提供可核实的归档状态。');
    notesLabels = [...new Set(data.labels.map(row => row.name))];
    notesArchivedLabels = [...new Map(data.archived_labels.map(row => [row.name, row])).values()];
    notesLabelsVerified = true; notesLabelMessage = '';
    paintDailyNotesPage(); return true;
  } catch (error) {
    if (expected !== notesIdentityNow() || sequence !== notesLabelSequence) return;
    notesLabelsVerified = false;
    notesLabelMessage = '标签状态读取失败，请联网后重新打开标签管理：' + (error.message || '请稍后重试。');
  }
  paintDailyNotesPage(); return false;
}
function confirmLabelDeletion(name) {
  if (!name || notesLabelBusy || !notesLabelsVerified) return false;
  const builtin = name === '生活' || name === '工作';
  const consequence = builtin
    ? '此标签将从可选列表隐藏，历史记录和标签关联会保留。'
    : '此标签及已有记录中的标签关联将被永久删除，正文保留。此操作无法撤销。';
  return window.confirm('确定删除标签“' + name + '”吗？\n\n' + consequence);
}
async function deleteNoteLabel(name) {
  if (notesLabelBusy || !notesLabelsVerified) return;
  if (!notesArchiveIntent || notesArchiveIntent.name !== name || notesArchiveIntent.action !== 'delete')
    notesArchiveIntent = {name, action:'delete', save_id:crypto.randomUUID()};
  const expected = notesIdentityNow(), intent = notesArchiveIntent, date = dailyNotesRouteDate();
  ++notesLabelSequence; notesLabelBusy = true; notesLabelMessage = ''; paintDailyNotesPage();
  try {
    const saved = await apiNetwork('/note-entries/labels', {method:'POST', body:intent,
      headers:{'X-Note-Labels-Version':'3', 'X-Note-Labels-Archive':'1'}});
    if (expected !== notesIdentityNow()) return;
    if (saved?.labels_version !== 3 || saved.name !== name || saved.deleted !== true ||
        !['deleted','builtin-hidden'].includes(saved.mode)) throw new Error('服务器返回的状态无法核实。');
    ++notesLabelSequence; notesLabelsVerified = false;
    const verified = await readNoteLabels({afterWrite:true});
    if (expected !== notesIdentityNow()) return;
    if (verified) {
      const active = ['生活','工作',...notesLabels].includes(name) && !notesArchivedLabels.some(row => row.name === name);
      if (active) notesLabelMessage = '删除结果已变化，请核对当前标签。';
      else { notesArchiveIntent = null; await readMixedNotes(date); }
    }
  } catch (error) {
    ++notesLabelSequence;
    if (expected === notesIdentityNow()) notesLabelMessage = '删除结果未确认，请重试或重新打开标签管理核实：' + (error.message || '请联网后重试。');
  } finally { notesLabelBusy = false; if (expected === notesIdentityNow()) paintDailyNotesPage(); }
}
async function createNoteLabel(root) {
  if (notesLabelBusy || !notesLabelsVerified) return;
  const input = root.querySelector('#notes-new-label'), label = input.value.trim().normalize('NFC');
  if (!validCustomNoteLabel(label)) { notesLabelMessage = '标签须为 1–32 个字符，且不能叫生活或工作。'; paintDailyNotesPage(); return; }
  if (notesArchivedLabels.some(row => row.name === label)) { notesLabelMessage = '该标签名称暂不可用。'; paintDailyNotesPage(); return; }
  if (!notesLabelIntent || notesLabelIntent.name !== label) notesLabelIntent = {name:label, save_id:crypto.randomUUID()};
  const expected = notesIdentityNow(), intent = notesLabelIntent; ++notesLabelSequence; notesLabelBusy = true; notesLabelMessage = '正在添加标签…'; 
    paintDailyNotesPage();
  try {
    const saved = await apiNetwork('/note-entries/labels', {method:'POST', body:intent, headers:{'X-Note-Labels-Version':'2'}});
    if (expected !== notesIdentityNow()) return;
    if (saved?.labels_version !== 2 || saved.name !== label) throw new Error('标签保存结果尚未核实，请重试原请求。');
    notesLabels = [...new Set([...notesLabels, label])]; notesLabelIntent = null;
    notesLabelMessage = ''; input.value = '';
  } catch (error) {
    if (expected === notesIdentityNow()) notesLabelMessage = '添加失败，输入已保留，可重试：' + (error.message || '请联网后重试。');
  } finally { notesLabelBusy = false; if (expected === notesIdentityNow()) paintDailyNotesPage(); }
}
// The last seven days up to the viewed date, drawn as a wordless sparkline. Unscored days break the line.
let scoreTrend = new Map(), scoreTrendMonths = new Set(), scoreOpen = false;
const scoreDayBefore = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') - days * 86400000).toISOString().slice(0, 10);
function scoreTrendSvg(date) {
  const days = Array.from({length:7}, (_, index) => scoreDayBefore(date, 6 - index));
  const points = days.map((day, index) => scoreTrend.has(day) ? {x:6 + index * 12, y:21 - (scoreTrend.get(day) - 1) * 2, day} : null);
  if (points.filter(Boolean).length < 2) return '';
  let lines = '';
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1], to = points[index];
    if (from && to) lines += '<line x1="' + from.x + '" y1="' + from.y + '" x2="' + to.x + '" y2="' + to.y + '"/>';
  }
  const dots = points.filter(Boolean).map(point => '<circle cx="' + point.x + '" cy="' + point.y + '" r="' + (point.day === date ? 3 : 2) + '"/>').join('');
  const spoken = days.filter(day => scoreTrend.has(day)).map(day => day.slice(5) + ' ' + scoreTrend.get(day) + ' 分').join('，');
  return '<svg width="84" height="24" viewBox="0 0 84 24" role="img" aria-label="近 7 天打分：' + spoken + '">' + lines + dots + '</svg>';
}
async function readScoreTrend(date, expected = notesIdentityNow()) {
  const months = [...new Set([date.slice(0, 7), scoreDayBefore(date, 6).slice(0, 7)])].filter(month => !scoreTrendMonths.has(month));
  try {
    for (const month of months) {
      const data = await api('/daily-scores?month=' + encodeURIComponent(month));
      if (expected !== notesIdentityNow()) return;
      for (const item of data.items || []) scoreTrend.set(item.date, item.score);
      scoreTrendMonths.add(month);
    }
  } catch { /* The trend is decoration; scoring still works without it. */ }
  if (expected === notesIdentityNow() && date === dailyNotesRouteDate()) paintDailyScore();
}
function paintDailyScore() {
  const root = document.querySelector('#daily-score');
  if (!root) return;
  const date = scoreRecord.date || dailyNotesRouteDate();
  const label = root.querySelector('#daily-score-label');
  if (label) label.textContent = date === dailyNotesToday() ? '今日打分' : date + ' 打分';
  const scored = scoreRecord.score != null, open = !scored || scoreOpen || scoreRecord.pending != null;
  root.classList.toggle('is-open', open);
  const chip = root.querySelector('#daily-score-chip');
  if (chip) {
    chip.hidden = !scored;
    chip.textContent = (date === dailyNotesToday() ? '今日 ' : date.slice(5) + ' ') + scoreRecord.score + ' 分';
    chip.setAttribute('aria-expanded', String(open));
    chip.setAttribute('aria-label', chip.textContent + (scoreRecord.canEdit === false ? '' : '，点击修改'));
    chip.disabled = scoreRecord.canEdit === false;
  }
  const trend = root.querySelector('#daily-score-trend');
  if (trend) { if (scored) scoreTrend.set(date, scoreRecord.score); trend.innerHTML = scoreTrendSvg(date); }
  for (const button of root.querySelectorAll('[data-daily-score]')) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.dailyScore) === scoreRecord.score));
    button.disabled = scoreRecord.canEdit === false || scoreRecord.pending != null;
  }
  const status = root.querySelector('#daily-score-status');
  if (status) status.textContent = scoreRecord.status === '已保存' ? '' : scoreRecord.status || '';
}
async function readDailyScore(date, expected = notesIdentityNow()) {
  try {
    const data = await api('/daily-scores?date=' + encodeURIComponent(date));
    if (expected !== notesIdentityNow() || date !== dailyNotesRouteDate()) return;
    scoreRecord = {date, score:data.score ?? null, version:data.version || 0, status:'', saveId:'', pending:null, canEdit:data.can_edit !== false};
    scoreOpen = false;
    if (data.score != null) scoreByDate.set(date, data.score); else scoreTrend.delete(date);
    void readScoreTrend(date, expected);
  } catch (error) {
    if (expected === notesIdentityNow()) scoreRecord = {date, score:null, version:0, status:error.message || '打分读取失败', saveId:'', pending:null, canEdit:false};
  }
  paintDailyScore();
}
async function saveDailyScore(date, score) {
  if (!Number.isInteger(score) || score < 1 || score > 10 || scoreRecord.canEdit === false) return;
  const current = scoreRecord.date === date ? scoreRecord : {date, score:null, version:0, saveId:'', canEdit:true};
  const saveId = current.pending === score && current.saveId ? current.saveId : crypto.randomUUID();
  scoreRecord = {...current, date, status:'保存中…', saveId, pending:score};
  paintDailyScore();
  const expected = notesIdentityNow();
  try {
    const saved = await api('/daily-scores/' + date, {method:'PUT', body:{score, version:current.version || 0, save_id:saveId}});
    if (expected !== notesIdentityNow()) return;
    scoreRecord = {date, score:saved.score, version:saved.version, status:'已保存', saveId:'', pending:null, canEdit:saved.can_edit !== false};
    scoreByDate.set(date, saved.score); scoreOpen = false;
  } catch (error) {
    if (expected !== notesIdentityNow()) return;
    if (error.status === 409) await readDailyScore(date, expected);
    if (expected !== notesIdentityNow()) return;
    scoreRecord = {...scoreRecord, status:error.message || '保存失败，可再点一次', pending:null, saveId};
  }
  paintDailyScore();
}
function monthTime(value) {
  return value && Number.isFinite(Date.parse(value)) ?
    new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value)) : '';
}
function monthOptions(select, values, current, allLabel) {
  select.replaceChildren(...values.map(value => {
    const option=document.createElement('option'); option.value=value; option.textContent=value || allLabel; return option;
  }));
  select.value = values.includes(current) ? current : '';
}
function makeMonthCard(date, items, selected) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'notes-calendar-day';
  if (!date) { button.disabled = true; button.classList.add('is-empty'); return button; }
  const score = scoreByDate.get(date);
  button.dataset.notesHistoryDay = date; button.setAttribute('aria-pressed', String(date === selected));
  button.setAttribute('aria-label', date + '，' + items.length + ' 条记录' + (score ? '，' + score + ' 分' : ''));
  const heading = document.createElement('span'); heading.className = 'notes-calendar-day-heading';
  heading.textContent = String(Number(date.slice(8))); button.append(heading);
  if (score) { const mark = document.createElement('span'); mark.className = 'notes-score-mark'; mark.textContent = score + '分'; button.append(mark); }
  return button;
}
function paintHistoryRows(root) {
  const label = root.querySelector('#notes-history-label').value, weekValue = root.querySelector('#notes-history-week').value;
  const weeks = noteMonthWeeks(historyMonth), selected = root.querySelector('#notes-history-date').value;
  historyDate = selected;
  const grid = root.querySelector('#notes-history-grid'), list = root.querySelector('#notes-history-list');
  const shown = item => !label || (item.displayLabels || [item.displayLabel]).includes(label);
  const visibleWeeks = weeks.filter((_, index) => !weekValue || Number(weekValue) === index + 1);
  grid.replaceChildren(...visibleWeeks.flatMap(week => week.map(date =>
    makeMonthCard(date, (historyDays.get(date) || []).filter(shown), selected))));
  const timeline = root.dataset.historyDisplay === 'timeline';
  root.querySelector('.notes-calendar-weekdays').hidden = timeline; grid.hidden = timeline;
  const order = root.dataset.historyOrder === 'asc' ? 'asc' : 'desc';
  const orderButton = root.querySelector('[data-history-order]');
  orderButton.hidden = !timeline;
  orderButton.dataset.historyOrder = order;
  orderButton.textContent = order === 'asc' ? '时间：从旧到新' : '时间：从新到旧';
  const card = row => {
    const article = document.createElement('article'); article.className = 'note-entry note-entry-saved';
    const heading = document.createElement('div'); heading.className = 'note-entry-head';
    heading.textContent = [row.displayLabel, monthTime(row.updated_at)].filter(Boolean).join(' · ');
    const text = document.createElement('div'); text.className = 'note-entry-reader'; text.textContent = row.text;
    article.append(heading, text); return article;
  };
  let rows;
  if (timeline) {
    const direction = order === 'asc' ? 1 : -1;
    const groups = [...historyDays.entries()].sort(([a], [b]) => direction * a.localeCompare(b))
      .map(([date, items]) => [date, items.filter(shown).sort((a, b) =>
        direction * String(a.updated_at || '').localeCompare(String(b.updated_at || '')))])
      .filter(([, items]) => items.length);
    rows = groups.flatMap(([, items]) => items);
    list.replaceChildren(...groups.map(([date, items]) => {
      const section = document.createElement('section'); section.className = 'notes-timeline-day';
      const heading = document.createElement('h3'); heading.className = 'notes-timeline-date';
      heading.textContent = date + (scoreByDate.get(date) ? ' · ' + scoreByDate.get(date) + '分' : '');
      section.append(heading, ...items.map(card)); return section;
    }));
  } else {
    rows = (historyDays.get(selected) || []).filter(shown);
    const dayScore = scoreByDate.get(selected);
    const scoreLine = dayScore ? Object.assign(document.createElement('p'), {className:'notes-score-mark', textContent:selected + ' 打分 ' + dayScore}) : null;
    list.replaceChildren(...[scoreLine, ...rows.map(card)].filter(Boolean));
  }
  const total = [...historyDays.values()].flat().filter(shown).length;
  root.querySelector('#notes-history-summary').textContent = historyMonth + ' · ' + total + ' 条已同步记录';
  root.querySelector('#notes-history-status').textContent = rows.length ? '待同步内容请在原日期查看。' :
    !total && !label ? '本月没有已同步记录。' : '所选日期没有符合条件的已同步记录。';
}
function applyHistoryMonth(root, month, days, chosenDate) {
  const weeks = noteMonthWeeks(month), dates = weeks.flat().filter(Boolean);
  const dateSelect = root.querySelector('#notes-history-date'), labelSelect = root.querySelector('#notes-history-label');
  const oldLabel = labelSelect.value, oldDate = dateSelect.value;
  const selected = dates.includes(chosenDate) ? chosenDate : dates.includes(oldDate) ? oldDate : dates[0];
  historyMonth = month; historyDays = days;
  root.dataset.historyLoadedMonth = month;
  root.querySelector('#notes-history-month').value = month;
  monthOptions(dateSelect, dates, selected, '');
  monthOptions(root.querySelector('#notes-history-week'), ['', ...weeks.map((_, index) => String(index + 1))], '', '全部周次');
  const labels = ['', ...new Set(['生活','工作', ...[...days.values()].flat().flatMap(row => row.displayLabels || [row.displayLabel])])];
  monthOptions(labelSelect, labels, oldLabel, '全部标签');
  paintHistoryRows(root);
}
async function loadHistory(month = '', chosenDate = '') {
  const root = document.querySelector('#daily-notes'), expected = notesIdentityNow();
  if (!root) return;
  const target = month || historyMonth || dailyNotesToday().slice(0, 7);
  if (coalesceNoteMonthFlight(historyActiveLoad, {root, target, expected, sequence:historySequence, chosenDate})) return;
  const sequence = ++historySequence; historyActiveLoad = {root, target, expected, sequence, chosenDate};
  const active = () => notesVisible() && notesView === 'history' && sequence === historySequence && expected === notesIdentityNow();
  const status = root.querySelector('#notes-history-status'); status.textContent = '';
  try {
    const value = await apiNetwork('/note-entries/month?month=' + encodeURIComponent(target),
      {headers:{'X-Note-Labels-Version':'3'}});
    const days = checkedNoteMonth(value, target); if (!active()) return;
    try {
      const scored = await api('/daily-scores?month=' + encodeURIComponent(target));
      if (active() && scored?.month === target && Array.isArray(scored.items))
        scoreByDate = new Map(scored.items.map(item => [item.date, item.score]));
    } catch { /* 月份分数缺失时仍显示碎碎念。 */ }
    if (!active()) return;
    applyHistoryMonth(root, target, days, historyActiveLoad.chosenDate || historyDate || dailyNotesRouteDate());
  } catch (error) {
    if (!active()) return;
    status.textContent = '月记录读取失败，保留当前内容：' + (error.message || '请联网重试。');
    if (historyMonth) root.querySelector('#notes-history-month').value = historyMonth;
  } finally { if (historyActiveLoad?.sequence === sequence) historyActiveLoad = null; }
}
async function selectDailyNotesDate(value) {
  if (!validDailyNotesDate(value) || value > dailyNotesToday()) return;
  ensureDailyNotesStore(); notesConfirmDate = ''; notesConfirmEntry = ''; setDailyNotesRouteDate(value); updateRoute(true);
  paintDailyNotesPage(); await readMixedNotes(value);
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
  document.addEventListener('change', async event => {
    if (notesVisible() && event.target.dataset.noteLabel) {
      const itemId = event.target.dataset.noteLabel, source = [...entryStores.values()].find(store => store.entry(itemId));
      const selected = [...event.target.closest('.note-entry-label-options').querySelectorAll('input:checked')].map(input => input.value);
      if (!source?.relabelDraft(itemId, selected)) paintDailyNotesPage();
    } else if (notesVisible() && event.target.id === 'notes-date') void selectDailyNotesDate(event.target.value);
    else if (notesVisible() && event.target.id === 'notes-history-date') {
      const root = event.target.closest('#daily-notes'), week = root.querySelector('#notes-history-week');
      if (week.value && !noteMonthWeeks(historyMonth)[Number(week.value) - 1]?.includes(event.target.value)) week.value = '';
      paintHistoryRows(root);
    } else if (notesVisible() && event.target.id === 'notes-history-week') {
      const root = event.target.closest('#daily-notes'), week = Number(event.target.value);
      const date = root.querySelector('#notes-history-date'), dates = noteMonthWeeks(historyMonth)[week - 1];
      if (dates && !dates.includes(date.value)) date.value = dates.find(Boolean);
      paintHistoryRows(root);
    } else if (notesVisible() && event.target.id === 'notes-history-label') paintHistoryRows(event.target.closest('#daily-notes'));
    else if (notesVisible() && event.target.id === 'notes-history-month' && validNoteMonth(event.target.value)) void loadHistory(event.target.value);

  });
}
async function handleEntryAction(target, entries) {
  const id = target.closest('[data-note-entry]')?.dataset.noteEntry, item = entries.entry(id);
  if (!item) return;
  const action = target.dataset.noteEntryAction;
  if (action === 'edit') openEditor(id);
  else if (action === 'save') {
    const attempt = Symbol('note-send'); item.manualSubmitted = attempt;
    const category = dailyNotesRouteCategory(), date = dailyNotesRouteDate();
    const revision = editorViews.page(category, date).revision;
    await entries.save(id);
    if (!item.dirty && !item.pending && ['saved', 'queued', 'cached'].includes(item.phase)) {
      editorViews.requestCollapse(category, date, id, revision, {explicit:true});
    }
    paintDailyNotesPage();
  }
  else if (action === 'restore') await entries.restoreEntry(id);
  else if (action === 'delete') { notesConfirmEntry = id; paintDailyNotesPage(); }
  else if (action === 'cancel-delete') { notesConfirmEntry = ''; paintDailyNotesPage(); }
  else if (action === 'confirm-delete') {
    const view = editorViews.page(item.category, item.date), revision = view.revision;
    notesConfirmEntry = ''; await entries.deleteEntry(id);
    if ((!entries.entry(id) || entries.entry(id).deleted && !entries.entry(id).pending) && view.active === id && view.revision === revision)
      editorViews.activate(item.category, item.date, '');
    paintDailyNotesPage();
  }
  else if (action === 'check') { if (item.phase === 'unknown') await entries.reconcile(id); else await entries.readOne(id); }
  else if (action === 'retry') await entries.retryPending(id);
  else if (action === 'use-server') entries.useServer(id);
  else if (action === 'use-draft') await entries.useDraft(id);
}
async function handleNotesClick(event) {
  if (!notesVisible() || notesRefreshPaused) return;
  const root = document.querySelector('#daily-notes');
  const target = event.target.closest('[data-notes-action],[data-notes-date],[data-notes-category],' +
    '[data-note-entry-action],[data-notes-view],[data-notes-month],[data-notes-history-day],[data-history-display],' +
    '[data-history-order],[data-daily-score],[data-daily-score-toggle]');
  if (target?.matches('[data-daily-score-toggle]')) { scoreOpen = !scoreOpen; paintDailyScore(); return; }
  if (!target || !root?.contains(target)) return;
  event.preventDefault();
  if (target.dataset.dailyScore) { await saveDailyScore(dailyNotesRouteDate(), Number(target.dataset.dailyScore)); return; }
  if (target.dataset.historyOrder) {
    root.dataset.historyOrder = target.dataset.historyOrder === 'asc' ? 'desc' : 'asc';
    if (historyMonth) paintHistoryRows(root); return;
  }
  if (target.dataset.historyDisplay) {
    root.dataset.historyDisplay = target.dataset.historyDisplay;
    for (const button of root.querySelectorAll('[data-history-display]')) button.setAttribute('aria-pressed', String(button === target));
    if (historyMonth) paintHistoryRows(root); return;
  }
  if (target.dataset.notesMonth) {
    const month = historyMonth || dailyNotesToday().slice(0, 7);
    await loadHistory(shiftNoteMonth(month, target.dataset.notesMonth === 'prev' ? -1 : 1)); return;
  }
  if (target.dataset.notesHistoryDay) {
    root.querySelector('#notes-history-date').value = target.dataset.notesHistoryDay; paintHistoryRows(root); return;
  }
  if (target.dataset.notesView) {
    notesView = ['history', 'labels'].includes(target.dataset.notesView) ? target.dataset.notesView : 'today'; historySequence++;
    paintDailyNotesPage(); if (notesView === 'history') await loadHistory();
    else if (notesView === 'labels') await readNoteLabels(); return;
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
  if (target.dataset.noteEntryAction) {
    const id = target.closest('[data-note-entry]')?.dataset.noteEntry;
    const owner = [...entryStores.values()].find(candidate => candidate.entry(id));
    if (owner) await handleEntryAction(target, owner);
    return;
  }
  if (target.dataset.notesAction === 'edit-other-legacy') {
    const category = target.dataset.legacyCategory;
    if (!['life', 'work'].includes(category)) return;
    notesSelectedLabel = category === 'work' ? '工作' : '生活';
    setDailyNotesRouteCategory(category); updateRoute(true); ensureDailyNotesStore();
    root.dataset.category = category; openEditor('legacy'); return;
  }
  if (target.dataset.notesAction === 'export-other-legacy') {
    const category = target.dataset.legacyCategory;
    if (['life', 'work'].includes(category)) exportLegacyDraft(notesStores.get(category).page(date), category);
    return;
  }
  const action = target.dataset.notesAction;
  if (action === 'new') {
    const item = entries.start(date); if (item) openEditor(item.id); }
  else if (action === 'create-label') await createNoteLabel(root);
  else if (action === 'delete-label' && confirmLabelDeletion(target.dataset.labelName)) await deleteNoteLabel(target.dataset.labelName);
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
    getComposing: id => floatingComposingId === id ||
      document.querySelector('[data-note-entry-editor="' + id + '"]')?.dataset.composing === 'true'}));
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
      if (notesVisible()) for (const entries of entryStores.values())
        if (hydrationReady.has(entries)) void entries.read(dailyNotesRouteDate(), {localOnly: true});
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
  ensureDailyNotesStore();
  const date = dailyNotesRouteDate(), expected = notesIdentityNow();
  void readNoteLabels();
  await readMixedNotes(date);
  if (expected !== notesIdentityNow()) return;
  const historyRoot = document.querySelector('#daily-notes');
  if (notesView === 'history' && (!historyMonth || historyRoot?.dataset.historyLoadedMonth !== historyMonth))
    void loadHistory(historyMonth, historyDate);
}

// Floating composition shares the same entry store and draft journal as the main page.
export function selectedFloatingEntry(store, id, date) {
  const item = id && store?.entry(id);
  return item && item.date === date && !item.deleted ? item : null;
}
export function floatingNotesSnapshot() {
  if (notesIdentity !== notesIdentityNow()) return null;
  const date = dailyNotesToday(), store = entryStores.get(floatingNoteCategory), page = entryStores.get('life')?.page(date);
  const item = selectedFloatingEntry(store, floatingNoteId, floatingNoteDate);
  const entries = [], errors = [];
  for (const category of ['life','work']) {
    const source = entryStores.get(category), current = source?.page(date);
    if (current?.error) errors.push(current.error);
    for (const id of current?.ids || []) {
      const value = source.entry(id);
      if (value && !value.deleted && (value.version || value.localVersion || value.dirty || value.pending)) entries.push(value);
    }
    const legacy = notesStores.get(category)?.page(date);
    if (legacy?.error) errors.push(legacy.error);
    if (legacy && (!legacy.deleted || legacy.dirty || legacy.pending) && (legacy.version || legacy.dirty || legacy.pending))
      entries.push({id:'legacy-'+category,category,
      legacy:true, draft:legacy.dirty ? legacy.draft : legacy.serverText, updatedAt:legacy.updatedAt});
  }
  entries.sort((a,b) => String(a.createdAt || a.localCreatedAt || a.updatedAt || '').localeCompare(
    String(b.createdAt || b.localCreatedAt || b.updatedAt || '')));
  const archived = new Set(notesArchivedLabels.map(row => row.name));
  return {date, page, item, entries, error:errors.join('；'), labels:[...new Set(['生活','工作',...notesLabels])].filter(name => !archived.has(name)),
    labelsVerified:notesLabelsVerified, labelError:notesLabelMessage, draftError:notesDraftError};
}
export async function loadFloatingNotes() {
  if (!state.me) return;
  registerDailyNotesEvents(); ensureDailyNotesStore();
  const date = dailyNotesToday(), expected = notesIdentityNow();
  void readNoteLabels();
  await readMixedNotes(date);
  if (expected === notesIdentityNow()) { floatingNoteEntry(false); paintDailyNotesPage(); }
}
function floatingNoteEntry(create = false) {
  if (!state.me || notesIdentity !== notesIdentityNow() || notesRefreshPaused) return null;
  const date = dailyNotesToday(), store = entryStores.get(floatingNoteCategory);
  if (!store) return null;
  const selected = selectedFloatingEntry(store, floatingNoteId, floatingNoteDate);
  if (selected) return selected;
  const page = store.page(date);
  const candidate = page.ids.map(id => store.entry(id)).find(item => item && !item.version && !item.localVersion &&
    (item.dirty || item.pending || ['unknown','conflict','error','oversize'].includes(item.phase)));
  const item = candidate || (create ? store.start(date) : null);
  if (item) { floatingNoteId = item.id; floatingNoteDate = date; }
  return item;
}
export function hasFloatingNoteDraft() {
  return retainedDrafts().some(item => item.dirty || item.pending || item.phase === 'unknown');
}
export function selectFloatingNote(id, category) {
  if (!['life','work'].includes(category) || notesIdentity !== notesIdentityNow()) return;
  const item = entryStores.get(category)?.entry(id);
  if (!item || item.date !== dailyNotesToday() || item.deleted) return;
  floatingNoteId = id; floatingNoteDate = item.date; floatingNoteCategory = category; paintDailyNotesPage();
}
export function newFloatingNote() {
  floatingNoteId = ''; floatingNoteDate = ''; floatingNoteCategory = 'life';
  floatingNoteEntry(true); paintDailyNotesPage();
}
export function markFloatingNoteComposing(value) {
  floatingComposingId = value ? floatingNoteId : '';
}
export function editFloatingNote(text, composing = false) {
  const item = floatingNoteEntry(true);
  if (item) entryStores.get(item.category).edit(item.id, text, {composing});
}
export function labelFloatingNote(labels) {
  const item = floatingNoteEntry(true);
  if (!item || !notesLabelsVerified) return false;
  return entryStores.get(item.category).relabelDraft(item.id, labels);
}
export async function sendFloatingNote() {
  const item = floatingNoteEntry(false), store = item && entryStores.get(item.category);
  if (!item || !store || item.date !== dailyNotesToday()) return;
  const selectedId = floatingNoteId, selectedDate = floatingNoteDate, selectedCategory = floatingNoteCategory;
  item.manualSubmitted = Symbol('note-send');
  await store.save(item.id);
  if (floatingNoteId === selectedId && floatingNoteDate === selectedDate && floatingNoteCategory === selectedCategory &&
      !item.dirty && !item.pending && ['saved','queued','cached'].includes(item.phase)) {
    floatingNoteId = ''; floatingNoteDate = ''; floatingNoteCategory = 'life';
  }
  paintDailyNotesPage();
}
export async function checkFloatingNote(retry = false) {
  const item = floatingNoteEntry(false), store = item && entryStores.get(item.category);
  if (!item || !store) return;
  if (retry) await store.retryPending(item.id); else if (item.phase === 'unknown') await store.reconcile(item.id);
  paintDailyNotesPage();
}
