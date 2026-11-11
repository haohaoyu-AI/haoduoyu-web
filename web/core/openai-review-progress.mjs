export function openAiStartTime(storage, key, id) {
  try {
    const saved = JSON.parse(storage.getItem(key + ':started'));
    return id && saved?.id === id && Number.isFinite(saved.at) && saved.at > 0 ? saved.at : 0;
  } catch { return 0; }
}
export function openAiElapsed(startedAt, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return seconds < 60 ? `${seconds}秒` : `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
}
export function openAiCompletedElapsed(run) {
  if (!['succeeded', 'failed', 'cancelled'].includes(run?.status)) return '';
  const duration = Number.isFinite(run.elapsed_ms) ? run.elapsed_ms : Date.parse(run.completed_at) - Date.parse(run.created_at);
  return Number.isFinite(duration) && duration >= 0 ? openAiElapsed(0, duration) : '';
}
export function openAiProgressLabel(event) {
  const round = Number.isInteger(event?.round) && event.round >= 1 && event.round <= 4 ? event.round : null;
  const prefix = round ? `第 ${round} 轮 · ` : '';
  switch (event?.stage) {
    case 'source_ready': {
      const articles = Number.isSafeInteger(event.article_count) && event.article_count >= 0 ? event.article_count : null;
      const records = Number.isSafeInteger(event.record_count) && event.record_count >= 0 ? event.record_count : null;
      return '诊断资料已整理' + (articles !== null && records !== null ? `：${articles} 篇文章，${records} 条记录` : '');
    }
    case 'provider_started': return prefix + '已登记模型调用，等待响应';
    case 'provider_responded': return prefix + '已收到 API 响应';
    case 'evidence_lookup': return prefix + '正在核对历史证据';
    case 'synthesizing': return prefix + '正在生成诊断报告';
    case 'saving_report': return '报告已生成，正在保存';
    case 'completed': return '报告已保存，诊断完成';
    default: return '';
  }
}
export function openAiProgressEvents(run) {
  return Array.isArray(run?.progress) ? run.progress.filter(event => openAiProgressLabel(event) &&
    Number.isFinite(event.elapsed_ms) && event.elapsed_ms >= 0).slice(0, 18) : [];
}
export function openAiReviewFeedback(vm) {
  const run = !vm.pendingId || vm.run?.id === vm.pendingId ? vm.run : null;
  const error = run?.error_message || '';
  if (run?.status === 'uncertain') return {title: '结果待确认', detail: error || 'API 执行结果尚未确认。',
    note: '无法确定是否已经计费。不会自动重试；请只读核查状态。'};
  if (vm.pendingId && vm.error) return {title: '当前请求结果待确认', detail: vm.error,
    note: '不会自动重复分析。可以只读核查状态。'};
  if (run?.status === 'running' || vm.operation === 'start' && vm.pendingId) return {
    title: openAiProgressLabel(openAiProgressEvents(run).at(-1)) || (run?.stage === 'awaiting_provider' || run?.provider_calls > 0 ? '已登记调用，等待结果' :
      run?.stage === 'preparing' ? '正在准备诊断资料…' : '请求已发出，等待服务器确认…'), waiting: true,
    detail: '以下步骤随实际执行更新。无需再次点击；离开后可回来查看进度。'};
  if (vm.pendingId) return {title: vm.operation === 'check' ? '正在只读核查状态…' : '当前请求结果待确认',
    detail: '请求编号已保留，不会自动重复分析。请核查状态。'};
  if (run?.status === 'failed') return {title: '本次分析未完成', detail: error || '未生成完整报告。历史记录仍保留。'};
  if (vm.error) return {title: '操作未完成', detail: vm.error};
  if (run?.status === 'succeeded') return {title: '分析完成', detail: '报告已保存，可在诊断报告查看。'};
  return null;
}
// Only the elapsed text changes each second. A missing/hidden/stale target stops the clock.
export function createOpenAiElapsedClock(target, {now = Date.now, every = globalThis.setInterval, cancel = globalThis.clearInterval} = {}) {
  let timer = null;
  const stop = () => { if (timer !== null) cancel(timer); timer = null; };
  const tick = () => {
    const value = target();
    if (!value?.node || !Number.isFinite(value.startedAt) || value.startedAt <= 0) { stop(); return false; }
    value.node.textContent = openAiElapsed(value.startedAt, now());
    return true;
  };
  return {stop, refresh() { stop(); if (tick()) timer = every(tick, 1000); }};
}
