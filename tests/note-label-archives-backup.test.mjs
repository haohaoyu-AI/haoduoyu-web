import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {exportBackup,restoreIntoEmptyDatabase} from '../src/backup.mjs';
import {digest,stable} from '../src/security.mjs';
function database() {
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const name of ['0000_lively_stellaris','0001_daily_todos','0002_todo_templates','0003_todo_recovery_preferences','0004_daily_notes','0005_article_pipeline','0006_long_term_memos','0007_work_daily_notes','0008_workbench_updates','0009_unscheduled_todos','0010_note_labels','0011_note_entry_multi_labels','0012_note_entry_label_sets','0013_note_label_archives','0014_ai_reports'])
  for(const stmt of readFileSync(new URL('../drizzle/'+name+'.sql',import.meta.url),'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))sql.exec(stmt);
 const db={prepare(text){let values=[];return {bind(...v){values=v;return this},async first(){return sql.prepare(text).get(...values)||null},async all(){return {results:sql.prepare(text).all(...values)}},async run(){const result=sql.prepare(text).run(...values);return {meta:{changes:Number(result.changes)}}}}},async batch(statements){sql.exec('BEGIN');try{for(const s of statements)await s.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};return {sql,db};
}

test('v13 preserves scoped archive state and v12 restores with no archives',async()=>{
 const source=database(),target=database(),oldTarget=database(),user=randomUUID(),other=randomUUID(),time='2026-10-28T08:00:00.000Z';
 for(const [id,name] of [[user,'demo'],[other,'other']])source.sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(id,name,'hash',time);
 source.sql.exec('INSERT INTO matrix_control(id,revision,initialized) VALUES(1,1,1)');
 for(const [id,name] of [[user,'custom'],[other,'other-label']])source.sql.prepare('INSERT INTO matrix_note_labels(user_id,name,created_at) VALUES(?,?,?)').run(id,name,time);
 for(const [id,name] of [[user,'\u751f\u6d3b'],[user,'\u5de5\u4f5c'],[user,'custom'],[other,'other-label']])
  source.sql.prepare('INSERT INTO matrix_note_label_archives(user_id,name,archived_at) VALUES(?,?,?)').run(id,name,time);
 const backup=await exportBackup(source.db),scoped=await exportBackup(source.db,{todoUserId:user});
 assert.equal(backup.data.format,'haoduoyu-matrix-d1-v14');
 assert.deepEqual(scoped.data.tables.note_label_archives.map(row=>row.name),['\u751f\u6d3b','\u5de5\u4f5c','custom']);
 await restoreIntoEmptyDatabase(target.db,backup,{allowEmptyRestore:true});
 assert.deepEqual(target.sql.prepare('SELECT user_id,name,archived_at FROM matrix_note_label_archives ORDER BY rowid').all().map(row=>({...row})),backup.data.tables.note_label_archives.map(row=>({...row})));
 const old=structuredClone(backup);old.data.format='haoduoyu-matrix-d1-v12';delete old.data.tables.ai_reports;delete old.data.tables.note_label_archives;old.sha256=digest(JSON.stringify(stable(old.data)));
 await restoreIntoEmptyDatabase(oldTarget.db,old,{allowEmptyRestore:true});
 assert.equal(oldTarget.sql.prepare('SELECT count(*) AS n FROM matrix_note_label_archives').get().n,0);
});

test('v13 rejects malformed archives before writing any data',async()=>{
 const source=database(),user=randomUUID(),time='2026-10-28T08:00:00.000Z';
 source.sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(user,'demo','hash',time);
 source.sql.exec('INSERT INTO matrix_control(id,revision,initialized) VALUES(1,1,1)');
 source.sql.prepare('INSERT INTO matrix_note_labels(user_id,name,created_at) VALUES(?,?,?)').run(user,'custom',time);
 source.sql.prepare('INSERT INTO matrix_note_label_archives(user_id,name,archived_at) VALUES(?,?,?)').run(user,'custom',time);
 const backup=await exportBackup(source.db);
 const cases=[rows=>rows.push({...rows[0]}),rows=>{rows[0].user_id=randomUUID()},rows=>{rows[0].name=' custom '},rows=>{rows[0].name=''},rows=>{rows[0].name='orphan'},rows=>{rows[0].archived_at='invalid'}];
 for(const mutate of cases){
  const bad=structuredClone(backup),target=database();mutate(bad.data.tables.note_label_archives);bad.sha256=digest(JSON.stringify(stable(bad.data)));
  await assert.rejects(restoreIntoEmptyDatabase(target.db,bad,{allowEmptyRestore:true}),e=>e.code==='INVALID_BACKUP');
  assert.equal(target.sql.prepare('SELECT count(*) AS n FROM matrix_users').get().n,0);
 }
});
