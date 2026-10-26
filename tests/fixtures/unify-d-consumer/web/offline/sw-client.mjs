const VERSION = /^[a-f0-9]{64}$/;

async function beforeRefresh(page) {
  const pending = [], failures = [];
  let collecting = true, dispatchError;
  const detail = Object.freeze({
    waitUntil(promise) {
      if (!collecting) throw new Error('REFRESH_WAIT_CLOSED');
      pending.push(Promise.resolve(promise));
    },
    onFailure(callback) {
      if (!collecting || typeof callback !== 'function') throw new Error('REFRESH_FAILURE_CALLBACK_INVALID');
      failures.push(callback);
    }
  });
  const fail = error => Promise.allSettled(failures.map(callback => Promise.resolve().then(() => callback(error))));
  try { page.dispatchEvent(new page.CustomEvent('haoduoyu:before-refresh', { detail })); }
  catch (error) { dispatchError = error; }
  collecting = false;
  const results = await Promise.allSettled(pending);
  const rejected = results.find(result => result.status === 'rejected');
  if (dispatchError || rejected) {
    const error = dispatchError || rejected.reason;
    await fail(error);
    throw error;
  }
  return fail;
}

function updateAction(page, button, activate) {
  let preparing = false, activated = false;
  return async () => {
    if (preparing || activated) return;
    preparing = true;button.disabled = true;
    let onFailure;
    try {
      onFailure = await beforeRefresh(page);
      activated = activate();
      if (!activated) throw new Error('REFRESH_ACTIVATION_UNAVAILABLE');
    } catch (error) {
      if (onFailure) await onFailure(error);
      button.textContent = onFailure ? '更新失败，点此重试' : '草稿保存失败，点此重试';
      button.setAttribute('aria-label', button.textContent);
    } finally {
      preparing = false;
      if (!activated) button.disabled = false;
    }
  };
}

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
  let registration, button, optedIn = false, reloaded = false, destroyed = false;
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
    button.setAttribute('aria-live', 'polite');
    listen(button, 'click', updateAction(page, button, () => {
      const update = registration.waiting || (waiting.state === 'activated' ? waiting : null);
      if (destroyed || !update || update.state === 'redundant') return false;
      optedIn = true;
      listen(update, 'statechange', () => { if (update.state === 'activated') reload(); });
      try { update.postMessage({ type: 'HAODUOYU_SHELL_ACTIVATE' }); }
      catch (error) { optedIn = false;throw error; }
      if (update.state === 'activated') reload();
      return true;
    }));
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
    return { registration, destroy() { destroyed = true;for (const remove of cleanups) remove();button?.remove(); } };
  } catch {
    for (const remove of cleanups) remove();
    return null;
  }
}
