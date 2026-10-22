import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './harness.mjs';
import { revision } from '../src/storage.mjs';
async function seed(t){
 const app=await fixture(t),session=await app.login();const accounts=(await app.request('/api/v1/accounts',{session})).data,records=[];
 for(let i=0;i<13;i++){
  const owner=accounts[i%accounts.length];
  const created=await app.request('/api/v1/articles',{session,method:'POST',body:{account_id:owner.id,title:owner.platform==='wechat'?`【保险200篇·第${31+i}篇】合成${i}`:`合成${i}`,url:`https://example.invalid/analytics/${i}`,published_at:i%2?'2026-10-01T00:00:00Z':'2026-09-29T00:00:00Z',production_mode:'manual',notes:i===0?'日期待核实':''}});
  assert.equal(created.status,201);records.push({...created.data,index:i});
  if(i%5===0)continue;
  const metrics=i===1?{likes:0,comments:0}:{reads:i%4===0?0:Math.floor(i/2)*7,likes:i%3,comments:2};
  const observation=await app.request('/api/v1/observations',{session,method:'POST',body:{article_id:created.data.id,kind:'latest',metrics,as_of:'2026-10-03T00:00:00Z',collected_at:'2026-10-04T00:00:00Z',source:'隔离合成数据'}});
  assert.equal(observation.status,201);
 }
 return {...app,session,records,accounts};
}
test('analytics API: backwards compatible arrays and writes, real global ordering before pagination and null-last both ways',async t=>{
 const app=await seed(t),get=q=>app.request('/api/v1/articles'+q,{session:app.session});
 const legacy=await get('');assert.ok(Array.isArray(legacy.data));assert.equal(legacy.data.length,13);assert.equal(legacy.json.meta.total,13);
 for(const sort of ['reads','likes','comments','approvals','latest_as_of'])for(const order of ['asc','desc']){
  const full=await get(`?sort=${sort}&order=${order}`);assert.equal(full.status,200);
  const pages=[];for(let page=1;page<=5;page++){const result=await get(`?sort=${sort}&order=${order}&page=${page}&page_size=3`);assert.equal(result.status,200);assert.equal(result.json.meta.total,13);pages.push(...result.data);}
  assert.deepEqual(pages.map(a=>a.id),full.data.map(a=>a.id));assert.equal(new Set(pages.map(a=>a.id)).size,13);
  const vals=full.data.map(a=>sort==='latest_as_of'?a.latest_as_of:a.latest_metrics?.[sort]??null);const firstNull=vals.findIndex(v=>v===null);if(firstNull>=0)assert.ok(vals.slice(firstNull).every(v=>v===null));
  for(let i=1;i<full.data.length;i++){
   const previous=full.data[i-1],current=full.data[i],left=vals[i-1],right=vals[i];
   if(left===null||right===null)continue;
   if(left!==right)assert.ok(order==='asc'?left<right:left>right,`${sort} ${order} must order real values`);
   else {assert.ok(previous.published_at>=current.published_at,'ties use publication descending');if(previous.published_at===current.published_at)assert.ok(previous.id.localeCompare(current.id)<=0,'same-date ties use ID ascending');}
  }
  assert.deepEqual((await get(`?sort=${sort}&order=${order}`)).data.map(a=>a.id),full.data.map(a=>a.id));
 }
 const offsets=await get('?limit=4&offset=4');assert.equal(offsets.data.length,4);assert.equal(offsets.json.meta.offset,4);
 for(const query of ['?page=0','?page_size=201','?limit=0','?page=1&offset=0','?platform=bad','?topic=bad','?data_status=bad'])assert.equal((await get(query)).status,400);
});
test('analytics API: cumulative totals/top/coverage and timestamps calculated over all records without mutations',async t=>{
 const app=await seed(t),opts={session:app.session},rows=(await app.request('/api/v1/articles',opts)).data;
 const before=await revision(app.db),obs=(await app.request('/api/v1/observations',opts)).data;
 const result=await app.request('/api/v1/overview?period=30d&top_n=8',opts);assert.equal(result.status,200);
 const known=rows.filter(a=>a.latest_metrics?.reads!=null),sum=known.reduce((n,a)=>n+a.latest_metrics.reads,0),out=result.data;
 assert.equal(out.cumulative.article_count,rows.length);assert.equal(out.cumulative.totals.reads,sum);assert.equal(out.cumulative.mean_reads,sum/known.length);assert.equal(out.cumulative.data_article_count,known.length);assert.equal(out.cumulative.as_of,'2026-10-03T00:00:00.000Z');assert.equal(out.cumulative.collected_at,'2026-10-04T00:00:00.000Z');
 const sorted=[...known].sort((a,b)=>b.latest_metrics.reads-a.latest_metrics.reads||b.published_at.localeCompare(a.published_at)||a.id.localeCompare(b.id));assert.deepEqual(out.top_articles.map(a=>a.id),sorted.slice(0,8).map(a=>a.id));
 assert.ok(out.trend.every(d=>d.accounts.every(a=>Object.keys(a.metrics).length===0)));assert.equal(out.series.recorded_count,rows.filter(a=>a.platform==='wechat').length);
 await app.request('/api/v1/articles?page=2&page_size=2',opts);assert.equal((await app.request('/api/v1/overview?period=7d',opts)).data.cumulative.totals.reads,sum);
 assert.equal(await revision(app.db),before);assert.deepEqual((await app.request('/api/v1/observations',opts)).data,obs);
});
test('analytics API: platform/topic/date/missing filters and separate likes/approvals; detail timeline is additive',async t=>{
 const app=await seed(t),opts={session:app.session},get=q=>app.request('/api/v1/articles?'+q,opts);
 const tt=await get('platform=toutiao');assert.ok(tt.data.every(a=>a.platform==='toutiao'));
 const insurance=await get('topic=insurance');assert.ok(insurance.data.length>0);assert.ok(insurance.data.every(a=>a.platform==='wechat'&&a.topic_source==='inferred'));
 assert.equal((await get('data_status=no_snapshot')).data.length,3);assert.equal((await get('data_status=missing_reads')).data.length,4);
 const zero=await get('data_status=zero_reads');assert.ok(zero.data.length>0);assert.ok(zero.data.every(a=>a.latest_metrics?.reads===0));assert.equal((await get('data_status=date_unverified')).data.length,1);
 assert.equal((await get('from=2026-10-02')).data.length,0);assert.equal((await get('q=analytics%2F11')).data.length,1);
 const article=app.records[2],post=body=>app.request('/api/v1/observations',{...opts,method:'POST',body:{article_id:article.id,kind:'d1',source:'隔离数据',...body}});
 assert.equal((await post({as_of:'2026-10-02T00:00:00Z',collected_at:'2026-10-02T01:00:00Z',metrics:{reads:0,likes:0}})).status,201);
 assert.equal((await post({as_of:'2026-10-05T00:00:00Z',collected_at:'2026-10-05T01:00:00Z',metrics:{reads:1,approvals:6}})).status,201);
 const detail=(await app.request('/api/v1/articles/'+article.id,opts)).data;assert.equal(detail.observations.length,3);assert.equal(detail.latest_metrics.approvals,6);assert.equal(detail.latest_metrics.likes,undefined);assert.equal(detail.latest_collected_at,'2026-10-05T01:00:00.000Z');
 assert.equal(detail.timeline.length,3);assert.ok(detail.timeline.at(-1).changes.reads.delta<0);assert.equal(detail.timeline.at(-1).changes.likes.comparable,false);
});
test('analytics API: new envelopes and global views respect existing account scope',async t=>{
 const app=await seed(t),scope=app.accounts[0].id;
 const key=await app.request('/api/v1/api-keys',{session:app.session,method:'POST',body:{name:'隔离只读',account_ids:[scope],permissions:['read']}});assert.equal(key.status,201);
 const opts={token:key.data.token},list=await app.request('/api/v1/articles?page_size=2',opts);assert.ok(list.data.every(a=>a.account_id===scope));assert.equal(list.json.meta.unfiltered_total,app.records.filter(a=>a.account_id===scope).length);
 const over=await app.request('/api/v1/overview?period=30d&top_n=50',opts);assert.ok(over.data.top_articles.every(a=>a.account_id===scope));assert.equal(over.data.cumulative.article_count,list.json.meta.total);assert.equal(over.data.platform_comparison.length,1);
 assert.equal((await app.request('/api/v1/articles/'+app.records.find(a=>a.account_id!==scope).id,opts)).status,403);
});

test('analytics API: legacy clients receive all records beyond default page size; opt-in pages remain bounded',async t=>{
 const app=await fixture(t),session=await app.login(),account=(await app.request('/api/v1/accounts',{session})).data[0];
 const count=25;
 for(let i=0;i<count;i++)assert.equal((await app.request('/api/v1/articles',{session,method:'POST',body:{account_id:account.id,title:`旧客户端全量合成${i}`,url:`https://example.invalid/legacy-over-page/${i}`,published_at:'2026-10-01T00:00:00Z',production_mode:'manual'}})).status,201);
 const legacy=await app.request('/api/v1/articles',{session});assert.equal(legacy.status,200);assert.ok(Array.isArray(legacy.data));assert.equal(legacy.data.length,count);assert.equal(legacy.json.meta.pagination,'legacy');
 const paged=await app.request('/api/v1/articles?page=1&page_size=7',{session});assert.equal(paged.data.length,7);assert.equal(paged.json.meta.total,count);assert.equal(paged.json.meta.has_more,true);
 const overview=await app.request('/api/v1/overview?period=7d',{session});assert.equal(overview.data.cumulative.article_count,count);assert.equal(overview.data.cumulative.totals.reads,null);assert.equal(overview.data.top_articles.length,0);
});

test('analytics API: Zhihu daily primary coverage matches visible likes without aliasing approvals',async t=>{
 const app=await fixture(t),session=await app.login(),account=(await app.request('/api/v1/accounts',{session})).data.find(a=>a.platform==='zhihu');
 const date=new Date(Date.now()+8*3600000-86400000).toISOString().slice(0,10);
 const post=metrics=>app.request('/api/v1/daily-metrics',{session,method:'POST',body:{account_id:account.id,date,metrics,source:'隔离口径回归'}});
 assert.equal((await post({reads:1,likes:2,comments:0})).status,201);
 let overview=(await app.request('/api/v1/overview?period=yesterday&account_id='+account.id,{session})).data;
 assert.deepEqual(overview.data_status.complete_accounts,[account.id]);assert.deepEqual(overview.accounts[0].coverage.missing_metrics,[]);assert.equal(overview.accounts[0].period_metrics.likes,2);assert.equal(overview.accounts[0].period_metrics.approvals,undefined);
 assert.equal((await post({reads:1,approvals:3,comments:0})).status,201);
 overview=(await app.request('/api/v1/overview?period=yesterday&account_id='+account.id,{session})).data;
 assert.deepEqual(overview.data_status.complete_accounts,[]);assert.deepEqual(overview.data_status.missing_accounts,[account.id]);assert.deepEqual(overview.accounts[0].coverage.missing_metrics,['likes']);assert.equal(overview.accounts[0].period_metrics.likes,undefined);assert.equal(overview.accounts[0].period_metrics.approvals,3);
});
