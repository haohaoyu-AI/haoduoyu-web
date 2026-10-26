import {entityKey} from './db.mjs';
import {planConflictResolution} from './conflict-plan.mjs';
import {finishServerResolution} from './resolution-ledger.mjs';

const live = row => !['acked', 'archived'].includes(row.status);
const own = (value, key) => Object.hasOwn(value, key);
const currentLocal = row => own(row, 'review_local') ? row.review_local : row.local;
const currentRemote = row => own(row, 'review_remote') ? row.review_remote : row.remote;
const failure = (message, code = 'OFFLINE_CONFLICT_CHANGED') => Object.assign(new Error(message), {code});
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ?
  Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const stable = value => JSON.stringify(canonical(value));

export function conflictDecisionToken(conflict) {
  return stable({key: conflict.key, local: currentLocal(conflict), remote: currentRemote(conflict),
    operation: conflict.operation, copy_required: conflict.copy_required === true, resolved_at: conflict.resolved_at});
}
function remoteEvidence(value, type) {
  if (!value) return null;
  const fields = type === 'todo' ? ['date', 'text', 'completed'] : type === 'template' ? ['text'] :
    type === 'note_entry' ? ['category', 'date', 'text'] : type === 'memo_note' ? ['group_id', 'title', 'body', 'position'] :
      ['title', 'position'];
  return {id: value.id || value.source_id, version: value.version, deleted: Boolean(value.deleted || value.deleted_at),
    ...Object.fromEntries(fields.filter(key => own(value, key)).map(key => [key, value[key]]))};
}
function branchState(conflict, entity, operations, drafts) {
  return stable({conflict, entity, operations, drafts});
}
async function storedState(tx, scope, key) {
  const conflict = await tx.get('conflicts', key);
  if (!conflict || conflict.scope !== scope) throw failure('冲突不属于当前身份。', 'OFFLINE_SCOPE_CHANGED');
  const entity = await tx.get('entities', entityKey(scope, conflict.entity_id));
  const operations = (await tx.getAll('outbox')).filter(row => row.scope === scope && row.entity_id === conflict.entity_id && live(row))
    .sort((a, b) => a.seq - b.seq);
  const id = conflict.operation.source_id;
  const drafts = (await tx.getAll('meta')).filter(row => row.scope === scope && row.draft_kind && row.data?.id === id);
  return {conflict, entity, operations, drafts, signature: branchState(conflict, entity, operations, drafts)};
}
function checkSelection(captured, expected, canDispatch) {
  const {conflict, entity, operations} = captured;
  if (conflict.resolved_at !== null || conflict.resolution) return;
  if (expected !== undefined && expected !== conflictDecisionToken(conflict)) throw failure('比较内容已变化，请重新核对。');
  if (!canDispatch(conflict.operation) || operations.some(row => !canDispatch(row)))
    throw failure('此本机操作需新版页面处理，原内容已保留。', 'OFFLINE_UPGRADE_REQUIRED');
  if (!entity || entity.conflict !== conflict.key || !operations.some(row => row.key === conflict.operation.key))
    throw failure('这份冲突已变化，原文已保留，请重新核对。');
}

export function createConflictDecisions({db, getScope, prepare, append, canDispatch = () => true,
  now = Date.now, uuid = () => crypto.randomUUID()}) {
  async function transaction(captured, scope, assertActive, callback) {
    return db.transaction(['entities', 'outbox', 'conflicts', 'meta'], 'readwrite', async tx => {
      assertActive();
      const latest = await storedState(tx, scope, captured.conflict.key);
      if (latest.conflict.resolved_at !== null || latest.conflict.resolution) return {...latest.conflict, already_resolved: true};
      if (latest.signature !== captured.signature) throw failure('本机内容刚有变化，原文已保留，请重新核对。');
      const result = await callback(tx, latest);
      assertActive(); return result;
    });
  }
  async function review(captured, scope, active, remote, message, extra = {}) {
    return transaction(captured, scope, active, async tx => {
      const history = [...(captured.conflict.remote_history || [])];
      if (!history.some(value => stable(value) === stable(currentRemote(captured.conflict))))
        history.push(currentRemote(captured.conflict));
      const next = {...captured.conflict, remote_history: history, review_local: captured.entity.local, review_remote: remote,
        needs_recompare: true, resolution_message: message, ...extra};
      await tx.put('conflicts', next); return next;
    });
  }
  async function commit(captured, scope, active, choice, prepared, plan) {
    return transaction(captured, scope, active, async tx => {
      const conflict = captured.conflict, resolutionId = uuid();
      for (const operation of captured.operations)
        await tx.put('outbox', {...operation, status: 'archived', archived_by: resolutionId});
      const entity = {...captured.entity, server: prepared.remote, local: prepared.remote, dirty: false,
        conflict: null, remote_missing: !prepared.remote};
      if (prepared.remote?.can_edit !== undefined) entity.api_server = prepared.remote;
      await tx.put('entities', entity);
      await rememberParents(tx, scope, prepared.groups || [], plan.operations);
      const stamp = new Date(now()).toISOString();
      const inputs = plan.operations.map(input => ({...input, protocol: 3, resolution_id: resolutionId,
        origin_conflict: conflict.key, resolution_receipt: 1,
        local: {...input.local, created_at: input.base?.created_at || stamp, updated_at: stamp}}));
      const saved = await append(tx, inputs, {assertActive: active});
      const resolution = {id: resolutionId, mode: plan.mode, target_id: plan.target_id,
        operation_keys: saved.map(row => row.operation.key), state: saved.length ? 'queued' : 'accepted-server'};
      const operation = saved.length ? {...conflict.operation, protocol: 3, resolution_id: resolutionId,
        origin_conflict: conflict.key, resolution_receipt: 1} : conflict.operation;
      const result = {...conflict, choice, needs_recompare: false, needs_followup: false, resolved_at: saved.length ? null : now(),
        original_operation: conflict.original_operation || conflict.operation, operation,
        resolution, resolution_remote: prepared.remote, resolution_message: plan.explanation || ''};
      await tx.put('conflicts', result); await finishServerResolution(tx, result, now()); return result;
    });
  }
  async function resolve(key, choice, {scope = getScope(), assertActive = () => {}, expected, copyConfirmed = false} = {}) {
    if (!['use-server', 'use-local', 'keep-both'].includes(choice)) throw new TypeError('Unknown conflict choice');
    const active = () => {
      assertActive();
      if (!scope || scope !== getScope()) throw failure('身份范围已变化，冲突和原文保持原样。', 'OFFLINE_SCOPE_CHANGED');
    };
    active();
    const captured = await db.transaction(['entities', 'outbox', 'conflicts', 'meta'], 'readonly', tx => storedState(tx, scope, key));
    active();
    if (captured.conflict.resolved_at !== null || captured.conflict.resolution)
      return {...captured.conflict, already_resolved: true};
    checkSelection(captured, expected, canDispatch);
    if (stable(captured.entity.local) !== stable(currentLocal(captured.conflict)))
      return review(captured, scope, active, currentRemote(captured.conflict), '本机已有后续修改，请核对新比较内容后再选择。');
    const prepared = await prepare(captured.conflict, {assertActive: active}); active();
    const type = captured.conflict.operation.entity_type;
    if (stable(remoteEvidence(prepared.remote, type)) !== stable(remoteEvidence(currentRemote(captured.conflict), type)))
      return review(captured, scope, active, prepared.remote, '线上刚有更新，请核对新比较内容后再选择。');
    const selected = {...captured.conflict, local: currentLocal(captured.conflict), remote: prepared.remote};
    const plan = planConflictResolution({conflict: selected, remote: prepared.remote, choice, groups: prepared.groups || [], uuid});
    if (plan.mode === 'blocked') return {...captured.conflict, blocked: true, resolution_message: plan.explanation};
    if (choice === 'use-local' && plan.mode === 'copy' && !copyConfirmed)
      return review(captured, scope, active, prepared.remote, plan.explanation + '请明确选择另存本地副本。', {copy_required: true});
    active(); return commit(captured, scope, active, choice, prepared, plan);
  }
  return {resolve};
}

async function rememberParents(tx, scope, groups, operations) {
  for (const input of operations.filter(row => row.entity_type === 'memo_note')) {
    const id = input.body.group_id, server = groups.find(row => row.id === id && !row.deleted_at && !row.deleted);
    if (!server) continue;
    const entity_id = 'memo-group:' + id, key = entityKey(scope, entity_id), old = await tx.get('entities', key);
    if (old?.server?.version > server.version) throw failure('分组刚有更新，请重新核对后保存。');
    await tx.put('entities', {...old, key, scope, entity_id, server, local: old?.dirty ? old.local : server,
      dirty: old?.dirty === true, remote_missing: false});
  }
}
