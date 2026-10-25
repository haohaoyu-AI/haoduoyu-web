import {DAILY_NOTES_MAX_BYTES, dailyNotesBytes, validDailyNotesDate} from './daily-notes-state.mjs';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const blocked = item => ['conflict', 'unknown'].includes(item.phase);
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
function checkedEntry(value, category, date, id) {
  if (!value || !uuidPattern.test(value.id) || id && value.id !== id || value.category !== category ||
      value.date !== date || typeof value.text !== 'string' || dailyNotesBytes(value.text) > DAILY_NOTES_MAX_BYTES ||
      !Number.isSafeInteger(value.version) || value.version < 1 || typeof value.deleted !== 'boolean' ||
      typeof value.can_edit !== 'boolean' || !timestamp(value.created_at) || !timestamp(value.updated_at) ||
      typeof value.content_hash !== 'string' || !value.content_hash) {
    throw new Error('记录读取不完整，请重新核对。');
  }
  return value;
}
function checkedCollection(value, category, date) {
  if (!value || value.category !== category || value.date !== date || !Array.isArray(value.entries) ||
      value.entries.length > 200 || typeof value.can_edit !== 'boolean') throw new Error('记录列表不完整，请重新读取。');
  const ids = new Set();
  for (const entry of value.entries) {
    checkedEntry(entry, category, date);
    if (entry.deleted || ids.has(entry.id)) throw new Error('记录列表不完整，请重新读取。');
    ids.add(entry.id);
  }
  return value;
}

// A store belongs to one identity and category. A composer captures its day at creation;
// neither navigation nor midnight can change the destination of an in-flight write.
function createEntriesContext({category, load, loadEntry, loadOperation, put, remove, restore,
  onChange = () => {}, onSaved = () => {}, uuid = () => crypto.randomUUID(),
  setTimer = setTimeout, clearTimer = clearTimeout, delay = 400}) {
  if (!['life', 'work'].includes(category)) throw new Error('请选择有效分类。');
  const pages = new Map(), entries = new Map();
  const context = {category, pages, entries, disposed: false,
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
      version: 0, createdAt: null, updatedAt: null, contentHash: '', deleted: false, dirty: false,
      phase: 'empty', error: '', remote: null, pending: null, timer: null, sequence: 0,
      writeEpoch: 0, composing: false};
  }
  function adopt(item, value, preserve = false) {
    item.canEdit = value.can_edit;
    item.serverText = value.deleted ? '' : value.text;
    item.version = value.version; item.createdAt = value.created_at; item.updatedAt = value.updated_at;
    item.contentHash = value.content_hash; item.deleted = value.deleted;
    if (!preserve) item.draft = item.serverText;
    item.dirty = item.draft !== item.serverText; item.loaded = true;
  }
  function schedule(item) {
    stopTimer(item);
    if (!context.disposed && item.canEdit && item.dirty && !item.pending && !item.loading && !item.composing &&
        !blocked(item) && !['error', 'oversize'].includes(item.phase) && (item.version > 0 || item.draft.trim())) {
      item.timer = setTimer(() => { item.timer = null; void context.save(item.id); }, delay);
    }
  }
  function merge(item, value) {
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

function createEntryReadingActions(context) {
  const {category, page, entry, entries, emit, adopt, merge, schedule, makeEntry} = context;
  const {load, loadEntry} = context.options;
  async function read(date) {
    const current = page(date), sequence = ++current.sequence;
    const epochs = new Map(current.ids.map(id => [id, entry(id)?.writeEpoch]));
    current.loading = true; current.error = ''; emit();
    try {
      const value = checkedCollection(await load(date), category, date);
      if (context.disposed || sequence !== current.sequence) return;
      current.canEdit = value.can_edit;
      const found = new Set();
      for (const raw of value.entries) {
        found.add(raw.id);
        let item = entry(raw.id);
        if (!item) { item = makeEntry(raw.id, date, raw.can_edit); entries.set(raw.id, item); adopt(item, raw); item.phase = 'saved'; }
        else if (!item.pending && item.writeEpoch === epochs.get(item.id)) merge(item, raw);
      }
      const retained = current.ids.filter(id => {
        const item = entry(id);
        return found.has(id) || item.version === 0 || item.dirty || item.pending || item.deleted ||
          blocked(item) || item.writeEpoch !== epochs.get(id);
      });
      current.ids = [...new Set([...retained, ...value.entries.map(item => item.id)])];
      current.loaded = true;
      // A dirty entry missing from a complete live list may have been deleted elsewhere.
      // Fetch its tombstone without discarding the local text.
      await Promise.all(current.ids.filter(id => !found.has(id) && entry(id).version > 0 &&
        entry(id).dirty && !entry(id).pending && !entry(id).deleted).map(id => readOne(id)));
    } catch (error) {
      if (!context.disposed && sequence === current.sequence) current.error = error.message;
    } finally {
      if (!context.disposed && sequence === current.sequence) {
        current.loading = false; emit();
        for (const id of current.ids) schedule(entry(id));
      }
    }
  }
  async function readOne(id) {
    const item = entry(id);
    if (!item || context.disposed) return;
    const sequence = ++item.sequence, epoch = item.writeEpoch;
    item.loading = true; emit();
    try {
      const value = checkedEntry(await loadEntry(id), category, item.date, id);
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
  function start(date) {
    const current = page(date);
    if (context.disposed || !current.loaded || !current.canEdit) return;
    const existing = entry(current.composerId);
    if (existing && existing.version === 0 && !existing.deleted) return existing;
    const id = uuid();
    if (!uuidPattern.test(id) || entries.has(id)) throw new Error('暂时无法新建记录，请重试。');
    const item = makeEntry(id, date, current.canEdit);
    entries.set(id, item); current.ids.push(id); current.composerId = id; emit(); return item;
  }
  function edit(id, text, {composing = false} = {}) {
    const item = entry(id);
    if (!item || context.disposed || !item.canEdit || item.deleted || ['delete', 'restore'].includes(item.pending?.kind)) return;
    item.draft = text; item.composing = composing; item.dirty = text !== item.serverText; stopTimer(item);
    if (dailyNotesBytes(text) > DAILY_NOTES_MAX_BYTES) {
      if (!blocked(item)) item.phase = 'oversize';
      item.error = '文字超过 64 KiB，草稿已保留，请缩短后再保存。';
    } else if (!blocked(item)) {
      item.phase = item.pending ? 'saving' : item.dirty ? 'dirty' : item.version ? 'saved' : 'empty'; item.error = '';
    }
    emit(); if (!composing) schedule(item);
  }
  return {start, edit};
}

function createEntryWritingActions(context) {
  const {category, page, entry, entries, emit, stopTimer, adopt, schedule} = context;
  const {put, remove, restore, uuid, onSaved} = context.options;
  const matches = (value, operation) => value.version === operation.version + 1 &&
    (operation.kind === 'delete' ? value.deleted : operation.kind === 'restore' ? !value.deleted :
      !value.deleted && value.text === operation.text);
  function accepted(item, value, operation) {
    const preserve = operation.kind === 'put' && item.draft !== operation.text;
    item.writeEpoch++; adopt(item, value, preserve); item.remote = null; item.pending = null;
    item.phase = item.dirty ? 'dirty' : 'saved'; item.error = ''; emit(); onSaved(item.date); schedule(item);
  }
  async function send(item, operation) {
    stopTimer(item); item.pending = operation; item.phase = 'saving'; item.error = ''; item.writeEpoch++; emit();
    try {
      const body = {version: operation.version, save_id: operation.saveId};
      const raw = operation.kind === 'delete' ? await remove(item.id, body) : operation.kind === 'restore' ?
        await restore(item.id, body) : await put(item.id, {...body, category: item.category, date: item.date, text: operation.text});
      if (context.disposed || item.pending !== operation) return;
      const value = checkedEntry(raw, category, item.date, item.id);
      if (!matches(value, operation)) throw new Error('保存响应需要重新核对。');
      accepted(item, value, operation);
    } catch (error) {
      if (context.disposed || item.pending !== operation) return;
      if (error.status === 409 && (!error.code || ['VERSION_CONFLICT', 'NOTE_ENTRY_DELETED'].includes(error.code))) {
        item.pending = null; item.phase = 'conflict'; item.error = error.message || '这条记录已有新版本，草稿已保留。'; emit();
        await context.readOne(item.id);
      } else if (error.status >= 400 && error.status < 500) {
        item.pending = null; item.phase = 'error'; item.error = error.message;
        if ([401, 403].includes(error.status)) item.canEdit = false;
        emit();
      } else {
        item.phase = 'unknown'; item.error = '正在核对保存结果，草稿已保留。'; emit(); await context.reconcile(item.id);
      }
    }
  }
  async function save(id) {
    const item = entry(id); if (!item) return; stopTimer(item);
    if (context.disposed || !item.canEdit || item.deleted || item.loading || item.pending || blocked(item) || !item.dirty || item.composing) return;
    if (!item.version && !item.draft.trim()) return;
    if (dailyNotesBytes(item.draft) > DAILY_NOTES_MAX_BYTES) {
      item.phase = 'oversize'; item.error = '文字超过 64 KiB，草稿已保留。'; emit(); return;
    }
    return send(item, {kind: 'put', version: item.version, text: item.draft, saveId: uuid()});
  }
  async function deleteEntry(id) {
    const item = entry(id);
    if (!item || context.disposed || !item.canEdit || item.pending || blocked(item) || item.deleted) return;
    if (!item.version) {
      stopTimer(item); const current = page(item.date); current.ids = current.ids.filter(value => value !== id);
      entries.delete(id); if (current.composerId === id) current.composerId = ''; emit(); return;
    }
    return send(item, {kind: 'delete', version: item.version, saveId: uuid()});
  }
  async function restoreEntry(id) {
    const item = entry(id);
    if (!item || context.disposed || !item.canEdit || !item.deleted || item.pending || blocked(item)) return;
    return send(item, {kind: 'restore', version: item.version, saveId: uuid()});
  }
  return {matches, accepted, send, save, deleteEntry, restoreEntry};
}

function createEntryResolutionActions(context) {
  const {category, entry, emit, stopTimer, adopt, matches, accepted} = context;
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
        value = collection.entries.find(raw => raw.id === id);
        if (!value) {
          if (context.disposed || item.pending !== operation) return;
          item.canEdit = collection.can_edit; operation.retryReady = collection.can_edit;
          item.error = operation.retryReady ? '服务器尚未收到此保存，可重试；后续草稿已保留。' : '保存尚未确认，草稿已保留。';
          return;
        }
      }
      if (context.disposed || item.pending !== operation) return;
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
    if (!item?.remote || item.pending || item.phase !== 'conflict') return;
    stopTimer(item); adopt(item, item.remote); item.remote = null; item.phase = 'saved'; item.error = ''; emit();
  }
  async function useDraft(id) {
    const item = entry(id);
    if (!item?.remote || item.pending || item.phase !== 'conflict' || !item.remote.can_edit || item.remote.deleted) return;
    adopt(item, item.remote, true); item.remote = null; item.phase = item.dirty ? 'dirty' : 'saved'; item.error = ''; emit(); return context.save(id);
  }
  return {reconcile, retryPending, useServer, useDraft};
}

export function createNoteEntriesStore(options) {
  const context = createEntriesContext(options);
  Object.assign(context, createEntryReadingActions(context), createEntryEditingActions(context),
    createEntryWritingActions(context));
  Object.assign(context, createEntryResolutionActions(context));
  const {category, pages, entries, page, entry, start, read, readOne, edit, save, deleteEntry, restoreEntry,
    reconcile, retryPending, useServer, useDraft, dispose} = context;
  return {category, pages, entries, page, entry, start, read, readOne, edit, save, deleteEntry, restoreEntry,
    reconcile, retryPending, useServer, useDraft, dispose};
}
