import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {frontendSource} from './frontend-client.mjs';

const source=await frontendSource();
function client() {
  const node=()=>({innerHTML:'',firstChild:null,querySelectorAll(){return []},contains(){return false},style:{},setAttribute(){}});
  const nodes=new Map(['#app','#overlay','#page-content'].map(id=>[id,node()]));
  const document={querySelector:s=>nodes.get(s)||null,querySelectorAll:()=>[],addEventListener(){},body:{style:{}},activeElement:null};
  const ctx=vm.createContext({AbortController,AbortSignal,DOMException,Headers,document,
    window:{addEventListener(){},scrollTo(){}},location:{href:'http://localhost/?page=settings&tab=security',search:'?page=settings&tab=security'},
    history:{replaceState(){},pushState(){}},localStorage:{getItem(){return null},setItem(){}},URL,URLSearchParams,Intl,
    console,requestAnimationFrame(){},setTimeout,clearTimeout});
  new vm.Script(source).runInContext(ctx);
  return {run:code=>vm.runInContext(code,ctx),nodes};
}

test('anonymous public UI opens business directly and never offers credential/security tabs or logout',()=>{
  const c=client();
  c.run("state.me={id:'public-business',username:'公开编辑',publicBusiness:true};state.accounts=[];readRoute();renderShell()");
  assert.equal(c.run('state.settingsTab'),'workspace');
  const html=c.nodes.get('#app').innerHTML;
  assert.match(html,/data-nav="todos"/);
  const sidebar=html.match(/<nav class="nav-list"[\s\S]*?<\/nav>/)?.[0];assert.ok(sidebar);
  assert.equal((sidebar.match(/data-nav="dashboard"/g)||[]).length,1);
  assert.match(sidebar,/好多鱼图文/);assert.doesNotMatch(sidebar,/media-subnav|data-nav="(?:articles|reviews)"/);
  assert.doesNotMatch(html,/公开编辑|class="user-row"|class="avatar"|class="user-name"/);
  assert.doesNotMatch(html,/data-tab="(?:keys|security|log)"|data-action="logout"|password-form|login-form/);
  const options=JSON.parse(c.run("JSON.stringify(apiOptions({method:'POST',body:{text:'synthetic'}}))"));
  assert.equal(options.headers['X-Public-Business'],'1');assert.equal(options.headers['X-CSRF-Token'],undefined);
  c.run("state.me={id:'synthetic-private',username:'Private',csrfToken:'synthetic-private-csrf'}");
  c.run('renderShell()');
  assert.match(c.nodes.get('#app').innerHTML,/class="user-row"|class="avatar"/);
  assert.match(c.nodes.get('#app').innerHTML,/Private/);
  assert.match(c.nodes.get('#app').innerHTML,/data-action="logout"/);
  const privateOptions=JSON.parse(c.run("JSON.stringify(apiOptions({method:'POST',body:{}}))"));
  assert.equal(privateOptions.headers['X-Public-Business'],undefined);
  assert.equal(privateOptions.headers['X-CSRF-Token'],'synthetic-private-csrf');
});
