import {entityKey, offlineValue} from './db.mjs';

const dayPattern = /^(?!0000)\d{4}-\d{2}-\d{2}$/;
const uuidPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const clone = value => structuredClone(value);
const missing = () => Object.assign(new Error('此内容尚未保存在本机，请联网读取一次。'), {code: 'OFFLINE_CACHE_MISS'});
const active = row => row && !row.deleted && !row.deleted_at;
export function offlineReadRoute(path) {
  const url = new URL(path, 'https://offline.invalid');
  if (url.origin !== 'https://offline.invalid' || url.hash) return null;
  const route = url.pathname, query = url.searchParams;
  if (route === '/todos' && [...query.keys()].every(key => key === 'date') &&
      query.getAll('date').length === 1 && dayPattern.test(query.get('date'))) return {kind: 'todo', date: query.get('date')};
  if (route === '/todo-templates' && !url.search) return {kind: 'template'};
  if (route === '/accounts' && !url.search) return {kind: 'accounts'};
  if (route === '/overview') return {kind: 'overview'};
  if (route === '/daily-notes' && query.has('date')) return {kind: 'legacy'};
  if (route === '/note-entries' && query.has('date') && ['life', 'work'].includes(query.get('category')))
    return {kind: 'note_entries', date: query.get('date'), category: query.get('category')};
  if (/^\/note-entries\/[a-f0-9-]{36}$/i.test(route)) return {kind: 'note_entry'};
  if (route === '/memos' && !url.search) return {kind: 'memos'};
  if (/^\/memos\/notes\/[a-f0-9-]{36}$/i.test(route)) return {kind: 'memo_note'};
  if (route === '/work-reminders' && query.has('date')) return {kind: 'reminders'};
  return null;
}

export function safeIdentity(value) {
  if (!value || typeof value.id !== 'string' || !value.id || typeof value.username !== 'string')
    throw new Error('身份读取不完整，未启用本机数据。');
  return {id: value.id, username: value.username, ...(value.publicBusiness === true ? {publicBusiness: true} : {})};
}
export const identityFingerprint = value => JSON.stringify([value.id, value.publicBusiness === true]);
function safeAccounts(value) {
  if (!Array.isArray(value)) throw new Error('账户读取不完整。');
  if (value.some(row => !row || ![0, 1].includes(row.active))) throw new Error('账户状态读取不完整。');
  const fields = ['id', 'name', 'platform', 'active', 'account_name', 'position', 'created_at', 'updated_at'];
  return value.map(row => Object.fromEntries(fields.filter(key => row[key] !== undefined).map(key => [key, row[key]])));
}
function checkedResponse(route, value) {
  const invalid = () => Object.assign(new Error('读取结果不完整，未覆盖本机数据。'), {code: 'OFFLINE_RESPONSE_INVALID'});
  if (value === undefined || value === null) throw invalid();
  if (['todo', 'template'].includes(route.kind) && (!Array.isArray(value.items) ||
      value.items.some(row => !row || !uuidPattern.test(row.id) || !Number.isSafeInteger(row.version) || row.version < 1 ||
        typeof row.text !== 'string' || !row.text.trim() || row.text.length > 500 ||
        !Number.isFinite(Date.parse(row.created_at)) || !Number.isFinite(Date.parse(row.updated_at)) ||
        route.kind === 'todo' && (row.date !== route.date || typeof row.completed !== 'boolean' || row.deleted_at !== null))))
    throw invalid();
  return route.kind === 'accounts' ? safeAccounts(value) : clone(value);
}
function belongs(row, route) {
  const value = offlineValue(row);
  return row.entity_id.startsWith(route.kind + ':') && value && (route.kind !== 'todo' || value.date === route.date);
}
function serverFence(rows, route, owner) {
  if (!['todo', 'template'].includes(route.kind)) return null;
  return JSON.stringify(rows.filter(row => row.scope === owner && belongs(row, route)).map(row =>
    [row.entity_id, row.server || null, row.remote_missing === true]).sort((a, b) => a[0].localeCompare(b[0])));
}
function overlay(value, route, entities, dirtyOnly) {
  if (!['todo', 'template'].includes(route.kind)) return value;
  const items = new Map(value.items.map(row => [row.id, row]));
  for (const entity of entities) {
    if (!belongs(entity, route) || dirtyOnly && !entity.dirty) continue;
    const row = offlineValue(entity);
    if (active(row) && !entity.remote_missing || entity.dirty && active(row)) items.set(row.id, clone(row));
    else items.delete(row.id);
  }
  return {...value, items: [...items.values()].filter(active).sort((a, b) =>
    String(a.created_at || '').localeCompare(String(b.created_at || '')) || a.id.localeCompare(b.id))};
}
function identityMethods(db, now) {
  const key = JSON.stringify(['haoduoyu-offline', 'last-verified-identity']);
  return {
    readIdentity: () => db.transaction(['meta'], 'readonly', tx => tx.get('meta', key)),
    async saveIdentity(me, scope) {
      const identity = safeIdentity(me);
      await db.transaction(['meta'], 'readwrite', tx => tx.put('meta', {key, identity, scope, verified_at: now()}));
      return identity;
    },
    forgetIdentity: () => db.transaction(['meta'], 'readwrite', tx => tx.delete('meta', key)),
  };
}
export function createOfflineCache({db, getScope, now = Date.now, getGeneration = () => 0}) {
  const scope = () => {
    const value = getScope();
    if (!value) throw Object.assign(new Error('请先联网核实当前身份，本机内容已保留。'), {code: 'OFFLINE_SCOPE_REQUIRED'});
    return value;
  };
  async function write(path, value, {baseline} = {}) {
    const route = offlineReadRoute(path);
    if (!route) return value;
    const owner = scope(), generation = getGeneration(), data = checkedResponse(route, value), key = entityKey(owner, 'get:' + path);
    const active = () => {
      if (scope() !== owner || getGeneration() !== generation)
        throw Object.assign(new Error('身份范围已变化，本次读取未保存。'), {code: 'OFFLINE_SCOPE_CHANGED'});
    };
    await db.transaction(['meta', 'entities'], 'readwrite', async tx => {
      active();
      const rows = await tx.getAll('entities');
      if (baseline !== undefined && baseline !== serverFence(rows, route, owner))
        throw Object.assign(new Error('本机刚同步了新版本，请重新读取完整列表。'), {code: 'OFFLINE_CACHE_CHANGED'});
      await tx.put('meta', {key, scope: owner, path, data, saved_at: now()});
      if (!['todo', 'template'].includes(route.kind)) { active(); return; }
      const found = new Set(data.items.map(row => row.id));
      for (const old of rows) {
        if (old.scope === owner && belongs(old, route) && !found.has(offlineValue(old).id))
          await tx.put('entities', {...old, remote_missing: true});
      }
      for (const row of data.items) {
        const entity_id = route.kind + ':' + row.id, storageKey = entityKey(owner, entity_id);
        const old = await tx.get('entities', storageKey);
        if (old?.server?.version > row.version)
          throw Object.assign(new Error('读取结果早于本机已确认版本，请重新读取。'), {code: 'OFFLINE_CACHE_CHANGED'});
        await tx.put('entities', {...old, key: storageKey, scope: owner, entity_id, server: row,
          remote_missing: false, ...(route.kind === 'todo' ? {needs_api_refresh: false} : {})});
      }
      active();
    });
    const result = overlay(route.kind === 'accounts' ? value : data, route, await entities(owner), true); active(); return result;
  }
  const entities = owner => db.transaction(['entities'], 'readonly', async tx =>
    (await tx.getAll('entities')).filter(row => row.scope === owner));
  async function read(path) {
    const route = offlineReadRoute(path);
    if (!route) throw missing();
    const owner = scope(), generation = getGeneration();
    const cached = await db.transaction(['meta'], 'readonly', tx => tx.get('meta', entityKey(owner, 'get:' + path)));
    if (!cached || cached.data === undefined) {
      const local = route.kind === 'todo' ? (await entities(owner)).filter(row => row.dirty && belongs(row, route)) : [];
      if (!local.length) throw missing();
      const data = {date: route.date, today: new Date(now() + 8 * 3600000).toISOString().slice(0, 10),
        completed_mode: 'strike', preferences_version: 0, items: [], offline_partial: true};
      if (scope() !== owner || getGeneration() !== generation) throw missing();
      return {data: overlay(data, route, local, false), saved_at: null};
    }
    const result = overlay(clone(cached.data), route, await entities(owner), false);
    if (scope() !== owner || getGeneration() !== generation) throw missing();
    return {data: result, saved_at: cached.saved_at};
  }
  const entity = id => db.transaction(['entities'], 'readonly', tx => tx.get('entities', entityKey(scope(), id)));
  const fence = async path => serverFence(await entities(scope()), offlineReadRoute(path), scope());
  return {read, write, entity, fence, entities: () => entities(scope()), ...identityMethods(db, now)};
}
