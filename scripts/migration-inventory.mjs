// Operator-only helpers; not registered as HTTP routes. Keep real inventories private.
import assert from 'node:assert/strict';
import {digest, stable} from '../src/security.mjs';
import {consistentRead} from '../src/storage.mjs';

const v6RestoredTables = Object.freeze([
  'accounts', 'users', 'todos', 'todo_templates', 'todo_template_links', 'todo_preferences', 'daily_notes',
  'articles', 'observations', 'daily_metrics', 'api_keys', 'audit', 'idempotency',
]);
const v7RestoredTables = Object.freeze([...v6RestoredTables, 'memo_groups', 'memo_notes']);
export const restoredTables = Object.freeze([...v7RestoredTables, 'daily_work_notes']);
export const resetTables = Object.freeze(['sessions', 'login_attempts', 'control']);
const tableSets = new Map([['haoduoyu-matrix-d1-v6', v6RestoredTables], ['haoduoyu-matrix-d1-v7', v7RestoredTables], ['haoduoyu-matrix-d1-v8', restoredTables]]);
const checksum = rows => digest(JSON.stringify(rows.map(row => JSON.stringify(stable(row))).sort()));
const fail = () => {throw new Error('MIGRATION_INVENTORY_MISMATCH');};

// Run against the complete source DB under an approved export process.
// Do not construct this inventory from the user-scoped HTTP backup itself.
export async function createSourceInventory(db) {
  return consistentRead(db, async (store, sourceRevision) => {
    const schema = (await db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'matrix_%'").all()).results;
    const restored = schema.some(row => row.name === 'matrix_daily_work_notes') ? restoredTables :
      schema.some(row => row.name === 'matrix_memo_groups') ? v7RestoredTables : v6RestoredTables;
    const tables = [...restored, ...resetTables];
    assert.deepEqual(schema.map(row => row.name).sort(), tables.map(name => 'matrix_' + name).sort(), 'Unexpected source schema');
    const result = {};
    for (const name of tables) {
      const rows = (await db.prepare('SELECT * FROM matrix_' + name).all()).results;
      result[name] = {policy: restored.includes(name) ? 'restore' : 'reset',
        count: rows.length, sha256: checksum(rows)};
    }
    return {format: 'haoduoyu-migration-inventory-v1', source_revision: sourceRevision, tables: result};
  });
}

export function verifyBackupInventory(backup, inventory) {
  const restored = tableSets.get(backup?.data?.format), tables = [...(restored || []), ...resetTables];
  if (!restored ||
      backup.sha256 !== digest(JSON.stringify(stable(backup.data))) ||
      inventory?.format !== 'haoduoyu-migration-inventory-v1' ||
      !Number.isSafeInteger(inventory.source_revision) || inventory.source_revision < 0 ||
      inventory.source_revision > Number.MAX_SAFE_INTEGER - 2 ||
      backup.data.source_revision !== inventory.source_revision) fail();
  if (JSON.stringify(Object.keys(backup.data.tables || {}).sort()) !== JSON.stringify([...restored].sort()) ||
      JSON.stringify(Object.keys(inventory.tables || {}).sort()) !== JSON.stringify([...tables].sort())) fail();
  for (const name of tables) {
    const item = inventory.tables[name], policy = restored.includes(name) ? 'restore' : 'reset';
    if (item?.policy !== policy || !Number.isSafeInteger(item.count) || item.count < 0 || !/^[a-f0-9]{64}$/.test(item.sha256)) fail();
    if (policy === 'restore') {
      const rows = backup.data.tables[name];
      if (!Array.isArray(rows) || rows.length !== item.count || checksum(rows) !== item.sha256) fail();
    }
  }
  return {verified: true, restored_tables: restored.length, reset_tables: resetTables.length};
}

export async function verifyRestoredInventory(db, backup, sourceInventory) {
  const result = verifyBackupInventory(backup, sourceInventory);
  const target = await createSourceInventory(db);
  const restored = tableSets.get(backup.data.format);
  for (const name of restored) {
    const actual = target.tables[name], expected = sourceInventory.tables[name];
    if (actual.count !== expected.count || actual.sha256 !== expected.sha256) fail();
  }
  for (const name of restoredTables.filter(name => !restored.includes(name))) {
    if (target.tables[name] && target.tables[name].count !== 0) fail();
  }
  if (target.tables.sessions.count !== 0 || target.tables.login_attempts.count !== 0 || target.tables.control.count !== 1) fail();
  const control = await db.prepare('SELECT initialized,revision FROM matrix_control WHERE id=1').first();
  if (control?.initialized !== 1 || !Number.isSafeInteger(control.revision) ||
      control.revision <= sourceInventory.source_revision) fail();
  const fk = await db.prepare('PRAGMA foreign_key_check').all();
  // D1 exposes quick_check, not SQLite's full integrity_check pragma.
  const integrity = await db.prepare('PRAGMA quick_check').all();
  if (fk.results.length || integrity.results.length !== 1 || Object.values(integrity.results[0])[0] !== 'ok') fail();
  return result;
}
