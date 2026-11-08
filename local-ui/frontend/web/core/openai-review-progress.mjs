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
export function openAiReviewFeedback(vm) {
  const run = !vm.pendingId || vm.run?.id === vm.pendingId ? vm.run : null;
  const error = run?.error_message || '';
  if (run?.status === 'uncertain') return {title: '结果待确认', detail: error || 'API 执行结果尚未确认。',
    note: '无法确定是否已经计费。不会自动重试；请只读核查状态。'};
  if (vm.pendingId && vm.error) return {title: '当前请求结果待确认', detail: vm.error,
    note: '不会自动重复分析。可以只读核查状态。'};
  if (run?.status === 'running' || vm.operation === 'start' && vm.pendingId) return {
    title: run?.stage === 'awaiting_provider' || run?.provider_calls > 0 ? '已登记调用，等待结果' :
      run?.stage === 'preparing' ? '正在准备诊断资料…' : '请求已发出，等待服务器确认…', waiting: true,
    detail: '仅显示已确认的请求状态，不代表模型思考进度。无需再次点击；离开后可回来核查。'};
  if (vm.pendingId) return {title: vm.operation === 'check' ? '正在只读核查状态…' : '当前请求结果待确认',
    detail: '请求编号已保留，不会自动重复分析。请核查状态。'};
  if (run?.status === 'failed') return {title: '本次分析未完成', detail: error || '未生成完整报告。历史记录仍保留。'};
  if (vm.error) return {title: '操作未完成', detail: vm.error};
  if (run?.status === 'succeeded') return {title: '分析完成', detail: '报告已保存，可在诊断报告查看。'};
  return null;
}
// Only the elapsed text changes each second. A missing/hidden/stale target stops the clock.
export function createOpenAiElapsedClock(target, {now = Date.now, every = setInterval, cancel = clearInterval} = {}) {
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
