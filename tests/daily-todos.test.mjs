import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture,applyFixtureMigrations,USERNAME} from './harness.mjs';
import {csrfFor,digest} from '../shared/auth.mjs';
import {handleTodos,todoToday} from '../src/todos.mjs';
import {revision} from '../src/storage.mjs';

const date='2026-10-23';
const input=(changes={})=>({id:randomUUID(),date,text:'完成今天的计划',...changes});
const create=(app,session,body)=>app.request('/api/v1/todos',{method:'POST',session,body});
const update=(app,session,id,body)=>app.request('/api/v1/todos/'+id,{method:'PATCH',session,body});
const list=(app,session,day=date)=>app.request('/api/v1/todos?date='+day,{session});
async function setup(t,options) {
  const app=await fixture(t,options);app.session=await app.login();return app;
}
async function anotherSession(app) {
  const id=randomUUID(),token=randomBytes(32).toString('hex');
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,created_at FROM matrix_users WHERE username=?')
    .bind(id,'synthetic-'+id,USERNAME).run();
  await app.db.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .bind(digest(token),id,new Date(Date.now()+86400000).toISOString()).run();
  return {cookie:'matrix_session='+token,csrfToken:csrfFor(token)};
}
function directRequest(app,body,method='POST',id='') {
  return new Request(app.origin+'/api/v1/todos'+id,{method,headers:{
    Cookie:app.session.cookie,'X-CSRF-Token':app.session.csrfToken,Origin:app.origin,'Content-Type':'application/json',
  },body:JSON.stringify(body)});
}

test('todos create once per user UUID, replay the current item, and keep completion explicit',async t=>{
  const app=await setup(t),body=input({text:'  完成今天的计划  '}),before=await revision(app.db);
  const created=await create(app,app.session,body);
  assert.equal(created.status,201,created.text);
  assert.deepEqual(Object.keys(created.data).sort(),['id','date','text','completed','version','created_at','updated_at','deleted_at'].sort());
  assert.equal(created.data.completed,false);assert.equal(created.data.version,1);
  assert.equal(created.data.text,body.text.trim());assert.equal(await revision(app.db),before+1);
  const replay=await create(app,app.session,{...body,id:body.id.toUpperCase()});
  assert.equal(replay.status,200);assert.deepEqual(replay.data,created.data);
  assert.equal(await revision(app.db),before+1);
  const completed=await update(app,app.session,body.id,{completed:true,version:1});
  assert.equal(completed.status,200);assert.equal(completed.data.completed,true);assert.equal(completed.data.version,2);
  const currentReplay=await create(app,app.session,body);
  assert.deepEqual(currentReplay.data,completed.data);assert.equal(await revision(app.db),before+2);
  const cancelled=await update(app,app.session,body.id,{completed:false,version:2});
  assert.equal(cancelled.status,200);assert.equal(cancelled.data.completed,false);assert.equal(cancelled.data.version,3);
  const late=await update(app,app.session,body.id,{completed:true,version:1});
  assert.equal(late.status,409);assert.equal(late.json.error.code,'VERSION_CONFLICT');
  const repeated=await update(app,app.session,body.id,{completed:false,version:2});
  assert.equal(repeated.status,409);
  const rows=await list(app,app.session);
  assert.deepEqual(rows.data.items,[cancelled.data]);assert.equal(rows.data.date,date);
  for(const changed of [{text:'其他内容'},{date:'2026-10-24'}]) {
    const conflict=await create(app,app.session,{...body,...changed});
    assert.equal(conflict.status,409);assert.equal(conflict.json.error.code,'IDEMPOTENCY_CONFLICT');
  }
});

test('future plans persist only on the chosen date and are readable after creation',async t=>{
  const app=await setup(t),future='2099-01-01',body=input({date:future,text:'提前安排未来计划'});
  const created=await create(app,app.session,body);
  assert.equal(created.status,201,created.text);
  assert.equal(created.data.date,future);
  assert.equal(created.data.completed,false);
  const selected=await list(app,app.session,future);
  assert.equal(selected.status,200,selected.text);
  assert.deepEqual(selected.data.items,[created.data]);
  assert.deepEqual((await list(app,app.session)).data.items,[]);
  const stored=await app.db.prepare('SELECT date,text FROM matrix_todos WHERE user_id=(SELECT id FROM matrix_users WHERE username=?) AND id=?')
    .bind(USERNAME,body.id).first();
  assert.deepEqual(stored,{date:future,text:body.text});
});

test('todos isolate users even when their UUIDs match and do not leak text into global audit',async t=>{
  const app=await setup(t),other=await anotherSession(app),body=input(),privateBody=input({text:'第二用户私密计划'});
  await create(app,app.session,body);
  assert.deepEqual((await list(app,other)).data.items,[]);
  const forbidden=await update(app,other,body.id,{completed:true,version:1});
  assert.equal(forbidden.status,404);assert.equal(forbidden.json.error.code,'NOT_FOUND');
  const same=await create(app,other,{...body,text:'其他用户相同 UUID 的计划'});
  assert.equal(same.status,201);
  await create(app,other,privateBody);
  assert.equal((await list(app,app.session)).data.items.length,1);
  await update(app,other,body.id,{completed:true,version:1});
  assert.equal((await list(app,app.session)).data.items[0].completed,false);
  assert.equal((await list(app,other)).data.items.length,2);
  const audit=await app.request('/api/v1/audit',{session:app.session});
  assert.ok(!audit.text.includes(privateBody.text));assert.ok(!audit.text.includes(body.text));
});

test('todos require sessions and existing same-origin CSRF protection for both write methods',async t=>{
  const app=await setup(t),body=input();
  for(const [path,method,payload] of [['/api/v1/todos','GET'],['/api/v1/todos','POST',body],['/api/v1/todos/'+body.id,'PATCH',{completed:true,version:1}]]) {
    assert.equal((await app.request(path,{method,body:payload})).status,401);
  }
  const key=await app.request('/api/v1/api-keys',{method:'POST',session:app.session,
    body:{name:'Synthetic todo denial',account_ids:['toutiao-haoduoyu'],permissions:['read','write']}});
  assert.equal(key.status,201);
  for(const method of ['GET','POST','PATCH']) {
    const path='/api/v1/todos'+(method==='PATCH'?'/'+body.id:'');
    const payload=method==='POST'?body:method==='PATCH'?{completed:true,version:1}:undefined;
    for(const session of [undefined,app.session]) {
      const denied=await app.request(path,{method,body:payload,token:key.data.token,session});
      assert.equal(denied.status,403);assert.equal(denied.json.error.code,'FORBIDDEN');
    }
  }
  await create(app,app.session,body);
  for(const method of ['POST','PATCH']) for(const headers of [
    {Cookie:app.session.cookie},
    {Cookie:app.session.cookie,'X-CSRF-Token':'wrong'},
    {Cookie:app.session.cookie,'X-CSRF-Token':app.session.csrfToken,Origin:'https://foreign.example'},
    {Cookie:app.session.cookie,'X-CSRF-Token':app.session.csrfToken,Origin:''},
  ]) {
    const path='/api/v1/todos'+(method==='PATCH'?'/'+body.id:'');
    const denied=await app.request(path,{method,body:method==='POST'?input():{completed:true,version:1},headers});
    assert.equal(denied.status,403);assert.equal(denied.json.error.code,'CSRF');
  }
  assert.equal((await list(app,app.session)).data.items.length,1);
  assert.equal((await list(app,app.session)).data.items[0].completed,false);
});

test('todos strictly validate dates, UUIDs, exact fields, text length, boolean and versions',async t=>{
  const app=await setup(t),body=input();
  const invalidDates=['','2026-2-01','2026-02-29','2026-04-31','2026-13-01','0000-01-01','2026-10-23T00:00:00Z'];
  for(const day of invalidDates) {
    const result=await list(app,app.session,encodeURIComponent(day));
    assert.equal(result.status,400,result.text);
    assert.equal((await create(app,app.session,{...body,date:day})).status,400);
  }
  for(const query of ['?date='+date+'&date='+date,'?user_id=another','?date='+date+'&extra=1'])
    assert.equal((await app.request('/api/v1/todos'+query,{session:app.session})).status,400);
  for(const change of [{text:''},{text:' \n '},{text:1},{text:'x'.repeat(501)},{text:'a\0b'},
    {id:'not-a-uuid'},{id:'00000000-0000-0000-0000-000000000000'},{id:1},{user_id:'another'},{completed:true},{version:1}])
    assert.equal((await create(app,app.session,{...body,...change})).status,400,JSON.stringify(change));
  for(const field of ['id','date','text']) {
    const missing={...body};delete missing[field];assert.equal((await create(app,app.session,missing)).status,400);
  }
  const valid=await create(app,app.session,{...body,date:'2024-02-29',text:'鱼'.repeat(500)});
  assert.equal(valid.status,201);assert.equal(valid.data.text.length,500);
  for(const change of [{completed:1},{completed:'false'},{completed:null},{version:'1'},{version:0},{version:1.5},
    {version:Number.MAX_SAFE_INTEGER},{text:'edited'},{date},{user_id:'another'}])
    assert.equal((await update(app,app.session,body.id,{completed:true,version:1,...change})).status,400);
  for(const bodyValue of [{completed:true},{version:1}])
    assert.equal((await update(app,app.session,body.id,bodyValue)).status,400);
  assert.equal((await update(app,app.session,'not-a-uuid',{completed:true,version:1})).status,400);
  assert.equal((await update(app,app.session,randomUUID(),{completed:true,version:1})).status,404);
  assert.equal((await app.request('/api/v1/todos?date='+date,{method:'POST',session:app.session,body})).status,400);
});

test('concurrent todo creation and CAS preserve exactly one write for one version',async t=>{
  const app=await setup(t),body=input(),before=await revision(app.db);
  const duplicate=await Promise.all(Array.from({length:8},()=>create(app,app.session,body)));
  assert.equal(duplicate.filter(result=>result.status===201).length,1);
  assert.equal(duplicate.filter(result=>result.status===200).length,7);
  assert.equal(new Set(duplicate.map(result=>JSON.stringify(result.data))).size,1);
  assert.equal(await revision(app.db),before+1);
  const toggles=await Promise.all([true,false,true,false].map(completed=>update(app,app.session,body.id,{completed,version:1})));
  assert.equal(toggles.filter(result=>result.status===200).length,1);
  assert.equal(toggles.filter(result=>result.status===409&&result.json.error.code==='VERSION_CONFLICT').length,3);
  assert.equal(await revision(app.db),before+2);
  const conflict=input(),different=await Promise.all(['A','B'].map(text=>create(app,app.session,{...conflict,text})));
  assert.deepEqual(different.map(result=>result.status).sort(),[201,409]);
  assert.equal(different.find(result=>result.status===409).json.error.code,'IDEMPOTENCY_CONFLICT');
});

test('todo database failures roll back data and revision and leave retry possible',async t=>{
  const app=await setup(t),body=input(),before=await revision(app.db);
  await app.db.prepare("CREATE TRIGGER synthetic_todo_insert_failure BEFORE INSERT ON matrix_todos BEGIN SELECT RAISE(ABORT,'synthetic private todo failure'); END").run();
  const failed=await create(app,app.session,body);
  assert.equal(failed.status,500);assert.equal(failed.json.error.code,'INTERNAL_ERROR');
  assert.ok(!failed.text.includes('synthetic private'));assert.equal(await revision(app.db),before);
  assert.deepEqual((await list(app,app.session)).data.items,[]);
  await app.db.prepare('DROP TRIGGER synthetic_todo_insert_failure').run();
  assert.equal((await create(app,app.session,body)).status,201);
  await app.db.prepare("CREATE TRIGGER synthetic_todo_update_failure BEFORE UPDATE ON matrix_todos BEGIN SELECT RAISE(ABORT,'synthetic private todo failure'); END").run();
  assert.equal((await update(app,app.session,body.id,{completed:true,version:1})).status,500);
  assert.equal(await revision(app.db),before+1);
  assert.equal((await list(app,app.session)).data.items[0].completed,false);
  assert.equal((await list(app,app.session)).data.items[0].version,1);
  await app.db.prepare('DROP TRIGGER synthetic_todo_update_failure').run();
  assert.equal((await update(app,app.session,body.id,{completed:true,version:1})).status,200);
});

test('unknown commit outcomes are not blindly retried and UUID retry recovers the saved todo',async t=>{
  const app=await setup(t),body=input(),before=await revision(app.db);let commits=0;
  const db={prepare:app.db.prepare.bind(app.db),batch:async statements=>{
    commits++;await app.db.batch(statements);throw new Error('Synthetic response lost after commit');
  }};
  await assert.rejects(handleTodos(db,directRequest(app,body),'/todos',app.origin),/Synthetic response lost/);
  assert.equal(commits,1);assert.equal(await revision(app.db),before+1);
  const recovered=await create(app,app.session,body);
  assert.equal(recovered.status,200);assert.equal(recovered.data.id,body.id);
  assert.equal((await list(app,app.session)).data.items.length,1);
});

test('session expiry between todo validation and commit rejects the whole mutation',async t=>{
  const app=await setup(t),body=input(),before=await revision(app.db);
  const db={prepare:app.db.prepare.bind(app.db),batch:async statements=>{
    await app.db.prepare("UPDATE matrix_sessions SET expires_at='2000-01-01T00:00:00.000Z'").run();
    return app.db.batch(statements);
  }};
  await assert.rejects(handleTodos(db,directRequest(app,body),'/todos',app.origin),error=>error.status===401&&error.code==='UNAUTHORIZED');
  assert.equal(await revision(app.db),before);
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_todos').first()).n,0);
});

test('Beijing midnight selects a new day while completed and unfinished history remain unchanged',async t=>{
  const app=await setup(t),first=input(),second=input({text:'保留未完成历史'});
  await create(app,app.session,first);await create(app,app.session,second);
  await update(app,app.session,first.id,{completed:true,version:1});
  const before=Date.parse('2026-10-23T15:59:59.999Z'),after=Date.parse('2026-10-23T16:00:00.000Z');
  assert.equal(todoToday(before),'2026-10-23');assert.equal(todoToday(after),'2026-10-24');
  assert.equal(todoToday(Date.parse('2026-12-31T16:00:00.000Z')),'2027-01-01');
  const realNow=Date.now;t.after(()=>{Date.now=realNow;});
  const request=()=>new Request(app.origin+'/api/v1/todos',{headers:{Cookie:app.session.cookie}});
  Date.now=()=>before;
  const today=(await (await handleTodos(app.db,request(),'/todos',app.origin)).json()).data;
  assert.equal(today.date,date);assert.equal(today.items.length,2);
  Date.now=()=>after;
  const tomorrow=(await (await handleTodos(app.db,request(),'/todos',app.origin)).json()).data;
  assert.equal(tomorrow.date,'2026-10-24');assert.equal(tomorrow.today,'2026-10-24');assert.deepEqual(tomorrow.items,[]);
  const historyRequest=new Request(app.origin+'/api/v1/todos?date='+date,{headers:{Cookie:app.session.cookie}});
  const history=(await (await handleTodos(app.db,historyRequest,'/todos',app.origin)).json()).data;
  assert.equal(history.today,'2026-10-24');assert.deepEqual(history.items,today.items);
  assert.deepEqual(history.items.map(value=>value.completed),[true,false]);
});

test('generated todo migration only appends its table and preserves existing rows and schema',async t=>{
  const app=await setup(t,{migrationCount:1});
  // Characterize 0001 on its actual original 13-column article schema, rather
  // than calling the new 30-column article API against a pre-upgrade database.
  await app.db.prepare('INSERT INTO matrix_articles(id,account_id,title,url,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .bind('synthetic-before-todo','toutiao-haoduoyu','迁移前历史记录','https://example.invalid/todo-migration',
      '2026-10-22T00:00:00.000Z','2026-10-22T00:00:00.000Z','2026-10-22T00:00:00.000Z').run();
  await app.db.prepare('CREATE TABLE legacy_todo_sentinel(id TEXT PRIMARY KEY,text TEXT)').run();
  await app.db.prepare("INSERT INTO legacy_todo_sentinel VALUES('synthetic','preserve existing data')").run();
  const schemaQuery="SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE tbl_name LIKE 'matrix_%' OR tbl_name='legacy_todo_sentinel' ORDER BY name";
  const schemas=(await app.db.prepare(schemaQuery).all()).results;
  const tables=schemas.filter(row=>row.type==='table').map(row=>row.name),snapshots=new Map();
  for(const table of tables) snapshots.set(table,(await app.db.prepare('SELECT * FROM "'+table+'" ORDER BY rowid').all()).results);
  const migration=await readFile(new URL('../drizzle/0001_daily_todos.sql',import.meta.url),'utf8');
  assert.match(migration,/^CREATE TABLE `matrix_todos`/);
  assert.ok(!/\b(?:INSERT|DROP|ALTER)\b/i.test(migration));
  await applyFixtureMigrations(app.db,{through:2});await applyFixtureMigrations(app.db,{through:2});
  const after=(await app.db.prepare(schemaQuery).all()).results;
  assert.deepEqual(after.filter(row=>row.tbl_name!=='matrix_todos'),schemas);
  for(const table of tables) assert.deepEqual((await app.db.prepare('SELECT * FROM "'+table+'" ORDER BY rowid').all()).results,snapshots.get(table),table);
  assert.equal((await app.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
  // This additive-todo characterization includes an intentionally unknown user
  // table. Stop before 0005: that migration correctly fails closed on it, as
  // covered independently by the article graph/model boundary tests.
  await applyFixtureMigrations(app.db,{through:5});
  const created=await create(app,app.session,input());assert.equal(created.status,201);
  assert.deepEqual((await app.db.prepare('SELECT * FROM legacy_todo_sentinel').all()).results,snapshots.get('legacy_todo_sentinel'));
});

test('persisted fixtures apply only pending migrations and preserve todo history after restart',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'synthetic-todo-upgrade-'));let first,next,last;
  t.after(async()=>{await first?.mf.dispose();await next?.mf.dispose();await last?.mf.dispose();await rm(directory,{recursive:true,force:true});});
  first=await setup(null,{persist:directory,migrationCount:1});
  const originalUser=await first.db.prepare('SELECT id FROM matrix_users WHERE username=?').bind(USERNAME).first();
  await first.mf.dispose();first=null;
  next=await setup(null,{persist:directory,bootstrap:false});
  assert.deepEqual(await next.db.prepare('SELECT id FROM matrix_users WHERE username=?').bind(USERNAME).first(),originalUser);
  const body=input();await create(next,next.session,body);
  await next.mf.dispose();next=null;
  last=await setup(null,{persist:directory,bootstrap:false});
  const history=await list(last,last.session);assert.equal(history.data.items.length,1);assert.equal(history.data.items[0].id,body.id);
});
