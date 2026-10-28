import {assertOfflineData, entityKey} from './db.mjs';
import {createConflictStore} from './conflict.mjs';
import {createConflictDecisions} from './conflict-decisions.mjs';
import {createConflictPreparation} from './conflict-transport.mjs';
import {recordResolutionAck, recordResolutionFailure} from './resolution-ledger.mjs';

export const RETRY_DELAYS = Object.freeze([5000, 15000, 60000, 300000]);
const prefixes = {unscheduled_todo: 'unscheduled_todo:', todo: 'todo:', template: 'template:', note_entry: 'note-entry:',
  memo_note: 'memo-note:', memo_group: 'memo-group:'};
const uuidPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const active = operation => !['acked', 'archived'].includes(operation.status);
const deleted = value => Boolean(value && (value.deleted || value.deleted_at));
const ordered = rows => rows.sort((a, b) => a.seq - b.seq);
const needsUpgrade = () => Object.assign(new Error('此本机操作需新版页面处理，原内容已保留。'), {code: 'OFFLINE_UPGRADE_REQUIRED'});
function canonicalRoute(operation) {
  const {entity_type: type, source_id: id, entity_id, method, path} = operation;
  if (!uuidPattern.test(id) || entity_id !== prefixes[type] + id) return false;
  const base = type === 'todo' ? '/todos' : type === 'template' ? '/todo-templates' :
    type === 'note_entry' ? '/note-entries' : type === 'unscheduled_todo' ? '/unscheduled-todos' : '/memos/' + (type === 'memo_note' ? 'notes' : 'groups');
  if (['todo', 'template', 'unscheduled_todo'].includes(type)) {
    if (method === 'POST') return path === base || ['todo', 'unscheduled_todo'].includes(type) && path === base + '/' + id + '/restore';
    return ['PATCH', 'DELETE'].includes(method) && path === base + '/' + id;
  }
  return (method === 'PUT' || type === 'note_entry' && method === 'DELETE') && path === base + '/' + id;
}
function dispatchCapabilities(options) {
  const types = new Set(options.enabledTypes || Object.keys(prefixes));
  const protocols = new Set(options.supportedProtocols || [1, 2, 3]);
  const memoDependencies = operation => options.supportedDependencies === true && operation.entity_type === 'memo_note' &&
    operation.method === 'PUT' && uuidPattern.test(operation.body?.group_id) && Array.isArray(operation.depends_on) &&
    operation.depends_on.length === 1 && operation.depends_on[0] === 'memo-group:' + operation.body.group_id;
  const decision = operation => {
    let origin;
    try { origin = JSON.parse(operation.origin_conflict); } catch { return false; }
    return options.resolutionReceipts !== false && uuidPattern.test(operation.resolution_id) && operation.resolution_receipt === 1 &&
      Array.isArray(origin) && origin.length === 2 && origin[0] === operation.scope && typeof origin[1] === 'string' &&
      origin[1].startsWith('conflict:') && (!Object.hasOwn(operation, 'depends_on') || memoDependencies(operation));
  };
  const canDispatch = operation => {
    const protocol = operation?.protocol === undefined ? 1 : operation.protocol;
    return Boolean(operation && Object.hasOwn(prefixes, operation.entity_type) && types.has(operation.entity_type) &&
      Number.isSafeInteger(protocol) && protocols.has(protocol) && canonicalRoute(operation) &&
      (protocol === 1 && operation.entity_type !== 'unscheduled_todo' && !Object.hasOwn(operation, 'depends_on') ||
        protocol === 2 && memoDependencies(operation) ||
        protocol === 3 && decision(operation) || protocol === 4 && operation.entity_type === 'unscheduled_todo' && !Object.hasOwn(operation, 'depends_on')));
  };
  const requireDispatch = operation => { if (!canDispatch(operation)) throw needsUpgrade(); };
  return {canDispatch, requireDispatch};
}

function identity(input, uuid) {
  const prefix = prefixes[input.entity_type];
  if (!prefix) throw new TypeError('This entity is read-only offline');
  const raw = input.entity_id || input.body?.id || uuid();
  const id = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
  if (!uuidPattern.test(id)) throw new TypeError('Offline entity requires a stable UUID');
  return {id: id.toLowerCase(), entity_id: prefix + id.toLowerCase()};
}

function operationFor(input, uuid, time) {
  const initialStatus = input.initial_status || 'queued';
  if (!['queued', 'unknown'].includes(initialStatus)) throw new TypeError('Invalid initial offline operation status');
  if (initialStatus === 'unknown' && (!uuidPattern.test(input.body?.save_id) || !input.entity_id))
    throw new TypeError('Unknown operation import requires its original save_id and entity identity');
  const {id, entity_id} = identity(input, uuid), type = input.entity_type;
  const method = input.method?.toUpperCase();
  const base = type === 'todo' ? '/todos' : type === 'template' ? '/todo-templates' :
    type === 'note_entry' ? '/note-entries' : type === 'unscheduled_todo' ? '/unscheduled-todos' : '/memos/' + (type === 'memo_note' ? 'notes' : 'groups');
  const restore = ['todo', 'unscheduled_todo'].includes(type) && method === 'POST' && input.path === base + '/' + id + '/restore';
  const create = ['todo', 'template', 'unscheduled_todo'].includes(type) && method === 'POST' && !restore;
  const allowed = ['todo', 'unscheduled_todo'].includes(type) ? ['POST', 'PATCH', 'DELETE'] : type === 'template' ? ['POST', 'PATCH', 'DELETE'] :
    type === 'note_entry' ? ['PUT', 'DELETE'] : ['PUT'];
  if (!allowed.includes(method)) throw new TypeError('Unsupported offline mutation');
  const path = create ? base : base + '/' + id + (restore ? '/restore' : '');
  if (input.path && input.path !== path) throw new TypeError('Offline mutation path does not match its entity');
  const body = structuredClone(input.body || {});
  if (typeof body.text === 'string') {
    body.text = ['todo', 'template', 'unscheduled_todo'].includes(type) ? body.text.trim() : body.text.replace(/\r\n?/g, '\n');
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
  if (!['todo', 'template', 'unscheduled_todo'].includes(type)) body.save_id = saveId.toLowerCase();
  else delete body.save_id;
  const operation = {id: uuid(), scope: input.scope, entity_type: type, entity_id, source_id: id,
    protocol: input.protocol === undefined ? 1 : input.protocol,
    method, path, body, expected_version: expected, save_id: saveId.toLowerCase(), created_at: time,
    attempts: 0, next_attempt_at: 0, status: initialStatus, base: input.base || null,
    local: {...structuredClone(input.local || body), id, version: expected + 1}, claim_owner: null, error: null};
  operation.key = entityKey(input.scope, 'operation:' + operation.id);
  if (Object.hasOwn(input, 'depends_on')) operation.depends_on = structuredClone(input.depends_on);
  for (const field of ['resolution_id', 'resolution_receipt', 'origin_conflict'])
    if (Object.hasOwn(input, field)) operation[field] = input[field];
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
  const fields = operation.entity_type === 'todo' ? (deleted(remote) ? ['date'] : ['date', 'text']) :
    operation.entity_type === 'unscheduled_todo' ? ['text'] : [];
  return fields.every(key => base[key] === undefined || remote[key] === base[key]);
}
function completeNoteRow(remote) {
  const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  return remote && uuidPattern.test(remote.id) && ['life', 'work'].includes(remote.category) &&
    /^\d{4}-\d{2}-\d{2}$/.test(remote.date) && typeof remote.text === 'string' && typeof remote.deleted === 'boolean' &&
    remote.can_edit === true && /^[a-f0-9]{64}$/.test(remote.content_hash) &&
    Number.isSafeInteger(remote.change_seq) && remote.change_seq >= 0 && time(remote.created_at) && time(remote.updated_at) &&
    (remote.deleted_at === null || time(remote.deleted_at)) && remote.deleted === (remote.deleted_at !== null);
}

function validAcknowledgement(operation, remote) {
  if (operation.entity_type === 'note_entry' && !completeNoteRow(remote)) return false;
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
  const owner = uuid();
  const state = {phase: 'idle', pending: 0, unsupported: 0, error: null};
  const {canDispatch, requireDispatch} = dispatchCapabilities(options);
  const conflicts = createConflictStore({db, now, canDispatch});
  const leaseKey = scope => entityKey(scope, 'outbox-lease');
  const checkScope = scope => {
    if (getScope() !== scope) throw Object.assign(new Error('Offline identity changed'), {code: 'OFFLINE_SCOPE_CHANGED'});
  };
  const list = scope => db.transaction(['outbox'], 'readonly', async tx =>
    ordered((await tx.getAll('outbox')).filter(value => value.scope === scope && active(value))));
  const retryable = async scope => {
    const rows = await list(scope), first = new Map(), ready = [];
    for (const row of rows) if (!first.has(row.entity_id)) first.set(row.entity_id, row);
    for (const row of first.values()) {
      if (!canDispatch(row) || !['queued', 'unknown', 'sending'].includes(row.status)) continue;
      const dependency = await dependencyState({db}, row, rows);
      if (['ready', 'deleted'].includes(dependency)) ready.push(row);
    }
    return ready;
  };

  async function lease(scope) {
    checkScope(scope);
    return db.transaction(['meta'], 'readwrite', async tx => {
      const old = await tx.get('meta', leaseKey(scope));
      if (old && old.owner !== owner && old.expires_at > now()) return false;
      await tx.put('meta', {key: leaseKey(scope), owner, expires_at: now() + 90000});
      return true;
    });
  }

  async function network(scope, path, opts = {}, claim = true) {
    checkScope(scope);
    if (claim && !await lease(scope)) throw new Error('Offline sync lease changed');
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
  const readNetwork = (scope, path, opts = {}) => {
    if (!['GET', 'HEAD'].includes((opts.method || 'GET').toUpperCase())) throw new TypeError('Conflict preparation is read-only');
    return network(scope, path, opts, false);
  };

  return {db, request, getScope, now, uuid, timeout, owner, conflicts, state, leaseKey, checkScope, list, lease, network,
    readNetwork, canDispatch, requireDispatch, retryable};
}

async function replayOperation(tx, operation, input, all) {
  const replay = all.find(value => value.save_id === operation.save_id);
  if (!replay) return null;
  if (replay.entity_id !== operation.entity_id || replay.path !== operation.path || replay.method !== operation.method ||
      JSON.stringify(replay.body) !== JSON.stringify(operation.body)) throw new Error('Offline save_id cannot change its original request');
  const entity = await tx.get('entities', entityKey(input.scope, replay.entity_id));
  if (!entity) throw new Error('Offline operation entity is missing');
  if (input.initial_status === 'unknown' && replay.status === 'queued') {
    await tx.put('outbox', {...replay, status: 'unknown'});
    return {operation: {...replay, status: 'unknown'}, entity};
  }
  return {operation: replay, entity};
}
async function noteCapacity(tx, operation, old) {
  if (operation.entity_type !== 'note_entry' || operation.expected_version !== 0 || operation.status === 'unknown' || old) return;
  let count = 0;
  for (const entity of await tx.getAll('entities')) {
    const row = entity.dirty ? entity.local : entity.server;
    if (entity.scope === operation.scope && entity.entity_id.startsWith('note-entry:') &&
        (entity.dirty || !entity.remote_missing) && row?.category === operation.body.category &&
        row?.date === operation.body.date && !deleted(row)) count++;
  }
  if (count >= 200) throw Object.assign(new Error('本机当日记录已达 200 条，草稿已保留。'), {code: 'OFFLINE_CACHE_LIMIT'});
}

function storageMethods(context) {
  const {db, checkScope, uuid, now, owner} = context;
  async function enqueueInTransaction(tx, input) {
    input.assertActive?.();
    checkScope(input.scope);
    const operation = operationFor(input, uuid, now());
    context.requireDispatch(operation);
    checkScope(input.scope);
    input.assertActive?.();
    const all = (await tx.getAll('outbox')).filter(value => value.scope === input.scope);
    const replay = await replayOperation(tx, operation, input, all);
    if (replay) { input.assertActive?.(); return replay; }
    const rows = all.filter(active);
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
    await noteCapacity(tx, operation, old);
    const visible = old?.dirty ? old.local : old?.server || operation.base;
    operation.base = operation.base || old?.server || null;
    operation.local = {...visible, ...operation.local,
      ...(operation.entity_type === 'todo' && operation.path === '/todos' ? {completed: false} : {}),
      ...(operation.path.endsWith('/restore') ? {deleted: false, deleted_at: null} : {}),
      ...(operation.method === 'DELETE' ? {deleted: true} : {})};
    const entity = {...old, key, scope: input.scope, entity_id: operation.entity_id,
      server: old?.server || operation.base, local: operation.local, dirty: true};
    input.assertActive?.();
    await tx.put('entities', entity);
    await tx.put('outbox', operation);
    await tx.put('meta', {key: sequenceKey, value: operation.seq});
    input.assertActive?.();
    return {operation, entity};
  }
  async function enqueue(input) {
    return db.transaction(['entities', 'outbox', 'meta'], 'readwrite', tx => enqueueInTransaction(tx, input));
  }
  async function update(operation, fields) {
    if (!context.canDispatch(operation)) return null;
    return db.transaction(['outbox', 'meta', 'conflicts'], 'readwrite', async tx => {
      const current = await tx.get('outbox', operation.key);
      const held = await tx.get('meta', context.leaseKey(operation.scope));
      if (!context.canDispatch(current) || held?.owner !== owner || !['queued', 'unknown', 'sending'].includes(current.status)) return null;
      if (!Object.hasOwn(fields, 'claim_owner') && current.claim_owner !== owner) return null;
      const result = {...current, ...fields};
      await tx.put('outbox', result);
      if (fields.status) await recordResolutionFailure(tx, result, fields);
      return result;
    });
  }
  async function acknowledge(operation, remote) {
    context.requireDispatch(operation);
    if (operation.entity_type === 'note_entry' && !completeNoteRow(remote)) throw new Error('Incomplete note acknowledgement');
    checkScope(operation.scope);
    await db.transaction(['entities', 'outbox', 'conflicts'], 'readwrite', async tx => {
      checkScope(operation.scope);
      const current = await tx.get('outbox', operation.key);
      if (!context.canDispatch(current) || current.claim_owner !== owner || !['sending', 'unknown'].includes(current.status)) {
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
      await recordResolutionAck(tx, current, confirmed, now());
    });
  }

  return {enqueue, enqueueInTransaction, update, acknowledge};
}

function remoteMethods(context) {
  const {network} = context;
  async function readRemote(operation) {
    const scope = operation.scope, type = operation.entity_type;
    if (type === 'note_entry' || type === 'memo_note' || type === 'unscheduled_todo') {
      const path = type === 'unscheduled_todo' ? '/unscheduled-todos/' + operation.source_id : operation.path;
      try { return await network(scope, path); }
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
    if (!['todo', 'template', 'unscheduled_todo'].includes(operation.entity_type)) return receiptRead(operation);
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
      const current = await context.db.transaction(['outbox'], 'readonly', tx => tx.get('outbox', operation.key));
      if (!context.canDispatch(current)) return;
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
    if (!context.canDispatch(operation)) return;
    try {
      const claimed = await update(operation, {claim_owner: owner});
      if (!claimed) return;
      if (claimed.protocol === 3) {
        const origin = await context.db.transaction(['conflicts'], 'readonly', tx => tx.get('conflicts', claimed.origin_conflict));
        if (!origin || origin.scope !== claimed.scope || origin.resolved_at !== null ||
            origin.resolution?.id !== claimed.resolution_id || !origin.resolution.operation_keys.includes(claimed.key))
          throw Object.assign(new Error('本机选择凭据不完整，原请求已保留。'), {status: 422, code: 'OFFLINE_DECISION_EVIDENCE_MISSING'});
      }
      if (['unknown', 'sending'].includes(operation.status)) {
        const checked = await reconcile(claimed);
        if (checked.result === 'ack') return await acknowledge(claimed, checked.remote);
        if (checked.result === 'conflict') return conflicts.record({operation: claimed, remote: checked.remote,
          reason: deleted(checked.remote) ? 'deleted' : 'version'});
      }
      const sending = await update(claimed, {status: 'sending'});
      if (!sending) return;
      const remote = await network(operation.scope, operation.path, {method: operation.method, body: operation.body});
      if (!validAcknowledgement(operation, remote)) throw new Error('Invalid offline write acknowledgement');
      return await acknowledge(sending, remote);
    } catch (error) { return fail({...operation, claim_owner: owner}, error); }
  }

  return {reconcile, fail, process};
}

async function dependencyState(context, operation, rows) {
  if (!operation.depends_on?.length) return 'ready';
  if (operation.depends_on.some(id => rows.some(row => row.entity_id === id && active(row)))) return 'pending';
  return context.db.transaction(['entities', 'outbox'], 'readonly', async tx => {
    for (const id of operation.depends_on) {
      const parent = await tx.get('entities', entityKey(operation.scope, id));
      if (deleted(parent?.server)) return 'deleted';
      if (!parent?.server || parent.remote_missing || parent.server.version < 1) {
        const abandoned = operation.protocol === 3 && (await tx.getAll('outbox')).some(row => row.scope === operation.scope &&
          row.entity_id === id && row.resolution_id === operation.resolution_id && row.status === 'archived');
        return abandoned ? 'deleted' : 'unknown';
      }
    }
    return 'ready';
  });
}
async function dependenciesReady(context, operation, rows) {
  const state = await dependencyState(context, operation, rows);
  if (state === 'deleted') {
    const claimed = await context.update(operation, {claim_owner: context.owner});
    if (claimed) {
      const entity = await context.db.transaction(['entities'], 'readonly', tx =>
        tx.get('entities', entityKey(operation.scope, operation.entity_id)));
      await context.conflicts.record({operation: claimed, remote: entity?.server || null, reason: 'MEMO_GROUP_UNAVAILABLE'});
    }
  }
  return state === 'ready';
}

function executionMethods(context) {
  const {getScope, lease, state, list, checkScope, process, db, leaseKey, owner, now, retryable, canDispatch} = context;
  let running = null;
  async function run() {
    const scope = getScope();
    if (!scope) return {phase: 'paused', pending: 0};
    if (!await lease(scope)) return {phase: 'busy', pending: (await list(scope)).length};
    state.phase = 'syncing'; state.error = null;
    try {
      for (let count = 0; count < 1000; count++) {
        checkScope(scope);
        const rows = await list(scope);
        let operation;
        for (const candidate of await retryable(scope)) {
          if (candidate.next_attempt_at <= now() && await dependenciesReady(context, candidate, rows)) {
            operation = candidate; break;
          }
        }
        if (!operation) break;
        await process(operation);
      }
      const pending = await list(scope);
      state.pending = pending.length;
      state.unsupported = pending.filter(value => !canDispatch(value)).length;
      state.phase = state.unsupported ? 'upgrade-required' : pending.some(value => value.status === 'conflict') ?
        'conflict' : pending.length ? 'pending' : 'synced';
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
        if (operation.scope === scope && canDispatch(operation) && operation.status === 'paused') {
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
  const preparationReads = remoteMethods({...context, network: context.readNetwork});
  const prepare = createConflictPreparation({readRemote: preparationReads.readRemote, network: context.readNetwork});
  const decisions = createConflictDecisions({db: context.db, getScope: context.getScope, now: context.now,
    uuid: context.uuid, canDispatch: context.canDispatch, prepare, append: async (tx, inputs, {assertActive}) => {
      const result = [];
      for (const input of inputs) result.push(await context.enqueueInTransaction(tx, {...input, assertActive}));
      return result;
    }});
  async function resolve(...args) {
    const scope = context.getScope();
    try { return await decisions.resolve(...args); }
    finally {
      if (scope && context.state.phase !== 'syncing') await context.db.transaction(['meta'], 'readwrite', async tx => {
        const key = context.leaseKey(scope), held = await tx.get('meta', key);
        if (held?.owner === context.owner) await tx.delete('meta', key);
      }).catch(() => {});
    }
  }
  context.conflicts.resolve = resolve;
  const {enqueue, drain, resume, list, state, conflicts, canDispatch, retryable} = context;
  return {enqueue, drain, resume, list, state, conflicts, canDispatch, retryable, resolve};
}
