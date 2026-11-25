import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryDB} from '../web/offline/db.mjs';
import {createOfflineRuntime} from '../web/offline/runtime.mjs';
import {createOutbox} from '../web/offline/outbox.mjs';
import {projectWorkbenchSnapshot} from '../src/workbench-snapshot.mjs';
import {snapshotBudget} from '../src/snapshot-budget.mjs';
const scope='a'.repeat(64),stamp='2026-10-28T02:00:00.000Z';
const snapshot=()=>projectWorkbenchSnapshot(Object.fromEntries(['todos','life_notes','work_notes','work_reminders','memo_groups','memos'].map(k=>[k,[]])),{scope_id:scope,generated_at:stamp,date:null},snapshotBudget());
test('undated todo queues offline, survives old capability set, and synchronizes with original UUID',async t=>{
  const db=createMemoryDB(),rows=new Map(),writes=[];let online=true;
  const request=async(path,options={})=>{
    if(!online)throw Object.assign(new Error('offline'),{code:'NETWORK_UNAVAILABLE'});
    if(path==='/auth/me')return {id:'test-user',username:'test'};
    if(path.startsWith('/workbench-snapshot'))return snapshot();
    if(path==='/unscheduled-todos'&&!options.method)return {items:[...rows.values()].filter(x=>!x.deleted_at)};
    if(path.startsWith('/unscheduled-todos/')&&!options.method) {
      const row=rows.get(path.split('/').at(-1));if(!row)throw Object.assign(new Error('missing'),{status:404});return row;
    }
    if(path==='/unscheduled-todos'&&options.method==='POST') {
      const row={...options.body,completed:false,version:1,created_at:stamp,updated_at:stamp,deleted_at:null};
      rows.set(row.id,row);writes.push(row);return row;
    }
    return {groups:[],notes:[],can_edit:true};
  };
  const runtime=createOfflineRuntime({db,request,online:()=>online,now:()=>Date.parse(stamp),features:{todos:true,notes:false,memos:false}});
  t.after(()=>runtime.stop());
  await runtime.call('/auth/me');await runtime.call('/unscheduled-todos');online=false;
  const id=randomUUID(),created=await runtime.call('/unscheduled-todos',{method:'POST',body:{id,text:'未排期'}});
  assert.equal(created.id,id);assert.equal((await runtime.call('/unscheduled-todos')).items[0].text,'未排期');
  const before=await runtime.queue();assert.equal(before.operations[0].protocol,4);
  const old=createOutbox({db,getScope:()=>scope,enabledTypes:['todo','template','note_entry','memo_note','memo_group'],supportedProtocols:[1,2,3],supportedDependencies:true,resolutionReceipts:true,request:()=>assert.fail('old consumer must not send')});
  await old.drain();assert.deepEqual((await runtime.queue()).operations,before.operations);
  online=true;await runtime.sync();
  assert.equal(writes.length,1);assert.equal(writes[0].id,id);assert.equal((await runtime.queue()).operations.length,0);
  assert.equal((await runtime.call('/unscheduled-todos')).items[0].id,id);
});

test('a create with an unknown result checks the same UUID before any resend',async()=>{
  const db=createMemoryDB(),id=randomUUID(),rows=new Map(),calls=[];
  const writer=createOutbox({db,getScope:()=>scope,supportedProtocols:[1,2,3,4],enabledTypes:['unscheduled_todo'],request:async(path,options={})=>{
    calls.push({path,method:options.method||'GET'});
    if(!options.method) return rows.get(id) || null;
    assert.fail('a confirmed previous write must not be sent again');
  }});
  const value=await writer.enqueue({scope,entity_type:'unscheduled_todo',protocol:4,entity_id:id,method:'POST',path:'/unscheduled-todos',body:{id,text:'稍后完成'}});
  rows.set(id,{id,text:'稍后完成',completed:false,version:1,created_at:stamp,updated_at:stamp,deleted_at:null});
  await db.transaction(['outbox'],'readwrite',tx=>tx.put('outbox',{...value.operation,status:'unknown'}));
  await writer.drain();assert.deepEqual(calls,[{path:'/unscheduled-todos/'+id,method:'GET'}]);
  assert.equal((await writer.list(scope)).length,0);
});

test('undated conflict choices retain original content and create distinct copies without a date',async()=>{
  const {planConflictResolution}=await import('../web/offline/conflict-plan.mjs');
  const id=randomUUID(),local={id,text:'原来的未来事项',completed:true,version:2},remote={id,text:local.text,completed:false,version:3,deleted_at:null};
  const conflict={scope,entity_id:'unscheduled_todo:'+id,local,operation:{scope,entity_type:'unscheduled_todo',entity_id:'unscheduled_todo:'+id,source_id:id}};
  const overwrite=planConflictResolution({conflict,remote,choice:'use-local'});
  assert.equal(overwrite.operations[0].path,'/unscheduled-todos/'+id);
  assert.deepEqual(overwrite.operations[0].body,{completed:true,version:3});
  const copy=planConflictResolution({conflict,remote,choice:'keep-both'});
  assert.notEqual(copy.target_id,id);assert.deepEqual(copy.operations[0].body,{id:copy.target_id,text:local.text});
  assert.deepEqual(copy.operations[1].body,{completed:true,version:1});
  assert.equal(planConflictResolution({conflict,remote,choice:'use-server'}).operations.length,0);
  assert.equal(local.text,'原来的未来事项');
});

test('undated create, completion, delete and explicit restore keep FIFO versions',async()=>{
  const db=createMemoryDB(),id=randomUUID(),calls=[];let row=null;
  const box=createOutbox({db,getScope:()=>scope,supportedProtocols:[1,2,3,4],enabledTypes:['unscheduled_todo'],request:async(path,options={})=>{
    calls.push(options.method);const body=options.body;
    if(options.method==='POST'&&!path.endsWith('/restore'))row={...body,completed:false,version:1,created_at:stamp,updated_at:stamp,deleted_at:null};
    else {assert.equal(body.version,row.version);row={...row,version:row.version+1,
      ...(options.method==='PATCH'?{completed:body.completed}:{}),
      ...(options.method==='DELETE'?{deleted_at:stamp}:{}),...(path.endsWith('/restore')?{deleted_at:null}:{})};}
    return structuredClone(row);
  }});
  const entity_id=id,entity_type='unscheduled_todo',protocol=4;
  for(const [method,path,body] of [['POST','/unscheduled-todos',{id,text:'未来'}],['PATCH','/unscheduled-todos/'+id,{completed:true,version:1}],['DELETE','/unscheduled-todos/'+id,{version:2}],['POST','/unscheduled-todos/'+id+'/restore',{version:3}]])
    await box.enqueue({scope,entity_id,entity_type,protocol,method,path,body});
  await box.drain();assert.deepEqual(calls,['POST','PATCH','DELETE','POST']);assert.equal(row.version,4);assert.equal(row.completed,true);assert.equal(row.deleted_at,null);
  assert.equal((await box.list(scope)).length,0);
});
