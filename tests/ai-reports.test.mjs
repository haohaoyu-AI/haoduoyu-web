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
  assert.deepEqual((await call('','GET',null,auth)).data.items,[created.data]);
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
