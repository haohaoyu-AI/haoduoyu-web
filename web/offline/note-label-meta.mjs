import {entityKey} from './db.mjs';

const scopePattern = /^[a-f0-9]{64}$/;
const uuidPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const invalid = () => Object.assign(new Error('标签尚未完整核实，请联网读取。'), {code:'OFFLINE_NOTE_LABEL_UNKNOWN'});
const validLabel = label => typeof label === 'string' && label.isWellFormed() && label === label.trim().normalize('NFC') &&
  [...label].length >= 1 && [...label].length <= 32 && !/[\u0000-\u001f\u007f]/.test(label) && !['生活','工作'].includes(label);
const identity = row => {
  if (!row || !uuidPattern.test(row.id) || !['life','work'].includes(row.category) ||
      typeof row.created_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(row.created_at) ||
      !Number.isFinite(Date.parse(row.created_at)) || !Number.isSafeInteger(row.version) || row.version < 1) throw invalid();
  return {id:row.id.toLowerCase(), category:row.category, created_at:row.created_at, version:row.version};
};
const serverEvidence = row => Boolean(row && /^\d{4}-\d{2}-\d{2}$/.test(row.date || '') &&
  Number.isFinite(Date.parse(row.date + 'T00:00:00Z')) && new Date(row.date + 'T00:00:00Z').toISOString().slice(0,10) === row.date &&
  typeof row.text === 'string' && new TextEncoder().encode(row.text).byteLength <= 65536 &&
  Number.isSafeInteger(row.change_seq) && row.change_seq >= 0 && typeof row.can_edit === 'boolean' &&
  typeof row.deleted === 'boolean' && (row.deleted_at === null || typeof row.deleted_at === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(row.deleted_at) && Number.isFinite(Date.parse(row.deleted_at))) &&
  row.deleted === (row.deleted_at !== null) && typeof row.updated_at === 'string' &&
  /^\d{4}-\d{2}-\d{2}T/.test(row.updated_at) && Number.isFinite(Date.parse(row.updated_at)) &&
  /^[a-f0-9]{64}$/.test(row.content_hash || ''));

// The caller MUST validate a live label-aware server response first. A legacy
// response or snapshot lacking an explicit label is not evidence of a label.
// The transaction-level methods allow the caller to persist this metadata and
// the corresponding confirmed entity together in one IndexedDB transaction.
export function createNoteLabelMeta({db, getScope, getGeneration = () => 0}) {
  const capture = () => {
    const scope = getScope(), generation = getGeneration();
    if (!scopePattern.test(scope || '')) throw invalid();
    return {scope, assert() { if (getScope() !== scope || getGeneration() !== generation) throw invalid(); }};
  };
  const key = (scope,id) => entityKey(scope, 'note-label-v2:' + id);
  async function confirmInTransaction(tx, row, owner = capture()) {
    owner.assert();
    const id = identity(row);
    if (!serverEvidence(row) || !Object.hasOwn(row, 'label') ||
        !(row.label === null || id.category === 'life' && validLabel(row.label))) throw invalid();
    const saved = await tx.get('meta', key(owner.scope,id.id));
    owner.assert();
    if (saved && (saved.scope !== owner.scope || saved.id !== id.id || saved.category !== id.category ||
        saved.created_at !== id.created_at || saved.version > id.version ||
        saved.version === id.version && saved.label !== row.label)) throw invalid();
    await tx.put('meta', {key:key(owner.scope,id.id), scope:owner.scope, ...id, label:row.label});
    owner.assert();
  }
  async function lookupInTransaction(tx, row, owner = capture()) {
    owner.assert();
    const id = identity(row), saved = await tx.get('meta', key(owner.scope,id.id));
    owner.assert();
    // An unverified newer entity may have a different label. Keep the prior
    // evidence but surface unknown until that exact server version is read.
    if (!saved || saved.scope !== owner.scope || saved.id !== id.id || saved.category !== id.category ||
        saved.created_at !== id.created_at || saved.version !== id.version) return {known:false};
    if (!(saved.label === null || id.category === 'life' && validLabel(saved.label))) return {known:false};
    return {known:true, label:saved.label, display:saved.label ?? (id.category === 'life' ? '生活' : '工作')};
  }
  async function confirm(row) {
    const owner = capture();
    await db.transaction(['meta'], 'readwrite', tx => confirmInTransaction(tx,row,owner));
    owner.assert();
  }
  async function lookup(row) {
    const owner = capture();
    const result = await db.transaction(['meta'], 'readonly', tx => lookupInTransaction(tx,row,owner));
    owner.assert(); return result;
  }
  return {capture, confirmInTransaction, lookupInTransaction, confirm, lookup};
}
