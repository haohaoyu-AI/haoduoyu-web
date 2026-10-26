const VERSION = /^[a-f0-9]{64}$/;

export async function startServiceWorker({
  navigator: browser = globalThis.navigator,
  window: page = globalThis.window,
  document: document = globalThis.document,
  onSyncRequest
} = {}) {
  if (!browser?.serviceWorker || !page || !document) return null;
  const serviceWorker = browser.serviceWorker;
  const version = document.querySelector('meta[name="haoduoyu-shell-version"]')?.content;
  const cleanups = [];
  let registration, button, optedIn = false, reloaded = false;
  function listen(target, type, callback) {
    target.addEventListener(type, callback);
    cleanups.push(() => target.removeEventListener(type, callback));
  }
  function announce() {
    if (VERSION.test(version)) serviceWorker.controller?.postMessage({ type: 'HAODUOYU_SHELL_CLIENT_VERSION', version });
  }
  function reload() {
    if (!optedIn || reloaded) return;
    reloaded = true;
    page.location.reload();
  }
  function notice() {
    const waiting = registration?.waiting;
    if (!waiting || !registration.active || button) return;
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'sw-update-notice';
    button.textContent = '有新版本';
    button.setAttribute('aria-label', '有新版本，点此更新');
    listen(button, 'click', () => {
      if (optedIn || !registration.waiting) return;
      optedIn = true;
      button.disabled = true;
      const update = registration.waiting;
      listen(update, 'statechange', () => { if (update.state === 'activated') reload(); });
      update.postMessage({ type: 'HAODUOYU_SHELL_ACTIVATE' });
    });
    document.body.append(button);
  }
  function watchInstall() {
    const installing = registration.installing;
    if (!installing) return;
    listen(installing, 'statechange', () => { if (installing.state === 'installed') notice(); });
  }
  listen(serviceWorker, 'controllerchange', () => { if (optedIn) reload(); else announce(); });
  listen(page, 'haoduoyu:native-online', event => {
    if (event.detail?.protocol !== 1 || event.detail?.reason !== 'network-restored') return;
    if (onSyncRequest) onSyncRequest({ source: 'native-online' });
    else page.dispatchEvent(new page.CustomEvent('haoduoyu:sync-request', { detail: { source: 'native-online' } }));
  });
  try {
    registration = await serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    announce();notice();watchInstall();
    listen(registration, 'updatefound', watchInstall);
    listen(page, 'online', () => { registration.update().catch(() => {}); });
    listen(document, 'visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {});
    });
    return { registration, destroy() { for (const remove of cleanups) remove();button?.remove(); } };
  } catch {
    for (const remove of cleanups) remove();
    return null;
  }
}
