import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture} from './harness.mjs';
import {BENCHMARK, ROUTES, seedBenchmark, summarize} from './bench-fixture.mjs';
import {countingDb} from './counting-d1.mjs';

test('benchmark small shape preserves exact scale ratios, deterministic seed, real zero and missing fields', async t => {
  const app = await fixture(t);
  const accounts = (await app.db.prepare('SELECT id,platform FROM matrix_accounts').all()).results;
  const ids = ['toutiao', 'zhihu', 'wechat'].map(platform => accounts.find(row => row.platform === platform).id);
  async function fingerprint() {
    const hash = createHash('sha256');
    for (const table of ['articles', 'observations', 'daily_metrics'])
      hash.update(JSON.stringify((await app.db.prepare('SELECT * FROM matrix_' + table + ' ORDER BY id').all()).results));
    return hash.digest('hex');
  }
  const counts = await seedBenchmark(app.db, ids, {articles: 12});
  assert.deepEqual(counts, {articles: 12, observations: 48, daily_metrics: 120});
  assert.deepEqual(BENCHMARK, {seed: 104729, now: '2026-10-22T08:00:00.000Z', articles: 5000,
    snapshotsPerArticle: 4, dailyPerArticle: 10, warmupRounds: 2, measuredRounds: 10});
  const db = countingDb(app.db);
  await db.prepare('SELECT id FROM matrix_articles').all();
  assert.equal(db.totals().sql, 1);assert.equal(db.totals().write_statements, 0);
  assert.equal(typeof db.totals().d1_rows_read, 'number');assert.ok(db.totals().d1_rows_read > 0);
  assert.equal((await app.db.prepare('PRAGMA foreign_key_check').all()).results.length, 0);
  const observations = (await app.db.prepare('SELECT metrics_json FROM matrix_observations').all()).results.map(row => JSON.parse(row.metrics_json));
  assert.ok(observations.some(row => !Object.hasOwn(row, 'likes')));
  assert.ok(observations.some(row => row.likes === 0 && row.comments === 0));
  assert.ok(observations.some(row => row.approvals !== undefined && row.approvals !== row.likes));
  const first = await fingerprint();
  async function clearOwnedFixture() {
    for (const table of ['daily_metrics', 'observations', 'articles']) await app.db.prepare('DELETE FROM matrix_' + table).run();
  }
  await assert.rejects(seedBenchmark(app.db, ids, {articles: 12}), /fixture must be empty/);
  await clearOwnedFixture();await seedBenchmark(app.db, ids, {articles: 12});assert.equal(await fingerprint(), first);
  await clearOwnedFixture();await seedBenchmark(app.db, ids, {articles: 12, seed: BENCHMARK.seed + 1});
  assert.notEqual(await fingerprint(), first);
  await assert.rejects(seedBenchmark(app.db, ids, {articles: 0}));
});

test('benchmark statistics exclude first/warmup and failures, and keep all-failed results null', () => {
  const route = ROUTES[0], measured = value => ({route, phase: 'measured', success: true, duration_ms: value});
  const output = summarize([measured(10), measured(20), measured(30), measured(40),
    {route, phase: 'first', success: true, duration_ms: 9999},
    {route, phase: 'warmup', success: true, duration_ms: 9999},
    {route, phase: 'measured', success: false, duration_ms: null, failed_elapsed_ms: 9999},
    {route: ROUTES[1], phase: 'measured', success: false, duration_ms: null}]);
  assert.equal(output[route].successful, 4);assert.equal(output[route].failed, 1);
  assert.equal(output[route].median_ms, 25);assert.equal(output[route].q1_ms, 17.5);assert.equal(output[route].q3_ms, 32.5);
  assert.equal(output[ROUTES[1]].successful, 0);assert.equal(output[ROUTES[1]].median_ms, null);
  assert.equal(output[ROUTES[2]].median_ms, null);
});
