import {isLocalDocument} from '../offline/document.mjs';
import {memoLocalProtocol} from './memos-local.mjs';
export const MEMOS_MAX_BYTES = 65536;
export const memoBytes = value => new TextEncoder().encode(value).length;
const idPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const cleanTitle = value => typeof value === 'string' && value.trim() && [...value].length <= 120;
const noteFields = ['group_id', 'title', 'body', 'position'];
const changed = (item, value) => noteFields.some(field => item[field] !== value[field]);
const isUncertain = item => item.pending || ['unknown', 'conflict'].includes(item.phase);

function checkedNote(value, id) {
  if (!value || value.id !== id || !idPattern.test(value.group_id) || !cleanTitle(value.title) ||
      typeof value.body !== 'string' || memoBytes(value.body) > MEMOS_MAX_BYTES ||
      !Number.isSafeInteger(value.version) || value.version < 1 || !Number.isSafeInteger(value.position))
    throw new Error('笔记读取结果不完整，请核对。');
  return value;
}
function newDraft(value) {
  return {...value, dirty: false, phase: 'saved', error: '', pending: null, remote: null,
    localVersion: value.version, localQueued: false, localOperation: null, localConflict: null, durable: null, autosaveHeld: false,
    server: {...value}, loading: false, sequence: 0, writeEpoch: 0, timer: null};
}
function validPending(value) {
  return value && ['groups', 'notes'].includes(value.kind) && idPattern.test(value.id) &&
    ['PUT', 'POST', 'DELETE'].includes(value.method) && value.path === '/memos/' + value.kind + '/' + value.id +
    (value.method === 'POST' ? '/restore' : '') && value.body && idPattern.test(value.body.save_id) &&
    Number.isSafeInteger(value.body.version) && value.body.version >= 0;
}
function recoveredDraft(raw) {
  if (!raw || !idPattern.test(raw.id) || !idPattern.test(raw.group_id) || typeof raw.title !== 'string' ||
      typeof raw.body !== 'string' || raw.body.length > 262144 || !Number.isSafeInteger(raw.version) || raw.version < 0 ||
      !Number.isSafeInteger(raw.position) || raw.position < 0 || raw.position > 1000000) return null;
  if (raw.pending && (!validPending(raw.pending) || raw.pending.kind !== 'notes' || raw.pending.method !== 'PUT' ||
      raw.pending.id !== raw.id || raw.pending.body.group_id !== raw.group_id || typeof raw.pending.body.title !== 'string' ||
      typeof raw.pending.body.body !== 'string')) return null;
  const item = {...newDraft(raw), dirty: true, server: raw.server || null, remote: raw.remote || null,
    composing: false, autosaveHeld: true};
  item.pending = raw.pending ? {...raw.pending, checking: false, retryReady: false} : null;
  item.phase = item.pending ? 'unknown' : raw.phase === 'conflict' ? 'conflict' : 'dirty';
  item.error = item.pending ? '上次保存结果待核对，草稿已保留。' : '已找回此浏览器保留的草稿。';
  return item;
}
function makeContext(options) {
  const {request, ownerId = '', storage, onChange = () => {}, uuid = () => globalThis.crypto.randomUUID(), delay = 700} = options;
  const state = {groups: [], notes: [], canEdit: false, loading: false, error: '', groupId: '', noteId: '', pane: 'groups',
    trash: false, operation: null, storageError: ''};
  const context = {state, drafts: new Map(), request, ownerId, storage, uuid, delay, disposed: false, hydrated: false, loadSequence: 0};
  context.draftScope = options.draftScope || uuid();
  context.restoreDraftScope = options.restoreDraftScope;
  context.storagePersistent = options.storagePersistent !== false && Boolean(options.draftScope);
  context.online = options.online || (() => globalThis.navigator?.onLine !== false);
  context.durable = options.durable === true; context.readLocal = options.readLocal;
  context.resolveLocal = options.resolveLocal;
  context.stop = item => { clearTimeout(item.timer); item.timer = null; };
  context.emit = () => { if (!context.disposed) { context.persist(); onChange(); } };
  context.writable = () => !context.disposed && state.canEdit && idPattern.test(context.ownerId);
  context.blocked = item => {
    const pending = state.operation?.pending;
    return pending && (pending.kind === 'notes' && pending.id === item.id ||
      pending.kind === 'groups' && pending.method === 'DELETE' && pending.id === item.group_id);
  };
  context.upsert = (kind, value) => {
    const list = state[kind], index = list.findIndex(row => row.id === value.id);
    const row = {...value}; if (kind === 'notes') delete row.body;
    if (index < 0) list.push(row); else list[index] = row;
    list.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    if (kind === 'notes') for (const group of state.groups)
      group.active_note_count = state.notes.filter(note => note.group_id === group.id && !note.deleted_at &&
        (note.version > 0 || note.localVersion > 0)).length;
  };
  context.schedule = item => {
    context.stop(item);
    if (!context.autosavePaused && !item.autosaveHeld && context.writable() && item.dirty && !item.loading &&
        !item.composing && !isUncertain(item) && item.phase === 'dirty')
      item.timer = setTimeout(() => { item.timer = null; void context.saveNote(item.id); }, delay);
  };
  context.dispose = () => {
    context.persist(); context.disposed = true;
    for (const item of context.drafts.values()) context.stop(item);
    context.drafts.clear(); state.groups = []; state.notes = []; state.operation = null; state.canEdit = false;
  };
  return context;
}
function persistence(context) {
  const key = () => 'haoduoyu.memos.drafts.v1.' + context.ownerId + '.' + context.draftScope;
  const previousKey = () => context.restoreDraftScope ? 'haoduoyu.memos.drafts.v1.' + context.ownerId + '.' + context.restoreDraftScope : null;
  function persist({verify = false} = {}) {
    if (!context.writable()) { if (verify) throw new Error('备忘录身份已变化，未更新页面。'); return; }
    const drafts = [...context.drafts.values()].filter(item => item.dirty || item.pending || item.phase === 'conflict').slice(0, 200)
      .map(({timer, ...item}) => ({...item, loading: false}));
    try {
      if (!context.storage || verify && !context.storagePersistent) throw new Error('Draft storage unavailable');
      const value = JSON.stringify({saved_at: new Date().toISOString(), drafts, operation: context.state.operation});
      context.storage.setItem(key(), value);
      if (verify && context.storage.getItem(key()) !== value) throw new Error('Draft readback failed');
      context.state.storageError = context.storagePersistent ? '' : '浏览器无法记住此页签，刷新后可能无法找回草稿，请保持页面打开。';
    } catch {
      context.state.storageError = '浏览器无法保留草稿，请暂时保持此页面打开。';
      if (verify) throw new Error(context.state.storageError);
    }
  }
  function hydrate() {
    if (context.hydrated || !context.writable()) return;
    context.hydrated = true;
    try {
      const current = context.storage?.getItem(key());
      const saved = JSON.parse(current ?? (previousKey() ? context.storage?.getItem(previousKey()) : null) ?? '{}');
      if (Array.isArray(saved.drafts)) for (const raw of saved.drafts.slice(0, 200)) {
        const item = recoveredDraft(raw);
        if (item) context.drafts.set(item.id, item);
      }
      if (validPending(saved.operation?.pending))
        context.state.operation = {...saved.operation, phase: 'unknown', checking: false, retryReady: false};
    } catch { context.state.storageError = '浏览器草稿读取失败，已保留原记录。'; }
  }
  async function recoverDraft(raw) {
    if (!context.writable()) return false;
    const item = recoveredDraft(raw);
    if (!item) { context.state.error = '草稿格式不完整，请复制预览中的文字留存。'; context.emit(); return false; }
    const current = context.drafts.get(item.id);
    if (current && (current.dirty || current.pending)) {
      if (changed(current, item) || current.version !== item.version || current.pending?.body.save_id !== item.pending?.body.save_id) {
        context.state.error = '此笔记已有另一份草稿，未覆盖。请先复制预览文字，再处理当前草稿。'; context.emit(); return false;
      }
    } else context.drafts.set(item.id, item);
    context.state.groupId = item.group_id; context.state.noteId = item.id; context.state.pane = 'editor';
    context.emit(); await context.selectNote(item.id);
    return true;
  }
  return {persist, hydrate, recoverDraft, flushDrafts: async () => persist({verify: true})};
}
function acceptNote(context, item, value, pending) {
  const preserve = changed(item, pending.snapshot || pending.body);
  if (!preserve) for (const field of noteFields) item[field] = value[field];
  item.server = {...value}; item.version = value.version; item.deleted_at = value.deleted_at;
  item.updated_at = value.updated_at; item.pending = null; item.remote = null; item.error = '';
  context.local.reset(item, value);
  item.dirty = changed(item, value); item.phase = item.dirty ? 'dirty' : 'saved'; item.writeEpoch++;
  context.upsert('notes', value); context.emit(); context.schedule(item);
}
function memoReads(context) {
  async function selectNote(id, {open = true, select = true, local = false} = {}) {
    if (context.disposed || !idPattern.test(id)) return;
    const {state, drafts} = context;
    if (select) { state.noteId = id; if (open) state.pane = 'editor'; }
    let item = drafts.get(id);
    if (!item) { item = newDraft({id, title: '', body: '', version: 0}); drafts.set(id, item); }
    if (select && item.group_id) state.groupId = item.group_id;
    if (item.version === 0 && item.dirty && !item.localQueued && item.phase !== 'conflict' &&
        !(context.durable && item.autosaveHeld)) { context.emit(); return; }
    const reschedule = context.durable && (item.localQueued || Boolean(item.timer));
    const sequence = ++item.sequence, epoch = item.writeEpoch;
    item.loading = true; context.emit();
    try {
      const raw = await (local && context.readLocal ? context.readLocal('/memos/notes/' + id) : context.request('/memos/notes/' + id));
      if (context.disposed || sequence !== item.sequence || epoch !== item.writeEpoch || item.pending) return;
      if (isLocalDocument(raw)) { context.local.accept(item, raw); return; }
      const value = checkedNote(raw, id);
      if (select && state.noteId === id) state.groupId = value.group_id;
      if (item.dirty && (item.localQueued ? item.localVersion : item.version) !== value.version || item.phase === 'conflict') {
        item.remote = value; item.phase = 'conflict'; item.error = '服务器已有新版本，草稿已保留，请核对后选择。';
      } else {
        const preserve = item.dirty;
        if (!preserve) for (const field of noteFields) item[field] = value[field];
        item.server = value; item.version = value.version; item.deleted_at = value.deleted_at;
        item.updated_at = value.updated_at; item.dirty = changed(item, value); item.phase = item.dirty ? 'dirty' : 'saved'; item.error = '';
        context.local.reset(item, value);
        context.upsert('notes', value);
      }
    } catch (error) {
      if (!context.disposed && sequence === item.sequence) {
        item.error = error.message; if (!isUncertain(item)) item.phase = 'error';
      }
    } finally {
      if (!context.disposed && sequence === item.sequence) {
        item.loading = false; context.emit(); if (reschedule) context.schedule(item);
      }
    }
  }
  async function load({local = false} = {}) {
    const {state} = context, sequence = ++context.loadSequence;
    state.loading = true; state.error = ''; context.emit();
    try {
      const raw = await (local && context.readLocal ? context.readLocal('/memos') : context.request('/memos'));
      if (context.disposed || sequence !== context.loadSequence) return;
      if (!Array.isArray(raw?.groups) || !Array.isArray(raw.notes) || typeof raw.can_edit !== 'boolean')
        throw new Error('备忘录列表不完整，请重新读取。');
      const value = context.local.index(raw);
      if (value.draft_scope && context.ownerId && value.draft_scope !== context.ownerId)
        throw new Error('工作区归属已变化，请重新打开页面核对本机草稿。');
      if (!context.ownerId && idPattern.test(value.draft_scope || '')) context.ownerId = value.draft_scope;
      state.draftOwner = context.ownerId;
      state.groups = value.groups; state.notes = value.notes; state.canEdit = value.can_edit === true && idPattern.test(context.ownerId);
      if (!state.canEdit) {
        for (const item of context.drafts.values()) context.stop(item);
        context.drafts.clear(); state.operation = null;
      } else context.hydrate();
      if (!state.groups.some(group => group.id === state.groupId && (state.trash || !group.deleted_at)))
        state.groupId = state.groups.find(group => state.trash || !group.deleted_at)?.id || '';
      if (!state.noteId) state.noteId = state.notes.find(note => note.group_id === state.groupId && (state.trash || !note.deleted_at))?.id || '';
      if (state.noteId) await selectNote(state.noteId, {open: false, local});
    } catch (error) { if (!context.disposed && sequence === context.loadSequence) state.error = error.message; }
    finally { if (!context.disposed && sequence === context.loadSequence) { state.loading = false; context.emit(); } }
  }
  async function selectGroup(id) {
    const group = context.state.groups.find(row => row.id === id && (context.state.trash || !row.deleted_at));
    if (!group) return;
    context.state.groupId = id; context.state.noteId = ''; context.state.pane = 'notes';
    const note = context.state.notes.find(row => row.group_id === id && (context.state.trash || !row.deleted_at));
    if (note) await selectNote(note.id, {open: false});
    context.emit();
  }
  return {load, selectNote, selectGroup};
}
function editing(context) {
  function edit(field, value, {composing = false, retainPrivate = false} = {}) {
    const item = context.drafts.get(context.state.noteId);
    if (!context.writable() || !item || item.loading || !idPattern.test(item.group_id) || !['title', 'body'].includes(field) ||
        item.deleted_at || context.blocked(item)) return;
    item.composing = composing;
    if (!retainPrivate) item.autosaveHeld = false;
    const baseline = item.localQueued ? item.durable : item.server;
    item[field] = value; item.dirty = !baseline || changed(item, baseline); context.stop(item);
    if (!isUncertain(item)) {
      item.phase = item.pending ? 'saving' : item.dirty ? 'dirty' : 'saved'; item.error = '';
      if (!composing && (!cleanTitle(item.title) || memoBytes(item.body) > MEMOS_MAX_BYTES)) {
        item.phase = 'error'; item.error = '标题须为 1–120 字，正文最多 64 KiB；草稿已保留。';
      }
    }
    context.emit(); if (!composing) context.schedule(item);
  }
  async function sendNote(item, pending, {offlineUnknown = false} = {}) {
    context.stop(item); item.pending = pending; item.phase = 'saving'; item.error = ''; item.writeEpoch++; context.emit();
    try {
      const raw = await context.request(pending.path, {method: pending.method, body: pending.body,
        ...(offlineUnknown ? {offlineUnknown: true} : {})});
      if (context.disposed || item.pending !== pending) return;
      if (isLocalDocument(raw)) { context.local.accept(item, raw, pending); return; }
      const value = checkedNote(raw, item.id);
      if (value.version !== pending.body.version + 1 || changed(value, pending.body)) throw new Error('保存响应需要重新核对。');
      acceptNote(context, item, value, pending);
    } catch (error) {
      if (context.disposed || item.pending !== pending) return;
      if (error.status === 409) {
        item.pending = null; item.phase = 'conflict'; item.error = '版本冲突，草稿已保留，不会自动覆盖。';
        await context.selectNote(item.id, {open: false, select: false});
      } else if (error.status >= 400 && error.status < 500) {
        item.pending = null; item.phase = 'error'; item.error = error.message;
        if ([401, 403].includes(error.status)) context.state.canEdit = false;
      } else { item.phase = 'unknown'; item.error = '保存结果待核对。草稿已保留，请先查询保存收据。'; }
      context.emit();
    }
  }
  async function saveNote(id = context.state.noteId) {
    const item = context.drafts.get(id);
    if (context.autosavePaused || !context.writable() || !item || !item.dirty || isUncertain(item) || item.loading || item.deleted_at ||
        item.composing || context.blocked(item)) return;
    item.autosaveHeld = false;
    context.stop(item);
    if (!cleanTitle(item.title) || memoBytes(item.body) > MEMOS_MAX_BYTES) {
      item.phase = 'error'; item.error = '标题须为 1–120 字，正文最多 64 KiB；草稿已保留。'; context.emit(); return;
    }
    if (!context.online() && !context.durable) {
      item.phase = 'offline'; item.error = '当前离线，草稿保留在此浏览器。联网后可立即保存。'; context.emit(); return;
    }
    const snapshot = Object.fromEntries(noteFields.map(field => [field, item[field]]));
    const body = {...snapshot, title: snapshot.title.trim(), body: snapshot.body.replace(/\r\n?/g, '\n')};
    return sendNote(item, {kind: 'notes', id, path: '/memos/notes/' + id, method: 'PUT',
      body: {...body, version: item.localQueued ? item.localVersion : item.version, save_id: context.uuid()}, snapshot});
  }
  async function createNote(groupId, title = '新笔记') {
    if (!context.writable() || !context.state.groups.some(group => group.id === groupId && !group.deleted_at)) return;
    const id = context.uuid(), position = Math.min(1000000, Math.max(0, ...context.state.notes.map(note => note.position)) + 1);
    const item = newDraft({id, group_id: groupId, title, body: '', position, version: 0, deleted_at: null});
    item.dirty = true; item.phase = 'dirty'; item.server = null; context.drafts.set(id, item);
    context.state.groupId = groupId; context.state.noteId = id; context.state.pane = 'editor';
    context.upsert('notes', item); context.emit(); await saveNote(id); return id;
  }
  return {edit, sendNote, saveNote, createNote};
}
function resolution(context) {
  async function checkNote(id = context.state.noteId) {
    const item = context.drafts.get(id), pending = item?.pending;
    if (!context.writable() || !item) return;
    if (!pending) return context.selectNote(id, {open: false});
    if (context.durable && pending.method === 'PUT') return context.sendNote(item, pending, {offlineUnknown: true});
    if (pending.checking) return;
    pending.checking = true; pending.retryReady = false; context.emit();
    try {
      const receipt = await context.request('/memos/operations/' + pending.body.save_id);
      if (context.disposed || item.pending !== pending) return;
      if (receipt?.found === false) {
        pending.retryReady = true; item.error = '暂未找到保存收据；可手动重试同一保存，不会新建重复操作。'; return;
      }
      if (receipt?.found !== true || receipt.kind !== 'notes' || receipt.id !== id) throw new Error('保存收据不匹配。');
      const value = checkedNote(await context.request('/memos/notes/' + id), id);
      if (context.disposed || item.pending !== pending) return;
      if (value.version === receipt.version && !changed(value, pending.body)) acceptNote(context, item, value, pending);
      else {
        item.pending = null; item.remote = value; item.phase = 'conflict'; item.dirty = true;
        item.error = '原保存已记录，服务器随后又有更新。请核对两个版本。';
      }
    } catch (error) {
      if (!context.disposed && item.pending === pending) item.error = '核对失败，保留草稿并暂停发送：' + error.message;
    } finally { pending.checking = false; context.emit(); }
  }
  async function retryPending(id = context.state.noteId) {
    const item = context.drafts.get(id), pending = item?.pending;
    if (!context.writable() || item?.phase !== 'unknown' || !pending?.retryReady || pending.checking) return;
    pending.retryReady = false; return context.sendNote(item, pending);
  }
  function useServer(id = context.state.noteId) {
    const item = context.drafts.get(id);
    if (!context.writable() || !item?.remote || item.pending || item.phase !== 'conflict') return;
    if (item.localConflict && context.resolveLocal) return context.resolveLocal(item.localConflict.key, 'use-server').then(() => {
      item.localQueued = false; item.localConflict = null; item.dirty = false; item.phase = 'saved';
      return context.selectNote(id, {open: false, local: true});
    });
    context.stop(item); const value = item.remote;
    Object.assign(item, newDraft(value)); context.upsert('notes', value); context.emit();
  }
  async function useDraft(id = context.state.noteId) {
    const item = context.drafts.get(id);
    if (!context.writable() || !item?.remote || item.pending || item.phase !== 'conflict' || item.remote.deleted_at) return;
    if (item.localConflict) {
      item.error = '两份内容仍保留，请在同步队列核对后处理。'; context.emit(); return;
    }
    item.server = item.remote; item.version = item.remote.version; item.remote = null;
    item.dirty = changed(item, item.server); item.phase = item.dirty ? 'dirty' : 'saved'; item.error = '';
    context.emit(); return context.saveNote(id);
  }
  return {checkNote, retryPending, useServer, useDraft};
}
function operations(context) {
  async function sendOperation(pending) {
    const operation = {pending, phase: 'saving', error: '', retryReady: false};
    context.state.operation = operation; context.emit();
    try {
      const raw = await context.request(pending.path, {method: pending.method, body: pending.body});
      if (context.disposed || context.state.operation !== operation) return;
      if (isLocalDocument(raw)) {
        context.upsert(pending.kind, context.local.row(raw)); context.state.operation = null; context.emit(); return;
      }
      const value = raw;
      if (value?.id !== pending.id || !Number.isSafeInteger(value.version)) throw new Error('操作结果需要核对。');
      context.upsert(pending.kind, value); context.state.operation = null;
      if (pending.kind === 'notes') context.drafts.delete(pending.id);
      await context.load();
    } catch (error) {
      if (context.disposed || context.state.operation !== operation) return;
      operation.error = error.message;
      if (error.status >= 400 && error.status < 500) {
        operation.phase = 'error'; operation.pending = null;
      } else {
        operation.phase = 'unknown'; operation.error = '操作结果待核对，请先查询保存收据，暂不重复操作。';
      }
      context.emit();
    }
  }
  async function operation(kind, id, method, body) {
    if (!context.writable() || context.state.operation?.pending) return;
    if (!context.online() && !(context.durable && method === 'PUT')) {
      context.state.operation = {phase: 'offline', pending: null, error: '当前离线，请联网后重试此操作。'};
      context.emit(); return;
    }
    return sendOperation({kind, id, method, path: '/memos/' + kind + '/' + id + (method === 'POST' ? '/restore' : ''),
      body: {...body, save_id: context.uuid()}});
  }
  async function checkOperation() {
    const value = context.state.operation, pending = value?.pending;
    if (!context.writable() || !pending || value.checking) return;
    value.checking = true; value.retryReady = false; context.emit();
    try {
      const receipt = await context.request('/memos/operations/' + pending.body.save_id);
      if (context.disposed || context.state.operation !== value) return;
      if (receipt?.found === false) { value.retryReady = true; value.error = '暂未找到收据，可手动重试同一操作。'; }
      else if (receipt?.found === true && receipt.id === pending.id && receipt.kind === pending.kind) {
        context.state.operation = null; await context.load();
      } else throw new Error('操作收据不匹配。');
    } catch (error) { if (!context.disposed && context.state.operation === value) value.error = '核对失败：' + error.message; }
    finally { value.checking = false; context.emit(); }
  }
  async function retryOperation() {
    const value = context.state.operation;
    if (!context.writable() || !value?.pending || !value.retryReady || value.checking) return;
    return sendOperation(value.pending);
  }
  function recoverOperation(raw) {
    if (!context.writable() || !validPending(raw?.pending)) return false;
    if (context.state.operation?.pending) {
      context.state.error = '当前已有待核对操作，请先核对，未替换原操作。'; context.emit(); return false;
    }
    context.state.operation = {...raw, pending: {...raw.pending}, phase: 'unknown', checking: false, retryReady: false,
      error: '已找回上次操作，请先核对保存收据。'};
    context.emit(); return true;
  }
  return {operation, checkOperation, retryOperation, recoverOperation};
}
function structure(context) {
  const pendingInGroup = id => [...context.drafts.values()].some(item => item.group_id === id && (item.dirty || item.pending));
  async function createGroup(title) {
    if (!cleanTitle(title)) return;
    const id = context.uuid(), position = Math.min(1000000, Math.max(0, ...context.state.groups.map(group => group.position)) + 1);
    await context.operation('groups', id, 'PUT', {title: title.trim(), position, version: 0});
    if (context.state.groups.some(group => group.id === id)) await context.selectGroup(id);
    return id;
  }
  async function renameGroup(id, title) {
    const group = context.state.groups.find(value => value.id === id);
    if (!group || group.deleted_at || !cleanTitle(title)) return;
    return context.operation('groups', id, 'PUT', {title: title.trim(), position: group.position,
      version: group.localQueued ? group.localVersion : group.version});
  }
  async function removeGroup(id, confirmation) {
    const group = context.state.groups.find(value => value.id === id);
    if (!group || group.deleted_at) return;
    const snapshot = confirmation || group;
    if (['version', 'title', 'active_note_count'].some(field => snapshot[field] !== group[field])) {
      context.state.error = '分组已更新，请重新核对标题和笔记数量后确认删除。'; context.emit(); return;
    }
    if (group.localQueued || pendingInGroup(id)) {
      context.state.error = '此分组还有未同步内容，请联网同步后再删除。'; context.emit(); return;
    }
    return context.operation('groups', id, 'DELETE', {version: snapshot.version, confirm_title: snapshot.title,
      confirm_note_count: snapshot.active_note_count});
  }
  async function removeNote(id) {
    if (!context.online()) { context.state.error = '删除笔记需联网；本机正文已保留。'; context.emit(); return; }
    const item = context.drafts.get(id), note = context.state.notes.find(value => value.id === id);
    if (!note || note.deleted_at || note.localQueued || item && (item.dirty || item.pending || item.localQueued)) {
      context.state.error = '请先保存或核对笔记草稿，再删除。'; context.emit(); return;
    }
    return context.operation('notes', id, 'DELETE', {version: note.version});
  }
  async function restore(kind, id) {
    if (!['groups', 'notes'].includes(kind)) return;
    const value = context.state[kind].find(row => row.id === id);
    if (!value?.deleted_at) return;
    if (kind === 'notes' && !context.state.groups.some(group => group.id === value.group_id && !group.deleted_at)) {
      context.state.error = '请先恢复此笔记所属的分组。'; context.emit(); return;
    }
    return context.operation(kind, id, 'POST', {version: value.version});
  }
  return {createGroup, renameGroup, removeGroup, removeNote, restore};
}

export function createMemosStore(options) {
  const context = makeContext(options);
  context.local = memoLocalProtocol(context);
  Object.assign(context, persistence(context), memoReads(context), editing(context), resolution(context), operations(context), structure(context));
  const {state, drafts, load, selectGroup, selectNote, edit, saveNote, createGroup, renameGroup, createNote,
    removeGroup, removeNote, restore, checkNote, useServer, useDraft, retryPending, checkOperation, retryOperation,
    recoverDraft, recoverOperation, flushDrafts, dispose} = context;
  const pauseAutosave = () => {
    const scheduled = [...drafts.values()].filter(item => item.timer);
    context.autosavePaused = true; for (const item of drafts.values()) context.stop(item);
    return () => { if (!context.disposed) { context.autosavePaused = false; for (const item of scheduled) context.schedule(item); } };
  };
  return {state, drafts, load, selectGroup, selectNote, edit, saveNote, createGroup, renameGroup, createNote,
    removeGroup, removeNote, restore, checkNote, useServer, useDraft, retryPending, checkOperation, retryOperation,
    recoverDraft, recoverOperation, pauseAutosave, flushDrafts, dispose};
}
