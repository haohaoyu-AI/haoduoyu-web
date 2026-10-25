import {frontendSource} from './frontend-client.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await frontendSource();
function client(search=''){
 const handlers={},windowHandlers={},nodes=new Map([['#app',{innerHTML:''}],['#overlay',{innerHTML:'',firstChild:null}]]),memory=new Map(),requests=[];
 const location={href:'http://localhost/'+search,search};
 const document={querySelector:q=>nodes.get(q)||null,querySelectorAll:()=>[],addEventListener:(key,fn)=>handlers[key]=fn,body:{style:{}},activeElement:null};
 const ctx=vm.createContext({AbortController, AbortSignal, DOMException, Headers,document,window:{addEventListener:(key,fn)=>windowHandlers[key]=fn},location,history:{replaceState:(_,__,url)=>{location.href=String(url);location.search=new URL(url).search}},localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)},URL,URLSearchParams,Intl,console,requestAnimationFrame(){},setTimeout,clearTimeout,
 fetch:async(path,options)=>{requests.push({path,options});return Response.json({data:[{id:'a'}],meta:{total:9}});}});
 new vm.Script(source).runInContext(ctx);
 const run=script=>vm.runInContext(script,ctx);
 run("state.accounts=[{id:'account',name:'好多鱼',platform:'zhihu'}]");
 return {run,handlers,windowHandlers,ctx,location,memory,requests,nodes};
}
test('client route roundtrip restores every filter, columns, sort, page, top settings and account',()=>{
 const app=client('?page=articles&period=30d&account=account&q=%E7%94%B2%26%E4%B9%99&platform=zhihu&topic=entertainment&from=2026-01-01&to=2026-12-31&mode=manual&group=account&data_status=missing_comments&sort=comments&order=asc&list_page=3&page_size=10&top_n=20&top_platform=wechat&columns=reads,comments,as_of');
 app.run('readRoute();updateRoute()');const before=app.run('JSON.stringify({filters:state.filters,columns:[...state.columns],listPage:state.listPage,pageSize:state.pageSize,account:state.account,period:state.overviewPeriod,topN:state.topN,topPlatform:state.topPlatform})');
 assert.equal(app.run('state.filters.q'),'甲&乙');assert.equal(app.run('state.listPage'),3);assert.equal(app.run('state.overviewPeriod'),'30d');app.run('state.filters=defaultFilters();state.columns.clear();state.account="";readRoute()');assert.equal(app.run('JSON.stringify({filters:state.filters,columns:[...state.columns],listPage:state.listPage,pageSize:state.pageSize,account:state.account,period:state.overviewPeriod,topN:state.topN,topPlatform:state.topPlatform})'),before);
});
test('client routes reject invalid enums and page controls, URL without account means all accounts',()=>{
 const app=client('?page=articles&period=bad&sort=evil&platform=bad&list_page=-1&page_size=900&top_n=NaN');app.memory.set('haoduoyu.account','account');app.run('readRoute()');assert.equal(app.run('state.account'),'');assert.equal(app.run('state.filters.sort'),'published_at');assert.equal(app.run('state.pageSize'),20);assert.equal(app.run('state.listPage'),1);assert.equal(app.run('state.topN'),5);assert.equal(app.run('state.overviewPeriod'),'yesterday');
});
test('api keeps legacy data return and exposes envelope metadata only when opted in',async()=>{
 const app=client();const a=await app.run("api('/articles')"),b=await app.run("api('/articles?page=1',{envelope:true})");assert.equal(a[0].id,'a');assert.equal(b.meta.total,9);assert.equal(b.data[0].id,'a');assert.ok(app.requests.every(r=>!Object.hasOwn(r.options,'envelope')));
});
test('old saved views migrate metrics into an unapplied draft, version2 preserves hidden columns',()=>{
 const app=client('?page=articles');app.run("state.page='articles';state.savedViews=[{id:'old',name:'旧视图',filters:{q:'旧词',platform:'zhihu',data_status:'missing_reads',sort:'reads',order:'asc',group:'mode'},columns:['reads','published']}];");
 app.nodes.set('#filter-panel',{outerHTML:''});app.nodes.set('#filter-panel select',{focus(){}});
 app.handlers.change({target:{id:'filter-view',value:'old',closest:()=>null}});
 assert.equal(app.run('state.filters.q'),'');assert.equal(app.location.search,'?page=articles');assert.equal(app.requests.length,0);
 assert.match(app.nodes.get('#filter-panel').outerHTML,/name="q" value="旧词"/);assert.match(app.nodes.get('#filter-panel').outerHTML,/name="platform" value="zhihu"/);
 assert.ok(app.run("['likes','comments','as_of'].every(key=>viewDraft(state.savedViews[0]).columns.has(key))"));
 assert.equal(app.run("[...viewDraft({version:2,filters:{},columns:['reads']}).columns].join(',')"),'reads');
});
test('new cumulative and article UI escape titles and distinguish genuine zeros from missing metrics',()=>{
 const app=client();app.run("state.filters.status='published';state.columns=new Set(['reads','likes','comments','as_of']);fixtureArticle={id:'a',status:'published',platform:'zhihu',account_name:'<b>bad</b>',title:'<img src=x onerror=1>',url:'javascript:bad',latest_metrics:{reads:0,likes:0},latest_as_of:null};");
 const html=app.run('articleTable([fixtureArticle])');assert.ok(html.includes('&lt;img'));assert.doesNotMatch(html,/<img\b/);assert.doesNotMatch(html,/href="javascript:/);assert.ok(html.includes('未取得'));assert.ok(html.includes('>0</strong>'));assert.ok(app.run("dashboardMetric({latest_metrics:null},'reads')").includes('未采集'));
});
test('single-snapshot detail shows no growth; all-zero daily values remain visible rather than missing',()=>{
 const app=client();const one=app.run("renderArticleAnalytics({status:'published',platform:'zhihu',latest_metrics:{reads:0},timeline:[{id:'a',kind:'latest',metrics:{reads:0},changes:null}],nodes:[]})");assert.match(one,/只有一期数据/);assert.doesNotMatch(one,/snapshot-changes/);
 const trend=app.run("renderTrend({accounts:[{id:'a',name:'合成',platform:'toutiao'}],trend:[{date:'2026-10-15',accounts:[{account_id:'a',metrics:{reads:0}}]}]})");assert.match(trend,/数据不足/);assert.match(trend,/：0 阅读/);assert.doesNotMatch(trend,/：未取得/);
});

test('search blur change cannot reenter rendering while the debounce removes its focused input',()=>{
 const app=client();app.run("let reloads=0;reloadFilteredPage=()=>reloads++;state.filters.q='输入中的搜索'");
 app.handlers.change({target:{id:'',name:'q',value:'输入中的搜索',closest:()=>true}});assert.equal(app.run('reloads'),0);
 app.handlers.change({target:{id:'',name:'data_status',value:'zero_reads',closest:()=>true}});assert.equal(app.run('reloads'),1);assert.equal(app.run('state.filters.data_status'),'zero_reads');
});
