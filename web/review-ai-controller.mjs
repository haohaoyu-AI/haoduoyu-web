import {apiNetwork} from './core/api.mjs';

// One shared view of the AI state for the review page, the reminders page and settings.
let ai = {status:'idle', messages:{}}, account = '', ticket = 0;
const listeners = new Set();
const emit = () => { for (const listener of listeners) listener(); };
const request = (path, options = {}) => apiNetwork(path, {...options, suppressAuthRedirect:true});
export const reviewAiView = () => ai;
export function watchReviewAi(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function resetReviewAi() { ticket++; ai = {status:'idle', messages:{}}; account = ''; }

export async function loadReviewAi(nextAccount = 'V字', {force = false} = {}) {
  if (!force && account === nextAccount && ['ready','loading'].includes(ai.status)) return;
  account = nextAccount;
  const current = ++ticket, quiet = ai.status === 'ready';
  if (!quiet) { ai = {...ai, status:'loading'}; emit(); }
  try {
    const data = await request('/review/ai?account=' + encodeURIComponent(nextAccount));
    if (current !== ticket) return;
    ai = {...ai, status:'ready', data, error:'', ...(ai.dirty ? {} : {draft:structuredClone(data.settings)})};
  } catch (error) {
    if (current !== ticket) return;
    ai = quiet ? ai : {...ai, status:'error', error:error.message || 'AI 结果读取失败'};
  }
  emit();
}
async function loadModels() {
  if (ai.models?.length || ai.modelsLoading) return;
  ai = {...ai, modelsLoading:true, modelsError:''}; emit();
  try { const data = await request('/review/ai/models'); ai = {...ai, models:data.models || [], modelsLoading:false}; }
  catch (error) { ai = {...ai, models:[], modelsLoading:false, modelsError:error.message || '模型列表读取失败，可稍后再试'}; }
  emit();
}
export function loadReviewAiModels() { return loadModels(); }
const say = (key, text, error = false) => { ai = {...ai, messages:{...ai.messages, [key]:text ? {text, error} : null}}; };
const done = {titles:data => data.labelled ? `已归类 ${data.labelled} 篇${data.remaining ? `，还剩 ${data.remaining} 篇` : ''}。` : '没有需要归类的标题。',
  benchmarks:data => data.done ? `已拆解 ${data.done} 篇${data.remaining ? `，还剩 ${data.remaining} 篇` : ''}。` : '没有需要拆解的爆文。'};
async function runFeature(feature, once = {}) {
  if (ai.busy || !done[feature]) return;
  ai = {...ai, busy:feature, options:''}; say(feature, ''); emit();
  try {
    const body = {account, ...(once.model ? {model:once.model} : {}), ...(once.effort ? {effort:once.effort} : {})};
    const result = await request('/review/ai/' + feature, {method:'POST', body});
    say(feature, done[feature](result));
  } catch (error) { say(feature, error.message || '没有完成，请稍后重试。', true); }
  ai = {...ai, busy:'', once:{}};
  await loadReviewAi(account, {force:true});
}
async function changeRule(target, context) {
  const id = target.dataset.ruleId, status = target.dataset.status;
  const playbook = context.playbooks().find(item => String(item.id) === target.dataset.playbookId);
  if (!playbook?.content_hash || ai.busy) return;
  ai = {...ai, busy:'rule:' + id}; say('rules', ''); emit();
  try {
    const saved = await request('/review/rules/' + encodeURIComponent(id), {method:'PATCH',
      body:{account:playbook.account, playbook_id:playbook.id, expected_hash:playbook.content_hash, save_id:crypto.randomUUID(), status}});
    context.applyPlaybook(saved);
    say('rules', status === 'trial' ? '已进入试验。之后用了这条的文章会自动对比。' : status === 'kept' ? '已采纳，记入规则。' : '已放弃这条。');
  } catch (error) {
    say('rules', error.status === 409 ? '规则刚刚被更新过，已重新读取，请再点一次。' : error.message || '没有保存，请重试。', true);
    if (error.status === 409) context.reload?.();
  }
  ai = {...ai, busy:''}; emit();
}
/** Clicks on any [data-ai-action] control. `context` supplies the page's playbooks and how to store an updated one. */
export function reviewAiClick(target, context = {}) {
  const action = target.dataset.aiAction, feature = target.dataset.aiFeature;
  if (action === 'reload') { void loadReviewAi(account || context.account, {force:true}); return true; }
  if (action === 'options') { ai = {...ai, options:ai.options === feature ? '' : feature, once:{}}; emit(); void loadModels(); return true; }
  if (action === 'run') { void runFeature(feature, ai.options === feature ? ai.once : {}); return true; }
  if (action === 'rule-status') { void changeRule(target, context); return true; }
  return false;
}
/** Change events from the one-off selectors and the settings form. Returns true when handled. */
export function reviewAiInput(target) {
  if (target.dataset.aiOnce) { ai = {...ai, once:{...ai.once, [target.dataset.aiOnce]:target.value}}; return true; }
  const key = target.dataset.aiSetting;
  if (!key || !ai.data) return false;
  const draft = structuredClone(ai.draft || ai.data.settings);
  if (key === 'daily_limit') draft.daily_limit = Number(target.value);
  else draft.features[target.dataset.aiFeature][key] = target.value;
  ai = {...ai, draft, dirty:true}; say('settings', '');
  return true;
}
export async function saveReviewAiSettings() {
  if (!ai.draft || ai.busy) return;
  if (!Number.isInteger(ai.draft.daily_limit) || ai.draft.daily_limit < 0 || ai.draft.daily_limit > 200) { say('settings', '每日上限请填 0 到 200 的整数', true);
    emit(); return; }
  ai = {...ai, busy:'settings'}; say('settings', ''); emit();
  try {
    const saved = await request('/review/ai/settings', {method:'PUT', body:ai.draft});
    ai = {...ai, dirty:false, draft:structuredClone(saved.settings), data:{...ai.data, settings:saved.settings, usage:{...ai.data.usage,
      limit:saved.settings.daily_limit}}};
    say('settings', '已保存');
  } catch (error) { say('settings', error.message || '保存失败，请重试', true); }
  ai = {...ai, busy:''}; emit();
}
