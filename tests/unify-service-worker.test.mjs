import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {buildServiceWorkerAssets,shellAssetPaths} from '../scripts/service-worker-build.mjs';
import {startServiceWorker} from '../web/offline/sw-client.mjs';

const ORIGIN='https://haoduoyu.example';
const template=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
const manifest=await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8');
const PREFIX='haoduoyu-shell-v1-',PINS='haoduoyu-shell-clients-v1';
function fixture(label='A',extra={}) {
  const assets=Object.fromEntries(shellAssetPaths.filter(path=>path!=='/').map(path=>[path,
    path==='/manifest.webmanifest'?manifest:`${path} ${label}`]));
  Object.assign(assets,extra);
  const indexHtml='<!doctype html>\n<html><head>\n'+Object.keys(assets).filter(path=>path.endsWith('.css'))
    .map(path=>`  <link rel="stylesheet" href="${path}">`).join('\n')+
    '\n  <link rel="icon" href="/favicon.svg?v=existing">\n  <script type="module" src="/app.js"></script>\n</head><body></body></html>';
  const built=buildServiceWorkerAssets({indexHtml,swSource:template,assets});
  return {...built,assets,network:new Map([['/',built.indexHtml],...Object.entries(assets)])};
}
class MemoryCache {
  constructor(){this.entries=new Map();}
  async match(request){return this.entries.get(typeof request==='string'?request:request.url)?.clone();}
  async put(request,response){this.entries.set(typeof request==='string'?request:request.url,response.clone());}
  async delete(request){return this.entries.delete(typeof request==='string'?request:request.url);}
  async keys(){return [...this.entries.keys()].map(url=>new Request(url));}
}
class MemoryCaches {
  constructor(){this.entries=new Map();}
  async has(name){return this.entries.has(name);}
  async open(name){if(!this.entries.has(name))this.entries.set(name,new MemoryCache());return this.entries.get(name);}
  async keys(){return [...this.entries.keys()];}
  async delete(name){return this.entries.delete(name);}
}
function worker(built,{caches=new MemoryCaches(),clients=[]}={}) {
  const handlers=new Map(),requests=[];
  const state={online:true,network:built.network,updates:0,skips:0,claims:0,clients};
  const self={location:{origin:ORIGIN},registration:{update:async()=>{state.updates++;}},
    clients:{matchAll:async()=>state.clients,claim:async()=>{state.claims++;}},skipWaiting:async()=>{state.skips++;},
    addEventListener:(type,callback)=>handlers.set(type,callback)};
  const fetch=async(input,options={})=>{
    const url=typeof input==='string'?input:input.url;
    requests.push({url,method:options.method||input.method||'GET',options});
    if(!state.online)throw Error('synthetic offline');
    const body=state.network.get(new URL(url).pathname);
    return new Response(body??'network response',{status:200,headers:{'Content-Type':'text/plain'}});
  };
  vm.runInNewContext(built.swSource,{self,caches,fetch,crypto:webcrypto,Request,Response,URL,Uint8Array,Date,Set,Map});
  function dispatch(type,properties={}) {
    const waits=[];let response;
    const event={waitUntil:promise=>waits.push(Promise.resolve(promise)),respondWith:promise=>{response=Promise.resolve(promise);},...properties};
    handlers.get(type)(event);
    return {response,done:Promise.all(waits),event};
  }
  const request=(path,options={})=>dispatch('fetch',{request:{url:ORIGIN+path,method:'GET',mode:'cors'},
    clientId:'',resultingClientId:'',...options});
  return {dispatch,request,state,caches,requests};
}
async function installed(built,options) {
  const runtime=worker(built,options);await runtime.dispatch('install').done;await runtime.dispatch('activate').done;return runtime;
}
async function fetched(runtime,path,options) {
  const event=runtime.request(path,options),response=await event.response;await event.done;return response;
}

test('build hashes every shell byte and canonical SW, with deterministic versioned HTML and no self-cache cycle',()=>{
  const first=fixture(),again=buildServiceWorkerAssets({indexHtml:first.indexHtml,swSource:first.swSource,assets:first.assets});
  assert.equal(again.version,first.version);assert.equal(again.swSource,first.swSource);assert.equal(again.indexHtml,first.indexHtml);
  for(const path of shellAssetPaths.filter(path=>path.endsWith('.css')||path==='/app.js'))
    assert.ok(first.indexHtml.includes(`${path}?__shell=${first.version}`));
  assert.match(first.indexHtml,new RegExp(`name="haoduoyu-shell-version" content="${first.version}"`));
  assert.ok(first.indexHtml.includes(`v=existing&amp;__shell=${first.version}`));
  assert.ok(!first.config.assets.some(asset=>asset.url==='/sw.js'));
  const changed={...first.assets,'/tokens.css':'a real changed token stylesheet'};
  assert.notEqual(buildServiceWorkerAssets({indexHtml:first.indexHtml,swSource:template,assets:changed}).version,first.version);
  assert.notEqual(buildServiceWorkerAssets({indexHtml:first.indexHtml,swSource:template+'\n// changed worker behavior',
    assets:first.assets}).version,first.version);
  assert.throws(()=>buildServiceWorkerAssets({indexHtml:first.indexHtml,swSource:template,
    assets:{...first.assets,'/api/v1/auth/me':'private'}}));
  const missing={...first.assets};delete missing['/mobile.css'];
  assert.throws(()=>buildServiceWorkerAssets({indexHtml:first.indexHtml,swSource:template,assets:missing}));
});

test('installation validates the complete generation and never activates or claims pages automatically',async()=>{
  const built=fixture(),runtime=await installed(built);
  assert.equal(runtime.state.skips,0);assert.equal(runtime.state.claims,0);
  assert.equal(runtime.requests.length,built.config.assets.length);
  assert.ok(runtime.requests.every(request=>request.options.cache==='no-store'&&request.options.credentials==='omit'));
  const bad=fixture('B'),second=worker(bad,{caches:runtime.caches});second.state.network=runtime.state.network;
  await assert.rejects(second.dispatch('install').done,/SHELL_HASH_MISMATCH/);
  assert.equal(await runtime.caches.has(PREFIX+bad.version),false);
  assert.equal(await runtime.caches.has(PREFIX+built.version),true);
  assert.equal(second.state.skips,0);
});

test('offline navigation preserves the requested URL and boots a complete shell even without resultingClientId',async()=>{
  const built=fixture(),runtime=await installed(built);runtime.state.online=false;
  const path='/?page=notes&date=2026-10-26&entry=private-query&__shell=unrelated-navigation-query';
  const event=runtime.request(path,{request:{url:ORIGIN+path,method:'GET',mode:'navigate'}});
  const response=await event.response;await event.done;
  assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);
  assert.equal(event.event.request.url,ORIGIN+path);assert.equal(await response.text(),built.indexHtml);
  for(const name of await runtime.caches.keys())for(const request of await (await runtime.caches.open(name)).keys())
    assert.ok(!request.url.includes('private-query'));
  const css=await fetched(runtime,`/mobile.css?__shell=${built.version}`);
  assert.equal(await css.text(),built.assets['/mobile.css']);
});

test('a new active worker serves old page assets from their pinned generation, never mixed app or CSS',async()=>{
  const a=fixture('A',{'/retired.css':'old optional CSS'}),old=await installed(a,{clients:[{id:'old-tab'}]});
  await fetched(old,`/app.js?__shell=${a.version}`,{clientId:'old-tab'});
  const b=fixture('B'),current=await installed(b,{caches:old.caches,clients:[{id:'old-tab'},{id:'new-tab'}]});
  current.state.online=false;
  assert.equal(await (await fetched(current,`/app.js?__shell=${a.version}`,{clientId:'old-tab'})).text(),a.assets['/app.js']);
  assert.equal(await (await fetched(current,'/mobile.css',{clientId:'old-tab'})).text(),a.assets['/mobile.css']);
  assert.equal(await (await fetched(current,`/retired.css?__shell=${a.version}`,{clientId:'old-tab'})).text(),'old optional CSS');
  assert.equal(await (await fetched(current,`/app.js?__shell=${b.version}`,{clientId:'new-tab'})).text(),b.assets['/app.js']);
  assert.equal((await fetched(current,`/app.js?__shell=${'f'.repeat(64)}`)).status,503);
});

test('background refresh detects a different build without replacing any old-generation response',async()=>{
  const a=fixture('A'),runtime=await installed(a),b=fixture('B');runtime.state.network=b.network;
  const response=await fetched(runtime,`/app.js?__shell=${a.version}`);
  assert.equal(await response.text(),a.assets['/app.js']);assert.equal(runtime.state.updates,1);
  const cached=await (await runtime.caches.open(PREFIX+a.version)).match(ORIGIN+'/app.js');
  assert.equal(await cached.text(),a.assets['/app.js']);
});

test('API methods, health and auth always use the original network request with no-store, including offline failure',async()=>{
  const runtime=await installed(fixture()),before=await runtime.caches.keys();
  for(const path of ['/api/v1','/api/v1/todos','/api/v1/auth/me','/health','/auth/me','/login','/logout']) {
    for(const method of ['GET','POST','DELETE']) {
      const request=new Request(ORIGIN+path,{method,headers:{Authorization:'synthetic-private-header'}});
      const event=runtime.request(path,{request});await event.response;await event.done;
      const call=runtime.requests.at(-1);assert.equal(call.method,method);assert.equal(call.options.cache,'no-store');
    }
  }
  runtime.state.online=false;
  const event=runtime.request('/api/v1/todos');await assert.rejects(event.response,/synthetic offline/);await event.done;
  assert.deepEqual(await runtime.caches.keys(),before);
  for(const name of before)for(const request of await (await runtime.caches.open(name)).keys())
    assert.ok(!request.url.includes('/api/v1')&&!request.url.includes('/health')&&!request.url.includes('/auth'));
  assert.equal(runtime.request('/not-shell').response,undefined);
  assert.equal(runtime.request('/app.js',{request:{url:'https://outside.example/app.js',method:'GET'}}).response,undefined);
  assert.equal(runtime.request('/app.js',{request:{url:ORIGIN+'/app.js',method:'POST'}}).response,undefined);
});

test('activation prunes only unreferenced shell generations and closed pins, while rollback reuses a verified old shell',async()=>{
  const a=fixture('A'),old=await installed(a,{clients:[{id:'live-a'},{id:'closed-a'}]});
  await fetched(old,`/app.js?__shell=${a.version}`,{clientId:'live-a'});
  await fetched(old,`/app.js?__shell=${a.version}`,{clientId:'closed-a'});
  const b=fixture('B');await installed(b,{caches:old.caches,clients:[{id:'live-a'}]});
  const c=fixture('C');await installed(c,{caches:old.caches,clients:[{id:'live-a'}]});
  await (await old.caches.open('unrelated-cache')).put(ORIGIN+'/unrelated',new Response('untouched'));
  const d=fixture('D');await installed(d,{caches:old.caches,clients:[{id:'live-a'}]});
  assert.equal(await old.caches.has(PREFIX+a.version),true);assert.equal(await old.caches.has(PREFIX+c.version),true);
  assert.equal(await old.caches.has(PREFIX+d.version),true);assert.equal(await old.caches.has(PREFIX+b.version),false);
  assert.equal(await old.caches.has('unrelated-cache'),true);
  const pins=await (await old.caches.open(PINS)).keys();assert.ok(!pins.some(request=>request.url.endsWith('/closed-a')));
  const rollback=worker(a,{caches:old.caches,clients:[{id:'live-a'}]});rollback.state.online=false;
  await rollback.dispatch('install').done;await rollback.dispatch('activate').done;
  assert.equal(rollback.requests.length,0);assert.equal(await old.caches.has(PREFIX+d.version),true);
});

test('only a same-origin window update message requests activation; installation alone never does',async()=>{
  const runtime=await installed(fixture());
  await runtime.dispatch('message',{data:{type:'HAODUOYU_SHELL_ACTIVATE'},source:{type:'window',url:'https://outside.example',id:'x'}}).done;
  assert.equal(runtime.state.skips,0);
  await runtime.dispatch('message',{data:{type:'HAODUOYU_SHELL_ACTIVATE'},source:{type:'window',url:ORIGIN+'/?page=todos',id:'x'}}).done;
  assert.equal(runtime.state.skips,1);assert.equal(runtime.state.claims,0);
});

function browserFixture() {
  class Element extends EventTarget {
    setAttribute(){}remove(){this.removed=true;}
  }
  const version='a'.repeat(64),messages=[],controller=new EventTarget(),waiting=new EventTarget();
  controller.postMessage=message=>messages.push({target:'controller',message});
  waiting.postMessage=message=>messages.push({target:'waiting',message});
  const serviceWorker=new EventTarget(),registration=new EventTarget();
  registration.active=controller;registration.waiting=waiting;registration.update=async()=>{};
  serviceWorker.controller=controller;
  serviceWorker.register=async(path,options)=>{assert.equal(path,'/sw.js');assert.deepEqual(options,{scope:'/',updateViaCache:'none'});return registration;};
  const document=new EventTarget(),page=new EventTarget(),children=[];let reloads=0;
  document.querySelector=()=>({content:version});document.createElement=()=>new Element();document.body={append:element=>children.push(element)};
  page.location={reload:()=>{reloads++;}};page.CustomEvent=CustomEvent;
  return {navigator:{serviceWorker},window:page,document,registration,waiting,children,messages,get reloads(){return reloads;}};
}

test('the page offers an update but reloads only the clicked page, exactly once after activation',async()=>{
  const browser=browserFixture(),handle=await startServiceWorker(browser);
  assert.equal(browser.children.length,1);assert.equal(browser.children[0].textContent,'有新版本');
  assert.ok(!browser.messages.some(item=>item.message.type==='HAODUOYU_SHELL_ACTIVATE'));
  browser.navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));assert.equal(browser.reloads,0);
  browser.children[0].dispatchEvent(new Event('click'));
  assert.equal(browser.messages.filter(item=>item.message.type==='HAODUOYU_SHELL_ACTIVATE').length,1);
  browser.navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
  browser.waiting.state='activated';browser.waiting.dispatchEvent(new Event('statechange'));
  assert.equal(browser.reloads,1);handle.destroy();assert.equal(browser.children[0].removed,true);
});

test('only the protocol-one native bridge forwards a sync request; old events and unsupported registration are harmless',async()=>{
  const browser=browserFixture(),requests=[];
  browser.window.addEventListener('haoduoyu:sync-request',event=>requests.push(event.detail));
  const handle=await startServiceWorker(browser);browser.window.dispatchEvent(new Event('native-online'));
  for(const detail of [undefined,{protocol:0,reason:'network-restored'},{protocol:'1',reason:'network-restored'},
    {protocol:1,reason:'other'}])browser.window.dispatchEvent(new CustomEvent('haoduoyu:native-online',{detail}));
  assert.equal(requests.length,0);
  browser.window.dispatchEvent(new CustomEvent('haoduoyu:native-online',{detail:{protocol:1,reason:'network-restored'}}));
  assert.deepEqual(requests,[{source:'native-online'}]);
  assert.ok(browser.messages.every(item=>item.message.type==='HAODUOYU_SHELL_CLIENT_VERSION'));
  handle.destroy();
  browser.window.dispatchEvent(new CustomEvent('haoduoyu:native-online',{detail:{protocol:1,reason:'network-restored'}}));
  assert.equal(requests.length,1);
  assert.equal(await startServiceWorker({navigator:{},window:browser.window,document:browser.document}),null);
});
