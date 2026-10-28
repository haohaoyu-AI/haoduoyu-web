import {openOfflineDB, offlineValue} from './db.mjs';
import {createOfflineCache, identityFingerprint, offlineReadRoute, safeIdentity} from './cache.mjs';
import {createOutbox} from './outbox.mjs';
import {createSnapshotSync} from './sync.mjs';
import {createNoteMutations, noteMutationRoute} from './note-mutations.mjs';
import {createDraftJournal} from './drafts.mjs';
import {captureConflictDraftGuard} from './conflict-draft-guards.mjs';
import {createMemoOfflineAdapter, memoRoute} from './memos.mjs';

export const OFFLINE_FEATURES = Object.freeze({todos: true, notes: true, memos: true, snapshotV2: true, labelsV1: true});
const scopePattern = /^[a-f0-9]{64}$/;
const uuidPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const networkFailure = error => error?.code === 'NETWORK_UNAVAILABLE' || error?.code === 'OFFLINE_NETWORK';
const fail = (message, code) => Object.assign(new Error(message), {code});
const today = now => new Date(now() + 8 * 3600000).toISOString().slice(0, 10);
const offlineError = () => fail('当前离线，此操作需联网；输入内容已保留。', 'OFFLINE_NETWORK');
async function identityProbe(context, path, options = {}) {
  const controller = new AbortController(), external = options.signal;
  const abort = () => controller.abort(external.reason);
  if (external?.aborted) abort(); else external?.addEventListener('abort', abort, {once: true});
  let timer;
  try {
    const expired = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(fail('身份范围核实暂未完成，本机内容已保留。', 'OFFLINE_NETWORK')); controller.abort();
      }, 10000);
    });
    return await Promise.race([context.request(path, {...options, signal: controller.signal}), expired]);
  } finally { clearTimeout(timer); external?.removeEventListener('abort', abort); }
}
function writableRoute(path, options, features) {
  if (!features.todos) return null;
  const method = (options.method || 'GET').toUpperCase();
  if (['/todos', '/todo-templates', '/unscheduled-todos'].includes(path) && method === 'POST')
    return {type: path === '/todos' ? 'todo' : path === '/unscheduled-todos' ? 'unscheduled_todo' : 'template', create: true};
  const match = /^\/(todos|todo-templates|unscheduled-todos)\/([a-f0-9-]{36})(\/restore)?$/i.exec(path);
  if (!match || !uuidPattern.test(match[2])) return null;
  if (match[3] && (method !== 'POST' || !['todos', 'unscheduled-todos'].includes(match[1])) ||
      !match[3] && !['PATCH', 'DELETE'].includes(method)) return null;
  return {type: match[1] === 'todos' ? 'todo' : match[1] === 'unscheduled-todos' ? 'unscheduled_todo' : 'template',
    id: match[2].toLowerCase(), restore: Boolean(match[3])};
}
function checkedBody(route, options, uuid) {
  const body = structuredClone(options.body || {}), method = (options.method || 'GET').toUpperCase();
  const required = route.create ? (route.type === 'todo' ? ['id', 'date', 'text'] : ['id', 'text']) :
    route.type === 'todo' ? (route.restore || method === 'DELETE' ? ['date', 'version'] : ['completed', 'version']) :
      route.type === 'unscheduled_todo' ? (route.restore || method === 'DELETE' ? ['version'] : ['completed', 'version']) :
      method === 'DELETE' ? ['version'] : ['text', 'version'];
  if (route.create && !body.id) body.id = uuid();
  const allowed = [...required, ...(route.create && route.type === 'todo' ? ['template_id'] : [])];
  if (required.some(key => !Object.hasOwn(body, key)) || Object.keys(body).some(key => !allowed.includes(key)))
    throw fail('请求字段不完整，本次操作未保存。', 'OFFLINE_INVALID_MUTATION');
  if (body.id && !uuidPattern.test(body.id) || body.template_id && !uuidPattern.test(body.template_id))
    throw fail('事项标识无效，本次操作未保存。', 'OFFLINE_INVALID_MUTATION');
  if (body.date && (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(body.date) ||
      !Number.isFinite(Date.parse(body.date + 'T00:00:00Z')) ||
      new Date(body.date + 'T00:00:00Z').toISOString().slice(0, 10) !== body.date))
    throw fail('请选择有效日期。', 'OFFLINE_INVALID_MUTATION');
  if (Object.hasOwn(body, 'text') && (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 500 || body.text.includes('\0')))
    throw fail('请填写 1–500 字的内容。', 'OFFLINE_INVALID_MUTATION');
  if (Object.hasOwn(body, 'completed') && typeof body.completed !== 'boolean')
    throw fail('完成状态无效。', 'OFFLINE_INVALID_MUTATION');
  if (!route.create && (!Number.isSafeInteger(body.version) || body.version < 1 || body.version >= Number.MAX_SAFE_INTEGER))
    throw fail('版本无效，本次操作未保存。', 'OFFLINE_INVALID_MUTATION');
  return body;
}
function runtimeContext(options) {
  const {db, request, now = Date.now, uuid = () => crypto.randomUUID(), online = () => globalThis.navigator?.onLine !== false,
    onIdentity = () => {}, features = OFFLINE_FEATURES} = options;
  const state = {scope: null, verifiedScope: null, identity: null, online: online(), phase: 'idle', pending: 0,
    conflicts: 0, unsupported: 0, lastSuccess: null, cachedAt: null, error: null, ready: true};
  const listeners = new Set();
  const emit = () => { for (const callback of listeners) callback({...state}); };
  const cache = createOfflineCache({db, getScope: () => state.scope, getGeneration: () => context.generation, now,
    labelsV1: features.labelsV1 === true});
  const context = {db, request, now, uuid, online, onIdentity, features, state, cache, emit, listeners,
    generation: 0, authFlight: null, syncFlight: null, timer: null, channel: null, stopped: false};
  const send = async (path, opts) => {
    if (opts?.method && !['GET', 'HEAD'].includes(opts.method.toUpperCase()) &&
        !writableRoute(path, opts, features) && !noteMutationRoute(path, opts, features) &&
        !(features.memos && memoRoute(path) && opts.method.toUpperCase() === 'PUT'))
      throw fail('此本机操作需新版页面处理，原内容已保留。', 'OFFLINE_UPGRADE_REQUIRED');
    if (!online() || !state.verifiedScope || state.verifiedScope !== state.scope) throw offlineError();
    const owner = state.scope, generation = context.generation;
    try {
      if (opts?.method && !['GET', 'HEAD'].includes(opts.method.toUpperCase())) await context.verifyScope();
      if (!state.verifiedScope || owner !== state.scope || generation !== context.generation) throw offlineError();
      const labelOpts = features.labelsV1 && path.startsWith('/note-entries') ?
        {...opts, headers: {...opts?.headers, 'X-Note-Labels-Version': '1'}} : opts;
      const result = await request(path, labelOpts);
      if (owner !== state.scope || generation !== context.generation) throw fail('身份范围已变化。', 'OFFLINE_SCOPE_CHANGED');
      return result;
    } catch (error) {
      if ([401, 403].includes(error.status) && generation === context.generation) await context.invalidate({forget: true});
      throw error;
    }
  };
  context.outbox = createOutbox({db, request: send, getScope: () => state.scope, now, uuid, timeout: options.timeout,
    enabledTypes: [...(features.todos ? ['todo', 'template', 'unscheduled_todo'] : []), ...(features.notes ? ['note_entry'] : []),
      ...(features.memos ? ['memo_note', 'memo_group'] : [])],
    supportedProtocols: features.memos ? [1, 2, 3, 4, 5] : [1, 3, 4, 5], supportedDependencies: features.memos === true,
    resolutionReceipts: true});
  context.snapshot = createSnapshotSync({db, request: send, getScope: () => state.scope, now});
  context.snapshotV2 = features.snapshotV2 === true ? createSnapshotSync({db, request: send, getScope: () => state.scope, now, version: 2}) : null;
  context.memos = createMemoOfflineAdapter({db, cache, outbox: context.outbox, getScope: () => state.scope,
    getGeneration: () => context.generation, now, uuid});
  return context;
}
function identityActions(context) {
  const {cache, state, emit, request, onIdentity} = context;
  async function invalidate({forget = false} = {}) {
    context.generation++;
    context.authFlight = null;
    state.scope = null; state.verifiedScope = null; state.identity = null; state.pending = 0; state.conflicts = 0; state.unsupported = 0;
    state.phase = 'paused';
    if (forget) await cache.forgetIdentity();
    emit();
  }
  async function adopt(me, index, generation) {
    const identity = safeIdentity(me);
    if (generation !== context.generation) throw fail('身份读取已过期。', 'OFFLINE_SCOPE_CHANGED');
    if (!scopePattern.test(index?.scope_id) || index.complete !== true || index.projection !== 'current')
      throw fail('身份范围读取不完整，请联网重试。', 'OFFLINE_SCOPE_REQUIRED');
    if (state.scope && (state.scope !== index.scope_id || identityFingerprint(state.identity) !== identityFingerprint(identity))) {
      await invalidate({forget: true});
      throw fail('当前身份范围已变化，原本机内容与队列已保留，请重新打开页面。', 'OFFLINE_SCOPE_CHANGED');
    }
    await cache.saveIdentity(identity, index.scope_id);
    if (generation !== context.generation || state.scope && state.scope !== index.scope_id) {
      await invalidate({forget: true}); throw fail('身份核实已过期，原本机数据已保留。', 'OFFLINE_SCOPE_CHANGED');
    }
    state.scope = index.scope_id; state.verifiedScope = index.scope_id; state.identity = identity;
    state.online = true; state.error = null; onIdentity(me); emit();
    return me;
  }
  async function authenticate(options = {}) {
    const generation = context.generation;
    let liveIdentity = null;
    try {
      const me = await identityProbe(context, '/auth/me', options);
      liveIdentity = safeIdentity(me);
      const index = await identityProbe(context, '/workbench-snapshot/index');
      return await adopt(me, index, generation);
    } catch (error) {
      if (generation !== context.generation) throw fail('身份核实已过期。', 'OFFLINE_SCOPE_CHANGED');
      state.verifiedScope = null;
      if ([401, 403].includes(error.status)) { await invalidate({forget: true}); throw error; }
      if (!networkFailure(error)) throw error;
      const cached = await cache.readIdentity();
      if (generation !== context.generation || !cached?.identity || !scopePattern.test(cached.scope)) throw error;
      if (liveIdentity && identityFingerprint(liveIdentity) !== identityFingerprint(cached.identity)) {
        await invalidate({forget: true});
        throw fail('当前身份已变化，请联网核实后重新打开。', 'OFFLINE_SCOPE_CHANGED');
      }
      state.scope = cached.scope; state.identity = safeIdentity(cached.identity); state.online = false;
      state.phase = 'offline'; emit(); return {...state.identity, offlineIdentity: true};
    }
  }
  function verify() {
    if (!context.authFlight) {
      const flight = authenticate().finally(() => { if (context.authFlight === flight) context.authFlight = null; });
      context.authFlight = flight;
    }
    return context.authFlight;
  }
  async function verifyScope() {
    if (!state.identity || !state.verifiedScope) return verify();
    const generation = context.generation, owner = state.scope;
    try {
      const index = await identityProbe(context, '/workbench-snapshot/index');
      if (generation !== context.generation || state.scope !== owner || index?.scope_id !== owner ||
          index.complete !== true || index.projection !== 'current') {
        await invalidate({forget: true}); throw fail('身份范围已变化，本机内容与队列已保留。', 'OFFLINE_SCOPE_CHANGED');
      }
      return state.identity;
    } catch (error) {
      state.verifiedScope = null;
      if ([401, 403].includes(error.status)) await invalidate({forget: true});
      throw error;
    }
  }
  return {authenticate, verify, verifyScope, invalidate};
}
function stateActions(context) {
  const {state, outbox, emit, online} = context;
  async function refresh() {
    const sequence = context.refreshSequence = (context.refreshSequence || 0) + 1;
    if (!state.scope) { emit(); return {...state}; }
    const owner = state.scope, generation = context.generation;
    const [pending, conflicts] = await Promise.all([outbox.list(owner), outbox.conflicts.list(owner)]);
    if (sequence !== context.refreshSequence || owner !== state.scope || generation !== context.generation) return {...state};
    state.pending = pending.length; state.conflicts = conflicts.length; state.online = online() && state.online;
    state.unsupported = pending.filter(row => !outbox.canDispatch(row)).length;
    if (state.phase !== 'syncing') state.phase = state.unsupported ? 'upgrade-required' : conflicts.length ? 'conflict' : state.online ?
      pending.length ? 'pending' : 'synced' : 'offline';
    emit(); return {...state};
  }
  async function queue() {
    if (!state.scope) return {operations: [], conflicts: []};
    const owner = state.scope, generation = context.generation;
    const result = {operations: await outbox.list(owner), conflicts: await outbox.conflicts.list(owner)};
    result.operations = result.operations.map(row => outbox.canDispatch(row) ? row : {...row, needs_upgrade: true});
    result.conflicts = result.conflicts.map(row => outbox.canDispatch(row.operation) ? row : {...row, needs_upgrade: true});
    return owner === state.scope && generation === context.generation ? result : {operations: [], conflicts: []};
  }
  async function resolve(key, choice, options = {}) {
    if (!state.scope) throw fail('请先核实身份。', 'OFFLINE_SCOPE_REQUIRED');
    const conflict = (await outbox.conflicts.list(state.scope)).find(row => row.key === key);
    if (conflict && !outbox.canDispatch(conflict.operation)) throw fail('此本机操作需新版页面处理，原内容已保留。', 'OFFLINE_UPGRADE_REQUIRED');
    const owner = state.scope, generation = context.generation;
    const checkDraft = captureConflictDraftGuard(conflict?.entity_id);
    const active = () => {
      if (options.signal?.aborted) throw new DOMException('请求已取消', 'AbortError');
      if (owner !== state.scope || generation !== context.generation) throw fail('身份已变化，原文已保留。', 'OFFLINE_SCOPE_CHANGED');
      checkDraft();
    };
    active(); await context.verifyScope(); active();
    const result = await outbox.resolve(key, choice, {scope: owner, assertActive: active,
      expected: options.expected, copyConfirmed: options.copyConfirmed});
    await refresh(); context.broadcast();
    if (result.resolution?.state === 'queued' && context.online()) context.scheduleRetry();
    return result;
  }
  return {refresh, queue, resolve};
}
function syncActions(context) {
  const {state, emit, outbox, snapshot, now, online} = context;
  async function run() {
    if (!online()) { state.verifiedScope = null; return context.refresh(); }
    if (context.cooldownUntil > now()) { context.scheduleRetry(); return context.refresh(); }
    try {
      await context.verify();
      if (!state.verifiedScope) return context.refresh();
      state.phase = 'syncing'; emit();
      await outbox.resume(state.scope);
      await outbox.drain();
      if (state.verifiedScope) await context.cache.captureDocuments();
      if (state.verifiedScope) {
        await snapshot.pull({date: today(now)});
        if (context.snapshotV2) await context.snapshotV2.pull({date: today(now)});
        if (context.lastTodoPath) {
          const date = offlineReadRoute(context.lastTodoPath).date;
          if ((await context.cache.entities()).some(row => row.needs_api_refresh && row.server?.date === date))
            await context.call(context.lastTodoPath);
        }
      }
      state.lastSuccess = now(); state.error = null;
    } catch (error) {
      state.error = error.message;
      if (error.status === 429) context.cooldownUntil = now() + 60000;
      if (error.status) state.online = true;
      else if (networkFailure(error)) state.online = false;
    }
    state.phase = 'idle';
    await context.refresh(); context.broadcast();
    if (state.pending && state.online && !context.stopped) context.scheduleRetry();
    return {...state};
  }
  function sync() {
    if (!context.syncFlight) context.syncFlight = run().finally(() => { context.syncFlight = null; });
    return context.syncFlight;
  }
  function scheduleRetry() {
    clearTimeout(context.timer);
    const owner = state.scope;
    if (!owner) return;
    outbox.retryable(owner).then(operations => {
      if (context.stopped || state.scope !== owner) return;
      if (!operations.length) return;
      const next = Math.min(...operations.map(row => row.next_attempt_at || 0));
      const delay = Math.max(100, next - now(), (context.cooldownUntil || 0) - now());
      clearTimeout(context.timer);
      context.timer = setTimeout(() => { if (!context.stopped) void sync(); }, delay);
      context.timer?.unref?.();
    }).catch(error => { state.error = error.message; emit(); });
  }
  return {sync, scheduleRetry};
}
async function unmanaged(context, path, options, guard) {
  try { guard(); return await context.request(path, options); }
  catch (error) {
    if ([401, 403].includes(error.status)) await context.invalidate({forget: true});
    throw error;
  }
}
async function mutateMemo(context, path, options, guard) {
  const value = await context.memos.mutate(path, options, guard);
  guard(); await context.refresh(); context.broadcast();
  if (context.online()) context.scheduleRetry();
  return value;
}
async function rememberRead(context, path, value, baseline, memo) {
  if (memo) return context.memos.remember(path, value, {baseline});
  try { return await context.cache.write(path, value, {baseline}); }
  catch (error) {
    if (['OFFLINE_RESPONSE_INVALID', 'OFFLINE_SCOPE_CHANGED', 'OFFLINE_CACHE_CHANGED'].includes(error.code)) throw error;
    context.state.error = error.message; context.emit(); return value;
  }
}
function labelRequestOptions(path, options, features) {
  return features.labelsV1 && path.startsWith('/note-entries') ?
    {...options, headers: {...options.headers, 'X-Note-Labels-Version': '1'}} : options;
}
function mutationActions(context) {
  const {state, cache, now, uuid, outbox, features} = context;
  async function mutate(path, options, route, guard) {
    guard();
    if (!state.scope || !state.identity) throw fail('请先联网读取此工作台，再保存离线内容。', 'OFFLINE_SCOPE_REQUIRED');
    const owner = state.scope, generation = context.generation;
    const active = () => {
      guard();
      if (owner !== state.scope || generation !== context.generation)
        throw fail('身份范围已变化，本次修改未保存，输入已保留。', 'OFFLINE_SCOPE_CHANGED');
    };
    const body = checkedBody(route, options, uuid), id = route.id || body.id;
    const old = await cache.entity(route.type + ':' + id), base = old?.server || null, visible = offlineValue(old);
    active();
    if (!route.create && !visible) throw fail('此事项尚未保存在本机，请联网读取后再操作。', 'OFFLINE_CACHE_MISS');
    const stamp = new Date(now()).toISOString(), method = options.method.toUpperCase();
    const local = {...visible, ...body, id, created_at: visible?.created_at || stamp, updated_at: stamp,
      deleted_at: method === 'DELETE' ? stamp : route.restore ? null : visible?.deleted_at || null,
      ...(route.create ? {completed: false, ...(route.type === 'template' ? {completed_days: 0, habit_status: 'todo'} : {})} : {}),
      ...(route.restore ? {deleted: false} : {})};
    if (body.template_id) {
      const template = offlineValue(await cache.entity('template:' + body.template_id));
      active();
      if (!template || template.deleted) throw fail('常用待办尚未保存在本机，请联网读取。', 'OFFLINE_CACHE_MISS');
      local.template_version = template.version; local.template_active = true;
    }
    active();
    const {entity} = await outbox.enqueue({scope: owner, entity_type: route.type, entity_id: id,
      method, path, body, base, local, ...(route.type === 'unscheduled_todo' ? {protocol: 4} : {}), assertActive: active});
    active();
    await context.refresh(); context.broadcast();
    if (context.online()) context.scheduleRetry();
    return structuredClone(entity.local);
  }
  async function call(path, input = {}, readRetried = false) {
    const {offlineGuard: guard = () => {}, ...options} = input;
    guard();
    const method = (options.method || 'GET').toUpperCase(), route = writableRoute(path, options, features);
    const memo = features.memos && memoRoute(path);
    const noteRoute = noteMutationRoute(path, options, features);
    if (noteRoute) return context.noteMutations.mutate(path, options, noteRoute, guard);
    if (path === '/auth/me' && method === 'GET') return options.context || options.signal ? context.authenticate(options) : context.verify();
    if (['/auth/login', '/auth/logout'].includes(path) && method === 'POST') {
      const value = await context.request(path, labelRequestOptions(path, options, features)); await context.invalidate({forget: true}); return value;
    }
    if (route) return mutate(path, options, route, guard);
    if (memo && method === 'PUT') return mutateMemo(context, path, options, guard);
    if (method !== 'GET' || !offlineReadRoute(path)) return unmanaged(context, path, options, guard);
    if (offlineReadRoute(path).kind === 'todo') context.lastTodoPath = path;
    try {
      if (context.online() && state.identity) await context.verifyScope();
      guard();
      const owner = state.scope, generation = context.generation;
      const baseline = owner ? await (memo ? context.memos.fence(path) : cache.fence(path)) : undefined;
      guard();
      const value = await context.request(path, labelRequestOptions(path, options, features));
      guard();
      if (owner !== state.scope || generation !== context.generation) throw fail('身份范围已变化，本次读取已取消。', 'OFFLINE_SCOPE_CHANGED');
      if (offlineReadRoute(path).kind === 'todo') state.partial = false;
      if (!state.scope) return value;
      return await rememberRead(context, path, value, baseline, memo);
    } catch (error) {
      if ([401, 403].includes(error.status)) { await context.invalidate({forget: true}); throw error; }
      if (error.code === 'OFFLINE_CACHE_CHANGED' && !readRetried) return call(path, input, true);
      if (!networkFailure(error)) throw error;
      state.verifiedScope = null; state.online = false;
      if (memo) { const value = await context.memos.project(path); guard(); await context.refresh(); return value; }
      const cached = await cache.read(path);
      const kind = offlineReadRoute(path).kind;
      if (kind === 'overview') state.cachedAt = cached.saved_at;
      if (kind === 'todo') state.partial = cached.data.offline_partial === true;
      const data = ['legacy', ...(!features.notes ? ['note_entries', 'note_entry'] : []), 'memos', 'memo_note'].includes(kind) ?
        {...cached.data, can_edit: false, ...(Array.isArray(cached.data.entries) ?
          {entries: cached.data.entries.map(entry => ({...entry, can_edit: false}))} : {})} : cached.data;
      await context.refresh(); return data;
    }
  }
  return {call, mutate};
}
function lifecycleActions(context) {
  let stop = () => {};
  const broadcast = () => context.channel?.postMessage({type: 'changed', scope: context.state.scope});
  function start({window = globalThis.window, document = globalThis.document, BroadcastChannel = globalThis.BroadcastChannel} = {}) {
    stop(); context.stopped = false;
    const sync = () => { if (document?.visibilityState !== 'hidden') void context.sync(); };
    const offline = () => { context.state.verifiedScope = null; void context.refresh(); };
    window?.addEventListener('online', sync); window?.addEventListener('focus', sync);
    window?.addEventListener('haoduoyu:sync-request', sync); window?.addEventListener('offline', offline);
    document?.addEventListener('visibilitychange', sync);
    const timer = setInterval(sync, 300000); timer?.unref?.();
    if (BroadcastChannel) {
      context.channel = new BroadcastChannel('haoduoyu-offline-status-v1');
      context.channel.onmessage = event => {
        if (event.data?.type === 'changed' && event.data.scope === context.state.scope) void context.refresh();
      };
    }
    stop = () => {
      context.stopped = true; clearTimeout(context.timer); clearInterval(timer); context.channel?.close(); context.channel = null;
      window?.removeEventListener('online', sync); window?.removeEventListener('focus', sync);
      window?.removeEventListener('haoduoyu:sync-request', sync); window?.removeEventListener('offline', offline);
      document?.removeEventListener('visibilitychange', sync);
    };
    sync(); return stop;
  }
  return {start, stop: () => stop(), broadcast};
}
export function createOfflineRuntime(options) {
  const context = runtimeContext(options);
  Object.assign(context, identityActions(context), stateActions(context), syncActions(context), lifecycleActions(context));
  Object.assign(context, mutationActions(context));
  context.noteMutations = createNoteMutations(context);
  const drafts = createDraftJournal({db: context.db, getScope: () => context.state.scope, getGeneration: () => context.generation, now: context.now});
  return {call: context.call, sync: context.sync, start: context.start, stop: context.stop, refresh: context.refresh,
    readMemo: path => context.memos.project(path),
    queue: context.queue, resolve: context.resolve, invalidate: context.invalidate, state: context.state,
    localRead: async path => (await context.cache.read(path)).data,
    retainDrafts: drafts.capture, retainedDrafts: drafts.list, flushDrafts: drafts.flush,
    subscribe(callback) { context.listeners.add(callback); callback({...context.state}); return () => context.listeners.delete(callback); }};
}

let singleton = null, initialization = null;
const readyListeners = new Set();
export function getOfflineRuntime() { return singleton; }
export function onOfflineRuntime(callback) {
  readyListeners.add(callback); if (singleton) callback(singleton);
  return () => readyListeners.delete(callback);
}
export async function offlineRequest(path, options, request, onIdentity, assertActive = () => {}) {
  if (!initialization) initialization = openOfflineDB().then(db => {
    singleton = createOfflineRuntime({db, request, onIdentity});
    for (const callback of readyListeners) callback(singleton);
    return singleton;
  });
  let runtime;
  try { runtime = await initialization; }
  catch {
    assertActive();
    if (writableRoute(path, options, OFFLINE_FEATURES) || noteMutationRoute(path, options, OFFLINE_FEATURES) ||
        OFFLINE_FEATURES.memos && memoRoute(path) && options.method?.toUpperCase() === 'PUT')
      throw fail('浏览器无法保存本机数据，本次修改未保存；输入已保留。', 'OFFLINE_STORAGE_UNAVAILABLE');
    return request(path, options);
  }
  assertActive();
  const managed = offlineReadRoute(path) || writableRoute(path, options, OFFLINE_FEATURES) || noteMutationRoute(path, options, OFFLINE_FEATURES) ||
    ['/auth/me', '/auth/login', '/auth/logout'].includes(path);
  if (!managed) return runtime.call(path, {...options, offlineGuard: assertActive});
  const {envelope = false, ...opts} = options;
  const value = await runtime.call(path, {...opts, offlineGuard: assertActive});
  return envelope ? {data: value} : value;
}
