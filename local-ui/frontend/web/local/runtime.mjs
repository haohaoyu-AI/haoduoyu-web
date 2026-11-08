// Local-only replacement for the website's network-bound offline runtime.
// The original renderer/controllers/CSS remain the source of the interface.
import {openOfflineDB} from '../offline/db.mjs';
import {createDraftJournal} from '../offline/drafts.mjs';
import {createComposerJournal} from './drafts.mjs';
import {createNoteRecoveryJournal} from './note-recovery.mjs';
import {createLocalApi, LOCAL_DATABASE_NAME, LOCAL_SCOPE, LOCAL_OWNER_ID} from './api.mjs';

let singleton = null, initialization = null;
const readyListeners = new Set();
export const OFFLINE_FEATURES = Object.freeze({todos:true, notes:true, memos:true, snapshotV2:true, labelsV1:true});
export function createStandaloneRuntime({db, now = Date.now, uuid = () => crypto.randomUUID()} = {}) {
  const service = createLocalApi({db, now, uuid, ownerId:LOCAL_OWNER_ID});
  const listeners = new Set();
  const identity = {id:LOCAL_OWNER_ID, username:'本机', publicBusiness:true, localOnly:true};
  const state = {scope:LOCAL_SCOPE, verifiedScope:LOCAL_SCOPE, identity, localOnly:true,
    online:true, phase:'local', pending:0, conflicts:0, unsupported:0, lastSuccess:null, error:null, ready:true};
  const draftOwner = uuid();
  const drafts = createDraftJournal({db, getScope:() => LOCAL_SCOPE, getGeneration:() => 0, now, draftOwner});
  const noteRecovery = createNoteRecoveryJournal({db, getScope:() => LOCAL_SCOPE, draftOwner});
  let draftTail = Promise.resolve();
  const draftFailures = new Map();
  const recordKey = row => JSON.stringify([row?.kind ?? null, row?.category ?? null, row?.date ?? null, row?.id ?? null]);
  function enqueueDraftTask(task, keys = null) {
    const work = draftTail.then(task).then(value => {
      if (keys) for (const key of keys) draftFailures.delete(key);
      return value;
    }, error => {
      if (keys) for (const key of keys) draftFailures.set(key, error);
      throw error;
    });
    // Continue after failure, but keep each affected record's error until that
    // record is durably rewritten. Unrelated success cannot make flush green.
    draftTail = work.catch(() => {});
    work.catch(() => {});
    return work;
  }
  function retainDrafts(rows) {
    let frozen, error, keys = ['invalid-capture'];
    try {
      if (!Array.isArray(rows)) throw new TypeError('Draft capture requires an array');
      keys = [...new Set(rows.map(recordKey))];
      // Freeze the whole array, nested pending state and recoveryProof now,
      // before any earlier capture or read boundary is awaited.
      frozen = structuredClone(rows);
    } catch (cause) { error = cause; }
    return enqueueDraftTask(() => {
      if (error) throw error;
      return drafts.capture(frozen);
    }, keys);
  }
  async function drainDraftTail() {
    let observed;
    do { observed = draftTail; await observed; } while (observed !== draftTail);
    return {tail:observed};
  }
  const composerDrafts = createComposerJournal({db, scope:LOCAL_SCOPE, uuid, onError(error) {
    state.error = error.message; emit();
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('haoduoyu:local-draft-error',{detail:{message:error.message}}));
  }});
  const composerReady = composerDrafts.initialize();
  composerReady.catch(() => {});
  const flushAllDrafts = async () => {
    await composerReady;
    let observed;
    do {
      observed = (await drainDraftTail()).tail;
      await drafts.flush(); await composerDrafts.flush();
    } while (observed !== draftTail);
    if (draftFailures.size) throw [...draftFailures.values()][0];
  };
  const token = () => ({scope:LOCAL_SCOPE, generation:0, localOnly:true});
  const emit = () => { for (const listener of listeners) listener({...state}); };
  const unavailable = () => { throw Object.assign(new Error('这是独立本机版本，没有线上同步队列。原内容保留。'), {code:'LOCAL_ONLY',status:409}); };
  return {
    state, composerDrafts, composerReady,
    async call(path, options = {}) {
      if (options.signal?.aborted || options.context?.controller?.signal.aborted)
        throw new DOMException('请求已取消', 'AbortError');
      options.offlineGuard?.();
      await composerReady;
      // Snapshots are unforgeable journal capabilities, never accepted in JSON.
      const snapshot = options.localDraftSnapshot;
      const recoveredNote = options.localRecoveredNoteSave;
      const clean = {...options}; delete clean.localDraftSnapshot; delete clean.localDraftCommit; delete clean.localRecoveredNoteSave;
      if (snapshot && recoveredNote) throw new Error('保存请求包含不匹配的草稿凭据。');
      if (snapshot) {
        const expectedPath = snapshot.kind === 'todo' ? '/todos' : snapshot.kind === 'future' ? '/unscheduled-todos' : null;
        if (path !== expectedPath || String(options.method).toUpperCase() !== 'POST' ||
            snapshot.text.trim() !== options.body?.text || snapshot.kind === 'todo' && snapshot.identity !== options.body?.date)
          throw new Error('草稿与保存内容不匹配，未清除输入。');
        const hook = composerDrafts.commitHook(snapshot);
        await composerDrafts.flush();
        const result = await service(path, {...clean, localDraftCommit:hook});
        composerDrafts.accept(snapshot); return result;
      }
      if (recoveredNote) {
        if (String(options.method).toUpperCase() !== 'PUT') throw new Error('恢复草稿保存请求无效。');
        const hook = noteRecovery.commitHook(recoveredNote, path, options.body);
        return service(path, {...clean, body:structuredClone(options.body), localDraftCommit:hook});
      }
      return service(path, clean);
    },
    async sync() { await flushAllDrafts(); return {...state}; },
    async refresh() { await flushAllDrafts(); emit(); return {...state}; },
    start() { return () => {}; }, stop() {},
    captureRateLimitContext:token, async recordRateLimit() {},
    async queue() { return {operations:[],conflicts:[]}; },
    resolve:unavailable, invalidate:unavailable,
    readMemo:path => service(path), localRead:path => service(path),
    // Original month UI safely falls back to local per-day reads.
    async readTodoMonthSnapshot() { return null; },
    findTodo:id => service('/todos/' + encodeURIComponent(id)),
    async acceptMovedTodo({source,todo}, expected) {
      if (!expected || expected.scope !== LOCAL_SCOPE || expected.generation !== 0 || source?.id !== todo?.id)
        return 'refresh';
      // The local API already atomically saved both sides of the move.
      const actual = await service('/todos/' + encodeURIComponent(todo.id));
      return actual.version === todo.version && actual.date === todo.date ? 'saved' : 'refresh';
    },
    retainDrafts, retainedDrafts:drafts.list,
    retainedDraftRecords:async kind => noteRecovery.observe(await drafts.records(kind)),
    bindRecoveredNote:noteRecovery.bind,
    prepareRecoveredNoteSave(item, body) {
      // Append the boundary synchronously. Later C/A2 captures must stay after
      // it; never wait for a moving tail and then select a same-text revision.
      const intent = noteRecovery.captureRequest(item, body);
      return intent ? enqueueDraftTask(() => noteRecovery.prepare(intent)) : Promise.resolve(null);
    },
    wasSavedNoteDraft:noteRecovery.wasSaved,
    purgeVerifiedNoteDrafts:drafts.purgeVerified, purgeUserDeletedNoteDrafts:drafts.purgeUserDeleted,
    discardUnsentNoteDraft:drafts.discardUnsent, discardSelectedDraft:drafts.discardSelected, flushDrafts:flushAllDrafts,
    subscribe(listener) { listeners.add(listener); listener({...state}); return () => listeners.delete(listener); }
  };
}
export function getOfflineRuntime() { return singleton; }
export function onOfflineRuntime(callback) {
  readyListeners.add(callback); if (singleton) callback(singleton);
  return () => readyListeners.delete(callback);
}
export function captureOfflineRateLimitContext() {
  return singleton ? {runtime:singleton, token:singleton.captureRateLimitContext()} : null;
}
export async function recordOfflineRateLimit() { /* No remote service in this build. */ }
export async function getLocalRuntime() {
  if (!initialization) initialization = openOfflineDB({name:LOCAL_DATABASE_NAME}).then(async db => {
    singleton = createStandaloneRuntime({db});
    await singleton.composerReady;
    for (const callback of readyListeners) callback(singleton);
    return singleton;
  });
  try { return await initialization; }
  catch (cause) {
    throw Object.assign(new Error('无法打开本机数据库，本次没有保存。请保留输入，不要卸载或清除数据。'),
      {code:'LOCAL_STORAGE_UNAVAILABLE',status:503,cause});
  }
}
export async function offlineRequest(path, options = {}, _network, _onIdentity, assertActive = () => {}) {
  const local = await getLocalRuntime(); assertActive();
  return local.call(path, {...options, offlineGuard:assertActive});
}

// Build-time nonvisual bindings used by the unchanged original controllers.
export function bindLocalComposer(object, property, kind, identity = '') {
  if (!singleton) throw new Error('本机草稿存储尚未准备好，请保留输入。');
  return singleton.composerDrafts.bind(object,property,kind,identity);
}
export function localComposerUnchanged(snapshot) { return singleton?.composerDrafts.unchangedSince(snapshot) || false; }

export function localComposerRequestSnapshot(request, kind, identity = '') {
  if (!singleton) throw new Error('本机草稿存储尚未准备好，请保留输入。');
  return singleton.composerDrafts.requestSnapshot(request,kind,identity);
}
