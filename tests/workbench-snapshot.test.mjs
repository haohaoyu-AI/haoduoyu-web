import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {digest} from '../src/security.mjs';
import {snapshotBudget} from '../src/snapshot-budget.mjs';
import {handleWorkbenchSnapshot,readWorkbenchSnapshotData,projectWorkbenchSnapshot} from '../src/workbench-snapshot.mjs';
import {cachedWorkbenchWindow} from '../src/workbench-snapshot-window.mjs';

const DATE='2026-10-24',STAMP=DATE+'T01:02:03.000Z',LATER='2026-10-25T12:00:00.000Z';
const OWNER='10000000-0000-4000-8000-000000000001',NOTES='20000000-0000-4000-8000-000000000002';
const MEMOS='30000000-0000-4000-8000-000000000003',OTHER='40000000-0000-4000-8000-000000000004';
const TOKEN='a'.repeat(64),OTHER_TOKEN='b'.repeat(64);
const WINDOW='/workbench-snapshot?window=date&date='+DATE+'&version=2';
let fixtureId=0;
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
  const env={SITE_ORIGIN:'http://localhost:'+(18000+fixtureId++),PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:OWNER,
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
  async function read(date=null,{limits={},source=store,version=1}={}) {
    const budget=snapshotBudget(limits),data=await readWorkbenchSnapshotData(source,scope,budget,{version});
    return projectWorkbenchSnapshot(data,{scope_id:'test-scope',generated_at:STAMP,date,version},budget);
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
  const sharedDatabase=database();
  async function request(path=WINDOW,{headers={},environment=env,limits={},hooks,adapter=hooks?database(hooks):sharedDatabase,
    now=()=>Date.parse('2026-10-24T16:00:00Z')}={}) {
    const start=adapter.calls.length,request=new Request(env.SITE_ORIGIN+'/api/v1'+path,{headers});
    const response=await handleWorkbenchSnapshot(adapter,request,path.split('?')[0],environment,{limits,now});
    const body=await response.json();
    return {response,value:body.data,error:body.error,adapter:{calls:adapter.calls.slice(start)},database:adapter};
  }
  const changed=()=>db.exec('UPDATE matrix_control SET revision=revision+1 WHERE id=1');
  return {db,env,scope,insert,store,queries,todo,legacy,entry,group,memo,reminder,read,request,database,changed};
}
const error=(status,code)=>value=>value.status===status&&(!code||value.code===code);
const entity=(value,id)=>value.entities.find(row=>row.entity_id===id);

test('v2 opt-in includes undated todos and label catalog without changing the v1 projection',async t=>{
  const f=fixture(t);f.todo('today');f.entry('tagged');f.entry('plain');
  const old=await f.read(DATE);
  f.insert('note_labels',{user_id:NOTES,name:'合成标签',created_at:STAMP});
  f.insert('note_labels',{user_id:NOTES,name:'空标签',created_at:STAMP});
  f.insert('note_entry_labels',{user_id:NOTES,entry_id:'tagged',label:'合成标签'});
  f.insert('unscheduled_todos',{user_id:OWNER,id:'undated',text:'未来事项',completed:0,version:1,created_at:STAMP,updated_at:STAMP});
  const legacy=await f.read(DATE);
  assert.equal(legacy.manifest_hash,old.manifest_hash,'default v1 excludes additions and keeps prior hashes');
  assert.deepEqual(legacy.data,old.data);
  const index=await f.read(null,{version:2});
  const daily=await f.read(DATE,{version:2});
  assert.equal(daily.snapshot_format,'haoduoyu-workbench-snapshot-v2');
  assert.equal(daily.scope_id,legacy.scope_id,'format upgrade preserves the durable identity partition');
  assert.equal(index.manifest_hash,daily.manifest_hash);
  assert.equal(entity(index,'unscheduled_todo:undated').date,null);
  assert.equal(daily.data.unscheduled_todos[0].text,'未来事项');
  assert.deepEqual(daily.data.note_labels.map(row=>row.name).sort(),['合成标签','空标签']);
  assert.equal(daily.data.life_notes.find(row=>row.source_id==='tagged').label,'合成标签');
  assert.equal(Object.hasOwn(daily.data.life_notes.find(row=>row.source_id==='plain'),'label'),false);
  assert.notEqual(entity(index,'note-entry:tagged').content_hash,entity(legacy,'note-entry:tagged').content_hash);
  assert.equal(entity(index,'note-entry:plain').content_hash,entity(legacy,'note-entry:plain').content_hash);
  f.db.prepare('UPDATE matrix_unscheduled_todos SET deleted_at=?,updated_at=?,version=2 WHERE id=?').run(LATER,LATER,'undated');
  const removed=await f.read(DATE,{version:2});
  assert.equal(removed.data.unscheduled_todos[0].deleted_at,LATER);
  assert.equal(Object.hasOwn(removed.data.unscheduled_todos[0],'text'),false);
  assert.notEqual(removed.global_content_hash,daily.global_content_hash);
});

test('legacy index and detail protocols stop before any database or credential read',async()=>{
  const database={prepare:()=>assert.fail('retired protocols must not touch D1')};
  for(const path of ['/workbench-snapshot/index','/workbench-snapshot/index?version=2',
    '/workbench-snapshot?date='+DATE,'/workbench-snapshot?date='+DATE+'&version=2&manifest_hash='+'a'.repeat(64)])
    await assert.rejects(handleWorkbenchSnapshot(database,new Request('http://localhost'+path),path.split('?')[0],{}),
      error(426,'SNAPSHOT_UPGRADE_REQUIRED'));
});

test('full Worker returns legacy 426 even when every D1 operation would fail from quota exhaustion',async t=>{
  const f=fixture(t),{default:worker}=await import('../src/worker.mjs');let calls=0;
  const DB={prepare(){calls++;throw new Error('D1 quota exhausted');},batch(){calls++;throw new Error('D1 quota exhausted');}};
  for(const path of ['/workbench-snapshot/index','/workbench-snapshot/index?version=2',
    '/workbench-snapshot?date='+DATE,'/workbench-snapshot?date='+DATE+'&version=2&manifest_hash='+'a'.repeat(64)]) {
    const response=await worker.fetch(new Request(f.env.SITE_ORIGIN+'/api/v1'+path),{...f.env,DB});
    assert.equal(response.status,426,path);assert.equal((await response.json()).error.code,'SNAPSHOT_UPGRADE_REQUIRED');
    assert.equal(response.headers.get('Cache-Control'),'no-store');
  }
  assert.equal(calls,0,'full routing/error rendering never attempts a D1 query');
});

test('window parameters reject ambiguity and unsupported versions before D1',async()=>{
  const database={prepare:()=>assert.fail('invalid window must not touch D1')};
  for(const query of ['window=recent','window=recent&version=1','window=recent&version=2&version=2',
    'window=recent&window=recent&version=2','window=recent&version=2&date='+DATE,
    'window=date&version=2','window=date&version=2&date=2026-02-30','window=all&version=2',
    'window=date&version=2&date='+DATE+'&date='+DATE,'window=recent&version=2&manifest_hash='+'a'.repeat(64),
    'window=recent&version=2&from=2020-01-01']) {
    const path='/workbench-snapshot?'+query;
    await assert.rejects(handleWorkbenchSnapshot(database,new Request('http://localhost'+path),'/workbench-snapshot',{}),
      error(400,'VALIDATION_ERROR'),query);
  }
});

test('window keeps anonymous and owner scope authorization and the GET-only boundary',async t=>{
  const f=fixture(t);f.todo('t');const path='/workbench-snapshot?date='+DATE+'&version=2';
  const before=f.db.prepare('SELECT total_changes() AS count').get().count;
  for(const headers of [{},{Cookie:'matrix_session='+TOKEN}]) {
    const first=await f.request(WINDOW,{headers}),again=await f.request(WINDOW,{headers});
    assert.equal(again.value.index.scope_id,first.value.index.scope_id);assert.deepEqual(again.value.data,first.value.data);
    assert.equal(first.response.headers.get('Cache-Control'),'private, no-store');
    assert.equal(first.response.headers.get('Vary'),'Cookie, Authorization');
    assert.ok(again.adapter.calls.every(sql=>/^\s*SELECT\b/i.test(sql)));
    assert.ok(!again.adapter.calls.some(sql=>sql.includes('FROM matrix_todos')),'cache hit still authorizes but never scans source');
  }
  for(const Authorization of ['','Bearer hdy_'+'c'.repeat(64)])
    await assert.rejects(f.request(WINDOW,{headers:{Authorization}}),error(403,'SNAPSHOT_SESSION_REQUIRED'));
  await assert.rejects(f.request(WINDOW,{headers:{Cookie:'matrix_session='+OTHER_TOKEN}}),error(403,'FORBIDDEN'));
  await assert.rejects(f.request(WINDOW,{environment:{...f.env,PUBLIC_BUSINESS_MODE:'0'}}),error(401));
  await assert.rejects(f.request(WINDOW,{environment:{...f.env,MEMOS_OWNER_ID:undefined}}),error(503,'MEMOS_CONFIG'));
  for(const method of ['POST','PUT','DELETE'])
    await assert.rejects(handleWorkbenchSnapshot({},new Request('http://localhost'+path,{method}),
      '/workbench-snapshot',f.env),error(404));
  assert.equal(f.db.prepare('SELECT total_changes() AS count').get().count,before);
});

test('session revocation during window projection cannot return a snapshot',async t=>{
  const f=fixture(t);f.todo('t');const headers={Cookie:'matrix_session='+TOKEN};
  let fired=false;
  await assert.rejects(f.request(WINDOW,{headers,hooks:{after(sql) {
    if(fired||!sql.includes('FROM matrix_note_entries'))return;fired=true;
    f.db.exec('DELETE FROM matrix_sessions; UPDATE matrix_control SET revision=revision+1 WHERE id=1');
  }}}),error(401,'UNAUTHORIZED'));
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
  const f=fixture(t);f.todo('today');f.todo('near','2026-10-23');f.todo('old','2023-01-02');f.entry('text','life',DATE,{text:'x'.repeat(3000)});
  for(const limits of [{maxRows:1},{maxBytes:50},{maxDates:1},{maxHashBytes:50},{maxResponseBytes:50},{maxQueries:2},{maxRowsRead:1}])
    await assert.rejects(f.request('/workbench-snapshot?window=recent&version=2',{limits,adapter:f.database(),
      now:()=>Date.parse('2026-11-01T00:00:00Z')}),error(413,'SNAPSHOT_LIMIT'),JSON.stringify(limits));
  await assert.rejects(f.request(undefined,{hooks:{missingReceipt:true}}),error(503,'SNAPSHOT_BUDGET'));
});

test('recent window uses Beijing today and reads all 60 days in one bounded projection',async t=>{
  const f=fixture(t),from='2026-08-27',to='2026-10-25';
  f.todo('first',from);f.todo('today',to);f.todo('outside','2026-08-26');f.todo('future','2026-10-26');
  f.legacy('life',from);f.legacy('work',to);f.entry('life','life',from);f.entry('work','work',to);f.reminder('r',to);
  f.entry('historic','life','2000-01-01');f.group('g');f.memo('m','g');
  f.insert('unscheduled_todos',{user_id:OWNER,id:'undated',text:'future',completed:0,version:1,created_at:STAMP,updated_at:STAMP});
  f.insert('note_labels',{user_id:NOTES,name:'标签',created_at:STAMP});
  f.insert('note_entry_labels',{user_id:NOTES,entry_id:'life',label:'标签'});
  const before=f.db.prepare('SELECT total_changes() AS count').get().count;
  const {value,adapter}=await f.request('/workbench-snapshot?window=recent&version=2');
  assert.equal(value.batch_format,'haoduoyu-workbench-window-v1');assert.deepEqual(value.coverage,{from,to});
  assert.equal(value.index.complete,true);assert.equal(value.index.snapshot_format,'haoduoyu-workbench-snapshot-v2');
  assert.deepEqual(value.index.dates.map(row=>row.date),[from,to]);
  assert.deepEqual(value.data.todos.map(row=>row.source_id),['first','today']);
  assert.equal(value.data.life_notes.find(row=>row.source_id==='life').label,'标签');
  assert.deepEqual(value.data.memos.map(row=>row.source_id),['m']);assert.equal(value.data.note_labels.length,1);
  assert.equal(value.data.unscheduled_todos.length,1);
  const records=Object.values(value.data).flat();
  assert.equal(new Set(records.map(row=>row.entity_id)).size,records.length,'each record appears only once');
  assert.ok(records.every(row=>row.date===null||row.date>=from&&row.date<=to));
  assert.deepEqual(records.map(row=>row.entity_id).sort(),value.index.entities.map(row=>row.entity_id).sort());
  const budget=snapshotBudget(),rebuilt=projectWorkbenchSnapshot(value.data,{scope_id:value.index.scope_id,
    generated_at:value.index.generated_at,version:2},budget);
  assert.deepEqual(value.index,rebuilt,'index and data are from exactly the same scoped projection');
  for(const table of ['todos','daily_notes','daily_work_notes','note_entries','work_reminders']) {
    const reads=adapter.calls.filter(sql=>sql.includes('FROM matrix_'+table+' '));
    assert.equal(reads.length,1,table);assert.match(reads[0],/user_id=\?.*date BETWEEN \? AND \?/);
    assert.ok(!reads[0].includes('OFFSET'));
  }
  const entrySql=adapter.calls.find(sql=>sql.includes('FROM matrix_note_entries '));
  const plan=f.db.prepare('EXPLAIN QUERY PLAN '+entrySql).all(NOTES,from,to,4001);
  assert.ok(plan.some(row=>/matrix_note_entry_day.*user_id=\?.*category=\?.*date>\?.*date<\?/.test(row.detail)),JSON.stringify(plan));
  assert.equal(f.db.prepare('SELECT total_changes() AS count').get().count,before);
});

test('explicit historical date has only that date plus complete global records',async t=>{
  const f=fixture(t);f.todo('old','2000-01-01');f.todo('recent');f.entry('old','life','2000-01-01');
  f.group('g');f.memo('m','g');f.entry('deleted','life','2000-01-01',{deleted_at:LATER,updated_at:LATER});
  const {value}=await f.request('/workbench-snapshot?window=date&date=2000-01-01&version=2');
  assert.deepEqual(value.coverage,{from:'2000-01-01',to:'2000-01-01'});
  assert.deepEqual(value.data.todos.map(row=>row.source_id),['old']);assert.equal(value.data.memos.length,1);
  const deleted=value.data.life_notes.find(row=>row.source_id==='deleted');
  assert.equal(deleted.deleted_at,LATER);assert.equal(Object.hasOwn(deleted,'text'),false);
  assert.ok(value.index.entities.every(row=>row.date===null||row.date==='2000-01-01'));
});

test('window reads beyond 200 records without repeating a source scan',async t=>{
  const f=fixture(t);for(let i=0;i<205;i++)f.entry(String(i).padStart(3,'0'));
  const {value,adapter}=await f.request();assert.equal(value.data.life_notes.length,205);
  assert.equal(adapter.calls.filter(sql=>sql.includes('FROM matrix_note_entries ')).length,1);
});

test('same-revision cache hits avoid source scans but a mutation changes data and manifest immediately',async t=>{
  const f=fixture(t);f.todo('t');const first=await f.request(),hit=await f.request();
  assert.deepEqual(hit.value,first.value);assert.ok(!hit.adapter.calls.some(sql=>sql.includes('FROM matrix_todos ')));
  assert.ok(hit.adapter.calls.filter(sql=>sql.includes('SELECT revision')).length>=2);
  f.db.prepare('UPDATE matrix_todos SET text=?,version=2,updated_at=?').run('changed',LATER);f.changed();
  const next=await f.request();assert.equal(next.value.data.todos[0].text,'changed');
  assert.notEqual(next.value.index.manifest_hash,first.value.index.manifest_hash);
  assert.equal(next.adapter.calls.filter(sql=>sql.includes('FROM matrix_todos ')).length,1);
});

test('date moves leave only the requested window and tombstones retain no deleted text',async t=>{
  const f=fixture(t);f.entry('moving');f.entry('removed','work');
  const path='/workbench-snapshot?window=recent&version=2',before=(await f.request(path)).value;
  f.db.prepare('UPDATE matrix_note_entries SET date=?,version=2,updated_at=? WHERE id=?').run('2000-01-01',LATER,'moving');
  f.db.prepare('UPDATE matrix_note_entries SET deleted_at=?,version=2,updated_at=? WHERE id=?').run(LATER,LATER,'removed');
  f.changed();const recent=(await f.request(path)).value;
  assert.notEqual(recent.index.manifest_hash,before.index.manifest_hash);
  assert.equal(recent.index.entities.some(row=>row.entity_id==='note-entry:moving'),false);
  const removed=recent.data.work_notes.find(row=>row.source_id==='removed');
  assert.equal(removed.deleted_at,LATER);assert.equal(Object.hasOwn(removed,'text'),false);
  const old=(await f.request('/workbench-snapshot?window=date&date=2000-01-01&version=2')).value;
  assert.equal(old.data.life_notes[0].source_id,'moving');assert.equal(old.data.life_notes[0].date,'2000-01-01');
});

test('a scope change during a cache hit cannot return the old identity projection',async t=>{
  const f=fixture(t);f.todo('t');let armed=false;
  const adapter=f.database({after(sql) {
    if(!armed||!sql.includes('FROM matrix_accounts WHERE id IN'))return;
    armed=false;
    f.insert('audit',{id:'scope-change',actor:'public:'+OWNER,action:'POST /accounts',entity_id:'excluded',
      detail_json:'{}',created_at:LATER});f.changed();
  }});
  await f.request(WINDOW,{adapter});armed=true;
  await assert.rejects(f.request(WINDOW,{adapter}),error(409,'SNAPSHOT_SCOPE_CHANGED'));
});

test('concurrent callers share one projection but independently check access and revision',async t=>{
  const f=fixture(t);f.todo('t');let release,started;
  const blocked=new Promise(resolve=>{release=resolve;}),scanning=new Promise(resolve=>{started=resolve;});
  const adapter=f.database({after:async sql=>{if(sql.includes('FROM matrix_todos ')){started();await blocked;}}});
  const first=f.request(WINDOW,{adapter});await scanning;
  const second=f.request(WINDOW,{adapter});release();
  const [a,b]=await Promise.all([first,second]);assert.deepEqual(a.value,b.value);
  assert.equal(adapter.calls.filter(sql=>sql.includes('FROM matrix_todos ')).length,1);
  assert.equal(adapter.calls.filter(sql=>sql.includes('SELECT revision')).length,4);
  assert.equal(adapter.calls.filter(sql=>sql.includes('SELECT initialized')).length,2);
});

test('cache entries isolate database identity, owner/public modes, ranges and memo owners',async t=>{
  const f=fixture(t),g=fixture(t);f.todo('f');g.todo('g');
  const base=await f.request(),other=await g.request();assert.equal(other.value.data.todos[0].source_id,'g');
  const owner=await f.request(WINDOW,{headers:{Cookie:'matrix_session='+TOKEN}});
  assert.notEqual(owner.value.index.scope_id,base.value.index.scope_id);
  assert.ok(owner.adapter.calls.some(sql=>sql.includes('FROM matrix_todos ')));
  const empty=await f.request('/workbench-snapshot?window=date&date=1999-01-01&version=2');
  assert.equal(empty.value.data.todos.length,0);assert.deepEqual(empty.value.coverage,{from:'1999-01-01',to:'1999-01-01'});
  const changed=await f.request(WINDOW,{environment:{...f.env,MEMOS_OWNER_ID:OTHER}});
  assert.notEqual(changed.value.index.scope_id,base.value.index.scope_id);
});

test('cache hits retain all materialization and response budgets',async t=>{
  const f=fixture(t);f.todo('t');f.entry('e','life','2026-10-23');
  const path='/workbench-snapshot?window=recent&version=2';await f.request(path);
  for(const limits of [{maxRows:1},{maxBytes:1},{maxHashBytes:1},{maxDates:1},{maxResponseBytes:1}])
    await assert.rejects(f.request(path,{limits}),error(413,'SNAPSHOT_LIMIT'),JSON.stringify(limits));
  assert.ok((await f.request(path)).value,'a tight caller cannot poison a valid cache entry');
});

test('three cold builds per scope cover all ranges/revisions, then return Retry-After and recover',async t=>{
  const f=fixture(t);f.todo('t');let time=Date.parse('2026-10-24T16:00:00Z');const now=()=>time;
  for(const date of ['2026-10-21','2026-10-22','2026-10-23'])
    assert.equal((await f.request('/workbench-snapshot?window=date&date='+date+'&version=2',{now})).response.status,200);
  const rejected=await f.request(WINDOW,{now});assert.equal(rejected.response.status,429);
  assert.equal(rejected.response.headers.get('Retry-After'),'60');assert.equal(rejected.value,undefined);
  assert.ok(!rejected.adapter.calls.some(sql=>sql.includes('FROM matrix_todos ')));
  assert.equal((await f.request('/workbench-snapshot?window=date&date=2026-10-23&version=2',{now})).response.status,200,
    'cache hits are allowed during the cold-build cooldown');
  time+=59000;assert.equal((await f.request(WINDOW,{now})).response.headers.get('Retry-After'),'1');
  time+=1000;assert.equal((await f.request(WINDOW,{now})).response.status,200);
});

test('a failed cold build is removed but consumes admission quota',async t=>{
  const f=fixture(t);f.todo('t');const adapter=f.database();
  await assert.rejects(f.request(WINDOW,{adapter,limits:{maxBytes:1}}),error(413,'SNAPSHOT_LIMIT'));
  const recovered=await f.request(WINDOW,{adapter});assert.equal(recovered.value.data.todos.length,1);
  assert.ok(recovered.adapter.calls.some(sql=>sql.includes('FROM matrix_todos ')));
});

test('cache entry and byte bounds evict completed windows instead of growing without limit',async()=>{
  const db={},now=()=>0;let builds=0;
  const get=(scope,text='{}')=>cachedWorkbenchWindow(db,{scope_id:scope,version:2,coverage:{from:DATE,to:DATE},revision:1},
    snapshotBudget({maxResponseBytes:10*1024*1024}),now,async()=>{builds++;return {text,dates:1};});
  for(const scope of ['a','b','c','d','e'])await get(scope);
  await get('a');assert.equal(builds,6,'the fifth entry evicts the first');
  const large='x'.repeat(5*1024*1024);
  await get('large-one',large);await get('large-two',large);
  const before=builds;await get('large-one',large);
  assert.equal(builds,before+1,'two 5MiB responses cannot coexist in the 8MiB cache');
});

test('pending builds occupy cache slots and the fifth concurrent build performs no source work',async()=>{
  const db={},now=()=>0;let release,started=0;
  const barrier=new Promise(resolve=>{release=resolve;}),pending=[];
  const get=scope=>cachedWorkbenchWindow(db,{scope_id:scope},snapshotBudget(),now,async()=>{
    started++;await barrier;return {text:'{}',dates:0};
  });
  for(const scope of ['a','b','c','d'])pending.push(get(scope));
  await assert.rejects(get('e'),error(429,'SNAPSHOT_RATE_LIMIT'));assert.equal(started,4);
  release();await Promise.all(pending);
});

test('a cached owner response still rejects a revoked session and never supplies its proof to public mode',async t=>{
  const f=fixture(t);f.todo('t');const headers={Cookie:'matrix_session='+TOKEN};
  const first=await f.request(WINDOW,{headers,environment:{...f.env,PUBLIC_BUSINESS_MODE:'0'}});
  f.db.exec('DELETE FROM matrix_sessions');f.changed();
  await assert.rejects(f.request(WINDOW,{headers,environment:{...f.env,PUBLIC_BUSINESS_MODE:'0'}}),error(401));
  const publicResponse=await f.request();assert.notEqual(publicResponse.value.index.scope_id,first.value.index.scope_id);
});

test('window route retains existing owner/account auth and verifies memo owner',async t=>{
  const f=fixture(t);f.todo('t');f.group('g');f.memo('m','g');
  const anonymous=await f.request(),owner=await f.request(undefined,{headers:{Cookie:'matrix_session='+TOKEN}});
  assert.notEqual(anonymous.value.index.scope_id,owner.value.index.scope_id,'existing account scope remains part of identity');
  assert.equal(anonymous.response.headers.get('Cache-Control'),'private, no-store');
  assert.equal(anonymous.response.headers.get('Vary'),'Cookie, Authorization');
  assert.ok(owner.adapter.calls.length<=45);assert.ok(anonymous.adapter.calls.length<=45);
  for(const Authorization of ['','Bearer hdy_'+'c'.repeat(64)])
    await assert.rejects(f.request(undefined,{headers:{Authorization}}),error(403,'SNAPSHOT_SESSION_REQUIRED'));
  await assert.rejects(f.request(undefined,{headers:{Cookie:'matrix_session='+OTHER_TOKEN}}),error(403,'FORBIDDEN'));
  await assert.rejects(f.request(undefined,{environment:{...f.env,PUBLIC_BUSINESS_MODE:'0'}}),error(401));
  await assert.rejects(f.request(undefined,{environment:{...f.env,MEMOS_OWNER_ID:undefined}}),error(503,'MEMOS_CONFIG'));
  await assert.rejects(f.request(undefined,{environment:{...f.env,MEMOS_OWNER_ID:'50000000-0000-4000-8000-000000000005'}}),error(503,'SNAPSHOT_CONFIG'));
  const changedOwner=await f.request(undefined,{environment:{...f.env,MEMOS_OWNER_ID:OTHER}});
  assert.notEqual(anonymous.value.index.scope_id,changedOwner.value.index.scope_id,'memo-owner change requires a new baseline');
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
  assert.equal(value.index.manifest_hash,(await f.request(undefined,{headers:{Cookie:'matrix_session='+TOKEN}})).value.index.manifest_hash);
});

test('repeated concurrent writes keep snapshots bounded and never return a partial result',async t=>{
  const f=fixture(t);f.todo('t');let writes=0;
  await assert.rejects(f.request(WINDOW,{headers:{Cookie:'matrix_session='+TOKEN},hooks:{after(sql) {
    if(writes>=5||!sql.includes('FROM matrix_todos'))return;
    writes++; f.db.exec('UPDATE matrix_control SET revision=revision+1 WHERE id=1');
  }}}),error(503,'BUSY'));
  assert.equal(writes,2,'no more than two cold projections despite revision retries');
});

test('window index survives one concurrent change without exhausting the whole-read query budget',async t=>{
  const f=fixture(t);f.todo('t');let fired=false;
  const {value}=await f.request(WINDOW,{headers:{Cookie:'matrix_session='+TOKEN},hooks:{after(sql) {
    if(fired||!sql.includes('FROM matrix_todos'))return;
    fired=true;f.db.prepare('UPDATE matrix_todos SET note=?,version=2,updated_at=?').run('edited',LATER);
    f.db.exec('UPDATE matrix_control SET revision=revision+1 WHERE id=1');
  }}});
  assert.ok(value.index.complete);assert.ok(fired);
});

test('two concurrent changes stop the window read without a third full projection',async t=>{
  const f=fixture(t);f.todo('t');let writes=0;
  await assert.rejects(f.request(WINDOW,{headers:{Cookie:'matrix_session='+TOKEN},hooks:{after(sql) {
    if(writes>=2||!sql.includes('FROM matrix_todos'))return;
    writes++;f.db.exec('UPDATE matrix_control SET revision=revision+1 WHERE id=1');
  }}}),error(503,'BUSY'));
  assert.equal(writes,2);
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

test('scope route returns the same identity as the index without reading workbench data',async t=>{
  const f=fixture(t);f.todo('t');f.group('g');f.memo('m','g');
  for(const headers of [{},{Cookie:'matrix_session='+TOKEN}]) {
    const index=await f.request(WINDOW,{headers}),scope=await f.request('/workbench-snapshot/scope',{headers});
    assert.equal(scope.value.scope_id,index.value.index.scope_id);
    assert.equal(scope.value.complete,true);assert.equal(scope.value.projection,'current');
    assert.equal(scope.value.entities,undefined,'no workbench records in the scope reply');
    assert.ok(scope.adapter.calls.length<=10,'scope check stays a handful of queries');
    assert.ok(!scope.adapter.calls.some(sql=>/todos|note_entries|memo_notes|work_reminders/.test(sql)));
    assert.equal(scope.response.headers.get('Cache-Control'),'private, no-store');
  }
  await assert.rejects(f.request('/workbench-snapshot/scope?date='+DATE),error(400,'VALIDATION_ERROR'));
  await assert.rejects(f.request('/workbench-snapshot/scope',{headers:{Cookie:'matrix_session='+OTHER_TOKEN}}),error(403,'FORBIDDEN'));
  await assert.rejects(f.request('/workbench-snapshot/scope',{environment:{...f.env,MEMOS_OWNER_ID:OTHER.replace('4','5')}}),
    error(503,'SNAPSHOT_CONFIG'));
  await assert.rejects(handleWorkbenchSnapshot({},new Request('http://localhost/workbench-snapshot/scope',{method:'POST'}),
    '/workbench-snapshot/scope',f.env),error(404));
});
