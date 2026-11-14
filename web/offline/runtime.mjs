import {openOfflineDB, offlineValue, entityKey} from './db.mjs';
import {createOfflineCache, identityFingerprint, offlineReadRoute, safeIdentity} from './cache.mjs';
import {createOutbox,STORED_COOLDOWN_MAX_MS} from './outbox.mjs';
import {createSnapshotSync} from './sync.mjs';
import {createWindowSnapshotSync,WINDOW_REFRESH_MS} from './window-sync.mjs';
/** Longest wait between background refreshes after repeated read failures. */
export const READ_PAUSE_MAX_MS = 15 * 60000;
import {createNoteMutations, noteMutationRoute} from './note-mutations.mjs';
import {createDraftJournal} from './drafts.mjs';
import {captureConflictDraftGuard} from './conflict-draft-guards.mjs';
import {createMemoOfflineAdapter, memoRoute} from './memos.mjs';
import {MAX_TIMER_DELAY, retryUntil} from '../core/retry-after.mjs';

export const OFFLINE_FEATURES = Object.freeze({todos: true, notes: true, memos: true, snapshotV2: true, labelsV1: true});
const scopePattern = /^[a-f0-9]{64}$/;
const uuidPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const networkFailure = error => error?.code === 'NETWORK_UNAVAILABLE' || error?.code === 'OFFLINE_NETWORK';
const fail = (message, code) => Object.assign(new Error(message), {code});
const today = now => new Date(now() + 8 * 3600000).toISOString().slice(0, 10);
const offlineError = () => fail('当前离线，此操作需联网；输入内容已保留。', 'OFFLINE_NETWORK');
const SCOPE_INDEX = '/workbench-snapshot/index', SCOPE_ONLY = '/workbench-snapshot/scope';
/* The page only needs the scope identity, so the production runtime asks the small scope endpoint instead of downloading
 * the whole index (seconds on a slow link). A server without that endpoint answers 404 and the full index is used. */
async function scopeProbe(context, options = {}) {
  if (!context.scopeProbe) return identityProbe(context, SCOPE_INDEX, options);
  try { return await identityProbe(context, SCOPE_ONLY, options); }
  catch (error) { if (error?.status !== 404) throw error; return identityProbe(context, SCOPE_INDEX, options); }
}
// A check that succeeded moments ago still holds: identity changes go through invalidate(), which clears it at once.
function recentScope({scopeReuseMs, scopeCheckedAt, now, state}) {
  const age = now() - scopeCheckedAt;
  return Boolean(scopeReuseMs && state.identity && state.verifiedScope && state.verifiedScope === state.scope &&
    scopeCheckedAt && age >= 0 && age < scopeReuseMs);
}
async function identityProbe(context, path, options = {}) {
  const scope = context.state.scope, generation = context.generation;
  if (scope) {
    const deadline = Math.max(context.cooldownUntil || 0, await context.outbox.cooldown(scope));
    if (generation !== context.generation || scope !== context.state.scope) throw fail('数据范围已变化。', 'OFFLINE_SCOPE_CHANGED');
    if (deadline > context.now()) throw Object.assign(new Error('请求较多，请稍后重试。'),
      {status: 429, rateLimitedUntil: deadline, retryAfterMs: deadline - context.now()});
  }
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
    onIdentity = () => {}, features = OFFLINE_FEATURES, scopeProbe = false, scopeReuseMs = 0,
    progressiveSnapshot = false,windowedSnapshot=false} = options;
  const state = {scope: null, verifiedScope: null, identity: null, online: online(), phase: 'idle', pending: 0,
    conflicts: 0, unsupported: 0, lastSuccess: null, historyRemaining: 0,historyIncomplete:windowedSnapshot,
    cachedAt: null, error: null, errorStage: null, ready: true};
  const listeners = new Set();
  const emit = () => { for (const callback of listeners) callback({...state}); };
  const cache = createOfflineCache({db, getScope: () => state.scope, getGeneration: () => context.generation, now,
    labelsV1: features.labelsV1 === true});
  const context = {db, request, now, uuid, online, onIdentity, features, state, cache, emit, listeners,
    generation: 0, authFlight: null, scopeFlight: null, syncFlight: null, timer: null, channel: null, stopped: false,
    windowedSnapshot,syncNotBefore:0,
    scopeProbe: scopeProbe === true, scopeReuseMs: Math.max(0, Math.min(Number(scopeReuseMs) || 0, 60000)), scopeCheckedAt: 0, pulledAt: 0};
  const send = async (path, opts) => {
    if (opts?.method && !['GET', 'HEAD'].includes(opts.method.toUpperCase()) &&
        !writableRoute(path, opts, features) && !noteMutationRoute(path, opts, features) &&
        !(features.memos && memoRoute(path) && opts.method.toUpperCase() === 'PUT'))
      throw fail('此本机操作需新版页面处理，原内容已保留。', 'OFFLINE_UPGRADE_REQUIRED');
    if (!online() || !state.verifiedScope || state.verifiedScope !== state.scope) throw offlineError();
    const owner = state.scope, generation = context.generation;
    const checkCooldown = async () => {
      const deadline = Math.max(context.cooldownUntil || 0, await context.outbox.cooldown(owner));
      if (owner !== state.scope || generation !== context.generation) throw fail('数据范围已变化。', 'OFFLINE_SCOPE_CHANGED');
      if (deadline > now()) throw Object.assign(new Error('请求较多，请稍后重试。'),
        {status: 429, rateLimitedUntil: deadline, retryAfterMs: deadline - now()});
    };
    try {
      await checkCooldown();
      if (opts?.method && !['GET', 'HEAD'].includes(opts.method.toUpperCase())) await context.verifyScope();
      if (!state.verifiedScope || owner !== state.scope || generation !== context.generation) throw offlineError();
      await checkCooldown();
      const labelOpts = features.labelsV1 && path.startsWith('/note-entries') ?
        {...opts, headers: {...opts?.headers, 'X-Note-Labels-Version': '1'}} : opts;
      const result = await request(path, labelOpts);
      if (owner !== state.scope || generation !== context.generation) throw fail('身份范围已变化。', 'OFFLINE_SCOPE_CHANGED');
      return result;
    } catch (error) {
      if (owner !== state.scope || generation !== context.generation)
        throw fail('数据范围已变化。', 'OFFLINE_SCOPE_CHANGED');
      if ([401, 403].includes(error.status) && generation === context.generation) await context.invalidate({forget: true});
      throw error;
    }
  };
  context.outbox = createOutbox({db, request: send, getScope: () => state.scope, now, uuid, timeout: options.timeout,
    enabledTypes: [...(features.todos ? ['todo', 'template', 'unscheduled_todo'] : []), ...(features.notes ? ['note_entry'] : []),
      ...(features.memos ? ['memo_note', 'memo_group'] : [])],
    supportedProtocols: features.memos ? [1, 2, 3, 4, 5] : [1, 3, 4, 5], supportedDependencies: features.memos === true,
    resolutionReceipts: true});
  context.snapshot = createSnapshotSync({db, request: send, getScope: () => state.scope, now, progressive:progressiveSnapshot});
  context.snapshotV2 = windowedSnapshot?createWindowSnapshotSync({db,request:send,getScope:()=>state.scope,
    getGeneration:()=>context.generation,now,uuid}):features.snapshotV2 === true ?
    createSnapshotSync({db, request: send, getScope: () => state.scope, now,version: 2, progressive:progressiveSnapshot}) : null;
  context.memos = createMemoOfflineAdapter({db, cache, outbox: context.outbox, getScope: () => state.scope,
    getGeneration: () => context.generation, now, uuid});
  return context;
}
async function adoptIdentity(context, me, index, generation, invalidate) {
  const {cache, state, emit, onIdentity} = context;
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
  context.scopeCheckedAt = context.now();
  state.online = true; onIdentity(me); emit();
  return me;
}
function identityActions(context) {
  const {cache, state, emit, request, onIdentity} = context;
  async function invalidate({forget = false} = {}) {
    context.generation++; context.scopeCheckedAt = 0; context.pulledAt = 0;context.syncNotBefore=0;context.readFailures=0;context.readPauseUntil=0;
    clearTimeout(context.historyTimer); context.historyRetry=false; state.historyRemaining = 0;
    context.authFlight = null;
    context.scopeFlight = null;
    context.cooldownUntil = 0;
    state.scope = null; state.verifiedScope = null; state.identity = null; state.pending = 0; state.conflicts = 0; state.unsupported = 0;
    state.phase = 'paused';
    if (forget) await cache.forgetIdentity();
    emit();
  }
  const adopt = (me, index, generation) => adoptIdentity(context, me, index, generation, invalidate);
  async function authenticate(options = {}) {
    const generation = context.generation;
    let liveIdentity = null;
    try {
      const me = await identityProbe(context, '/auth/me', options);
      liveIdentity = safeIdentity(me);
      let index;
      try {
        index = await scopeProbe(context, {suppressAuthRedirect: true});
      } catch (error) {
        // An index failure is not proof that /auth/me requires a password.
        // Still invalidate the verified scope below and require a fresh check.
        error.offlineScopeFailure = true;
        throw error;
      }
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
  async function verifyScopeOnce() {
    if (!state.identity || !state.verifiedScope) return verify();
    const generation = context.generation, owner = state.scope;
    try {
      const index = await scopeProbe(context);
      if (generation !== context.generation || state.scope !== owner || index?.scope_id !== owner ||
          index.complete !== true || index.projection !== 'current') {
        await invalidate({forget: true}); throw fail('身份范围已变化，本机内容与队列已保留。', 'OFFLINE_SCOPE_CHANGED');
      }
      context.scopeCheckedAt = context.now();
      return state.identity;
    } catch (error) {
      if (generation !== context.generation || state.scope !== owner) throw fail('数据范围已变化。', 'OFFLINE_SCOPE_CHANGED');
      state.verifiedScope = null;
      if ([401, 403].includes(error.status)) await invalidate({forget: true});
      throw error;
    }
  }
  function verifyScope() {
    if (recentScope(context)) return Promise.resolve(state.identity);
    if (!context.scopeFlight) {
      const flight = verifyScopeOnce().finally(() => { if (context.scopeFlight === flight) context.scopeFlight = null; });
      context.scopeFlight = flight;
    }
    return context.scopeFlight;
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
      pending.length ? 'pending' : state.historyRemaining ? 'partial' : 'synced' : 'offline';
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
// A failed background read slows only the background refresh: what the person opens, reads or saves is never held
// back by it, and nothing is stored, so reloading the page starts fresh.
function pauseFailedRead(context,stage,error) {
  if(!context.windowedSnapshot||!['identity','cache','snapshot'].includes(stage)||[401,403].includes(error.status))return;
  context.readFailures=Math.min(5,(context.readFailures||0)+1);
  const delay=Math.min(READ_PAUSE_MAX_MS,60000*2**(context.readFailures-1));
  context.readPauseUntil=Math.max(context.readPauseUntil||0,context.now()+delay,error.rateLimitedUntil||0);
}
// A refused background read only pauses the background refresh; a refused sign-in check or save pauses requests,
// stored for at most two minutes so a reload cannot stay locked.
async function pauseRefused(context,stage,error,owner,active) {
  const {now} = context;
  if (error.status !== 429) return;
  const deadline = Math.min(now() + STORED_COOLDOWN_MAX_MS,
    Number.isSafeInteger(error.rateLimitedUntil) ? error.rateLimitedUntil : retryUntil(now(), error.retryAfterMs));
  if (stage === 'snapshot') context.historyRetry = true;
  if (['cache','snapshot'].includes(stage)) { context.readPauseUntil = Math.max(context.readPauseUntil || 0, deadline); return; }
  context.cooldownUntil = Math.max(context.cooldownUntil || 0, deadline);
  if (!owner) return;
  const assertActive = () => { if (!active()) throw fail('数据范围已变化。', 'OFFLINE_SCOPE_CHANGED'); };
  try { await context.outbox.setCooldown(owner, context.cooldownUntil, assertActive); }
  catch { /* The in-memory deadline still protects this session. */ }
}
async function runSync(context) {
  const {state, emit, outbox, snapshot, now, online} = context;
  if (!online()) { state.verifiedScope = null; return context.refresh(); }
  let stage = 'identity';
  let owner = state.scope, generation = context.generation;
  const active = () => generation === context.generation && owner === state.scope;
  try {
    if (state.scope) context.cooldownUntil = Math.max(context.cooldownUntil || 0, await outbox.cooldown(state.scope));
    if (!active()) return {...state};
    if (context.cooldownUntil > now() || (context.readPauseUntil || 0) > now()) {
      context.scheduleRetry();
      if(state.historyRemaining||context.historyRetry)context.scheduleHistory();
      return context.refresh();
    }
    // The scope identity covers the signed-in account too, so a check from moments ago spares a second sign-in round trip.
    if (!recentScope(context)) await context.verify();
    if (generation !== context.generation || owner && owner !== state.scope) return {...state};
    if (!state.verifiedScope) return context.refresh();
    owner = state.scope; generation = context.generation;
    state.phase = 'syncing'; emit();
    stage = 'outbox';
    await outbox.resume(state.scope);
    if (!active()) return {...state};
    const drained = await outbox.drain();
    if (!active()) return {...state};
    if (drained.rateLimitedUntil > now()) throw Object.assign(new Error('请求较多，请稍后重试。'),
      {status: 429, rateLimitedUntil: drained.rateLimitedUntil});
    stage = 'cache';
    if (state.verifiedScope && !((context.readPauseUntil || 0) > now())) await context.cache.captureDocuments();
    if (!active()) return {...state};
    // Saves answer with the stored record, so a burst of quick edits needs one full refresh, not one per click.
    const pulled = now() - context.pulledAt;
    if (state.verifiedScope && !((context.readPauseUntil || 0) > now()) &&
        !(state.historyRemaining===0&&context.scopeReuseMs && context.pulledAt && pulled >= 0 && pulled < context.scopeReuseMs)) {
      stage = 'snapshot';
      const result=await (context.snapshotV2 || snapshot).pull({date: today(now)});
      if (!active()) return {...state};
      state.historyRemaining=result.remaining_dates||0;
      if(context.windowedSnapshot)state.historyIncomplete=true;
      context.historyRetry=false;
      if(!state.historyRemaining&&(!context.windowedSnapshot||result.status==='synced'))context.pulledAt = now();
      if (context.lastTodoPath) {
        stage = 'cache';
        const date = offlineReadRoute(context.lastTodoPath).date;
        if ((await context.cache.entities()).some(row => row.needs_api_refresh && row.server?.date === date))
          await context.call(context.lastTodoPath);
      }
    }
    if (!active()) return {...state};
    if(!state.historyRemaining&&(!context.windowedSnapshot||context.pulledAt))
      state.lastSuccess=context.windowedSnapshot?context.pulledAt:now();
    state.error = null; state.errorStage = null;
    context.readFailures=0;
  } catch (error) {
    if (!active()) return {...state};
    pauseFailedRead(context,stage,error);
    await pauseRefused(context,stage,error,owner,active);
    if (!active()) return {...state};
    state.error = error.message; state.errorStage = stage;
    if (error.status) state.online = true;
    else if (networkFailure(error)) state.online = false;
  }
  state.phase = 'idle';
  await context.refresh();
  if (!active()) return {...state};
  context.broadcast();
  if (state.pending && state.online && !context.stopped) context.scheduleRetry();
  if((state.historyRemaining||context.historyRetry)&&state.online&&(!state.error||Math.max(context.cooldownUntil||0,context.readPauseUntil||0)>now()))
    context.scheduleHistory();
  return {...state};
}
function syncActions(context) {
  const {state, emit, outbox, snapshot, now, online} = context;
  const run = () => runSync(context);
  function scheduleHistory() {
    clearTimeout(context.historyTimer);
    if(context.stopped||context.windowedSnapshot)return;
    const owner=state.scope,generation=context.generation;
    context.historyTimer=setTimeout(()=>{
      if(!context.stopped&&owner===state.scope&&generation===context.generation&&online())void sync();
    },Math.min(MAX_TIMER_DELAY,Math.max(500,(context.cooldownUntil||0)-now(),(context.readPauseUntil||0)-now())));
    context.historyTimer?.unref?.();
  }
  function sync({rerun = false} = {}) {
    if (context.syncFlight) {
      // Overlapping sync() must survive in-flight failures, not only timer reruns.
      if(!context.windowedSnapshot||rerun)context.syncAgain = true;
      return context.syncFlight;
    }
    if(context.windowedSnapshot&&!rerun&&context.syncNotBefore>now())return context.refresh();
    if(context.windowedSnapshot)context.syncNotBefore=now()+WINDOW_REFRESH_MS;
    context.syncFlight = run().finally(() => {
      context.syncFlight = null;
      const again = context.syncAgain; context.syncAgain = false;
      if (again && !context.stopped) queueMicrotask(() => { if (!context.stopped && online()) void sync(); });
    });
    return context.syncFlight;
  }
  function scheduleRetry() {
    clearTimeout(context.timer);
    const owner = state.scope, generation = context.generation;
    if (!owner) return;
    outbox.retryable(owner).then(async operations => {
      if (context.stopped || state.scope !== owner || context.generation !== generation) return;
      if (!operations.length) return;
      const next = Math.min(...operations.map(row => row.next_attempt_at || 0));
      const deadline = Math.max(context.cooldownUntil || 0, context.readPauseUntil || 0, await outbox.cooldown(owner));
      if (context.stopped || state.scope !== owner || context.generation !== generation) return;
      const delay = Math.min(MAX_TIMER_DELAY, Math.max(100, next - now(), deadline - now()));
      clearTimeout(context.timer);
      context.timer = setTimeout(() => { if (!context.stopped) void sync({rerun: true}); }, delay);
      context.timer?.unref?.();
    }).catch(error => { if (!context.stopped && state.scope === owner && context.generation === generation) { state.error = error.message; emit(); } });
  }
  return {sync, scheduleRetry, scheduleHistory};
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
    context.state.error = error.message; context.state.errorStage = 'cache'; context.emit(); return value;
  }
}
function labelRequestOptions(path, options, features) {
  return features.labelsV1 && path.startsWith('/note-entries') ?
    {...options, headers: {...options.headers, 'X-Note-Labels-Version': '1'}} : options;
}
async function readCachedOffline(context, path, guard) {
  const {state, cache, features} = context;
  state.verifiedScope = null; state.online = false;
  const memo = features.memos && memoRoute(path);
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
    // A source future item can be copied to a date using the same stable ID.
    // Never replace an already cached or queued daily todo with that ID.
    if (route.create && route.type === 'todo' && visible) {
      if (!visible.deleted_at && !visible.deleted && visible.date === body.date && visible.text === body.text &&
          (visible.template_id || undefined) === (body.template_id || undefined)) return structuredClone(visible);
      throw fail(visible.date ? `此待办已安排到 ${visible.date}，原未来待办仍保留。` : '该待办标识已使用，原未来待办仍保留。', 'TODO_ID_IN_USE');
    }
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
    // A save the person just made gets one attempt even while background reads are paused; another failure pauses again.
    context.readPauseUntil = 0;
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
      return readCachedOffline(context, path, guard);
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
    const timer = setInterval(sync,context.windowedSnapshot?WINDOW_REFRESH_MS:300000); timer?.unref?.();
    if (BroadcastChannel) {
      context.channel = new BroadcastChannel('haoduoyu-offline-status-v1');
      context.channel.onmessage = event => {
        if (event.data?.type === 'changed' && event.data.scope === context.state.scope) void context.refresh();
      };
    }
    stop = () => {
      context.stopped = true; clearTimeout(context.timer); clearTimeout(context.historyTimer);
      clearInterval(timer); context.channel?.close(); context.channel = null;
      window?.removeEventListener('online', sync); window?.removeEventListener('focus', sync);
      window?.removeEventListener('haoduoyu:sync-request', sync); window?.removeEventListener('offline', offline);
      document?.removeEventListener('visibilitychange', sync);
    };
    sync(); return stop;
  }
  return {start, stop: () => {
    context.stopped=true;clearTimeout(context.historyTimer);stop();
  }, broadcast};
}
async function readTodoMonthSnapshot(context, month) {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) || month.startsWith('0000')) return null;
  if (context.syncFlight) {
    let timer;
    const completed = await Promise.race([context.syncFlight.then(() => true),
      new Promise(resolve => { timer = setTimeout(() => resolve(false), 5000); })]);
    clearTimeout(timer);
    if (!completed) return null;
  }
  const owner = context.state.scope, generation = context.generation;
  if (!owner || context.state.verifiedScope !== owner) return null;
  const result = await context.db.transaction(['entities', 'meta'], 'readonly', async tx => {
    let snapshot = await tx.get('meta', entityKey(owner, 'snapshot-v2'));
    const progress=await tx.get('meta',entityKey(owner,'snapshot-v2-progress'));
    if(progress?.value?.partial&&progress.value.index?.scope_id===owner&&
      (progress.value.verified_at||0)>=(snapshot?.value?.verified_at||0)) {
      if(!progress.value.index.dates.filter(row=>row.date.startsWith(month+'-')).every(row=>progress.value.covered_dates.includes(row.date)))return null;
      snapshot=progress;
    }
    const index = snapshot?.value?.index, verified = snapshot?.value?.verified_at;
    if (index?.complete !== true || index.scope_id !== owner || !Array.isArray(index.entities) ||
        !Number.isFinite(verified) || verified > context.now() || context.now() - verified > 60000) return null;
    const entities = (await tx.getAll('entities')).filter(row => row.scope === owner);
    const byId = new Map(entities.map(row => [row.entity_id, row]));
    const items = new Map();
    for (const expected of index.entities.filter(row => row.entity_type === 'todo' &&
        row.date?.startsWith(month + '-') && !row.deleted_at)) {
      const entity = byId.get(expected.entity_id);
      if (!entity?.server || entity.remote_missing || entity.snapshot_hash !== expected.content_hash ||
          entity.server.date !== expected.date || entity.server.updated_at !== expected.updated_at || entity.server.deleted_at) return null;
      items.set(expected.entity_id, {...entity.server, completed: Boolean(entity.server.completed)});
    }
    for (const entity of entities) {
      const server = entity.server;
      if (entity.entity_id.startsWith('todo:') && !entity.dirty && !entity.remote_missing && server &&
          !server.deleted_at && server.date?.startsWith(month + '-') && !items.has(entity.entity_id)) return null;
    }
    for (const entity of entities.filter(row => row.entity_id.startsWith('todo:') && row.dirty)) {
      items.delete(entity.entity_id);
      const value = offlineValue(entity);
      if (value && !value.deleted && !value.deleted_at && value.date?.startsWith(month + '-'))
        items.set(entity.entity_id, {...value, completed: Boolean(value.completed)});
    }
    const days = {};
    for (const item of items.values()) (days[item.date] ||= []).push(item);
    return {days, verified_at: verified};
  });
  if (generation !== context.generation || owner !== context.state.scope || context.state.verifiedScope !== owner)
    throw fail('数据范围已变化。', 'OFFLINE_SCOPE_CHANGED');
  return result;
}
async function acceptMovedTodo(context, {source, todo}, token) {
  const active = () => token && context.state.scope === token.scope &&
    context.state.verifiedScope === token.scope && context.generation === token.generation;
  if (!active() || !source?.id || source.id !== todo?.id) return 'refresh';
  const ids = ['unscheduled_todo:' + source.id, 'todo:' + source.id];
  return context.db.transaction(['entities', 'outbox', 'conflicts', 'meta'], 'readwrite', async tx => {
    if (!active()) return 'refresh';
    const [operations, conflicts] = await Promise.all([tx.getAll('outbox'), tx.getAll('conflicts')]);
    if (operations.some(op => op.scope === token.scope && ids.includes(op.entity_id) && !['done', 'archived'].includes(op.status)) ||
        conflicts.some(conflict => conflict.scope === token.scope && conflict.resolved_at === null &&
          ids.includes(conflict.operation?.entity_id || conflict.entity_id))) return 'pending';
    const keys = ids.map(id => entityKey(token.scope, id));
    const old = await Promise.all(keys.map(key => tx.get('entities', key)));
    if (!active()) return 'refresh';
    if (old.some(entity => entity?.dirty)) return 'pending';
    if (old.some((entity, i) => entity?.server?.version > [source, todo][i].version)) return 'refresh';
    for (const [i, row] of [source, todo].entries()) {
      await tx.put('entities', {...old[i], key: keys[i], scope: token.scope, entity_id: ids[i],
        server: structuredClone(row), remote_missing: false, ...(i === 1 ? {needs_api_refresh: false} : {})});
    }
    if (!active()) throw fail('数据范围已变化。', 'OFFLINE_SCOPE_CHANGED');
    const day = await tx.get('meta', entityKey(token.scope, 'get:/todos?date=' + encodeURIComponent(todo.date)));
    if (!active()) throw fail('数据范围已变化。', 'OFFLINE_SCOPE_CHANGED');
    return Array.isArray(day?.data?.items) ? 'saved' : 'refresh';
  });
}
export function createOfflineRuntime(options) {
  const context = runtimeContext(options);
  Object.assign(context, identityActions(context), stateActions(context), syncActions(context), lifecycleActions(context));
  Object.assign(context, mutationActions(context));
  context.noteMutations = createNoteMutations(context);
  const drafts = createDraftJournal({db: context.db, getScope: () => context.state.scope, getGeneration: () => context.generation, now: context.now});
  function captureRateLimitContext() {
    const scope = context.state.scope;
    return scope && context.state.verifiedScope === scope ? {scope, generation: context.generation} : null;
  }
  async function recordRateLimit(token, delay) {
    const active = () => {
      if (!token || context.generation !== token.generation || context.state.scope !== token.scope ||
          context.state.verifiedScope !== token.scope) throw fail('数据范围已变化。', 'OFFLINE_SCOPE_CHANGED');
    };
    try {
      active();
      const deadline = Math.min(context.now() + STORED_COOLDOWN_MAX_MS, retryUntil(context.now(), delay));
      context.cooldownUntil = Math.max(context.cooldownUntil || 0, deadline);
      await context.outbox.setCooldown(token.scope, context.cooldownUntil, active);
      active();
      if (!context.stopped) context.scheduleRetry();
    } catch { /* Preserve the request failure and any in-memory deadline. */ }
  }
  async function callWithRateLimit(path, options) {
    const token = captureRateLimitContext();
    try { return await context.call(path, options); }
    catch (error) {
      if (error.status === 429) await recordRateLimit(token, error.retryAfterMs);
      throw error;
    }
  }
  return {call: callWithRateLimit, sync: context.sync, start: context.start, stop: context.stop, refresh: context.refresh,
    async downloadDate(date) {
      if(!context.windowedSnapshot)throw fail('请更新页面后下载历史日期。','OFFLINE_UPGRADE_REQUIRED');
      await context.verifyScope();
      const result=await context.snapshotV2.pull({historyDate:date});
      await context.refresh();return result;
    },
    captureRateLimitContext, recordRateLimit,
    readMemo: path => context.memos.project(path),
    readTodoMonthSnapshot: month => readTodoMonthSnapshot(context, month),
    async findTodo(id) {
      const owner = context.state.scope, generation = context.generation;
      if (!owner) throw fail('请先读取工作台数据，原未来待办仍保留。', 'OFFLINE_SCOPE_REQUIRED');
      const entity = await context.cache.entity('todo:' + id);
      if (owner !== context.state.scope || generation !== context.generation) throw fail('账号已切换，原未来待办仍保留。', 'OFFLINE_SCOPE_CHANGED');
      return structuredClone(offlineValue(entity) || null);
    },
    // Confirmed server moves are reflected without discarding local edits.
    acceptMovedTodo: (move, token) => acceptMovedTodo(context, move, token),
    queue: context.queue, resolve: context.resolve, invalidate: context.invalidate, state: context.state,
    localRead: async path => (await context.cache.read(path)).data,
    retainDrafts: drafts.capture, retainedDrafts: drafts.list, retainedDraftRecords: drafts.records,
    purgeVerifiedNoteDrafts: drafts.purgeVerified, purgeUserDeletedNoteDrafts: drafts.purgeUserDeleted,
    discardUnsentNoteDraft: drafts.discardUnsent, discardSelectedDraft: drafts.discardSelected,
    flushDrafts: drafts.flush,
    subscribe(callback) { context.listeners.add(callback); callback({...context.state}); return () => context.listeners.delete(callback); }};
}

let singleton = null, initialization = null;
const readyListeners = new Set();
export function getOfflineRuntime() { return singleton; }
export function captureOfflineRateLimitContext() {
  const token = singleton?.captureRateLimitContext();
  return token ? {runtime: singleton, token} : null;
}
export async function recordOfflineRateLimit(captured, delay) {
  if (captured?.runtime === singleton) await singleton.recordRateLimit(captured.token, delay);
}
export function onOfflineRuntime(callback) {
  readyListeners.add(callback); if (singleton) callback(singleton);
  return () => readyListeners.delete(callback);
}
export async function offlineRequest(path, options, request, onIdentity, assertActive = () => {}) {
  if (!initialization) initialization = openOfflineDB().then(db => {
    singleton = createOfflineRuntime({db, request, onIdentity, scopeProbe: true, scopeReuseMs: 30000,windowedSnapshot:true});
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
