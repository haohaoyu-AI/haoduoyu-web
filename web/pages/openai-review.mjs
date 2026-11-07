import {e} from '../core/dom.mjs';
import {renderSafeMarkdown} from '../core/safe-markdown.mjs';
import {openAiDiaryLink, openAiRunActive} from '../core/openai-review-state.mjs';

export const openAiLogin = '<p class="hint">请先<a href="?page=login">管理员登录</a>，再查看或使用 OpenAI API。</p>';
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
  if (run.mode === 'full') {
    if (run.baseline_run_id === null) return '首次全量分析';
    return run.baseline_run_id ? '全量重查' : '全量分析';
  }
  return run.mode === 'incremental' ? '累计复盘' : '文章复盘';
}
export function renderOpenAiRun(run) {
  return `<article class="card panel openai-run" id="openai-run-${e(run.id)}" tabindex="-1">
    <div class="openai-run-heading"><h3>${e(openAiRunLabel(run))}</h3>
    <time datetime="${e(run.created_at)}">${e(timestamp(run.created_at))}</time></div>
    <p class="hint">${e(openAiRunModeLabel(run))}
    ${run.model ? ' · ' + e(run.model) : ''}${run.instruction_version ? ' · 指令版本 ' + e(run.instruction_version) : ''}</p>
    ${run.report_markdown ? `<div class="ai-report-markdown">${renderSafeMarkdown(run.report_markdown)}</div>` : ''}
    ${run.status === 'failed' ? `<p role="alert">${e(run.error_message || '未生成完整报告。历史记录仍保留。')}</p>` : ''}
    ${run.status === 'uncertain' ? `<p role="status">${e(run.error_message ||
      'API 执行结果尚未确认，可能已经计费；不会自动重试。')}</p>
      <p><a href="?page=review&amp;account=V%E5%AD%97#openai-review-panel">前往复盘页核查状态</a></p>` : ''}
    ${openAiRunActive(run) ? '<p role="status">分析进行中。可在复盘页核查状态，无需再次发起。</p>' : ''}</article>`;
}
export function renderOpenAiReviewPanel(vm = {}) {
  const header = '<div class="openai-review-heading"><h2>OpenAI API 复盘</h2>' +
    '<a href="?page=settings&amp;tab=openai">分析指令与设置</a></div>';
  if (!vm.owner) return header + openAiLogin;
  const busy = vm.loading || vm.busy, disabled = busy || !vm.config?.configured || Boolean(vm.pendingId);
  const status = vm.loading ? '正在读取分析配置…' : !vm.config ? '暂时无法读取配置。' :
    vm.config.configured ? '可发起分析' : '尚未配置 OpenAI API，暂不能发起分析。';
  return header + `<p class="hint">首次分析全部已登记文章和指标；之后结合最新摘要，比较新增文章、数据变化与历史统计。</p>
    <p class="hint">${e(status)}${vm.config?.model ? ' · ' + e(vm.config.model) : ''}</p>
    <div class="openai-review-actions"><button class="btn primary" type="button" data-openai-action="start"
    ${disabled ? 'disabled' : ''}>${vm.busy ? '正在处理…' : '一键 OpenAI 分析'}</button>
    <button class="btn" type="button" data-openai-action="full" ${disabled ? 'disabled' : ''}>重新全量分析</button>
    ${vm.pendingId ? `<button class="btn" type="button" data-openai-action="check" ${busy ? 'disabled' : ''}>核查状态</button>` : ''}
    ${vm.pendingId && (vm.notFound || vm.run?.status === 'uncertain') ?
      `<button class="btn" type="button" data-openai-action="release" ${busy ? 'disabled' : ''}>结束本次状态核查</button>` : ''}
    ${!vm.config && !vm.loading ? '<button class="btn" type="button" data-openai-action="reload">重新读取</button>' : ''}</div>
    <p role="status" aria-live="polite">${e(vm.error || (vm.pendingId ? '请求已保留，请核查状态，不会自动重复提交。' : ''))}</p>
    ${vm.run ? `<p>最近记录：${e(openAiRunLabel(vm.run))} · ${e(timestamp(vm.run.created_at))}
      <a href="${e(openAiDiaryLink(vm.run))}">在 AI 日报查看这条记录</a></p>` : ''}`;
}
export function renderOpenAiSettings(vm = {}) {
  if (!vm.owner) return `<section id="openai-settings" class="card panel"><h2>OpenAI API</h2>${openAiLogin}</section>`;
  const draft = vm.draft;
  const status = vm.loading ? '正在读取…' : !draft ? '配置读取失败。' :
    draft.saved.configured ? '可发起分析' : '尚未配置 OpenAI API';
  return `<section id="openai-settings" class="card panel"><h2>OpenAI API</h2><p class="hint">${e(status)}</p>
    <p class="hint">仅管理员可编辑。密钥由服务器管理，此处不显示或录入密钥。</p>
    ${draft ? renderInstructions(draft) : ''}<p role="alert">${e(vm.error || '')}</p>
    ${!draft && !vm.loading ? '<button class="btn" type="button" data-openai-action="reload-settings">重新读取</button>' : ''}</section>`;
}
function renderInstructions(draft) {
  return `<form id="openai-instructions-form"><label for="openai-instructions">完整分析指令</label>
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
