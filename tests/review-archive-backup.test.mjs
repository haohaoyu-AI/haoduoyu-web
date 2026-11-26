import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {exportBackup, restoreIntoEmptyDatabase} from '../src/backup.mjs';
import {digest, stable} from '../src/security.mjs';
import {createSourceInventory, verifyBackupInventory, verifyRestoredInventory} from '../scripts/migration-inventory.mjs';
import {archiveTables, localDatabase, seedLegacy, stamp} from './review-archive-d1-fixture.mjs';

const archiveNames = archiveTables.map(name => 'review_archive_' + name);
const draftColumns = ['publish_status', 'draft_saved_at', 'alternate_titles_json'];
const scheduleColumns = ['period', 'recurrence', 'due_date'];
const json = value => JSON.stringify(value);

async function seedTodo(db, owner, text) {
  const id = randomUUID();
  await db.prepare(`INSERT INTO matrix_unscheduled_todos(user_id,id,text,completed,version,created_at,updated_at,note)
    VALUES(?,?,?,0,1,?,?,'合成待办备注')`).bind(owner, id, text, stamp, stamp).run();
  return id;
}

async function seedArchive(db, owner, legacyId) {
  const [alias, item, ref, snapshot, event, run] = Array.from({length: 6}, () => randomUUID());
  const insert = db.prepare(`INSERT INTO matrix_review_archive_items(user_id,id,kind,production_status,publication_status,
    association_status,payload_json,verified_json,legacy_id,version,created_at,updated_at)
    VALUES(?,?,'article','complete','published','matched',?,'{}',?,1,?,?)`);
  await db.batch([
    insert.bind(owner, alias, json({original_title: '合成档案旧名称'}), null, stamp, stamp),
    insert.bind(owner, item, json({original_title: '合成档案标题', body: `synthetic-private-${owner}`, sample_url: 'https://example.test/archive'}), legacyId, stamp, stamp),
    db.prepare('UPDATE matrix_review_archive_items SET merged_into=? WHERE user_id=? AND id=?').bind(item, owner, alias),
    db.prepare(`INSERT INTO matrix_review_archive_refs(user_id,id,item_id,kind,platform_id,role,payload_json,created_at,updated_at)
      VALUES(?,?,?,'draft','001023','primary','{}',?,?)`).bind(owner, ref, item, stamp, stamp),
    db.prepare(`INSERT INTO matrix_review_archive_snapshots(user_id,id,item_id,observed_at,source,source_key,metrics_json,created_at)
      VALUES(?,?,?,?,'synthetic','original',?,?)`).bind(owner, snapshot, item, stamp, json({reads: 760, ctr: null}), stamp),
    db.prepare(`INSERT INTO matrix_review_archive_events(user_id,id,entity_type,entity_id,version,action,details_json,created_at)
      VALUES(?,?,'item',?,1,'merge',?,?)`).bind(owner, event, item, json({alias}), stamp),
    db.prepare(`INSERT INTO matrix_review_archive_imports(user_id,id,kind,source,source_key,scope_json,started_at,completed_at)
      VALUES(?,?,'directory','synthetic','scope-key',?,?,NULL)`).bind(owner, run, json({kind: 'article'}), stamp),
    db.prepare(`INSERT INTO matrix_review_archive_import_pages(user_id,run_id,page,request_hash,result_json,committed_at)
      VALUES(?,?,1,'synthetic-page-hash',?,?)`).bind(owner, run, json({next_page: 2, rows: [{item_id: item}]}), stamp),
  ]);
  return {alias, item, ref, snapshot, event, run};
}

test('v20 operator backup restores archive references, merge alias, history, checkpoint, and 0028 draft fields', async t => {
  const source = await localDatabase(t);
  const target = await localDatabase(t);
  const owner = randomUUID();
  const other = randomUUID();
  const oldArticle = randomUUID();
  const foreignArticle = randomUUID();
  await seedLegacy(source, owner, oldArticle, randomUUID());
  await seedLegacy(source, other, foreignArticle, randomUUID());
  const records = await seedArchive(source, owner, oldArticle);
  await seedArchive(source, other, foreignArticle);
  const monthly = await seedTodo(source, owner, '每月合成待办');
  const dated = await seedTodo(source, other, '有截止日的合成待办');
  await source.prepare('UPDATE matrix_unscheduled_todos SET period=?,recurrence=? WHERE user_id=? AND id=?')
    .bind('2026-11', 'month', owner, monthly).run();
  await source.prepare('UPDATE matrix_unscheduled_todos SET due_date=? WHERE user_id=? AND id=?')
    .bind('2026-11-12', other, dated).run();

  const full = await exportBackup(source);
  const scoped = await exportBackup(source, {todoUserId: owner});
  assert.equal(full.data.format, 'haoduoyu-matrix-d1-v20');
  assert.equal(scoped.data.format, full.data.format);
  for (const name of archiveNames) {
    assert.ok(full.data.tables[name].some(row => row.user_id === other), name);
    assert.deepEqual(scoped.data.tables[name], full.data.tables[name].filter(row => row.user_id === owner), name);
    assert.ok(scoped.data.tables[name].length > 0, name);
  }
  assert.match(json(full), new RegExp(`synthetic-private-${other}`));
  assert.doesNotMatch(json(scoped), new RegExp(`synthetic-private-${other}`));
  assert.deepEqual(full.data.tables.idempotency.map(row => row.actor), ['review-publication:' + owner, 'review-publication:' + other]);
  assert.deepEqual(scoped.data.tables.idempotency.map(row => row.actor), ['review-publication:' + owner]);
  assert.deepEqual(full.data.tables.review_articles.map(row => draftColumns.map(field => row[field])),
    Array.from({length: 2}, () => ['pending', stamp, '["合成备选标题"]']));
  assert.deepEqual(full.data.tables.unscheduled_todos.map(row => scheduleColumns.map(field => row[field])),
    [['2026-11', 'month', null], [null, null, '2026-11-12']]);
  assert.deepEqual(scoped.data.tables.unscheduled_todos.map(row => row.id), [monthly]);
  const untouched = {prepare() { assert.fail('invalid backup must leave the target untouched'); }};
  for (const [field, value] of [['period', 'next'], ['recurrence', 'day'], ['due_date', 'tomorrow']]) {
    const data = structuredClone(full.data);
    data.tables.unscheduled_todos[0][field] = value;
    await assert.rejects(restoreIntoEmptyDatabase(untouched, {data, sha256: digest(json(stable(data)))},
      {allowEmptyRestore: true}), {code: 'INVALID_BACKUP'});
  }

  const inventory = await createSourceInventory(source);
  const expected = {verified: true, restored_tables: 46, reset_tables: 3};
  assert.deepEqual(verifyBackupInventory(full, inventory), expected);
  assert.throws(() => verifyBackupInventory(scoped, inventory), /MIGRATION_INVENTORY_MISMATCH/);
  await restoreIntoEmptyDatabase(target, full, {allowEmptyRestore: true});
  assert.deepEqual(await verifyRestoredInventory(target, full, inventory), expected);
  const restored = await exportBackup(target);
  for (const name of [...archiveNames, 'review_articles', 'review_snapshots', 'idempotency', 'unscheduled_todos'])
    assert.deepEqual(restored.data.tables[name], full.data.tables[name], name);
  assert.equal(restored.data.tables.review_archive_items.find(row => row.id === records.alias).merged_into, records.item);
  assert.deepEqual(JSON.parse(restored.data.tables.review_archive_snapshots.find(row => row.id === records.snapshot).metrics_json),
    {reads: 760, ctr: null});
  assert.deepEqual(JSON.parse(restored.data.tables.review_archive_import_pages.find(row => row.run_id === records.run).result_json),
    {next_page: 2, rows: [{item_id: records.item}]});
  await assert.rejects(restoreIntoEmptyDatabase(target, full, {allowEmptyRestore: true}), {code: 'RESTORE_NOT_EMPTY'});
});

test('a v18 envelope from the 0024 schema verifies and restores with null draft and todo schedule fields', async t => {
  const old = await localDatabase(t, {through: 25});
  const target = await localDatabase(t);
  const owner = randomUUID();
  await seedLegacy(old, owner, randomUUID(), randomUUID(), {draftFields: false});
  await seedTodo(old, owner, '现存合成待办');
  const inventory = await createSourceInventory(old);
  const tables = {};
  for (const [name, entry] of Object.entries(inventory.tables)) {
    if (entry.policy === 'restore') tables[name] = (await old.prepare(`SELECT * FROM matrix_${name} ORDER BY rowid`).all()).results;
  }
  assert.ok(draftColumns.every(field => !Object.hasOwn(tables.review_articles[0], field)));
  assert.ok(scheduleColumns.every(field => !Object.hasOwn(tables.unscheduled_todos[0], field)));
  const data = {format: 'haoduoyu-matrix-d1-v18', source_revision: inventory.source_revision, exported_at: stamp, tables};
  const backup = {data, sha256: digest(json(stable(data)))};
  const expected = {verified: true, restored_tables: 39, reset_tables: 3};
  assert.deepEqual(verifyBackupInventory(backup, inventory), expected);
  await restoreIntoEmptyDatabase(target, backup, {allowEmptyRestore: true});
  assert.deepEqual(await verifyRestoredInventory(target, backup, inventory), expected);
  const restored = await exportBackup(target);
  assert.deepEqual(restored.data.tables.review_articles, tables.review_articles.map(row => ({
    ...row, publish_status: null, draft_saved_at: null, alternate_titles_json: null,
  })));
  assert.deepEqual(restored.data.tables.review_snapshots, tables.review_snapshots);
  assert.deepEqual(restored.data.tables.unscheduled_todos, tables.unscheduled_todos.map(row => ({
    ...row, period: null, recurrence: null, due_date: null,
  })));
  assert.ok(archiveNames.every(name => restored.data.tables[name].length === 0));
});
