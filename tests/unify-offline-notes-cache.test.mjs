import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryDB, entityKey} from '../web/offline/db.mjs';
import {createOfflineCache, offlineReadRoute} from '../web/offline/cache.mjs';
import {createNotesCache, isNoteApiRow, noteReadRoute} from '../web/offline/notes.mjs';
import {documentState, documentValue, isLocalDocument} from '../web/offline/document.mjs';

const owner = 'a'.repeat(64), otherOwner = 'b'.repeat(64), date = '2026-10-26', otherDate = '2026-10-25';
const stamp = '2026-10-26T01:00:00Z', hash = 'c'.repeat(64), snapshotHash = 'd'.repeat(64);
const path = (day = date, category = 'life') => '/note-entries?category=' + category + '&date=' + day;
function apiRow(extra = {}) {
  return {id: randomUUID(), category: 'life', date, text: '真实 API 内容', version: 1, change_seq: 1,
    deleted: false, deleted_at: null, can_edit: true, created_at: stamp, updated_at: stamp, content_hash: hash, ...extra};
}
function snapshotRow(row) {
  const {can_edit, deleted, content_hash, ...snapshot} = row;
  const value = {...snapshot, entity_id: 'note-entry:' + row.id, entity_type: row.category + '_note',
    source: 'note_entry', source_id: row.id, content_hash: snapshotHash};
  if (deleted) delete value.text;
  return value;
}
function setup() {
  const state = {scope: owner, generation: 0}, db = createMemoryDB();
  const options = {db, getScope: () => state.scope, getGeneration: () => state.generation, now: () => Date.parse(stamp)};
  return {state, db, options, cache: createOfflineCache(options), notes: createNotesCache(options)};
}
const collection = (rows, day = date, category = 'life', can_edit = true) => ({date: day, category, entries: rows, can_edit});
async function putEntity(f, row, fields = {}) {
  const entity_id = 'note-entry:' + row.id;
  await f.db.transaction(['entities'], 'readwrite', tx => tx.put('entities',
    {key: entityKey(owner, entity_id), scope: owner, entity_id, server: row, dirty: false, ...fields}));
}
async function completeSnapshot(f) {
  await f.db.transaction(['meta'], 'readwrite', tx => tx.put('meta', {key: entityKey(owner, 'snapshot'),
    value: {index: {complete: true, scope_id: owner}, verified_at: Date.parse(stamp)}}));
}

test('note routes accept only valid UUID/day/category module reads and attach single-entry identity', () => {
  const id = randomUUID(); assert.deepEqual(offlineReadRoute('/note-entries/' + id), {kind: 'note_entry', id});
  assert.deepEqual(noteReadRoute(path()), {kind: 'note_entries', date, category: 'life'});
  for (const value of ['/note-entries?category=life&date=2026-02-30', path() + '&password=secret',
    '/note-entries/' + id + '?category=work', '/note-entries/operations/' + id, 'https://elsewhere.invalid' + path()])
    assert.equal(noteReadRoute(value), null);
});
test('fresh validated GET data saves real API evidence separately and is the only source of offline capability', async () => {
  const f = setup(), row = apiRow(); assert.equal(await f.cache.noteCapability(), null);
  const written = await f.cache.write(path(), collection([row])); assert.equal(written.entries[0].content_hash, hash);
  assert.equal(await f.cache.noteCapability(), true);
  const entity = await f.cache.entity('note-entry:' + row.id);
  assert.deepEqual(entity.server, row); assert.deepEqual(entity.api_server, row);
  const stored = await f.cache.read(path()); assert.equal(stored.data.entries[0].content_hash, hash);
  assert.equal(isLocalDocument(stored.data.entries[0]), false); assert.equal(stored.saved_at, Date.parse(stamp));
});
test('malformed API success never overwrites valid cache or grants capability', async () => {
  const f = setup(), row = apiRow(); await f.cache.write(path(), collection([row]));
  const bad = [{...row, content_hash: snapshotHash.slice(0, 12)}, {...row, date: '2026-02-30'}, {...row, version: 0},
    {...row, deleted: true}, {...row, updated_at: 'not-a-time'}, {...row, can_edit: 'yes'}, {...row, text: '鱼'.repeat(21846)}];
  for (const value of bad) await assert.rejects(f.cache.write(path(), collection([value])),
    error => error.code === 'OFFLINE_RESPONSE_INVALID');
  await assert.rejects(f.cache.write(path(), collection([row, row])), error => error.code === 'OFFLINE_RESPONSE_INVALID');
  assert.equal((await f.cache.read(path())).data.entries[0].text, row.text); assert.equal(await f.cache.noteCapability(), true);
});
test('a complete snapshot exposes unopened life/work dates without impersonating the API hash', async () => {
  const f = setup(); await f.cache.write(path(), collection([]));
  const life = apiRow({date: otherDate}), work = apiRow({date: otherDate, category: 'work', text: '工作快照原文'});
  await putEntity(f, snapshotRow(life)); await putEntity(f, snapshotRow(work)); await completeSnapshot(f);
  for (const row of [life, work]) {
    const read = await f.cache.read(path(otherDate, row.category)), document = read.data.entries[0];
    assert.equal(isLocalDocument(document), true); assert.equal(documentValue(document).text, row.text);
    assert.equal(documentValue(document).can_edit, true); assert.equal(document.content_hash, undefined);
    assert.equal(document.change_seq, undefined); assert.equal(documentState(document).server, null);
    assert.equal(documentState(document).operation, null);
  }
  const empty = await f.cache.read(path('2026-10-24')); assert.deepEqual(empty.data.entries, []);
});
test('a snapshot alone grants reading but no editing capability, and incomplete unknown dates remain unavailable', async () => {
  const f = setup(), row = apiRow({date: otherDate}); await putEntity(f, snapshotRow(row));
  await assert.rejects(f.cache.read(path(otherDate)), error => error.code === 'OFFLINE_CACHE_MISS');
  await completeSnapshot(f);
  const read = await f.cache.read(path(otherDate)); assert.equal(read.data.can_edit, false);
  assert.equal(documentValue(read.data.entries[0]).can_edit, false); assert.equal(await f.cache.noteCapability(), null);
  f.state.scope = otherOwner;
  await assert.rejects(f.cache.read(path(otherDate)), error => error.code === 'OFFLINE_CACHE_MISS');
});
test('fresh read-only capability revokes cached editing without losing any local text', async () => {
  const f = setup(), row = apiRow(); await f.cache.write(path(), collection([row]));
  await f.cache.write(path(otherDate), collection([], otherDate, 'life', false));
  const read = await f.cache.read(path()); assert.equal(read.data.can_edit, false); assert.equal(read.data.entries[0].can_edit, false);
  assert.equal(read.data.entries[0].text, row.text); assert.equal(await f.cache.noteCapability(), false);
});
test('dirty local documents overlay fresh remote reads while retaining the real server shadow and final operation', async () => {
  const f = setup(), row = apiRow(); await f.cache.write(path(), collection([row]));
  const key = entityKey(owner, 'note-entry:' + row.id), first = {key: entityKey(owner, 'operation:first'), scope: owner,
    entity_id: 'note-entry:' + row.id, seq: 1, status: 'unknown', save_id: randomUUID()};
  const last = {...first, key: entityKey(owner, 'operation:last'), seq: 2, status: 'queued', save_id: randomUUID()};
  await f.db.transaction(['entities', 'outbox'], 'readwrite', async tx => {
    await tx.put('entities', {...await tx.get('entities', key), dirty: true, local: {...row, text: '本机第三稿', version: 3}});
    await tx.put('outbox', first); await tx.put('outbox', last);
  });
  const fresh = {...row, text: '线上第二稿', version: 2, content_hash: 'e'.repeat(64)};
  const result = await f.cache.write(path(), collection([fresh]));
  const document = result.entries[0], data = documentState(document);
  assert.equal(isLocalDocument(document), true); assert.equal(data.local.text, '本机第三稿'); assert.equal(data.local.version, 3);
  assert.equal(data.local.content_hash, undefined); assert.equal(data.server.text, '线上第二稿'); assert.equal(data.server.content_hash, fresh.content_hash);
  assert.equal(data.operation.save_id, last.save_id); assert.equal(data.operation.status, 'queued');
});
test('unresolved conflicts preserve both documents and tombstone text without inventing an API hash', async () => {
  const f = setup(), row = apiRow(); await f.cache.write(path(), collection([row]));
  const remote = {...row, text: '线上新稿', version: 3}, local = {...row, text: '本机保留稿', version: 2};
  const conflict = {key: entityKey(owner, 'conflict:one'), scope: owner, entity_id: 'note-entry:' + row.id,
    local, remote, resolved_at: null, reason: 'version'};
  await putEntity(f, snapshotRow(remote), {api_server: remote, dirty: true, local, conflict: conflict.key});
  await f.db.transaction(['conflicts'], 'readwrite', tx => tx.put('conflicts', conflict));
  const document = (await f.cache.read(path())).data.entries[0];
  assert.equal(documentState(document).conflict.local.text, '本机保留稿');
  assert.equal(documentState(document).conflict.remote.text, '线上新稿');
  const tombstone = {...row, deleted: true, deleted_at: stamp, version: 4};
  await putEntity(f, snapshotRow(tombstone), {api_server: row});
  const read = await f.cache.read('/note-entries/' + row.id), cached = read.data;
  assert.equal(isLocalDocument(cached), true); assert.equal(documentValue(cached).deleted, true);
  assert.equal(documentValue(cached).text, row.text); assert.equal(documentState(cached).server, null);
  assert.equal(cached.content_hash, undefined); assert.equal((await f.cache.read(path())).data.entries.length, 0);
});
test('ACK capture preserves true API hashes across later canonical snapshots and never grants permission', async () => {
  const f = setup(), row = apiRow({version: 3}); await putEntity(f, row);
  const original = JSON.stringify((await f.cache.entity('note-entry:' + row.id)).server);
  assert.equal(await f.cache.captureDocuments(), 1); assert.equal(await f.cache.noteCapability(), null);
  assert.equal(JSON.stringify((await f.cache.entity('note-entry:' + row.id)).server), original);
  await putEntity(f, snapshotRow(row), {api_server: row}); await completeSnapshot(f);
  const read = (await f.cache.read(path())).data.entries[0];
  assert.equal(isLocalDocument(read), false); assert.equal(read.content_hash, row.content_hash); assert.equal(read.can_edit, false);
  const newer = {...row, version: 4, content_hash: 'e'.repeat(64)};
  await putEntity(f, snapshotRow(newer), {api_server: row});
  const unknownHash = (await f.cache.read(path())).data.entries[0];
  assert.equal(isLocalDocument(unknownHash), true); assert.equal(documentState(unknownHash).server, null);
  assert.equal(unknownHash.content_hash, undefined);
});
test('late complete GET lists cannot hide a newly acknowledged note or downgrade newer API evidence', async () => {
  const f = setup(); await f.cache.write(path(), collection([])); const baseline = await f.cache.fence(path());
  const row = apiRow({version: 2}); await putEntity(f, row);
  await assert.rejects(f.cache.write(path(), collection([]), {baseline}), error => error.code === 'OFFLINE_CACHE_CHANGED');
  assert.equal((await f.cache.read(path())).data.entries[0].id, row.id);
  await assert.rejects(f.cache.write(path(), collection([{...row, version: 1}])), error => error.code === 'OFFLINE_CACHE_CHANGED');
  assert.equal((await f.cache.entity('note-entry:' + row.id)).server.version, 2);
});
test('generation and scope changes roll back a whole in-flight notes cache write and cannot leak a late read', async () => {
  const f = setup(), row = apiRow(); let change = false;
  const db = {transaction: (names, mode, callback) => f.db.transaction(names, mode, async tx => callback({...tx,
    put: async (name, value) => { await tx.put(name, value); if (change) { change = false; f.state.generation++; } }}))};
  const cache = createOfflineCache({...f.options, db}); change = true;
  await assert.rejects(cache.write(path(), collection([row])), error => error.code === 'OFFLINE_SCOPE_CHANGED');
  assert.equal(await f.cache.entity('note-entry:' + row.id), undefined); assert.equal(await f.cache.noteCapability(), null);
  await f.cache.write(path(), collection([row]));
  const readingDB = {transaction: (...args) => f.db.transaction(...args).then(value => { f.state.scope = otherOwner; return value; })};
  await assert.rejects(createNotesCache({...f.options, db: readingDB}).read(path(), noteReadRoute(path())),
    error => error.code === 'OFFLINE_SCOPE_CHANGED');
});
test('clean remote-missing rows stay hidden, while known dirty rows remain readable with an explicit partial marker', async () => {
  const f = setup(), row = apiRow(); await putEntity(f, row, {remote_missing: true});
  await completeSnapshot(f); assert.deepEqual((await f.cache.read(path())).data.entries, []);
  const g = setup(); await putEntity(g, row, {dirty: true, local: {...row, text: '仅本机内容', version: 2}, remote_missing: true});
  const read = await g.cache.read(path()); assert.equal(read.data.offline_partial, true);
  assert.equal(documentValue(read.data.entries[0]).text, '仅本机内容'); assert.equal(read.data.can_edit, false);
});
test('a complete index listing an active note without its body cannot impersonate an empty offline collection', async () => {
  const f = setup(), row = apiRow();
  await f.db.transaction(['meta'], 'readwrite', tx => tx.put('meta', {key: entityKey(owner, 'snapshot'), value:
    {index: {complete: true, scope_id: owner, entities: [{entity_id: 'note-entry:' + row.id,
      entity_type: 'life_note', date, deleted_at: null}]}}}));
  await assert.rejects(f.cache.read(path()), error => error.code === 'OFFLINE_CACHE_MISS');
  const malformed = snapshotRow(row); delete malformed.text;
  await putEntity(f, malformed);
  await assert.rejects(f.cache.read(path()), error => error.code === 'OFFLINE_CACHE_MISS');
});
test('legacy life/work records are read-only from complete snapshots and confirmed absence is explicitly marked', async () => {
  const f = setup(); await completeSnapshot(f);
  for (const category of ['life', 'work']) {
    const entity_id = 'legacy-' + category + ':' + date;
    await f.db.transaction(['entities'], 'readwrite', tx => tx.put('entities', {key: entityKey(owner, entity_id), scope: owner,
      entity_id, server: {date, category, text: category + ' 原有记录', version: 3, updated_at: stamp, deleted_at: null}}));
    const read = await f.cache.read('/daily-notes?date=' + date + (category === 'work' ? '&category=work' : ''));
    assert.equal(read.data.text, category + ' 原有记录'); assert.equal(read.data.version, 3);
    assert.equal(read.data.can_edit, false); assert.equal(read.data.snapshot_complete, true);
  }
  const empty = await f.cache.read('/daily-notes?date=' + otherDate);
  assert.equal(empty.data.version, 0); assert.equal(empty.data.text, ''); assert.equal(empty.data.can_edit, false);
  assert.equal(empty.data.snapshot_complete, true);
  const g = setup(); await assert.rejects(g.cache.read('/daily-notes?date=' + date), error => error.code === 'OFFLINE_CACHE_MISS');
});
