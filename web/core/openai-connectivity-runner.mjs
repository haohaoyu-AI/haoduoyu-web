const endpoint = '/openai-review/connectivity';
const terminal = value => ['succeeded', 'failed', 'uncertain'].includes(value?.status);
const noDispatch = new Set(['OPENAI_REVIEW_NOT_CONFIGURED', 'OPENAI_REVIEW_INVALID_KEY_FORMAT',
  'OPENAI_CONNECTIVITY_TEST_LIMIT', 'VALIDATION_ERROR', 'FORBIDDEN', 'UNAUTHORIZED', 'CSRF', 'MEMOS_RATE_LIMIT']);
const unknown = '最小测试结果尚未确认，请只读核查状态。不会自动重复调用。';

function createConnectivityContext({storage, key, onChange}) {
  const context = {active: true, generation: 0};
  const state = {result: null, pendingId: '', busy: false, error: '', startedAt: 0, operation: ''};
  try {
    state.pendingId = storage.getItem(key) || '';
    const timing = JSON.parse(storage.getItem(key + ':started'));
    if (timing?.id === state.pendingId && Number.isFinite(timing.at)) state.startedAt = timing.at;
  } catch { /* A new POST still requires successful storage writes and readback. */ }
  const change = () => { if (context.active) onChange({...state}); };
  const retain = id => {
    storage.setItem(key, id);
    if (storage.getItem(key) !== id) throw new Error('无法保存最小测试编号，未发起新的 API 调用。');
    state.pendingId = id;
  };
  const clear = id => {
    if (storage.getItem(key) === id) {
      storage.removeItem(key);
      if (storage.getItem(key) === id) throw new Error('无法清理本机测试编号，请恢复本机存储后再测。');
    }
  };
  const accept = (result, expectedId) => {
    if (!context.active) return;
    if (!result?.id || !['running', 'succeeded', 'failed', 'uncertain'].includes(result.status) ||
        expectedId && result.id !== expectedId) throw new Error(unknown);
    if (state.pendingId && state.pendingId !== result.id) return;
    if (state.result?.id === result.id && terminal(state.result) &&
        (result.status === 'running' || state.result.status !== 'uncertain' && result.status === 'uncertain')) return;
    state.result = result;
    state.startedAt = Date.parse(result.created_at) || state.startedAt;
    state.error = '';
    if (terminal(result)) {
      state.pendingId = '';
      try { clear(result.id); } catch (error) { state.error = error.message; }
    } else {
      // Preserve the server's ID in memory even when storage becomes unavailable.
      state.pendingId = result.id;
      retain(result.id);
    }
  };
  const current = (version, id) => context.active && context.generation === version &&
    (state.pendingId === id || !state.pendingId && state.result?.id === id);
  return Object.assign(context, {state, change, retain, clear, accept, current});
}

function createConnectivityObserver(context, request) {
  const {state, accept, current, change} = context;
  let observing = false;
  return async function observe() {
    if (!context.active || observing || state.operation !== 'start' || !state.pendingId) return;
    const id = state.pendingId, version = context.generation; observing = true;
    try {
      const result = await request(endpoint + '/' + encodeURIComponent(id));
      if (current(version, id)) accept(result, id);
    } catch (error) {
      if (error.staleSession) { context.active = false; context.generation++; }
      // The POST owns errors; an early 404 cannot prove it did not dispatch.
    }
    finally { observing = false; if (current(version, id)) change(); }
  };
}

// A durable ID precedes the single POST. Recovery and observation only perform GETs.
export function createOpenAiConnectivityRunner({request, storage, key, onChange = () => {},
  uuid = () => crypto.randomUUID(), now = Date.now}) {
  const context = createConnectivityContext({storage, key, onChange});
  const {state, change, retain, clear, accept, current} = context;
  const observe = createConnectivityObserver(context, request);
  async function recover() {
    if (state.operation === 'start') return observe();
    if (!context.active || state.busy || !state.pendingId) return;
    const id = state.pendingId, version = context.generation;
    state.busy = true; state.operation = 'check'; state.error = ''; change();
    try {
      const result = await request(endpoint + '/' + encodeURIComponent(id));
      if (current(version, id)) accept(result, id);
    } catch (error) {
      if (error.staleSession) { context.active = false; context.generation++; return; }
      if (current(version, id)) state.error = error.status === 404 ?
        '尚未查到这次最小测试，请稍后核查。不会自动重复调用。' : unknown;
    } finally {
      if (context.active && context.generation === version) { state.busy = false; state.operation = ''; change(); }
    }
  }
  async function start(model) {
    if (!context.active || state.busy || state.pendingId) return;
    const version = ++context.generation; let id = '', dispatched = false;
    state.busy = true; state.operation = 'start'; state.error = ''; change();
    try {
      let existing = storage.getItem(key);
      if (existing && state.result?.id === existing && terminal(state.result)) { clear(existing); existing = storage.getItem(key); }
      if (existing) {
        state.pendingId = existing;
        if (state.result?.id !== existing) { state.result = null; state.startedAt = 0; }
        return;
      }
      id = uuid();
      const at = now(), timing = JSON.stringify({id, at});
      storage.setItem(key + ':started', timing);
      if (storage.getItem(key + ':started') !== timing) throw new Error('无法保存最小测试开始时间，未调用 API。');
      retain(id); state.startedAt = at; state.result = null; change();
      if (!context.active || context.generation !== version) return;
      dispatched = true;
      const result = await request(endpoint, {method: 'POST', body: {test_id: id, model}});
      if (current(version, id)) accept(result, id);
    } catch (error) {
      if (error.staleSession) { context.active = false; context.generation++; return; }
      if (!context.active || context.generation !== version || terminal(state.result) && state.result.id === id && !state.pendingId) return;
      state.error = dispatched ? unknown : error.message || '无法保存最小测试编号，未调用 API。';
      if (dispatched && error.code === 'OPENAI_CONNECTIVITY_IN_FLIGHT' && typeof error.test_id === 'string' && error.test_id) {
        state.pendingId = error.test_id;
        try { retain(error.test_id); } catch { /* Keep its identity in memory and block another POST. */ }
        state.startedAt = 0; state.error = '已有最小测试正在执行，请只读核查状态。';
      } else if (dispatched && noDispatch.has(error.code)) {
        state.pendingId = ''; state.error = error.message || '最小测试未发起，请检查配置后再试。';
        try { clear(id); } catch (storageError) { state.error += ' ' + storageError.message; }
      }
    } finally {
      if (context.active && context.generation === version) { state.busy = false; state.operation = ''; change(); }
    }
  }
  return {state, start, recover, observe, adopt(result) {
    if (!context.active || !result || state.pendingId && state.pendingId !== result.id ||
        state.busy && state.result?.id !== result.id && !state.pendingId) return;
    try { accept(result); } catch (error) { state.error = error.message; }
    change();
  }, dispose() { context.active = false; context.generation++; }};
}
