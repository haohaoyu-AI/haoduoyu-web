import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {build} from 'esbuild';
import worker from '../dist/server/index.js';
import {fixture, USERNAME, PASSWORD} from './harness.mjs';
import {countingDb} from './counting-d1.mjs';
import {csrfFor} from '../shared/auth.mjs';
import {traceHeaders, traceJSON} from './request-trace-projection.mjs';

const root = new URL('../', import.meta.url);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
async function request(app, path, {headers = {}, method = 'GET', body, db = app.db, env = {}, target = worker} = {}) {
  const response = await target.fetch(new Request(app.origin + path, {method, headers,
    body: body === undefined ? undefined : JSON.stringify(body)}), {DB: db, SITE_ORIGIN: app.origin, ...env});
  const text = await response.text();let json;try {json = JSON.parse(text);} catch {}
  return {status: response.status, headers: response.headers, text, json};
}
function correlated(value) {
  const id = value.headers.get('X-Request-Id');assert.ok(uuid(id));
  if (value.status >= 400 && value.json) assert.equal(value.json.request_id, id);
  if (value.status < 400 && value.json) assert.equal(Object.hasOwn(value.json, 'request_id'), false);
  return id;
}
function logRow(call, value) {
  assert.equal(call.length, 1);assert.equal(typeof call[0], 'string');const row = JSON.parse(call[0]);
  assert.equal(row.rid, correlated(value));assert.deepEqual(Object.keys(row).sort(), ['rid', 'method', 'route', 'name', 'message'].sort());
  assert.ok(call[0].length < 512);return row;
}
async function setup(t) {
  const app = await fixture(t);app.session = await app.login();
  app.account = (await app.request('/api/v1/accounts', {session: app.session})).data[0].id;return app;
}

test('success, static HEAD/304, configuration, initialization and non500 refusals all correlate without error logs', async t => {
  const app = await setup(t), logs = [];t.mock.method(console, 'error', (...args) => logs.push(args));
  const cookie = {Cookie: app.session.cookie}, ids = new Set();
  const cases = [
    ['/', {}, 200], ['/app.js', {}, 200], ['/style.css', {method: 'HEAD'}, 200],
    ['/api/v1/accounts', {headers: cookie}, 200], ['/api/v1/auth/me', {}, 401],
    ['/api/v1/articles?page=bad', {headers: cookie}, 400], ['/missing-synthetic', {}, 404],
    ['/api/v1/dashboard', {headers: cookie, method: 'HEAD'}, 404],
    ['/api/v1/auth/login', {method: 'POST', headers: {Origin: 'http://synthetic.invalid', 'Content-Type': 'application/json'}, body: {}}, 403],
    ['/api/v1/accounts', {method: 'POST', headers: {...cookie, Origin: app.origin, 'Content-Type': 'application/json'}, body: {}}, 403],
    ['/api/v1/accounts', {env: {DB: undefined}}, 503], ['/api/v1/accounts', {env: {SITE_ORIGIN: undefined}}, 503],
  ];
  for (const [path, options, status] of cases) {
    const value = await request(app, path, options);assert.equal(value.status, status, path);
    const id = correlated(value);assert.equal(ids.has(id), false);ids.add(id);
    if (path.startsWith('/api/')) assert.equal(value.headers.get('Cache-Control'), 'no-store');
  }
  const first = await request(app, '/app.js');
  for (const method of ['GET', 'HEAD']) {
    const hit = await request(app, '/app.js', {method, headers: {'If-None-Match': first.headers.get('ETag')}});
    assert.equal(hit.status, 304);assert.equal(hit.text, '');assert.equal(hit.headers.get('Content-Length'), null);
    assert.equal(hit.headers.get('ETag'), first.headers.get('ETag'));assert.equal(hit.headers.get('Cache-Control'), 'no-cache');correlated(hit);
  }
  await app.db.prepare('UPDATE matrix_control SET initialized=2').run();
  const isolated = await request(app, '/api/v1/accounts', {headers: cookie});assert.equal(isolated.status, 503);correlated(isolated);
  assert.equal(logs.length, 0);t.diagnostic(cases.length + 3 + ' response states; non500 logger count=0');
});

test('each initial, authenticated, parse and usage-metadata 500 produces one bounded canary-free record', async t => {
  const app = await setup(t), logs = [], canary = 'synthetic-' + randomUUID();
  t.mock.method(console, 'error', (...args) => logs.push(args));
  const fault = pattern => ({prepare(sql) {if (pattern.test(sql)) {const error = new Error(canary + '\r\n' + 'x'.repeat(100000));error.name = canary;error.cause = {body: canary};throw error;}return app.db.prepare(sql);}});
  const key = (await app.request('/api/v1/api-keys', {session: app.session, method: 'POST',
    body: {name: 'Synthetic tracing key', account_ids: [app.account], permissions: ['read']}})).data;
  const cases = [
    ['/api/v1/articles/' + canary + '?q=' + canary + '#' + canary, {db: fault(/^SELECT initialized/),
      headers: {Authorization: canary, Cookie: canary, 'X-Request-Id': canary}}, '/api/v1/articles/{id}'],
    ['/api/v1/accounts', {db: fault(/FROM matrix_sessions\b/), headers: {Cookie: app.session.cookie}}, '/api/v1/accounts'],
    ['/api/v1/accounts', {db: fault(/^UPDATE matrix_api_keys SET last_used_at/), headers: {Authorization: 'Bearer ' + key.token}}, '/api/v1/accounts'],
    ['/api/v1/' + canary + '?secret=' + canary, {method: canary, db: fault(/^SELECT initialized/),
      headers: {'Content-Type': 'application/json', Cookie: canary, 'X-Request-Id': canary}, body: {nested: canary}}, 'unmatched-api'],
  ];
  for (const [path, options, route] of cases) {
    const before = logs.length, value = await request(app, path, options);
    assert.equal(value.status, 500);assert.equal(logs.length, before + 1);
    const row = logRow(logs.at(-1), value);assert.equal(row.route, route);assert.equal(row.method, options.method ? 'OTHER' : 'GET');
    assert.equal(logs.at(-1)[0].includes(canary), false);assert.equal(logs.at(-1)[0].includes(key.token), false);
  }
  const article = (await app.request('/api/v1/articles', {method: 'POST', session: app.session,
    body: {account_id: app.account, title: '虚构解析错误', url: 'https://example.invalid/trace-parse', published_at: '2001-01-01T00:00:00Z'}})).data;
  await app.db.prepare(`INSERT INTO matrix_observations
    (id,article_id,as_of,collected_at,kind,metrics_json,source,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind('synthetic-invalid-json', article.id, '2001-01-02T00:00:00Z', '2001-01-02T00:00:00Z', 'latest', canary,
      'synthetic', 'synthetic', '2001-01-02T00:00:00Z').run();
  const before = logs.length, parsed = await request(app, '/api/v1/articles/' + article.id, {headers: {Cookie: app.session.cookie}});
  assert.equal(parsed.status, 500);assert.equal(logs.length, before + 1);assert.equal(logRow(logs.at(-1), parsed).name, 'SyntaxError');
  assert.equal(logs.at(-1)[0].includes(canary), false);t.diagnostic('5 distinct real 500 paths; one fixed-field record each');
});

test('concurrent requests never share response or log IDs', async t => {
  const app = await setup(t), logs = [];t.mock.method(console, 'error', (...args) => logs.push(args));
  const failing = {prepare() {throw new Error('Synthetic concurrent failure');}};
  const values = await Promise.all(Array.from({length: 16}, (_, i) => request(app, i % 2 ? '/api/v1/accounts' : '/health', i % 2 ? {db: failing} : {})));
  const ids = values.map(correlated);assert.equal(new Set(ids).size, 16);assert.equal(logs.length, 8);
  const failures = values.filter(value => value.status === 500).map(value => value.headers.get('X-Request-Id')).sort();
  assert.deepEqual(logs.map(call => JSON.parse(call[0]).rid).sort(), failures);
});

test('idempotent replays get fresh IDs without persisting them, including restored500/405 errors and an unchanged302 body', async t => {
  const app = await setup(t), key = 'synthetic-trace-replay', body = {account_id: app.account, title: '虚构关联重放',
    url: 'https://example.invalid/trace-replay', published_at: '2001-01-01T00:00:00Z'};
  const headers = {Cookie: app.session.cookie, Origin: app.origin, 'X-CSRF-Token': app.session.csrfToken,
    'Content-Type': 'application/json', 'Idempotency-Key': key};
  const first = await request(app, '/api/v1/articles', {method: 'POST', headers, body});assert.equal(first.status, 201);correlated(first);
  const saved = await app.db.prepare('SELECT response_json FROM matrix_idempotency WHERE key=?').bind(key).first();
  const revision = (await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision;
  const replays = await Promise.all(Array.from({length: 6}, () => request(app, '/api/v1/articles', {method: 'POST', headers, body})));
  const ids = [correlated(first), ...replays.map(correlated)];assert.equal(new Set(ids).size, 7);
  for (const replay of replays) {assert.equal(replay.status, 201);assert.equal(replay.text, first.text);}
  assert.equal((await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision, revision);
  for (const id of ids) assert.equal(saved.response_json.includes(id), false);
  const logs = [];t.mock.method(console, 'error', (...args) => logs.push(args));
  for (const status of [500, 405, 302]) {
    // The restore format permits a historical non2xx status; production schema and
    // restore validation are deliberately not changed to manufacture a new route.
    await app.db.prepare('UPDATE matrix_idempotency SET status=? WHERE key=?').bind(status, key).run();
    for (let i = 0; i < 2; i++) {
      const value = await request(app, '/api/v1/articles', {method: 'POST', headers, body});
      assert.equal(value.status, status);correlated(value);assert.deepEqual(value.json.data, first.json.data);
      if (status === 500) assert.equal(logRow(logs.at(-1), value).name, 'ReturnedResponse');
    }
  }
  assert.equal(logs.length, 2);assert.equal((await app.db.prepare('SELECT response_json FROM matrix_idempotency WHERE key=?').bind(key).first()).response_json, saved.response_json);
});

test('hot cached overview bodies are unchanged and contain no per-request IDs', async t => {
  const app = await setup(t), db = countingDb(app.db), headers = {Cookie: app.session.cookie};
  const first = await request(app, '/api/v1/overview?period=7d', {headers, db}), cold = db.entries.length;
  const second = await request(app, '/api/v1/overview?period=7d', {headers, db});
  assert.equal(first.status, 200);assert.equal(second.status, 200);assert.equal(first.text, second.text);
  assert.notEqual(correlated(first), correlated(second));assert.equal(first.text.includes(first.headers.get('X-Request-Id')), false);
  assert.ok(db.entries.length - cold < cold, 'second authenticated request uses cached computation, not a cached response ID');
});

test('a throwing log sink cannot replace the response or prevent its correlation fields', async t => {
  let calls = 0;t.mock.method(console, 'error', () => {calls++;throw new Error('Synthetic log sink failure');});
  const app = {origin: 'http://localhost', db: {prepare() {throw new Error('Synthetic DB failure');}}};
  const value = await request(app, '/api/v1/accounts');assert.equal(value.status, 500);correlated(value);
  assert.equal(value.json.error.code, 'INTERNAL_ERROR');assert.equal(calls, 1);
});

test('existing explicitly classified500 message reflection is preserved while the new log remains fixed', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'synthetic-trace-baseline-'));t.after(() => rm(directory, {recursive: true, force: true}));
  const base = '24b5c5082a115cd9ee78e440c0848245079e6048';
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', base, 'src', 'shared'], {cwd: root, encoding: 'utf8'}).trim().split('\n');
  for (const file of files) {const path = join(directory, file);await mkdir(join(path, '..'), {recursive: true});
    await writeFile(path, execFileSync('git', ['show', base + ':' + file], {cwd: root}));}
  await writeFile(join(directory, 'src/assets.generated.mjs'), await readFile(new URL('../src/assets.generated.mjs', import.meta.url)));
  await build({entryPoints: [join(directory, 'src/worker.mjs')], outfile: join(directory, 'worker.mjs'), bundle: true,
    format: 'esm', platform: 'neutral', external: ['node:*'], target: 'es2022'});
  const baseline = (await import(pathToFileURL(join(directory, 'worker.mjs')).href)).default;
  const canary = 'synthetic-' + randomUUID(), logs = [];t.mock.method(console, 'error', (...args) => logs.push(args));
  const app = {origin: 'http://localhost', db: {prepare() {throw Object.assign(new Error(canary), {status: 500, code: 'SYNTHETIC_INTERNAL'});}}};
  const old = await request(app, '/api/v1/accounts', {target: baseline}), value = await request(app, '/api/v1/accounts');
  assert.equal(value.status, 500);assert.ok(old.json.error.message === canary && value.json.error.message === canary);
  assert.ok(isDeepStrictEqual(traceJSON(value.json, value.status, value.headers, true), old.json));
  assert.deepEqual([...traceHeaders(value.headers, true)], [...old.headers]);
  assert.equal(logs.length, 1);logRow(logs[0], value);assert.equal(logs[0][0].includes(canary), false);
  t.diagnostic('Pre-existing explicit-status500 HTTP message reflection confirmed on both versions; no canary value printed');
});

test('real loopback HTTP preserves Cookie, cache/security headers and bodyless HEAD/304 with correlated errors', async t => {
  const app = await setup(t);let origin;
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks = [];for await (const chunk of incoming) chunks.push(chunk);
      const method = incoming.method, response = await worker.fetch(new Request(origin + incoming.url,
        {method, headers: incoming.headers, body: ['GET', 'HEAD'].includes(method) ? undefined : Buffer.concat(chunks)}),
        {DB: app.db, SITE_ORIGIN: origin});
      const headers = Object.fromEntries([...response.headers].filter(([name]) => name !== 'set-cookie'));
      const cookies = response.headers.getSetCookie();if (cookies.length) headers['Set-Cookie'] = cookies;
      outgoing.writeHead(response.status, headers);
      if (method === 'HEAD') {await response.body?.cancel();outgoing.end();return;}
      if (response.body) for await (const chunk of response.body) outgoing.write(chunk);outgoing.end();
    } catch {outgoing.writeHead(500);outgoing.end('Synthetic adapter failure');}
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));origin = 'http://127.0.0.1:' + server.address().port;
  t.after(() => new Promise(resolve => {server.closeAllConnections();server.close(resolve);}));
  const login = await fetch(origin + '/api/v1/auth/login', {method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json'},
    body: JSON.stringify({username: USERNAME, password: PASSWORD})});
  assert.equal(login.status, 200);assert.ok(uuid(login.headers.get('X-Request-Id')));
  const cookie = login.headers.get('Set-Cookie').split(';')[0], token = cookie.slice(cookie.indexOf('=') + 1), loginBody = await login.json();
  assert.equal(loginBody.data.csrfToken, csrfFor(token));assert.equal(Object.hasOwn(loginBody, 'request_id'), false);
  assert.match(login.headers.get('Set-Cookie'), /HttpOnly/);assert.match(login.headers.get('Set-Cookie'), /SameSite=Strict/);
  const first = await fetch(origin + '/app.js'), etag = first.headers.get('ETag');await first.arrayBuffer();
  for (const [path, options, status] of [['/app.js', {method: 'HEAD'}, 200],
    ['/app.js', {headers: {'If-None-Match': etag}}, 304], ['/app.js', {method: 'HEAD', headers: {'If-None-Match': etag}}, 304],
    ['/api/v1/dashboard', {method: 'HEAD', headers: {Cookie: cookie}}, 404]]) {
    const response = await fetch(origin + path, options);assert.equal(response.status, status);assert.equal((await response.arrayBuffer()).byteLength, 0);
    assert.ok(uuid(response.headers.get('X-Request-Id')));assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  }
  const failure = await fetch(origin + '/api/v1/auth/me');assert.equal(failure.status, 401);
  const failed = await failure.json();assert.equal(failed.request_id, failure.headers.get('X-Request-Id'));assert.equal(failure.headers.get('Cache-Control'), 'no-store');
  t.diagnostic('Real loopback login Cookie/CSRF, GET/HEAD/304 and anonymous JSON error verified; no credential values printed');
});
