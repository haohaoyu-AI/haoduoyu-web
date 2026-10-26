function resolutionParent(rows, operation) {
  return rows.find(row => row.scope === operation.scope && row.resolution?.id === operation.resolution_id);
}
async function outstandingResolution(tx, conflict, acknowledgements = [], completedChild = null) {
  const children = new Set(conflict.resolution.conflict_keys || []), acked = new Set(acknowledgements.map(row => row.operation_key));
  const pending = (await tx.getAll('outbox')).some(row => row.scope === conflict.scope &&
    row.resolution_id === conflict.resolution.id && !['acked', 'archived'].includes(row.status) && !acked.has(row.key));
  const conflicts = (await tx.getAll('conflicts')).some(row => row.scope === conflict.scope && row.resolved_at === null &&
    row.key !== completedChild && (row.resolution_parent === conflict.key || children.has(row.key)));
  return {pending, conflicts};
}
async function finishParents(tx, conflict, time) {
  let key = conflict.resolution_parent, completedChild = conflict.key;
  const seen = new Set();
  while (key && !seen.has(key)) {
    seen.add(key);
    const parent = await tx.get('conflicts', key);
    if (!parent || parent.scope !== conflict.scope || !parent.resolution) return;
    const completed = [...new Set([...(parent.resolution.completed_children || []), completedChild])];
    const waiting = await outstandingResolution(tx, parent, parent.resolution.acknowledgements || [], completedChild);
    if (waiting.pending || waiting.conflicts) {
      await tx.put('conflicts', {...parent, resolved_at: null, resolution: {...parent.resolution,
        state: 'conflict', completed_children: completed}});
      return;
    }
    await tx.put('conflicts', {...parent, resolved_at: time, resolution: {...parent.resolution, completed_children: completed,
      state: 'superseded', completed_by: conflict.key, completed_at: time}});
    completedChild = parent.key;
    key = parent.resolution_parent;
  }
}
export async function recordResolutionAck(tx, operation, remote, time) {
  if (!operation.resolution_id) return;
  const conflict = resolutionParent(await tx.getAll('conflicts'), operation);
  if (operation.protocol === 3 && (!conflict || conflict.key !== operation.origin_conflict || conflict.resolved_at !== null ||
      !conflict.resolution.operation_keys.includes(operation.key)))
    throw Object.assign(new Error('本机选择凭据不完整，未确认此次保存。'), {code: 'OFFLINE_DECISION_EVIDENCE_MISSING'});
  if (!conflict || conflict.resolved_at !== null || !conflict.resolution.operation_keys.includes(operation.key)) return;
  const resolution = conflict.resolution;
  const acknowledgements = [...(resolution.acknowledgements || []).filter(row => row.operation_key !== operation.key),
    {operation_key: operation.key, save_id: operation.save_id, remote, acknowledged_at: time}];
  const waiting = await outstandingResolution(tx, conflict, acknowledgements);
  const allAcknowledged = resolution.operation_keys.every(key => acknowledgements.some(row => row.operation_key === key));
  const hasCompletedChildren = Boolean(resolution.completed_children?.length);
  const complete = !waiting.pending && !waiting.conflicts && (allAcknowledged || hasCompletedChildren);
  const next = {...conflict, resolved_at: complete ? time : null, resolution: {...resolution, acknowledgements,
    state: complete ? hasCompletedChildren ? 'superseded' : 'synced' : waiting.conflicts || hasCompletedChildren ? 'conflict' : 'queued',
    ...(complete ? {completed_at: time} : {})}};
  await tx.put('conflicts', next);
  if (complete) await finishParents(tx, next, time);
}
export async function recordResolutionConflict(tx, operation, child) {
  if (!operation.resolution_id) return child;
  const parent = resolutionParent(await tx.getAll('conflicts'), operation);
  if (!parent || parent.resolved_at !== null) return child;
  const keys = [...new Set([...(parent.resolution.conflict_keys || []), child.key])];
  await tx.put('conflicts', {...parent, resolution: {...parent.resolution, state: 'conflict', conflict_keys: keys}});
  return {...child, resolution_parent: parent.key};
}
export async function recordResolutionFailure(tx, operation, fields) {
  if (!operation.resolution_id) return;
  const conflict = resolutionParent(await tx.getAll('conflicts'), operation);
  if (!conflict || conflict.resolved_at !== null) return;
  const waiting = await outstandingResolution(tx, conflict, conflict.resolution.acknowledgements || []);
  const state = waiting.conflicts || conflict.resolution.completed_children?.length ? 'conflict' :
    fields.status === 'blocked' ? 'blocked' : fields.status === 'paused' ? 'paused' : 'queued';
  await tx.put('conflicts', {...conflict, resolution: {...conflict.resolution, state,
    last_error: fields.error || null}});
}
export async function finishServerResolution(tx, conflict, time) {
  if (conflict.resolution?.state === 'accepted-server') await finishParents(tx, conflict, time);
}
