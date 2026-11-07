import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {frontendBundle} from '../scripts/frontend-build.mjs';
import {createOfflineRuntime} from '../web/offline/runtime.mjs';
import {createMemoryDB} from '../web/offline/db.mjs';

// Expose the existing mounting function only in this isolated test bundle.
const ui = await build({entryPoints:['web/offline/ui.mjs'],bundle:true,format:'cjs',platform:'node',write:false,
  plugins:[{name:'test-export',setup(b){b.onLoad({filter:/[\\/]web[\\/]offline[\\/]ui\.mjs$/},async args=>
    ({contents:(await readFile(args.path,'utf8'))+'\nexport {mountRuntimeUI};\n',loader:'js'}));}}]});
const context=vm.createContext({module:{exports:{}},exports:{},URL,AbortController,structuredClone,
  CustomEvent:class {constructor(type,options){this.type=type;this.detail=options?.detail;}},
  MutationObserver:class {observe(){} disconnect(){}}});
new vm.Script(ui.outputFiles[0].text).runInContext(context);
const {mountRuntimeUI}=context.module.exports;

class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.parent=null;this.dataset={};this.attributes={};this.events={};this.hidden=false;this.textContent='';}
  setAttribute(key,value){this.attributes[key]=String(value);}
  addEventListener(name,callback){this.events[name]=callback;}
  append(...nodes){for(const node of nodes){if(node.fragment){this.append(...node.children);continue;}if(node.parent)node.remove();node.parent=this;this.children.push(node);}}
  replaceChildren(...nodes){for(const node of this.children)node.parent=null;this.children=[];this.append(...nodes);}
  remove(){if(!this.parent)return;this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}
  contains(target){return this===target||this.children.some(child=>child.contains(target));}
  get isConnected(){return Boolean(this.parent);}
}
const descendants=root=>[root,...root.children.flatMap(descendants)];
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const body=new Element('body'),host=new Element('div'),content=new Element('div');
  host.id='offline-settings-entry';content.id='page-content';content.dataset={};body.append(host,content);
  const window={location:{href:'https://test.invalid/?page=settings'},dispatchEvent(){}};
  const document={body,defaultView:window,createElement:tag=>new Element(tag),
    createDocumentFragment(){const n=new Element('fragment');n.fragment=true;return n;},
    querySelector(selector){return selector==='#offline-settings-entry'?host:selector==='#page-content'?content:null;}};
  const local={id:'a',date:'2026-11-01',text:'local pending',completed:false,version:1};
  const conflict={key:'conflict-1',local,remote:{...local,text:'remote version',version:2},
    operation:{entity_type:'todo',source_id:'a'},resolved_at:null};
  let starts=0,syncs=0;const resolved=[];
  const runtime={state:{identity:{id:'synthetic'},online:false,pending:1,conflicts:1,phase:'offline'},
    subscribe(callback){callback(this.state);return ()=>{};},start(){starts++;return ()=>{};},
    queue:async()=>({operations:[{status:'queued',local}],conflicts:[conflict]}),
    resolve:async(key,choice)=>{resolved.push([key,choice]);return {};},sync(){syncs++;}};
  return {body,host,content,window,document,runtime,resolved,get starts(){return starts;},get syncs(){return syncs;}};
}

test('settings entry retains offline queue and conflict actions without a global or manual sync button',async()=>{
  const f=fixture();const stop=mountRuntimeUI(f.runtime,{document:f.document,window:f.window});
  const find=css=>descendants(f.body).find(node=>String(node.className||'').split(' ').includes(css));
  assert.equal(f.starts,1,'automatic runtime starts even when the indicator is moved');
  assert.equal(find('offline-state-button'),undefined);assert.ok(find('offline-settings-toggle'));
  assert.equal(f.content.hidden,true,'unavailable settings content is still disabled');
  assert.equal(f.host.hidden,false,'queue remains outside hidden settings content while offline');
  find('offline-settings-toggle').events.click();await flush();
  assert.ok(find('offline-queue-row'));assert.ok(find('offline-conflict'));assert.equal(find('offline-sync-now'),undefined);
  const actions=find('offline-conflict-actions');assert.equal(actions.children.length,3,'all three existing conflict choices remain available');
  await actions.children[1].events.click();assert.deepEqual(f.resolved,[['conflict-1','use-server']]);assert.equal(f.syncs,0);
  stop();assert.equal(f.host.children.length,0);
});

test('settings queue host is outside the content disabled while offline',async()=>{
  const source=Buffer.from(await frontendBundle()).toString('utf8');
  const start=source.indexOf('function mainContent()');const end=source.indexOf('function reuseShell()',start);
  const fn=source.slice(start,end);assert.ok(start>=0&&end>start);
  assert.ok(fn.indexOf('id="offline-settings-entry"')>=0);
  assert.ok(fn.indexOf('id="offline-settings-entry"')<fn.indexOf('id="page-content"'));
});

test('automatic synchronization still starts and retries on focus and online events',async()=>{
  let attempts=0;const events=new Map(),documentEvents=new Map();
  const runtime=createOfflineRuntime({db:createMemoryDB(),online:()=>true,request:async path=>{
    if(path==='/auth/me')attempts++;
    throw Object.assign(new Error('offline'),{code:'NETWORK_UNAVAILABLE'});
  }});
  const window={addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  const document={visibilityState:'visible',addEventListener:(name,fn)=>documentEvents.set(name,fn),removeEventListener:name=>documentEvents.delete(name)};
  const wait=async n=>{for(let i=0;i<50&&attempts<n;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(attempts>=n);};
  const stop=runtime.start({window,document,BroadcastChannel:null});
  try {
    await wait(1);await new Promise(resolve=>setTimeout(resolve,10));events.get('focus')();await wait(2);
    await new Promise(resolve=>setTimeout(resolve,10));events.get('online')();await wait(3);
    document.visibilityState='hidden';await new Promise(resolve=>setTimeout(resolve,10));const before=attempts;
    documentEvents.get('visibilitychange')();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(attempts,before);
  } finally {stop();runtime.stop();}
});
