import {entityKey, offlineValue} from './db.mjs';
import {localDocument} from './document.mjs';

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const active = value => !['archived', 'acked'].includes(value.status);
const fail = (message, code = 'OFFLINE_MEMO_INVALID') => Object.assign(new Error(message), {code});
const keyFor = (scope, kind, id) => entityKey(scope, (kind === 'notes' ? 'memo-note:' : 'memo-group:') + id);
const fields = ['id', 'title', 'position', 'version', 'change_seq', 'created_at', 'updated_at', 'deleted_at', 'group_id', 'body'];
export function memoRoute(path) {
  if (path === '/memos') return {kind: 'index'};
  const match = /^\/memos\/(notes|groups)\/([a-f0-9-]{36})$/i.exec(path);
  return match && uuid.test(match[2]) ? {kind: match[1], id: match[2].toLowerCase()} : null;
}
function checked(row, kind, detail = false) {
  if (!row || !uuid.test(row.id) || typeof row.title !== 'string' || !row.title.trim() ||
      !Number.isSafeInteger(row.version) || row.version < 1 || !Number.isSafeInteger(row.position) ||
      kind === 'notes' && (!uuid.test(row.group_id) || detail && typeof row.body !== 'string')) {
    throw fail('备忘录读取不完整，未覆盖本机内容。');
  }
  return Object.fromEntries(fields.filter(field => row[field] !== undefined).map(field => [field, row[field]]));
}
function memoDocument(entity, records, canEdit, index = false) {
  const value = offlineValue(entity);
  if (!value || entity.remote_missing && !entity.dirty) return null;
  const operation = records.operations.filter(row => row.entity_id === entity.entity_id && active(row)).at(-1) || null;
  const conflict = records.conflicts.find(row => row.entity_id === entity.entity_id && row.resolved_at === null) || null;
  const local = {...value, id: value.id || value.source_id, can_edit: canEdit};
  if (!entity.dirty && entity.remote_index?.version > value.version) {
    if (index) return {...entity.remote_index, can_edit: canEdit};
    if (!entity.remote_index.deleted_at) throw fail('正文已有新版本，请联网读取后编辑。', 'OFFLINE_CACHE_MISS');
    return localDocument({local: {...local, deleted_at: entity.remote_index.deleted_at}, server: entity.server});
  }
  if (!entity.dirty && !operation && !conflict) return local;
  return localDocument({local, server: entity.server || null, operation, conflict});
}
function scoped(context, assertActive = () => {}) {
  assertActive();
  const scope = context.getScope(), generation = context.getGeneration();
  if (!scope) throw fail('请先联网核实工作台，本机笔记仍保留。', 'OFFLINE_SCOPE_REQUIRED');
  return {scope, check() {
    assertActive();
    if (context.getScope() !== scope || context.getGeneration() !== generation)
      throw fail('身份范围已变化，输入内容已保留。', 'OFFLINE_SCOPE_CHANGED');
  }};
}
function checkedInput(raw, kind, createId) {
  const body = structuredClone(raw || {});
  if (!body.save_id) body.save_id = createId();
  const fields = ['title', 'position', 'version', 'save_id', ...(kind === 'notes' ? ['group_id', 'body'] : [])];
  const plain = value => typeof value === 'string' && value.isWellFormed() &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
  const invalid = () => { throw Object.assign(fail('备忘录字段无效，输入仍保留。'), {status: 400}); };
  if (Object.keys(body).sort().join(',') !== fields.sort().join(',') || !uuid.test(body.save_id) ||
      !Number.isSafeInteger(body.version) || body.version < 0 || body.version >= Number.MAX_SAFE_INTEGER ||
      !Number.isSafeInteger(body.position) || body.position < 0 || body.position > 1000000 ||
      !plain(body.title) || !body.title.trim() || [...body.title.trim()].length > 120 || /[\r\n\t]/.test(body.title)) invalid();
  body.title = body.title.trim();
  if (kind === 'notes') {
    if (!uuid.test(body.group_id) || !plain(body.body)) invalid();
    body.body = body.body.replace(/\r\n?/g, '\n');
    if (new TextEncoder().encode(body.body).length > 65536) invalid();
  }
  return body;
}
function memoReads(context) {
  async function project(path) {
    const route = memoRoute(path), guard = scoped(context);
    if (!route || route.kind === 'groups') throw fail('此备忘录尚未缓存。', 'OFFLINE_CACHE_MISS');
    const result = await context.db.transaction(['entities', 'outbox', 'conflicts', 'meta'], 'readonly', async tx => {
      guard.check();
      const cap = await tx.get('meta', entityKey(guard.scope, 'memo-capability'));
      const entities = (await tx.getAll('entities')).filter(row => row.scope === guard.scope);
      const records = {operations: (await tx.getAll('outbox')).filter(row => row.scope === guard.scope),
        conflicts: (await tx.getAll('conflicts')).filter(row => row.scope === guard.scope)};
      const canEdit = cap?.can_edit === true;
      if (route.kind === 'notes') {
        const entity = entities.find(row => row.key === keyFor(guard.scope, 'notes', route.id));
        if (!entity || typeof offlineValue(entity)?.body !== 'string') throw fail('请联网读取此笔记正文。', 'OFFLINE_CACHE_MISS');
        const document = memoDocument(entity, records, canEdit);
        if (!document) throw fail('笔记已不在当前缓存范围。', 'OFFLINE_CACHE_MISS');
        guard.check(); return document;
      }
      const values = kind => entities.filter(row => row.entity_id.startsWith(kind === 'groups' ? 'memo-group:' : 'memo-note:'))
        .map(row => memoDocument(row, records, canEdit, true)).filter(Boolean)
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
      const data = {groups: values('groups'), notes: values('notes'), can_edit: canEdit,
        ...(cap?.draft_scope ? {draft_scope: cap.draft_scope} : {})};
      guard.check(); return data;
    });
    guard.check(); return result;
  }
  return {project};
}
function memoCache(context) {
  const serverFence = (rows, route) => JSON.stringify(rows.filter(row => row.server &&
    row.entity_id.startsWith('memo-') && (route.kind === 'index' || row.entity_id === 'memo-note:' + route.id))
    .map(row => [row.entity_id, Object.fromEntries(fields.map(field => [field, row.server[field]]))])
    .sort((a, b) => a[0].localeCompare(b[0])));
  async function fence(path) {
    const guard = scoped(context), route = memoRoute(path);
    const rows = await context.db.transaction(['entities'], 'readonly', tx => tx.getAll('entities'));
    guard.check(); return serverFence(rows.filter(row => row.scope === guard.scope), route);
  }
  async function remember(path, value, {baseline} = {}) {
    const route = memoRoute(path), guard = scoped(context);
    if (!route) return value;
    if (route.kind === 'index' && (!Array.isArray(value?.groups) || !Array.isArray(value.notes) ||
        typeof value.can_edit !== 'boolean')) throw fail('备忘录索引不完整，未覆盖本机内容。');
    await context.db.transaction(['entities', 'meta'], 'readwrite', async tx => {
      guard.check();
      const initial = (await tx.getAll('entities')).filter(row => row.scope === guard.scope);
      if (baseline !== undefined && baseline !== serverFence(initial, route))
        throw fail('本机刚确认了新版本，请重新读取备忘录。', 'OFFLINE_CACHE_CHANGED');
      const collections = route.kind === 'index' ? [['groups', value.groups], ['notes', value.notes]] : [[route.kind, [value]]];
      for (const [kind, rows] of collections) for (const raw of rows) {
        const server = checked(raw, kind, route.kind === 'notes'), key = keyFor(guard.scope, kind, server.id);
        const old = await tx.get('entities', key);
        if (old?.server?.version > server.version) throw fail('本机已有较新备忘录，请重读。', 'OFFLINE_CACHE_CHANGED');
        const complete = kind === 'groups' || typeof server.body === 'string';
        const stored = complete ? server : old?.server?.version === server.version ? {...old.server, ...server} : old?.server || server;
        await tx.put('entities', {...old, key, scope: guard.scope,
          entity_id: (kind === 'groups' ? 'memo-group:' : 'memo-note:') + server.id,
          server: stored, remote_index: server, remote_missing: false});
      }
      if (route.kind === 'index') await tx.put('meta', {key: entityKey(guard.scope, 'memo-capability'),
        can_edit: value.can_edit, ...(value.draft_scope ? {draft_scope: value.draft_scope} : {}), verified_at: context.now()});
      guard.check();
    });
    guard.check(); return context.project(path);
  }
  return {remember, fence};
}
function memoWrites(context) {
  async function mutate(path, options, assertActive) {
    const route = memoRoute(path), guard = scoped(context, assertActive);
    if (!route || !['notes', 'groups'].includes(route.kind) || options.method?.toUpperCase() !== 'PUT') {
      throw fail('备忘录删除和恢复需联网确认。', 'OFFLINE_UNSUPPORTED');
    }
    const body = checkedInput(options.body, route.kind, context.uuid);
    const cap = await context.db.transaction(['meta'], 'readonly', tx => tx.get('meta', entityKey(guard.scope, 'memo-capability')));
    guard.check();
    if (cap?.can_edit !== true) throw fail('请先联网确认备忘录编辑权限。', 'OFFLINE_SCOPE_REQUIRED');
    const key = keyFor(guard.scope, route.kind, route.id);
    const old = await context.db.transaction(['entities'], 'readonly', tx => tx.get('entities', key));
    guard.check();
    const visible = offlineValue(old);
    if (visible?.deleted_at || visible?.deleted) throw fail('笔记已删除，请联网核对后恢复。', 'OFFLINE_MEMO_DELETED');
    const local = {...visible, ...body, id: route.id, version: body.version + 1,
      created_at: visible?.created_at || new Date(context.now()).toISOString(), updated_at: new Date(context.now()).toISOString(),
      deleted_at: null};
    const result = await context.outbox.enqueue({scope: guard.scope, entity_type: route.kind === 'notes' ? 'memo_note' : 'memo_group',
      entity_id: route.id, method: 'PUT', path, body, base: old?.server || null, local,
      assertActive: guard.check,
      ...(route.kind === 'notes' ? {protocol: 2, depends_on: ['memo-group:' + body.group_id]} : {}),
      ...(options.offlineUnknown ? {initial_status: 'unknown'} : {})});
    guard.check();
    return localDocument({local: {...result.entity.local, can_edit: true}, server: result.entity.server,
      operation: result.operation, conflict: null});
  }
  return {mutate};
}
export function createMemoOfflineAdapter(options) {
  const context = {getGeneration: () => 0, now: Date.now, uuid: () => crypto.randomUUID(), ...options};
  Object.assign(context, memoReads(context), memoCache(context), memoWrites(context));
  return {project: context.project, remember: context.remember, mutate: context.mutate, fence: context.fence};
}
