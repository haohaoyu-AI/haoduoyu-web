import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture,applyFixtureMigrations,USERNAME} from './harness.mjs';
import {csrfFor,digest} from '../shared/auth.mjs';
import {revision} from '../src/storage.mjs';
import {handleTodos} from '../src/todos.mjs';

const day='2026-10-23';
async function setup(t,options) {
  const app=await fixture(t,options);app.session=await app.login();
  app.userId=(await app.request('/api/v1/auth/me',{session:app.session})).data.id;return app;
}
const create=(app,body)=>app.request('/api/v1/todos',{method:'POST',session:app.session,body});
const input=(extra={})=>({id:randomUUID(),date:day,text:'可恢复的合成事项',...extra});
const rows=(app,date=day,session=app.session)=>app.request('/api/v1/todos?date='+date,{session});
const remove=(app,todo,version=todo.version,session=app.session,date=todo.date)=>app.request('/api/v1/todos/'+todo.id,{method:'DELETE',session,body:{date,version}});
const restore=(app,todo,version=todo.version,session=app.session,date=todo.date)=>app.request('/api/v1/todos/'+todo.id+'/restore',{method:'POST',session,body:{date,version}});
const attach=(app,todo,template_id,template_version=0,version=todo.version)=>app.request('/api/v1/todos/'+todo.id+'/template',{method:'POST',session:app.session,body:{date:todo.date,version,template_id,template_version}});
const preference=(app,completed_mode,version,session=app.session)=>app.request('/api/v1/todo-preferences',{method:'PATCH',session,body:{completed_mode,version}});
async function otherSession(app) {
  const id=randomUUID(),token=randomBytes(32).toString('hex');
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,created_at FROM matrix_users WHERE username=?').bind(id,'synthetic-'+id,USERNAME).run();
  await app.db.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(digest(token),id,new Date(Date.now()+86400000).toISOString()).run();
  return {cookie:'matrix_session='+token,csrfToken:csrfFor(token)};
}

test('todo delete and restore are explicit, versioned, repeatable without writes, and reject old opposite requests',async t=>{
  const app=await setup(t),body=input(),todo=(await create(app,body)).data,before=await revision(app.db);
  const deleted=await remove(app,todo);assert.equal(deleted.status,200);assert.ok(deleted.data.deleted_at);assert.equal(deleted.data.version,2);
  assert.deepEqual((await rows(app)).data.items,[]);assert.equal(await revision(app.db),before+1);
  const again=await remove(app,todo);assert.equal(again.status,200);assert.deepEqual(again.data,deleted.data);assert.equal(await revision(app.db),before+1);
  assert.equal((await remove(app,deleted.data)).status,200);assert.equal(await revision(app.db),before+1);
  assert.equal((await create(app,body)).json.error.code,'TODO_DELETED');
  const complete=await app.request('/api/v1/todos/'+todo.id,{method:'PATCH',session:app.session,body:{completed:true,version:2}});
  assert.equal(complete.status,410);
  const back=await restore(app,deleted.data);assert.equal(back.status,200);assert.equal(back.data.deleted_at,null);assert.equal(back.data.version,3);
  const retried=await restore(app,deleted.data);assert.equal(retried.status,200);assert.deepEqual(retried.data,back.data);
  assert.equal(await revision(app.db),before+2);
  assert.equal((await remove(app,todo)).status,409);assert.equal((await rows(app)).data.items.length,1);
  const deletedAgain=await remove(app,back.data);assert.equal(deletedAgain.status,200);
  assert.equal((await restore(app,deleted.data)).status,409);assert.deepEqual((await rows(app)).data.items,[]);
});

test('todo recovery is owner/date scoped and cannot touch another day or user',async t=>{
  const app=await setup(t),other=await otherSession(app),todo=(await create(app,input())).data;
  const otherDay=(await create(app,input({date:'2026-10-24'}))).data;
  for(const action of [remove,restore]) {
    const denied=await action(app,todo,todo.version,other);
    const missing=await action(app,{...todo,id:randomUUID()},todo.version,other);
    assert.equal(denied.status,404);assert.deepEqual(denied.json,missing.json);
    assert.equal((await action(app,todo,todo.version,app.session,'2026-10-24')).status,404);
  }
  await remove(app,todo);
  assert.deepEqual((await rows(app,'2026-10-24')).data.items,[otherDay]);
  assert.equal((await rows(app)).data.items.length,0);
});

test('same-target concurrent recovery writes once, failures are atomic and lost responses can be retried safely',async t=>{
  const app=await setup(t),todo=(await create(app,input())).data,before=await revision(app.db);
  const results=await Promise.all(Array.from({length:6},()=>remove(app,todo)));
  assert.ok(results.every(result=>result.status===200));assert.equal(await revision(app.db),before+1);
  assert.equal(new Set(results.map(result=>JSON.stringify(result.data))).size,1);
  await app.db.prepare("CREATE TRIGGER synthetic_restore_failure BEFORE UPDATE ON matrix_todos BEGIN SELECT RAISE(ABORT,'synthetic restore fault'); END").run();
  const failed=await restore(app,results[0].data);assert.equal(failed.status,500);assert.ok(!failed.text.includes('restore fault'));
  assert.equal(await revision(app.db),before+1);assert.deepEqual((await rows(app)).data.items,[]);
  await app.db.prepare('DROP TRIGGER synthetic_restore_failure').run();
  let commits=0;
  const db={prepare:app.db.prepare.bind(app.db),batch:async statements=>{commits++;await app.db.batch(statements);throw new Error('Synthetic lost response');}};
  const request=new Request(app.origin+'/api/v1/todos/'+todo.id+'/restore',{method:'POST',headers:{Cookie:app.session.cookie,Origin:app.origin,
    'X-CSRF-Token':app.session.csrfToken,'Content-Type':'application/json'},body:JSON.stringify({date:day,version:2})});
  await assert.rejects(handleTodos(db,request,'/todos/'+todo.id+'/restore',app.origin),/lost response/);
  assert.equal(commits,1);
  assert.equal((await restore(app,results[0].data)).status,200);assert.equal(await revision(app.db),before+2);
});

test('deleted completed todos are excluded from habit counts; restore and duplicate-day handling preserve template links',async t=>{
  const app=await setup(t),today=(await rows(app)).data.today;
  const template=(await app.request('/api/v1/todo-templates',{method:'POST',session:app.session,body:{id:randomUUID(),text:'合成习惯'}})).data;
  const items=[];
  for(let i=0;i<2;i++) {
    const todo=(await create(app,input({date:today,template_id:template.id}))).data;
    items.push((await app.request('/api/v1/todos/'+todo.id,{method:'PATCH',session:app.session,body:{completed:true,version:1}})).data);
  }
  const count=async()=>(await app.request('/api/v1/todo-templates',{session:app.session})).data.items[0].completed_days;
  assert.equal(await count(),1);
  const first=(await remove(app,items[0])).data;assert.equal(await count(),1);
  await remove(app,items[1]);assert.equal(await count(),0);
  const back=(await restore(app,first)).data;assert.equal(back.completed,true);assert.equal(await count(),1);
  const templateBefore=await app.db.prepare('SELECT * FROM matrix_todo_templates WHERE id=?').bind(template.id).first();
  await app.request('/api/v1/todo-templates/'+template.id,{method:'DELETE',session:app.session,body:{version:template.version}});
  const deletedTemplate=await app.db.prepare('SELECT * FROM matrix_todo_templates WHERE id=?').bind(template.id).first();
  const removed=(await remove(app,back)).data;await restore(app,removed);
  assert.deepEqual(await app.db.prepare('SELECT * FROM matrix_todo_templates WHERE id=?').bind(template.id).first(),deletedTemplate);
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_todo_template_links WHERE template_id=?').bind(template.id).first()).n,2);
  assert.equal(deletedTemplate.text,templateBefore.text);
});

test('from-todo creates a distinct stable template without matching names and preserves original create idempotency',async t=>{
  const app=await setup(t),body=input(),todo=(await create(app,body)).data;
  const existing=(await app.request('/api/v1/todo-templates',{method:'POST',session:app.session,body:{id:randomUUID(),text:body.text}})).data;
  const templateId=randomUUID(),before=await revision(app.db);
  const result=await attach(app,todo,templateId);assert.equal(result.status,200,result.text);
  assert.equal(result.data.template.id,templateId);assert.notEqual(templateId,existing.id);
  assert.equal(result.data.todo.version,2);assert.equal(result.data.todo.template_active,true);assert.equal(result.data.todo.template_version,1);
  const replay=await attach(app,todo,templateId);assert.equal(replay.status,200);assert.deepEqual(replay.data,result.data);assert.equal(await revision(app.db),before+1);
  const original=await create(app,body);assert.equal(original.status,200);assert.equal(original.data.template_id,templateId);
  const link=await app.db.prepare('SELECT created_with_todo FROM matrix_todo_template_links WHERE todo_id=?').bind(todo.id).first();assert.equal(link.created_with_todo,0);
  assert.equal((await create(app,{...body,template_id:templateId})).status,409);
  const linkedBody=input({template_id:existing.id}),linked=(await create(app,linkedBody)).data;
  const {template_id,...withoutAssociation}=linkedBody;
  assert.equal((await create(app,withoutAssociation)).status,409);
  assert.equal((await create(app,linkedBody)).status,200);
  assert.equal((await app.db.prepare('SELECT created_with_todo FROM matrix_todo_template_links WHERE todo_id=?').bind(linked.id).first()).created_with_todo,1);
});

test('from-todo restores its own deleted template, keeps history stable, and rejects late add after another cancel',async t=>{
  const app=await setup(t),todo=(await create(app,input())).data,templateId=randomUUID();
  const first=(await attach(app,todo,templateId)).data;
  await app.request('/api/v1/todo-templates/'+templateId,{method:'DELETE',session:app.session,body:{version:1}});
  const inactive=(await rows(app)).data.items[0];assert.equal(inactive.template_active,false);assert.equal(inactive.template_version,2);
  assert.equal((await attach(app,todo,templateId)).status,409);
  const restored=await attach(app,inactive,templateId,2);assert.equal(restored.status,200);
  assert.equal(restored.data.template.id,templateId);assert.equal(restored.data.template.version,3);
  assert.equal(restored.data.todo.version,first.todo.version);
  const before=await revision(app.db);assert.equal((await attach(app,inactive,templateId,2)).status,200);assert.equal(await revision(app.db),before);
  await app.request('/api/v1/todo-templates/'+templateId,{method:'DELETE',session:app.session,body:{version:3}});
  assert.equal((await attach(app,inactive,templateId,2)).status,409);
  assert.equal((await app.request('/api/v1/todo-templates',{method:'POST',session:app.session,body:{id:templateId,text:todo.text}})).status,410);
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_todo_template_links WHERE todo_id=?').bind(todo.id).first()).n,1);
});

test('from-todo rejects wrong owner/date/version and rolls back template creation when linking fails',async t=>{
  const app=await setup(t),todo=(await create(app,input())).data,other=await otherSession(app),templateId=randomUUID();
  const payload={date:todo.date,version:todo.version,template_id:templateId,template_version:0};
  assert.equal((await app.request('/api/v1/todos/'+todo.id+'/template',{method:'POST',session:other,body:payload})).status,404);
  assert.equal((await attach(app,{...todo,date:'2026-10-24'},templateId)).status,404);
  assert.equal((await attach(app,todo,templateId,0,4)).status,409);
  const before=await revision(app.db);
  await app.db.prepare("CREATE TRIGGER synthetic_from_todo_failure BEFORE INSERT ON matrix_todo_template_links BEGIN SELECT RAISE(ABORT,'synthetic from todo fault'); END").run();
  assert.equal((await attach(app,todo,templateId)).status,500);assert.equal(await revision(app.db),before);
  assert.equal(await app.db.prepare('SELECT id FROM matrix_todo_templates WHERE id=?').bind(templateId).first(),null);
  assert.equal((await rows(app)).data.items[0].version,1);
});

test('completion preferences default without writes, persist privately, replay safely and do not alter todos',async t=>{
  const app=await setup(t),other=await otherSession(app),todo=(await create(app,input())).data;
  const beforeRows=(await app.db.prepare('SELECT * FROM matrix_todos').all()).results,before=await revision(app.db);
  const initial=await app.request('/api/v1/todo-preferences',{session:app.session});
  assert.deepEqual(initial.data,{completed_mode:'strike',version:0});assert.equal(await revision(app.db),before);
  assert.equal((await preference(app,'strike',0)).status,200);assert.equal(await revision(app.db),before);
  const changed=await preference(app,'hide',0);assert.deepEqual(changed.data,{completed_mode:'hide',version:1});
  assert.equal((await preference(app,'hide',0)).status,200);assert.equal(await revision(app.db),before+1);
  const listed=await rows(app);assert.equal(listed.data.completed_mode,'hide');assert.equal(listed.data.preferences_version,1);assert.deepEqual(listed.data.items,[todo]);
  const otherPrefs=await app.request('/api/v1/todo-preferences',{session:other});assert.deepEqual(otherPrefs.data,{completed_mode:'strike',version:0});
  assert.equal((await preference(app,'strike',1)).status,200);
  assert.equal((await preference(app,'hide',0)).status,409);
  assert.deepEqual((await app.db.prepare('SELECT * FROM matrix_todos').all()).results,beforeRows);
  await app.db.prepare("CREATE TRIGGER synthetic_pref_failure BEFORE UPDATE ON matrix_todo_preferences BEGIN SELECT RAISE(ABORT,'synthetic preference fault'); END").run();
  const failed=await preference(app,'hide',2);assert.equal(failed.status,500);
  assert.deepEqual((await app.request('/api/v1/todo-preferences',{session:app.session})).data,{completed_mode:'strike',version:2});
});

test('new todo operations retain session-only authentication, CSRF and strict validation',async t=>{
  const app=await setup(t),todo=(await create(app,input())).data;
  const key=(await app.request('/api/v1/api-keys',{method:'POST',session:app.session,body:{name:'Synthetic recovery denial',account_ids:['toutiao-haoduoyu'],permissions:['read','write']}})).data.token;
  const cases=[['/api/v1/todos/'+todo.id,'DELETE',{date:day,version:1}],['/api/v1/todos/'+todo.id+'/restore','POST',{date:day,version:1}],
    ['/api/v1/todos/'+todo.id+'/template','POST',{date:day,version:1,template_id:randomUUID(),template_version:0}],['/api/v1/todo-preferences','PATCH',{completed_mode:'hide',version:0}]];
  for(const [path,method,body] of cases) {
    assert.equal((await app.request(path,{method,body})).status,401);
    assert.equal((await app.request(path,{method,body,token:key,session:app.session})).status,403);
    assert.equal((await app.request(path,{method,body,headers:{Cookie:app.session.cookie}})).status,403);
    assert.equal((await app.request(path,{method,body,session:app.session,headers:{Origin:'https://foreign.example'}})).status,403);
    assert.equal((await app.request(path,{method,body:{...body,user_id:'other'},session:app.session})).status,400);
  }
  for(const version of [-1,1.5,'1',null,Number.MAX_SAFE_INTEGER]) assert.equal((await preference(app,'hide',version)).status,400);
  assert.equal((await preference(app,'invalid',0)).status,400);
  assert.equal((await remove(app,todo,1,app.session,'2026-02-30')).status,400);
});

test('0003 preserves old data with null deletion/default source, and preferences survive runtime restart',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'synthetic-todo-preferences-'));let first,next;
  t.after(async()=>{await first?.mf.dispose();await next?.mf.dispose();await rm(directory,{recursive:true,force:true});});
  first=await setup(null,{persist:directory,migrationCount:3});
  const stamp=new Date().toISOString(),todoId=randomUUID(),templateId=randomUUID();
  await first.db.batch([
    first.db.prepare('INSERT INTO matrix_todo_templates(user_id,id,text,created_at,updated_at) VALUES(?,?,?,?,?)').bind(first.userId,templateId,'合成旧模板',stamp,stamp),
    first.db.prepare('INSERT INTO matrix_todos(user_id,id,date,text,completed,version,created_at,updated_at) VALUES(?,?,?,?,1,2,?,?)').bind(first.userId,todoId,day,'迁移前记录',stamp,stamp),
    first.db.prepare('INSERT INTO matrix_todo_template_links(user_id,todo_id,template_id) VALUES(?,?,?)').bind(first.userId,todoId,templateId),
  ]);
  const beforeTodo=await first.db.prepare('SELECT * FROM matrix_todos').first(),beforeLink=await first.db.prepare('SELECT * FROM matrix_todo_template_links').first();
  const originalTables=(await first.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'matrix_%'").all()).results.map(row=>row.name);
  const oldRows=new Map();for(const table of originalTables) oldRows.set(table,(await first.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()).results);
  await applyFixtureMigrations(first.db);await applyFixtureMigrations(first.db);
  assert.deepEqual(await first.db.prepare('SELECT * FROM matrix_todos').first(),{...beforeTodo,deleted_at:null});
  assert.deepEqual(await first.db.prepare('SELECT * FROM matrix_todo_template_links').first(),{...beforeLink,created_with_todo:1});
  for(const table of originalTables.filter(name=>!['matrix_todos','matrix_todo_template_links'].includes(name)))
    assert.deepEqual((await first.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()).results,oldRows.get(table));
  assert.equal((await first.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
  assert.equal((await preference(first,'hide',0)).status,200);
  await first.mf.dispose();first=null;
  next=await setup(null,{persist:directory,bootstrap:false});
  assert.deepEqual((await next.request('/api/v1/todo-preferences',{session:next.session})).data,{completed_mode:'hide',version:1});
  assert.equal((await rows(next)).data.items[0].id,todoId);
});
