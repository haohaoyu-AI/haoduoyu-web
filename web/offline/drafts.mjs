import {entityKey} from './db.mjs';

const fields = ['kind', 'id', 'category', 'date', 'draft', 'version', 'serverText', 'contentHash', 'label', 'labelKnown', 'createdAt', 'updatedAt',
  'dirty', 'phase', 'pending', 'remote', 'localVersion', 'durableText', 'localBacked', 'localQueued', 'recoveredBaseline'];
const unresolved = row => row.dirty || row.pending || ['unknown', 'conflict', 'error', 'oversize'].includes(row.phase);
function safeDraft(row) {
  if (!row || !['legacy', 'note_entry'].includes(row.kind) || !['life', 'work'].includes(row.category) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || typeof row.draft !== 'string' || row.draft.length > 262144 ||
      row.kind === 'note_entry' && !/^[a-f0-9-]{36}$/i.test(row.id)) throw new Error('本机草稿字段无效。');
  return Object.fromEntries(fields.filter(key => row[key] !== undefined).map(key => [key, structuredClone(row[key])]));
}
export function createDraftJournal({db, getScope, getGeneration = () => 0, now = Date.now, draftOwner = crypto.randomUUID()}) {
  const pending = new Set();
  async function write(rows) {
    const owner = getScope(), generation = getGeneration();
    if (!owner) return;
    const clean = rows.map(safeDraft);
    const active = () => {
      if (owner !== getScope() || generation !== getGeneration())
        throw Object.assign(new Error('身份范围已变化，旧草稿保持原范围。'), {code: 'OFFLINE_SCOPE_CHANGED'});
    };
    await db.transaction(['meta'], 'readwrite', async tx => {
      active();
      for (const row of clean) {
        const identity = row.kind === 'legacy' ? row.category + ':' + row.date : row.id;
        const key = entityKey(owner, 'draft:' + row.kind + ':' + identity + ':' + draftOwner);
        if (unresolved(row)) await tx.put('meta', {key, scope: owner, draft_kind: row.kind, draft_owner: draftOwner, data: row, saved_at: now()});
        else if (row.kind === 'note_entry') {
          await tx.delete('meta', key);
          for (const old of await tx.getAll('meta')) if (old.scope === owner && old.draft_kind === 'note_entry' &&
              old.data.id === row.id && old.data.draft === row.draft && !old.data.pending) await tx.delete('meta', old.key);
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
  async function list(kind) {
    const owner = getScope(), generation = getGeneration();
    if (!owner) return [];
    const rows = await db.transaction(['meta'], 'readonly', async tx =>
      (await tx.getAll('meta')).filter(row => row.scope === owner && row.draft_kind === kind)
        .sort((a, b) => b.saved_at - a.saved_at).map(row => row.data));
    return owner === getScope() && generation === getGeneration() ? rows : [];
  }
  return {capture, list, flush: () => Promise.all([...pending])};
}
