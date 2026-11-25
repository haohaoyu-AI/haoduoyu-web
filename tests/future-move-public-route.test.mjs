import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {traceRoute} from '../src/lib/request-trace.mjs';
import {beijingDay} from '../src/lib/time.mjs';

test('public future move uses the existing same-origin and public-write boundary',async t=>{
  const app=await fixture(t),session=await app.login();
  const owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,
    PUBLIC_BUSINESS_ACCOUNT_IDS:JSON.stringify(['toutiao-haoduoyu'])};
  const call=async(path,{method='GET',body,headers={},settings=env}={})=>{
    const h=new Headers(headers);
    if(body!==undefined)h.set('Content-Type','application/json');
    const res=await worker.fetch(new Request(app.origin+'/api/v1'+path,{method,headers:h,
      ...(body===undefined?{}:{body:JSON.stringify(body)})}),settings);
    return {status:res.status,body:await res.json()};
  };
  const id=randomUUID(),origin={Origin:app.origin,'X-Public-Business':'1'};
  assert.equal(traceRoute(`/api/v1/unscheduled-todos/${id}/move`),'/api/v1/unscheduled-todos/{id}/move');
  const created=await call('/unscheduled-todos',{method:'POST',body:{id,text:'synthetic future'},headers:origin});
  assert.equal(created.status,201);
  const move={date:'2026-11-20',version:created.body.data.version};
  assert.equal((await call(`/unscheduled-todos/${id}/move`,{method:'POST',body:move,headers:{Origin:app.origin}})).status,403);
  assert.equal((await call(`/unscheduled-todos/${id}/move`,{method:'POST',body:move,
    headers:{Origin:'https://other.invalid','X-Public-Business':'1'}})).status,403);
  const before=await app.db.prepare('SELECT deleted_at FROM matrix_unscheduled_todos WHERE user_id=? AND id=?').bind(owner,id).first();
  assert.equal(before.deleted_at,null);
  const moved=await call(`/unscheduled-todos/${id}/move`,{method:'POST',body:move,headers:origin});
  assert.equal(moved.status,200);assert.equal(moved.body.data.todo.id,id);assert.equal(moved.body.data.todo.date,move.date);
  assert.ok(moved.body.data.source.deleted_at);
  assert.equal((await call(`/unscheduled-todos/${id}/move`,{method:'POST',body:move,headers:origin})).status,200);
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_todos WHERE user_id=? AND id=?').bind(owner,id).first()).n,1);
  assert.equal((await call(`/unscheduled-todos/${randomUUID()}/move`,{method:'POST',body:move,headers:origin,
    settings:{...env,PUBLIC_BUSINESS_MODE:'0'}})).status,401);
  const completeId=randomUUID(), completePath=`/unscheduled-todos/${completeId}/complete-today`;
  assert.equal(traceRoute('/api/v1'+completePath),'/api/v1/unscheduled-todos/{id}/complete-today');
  assert.equal((await call('/unscheduled-todos',{method:'POST',body:{id:completeId,text:'synthetic completion'},headers:origin})).status,201);
  const body={date:beijingDay(Date.now()),version:1};
  assert.ok([401,403].includes((await call(completePath,{method:'POST',body,headers:{Origin:app.origin}})).status));
  const result=await call(completePath,{method:'POST',body,headers:origin});
  assert.equal(result.status,200);assert.equal(result.body.data.todo.completed,true);assert.equal(result.body.data.todo.date,body.date);
  assert.equal((await call(completePath,{method:'POST',body,headers:origin})).status,200);
});
