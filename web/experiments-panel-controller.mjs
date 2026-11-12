import {apiNetwork} from './core/api.mjs';
import {state, runtime} from './core/state.mjs';
import {normalizeReviewData} from './core/review-data.mjs';
import {currentPlaybooks} from './core/review-rule-scopes.mjs';
import {readReviewCollection} from './review-controller.mjs';
import {renderExperiments} from './pages/review-ai.mjs';
import {loadReviewAi, reviewAiClick, reviewAiView, watchReviewAi} from './review-ai-controller.mjs';

// The daily reminders page shows the same confirm-and-track cards as the weekly tab,
// so a suggestion can be answered where it is first read.
let data = null, sequence = 0, registered = false;
const account = () => state.account || 'V字';
const root = () => document.querySelector('#ai-experiments');
function paint() {
  const node = root();
  if (!node || state.page !== 'ai-reports') return;
  node.innerHTML = data ? renderExperiments(data, {account:account(), ai:reviewAiView()}, {compact:true}) : '';
}
function register() {
  if (registered) return;
  registered = true;
  watchReviewAi(paint);
  document.addEventListener('click', event => {
    const target = event.target.closest?.('#ai-experiments [data-ai-action]');
    if (!target || state.page !== 'ai-reports' || !data) return;
    reviewAiClick(target, {account:account(), playbooks:() => data.playbooks, reload:() => void loadExperimentsPanel(),
      applyPlaybook:saved => { data = {...data, playbooks:data.playbooks.map(item => String(item.id) === String(saved.id) ? {...item, ...saved} : item)}; }});
  });
}
export async function loadExperimentsPanel() {
  register();
  const ticket = ++sequence, session = runtime.sessionEpoch, name = account();
  void loadReviewAi(name);
  const current = () => ticket === sequence && session === runtime.sessionEpoch && state.page === 'ai-reports';
  const read = path => apiNetwork(path, {suppressAuthRedirect:true});
  try {
    const [articles, snapshots, playbooks] = await Promise.all(['articles','snapshots','playbooks'].map(kind => readReviewCollection(read, kind, name,
      current)));
    if (!current() || !articles || !snapshots || !playbooks) return;
    const ids = new Set(articles.items.map(row => String(row.id)));
    data = normalizeReviewData({articles:articles.items, snapshots:snapshots.items.filter(row => ids.has(String(row.article_id))),
      playbooks:currentPlaybooks(playbooks.items, name)});
  } catch { if (current()) data = null; /* The reminders themselves must still show. */ }
  if (current()) paint();
}
