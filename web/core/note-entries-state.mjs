import {DAILY_NOTES_MAX_BYTES, dailyNotesBytes, validDailyNotesDate} from './daily-notes-state.mjs';
import {documentState, documentValue, isLocalDocument} from '../offline/document.mjs';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const blocked = item => ['conflict', 'unknown'].includes(item.phase);
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const noteValue = value => isLocalDocument(value) ? documentValue(value) : value;
const persistedVersion = item => item.localBacked ? item.localVersion : item.version;
const savedText = item => item.localBacked ? item.durableText : item.serverText;
const savedPhase = item => item.localBacked ? item.localQueued ? 'queued' : 'cached' : item.version ? 'saved' : 'empty';
const labelsOf = value => Array.isArray(value?.labels) ? value.labels : value?.label ? [value.label] : [];
const equalLabels = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const validLabels = (labels, category) => Array.isArray(labels) && (category === 'life' || labels.length === 0) && labels.every(validCustomNoteLabel) && new Set(labels).size === labels.length;
const localFailure = error => error.localNotSaved === true || /^OFFLINE_(?:STORAGE|CACHE|INVALID|SCOPE)/.test(error.code || '');
export function validCustomNoteLabel(value) {
  return typeof value === 'string' && value.isWellFormed() && value === value.trim().normalize('NFC') &&
    [...value].length >= 1 && [...value].length <= 32 && !/[\u0000-\u001f\u007f]/.test(value) &&
    !['生活', '工作'].includes(value);
}
function checkedLocalDocument(value, category, date, id) {
  const {local, server} = documentState(value);
  if (!local || !uuidPattern.test(local.id) || id && local.id !== id || local.category !== category || local.date !== date ||
      typeof local.text !== 'string' || dailyNotesBytes(local.text) > DAILY_NOTES_MAX_BYTES ||
      !Number.isSafeInteger(local.version) || local.version < 1 || typeof local.deleted !== 'boolean' ||
      typeof local.can_edit !== 'boolean' || local.label != null &&
      (category !== 'life' || !validCustomNoteLabel(local.label))) throw new Error('本机记录读取不完整，草稿已保留。');
  if (server) checkedEntry(server, category, date, local.id);
  return value;
}
function checkedEntry(value, category, date, id) {
  if (isLocalDocument(value)) return checkedLocalDocument(value, category, date, id);
  if (!value || !uuidPattern.test(value.id) || id && value.id !== id || value.category !== category ||
      value.date !== date || typeof value.text !== 'string' || dailyNotesBytes(value.text) > DAILY_NOTES_MAX_BYTES ||
      !Number.isSafeInteger(value.version) || value.version < 1 || typeof value.deleted !== 'boolean' ||
      typeof value.can_edit !== 'boolean' || !timestamp(value.created_at) || !timestamp(value.updated_at) ||
      typeof value.content_hash !== 'string' || !value.content_hash || value.labels_version === 2 && !Array.isArray(value.labels) || value.labels !== undefined && !validLabels(value.labels, category) || value.label != null &&
      (category !== 'life' || !validCustomNoteLabel(value.label))) {
    throw new Error('记录读取不完整，请重新核对。');
  }
  return value;
}
function checkedCollection(value, category, date) {
  if (!value || value.category !== category || value.date !== date || !Array.isArray(value.entries) ||
      value.entries.length > 200 || typeof value.can_edit !== 'boolean') throw new Error('记录列表不完整，请重新读取。');
  const ids = new Set();
  for (const raw of value.entries) {
    checkedEntry(raw, category, date);
    const entry = noteValue(raw);
    if (entry.deleted || ids.has(entry.id)) throw new Error('记录列表不完整，请重新读取。');
    ids.add(entry.id);
  }
  return value;
}

// A store belongs to one identity and category. A composer captures its day at creation;
// neither navigation nor midnight can change the destination of an in-flight write.
function createEntriesContext({category, load, loadEntry, loadOperation, put, remove, restore,
  onChange = () => {}, onSaved = () => {}, uuid = () => crypto.randomUUID(),
  setTimer = setTimeout, clearTimer = clearTimeout, delay = 400, manualSave = false, multiLabels = false}) {
  if (!['life', 'work'].includes(category)) throw new Error('请选择有效分类。');
  const pages = new Map(), entries = new Map();
  const context = {category, pages, entries, multiLabels, disposed: false,
    options: {load, loadEntry, loadOperation, put, remove, restore, onSaved, uuid}};
  const emit = () => { if (!context.disposed) onChange(); };
  const page = date => {
    if (!validDailyNotesDate(date)) throw new Error('请选择有效日期。');
    if (!pages.has(date)) pages.set(date, {category, date, ids: [], loaded: false, loading: false,
      canEdit: false, error: '', sequence: 0, composerId: ''});
    return pages.get(date);
  };
  const entry = id => entries.get(id);
  const stopTimer = item => { if (item.timer !== null) clearTimer(item.timer); item.timer = null; };
  function makeEntry(id, date, canEdit) {
    return {id, category, date, loaded: true, loading: false, canEdit, serverText: '', draft: '',
      version: 0, createdAt: null, updatedAt: null, contentHash: '', label: '', labels: [], serverLabels: [], labelKnown: false, labelComplete: false, deleted: false, dirty: false,
      phase: 'empty', error: '', remote: null, pending: null, timer: null, sequence: 0,
      writeEpoch: 0, composing: false, localVersion: 0, durableText: '', localBacked: false, localQueued: false,
      localOperation: null, localConflict: null, localCreatedAt: null, localUpdatedAt: null};
  }
  function adopt(item, value, preserve = false) {
    if (isLocalDocument(value)) return context.adoptLocal(item, value, preserve);
    item.canEdit = value.can_edit;
    item.serverText = value.deleted ? '' : value.text;
    item.version = value.version; item.createdAt = value.created_at; item.updatedAt = value.updated_at;
    item.labelComplete = value.labels_version === 2 && Array.isArray(value.labels);
    item.serverLabels = labelsOf(value); if (!preserve) item.labels = [...item.serverLabels];
    item.label = item.labels[0] || ''; item.labelKnown = category === 'work' || value.labels_version === 2 && Array.isArray(value.labels) || value.labels_version === 1 && Object.hasOwn(value, 'label');
    item.contentHash = value.content_hash; item.deleted = value.deleted;
    item.localVersion = value.version; item.durableText = item.serverText; item.localBacked = false; item.localQueued = false;
    item.localOperation = null; item.localConflict = null; item.localCreatedAt = null; item.localUpdatedAt = null;
    if (!preserve) item.draft = item.serverText;
    item.dirty = item.draft !== item.serverText || !equalLabels(item.labels, item.serverLabels); item.loaded = true;
  }
  function schedule(item) {
    stopTimer(item);
    if (!manualSave && !context.disposed && !context.autosavePaused && item.canEdit && item.dirty && !item.pending && !item.loading && !item.composing &&
        !blocked(item) && !['error', 'oversize'].includes(item.phase) && (persistedVersion(item) > 0 || item.draft.trim())) {
      item.timer = setTimer(() => { item.timer = null; void context.save(item.id); }, delay);
    }
  }
  function merge(item, value) {
    if (isLocalDocument(value)) return context.mergeLocal(item, value);
    if (item.localBacked && !item.localConflict && value.version < item.localVersion) return;
    if (item.localQueued && !item.localConflict &&
        (value.deleted !== item.deleted || !value.deleted && (value.text !== item.durableText || (value.label || '') !== item.label))) {
      item.remote = value; return;
    }
    if (item.localBacked && (!blocked(item) || item.localConflict)) {
      const retainedConflictDraft = Boolean(item.localConflict && item.dirty);
      item.writeEpoch++; adopt(item, value, item.dirty); item.remote = null;
      item.phase = retainedConflictDraft ? 'error' : item.dirty ? 'dirty' : 'saved';
      item.error = retainedConflictDraft ? '已采用线上版本，后续未提交草稿仍保留；请核对后手动保存。' : ''; return;
    }
    if (value.version < Math.max(item.version, item.remote?.version || 0)) return;
    item.writeEpoch++;
    item.canEdit = value.can_edit;
    if (blocked(item)) item.remote = value;
    else if (item.dirty && value.version !== item.version) {
      item.remote = value; item.phase = 'conflict';
      item.error = '这条记录已有新版本，草稿已保留，请核对。'; stopTimer(item);
    } else {
      adopt(item, value, item.dirty); item.phase = item.dirty ? 'dirty' : 'saved'; item.error = '';
    }
  }
  function dispose() { context.disposed = true; for (const item of entries.values()) stopTimer(item); }
  Object.assign(context, {page, entry, emit, stopTimer, adopt, schedule, merge, makeEntry, dispose});
  return context;
}

function createEntryLocalActions(context) {
  const {adopt, stopTimer} = context;
  function adoptLocal(item, value, preserve = false) {
    const {local, server, operation, conflict} = documentState(value), draft = item.draft;
    if (server && server.version >= item.version) adopt(item, server, true);
    item.localVersion = local.version; item.durableText = local.deleted ? '' : local.text;
    item.labelComplete = false; item.labels = labelsOf(local); item.serverLabels = [...item.labels]; item.label = item.labels[0] || ''; item.labelKnown = item.category === 'work' || local.labels_version === 1 && Object.hasOwn(local, 'label');
    item.localBacked = true; item.localQueued = Boolean(operation); item.localOperation = operation; item.localConflict = conflict;
    item.localCreatedAt = local.created_at || null; item.localUpdatedAt = local.updated_at || null;
    item.canEdit = local.can_edit; item.deleted = local.deleted; item.loaded = true;
    item.draft = preserve ? draft : item.durableText; item.dirty = item.draft !== item.durableText;
    if (conflict) {
      let remote = null;
      try { if (conflict.remote) remote = checkedEntry(conflict.remote, item.category, item.date, item.id); } catch {}
      item.remote = remote; item.phase = 'conflict'; item.error = '本机与线上内容均已保留，请从顶部同步状态处理冲突。'; stopTimer(item);
    } else {
      item.remote = null; item.phase = item.dirty ? 'dirty' : savedPhase(item); item.error = '';
    }
  }
  function mergeLocal(item, value) {
    const {local, operation, conflict, server} = documentState(value);
    if (local.version < persistedVersion(item) || item.pending) return;
    if (item.localQueued && !operation && !conflict) {
      if (server) context.merge(item, server);
      return;
    }
    item.writeEpoch++; adoptLocal(item, value, item.dirty || item.composing);
  }
  return {adoptLocal, mergeLocal};
}

function createEntryReadingActions(context) {
  const {category, page, entry, entries, emit, adopt, merge, schedule, makeEntry} = context;
  const {load, loadEntry} = context.options;
  async function read(date, options = {}) {
    const current = page(date), sequence = ++current.sequence;
    const epochs = new Map(current.ids.map(id => [id, entry(id)?.writeEpoch]));
    current.loading = true; current.error = ''; emit();
    try {
      const value = checkedCollection(await load(date, options), category, date);
      if (context.disposed || sequence !== current.sequence) return;
      current.canEdit = value.can_edit; current.labelsComplete = value.labels_version === 2;
      const found = new Set();
      for (const raw of value.entries) {
        const visible = noteValue(raw);
        found.add(visible.id);
        let item = entry(visible.id);
        if (!item) {
          item = makeEntry(visible.id, date, visible.can_edit); entries.set(visible.id, item); adopt(item, raw);
          if (!isLocalDocument(raw)) item.phase = 'saved';
        }
        else if (!item.pending && item.writeEpoch === epochs.get(item.id)) merge(item, raw);
      }
      const retained = current.ids.filter(id => {
        const item = entry(id);
        return found.has(id) || item.version === 0 || item.dirty || item.pending || item.deleted || item.localBacked ||
          blocked(item) || item.writeEpoch !== epochs.get(id);
      });
      current.ids = [...new Set([...retained, ...value.entries.map(raw => noteValue(raw).id)])];
      current.loaded = true;
      // A dirty entry missing from a complete live list may have been deleted elsewhere.
      // Fetch its tombstone without discarding the local text.
      await Promise.all(current.ids.filter(id => !found.has(id) && persistedVersion(entry(id)) > 0 &&
        (entry(id).dirty || entry(id).localBacked) && !entry(id).pending).map(id => readOne(id, options)));
    } catch (error) {
      if (!context.disposed && sequence === current.sequence) current.error = error.message;
    } finally {
      if (!context.disposed && sequence === current.sequence) {
        current.loading = false; emit();
        for (const id of current.ids) schedule(entry(id));
      }
    }
  }
  async function readOne(id, options = {}) {
    const item = entry(id);
    if (!item || context.disposed) return;
    const sequence = ++item.sequence, epoch = item.writeEpoch;
    item.loading = true; emit();
    try {
      const value = checkedEntry(await loadEntry(id, options), category, item.date, id);
      if (!context.disposed && sequence === item.sequence && !item.pending && epoch === item.writeEpoch) merge(item, value);
    } catch (error) {
      if (!context.disposed && sequence === item.sequence) {
        item.error = error.message;
        if (!blocked(item)) item.phase = 'error';
      }
    } finally {
      if (!context.disposed && sequence === item.sequence) { item.loading = false; emit(); schedule(item); }
    }
  }
  return {read, readOne};
}

function createEntryEditingActions(context) {
  const {page, entry, entries, emit, stopTimer, schedule, makeEntry} = context;
  const {uuid} = context.options;
  function start(date, {label = '', labels = label ? [label] : []} = {}) {
    const current = page(date);
    if (!validLabels(labels, context.category)) throw new Error('标签无效。');
    if (context.disposed || !current.loaded || !current.canEdit) return;
    const existing = entry(current.composerId);
    if (existing && persistedVersion(existing) === 0 && !existing.deleted && existing.label === label) return existing;
    const id = uuid();
    if (!uuidPattern.test(id) || entries.has(id)) throw new Error('暂时无法新建记录，请重试。');
    const item = makeEntry(id, date, current.canEdit);
    item.labels = [...labels]; item.label = item.labels[0] || ''; item.labelKnown = true; item.labelComplete = true;
    entries.set(id, item); current.ids.push(id); current.composerId = id; emit(); return item;
  }
  function edit(id, text, {composing = false} = {}) {
    const item = entry(id);
    if (!item || context.disposed || !item.canEdit || item.deleted || ['delete', 'restore'].includes(item.pending?.kind)) return;
    item.draft = text; item.composing = composing; item.dirty = text !== savedText(item) || !equalLabels(item.labels, item.serverLabels); stopTimer(item);
    if (dailyNotesBytes(text) > DAILY_NOTES_MAX_BYTES) {
      if (!blocked(item)) item.phase = 'oversize';
      item.error = '文字超过 64 KiB，草稿已保留，请缩短后再保存。';
    } else if (!blocked(item)) {
      item.phase = item.pending ? 'saving' : item.dirty ? 'dirty' : savedPhase(item); item.error = '';
    }
    emit(); if (!composing) schedule(item);
  }
  function relabelDraft(id, labels = []) {
    const item = entry(id);
    if (typeof labels === 'string') labels = labels ? [labels] : [];
    if (!item || context.disposed || !item.canEdit || item.deleted || item.pending || (!item.labelKnown || context.multiLabels && !item.labelComplete) ||
        !validLabels(labels, context.category)) return false;
    item.labels = [...labels]; item.label = labels[0] || '';
    item.dirty = item.draft !== savedText(item) || !equalLabels(item.labels, item.serverLabels);
    item.phase = item.dirty ? 'dirty' : savedPhase(item); emit(); return true;
  }
  return {start, edit, relabelDraft};
}

function createEntryRecoveryActions(context) {
  const {category, page, entry, entries, makeEntry, stopTimer, emit} = context;
  function restoreDraft(raw) {
    if (!raw || raw.category !== category || !validDailyNotesDate(raw.date) || !uuidPattern.test(raw.id) ||
        raw.label && (category !== 'life' || !validCustomNoteLabel(raw.label)) ||
        typeof raw.draft !== 'string' || raw.draft.length > 262144 || context.disposed) return;
    const current = page(raw.date);
    let item = entry(raw.id);
    if (item && (item.pending || item.composing || item.dirty)) return item;
    const pendingDurable = item && raw.pending?.saveId && raw.pending.saveId === item.localOperation?.save_id;
    if (item && persistedVersion(item) > 0 && raw.draft === savedText(item) && (!raw.labels || equalLabels(raw.labels, item.serverLabels)) && (!raw.pending || pendingDurable)) return item;
    if (!item) { item = makeEntry(raw.id, raw.date, current.canEdit); entries.set(item.id, item); }
    if (!persistedVersion(item)) { item.labels = validLabels(raw.labels, category) ? raw.labels : raw.label ? [raw.label] : []; item.label = item.labels[0] || ''; item.labelKnown = raw.labelKnown === true; item.labelComplete = current.labelsComplete === true; }
    if (!current.ids.includes(item.id)) current.ids.push(item.id);
    stopTimer(item); item.writeEpoch++; item.draft = raw.draft; if (validLabels(raw.labels, category)) item.labels = [...raw.labels]; item.dirty = item.draft !== savedText(item) || !equalLabels(item.labels, item.serverLabels);
    item.recoveredBaseline = raw.recoveredBaseline || {version: raw.version ?? null, serverText: raw.serverText ?? null,
      contentHash: raw.contentHash ?? null, createdAt: raw.createdAt ?? null, updatedAt: raw.updatedAt ?? null,
      localVersion: raw.localVersion ?? null, durableText: raw.durableText ?? null};
    if (raw.pending && !pendingDurable) {
      const operation = raw.pending;
      const valid = ['put', 'delete', 'restore'].includes(operation.kind) && uuidPattern.test(operation.saveId) &&
        Number.isSafeInteger(operation.version) && operation.version >= 0 &&
        (operation.kind !== 'put' || typeof operation.text === 'string' && dailyNotesBytes(operation.text) <= DAILY_NOTES_MAX_BYTES &&
          (!operation.labels || validLabels(operation.labels, category)) && (!operation.label || category === 'life' && validCustomNoteLabel(operation.label)) &&
          (!operation.expectedLabel || category === 'life' && validCustomNoteLabel(operation.expectedLabel)));
      item.pending = valid ? {kind: operation.kind, version: operation.version, saveId: operation.saveId,
        ...(operation.kind === 'put' ? {text: operation.text, ...(operation.labels ? {labels: operation.labels} : {}), ...(operation.label ? {label: operation.label} : {}),
          ...(operation.expectedLabel ? {expectedLabel: operation.expectedLabel} : {})} : {}), uncertain: true, checking: false, retryReady: false} :
        {kind: 'recovery-blocked', uncertain: true, invalid: true, checking: false, retryReady: false};
      item.phase = 'unknown';
      item.error = valid ? '已找回未确认的原保存，请手动核对结果；不会自动重发。' : '旧保存凭据不完整，草稿已保留供查看或导出。';
    } else {
      item.phase = dailyNotesBytes(item.draft) > DAILY_NOTES_MAX_BYTES ? 'oversize' : 'error';
      item.error = '已找回未提交草稿，请核对后手动保存；不会自动上传。';
    }
    emit(); return item;
  }
  return {restoreDraft};
}

function createEntryWritingActions(context) {
  const {category, page, entry, entries, emit, stopTimer, adopt, schedule} = context;
  const {put, remove, restore, uuid, onSaved} = context.options;
  const matches = (value, operation) => value.version === operation.version + 1 &&
    (operation.kind === 'delete' ? value.deleted : operation.kind === 'restore' ? !value.deleted :
      !value.deleted && value.text === operation.text && (!operation.labels || value.labels_version === 2 && equalLabels(value.labels, operation.labels) || value.labels_version === 1 && equalLabels(labelsOf(value), operation.labels)) && (!operation.label || value.labels_version === 1 && value.label === operation.label) &&
      (!operation.expectedLabel || value.labels_version === 1 && value.label === operation.expectedLabel));
  function accepted(item, value, operation) {
    const preserve = operation.kind === 'put' && item.draft !== operation.text;
    item.writeEpoch++; adopt(item, value, preserve); item.remote = null; item.pending = null;
    item.phase = item.dirty ? 'dirty' : 'saved'; item.error = ''; emit(); onSaved(item.date); schedule(item);
  }
  function acceptedLocal(item, value, operation) {
    const local = documentValue(value);
    if (!matches(local, operation)) throw new Error('本机保存结果需要重新核对。');
    const preserve = operation.kind === 'put' && item.draft !== operation.text;
    item.writeEpoch++; adopt(item, value, preserve); item.pending = null;
    emit(); onSaved(item.date); schedule(item);
  }
  async function send(item, operation) {
    stopTimer(item); item.pending = operation; item.phase = 'saving'; item.error = ''; item.writeEpoch++; emit();
    try {
      const body = {version: operation.version, save_id: operation.saveId};
      const options = operation.uncertain ? {offlineUnknown: true} : undefined;
      const raw = operation.kind === 'delete' ? await remove(item.id, body, options) : operation.kind === 'restore' ?
        await restore(item.id, body, options) : await put(item.id, {...body, category: item.category, date: item.date, text: operation.text,
          ...(operation.labels ? {labels: operation.labels} : operation.label ? {label: operation.label} : {})}, options);
      if (context.disposed || item.pending !== operation) return;
      const value = checkedEntry(raw, category, item.date, item.id);
      if (isLocalDocument(value)) { acceptedLocal(item, value, operation); return; }
      if (!matches(value, operation)) throw new Error('保存响应需要重新核对。');
      accepted(item, value, operation);
    } catch (error) {
      if (context.disposed || item.pending !== operation) return;
      if (localFailure(error)) {
        item.pending = operation.uncertain ? operation : null; item.phase = operation.uncertain ? 'unknown' : 'error';
        item.error = operation.uncertain ? '原保存仍待核对，本机接管未完成：' + error.message : error.message; emit();
      } else if (error.status === 409 && (!error.code || ['VERSION_CONFLICT', 'NOTE_ENTRY_DELETED'].includes(error.code))) {
        item.pending = null; item.phase = 'conflict'; item.error = error.message || '这条记录已有新版本，草稿已保留。'; emit();
        await context.readOne(item.id);
      } else if (error.status >= 400 && error.status < 500) {
        item.pending = null; item.phase = 'error'; item.error = error.message;
        if ([401, 403].includes(error.status)) item.canEdit = false;
        emit();
      } else {
        operation.uncertain = true;
        item.phase = 'unknown'; item.error = '正在核对保存结果，草稿已保留。'; emit(); await context.reconcile(item.id);
      }
    }
  }
  async function save(id) {
    const item = entry(id); if (!item) return; stopTimer(item);
    if (context.disposed || !item.canEdit || item.deleted || item.loading || item.pending || blocked(item) || !item.dirty || item.composing) return;
    if (!persistedVersion(item) && !item.draft.trim()) return;
    if (context.multiLabels && !item.labelComplete && !equalLabels(item.labels, item.serverLabels)) {
      item.phase = 'error'; item.error = '请联网核实完整标签后再保存，草稿已保留。'; emit(); return;
    }
    if (dailyNotesBytes(item.draft) > DAILY_NOTES_MAX_BYTES) {
      item.phase = 'oversize'; item.error = '文字超过 64 KiB，草稿已保留。'; emit(); return;
    }
    return send(item, {kind: 'put', version: persistedVersion(item), text: item.draft, saveId: uuid(),
      ...(context.multiLabels && item.labelComplete && item.category === 'life' && !equalLabels(item.labels, item.serverLabels) ? {labels: [...item.labels]} : {}),
      ...(!context.multiLabels && !persistedVersion(item) && item.label ? {label: item.label} : {}),
      ...(!context.multiLabels && item.label ? {expectedLabel: item.label} : {})});
  }
  async function deleteEntry(id) {
    const item = entry(id);
    if (!item || context.disposed || !item.canEdit || item.pending || blocked(item) || item.deleted) return;
    if (!persistedVersion(item)) {
      stopTimer(item); const current = page(item.date); current.ids = current.ids.filter(value => value !== id);
      entries.delete(id); if (current.composerId === id) current.composerId = ''; emit(); return;
    }
    return send(item, {kind: 'delete', version: persistedVersion(item), saveId: uuid()});
  }
  async function restoreEntry(id) {
    const item = entry(id);
    if (!item || context.disposed || !item.canEdit || !item.deleted || item.pending || blocked(item)) return;
    return send(item, {kind: 'restore', version: persistedVersion(item), saveId: uuid()});
  }
  return {matches, accepted, acceptedLocal, send, save, deleteEntry, restoreEntry};
}

function createEntryResolutionActions(context) {
  const {category, entry, emit, stopTimer, adopt, matches, accepted, acceptedLocal} = context;
  const {load, loadEntry, loadOperation} = context.options;
  async function reconcile(id) {
    const item = entry(id), operation = item?.pending;
    if (context.disposed || item?.phase !== 'unknown' || !operation || operation.checking) return;
    operation.checking = true; operation.retryReady = false; emit();
    try {
      const receipt = await loadOperation(operation.saveId);
      if (context.disposed || item.pending !== operation) return;
      if (!receipt || typeof receipt.found !== 'boolean' || receipt.found &&
          (receipt.id !== id || receipt.version !== operation.version + 1 || typeof receipt.content_hash !== 'string')) {
        throw new Error('保存凭据不完整。');
      }
      let value;
      try { value = checkedEntry(await loadEntry(id), category, item.date, id); }
      catch (error) {
        if (error.status !== 404 || receipt.found || operation.version !== 0 || operation.kind !== 'put') throw error;
        const collection = checkedCollection(await load(item.date), category, item.date);
        value = collection.entries.find(raw => noteValue(raw).id === id);
        if (isLocalDocument(value)) throw new Error('原保存结果仍由同步队列核实，本机内容已保留。');
        if (!value) {
          if (context.disposed || item.pending !== operation) return;
          item.canEdit = collection.can_edit; operation.retryReady = collection.can_edit;
          item.error = operation.retryReady ? '服务器尚未收到此保存，可重试；后续草稿已保留。' : '保存尚未确认，草稿已保留。';
          return;
        }
      }
      if (context.disposed || item.pending !== operation) return;
      if (isLocalDocument(value)) {
        if (documentState(value).operation?.save_id === operation.saveId) return acceptedLocal(item, value, operation);
        throw new Error('保存结果仍由同步队列核实，本机内容已保留。');
      }
      item.canEdit = value.can_edit;
      if (receipt.found && receipt.content_hash === value.content_hash && receipt.version === value.version && matches(value, operation)) {
        accepted(item, value, operation);
      } else if (value.version > operation.version) {
        item.remote = value; item.pending = null; item.phase = 'conflict';
        item.error = '服务器已有更新，草稿已保留，请核对后选择。';
      } else {
        item.remote = value; operation.retryReady = !receipt.found && value.can_edit && value.version === operation.version;
        item.error = operation.retryReady ? '服务器尚无新版本，可重试原保存；后续草稿已保留。' : '保存结果尚未确认，草稿已保留，请再次核对。';
      }
    } catch (error) {
      if (!context.disposed && item.pending === operation) {
        item.error = '核对失败，草稿已保留：' + error.message;
        if ([401, 403].includes(error.status)) item.canEdit = false;
      }
    } finally { operation.checking = false; emit(); }
  }
  async function retryPending(id) {
    const item = entry(id), operation = item?.pending;
    if (context.disposed || item?.phase !== 'unknown' || !item.canEdit || !operation?.retryReady || operation.checking) return;
    operation.retryReady = false; return context.send(item, operation);
  }
  function useServer(id) {
    const item = entry(id);
    if (item?.localConflict) { item.error = '请从顶部同步状态选择线上版本，本机原文会保留。'; emit(); return; }
    if (!item?.remote || item.pending || item.phase !== 'conflict') return;
    stopTimer(item); adopt(item, item.remote); item.remote = null; item.phase = 'saved'; item.error = ''; emit();
  }
  async function useDraft(id) {
    const item = entry(id);
    if (item?.localConflict) { item.error = '冲突的两份内容已保留，请从顶部同步状态处理。'; emit(); return; }
    if (!item?.remote || item.pending || item.phase !== 'conflict' || !item.remote.can_edit || item.remote.deleted) return;
    adopt(item, item.remote, true); item.remote = null; item.phase = item.dirty ? 'dirty' : 'saved'; item.error = ''; emit(); return context.save(id);
  }
  return {reconcile, retryPending, useServer, useDraft};
}

export function createNoteEntriesStore(options) {
  const context = createEntriesContext(options);
  Object.assign(context, createEntryLocalActions(context));
  Object.assign(context, createEntryReadingActions(context), createEntryEditingActions(context),
    createEntryWritingActions(context), createEntryRecoveryActions(context));
  Object.assign(context, createEntryResolutionActions(context));
  const {category, pages, entries, page, entry, start, read, readOne, edit, relabelDraft, save, deleteEntry, restoreEntry,
    reconcile, retryPending, useServer, useDraft, restoreDraft, dispose} = context;
  const pauseAutosave = () => {
    context.autosavePaused = true; for (const item of entries.values()) context.stopTimer(item);
    return () => { context.autosavePaused = false; };
  };
  return {category, pages, entries, page, entry, start, read, readOne, edit, relabelDraft, save, deleteEntry, restoreEntry,
    reconcile, retryPending, useServer, useDraft, restoreDraft, pauseAutosave, dispose};
}
