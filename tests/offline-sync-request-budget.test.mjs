import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {createMemoryDB, entityKey} from '../web/offline/db.mjs';
import {createOfflineRuntime} from '../web/offline/runtime.mjs';
import {projectWorkbenchSnapshot} from '../src/workbench-snapshot.mjs';
import {snapshotBudget} from '../src/snapshot-budget.mjs';

const scope='a'.repeat(64), stamp='2026-10-26T01:00:00.000Z', date='2026-10-25';
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
function todo(id,day) {
  const row={entity_id:'todo:'+id,entity_type:'todo',source:'todo',source_id:id,date:day,version:1,
    created_at:stamp,updated_at:stamp,deleted_at:null,text:'合成任务',completed:0};
  return {...row,content_hash:createHash('sha256').update(JSON.stringify(stable(row))).digest('hex')};
}
function fixture() {
  const db=createMemoryDB(), calls=[], source={online:true,owner:scope}, ids=[randomUUID(),randomUUID()];
  const rows=Object.fromEntries(['todos','life_notes','work_notes','work_reminders','memo_groups','memos','unscheduled_todos','note_labels'].map(k=>[k,[]]));
  rows.todos=[todo(ids[0],date),todo(ids[1],'2026-10-26')].sort((a,b)=>a.entity_id.localeCompare(b.entity_id));
  let pause, entered; const reached=new Promise(resolve=>{entered=resolve;}), gate=new Promise(resolve=>{pause=resolve;});
  let blocked=false;
  const request=async(path,options={})=>{
    calls.push(path);
    if(path==='/auth/me')return {id:'synthetic',username:'测试',publicBusiness:true};
    if(path==='/todos' && options.method==='POST')return {...options.body,completed:false,version:1,
      created_at:stamp,updated_at:stamp,deleted_at:null};
    if(path.startsWith('/workbench-snapshot')) {
      const u=new URL(path,'https://example.invalid'),version=u.searchParams.get('version')==='2'?2:1;
      if(blocked && path.startsWith('/workbench-snapshot?date=')){blocked=false;entered();await gate;}
      return projectWorkbenchSnapshot(rows,{scope_id:source.owner,generated_at:stamp,date:u.searchParams.get('date'),version},snapshotBudget());
    }
    if(path.startsWith('/todos?')) return {date:new URL(path,'https://example.invalid').searchParams.get('date'),items:[]};
    return {items:[]};
  };
  const app=createOfflineRuntime({db,request,now:()=>Date.parse(stamp),online:()=>source.online,
    features:{todos:true,notes:false,memos:false,snapshotV2:true}});
  return {app,db,calls,source,ids,block(){blocked=true;},reached,release:pause};
}
test('v2 cold sync fetches each changed date once, shares reentry and projects a complete scoped month',async t=>{
  const f=fixture();t.after(()=>f.app.stop());f.block();
  const first=f.app.sync();await f.reached;const repeated=f.app.sync();const month=f.app.readTodoMonthSnapshot('2026-10');
  f.release();await Promise.all([first,repeated]);const result=await month;
  assert.equal(f.calls.filter(p=>p.startsWith('/workbench-snapshot?date=')).length,2);
  assert.ok(f.calls.filter(p=>p.startsWith('/workbench-snapshot?date=')).every(p=>p.includes('version=2')));
  assert.equal(result.days[date][0].id,f.ids[0]);assert.equal(result.days['2026-10-26'][0].id,f.ids[1]);
  assert.equal(result.days['2026-10-01'],undefined,'a complete manifest proves omitted dates empty');
  await new Promise(resolve=>setTimeout(resolve,30));assert.equal(f.calls.filter(p=>p.startsWith('/workbench-snapshot?date=')).length,2);
  const key=entityKey(scope,'todo:'+f.ids[0]);
  await f.db.transaction(['entities'],'readwrite',async tx=>{const row=await tx.get('entities',key);await tx.put('entities',{...row,dirty:true,local:{...row.server,text:'本地待同步'}});});
  assert.equal((await f.app.readTodoMonthSnapshot('2026-10')).days[date][0].text,'本地待同步');
  await f.db.transaction(['entities'],'readwrite',tx=>tx.delete('entities',key));
  assert.equal(await f.app.readTodoMonthSnapshot('2026-10'),null,'missing manifest entities cannot be projected');
});
test('parallel reads share a scope probe and scope changes still reject results',async t=>{
  const f=fixture();t.after(()=>f.app.stop());await f.app.call('/auth/me');f.calls.length=0;
  await Promise.all(Array.from({length:5},(_,i)=>f.app.call('/todos?date=2026-10-'+String(i+1).padStart(2,'0'))));
  assert.equal(f.calls.filter(p=>p==='/workbench-snapshot/index').length,1);
  f.source.owner='b'.repeat(64);
  await assert.rejects(f.app.call('/todos?date=2026-10-01'),e=>e.code==='OFFLINE_SCOPE_CHANGED');
});
test('a queued write during a snapshot gets a follow-up drain even when its retry timer fires in flight',async t=>{
  const f=fixture();t.after(()=>f.app.stop());f.block();
  f.app.start({window:null,document:null,BroadcastChannel:null});await f.reached;
  const id=randomUUID();await f.app.call('/todos',{method:'POST',body:{id,date,text:'本机待同步'}});
  await new Promise(resolve=>setTimeout(resolve,150));
  f.release();
  for(let n=0;n<30 && (await f.app.queue()).operations.length;n++)await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal((await f.app.queue()).operations.length,0);
  assert.equal(f.calls.filter(path=>path==='/todos').length,1);
});
