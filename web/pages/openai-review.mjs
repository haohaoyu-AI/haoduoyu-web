import {e} from '../core/dom.mjs';
import {renderSafeMarkdown} from '../core/safe-markdown.mjs';
import {openAiDiaryLink, openAiRunActive} from '../core/openai-review-state.mjs';
import {openAiReviewFeedback, openAiElapsed, openAiCompletedElapsed} from '../core/openai-review-progress.mjs';

export const openAiLogin = '<p class="hint">请先<a href="?page=login">登录</a>，再查看或使用 OpenAI API。</p>';
const timestamp = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(date) + '（北京时间）' : '时间未知';
};
export function openAiRunLabel(run) {
  if (run?.status === 'succeeded') return '分析完成';
  if (run?.status === 'failed') return '本次分析未完成';
  if (run?.status === 'cancelled') return '本次分析已取消';
  return openAiRunActive(run) ? '正在分析…' : '结果待确认';
}
export function openAiRunModeLabel(run) {
  if (run.task === 'article_count_v1') return '文章数量链路测试';
  if (run.mode === 'full') {
    if (run.baseline_run_id === null) return '首次全量分析';
    return run.baseline_run_id ? '全量重查' : '全量分析';
  }
  return run.mode === 'incremental' ? '累计复盘' : '文章复盘';
}
export function renderOpenAiRun(run) {
  const elapsed = openAiCompletedElapsed(run);
  return `<article class="card panel openai-run" id="openai-run-${e(run.id)}" tabindex="-1">
    <div class="openai-run-heading"><h3>${e(openAiRunLabel(run))}</h3>
    <time datetime="${e(run.created_at)}">${e(timestamp(run.created_at))}</time></div>
    <p class="hint">${e(openAiRunModeLabel(run))}
    ${run.model ? ' · ' + e(run.model) : ''}${run.instruction_version ? ' · 指令版本 ' + e(run.instruction_version) : ''}${elapsed ? ' · 用时 ' + e(elapsed) : ''}</p>
    ${run.report_markdown ? `<div class="ai-report-markdown">${renderSafeMarkdown(run.report_markdown)}</div>` : ''}
    ${run.status === 'failed' ? `<p role="alert">${e(run.error_message || '未生成完整报告。历史记录仍保留。')}</p>` : ''}
    ${run.status === 'uncertain' ? `<p role="status">${e(run.error_message ||
      'API 执行结果尚未确认，可能已经计费；不会自动重试。')}</p>
      <p><a href="?page=ai-diagnosis&amp;diagnosis_tab=help">前往求助API核查状态</a></p>` : ''}
    ${openAiRunActive(run) ? '<p role="status">分析进行中。可在求助API核查状态，无需再次发起。</p>' : ''}</article>`;
}
export function renderOpenAiReviewPanel(vm = {}) {
  const header = '<div class="openai-review-heading"><h2>求助API</h2></div>';
  if (!vm.owner) return header + openAiLogin;
  const busy = vm.loading || vm.busy, disabled = busy || !vm.config?.configured || Boolean(vm.pendingId);
  const status = vm.loading ? '正在读取分析配置…' : !vm.config ? '暂时无法读取配置。' :
    vm.config.configuration_error_message || (
    vm.config.configured ? vm.pendingId || vm.busy ? '本次请求处理中或等待核查' : '可发起分析' :
      '尚未配置 OpenAI API，暂不能发起分析。');
  const selectedModel = vm.pendingId && vm.run?.id === vm.pendingId && vm.run.model ||
    vm.selectedModel || vm.config?.default_model || vm.config?.model;
  return header + `<p class="hint">${e(status)}</p>
    ${renderCountTest(vm.config?.test_task)}
    <label for="openai-model">模型</label>
    <select class="input" id="openai-model" ${disabled ? 'disabled' : ''}>
      ${(vm.config?.supported_models || []).map(model => `<option value="${e(model.id)}"
        ${model.id === selectedModel ? 'selected' : ''}>${e(model.label)}</option>`).join('')}
    </select><p class="hint">模型能否调用以账户权限为准。</p>
    <div class="openai-review-actions"><button class="btn primary" type="button" data-openai-action="start"
    ${disabled ? 'disabled' : ''} aria-busy="${Boolean(vm.busy)}">求助API</button>
    ${vm.pendingId ? `<button class="btn" type="button" data-openai-action="check" ${busy ? 'disabled' : ''}>核查状态</button>` : ''}
    ${vm.pendingId && (vm.notFound || vm.run?.status === 'uncertain') ?
      `<button class="btn" type="button" data-openai-action="release" ${busy ? 'disabled' : ''}>结束本次状态核查</button>` : ''}
    ${!vm.config && !vm.loading ? '<button class="btn" type="button" data-openai-action="reload">重新读取</button>' : ''}</div>
    ${renderOpenAiReviewStatus(vm)}
    ${vm.run ? `<p>最近记录：${e(openAiRunLabel(vm.run))} · ${e(timestamp(vm.run.created_at))}
      <a href="${e(openAiDiaryLink(vm.run))}">在诊断报告查看这条记录</a></p>` : ''}`;
}
export function renderOpenAiReviewStatus(vm) {
  const feedback = openAiReviewFeedback(vm);
  if (!feedback) return '';
  const elapsed = !vm.pendingId || vm.run?.id === vm.pendingId ? openAiCompletedElapsed(vm.run) : '';
  const startedAt = vm.startedAt || (vm.run?.id === vm.pendingId ? Date.parse(vm.run.created_at) : 0);
  return `<div class="openai-review-status"><p role="status" aria-live="polite"><strong>${e(feedback.title)}</strong></p>
    ${feedback.waiting ? '<progress aria-label="等待分析结果，无法提供准确进度"></progress>' : ''}
    ${feedback.waiting && Number.isFinite(startedAt) && startedAt > 0 ?
      `<p aria-live="off">已等待 <span data-openai-elapsed="${startedAt}">${e(openAiElapsed(startedAt))}</span></p>` : ''}
    ${elapsed ? `<p>用时 ${e(elapsed)}</p>` : ''}
    <p>${e(feedback.detail)}</p>${feedback.note ? `<p>${e(feedback.note)}</p>` : ''}
    ${vm.error && vm.error !== feedback.detail ? `<p role="alert">${e(vm.error)}</p>` : ''}</div>`;
}
export function renderOpenAiSettings(vm = {}) {
  if (!vm.owner) return `<section id="openai-settings" class="card panel"><h2>AI诊断 · 完整提示词</h2>${openAiLogin}</section>`;
  const draft = vm.draft;
  const status = vm.loading ? '正在读取…' : !draft ? '配置读取失败。' :
    draft.saved.configuration_error_message || (draft.saved.configured ? '可发起分析' : '尚未配置 OpenAI API');
  return `<section id="openai-settings" class="card panel"><h2>AI诊断 · 完整提示词</h2><p class="hint">${e(status)}</p>
    <p class="hint">密钥由服务器管理，此处不显示或录入密钥。<a href="?page=ai-diagnosis">前往AI诊断</a></p>
    ${renderCountTest(draft?.saved?.test_task)}
    ${draft ? renderInstructions(draft) : ''}<p role="alert">${e(vm.error || '')}</p>
    ${!draft && !vm.loading ? '<button class="btn" type="button" data-openai-action="reload-settings">重新读取</button>' : ''}</section>`;
}
function renderCountTest(profile) {
  if (!profile) return '';
  return `<section class="openai-count-test"><h3>测试阶段：只统计文章数量</h3>
    <p class="hint">${e(profile.scope)}</p>
    <p class="hint">数据库计数后，由 API 返回同一数量并校验。最多一次 API 调用，不分析内容、不读取历史，也不更新累计复盘。</p>
    <p class="hint">当前实际提示词：${e(profile.instructions)}</p></section>`;
}
function renderInstructions(draft) {
  return `<form id="openai-instructions-form"><label for="openai-instructions">完整分析指令
    ${draft.saved.test_task ? '（保留供后续恢复，当前计数测试不使用）' : ''}</label>
    <p class="hint" id="openai-instructions-help">版本 ${e(draft.saved.version)}。点击保存后才生效，分析使用当时最新的已保存版本。</p>
    <textarea class="input openai-instructions" id="openai-instructions" name="instructions" rows="18" required
    aria-describedby="openai-instructions-help openai-instructions-status" ${draft.saving ? 'readonly' : ''}>${e(draft.text)}</textarea>
    <p id="openai-instructions-status" role="status">${e(draft.error || draft.message || (draft.dirty ? '有未保存修改。' : '已保存'))}</p>
    ${draft.conflict ? '<p role="alert">版本已变化。读取最新版本会保留你的文字，比较并确认后才能再次保存。</p>' : ''}
    <div class="openai-review-actions"><button class="btn primary" type="submit"
    ${!draft.dirty || draft.conflict || draft.saving ? 'disabled' : ''}>${draft.saving ? '保存中…' : '保存指令'}</button>
    <button class="btn" type="button" data-openai-action="compare" ${draft.saving ? 'disabled' : ''}>读取最新版本</button>
    <button class="btn" type="button" data-openai-action="discard" ${draft.saving ? 'disabled' : ''}>放弃本机修改</button></div></form>
    ${draft.latest ? `<section class="openai-latest"><h3>服务器最新指令（版本 ${e(draft.latest.version)}）</h3>
      <pre>${e(draft.latest.instructions)}</pre><button class="btn" type="button" data-openai-action="rebase">
      已比较，保留我的文字继续编辑</button></section>` : ''}`;
}
