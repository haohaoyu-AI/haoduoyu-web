import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {exportBackup, restoreIntoEmptyDatabase} from '../src/backup.mjs';

async function setup(t, {publicMode = true} = {}) {
  const app = await fixture(t), session = await app.login();
  const owner = (await app.request('/api/v1/auth/me', {session})).data.id;
  const env = {DB:app.db, SITE_ORIGIN:app.origin, DAILY_NOTES_OWNER_ID:owner,
    PUBLIC_BUSINESS_MODE:publicMode ? '1' : '0', PUBLIC_BUSINESS_USER_ID:owner, PUBLIC_BUSINESS_ACCOUNT_IDS:'[]'};
  async function call(path, {method = 'GET', body, headers = {}} = {}) {
    const h = new Headers(headers);
    if (body !== undefined) h.set('Content-Type', 'application/json');
    if (!['GET', 'HEAD'].includes(method)) {
      if (!h.has('Origin')) h.set('Origin', app.origin);
      if (publicMode && !h.has('X-Public-Business')) h.set('X-Public-Business', '1');
    }
    const response = await worker.fetch(new Request(app.origin + '/api/v1/daily-scores' + path, {
      method, headers:h, body:body === undefined ? undefined : JSON.stringify(body)
    }), env);
    const text = await response.text();
    return {status:response.status, ...(text ? JSON.parse(text) : {})};
  }
  return {app, owner, env, call};
}

test('public daily score is one integer from 1 to 10 per date and stays in history', async t => {
  const {call, owner, app} = await setup(t), date = '2026-11-11', save_id = randomUUID();
  assert.equal((await call('?date=' + date)).data.score, null);
  assert.equal((await call('/' + date, {method:'PUT', body:{score:0, version:0, save_id}})).status, 400);
  assert.equal((await call('/' + date, {method:'PUT', body:{score:11, version:0, save_id:randomUUID()}})).status, 400);
  const created = await call('/' + date, {method:'PUT', body:{score:8, version:0, save_id}});
  assert.equal(created.status, 200);
  assert.equal(created.data.score, 8);
  assert.equal(created.data.version, 1);
  const replay = await call('/' + date, {method:'PUT', body:{score:8, version:0, save_id}});
  assert.equal(replay.data.version, 1);
  assert.equal((await call('/' + date, {method:'PUT', body:{score:9, version:0, save_id:randomUUID()}})).status, 409);
  const changed = await call('/' + date, {method:'PUT', body:{score:9, version:1, save_id:randomUUID()}});
  assert.equal(changed.data.score, 9);
  const month = await call('?month=2026-11');
  assert.deepEqual(month.data.items.map(item => [item.date, item.score]), [[date, 9]]);
  assert.equal((await app.db.prepare('SELECT user_id,score FROM matrix_daily_scores').first()).user_id, owner);
  const full = await exportBackup(app.db);
  assert.equal(full.data.format, 'haoduoyu-matrix-d1-v18');
  assert.equal(full.data.tables.daily_scores.length, 1);
  const target = await fixture(t, {bootstrap:false});
  await restoreIntoEmptyDatabase(target.db, full, {allowEmptyRestore:true});
  assert.equal((await target.db.prepare('SELECT score FROM matrix_daily_scores').first()).score, 9);
});

test('anonymous score writes need the public header and do not accept another date shape', async t => {
  const {call} = await setup(t);
  const denied = await call('/2026-11-11', {method:'PUT', body:{score:4, version:0, save_id:randomUUID()},
    headers:{'X-Public-Business':'0'}});
  assert.equal(denied.status, 403);
  assert.equal((await call('?month=2026-13')).status, 400);
  assert.equal((await call('/not-a-date', {method:'PUT', body:{score:4, version:0, save_id:randomUUID()}})).status, 404);
});
