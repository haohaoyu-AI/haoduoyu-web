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
  // B4's sole approved contract delta: remove two unreachable queue-time
  // mappings and add that same ARTICLE_EXISTS tuple at the real commit boundary.
  // Keep the original B3 snapshot intact; every other tuple and HTTP case stays locked.
  const removed = row => row.file === 'src/records.mjs' && [308, 331].includes(row.baselineLine);
  assert.equal(expected.calls.filter(removed).length, 2);
  for (const row of expected.calls.filter(removed)) {
    assert.deepEqual({status: row.status, code: row.code, message: row.message},
      {status: 409, code: 'ARTICLE_EXISTS', message: '该平台文章或链接已经登记'});
  }
  // 5a removes only four unreachable fail calls inside the five deleted legacy
  // auth functions. Keep the historical snapshot and all live tuples intact.
  const deadAuth = row => row.file === 'shared/auth.mjs' && [2, 3, 4, 5].includes(row.ordinal);
  assert.deepEqual(expected.calls.filter(deadAuth).map(({status, code, message}) => ({status, code, message})), [
    {status:400, code:'INVALID_USERNAME', message:'账号需要 3 至 80 个字母、数字或 . _ @ -'},
    {status:401, code:'UNAUTHORIZED', message:'授权凭证无效'},
    {status:401, code:'UNAUTHORIZED', message:'授权凭证无效或已撤销'},
    {status:401, code:'UNAUTHORIZED', message:'请先登录'},
  ]);
  const approvedCalls = expected.calls.filter(row => !removed(row) && !deadAuth(row));
  const position = approvedCalls.findIndex(row => row.file === 'src/storage.mjs' && row.ordinal === 2);
  assert.ok(position >= 0);
  approvedCalls.splice(position + 1, 0, {file: 'src/storage.mjs', status: 409,
    code: 'ARTICLE_EXISTS', message: '该平台文章或链接已经登记', alternateMessage: '该平台文章或链接已经登记'});
  const semantic = rows => {
    const ordinals = new Map();
    return rows.map(({baselineLine, ordinal, ...row}) => {
      const next = (ordinals.get(row.file) || 0) + 1;ordinals.set(row.file, next);
      return {...row, ordinal: next};
    });
  };
  // C4 adds three validations only for the newly introduced fields mode.
  // The original snapshot and every legacy tuple remain unchanged.
  const indexMessages=['文章索引不支持依赖快照的排序','文章索引不支持依赖快照的数据状态','显示字段模式无效'];
  for(const message of indexMessages) assert.deepEqual(calls.filter(row=>row.file==='src/records.mjs'&&row.message===message)
    .map(({status,code,message,alternateMessage})=>({status,code,message,alternateMessage})),
    [{status:400,code:'VALIDATION_ERROR',message,alternateMessage:message}]);
  // v5 introduces exactly two new backup/cursor validations. Keep every
  // pre-existing source tuple and all HTTP contracts in the original snapshot.
  const noteBackupMessages=['备份修订号无效','碎碎念变更号超过源修订号'];
  for(const message of noteBackupMessages)assert.deepEqual(calls.filter(row=>row.file==='src/backup.mjs'&&row.message===message)
    .map(({status,code,message,alternateMessage})=>({status,code,message,alternateMessage})),
    [{status:400,code:'INVALID_BACKUP',message,alternateMessage:message}]);
  // v6 adds only these two article-backup validations; retain every historical
  // source tuple and legacy HTTP result without replacing the frozen snapshot.
  const articleBackupMessages=['旧文章备份的链接和发布时间不得为空','文章流水线备份无效'];
  for(const message of articleBackupMessages)assert.deepEqual(calls.filter(row=>row.file==='src/backup.mjs'&&row.message===message)
    .map(({status,code,message,alternateMessage})=>({status,code,message,alternateMessage})),
    [{status:400,code:'INVALID_BACKUP',message,alternateMessage:message}]);
  const legacyCalls=calls.filter(row=>!(row.file==='src/records.mjs'&&indexMessages.includes(row.message))&&
    !(row.file==='src/backup.mjs'&&[...noteBackupMessages,...articleBackupMessages].includes(row.message)));
  assert.deepEqual(semantic(legacyCalls), semantic(approvedCalls));
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
