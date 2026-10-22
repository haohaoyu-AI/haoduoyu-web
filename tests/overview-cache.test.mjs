import {stylePolicyHeaders} from './style-policy-projection.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {countingDb} from './counting-d1.mjs';
import {BENCHMARK, seedBenchmark} from './bench-fixture.mjs';

async function fixed(at, operation) {
  const NativeDate = globalThis.Date;
  globalThis.Date = class extends NativeDate {
    constructor(...args) {super(...(args.length ? args : [at]));}static now() {return at;}
  };
  try {return await operation();} finally {globalThis.Date = NativeDate;}
}
async function prepared(t) {
  const app = await fixture(t);app.session = await app.login();
  const accounts = (await app.db.prepare('SELECT id,platform FROM matrix_accounts').all()).results;
  await seedBenchmark(app.db, ['toutiao', 'zhihu', 'wechat'].map(p => accounts.find(x => x.platform === p).id), {articles: 12});
  app.counted = countingDb(app.db);return app;
}
async function request(app, path = '/overview') {
  app.counted.entries.length = 0;
  const response = await worker.fetch(new Request(app.origin + '/api/v1' + path,
    {headers: {Cookie: app.session.cookie}}), {DB: app.counted, SITE_ORIGIN: app.origin});
  const body = await response.text();return {response, body, metrics: app.counted.totals()};
}

test('same-revision overview hot read retains full body and headers with authentication plus two control reads', async t => {
  const app = await prepared(t);
  await fixed(Date.parse(BENCHMARK.now), async () => {
    const cold = await request(app), hot = await request(app);
    assert.equal(cold.response.status, 200);assert.equal(hot.response.status, 200);
    assert.equal(hot.body, cold.body);assert.deepEqual([...hot.response.headers], [...cold.response.headers]);
    assert.equal(hot.metrics.sql, 3, 'hot request still performs real authentication and both revision checks');
    assert.equal(hot.metrics.control, 2);assert.equal(hot.metrics.write_statements, 0);
  });
});

// Real D1 hooks alter only the isolated fixture; no production injection hook exists.
import {cacheWorker} from './overview-cache-worker.mjs';
test('five unstable reads release pending reservations and never publish a reusable body', async t => {
  const app = await prepared(t), candidate = await cacheWorker(t);
  let controls = 0;
  app.counted = countingDb(app.db, {before: async sql => {
    if (/^SELECT revision FROM matrix_control/.test(sql) && ++controls % 2 === 1)
      await app.db.prepare('UPDATE matrix_control SET revision=revision+1 WHERE id=1').run();
  }});
  await fixed(Date.parse(BENCHMARK.now), async () => {
    const response = await candidate.default.fetch(new Request(app.origin + '/api/v1/overview',
      {headers: {Cookie: app.session.cookie}}), {DB: app.counted, SITE_ORIGIN: app.origin});
    assert.equal(response.status, 503);assert.equal((await response.json()).error.code, 'BUSY');
    const stats = candidate.overviewCache.stats();
    assert.equal(stats.aborted, 5);assert.equal(stats.bytes, 0);assert.equal(stats.pending, 0);
    assert.equal(stats.resident, 0);assert.equal(stats.leases, 0);
  });
});
test('stable hits still reauthenticate and a changed revision requires full recomputation', async t => {
  const app = await prepared(t);
  await fixed(Date.parse(BENCHMARK.now), async () => {
    const cold = await request(app);assert.equal(cold.response.status, 200);
    assert.equal((await request(app)).metrics.sql, 3);
    await app.db.prepare('UPDATE matrix_control SET revision=revision+1 WHERE id=1').run();
    const changed = await request(app);assert.equal(changed.response.status, 200);
    assert.ok(changed.metrics.sql > 3);assert.equal(changed.body, cold.body);
    await app.db.prepare('DELETE FROM matrix_sessions').run();
    const revoked = await request(app);assert.equal(revoked.response.status, 401);
    assert.equal(revoked.response.headers.get('cache-control'), 'no-store');
  });
});
test('C2 metadata failure discards both a pending miss and an existing hit lease', async t => {
  const app = await prepared(t), candidate = await cacheWorker(t);
  const account = (await app.request('/api/v1/accounts', {session: app.session})).data[0].id;
  const key = (await app.request('/api/v1/api-keys', {method: 'POST', session: app.session,
    body: {name: 'Synthetic cache reader', account_ids: [account], permissions: ['read']}})).data;
  const get = () => candidate.default.fetch(new Request(app.origin + '/api/v1/overview',
    {headers: {Authorization: 'Bearer ' + key.token}}), {DB: app.counted, SITE_ORIGIN: app.origin});
  const failUsage = () => app.db.prepare("CREATE TRIGGER synthetic_usage_failure BEFORE UPDATE OF last_used_at ON matrix_api_keys BEGIN SELECT RAISE(ABORT,'synthetic metadata failure'); END").run();
  await fixed(Date.parse(BENCHMARK.now), async () => {
    await failUsage();
    const failedMiss = await get();assert.equal(failedMiss.status, 500);await failedMiss.text();
    assert.equal(candidate.overviewCache.stats().bytes, 0);
    await app.db.prepare('DROP TRIGGER synthetic_usage_failure').run();
    const cold = await get();assert.equal(cold.status, 200);await cold.text();
    assert.equal(candidate.overviewCache.stats().resident, 1);
    await app.db.prepare('UPDATE matrix_api_keys SET last_used_at=NULL WHERE id=?').bind(key.id).run();
    await failUsage();
    const failedHit = await get();assert.equal(failedHit.status, 500);await failedHit.text();
    const stats = candidate.overviewCache.stats();
    assert.equal(stats.hits, 1);assert.equal(stats.servedHits, 0);
    assert.equal(stats.leases, 0);assert.equal(stats.pending, 0);
    candidate.overviewCache.clear();assert.equal(candidate.overviewCache.stats().bytes, 0);
  });
});

import {referenceWorker} from './overview-cache-reference.mjs';
test('baseline and candidate return identical complete overview bodies, headers and validation precedence', async t => {
  const app = await prepared(t), legacy = await referenceWorker(t), candidate = await cacheWorker(t);
  const originalDb = countingDb(app.db), newDb = countingDb(app.db);
  const cases = ['/overview', '/overview?period=7d&top_n=05', '/overview?period=30d&top_platform=zhihu',
    '/overview?top_n=1&top_n=5', '/overview?period=invalid&top_n=invalid',
    '/overview?account_id=missing&top_n=invalid', '/overview?top_n=0', '/overview?top_platform=invalid',
    '/overview?period=7d&period=30d', '/overview?unknown=synthetic-unused-query'];
  async function compare(path, authenticated = true) {
    const values = [];
    for (const [implementation, db] of [[legacy, originalDb], [candidate.default, newDb]]) {
      const response = await implementation.fetch(new Request(app.origin + '/api/v1' + path,
        {headers: authenticated ? {Cookie: app.session.cookie} : {}}), {DB: db, SITE_ORIGIN: app.origin});
      values.push({status: response.status, headers: [...stylePolicyHeaders(response.headers)], body: await response.text()});
    }
    assert.deepEqual(values[1], values[0], path);return values[1];
  }
  await fixed(Date.parse(BENCHMARK.now), async () => {
    for (const path of cases) {await compare(path);await compare(path);}
    await compare('/overview?period=7d&period=30d', false);
    await compare('/overview?period=invalid&top_n=invalid', false);
    // Purely synthetic account-level data coexists with article-level data.
    const row = await app.db.prepare('SELECT account_id,date FROM matrix_daily_metrics LIMIT 1').first();
    await app.db.prepare("INSERT INTO matrix_daily_metrics(id,account_id,article_id,date,metrics_json,source,updated_at) VALUES('synthetic-account-day',?,NULL,?,'{\"reads\":0,\"likes\":0,\"comments\":0}','manual',?)")
      .bind(row.account_id, row.date, BENCHMARK.now).run();
    await app.db.prepare('UPDATE matrix_control SET revision=revision+1 WHERE id=1').run();
    await compare('/overview?period=7d');await compare('/overview?period=7d');
    candidate.overviewCache.clear();
    // Admission denial returns the entire original JSON, never a partial body.
    const reserve = candidate.overviewCache.reserve;
    candidate.overviewCache.reserve = () => null;
    try {await compare('/overview?period=7d');} finally {candidate.overviewCache.reserve = reserve;}
    assert.equal(candidate.overviewCache.stats().bytes, 0);
  });
});
test('old/new full responses agree at day, due and insurance boundaries, rollback, mixed data and overflow', async t => {
  const app = await prepared(t), legacy = await referenceWorker(t), candidate = await cacheWorker(t);
  const dbs = [countingDb(app.db), countingDb(app.db)];
  const anchor = Date.parse(BENCHMARK.now), day = 86400000;
  async function compare(at) {
    const values = [];
    await fixed(at, async () => {
      for (const [i, implementation] of [legacy, candidate.default].entries()) {
        const response = await implementation.fetch(new Request(app.origin + '/api/v1/overview?period=7d',
          {headers: {Cookie: app.session.cookie}}), {DB: dbs[i], SITE_ORIGIN: app.origin});
        values.push({status: response.status, headers: [...stylePolicyHeaders(response.headers)], body: await response.text()});
      }
    });
    assert.deepEqual(values[1], values[0], 'exact old/new body at ' + at);return values[1];
  }
  const article = await app.db.prepare("SELECT id,account_id FROM matrix_articles WHERE account_id='wechat-xiaoyuer' LIMIT 1").first();
  assert.ok(article);
  await app.db.prepare('DELETE FROM matrix_observations WHERE article_id=?').bind(article.id).run();
  await app.db.prepare("UPDATE matrix_articles SET title='【保险200篇·第1篇】Synthetic boundary',notes='',published_at=? WHERE id=?")
    .bind(new Date(anchor).toISOString(), article.id).run();
  await app.db.prepare('UPDATE matrix_control SET revision=revision+1 WHERE id=1').run();
  // Start with a cold pre-boundary request, then exact/+1 hot-clock advancement.
  for (const edge of [anchor, anchor + day, anchor + 3 * day, anchor + 7 * day])
    for (const delta of [-1, 0, 1]) await compare(edge + delta);
  // The session is seven days long; retain an actual valid synthetic session for
  // testing the d7 branch rather than mistaking a 401 comparison for due coverage.
  await app.db.prepare("UPDATE matrix_sessions SET expires_at='2026-12-01T00:00:00.000Z'").run();
  await app.db.prepare('UPDATE matrix_control SET revision=revision+1 WHERE id=1').run();
  for (const delta of [-1, 0, 1]) await compare(anchor + 7 * day + delta);
  const midnight = Date.parse('2026-10-22T16:00:00.000Z');
  for (const at of [midnight - 1, midnight, midnight + 1, midnight - 1]) await compare(at);
  await app.db.prepare("UPDATE matrix_observations SET metrics_json='{\"reads\":9007199254740991}'").run();
  await app.db.prepare('UPDATE matrix_control SET revision=revision+1 WHERE id=1').run();
  const overflow = await compare(anchor);assert.equal(overflow.status, 422);
  assert.equal(JSON.parse(overflow.body).error.code, 'METRIC_OVERFLOW');
  assert.equal(candidate.overviewCache.stats().pending, 0);
  candidate.overviewCache.clear();assert.equal(candidate.overviewCache.stats().bytes, 0);
});
test('a request spanning a day edge keeps its original snapshot but cannot extend cache validity', async t => {
  const app = await prepared(t), legacy = await referenceWorker(t), candidate = await cacheWorker(t);
  const edge = Date.parse('2026-10-22T16:00:00.000Z'), NativeDate = globalThis.Date;
  let clock = edge - 1;
  globalThis.Date = class extends NativeDate {
    constructor(...args) {super(...(args.length ? args : [clock]));}static now() {return clock;}
  };
  try {
    const values = [];
    for (const implementation of [legacy, candidate.default]) {
      clock = edge - 1;
      const db = countingDb(app.db, {before: sql => {if (/FROM matrix_accounts\b/.test(sql)) clock = edge + 1;}});
      const response = await implementation.fetch(new Request(app.origin + '/api/v1/overview',
        {headers: {Cookie: app.session.cookie}}), {DB: db, SITE_ORIGIN: app.origin});
      values.push({status: response.status, headers: [...stylePolicyHeaders(response.headers)], body: await response.text()});
    }
    assert.deepEqual(values[1], values[0]);
    const stats = candidate.overviewCache.stats();
    assert.equal(stats.resident, 0);assert.equal(stats.bytes, 0);assert.equal(stats.stored, 0);
  } finally {globalThis.Date = NativeDate;}
});
test('a discarded hot hit reauthenticates after a concurrent session revocation', async t => {
  const app = await prepared(t), candidate = await cacheWorker(t);
  let armed = false, changed = false;
  app.counted = countingDb(app.db, {before: async sql => {
    if (armed && !changed && /^SELECT revision FROM matrix_control/.test(sql)) {
      changed = true;
      await app.db.batch([app.db.prepare('DELETE FROM matrix_sessions'),
        app.db.prepare('UPDATE matrix_control SET revision=revision+1 WHERE id=1')]);
    }
  }});
  const get = () => candidate.default.fetch(new Request(app.origin + '/api/v1/overview',
    {headers: {Cookie: app.session.cookie}}), {DB: app.counted, SITE_ORIGIN: app.origin});
  await fixed(Date.parse(BENCHMARK.now), async () => {
    const cold = await get();assert.equal(cold.status, 200);await cold.text();armed = true;
    const response = await get();assert.equal(response.status, 401);await response.text();
    const stats = candidate.overviewCache.stats();
    assert.equal(stats.hits, 1);assert.equal(stats.servedHits, 0);assert.equal(stats.leases, 0);
    assert.equal(stats.aborted, 1);candidate.overviewCache.clear();assert.equal(candidate.overviewCache.stats().bytes, 0);
  });
});
test('a retry samples a fresh clock after crossing midnight and releases the first pending result', async t => {
  const app = await prepared(t), legacy = await referenceWorker(t), candidate = await cacheWorker(t);
  const edge = Date.parse('2026-10-22T16:00:00.000Z'), NativeDate = globalThis.Date;
  let clock = edge - 1;
  globalThis.Date = class extends NativeDate {
    constructor(...args) {super(...(args.length ? args : [clock]));}static now() {return clock;}
  };
  try {
    const values = [];
    for (const implementation of [legacy, candidate.default]) {
      clock = edge - 1;let changed = false;
      const db = countingDb(app.db, {before: async sql => {
        if (!changed && /^SELECT revision FROM matrix_control/.test(sql)) {
          changed = true;clock = edge;
          await app.db.prepare('UPDATE matrix_control SET revision=revision+1 WHERE id=1').run();
        }
      }});
      const response = await implementation.fetch(new Request(app.origin + '/api/v1/overview',
        {headers: {Cookie: app.session.cookie}}), {DB: db, SITE_ORIGIN: app.origin});
      values.push({status: response.status, headers: [...stylePolicyHeaders(response.headers)], body: await response.text()});
    }
    assert.deepEqual(values[1], values[0]);assert.equal(values[1].status, 200);
    const stats = candidate.overviewCache.stats();
    assert.equal(stats.aborted, 1);assert.equal(stats.pending, 0);assert.equal(stats.leases, 0);
    assert.equal(stats.resident, 1);candidate.overviewCache.clear();assert.equal(candidate.overviewCache.stats().bytes, 0);
  } finally {globalThis.Date = NativeDate;}
});
test('real scoped keys cannot reuse another identity, empty scope or removed read permission', async t => {
  const app = await prepared(t), candidate = await cacheWorker(t);
  const accounts = (await app.request('/api/v1/accounts', {session: app.session})).data;
  const keys = [];
  for (const [i, account] of accounts.slice(0, 2).entries()) keys.push((await app.request('/api/v1/api-keys',
    {method: 'POST', session: app.session, body: {name: 'Synthetic scope ' + i,
      account_ids: [account.id], permissions: ['read']}})).data);
  async function get(token) {
    const response = await candidate.default.fetch(new Request(app.origin + '/api/v1/overview',
      {headers: {Authorization: 'Bearer ' + token}}), {DB: app.counted, SITE_ORIGIN: app.origin});
    return {status: response.status, body: await response.json()};
  }
  await fixed(Date.parse(BENCHMARK.now), async () => {
    const first = await get(keys[0].token), second = await get(keys[1].token);
    assert.equal(first.status, 200);assert.equal(second.status, 200);
    assert.equal(first.body.data.cumulative.article_count, 4);assert.equal(second.body.data.cumulative.article_count, 4);
    assert.notDeepEqual(first.body, second.body);assert.equal(candidate.overviewCache.stats().resident, 2);
    assert.deepEqual((await get(keys[0].token)).body, first.body);
    await app.db.prepare("UPDATE matrix_api_keys SET account_ids_json='[]' WHERE id=?").bind(keys[0].id).run();
    // Authorization is independently checked on a hot revision, not inferred from a cache key.
    const empty = await get(keys[0].token);assert.equal(empty.status, 200);
    assert.equal(empty.body.data.cumulative.article_count, 0);
    await app.db.prepare("UPDATE matrix_api_keys SET permissions_json='[]' WHERE id=?").bind(keys[0].id).run();
    assert.equal((await get(keys[0].token)).status, 403);
    await app.db.prepare('UPDATE matrix_api_keys SET revoked_at=? WHERE id=?').bind(BENCHMARK.now, keys[1].id).run();
    assert.equal((await get(keys[1].token)).status, 401);
    assert.equal(candidate.overviewCache.stats().leases, 0);candidate.overviewCache.clear();
  });
});
