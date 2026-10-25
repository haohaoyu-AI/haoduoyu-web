// Candidate-only regression gate: no application API/model activation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyGraphCandidate} from './article-graph-migration.mjs';
import {GRAPH_NOW, GRAPH_TODAY, GRAPH_PIPELINE_FIELDS, graphStatisticsFixture,
  legacyGraphArticleProjection, graphPersistedRows} from './article-graph-statistics-fixture.mjs';

function routes(app) {
  const paths = ['/api/v1/accounts', '/api/v1/dashboard', '/api/v1/due-reviews',
    '/api/v1/articles', '/api/v1/articles?page=1&page_size=2', '/api/v1/articles?page=2&page_size=2',
    '/api/v1/articles?fields=index', '/api/v1/articles?fields=index&data_status=date_unverified',
    '/api/v1/articles?sort=reads&order=desc', '/api/v1/articles?sort=duration&order=asc',
    '/api/v1/observations', '/api/v1/daily-metrics?from=2026-09-01&to=2026-10-23',
    '/api/v1/todos?date=' + GRAPH_TODAY, '/api/v1/todo-templates', '/api/v1/todo-preferences'];
  for (const period of ['yesterday', '7d', '30d']) {
    paths.push('/api/v1/overview?period=' + period);
    for (const {id} of app.accounts) paths.push('/api/v1/overview?period=' + period + '&account_id=' + encodeURIComponent(id));
  }
  paths.push('/api/v1/overview?period=30d&top_n=2&top_platform=wechat');
  for (const {id} of app.accounts) {
    const scope = '?account_id=' + encodeURIComponent(id);
    for (const path of ['dashboard', 'due-reviews', 'observations', 'daily-metrics']) paths.push('/api/v1/' + path + scope);
  }
  for (const {id} of Object.values(app.articles)) paths.push('/api/v1/articles/' + encodeURIComponent(id));
  return paths;
}

async function capture(app, paths, phase) {
  const responses = {};
  for (const path of paths) {
    const response = await app.request(path, {phase});
    assert.equal(response.status, 200, path + ': ' + response.text);
    assert.equal(response.headers.get('X-Synthetic-Graph-Clock'), GRAPH_NOW, 'Workerd clock must actually be frozen');
    responses[path] = {status: response.status, json: legacyGraphArticleProjection(response.json)};
  }
  return responses;
}

test('candidate graph replacement preserves every legacy statistic and unrelated rows in the actual clocked Worker', async t => {
  const app = await graphStatisticsFixture(t), paths = routes(app);
  assert.equal(GRAPH_PIPELINE_FIELDS.length, 17);
  const rowsBefore = await graphPersistedRows(app.db);
  assert.equal(Object.keys(rowsBefore).length, 16);
  assert.equal(rowsBefore.matrix_observations.length, 4);
  assert.equal(rowsBefore.matrix_daily_metrics.length, 10);
  assert.equal(rowsBefore.matrix_todos.length, 1);
  assert.equal(rowsBefore.matrix_daily_notes.length, 1);
  const before = await capture(app, paths, 'before');
  const yesterday = before['/api/v1/overview?period=yesterday'].json.data;
  assert.equal(yesterday.window.to, '2026-10-23');
  assert.equal(yesterday.cumulative.article_count, 5);
  assert.equal(yesterday.cumulative.totals.reads, 75);
  assert.equal(yesterday.cumulative.data_article_count, 3);
  assert.equal(yesterday.cumulative.no_snapshot_count, 2);
  assert.equal(yesterday.accounts.find(row => row.id === app.account('toutiao')).period_metrics.reads, 20);
  assert.equal(yesterday.platform_comparison.find(row => row.platform === 'zhihu').totals.reads, 0);
  assert.equal(yesterday.series.highest_recorded, 3);
  assert.equal(before['/api/v1/dashboard'].json.data.window.to, GRAPH_TODAY);
  assert.equal(before['/api/v1/todos?date=' + GRAPH_TODAY].json.data.today, GRAPH_TODAY);
  assert.ok(before['/api/v1/due-reviews'].json.data.length > 0);

  await applyGraphCandidate(app.db);

  // The after view is an independent instance of the exact same product bundle,
  // so an old overview cache cannot turn a broken migration into a false pass.
  const after = await capture(app, paths, 'after');
  for (const path of paths) assert.deepEqual(after[path], before[path], 'legacy API changed: ' + path);
  assert.deepEqual(await graphPersistedRows(app.db), rowsBefore);
  assert.deepEqual((await app.db.prepare('PRAGMA foreign_key_check').all()).results, []);
  assert.equal(Object.values((await app.db.prepare('PRAGMA quick_check').all()).results[0])[0], 'ok');
  t.diagnostic('Actual Workerd before/after modules; frozen Beijing-noon clock; ' + paths.length +
    ' legacy responses identical; 16 table row sets preserved; no statistical values projected or tolerated.');
});
