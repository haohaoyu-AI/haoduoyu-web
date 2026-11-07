import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,applyFixtureMigrations} from './harness.mjs';
import {exportBackup,restoreIntoEmptyDatabase} from '../src/backup.mjs';
import {digest,stable} from '../src/security.mjs';
import {handleWorkbenchSnapshot} from '../src/workbench-snapshot.mjs';

test('additive migration preserves old rows and supplies safe defaults', async t => {
  const app=await fixture(t,{migrationCount:19});
  const user=(await app.db.prepare('SELECT id FROM matrix_users LIMIT 1').first()).id;
  const todoId=randomUUID(),templateId=randomUUID(),stamp=new Date().toISOString();
  await app.db.prepare('INSERT INTO matrix_todos(user_id,id,date,text,completed,version,created_at,updated_at) VALUES(?,?,?,?,0,1,?,?)').bind(user,todoId,'2026-11-06','迁移前事项',stamp,stamp).run();
  await app.db.prepare('INSERT INTO matrix_todo_templates(user_id,id,text,version,created_at,updated_at) VALUES(?,?,?,1,?,?)').bind(user,templateId,'迁移前模板',stamp,stamp).run();
  await applyFixtureMigrations(app.db);
  const todo=await app.db.prepare('SELECT text,note FROM matrix_todos WHERE id=?').bind(todoId).first();
  const template=await app.db.prepare('SELECT text,archived_at FROM matrix_todo_templates WHERE id=?').bind(templateId).first();
  assert.deepEqual(todo,{text:'迁移前事项',note:''}); assert.deepEqual(template,{text:'迁移前模板',archived_at:null});
});

test('notes and archived templates preserve history, protect versions, and appear in backups', async t => {
  const app=await fixture(t); const session=await app.login();
  const req=(path,method='GET',body)=>app.request('/api/v1'+path,{method,session,...(body?{body}:{})});
  const template=(await req('/todo-templates','POST',{id:randomUUID(),text:'合成常用事项'})).data;
  const todo=(await req('/todos','POST',{id:randomUUID(),date:'2026-11-06',text:template.text,template_id:template.id})).data;
  const saved=await req(`/todos/${todo.id}/note`,'PATCH',{version:todo.version,note:'未完成：等待回复'});
  assert.equal(saved.status,200); assert.equal(saved.data.note,'未完成：等待回复');
  assert.equal((await req(`/todos/${todo.id}/note`,'PATCH',{version:todo.version,note:'未完成：等待回复'})).data.version,saved.data.version);
  assert.equal((await req(`/todos/${todo.id}/note`,'PATCH',{version:todo.version,note:'覆盖'})).status,409);
  const archived=await req(`/todo-templates/${template.id}/archive`,'POST',{version:template.version});
  assert.equal(archived.status,200); assert.ok(archived.data.archived_at);
  assert.equal((await req('/todo-templates')).data.items.length,0);
  assert.equal((await req('/todo-templates?archived=1')).data.items[0].id,template.id);
  assert.equal((await req('/todos?date=2026-11-06')).data.items[0].note,'未完成：等待回复');
  const user=(await req('/auth/me')).data.id;
  const snapshot=await handleWorkbenchSnapshot(app.db,new Request(app.origin+'/api/v1/workbench-snapshot/index?version=2',{headers:{Cookie:session.cookie}}),'/workbench-snapshot/index',
    {SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_USER_ID:user,DAILY_NOTES_OWNER_ID:user,MEMOS_OWNER_ID:user});
  assert.equal(snapshot.status,200);
  assert.equal((await req('/todos','POST',{id:randomUUID(),date:'2026-11-06',text:template.text,template_id:template.id})).status,404);
  const backup=await exportBackup(app.db);
  assert.equal(backup.data.format,'haoduoyu-matrix-d1-v16');
  assert.equal(backup.data.tables.todos[0].note,'未完成：等待回复');
  assert.ok(backup.data.tables.todo_templates[0].archived_at);
  const target=await fixture(t,{bootstrap:false});
  await restoreIntoEmptyDatabase(target.db,backup,{allowEmptyRestore:true});
  const restoredTodo=await target.db.prepare('SELECT note FROM matrix_todos WHERE id=?').bind(todo.id).first();
  const restoredTemplate=await target.db.prepare('SELECT archived_at FROM matrix_todo_templates WHERE id=?').bind(template.id).first();
  assert.equal(restoredTodo.note,'未完成：等待回复'); assert.equal(restoredTemplate.archived_at,archived.data.archived_at);
  const old=structuredClone(backup.data); old.format='haoduoyu-matrix-d1-v14';
  // This historical fixture may omit only verified-empty review collections.
  for(const name of Object.keys(old.tables).filter(name=>name.startsWith('review_')||name.startsWith('openai_review_'))) {
    assert.deepEqual(old.tables[name],[],'legacy fixture cannot hide review history: '+name);
    delete old.tables[name];
  }
  for(const row of old.tables.todos)delete row.note;
  for(const row of old.tables.todo_templates)delete row.archived_at;
  const legacyTarget=await fixture(t,{bootstrap:false});
  await restoreIntoEmptyDatabase(legacyTarget.db,{data:old,sha256:digest(JSON.stringify(stable(old)))},{allowEmptyRestore:true});
  assert.equal((await legacyTarget.db.prepare('SELECT note FROM matrix_todos WHERE id=?').bind(todo.id).first()).note,'');
  assert.equal((await legacyTarget.db.prepare('SELECT archived_at FROM matrix_todo_templates WHERE id=?').bind(template.id).first()).archived_at,null);
  const restored=await req(`/todo-templates/${template.id}/restore`,'POST',{version:archived.data.version});
  assert.equal(restored.status,200); assert.equal(restored.data.archived_at,null);
  assert.equal((await req('/todo-templates')).data.items[0].id,template.id);
});
