import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {fixture} from './harness.mjs';
import {csrfFor,digest} from '../src/security.mjs';
import {revision} from '../src/storage.mjs';
import {handleWorkReminders,WORK_REMINDER_LIMITS,workReminderSummary} from '../src/work-reminders.mjs';

const date='2026-10-25';
const input=(changes={})=>({date,source_key:'tencent-work:morning',summary:'今日公开工作摘要',version:0,save_id:randomUUID(),...changes});
async function setup(t) {
  const app=await fixture(t),session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'0',PUBLIC_BUSINESS_USER_ID:randomUUID()};
  async function reminder(path='',{method='GET',body,auth=false,headers={},settings=env,db=app.db}={}) {
    const h=new Headers(headers);
    if(auth){h.set('Cookie',session.cookie);h.set('X-CSRF-Token',session.csrfToken);}
    if(body!==undefined)h.set('Content-Type','application/json');
    if(!['GET','HEAD'].includes(method)&&!h.has('Origin'))h.set('Origin',app.origin);
    const request=new Request(app.origin+'/api/v1/work-reminders'+path,{method,headers:h,
      body:body===undefined?undefined:JSON.stringify(body)});
    try {
      const response=await handleWorkReminders(db,request,new URL(request.url).pathname.slice('/api/v1'.length),settings,app.origin);
      return {status:response.status,...await response.json()};
    } catch(error) {
      if(!error.status)throw error;
      return {status:error.status,error:{code:error.code,message:error.message}};
    }
  }
  return {...app,owner,session,env,reminder};
}
async function anotherOwner(app) {
  const id=randomUUID(),token=randomBytes(32).toString('hex');
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,created_at FROM matrix_users WHERE id=?')
    .bind(id,'synthetic-reminder-'+id,app.owner).run();
  await app.db.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .bind(digest(token),id,new Date(Date.now()+86400000).toISOString()).run();
  return {id,headers:{Cookie:'matrix_session='+token,'X-CSRF-Token':csrfFor(token)}};
}
async function stored(app,id) {
  return app.db.prepare('SELECT * FROM matrix_work_reminders WHERE user_id=? AND id=?').bind(app.owner,id).first();
}

test('reminders share notes ownership and same-origin public/session permissions without granting bearer access',async t=>{
  const app=await setup(t),id=randomUUID(),body=input();
  assert.equal((await app.reminder('?date='+date)).data.can_edit,false);
  assert.equal((await app.reminder('/'+id,{method:'PUT',body})).status,401);
  assert.equal((await app.reminder('/'+id,{method:'PUT',body,auth:true,headers:{Origin:'https://foreign.invalid'}})).status,403);
  assert.equal((await app.reminder('/'+id,{method:'PUT',body,headers:{Cookie:app.session.cookie,'X-CSRF-Token':'wrong'}})).status,403);
  const created=await app.reminder('/'+id,{method:'PUT',body,auth:true});
  assert.equal(created.status,200);assert.equal(created.data.can_edit,true);
  const other=await anotherOwner(app),otherDate='2026-10-26',otherId=randomUUID();
  await app.db.prepare('INSERT INTO matrix_work_reminders(user_id,id,date,source_key,summary,version,change_seq,created_at,updated_at) VALUES(?,?,?,?,?,1,1,?,?)')
    .bind(other.id,otherId,otherDate,'other','OTHER-OWNER-REMINDER-CANARY',date,date).run();
  assert.equal((await app.reminder('/'+id,{method:'PUT',body:input({version:1}),headers:other.headers})).status,403);
  assert.deepEqual((await app.reminder('?date='+otherDate)).data.items,[]);
  const publicRead=await app.reminder('?date='+date,{headers:other.headers});
  assert.equal(publicRead.data.items[0].summary,body.summary);assert.equal(publicRead.data.can_edit,false);
  assert.ok(!JSON.stringify(publicRead).includes(app.owner));assert.ok(!JSON.stringify(publicRead).includes('password_hash'));
  const key=await app.request('/api/v1/api-keys',{method:'POST',session:app.session,
    body:{name:'synthetic-reminder-denied',account_ids:['toutiao-haoduoyu'],permissions:['read','write']}});
  assert.equal((await app.reminder('/'+id,{method:'PUT',body:input({version:1}),headers:{Authorization:'Bearer '+key.data.token}})).status,403);
  const publicSettings={...app.env,PUBLIC_BUSINESS_MODE:'1'},publicId=randomUUID(),publicBody=input({source_key:'public-origin'});
  assert.equal((await app.reminder('/'+publicId,{method:'PUT',body:publicBody,settings:publicSettings})).status,403);
  assert.equal((await app.reminder('/'+publicId,{method:'PUT',body:publicBody,settings:publicSettings,
    headers:{Origin:'https://foreign.invalid','X-Public-Business':'1'}})).status,403);
  const publicWrite=await app.reminder('/'+publicId,{method:'PUT',body:publicBody,settings:publicSettings,headers:{'X-Public-Business':'1'}});
  assert.equal(publicWrite.status,200);assert.equal((await stored(app,publicId)).user_id,app.owner);
});

test('CAS, exact receipts and same-content save IDs preserve content revisions and real timestamps',async t=>{
  const app=await setup(t),id=randomUUID(),body=input(),before=await revision(app.db);
  const first=await app.reminder('/'+id,{method:'PUT',body,auth:true});
  assert.equal(first.status,200);assert.equal(first.data.version,1);assert.match(first.data.content_hash,/^[a-f0-9]{64}$/);
  assert.equal(first.data.created_at,first.data.updated_at);assert.ok(Number.isFinite(Date.parse(first.data.created_at)));
  assert.equal(await revision(app.db),before+1);
  const replay=await app.reminder('/'+id.toUpperCase(),{method:'PUT',body:{...body,save_id:body.save_id.toUpperCase()},auth:true});
  assert.deepEqual(replay.data,first.data);assert.equal(await revision(app.db),before+1);
  assert.equal((await app.reminder('/'+id,{method:'PUT',body:{...body,summary:'改过的请求'},auth:true})).error.code,'IDEMPOTENCY_CONFLICT');
  const unchanged=input({summary:body.summary,version:1});
  const noOp=await app.reminder('/'+id,{method:'PUT',body:unchanged,auth:true});
  assert.deepEqual(noOp.data,first.data);assert.equal(await revision(app.db),before+1);
  assert.equal((await app.reminder('/'+id,{method:'PUT',body:{...unchanged,summary:'不得重用无变更收据'},auth:true})).error.code,'IDEMPOTENCY_CONFLICT');
  const updated=await app.reminder('/'+id,{method:'PUT',body:input({summary:'后来的公开摘要',version:1}),auth:true});
  assert.equal(updated.status,200);assert.equal(updated.data.version,2);assert.equal(updated.data.created_at,first.data.created_at);
  assert.ok(updated.data.change_seq>first.data.change_seq);assert.notEqual(updated.data.content_hash,first.data.content_hash);
  assert.equal((await app.reminder('/'+id,{method:'PUT',body,auth:true})).error.code,'VERSION_CONFLICT');
  assert.equal((await app.reminder('/'+id,{method:'PUT',body:input({summary:'后来的公开摘要',version:1}),auth:true})).status,409,
    'identical text does not bypass a stale CAS version');
  const receipts=(await app.db.prepare("SELECT response_json FROM matrix_idempotency WHERE key LIKE 'work-reminder:%'").all()).results;
  assert.equal(receipts.length,3);assert.ok(!JSON.stringify(receipts).includes(body.summary));assert.ok(!JSON.stringify(receipts).includes('后来的公开摘要'));
  assert.equal(await revision(app.db),before+2);
});

test('daily source keys deduplicate scheduler retries and tombstones restore the original reminder',async t=>{
  const app=await setup(t),id=randomUUID(),body=input();
  await app.reminder('/'+id,{method:'PUT',body,auth:true});
  const duplicate=await app.reminder('/'+randomUUID(),{method:'PUT',body:input(),auth:true});
  assert.equal(duplicate.status,409);assert.equal(duplicate.error.code,'WORK_REMINDER_EXISTS');
  for(const changed of [{date:'2026-10-26'},{source_key:'changed'}])
    assert.equal((await app.reminder('/'+id,{method:'PUT',body:input({version:1,...changed}),auth:true})).status,400);
  const removed=await app.reminder('/'+id,{method:'DELETE',body:{version:1,save_id:randomUUID()},auth:true});
  assert.equal(removed.status,200);assert.equal(removed.data.deleted,true);assert.equal(removed.data.version,2);
  assert.deepEqual((await app.reminder('?date='+date)).data.items,[]);
  assert.equal((await stored(app,id)).summary,body.summary);assert.ok((await stored(app,id)).deleted_at);
  assert.equal((await app.reminder('/'+randomUUID(),{method:'PUT',body:input(),auth:true})).error.code,'WORK_REMINDER_EXISTS');
  assert.equal((await app.reminder('/'+id,{method:'PUT',body:input({version:2}),auth:true})).error.code,'WORK_REMINDER_DELETED');
  const restored=await app.reminder('/'+id+'/restore',{method:'POST',body:{version:2,save_id:randomUUID()},auth:true});
  assert.equal(restored.status,200);assert.equal(restored.data.deleted,false);assert.equal(restored.data.version,3);
  assert.equal(restored.data.summary,body.summary);assert.equal(restored.data.created_at,removed.data.created_at);
  assert.ok(restored.data.change_seq>removed.data.change_seq);
  assert.equal((await app.reminder('?date='+date)).data.items[0].id,id);
  const nextDay=await app.reminder('/'+randomUUID(),{method:'PUT',body:input({date:'2026-10-26'}),auth:true});
  assert.equal(nextDay.status,200,'the same source can produce a separate summary on another date');
});

test('strict date, source, summary and field validation reject malformed writes without saving',async t=>{
  const app=await setup(t),id=randomUUID();
  const changes=[{date:'2026-02-29'},{date:'0000-01-01'},{date:'2026-1-01'},
    {source_key:''},{source_key:'中文来源'},{source_key:'x'.repeat(101)},{source_key:'source/name'},{source_key:'source\n'},
    {summary:5},{summary:'bad\0text'},{summary:'unpaired-\ud800'},
    {version:-1},{version:'0'},{version:Number.MAX_SAFE_INTEGER},{save_id:'bad'},{save_id:randomUUID()+'\n'},
    {extra:true},{created_at:date},{id:randomUUID()}];
  for(const change of changes) {
    const rejected=await app.reminder('/'+id,{method:'PUT',body:input(change),auth:true});
    assert.equal(rejected.status,400,JSON.stringify(change));
  }
  assert.equal((await app.reminder('/'+id,{method:'PUT',body:input({summary:'x'.repeat(16385)}),auth:true})).status,413);
  assert.equal((await app.reminder('/'+id,{method:'PUT',body:input({summary:'鱼'.repeat(5462)}),auth:true})).status,413);
  for(const query of ['?date=2026-02-29','?date='+date+'&date='+date,'?date='+date+'&owner=other'])
    assert.equal((await app.reminder(query)).status,400);
  assert.equal((await app.reminder('/'+id+'?date='+date,{method:'PUT',body:input(),auth:true})).status,400);
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_work_reminders').first()).n,0);
  const valid=await app.reminder('/'+id,{method:'PUT',body:input({date:'2099-01-01',summary:'x'.repeat(16384)}),auth:true});
  assert.equal(valid.status,200);assert.equal(valid.data.date,'2099-01-01');
  assert.equal(workReminderSummary('第一行\r\n第二行\r第三行'),'第一行\n第二行\n第三行');
  assert.equal(WORK_REMINDER_LIMITS.summary,16384);
});

test('day reads are complete through 100 items and fail explicitly rather than truncate an oversized day',async t=>{
  const app=await setup(t),stamp=new Date().toISOString();
  const seed=(id,source)=>app.db.prepare('INSERT INTO matrix_work_reminders(user_id,id,date,source_key,summary,version,change_seq,created_at,updated_at) VALUES(?,?,?,?,?,1,1,?,?)')
    .bind(app.owner,id,date,source,'已有提醒 '+source,stamp,stamp);
  await app.db.batch(Array.from({length:100},(_,index)=>seed(randomUUID(),'seed-'+index)));
  const full=await app.reminder('?date='+date);
  assert.equal(full.status,200);assert.equal(full.data.items.length,100);
  const before=await revision(app.db),limited=await app.reminder('/'+randomUUID(),{method:'PUT',body:input({source_key:'over-limit'}),auth:true});
  assert.equal(limited.status,413);assert.equal(await revision(app.db),before);
  await seed(randomUUID(),'seed-overflow').run();
  const overflow=await app.reminder('?date='+date);
  assert.equal(overflow.status,413);assert.equal(overflow.error.code,'WORK_REMINDERS_TOO_LARGE');
  assert.equal(Object.hasOwn(overflow,'data'),false);
});

test('concurrent scheduler retries save once and an unknown commit outcome is recovered using its exact save ID',async t=>{
  const app=await setup(t),id=randomUUID(),body=input(),before=await revision(app.db);
  const duplicate=await Promise.all(Array.from({length:6},()=>app.reminder('/'+id,{method:'PUT',body,auth:true})));
  assert.equal(duplicate.every(result=>result.status===200),true);
  assert.equal(new Set(duplicate.map(result=>JSON.stringify(result.data))).size,1);
  assert.equal(await revision(app.db),before+1);
  const nextId=randomUUID(),next=input({source_key:'lost-response'});let commits=0;
  const uncertain={prepare:app.db.prepare.bind(app.db),batch:async statements=>{
    commits++;await app.db.batch(statements);throw new Error('Synthetic reminder response lost after commit');
  }};
  await assert.rejects(app.reminder('/'+nextId,{method:'PUT',body:next,auth:true,db:uncertain}),/Synthetic reminder response lost/);
  assert.equal(commits,1);assert.equal(await revision(app.db),before+2);
  const recovered=await app.reminder('/'+nextId,{method:'PUT',body:next,auth:true});
  assert.equal(recovered.status,200);assert.equal(recovered.data.version,1);
  assert.equal((await app.reminder('?date='+date)).data.items.length,2);
  await app.db.prepare('UPDATE matrix_control SET revision=? WHERE id=1').bind(Number.MAX_SAFE_INTEGER).run();
  const unsafe=await app.reminder('/'+randomUUID(),{method:'PUT',body:input({source_key:'unsafe-cursor'}),auth:true});
  assert.equal(unsafe.status,503);assert.equal(unsafe.error.code,'WORK_REMINDERS_REVISION');
});
