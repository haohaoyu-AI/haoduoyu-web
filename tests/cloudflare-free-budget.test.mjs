import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {fixture, USERNAME, PASSWORD} from './harness.mjs';
import {countingDb} from './counting-d1.mjs';

test('representative synthetic requests stay within 50 D1 statements; edge CPU and real data remain unverified', async t => {
  const app = await fixture(t), session = await app.login(), measurements = [];
  for (const path of ['/auth/me', '/accounts', '/overview?period=7d', '/articles?page=1', '/due-reviews',
    '/todos?date=2026-10-24', '/todo-templates', '/todo-preferences', '/backup', '/auth/login']) {
    const db = countingDb(app.db), login = path === '/auth/login';
    const options = login ? {method: 'POST', headers: {'Content-Type': 'application/json', Origin: app.origin},
      body: JSON.stringify({username: USERNAME, password: PASSWORD})} : {headers: {Cookie: session.cookie}};
    const response = await worker.fetch(new Request(app.origin + '/api/v1' + path, options), {DB: db, SITE_ORIGIN: app.origin});
    assert.equal(response.status, 200, path);await response.arrayBuffer();
    const {sql, d1_rows_read, d1_rows_written} = db.totals();
    assert.ok(sql <= 50, path + ': free D1 invocation query budget');
    measurements.push({route: path, statements: sql, rows_read: d1_rows_read, rows_written: d1_rows_written});
  }
  t.diagnostic(JSON.stringify({scope: 'small synthetic local workerd fixture; not edge CPU, quota enforcement or production load', measurements}));
});
