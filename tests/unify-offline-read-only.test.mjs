import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryDB, entityKey} from '../web/offline/db.mjs';
import {createOfflineCache, offlineReadRoute} from '../web/offline/cache.mjs';
import {randomUUID} from 'node:crypto';

const scope = 'a'.repeat(64), stamp = '2026-10-26T01:00:00Z';
async function setup() {
  const db = createMemoryDB(), cache = createOfflineCache({db, getScope: () => scope});
  const records = [];
  for (const [category, days] of [['life', ['2026-10-26', '2026-10-25', '2026-10-24']], ['work', ['2026-10-23']]])
    for (const date of days) records.push({entity_id: 'note-entry:' + randomUUID(), category, date, text: '条目', version: 1});
  records.push({entity_id: 'work-reminder:' + randomUUID(), date: '2026-10-25', summary: '合成未打开提醒', source_key: 'synthetic',
    version: 1, updated_at: stamp}, {entity_id: 'legacy-life:2026-10-22', category: 'life', date: '2026-10-22', text: '原有只读', version: 1});
  await db.transaction(['entities', 'meta'], 'readwrite', async tx => {
    for (const row of records) await tx.put('entities', {key: entityKey(scope, row.entity_id), scope, entity_id: row.entity_id, server: row});
    await tx.put('meta', {key: entityKey(scope, 'snapshot'), value: {index: {scope_id: scope, complete: true,
      entities: records.map(row => ({entity_id: row.entity_id, deleted_at: null}))}, verified_at: 123}});
  });
  return {db, cache, records};
}
test('a complete scoped snapshot exposes unopened reminder days without a GET response cache', async () => {
  const {cache} = await setup(), result = await cache.read('/work-reminders?date=2026-10-25');
  assert.equal(result.data.items[0].summary, '合成未打开提醒'); assert.equal(result.data.can_edit, false);
  assert.equal(result.saved_at, 123); assert.deepEqual((await cache.read('/work-reminders?date=2026-10-24')).data.items, []);
});
test('date indexes derive only their category/source and honor strict before and page bounds', async () => {
  const {cache} = await setup();
  const first = (await cache.read('/note-entries/dates?category=life&page_size=2')).data;
  assert.deepEqual(first.dates, ['2026-10-26', '2026-10-25']); assert.equal(first.has_more, true); assert.equal(first.next_before, '2026-10-25');
  assert.deepEqual((await cache.read('/note-entries/dates?category=life&before=2026-10-25&page_size=2')).data.dates, ['2026-10-24']);
  assert.deepEqual((await cache.read('/note-entries/dates?category=work')).data.dates, ['2026-10-23']);
  assert.deepEqual((await cache.read('/daily-notes/dates?category=life')).data.dates, ['2026-10-22']);
  for (const query of ['page_size=0', 'page_size=101', 'before=2026-02-30', 'category=life&category=work', 'token=private'])
    assert.equal(offlineReadRoute('/note-entries/dates?' + query), null);
});
test('missing complete scope evidence or a declared but absent entity is an explicit miss, never an empty list', async () => {
  const {db, cache, records} = await setup();
  await db.transaction(['entities'], 'readwrite', tx => tx.delete('entities', entityKey(scope, records[0].entity_id)));
  await assert.rejects(cache.read('/note-entries/dates?category=life'), error => error.code === 'OFFLINE_CACHE_MISS');
  await db.transaction(['meta'], 'readwrite', tx => tx.delete('meta', entityKey(scope, 'snapshot')));
  await assert.rejects(cache.read('/work-reminders?date=2026-10-25'), error => error.code === 'OFFLINE_CACHE_MISS');
});
test('an unread overview cannot be invented from a workbench snapshot', async () => {
  const {cache} = await setup();
  await assert.rejects(cache.read('/overview?period=yesterday'), error => error.code === 'OFFLINE_CACHE_MISS');
});
