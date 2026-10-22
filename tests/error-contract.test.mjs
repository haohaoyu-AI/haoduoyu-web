import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {errorCalls} from '../scripts/audit-error-contracts.mjs';
import {fixture} from './harness.mjs';
import {overviewWindow, buildOverview} from '../src/overview.mjs';
import {paginate} from '../src/analytics.mjs';
import {validatePassword, checkOrigin, checkCsrf} from '../shared/auth.mjs';

const snapshot = new URL('./fixtures/error-contracts.json', import.meta.url);
const cases = [
  ['/api/v1/auth/me', {}],
  ['/api/v1/unknown-synthetic-route', {auth: true}],
  ['/api/v1/articles?platform=invalid', {auth: true}],
  ['/api/v1/articles?sort=invalid', {auth: true}],
  ['/api/v1/articles?topic=invalid', {auth: true}],
  ['/api/v1/articles?data_status=invalid', {auth: true}],
  ['/api/v1/articles?page=bad', {auth: true}],
  ['/api/v1/articles?page=0', {auth: true}],
  ['/api/v1/articles?page=1&offset=0', {auth: true}],
  ['/api/v1/overview?period=today', {auth: true}],
  ['/api/v1/overview?period=7d&period=30d', {auth: true}],
  ['/api/v1/overview?top_n=0', {auth: true}],
  ['/api/v1/articles', {auth: true, method: 'POST', body: {}}],
  ['/api/v1/articles', {auth: true, method: 'POST'}],
  ['/api/v1/articles/missing-synthetic', {auth: true}],
  ['/api/v1/accounts', {auth: true, method: 'POST', body: {platform: 'invalid', name: 'Synthetic'}}],
  ['/api/v1/api-keys', {auth: true, method: 'POST', body: {}}],
  ['/api/v1/api-keys/missing-synthetic', {auth: true, method: 'DELETE'}],
  ['/api/v1/daily-metrics', {auth: true, method: 'POST', body: {}}],
  ['/api/v1/observations', {auth: true, method: 'POST', body: {}}],
];
const tuple = error => ({status: error.status, code: error.code, message: error.message});

test('all reviewed error call sites and HTTP error projections retain their baseline contracts', async t => {
  const calls = await errorCalls();
  const app = await fixture(t);
  const session = await app.login();
  const http = [];
  for (const [path, {auth, ...options}] of cases) {
    const result = await app.request(path, {...options, session: auth ? session : undefined});
    assert.ok(result.status >= 400, path);
    http.push({path, method: options.method || 'GET', status: result.status, json: result.json});
  }
  const expected = JSON.parse(await readFile(snapshot, 'utf8'));
  const semantic = rows => rows.map(({baselineLine, ...row}) => row);
  assert.deepEqual(semantic(calls), semantic(expected.calls));
  assert.deepEqual(http, expected.http);
  t.diagnostic(`${calls.length} source call sites; ${http.length} real Worker HTTP error contracts`);
});

test('existing helpers throw the same tuples and preserve catch/async propagation', async () => {
  const password = {status: 400, code: 'INVALID_PASSWORD', message: '密码需要 12 至 256 个字符'};
  assert.throws(() => validatePassword(''), error => {assert.deepEqual(tuple(error), password);return true;});
  const origin = {status: 403, code: 'CSRF', message: '请求来源校验失败，请刷新后重试'};
  assert.throws(() => checkOrigin({headers: {origin: 'http://invalid.test'}}, 'http://localhost'),
    error => {assert.deepEqual(tuple(error), origin);return true;});
  assert.throws(() => checkCsrf({headers: {origin: 'http://localhost'}}, {kind: 'session', token: 'synthetic-session'}, 'http://localhost'),
    error => {assert.equal(error.status, 403);assert.equal(error.code, 'CSRF');return true;});
  assert.throws(() => overviewWindow('invalid'), error => {
    assert.deepEqual(tuple(error), {status: 400, code: 'VALIDATION_ERROR', message: 'period 仅支持 yesterday、7d 或 30d'});
    return true;
  });
  assert.throws(() => buildOverview({accounts: [{id: 'synthetic', platform: 'toutiao'}],
    articles: [], observations: [], period: '7d', now: Date.parse('2001-01-10T00:00:00Z'),
    daily: ['2001-01-08', '2001-01-09'].map(date => ({account_id: 'synthetic', article_id: null,
      date, metrics: {reads: Number.MAX_SAFE_INTEGER}}))}), error => {
    assert.deepEqual(tuple(error), {status: 422, code: 'METRIC_OVERFLOW', message: '指标汇总超出安全整数范围'});
    return true;
  });
  const pagination = {status: 400, code: 'VALIDATION_ERROR', message: '分页参数须为范围内的非负整数'};
  const steps = [];
  const invoke = () => {try {paginate([], {page: 'invalid'});} catch (error) {
    steps.push('caught');assert.deepEqual(tuple(error), pagination);throw error;
  } finally {steps.push('finally');}};
  await assert.rejects(async () => invoke(), error => {
    assert.deepEqual(tuple(error), pagination);return true;
  });
  assert.deepEqual(steps, ['caught', 'finally']);
});
