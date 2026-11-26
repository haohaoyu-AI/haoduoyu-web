import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {applyLocalSchemaMigrations, reviewArchiveMigrationTag} from '../scripts/migration-contract.mjs';
import {archiveTables, localDatabase, seedLegacy, stamp} from './review-archive-d1-fixture.mjs';

const throughArchive = 30;
const archiveIndexes = [
  'event_entity', 'import_source', 'item_legacy', 'item_recent', 'ref_item', 'ref_platform',
  'ref_primary', 'snapshot_item', 'snapshot_source',
];

async function read(db, sql) {
  return (await db.prepare(sql).all()).results;
}

test('0029 rolls back on failed D1 batch, retries once, and preserves the 0028 rows and schema', async t => {
  const db = await localDatabase(t, {through: 29});
  const owner = randomUUID();
  const legacyTables = ['control', 'users', 'review_articles', 'review_snapshots', 'idempotency'];
  await seedLegacy(db, owner, randomUUID(), randomUUID());
  const before = await Promise.all(legacyTables.map(name => read(db, `SELECT * FROM matrix_${name}`)));
  const catalog = () => read(db, 'SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY name');
  const beforeCatalog = await catalog();
  const ledger = () => read(db, 'SELECT name FROM __fixture_migrations ORDER BY name');
  const beforeLedger = await ledger();
  assert.equal(beforeLedger.length, 29);

  // Fail after the archive CREATE statements and matching ledger write in the same real D1 batch.
  const failing = {
    prepare: sql => db.prepare(sql),
    batch: statements => db.batch([...statements, db.prepare('INSERT INTO matrix_users(id) VALUES(NULL)')]),
  };
  await assert.rejects(applyLocalSchemaMigrations(failing, {through: throughArchive}), /NOT NULL constraint failed/);
  assert.deepEqual(await catalog(), beforeCatalog);
  assert.deepEqual(await ledger(), beforeLedger);
  assert.deepEqual(await Promise.all(legacyTables.map(name => read(db, `SELECT * FROM matrix_${name}`))), before);

  await applyLocalSchemaMigrations(db, {through: throughArchive});
  await applyLocalSchemaMigrations(db, {through: throughArchive});
  const afterCatalog = await catalog();
  assert.deepEqual(afterCatalog.filter(row => !row.tbl_name.startsWith('matrix_review_archive_')), beforeCatalog);
  const added = afterCatalog.filter(row => row.tbl_name.startsWith('matrix_review_archive_'));
  assert.deepEqual(added.filter(row => row.type === 'table').map(row => row.name),
    archiveTables.map(name => 'matrix_review_archive_' + name).sort());
  assert.deepEqual(added.filter(row => row.type === 'index' && row.sql).map(row => row.name),
    archiveIndexes.map(name => 'matrix_review_archive_' + name));
  assert.deepEqual(await ledger(), [...beforeLedger, {name: reviewArchiveMigrationTag}]);
  assert.deepEqual(await Promise.all(legacyTables.map(name => read(db, `SELECT * FROM matrix_${name}`))), before);
  assert.deepEqual(await Promise.all(archiveTables.map(name => read(db, `SELECT * FROM matrix_review_archive_${name}`))),
    archiveTables.map(() => []));

  const ownItem = randomUUID();
  const other = randomUUID();
  const insertItem = `INSERT INTO matrix_review_archive_items(user_id,id,kind,production_status,publication_status,
    association_status,payload_json,verified_json,version,created_at,updated_at) VALUES(?,?,'article','unknown','unknown','pending',?,'{}',1,?,?)`;
  await db.prepare(insertItem).bind(owner, ownItem, '{}', stamp, stamp).run();
  await assert.rejects(db.prepare(insertItem).bind(owner, randomUUID(), '[]', stamp, stamp).run(), /CHECK constraint failed/);
  await seedLegacy(db, other, randomUUID(), randomUUID());
  const insertRef = `INSERT INTO matrix_review_archive_refs(user_id,id,item_id,kind,platform_id,role,payload_json,created_at,updated_at)
    VALUES(?,?,?,'draft',?,'primary','{}',?,?)`;
  await assert.rejects(db.prepare(insertRef).bind(other, randomUUID(), ownItem, '0102', stamp, stamp).run(), /FOREIGN KEY constraint failed/);
  await db.prepare(insertRef).bind(owner, randomUUID(), ownItem, '0102', stamp, stamp).run();
  await assert.rejects(db.prepare(insertRef).bind(owner, randomUUID(), ownItem, '0103', stamp, stamp).run(), /UNIQUE constraint failed/);
  assert.deepEqual(await read(db, 'PRAGMA foreign_key_check'), []);
  assert.deepEqual((await read(db, 'PRAGMA quick_check')).map(row => Object.values(row)[0]), ['ok']);
});
