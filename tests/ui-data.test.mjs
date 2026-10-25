import {frontendSource} from './frontend-client.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source = await frontendSource();
function client(){
 const body={style:{}},nodes=new Map([['#overlay',{innerHTML:'',firstChild:null,contains(){return false}}]]);
 const document={querySelector:s=>nodes.get(s)||null,querySelectorAll:()=>[],addEventListener(){},body,activeElement:body};
 const context=vm.createContext({AbortController, AbortSignal, DOMException, Headers,structuredClone,document,window:{addEventListener(){}},location:{href:'http://localhost/',search:''},history:{replaceState(){}},URL,URLSearchParams,Intl,localStorage:{getItem(){}},requestAnimationFrame(){},setTimeout,clearTimeout});
 new vm.Script(source).runInContext(context);vm.runInContext("state.me={id:'synthetic-ui-user'}",context);return {run:s=>vm.runInContext(s,context),nodes,document,context};
}
test('data table hides only wholly missing metrics; zeros and likes/approvals remain separate',async()=>{
 const c=client();c.run(`state.accounts=[{id:'a',name:'<甲>',platform:'zhihu'},{id:'b',name:'乙',platform:'toutiao'}];
 state.filters.platform='zhihu';state.reviewTab='observations';
 api=async path=>path.startsWith('/articles')?[{id:'one',account_id:'a',title:'<img>'},{id:'two',account_id:'b',title:'乙'}]:path.startsWith('/due-reviews')?[]:[{id:'x',article_id:'one',kind:'latest',metrics:{reads:0,likes:0,approvals:4},source:'本地'},{id:'y',article_id:'one',kind:'d1',metrics:{reads:5,approvals:0}},{id:'z',article_id:'two',kind:'latest',metrics:{impressions:8}}]`);
 const html=await c.run('renderReviews()');assert.doesNotMatch(html,/<th>展现/);assert.match(html,/<th>阅读/);assert.match(html,/<th>点赞（likes）/);assert.match(html,/<th>赞同（approvals）/);assert.match(html,/data-label="点赞（likes）">0<\/td>/);assert.match(html,/未取得/);assert.match(html,/&lt;img&gt;/);assert.match(html,/&lt;甲&gt;/);assert.equal(c.run('state.reviewRecords.length'),2);
 c.run("clearArticleIndexes();state.reviewTab='daily';api=async path=>path.startsWith('/articles')?[]:path.startsWith('/due-reviews')?[]:[{id:'d',account_id:'a',date:'2026-10-20',metrics:{impressions:0}}]");
 const daily=await c.run('renderReviews()');assert.match(daily,/<th>展现/);assert.doesNotMatch(daily,/<th>阅读/);assert.match(daily,/data-label="展现">0<\/td>/);
});
test('data due scope and a stale response do not leak another platform or overwrite newer state',async()=>{
 const c=client();c.run(`state.accounts=[{id:'a',name:'甲',platform:'zhihu'},{id:'b',name:'乙',platform:'toutiao'}];state.filters.platform='zhihu';state.reviewTab='pending';api=async path=>path.startsWith('/articles')?[]:[{id:'one',account_id:'a',title:'甲待办',due_kind:'d1'},{id:'two',account_id:'b',title:'乙待办',due_kind:'d3'}]`);
 const html=await c.run('renderReviews()');assert.match(html,/待办 1/);assert.match(html,/甲待办/);assert.doesNotMatch(html,/乙待办/);
 c.run("clearArticleIndexes();let finish;state.articles=[{id:'newer'}];state.reviewArticles=[{id:'newer-review'}];api=path=>path.startsWith('/articles')?new Promise(resolve=>finish=resolve):Promise.resolve([]);let old=renderReviews();renderVersion++;finish([{id:'obsolete'}])");assert.equal(await c.run('old'),'');assert.equal(c.run('state.articles[0].id'),'newer');
});
test('detail keeps unknown date nodes neutral, zero/missing/approvals distinct and reasons in popovers',()=>{
 const c=client();c.run(`sample={status:'published',date_status:'unverified',latest_metrics:{reads:0,likes:0,approvals:4},nodes:['d1','d3','d7','latest'].map(kind=>({kind,status:'not_collected',snapshot:null,due_at:null})),timeline:[{id:'s',kind:'latest',as_of:'2026-10-17T00:00:00Z',metrics:{reads:12,likes:0,approvals:4},changes:{reads:{delta:12,percent:null,comparable:true,reason:'前期为真实零，增幅无定义'},likes:{delta:0,percent:null,comparable:true,reason:'前期为真实零'},approvals:{delta:-2,percent:-33,comparable:true,reason:'相邻快照'}}}]}`);
 const html=c.run('renderArticleAnalytics(sample)');assert.equal((html.match(/class="node unknown"/g)||[]).length,3);assert.equal((html.match(/class="stat"/g)||[]).length,4);assert.match(html,/>0<\/strong>/);assert.match(html,/未取得/);assert.match(html,/data-reason="前期为真实零，增幅无定义"/);assert.match(html,/comparison down/);assert.doesNotMatch(html,/<p[^>]*>[^<]*增幅无定义/);
 c.run('sample.latest_metrics=null');const empty=c.run('metricSummary(sample)');assert.equal((empty.match(/未采集/g)||[]).length,6);assert.doesNotMatch(empty,/>0<\/strong>/);
});
test('detail escapes title/meta/notes, folds records and retains the original page focus between modals',async()=>{
 const c=client();c.run(`api=async()=>({id:'a',status:'published',title:'<img onerror=1>',account_name:'<账号>',platform:'zhihu',url:'javascript:bad',notes:'<script>bad</script>',summary:'  ',nodes:[],timeline:[]});`);
 await c.run("articleDetail('a')");const html=c.nodes.get('#overlay').innerHTML;assert.match(html,/&lt;img/);assert.match(html,/&lt;账号&gt;/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<img|<script|href="javascript:|<h3>概况/);assert.match(html,/<details class="detail-section"><summary>记录信息/);assert.match(html,/补充数据/);
 let focused=false;const opener={isConnected:true,focus(){focused=true}},nested={};c.context.originalOpener=opener;c.document.activeElement=nested;c.nodes.get('#overlay').contains=n=>n===nested;c.nodes.get('#overlay').firstChild={};c.run("lastFocus=originalOpener;openModal('编辑','表单');closeModal()");assert.equal(focused,true);
});
test('new displayed timestamps retain Beijing year boundaries and reject unknown dates',()=>{
 const c=client();assert.equal(c.run("displayTime('bad')"),'未记录');assert.equal(c.run('displayTime(null)'),'未记录');assert.equal(c.run('displayTime(new Date(Date.now()-2*3600000).toISOString())'),'2 小时前');assert.match(c.run("displayTime('2020-01-01T00:00:00Z')"),/2020/);
 assert.equal(c.run("displayTime(bjtDate().slice(0,4)+'-01-01T00:00:00Z')"),c.run("time(bjtDate().slice(0,4)+'-01-01T00:00:00Z',true)"));
});
