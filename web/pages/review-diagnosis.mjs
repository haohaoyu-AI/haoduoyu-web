import {e} from '../core/dom.mjs';

export function renderArticleDiagnosis(row, vm) {
  const saved = vm.diagnoses?.[row.id] || {};
  if (saved.text) return `<section class="review-diagnosis" aria-label="AI诊断"><h3>AI诊断</h3>` +
    `<p class="review-diagnosis-result">${e(saved.text)}</p></section>`;
  const busy = saved.status === 'saving';
  const error = saved.status === 'error' && saved.error ? `<p class="review-note" role="alert">${e(saved.error)}</p>` : '';
  const label = busy ? '正在诊断…' : 'AI诊断';
  const disabled = busy ? ' disabled' : '';
  return `<section class="review-diagnosis" aria-label="AI诊断"><h3>AI诊断</h3>${error}` +
    `<button class="btn" type="button" data-review-action="diagnose-article" data-article-id="${e(row.id)}"${disabled}>${label}</button></section>`;
}
