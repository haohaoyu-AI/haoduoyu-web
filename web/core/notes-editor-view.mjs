const attentionPhases = ['unknown', 'conflict', 'oversize', 'error'];
export function noteDraftNeedsAttention(item) {
  return Boolean(item && (item.dirty || item.pending || attentionPhases.includes(item.phase)));
}
export function noteEditorCanCollapse(item) {
  return Boolean(item && item.loaded && !item.loading && !item.composing && !noteDraftNeedsAttention(item) &&
    (item.version > 0 || item.phase === 'empty' && !item.draft.trim()));
}

// Presentation state only. Drafts, writes, versions and retry receipts stay in the existing stores.
export function createNotesEditorView() {
  const views = new Map();
  const page = (category, date) => {
    const key = category + ':' + date;
    if (!views.has(key)) views.set(key, {active: '', revision: 0, collapseRequested: false, explicit: false});
    return views.get(key);
  };
  function activate(category, date, key) {
    const view = page(category, date);
    view.active = key; view.revision++; view.collapseRequested = false; view.explicit = false;
    return view;
  }
  function requestCollapse(category, date, key, revision, {explicit = false} = {}) {
    const view = page(category, date);
    if (view.active !== key || view.revision !== revision) return;
    view.collapseRequested = true; view.explicit = explicit;
  }
  function sync(category, date, items, legacy, {focused = false, composing = false} = {}) {
    const view = page(category, date), item = view.active === 'legacy' ? legacy : items.find(value => value.id === view.active);
    if (view.active && !item) activate(category, date, '');
    else if (view.collapseRequested && noteEditorCanCollapse(item) && !composing && (!focused || view.explicit)) {
      activate(category, date, '');
    }
    if (!view.active) {
      const draft = items.find(noteDraftNeedsAttention);
      if (draft) activate(category, date, draft.id);
      else if (noteDraftNeedsAttention(legacy)) activate(category, date, 'legacy');
    }
    return view;
  }
  const clear = () => views.clear();
  return {page, activate, requestCollapse, sync, clear};
}
