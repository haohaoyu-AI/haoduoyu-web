import assert from 'node:assert/strict';

export const BENCHMARK = Object.freeze({seed: 104729, now: '2026-10-22T08:00:00.000Z',
  articles: 5000, snapshotsPerArticle: 4, dailyPerArticle: 10, warmupRounds: 2, measuredRounds: 10});
export const ROUTES = ['/api/v1/overview', '/api/v1/articles?page=1', '/api/v1/articles?sort=reads'];

// SQL bulk loading is fixture setup only, never a product fast path. Values are
// synthetic and parameterized; the benchmark runner fixes the full 5000 scale.
export async function seedBenchmark(db, accountIds, {articles = BENCHMARK.articles, seed = BENCHMARK.seed,
  now = BENCHMARK.now, progress = () => {}} = {}) {
  assert.ok(Number.isInteger(articles) && articles > 0 && articles <= BENCHMARK.articles);
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 2147483647);
  assert.equal(new Date(now).toISOString(), now);
  assert.equal(accountIds.length, 3);assert.equal(new Set(accountIds).size, 3);
  for (const table of ['articles', 'observations', 'daily_metrics'])
    assert.equal((await db.prepare('SELECT count(*) AS n FROM matrix_' + table).first()).n, 0, 'fixture must be empty');
  const sequence = `WITH RECURSIVE seq(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM seq WHERE i+1<?),
    seeded AS (SELECT i,(i*31+?)%997 AS r FROM seq)`;
  const owner = 'CASE i%3 WHEN 0 THEN ? WHEN 1 THEN ? ELSE ? END';
  await db.prepare(`${sequence} INSERT INTO matrix_articles
    (id,account_id,title,url,published_at,started_at,production_mode,notes,created_at,updated_at)
    SELECT 'bench-article-'||i,${owner},
    CASE WHEN i%3=2 AND i%41=0 THEN '【保险200篇·第'||(i%200+1)||'篇】虚构基准文章 '||i ELSE '虚构基准文章 '||i END,
    'https://example.invalid/benchmark/'||i,
    strftime('%Y-%m-%dT%H:%M:%fZ',?,'-'||(12+i%30)||' days'),
    strftime('%Y-%m-%dT%H:%M:%fZ',?,'-'||(12+i%30)||' days','-600 seconds'),
    CASE i%4 WHEN 0 THEN 'manual' WHEN 1 THEN 'automatic' WHEN 2 THEN 'mixed' ELSE 'unknown' END,
    CASE WHEN i%23=0 THEN '[date-unverified] synthetic fixture' ELSE 'synthetic fixture' END,?,? FROM seeded`)
    .bind(articles, seed, ...accountIds, now, now, now, now).run();
  progress('articles', articles);
  const metrics = `json_patch(CASE WHEN i%19=0 THEN json_object('reads',r+j*101,'comments',0)
    ELSE json_object('reads',r+j*101,'likes',j,'comments',0) END,
    CASE WHEN i%3=1 THEN json_object('approvals',j*2) ELSE '{}' END)`;
  await db.prepare(`${sequence}, kinds(j,kind) AS (VALUES(0,'d1'),(1,'d3'),(2,'d7'),(3,'latest'))
    INSERT INTO matrix_observations (id,article_id,as_of,collected_at,kind,metrics_json,source,note,created_at)
    SELECT 'bench-snapshot-'||i||'-'||j,'bench-article-'||i,
    strftime('%Y-%m-%dT%H:%M:%fZ',?,'-'||(4-j)||' days'),
    strftime('%Y-%m-%dT%H:%M:%fZ',?,'-'||(4-j)||' days'),kind,${metrics},
    'synthetic-benchmark','synthetic only',? FROM seeded CROSS JOIN kinds`)
    .bind(articles, seed, now, now, now).run();
  progress('observations', articles * BENCHMARK.snapshotsPerArticle);
  await db.prepare(`${sequence}, days(j) AS (VALUES(0),(1),(2),(3),(4),(5),(6),(7),(8),(9))
    INSERT INTO matrix_daily_metrics (id,account_id,article_id,date,metrics_json,source,updated_at)
    SELECT 'bench-daily-'||i||'-'||j,${owner},'bench-article-'||i,
    strftime('%Y-%m-%d',?,'+8 hours','-'||(j+1)||' days'),
    json_patch(json_object('reads',(r+j)%17,'likes',j%2,'comments',0),
      CASE WHEN i%3=1 THEN json_object('approvals',j%3) ELSE '{}' END),
    'synthetic-benchmark',? FROM seeded CROSS JOIN days`).bind(articles, seed, ...accountIds, now, now).run();
  progress('daily_metrics', articles * BENCHMARK.dailyPerArticle);
  const counts = {};
  for (const table of ['articles', 'observations', 'daily_metrics'])
    counts[table] = (await db.prepare('SELECT count(*) AS n FROM matrix_' + table).first()).n;
  assert.deepEqual(counts, {articles, observations: articles * 4, daily_metrics: articles * 10});
  return counts;
}

export function summarize(samples) {
  const quantile = (sorted, p) => {
    const index = (sorted.length - 1) * p, low = Math.floor(index), high = Math.ceil(index);
    return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
  };
  return Object.fromEntries(ROUTES.map(route => {
    const selected = samples.filter(row => row.phase === 'measured' && row.route === route);
    const values = selected.filter(row => row.success).map(row => row.duration_ms).sort((a, b) => a - b);
    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    return [route, {successful: values.length, failed: selected.length - values.length,
      median_ms: values.length ? quantile(values, .5) : null, min_ms: values[0] ?? null,
      max_ms: values.at(-1) ?? null, mean_ms: mean,
      q1_ms: values.length ? quantile(values, .25) : null, q3_ms: values.length ? quantile(values, .75) : null,
      stddev_ms: values.length ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) : null}];
  }));
}
