import {e} from '../core/dom.mjs';
import {scopeLabel} from '../core/review-rule-scopes.mjs';
import {reviewDateTime} from '../core/review-data.mjs';
import {diagnosisPromptText, selectDiagnosisPrompt} from '../../shared/article-diagnosis.mjs';

export function rulesIntroMarkdown(markdown) {
  const lines = String(markdown || '').replace(/\r\n?/g,'\n').split('\n');
  const first = lines.findIndex(line => /^##\s/.test(line));
  const head = first < 0 ? lines : lines.slice(0, first);
  const cut = head.findIndex(line => /^#{1,6}\s+.*提示词/.test(line));
  return (cut < 0 ? head : head.slice(0, cut)).filter(line => !/^#\s/.test(line) && !/^\s*[-*_]{3,}\s*$/.test(line)).join('\n').trim();
}
export function playbookPromptBlocks(markdown) {
  const lines = String(markdown || '').replace(/\r\n?/g,'\n').split('\n');
  const blocks = [];
  let current = null;
  const flush = () => {
    const content = current?.lines.join('\n').trim();
    if (content) blocks.push({title:current.title, content});
    current = null;
  };
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading) { flush(); if (heading[1].includes('提示词')) current = {title:heading[1], lines:[]}; continue; }
    if (current) current.lines.push(line);
  }
  flush();
  return blocks;
}
const labels = {longform_write:'写文章', image:'配图', weitoutiao_write:'微头条', transfer_chat:'转写'};
function copyButton(action, id = '') {
  const marker = id ? ` data-prompt-id="${e(id)}"` : '';
  return `<button type="button" class="btn" data-review-action="${action}"${marker}>复制完整提示词</button>`;
}
function card(title, note, time, content, action) {
  const long = String(content).split('\n').length > 10 || String(content).length > 600;
  const when = time ? `<p class="review-note">生效时间：${e(time)} · 上海时间</p>` : '';
  return `<article class="review-prompt-card"><div class="review-v13-rule-meta"><h2>${e(title)}</h2>` +
    `<span class="review-note">${e(note)}</span></div>${when}<div class="review-prompt-copy-actions">${action}` +
    `<span class="review-note" role="status" aria-live="polite" data-prompt-copy-status></span></div>` +
    `<pre class="review-prompt-source${long ? ' is-folded' : ''}">${e(content)}</pre>` +
    // Folding only limits what is shown; the element still holds the whole prompt for copying.
    (long ? '<button type="button" class="btn text review-prompt-toggle" data-review-action="toggle-prompt"' +
      ' aria-expanded="false">展开全文</button>' : '') + '</article>';
}
export function renderPromptPage(data, vm) {
  const order = ['longform_write','image','weitoutiao_write','transfer_chat'];
  const prompts = (data.prompts || []).filter(row => row.prompt_key !== 'article_diagnosis').slice().sort((a,b) => {
    const ai = order.indexOf(a.prompt_key), bi = order.indexOf(b.prompt_key);
    return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi) || String(a.prompt_key).localeCompare(String(b.prompt_key),'zh');
  });
  const diagnosis = diagnosisPromptText(data.prompts, vm.account);
  const selected = selectDiagnosisPrompt(data.prompts, vm.account);
  const shown = new Set([diagnosis.trim(), ...prompts.map(row => String(row.content_md || '').trim())]);
  const extras = (data.playbooks || []).flatMap(book => playbookPromptBlocks(book.content_md)).filter(block => block.content && !shown.has(block.content));
  const cards = prompts.map(prompt => card(labels[prompt.prompt_key] || prompt.title || prompt.prompt_key,
    [prompt.title, 'v' + prompt.version, scopeLabel(prompt.scope)].filter(Boolean).join(' · '),
    reviewDateTime(prompt.updated_at) || '未记录', prompt.content_md || '', copyButton('copy-prompt', prompt.id)));
  const diagnosisNote = selected ? [selected.title, 'v' + selected.version, scopeLabel(selected.scope)].filter(Boolean).join(' · ') : '默认提示词';
  cards.push(card('AI诊断', diagnosisNote, selected ? reviewDateTime(selected.updated_at) || '未记录' : '', diagnosis, copyButton('copy-diagnosis-prompt')));
  for (const block of extras) cards.push(card(block.title, '规则手册中的提示词', '', block.content, copyButton('copy-prompt-block')));
  return `<div class="review-prompt-page">${cards.join('')}</div>`;
}
