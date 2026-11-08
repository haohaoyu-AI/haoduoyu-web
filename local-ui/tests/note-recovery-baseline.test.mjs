import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {draftTransforms} from '../scripts/draft-transforms.mjs';
import {createMemoryDB} from '../frontend/web/offline/db.mjs';
import {createLocalApi} from '../frontend/web/local/api.mjs';
import {localDocument} from '../frontend/web/offline/document.mjs';
import {dailyNotesToday} from '../frontend/web/core/daily-notes-state.mjs';

const file = new URL('../frontend/web/core/note-entries-state.mjs', import.meta.url);
const original = await fs.readFile(file, 'utf8');
const patches = draftTransforms.filter(([name]) => name === 'core/note-entries-state.mjs');
let patched = original;
for (const [, before, after] of patches) {
  assert.equal(patched.split(before).length - 1, 1);
  patched = patched.replace(before, after);
}
// Import the complete real store after applying exactly the same adapter as the
// shipping build. Resolve its two imports without editing or copying source.
const moduleSource = patched.replace(/from (['"])(\.[^'"]+)\1/g,
  (_, quote, relative) => 'from ' + quote + new URL(relative, file).href + quote);
const {createNoteEntriesStore} = await import('data:text/javascript;base64,' +
  Buffer.from(moduleSource).toString('base64'));
const bundle = await fs.readFile(new URL('../build/site/app.js', import.meta.url), 'utf8');
const dailyStart = bundle.indexOf('var DAILY_NOTES_MAX_BYTES =');
const dailyEnd = bundle.indexOf('function checkedPage(');
const storeStart = bundle.indexOf('// local-ui/frontend/web/offline/document.mjs');
const storeEnd = bundle.indexOf('// local-ui/frontend/web/core/notes-month.mjs');
assert.ok(dailyStart >= 0 && dailyEnd > dailyStart && storeStart >= 0 && storeEnd > storeStart);
const bundledStore = new Function('crypto', 'setTimeout', 'clearTimeout',
  bundle.slice(dailyStart, dailyEnd) + '\n' + bundle.slice(storeStart, storeEnd) +
  '\nreturn createNoteEntriesStore;')(globalThis.crypto, setTimeout, clearTimeout);
const date = dailyNotesToday(), id = '30000000-0000-4000-8000-000000000001';
const initial = 'SYNTHETIC 恢复草稿初始内容 最后几个字';
const changed = initial + ' 已通过真实编辑';
const nextId = () => globalThis.crypto.randomUUID();
const headers = {'X-Note-Labels-Version': '3'};
const entryPath = '/note-entries/' + id;
const listPath = '/note-entries?category=life&date=' + date;
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
};

function fixture(factory = createNoteEntriesStore, options = {}) {
  const db = options.db || createMemoryDB();
  const api = createLocalApi({db, ...(options.ownerId ? {ownerId: options.ownerId} : {})});
  const stats = {puts: 0};
  const put = async (entryId, body) => {
    stats.puts++;
    return api('/note-entries/' + entryId, {method: 'PUT', body, headers});
  };
  const store = factory({category: 'life', manualSave: true, multiLabels: true,
    uuid: nextId,
    load: () => api(listPath, {headers}),
    loadVerified: () => api(listPath, {headers}),
    loadEntry: entryId => api('/note-entries/' + entryId, {headers}),
    loadOperation: operationId => api('/note-entries/operations/' + operationId, {headers}),
    put,
    ...(options.overrides ? options.overrides({api, put, stats}) : {})});
  const restore = async (extra = {}) => {
    await store.read(date);
    return store.restoreDraft({id, category: 'life', date, draft: initial,
      version: 0, serverText: '', contentHash: '', labels: [], labelKnown: true,
      pending: null, ...extra});
  };
  return {db, api, stats, put, store, restore};
}

test('note recovery adapter changes one authoritative acceptance statement and leaves original source/local-only acceptance intact', () => {
  assert.equal(patches.length, 1);
  assert.equal(createHash('sha256').update(original).digest('hex'),
    'bbf9d2b9929a4a8d02e33006f3a8651cfa410a673babe5dbbc3b2db05ad2aff1');
  assert.equal(patched.replace(' delete item.recoveredBaseline;', ''), original);
  const localAcceptance = source => source.slice(source.indexOf('  function acceptedLocal('),
    source.indexOf('  async function send('));
  assert.equal(localAcceptance(patched), localAcceptance(original));
  assert.equal((bundle.match(/delete item\.recoveredBaseline;/g) || []).length, 1);
});

for (const [name, factory] of [['transformed source', createNoteEntriesStore], ['rebuilt bundle', bundledStore]]) {
  test(name + ': restored draft can be saved, edited, saved again and reopened with exact identity/text/count', async () => {
    const h = fixture(factory);
    let reopened;
    try {
      const item = await h.restore();
      assert.equal(item.recoveredBaseline.version, 0);
      await h.store.save(id);
      assert.equal(item.phase, 'saved');
      assert.equal(item.version, 1);
      assert.equal(item.recoveredBaseline, undefined);
      h.store.edit(id, changed);
      await h.store.save(id);
      assert.equal(item.phase, 'saved');
      assert.equal(item.version, 2);
      assert.equal(item.dirty, false);
      assert.equal(item.error, '');
      assert.equal(h.stats.puts, 2);
      assert.equal((await h.api(entryPath, {headers})).text, changed);
      h.store.dispose();
      reopened = fixture(factory, {db: h.db});
      await reopened.store.read(date);
      assert.deepEqual(reopened.store.page(date).ids, [id]);
      assert.equal(reopened.store.entry(id).draft, changed);
      assert.equal(reopened.store.entry(id).serverText, changed);
      assert.equal(reopened.store.entry(id).version, 2);
      assert.equal(reopened.store.entry(id).phase, 'saved');
    } finally { h.store.dispose(); reopened?.store.dispose(); }
  });

  test(name + ': pending acknowledgement keeps recovery protection and a newer concurrent draft survives the old save', async () => {
    const started = deferred(), release = deferred();
    let calls = 0;
    const h = fixture(factory, {overrides: ({put}) => ({put: async (...args) => {
      const value = await put(...args);
      if (++calls === 1) { started.resolve(); await release.promise; }
      return value;
    }})});
    try {
      const item = await h.restore(), baseline = item.recoveredBaseline;
      const save = h.store.save(id);
      await started.promise;
      assert.equal(item.recoveredBaseline, baseline);
      assert.ok(item.pending);
      assert.equal(item.phase, 'saving');
      h.store.edit(id, changed);
      release.resolve();
      await save;
      assert.equal(item.recoveredBaseline, undefined);
      assert.equal(item.draft, changed);
      assert.equal(item.serverText, initial);
      assert.equal(item.version, 1);
      assert.equal(item.dirty, true);
      assert.equal(item.phase, 'dirty');
      await h.store.save(id);
      assert.equal(item.version, 2);
      assert.equal(item.phase, 'saved');
      assert.equal((await h.api(entryPath, {headers})).text, changed);
    } finally { release.resolve(); h.store.dispose(); }
  });
}

test('a changed remote version still blocks the recovered draft before any write', async () => {
  const h = fixture();
  try {
    const row = await h.api(entryPath, {method: 'PUT', headers,
      body: {version: 0, save_id: nextId(), category: 'life', date, text: 'SYNTHETIC 另一版本', labels: []}});
    const item = await h.restore(), baseline = item.recoveredBaseline;
    await h.store.save(id);
    assert.equal(h.stats.puts, 0);
    assert.equal(item.recoveredBaseline, baseline);
    assert.equal(item.draft, initial);
    assert.match(item.error, /状态发生变化/);
    assert.equal((await h.api(entryPath, {headers})).content_hash, row.content_hash);
  } finally { h.store.dispose(); }
});

test('a newer edit during recovery verification is not sent or consumed by that older request', async () => {
  const started = deferred(), release = deferred();
  const h = fixture(createNoteEntriesStore, {overrides: ({api}) => ({loadVerified: async () => {
    started.resolve(); await release.promise; return api(listPath, {headers});
  }})});
  try {
    const item = await h.restore(), baseline = item.recoveredBaseline;
    const save = h.store.save(id);
    await started.promise;
    h.store.edit(id, changed);
    release.resolve();
    await save;
    assert.equal(h.stats.puts, 0);
    assert.equal(item.recoveredBaseline, baseline);
    assert.equal(item.draft, changed);
    assert.equal(item.dirty, true);
    assert.equal(item.pending, null);
    await h.store.save(id);
    assert.equal(item.recoveredBaseline, undefined);
    assert.equal((await h.api(entryPath, {headers})).text, changed);
  } finally { release.resolve(); h.store.dispose(); }
});

test('a local transaction failure retains the recovered baseline and unsaved draft', async () => {
  const h = fixture(createNoteEntriesStore, {overrides: () => ({put: async () => {
    throw Object.assign(new Error('SYNTHETIC storage abort'), {localNotSaved: true});
  }})});
  try {
    const item = await h.restore(), baseline = item.recoveredBaseline;
    await h.store.save(id);
    assert.equal(item.recoveredBaseline, baseline);
    assert.equal(item.draft, initial);
    assert.equal(item.version, 0);
    assert.equal(item.dirty, true);
    assert.equal(item.phase, 'error');
    assert.equal((await h.api(listPath, {headers})).entries.length, 0);
  } finally { h.store.dispose(); }
});

for (const mode of ['queued', 'cached']) {
  test(mode + ' local-only document does not retire a recovered authoritative baseline', async () => {
    const h = fixture(createNoteEntriesStore, {overrides: () => ({put: async (entryId, body) =>
      localDocument({local: {id: entryId, category: 'life', date, text: body.text,
        version: body.version + 1, can_edit: true, deleted: false,
        labels_version: 1, label: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
      operation: mode === 'queued' ? {save_id: body.save_id} : null})})});
    try {
      const item = await h.restore(), baseline = item.recoveredBaseline;
      await h.store.save(id);
      assert.equal(item.recoveredBaseline, baseline);
      assert.equal(item.localBacked, true);
      assert.equal(item.localVersion, 1);
      assert.equal(item.localQueued, mode === 'queued');
      assert.equal(item.phase, mode);
      assert.equal(item.version, 0);
    } finally { h.store.dispose(); }
  });
}

test('an invalid response without a verified receipt remains unknown and does not retire recovery protection', async () => {
  const h = fixture(createNoteEntriesStore, {overrides: () => ({put: async () => ({version: 1})})});
  try {
    const item = await h.restore(), baseline = item.recoveredBaseline;
    await h.store.save(id);
    assert.equal(item.recoveredBaseline, baseline);
    assert.equal(item.phase, 'unknown');
    assert.equal(item.pending.uncertain, true);
    assert.equal(item.version, 0);
    assert.equal(item.draft, initial);
    assert.equal((await h.api(listPath, {headers})).entries.length, 0);
  } finally { h.store.dispose(); }
});

test('a lost acknowledgement retires the baseline only after exact receipt and canonical-document reconciliation', async () => {
  let calls = 0;
  const h = fixture(createNoteEntriesStore, {overrides: ({put}) => ({put: async (...args) => {
    const value = await put(...args);
    if (++calls === 1) throw new Error('SYNTHETIC lost acknowledgement');
    return value;
  }})});
  try {
    const item = await h.restore();
    await h.store.save(id);
    assert.equal(item.recoveredBaseline, undefined);
    assert.equal(item.phase, 'saved');
    assert.equal(item.pending, null);
    assert.equal(item.version, 1);
    h.store.edit(id, changed);
    await h.store.save(id);
    assert.equal(item.version, 2);
    assert.equal((await h.api(entryPath, {headers})).text, changed);
  } finally { h.store.dispose(); }
});

test('a conflict after verification preserves both remote text and the recovered local draft', async () => {
  const h = fixture(createNoteEntriesStore, {overrides: ({api, stats}) => ({put: async () => {
    stats.puts++;
    await api(entryPath, {method: 'PUT', headers, body: {version: 0, save_id: nextId(),
      category: 'life', date, text: 'SYNTHETIC 同步冲突另一份', labels: []}});
    throw Object.assign(new Error('SYNTHETIC version conflict'), {status: 409, code: 'VERSION_CONFLICT'});
  }})});
  try {
    const item = await h.restore(), baseline = item.recoveredBaseline;
    await h.store.save(id);
    assert.equal(item.recoveredBaseline, baseline);
    assert.equal(item.phase, 'conflict');
    assert.equal(item.draft, initial);
    assert.equal(item.remote.text, 'SYNTHETIC 同步冲突另一份');
    assert.equal((await h.api(entryPath, {headers})).text, item.remote.text);
    await h.store.save(id);
    assert.equal(h.stats.puts, 1);
  } finally { h.store.dispose(); }
});

test('a disposed old identity cannot accept a late response or retire its recovery baseline', async () => {
  const started = deferred(), release = deferred();
  const h = fixture(createNoteEntriesStore, {overrides: ({put}) => ({put: async (...args) => {
    const value = await put(...args); started.resolve(); await release.promise; return value;
  }})});
  let replacement;
  try {
    const item = await h.restore(), baseline = item.recoveredBaseline;
    const save = h.store.save(id);
    await started.promise;
    h.store.dispose();
    replacement = fixture(createNoteEntriesStore, {db: h.db,
      ownerId: '30000000-0000-4000-8000-000000000002'});
    await replacement.store.read(date);
    release.resolve();
    await save;
    assert.equal(item.recoveredBaseline, baseline);
    assert.equal(item.version, 0);
    assert.equal(item.draft, initial);
    assert.deepEqual(replacement.store.page(date).ids, []);
    assert.equal(replacement.store.entry(id), undefined);
  } finally { release.resolve(); h.store.dispose(); replacement?.store.dispose(); }
});
