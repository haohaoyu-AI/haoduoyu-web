import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryDB} from '../frontend/web/offline/db.mjs';
import {createStandaloneRuntime} from '../frontend/web/local/runtime.mjs';
import {dailyNotesToday} from '../frontend/web/core/daily-notes-state.mjs';

const date = dailyNotesToday();
const options = {concurrency: false, timeout: 8000};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const records = runtime => runtime.retainedDraftRecords('note_entry');
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}
async function bounded(promise, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + ' did not complete')), 2000);
    })]);
  } finally { clearTimeout(timer); }
}
function draft(text, id = crypto.randomUUID()) {
  return {kind: 'note_entry', id, category: 'life', date, draft: text, version: 0,
    serverText: '', contentHash: '', labels: [], labelKnown: true, dirty: true,
    phase: 'dirty', pending: null, remote: null, deleted: false, localVersion: 0,
    durableText: '', localBacked: false, localQueued: false};
}
function noteDigestText(bytes) {
  const text = new TextDecoder().decode(bytes);
  return text.startsWith('[') ? JSON.parse(text)[3] : null;
}

// These probes use the real standalone runtime and original journal. Delaying
// SHA completion controls ordering without changing stored rows or product code.
test('draft queue freezes the array and nested operation at enqueue time', options, async () => {
  const native = crypto.subtle.digest.bind(crypto.subtle);
  const started = deferred(), release = deferred();
  let hold = true;
  crypto.subtle.digest = (algorithm, bytes) => {
    if (hold && noteDigestText(bytes) === 'SYNTHETIC HOLD snapshot') {
      started.resolve(); return release.promise.then(() => native(algorithm, bytes));
    }
    return native(algorithm, bytes);
  };
  try {
    const runtime = createStandaloneRuntime({db: createMemoryDB()});
    await runtime.composerReady;
    const first = runtime.retainDrafts([draft('SYNTHETIC HOLD snapshot')]);
    await bounded(started.promise, 'Initial capture');
    const row = draft('SYNTHETIC frozen B');
    row.labels = ['SYNTHETIC label']; row.phase = 'saving';
    row.pending = {kind: 'put', version: 0, saveId: crypto.randomUUID(),
      text: row.draft, labels: [...row.labels]};
    const rows = [row], second = runtime.retainDrafts(rows);
    row.draft = 'SYNTHETIC MUTATED'; row.labels.push('SYNTHETIC MUTATED');
    row.pending.text = 'SYNTHETIC MUTATED'; row.pending.labels.push('SYNTHETIC MUTATED');
    rows.length = 0;
    hold = false; release.resolve();
    await Promise.all([first, second]); await runtime.flushDrafts();
    const actual = (await records(runtime)).find(value => value.data.id === row.id)?.data;
    assert.equal(actual?.draft, 'SYNTHETIC frozen B');
    assert.deepEqual(actual.labels, ['SYNTHETIC label']);
    assert.equal(actual.pending.text, 'SYNTHETIC frozen B');
    assert.deepEqual(actual.pending.labels, ['SYNTHETIC label']);
  } finally { hold = false; release.resolve(); crypto.subtle.digest = native; }
});

test('flush waits for captures appended while its first tail is pending', options, async () => {
  const native = crypto.subtle.digest.bind(crypto.subtle);
  const starts = [deferred(), deferred()], gates = [deferred(), deferred()];
  let hold = true;
  crypto.subtle.digest = (algorithm, bytes) => {
    const index = ['SYNTHETIC hold A', 'SYNTHETIC hold B'].indexOf(noteDigestText(bytes));
    if (hold && index >= 0) {
      starts[index].resolve(); return gates[index].promise.then(() => native(algorithm, bytes));
    }
    return native(algorithm, bytes);
  };
  try {
    const runtime = createStandaloneRuntime({db: createMemoryDB()});
    await runtime.composerReady;
    const first = runtime.retainDrafts([draft('SYNTHETIC hold A')]);
    await bounded(starts[0].promise, 'First capture');
    let settled = false;
    const flush = runtime.flushDrafts().then(() => { settled = true; });
    const second = runtime.retainDrafts([draft('SYNTHETIC hold B')]);
    gates[0].resolve(); await bounded(starts[1].promise, 'Appended capture');
    await sleep(20);
    assert.equal(settled, false, 'Flush returned while the appended capture still awaited SHA');
    hold = false; gates[1].resolve(); await Promise.all([first, second, flush]);
  } finally {
    hold = false; for (const gate of gates) gate.resolve(); crypto.subtle.digest = native;
  }
});

test('unrelated success and empty capture cannot clear a failed record; rewriting it repairs flush', options, async () => {
  const base = createMemoryDB(), first = draft('SYNTHETIC failed A'), second = draft('SYNTHETIC unrelated B');
  let fail = true;
  const db = {transaction: (names, mode, callback) => base.transaction(names, mode, tx => callback({
    ...tx, put(name, value) {
      if (fail && name === 'meta' && value.draft_kind === 'note_entry' && value.data.id === first.id)
        throw new Error('SYNTHETIC durable A failure');
      return tx.put(name, value);
    }
  }))};
  const runtime = createStandaloneRuntime({db}); await runtime.composerReady;
  await assert.rejects(runtime.retainDrafts([first])); fail = false;
  await runtime.retainDrafts([second]); await runtime.retainDrafts([]);
  await assert.rejects(runtime.flushDrafts(), /SYNTHETIC durable A failure/);
  await runtime.retainDrafts([first]); await runtime.flushDrafts();
  assert.deepEqual(new Set((await records(runtime)).map(row => row.data.id)), new Set([first.id, second.id]));
});

test('a failed multi-record transaction requires every affected record to be rewritten', options, async () => {
  const base = createMemoryDB(), first = draft('SYNTHETIC batch A'), second = draft('SYNTHETIC batch B');
  let fail = true;
  const db = {transaction: (names, mode, callback) => base.transaction(names, mode, tx => callback({
    ...tx, put(name, value) {
      if (fail && name === 'meta' && value.draft_kind === 'note_entry' && value.data.id === second.id)
        throw new Error('SYNTHETIC batch abort');
      return tx.put(name, value);
    }
  }))};
  const runtime = createStandaloneRuntime({db}); await runtime.composerReady;
  await assert.rejects(runtime.retainDrafts([first, second])); fail = false;
  await runtime.retainDrafts([first]); await assert.rejects(runtime.flushDrafts(), /SYNTHETIC batch abort/);
  await runtime.retainDrafts([second]); await runtime.flushDrafts();
  assert.equal((await records(runtime)).length, 2);
});

test('flush also waits for a note capture appended during composer readback', options, async () => {
  const base = createMemoryDB(), readStarted = deferred(), releaseRead = deferred();
  const hashStarted = deferred(), releaseHash = deferred();
  const native = crypto.subtle.digest.bind(crypto.subtle);
  let interceptRead = false, holdHash = true;
  const db = {async transaction(names, mode, callback) {
    if (interceptRead && mode === 'readonly' && names.length === 1 && names[0] === 'meta') {
      interceptRead = false; readStarted.resolve(); await releaseRead.promise;
    }
    return base.transaction(names, mode, callback);
  }};
  crypto.subtle.digest = (algorithm, bytes) => {
    if (holdHash && noteDigestText(bytes) === 'SYNTHETIC composer-gap C') {
      hashStarted.resolve(); return releaseHash.promise.then(() => native(algorithm, bytes));
    }
    return native(algorithm, bytes);
  };
  try {
    const runtime = createStandaloneRuntime({db}); await runtime.composerReady;
    interceptRead = true;
    let settled = false;
    const flush = runtime.flushDrafts().then(() => { settled = true; });
    await bounded(readStarted.promise, 'Composer readback');
    const capture = runtime.retainDrafts([draft('SYNTHETIC composer-gap C')]);
    await bounded(hashStarted.promise, 'Appended note SHA');
    releaseRead.resolve(); await sleep(20);
    assert.equal(settled, false, 'Global flush returned while the later note still awaited SHA');
    holdHash = false; releaseHash.resolve(); await Promise.all([capture, flush]);
  } finally {
    interceptRead = false; holdHash = false; releaseRead.resolve(); releaseHash.resolve(); crypto.subtle.digest = native;
  }
});

test('non-array capture rejects and a later valid empty array cannot hide that failure', options, async () => {
  const runtime = createStandaloneRuntime({db: createMemoryDB()}); await runtime.composerReady;
  await assert.rejects(runtime.retainDrafts({}), /array/);
  await runtime.retainDrafts([]);
  await assert.rejects(runtime.flushDrafts(), /array/);
});

test('prepare fixes its boundary before a queued C-to-A2 edit with the same request and text', options, async () => {
  const base = createMemoryDB(), release = deferred(), started = deferred();
  const id = crypto.randomUUID(), native = crypto.subtle.digest.bind(crypto.subtle);
  let boundaryWriteId, intercepted = false;
  const db = {transaction: (names, mode, callback) => base.transaction(names, mode, tx => callback({
    ...tx, async get(name, key) {
      const value = await tx.get(name, key);
      if (names.length === 1 && names[0] === 'meta' && mode === 'readonly' &&
          value?.draft_kind === 'note_entry' && value.data.id === id) boundaryWriteId ??= value.write_id;
      return value;
    }
  }))};
  crypto.subtle.digest = (algorithm, bytes) => {
    if (!intercepted && noteDigestText(bytes) === 'SYNTHETIC boundary holder') {
      intercepted = true; started.resolve(); return release.promise.then(() => native(algorithm, bytes));
    }
    return native(algorithm, bytes);
  };
  try {
    const runtime = createStandaloneRuntime({db}); await runtime.composerReady;
    const holder = runtime.retainDrafts([draft('SYNTHETIC boundary holder')]);
    await bounded(started.promise, 'Earlier capture');
    const saveId = crypto.randomUUID();
    const operation = {kind: 'put', version: 0, saveId, text: 'SYNTHETIC A', labels: []};
    const original = {...draft(operation.text, id), phase: 'saving', pending: structuredClone(operation)};
    const initial = runtime.retainDrafts([original]);
    const item = {...original, pending: operation};
    const body = {version: 0, save_id: saveId, category: 'life', date, text: operation.text, labels: []};
    const prepared = runtime.prepareRecoveredNoteSave(item, body);
    // Both calls happen after prepare is invoked, before its read barrier can run.
    const changed = runtime.retainDrafts([{...original, draft: 'SYNTHETIC C'}]);
    const sameTextRevision = runtime.retainDrafts([{...original}]);
    release.resolve(); const token = await prepared; assert.ok(token);
    await Promise.all([holder, initial, changed, sameTextRevision]);
    const current = (await records(runtime)).find(row => row.data.id === id);
    assert.ok(boundaryWriteId); assert.notEqual(current.write_id, boundaryWriteId);
    assert.equal(current.data.pending.saveId, saveId); assert.equal(current.data.draft, body.text);
    await runtime.call('/note-entries/' + id, {method: 'PUT', headers: {'X-Note-Labels-Version': '3'},
      body, localRecoveredNoteSave: token});
    const after = (await records(runtime)).find(row => row.data.id === id);
    assert.equal(after.write_id, current.write_id);
    assert.equal(await runtime.wasSavedNoteDraft(after), false);
    const proofs = await db.transaction(['meta'], 'readonly', async tx =>
      (await tx.getAll('meta')).filter(row => row.format === 'haoduoyu-saved-note-draft-v1'));
    assert.equal(proofs.some(row => row.source_write_id === after.write_id), false);
  } finally { release.resolve(); crypto.subtle.digest = native; }
});
