import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {fixture, USERNAME} from './harness.mjs';

async function login(app, {ip = '192.0.2.10', trusted = true, username = USERNAME, password = 'synthetic-wrong-password'} = {}) {
  const response = await worker.fetch(new Request(app.origin + '/api/v1/auth/login', {method: 'POST',
    headers: {Origin: app.origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip},
    body: JSON.stringify({username, password})}), {DB: app.db, SITE_ORIGIN: app.origin,
    ...(trusted ? {TRUST_CF_CONNECTING_IP: '1'} : {})});
  const json = await response.json();return {response, json};
}
test('synthetic trusted-source fifth password failure starts a two-second backoff', async t => {
  const app = await fixture(t);
  for (let i = 1; i <= 5; i++) {
    const {response, json} = await login(app);
    assert.equal(response.status, i < 5 ? 401 : 429, 'failure ' + i);
    assert.equal(json.request_id, response.headers.get('X-Request-Id'));
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    if (i === 5) {assert.equal(json.error.code, 'RATE_LIMITED');assert.equal(response.headers.get('Retry-After'), '2');}
  }
  t.diagnostic('Synthetic flag/header only: this is not proof of the production forwarding contract.');
});
