import {assertOfflineData} from '../offline/db.mjs';
import {LOCAL_DATABASE_NAME, LOCAL_OWNER_ID, LOCAL_SCOPE, fail, invalid, unsupported, clone, idOf, queryOnly, canonical, beijingDay} from './common.mjs';
import {todosRoute} from './todos.mjs';
import {notesRoute} from './notes.mjs';
import {memosRoute} from './memos.mjs';
import {reviewRoute} from './review.mjs';
export {LOCAL_DATABASE_NAME, LOCAL_OWNER_ID, LOCAL_SCOPE};

/** No transport and no automatic fallback. A resolved write is a committed IDB transaction. */
export function createLocalApi({db, now = Date.now, uuid = () => globalThis.crypto.randomUUID(), ownerId = LOCAL_OWNER_ID} = {}) {
  if (!db || typeof db.transaction !== 'function') throw new TypeError('A durable database adapter is required');
  ownerId = idOf(ownerId);
  const scope = 'local:v1:' + ownerId;
  const key = (type, id) => JSON.stringify([scope, type, id]);
  return async function call(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /[\r\n]/.test(path)) throw invalid('仅允许本机 API 路径。');
    const url = new URL(path, 'https://local.invalid');
    if (url.origin !== 'https://local.invalid' || url.hash || path.split('?')[0] !== url.pathname) throw invalid('本机 API 路径无效。');
    const active = () => {
      if (options.signal?.aborted || options.context?.controller?.signal?.aborted) throw new DOMException('请求已取消', 'AbortError');
      options.offlineGuard?.();
    };
    active();
    const writing = method !== 'GET';
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw unsupported();
    let body = options.body;
    if (writing) {
      if (url.search) throw invalid('本机写入不接受查询参数。');
      if (body === undefined) body = {};
      if (!body || Object.getPrototypeOf(body) !== Object.prototype) throw invalid('写入需要 JSON 对象。');
      try { assertOfflineData(body); body = clone(body); } catch { throw invalid(); }
    } else if (body !== undefined) throw invalid('读取不接受正文。');
    const at = now();
    if (!Number.isFinite(at) || !Number.isFinite(new Date(at).getTime())) throw invalid('本机时间无效。');
    let value;
    try {
      value = await db.transaction(['entities', 'meta'], writing ? 'readwrite' : 'readonly', async tx => {
        active();
        const all = (await tx.getAll('entities')).filter(row => row.scope === scope);
        const rows = new Map(all.map(row => [row.key, row]));
        const record = (kind, id) => rows.get(key(kind, id));
        const ctx = {tx, scope, ownerId, method, body, url, path: url.pathname, at, stamp: new Date(at).toISOString(), today: beijingDay(at), uuid,
          get: (kind, id) => clone(record(kind, id)?.value),
          list: kind => [...rows.values()].filter(row => row.kind === kind).map(row => clone(row.value)),
          async put(kind, id, value) {
            const row = {key: key(kind, id), scope, kind, id, value: clone(value)};
            await tx.put('entities', row); rows.set(row.key, row);
          },
          async revision() {
            const revisionKey = key('meta', 'revision'), current = await tx.get('meta', revisionKey), revision = (current?.value || 0) + 1;
            if (!Number.isSafeInteger(revision)) throw fail(503, 'LOCAL_REVISION', '本机修订号超出范围。');
            await tx.put('meta', {key: revisionKey, value: revision}); return revision;
          },
          async history(kind, row) { if (row) await ctx.put('history', kind + ':' + row.id + ':' + row.version, {kind, ...row}); },
          async receipt(domain, id) { return (await tx.get('meta', key('receipt:' + domain, id)))?.receipt; },
          async commit(domain, operationId, request, work) {
            const receiptKey = key('receipt:' + domain, operationId), fingerprint = canonical(request);
            const saved = await tx.get('meta', receiptKey);
            if (saved) {
              if (saved.fingerprint !== fingerprint) throw fail(409, 'IDEMPOTENCY_CONFLICT', '操作标识已用于不同内容，未重复保存。');
              for (const check of saved.checks) if (ctx.get(check.kind, check.id)?.version !== check.version)
                throw fail(409, 'VERSION_CONFLICT', '原操作已保存，记录随后已有更新，请核对保存收据。');
              return clone(saved.response);
            }
            const {response, checks = [], receipt = {}} = await work();
            await tx.put('meta', {key: receiptKey, fingerprint, response, checks, receipt, created_at: ctx.stamp});
            return clone(response);
          },
        };
        let result;
        if (method === 'GET' && ctx.path === '/auth/me') {
          queryOnly(url.searchParams); result = {id: ownerId, username: '本机工作区', publicBusiness: true, localOnly: true};
        } else if (method === 'GET' && ctx.path === '/accounts') {
          queryOnly(url.searchParams); result = ctx.list('account');
        } else if (method === 'GET' && ctx.path === '/workbench-snapshot/index') {
          queryOnly(url.searchParams, ['version']);
          if (url.searchParams.get('version') !== '2') throw invalid();
          result = {format: 'haoduoyu-workbench-snapshot-v2', complete: true, projection: 'current', scope_id: scope,
            entities: [...rows.values()].filter(row => !['history', 'label'].includes(row.kind)).map(row => ({entity_id: row.kind + ':' + row.id, version: row.value.version || 0}))};
        } else if (/^\/(todos|unscheduled-todos|todo-templates|todo-preferences)(\/|$)/.test(ctx.path)) result = await todosRoute(ctx);
        else if (/^\/(note-entries|daily-notes)(\/|$)/.test(ctx.path)) result = await notesRoute(ctx, options.headers || {});
        else if (/^\/memos(\/|$)/.test(ctx.path)) result = await memosRoute(ctx);
        else if (/^\/(review|ai-reports|work-reminders)(\/|$)/.test(ctx.path)) result = await reviewRoute(ctx);
        else throw unsupported();
        // Internal capabilities compare-clear a composer or confirm one exact
        // recovered-note snapshot in the same item/receipt transaction.
        // JSON request bodies cannot supply executable callbacks.
        if (typeof options.localDraftCommit === 'function' &&
            (method === 'POST' && ['/todos','/unscheduled-todos'].includes(ctx.path) ||
             method === 'PUT' && /^\/note-entries\/[a-f0-9-]{36}$/i.test(ctx.path)))
          await options.localDraftCommit(tx, result);
        active(); return result;
      });
    } catch (error) {
      if (error.status || error.name === 'AbortError') throw error;
      throw Object.assign(new Error('本机存储失败，未确认保存。请保留草稿并核对已有记录。', {cause: error}), {code: 'LOCAL_STORAGE_FAILURE', localNotSaved: true});
    }
    // Abort after a committed transaction must not be represented as an uncommitted write.
    return options.envelope ? {data: value} : value;
  };
}
