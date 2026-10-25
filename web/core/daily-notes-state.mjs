export const DAILY_NOTES_MAX_BYTES = 65536;
export function validDailyNotesDate(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function dailyNotesToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return parts.year + '-' + parts.month + '-' + parts.day;
}
let routeDate = '';
export function dailyNotesRouteDate() { return routeDate || dailyNotesToday(); }
export function setDailyNotesRouteDate(value) { routeDate = validDailyNotesDate(value) ? value : ''; }
export function dailyNotesBytes(text) { return new TextEncoder().encode(text).length; }

function checkedPage(value, date) {
  if (!value || value.date !== date || typeof value.text !== 'string' ||
      !Number.isSafeInteger(value.version) || value.version < 0 ||
      typeof value.deleted !== 'boolean' || typeof value.can_edit !== 'boolean' ||
      dailyNotesBytes(value.text) > DAILY_NOTES_MAX_BYTES) throw new Error('碎碎念读取结果不完整，请重新核对。');
  return value;
}

// Drafts belong to one live identity and remain in this tab, never localStorage.
function createDailyNotesContext({load, put, remove, restore, onChange = () => {}, onSaved = () => {},
  uuid = () => crypto.randomUUID(), setTimer = setTimeout, clearTimer = clearTimeout, delay = 700}) {
  const context = {pages: new Map(), disposed: false, options: {load, put, remove, restore, onSaved, uuid}};
  const pages = context.pages;
  const emit = () => { if (!context.disposed) onChange(); };
  const page = date => {
    if (!validDailyNotesDate(date)) throw new Error('请选择有效日期。');
    if (!pages.has(date)) pages.set(date, {date, loaded: false, loading: false, canEdit: false,
      serverText: '', draft: '', version: 0, updatedAt: null, deleted: false, dirty: false,
      phase: 'loading', error: '', remote: null, pending: null, timer: null, sequence: 0, writeEpoch: 0});
    return pages.get(date);
  };
  const stopTimer = item => { if (item.timer !== null) clearTimer(item.timer); item.timer = null; };
  const adopt = (item, value, preserve = false) => {
    item.canEdit = value.can_edit;
    item.serverText = value.deleted ? '' : value.text;
    item.version = value.version; item.updatedAt = value.updated_at; item.deleted = value.deleted;
    if (!preserve) item.draft = item.serverText;
    item.dirty = item.draft !== item.serverText;
    item.loaded = true;
  };
  function schedule(item) {
    stopTimer(item);
    if (!context.disposed && item.canEdit && item.dirty && !item.pending && !item.loading &&
        !['conflict', 'unknown', 'error', 'oversize'].includes(item.phase)) {
      item.timer = setTimer(() => { item.timer = null; void context.save(item.date); }, delay);
    }
  }
  const matches = (value, operation) => value.version === operation.version + 1 &&
    (operation.kind === 'delete' ? value.deleted === true : operation.kind === 'restore' ? value.deleted === false :
      value.deleted === false && value.text === operation.text);
  function accepted(item, value, operation) {
    const keep = operation.kind === 'put' && item.draft !== operation.text;
    item.writeEpoch++;
    adopt(item, value, keep);
    item.remote = null; item.pending = null; item.phase = item.dirty ? 'dirty' : 'saved'; item.error = '';
    emit(); onSaved(item.date); schedule(item);
  }
  function dispose() { context.disposed = true; for (const item of pages.values()) stopTimer(item); }
  Object.assign(context, {page, emit, stopTimer, adopt, schedule, matches, accepted, dispose});
  return context;
}

function createReadingActions(context) {
  const {page, emit, stopTimer, adopt, schedule} = context;
  const {load} = context.options;
  async function read(date) {
    const item = page(date), sequence = ++item.sequence, writeEpoch = item.writeEpoch;
    item.loading = true; emit();
    try {
      const value = checkedPage(await load(date), date);
      if (context.disposed || sequence !== item.sequence) return;
      if (item.pending || writeEpoch !== item.writeEpoch) return;
      if (['conflict', 'unknown'].includes(item.phase)) {
        item.remote = value; item.canEdit = value.can_edit;
      } else if (item.dirty && value.version !== item.version) {
        item.remote = value; item.canEdit = value.can_edit; item.phase = 'conflict';
        item.error = '服务器已有新版本，草稿已保留，请核对后选择。';
      } else {
        adopt(item, value, item.dirty);
        item.phase = item.dirty ? 'dirty' : 'saved'; item.error = '';
      }
    } catch (error) {
      if (!context.disposed && sequence === item.sequence) {
        item.error = error.message;
        if (!['conflict', 'unknown'].includes(item.phase)) item.phase = 'error';
      }
    } finally {
      if (!context.disposed && sequence === item.sequence) { item.loading = false; emit(); schedule(item); }
    }
  }
  function edit(date, text, {composing = false} = {}) {
    const item = page(date);
    if (context.disposed || !item.canEdit || !item.loaded || ['delete', 'restore'].includes(item.pending?.kind)) return;
    item.draft = text; item.dirty = text !== item.serverText; stopTimer(item);
    if (dailyNotesBytes(text) > DAILY_NOTES_MAX_BYTES) {
      if (!['conflict', 'unknown'].includes(item.phase)) item.phase = 'oversize';
      item.error = '文字超过 64 KiB，草稿已保留，请缩短后再保存。';
    } else if (!['conflict', 'unknown'].includes(item.phase)) {
      item.phase = item.pending ? 'saving' : item.dirty ? 'dirty' : 'saved'; item.error = '';
    }
    emit(); if (!composing) schedule(item);
  }
  return {read, edit};
}

function createWritingActions(context) {
  const {page, emit, stopTimer, matches, accepted} = context;
  const {put, remove, restore, uuid} = context.options;
  async function send(item, operation) {
    stopTimer(item); item.pending = operation; item.phase = 'saving'; item.error = ''; item.writeEpoch++; emit();
    try {
      const raw = await (operation.kind === 'restore' ? restore(item.date, {
        version: operation.version, save_id: operation.saveId
      }) : operation.kind === 'delete' ? remove(item.date, {
        version: operation.version, save_id: operation.saveId
      }) : put(item.date, {text: operation.text, version: operation.version, save_id: operation.saveId}));
      if (context.disposed || item.pending !== operation) return;
      const value = checkedPage(raw, item.date);
      if (!matches(value, operation)) throw new Error('保存响应需要重新核对。');
      accepted(item, value, operation);
    } catch (error) {
      if (context.disposed || item.pending !== operation) return;
      if (error.status === 409) {
        item.pending = null; item.phase = 'conflict'; item.dirty = true;
        item.error = '服务器已有新版本，草稿已保留，不会自动覆盖。'; emit();
        await context.read(item.date);
      } else if (error.status >= 400 && error.status < 500) {
        item.pending = null; item.phase = 'error'; item.error = error.message;
        if ([401, 403].includes(error.status)) item.canEdit = false;
        emit();
      } else {
        item.phase = 'unknown';
        item.error = '正在核对保存结果，草稿已保留。'; emit();
        await context.reconcile(item.date);
      }
    }
  }
  async function save(date) {
    const item = page(date); stopTimer(item);
    if (context.disposed || !item.canEdit || !item.loaded || item.loading || item.pending ||
        ['conflict', 'unknown'].includes(item.phase) || !item.dirty) return;
    if (dailyNotesBytes(item.draft) > DAILY_NOTES_MAX_BYTES) {
      item.phase = 'oversize'; item.error = '文字超过 64 KiB，草稿已保留。'; emit(); return;
    }
    return send(item, {kind: 'put', text: item.draft, version: item.version, saveId: uuid()});
  }
  async function deletePage(date) {
    const item = page(date);
    if (context.disposed || !item.canEdit || !item.loaded || item.pending ||
        ['conflict', 'unknown'].includes(item.phase) || item.version === 0 || item.deleted) return;
    return send(item, {kind: 'delete', text: item.draft, version: item.version, saveId: uuid()});
  }
  async function retryPending(date) {
    const item = page(date), operation = item.pending;
    if (context.disposed || item.phase !== 'unknown' || !operation?.retryReady || operation.checking || !item.canEdit) return;
    operation.retryReady = false;
    return send(item, operation);
  }
  async function restorePage(date) {
    const item = page(date);
    if (context.disposed || !item.canEdit || !item.loaded || !item.deleted || item.pending || item.dirty ||
        ['conflict', 'unknown'].includes(item.phase)) return;
    return send(item, {kind: 'restore', text: '', version: item.version, saveId: uuid()});
  }
  return {save, deletePage, restorePage, retryPending};
}

function createResolutionActions(context) {
  const {page, emit, stopTimer, adopt, matches, accepted} = context;
  const {load} = context.options;
  async function reconcile(date) {
    const item = page(date), operation = item.pending;
    if (context.disposed || item.phase !== 'unknown' || !operation || operation.checking) return;
    operation.checking = true; operation.retryReady = false; emit();
    try {
      const value = checkedPage(await load(date), date);
      if (context.disposed || item.pending !== operation) return;
      item.canEdit = value.can_edit;
      if (matches(value, operation)) accepted(item, value, operation);
      else if (value.version > operation.version) {
        item.remote = value; item.pending = null; item.phase = 'conflict'; item.dirty = true;
        item.error = '服务器已有不同的新版本，草稿已保留，不会自动覆盖。';
      }
      else {
        item.remote = value;
        operation.retryReady = value.can_edit && value.version === operation.version;
        item.error = operation.retryReady ?
          '已核对服务器尚无新版本。可手动重试原保存，后续草稿仍会保留。' :
          '保存结果尚未确认，草稿已保留。请再次核对，暂不重复发送。';
      }
    } catch (error) {
      if (!context.disposed && item.pending === operation) item.error = '核对失败，草稿已保留：' + error.message;
    } finally {
      operation.checking = false; emit();
    }
  }
  function useServer(date) {
    const item = page(date);
    if (!item.remote || item.pending || item.phase !== 'conflict') return;
    stopTimer(item); adopt(item, item.remote); item.remote = null; item.phase = 'saved'; item.error = ''; emit();
  }
  async function useDraft(date) {
    const item = page(date);
    if (!item.remote || item.pending || item.phase !== 'conflict' || !item.remote.can_edit) return;
    adopt(item, item.remote, true); item.remote = null; item.phase = item.dirty ? 'dirty' : 'saved'; item.error = '';
    emit(); return context.save(date);
  }
  return {reconcile, useServer, useDraft};
}

// One write per date is in flight; uncertain writes require a read and explicit retry.
export function createDailyNotesStore(options) {
  const context = createDailyNotesContext(options);
  Object.assign(context, createReadingActions(context), createWritingActions(context), createResolutionActions(context));
  const {page, pages, read, edit, save, deletePage, restorePage, reconcile, retryPending, useServer, useDraft, dispose} = context;
  return {page, pages, read, edit, save, deletePage, restorePage, reconcile, retryPending, useServer, useDraft, dispose};
}
