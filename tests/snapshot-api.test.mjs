import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {countingDb} from './counting-d1.mjs';
import {digest} from '../shared/auth.mjs';
import {shiftDay} from '../src/lib/time.mjs';
import {handleSnapshot} from '../src/snapshot.mjs';
import {SNAPSHOT_LIMITS} from '../src/snapshot-budget.mjs';

const DAY='2026-10-24',STAMP=DAY+'T00:00:00.000Z';
const PUBLIC_ACCOUNT='toutiao-haoduoyu',PRIVATE_ACCOUNT='zhihu-haoduoyu';

async function addUser(db) {
  const id=randomUUID();
  await db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,created_at FROM matrix_users LIMIT 1')
    .bind(id,'synthetic-snapshot-'+id).run();
  return id;
}
async function sessionFor(db,id) {
  const token=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');
  await db.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .bind(digest(token),id,'2099-01-01T00:00:00.000Z').run();
  return {cookie:'matrix_session='+token};
}
async function setup(t) {
  const app=await fixture(t),session=await app.login();
  const owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const other=await addUser(app.db),notesOwner=await addUser(app.db);
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,
    PUBLIC_BUSINESS_ACCOUNT_IDS:JSON.stringify([PUBLIC_ACCOUNT]),DAILY_NOTES_OWNER_ID:notesOwner};
  return {...app,owner,other,notesOwner,session,env};
}
async function read(app,path='/snapshot?date='+DAY,{session,token,env=app.env,hooks={},method='GET',headers:initialHeaders={}}={}) {
  const db=countingDb(app.db,hooks),headers=new Headers(initialHeaders);
  if(session)headers.set('Cookie',session.cookie);
  if(token)headers.set('Authorization','Bearer '+token);
  const response=await worker.fetch(new Request(app.origin+'/api/v1'+path,{method,headers}),{...env,DB:db});
  const text=await response.text();let json;try{json=JSON.parse(text);}catch{}
  const result={status:response.status,headers:response.headers,text,json,data:json?.data,db};
  assert.equal(db.totals().write_statements,0,path+': GET must not execute any SQL write');
  assert.equal(db.totals().d1_rows_written,0,path+': real D1 must report zero written rows');
  assert.ok(db.entries.length<=45,path+': request query budget includes authentication and control reads');
  return result;
}
function ok(result) {assert.equal(result.status,200,result.text);return result.data;}
const dates=index=>index.dates.map(row=>row.date);
const hashAt=(index,date)=>index.dates.find(row=>row.date===date)?.content_hash;
const authReads=result=>result.db.entries.filter(row=>/FROM matrix_sessions\b/.test(row.sql)).length;
async function todo(app,{id=randomUUID(),owner=app.owner,date=DAY,text='Snapshot todo',completed=0,deleted=null,template}={}) {
  await app.db.prepare('INSERT INTO matrix_todos(user_id,id,date,text,completed,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(owner,id,date,text,completed,STAMP,STAMP,deleted).run();
  if(template)await app.db.prepare('INSERT INTO matrix_todo_template_links(user_id,todo_id,template_id) VALUES(?,?,?)').bind(owner,id,template).run();
  return id;
}
async function template(app,{id=randomUUID(),owner=app.owner,text='Snapshot habit',deleted=null}={}) {
  await app.db.prepare('INSERT INTO matrix_todo_templates(user_id,id,text,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?)')
    .bind(owner,id,text,STAMP,STAMP,deleted).run();
  return id;
}
async function note(app,{owner=app.notesOwner,date=DAY,text='Configured public note',deleted=null}={}) {
  await app.db.prepare('INSERT INTO matrix_daily_notes(user_id,date,text,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,1,1,?,?,?)')
    .bind(owner,date,text,STAMP,STAMP,deleted).run();
}
async function article(app,{id=randomUUID(),account=PUBLIC_ACCOUNT,title='Snapshot article',date=DAY,published=null,status='draft_saved',slot=null}={}) {
  await app.db.prepare('INSERT INTO matrix_articles(id,account_id,title,run_date,published_at,status,slot,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(id,account,title,date,published,status,slot,STAMP,STAMP).run();
  return id;
}
async function changed(app,sql,...args) {
  await app.db.batch([app.db.prepare(sql).bind(...args),app.db.prepare('UPDATE matrix_control SET revision=revision+1 WHERE id=1')]);
}

test('snapshot routes require explicit anonymous scope, reject malformed queries and never accept API keys',async t=>{
  const app=await setup(t);
  const valid=ok(await read(app));
  assert.equal(valid.projection,'current');assert.equal(valid.date,DAY);assert.equal(valid.timezone,'Asia/Shanghai');
  assert.equal(valid.snapshot_format,'haoduoyu-daily-snapshot-v1');
  for(const env of [{...app.env,PUBLIC_BUSINESS_MODE:'0'},
    {...app.env,PUBLIC_BUSINESS_USER_ID:undefined},{...app.env,PUBLIC_BUSINESS_ACCOUNT_IDS:undefined},
    {...app.env,PUBLIC_BUSINESS_USER_ID:randomUUID()},{...app.env,PUBLIC_BUSINESS_ACCOUNT_IDS:'["missing-account"]'},
    {...app.env,DAILY_NOTES_OWNER_ID:undefined}]) {
    const result=await read(app,undefined,{env});assert.ok([401,503].includes(result.status),result.text);
    assert.equal(Object.hasOwn(result.json,'data'),false);
  }
  for(const path of ['/snapshot','/snapshot?date=2026-02-30','/snapshot?date=0000-01-01','/snapshot?date=2026-1-01',
    '/snapshot?date='+DAY+'&date='+DAY,'/snapshot?date='+DAY+'&unexpected=1',
    '/snapshot/index?date='+DAY,'/snapshot/index?before='+DAY,'/snapshot/index?x=1&x=2'])
    assert.equal((await read(app,path)).status,400,path);
  const token='hdy_'+'a'.repeat(64),key=randomUUID();
  await app.db.prepare('INSERT INTO matrix_api_keys(id,name,token_hash,account_ids_json,permissions_json,created_at) VALUES(?,?,?,?,?,?)')
    .bind(key,'SYNTHETIC-SNAPSHOT-KEY',digest(token),JSON.stringify([PUBLIC_ACCOUNT]),'["read"]',STAMP).run();
  for(const path of ['/snapshot?date='+DAY,'/snapshot/index'])for(const session of [undefined,app.session]) {
    const result=await read(app,path,{token,session});assert.ok([401,403].includes(result.status),result.text);
    assert.equal(Object.hasOwn(result.json,'data'),false);
  }
  for(const session of [undefined,app.session])assert.equal((await read(app,undefined,{session,headers:{Authorization:''}})).status,403);
  assert.equal((await app.db.prepare('SELECT last_used_at FROM matrix_api_keys WHERE id=?').bind(key).first()).last_used_at,null);
  for(const method of ['POST','PUT','DELETE'])assert.ok([404,405].includes((await read(app,'/snapshot?date='+DAY,{method})).status));
});

test('snapshot projects only the configured workspace; owner sessions retain identity and notes keep their existing public owner',async t=>{
  const app=await setup(t),otherSession=await sessionFor(app.db,app.other);
  await todo(app,{text:'PUBLIC-TODO'});await todo(app,{owner:app.other,text:'OTHER-USER-TODO'});
  await todo(app,{text:'DELETED-TODO-CANARY',deleted:STAMP});
  await template(app,{text:'PUBLIC-TEMPLATE'});await template(app,{owner:app.other,text:'OTHER-TEMPLATE-CANARY'});
  await template(app,{text:'DELETED-TEMPLATE-CANARY',deleted:STAMP});
  await note(app);await note(app,{owner:app.owner,text:'NONCONFIGURED-NOTE-CANARY'});
  await note(app,{date:shiftDay(DAY,-1),text:'DELETED-NOTE-CANARY',deleted:STAMP});
  await article(app,{title:'PUBLIC-ARTICLE'});await article(app,{account:PRIVATE_ACCOUNT,title:'PRIVATE-ACCOUNT-CANARY'});
  await app.db.prepare('INSERT INTO matrix_audit(id,actor,action,detail_json,created_at) VALUES(?,?,?,?,?)')
    .bind(randomUUID(),'private:actor','SYNTHETIC SECRET','{"secret":"AUDIT-SECRET-CANARY","memo":"PRIVATE-MEMO-CANARY"}',STAMP).run();
  const result=await read(app),publicSnapshot=ok(result);
  assert.deepEqual(publicSnapshot.data.accounts.map(row=>row.id),[PUBLIC_ACCOUNT]);
  assert.deepEqual(publicSnapshot.data.todos.map(row=>row.text),['PUBLIC-TODO']);
  assert.deepEqual(publicSnapshot.data.notes.map(row=>row.text),['Configured public note']);
  for(const marker of [app.owner,app.other,app.notesOwner,'OTHER-USER-TODO','OTHER-TEMPLATE-CANARY','DELETED-TODO-CANARY',
    'DELETED-TEMPLATE-CANARY','DELETED-NOTE-CANARY','NONCONFIGURED-NOTE-CANARY','PRIVATE-ACCOUNT-CANARY',
    'AUDIT-SECRET-CANARY','PRIVATE-MEMO-CANARY','password_hash','token_hash','user_id','matrix_session'])
    assert.ok(!result.text.includes(marker),marker);
  assert.ok(result.db.entries.every(row=>!/(?:FROM|JOIN) matrix_(?:idempotency|api_keys|memos)\b/.test(row.sql)));
  const own=ok(await read(app,undefined,{session:app.session}));assert.deepEqual(own.data.todos.map(row=>row.text),['PUBLIC-TODO']);
  assert.ok(own.data.accounts.some(row=>row.id===PRIVATE_ACCOUNT),'owner session retains existing account authority');
  assert.deepEqual(own.data.notes.map(row=>row.text),['Configured public note']);
  const other=await read(app,undefined,{session:otherSession});assert.equal(other.status,403,other.text);
  assert.equal(Object.hasOwn(other.json,'data'),false);
  assert.notEqual(own.scope_id,publicSnapshot.scope_id);
  const privateEnv={...app.env,PUBLIC_BUSINESS_MODE:'0'};
  assert.equal((await read(app,undefined,{session:app.session,env:privateEnv})).status,200);
  assert.equal((await read(app,undefined,{session:app.session,env:{...privateEnv,PUBLIC_BUSINESS_USER_ID:undefined}})).status,503);
  const deletedDay=ok(await read(app,'/snapshot?date='+shiftDay(DAY,-1)));assert.deepEqual(deletedDay.data.notes,[]);
});

test('daily snapshot includes run-date drafts, null status, pipeline values and Beijing-day observation links',async t=>{
  const app=await setup(t),draft=await article(app,{status:'draft_saved'}),unknown=await article(app,{status:null});
  await app.db.prepare('UPDATE matrix_articles SET slot=?,series_no=?,writer=?,illustrator=?,sample_json=?,char_count=0,subheading_count=0,image_count=0,cover_desc=?,draft_ref_json=?,timings_json=?,reruns_json=?,blockers_json=?,verify_items_json=? WHERE id=?')
    .bind('gzh',231,'human','codex','{"source":"sample","ordered":[2,1]}','cover','{"path":"synthetic/draft"}',
      '{"write":0}','{"count":0}','[{"type":"later"},{"type":"first"}]','[{"check":"source"}]',draft).run();
  const older=await article(app,{date:'2025-01-01',published:'2025-01-01T00:00:00.000Z',status:'published'});
  const stamps=['2026-10-23T15:59:59.999Z','2026-10-23T16:00:00.000Z','2026-10-24T15:59:59.999Z','2026-10-24T16:00:00.000Z'];
  for(const asOf of stamps)await app.db.prepare('INSERT INTO matrix_observations(id,article_id,as_of,collected_at,kind,metrics_json,source,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(randomUUID(),older,asOf,asOf,'latest','{"reads":0}','synthetic','note',asOf).run();
  const metricOnly=await article(app,{date:'2024-02-01'});
  await app.db.prepare('INSERT INTO matrix_daily_metrics(id,account_id,article_id,date,metrics_json,source,updated_at) VALUES(?,?,?,?,?,?,?)')
    .bind(randomUUID(),PUBLIC_ACCOUNT,metricOnly,DAY,'{"reads":0}','synthetic',STAMP).run();
  const value=ok(await read(app)),rows=value.data;
  assert.deepEqual(new Set(rows.articles.map(row=>row.id)),new Set([draft,unknown,older,metricOnly]));
  assert.deepEqual(rows.observations.map(row=>row.as_of).sort(),stamps.slice(1,3));
  assert.deepEqual(rows.daily_metrics[0].metrics,{reads:0});
  const found=rows.articles.find(row=>row.id===draft);
  assert.equal(found.status,'draft_saved');assert.equal(found.run_date,DAY);assert.equal(found.series_no,231);
  assert.equal(found.published_at,null);assert.equal(found.char_count,0);assert.equal(found.image_count,0);
  assert.deepEqual(found.sample,{source:'sample',ordered:[2,1]});assert.deepEqual(found.blockers,[{type:'later'},{type:'first'}]);
  assert.deepEqual(found.draft_ref,{path:'synthetic/draft'});assert.deepEqual(found.timings,{write:0});
  assert.deepEqual(found.reruns,{count:0});assert.deepEqual(found.verify_items,[{check:'source'}]);
  assert.equal(rows.articles.find(row=>row.id===unknown).status,null);
  assert.equal(hashAt(ok(await read(app,'/snapshot/index')),DAY),value.content_hash);
});

test('complete index detects old-day changes, removed final rows and date moves while detail stays a current projection',async t=>{
  const app=await setup(t),old='2023-01-02',moved='2023-01-03';
  await template(app);const empty=ok(await read(app,'/snapshot/index'));
  assert.equal(empty.complete,true);assert.equal(empty.projection,'current');assert.deepEqual(empty.dates,[]);
  const id=await todo(app,{date:old,text:'original'}),articleId=await article(app,{date:DAY});
  const first=ok(await read(app,'/snapshot/index')),detail=ok(await read(app,'/snapshot?date='+old));
  assert.deepEqual(new Set(dates(first)),new Set([old,DAY]));assert.equal(hashAt(first,old),detail.content_hash);
  assert.match(first.index_hash,/^[a-f0-9]{64}$/);assert.match(first.scope_id,/^[a-f0-9]{64}$/);
  const stable=ok(await read(app,'/snapshot/index'));assert.equal(stable.index_hash,first.index_hash);
  await changed(app,'UPDATE matrix_todos SET text=?,version=version+1 WHERE user_id=? AND id=?','backfilled current text',app.owner,id);
  const edited=ok(await read(app,'/snapshot/index')),current=ok(await read(app,'/snapshot?date='+old));
  assert.notEqual(hashAt(edited,old),hashAt(first,old));assert.equal(hashAt(edited,old),current.content_hash);
  assert.equal(current.data.todos[0].text,'backfilled current text');assert.equal(edited.scope_id,first.scope_id);
  await changed(app,'UPDATE matrix_articles SET run_date=? WHERE id=?',moved,articleId);
  const movedIndex=ok(await read(app,'/snapshot/index'));
  assert.deepEqual(new Set(dates(movedIndex)),new Set([old,moved]));
  assert.deepEqual(ok(await read(app)).data.articles,[],'the previous date exposes its current empty state');
  await changed(app,'UPDATE matrix_todos SET deleted_at=?,version=version+1 WHERE user_id=? AND id=?',STAMP,app.owner,id);
  const removed=ok(await read(app,'/snapshot/index'));
  assert.ok(!dates(removed).includes(old));assert.equal(removed.scope_id,first.scope_id,'data deletion does not invent a scope change');
  assert.deepEqual(ok(await read(app,'/snapshot?date='+old)).data.todos,[]);
  assert.notEqual(removed.index_hash,movedIndex.index_hash);
});

test('account and template dependencies alter every indexed daily hash, while account scope changes alter scope_id',async t=>{
  const app=await setup(t),id=await template(app),past='2024-05-02';
  await todo(app,{date:past});await note(app);const first=ok(await read(app,'/snapshot/index'));
  await changed(app,'UPDATE matrix_accounts SET name=? WHERE id=?','Renamed snapshot account',PUBLIC_ACCOUNT);
  const renamed=ok(await read(app,'/snapshot/index'));
  for(const date of dates(first))assert.notEqual(hashAt(first,date),hashAt(renamed,date),date);
  assert.equal(first.scope_id,renamed.scope_id);
  await changed(app,'UPDATE matrix_todo_templates SET text=?,version=version+1 WHERE user_id=? AND id=?','Renamed snapshot template',app.owner,id);
  const retitled=ok(await read(app,'/snapshot/index'));
  for(const date of dates(first))assert.notEqual(hashAt(renamed,date),hashAt(retitled,date),date);
  const expandedEnv={...app.env,PUBLIC_BUSINESS_ACCOUNT_IDS:JSON.stringify([PRIVATE_ACCOUNT,PUBLIC_ACCOUNT])};
  const expanded=ok(await read(app,'/snapshot/index',{env:expandedEnv}));
  assert.notEqual(expanded.scope_id,retitled.scope_id);assert.deepEqual(dates(expanded),dates(retitled));
  const reordered=ok(await read(app,'/snapshot/index',{env:{...expandedEnv,PUBLIC_BUSINESS_ACCOUNT_IDS:JSON.stringify([PUBLIC_ACCOUNT,PRIVATE_ACCOUNT])}}));
  assert.equal(reordered.scope_id,expanded.scope_id);assert.equal(reordered.index_hash,expanded.index_hash);
});

test('habit30days uses D-29 through D, distinct completion days and the 21-day threshold; its dependencies propagate',async t=>{
  const app=await setup(t),id=await template(app);
  for(let offset=-29;offset<=-10;offset++)await todo(app,{date:shiftDay(DAY,offset),completed:1,template:id});
  const today=await todo(app,{completed:1,template:id});await todo(app,{completed:1,template:id});
  await todo(app,{date:shiftDay(DAY,-30),completed:1,template:id});
  await todo(app,{date:shiftDay(DAY,1),completed:1,template:id});
  await todo(app,{date:shiftDay(DAY,-9),completed:1,deleted:STAMP,template:id});
  await todo(app,{date:shiftDay(DAY,-8),completed:0,template:id});
  const snapshot=ok(await read(app)),habit=snapshot.data.habit30days;
  assert.equal(habit.window_start,shiftDay(DAY,-29));assert.equal(habit.window_end,DAY);assert.equal(habit.threshold,21);
  assert.deepEqual(habit.templates,[{template_id:id,completed_days:21,habit_status:'habit'}]);
  const prior=ok(await read(app,'/snapshot?date='+shiftDay(DAY,-1))).data.habit30days;
  assert.equal(prior.templates[0].completed_days,21,'D-30 enters the preceding date window');
  const initial=ok(await read(app,'/snapshot/index'));
  await changed(app,'UPDATE matrix_todos SET completed=0,version=version+1 WHERE user_id=? AND date=?',app.owner,DAY);
  const changedIndex=ok(await read(app,'/snapshot/index')),after=ok(await read(app));
  assert.deepEqual(after.data.habit30days.templates,[{template_id:id,completed_days:20,habit_status:'todo'}]);
  assert.notEqual(hashAt(initial,DAY),hashAt(changedIndex,DAY));
  assert.notEqual(hashAt(initial,shiftDay(DAY,1)),hashAt(changedIndex,shiftDay(DAY,1)),'completion changes affect later habit windows');
  assert.equal(hashAt(initial,shiftDay(DAY,-10)),hashAt(changedIndex,shiftDay(DAY,-10)));
  assert.ok(after.data.todos.some(row=>row.id===today&&row.template_id===id));
});

test('a concurrent data change restarts the whole snapshot and reauthenticates instead of mixing revisions',async t=>{
  const app=await setup(t),id=await todo(app,{text:'before todo'});await note(app,{text:'before note'});
  let fired=false;
  const result=await read(app,undefined,{session:app.session,hooks:{async after(sql) {
    if(fired||! /FROM matrix_todos\b/.test(sql))return;fired=true;
    await app.db.batch([
      app.db.prepare('UPDATE matrix_todos SET text=?,version=version+1 WHERE user_id=? AND id=?').bind('after todo',app.owner,id),
      app.db.prepare('UPDATE matrix_daily_notes SET text=?,version=version+1 WHERE user_id=? AND date=?').bind('after note',app.notesOwner,DAY),
      app.db.prepare('UPDATE matrix_control SET revision=revision+1 WHERE id=1'),
    ]);
  }}});
  const value=ok(result);assert.ok(fired);assert.ok(authReads(result)>=3,'retry must authenticate again');
  assert.equal(result.db.entries.filter(row=>/FROM matrix_todos\b/.test(row.sql)).length,2);
  assert.equal(value.data.todos[0].text,'after todo');assert.equal(value.data.notes[0].text,'after note');
  assert.equal(value.content_hash,ok(await read(app,undefined,{session:app.session})).content_hash);
});

test('session revocation during a read fails after retry and never falls back to anonymous scope',async t=>{
  const app=await setup(t);await todo(app);let fired=false;
  const token=app.session.cookie.slice(app.session.cookie.indexOf('=')+1);
  const result=await read(app,undefined,{session:app.session,hooks:{async after(sql) {
    if(fired||! /FROM matrix_todos\b/.test(sql))return;fired=true;
    await changed(app,'DELETE FROM matrix_sessions WHERE token_hash=?',digest(token));
  }}});
  assert.ok(fired);assert.equal(result.status,401,result.text);assert.ok(authReads(result)>=2);
  assert.equal(Object.hasOwn(result.json,'data'),false);
});

test('public scope changes are detected inside a consistent-read retry and cannot masquerade as deleted records',async t=>{
  const app=await setup(t);await article(app,{title:'stays public'});await article(app,{account:PRIVATE_ACCOUNT,title:'REMOVED-SCOPE-CANARY'});
  const env={...app.env,PUBLIC_BUSINESS_ACCOUNT_IDS:JSON.stringify([PUBLIC_ACCOUNT,PRIVATE_ACCOUNT])};let fired=false;
  const result=await read(app,undefined,{env,hooks:{async after(sql) {
    if(fired||! /FROM matrix_articles\b/.test(sql))return;fired=true;
    await app.db.batch([
      app.db.prepare('INSERT INTO matrix_audit(id,actor,action,entity_id,detail_json,created_at) VALUES(?,?,?,?,?,?)')
        .bind(randomUUID(),'public:'+app.owner,'DELETE /accounts/'+PRIVATE_ACCOUNT,PRIVATE_ACCOUNT,'{}',STAMP),
      app.db.prepare('UPDATE matrix_control SET revision=revision+1 WHERE id=1'),
    ]);
  }}});
  assert.ok(fired);assert.equal(result.status,409,result.text);assert.equal(result.json.error.code,'SNAPSHOT_SCOPE_CHANGED');
  assert.equal(Object.hasOwn(result.json,'data'),false);
  assert.ok(!result.text.includes('REMOVED-SCOPE-CANARY'));
  const value=ok(await read(app,undefined,{env}));assert.deepEqual(value.data.accounts.map(row=>row.id),[PUBLIC_ACCOUNT]);
  assert.equal(value.scope_id,ok(await read(app)).scope_id);
  assert.ok(result.db.entries.filter(row=>/FROM matrix_audit\b/.test(row.sql)).length>=2);
});

test('snapshot reads beyond one 200-row page and hashes JSON keys canonically while preserving business array order',async t=>{
  const app=await setup(t);
  for(let offset=0;offset<205;offset+=40)await app.db.batch(Array.from({length:Math.min(40,205-offset)},(_,index)=>
    app.db.prepare('INSERT INTO matrix_todos(user_id,id,date,text,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .bind(app.owner,randomUUID(),DAY,'Paged snapshot '+(offset+index),STAMP,STAMP)));
  const id=await article(app);await app.db.prepare('UPDATE matrix_articles SET sample_json=? WHERE id=?')
    .bind('{"z":1,"a":2,"ordered":[2,1]}',id).run();
  const first=ok(await read(app));assert.equal(first.data.todos.length,205);
  await changed(app,'UPDATE matrix_articles SET sample_json=? WHERE id=?','{"ordered":[2,1],"a":2,"z":1}',id);
  const reordered=ok(await read(app));assert.equal(reordered.content_hash,first.content_hash);
  assert.equal(hashAt(ok(await read(app,'/snapshot/index')),DAY),reordered.content_hash);
  await changed(app,'UPDATE matrix_articles SET sample_json=? WHERE id=?','{"ordered":[1,2],"a":2,"z":1}',id);
  assert.notEqual(ok(await read(app)).content_hash,first.content_hash);
});

test('all snapshot budgets fail whole requests over real D1, and retry attempts share the query budget',async t=>{
  assert.deepEqual(SNAPSHOT_LIMITS,{maxQueries:45,maxRows:4000,maxBytes:1048576,maxDates:1000,
    maxHashBytes:8388608,maxResponseBytes:1048576,maxRowsRead:100000});
  const app=await setup(t);await todo(app);await todo(app,{date:shiftDay(DAY,-1)});
  for(const [name,value]of [['maxQueries',1],['maxRows',1],['maxBytes',1],['maxDates',1],
    ['maxHashBytes',16],['maxResponseBytes',64],['maxRowsRead',1]]) {
    const db=countingDb(app.db),request=new Request(app.origin+'/api/v1/snapshot/index',{headers:{Cookie:app.session.cookie}});
    await assert.rejects(handleSnapshot(db,request,'/snapshot/index',app.env,{limits:{[name]:value}}),
      error=>error.status===413&&error.code==='SNAPSHOT_LIMIT',name);
    assert.equal(db.totals().write_statements,0,name);assert.equal(db.totals().d1_rows_written,0,name);
    assert.ok(db.entries.length<=(name==='maxQueries'?value:45),name);
  }
  const baseline=await read(app,undefined,{session:app.session});ok(baseline);
  let fired=false;
  const db=countingDb(app.db,{async after(sql) {
    if(fired||! /FROM matrix_todos\b/.test(sql))return;fired=true;
    await changed(app,'UPDATE matrix_todos SET text=?,version=version+1 WHERE user_id=? AND date=?','revision changed',app.owner,DAY);
  }});
  const limit=baseline.db.entries.length+3;
  await assert.rejects(handleSnapshot(db,new Request(app.origin+'/api/v1/snapshot?date='+DAY,{headers:{Cookie:app.session.cookie}}),
    '/snapshot',app.env,{limits:{maxQueries:limit}}),error=>error.status===413&&error.code==='SNAPSHOT_LIMIT');
  assert.ok(fired);assert.ok(db.entries.length<=limit);assert.equal(db.totals().write_statements,0);
  assert.ok(db.entries.filter(row=>/FROM matrix_sessions\b/.test(row.sql)).length>=3,'retry authentication is part of the same budget');
});
