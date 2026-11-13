import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.mjs';
import { createRecords } from '../src/records.mjs';

function setup(t) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  return createRecords(db);
}

function publishedArticle(records, account, overrides = {}) {
  return records.createArticle({
    account_id: account.id,
    title: '已成功发布的测试文章',
    url: `https://example.com/${crypto.randomUUID()}`,
    published_at: new Date(Date.now() - 86400000).toISOString(),
    ...overrides,
  });
}

test('search performs literal matching for Chinese, LIKE wildcards, backslash and its own escape character', t => {
  const records = setup(t), account = records.listAccounts()[0];
  const chinese = publishedArticle(records, account, { title: '测试文章' });
  const literal = publishedArticle(records, account, { title: '字面100%_\\结果' });
  const wildcardControl = publishedArticle(records, account, { title: '字面100ABX结果' });
  const bang = publishedArticle(records, account, { title: '字面!百分号' });
  const summary = publishedArticle(records, account, { title: '概况命中', summary: '摘要中的100%_\\文字' });
  const notes = publishedArticle(records, account, { title: '备注命中', notes: '备注中的100%_\\文字' });
  assert.deepEqual(records.listArticles({ q: '测试' }).map(row => row.id), [chinese.id]);
  for (const q of ['100%_\\', '%', '_', '\\']) {
    const ids = records.listArticles({ q }).map(row => row.id);
    assert.deepEqual(new Set(ids), new Set([literal.id, summary.id, notes.id]));
    assert.ok(!ids.includes(wildcardControl.id));
  }
  assert.deepEqual(records.listArticles({ q: '!' }).map(row => row.id), [bang.id]);
  assert.deepEqual(records.listArticles({ q: '不存在' }), []);
});

test('search cannot disclose articles outside the caller account scope', t => {
  const records = setup(t), [first, second] = records.listAccounts();
  const allowed = publishedArticle(records, first, { title: '相同测试' });
  publishedArticle(records, second, { title: '相同测试' });
  assert.deepEqual(records.listArticles({ q: '相同测试' }, [first.id]).map(row => row.id), [allowed.id]);
  assert.deepEqual(records.listArticles({ q: '相同测试' }, []), []);
});

test('deactivated accounts reject new articles while historical review remains available', t => {
  const records = setup(t), [first, second] = records.listAccounts();
  const existing = publishedArticle(records, first);
  const other = publishedArticle(records, second);
  records.updateAccount(first.id, { active: false });
  assert.throws(() => publishedArticle(records, first), error => error.status === 409 && error.code === 'ACCOUNT_INACTIVE');
  assert.throws(() => records.updateArticle(other.id, { version: other.version, account_id: first.id }), error => error.code === 'ACCOUNT_INACTIVE');
  assert.equal(records.getArticle(existing.id).id, existing.id);
  assert.equal(records.updateArticle(existing.id, { version: existing.version, notes: '修正历史备注' }).notes, '修正历史备注');
  const observation = records.createObservation({ article_id: existing.id, as_of: new Date(Date.now() - 1000).toISOString(), kind: 'latest', metrics: { reads: 0 }, source: '测试来源' });
  assert.equal(observation.metrics.reads, 0);
});

test('daily article detail must belong to the selected authorized account', t => {
  const records = setup(t), [first, second] = records.listAccounts();
  const article = publishedArticle(records, first);
  const date = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const body = { account_id: second.id, article_id: article.id, date, metrics: { reads: 10 }, source: '平台按日数据' };
  assert.throws(() => records.upsertDaily(body), error => error.status === 400);
  assert.throws(() => records.upsertDaily(body, [second.id]), error => error.status === 403);
  assert.equal(records.listDaily().length, 0);
});

test('article recorder identities come from authorized audit history independently of production mode', t => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const records = createRecords(db), [first, second] = records.listAccounts();
  const article = publishedArticle(records, first, { production_mode: 'manual' });
  const unavailable = publishedArticle(records, second);
  assert.equal(records.getArticle(article.id).recorded_by, null);
  assert.equal(records.getArticle(article.id).last_modified_by, null);
  db.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run('owner-id', 'owner-name', 'unused-test-hash', '2026-01-01T00:00:00.000Z');
  db.prepare('INSERT INTO api_keys(id,name,token_hash,account_ids_json,permissions_json,created_at) VALUES(?,?,?,?,?,?)').run('grok-id', '授权 Grok', 'unused-token-hash', JSON.stringify([first.id]), '["read","write"]', '2026-01-01T00:00:00.000Z');
  const insert = db.prepare('INSERT INTO audit(id,actor,action,entity_id,detail_json,created_at) VALUES(?,?,?,?,?,?)');
  insert.run('create-event', 'user:owner-id', 'POST /articles', article.id, '{}', '2026-01-02T00:00:00.000Z');
  insert.run('update-event', 'key:grok-id', `PUT /articles/${article.id}`, article.id, '{}', '2026-01-03T00:00:00.000Z');
  insert.run('unrelated-event', 'key:grok-id', 'POST /observations', article.id, '{}', '2026-01-04T00:00:00.000Z');
  const detail = records.getArticle(article.id, [first.id]);
  assert.deepEqual(detail.recorded_by, { actor: 'user:owner-id', label: 'owner-name', at: '2026-01-02T00:00:00.000Z' });
  assert.deepEqual(detail.last_modified_by, { actor: 'key:grok-id', label: '授权 Grok', at: '2026-01-03T00:00:00.000Z' });
  assert.equal(detail.production_mode, 'manual');
  assert.throws(() => records.getArticle(unavailable.id, [first.id]), error => error.status === 403);
});
