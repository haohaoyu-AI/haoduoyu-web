// Offline schema/migration parity. No owner data, provider or production writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const sql = new DatabaseSync(':memory:');
const migration = '0023_editorial_revision_continuation_v3.sql';
for (const file of fs.readdirSync('drizzle').filter(file => file.endsWith('.sql') && file < migration).sort()) sql.exec(fs.readFileSync('drizzle/' + file, 'utf8'));
const before = sql.prepare("SELECT name,sql FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
sql.exec(fs.readFileSync('drizzle/' + migration, 'utf8'));
for (const item of before) assert.equal(sql.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(item.name).sql, item.sql);

const previous = JSON.parse(fs.readFileSync('drizzle/meta/0022_snapshot.json', 'utf8'));
const current = JSON.parse(fs.readFileSync('drizzle/meta/0023_snapshot.json', 'utf8'));
assert.equal(current.prevId, previous.id);
for (const [name, table] of Object.entries(previous.tables)) assert.deepEqual(current.tables[name], table);
assert.deepEqual(Object.keys(current.tables).filter(name => !(name in previous.tables)), ['editorial_revision_continuations_v3']);
const table = current.tables.editorial_revision_continuations_v3;
const columns = sql.prepare('PRAGMA table_info(editorial_revision_continuations_v3)').all();
assert.deepEqual(columns.map(column => column.name), Object.keys(table.columns));
for (const column of columns) {
 const expected = table.columns[column.name];
 assert.equal(column.type.toLowerCase(), expected.type);
 assert.equal(Boolean(column.notnull), expected.notNull);
 assert.equal(Boolean(column.pk), expected.primaryKey);
}
const indexes = sql.prepare('PRAGMA index_list(editorial_revision_continuations_v3)').all().filter(index => index.origin !== 'pk');
assert.deepEqual(indexes.map(index => index.name).sort(), Object.keys(table.indexes).sort());
for (const index of indexes) {
 const expected = table.indexes[index.name];
 assert.equal(Boolean(index.unique), expected.isUnique);
 assert.deepEqual(sql.prepare('PRAGMA index_info(' + index.name + ')').all().map(column => column.name), expected.columns);
}
assert.equal(Object.keys(table.checkConstraints).length, 4);
const names = columns.map(column => column.name);
const row = Object.fromEntries(names.map(name => [name, 'synthetic-' + name]));
Object.assign(row, {run_id: 'bd6d4434-273b-426e-a17f-9390fc124c84', source_stage_id: '496c9348-7de3-4322-8462-55892b8162b0', scope: 'editorial_v3_one_explicit_unknown_revision_continuation', state: 'allocated'});
const insert = value => sql.prepare('INSERT INTO editorial_revision_continuations_v3(' + names.join(',') + ') VALUES(' + names.map(() => '?').join(',') + ')').run(...names.map(name => value[name]));
for (const name of ['run_id', 'source_stage_id', 'scope', 'state']) assert.throws(() => insert({...row, [name]: 'wrong'}));
insert(row);
assert.throws(() => insert({...row, id: 'different', authorization_key: 'different', new_stage_id: 'different', new_token_sha256: 'different'}));
assert.throws(() => insert({...row, id: 'different', owner: 'foreign', new_token_sha256: row.new_token_sha256}));
insert({...row, id: 'foreign-id', owner: 'foreign', new_token_sha256: 'foreign-token'});
const journal = JSON.parse(fs.readFileSync('drizzle/meta/_journal.json', 'utf8'));
assert.equal(journal.entries.find(entry => entry.idx === 23).idx, 23);
assert.equal(journal.entries.find(entry => entry.idx === 23).tag, migration.replace('.sql', ''));
assert.equal(sql.prepare('SELECT COUNT(*) n FROM editorial_revision_continuations_v3').get().n, 2);
console.log('PASS additive migration23 preserves every prior table/index and snapshot; SQLite columns/unique indexes/checks match generated snapshot and journal; 0 provider/network/production calls.');
