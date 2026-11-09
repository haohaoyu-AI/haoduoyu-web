import {apiNetwork} from './core/api.mjs';
import {runtime, state} from './core/state.mjs';
import {openAiSessionAvailable, openAiPendingRunSettled, openAiPendingRunUncertain} from './core/openai-review-state.mjs';
import {createOpenAiRunner} from './core/openai-review-runner.mjs';
import {renderOpenAiReviewPanel} from './pages/openai-review.mjs';
import {createOpenAiElapsedClock} from './core/openai-review-progress.mjs';
import {createOpenAiConnectivityRunner} from './core/openai-connectivity-runner.mjs';

let session = '', runner, connectivityRunner, vm = {}, registered = false, timer = null, connectionTimer = null, loadSequence = 0;
const identity = () => `${runtime.sessionEpoch}:${state.me?.id || ''}:${Boolean(state.me?.publicBusiness)}`;
const current = () => session === identity();
const clock = createOpenAiElapsedClock(() => {
  if (!current() || (state.page !== 'ai-diagnosis' || state.diagnosisTab !== 'help') || document.visibilityState === 'hidden') return null;
  const node = document.querySelector('#openai-review-panel [data-openai-elapsed]');
  return node ? {node, startedAt: Number(node.dataset.openaiElapsed)} : null;
});
const connectionClock = createOpenAiElapsedClock(() => {
  if (!current() || state.page !== 'ai-diagnosis' || state.diagnosisTab !== 'help' || document.visibilityState === 'hidden') return null;
  const node = document.querySelector('#openai-review-panel [data-connectivity-elapsed]');
  return node ? {node, startedAt: Number(node.dataset.connectivityElapsed)} : null;
});
export function stopOpenAiReviewTimers() {
  clock.stop(); connectionClock.stop(); clearTimeout(timer); timer = null; clearTimeout(connectionTimer); connectionTimer = null;
}
export function openAiReviewTimeout(path, options = {}) {
  // Four provider rounds may each take 120 seconds; allow 60 seconds for storage and transport.
  if (path === '/openai-review/runs' && options.method === 'POST') return 540000;
  return path === '/openai-review/connectivity' && options.method === 'POST' ? 150000 : 75000;
}
async function read(path, options = {}) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), openAiReviewTimeout(path, options));
  try { return await apiNetwork(path, {...options, signal: controller.signal, suppressAuthRedirect: true}); }
  finally { clearTimeout(timeout); }
}
function reset() {
  if (session === identity()) return;
  runner?.dispose(); connectivityRunner?.dispose(); stopOpenAiReviewTimers(); session = identity();
  vm = {owner: openAiSessionAvailable(state.me), config: null, loading: false, error: ''};
  if (!vm.owner) { runner = null; connectivityRunner = null; return; }
  const captured = session;
  runner = createOpenAiRunner({request: read, key: `haoduoyu.openai.run.v1:${state.me.id}:V字`,
    storage: {getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: key => localStorage.removeItem(key)},
    onChange(next) {
      if (captured !== identity() || session !== captured) return;
      const settled = openAiPendingRunSettled(vm, next);
      vm = {...vm, ...next}; paintOpenAiReview(); scheduleCheck();
      if (settled) document.dispatchEvent(new CustomEvent('openai-run-settled', {
        detail: {sessionEpoch: runtime.sessionEpoch, userId: state.me?.id, runId: next.run.id}
      }));
    }});
  vm = {...vm, ...runner.state};
  connectivityRunner = createOpenAiConnectivityRunner({request: read,
    key: `haoduoyu.openai.connectivity.v1:${state.me.id}:V字`, storage: localStorage,
    onChange(next) {
      if (captured !== identity() || session !== captured) return;
      vm = {...vm, connection: next}; paintOpenAiReview(); scheduleConnectionCheck();
    }});
  vm.connection = {...connectivityRunner.state};
}
export function paintOpenAiReview() {
  reset();
  const node = document.querySelector('#openai-review-panel');
  if (node) node.innerHTML = renderOpenAiReviewPanel(vm);
  clock.refresh(); connectionClock.refresh();
}
function scheduleConnectionCheck() {
  clearTimeout(connectionTimer); connectionTimer = null;
  if (!current() || document.visibilityState === 'hidden' || state.page !== 'ai-diagnosis' || state.diagnosisTab !== 'help' ||
      !connectivityRunner?.state.pendingId) return;
  connectionTimer = setTimeout(() => {
    if (current() && document.visibilityState !== 'hidden' && state.page === 'ai-diagnosis' && state.diagnosisTab === 'help')
      void connectivityRunner.recover();
  }, 3000);
}
function scheduleCheck() {
  clearTimeout(timer); timer = null;
  if (document.visibilityState === 'hidden' || openAiPendingRunUncertain(runner?.state)) return;
  if (!current() || state.page !== 'ai-diagnosis' || state.diagnosisTab !== 'help' || !runner?.state.pendingId ||
      (runner.state.busy && runner.state.operation !== 'start') || vm.error) return;
  timer = setTimeout(() => {
    if (document.visibilityState !== 'hidden' && current() &&
        state.page === 'ai-diagnosis' && state.diagnosisTab === 'help' &&
        document.querySelector('#openai-review-panel'))
      void (runner.state.operation === 'start' ? runner.observe() : runner.recover());
  }, 5000);
}
export async function loadOpenAiReview() {
  reset(); register();
  if (!vm.owner) { paintOpenAiReview(); return; }
  const ticket = ++loadSequence, captured = session;
  const fresh = () => ticket === loadSequence && captured === identity();
  vm.loading = true; vm.config = null; vm.error = ''; paintOpenAiReview();
  try {
    const config = await read('/openai-review/config');
    if (!fresh()) return;
    vm.config = config;
    if (!config.supported_models?.some(model => model.id === vm.selectedModel)) vm.selectedModel = config.default_model || config.model;
    if (runner.state.pendingId) await runner.recover();
    else {
      const page = await read('/openai-review/runs?offset=0');
      if (!fresh()) return;
      const latest = page?.items?.[0];
      if (latest) runner.adopt(latest);
    }
    if (!fresh()) return;
    if (connectivityRunner.state.pendingId) await connectivityRunner.recover();
    else {
      const latestTest = await read('/openai-review/connectivity');
      if (fresh() && latestTest) connectivityRunner.adopt(latestTest);
    }
  } catch (error) { if (fresh()) vm.error = error.message || '读取失败，请重新读取。'; }
  finally { if (fresh()) { vm.loading = false; paintOpenAiReview(); scheduleCheck(); scheduleConnectionCheck(); } }
}
function register() {
  if (registered) return;
  registered = true;
  document.addEventListener('change', event => {
    if (event.target.id === 'openai-model' && current() && !runner?.state.busy && !runner?.state.pendingId &&
        vm.config?.supported_models?.some(model => model.id === event.target.value)) vm.selectedModel = event.target.value;
  });
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#openai-review-panel [data-openai-action]');
    if (!button || button.disabled || !current() || !vm.owner) return;
    const action = button.dataset.openaiAction;
    if (action === 'check-connection') { void connectivityRunner?.recover(); return; }
    if (action === 'reload') { void loadOpenAiReview(); return; }
    if (action === 'check') { void runner.recover(); return; }
    if (action === 'release') {
      if (window.confirm('这次请求可能已经产生 API 费用，但结果无法确认。结束核查不会重试，也不会自动发起新分析。确定结束？'))
        void runner.release();
      return;
    }
    if (!vm.config?.configured || vm.loading) return;
    if (action === 'test-connection' && !runner?.state.pendingId && !runner?.state.busy) {
      void connectivityRunner.start(vm.selectedModel || vm.config.default_model || vm.config.model); return;
    }
    if (connectivityRunner?.state.busy || connectivityRunner?.state.pendingId) return;
    if (action === 'full' && !window.confirm('重新分析全部已登记文章和指标，会产生一次新的 API 调用。继续吗？')) return;
    if (['start', 'full'].includes(action)) void runner.start(action === 'full' ? 'full' : 'incremental', vm.selectedModel);
  });
  window.addEventListener('storage', event => {
    if (event.key === `haoduoyu.openai.connectivity.v1:${state.me?.id}:V字` && current() && !connectivityRunner?.state.busy) {
      if (state.page === 'ai-diagnosis' && state.diagnosisTab === 'help') void loadOpenAiReview();
    }
    if (event.key === `haoduoyu.openai.run.v1:${state.me?.id}:V字` && current() && !runner?.state.busy) {
      stopOpenAiReviewTimers();
      if (state.page === 'ai-diagnosis' && state.diagnosisTab === 'help') void loadOpenAiReview();
    }
  });
  window.addEventListener('pagehide', stopOpenAiReviewTimers);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stopOpenAiReviewTimers();
    else if (current() && state.page === 'ai-diagnosis' && state.diagnosisTab === 'help') {
      clock.refresh(); connectionClock.refresh(); scheduleCheck(); scheduleConnectionCheck();
    }
  });
}
