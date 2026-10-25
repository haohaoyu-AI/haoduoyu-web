import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {readSnapshotData,snapshotForDate,snapshotIndex} from '../src/snapshot-projection.mjs';
import {shiftDay} from '../src/lib/time.mjs';

const stamp='2026-10-24T00:00:00.000Z',day='2026-10-24';
const scope={ownerId:'todo-owner',notesOwnerId:'notes-owner',accountIds:['included']};
const meta={scope_id:'scope-fixture',generated_at:stamp};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
function budget(overrides={}) {
  let rows=0,bytes=0,hashBytes=0;
  const limits={maxRows:4000,maxBytes:1048576,maxDates:1000,maxHashBytes:8388608,...overrides};
  const check=()=>{throw Object.assign(new Error('complete snapshot budget exceeded'),{code:'SNAPSHOT_LIMIT',status:413});};
  return {limits,addRows(value){rows+=value.length;bytes+=Buffer.byteLength(JSON.stringify(value));if(rows>limits.maxRows||bytes>limits.maxBytes)check();},
    hash(value){const text=JSON.stringify(canonical(value));hashBytes+=Buffer.byteLength(text);if(hashBytes>limits.maxHashBytes)check();return createHash('sha256').update(text).digest('hex');}};
}
function fixture(t) {
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())
    db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  const queries=[];
  const store={async all(sql,...args){queries.push(sql);return db.prepare(sql).all(...args);}};
  function insert(table,row) {const keys=Object.keys(row);db.prepare(`INSERT INTO matrix_${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...keys.map(key=>row[key]));}
  for(const id of ['todo-owner','notes-owner','other'])insert('users',{id,username:id,password_hash:'synthetic-password-canary',created_at:stamp});
  for(const id of ['included','excluded'])insert('accounts',{id,name:id,platform:'synthetic',created_at:'2040-01-01T00:00:00.000Z'});
  const todo=(id,date,extra={})=>insert('todos',{user_id:scope.ownerId,id,date,text:id,completed:0,created_at:stamp,updated_at:stamp,...extra});
  const template=(id,extra={})=>insert('todo_templates',{user_id:scope.ownerId,id,text:id,version:1,created_at:stamp,updated_at:stamp,...extra});
  const link=(todo_id,template_id,user_id=scope.ownerId)=>insert('todo_template_links',{user_id,todo_id,template_id});
  const article=(id,extra={})=>insert('articles',{id,account_id:'included',title:id,url:null,published_at:null,created_at:stamp,updated_at:stamp,...extra});
  const note=(date,extra={})=>insert('daily_notes',{user_id:scope.notesOwnerId,date,text:'public-note',version:1,change_seq:1,created_at:stamp,updated_at:stamp,...extra});
  const observation=(id,article_id,as_of,extra={})=>insert('observations',{id,article_id,as_of,collected_at:stamp,kind:'latest',metrics_json:'{"reads":0}',source:'synthetic',created_at:stamp,...extra});
  const metric=(id,date,extra={})=>insert('daily_metrics',{id,account_id:'included',article_id:null,date,metrics_json:'{"reads":0}',source:'synthetic',updated_at:stamp,...extra});
  const read=(date=null,limits={})=>readSnapshotData(store,scope,budget(limits),{date});
  return {db,store,queries,insert,todo,template,link,article,note,observation,metric,read};
}

test('daily projection includes live scoped data and preserves all pipeline statuses, nulls, zero and nested arrays',async t=>{
  const f=fixture(t);
  f.template('active');f.template('deleted-template',{deleted_at:stamp});f.template('other-template',{user_id:'other'});
  f.todo('today',day);f.link('today','active');
  f.todo('deleted-todo',day,{deleted_at:stamp});f.todo('other-todo',day,{user_id:'other'});
  f.note(day);f.note(day,{user_id:'other',text:'private-note-canary'});f.note('2026-10-23',{deleted_at:stamp,text:'deleted-note-canary'});
  for(const status of ['drafting','illustrated','draft_saved','published','failed',null])f.article('status-'+status,{status,run_date:day,
    sample_json:'{"null_value":null,"zero":0,"ordered":["second","first"]}',char_count:0,image_count:0,
    blockers_json:'[{"type":"first","count":0},{"type":"second","extra":null}]',verify_items_json:'[]'});
  f.article('outside',{account_id:'excluded',run_date:day});
  const result=snapshotForDate(await f.read(day),day,meta,budget());
  assert.equal(result.snapshot_format,'haoduoyu-daily-snapshot-v1');assert.equal(result.projection,'current');
  assert.deepEqual(result.data.todos.map(row=>row.id),['today']);
  assert.equal(result.data.todos[0].template_id,'active');assert.equal(result.data.todos[0].completed,0);
  assert.deepEqual(result.data.templates.map(row=>row.id),['active']);
  assert.deepEqual(result.data.notes.map(row=>row.text),['public-note']);
  assert.deepEqual(result.data.accounts.map(row=>row.id),['included']);
  assert.equal(result.data.articles.length,6);
  const nullStatus=result.data.articles.find(row=>row.id==='status-null');
  assert.equal(nullStatus.status,null);assert.equal(nullStatus.char_count,0);assert.equal(nullStatus.series_no,null);
  assert.deepEqual(nullStatus.sample,{null_value:null,zero:0,ordered:['second','first']});
  assert.deepEqual(nullStatus.blockers,[{type:'first',count:0},{type:'second',extra:null}]);
  assert.equal(nullStatus.timings,null);assert.deepEqual(nullStatus.verify_items,[]);
  const serialized=JSON.stringify(result);
  for(const marker of ['user_id','password_hash','token_hash','deleted_at','change_seq','_json','private-note-canary','deleted-note-canary','other-todo','deleted-todo','outside'])assert.ok(!serialized.includes(marker),marker);
  for(const sql of f.queries){assert.doesNotMatch(sql,/SELECT\s+\*/i);assert.doesNotMatch(sql,/\b(?:matrix_users|matrix_sessions|matrix_api_keys|matrix_audit|matrix_login_attempts)\b/);}
});

test('Beijing business dates select offset timestamps and referenced historical articles identically in index and daily reads',async t=>{
  const f=fixture(t);
  f.article('boundary-before',{published_at:'2026-10-23T15:59:59.999999999Z'});
  f.article('boundary-start',{published_at:'2026-10-23T16:00:00.000Z'});
  f.article('offset',{published_at:'2026-10-24T00:00:00+08:00'});
  f.article('offset-outside-sqlite-parser',{published_at:'2026-10-25T00:00:00+23:00'});
  f.article('boundary-end',{published_at:'2026-10-24T16:00:00.000Z'});
  f.article('older',{published_at:'2026-10-01T00:00:00.000Z'});
  f.article('metrics-only');f.article('unassigned',{status:'drafting'});
  f.observation('old-article-observation','older','2026-10-24T00:00:00+08:00');
  f.metric('only-metric',day,{article_id:'metrics-only'});
  f.metric('account-metric','2026-10-22');f.note('2026-10-21');f.todo('earlier-todo','2026-10-20');
  const all=await f.read(),queriesBefore=f.queries.length,index=snapshotIndex(all,meta,budget());
  assert.equal(f.queries.length,queriesBefore,'index hashes use grouped memory without per-day SQL');
  assert.deepEqual(index.dates.map(row=>row.date),['2026-10-01','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25']);
  for(const entry of index.dates) {
    const daily=snapshotForDate(await f.read(entry.date),entry.date,meta,budget());
    assert.equal(daily.content_hash,entry.content_hash,entry.date);
  }
  const daily=snapshotForDate(all,day,meta,budget());
  assert.deepEqual(daily.data.articles.map(row=>row.id).sort(),['boundary-start','metrics-only','offset','offset-outside-sqlite-parser','older']);
  assert.equal(daily.data.observations[0].metrics.reads,0);
  assert.ok(!index.dates.some(row=>row.date==='2040-01-01'),'account creation date does not manufacture a business date');
  const empty=snapshotForDate(all,'2020-01-01',meta,budget());
  assert.equal(empty.data.articles.length,0);assert.equal(empty.data.todos.length,0);assert.equal(empty.data.accounts.length,1);
});

test('habit window counts distinct completed dates, includes both endpoints and keeps threshold 21',async t=>{
  const f=fixture(t);f.template('habit');f.template('empty');f.template('deleted',{deleted_at:stamp});
  for(let i=0;i<21;i++){const date=shiftDay(day,-i);f.todo('completed-'+i,date,{completed:1});f.link('completed-'+i,'habit');}
  f.todo('duplicate',day,{completed:1});f.link('duplicate','habit');
  f.todo('outside',shiftDay(day,-30),{completed:1});f.link('outside','habit');
  f.todo('tomorrow',shiftDay(day,1),{completed:1});f.link('tomorrow','habit');
  f.todo('deleted-completion',shiftDay(day,-22),{completed:1,deleted_at:stamp});f.link('deleted-completion','habit');
  f.todo('not-completed',shiftDay(day,-23));f.link('not-completed','habit');
  f.todo('deleted-template-completion',day,{completed:1});f.link('deleted-template-completion','deleted');
  let data=snapshotForDate(await f.read(day),day,meta,budget()).data;
  assert.equal(data.habit30days.window_start,'2026-09-25');assert.equal(data.habit30days.threshold,21);
  assert.deepEqual(data.habit30days.templates.find(row=>row.template_id==='habit'),{template_id:'habit',completed_days:21,habit_status:'habit'});
  assert.deepEqual(data.habit30days.templates.find(row=>row.template_id==='empty'),{template_id:'empty',completed_days:0,habit_status:'todo'});
  assert.equal(data.habit30days.templates.length,2);
  f.db.prepare('UPDATE matrix_todos SET completed=0 WHERE id=?').run('completed-20');
  assert.deepEqual(snapshotForDate(await f.read(day),day,meta,budget()).data.habit30days.templates.find(row=>row.template_id==='habit'),
    {template_id:'habit',completed_days:20,habit_status:'todo'});
  f.db.prepare('UPDATE matrix_todos SET completed=1 WHERE id=?').run('completed-20');
  f.todo('window-start',shiftDay(day,-29),{completed:1});f.link('window-start','habit');
  data=snapshotForDate(await f.read(day),day,meta,budget()).data;
  assert.equal(data.habit30days.templates.find(row=>row.template_id==='habit').completed_days,22);
  f.todo('extreme','9999-12-31',{completed:1});f.link('extreme','habit');
  assert.equal(snapshotForDate(await f.read('9999-12-31'),'9999-12-31',meta,budget()).data.habit30days.templates.find(row=>row.template_id==='habit').completed_days,1);
});

test('hash is invariant to generated time, SQL row order and JSON object key order but preserves nested array semantics',async t=>{
  const f=fixture(t);f.todo('b',day);f.todo('a',day);f.template('b');f.template('a');
  f.article('pipeline',{run_date:day,sample_json:'{"b":2,"a":1,"items":[1,2]}'});
  const first=snapshotForDate(await f.read(),day,meta,budget());
  const backwards={all:async(sql,...args)=>(await f.store.all(sql,...args)).reverse()};
  const reversed=await readSnapshotData(backwards,scope,budget());
  assert.equal(snapshotForDate(reversed,day,{...meta,generated_at:'2099-01-01T00:00:00Z'},budget()).content_hash,first.content_hash);
  f.db.prepare('UPDATE matrix_articles SET sample_json=? WHERE id=?').run('{"items":[1,2],"a":1,"b":2}','pipeline');
  assert.equal(snapshotForDate(await f.read(),day,meta,budget()).content_hash,first.content_hash);
  f.db.prepare('UPDATE matrix_articles SET sample_json=? WHERE id=?').run('{"items":[2,1],"a":1,"b":2}','pipeline');
  assert.notEqual(snapshotForDate(await f.read(),day,meta,budget()).content_hash,first.content_hash);
  assert.notEqual(snapshotForDate(reversed,day,{...meta,scope_id:'another-scope'},budget()).content_hash,first.content_hash);
  const index=snapshotIndex(reversed,meta,budget());
  assert.equal(index.index_hash,snapshotIndex(reversed,{...meta,generated_at:'2099-01-01T00:00:00Z'},budget()).index_hash);
});

test('paging reads the complete set beyond 200 and every budget failure rejects the entire projection',async t=>{
  const f=fixture(t);for(let i=0;i<205;i++)f.article('article-'+String(i).padStart(3,'0'),{run_date:day});
  f.todo('old','2026-10-23');
  const data=await f.read(),daily=snapshotForDate(data,day,meta,budget());
  assert.equal(daily.data.articles.length,205);
  assert.equal(f.queries.filter(sql=>/^SELECT a\.id/.test(sql)).length,2);
  await assert.rejects(f.read(null,{maxRows:10}),error=>error.code==='SNAPSHOT_LIMIT');
  await assert.rejects(f.read(null,{maxBytes:10}),error=>error.code==='SNAPSHOT_LIMIT');
  assert.throws(()=>snapshotIndex(data,meta,budget({maxDates:1})),error=>error.code==='SNAPSHOT_LIMIT');
  assert.throws(()=>snapshotIndex(data,meta,budget({maxHashBytes:100})),error=>error.code==='SNAPSHOT_LIMIT');
  const dailyData=await f.read(day);
  assert.throws(()=>snapshotIndex(dailyData,meta,budget()),error=>error.code==='SNAPSHOT_DATA');
  assert.throws(()=>snapshotForDate(dailyData,'2026-10-23',meta,budget()),error=>error.code==='SNAPSHOT_DATA');
});

test('empty account/template framework creates no historical dates',async t=>{
  const f=fixture(t);f.template('undated-template');f.article('undated-article',{status:null});
  const index=snapshotIndex(await f.read(),meta,budget());assert.equal(index.complete,true);assert.deepEqual(index.dates,[]);
});

test('current projection changes old hashes after late completion and removes dates whose last live record was deleted',async t=>{
  const f=fixture(t);f.template('routine');f.todo('late-completion','2026-10-01');f.link('late-completion','routine');
  f.note('2026-10-20');f.note('2026-10-21');
  const before=snapshotIndex(await f.read(),meta,budget());
  f.db.prepare('UPDATE matrix_todos SET completed=1,version=version+1 WHERE id=?').run('late-completion');
  f.db.prepare('UPDATE matrix_daily_notes SET deleted_at=? WHERE date=?').run(stamp,'2026-10-21');
  const after=snapshotIndex(await f.read(),meta,budget());
  assert.deepEqual(after.dates.map(row=>row.date),['2026-10-01','2026-10-20']);
  assert.notEqual(before.dates.find(row=>row.date==='2026-10-20').content_hash,after.dates.find(row=>row.date==='2026-10-20').content_hash);
  assert.equal(after.dates.find(row=>row.date==='2026-10-20').content_hash,snapshotForDate(await f.read('2026-10-20'),'2026-10-20',meta,budget()).content_hash);
});

test('corrupt metrics, pipeline JSON, business dates and cross-account references fail explicitly',async t=>{
  const f=fixture(t);f.article('article',{run_date:day});f.observation('observation','article',stamp);
  for(const invalid of ['not-json','[]','null','{"reads":1e400}',JSON.stringify({deep:Array.from({length:70}).reduce(value=>({value}),0)})]) {
    f.db.prepare('UPDATE matrix_observations SET metrics_json=?').run(invalid);
    await assert.rejects(f.read(),error=>error.code==='SNAPSHOT_DATA',invalid.slice(0,50));
  }
  f.db.prepare('UPDATE matrix_observations SET metrics_json=?').run('{"reads":0}');
  f.db.exec('PRAGMA ignore_check_constraints=ON');
  for(const invalid of ['not-json','[]','{"x":1e400}']) {
    f.db.prepare('UPDATE matrix_articles SET sample_json=?').run(invalid);
    await assert.rejects(f.read(),error=>error.code==='SNAPSHOT_DATA');
  }
  f.db.prepare('UPDATE matrix_articles SET sample_json=NULL,run_date=?').run('2026-02-30');
  await assert.rejects(f.read(),error=>error.code==='SNAPSHOT_DATA');
  f.db.prepare('UPDATE matrix_articles SET run_date=?').run(day);
  f.db.prepare('UPDATE matrix_observations SET as_of=?').run('invalid');
  await assert.rejects(f.read(day),error=>error.code==='SNAPSHOT_DATA');
  f.db.prepare('UPDATE matrix_observations SET as_of=?').run(stamp);
  f.article('external-article',{account_id:'excluded'});f.metric('cross-scope',day,{article_id:'external-article'});
  await assert.rejects(f.read(day),error=>error.code==='SNAPSHOT_DATA');
});
