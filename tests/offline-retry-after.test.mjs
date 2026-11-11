import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {frontendBundle} from '../scripts/frontend-build.mjs';
import {createMemoryDB,entityKey} from '../web/offline/db.mjs';
import {createOutbox} from '../web/offline/outbox.mjs';
import {createOfflineRuntime} from '../web/offline/runtime.mjs';
import {projectWorkbenchSnapshot} from '../src/workbench-snapshot.mjs';
import {snapshotBudget} from '../src/snapshot-budget.mjs';

const source=Buffer.from(await frontendBundle()).toString('utf8').replace(/init\(\);\s*$/,'');
function networkClient(fetchImpl) {
  const node=()=>({innerHTML:'',dataset:{},style:{},isConnected:true,querySelector(){return null;},querySelectorAll(){return [];},
    setAttribute(){},removeAttribute(){},addEventListener(){},contains(){return false;},focus(){}});
  const body=node(),document={body,activeElement:body,visibilityState:'visible',querySelector:()=>node(),
    querySelectorAll:()=>[],addEventListener(){}};
  const context=vm.createContext({document,location:{href:'http://localhost/',search:''},
    history:{pushState(){},replaceState(){}},localStorage:{getItem(){return null;},setItem(){}},
    window:{addEventListener(){},scrollTo(){}},fetch:fetchImpl,
    Response,Headers,AbortController,AbortSignal,DOMException,URL,URLSearchParams,Intl,console,structuredClone,
    crypto:{randomUUID},setTimeout,clearTimeout,requestAnimationFrame(){}});
  new vm.Script(source).runInContext(context);
  return {request:vm.runInContext('apiNetwork',context),setRuntime(runtime){context.externalRuntime=runtime;vm.runInContext('singleton=externalRuntime',context);}};
}
function transport(header,serverDate=null) {
  const headers={...(header===null?{}:{'Retry-After':header}),...(serverDate===null?{}:{Date:serverDate})};
  return networkClient(async()=>Response.json({error:{code:'RATE_LIMITED',message:'rate limited'}},{status:429,headers})).request;
}

test('actual transport preserves Retry-After delta-seconds and HTTP-date',async()=>{
  await assert.rejects(transport('900')('/probe'),error=>error.status===429&&error.retryAfterMs===900000);
  const until=Date.now()+120000,header=new Date(until).toUTCString(),start=Date.now();
  await assert.rejects(transport(header)('/probe'),error=>error.status===429&&
    error.retryAfterMs>=Math.floor((until-start-1500))&&error.retryAfterMs<=120000);
});

test('HTTP-date waits use the server Date when its clock differs from the client',async()=>{
  const serverTime=Date.parse('Tue, 01 Jan 2030 00:00:00 GMT');
  const header=new Date(serverTime+900000).toUTCString(),date=new Date(serverTime).toUTCString();
  await assert.rejects(transport(header,date)('/probe'),error=>error.status===429&&error.retryAfterMs===900000);
});

test('a non-JSON 429 retains its status and Retry-After instead of becoming a generic parse error',async()=>{
  const net=networkClient(async()=>new Response('<html>rate limited</html>',{status:429,headers:{'Retry-After':'900','Content-Type':'text/html'}}));
  await assert.rejects(net.request('/probe'),error=>error.status===429&&error.code==='RATE_LIMITED'&&error.retryAfterMs===900000);
});

test('missing or malformed Retry-After safely falls back to 60 seconds',async()=>{
  for(const header of [null,'not-a-date','-12','NaN','','0'])
    await assert.rejects(transport(header)('/probe'),error=>error.status===429&&error.retryAfterMs===60000,`header ${header}`);
});

test('a 429 keeps the durable operation intact and performs no retry before the server deadline',async()=>{
  const db=createMemoryDB(),scope='a'.repeat(64),id=randomUUID(),clock={now:1000},calls=[];
  let posts=0;
  const outbox=createOutbox({db,getScope:()=>scope,now:()=>clock.now,supportedProtocols:[1,2,3,4,5],request:async(path,opts={})=>{
    calls.push({path,method:opts.method||'GET'});
    if(opts.method){posts++;if(posts===1)throw Object.assign(new Error('rate limited'),{status:429,code:'RATE_LIMITED',retryAfterMs:900000});
      return {...opts.body,version:1,completed:false,deleted_at:null};}
    if(path.startsWith('/unscheduled-todos/'))throw Object.assign(new Error('missing'),{status:404});
    throw new Error('unexpected '+path);
  }});
  const text='Synthetic pending work';
  const input={scope,entity_type:'unscheduled_todo',entity_id:id,method:'POST',body:{id,text},local:{id,text,completed:false},protocol:4};
  const saved=await outbox.enqueue(input);await outbox.drain();
  let [row]=await outbox.list(scope);assert.equal(row.next_attempt_at,901000);assert.equal(row.body.text,text);
  assert.equal((await db.transaction(['entities'],'readonly',tx=>tx.get('entities',entityKey(scope,saved.operation.entity_id)))).dirty,true);
  clock.now=900999;await outbox.drain();assert.equal(calls.length,1);assert.equal(posts,1);
  clock.now=901000;await outbox.drain();
  assert.equal(calls[1].method,'GET','unknown write must be checked before retry');
  assert.equal(posts,2);assert.equal((await outbox.list(scope)).length,0);
});

test('a server-wide 429 holds other queued work across restart, without deleting it',async()=>{
  const db=createMemoryDB(),scope='b'.repeat(64),clock={now:1000},calls=[];
  const options={db,getScope:()=>scope,now:()=>clock.now,supportedProtocols:[1,2,3,4,5],request:async(path,opts={})=>{
    calls.push({path,method:opts.method||'GET'});
    throw Object.assign(new Error('rate limited'),{status:429,code:'RATE_LIMITED',retryAfterMs:900000});
  }};
  const outbox=createOutbox(options);
  for(const text of ['First retained item','Second retained item']) {
    const id=randomUUID();await outbox.enqueue({scope,entity_type:'unscheduled_todo',entity_id:id,
      method:'POST',body:{id,text},local:{id,text,completed:false},protocol:4});
  }
  await outbox.drain();assert.equal(calls.length,1,'429 must stop the whole queue');
  const after=await outbox.list(scope);assert.equal(after.length,2);
  assert.deepEqual(after.map(row=>row.body.text).sort(),['First retained item','Second retained item']);
  clock.now=900999;const restarted=createOutbox(options);await restarted.drain();
  assert.equal(calls.length,1,'restart must not bypass the persisted server deadline');
  assert.equal((await restarted.list(scope)).length,2);
});

test('a persisted cooldown is isolated to its verified scope',async()=>{
  const db=createMemoryDB(),clock={now:1000},calls=[];
  const make=scope=>createOutbox({db,getScope:()=>scope,now:()=>clock.now,supportedProtocols:[1,2,3,4,5],
    request:async(path,opts={})=>{calls.push({scope,path});
      if(scope==='a'.repeat(64))throw Object.assign(new Error('rate limited'),{status:429,retryAfterMs:900000});
      return {...opts.body,version:1,completed:false,deleted_at:null};}});
  const first=make('a'.repeat(64)),second=make('b'.repeat(64));
  for(const [outbox,scope] of [[first,'a'.repeat(64)],[second,'b'.repeat(64)]]) {
    const id=randomUUID();await outbox.enqueue({scope,entity_type:'unscheduled_todo',entity_id:id,
      method:'POST',body:{id,text:'Scope local item'},local:{id,text:'Scope local item',completed:false},protocol:4});
  }
  await first.drain();await second.drain();
  assert.equal(calls.filter(row=>row.scope==='a'.repeat(64)).length,1);
  assert.equal(calls.filter(row=>row.scope==='b'.repeat(64)).length,1,'other scope must not inherit the cooldown');
  assert.equal((await first.list('a'.repeat(64))).length,1);assert.equal((await second.list('b'.repeat(64))).length,0);
});

test('long retry waits are split into safe timer segments without sending early',async t=>{
  const db=createMemoryDB(),scope='c'.repeat(64),clock={now:1000};let online=true,writes=0;
  const app=createOfflineRuntime({db,now:()=>clock.now,online:()=>online,request:async(path,opts={})=>{
    if(opts.method){writes++;throw new Error('must not write early');}
    if(path==='/auth/me')return {id:'public',username:'public',publicBusiness:true};
    if(path==='/workbench-snapshot/index')return {scope_id:scope,complete:true,projection:'current'};
    throw new Error('snapshot unavailable');
  }});t.after(()=>app.stop());
  await app.call('/auth/me');online=false;
  const id=randomUUID();await app.call('/todos',{method:'POST',body:{id,date:'2026-11-05',text:'Pending long retry'}});
  const [row]=await db.transaction(['outbox'],'readonly',tx=>tx.getAll('outbox'));
  const maxTimer=2147483647;
  await db.transaction(['outbox'],'readwrite',tx=>tx.put('outbox',{...row,next_attempt_at:clock.now+maxTimer+60000}));
  online=true;const realSetTimeout=globalThis.setTimeout,scheduled=[];
  try {
    globalThis.setTimeout=(callback,delay)=>{const token={callback,delay,unref(){}};scheduled.push(token);return token;};
    await app.sync();await new Promise(resolve=>setImmediate(resolve));
    const first=scheduled.find(timer=>timer.delay===maxTimer);
    assert.ok(first,'first timer must be bounded by the host maximum');
    assert.ok(scheduled.every(timer=>timer.delay<=maxTimer),'no overflowing timer is passed to the runtime');
    assert.equal(writes,0);
    clock.now+=maxTimer;first.callback();
    for(let i=0;i<20&&!scheduled.some(timer=>timer.delay===60000);i++)await new Promise(resolve=>setImmediate(resolve));
    assert.ok(scheduled.some(timer=>timer.delay===60000),'remaining wait is scheduled after the first segment');
    assert.equal(writes,0,'segment wakeup must not send before the full deadline');
  } finally {globalThis.setTimeout=realSetTimeout;}
});

test('foreground 429 persists scope cooldown and blocks immediate background work across restart',async t=>{
  const db=createMemoryDB(),scope='d'.repeat(64),clock={now:1000},calls=[];
  const net=networkClient(async url=>{
    const path=new URL(url,'http://localhost').pathname;
    calls.push(path);
    if(path==='/api/v1/auth/me')return Response.json({data:{id:'public',username:'public',publicBusiness:true}});
    if(path==='/api/v1/workbench-snapshot/index')return Response.json({data:{scope_id:scope,complete:true,projection:'current'}});
    if(path==='/api/v1/review/notes')return Response.json({error:{code:'RATE_LIMITED',message:'rate limited'}},{status:429,headers:{'Retry-After':'900'}});
    throw new Error('unexpected background request '+path);
  });
  const options={db,request:net.request,now:()=>clock.now,online:()=>true};
  const app=createOfflineRuntime(options);net.setRuntime(app);t.after(()=>app.stop());await app.call('/auth/me');
  await assert.rejects(app.call('/review/notes?account=test'),error=>error.status===429);
  const saved=await db.transaction(['meta'],'readonly',tx=>tx.get('meta',entityKey(scope,'outbox-rate-limit')));
  assert.equal(saved.until,901000);
  const before=calls.length;await app.sync();assert.equal(calls.length,before,'background work must respect the foreground deadline');
  app.stop();const restarted=createOfflineRuntime(options);net.setRuntime(restarted);t.after(()=>restarted.stop());
  await restarted.call('/auth/me');const afterIdentity=calls.length;await restarted.sync();
  assert.equal(calls.length,afterIdentity,'the persisted cooldown survives a runtime restart');
});

test('late foreground 429 cannot transfer a prior generation cooldown to another account',async t=>{
  const db=createMemoryDB(),scopeA='e'.repeat(64),scopeB='f'.repeat(64);let selected=scopeA,resolveOld,started;
  const flightStarted=new Promise(resolve=>{started=resolve;});
  const net=networkClient(async url=>{
    const path=new URL(url,'http://localhost').pathname;
    if(path==='/api/v1/auth/me')return Response.json({data:{id:selected===scopeA?'first':'second',username:'public',publicBusiness:true}});
    if(path==='/api/v1/workbench-snapshot/index')return Response.json({data:{scope_id:selected,complete:true,projection:'current'}});
    if(path==='/api/v1/review/notes')return new Promise(resolve=>{resolveOld=resolve;started();});
    throw new Error('unexpected '+path);
  });
  const app=createOfflineRuntime({db,request:net.request,now:()=>1000,online:()=>true});net.setRuntime(app);t.after(()=>app.stop());
  await app.call('/auth/me');const stale=app.call('/review/notes?account=first').catch(error=>error);await flightStarted;
  await app.invalidate();selected=scopeB;await app.call('/auth/me');
  resolveOld(Response.json({error:{code:'RATE_LIMITED',message:'rate limited'}},{status:429,headers:{'Retry-After':'900'}}));await stale;
  const other=await db.transaction(['meta'],'readonly',tx=>tx.get('meta',entityKey(scopeB,'outbox-rate-limit')));
  assert.equal(other,undefined,'old generation may not impose cooldown on the new account');
  assert.equal(app.state.scope,scopeB);assert.equal(app.state.verifiedScope,scopeB);
});

test('failed atomic 429 persistence preserves queue and still blocks subsequent network in this session',async t=>{
  const base=createMemoryDB(),scope='1'.repeat(64),clock={now:1000},calls=[];let online=true,failRateWrite=false;
  const db={transaction:(names,mode,callback)=>base.transaction(names,mode,tx=>callback({...tx,put:async(store,value)=>{
    if(failRateWrite&&store==='meta'&&String(value.key).includes('outbox-rate-limit'))throw new Error('synthetic storage quota failure');
    return tx.put(store,value);
  },delete:async(store,key)=>{
    if(failRateWrite&&store==='meta'&&String(key).includes('outbox-lease'))throw new Error('synthetic lease release failure');
    return tx.delete(store,key);
  }}))};
  const request=async(path,opts={})=>{
    calls.push({path,method:opts.method||'GET'});
    if(path==='/auth/me')return {id:'public',username:'public',publicBusiness:true};
    if(path==='/workbench-snapshot/index')return {scope_id:scope,complete:true,projection:'current'};
    if(path==='/todos'&&opts.method==='POST')throw Object.assign(new Error('rate limited'),{status:429,retryAfterMs:900000});
    throw new Error('unexpected request '+path);
  };
  const app=createOfflineRuntime({db,request,now:()=>clock.now,online:()=>online});t.after(()=>app.stop());
  await app.call('/auth/me');online=false;const id=randomUUID();
  await app.call('/todos',{method:'POST',body:{id,date:'2026-11-05',text:'Retain after storage failure'}});
  online=true;failRateWrite=true;await app.sync();
  assert.equal(calls.filter(row=>row.method==='POST').length,1);
  assert.ok(!calls.some(row=>row.path.startsWith('/workbench-snapshot?')),'snapshot must not follow the failed 429 transaction');
  const queued=await base.transaction(['outbox'],'readonly',tx=>tx.getAll('outbox'));
  assert.equal(queued.length,1);assert.equal(queued[0].body.text,'Retain after storage failure');
  const before=calls.length;await app.sync();assert.equal(calls.length,before,'in-memory cooldown must still prevent further network');
});

test('outbox returns its in-memory 429 deadline even when cooldown and lease release transactions fail',async()=>{
  const base=createMemoryDB(),scope='7'.repeat(64),clock={now:1000};let failWrites=false,writes=0;
  const db={transaction:(names,mode,callback)=>base.transaction(names,mode,tx=>callback({...tx,
    put:async(store,value)=>{
      if(failWrites&&store==='meta'&&String(value.key).includes('outbox-rate-limit'))throw new Error('synthetic quota failure');
      return tx.put(store,value);
    },delete:async(store,key)=>{
      if(failWrites&&store==='meta'&&String(key).includes('outbox-lease'))throw new Error('synthetic lease failure');
      return tx.delete(store,key);
    }}))};
  const outbox=createOutbox({db,getScope:()=>scope,now:()=>clock.now,supportedProtocols:[1,2,3,4,5],
    request:async()=>{writes++;throw Object.assign(new Error('rate limited'),{status:429,retryAfterMs:900000});}});
  const id=randomUUID(),text='Retained despite both storage failures';
  await outbox.enqueue({scope,entity_type:'unscheduled_todo',entity_id:id,method:'POST',
    body:{id,text},local:{id,text,completed:false},protocol:4});
  failWrites=true;const result=await outbox.drain();
  assert.equal(result.rateLimitedUntil,901000);assert.equal(writes,1);
  const queued=await base.transaction(['outbox'],'readonly',tx=>tx.getAll('outbox'));
  assert.equal(queued.length,1);assert.equal(queued[0].body.text,text);
});

test('a late 429 from an old in-flight sync cannot affect the newly verified account',async t=>{
  const db=createMemoryDB(),scopeA='2'.repeat(64),scopeB='3'.repeat(64),calls=[];
  let selected=scopeA,online=true,rejectOld,started;const begun=new Promise(resolve=>{started=resolve;});
  const request=async(path,opts={})=>{
    calls.push({path,method:opts.method||'GET',scope:selected});
    if(path==='/auth/me')return {id:selected===scopeA?'first':'second',username:'public',publicBusiness:true};
    if(path==='/workbench-snapshot/index')return {scope_id:selected,complete:true,projection:'current'};
    if(path==='/todos'&&opts.method==='POST')return new Promise((_,reject)=>{rejectOld=reject;started();});
    throw new Error('unexpected request '+path);
  };
  const app=createOfflineRuntime({db,request,now:()=>1000,online:()=>online});t.after(()=>app.stop());
  await app.call('/auth/me');online=false;const id=randomUUID();
  await app.call('/todos',{method:'POST',body:{id,date:'2026-11-05',text:'Old account retained work'}});
  online=true;const oldSync=app.sync();await begun;
  await app.invalidate();selected=scopeB;await app.call('/auth/me');const before=calls.length;
  rejectOld(Object.assign(new Error('old rate limited'),{status:429,retryAfterMs:900000}));await oldSync;
  const other=await db.transaction(['meta'],'readonly',tx=>tx.get('meta',entityKey(scopeB,'outbox-rate-limit')));
  const queued=await db.transaction(['outbox'],'readonly',tx=>tx.getAll('outbox'));
  assert.equal(app.state.scope,scopeB);assert.equal(app.state.verifiedScope,scopeB);
  assert.equal(app.state.error,null,'old sync error cannot replace the new account state');assert.equal(other,undefined);
  assert.equal(calls.length,before,'old sync cannot start a snapshot for the new account');
  assert.equal(queued.length,1);assert.equal(queued[0].scope,scopeA);assert.equal(queued[0].body.text,'Old account retained work');
});

test('a foreground 429 while snapshot sync is in flight prevents further snapshot requests',{timeout:15000},async t=>{
  const db=createMemoryDB(),scope='4'.repeat(64),clock={now:1000},calls=[];let v2IndexReads=0,releaseIndex,started;
  const begun=new Promise(resolve=>{started=resolve;});
  const emptyV1=Object.fromEntries(['todos','life_notes','work_notes','work_reminders','memo_groups','memos'].map(key=>[key,[]]));
  const emptyV2=Object.fromEntries([...Object.keys(emptyV1),'unscheduled_todos','note_labels'].map(key=>[key,[]]));
  const indexV1=projectWorkbenchSnapshot(emptyV1,{scope_id:scope,generated_at:'2026-10-26T01:00:00Z',date:null},snapshotBudget());
  const indexV2=projectWorkbenchSnapshot(emptyV2,{scope_id:scope,generated_at:'2026-10-26T01:00:00Z',date:null,version:2},snapshotBudget());
  const net=networkClient(async url=>{
    const u=new URL(url,'http://localhost'),path=u.pathname;calls.push(path+u.search);
    if(path==='/api/v1/auth/me')return Response.json({data:{id:'public',username:'public',publicBusiness:true}});
    if(path==='/api/v1/workbench-snapshot/index'){
      if(u.searchParams.get('version')==='2'){
        if(++v2IndexReads===1)return new Promise(resolve=>{releaseIndex=()=>resolve(Response.json({data:indexV2}));started();});
        return Response.json({data:indexV2});
      }
      return Response.json({data:indexV1});
    }
    if(path==='/api/v1/review/notes')return Response.json({error:{code:'RATE_LIMITED',message:'rate limited'}},{status:429,headers:{'Retry-After':'900'}});
    throw new Error('unexpected '+path+u.search);
  });
  const app=createOfflineRuntime({db,request:net.request,now:()=>clock.now,online:()=>true});net.setRuntime(app);t.after(()=>app.stop());
  await app.call('/auth/me');const syncing=app.sync();await begun;
  await assert.rejects(app.call('/review/notes?account=test'),error=>error.status===429);
  const before=calls.length;releaseIndex();await syncing;
  assert.equal(calls.length,before,'a completed in-flight response must not start another snapshot request');
  assert.equal(v2IndexReads,1);assert.ok(!calls.some(path=>path.includes('date=')));
});

test('an old account scheduleRetry rejection cannot overwrite the new account state',{timeout:3000},async t=>{
  const base=createMemoryDB(),scopeA='5'.repeat(64),scopeB='6'.repeat(64);let selected=scopeA,hold=false,reads=0,rejectOld,started;
  const begun=new Promise(resolve=>{started=resolve;});
  const db={transaction:(names,mode,callback)=>{
    if(hold&&mode==='readonly'&&names.length===1&&names[0]==='outbox'&&++reads===2)
      return new Promise((_,reject)=>{rejectOld=reject;started();});
    return base.transaction(names,mode,callback);
  }};
  const app=createOfflineRuntime({db,now:()=>1000,online:()=>true,request:async path=>{
    if(path==='/auth/me')return {id:selected===scopeA?'first':'second',username:'public',publicBusiness:true};
    if(path==='/workbench-snapshot/index')return {scope_id:selected,complete:true,projection:'current'};
    throw new Error('unexpected request '+path);
  }});t.after(()=>app.stop());
  await app.call('/auth/me');hold=true;
  const id=randomUUID();await app.call('/todos',{method:'POST',body:{id,date:'2026-11-05',text:'Old scope queued work'}});await begun;
  await app.invalidate();selected=scopeB;await app.call('/auth/me');
  rejectOld(new Error('old retry storage error'));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(app.state.scope,scopeB);assert.equal(app.state.verifiedScope,scopeB);
  assert.equal(app.state.error,null,'old scheduleRetry error cannot overwrite new account state');
  const rows=await base.transaction(['outbox'],'readonly',tx=>tx.getAll('outbox'));
  assert.equal(rows.length,1);assert.equal(rows[0].scope,scopeA);assert.equal(rows[0].body.text,'Old scope queued work');
});
