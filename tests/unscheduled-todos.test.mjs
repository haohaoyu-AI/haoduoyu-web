import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fixture} from './harness.mjs';
import {handleUnscheduledTodos} from '../src/unscheduled-todos.mjs';

async function setup(t) {
  const app=await fixture(t),session=await app.login();
  const migration=await readFile(new URL('../drizzle/0009_unscheduled_todos.sql',import.meta.url),'utf8');
  await app.db.batch(migration.split('--> statement-breakpoint').map(sql=>app.db.prepare(sql.trim())));
  async function call(route,{method='GET',body,headers={}}={}) {
    const request=new Request(app.origin+'/api/v1'+route,{method,headers:{Cookie:session.cookie,Origin:app.origin,
      'X-CSRF-Token':session.csrfToken,...(body?{'Content-Type':'application/json'}:{}),...headers},
      ...(body?{body:JSON.stringify(body)}:{})});
    const response=await handleUnscheduledTodos(app.db,request,route,app.origin);
    return {status:response.status,...await response.json()};
  }
  return {app,call};
}
test('undated todo lifecycle is idempotent, versioned, and never creates a dated todo',async t=>{
  const {app,call}=await setup(t),body={id:randomUUID(),text:' 尚未确定日期 '};
  const a=await call('/unscheduled-todos',{method:'POST',body});
  assert.equal(a.status,201);assert.equal(a.data.text,body.text.trim());assert.ok(!Object.hasOwn(a.data,'date'));
  assert.deepEqual((await call('/unscheduled-todos',{method:'POST',body})).data,a.data);
  await assert.rejects(call('/unscheduled-todos',{method:'POST',body:{...body,text:'其他'}}),e=>e.status===409);
  const changed=await call('/unscheduled-todos/'+body.id,{method:'PATCH',body:{completed:true,version:1}});
  assert.equal(changed.data.completed,true);assert.equal(changed.data.version,2);
  await assert.rejects(call('/unscheduled-todos/'+body.id,{method:'PATCH',body:{completed:false,version:1}}),e=>e.status===409);
  const deleted=await call('/unscheduled-todos/'+body.id,{method:'DELETE',body:{version:2}});
  assert.ok(deleted.data.deleted_at);assert.deepEqual((await call('/unscheduled-todos')).data.items,[]);
  assert.deepEqual((await call('/unscheduled-todos/'+body.id,{method:'DELETE',body:{version:2}})).data,deleted.data);
  const restored=await call('/unscheduled-todos/'+body.id+'/restore',{method:'POST',body:{version:3}});
  assert.equal(restored.data.deleted_at,null);assert.equal(restored.data.version,4);
  assert.deepEqual((await call('/unscheduled-todos')).data.items,[restored.data]);
  const existing=await app.db.prepare('SELECT count(*) AS n FROM matrix_todos').first();assert.equal(existing.n,0);
});
test('undated todo rejects a date and invalid data without writes',async t=>{
  const {app,call}=await setup(t),id=randomUUID();
  for(const body of [{id,text:'x',date:'2026-10-28'},{id,text:''},{id:'bad',text:'x'},{id,text:'x'.repeat(501)}])
    await assert.rejects(call('/unscheduled-todos',{method:'POST',body}),e=>e.status===400);
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_unscheduled_todos').first()).n,0);
});
