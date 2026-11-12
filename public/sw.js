/* Build replaces only the marked configuration. This file never caches itself. */
const SHELL_CONFIG = /* HAODUOYU_SHELL_START */ {"version":"d5011f10d3cdceb8c7f16d34385e064ebf2d77a5cc91ab37479ec0d244457dcc","assets":[{"url":"/","sha256":"d412fc99910c3233f5538c1e517efaf20790a50e10d4829990a60ca8244ba97b"},{"url":"/app.js","sha256":"3eaa2637b0656c46103efc27e05b03ae846a60b4e43b706579dc45c031ee7773"},{"url":"/favicon.svg","sha256":"3e8f3efa9f1c0001145ff4f7f1f736c0feb815182e2a448b00f0d7b73238cb6b"},{"url":"/glass.css","sha256":"571e37644b7e1e55b039f1d4da2e00173a10b1c91ba00c96148bb2872ae1efba"},{"url":"/manifest.webmanifest","sha256":"b13e69559fb1b5a5d54a14bfc3fb59427b96c15860219ca2cd97f907d5d4d281"},{"url":"/memos.css","sha256":"2b655731e5de30606deb9b3183d579b5f01d76f736ca625bdb04453e258ed897"},{"url":"/mobile.css","sha256":"ce1da77686ff4e114139a258c1d2c80bc6f2a844544cea828eccc135d08424a0"},{"url":"/offline.css","sha256":"ceb710bb10d345409d0437274dc1dd79c5152b1de874c7c10f290edc0f21ed7c"},{"url":"/review.css","sha256":"afbed154b488a48602e7ca29f356297c05397b6dd60124a3366cab61369fce9b"},{"url":"/style.css","sha256":"5e02e91d3f94d6863cadd2049e073c653f178a83d7dcf5a4cc07d12952beabe6"},{"url":"/sw-update.css","sha256":"8a9500d0a0b8cdb2543704b28e1dba99b029afb0af3725434b3448bd3239cd23"},{"url":"/tokens.css","sha256":"9613bcbaba412086d86e006f8178dcc23682f35bcaf515d9e43f7bc78b75af02"},{"url":"/workbench.css","sha256":"5ce77aca77eb7edd1cac6e4b2b52fd1db3c09323f3c3dcf38804aece949f4279"}]} /* HAODUOYU_SHELL_END */;

(() => {
  'use strict';
  const ORIGIN = self.location.origin;
  const PREFIX = 'haoduoyu-shell-v1-';
  const PINS = 'haoduoyu-shell-clients-v1';
  const INTERNAL = '/__haoduoyu_sw_internal__/';
  const READY = ORIGIN + INTERNAL + 'ready';
  const ACTIVE = ORIGIN + INTERNAL + 'active';
  const VERSION = /^[a-f0-9]{64}$/;
  const CLIENT = /^[a-zA-Z0-9_-]{1,128}$/;
  const REQUIRED = ['/', '/app.js', '/tokens.css', '/mobile.css', '/style.css', '/memos.css',
    '/glass.css', '/workbench.css', '/sw-update.css', '/favicon.svg', '/manifest.webmanifest'];
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const allowedPath = path => REQUIRED.includes(path) || /^\/[a-z0-9][a-z0-9._-]{0,99}\.css$/.test(path);
  function configuration(value) {
    if (!plain(value) || !VERSION.test(value.version) || !Array.isArray(value.assets) || value.assets.length > 64) return null;
    if (Object.keys(value).some(key => !['version', 'assets'].includes(key))) return null;
    const seen = new Set();
    for (const asset of value.assets) {
      if (!plain(asset) || Object.keys(asset).some(key => !['url', 'sha256'].includes(key)) ||
          !allowedPath(asset.url) || !VERSION.test(asset.sha256) || seen.has(asset.url)) return null;
      seen.add(asset.url);
    }
    return REQUIRED.every(path => seen.has(path)) ? value : null;
  }
  const config = configuration(SHELL_CONFIG);
  const cacheName = version => PREFIX + version;
  const requestKey = path => ORIGIN + path;
  const pinKey = id => ORIGIN + INTERNAL + 'client/' + id;
  const unavailable = () => new Response('应用外壳暂不可用，请联网后重试。', {
    status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
  });

  async function digest(bytes) {
    const result = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async function verifiedAsset(asset) {
    const response = await fetch(requestKey(asset.url), { cache: 'no-store', credentials: 'omit', redirect: 'error' });
    if (response.status !== 200 || response.redirected || response.type === 'opaque' ||
        await digest(await response.clone().arrayBuffer()) !== asset.sha256) throw new Error('SHELL_HASH_MISMATCH');
    return response;
  }
  async function ready(version) {
    if (!VERSION.test(version) || !await caches.has(cacheName(version))) return null;
    const cache = await caches.open(cacheName(version));
    try {
      const response = await cache.match(READY);
      if (!response) return null;
      const record = await response.json();
      return configuration(record.config)?.version === version && Number.isFinite(record.installedAt) ? record : null;
    } catch { return null; }
  }
  async function install() {
    if (!config) throw new Error('SHELL_CONFIG_MISSING');
    const existing = await ready(config.version);
    if (existing && JSON.stringify(existing.config) === JSON.stringify(config)) {
      const cache = await caches.open(cacheName(config.version));
      const present = await Promise.all(config.assets.map(async asset => {
        const response = await cache.match(requestKey(asset.url));
        return response && await digest(await response.arrayBuffer()) === asset.sha256;
      }));
      if (present.every(Boolean)) return;
    }
    // Validate the whole generation before publishing any newly downloaded file.
    const responses = await Promise.all(config.assets.map(verifiedAsset));
    const existed = await caches.has(cacheName(config.version));
    const cache = await caches.open(cacheName(config.version));
    try {
      for (let index = 0; index < config.assets.length; index++)
        await cache.put(requestKey(config.assets[index].url), responses[index]);
      await cache.put(READY, Response.json({ config, installedAt: Date.now() }));
    } catch (error) {
      if (!existed) await caches.delete(cacheName(config.version));
      throw error;
    }
  }
  async function pin(id, version) {
    if (!CLIENT.test(id || '') || !await ready(version)) return;
    await (await caches.open(PINS)).put(pinKey(id), Response.json({ version }));
  }
  async function pinned(id) {
    if (!CLIENT.test(id || '')) return null;
    try {
      const response = await (await caches.open(PINS)).match(pinKey(id));
      const version = response && (await response.json()).version;
      return VERSION.test(version) ? version : null;
    } catch { return null; }
  }
  async function activate() {
    if (!config || !await ready(config.version)) throw new Error('SHELL_NOT_READY');
    const metadata = await caches.open(PINS);
    const keep = new Set([config.version]);
    try {
      const previous = await metadata.match(ACTIVE);
      const version = previous && (await previous.json()).version;
      if (VERSION.test(version) && await ready(version)) keep.add(version);
    } catch {}
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const live = new Set(windows.map(client => client.id));
    for (const request of await metadata.keys()) {
      if (request.url === ACTIVE) continue;
      const id = new URL(request.url).pathname.slice((INTERNAL + 'client/').length);
      const version = await pinned(id);
      if (live.has(id) && version && await ready(version)) keep.add(version);
      else await metadata.delete(request);
    }
    const generations = [];
    for (const name of await caches.keys()) {
      if (!name.startsWith(PREFIX)) continue;
      const version = name.slice(PREFIX.length), record = await ready(version);
      if (record) generations.push({ version, installedAt: record.installedAt });
    }
    // Preserve one complete previous generation even after browser shutdown or
    // a navigation whose browser supplied no resultingClientId. Rollback can reuse it.
    const previous = generations.filter(item => item.version !== config.version)
      .sort((a, b) => b.installedAt - a.installedAt)[0];
    if (previous) keep.add(previous.version);
    for (const name of await caches.keys())
      if (name.startsWith(PREFIX) && !keep.has(name.slice(PREFIX.length))) await caches.delete(name);
    await metadata.put(ACTIVE, Response.json({ version: config.version }));
    // No clients.claim(): installing for the first time must not take over a
    // document that has already loaded some files from the network.
  }
  async function refresh(asset, generation) {
    try {
      const response = await verifiedAsset(asset);
      await (await caches.open(cacheName(generation))).put(requestKey(asset.url), response);
    } catch (error) {
      if (error.message === 'SHELL_HASH_MISMATCH') await self.registration.update().catch(() => {});
    }
  }
  async function shellResponse(event, url, navigation) {
    const requested = navigation ? null : url.searchParams.get('__shell');
    if (requested !== null && !VERSION.test(requested)) return { response: unavailable() };
    const version = navigation ? config.version : requested || await pinned(event.clientId) || config.version;
    const record = await ready(version);
    if (!record) return { response: unavailable() };
    const path = navigation ? '/' : url.pathname;
    const asset = record.config.assets.find(item => item.url === path);
    if (!asset) return { response: await fetch(event.request, { cache: 'no-store' }) };
    const id = navigation ? event.resultingClientId || event.clientId : event.clientId;
    await pin(id, version);
    const cache = await caches.open(cacheName(version));
    let response = await cache.match(requestKey(path));
    if (!response) {
      try {
        response = await verifiedAsset(asset);
        await cache.put(requestKey(path), response.clone());
      } catch { return { response: unavailable() }; }
    }
    return { response, background: refresh(asset, version) };
  }
  function networkOnly(path) {
    return path === '/api/v1' || path.startsWith('/api/v1/') ||
      ['/health', '/auth', '/login', '/logout'].some(prefix => path === prefix || path.startsWith(prefix + '/'));
  }
  // Activate only after every shell asset passes its integrity check. Existing
  // documents are not claimed or reloaded: their pinned assets and any
  // unsaved editor state remain intact. New navigations get the new shell.
  self.addEventListener('install', event => event.waitUntil(install().then(() => self.skipWaiting())));
  self.addEventListener('activate', event => event.waitUntil(activate()));
  self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (url.origin !== ORIGIN) return;
    if (networkOnly(url.pathname)) {
      event.respondWith(fetch(event.request, { cache: 'no-store' }));
      return;
    }
    if (!config || event.request.method !== 'GET') return;
    const navigation = event.request.mode === 'navigate' && ['/', '/index.html'].includes(url.pathname);
    if (!navigation && !allowedPath(url.pathname)) return;
    const task = shellResponse(event, url, navigation);
    event.respondWith(task.then(result => result.response));
    event.waitUntil(task.then(result => result.background).catch(() => {}));
  });
  self.addEventListener('message', event => {
    const source = event.source;
    if (!source || source.type !== 'window') return;
    try { if (new URL(source.url).origin !== ORIGIN) return; } catch { return; }
    if (event.data?.type === 'HAODUOYU_SHELL_CLIENT_VERSION')
      event.waitUntil(pin(source.id, event.data.version));
    if (event.data?.type === 'HAODUOYU_SHELL_ACTIVATE')
      event.waitUntil(self.skipWaiting()); // Retain compatibility with older update buttons.
  });
})();
