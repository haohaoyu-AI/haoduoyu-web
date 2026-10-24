// Loopback fixture; optional real Worker uses a temporary D1 and synthetic test credentials only.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {frontendBundle} from '../scripts/frontend-build.mjs';
const bundle = await frontendBundle();
const assets = new Map([
  ['/', ['text/html; charset=utf-8', await readFile(new URL('../public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', bundle]],
  ['/style.css', ['text/css; charset=utf-8', await readFile(new URL('../public/style.css', import.meta.url))]],
  ['/favicon.svg', ['image/svg+xml', await readFile(new URL('../public/favicon.svg', import.meta.url))]]
]);
let app, environment;
const server = createServer(async (request, response) => {
  if (app && request.url.startsWith('/api/v1/')) {
    try {
      const chunks = [];
      for await (const part of request) chunks.push(part);
      const body = Buffer.concat(chunks);
      const incoming = new Request(environment.SITE_ORIGIN + request.url, {method: request.method,
        headers: request.headers, ...(!['GET', 'HEAD'].includes(request.method) && body.length ? {body} : {})});
      const result = await (await import('../dist/server/index.js')).default.fetch(incoming, environment);
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      response.writeHead(500, {'Content-Type': 'application/json'});
      response.end(JSON.stringify({error: {message: 'Synthetic real-worker fixture failed'}}));
    }
    return;
  }
  const asset = assets.get(new URL(request.url, 'http://127.0.0.1').pathname);
  response.writeHead(asset ? 200 : 404, {'Content-Type': asset?.[0] || 'text/plain', 'Cache-Control': 'no-store'});
  response.end(asset?.[1] || 'Synthetic frontend fixture: not found');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
if (process.env.DAILY_NOTES_REAL_BACKEND === '1') {
  const {fixture} = await import('./harness.mjs');
  app = await fixture(null, {persist: false, origin});
  const session = await app.login(), owner = (await app.request('/api/v1/auth/me', {session})).data.id;
  environment = {DB: app.db, SITE_ORIGIN: origin, DAILY_NOTES_OWNER_ID: owner,
    PUBLIC_BUSINESS_MODE: '1', PUBLIC_BUSINESS_USER_ID: owner, PUBLIC_BUSINESS_ACCOUNT_IDS: '[]'};
}
console.log(origin);
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => {
  server.close(); await app?.mf.dispose();
});
