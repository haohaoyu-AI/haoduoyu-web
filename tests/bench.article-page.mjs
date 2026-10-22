// Manual C6 benchmark; excluded from the *.test.mjs CI glob. Run after building:
// node scripts/build.mjs && node --expose-gc tests/bench.article-page.mjs
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {arch, cpus, platform, release} from 'node:os';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import candidate from '../dist/server/index.js';
import {BENCHMARK, seedBenchmark, summarize} from './bench-fixture.mjs';
import {changedValues, countingDb, writableValues} from './counting-d1.mjs';
import {fixture, PASSWORD} from './harness.mjs';
import {referenceWorker} from './overview-cache-reference.mjs';

const BASELINE = '0c5238d79551a807b35c0889ff69763bd04ae63e';
const ROUTES = ['/api/v1/articles?page=1', '/api/v1/articles?sort=reads'];
const VARIANTS = ['baseline', 'candidate'];
assert.equal(typeof globalThis.gc, 'function', 'Run node --expose-gc tests/bench.article-page.mjs');
assert.deepEqual([BENCHMARK.articles, BENCHMARK.snapshotsPerArticle, BENCHMARK.dailyPerArticle,
  BENCHMARK.warmupRounds, BENCHMARK.measuredRounds], [5000, 4, 10, 2, 10]);
const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../artifacts/perf/article-page-paired.json', import.meta.url);
const temporaryOutput = new URL('./article-page-paired.json.tmp', output);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const expectedSamples = ROUTES.length * VARIANTS.length * (1 + BENCHMARK.warmupRounds + BENCHMARK.measuredRounds);
const report = {
  schema: 1, benchmark: 'article-page-paired', baseline_commit: BASELINE,
  source_commit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
  candidate_bundle_sha256: sha256(await readFile(new URL('../dist/server/index.js', import.meta.url))),
  source_files: Object.fromEntries(await Promise.all([
    'src/worker.mjs', 'src/storage.mjs', 'src/records.mjs', 'src/analytics.mjs',
    'tests/bench.article-page.mjs', 'tests/bench-fixture.mjs', 'tests/counting-d1.mjs',
  ].map(async file => [file, sha256(await readFile(new URL('../' + file, import.meta.url)))]))),
  complete: false, valid: false, synthetic: true, config: BENCHMARK,
  routes: ROUTES, optimized_route: ROUTES[0], unchanged_control_route: ROUTES[1],
  expected_samples: expectedSamples, expected_pairs: expectedSamples / 2,
  auth: 'real local administrator Cookie session; full scope; credentials and Cookie never recorded',
  isolation: 'one ephemeral local Miniflare D1 database, seeded once and shared by both workers; localhost only; fixture disables workerd outbound requests; no production bindings or endpoints',
  runtime: {
    node: process.version,
    miniflare: JSON.parse(await readFile(new URL('../node_modules/miniflare/package.json', import.meta.url))).version,
    os: platform(), release: release(), arch: arch(), cpu_model: cpus()[0]?.model,
    logical_cpus: cpus().length,
    compatibility: JSON.parse(await readFile(new URL('../runtime.json', import.meta.url))),
    gc_before_each_sample: true,
  },
  timing: 'performance.now immediately before Worker.fetch through complete response.arrayBuffer consumption; includes authentication, counting wrapper and local D1 bridge; excludes setup, GC, request construction, hash and JSON validation',
  first_scope: 'first request to each route for each worker in the shared Node process after fixture setup; not a cold process or cold database measurement',
  ordering: 'variant order alternates per route across all 13 rounds; route order also alternates; each pair shares DB, Cookie, route and fixed clock',
  memory_scope: 'shared Node process only, not workerd or a Cloudflare isolate; includes fetch/body/hash/JSON validation; the first response buffer remains live during the second paired request; 25ms samples and bookends can miss synchronous spikes; maxRSS is process lifetime, not per-request allocation',
  cpu_scope: 'shared Node user/system during request and post-timing validation; excludes workerd CPU',
  retention: 'all first, warmup, measured, failed and slow samples retained; no timeout, retry, trimming or outlier removal; measured summaries include successful samples only and explicitly count failures',
  samples: [], pairs: [],
};
function summaries() {
  return Object.fromEntries(VARIANTS.map(variant => {
    const values = summarize(report.samples.filter(row => row.variant === variant));
    return [variant, Object.fromEntries(ROUTES.map(route => [route, values[route]]))];
  }));
}
async function save() {
  await writeFile(temporaryOutput, JSON.stringify({...report, summary: summaries()}, null, 2) + '\n');
  await rename(temporaryOutput, output);
}
async function atFixedTime(operation) {
  const NativeDate = globalThis.Date, time = NativeDate.parse(BENCHMARK.now);
  globalThis.Date = class extends NativeDate {
    constructor(...args) {super(...(args.length ? args : [time]));}
    static now() {return time;}
  };
  try {return await operation();} finally {globalThis.Date = NativeDate;}
}

// Expected identities and metric values come from the synthetic fixture, outside
// the timed interval. Pair equality additionally covers every serialized field.
const fixtureRows = Array.from({length: BENCHMARK.articles}, (_, i) => ({
  id: 'bench-article-' + i, i, age: 12 + i % 30, reads: (i * 31 + BENCHMARK.seed) % 997 + 303,
}));
const expectedRows = new Map(ROUTES.map(route => {
  const rows = [...fixtureRows].sort((a, b) =>
    (route === ROUTES[1] ? b.reads - a.reads : 0) || a.age - b.age || a.id.localeCompare(b.id));
  return [route, route === ROUTES[0] ? rows.slice(0, 20) : rows];
}));
function validateBody(route, body) {
  const paged = route === ROUTES[0], expected = expectedRows.get(route);
  assert.deepEqual(Object.keys(body).sort(), ['data', 'meta']);
  assert.deepEqual(body.meta, {total: BENCHMARK.articles, unfiltered_total: BENCHMARK.articles,
    page: 1, page_size: paged ? 20 : null, offset: 0, has_more: paged, pagination: paged ? 'offset' : 'legacy'});
  assert.equal(body.data.length, expected.length);
  for (const [index, row] of body.data.entries()) {
    const value = expected[index];
    assert.equal(row.id, value.id);
    assert.equal(row.duration_seconds, 600);
    assert.equal(row.snapshot_status, 'collected');
    assert.equal(row.date_status, value.i % 23 === 0 ? 'unverified' : 'recorded');
    assert.deepEqual(row.latest_metrics, {reads: value.reads, ...(value.i % 19 ? {likes: 3} : {}),
      comments: 0, ...(value.i % 3 === 1 ? {approvals: 6} : {})});
  }
}

const cleanups = [], lifecycle = {after: action => cleanups.push(action)};
let app, stage = 'reference-build';
await mkdir(new URL('../artifacts/perf/', import.meta.url), {recursive: true});
await save();
try {
  const baseline = await referenceWorker(lifecycle, BASELINE);
  const workers = {baseline, candidate};
  stage = 'fixture-setup';
  app = await fixture(undefined, {bootstrap: false});
  let cookie;
  async function localSetup(path, body, token) {
    const response = await atFixedTime(() => candidate.fetch(new Request(app.origin + '/api/v1' + path,
      {method: 'POST', headers: {'Content-Type': 'application/json', Origin: app.origin,
        ...(token ? {Authorization: 'Bearer ' + token} : {})}, body: JSON.stringify(body)}),
      {DB: app.db, SITE_ORIGIN: app.origin, MATRIX_BOOTSTRAP_SECRET: app.bootstrapSecret}));
    assert.equal(response.status, path === '/bootstrap' ? 201 : 200, 'synthetic setup failed');
    await response.arrayBuffer();
    if (path === '/auth/login') {
      cookie = response.headers.get('Set-Cookie')?.split(';')[0];
      assert.ok(cookie, 'real local Cookie required');
    }
  }
  await localSetup('/bootstrap', {username: 'synthetic-benchmark-admin', password: PASSWORD}, app.bootstrapSecret);
  await localSetup('/auth/login', {username: 'synthetic-benchmark-admin', password: PASSWORD});
  const storedAccounts = (await app.db.prepare('SELECT id,platform FROM matrix_accounts').all()).results;
  const accounts = ['toutiao', 'zhihu', 'wechat'].map(name => storedAccounts.find(row => row.platform === name));
  assert.ok(accounts.every(Boolean));
  for (const [index, account] of accounts.entries())
    await app.db.prepare('UPDATE matrix_accounts SET name=? WHERE id=?')
      .bind('Synthetic benchmark account ' + (index + 1), account.id).run();
  stage = 'fixture-seed';
  console.log('Seeding one shared synthetic fixture: 5000 articles / 20000 snapshots / 50000 daily rows');
  const seedStart = performance.now();
  report.counts = await seedBenchmark(app.db, accounts.map(row => row.id), {
    progress: (table, count) => console.log('Loaded synthetic ' + table + ': ' + count),
  });
  report.seed_ms = performance.now() - seedStart;
  report.revision_before = (await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision;
  const writableBefore = await writableValues(app.db), expectedBodies = new Map();
  await save();
  stage = 'samples';
  async function sample(route, phase, round, pairId, variant) {
    globalThis.gc();
    const db = countingDb(app.db);
    const request = new Request(app.origin + route, {headers: {Cookie: cookie}});
    const row = {sequence: report.samples.length + 1, pair_id: pairId, variant, route,
      params: Object.fromEntries(new URL(route, app.origin).searchParams), phase, round,
      success: false, status: null, body_bytes: null, body_sha256: null, duration_ms: null, failure_codes: []};
    const before = process.memoryUsage(), peak = {...before};
    const poll = () => {for (const [key, value] of Object.entries(process.memoryUsage())) peak[key] = Math.max(peak[key], value);};
    const timer = setInterval(poll, 25), cpuBefore = process.cpuUsage();
    let response, payload, validationStage = 'request';
    try {
      await atFixedTime(async () => {
        const started = performance.now();
        try {
          response = await workers[variant].fetch(request, {DB: db, SITE_ORIGIN: app.origin});
          row.status = response.status;
          validationStage = 'response-body';
          payload = Buffer.from(await response.arrayBuffer());
        } finally {row.duration_ms = performance.now() - started;}
      });
      poll();
      row.body_bytes = payload.length;
      row.body_sha256 = sha256(payload);
      validationStage = 'http-status';
      assert.equal(response.status, 200);
      validationStage = 'response-shape-and-fixture';
      validateBody(route, JSON.parse(payload.toString('utf8')));
      validationStage = 'deterministic-body';
      const expected = expectedBodies.get(route);
      if (expected) {
        assert.equal(row.body_bytes, expected.bytes);
        assert.equal(row.body_sha256, expected.hash);
      } else expectedBodies.set(route, {bytes: row.body_bytes, hash: row.body_sha256});
    } catch {
      // Never serialize raw exceptions, Cookie values, bindings or response bodies.
      row.failure_codes.push(validationStage);
    } finally {
      row.d1 = db.totals();
      if (row.d1.write_statements !== 0 || row.d1.d1_rows_written !== 0 || row.d1.matched_changes !== 0)
        row.failure_codes.push('unexpected-d1-write-or-missing-write-receipt');
      if (!Number.isFinite(row.d1.d1_rows_read) || row.d1.sql === 0)
        row.failure_codes.push('missing-d1-read-receipt');
      clearInterval(timer);poll();
      row.cpu_us = process.cpuUsage(cpuBefore);
      row.memory = {before, after: process.memoryUsage(), sampled_peak: peak,
        lifetime_max_rss_bytes: process.resourceUsage().maxRSS * 1024};
    }
    row.success = row.failure_codes.length === 0;
    report.samples.push(row);
    await save();
    console.log(JSON.stringify({variant, phase, round, route, status: row.status, success: row.success,
      ms: row.duration_ms, bytes: row.body_bytes, d1: row.d1, failure_codes: row.failure_codes}));
    return {row, payload};
  }
  async function pair(route, phase, round, ordinal) {
    const pairId = phase + ':' + round + ':' + route;
    const order = ordinal % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'];
    const results = {};
    for (const variant of order) results[variant] = await sample(route, phase, round, pairId, variant);
    const left = results.baseline, right = results.candidate;
    const bytesEqual = left.payload !== undefined && right.payload !== undefined && left.payload.equals(right.payload);
    const hashEqual = left.row.body_sha256 !== null && left.row.body_sha256 === right.row.body_sha256;
    const lengthEqual = left.row.body_bytes !== null && left.row.body_bytes === right.row.body_bytes;
    const valid = left.row.success && right.row.success && bytesEqual && hashEqual && lengthEqual;
    if (!bytesEqual || !hashEqual || !lengthEqual) for (const {row} of [left, right]) {
      row.success = false;row.failure_codes.push('paired-response-mismatch-or-unavailable');
    }
    report.pairs.push({pair_id: pairId, route, phase, round, order,
      sample_sequences: order.map(variant => results[variant].row.sequence),
      status_equal: left.row.status === right.row.status, body_bytes_equal: lengthEqual,
      body_sha256_equal: hashEqual, body_buffer_equal: bytesEqual, success: valid});
    await save();
    // Writes would invalidate the shared fixture; retain both samples and stop.
    if ([left, right].some(({row}) => row.d1.write_statements > 0 || row.d1.d1_rows_written > 0))
      throw new Error('Unexpected write invalidated shared benchmark fixture');
  }
  const rounds = [{phase: 'first', round: 0},
    ...Array.from({length: BENCHMARK.warmupRounds}, (_, i) => ({phase: 'warmup', round: i + 1})),
    ...Array.from({length: BENCHMARK.measuredRounds}, (_, i) => ({phase: 'measured', round: i + 1}))];
  for (const [ordinal, {phase, round}] of rounds.entries())
    for (let index = 0; index < ROUTES.length; index++)
      await pair(ROUTES[(index + ordinal) % ROUTES.length], phase, round, ordinal);
  stage = 'bookend-validation';
  report.revision_after = (await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision;
  report.writable_values_changed = changedValues(writableBefore, await writableValues(app.db));
  assert.equal(report.revision_after, report.revision_before);
  assert.equal(report.writable_values_changed, 0);
  assert.equal(report.samples.length, expectedSamples);
  assert.equal(report.pairs.length, expectedSamples / 2);
  report.complete = true;
  report.valid = report.samples.every(row => row.success) && report.pairs.every(row => row.success);
} catch {
  report.fatal_failure = {stage, detail: 'Benchmark could not complete; raw exceptions and secrets are not recorded'};
} finally {
  const actions = [...(app ? [() => app.mf.dispose()] : []), ...cleanups.reverse()];
  for (const cleanup of actions) {
    try {await cleanup();} catch {report.cleanup_failed = true;report.valid = false;}
  }
  await save();
}
console.log(JSON.stringify({output: fileURLToPath(output), complete: report.complete, valid: report.valid,
  samples: report.samples.length, pairs: report.pairs.length, summary: summaries()}));
if (!report.complete || !report.valid) process.exitCode = 1;
