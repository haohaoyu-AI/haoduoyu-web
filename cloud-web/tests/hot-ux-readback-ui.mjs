// Actual page imports/hooks; deterministic identity/write ordering and inert transport.
// Source snapshots let the same expectations show baseline red and candidate green.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash,webcrypto} from 'node:crypto';
const root=process.cwd(),requireAt=createRequire(root+'/package.json');
const ts=requireAt('typescript'),React=requireAt('react');
const hash=s=>createHash('sha256').update(s).digest('hex');
const sourceFile=process.env.HOT_UX_TEST_SOURCE||root+'/app/imitation/page.tsx';
const sourceText=fs.readFileSync(sourceFile,'utf8'),sourceSHA=hash(sourceText);
const scope=owner=>hash('hot-benchmark-owner:'+owner);
function view(owner,state='ready'){
 const account={id:owner+'-account',name:'SYNTH-'+owner+'-电影账号',url:'https://www.toutiao.com/c/user/123456789/'};
 return {owner_scope:scope(owner),accounts:[account],scan:{id:owner+'-scan',request_key:owner+'-old-scan-key',created:new Date().toISOString(),state,pool_changed:false,result:{observations:[],articles:[{id:owner+'-article',account_id:account.id,title:'SYNTH-'+owner+'-电影热文',url:'https://www.toutiao.com/article/1234567890123456789/',published_at:new Date(Date.now()-1000).toISOString(),reads:{display:'20000阅读',lower_bound:20000},likes:{display:null},comments:{display:null}}]}}};
}
function text(n){return Array.isArray(n)?n.map(text).join(''):n?.props?text(n.props.children):typeof n==='string'||typeof n==='number'?String(n):'';}
function nodes(n,type){const found=[];function visit(v){if(Array.isArray(v))return v.forEach(visit);if(!v?.props)return;if(v.type===type)found.push(v);visit(v.props.children);}visit(n);return found;}
function mount(source,{hidden=false}={}){
 const cells=[],pendingEffects=[],requests=[],signals=new Map(),timers=new Map(),cache=new Map(),stateAfterUnmount=[];
 let index=0,dirty=false,tree,dead=false,timerID=0,activeGets=0,maxGets=0;
 const same=(a,b)=>a?.length===b?.length&&a.every((v,i)=>Object.is(v,b[i]));
 const hooks={...React,
  useState(initial){const at=index++;if(!(at in cells))cells[at]=typeof initial==='function'?initial():initial;return[cells[at],value=>{if(dead){stateAfterUnmount.push(at);return;}cells[at]=typeof value==='function'?value(cells[at]):value;dirty=true;}];},
  useRef(initial){const at=index++;return cells[at]??=( {current:initial} );},
  useCallback(callback,deps){const at=index++;if(!cells[at]||!same(cells[at].deps,deps))cells[at]={callback,deps};return cells[at].callback;},
  useEffect(effect,deps){const at=index++,prior=cells[at];if(!prior||!same(prior.deps,deps)){const next={deps,cleanup:prior?.cleanup};cells[at]=next;pendingEffects.push(()=>{prior?.cleanup?.();next.cleanup=effect();});}}
 };
 const events={addEventListener(type,callback){const set=signals.get(type)??new Set();set.add(callback);signals.set(type,set);},removeEventListener(type,callback){signals.get(type)?.delete(callback);}};
 const doc={...events,visibilityState:hidden?'hidden':'visible'};
 function load(filename){
  if(cache.has(filename))return cache.get(filename);const evaluated={exports:{}};cache.set(filename,evaluated.exports);
  const input=filename===root+'/app/imitation/page.tsx'?source:fs.readFileSync(filename,'utf8');
  const js=ts.transpileModule(input,{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const timer=(fn,delay,repeat)=>{const id=++timerID;timers.set(id,{fn,delay,repeat});return id;};
  vm.runInNewContext(js,{module:evaluated,exports:evaluated.exports,require(name){
   if(name==='react')return hooks;if(name.endsWith('.css'))return{};if(name.includes('studio-nav'))return{default:()=>null};
   if(!name.startsWith('.'))return requireAt(name);const base=path.resolve(path.dirname(filename),name);return load([base,base+'.ts',base+'.tsx'].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile()));
  },Date,Intl,URL,Error,Response,AbortSignal,AbortController,crypto:webcrypto,window:events,document:doc,
  setInterval:(fn,delay)=>timer(fn,delay,true),clearInterval:id=>timers.delete(id),setTimeout:(fn,delay)=>timer(fn,delay,false),clearTimeout:id=>timers.delete(id),
  fetch(url,options={}){
   assert.match(url,/^\/api\/imitation\/discovery(?:\?request_key=[\w-]+)?$/);const method=options.method??'GET';assert.ok(['GET','POST'].includes(method));
   let resolve,reject;const result=new Promise((yes,no)=>{resolve=yes;reject=no;});if(method==='GET')maxGets=Math.max(maxGets,++activeGets);
   const request={url,method,options,body:options.body?JSON.parse(options.body):null,done:false,
    reply(payload,status=200){assert.equal(this.done,false);this.done=true;if(method==='GET')activeGets--;resolve(new Response(JSON.stringify(payload),{status}));},
    fail(message='SYNTH network failure'){assert.equal(this.done,false);this.done=true;if(method==='GET')activeGets--;reject(Error(message));}};
   requests.push(request);return result;
  }},{filename});return evaluated.exports;
 }
 const Page=load(root+'/app/imitation/page.tsx').default;
 function render(){assert.equal(dead,false);let count=0;do{assert.ok(++count<30);index=0;dirty=false;tree=Page();const effects=pendingEffects.splice(0);effects.forEach(e=>e());}while(dirty||pendingEffects.length);}
 async function flush(){for(let i=0;i<35;i++){await Promise.resolve();if(!dead&&(dirty||pendingEffects.length))render();}}
 const button=name=>nodes(tree,'button').find(n=>text(n)===name);
 render();
 return {requests,button,nodes:type=>nodes(tree,type),text:()=>text(tree),maxGets:()=>maxGets,stateAfterUnmount,
  flush,async initial(owner='A',state='ready'){requests[0].reply(view(owner,state));await flush();},
  async signal(type='focus',visibility='visible'){doc.visibilityState=visibility;for(const callback of signals.get(type)??[])callback();render();await flush();},
  async click(name){const n=button(name);assert.ok(n,'button '+name);assert.equal(!!n.props.disabled,false,'enabled '+name);n.props.onClick();render();await flush();},
  async poll(){const poll=[...timers.values()].find(t=>t.repeat&&t.delay===2500);assert.ok(poll);poll.fn();render();await flush();},
  unmount(){for(const cell of cells)cell?.cleanup?.();dead=true;},listenerCount:()=>[...signals.values()].reduce((n,set)=>n+set.size,0)
 };
}
const posts=h=>h.requests.filter(r=>r.method==='POST');
const checks=[];
async function check(name,run){try{await run();checks.push({name,passed:true});console.log('PASS '+name);}catch(error){checks.push({name,passed:false,error:error.message});console.error('FAIL '+name+' '+error.message);}}
const confirmed=(key,state='ready')=>{const v=view('A',state);v.scan.request_key=key;return v;};
const changed=(action)=>{const v=view('A');v.accounts=action==='add'?[...v.accounts,{...v.accounts[0],id:'A-new-account',name:'SYNTH-A-新增账号'}]:[];return v;};
const hidden=h=>{assert.equal(h.nodes('li').length,0);assert.equal(h.nodes('article').length,0);assert.equal(h.nodes('form').length,0);};
async function unknown(h){await h.initial();await h.click('刷新热文');const key=posts(h)[0].body.request_key;h.requests[1].fail('SYNTH post unavailable');await h.flush();h.requests[2].fail('SYNTH receipt unavailable');await h.flush();return key;}
async function accountWrite(h,action){await h.initial();if(action==='add'){await h.click('添加账号');h.nodes('input')[0].props.onChange({target:{value:'SYNTH-A-新增账号'}});h.nodes('input')[1].props.onChange({target:{value:'https://www.toutiao.com/c/user/234567890/'}});await h.flush();h.nodes('form')[0].props.onSubmit({preventDefault(){}});await h.flush();}else await h.click('移除');return posts(h)[0];}

await check('latest same-owner identity GET acknowledges exact pending nonce without releasing POST lock; next refresh is fresh',async()=>{
 const h=mount(sourceText);await h.initial();await h.click('刷新热文');const post=posts(h)[0],key=post.body.request_key;await h.signal();h.requests[2].reply(confirmed(key));await h.flush();
 assert.equal(h.button('正在刷新…').props.disabled,true);assert.equal(posts(h).length,1);post.reply(confirmed(key));await h.flush();assert.equal(h.requests.length,3);await h.click('刷新热文');assert.notEqual(posts(h)[1].body.request_key,key);assert.equal(posts(h)[1].body.owner_scope,scope('A'));
});
await check('confirmed collecting scan continues through GET poll; after ready the next explicit refresh uses fresh nonce',async()=>{
 const h=mount(sourceText);await h.initial();await h.click('刷新热文');const post=posts(h)[0],key=post.body.request_key;await h.signal();h.requests[2].reply(confirmed(key,'collecting'));await h.flush();post.fail();await h.flush();assert.equal(h.requests.length,3);
 await h.poll();assert.ok(h.requests[3].url.includes(key));h.requests[3].reply(confirmed(key));await h.flush();await h.click('刷新热文');assert.notEqual(posts(h)[1].body.request_key,key);
});
await check('matching receipt GET after failed POST clears nonce without misreporting the successful recovery',async()=>{
 const h=mount(sourceText);await h.initial();await h.click('刷新热文');const post=posts(h)[0],key=post.body.request_key;post.fail('SYNTH original POST failure');await h.flush();h.requests[2].reply(confirmed(key));await h.flush();assert.doesNotMatch(h.text(),/original POST failure|刷新结果暂未确认/);assert.equal(posts(h).length,1);await h.click('刷新热文');assert.notEqual(posts(h)[1].body.request_key,key);
});
for(const result of ['unrelated','none'])await check(result+' latest same-owner GET preserves unknown nonce and never replays POST',async()=>{
 const h=mount(sourceText),key=await unknown(h);await h.signal();const latest=view('A');if(result==='none')latest.scan=null;h.requests[3].reply(latest);await h.flush();assert.equal(posts(h).length,1);await h.click('刷新热文');assert.equal(posts(h)[1].body.request_key,key);
});
await check('a stale matching GET cannot consume the unknown nonce before the newest unrelated GET',async()=>{
 const h=mount(sourceText),key=await unknown(h);await h.signal();await h.signal('visibilitychange');h.requests[3].reply(confirmed(key));await h.flush();assert.equal(h.requests.length,5);hidden(h);h.requests[4].reply(view('A'));await h.flush();await h.click('刷新热文');assert.equal(posts(h)[1].body.request_key,key);
});
await check('latest identity network failure stays hidden and GET-only same-owner retry keeps unknown nonce',async()=>{
 const h=mount(sourceText),key=await unknown(h);await h.signal();h.requests[3].fail();await h.flush();hidden(h);assert.equal(h.button('刷新热文').props.disabled,true);await h.click('重试读取账号池');assert.equal(h.requests[4].method,'GET');h.requests[4].reply(view('A'));await h.flush();assert.equal(posts(h).length,1);await h.click('刷新热文');assert.equal(posts(h)[1].body.request_key,key);
});
await check('owner change or auth refusal clears the former nonce even if a returned scan shares its key',async()=>{
 for(const outcome of ['changed','missing','401','403']){
  const h=mount(sourceText),key=await unknown(h);await h.signal();
  if(outcome==='changed'){const b=view('B');b.scan.request_key=key;h.requests[3].reply(b);}
  else if(outcome==='missing')h.requests[3].reply({...confirmed(key),owner_scope:''});else h.requests[3].reply({error:'SYNTH refused'},Number(outcome));
  await h.flush();assert.equal(posts(h).length,1);if(outcome!=='changed'){await h.signal();h.requests[4].reply(view('B'));await h.flush();}await h.click('刷新热文');assert.notEqual(posts(h)[1].body.request_key,key);assert.equal(posts(h)[1].body.owner_scope,scope('B'));
 }
});
for(const action of ['add','remove'])await check('late '+action+' success after old-pool identity GET hides stale pool and converges through one GET',async()=>{
 const h=mount(sourceText),post=await accountWrite(h,action);await h.signal();h.requests[2].reply(view('A'));await h.flush();assert.equal(h.button(action==='add'?'正在保存…':'移除').props.disabled,true);
 post.reply(changed(action));await h.flush();assert.equal(h.requests.length,4);assert.equal(h.requests[3].method,'GET');assert.equal(h.requests[3].url,'/api/imitation/discovery');assert.equal(posts(h).length,1);hidden(h);
 h.requests[3].reply(changed(action));await h.flush();assert.equal(h.nodes('li').length,action==='add'?2:0);assert.equal(posts(h).length,1);assert.doesNotMatch(h.text(),/账号已保存|账号已移除/);
});
await check('settlement during an active identity GET fences its pre-write response and coalesces one follow-up',async()=>{
 const h=mount(sourceText),post=await accountWrite(h,'remove');await h.signal();assert.equal(h.requests.length,3);post.reply(changed('remove'));await h.flush();assert.equal(h.requests.length,3);hidden(h);h.requests[2].reply(view('A'));await h.flush();assert.equal(h.requests.length,4);hidden(h);h.requests[3].reply(changed('remove'));await h.flush();assert.equal(h.nodes('li').length,0);assert.equal(posts(h).length,1);assert.equal(h.maxGets(),1);
});
await check('stale unknown account-write failure also rechecks by GET and never replays the mutation',async()=>{
 const h=mount(sourceText),post=await accountWrite(h,'remove');await h.signal();h.requests[2].reply(view('A'));await h.flush();post.fail('SYNTH lost mutation reply');await h.flush();assert.equal(h.requests.length,4);assert.equal(h.requests[3].method,'GET');hidden(h);h.requests[3].reply(changed('remove'));await h.flush();assert.equal(h.nodes('li').length,0);assert.equal(posts(h).length,1);assert.doesNotMatch(h.text(),/lost mutation reply/);
});
await check('hidden account-write settlement only queues identity work, then visible GET reads final pool',async()=>{
 const h=mount(sourceText),post=await accountWrite(h,'remove');await h.signal('visibilitychange','hidden');post.reply(changed('remove'));await h.flush();assert.equal(h.requests.length,2);hidden(h);await h.signal('visibilitychange');assert.equal(h.requests.length,3);h.requests[2].reply(changed('remove'));await h.flush();assert.equal(h.nodes('li').length,0);assert.equal(posts(h).length,1);
});
await check('late owner A account success or refusal cannot hide confirmed B or schedule reads for it',async()=>{
 for(const status of [200,403]){const h=mount(sourceText),post=await accountWrite(h,'remove');await h.signal();h.requests[2].reply(view('B'));await h.flush();assert.match(h.text(),/SYNTH-B-/);post.reply(status===200?changed('remove'):{error:'SYNTH old refusal'},status);await h.flush();assert.equal(h.requests.length,3);assert.match(h.text(),/SYNTH-B-/);assert.doesNotMatch(h.text(),/SYNTH-A-|old refusal/);assert.equal(posts(h).length,1);assert.equal(h.button('刷新热文').props.disabled,false);}
});
await check('cleared authentication scope and unmount prevent late account settlement reads and state updates',async()=>{
 for(const outcome of ['401','403','missing','unmount']){
  const h=mount(sourceText),post=await accountWrite(h,'remove');await h.signal();if(outcome==='unmount')h.unmount();else{h.requests[2].reply(outcome==='missing'?{...view('A'),owner_scope:''}:{error:'SYNTH refused'},outcome==='missing'?200:Number(outcome));await h.flush();}
  post.reply(changed('remove'));await h.flush();assert.equal(h.requests.length,3);assert.equal(posts(h).length,1);if(outcome==='unmount'){h.requests[2].reply(view('A'));await h.flush();assert.deepEqual(h.stateAfterUnmount,[]);assert.equal(h.listenerCount(),0);}else hidden(h);
 }
});
await check('failed settlement GET retains hidden view and stale handlers stay blocked until GET-only retry',async()=>{
 const h=mount(sourceText);await h.initial();const oldRemove=h.button('移除').props.onClick;await h.click('移除');const post=posts(h)[0];await h.signal();h.requests[2].reply(view('A'));await h.flush();post.reply(changed('remove'));await h.flush();assert.equal(h.requests.length,4);h.requests[3].fail('SYNTH settlement GET failed');await h.flush();hidden(h);oldRemove();await h.flush();assert.equal(posts(h).length,1);
 await h.click('重试读取账号池');assert.equal(h.requests[4].method,'GET');h.requests[4].reply(changed('remove'));await h.flush();assert.equal(h.nodes('li').length,0);assert.equal(posts(h).length,1);
});
await check('current account auth refusal clears scope without automatically reading or replaying',async()=>{
 const h=mount(sourceText),post=await accountWrite(h,'remove');post.reply({error:'SYNTH refused'},403);await h.flush();assert.equal(h.requests.length,2);assert.equal(posts(h).length,1);hidden(h);assert.match(h.text(),/使用本人账号登录/);
});
assert.equal(hash(fs.readFileSync(sourceFile)),sourceSHA);
const results={source_snapshot:sourceFile,source_sha256:sourceSHA,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,checks,scope:'Actual page hooks and inert discovery transport; no real network/browser/production/platform requests.',external_calls:0,production_writes:0,platform_writes:0};
console.log(JSON.stringify(results,null,2));if(process.env.HOT_UX_TEST_RESULTS)fs.writeFileSync(process.env.HOT_UX_TEST_RESULTS,JSON.stringify(results,null,2)+'\n');if(results.failed)process.exitCode=1;
