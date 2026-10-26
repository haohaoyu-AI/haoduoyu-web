import {frontendSource} from './frontend-client.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source = await frontendSource();
function client(){
 const handlers={},nodes=new Map([['#overlay',{firstChild:null,style:{}}]]),body={};
 const ctx=vm.createContext({AbortController, AbortSignal, DOMException, Headers,document:{querySelector:s=>nodes.get(s)||null,querySelectorAll:()=>[],addEventListener:(k,f)=>handlers[k]=f,body,activeElement:body},window:{addEventListener(){}},location:{href:'http://localhost/',search:''},history:{replaceState(){},pushState(){}},localStorage:{getItem(){},setItem(){}},URL,URLSearchParams,Intl,console,setTimeout,clearTimeout,requestAnimationFrame(){}});
 new vm.Script(source).runInContext(ctx);return {run:s=>vm.runInContext(s,ctx),handlers};
}
const data=()=>({cumulative:{article_count:80,data_article_count:60,mean_reads:1800/60,coverage:60/80,no_snapshot_count:20,missing_reads_count:20,unverified_date_count:4,totals:{reads:1800,likes:17,comments:2},as_of:'2024-02-10T08:00:00Z'},series:{planned:200,highest_recorded:43,recorded_count:4},accounts:[],platform_comparison:[],top_articles:[],trend:[],due_reviews:[]});
test('freshness uses Beijing calendar days, retains unknown and rejects future dates',()=>{
 const c=client(),now=Date.parse('2026-10-21T16:01:00Z');
 for(const [stamp,kind] of [[null,'unknown'],['bad','unknown'],['2026-10-23T00:00:00Z','unknown'],['2026-10-21T15:59:00Z','up'],['2026-10-19T16:00:00Z','warn'],['2026-10-17T00:00:00Z','danger']])assert.equal(c.run(`freshness({as_of:${JSON.stringify(stamp)}},${now}).kind`),kind);
 assert.equal(c.run(`freshness({as_of:'bad',collected_at:'2026-10-21T16:00:00Z'},${now}).kind`),'up');
});
test('five stats retain backend denominators and null interaction is never a partial zero',()=>{
 const c=client();c.run('sample='+JSON.stringify(data()));let html=c.run('renderCumulative(sample)');assert.equal((html.match(/class="stat"/g)||[]).length,5);assert.match(html,/30/);assert.match(html,/75%/);assert.doesNotMatch(html,/22.5/);assert.doesNotMatch(html,/<p\b/);assert.doesNotMatch(html,/id="top-n"/);
 c.run('sample.cumulative.totals.likes=null');html=c.run('renderCumulative(sample)');assert.match(html,/互动（赞\+评）<\/dt><dd class="missing-value">—/);
 assert.doesNotMatch(c.run("state.page='dashboard';headerActions()"),/overview-period/);
});
test('Top legacy N keeps five visible and the rest folded, escapes values and separates likes and approvals',()=>{
 const c=client(),d=data();d.top_articles=Array.from({length:8},(_,i)=>({id:'id'+i,title:'<img onerror=1>',platform:'zhihu',account_name:'<账号>',latest_metrics:i===0?null:i===1?{reads:0}:{reads:10,likes:0,comments:0,approvals:4}}));c.run('sample='+JSON.stringify(d));const html=c.run('renderCumulative(sample)');assert.equal((html.match(/data-action="article-detail"/g)||[]).length,8);assert.match(html,/展开其余 3 篇/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img /);assert.match(html,/未采集/);assert.match(html,/未取得/);assert.match(html,/>0<\/strong>/);assert.match(html,/<th>赞同<\/th>/);
});
test('multi-account platform row stays aggregate with individual escaped links in its popover',()=>{
 const c=client();c.run("state.accounts=[{id:'a',name:'<甲>',platform:'zhihu'},{id:'b',name:'乙',platform:'zhihu'}];state.dashboard={platform_comparison:[{platform:'zhihu',article_count:2,totals:{reads:10}}]}");const row=c.run('renderPlatformTable(state.dashboard.platform_comparison)');assert.match(row,/select-platform/);assert.doesNotMatch(row,/data-action="select-account"/);assert.match(row,/&lt;甲&gt;，乙/);const info=c.run("dashboardInfoBody('platform','zhihu')");assert.match(info,/平台汇总/);assert.equal((info.match(/data-action="select-account"/g)||[]).length,2);assert.doesNotMatch(info,/<甲>/);
});
test('overview removes the cycle and attention region while retaining independent real-data trends and zeros',()=>{
 const c=client(),d=data();d.accounts=[{id:'a',name:'A',platform:'toutiao'}];d.trend=[1,2].map(n=>({date:'2026-10-'+(18+n),accounts:[{account_id:'a',metrics:{reads:0}}]}));d.attention_articles=Array.from({length:10},(_,i)=>({id:'a'+i,title:'marker'+i,platform:'toutiao',attention:{kind:i<4?'up':i<8?'down':i===8?'normal':'insufficient'},period_metrics:{reads:0,likes:0,comments:0}}));c.run('sample='+JSON.stringify(d));const html=c.run('renderDashboard(sample)');assert.equal((html.match(/data-action="article-detail"/g)||[]).length,0);assert.doesNotMatch(html,/marker\d|cycle-panel|表现异动|周期变化|todo-panel/);assert.match(html,/trend-disclosure/);assert.equal(c.run('dailyDates(sample).length'),2);c.run('state.attentionExpanded=true');assert.equal((c.run('renderDashboard(sample)').match(/data-action="article-detail"/g)||[]).length,0);
 c.run('sample.trend[1].accounts[0].metrics.reads=null');assert.doesNotMatch(c.run('renderDashboard(sample)'),/trend-disclosure/);
});
test('empty overview omits cycle-entry UI while the existing daily-data modal action retains its mode',async()=>{
 const c=client();c.run('sample='+JSON.stringify(data()));const html=c.run('renderDashboard(sample)');assert.doesNotMatch(html,/data-action="new-daily"|cycle-panel|todo-panel|overview-accounts|trend-disclosure|比较依据/);assert.match(html,/dashboard-stats|账号表现/);c.run("state.page='dashboard';reviewModal=async()=>{globalThis.dailyMode=state.reviewTab}");const target={dataset:{action:'new-daily'}};await c.handlers.click({target:{closest:()=>target}});assert.equal(c.run('dailyMode'),'daily');assert.equal(c.run('state.page'),'dashboard');
});
