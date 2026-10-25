import {frontendSource} from './frontend-client.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source = await frontendSource();
function client(search=''){
 const events={},windowEvents={},nodes=new Map(),entries=['http://localhost/'+search];let index=0;
 const location={href:entries[0],search};
 const locate=url=>{location.href=String(url);location.search=new URL(url).search};
 const node=()=>({innerHTML:'',firstChild:null,querySelectorAll(){return []},contains(){return false},style:{},setAttribute(){}});
 for(const id of ['#app','#overlay','#page-content'])nodes.set(id,node());
 const document={querySelector:s=>nodes.get(s)||null,querySelectorAll:()=>[],addEventListener:(k,f)=>events[k]=f,body:{style:{}},activeElement:null};
 const history={replaceState:(_,__,url)=>{entries[index]=String(url);locate(url)},pushState:(_,__,url)=>{entries.splice(++index);entries[index]=String(url);locate(url)}};
 const ctx=vm.createContext({AbortController, AbortSignal, DOMException, Headers,structuredClone,document,window:{addEventListener:(k,f)=>windowEvents[k]=f,scrollTo(){}},location,history,localStorage:{getItem(){return null},setItem(){}},URL,URLSearchParams,Intl,console,requestAnimationFrame(){},setTimeout,clearTimeout});
 new vm.Script(source).runInContext(ctx);const run=s=>vm.runInContext(s,ctx);
 run("state.accounts=[{id:'a',platform:'zhihu',name:'<账号>',active:true}];state.me={id:'synthetic-ui-user',username:'<用户>'}");
 return {run,nodes,location,events,windowEvents,back(){locate(entries[--index]);windowEvents.popstate()},forward(){locate(entries[++index]);windowEvents.popstate()}};
}
test('legacy settings routes canonicalize while every query and account survives login restoration',()=>{
 for(const [route,tab] of [['management','accounts'],['accounts','accounts'],['keys','keys'],['settings','security'],['settings&tab=accounts','accounts'],['settings&tab=log','log'],['settings&tab=bad','accounts']]){
  const c=client('?page='+route+'&account=a&q=%3C词%3E&platform=zhihu&sort=reads&order=asc&list_page=2&page_size=10&columns=reads,as_of&top_n=20&top_platform=wechat&period=30d');
  c.run('readRoute({freshLogin:true});updateRoute()');
  assert.equal(c.run('state.page'),'settings');assert.equal(c.run('state.settingsTab'),tab);assert.equal(c.run('state.account'),'a');
  const params=new URL(c.location.href).searchParams;
  for(const [key,value] of Object.entries({q:'<词>',platform:'zhihu',sort:'reads',order:'asc',list_page:'2',page_size:'10',columns:'reads,as_of',top_n:'20',top_platform:'wechat',period:'30d',account:'a',tab}))assert.equal(params.get(key),value,key);
 }
});
test('page and tab history restores filters, review tabs and settings on popstate',()=>{
 const c=client('?page=articles&q=hello&account=a');c.run('readRoute();updateRoute();renderShell=()=>{}');
 c.run("navigate('settings','keys')");assert.equal(c.run('state.settingsTab'),'keys');
 c.run("state.reviewTab='daily';navigate('reviews')");assert.match(c.location.search,/tab=daily/);
 c.back();assert.equal(c.run('state.page'),'settings');assert.equal(c.run('state.settingsTab'),'keys');assert.equal(c.run('state.filters.q'),'hello');
 c.back();assert.equal(c.run('state.page'),'articles');assert.equal(c.run('state.account'),'a');
 c.forward();assert.equal(c.run('state.settingsTab'),'keys');
});
test('a late old settings response cannot overwrite a newer page or its loading state',async()=>{
 const c=client();c.run("let finish;api=path=>path==='/api-keys'?Promise.resolve([]):new Promise(resolve=>finish=resolve);state.page='settings';state.settingsTab='log';let pending=renderPage()");
 assert.match(c.nodes.get('#page-content').innerHTML,/class="skeleton"/);
 c.run("state.settingsTab='security'");await c.run('renderPage()');assert.match(c.nodes.get('#page-content').innerHTML,/password-form/);
 c.run("finish([{action:'late-response',actor:'old'}])");await c.run('pending');assert.doesNotMatch(c.nodes.get('#page-content').innerHTML,/late-response/);assert.match(c.nodes.get('#page-content').innerHTML,/password-form/);
});
test('cancelled or superseded article requests cannot reopen or replace a modal',async()=>{
 const c=client();c.run("let pendingRequests={};api=path=>new Promise(resolve=>pendingRequests[path]=resolve);let first=articleDetail('old');closeModal();pendingRequests['/articles/old']({title:'stale'})");await c.run('first');assert.equal(c.nodes.get('#overlay').innerHTML,'');
 c.run("let older=articleDetail('a');let newer=articleDetail('b');pendingRequests['/articles/b']({title:'new <title>'})");await c.run('newer');c.run("pendingRequests['/articles/a']({title:'old'})");await c.run('older');assert.match(c.nodes.get('#overlay').innerHTML,/new &lt;title&gt;/);assert.doesNotMatch(c.nodes.get('#overlay').innerHTML,/>old</);
});
test('migrated account/security/log templates retain controls and escape business values',()=>{
 const c=client();assert.match(c.run('renderAccounts()'),/&lt;账号&gt;/);assert.match(c.run('renderAccounts()'),/data-action="edit-account"/);
 const security=c.run('renderSecurity()');for(const name of ['currentPassword','newPassword','confirmPassword'])assert.match(security,new RegExp('name="'+name+'"'));
 assert.match(security,/&lt;用户&gt;/);assert.match(c.run("renderAudit([{action:'<action>',actor:'<actor>',entity_id:'<id>'}])"),/&lt;action&gt;/);assert.doesNotMatch(c.run("renderAudit([{action:'x',actor:'<actor>',entity_id:'<id>'}])"),/<actor>|&lt;id&gt;/);
 assert.match(c.run('renderKeys([])'),/供自动化工具/);
});
test('late modal failures are ignored while current failures still reach the caller',async()=>{
 for(const call of ["articleDetail('a')","articleModal('a')","reviewModal()"]){
  const c=client();c.run("let rejectOld;api=()=>new Promise((_,reject)=>rejectOld=reject)");c.run('let pending='+call);c.run("closeModal();rejectOld(new Error('old failure'))");await c.run('pending');assert.equal(c.nodes.get('#overlay').innerHTML,'');
  c.run("let rejectCurrent;api=()=>new Promise((_,reject)=>rejectCurrent=reject)");c.run('let current='+call);c.run("rejectCurrent(new Error('current failure'))");await assert.rejects(c.run('current'),/current failure/);
 }
});

test('opening a filter invalidates older modal success and failure without touching its draft',async()=>{
 for(const fail of [false,true]){
  const c=client();c.run("let resolveOld,rejectOld;api=()=>new Promise((yes,no)=>{resolveOld=yes;rejectOld=no});let old=articleDetail('a');let draftOpen=false;articleFilterPanel=()=>'';popover=()=>{draftOpen=true}");
  const target={dataset:{action:'article-filter'},closest(){return this}};c.nodes.set('[data-action=article-filter]',target);
  await c.events.click({target});c.run(fail?"rejectOld(new Error('obsolete failure'))":"resolveOld({title:'obsolete success'})");await c.run('old');assert.equal(c.run('draftOpen'),true);assert.equal(c.nodes.get('#overlay').innerHTML,'');
 }
});
