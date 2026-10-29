import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {exportBackup,restoreIntoEmptyDatabase} from '../src/backup.mjs';
import {digest,stable} from '../src/security.mjs';
function database() {
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const name of ['0000_lively_stellaris','0001_daily_todos','0002_todo_templates','0003_todo_recovery_preferences','0004_daily_notes','0005_article_pipeline','0006_long_term_memos','0007_work_daily_notes','0008_workbench_updates','0009_unscheduled_todos','0010_note_labels','0011_note_entry_multi_labels','0012_note_entry_label_sets'])
  for(const stmt of readFileSync(new URL('../drizzle/'+name+'.sql',import.meta.url),'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))sql.exec(stmt);
 const db={prepare(text){let values=[];return {bind(...v){values=v;return this},async first(){return sql.prepare(text).get(...values)||null},async all(){return {results:sql.prepare(text).all(...values)}},async run(){const result=sql.prepare(text).run(...values);return {meta:{changes:Number(result.changes)}}}}},async batch(statements){sql.exec('BEGIN');try{for(const s of statements)await s.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};return {sql,db};
}
test('v12 backup restores new labels and v11 stays readable',async()=>{
 const source=database(),target=database(),oldTarget=database(),user=randomUUID(),entry=randomUUID(),time='2026-10-28T08:00:00.000Z';
 source.sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(user,'demo','hash',time);
 source.sql.exec('INSERT INTO matrix_control(id,revision,initialized) VALUES(1,1,1)');
 source.sql.prepare('INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(user,entry,'work','2026-10-28','text',1,1,time,time,null);
 source.sql.prepare('INSERT INTO matrix_note_labels(user_id,name,created_at) VALUES(?,?,?)').run(user,'自定义',time);
 const tags=['自定义',...Array.from({length:199},(_,i)=>'标签'+i)];
 for(const tag of tags.slice(1))source.sql.prepare('INSERT INTO matrix_note_labels(user_id,name,created_at) VALUES(?,?,?)').run(user,tag,time);
 const labels=['生活','工作',...tags];
 source.sql.prepare('INSERT INTO matrix_note_entry_label_sets(user_id,entry_id,labels_json) VALUES(?,?,?)').run(user,entry,JSON.stringify(labels));
 const backup=await exportBackup(source.db);assert.equal(backup.data.format,'haoduoyu-matrix-d1-v12');
 await restoreIntoEmptyDatabase(target.db,backup,{allowEmptyRestore:true});
 assert.deepEqual(JSON.parse(target.sql.prepare('SELECT labels_json FROM matrix_note_entry_label_sets').get().labels_json),labels);
 const old=structuredClone(backup);old.data.format='haoduoyu-matrix-d1-v11';delete old.data.tables.note_entry_label_sets;old.sha256=digest(JSON.stringify(stable(old.data)));
 await restoreIntoEmptyDatabase(oldTarget.db,old,{allowEmptyRestore:true});
 assert.equal(oldTarget.sql.prepare('SELECT count(*) AS n FROM matrix_note_entry_label_sets').get().n,0);
 const invalid=structuredClone(backup);invalid.data.tables.note_entry_label_sets[0].labels_json=JSON.stringify(['missing']);invalid.sha256=digest(JSON.stringify(stable(invalid.data)));
 await assert.rejects(restoreIntoEmptyDatabase(database().db,invalid,{allowEmptyRestore:true}),e=>e.code==='INVALID_BACKUP');
});
