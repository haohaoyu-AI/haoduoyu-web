import test from 'node:test';
import assert from 'node:assert/strict';
import {digest, stable} from '../src/security.mjs';
import {restoredTables, resetTables, verifyBackupInventory} from '../scripts/migration-inventory.mjs';

const hashRows = rows => digest(JSON.stringify(rows.map(row => JSON.stringify(stable(row))).sort()));
function makePair(version) {
  const tables = Object.fromEntries(restoredTables.filter(name => version === 13 || name !== 'note_label_archives').map(name => [name, []]));
  if (version === 13) tables.note_label_archives.push({user_id: 'u', name: '生活', archived_at: '2026-10-29T00:00:00Z'});
  const data = {format: `haoduoyu-matrix-d1-v${version}`, source_revision: 1, tables};
  const inventory = {format: 'haoduoyu-migration-inventory-v1', source_revision: 1, tables: {}};
  for (const [name, rows] of Object.entries(tables)) inventory.tables[name] = {policy: 'restore', count: rows.length, sha256: hashRows(rows)};
  for (const name of resetTables) inventory.tables[name] = {policy: 'reset', count: 0, sha256: hashRows([])};
  return {backup: {data, sha256: digest(JSON.stringify(stable(data)))}, inventory};
}

test('inventory accepts v13 archive rows and preserves v12 compatibility', () => {
  for (const version of [12, 13]) {
    const {backup, inventory} = makePair(version);
    assert.equal(verifyBackupInventory(backup, inventory).verified, true);
    if (version === 13) {
      backup.data.tables.note_label_archives[0].name = '工作';
      backup.sha256 = digest(JSON.stringify(stable(backup.data)));
      assert.throws(() => verifyBackupInventory(backup, inventory), /MIGRATION_INVENTORY_MISMATCH/);
    }
  }
});
