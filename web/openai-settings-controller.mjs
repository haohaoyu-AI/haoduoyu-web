import {apiNetwork} from './core/api.mjs';
import {runtime, state} from './core/state.mjs';
import {openAiSessionAvailable, openAiDraft, editOpenAiDraft, saveOpenAiDraft} from './core/openai-review-state.mjs';
import {renderOpenAiSettings} from './pages/openai-review.mjs';

let session = '', vm = {}, registered = false, sequence = 0;
const identity = () => `${runtime.sessionEpoch}:${state.me?.id || ''}:${Boolean(state.me?.publicBusiness)}`;
const key = () => `haoduoyu.openai.instructions.v1:${state.me?.id}`;
const read = (path, options = {}) => apiNetwork(path, {...options, suppressAuthRedirect: true});
function retained() {
  try { return JSON.parse(localStorage.getItem(key())); } catch { return null; }
}
function retain() {
  if (!vm.draft) return;
  vm.draft.localRetained = false;
  try {
    if (vm.draft.dirty) localStorage.setItem(key(), JSON.stringify({text: vm.draft.text, version: vm.draft.baseVersion}));
    else localStorage.removeItem(key());
    vm.draft.localRetained = true;
  } catch { vm.draft.error = '无法保存在本机。离开前请复制修改内容，或先保存到服务器。'; }
}
function reset() {
  if (session === identity()) return;
  session = identity(); vm = {owner: openAiSessionAvailable(state.me), loading: false, draft: null, error: ''};
}
function paint() {
  if (session !== identity() || state.page !== 'settings' || state.settingsTab !== 'openai') return;
  const node = document.querySelector('#openai-settings');
  if (node) node.outerHTML = renderOpenAiSettings(vm);
}
export function openAiSettingsPage() { reset(); return renderOpenAiSettings(vm); }
export async function loadOpenAiSettings() {
  reset(); register();
  if (!vm.owner || vm.draft?.saving) { paint(); return; }
  const ticket = ++sequence, captured = session;
  const fresh = () => ticket === sequence && captured === identity();
  vm.loading = true; vm.error = ''; paint();
  try {
    const saved = await read('/openai-review/config');
    if (!fresh() || vm.draft?.saving) return;
    const existing = vm.draft?.dirty ? {text: vm.draft.text, version: vm.draft.baseVersion} : retained();
    vm.draft = openAiDraft(saved, existing);
  } catch (error) { if (fresh()) vm.error = error.message || '读取失败，请重试。'; }
  finally { if (fresh()) { vm.loading = false; paint(); } }
}
async function save() {
  const draft = vm.draft;
  if (!draft || draft.saving || draft.conflict || !draft.dirty) return;
  const captured = session;
  vm.draft = {...draft, saving: true}; paint();
  const result = await saveOpenAiDraft(draft, read);
  if (captured !== identity()) return;
  vm.draft = result; retain(); paint();
}
async function compare() {
  const captured = session, draft = vm.draft;
  if (!draft || draft.saving) return;
  try {
    const latest = await read('/openai-review/config');
    if (captured !== identity() || vm.draft !== draft) return;
    vm.draft = {...draft, latest, conflict: latest.version !== draft.saved.version, error: '', message: '已读取最新版本，请比较。'};
  } catch (error) { if (captured === identity() && vm.draft === draft) vm.draft.error = error.message; }
  paint();
}
function changeAction(action) {
  if (action === 'reload-settings') { void loadOpenAiSettings(); return; }
  if (!vm.draft || vm.draft.saving) return;
  if (action === 'compare') { void compare(); return; }
  if (action === 'rebase' && vm.draft.latest) {
    vm.draft = openAiDraft(vm.draft.latest, {text: vm.draft.text, version: vm.draft.latest.version}); retain(); paint();
  }
  if (action === 'discard' && window.confirm('放弃尚未保存的本机修改，重新读取已保存的指令？')) {
    vm.draft = null;
    try { localStorage.removeItem(key()); } catch { /* The fresh read will still be safe. */ }
    void loadOpenAiSettings();
  }
}
function register() {
  if (registered) return;
  registered = true;
  document.addEventListener('input', event => {
    if (event.target.id !== 'openai-instructions' || session !== identity() || !vm.draft || vm.draft.saving) return;
    vm.draft = editOpenAiDraft(vm.draft, event.target.value); retain();
    const status = document.querySelector('#openai-instructions-status');
    if (status) status.textContent = vm.draft.error || (vm.draft.dirty ? '有未保存修改，已保留在本机。仅点击保存后生效。' : '已保存');
    const submit = document.querySelector('#openai-instructions-form button[type="submit"]');
    if (submit) submit.disabled = !vm.draft.dirty || vm.draft.conflict;
  });
  document.addEventListener('submit', event => {
    if (event.target.id !== 'openai-instructions-form') return;
    event.preventDefault(); if (session === identity() && vm.owner) void save();
  });
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#openai-settings [data-openai-action]');
    if (button && !button.disabled && session === identity() && vm.owner) changeAction(button.dataset.openaiAction);
  });
  document.addEventListener('click', event => {
    const leaving = event.target.closest?.('a[href],[data-nav],[data-action="settings-tab"],[data-action="logout"]');
    if (!leaving || session !== identity() || !vm.draft?.dirty || vm.draft.localRetained !== false) return;
    if (!window.confirm('修改未保存，而且无法保留在本机。请先复制内容或保存。仍要离开吗？')) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener('beforeunload', event => {
    if (session === identity() && vm.draft?.dirty) { event.preventDefault(); event.returnValue = ''; }
  });
}
