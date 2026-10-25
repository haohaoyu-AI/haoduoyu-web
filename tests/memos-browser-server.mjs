// Loopback-only browser fixture: real Worker, temporary D1, synthetic owner.
import {createServer} from 'node:http';
import {fixture} from './harness.mjs';

let app, environment;
const server = createServer(async (request, response) => {
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
    response.end(JSON.stringify({error: {message: 'Synthetic memo fixture failed'}}));
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
try {
  app = await fixture(null, {persist: false, origin});
  const session = await app.login(), owner = (await app.request('/api/v1/auth/me', {session})).data.id;
  environment = {DB: app.db, SITE_ORIGIN: origin, MEMOS_OWNER_ID: owner, DAILY_NOTES_OWNER_ID: owner,
    PUBLIC_BUSINESS_MODE: '1', PUBLIC_BUSINESS_USER_ID: owner, PUBLIC_BUSINESS_ACCOUNT_IDS: '[]'};
  console.log(origin);
} catch (error) {
  server.close(); await app?.mf.dispose(); throw error;
}
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => {
  server.close(); await app?.mf.dispose();
});
