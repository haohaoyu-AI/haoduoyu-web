import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fixture} from './harness.mjs';
import {handleUnscheduledTodos} from '../src/unscheduled-todos.mjs';
import {registerPublicBusiness} from '../src/business-access.mjs';

async function setup(t) {
  const app=await fixture(t,{migrationCount:9}),session=await app.login();
  const sql=await readFile(new URL('../drizzle/0009_unscheduled_todos.sql',import.meta.url),'utf8');
  await app.db.batch(sql.split('--> statement-breakpoint').map(part=>app.db.prepare(part.trim())));
  const call=async (route,{method='GET',body,headers={},db=app.db}={})=>{
    const request=new Request(app.origin+'/api/v1'+route,{method,headers:{Cookie:session.cookie,Origin:app.origin,
      'X-CSRF-Token':session.csrfToken,...(body?{'Content-Type':'application/json'}:{}),...headers},
      ...(body?{body:JSON.stringify(body)}:{})});
    const response=await handleUnscheduledTodos(db,request,route,app.origin);
    return {status:response.status,...await response.json()};
  };
  const create=async (text='Synthetic task')=>{
    const id=randomUUID(),result=await call('/unscheduled-todos',{method:'POST',body:{id,text}});
    assert.equal(result.status,201);return result.data;
  };
  const move=(id,date,version,db=app.db)=>call(`/unscheduled-todos/${id}/move`,{method:'POST',body:{date,version},db});
  const source=async id=>app.db.prepare('SELECT * FROM matrix_unscheduled_todos WHERE id=?').bind(id).first();
  const target=async id=>app.db.prepare('SELECT * FROM matrix_todos WHERE id=?').bind(id).first();
  return {app,session,call,create,move,source,target};
}

test('move atomically creates one dated item, removes source from list, preserves completion and replays',async t=>{
  const x=await setup(t),original=await x.create();
  const completed=await x.call(`/unscheduled-todos/${original.id}`,{method:'PATCH',body:{completed:true,version:1}});
  const moved=await x.move(original.id,'2026-11-20',completed.data.version);
  assert.equal(moved.status,200);assert.equal(moved.data.todo.id,original.id);
  assert.equal(moved.data.todo.date,'2026-11-20');assert.equal(moved.data.todo.text,original.text);
  assert.equal(moved.data.todo.completed,true);assert.equal(moved.data.source.version,completed.data.version+1);
  assert.ok(moved.data.source.deleted_at);assert.deepEqual((await x.call('/unscheduled-todos')).data.items,[]);
  const replay=await x.move(original.id,'2026-11-20',completed.data.version);
  assert.equal(replay.status,200);assert.equal(replay.data.todo.id,original.id);
  assert.equal((await x.app.db.prepare('SELECT count(*) AS n FROM matrix_todos WHERE id=?').bind(original.id).first()).n,1);
  assert.equal((await x.source(original.id)).version,completed.data.version+1);
});

test('invalid date, stale version, different target date and mismatched existing todo retain source',async t=>{
  const x=await setup(t),a=await x.create('A'),b=await x.create('B');
  await assert.rejects(x.move(a.id,'2026-02-30',a.version),e=>e.status===400);
  await assert.rejects(x.move(a.id,'2026-11-20',a.version+1),e=>e.status===409);
  assert.equal((await x.source(a.id)).deleted_at,null);assert.equal(await x.target(a.id),null);
  const result=await x.app.request('/api/v1/todos',{method:'POST',session:x.session,body:{id:b.id,date:'2026-11-20',text:'Different'}});
  assert.equal(result.status,201);
  await assert.rejects(x.move(b.id,'2026-11-20',b.version),e=>e.status===409);
  await assert.rejects(x.move(b.id,'2026-11-21',b.version),e=>e.status===409);
  assert.equal((await x.source(b.id)).deleted_at,null);assert.equal((await x.target(b.id)).text,'Different');
});

test('compatible old copy is reused only when clicked, without changing other duplicates',async t=>{
  const x=await setup(t),a=await x.create('Existing copy'),b=await x.create('Unrelated duplicate');
  const existing=await x.app.request('/api/v1/todos',{method:'POST',session:x.session,body:{id:a.id,date:'2026-11-20',text:a.text}});
  const other=await x.app.request('/api/v1/todos',{method:'POST',session:x.session,body:{id:b.id,date:'2026-11-20',text:b.text}});
  assert.equal(existing.status,201);assert.equal(other.status,201);
  const moved=await x.move(a.id,'2026-11-20',a.version);
  assert.equal(moved.status,200);assert.ok((await x.source(a.id)).deleted_at);
  assert.equal((await x.source(b.id)).deleted_at,null);assert.equal((await x.target(b.id)).deleted_at,null);
});

test('a deleted or differently completed old copy cannot erase the source',async t=>{
  const x=await setup(t),a=await x.create('Deleted target'),b=await x.create('Different completion');
  const first=await x.app.request('/api/v1/todos',{method:'POST',session:x.session,body:{id:a.id,date:'2026-11-20',text:a.text}});
  const second=await x.app.request('/api/v1/todos',{method:'POST',session:x.session,body:{id:b.id,date:'2026-11-20',text:b.text}});
  assert.equal(first.status,201);assert.equal(second.status,201);
  assert.equal((await x.app.request(`/api/v1/todos/${a.id}`,{method:'DELETE',session:x.session,body:{date:'2026-11-20',version:1}})).status,200);
  assert.equal((await x.app.request(`/api/v1/todos/${b.id}`,{method:'PATCH',session:x.session,body:{completed:true,version:1}})).status,200);
  await assert.rejects(x.move(a.id,'2026-11-20',a.version),e=>e.status===410);
  await assert.rejects(x.move(b.id,'2026-11-20',b.version),e=>e.status===409);
  assert.equal((await x.source(a.id)).deleted_at,null);assert.equal((await x.source(b.id)).deleted_at,null);
});

test('concurrent choices for different dates cannot create duplicate destinations',async t=>{
  const x=await setup(t),a=await x.create();
  const results=await Promise.allSettled([x.move(a.id,'2026-11-20',a.version),x.move(a.id,'2026-11-21',a.version)]);
  assert.equal(results.filter(result=>result.status==='fulfilled'&&result.value.status===200).length,1);
  assert.equal(results.filter(result=>result.status==='rejected'&&[409,410].includes(result.reason.status)).length,1);
  assert.ok((await x.source(a.id)).deleted_at);
  assert.equal((await x.app.db.prepare('SELECT count(*) AS n FROM matrix_todos WHERE id=?').bind(a.id).first()).n,1);
});

test('D1 failure after insertion rolls back both target and source, keeping retry possible',async t=>{
  const x=await setup(t),a=await x.create();
  await x.app.db.prepare("CREATE TRIGGER synthetic_move_failure BEFORE UPDATE ON matrix_unscheduled_todos BEGIN SELECT RAISE(ABORT,'synthetic move failure'); END").run();
  await assert.rejects(x.move(a.id,'2026-11-20',a.version),/synthetic move failure/);
  assert.equal((await x.source(a.id)).deleted_at,null);assert.equal(await x.target(a.id),null);
  await x.app.db.prepare('DROP TRIGGER synthetic_move_failure').run();
  assert.equal((await x.move(a.id,'2026-11-20',a.version)).status,200);
});

test('lost response after commit is not replayed blindly and a later retry finds exactly one result',async t=>{
  const x=await setup(t),a=await x.create();let writes=0;
  const db={prepare:x.app.db.prepare.bind(x.app.db),batch:async statements=>{writes++;await x.app.db.batch(statements);throw new Error('Synthetic response lost');}};
  await assert.rejects(x.move(a.id,'2026-11-20',a.version,db),/Synthetic response lost/);
  assert.equal(writes,1);assert.ok((await x.source(a.id)).deleted_at);assert.equal((await x.target(a.id)).date,'2026-11-20');
  const replay=await x.move(a.id,'2026-11-20',a.version);assert.equal(replay.status,200);
  assert.equal((await x.app.db.prepare('SELECT count(*) AS n FROM matrix_todos WHERE id=?').bind(a.id).first()).n,1);
});

test('missing auth, invalid CSRF, expired session and another user cannot move a source',async t=>{
  const x=await setup(t),a=await x.create(),route=`/unscheduled-todos/${a.id}/move`,body={date:'2026-11-20',version:a.version};
  const make=(headers={})=>new Request(x.app.origin+'/api/v1'+route,{method:'POST',headers:{Origin:x.app.origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  await assert.rejects(handleUnscheduledTodos(x.app.db,make(),route,x.app.origin),e=>e.status===401);
  await assert.rejects(handleUnscheduledTodos(x.app.db,make({Cookie:x.session.cookie}),route,x.app.origin),e=>e.status===403);
  const other=make({'X-Public-Business':'1'});
  registerPublicBusiness(other,Object.freeze({id:randomUUID(),kind:'public',actor:'synthetic-other',permissions:['read','write']}));
  await assert.rejects(handleUnscheduledTodos(x.app.db,other,route,x.app.origin),e=>e.status===404);
  assert.equal((await x.source(a.id)).deleted_at,null);assert.equal(await x.target(a.id),null);
  await x.app.db.prepare("UPDATE matrix_sessions SET expires_at='2000-01-01T00:00:00.000Z'").run();
  await assert.rejects(handleUnscheduledTodos(x.app.db,make({Cookie:x.session.cookie,'X-CSRF-Token':x.session.csrfToken}),route,x.app.origin),e=>e.status===401);
  assert.equal((await x.source(a.id)).deleted_at,null);assert.equal(await x.target(a.id),null);
});
