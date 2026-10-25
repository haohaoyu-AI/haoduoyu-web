import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './harness.mjs';
import {exportBackup,restoreIntoEmptyDatabase} from '../src/backup.mjs';
import {digest} from '../shared/auth.mjs';
import {stable} from '../src/security.mjs';
import {ARTICLE_PIPELINE_FIELDS} from '../src/article-pipeline-fields.mjs';

const sign=data=>({data,sha256:digest(JSON.stringify(stable(data)))});
test('v6 backup preserves daily todos and rejects incomplete or nonempty restores',async t=>{
  const source=await fixture(t),session=await source.login();
  const created=await source.request('/api/v1/todos',{method:'POST',session,body:{id:randomUUID(),date:'2026-10-23',text:'合成备份待办'}});
  assert.equal(created.status,201,created.text);
  assert.equal((await source.request('/api/v1/todos/'+created.data.id,{method:'PATCH',session,body:{completed:true,version:1}})).status,200);
  const backup=await exportBackup(source.db);
  assert.equal(backup.data.format,'haoduoyu-matrix-d1-v6');
  assert.equal(backup.data.tables.todos.length,1);
  const target=await fixture(t,{bootstrap:false});
  const result=await restoreIntoEmptyDatabase(target.db,backup,{allowEmptyRestore:true});
  assert.equal(result.counts.todos,1);
  const read=await target.request('/api/v1/todos?date=2026-10-23',{session:await target.login()});
  assert.equal(read.data.items[0].completed,true);assert.equal(read.data.items[0].version,2);
  await assert.rejects(restoreIntoEmptyDatabase(target.db,backup,{allowEmptyRestore:true}),error=>error.code==='RESTORE_NOT_EMPTY');
  const missing=structuredClone(backup.data);delete missing.tables.todos;
  const empty=await fixture(t,{bootstrap:false});
  await assert.rejects(restoreIntoEmptyDatabase(empty.db,sign(missing),{allowEmptyRestore:true}),error=>error.code==='INVALID_BACKUP');
});

test('v1 backup still restores into an empty upgraded database without inventing todos or templates',async t=>{
  const source=await fixture(t),v4=await exportBackup(source.db),data=structuredClone(v4.data);
  for(const row of data.tables.articles)for(const name of ARTICLE_PIPELINE_FIELDS)delete row[name];
  data.format='haoduoyu-matrix-d1-v1';delete data.tables.todos;delete data.tables.todo_templates;delete data.tables.todo_template_links;
  delete data.source_revision;
  delete data.tables.todo_preferences;
  delete data.tables.daily_notes;
  const target=await fixture(t,{bootstrap:false});
  const result=await restoreIntoEmptyDatabase(target.db,sign(data),{allowEmptyRestore:true});
  assert.equal(result.counts.todos,0);assert.equal(result.counts.todo_templates,0);assert.equal(result.counts.todo_template_links,0);assert.equal(result.counts.accounts,3);
  assert.equal(result.counts.todo_preferences,0);
  assert.equal((await target.request('/api/v1/todos',{session:await target.login()})).data.items.length,0);
});

test('HTTP backups retain existing admin data but scope new private todos to the session user',async t=>{
  const app=await fixture(t),session=await app.login();
  const owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const stamp=new Date().toISOString();
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,? FROM matrix_users WHERE id=?')
    .bind('synthetic-other-owner','synthetic-other-backup',stamp,owner).run();
  for(const id of [owner,'synthetic-other-owner']) await app.db.prepare('INSERT INTO matrix_todos(user_id,id,date,text,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .bind(id,randomUUID(),'2026-10-23','合成隔离待办',stamp,stamp).run();
  const backup=await app.request('/api/v1/backup',{session});
  assert.equal(backup.status,200,backup.text);
  assert.equal(backup.data.data.tables.todos.length,1);
  assert.equal(backup.data.data.tables.todos[0].user_id,owner);
  assert.equal((await exportBackup(app.db)).data.tables.todos.length,2,'operator utility remains a complete backup');
});
