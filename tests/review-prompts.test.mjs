import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleContentReview} from '../src/content-review.mjs';
import {digest,csrfFor,stable} from '../src/security.mjs';
import {reviewView} from '../src/content-review-validation.mjs';
import {reviewInput,reviewContentHash} from '../src/content-review-validation.mjs';

function fixture(t) {
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');t.after(()=>sql.close());
  const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  for(const {tag} of journal.entries)for(const statement of readFileSync(new URL('../drizzle/'+tag+'.sql',import.meta.url),'utf8').split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean))sql.exec(statement);
  let batchTail=Promise.resolve();
  const db={prepare(text){let values=[];return {bind(...args){values=args;return this;},async first(){return sql.prepare(text).get(...values)||null;},async all(){return {results:sql.prepare(text).all(...values)};},async run(){const result=sql.prepare(text).run(...values);return {meta:{changes:Number(result.changes)}};}};},async batch(statements){const run=batchTail.then(async()=>{sql.exec('BEGIN');try{for(const statement of statements)await statement.run();sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}});batchTail=run.catch(()=>{});return run;}};
  const owner=randomUUID(),token=randomBytes(32).toString('hex'),origin='http://localhost';
  sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'owner','synthetic',new Date().toISOString());
  sql.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(token),owner,new Date(Date.now()+60000).toISOString());
  sql.exec('INSERT INTO matrix_control(id,initialized) VALUES(1,1)');
  const env={DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1'},publicHeaders={Origin:origin,'X-Public-Business':'1'};
  async function call(path,method='GET',data,headers=publicHeaders,settings=env) {
    const h=new Headers(headers);if(data!==undefined)h.set('Content-Type','application/json');
    const request=new Request(origin+'/api/v1/review/'+path,{method,headers:h,body:data===undefined?undefined:JSON.stringify(data)});
    try{const response=await handleContentReview(db,request,new URL(request.url).pathname.slice('/api/v1'.length),settings,origin);return {status:response.status,...await response.json()};}
    catch(error){if(!error.status)throw error;return {status:error.status,error:{code:error.code,message:error.message}};}
  }
  return {db,sql,owner,token,env,origin,call,publicHeaders,auth:{...publicHeaders,Cookie:'matrix_session='+token,'X-CSRF-Token':csrfFor(token)}};
}

const prompt=(version=1,extra={})=>({prompt_key:'longform_write',scope:'vzi',version,title:'Synthetic',content_md:'Synthetic content',...extra});
test('prompt access keeps public-origin, explicit credentials, owner and CSRF boundaries',async t=>{
  const a=fixture(t),path='prompts/'+randomUUID();
  assert.equal((await a.call('prompts','GET',undefined,{}, {...a.env,PUBLIC_BUSINESS_MODE:'0'})).status,401);
  for(const headers of [{Authorization:''},{Authorization:'Bearer invalid'},{Cookie:'matrix_session=invalid'}]) {
    assert.equal((await a.call('prompts','GET',undefined,headers)).status,401);
    assert.equal((await a.call(path,'PUT',prompt(),{...a.publicHeaders,...headers})).status,401);
  }
  for(const headers of [{},{Origin:a.origin},{...a.publicHeaders,Origin:'https://wrong.invalid'},{...a.auth,'X-CSRF-Token':'wrong'}])assert.equal((await a.call(path,'PUT',prompt(),headers)).status,403);
  const foreign=randomUUID(),token=randomBytes(32).toString('hex');
  a.sql.prepare('INSERT INTO matrix_users VALUES(?,?,?,?)').run(foreign,'foreign','synthetic',new Date().toISOString());
  a.sql.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(token),foreign,new Date(Date.now()+60000).toISOString());
  assert.equal((await a.call('prompts','GET',undefined,{Cookie:'matrix_session='+token})).status,403);
  assert.equal((await a.call(path,'PUT',prompt(),a.auth)).status,201);
  assert.equal((await a.call(path,'DELETE',{},a.auth)).status,404);
});
test('UUID replay and unique group versions preserve audit and reject stale hashes',async t=>{
  const a=fixture(t),path='prompts/'+randomUUID(),body=prompt();
  const first=await a.call(path,'PUT',body);assert.equal(first.status,201);assert.equal(first.data.status,'draft');
  assert.deepEqual((await a.call(path,'PUT',body)).data,first.data);
  assert.equal((await a.call(path,'PUT',{...body,title:'Other'})).error.code,'IDEMPOTENCY_CONFLICT');
  assert.equal((await a.call('prompts/'+randomUUID(),'PUT',body)).error.code,'REVIEW_UNIQUE_CONFLICT');
  const next=await a.call(path,'PATCH',{expected_hash:first.data.content_hash,title:'Changed'});assert.equal(next.status,200);
  assert.equal((await a.call(path,'PATCH',{expected_hash:first.data.content_hash,title:'Stale'})).error.code,'VERSION_CONFLICT');
  assert.equal((await a.call(path,'PATCH',{expected_hash:next.data.content_hash,version:2})).error.code,'PROMPT_IDENTITY_IMMUTABLE');
  assert.equal(a.sql.prepare("SELECT count(*) n FROM matrix_audit WHERE action LIKE 'review.prompts.%'").get().n,2);
});
test('promotion archives prior version atomically without changing content and archived is terminal',async t=>{
  const a=fixture(t),ids=[randomUUID(),randomUUID()];
  const first=(await a.call('prompts/'+ids[0],'PUT',prompt(1,{status:'active'}))).data;
  const second=(await a.call('prompts/'+ids[1],'PUT',prompt(2,{content_md:'Second'}))).data;
  const active=(await a.call('prompts/'+ids[1],'PATCH',{expected_hash:second.content_hash,status:'active'})).data;
  const old=(await a.call('prompts/'+ids[0])).data;assert.equal(old.status,'archived');assert.equal(old.content_md,first.content_md);assert.equal(old.created_at,first.created_at);
  for(const row of [old,active])assert.equal((await a.call('prompts/'+row.id,'PATCH',{expected_hash:row.content_hash,content_md:'Overwrite'})).error.code,'PROMPT_CONTENT_IMMUTABLE');
  assert.equal((await a.call('prompts/'+old.id,'PATCH',{expected_hash:old.content_hash,status:'draft'})).error.code,'PROMPT_STATUS_CONFLICT');
  assert.equal((await a.call('prompts/'+active.id,'PATCH',{expected_hash:active.content_hash,status:'draft'})).error.code,'PROMPT_STATUS_CONFLICT');
  assert.deepEqual((await a.call('prompts/current')).data.items.map(x=>x.id),[active.id]);
});
test('concurrent activation leaves exactly newest active and all historical rows',async t=>{
  const a=fixture(t),rows=[];
  for(let version=1;version<=2;version++)rows.push((await a.call('prompts/'+randomUUID(),'PUT',prompt(version))).data);
  const replies=await Promise.all(rows.map(row=>a.call('prompts/'+row.id,'PATCH',{expected_hash:row.content_hash,status:'active'})));
  assert.ok(replies.every(x=>x.status===200||x.error?.code==='PROMPT_VERSION_ORDER'));
  const active=(await a.call('prompts/current')).data.items;assert.equal(active.length,1);assert.equal(active[0].version,2);
  assert.equal((await a.call('prompts')).data.items.length,2);
  assert.throws(()=>a.sql.prepare('UPDATE matrix_review_prompt_versions SET status=? WHERE id=?').run('active',rows[0].id),/UNIQUE constraint/);
});
test('account aliases, arbitrary legacy accounts and standalone WeChat apply to current and history',async t=>{
  const a=fixture(t);
  for(const scope of ['global','toutiao','vzi','yujian','wechat'])for(const version of [1,2])assert.equal((await a.call('prompts/'+randomUUID(),'PUT',prompt(version,{scope,status:version===1?'active':'draft'}))).status,201);
  for(const [account,scopes] of [['global',['global']],['整体',['global']],['头条',['global','toutiao']],['toutiao',['global','toutiao']],['V字',['global','toutiao','vzi']],['vzi',['global','toutiao','vzi']],['鱼见',['global','toutiao','yujian']],['yujian',['global','toutiao','yujian']],['wechat',['wechat']],['公众号',['wechat']],['Other account',['global']],['constructor',['global']]])for(const path of ['prompts','prompts/current']) {
    const result=await a.call(path+'?account='+encodeURIComponent(account));assert.equal(result.status,200);assert.deepEqual([...new Set(result.data.items.map(x=>x.scope))],scopes);
  }
  for(const account of ['wechat','公众号'])assert.deepEqual((await a.call('prompts?account='+encodeURIComponent(account)+'&scope=global')).data.items,[]);
  assert.equal((await a.call('prompts')).data.items.length,10);assert.equal((await a.call('prompts/current')).data.items.length,5);
  assert.equal((await a.call('prompts?scope=global')).data.items.length,2);
  for(const account of ['', ' ', 'a\nb','bad\u0000value','x'.repeat(121)])assert.equal((await a.call('prompts?account='+encodeURIComponent(account))).status,400);
});
test('query filters and stable pagination reject changed revisions and unsafe inputs',async t=>{
  const a=fixture(t);await a.call('prompts/'+randomUUID(),'PUT',prompt(1,{status:'active'}));
  const before=(await a.call('prompts')).data;
  assert.equal((await a.call('prompts?offset=1&read_revision='+before.read_revision)).data.items.length,0);
  await a.call('prompts/'+randomUUID(),'PUT',prompt(2));
  assert.equal((await a.call('prompts?read_revision='+before.read_revision)).error.code,'READ_REVISION_CHANGED');
  for(const q of ['offset=-1','offset=9007199254740992','scope=x','scope=vzi&scope=global','status=bad','prompt_key=BAD','unknown=1'])assert.equal((await a.call('prompts?'+q)).status,400);
});
test('slugs are independently versioned and new UUID versions must increase',async t=>{
  const a=fixture(t);
  for(const prompt_key of ['longform_write','weitoutiao_write','image','transfer_chat'])assert.equal((await a.call('prompts/'+randomUUID(),'PUT',prompt(1,{prompt_key,status:'active'}))).status,201);
  assert.equal((await a.call('prompts/current')).data.items.length,4);
  assert.equal((await a.call('prompts/'+randomUUID(),'PUT',prompt(4))).status,201);
  assert.equal((await a.call('prompts/'+randomUUID(),'PUT',prompt(3))).error.code,'PROMPT_VERSION_ORDER');
  for(const body of [prompt(0),prompt(1,{scope:'other'}),prompt(1,{prompt_key:'a__b'}),prompt(1,{prompt_key:'a-_b'}),prompt(1,{prompt_key:'a_'}),prompt(1,{content_md:''}),prompt(1,{unknown:true}),prompt(1,{title:'x'.repeat(501)})])assert.equal((await a.call('prompts/'+randomUUID(),'PUT',body)).status,400);
});
test('rule scope omission leaves legacy values and hash unchanged; PATCH uses expected hash',async t=>{
  const a=fixture(t),id=randomUUID(),body={version:1,published_on:'2026-11-10',rules:[{rule_id:'synthetic',section:'body',text:'Original'}]};
  const raw=reviewInput('playbooks',body);assert.equal(Object.hasOwn(raw.rules[0],'scope'),false);assert.equal(reviewContentHash(raw),reviewContentHash(reviewInput('playbooks',body)));
  const row=(await a.call('playbooks/'+id,'PUT',body)).data;
  const patch={account:'V字',playbook_id:id,expected_hash:row.content_hash,save_id:randomUUID(),scope:'global'};
  const changed=await a.call('rules/synthetic','PATCH',patch);assert.equal(changed.data.rules[0].scope,'global');
  assert.equal((await a.call('rules/synthetic','PATCH',{...patch,save_id:randomUUID(),scope:'vzi'})).error.code,'VERSION_CONFLICT');
  assert.throws(()=>reviewInput('playbooks',{...body,rules:[{...body.rules[0],scope:'invalid'}]}),/Invalid review scope/);
});
test('public prompt writes share existing review rate limits',async t=>{
  const a=fixture(t),path='prompts/'+randomUUID();for(let i=0;i<60;i++)assert.ok([200,201].includes((await a.call(path,'PUT',prompt())).status));
  const result=await a.call(path,'PUT',prompt());assert.equal(result.status,429);assert.equal(result.error.code,'REVIEW_RATE_LIMIT');
});
test('0021 migration preserves old rows exactly and seeds no prompts',t=>{
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  for(const {tag} of journal.entries.filter(x=>x.idx<21))for(const statement of readFileSync(new URL('../drizzle/'+tag+'.sql',import.meta.url),'utf8').split('--> statement-breakpoint').filter(x=>x.trim()))sql.exec(statement);
  const owner=randomUUID();sql.prepare('INSERT INTO matrix_users VALUES(?,?,?,?)').run(owner,'synthetic','synthetic','2026-11-10');
  sql.prepare('INSERT INTO matrix_review_playbooks(user_id,id,version,published_on,rules_json,created_at) VALUES(?,?,?,?,?,?)').run(owner,randomUUID(),1,'2026-11-10','[{"rule_id":"legacy","section":"body","text":"Unchanged"}]','2026-11-10');
  const before=sql.prepare('SELECT * FROM matrix_review_playbooks').all();
  for(const statement of readFileSync(new URL('../drizzle/0021_review_prompt_versions.sql',import.meta.url),'utf8').split('--> statement-breakpoint'))sql.exec(statement);
  assert.deepEqual(sql.prepare('SELECT * FROM matrix_review_playbooks').all(),before);assert.equal(sql.prepare('SELECT count(*) n FROM matrix_review_prompt_versions').get().n,0);
});
