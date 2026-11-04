import {entityKey} from './db.mjs';
import {matchesDeletedEntry} from './retained-drafts.mjs';

const fields = ['kind', 'id', 'category', 'date', 'draft', 'version', 'serverText', 'contentHash', 'label', 'labels', 'labelKnown', 'createdAt', 'updatedAt',
  'dirty', 'phase', 'pending', 'remote', 'deleted', 'localVersion', 'durableText', 'localBacked', 'localQueued', 'recoveredBaseline'];
const unresolved = row => row.dirty || row.pending || ['unknown', 'conflict', 'error', 'oversize'].includes(row.phase);
function safeDraft(row) {
  if (!row || !['legacy', 'note_entry'].includes(row.kind) || !['life', 'work'].includes(row.category) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || typeof row.draft !== 'string' || row.draft.length > 262144 ||
      row.kind === 'note_entry' && !/^[a-f0-9-]{36}$/i.test(row.id)) throw new Error('本机草稿字段无效。');
  return Object.fromEntries(fields.filter(key => row[key] !== undefined).map(key => [key, structuredClone(row[key])]));
}
async function noteDigest(row) {
  const value = JSON.stringify([row.id, row.category, row.date, row.draft, [...row.labels].sort()]);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
const eligible = row => row.kind === 'note_entry' && Array.isArray(row.labels) &&
  Number.isSafeInteger(row.version) && row.version >= 0 && !row.pending && !row.remote && !row.localQueued &&
  (!Number.isSafeInteger(row.localVersion) || row.localVersion <= row.version) && row.labelKnown !== false &&
  !['unknown', 'conflict'].includes(row.phase);

export function createDraftJournal({db, getScope, getGeneration = () => 0, now = Date.now, draftOwner = crypto.randomUUID()}) {
  const pending = new Set();
  async function write(rows) {
    const owner = getScope(), generation = getGeneration();
    if (!owner) return;
    const clean = rows.map(safeDraft);
    const digests = await Promise.all(clean.map(row => eligible(row) ? noteDigest(row) : null));
    const active = () => {
      if (owner !== getScope() || generation !== getGeneration())
        throw Object.assign(new Error('身份范围已变化，旧草稿保持原范围。'), {code: 'OFFLINE_SCOPE_CHANGED'});
    };
    await db.transaction(['meta'], 'readwrite', async tx => {
      active();
      for (const [index, row] of clean.entries()) {
        const identity = row.kind === 'legacy' ? row.category + ':' + row.date : row.id;
        const key = entityKey(owner, 'draft:' + row.kind + ':' + identity + ':' + draftOwner);
        const proof = digests[index] && await tx.get('meta', entityKey(owner, 'deleted-note-proof:' + digests[index]));
        if (proof && row.version < proof.version) continue;
        if (unresolved(row)) await tx.put('meta', {key, scope: owner, draft_kind: row.kind, draft_owner: draftOwner, data: row, saved_at: now(), write_id: crypto.randomUUID()});
        else if (row.kind === 'note_entry') {
          await tx.delete('meta', key);
        }
      }
      active();
    });
  }
  function capture(rows) {
    const work = write(rows); pending.add(work);
    work.finally(() => pending.delete(work)).catch(() => {});
    return work;
  }
  async function records(kind) {
    const owner = getScope(), generation = getGeneration();
    if (!owner) return [];
    const rows = await db.transaction(['meta'], 'readonly', async tx =>
      (await tx.getAll('meta')).filter(row => row.scope === owner && row.draft_kind === kind)
        .sort((a, b) => b.saved_at - a.saved_at));
    return owner === getScope() && generation === getGeneration() ? rows : [];
  }
  async function list(kind) { return (await records(kind)).map(row => row.data); }
  // Verification is done over the network before this transaction. Delete only
  // snapshots which have not changed while that verification was in flight.
  async function purgeVerified(snapshots, tombstones, stillActive = () => true) {
    const owner = getScope(), generation = getGeneration();
    if (!owner) return;
    const active = () => {
      if (owner !== getScope() || generation !== getGeneration() || !stillActive())
        throw new Error('Draft cleanup was cancelled');
    };
    const candidates = [];
    for (const snapshot of snapshots) {
      const value = tombstones.get(snapshot.data?.id);
      if (snapshot.scope === owner && matchesDeletedEntry(snapshot.data, value))
        candidates.push({snapshot, value, digest: await noteDigest(snapshot.data)});
    }
    active();
    await db.transaction(['meta'], 'readwrite', async tx => {
      active();
      for (const {snapshot, value, digest} of candidates) {
        active();
        const current = await tx.get('meta', snapshot.key);
        if (!current || current.scope !== owner || current.draft_kind !== 'note_entry' ||
            JSON.stringify(current) !== JSON.stringify(snapshot) || !matchesDeletedEntry(current.data, value)) continue;
        const key = entityKey(owner, 'deleted-note-proof:' + digest);
        const previous = await tx.get('meta', key);
        await tx.put('meta', {key, scope: owner, version: Math.max(previous?.version || 0, value.version)});
        await tx.delete('meta', current.key);
      }
      active();
    });
  }
  // An explicit delete may include unsaved text unlike the server tombstone.
  // Only the exact snapshots present before the acknowledged delete qualify.
  async function purgeUserDeleted(raw, snapshots, value, stillActive = () => true) {
    const owner = getScope(), generation = getGeneration(), target = safeDraft(raw);
    const evidenceRow = {...target, draft:value?.text, labels:value?.labels};
    if (!owner || !eligible(target) || !matchesDeletedEntry(evidenceRow, value) || value.version !== target.version + 1) return;
    const digest = await noteDigest(target);
    const active = () => {
      if (owner !== getScope() || generation !== getGeneration() || !stillActive()) throw new Error('Draft cleanup was cancelled');
    };
    await db.transaction(['meta'], 'readwrite', async tx => {
      active();
      let removed = false;
      for (const snapshot of snapshots) {
        const row = snapshot.data;
        if (snapshot.scope !== owner || snapshot.draft_kind !== 'note_entry' || !row || !eligible(row) ||
            row.id !== target.id || row.category !== target.category || row.date !== target.date ||
            row.version !== target.version || row.draft !== target.draft ||
            JSON.stringify([...row.labels].sort()) !== JSON.stringify([...target.labels].sort())) continue;
        const current = await tx.get('meta', snapshot.key);
        if (current && JSON.stringify(current) === JSON.stringify(snapshot)) {
          await tx.delete('meta', current.key); removed = true;
        }
      }
      if (removed) {
        const key = entityKey(owner, 'deleted-note-proof:' + digest), previous = await tx.get('meta', key);
        await tx.put('meta', {key, scope:owner, version:Math.max(previous?.version || 0, value.version)});
      }
      active();
    });
  }
  // A never-submitted composer has no server tombstone. Its explicit discard
  // permits removal only of identical, unambiguous local snapshots.
  async function discardUnsent(raw) {
    const owner = getScope(), generation = getGeneration(), row = safeDraft(raw);
    if (!owner || !eligible(row) || row.version !== 0 || (row.localVersion || 0) !== 0)
      throw new Error('本机草稿状态需要重新核对，内容已保留。');
    const digest = await noteDigest(row);
    const active = () => {
      if (owner !== getScope() || generation !== getGeneration()) throw new Error('草稿身份范围已变化。');
    };
    await db.transaction(['meta'], 'readwrite', async tx => {
      active();
      for (const stored of await tx.getAll('meta')) {
        const data = stored.data;
        if (stored.scope !== owner || stored.draft_kind !== 'note_entry' || !data ||
            !eligible(data) || data.version !== 0 || (data.localVersion || 0) !== 0 ||
            data.id !== row.id || data.category !== row.category || data.date !== row.date || data.draft !== row.draft ||
            JSON.stringify([...data.labels].sort()) !== JSON.stringify([...row.labels].sort())) continue;
        await tx.delete('meta', stored.key);
      }
      const key = entityKey(owner, 'deleted-note-proof:' + digest);
      const previous = await tx.get('meta', key);
      await tx.put('meta', {key, scope: owner, version: Math.max(previous?.version || 0, 1)});
      active();
    });
  }
  return {capture, list, records, purgeVerified, purgeUserDeleted, discardUnsent, flush: () => Promise.all([...pending])};
}
