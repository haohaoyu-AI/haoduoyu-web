import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);

test('every response has a server-generated request ID and JSON errors correlate at the top level', async t => {
  const app = await fixture(t), ids = new Set();
  for (const path of ['/health', '/app.js', '/style.css', '/api/v1/auth/me', '/synthetic-missing']) {
    const response = await worker.fetch(new Request(app.origin + path, {headers: {'X-Request-Id': 'synthetic-client-choice'}}),
      {DB: app.db, SITE_ORIGIN: app.origin});
    const id = response.headers.get('X-Request-Id');
    assert.ok(uuid(id), path + ' server request ID');assert.notEqual(id, 'synthetic-client-choice');assert.equal(ids.has(id), false);ids.add(id);
    if (response.status >= 400) assert.equal((await response.json()).request_id, id);
    else await response.body?.cancel();
  }
});

test('500 logs correlate with response IDs without copying dynamic routes or error canaries', async t => {
  const canary = 'synthetic-canary-' + randomUUID(), logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  const db = {prepare() {const error = new Error(canary + '\r\n' + 'x'.repeat(8192));error.name = canary;error.cause = {nested: canary};throw error;}};
  const response = await worker.fetch(new Request('http://localhost/api/v1/articles/' + canary + '?q=' + canary,
    {headers: {'X-Request-Id': canary, Authorization: canary, Cookie: canary}}), {DB: db, SITE_ORIGIN: 'http://localhost'});
  assert.equal(response.status, 500);assert.equal(logs.length, 1, 'one structured server-error log');
  assert.equal(logs[0].length, 1);assert.equal(typeof logs[0][0], 'string');
  const log = JSON.parse(logs[0][0]), body = await response.json(), id = response.headers.get('X-Request-Id');
  assert.ok(uuid(id));assert.equal(log.rid, id);assert.equal(body.request_id, id);
  assert.deepEqual(Object.keys(log).sort(), ['rid', 'method', 'route', 'name', 'message'].sort());
  assert.equal(log.method, 'GET');assert.equal(log.route, '/api/v1/articles/{id}');
  assert.equal(logs[0][0].includes(canary), false);assert.equal(logs[0][0].includes('\r'), false);
  assert.equal(logs[0][0].includes('\n'), false);assert.ok(logs[0][0].length < 512);
});
