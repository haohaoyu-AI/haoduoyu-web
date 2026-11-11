import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fixture} from './harness.mjs';
import {handleUnscheduledTodos} from '../src/unscheduled-todos.mjs';
import {beijingDay} from '../src/lib/time.mjs';
import {planFutureMove,verifyFutureMove} from '../web/pages/unscheduled-todos.mjs';

async function setup(t) {
 const app=await fixture(t,{migrationCount:9}),session=await app.login();
 const sql=await readFile(new URL('../drizzle/0009_unscheduled_todos.sql',import.meta.url),'utf8');
 await app.db.batch(sql.split('--> statement-breakpoint').map(part=>app.db.prepare(part.trim())));
 const call=async(route,method='GET',body)=>{const r=new Request(app.origin+'/api/v1'+route,{method,headers:{Cookie:session.cookie,Origin:app.origin,'X-CSRF-Token':session.csrfToken,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const res=await handleUnscheduledTodos(app.db,r,route,app.origin);return (await res.json()).data;};
 return {app,session,call};
}
test('complete and move is atomic, repeatable, date guarded and preserves unrelated records',async t=>{
 const {app,session,call}=await setup(t),today=beijingDay(Date.now()), yesterday=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 const id=randomUUID(),other=randomUUID(),prior=randomUUID();
 for(const x of [id,other,prior]) await call('/unscheduled-todos','POST',{id:x,text:'synthetic '+x});
 const send=(x,date=today)=>call('/unscheduled-todos/'+x+'/complete-today','POST',{date,version:1});
 await assert.rejects(send(other,yesterday),e=>e.status===409&&e.code==='TODO_DAY_CHANGED');
 assert.equal((await call('/unscheduled-todos/'+other)).deleted_at,null);
 const first=await send(id); assert.equal(first.todo.date,today);assert.equal(first.todo.completed,true);assert.equal(first.source.completed,true);assert.ok(first.source.deleted_at);
 const replay=await send(id);assert.equal(replay.todo.id,id);assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_todos WHERE id=?').bind(id).first()).n,1);
 assert.equal((await call('/unscheduled-todos/'+other)).deleted_at,null);
 const existing=await app.request('/api/v1/todos',{method:'POST',session,body:{id:prior,date:today,text:'synthetic '+prior}});assert.equal(existing.status,201);
 const reused=await send(prior);assert.equal(reused.todo.completed,true);assert.equal(reused.todo.version,2);
});
test('failed source update rolls back completed destination',async t=>{
 const {app,call}=await setup(t),today=beijingDay(Date.now()),id=randomUUID();await call('/unscheduled-todos','POST',{id,text:'synthetic rollback'});
 await app.db.prepare("CREATE TRIGGER synthetic_completion_failure BEFORE UPDATE ON matrix_unscheduled_todos BEGIN SELECT RAISE(ABORT,'synthetic rollback'); END").run();
 await assert.rejects(call('/unscheduled-todos/'+id+'/complete-today','POST',{date:today,version:1}),/synthetic rollback/);
 assert.equal((await call('/unscheduled-todos/'+id)).deleted_at,null);assert.equal(await app.db.prepare('SELECT id FROM matrix_todos WHERE id=?').bind(id).first(),null);
});
test('lost response verifies completed destination; offline readiness never writes',async()=>{
 const id=randomUUID(),date=beijingDay(Date.now()),stamp=new Date().toISOString(),row={id,text:'synthetic',version:1,completed:false,deleted_at:null};
 const source={...row,version:2,completed:true,deleted_at:stamp},todo={...row,date,completed:true,created_at:stamp,updated_at:stamp};let writes=0;
 const services={complete:true,checkReady:async()=>{},move:async()=>{writes++;throw Error('lost response')},readSource:async()=>source,readDay:async()=>({date,items:[todo]})};
 assert.equal((await planFutureMove(row,date,services)).state,'confirmed');assert.equal(writes,1);
 assert.equal((await verifyFutureMove(row,date,services)).state,'confirmed');
 const offline={...services,checkReady:async()=>{throw Object.assign(Error('offline'),{code:'NETWORK_UNAVAILABLE'})}};
 assert.equal((await planFutureMove(row,date,offline)).state,'not_started');assert.equal(writes,1);
});
