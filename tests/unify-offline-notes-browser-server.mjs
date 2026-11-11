// Synthetic loopback fixture. It serves the real frontend and Worker against temporary D1 only.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fixture} from './harness.mjs';
import {frontendBundle} from '../scripts/frontend-build.mjs';
import {buildServiceWorkerAssets, shellAssetPaths} from '../scripts/service-worker-build.mjs';
import worker from '../dist/server/index.js';
import {randomUUID} from 'node:crypto';
import {beijingDay} from '../src/lib/time.mjs';

const root = new URL('../', import.meta.url), paths = [...shellAssetPaths.filter(path => path !== '/'), '/offline.css'];
const assets = {};
for (const path of paths) assets[path] = path === '/app.js' ? await frontendBundle(root.pathname) :
  await readFile(new URL('public' + path, root), 'utf8');
const shell = buildServiceWorkerAssets({indexHtml: await readFile(new URL('public/index.html', root), 'utf8'),
  swSource: await readFile(new URL('public/sw.js', root), 'utf8'), assets});
let app, environment, syntheticSession;
const calls = [];
let dropNextPut = false;
const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, 'http://localhost');
    if (url.pathname === '/__offline-test/session') {
      outgoing.writeHead(200, {'Content-Type': 'application/json', 'Set-Cookie': syntheticSession.cookie + '; Path=/; HttpOnly; SameSite=Lax'});
      outgoing.end(JSON.stringify({csrfToken: syntheticSession.csrfToken})); return;
    }
    if (url.pathname === '/__offline-test/calls') {
      outgoing.writeHead(200, {'Content-Type': 'application/json'}); outgoing.end(JSON.stringify(calls)); return;
    }
    if (url.pathname === '/__offline-test/drop-next-put') {
      dropNextPut = true; outgoing.end('synthetic fault armed'); return;
    }
    if (url.pathname.startsWith('/api/v1/')) {
      const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
      const body = Buffer.concat(chunks), row = {path: url.pathname, method: incoming.method}; calls.push(row);
      if (body.length && url.pathname.startsWith('/api/v1/note-entries/')) {
        const value = JSON.parse(body.toString()); row.save_id = value.save_id; row.version = value.version;
      }
      const response = await worker.fetch(new Request(environment.SITE_ORIGIN + incoming.url, {method: incoming.method,
        headers: incoming.headers, ...(body.length ? {body} : {})}), environment);
      row.status = response.status;
      if (dropNextPut && incoming.method === 'PUT' && url.pathname.startsWith('/api/v1/note-entries/')) {
        // Keep the committed response pending until the real client timeout. Abruptly closing
        // a reused HTTP connection can make Chromium retry PUT before fetch observes a failure.
        dropNextPut = false; row.dropped = true;
        const timer = setTimeout(() => outgoing.destroy(), 30000); timer.unref();
        outgoing.once('close', () => clearTimeout(timer)); return;
      }
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
syntheticSession = session;
environment = {DB: app.db, SITE_ORIGIN: origin, DAILY_NOTES_OWNER_ID: owner, MEMOS_OWNER_ID: owner,
  PUBLIC_BUSINESS_MODE: '1', PUBLIC_BUSINESS_USER_ID: owner, PUBLIC_BUSINESS_ACCOUNT_IDS: '[]'};
const day = beijingDay(Date.now()), previous = new Date(Date.parse(day + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
const stamp = new Date().toISOString();
await app.db.prepare('INSERT INTO matrix_daily_notes(user_id,date,text,version,change_seq,created_at,updated_at) VALUES(?,?,?,1,1,?,?)')
  .bind(owner, day, '【自动测试】只读原有记录', stamp, stamp).run();
for (const category of ['life', 'work']) {
  const response = await worker.fetch(new Request(origin + '/api/v1/note-entries/' + randomUUID(), {method: 'PUT',
    headers: {'Content-Type': 'application/json', Origin: origin, 'X-Public-Business': '1'},
    body: JSON.stringify({category, date: previous, text: '【自动测试】快照未打开' + category, version: 0, save_id: randomUUID()})}), environment);
  if (!response.ok) throw new Error('Synthetic note seed failed: ' + await response.text());
}
console.log(origin);
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => {
  server.closeAllConnections(); server.close(); await app.mf.dispose(); process.exit(0);
});
