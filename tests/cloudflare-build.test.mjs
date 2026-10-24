import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {cloudflareConfig} from '../scripts/cloudflare-config.mjs';
import {fixture} from './harness.mjs';

const exec = promisify(execFile);
const root = new URL('../', import.meta.url);
const runtime = JSON.parse(await readFile(new URL('runtime.json', root), 'utf8'));
const synthetic = {CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
  CLOUDFLARE_D1_DATABASE_ID: '11111111-1111-4111-8111-111111111111',
  CLOUDFLARE_D1_DATABASE_NAME: 'synthetic-only', CLOUDFLARE_SITE_ORIGIN: 'https://synthetic.invalid'};

test('unconfigured Cloudflare builds are templates; partial or unsafe target configuration fails closed', () => {
  const result = cloudflareConfig(runtime);
  assert.equal(result.configured, false);
  assert.equal(result.config.workers_dev, false);assert.equal(result.config.preview_urls, false);
  assert.equal(result.config.vars.TRUST_CF_CONNECTING_IP, undefined);
  for (const env of [{CLOUDFLARE_ACCOUNT_ID: synthetic.CLOUDFLARE_ACCOUNT_ID},
    {...synthetic, CLOUDFLARE_SITE_ORIGIN: 'http://synthetic.invalid'},
    {...synthetic, CLOUDFLARE_SITE_ORIGIN: 'https://synthetic.invalid/path'},
    {...synthetic, CLOUDFLARE_D1_DATABASE_ID: '../not-an-id'},
    {...synthetic, CLOUDFLARE_WORKER_NAME: '../not-a-name'}]) assert.throws(() => cloudflareConfig(runtime, env));
});

test('Cloudflare target preserves platform output and exact application bytes, with a runnable isolated D1 bundle', async t => {
  const env = {...process.env};
  for (const key of [...Object.keys(synthetic), 'CLOUDFLARE_WORKER_NAME']) delete env[key];
  const original = await readFile(new URL('dist/server/index.js', root));
  const manifest = await readFile(new URL('.openai/hosting.json', root));
  await exec(process.execPath, ['scripts/build.mjs', '--target=cloudflare'], {cwd: root, env});
  await access(new URL('dist/cloudflare/wrangler.template.json', root));
  await assert.rejects(access(new URL('dist/cloudflare/wrangler.json', root)), {code: 'ENOENT'});
  assert.deepEqual(await readFile(new URL('dist/cloudflare/index.js', root)), original);
  assert.deepEqual(await readFile(new URL('dist/server/index.js', root)), original);
  assert.deepEqual(await readFile(new URL('.openai/hosting.json', root)), manifest);
  await assert.rejects(access(new URL('dist/cloudflare/.openai', root)), {code: 'ENOENT'});
  const journal = JSON.parse(await readFile(new URL('drizzle/meta/_journal.json', root), 'utf8'));
  for (const {tag} of journal.entries) assert.deepEqual(
    await readFile(new URL('dist/cloudflare/migrations/' + tag + '.sql', root)),
    await readFile(new URL('drizzle/' + tag + '.sql', root)));
  await exec(process.execPath, ['scripts/build.mjs', '--target=cloudflare'], {cwd: root, env: {...env, ...synthetic}});
  const config = JSON.parse(await readFile(new URL('dist/cloudflare/wrangler.json', root), 'utf8'));
  assert.equal(config.account_id, synthetic.CLOUDFLARE_ACCOUNT_ID);
  assert.equal(config.d1_databases[0].database_id, synthetic.CLOUDFLARE_D1_DATABASE_ID);
  assert.equal(config.workers_dev, false);assert.equal(config.preview_urls, false);assert.equal(config.routes, undefined);
  const previous = process.env.TEST_WORKER_PATH;
  process.env.TEST_WORKER_PATH = new URL('dist/cloudflare/index.js', root).pathname;
  t.after(() => {if (previous === undefined) delete process.env.TEST_WORKER_PATH;else process.env.TEST_WORKER_PATH = previous;});
  const app = await fixture(t), session = await app.login();
  assert.equal((await app.request('/')).status, 200);
  assert.equal((await app.request('/api/v1/accounts')).status, 401);
  assert.equal((await app.request('/api/v1/accounts', {session})).data.length, 3);
  assert.equal((await app.request('/api/v1/accounts', {method: 'POST', session,
    headers: {Origin: 'https://foreign.invalid'}, body: {platform: 'other', name: 'MUST NOT EXIST'}})).status, 403);
  assert.deepEqual(await readFile(new URL('dist/server/index.js', root)), original);
});
