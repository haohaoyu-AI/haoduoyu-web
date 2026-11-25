import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';

const prefix='/desktop-sync/v1/todos',scopeRoute='/workbench-snapshot/scope';
const capability='desktop-todo-expected-scope-v1',date='2026-11-18';
const expectedHeader='X-Expected-Workspace-Scope';

async function desktopFixture(t) {
  const app=await fixture(t);
  const session=await app.login();
  const owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,
    PUBLIC_BUSINESS_ACCOUNT_IDS:JSON.stringify(['toutiao-haoduoyu']),DAILY_NOTES_OWNER_ID:owner,MEMOS_OWNER_ID:owner};
  async function send(path,method='GET',body,headers={},settings=env,target=worker) {
    const h=new Headers(headers);
    if(body!==undefined) {
      h.set('Content-Type','application/json');
      if(!h.has('Origin'))h.set('Origin',app.origin);
      if(!h.has('X-Public-Business'))h.set('X-Public-Business','1');
    }
    const result=await target.fetch(new Request(app.origin+'/api/v1'+path,{method,headers:h,
      body:body===undefined?undefined:JSON.stringify(body)}),settings);
    const json=await result.json();
    return {status:result.status,data:json.data,code:json.error?.code};
  }
  const first=await send(scopeRoute);
  assert.equal(first.status,200);
  assert.equal(first.data.write_scope_guard,capability);
  const headers={[expectedHeader]:first.data.scope_id};
  return {app,env,owner,send,headers,write:(path,method,body)=>send(path,method,body,headers)};
}

test('new, replayed, conflicting, noted, deleted and restored dated todos round-trip to the website',async t=>{
  const {send,write,headers}=await desktopFixture(t);
  const id=randomUUID(),body={id,date,text:'Synthetic desktop task'},path=prefix+'/'+id;
  const index=(await send('/workbench-snapshot?window=recent&version=2')).data.index;
  assert.equal(index.write_scope_guard,capability);
  assert.equal(index.scope_id,headers[expectedHeader]);
  assert.ok(Number.isSafeInteger(index.workbench_revision));
  assert.equal(index.workbench_revision,(await send(scopeRoute)).data.workbench_revision);
  // Simulate loss of the response after commit: replay the original UUID and base version.
  assert.equal((await write(prefix,'POST',body)).status,201);
  assert.equal((await write(prefix,'POST',body)).data.version,1);
  assert.ok((await send(scopeRoute)).data.workbench_revision>index.workbench_revision);
  assert.equal((await write(prefix,'POST',{...body,text:'Different task'})).code,'IDEMPOTENCY_CONFLICT');
  assert.equal((await write(path,'PATCH',{version:1,completed:true})).data.version,2);
  assert.equal((await write(path,'PATCH',{version:1,completed:true})).data.version,2);
  assert.equal((await write(path,'PATCH',{version:1,completed:false})).code,'VERSION_CONFLICT');
  const note={version:2,note:'Synthetic note'};
  assert.equal((await write(path+'/note','PATCH',note)).data.version,3);
  assert.equal((await write(path+'/note','PATCH',note)).data.version,3);
  assert.equal((await send('/todos?date='+date)).data.items[0].note,note.note);
  const remove={date,version:3},restore={date,version:4};
  assert.equal((await write(path,'DELETE',remove)).data.version,4);
  assert.ok((await write(path,'DELETE',remove)).data.deleted_at);
  assert.equal((await write(prefix,'POST',body)).code,'TODO_DELETED');
  const archived=(await send('/workbench-snapshot?window=date&version=2&date='+date)).data.data.todos;
  assert.equal(archived[0].source_id,id);
  assert.ok(archived[0].deleted_at);
  assert.equal((await write(path+'/restore','POST',restore)).data.version,5);
  assert.equal((await write(path+'/restore','POST',restore)).data.version,5);
  assert.equal((await write(path,'DELETE',remove)).code,'VERSION_CONFLICT');
  const remote=await send('/todos/'+id,'PATCH',{completed:false,version:5});
  assert.equal(remote.data.version,6);
  assert.equal((await write(path+'/note','PATCH',{note:'Concurrent desktop edit',version:5})).code,'VERSION_CONFLICT');
  const stored=(await send('/todos?date='+date)).data.items;
  assert.equal(stored.length,1);
  assert.equal(stored[0].completed,false);
  assert.equal(stored[0].note,note.note);
});

test('guard rejects missing and wrong scope, foreign origins, credentials, template creation and future-note fallback',async t=>{
  const {send,headers,write,env,app}=await desktopFixture(t);
  const id=randomUUID(),body={id,date,text:'Synthetic target'};
  assert.equal((await send(prefix,'POST',body)).code,'DESKTOP_SCOPE_GUARD_REQUIRED');
  assert.equal((await send(prefix,'POST',body,{[expectedHeader]:'0'.repeat(64)})).code,'WORKSPACE_SCOPE_MISMATCH');
  assert.equal((await send(prefix,'POST',body,{...headers,'X-Public-Business':'0'})).status,403);
  assert.equal((await send(prefix,'POST',body,{...headers,Origin:'https://example.invalid'})).status,403);
  assert.equal((await send(prefix,'POST',body,{...headers,Cookie:'matrix_session=invalid'})).code,'DESKTOP_PUBLIC_ONLY');
  assert.equal((await send(prefix,'POST',body,headers,{...env,PUBLIC_BUSINESS_MODE:'0'})).code,'DESKTOP_PUBLIC_ONLY');
  const owner2=randomUUID();
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,created_at FROM matrix_users LIMIT 1')
    .bind(owner2,'synthetic-other-'+owner2).run();
  assert.equal((await send(prefix,'POST',body,headers,{...env,PUBLIC_BUSINESS_USER_ID:owner2})).code,'WORKSPACE_SCOPE_MISMATCH');
  assert.equal((await send(prefix,'POST',body,headers,{...env,MEMOS_OWNER_ID:owner2})).code,'WORKSPACE_SCOPE_MISMATCH');
  assert.equal((await write(prefix,'POST',{...body,template_id:randomUUID()})).status,400);
  assert.equal((await send('/unscheduled-todos','POST',{id,text:'Synthetic future item'})).status,201);
  assert.equal((await write(prefix+'/'+id+'/note','PATCH',{version:1,note:'Wrong family'})).code,'NOT_FOUND');
  assert.equal((await write('/desktop-sync/v1/unscheduled-todos','POST',{id,text:'No'})).status,404);
  assert.equal((await send('/todos?date='+date)).data.items.length,0);
});

test('scope change between projection and commit rolls back the entire write and is fenced on retry',async t=>{
  const {app,send,headers,env}=await desktopFixture(t);
  let batches=0;
  const racingDb={prepare:sql=>app.db.prepare(sql),async batch(queries) {
    batches++;
    if(batches===1) {
      const add=await send('/accounts','POST',{name:'Synthetic scope change',profile_url:'https://www.toutiao.com/c/user/token/SYNTHETIC_SCOPE_123/'});
      assert.equal(add.status,201);
    }
    return app.db.batch(queries);
  }};
  const body={id:randomUUID(),date,text:'Must not commit into the changed workspace'};
  const result=await send(prefix,'POST',body,headers,{...env,DB:racingDb});
  assert.equal(batches,1);
  assert.equal(result.status,412);
  assert.equal(result.code,'WORKSPACE_SCOPE_MISMATCH');
  assert.equal((await send('/todos?date='+date)).data.items.length,0);
});

test('a rollback Worker cannot apply a queued desktop request to the legacy todo route',
  {skip:!process.env.DESKTOP_SYNC_PRIOR_WORKER},async t=>{
    const prior=(await import(pathToFileURL(process.env.DESKTOP_SYNC_PRIOR_WORKER))).default;
    const {send,env,headers}=await desktopFixture(t);
    const oldScope=await send(scopeRoute,'GET',undefined,{},env,prior);
    assert.equal(oldScope.data.scope_id,headers[expectedHeader]);
    assert.equal(oldScope.data.write_scope_guard,undefined);
    const body={id:randomUUID(),date,text:'Must not reach an unguarded route'};
    const result=await send(prefix,'POST',body,headers,env,prior);
    assert.ok([401,404].includes(result.status));
    assert.equal((await send('/todos?date='+date)).data.items.length,0);
  });
