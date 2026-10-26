import test from 'node:test';
import assert from 'node:assert/strict';
import {state,runtime} from '../web/core/state.mjs';
import {defaultColumns,defaultFilters} from '../web/core/constants.mjs';
import {normalizeArticlePipelineFilters,readRoute,updateRoute} from '../web/core/router.mjs';
import {articleDraft,articleFilterPanel,articleModal,renderArticles,viewDraft} from '../web/pages/articles.mjs';

const statuses=['drafting','illustrated','draft_saved','published','failed'];
const accounts=[{id:'account-a',platform:'zhihu',name:'合成甲账号',active:1},
  {id:'account-b',platform:'toutiao',name:'合成乙账号',active:1}];
function fixtures() {
  return Array.from({length:80},(_,index)=>{
    const status=index<75?statuses[index%5]:null,published=status==='published';
    return {id:'synthetic-'+String(index).padStart(3,'0'),account_id:index%2?'account-a':'account-b',
      account_name:index%2?'合成甲账号':'合成乙账号',platform:index%2?'zhihu':'toutiao',title:'Published sample '+index,
      status,writer:null,slot:null,run_date:'2026-10-25',version:1,
      published_at:published?new Date(Date.parse('2026-10-25T00:00:00Z')+index*60000).toISOString():null,
      created_at:'2026-10-25T00:00:00.000Z',updated_at:'2026-10-25T00:00:00.000Z',
      production_mode:'manual',duration_seconds:null,summary:'',notes:'',warnings:[],missing_metrics:[],
      latest_metrics:published?index===3?{reads:0,likes:0,comments:0}:index===8?null:{reads:index,likes:0,comments:0}:null,
      latest_as_of:published?'2026-10-25T02:00:00.000Z':null};
  });
}
function freeze(value) {
  if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}
  return value;
}
function publishedPage(rows,query) {
  const unfiltered=rows.filter(row=>row.status==='published'&&(!query.get('account_id')||row.account_id===query.get('account_id')));
  const cohort=unfiltered.filter(row=>(!query.get('q')||[row.title,row.url,row.summary,row.notes].some(value=>
    typeof value==='string'&&value.toLowerCase().includes(query.get('q').toLowerCase())))&&
    (!query.get('platform')||row.platform===query.get('platform'))&&(!query.get('mode')||row.production_mode===query.get('mode')));
  const sort=query.get('sort')||'published_at',order=query.get('order')==='asc'?1:-1;
  cohort.sort((a,b)=>{
    const left=sort==='reads'?a.latest_metrics?.reads??null:a.published_at,right=sort==='reads'?b.latest_metrics?.reads??null:b.published_at;
    if(left===null&&right!==null)return 1;if(right===null&&left!==null)return -1;
    return (left===right?0:left>right?1:-1)*order||String(b.published_at).localeCompare(String(a.published_at))||a.id.localeCompare(b.id);
  });
  const page=Number(query.get('page')),page_size=Number(query.get('page_size')),offset=(page-1)*page_size;
  return {data:cohort.slice(offset,offset+page_size),meta:{total:cohort.length,unfiltered_total:unfiltered.length,
    page,page_size,offset,has_more:offset+page_size<cohort.length,pagination:'offset'}};
}
function globals(t,values) {
  const prior=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value]of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  t.after(()=>{for(const [key,descriptor]of prior)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
}
function setup(t,{detail=false}={}) {
  const before=structuredClone(state),runtimeBefore={...runtime},runtimeKeys=new Set(Object.keys(runtime));
  const rows=freeze(fixtures()),snapshot=structuredClone(rows),calls=[];
  Object.assign(state,{me:{id:'published-round6-owner'},accounts:structuredClone(accounts),account:'',filters:defaultFilters(),
    columns:new Set(defaultColumns),pageSize:100,listPage:1,articles:[],savedViews:[]});
  runtime.activePopover=null;
  globals(t,{fetch:async input=>{
    const url=new URL(input,'http://localhost');calls.push(url);
    if(detail&&url.pathname.startsWith('/api/v1/articles/')){
      return Response.json({data:rows.find(row=>row.id===decodeURIComponent(url.pathname.split('/').at(-1)))});
    }
    assert.equal(url.pathname,'/api/v1/articles','list must not fetch reconciliation, catalogs or article details');
    assert.equal(url.searchParams.get('status'),'published');
    return Response.json(publishedPage(rows,url.searchParams));
  }});
  t.after(()=>{
    assert.deepEqual(rows,snapshot,'all eighty original records and lifecycle states remain intact');
    Object.assign(state,before);for(const key of Object.keys(runtime))if(!runtimeKeys.has(key))delete runtime[key];
    Object.assign(runtime,runtimeBefore);
  });
  return {rows,calls};
}

test('published list reads once, preserves all eighty mixed records, and displays genuine zero separately from missing metrics',async t=>{
  const {rows,calls}=setup(t),html=await renderArticles(runtime.renderVersion);
  assert.equal(rows.length,80);assert.equal(rows.filter(row=>row.status===null).length,5);
  assert.equal(calls.length,1);assert.equal(state.articleMeta.total,15);assert.equal(state.articleMeta.unfiltered_total,15);
  assert.equal(state.articles.length,15);assert.ok(state.articles.every(row=>row.status==='published'));
  assert.equal(state.articles.find(row=>row.id==='synthetic-003').latest_metrics.reads,0);
  assert.equal(state.articles.find(row=>row.id==='synthetic-008').latest_metrics,null);
  assert.match(html,/>0<\/strong>/);assert.match(html,/未采集|未取得|missing-value/);
  assert.deepEqual(defaultColumns,['account','reads','likes','comments','as_of']);
  assert.equal(defaultFilters().status,'published');assert.equal(calls[0].searchParams.has('account_id'),false);
});

test('old all, unknown and draft filters always issue one published account-scoped query with server pagination and global ordering',async t=>{
  const {rows,calls}=setup(t);state.account='account-a';state.listPage=2;state.pageSize=3;
  for(const legacy of ['all','unknown','draft_saved','failed','drafting','illustrated','']) {
    state.filters={...defaultFilters(),status:legacy,q:'Published',platform:'zhihu',mode:'manual',sort:'reads',order:'desc'};
    const previous=calls.length;await renderArticles(runtime.renderVersion);
    assert.equal(calls.length,previous+1);assert.equal(state.filters.status,'published');
    const query=calls.at(-1).searchParams;
    for(const [key,value]of Object.entries({status:'published',account_id:'account-a',q:'Published',platform:'zhihu',
      mode:'manual',sort:'reads',order:'desc',page:'2',page_size:'3'}))assert.equal(query.get(key),value,key);
    assert.equal(state.articleMeta.total,8);assert.equal(state.articleMeta.page,2);assert.equal(state.articleMeta.has_more,true);
    assert.deepEqual(state.articles.map(row=>row.id),['synthetic-043','synthetic-033','synthetic-023']);
    assert.ok(state.articles.every(row=>row.account_id==='account-a'&&row.status==='published'));
  }
  assert.equal(rows.filter(row=>row.status==='published').length,15);
});

test('legacy routes, saved views and filter drafts canonicalize status to published without losing unrelated selections',t=>{
  setup(t);const location={href:'http://localhost/?page=articles',search:'?page=articles'},historyCalls=[];
  const locate=value=>{location.href=String(value);location.search=new URL(value).search;};
  globals(t,{location,history:{replaceState(_data,_title,url){historyCalls.push(String(url));locate(url);},
    pushState(_data,_title,url){historyCalls.push(String(url));locate(url);}},
  FormData:class {constructor(form){this.values=new URLSearchParams(form.values);}get(key){return this.values.get(key);}
    getAll(key){return this.values.getAll(key);}}});
  for(const status of ['all','unknown','draft_saved','failed','published']) {
    locate('http://localhost/?'+new URLSearchParams({page:'articles',status,account:'account-a',q:'literal%_text',sort:'reads',
      order:'asc',list_page:'2',page_size:'10',columns:'status,reads'}));
    readRoute();assert.equal(state.filters.status,'published');assert.equal(state.account,'account-a');
    updateRoute();const query=new URL(location.href).searchParams;
    assert.equal(query.has('status'),false);assert.equal(query.get('q'),'literal%_text');assert.equal(query.get('account'),'account-a');
    assert.equal(query.get('list_page'),'2');assert.equal(query.get('columns'),'status,reads');
    const view=freeze({version:2,filters:{...defaultFilters(),status,writer:'human'},columns:['status','reads']}),snapshot=structuredClone(view);
    assert.equal(viewDraft(view).filters.status,'published');assert.equal(viewDraft(view).filters.writer,'human');assert.deepEqual(view,snapshot);
    state.filters={...defaultFilters(),status};
    const draft=articleDraft({values:new URLSearchParams({status,account:'account-a',writer:'human',sort:'reads',order:'asc',columns:'status'})});
    assert.equal(draft.filters.status,'published');assert.equal(draft.filters.writer,'human');assert.equal(draft.account,'account-a');
    assert.deepEqual([...draft.columns],['status']);
    assert.equal(normalizeArticlePipelineFilters({...defaultFilters(),status}).status,'published');
  }
  assert.equal(historyCalls.length,5);
});

test('list and advanced filters omit lifecycle dropdowns while the status field and concrete draft editor remain available',async t=>{
  const {calls}=setup(t,{detail:true}),html=await renderArticles(runtime.renderVersion),panel=articleFilterPanel();
  for(const content of [html,panel])assert.doesNotMatch(content,/<select\b[^>]*\bname="status"/);
  assert.match(panel,/name="columns"\s+value="status"/);
  const overlay={innerHTML:'',contains(){return false;}},body={style:{}},document={body,activeElement:body,
    querySelector(selector){return selector==='#overlay'?overlay:null;}};
  globals(t,{document,requestAnimationFrame(){}});
  await articleModal('synthetic-002');
  assert.match(overlay.innerHTML,/<select\b[^>]*\bname="status"|<select\b[^>]*name="status"/);
  assert.match(overlay.innerHTML,/<option value="draft_saved" selected>草稿已存<\/option>/);
  assert.equal(runtime.articleFormRecord.record.status,'draft_saved');
  assert.equal(calls.filter(url=>url.pathname==='/api/v1/articles').length,1);
  assert.equal(calls.filter(url=>url.pathname==='/api/v1/articles/synthetic-002').length,1);
});

test('late responses after render, session or selected-account changes never replace the current article page',async t=>{
  const {rows}=setup(t);
  for(const change of [()=>runtime.renderVersion++,()=>runtime.sessionEpoch++,()=>{state.account='account-b';}]) {
    let finish;const current=[{id:'current-visible-record'}],meta={total:99};
    state.account='account-a';state.articles=current;state.articleMeta=meta;
    globalThis.fetch=()=>new Promise(resolve=>finish=resolve);
    const pending=renderArticles(runtime.renderVersion);change();
    finish(Response.json({data:[rows[0]],meta:{total:1,unfiltered_total:1,has_more:false}}));
    assert.equal(await pending,'');assert.equal(state.articles,current);assert.equal(state.articleMeta,meta);
  }
});

test('malformed, nonpublished or out-of-scope responses fail clearly without exposing a partial list',async t=>{
  const {rows}=setup(t),published=rows.find(row=>row.status==='published'),current=[{id:'current-visible-record'}];
  state.account='account-a';
  for(const data of [null,[rows[0]],[{...published,status:null}],[{...published,account_id:'not-authorized'}],
    [{...published,account_id:'account-b'}]]) {
    state.articles=current;globalThis.fetch=async()=>Response.json({data,meta:{total:1,unfiltered_total:1,has_more:false}});
    await assert.rejects(renderArticles(runtime.renderVersion),error=>error.code==='ARTICLE_PAGE_INCOMPLETE');
    assert.equal(state.articles,current);
  }
});
