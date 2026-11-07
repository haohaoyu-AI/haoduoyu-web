import {openAiRunFinished} from './openai-review-state.mjs';

// The persisted request identity is written before any paid request. Recovery is GET-only.
export function createOpenAiRunner({request, storage, key, onChange = () => {}, uuid = () => crypto.randomUUID()}) {
  let active = true;
  const state = {run: null, pendingId: '', notFound: false, busy: false, error: ''};
  try { state.pendingId = storage.getItem(key) || ''; } catch { /* Starting will require working storage. */ }
  const change = () => { if (active) onChange({...state}); };
  const retain = id => {
    storage.setItem(key, id);
    if (storage.getItem(key) !== id) throw new Error('无法保存分析请求编号，请允许本机存储后再开始。');
    state.pendingId = id;
  };
  const accept = run => {
    if (!run?.id || typeof run.status !== 'string') throw new Error('分析状态暂时无法确认，请核查状态。');
    state.run = run; state.notFound = false;
    if (openAiRunFinished(run)) {
      if (storage.getItem(key) === state.pendingId) storage.removeItem(key);
      state.pendingId = '';
    } else retain(run.id);
  };
  async function recover() {
    if (!active || state.busy || !state.pendingId) return;
    state.busy = true; state.error = ''; change();
    try { accept(await request('/openai-review/runs/' + encodeURIComponent(state.pendingId))); }
    catch (error) {
      state.notFound = error.status === 404;
      state.error = error.status === 404 ? '尚未查到这次请求，请稍后核查。不会自动重复提交。' :
        error.message || '暂时无法确认结果，请核查状态。';
    } finally { state.busy = false; change(); }
  }
  async function start(mode = 'incremental') {
    if (!active || state.busy || state.pendingId || !['incremental', 'full'].includes(mode)) return;
    state.busy = true; state.error = ''; change();
    try {
      const existing = storage.getItem(key);
      if (existing) { state.pendingId = existing; return; }
      retain(uuid());
      const run = await request('/openai-review/runs', {method: 'POST', body: {run_id: state.pendingId, mode}});
      accept(run);
    } catch (error) {
      state.error = state.pendingId ? '请求结果尚未确认，请核查状态。不会自动重复提交。' :
        error.message || '无法保存请求编号，未开始分析。';
      if (error.code === 'OPENAI_REVIEW_IN_FLIGHT' && error.run_id) {
        retain(error.run_id); state.error = '已有分析请求，请核查状态。';
      }
      // Explicit preflight rejections have not created a run or called the provider.
      if (['OPENAI_NOT_CONFIGURED', 'OPENAI_REVIEW_NOT_CONFIGURED', 'FORBIDDEN', 'UNAUTHORIZED',
        'OPENAI_REVIEW_RATE_LIMIT', 'OPENAI_REVIEW_INPUT_LIMIT', 'OPENAI_REVIEW_NO_DATA',
        'OPENAI_REVIEW_SOURCE_INVALID', 'VALIDATION_ERROR'].includes(error.code)) {
        try { storage.removeItem(key); } catch { /* Leave the retained request intact on storage failure. */ }
        state.pendingId = ''; state.error = error.message;
      }
    } finally { state.busy = false; change(); }
  }
  async function release() {
    if (!active || state.busy || !state.pendingId || !(state.notFound || state.run?.status === 'uncertain')) return;
    state.busy = true; state.error = ''; change();
    try {
      accept(await request('/openai-review/runs/' + encodeURIComponent(state.pendingId) + '/release', {
        method: 'POST', body: {acknowledgement: 'provider_outcome_unknown_no_automatic_retry'}
      }));
    } catch (error) {
      state.error = error.message || '解除结果尚未确认，请核查状态。';
      if (['OPENAI_REVIEW_RECOVERY_RATE_LIMIT', 'OPENAI_REVIEW_PUBLIC_RATE_LIMIT'].includes(error.code))
        state.error += ' 请稍后只读核查状态，不会自动重复提交。';
    }
    finally { state.busy = false; change(); }
  }
  return {state, start, recover, release, adopt(run) { accept(run); change(); }, dispose() { active = false; }};
}
