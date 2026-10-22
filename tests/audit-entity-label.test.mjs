import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './harness.mjs';
import worker from '../dist/server/index.js';

const stamp = '2001-01-01T00:00:00Z';
const title = '虚构标题 <img src=x onerror=alert(1)> & "引用"';
async function setup(t) {
  const app = await fixture(t);
  app.session = await app.login();
  const accounts = (await app.request('/api/v1/accounts', {session: app.session})).data;
  app.account = accounts[0].id;
  return app;
}
async function seed(app, count = 21) {
  await app.db.batch(Array.from({length: count}, (_, i) => app.db.prepare(
    'INSERT INTO matrix_articles(id,account_id,title,url,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
  ).bind('synthetic-article-' + i, app.account, i === 0 ? title : '虚构分页样本 ' + i,
    'https://example.invalid/audit/' + i, new Date(Date.parse(stamp) + i * 86400000).toISOString(), stamp, stamp)));
}
async function audit(app, action, entity, id = crypto.randomUUID()) {
  await app.db.prepare('INSERT INTO matrix_audit(id,actor,action,entity_id,detail_json,created_at) VALUES(?,?,?,?,?,?)')
    .bind(id, 'synthetic-audit-actor', action, entity, '{}', stamp).run();
  return id;
}

test('audit labels articles beyond the loaded page, preserves old fields, and rejects entity collisions', async t => {
  const app = await setup(t);
  await seed(app);
  const page = await app.request('/api/v1/articles?page=1&page_size=20', {session: app.session});
  assert.equal(page.status, 200);
  assert.equal(page.data.some(row => row.id === 'synthetic-article-0'), false);
  const ids = {
    created: await audit(app, 'POST /articles', 'synthetic-article-0'),
    updated: await audit(app, 'PUT /articles/synthetic-article-0', 'synthetic-article-0'),
    legacy: await audit(app, 'article.create', 'synthetic-article-0'),
    missing: await audit(app, 'POST /articles', 'synthetic-missing'),
    account: await audit(app, 'PUT /accounts/synthetic-article-0', 'synthetic-article-0'),
    snapshot: await audit(app, 'POST /observations', 'synthetic-article-0'),
    wrongPath: await audit(app, 'PUT /articles/different', 'synthetic-article-0'),
  };
  const legacy = (await app.db.prepare('SELECT * FROM matrix_audit ORDER BY created_at DESC,rowid DESC LIMIT 200').all())
    .results.map(({detail_json, ...row}) => ({...row, detail: JSON.parse(detail_json)}));
  const result = await app.request('/api/v1/audit', {session: app.session});
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.map(({entity_label, ...row}) => row), legacy);
  for (const key of ['created', 'updated', 'legacy']) {
    assert.equal(result.data.find(row => row.id === ids[key]).entity_label, title);
  }
  for (const key of ['missing', 'account', 'snapshot', 'wrongPath']) {
    assert.equal(result.data.find(row => row.id === ids[key]).entity_label, null);
  }
  await app.db.prepare('DELETE FROM matrix_articles WHERE id=?').bind('synthetic-article-0').run();
  const deleted = await app.request('/api/v1/audit', {session: app.session});
  assert.equal(deleted.data.find(row => row.id === ids.created).entity_label, null);
});

test('audit uses one bounded query regardless of row count; unauthorized clients cannot obtain labels', async t => {
  const app = await setup(t);
  await seed(app, 1);
  const queries = [];
  const db = {prepare(sql) {queries.push(sql);return app.db.prepare(sql);}, batch: (...args) => app.db.batch(...args)};
  const request = async headers => {
    queries.length = 0;
    const response = await worker.fetch(new Request(app.origin + '/api/v1/audit', {headers}),
      {DB: db, SITE_ORIGIN: app.origin});
    return {status: response.status, json: await response.json(), queries: [...queries]};
  };
  const small = await request({Cookie: app.session.cookie});
  await app.db.batch(Array.from({length: 50}, (_, i) => app.db.prepare(
    'INSERT INTO matrix_audit(id,actor,action,entity_id,detail_json,created_at) VALUES(?,?,?,?,?,?)',
  ).bind('synthetic-log-' + i, 'synthetic-actor', 'POST /articles', 'synthetic-article-0', '{}', stamp)));
  const large = await request({Cookie: app.session.cookie});
  assert.equal(small.status, 200);assert.equal(large.status, 200);
  assert.equal(large.queries.length, small.queries.length, 'row count must not introduce N+1 queries');
  const joins = large.queries.filter(sql => /FROM matrix_audit/.test(sql));
  assert.equal(joins.length, 1);assert.match(joins[0], /LEFT JOIN matrix_articles/);
  t.diagnostic(`audit rows ${small.json.data.length} -> ${large.json.data.length}; SQL statements ${small.queries.length} -> ${large.queries.length}; audit joins ${joins.length}`);
  assert.equal(large.json.data.filter(row => row.entity_label === title).length, 50);
  const anonymous = await request({});
  assert.equal(anonymous.status, 401);
  assert.deepEqual(anonymous.json, {error: {code: 'UNAUTHORIZED', message: '请先登录'}});
  const key = await app.request('/api/v1/api-keys', {method: 'POST', session: app.session,
    body: {name: 'Synthetic audit scope', account_ids: [app.account], permissions: ['read']}});
  assert.equal(key.status, 201);
  const forbidden = await request({Authorization: 'Bearer ' + key.data.token});
  assert.equal(forbidden.status, 403);
  assert.deepEqual(forbidden.json, {error: {code: 'FORBIDDEN', message: '此操作仅限网站管理员'}});
  for (const denied of [anonymous, forbidden]) {
    assert.equal(denied.queries.some(sql => /JOIN matrix_articles/.test(sql)), false);
    assert.equal(Object.hasOwn(denied.json, 'data'), false);
  }
});
