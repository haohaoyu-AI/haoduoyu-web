import { fail } from './lib/errors.mjs';
// Async D1 port of the preserved Node business contract. Writes are planned, then atomically committed by storage.mjs.
import { createHash, randomUUID } from 'node:crypto';
import { buildOverview, overviewWindow } from './overview.mjs';
import { articleFacts, cumulativeOverview, paginate, snapshotTimeline } from './analytics.mjs';

const METRICS = new Set(['reads', 'impressions', 'likes', 'comments', 'favorites', 'shares', 'approvals', 'reading_users']);
const PLATFORMS = new Set(['toutiao', 'zhihu', 'wechat', 'other']);
const MODES = new Set(['manual', 'automatic', 'mixed', 'unknown']);
const KINDS = new Set(['latest', 'd1', 'd3', 'd7']);
const DAY = 86_400_000;
const BEIJING_OFFSET = 8 * 3_600_000;

function object(value, label = '请求') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'VALIDATION_ERROR', `${label}必须是对象`);
  return value;
}

function text(value, label, max = 300, { optional = false } = {}) {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    fail(400, 'VALIDATION_ERROR', `${label}格式或长度无效`);
  }
  return value.trim();
}

function dayString(value, label = '日期') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, 'VALIDATION_ERROR', `${label}须为 YYYY-MM-DD`);
  const stamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value) fail(400, 'VALIDATION_ERROR', `${label}不存在`);
  return value;
}

function timestamp(value, label, { future = false } = {}) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    fail(400, 'VALIDATION_ERROR', `${label}须包含日期、时间和时区`);
  }
  dayString(value.slice(0, 10), label);
  const clock = value.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
  const offset = value.match(/[+-](\d{2}):(\d{2})$/);
  if (Number(clock[1]) > 23 || Number(clock[2]) > 59 || Number(clock[3] || 0) > 59 || offset && (Number(offset[1]) > 23 || Number(offset[2]) > 59)) {
    fail(400, 'VALIDATION_ERROR', `${label}时间无效`);
  }
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp) || !future && stamp > Date.now()) fail(400, 'VALIDATION_ERROR', `${label}不能在未来或无效`);
  return new Date(stamp).toISOString();
}

function metricObject(raw) {
  object(raw, '指标');
  const result = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!METRICS.has(key)) fail(400, 'VALIDATION_ERROR', `不支持的指标：${key}`);
    if (!Number.isSafeInteger(value) || value < 0) fail(400, 'VALIDATION_ERROR', `${key}须为非负安全整数，缺项请省略`);
    result[key] = value;
  }
  if (!Object.keys(result).length) fail(400, 'VALIDATION_ERROR', '请至少填写一项指标；缺失不能用零代替');
  return result;
}

function articleURL(raw) {
  const value = text(raw, '文章链接', 2048);
  let url;
  try { url = new URL(value); } catch { fail(400, 'VALIDATION_ERROR', '文章链接须为完整 HTTP(S) URL'); }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    fail(400, 'VALIDATION_ERROR', '文章链接须为不含登录凭据的 HTTP(S) URL');
  }
  url.hash = '';
  return url.href;
}

function beijingDay(stamp = Date.now()) {
  return new Date(Number(stamp) + BEIJING_OFFSET).toISOString().slice(0, 10);
}

function shiftDay(day, amount) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + amount * DAY).toISOString().slice(0, 10);
}

function queryValue(query, key) {
  return typeof query?.get === 'function' ? query.get(key) : query?.[key];
}

function checkScope(scope) {
  if (scope !== null && (!Array.isArray(scope) || scope.some(id => typeof id !== 'string'))) fail(403, 'FORBIDDEN', '账号授权无效');
}

function authorize(accountId, scope) {
  checkScope(scope);
  if (scope !== null && !scope.includes(accountId)) fail(403, 'FORBIDDEN', '无权访问该运营账号');
}

function scopedWhere(scope, column, clauses, params) {
  checkScope(scope);
  if (scope !== null) {
    if (!scope.length) clauses.push('0');
    else { clauses.push(`${column} IN (SELECT value FROM json_each(?))`); params.push(JSON.stringify(scope)); }
  }
}

function dateFilters(query, column, clauses, params) {
  const from = queryValue(query, 'from');
  const to = queryValue(query, 'to');
  if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from > to) {
    fail(400, 'VALIDATION_ERROR', '开始日期不能晚于结束日期');
  }
  let lower, upper;
  if (from) {
    lower = /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${dayString(from)}T00:00:00+08:00`).toISOString() : timestamp(from, '开始时间', { future: true });
    clauses.push(`${column} >= ?`); params.push(lower);
  }
  if (to) {
    const isDay = /^\d{4}-\d{2}-\d{2}$/.test(to);
    upper = isDay ? new Date(`${shiftDay(dayString(to), 1)}T00:00:00+08:00`).toISOString() : timestamp(to, '结束时间', { future: true });
    clauses.push(`${column} ${isDay ? '<' : '<='} ?`); params.push(upper);
  }
  if (lower && upper && lower > upper) fail(400, 'VALIDATION_ERROR', '开始日期不能晚于结束日期');
}

function decodeMetrics(row) {
  if (!row) return row;
  const { metrics_json, ...rest } = row;
  return { ...rest, metrics: JSON.parse(metrics_json) };
}

function addMetrics(target, incoming) {
  for (const [key, value] of Object.entries(incoming)) {
    const total = (target[key] ?? 0) + value;
    if (!Number.isSafeInteger(total)) fail(422, 'METRIC_OVERFLOW', '指标汇总超出安全整数范围');
    target[key] = total;
  }
}

function coverageForDay(day, overall, details) {
  const metrics = {};
  if (overall) {
    addMetrics(metrics, overall.metrics);
    return { metrics, coverage: { source: 'account', days: 1, missing_dates: [], label: '平台账号整体日数据', metric_days: Object.fromEntries(Object.keys(metrics).map(k => [k, 1])) } };
  }
  if (details.length) {
    for (const row of details) addMetrics(metrics, row.metrics);
    return { metrics, coverage: { source: 'articles', days: 1, missing_dates: [], label: `仅已录入的 ${details.length} 篇文章，不代表账号全量`, metric_days: Object.fromEntries(Object.keys(metrics).map(k => [k, 1])), article_count: details.length } };
  }
  return { metrics, coverage: { source: 'missing', days: 0, missing_dates: [day], label: '当日数据未取得', metric_days: {} } };
}

export function createRecords(store) {
  const get = store.get;
  const all = store.all;
  const run = store.queue;

  async function account(id, scope) {
    if (typeof id !== 'string' || !id) fail(400, 'VALIDATION_ERROR', '请选择运营账号');
    authorize(id, scope);
    const row = await get('SELECT * FROM accounts WHERE id=?', id);
    if (!row) fail(404, 'NOT_FOUND', '运营账号不存在');
    return row;
  }

  async function article(id, scope) {
    if (typeof id !== 'string' || !id || id.length > 300) fail(400, 'VALIDATION_ERROR', '请选择有效文章');
    const row = await get('SELECT a.*,c.name AS account_name,c.platform FROM articles a JOIN accounts c ON c.id=a.account_id WHERE a.id=?', id);
    if (!row) fail(404, 'NOT_FOUND', '文章不存在');
    authorize(row.account_id, scope);
    return row;
  }

  async function enrich(row) {
    const observation = await get('SELECT metrics_json,as_of,collected_at FROM observations WHERE article_id=? ORDER BY as_of DESC,collected_at DESC,id DESC LIMIT 1', row.id);
    return articleFacts({ ...row, latest_metrics: observation ? JSON.parse(observation.metrics_json) : null, latest_as_of: observation?.as_of ?? null, latest_collected_at: observation?.collected_at ?? null, duration_seconds: row.started_at ? Math.round((Date.parse(row.published_at) - Date.parse(row.started_at)) / 1000) : null });
  }

  async function enrichMany(rows) {
    const latest = new Map();
    const ids = rows.map(row=>row.id);
    for (let offset=0;offset<ids.length;offset+=80) {
      const chunk=ids.slice(offset,offset+80);
      const snapshots=await all(`SELECT o.article_id,o.metrics_json,o.as_of,o.collected_at FROM observations o WHERE o.article_id IN (${chunk.map(()=>'?').join(',')}) AND o.rowid=(SELECT newest.rowid FROM observations newest WHERE newest.article_id=o.article_id ORDER BY newest.as_of DESC,newest.collected_at DESC,newest.id DESC LIMIT 1)`,...chunk);
      for(const snapshot of snapshots) if(!latest.has(snapshot.article_id)) latest.set(snapshot.article_id,snapshot);
    }
    return rows.map(row=>{const observation=latest.get(row.id); return articleFacts({...row,latest_metrics:observation?JSON.parse(observation.metrics_json):null,latest_as_of:observation?.as_of??null,latest_collected_at:observation?.collected_at??null,duration_seconds:row.started_at?Math.round((Date.parse(row.published_at)-Date.parse(row.started_at))/1000):null});});
  }

  async function listAccounts(scope = null) {
    const clauses = [], params = [];
    scopedWhere(scope, 'id', clauses, params);
    return await all(`SELECT * FROM accounts${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY created_at,id`, ...params);
  }

  async function createAccount(body) {
    object(body);
    if (!PLATFORMS.has(body.platform)) fail(400, 'VALIDATION_ERROR', '平台须为 toutiao、zhihu、wechat 或 other');
    const id = randomUUID(), name = text(body.name, '账号名称', 100);
    const created_at = new Date().toISOString();
    run('INSERT INTO accounts(id,platform,name,active,created_at) VALUES(?,?,?,?,?)', id, body.platform, name, 1, created_at);
    return {id,platform:body.platform,name,active:1,created_at};
  }

  async function updateAccount(id, body) {
    object(body);
    const old = await account(id, null);
    const name = body.name === undefined ? old.name : text(body.name, '账号名称', 100);
    let active = old.active;
    if (body.active !== undefined) {
      if (![true, false, 0, 1].includes(body.active)) fail(400, 'VALIDATION_ERROR', '账号启用状态无效');
      active = Number(body.active);
    }
    run('UPDATE accounts SET name=?,active=? WHERE id=?', name, active, id);
    return {...old,name,active};
  }

  async function listArticles(query = {}, scope = null) {
    const clauses = [], params = [];
    scopedWhere(scope, 'a.account_id', clauses, params);
    const accountId = queryValue(query, 'account_id');
    if (accountId) { await account(accountId, scope); clauses.push('a.account_id=?'); params.push(accountId); }
    const platform = queryValue(query, 'platform');
    if (platform) { if (!PLATFORMS.has(platform)) fail(400,'VALIDATION_ERROR','平台无效'); clauses.push('c.platform=?'); params.push(platform); }
    const mode = queryValue(query, 'mode');
    if (mode) {
      if (!MODES.has(mode)) fail(400, 'VALIDATION_ERROR', '生产方式无效');
      clauses.push('a.production_mode=?'); params.push(mode);
    }
    const q = queryValue(query, 'q');
    if (q) {
      const search = text(q, '搜索内容', 300);
      // A visible one-character escape avoids JS/SQL backslash ambiguity.
      // Backslashes remain literal; escape LIKE wildcards and the escape itself.
      const escaped = search.replace(/[!%_]/g, '!$&');
      clauses.push("(a.title LIKE ? ESCAPE '!' OR a.url LIKE ? ESCAPE '!' OR a.summary LIKE ? ESCAPE '!' OR a.notes LIKE ? ESCAPE '!')");
      params.push(...Array(4).fill(`%${escaped}%`));
    }
    dateFilters(query, 'a.published_at', clauses, params);
    const sort = queryValue(query, 'sort') || 'published_at', order = queryValue(query, 'order') || 'desc';
    if (!['published_at', 'reads', 'likes', 'comments', 'approvals', 'latest_as_of', 'duration'].includes(sort) || !['asc', 'desc'].includes(order)) fail(400, 'VALIDATION_ERROR', '排序方式无效');
    const raw = await all(`SELECT a.*,c.name AS account_name,c.platform FROM articles a JOIN accounts c ON c.id=a.account_id${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''}`, ...params);
    let rows = await enrichMany(raw);
    const topic=queryValue(query,'topic'), status=queryValue(query,'data_status');
    if(topic) {if(!['entertainment','insurance','unknown'].includes(topic))fail(400,'VALIDATION_ERROR','题材无效');rows=rows.filter(row=>row.topic===topic);}
    if(status) {
      if(!['no_snapshot','missing_reads','missing_likes','missing_comments','incomplete','zero_reads','date_unverified'].includes(status))fail(400,'VALIDATION_ERROR','数据状态无效');
      rows=rows.filter(row=>status==='no_snapshot'?row.snapshot_status==='not_collected':status==='date_unverified'?row.date_status==='unverified':status==='zero_reads'?row.latest_metrics?.reads===0:status==='incomplete'?['reads','likes','comments'].some(k=>row.missing_metrics.includes(k)):row.missing_metrics.includes(status.slice(8)));
    }
    const value = row => ['reads','likes','comments','approvals'].includes(sort) ? row.latest_metrics?.[sort] ?? null : sort === 'duration' ? row.duration_seconds : sort==='latest_as_of'?row.latest_as_of:row.published_at;
    return rows.sort((a, b) => {
      const left = value(a), right = value(b);
      if (left === null && right !== null) return 1;
      if (right === null && left !== null) return -1;
      const difference = left === right ? 0 : left > right ? 1 : -1;
      return (order === 'asc' ? difference : -difference) || b.published_at.localeCompare(a.published_at) || a.id.localeCompare(b.id);
    });
  }

  async function articlePage(query = {}, scope = null) {
    const rows=await listArticles(query,scope);
    const clauses=[],params=[];scopedWhere(scope,'a.account_id',clauses,params);
    const total=(await get(`SELECT count(*) AS total FROM articles a${clauses.length?' WHERE '+clauses.join(' AND '):''}`,...params)).total;
    return paginate(rows,query,total);
  }

  async function getArticle(id, scope = null) {
    const row = await enrich(await article(id, scope));
    // Read audit provenance only after article authorization, and never infer
    // the recorder from how the content was produced or its self-reported source.
    const describeActor = async event => {
      if (!event) return null;
      let label = event.actor;
      if (event.actor.startsWith('key:')) label = (await get('SELECT name FROM api_keys WHERE id=?', event.actor.slice(4)))?.name ?? event.actor;
      if (event.actor.startsWith('user:')) label = (await get('SELECT username FROM users WHERE id=?', event.actor.slice(5)))?.username ?? event.actor;
      return { actor: event.actor, label, at: event.created_at };
    };
    const recorded = await get("SELECT actor,created_at FROM audit WHERE entity_id=? AND action='POST /articles' ORDER BY created_at,rowid LIMIT 1", id);
    const modified = await get("SELECT actor,created_at FROM audit WHERE entity_id=? AND (action='POST /articles' OR action=?) ORDER BY created_at DESC,rowid DESC LIMIT 1", id, `PUT /articles/${id}`);
    const observations=(await all('SELECT * FROM observations WHERE article_id=? ORDER BY as_of DESC,collected_at DESC,id DESC', id)).map(decodeMetrics);
    return { ...row, recorded_by: await describeActor(recorded), last_modified_by: await describeActor(modified), observations, ...snapshotTimeline(observations,row.date_status==='unverified'?null:row.published_at) };
  }

  async function articleValues(body, scope, old = null) {
    object(body);
    const choose = (key, fallback) => body[key] === undefined ? old?.[key] ?? fallback : body[key];
    const accountId = choose('account_id');
    const publishingAccount = await account(accountId, scope);
    if (publishingAccount.active !== 1 && (!old || old.account_id !== accountId)) {
      fail(409, 'ACCOUNT_INACTIVE', '该运营账号已停用，不能登记新文章');
    }
    const title = text(choose('title'), '文章标题', 300), url = articleURL(choose('url'));
    const published = timestamp(choose('published_at'), '发布时间');
    const startedRaw = choose('started_at', null);
    const started = startedRaw === null || startedRaw === '' ? null : timestamp(startedRaw, '选题开始时间');
    if (started && started > published) fail(400, 'VALIDATION_ERROR', '选题开始时间不能晚于发布时间');
    const mode = choose('production_mode', 'unknown');
    if (!MODES.has(mode)) fail(400, 'VALIDATION_ERROR', '生产方式须为 manual、automatic、mixed 或 unknown');
    const externalRaw = choose('platform_article_id', null);
    const externalId = externalRaw === null || externalRaw === '' ? null : text(externalRaw, '平台文章标识', 300);
    const duplicate = await get('SELECT a.id FROM articles a JOIN accounts c ON c.id=a.account_id WHERE (a.url=? OR (? IS NOT NULL AND a.platform_article_id=? AND c.platform=?)) AND a.id<>? LIMIT 1', url, externalId, externalId, publishingAccount.platform, old?.id ?? '');
    if (duplicate) fail(409, 'ARTICLE_EXISTS', '该平台文章或链接已经登记');
    return { account_id: accountId, title, url, published_at: published, started_at: started, production_mode: mode, platform_article_id: externalId, summary: text(choose('summary', ''), '文章概况', 10000, { optional: true }), notes: text(choose('notes', ''), '备注', 20000, { optional: true }) };
  }

  async function createArticle(body, scope = null) {
    const value = await articleValues(body, scope), id = randomUUID(), stamp = new Date().toISOString();
    try {
      run('INSERT INTO articles(id,account_id,title,url,platform_article_id,published_at,started_at,production_mode,summary,notes,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', id, value.account_id, value.title, value.url, value.platform_article_id, value.published_at, value.started_at, value.production_mode, value.summary, value.notes, 1, stamp, stamp);
    } catch (error) {
      if (/UNIQUE constraint failed/.test(error.message)) fail(409, 'ARTICLE_EXISTS', '该平台文章或链接已经登记');
      throw error;
    }
    const owner = await account(value.account_id,scope);
    return await enrich({id,...value,version:1,created_at:stamp,updated_at:stamp,account_name:owner.name,platform:owner.platform});
  }

  async function updateArticle(id, body, scope = null) {
    object(body);
    const old = await article(id, scope);
    if (!Number.isSafeInteger(body.version) || body.version < 1) fail(400, 'VALIDATION_ERROR', '更新文章需要当前版本号');
    if (body.version !== old.version) fail(409, 'VERSION_CONFLICT', '文章已被其他操作更新，请刷新后重试');
    const value = await articleValues(body, scope, old);
    const observation = await get('SELECT min(as_of) AS earliest FROM observations WHERE article_id=?', id);
    if (observation?.earliest && value.published_at > observation.earliest) fail(400, 'VALIDATION_ERROR', '发布时间不能晚于已有指标的数据截止时间');
    const firstDaily = await get('SELECT min(date) AS earliest FROM daily_metrics WHERE article_id=?', id);
    if (firstDaily?.earliest && beijingDay(Date.parse(value.published_at)) > firstDaily.earliest) fail(400, 'VALIDATION_ERROR', '发布时间不能晚于已有按日数据');
    if (value.account_id !== old.account_id && await get('SELECT id FROM daily_metrics WHERE article_id=? LIMIT 1', id)) fail(409, 'ARTICLE_HAS_DAILY_METRICS', '已有按日数据的文章不能直接变更所属账号');
    const updated_at = new Date().toISOString();
    let result;
    try {
      result = run('UPDATE articles SET account_id=?,title=?,url=?,platform_article_id=?,published_at=?,started_at=?,production_mode=?,summary=?,notes=?,version=version+1,updated_at=? WHERE id=? AND version=?', value.account_id, value.title, value.url, value.platform_article_id, value.published_at, value.started_at, value.production_mode, value.summary, value.notes, updated_at, id, body.version);
    } catch (error) {
      if (/UNIQUE constraint failed/.test(error.message)) fail(409, 'ARTICLE_EXISTS', '该平台文章或链接已经登记');
      throw error;
    }
    // Global revision CAS protects these reads; this version CAS is also checked in-batch.
    store.expectChange();
    const owner = await account(value.account_id,scope);
    return await enrich({...old,...value,version:old.version+1,updated_at,account_name:owner.name,platform:owner.platform});
  }

  async function listObservations(query = {}, scope = null) {
    const clauses = [], params = [];
    scopedWhere(scope, 'a.account_id', clauses, params);
    const articleId = queryValue(query, 'article_id'), accountId = queryValue(query, 'account_id');
    if (articleId) { await article(articleId, scope); clauses.push('o.article_id=?'); params.push(articleId); }
    if (accountId) { await account(accountId, scope); clauses.push('a.account_id=?'); params.push(accountId); }
    return (await all(`SELECT o.* FROM observations o JOIN articles a ON a.id=o.article_id${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY o.as_of DESC,o.collected_at DESC,o.id DESC`, ...params)).map(decodeMetrics);
  }

  async function createObservation(body, scope = null) {
    object(body);
    const target = await article(body.article_id, scope);
    const asOf = timestamp(body.as_of, '数据截止时间');
    const collected = body.collected_at === undefined ? new Date().toISOString() : timestamp(body.collected_at, '采集时间');
    if (asOf < target.published_at) fail(400, 'VALIDATION_ERROR', '文章指标不能早于发布时间');
    if (asOf > collected) fail(400, 'VALIDATION_ERROR', '数据截止时间不能晚于采集时间');
    if (!KINDS.has(body.kind)) fail(400, 'VALIDATION_ERROR', '快照类型须为 latest、d1、d3 或 d7');
    const metrics = metricObject(body.metrics), source = text(body.source, '数据来源', 200), note = text(body.note, '快照备注', 2000, { optional: true });
    const id = randomUUID(), created_at = new Date().toISOString();
    run('INSERT INTO observations(id,article_id,as_of,collected_at,kind,metrics_json,source,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)', id, target.id, asOf, collected, body.kind, JSON.stringify(metrics), source, note, created_at);
    return {id,article_id:target.id,as_of:asOf,collected_at:collected,kind:body.kind,metrics,source,note,created_at};
  }

  async function listDaily(query = {}, scope = null) {
    const clauses = [], params = [];
    scopedWhere(scope, 'd.account_id', clauses, params);
    const accountId = queryValue(query, 'account_id');
    if (accountId) { await account(accountId, scope); clauses.push('d.account_id=?'); params.push(accountId); }
    const from = queryValue(query, 'from'), to = queryValue(query, 'to');
    if (from) { dayString(from, '开始日期'); clauses.push('d.date>=?'); params.push(from); }
    if (to) { dayString(to, '结束日期'); clauses.push('d.date<=?'); params.push(to); }
    if (from && to && from > to) fail(400, 'VALIDATION_ERROR', '开始日期不能晚于结束日期');
    return (await all(`SELECT d.* FROM daily_metrics d${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY d.date DESC,d.account_id,d.article_id,d.id`, ...params)).map(decodeMetrics);
  }

  async function upsertDaily(body, scope = null) {
    object(body);
    const target = await account(body.account_id, scope);
    const articleId = body.article_id === undefined || body.article_id === null || body.article_id === '' ? null : body.article_id;
    const day = dayString(body.date);
    if (day > beijingDay()) fail(400, 'VALIDATION_ERROR', '不能填写未来日期的新增数据');
    if (articleId !== null) {
      const item = await article(articleId, scope);
      if (item.account_id !== target.id) fail(400, 'VALIDATION_ERROR', '文章不属于所选运营账号');
      if (day < beijingDay(Date.parse(item.published_at))) fail(400, 'VALIDATION_ERROR', '文章按日数据不能早于发布日期');
    }
    const metrics = metricObject(body.metrics), source = text(body.source, '数据来源', 200);
    const existing = await get('SELECT id FROM daily_metrics WHERE account_id=? AND article_id IS ? AND date=?', target.id, articleId, day);
    const id = existing?.id ?? `daily_${createHash('sha256').update(JSON.stringify([target.id, articleId, day])).digest('hex')}`;
    const updated_at = new Date().toISOString();
    run('INSERT INTO daily_metrics(id,account_id,article_id,date,metrics_json,source,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT DO UPDATE SET metrics_json=excluded.metrics_json,source=excluded.source,updated_at=excluded.updated_at', id, target.id, articleId, day, JSON.stringify(metrics), source, updated_at);
    return {id,account_id:target.id,article_id:articleId,date:day,metrics,source,updated_at};
  }

  async function dashboard(accountId, scope = null, now = Date.now()) {
    const at = Number(now);
    if (!Number.isFinite(at)) fail(400, 'VALIDATION_ERROR', '驾驶舱当前时间无效');
    if (accountId) await account(accountId, scope);
    const accounts = (await listAccounts(scope)).filter(row => !accountId || row.id === accountId);
    const articles = await listArticles(accountId ? { account_id: accountId } : {}, scope);
    const today = beijingDay(at), from = shiftDay(today, -2), days = [from, shiftDay(from, 1), today];
    const daily = await listDaily({ from, to: today, ...(accountId ? { account_id: accountId } : {}) }, scope);
    const trend = days.map(date => ({ date, accounts: accounts.map(row => {
      const matching = daily.filter(value => value.account_id === row.id && value.date === date);
      return { account_id: row.id, ...coverageForDay(date, matching.find(value => value.article_id === null), matching.filter(value => value.article_id !== null)) };
    }) }));
    const reviewRows = await listObservations(accountId ? {account_id:accountId} : {},scope);
    const reviewMap = new Map();
    for(const review of reviewRows) {if(!reviewMap.has(review.article_id)) reviewMap.set(review.article_id,[]);reviewMap.get(review.article_id).push(review);}
    const accountRows = accounts.map(row => {
      const period = {}, metricDays = {}, sources = new Set(), missing = [];
      for (const day of trend) {
        const value = day.accounts.find(value => value.account_id === row.id);
        if (value.coverage.source === 'missing') missing.push(day.date);
        else {
          sources.add(value.coverage.source);
          addMetrics(period, value.metrics);
          for (const key of Object.keys(value.metrics)) metricDays[key] = (metricDays[key] || 0) + 1;
        }
      }
      const source = sources.size > 1 ? 'mixed' : [...sources][0] || 'missing';
      const partialMetrics = Object.values(metricDays).some(count => count < 3);
      const labels = { account: '账号整体数据', articles: '仅已录入文章，不代表账号全量', mixed: '账号整体与已录入文章按日组合', missing: '近三日数据未取得' };
      const updated = daily.filter(value => value.account_id === row.id).map(value => value.updated_at);
      const accountArticleIds=new Set(articles.filter(article=>article.account_id===row.id).map(article=>article.id));
      const observed=reviewRows.filter(review=>accountArticleIds.has(review.article_id)).map(review=>review.collected_at).sort().at(-1);
      if (observed) updated.push(observed);
      return { ...row, article_count: articles.filter(a => a.account_id === row.id).length, period_metrics: period, coverage: { source, days: 3 - missing.length, missing_dates: missing, label: `${labels[source]}${missing.length ? ` · 缺 ${missing.length} 天` : ''}${partialMetrics ? ' · 部分指标未覆盖三日' : ''}`, metric_days: metricDays }, last_updated: updated.length ? updated.sort().at(-1) : null };
    });
    const durations = articles.map(row => row.duration_seconds).filter(value => value !== null).sort((a, b) => a - b);
    const middle = Math.floor(durations.length / 2);
    const median = durations.length ? durations.length % 2 ? durations[middle] : (durations[middle - 1] + durations[middle]) / 2 : null;
    const due = [];
    for (const row of articles) {
      const snapshots = reviewMap.get(row.id) || [];
      for (const [kind, elapsed] of [['d1', DAY], ['d3', DAY * 3], ['d7', DAY * 7]]) {
        const dueAt = Date.parse(row.published_at) + elapsed;
        if (dueAt <= at && !snapshots.some(snapshot => snapshot.kind === kind && Date.parse(snapshot.as_of) >= dueAt)) {
          due.push({ id: row.id, title: row.title, account_id: row.account_id, account_name: row.account_name, due_kind: kind, due_at: new Date(dueAt).toISOString() });
        }
      }
    }
    due.sort((a, b) => a.due_at.localeCompare(b.due_at) || a.id.localeCompare(b.id));
    const top = articles.filter(row => row.latest_metrics?.reads !== undefined).sort((a, b) => b.latest_metrics.reads - a.latest_metrics.reads || b.published_at.localeCompare(a.published_at)).slice(0, 10);
    return { window: { from, to: today, timezone: 'Asia/Shanghai', todayIncomplete: true }, accounts: accountRows, totals: { article_count: articles.length, automatic_count: articles.filter(row => row.production_mode === 'automatic').length, unknown_mode_count: articles.filter(row => row.production_mode === 'unknown').length, median_duration_seconds: median }, top_articles: top, due_reviews: due, trend };
  }

  async function overview(query = {}, scope = null, now = Date.now()) {
    const period = queryValue(query, 'period') ?? 'yesterday';
    const window = overviewWindow(period, now), accountId = queryValue(query, 'account_id');
    if (accountId) await account(accountId, scope);
    const filter = accountId ? { account_id: accountId } : {};
    const accounts = (await listAccounts(scope)).filter(row => !accountId || row.id === accountId);
    // Historical daily rows provide actual same-age article baselines. Snapshots
    // remain separate; this method queues no writes and runs in consistentRead.
    const articles = await listArticles(filter, scope);
    const daily = await listDaily({ ...filter, to: window.to }, scope);
    const observations = await listObservations(filter, scope);
    const topN=Number(queryValue(query,'top_n')??5), topPlatform=queryValue(query,'top_platform')??'';
    if(!Number.isInteger(topN)||topN<1||topN>100||topPlatform&&!PLATFORMS.has(topPlatform))fail(400,'VALIDATION_ERROR','Top N 或平台无效');
    return {...buildOverview({ accounts, articles, daily, observations, period, now }),...cumulativeOverview(articles,{topN,topPlatform,now,accounts})};
  }

  return { listAccounts, createAccount, updateAccount, listArticles, articlePage, getArticle, createArticle, updateArticle, listObservations, createObservation, listDaily, upsertDaily, dashboard, overview };
}
