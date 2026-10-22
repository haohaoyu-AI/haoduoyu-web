import {traceJSON} from './request-trace-projection.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {countingDb} from './counting-d1.mjs';
import {referenceWorker} from './overview-cache-reference.mjs';
import {BENCHMARK, seedBenchmark} from './bench-fixture.mjs';
async function setup(t) {
  const app=await fixture(t);app.session=await app.login();
  const accounts=(await app.db.prepare('SELECT id,platform FROM matrix_accounts').all()).results;
  for(const [i,row] of accounts.entries()) await app.db.prepare('UPDATE matrix_accounts SET name=? WHERE id=?').bind('Synthetic lightweight account '+i,row.id).run();
  await seedBenchmark(app.db,['toutiao','zhihu','wechat'].map(p=>accounts.find(x=>x.platform===p).id),{articles:12});
  await app.db.prepare("DELETE FROM matrix_observations WHERE article_id='bench-article-1' AND kind='d1'").run();
  app.counted=countingDb(app.db);return app;
}
async function read(app,path,headers={Cookie:app.session.cookie},implementation=worker) {
  app.counted.entries.length=0;
  const response=await implementation.fetch(new Request(app.origin+'/api/v1'+path,{headers}),{DB:app.counted,SITE_ORIGIN:app.origin});
  const text=await response.text();
  return {status:response.status,bytes:Buffer.byteLength(text),body:traceJSON(JSON.parse(text),response.status,response.headers,implementation===worker),sql:app.counted.entries.map(x=>x.sql),counts:app.counted.totals()};
}
test('due-only API matches the complete overview due list without computing daily or cumulative fields',async t=>{
  const app=await setup(t);
  const legacy=await referenceWorker(t);
  const overview=await read(app,'/overview',{Cookie:app.session.cookie},legacy),due=await read(app,'/due-reviews');
  assert.equal(due.status,200);assert.ok(due.body.data.length>0);assert.deepEqual(due.body.data,overview.body.data.due_reviews);
  assert.equal(due.sql.some(sql=>/matrix_daily_metrics/.test(sql)),false);
  assert.equal(due.counts.write_statements,0);
});
test('article index contains exactly five fields and issues no snapshot query',async t=>{
  const app=await setup(t),old=await read(app,'/articles'),index=await read(app,'/articles?fields=index');
  assert.equal(index.status,200);assert.deepEqual(index.body.meta,old.body.meta);
  assert.deepEqual(index.body.data,old.body.data.map(({id,title,account_id,platform,published_at})=>({id,title,account_id,platform,published_at})));
  assert.equal(index.sql.some(sql=>/matrix_observations/.test(sql)),false);
  assert.equal(index.counts.write_statements,0);
});
test('index native filters/pagination retain old projections and reject unsupported or malformed parameters explicitly',async t=>{
  const app=await setup(t);
  for(const query of ['account_id=zhihu-haoduoyu','platform=wechat&order=asc','mode=manual','topic=insurance',
    'from=2026-10-01&to=2026-10-10','sort=duration&order=asc','data_status=date_unverified','q=synthetic','page=1&page_size=3']) {
    const old=await read(app,'/articles?'+query),index=await read(app,'/articles?fields=index&'+query);
    assert.equal(index.status,200,query);assert.deepEqual(index.body.meta,old.body.meta);
    assert.deepEqual(index.body.data,old.body.data.map(({id,title,account_id,platform,published_at})=>({id,title,account_id,platform,published_at})));
    assert.equal(index.sql.some(sql=>/matrix_observations/.test(sql)),false);
  }
  for(const query of ['sort=reads','sort=latest_as_of','data_status=no_snapshot','data_status=zero_reads',
    'sort=invalid','platform=invalid','mode=invalid','topic=invalid','data_status=invalid','page=0','page=1&offset=0','from=2026-10-99','fields=invalid']) {
    const result=await read(app,'/articles?fields=index&'+query);
    assert.equal(result.status,400,query);assert.equal(result.body.error.code,'VALIDATION_ERROR');
  }
});
test('both new reads authenticate and enforce exact account scope without exposing other account data',async t=>{
  const app=await setup(t);
  const key=(await app.request('/api/v1/api-keys',{method:'POST',session:app.session,
    body:{name:'Synthetic light reader',account_ids:['zhihu-haoduoyu'],permissions:['read']}})).data;
  const headers={Authorization:'Bearer '+key.token};
  for(const path of ['/due-reviews','/articles?fields=index']) {
    const denied=await read(app,path,{});assert.equal(denied.status,401);
    const allowed=await read(app,path,headers);assert.equal(allowed.status,200);
    assert.ok(allowed.body.data.every(row=>row.account_id==='zhihu-haoduoyu'));
    const forbidden=await read(app,path+(path.includes('?')?'&':'?')+'account_id=toutiao-haoduoyu',headers);
    assert.equal(forbidden.status,403);
  }
  await app.db.prepare('UPDATE matrix_api_keys SET revoked_at=? WHERE id=?').bind(BENCHMARK.now,key.id).run();
  assert.equal((await read(app,'/articles?fields=index',headers)).status,401);
  assert.equal((await read(app,'/due-reviews',headers)).status,401);
});
