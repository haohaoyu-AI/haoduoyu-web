import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {commit, storeFor, revision} from '../src/storage.mjs';

const stamp = '2001-01-01T00:00:00Z';
async function setup(t) {
  const app = await fixture(t);
  app.session = await app.login();
  app.account = (await app.request('/api/v1/accounts', {session: app.session})).data[0].id;
  return app;
}
const input = (account, name) => ({account_id: account, title: '虚构约束样本 ' + name,
  url: 'https://example.invalid/commit/' + name, platform_article_id: name, published_at: stamp});
const insertArticle = (app, id, value) => app.db.prepare(
  'INSERT INTO matrix_articles(id,account_id,title,url,platform_article_id,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
).bind(id, app.account, '虚构批次内冲突', value.url, value.platform_article_id, stamp, stamp, stamp);
async function snapshot(app) {
  const articles = (await app.db.prepare('SELECT * FROM matrix_articles ORDER BY id').all()).results;
  const counts = {};
  for (const table of ['audit', 'idempotency']) {
    counts[table] = (await app.db.prepare('SELECT count(*) AS n FROM matrix_' + table).first()).n;
  }
  return {articles, counts, revision: await revision(app.db)};
}
async function injectedRequest(app, path, method, body, injected, key = 'synthetic-commit-key') {
  const diagnostics = [];
  let batches = 0;
  const db = {prepare: sql => app.db.prepare(sql), async batch(statements) {
    batches++;
    try {return await app.db.batch([...injected, ...statements]);}
    catch (error) {diagnostics.push(error.message);throw error;}
  }};
  const response = await worker.fetch(new Request(app.origin + '/api/v1' + path, {method,
    headers: {Cookie: app.session.cookie, 'X-CSRF-Token': app.session.csrfToken,
      Origin: app.origin, 'Content-Type': 'application/json', 'Idempotency-Key': key},
    body: JSON.stringify(body)}), {DB: db, SITE_ORIGIN: app.origin});
  return {status: response.status, json: await response.json(), diagnostics, batches};
}

test('real D1 article uniqueness failures occur after prechecks in create/update commit batches', async t => {
  for (const operation of ['create', 'update']) for (const kind of ['url', 'platform_article_id']) {
    await t.test(operation + ' ' + kind, async t => {
      const app = await setup(t);
      let original;
      if (operation === 'update') {
        const result = await app.request('/api/v1/articles', {session: app.session, method: 'POST', body: input(app.account, 'original')});
        assert.equal(result.status, 201);original = result.data;
      }
      const desired = input(app.account, 'desired-' + operation + '-' + kind);
      const collision = {...desired,
        url: kind === 'url' ? desired.url : desired.url + '-other',
        platform_article_id: kind === 'platform_article_id' ? desired.platform_article_id : desired.platform_article_id + '-other'};
      const before = await snapshot(app);
      const result = await injectedRequest(app, original ? '/articles/' + original.id : '/articles',
        original ? 'PUT' : 'POST', {...desired, ...(original ? {version: original.version} : {})},
        [insertArticle(app, 'synthetic-collision', collision)]);
      assert.equal(result.batches, 1, 'preflight reached actual commit and no revision retry concealed the failure');
      assert.equal(result.diagnostics.length, 1);
      assert.match(result.diagnostics[0], new RegExp('UNIQUE constraint failed: matrix_articles.account_id, matrix_articles.' + kind));
      t.diagnostic('actual D1 commit unique constraint: account_id + ' + kind + '; response=' + result.json.error.code);
      assert.deepEqual(await snapshot(app), before, 'failed batch must leave no article/audit/receipt/revision change');
      assert.equal(result.status, 409);
      assert.deepEqual(result.json, {error: {code: 'ARTICLE_EXISTS', message: '该平台文章或链接已经登记'}});
      const retry = await app.request('/api/v1' + (original ? '/articles/' + original.id : '/articles'),
        {session: app.session, method: original ? 'PUT' : 'POST',
          body: {...desired, ...(original ? {version: original.version} : {})},
          headers: {'Idempotency-Key': 'synthetic-commit-key'}});
      assert.equal(retry.status, original ? 200 : 201);
      const after = await snapshot(app);
      assert.equal(after.revision, before.revision + 1);
      assert.equal(after.counts.audit, before.counts.audit + 1);
      assert.equal(after.counts.idempotency, before.counts.idempotency + 1);
      assert.equal(retry.data.version, original ? original.version + 1 : 1);
      const replay = await app.request('/api/v1' + (original ? '/articles/' + original.id : '/articles'),
        {session: app.session, method: original ? 'PUT' : 'POST',
          body: {...desired, ...(original ? {version: original.version} : {})},
          headers: {'Idempotency-Key': 'synthetic-commit-key'}});
      assert.equal(replay.status, retry.status);assert.deepEqual(replay.data, retry.data);
      assert.deepEqual(await snapshot(app), after, 'successful replay must not write another audit, receipt or revision');
    });
  }
});

test('real non-article unique constraints retain DUPLICATE and atomic rollback', async t => {
  for (const table of ['accounts', 'audit']) await t.test(table, async t => {
    const app = await setup(t);
    const injected = table === 'accounts'
      ? app.db.prepare('INSERT INTO matrix_accounts SELECT * FROM matrix_accounts LIMIT 1')
      : app.db.prepare('INSERT INTO matrix_audit SELECT * FROM matrix_audit LIMIT 1');
    const before = await snapshot(app);
    const result = await injectedRequest(app, '/articles', 'POST', input(app.account, 'non-article'), [injected]);
    assert.equal(result.batches, 1);
    assert.match(result.diagnostics[0], new RegExp('UNIQUE constraint failed: matrix_' + table + '.id'));
    assert.equal(result.status, 409);
    assert.deepEqual(result.json, {error: {code: 'DUPLICATE', message: '记录已存在，请检索后更新原记录'}});
    assert.deepEqual(await snapshot(app), before);
  });
});

test('ordinary concurrent registration remains atomic; existing preflight retries are not red evidence', async t => {
  const app = await setup(t), before = await snapshot(app), body = input(app.account, 'concurrent');
  const results = await Promise.all(['synthetic-concurrent-a', 'synthetic-concurrent-b'].map(key =>
    app.request('/api/v1/articles', {session: app.session, method: 'POST', body, headers: {'Idempotency-Key': key}})));
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  assert.equal(results.find(r => r.status === 409).json.error.code, 'ARTICLE_EXISTS');
  const after = await snapshot(app);
  assert.equal(after.articles.length, before.articles.length + 1);
  assert.equal(after.revision, before.revision + 1);
  assert.equal(after.counts.audit, before.counts.audit + 1);
  assert.equal(after.counts.idempotency, before.counts.idempotency + 1);
});

test('commit rethrows unrelated errors by identity, including misleading article text', async () => {
  for (const message of [
    'D1_ERROR: UNIQUE constraint failed: matrix_accounts.id: SQLITE_CONSTRAINT',
    'D1_ERROR: UNIQUE constraint failed: matrix_articles_archive.id: SQLITE_CONSTRAINT',
    'D1_ERROR: UNIQUE constraint failed: matrix_articles.unknown_column: SQLITE_CONSTRAINT',
    'D1_ERROR: UNIQUE constraint failed: matrix_articles.id, matrix_accounts.id: SQLITE_CONSTRAINT',
    'D1_ERROR: UNIQUE constraint failed: matrix_articles.id: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_TRIGGER)',
    'D1_ERROR: UNIQUE constraint failed: matrix_articles.account_id, matrix_articles.url: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_PRIMARYKEY)',
    'synthetic wrapper: UNIQUE constraint failed: matrix_articles.id',
    'network failure mentioning matrix_articles',
    'D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT',
  ]) {
    const expected = new Error(message);
    const db = {prepare: () => ({bind() {return this;}}), batch: async () => {throw expected;}};
    await assert.rejects(commit(db, 1, {pending: []}), error => error === expected);
  }
});

test('already classified errors retain their original status and identity', async () => {
  const expected = Object.assign(new Error('D1_ERROR: UNIQUE constraint failed: matrix_articles.id: SQLITE_CONSTRAINT'),
    {status: 503, code: 'SYNTHETIC_UNAVAILABLE'});
  const db = {prepare: () => ({bind() {return this;}}), batch: async () => {throw expected;}};
  await assert.rejects(commit(db, 1, {pending: []}), error => error === expected);
});

test('real article primary-key uniqueness in commit maps narrowly without partial writes', async t => {
  const app = await setup(t);
  const value = input(app.account, 'primary');
  await insertArticle(app, 'synthetic-fixed-id', value).run();
  const before = await snapshot(app), store = storeFor(app.db);
  store.queue('INSERT INTO articles(id,account_id,title,url,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
    'synthetic-fixed-id', app.account, '虚构主键冲突', value.url + '-different', stamp, stamp, stamp);
  await assert.rejects(commit(app.db, before.revision, store), error => {
    t.diagnostic('driver diagnostic: ' + error.message);
    assert.equal(error.status, 409);assert.equal(error.code, 'ARTICLE_EXISTS');
    assert.equal(error.message, '该平台文章或链接已经登记');return true;
  });
  assert.deepEqual(await snapshot(app), before);
});
