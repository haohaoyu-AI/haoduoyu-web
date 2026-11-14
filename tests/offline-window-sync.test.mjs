import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createMemoryDB,entityKey} from '../web/offline/db.mjs';
import {createWindowSnapshotSync,WINDOW_REFRESH_MS} from '../web/offline/window-sync.mjs';
import {createOfflineRuntime} from '../web/offline/runtime.mjs';
import {projectWorkbenchSnapshot} from '../src/workbench-snapshot.mjs';
import {snapshotBudget} from '../src/snapshot-budget.mjs';

const owner='a'.repeat(64),other='b'.repeat(64),stamp='2026-03-01T16:01:00Z';
const names=['todos','life_notes','work_notes','work_reminders','memo_groups','memos','unscheduled_todos','note_labels'];
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?
  Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
function row(date,{id=randomUUID(),version=1,text='合成日期事项'}={}) {
  const value={entity_id:'todo:'+id,entity_type:'todo',source:'todo',source_id:id,date,version,
    created_at:stamp,updated_at:stamp,deleted_at:null,text,completed:0};
  return {...value,content_hash:createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')};
}
function fixture({hook}={}) {
  const db=createMemoryDB(),state={scope:owner,generation:0,time:Date.parse(stamp),rows:[],calls:[]};
  const now=()=>state.time;
  const request=async path=>{
    state.calls.push(path);
    if(path==='/auth/me')return {id:'synthetic-owner',username:'Synthetic',publicBusiness:true};
    if(path==='/workbench-snapshot/scope')return {scope_id:state.scope,complete:true,projection:'current'};
    const url=new URL(path,'http://fixture');
    assert.equal(url.pathname,'/workbench-snapshot');assert.equal(url.searchParams.get('version'),'2');
    assert.ok(['recent','date'].includes(url.searchParams.get('window')));
    if(hook)await hook(state,url);
    const to=url.searchParams.get('date')||new Date(state.time+8*3600000).toISOString().slice(0,10);
    const from=url.searchParams.has('date')?to:new Date(Date.parse(to+'T00:00:00Z')-59*86400000).toISOString().slice(0,10);
    const data=Object.fromEntries(names.map(name=>[name,[]]));
    data.todos=state.rows.filter(r=>r.date>=from&&r.date<=to).sort((a,b)=>a.entity_id.localeCompare(b.entity_id));
    const index=projectWorkbenchSnapshot(data,{scope_id:state.scope,generated_at:new Date(state.time).toISOString(),version:2},snapshotBudget());
    return {batch_format:'haoduoyu-workbench-window-v1',coverage:{from,to},index,data};
  };
  const options={db,request,getScope:()=>state.scope,getGeneration:()=>state.generation,now};
  return {db,state,request,now,sync:createWindowSnapshotSync(options),restart:()=>createWindowSnapshotSync(options)};
}
const all=(db,name)=>db.transaction([name],'readonly',tx=>tx.getAll(name));
async function seed(f,record,{dirty=false}={}) {
  await f.db.transaction(['entities'],'readwrite',tx=>tx.put('entities',{key:entityKey(owner,record.entity_id),scope:owner,
    entity_id:record.entity_id,server:record,snapshot_hash:record.content_hash,dirty,...(dirty?{local:{...record,text:'本地草稿'}}:{})}));
}

test('automatic sync is one 60-day inclusive Beijing window across year boundaries, never a history loop',async()=>{
  const f=fixture();f.state.rows=['2026-01-01','2026-01-02','2026-03-02','2026-03-03','2001-01-01'].map(d=>row(d));
  const result=await f.sync.pull();
  assert.deepEqual(result.coverage,{from:'2026-01-02',to:'2026-03-02'});
  assert.equal(result.history_incomplete,true);assert.equal(result.remaining_dates,0);
  assert.equal(f.state.calls.length,1);assert.equal((await all(f.db,'entities')).length,2);
  assert.equal((await f.restart().pull()).status,'throttled');assert.equal(f.state.calls.length,1);
  f.state.time+=WINDOW_REFRESH_MS;
  await f.restart().pull();assert.equal(f.state.calls.length,2);
});
test('old complete/progress metadata is archived; old records, dirty edits and outbox survive',async()=>{
  const f=fixture(),old=row('2001-01-01'),recent=row('2026-03-02');await seed(f,old,{dirty:true});
  f.state.rows=[recent];
  await f.db.transaction(['meta','outbox'],'readwrite',async tx=>{
    await tx.put('meta',{key:entityKey(owner,'snapshot-v2'),value:{index:{complete:true,scope_id:owner},verified_at:1}});
    await tx.put('meta',{key:entityKey(owner,'snapshot-v2-progress'),value:{pending_dates:['2001-01-01'],verified_at:2}});
    await tx.put('outbox',{key:'synthetic-pending',scope:owner,entity_id:old.entity_id,body:{text:'本地草稿'}});
  });
  await f.sync.pull();
  const kept=(await all(f.db,'entities')).find(r=>r.entity_id===old.entity_id);
  assert.deepEqual(kept.server,old);assert.equal(kept.local.text,'本地草稿');assert.equal(kept.remote_missing,undefined);
  assert.equal((await all(f.db,'outbox')).length,1);
  const keys=(await all(f.db,'meta')).map(r=>r.key);
  assert.ok(!keys.includes(entityKey(owner,'snapshot-v2')));assert.ok(keys.includes(entityKey(owner,'snapshot-v2-archive')));
  assert.ok(keys.includes(entityKey(owner,'snapshot-v2-window')));
  assert.equal(f.state.calls.some(p=>p.includes('2001')),false);
});
test('range absence preserves the server copy and records only an exact window exclusion',async()=>{
  const f=fixture(),moved=row('2026-03-01');await seed(f,moved);
  await f.sync.pull();
  const kept=(await all(f.db,'entities'))[0];assert.deepEqual(kept.server,moved);
  assert.equal(kept.remote_missing,undefined);assert.equal(kept.window_exclusion.date,moved.date);
});
test('a historical day downloads only after an explicit request and never broadens automatic coverage',async()=>{
  const f=fixture(),old=row('2001-01-01');f.state.rows=[old];await f.sync.pull();
  await f.sync.pull({historyDate:'2001-01-01'});
  assert.equal(f.state.calls.length,2);assert.ok(f.state.calls[1].includes('window=date&date=2001-01-01'));
  assert.deepEqual((await all(f.db,'entities'))[0].server,{...old,id:old.source_id});
  const meta=await all(f.db,'meta');assert.ok(meta.some(r=>r.key===entityKey(owner,'snapshot-v2-date:2001-01-01')));
});
test('in-flight duplicate calls and separate tabs share a durable lease, with no second heavy request',async()=>{
  let release;const gate=new Promise(r=>{release=r;});const f=fixture({hook:()=>gate});
  const first=f.sync.pull();assert.equal(f.sync.pull(),first);
  while(!f.state.calls.length)await new Promise(r=>setImmediate(r));
  assert.equal((await f.restart().pull()).status,'throttled');assert.equal(f.state.calls.length,1);
  await assert.rejects(f.sync.pull({historyDate:'2001-01-01'}),e=>e.code==='OFFLINE_SYNC_BUSY');
  release();await first;
});
test('failed requests persist backoff across reload, then recover without automatic rapid retries',async()=>{
  let fail=true;const f=fixture({hook:()=>{if(fail)throw Object.assign(new Error('D1 unavailable'),{status:500});}});
  await assert.rejects(f.sync.pull(),/D1 unavailable/);
  assert.equal((await f.restart().pull()).status,'throttled');assert.equal(f.state.calls.length,1);
  assert.equal((await f.restart().pull({historyDate:'2001-01-01'})).status,'throttled');
  f.state.time+=WINDOW_REFRESH_MS;fail=false;assert.equal((await f.restart().pull()).status,'synced');
  assert.equal(f.state.calls.length,2);
});
test('scope or generation changes during a response never commit it',async()=>{
  for(const change of ['scope','generation']) {
    const f=fixture({hook:state=>{if(change==='scope')state.scope=other;else state.generation++;}});
    f.state.rows=[row('2026-03-02')];
    await assert.rejects(f.sync.pull(),e=>e.code==='OFFLINE_SCOPE_CHANGED');
    assert.deepEqual(await all(f.db,'entities'),[]);
  }
});
test('runtime event bursts share one run, persistent snapshot gate survives runtime restart, and no history timer is used',async()=>{
  const f=fixture();f.state.rows=[row('2026-03-02')];
  const options={db:f.db,request:f.request,now:f.now,online:()=>true,windowedSnapshot:true,scopeProbe:true,scopeReuseMs:30000};
  const runtime=createOfflineRuntime(options),first=runtime.sync();
  await Promise.all([first,runtime.sync(),runtime.sync()]);await new Promise(r=>setImmediate(r));
  assert.equal(f.state.calls.filter(p=>p.includes('window=')).length,1);
  assert.equal(runtime.state.historyIncomplete,true);assert.equal(runtime.state.historyRemaining,0);
  await runtime.sync();assert.equal(f.state.calls.filter(p=>p.includes('window=')).length,1);
  const restarted=createOfflineRuntime(options);await restarted.sync();
  assert.equal(f.state.calls.filter(p=>p.includes('window=')).length,1);runtime.stop();restarted.stop();
});
test('queued writes cannot turn an identity 500 into a 100ms retry loop; the read pause is background only',async()=>{
  const f=fixture();let online=true,broken=false,attempts=0;
  const request=async path=>{
    if(path==='/auth/me'&&broken){attempts++;throw Object.assign(new Error('quota exhausted'),{status:500});}
    return f.request(path);
  };
  const options={db:f.db,request,now:f.now,online:()=>online,windowedSnapshot:true,scopeProbe:true,scopeReuseMs:30000};
  const runtime=createOfflineRuntime(options);await runtime.call('/auth/me');
  online=false;
  await runtime.call('/todos',{method:'POST',body:{date:'2026-03-02',text:'离线保留的待办'}});
  await runtime.refresh();assert.equal(runtime.state.pending,1);
  online=true;broken=true;f.state.time+=31000;
  await runtime.sync({rerun:true});
  await new Promise(r=>setTimeout(r,260));
  assert.equal(attempts,1);assert.equal((await all(f.db,'outbox')).length,1);
  const cooldown=(await all(f.db,'meta')).find(r=>r.key===entityKey(owner,'outbox-rate-limit'));
  assert.equal(cooldown,undefined,'a read failure is not stored, so a reload is never locked out');
  await runtime.sync({rerun:true});assert.equal(attempts,1,'automatic sync waits out the pause');
  await runtime.call('/todos',{method:'POST',body:{date:'2026-03-02',text:'用户刚保存的待办'}});
  await new Promise(r=>setTimeout(r,260));
  assert.equal(attempts,2,'a new save gets exactly one attempt');assert.equal((await all(f.db,'outbox')).length,2);
  broken=false;f.state.time+=31000;
  assert.equal((await runtime.call('/auth/me')).id,'synthetic-owner','what the person opens is not held back by the pause');
  runtime.stop();
});
test('an hour-long pause stored by the previous page is ignored; new pauses stay within two minutes',async()=>{
  const f=fixture();
  const options={db:f.db,request:f.request,now:f.now,online:()=>true,windowedSnapshot:true,scopeProbe:true,scopeReuseMs:30000};
  const runtime=createOfflineRuntime(options);await runtime.call('/auth/me');
  await f.db.transaction(['meta'],'readwrite',tx=>tx.put('meta',{key:entityKey(owner,'outbox-rate-limit'),until:f.now()+3600000}));
  f.state.time+=31000;
  assert.equal((await runtime.call('/auth/me')).id,'synthetic-owner','the stale lock does not block');
  await f.db.transaction(['meta'],'readwrite',tx=>tx.put('meta',{key:entityKey(owner,'outbox-rate-limit'),until:f.now()+60000}));
  await assert.rejects(runtime.call('/auth/me'),error=>error.status===429&&error.retryAfterMs<=60000,'a real short pause is honoured');
  f.state.time+=61000;
  assert.equal((await runtime.call('/auth/me')).id,'synthetic-owner');
  runtime.stop();
});
