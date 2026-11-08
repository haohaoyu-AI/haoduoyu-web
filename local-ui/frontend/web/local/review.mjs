import {queryOnly, textOf, dateOf, fail, invalid, unsupported, digest, canonical} from './common.mjs';

// These are local collection names, not website caches or authenticated accounts.
export const REVIEW_COLLECTIONS = Object.freeze(['articles', 'snapshots', 'reports', 'playbooks', 'benchmark-accounts', 'benchmark-articles', 'notes', 'account-health']);
export const REVIEW_READ_LIMITS = Object.freeze({page: 100, totalRows: 20000, totalBytes: 16 * 1024 * 1024, remindersPerDay: 100});
const kindOf = resource => 'review:' + resource;
const active = row => !row.deleted_at && row.deleted !== true;
const compare = (a, b) => String(a ?? '').localeCompare(String(b ?? ''));
function offsetOf(query) {
  const raw = query.get('offset') ?? '0';
  if (!/^(0|[1-9]\d*)$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw invalid('分页偏移须为非负安全整数。');
  return Number(raw);
}
function checkedRows(ctx, kind) {
  const rows = ctx.list(kind).filter(active), ids = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id || ids.has(row.id))
      throw fail(409, 'LOCAL_REVIEW_INVALID', '本机复盘记录标识无效或重复，请核对已有资料。');
    ids.add(row.id);
  }
  return rows;
}
function limited(data) {
  const count = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);
  if (count > REVIEW_READ_LIMITS.totalRows || new TextEncoder().encode(canonical(data)).length > REVIEW_READ_LIMITS.totalBytes)
    throw fail(413, 'LOCAL_REVIEW_TOO_LARGE', '本机复盘资料超过完整读取上限，未返回不完整统计。');
  return data;
}
function page(rows, offset, extra = {}) {
  return {items: rows.slice(offset, offset + 100), has_more: rows.length > offset + 100, ...extra};
}
function ordered(resource, rows) {
  const field = {articles:'published_at', snapshots:'snapshot_date', reports:'period_end', playbooks:'published_on',
    'benchmark-accounts':'created_at', 'benchmark-articles':'collected_on', notes:'note_date', 'account-health':'observed_on'}[resource];
  return rows.sort((a,b) => compare(b[field],a[field]) || compare(a.id,b.id));
}
export async function reviewRoute(ctx) {
  if (ctx.method !== 'GET') throw unsupported();
  const q = ctx.url.searchParams;
  if (ctx.path === '/ai-reports') {
    queryOnly(q, ['offset']);
    const offset = offsetOf(q), rows = limited({reports:checkedRows(ctx, 'ai-report')}).reports;
    rows.sort((a,b) => compare(b.created_at,a.created_at) || compare(b.id,a.id));
    // Exact original read projection. No generated author, content or timestamps.
    return page(rows.map(({id, author, content, created_at}) => ({id, author, content, created_at})), offset);
  }
  if (ctx.path === '/work-reminders') {
    queryOnly(q, ['date']);
    const date = q.has('date') ? dateOf(q.get('date')) : ctx.today;
    const rows = checkedRows(ctx, 'work-reminder').filter(row => row.date === date);
    if (rows.length > REVIEW_READ_LIMITS.remindersPerDay) throw fail(413, 'LOCAL_REMINDERS_TOO_LARGE', '该日本机提醒超过完整读取上限。');
    rows.sort((a,b) => compare(a.created_at,b.created_at) || compare(a.id,b.id));
    return {date, items:rows.map(({id,date,source_key,summary,version,change_seq,created_at,updated_at}) =>
      ({id,date,source_key,summary,version,change_seq,created_at,updated_at})), can_edit:false};
  }
  const match = /^\/review\/([^/]+)$/.exec(ctx.path), resource = match?.[1];
  if (!REVIEW_COLLECTIONS.includes(resource)) throw unsupported();
  queryOnly(q, ['account', 'offset', 'read_revision']);
  const account = textOf(q.get('account'), 120), offset = offsetOf(q);
  const all = limited(Object.fromEntries(REVIEW_COLLECTIONS.map(name => [name, checkedRows(ctx,kindOf(name))])));
  // Hash the complete local review snapshot, not clock time or an invented count.
  // The original loader treats revision as opaque and checks all eight collections.
  const revision = await digest({scope:ctx.scope, collections:Object.fromEntries(REVIEW_COLLECTIONS.map(name =>
    [name, [...all[name]].sort((a,b) => compare(a.id,b.id))]))});
  if (q.has('read_revision') && q.get('read_revision') !== revision)
    throw fail(409, 'READ_REVISION_CHANGED', '本机复盘资料已更新，请从第一页重新读取。');
  const articles = new Set(all.articles.filter(row => row.account === account).map(row => row.id));
  const parents = new Map(all['benchmark-accounts'].map(row => [row.id,row]));
  const rows = resource === 'snapshots' ? all.snapshots.filter(row => articles.has(row.article_id)) :
    resource === 'benchmark-articles' ? all[resource].filter(row => parents.get(row.benchmark_account_id)?.account === account).map(row =>
      ({...row, account:parents.get(row.benchmark_account_id).account,
        used_by_article_ids:all.articles.filter(article => article.reference_article_id === row.id).map(article => article.id).sort()})) :
    all[resource].filter(row => row.account === account);
  return page(ordered(resource,rows), offset, {read_revision:revision});
}
