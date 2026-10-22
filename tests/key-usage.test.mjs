import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {countingDb} from './counting-d1.mjs';

const WINDOW = 300000;
const usageSql = sql => /^UPDATE matrix_api_keys SET last_used_at/.test(sql);
const accountsSql = sql => /FROM matrix_accounts\b/.test(sql);
async function setup(t) {
  const app = await fixture(t);app.session = await app.login();
  app.account = (await app.request('/api/v1/accounts', {session: app.session})).data[0].id;
  app.key = (await app.request('/api/v1/api-keys', {method: 'POST', session: app.session,
    body: {name: 'Synthetic usage reader', account_ids: [app.account], permissions: ['read']}})).data;
  return app;
}
async function stamp(app, value) {
  await app.db.prepare('UPDATE matrix_api_keys SET last_used_at=? WHERE id=?').bind(value, app.key.id).run();
}
async function state(app) {
  return {used: (await app.db.prepare('SELECT last_used_at FROM matrix_api_keys WHERE id=?').bind(app.key.id).first()).last_used_at,
    revision: (await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision};
}
async function read(app, {path = '/accounts', token = app.key.token, hooks = {}} = {}) {
  const db = countingDb(app.db, hooks), before = await state(app);
  const response = await worker.fetch(new Request(app.origin + '/api/v1' + path,
    {headers: {Authorization: 'Bearer ' + token}}), {DB: db, SITE_ORIGIN: app.origin});
  const json = await response.json(), after = await state(app);
  return {status: response.status, json, db, before, after, metrics: {...db.totals(),
    value_changed_rows: Number(before.used !== after.used)}};
}
async function fixedClock(operation) {
  const NativeDate = globalThis.Date, time = NativeDate.now();
  globalThis.Date = class extends NativeDate {
    constructor(...args) {super(...(args.length ? args : [time]));}static now() {return time;}
  };
  try {return await operation(time);} finally {globalThis.Date = NativeDate;}
}

test('usage throttle counts first, recent, exact boundary, overdue and future timestamps without an extra SELECT', async t => {
  const app = await setup(t), rows = [];
  await fixedClock(async time => {
    for (const [name, age, writes] of [['first', null, 1], ['recent', WINDOW - 1, 0],
      ['exact-five-minutes', WINDOW, 0], ['over-five-minutes', WINDOW + 1, 1], ['future', -1000, 0]]) {
      const initial = age === null ? null : new Date(time - age).toISOString();
      await stamp(app, initial);
      const result = await read(app);assert.equal(result.status, 200);
      rows.push({case: name, ...result.metrics, timestamp_matches_expected:
        result.after.used === (writes ? new Date(time).toISOString() : initial)});
      assert.equal(result.after.revision, result.before.revision, 'usage never advances business revision');
    }
  });
  await mkdir(new URL('../artifacts/perf/', import.meta.url), {recursive: true});
  const phase = process.env.C2_CAPTURE_PHASE === 'before' ? 'before' : 'after';
  await writeFile(new URL('../artifacts/perf/c2-' + phase + '.json', import.meta.url), JSON.stringify(rows, null, 2) + '\n');
  rows.forEach(row => t.diagnostic(JSON.stringify(row)));
  for (const row of rows) {
    const expected = ['first', 'over-five-minutes'].includes(row.case) ? 1 : 0;
    assert.equal(row.sql, expected ? 5 : 4, row.case + ': reuse authentication row without extra SELECT');
    assert.equal(row.timestamp_matches_expected, true);
    assert.equal(row.metadata_writes, expected, row.case + ': issued UPDATE includes zero-row updates');
    assert.equal(row.write_statements, expected);assert.equal(row.d1_rows_written, expected);
    assert.equal(row.value_changed_rows, expected);assert.equal(row.business_control_writes, 0);
  }
});

test('concurrent overdue readers may issue two UPDATEs but SQL guard changes only one row', async t => {
  const app = await setup(t);
  await fixedClock(async time => {
    await stamp(app, new Date(time - WINDOW - 1).toISOString());
    let arrived = 0, release;const both = new Promise(resolve => {release = resolve;});
    const hooks = {async after(sql) {
      if (/SELECT \* FROM matrix_api_keys WHERE token_hash/.test(sql)) {
        if (++arrived === 2) release();await both;
      }
    }};
    const results = await Promise.all([read(app, {hooks}), read(app, {hooks})]);
    assert.ok(results.every(result => result.status === 200));
    const totals = results.map(result => result.metrics);
    t.diagnostic(JSON.stringify(totals));
    assert.equal(totals.reduce((sum, row) => sum + row.metadata_writes, 0), 2);
    assert.equal(totals.reduce((sum, row) => sum + row.d1_rows_written, 0), 1);
    assert.equal(totals.reduce((sum, row) => sum + row.matched_changes, 0), 1);
    assert.ok(results.every(result => result.after.revision === result.before.revision));
    // Per-request before/after snapshots overlap; do not add their value-change counts.
    assert.equal((await state(app)).used, new Date(time).toISOString());
  });
});

test('failed or forbidden reads and invalid or revoked credentials never update usage', async t => {
  const app = await setup(t);
  for (const [name, options, status] of [
    ['forbidden', {path: '/auth/me'}, 403], ['not-found', {path: '/synthetic-no-route'}, 404],
    ['invalid', {token: 'synthetic-invalid-authorization'}, 401],
    ['read-error', {hooks: {after(sql) {if (accountsSql(sql)) throw new Error('Synthetic read failure');}}}, 500],
  ]) await t.test(name, async () => {
    await stamp(app, null);const result = await read(app, options);
    assert.equal(result.status, status);assert.equal(result.metrics.metadata_writes, 0);
    assert.equal(result.after.used, null);assert.equal(result.after.revision, result.before.revision);
  });
  assert.equal((await app.request('/api/v1/api-keys/' + app.key.id,
    {method: 'DELETE', session: app.session})).status, 200);
  const revoked = await read(app);assert.equal(revoked.status, 401);
  assert.equal(revoked.metrics.metadata_writes, 0);assert.equal(revoked.after.used, null);
});

test('revocation immediately before the metadata UPDATE retains zero-row SQL accounting', async t => {
  const app = await setup(t);let revoked = false;
  const result = await read(app, {hooks: {async before(sql) {
    if (usageSql(sql) && !revoked) {
      revoked = true;assert.equal((await app.request('/api/v1/api-keys/' + app.key.id,
        {method: 'DELETE', session: app.session})).status, 200);
    }
  }}});
  assert.equal(result.status, 200);assert.equal(revoked, true);
  assert.equal(result.metrics.metadata_writes, 1);assert.equal(result.metrics.d1_rows_written, 0);
  assert.equal(result.metrics.matched_changes, 0);assert.equal(result.after.used, null);
});

test('usage decision uses the successful consistent-read attempt actor, in both age directions', async t => {
  const app = await setup(t);
  await fixedClock(async time => {
    for (const [initialAge, finalAge, expected] of [[0, WINDOW + 1, 1], [WINDOW + 1, 0, 0]]) {
      await stamp(app, new Date(time - initialAge).toISOString());let changed = false;
      const result = await read(app, {hooks: {async after(sql) {
        if (changed || !accountsSql(sql)) return;changed = true;
        await stamp(app, new Date(time - finalAge).toISOString());
        assert.equal((await app.request('/api/v1/accounts', {method: 'POST', session: app.session,
          body: {platform: 'other', name: 'Synthetic usage retry'}})).status, 201);
      }}});
      assert.equal(result.status, 200);assert.equal(result.metrics.metadata_writes, expected);
      assert.equal(result.db.entries.filter(row => /SELECT \* FROM matrix_api_keys WHERE token_hash/.test(row.sql)).length, 2);
      assert.equal(result.metrics.control, 4);
    }
  });
});

test('a real D1 metadata update failure still returns the existing 500 response without a revision change', async t => {
  const app = await setup(t);
  await app.db.prepare("CREATE TRIGGER synthetic_c2_fail BEFORE UPDATE OF last_used_at ON matrix_api_keys BEGIN SELECT RAISE(ABORT, 'Synthetic usage metadata failure'); END").run();
  const result = await read(app);
  assert.equal(result.status, 500);
  assert.deepEqual(result.json, {error: {code: 'INTERNAL_ERROR', message: '服务暂时不可用'}});
  assert.equal(result.metrics.metadata_writes, 1);assert.equal(result.metrics.d1_rows_written, null);
  assert.equal(result.after.used, null);assert.equal(result.after.revision, result.before.revision);
});
