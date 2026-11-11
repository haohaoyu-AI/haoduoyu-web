import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {csrfFor as csrf} from '../src/security.mjs';
function fixture(t,{bootstrap=true}={}) {
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');t.after(()=>sql.close());
 const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
 for(const {tag} of journal.entries)for(const stmt of readFileSync(new URL('../drizzle/'+tag+'.sql',import.meta.url),'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))sql.exec(stmt);
 const db={prepare(text){let values=[];return {bind(...v){values=v;return this},async first(){return sql.prepare(text).get(...values)||null},async all(){return {results:sql.prepare(text).all(...values)}},async run(){const r=sql.prepare(text).run(...values);return {meta:{changes:Number(r.changes)}}}}},async batch(stmts){sql.exec('BEGIN');try{for(const stmt of stmts)await stmt.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};
 const owner=randomUUID(), token=randomBytes(32).toString('hex');
 if(bootstrap){sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'owner','hash',new Date().toISOString());sql.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(token),owner,new Date(Date.now()+60000).toISOString());sql.exec('INSERT INTO matrix_control(id,initialized) VALUES(1,1)');}
 return {db,owner,token,origin:'http://localhost',login:async()=>({cookie:'matrix_session='+token,csrfToken:csrf(token)})};
}
import {handleAiReports} from '../src/ai-reports.mjs';
import {limitNoteWrites} from '../src/public-note-access.mjs';
import {digest,csrfFor,stable} from '../src/security.mjs';
import {exportBackup,restoreIntoEmptyDatabase} from '../src/backup.mjs';

test('AI reports require the owner session, persist truthful input, and replay without duplication',async t=>{
  const app=await fixture(t),session=await app.login(),owner=app.owner;
  const env={DAILY_NOTES_OWNER_ID:owner};
  const id=randomUUID(),body={author:'工具甲',content:'完成了资料整理\n等待复核'};
  async function call(path,method='GET',data,headers={}) {
    const h=new Headers(headers);if(data)h.set('Content-Type','application/json');
    if(method!=='GET'&&!h.has('Origin'))h.set('Origin',app.origin);
    const req=new Request(app.origin+'/api/v1/ai-reports'+path,{method,headers:h,body:data?JSON.stringify(data):undefined});
    try {const response=await handleAiReports(app.db,req,new URL(req.url).pathname.slice('/api/v1'.length),env,app.origin);return {status:response.status,...await response.json()};}
    catch(e){if(!e.status)throw e;return {status:e.status,code:e.code};}
  }
  const auth={Cookie:session.cookie,'X-CSRF-Token':session.csrfToken};
  assert.equal((await call('')).status,401);
  assert.equal((await call('/'+id,'PUT',body,{Cookie:session.cookie,'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await call('/'+id,'PUT',body,{...auth,Origin:'https://wrong.invalid'})).status,403);
  assert.equal((await call('/'+id,'PUT',{author:'',content:'x'},auth)).status,400);
  const created=await call('/'+id,'PUT',body,auth);
  assert.equal(created.status,201);assert.deepEqual({...created.data,created_at:''},{id,...body,created_at:''});
  assert.ok(Number.isFinite(Date.parse(created.data.created_at)));
  assert.deepEqual((await call('/'+id,'PUT',body,auth)).data,created.data);
  assert.equal((await call('/'+id,'PUT',{...body,content:'different'},auth)).status,409);
  assert.deepEqual((await call('','GET',null,auth)).data.items,[{...created.data,content_hash:digest(JSON.stringify(stable(created.data)))}]);
  const other=randomUUID(),token=randomBytes(32).toString('hex');
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,created_at FROM matrix_users WHERE id=?').bind(other,'other',owner).run();
  await app.db.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(digest(token),other,new Date(Date.now()+60000).toISOString()).run();
  assert.equal((await call('','GET',null,{Cookie:'matrix_session='+token})).status,403);
  assert.equal((await call('/'+randomUUID(),'PUT',body,{Cookie:'matrix_session='+token,'X-CSRF-Token':csrfFor(token)})).status,403);
  const key='hdy_'+randomBytes(32).toString('hex');
  await app.db.prepare('INSERT INTO matrix_api_keys(id,name,token_hash,account_ids_json,permissions_json,created_at) VALUES(?,?,?,?,?,?)').bind(randomUUID(),'test',digest(key),'["account"]','["read","write"]',new Date().toISOString()).run();
  assert.equal((await call('','GET',null,{Authorization:'Bearer '+key})).status,403);
  assert.equal((await call('/'+randomUUID(),'PUT',body,{Authorization:'Bearer '+key})).status,403);
  for(let i=0;i<101;i++)await app.db.prepare('INSERT INTO matrix_ai_reports(user_id,id,author,content,created_at) VALUES(?,?,?,?,?)').bind(owner,randomUUID(),'工具','真实工作',created.data.created_at).run();
  const firstPage=await call('?offset=0','GET',null,auth),secondPage=await call('?offset=100','GET',null,auth);
  assert.equal(firstPage.data.items.length,100);assert.equal(firstPage.data.has_more,true);
  assert.equal(secondPage.data.items.length,2);assert.equal(secondPage.data.has_more,false);
  assert.equal((await call('?offset=-1','GET',null,auth)).status,400);
  const backup=await exportBackup(app.db,{todoUserId:owner});
  assert.equal(backup.data.format,'haoduoyu-matrix-d1-v14');assert.equal(backup.data.tables.ai_reports.length,102);
  const bad=structuredClone(backup);bad.data.tables.ai_reports[0].author='';bad.sha256=digest(JSON.stringify(stable(bad.data)));
  const badTarget=await fixture(t,{bootstrap:false});
  await assert.rejects(restoreIntoEmptyDatabase(badTarget.db,bad,{allowEmptyRestore:true}),e=>e.code==='INVALID_BACKUP');
  assert.equal((await badTarget.db.prepare('SELECT count(*) AS n FROM matrix_users').first()).n,0);
  const target=await fixture(t,{bootstrap:false});
  await restoreIntoEmptyDatabase(target.db,backup,{allowEmptyRestore:true});
  const stored=await target.db.prepare('SELECT author,content,created_at FROM matrix_ai_reports WHERE user_id=? AND id=?').bind(owner,id).first();
  assert.deepEqual({...stored},{author:body.author,content:body.content,created_at:created.data.created_at});
  const old=structuredClone(backup);old.data.format='haoduoyu-matrix-d1-v13';delete old.data.tables.ai_reports;old.sha256=digest(JSON.stringify(stable(old.data)));
  const oldTarget=await fixture(t,{bootstrap:false});
  await restoreIntoEmptyDatabase(oldTarget.db,old,{allowEmptyRestore:true});
  assert.equal((await oldTarget.db.prepare('SELECT count(*) AS n FROM matrix_ai_reports').first()).n,0);
});

test('public AI reports use the fixed owner, reject supplied invalid credentials, and retain session CSRF',async t=>{
  const app=fixture(t),session=await app.login(),env={DAILY_NOTES_OWNER_ID:app.owner,PUBLIC_BUSINESS_MODE:'1'};
  const id=randomUUID(),body={author:'<img src=x onerror=alert(1)>',content:'<script>alert(1)</script> & "quoted"'};
  async function call(path='',method='GET',data,headers={},settings=env) {
    const h=new Headers(headers);if(data!==undefined)h.set('Content-Type','application/json');
    const req=new Request(app.origin+'/api/v1/ai-reports'+path,{method,headers:h,body:data===undefined?undefined:JSON.stringify(data)});
    try {const response=await handleAiReports(app.db,req,new URL(req.url).pathname.slice('/api/v1'.length),settings,app.origin);return {status:response.status,...await response.json()};}
    catch(e){if(!e.status)throw e;return {status:e.status,code:e.code};}
  }
  const publicHeaders={Origin:app.origin,'X-Public-Business':'1'};
  assert.equal((await call()).status,200);
  for(const headers of [{},{Origin:app.origin},{...publicHeaders,Origin:'https://other.invalid'},{...publicHeaders,Origin:'null'},{...publicHeaders,'X-Public-Business':''}])
    assert.equal((await call('/'+id,'PUT',body,headers)).status,403);
  for(const headers of [{Authorization:'Bearer invalid'},{Authorization:''},{Cookie:'matrix_session=invalid'},
    {Cookie:'matrix_session='+randomBytes(32).toString('hex')}]) {
    assert.equal((await call('','GET',undefined,headers)).status,401);
    assert.equal((await call('/'+id,'PUT',body,{...publicHeaders,...headers})).status,401);
  }
  const foreign=randomUUID(),foreignToken=randomBytes(32).toString('hex'),key='hdy_'+randomBytes(32).toString('hex');
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,created_at FROM matrix_users WHERE id=?').bind(foreign,'foreign',app.owner).run();
  await app.db.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(digest(foreignToken),foreign,new Date(Date.now()+60000).toISOString()).run();
  await app.db.prepare('INSERT INTO matrix_api_keys(id,name,token_hash,account_ids_json,permissions_json,created_at) VALUES(?,?,?,?,?,?)').bind(randomUUID(),'key',digest(key),'[]','["read","write"]',new Date().toISOString()).run();
  for(const headers of [{Cookie:'matrix_session='+foreignToken,'X-CSRF-Token':csrfFor(foreignToken)},{Authorization:'Bearer '+key}]) {
    assert.equal((await call('','GET',undefined,headers)).status,403);
    assert.equal((await call('/'+id,'PUT',body,{...publicHeaders,...headers})).status,403);
  }
  await app.db.prepare('INSERT INTO matrix_ai_reports(user_id,id,author,content,created_at) VALUES(?,?,?,?,?)').bind(foreign,randomUUID(),'foreign','PRIVATE-CANARY',new Date().toISOString()).run();
  assert.equal((await call('/'+id,'PUT',body,{...publicHeaders,Cookie:session.cookie,'X-CSRF-Token':'wrong'})).status,403);
  const created=await call('/'+id,'PUT',body,publicHeaders);
  assert.equal(created.status,201);assert.equal(created.data.author,body.author);assert.equal(created.data.content,body.content);
  assert.deepEqual((await call('/'+id,'PUT',body,publicHeaders)).data,created.data);
  assert.equal((await call('/'+id,'PUT',{...body,content:'changed'},publicHeaders)).status,409);
  assert.deepEqual((await call()).data.items,[{...created.data,content_hash:digest(JSON.stringify(stable(created.data)))}]);
  assert.equal((await call('','GET',undefined,{}, {...env,PUBLIC_BUSINESS_MODE:'0'})).status,401);
  assert.equal((await call('/'+randomUUID(),'PUT',body,publicHeaders,{...env,PUBLIC_BUSINESS_MODE:'0'})).status,401);
  assert.equal((await call('','GET',undefined,{Cookie:session.cookie},{...env,PUBLIC_BUSINESS_MODE:'0'})).status,200);
  assert.equal((await call('/'+randomUUID(),'PUT',body,{Origin:app.origin,Cookie:session.cookie,'X-CSRF-Token':session.csrfToken},{...env,PUBLIC_BUSINESS_MODE:'0'})).status,201);
  assert.equal((await call('/'+randomUUID(),'PUT',{author:'ok',content:'x'.repeat(16385)},publicHeaders)).status,400);
  assert.equal((await call('/'+randomUUID(),'PUT',{author:'ok',content:'bad\u0000text'},publicHeaders)).status,400);
});

test('AI report write limit is module-specific and local to this process',()=>{
  const owner=randomUUID();
  for(let i=0;i<60;i++)limitNoteWrites(owner,'ai-reports',1000);
  assert.throws(()=>limitNoteWrites(owner,'ai-reports',1000),e=>e.status===429&&e.code==='AI_REPORTS_RATE_LIMIT');
  limitNoteWrites(owner,'notes',1000);limitNoteWrites(owner,'memos',1000);limitNoteWrites(owner,'ai-reports',61000);
});

test('public deletion checks version and identity, preserves other rows, and safely replays',async t=>{
  const app=fixture(t),session=await app.login(),env={DAILY_NOTES_OWNER_ID:app.owner,PUBLIC_BUSINESS_MODE:'1'};
  const publicHeaders={Origin:app.origin,'X-Public-Business':'1'},id=randomUUID(),other=randomUUID();
  async function call(path='',method='GET',data,headers={}) {
    const h=new Headers(headers);if(data!==undefined)h.set('Content-Type','application/json');
    const request=new Request(app.origin+'/api/v1/ai-reports'+path,{method,headers:h,body:data===undefined?undefined:JSON.stringify(data)});
    try {const response=await handleAiReports(app.db,request,'/ai-reports'+path,env,app.origin);return {status:response.status,...await response.json()};}
    catch(error) {if(!error.status)throw error;return {status:error.status,code:error.code};}
  }
  const body={author:'A',content:'PRIVATE REPORT BODY'},otherBody={author:'B',content:'untouched'};
  const created=await call('/'+id,'PUT',body,publicHeaders);
  await call('/'+other,'PUT',otherBody,publicHeaders);
  const rows=(await call()).data.items,hash=rows.find(row=>row.id===id).content_hash;
  assert.equal(hash,digest(JSON.stringify(stable(created.data))));
  const save_id=randomUUID(),payload={expected_hash:hash,save_id};
  for(const headers of [{},{Origin:app.origin},{...publicHeaders,Origin:'https://other.invalid'},
    {...publicHeaders,Authorization:'Bearer invalid'}, {...publicHeaders,Cookie:session.cookie,'X-CSRF-Token':'wrong'}])
    assert.notEqual((await call('/'+id,'DELETE',payload,headers)).status,200);
  assert.equal((await call('/'+id,'DELETE',{...payload,expected_hash:'0'.repeat(64)},publicHeaders)).code,'VERSION_CONFLICT');
  assert.equal((await call('/'+id,'DELETE',{...payload,save_id:'invalid'},publicHeaders)).status,400);
  const deleted=await call('/'+id,'DELETE',payload,publicHeaders);
  assert.deepEqual(deleted,{status:200,data:{deleted:true,id}});
  assert.deepEqual(await call('/'+id,'DELETE',payload,publicHeaders),deleted);
  assert.equal((await call('/'+other,'DELETE',{...payload,expected_hash:rows.find(row=>row.id===other).content_hash},publicHeaders)).code,'IDEMPOTENCY_CONFLICT');
  assert.equal((await call('/'+id,'DELETE',{...payload,save_id:randomUUID()},publicHeaders)).status,404);
  assert.equal((await call('/'+id,'PUT',body,publicHeaders)).code,'AI_REPORT_DELETED');
  assert.equal((await call()).data.items.length,1);
  assert.equal((await call()).data.items[0].content,otherBody.content);
  const stored=await app.db.prepare('SELECT request_hash,response_json FROM matrix_idempotency WHERE key IN (?,?)').bind('ai-report-delete:'+save_id,'ai-report-deleted:'+id).all();
  assert.equal(stored.results.length,2);
  assert.ok(!JSON.stringify(stored.results).includes(body.content));
  const backup=await exportBackup(app.db,{todoUserId:app.owner}),target=fixture(t,{bootstrap:false});
  await restoreIntoEmptyDatabase(target.db,backup,{allowEmptyRestore:true});
  const restoredRequest=new Request(app.origin+'/api/v1/ai-reports/'+id,{method:'PUT',headers:{...publicHeaders,'Content-Type':'application/json'},body:JSON.stringify(body)});
  await assert.rejects(handleAiReports(target.db,restoredRequest,'/ai-reports/'+id,env,app.origin),error=>error.code==='AI_REPORT_DELETED');
  // An out-of-band recreation must not turn a retry into a false success or delete it.
  await app.db.prepare('INSERT INTO matrix_ai_reports(user_id,id,author,content,created_at) VALUES(?,?,?,?,?)').bind(app.owner,id,'new','new body',new Date().toISOString()).run();
  assert.equal((await call('/'+id,'DELETE',payload,publicHeaders)).code,'VERSION_CONFLICT');
  assert.equal((await app.db.prepare('SELECT content FROM matrix_ai_reports WHERE user_id=? AND id=?').bind(app.owner,id).first()).content,'new body');
});

test('receipt failure rolls back the report deletion and tombstone',async t=>{
  const app=fixture(t),env={DAILY_NOTES_OWNER_ID:app.owner,PUBLIC_BUSINESS_MODE:'1'},id=randomUUID(),headers={Origin:app.origin,'X-Public-Business':'1','Content-Type':'application/json'};
  const request=(method,body)=>new Request(app.origin+'/api/v1/ai-reports/'+id,{method,headers,body:JSON.stringify(body)});
  const created=await handleAiReports(app.db,request('PUT',{author:'A',content:'kept'}),'/ai-reports/'+id,env,app.origin);
  const row=(await created.json()).data,hash=digest(JSON.stringify(stable(row))),batch=app.db.batch;
  app.db.batch=statements=>batch([...statements.slice(0,-1),{run:async()=>{throw new Error('synthetic receipt failure');}}]);
  await assert.rejects(handleAiReports(app.db,request('DELETE',{expected_hash:hash,save_id:randomUUID()}),'/ai-reports/'+id,env,app.origin),/synthetic receipt failure/);
  assert.equal((await app.db.prepare('SELECT content FROM matrix_ai_reports WHERE user_id=? AND id=?').bind(app.owner,id).first()).content,'kept');
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_idempotency').first()).n,0);
});

test('deletion retries an interleaved revision and never removes changed content',async t=>{
  const app=fixture(t),env={DAILY_NOTES_OWNER_ID:app.owner,PUBLIC_BUSINESS_MODE:'1'},id=randomUUID(),headers={Origin:app.origin,'X-Public-Business':'1','Content-Type':'application/json'};
  async function call(method,body) {
    const request=new Request(app.origin+'/api/v1/ai-reports/'+id,{method,headers,body:JSON.stringify(body)});
    try {const response=await handleAiReports(app.db,request,'/ai-reports/'+id,env,app.origin);return {status:response.status,...await response.json()};}
    catch(error) {if(!error.status)throw error;return {status:error.status,code:error.code};}
  }
  const created=await call('PUT',{author:'A',content:'old'});
  const hash=digest(JSON.stringify(stable(created.data))),batch=app.db.batch;
  let interleaved=false;
  app.db.batch=async statements=>{
    if(!interleaved) {
      interleaved=true;
      await app.db.prepare('UPDATE matrix_ai_reports SET content=? WHERE user_id=? AND id=?').bind('new',app.owner,id).run();
      await app.db.prepare('UPDATE matrix_control SET revision=revision+1 WHERE id=1').run();
    }
    return batch(statements);
  };
  assert.equal((await call('DELETE',{expected_hash:hash,save_id:randomUUID()})).code,'VERSION_CONFLICT');
  assert.equal((await app.db.prepare('SELECT content FROM matrix_ai_reports WHERE user_id=? AND id=?').bind(app.owner,id).first()).content,'new');
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_idempotency').first()).n,0);
});


test('public report endpoint counts rejected payloads in its write limit',async t=>{
  const app=fixture(t),env={DAILY_NOTES_OWNER_ID:app.owner,PUBLIC_BUSINESS_MODE:'1'},id=randomUUID();
  async function attempt() {
    const request=new Request(app.origin+'/api/v1/ai-reports/'+id,{method:'PUT',headers:{Origin:app.origin,'X-Public-Business':'1','Content-Type':'application/json'},body:JSON.stringify({unexpected:true})});
    try {await handleAiReports(app.db,request,'/ai-reports/'+id,env,app.origin);assert.fail('unexpected success');} catch(error) {return error;}
  }
  for(let i=0;i<60;i++)assert.equal((await attempt()).status,400);
  const error=await attempt();assert.equal(error.status,429);assert.equal(error.code,'AI_REPORTS_RATE_LIMIT');
  assert.equal((await app.db.prepare('SELECT count(*) AS n FROM matrix_ai_reports').first()).n,0);
  const session=await app.login(),ownerRequest=new Request(app.origin+'/api/v1/ai-reports/'+id,{method:'PUT',headers:{Origin:app.origin,Cookie:session.cookie,'X-CSRF-Token':session.csrfToken,'Content-Type':'application/json'},body:JSON.stringify({author:'owner',content:'session remains available'})});
  assert.equal((await handleAiReports(app.db,ownerRequest,'/ai-reports/'+id,env,app.origin)).status,201);
});
