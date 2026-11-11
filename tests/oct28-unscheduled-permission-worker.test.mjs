import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture, PASSWORD} from './harness.mjs';
import {publicBusinessRoute} from '../src/public-business.mjs';

async function setup(t) {
  const app=await fixture(t), session=await app.login();
  const owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,
    PUBLIC_BUSINESS_ACCOUNT_IDS:JSON.stringify(['toutiao-haoduoyu'])};
  async function request(path,{method='GET',body,headers={},settings=env,auth}={}) {
    const h=new Headers();
    if(method!=='GET') {h.set('Origin',app.origin);h.set('X-Public-Business','1');}
    if(auth){h.set('Cookie',auth.cookie);h.set('X-CSRF-Token',auth.csrfToken);}
    for(const [name,value] of Object.entries(headers)) value===null?h.delete(name):h.set(name,value);
    if(body!==undefined)h.set('Content-Type','application/json');
    const response=await worker.fetch(new Request(app.origin+'/api/v1'+path,{method,headers:h,
      body:body===undefined?undefined:JSON.stringify(body)}),settings);
    const text=await response.text();let json;try{json=JSON.parse(text);}catch{}
    return {status:response.status,text,data:json?.data};
  }
  return {...app,session,owner,env,call:request};
}
const count=async db=>(await db.prepare('SELECT count(*) AS n FROM matrix_unscheduled_todos').first()).n;

test('anonymous same-origin future todo CRUD is undated, versioned and recoverable',async t=>{
  const f=await setup(t),id=randomUUID(),base='/unscheduled-todos', before=await count(f.db);
  const bad=await f.call(base,{method:'POST',body:{id,text:'合成待办',date:'2026-10-30'}});
  assert.equal(bad.status,400,bad.text);assert.equal(await count(f.db),before);
  const created=await f.call(base,{method:'POST',body:{id,text:'合成待办'}});
  assert.equal(created.status,201,created.text);assert.equal(Object.hasOwn(created.data,'date'),false);
  const single=await f.call(base+'/'+id);assert.equal(single.status,200,single.text);
  assert.equal(Object.hasOwn(single.data,'date'),false);
  const list=await f.call(base);assert.equal(list.status,200,list.text);assert.equal(list.data.items.length,1);
  const changed=await f.call(base+'/'+id,{method:'PATCH',body:{completed:true,version:1}});
  assert.equal(changed.status,200,changed.text);assert.equal(changed.data.version,2);
  const stale=await f.call(base+'/'+id,{method:'PATCH',body:{completed:false,version:1}});assert.equal(stale.status,409);
  const deleted=await f.call(base+'/'+id,{method:'DELETE',body:{version:2}});assert.equal(deleted.status,200,deleted.text);
  assert.ok(deleted.data.deleted_at);assert.deepEqual((await f.call(base)).data.items,[]);
  const restored=await f.call(base+'/'+id+'/restore',{method:'POST',body:{version:3}});
  assert.equal(restored.status,200,restored.text);assert.equal(restored.data.deleted_at,null);
  assert.equal(restored.data.version,4);assert.equal(await count(f.db),before+1);
  assert.equal((await f.db.prepare('SELECT count(*) AS n FROM matrix_todos').first()).n,0);
  assert.equal((await f.call(base+'?date=2026-10-30')).status,400);
});

test('anonymous write requires public mode, same origin and explicit business marker',async t=>{
  const f=await setup(t),base='/unscheduled-todos',before=await count(f.db);
  for(const opt of [
    {headers:{'X-Public-Business':null}},
    {headers:{'X-Public-Business':'wrong'}},
    {headers:{Origin:'https://foreign.invalid'}},
    {headers:{Origin:'null'}},
    {settings:{...f.env,PUBLIC_BUSINESS_MODE:'0'}}
  ]) {
    const result=await f.call(base,{method:'POST',body:{id:randomUUID(),text:'不得写入'},...opt});
    assert.ok([401,403].includes(result.status),result.text);
  }
  assert.equal(await count(f.db),before);
  assert.equal((await f.call(base,{settings:{...f.env,PUBLIC_BUSINESS_MODE:'0'}})).status,401);
});

test('other session cannot read or modify anonymous owner future tasks',async t=>{
  const f=await setup(t),id=randomUUID(),base='/unscheduled-todos';
  const created=await f.call(base,{method:'POST',body:{id,text:'公共用户事项'}});
  assert.equal(created.status,201,created.text);
  const other=randomUUID(), username='synthetic-other-'+other;
  await f.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,created_at FROM matrix_users WHERE id=?')
    .bind(other,username,f.owner).run();
  const login=await f.request('/api/v1/auth/login',{method:'POST',body:{username,password:PASSWORD}});
  assert.equal(login.status,200,login.text);
  const auth={cookie:login.headers.get('set-cookie').split(';')[0],csrfToken:login.data.csrfToken};
  const detail=await f.call(base+'/'+id,{auth});assert.equal(detail.status,404,detail.text);
  const write=await f.call(base+'/'+id,{method:'PATCH',auth,body:{completed:true,version:1}});
  assert.equal(write.status,404,write.text);
  const after=await f.call(base+'/'+id);assert.equal(after.data.completed,false);assert.equal(after.data.version,1);
  assert.deepEqual((await f.call(base,{auth})).data.items,[]);
});

test('public allowlist does not expand to private routes, malformed future paths or arbitrary methods',async t=>{
  const f=await setup(t),id=randomUUID(),before=await count(f.db);
  for(const [route,method] of [['/api-keys','GET'],['/auth/password','PUT'],
    ['/unscheduled-todos/'+id+'/restore/extra','POST'],['/unscheduled-todos/../../api-keys','DELETE'],
    ['/unscheduled-todos/'+id,'PUT'],['/unscheduled-todos','DELETE']]) {
    assert.equal(publicBusinessRoute(route,method),false,route+' '+method);
    const response=await f.call(route,{method,...(method==='GET'?{}:{body:{}})});
    assert.ok([400,401,403,404].includes(response.status),response.text);
  }
  assert.equal(await count(f.db),before);
});
