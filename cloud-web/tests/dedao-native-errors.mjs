// Source-level, isolated failure tests. No browser, network, credential vault,
// server, production task or database is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const privateMarkers=['SYNTHETIC_PRIVATE_SQL','SYNTHETIC_PRIVATE_HEADER','SYNTHETIC_PRIVATE_BODY'];
const dependencyError=()=>Error(privateMarkers.join(' '));

function sourceModule(relative,dependencies={},globals={}){
 const code=fs.readFileSync(path.join(root,relative),'utf8');
 const output=ts.transpileModule(code,{fileName:relative,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(output,{module,exports:module.exports,require:name=>{
  assert(name in dependencies,`Unhandled isolated import: ${name}`);
  return dependencies[name];
 },Request,Response,Headers,TextDecoder,TextEncoder,URL,crypto:webcrypto,console:{error:()=>assert.fail('unexpected source log'),log:()=>assert.fail('unexpected source log'),warn:()=>assert.fail('unexpected source log')},...globals},{filename:relative});
 return module.exports;
}
const contract=sourceModule('lib/dedao-contract.ts');
const syntheticToken='dn_'+'a'.repeat(64),authorization='Bearer '+syntheticToken;
const hash='b'.repeat(64);
const nativeRow={owner:'synthetic-owner',executor_id:'native-codex:11111111-1111-4111-8111-111111111111',thread_id:'11111111-1111-4111-8111-111111111111',session_id:'11111111-1111-4111-8111-111111111111',turn_id:'22222222-2222-4222-8222-222222222222',browser_session:'synthetic-edge',credential_hash:hash,credential_expires:'2999-01-01T00:00:00.000Z'};
function nativeHarness({failure=null,row=nativeRow}={}){
 let dbCalls=0,hashCalls=0;
 const original=dependencyError();
 const api=sourceModule('lib/dedao-native.ts',{
  './test-store':{db:()=>{
   dbCalls++;if(failure==='db')throw original;
   return {prepare:sql=>{
    if(failure==='prepare')throw original;
    assert.match(sql,/s\.credential_expires\s*>\s*\?/,'expiry must be enforced by the real authentication query');
    assert.match(sql,/s\.credential_hash\s*=\s*\?/);
    return {bind:(tokenHash,stamp)=>{
     if(failure==='bind')throw original;
     assert.equal(tokenHash,hash);assert(Number.isFinite(Date.parse(stamp)));
     return {first:async()=>{if(failure==='first')throw original;return row&&row.credential_expires>stamp?row:null;}};
    }};
   }};
  }},
  './writing-input':{hashText:async value=>{hashCalls++;assert.equal(value,syntheticToken);if(failure==='hash')throw original;return hash;}},
  './dedao-contract':contract,
 });
 assert.equal(typeof api.DedaoNativeAuthError,'function','authentication needs an explicit error class distinct from temporary dependency failures');
 return {api,original,get dbCalls(){return dbCalls;},get hashCalls(){return hashCalls;}};
}

for(const value of [null,'','Bearer bad','Bearer dn_'+'a'.repeat(63),'Bearer dn_'+'A'.repeat(64),'Basic '+syntheticToken]){
 const h=nativeHarness();
 await assert.rejects(()=>h.api.authenticateDedaoNative(value),error=>error instanceof h.api.DedaoNativeAuthError);
 assert.equal(h.hashCalls,0);assert.equal(h.dbCalls,0);
}
for(const row of [null,{...nativeRow,credential_expires:'2000-01-01T00:00:00.000Z'}]){
 const h=nativeHarness({row});
 await assert.rejects(()=>h.api.authenticateDedaoNative(authorization),error=>error instanceof h.api.DedaoNativeAuthError);
}
for(const failure of ['hash','db','prepare','bind','first']){
 const h=nativeHarness({failure});
 await assert.rejects(()=>h.api.authenticateDedaoNative(authorization),error=>error===h.original&&!(error instanceof h.api.DedaoNativeAuthError),'dependency failure must not become a credential failure');
}
{
 const h=nativeHarness(),context=await h.api.authenticateDedaoNative(authorization);
 assert.equal(context.owner,nativeRow.owner);assert.equal(context.credential_hash,hash);
}

function routeHarness(native,bridge=async()=>({ok:true})){
 const logs=[],calls=[];
 const route=sourceModule('app/api/dedao/native/route.ts',{
  '../../../../lib/dedao-native':native,
  '../../../../lib/dedao':{dedaoNativeBridgeCall:async(...args)=>{calls.push(args);return bridge(...args);}},
  '../../../../lib/dedao-contract':contract,
 },{console:{error:(...args)=>logs.push(args),warn:(...args)=>logs.push(args),log:(...args)=>logs.push(args)}});
 return {route,logs,calls};
}
function nativeRequest({auth=authorization,body=JSON.stringify({operation:'read',args:{}}),headers={}}={}){
 return new Request('https://synthetic.invalid/api/dedao/native',{method:'POST',headers:{'Content-Type':'application/json',...(auth===null?{}:{Authorization:auth}),...headers},body});
}
function assertPrivate(value){
 const text=JSON.stringify(value);
 for(const marker of [...privateMarkers,syntheticToken,authorization])assert(!text.includes(marker),'private dependency details or credentials must not enter public output');
}
function assertFailureLog(logs,body,category){
 assert.equal(logs.length,1);assert.equal(logs[0].length,1);
 const log=logs[0][0];
 assert.deepEqual(Object.keys(log).sort(),['category','request_id']);
 assert.equal(log.category,category);assert.match(log.request_id,UUID);assert.equal(log.request_id,body.request_id);
 assertPrivate(logs);
}
for(const options of [{auth:null},{auth:'Bearer malformed'},{}]){
 const h=nativeHarness({row:options.auth===undefined?null:nativeRow}),r=routeHarness(h.api);
 const response=await r.route.POST(nativeRequest(options)),body=await response.json();
 assert.equal(response.status,401);assert.match(body.error,/授权|凭据/);assert.equal(r.calls.length,0);assert.equal(r.logs.length,0);assertPrivate(body);
}
{
 const h=nativeHarness({row:{...nativeRow,credential_expires:'2000-01-01T00:00:00.000Z'}}),r=routeHarness(h.api),response=await r.route.POST(nativeRequest());
 assert.equal(response.status,401);assert.equal(r.calls.length,0);assert.equal(r.logs.length,0);assertPrivate(await response.json());
}
const requestIds=new Set();
for(const failure of ['hash','db','prepare','bind','first']){
 const h=nativeHarness({failure}),r=routeHarness(h.api),response=await r.route.POST(nativeRequest()),body=await response.json();
 assert.equal(response.status,503);assert.equal(body.category,'native_auth_unavailable');assert.match(body.request_id,UUID);
 assert.match(body.error,/临时服务故障/);assert.match(body.error,/同一批次/);assert(!/重新授权|重新连接|授权无效|已过期/.test(body.error));
 assert.equal(r.calls.length,0);assert.match(response.headers.get('Cache-Control'),/no-store/);assertFailureLog(r.logs,body,'native_auth_unavailable');assertPrivate(body);
 assert(!requestIds.has(body.request_id),'each server-side failure needs a fresh generated reference');requestIds.add(body.request_id);
}
{
 const h=nativeHarness(),r=routeHarness(h.api,async()=>{throw new contract.DedaoError('合成业务冲突');}),response=await r.route.POST(nativeRequest());
 assert.equal(response.status,409);assert.equal((await response.json()).error,'合成业务冲突');assert.equal(r.logs.length,0);
}
{
 const h=nativeHarness(),r=routeHarness(h.api,async()=>{throw dependencyError();}),response=await r.route.POST(nativeRequest()),body=await response.json();
 assert.equal(response.status,503);assert.equal(body.category,'native_runtime_unavailable');assert.match(body.request_id,UUID);assert.match(body.error,/同一批次/);assertPrivate(body);assertFailureLog(r.logs,body,'native_runtime_unavailable');
}
{
 const h=nativeHarness(),r=routeHarness(h.api),response=await r.route.POST(nativeRequest({body:'{'}));
 assert.equal(response.status,400);assert.equal(r.calls.length,0);assert.equal(r.logs.length,0);
 const browser=await r.route.POST(nativeRequest({headers:{Origin:'https://synthetic.invalid'}}));
 assert.equal(browser.status,403);assert.equal(r.calls.length,0);
}

// A small React hook/JSX harness runs the page's real handlers and polling
// effect; all fetches below return synthetic local Response objects.
const native={thread_id:nativeRow.thread_id,turn_id:nativeRow.turn_id,turn_state:'active',safe_boundary:true,bridge_connected:true,last_observed_at:'2026-10-09T12:00:00.000Z',missing:[],lifecycle_source:'codex_app_tools',lifecycle_connected:true};
const connection={connected:true,accept_queue_ready:true,event_subscription:true,executor_connected:true,xiaoyu_connected:true,last_heartbeat:null,missing:[],required_configuration:[],execution_mode:'native_codex',native};
const item={id:'synthetic-item',ordinal:1,title:'合成故障保留文章',stage:11,stage_name:'已提交',submitted:true,submitted_at:'2026-10-09T12:00:00.000Z',article_id:'synthetic-article',submitted_handoff_id:'synthetic-handoff',download:{filename:'synthetic.docx',path:'D:\\synthetic\\synthetic.docx',size:1234,sha256:'c'.repeat(64)}};
const batch={id:'synthetic-batch',request_key:'synthetic-key',state:'paused',total:3,completed:1,current_ordinal:2,elapsed_seconds:99,execution_message:'合成已确认执行状态',execution_continuing:false,failure:null,can_resume:true,current:item,items:[item],items_truncated:false,execution_id:'native-turn:'+native.turn_id,runtime:'native_codex',native:{safe_boundary:true}};
const view=b=>({connection,batch:b});
const unavailable=()=>Response.json({error:'合成临时服务故障'},{status:503});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function pageHarness(fetchImpl){
 const hooks=[],effects=[],timers=[],calls=[],storage=new Map();let cursor=0,tree;
 function useState(initial){const index=cursor++;if(!(index in hooks))hooks[index]=initial;return [hooks[index],value=>{hooks[index]=typeof value==='function'?value(hooks[index]):value;}];}
 function useRef(initial){const index=cursor++;if(!(index in hooks))hooks[index]={current:initial};return hooks[index];}
 function useCallback(callback,deps){const index=cursor++;if(!(index in hooks))hooks[index]={callback,deps};return hooks[index].callback;}
 function useEffect(effect,deps){const index=cursor++;if(!(index in hooks)){hooks[index]={deps};effects.push(effect);}}
 const factory=(type,props)=>({type,props:props||{}});
 const Page=sourceModule('app/dedao/page.tsx',{
  react:{useState,useRef,useCallback,useEffect},
  'react/jsx-runtime':{jsx:factory,jsxs:factory,Fragment:'Fragment'},
  '../../components/studio-nav':{default:()=>null},
 },{
  fetch:async(url,options={})=>{const call={url,method:options.method||'GET',body:options.body?JSON.parse(options.body):null};calls.push(call);return fetchImpl(call);},
  sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  setInterval:callback=>{timers.push(callback);return timers.length;},clearInterval:()=>{},
 }).default;
 function render(){cursor=0;tree=Page();return tree;}
 function walkNodes(node,result){if(Array.isArray(node))for(const entry of node)walkNodes(entry,result);else if(node&&typeof node==='object'){result.push(node);walkNodes(node.props?.children,result);}return result;}
 function walkText(node){if(Array.isArray(node))return node.map(walkText).join('');if(node===null||node===undefined||typeof node==='boolean')return '';return typeof node==='object'?walkText(node.props?.children):String(node);}
 const nodes=(node=tree)=>walkNodes(node,[]),text=(node=tree)=>walkText(node);
 function button(name){const found=nodes().find(node=>node.type==='button'&&(node.props['aria-label']===name||text(node)===name));assert(found,`Expected button: ${name}`);return found.props;}
 return {calls,storage,render,nodes,text,button,
  async mount(){render();for(const effect of effects)effect();await settle();render();},
  async poll(){assert.equal(timers.length,1);timers[0]();await settle();render();},
 };
}
function assertRetained(page){
 for(const record of [batch.id,item.title,item.download.filename,item.download.path,item.article_id,item.submitted_handoff_id,'已提交，等待小鱼接手。无需再次点击。'])assert(page.text().includes(record),'previously confirmed task and files must remain visible');
}
{
 let healthy=true;
 const page=pageHarness(()=>healthy?Response.json(view(batch)):new Response('<html>SYNTHETIC_PRIVATE_BODY</html>',{status:503,headers:{'Content-Type':'text/html'}}));await page.mount();assert.equal(page.button('恢复当前批次').disabled,false);
 healthy=false;await page.poll();assertRetained(page);
 assert.equal(page.button('求助成文').disabled,true);assert.equal(page.button('恢复当前批次').disabled,true);
 assert.match(page.text(),/服务连接暂时故障/);assert.match(page.text(),/等待自动读取恢复/);assert.match(page.text(),/执行状态待重新确认/);assert(!page.text().includes('重新授权'));
 assert(!page.text().includes('SYNTHETIC_PRIVATE_BODY'),'gateway HTML must not replace the safe temporary fault message');
 assert.equal(page.calls.filter(call=>call.method==='POST').length,0);
 // Calling the actual handler is also fenced while reads are unavailable.
 await page.button('恢复当前批次').onClick();assert.equal(page.calls.filter(call=>call.method==='POST').length,0);
 healthy=true;await page.poll();assertRetained(page);assert.equal(page.button('恢复当前批次').disabled,false);assert(!page.text().includes('服务连接暂时故障'));
}
{
 let recovered=false,submittedKey;
 const page=pageHarness(call=>{
  if(call.method==='POST'){submittedKey=call.body.request_key;return unavailable();}
  return recovered?Response.json(view({...batch,request_key:submittedKey,state:'running',can_resume:false})):submittedKey?unavailable():Response.json(view(null));
 });await page.mount();
 const first=page.button('求助成文').onClick(),second=page.button('求助成文').onClick();await Promise.all([first,second]);page.render();
 assert.equal(page.calls.filter(call=>call.method==='POST').length,1);assert.equal(page.storage.get('dedao-start-key'),submittedKey);
 assert.equal(page.button('求助成文').disabled,true,'unknown startup result must lock additional starts until a successful read');
 recovered=true;await page.poll();assertRetained(page);assert.equal(page.calls.filter(call=>call.method==='POST').length,1);assert.equal(page.button('求助成文').disabled,true);
}
{
 let recovered=false,posted=false;
 const page=pageHarness(call=>{if(call.method==='POST'){posted=true;assert.equal(call.body.action,'resume');assert.equal(call.body.batch_id,batch.id);return unavailable();}return posted&&!recovered?unavailable():Response.json(view(recovered?{...batch,state:'running',can_resume:false}:batch));});
 await page.mount();await page.button('恢复当前批次').onClick();page.render();assertRetained(page);assert.equal(page.button('恢复当前批次').disabled,true);
 assert.equal(page.calls.filter(call=>call.method==='POST').length,1);
 recovered=true;await page.poll();assertRetained(page);assert.equal(page.calls.filter(call=>call.method==='POST').length,1);assert.match(page.text(),/正在处理第2篇/);
}
{
 let posted=false,recovered=false;
 const running={...batch,state:'running',can_resume:false,native:{safe_boundary:false}};
 const page=pageHarness(call=>{if(call.method==='POST'){posted=true;assert.equal(call.body.action,'pause');return unavailable();}return posted&&!recovered?unavailable():Response.json(view(running));});
 await page.mount();await page.button('暂停当前批次').onClick();await settle();page.render();assertRetained(page);
 assert.match(page.text(),/暂停结果(?:必须确认|尚未确认|未确认)/);assert(!page.text().includes('已请求暂停；等待原生执行者确认'));
 assert.equal(page.calls.filter(call=>call.method==='POST').length,1);
 recovered=true;await page.poll();assertRetained(page);assert.equal(page.calls.filter(call=>call.method==='POST').length,1);assert.match(page.text(),/正在处理第2篇/);
}

console.log('PASS isolated native error classification and UI reconciliation: invalid credentials 401; dependency failures 503 with safe generated references; business conflicts 409; existing tasks/files retained; read faults fence starts/resumes; unknown mutations are read back without replay. No production or browser operations.');
