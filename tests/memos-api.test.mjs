import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {digest,csrfFor} from '../src/security.mjs';

async function setup(t) {
  const app=await fixture(t),session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,MEMOS_OWNER_ID:owner,DAILY_NOTES_OWNER_ID:owner,
    PUBLIC_BUSINESS_MODE:'0',PUBLIC_BUSINESS_USER_ID:owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'[]'};
  async function memo(path='',{method='GET',body,auth=false,headers={},settings=env}={}) {
    const h=new Headers(headers);
    if(auth){h.set('Cookie',session.cookie);h.set('X-CSRF-Token',session.csrfToken);}
    if(body!==undefined)h.set('Content-Type','application/json');
    if(!['GET','HEAD'].includes(method)&&!h.has('Origin'))h.set('Origin',app.origin);
    const response=await worker.fetch(new Request(app.origin+'/api/v1/memos'+path,{method,headers:h,
      body:body===undefined?undefined:JSON.stringify(body)}),settings);
    return {status:response.status,...await response.json()};
  }
  return {...app,owner,session,env,memo};
}
const group=(title='合成分组',version=0)=>({title,position:0,version,save_id:randomUUID()});
const note=(group_id,body='合成正文',version=0)=>({group_id,title:'合成笔记',body,position:0,version,save_id:randomUUID()});
const marker=(version)=>({version,save_id:randomUUID()});
async function pair(app) {
  const gid=randomUUID(),nid=randomUUID();
  assert.equal((await app.memo('/groups/'+gid,{method:'PUT',auth:true,body:group()})).status,200);
  assert.equal((await app.memo('/notes/'+nid,{method:'PUT',auth:true,body:note(gid)})).status,200);
  return {gid,nid};
}
async function otherUser(app) {
  const id=randomUUID(),token=randomBytes(32).toString('hex');
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,created_at FROM matrix_users LIMIT 1')
    .bind(id,'synthetic-other-'+id).run();
  await app.db.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .bind(digest(token),id,new Date(Date.now()+86400000).toISOString()).run();
  return {id,token,headers:{Cookie:'matrix_session='+token,'X-CSRF-Token':csrfFor(token)}};
}

test('memos public read is fixed-owner; anonymous, foreign sessions and API keys cannot mutate',async t=>{
  const app=await setup(t),{gid,nid}=await pair(app),body=note(gid,'<img src=x onerror=alert(1)>\n纯文字',1);
  const initial=await app.memo();assert.equal(initial.data.can_edit,false);
  assert.equal(initial.data.groups[0].active_note_count,1);assert.equal(initial.data.notes[0].body,undefined);
  assert.ok(!JSON.stringify(initial).includes(app.owner));
  assert.equal((await app.memo('/notes/'+nid,{method:'PUT',body,headers:{'X-Public-Business':'1'}})).status,401);
  assert.equal((await app.memo('/notes/'+nid,{method:'DELETE',body:marker(1)})).status,401);
  assert.equal((await app.memo('/notes/'+nid+'/restore',{method:'POST',body:marker(1)})).status,401);
  const changed=await app.memo('/notes/'+nid,{method:'PUT',body,auth:true});assert.equal(changed.status,200);
  assert.equal((await app.memo('/notes/'+nid)).data.body,body.body);
  assert.equal((await app.memo('/notes/'+nid)).data.can_edit,false);
  assert.equal((await app.memo('/notes/'+nid,{method:'PUT',body:note(gid,'evil',2),auth:true,headers:{Origin:'https://foreign.invalid'}})).status,403);
  assert.equal((await app.memo('/notes/'+nid,{method:'PUT',body:note(gid,'evil',2),
    headers:{Cookie:app.session.cookie,'X-CSRF-Token':'wrong'}})).status,403);
  const other=await otherUser(app);
  assert.equal((await app.memo('/notes/'+nid,{method:'PUT',body:note(gid,'foreign',2),headers:other.headers})).status,403);
  assert.equal((await app.memo('',{headers:other.headers})).data.can_edit,false);
  assert.equal((await app.memo('?user_id='+other.id)).status,400);
  assert.equal((await app.memo('/notes/'+nid+'?user_id='+other.id)).status,400);
  assert.equal((await app.memo('/operations/'+body.save_id,{headers:other.headers})).status,403);
  assert.equal((await app.memo('/operations/'+body.save_id)).status,401);
  const issued=await app.request('/api/v1/api-keys',{method:'POST',session:app.session,
    body:{name:'synthetic-memo-key',account_ids:['toutiao-haoduoyu'],permissions:['read','write']}});
  assert.equal((await app.memo('/notes/'+nid,{method:'PUT',body:note(gid,'key',2),headers:{Authorization:'Bearer '+issued.data.token}})).status,403);
  assert.equal((await app.memo('',{settings:{...app.env,MEMOS_OWNER_ID:undefined}})).status,503);
  assert.equal((await app.memo('',{settings:{...app.env,MEMOS_OWNER_ID:randomUUID()}})).status,503);
});

test('memos CAS, metadata receipts and exact retries preserve subsequent versions',async t=>{
  const app=await setup(t),gid=randomUUID(),nid=randomUUID(),create=group();
  assert.equal((await app.memo('/groups/'+gid,{method:'PUT',auth:true,body:create})).status,200);
  const first=note(gid,'receipt-body-canary');
  const saved=await app.memo('/notes/'+nid,{method:'PUT',auth:true,body:first});assert.equal(saved.data.version,1);
  const replay=await app.memo('/notes/'+nid,{method:'PUT',auth:true,body:first});assert.equal(replay.data.version,1);
  assert.equal((await app.memo('/notes/'+nid,{method:'PUT',auth:true,body:{...first,body:'different'}})).status,409);
  const receipt=await app.memo('/operations/'+first.save_id,{auth:true});
  assert.equal(receipt.data.found,true);assert.equal(receipt.data.id,nid);assert.equal(receipt.data.kind,'notes');
  assert.equal(receipt.data.version,1);assert.ok(!JSON.stringify(receipt).includes(first.body));
  assert.equal((await app.memo('/operations/'+randomUUID(),{auth:true})).data.found,false);
  const second=await app.memo('/notes/'+nid,{method:'PUT',auth:true,body:note(gid,'newer',1)});
  assert.equal(second.data.version,2);assert.ok(second.data.change_seq>saved.data.change_seq);
  assert.equal((await app.memo('/notes/'+nid,{method:'PUT',auth:true,body:first})).status,409);
  assert.equal((await app.memo('/notes/'+nid,{method:'PUT',auth:true,body:note(gid,'stale tab',1)})).status,409);
  assert.equal((await app.memo('/notes/'+nid)).data.body,'newer');
  assert.equal((await app.memo('/operations/'+first.save_id,{auth:true})).data.version,1);
  const stored=(await app.db.prepare("SELECT response_json FROM matrix_idempotency WHERE key LIKE 'memo:%'").all()).results;
  assert.ok(!JSON.stringify(stored).includes('receipt-body-canary'));
});

test('soft delete and group recovery preserve independent note tombstones and require current confirmation',async t=>{
  const app=await setup(t),{gid,nid}=await pair(app),deletedNote=randomUUID();
  await app.memo('/notes/'+deletedNote,{method:'PUT',auth:true,body:note(gid,'previously deleted')});
  assert.equal((await app.memo('/notes/'+deletedNote,{method:'DELETE',auth:true,body:marker(1)})).data.version,2);
  const deletion={...marker(1),confirm_title:'合成分组',confirm_note_count:0};
  assert.equal((await app.memo('/groups/'+gid,{method:'DELETE',auth:true,body:deletion})).error.code,'MEMO_DELETE_CONFIRMATION');
  assert.equal((await app.memo('/groups/'+gid,{method:'DELETE',auth:true,body:{...deletion,confirm_title:'wrong',confirm_note_count:1}})).status,409);
  const removed=await app.memo('/groups/'+gid,{method:'DELETE',auth:true,body:{...deletion,confirm_note_count:1}});
  assert.equal(removed.data.version,2);assert.ok(removed.data.deleted_at);
  assert.deepEqual((await app.memo()).data,{groups:[],notes:[],can_edit:false});
  assert.equal((await app.memo('/notes/'+nid)).status,404);
  const owner=await app.memo('',{auth:true});assert.equal(owner.data.groups.length,1);assert.equal(owner.data.notes.length,2);
  assert.equal((await app.memo('/notes/'+nid,{auth:true})).data.body,'合成正文');
  assert.equal((await app.memo('/notes/'+nid,{method:'PUT',auth:true,body:note(gid,'blocked',1)})).status,409);
  assert.equal((await app.memo('/notes/'+deletedNote+'/restore',{method:'POST',auth:true,body:marker(2)})).status,409);
  assert.equal((await app.memo('/groups/'+gid+'/restore',{method:'POST',auth:true,body:marker(2)})).data.version,3);
  assert.deepEqual((await app.memo()).data.notes.map(row=>row.id),[nid]);
  assert.equal((await app.memo('/notes/'+deletedNote)).status,404);
  assert.equal((await app.memo('/notes/'+deletedNote+'/restore',{method:'POST',auth:true,body:marker(2)})).data.version,3);
  assert.equal((await app.memo('/notes/'+deletedNote)).data.body,'previously deleted');
  assert.equal((await app.memo('/notes/'+nid)).data.version,1);
});

test('concurrent saves have one CAS winner; creation racing group deletion cannot orphan a note',async t=>{
  const app=await setup(t),{gid,nid}=await pair(app);
  const results=await Promise.all(['A','B'].map(body=>app.memo('/notes/'+nid,{method:'PUT',auth:true,body:note(gid,body,1)})));
  assert.deepEqual(results.map(row=>row.status).sort(),[200,409]);
  assert.equal((await app.memo('/notes/'+nid)).data.version,2);
  const createId=randomUUID();
  const race=await Promise.all([
    app.memo('/groups/'+gid,{method:'DELETE',auth:true,body:{...marker(1),confirm_title:'合成分组',confirm_note_count:1}}),
    app.memo('/notes/'+createId,{method:'PUT',auth:true,body:note(gid,'racing new note')})
  ]);
  assert.deepEqual(race.map(row=>row.status).sort(),[200,409]);
  const current=(await app.memo('',{auth:true})).data;
  if(race[0].status===200)assert.equal(current.notes.some(row=>row.id===createId),false);
  else {assert.equal(current.groups[0].deleted_at,null);assert.equal(current.groups[0].active_note_count,2);}
  assert.deepEqual((await app.db.prepare('PRAGMA foreign_key_check').all()).results,[]);
});

test('unknown committed result is never retried by mutation transport and receipt resolves it',async t=>{
  const app=await setup(t),{gid,nid}=await pair(app),body=note(gid,'committed but response lost',1);
  let commits=0;
  const uncertainDb=new Proxy(app.db,{get(target,key){
    if(key==='batch')return async statements=>{commits++;await target.batch(statements);throw Error('synthetic connection lost after commit');};
    const value=target[key];return typeof value==='function'?value.bind(target):value;
  }});
  const result=await app.memo('/notes/'+nid,{method:'PUT',auth:true,body,settings:{...app.env,DB:uncertainDb}});
  assert.equal(result.status,500);assert.equal(commits,1);
  const receipt=await app.memo('/operations/'+body.save_id,{auth:true});assert.equal(receipt.data.found,true);assert.equal(receipt.data.version,2);
  const current=await app.memo('/notes/'+nid,{auth:true});assert.equal(current.data.body,body.body);assert.equal(current.data.version,2);
});

test('commit guard rechecks real owner session before writing',async t=>{
  const app=await setup(t),{gid,nid}=await pair(app),body=note(gid,'must not write',1);
  let commits=0;
  const revokedDb=new Proxy(app.db,{get(target,key){
    if(key==='batch')return async statements=>{
      commits++;await target.prepare('DELETE FROM matrix_sessions WHERE user_id=?').bind(app.owner).run();
      return target.batch(statements);
    };
    const value=target[key];return typeof value==='function'?value.bind(target):value;
  }});
  assert.equal((await app.memo('/notes/'+nid,{method:'PUT',auth:true,body,settings:{...app.env,DB:revokedDb}})).status,401);
  assert.equal(commits,1);assert.equal((await app.memo('/notes/'+nid)).data.body,'合成正文');
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_idempotency WHERE key=?').bind('memo:'+body.save_id).first()).n,0);
});

test('memos validate text, depth, sorting, identity and ownership without changing todos or daily notes',async t=>{
  const app=await setup(t),{gid,nid}=await pair(app);
  for(const body of [group(''),group('x'.repeat(121)),{...group(),parent_id:gid},{...group(),position:-1},
    {...group(),position:1000001},{...group(),position:0.5},group('bad\nname'),group('bad\ud800')])
    assert.equal((await app.memo('/groups/'+randomUUID(),{method:'PUT',auth:true,body})).status,400);
  assert.equal((await app.memo('/groups/not-an-id',{method:'PUT',auth:true,body:group()})).status,400);
  for(const body of [note(gid,'bad\0'),note(gid,'bad\ud800'),{...note(gid),depth:3}])
    assert.equal((await app.memo('/notes/'+randomUUID(),{method:'PUT',auth:true,body})).status,400);
  assert.equal((await app.memo('/notes/'+randomUUID(),{method:'PUT',auth:true,body:note(gid,'x'.repeat(65537))})).status,413);
  assert.equal((await app.memo('/notes/'+randomUUID(),{method:'PUT',auth:true,body:note(randomUUID())})).status,409);
  const other=await otherUser(app),otherGroup=randomUUID(),time=new Date().toISOString();
  await app.db.prepare('INSERT INTO matrix_memo_groups(user_id,id,title,position,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,0,1,1,?,?,NULL)')
    .bind(other.id,otherGroup,'OTHER-OWNER-CANARY',time,time).run();
  assert.equal((await app.memo('/notes/'+randomUUID(),{method:'PUT',auth:true,body:note(otherGroup)})).status,409);
  assert.ok(!JSON.stringify(await app.memo()).includes('OTHER-OWNER-CANARY'));
  assert.equal((await app.memo('/notes/'+nid,{method:'PUT',auth:true,body:note(otherGroup,'move',1)})).status,400);
  const todo=await worker.fetch(new Request(app.origin+'/api/v1/todos',{method:'POST',headers:{Origin:app.origin,
    'Content-Type':'application/json','X-Public-Business':'1'},body:JSON.stringify({id:randomUUID(),date:'2026-10-25',text:'原待办匿名写'})}),{...app.env,PUBLIC_BUSINESS_MODE:'1'});
  assert.equal(todo.status,201);
  const daily=await worker.fetch(new Request(app.origin+'/api/v1/daily-notes?date=2026-10-25'),app.env);
  assert.equal(daily.status,200);assert.equal((await daily.json()).data.text,'');
});

test('limits include recoverable tombstones and unsafe high-water marks never round',async t=>{
  const app=await setup(t),{gid}=await pair(app),time=new Date().toISOString();
  await app.db.batch(Array.from({length:31},()=>app.db.prepare(
    'INSERT INTO matrix_memo_groups(user_id,id,title,position,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,0,1,1,?,?,?)')
    .bind(app.owner,randomUUID(),'deleted synthetic',time,time,time)));
  assert.equal((await app.memo('/groups/'+randomUUID(),{method:'PUT',auth:true,body:group()})).error.code,'MEMOS_LIMIT');
  await app.db.batch(Array.from({length:199},()=>app.db.prepare(
    'INSERT INTO matrix_memo_notes(user_id,id,group_id,title,body,position,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,0,1,1,?,?,?)')
    .bind(app.owner,randomUUID(),gid,'deleted synthetic','',time,time,time)));
  assert.equal((await app.memo('/notes/'+randomUUID(),{method:'PUT',auth:true,body:note(gid)})).error.code,'MEMOS_LIMIT');
  await app.db.prepare('UPDATE matrix_control SET revision=? WHERE id=1').bind(Number.MAX_SAFE_INTEGER).run();
  const body=group('keep draft',1),result=await app.memo('/groups/'+gid,{method:'PUT',auth:true,body});
  assert.equal(result.status,503);assert.equal(result.error.code,'MEMOS_REVISION');
  assert.equal((await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision,Number.MAX_SAFE_INTEGER);
});
