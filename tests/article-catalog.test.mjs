import test from 'node:test';
import assert from 'node:assert/strict';
import {loadArticleCatalog,paginateArticleCatalog,ledgerStatuses} from '../web/core/article-ledger-data.mjs';
import {state,runtime} from '../web/core/state.mjs';
import {api} from '../web/core/api.mjs';
import {articleIndexes,clearArticleIndexes} from '../web/core/session-index-state.mjs';

const article=(id,status,extra={})=>({id,account_id:'a',title:'合成 '+id,status,writer:null,slot:null,run_date:null,
  series_no:null,platform:'zhihu',production_mode:'unknown',url:null,summary:'',notes:'',published_at:null,
  latest_as_of:null,latest_metrics:null,duration_seconds:null,topic:'unknown',warnings:[],has_pending_verify:null,
  missing_metrics:[],snapshot_status:'not_applicable',date_status:'not_published',...extra});
function inventory(rows) {
  const counts=Object.fromEntries([...ledgerStatuses,'unknown'].map(status=>[status,0]));
  for(const row of rows)counts[ledgerStatuses.includes(row.status)?row.status:'unknown']++;
  return {complete:true,total:rows.length,counts,rows:rows.map(({id,account_id,title,status,slot,writer,run_date,series_no})=>
    ({id,account_id,title,status,slot,writer,run_date,series_no}))};
}
function service(rows,{alter}={}) {
  const calls=[];
  return {calls,async request(path,options) {
    calls.push({path,options});const url=new URL(path,'https://synthetic.invalid'),query=url.searchParams;
    let payload;
    if(url.pathname==='/article-reconciliation')payload=inventory(rows);
    else if(url.pathname==='/articles') {
      const status=query.get('status'),page=Number(query.get('page')),page_size=Number(query.get('page_size'));
      assert.ok(ledgerStatuses.includes(status));
      const cohort=rows.filter(row=>row.status===status&&(!query.has('account_id')||row.account_id===query.get('account_id')));
      const offset=(page-1)*page_size;
      payload={data:cohort.slice(offset,offset+page_size),meta:{total:cohort.length,page,page_size,offset,
        has_more:offset+page_size<cohort.length}};
    }else payload=rows.find(row=>row.id===decodeURIComponent(url.pathname.slice('/articles/'.length)));
    return alter?alter(payload,{path,url,query,options,count:calls.length}):payload;
  }};
}
const incomplete=error=>error.code==='LEDGER_INCOMPLETE';
const load=(rows,options={})=>{
  const mock=service(rows,options);return loadArticleCatalog({synthetic:true},{request:mock.request,...options}).then(value=>({value,mock}));
};

test('complete catalog includes 80 real records across five known statuses and explicit unknowns without default API exclusions',async()=>{
  const rows=Array.from({length:80},(_,index)=>article('row-'+index,index<75?ledgerStatuses[index%5]:null,
    {writer:index%3===0?'dedao':index%3===1?'human':null}));
  const before=structuredClone(rows),{value,mock}=await load(rows,{allowedAccountIds:['a']});
  assert.equal(value.complete,true);assert.equal(value.data.length,80);assert.equal(value.meta.total,80);
  assert.equal(value.meta.unfiltered_total,80);assert.equal(value.summary.total,80);
  assert.equal(value.summary.counts.unknown,5);assert.equal(value.summary.published,15);assert.equal(value.summary.unpublished,65);
  assert.equal(value.summary.consistency,'paged_not_atomic');assert.equal(value.summary.verified,true);
  assert.equal(value.summary.writers.reduce((sum,row)=>sum+row.total,0),80);
  assert.equal(value.reconciliation.total,80);assert.equal(value.reconciliation.counts.unknown,5);
  assert.deepEqual(value.reconciliation.schedule,{configured:false,expected:null,missing:null,overdue:null});
  assert.equal(value.requests,11);assert.equal(mock.calls.filter(call=>call.path==='/article-reconciliation').length,1);
  assert.deepEqual([...new Set(mock.calls.filter(call=>call.path.startsWith('/articles?'))
    .map(call=>new URL(call.path,'https://synthetic.invalid').searchParams.get('status')))],ledgerStatuses);
  assert.ok(value.data.every(row=>rows.includes(row)));assert.deepEqual(rows,before);
});

test('all pages are sorted globally before client pagination and stale page numbers clamp to the actual final page',async()=>{
  const rows=Array.from({length:450},(_,index)=>article('rank-'+index,index<425?'draft_saved':'published',
    {latest_metrics:{reads:index},published_at:index<425?null:'2026-10-24T00:00:00.000Z'}));
  const {value,mock}=await load(rows,{filters:{sort:'reads',order:'desc'}});
  assert.equal(value.requests,8);assert.equal(value.data[0],rows[449]);assert.equal(value.data.at(-1),rows[0]);
  assert.equal(value.data.at(-1).latest_metrics.reads,0);
  assert.equal(mock.calls.filter(call=>call.path.includes('status=draft_saved')).length,3);
  const page=paginateArticleCatalog(value,{page:999,pageSize:100});
  assert.equal(page.meta.page,5);assert.equal(page.meta.page_size,100);assert.equal(page.meta.offset,400);
  assert.equal(page.meta.pagination,'client');assert.equal(page.meta.has_more,false);assert.equal(page.meta.total,450);
  assert.equal(page.data.length,50);assert.equal(page.data[0],rows[49]);assert.equal(value.data.length,450);
  const empty=paginateArticleCatalog({...value,data:[],meta:{total:0,unfiltered_total:450}},{page:99});
  assert.equal(empty.meta.page,1);assert.deepEqual(empty.data,[]);
});

test('global sorting keeps nulls last in both directions and ties use publication descending then locale ID order',async()=>{
  const rows=[article('b','published',{latest_metrics:{reads:3},published_at:'2026-10-24T00:00:00.000Z'}),
    article('a','published',{latest_metrics:{reads:3},published_at:'2026-10-24T00:00:00.000Z'}),
    article('new','published',{latest_metrics:{reads:3},published_at:'2026-10-25T00:00:00.000Z'}),
    article('zero','draft_saved',{latest_metrics:{reads:0}}),article('missing','drafting'),article('null',null,{latest_metrics:{reads:null}})];
  const desc=(await load(rows,{filters:{sort:'reads',order:'desc'}})).value.data.map(row=>row.id);
  const asc=(await load(rows,{filters:{sort:'reads',order:'asc'}})).value.data.map(row=>row.id);
  assert.deepEqual(desc,['new','a','b','zero','missing','null']);
  assert.deepEqual(asc,['zero','new','a','b','missing','null']);
  for(const [sort,field]of [['likes','latest_metrics'],['comments','latest_metrics'],['approvals','latest_metrics'],
    ['duration','duration_seconds'],['latest_as_of','latest_as_of']]) {
    const sample=[article('absent','drafting'),article('zero','draft_saved',{[field]:field==='latest_metrics'?{[sort]:0}:0})];
    for(const order of ['asc','desc'])assert.equal((await load(sample,{filters:{sort,order}})).value.data[0].id,'zero');
  }
});

test('selected accounts verify the full authorized inventory but expose only their own rows, totals and reconciliation aggregates',async()=>{
  const rows=[article('a1','published',{slot:'gzh',series_no:1,run_date:'2026-10-24'}),
    article('a2',null,{slot:'gzh',series_no:3,run_date:'2026-10-25'}),
    article('b1','draft_saved',{account_id:'b',slot:'gzh',series_no:2,run_date:'2026-10-23'})];
  const {value,mock}=await load(rows,{accountId:'a',allowedAccountIds:new Set(['a','b']),filters:{status:'unknown'}});
  assert.deepEqual(value.data.map(row=>row.id),['a2']);assert.equal(value.meta.total,1);assert.equal(value.meta.unfiltered_total,2);
  assert.equal(value.summary.total,2);assert.equal(value.reconciliation.total,2);
  assert.deepEqual(value.reconciliation.dates,[{date:'2026-10-24',count:1},{date:'2026-10-25',count:1}]);
  assert.deepEqual(value.reconciliation.insurance.observed_gap_ranges,[{from:2,to:2}]);
  assert.ok(mock.calls.filter(call=>call.path.startsWith('/articles?')).every(call=>call.path.includes('account_id=a')));
  await assert.rejects(load(rows,{allowedAccountIds:['a']}),incomplete);
  await assert.rejects(load(rows,{accountId:'b',allowedAccountIds:['a']}),incomplete);
});

test('client filters retain literal SQLite ASCII search, all derived predicates and inclusive Beijing date bounds',async()=>{
  const rows=[article('a','published',{title:'Alpha%_!\\ Beta',summary:'Ä',platform:'zhihu',production_mode:'manual',
    topic:'entertainment',slot:'zh1',writer:'dedao',series_no:3,warnings:['known'],has_pending_verify:true,
    latest_metrics:{reads:0,likes:2},missing_metrics:['comments'],snapshot_status:'collected',date_status:'recorded',
    published_at:'2026-10-24T15:59:59.000Z'}),
  article('b','draft_saved',{title:'ALPHA plain',platform:'toutiao',production_mode:'automatic',topic:'insurance',
    slot:'tt1',writer:'gemini_web',series_no:4,has_pending_verify:false}),
  article('c','published',{writer:'human',series_no:8,missing_metrics:['reads','likes','comments'],
    snapshot_status:'not_collected',date_status:'unverified',published_at:'2026-10-24T16:00:00.000Z'}),
  article('d',null,{summary:'ä'}),article('e','published',{missing_metrics:['reads'],snapshot_status:'collected',
    latest_metrics:{likes:0,comments:0},has_pending_verify:false,published_at:'2026-10-25T15:59:59.000Z'}),
  article('f','published',{published_at:'2026-10-25T16:00:00.000Z'})];
  const cases=[
    [{q:' alpha%_!\\ '},['a']],[{q:'Ä'},['a']],[{q:'ä'},['d']],[{platform:'toutiao'},['b']],
    [{mode:'automatic'},['b']],[{topic:'entertainment'},['a']],[{slot:'zh1'},['a']],[{writer:'human'},['c']],
    [{has_warnings:'true'},['a']],[{has_pending_verify:'true'},['a']],[{has_pending_verify:'false'},['b','e']],
    [{series_no_min:'4',series_no_max:'8'},['b','c']],[{status:'unknown'},['d']],[{status:'all'},['a','b','c','d','e','f']],
    [{data_status:'zero_reads'},['a']],[{data_status:'no_snapshot'},['c']],[{data_status:'missing_likes'},['c']],
    [{data_status:'missing_reads'},['c','e']],[{data_status:'missing_comments'},['a','c']],
    [{data_status:'incomplete'},['a','c','e']],[{data_status:'date_unverified'},['c']],
    [{from:'2026-10-25',to:'2026-10-25'},['c','e']],
    [{from:'2026-10-24T16:00:00Z',to:'2026-10-25T15:59:59Z'},['c','e']],
    [{platform:'zhihu',writer:'dedao',has_warnings:'true',q:'alpha'},['a']],
  ];
  for(const [filters,ids]of cases) {
    const before=structuredClone(filters),{value,mock}=await load(rows,{filters});
    assert.deepEqual(value.data.map(row=>row.id).sort(),ids.sort(),JSON.stringify(filters));
    assert.equal(value.summary.total,6);assert.equal(value.meta.unfiltered_total,6);assert.deepEqual(filters,before);
    assert.ok(mock.calls.filter(call=>call.path.startsWith('/articles?')).every(call=>
      [...new URL(call.path,'https://synthetic.invalid').searchParams.keys()].every(key=>['status','page','page_size'].includes(key))));
  }
  for(const filters of [{status:'invalid'},{from:'2026-10-26',to:'2026-10-25'},{from:'2026-02-30'},
    {from:'2026-10-25T25:00:00Z'},{has_pending_verify:'yes'},{q:'   '},{series_no_min:'9',series_no_max:'8'}]) {
    await assert.rejects(load(rows,{filters}),error=>error.code==='VALIDATION_ERROR');
  }
});

test('incomplete, drifting, duplicate, wrong-status, wrong-scope and malformed inventories or pages never return partial data',async()=>{
  const rows=Array.from({length:201},(_,index)=>article('draft-'+index,'draft_saved'));
  const changes=[
    (payload,{path})=>path==='/article-reconciliation'?{...payload,complete:false}:payload,
    (payload,{path})=>path==='/article-reconciliation'?{...payload,total:202}:payload,
    (payload,{path})=>path==='/article-reconciliation'?{...payload,rows:[...payload.rows.slice(1),payload.rows[1]]}:payload,
    (payload,{path})=>path==='/article-reconciliation'?{...payload,rows:payload.rows.map((row,index)=>index?row:{...row,id:1})}:payload,
    (payload,{path})=>path==='/article-reconciliation'?{...payload,counts:{...payload.counts,draft_saved:202}}:payload,
    (payload,{query})=>query.get('status')==='draft_saved'&&query.get('page')==='2'?{...payload,meta:{...payload.meta,total:202}}:payload,
    (payload,{query})=>query.get('status')==='draft_saved'&&query.get('page')==='2'?{...payload,data:[rows[0]]}:payload,
    (payload,{query})=>query.get('status')==='draft_saved'?{...payload,data:payload.data.map(row=>({...row,status:'published'}))}:payload,
    (payload,{query})=>query.get('status')==='draft_saved'?{...payload,data:payload.data.map(row=>({...row,account_id:'forbidden'}))}:payload,
    (payload,{query})=>query.get('status')==='draft_saved'?{...payload,data:payload.data.map(row=>({...row,id:'not-in-inventory'}))}:payload,
    (payload,{query})=>query.get('status')==='draft_saved'?{...payload,data:[]}:payload,
    (payload,{query})=>query.get('status')==='draft_saved'?{...payload,meta:{...payload.meta,has_more:false}}:payload,
  ];
  for(const alter of changes)await assert.rejects(load(rows,{alter,allowedAccountIds:['a']}),incomplete);
  for(const altered of [{id:'wrong'}, {account_id:'wrong'}, {status:'published'}]) {
    await assert.rejects(load([article('unknown',null)],{alter:(payload,{path})=>path.startsWith('/articles/unknown')?
      {...payload,...altered}:payload}),incomplete);
  }
  await assert.rejects(load([article('unknown',null)],{alter:(payload,{path})=>path==='/article-reconciliation'?
    {...payload,rows:[{...payload.rows[0],status:undefined}]}:payload}),incomplete);
});

test('inventory, selected-account and total HTTP bounds fail explicitly, with the exact 100-request boundary still complete',async()=>{
  for(const rows of [Array.from({length:4001},(_,index)=>article('row-'+index,'published',{account_id:index%2?'a':'b'})),
    Array.from({length:2001},(_,index)=>article('row-'+index,'published')),
    Array.from({length:95},(_,index)=>article('unknown-'+index,null))]) {
    const mock=service(rows);
    await assert.rejects(loadArticleCatalog(null,{request:mock.request}),incomplete);assert.ok(mock.calls.length<=100);
  }
  const rows=Array.from({length:94},(_,index)=>article('unknown-'+index,null));
  const {value}=await load(rows);assert.equal(value.requests,100);assert.equal(value.data.length,94);
  const encoded=await load([article('unknown /?#',null)]);
  assert.ok(encoded.mock.calls.some(call=>call.path==='/articles/unknown%20%2F%3F%23'));
});

test('aborted contexts, changed sessions, identity and write generations discard late responses before any data is exposed',async()=>{
  const previous={me:state.me,epoch:runtime.sessionEpoch,generation:runtime.articleIndexGeneration};
  try {
    const controller=new AbortController();controller.abort();let calls=0;
    await assert.rejects(loadArticleCatalog({controller},{request:async()=>{calls++;return inventory([]);}}),{name:'AbortError'});
    assert.equal(calls,0);
    for(const change of [()=>runtime.sessionEpoch++,()=>runtime.articleIndexGeneration++,()=>{state.me={id:randomIdentity()};}]) {
      const mock=service([article('a','published')],{alter:payload=>{change();return payload;}});
      await assert.rejects(loadArticleCatalog({synthetic:true},{request:mock.request}),{name:'AbortError'});
      assert.equal(mock.calls.length,1);
    }
    let finish;
    const late=new AbortController(),pending=loadArticleCatalog({controller:late},{request:()=>new Promise(resolve=>finish=resolve)});
    late.abort();finish(inventory([]));await assert.rejects(pending,{name:'AbortError'});
    const failure=new Error('network failure');
    await assert.rejects(loadArticleCatalog(null,{request:async()=>{throw failure;}}),error=>error===failure);
  }finally {state.me=previous.me;runtime.sessionEpoch=previous.epoch;runtime.articleIndexGeneration=previous.generation;}
});
function randomIdentity(){return 'changed-'+Math.random();}

const cacheContext=()=>({controller:new AbortController(),pending:new Map(),kind:'catalog-test'});
function defaultApi(t,rows,{transport}={}) {
  const before={fetch:globalThis.fetch,now:Date.now,me:state.me,epoch:runtime.sessionEpoch,
    generation:runtime.articleIndexGeneration,entries:[...articleIndexes]};
  const mock=service(rows);let clock=1000000;
  state.me={id:'catalog-cache-owner'};runtime.sessionEpoch++;runtime.articleIndexGeneration++;articleIndexes.clear();
  Date.now=()=>clock;
  async function respond(path,options={}) {
    if(options.method==='POST')return Response.json({data:{id:'written'}});
    const payload=await mock.request(path,options);
    return Response.json(path.startsWith('/articles?')?payload:{data:payload});
  }
  globalThis.fetch=(input,options={})=>{
    const path=String(input).slice('/api/v1'.length);
    return transport?transport(path,options,respond):respond(path,options);
  };
  t.after(()=>{
    globalThis.fetch=before.fetch;Date.now=before.now;state.me=before.me;runtime.sessionEpoch=before.epoch;
    runtime.articleIndexGeneration=before.generation;articleIndexes.clear();
    for(const [key,value]of before.entries)articleIndexes.set(key,value);
  });
  return {mock,advance(milliseconds){clock+=milliseconds;},load(options={}){
    return loadArticleCatalog(cacheContext(),{allowedAccountIds:['a'],...options});
  }};
}
const cachedCatalogs=()=>[...articleIndexes.values()].filter(value=>value?.kind==='article-catalog');

test('completed default API catalogs cache for ten seconds while every current filter and page uses the full original set',async t=>{
  const rows=[article('draft','draft_saved'),article('zero','published',{latest_metrics:{reads:0}}),article('unknown',null)];
  const backend=defaultApi(t,rows),first=await backend.load();
  assert.equal(first.requests,7);assert.equal(backend.mock.calls.length,7);assert.equal(cachedCatalogs().length,1);
  assert.equal(cachedCatalogs()[0].catalog.meta.total,3);
  const filtered=await backend.load({filters:{status:'unknown'}});
  assert.equal(filtered.requests,0);assert.deepEqual(filtered.data.map(row=>row.id),['unknown']);
  assert.equal(filtered.meta.unfiltered_total,3);assert.equal(filtered.summary.total,3);
  const sorted=await backend.load({filters:{sort:'reads',order:'asc'}}),page=paginateArticleCatalog(sorted,{page:2,pageSize:1});
  assert.equal(sorted.requests,0);assert.equal(sorted.data[0].id,'zero');assert.equal(page.data.length,1);
  assert.equal(backend.mock.calls.length,7);
  const cancelled=cacheContext();cancelled.controller.abort();
  await assert.rejects(loadArticleCatalog(cancelled,{allowedAccountIds:['a']}),{name:'AbortError'});
  assert.equal(backend.mock.calls.length,7);
  backend.advance(9999);assert.equal((await backend.load()).requests,0);
  rows.push(article('new','drafting'));backend.advance(1);
  const fresh=await backend.load();assert.equal(fresh.requests,7);assert.equal(fresh.summary.total,4);
  assert.equal(backend.mock.calls.length,14);
  const custom=service(rows);await loadArticleCatalog(null,{request:custom.request});await loadArticleCatalog(null,{request:custom.request});
  assert.equal(custom.calls.length,14,'custom transports remain uncached');
});

test('catalog cache keys isolate identity, session, selected account and canonical allowed scope; writes and refresh invalidate it',async t=>{
  const backend=defaultApi(t,[article('only-a','draft_saved')]);
  const first=await backend.load({allowedAccountIds:['b','a']});assert.equal(first.requests,6);
  assert.equal((await backend.load({allowedAccountIds:['a','b']})).requests,0);
  assert.equal((await backend.load({allowedAccountIds:['a']})).requests,6);
  assert.equal((await backend.load({accountId:'a',allowedAccountIds:['a']})).requests,6);
  state.me={id:'different-catalog-owner'};assert.equal((await backend.load()).requests,6);
  runtime.sessionEpoch++;assert.equal((await backend.load()).requests,6);
  runtime.articleIndexGeneration++;assert.equal((await backend.load()).requests,6);
  assert.equal((await backend.load()).requests,0);
  clearArticleIndexes();assert.equal(cachedCatalogs().length,0);assert.equal((await backend.load()).requests,6);
  await api('/articles',{method:'POST',body:{title:'synthetic write'}});
  assert.equal(cachedCatalogs().length,0);assert.equal((await backend.load()).requests,6);
});

test('in-flight catalogs are never shared between contexts and aborted late results never become reusable cache entries',async t=>{
  const rows=[article('one','draft_saved')],waiting=[];
  const backend=defaultApi(t,rows,{transport(path,options,respond){
    if(path==='/article-reconciliation'&&waiting.length<2)return new Promise(resolve=>waiting.push(()=>respond(path,options).then(resolve)));
    return respond(path,options);
  }});
  const oldContext=cacheContext(),newContext=cacheContext();
  const first=loadArticleCatalog(oldContext,{allowedAccountIds:['a']});
  const rejected=assert.rejects(first,{name:'AbortError'});
  const second=loadArticleCatalog(newContext,{allowedAccountIds:['a']});
  assert.equal(waiting.length,2);assert.equal(cachedCatalogs().length,0);
  oldContext.controller.abort();await rejected;
  waiting[1]();const current=await second;
  assert.equal(current.requests,6);assert.equal(cachedCatalogs().length,1);
  const entry=cachedCatalogs()[0];waiting[0]();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(cachedCatalogs()[0],entry);
  assert.equal((await backend.load()).requests,0);
  clearArticleIndexes();
  let finish,lastRequested;
  const atLast=new Promise(resolve=>lastRequested=resolve),ordinary=globalThis.fetch;
  globalThis.fetch=(path,options)=>String(path).includes('status=failed')?new Promise(resolve=>{finish=()=>ordinary(path,options).then(resolve);lastRequested();}):
    ordinary(path,options);
  const late=loadArticleCatalog(cacheContext(),{allowedAccountIds:['a']});
  await atLast;runtime.articleIndexGeneration++;finish();
  await assert.rejects(late,{name:'AbortError'});assert.equal(cachedCatalogs().length,0);
  globalThis.fetch=ordinary;assert.equal((await backend.load()).requests,6);
});

test('cache retains at most eight completed catalogs and sweeps expired entries without evicting unrelated article indexes',async t=>{
  const backend=defaultApi(t,[article('one','draft_saved')]),unrelated=Promise.resolve([]);
  articleIndexes.set('unrelated-index',unrelated);
  for(let index=0;index<9;index++)await backend.load({allowedAccountIds:['a','extra-'+index]});
  assert.equal(cachedCatalogs().length,8);assert.equal(articleIndexes.get('unrelated-index'),unrelated);
  assert.equal((await backend.load({allowedAccountIds:['a','extra-0']})).requests,6,'oldest catalog was evicted');
  assert.equal(cachedCatalogs().length,8);assert.equal(articleIndexes.get('unrelated-index'),unrelated);
  backend.advance(10000);await backend.load();
  assert.equal(cachedCatalogs().length,1);assert.equal(articleIndexes.get('unrelated-index'),unrelated);
});
