import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {limitPublicBusiness,publicBusinessRoute} from '../src/public-business.mjs';
import {cloudflareConfig} from '../scripts/cloudflare-config.mjs';

async function publicApp(t) {
  const app=await fixture(t), session=await app.login();
  const owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,
    PUBLIC_BUSINESS_ACCOUNT_IDS:JSON.stringify(['toutiao-haoduoyu'])};
  async function request(path,{method='GET',body,headers={},settings=env}={}) {
    const h=new Headers(headers);
    if(method!=='GET') {h.set('Origin',app.origin);h.set('X-Public-Business','1');}
    for(const [key,value] of Object.entries(headers)) {if(value===null)h.delete(key);else h.set(key,value);}
    if(body!==undefined)h.set('Content-Type','application/json');
    const response=await worker.fetch(new Request(app.origin+'/api/v1'+path,{method,headers:h,
      body:body===undefined?undefined:JSON.stringify(body)}),settings);
    const text=await response.text();let json;try{json=JSON.parse(text);}catch{}
    return {status:response.status,headers:response.headers,text,json,data:json?.data};
  }
  return {...app,owner,session,env,publicRequest:request};
}
const article=()=>({account_id:'toutiao-haoduoyu',title:'合成公开文章',url:'https://example.invalid/'+randomUUID(),
  published_at:'2026-10-23T00:00:00.000Z',notes:'合成业务备注'});

test('public mode is explicit, owner-bound, credential-free and reversible',async t=>{
  const app=await publicApp(t),read=app.publicRequest;
  const me=await read('/auth/me');
  assert.deepEqual(me.data,{id:'public-business',username:'公开编辑',publicBusiness:true});
  assert.equal(me.headers.get('Set-Cookie'),null);
  assert.ok(!me.text.includes(app.owner));
  const accounts=await read('/accounts');assert.deepEqual(accounts.data.map(row=>row.id),['toutiao-haoduoyu']);
  assert.equal((await read('/auth/me',{settings:{...app.env,PUBLIC_BUSINESS_MODE:'0'}})).status,401);
  assert.equal((await read('/accounts',{settings:{...app.env,PUBLIC_BUSINESS_USER_ID:undefined}})).status,503);
  assert.equal((await read('/accounts',{settings:{...app.env,PUBLIC_BUSINESS_ACCOUNT_IDS:undefined}})).status,503);
  assert.equal((await read('/accounts',{settings:{...app.env,PUBLIC_BUSINESS_USER_ID:randomUUID()}})).status,503);
  const privateMe=await app.request('/api/v1/auth/me',{session:app.session});
  assert.equal(privateMe.data.id,app.owner);assert.ok(privateMe.data.csrfToken);
});

test('anonymous todo CRUD, templates and preferences use only the selected owner',async t=>{
  const app=await publicApp(t),read=app.publicRequest,id=randomUUID(),template=randomUUID(),other=randomUUID();
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,created_at FROM matrix_users LIMIT 1')
    .bind(other,'synthetic-other-'+other).run();
  await app.db.prepare('INSERT INTO matrix_todos(user_id,id,date,text,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .bind(other,id,'2026-10-24','OTHER-USER-PRIVATE-CANARY','2026-10-24','2026-10-24').run();
  const date='2026-10-24';
  assert.deepEqual((await read('/todos?date='+date)).data.items,[]);
  assert.equal((await read('/todos/'+id,{method:'DELETE',body:{date,version:1}})).status,404);
  assert.equal((await read('/todo-templates',{method:'POST',body:{id:template,text:'公开模板'}})).status,201);
  assert.equal((await read('/todos',{method:'POST',body:{id,date,text:'公开待办',template_id:template}})).status,201);
  assert.equal((await read('/todos/'+id,{method:'PATCH',body:{completed:true,version:1}})).status,200);
  assert.equal((await read('/todos/'+id,{method:'PATCH',body:{completed:false,version:1}})).status,409);
  assert.equal((await read('/todos/'+id,{method:'DELETE',body:{date,version:2}})).status,200);
  assert.deepEqual((await read('/todos?date='+date)).data.items,[]);
  assert.equal((await read('/todos/'+id+'/restore',{method:'POST',body:{date,version:3}})).status,200);
  assert.equal((await read('/todo-preferences',{method:'PATCH',body:{completed_mode:'hide',version:0}})).status,200);
  const result=await read('/todos?date='+date);
  assert.equal(result.data.completed_mode,'hide');assert.equal(result.data.items.length,1);
  assert.ok(!result.text.includes(other));assert.ok(!result.text.includes('OTHER-USER-PRIVATE-CANARY'));
  assert.equal((await app.db.prepare('SELECT text FROM matrix_todos WHERE user_id=? AND id=?').bind(other,id).first()).text,
    'OTHER-USER-PRIVATE-CANARY');
  assert.equal((await read('/todos?date='+date,{settings:{...app.env,PUBLIC_BUSINESS_MODE:'0'}})).status,401);
  const restored=await app.request('/api/v1/todos?date='+date,{session:app.session});
  assert.equal(restored.status,200);assert.equal(restored.data.items[0].text,'公开待办');
});

test('public business edits are account-scoped, new public accounts stay visible, and attribution is redacted',async t=>{
  const app=await publicApp(t),read=app.publicRequest;
  const privateArticle=await app.request('/api/v1/articles',{method:'POST',session:app.session,
    body:{...article(),account_id:'zhihu-haoduoyu',title:'OTHER-ACCOUNT-PRIVATE-CANARY'}});
  const denied=await read('/articles/'+privateArticle.data.id);assert.equal(denied.status,404);
  assert.equal((await read('/articles',{method:'POST',body:{...article(),account_id:'zhihu-haoduoyu'}})).status,404);
  assert.equal((await read('/accounts/zhihu-haoduoyu',{method:'PUT',body:{name:'MUST NOT CHANGE'}})).status,404);
  const created=await read('/articles',{method:'POST',body:article()});assert.equal(created.status,201,created.text);
  const id=created.data.id;
  assert.equal((await read('/articles/'+id,{method:'PUT',body:{version:1,notes:'匿名可更新'}})).status,200);
  const detail=await read('/articles/'+id);assert.equal(detail.data.notes,'匿名可更新');
  assert.deepEqual(detail.data.recorded_by,{actor:'public',label:'公开业务编辑',at:detail.data.recorded_by.at});
  assert.ok(!detail.text.includes(app.owner));assert.ok(!detail.text.includes('synthetic-admin'));
  const csv=await read('/export');assert.equal(csv.status,200);assert.ok(!csv.text.includes('OTHER-ACCOUNT-PRIVATE-CANARY'));
  const account=await read('/accounts',{method:'POST',body:{name:'公开新增账号',platform:'other'}});
  assert.equal(account.status,201);
  assert.ok((await read('/accounts')).data.some(row=>row.id===account.data.id));
  assert.equal((await read('/articles',{method:'POST',body:{...article(),account_id:account.data.id}})).status,201);
});

test('public access cannot authenticate to management, keys, raw backups or security routes',async t=>{
  const app=await publicApp(t),read=app.publicRequest;
  for(const [path,method,body] of [['/audit','GET'],['/backup','GET'],['/api-keys','GET'],
    ['/api-keys','POST',{name:'MUST NOT EXIST',account_ids:['toutiao-haoduoyu'],permissions:['read']}],
    ['/api-keys/'+randomUUID(),'DELETE'],['/auth/password','PUT',{currentPassword:'x',newPassword:'x'}],
    ['/auth/logout','POST'],['/bootstrap','POST',{}],['/security','GET']]) {
    const result=await read(path,{method,body});
    assert.ok([401,404].includes(result.status),path+': '+result.text);
    for(const marker of ['password_hash','token_hash','matrix_session','synthetic-admin']) assert.ok(!result.text.includes(marker));
  }
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_api_keys').first()).n,0);
  assert.equal(publicBusinessRoute('/auth/password','PUT'),false);
  assert.equal(publicBusinessRoute('/todos/../../api-keys','DELETE'),false);
});

test('public business deletion is scoped, versioned, atomic and replayable without touching other accounts',async t=>{
  const app=await publicApp(t),read=app.publicRequest;
  const created=await read('/articles',{method:'POST',body:article()}),id=created.data.id;
  const snapshot=await read('/observations',{method:'POST',body:{article_id:id,kind:'latest',as_of:'2026-10-24T00:00:00Z',
    metrics:{reads:0},source:'synthetic-public'}});
  assert.equal(snapshot.status,201,snapshot.text);
  assert.equal((await read('/accounts/toutiao-haoduoyu',{method:'DELETE',body:{id:'toutiao-haoduoyu'}})).status,409);
  assert.equal((await read('/articles/'+id,{method:'DELETE',body:{version:99}})).status,409);
  assert.equal((await read('/articles/'+id,{method:'DELETE',body:{version:1}})).status,200);
  assert.equal((await read('/articles/'+id,{method:'DELETE',body:{version:1}})).status,200);
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_observations WHERE article_id=?').bind(id).first()).n,0);
  assert.equal((await read('/accounts/zhihu-haoduoyu',{method:'DELETE',body:{id:'zhihu-haoduoyu'}})).status,404);
  assert.equal((await read('/accounts/toutiao-haoduoyu',{method:'DELETE',body:{id:'toutiao-haoduoyu'}})).status,200);
  assert.equal((await read('/accounts/toutiao-haoduoyu',{method:'DELETE',body:{id:'toutiao-haoduoyu'}})).status,200);
  assert.deepEqual((await read('/accounts')).data,[]);
  assert.equal((await read('/accounts',{method:'POST',body:{name:'公开重新新增',platform:'other'}})).status,201);
  assert.equal((await app.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
});

test('anonymous writes preserve origin/header checks, bounded bodies, validation and restore fencing',async t=>{
  const app=await publicApp(t),read=app.publicRequest,body={id:randomUUID(),date:'2026-10-24',text:'合成公开待办'};
  for(const headers of [{Origin:null},{Origin:'https://foreign.invalid'},{Origin:'null'},
    {'X-Public-Business':null},{'X-Public-Business':'wrong'}])
    assert.equal((await read('/todos',{method:'POST',body,headers})).status,403);
  assert.equal((await read('/todos',{method:'POST',body:{...body,text:'x'.repeat(17000)}})).status,413);
  assert.equal((await read('/todos',{method:'POST',body:{...body,text:''}})).status,400);
  assert.equal((await read('/overview?period=7d&period=30d')).status,400);
  await app.db.prepare('UPDATE matrix_control SET initialized=2 WHERE id=1').run();
  assert.equal((await read('/todos',{method:'POST',body})).status,503);
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_todos').first()).n,0);
});

test('public per-isolate request, write and daily limits are bounded',()=>{
  const key=randomUUID(),time=Date.parse('2026-10-24T01:00:00Z');
  for(let i=0;i<20;i++)limitPublicBusiness(key,true,time);
  assert.throws(()=>limitPublicBusiness(key,true,time),error=>error.status===429);
  limitPublicBusiness(key,true,time+60000);
  const reads=randomUUID();for(let i=0;i<60;i++)limitPublicBusiness(reads,false,time);
  assert.throws(()=>limitPublicBusiness(reads,false,time),error=>error.status===429);
  const daily=randomUUID();for(let i=0;i<1000;i++)limitPublicBusiness(daily,false,time+Math.floor(i/60)*60000);
  assert.throws(()=>limitPublicBusiness(daily,false,time+20*60000),error=>error.status===429);
  limitPublicBusiness(daily,false,time+86400000);
});

test('varying spoofed peer headers cannot bypass the anonymous write limiter',async t=>{
  const app=await publicApp(t);
  for(let i=0;i<21;i++) {
    const result=await app.publicRequest('/todos',{method:'POST',body:{id:randomUUID(),date:'2026-10-24',text:''},
      headers:{'CF-Connecting-IP':'192.0.2.'+(i+1),'X-Forwarded-For':'198.51.100.'+(i+1)}});
    assert.equal(result.status,i<20?400:429);
  }
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_todos').first()).n,0);
});

test('public deletion rolls back dependent business rows if audit persistence fails',async t=>{
  const app=await publicApp(t),read=app.publicRequest;
  const created=await read('/articles',{method:'POST',body:article()}),id=created.data.id;
  assert.equal((await read('/observations',{method:'POST',body:{article_id:id,kind:'latest',as_of:'2026-10-24T00:00:00Z',
    metrics:{reads:0},source:'synthetic-public'}})).status,201);
  await app.db.prepare("CREATE TRIGGER matrix_test_public_delete_failure BEFORE INSERT ON matrix_audit WHEN NEW.action LIKE 'DELETE /articles/%' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END").run();
  assert.equal((await read('/articles/'+id,{method:'DELETE',body:{version:1}})).status,500);
  assert.equal((await read('/articles/'+id)).status,200);
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_observations WHERE article_id=?').bind(id).first()).n,1);
});

test('cloudflare public mode requires explicit owner and account scope and is off by default',()=>{
  const runtime={compatibility_date:'2026-07-30'};
  assert.equal(cloudflareConfig(runtime).config.vars.PUBLIC_BUSINESS_MODE,undefined);
  assert.throws(()=>cloudflareConfig(runtime,{PUBLIC_BUSINESS_MODE:'1'}));
  const result=cloudflareConfig(runtime,{PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:randomUUID(),PUBLIC_BUSINESS_ACCOUNT_IDS:'[]'});
  assert.equal(result.config.vars.PUBLIC_BUSINESS_MODE,'1');
  assert.equal(result.config.vars.PUBLIC_BUSINESS_ACCOUNT_IDS,'[]');
});

test('public detail redacts credential and user attribution for previously authenticated business writes',async t=>{
  const app=await publicApp(t);
  const issued=await app.request('/api/v1/api-keys',{method:'POST',session:app.session,
    body:{name:'PRIVATE-CREDENTIAL-NAME-CANARY',account_ids:['toutiao-haoduoyu'],permissions:['read','write']}});
  assert.equal(issued.status,201);
  const created=await app.request('/api/v1/articles',{method:'POST',token:issued.data.token,body:article()});
  assert.equal(created.status,201);
  const detail=await app.publicRequest('/articles/'+created.data.id);
  assert.equal(detail.status,200);
  for(const marker of [issued.data.token,issued.data.id,'PRIVATE-CREDENTIAL-NAME-CANARY','token_hash','password_hash'])
    assert.ok(!detail.text.includes(marker));
  const preflight=await app.publicRequest('/todos',{method:'OPTIONS',headers:{Origin:'https://foreign.invalid'}});
  assert.equal(preflight.status,401);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),null);
  const docs=await worker.fetch(new Request(app.origin+'/api-docs'),app.env);
  assert.match(await docs.text(),/X-Public-Business/);
  assert.doesNotMatch((await app.request('/api-docs')).text,/X-Public-Business/);
});
