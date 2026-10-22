import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture,PASSWORD } from './harness.mjs';
import { storeFor,revision,commit,mutate,consistentRead } from '../src/storage.mjs';
import { restoreIntoEmptyDatabase } from '../src/backup.mjs';
import { authenticate } from '../src/security.mjs';

const ago=hours=>new Date(Date.now()-hours*3600000).toISOString();
async function setup(t,options={}) {
  const app=await fixture(t,options);
  try {app.session=await app.login();return app;}
  catch(error) {await app.mf.dispose();throw error;}
}
const articleBody=(overrides={})=>({account_id:'toutiao-haoduoyu',title:'隔离合成记录',url:'https://example.invalid/'+crypto.randomUUID(),published_at:ago(48),...overrides});
const post=(app,body,headers={})=>app.request('/api/v1/articles',{method:'POST',session:app.session,body,headers});
const n=async(db,table)=>(await db.prepare(`SELECT count(*) AS n FROM matrix_${table}`).first()).n;

test('bootstrap requires its separate secret, is atomic and cannot initialize twice',async t=>{
  const app=await fixture(t,{bootstrap:false});
  const body={username:'synthetic-admin',password:PASSWORD};
  assert.equal((await app.request('/api/v1/bootstrap',{method:'POST',body})).status,401);
  const results=await Promise.all(Array.from({length:2},()=>app.request('/api/v1/bootstrap',{method:'POST',token:app.bootstrapSecret,body})));
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  assert.equal(await n(app.db,'users'),1);assert.equal(await n(app.db,'accounts'),3);
  assert.equal(await n(app.db,'articles'),0);assert.equal(await n(app.db,'daily_metrics'),0);
});

test('actual migration and every business mutation preserve legacy tables and rows',async t=>{
  const app=await setup(t);
  await app.db.prepare('CREATE TABLE articles(id TEXT PRIMARY KEY,marker TEXT)').run();
  await app.db.prepare("INSERT INTO articles VALUES('legacy','SYNTHETIC-LEGACY-UNCHANGED')").run();
  const created=await post(app,articleBody());assert.equal(created.status,201,created.text);
  const read=await app.request('/api/v1/articles',{session:app.session});assert.equal(read.data.length,1);
  assert.deepEqual((await app.db.prepare('SELECT * FROM articles').all()).results,[{id:'legacy',marker:'SYNTHETIC-LEGACY-UNCHANGED'}]);
});

test('20 concurrent retries return one committed response and exactly one audit/receipt',async t=>{
  const app=await setup(t),body=articleBody(),before=await n(app.db,'audit');
  const responses=await Promise.all(Array.from({length:20},()=>post(app,body,{'Idempotency-Key':'concurrent-retry'})));
  for(const result of responses) assert.equal(result.status,201,result.text);
  assert.equal(new Set(responses.map(r=>JSON.stringify(r.data))).size,1);
  assert.equal(await n(app.db,'articles'),1);assert.equal(await n(app.db,'idempotency'),1);assert.equal(await n(app.db,'audit'),before+1);
  assert.equal((await post(app,{...body,title:'different'},{'Idempotency-Key':'concurrent-retry'})).status,409);
});

test('global URL duplicate checks remain atomic across different account scopes',async t=>{
  const app=await setup(t),body=articleBody();
  const responses=await Promise.all([post(app,body,{'Idempotency-Key':'url-A'}),post(app,{...body,account_id:'zhihu-haoduoyu'},{'Idempotency-Key':'url-B'})]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
  assert.equal(responses.find(r=>r.status===409).json.error.code,'ARTICLE_EXISTS');
  assert.equal(await n(app.db,'articles'),1);assert.equal(await n(app.db,'idempotency'),1);
});

test('concurrent article updates preserve version CAS and atomic audit',async t=>{
  const app=await setup(t),created=await post(app,articleBody()),before=await n(app.db,'audit');
  const responses=await Promise.all(['A','B'].map(notes=>app.request('/api/v1/articles/'+created.data.id,{method:'PUT',session:app.session,body:{version:1,notes}})));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  assert.equal(responses.find(r=>r.status===409).json.error.code,'VERSION_CONFLICT');
  assert.equal(await n(app.db,'audit'),before+1);
  assert.equal((await app.request('/api/v1/articles/'+created.data.id,{session:app.session})).data.version,2);
});

test('audit failure rolls back article, receipt and revision without exposing SQL details',async t=>{
  const app=await setup(t),before=await revision(app.db);
  await app.db.prepare("CREATE TRIGGER matrix_test_audit_failure BEFORE INSERT ON matrix_audit WHEN NEW.action='POST /articles' BEGIN SELECT RAISE(ABORT,'synthetic private failure'); END").run();
  const failed=await post(app,articleBody(),{'Idempotency-Key':'audit-fault'});
  assert.equal(failed.status,500);assert.ok(!failed.text.includes('synthetic private failure'));
  assert.equal(await n(app.db,'articles'),0);assert.equal(await n(app.db,'idempotency'),0);assert.equal(await revision(app.db),before);
  await app.db.prepare('DROP TRIGGER matrix_test_audit_failure').run();
  assert.equal((await post(app,articleBody(),{'Idempotency-Key':'audit-fault'})).status,201);
});

test('password rotation final audit failure preserves old proof and sessions',async t=>{
  const app=await setup(t),before=await n(app.db,'sessions');
  await app.db.prepare("CREATE TRIGGER matrix_test_password_failure BEFORE INSERT ON matrix_audit WHEN NEW.action='auth.password_changed' BEGIN SELECT RAISE(ABORT,'synthetic fault'); END").run();
  const changed=await app.request('/api/v1/auth/password',{method:'PUT',session:app.session,body:{currentPassword:PASSWORD,newPassword:'New-synthetic-password-2026!'}});
  assert.equal(changed.status,500);assert.equal(await n(app.db,'sessions'),before);
  assert.equal((await app.request('/api/v1/auth/me',{session:app.session})).status,200);
  await app.db.prepare('DROP TRIGGER matrix_test_password_failure').run();
  await app.login();
});

test('revision and authorization guards reject stale plans or a revoked key at commit',async t=>{
  const app=await setup(t),expected=await revision(app.db),stale=storeFor(app.db);
  stale.queue("UPDATE accounts SET name='MUST-NOT-COMMIT' WHERE id='toutiao-haoduoyu'");
  await mutate(app.db,async store=>{store.queue("UPDATE accounts SET name='fresh' WHERE id='toutiao-haoduoyu'");return {};});
  await assert.rejects(commit(app.db,expected,stale),/matrix_revision_match/);
  const credential=await app.request('/api/v1/api-keys',{method:'POST',session:app.session,body:{name:'synthetic',account_ids:['toutiao-haoduoyu'],permissions:['read','write']}});
  const actor=await authenticate(storeFor(app.db),new Request('http://localhost',{headers:{Authorization:'Bearer '+credential.data.token}}),'write');
  const captured=await revision(app.db),store=storeFor(app.db);
  store.queue("UPDATE accounts SET name='MUST-NOT-COMMIT' WHERE id='toutiao-haoduoyu'");
  // Fault injection: even an out-of-band revocation without revision must fail the commit-time proof.
  await app.db.prepare('UPDATE matrix_api_keys SET revoked_at=? WHERE id=?').bind(ago(0),credential.data.id).run();
  await assert.rejects(commit(app.db,captured,store,actor),error=>error.status===401);
  assert.equal((await app.db.prepare("SELECT name FROM matrix_accounts WHERE id='toutiao-haoduoyu'").first()).name,'fresh');
});

test('consistentRead discards a torn attempt and recomputes after a committed mutation',async t=>{
  const app=await setup(t);let attempts=0;
  const result=await consistentRead(app.db,async store=>{
    attempts++;
    const left=await store.get("SELECT name FROM accounts WHERE id='toutiao-haoduoyu'");
    if(attempts===1) await mutate(app.db,async writer=>{writer.queue("UPDATE accounts SET name='new revision' WHERE id='toutiao-haoduoyu'");return {};});
    const right=await store.get("SELECT name FROM accounts WHERE id='toutiao-haoduoyu'");
    return [left.name,right.name];
  });
  assert.equal(attempts,2);assert.deepEqual(result,['new revision','new revision']);
});

test('spoofed forwarding headers cannot reset login limits; expired windows recover',async t=>{
  const app=await fixture(t);
  for(let i=0;i<11;i++) {
    const result=await app.request('/api/v1/auth/login',{method:'POST',headers:{'CF-Connecting-IP':'192.0.2.'+(i+1),'X-Forwarded-For':'198.51.100.'+(i+1)},body:{username:'synthetic-admin',password:'wrong-synthetic-password'}});
    assert.equal(result.status,i<10?401:429,result.text);
  }
  const denied=await app.request('/api/v1/auth/login',{method:'POST',body:{username:'synthetic-admin',password:PASSWORD}});
  assert.equal(denied.status,429);assert.equal(denied.headers.get('retry-after'),'900');
  await app.db.prepare('UPDATE matrix_login_attempts SET window_start=0').run();
  await app.login();
});

test('literal Chinese and wildcard search, inactive accounts and audit provenance retain contract',async t=>{
  const app=await setup(t),created=await post(app,articleBody({title:'中文100%_\\!字面',production_mode:'manual'}));
  await post(app,articleBody({title:'中文100ABX对照'}));
  for(const q of ['100%_\\','%','_','\\','!']) {
    const result=await app.request('/api/v1/articles?q='+encodeURIComponent(q),{session:app.session});
    assert.deepEqual(result.data.map(row=>row.id),[created.data.id]);
  }
  const credential=await app.request('/api/v1/api-keys',{method:'POST',session:app.session,body:{name:'合成 Grok',account_ids:['toutiao-haoduoyu'],permissions:['read','write']}});
  const changed=await app.request('/api/v1/articles/'+created.data.id,{method:'PUT',token:credential.data.token,body:{version:1,notes:'合成更新'}});
  assert.equal(changed.status,200,changed.text);
  const detail=await app.request('/api/v1/articles/'+created.data.id,{session:app.session});
  assert.equal(detail.data.recorded_by.label,'synthetic-admin');assert.equal(detail.data.last_modified_by.label,'合成 Grok');assert.equal(detail.data.production_mode,'manual');
  await app.request('/api/v1/accounts/toutiao-haoduoyu',{method:'PUT',session:app.session,body:{active:false}});
  assert.equal((await post(app,articleBody())).json.error.code,'ACCOUNT_INACTIVE');
  assert.equal((await app.request('/api/v1/articles/'+created.data.id,{session:app.session})).status,200);
});

test('persistent D1 data and independent login survive a complete Worker runtime restart',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'matrix-sites-persist-'));
  let first,next;
  try {
    first=await setup(undefined,{persist:directory});
    const created=await post(first,articleBody());assert.equal(created.status,201,created.text);
    await first.mf.dispose();first=undefined;
    next=await setup(undefined,{persist:directory,bootstrap:false});
    const detail=await next.request('/api/v1/articles/'+created.data.id,{session:next.session});
    assert.equal(detail.status,200,detail.text);assert.equal(detail.data.title,created.data.title);
  } finally {
    await next?.mf.dispose();
    await first?.mf.dispose();
    await rm(directory,{recursive:true,force:true});
  }
});

test('admin backup is consistent; restore to a separate empty D1 preserves zero/null and revocations',async t=>{
  const app=await setup(t),created=await post(app,articleBody());
  const date=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  await app.request('/api/v1/daily-metrics',{method:'POST',session:app.session,body:{account_id:'toutiao-haoduoyu',date,metrics:{reads:0},source:'synthetic'}});
  const credential=await app.request('/api/v1/api-keys',{method:'POST',session:app.session,body:{name:'revoked-synthetic',account_ids:['toutiao-haoduoyu'],permissions:['read']}});
  await app.request('/api/v1/api-keys/'+credential.data.id,{method:'DELETE',session:app.session});
  const backupResponse=await app.request('/api/v1/backup',{session:app.session});
  assert.equal(backupResponse.status,200,backupResponse.text);
  assert.equal((await app.request('/api/v1/backup')).status,401);
  const backup=backupResponse.data,target=await fixture(t,{bootstrap:false});
  const restored=await restoreIntoEmptyDatabase(target.db,backup,{allowEmptyRestore:true});
  assert.equal(restored.counts.articles,1);assert.equal(await n(target.db,'sessions'),0);
  const session=await target.login();
  const read=await target.request('/api/v1/articles/'+created.data.id,{session});assert.equal(read.status,200,read.text);
  const daily=await target.request('/api/v1/daily-metrics',{session});assert.equal(daily.data[0].article_id,null);assert.deepEqual(daily.data[0].metrics,{reads:0});
  assert.equal((await target.request('/api/v1/accounts',{token:credential.data.token})).status,401);
  await assert.rejects(restoreIntoEmptyDatabase(target.db,backup,{allowEmptyRestore:true}),error=>error.code==='RESTORE_NOT_EMPTY');
  const tampered=structuredClone(backup);tampered.data.tables.articles[0].title='tampered';
  await assert.rejects(restoreIntoEmptyDatabase(target.db,tampered,{allowEmptyRestore:true}),error=>error.code==='INVALID_BACKUP');
});

test('platform headers do not authenticate; HTTPS cookies, malformed CSRF and expiry fail closed',async t=>{
  const app=await fixture(t,{origin:'https://matrix-adapter.invalid'});
  assert.equal((await app.request('/api/v1/accounts',{headers:{'oai-authenticated-user-id':'synthetic','oai-authenticated-user-email':'probe@example.invalid'}})).status,401);
  const login=await app.request('/api/v1/auth/login',{method:'POST',body:{username:'synthetic-admin',password:PASSWORD}});
  const setCookie=login.headers.get('set-cookie');
  for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(setCookie.includes(flag));
  assert.ok(!setCookie.includes('Domain='));
  const session={cookie:setCookie.split(';')[0],csrfToken:login.data.csrfToken};
  const before=await n(app.db,'accounts');
  for(const token of ['é'.repeat(64),'g'.repeat(64),'a'.repeat(63)]) {
    const denied=await app.request('/api/v1/accounts',{method:'POST',session:{...session,csrfToken:token},body:{name:'MUST NOT EXIST',platform:'other'}});
    assert.equal(denied.status,403,denied.text);assert.equal(denied.json.error.code,'CSRF');
  }
  assert.equal(await n(app.db,'accounts'),before);
  const stored=(await app.db.prepare('SELECT token_hash FROM matrix_sessions').first()).token_hash;
  assert.notEqual(stored,session.cookie.split('=')[1]);
  await app.db.prepare("UPDATE matrix_sessions SET expires_at='2000-01-01T00:00:00.000Z'").run();
  assert.equal((await app.request('/api/v1/auth/me',{session})).status,401);
});

test('100-account scope with filters uses bounded D1 parameters; inherited asset names are denied',async t=>{
  const app=await setup(t),ids=Array.from({length:100},(_,i)=>'synthetic-scope-'+i);
  await app.db.batch(ids.map(id=>app.db.prepare('INSERT INTO matrix_accounts VALUES(?,?,?,?,?)').bind(id,'other','synthetic',1,ago(0))));
  const credential=await app.request('/api/v1/api-keys',{method:'POST',session:app.session,body:{name:'100 synthetic account scopes',account_ids:ids,permissions:['read','write']}});
  assert.equal(credential.status,201,credential.text);
  const created=await app.request('/api/v1/articles',{method:'POST',token:credential.data.token,body:articleBody({account_id:ids[99]})});
  assert.equal(created.status,201,created.text);
  const records=await app.request('/api/v1/articles?account_id='+ids[99]+'&from='+encodeURIComponent(ago(72)),{token:credential.data.token});
  assert.equal(records.status,200,records.text);assert.equal(records.data.length,1);
  for(const path of ['/constructor','/__proto__','/toString']) assert.equal((await app.request(path)).status,404);
});
