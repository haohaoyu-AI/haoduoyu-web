// Operator-only helpers; not registered as HTTP routes. Keep real inventories private.
import assert from 'node:assert/strict';
import {digest, stable} from '../src/security.mjs';
import {consistentRead} from '../src/storage.mjs';
import {exportBackup} from '../src/backup.mjs';

export const restoredTables = Object.freeze([
  'accounts', 'users', 'todos', 'todo_templates', 'todo_template_links', 'todo_preferences',
  'articles', 'observations', 'daily_metrics', 'api_keys', 'audit', 'idempotency',
]);
export const resetTables = Object.freeze(['sessions', 'login_attempts', 'control']);
const tables = [...restoredTables, ...resetTables];
const checksum = rows => digest(JSON.stringify(rows.map(row => JSON.stringify(stable(row))).sort()));
const fail = () => {throw new Error('MIGRATION_INVENTORY_MISMATCH');};

// Run against the complete source DB under an approved export process.
// Do not construct this inventory from the user-scoped HTTP backup itself.
export async function createSourceInventory(db) {
  return consistentRead(db, async (store, sourceRevision) => {
    const schema = (await db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'matrix_%'").all()).results;
    assert.deepEqual(schema.map(row => row.name).sort(), tables.map(name => 'matrix_' + name).sort(), 'Unexpected source schema');
    const result = {};
    for (const name of tables) {
      const rows = (await db.prepare('SELECT * FROM matrix_' + name).all()).results;
      result[name] = {policy: restoredTables.includes(name) ? 'restore' : 'reset',
        count: rows.length, sha256: checksum(rows)};
    }
    return {format: 'haoduoyu-migration-inventory-v1', source_revision: sourceRevision, tables: result};
  });
}

// Caller must supply an authorized full DB handle and independently stop all
// writers. This is not a Sites connection, a freeze operation, or an HTTP route.
// Compare all 15 tables twice: Bearer last_used_at changes do not bump revision.
export async function exportMigrationSnapshot(db, {sourceFrozen = false} = {}) {
  if (sourceFrozen !== true) throw new Error('SOURCE_NOT_FROZEN');
  const inventory = await createSourceInventory(db);
  const backup = await exportBackup(db);
  verifyBackupInventory(backup, inventory);
  const after = await createSourceInventory(db);
  if (JSON.stringify(stable(inventory)) !== JSON.stringify(stable(after))) fail();
  return {backup, inventory};
}

export function verifyBackupInventory(backup, inventory) {
  if (backup?.data?.format !== 'haoduoyu-matrix-d1-v4' ||
      backup.sha256 !== digest(JSON.stringify(stable(backup.data))) ||
      inventory?.format !== 'haoduoyu-migration-inventory-v1' ||
      !Number.isSafeInteger(inventory.source_revision) || inventory.source_revision < 0) fail();
  if (JSON.stringify(Object.keys(backup.data.tables || {}).sort()) !== JSON.stringify([...restoredTables].sort()) ||
      JSON.stringify(Object.keys(inventory.tables || {}).sort()) !== JSON.stringify([...tables].sort())) fail();
  for (const name of tables) {
    const item = inventory.tables[name], policy = restoredTables.includes(name) ? 'restore' : 'reset';
    if (item?.policy !== policy || !Number.isSafeInteger(item.count) || item.count < 0 || !/^[a-f0-9]{64}$/.test(item.sha256)) fail();
    if (policy === 'restore') {
      const rows = backup.data.tables[name];
      if (!Array.isArray(rows) || rows.length !== item.count || checksum(rows) !== item.sha256) fail();
    }
  }
  return {verified: true, restored_tables: restoredTables.length, reset_tables: resetTables.length};
}

export async function verifyRestoredInventory(db, backup, sourceInventory, {expectedInitialized = 1} = {}) {
  if (![1, 2].includes(expectedInitialized)) fail();
  const result = verifyBackupInventory(backup, sourceInventory);
  const target = await createSourceInventory(db);
  for (const name of restoredTables) {
    const actual = target.tables[name], expected = sourceInventory.tables[name];
    if (actual.count !== expected.count || actual.sha256 !== expected.sha256) fail();
  }
  if (target.tables.sessions.count !== 0 || target.tables.login_attempts.count !== 0 || target.tables.control.count !== 1) fail();
  const control = await db.prepare('SELECT initialized FROM matrix_control WHERE id=1').first();
  if (control?.initialized !== expectedInitialized) fail();
  const fk = await db.prepare('PRAGMA foreign_key_check').all();
  // D1 exposes quick_check, not SQLite's full integrity_check pragma.
  const integrity = await db.prepare('PRAGMA quick_check').all();
  if (fk.results.length || integrity.results.length !== 1 || Object.values(integrity.results[0])[0] !== 'ok') fail();
  return result;
}
