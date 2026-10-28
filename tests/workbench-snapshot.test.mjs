import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {digest} from '../src/security.mjs';
import {snapshotBudget} from '../src/snapshot-budget.mjs';
import {handleWorkbenchSnapshot,readWorkbenchSnapshotData,projectWorkbenchSnapshot} from '../src/workbench-snapshot.mjs';

const DATE='2026-10-24',STAMP=DATE+'T01:02:03.000Z',LATER='2026-10-25T12:00:00.000Z';
const OWNER='10000000-0000-4000-8000-000000000001',NOTES='20000000-0000-4000-8000-000000000002';
const MEMOS='30000000-0000-4000-8000-000000000003',OTHER='40000000-0000-4000-8000-000000000004';
const TOKEN='a'.repeat(64),OTHER_TOKEN='b'.repeat(64);
function fixture(t) {
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())
    db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  function insert(table,row) {
    const keys=Object.keys(row);
    db.prepare(`INSERT INTO matrix_${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...keys.map(key=>row[key]));
  }
  for(const id of [OWNER,NOTES,MEMOS,OTHER])insert('users',{id,username:id,password_hash:'PASSWORD-HASH-CANARY',created_at:STAMP});
  insert('control',{id:1,initialized:1});
  insert('sessions',{token_hash:digest(TOKEN),user_id:OWNER,expires_at:'2099-01-01T00:00:00.000Z'});
  insert('sessions',{token_hash:digest(OTHER_TOKEN),user_id:OTHER,expires_at:'2099-01-01T00:00:00.000Z'});
  insert('accounts',{id:'included',name:'Included',platform:'synthetic',created_at:STAMP});
  insert('accounts',{id:'excluded',name:'Excluded',platform:'synthetic',created_at:STAMP});
  const env={SITE_ORIGIN:'http://localhost',PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:OWNER,
    DAILY_NOTES_OWNER_ID:NOTES,MEMOS_OWNER_ID:MEMOS,PUBLIC_BUSINESS_ACCOUNT_IDS:'["included"]'};
  const scope={ownerId:OWNER,notesOwnerId:NOTES,memosOwnerId:MEMOS};
  const queries=[];
  const store={all:async(sql,...args)=>{queries.push(sql);return db.prepare(sql).all(...args);}};
  const todo=(id,date=DATE,extra={})=>insert('todos',{user_id:OWNER,id,date,text:'todo '+id,completed:0,version:1,created_at:STAMP,updated_at:STAMP,...extra});
  const legacy=(category='life',date=DATE,extra={})=>insert(category==='life'?'daily_notes':'daily_work_notes',
    {user_id:NOTES,date,text:'legacy '+category,version:1,change_seq:1,created_at:STAMP,updated_at:STAMP,...extra});
  const entry=(id,category='life',date=DATE,extra={})=>insert('note_entries',
    {user_id:NOTES,id,category,date,text:'entry '+id,version:1,change_seq:1,created_at:STAMP,updated_at:STAMP,...extra});
  const group=(id,extra={})=>insert('memo_groups',
    {user_id:MEMOS,id,title:'group '+id,position:0,version:1,change_seq:1,created_at:STAMP,updated_at:STAMP,...extra});
  const memo=(id,group_id,extra={})=>insert('memo_notes',
    {user_id:MEMOS,id,group_id,title:'memo '+id,body:'memo body '+id,position:0,version:1,change_seq:1,created_at:STAMP,updated_at:STAMP,...extra});
  const reminder=(id,date=DATE,extra={})=>insert('work_reminders',
    {user_id:NOTES,id,date,source_key:'source '+id,summary:'summary '+id,version:1,change_seq:1,created_at:STAMP,updated_at:STAMP,...extra});
  async function read(date=null,{limits={},source=store}={}) {
    const budget=snapshotBudget(limits),data=await readWorkbenchSnapshotData(source,scope,budget);
    return projectWorkbenchSnapshot(data,{scope_id:'test-scope',generated_at:STAMP,date},budget);
  }
  function database({after,missingReceipt=false}={}) {
    const calls=[];
    function wrap(sql,args=[]) {
      return {bind:(...next)=>wrap(sql,next),async all() {
        assert.match(sql,/^\s*SELECT\b/i,'snapshot may not execute writes');
        calls.push(sql);const results=db.prepare(sql).all(...args);
        await after?.(sql,results);
        return {results,meta:missingReceipt?{}:{rows_read:results.length,rows_written:0}};
      }};
    }
    return {calls,prepare:sql=>wrap(sql)};
  }
  async function request(path='/workbench-snapshot?date='+DATE,{headers={},environment=env,limits={},hooks={}}={}) {
    const adapter=database(hooks),request=new Request(env.SITE_ORIGIN+'/api/v1'+path,{headers});
    const response=await handleWorkbenchSnapshot(adapter,request,path.split('?')[0],environment,{limits});
    return {response,value:(await response.json()).data,adapter};
  }
  return {db,env,scope,insert,store,queries,todo,legacy,entry,group,memo,reminder,read,request};
}
const error=(status,code)=>value=>value.status===status&&(!code||value.code===code);
const entity=(value,id)=>value.entities.find(row=>row.entity_id===id);

test('v2 opt-in includes undated todos and label catalog without changing the v1 projection',async t=>{
  const f=fixture(t);f.todo('today');f.entry('tagged');f.entry('plain');
  const old=(await f.request()).value;
  f.insert('note_labels',{user_id:NOTES,name:'合成标签',created_at:STAMP});
  f.insert('note_labels',{user_id:NOTES,name:'空标签',created_at:STAMP});
  f.insert('note_entry_labels',{user_id:NOTES,entry_id:'tagged',label:'合成标签'});
  f.insert('unscheduled_todos',{user_id:OWNER,id:'undated',text:'未来事项',completed:0,version:1,created_at:STAMP,updated_at:STAMP});
  const legacy=(await f.request()).value;
  assert.equal(legacy.manifest_hash,old.manifest_hash,'default v1 excludes additions and keeps prior hashes');
  assert.deepEqual(legacy.data,old.data);
  const index=(await f.request('/workbench-snapshot/index?version=2')).value;
  const daily=(await f.request('/workbench-snapshot?date='+DATE+'&version=2')).value;
  assert.equal(daily.snapshot_format,'haoduoyu-workbench-snapshot-v2');
  assert.notEqual(daily.scope_id,legacy.scope_id);
  assert.equal(index.manifest_hash,daily.manifest_hash);
  assert.equal(entity(index,'unscheduled_todo:undated').date,null);
  assert.equal(daily.data.unscheduled_todos[0].text,'未来事项');
  assert.deepEqual(daily.data.note_labels.map(row=>row.name).sort(),['合成标签','空标签']);
  assert.equal(daily.data.life_notes.find(row=>row.source_id==='tagged').label,'合成标签');
  assert.equal(Object.hasOwn(daily.data.life_notes.find(row=>row.source_id==='plain'),'label'),false);
  assert.notEqual(entity(index,'note-entry:tagged').content_hash,entity(legacy,'note-entry:tagged').content_hash);
  assert.equal(entity(index,'note-entry:plain').content_hash,entity(legacy,'note-entry:plain').content_hash);
  f.db.prepare('UPDATE matrix_unscheduled_todos SET deleted_at=?,updated_at=?,version=2 WHERE id=?').run(LATER,LATER,'undated');
  const removed=(await f.request('/workbench-snapshot?date='+DATE+'&version=2')).value;
  assert.equal(removed.data.unscheduled_todos[0].deleted_at,LATER);
  assert.equal(Object.hasOwn(removed.data.unscheduled_todos[0],'text'),false);
  assert.notEqual(removed.global_content_hash,daily.global_content_hash);
  for(const path of ['/workbench-snapshot/index?version=1','/workbench-snapshot/index?version=2&version=2',
    '/workbench-snapshot?date='+DATE+'&version=3'])await assert.rejects(f.request(path),error(400,'VALIDATION_ERROR'));
});

test('workbench projects complete selected-date records and independently scoped undated memos',async t=>{
  const f=fixture(t);
  f.todo('current');f.todo('old','2023-01-02');f.todo('other',DATE,{user_id:OTHER,text:'OTHER-TODO-CANARY'});
  f.legacy();f.legacy('work');f.entry('one');f.entry('two');f.entry('work','work');f.entry('old','work','2021-02-03');
  f.entry('other','life',DATE,{user_id:OWNER,text:'OTHER-NOTE-CANARY'});
  f.group('global');f.memo('undated','global');f.group('private',{user_id:NOTES});
  f.memo('private','private',{user_id:NOTES,body:'OTHER-MEMO-CANARY'});
  f.reminder('reminder');f.reminder('private',DATE,{user_id:OTHER,summary:'OTHER-REMINDER-CANARY'});
  const index=await f.read(),daily=await f.read(DATE);
  assert.equal(daily.snapshot_format,'haoduoyu-workbench-snapshot-v1');assert.equal(daily.complete,true);
  assert.deepEqual(index.dates.map(row=>row.date),['2021-02-03','2023-01-02',DATE]);
  assert.equal(daily.manifest_hash,index.manifest_hash);assert.deepEqual(daily.entities,index.entities);
  assert.equal(daily.date_content_hash,index.dates.find(row=>row.date===DATE).content_hash);
  assert.equal(daily.global_content_hash,index.global_content_hash);
  assert.deepEqual(daily.data.todos.map(row=>row.source_id),['current']);
  assert.deepEqual(daily.data.life_notes.map(row=>row.entity_id),['legacy-life:'+DATE,'note-entry:one','note-entry:two']);
  assert.deepEqual(daily.data.work_notes.map(row=>row.entity_id),['legacy-work:'+DATE,'note-entry:work']);
  assert.equal(daily.data.memos[0].date,null,'memo update timestamp never invents a historical note date');
  assert.equal(daily.data.memos[0].created_at,STAMP);assert.equal(daily.data.memos[0].body,'memo body undated');
  assert.equal(daily.data.work_reminders[0].source_key,'source reminder');
  for(const canary of ['OTHER-TODO-CANARY','OTHER-NOTE-CANARY','OTHER-MEMO-CANARY','OTHER-REMINDER-CANARY',OWNER,NOTES,MEMOS,OTHER,'user_id','password_hash','token_hash'])
    assert.ok(!JSON.stringify(daily).includes(canary),canary);
  assert.ok(f.queries.every(sql=>!/^SELECT\s+\*/i.test(sql)));
});

test('full manifest detects old edits, date moves, final-record deletions and unchanged dedupe hashes',async t=>{
  const f=fixture(t);f.todo('old','2020-01-02');f.entry('old','life','2021-02-03');f.group('g');f.memo('m','g');
  const first=await f.read();
  f.db.prepare('UPDATE matrix_note_entries SET text=?,version=2,updated_at=? WHERE id=?').run('old day edited now',LATER,'old');
  const edited=await f.read();
  assert.notEqual(entity(first,'note-entry:old').content_hash,entity(edited,'note-entry:old').content_hash);
  assert.equal(entity(first,'todo:old').content_hash,entity(edited,'todo:old').content_hash);
  f.db.prepare('UPDATE matrix_todos SET date=?,version=2,updated_at=? WHERE id=?').run('2020-01-03',LATER,'old');
  const moved=await f.read();assert.equal(entity(moved,'todo:old').date,'2020-01-03');
  assert.equal((await f.read('2020-01-02')).data.todos.length,0);
  f.db.prepare('UPDATE matrix_note_entries SET deleted_at=?,updated_at=?,version=3 WHERE id=?').run(LATER,LATER,'old');
  const deleted=await f.read(),detail=await f.read('2021-02-03');
  assert.equal(entity(deleted,'note-entry:old').deleted_at,LATER);
  assert.equal(detail.data.life_notes[0].deleted_at,LATER);
  assert.ok(!JSON.stringify(detail).includes('old day edited now'),'deleted source content stays hidden');
  assert.equal(Object.hasOwn(detail.data.life_notes[0],'text'),false);
  assert.equal((await f.read()).manifest_hash,deleted.manifest_hash,'unchanged reads deduplicate');
  assert.notEqual(first.manifest_hash,edited.manifest_hash);
  assert.notEqual(edited.manifest_hash,moved.manifest_hash);
  assert.notEqual(moved.manifest_hash,deleted.manifest_hash);
});

test('parent memo deletion yields effective child tombstones and restoration restores source content',async t=>{
  const f=fixture(t);f.group('g');f.memo('m','g');const before=await f.read(DATE);
  f.db.prepare('UPDATE matrix_memo_groups SET deleted_at=?,updated_at=?,version=2 WHERE id=?').run(LATER,LATER,'g');
  const deleted=await f.read(DATE),child=deleted.data.memos[0];
  assert.equal(child.deleted_at,LATER);assert.equal(child.updated_at,LATER);assert.equal(child.group_id,'g');
  for(const key of ['title','body','position'])assert.equal(Object.hasOwn(child,key),false,key);
  assert.ok(!JSON.stringify(deleted).includes('memo body m'));
  assert.notEqual(before.global_content_hash,deleted.global_content_hash);
  assert.notEqual(entity(before,'memo-note:m').content_hash,entity(deleted,'memo-note:m').content_hash);
  f.db.prepare('UPDATE matrix_memo_groups SET deleted_at=NULL,version=3 WHERE id=?').run('g');
  const restored=await f.read('2020-01-01');assert.equal(restored.data.memos[0].body,'memo body m');
  assert.equal(restored.data.memos[0].deleted_at,null);
  assert.equal(entity(restored,'memo-note:m').content_hash,entity(before,'memo-note:m').content_hash);
});

test('source order and generated time never affect hashes; full reads page past 200 records',async t=>{
  const f=fixture(t);for(let i=0;i<205;i++)f.entry(String(i).padStart(3,'0'));
  const first=await f.read(DATE),reverse={all:async(sql,...args)=>(await f.store.all(sql,...args)).reverse()};
  const budget=snapshotBudget(),data=await readWorkbenchSnapshotData(reverse,f.scope,budget);
  const backwards=projectWorkbenchSnapshot(data,{scope_id:'test-scope',generated_at:LATER,date:DATE},budget);
  assert.equal(first.data.life_notes.length,205);assert.equal(backwards.content_hash,first.content_hash);
  assert.equal(backwards.manifest_hash,first.manifest_hash);assert.equal(backwards.global_content_hash,first.global_content_hash);
  assert.ok(f.queries.filter(sql=>sql.includes('FROM matrix_note_entries')).length>=4);
});

test('every whole-request budget rejects explicitly instead of returning incomplete success',async t=>{
  const f=fixture(t);f.todo('today');f.todo('old','2023-01-02');f.entry('text','life',DATE,{text:'x'.repeat(3000)});
  for(const limits of [{maxRows:1},{maxBytes:50},{maxDates:1},{maxHashBytes:50},{maxResponseBytes:50},{maxQueries:2},{maxRowsRead:1}])
    await assert.rejects(f.request('/workbench-snapshot/index',{limits}),error(413,'SNAPSHOT_LIMIT'),JSON.stringify(limits));
  await assert.rejects(f.request(undefined,{hooks:{missingReceipt:true}}),error(503,'SNAPSHOT_BUDGET'));
});

test('opt-in route validates exact queries, retains existing owner/account auth and verifies memo owner',async t=>{
  const f=fixture(t);f.todo('t');f.group('g');f.memo('m','g');
  const anonymous=await f.request(),owner=await f.request(undefined,{headers:{Cookie:'matrix_session='+TOKEN}});
  assert.notEqual(anonymous.value.scope_id,owner.value.scope_id,'existing account scope remains part of identity');
  assert.equal(anonymous.response.headers.get('Cache-Control'),'private, no-store');
  assert.equal(anonymous.response.headers.get('Vary'),'Cookie, Authorization');
  assert.ok(owner.adapter.calls.length<=45);assert.ok(anonymous.adapter.calls.length<=45);
  for(const path of ['/workbench-snapshot','/workbench-snapshot?date=2026-02-30','/workbench-snapshot?date='+DATE+'&date='+DATE,
    '/workbench-snapshot?date='+DATE+'&notes=all','/workbench-snapshot/index?after=2026-01-01','/workbench-snapshot/index?date='+DATE])
    await assert.rejects(f.request(path),error(400,'VALIDATION_ERROR'),path);
  for(const Authorization of ['','Bearer hdy_'+'c'.repeat(64)])
    await assert.rejects(f.request(undefined,{headers:{Authorization}}),error(403,'SNAPSHOT_SESSION_REQUIRED'));
  await assert.rejects(f.request(undefined,{headers:{Cookie:'matrix_session='+OTHER_TOKEN}}),error(403,'FORBIDDEN'));
  await assert.rejects(f.request(undefined,{environment:{...f.env,PUBLIC_BUSINESS_MODE:'0'}}),error(401));
  await assert.rejects(f.request(undefined,{environment:{...f.env,MEMOS_OWNER_ID:undefined}}),error(503,'MEMOS_CONFIG'));
  await assert.rejects(f.request(undefined,{environment:{...f.env,MEMOS_OWNER_ID:'50000000-0000-4000-8000-000000000005'}}),error(503,'SNAPSHOT_CONFIG'));
  const changedOwner=await f.request(undefined,{environment:{...f.env,MEMOS_OWNER_ID:OTHER}});
  assert.notEqual(anonymous.value.scope_id,changedOwner.value.scope_id,'memo-owner change requires a new baseline');
  for(const method of ['POST','PUT','DELETE'])
    await assert.rejects(handleWorkbenchSnapshot({},new Request('http://localhost/workbench-snapshot?date='+DATE,{method}),
      '/workbench-snapshot',f.env),error(404));
});

test('a concurrent update restarts the entire consistent read and reauthenticates',async t=>{
  const f=fixture(t);f.todo('t');f.entry('e');let fired=false;
  const {value,adapter}=await f.request(undefined,{headers:{Cookie:'matrix_session='+TOKEN},hooks:{after(sql) {
    if(fired||!sql.includes('FROM matrix_todos'))return;fired=true;
    f.db.prepare('UPDATE matrix_todos SET text=?,version=2,updated_at=?').run('updated todo',LATER);
    f.db.prepare('UPDATE matrix_note_entries SET text=?,version=2,updated_at=?').run('updated entry',LATER);
    f.db.exec('UPDATE matrix_control SET revision=revision+1 WHERE id=1');
  }}});
  assert.equal(value.data.todos[0].text,'updated todo');assert.equal(value.data.life_notes[0].text,'updated entry');
  assert.equal(adapter.calls.filter(sql=>sql.includes('FROM matrix_todos')).length,2);
  assert.ok(adapter.calls.filter(sql=>sql.includes('FROM matrix_sessions')).length>=3);
  assert.equal(value.manifest_hash,(await f.request(undefined,{headers:{Cookie:'matrix_session='+TOKEN}})).value.manifest_hash);
});

test('session revocation during projection cannot return the private snapshot',async t=>{
  const f=fixture(t);f.todo('t');let fired=false;
  await assert.rejects(f.request(undefined,{headers:{Cookie:'matrix_session='+TOKEN},hooks:{after(sql) {
    if(fired||!sql.includes('FROM matrix_note_entries'))return;fired=true;
    f.db.exec('DELETE FROM matrix_sessions; UPDATE matrix_control SET revision=revision+1 WHERE id=1');
  }}}),error(401,'UNAUTHORIZED'));
});

test('malformed source dates and timestamps fail rather than silently excluding old records',async t=>{
  const f=fixture(t);f.todo('t');
  for(const date of ['2026-02-30','not-a-date']) {
    f.db.prepare('UPDATE matrix_todos SET date=?').run(date);
    await assert.rejects(f.read(),error(503,'SNAPSHOT_DATA'));
  }
  f.db.prepare('UPDATE matrix_todos SET date=?').run(DATE);
  for(const updated of ['2026-10-24T24:00:00Z','2026-10-24T00:00:00','bad timestamp']) {
    f.db.prepare('UPDATE matrix_todos SET updated_at=?').run(updated);
    await assert.rejects(f.read(),error(503,'SNAPSHOT_DATA'));
  }
});
