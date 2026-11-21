import {frontendSource} from './frontend-client.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const source = await frontendSource();
function client(search=''){
 const events={},windowEvents={},nodes=new Map(),entries=['http://localhost/'+search];let index=0;
 const location={href:entries[0],search};
 const locate=url=>{location.href=String(url);location.search=new URL(url).search};
 const node=()=>({innerHTML:'',firstChild:null,querySelectorAll(){return []},contains(){return false},style:{},setAttribute(){}});
 for(const id of ['#app','#overlay','#page-content'])nodes.set(id,node());
 const document={querySelector:s=>nodes.get(s)||null,querySelectorAll:()=>[],addEventListener:(k,f)=>events[k]=f,body:{style:{}},activeElement:null};
 const history={replaceState:(_,__,url)=>{entries[index]=String(url);locate(url)},pushState:(_,__,url)=>{entries.splice(++index);entries[index]=String(url);locate(url)}};
 const ctx=vm.createContext({AbortController, AbortSignal, DOMException, Headers,structuredClone,document,window:{addEventListener:(k,f)=>windowEvents[k]=f,scrollTo(){},setInterval(){return 0},clearInterval(){}},location,history,localStorage:{getItem(){return null},setItem(){}},URL,URLSearchParams,Intl,console,requestAnimationFrame(){},setTimeout,clearTimeout});
 new vm.Script(source).runInContext(ctx);const run=s=>vm.runInContext(s,ctx);
 run("state.accounts=[{id:'a',platform:'zhihu',name:'<账号>',active:true}];state.me={id:'synthetic-ui-user',username:'<用户>'}");
 return {run,nodes,location,events,windowEvents,back(){locate(entries[--index]);windowEvents.popstate()},forward(){locate(entries[++index]);windowEvents.popstate()}};
}
test('legacy settings routes canonicalize while supported filters and account survive login restoration',()=>{
 for(const [route,tab] of [['management','todo'],['accounts','todo'],['keys','ai'],['settings','todo'],['settings&tab=accounts','todo'],['settings&tab=keys','ai'],['settings&tab=log','log'],['settings&tab=bad','todo']]){
  const c=client('?page='+route+'&account=a&q=%3C词%3E&platform=zhihu&sort=reads&order=asc&list_page=2&page_size=10&columns=reads,as_of');
  c.run('readRoute();updateRoute()');
  assert.equal(c.run('state.page'),'settings');assert.equal(c.run('state.settingsTab'),tab);assert.equal(c.run('state.account'),'a');
  const params=new URL(c.location.href).searchParams;
  assert.equal(params.has('q'),false);
  assert.equal(params.get('tab'),tab);
  assert.equal(c.run('state.filters.platform'),'zhihu');
  assert.equal(c.run('state.filters.sort'),'reads');
 }
});
test('page and tab history restores review tabs and settings on popstate',()=>{
 const c=client('?page=articles&q=hello&account=a');c.run('readRoute();updateRoute();renderShell=()=>{}');
 assert.equal(c.run('state.page'),'review');
 c.run("navigate('settings','keys')");assert.equal(c.run('state.settingsTab'),'ai');
 c.run("navigate('reviews')");assert.equal(c.run('state.page'),'review');assert.match(c.location.search,/page=review/);
 c.back();assert.equal(c.run('state.page'),'settings');assert.equal(c.run('state.settingsTab'),'ai');
 c.back();assert.equal(c.run('state.page'),'review');assert.equal(c.run('state.account'),'a');
 c.forward();assert.equal(c.run('state.settingsTab'),'ai');
});
test('a late old settings response cannot overwrite a newer page or its loading state',async()=>{
 const c=client();c.run("let finish;api=path=>path==='/api-keys'?Promise.resolve([]):new Promise(resolve=>finish=resolve);state.page='settings';state.settingsTab='log';let pending=renderPage()");
 assert.match(c.nodes.get('#page-content').innerHTML,/class="skeleton"/);
 c.run("state.settingsTab='security'");await c.run('renderPage()');assert.match(c.nodes.get('#page-content').innerHTML,/password-form/);
 c.run("finish([{action:'late-response',actor:'old'}])");await c.run('pending');assert.doesNotMatch(c.nodes.get('#page-content').innerHTML,/late-response/);assert.match(c.nodes.get('#page-content').innerHTML,/password-form/);
});
test('migrated account/security/log templates and unified header retain controls and escape business values',()=>{
 const c=client();assert.match(c.run('renderAccounts()'),/&lt;账号&gt;/);assert.match(c.run('renderAccounts()'),/data-action="edit-account"/);
 const security=c.run('renderSecurity()');for(const name of ['currentPassword','newPassword','confirmPassword'])assert.match(security,new RegExp('name="'+name+'"'));
 assert.match(security,/&lt;用户&gt;/);assert.match(security,/data-action="logout"/);
 assert.match(c.run("renderAudit([{action:'<action>',actor:'<actor>',entity_id:'<id>'}])"),/&lt;action&gt;/);assert.doesNotMatch(c.run("renderAudit([{action:'x',actor:'<actor>',entity_id:'<id>'}])"),/<actor>|&lt;id&gt;/);
 assert.match(c.run('renderKeys([])'),/供自动化工具/);
 assert.match(c.run('renderKeys([])'),/data-action="new-key"/);
 c.run("state.page='review';state.account='V字';renderShell()");
 assert.match(c.nodes.get('#app').innerHTML,/id="page-header"[^>]*>[\s\S]*<h1>内容复盘<\/h1>/);
});
