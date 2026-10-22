import {stylePolicyHeaders} from './style-policy-projection.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {seedBenchmark} from './bench-fixture.mjs';
import {countingDb} from './counting-d1.mjs';
import {referenceWorker} from './overview-cache-reference.mjs';
import {mkdir, writeFile} from 'node:fs/promises';

const BASELINE = '0c5238d79551a807b35c0889ff69763bd04ae63e';
async function setup(t, articles = 180) {
  const app = await fixture(t);
  app.session = await app.login();
  const accounts = (await app.db.prepare('SELECT id,platform FROM matrix_accounts').all()).results;
  const ids = ['toutiao', 'zhihu', 'wechat'].map(p => accounts.find(a => a.platform === p).id);
  await seedBenchmark(app.db, ids, {articles});
  return app;
}
async function read(app, query, implementation = worker, headers = {Cookie: app.session.cookie}) {
  const receipts = [];
  const db = countingDb(app.db, {after(sql, result) {
    receipts.push({sql, rows: result.results?.length ?? 0,
      article_ids: /^SELECT a\.\*,/.test(sql) ? result.results.map(row => row.id) : [],
      snapshot_ids: /SELECT o\.article_id/.test(sql) ? result.results.map(row => row.article_id) : []});
  }});
  const response = await implementation.fetch(new Request(app.origin + '/api/v1/articles' + query, {headers}),
    {DB: db, SITE_ORIGIN: app.origin});
  const text = await response.text();
  return {status: response.status, headers: [...stylePolicyHeaders(response.headers)], body: JSON.parse(text), receipts,
    counts: db.totals()};
}
function contract(value) {return {status: value.status, headers: value.headers, body: value.body};}

test('C6 page query loads only the current article page and its snapshots', async t => {
  const app = await setup(t);
  const result = await read(app, '?page=1');
  assert.equal(result.status, 200);
  assert.equal(result.body.data.length, 20);
  assert.equal(result.body.meta.total, 180);
  const articles = result.receipts.flatMap(row => row.article_ids);
  const snapshots = result.receipts.flatMap(row => row.snapshot_ids);
  t.diagnostic(JSON.stringify({loaded_articles: articles.length, loaded_snapshots: snapshots.length,
    response_articles: result.body.data.length, d1: result.counts}));
  assert.equal(articles.length, 20, 'full article loading must be limited to the response page');
  assert.ok(result.receipts.some(row => /^SELECT a\.\*,/.test(row.sql) && /LIMIT \? OFFSET \?/.test(row.sql)));
  assert.deepEqual([...new Set(snapshots)].sort(), result.body.data.map(row => row.id).sort());
  assert.equal(result.counts.write_statements, 0);
});

test('C6 200 seeded query combinations match the unchanged baseline field for field', async t => {
  const app = await setup(t), baseline = await referenceWorker(t, BASELINE);
  await app.db.prepare("UPDATE matrix_articles SET title=? WHERE id='bench-article-1'")
    .bind('虚构 Unicode café 😀 100%_!\\ 样本').run();
  await app.db.prepare("DELETE FROM matrix_observations WHERE article_id='bench-article-2'").run();
  await app.db.prepare("UPDATE matrix_observations SET metrics_json=? WHERE article_id='bench-article-3'")
    .bind(JSON.stringify({reads: 0, approvals: 7})).run();
  let random = 61327;
  const pick = values => {random = (Math.imul(random, 1664525) + 1013904223) >>> 0;return values[random % values.length];};
  const samples = [];
  for (let n = 0; n < 200; n++) {
    const query = new URLSearchParams();
    if (n % 3 === 0) {query.set('limit', pick([1, 3, 20, 80, 200]));query.set('offset', pick([0, 1, 19, 60, 199, 9999]));}
    else {query.set('page', pick([1, 2, 3, 8, 100]));query.set('page_size', pick([1, 3, 20, 80, 200]));}
    query.set('sort', n % 4 ? 'published_at' : pick(['reads', 'likes', 'comments', 'approvals', 'duration', 'latest_as_of']));
    query.set('order', pick(['asc', 'desc']));
    for (const [key, values] of [
      ['platform', ['', '', 'zhihu', 'toutiao', 'wechat']],
      ['mode', ['', '', 'manual', 'automatic', 'unknown']],
      ['q', ['', '', '', '虚构', 'café', '%', '_', '!', '\\', 'no synthetic match']],
      ['account_id', ['', '', '', 'zhihu-haoduoyu', 'toutiao-haoduoyu']],
    ]) {const value = pick(values);if (value) query.set(key, value);}
    if (n % 11 === 0) query.set('topic', pick(['entertainment', 'insurance', 'unknown']));
    if (n % 13 === 0) query.set('data_status', pick(['date_unverified', 'no_snapshot', 'missing_likes', 'zero_reads']));
    if (n % 7 === 0) {query.set('from', '2026-09-15');query.set('to', '2026-10-05');}
    if (n % 17 === 0) query.set('fields', 'index');
    const path = '?' + query;
    const before = await read(app, path, baseline), after = await read(app, path);
    assert.deepEqual(contract(after), contract(before), 'seeded case ' + n + ': ' + path);
    assert.equal(after.counts.write_statements, 0);
    samples.push({case: n, query: path, status: after.status, equal: true,
      returned: after.body.data?.length ?? null, total: after.body.meta?.total ?? null,
      fast: after.receipts.some(row => /ORDER BY a\.published_at COLLATE BINARY/.test(row.sql)),
      before: before.counts, after: after.counts});
  }
  assert.ok(samples.filter(s => s.fast).length >= 50, 'random set must exercise the actual SQL path');
  assert.ok(samples.filter(s => s.fast && s.returned > 0).length >= 10, 'fast-path comparisons must include nonempty pages');
  assert.ok(samples.some(s => !s.fast && s.status === 200), 'fallback must also be exercised');
  await mkdir(new URL('../artifacts/perf/', import.meta.url), {recursive: true});
  await writeFile(new URL('../artifacts/perf/article-page-property.json', import.meta.url),
    JSON.stringify({baseline: BASELINE, seed: 61327, cases: samples.length, samples}, null, 2) + '\n');
  t.diagnostic('200 full-response comparisons; actual SQL fast paths: ' + samples.filter(s => s.fast).length);
});

test('C6 ties, raw dates, missing metrics, pagination extremes and validation retain the old contract', async t => {
  const app = await setup(t, 60), baseline = await referenceWorker(t, BASELINE);
  await app.db.prepare("DELETE FROM matrix_observations WHERE article_id='bench-article-0'").run();
  await app.db.prepare("UPDATE matrix_articles SET published_at=? WHERE id='bench-article-1'")
    .bind('2026-10-01T12:00:00+08:00').run();
  await app.db.prepare("UPDATE matrix_articles SET published_at='' WHERE id='bench-article-2'").run();
  // The current schema disallows null dates; do not weaken it to create a fixture.
  await assert.rejects(app.db.prepare("UPDATE matrix_articles SET published_at=NULL WHERE id='bench-article-3'").run(), /NOT NULL/);
  for (const query of ['?page=1', '?page=2&page_size=1', '?page=1&page_size=200&order=asc',
    '?limit=1&offset=1&order=asc', '?limit=200&offset=0', '?offset=9007199254740991',
    '?page=9007199254740991&page_size=1', '?page=9007199254740991&page_size=200',
    '?page=0', '?page_size=0', '?page_size=201', '?offset=-1', '?page=1&offset=0', '?page=',
    '?page=oops&platform=invalid', '?page=oops&sort=invalid', '?page=oops&topic=invalid',
    '?page=oops&data_status=invalid', '?page=1&from=2026-10-99', '?page=1&from=2026-10-02&to=2026-10-01',
    '?page=1&q=absent', '?page=1&sort=reads', '?page=1&topic=insurance', '?page=1&data_status=date_unverified',
    '?page=1&fields=index', '?page=1&fields=index&sort=reads', '?page=1&fields=unknown',
    '?page=1&order=asc&order=desc', '?page=1&page=2', '']) {
    assert.deepEqual(contract(await read(app, query)), contract(await read(app, query, baseline)), query);
  }
  const all = await read(app, '?page=1&page_size=200');
  assert.ok(all.body.data.some(row => row.latest_metrics === null));
  assert.ok(all.body.data.some(row => row.date_status === 'unverified'));
});

test('C6 incompatible identifiers or timestamp strings fall back before limiting any page', async t => {
  const app = await setup(t, 36), baseline = await referenceWorker(t, BASELINE);
  const stamp = '2001-01-01T08:00:00.000Z';
  for (const [id, date] of [['A', stamp], ['a_b', stamp], ['é', stamp], ['e\u0301', stamp],
    ['😀', stamp], ['abc\0hidden', stamp], ['safe-id', '日付'], ['safe-date', stamp + '\0hidden']]) {
    await app.db.prepare(`INSERT INTO matrix_articles
      (id,account_id,title,url,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`)
      .bind(id, 'zhihu-haoduoyu', '虚构排序边界', 'https://example.invalid/boundary/' + encodeURIComponent(id), date, stamp, stamp).run();
    const after = await read(app, '?page=1&page_size=3');
    const before = await read(app, '?page=1&page_size=3', baseline);
    assert.deepEqual(contract(after), contract(before));
    if (date === stamp) assert.ok(after.body.data.every(row => row.id !== id), 'incompatible ID must be outside this page');
    assert.equal(after.receipts.some(row => /ORDER BY a\.published_at COLLATE BINARY/.test(row.sql)), false);
    assert.equal(after.receipts.flatMap(row => row.article_ids).length, 37, 'incompatible row outside the page also disables SQL ordering');
    await app.db.prepare('DELETE FROM matrix_articles WHERE id=?').bind(id).run();
  }
});

test('C6 scoped and empty results keep totals, authorization precedence and index isolation', async t => {
  const app = await setup(t, 36), baseline = await referenceWorker(t, BASELINE);
  const key = (await app.request('/api/v1/api-keys', {method: 'POST', session: app.session,
    body: {name: 'Synthetic SQL page reader', account_ids: ['zhihu-haoduoyu'], permissions: ['read']}})).data;
  const headers = {Authorization: 'Bearer ' + key.token};
  for (const path of ['?page=1', '?page=9999', '?page=1&platform=toutiao',
    '?page=0&account_id=toutiao-haoduoyu', '?page=1&account_id=missing', '?page=1&fields=index']) {
    assert.deepEqual(contract(await read(app, path, worker, headers)), contract(await read(app, path, baseline, headers)));
  }
  const scoped = await read(app, '?page=1', worker, headers);
  assert.equal(scoped.body.meta.total, 12);assert.equal(scoped.body.meta.unfiltered_total, 12);
  assert.ok(scoped.body.data.every(row => row.account_id === 'zhihu-haoduoyu'));
  const index = await read(app, '?page=1&fields=index', worker, headers);
  assert.equal(index.receipts.some(row => /matrix_observations/.test(row.sql)), false);
  await app.db.prepare('UPDATE matrix_api_keys SET account_ids_json=? WHERE id=?').bind('[]', key.id).run();
  const empty = await read(app, '?page=1', worker, headers);
  assert.deepEqual(contract(empty), contract(await read(app, '?page=1', baseline, headers)));
  assert.deepEqual(empty.body.data, []);assert.equal(empty.body.meta.total, 0);assert.equal(empty.body.meta.unfiltered_total, 0);
  assert.equal((await read(app, '?page=1', worker, {})).status, 401);
});

test('C6 count/page race retries the entire authenticated read after a real business write', async t => {
  const app = await setup(t, 36);
  let inserted, fired = false;
  const db = countingDb(app.db, {async after(sql) {
    if (!fired && sql.includes('AS incompatible')) {
      fired = true;
      const result = await app.request('/api/v1/articles', {method: 'POST', session: app.session, body: {
        account_id: 'zhihu-haoduoyu', title: '虚构并发分页记录', url: 'https://example.invalid/page-race',
        published_at: '2026-10-11T00:00:00.000Z', production_mode: 'manual',
      }});
      assert.equal(result.status, 201);inserted = result.data.id;
    }
  }});
  const response = await worker.fetch(new Request(app.origin + '/api/v1/articles?page=1',
    {headers: {Cookie: app.session.cookie}}), {DB: db, SITE_ORIGIN: app.origin});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.meta.total, 37);assert.equal(body.meta.unfiltered_total, 37);
  assert.equal(body.data[0].id, inserted);
  assert.equal(db.entries.filter(row => row.sql.includes('AS incompatible')).length, 2);
  assert.equal(db.entries.filter(row => /FROM matrix_sessions\b/.test(row.sql)).length, 2);
  assert.equal(db.totals().write_statements, 0, 'concurrent write uses a separate authenticated request');
});

test('C6 malformed off-page latest metrics retain legacy errors before pagination validation', async t => {
  const app = await setup(t, 36), baseline = await referenceWorker(t, BASELINE);
  await app.db.prepare("UPDATE matrix_articles SET published_at='2001-01-01' WHERE id='bench-article-1'").run();
  const initial = await read(app, '?page=1&page_size=3');
  assert.ok(initial.body.data.every(row => row.id !== 'bench-article-1'));
  const valid = (await app.db.prepare("SELECT metrics_json FROM matrix_observations WHERE id='bench-snapshot-1-3'").first()).metrics_json;
  for (const metrics of ['{', 'null\0trailing', new Uint8Array([123, 125])]) {
    await app.db.prepare("UPDATE matrix_observations SET metrics_json=? WHERE id='bench-snapshot-1-3'").bind(metrics).run();
    for (const query of ['?page=1&page_size=3', '?page=0', '?page=oops', '?page=9999']) {
      const before = await read(app, query, baseline), after = await read(app, query);
      assert.equal(before.status, 500, 'the baseline must actually reject this stored value');
      assert.deepEqual(contract(after), contract(before), 'malformed latest metrics: ' + query);
      assert.equal(after.receipts.some(row => /ORDER BY a\.published_at COLLATE BINARY/.test(row.sql)), false);
      assert.equal(after.counts.write_statements, 0);
    }
    const excluded = '?page=1&platform=toutiao';
    const after = await read(app, excluded);
    assert.deepEqual(contract(after), contract(await read(app, excluded, baseline)));
    assert.equal(after.status, 200);
    assert.ok(after.receipts.some(row => /ORDER BY a\.published_at COLLATE BINARY/.test(row.sql)));
  }
  await app.db.prepare("UPDATE matrix_observations SET metrics_json=? WHERE id='bench-snapshot-1-3'").bind(valid).run();
  await app.db.prepare("UPDATE matrix_observations SET metrics_json='{' WHERE id='bench-snapshot-1-2'").run();
  const historical = await read(app, '?page=1');
  assert.deepEqual(contract(historical), contract(await read(app, '?page=1', baseline)));
  assert.equal(historical.status, 200, 'an older malformed snapshot was never parsed by the old list');
  assert.ok(historical.receipts.some(row => /ORDER BY a\.published_at COLLATE BINARY/.test(row.sql)));
  for (const [id, status] of [['aaa-tied-snapshot', 200], ['zzz-tied-snapshot', 500]]) {
    await app.db.prepare(`INSERT INTO matrix_observations
      (id,article_id,as_of,collected_at,kind,metrics_json,source,note,created_at)
      SELECT ?,article_id,as_of,collected_at,kind,'{',source,note,created_at
      FROM matrix_observations WHERE id='bench-snapshot-1-3'`).bind(id).run();
    const after = await read(app, '?page=1');
    assert.deepEqual(contract(after), contract(await read(app, '?page=1', baseline)));
    assert.equal(after.status, status, 'tied timestamps must retain descending snapshot ID selection');
    assert.equal(after.receipts.some(row => /ORDER BY a\.published_at COLLATE BINARY/.test(row.sql)), status === 200);
    await app.db.prepare('DELETE FROM matrix_observations WHERE id=?').bind(id).run();
  }
});

test('C6 valid non-object JSON metrics preserve their existing values without disabling SQL paging', async t => {
  const app = await setup(t, 36), baseline = await referenceWorker(t, BASELINE);
  await app.db.prepare("UPDATE matrix_articles SET published_at='2026-10-11' WHERE id='bench-article-1'").run();
  for (const metrics of ['null', '0', 'true', '"synthetic"', '[]', '[1]', '{"reads":null}', '{"reads":1e999}']) {
    await app.db.prepare("UPDATE matrix_observations SET metrics_json=? WHERE id='bench-snapshot-1-3'").bind(metrics).run();
    const after = await read(app, '?page=1&page_size=3');
    assert.deepEqual(contract(after), contract(await read(app, '?page=1&page_size=3', baseline)));
    assert.equal(after.status, 200);
    assert.equal(after.body.data[0].id, 'bench-article-1');
    assert.ok(after.receipts.some(row => /ORDER BY a\.published_at COLLATE BINARY/.test(row.sql)));
  }
});
