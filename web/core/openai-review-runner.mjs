import {openAiRunFinished, openAiPendingRunUncertain} from './openai-review-state.mjs';
import {openAiStartTime} from './openai-review-progress.mjs';

// The persisted request identity is written before any paid request. Recovery is GET-only.
export function createOpenAiRunner({request, storage, key, onChange = () => {}, uuid = () => crypto.randomUUID(), now = Date.now}) {
  let active = true;
  const state = {run: null, pendingId: '', notFound: false, busy: false, operation: '', startedAt: 0, error: ''};
  try { state.pendingId = storage.getItem(key) || ''; } catch { /* Starting will require working storage. */ }
  state.startedAt = openAiStartTime(storage, key, state.pendingId);
  const change = () => { if (active) onChange({...state}); };
  const retain = id => {
    storage.setItem(key, id);
    if (storage.getItem(key) !== id) throw new Error('无法保存分析请求编号，请允许本机存储后再开始。');
    state.pendingId = id; state.startedAt = openAiStartTime(storage, key, id);
  };
  const accept = run => {
    if (!active) return;
    if (state.run?.id === run?.id && openAiRunFinished(state.run) && !openAiRunFinished(run)) return;
    if (!run?.id || typeof run.status !== 'string') throw new Error('分析状态暂时无法确认，请核查状态。');
    state.run = run; state.notFound = false;
    if (openAiRunFinished(run)) {
      if (storage.getItem(key) === state.pendingId) storage.removeItem(key);
      state.pendingId = '';
    } else retain(run.id);
    state.startedAt = Date.parse(run.created_at) || state.startedAt;
  };
  async function recover() {
    if (!active || state.busy || !state.pendingId) return;
    state.busy = true; state.operation = 'check'; state.error = ''; change();
    try { accept(await request('/openai-review/runs/' + encodeURIComponent(state.pendingId))); }
    catch (error) {
      state.notFound = error.status === 404;
      state.error = error.status === 404 ? '尚未查到这次请求，请稍后核查。不会自动重复提交。' :
        error.message || '暂时无法确认结果，请核查状态。';
    } finally { state.busy = false; state.operation = ''; change(); }
  }
  const observe = createObserver({state, request, active: () => active, accept, change});
  async function start(mode = 'incremental', model = '') {
    if (!active || state.busy || state.pendingId || !['incremental', 'full'].includes(mode)) return;
    state.busy = true; state.operation = 'start'; state.error = ''; change();
    try {
      const existing = storage.getItem(key);
      if (existing) { retain(existing); return; }
      const id = uuid(), timing = JSON.stringify({id, at: now()});
      storage.setItem(key + ':started', timing);
      if (storage.getItem(key + ':started') !== timing) throw new Error('无法保存分析开始时间，未开始分析。');
      retain(id); change();
      const run = await request('/openai-review/runs', {method: 'POST', body: {run_id: state.pendingId, mode, ...(model ? {model} : {})}});
      accept(run);
    } catch (error) {
      if (!active || openAiRunFinished(state.run) && !state.pendingId) return;
      state.error = state.pendingId ? '请求结果尚未确认，请核查状态。不会自动重复提交。' :
        error.message || '无法保存请求编号，未开始分析。';
      if (error.code === 'OPENAI_REVIEW_IN_FLIGHT' && error.run_id) {
        retain(error.run_id); state.error = '已有分析请求，请核查状态。';
      }
      // Explicit preflight rejections have not created a run or called the provider.
      if (['OPENAI_NOT_CONFIGURED', 'OPENAI_REVIEW_NOT_CONFIGURED', 'FORBIDDEN', 'UNAUTHORIZED',
        'OPENAI_REVIEW_RATE_LIMIT', 'OPENAI_REVIEW_INPUT_LIMIT', 'OPENAI_REVIEW_NO_DATA', 'OPENAI_REVIEW_INVALID_KEY_FORMAT',
        'OPENAI_REVIEW_SOURCE_INVALID', 'VALIDATION_ERROR'].includes(error.code)) {
        try { storage.removeItem(key); } catch { /* Leave the retained request intact on storage failure. */ }
        state.pendingId = ''; state.error = error.message;
      }
    } finally { state.busy = false; state.operation = ''; change(); }
  }
  async function release() {
    if (!active || state.busy || !state.pendingId || !(state.notFound || state.run?.status === 'uncertain')) return;
    state.busy = true; state.operation = 'release'; state.error = ''; change();
    try {
      accept(await request('/openai-review/runs/' + encodeURIComponent(state.pendingId) + '/release', {
        method: 'POST', body: {acknowledgement: 'provider_outcome_unknown_no_automatic_retry'}
      }));
    } catch (error) {
      state.error = error.message || '解除结果尚未确认，请核查状态。';
      if (['OPENAI_REVIEW_RECOVERY_RATE_LIMIT', 'OPENAI_REVIEW_PUBLIC_RATE_LIMIT'].includes(error.code))
        state.error += ' 请稍后只读核查状态，不会自动重复提交。';
    }
    finally { state.busy = false; state.operation = ''; change(); }
  }
  return {state, start, recover, observe, release, adopt(run) { accept(run); change(); }, dispose() { active = false; }};
}

function createObserver({state, request, active, accept, change}) {
  let observing = false;
  return async function observe() {
    if (!active() || observing || state.operation !== 'start' || !state.pendingId || openAiPendingRunUncertain(state)) return;
    const id = state.pendingId; observing = true;
    try {
      const run = await request('/openai-review/runs/' + encodeURIComponent(id));
      if (active() && state.pendingId === id && run?.id === id) { accept(run); change(); }
    } catch { /* POST owns errors; an early GET 404 is not evidence of failure. */ }
    finally { observing = false; if (active()) change(); }
  }
}
