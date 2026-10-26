const factories = new Set();
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const changed = () => {
  throw Object.assign(new Error('本机输入或身份已变化，请保留原文并重新比较。'), {code: 'OFFLINE_CONFLICT_CHANGED'});
};
const fields = (value, names) => value ? Object.fromEntries(names.filter(name => value[name] !== undefined)
  .map(name => [name, value[name]])) : null;
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ?
  Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const stable = value => JSON.stringify(canonical(value));
function pendingIntent(value) {
  if (!value) return null;
  return {...fields(value, ['kind', 'id', 'method', 'path', 'version', 'text', 'saveId']),
    body: fields(value.body, ['version', 'save_id', 'title', 'body', 'group_id', 'position', 'category', 'date', 'text', 'completed']),
    snapshot: fields(value.snapshot, ['title', 'body', 'group_id', 'position', 'category', 'date', 'text', 'completed'])};
}
function draftSnapshot(value, kind) {
  if (!value) return null;
  return {...fields(value, kind === 'memo' ? ['title', 'body', 'group_id', 'position'] : ['draft']),
    composing: value.composing === true, pending: pendingIntent(value.pending)};
}
function entityId(value, prefix) {
  if (typeof value !== 'string' || !value.startsWith(prefix)) return null;
  const id = value.slice(prefix.length);
  return uuid.test(id) ? id.toLowerCase() : null;
}
function privateMemoJournals(storage, owner, id) {
  if (!storage || typeof owner !== 'string' || !owner) changed();
  const prefix = 'haoduoyu.memos.drafts.v1.' + owner + '.', rows = [];
  try {
    const length = storage.length;
    if (!Number.isSafeInteger(length) || length < 0) changed();
    for (let index = 0; index < length; index++) {
      const key = storage.key(index);
      if (typeof key !== 'string' || !key.startsWith(prefix)) continue;
      const raw = JSON.parse(storage.getItem(key) || '{}');
      if (!Array.isArray(raw.drafts)) changed();
      const drafts = raw.drafts.filter(draft => draft?.id === id).map(draft => draftSnapshot(draft, 'memo'));
      if (drafts.length) rows.push([key, drafts.sort((a, b) => stable(a).localeCompare(stable(b)))]);
    }
    return rows.sort((a, b) => a[0].localeCompare(b[0]));
  } catch { changed(); }
}

export function registerConflictDraftGuard(factory) {
  if (typeof factory !== 'function') throw new TypeError('Conflict draft guard must be a factory');
  factories.add(factory); return () => factories.delete(factory);
}
export function captureConflictDraftGuard(entity_id) {
  const checks = [...factories].map(factory => factory(entity_id)).filter(Boolean);
  if (checks.some(check => typeof check !== 'function')) throw new TypeError('Conflict draft guard must return a function');
  return () => { for (const check of checks) check(); };
}
export function createMemoConflictDraftGuard({getStore, getIdentity, getStorage = () => globalThis.localStorage,
  getComposing = () => false}) {
  return entity_id => {
    const id = entityId(entity_id, 'memo-note:'), store = id && getStore();
    if (!store) return null;
    const identity = getIdentity(), owner = store.state.draftOwner;
    const snapshot = () => stable({draft: draftSnapshot(store.drafts.get(id), 'memo'),
      operation: store.state.operation?.pending?.id === id ? pendingIntent(store.state.operation.pending) : null,
      composing: getComposing(id) === true, journals: privateMemoJournals(getStorage(), owner, id)});
    let initial;
    try { initial = snapshot(); } catch { changed(); }
    return () => {
      if (store !== getStore() || identity !== getIdentity() || owner !== store.state.draftOwner) changed();
      try { if (snapshot() !== initial) changed(); } catch { changed(); }
    };
  };
}
export function createNoteConflictDraftGuard({getStores, getIdentity, getComposing = () => false}) {
  return entity_id => {
    const id = entityId(entity_id, 'note-entry:');
    if (!id) return null;
    const find = () => [...getStores()].filter(([, store]) => store.entries.has(id));
    const initialStores = find();
    if (!initialStores.length) return null;
    const identity = getIdentity();
    const snapshot = rows => stable({drafts: rows.map(([category, store]) => [category, draftSnapshot(store.entries.get(id), 'note')]),
      composing: getComposing(id) === true});
    const initial = snapshot(initialStores);
    return () => {
      const current = find();
      if (identity !== getIdentity() || current.length !== initialStores.length ||
          current.some(([category, store], index) => category !== initialStores[index][0] || store !== initialStores[index][1])) changed();
      if (snapshot(current) !== initial) changed();
    };
  };
}
