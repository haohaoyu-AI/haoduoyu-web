import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createMemoryDB,entityKey} from '../web/offline/db.mjs';
import {createSnapshotSync} from '../web/offline/sync.mjs';
import {createOfflineCache} from '../web/offline/cache.mjs';
import {createOfflineRuntime} from '../web/offline/runtime.mjs';
import {offlineStatusLabel} from '../web/offline/ui.mjs';
import {projectWorkbenchSnapshot} from '../src/workbench-snapshot.mjs';
import {snapshotBudget} from '../src/snapshot-budget.mjs';

const scope='a'.repeat(64),other='b'.repeat(64),stamp='2026-11-13T01:00:00Z',now=()=>Date.parse(stamp);
const names=['todos','life_notes','work_notes','work_reminders','memo_groups','memos','unscheduled_todos','note_labels'];
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
function todo(date,{id=randomUUID(),version=1,text='合成任务'}={}) {
  const row={entity_id:'todo:'+id,entity_type:'todo',source:'todo',source_id:id,date,version,
    created_at:stamp,updated_at:stamp,deleted_at:null,text,completed:0};
  return {...row,content_hash:createHash('sha256').update(JSON.stringify(stable(row))).digest('hex')};
}
function setup(count=14,{hook,limits}={}) {
  const db=createMemoryDB(),calls=[],source={scope,rows:Object.fromEntries(names.map(k=>[k,[]]))};
  source.rows.todos=Array.from({length:count},(_,i)=>todo(new Date(now()-i*86400000).toISOString().slice(0,10)))
    .sort((a,b)=>a.entity_id.localeCompare(b.entity_id));
  let active=0,maximum=0;
  const request=async path=>{
    calls.push(path);
    if(path==='/auth/me')return {id:'synthetic',username:'Synthetic owner',publicBusiness:true};
    if(path==='/workbench-snapshot/scope')return {scope_id:source.scope,complete:true,projection:'current'};
    const url=new URL(path,'http://fixture'),date=url.searchParams.get('date'),version=url.searchParams.get('version')==='2'?2:1;
    if(date){active++;maximum=Math.max(maximum,active);}
    try {
      if(hook)await hook({path,date,calls,source,db});
      if(date)await new Promise(resolve=>setImmediate(resolve));
      const value=projectWorkbenchSnapshot(source.rows,{scope_id:source.scope,generated_at:stamp,date,version},snapshotBudget());
      if(url.searchParams.has('manifest_hash')) {
        if(url.searchParams.get('manifest_hash')!==value.manifest_hash)throw Object.assign(new Error('changed'),{status:409,code:'SNAPSHOT_CHANGED'});
        delete value.entities;
      }
      return value;
    } finally {if(date)active--;}
  };
  const options={db,request,getScope:()=>source.scope,now,version:2,progressive:true,limits};
  return {db,calls,source,request,sync:createSnapshotSync(options),restart:()=>createSnapshotSync(options),maximum:()=>maximum};
}
const all=(db,store)=>db.transaction([store],'readonly',tx=>tx.getAll(store));
const details=f=>f.calls.filter(p=>p.includes('?date=')).map(p=>new URL(p,'http://fixture').searchParams.get('date'));

test('cold sync makes recent dates available, then resumes all 140 dates across restarts within existing budgets',async()=>{
  const f=setup(140),orphan=todo('2001-01-01'),key=entityKey(scope,orphan.entity_id);
  await f.db.transaction(['entities','outbox'],'readwrite',async tx=>{
    await tx.put('entities',{key,scope,entity_id:orphan.entity_id,server:orphan,local:{text:'保留本机草稿'},dirty:true});
    await tx.put('outbox',{key:'pending',scope,entity_id:orphan.entity_id,body:{text:'保留本机草稿'}});
  });
  const first=await f.sync.pull({date:'2026-11-13'});
  assert.equal(first.status,'partial');assert.equal(first.remaining_dates,134);assert.equal(f.sync.state.last_success,null);
  assert.deepEqual(details(f),['2026-11-13','2026-11-12','2026-11-11','2026-11-10','2026-11-09','2026-11-08']);
  assert.equal(f.maximum(),3);
  const meta=await all(f.db,'meta');assert.equal(meta.length,1);assert.equal(meta[0].value.partial,true);
  assert.equal(meta[0].key,entityKey(scope,'snapshot-v2-progress'));
  assert.equal((await all(f.db,'entities')).find(r=>r.key===key).remote_missing,undefined);
  const cache=createOfflineCache({db:f.db,getScope:()=>scope,now});
  assert.equal((await cache.read('/todos?date=2026-11-13')).data.items.length,1);
  await assert.rejects(cache.read('/todos?date=2026-07-01'),e=>e.code==='OFFLINE_CACHE_MISS');
  let result=first,pulls=1;
  while(result.status==='partial') {result=await f.restart().pull();assert.ok(++pulls<30);}
  assert.equal(result.status,'synced');assert.equal(new Set(details(f)).size,140);assert.equal(details(f).length,140);
  const finalMeta=await all(f.db,'meta');assert.equal(finalMeta.length,1);assert.equal(finalMeta[0].key,entityKey(scope,'snapshot-v2'));
  const preserved=(await all(f.db,'entities')).find(r=>r.key===key);
  assert.equal(preserved.remote_missing,true);assert.equal(preserved.local.text,'保留本机草稿');assert.equal((await all(f.db,'outbox')).length,1);
});

test('completed dates survive a changed manifest, disappeared dates are not skipped, and compact responses omit repeated manifests',async()=>{
  const f=setup(14);await f.sync.pull();const initial=details(f);
  const old=f.source.rows.todos.find(r=>r.date==='2026-11-01');
  f.source.rows.todos=f.source.rows.todos.filter(r=>r!==old);
  let result;do {result=await f.restart().pull();}while(result.status==='partial');
  for(const date of initial)assert.equal(details(f).filter(d=>d===date).length,1);
  assert.ok(details(f).includes('2026-11-01'));
  const index=await f.request('/workbench-snapshot/index?version=2');
  const compact=await f.request('/workbench-snapshot?date=2026-11-13&version=2&manifest_hash='+index.manifest_hash);
  const full=projectWorkbenchSnapshot(f.source.rows,{scope_id:scope,generated_at:stamp,date:'2026-11-13',version:2},snapshotBudget());
  assert.equal(Object.hasOwn(compact,'entities'),false);
  assert.ok(JSON.stringify(compact).length<JSON.stringify(full).length/2);
});

test('a failed concurrent batch waits for issued requests, shares reentry and starts no later dates or verification index',async()=>{
  let release,entered=0,failFirst;const gate=new Promise(r=>{release=r;}),failure=new Promise(r=>{failFirst=r;});
  const f=setup(14,{hook:async({date})=>{
    if(!date)return;
    if(++entered===1){await failure;throw Object.assign(new Error('limited'),{status:429,retryAfterMs:60000});}
    await gate;
  }});
  const first=f.sync.pull();
  while(entered<3)await new Promise(r=>setImmediate(r));
  failFirst();await new Promise(r=>setImmediate(r));
  let settled=false;first.catch(()=>{settled=true;});await new Promise(r=>setImmediate(r));
  assert.equal(settled,false);assert.equal(f.sync.pull(),first);assert.equal(entered,3);
  release();await assert.rejects(first,e=>e.status===429);
  assert.equal(f.calls.filter(p=>p.includes('/index')).length,1);
  assert.deepEqual(await all(f.db,'entities'),[]);assert.deepEqual(await all(f.db,'meta'),[]);
});

test('a changed final index or scope cannot commit a partial batch',async t=>{
  for(const mode of ['index','scope'])await t.test(mode,async()=>{
    let indexes=0;
    const f=setup(14,{hook:async({path,date,source})=>{
      if(mode==='scope'&&date)source.scope=other;
      if(mode==='index'&&path.includes('/index')&&++indexes===2)source.rows.todos.push(todo('2001-01-01'));
    }});
    await assert.rejects(f.sync.pull(),e=>['OFFLINE_SCOPE_CHANGED','OFFLINE_SNAPSHOT_CHANGED'].includes(e.code));
    assert.deepEqual(await all(f.db,'entities'),[]);assert.deepEqual(await all(f.db,'meta'),[]);
  });
});

test('partial month stays unavailable, resumes immediately despite scope reuse, and completes without claiming early success',async t=>{
  const f=setup(8),app=createOfflineRuntime({db:f.db,request:f.request,now,online:()=>true,scopeProbe:true,
    scopeReuseMs:30000,progressiveSnapshot:true,features:{todos:true,notes:false,memos:false,snapshotV2:true}});
  t.after(()=>app.stop());await app.call('/auth/me');
  await app.sync();assert.equal(app.state.historyRemaining,2);assert.equal(app.state.lastSuccess,null);
  assert.match(offlineStatusLabel(app.state),/历史同步中/);assert.equal(await app.readTodoMonthSnapshot('2026-11'),null);
  await app.sync();assert.equal(app.state.historyRemaining,0);assert.equal(app.state.lastSuccess,now());
  assert.equal(Object.keys((await app.readTodoMonthSnapshot('2026-11')).days).length,8);
});

test('per-batch byte, hash and request budgets still fail closed',async t=>{
  for(const limits of [{maxRequests:2},{maxResponseBytes:200},{maxBatchBytes:200},{maxHashBytes:50}])await t.test(JSON.stringify(limits),async()=>{
    const f=setup(14,{limits});
    await assert.rejects(f.sync.pull(),e=>e.code==='OFFLINE_SNAPSHOT_LIMIT');
    assert.deepEqual(await all(f.db,'entities'),[]);assert.deepEqual(await all(f.db,'meta'),[]);
  });
});

test('a partial refresh cannot return a moved note on its old date or label an incomplete date history complete',async()=>{
  const f=setup(0),id=randomUUID(),date='2026-11-13';
  const note=(date,version=1)=>{
    const value={entity_id:'note-entry:'+id,entity_type:'life_note',source:'note_entry',source_id:id,date,category:'life',version,
      created_at:stamp,updated_at:stamp,deleted_at:null,text:'合成移动笔记'};
    return {...value,content_hash:createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')};
  };
  f.source.rows.life_notes=[note(date)];await f.sync.pull();
  const oldV1=projectWorkbenchSnapshot(f.source.rows,{scope_id:scope,generated_at:stamp,date:null,version:1},snapshotBudget());
  await f.db.transaction(['meta'],'readwrite',tx=>tx.put('meta',{key:entityKey(scope,'snapshot'),value:{index:oldV1,verified_at:now()}}));
  f.source.rows.life_notes=[note('2001-01-01',2)];
  f.source.rows.todos=Array.from({length:8},(_,i)=>todo('2026-11-'+String(12-i).padStart(2,'0'))).sort((a,b)=>a.entity_id.localeCompare(b.entity_id));
  const result=await f.restart().pull({date});assert.equal(result.status,'partial');
  assert.ok((await all(f.db,'meta')).every(row=>row.value?.partial===true),'old tabs must not retain a full proof over mixed entities');
  const cache=createOfflineCache({db:f.db,getScope:()=>scope,now});
  assert.deepEqual((await cache.read('/note-entries?date='+date+'&category=life')).data.entries,[]);
  await assert.rejects(cache.read('/note-entries/dates?category=life'),e=>e.code==='OFFLINE_CACHE_MISS');
  await assert.rejects(cache.read('/note-entries?date=2001-01-01&category=life'),e=>e.code==='OFFLINE_CACHE_MISS');
  let next=result;while(next.status==='partial')next=await f.restart().pull();
  assert.equal((await cache.read('/note-entries?date=2001-01-01&category=life')).data.entries[0].id,id);
});

test('automatic history continuation is bounded and a 429 pauses later batches without discarding progress',async t=>{
  let limited=false;
  const f=setup(14,{hook:async({date})=>{if(limited&&date)throw Object.assign(new Error('limited'),{status:429,retryAfterMs:60000});}});
  const app=createOfflineRuntime({db:f.db,request:f.request,now,online:()=>true,scopeProbe:true,scopeReuseMs:30000,
    progressiveSnapshot:true,features:{todos:true,notes:false,memos:false,snapshotV2:true}});
  t.after(()=>app.stop());await app.call('/auth/me');await app.sync();
  assert.equal(app.state.historyRemaining,8);const before=await all(f.db,'entities');limited=true;
  for(let i=0;i<20&&!app.state.error;i++)await new Promise(r=>setTimeout(r,50));
  assert.equal(app.state.errorStage,'snapshot');assert.equal(app.state.historyRemaining,8);
  assert.deepEqual(await all(f.db,'entities'),before);
  const calls=f.calls.length;await app.sync();assert.equal(f.calls.length,calls,'cooldown blocks another history batch');
  assert.ok((await all(f.db,'meta')).some(row=>row.value?.partial===true));
});

test('a first-batch 429 retries automatically only after its server cooldown, even with an empty outbox',{timeout:5000},async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let limited=true;
  const f=setup(1,{hook:async({date})=>{if(date&&limited)throw Object.assign(new Error('limited'),{status:429,retryAfterMs:60000});}});
  const clock={now:now()},app=createOfflineRuntime({db:f.db,request:f.request,now:()=>clock.now,online:()=>true,
    scopeProbe:true,scopeReuseMs:30000,progressiveSnapshot:true,features:{todos:true,notes:false,memos:false,snapshotV2:true}});
  t.after(()=>app.stop());await app.call('/auth/me');await app.sync();
  assert.equal(app.state.errorStage,'snapshot');assert.equal(app.state.lastSuccess,null);
  const before=f.calls.length;limited=false;
  clock.now+=59999;t.mock.timers.tick(59999);await new Promise(r=>setImmediate(r));assert.equal(f.calls.length,before);
  let unsubscribe;const finished=new Promise(resolve=>{unsubscribe=app.subscribe(state=>{if(state.lastSuccess!==null)resolve();});});
  clock.now++;t.mock.timers.tick(1);await finished;unsubscribe();
  assert.equal(app.state.lastSuccess,clock.now);assert.equal(app.state.error,null);
});

test('partial v2 batches preserve label evidence and undated records without granting edit capability',async()=>{
  const f=setup(14),noteId=randomUUID(),undatedId=randomUUID(),label='合成标签';
  const seal=row=>({...row,content_hash:createHash('sha256').update(JSON.stringify(stable(row))).digest('hex')});
  const base={version:1,created_at:stamp,updated_at:stamp,deleted_at:null};
  f.source.rows.life_notes=[seal({...base,entity_id:'note-entry:'+noteId,entity_type:'life_note',source:'note_entry',source_id:noteId,
    date:'2026-11-13',category:'life',text:'合成笔记',label})];
  f.source.rows.unscheduled_todos=[seal({...base,entity_id:'unscheduled_todo:'+undatedId,entity_type:'unscheduled_todo',source:'unscheduled_todo',
    source_id:undatedId,date:null,text:'合成未排期任务',completed:0})];
  f.source.rows.note_labels=[seal({...base,entity_id:'note-label:'+encodeURIComponent(label),entity_type:'note_label',source:'note_label',
    source_id:encodeURIComponent(label),date:null,name:label})];
  assert.equal((await f.sync.pull()).status,'partial');
  const rows=await all(f.db,'entities'),note=rows.find(row=>row.entity_id==='note-entry:'+noteId);
  assert.equal(note.label_evidence.label,label);assert.equal(note.server.labels_version,1);
  const undated=rows.find(row=>row.entity_id==='unscheduled_todo:'+undatedId);
  assert.equal(Object.hasOwn(undated.server,'date'),false);assert.equal(undated.server.completed,false);
  const cache=createOfflineCache({db:f.db,getScope:()=>scope,now,labelsV1:true});
  assert.equal((await cache.read('/note-entries?date=2026-11-13&category=life')).data.can_edit,false);
});

test('a moved reminder cannot reappear on a verified empty day while its new historical day is pending',async()=>{
  const f=setup(0),id=randomUUID();
  const reminder=(date,version)=>{
    const row={entity_id:'work-reminder:'+id,entity_type:'work_reminder',source:'work_reminder',source_id:id,date,version,
      created_at:stamp,updated_at:stamp,deleted_at:null,summary:'合成提醒',source_key:'synthetic'};
    return {...row,content_hash:createHash('sha256').update(JSON.stringify(stable(row))).digest('hex')};
  };
  f.source.rows.work_reminders=[reminder('2026-11-13',1)];await f.sync.pull();
  f.source.rows.work_reminders=[reminder('2001-01-01',2)];
  f.source.rows.todos=Array.from({length:8},(_,i)=>todo('2026-11-'+String(12-i).padStart(2,'0'))).sort((a,b)=>a.entity_id.localeCompare(b.entity_id));
  assert.equal((await f.restart().pull()).status,'partial');
  const cache=createOfflineCache({db:f.db,getScope:()=>scope,now});
  assert.deepEqual((await cache.read('/work-reminders?date=2026-11-13')).data.items,[]);
  await assert.rejects(cache.read('/work-reminders?date=2001-01-01'),e=>e.code==='OFFLINE_CACHE_MISS');
});

test('partial legacy tombstones remain readable as deleted without granting editing',async()=>{
  const f=setup(14),date='2026-11-13',row={entity_id:'legacy-life:'+date,entity_type:'life_note',source:'legacy_daily_note',
    source_id:date,date,category:'life',version:2,created_at:stamp,updated_at:stamp,deleted_at:stamp};
  f.source.rows.life_notes=[{...row,content_hash:createHash('sha256').update(JSON.stringify(stable(row))).digest('hex')}];
  assert.equal((await f.sync.pull()).status,'partial');
  const cache=createOfflineCache({db:f.db,getScope:()=>scope,now}),value=(await cache.read('/daily-notes?date='+date)).data;
  assert.equal(value.deleted,true);assert.equal(value.text,'');assert.equal(value.can_edit,false);
});

test('a concurrent older-format full proof is retained and aborts the partial commit',async()=>{
  let indexes=0;
  const f=setup(14,{hook:async({path,db})=>{
    if(path.includes('/index')&&++indexes===2)await db.transaction(['meta'],'readwrite',tx=>tx.put('meta',
      {key:entityKey(scope,'snapshot'),value:{peer:'new complete proof'}}));
  }});
  await assert.rejects(f.sync.pull(),e=>e.code==='OFFLINE_SNAPSHOT_CHANGED');
  assert.deepEqual(await all(f.db,'entities'),[]);
  assert.equal((await all(f.db,'meta'))[0].value.peer,'new complete proof');
});
