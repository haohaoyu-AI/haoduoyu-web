import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {applyLocalSchemaMigrations} from '../scripts/migration-contract.mjs';
import {exportBackup,restoreIntoEmptyDatabase} from '../src/backup.mjs';
import {digest,stable} from '../src/security.mjs';
import {createSourceInventory,verifyBackupInventory,verifyRestoredInventory} from '../scripts/migration-inventory.mjs';

const at='2026-10-28T01:02:03.000Z';
const sign=data=>({data,sha256:digest(JSON.stringify(stable(data)))});
async function database(t) {
  const runtime=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
  const mf=new Miniflare({modules:true,cf:false,script:'export default {fetch(){return new Response(null)}}',
    compatibilityDate:runtime.compatibility_date,compatibilityFlags:runtime.compatibility_flags,d1Databases:['DB'],d1Persist:false});
  t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');await applyLocalSchemaMigrations(db);
  for(const name of ['0009_unscheduled_todos.sql','0010_note_labels.sql']) {
    const table=name.startsWith('0009')?'matrix_unscheduled_todos':'matrix_note_labels';
    if(await db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name=?").bind(table).first())continue;
    const sql=await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8');
    await db.batch(sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
  }
  return db;
}
const rows=async(db,name)=>(await db.prepare('SELECT * FROM matrix_'+name+' ORDER BY rowid').all()).results;
test('v10 backup restores future todos, tombstones, labels and old v9 backup without inventing data',async t=>{
  const db=await database(t),owner=randomUUID(),note=randomUUID(),todo=randomUUID();
  const bind=(sql,...values)=>db.prepare(sql).bind(...values);
  await db.batch([
    bind('INSERT INTO matrix_control(id,initialized,revision) VALUES(1,1,99)'),
    bind('INSERT INTO matrix_users VALUES(?,?,?,?)',owner,'synthetic','LOCAL-HASH',at),
    bind('INSERT INTO matrix_note_entries VALUES(?,?,?,?,?,1,1,?,?,?)',owner,note,'life','2026-10-28','text',at,at,null),
    bind('INSERT INTO matrix_note_labels VALUES(?,?,?)',owner,'合成标签',at),
    bind('INSERT INTO matrix_note_labels VALUES(?,?,?)',owner,'空标签',at),
    bind('INSERT INTO matrix_note_entry_labels VALUES(?,?,?)',owner,note,'合成标签'),
    bind('INSERT INTO matrix_unscheduled_todos VALUES(?,?,?,0,2,?,?,?)',owner,todo,'未来事项',at,at,at),
  ]);
  const full=await exportBackup(db);assert.equal(full.data.format,'haoduoyu-matrix-d1-v14');
  assert.equal(full.data.tables.note_labels.length,2);assert.equal(full.data.tables.unscheduled_todos[0].deleted_at,at);
  const inventory=await createSourceInventory(db);
  assert.deepEqual(verifyBackupInventory(full,inventory),{verified:true,restored_tables:26,reset_tables:3});
  const target=await database(t);await restoreIntoEmptyDatabase(target,full,{allowEmptyRestore:true});
  assert.deepEqual(await verifyRestoredInventory(target,full,inventory),{verified:true,restored_tables:26,reset_tables:3});
  for(const table of Object.keys(full.data.tables))assert.deepEqual(await rows(target,table),await rows(db,table),table);
  const old=structuredClone(full.data);old.format='haoduoyu-matrix-d1-v9';
  for(const table of ['unscheduled_todos','note_labels','note_entry_labels'])delete old.tables[table];
  for(const table of ['note_entry_label_overrides','note_entry_label_sets','note_label_archives','ai_reports']) {
    assert.deepEqual(old.tables[table],[], 'historical fixture cannot hide new data: '+table);delete old.tables[table];
  }
  const legacyTarget=await database(t);await restoreIntoEmptyDatabase(legacyTarget,sign(old),{allowEmptyRestore:true});
  assert.equal((await rows(legacyTarget,'note_entries'))[0].text,'text');
  for(const table of ['unscheduled_todos','note_labels','note_entry_labels'])assert.deepEqual(await rows(legacyTarget,table),[]);
  for(const change of [data=>data.tables.note_entry_labels[0].label='不存在',data=>data.tables.unscheduled_todos[0].completed=2,
    data=>data.tables.note_labels[0].name='生活']) {
    const invalid=structuredClone(full.data);change(invalid);const empty=await database(t);
    await assert.rejects(restoreIntoEmptyDatabase(empty,sign(invalid),{allowEmptyRestore:true}),e=>e.code==='INVALID_BACKUP');
    assert.deepEqual(await rows(empty,'users'),[]);
  }
});
