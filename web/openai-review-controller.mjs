import {apiNetwork} from './core/api.mjs';
import {runtime, state} from './core/state.mjs';
import {openAiOwnerSession} from './core/openai-review-state.mjs';
import {createOpenAiRunner} from './core/openai-review-runner.mjs';
import {renderOpenAiReviewPanel} from './pages/openai-review.mjs';

let session = '', runner, vm = {}, registered = false, timer = null, loadSequence = 0;
const identity = () => `${runtime.sessionEpoch}:${state.me?.id || ''}:${Boolean(state.me?.publicBusiness)}`;
const current = () => session === identity();
export function openAiReviewTimeout(path, options = {}) {
  // Four provider rounds may each take 45 seconds; allow 30 seconds for storage and transport.
  return path === '/openai-review/runs' && options.method === 'POST' ? 210000 : 75000;
}
async function read(path, options = {}) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), openAiReviewTimeout(path, options));
  try { return await apiNetwork(path, {...options, signal: controller.signal, suppressAuthRedirect: true}); }
  finally { clearTimeout(timeout); }
}
function reset() {
  if (session === identity()) return;
  runner?.dispose(); clearTimeout(timer); timer = null; session = identity();
  vm = {owner: openAiOwnerSession(state.me), config: null, loading: false, error: ''};
  if (!vm.owner) { runner = null; return; }
  const captured = session;
  runner = createOpenAiRunner({request: read, key: `haoduoyu.openai.run.v1:${state.me.id}:V字`,
    storage: {getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: key => localStorage.removeItem(key)},
    onChange(next) {
      if (captured !== identity() || session !== captured) return;
      vm = {...vm, ...next}; paintOpenAiReview(); scheduleCheck();
    }});
  vm = {...vm, ...runner.state};
}
export function paintOpenAiReview() {
  reset();
  const node = document.querySelector('#openai-review-panel');
  if (node) node.innerHTML = renderOpenAiReviewPanel(vm);
}
function scheduleCheck() {
  clearTimeout(timer); timer = null;
  if (runner?.state.run?.status === 'uncertain') return;
  if (!current() || state.page !== 'review' || !runner?.state.pendingId || runner.state.busy || vm.error) return;
  timer = setTimeout(() => {
    if (current() && state.page === 'review' && document.querySelector('#openai-review-panel')) void runner.recover();
  }, 5000);
}
export async function loadOpenAiReview() {
  reset(); register();
  if (!vm.owner) { paintOpenAiReview(); return; }
  const ticket = ++loadSequence, captured = session;
  const fresh = () => ticket === loadSequence && captured === identity();
  vm.loading = true; vm.error = ''; paintOpenAiReview();
  try {
    const config = await read('/openai-review/config');
    if (!fresh()) return;
    vm.config = config;
    if (runner.state.pendingId) await runner.recover();
    else {
      const page = await read('/openai-review/runs?offset=0');
      if (!fresh()) return;
      const latest = page?.items?.[0];
      if (latest) runner.adopt(latest);
    }
  } catch (error) { if (fresh()) vm.error = error.message || '读取失败，请重新读取。'; }
  finally { if (fresh()) { vm.loading = false; paintOpenAiReview(); scheduleCheck(); } }
}
function register() {
  if (registered) return;
  registered = true;
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#openai-review-panel [data-openai-action]');
    if (!button || button.disabled || !current() || !vm.owner) return;
    const action = button.dataset.openaiAction;
    if (action === 'reload') { void loadOpenAiReview(); return; }
    if (action === 'check') { void runner.recover(); return; }
    if (action === 'release') {
      if (window.confirm('这次请求可能已经产生 API 费用，但结果无法确认。结束核查不会重试，也不会自动发起新分析。确定结束？'))
        void runner.release();
      return;
    }
    if (!vm.config?.configured || vm.loading) return;
    if (action === 'full' && !window.confirm('重新分析全部已登记文章和指标，会产生一次新的 API 调用。继续吗？')) return;
    if (['start', 'full'].includes(action)) void runner.start(action === 'full' ? 'full' : 'incremental');
  });
  window.addEventListener('storage', event => {
    if (event.key === `haoduoyu.openai.run.v1:${state.me?.id}:V字` && current() && !runner?.state.busy)
      void loadOpenAiReview();
  });
}
