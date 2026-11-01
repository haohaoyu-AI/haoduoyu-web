import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {planFutureMove,verifyFutureMove} from '../web/pages/unscheduled-todos.mjs';
import {createMemoryDB,entityKey} from '../web/offline/db.mjs';
import {createOfflineRuntime} from '../web/offline/runtime.mjs';
import {projectWorkbenchSnapshot} from '../src/workbench-snapshot.mjs';
import {snapshotBudget} from '../src/snapshot-budget.mjs';
import {state} from '../web/core/state.mjs';
import {renderTodos} from '../web/pages/todos.mjs';

const scope='a'.repeat(64), stamp='2026-10-28T02:00:00.000Z';
const future=()=>({id:randomUUID(),text:'合成未来待办',version:1,completed:false,deleted_at:null});

test('calendar view labels the calendar and puts its selected-day editor below the task list',()=>{
  const before={me:state.me,page:state.page,todoPanel:state.todoPanel,todoDate:state.todoDate};
  try {
    Object.assign(state,{me:{id:'synthetic'},page:'todos',todoPanel:'history',todoDate:'2027-01-01'});
    const html=renderTodos();
    assert.match(html,/>日历<|aria-label="待办日历"/);
    assert.ok(html.indexOf('id="todo-items"') < html.indexOf('id="todo-form"'));
    assert.match(html,/<form id="todo-form"[^>]*data-date="2027-01-01"/);
  } finally {Object.assign(state,before);}
});

test('a matching move response confirms once, with no follow-up writes or reads',async()=>{
  const row=future(), calls=[], date='2026-11-04';
  const source={...row,version:row.version+1,deleted_at:stamp},todo={...row,date,version:1,created_at:stamp,updated_at:stamp};
  const services={checkReady:async()=>calls.push('ready'),move:async(id,body)=>{calls.push([id,body]);return {source,todo}},
    readSource:async()=>{throw Error('unexpected read')},readDay:async()=>{throw Error('unexpected read')}};
  const result=await planFutureMove(row,date,services);
  assert.equal(result.state,'confirmed');assert.deepEqual(calls,['ready',[row.id,{date,version:row.version}]]);
});

test('lost response is only confirmed after matching tombstone and dated item; no second write occurs',async()=>{
  const row=future(),date='2026-11-04',calls=[];
  const source={...row,version:row.version+1,deleted_at:stamp},todo={...row,date,version:1,created_at:stamp,updated_at:stamp};
  const services={checkReady:async()=>{},move:async()=>{calls.push('write');throw Error('network lost')},
    readSource:async()=>{calls.push('source');return source},readDay:async()=>{calls.push('day');return {items:[todo]}}};
  assert.equal((await planFutureMove(row,date,services)).state,'confirmed');
  assert.deepEqual(calls,['write','source','day']);
  assert.equal((await verifyFutureMove(row,date,services)).state,'confirmed');
  assert.equal(calls.filter(x=>x==='write').length,1);
});

test('unknown responses cannot be called success or failure without evidence; explicit failure preserves source',async()=>{
  const row=future(),date='2026-11-04';let writes=0;
  const services={checkReady:async()=>{},move:async()=>{writes++;throw Error('network lost')},
    readSource:async()=>row,readDay:async()=>({items:[]})};
  assert.equal((await planFutureMove(row,date,services)).state,'unknown');
  assert.equal((await verifyFutureMove(row,date,{...services,readSource:async()=>{throw Error('offline')}})).state,'unknown');
  assert.equal((await planFutureMove(row,date,{...services,move:async()=>{throw Object.assign(new Error('conflict'),{status:409})}})).state,'failed');
  assert.equal((await planFutureMove(row,'2026-02-30',services)).state,'not_started');
  assert.equal(writes,1);
});

test('an unknown outcome can be retried only on a fresh explicit action after source and destination are re-read',async()=>{
  const row=future(),date='2026-11-04',writes=[];let first=true;
  const source={...row,version:row.version+1,deleted_at:stamp},todo={...row,date,version:1,created_at:stamp,updated_at:stamp};
  const services={checkReady:async()=>{},move:async(id,body)=>{writes.push({id,body});if(first){first=false;throw Error('network lost')}return {source,todo}},
    readSource:async()=>row,readDay:async()=>({date,items:[]})};
  assert.equal((await planFutureMove(row,date,services)).state,'unknown');
  assert.equal(writes.length,1,'first unknown result never replays a write');
  assert.equal((await verifyFutureMove(row,date,services)).state,'retryable');
  assert.equal(writes.length,1,'read-only verification never writes');
  assert.equal((await planFutureMove(row,date,{...services,priorUncertain:true})).state,'confirmed');
  assert.deepEqual(writes,[{id:row.id,body:{date,version:row.version}},{id:row.id,body:{date,version:row.version}}]);
});

test('a later 4xx does not misreport an earlier unknown outcome as a confirmed failure',async()=>{
  const row=future(),date='2026-11-04';
  const result=await planFutureMove(row,date,{priorUncertain:true,checkReady:async()=>{},
    move:async()=>{throw Object.assign(new Error('limited'),{status:429})},readSource:async()=>row,readDay:async()=>({date,items:[]})});
  assert.equal(result.state,'unknown');
});

test('rate limits stop immediate source/day reads and never turn a prior unknown into failure',async()=>{
  const row=future(),date='2026-11-04',calls=[];
  const limited=()=>Object.assign(new Error('rate limited'),{status:429});
  const base={checkReady:async()=>{calls.push('preflight')},move:async()=>{calls.push('move');throw limited()},
    readSource:async()=>{calls.push('source');return row},readDay:async()=>{calls.push('day');return {date,items:[]}}};
  assert.equal((await planFutureMove(row,date,base)).state,'not_started');
  assert.deepEqual(calls,['preflight','move']);calls.length=0;
  assert.equal((await planFutureMove(row,date,{...base,priorUncertain:true})).state,'unknown');
  assert.deepEqual(calls,['preflight','move']);calls.length=0;
  assert.equal((await planFutureMove(row,date,{...base,checkReady:async()=>{calls.push('preflight');throw limited()}})).state,'not_started');
  assert.deepEqual(calls,['preflight']);calls.length=0;
  assert.equal((await planFutureMove(row,date,{...base,priorUncertain:true,checkReady:async()=>{calls.push('preflight');throw limited()}})).state,'unknown');
  assert.deepEqual(calls,['preflight']);
});

test('mismatched completion or day must never confirm an uncertain move',async()=>{
  const row=future(),date='2026-11-04',source={...row,version:row.version+1,deleted_at:stamp};
  const todo={...row,date,version:1,created_at:stamp,updated_at:stamp};
  for (const changed of [{...todo,completed:true},{...todo,date:'2026-11-05'}])
    assert.equal((await verifyFutureMove(row,date,{readSource:async()=>source,readDay:async()=>({items:[changed]})})).state,'unknown');
});

test('an old identical copy permits only a manual same-request retry; different or templated copies stay uncertain',async()=>{
  const row=future(),date='2026-11-04',oldCopy={...row,date,version:1,created_at:stamp,updated_at:stamp};
  const read=todo=>({readSource:async()=>row,readDay:async()=>({date,items:[todo]})});
  assert.equal((await verifyFutureMove(row,date,read(oldCopy))).state,'retryable');
  for(const different of [{...oldCopy,text:'Another text'},{...oldCopy,completed:true},{...oldCopy,template_id:randomUUID()}])
    assert.equal((await verifyFutureMove(row,date,read(different))).state,'unknown');
});

test('scope or readiness failure prevents a move request',async()=>{
  const row=future();let writes=0;
  const services={checkReady:async()=>{throw Object.assign(new Error('changed scope'),{staleSession:true})},
    move:async()=>{writes++},readSource:async()=>row,readDay:async()=>({items:[]})};
  assert.equal((await planFutureMove(row,'2026-11-04',services)).state,'cancelled');
  assert.equal(writes,0);
});

test('offline queue returns same ID once and rejects a different date without replacing it',async t=>{
  const db=createMemoryDB(); let online=true;
  const snapshot=()=>projectWorkbenchSnapshot(Object.fromEntries(['todos','life_notes','work_notes','work_reminders','memo_groups','memos'].map(k=>[k,[]])),{scope_id:scope,generated_at:stamp,date:null},snapshotBudget());
  const request=async path=>{
    if(path==='/auth/me')return {id:'test-user',username:'test'};
    if(path.startsWith('/workbench-snapshot'))return snapshot();
    throw new Error('unexpected network request');
  };
  const app=createOfflineRuntime({db,request,online:()=>online,now:()=>Date.parse(stamp),features:{todos:true,notes:false,memos:false}});
  t.after(()=>app.stop());await app.call('/auth/me');online=false;
  const id=randomUUID(), body={id,date:'2026-11-04',text:'待安排'};
  await app.call('/todos',{method:'POST',body});
  const again=await app.call('/todos',{method:'POST',body});
  assert.equal(again.id,id);assert.equal((await app.queue()).operations.length,1);
  await assert.rejects(app.call('/todos',{method:'POST',body:{...body,date:'2026-11-05'}}),/2026-11-04/);
  await assert.rejects(app.call('/todos',{method:'POST',body:{...body,template_id:randomUUID()}}),/2026-11-04/);
  assert.equal((await app.findTodo(id)).date,'2026-11-04');assert.equal((await app.queue()).operations.length,1);
});

test('confirmed move updates clean local records, without inventing an uncached date',async t=>{
  const db=createMemoryDB(),date='2026-11-04',row=future();
  const snapshot=()=>projectWorkbenchSnapshot(Object.fromEntries(['todos','life_notes','work_notes','work_reminders','memo_groups','memos'].map(k=>[k,[]])),{scope_id:scope,generated_at:stamp,date:null},snapshotBudget());
  const app=createOfflineRuntime({db,request:async path=>path==='/auth/me'?{id:'test-user',username:'test'}:snapshot(),online:()=>true,now:()=>Date.parse(stamp),features:{todos:true,notes:false,memos:false}});
  t.after(()=>app.stop());await app.call('/auth/me');const token=app.captureRateLimitContext();
  const source={...row,version:2,deleted_at:stamp},todo={...row,date,version:1,created_at:stamp,updated_at:stamp};
  assert.equal(await app.acceptMovedTodo({source,todo},token),'refresh');
  const entities=await db.transaction(['entities'],'readonly',tx=>tx.getAll('entities'));
  assert.equal(entities.find(x=>x.entity_id==='unscheduled_todo:'+row.id).server.deleted_at,stamp);
  assert.equal(entities.find(x=>x.entity_id==='todo:'+row.id).server.date,date);
  await db.transaction(['meta'],'readwrite',tx=>tx.put('meta',{key:entityKey(scope,'get:/todos?date='+encodeURIComponent(date)),data:{items:[]}}));
  assert.equal(await app.acceptMovedTodo({source,todo},token),'saved');
});

test('confirmed move never overwrites dirty local records or pending queue and rejects stale scope',async t=>{
  const db=createMemoryDB(),date='2026-11-04',row=future();
  const snapshot=()=>projectWorkbenchSnapshot(Object.fromEntries(['todos','life_notes','work_notes','work_reminders','memo_groups','memos'].map(k=>[k,[]])),{scope_id:scope,generated_at:stamp,date:null},snapshotBudget());
  const app=createOfflineRuntime({db,request:async path=>path==='/auth/me'?{id:'test-user',username:'test'}:snapshot(),online:()=>true,now:()=>Date.parse(stamp),features:{todos:true,notes:false,memos:false}});
  t.after(()=>app.stop());await app.call('/auth/me');const token=app.captureRateLimitContext();
  const source={...row,version:2,deleted_at:stamp},todo={...row,date,version:1,created_at:stamp,updated_at:stamp};
  const key=entityKey(scope,'todo:'+row.id),local={...todo,text:'Pending local change'};
  await db.transaction(['entities'],'readwrite',tx=>tx.put('entities',{key,scope,entity_id:'todo:'+row.id,dirty:true,local}));
  assert.equal(await app.acceptMovedTodo({source,todo},token),'pending');
  assert.equal((await db.transaction(['entities'],'readonly',tx=>tx.get('entities',key))).local.text,'Pending local change');
  await db.transaction(['entities','outbox'],'readwrite',async tx=>{await tx.delete('entities',key);await tx.put('outbox',{key:'pending',scope,entity_id:'todo:'+row.id,status:'queued'});});
  assert.equal(await app.acceptMovedTodo({source,todo},token),'pending');
  assert.equal((await db.transaction(['outbox'],'readonly',tx=>tx.get('outbox','pending'))).status,'queued');
  await app.invalidate();assert.equal(await app.acceptMovedTodo({source,todo},token),'refresh');
});

test('a different tab queueing an unsynced edit during a move keeps its work intact',async t=>{
  const db=createMemoryDB(),date='2026-11-04',row=future();let online=true;
  const snapshot=()=>projectWorkbenchSnapshot(Object.fromEntries(['todos','life_notes','work_notes','work_reminders','memo_groups','memos'].map(k=>[k,[]])),{scope_id:scope,generated_at:stamp,date:null},snapshotBudget());
  const options={db,request:async path=>path==='/auth/me'?{id:'test-user',username:'test'}:snapshot(),online:()=>online,now:()=>Date.parse(stamp),features:{todos:true,notes:false,memos:false}};
  const first=createOfflineRuntime(options),second=createOfflineRuntime(options);
  t.after(()=>{first.stop();second.stop()});await first.call('/auth/me');await second.call('/auth/me');
  const token=first.captureRateLimitContext(),key=entityKey(scope,'unscheduled_todo:'+row.id);
  await db.transaction(['entities'],'readwrite',tx=>tx.put('entities',{key,scope,entity_id:'unscheduled_todo:'+row.id,server:row,dirty:false}));
  online=false;
  await second.call('/unscheduled-todos/'+row.id,{method:'PATCH',body:{completed:true,version:row.version}});
  const source={...row,version:2,deleted_at:stamp},todo={...row,date,version:1,created_at:stamp,updated_at:stamp};
  assert.equal(await first.acceptMovedTodo({source,todo},token),'pending');
  const entity=await db.transaction(['entities'],'readonly',tx=>tx.get('entities',key));
  assert.equal(entity.dirty,true);assert.equal(entity.local.completed,true);
  const pending=await db.transaction(['outbox'],'readonly',tx=>tx.getAll('outbox'));
  assert.equal(pending.length,1);assert.equal(pending[0].entity_id,'unscheduled_todo:'+row.id);
});
