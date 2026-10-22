import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import worker from '../dist/server/index.js';
import {fixture, PASSWORD} from './harness.mjs';
import {digest} from '../shared/auth.mjs';
import {exportBackup, restoreIntoEmptyDatabase} from '../src/backup.mjs';
import {countingDb, writableValues, changedValues} from './counting-d1.mjs';

async function setup(t) {
  const app = await fixture(t);app.session = await app.login();
  app.account = (await app.request('/api/v1/accounts', {session: app.session})).data[0].id;
  const key = await app.request('/api/v1/api-keys', {session: app.session, method: 'POST',
    body: {name: 'Synthetic C1 reader', account_ids: [app.account], permissions: ['read']}});
  assert.equal(key.status, 201);app.key = key.data;return app;
}
async function read(app, path, {token, hooks = {}} = {}) {
  const db = countingDb(app.db, hooks);
  const before = await writableValues(app.db);
  const response = await worker.fetch(new Request(app.origin + '/api/v1' + path,
    {headers: token ? {Authorization: 'Bearer ' + token} : {Cookie: app.session?.cookie || ''}}),
    {DB: db, SITE_ORIGIN: app.origin});
  const json = await response.json();
  return {status: response.status, json, db, metrics: {...db.totals(),
    value_changed_rows: changedValues(before, await writableValues(app.db))}};
}
const authenticationQueries = result => result.db.entries.filter(row => /FROM matrix_(?:sessions|api_keys)\b/.test(row.sql)).length;
const dataQuery = sql => /FROM matrix_accounts\b/.test(sql);
const beforeRevision = sql => /^SELECT (?:initialized,\s*revision|revision) FROM matrix_control/.test(sql);
async function concurrentAccount(app, session = app.session) {
  const result = await app.request('/api/v1/accounts', {session, method: 'POST',
    body: {platform: 'other', name: 'Synthetic concurrent account'}});
  assert.equal(result.status, 201);return result.data;
}

test('C1 request counters separate control writes, metadata writes, matched rows and actual D1 receipts', async t => {
  const app = await setup(t), rows = [];
  const NativeDate = globalThis.Date, fixed = NativeDate.now();
  globalThis.Date = class extends NativeDate {
    constructor(...args) {super(...(args.length ? args : [fixed]));}static now() {return fixed;}
  };
  try {
    for (const path of ['/auth/me', '/accounts', '/articles', '/overview', '/backup']) {
      const result = await read(app, path);assert.equal(result.status, 200);
      rows.push({case: 'session ' + path, ...result.metrics});
    }
    for (const n of [1, 2]) {
      const result = await read(app, '/articles', {token: app.key.token});assert.equal(result.status, 200);
      rows.push({case: 'bearer articles ' + n, ...result.metrics});
    }
  } finally {globalThis.Date = NativeDate;}
  await mkdir(new URL('../artifacts/perf/', import.meta.url), {recursive: true});
  const phase = process.env.C1_CAPTURE_PHASE === 'before' ? 'before' : 'after';
  await writeFile(new URL('../artifacts/perf/c1-' + phase + '.json', import.meta.url), JSON.stringify(rows, null, 2) + '\n');
  for (const row of rows) t.diagnostic(JSON.stringify(row));
  for (const row of rows.filter(row => row.case.startsWith('session'))) {
    assert.equal(row.write_statements, 0, row.case + ': even a zero-row control write is forbidden');
    assert.equal(row.control, row.case.endsWith('/backup') ? 4 : 2, row.case + ': backup has its own nested consistency read');
    assert.equal(row.d1_rows_written, 0);
  }
  for (const row of rows.filter(row => row.case.startsWith('bearer'))) {
    assert.equal(row.business_control_writes, 0);
    assert.equal(row.metadata_writes, 1, 'C2 metadata update is deliberately unchanged');
    assert.equal(row.write_statements, 1);assert.equal(row.control, 2);
  }
});

test('counter calibration counts an UPDATE that matches and writes zero rows', async t => {
  const app = await setup(t), db = countingDb(app.db);
  await db.prepare('UPDATE matrix_api_keys SET last_used_at=? WHERE id=?').bind('2001-01-01T00:00:00Z', 'synthetic-missing').run();
  assert.equal(db.totals().write_statements, 1);assert.equal(db.totals().metadata_writes, 1);
  assert.equal(db.totals().matched_changes, 0);assert.equal(db.totals().d1_rows_written, 0);
  const unavailable = countingDb({prepare: () => ({run: async () => {throw new Error('Synthetic unknown receipt');}})});
  await assert.rejects(unavailable.prepare('UPDATE matrix_api_keys SET last_used_at=NULL').run());
  assert.equal(unavailable.totals().write_statements, 1);
  assert.equal(unavailable.totals().matched_changes, null);assert.equal(unavailable.totals().d1_rows_written, null);
});

test('missing control row, uninitialized and restore-isolated states return 503 without creating or updating control', async t => {
  for (const state of ['missing', 0, 2]) await t.test(String(state), async t => {
    const app = await fixture(t, {bootstrap: false});
    if (state !== 'missing') await app.db.prepare('INSERT INTO matrix_control(id,initialized) VALUES(1,?)').bind(state).run();
    const result = await read(app, '/accounts');
    assert.equal(result.status, 503);assert.equal(result.json.error.code, 'SETUP_REQUIRED');
    assert.equal(result.json.error.message, state === 2 ? '数据库恢复未完成，服务保持隔离' : '请先完成管理员初始化');
    assert.equal(result.metrics.write_statements, 0);
    assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_control').first()).n, state === 'missing' ? 0 : 1);
  });
});

test('revision zero is reused as the first before rather than treated as absent', async t => {
  const app = await setup(t);
  await app.db.prepare('UPDATE matrix_control SET revision=0 WHERE id=1').run();
  const result = await read(app, '/auth/me');
  assert.equal(result.status, 200);assert.equal(result.metrics.control, 2);assert.equal(result.metrics.write_statements, 0);
});

test('a write after the first before forces a fresh before and reauthentication on retry', async t => {
  const app = await setup(t);let fired = false, added;
  const result = await read(app, '/accounts', {hooks: {async after(sql) {
    if (!fired && beforeRevision(sql)) {fired = true;added = await concurrentAccount(app);}
  }}});
  assert.equal(result.status, 200);assert.ok(result.json.data.some(row => row.id === added.id));
  t.diagnostic('concurrent-write retry: control=' + result.metrics.control + '; auth=' + authenticationQueries(result));
  assert.equal(authenticationQueries(result), 2);assert.equal(result.metrics.control, 4);
});

test('retry reauthenticates a revoked key or an expired session instead of returning the first result', async t => {
  for (const kind of ['revoked', 'expired']) await t.test(kind, async t => {
    const app = await setup(t), writer = await app.login();let fired = false;
    const result = await read(app, '/accounts', {token: kind === 'revoked' ? app.key.token : undefined,
      hooks: {async after(sql) {
        if (fired || !dataQuery(sql)) return;fired = true;
        if (kind === 'revoked') {
          assert.equal((await app.request('/api/v1/api-keys/' + app.key.id,
            {method: 'DELETE', session: writer})).status, 200);
        } else {
          await concurrentAccount(app, writer);
          const token = decodeURIComponent(app.session.cookie.slice(app.session.cookie.indexOf('=') + 1));
          await app.db.prepare('UPDATE matrix_sessions SET expires_at=? WHERE token_hash=?')
            .bind('2000-01-01T00:00:00Z', digest(token)).run();
        }
      }}});
    t.diagnostic(kind + ' retry: control=' + result.metrics.control + '; auth=' + authenticationQueries(result));
    assert.equal(result.status, 401);assert.equal(result.json.error.code, 'UNAUTHORIZED');
    assert.equal(Object.hasOwn(result.json, 'data'), false);assert.equal(authenticationQueries(result), 2);
    assert.equal(result.metrics.write_statements, 0);
  });
});

test('a read exception after a concurrent write retries, but a stable exception preserves its failure', async t => {
  for (const changed of [true, false]) await t.test(String(changed), async t => {
    const app = await setup(t);let fired = false;
    const result = await read(app, '/accounts', {hooks: {async after(sql) {
      if (fired || !dataQuery(sql)) return;fired = true;
      if (changed) await concurrentAccount(app);
      throw new Error('Synthetic C1 read fault');
    }}});
    t.diagnostic('read-fault changed=' + changed + ': control=' + result.metrics.control + '; auth=' + authenticationQueries(result));
    assert.equal(result.status, changed ? 200 : 500);
    assert.equal(authenticationQueries(result), changed ? 2 : 1);
    if (!changed) assert.deepEqual(result.json, {error: {code: 'INTERNAL_ERROR', message: '服务暂时不可用'}});
  });
});

test('bootstrap still initializes an absent control row and restore keeps its empty-only/session safeguards', async t => {
  const source = await setup(t), backup = await exportBackup(source.db);
  const empty = await fixture(t, {bootstrap: false});
  await assert.rejects(restoreIntoEmptyDatabase(empty.db, backup), error => error.status === 403);
  await restoreIntoEmptyDatabase(empty.db, backup, {allowEmptyRestore: true});
  await assert.rejects(restoreIntoEmptyDatabase(empty.db, backup, {allowEmptyRestore: true}), error => error.status === 409);
  const oldCookie = await worker.fetch(new Request(empty.origin + '/api/v1/auth/me', {headers: {Cookie: source.session.cookie}}),
    {DB: empty.db, SITE_ORIGIN: empty.origin});
  assert.equal(oldCookie.status, 401);await oldCookie.text();
  assert.ok(await empty.login(), 'restored synthetic user must freshly authenticate');
  const fresh = await fixture(t, {bootstrap: false});
  const result = await fresh.request('/api/v1/bootstrap', {method: 'POST', token: fresh.bootstrapSecret,
    body: {username: 'synthetic-bootstrap-c1', password: PASSWORD}});
  assert.equal(result.status, 201);
  assert.equal((await fresh.db.prepare('SELECT initialized FROM matrix_control WHERE id=1').first()).initialized, 1);
});
