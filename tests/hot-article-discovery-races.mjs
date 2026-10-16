// Isolated SQLite, actual store/page code; synthetic fixtures, no platform requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './hot-discovery-loader.mjs';
let now=Date.parse('2026-10-08T08:00:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync('drizzle/0034_parallel_doctor_spectrum.sql','utf8'));
// Control both clocks for deterministic execution-time expiry. Production SQL
// uses SQLite's native clock; the guard is still executed inside the statement.
sqlite.function('strftime',(format,target)=>{assert.equal(format,'%Y-%m-%dT%H:%M:%fZ');assert.equal(target,'now');return new Date(now).toISOString();});
let pauseNext=false,release,paused;
const db={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async first(){return sqlite.prepare(sql).get(...args)??null;},async run(){if(pauseNext&&sql.startsWith('UPDATE hot_benchmark_scans')){pauseNext=false;await new Promise(resolve=>{release=resolve;paused=true;});}return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};}};
const store=loadTS('lib/hot-article-discovery-store.ts',{'./test-store':{db:()=>db}},{Date:Clock,fetch:async()=>{throw Error('busy HTTP route must never fetch');}});
const owner='TEST ONLY race owner',accountInput={name:'TEST ONLY 影视',url:'https://www.toutiao.com/c/user/123456789/'};
const account=(await store.addBenchmark(owner,accountInput)).accounts[0];
let calls=0;const publicPage=async()=>{calls++;return new Response(`<main><ul><li><h3><a href="https://www.toutiao.com/article/1000000000000000000/">TEST ONLY 合成影视</a></h3><a rel="author" href="${account.url}">本文作者</a><time datetime="2026-10-07T08:00:00Z">2026-10-07 08:00:00</time><div class="article-stats"><span>12万阅读</span></div></li></ul></main>`,{headers:{'content-type':'text/html'}});};
async function beginPaused(){paused=false;pauseNext=true;const key=crypto.randomUUID(),pending=store.refreshDiscovery(owner,key,publicPage);while(!paused)await new Promise(resolve=>setImmediate(resolve));return {key,pending};}
const first=await beginPaused();now+=61000;
assert.equal((await store.readDiscovery(owner,first.key)).scan.state,'interrupted');
const successorKey=crypto.randomUUID(),successor=await store.refreshDiscovery(owner,successorKey,publicPage);
assert.equal(successor.scan.state,'ready');assert.equal(successor.scan.result.articles.length,1);release();
const late=await first.pending;assert.equal(late.scan.state,'interrupted');assert.equal(late.scan.result,null);
assert.equal(sqlite.prepare('SELECT state FROM hot_benchmark_scans WHERE request_key=?').get(first.key).state,'collecting','expired late UPDATE never commits');
assert.equal((await store.readDiscovery(owner)).scan.request_key,successorKey,'new result remains latest');
await store.refreshDiscovery(owner,first.key,()=>{throw Error('old accepted intent must not rescan');});assert.equal(calls,2);
const alone=await beginPaused();now+=61000;release();assert.equal((await alone.pending).scan.state,'interrupted','execution-time expiry also works without successor');
const superseded=await beginPaused();const newerID=crypto.randomUUID();
sqlite.prepare("INSERT INTO hot_benchmark_scans(id,owner,request_key,state,accounts_json,created,expires,updated) VALUES(?,?,?,'blocked',?,?,?,?)").run(newerID,owner,crypto.randomUUID(),JSON.stringify([account]),new Date(now).toISOString(),new Date(now+60000).toISOString(),new Date(now).toISOString());
release();assert.equal((await superseded.pending).scan.state,'superseded','successor protects against clock rollback or externally interrupted rows');now+=61000;
const active=await beginPaused(),busyKey=crypto.randomUUID();
await assert.rejects(()=>store.refreshDiscovery(owner,busyKey,publicPage),error=>error instanceof store.DiscoveryBusyError&&error.view.scan.request_key===active.key);
const callsBefore=calls;assert.equal((await store.readDiscovery(owner,busyKey)).scan,null);
const route=loadTS('app/api/imitation/discovery/route.ts',{'../../../../lib/test-store':{owner:()=>owner},'../../../../lib/hot-article-discovery-store':store});
const response=await route.POST(new Request('https://private.example/api/imitation/discovery',{method:'POST',headers:{origin:'https://private.example','x-hot-article-discovery':'1'},body:JSON.stringify({action:'refresh',request_key:busyKey})}));
assert.equal(response.status,409);const busyBody=await response.json();assert.equal(busyBody.code,'scan_busy');assert.equal(busyBody.view.scan.request_key,active.key);assert.equal(calls,callsBefore,'unaccepted busy requests never fetch');release();await active.pending;
sqlite.close();

const metric={display:'12万阅读',lower_bound:110000,upper_bound:130000,exact:null};
const article={id:'TEST ONLY article',account_id:account.id,url:'https://www.toutiao.com/article/1000000000000000000/',title:'TEST ONLY 电影即将过期',published_at:new Date(now-3*86400000+1000).toISOString(),reads:metric,likes:{...metric,display:null},comments:{...metric,display:null}};
const ready={accounts:[account],scan:{id:'TEST ONLY scan',request_key:crypto.randomUUID(),state:'ready',created:new Date(now).toISOString(),pool_changed:false,result:{articles:[article],observations:[]}}};
const states=[],refs=[],effects=[],timers=new Map(),listeners=new Map();let stateIndex=0,refIndex=0,effectIndex=0,timerID=0;
const hooks={...React,useState:init=>{const i=stateIndex++;if(!(i in states))states[i]=i===0?ready:typeof init==='function'?init():init;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef:init=>refs[refIndex++]??(refs[refIndex-1]={current:init}),useEffect:fn=>{effects[effectIndex++]=fn;},useCallback:fn=>fn};
const eventTarget=prefix=>({addEventListener:(type,fn)=>listeners.set(prefix+type,fn),removeEventListener:(type,fn)=>{assert.equal(listeners.get(prefix+type),fn);listeners.delete(prefix+type);}});
let posts=0;const postedKeys=[];
const page=loadTS('app/imitation/page.tsx',{'react':hooks,'react/jsx-runtime':jsxRuntime,'../../components/studio-nav':{default:()=>null},'./imitation.css':{}},{Date:Clock,window:eventTarget('window:'),document:eventTarget('document:'),setTimeout:(fn,delay)=>{const id=++timerID;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),fetch:async(url,options)=>{assert.equal(url,'/api/imitation/discovery');assert.equal(options.method,'POST');postedKeys.push(JSON.parse(options.body).request_key);posts++;return posts===1?Response.json(busyBody,{status:409}):Response.json(ready);}});
function render(){stateIndex=refIndex=effectIndex=0;const element=page.default();return {element,html:renderToStaticMarkup(element)};}
const initial=render();assert.match(initial.html,/imitation-card/);const focusCleanup=effects[2](),timerCleanup=effects[3]();
assert.equal(timers.size,1);assert.equal([...timers.values()][0].delay,1001);now+=2000;[...timers.values()][0].fn();
assert.ok(!render().html.includes('class="imitation-card"'),'idle timer removes expired row');timerCleanup();assert.equal(timers.size,0);
now-=2000;listeners.get('window:focus')();assert.match(render().html,/class="imitation-card"/);
now+=2000;listeners.get('document:visibilitychange')();assert.ok(!render().html.includes('class="imitation-card"'),'returning to tab refreshes expiry clock');focusCleanup();assert.equal(listeners.size,0);
function button(element,label){if(!React.isValidElement(element))return null;if(element.type==='button'&&element.props.children===label)return element;for(const child of React.Children.toArray(element.props.children)){const found=button(child,label);if(found)return found;}return null;}
await button(initial.element,'刷新热文').props.onClick();assert.equal(posts,1);assert.match(states[2],/本次刷新未接纳/);assert.equal(states[0].scan.request_key,active.key);assert.equal(states[1],false);assert.equal(refs[0].current,null,'unaccepted intent is cleared');
states[0]=ready;await button(render().element,'刷新热文').props.onClick();assert.equal(posts,2);assert.notEqual(postedKeys[0],postedKeys[1],'later user refresh gets new intent, no hidden retry');
console.log('PASS delayed SQL execution/expiry/successor guards, busy HTTP409/no fetch, idle expiry/focus/visibility cleanup, UI follows accepted scan and clears unaccepted intent');
