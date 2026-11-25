import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleContentReview} from '../src/content-review.mjs';
import {digest,csrfFor} from '../src/security.mjs';
import {renderBenchmarkLibrary} from '../web/pages/review-benchmark-library.mjs';

function fixture(t) {
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');t.after(()=>sql.close());
  const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  for(const {tag} of journal.entries)for(const statement of readFileSync(new URL('../drizzle/'+tag+'.sql',import.meta.url),'utf8').split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean))sql.exec(statement);
  const db={prepare(text){let values=[];return {bind(...args){values=args;return this;},async first(){return sql.prepare(text).get(...values)||null;},async all(){return {results:sql.prepare(text).all(...values)};},async run(){const result=sql.prepare(text).run(...values);return {meta:{changes:Number(result.changes)}};}};},async batch(statements){sql.exec('BEGIN');try{for(const statement of statements)await statement.run();sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}}};
  const owner=randomUUID(),token=randomBytes(32).toString('hex'),origin='http://localhost';
  sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'owner','synthetic',new Date().toISOString());
  sql.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(token),owner,new Date(Date.now()+60000).toISOString());
  sql.exec('INSERT INTO matrix_control(id,initialized) VALUES(1,1)');
  const env={DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1'},publicHeaders={Origin:origin,'X-Public-Business':'1'};
  async function call(path,method='GET',data,headers=publicHeaders) {
    const h=new Headers(headers);if(data!==undefined)h.set('Content-Type','application/json');
    const request=new Request(origin+'/api/v1/review/'+path,{method,headers:h,body:data===undefined?undefined:JSON.stringify(data)});
    try{const response=await handleContentReview(db,request,new URL(request.url).pathname.slice('/api/v1'.length),env,origin);return {status:response.status,...await response.json()};}
    catch(error){if(!error.status)throw error;return {status:error.status,error:{code:error.code,message:error.message}};}
  }
  return {call,auth:{...publicHeaders,Cookie:'matrix_session='+token,'X-CSRF-Token':csrfFor(token)}};
}

async function library(call) {
  const account=encodeURIComponent('V字');
  const accounts=(await call('benchmark-accounts?account='+account)).data.items;
  const samples=(await call('benchmark-articles?account='+account)).data.items;
  const articles=(await call('articles?account='+account)).data.items;
  return renderBenchmarkLibrary({benchmarkAccounts:accounts,benchmarkArticles:samples,articles},'V字');
}

test('PATCH 关联后爆文库可见',async t=>{
  const {call}=fixture(t),bench=randomUUID(),sample=randomUUID(),unused=randomUUID(),article=randomUUID();
  assert.equal((await call('benchmark-accounts/'+bench,'PUT',{account:'V字',platform:'toutiao',name:'浅黑科技'})).status,201);
  assert.equal((await call('benchmark-articles/'+sample,'PUT',{benchmark_account_id:bench,title:'已仿写样本',url:'https://example.com/sample',reads:128000})).status,201);
  assert.equal((await call('benchmark-articles/'+unused,'PUT',{benchmark_account_id:bench,title:'未仿写样本',url:'https://example.com/unused',reads:10})).status,201);
  const created=await call('articles/'+article,'PUT',{account:'V字',title:'仿写标题'});
  assert.equal(created.status,201);
  assert.equal(created.data.reference_article_id,null);
  assert.match(await library(call),/暂无已仿写爆文/);
  assert.doesNotMatch(await library(call),/已仿写样本|未仿写样本|仿写标题/);

  const current=await call('articles/'+article);
  assert.equal(current.status,200);
  assert.equal(current.data.content_hash,created.data.content_hash);
  const overwritten=await call('articles/'+article,'PUT',{account:'V字',title:'另一篇'});
  assert.equal(overwritten.status,409);
  assert.equal(overwritten.error.code,'IDEMPOTENCY_CONFLICT');

  const linked=await call('articles/'+article,'PATCH',{reference_article_id:sample,expected_hash:current.data.content_hash});
  assert.equal(linked.status,200);
  assert.equal(linked.data.reference_article_id,sample);
  const html=await library(call);
  assert.match(html,/data-label="对标账号">浅黑科技/);
  assert.match(html,/data-label="样本标题">[\s\S]*已仿写样本/);
  assert.match(html,/data-label="仿写标题">[\s\S]*仿写标题/);
  assert.doesNotMatch(html,/未仿写样本|暂无已仿写爆文/);
});
