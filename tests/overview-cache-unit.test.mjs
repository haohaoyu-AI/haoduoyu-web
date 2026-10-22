import test from 'node:test';
import assert from 'node:assert/strict';
import {createOverviewCache} from '../src/overview-cache.mjs';
import {nextOverviewChange} from '../src/overview-cache-time.mjs';
import {buildOverview} from '../src/overview.mjs';
import {cumulativeOverview} from '../src/analytics.mjs';

const actor={id:'synthetic-user',kind:'session',scope:null,permissions:['read','write']};
const body='{"data":{"synthetic":true}}';
async function store(cache,key,text=body,at=10,until=100) {
  const ticket=cache.reserve(key,at,until,text);assert.ok(ticket);
  const response=ticket.response();ticket.publish(at);assert.equal(await response.text(),text);return ticket;
}

test('cache keys isolate DB/revision/identity/full authorization and normalize only actual overview inputs', () => {
  const cache=createOverviewCache(),db={},other={};
  const key=cache.key(db,0,{},actor);
  assert.equal(cache.key(db,0,{top_n:'05',period:'yesterday',account_id:'',top_platform:'',token:'synthetic-secret'},actor),key);
  assert.notEqual(cache.key(other,0,{},actor),key);assert.notEqual(cache.key(db,1,{},actor),key);
  assert.notEqual(cache.key(db,0,{}, {...actor,scope:[]}),key);
  assert.notEqual(cache.key(db,0,{}, {...actor,id:'different'}),key);
  assert.notEqual(cache.key(db,0,{}, {...actor,permissions:['read']}),key);
  assert.equal(cache.key(db,0,{period:'invalid'},actor),null);assert.equal(cache.key(db,0,{top_n:'no'},actor),null);
  assert.equal(cache.key(db,0,{top_platform:'invalid'},actor),null);
  assert.equal(cache.key(db,0,{}, {...actor,scope:['b','a'],permissions:['write','read']}),
    cache.key(db,0,{}, {...actor,scope:['a','b']}));
  assert.equal(JSON.stringify(cache.stats()).includes('synthetic-secret'),false);
});

test('reserve precedes Blob construction; pending leases and active entries cannot escape byte/entry budgets', async () => {
  const NativeBlob=globalThis.Blob;let allocations=0;
  globalThis.Blob=class extends NativeBlob {constructor(...args) {super(...args);allocations++;}};
  try {
    const cache=createOverviewCache({bytes:2000,itemBytes:1000,entries:2,chunkBytes:8});
    const first=cache.reserve('a',10,100,body);assert.ok(first);assert.equal(allocations,1);
    assert.equal(cache.reserve('b',10,100,body),null);assert.equal(allocations,1);
    assert.equal(cache.stats().pending,1);assert.equal(cache.stats().leases,1);assert.ok(cache.stats().bytes<=2000);
    const response=first.response();first.publish(10);
    assert.equal(cache.reserve('b',10,100,body),null,'unconsumed response retains its charge');
    cache.clear();assert.equal(cache.stats().resident,0);assert.ok(cache.stats().bytes>0);
    await response.body.cancel();assert.equal(cache.stats().bytes,0);assert.equal(cache.stats().leases,0);
    const next=cache.reserve('b',10,100,body);assert.ok(next);await next.abort();assert.equal(cache.stats().bytes,0);
  } finally {globalThis.Blob=NativeBlob;}
});

test('LRU eviction, individual oversize rejection and rollback do not truncate body or leak reservations', async () => {
  const cache=createOverviewCache({entries:2,bytes:8192,itemBytes:128,chunkBytes:8});
  await store(cache,'a');await store(cache,'b');
  const touched=cache.get('a',11);assert.ok(touched);await touched.abort();
  await store(cache,'c');assert.equal(cache.get('b',11),null);
  assert.equal(cache.stats().resident,2);assert.ok(cache.stats().evicted>=1);
  assert.equal(cache.reserve('large',10,100,'x'.repeat(129)),null);assert.equal(cache.stats().oversized,1);
  const earlier=cache.get('a',9);assert.equal(earlier,null);
  const expired=cache.get('a',100);assert.equal(expired,null);
  cache.clear();assert.equal(cache.stats().bytes,0);
});

test('private immutable body survives consumer mutation, completion, cancellation and post-fetch read errors', async () => {
  const cache=createOverviewCache({bytes:8192,itemBytes:1024,chunkBytes:8});
  await store(cache,'a');
  const hit=cache.get('a',11),response=hit.response();hit.publish(11);
  const reader=response.body.getReader(),chunk=await reader.read();chunk.value.fill(0);await reader.cancel();
  const again=cache.get('a',12),good=again.response();again.publish(12);assert.equal(await good.text(),body);
  assert.equal(cache.stats().leases,0);cache.clear();assert.equal(cache.stats().bytes,0);
  const broken=createOverviewCache({bytes:8192,itemBytes:1024,chunkBytes:8},async()=>{throw new Error('Synthetic body read error');});
  const pending=broken.reserve('b',10,100,body),failed=pending.response();pending.publish(10);
  assert.equal(failed.status,200,'headers already returned; body failure is not a fabricated JSON500');
  await assert.rejects(failed.text(),/Synthetic body read error/);
  assert.equal(broken.stats().leases,0);assert.equal(broken.stats().reads,0);
  assert.equal(broken.stats().resident,0);assert.equal(broken.stats().bytes,0);
  broken.clear();assert.equal(broken.stats().bytes,0);
});

test('aborted/expired candidates never become resident, and simultaneous publishes stay within budget', async () => {
  const cache=createOverviewCache({bytes:8192,itemBytes:1024,chunkBytes:8});
  const a=cache.reserve('a',10,20,body);await a.abort();assert.equal(cache.stats().resident,0);
  const b=cache.reserve('b',10,20,body),response=b.response();b.publish(20);
  assert.equal(cache.stats().resident,0);assert.ok(cache.stats().bytes>0);
  await response.text();assert.equal(cache.stats().bytes,0);
  const first=cache.reserve('same',10,100,body),second=cache.reserve('same',11,100,body);
  const r1=first.response(),r2=second.response();first.publish(11);second.publish(11);
  assert.equal(cache.stats().resident,1);assert.equal(cache.stats().entries,2);
  assert.equal(await r1.text(),body);assert.equal(await r2.text(),body);
  assert.equal(cache.stats().entries,1);assert.equal(cache.stats().leases,0);cache.clear();assert.equal(cache.stats().bytes,0);
});

const DAY=86400000,edge=Date.parse('2026-10-22T03:00:00Z');
const accounts=[{id:'wechat-xiaoyuer',name:'Synthetic account',platform:'wechat'}];
function article(published,extra={}) {return {id:'synthetic-article',account_id:accounts[0].id,account_name:accounts[0].name,
  platform:'wechat',title:'【保险200篇·第1篇】虚构文章',published_at:new Date(published).toISOString(),notes:'',...extra};}
const value=(articles,observations,now)=>({...buildOverview({accounts,articles,daily:[],observations,now}),
  ...cumulativeOverview(articles,{accounts,now})});

test('exact day/d1/d3/d7/insurance boundaries match the existing due and series predicates at -1/=/+1ms', () => {
  const midnight=Date.parse('2026-10-22T16:00:00Z');
  assert.equal(nextOverviewChange({accounts,articles:[],observations:[],now:midnight-1}),midnight);
  assert.equal(nextOverviewChange({accounts,articles:[],observations:[],now:midnight}),midnight+DAY);
  for (const [kind,days] of [['d1',1],['d3',3],['d7',7]]) {
    const rows=[article(edge-days*DAY)];
    assert.equal(nextOverviewChange({accounts,articles:rows,observations:[],now:edge-1}),edge);
    assert.equal(value(rows,[],edge-1).due_reviews.some(x=>x.due_kind===kind),false);
    for (const at of [edge,edge+1]) assert.equal(value(rows,[],at).due_reviews.some(x=>x.due_kind===kind),true);
    const complete=[{article_id:rows[0].id,kind,as_of:new Date(edge).toISOString()}];
    assert.notEqual(nextOverviewChange({accounts,articles:rows,observations:complete,now:edge-1}),edge);
    const wrong=[{...complete[0],kind:'latest'}];
    assert.equal(nextOverviewChange({accounts,articles:rows,observations:wrong,now:edge-1}),edge);
    const early=[{...complete[0],as_of:new Date(edge-1).toISOString()}];
    assert.equal(nextOverviewChange({accounts,articles:rows,observations:early,now:edge-1}),edge);
  }
  const future=[article(edge)];
  assert.equal(nextOverviewChange({accounts,articles:future,observations:[],now:edge-1}),edge);
  assert.equal(value(future,[],edge-1).series.recorded_count,0);
  for (const at of [edge,edge+1]) assert.equal(value(future,[],at).series.recorded_count,1);
  for (const extra of [{notes:'[date-unverified]'},{title:'【保险200篇·第201篇】虚构文章'},
    {platform:'zhihu'},{account_id:'different',account_name:'Synthetic other'}])
    assert.notEqual(nextOverviewChange({accounts,articles:[article(edge,extra)],observations:[],now:edge-1}),edge);
  const simultaneous=[article(edge-DAY),article(edge,{id:'second'})];
  assert.equal(nextOverviewChange({accounts,articles:simultaneous,observations:[],now:edge-1}),edge);
});
test('cancellation during an in-flight Blob read retains its reservation until that read settles', async () => {
  let complete;
  const cache=createOverviewCache({bytes:8192,itemBytes:1024,chunkBytes:8},(blob,start,end)=>
    new Promise(resolve=>{complete=async()=>resolve(await blob.slice(start,end).arrayBuffer());}));
  const pending=cache.reserve('inflight',10,100,body),response=pending.response();pending.publish(10);
  const reader=response.body.getReader(),read=reader.read();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(cache.stats().reads,1);cache.clear();await reader.cancel();
  assert.equal(cache.stats().leases,0);assert.ok(cache.stats().bytes>0,'in-flight storage remains charged');
  await complete();await read;await new Promise(resolve=>setImmediate(resolve));
  assert.equal(cache.stats().reads,0);assert.equal(cache.stats().bytes,0);
});
test('concurrent hot responses reserve their own chunk buffers and bypass cache when the lease budget is full', async () => {
  const cache=createOverviewCache({bytes:2000,itemBytes:1000,entries:4,chunkBytes:8});
  await store(cache,'a');
  const first=cache.get('a',11);assert.ok(first);const response=first.response();first.publish(11);
  assert.equal(cache.get('a',11),null,'a second reader cannot allocate beyond the byte budget');
  assert.ok(cache.stats().bytes<=2000);assert.equal(cache.stats().leases,1);
  await response.body.cancel();assert.equal(cache.stats().leases,0);
  const resumed=cache.get('a',12);assert.ok(resumed);await resumed.abort();cache.clear();
  assert.equal(cache.stats().bytes,0);
});
test('one failed reader retires the entry without releasing another active response storage early', async () => {
  let calls=0;
  const cache=createOverviewCache({bytes:8192,itemBytes:1024,chunkBytes:8},async(blob,start,end)=>{
    if(++calls===1)throw new Error('Synthetic first-reader failure');
    return blob.slice(start,end).arrayBuffer();
  });
  const first=cache.reserve('shared',10,100,body),r1=first.response();first.publish(10);
  const second=cache.get('shared',11),r2=second.response();second.publish(11);
  await assert.rejects(r1.text(),/Synthetic first-reader failure/);
  assert.equal(cache.stats().resident,0);assert.equal(cache.stats().leases,1);assert.ok(cache.stats().bytes>0);
  assert.equal(await r2.text(),body);assert.equal(cache.stats().bytes,0);assert.equal(cache.stats().leases,0);
});
