import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createMemoryDB,entityKey} from '../web/offline/db.mjs';
import {createOfflineCache} from '../web/offline/cache.mjs';
import {documentValue} from '../web/offline/document.mjs';
import {latestCompleteSnapshot,latestGlobalSnapshot,snapshotExcludesEntity} from '../web/offline/read-only.mjs';

const scope='a'.repeat(64),other='b'.repeat(64),stamp='2026-11-14T01:00:00Z';
const coverage={from:'2026-09-16',to:'2026-11-14'},today=coverage.to;
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
function record(type,date,extra={}) {
  const id=extra.id||randomUUID(),prefix=type==='life_note'?'note-entry':type==='legacy'?'legacy-life':
    type==='work_reminder'?'work-reminder':type==='unscheduled_todo'?'unscheduled_todo':'todo';
  const row={entity_id:prefix+':'+(type==='legacy'?date:id),entity_type:type==='legacy'?'life_note':type,
    source:type==='legacy'?'legacy_daily_note':type==='life_note'?'note_entry':type,
    source_id:type==='legacy'?date:id,date,version:1,created_at:stamp,updated_at:stamp,deleted_at:null,
    ...(type==='life_note'||type==='legacy'?{category:'life',text:'合成碎碎念'}:
      type==='work_reminder'?{summary:'合成提醒',source_key:'fixture'}:{text:'合成事项',completed:0}),...extra};
  delete row.id;return {...row,content_hash:hash(row)};
}
function index(records,owner=scope) {
  const entities=records.map(({entity_id,entity_type,date,updated_at,deleted_at,content_hash})=>
    ({entity_id,entity_type,date,updated_at,deleted_at,content_hash})).sort((a,b)=>a.entity_id.localeCompare(b.entity_id));
  return {snapshot_format:'haoduoyu-workbench-snapshot-v2',projection:'current',complete:true,scope_id:owner,
    timezone:'Asia/Shanghai',generated_at:stamp,manifest_hash:hash(entities),global_content_hash:hash(entities.filter(row=>row.date===null)),
    entities,dates:[...new Set(entities.filter(row=>row.date!==null).map(row=>row.date))].sort().map(date=>
      ({date,content_hash:hash(entities.filter(row=>row.date===date))}))};
}
function setup() {
  const db=createMemoryDB(),state={scope,generation:0,time:300};
  const cache=createOfflineCache({db,getScope:()=>state.scope,getGeneration:()=>state.generation,now:()=>state.time});
  return {db,state,cache};
}
async function putRecord(f,row,extra={}) {
  const server={...row,id:row.source_id};
  if(row.entity_type==='unscheduled_todo'){delete server.date;server.completed=Boolean(server.completed);}
  await f.db.transaction(['entities'],'readwrite',tx=>tx.put('entities',
    {key:entityKey(scope,row.entity_id),scope,entity_id:row.entity_id,server,snapshot_hash:row.content_hash,...extra}));
}
async function putProof(f,name,records,{bounds=coverage,time=200,partial=true,owner=scope,covered}={}) {
  await f.db.transaction(['meta'],'readwrite',tx=>tx.put('meta',{key:entityKey(scope,name),value:{index:index(records,owner),
    verified_at:time,partial,...(bounds?{coverage:bounds}:{}),...(covered?{covered_dates:covered}:{})}}));
}
const proof=(f,date)=>f.db.transaction(['meta'],'readonly',tx=>latestCompleteSnapshot(tx,scope,date));
const entity=(f,row)=>f.db.transaction(['entities'],'readonly',tx=>tx.get('entities',entityKey(scope,row.entity_id)));
const todoPath=date=>'/todos?date='+date;
const notePath=date=>'/note-entries?category=life&date='+date;
const missing=error=>error.code==='OFFLINE_CACHE_MISS';
function exclusion(row,manifestHash) {
  return {manifest_hash:manifestHash,version:row.server.version,updated_at:row.server.updated_at,
    date:row.server.date,snapshot_hash:row.snapshot_hash??null};
}

test('bounded proofs cover both 60-day edges and empty interior dates, never outside or full history',async()=>{
  const f=setup(),first=record('todo',coverage.from),last=record('todo',today);
  for(const row of [first,last])await putRecord(f,row);
  await putProof(f,'snapshot-v2-window',[first,last]);
  assert.equal((await f.cache.read(todoPath(coverage.from))).data.items[0].id,first.source_id);
  assert.equal((await f.cache.read(todoPath(today))).data.items[0].id,last.source_id);
  assert.deepEqual((await f.cache.read(todoPath('2026-10-01'))).data.items,[]);
  for(const date of ['2026-09-15','2026-11-15'])await assert.rejects(f.cache.read(todoPath(date)),missing);
  assert.equal(await proof(f),null);
  await assert.rejects(f.cache.read('/note-entries/dates?category=life'),missing);
  await assert.rejects(f.cache.read('/daily-notes/dates?category=life'),missing);
});
test('an explicit historical day proves only that day and malformed ranges fail closed',async()=>{
  const f=setup(),old=record('todo','2001-01-01');await putRecord(f,old);
  await putProof(f,'snapshot-v2-date:2001-01-01',[old],{bounds:{from:old.date,to:old.date}});
  assert.equal((await f.cache.read(todoPath(old.date))).data.items[0].id,old.source_id);
  assert.equal(await proof(f),null);assert.equal(await proof(f,'2001-01-02'),null);
  for(const bounds of [{from:'2001-01-01',to:today},{from:'2026-02-30',to:today},{from:today,to:coverage.from}]) {
    await putProof(f,'snapshot-v2-window',[],{bounds});
    assert.equal(await proof(f,today),null);
  }
});
test('archived full and progressive evidence preserve readable historical dates without certifying a history list',async()=>{
  const f=setup(),old=record('life_note','2001-01-01'),legacy=record('legacy','2001-01-02');
  for(const row of [old,legacy])await putRecord(f,row);
  await putProof(f,'snapshot-v2-archive',[old,legacy],{bounds:null,partial:false,time:100});
  await putProof(f,'snapshot-v2-window',[]);
  assert.equal(documentValue((await f.cache.read(notePath(old.date))).data.entries[0]).text,old.text);
  assert.equal((await f.cache.read('/daily-notes?category=life&date='+legacy.date)).data.text,legacy.text);
  assert.equal(await proof(f),null);
  await assert.rejects(f.cache.read('/note-entries/dates?category=life'),missing);
  await f.db.transaction(['meta'],'readwrite',tx=>tx.delete('meta',entityKey(scope,'snapshot-v2-archive')));
  await putProof(f,'snapshot-v2-progress-archive',[old],{bounds:null,covered:[old.date],time:100});
  assert.ok(await proof(f,old.date));assert.equal(await proof(f,'2001-01-03'),null);
  await putProof(f,'snapshot-v2-progress-archive',[old],{bounds:null,partial:false,time:100});
  assert.equal(await proof(f,old.date),null,'progress archives always require explicit covered-date evidence');
  assert.deepEqual((await entity(f,old)).server.text,old.text);
});
test('archived and bounded bodies require current matching hashes and timestamps',async()=>{
  for(const name of ['snapshot-v2-archive','snapshot-v2-window'])for(const changed of ['hash','updated','content']) {
    const f=setup(),row=record('todo',today);await putRecord(f,row);
    await putProof(f,name,[row],{bounds:name.endsWith('archive')?null:coverage,partial:!name.endsWith('archive')});
    const stored=await entity(f,row);
    if(changed==='hash')stored.snapshot_hash='f'.repeat(64);
    if(changed==='updated')stored.server.updated_at='2026-11-14T02:00:00Z';
    if(changed==='content')stored.server.content_hash='e'.repeat(64);
    await f.db.transaction(['entities'],'readwrite',tx=>tx.put('entities',stored));
    await assert.rejects(f.cache.read(todoPath(today)),missing);
    assert.ok((await entity(f,row)).server,'a failed proof does not delete cached history');
  }
});
test('a matching range exclusion hides stale cached server rows while retaining their bodies and local edits',async()=>{
  const f=setup(),todo=record('todo',today),note=record('life_note',today),reminder=record('work_reminder',today);
  for(const row of [todo,note,reminder]) {
    await putRecord(f,row);const stored=await entity(f,row);
    stored.window_exclusion=exclusion(stored,index([]).manifest_hash);
    await f.db.transaction(['entities'],'readwrite',tx=>tx.put('entities',stored));
  }
  await putProof(f,'snapshot-v2-window',[]);
  assert.deepEqual((await f.cache.read(todoPath(today))).data.items,[]);
  assert.deepEqual((await f.cache.read(notePath(today))).data.entries,[]);
  assert.deepEqual((await f.cache.read('/work-reminders?date='+today)).data.items,[]);
  const stored=await entity(f,note);
  assert.equal(stored.server.text,note.text);assert.equal(stored.remote_missing,undefined);
  stored.dirty=true;stored.local={...stored.server,text:'保留本机编辑'};
  await f.db.transaction(['entities'],'readwrite',tx=>tx.put('entities',stored));
  assert.equal(snapshotExcludesEntity(await proof(f,today),stored),false);
  assert.equal(documentValue((await f.cache.read(notePath(today))).data.entries[0]).text,'保留本机编辑');
});
test('an exclusion cannot hide later API data and explicit API caches cannot inherit an old snapshot hash',async()=>{
  const f=setup(),row=record('todo',today);await putRecord(f,row);
  const stored=await entity(f,row);stored.window_exclusion=exclusion(stored,index([]).manifest_hash);
  await f.db.transaction(['entities'],'readwrite',tx=>tx.put('entities',stored));
  await putProof(f,'snapshot-v2-window',[]);
  const newer={id:row.source_id,date:today,text:'API已确认的新内容',version:2,completed:false,
    created_at:stamp,updated_at:'2026-11-14T02:00:00Z',deleted_at:null};
  await f.cache.write(todoPath(today),{items:[newer]});
  const current=await entity(f,row);
  assert.equal(current.window_exclusion,null);assert.equal(current.snapshot_hash,null);
  assert.equal((await f.cache.read(todoPath(today))).data.items[0].text,newer.text);
  assert.equal(snapshotExcludesEntity(await proof(f,today),{...current,window_exclusion:stored.window_exclusion}),false);
});
test('unverified range omissions and every mismatched exclusion field fail closed',async()=>{
  const f=setup(),row=record('todo',today);await putRecord(f,row);await putProof(f,'snapshot-v2-window',[]);
  await assert.rejects(f.cache.read(todoPath(today)),missing);
  const stored=await entity(f,row),snapshot=await proof(f,today);
  const marker=exclusion(stored,snapshot.value.index.manifest_hash);
  assert.equal(snapshotExcludesEntity(snapshot,{...stored,window_exclusion:marker}),true);
  for(const key of ['manifest_hash','version','updated_at','date','snapshot_hash'])
    assert.equal(snapshotExcludesEntity(snapshot,{...stored,window_exclusion:{...marker,[key]:null}}),false,key);
  assert.equal((await entity(f,row)).server.text,row.text);
});
test('fresh API note reads remain visible after a bounded omission and retain API-only editing authority',async()=>{
  const f=setup(),row=record('life_note',today);await putRecord(f,row);
  const stored=await entity(f,row);stored.window_exclusion=exclusion(stored,index([]).manifest_hash);
  await f.db.transaction(['entities'],'readwrite',tx=>tx.put('entities',stored));
  await putProof(f,'snapshot-v2-window',[]);
  const newer={id:row.source_id,category:'life',date:today,text:'API确认的碎碎念',version:2,change_seq:2,
    created_at:stamp,updated_at:'2026-11-14T02:00:00Z',deleted_at:null,deleted:false,can_edit:true,content_hash:'d'.repeat(64)};
  await f.cache.write(notePath(today),{category:'life',date:today,can_edit:true,entries:[newer]});
  const value=(await f.cache.read(notePath(today))).data;
  assert.equal(value.entries[0].text,newer.text);assert.equal(value.can_edit,true);
  assert.equal((await entity(f,row)).window_exclusion,null);assert.equal((await entity(f,row)).snapshot_hash,null);
});
test('global undated completeness is separate from history completeness and remains scoped',async()=>{
  const f=setup(),row=record('unscheduled_todo',null);await putRecord(f,row);
  await putProof(f,'snapshot-v2-window',[row]);
  const global=await f.db.transaction(['meta'],'readonly',tx=>latestGlobalSnapshot(tx,scope));
  assert.equal(global.value.global_complete,true);assert.equal(await proof(f),null);
  assert.equal((await f.cache.read('/unscheduled-todos')).data.items[0].id,row.source_id);
  assert.equal((await f.cache.read('/unscheduled-todos')).data.items[0].completed,false);
  f.state.scope=other;await assert.rejects(f.cache.read('/unscheduled-todos'),missing);
  f.state.scope=scope;await putProof(f,'snapshot-v2-window',[row],{owner:other});
  assert.equal(await proof(f,today),null);
});
test('a legacy v1 full proof cannot certify the v2 undated collection empty',async()=>{
  const f=setup();
  await f.db.transaction(['meta'],'readwrite',tx=>tx.put('meta',{key:entityKey(scope,'snapshot'),
    value:{index:{...index([]),snapshot_format:'haoduoyu-workbench-snapshot-v1'},verified_at:100}}));
  assert.equal(await f.db.transaction(['meta'],'readonly',tx=>latestGlobalSnapshot(tx,scope)),null);
  await assert.rejects(f.cache.read('/unscheduled-todos'),missing);
});
