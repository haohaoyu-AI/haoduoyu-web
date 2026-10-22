// Manual benchmark: not part of the *.test.mjs CI glob. No product changes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {cpus, platform, release, arch} from 'node:os';
import {referenceWorker, CACHE_BASELINE} from './overview-cache-reference.mjs';
import {cacheWorker} from './overview-cache-worker.mjs';
const cleanups = [], lifecycle = {after: action => cleanups.push(action)};
const baseline = await referenceWorker(lifecycle), candidate = await cacheWorker(lifecycle);
const worker = candidate.default;
import {fixture, PASSWORD} from './harness.mjs';
import {BENCHMARK, ROUTES, seedBenchmark, summarize} from './bench-fixture.mjs';
import {countingDb} from './counting-d1.mjs';

assert.equal(typeof globalThis.gc, 'function', 'Run node --expose-gc tests/bench.overview.mjs');
const output = new URL('../artifacts/perf/overview-cache-paired.json', import.meta.url);
const report = {schema: 2, baseline_commit: CACHE_BASELINE, complete: false, synthetic: true, source_commit:
  execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
  candidate_bundle_sha256: candidate.testBundleSha256,
  source_files: Object.fromEntries(await Promise.all(['src/worker.mjs','src/storage.mjs','src/records.mjs','src/overview-cache.mjs','src/overview-cache-time.mjs'].map(async file =>
    [file,createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex')]))),
  config: BENCHMARK, auth: 'real local administrator Cookie session; full scope; secrets never recorded',
  runtime: {node: process.version, miniflare: JSON.parse(await readFile(new URL('../node_modules/miniflare/package.json', import.meta.url))).version,
    os: platform(), release: release(), arch: arch(), cpu_model: cpus()[0]?.model, logical_cpus: cpus().length,
    compatibility: JSON.parse(await readFile(new URL('../runtime.json', import.meta.url))), gc_before_each_sample: true},
  timing: 'performance.now before Worker.fetch through full response arrayBuffer; excludes setup, GC, SHA256 and JSON validation; includes counting wrapper and D1 bridge',
  memory_scope: 'Node only, not workerd/Cloudflare isolate; includes fetch/body/hash/JSON validation; 25ms samples and bookends can miss synchronous spikes; maxRSS is process lifetime',
  cpu_scope: 'Node user/system includes request and post-timing hash/JSON validation; excludes workerd CPU',
  samples: []};
await mkdir(new URL('../artifacts/perf/', import.meta.url), {recursive: true});
const save = () => writeFile(output, JSON.stringify({...report, summary: Object.fromEntries(['baseline', 'candidate'].map(name => [name, summarize(report.samples.filter(row => row.variant === name))]))}, null, 2) + '\n');
async function atFixedTime(operation) {
  const NativeDate = globalThis.Date, time = Date.parse(BENCHMARK.now);
  globalThis.Date = class extends NativeDate {
    constructor(...args) {super(...(args.length ? args : [time]));}static now() {return time;}
  };
  try {return await operation();} finally {globalThis.Date = NativeDate;}
}
const app = await fixture(undefined, {bootstrap: false});
let cookie;
try {
  async function localSetup(path, body, token) {
    const response = await atFixedTime(() => worker.fetch(new Request(app.origin + '/api/v1' + path,
      {method: 'POST', headers: {'Content-Type': 'application/json', Origin: app.origin,
        ...(token ? {Authorization: 'Bearer ' + token} : {})}, body: JSON.stringify(body)}),
      {DB: app.db, SITE_ORIGIN: app.origin, MATRIX_BOOTSTRAP_SECRET: app.bootstrapSecret}));
    assert.equal(response.status, path === '/bootstrap' ? 201 : 200, 'synthetic setup failed');
    const data = (await response.json()).data;
    if (path === '/auth/login') cookie = response.headers.get('Set-Cookie').split(';')[0];
    return data;
  }
  await localSetup('/bootstrap', {username: 'synthetic-benchmark-admin', password: PASSWORD}, app.bootstrapSecret);
  await localSetup('/auth/login', {username: 'synthetic-benchmark-admin', password: PASSWORD});
  const storedAccounts = (await app.db.prepare('SELECT id,platform FROM matrix_accounts').all()).results;
  const accounts = ['toutiao', 'zhihu', 'wechat'].map(platform => storedAccounts.find(row => row.platform === platform));
  assert.ok(accounts.every(Boolean));
  for (const [i, account] of accounts.entries())
    await app.db.prepare('UPDATE matrix_accounts SET name=? WHERE id=?').bind('Synthetic benchmark account ' + (i + 1), account.id).run();
  const seedStart = performance.now();
  report.counts = await seedBenchmark(app.db, accounts.map(row => row.id),
    {progress: (table, count) => console.log('Loaded synthetic ' + table + ': ' + count)});
  report.seed_ms = performance.now() - seedStart;
  report.revision_before = (await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision;
  await save();
  const expectedHashes = new Map();
  const bindings = {baseline: countingDb(app.db), candidate: countingDb(app.db)};
  const workers = {baseline, candidate: worker};
  candidate.overviewCache.clear();
  async function sample(route, phase, round, variant) {
    globalThis.gc();
    const db = bindings[variant];db.entries.length = 0;
    const cacheBefore = candidate.overviewCache.stats();
    const before = process.memoryUsage(), peak = {...before};
    const poll = () => {for (const [key, value] of Object.entries(process.memoryUsage())) peak[key] = Math.max(peak[key], value);};
    const timer = setInterval(poll, 25), cpuBefore = process.cpuUsage(), started = performance.now();
    let response, payload, elapsed;
    const row = {variant, route, params: Object.fromEntries(new URL(route, app.origin).searchParams), phase, round, success: false};
    try {
      await atFixedTime(async () => {
        response = await workers[variant].fetch(new Request(app.origin + route, {headers: {Cookie: cookie}}),
          {DB: db, SITE_ORIGIN: app.origin});
        payload = Buffer.from(await response.arrayBuffer());
      });
      elapsed = performance.now() - started;poll();
      row.status = response.status;row.body_bytes = payload.length;
      row.duration_ms = response.status === 200 ? elapsed : null;
      row.failed_elapsed_ms = response.status === 200 ? null : elapsed;
      row.body_sha256 = createHash('sha256').update(payload).digest('hex');
      if (response.status !== 200) throw new Error('Synthetic request returned failure');
      const body = JSON.parse(payload.toString('utf8'));
      if (route === '/api/v1/overview') assert.equal(body.data.cumulative.article_count, BENCHMARK.articles);
      else {
        assert.equal(body.meta.total, BENCHMARK.articles);
        assert.equal(body.data.length, route.includes('page=1') ? 20 : BENCHMARK.articles);
      }
      if (expectedHashes.has(route)) assert.equal(row.body_sha256, expectedHashes.get(route), 'fixed-time response changed');
      else expectedHashes.set(route, row.body_sha256);
      assert.equal(db.totals().write_statements, 0, 'administrator read unexpectedly wrote D1');
      row.success = true;
    } catch {
      row.status ??= response?.status ?? null;row.body_bytes ??= payload?.length ?? null;
      row.failed_elapsed_ms = elapsed ?? performance.now() - started;row.duration_ms = null;
      row.failure = 'request, response-shape or deterministic-body validation failed; raw details intentionally not recorded';
    } finally {
      clearInterval(timer);poll();
      row.cache = {before: cacheBefore, after: candidate.overviewCache.stats()};
      row.d1 = db.totals();row.cpu_us = process.cpuUsage(cpuBefore);
      row.memory = {before, after: process.memoryUsage(), sampled_peak: peak, lifetime_max_rss_bytes: process.resourceUsage().maxRSS * 1024};
    }
    report.samples.push(row);await save();
    console.log(JSON.stringify({variant, phase, round, route, status: row.status, success: row.success,
      ms: row.duration_ms, bytes: row.body_bytes, d1: row.d1}));
    if (!row.success) throw new Error('Benchmark stopped on failed sample; sanitized partial report saved');
  }
  async function pair(route, phase, round) {
    // Alternate ordering after the initial baseline-first pair; same DB/clock/input.
    for (const variant of round % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'])
      await sample(route, phase, round, variant);
  }
  for (const route of ROUTES) await pair(route, 'first', 0);
  for (const [phase, rounds] of [['warmup', BENCHMARK.warmupRounds], ['measured', BENCHMARK.measuredRounds]])
    for (let round = 0; round < rounds; round++)
      for (let index = 0; index < ROUTES.length; index++) await pair(ROUTES[(index + round) % ROUTES.length], phase, round + 1);
  report.revision_after = (await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision;
  assert.equal(report.revision_after, report.revision_before);
  report.complete = true;await save();console.log(JSON.stringify({summary: Object.fromEntries(['baseline', 'candidate'].map(name => [name, summarize(report.samples.filter(row => row.variant === name))]))}));
} finally {await app.mf.dispose();for (const cleanup of cleanups.reverse()) await cleanup();}
