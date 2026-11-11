import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createSnapshotSync} from '../web/offline/sync.mjs';
import {entityKey,createMemoryDB,offlineValue} from '../web/offline/db.mjs';
import {projectWorkbenchSnapshot} from '../src/workbench-snapshot.mjs';
import {snapshotBudget} from '../src/snapshot-budget.mjs';

const scope='a'.repeat(64),otherScope='b'.repeat(64),stamp='2026-10-26T01:00:00.000Z';
const names=['todos','life_notes','work_notes','work_reminders','memo_groups','memos'];
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const empty=()=>Object.fromEntries(names.map(name=>[name,[]]));
function record({id=randomUUID(),date='2026-10-25',version=1,text='合成笔记',deleted=false,type='life_note',completed=1}={}) {
  const group=type==='memo_group',todo=type==='todo',prefix=group?'memo-group':todo?'todo':'note-entry';
  const source=group?'memo_group':todo?'todo':'note_entry';
  const row={entity_id:prefix+':'+id,entity_type:type,source,source_id:id,date:group?null:date,
    ...(group||todo?{}:{category:'life'}),version,change_seq:version,created_at:stamp,updated_at:stamp,deleted_at:deleted?stamp:null,
    ...(deleted?{}:group?{title:text,position:0}:todo?{text,completed}:{text})};
  return {...row,content_hash:hash(row)};
}
function data(...rows) {
  const result=empty();
  for(const row of rows)result[row.entity_type==='memo_group'?'memo_groups':row.entity_type==='todo'?'todos':'life_notes'].push(row);
  for(const list of Object.values(result))list.sort((a,b)=>a.entity_id<b.entity_id?-1:1);return result;
}
function projected(rows,date=null,owner=scope) {
  return projectWorkbenchSnapshot(rows,{scope_id:owner,generated_at:stamp,date},snapshotBudget());
}
function memoryDb() {
  let stores=Object.fromEntries(['entities','outbox','conflicts','meta'].map(name=>[name,new Map()])),tail=Promise.resolve();
  return {read:(store,key)=>structuredClone(stores[store].get(key)),all:store=>structuredClone([...stores[store].values()]),
    transaction(storeNames,mode,callback) {
      const operation=tail.then(async()=>{
        const working=Object.fromEntries(storeNames.map(name=>[name,new Map([...stores[name]].map(([key,value])=>[key,structuredClone(value)]))]));
        const tx={get:async(name,key)=>structuredClone(working[name].get(key)),getAll:async name=>structuredClone([...working[name].values()]),
          put:async(name,value)=>{assert.equal(mode,'readwrite');working[name].set(value.key,structuredClone(value));},
          delete:async(name,key)=>{assert.equal(mode,'readwrite');working[name].delete(key);}};
        const result=await callback(tx);if(mode==='readwrite')stores={...stores,...working};return result;
      });tail=operation.catch(()=>{});return operation;
    }};
}
function setup(rows,{db=memoryDb(),limits,getScope=()=>scope,hook}={}) {
  const calls=[],source={rows,scope};
  const request=async path=>{
    calls.push(path);if(hook)await hook(path,calls,source,db);
    return projected(source.rows,path.includes('?date=')?new URL('http://localhost'+path).searchParams.get('date'):null,source.scope);
  };
  return {db,calls,source,sync:createSnapshotSync({db,request,getScope,now:()=>Date.parse(stamp),limits})};
}

test('snapshot pull downloads only changed dates and keeps undated data and local drafts',async()=>{
  const old=record(),recent=record({date:'2026-10-26'}),memo=record({type:'memo_group',text:'备忘录组'}),app=setup(data(old,recent,memo));
  const first=await app.sync.pull();assert.equal(first.status,'synced');assert.deepEqual(first.changed_dates,['2026-10-25','2026-10-26']);
  assert.equal(app.calls.filter(path=>path.includes('?date=')).length,2);
  const key=entityKey(scope,old.entity_id);
  await app.db.transaction(['entities'],'readwrite',async tx=>{await tx.put('entities',{...await tx.get('entities',key),local:{text:'未发送草稿'},dirty:true});});
  app.calls.length=0;await app.sync.pull();assert.deepEqual(app.calls,['/workbench-snapshot/index','/workbench-snapshot/index']);
  const changed=record({id:old.source_id,version:2,text:'线上更新'});app.source.rows=data(changed,recent,memo);app.calls.length=0;
  const result=await app.sync.pull();assert.deepEqual(result.changed_dates,['2026-10-25']);
  assert.deepEqual(app.calls.filter(path=>path.includes('?date=')),['/workbench-snapshot?date=2026-10-25']);
  const saved=app.db.read('entities',key);assert.equal(saved.server.text,'线上更新');assert.equal(saved.server.id,old.source_id);
  assert.deepEqual(saved.local,{text:'未发送草稿'});assert.equal(saved.dirty,true);
  assert.equal(app.db.read('entities',entityKey(scope,memo.entity_id)).server.title,'备忘录组');
});

test('same-version todo snapshots retain confirmed API links without changing canonical snapshot evidence',async()=>{
  const todo=record({type:'todo',completed:1}),template=randomUUID(),app=setup(data(todo));
  const key=entityKey(scope,todo.entity_id);
  await app.db.transaction(['entities'],'readwrite',tx=>tx.put('entities',{key,scope,entity_id:todo.entity_id,
    server:{id:todo.source_id,version:1,template_id:template,template_version:3,template_active:true},dirty:false}));
  await app.sync.pull();const saved=app.db.read('entities',key);
  assert.equal(saved.server.template_id,template);assert.equal(saved.server.template_version,3);
  assert.equal(saved.server.template_active,true);assert.equal(saved.needs_api_refresh,false);
  assert.equal(saved.server.completed,1);assert.equal(offlineValue(saved).completed,true);
  assert.equal(saved.snapshot_hash,todo.content_hash);assert.equal(saved.server.content_hash,todo.content_hash);
});

test('newer todo snapshots discard stale links, flag API refresh and project zero as boolean false only on read',async()=>{
  const todo=record({type:'todo'}),app=setup(data(todo)),key=entityKey(scope,todo.entity_id);
  await app.db.transaction(['entities'],'readwrite',tx=>tx.put('entities',{key,scope,entity_id:todo.entity_id,
    server:{id:todo.source_id,version:1,template_id:randomUUID(),template_version:3,template_active:true},dirty:false}));
  await app.sync.pull();const newer=record({type:'todo',id:todo.source_id,version:2,completed:0});
  app.source.rows=data(newer);await app.sync.pull();const saved=app.db.read('entities',key);
  for(const field of ['template_id','template_version','template_active'])assert.equal(Object.hasOwn(saved.server,field),false);
  assert.equal(saved.needs_api_refresh,true);assert.equal(saved.server.completed,0);
  assert.equal(offlineValue(saved).completed,false);assert.equal(saved.snapshot_hash,newer.content_hash);
  const fresh=record({type:'todo'});app.source.rows=data(newer,fresh);await app.sync.pull();
  assert.equal(app.db.read('entities',entityKey(scope,fresh.entity_id)).needs_api_refresh,true);
});

test('undated memo-only changes fetch one explicit probe day and global removals retain local copies',async()=>{
  const memo=record({type:'memo_group'}),app=setup(data(memo));await app.sync.pull({date:'2026-10-26'});
  assert.deepEqual(app.calls.filter(path=>path.includes('?date=')),['/workbench-snapshot?date=2026-10-26']);
  const key=entityKey(scope,memo.entity_id);
  await app.db.transaction(['entities'],'readwrite',async tx=>{await tx.put('entities',{...await tx.get('entities',key),local:{title:'本机保留'}});});
  app.source.rows=empty();app.calls.length=0;await app.sync.pull();
  assert.equal(app.calls.length,2);const saved=app.db.read('entities',key);
  assert.equal(saved.server,null);assert.equal(saved.remote_missing,true);assert.equal(saved.local.title,'本机保留');
});

test('a failed second date or bounded server error never commits a partially downloaded batch',async()=>{
  const app=setup(data(record(),record({date:'2026-10-26'})),{hook:async path=>{
    if(path.includes('date=2026-10-26'))throw Object.assign(new Error('source budget'),{status:413,code:'SNAPSHOT_LIMIT'});
  }});
  await assert.rejects(app.sync.pull(),error=>error.status===413&&error.code==='SNAPSHOT_LIMIT');
  assert.deepEqual(app.db.all('entities'),[]);assert.deepEqual(app.db.all('meta'),[]);
  assert.equal(app.sync.state.status,'error');assert.equal(app.sync.state.last_success,null);
});

test('a manifest change between index and detail leaves the previous complete cache intact',async()=>{
  const original=record(),app=setup(data(original));await app.sync.pull();
  const before=app.db.all('entities'),oldMeta=app.db.all('meta');let indexes=0;
  const request=async path=>{
    if(path.endsWith('/index'))indexes++;
    const current=record({id:original.source_id,version:indexes>=2?3:2,text:indexes>=2?'又更新':'中间更新'});
    return projected(data(current),path.includes('?date=')?'2026-10-25':null);
  };
  const sync=createSnapshotSync({db:app.db,request,getScope:()=>scope});
  await assert.rejects(sync.pull(),error=>error.code==='OFFLINE_SNAPSHOT_CHANGED');
  assert.deepEqual(app.db.all('entities'),before);assert.deepEqual(app.db.all('meta'),oldMeta);
});

test('missing records, modified payloads and false completeness are rejected without overwriting cache',async t=>{
  for(const damage of ['omit','body','complete'])await t.test(damage,async()=>{
    const row=record(),db=memoryDb(),request=async path=>{
      const value=projected(data(row),path.includes('?date=')?'2026-10-25':null);
      if(damage==='complete')value.complete=false;
      else if(path.includes('?date=')) {
        if(damage==='omit')value.data.life_notes=[];
        else value.data.life_notes[0].text='正文被改变但哈希未匹配';
      }
      return value;
    };
    const sync=createSnapshotSync({db,request,getScope:()=>scope});
    await assert.rejects(sync.pull(),error=>error.code==='OFFLINE_SNAPSHOT_INVALID');
    assert.deepEqual(db.all('entities'),[]);assert.deepEqual(db.all('meta'),[]);
  });
});

test('remote tombstones do not revive entries or destroy local modifications and pending operations',async()=>{
  const original=record(),app=setup(data(original));await app.sync.pull();const key=entityKey(scope,original.entity_id);
  await app.db.transaction(['entities','outbox'],'readwrite',async tx=>{
    await tx.put('entities',{...await tx.get('entities',key),local:{text:'离线修改应保留'},dirty:true});
    await tx.put('outbox',{key:'pending',scope,entity_id:original.entity_id,body:{text:'离线修改应保留'}});
  });
  app.source.rows=data(record({id:original.source_id,version:2,deleted:true}));await app.sync.pull();
  const current=app.db.read('entities',key);assert.equal(current.server.deleted_at,stamp);assert.equal(current.server.text,undefined);
  assert.equal(current.local.text,'离线修改应保留');assert.equal(app.db.all('outbox').length,1);
});

test('scope identity change never rebinds an old queue or purges another scope',async()=>{
  const db=memoryDb(),row=record(),oldKey=entityKey(otherScope,row.entity_id);let current=scope;
  await db.transaction(['entities','outbox'],'readwrite',async tx=>{
    await tx.put('entities',{key:oldKey,scope:otherScope,entity_id:row.entity_id,local:{text:'另一范围'}});
    await tx.put('outbox',{key:'old-queue',scope:otherScope,entity_id:row.entity_id,body:{text:'不可重绑'}});
  });
  const app=setup(data(row),{db,getScope:()=>current,hook:async path=>{if(path.includes('?date='))current=otherScope;}});
  await assert.rejects(app.sync.pull(),error=>error.code==='OFFLINE_SCOPE_CHANGED');
  assert.equal(db.all('entities').length,1);assert.equal(db.read('entities',oldKey).local.text,'另一范围');
  assert.equal(db.read('outbox','old-queue').scope,otherScope);
  assert.equal(app.sync.state.status,'scope-changed');
  await assert.rejects(createSnapshotSync({db,request:async()=>{throw Error('must not fetch');},getScope:()=>null}).pull(),error=>error.code==='OFFLINE_SCOPE_REQUIRED');
});

test('disappeared dates are reread and missing entities remain recoverable local records',async()=>{
  const original=record(),app=setup(data(original));await app.sync.pull();app.calls.length=0;app.source.rows=empty();
  const result=await app.sync.pull();assert.deepEqual(result.changed_dates,['2026-10-25']);
  assert.ok(app.calls.includes('/workbench-snapshot?date=2026-10-25'));
  const row=app.db.read('entities',entityKey(scope,original.entity_id));assert.equal(row.server,null);assert.equal(row.remote_missing,true);
});

test('concurrent pulls share one operation and never overwrite a newer locally confirmed server version',async()=>{
  const row=record();let release;const gate=new Promise(resolve=>{release=resolve;});let waits=0;
  const app=setup(data(row),{hook:async(path,calls,source,db)=>{
    if(path.endsWith('/index')&&++waits===1)await gate;
    if(path.endsWith('/index')&&waits===2)await db.transaction(['entities'],'readwrite',async tx=>{
      await tx.put('entities',{key:entityKey(scope,row.entity_id),scope,entity_id:row.entity_id,server:{id:row.source_id,version:3,text:'刚确认的新版本'}});
    });
  }});
  const first=app.sync.pull(),second=app.sync.pull();assert.equal(first,second);release();
  await assert.rejects(first,error=>error.code==='OFFLINE_SNAPSHOT_CHANGED');
  assert.equal(app.db.read('entities',entityKey(scope,row.entity_id)).server.version,3);assert.deepEqual(app.db.all('meta'),[]);
});

test('client request and response budgets reject whole pulls instead of marking partial data complete',async t=>{
  for(const limits of [{maxRequests:2},{maxEntities:1},{maxBatchBytes:500},{maxResponseBytes:500},{maxHashBytes:30}])
    await t.test(JSON.stringify(limits),async()=>{
      const app=setup(data(record(),record({date:'2026-10-26'})),{limits});
      await assert.rejects(app.sync.pull(),error=>['OFFLINE_SNAPSHOT_LIMIT','OFFLINE_SNAPSHOT_INVALID'].includes(error.code));
      assert.deepEqual(app.db.all('entities'),[]);assert.deepEqual(app.db.all('meta'),[]);
    });
});

test('the actual database adapter accepts complete snapshots and keeps templates outside this manifest untouched',async()=>{
  const db=createMemoryDB(),original=record(),templateKey=entityKey(scope,'todo-template:template-id');
  await db.transaction(['entities'],'readwrite',async tx=>{
    await tx.put('entities',{key:templateKey,scope,entity_id:'todo-template:template-id',server:{id:'template-id',version:1,text:'模板不在此快照'}});
    await tx.put('entities',{key:entityKey(scope,original.entity_id),scope,entity_id:original.entity_id,
      server:{id:original.source_id,version:1,text:'此前 API 已确认，但未读过快照'}});
  });
  const app=setup(empty(),{db});await app.sync.pull();
  const rows=await db.transaction(['entities'],'readonly',tx=>tx.getAll('entities'));
  assert.equal(rows.find(row=>row.key===templateKey).server.text,'模板不在此快照');
  assert.equal(rows.find(row=>row.key!==templateKey).remote_missing,true);
  app.source.rows=data(original);await app.sync.pull();
  assert.equal((await db.transaction(['entities'],'readonly',tx=>tx.get('entities',entityKey(scope,original.entity_id)))).server.id,original.source_id);
});

test('opt-in lifecycle triggers pull on open, online and visible intervals, and remove their listeners on stop',async()=>{
  const listeners={window:new Map(),document:new Map()},document={visibilityState:'visible',
    addEventListener:(name,fn)=>listeners.document.set(name,fn),removeEventListener:name=>listeners.document.delete(name)};
  const window={addEventListener:(name,fn)=>listeners.window.set(name,fn),removeEventListener:name=>listeners.window.delete(name)};
  let timer,cleared=0;
  const app=setup(empty());
  const stop=app.sync.start({window,document,setInterval:(fn,ms)=>{assert.equal(ms,300000);timer=fn;return 9;},
    clearInterval:id=>{assert.equal(id,9);cleared++;}});
  await app.sync.pull();assert.equal(app.calls.length,2);app.calls.length=0;
  document.visibilityState='hidden';timer();listeners.document.get('visibilitychange')();assert.equal(app.calls.length,0);
  document.visibilityState='visible';listeners.document.get('visibilitychange')();await app.sync.pull();assert.equal(app.calls.length,2);
  app.calls.length=0;listeners.window.get('online')();await app.sync.pull();assert.equal(app.calls.length,2);
  stop();assert.equal(cleared,1);assert.equal(listeners.window.size,0);assert.equal(listeners.document.size,0);
});
