import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {fixture,applyFixtureMigrations,USERNAME} from './harness.mjs';
import {csrfFor,digest} from '../shared/auth.mjs';
import {handleTodoTemplates,templateWindow} from '../src/todo-templates.mjs';
import {shiftDay} from '../src/lib/time.mjs';
import {revision} from '../src/storage.mjs';

const base='/api/v1/todo-templates';
const body=(overrides={})=>({id:randomUUID(),text:'合成常用计划',...overrides});
const create=(app,input,session=app.session)=>app.request(base,{method:'POST',session,body:input});
const change=(app,id,input,method='PATCH',session=app.session)=>app.request(base+'/'+id,{method,session,body:input});
const list=(app,session=app.session)=>app.request(base,{session});
const addTodo=(app,template,overrides={})=>app.request('/api/v1/todos',{method:'POST',session:app.session,
  body:{id:randomUUID(),date:'2026-10-23',text:template.text,template_id:template.id,...overrides}});
async function setup(t,options) {
  const app=await fixture(t,options);app.session=await app.login();
  app.userId=(await app.request('/api/v1/auth/me',{session:app.session})).data.id;return app;
}
async function secondSession(app) {
  const id=randomUUID(),token=randomBytes(32).toString('hex');
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,created_at FROM matrix_users WHERE username=?')
    .bind(id,'synthetic-'+id,USERNAME).run();
  await app.db.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .bind(digest(token),id,new Date(Date.now()+86400000).toISOString()).run();
  return {cookie:'matrix_session='+token,csrfToken:csrfFor(token)};
}
function direct(app,input,method='POST',id='') {
  return new Request(app.origin+base+id,{method,headers:{Cookie:app.session.cookie,
    Origin:app.origin,'X-CSRF-Token':app.session.csrfToken,'Content-Type':'application/json'},body:JSON.stringify(input)});
}
async function facts(app,at) {
  const original=Date.now;Date.now=()=>at;
  try {
    const request=new Request(app.origin+base,{headers:{Cookie:app.session.cookie}});
    return (await (await handleTodoTemplates(app.db,request,'/todo-templates',app.origin)).json()).data;
  } finally {Date.now=original;}
}
async function seedDays(app,templateId,dates,completed=1) {
  const stamp=new Date().toISOString(),ids=[];
  const statements=dates.flatMap(date=>{
    const id=randomUUID();ids.push(id);
    return [app.db.prepare('INSERT INTO matrix_todos(user_id,id,date,text,completed,version,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)')
      .bind(app.userId,id,date,'合成历史事项',completed,stamp,stamp),
    app.db.prepare('INSERT INTO matrix_todo_template_links(user_id,todo_id,template_id) VALUES(?,?,?)').bind(app.userId,id,templateId)];
  });
  if(statements.length) await app.db.batch(statements);
  return ids;
}

test('template CRUD uses UUID replay and CAS while rename and soft delete preserve linked history',async t=>{
  const app=await setup(t),input=body({text:'  合成常用计划  '}),before=await revision(app.db);
  assert.deepEqual((await list(app)).data.items,[]);
  const created=await create(app,input);assert.equal(created.status,201,created.text);
  assert.equal(created.data.text,input.text.trim());assert.equal(created.data.version,1);
  assert.equal(created.data.completed_days,0);assert.equal(created.data.habit_status,'todo');
  const replay=await create(app,{...input,id:input.id.toUpperCase()});
  assert.equal(replay.status,200);assert.deepEqual(replay.data,created.data);assert.equal(await revision(app.db),before+1);
  assert.equal((await create(app,{...input,text:'不同内容'})).json.error.code,'IDEMPOTENCY_CONFLICT');
  const todo=await addTodo(app,created.data);assert.equal(todo.status,201);assert.equal(todo.data.template_id,input.id);
  const renamed=await change(app,input.id,{text:'重命名后的合成计划',version:1});
  assert.equal(renamed.status,200);assert.equal(renamed.data.id,input.id);assert.equal(renamed.data.version,2);
  assert.equal((await change(app,input.id,{text:'迟到改名',version:1})).json.error.code,'VERSION_CONFLICT');
  const complete=await app.request('/api/v1/todos/'+todo.data.id,{method:'PATCH',session:app.session,body:{completed:true,version:1}});
  assert.equal(complete.status,200);assert.equal(complete.data.template_id,input.id);
  const history=await app.db.prepare('SELECT * FROM matrix_todos WHERE user_id=? AND id=?').bind(app.userId,todo.data.id).first();
  assert.equal(history.text,created.data.text);
  const removed=await change(app,input.id,{version:2},'DELETE');assert.equal(removed.status,200);
  assert.deepEqual(removed.data,{id:input.id,deleted:true});assert.deepEqual((await list(app)).data.items,[]);
  const saved=await app.db.prepare('SELECT * FROM matrix_todo_templates WHERE user_id=? AND id=?').bind(app.userId,input.id).first();
  assert.equal(saved.text,renamed.data.text);assert.equal(saved.version,3);assert.ok(saved.deleted_at);
  assert.deepEqual(await app.db.prepare('SELECT * FROM matrix_todos WHERE user_id=? AND id=?').bind(app.userId,todo.data.id).first(),history);
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_todo_template_links').first()).n,1);
  assert.equal((await create(app,input)).status,410);
  assert.equal((await change(app,input.id,{text:'不能复活',version:3})).status,404);
  assert.equal((await addTodo(app,created.data)).status,404);
  const todoReplay=await addTodo(app,created.data,{id:todo.data.id});
  assert.equal(todoReplay.status,200);assert.equal(todoReplay.data.completed,true);
});

test('template ownership isolates all methods, links, repeated UUIDs and error bodies',async t=>{
  const app=await setup(t),other=await secondSession(app),input=body();
  const owned=await create(app,input);assert.equal(owned.status,201);
  assert.deepEqual((await list(app,other)).data.items,[]);
  for(const method of ['PATCH','DELETE']) {
    const payload=method==='PATCH'?{text:'修改他人模板',version:1}:{version:1};
    const denied=await change(app,input.id,payload,method,other);
    const absent=await change(app,randomUUID(),payload,method,other);
    assert.equal(denied.status,404);assert.deepEqual(denied.json,absent.json);
  }
  const cross=await app.request('/api/v1/todos',{method:'POST',session:other,
    body:{id:randomUUID(),date:'2026-10-23',text:'不得跨用户引用',template_id:input.id}});
  assert.equal(cross.status,404);
  const same=await create(app,{...input,text:'另一个用户自己的模板'},other);assert.equal(same.status,201);
  assert.equal((await list(app)).data.items[0].text,input.text);
  const audit=await app.request('/api/v1/audit',{session:app.session});assert.ok(!audit.text.includes(input.text));
});

test('templates reject API keys, anonymous callers and invalid CSRF for create, edit and delete',async t=>{
  const app=await setup(t),input=body();await create(app,input);
  const credential=await app.request('/api/v1/api-keys',{method:'POST',session:app.session,
    body:{name:'Synthetic template denial',account_ids:['toutiao-haoduoyu'],permissions:['read','write']}});
  for(const method of ['GET','POST','PATCH','DELETE']) {
    const path=base+(['PATCH','DELETE'].includes(method)?'/'+input.id:'');
    const payload=method==='GET'?undefined:method==='POST'?body():method==='PATCH'?{text:'new',version:1}:{version:1};
    assert.equal((await app.request(path,{method,body:payload})).status,401);
    for(const session of [undefined,app.session])
      assert.equal((await app.request(path,{method,body:payload,session,token:credential.data.token})).status,403);
    if(method==='GET') continue;
    for(const headers of [{Cookie:app.session.cookie},{Cookie:app.session.cookie,'X-CSRF-Token':'wrong'},
      {Cookie:app.session.cookie,'X-CSRF-Token':app.session.csrfToken,Origin:'https://foreign.example'}]) {
      const failed=await app.request(path,{method,body:payload,headers});
      assert.equal(failed.status,403);assert.equal(failed.json.error.code,'CSRF');
    }
  }
  assert.equal((await list(app)).data.items[0].version,1);
});

test('template fields, linked todo fields and query parameters are strictly validated',async t=>{
  const app=await setup(t),input=body();await create(app,input);
  for(const changes of [{id:'invalid'},{id:null},{text:''},{text:' \n '},{text:3},{text:'x'.repeat(501)},{text:'a\0b'},
    {user_id:'other'},{version:1},{deleted_at:null},{habit_status:'habit'}])
    assert.equal((await create(app,{...input,...changes})).status,400,JSON.stringify(changes));
  assert.equal((await create(app,body({text:'鱼'.repeat(500)}))).status,201);
  for(const version of [0,-1,1.5,'1',null,Number.MAX_SAFE_INTEGER]) {
    assert.equal((await change(app,input.id,{text:'更新',version})).status,400);
    assert.equal((await change(app,input.id,{version},'DELETE')).status,400);
  }
  for(const payload of [{version:1},{text:'更新'},{text:'更新',version:1,user_id:app.userId}])
    assert.equal((await change(app,input.id,payload)).status,400);
  assert.equal((await change(app,input.id,{version:1,text:'不应接受'},'DELETE')).status,400);
  assert.equal((await app.request(base+'?user_id=other',{session:app.session})).status,400);
  assert.equal((await app.request(base+'?x=1',{method:'POST',session:app.session,body:body()})).status,400);
  for(const template_id of [null,'invalid',5]) assert.equal((await addTodo(app,input,{template_id})).status,400);
});

test('template creation and editing remain atomic under concurrent retries and delete races',async t=>{
  const app=await setup(t),input=body(),before=await revision(app.db);
  const results=await Promise.all(Array.from({length:8},()=>create(app,input)));
  assert.equal(results.filter(result=>result.status===201).length,1);
  assert.equal(results.filter(result=>result.status===200).length,7);assert.equal(await revision(app.db),before+1);
  const edit=await Promise.all(['A','B'].map(text=>change(app,input.id,{text,version:1})));
  assert.deepEqual(edit.map(result=>result.status).sort(),[200,409]);
  const race=await Promise.all([change(app,input.id,{text:'竞争改名',version:2}),change(app,input.id,{version:2},'DELETE')]);
  assert.equal(race.filter(result=>result.status===200).length,1);
  assert.ok([404,409].includes(race.find(result=>result.status!==200).status));
  assert.equal(await revision(app.db),before+3);
});

test('template links are part of todo idempotency and roll back with failed writes',async t=>{
  const app=await setup(t),first=(await create(app,body())).data,second=(await create(app,body())).data;
  const todo=await addTodo(app,first);assert.equal(todo.status,201);
  assert.equal((await addTodo(app,second,{id:todo.data.id,text:first.text})).json.error.code,'IDEMPOTENCY_CONFLICT');
  const unlinked=await app.request('/api/v1/todos',{method:'POST',session:app.session,
    body:{id:todo.data.id,date:todo.data.date,text:todo.data.text}});
  assert.equal(unlinked.status,409);
  const before=await revision(app.db),id=randomUUID();
  await app.db.prepare("CREATE TRIGGER synthetic_template_link_failure BEFORE INSERT ON matrix_todo_template_links BEGIN SELECT RAISE(ABORT,'synthetic private link fault'); END").run();
  const failed=await addTodo(app,first,{id});assert.equal(failed.status,500);assert.ok(!failed.text.includes('private link'));
  assert.equal(await revision(app.db),before);
  assert.equal(await app.db.prepare('SELECT id FROM matrix_todos WHERE user_id=? AND id=?').bind(app.userId,id).first(),null);
  await app.db.prepare('DROP TRIGGER synthetic_template_link_failure').run();
  assert.equal((await addTodo(app,first,{id})).status,201);
  await app.db.prepare("CREATE TRIGGER synthetic_template_delete_failure BEFORE UPDATE ON matrix_todo_templates BEGIN SELECT RAISE(ABORT,'synthetic private template fault'); END").run();
  assert.equal((await change(app,first.id,{version:1},'DELETE')).status,500);
  assert.equal((await list(app)).data.items.length,2);
});

test('template writes recheck the session at commit and do not retry unknown commit outcomes',async t=>{
  const app=await setup(t),input=body();let commits=0;
  const lost={prepare:app.db.prepare.bind(app.db),batch:async statements=>{
    commits++;await app.db.batch(statements);throw new Error('Synthetic template response lost');
  }};
  await assert.rejects(handleTodoTemplates(lost,direct(app,input),'/todo-templates',app.origin),/response lost/);
  assert.equal(commits,1);assert.equal((await create(app,input)).status,200);
  const before=await revision(app.db);
  const expired={prepare:app.db.prepare.bind(app.db),batch:async statements=>{
    await app.db.prepare("UPDATE matrix_sessions SET expires_at='2000-01-01T00:00:00.000Z'").run();
    return app.db.batch(statements);
  }};
  await assert.rejects(handleTodoTemplates(expired,direct(app,{version:1},'DELETE','/'+input.id),'/todo-templates/'+input.id,app.origin),error=>error.status===401);
  assert.equal(await revision(app.db),before);
  assert.equal((await app.db.prepare('SELECT deleted_at FROM matrix_todo_templates WHERE id=?').bind(input.id).first()).deleted_at,null);
});

test('habit status uses 21 distinct completed dates in the inclusive Beijing rolling 30-day window',async t=>{
  const app=await setup(t),template=(await create(app,body())).data;
  const today='2026-10-23',at=Date.parse(today+'T04:00:00.000Z');
  const days=Array.from({length:20},(_,index)=>shiftDay(today,-index));
  await seedDays(app,template.id,days);
  let result=await facts(app,at);assert.deepEqual({today:result.today,window_start:result.window_start},{today,window_start:'2026-09-24'});
  assert.equal(result.items[0].completed_days,20);assert.equal(result.items[0].habit_status,'todo');
  const [boundary]=await seedDays(app,template.id,[shiftDay(today,-29)]);
  await seedDays(app,template.id,[shiftDay(today,-30),shiftDay(today,1),today,today]);
  await seedDays(app,template.id,[shiftDay(today,-21)],0);
  result=await facts(app,at);assert.equal(result.items[0].completed_days,21);assert.equal(result.items[0].habit_status,'habit');
  const cancelled=await app.request('/api/v1/todos/'+boundary,{method:'PATCH',session:app.session,body:{completed:false,version:1}});
  assert.equal(cancelled.status,200);
  result=await facts(app,at);assert.equal(result.items[0].completed_days,20);assert.equal(result.items[0].habit_status,'todo');
  const renamed=await change(app,template.id,{text:'仍关联原历史',version:1});assert.equal(renamed.status,200);
  assert.equal((await facts(app,at)).items[0].completed_days,20);
});

test('multiple completions on one day count once and unchecking only the last completed item removes that day',async t=>{
  const app=await setup(t),template=(await create(app,body())).data,day='2026-10-23',at=Date.parse(day+'T04:00:00.000Z');
  const ids=await seedDays(app,template.id,[day,day]);
  assert.equal((await facts(app,at)).items[0].completed_days,1);
  for(const [index,id] of ids.entries()) {
    assert.equal((await app.request('/api/v1/todos/'+id,{method:'PATCH',session:app.session,body:{completed:false,version:1}})).status,200);
    assert.equal((await facts(app,at)).items[0].completed_days,index===0?1:0);
  }
});

test('Beijing midnight drops day minus 30, admits the new today and recalculates habit status without a job',async t=>{
  const app=await setup(t),oldToday='2026-10-23',before=Date.parse('2026-10-23T15:59:59.999Z'),after=before+1;
  const falling=(await create(app,body())).data,rising=(await create(app,body())).data;
  const twenty=Array.from({length:20},(_,index)=>shiftDay(oldToday,-index));
  await seedDays(app,falling.id,[...twenty,shiftDay(oldToday,-29)]);
  await seedDays(app,rising.id,[...twenty,shiftDay(oldToday,1)]);
  const previous=await facts(app,before),next=await facts(app,after);
  assert.deepEqual(templateWindow(after),{today:'2026-10-24',window_start:'2026-09-25'});
  assert.equal(previous.items.find(item=>item.id===falling.id).habit_status,'habit');
  assert.equal(next.items.find(item=>item.id===falling.id).habit_status,'todo');
  assert.equal(previous.items.find(item=>item.id===rising.id).habit_status,'todo');
  assert.equal(next.items.find(item=>item.id===rising.id).habit_status,'habit');
});

test('0002 appends template tables while preserving every preexisting schema and row',async t=>{
  const app=await setup(t,{migrationCount:2});
  const stamp=new Date().toISOString();
  await app.db.prepare('INSERT INTO matrix_todos(user_id,id,date,text,completed,version,created_at,updated_at) VALUES(?,?,?,?,1,2,?,?)')
    .bind(app.userId,randomUUID(),'2026-10-22','迁移前已完成记录',stamp,stamp).run();
  const sql="SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE tbl_name LIKE 'matrix_%' ORDER BY name";
  const before=(await app.db.prepare(sql).all()).results,tables=before.filter(row=>row.type==='table').map(row=>row.name),rows=new Map();
  for(const table of tables) rows.set(table,(await app.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()).results);
  await applyFixtureMigrations(app.db,{through:3});await applyFixtureMigrations(app.db,{through:3});
  const after=(await app.db.prepare(sql).all()).results;
  assert.deepEqual(after.filter(row=>!['matrix_todo_templates','matrix_todo_template_links'].includes(row.tbl_name)),before);
  for(const table of tables) assert.deepEqual((await app.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()).results,rows.get(table),table);
  assert.equal((await app.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
  await applyFixtureMigrations(app.db);
  assert.deepEqual((await list(app)).data.items,[]);
});
