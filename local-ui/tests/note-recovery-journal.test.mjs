import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createMemoryDB} from '../frontend/web/offline/db.mjs';
import {createStandaloneRuntime} from '../frontend/web/local/runtime.mjs';
import {LOCAL_SCOPE, canonical, digest} from '../frontend/web/local/common.mjs';
import {isLocalDocument} from '../frontend/web/offline/document.mjs';
import {createDraftRevisionTracker, createEntryRecoveryGuard, createLegacyRecoveryGuard,
  unchangedEntrySinceSnapshot, uniqueRetainedDrafts, matchesDeletedEntry} from '../frontend/web/offline/retained-drafts.mjs';
import {noteDraftNeedsAttention} from '../frontend/web/core/notes-editor-view.mjs';
import {dailyNotesToday} from '../frontend/web/core/daily-notes-state.mjs';
import {draftTransforms} from '../scripts/draft-transforms.mjs';

const date = dailyNotesToday(), initial = 'SYNTHETIC Windows note draft 初始内容 最后几字保留验证';
const edited = initial + ' 已通过真实编辑', newer = edited + ' 尚未提交的新尾字';
const headers = {'X-Note-Labels-Version': '3'};
const moduleFile = new URL('../frontend/web/core/note-entries-state.mjs', import.meta.url);
const rawStore = await fs.readFile(moduleFile, 'utf8');
const rawController = await fs.readFile(new URL('../frontend/web/daily-notes-controller.mjs', import.meta.url), 'utf8');
const apply = (file, source) => {
  for (const [target, before, after] of draftTransforms) if (target === file) {
    assert.equal(source.split(before).length - 1, 1, file + ' adapter must be unique');
    source = source.replace(before, after);
  }
  return source;
};
const transformedStore = apply('core/note-entries-state.mjs', rawStore).replace(/from (['"])(\.[^'"]+)\1/g,
  (_, quote, relative) => 'from ' + quote + new URL(relative, moduleFile).href + quote);
const {createNoteEntriesStore} = await import('data:text/javascript;base64,' + Buffer.from(transformedStore).toString('base64'));
const transformedController = apply('daily-notes-controller.mjs', rawController);
const page = await fs.readFile(new URL('../frontend/web/pages/daily-notes.mjs', import.meta.url), 'utf8');
const displayedText = new Function('noteDraftNeedsAttention',
  page.slice(page.indexOf('function displayedText('), page.indexOf('export function noteEntryTime(')) +
  '\nreturn displayedText;')(noteDraftNeedsAttention);
const declarations = rawController.slice(rawController.indexOf('const draftFields ='), rawController.indexOf('const hydratedDrafts ='));
const draftFields = new Function(declarations + 'return draftFields;')();
const proofFormat = 'haoduoyu-saved-note-draft-v1';
const keyForNote = id => JSON.stringify([LOCAL_SCOPE, 'note_entry', id]);
const keyForReceipt = id => JSON.stringify([LOCAL_SCOPE, 'receipt:note-entry', id]);
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
};
const isNotePut = (path, options) => String(options?.method).toUpperCase() === 'PUT' && /^\/note-entries\/[a-f0-9-]{36}$/i.test(path);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Execute the original full capture/hydrate/visibleArchive functions and original
// request/read/write helpers. Only DOM painting/archive-list display is omitted.
function session(db, {adapters = true, beforePut, afterPut} = {}) {
  let alive = true, draftOwner;
  const runtime = createStandaloneRuntime({db, uuid: () => {
    const value = crypto.randomUUID(); draftOwner ??= value; return value;
  }});
  const entryIdentities = new WeakMap(), hydrationReady = new WeakSet(), entryStores = new Map();
  const entryDraftRevision = createDraftRevisionTracker(), legacy = {pages: new Map()};
  const identity = 'synthetic-unchanged-local-identity';
  const active = () => { if (!alive) throw new DOMException('SYNTHETIC identity replaced', 'AbortError'); };
  const call = async (path, options = {}) => {
    active();
    if (isNotePut(path, options)) await beforePut?.({path, options, runtime});
    const value = await runtime.call(path, {...options, offlineGuard:active});
    if (isNotePut(path, options)) await afterPut?.({path, options, runtime, value});
    return value;
  };
  const source = adapters ? transformedController : rawController;
  const controllerFunctions = source.slice(source.indexOf('function captureNotesDrafts('), source.indexOf('async function archivedDrafts('));
  const archiveFunction = source.slice(source.indexOf('async function visibleArchive('), source.indexOf('async function showRetainedArchive('));
  const controller = new Function('getOfflineRuntime', 'notesIdentityNow', 'entryIdentities', 'hydrationReady',
    'entryDraftRevision', 'entryRecoveryGuard', 'legacyRecoveryGuard', 'noteDraftNeedsAttention',
    'uniqueRetainedDrafts', 'matchesDeletedEntry', 'unchangedEntrySinceSnapshot', 'apiNetwork', 'showRetainedArchive', 'entryStores',
    declarations + '\nconst hydratedDrafts=new WeakMap();let visibleArchiveFlight=null,notesDraftRevision=0;\n' +
    controllerFunctions + '\n' + archiveFunction + '\nreturn {hydrateNotesDrafts,changed(legacy,entries){' +
    'for(const item of entries.entries.values())entryDraftRevision(item);notesDraftRevision++;' +
    'return captureNotesDrafts(legacy,entries,"life");}};')(
      () => runtime, () => alive ? identity : 'synthetic-replaced-identity', entryIdentities, hydrationReady,
      entryDraftRevision, createEntryRecoveryGuard(draftFields), createLegacyRecoveryGuard(), noteDraftNeedsAttention,
      uniqueRetainedDrafts, matchesDeletedEntry, unchangedEntrySinceSnapshot, call, async () => {}, entryStores);
  const transportHelpers = source.slice(source.indexOf('    const noteRequest ='), source.indexOf('    const suffix ='));
  const {noteRequest, noteRead, noteWrite} = new Function('active', 'category', 'dailyNotesRouteDate', 'apiNetwork', 'request', 'isLocalDocument',
    transportHelpers + '\nreturn {noteRequest,noteRead,noteWrite};')(active, 'life', () => date, call, call, isLocalDocument);
  const entriesConfiguration = source.slice(source.indexOf('    const entries = createNoteEntriesStore({'));
  const putSource = entriesConfiguration.match(/      put: ([\s\S]+?),\n      remove:/)?.[1];
  assert.ok(putSource);
  let store;
  const put = new Function('noteWrite', 'getOfflineRuntime', 'entries', 'return (' + putSource + ');')(
    noteWrite, () => runtime, {entry: id => store.entry(id)});
  const onChanged = () => controller.changed(legacy, store);
  store = createNoteEntriesStore({category: 'life', manualSave: true, multiLabels: true, uuid: () => crypto.randomUUID(),
    load: value => noteRead('/note-entries?category=life&date=' + value),
    loadVerified: value => noteRequest('/note-entries?category=life&date=' + value),
    loadEntry: id => noteRead('/note-entries/' + id), loadOperation: id => noteRequest('/note-entries/operations/' + id),
    put, onChange:onChanged, onSaved:onChanged});
  entryIdentities.set(store, identity); entryStores.set('life', store);
  return {runtime, store, owner: () => draftOwner, read: () => store.read(date),
    capture:onChanged,
    hydrate: () => controller.hydrateNotesDrafts(legacy, store, 'life'),
    async ready() { await store.read(date); await controller.hydrateNotesDrafts(legacy, store, 'life'); },
    dispose() { alive = false; store.dispose(); entryStores.clear(); }};
}

const getRows = (db, name) => db.transaction([name], 'readonly', tx => tx.getAll(name));
const getSource = (db, key) => db.transaction(['meta'], 'readonly', tx => tx.get('meta', key));
const proofs = async db => (await getRows(db, 'meta')).filter(row => row.format === proofFormat);
const archive = runtime => runtime.retainedDraftRecords('note_entry');
const summary = item => ({id:item.id, version:item.version, draft:item.draft, serverText:item.serverText,
  displayedText:displayedText(item), dirty:item.dirty, phase:item.phase});
async function seed(db, options = {}) {
  const first = session(db, options);
  try {
    await first.ready();
    const item = first.store.start(date);
    first.store.edit(item.id, initial); await first.runtime.flushDrafts();
    const [source] = await archive(first.runtime);
    assert.ok(source?.write_id);
    return {id:item.id, source:structuredClone(source), owner:first.owner()};
  } finally { first.dispose(); }
}
async function saveTwice(db, options = {}) {
  const original = await seed(db), second = session(db, options);
  try {
    await second.ready();
    assert.equal(second.store.entry(original.id).draft, initial);
    await second.store.save(original.id); await second.runtime.flushDrafts();
    assert.equal(second.store.entry(original.id).phase, 'saved');
    second.store.edit(original.id, edited);
    await second.store.save(original.id); await second.runtime.flushDrafts();
    assert.equal(second.store.entry(original.id).phase, 'saved');
    assert.equal(second.store.entry(original.id).version, 2);
    return {...original, owner2:second.owner()};
  } finally { second.dispose(); }
}
async function snapshot(db) {
  return db.transaction(['entities', 'meta'], 'readonly', async tx =>
    ({entities:await tx.getAll('entities'), meta:await tx.getAll('meta')}));
}
async function restoreDB(data) {
  const db = createMemoryDB();
  await db.transaction(['entities', 'meta'], 'readwrite', async tx => {
    for (const name of ['entities', 'meta']) for (const row of data[name]) await tx.put(name, row);
  });
  return db;
}

if (process.argv.includes('--snapshot-reopen')) {
  const input = JSON.parse(readFileSync(0, 'utf8')), db = await restoreDB(input.snapshot), third = session(db);
  try {
    await third.ready(); await third.runtime.flushDrafts();
    const item = third.store.entry(input.id), rows = await archive(third.runtime);
    const canonicalNote = await third.runtime.call('/note-entries/' + input.id, {headers});
    assert.equal(item.draft, input.expected); assert.equal(displayedText(item), input.expected);
    assert.deepEqual(third.store.page(date).ids, [input.id]); assert.equal(item.version, 2);
    assert.equal(item.phase, 'saved'); assert.equal(canonicalNote.text, input.expected);
    assert.equal(rows.length, 1); assert.equal(rows[0].data.draft, initial);
    assert.equal(await third.runtime.wasSavedNoteDraft(rows[0]), true);
    process.stdout.write(JSON.stringify({owner:third.owner(), summary:summary(item), archiveCount:rows.length,
      canonicalVersion:canonicalNote.version, canonicalText:canonicalNote.text}));
  } finally { third.dispose(); }
} else {
  test('original controller remains byte-for-byte preserved; without its new adapters the complete journal path still reproduces stale reload', async () => {
    assert.equal(createHash('sha256').update(rawController).digest('hex'), '14cf4c9c679be6df6a80a71907eb540cd7c6b5ad1cdde70a220bd520866a3a44');
    const db = createMemoryDB(), original = await seed(db, {adapters:false}), second = session(db, {adapters:false});
    let third;
    try {
      await second.ready(); await second.store.save(original.id); await second.runtime.flushDrafts();
      second.store.edit(original.id, edited); await second.store.save(original.id); await second.runtime.flushDrafts();
      assert.equal(second.store.entry(original.id).phase, 'saved'); second.dispose();
      third = session(db, {adapters:false}); await third.read();
      assert.equal(displayedText(third.store.entry(original.id)), edited);
      await third.hydrate();
      assert.equal((await third.runtime.call('/note-entries/' + original.id, {headers})).text, edited);
      assert.equal(displayedText(third.store.entry(original.id)), initial);
      assert.equal(third.store.entry(original.id).dirty, true);
      assert.equal((await proofs(db)).length, 0);
    } finally { second.dispose(); third?.dispose(); }
  });

  test('three independent draft owners plus a separate process reload preserve the second saved text, identity/count and original archive', async () => {
    const db = createMemoryDB(), original = await saveTwice(db);
    assert.deepEqual(await getSource(db, original.source.key), original.source);
    const confirmed = await proofs(db);
    assert.equal(confirmed.filter(row => row.source_role === 'origin').length, 1);
    assert.equal(confirmed.filter(row => row.source_role === 'submitted').length, 2);
    const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--snapshot-reopen'],
      {input:JSON.stringify({snapshot:await snapshot(db), id:original.id, expected:edited}), encoding:'utf8', env});
    assert.equal(child.status, 0, child.stderr || child.stdout);
    const result = JSON.parse(child.stdout);
    assert.equal(new Set([original.owner, original.owner2, result.owner]).size, 3);
    assert.equal(result.summary.displayedText, edited); assert.equal(result.archiveCount, 1);
  });

  test('immediate hydrate after each save acknowledgement does not require a post-save journal flush', async () => {
    for (let iteration = 0; iteration < 5; iteration++) {
      const db = createMemoryDB(), original = await seed(db), second = session(db);
      let third;
      try {
        await second.ready(); await second.store.save(original.id);
        second.store.edit(original.id, edited); await second.store.save(original.id);
        second.dispose(); third = session(db); await third.ready();
        assert.equal((await third.runtime.call('/note-entries/' + original.id, {headers})).text, edited);
        assert.equal(displayedText(third.store.entry(original.id)), edited,
          JSON.stringify({iteration, state:summary(third.store.entry(original.id)), records:await archive(third.runtime)}));
        assert.deepEqual(third.store.page(date).ids, [original.id]);
      } finally { second.dispose(); third?.dispose(); }
    }
  });

  test('a recovered A edited to B with new labels before its first save reloads B and records the actual confirmed request', async () => {
    const db = createMemoryDB(), original = await seed(db), second = session(db);
    let third;
    const selectedLabels = ['生活', 'SYNTHETIC 标签B'];
    try {
      await second.ready(); second.store.edit(original.id, edited);
      assert.equal(second.store.relabelDraft(original.id, selectedLabels), true);
      await second.store.save(original.id); await second.runtime.flushDrafts();
      assert.equal(second.store.entry(original.id).phase, 'saved');
      const [proof] = await proofs(db);
      assert.equal(proof.request.text, edited);
      assert.deepEqual([...proof.labels].sort(), [...selectedLabels].sort());
      assert.equal(proof.source_sha256, await digest(original.source));
      assert.deepEqual(await getSource(db, original.source.key), original.source);
      second.dispose(); third = session(await restoreDB(JSON.parse(JSON.stringify(await snapshot(db)))));
      await third.ready();
      assert.equal(third.store.entry(original.id).draft, edited);
      assert.equal(third.store.entry(original.id).phase, 'saved');
      assert.deepEqual([...third.store.entry(original.id).labels].sort(), [...selectedLabels].sort());
      assert.deepEqual(third.store.page(date).ids, [original.id]);
    } finally { second.dispose(); third?.dispose(); }
  });

  test('A edited to B/labels before first save keeps an even later C draft while B acknowledgement confirms only the source', async () => {
    const db = createMemoryDB(), original = await seed(db), started = deferred(), release = deferred();
    const second = session(db, {afterPut:async () => { started.resolve(); await release.promise; }});
    const selectedLabels = ['生活', 'SYNTHETIC 标签C'];
    let third;
    try {
      await second.ready(); second.store.edit(original.id, edited);
      second.store.relabelDraft(original.id, selectedLabels);
      const save = second.store.save(original.id); await started.promise;
      second.store.edit(original.id, newer); release.resolve(); await save; await second.runtime.flushDrafts();
      assert.equal(second.store.entry(original.id).draft, newer);
      assert.equal(second.store.entry(original.id).serverText, edited);
      assert.equal(second.store.entry(original.id).dirty, true);
      const [proof] = await proofs(db); assert.equal(proof.request.text, edited);
      assert.deepEqual([...proof.labels].sort(), [...selectedLabels].sort());
      second.dispose(); third = session(db); await third.ready();
      assert.equal(third.store.entry(original.id).draft, newer);
      assert.equal(third.store.entry(original.id).dirty, true);
      assert.deepEqual([...third.store.entry(original.id).labels].sort(), [...selectedLabels].sort());
      const latest = (await archive(third.runtime)).find(row => row.data.draft === newer);
      assert.ok(latest); assert.equal(await third.runtime.wasSavedNoteDraft(latest), false);
    } finally { release.resolve(); second.dispose(); third?.dispose(); }
  });

  test('proof filtering happens before same-content deduplication across equal-time owners and distinct write_ids', async () => {
    const db = createMemoryDB(), original = await saveTwice(db);
    const other = createStandaloneRuntime({db, now:() => original.source.saved_at});
    await other.retainDrafts([structuredClone(original.source.data)]); await other.flushDrafts();
    const third = session(db);
    try {
      const before = await archive(third.runtime);
      const equal = before.filter(row => canonical(row.data) === canonical(original.source.data));
      assert.equal(equal.length, 2); assert.equal(equal[0].saved_at, equal[1].saved_at);
      assert.notEqual(equal[0].write_id, equal[1].write_id);
      assert.equal(await third.runtime.wasSavedNoteDraft(equal[0]), true);
      assert.equal(await third.runtime.wasSavedNoteDraft(equal[1]), false);
      await third.ready();
      assert.equal(third.store.entry(original.id).draft, initial);
      assert.equal(third.store.entry(original.id).dirty, true);
      assert.equal((await archive(third.runtime)).length, 2);
    } finally { third.dispose(); }
  });

  test('a process interruption after canonical commit but before controller acceptance preserves the newer pending row', async () => {
    const db = createMemoryDB(), original = await seed(db), committed = deferred(), release = deferred();
    let second;
    second = session(db, {
      beforePut:async ({runtime}) => {
        // Settle earlier async dirty/preflight captures, then collect the actual
        // still-pending item. This controls the interrupted durable snapshot.
        await runtime.flushDrafts(); await second.capture(); await runtime.flushDrafts();
      },
      afterPut:async () => { committed.resolve(); await release.promise; }
    });
    let third, save;
    try {
      await second.ready(); second.store.edit(original.id, edited);
      save = second.store.save(original.id); await committed.promise; await second.runtime.flushDrafts();
      assert.equal(second.store.entry(original.id).phase, 'saving');
      assert.equal((await proofs(db)).filter(row => row.source_role === 'origin').length, 1);
      const saved = await snapshot(db);
      assert.ok(saved.meta.some(row => row.draft_owner === second.owner() && row.data?.pending?.kind === 'put'));
      second.dispose(); release.resolve(); await save;
      third = session(await restoreDB(JSON.parse(JSON.stringify(saved)))); await third.ready();
      assert.equal(third.store.entry(original.id).draft, edited);
      assert.equal(third.store.entry(original.id).phase, 'unknown');
      assert.equal(third.store.entry(original.id).pending?.uncertain, true);
      const rows = await archive(third.runtime);
      assert.equal(await third.runtime.wasSavedNoteDraft(rows.find(row => row.key === original.source.key)), true);
      const pending = rows.find(row => row.data.pending?.kind === 'put');
      assert.ok(pending); assert.equal(await third.runtime.wasSavedNoteDraft(pending), false);
      assert.equal((await third.runtime.call('/note-entries/' + original.id, {headers})).text, edited);
    } finally { release.resolve(); second.dispose(); if (save) await save; third?.dispose(); }
  });

  test('an interrupted exact submitted row stays archived and recovers saved only through its matching committed proof', async () => {
    const db = createMemoryDB(), original = await seed(db), committed = deferred(), release = deferred();
    const second = session(db, {afterPut:async () => { committed.resolve(); await release.promise; }});
    let third, save;
    try {
      await second.ready(); second.store.edit(original.id, edited);
      save = second.store.save(original.id); await committed.promise; await second.runtime.flushDrafts();
      const saved = await snapshot(db), own = saved.meta.find(row => row.draft_owner === second.owner());
      assert.ok(own); assert.equal(own.data.draft, edited);
      second.dispose(); release.resolve(); await save;
      third = session(await restoreDB(JSON.parse(JSON.stringify(saved)))); await third.ready();
      assert.equal(third.store.entry(original.id).draft, edited);
      assert.equal(own.data.phase, 'saving'); assert.ok(own.data.pending);
      assert.equal(third.store.entry(original.id).phase, 'saved');
      const retained = (await archive(third.runtime)).find(row => row.key === own.key);
      assert.ok(retained); assert.equal(await third.runtime.wasSavedNoteDraft(retained), true);
    } finally { release.resolve(); second.dispose(); if (save) await save; third?.dispose(); }
  });

  test('a pending old acknowledgement marks only its exact source while a newer unsent draft survives another runtime hydrate', async () => {
    const db = createMemoryDB(), original = await seed(db), started = deferred(), release = deferred();
    const second = session(db, {afterPut:async () => { started.resolve(); await release.promise; }});
    let third;
    try {
      await second.ready(); const save = second.store.save(original.id); await started.promise;
      second.store.edit(original.id, newer); await second.runtime.flushDrafts(); release.resolve(); await save;
      await second.runtime.flushDrafts();
      assert.equal(second.store.entry(original.id).draft, newer);
      assert.equal(second.store.entry(original.id).dirty, true);
      assert.equal(second.store.entry(original.id).version, 1);
      second.dispose(); third = session(await restoreDB(JSON.parse(JSON.stringify(await snapshot(db)))));
      await third.ready();
      assert.equal(third.store.entry(original.id).draft, newer);
      assert.equal(displayedText(third.store.entry(original.id)), newer);
      const rows = await archive(third.runtime);
      assert.equal(await third.runtime.wasSavedNoteDraft(rows.find(row => row.key === original.source.key)), true);
      const latest = rows.find(row => row.data.draft === newer);
      assert.ok(latest); assert.equal(await third.runtime.wasSavedNoteDraft(latest), false);
    } finally { release.resolve(); second.dispose(); third?.dispose(); }
  });

  test('a concurrently rewritten source is retained and not marked even if the older request commits successfully', async () => {
    const db = createMemoryDB(), original = await seed(db);
    let replacement;
    const second = session(db, {beforePut:async () => {
      replacement = {...structuredClone(original.source), write_id:crypto.randomUUID(), saved_at:Date.now() + 1000,
        data:{...original.source.data, draft:newer}};
      await db.transaction(['meta'], 'readwrite', tx => tx.put('meta', replacement));
    }});
    let third;
    try {
      await second.ready(); await second.store.save(original.id); await second.runtime.flushDrafts();
      assert.equal(second.store.entry(original.id).phase, 'saved');
      const confirmed = await proofs(db);
      assert.equal(confirmed.some(row => row.source_key === original.source.key), false);
      assert.equal(confirmed.filter(row => row.source_role === 'submitted').length, 1);
      assert.deepEqual(await getSource(db, original.source.key), replacement);
      second.dispose(); third = session(db); await third.ready();
      assert.equal(third.store.entry(original.id).draft, newer);
      assert.equal(third.store.entry(original.id).dirty, true);
    } finally { second.dispose(); third?.dispose(); }
  });

  test('an identical-text new write_id is a new recovery snapshot, never consumed by an older saved proof', async () => {
    const db = createMemoryDB(), original = await saveTwice(db);
    await db.transaction(['meta'], 'readwrite', tx => tx.put('meta', {...original.source,
      write_id:crypto.randomUUID(), saved_at:Date.now() + 1000}));
    const third = session(db);
    try {
      await third.ready(); const [row] = await archive(third.runtime);
      assert.equal(await third.runtime.wasSavedNoteDraft(row), false);
      assert.equal(third.store.entry(original.id).draft, initial);
      assert.equal(third.store.entry(original.id).dirty, true);
      assert.equal((await third.runtime.call('/note-entries/' + original.id, {headers})).text, edited);
    } finally { third.dispose(); }
  });

  test('proof creation is atomic with the canonical note and receipt; transaction abort preserves the original archive', async () => {
    const base = createMemoryDB(); let abort = false;
    const db = {transaction:(names, mode, callback) => base.transaction(names, mode, async tx => {
      const result = await callback(tx);
      if (abort && mode === 'readwrite' && names.includes('entities') &&
          (await tx.getAll('meta')).some(row => row.format === proofFormat)) throw new Error('SYNTHETIC transaction abort after proof');
      return result;
    })};
    const original = await seed(db), second = session(db);
    try {
      await second.ready(); abort = true; await second.store.save(original.id); abort = false;
      await second.runtime.flushDrafts();
      assert.equal(second.store.entry(original.id).phase, 'error');
      assert.ok(second.store.entry(original.id).recoveredBaseline);
      assert.equal((await proofs(db)).length, 0);
      assert.equal((await second.runtime.call('/note-entries?category=life&date=' + date, {headers})).entries.length, 0);
      assert.deepEqual(await getSource(db, original.source.key), original.source);
    } finally { abort = false; second.dispose(); }
  });

  test('an unconfirmed/unknown save without a committed canonical operation never marks a source', async () => {
    const db = createMemoryDB(), original = await seed(db), second = session(db, {
      beforePut:async () => { throw new Error('SYNTHETIC unknown request outcome before commit'); }});
    try {
      await second.ready(); await second.store.save(original.id); await second.runtime.flushDrafts();
      assert.equal(second.store.entry(original.id).phase, 'unknown');
      assert.ok(second.store.entry(original.id).pending?.uncertain);
      assert.equal((await proofs(db)).length, 0);
      const source = (await archive(second.runtime)).find(row => row.key === original.source.key);
      assert.equal(await second.runtime.wasSavedNoteDraft(source), false);
    } finally { second.dispose(); }
  });

  test('a real stale-version conflict blocks the write and leaves the selected source unconsumed', async () => {
    const db = createMemoryDB(), original = await seed(db), second = session(db);
    try {
      await second.runtime.call('/note-entries/' + original.id, {method:'PUT', headers,
        body:{version:0, save_id:crypto.randomUUID(), category:'life', date, text:'SYNTHETIC other canonical version', labels:[]}});
      await second.ready(); await second.store.save(original.id); await second.runtime.flushDrafts();
      assert.notEqual(second.store.entry(original.id).phase, 'saved');
      assert.equal((await proofs(db)).length, 0);
      const source = (await archive(second.runtime)).find(row => row.key === original.source.key);
      assert.equal(await second.runtime.wasSavedNoteDraft(source), false);
    } finally { second.dispose(); }
  });

  test('JSON-cloned and other-runtime request capabilities cannot mark or submit a recovered snapshot', async () => {
    const db = createMemoryDB(), original = await seed(db);
    let checked = false;
    const second = session(db, {beforePut:async ({path, options, runtime}) => {
      assert.ok(options.localRecoveredNoteSave);
      const forged = JSON.parse(JSON.stringify(options.localRecoveredNoteSave));
      await assert.rejects(runtime.call(path, {...options, localRecoveredNoteSave:forged}), /凭据/);
      const other = createStandaloneRuntime({db});
      await assert.rejects(other.call(path, options), /凭据/);
      assert.equal((await proofs(db)).length, 0); checked = true;
    }});
    try {
      await second.ready();
      const source = (await archive(second.runtime)).find(row => row.key === original.source.key);
      assert.equal(second.runtime.bindRecoveredNote({...second.store.entry(original.id)}, structuredClone(source)), false);
      await second.store.save(original.id); await second.runtime.flushDrafts();
      assert.equal(checked, true); assert.equal(second.store.entry(original.id).phase, 'saved');
    } finally { second.dispose(); }
  });

  test('an identity replaced before commit cannot write a canonical note or a saved-snapshot proof', async () => {
    const db = createMemoryDB(), original = await seed(db);
    let second;
    second = session(db, {beforePut:async () => { second.dispose(); }});
    try {
      await second.ready(); await second.store.save(original.id);
      assert.equal((await proofs(db)).length, 0);
      assert.equal((await getRows(db, 'entities')).filter(row => row.kind === 'note_entry').length, 0);
      assert.deepEqual(await getSource(db, original.source.key), original.source);
    } finally { second.dispose(); }
  });

  test('a C-to-A2 same-operation revision queued after prepare is never marked as its earlier boundary row', async () => {
    const db = createMemoryDB(), original = await seed(db), committed = deferred(), release = deferred();
    let second, a2;
    second = session(db, {
      beforePut:async ({runtime}) => {
        second.store.edit(original.id, newer); second.store.edit(original.id, initial);
        await runtime.flushDrafts();
        a2 = (await archive(runtime)).find(row => row.draft_owner === second.owner());
        assert.ok(a2?.data.pending); assert.equal(a2.data.draft, initial);
      },
      afterPut:async () => { committed.resolve(); await release.promise; }
    });
    let third, save;
    try {
      await second.ready(); save = second.store.save(original.id); await committed.promise;
      const confirmed = await proofs(db);
      assert.equal(confirmed.some(proof => proof.source_key === original.source.key), true);
      assert.equal(confirmed.some(proof => proof.source_key === a2.key && proof.source_write_id === a2.write_id), false);
      third = session(await restoreDB(JSON.parse(JSON.stringify(await snapshot(db))))); await third.ready();
      assert.equal(third.store.entry(original.id).phase, 'unknown');
      assert.equal(third.store.entry(original.id).draft, initial);
      second.dispose(); release.resolve(); await save;
    } finally { release.resolve(); second.dispose(); if (save) await save; third?.dispose(); }
  });

  test('a delayed acknowledged clean capture cannot delete a later C, and immediate hydrate needs no clean-row completion', async () => {
    const db = createMemoryDB(), original = await seed(db), second = session(db);
    const originalDigest = crypto.subtle.digest, native = originalDigest.bind(crypto.subtle), gate = deferred(), started = deferred();
    let hold = false, tracked, third;
    crypto.subtle.digest = (algorithm, bytes) => {
      const text = new TextDecoder().decode(bytes);
      if (hold && text.startsWith('[') && tracked && !tracked.dirty && !tracked.pending) {
        started.resolve(); return gate.promise.then(() => native(algorithm, bytes));
      }
      return native(algorithm, bytes);
    };
    try {
      await second.ready(); tracked = second.store.entry(original.id); hold = true;
      await second.store.save(original.id); await started.promise;
      // Keep the already-held old capture blocked, but do not intercept the
      // fresh runtime's independent clean capture of the same text.
      hold = false;
      assert.equal(tracked.phase, 'saved');
      const immediate = session(await restoreDB(JSON.parse(JSON.stringify(await snapshot(db)))));
      try { await immediate.ready(); assert.equal(immediate.store.entry(original.id).phase, 'saved'); assert.equal(displayedText(immediate.store.entry(original.id)), initial); }
      finally { immediate.dispose(); }
      second.store.edit(original.id, newer);
      let complete = false; const flush = second.runtime.flushDrafts().then(() => { complete = true; });
      await sleep(10); assert.equal(complete, false);
      assert.equal((await archive(second.runtime)).some(row => row.draft_owner === second.owner() && row.data.draft === newer), false);
      hold = false; gate.resolve(); await flush;
      const durableC = (await archive(second.runtime)).find(row => row.draft_owner === second.owner() && row.data.draft === newer);
      assert.ok(durableC); assert.equal(await second.runtime.wasSavedNoteDraft(durableC), false);
      second.dispose(); third = session(await restoreDB(JSON.parse(JSON.stringify(await snapshot(db))))); await third.ready();
      assert.equal(third.store.entry(original.id).draft, newer); assert.equal(third.store.entry(original.id).dirty, true);
    } finally { hold = false; gate.resolve(); crypto.subtle.digest = originalDigest; second.dispose(); third?.dispose(); }
  });

  test('other draft owners and other account scopes remain untouched by the selected snapshot proof', async () => {
    const db = createMemoryDB(), original = await seed(db);
    const otherOwner = {...structuredClone(original.source), key:original.source.key + ':other-owner',
      draft_owner:crypto.randomUUID(), write_id:crypto.randomUUID(), saved_at:original.source.saved_at - 1000,
      data:{...original.source.data, draft:newer}};
    const foreign = {...structuredClone(otherOwner), key:otherOwner.key + ':foreign', scope:'local:foreign'};
    await db.transaction(['meta'], 'readwrite', async tx => { await tx.put('meta', otherOwner); await tx.put('meta', foreign); });
    const second = session(db);
    try {
      await second.ready(); await second.store.save(original.id); await second.runtime.flushDrafts();
      assert.equal((await proofs(db)).filter(row => row.source_role === 'origin').length, 1);
      assert.equal((await proofs(db)).filter(row => row.source_role === 'submitted').length, 1);
      assert.deepEqual(await getSource(db, otherOwner.key), otherOwner);
      assert.deepEqual(await getSource(db, foreign.key), foreign);
      const rows = await archive(second.runtime), other = rows.find(row => row.key === otherOwner.key);
      assert.equal(await second.runtime.wasSavedNoteDraft(other), false);
      assert.equal(rows.some(row => row.key === foreign.key), false);
    } finally { second.dispose(); }
  });

  const damageCases = [
    ['missing canonical note', async (tx, original) => tx.delete('entities', keyForNote(original.id))],
    ['rolled-back canonical version', async (tx, original) => {
      const row = await tx.get('entities', keyForNote(original.id)); row.value.version = 0; await tx.put('entities', row);
    }],
    ['corrupt canonical text/hash', async (tx, original) => {
      const row = await tx.get('entities', keyForNote(original.id)); row.value.text += 'SYNTHETIC corruption'; await tx.put('entities', row);
    }],
    ['missing receipt', async (tx, _original, proof) => tx.delete('meta', keyForReceipt(proof.save_id))],
    ['tampered receipt document', async (tx, _original, proof) => {
      const row = await tx.get('meta', keyForReceipt(proof.save_id)); row.response.change_seq++; await tx.put('meta', row);
    }],
    ['wrong source digest', async (tx, _original, proof) => tx.put('meta', {...proof, source_sha256:'0'.repeat(64)})],
    ['tampered actual request text', async (tx, _original, proof) => tx.put('meta', {...proof,
      request:{...proof.request, text:'SYNTHETIC altered confirmed request'}})],
    ['tampered confirmed labels', async (tx, _original, proof) => tx.put('meta', {...proof, labels:['SYNTHETIC altered labels']})],
    ['changed source row with unchanged write_id', async (tx, original) => {
      const row = await tx.get('meta', original.source.key); row.data.draft = newer; await tx.put('meta', row);
    }]
  ];
  for (const [name, corrupt] of damageCases) test(name + ' fails closed and keeps the original archive available', async () => {
    const db = createMemoryDB(), original = await saveTwice(db), [proof] = await proofs(db);
    await db.transaction(['meta', 'entities'], 'readwrite', tx => corrupt(tx, original, proof));
    const third = session(db);
    try {
      const rows = await archive(third.runtime), source = rows.find(row => row.key === original.source.key);
      assert.ok(source); assert.equal(await third.runtime.wasSavedNoteDraft(source), false);
      await third.ready();
      assert.ok((await archive(third.runtime)).some(row => row.key === original.source.key));
    } finally { third.dispose(); }
  });

  test('a higher valid canonical revision and a valid soft-delete tombstone preserve the exact saved proof', async () => {
    const db = createMemoryDB(), original = await saveTwice(db), third = session(db);
    try {
      let [source] = await archive(third.runtime);
      assert.equal(await third.runtime.wasSavedNoteDraft(source), true);
      await third.runtime.call('/note-entries/' + original.id, {method:'DELETE', headers,
        body:{version:2, save_id:crypto.randomUUID()}});
      [source] = await archive(third.runtime);
      assert.equal(await third.runtime.wasSavedNoteDraft(source), true);
      assert.deepEqual(await getSource(db, original.source.key), original.source);
    } finally { third.dispose(); }
  });
}
