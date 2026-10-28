import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './harness.mjs';
import worker from '../src/worker.mjs';
import {exportBackup,restoreIntoEmptyDatabase} from '../src/backup.mjs';
import {digest} from '../shared/auth.mjs';
import {stable} from '../src/security.mjs';
import {ARTICLE_PIPELINE_FIELDS} from '../src/article-pipeline-fields.mjs';

const sign=data=>({data,sha256:digest(JSON.stringify(stable(data)))});
const rows=async(db,table)=>(await db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()).results;
function olderData(input,version) {
  const data=structuredClone(input);data.format='haoduoyu-matrix-d1-v'+version;
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
async function sourceWithPreferences(t) {
  const app=await fixture(t),session=await app.login();
  const owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const other=randomUUID(),stamp=new Date().toISOString();
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,? FROM matrix_users WHERE id=?')
    .bind(other,'synthetic-delete-backup-'+other,stamp,owner).run();
  for(const [user,mode] of [[owner,'hide'],[other,'strike']]) {
    const todoId=randomUUID(),templateId=randomUUID();
    await app.db.prepare('INSERT INTO matrix_todos(user_id,id,date,text,completed,version,created_at,updated_at,deleted_at) VALUES(?,?,?,?,1,4,?,?,?)')
      .bind(user,todoId,'2026-10-23','合成删除备份待办',stamp,stamp,user===owner?stamp:null).run();
    await app.db.prepare('INSERT INTO matrix_todo_templates(user_id,id,text,created_at,updated_at) VALUES(?,?,?,?,?)')
      .bind(user,templateId,'合成后补模板',stamp,stamp).run();
    await app.db.prepare('INSERT INTO matrix_todo_template_links(user_id,todo_id,template_id,created_with_todo) VALUES(?,?,?,0)')
      .bind(user,todoId,templateId).run();
    await app.db.prepare('INSERT INTO matrix_todo_preferences(user_id,completed_mode,version,updated_at) VALUES(?,?,3,?)')
      .bind(user,mode,stamp).run();
  }
  return {...app,session,owner,other};
}

test('v7 backup scopes preferences to the session and preserves deleted todos through full restoration',async t=>{
  const source=await sourceWithPreferences(t);
  const response=await worker.fetch(new Request(source.origin+'/api/v1/backup',{headers:{Cookie:source.session.cookie}}),
    {DB:source.db,SITE_ORIGIN:source.origin});
  assert.equal(response.status,200);
  const http=(await response.json()).data;
  assert.equal(http.data.format,'haoduoyu-matrix-d1-v10');
  assert.equal(http.data.tables.todo_preferences.length,1);
  assert.equal(http.data.tables.todo_preferences[0].user_id,source.owner);
  assert.equal(http.data.tables.todo_preferences[0].completed_mode,'hide');
  assert.equal(http.data.tables.todos.length,1);
  assert.equal(http.data.tables.todos[0].user_id,source.owner);
  assert.ok(http.data.tables.todos[0].deleted_at);
  const backup=await exportBackup(source.db),target=await fixture(t,{bootstrap:false});
  assert.equal(backup.data.tables.todo_preferences.length,2);
  assert.equal(backup.data.tables.todos.length,2);
  const result=await restoreIntoEmptyDatabase(target.db,backup,{allowEmptyRestore:true});
  assert.equal(result.counts.todo_preferences,2);assert.equal(result.counts.todos,2);
  assert.deepEqual(await rows(target.db,'matrix_todo_preferences'),await rows(source.db,'matrix_todo_preferences'));
  assert.deepEqual(await rows(target.db,'matrix_todos'),await rows(source.db,'matrix_todos'));
  assert.deepEqual(await rows(target.db,'matrix_todo_template_links'),await rows(source.db,'matrix_todo_template_links'));
  assert.ok((await rows(target.db,'matrix_todo_template_links')).every(row=>row.created_with_todo===0));
  const visible=await target.request('/api/v1/todos?date=2026-10-23',{session:await target.login()});
  assert.equal(visible.status,200);assert.deepEqual(visible.data.items,[]);
  await assert.rejects(restoreIntoEmptyDatabase(target.db,backup,{allowEmptyRestore:true}),error=>error.code==='RESTORE_NOT_EMPTY');
});

test('v1 through v3 restore exact old todo rows with null deletion time and no invented preferences',async t=>{
  const source=await sourceWithPreferences(t),backup=await exportBackup(source.db);
  for(const version of [1,2,3]) {
    const data=olderData(backup.data,version),snapshot=structuredClone(data),target=await fixture(t,{bootstrap:false});
    const result=await restoreIntoEmptyDatabase(target.db,sign(data),{allowEmptyRestore:true});
    assert.equal(result.counts.todo_preferences,0);
    assert.equal(result.counts.todos,version===1?0:2);
    assert.deepEqual(await rows(target.db,'matrix_todo_preferences'),[]);
    const restored=await rows(target.db,'matrix_todos');
    assert.ok(restored.every(row=>row.deleted_at===null));
    if(version>1) assert.deepEqual(restored,data.tables.todos.map(row=>({...row,deleted_at:null})));
    const links=await rows(target.db,'matrix_todo_template_links');
    assert.equal(links.length,version===3?2:0);
    assert.ok(links.every(row=>row.created_with_todo===1));
    assert.deepEqual(data,snapshot,'old backup input stays unchanged');
  }
});

test('v7 and historical restore validate their exact todo columns before adding compatibility defaults',async t=>{
  const source=await sourceWithPreferences(t),backup=await exportBackup(source.db),target=await fixture(t,{bootstrap:false});
  const invalid=[];
  for(const version of [2,3]) {
    const injected=olderData(backup.data,version);injected.tables.todos[0].deleted_at=null;invalid.push(injected);
    const missing=olderData(backup.data,version);delete missing.tables.todos[0].text;invalid.push(missing);
    const preferences=olderData(backup.data,version);preferences.tables.todo_preferences=[];invalid.push(preferences);
  }
  const currentMissing=structuredClone(backup.data);delete currentMissing.tables.todos[0].deleted_at;invalid.push(currentMissing);
  const legacyLink=olderData(backup.data,3);legacyLink.tables.todo_template_links[0].created_with_todo=1;invalid.push(legacyLink);
  const currentLink=structuredClone(backup.data);delete currentLink.tables.todo_template_links[0].created_with_todo;invalid.push(currentLink);
  const currentBadLink=structuredClone(backup.data);currentBadLink.tables.todo_template_links[0].created_with_todo=2;invalid.push(currentBadLink);
  const currentMissingTable=structuredClone(backup.data);delete currentMissingTable.tables.todo_preferences;invalid.push(currentMissingTable);
  const wrongPreferenceColumns=structuredClone(backup.data);wrongPreferenceColumns.tables.todo_preferences[0].other='synthetic';invalid.push(wrongPreferenceColumns);
  for(const data of invalid)
    await assert.rejects(restoreIntoEmptyDatabase(target.db,sign(data),{allowEmptyRestore:true}),error=>error.code==='INVALID_BACKUP');
  assert.equal((await target.db.prepare('SELECT count(*) AS n FROM matrix_users').first()).n,0);
  assert.equal(await target.db.prepare('SELECT initialized FROM matrix_control WHERE id=1').first(),null);
});

test('every backup format rejects a target with existing preferences before any write',async t=>{
  const source=await fixture(t),backup=await exportBackup(source.db);
  for(const version of [1,2,3,4,5,6]) {
    let writes=0,checks=0;
    const target={prepare(sql) {
      if(sql==='SELECT count(*) AS n FROM matrix_todo_preferences') return {bind() {return this;},async first() {checks++;return {n:1};}};
      if(sql.startsWith('SELECT count(*) AS n FROM ')) return {bind() {return this;},async first() {return {n:0};}};
      writes++;throw new Error('Nonempty preferences must prevent any restore write');
    }};
    await assert.rejects(restoreIntoEmptyDatabase(target,sign(olderData(backup.data,version)),{allowEmptyRestore:true}),error=>error.code==='RESTORE_NOT_EMPTY');
    assert.equal(checks,1);assert.equal(writes,0);
  }
});

test('invalid stored completion mode leaves the failed restore target fenced',async t=>{
  const source=await sourceWithPreferences(t),data=structuredClone((await exportBackup(source.db)).data);
  data.tables.todo_preferences[0].completed_mode='invalid-synthetic-mode';
  const target=await fixture(t,{bootstrap:false});
  await assert.rejects(restoreIntoEmptyDatabase(target.db,sign(data),{allowEmptyRestore:true}),/CHECK constraint failed/);
  assert.equal((await target.db.prepare('SELECT initialized FROM matrix_control WHERE id=1').first()).initialized,2);
  assert.equal((await target.request('/api/v1/todos')).status,503);
});
