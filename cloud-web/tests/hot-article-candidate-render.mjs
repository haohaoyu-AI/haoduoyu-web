// Actual page JSX + React rendering. Hooks/fetch replaced with offline fixtures.
import assert from 'node:assert/strict';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './hot-discovery-loader.mjs';
const stamp='2026-10-08T08:00:00Z';
const ownerScope='TEST ONLY candidate owner scope';
class Clock extends Date{static now(){return Date.parse(stamp);}}
const account={id:'00000000-0000-4000-8000-000000000001',name:'TEST ONLY 文娱账号',url:'https://www.toutiao.com/c/user/123456789/',created:stamp};
const metric=(display,lower,exact=null)=>({display,lower_bound:lower,upper_bound:lower,exact});
const article=i=>({id:String(i),account_id:account.id,url:`https://www.toutiao.com/article/${1000000000000000000n+BigInt(i)}/`,title:`TEST ONLY 合成电影 ${i}`,published_at:'2026-10-07T08:00:00Z',reads:metric('12万阅读',110000),likes:metric('0赞',0,0),comments:metric(null,null),evidence:{card_html:'TEST ONLY evidence hidden'}});
const pool=accounts=>({owner_scope:ownerScope,accounts,scan:null});
const view=(state='ready',articles=[article(1)])=>({owner_scope:ownerScope,accounts:[account],scan:{id:'fixture-scan',request_key:crypto.randomUUID(),state,pool_changed:false,created:stamp,result:{articles,observations:[{account_id:account.id,outcome:state==='blocked'?'blocked':'checked',reason:'公开访问被拒绝或需验证，已停止访问该账号'}]}}});
function actualPage(current,options={}){
 const states=[current,options.busy??false,options.message??'',options.adding??false,options.name??'',options.url??'',options.now??Date.parse(stamp)];let index=0,refIndex=0,effectIndex=0,element;const effects=[],refs=[];
 const hooks={...React,useState:init=>{const i=index++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useEffect:fn=>{effects[effectIndex++]=fn;},useCallback:fn=>fn,useRef:current=>refs[refIndex++]??(refs[refIndex-1]={current})};
 const pageExports=loadTS('app/imitation/page.tsx',{'react':hooks,'react/jsx-runtime':jsxRuntime,'../../components/studio-nav':{default:()=>null},'./imitation.css':{}},{Date:Clock,...options.globals,fetch:options.fetch??(()=>{throw Error('no network in static render');})});
 function render(){index=refIndex=effectIndex=0;element=pageExports.default();assert.equal(index,states.length);return element;}
 render();return {get element(){return element;},states,effects,render,async mount(){effects[0]();await new Promise(resolve=>setImmediate(resolve));render();}};
}
const render=(v,o)=>renderToStaticMarkup(actualPage(v,o).element);
for(const [v,options,expected]of [[null,{},'正在读取账号池'],[pool([]),{},'请先添加'],[view('collecting',[]),{},'正在扫描'],[view('blocked',[]),{},'尚未完整核验'],[view('interrupted',[]),{},'上次扫描未完成'],[view('ready'),{busy:true},'正在扫描'],[view('ready'),{message:'账号池读取失败'},'账号池读取失败']]){
 const html=render(v,options);assert.ok(html.includes(expected));assert.ok(html.includes('对标账号'));assert.ok(html.includes('添加账号'));assert.ok(!html.includes('暂无符合条件的热文'),'loading, failure and incomplete never masquerade as confirmed empty');
}
assert.match(render(view('empty',[])),/暂无符合条件的热文/);
const withPoolChange=view('ready');withPoolChange.scan.pool_changed=true;assert.match(render(withPoolChange),/账号池已更新，请刷新/);
assert.equal((render(view('ready',Array.from({length:8},(_,i)=>article(i+1)))).match(/class="imitation-card"/g)??[]).length,8,'eligible rows below the current cap remain visible');
const html=render(view('ready',Array.from({length:108},(_,i)=>article(i+1))));assert.equal((html.match(/class="imitation-card"/g)??[]).length,100,'the current contract still enforces its bounded 100-result cap');assert.match(html,/阅读 <b>12万<\/b>/);assert.match(html,/点赞 <b>0<\/b>/);assert.match(html,/评论 <b>不可获取<\/b>/);assert.ok(!html.includes('120,000'));assert.ok(!html.includes('evidence hidden'));
for(const row of [...html.matchAll(/<article class="imitation-card">([\s\S]*?)<\/article>/g)])assert.equal((row[1].match(/<a /g)??[]).length,1);
const stale=article(9);stale.published_at='2026-10-05T07:59:59Z';assert.equal((render(view('ready',[stale])).match(/class="imitation-card"/g)??[]).length,0);
const removed=article(9);removed.account_id='other';assert.equal((render(view('ready',[removed])).match(/class="imitation-card"/g)??[]).length,0);
const belowThreshold=article(10);belowThreshold.reads.lower_bound=9999;const unknownReads=article(11);unknownReads.reads.lower_bound=null;assert.equal((render(view('ready',[belowThreshold,unknownReads])).match(/class="imitation-card"/g)??[]).length,0,'unverified or insufficient read lower bounds are never eligible');
function button(element,label){if(!React.isValidElement(element))return null;if(element.type==='button'&&element.props.children===label)return element;for(const child of React.Children.toArray(element.props.children)){const found=button(child,label);if(found)return found;}return null;}
let finish;const requests=[];const fixture=view('ready');
const p=actualPage(pool([account]),{fetch:(url,options)=>{requests.push({url,options});if(!options.method)return Promise.resolve(Response.json(pool([account])));return new Promise(resolve=>{finish=resolve;});}});await p.mount();
const refresh=button(p.element,'刷新热文').props.onClick;const pending=refresh();await refresh();const writes=requests.filter(r=>r.options?.method==='POST');assert.equal(writes.length,1,'duplicate click lock');assert.equal(requests.length,2,'only the authenticated fixture read precedes the single mutation');
const payload=JSON.parse(writes[0].options.body);assert.equal(payload.action,'refresh');assert.equal(payload.writer,undefined);assert.equal(payload.authority_id,undefined);assert.equal(writes[0].url,'/api/imitation/discovery');assert.equal(writes[0].options.headers['x-hot-article-discovery'],'1');
finish(Response.json(fixture));await pending;assert.equal(p.states[0].scan.id,fixture.scan.id);assert.equal(p.states[1],false);
let attempts=0;const retryRequests=[];
const retry=actualPage(pool([account]),{fetch:async(url,options)=>{retryRequests.push({url,options});if(options?.method==='POST'){if(++attempts===1)throw Error('offline interrupted');return Response.json(fixture);}return Response.json(pool([account]));}});await retry.mount();
const retryRefresh=button(retry.element,'刷新热文').props.onClick;await retryRefresh();await retryRefresh();
const posts=retryRequests.filter(r=>r.options?.method==='POST');assert.equal(posts.length,2);assert.equal(posts[0].options.body,posts[1].options.body,'uncertain retry retains frozen request key');const receipt=retryRequests.find(r=>r.url.includes('request_key='));assert.ok(receipt.url.includes(JSON.parse(posts[0].options.body).request_key));assert.equal(receipt.options.method,undefined,'unknown result recovery is read-only');
const add=actualPage(pool([]),{adding:true,name:'TEST ONLY 输入保留',url:account.url,fetch:async(_url,options)=>!options.method?Response.json(pool([])):Response.json({error:'保存失败'},{status:503})});await add.mount();
function form(element){if(!React.isValidElement(element))return null;if(element.type==='form')return element;for(const child of React.Children.toArray(element.props.children)){const found=form(child);if(found)return found;}return null;}
form(add.element).props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));assert.equal(add.states[4],'TEST ONLY 输入保留');assert.equal(add.states[5],account.url);assert.equal(add.states[2],'保存失败');
for(const [action,changed,expected]of [['add',true,'账号已保存。'],['add',false,'该账号已在列表中，未重复添加。'],['remove',true,'账号已移除。'],['remove',false,'该账号已不在列表中。'],['add',undefined,'账号池已确认。'],['remove',undefined,'账号池已确认。']]){
 const reply={...pool(action==='remove'&&changed!==false?[]:[account]),...(changed===undefined?{}:{account_change:{action,changed}})};
 const feedback=actualPage(pool([account]),{adding:action==='add',name:'TEST ONLY 新输入名称',url:account.url,fetch:async(_url,options)=>Response.json(options.method==='POST'?reply:pool([account]))});await feedback.mount();
 if(action==='add')form(feedback.element).props.onSubmit({preventDefault(){}});else await button(feedback.element,'移除').props.onClick();
 await new Promise(resolve=>setImmediate(resolve));assert.equal(feedback.states[2],expected,'operation feedback distinguishes a real change, idempotent no-op and an older response without a change receipt');
 assert.equal(feedback.states[0].accounts.length,reply.accounts.length);
 if(action==='add')assert.equal(feedback.states[0].accounts[0].name,account.name,'no-op feedback does not imply the newly entered label was saved');
}
let tick,pollCalls=0,initialRead=true;const expiredView=view('collecting',[]);expiredView.scan.created='2026-10-08T07:58:00Z';
const polling=actualPage(expiredView,{globals:{setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>{}},fetch:async()=>{if(initialRead){initialRead=false;return Response.json(expiredView);}pollCalls++;throw Error('TEST ONLY offline polling failure');}});await polling.mount();
polling.effects[1]();tick();tick();assert.equal(pollCalls,1,'polls never overlap');await new Promise(resolve=>setImmediate(resolve));assert.equal(polling.states[0].scan.state,'interrupted','expired unreachable scan unlocks refresh');
console.log('PASS actual discovery page: scoped account pool/add form, raw rounded display, bounded 100 cap, 3-day/removed/read-bound filtering, truthful loading/blocked/expired/empty states, locked free refresh, read-only receipt recovery, frozen-intent retry, input preserved on failure');
