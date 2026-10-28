// Explicit opt-in: builds an image, uses only uniquely named disposable
// containers/volumes, publishes no ports and supplies synthetic secrets via stdin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout } from 'node:timers/promises';

const origin = 'https://matrix.example.test';
const httpClient = `
  let text=''; for await (const chunk of process.stdin) text+=chunk;
  const {path,method='GET',body,cookie,csrf,token,forwarded}=JSON.parse(text);
  const headers={Origin:${JSON.stringify(origin)}};
  if(body!==undefined) headers['Content-Type']='application/json';
  if(cookie) headers.Cookie=cookie;
  if(csrf) headers['X-CSRF-Token']=csrf;
  if(token) headers.Authorization='Bearer '+token;
  if(forwarded) headers['X-Forwarded-For']=forwarded;
  const response=await fetch('http://127.0.0.1:3000'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  console.log(JSON.stringify({status:response.status,cookie:response.headers.get('set-cookie'),json:await response.json()}));
`;
const inventoryScript = `
  import {DatabaseSync} from 'node:sqlite';
  import {statSync} from 'node:fs';
  const db=new DatabaseSync(process.env.MATRIX_DB_PATH,{readOnly:true});
  const names=['schema_versions','accounts','articles','observations','daily_metrics','users','sessions','api_keys','audit','idempotency','login_attempts'];
  console.log(JSON.stringify({integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,
    foreignKeys:db.prepare('PRAGMA foreign_key_check').all(),mode:statSync(process.env.MATRIX_DB_PATH).mode&511,
    tables:Object.fromEntries(names.map(name=>[name,db.prepare('SELECT * FROM '+name+' ORDER BY rowid').all()]))}));
  db.close();
`;

test('Docker image, nonroot volumes, restart/recreation, online backup and isolated restores', { timeout: 240000 }, async t => {
  const suffix = randomUUID();
  const image = `haoduoyu-matrix-verify:${suffix}`;
  const prefix = `matrix-verify-${suffix}`;
  const volumes = [], containers = new Set();
  const directory = mkdtempSync(join(tmpdir(), 'matrix-docker-'));
  let imageBuilt = false;
  function docker(args, input, mustSucceed = true) {
    const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    if (mustSucceed) assert.equal(result.status, 0, `docker ${args[0]} failed: ${result.stderr || result.error?.message}`);
    return result;
  }
  function node(container, code, input) {
    return docker(['exec', '-i', container, 'node', '--input-type=module', '-e', code], input).stdout.trim();
  }
  function http(container, path, options = {}, status = 200) {
    const result = JSON.parse(node(container, httpClient, JSON.stringify({ path, ...options })));
    assert.equal(result.status, status, `${path}: unexpected HTTP status (${result.json.error?.code || 'success'})`);
    return result;
  }
  function inventory(container) { return JSON.parse(node(container, inventoryScript)); }
  function volume(name) {
    const full = `${prefix}-${name}`;
    docker(['volume', 'create', full]); volumes.push(full); return full;
  }
  const name = `${prefix}-app`;
  async function start(data, backup) {
    docker(['run', '-d', '--name', name, '--network', 'none',
      '-e', `SITE_ORIGIN=${origin}`, '-e', 'TRUSTED_PROXIES=127.0.0.1',
      '-v', `${data}:/app/data`, '-v', `${backup}:/app/backups`, image]);
    containers.add(name);
    // Exercise the Dockerfile's real HEALTHCHECK, rather than merely inspecting its definition.
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = JSON.parse(docker(['inspect', '--format', '{{json .State}}', name]).stdout);
      assert.equal(state.Running, true, 'Application must remain running');
      if (state.Health.Status === 'healthy') return;
      assert.notEqual(state.Health.Status, 'unhealthy');
      await setTimeout(400);
    }
    assert.fail('Docker healthcheck did not become healthy');
  }
  function removeApp() { docker(['rm', '-f', name]); containers.delete(name); }
  function helper(mounts, command) {
    docker(['run', '--rm', '--network', 'none', '--user', 'root', ...mounts.flatMap(m => ['-v', m]), image, ...command]);
  }
  try {
    docker(['build', '-t', image, '.']);
    imageBuilt = true;
    t.diagnostic('Docker build succeeded');
    const data = volume('data'), backups = volume('backups');
    await start(data, backups);
    assert.equal(node(name, 'console.log(process.getuid())'), '1000');
    const empty = inventory(name);
    assert.equal(empty.tables.accounts.length, 3);
    for (const table of ['articles', 'observations', 'daily_metrics', 'users', 'api_keys']) assert.equal(empty.tables[table].length, 0);
    http(name, '/health');
    http(name, '/api/v1/accounts', {}, 401);
    node(name, `
      import {DatabaseSync} from 'node:sqlite';
      import {createHash} from 'node:crypto';
      const db=new DatabaseSync(process.env.MATRIX_DB_PATH);
      const bucket=createHash('sha256').update('198.51.100.2:proxy-probe').digest('hex');
      db.prepare('INSERT INTO login_attempts VALUES(?,?,?)').run(bucket,10,Date.now()); db.close();
    `);
    const failedLogin = { method: 'POST', body: { username: 'proxy-probe', password: 'test-only-invalid-password' } };
    http(name, '/api/v1/auth/login', { ...failedLogin, forwarded: '198.51.100.2' }, 429);
    http(name, '/api/v1/auth/login', { ...failedLogin, forwarded: '198.51.100.3' }, 401);
    t.diagnostic('Container entrypoint honors TRUSTED_PROXIES and separates client login buckets');
    const password = randomBytes(32).toString('hex');
    docker(['exec', '-i', name, 'node', 'scripts/admin.mjs', 'create', '--username', 'test-only-admin'], password + '\n');
    function login(container) {
      const result = http(container, '/api/v1/auth/login', { method: 'POST', body: { username: 'test-only-admin', password } });
      assert.match(result.cookie, /; Secure/);
      assert.match(result.cookie, /; HttpOnly/);
      return { cookie: result.cookie.split(';')[0], csrf: result.json.data.csrfToken };
    }
    const session = login(name);
    http(name, '/api/v1/accounts/toutiao-haoduoyu', { ...session, method: 'PUT', body: { name: '隔离持久化账号', active: false } });
    const articleInput = {
      account_id: 'zhihu-haoduoyu', title: '隔离容器验证文章', url: 'https://example.test/container-fixture',
      published_at: '2026-01-01T01:00:00+08:00', started_at: null, production_mode: 'unknown',
    };
    const article = http(name, '/api/v1/articles', { ...session, method: 'POST', body: articleInput }, 201).json.data;
    http(name, '/api/v1/observations', { ...session, method: 'POST', body: {
      article_id: article.id, as_of: '2026-01-02T01:00:00+08:00', kind: 'd1', metrics: { reads: 3, likes: 0 }, source: 'synthetic-only',
    } }, 201);
    http(name, '/api/v1/observations', { ...session, method: 'POST', body: {
      article_id: article.id, as_of: '2026-01-03T01:00:00+08:00', kind: 'latest', metrics: { reads: 2, likes: 0 }, source: 'synthetic-correction',
    } }, 201);
    http(name, '/api/v1/daily-metrics', { ...session, method: 'POST', body: {
      account_id: article.account_id, article_id: article.id, date: '2026-01-02', metrics: { reads: 0 }, source: 'synthetic-only',
    } }, 201);
    const key = http(name, '/api/v1/api-keys', { ...session, method: 'POST', body: {
      name: 'ephemeral-test-only', account_ids: [article.account_id], permissions: ['read'],
    } }, 201).json.data;
    http(name, `/api/v1/api-keys/${key.id}`, { ...session, method: 'DELETE' });
    http(name, '/api/v1/accounts', { token: key.token }, 401);
    const before = inventory(name);
    assert.equal(before.integrity, 'ok'); assert.deepEqual(before.foreignKeys, []); assert.equal(before.mode, 0o600);
    docker(['restart', name]);
    http(name, '/health');
    assert.deepEqual(inventory(name), before, 'Every table must survive a process/container restart');
    removeApp();
    await start(data, backups);
    assert.deepEqual(inventory(name), before, 'Every table must survive container deletion and recreation');
    t.diagnostic('UID 1000, fresh-volume permissions, real Docker healthcheck, restart and container recreation passed');

    const backupPath = '/app/backups/verified.sqlite';
    docker(['exec', name, 'node', 'scripts/backup.mjs', backupPath]);
    const file = join(directory, 'verified.sqlite');
    docker(['cp', `${name}:${backupPath}`, file]);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const checksum = createHash('sha256').update(readFileSync(file)).digest('hex');
    assert.match(checksum, /^[a-f0-9]{64}$/);
    assert.equal(docker(['exec', name, 'node', 'scripts/backup.mjs', backupPath], undefined, false).status, 1);
    http(name, '/api/v1/accounts', { ...session, method: 'POST', body: { platform: 'other', name: '备份后新增，仅原卷保留' } }, 201);
    assert.equal(inventory(name).tables.accounts.length, 4);
    t.diagnostic(`Online backup exported with mode 0600, SHA-256 ${checksum}; overwrite rejected`);
    removeApp();

    const restored = volume('restored');
    helper([`${backups}:/app/backups:ro`, `${restored}:/app/data`], ['node', '-e',
      "const fs=require('node:fs');fs.copyFileSync('/app/backups/verified.sqlite','/app/data/matrix.sqlite');fs.chownSync('/app/data/matrix.sqlite',1000,1000);fs.chownSync('/app/data',1000,1000);"]);
    await start(restored, backups);
    assert.deepEqual(inventory(name), before, 'Restored volume must exactly match the backup point, including revocation and audit');
    const restoredSession = login(name);
    const detail = http(name, `/api/v1/articles/${article.id}`, restoredSession).json.data;
    assert.equal(detail.started_at, null); assert.equal(detail.duration_seconds, null);
    assert.equal(detail.latest_metrics.reads, 2); assert.equal(detail.latest_metrics.likes, 0);
    assert.equal(detail.latest_metrics.comments, undefined); assert.equal(detail.observations.length, 2);
    http(name, '/api/v1/accounts', { token: key.token }, 401);
    const daily = http(name, '/api/v1/daily-metrics', restoredSession).json.data;
    assert.equal(daily[0].metrics.reads, 0);
    t.diagnostic('Online backup restored into a new volume: integrity, all 11 tables, admin login, null/zero, snapshots, daily metrics, audit and revoked token passed');
    const archiveBefore = inventory(name);
    removeApp();
    helper([`${restored}:/data:ro`, `${backups}:/backup`], ['tar', '-czf', '/backup/stopped-data.tgz', '-C', '/data', '.']);
    helper([`${backups}:/backup`], ['chmod', '600', '/backup/stopped-data.tgz']);
    const archived = volume('archive-restored');
    helper([`${archived}:/data`, `${backups}:/backup:ro`], ['tar', '-xzf', '/backup/stopped-data.tgz', '-C', '/data']);
    await start(archived, backups);
    assert.deepEqual(inventory(name), archiveBefore);
    login(name);
    http(name, '/api/v1/accounts', { token: key.token }, 401);
    t.diagnostic('Stopped-volume tar backup restored into a second new volume with nonroot access and login passed');
  } finally {
    const failures = [];
    for (const container of containers) if (docker(['rm', '-f', container], undefined, false).status !== 0) failures.push(container);
    for (const v of volumes.reverse()) if (docker(['volume', 'rm', v], undefined, false).status !== 0) failures.push(v);
    if (imageBuilt && docker(['image', 'rm', image], undefined, false).status !== 0) failures.push(image);
    rmSync(directory, { recursive: true, force: true });
    assert.deepEqual(failures, [], 'All temporary Docker resources must be removed');
  }
});
