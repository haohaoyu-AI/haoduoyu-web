import {state} from './core/state.mjs';
import {renderAiSettings} from './pages/review-ai.mjs';
import {loadReviewAi, loadReviewAiModels, reviewAiClick, reviewAiInput, reviewAiView, saveReviewAiSettings, watchReviewAi} from './review-ai-controller.mjs';

let registered = false;
const visible = () => state.page === 'settings' && state.settingsTab === 'ai';
function paint() {
  const node = document.querySelector('#ai-settings');
  if (!visible() || !node) return;
  // Selects and the number field keep their place: only repaint when nothing inside is being edited.
  const active = document.activeElement, focus = node.contains(active) && active.dataset.aiSetting ? [active.dataset.aiSetting,
    active.dataset.aiFeature || ''] : null;
  node.outerHTML = renderAiSettings(reviewAiView());
  if (focus) document.querySelector(`#ai-settings [data-ai-setting="${focus[0]}"]${focus[1]
    ? `[data-ai-feature="${focus[1]}"]` : ''}`)?.focus({preventScroll:true});
}
function register() {
  if (registered) return;
  registered = true;
  watchReviewAi(paint);
  document.addEventListener('change', event => { if (visible() && event.target.closest?.('#ai-settings') && reviewAiInput(event.target)) paint(); });
  document.addEventListener('submit', event => { if (event.target.id !== 'ai-settings-form') return; event.preventDefault();
    if (visible()) void saveReviewAiSettings(); });
  document.addEventListener('click', event => {
    const target = event.target.closest?.('#ai-settings [data-ai-action]');
    if (target && visible()) reviewAiClick(target, {account:state.account || 'V字'});
  });
}
export function aiSettingsPage() { register(); return renderAiSettings(reviewAiView().status === 'idle' ? {status:'loading'} : reviewAiView()); }
export async function loadAiSettings() {
  register();
  await loadReviewAi(state.account || 'V字', {force:true});
  if (reviewAiView().data?.configured) void loadReviewAiModels();
}
