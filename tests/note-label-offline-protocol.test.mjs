import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryDB} from '../web/offline/db.mjs';
import {createOfflineRuntime} from '../web/offline/runtime.mjs';
import {createOutbox} from '../web/offline/outbox.mjs';
import {projectWorkbenchSnapshot} from '../src/workbench-snapshot.mjs';
import {snapshotBudget} from '../src/snapshot-budget.mjs';
const scope='a'.repeat(64),date='2026-10-28',stamp='2026-10-28T01:00:00.000Z';
const empty=()=>Object.fromEntries(['todos','life_notes','work_notes','work_reminders','memo_groups','memos'].map(k=>[k,[]]));
const snap=()=>projectWorkbenchSnapshot(empty(),{scope_id:scope,generated_at:stamp},snapshotBudget());
function fixture(t) {
  const db=createMemoryDB(),remote=new Map(),receipts=new Map(),calls=[];let online=true,lose=false,time=Date.parse(stamp);
  async function request(path,opts={}) {
    const method=opts.method||'GET';calls.push({path,method,body:structuredClone(opts.body),headers:opts.headers});
    if(!online)throw Object.assign(new Error('offline'),{code:'NETWORK_UNAVAILABLE'});
    if(path==='/auth/me')return {id:'synthetic',username:'Synthetic'};
    if(path==='/workbench-snapshot/index')return snap();
    if(path.startsWith('/workbench-snapshot?'))return projectWorkbenchSnapshot(empty(),{scope_id:scope,generated_at:stamp,date},snapshotBudget());
    if(path.startsWith('/note-entries'))assert.equal(opts.headers?.['X-Note-Labels-Version'],'1');
    if(path.startsWith('/note-entries/operations/'))return receipts.get(path.split('/').at(-1))||{found:false,labels_version:1};
    if(path.startsWith('/note-entries?'))return {category:'life',date,can_edit:true,labels_version:1,entries:[...remote.values()]};
    if(path.startsWith('/note-entries/')) {
      const id=path.split('/').at(-1),old=remote.get(id);
      if(method==='GET') {if(!old)throw Object.assign(new Error('missing'),{status:404});return old;}
      const body=opts.body;
      if ((old?.version || 0) !== body.version) throw Object.assign(new Error('version'),{status:409,code:'VERSION_CONFLICT'});
      const row={id,category:body.category,date:body.date,text:body.text,version:body.version+1,change_seq:1,
        created_at:old?.created_at||stamp,updated_at:stamp,deleted_at:null,deleted:false,can_edit:true,content_hash:'b'.repeat(64),
        labels_version:1,label:body.label??old?.label??null};
      remote.set(id,row);receipts.set(body.save_id,{found:true,id,version:row.version,content_hash:row.content_hash,
        labels_version:1,label:row.label});
      if(lose){lose=false;throw Object.assign(new Error('lost'),{code:'NETWORK_UNAVAILABLE'});}return row;
    }
    throw new Error('unexpected '+path);
  }
  const app=createOfflineRuntime({db,request,now:()=>time,online:()=>online,
    features:{todos:true,notes:true,memos:false,labelsV1:true}});t.after(()=>app.stop());
  return {db,app,request,remote,receipts,calls,offline:()=>{online=false;},online:()=>{online=true;},lost:()=>{lose=true;},tick:()=>{time+=10000;}};
}
async function initialize(f) {await f.app.call('/auth/me');await f.app.call('/note-entries?category=life&date='+date);}
test('custom label is durably queued with protocol 5 and old b242 capabilities never send or archive',async t=>{
  const f=fixture(t);await initialize(f);f.offline();const id=randomUUID(),save_id=randomUUID(),text='合成标签测试';
  const local=await f.app.call('/note-entries/'+id,{method:'PUT',body:{category:'life',date,text,version:0,save_id,label:'兴趣'}});
  assert.equal(local.labels_version,1);assert.equal(local.label,'兴趣');assert.equal(local.content_hash,undefined);
  const before=await f.app.queue();assert.equal(before.operations[0].protocol,5);assert.equal(before.operations[0].save_id,save_id);
  const old=createOutbox({db:f.db,getScope:()=>scope,enabledTypes:['todo','template','note_entry','memo_group','memo_note'],
    supportedProtocols:[1,2,3],supportedDependencies:true,request:()=>assert.fail('old page must not send')});
  await old.drain();assert.deepEqual((await f.app.queue()).operations,before.operations);
  f.online();await f.app.sync();assert.equal(f.remote.get(id).label,'兴趣');assert.equal((await f.app.queue()).operations.length,0);
});
test('unknown outcome verifies receipt, label and original save id before acknowledgement',async t=>{
  const f=fixture(t);await initialize(f);const id=randomUUID(),save_id=randomUUID();f.lost();
  await f.app.call('/note-entries/'+id,{method:'PUT',body:{category:'life',date,text:'不重复',version:0,save_id,label:'兴趣'}});
  await f.app.sync();assert.equal((await f.app.queue()).operations[0].status,'unknown');f.tick();await f.app.sync();
  assert.equal((await f.app.queue()).operations.length,0);
  assert.equal(f.calls.filter(x=>x.path==='/note-entries/'+id&&x.method==='PUT').length,1);
  assert.equal(f.calls.filter(x=>x.path==='/note-entries/operations/'+save_id).length,1);
});
test('new ordinary notes keep an explicit local null label without claiming a server hash',async t=>{
  const f=fixture(t);await initialize(f);f.offline();const id=randomUUID();
  const local=await f.app.call('/note-entries/'+id,{method:'PUT',body:{category:'life',date,text:'日常',version:0,save_id:randomUUID()}});
  assert.equal(local.labels_version,1);assert.equal(local.label,null);assert.equal(local.content_hash,undefined);
});

test('an inconsistent label receipt cannot acknowledge a locally saved operation',async t=>{
  const f=fixture(t);await initialize(f);const id=randomUUID(),save_id=randomUUID();f.lost();
  await f.app.call('/note-entries/'+id,{method:'PUT',body:{category:'life',date,text:'保留本机原文',version:0,save_id,label:'兴趣'}});
  await f.app.sync();f.receipts.set(save_id,{...f.receipts.get(save_id),label:'其他'});f.tick();await f.app.sync();
  const queue=await f.app.queue();assert.equal(queue.operations.length,1);assert.equal(queue.conflicts.length,1);
  assert.equal(queue.operations[0].body.label,'兴趣');assert.equal(queue.operations[0].save_id,save_id);
});
test('offline cached entry preserves its explicit custom label and pending provenance',async t=>{
  const f=fixture(t);await initialize(f);f.offline();const id=randomUUID();
  await f.app.call('/note-entries/'+id,{method:'PUT',body:{category:'life',date,text:'本机未同步',version:0,save_id:randomUUID(),label:'兴趣'}});
  const list=await f.app.call('/note-entries?category=life&date='+date),row=list.entries.find(value=>value.id===id);
  assert.equal(row.label,'兴趣');assert.equal(row.labels_version,1);assert.equal(row.content_hash,undefined);
});

test('a labeled conflict keeps both texts and copies with protocol 5 and a fresh labeled UUID',async t=>{
  const f=fixture(t),id=randomUUID();
  f.remote.set(id,{id,category:'life',date,text:'原文',version:1,change_seq:1,created_at:stamp,updated_at:stamp,
    deleted_at:null,deleted:false,can_edit:true,content_hash:'b'.repeat(64),labels_version:1,label:'兴趣'});
  await initialize(f);f.offline();const save_id=randomUUID();
  await f.app.call('/note-entries/'+id,{method:'PUT',body:{category:'life',date,text:'本机原文',version:1,save_id}});
  f.remote.set(id,{...f.remote.get(id),text:'线上原文',version:2,change_seq:2});f.online();await f.app.sync();
  const original=(await f.app.queue()).conflicts[0];assert.ok(original);assert.equal(original.local.label,'兴趣');
  const result=await f.app.resolve(original.key,'keep-both',{copyConfirmed:true});
  assert.equal(result.resolution.state,'queued');
  const copy=(await f.app.queue()).operations.find(x=>x.resolution_id===result.resolution.id);
  assert.equal(copy.protocol,5);assert.notEqual(copy.source_id,id);assert.equal(copy.body.label,'兴趣');
  assert.equal(copy.body.text,'本机原文');assert.notEqual(copy.save_id,save_id);
  const archived=await f.db.transaction(['outbox'],'readonly',tx=>tx.get('outbox',original.operation.key));
  assert.equal(archived.status,'archived');assert.equal(archived.body.text,'本机原文');
  await f.app.sync();assert.equal(f.remote.get(id).text,'线上原文');assert.equal(f.remote.get(copy.source_id).label,'兴趣');
});
