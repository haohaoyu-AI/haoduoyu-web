import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {digest,csrfFor,requireAdmin} from '../src/security.mjs';
import {noteEditor,limitNoteWrites} from '../src/public-note-access.mjs';
import {storeFor} from '../src/storage.mjs';

async function setup(t) {
  const app=await fixture(t),session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'1',DAILY_NOTES_OWNER_ID:owner,MEMOS_OWNER_ID:owner,
    PUBLIC_BUSINESS_USER_ID:owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'[]'};
  async function request(path,{method='GET',body,headers={},ownerSession=false,settings=env}={}) {
    const h=new Headers(headers);
    if(method!=='GET'){h.set('Origin',h.get('Origin')||app.origin);if(!h.has('X-Public-Business'))h.set('X-Public-Business','1');}
    if(body!==undefined)h.set('Content-Type','application/json');
    if(ownerSession){h.set('Cookie',session.cookie);h.set('X-CSRF-Token',session.csrfToken);}
    const response=await worker.fetch(new Request(app.origin+'/api/v1'+path,{method,headers:h,
      body:body===undefined?undefined:JSON.stringify(body)}),settings);
    return {status:response.status,...await response.json()};
  }
  return {...app,env,owner,session,request};
}
const marker=version=>({version,save_id:randomUUID()});
const group=(version=0)=>({...marker(version),title:'public synthetic group',position:0});
const note=(gid,version=0,text='public synthetic text')=>({...marker(version),group_id:gid,title:'public note',body:text,position:0});
const daily=(version=0,text='public daily text')=>({...marker(version),text});

test('anonymous daily notes create edit delete and restore original text with CAS and exact retries',async t=>{
  const app=await setup(t),path='/daily-notes/2026-10-25',first=daily();
  assert.equal((await app.request('/daily-notes')).data.can_edit,true);
  assert.equal((await app.request(path,{method:'PUT',body:first})).data.version,1);
  assert.equal((await app.request(path,{method:'PUT',body:first})).data.version,1);
  assert.equal((await app.request(path,{method:'PUT',body:daily(0,'stale')})).status,409);
  assert.equal((await app.request(path,{method:'PUT',body:daily(1,'updated text')})).data.version,2);
  assert.equal((await app.request(path,{method:'DELETE',body:marker(2)})).data.deleted,true);
  const deleted=(await app.request('/daily-notes?date=2026-10-25')).data;
  assert.equal(deleted.version,3);assert.equal(deleted.deleted,true);
  const restore=marker(3);
  assert.equal((await app.request(path+'/restore',{method:'POST',body:restore})).data.text,'updated text');
  assert.equal((await app.request(path+'/restore',{method:'POST',body:restore})).data.version,4);
  const rows=(await app.db.prepare("SELECT actor FROM matrix_idempotency WHERE key LIKE 'daily-notes:%'").all()).results;
  assert.ok(rows.every(row=>row.actor==='public-notes:'+app.owner));
});

test('anonymous memo groups and notes share fixed owner, receipts, CAS and reversible deletion',async t=>{
  const app=await setup(t),gid=randomUUID(),nid=randomUUID(),create=group();
  const index=(await app.request('/memos')).data;assert.equal(index.can_edit,true);assert.ok(index.draft_scope);
  assert.ok(!JSON.stringify(index).includes(app.owner));
  assert.equal((await app.request('/memos/groups/'+gid,{method:'PUT',body:create})).status,200);
  const first=note(gid);
  assert.equal((await app.request('/memos/notes/'+nid,{method:'PUT',body:first})).data.version,1);
  assert.equal((await app.request('/memos/notes/'+nid,{method:'PUT',body:first})).data.version,1);
  assert.equal((await app.request('/memos/operations/'+first.save_id)).data.found,true);
  const concurrent=await Promise.all(['one','two'].map(text=>app.request('/memos/notes/'+nid,{method:'PUT',body:note(gid,1,text)})));
  assert.deepEqual(concurrent.map(row=>row.status).sort(),[200,409]);
  assert.equal((await app.request('/memos/notes/'+nid,{method:'DELETE',body:marker(2)})).data.version,3);
  assert.equal((await app.request('/memos/notes/'+nid+'/restore',{method:'POST',body:marker(3)})).data.version,4);
  const remove={...marker(1),confirm_title:create.title,confirm_note_count:1};
  assert.equal((await app.request('/memos/groups/'+gid,{method:'DELETE',body:{...remove,confirm_note_count:0}})).status,409);
  assert.equal((await app.request('/memos/groups/'+gid,{method:'DELETE',body:remove})).status,200);
  assert.equal((await app.request('/memos/groups/'+gid+'/restore',{method:'POST',body:marker(2)})).status,200);
  assert.equal((await app.request('/memos/notes/'+nid)).data.deleted_at,null);
});

test('public writes require Origin/header, reject arbitrary ownership and keys, never open control plane',async t=>{
  const app=await setup(t),gid=randomUUID();
  for(const [path,body]of [['/daily-notes/2026-10-25',daily()],['/memos/groups/'+gid,group()]]) {
    for(const headers of [{'X-Public-Business':''},{Origin:'https://foreign.invalid'},{Origin:'null'}])
      assert.equal((await app.request(path,{method:'PUT',body,headers})).status,403);
    assert.equal((await app.request(path+'?user_id='+randomUUID(),{method:'PUT',body})).status,400);
    assert.equal((await app.request(path,{method:'PUT',body:{...body,user_id:randomUUID()}})).status,400);
  }
  for(const path of ['/backup','/api-keys','/audit'])assert.equal((await app.request(path)).status,401);
  assert.equal((await app.request('/auth/password',{method:'PUT',body:{}})).status,401);
  const actor=await noteEditor(storeFor(app.db),new Request(app.origin+'/api/v1/memos'),app.owner,app.env,'memos',app.origin);
  assert.equal(actor.kind,'public');assert.throws(()=>requireAdmin(actor));
  const foreign=randomUUID(),token=randomBytes(32).toString('hex');
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,created_at FROM matrix_users LIMIT 1')
    .bind(foreign,'synthetic-other-'+foreign).run();
  await app.db.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .bind(digest(token),foreign,new Date(Date.now()+86400000).toISOString()).run();
  assert.equal((await app.request('/memos/groups/'+gid,{method:'PUT',body:group(),headers:{Cookie:'matrix_session='+token,
    'X-CSRF-Token':csrfFor(token)}})).status,403);
  const key=(await app.request('/api-keys',{method:'POST',ownerSession:true,
    body:{name:'synthetic-key',account_ids:['toutiao-haoduoyu'],permissions:['read','write']}})).data.token;
  assert.equal((await app.request('/memos/groups/'+gid,{method:'PUT',body:group(),headers:{Authorization:'Bearer '+key}})).status,403);
  assert.equal((await app.request('/memos/groups/'+gid,{method:'PUT',body:group(),headers:{Cookie:app.session.cookie,'X-CSRF-Token':'wrong'}})).status,403);
  assert.equal((await app.request('/memos/groups/'+gid,{method:'PUT',body:group(),ownerSession:true})).status,200);
  const row=await app.db.prepare("SELECT actor FROM matrix_idempotency WHERE key LIKE 'memo:%' LIMIT 1").first();
  assert.equal(row.actor,'user:'+app.owner);
});

test('anonymous write limits are bounded and independently keyed by module',()=>{
  const owner=randomUUID();
  for(let i=0;i<60;i++)limitNoteWrites(owner,'memos',1000);
  assert.throws(()=>limitNoteWrites(owner,'memos',1000),error=>error.status===429&&error.code==='MEMOS_RATE_LIMIT');
  limitNoteWrites(owner,'notes',1000);limitNoteWrites(owner,'memos',61000);
});

test('unknown anonymous memo commit is inspected by receipt and never automatically committed twice',async t=>{
  const app=await setup(t),gid=randomUUID(),body=group();let batches=0;
  const db={prepare:sql=>app.db.prepare(sql),batch:async statements=>{
    batches++;await app.db.batch(statements);throw new Error('synthetic lost committed response');
  }};
  const lost=await app.request('/memos/groups/'+gid,{method:'PUT',body,settings:{...app.env,DB:db}});
  assert.equal(lost.status,500);assert.equal(batches,1);
  assert.equal((await app.request('/memos/operations/'+body.save_id)).data.found,true);
  assert.equal((await app.request('/memos/groups/'+gid,{method:'PUT',body})).data.version,1);
  assert.equal(batches,1);
});

test('public subject does not inherit generic todo owner and endpoint throttling stops excess attempts',async t=>{
  const app=await setup(t),other=randomUUID(),date='2026-10-25',time=new Date().toISOString();
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,created_at FROM matrix_users LIMIT 1')
    .bind(other,'synthetic-other-'+other).run();
  await app.db.prepare('INSERT INTO matrix_daily_notes(user_id,date,text,version,change_seq,created_at,updated_at) VALUES(?,?,?,1,1,?,?)')
    .bind(other,date,'OTHER-SUBJECT-PRIVATE-CANARY',time,time).run();
  const settings={...app.env,PUBLIC_BUSINESS_USER_ID:other};
  assert.equal((await app.request('/daily-notes?date='+date,{settings})).data.text,'');
  const gid=randomUUID();
  for(let i=0;i<60;i++)assert.equal((await app.request('/memos/groups/'+gid,{method:'PUT',body:{unexpected:true}})).status,400);
  const blocked=await app.request('/memos/groups/'+gid,{method:'PUT',body:group()});
  assert.equal(blocked.status,429);assert.equal(blocked.error.code,'MEMOS_RATE_LIMIT');
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_memo_groups').first()).n,0);
});
