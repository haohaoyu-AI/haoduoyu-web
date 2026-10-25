import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {frontendSource} from './frontend-client.mjs';

const source=await frontendSource();
function client() {
  const node={innerHTML:'',style:{},firstChild:null,contains(){return false;},querySelectorAll(){return [];},setAttribute(){}};
  const document={querySelector(){return node;},querySelectorAll(){return [];},body:node,addEventListener(){},activeElement:null};
  const context=vm.createContext({document,window:{addEventListener(){},scrollTo(){}},
    location:{href:'http://localhost/',search:''},history:{replaceState(){}},
    localStorage:{getItem(){return null;},setItem(){}},crypto:{randomUUID},AbortController,AbortSignal,DOMException,
    URL,URLSearchParams,Headers,structuredClone,Intl,console,setTimeout,clearTimeout,requestAnimationFrame(){}});
  new vm.Script(source).runInContext(context);
  const run=value=>vm.runInContext(value,context);
  run("state.me={id:'synthetic-owner',username:'synthetic'};state.accounts=[];state.accountProfiles=[];");
  return {run};
}

test('account form accepts a public profile and auto platform while saved profile links remain escaped and safe',()=>{
  const app=client();app.run('let modalHTML="";openModal=(title,body)=>modalHTML=body;accountModal()');
  const form=app.run('modalHTML');
  assert.match(form,/type="url"[^>]*name="profile_url"/);
  assert.match(form,/<option value="" selected>根据主页自动识别<\/option>/);
  assert.match(form,/name="name"[^>]*required/);
  app.run("state.accounts=[{id:'a',name:'<账号>',platform:'zhihu',active:true}];state.accountProfiles=[{account_id:'a',profile_url:'https://www.zhihu.com/people/synthetic'}]");
  const html=app.run('renderAccounts()');
  assert.match(html,/&lt;账号&gt;/);assert.match(html,/打开公开主页/);assert.match(html,/rel="noopener noreferrer"/);
  app.run("state.accountProfiles[0].profile_url='javascript:alert(1)'");
  assert.doesNotMatch(app.run('renderAccounts()'),/href="javascript:/);
  app.run("state.accountProfiles[0].profile_url='https://evil.invalid/people/synthetic'");
  assert.doesNotMatch(app.run('renderAccounts()'),/href="https:\/\/evil/);
});

test('profile submission infers platform on the server, retries with a stable idempotency key and reports reuse',async()=>{
  const app=client();
  app.run(`let calls=[],toasts=[];closeModal=()=>{};renderShell=()=>{};toast=value=>toasts.push(value);
    api=async(path,options)=>{calls.push({path,options});if(options)return {id:'a',name:'已有账号',profile_reused:true};
      return path==='/accounts'?[{id:'a',platform:'zhihu',name:'已有账号'}]:[{account_id:'a',profile_url:'https://www.zhihu.com/people/synthetic'}];};
    let form={dataset:{id:''}},data={platform:'',name:'新名称',profile_url:'https://www.zhihu.com/people/synthetic'};`);
  await app.run('submitAccountForm({form,data,values:new URLSearchParams()})');
  await app.run('submitAccountForm({form,data,values:new URLSearchParams()})');
  const calls=JSON.parse(app.run('JSON.stringify(calls.filter(call=>call.options))'));
  assert.equal(calls[0].options.body.profile_url,'https://www.zhihu.com/people/synthetic');
  assert.equal(calls[0].options.body.platform,'');
  assert.equal(calls[0].options.headers['Idempotency-Key'],calls[1].options.headers['Idempotency-Key']);
  assert.match(app.run('toasts[0]'),/已有账号/);
  assert.equal(app.run('state.accountProfiles[0].account_id'),'a');
});

test('manual account submission keeps the legacy payload and a late saved response cannot overwrite another session',async()=>{
  const app=client();
  app.run(`let calls=[];closeModal=()=>{};renderShell=()=>{};toast=()=>{};
    api=async(path,options)=>{calls.push({path,options});return options?{id:'new'}:[];};
    let form={dataset:{id:''}},data={platform:'other',name:'合成手填账号',profile_url:''};`);
  await app.run('submitAccountForm({form,data,values:new URLSearchParams()})');
  assert.deepEqual(JSON.parse(app.run('JSON.stringify(calls[0].options.body)')),{platform:'other',name:'合成手填账号'});
  app.run(`let finish;calls=[];api=(path,options)=>{calls.push({path,options});return new Promise(resolve=>finish=resolve);};
    let pending=submitAccountForm({form,data,values:new URLSearchParams()});runtime.sessionEpoch++;state.accounts=[{id:'new-session'}];finish({id:'old-session'});`);
  await app.run('pending');
  assert.equal(app.run('calls.length'),1);assert.equal(app.run('state.accounts[0].id'),'new-session');
});
