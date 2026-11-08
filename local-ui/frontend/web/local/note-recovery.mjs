import {canonical, digest} from './common.mjs';

// Retain the original archive. Only an exact, selected snapshot with a matching
// committed note/receipt can be excluded from automatic hydration on a later run.
const FORMAT = 'haoduoyu-saved-note-draft-v1';
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const labels = value => Array.isArray(value) && value.every(item => typeof item === 'string') && new Set(value).size === value.length;
const sameLabels = (a, b) => labels(a) && labels(b) && canonical([...a].sort()) === canonical([...b].sort());
const baseRecord = (record, scope) => record?.scope === scope && record.draft_kind === 'note_entry' &&
  typeof record.key === 'string' && typeof record.write_id === 'string' && record.write_id &&
  record.data?.kind === 'note_entry' && uuid(record.data.id) && ['life', 'work'].includes(record.data.category) &&
  /^\d{4}-\d{2}-\d{2}$/.test(record.data.date || '') && typeof record.data.draft === 'string' &&
  record.data.draft.length <= 262144 && Number.isSafeInteger(record.data.version) && record.data.version >= 0 &&
  labels(record.data.labels) && !record.data.remote && !record.data.deleted &&
  !record.data.localQueued && record.data.labelKnown !== false &&
  (!Number.isSafeInteger(record.data.localVersion) || record.data.localVersion <= record.data.version);
const eligible = (record, scope) => baseRecord(record, scope) && !record.data.pending &&
  !['unknown', 'conflict', 'oversize'].includes(record.data.phase);
const invalid = () => Object.assign(new Error('恢复草稿的保存凭据已变化，本次未确认保存。'),
  {code: 'LOCAL_NOTE_RECOVERY', localNotSaved: true});
const scopeChanged = () => Object.assign(new Error('草稿身份已变化，本次没有确认保存。'),
  {code: 'OFFLINE_SCOPE_CHANGED', localNotSaved: true});
const proofKey = (scope, source) => JSON.stringify([scope, FORMAT, source.key, source.write_id]);
const receiptKey = (scope, saveId) => JSON.stringify([scope, 'receipt:note-entry', saveId]);
const noteKey = (scope, id) => JSON.stringify([scope, 'note_entry', id]);
const draftKey = (scope, id, owner) => JSON.stringify([scope, 'draft:note_entry:' + id + ':' + owner]);
const validTimestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
function validRequest(source, request, expectedLabels) {
  const keys = ['version', 'save_id', 'category', 'date', 'text', ...(Object.hasOwn(request || {}, 'labels') ? ['labels'] : [])];
  return request && canonical(Object.keys(request).sort()) === canonical(keys.sort()) && uuid(request.save_id) &&
    request.version === source.data.version && request.category === source.data.category && request.date === source.data.date &&
    typeof request.text === 'string' && request.text.length <= 262144 && labels(expectedLabels) &&
    (!Object.hasOwn(request, 'labels') || sameLabels(request.labels, expectedLabels));
}
function operationMatches(operation, body) {
  return operation?.kind === 'put' && operation.saveId === body?.save_id && operation.version === body.version &&
    operation.text === body.text && !Object.hasOwn(operation, 'label') && !Object.hasOwn(operation, 'expectedLabel') &&
    Object.hasOwn(operation, 'labels') === Object.hasOwn(body, 'labels') &&
    (!Object.hasOwn(body, 'labels') || sameLabels(operation.labels, body.labels));
}
function submittedMatches(source, scope, owner, body, expectedLabels) {
  const operation = source?.data?.pending;
  return baseRecord(source, scope) && typeof owner === 'string' && source.draft_owner === owner &&
    source.key === draftKey(scope, source.data.id, owner) && source.data.phase === 'saving' &&
    source.data.draft === body.text && sameLabels(source.data.labels, expectedLabels) &&
    !operation?.uncertain && !operation?.checking && !operation?.retryReady && !operation?.invalid &&
    operationMatches(operation, body) && validRequest(source, body, expectedLabels);
}
function receiptMatches(receipt, source, request, expectedLabels, version, contentHash) {
  const row = receipt?.response, result = receipt?.receipt;
  return receipt?.fingerprint === canonical({method: 'PUT', path: '/note-entries/' + source.data.id, ...request}) &&
    result?.id === source.data.id && result.version === version && result.content_hash === contentHash &&
    row?.id === source.data.id && row.category === source.data.category && row.date === source.data.date &&
    row.version === version && row.text === request.text && !row.deleted_at &&
    row.content_hash === contentHash && sameLabels(row.labels, expectedLabels);
}

export function createNoteRecoveryJournal({db, getScope, getGeneration = () => 0, draftOwner}) {
  if (!db?.transaction || typeof getScope !== 'function') throw new TypeError('Explicit note recovery storage required');
  const observed = new WeakMap(), bindings = new WeakMap(), intents = new WeakMap(), requests = new WeakMap();
  function observe(records) {
    for (const record of records) if (record && typeof record === 'object' && record.scope === getScope() && record.draft_kind === 'note_entry')
      observed.set(record, structuredClone(record));
    return records;
  }
  function bind(item, record, stillActive = () => true) {
    const source = observed.get(record), scope = getScope(), generation = getGeneration();
    if (!item || !eligible(source, scope) || canonical(source) !== canonical(record) ||
        item.id !== source.data.id || item.category !== source.data.category || item.date !== source.data.date ||
        item.draft !== source.data.draft || !sameLabels(item.labels, source.data.labels) || !stillActive()) return false;
    bindings.set(item, {source, scope, generation, stillActive});
    return true;
  }
  const active = bound => bound.scope === getScope() && bound.generation === getGeneration() && bound.stillActive();
  function captureRequest(item, body) {
    const operation = item?.pending, bound = bindings.get(item);
    if (!item || !uuid(item.id) || !operationMatches(operation, body)) return null;
    const expectedLabels = Object.hasOwn(body, 'labels') ? body.labels : item.labels;
    const identity = {data:{id:item.id, category:item.category, date:item.date, version:operation.version}};
    if (!Number.isSafeInteger(operation.version) || operation.version < 0 || !validRequest(identity, body, expectedLabels) || bound && !active(bound)) return null;
    const scope = getScope(), generation = getGeneration();
    const context = {scope, generation, stillActive:() => item.pending === operation && (!bound || active(bound))};
    const origin = bound && item.recoveredBaseline?.version === bound.source.data.version &&
      eligible(bound.source, scope) && validRequest(bound.source, body, expectedLabels) ? bound.source : null;
    const intent = Object.freeze({});
    intents.set(intent, {context, identity, origin, body:structuredClone(body), labels:structuredClone(expectedLabels)});
    return intent;
  }
  async function prepare(intent) {
    const request = intents.get(intent);
    if (!request) throw invalid();
    const {context, identity, origin, body} = request;
    if (!active(context)) throw scopeChanged();
    // The runtime calls this inside the read boundary synchronously enqueued at
    // captureRequest time. Later captures cannot be selected by this read.
    const own = await db.transaction(['meta'], 'readonly', tx => tx.get('meta', draftKey(context.scope, identity.data.id, draftOwner)));
    if (!active(context)) throw scopeChanged();
    const sources = [];
    if (origin) sources.push({source:origin, role:'origin'});
    if (submittedMatches(own, context.scope, draftOwner, body, request.labels)) sources.push({source:own, role:'submitted'});
    if (!sources.length) return null;
    // Never await WebCrypto inside an IndexedDB transaction.
    for (const value of sources) value.hash = await digest(value.source);
    if (!active(context)) throw scopeChanged();
    const token = Object.freeze({});
    requests.set(token, {...request, sources});
    return token;
  }
  function commitHook(token, path, body) {
    const request = requests.get(token);
    if (!request || path !== '/note-entries/' + request.identity.data.id || canonical(body) !== canonical(request.body)) throw invalid();
    const payload = request.body;
    return async (tx, value) => {
      const {context, identity} = request;
      if (!active(context)) throw scopeChanged();
      const receipt = await tx.get('meta', receiptKey(context.scope, payload.save_id));
      if (!active(context)) throw scopeChanged();
      const source = identity;
      if (!value || value.id !== source.data.id || value.category !== source.data.category || value.date !== source.data.date ||
          value.version !== payload.version + 1 || value.text !== payload.text || value.deleted || value.can_edit !== true ||
          !sameLabels(value.labels, request.labels) || !/^[a-f0-9]{64}$/i.test(value.content_hash || '') ||
          !receiptMatches(receipt, source, payload, request.labels, value.version, value.content_hash)) throw invalid();
      for (const captured of request.sources) {
        const source = captured.source, current = await tx.get('meta', source.key);
        if (!active(context)) throw scopeChanged();
        // Independently compare each exact row. C/A2 can replace the current
        // owner's revision without preventing confirmation of the old origin.
        if (canonical(current) !== canonical(source)) continue;
        await tx.put('meta', {key: proofKey(context.scope, source), format: FORMAT, scope: context.scope,
          source_key: source.key, source_write_id: source.write_id, source_sha256: captured.hash,
          source_role:captured.role, ...(captured.role === 'submitted' ? {submitted_owner:draftOwner} : {}),
          note_id: source.data.id, save_id: payload.save_id, request:payload, labels:request.labels,
          saved_version: value.version, content_hash: value.content_hash});
        if (!active(context)) throw scopeChanged();
      }
    };
  }
  async function wasSaved(record) {
    const source = observed.get(record), scope = getScope(), generation = getGeneration();
    if (!baseRecord(source, scope) || canonical(source) !== canonical(record)) return false;
    const sourceHash = await digest(source);
    if (scope !== getScope() || generation !== getGeneration()) throw scopeChanged();
    const verified = await db.transaction(['meta', 'entities'], 'readonly', async tx => {
      const current = await tx.get('meta', source.key), proof = await tx.get('meta', proofKey(scope, source));
      if (scope !== getScope() || generation !== getGeneration()) throw scopeChanged();
      if (canonical(current) !== canonical(source) || !proof || proof.format !== FORMAT || proof.scope !== scope ||
          proof.source_key !== source.key || proof.source_write_id !== source.write_id || proof.source_sha256 !== sourceHash ||
          proof.note_id !== source.data.id || !validRequest(source, proof.request, proof.labels) || proof.save_id !== proof.request.save_id ||
          proof.saved_version !== proof.request.version + 1 || !/^[a-f0-9]{64}$/i.test(proof.content_hash || '')) return false;
      if (!(proof.source_role === 'origin' && eligible(source, scope) || proof.source_role === 'submitted' &&
          submittedMatches(source, scope, proof.submitted_owner, proof.request, proof.labels))) return false;
      const receipt = await tx.get('meta', receiptKey(scope, proof.save_id));
      const entity = await tx.get('entities', noteKey(scope, source.data.id)), note = entity?.value;
      if (scope !== getScope() || generation !== getGeneration()) throw scopeChanged();
      if (!receiptMatches(receipt, source, proof.request, proof.labels, proof.saved_version, proof.content_hash) ||
          entity?.scope !== scope || entity.kind !== 'note_entry' || entity.id !== source.data.id ||
          note?.id !== source.data.id || note.category !== source.data.category || note.date !== source.data.date ||
          !Number.isSafeInteger(note.version) || note.version < proof.saved_version ||
          !Number.isSafeInteger(note.change_seq) || note.change_seq < 1 || typeof note.text !== 'string' || !labels(note.labels) ||
          !validTimestamp(note.created_at) || !validTimestamp(note.updated_at) ||
          note.deleted_at !== null && !validTimestamp(note.deleted_at) ||
          !/^[a-f0-9]{64}$/i.test(note.content_hash || '') ||
          note.version === proof.saved_version && note.content_hash !== proof.content_hash) return false;
      return {note, receipt:receipt.response};
    });
    if (!verified) return false;
    // Missing or corrupt canonical data must leave the archive recoverable.
    // Hash after the readonly transaction, never during an IndexedDB await gap.
    for (const document of [verified.note, verified.receipt]) {
      const {content_hash, ...value} = document;
      if (await digest(value) !== content_hash) return false;
    }
    if (scope !== getScope() || generation !== getGeneration()) throw scopeChanged();
    return true;
  }
  return {observe, bind, captureRequest, prepare, commitHook, wasSaved};
}
