import {state, runtime} from './core/state.mjs';
import {renderReportReview} from './pages/review-ai.mjs';
import {loadReviewAi, reviewAiClick, reviewAiInput, reviewAiView, watchReviewAi} from './review-ai-controller.mjs';

// Reports, historical reviews and decisions share one entry.
let data = null, sequence = 0, registered = false, panelError = false;
const account = () => state.account || 'V字';
const root = () => document.querySelector('#ai-experiments');
function paint() {
  const node = root();
  if (!node || state.page !== 'ai-reports') return;
  node.innerHTML = data ? renderReportReview(data, {account:account(), ai:reviewAiView()}) : panelError
    ? '<p role="alert">复盘资料读取失败。 <button type="button" class="btn small" data-retry-review>重试</button></p>'
    : '<p role="status">正在读取复盘资料…</p>';
}
function register() {
  if (registered) return;
  registered = true;
  watchReviewAi(paint);
  document.addEventListener('change', event => {
    if (state.page === 'ai-reports' && event.target.closest?.('#ai-experiments')) reviewAiInput(event.target);
  });
  document.addEventListener('click', event => {
    if (event.target.closest?.('#ai-experiments [data-retry-review]')) { void loadExperimentsPanel(); return; }
    const target = event.target.closest?.('#ai-experiments [data-ai-action]');
    if (!target || state.page !== 'ai-reports' || !data) return;
    reviewAiClick(target, {account:account(), playbooks:() => data.playbooks, reload:() => void loadExperimentsPanel(),
      applyPlaybook:saved => { data = {...data, playbooks:data.playbooks.map(item => String(item.id) === String(saved.id) ? {...item, ...saved} : item)}; }});
  });
}
export async function loadExperimentsPanel() {
  register();
  const ticket = ++sequence, session = runtime.sessionEpoch;
  data = null; panelError = false; paint();
  void loadReviewAi(account());
  const current = () => ticket === sequence && session === runtime.sessionEpoch && state.page === 'ai-reports';
  // Only the weekly-report archive is shown, and it comes with the AI state; no review collections are read.
  data = {};
  if (current()) paint();
}
