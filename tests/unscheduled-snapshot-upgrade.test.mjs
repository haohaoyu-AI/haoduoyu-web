import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createMemoryDB,entityKey} from '../web/offline/db.mjs';
import {createSnapshotSync} from '../web/offline/sync.mjs';
import {createOutbox} from '../web/offline/outbox.mjs';
import {projectWorkbenchSnapshot} from '../src/workbench-snapshot.mjs';
import {snapshotBudget} from '../src/snapshot-budget.mjs';
const scope='a'.repeat(64),stamp='2026-10-28T01:00:00.000Z',date='2026-10-28';
const collections=['todos','life_notes','work_notes','work_reminders','memo_groups','memos'];
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
function v2(day,id) {
  let row={entity_id:'unscheduled_todo:'+id,entity_type:'unscheduled_todo',source:'unscheduled_todo',source_id:id,date:null,version:1,
    created_at:stamp,updated_at:stamp,deleted_at:null,text:'未排期',completed:0};row={...row,content_hash:hash(row)};
  const entity={entity_id:row.entity_id,entity_type:row.entity_type,date:null,updated_at:stamp,deleted_at:null,content_hash:row.content_hash};
  const entities=[entity],format='haoduoyu-workbench-snapshot-v2',manifest=hash({snapshot_format:format,scope_id:scope,entities});
  const common={snapshot_format:format,projection:'current',complete:true,scope_id:scope,timezone:'Asia/Shanghai',generated_at:stamp,
    manifest_hash:manifest,global_content_hash:hash({scope_id:scope,entities}),entities};
  if(!day)return {...common,dates:[],index_hash:manifest};
  const data=Object.fromEntries([...collections,'unscheduled_todos','note_labels'].map(k=>[k,k==='unscheduled_todos'?[row]:[]]));
  return {...common,date:day,date_content_hash:hash({scope_id:scope,entities:[]}),data,
    content_hash:hash({snapshot_format:format,scope_id:scope,date:day,timezone:'Asia/Shanghai',data})};
}
test('upgrade and concurrent old/new snapshot readers preserve old queues and drafts without rebinding',async()=>{
  const db=createMemoryDB(),undatedId=randomUUID(),todoId=randomUUID(),calls=[];
  const box=createOutbox({db,getScope:()=>scope,request:()=>assert.fail('no network write')});
  await box.enqueue({scope,entity_type:'todo',entity_id:todoId,method:'POST',body:{id:todoId,date,text:'保留原待办'}});
  const draft={key:entityKey(scope,'draft:proof'),scope,draft_kind:'note',data:{id:randomUUID(),text:'保留草稿'}};
  await db.transaction(['meta'],'readwrite',tx=>tx.put('meta',draft));
  const before=await box.list(scope),empty=Object.fromEntries(collections.map(k=>[k,[]]));
  const request=async path=>{calls.push(path);const u=new URL(path,'https://example.invalid');const day=u.searchParams.get('date');
    return u.searchParams.get('version')==='2'?v2(day,undatedId):projectWorkbenchSnapshot(empty,{scope_id:scope,generated_at:stamp,date:day},snapshotBudget());};
  const old=createSnapshotSync({db,getScope:()=>scope,request}),next=createSnapshotSync({db,getScope:()=>scope,request,version:2});
  await Promise.all([old.pull({date}),next.pull({date})]);
  assert.deepEqual(await box.list(scope),before);
  const stored=await db.transaction(['meta','entities'],'readonly',async tx=>({draft:await tx.get('meta',draft.key),
    old:await tx.get('meta',entityKey(scope,'snapshot')),next:await tx.get('meta',entityKey(scope,'snapshot-v2')),
    item:await tx.get('entities',entityKey(scope,'unscheduled_todo:'+undatedId))}));
  assert.deepEqual(stored.draft,draft);assert.ok(stored.old&&stored.next);assert.equal(stored.item.server.text,'未排期');
  assert.equal(stored.item.server.completed,false);assert.ok(!Object.hasOwn(stored.item.server,'date'));
  assert.ok(calls.includes('/workbench-snapshot/index?version=2'));
  await old.pull({date});
  assert.equal((await db.transaction(['entities'],'readonly',tx=>tx.get('entities',entityKey(scope,'unscheduled_todo:'+undatedId)))).server.text,'未排期');
});
