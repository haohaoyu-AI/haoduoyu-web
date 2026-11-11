import {documentState, documentValue, isLocalDocument} from '../offline/document.mjs';

const fields = ['group_id', 'title', 'body', 'position'];
const changed = (a, b) => fields.some(field => a[field] !== b?.[field]);
export function memoLocalProtocol(context) {
  function reset(item, value) {
    item.localVersion = value.version; item.localQueued = false; item.localOperation = null; item.localConflict = null;
    item.durable = Object.fromEntries(fields.map(field => [field, value[field]]));
  }
  function accept(item, value, pending = null) {
    const document = documentState(value);
    if (!document) return false;
    const local = document.local, server = document.server;
    if (local.id !== item.id || !Number.isSafeInteger(local.version) || local.version < 1 || typeof local.body !== 'string')
      throw new Error('本机保存记录不完整，原稿已保留。');
    const preserve = pending ? changed(item, pending.snapshot || pending.body) : item.dirty;
    const concurrent = !pending && item.dirty && item.localVersion && item.localVersion !== local.version;
    if (!preserve) for (const field of fields) item[field] = local[field];
    if (server && typeof server.body === 'string') {
      item.server = {...server}; item.version = server.version; item.updated_at = server.updated_at;
    } else if (!item.server) item.version = 0;
    item.localVersion = local.version; item.localQueued = Boolean(document.operation) || Boolean(document.conflict);
    item.localOperation = document.operation; item.localConflict = document.conflict;
    item.localCreatedAt = local.created_at || null; item.localUpdatedAt = local.updated_at || null;
    item.durable = Object.fromEntries(fields.map(field => [field, local[field]]));
    item.deleted_at = local.deleted_at || null; item.pending = null; item.writeEpoch++;
    item.dirty = changed(item, local);
    item.phase = document.conflict || concurrent ? 'conflict' : item.dirty ? 'dirty' : item.localQueued ? 'queued' : 'saved';
    item.remote = document.conflict?.remote || (concurrent ? server : null);
    item.error = item.phase === 'conflict' ? '两份内容已保留，请核对后处理。' : '';
    context.upsert('notes', {...local, version: item.version, localVersion: item.localVersion, localQueued: item.localQueued});
    context.emit(); context.schedule(item);
    return true;
  }
  function row(value) {
    if (!isLocalDocument(value)) return value;
    const data = documentState(value), local = documentValue(value);
    return {...local, version: data.server?.version || 0, localVersion: local.version,
      localQueued: Boolean(data.operation) || Boolean(data.conflict), server: data.server};
  }
  function index(value) {
    return {...value, groups: value.groups.map(row), notes: value.notes.map(row)};
  }
  return {accept, reset, row, index};
}
