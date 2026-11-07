import {offlineValue} from './db.mjs';
import {localDocument} from './document.mjs';

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const failure = (message, code = 'OFFLINE_INVALID_MUTATION') => Object.assign(new Error(message), {code, localNotSaved: true});
export function noteMutationRoute(path, options, features) {
  const match = /^\/note-entries\/([a-f0-9-]{36})$/i.exec(path), method = (options.method || 'GET').toUpperCase();
  return features.notes && match && uuid.test(match[1]) && ['PUT', 'DELETE'].includes(method) ?
    {type: 'note_entry', id: match[1].toLowerCase(), method} : null;
}
function checked(body, method) {
  const fields = method === 'PUT' ? ['category', 'date', 'text', 'version', 'save_id'] : ['version', 'save_id'];
  if (!body || Object.keys(body).sort().join(',') !== fields.sort().join(',') || !uuid.test(body.save_id) ||
      !Number.isSafeInteger(body.version) || body.version < (method === 'PUT' ? 0 : 1) || body.version >= Number.MAX_SAFE_INTEGER)
    throw failure('保存字段或原保存标识不完整，本次修改未保存。');
  if (method === 'PUT') {
    const day = new Date(body.date + 'T00:00:00Z');
    if (!['life', 'work'].includes(body.category) || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(body.date) ||
        !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== body.date || typeof body.text !== 'string' ||
        !body.text.isWellFormed() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.text) ||
        new TextEncoder().encode(body.text.replace(/\r\n?/g, '\n')).byteLength > 65536)
      throw failure('分类、日期或正文无效，草稿已保留。');
  }
  return structuredClone(body);
}
export function createNoteMutations(context) {
  async function mutate(path, options, route, guard) {
    const {state, cache, outbox, now} = context, owner = state.scope, generation = context.generation;
    const active = () => {
      guard();
      if (!owner || owner !== state.scope || generation !== context.generation)
        throw failure('身份范围已变化，本次修改未保存。', 'OFFLINE_SCOPE_CHANGED');
    };
    active();
    const body = checked(options.body, route.method);
    if (!await cache.noteCapability()) throw failure('请先联网核实碎碎念编辑能力。', 'OFFLINE_SCOPE_REQUIRED');
    active();
    const stored = await cache.entity('note-entry:' + route.id), visible = offlineValue(stored);
    active();
    if (route.method === 'PUT' && body.version === 0 && !visible) {
      const existing = await cache.entities(); active();
      if (existing.filter(row => row.entity_id.startsWith('note-entry:') && (row.dirty ? row.local : row.server)?.category === body.category &&
          (row.dirty ? row.local : row.server)?.date === body.date && !(row.dirty ? row.local : row.server)?.deleted &&
          !(row.dirty ? row.local : row.server)?.deleted_at && (row.dirty || !row.remote_missing)).length >= 200)
        throw failure('本机该日记录已达 200 条，草稿已保留。', 'OFFLINE_CACHE_LIMIT');
    }
    if (!options.offlineUnknown && body.version !== (visible?.version || 0))
      throw failure('本机已有更新，请重新读取后保存，草稿已保留。', 'OFFLINE_CACHE_CHANGED');
    if (route.method === 'DELETE' && !visible) throw failure('此记录尚未保存在本机。', 'OFFLINE_CACHE_MISS');
    if (visible && route.method === 'PUT' && (visible.category !== body.category || visible.date !== body.date))
      throw failure('记录的分类和日期不可更改。');
    const stamp = new Date(now()).toISOString();
    const local = {...visible, ...body, id: route.id, can_edit: true, deleted: route.method === 'DELETE',
      created_at: visible?.created_at || stamp, updated_at: stamp,
      deleted_at: route.method === 'DELETE' ? stamp : null};
    let result;
    try {
      result = await outbox.enqueue({scope: owner, entity_type: 'note_entry', entity_id: route.id, method: route.method,
        path, body, base: stored?.server || null, local, initial_status: options.offlineUnknown ? 'unknown' : 'queued', assertActive: active});
    } catch (error) {
      error.localNotSaved = true;
      if (!error.code) error.code = 'OFFLINE_STORAGE_UNAVAILABLE';
      throw error;
    }
    active();
    if (['acked', 'archived'].includes(result.operation.status) && result.entity.server?.can_edit !== undefined)
      return result.entity.server;
    await context.refresh(); context.broadcast();
    if (context.online()) context.scheduleRetry();
    return localDocument({local: result.entity.local, server: stored?.api_server ||
      (stored?.server?.can_edit !== undefined ? stored.server : null), operation: result.operation});
  }
  return {mutate};
}
