import {frontendSource} from './frontend-client.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source = await frontendSource();
function client(fetch) {
  const context=vm.createContext({AbortController, AbortSignal, DOMException, Headers,fetch,Response,URL,URLSearchParams,Intl,setTimeout,clearTimeout,
    document:{querySelector(){return null},querySelectorAll(){return []},addEventListener(){},body:{}},
    window:{addEventListener(){}},location:{href:'http://localhost/',search:''},localStorage:{getItem(){}},requestAnimationFrame(){}});
  new vm.Script(source).runInContext(context);
  vm.runInContext("state.me={id:'synthetic-user',csrfToken:'synthetic-csrf'};renderLogin=()=>{clearArticleIndexes();renderVersion++;modalRequestVersion++};closeModal=()=>{}",context);
  return {run:script=>vm.runInContext(script,context)};
}
const row=id=>({id,title:'Synthetic '+id,account_id:'synthetic-account',platform:'zhihu',published_at:'2026-10-01T00:00:00.000Z'});
const ok=data=>Response.json({data});
async function waitForTransport(started) {
  const deadline=performance.now()+1000;
  while(!started()&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,0));
  assert.ok(started(),'the actual API transport must start after offline storage initialization');
}
test('index coalesces canonical queries, isolates filters and retains immutable minimal rows',async()=>{
  const calls=[],c=client(async(path,options)=>{calls.push({path,options});return ok([row(path)]);});
  c.run("let first=articleIndex('platform=zhihu&account_id=a'),second=articleIndex('account_id=a&platform=zhihu')");
  const [a,b]=await Promise.all([c.run('first'),c.run('second')]);assert.equal(calls.length,1);assert.equal(a,b);
  assert.ok(Object.isFrozen(a));assert.ok(Object.isFrozen(a[0]));assert.match(calls[0].path,/fields=index/);
  await c.run("articleIndex('account_id=b&platform=zhihu')");assert.equal(calls.length,2);
  assert.equal(calls[0].options.credentials,'same-origin');
});
test('a successful write invalidates cached and in-flight indexes before JSON parsing; old data cannot refill',async()=>{
  let finish,reads=0;const calls=[],c=client(async(path,options)=>{
    calls.push({path,options});
    if(options.method==='POST')return ok({saved:true});
    if(++reads===1)return new Promise(resolve=>{finish=()=>resolve(ok([row('obsolete')]));});
    return ok([row('fresh')]);
  });
  c.run("state.articles=[{id:'full',url:'https://example.invalid/original'}];state.reviewArticles=[{id:'old'}];let old=articleIndex()");
  await c.run("api('/articles',{method:'POST',body:{title:'Synthetic write'}})");
  const fresh=await c.run('articleIndex()');finish();const late=await c.run('old');
  assert.equal(fresh[0].id,'fresh');assert.equal(late[0].id,'fresh');assert.equal(reads,2);
  assert.equal(c.run('state.articles[0].url'),'https://example.invalid/original');assert.equal(c.run('state.reviewArticles.length'),0);
  assert.equal(calls.find(x=>x.options.method==='POST').options.headers['X-CSRF-Token'],'synthetic-csrf');
});
test('old session responses cannot fill a new session cache; logout and current 401 clear it',async()=>{
  let finish,reads=0,unauthorized=false;const c=client(async()=>{
    if(unauthorized)return Response.json({error:{code:'UNAUTHORIZED',message:'Synthetic expired session'}},{status:401});
    if(++reads===1)return new Promise(resolve=>{finish=()=>resolve(ok([row('old-session')]));});
    return ok([row('new-session')]);
  });
  c.run('let old=articleIndex()');
  const rejected=assert.rejects(c.run('old'),error=>error.staleIndex===true);
  await waitForTransport(()=>typeof finish==='function');
  c.run("clearArticleIndexes();state.me={id:'synthetic-other'}");
  assert.equal((await c.run('articleIndex()'))[0].id,'new-session');finish();
  await rejected;
  assert.equal(c.run("[...articleIndexes.keys()].every(key=>key.startsWith('synthetic-other:'))"),true);
  unauthorized=true;await assert.rejects(c.run("api('/accounts')"),error=>error.status===401);
  assert.equal(c.run('state.me'),null);assert.equal(c.run('articleIndexes.size'),0);
});
test('failed indexes are retried and a successful write with malformed JSON still invalidates',async()=>{
  let reads=0;const c=client(async(_path,options)=>{
    if(options.method==='PUT')return new Response('Synthetic malformed success',{status:200});
    if(++reads===1)return Response.json({error:{message:'Synthetic retryable failure'}},{status:503});
    return ok([row('retried')]);
  });
  await assert.rejects(c.run('articleIndex()'));assert.equal(c.run('articleIndexes.size'),0);
  assert.equal((await c.run('articleIndex()'))[0].id,'retried');assert.equal(reads,2);
  await assert.rejects(c.run("api('/accounts/synthetic',{method:'PUT',body:{name:'Synthetic'}})"));
  assert.equal(c.run('articleIndexes.size'),0);
});
test('a delayed old-session 401 cannot sign out a newly logged-in session, even for the same user id',async()=>{
  for(const identity of ['synthetic-user','synthetic-other']) {
    let finish,reads=0;
    const c=client(async(path,options)=>{
      if(path==='/api/v1/auth/login')return ok({username:'Synthetic new session'});
      if(++reads===1)return new Promise(resolve=>{finish=()=>resolve(Response.json({error:{code:'UNAUTHORIZED',message:'Synthetic old session expired'}},{status:401}));});
      return ok([row('new-session-index')]);
    });
    c.run('let old=articleIndex()');
    await c.run("api('/auth/login',{method:'POST',body:{username:'synthetic-user',password:'synthetic-not-a-live-password'}})");
    c.run('state.me={id:'+JSON.stringify(identity)+',csrfToken:"synthetic-new-csrf"}');
    assert.equal((await c.run('articleIndex()'))[0].id,'new-session-index');
    finish();await assert.rejects(c.run('old'),error=>error.status===401);
    assert.equal(c.run('state.me?.id'),identity,'old 401 must not clear the new authenticated identity');
    assert.equal(c.run('articleIndexes.size'),1,'old 401 must not clear the new cache');
  }
});
test('an ordinary write does not advance session epoch or suppress a genuine current-session 401',async()=>{
  let finish;const c=client(async(path,options)=>{
    if(path==='/api/v1/accounts')return new Promise(resolve=>{finish=()=>resolve(Response.json({error:{message:'Synthetic current session expired'}},{status:401}));});
    return options.method==='POST'?ok({saved:true}):ok([row('current')]);
  });
  await c.run('articleIndex()');c.run("let oct28CurrentSessionRequest=api('/accounts');let epochBefore=sessionEpoch");
  await c.run("api('/articles',{method:'POST',body:{title:'Synthetic ordinary write'}})");
  assert.equal(c.run('sessionEpoch===epochBefore'),true);
  finish();await assert.rejects(c.run('oct28CurrentSessionRequest'),error=>error.status===401&&!error.staleSession);
  assert.equal(c.run('state.me'),null);assert.equal(c.run('articleIndexes.size'),0);
});
