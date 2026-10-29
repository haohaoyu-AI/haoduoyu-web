/* Build replaces only the marked configuration. This file never caches itself. */
const SHELL_CONFIG = /* HAODUOYU_SHELL_START */ {"version":"9ca6d98a64fc737a9f589cabac8f41b9c073aa658af5fa8f0c38dce0fa193588","assets":[{"url":"/","sha256":"e93d6574a4815b7a37502401bb6b1a54b95a5915665f17ac552cdcaedd400f8a"},{"url":"/app.js","sha256":"16bfad2791af67ca695f99a08e2e4ed0cdc4112df946ebb6b123fac7588a7fd4"},{"url":"/favicon.svg","sha256":"593c0e2ea44ba15371c2509e6a403de65c9fa4cc991b1dc1990666b8791558f8"},{"url":"/glass.css","sha256":"3cfdacf8eed20f1e79011010b61f27a6993b28a3cb27c354d4d8ec268d276107"},{"url":"/manifest.webmanifest","sha256":"36e6c39307c313e49fce4a5461979db77a067468bd743fec951ebf725067c728"},{"url":"/memos.css","sha256":"ab2d3cac6b28741bbfbaf98807f0774114c04ba792c3695d7e7cf497bb3cb17c"},{"url":"/mobile.css","sha256":"e7946370a733b0303fcd15dcbfb0b1b1ba10ae10b680ffc49553da56ab2fd328"},{"url":"/offline.css","sha256":"ffe82241fcd4f37cf9c2679997d211b842983e4ee224b02cfdc3482c5d2bd209"},{"url":"/style.css","sha256":"7a76c81c5d4d5407680629412ae2346da09d9476c29c680b3b870791516db65d"},{"url":"/sw-update.css","sha256":"71fd49006e515bd8b6649c8ab19aae08214784b93da7fface2d8606844627679"},{"url":"/tokens.css","sha256":"8f36d316f7bc79f9a5d4bbe4eb2e6036fc11397f0c12a07408522b38543acdf4"},{"url":"/workbench.css","sha256":"e4fcdd1eee1977e65f4b1e5125f945d4440f5246baf7a962916ec1024f28f5c8"}]} /* HAODUOYU_SHELL_END */;

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
  self.addEventListener('install', event => event.waitUntil(install()));
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
      event.waitUntil(self.skipWaiting()); // Only an explicit page update button sends this.
  });
})();
