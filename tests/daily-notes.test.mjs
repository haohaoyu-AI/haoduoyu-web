import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {digest,csrfFor} from '../src/security.mjs';

async function setup(t) {
  const app=await fixture(t),session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,DAILY_NOTES_OWNER_ID:owner,
    PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'[]'};
  async function note(path='',{method='GET',body,auth=false,headers={},settings=env}={}) {
    const h=new Headers(headers);
    if(auth){h.set('Cookie',session.cookie);h.set('X-CSRF-Token',session.csrfToken);}
    if(body!==undefined)h.set('Content-Type','application/json');
    if(!['GET','HEAD'].includes(method)&&!h.has('Origin'))h.set('Origin',app.origin);
    const response=await worker.fetch(new Request(app.origin+'/api/v1/daily-notes'+path,{method,headers:h,
      body:body===undefined?undefined:JSON.stringify(body)}),settings);
    return {status:response.status,headers:response.headers,...await response.json()};
  }
  return {...app,owner,session,env,note};
}
const put=(text,version=0,save_id=randomUUID())=>({text,version,save_id});

test('public notes read only the configured owner; writes require its original session and origin/CSRF',async t=>{
  const app=await setup(t),date='2026-10-24',body=put('<img src=x onerror=alert(1)>\n纯文字');
  assert.equal((await app.note('?date='+date)).data.can_edit,false);
  const anonymous=await app.note('/'+date,{method:'PUT',body,headers:{'X-Public-Business':'1'}});
  assert.equal(anonymous.status,401);
  assert.equal((await app.note('/'+date,{method:'DELETE',body:{version:1,save_id:randomUUID()}})).status,401);
  const created=await app.note('/'+date,{method:'PUT',body,auth:true});
  assert.equal(created.status,200);assert.equal(created.data.version,1);assert.equal(created.data.can_edit,true);
  const publicRead=await app.note('?date='+date);
  assert.equal(publicRead.data.text,body.text);assert.equal(publicRead.data.can_edit,false);
  assert.ok(!JSON.stringify(publicRead).includes(app.owner));assert.ok(!JSON.stringify(publicRead).includes('password_hash'));
  assert.equal((await app.note('/'+date,{method:'PUT',body:put('foreign',1),auth:true,headers:{Origin:'https://foreign.invalid'}})).status,403);
  const forged=new Headers({Cookie:app.session.cookie,'X-CSRF-Token':'wrong',Origin:app.origin,'Content-Type':'application/json'});
  const response=await worker.fetch(new Request(app.origin+'/api/v1/daily-notes/'+date,{method:'PUT',headers:forged,body:JSON.stringify(put('bad',1))}),app.env);
  assert.equal(response.status,403);
  const other=randomUUID(),token=randomBytes(32).toString('hex');
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,created_at FROM matrix_users LIMIT 1')
    .bind(other,'synthetic-other-'+other).run();
  await app.db.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .bind(digest(token),other,new Date(Date.now()+86400000).toISOString()).run();
  await app.db.prepare('INSERT INTO matrix_daily_notes(user_id,date,text,version,change_seq,created_at,updated_at) VALUES(?,?,?,1,1,?,?)')
    .bind(other,date,'OTHER-USER-NOTE-CANARY',date,date).run();
  const denied=await app.note('/'+date,{method:'PUT',body:put('must not save',1),headers:{Cookie:'matrix_session='+token,'X-CSRF-Token':csrfFor(token)}});
  assert.equal(denied.status,403);
  assert.equal((await app.note('?date='+date,{headers:{Cookie:'matrix_session='+token}})).data.text,body.text);
  assert.equal((await app.note('?date='+date+'&user_id='+other)).status,400);
  const issued=await app.request('/api/v1/api-keys',{method:'POST',session:app.session,body:{name:'synthetic-reader',account_ids:['toutiao-haoduoyu'],permissions:['read','write']}});
  assert.equal((await app.note('/'+date,{method:'PUT',body:put('key cannot edit',1),headers:{Authorization:'Bearer '+issued.data.token}})).status,403);
});

test('CAS and metadata-only idempotency preserve newer edits; clear/delete remain syncable changes',async t=>{
  const app=await setup(t),date='2026-10-22',first=put('first');
  const one=await app.note('/'+date,{method:'PUT',body:first,auth:true});
  const seq1=(await app.db.prepare('SELECT change_seq FROM matrix_daily_notes WHERE user_id=? AND date=?').bind(app.owner,date).first()).change_seq;
  // A lost successful response is inspected by GET and can be retried with the exact same save ID.
  assert.equal((await app.note('?date='+date,{auth:true})).data.text,'first');
  assert.equal((await app.note('/'+date,{method:'PUT',body:first,auth:true})).data.version,one.data.version);
  assert.equal((await app.note('/'+date,{method:'PUT',body:{...first,text:'changed payload'},auth:true})).status,409);
  const changed=await app.note('/'+date,{method:'PUT',body:put('newer',1),auth:true});assert.equal(changed.data.version,2);
  assert.equal((await app.note('/'+date,{method:'PUT',body:first,auth:true})).status,409);
  assert.equal((await app.note('/'+date,{method:'PUT',body:put('stale tab',1),auth:true})).status,409);
  const seq2=(await app.db.prepare('SELECT change_seq FROM matrix_daily_notes WHERE user_id=? AND date=?').bind(app.owner,date).first()).change_seq;
  assert.ok(seq2>seq1);
  const clear=await app.note('/'+date,{method:'PUT',body:put('',2),auth:true});assert.equal(clear.data.version,3);
  assert.equal((await app.note('/dates')).data.dates.includes(date),false);
  const write=await app.note('/'+date,{method:'PUT',body:put('restore text',3),auth:true});assert.equal(write.data.version,4);
  const deleted=await app.note('/'+date,{method:'DELETE',body:{version:4,save_id:randomUUID()},auth:true});
  assert.equal(deleted.data.deleted,true);assert.equal(deleted.data.version,5);assert.equal(deleted.data.text,'');
  assert.deepEqual((await app.note('?date='+date)).data,{date,text:'',version:0,updated_at:null,deleted:false,can_edit:false});
  assert.equal((await app.note('?date='+date,{auth:true})).data.version,5);
  const tombstone=await app.db.prepare('SELECT text,deleted_at,change_seq FROM matrix_daily_notes WHERE user_id=? AND date=?').bind(app.owner,date).first();
  assert.equal(tombstone.text,'restore text');assert.ok(tombstone.deleted_at);assert.ok(tombstone.change_seq>seq2);
  const receipts=await app.db.prepare("SELECT response_json FROM matrix_idempotency WHERE key LIKE 'daily-notes:%'").all();
  assert.ok(!JSON.stringify(receipts).includes('restore text'));assert.ok(!JSON.stringify(receipts).includes('first'));
});

test('same-millisecond saves and old dates use monotonic change_seq; Beijing midnight selects the next page',async t=>{
  const app=await setup(t),OriginalDate=Date,stamp=Date.parse('2026-10-24T16:00:00.000Z');
  globalThis.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[stamp]));}static now(){return stamp;}};
  t.after(()=>{globalThis.Date=OriginalDate;});
  assert.equal((await app.note()).data.date,'2026-10-25');
  await app.note('/2026-10-01',{method:'PUT',body:put('old day edited'),auth:true});
  await app.note('/2026-10-25',{method:'PUT',body:put('new day'),auth:true});
  await app.note('/2026-10-01',{method:'PUT',body:put('old day edited again',1),auth:true});
  const rows=(await app.db.prepare('SELECT date,updated_at,change_seq FROM matrix_daily_notes WHERE user_id=? ORDER BY change_seq').bind(app.owner).all()).results;
  assert.equal(rows[0].date,'2026-10-25');assert.equal(rows[1].date,'2026-10-01');
  assert.equal(rows[0].updated_at,rows[1].updated_at);assert.ok(rows[1].change_seq>rows[0].change_seq);
});

test('bounded input and paged public date index do not alter anonymous todos',async t=>{
  const app=await setup(t);
  assert.equal((await app.note('/2026-10-24',{method:'PUT',body:put('x'.repeat(65537)),auth:true})).status,413);
  assert.equal((await app.note('/2026-02-30',{method:'PUT',body:put('invalid date'),auth:true})).status,400);
  assert.equal((await app.note('/2026-10-24',{method:'PUT',body:put('bad\0text'),auth:true})).status,400);
  assert.equal((await app.note('/2026-10-24',{method:'PUT',body:put('unpaired-\ud800'),auth:true})).status,400);
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_daily_notes').first()).n,0);
  for(const day of ['20','21','22'])await app.note('/2026-10-'+day,{method:'PUT',body:put('date '+day),auth:true});
  const page=await app.note('/dates?page_size=2');assert.deepEqual(page.data.dates,['2026-10-22','2026-10-21']);assert.equal(page.data.has_more,true);
  assert.deepEqual((await app.note('/dates?page_size=2&before='+page.data.next_before)).data.dates,['2026-10-20']);
  const response=await worker.fetch(new Request(app.origin+'/api/v1/todos',{method:'POST',headers:{Origin:app.origin,
    'Content-Type':'application/json','X-Public-Business':'1'},body:JSON.stringify({id:randomUUID(),date:'2026-10-24',text:'原待办匿名写不变'})}),app.env);
  assert.equal(response.status,201);
});

test('note-save frequency is bounded independently from the anonymous todo limiter',async t=>{
  const app=await setup(t),original=Date.now;
  Date.now=()=>Date.parse('2026-10-24T12:00:00.000Z');t.after(()=>{Date.now=original;});
  for(let i=0;i<60;i++)assert.equal((await app.note('/2026-10-24',{method:'PUT',body:put(''),auth:true})).status,200);
  const limited=await app.note('/2026-10-24',{method:'PUT',body:put(''),auth:true});
  assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'60');
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_daily_notes').first()).n,0);
});

test('unsafe source revision cannot create a rounded note change cursor',async t=>{
  const app=await setup(t);
  await app.db.prepare('UPDATE matrix_control SET revision=? WHERE id=1').bind(Number.MAX_SAFE_INTEGER).run();
  const result=await app.note('/2026-10-24',{method:'PUT',body:put('keep in draft'),auth:true});
  assert.equal(result.status,503);assert.equal(result.error.code,'NOTES_REVISION');
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_daily_notes').first()).n,0);
  assert.equal((await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision,Number.MAX_SAFE_INTEGER);
});
