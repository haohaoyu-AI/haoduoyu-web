import {entityKey} from './db.mjs';
import {localDocument} from './document.mjs';

const uuidPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const hashPattern = /^[a-f0-9]{64}$/;
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = (message, code) => Object.assign(new Error(message), {code});
const missing = () => fail('此记录尚未完整保存在本机，请联网读取一次。', 'OFFLINE_CACHE_MISS');
const validDay = value => typeof value === 'string' && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const noteEntity = row => row?.entity_id?.startsWith('note-entry:');
const removed = row => Boolean(row && (row.deleted || row.deleted_at));
const liveOperation = row => !['acked', 'archived'].includes(row.status);
export function noteReadRoute(path) {
  const url = new URL(path, 'https://offline.invalid'), query = url.searchParams;
  if (url.origin !== 'https://offline.invalid' || url.hash) return null;
  if (url.pathname === '/note-entries' && [...query.keys()].every(key => ['category', 'date'].includes(key)) &&
      query.getAll('category').length === 1 && query.getAll('date').length === 1 &&
      ['life', 'work'].includes(query.get('category')) && validDay(query.get('date')))
    return {kind: 'note_entries', date: query.get('date'), category: query.get('category')};
  const match = /^\/note-entries\/([^/]+)$/.exec(url.pathname);
  return match && !url.search && uuidPattern.test(match[1]) ? {kind: 'note_entry', id: match[1].toLowerCase()} : null;
}
export function isNoteApiRow(row) {
  return Boolean(isObject(row) && !Object.hasOwn(row, 'entity_type') && uuidPattern.test(row.id) &&
    ['life', 'work'].includes(row.category) && validDay(row.date) && typeof row.text === 'string' &&
    new TextEncoder().encode(row.text).byteLength <= 65536 && Number.isSafeInteger(row.version) && row.version >= 1 &&
    typeof row.deleted === 'boolean' && typeof row.can_edit === 'boolean' && timestamp(row.created_at) && timestamp(row.updated_at) &&
    (row.deleted_at === null || timestamp(row.deleted_at)) && row.deleted === (row.deleted_at !== null) &&
    Number.isSafeInteger(row.change_seq) && row.change_seq >= 0 && hashPattern.test(row.content_hash));
}
function awareLabel(row) {
  return row?.labels_version === 1 && Object.hasOwn(row, 'label') && (row.label === null ||
    typeof row.label === 'string' && row.label.isWellFormed() && row.category === 'life' &&
    row.label === row.label.trim().normalize('NFC') && row.label.length > 0 && [...row.label].length <= 32 &&
    !['生活', '工作'].includes(row.label) && !/[\u0000-\u001f\u007f]/.test(row.label));
}
function checkedResponse(route, value, labelsV1) {
  const invalid = () => fail('碎碎念读取结果不完整，未覆盖本机内容。', 'OFFLINE_RESPONSE_INVALID');
  if (route.kind === 'note_entry') {
    if (!isNoteApiRow(value) || value.id !== route.id || labelsV1 && !awareLabel(value)) throw invalid();
    return structuredClone(value);
  }
  if (!isObject(value) || labelsV1 && value.labels_version !== 1 || value.category !== route.category || value.date !== route.date ||
      typeof value.can_edit !== 'boolean' || !Array.isArray(value.entries) || value.entries.length > 200) throw invalid();
  const ids = new Set();
  for (const row of value.entries) {
    if (!isNoteApiRow(row) || labelsV1 && !awareLabel(row) || row.category !== route.category || row.date !== route.date || row.deleted ||
        row.can_edit !== value.can_edit || ids.has(row.id)) throw invalid();
    ids.add(row.id);
  }
  return structuredClone(value);
}
function inRoute(entity, route) {
  if (!noteEntity(entity)) return false;
  if (route.kind === 'note_entry') return entity.entity_id === 'note-entry:' + route.id;
  const row = entity.dirty ? entity.local : entity.server || entity.api_server;
  return row?.category === route.category && row?.date === route.date;
}
function serverFence(rows, route, owner) {
  return JSON.stringify(rows.filter(row => row.scope === owner && inRoute(row, route)).map(row =>
    [row.entity_id, row.server || null, row.api_server || null, row.remote_missing === true]).sort((a, b) => a[0].localeCompare(b[0])));
}
function localValue(entity, capability) {
  const row = entity.dirty ? entity.local : entity.server;
  if (!row || !uuidPattern.test(row.id || row.source_id) || !['life', 'work'].includes(row.category) ||
      !validDay(row.date) || !Number.isSafeInteger(row.version) || row.version < 1) throw missing();
  if (!removed(row) && typeof row.text !== 'string') throw missing();
  const evidence = entity.label_evidence;
  const matches = evidence && evidence.version === row.version && evidence.category === row.category &&
    evidence.date === row.date && evidence.created_at === row.created_at;
  return {id: row.id || row.source_id, category: row.category, date: row.date,
    ...(awareLabel(row) ? {labels_version: 1, label: row.label} : matches ? {labels_version: 1, label: evidence.label} : {}),
    text: typeof row.text === 'string' ? row.text : entity.local?.text ?? entity.api_server?.text ?? '',
    version: row.version, deleted: removed(row), can_edit: capability === true,
    created_at: row.created_at || null, updated_at: row.updated_at || null};
}
function realServer(entity) {
  if (isNoteApiRow(entity.server)) return entity.server;
  return isNoteApiRow(entity.api_server) ? entity.api_server : null;
}
function projectEntity(entity, capability, operations, conflicts) {
  const local = localValue(entity, capability), server = realServer(entity);
  if (!entity.dirty && server?.version === local.version && server.deleted === local.deleted &&
      (server.deleted || server.text === local.text)) {
    if (awareLabel(server) && local.labels_version === 1 && server.label !== local.label)
      throw fail('标签记录发生变化，请联网核对。', 'OFFLINE_CACHE_CHANGED');
    return {...structuredClone(server), ...(local.labels_version === 1 ? {labels_version: 1, label: local.label} : {}),
      can_edit: capability === true};
  }
  const pending = operations.filter(row => row.entity_id === entity.entity_id && liveOperation(row)).sort((a, b) => a.seq - b.seq).at(-1);
  const conflict = conflicts.find(row => row.key === entity.conflict && row.resolved_at === null) ||
    conflicts.filter(row => row.entity_id === entity.entity_id && row.resolved_at === null).at(-1) || null;
  return localDocument({local, server: entity.dirty ? server : null, operation: entity.dirty ? pending || null : null,
    conflict: entity.dirty ? conflict : null});
}
function notesContext({db, getScope, getGeneration = () => 0, now = Date.now, labelsV1 = false}) {
  const capture = () => {
    const scope = getScope();
    if (!scope) throw fail('请先联网核实身份，本机内容已保留。', 'OFFLINE_SCOPE_REQUIRED');
    const generation = getGeneration();
    return {scope, active() {
      if (getScope() !== scope || getGeneration() !== generation)
        throw fail('身份范围已变化，本机内容未覆盖。', 'OFFLINE_SCOPE_CHANGED');
    }};
  };
  const load = (tx, scope) => Promise.all(['entities', 'outbox', 'conflicts'].map(store => tx.getAll(store))).then(rows =>
    Object.fromEntries(['entities', 'outbox', 'conflicts'].map((name, index) => [name, rows[index].filter(row => row.scope === scope)])));
  const capabilityKey = scope => entityKey(scope, 'capability:note-entry');
  return {db, capture, load, capabilityKey, now, labelsV1};
}
function readingMethods(context) {
  const {db, capture, load, capabilityKey} = context;
  async function capability() {
    const owner = capture();
    const record = await db.transaction(['meta'], 'readonly', tx => tx.get('meta', capabilityKey(owner.scope)));
    owner.active(); return record?.scope === owner.scope && typeof record.can_edit === 'boolean' ? record.can_edit : null;
  }
  async function read(path, route = noteReadRoute(path)) {
    if (!route) throw missing();
    const owner = capture();
    const result = await db.transaction(['entities', 'outbox', 'conflicts', 'meta'], 'readonly', async tx => {
      owner.active();
      const rows = await load(tx, owner.scope), cap = await tx.get('meta', capabilityKey(owner.scope));
      const capability = cap?.scope === owner.scope ? cap.can_edit : null;
      const cached = await tx.get('meta', entityKey(owner.scope, 'get:' + path));
      const snapshot = await tx.get('meta', entityKey(owner.scope, 'snapshot'));
      const complete = snapshot?.value?.index?.complete === true && snapshot.value.index.scope_id === owner.scope;
      const entities = rows.entities.filter(row => inRoute(row, route) && (row.dirty || !row.remote_missing && row.server));
      if (route.kind === 'note_entry') {
        if (!entities.length) throw missing();
        owner.active();
        return {data: projectEntity(entities[0], capability, rows.outbox, rows.conflicts),
          saved_at: cached?.saved_at || snapshot?.value?.verified_at || null};
      }
      if (!cached && !complete && !entities.some(row => row.dirty)) throw missing();
      if (complete && Array.isArray(snapshot.value.index.entities)) {
        const present = new Set(entities.map(row => row.entity_id));
        if (snapshot.value.index.entities.some(row => row.entity_id?.startsWith('note-entry:') &&
            row.date === route.date && row.entity_type === route.category + '_note' && !row.deleted_at && !present.has(row.entity_id)))
          throw missing();
      }
      const entries = entities.filter(row => !removed(row.dirty ? row.local : row.server))
        .map(row => projectEntity(row, capability, rows.outbox, rows.conflicts));
      if (entries.length > 200) throw fail('本机当日记录较多，原文已保留，请联网核对。', 'OFFLINE_CACHE_LIMIT');
      entries.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || a.id.localeCompare(b.id));
      owner.active();
      return {data: {category: route.category, date: route.date, can_edit: capability === true, entries,
        ...(!cached && !complete ? {offline_partial: true} : {})},
      saved_at: cached?.saved_at || snapshot?.value?.verified_at || null};
    });
    owner.active(); return result;
  }
  async function fence(pathOrRoute) {
    const route = typeof pathOrRoute === 'string' ? noteReadRoute(pathOrRoute) : pathOrRoute, owner = capture();
    if (!route) throw missing();
    const result = await db.transaction(['entities'], 'readonly', async tx => serverFence(await tx.getAll('entities'), route, owner.scope));
    owner.active(); return result;
  }
  return {read, capability, fence};
}
function writingMethods(context) {
  const {db, capture, capabilityKey, now} = context;
  async function write(path, route, value, {baseline} = {}) {
    route ||= noteReadRoute(path);
    if (!route) throw missing();
    const owner = capture(), data = checkedResponse(route, value, context.labelsV1);
    const incoming = route.kind === 'note_entry' ? [data] : data.entries;
    await db.transaction(['entities', 'meta'], 'readwrite', async tx => {
      owner.active();
      const rows = await tx.getAll('entities');
      if (baseline !== undefined && baseline !== serverFence(rows, route, owner.scope))
        throw fail('本机刚确认了新版本，请重新读取完整记录。', 'OFFLINE_CACHE_CHANGED');
      const found = new Set(incoming.map(row => 'note-entry:' + row.id));
      if (route.kind === 'note_entries') for (const old of rows) {
        if (old.scope === owner.scope && inRoute(old, route) && !found.has(old.entity_id))
          await tx.put('entities', {...old, remote_missing: true});
      }
      for (const row of incoming) {
        const entity_id = 'note-entry:' + row.id, key = entityKey(owner.scope, entity_id);
        const old = await tx.get('entities', key);
        if (Math.max(old?.server?.version || 0, old?.api_server?.version || 0) > row.version)
          throw fail('读取结果早于本机已确认版本，原文已保留。', 'OFFLINE_CACHE_CHANGED');
        const proof = awareLabel(row) ? {version: row.version, category: row.category, date: row.date,
          created_at: row.created_at, label: row.label} : null;
        if (proof && old?.label_evidence && (old.label_evidence.version > proof.version ||
            old.label_evidence.version === proof.version && JSON.stringify(old.label_evidence) !== JSON.stringify(proof)))
          throw fail('标签证据已变化，请联网核对。', 'OFFLINE_CACHE_CHANGED');
        await tx.put('entities', {...old, key, scope: owner.scope, entity_id, server: row, api_server: row,
          ...(proof ? {label_evidence: proof} : {}), remote_missing: false});
      }
      await tx.put('meta', {key: entityKey(owner.scope, 'get:' + path), scope: owner.scope, path, data, saved_at: now()});
      await tx.put('meta', {key: capabilityKey(owner.scope), scope: owner.scope, can_edit: data.can_edit, verified_at: now()});
      owner.active();
    });
    owner.active(); const result = await context.read(path, route); owner.active(); return result.data;
  }
  async function captureAcknowledged() {
    const owner = capture();
    const count = await db.transaction(['entities'], 'readwrite', async tx => {
      owner.active(); let count = 0;
      for (const entity of await tx.getAll('entities')) {
        if (entity.scope !== owner.scope || !noteEntity(entity) || !isNoteApiRow(entity.server) ||
            entity.api_server?.version > entity.server.version) continue;
        await tx.put('entities', {...entity, api_server: structuredClone(entity.server)}); count++;
      }
      owner.active(); return count;
    });
    owner.active(); return count;
  }
  return {write, captureAcknowledged};
}
export function createNotesCache(options) {
  const context = notesContext(options);
  const reading = readingMethods(context);
  Object.assign(context, reading);
  return {...reading, ...writingMethods(context)};
}
