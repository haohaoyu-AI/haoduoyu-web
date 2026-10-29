import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './harness.mjs';
import worker from '../src/worker.mjs';
import {exportBackup,restoreIntoEmptyDatabase} from '../src/backup.mjs';
import {digest} from '../shared/auth.mjs';
import {stable} from '../src/security.mjs';
import {ARTICLE_PIPELINE_FIELDS} from '../src/article-pipeline-fields.mjs';
import {legacyBackupEnvelope} from './todo-backup-projection.mjs';

const sign=data=>({data,sha256:digest(JSON.stringify(stable(data)))});
const rows=async(db,table)=>(await db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()).results;
function versionData(input,version) {
  const data=structuredClone(input);data.format='haoduoyu-matrix-d1-v'+version;
  for(const [introduced,name] of [[13,'note_label_archives'],[12,'note_entry_label_sets'],[11,'note_entry_label_overrides']]) {
    if(version<introduced) { assert.deepEqual(data.tables[name],[],'historical fixture cannot hide new data: '+name);delete data.tables[name]; }
  }
  if(version<10)for(const name of ['unscheduled_todos','note_labels','note_entry_labels']) {
    assert.deepEqual(data.tables[name],[],'historical fixture cannot hide new data: '+name);delete data.tables[name];
  }
  if(version<9)for(const name of ['note_entries','work_reminders','account_profiles']) {
    assert.deepEqual(data.tables[name],[],'historical fixture cannot hide workbench data: '+name);delete data.tables[name];
  }
  if(version<8)delete data.tables.daily_work_notes;
  if(version<7){delete data.tables.memo_groups;delete data.tables.memo_notes;}
  if(version<6)for(const row of data.tables.articles)for(const name of ARTICLE_PIPELINE_FIELDS)delete row[name];
  if(version<5){delete data.tables.daily_notes;delete data.source_revision;}
  if(version<4) {
    delete data.tables.todo_preferences;
    for(const row of data.tables.todos) delete row.deleted_at;
    for(const row of data.tables.todo_template_links) delete row.created_with_todo;
  }
  if(version<3) {delete data.tables.todo_templates;delete data.tables.todo_template_links;}
  if(version<2) delete data.tables.todos;
  return data;
}
async function sourceWithTemplates(t) {
  const app=await fixture(t),session=await app.login();
  const owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const other=randomUUID(),stamp=new Date().toISOString(),id=randomUUID();
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,? FROM matrix_users WHERE id=?')
    .bind(other,'synthetic-template-backup-'+other,stamp,owner).run();
  for(const [user,text] of [[owner,'合成常用计划'],[other,'另一用户合成计划']]) {
    const todoId=randomUUID();
    await app.db.prepare('INSERT INTO matrix_todo_templates(user_id,id,text,version,created_at,updated_at,deleted_at) VALUES(?,?,?,3,?,?,?)')
      .bind(user,id,text,stamp,stamp,user===owner?stamp:null).run();
    await app.db.prepare('INSERT INTO matrix_todos(user_id,id,date,text,completed,version,created_at,updated_at) VALUES(?,?,?,?,1,2,?,?)')
      .bind(user,todoId,'2026-10-23','已完成的合成历史计划',stamp,stamp).run();
    await app.db.prepare('INSERT INTO matrix_todo_template_links(user_id,todo_id,template_id) VALUES(?,?,?)')
      .bind(user,todoId,id).run();
  }
  return {...app,session,owner,other};
}

test('v7 HTTP backup scopes template tables while operator restore preserves deleted templates and links',async t=>{
  const source=await sourceWithTemplates(t);
  const response=await worker.fetch(new Request(source.origin+'/api/v1/backup',{headers:{Cookie:source.session.cookie}}),
    {DB:source.db,SITE_ORIGIN:source.origin});
  assert.equal(response.status,200);
  const http=(await response.json()).data;
  assert.equal(http.data.format,'haoduoyu-matrix-d1-v13');
  for(const name of ['todos','todo_templates','todo_template_links']) {
    assert.equal(http.data.tables[name].length,1);
    assert.equal(http.data.tables[name][0].user_id,source.owner);
  }
  const backup=await exportBackup(source.db);
  assert.equal(backup.data.tables.todo_templates.length,2);
  assert.equal(backup.data.tables.todo_template_links.length,2);
  assert.equal(backup.data.tables.todos.length,2);
  assert.deepEqual(Object.keys(backup.data.tables.todo_templates[0]).sort(),['user_id','id','text','version','created_at','updated_at','deleted_at'].sort());
  const target=await fixture(t,{bootstrap:false});
  const result=await restoreIntoEmptyDatabase(target.db,backup,{allowEmptyRestore:true});
  assert.equal(result.counts.todo_templates,2);assert.equal(result.counts.todo_template_links,2);assert.equal(result.counts.todos,2);
  assert.deepEqual(await rows(target.db,'matrix_todo_templates'),await rows(source.db,'matrix_todo_templates'));
  assert.deepEqual(await rows(target.db,'matrix_todo_template_links'),await rows(source.db,'matrix_todo_template_links'));
  assert.deepEqual(await rows(target.db,'matrix_todos'),await rows(source.db,'matrix_todos'));
  assert.ok((await rows(target.db,'matrix_todo_templates')).find(row=>row.user_id===source.owner).deleted_at);
  assert.equal((await target.db.prepare('SELECT count(*) AS n FROM matrix_sessions').first()).n,0);
  const before=await rows(target.db,'matrix_todo_templates');
  await assert.rejects(restoreIntoEmptyDatabase(target.db,backup,{allowEmptyRestore:true}),error=>error.code==='RESTORE_NOT_EMPTY');
  assert.deepEqual(await rows(target.db,'matrix_todo_templates'),before);
});

test('v2 restores retain todo history but create no template records in the upgraded schema',async t=>{
  const source=await sourceWithTemplates(t),data=versionData((await exportBackup(source.db)).data,2);
  const target=await fixture(t,{bootstrap:false});
  const result=await restoreIntoEmptyDatabase(target.db,sign(data),{allowEmptyRestore:true});
  assert.equal(result.counts.todo_templates,0);assert.equal(result.counts.todo_template_links,0);assert.equal(result.counts.todos,2);assert.equal(result.counts.accounts,3);
  assert.deepEqual(await rows(target.db,'matrix_todo_templates'),[]);
  assert.deepEqual(await rows(target.db,'matrix_todo_template_links'),[]);
  assert.deepEqual(await rows(target.db,'matrix_todos'),await rows(source.db,'matrix_todos'));
});

test('template backup validation rejects missing tables, extra columns and tampering before restoration',async t=>{
  const source=await sourceWithTemplates(t),backup=await exportBackup(source.db),target=await fixture(t,{bootstrap:false});
  const missing=structuredClone(backup.data);delete missing.tables.todo_templates;
  const missingLinks=structuredClone(backup.data);delete missingLinks.tables.todo_template_links;
  const extra=structuredClone(backup.data);extra.tables.todo_templates[0].owner='synthetic-injected';
  const wrongVersion=structuredClone(backup.data);wrongVersion.format='haoduoyu-matrix-d1-v2';
  const badRows=structuredClone(backup.data);badRows.tables.todo_templates={};
  for(const data of [missing,missingLinks,extra,wrongVersion,badRows])
    await assert.rejects(restoreIntoEmptyDatabase(target.db,sign(data),{allowEmptyRestore:true}),error=>error.code==='INVALID_BACKUP');
  const tampered=structuredClone(backup);tampered.data.tables.todo_templates[0].text='合成修改内容';
  await assert.rejects(restoreIntoEmptyDatabase(target.db,tampered,{allowEmptyRestore:true}),error=>error.code==='INVALID_BACKUP');
  await assert.rejects(restoreIntoEmptyDatabase(target.db,backup),error=>error.code==='RESTORE_DISABLED');
  assert.deepEqual(await rows(target.db,'matrix_todo_templates'),[]);
  assert.equal((await target.db.prepare('SELECT count(*) AS n FROM matrix_users').first()).n,0);
  assert.equal(await target.db.prepare('SELECT initialized FROM matrix_control WHERE id=1').first(),null);
});

test('all backup versions check that both new template tables are empty before any write',async t=>{
  const source=await fixture(t),backup=await exportBackup(source.db);
  for(const version of [1,2,3,4,5,6]) for(const nonempty of ['matrix_todo_templates','matrix_todo_template_links']) {
    const data=versionData(backup.data,version);
    let writes=0,templateChecks=0;
    const target={prepare(sql) {
      if(sql==='SELECT count(*) AS n FROM '+nonempty) return {bind() {return this;},async first() {templateChecks++;return {n:1};}};
      if(sql.startsWith('SELECT count(*) AS n FROM ')) return {bind() {return this;},async first() {return {n:0};}};
      writes++;throw new Error('Restore must reject before a write');
    }};
    await assert.rejects(restoreIntoEmptyDatabase(target,sign(data),{allowEmptyRestore:true}),error=>error.code==='RESTORE_NOT_EMPTY');
    assert.equal(templateChecks,1);assert.equal(writes,0);
  }
});

test('invalid template links fail closed and leave the restore target fenced',async t=>{
  const source=await sourceWithTemplates(t),data=structuredClone((await exportBackup(source.db)).data);
  data.tables.todo_template_links[0].template_id=randomUUID();
  const target=await fixture(t,{bootstrap:false});
  await assert.rejects(restoreIntoEmptyDatabase(target.db,sign(data),{allowEmptyRestore:true}),/FOREIGN KEY constraint failed/);
  assert.equal((await target.db.prepare('SELECT initialized FROM matrix_control WHERE id=1').first()).initialized,2);
  assert.equal((await target.request('/api/v1/todos')).status,503);
});

test('legacy backup projection verifies checksums and refuses populated or missing private tables',async t=>{
  const source=await fixture(t),backup=await exportBackup(source.db);
  const projected=legacyBackupEnvelope({data:backup});
  assert.equal(projected.data.data.format,'haoduoyu-matrix-d1-v1');
  assert.equal(Object.hasOwn(projected.data.data.tables,'todo_templates'),false);
  assert.equal(Object.hasOwn(projected.data.data.tables,'todo_template_links'),false);
  assert.equal(Object.hasOwn(projected.data.data.tables,'todo_preferences'),false);
  assert.equal(Object.hasOwn(projected.data.data.tables,'todos'),false);
  assert.equal(Object.hasOwn(projected.data.data.tables,'daily_notes'),false);
  const v2=versionData(backup.data,2);
  assert.deepEqual(legacyBackupEnvelope({data:sign(v2)}),projected);
  assert.deepEqual(legacyBackupEnvelope({data:sign(versionData(backup.data,3))}),projected);
  for(const name of ['todos','todo_templates','todo_template_links','todo_preferences','daily_notes','note_entries','work_reminders','account_profiles']) {
    const populated=structuredClone(backup.data);populated.tables[name]=[{id:'synthetic'}];
    assert.throws(()=>legacyBackupEnvelope({data:sign(populated)}));
    const missing=structuredClone(backup.data);delete missing.tables[name];
    assert.throws(()=>legacyBackupEnvelope({data:sign(missing)}));
  }
  const badHash=structuredClone(backup);badHash.sha256='0'.repeat(64);
  assert.throws(()=>legacyBackupEnvelope({data:badHash}));
});
