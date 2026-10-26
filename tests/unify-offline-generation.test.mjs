import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryDB,entityKey} from '../web/offline/db.mjs';
import {createOutbox} from '../web/offline/outbox.mjs';
import {createOfflineRuntime} from '../web/offline/runtime.mjs';
import {offlineStatusLabel} from '../web/offline/ui.mjs';
import {projectWorkbenchSnapshot} from '../src/workbench-snapshot.mjs';
import {snapshotBudget} from '../src/snapshot-budget.mjs';

const scope='a'.repeat(64),date='2026-10-27',stamp='2026-10-26T01:00:00Z';
const all=(db,store)=>db.transaction([store],'readonly',tx=>tx.getAll(store));
const bOptions={enabledTypes:['todo','template'],supportedProtocols:[1]};
const snapshot=(day=null)=>projectWorkbenchSnapshot(Object.fromEntries(
  ['todos','life_notes','work_notes','work_reminders','memo_groups','memos'].map(key=>[key,[]])),
  {scope_id:scope,generated_at:stamp,date:day},snapshotBudget());
function peer(db,request=()=>assert.fail('the newer peer only enqueues')) {
  return createOutbox({db,request,getScope:()=>scope});
}
async function newerRows(db) {
  const writer=peer(db),group=randomUUID(),note=randomUUID(),child=randomUUID();
  const values=[await writer.enqueue({scope,entity_type:'note_entry',entity_id:note,method:'PUT',
    body:{category:'life',date,text:'Synthetic newer note body',version:0}}),
  await writer.enqueue({scope,entity_type:'memo_group',entity_id:group,method:'PUT',body:{title:'Synthetic newer group',position:0,version:0}}),
  await writer.enqueue({scope,entity_type:'memo_note',entity_id:child,method:'PUT',
    body:{group_id:group,title:'Synthetic child',body:'Synthetic child body must remain intact',position:0,version:0}})];
  await db.transaction(['outbox'],'readwrite',async tx=>{
    const operation=values[2].operation;
    await tx.put('outbox',{...operation,protocol:2,depends_on:['memo-group:'+group]});
  });
  return values;
}
test('a retained B consumer never sends or erases newer note, group or protocol-two dependent operations',async()=>{
  const db=createMemoryDB(),values=await newerRows(db),before=await all(db,'outbox'),entities=await all(db,'entities'),calls=[];
  const old=createOutbox({...bOptions,db,getScope:()=>scope,request:async(path,options)=>{
    calls.push({path,method:options.method});const id=path.split('/').at(-1);
    return {...options.body,id,version:1,can_edit:true,deleted_at:null};
  }});
  const result=await old.drain();
  assert.equal(calls.length,0,'an old page must not dispatch a new peer operation');
  assert.deepEqual(await all(db,'outbox'),before,'unsupported operation bytes are retained');
  assert.deepEqual(await all(db,'entities'),entities,'both newer body and local version remain unchanged');
  assert.equal(result.pending,3);assert.equal(result.unsupported,3);assert.equal(result.phase,'upgrade-required');
  assert.equal((await old.list(scope)).length,values.length);assert.deepEqual(await old.retryable(scope),[]);
});
test('an unsupported unknown-result operation cannot be mistaken for a verified acknowledgement',async()=>{
  const db=createMemoryDB(),id=randomUUID(),saved=await peer(db).enqueue({scope,entity_type:'todo',entity_id:id,
    method:'POST',body:{id,date,text:'Synthetic unknown-protocol body'}});
  await db.transaction(['outbox'],'readwrite',tx=>tx.put('outbox',{...saved.operation,protocol:99,status:'unknown'}));
  const before=await all(db,'outbox'),calls=[];
  const old=createOutbox({...bOptions,db,getScope:()=>scope,request:async(path)=>{
    calls.push(path);return {items:[{id,date,text:'Synthetic unknown-protocol body',completed:false,version:1}]};
  }});
  const result=await old.drain();assert.equal(calls.length,0,'even a matching remote item cannot acknowledge an unknown protocol');
  assert.deepEqual(await all(db,'outbox'),before);assert.equal(result.unsupported,1);
});
test('unsupported runtime queue remains visible as needing an update and never starts a fast retry cycle',async t=>{
  const db=createMemoryDB();await newerRows(db);const calls=[];
  const runtime=createOfflineRuntime({db,features:{todos:true,notes:false,memos:false},request:async(path,options={})=>{
    calls.push({path,method:options.method||'GET'});
    if(path==='/auth/me')return {id:'synthetic-owner',username:'Synthetic owner',publicBusiness:true};
    if(path.startsWith('/workbench-snapshot'))return snapshot(path.includes('?')?date:null);
    if(options.method)return {...options.body,id:path.split('/').at(-1),version:1,can_edit:true,deleted_at:null};
    return {can_edit:true,groups:[],notes:[]};
  }});t.after(()=>runtime.stop());
  await runtime.sync();const count=calls.length;
  assert.equal(runtime.state.pending,3);assert.equal(runtime.state.unsupported,3);
  assert.equal(offlineStatusLabel(runtime.state),'需新版');
  const queue=await runtime.queue();assert.equal(queue.operations.length,3);
  assert.ok(queue.operations.every(row=>row.needs_upgrade===true));
  assert.equal(calls.filter(row=>row.method!=='GET').length,0);
  await new Promise(resolve=>setTimeout(resolve,350));assert.equal(calls.length,count,'unsupported rows must not schedule 100ms polling');
});
test('protocol-one enqueue is explicit and type, protocol and dependency capabilities all fail closed',async()=>{
  const db=createMemoryDB(),id=randomUUID(),writer=peer(db);
  const saved=await writer.enqueue({scope,entity_type:'note_entry',entity_id:id,method:'PUT',body:{category:'life',date,text:'Synthetic protocol one',version:0}});
  assert.equal(saved.operation.protocol,1,'new operations explicitly record the implemented wire protocol');
  const old=createOutbox({...bOptions,supportedProtocols:[1,2],db,getScope:()=>scope,request:()=>assert.fail('enqueue does not send')});
  assert.equal(old.canDispatch(saved.operation),false,'an implemented type still needs runtime enablement');
  const todo={scope,entity_type:'todo',entity_id:randomUUID(),method:'POST',body:{date,text:'Synthetic capability check'}};
  const before=await all(db,'outbox');
  for(const input of [{...todo,protocol:2},{...todo,protocol:0},{...todo,protocol:99},{...todo,protocol:null},
    {...todo,depends_on:[]},{...todo,protocol:1,depends_on:['memo-group:'+randomUUID()]},
    {scope,entity_type:'note_entry',entity_id:randomUUID(),method:'PUT',body:{category:'life',date,text:'Synthetic disabled type',version:0}}])
    await assert.rejects(old.enqueue(input),error=>error.code==='OFFLINE_UPGRADE_REQUIRED');
  for(const protocol of [undefined,1,2,99])for(const depends_on of [[],null,['memo-group:'+randomUUID()]])
    assert.equal(old.canDispatch({...todo,protocol,depends_on}),false,'a matching type never bypasses an unimplemented dependency');
  assert.deepEqual(await all(db,'outbox'),before);
});
test('legacy missing-protocol todo replay keeps its original UUID and ordered compatible writes run exactly once',async()=>{
  const db=createMemoryDB(),id=randomUUID(),writer=peer(db),writes=[];let remote=null;
  const first=await writer.enqueue({scope,entity_type:'todo',entity_id:id,method:'POST',body:{id,date,text:'Synthetic legacy UUID'}});
  await writer.enqueue({scope,entity_type:'todo',entity_id:id,method:'PATCH',body:{completed:true,version:1}});
  const legacy={...first.operation,status:'unknown'};delete legacy.protocol;
  await db.transaction(['outbox'],'readwrite',tx=>tx.put('outbox',legacy));
  const old=createOutbox({...bOptions,db,getScope:()=>scope,request:async(path,options={})=>{
    if(!options.method)return path.startsWith('/todos?')?{items:remote?[remote]:[]}:{complete:true,scope_id:scope,data:{todos:[]}};
    writes.push({path,method:options.method,body:structuredClone(options.body)});
    remote=options.method==='POST'?{...options.body,completed:false,version:1}:{...remote,...options.body,version:2};return remote;
  }});
  const result=await old.drain();assert.equal(result.phase,'synced');assert.equal(result.pending,0);assert.equal(result.unsupported,0);
  assert.deepEqual(writes.map(row=>[row.method,row.path]),[['POST','/todos'],['PATCH','/todos/'+id]]);
  assert.equal(writes[0].body.id,id);assert.equal(writes[1].body.version,1);assert.equal(remote.completed,true);
  assert.deepEqual(await old.list(scope),[]);
});
test('an operation upgraded by a peer while its old request is in flight cannot be acknowledged by the old dispatcher',async()=>{
  const db=createMemoryDB(),id=randomUUID(),saved=await peer(db).enqueue({scope,entity_type:'todo',entity_id:id,
    method:'POST',body:{id,date,text:'Synthetic in-flight retained body'}});let writes=0;
  const old=createOutbox({...bOptions,db,getScope:()=>scope,request:async(_path,options)=>{
    writes++;
    await db.transaction(['outbox'],'readwrite',async tx=>{
      const row=await tx.get('outbox',saved.operation.key);await tx.put('outbox',{...row,protocol:2,depends_on:[]});
    });
    return {...options.body,id,completed:false,version:1};
  }});
  const result=await old.drain();assert.equal(writes,1);assert.equal(result.unsupported,1);
  const rows=await all(db,'outbox');assert.equal(rows.length,1);assert.equal(rows[0].protocol,2);
  assert.equal(rows[0].body.text,'Synthetic in-flight retained body');
  assert.equal((await all(db,'entities'))[0].dirty,true,'the unknown generation never receives a local acknowledgement');
});
test('an unsupported entity head also prevents fast retries of a compatible later operation on that entity',async t=>{
  const db=createMemoryDB(),id=randomUUID(),writer=peer(db);
  const first=await writer.enqueue({scope,entity_type:'todo',entity_id:id,method:'POST',body:{id,date,text:'Synthetic blocked head'}});
  await writer.enqueue({scope,entity_type:'todo',entity_id:id,method:'PATCH',body:{completed:true,version:1}});
  await db.transaction(['outbox'],'readwrite',tx=>tx.put('outbox',{...first.operation,protocol:2}));let reads=0;
  const runtime=createOfflineRuntime({db,request:async path=>{
    reads++;if(path==='/auth/me')return {id:'synthetic-owner',username:'Synthetic owner',publicBusiness:true};
    assert.ok(path.startsWith('/workbench-snapshot'));return snapshot(path.includes('?')?date:null);
  }});t.after(()=>runtime.stop());
  await runtime.sync();const count=reads;assert.equal(runtime.state.pending,2);assert.equal(runtime.state.unsupported,1);
  await new Promise(resolve=>setTimeout(resolve,350));assert.equal(reads,count);
  assert.equal((await all(db,'outbox')).length,2);
});
test('outbox capabilities do not block the existing ordinary online memo API',async t=>{
  const db=createMemoryDB(),id=randomUUID(),calls=[];
  const runtime=createOfflineRuntime({db,request:async(path,options)=>{
    calls.push({path,options});assert.equal(Object.hasOwn(options,'offlineGuard'),false);return {saved:true};
  }});t.after(()=>runtime.stop());
  assert.deepEqual(await runtime.call('/memos/notes/'+id,{method:'PUT',body:{title:'Synthetic online memo',body:'Synthetic text',version:0}}),{saved:true});
  assert.equal(calls.length,1);assert.equal(calls[0].path,'/memos/notes/'+id);assert.deepEqual(await all(db,'outbox'),[]);
});
test('an unsupported peer conflict remains readable and an old page cannot archive it as a resolved acknowledgement',async t=>{
  const db=createMemoryDB(),values=await newerRows(db),writer=peer(db);
  const conflict=await writer.conflicts.record({operation:values[0].operation,remote:null,reason:'version'});
  const before=await all(db,'outbox');
  const runtime=createOfflineRuntime({db,features:{todos:true,notes:false,memos:false},online:()=>false,
    request:()=>assert.fail('no unsupported conflict transport')});
  t.after(()=>runtime.stop());Object.assign(runtime.state,{scope,identity:{id:'synthetic-owner',username:'Synthetic owner'}});
  const queue=await runtime.queue();assert.equal(queue.conflicts.length,1);assert.equal(queue.conflicts[0].needs_upgrade,true);
  await assert.rejects(runtime.resolve(conflict.key,'use-server'),error=>error.code==='OFFLINE_UPGRADE_REQUIRED');
  assert.deepEqual(await all(db,'outbox'),before);assert.equal((await all(db,'conflicts'))[0].resolved_at,null);
});
test('malformed persisted type and path metadata never routes a todo dispatcher into the online memo API',async t=>{
  for(const kind of ['memo-index','memo-note','different-uuid','wrong-method'])await t.test(kind,async t=>{
    const db=createMemoryDB(),id=randomUUID(),saved=await peer(db).enqueue({scope,entity_type:'todo',entity_id:id,
      method:'POST',body:{id,date,text:'Synthetic retained malformed operation'}});
    const routes={'memo-index':['POST','/memos'],'memo-note':['PUT','/memos/notes/'+id],
      'different-uuid':['PATCH','/todos/'+randomUUID()],'wrong-method':['PUT','/todos/'+id]};
    const [method,path]=routes[kind],malformed={...saved.operation,method,path};
    await db.transaction(['outbox'],'readwrite',tx=>tx.put('outbox',malformed));const writes=[],entities=await all(db,'entities');
    const old=createOutbox({...bOptions,db,getScope:()=>scope,request:()=>assert.fail('malformed rows never dispatch')});
    assert.equal((await old.drain()).unsupported,1);
    const runtime=createOfflineRuntime({db,request:async(path,options={})=>{
      if(path==='/auth/me')return {id:'synthetic-owner',username:'Synthetic owner',publicBusiness:true};
      if(path.startsWith('/workbench-snapshot'))return snapshot(path.includes('?')?date:null);
      writes.push(path);return {...options.body,id,version:1};
    }});t.after(()=>runtime.stop());
    await runtime.sync();assert.deepEqual(writes,[]);assert.deepEqual(await all(db,'outbox'),[malformed]);
    assert.deepEqual(await all(db,'entities'),entities);assert.deepEqual(await all(db,'conflicts'),[]);
    assert.equal(runtime.state.unsupported,1);assert.equal(offlineStatusLabel(runtime.state),'需新版');
  });
});
test('an error response cannot let an old conflict handler modify a peer-upgraded protocol operation',async t=>{
  for(const status of [409,404,410])await t.test(String(status),async()=>{
    const db=createMemoryDB(),id=randomUUID(),saved=await peer(db).enqueue({scope,entity_type:'todo',entity_id:id,
      method:'POST',body:{id,date,text:'Synthetic upgraded conflict body'}});const calls=[],entities=await all(db,'entities');let upgraded;
    const old=createOutbox({...bOptions,db,getScope:()=>scope,request:async(path,options={})=>{
      calls.push(path);
      if(options.method){
        await db.transaction(['outbox'],'readwrite',async tx=>{
          upgraded={...await tx.get('outbox',saved.operation.key),protocol:2,depends_on:[]};await tx.put('outbox',upgraded);
        });
        throw Object.assign(new Error('Synthetic conflict'),{status,code:'VERSION_CONFLICT'});
      }
      return path.startsWith('/todos?')?{items:[]}:{complete:true,scope_id:scope,data:{todos:[]}};
    }});
    const result=await old.drain();assert.equal(calls.length,1,'no unsupported reconciliation reads after the peer upgrade');
    assert.deepEqual(await all(db,'outbox'),[upgraded]);assert.deepEqual(await all(db,'conflicts'),[]);
    assert.deepEqual(await all(db,'entities'),entities);assert.equal(result.pending,1);assert.equal(result.unsupported,1);
  });
});
test('the conflict transaction preserves a protocol upgrade that happens during reconciliation',async t=>{
  for(const status of [409,404])await t.test(String(status),async()=>{
    const db=createMemoryDB(),id=randomUUID(),saved=await peer(db).enqueue({scope,entity_type:'todo',entity_id:id,
      method:'POST',body:{id,date,text:'Synthetic mid-reconciliation upgrade'}});const calls=[],entities=await all(db,'entities');let upgraded;
    const old=createOutbox({...bOptions,db,getScope:()=>scope,request:async(path,options={})=>{
      calls.push(path);
      if(options.method)throw Object.assign(new Error('Synthetic conflict'),{status,code:'VERSION_CONFLICT'});
      assert.ok(path.startsWith('/todos?'));
      await db.transaction(['outbox'],'readwrite',async tx=>{
        upgraded={...await tx.get('outbox',saved.operation.key),protocol:2,depends_on:[]};await tx.put('outbox',upgraded);
      });
      return {items:[{id,date,text:'Synthetic conflicting server text',completed:false,version:1}]};
    }});
    const result=await old.drain();assert.equal(calls.length,2,'one write and the reconciliation already in flight');
    assert.deepEqual(await all(db,'outbox'),[upgraded]);assert.deepEqual(await all(db,'conflicts'),[]);
    assert.deepEqual(await all(db,'entities'),entities);assert.equal(result.pending,1);assert.equal(result.unsupported,1);
  });
});
