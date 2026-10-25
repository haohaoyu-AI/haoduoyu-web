import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {digest,csrfFor} from '../src/security.mjs';
import {beijingDay} from '../src/lib/time.mjs';

const date='2026-10-24';
const put=(text='合成记录',version=0,category='life',day=date)=>({category,date:day,text,version,save_id:randomUUID()});
const marker=version=>({version,save_id:randomUUID()});
async function setup(t) {
  const app=await fixture(t),session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'0',
    PUBLIC_BUSINESS_USER_ID:owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'[]'};
  async function entry(path='',{method='GET',body,auth=false,headers={},settings=env}={}) {
    const h=new Headers(headers);
    if(auth){h.set('Cookie',session.cookie);h.set('X-CSRF-Token',session.csrfToken);}
    if(body!==undefined)h.set('Content-Type','application/json');
    if(!['GET','HEAD'].includes(method)&&!h.has('Origin'))h.set('Origin',app.origin);
    const response=await worker.fetch(new Request(app.origin+'/api/v1/note-entries'+path,{method,headers:h,
      body:body===undefined?undefined:JSON.stringify(body)}),settings);
    return {status:response.status,headers:response.headers,...await response.json()};
  }
  return {...app,owner,session,env,entry};
}
async function foreignUser(app) {
  const id=randomUUID(),token=randomBytes(32).toString('hex');
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,created_at FROM matrix_users LIMIT 1')
    .bind(id,'synthetic-entry-user-'+id).run();
  await app.db.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .bind(digest(token),id,new Date(Date.now()+86400000).toISOString()).run();
  return {id,headers:{Cookie:'matrix_session='+token,'X-CSRF-Token':csrfFor(token)}};
}
async function seed(app,day,count,{category='life',deleted=false}={}) {
  const time=new Date().toISOString(),ids=Array.from({length:count},()=>randomUUID());
  await app.db.batch(ids.map(id=>app.db.prepare('INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,1,1,?,?,?)')
    .bind(app.owner,id,category,day,'合成填充',time,time,deleted?time:null)));
  return ids;
}

test('timestamped entries remain distinct by UUID, day and category while old daily notes stay separate',async t=>{
  const app=await setup(t),ids=[randomUUID(),randomUUID(),randomUUID()],text='<img src=x onerror=alert(1)>\n纯文字';
  const before=Date.now();
  const first=await app.entry('/'+ids[0],{method:'PUT',auth:true,body:put(text)});
  assert.equal(first.status,200);assert.equal(first.data.text,text);assert.equal(first.data.version,1);
  assert.ok(Date.parse(first.data.created_at)>=before);assert.ok(Date.parse(first.data.created_at)<=Date.now());
  assert.equal(first.data.created_at,first.data.updated_at);assert.equal(first.data.deleted,false);
  assert.match(first.data.content_hash,/^[a-f0-9]{64}$/);
  await app.entry('/'+ids[1],{method:'PUT',auth:true,body:put('同日第二条')});
  await app.entry('/'+ids[2],{method:'PUT',auth:true,body:put('工作一条',0,'work')});
  const life=await app.entry('?category=life&date='+date),work=await app.entry('?category=work&date='+date);
  assert.equal(life.data.entries.length,2);assert.equal(work.data.entries.length,1);
  assert.deepEqual(new Set(life.data.entries.map(row=>row.id)),new Set(ids.slice(0,2)));
  assert.equal(life.data.can_edit,false);assert.ok(life.data.entries.every(row=>row.can_edit===false));
  assert.equal((await app.entry('?category=life&date=2026-10-23')).data.entries.length,0);
  const legacy=await worker.fetch(new Request(app.origin+'/api/v1/daily-notes?date='+date),app.env);
  assert.equal(legacy.status,200);assert.equal((await legacy.json()).data.text,'');
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_daily_notes').first()).n,0);
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_daily_work_notes').first()).n,0);
});

test('fixed-owner reads, tombstones and receipts preserve session, API key and public-origin boundaries',async t=>{
  const app=await setup(t),id=randomUUID(),body=put(),other=await foreignUser(app);
  assert.equal((await app.entry('/'+id,{method:'PUT',body,headers:{'X-Public-Business':'1'}})).status,401);
  assert.equal((await app.entry('/'+id,{method:'PUT',body,auth:true,headers:{Origin:'https://foreign.invalid'}})).status,403);
  assert.equal((await app.entry('/'+id,{method:'PUT',body,headers:{Cookie:app.session.cookie,'X-CSRF-Token':'wrong'}})).status,403);
  assert.equal((await app.entry('/'+id,{method:'PUT',body,headers:other.headers})).status,403);
  assert.equal((await app.entry('/'+id,{method:'PUT',body,auth:true})).status,200);
  const time=new Date().toISOString();
  await app.db.prepare('INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,1,1,?,?,NULL)')
    .bind(other.id,id,'life','2026-10-22','OTHER-OWNER-ENTRY-CANARY',time,time).run();
  for(const path of ['?date='+date,'/'+id,'/dates']) {
    const read=await app.entry(path,{headers:other.headers});assert.equal(read.status,200);
    assert.ok(!JSON.stringify(read).includes('OTHER-OWNER-ENTRY-CANARY'));assert.ok(!JSON.stringify(read).includes(app.owner));
  }
  assert.equal((await app.entry('/operations/'+body.save_id)).status,401);
  assert.equal((await app.entry('/operations/'+body.save_id,{headers:other.headers})).status,403);
  const key=await app.request('/api/v1/api-keys',{method:'POST',session:app.session,
    body:{name:'synthetic-entry-key',account_ids:['toutiao-haoduoyu'],permissions:['read','write']}});
  assert.equal((await app.entry('/'+id,{method:'PUT',body:put('API key denied',1),headers:{Authorization:'Bearer '+key.data.token}})).status,403);
  assert.equal((await app.entry('/operations/'+body.save_id,{headers:{Authorization:'Bearer '+key.data.token}})).status,403);
  const publicEnv={...app.env,PUBLIC_BUSINESS_MODE:'1'},publicId=randomUUID(),publicBody=put('公开同源记录');
  assert.equal((await app.entry('/'+publicId,{method:'PUT',body:publicBody,settings:publicEnv})).status,403);
  assert.equal((await app.entry('/'+publicId,{method:'PUT',body:publicBody,headers:{'X-Public-Business':'1',Origin:'https://foreign.invalid'},settings:publicEnv})).status,403);
  assert.equal((await app.entry('/'+publicId,{method:'PUT',body:publicBody,headers:{'X-Public-Business':'1'},settings:publicEnv})).status,200);
  assert.equal((await app.entry('/'+publicId,{settings:publicEnv})).data.can_edit,true);
  assert.equal((await app.entry('',{settings:{...app.env,DAILY_NOTES_OWNER_ID:undefined}})).status,503);
  assert.equal((await app.entry('',{settings:{...app.env,DAILY_NOTES_OWNER_ID:randomUUID()}})).status,503);
});

test('CAS and normalized UUID receipts accept exact retries and reject stale or repurposed saves',async t=>{
  const app=await setup(t),id=randomUUID(),first=put('receipt-text-canary');
  const saved=await app.entry('/'+id.toUpperCase(),{method:'PUT',auth:true,body:{...first,save_id:first.save_id.toUpperCase()}});
  assert.equal(saved.status,200);assert.equal(saved.data.id,id);
  const revision=(await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision;
  const replay=await app.entry('/'+id,{method:'PUT',auth:true,body:first});assert.equal(replay.data.version,1);
  assert.equal(replay.data.content_hash,saved.data.content_hash);
  assert.equal((await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision,revision);
  assert.equal((await app.entry('/'+id,{method:'PUT',auth:true,body:{...first,text:'different'}})).error.code,'IDEMPOTENCY_CONFLICT');
  assert.equal((await app.entry('/'+randomUUID(),{method:'PUT',auth:true,body:first})).error.code,'IDEMPOTENCY_CONFLICT');
  const receipt=await app.entry('/operations/'+first.save_id,{auth:true});
  assert.equal(receipt.data.found,true);assert.equal(receipt.data.id,id);assert.equal(receipt.data.content_hash,saved.data.content_hash);
  assert.ok(!JSON.stringify(receipt).includes(first.text));
  assert.equal((await app.entry('/operations/'+randomUUID(),{auth:true})).data.found,false);
  const race=await Promise.all(['A','B'].map(text=>app.entry('/'+id,{method:'PUT',auth:true,body:put(text,1)})));
  assert.deepEqual(race.map(result=>result.status).sort(),[200,409]);
  const latest=await app.entry('/'+id,{auth:true});assert.equal(latest.data.version,2);
  assert.ok(latest.data.change_seq>saved.data.change_seq);assert.notEqual(latest.data.content_hash,saved.data.content_hash);
  assert.equal(latest.data.created_at,saved.data.created_at);
  assert.equal((await app.entry('/'+id,{method:'PUT',auth:true,body:first})).error.code,'VERSION_CONFLICT');
  assert.equal((await app.entry('/operations/'+first.save_id,{auth:true})).data.version,1);
  const receipts=(await app.db.prepare("SELECT response_json FROM matrix_idempotency WHERE key LIKE 'note-entry:%'").all()).results;
  assert.ok(!JSON.stringify(receipts).includes(first.text));
});

test('explicit deletion and restoration retain text and timestamps without exposing public tombstones',async t=>{
  const app=await setup(t),id=randomUUID(),first=await app.entry('/'+id,{method:'PUT',auth:true,body:put('恢复时保留正文')});
  const removal=marker(1),deleted=await app.entry('/'+id,{method:'DELETE',auth:true,body:removal});
  assert.equal(deleted.status,200);assert.equal(deleted.data.version,2);assert.equal(deleted.data.deleted,true);
  assert.equal((await app.entry('/'+id,{method:'DELETE',auth:true,body:removal})).data.version,2);
  assert.equal((await app.entry('/'+id)).status,404);
  assert.equal((await app.entry('?date='+date)).data.entries.length,0);
  assert.equal((await app.entry('/dates')).data.dates.includes(date),false);
  const tombstone=await app.entry('/'+id,{auth:true});assert.equal(tombstone.data.text,'恢复时保留正文');assert.ok(tombstone.data.deleted_at);
  assert.equal((await app.entry('/'+id,{method:'PUT',auth:true,body:put('must restore',2)})).error.code,'NOTE_ENTRY_DELETED');
  const restored=await app.entry('/'+id+'/restore',{method:'POST',auth:true,body:marker(2)});
  assert.equal(restored.status,200);assert.equal(restored.data.version,3);assert.equal(restored.data.deleted_at,null);
  assert.equal(restored.data.text,first.data.text);assert.equal(restored.data.created_at,first.data.created_at);
  assert.ok(restored.data.change_seq>deleted.data.change_seq);
  assert.equal((await app.entry('/'+id,{method:'DELETE',auth:true,body:removal})).error.code,'VERSION_CONFLICT');
  assert.equal((await app.entry('/'+id+'/restore',{method:'POST',auth:true,body:marker(3)})).status,409);
});

test('unknown committed responses are reconciled by receipt while commit authorization is rechecked',async t=>{
  const app=await setup(t),id=randomUUID(),body=put('committed response lost');let commits=0;
  const uncertainDb=new Proxy(app.db,{get(target,key){
    if(key==='batch')return async statements=>{commits++;await target.batch(statements);throw Error('synthetic response loss after commit');};
    const value=target[key];return typeof value==='function'?value.bind(target):value;
  }});
  const unknown=await app.entry('/'+id,{method:'PUT',auth:true,body,settings:{...app.env,DB:uncertainDb}});
  assert.equal(unknown.status,500);assert.equal(commits,1);
  const receipt=(await app.entry('/operations/'+body.save_id,{auth:true})).data,current=(await app.entry('/'+id,{auth:true})).data;
  assert.equal(receipt.found,true);assert.equal(receipt.content_hash,current.content_hash);assert.equal(current.text,body.text);
  assert.equal((await app.entry('/'+id,{method:'PUT',auth:true,body})).data.version,1);
  const next=put('revoked session must not write',1);commits=0;
  const revokedDb=new Proxy(app.db,{get(target,key){
    if(key==='batch')return async statements=>{commits++;await target.prepare('DELETE FROM matrix_sessions WHERE user_id=?').bind(app.owner).run();return target.batch(statements);};
    const value=target[key];return typeof value==='function'?value.bind(target):value;
  }});
  assert.equal((await app.entry('/'+id,{method:'PUT',auth:true,body:next,settings:{...app.env,DB:revokedDb}})).status,401);
  assert.equal(commits,1);assert.equal((await app.entry('/'+id)).data.text,body.text);
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_idempotency WHERE key=?').bind('note-entry:'+next.save_id).first()).n,0);
});

test('input identity and immutable dates reject fabricated timestamps, malformed text and ambiguous queries',async t=>{
  const app=await setup(t),id=randomUUID();
  for(const body of [put('bad\0'),put('bad\ud800'),put('bad',0,'other'),put('bad',0,'life','2026-02-30'),
    {...put(),happened_at:'2000-01-01T00:00:00Z'},{...put(),created_at:'2000-01-01T00:00:00Z'},
    {...put(),version:1.5},{...put(),save_id:'bad'}])
    assert.equal((await app.entry('/'+id,{method:'PUT',auth:true,body})).status,400);
  assert.equal((await app.entry('/'+id,{method:'PUT',auth:true,body:put('界'.repeat(21846))})).status,413);
  assert.equal((await app.entry('/not-a-uuid',{method:'PUT',auth:true,body:put()})).status,400);
  assert.equal((await app.entry('/'+id,{auth:true})).status,404);
  for(const query of ['?date='+date+'&date='+date,'?category=other','?user_id='+randomUUID(),'/dates?page_size=101','/dates?before=2026-02-30'])
    assert.equal((await app.entry(query)).status,400);
  const first=await app.entry('/'+id,{method:'PUT',auth:true,body:put('CRLF\r\nnormalized\rtext')});
  assert.equal(first.data.text,'CRLF\nnormalized\ntext');
  assert.equal((await app.entry('/'+id,{method:'PUT',auth:true,body:put('move',1,'work')})).status,400);
  assert.equal((await app.entry('/'+id,{method:'PUT',auth:true,body:put('move',1,'life','2026-10-23')})).status,400);
  assert.equal((await app.entry('/'+id+'?category=life',{method:'PUT',auth:true,body:put('query',1)})).status,400);
  assert.equal((await app.entry('/'+id+'?date='+date)).status,400);
  assert.equal((await app.entry('/operations/'+randomUUID()+'?category=life',{auth:true})).status,400);
});

test('date pagination deduplicates days and complete-day limits guard concurrent creation and restore',async t=>{
  const app=await setup(t);
  await seed(app,'2026-10-20',2);await seed(app,'2026-10-21',2);await seed(app,'2026-10-22',2);
  await seed(app,'2026-10-23',1,{category:'work'});
  const dates=await app.entry('/dates?category=life&page_size=2');
  assert.deepEqual(dates.data.dates,['2026-10-22','2026-10-21']);assert.equal(dates.data.has_more,true);
  assert.deepEqual((await app.entry('/dates?category=life&page_size=2&before='+dates.data.next_before)).data.dates,['2026-10-20']);
  assert.deepEqual((await app.entry('/dates?category=work')).data.dates,['2026-10-23']);
  await seed(app,date,199);
  const creates=await Promise.all([randomUUID(),randomUUID()].map(id=>app.entry('/'+id,{method:'PUT',auth:true,body:put()})));
  assert.deepEqual(creates.map(result=>result.status).sort(),[200,409]);
  assert.equal(creates.find(result=>result.status===409).error.code,'NOTES_LIMIT');
  assert.equal((await app.entry('?date='+date)).data.entries.length,200);
  const restoreDay='2026-10-19';await seed(app,restoreDay,199);
  const deleted=await seed(app,restoreDay,2,{deleted:true});
  const restores=await Promise.all(deleted.map(id=>app.entry('/'+id+'/restore',{method:'POST',auth:true,body:marker(1)})));
  assert.deepEqual(restores.map(result=>result.status).sort(),[200,409]);
  assert.equal((await app.entry('?date='+restoreDay)).data.entries.length,200);
  await seed(app,'2026-10-18',201);
  const oversized=await app.entry('?date=2026-10-18');
  assert.equal(oversized.status,503);assert.equal(oversized.error.code,'NOTES_LIMIT');assert.equal(oversized.data,undefined);
});

test('server timestamps sort deterministically and change sequences survive same-millisecond edits and unsafe revisions',async t=>{
  const app=await setup(t),OriginalDate=Date,stamp=Date.now();
  globalThis.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[stamp]));}static now(){return stamp;}};
  t.after(()=>{globalThis.Date=OriginalDate;});
  assert.equal((await app.entry()).data.date,beijingDay(stamp));
  const ids=[randomUUID(),randomUUID()].sort(),one=await app.entry('/'+ids[1],{method:'PUT',auth:true,body:put('later UUID created first')});
  const two=await app.entry('/'+ids[0],{method:'PUT',auth:true,body:put('earlier UUID created second')});
  const three=await app.entry('/'+ids[1],{method:'PUT',auth:true,body:put('same-millisecond update',1)});
  assert.equal(one.data.created_at,two.data.created_at);assert.equal(two.data.updated_at,three.data.updated_at);
  assert.ok(one.data.change_seq<two.data.change_seq);assert.ok(two.data.change_seq<three.data.change_seq);
  assert.deepEqual((await app.entry('?date='+date)).data.entries.map(row=>row.id),ids);
  await app.db.prepare('UPDATE matrix_control SET revision=? WHERE id=1').bind(Number.MAX_SAFE_INTEGER).run();
  const unsafe=await app.entry('/'+randomUUID(),{method:'PUT',auth:true,body:put('keep draft')});
  assert.equal(unsafe.status,503);assert.equal(unsafe.error.code,'NOTES_REVISION');
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_note_entries').first()).n,2);
  assert.equal((await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision,Number.MAX_SAFE_INTEGER);
});
