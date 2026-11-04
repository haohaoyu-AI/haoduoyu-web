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
  labels_version:3, labels:['life'], deleted_at:'2026-10-26T10:00:00Z', created_at:'2026-10-26T09:00:00Z',
  updated_at:'2026-10-26T10:00:00Z', content_hash:'a'.repeat(64)};

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

test('verified tombstone physically removes only identical old snapshots and blocks stale replay', async () => {
  const db = createMemoryDB(), scope = 'a'.repeat(64), otherScope = 'b'.repeat(64);
  const journal = (owner, getScope = () => scope) => createDraftJournal({db, getScope, draftOwner:owner});
  const a = journal('a'), b = journal('b'), different = journal('different'), pending = journal('pending');
  const foreign = journal('foreign', () => otherScope), later = journal('later');
  await a.capture([row]); await b.capture([row]);
  await different.capture([{...row, draft:'independent edit'}]);
  await pending.capture([{...row, phase:'unknown', pending:{kind:'put', saveId:randomUUID()}}]);
  await later.capture([{...row, version:4}]); await foreign.capture([row]);
  const snapshot = await a.records('note_entry');
  await a.purgeVerified(snapshot, new Map([[id, deleted]]));
  const remaining = await a.list('note_entry');
  assert.equal(remaining.length, 3);
  assert.ok(remaining.some(value => value.draft === 'independent edit'));
  assert.ok(remaining.some(value => value.pending));
  assert.ok(remaining.some(value => value.version === 4));
  assert.equal((await foreign.list('note_entry')).length, 1);
  await b.capture([row]);
  assert.equal((await b.list('note_entry')).length, 3);
  await b.capture([{...row, draft:'new edit'}]);
  assert.ok((await b.list('note_entry')).some(value => value.draft === 'new edit'));
});

test('changed or reverted snapshots, failed verification and cancellation preserve storage', async () => {
  const db = createMemoryDB(), scope = 'a'.repeat(64);
  const a = createDraftJournal({db, getScope:() => scope, draftOwner:'a', now:() => 1});
  await a.capture([row]); const snapshot = await a.records('note_entry');
  await a.capture([{...row, draft:'edited'}]); await a.capture([row]);
  await a.purgeVerified(snapshot, new Map([[id, deleted]]));
  assert.equal((await a.list('note_entry')).length, 1);
  const fresh = await a.records('note_entry');
  for (const value of [{...deleted, deleted_at:null}, {...deleted, can_edit:false}, {...deleted, version:3},
    {...deleted, labels:['different']}, {...deleted, content_hash:''}, null]) {
    await a.purgeVerified(fresh, new Map([[id, value]]));
    assert.equal((await a.list('note_entry')).length, 1);
  }
  await assert.rejects(a.purgeVerified(fresh, new Map([[id, deleted]]), () => false));
  assert.equal((await a.list('note_entry')).length, 1);
});

test('discarding a never-submitted composer removes identical local copies but preserves independent work', async () => {
  const db = createMemoryDB(), scope = 'a'.repeat(64);
  const journal = owner => createDraftJournal({db, getScope:() => scope, draftOwner:owner});
  const unsent = {...row, version:0, localVersion:0};
  const a = journal('a'), b = journal('b'), c = journal('c'), d = journal('d');
  await a.capture([unsent]); await b.capture([unsent]);
  await c.capture([{...unsent, draft:'independent edit'}]);
  await d.capture([{...unsent, pending:{kind:'put', saveId:randomUUID()}, phase:'unknown'}]);
  await a.discardUnsent(unsent);
  let remaining = await a.list('note_entry');
  assert.equal(remaining.length, 2);
  assert.ok(remaining.some(value => value.draft === 'independent edit'));
  assert.ok(remaining.some(value => value.pending));
  await b.capture([unsent]); remaining = await a.list('note_entry');
  assert.equal(remaining.length, 2);
  await assert.rejects(a.discardUnsent({...unsent, pending:{kind:'put'}}));
});

test('acknowledged explicit deletion cleans only pre-delete copies of unsaved text', async () => {
  const db = createMemoryDB(), scope = 'a'.repeat(64);
  const journal = owner => createDraftJournal({db, getScope:() => scope, draftOwner:owner});
  const a = journal('a'), b = journal('b'), changed = journal('changed'), unknown = journal('unknown');
  const edited = {...row, draft:'unsaved text'};
  await a.capture([edited]); await b.capture([edited]); await changed.capture([edited]);
  await unknown.capture([{...edited, pending:{kind:'put', saveId:randomUUID()}, phase:'unknown'}]);
  const snapshot = await a.records('note_entry');
  await changed.capture([{...edited, draft:'later edit'}]);
  await changed.capture([edited]);
  await a.purgeUserDeleted(edited, snapshot, {...deleted, text:'different server text'});
  const remaining = await a.list('note_entry');
  assert.equal(remaining.length, 2);
  assert.ok(remaining.some(value => value.pending));
  assert.ok(remaining.some(value => !value.pending && value.draft === edited.draft));
  await b.capture([edited]);
  assert.equal((await a.list('note_entry')).length, 2);
});


test('queued, locally newer or incompletely labelled snapshots are not deletion evidence', async () => {
  const db = createMemoryDB(), scope = 'a'.repeat(64);
  const journal = owner => createDraftJournal({db, getScope:() => scope, draftOwner:owner});
  const a=journal('a'), b=journal('b'), c=journal('c');
  await a.capture([{...row, localQueued:true}]);
  await b.capture([{...row, localVersion:4}]);
  await c.capture([{...row, labelKnown:false}]);
  await a.purgeVerified(await a.records('note_entry'), new Map([[id, deleted]]));
  assert.equal((await a.list('note_entry')).length, 3);
});
