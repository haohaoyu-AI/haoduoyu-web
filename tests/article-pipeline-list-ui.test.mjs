import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {frontendSource} from './frontend-client.mjs';

const source=await frontendSource();
function client() {
  const body={style:{}},nodes=new Map([['#overlay',{innerHTML:'',firstChild:null,contains(){return false;}}]]),requests=[];
  const document={querySelector:key=>nodes.get(key)||null,querySelectorAll:()=>[],addEventListener(){},body,activeElement:body};
  const context=vm.createContext({AbortController,AbortSignal,DOMException,Headers,document,
    window:{addEventListener(){}},location:{href:'http://localhost/?page=articles',search:'?page=articles'},
    history:{replaceState(){}},localStorage:{getItem(){},setItem(){}},URL,URLSearchParams,Intl,console,
    requestAnimationFrame(){},setTimeout,clearTimeout});
  new vm.Script(source).runInContext(context);
  const run=code=>vm.runInContext(code,context);
  context.capture=(path,options)=>{
    requests.push({path,options});
    if(path==='/article-reconciliation')return {complete:true,total:0,rows:[],
      counts:{drafting:0,illustrated:0,draft_saved:0,published:0,failed:0,unknown:0}};
    const query=new URL(path,'http://localhost').searchParams,page=Number(query.get('page')),page_size=Number(query.get('page_size'));
    return {data:[],meta:{total:0,unfiltered_total:0,page,page_size,offset:(page-1)*page_size,has_more:false}};
  };
  run("state.me={id:'synthetic-ledger-ui'};state.accounts=[{id:'account',name:'好多鱼',platform:'toutiao',active:1}];api=capture;");
  return {run,nodes,requests,context};
}

test('article list loads all lifecycle cohorts by default and preserves explicit-status scalar API filters',async()=>{
  for(const status of ['all','draft_saved']) {
    const app=client();
    app.run("state.filters={...defaultFilters(),slot:'tt1',writer:'dedao',has_warnings:'false',has_pending_verify:'true',series_no_min:'1',series_no_max:'200'};");
    if(status!=='all')app.run("state.filters.status='draft_saved'");
    const html=await app.run("renderArticles(runtime.renderVersion,{marker:'list-context'})");
    const pages=app.requests.filter(call=>call.path.startsWith('/articles?'));
    if(status==='all') {
      assert.equal(app.requests[0].path,'/article-reconciliation');
      assert.deepEqual(pages.map(call=>new URL(call.path,'http://localhost').searchParams.get('status')),
        ['drafting','illustrated','draft_saved','published','failed']);
      assert.ok(pages.every(call=>new URL(call.path,'http://localhost').searchParams.get('page_size')==='200'));
      assert.equal(app.run('state.articleMeta.pagination'),'client');
    }else {
      assert.equal(app.requests.length,1);
      const query=new URL(pages[0].path,'http://localhost').searchParams;
      for(const [key,value]of Object.entries({status:'draft_saved',slot:'tt1',writer:'dedao',has_warnings:'false',has_pending_verify:'true',
        series_no_min:'1',series_no_max:'200',page:'1',page_size:'20'}))assert.equal(query.get(key),value,key);
    }
    assert.ok(app.requests.every(call=>call.options.context.marker==='list-context'));
    assert.ok(pages.every(call=>call.options.envelope===true));
    assert.ok(app.requests.every(call=>!['all','unknown'].includes(new URL(call.path,'http://localhost').searchParams.get('status'))));
    assert.match(html,/尚未记录文章/);assert.doesNotMatch(html,/草稿无需|可先保存草稿/);
    const select=html.match(/<select name="status"[\s\S]*?<\/select>/)?.[0];
    assert.ok(select);assert.equal((select.match(/<option\b/g)||[]).length,7);assert.doesNotMatch(select,/value=""/);
    assert.match(select,new RegExp('<option value="'+status+'" selected>'));
  }
});

test('draft table escapes text, marks all reading values unpublished and derives topic only from an explicit slot',()=>{
  const app=client();
  app.run("state.columns=new Set(['status','slot','writer','char_count','image_count','draft_ref','total_duration','warnings','verify','topic','reads','likes','comments','as_of']);");
  app.run("syntheticDraft={id:'d',account_id:'account',platform:'toutiao',account_name:'<账号>',title:'<svg onload=bad>',status:'draft_saved',slot:null,writer:null,char_count:null,image_count:null,draft_ref:{editor_url:'javascript:bad'},warnings:[],has_pending_verify:null,verify_state:'unknown',latest_metrics:{reads:0,likes:0},topic:'entertainment'};");
  const html=app.run('articleTable([syntheticDraft])');
  assert.match(html,/&lt;svg onload=bad&gt;/);assert.match(html,/&lt;账号&gt;/);
  assert.doesNotMatch(html,/<svg\b[^>]*\bonload\s*=|href="javascript:|文娱（推断）/);
  assert.ok((html.match(/未发布/g)||[]).length>=4);assert.match(html,/未标注/);assert.match(html,/未确认|未知/);
  assert.doesNotMatch(html,/>0<\/strong>/,'a draft never turns a stored cumulative zero into a published reading metric');
  const menu=app.run('articleMenu(syntheticDraft)');assert.doesNotMatch(menu,/review-article|补充数据/);
});

test('published and legacy article metrics retain actual zeros while missing values remain unavailable',()=>{
  const app=client();app.run("state.columns=new Set(['reads','likes','comments','as_of']);");
  const html=app.run("articleTable([{id:'p',platform:'zhihu',title:'Published',account_name:'Account',latest_metrics:{reads:0,likes:0},published_at:'2026-10-24T00:00:00Z'}])");
  assert.ok((html.match(/>0<\/strong>/g)||[]).length>=2);assert.match(html,/未取得/);assert.doesNotMatch(html,/未发布/);
});

test('filter panel exposes exact status and metadata choices without an inferred topic or unsupported metadata sort',()=>{
  const app=client(),html=app.run('articleFilterPanel()');
  for(const field of ['status','slot','writer','has_warnings','has_pending_verify','series_no_min','series_no_max'])
    assert.ok(html.includes('name="'+field+'"'),field);
  for(const column of ['status','slot','writer','char_count','subheading_count','image_count','draft_ref','total_duration','warnings','verify'])
    assert.ok(html.includes('value="'+column+'"'),column);
  assert.doesNotMatch(html,/<select name="topic"|data-sort="(?:status|writer|slot|char_count|image_count)"/);
  const legacy=app.run("[...viewDraft({version:2,filters:{status:'published',writer:'human'},columns:['reads']}).columns].join(',')");
  assert.equal(legacy,'reads');assert.equal(app.run("viewDraft({version:2,filters:{status:'published'},columns:['status']}).filters.status"),'published');
});

test('new article form is a real draft with nullable publication fields and an active scoped snapshot ticket',async()=>{
  const app=client();await app.run('articleModal()');
  const html=app.nodes.get('#overlay').innerHTML;
  assert.match(html,/id="article-form"/);assert.match(html,/value="draft_saved" selected/);
  for(const field of ['status','slot','writer','illustrator','run_dir','run_date','series_no','char_count','subheading_count','image_count',
    'draft_pgc_id','draft_appmsgid','draft_editor_url','finished_at'])assert.ok(html.includes('name="'+field+'"'),field);
  assert.match(html,/流水线开始/);assert.match(html,/流水线结束/);assert.doesNotMatch(html,/选题开始时间/);
  const url=html.match(/<input[^>]*id="field-url"[^>]*>/)?.[0],published=html.match(/<input[^>]*id="field-published_at"[^>]*>/)?.[0];
  assert.ok(url&&published);assert.doesNotMatch(url,/\brequired\b/);assert.doesNotMatch(published,/\brequired\b/);
  assert.equal(app.run('runtime.articleFormRecord.record.status'),'draft_saved');
  assert.equal(app.run('runtime.articleFormRecord.sessionEpoch'),app.run('runtime.sessionEpoch'));
  assert.equal(app.run('runtime.articleFormRecord.ticket'),app.run('runtime.modalRequestVersion'));
});

test('obsolete article response cannot replace a newer page or its loaded rows',async()=>{
  const app=client();app.run("state.filters.status='draft_saved';let finishList;api=()=>new Promise(resolve=>finishList=resolve);state.articles=[{id:'newer'}];let obsolete=renderArticles();runtime.renderVersion++;");
  app.run("finishList({data:[{id:'old'}],meta:{total:1}})");
  assert.equal(await app.run('obsolete'),'');assert.equal(app.run('state.articles[0].id'),'newer');
});
