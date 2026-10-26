import {isNoteApiRow} from './notes.mjs';

const prefixes = {todo: 'todo:', template: 'template:', note_entry: 'note-entry:',
  memo_note: 'memo-note:', memo_group: 'memo-group:'};
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const version = value => Number.isSafeInteger(value) && value >= 1 && value < Number.MAX_SAFE_INTEGER;
const sequence = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const invalid = () => {
  throw Object.assign(new Error('线上内容读取不完整，原文已保留，请重新核对。'), {code: 'OFFLINE_RESPONSE_INVALID'});
};
const removed = row => row?.deleted === true || row?.deleted_at !== null && row?.deleted_at !== undefined;
const own = (value, key) => Object.hasOwn(value, key);
function day(value) {
  return typeof value === 'string' && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
function shortText(value) {
  return typeof value === 'string' && value.isWellFormed() && value.trim().length > 0 && value.length <= 500 && !value.includes('\0');
}
function body(value) {
  return typeof value === 'string' && value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\r]/.test(value) &&
    new TextEncoder().encode(value).byteLength <= 65536;
}
function identity(row, id, type) {
  return object(row) && (row.id === id || row.id === undefined && row.source_id === id) &&
    (!own(row, 'source_id') || row.source_id === id) && (!own(row, 'entity_id') || row.entity_id === prefixes[type] + id);
}
function deletion(row) {
  return (!own(row, 'deleted') || typeof row.deleted === 'boolean') &&
    (!own(row, 'deleted_at') || row.deleted_at === null || timestamp(row.deleted_at)) &&
    (!own(row, 'deleted') || !own(row, 'deleted_at') || row.deleted === (row.deleted_at !== null));
}
function basicRemote(row, id, type) {
  if (!identity(row, id, type) || !version(row.version) || !deletion(row)) invalid();
  if (type === 'todo' && (!day(row.date) || !removed(row) && (!shortText(row.text) || typeof row.completed !== 'boolean'))) invalid();
  if (type === 'template' && !removed(row) && !shortText(row.text)) invalid();
  return structuredClone(row);
}
function noteRemote(row, id) {
  if (!isNoteApiRow(row) || row.id !== id || row.can_edit !== true || !body(row.text)) invalid();
  return structuredClone(row);
}
function memoMeta(row, note = false) {
  if (!object(row) || !uuid.test(row.id) || typeof row.title !== 'string' || !row.title.isWellFormed() ||
      !row.title.trim() || [...row.title].length > 120 || /[\u0000-\u001f\u007f]/.test(row.title) ||
      !Number.isSafeInteger(row.position) || row.position < 0 || row.position > 1000000 || !version(row.version) ||
      !sequence(row.change_seq) || !timestamp(row.created_at) || !timestamp(row.updated_at) ||
      row.deleted_at !== null && !timestamp(row.deleted_at) || note && !uuid.test(row.group_id)) invalid();
  if (own(row, 'deleted') && row.deleted !== (row.deleted_at !== null)) invalid();
  if (own(row, 'active_note_count') && (!sequence(row.active_note_count) || row.active_note_count > 200)) invalid();
}
function memoIndex(value) {
  if (!object(value) || value.can_edit !== true || !Array.isArray(value.groups) || value.groups.length > 32 ||
      !Array.isArray(value.notes) || value.notes.length > 200) invalid();
  const groups = new Set(), notes = new Set();
  for (const row of value.groups) { memoMeta(row); if (groups.has(row.id)) invalid(); groups.add(row.id); }
  for (const row of value.notes) {
    memoMeta(row, true); if (notes.has(row.id) || !groups.has(row.group_id)) invalid(); notes.add(row.id);
  }
  return structuredClone(value);
}
function memoDetail(row, id, index) {
  if (!identity(row, id, 'memo_note') || row.can_edit !== true || !body(row.body)) invalid();
  memoMeta(row, true);
  const metadata = index.notes.find(value => value.id === id);
  const fields = ['id', 'title', 'position', 'version', 'change_seq', 'created_at', 'updated_at', 'deleted_at', 'group_id'];
  if (!metadata || fields.some(key => metadata[key] !== row[key])) invalid();
  return structuredClone(row);
}
function noteAbsence(value, local, id) {
  if (!object(value) || value.can_edit !== true || value.category !== local.category || value.date !== local.date ||
      !Array.isArray(value.entries) || value.entries.length > 200) invalid();
  const ids = new Set();
  for (const row of value.entries) {
    noteRemote(row, row?.id);
    if (row.id === id || ids.has(row.id) || row.deleted || row.category !== local.category || row.date !== local.date) invalid();
    ids.add(row.id);
  }
}
function conflictIdentity(conflict) {
  const operation = conflict?.operation, type = operation?.entity_type, id = operation?.source_id;
  if (!prefixes[type] || !uuid.test(id) || typeof conflict.scope !== 'string' || !conflict.scope ||
      operation.scope !== conflict.scope || operation.entity_id !== prefixes[type] + id || conflict.entity_id !== operation.entity_id) invalid();
  return {operation, type, id, scope: conflict.scope};
}
export function createConflictPreparation({readRemote, network}) {
  async function guarded(read, assertActive) {
    assertActive(); const value = await read(); assertActive(); return value;
  }
  return async function prepare(conflict, {assertActive = () => {}} = {}) {
    assertActive();
    const {operation, type, id, scope} = conflictIdentity(conflict);
    if (type === 'memo_group' || type === 'memo_note') {
      const index = memoIndex(await guarded(() => network(scope, '/memos'), assertActive));
      if (type === 'memo_group') {
        const row = index.groups.find(value => value.id === id);
        return {remote: row ? {...row, can_edit: true} : null, groups: index.groups};
      }
      const row = await guarded(() => readRemote(operation), assertActive);
      if (row === null) {
        if (index.notes.some(value => value.id === id)) invalid();
        return {remote: null, groups: index.groups};
      }
      return {remote: memoDetail(row, id, index), groups: index.groups};
    }
    const remote = await guarded(() => readRemote(operation), assertActive);
    if (remote !== null) return {remote: type === 'note_entry' ? noteRemote(remote, id) : basicRemote(remote, id, type), groups: []};
    if (type === 'note_entry') {
      const local = own(conflict, 'review_local') ? conflict.review_local : conflict.local;
      if (!object(local) || !['life', 'work'].includes(local.category) || !day(local.date)) invalid();
      const path = '/note-entries?category=' + local.category + '&date=' + local.date;
      noteAbsence(await guarded(() => network(scope, path), assertActive), local, id);
    }
    return {remote: null, groups: []};
  };
}
