import {traceJSON, traceDocument} from './request-trace-projection.mjs';
import {legacyPublishedArticles,articlePipelineSpec,articlePipelineDocs} from './article-pipeline-projection.mjs';
import {dashboardHeaders, dashboardSpec} from './dashboard-deprecation-projection.mjs';
import {stylePolicyHeaders} from './style-policy-projection.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {isDeepStrictEqual} from 'node:util';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import current from '../dist/server/index.js';
import {fixture, USERNAME, PASSWORD} from './harness.mjs';
import {legacyBackupEnvelope} from './todo-backup-projection.mjs';
import {csrfFor} from '../shared/auth.mjs';
import {createHash} from 'node:crypto';

const BASELINE = 'bbc9c5bda6f8d0e860274daadb1d08a68553a03a';
const root = fileURLToPath(new URL('../', import.meta.url));

async function legacyWorker(t) {
  const directory = await mkdtemp(join(tmpdir(), 'haoduoyu-legacy-contract-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const archive = execFileSync('git', ['archive', '--format=tar', BASELINE], {cwd: root, maxBuffer: 10 * 1024 * 1024});
  execFileSync('tar', ['-x', '-C', directory], {input: archive});
  // C3 intentionally changes today's build. Pin historical execution to the
  // already reviewed pre-C3 build, rather than silently running new build code.
  const approvedBuild = execFileSync('git', ['show',
    'd4f0dad1f92af8a86d184cf544d4593f2942afa9:scripts/build.mjs'], {cwd: root});
  assert.deepEqual(await readFile(join(directory, 'scripts/build.mjs')), approvedBuild);
  assert.deepEqual(await readFile(join(directory, 'package-lock.json')),
    await readFile(join(root, 'package-lock.json')));
  await symlink(join(root, 'node_modules'), join(directory, 'node_modules'), 'dir');
  execFileSync(process.execPath, [join(directory, 'scripts/build.mjs')], {cwd: directory, maxBuffer: 1024 * 1024});
  return (await import(pathToFileURL(join(directory, 'dist/server/index.js')).href)).default;
}
function project(path, json) {
  if (path === '/api/v1/backup') return legacyBackupEnvelope(json);
  const value = path === '/openapi.json' ? dashboardSpec(traceDocument(articlePipelineSpec(json))) : legacyPublishedArticles(json);
  if (path === '/api/v1/auth/me' && value.data) delete value.data.id;
  if (path === '/api/v1/audit' && value.data) {
    value.data = value.data.map(({entity_label, ...row}) => row);
  }
  if (path === '/openapi.json') {
    value.info.version = '1.0.0';
    delete value.paths['/api/v1/due-reviews'];
    delete value.components.schemas.ArticleIndex;
    delete value.components.schemas.DueReview;
    value.paths['/api/v1/articles'].get.parameters=value.paths['/api/v1/articles'].get.parameters.filter(row=>row.name!=='fields');
    value.paths['/api/v1/articles'].get.responses['200'].content['application/json'].schema.properties.data.items={$ref:'#/components/schemas/Article'};
    delete value.components.schemas.CurrentAdminIdentity;
    delete value.components.schemas.AuditRecord.properties.entity_label;
    value.paths['/api/v1/auth/me'].get.responses['200'].content['application/json']
      .schema.properties.data.$ref = '#/components/schemas/AdminIdentity';
  }
  return value;
}

// Test-only cloning of known synthetic rows into a newly empty fixture. This
// deliberately does not call or relax the production backup/restore mechanism.
const cloneTables = ['matrix_control', 'matrix_accounts', 'matrix_users', 'matrix_articles',
  'matrix_observations', 'matrix_daily_metrics', 'matrix_sessions', 'matrix_api_keys',
  'matrix_audit', 'matrix_idempotency', 'matrix_login_attempts'];
async function syntheticRows(db) {
  const rows = {};
  for (const table of cloneTables) rows[table] = (await db.prepare('SELECT * FROM ' + table).all()).results;
  return rows;
}
async function emptyClone(rows) {
  const app = await fixture(undefined, {bootstrap: false});
  try {
    for (const table of cloneTables) {
      assert.equal((await app.db.prepare('SELECT count(*) AS n FROM ' + table).first()).n, 0);
      const statements = rows[table].map(row => {
        const columns = Object.keys(row);
        assert.ok(columns.every(name => /^[a-z_]+$/.test(name)));
        return app.db.prepare('INSERT INTO ' + table + '(' + columns.join(',') + ') VALUES(' +
          columns.map(() => '?').join(',') + ')').bind(...Object.values(row));
      });
      if (statements.length) await app.db.batch(statements);
    }
    return app;
  } catch (error) {await app.mf.dispose();throw error;}
}
function normalizedMutation(response, body, name, baseCookie) {
  const result = legacyPublishedArticles(body), headers = [...stylePolicyHeaders(response.headers)];
  const generated = ['new-account', 'new-article', 'new-observation', 'new-key'];
  if (generated.includes(name)) {
    assert.ok(typeof result.data.id === 'string' && result.data.id.length > 0, 'generated opaque id');
    result.data.id = '<generated-id>';
  }
  if (name === 'new-key') {
    assert.ok(/^hdy_[a-f0-9]{64}$/.test(result.data.token), 'synthetic generated credential format');
    result.data.token = '<ephemeral-credential>';
  }
  if (name === 'login') {
    const cookie = response.headers.get('set-cookie');assert.ok(cookie);
    const first = cookie.split(';')[0], split = first.indexOf('=');
    assert.equal(first.slice(0, split), baseCookie.split('=')[0]);
    const token = decodeURIComponent(first.slice(split + 1));
    assert.ok(/^[a-f0-9]{64}$/.test(token), 'real generated synthetic session');
    assert.ok(result.data.csrfToken === csrfFor(token), 'real CSRF/session derivation');
    result.data.csrfToken = '<session-derived-csrf>';
    for (const item of headers) if (item[0] === 'set-cookie') {
      item[1] = cookie.replace(first, first.slice(0, split + 1) + '<ephemeral-session>');
    }
  }
  return {status: response.status, headers, body: result};
}

test('documented legacy GET and mutation contracts match the pre-phase2 Worker with explicit volatile-field checks', async t => {
  const legacy = await legacyWorker(t);
  const app = await fixture(t), session = await app.login();
  const accounts = (await app.request('/api/v1/accounts', {session})).data;
  const account = accounts.find(row => row.platform === 'zhihu').id;
  const article = await app.request('/api/v1/articles', {session, method: 'POST', body: {
    account_id: account, title: '虚构旧客户端契约样本', url: 'https://example.invalid/legacy-contract',
    published_at: '2001-01-01T00:00:00Z', production_mode: 'manual', summary: '独立合成数据',
  }});
  assert.equal(article.status, 201);
  assert.equal((await app.request('/api/v1/observations', {session, method: 'POST', body: {
    article_id: article.data.id, kind: 'latest', as_of: '2001-01-02T00:00:00Z',
    collected_at: '2001-01-03T00:00:00Z', metrics: {reads: 0, likes: 1, approvals: 2}, source: 'synthetic',
  }})).status, 201);
  assert.equal((await app.request('/api/v1/daily-metrics', {session, method: 'POST', body: {
    article_id: article.data.id, account_id: account, date: '2001-01-02',
    metrics: {reads: 1, likes: 0, comments: 0}, source: 'synthetic',
  }})).status, 201);
  const credential = await app.request('/api/v1/api-keys', {session, method: 'POST', body: {
    name: 'Synthetic legacy reader', account_ids: [account], permissions: ['read'],
  }});
  assert.equal(credential.status, 201);
  const paths = ['/health', '/openapi.json', '/api-docs', '/api/v1/auth/me', '/api/v1/accounts',
    '/api/v1/articles', '/api/v1/articles/' + article.data.id, '/api/v1/observations',
    '/api/v1/daily-metrics', '/api/v1/dashboard', '/api/v1/api-keys', '/api/v1/audit',
    '/api/v1/export', '/api/v1/overview', '/api/v1/backup'];
  const spec = JSON.parse(await readFile(new URL('../public/openapi.json', import.meta.url), 'utf8'));
  assert.deepEqual(paths.filter(path => path !== '/api/v1/backup').map(path => path.replace(article.data.id, '{id}')).sort(),
    Object.entries(spec.paths).filter(([path, route]) => route.get && path !== '/api/v1/due-reviews').map(([path]) => path).sort());
  assert.equal(spec.paths['/api/v1/due-reviews'].get.operationId,'listDueReviews');
  // This new endpoint has separate scope/due regressions; the legacy set is unchanged.
  const rows = await syntheticRows(app.db);
  const newPassword = 'Synthetic-new-' + PASSWORD;
  const mutations = [
    {name: 'bootstrap', path: '/api/v1/bootstrap', method: 'POST', status: 201,
      body: {username: 'synthetic-bootstrap-user', password: PASSWORD}},
    {name: 'login', path: '/api/v1/auth/login', method: 'POST', status: 200, body: {username: USERNAME, password: PASSWORD}},
    {name: 'logout', path: '/api/v1/auth/logout', method: 'POST', status: 200, body: {}},
    {name: 'password', path: '/api/v1/auth/password', method: 'PUT', status: 200, body: {currentPassword: PASSWORD, newPassword}},
    {name: 'new-account', path: '/api/v1/accounts', method: 'POST', status: 201, body: {platform: 'other', name: 'Synthetic legacy account'}},
    {name: 'account', path: '/api/v1/accounts/' + account, method: 'PUT', status: 200, body: {name: 'Synthetic renamed account', active: false}},
    {name: 'new-article', path: '/api/v1/articles', method: 'POST', status: 201, body: {
      account_id: account, title: '虚构旧写入契约', url: 'https://example.invalid/legacy-write', published_at: '2001-01-01T00:00:00Z'}},
    {name: 'article', path: '/api/v1/articles/' + article.data.id, method: 'PUT', status: 200, body: {version: 1, title: '虚构旧更新契约'}},
    {name: 'new-observation', path: '/api/v1/observations', method: 'POST', status: 201, body: {
      article_id: article.data.id, kind: 'latest', as_of: '2001-01-04T00:00:00Z', collected_at: '2001-01-05T00:00:00Z', metrics: {reads: 1}, source: 'synthetic'}},
    {name: 'new-daily', path: '/api/v1/daily-metrics', method: 'POST', status: 201, body: {
      article_id: article.data.id, account_id: account, date: '2001-01-04', metrics: {reads: 0}, source: 'synthetic'}},
    {name: 'new-key', path: '/api/v1/api-keys', method: 'POST', status: 201, body: {
      name: 'Synthetic paired credential', account_ids: [account], permissions: ['read']}},
    {name: 'revoke', path: '/api/v1/api-keys/' + credential.data.id, method: 'DELETE', status: 200, body: {}},
  ];
  const templatePath = path => path.replace(article.data.id, '{id}').replace(account, '{id}').replace(credential.data.id, '{id}');
  assert.deepEqual(mutations.filter(row => row.name !== 'bootstrap').map(row => row.method.toLowerCase() + ' ' + templatePath(row.path)).sort(),
    Object.entries(spec.paths).flatMap(([path, value]) => Object.keys(value)
      .filter(method => ['post', 'put', 'delete'].includes(method)).map(method => method + ' ' + path)).sort());
  const NativeDate = globalThis.Date, fixed = NativeDate.now();
  // Only the two Node Worker modules share a fixed read clock. D1 and the actual
  // fixture login/session creation are real; authentication is never stubbed.
  globalThis.Date = class extends NativeDate {
    constructor(...args) {super(...(args.length ? args : [fixed]));}
    static now() {return fixed;}
  };
  try {
    for (const kind of ['session', 'bearer']) for (const path of paths) {
      const headers = kind === 'session' ? {Cookie: session.cookie} : {Authorization: 'Bearer ' + credential.data.token};
      const responses = [];
      for (const worker of [legacy, current]) {
        const response = await worker.fetch(new Request(app.origin + path, {headers}),
          {DB: app.db, SITE_ORIGIN: app.origin});
        const adminOnly = ['/api/v1/auth/me', '/api/v1/api-keys', '/api/v1/audit', '/api/v1/export', '/api/v1/backup'];
        assert.equal(response.status, kind === 'bearer' && adminOnly.includes(path) ? 403 : 200,
          kind + ' expected status ' + path.replace(article.data.id, '{id}'));
        const text = await response.text();
        const json = response.headers.get('content-type')?.includes('application/json');
        const headersForComparison = new Headers(response.headers);
        if (worker === current && path === '/openapi.json') {
          // C3's explicit static-header exception; no API header projection.
          assert.equal(headersForComparison.get('Cache-Control'), 'no-cache');
          assert.equal(headersForComparison.get('ETag'),
            '"' + createHash('sha256').update(text).digest('hex') + '"');
          assert.equal(headersForComparison.get('Content-Length'), String(Buffer.byteLength(text)));
          headersForComparison.set('Cache-Control', 'no-store');
          headersForComparison.delete('ETag');headersForComparison.delete('Content-Length');
        }
        responses.push({status: response.status, headers: dashboardHeaders(path, response.status, stylePolicyHeaders(headersForComparison)),
          body: json ? project(path, traceJSON(JSON.parse(text), response.status, response.headers)) : path==='/api-docs'?articlePipelineDocs(text):text});
      }
      // Backup holds only synthetic hashes, but never dump even those on a failed assertion.
      if (path === '/api/v1/backup') assert.ok(isDeepStrictEqual(responses[1], responses[0]), kind + ' exact legacy backup equality after verified todo extension');
      else assert.deepEqual(responses[1], responses[0], kind + ' ' + path.replace(article.data.id, '{id}'));
    }
    for (const item of mutations) {
      const responses = [];
      for (const worker of [legacy, current]) {
        const isolated = item.name === 'bootstrap' ? await fixture(undefined, {bootstrap: false}) : await emptyClone(rows);
        try {
          const headers = {'Content-Type': 'application/json', Origin: app.origin};
          if (item.name === 'bootstrap') headers.Authorization = 'Bearer ' + isolated.bootstrapSecret;
          else if (item.name !== 'login') Object.assign(headers,
            {Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken});
          const response = await worker.fetch(new Request(app.origin + item.path,
            {method: item.method, headers, body: JSON.stringify(item.body)}),
            {DB: isolated.db, SITE_ORIGIN: app.origin, MATRIX_BOOTSTRAP_SECRET: isolated.bootstrapSecret});
          const data = await response.json();
          assert.equal(response.status, item.status, item.name + ' expected success status: ' + (data.error?.code || 'none'));
          responses.push(normalizedMutation(response, data, item.name, session.cookie));
          if (item.name === 'bootstrap') {
            const verified = await worker.fetch(new Request(app.origin + '/api/v1/auth/login',
              {method: 'POST', headers: {'Content-Type': 'application/json', Origin: app.origin},
                body: JSON.stringify(item.body)}), {DB: isolated.db, SITE_ORIGIN: app.origin});
            assert.equal(verified.status, 200, 'bootstrap creates a usable synthetic administrator');
            await verified.text();
          }
          if (['login', 'logout', 'password'].includes(item.name)) {
            const cookie = item.name === 'login' ? response.headers.get('set-cookie').split(';')[0] : session.cookie;
            const me = await worker.fetch(new Request(app.origin + '/api/v1/auth/me', {headers: {Cookie: cookie}}),
              {DB: isolated.db, SITE_ORIGIN: app.origin, MATRIX_BOOTSTRAP_SECRET: isolated.bootstrapSecret});
            assert.equal(me.status, item.name === 'login' ? 200 : 401, item.name + ' actual session effect');
          }
        } finally {await isolated.mf.dispose();}
      }
      assert.deepEqual(responses[1], responses[0], item.name + ' paired legacy/current response');
      console.info('Legacy paired mutation passed: ' + item.name);
    }
  } finally {globalThis.Date = NativeDate;}
  t.diagnostic('14 documented GET routes plus existing backup x session/Bearer; old-field JSON, status and headers match; no new parameters');
  t.diagnostic('11 documented mutation methods plus existing bootstrap run on independent synthetic fixtures; nonvolatile fields/status/headers match.');
  t.diagnostic('Generated opaque ids, credential values and login session/CSRF are validated then normalized, not claimed byte-identical.');
});
