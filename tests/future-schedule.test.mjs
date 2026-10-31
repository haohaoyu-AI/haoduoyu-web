import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {planFutureSchedule} from '../web/pages/unscheduled-todos.mjs';
import {createMemoryDB} from '../web/offline/db.mjs';
import {createOfflineRuntime} from '../web/offline/runtime.mjs';
import {projectWorkbenchSnapshot} from '../src/workbench-snapshot.mjs';
import {snapshotBudget} from '../src/snapshot-budget.mjs';
import {state} from '../web/core/state.mjs';
import {renderTodos} from '../web/pages/todos.mjs';

const scope='a'.repeat(64), stamp='2026-10-28T02:00:00.000Z';
const index=(entities=[])=>({scope_id:scope,complete:true,entities});
const future=()=>({id:randomUUID(),text:'合成未来待办'});

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

test('copy uses original ID, preserves source and detects repeat or a different date',async()=>{
  const row=future(), requests=[]; let local=null;
  const services={expectedScope:scope,findTodo:async()=>local,readIndex:async()=>index(),create:async body=>{requests.push(body);local={...body,version:1}}};
  assert.deepEqual(await planFutureSchedule(row,'2026-11-04',services),{existing:false,date:'2026-11-04'});
  assert.deepEqual(await planFutureSchedule(row,'2026-11-04',services),{existing:true,date:'2026-11-04',deleted:false});
  assert.deepEqual(await planFutureSchedule(row,'2026-11-05',services),{existing:true,date:'2026-11-04',deleted:false});
  assert.deepEqual(requests,[{id:row.id,date:'2026-11-04',text:row.text}]);
  assert.equal(row.text,'合成未来待办');
});

test('remote previous date, offline, wrong scope and invalid date never create or discard the source',async()=>{
  const row=future(); let writes=0;
  const services={expectedScope:scope,findTodo:async()=>null,readIndex:async()=>index([{entity_id:'todo:'+row.id,date:'2026-11-01',deleted_at:null}]),create:async()=>{writes++}};
  assert.deepEqual(await planFutureSchedule(row,'2026-11-05',services),{existing:true,date:'2026-11-01',deleted:false});
  await assert.rejects(planFutureSchedule(row,'2026-11-05',{...services,readIndex:async()=>{throw new Error('offline')}}),/联网/);
  await assert.rejects(planFutureSchedule(row,'2026-11-05',{...services,readIndex:async()=>({...index(),scope_id:'b'.repeat(64)})}),/无法核对/);
  await assert.rejects(planFutureSchedule(row,'2026-02-30',services),/有效日期/);
  assert.equal(writes,0);assert.equal(row.text,'合成未来待办');
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
