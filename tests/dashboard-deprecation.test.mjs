import {traceHeaders, traceText, traceDocument} from './request-trace-projection.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile, writeFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {build} from 'esbuild';
import current from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {dashboardHeaders, dashboardSpec, DEPRECATION_HEADER} from './dashboard-deprecation-projection.mjs';

const BASE = '307d54f84a7e817955aa5b5f2fb173f4c545cd23';
const root = new URL('../', import.meta.url);
const old = file => execFileSync('git', ['show', BASE + ':' + file], {cwd: root, encoding: 'utf8'});
const originalLine = "if(route==='/dashboard') return json(await records.dashboard(query.account_id||null,actor.scope));";
const deprecatedLine = "if(route==='/dashboard') return json(await records.dashboard(query.account_id||null,actor.scope),200,{Deprecation:'true'});";
async function previousWorker(t) {
  const directory = await mkdtemp(join(tmpdir(), 'synthetic-dashboard-reference-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', BASE, 'src', 'shared'], {cwd: root, encoding: 'utf8'}).trim().split('\n');
  for (const file of files) {const path = join(directory, file);await mkdir(join(path, '..'), {recursive: true});await writeFile(path, old(file));}
  // Static-document changes are tested independently below. Business comparisons
  // use exactly the same generated resource bytes and original baseline backend.
  await writeFile(join(directory, 'src/assets.generated.mjs'), await readFile(new URL('../src/assets.generated.mjs', import.meta.url)));
  await build({entryPoints: [join(directory, 'src/worker.mjs')], outfile: join(directory, 'worker.mjs'),
    bundle: true, format: 'esm', platform: 'neutral', external: ['node:*'], target: 'es2022'});
  return (await import(pathToFileURL(join(directory, 'worker.mjs')).href)).default;
}
async function setup(t) {
  const app = await fixture(t);app.session = await app.login();
  app.accounts = (await app.request('/api/v1/accounts', {session: app.session})).data;
  const key = await app.request('/api/v1/api-keys', {method: 'POST', session: app.session,
    body: {name: 'Synthetic dashboard reader', account_ids: [app.accounts[0].id], permissions: ['read']}});
  assert.equal(key.status, 201);app.key = key.data;
  const NativeDate = globalThis.Date, fixed = NativeDate.now();
  globalThis.Date = class extends NativeDate {
    constructor(...args) {super(...(args.length ? args : [fixed]));}
    static now() {return fixed;}
  };
  t.after(() => {globalThis.Date = NativeDate;});
  await app.db.prepare('UPDATE matrix_api_keys SET last_used_at=? WHERE id=?').bind(new Date().toISOString(), app.key.id).run();
  return app;
}
async function read(worker, app, path, headers = {}, {db = app.db, method = 'GET'} = {}) {
  const response = await worker.fetch(new Request(app.origin + path, {headers, method}), {DB: db, SITE_ORIGIN: app.origin});
  return {status: response.status, headers: response.headers, body: await response.text()};
}
function contract(path, result) {
  return {status: result.status, body: traceText(result.body, result.status, result.headers), headers: dashboardHeaders(path, result.status, traceHeaders(result.headers))};
}
test('dashboard deprecation changes only the two OpenAPI additions and one success expression', async () => {
  const spec = JSON.parse(await readFile(new URL('../public/openapi.json', import.meta.url), 'utf8'));
  const projected = traceDocument(spec), operation = projected.paths['/api/v1/dashboard'].get;
  assert.equal(spec.info.version, '1.1.0');assert.equal(operation.deprecated, true);
  assert.deepEqual(operation.responses['200'].headers, {Deprecation: DEPRECATION_HEADER});
  assert.deepEqual(dashboardSpec(projected), JSON.parse(old('public/openapi.json')));
  const source = await readFile(new URL('../src/worker.mjs', import.meta.url), 'utf8');
  assert.ok(old('src/worker.mjs').includes(originalLine));
  // Preserve D4's original whole-file proof at its approved checkpoint; E2 now
  // adds only its separately tested wrapper. The current dashboard expression stays exact.
  const approved = execFileSync('git', ['show', '060b2af771348779aff41a99da0a8deb1fcbb4f4:src/worker.mjs'], {cwd: root, encoding: 'utf8'});
  assert.equal(approved, old('src/worker.mjs').replace(originalLine, deprecatedLine));
  assert.equal(source.split(deprecatedLine).length, 2);
});
test('dashboard success adds exactly Deprecation true while preserving complete bodies and other headers', async t => {
  const baseline = await previousWorker(t), app = await setup(t);
  const admin = {Cookie: app.session.cookie}, bearer = {Authorization: 'Bearer ' + app.key.token};
  let pairs = 0;
  for (const phase of ['empty', 'populated']) {
    if (phase === 'populated') {
      const article = await app.request('/api/v1/articles', {method: 'POST', session: app.session,
        body: {account_id: app.accounts[0].id, title: '虚构弃用兼容样本', url: 'https://example.invalid/dashboard-deprecation', published_at: '2001-01-01T00:00:00Z'}});
      assert.equal(article.status, 201);
      assert.equal((await app.request('/api/v1/observations', {method: 'POST', session: app.session,
        body: {article_id: article.data.id, kind: 'latest', as_of: '2001-01-02T00:00:00Z', metrics: {reads: 0, likes: 1, approvals: 2}, source: 'synthetic'}})).status, 201);
    }
    for (const headers of [admin, bearer]) for (const query of ['', '?account_id=' + app.accounts[0].id]) {
      const path = '/api/v1/dashboard' + query, before = await read(baseline, app, path, headers), after = await read(current, app, path, headers);
      assert.equal(before.status, 200);assert.equal(before.headers.has('Deprecation'), false);
      assert.equal(after.headers.get('Deprecation'), 'true');assert.equal(after.headers.has('Sunset'), false);
      assert.ok(isDeepStrictEqual(contract(path, after), contract(path, before)), phase + ' exact dashboard contract');pairs++;
    }
  }
  t.diagnostic(pairs + ' exact success comparisons; empty/populated, administrator/scoped bearer, whole/account filter');
});
test('dashboard failures and every sampled other route keep their original bodies statuses and complete headers', async t => {
  const baseline = await previousWorker(t), app = await setup(t), admin = {Cookie: app.session.cookie};
  const bearer = {Authorization: 'Bearer ' + app.key.token};
  const failing = {prepare(sql) {if (/FROM matrix_accounts\b/.test(sql)) throw new Error('Synthetic dashboard calculation failure');return app.db.prepare(sql);}};
  const metadataFailure = {prepare(sql) {if (/^UPDATE matrix_api_keys SET last_used_at/.test(sql)) throw new Error('Synthetic usage metadata failure');return app.db.prepare(sql);}};
  await app.db.prepare('UPDATE matrix_api_keys SET last_used_at=NULL WHERE id=?').bind(app.key.id).run();
  const cases = [
    ['/api/v1/dashboard', {}, {}, 401],
    ['/api/v1/dashboard?account_id=' + app.accounts[1].id, bearer, {}, 403],
    ['/api/v1/dashboard?account_id=synthetic-missing', admin, {}, 404],
    ['/api/v1/dashboard', admin, {db: failing}, 500],
    ['/api/v1/dashboard', bearer, {db: metadataFailure}, 500],
    ['/api/v1/dashboard', admin, {method: 'HEAD'}, 404],
    ...['/health', '/api/v1/auth/me', '/api/v1/accounts', '/api/v1/articles', '/api/v1/observations',
      '/api/v1/daily-metrics', '/api/v1/overview', '/api/v1/due-reviews', '/app.js'].map(path => [path, admin, {}, 200]),
    ['/api/v1/articles?page=bad', admin, {}, 400], ['/api/v1/unknown-synthetic', admin, {}, 404],
  ];
  for (const [path, headers, options, expected] of cases) {
    const before = await read(baseline, app, path, headers, options), after = await read(current, app, path, headers, options);
    assert.equal(before.status, expected, path);assert.equal(after.headers.has('Deprecation'), false, path);
    assert.ok(isDeepStrictEqual({status: after.status, headers: [...traceHeaders(after.headers)], body: traceText(after.body, after.status, after.headers)},
      {status: before.status, headers: [...traceHeaders(before.headers)], body: traceText(before.body, before.status, before.headers)}), path + ' exact unchanged response');
  }
  // The projection itself must reject an expanded scope or incorrect marker.
  for (const [path, status, value] of [['/api/v1/accounts', 200, 'true'], ['/api/v1/dashboard', 401, 'true'], ['/api/v1/dashboard', 200, 'false']]) {
    assert.throws(() => dashboardHeaders(path, status, new Headers({Deprecation: value})));
  }
  t.diagnostic(cases.length + ' exact error/other-route comparisons; no header or body projection');
});
