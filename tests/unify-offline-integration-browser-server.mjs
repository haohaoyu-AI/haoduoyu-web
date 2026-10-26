// Synthetic loopback fixture. It serves the real frontend and Worker against temporary D1 only.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fixture} from './harness.mjs';
import {frontendBundle} from '../scripts/frontend-build.mjs';
import {buildServiceWorkerAssets, shellAssetPaths} from '../scripts/service-worker-build.mjs';
import worker from '../dist/server/index.js';

const root = new URL('../', import.meta.url), paths = [...shellAssetPaths.filter(path => path !== '/'), '/offline.css'];
const assets = {};
for (const path of paths) assets[path] = path === '/app.js' ? await frontendBundle(root.pathname) :
  await readFile(new URL('public' + path, root), 'utf8');
const shell = buildServiceWorkerAssets({indexHtml: await readFile(new URL('public/index.html', root), 'utf8'),
  swSource: await readFile(new URL('public/sw.js', root), 'utf8'), assets});
let app, environment;
const calls = [];
const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, 'http://localhost');
    if (url.pathname === '/__offline-test/calls') {
      outgoing.writeHead(200, {'Content-Type': 'application/json'}); outgoing.end(JSON.stringify(calls)); return;
    }
    if (url.pathname.startsWith('/api/v1/')) {
      const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
      const body = Buffer.concat(chunks), row = {path: url.pathname, method: incoming.method}; calls.push(row);
      const response = await worker.fetch(new Request(environment.SITE_ORIGIN + incoming.url, {method: incoming.method,
        headers: incoming.headers, ...(body.length ? {body} : {})}), environment);
      row.status = response.status;
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer())); return;
    }
    const data = url.pathname === '/' ? shell.indexHtml : url.pathname === '/sw.js' ? shell.swSource : assets[url.pathname];
    const type = url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' :
      url.pathname.endsWith('.svg') ? 'image/svg+xml' : url.pathname.endsWith('.webmanifest') ? 'application/manifest+json' : 'text/html';
    outgoing.writeHead(data === undefined ? 404 : 200, {'Content-Type': type + '; charset=utf-8',
      'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/'});
    outgoing.end(data ?? 'Synthetic fixture: not found');
  } catch (error) {
    outgoing.writeHead(500, {'Content-Type': 'application/json'});
    outgoing.end(JSON.stringify({error: {message: error.message}}));
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
app = await fixture(null, {persist: false, origin});
const session = await app.login(), owner = (await app.request('/api/v1/auth/me', {session})).data.id;
environment = {DB: app.db, SITE_ORIGIN: origin, DAILY_NOTES_OWNER_ID: owner, MEMOS_OWNER_ID: owner,
  PUBLIC_BUSINESS_MODE: '1', PUBLIC_BUSINESS_USER_ID: owner, PUBLIC_BUSINESS_ACCOUNT_IDS: '[]'};
console.log(origin);
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => {
  server.closeAllConnections(); server.close(); await app.mf.dispose(); process.exit(0);
});
