// Actual page code; deterministic offline hooks, clocks and synthetic results.
import assert from 'node:assert/strict';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './hot-discovery-loader.mjs';
let now=Date.parse('2026-10-08T08:00:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const account={id:'TEST ONLY account',name:'TEST ONLY account',url:'https://www.toutiao.com/c/user/123456789/',created:new Date(now).toISOString()};
const empty={accounts:[account],scan:null},metric={display:'12万阅读',lower_bound:110000,upper_bound:130000,exact:null};
const view=published=>({accounts:[account],scan:{id:'TEST ONLY scan',request_key:crypto.randomUUID(),state:'ready',created:new Date(now).toISOString(),pool_changed:false,result:{articles:[{id:'TEST ONLY article',account_id:account.id,url:'https://www.toutiao.com/article/1000000000000000000/',title:'TEST ONLY clock 电影 article',published_at:new Date(published).toISOString(),reads:metric,likes:{...metric,display:null},comments:{...metric,display:null}}],observations:[]}}});
function harness(fetcher,deferExpiry=false){
 const states=[],refs=[],callbacks=[],records=[],timers=new Map();let si=0,ri=0,ci=0,ei=0,dirty=true,element,html,queue=[],deferred,timerID=0;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const hooks={...React,useState:init=>{const i=si++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],value=>{const next=typeof value==='function'?value(states[i]):value;if(!Object.is(next,states[i])){states[i]=next;dirty=true;}}];},useRef:init=>{const i=ri++;return refs[i]??(refs[i]={current:init});},useCallback:(fn,deps)=>{const i=ci++,old=callbacks[i];if(old&&same(old.deps,deps))return old.fn;callbacks[i]={fn,deps};return fn;},useEffect:(fn,deps)=>{const i=ei++,old=records[i];if(!old||!same(old.deps,deps)){records[i]={deps,cleanup:old?.cleanup};const run=()=>{old?.cleanup?.();records[i].cleanup=fn();};if(i===3&&deferExpiry)deferred=run;else queue.push(run);}}};
 const page=loadTS('app/imitation/page.tsx',{'react':hooks,'react/jsx-runtime':jsxRuntime,'../../components/studio-nav':{default:()=>null},'./imitation.css':{}},{Date:Clock,fetch:fetcher,setTimeout:(fn,delay)=>{const id=++timerID;timers.set(id,{fn,delay,at:now+delay});return id;},clearTimeout:id=>timers.delete(id)});
 function render(){dirty=false;si=ri=ci=ei=0;queue=[];element=page.default();html=renderToStaticMarkup(element);queue.forEach(run=>run());}
 async function settle(){for(let i=0;i<5;i++){if(dirty)render();await new Promise(resolve=>setImmediate(resolve));}if(dirty)render();}
 function button(node){if(!React.isValidElement(node))return null;if(node.type==='button'&&node.props.children==='刷新热文')return node;for(const child of React.Children.toArray(node.props.children)){const found=button(child);if(found)return found;}return null;}
 return {states,timers,get html(){return html;},settle,async refresh(){const refresh=button(element);assert.equal(refresh.props.disabled,false);await refresh.props.onClick();await settle();},async advanceTo(at){now=at;for(const [id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}await settle();},runDeferred(){deferExpiry=false;deferred();},unmount(){records.forEach(r=>r.cleanup?.());assert.equal(timers.size,0);}};
}
const failures=[];
for(const name of ['new publication after foreground idle','real expiry after foreground idle','effect delay uses execution clock']){
 now=Date.parse('2026-10-08T08:00:00Z');const mountedAt=now;let latest=empty;const deferred=name==='effect delay uses execution clock';
 if(deferred)latest=view(mountedAt+60*60000-72*3600000);
 const h=harness(async(_url,options={})=>Response.json(options.method==='POST'||deferred?latest:empty),deferred);
 try{
  await h.settle();await h.advanceTo(mountedAt+59*60000);
  if(name==='new publication after foreground idle'){
   latest=view(now-60000);await h.refresh();assert.equal(h.states[6],now);assert.match(h.html,/TEST ONLY clock 电影 article/,'08:58 publication appears after 08:59 refresh on page mounted at08:00');
  }else{
   const expiry=mountedAt+60*60000;
   if(deferred)h.runDeferred();else{latest=view(expiry-72*3600000);await h.refresh();}
   assert.match(h.html,/TEST ONLY clock 电影 article/);assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].at,expiry+1,'timer fires at09:00:00.001, not09:59');
   await h.advanceTo(expiry+1);assert.doesNotMatch(h.html,/TEST ONLY clock 电影 article/);
  }
  console.log('PASS '+name);
 }catch(error){failures.push(name);console.error('FAIL '+name+': '+error.message);}finally{h.unmount();}
}
assert.equal(failures.length,0,failures.join(', '));
