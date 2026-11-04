import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDraftRevisionTracker, unchangedEntrySinceSnapshot, visibleRetainedDrafts} from '../web/offline/retained-drafts.mjs';
import {createMemoryDB} from '../web/offline/db.mjs';
import {createDraftJournal} from '../web/offline/drafts.mjs';

const id = randomUUID(), date = '2026-10-26';
const row = {kind:'note_entry', id, category:'life', date, draft:'synthetic draft', version:3,
  labels:['life'], label:'life', dirty:true, phase:'dirty', pending:null};
const deleted = {id, category:'life', date, text:row.draft, version:4, deleted:true, can_edit:true,
  labels_version:3, labels:['life']};

test('deduplicates equal snapshots and hides only matching online tombstones, without mutating originals', async () => {
  const rows = [row, {...row, version:2}, {...row, draft:'different'}, {...row, labels:['other']},
    {...row, pending:{kind:'put', saveId:randomUUID(), version:2, text:row.draft}}, {...row, phase:'unknown'}];
  const before = structuredClone(rows);
  const visible = await visibleRetainedDrafts(rows, async () => deleted);
  assert.deepEqual(visible, rows.slice(2));
  assert.deepEqual(rows, before);
});
test('offline, rejected, ambiguous or older responses preserve drafts and separate pending operations', async () => {
  const a = {...row, pending:{kind:'put', saveId:randomUUID(), version:2, text:row.draft}};
  const b = {...a, pending:{...a.pending, saveId:randomUUID()}};
  for (const get of [async () => { throw Error('offline'); }, async () => ({...deleted, version:3}),
    async () => ({...deleted, labels_version:1}), async () => ({...deleted, text:'different'}),
    async () => ({...deleted, deleted:false})]) {
    assert.deepEqual(await visibleRetainedDrafts([row, a, b], get), [row, a, b]);
  }
});
test('checks every snapshot against the tombstone before grouping and preserves unresolved states', async () => {
  const sameVersion = {...row, version:4};
  const conflict = {...row, phase:'conflict', remote:{version:4}};
  assert.deepEqual(await visibleRetainedDrafts([row, sameVersion, conflict], async () => deleted), [sameVersion, conflict]);
});
test('acknowledging a deletion never removes another session’s distinct snapshot', async () => {
  const db = createMemoryDB(), scope = 'a'.repeat(64);
  const a = createDraftJournal({db, getScope: () => scope, draftOwner:'a'});
  const b = createDraftJournal({db, getScope: () => scope, draftOwner:'b'});
  await a.capture([row]); await b.capture([{...row, draft:'different'}]);
  await a.capture([{...row, draft:'', dirty:false, phase:'saved', deleted:true}]);
  assert.deepEqual((await b.list('note_entry')).map(item => item.draft), ['different']);
});
test('a snapshot cannot restore an item created, changed or discarded during verification', () => {
  const epochs = new Map([[id, 2]]), other = randomUUID();
  assert.equal(unchangedEntrySinceSnapshot(epochs, id, undefined), false);
  assert.equal(unchangedEntrySinceSnapshot(epochs, id, {writeEpoch:3}), false);
  assert.equal(unchangedEntrySinceSnapshot(epochs, other, {writeEpoch:0}), false);
  assert.equal(unchangedEntrySinceSnapshot(epochs, id, {writeEpoch:2}), true);
  assert.equal(unchangedEntrySinceSnapshot(epochs, other, undefined), true);
  // Editing then reverting retains the write epoch but advances this item's draft revision.
  assert.equal(unchangedEntrySinceSnapshot(epochs, id, {writeEpoch:2}, 0, 2), false);
  assert.equal(unchangedEntrySinceSnapshot(epochs, id, {writeEpoch:2}, 0, 0), true);
});
test('editing and reverting a draft advances only that item’s revision', () => {
  const track = createDraftRevisionTracker();
  const first = {draft:'saved', labels:[], dirty:false}, other = {draft:'other', labels:[], dirty:false};
  const before = track(first), otherBefore = track(other);
  first.draft = 'edit'; first.dirty = true; track(first);
  first.draft = 'saved'; first.dirty = false;
  assert.notEqual(track(first), before);
  assert.equal(track(other), otherBefore);
});
