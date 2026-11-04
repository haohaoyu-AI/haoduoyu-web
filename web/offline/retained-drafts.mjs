// Group only snapshots with the same content and the same kind of outstanding
// operation. The original journal rows are kept intact for recovery/export.
const labels = row => Array.isArray(row.labels) ? [...row.labels].sort() : row.label ? [row.label] : [];
const signature = row => JSON.stringify([row.kind, row.id || '', row.category, row.date, row.draft,
  Array.isArray(row.labels) ? labels(row) : null, row.label ?? null, row.pending ?? null, row.remote ?? null,
  row.phase ?? null]);

export function createDraftRevisionTracker() {
  const revisions = new WeakMap();
  return item => {
    const signature = JSON.stringify([item.draft, item.labels, item.label, item.dirty, item.composing]);
    const previous = revisions.get(item);
    const revision = previous ? previous.revision + Number(previous.signature !== signature) : 0;
    revisions.set(item, {signature, revision});
    return revision;
  };
}

export function unchangedEntrySinceSnapshot(epochs, id, current, snapshotRevision, currentRevision) {
  return epochs.has(id) === Boolean(current) && (!current || current.writeEpoch === epochs.get(id) &&
    (snapshotRevision === undefined || snapshotRevision === currentRevision));
}

export function uniqueRetainedDrafts(rows) {
  const seen = new Set();
  return rows.filter(row => {
    if (!row || typeof row !== 'object') return true;
    const key = signature(row);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

// A current server tombstone is evidence only for the identical content and
// labels at an earlier version. Never infer deletion from a missing list item.
export function matchesDeletedEntry(row, value) {
  if (row.kind !== 'note_entry' || !value || value.id !== row.id || value.category !== row.category ||
      value.date !== row.date || value.deleted !== true || value.can_edit !== true ||
      !Number.isSafeInteger(value.version) || !Number.isSafeInteger(row.version) || value.version <= row.version ||
      typeof value.text !== 'string' || value.text !== row.draft || value.labels_version !== 3 || !Array.isArray(value.labels) ||
      !Array.isArray(row.labels) || JSON.stringify(labels(value)) !== JSON.stringify(labels(row)) || row.pending || row.remote ||
      ['unknown', 'conflict'].includes(row.phase)) return false;
  return true;
}

export async function visibleRetainedDrafts(rows, readEntry, active = () => true) {
  const tombstones = new Map();
  const ids = [...new Set(rows.filter(row => row?.kind === 'note_entry' && /^[a-f0-9-]{36}$/i.test(row.id)).map(row => row.id))];
  let next = 0;
  await Promise.all(Array.from({length: Math.min(6, ids.length)}, async () => {
    while (active() && next < ids.length) {
      const id = ids[next++];
      try { tombstones.set(id, await readEntry(id)); } catch { /* Keep drafts if verification fails. */ }
    }
  }));
  return uniqueRetainedDrafts(rows.filter(row => !row || !matchesDeletedEntry(row, tombstones.get(row.id))));
}
