// Re-read the visible day without rebuilding the page or interrupting an edit.
export function watchVisibleTodoDay({window, document, selection, read, apply, now = Date.now}) {
  let running = false, composing = false, after = 0, stopped = false;
  const begin = () => { composing = true; };
  const end = () => { composing = false; };
  async function refresh() {
    if (running || composing || stopped || now() < after || document.visibilityState !== 'visible' || window.navigator.onLine === false) return;
    const current = selection();
    if (!current) return;
    running = true;
    after = now() + 5000;
    try {
      const data = await read(current.date);
      if (!stopped && !composing && document.visibilityState === 'visible' && selection()?.key === current.key) apply(current, data);
    } catch (error) {
      after = now() + Math.max(20000, Number(error?.retryAfterMs) || 0);
    } finally { running = false; }
  }
  const timer = window.setInterval(refresh, 20000);
  window.addEventListener('focus', refresh);
  window.addEventListener('online', refresh);
  document.addEventListener('visibilitychange', refresh);
  document.addEventListener('compositionstart', begin, true);
  document.addEventListener('compositionend', end, true);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    window.removeEventListener('focus', refresh);
    window.removeEventListener('online', refresh);
    document.removeEventListener('visibilitychange', refresh);
    document.removeEventListener('compositionstart', begin, true);
    document.removeEventListener('compositionend', end, true);
  };
}
