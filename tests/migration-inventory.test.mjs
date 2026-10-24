import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fixture} from './harness.mjs';
import {exportBackup, restoreIntoEmptyDatabase} from '../src/backup.mjs';
import {digest, stable} from '../src/security.mjs';
import {createSourceInventory, verifyBackupInventory, verifyRestoredInventory} from '../scripts/migration-inventory.mjs';

const exec = promisify(execFile);
async function sourceWithOtherUser(t) {
  const source = await fixture(t), session = await source.login();
  const user = randomUUID(), todo = randomUUID(), template = randomUUID(), stamp = new Date().toISOString();
  await source.db.batch([
    source.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,? FROM matrix_users LIMIT 1').bind(user, 'synthetic-other-' + user, stamp),
    source.db.prepare('INSERT INTO matrix_todos(user_id,id,date,text,completed,created_at,updated_at) VALUES(?,?,?,?,1,?,?)').bind(user, todo, '2026-10-24', 'SYNTHETIC-PRIVATE-CANARY', stamp, stamp),
    source.db.prepare('INSERT INTO matrix_todo_templates(user_id,id,text,created_at,updated_at) VALUES(?,?,?,?,?)').bind(user, template, 'SYNTHETIC-PRIVATE-CANARY', stamp, stamp),
    source.db.prepare('INSERT INTO matrix_todo_template_links(user_id,todo_id,template_id) VALUES(?,?,?)').bind(user, todo, template),
    source.db.prepare('INSERT INTO matrix_todo_preferences(user_id,completed_mode,updated_at) VALUES(?,?,?)').bind(user, 'hide', stamp),
    source.db.prepare('UPDATE matrix_control SET revision=revision+1 WHERE id=1'),
  ]);
  return {...source, session};
}

test('independent 16-table inventory detects a valid-checksum HTTP backup missing another user private rows', async t => {
  const source = await sourceWithOtherUser(t), inventory = await createSourceInventory(source.db);
  assert.equal(Object.keys(inventory.tables).length, 16);
  assert.equal(inventory.tables.users.count, 2);
  const scoped = (await source.request('/api/v1/backup', {session: source.session})).data;
  assert.equal(scoped.data.tables.todos.length, 0);
  assert.throws(() => verifyBackupInventory(scoped, inventory), /MIGRATION_INVENTORY_MISMATCH/);
  const full = await exportBackup(source.db);
  assert.deepEqual(verifyBackupInventory(full, inventory), {verified: true, restored_tables: 13, reset_tables: 3});
  const target = await fixture(t, {bootstrap: false});
  await restoreIntoEmptyDatabase(target.db, full, {allowEmptyRestore: true});
  await verifyRestoredInventory(target.db, full, inventory);
  assert.equal((await target.db.prepare('SELECT count(*) AS n FROM matrix_todos').first()).n, 1);
});

test('inventory rejects re-signed changed private data, missing table policy and old format', async t => {
  const source = await sourceWithOtherUser(t), full = await exportBackup(source.db), inventory = await createSourceInventory(source.db);
  const changed = structuredClone(full);changed.data.tables.todos[0].completed = 0;
  changed.sha256 = digest(JSON.stringify(stable(changed.data)));
  assert.throws(() => verifyBackupInventory(changed, inventory));
  const missing = structuredClone(inventory);delete missing.tables.sessions;
  assert.throws(() => verifyBackupInventory(full, missing));
  const old = structuredClone(full);old.data.format = 'haoduoyu-matrix-d1-v3';
  old.sha256 = digest(JSON.stringify(stable(old.data)));
  assert.throws(() => verifyBackupInventory(old, inventory));
});

test('restored table changes and unexpected source schema prevent accepting migration', async t => {
  const source = await sourceWithOtherUser(t), full = await exportBackup(source.db), inventory = await createSourceInventory(source.db);
  const target = await fixture(t, {bootstrap: false});
  await restoreIntoEmptyDatabase(target.db, full, {allowEmptyRestore: true});
  await target.db.prepare('UPDATE matrix_todo_preferences SET completed_mode=?').bind('strike').run();
  await assert.rejects(verifyRestoredInventory(target.db, full, inventory));
  await source.db.prepare('CREATE TABLE matrix_unreviewed(id TEXT)').run();
  await assert.rejects(createSourceInventory(source.db), /Unexpected source schema/);
});

test('offline CLI restores only an isolated target and never prints private input on success or failure', async t => {
  const source = await sourceWithOtherUser(t), full = await exportBackup(source.db), inventory = await createSourceInventory(source.db);
  const directory = await mkdtemp(join(tmpdir(), 'matrix-migration-private-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const backupPath = join(directory, 'backup.json'), inventoryPath = join(directory, 'inventory.json');
  await writeFile(backupPath, JSON.stringify(full), {mode: 0o600});
  await writeFile(inventoryPath, JSON.stringify(inventory), {mode: 0o600});
  const args = ['scripts/verify-migration-backup.mjs', '--backup', backupPath, '--inventory', inventoryPath];
  const result = await exec(process.execPath, args, {cwd: new URL('../', import.meta.url)});
  assert.equal(JSON.parse(result.stdout).verified, true);
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC-PRIVATE-CANARY'));
  await writeFile(backupPath, '{"SYNTHETIC-PRIVATE-CANARY":');
  await assert.rejects(exec(process.execPath, args, {cwd: new URL('../', import.meta.url)}), error =>
    error.code === 1 && !error.stderr.includes('SYNTHETIC-PRIVATE-CANARY') && !error.stdout.includes('SYNTHETIC-PRIVATE-CANARY'));
  assert.equal((await source.db.prepare('SELECT count(*) AS n FROM matrix_todos').first()).n, 1);
});
