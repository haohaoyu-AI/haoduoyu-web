import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {frontendBundle} from '../scripts/frontend-build.mjs';
import {createMemoryDB} from '../web/offline/db.mjs';
import {createOfflineRuntime} from '../web/offline/runtime.mjs';

// Exercise the real bundled init flow while controlling the transport and UI.
const source = Buffer.from(await frontendBundle()).toString('utf8').replace(/init\(\);\s*$/, '');
function client() {
  const nodes = new Map();
  const node = () => ({innerHTML:'',dataset:{},style:{},attributes:{},isConnected:true,events:{},
    querySelector(){return null;},querySelectorAll(){return [];},contains(){return false;},
    setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},focus(){},
    addEventListener(name,handler){this.events[name]=handler;}});
  for (const key of ['#app','#overlay','#page-content','#init-retry']) nodes.set(key,node());
  const body=node(), document={body,activeElement:body,visibilityState:'visible',
    querySelector:key=>nodes.get(key)||null,querySelectorAll:()=>[],addEventListener(){}};
  const location={href:'http://localhost/?page=review',search:'?page=review'};
  const context=vm.createContext({document,location,history:{pushState(){},replaceState(){}},
    localStorage:{getItem(){return null;},setItem(){}},window:{addEventListener(){},scrollTo(){}},
    fetch:async()=>{throw new Error('unexpected real transport');},Response,Headers,AbortController,AbortSignal,
    DOMException,URL,URLSearchParams,Intl,console,structuredClone,crypto:{randomUUID:()=> 'synthetic-id'},
    setTimeout(){return 1;},clearTimeout(){},requestAnimationFrame(){}});
  new vm.Script(source).runInContext(context);
  vm.runInContext('resetSessionIndexes=()=>{};readRoute=()=>{};updateRoute=()=>{};',context);
  return {context,nodes,run:code=>vm.runInContext(code,context)};
}

test('network failure never masquerades as login; retry rechecks identity and accounts',async()=>{
  const app=client(), calls=[]; let fail=true, retry, login=0, shown='', shell=0;
  app.context.fakeApi=async path=>{calls.push(path);if(fail)throw Object.assign(new Error('network down'),{code:'NETWORK_UNAVAILABLE'});
    return path==='/auth/me'?{id:'public',username:'public',publicBusiness:true}:[];};
  app.context.fakeLogin=()=>login++;
  app.context.fakeError=(message,callback)=>{shown=message;retry=callback;};
  app.context.fakeShell=()=>shell++;
  app.run('api=fakeApi;renderLogin=fakeLogin;renderInitializationError=fakeError;renderShell=fakeShell');
  await app.run('init()');
  assert.equal(login,0);assert.equal(shown,'network down');assert.equal(typeof retry,'function');assert.equal(shell,0);
  fail=false;retry();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,['/auth/me','/auth/me','/accounts']);assert.equal(shell,1);assert.equal(login,0);
});

test('retry screen escapes an error message and wires the actual retry control',()=>{
  const app=client();let clicked=0;app.context.retryCallback=()=>clicked++;
  app.run('stopPageEntry=()=>{};closePopover=()=>{};renderInitializationError("<img src=x onerror=alert(1)>",retryCallback)');
  const html=app.nodes.get('#app').innerHTML;
  assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/id="login-form"/);
  app.nodes.get('#init-retry').events.click();assert.equal(clicked,1);
});

test('actual 401 remains a login boundary; other errors remain retryable',async()=>{
  for (const [status,expectLogin] of [[401,true],[403,false],[503,false]]) {
    const app=client();let login=0,retry=0;
    app.context.fakeApi=async()=>{throw Object.assign(new Error('request failed'),{status});};
    app.context.fakeLogin=()=>login++;
    app.context.fakeError=(_message,callback)=>{if(typeof callback==='function')retry++;};
    app.run('api=fakeApi;renderLogin=fakeLogin;renderInitializationError=fakeError');
    await app.run('init()');
    assert.equal(login,expectLogin?1:0,`status ${status}`);
    assert.equal(retry,expectLogin?0:1,`status ${status}`);
  }
});

test('a public identity with an unauthorized snapshot index shows retry, not login; retry revalidates identity',async t=>{
  const app=client(), calls=[];let rejectIndex=true, login=0, shell=0;
  app.context.fetch=async (url,options={})=>{
    const path=new URL(url,'http://localhost').pathname;calls.push(path);
    if(path==='/api/v1/auth/me')return Response.json({data:{id:'public',username:'public',publicBusiness:true}});
    if(path==='/api/v1/workbench-snapshot/index') {
      if(rejectIndex)return Response.json({error:{code:'UNAUTHORIZED',message:'index unavailable'}},{status:401});
      return Response.json({data:{scope_id:'a'.repeat(64),complete:true,projection:'current'}});
    }
    if(path==='/api/v1/accounts')return Response.json({data:[]});
    throw new Error('unexpected request '+path);
  };
  app.context.fakeLogin=()=>login++;app.context.fakeShell=()=>shell++;
  app.run('renderLogin=fakeLogin;renderShell=fakeShell;stopPageEntry=()=>{};closePopover=()=>{};closeModal=()=>{}');
  const offline=createOfflineRuntime({db:createMemoryDB(),request:app.run('apiNetwork'),online:()=>true});
  t.after(()=>offline.stop());app.context.offlineCall=(path,options)=>offline.call(path,options);
  app.run('api=offlineCall');
  await app.run('init()');
  assert.equal(login,0);assert.equal(shell,0);assert.equal(offline.state.verifiedScope,null);
  assert.match(app.nodes.get('#app').innerHTML,/id="init-retry"/);
  rejectIndex=false;app.nodes.get('#init-retry').events.click();
  for(let i=0;i<20&&shell===0;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(shell,1);assert.equal(login,0);assert.equal(offline.state.verifiedScope,'a'.repeat(64));
  assert.deepEqual(calls,['/api/v1/auth/me','/api/v1/workbench-snapshot/index',
    '/api/v1/auth/me','/api/v1/workbench-snapshot/index','/api/v1/workbench-snapshot/index','/api/v1/accounts']);
});

test('a genuine auth/me 401 invokes the login boundary through the real transport',async t=>{
  const app=client();let login=0;
  app.context.fetch=async ()=>Response.json({error:{code:'UNAUTHORIZED',message:'login required'}},{status:401});
  app.context.fakeLogin=()=>login++;
  app.run('renderLogin=fakeLogin;closeModal=()=>{}');
  const offline=createOfflineRuntime({db:createMemoryDB(),request:app.run('apiNetwork'),online:()=>true});
  t.after(()=>offline.stop());app.context.offlineCall=(path,options)=>offline.call(path,options);app.run('api=offlineCall');
  await app.run('init()');assert.ok(login>=1);assert.equal(offline.state.verifiedScope,null);
  assert.doesNotMatch(app.nodes.get('#app').innerHTML,/id="init-retry"/);
});

test('public 429 during initialization preserves the rate-limit message without a login or automatic retry',async t=>{
  for (const limitedPath of ['/auth/me','/workbench-snapshot/index','/accounts']) {
    const app=client(), calls=[];let limited=true, login=0, shell=0, clock=1700000000000;
    app.context.Date=class extends Date {static now(){return clock;}};
    app.context.fetch=async url=>{
      const path=new URL(url,'http://localhost').pathname.replace('/api/v1','');calls.push(path);
      if(path===limitedPath&&limited)return Response.json({error:{code:'RATE_LIMITED',message:'公开操作较多，请稍后重试'}},{status:429,headers:{'Retry-After':'900'}});
      if(path==='/auth/me')return Response.json({data:{id:'public',username:'public',publicBusiness:true}});
      if(path==='/workbench-snapshot/index')return Response.json({data:{scope_id:'a'.repeat(64),complete:true,projection:'current'}});
      if(path==='/accounts')return Response.json({data:[]});
      throw new Error('unexpected request '+path);
    };
    app.context.fakeLogin=()=>login++;app.context.fakeShell=()=>shell++;
    app.run('renderLogin=fakeLogin;renderShell=fakeShell;stopPageEntry=()=>{};closePopover=()=>{};closeModal=()=>{}');
    const offline=createOfflineRuntime({db:createMemoryDB(),request:app.run('apiNetwork'),online:()=>true,now:()=>clock});
    t.after(()=>offline.stop());app.context.offlineCall=(path,options)=>offline.call(path,options);app.run('api=offlineCall');
    await app.run('init()');
    assert.equal(login,0,limitedPath);assert.equal(shell,0,limitedPath);
    assert.match(app.nodes.get('#app').innerHTML,/公开操作较多，请稍后重试/);
    assert.match(app.nodes.get('#app').innerHTML,/id="init-retry"/);
    const before=calls.length;await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,before,'no automatic retry');
    limited=false;clock+=899999;app.nodes.get('#init-retry').events.click();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls.length,before,'retry before Retry-After must not send a request');
    assert.equal(shell,0,limitedPath);
    clock+=1;app.nodes.get('#init-retry').events.click();
    for(let i=0;i<20&&shell===0;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(shell,1,limitedPath);assert.equal(login,0,limitedPath);
    assert.equal(calls[before],'/auth/me','retry starts with identity');
  }
});

test('an index authorization failure does not erase queued offline work',async t=>{
  const app=client(), db=createMemoryDB();let online=true,rejectIndex=false,login=0;
  app.context.fetch=async url=>{
    const path=new URL(url,'http://localhost').pathname;
    if(path==='/api/v1/auth/me')return Response.json({data:{id:'public',username:'public',publicBusiness:true}});
    if(path==='/api/v1/workbench-snapshot/index')return rejectIndex
      ? Response.json({error:{code:'UNAUTHORIZED',message:'index unavailable'}},{status:401})
      : Response.json({data:{scope_id:'a'.repeat(64),complete:true,projection:'current'}});
    throw new Error('unexpected request '+path);
  };
  app.context.fakeLogin=()=>login++;app.run('renderLogin=fakeLogin;closeModal=()=>{}');
  const offline=createOfflineRuntime({db,request:app.run('apiNetwork'),online:()=>online});t.after(()=>offline.stop());
  await offline.call('/auth/me');online=false;
  const id='12345678-1234-4234-8234-123456789abc';
  await offline.call('/todos',{method:'POST',body:{id,date:'2026-11-04',text:'Synthetic retained work'}});
  online=true;rejectIndex=true;
  await assert.rejects(offline.call('/auth/me'),error=>error.status===401&&error.offlineScopeFailure===true);
  const queued=await db.transaction(['outbox'],'readonly',tx=>tx.getAll('outbox'));
  assert.equal(login,0);assert.equal(offline.state.verifiedScope,null);assert.equal(queued.length,1);
  assert.equal(queued[0].body.text,'Synthetic retained work');
});
