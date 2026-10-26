import {entityKey} from './db.mjs';

export function createConflictStore({db, now = Date.now, canDispatch = () => true}) {
  async function record({operation, remote = null, reason = 'version'}) {
    return db.transaction(['entities', 'outbox', 'conflicts'], 'readwrite', async tx => {
      const current = await tx.get('outbox', operation.key);
      if (!current || current.scope !== operation.scope) throw new Error('Offline operation is no longer current');
      if (!canDispatch(operation) || !canDispatch(current)) return null;
      if (current.claim_owner !== operation.claim_owner || ['archived', 'conflict'].includes(current.status)) {
        throw new Error('Offline conflict claim changed');
      }
      const entity = await tx.get('entities', entityKey(operation.scope, operation.entity_id));
      const key = entityKey(operation.scope, 'conflict:' + operation.id);
      const conflict = {key, scope: operation.scope, entity_id: operation.entity_id, operation: current,
        local: entity?.local || operation.local, remote, reason, created_at: now(), resolved_at: null};
      await tx.put('conflicts', conflict);
      await tx.put('outbox', {...current, status: 'conflict', error: reason});
      if (entity) await tx.put('entities', {...entity, conflict: key, dirty: true});
      return conflict;
    });
  }
  const list = scope => db.transaction(['conflicts'], 'readonly', async tx =>
    (await tx.getAll('conflicts')).filter(value => value.scope === scope && value.resolved_at === null));

  // A decision is durable, but is not an implicit upload or resurrection.
  async function resolve(key, choice, {scope} = {}) {
    if (!['use-server', 'use-local', 'keep-both'].includes(choice)) throw new TypeError('Unknown conflict choice');
    return db.transaction(['conflicts', 'outbox', 'entities'], 'readwrite', async tx => {
      const conflict = await tx.get('conflicts', key);
      if (!conflict || conflict.scope !== scope) throw new Error('Conflict scope does not match');
      if (conflict.resolved_at !== null) return {...conflict, already_resolved: true};
      const entity = await tx.get('entities', entityKey(scope, conflict.entity_id));
      if (entity?.conflict !== key || JSON.stringify(entity.local) !== JSON.stringify(conflict.local)) {
        return {...conflict, needs_followup: true};
      }
      if (choice !== 'use-server') {
        const pending = {...conflict, requested_choice: choice, needs_followup: true};
        await tx.put('conflicts', pending);
        return pending;
      }
      const resolved = {...conflict, choice, needs_followup: false, resolved_at: now()};
      await tx.put('conflicts', resolved);
      if (choice === 'use-server') {
        for (const operation of await tx.getAll('outbox')) {
          if (operation.scope === scope && operation.entity_id === conflict.entity_id) {
            await tx.put('outbox', {...operation, status: 'archived'});
          }
        }
        if (entity) await tx.put('entities', {...entity, server: conflict.remote, local: conflict.remote,
          dirty: false, conflict: null});
      }
      return resolved;
    });
  }
  return {record, list, resolve};
}
