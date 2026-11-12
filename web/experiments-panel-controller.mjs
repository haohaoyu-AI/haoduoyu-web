import {apiNetwork} from './core/api.mjs';
import {state, runtime} from './core/state.mjs';
import {normalizeReviewData} from './core/review-data.mjs';
import {currentPlaybooks} from './core/review-rule-scopes.mjs';
import {readReviewCollection} from './review-controller.mjs';
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
  const ticket = ++sequence, session = runtime.sessionEpoch, name = account();
  data = null; panelError = false; paint();
  void loadReviewAi(name);
  const current = () => ticket === sequence && session === runtime.sessionEpoch && state.page === 'ai-reports';
  const read = path => apiNetwork(path, {suppressAuthRedirect:true});
  try {
    const [articles, snapshots, reports, playbooks] = await Promise.all(['articles','snapshots','reports','playbooks'].map(kind => readReviewCollection(read, kind, name,
      current)));
    if (!current() || !articles || !snapshots || !reports || !playbooks) return;
    const ids = new Set(articles.items.map(row => String(row.id)));
    data = normalizeReviewData({articles:articles.items, snapshots:snapshots.items.filter(row => ids.has(String(row.article_id))),
      reports:reports.items, playbooks:currentPlaybooks(playbooks.items, name)});
  } catch { if (current()) { data = null; panelError = true; } }
  if (current()) paint();
}
