// Isolated synthetic fixture. Product source, the original harness and build
// output stay untouched. Both views run the real bundle inside Workerd.
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fixture} from './harness.mjs';

export const GRAPH_NOW = '2026-10-24T04:00:00.000Z';
export const GRAPH_TODAY = '2026-10-24';
export const GRAPH_PIPELINE_FIELDS = Object.freeze([
  'status', 'slot', 'run_dir', 'run_date', 'series_no', 'writer', 'illustrator', 'sample_json',
  'char_count', 'subheading_count', 'image_count', 'cover_desc', 'draft_ref_json',
  'timings_json', 'reruns_json', 'blockers_json', 'verify_items_json',
]);
const base = '/api/v1';

function clockWrapper() {
  return [
    'import before from "./before.mjs";',
    'import after from "./after.mjs";',
    'const NativeDate = Date;',
    'const instant = NativeDate.parse(' + JSON.stringify(GRAPH_NOW) + ');',
    'globalThis.Date = class extends NativeDate {',
    '  constructor(...args) { super(...(args.length ? args : [instant])); }',
    '  static now() { return instant; }',
    '};',
    'export default {async fetch(request, env, ctx) {',
    '  const worker = request.headers.get("X-Synthetic-Graph-View") === "after" ? after : before;',
    '  const response = await worker.fetch(request, env, ctx);',
    '  const copy = new Response(response.body, response);',
    '  copy.headers.set("X-Synthetic-Graph-Clock", new Date().toISOString());',
    '  return copy;',
    '}};',
  ].join('\n');
}

export async function graphStatisticsFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'synthetic-article-graph-stats-'));
  let app;
  t.after(async () => {
    try {await app?.mf.dispose();}
    finally {await rm(directory, {recursive: true, force: true});}
  });
  const bundle = await readFile(new URL('../dist/server/index.js', import.meta.url));
  // Distinct module instances prevent the pre-migration overview cache from
  // masking a post-migration change when the candidate keeps revision intact.
  await writeFile(join(directory, 'before.mjs'), bundle);
  await writeFile(join(directory, 'after.mjs'), bundle);
  const entry = join(directory, 'entry.mjs');
  await writeFile(entry, clockWrapper());
  const previous = process.env.TEST_WORKER_PATH;
  try {
    process.env.TEST_WORKER_PATH = entry;
    app = await fixture(null, {migrationCount: 5, persist: false});
  } finally {
    if (previous === undefined) delete process.env.TEST_WORKER_PATH;
    else process.env.TEST_WORKER_PATH = previous;
  }
  const session = await app.login();
  const request = (path, {phase = 'before', headers = {}, ...options} = {}) =>
    app.request(path, {...options, session, headers: {...headers, 'X-Synthetic-Graph-View': phase}});
  const create = async (path, body) => {
    const response = await request(base + path, {method: 'POST', body});
    assert.equal(response.status, 201, response.text); return response.data;
  };
  const accounts = (await request(base + '/accounts')).data;
  const account = platform => accounts.find(value => value.platform === platform).id;
  const definitions = [
    ['a', 'toutiao', '合成已发布甲', '2026-10-01T01:00:00Z', '2026-10-01T00:00:00Z', 'manual', ''],
    ['b', 'toutiao', '合成已发布乙', '2026-10-20T01:00:00Z', null, 'unknown', '[date-unverified]'],
    ['c', 'zhihu', '合成真实零指标', '2026-10-22T01:00:00Z', null, 'automatic', ''],
    ['d', 'wechat', '【保险200篇·第3篇】合成进度', '2026-10-22T01:00:00Z', '2026-10-21T23:00:00Z', 'mixed', ''],
    ['e', 'wechat', '【保险200篇·第1篇】合成旧文章', '2026-09-20T01:00:00Z', null, 'manual', ''],
  ];
  const articles = {};
  for (const [key, platform, title, published_at, started_at, production_mode, notes] of definitions) {
    articles[key] = await create('/articles', {account_id: account(platform), title,
      url: 'https://example.invalid/graph-statistics/' + key, published_at, started_at, production_mode, notes});
  }
  for (const [key, as_of, kind, metrics] of [
    ['a', '2026-10-22T02:00:00Z', 'latest', {reads: 10, likes: 2, comments: 0}],
    ['a', '2026-10-23T02:00:00Z', 'latest', {reads: 25, likes: 4, comments: 1}],
    ['c', '2026-10-23T02:00:00Z', 'latest', {reads: 0, likes: 0, comments: 0, approvals: 3}],
    ['d', '2026-10-23T02:00:00Z', 'd1', {reads: 50, likes: 5, comments: 1}],
  ]) await create('/observations', {article_id: articles[key].id, as_of, collected_at: as_of,
    kind, metrics, source: 'synthetic graph statistics', note: '隔离测试'});
  for (const [platform, key, date, reads] of [
    ['toutiao', null, '2026-10-23', 20], ['toutiao', 'a', '2026-10-23', 6],
    ['toutiao', 'b', '2026-10-23', 5], ['toutiao', 'a', '2026-10-22', 4],
    ['toutiao', 'b', '2026-10-22', 3], ['zhihu', 'c', '2026-10-23', 0],
    ['zhihu', null, '2026-10-22', 0], ['wechat', 'd', '2026-10-23', 7],
    ['wechat', 'd', '2026-10-22', 2], ['wechat', 'e', '2026-09-21', 3],
  ]) await create('/daily-metrics', {account_id: account(platform), ...(key ? {article_id: articles[key].id} : {}),
    date, metrics: {reads, likes: 0, comments: 0}, source: 'synthetic graph statistics'});
  const todo = await create('/todos', {id: randomUUID(), date: GRAPH_TODAY, text: '合成待办保持原样'});
  const completed = await request(base + '/todos/' + todo.id, {method: 'PATCH', body: {completed: true, version: 1}});
  assert.equal(completed.status, 200, completed.text);
  const owner = (await request(base + '/auth/me')).data.id;
  await app.db.prepare(
    'INSERT INTO matrix_daily_notes(user_id,date,text,version,change_seq,created_at,updated_at) VALUES(?,?,?,1,1,?,?)'
  ).bind(owner, GRAPH_TODAY, '合成碎碎念保持原样', GRAPH_NOW, GRAPH_NOW).run();
  return {...app, request, accounts, articles, account};
}

// Only newly added columns of actual article-shaped objects may be projected.
// Counts, coverage, comparisons, missing values, zeroes and array order stay exact.
export function legacyGraphArticleProjection(value) {
  if (Array.isArray(value)) return value.map(legacyGraphArticleProjection);
  if (!value || typeof value !== 'object') return value;
  const article = Object.hasOwn(value, 'id') && Object.hasOwn(value, 'account_id') && Object.hasOwn(value, 'title');
  return Object.fromEntries(Object.entries(value).filter(([key]) => !article || !GRAPH_PIPELINE_FIELDS.includes(key))
    .map(([key, item]) => [key, legacyGraphArticleProjection(item)]));
}

export async function graphPersistedRows(db) {
  const tables = (await db.prepare(
    "SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'matrix_%' ORDER BY name"
  ).all()).results;
  const rows = {};
  for (const {name} of tables) {
    assert.match(name, /^matrix_[a-z_]+$/);
    rows[name] = legacyGraphArticleProjection((await db.prepare('SELECT * FROM ' + name + ' ORDER BY rowid').all()).results);
  }
  return rows;
}
