import {assertOfflineData, entityKey} from './db.mjs';
import {createConflictStore} from './conflict.mjs';

export const RETRY_DELAYS = Object.freeze([5000, 15000, 60000, 300000]);
const prefixes = {todo: 'todo:', template: 'template:', note_entry: 'note-entry:',
  memo_note: 'memo-note:', memo_group: 'memo-group:'};
const uuidPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const active = operation => !['acked', 'archived'].includes(operation.status);
const deleted = value => Boolean(value && (value.deleted || value.deleted_at));
const ordered = rows => rows.sort((a, b) => a.seq - b.seq);

function identity(input, uuid) {
  const prefix = prefixes[input.entity_type];
  if (!prefix) throw new TypeError('This entity is read-only offline');
  const raw = input.entity_id || input.body?.id || uuid();
  const id = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
  if (!uuidPattern.test(id)) throw new TypeError('Offline entity requires a stable UUID');
  return {id: id.toLowerCase(), entity_id: prefix + id.toLowerCase()};
}

function operationFor(input, uuid, time) {
  const {id, entity_id} = identity(input, uuid), type = input.entity_type;
  const method = input.method?.toUpperCase();
  const base = type === 'todo' ? '/todos' : type === 'template' ? '/todo-templates' :
    type === 'note_entry' ? '/note-entries' : '/memos/' + (type === 'memo_note' ? 'notes' : 'groups');
  const restore = type === 'todo' && method === 'POST' && input.path === base + '/' + id + '/restore';
  const create = ['todo', 'template'].includes(type) && method === 'POST' && !restore;
  const allowed = type === 'todo' ? ['POST', 'PATCH', 'DELETE'] : type === 'template' ? ['POST', 'PATCH', 'DELETE'] :
    type === 'note_entry' ? ['PUT', 'DELETE'] : ['PUT'];
  if (!allowed.includes(method)) throw new TypeError('Unsupported offline mutation');
  const path = create ? base : base + '/' + id + (restore ? '/restore' : '');
  if (input.path && input.path !== path) throw new TypeError('Offline mutation path does not match its entity');
  const body = structuredClone(input.body || {});
  if (typeof body.text === 'string') {
    body.text = ['todo', 'template'].includes(type) ? body.text.trim() : body.text.replace(/\r\n?/g, '\n');
  }
  if (typeof body.title === 'string') body.title = body.title.trim();
  if (typeof body.body === 'string') body.body = body.body.replace(/\r\n?/g, '\n');
  if (create) {
    if (body.id && body.id.toLowerCase() !== id) throw new TypeError('Client UUID cannot change');
    body.id = id;
  }
  const expected = create ? 0 : body.version;
  if (!Number.isSafeInteger(expected) || expected < 0 || expected >= Number.MAX_SAFE_INTEGER) {
    throw new TypeError('Offline mutation requires an expected version');
  }
  const saveId = body.save_id || uuid();
  if (!uuidPattern.test(saveId)) throw new TypeError('Offline save_id requires a UUID');
  if (!['todo', 'template'].includes(type)) body.save_id = saveId.toLowerCase();
  else delete body.save_id;
  const operation = {id: uuid(), scope: input.scope, entity_type: type, entity_id, source_id: id,
    method, path, body, expected_version: expected, save_id: saveId.toLowerCase(), created_at: time,
    attempts: 0, next_attempt_at: 0, status: 'queued', base: input.base || null,
    local: {...structuredClone(input.local || body), id, version: expected + 1}, claim_owner: null, error: null};
  operation.key = entityKey(input.scope, 'operation:' + operation.id);
  assertOfflineData(operation);
  return operation;
}

async function digest(value) {
  const canonical = node => Array.isArray(node) ? node.map(canonical) : node && typeof node === 'object' ?
    Object.fromEntries(Object.keys(node).sort().map(key => [key, canonical(node[key])])) : node;
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function memoHash(row, kind) {
  const fields = ['id', 'title', 'position', 'version', 'change_seq', 'created_at', 'updated_at', 'deleted_at'];
  if (kind === 'memo_note') fields.push('group_id', 'body');
  return digest(Object.fromEntries(fields.map(field => [field, row[field]])));
}

function desired(operation, remote) {
  if (!remote || remote.id !== operation.source_id) return false;
  if (operation.method === 'DELETE') return deleted(remote);
  if (deleted(remote)) return false;
  const keys = operation.entity_type === 'todo' ?
    (operation.path.endsWith('/restore') ? ['date'] : operation.method === 'POST' ?
      ['date', 'text', ...(operation.body.template_id ? ['template_id'] : [])] : ['completed']) :
    operation.entity_type === 'template' ? ['text'] :
      Object.keys(operation.body).filter(key => !['version', 'save_id'].includes(key));
  return keys.every(key => remote[key] === operation.body[key]);
}

function expectedFields(operation, remote) {
  const base = operation.base;
  if (!base) return true;
  const fields = operation.entity_type === 'todo' ? (deleted(remote) ? ['date'] : ['date', 'text']) : [];
  return fields.every(key => base[key] === undefined || remote[key] === base[key]);
}

function validAcknowledgement(operation, remote) {
  if (operation.entity_type === 'template' && operation.method === 'DELETE') {
    return remote?.id === operation.source_id && remote.deleted === true;
  }
  if (operation.path.endsWith('/restore') && remote?.version === operation.expected_version) {
    return desired(operation, remote) && expectedFields(operation, remote);
  }
  return Number.isSafeInteger(remote?.version) && remote.version === operation.expected_version + 1 &&
    desired(operation, remote) && expectedFields(operation, remote);
}

function createContext(options) {
  const {db, request, getScope, now = Date.now, uuid = () => crypto.randomUUID(), timeout = 20000} = options;
  const owner = uuid(), conflicts = createConflictStore({db, now});
  const state = {phase: 'idle', pending: 0, error: null};
  const leaseKey = scope => entityKey(scope, 'outbox-lease');
  const checkScope = scope => {
    if (getScope() !== scope) throw Object.assign(new Error('Offline identity changed'), {code: 'OFFLINE_SCOPE_CHANGED'});
  };
  const list = scope => db.transaction(['outbox'], 'readonly', async tx =>
    ordered((await tx.getAll('outbox')).filter(value => value.scope === scope && active(value))));

  async function lease(scope) {
    checkScope(scope);
    return db.transaction(['meta'], 'readwrite', async tx => {
      const old = await tx.get('meta', leaseKey(scope));
      if (old && old.owner !== owner && old.expires_at > now()) return false;
      await tx.put('meta', {key: leaseKey(scope), owner, expires_at: now() + 90000});
      return true;
    });
  }

  async function network(scope, path, opts = {}) {
    checkScope(scope);
    if (!await lease(scope)) throw new Error('Offline sync lease changed');
    checkScope(scope);
    const controller = new AbortController();
    let timer;
    try {
      const expired = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Object.assign(new Error('Offline request outcome is unknown'), {code: 'OFFLINE_TIMEOUT'}));
        }, timeout);
      });
      const result = await Promise.race([request(path, {...opts, signal: controller.signal}), expired]);
      checkScope(scope);
      return result;
    } finally { clearTimeout(timer); }
  }

  return {db, request, getScope, now, uuid, timeout, owner, conflicts, state, leaseKey, checkScope, list, lease, network};
}

function storageMethods(context) {
  const {db, checkScope, uuid, now, owner} = context;
  async function enqueue(input) {
    checkScope(input.scope);
    const operation = operationFor(input, uuid, now());
    return db.transaction(['entities', 'outbox', 'meta'], 'readwrite', async tx => {
      checkScope(input.scope);
      const rows = (await tx.getAll('outbox')).filter(value => value.scope === input.scope && active(value));
      if (rows.length >= 1000) throw new Error('Offline queue is full; this edit was not saved');
      const previous = ordered(rows.filter(value => value.entity_id === operation.entity_id)).at(-1);
      const conflict = rows.some(value => value.entity_id === operation.entity_id && value.status === 'conflict');
      if (conflict || previous && operation.expected_version !== previous.expected_version + 1) {
        throw new Error('Offline edits must use the preceding local version');
      }
      const sequenceKey = entityKey(input.scope, 'outbox-sequence');
      const sequence = (await tx.get('meta', sequenceKey))?.value || 0;
      operation.seq = sequence + 1;
      const key = entityKey(input.scope, operation.entity_id), old = await tx.get('entities', key);
      const visible = old?.dirty ? old.local : old?.server || operation.base;
      operation.base = operation.base || old?.server || null;
      operation.local = {...visible, ...operation.local,
        ...(operation.entity_type === 'todo' && operation.path === '/todos' ? {completed: false} : {}),
        ...(operation.path.endsWith('/restore') ? {deleted: false, deleted_at: null} : {}),
        ...(operation.method === 'DELETE' ? {deleted: true} : {})};
      const entity = {...old, key, scope: input.scope, entity_id: operation.entity_id,
        server: old?.server || operation.base, local: operation.local, dirty: true};
      await tx.put('entities', entity);
      await tx.put('outbox', operation);
      await tx.put('meta', {key: sequenceKey, value: operation.seq});
      return {operation, entity};
    });
  }

  async function update(operation, fields) {
    return db.transaction(['outbox', 'meta'], 'readwrite', async tx => {
      const current = await tx.get('outbox', operation.key);
      const held = await tx.get('meta', context.leaseKey(operation.scope));
      if (!current || held?.owner !== owner || !['queued', 'unknown', 'sending'].includes(current.status)) return null;
      if (!Object.hasOwn(fields, 'claim_owner') && current.claim_owner !== owner) return null;
      const result = {...current, ...fields};
      await tx.put('outbox', result);
      return result;
    });
  }

  async function acknowledge(operation, remote) {
    checkScope(operation.scope);
    await db.transaction(['entities', 'outbox'], 'readwrite', async tx => {
      checkScope(operation.scope);
      const current = await tx.get('outbox', operation.key);
      if (!current || current.claim_owner !== owner || !['sending', 'unknown'].includes(current.status)) {
        throw new Error('Offline operation claim changed');
      }
      const key = entityKey(operation.scope, operation.entity_id), entity = await tx.get('entities', key);
      const confirmed = operation.entity_type === 'template' && operation.method === 'DELETE' ?
        {...operation.base, ...entity.server, ...remote, version: operation.expected_version + 1} : remote;
      await tx.delete('outbox', operation.key);
      const remaining = (await tx.getAll('outbox')).some(value => value.scope === operation.scope &&
        value.entity_id === operation.entity_id && active(value));
      await tx.put('entities', {...entity, server: confirmed, local: remaining ? entity.local : confirmed,
        dirty: remaining, conflict: null});
    });
  }

  return {enqueue, update, acknowledge};
}

function remoteMethods(context) {
  const {network} = context;
  async function readRemote(operation) {
    const scope = operation.scope, type = operation.entity_type;
    if (type === 'note_entry' || type === 'memo_note') {
      try { return await network(scope, operation.path); }
      catch (error) { if (error.status === 404) return null; throw error; }
    }
    if (type === 'memo_group') {
      const index = await network(scope, '/memos');
      if (index?.can_edit !== true || !Array.isArray(index.groups)) throw new Error('Invalid memo index');
      const row = index.groups.find(value => value.id === operation.source_id);
      return row ? {...row, can_edit: true} : null;
    }
    const path = type === 'template' ? '/todo-templates' : '/todos?date=' +
      (operation.body.date || operation.base?.date || operation.local.date);
    const index = await network(scope, path);
    if (!Array.isArray(index?.items)) throw new Error('Incomplete offline entity index');
    const row = index.items.find(value => value.id === operation.source_id);
    if (row || type === 'template') return row || null;
    const day = operation.body.date || operation.base?.date || operation.local.date;
    const snapshot = await network(scope, '/workbench-snapshot?date=' + day);
    if (snapshot?.complete !== true || snapshot.scope_id !== scope || !Array.isArray(snapshot.data?.todos)) {
      throw new Error('Todo absence could not be verified completely');
    }
    return snapshot.data.todos.find(value => value.source_id === operation.source_id) ?
      {...snapshot.data.todos.find(value => value.source_id === operation.source_id), id: operation.source_id} : null;
  }

  return {readRemote};
}

function receiptMethods(context) {
  const {network, readRemote} = context;
  async function receiptRead(operation) {
    const note = operation.entity_type === 'note_entry', scope = operation.scope;
    const receiptPath = (note ? '/note-entries' : '/memos') + '/operations/' + operation.save_id;
    const receipt = await network(scope, receiptPath);
    if (!receipt || typeof receipt.found !== 'boolean') throw new Error('Invalid offline save receipt');
    const remote = await readRemote(operation);
    if (receipt.found) {
      const hash = note ? remote?.content_hash : remote && await memoHash(remote, operation.entity_type);
      const expectedHash = note ? receipt.content_hash : receipt.entity_hash;
      const kind = operation.entity_type === 'memo_note' ? 'notes' : 'groups';
      if (receipt.id === operation.source_id && receipt.version === operation.expected_version + 1 &&
          (note || receipt.kind === kind) && remote?.can_edit === true &&
          remote.version === receipt.version && hash === expectedHash && desired(operation, remote)) {
        return {result: 'ack', remote};
      }
      return {result: 'conflict', remote};
    }
    if (!remote && operation.expected_version === 0) {
      const path = note ? '/note-entries?category=' + operation.body.category + '&date=' + operation.body.date : '/memos';
      const index = await network(scope, path);
      if (index?.can_edit !== true) throw new Error('Offline editor capability could not be verified');
      const rows = note ? index.entries : operation.entity_type === 'memo_note' ? index.notes : index.groups;
      if (!Array.isArray(rows) || rows.some(value => value.id === operation.source_id)) {
        throw new Error('Offline create absence could not be verified');
      }
      return {result: 'retry', remote};
    }
    if (remote?.can_edit === true && !deleted(remote) && remote.version === operation.expected_version) {
      return {result: 'retry', remote};
    }
    return {result: 'conflict', remote};
  }

  return {receiptRead};
}

function processingMethods(context) {
  const {receiptRead, readRemote, acknowledge, update, network, conflicts, now, owner} = context;
  async function reconcile(operation) {
    if (!['todo', 'template'].includes(operation.entity_type)) return receiptRead(operation);
    const remote = await readRemote(operation);
    if (remote && remote.version === operation.expected_version + 1 && desired(operation, remote) &&
        expectedFields(operation, remote)) return {result: 'ack', remote};
    if (!remote && operation.expected_version === 0) return {result: 'retry', remote};
    if (operation.path.endsWith('/restore') && remote?.version === operation.expected_version && deleted(remote)) {
      return {result: 'retry', remote};
    }
    if (remote && !deleted(remote) && remote.version === operation.expected_version && expectedFields(operation, remote)) {
      return {result: 'retry', remote};
    }
    return {result: 'conflict', remote};
  }

  async function fail(operation, error) {
    if ([409, 410, 404].includes(error.status)) {
      let remote = null;
      try { remote = await readRemote(operation); } catch {}
      return conflicts.record({operation, remote, reason: deleted(remote) ? 'deleted' : error.code || 'version'});
    }
    const attempts = operation.attempts + 1;
    const delay = RETRY_DELAYS[Math.min(attempts - 1, RETRY_DELAYS.length - 1)];
    const status = [401, 403].includes(error.status) ? 'paused' :
      error.status && error.status < 500 && error.status !== 429 ? 'blocked' : 'unknown';
    return update(operation, {status, attempts, next_attempt_at: now() + (error.status === 429 ? Math.max(60000, delay) : delay),
      error: error.code || 'OFFLINE_UNKNOWN'});
  }

  async function process(operation) {
    try {
      const claimed = await update(operation, {claim_owner: owner});
      if (!claimed) return;
      if (['unknown', 'sending'].includes(operation.status)) {
        const checked = await reconcile(claimed);
        if (checked.result === 'ack') return acknowledge(claimed, checked.remote);
        if (checked.result === 'conflict') return conflicts.record({operation: claimed, remote: checked.remote,
          reason: deleted(checked.remote) ? 'deleted' : 'version'});
      }
      const sending = await update(claimed, {status: 'sending'});
      if (!sending) return;
      const remote = await network(operation.scope, operation.path, {method: operation.method, body: operation.body});
      if (!validAcknowledgement(operation, remote)) throw new Error('Invalid offline write acknowledgement');
      return acknowledge(sending, remote);
    } catch (error) { return fail({...operation, claim_owner: owner}, error); }
  }

  return {reconcile, fail, process};
}

function executionMethods(context) {
  const {getScope, lease, state, list, checkScope, process, db, leaseKey, owner, now} = context;
  let running = null;
  async function run() {
    const scope = getScope();
    if (!scope) return {phase: 'paused', pending: 0};
    if (!await lease(scope)) return {phase: 'busy', pending: (await list(scope)).length};
    state.phase = 'syncing'; state.error = null;
    try {
      for (let count = 0; count < 1000; count++) {
        checkScope(scope);
        const rows = await list(scope), first = new Map();
        for (const row of rows) if (!first.has(row.entity_id)) first.set(row.entity_id, row);
        const operation = [...first.values()].find(value =>
          ['queued', 'unknown', 'sending'].includes(value.status) && value.next_attempt_at <= now());
        if (!operation) break;
        await process(operation);
      }
      const pending = await list(scope);
      state.pending = pending.length;
      state.phase = pending.some(value => value.status === 'conflict') ? 'conflict' : pending.length ? 'pending' : 'synced';
      return {...state};
    } catch (error) {
      state.phase = 'paused'; state.error = error.code || 'OFFLINE_UNKNOWN';
      return {...state};
    } finally {
      await db.transaction(['meta'], 'readwrite', async tx => {
        if ((await tx.get('meta', leaseKey(scope)))?.owner === owner) await tx.delete('meta', leaseKey(scope));
      });
    }
  }

  function drain() {
    if (!running) running = run().finally(() => { running = null; });
    return running;
  }

  async function resume(scope) {
    checkScope(scope);
    return db.transaction(['outbox'], 'readwrite', async tx => {
      checkScope(scope);
      let count = 0;
      for (const operation of await tx.getAll('outbox')) {
        if (operation.scope === scope && operation.status === 'paused') {
          await tx.put('outbox', {...operation, status: 'unknown', next_attempt_at: 0, claim_owner: null});
          count++;
        }
      }
      return count;
    });
  }

  return {run, drain, resume};
}

export function createOutbox(options) {
  const context = createContext(options);
  Object.assign(context, storageMethods(context));
  Object.assign(context, remoteMethods(context));
  Object.assign(context, receiptMethods(context));
  Object.assign(context, processingMethods(context));
  Object.assign(context, executionMethods(context));
  const {enqueue, drain, resume, list, state, conflicts} = context;
  return {enqueue, drain, resume, list, state, conflicts};
}
