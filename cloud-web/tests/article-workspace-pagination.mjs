// Actual source modules, API handlers and React hooks with synthetic SQLite.
// No Site, network, provider, platform, production or browser calls are made.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import React from 'react';
import ts from 'typescript';
const nativeRequire=createRequire(import.meta.url),sql=new DatabaseSync(':memory:');
const migrations=fs.readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort();
for(const filename of migrations)sql.exec(fs.readFileSync('drizzle/'+filename,'utf8'));
const db={prepare(query){let values=[];return {bind(...args){values=args;return this;},async all(){return {results:sql.prepare(query).all(...values)};},async first(){return sql.prepare(query).get(...values)||null;},runSync(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};},async run(){return this.runSync();}};},async batch(statements){sql.exec('BEGIN');try{const result=statements.map(statement=>statement.runSync());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
const hash=value=>createHash('sha256').update(value).digest('hex');
const store={db:()=>db,owner:request=>request.headers.get('x-offline-owner')};
const compile=filename=>ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const modules=new Map();
function load(filename){
 filename=path.resolve(filename);if(modules.has(filename))return modules.get(filename);
 const exports={};modules.set(filename,exports);
 vm.runInNewContext(compile(filename),{exports,require:name=>name.endsWith('/test-store')||name==='./test-store'?store:name==='./writing-input'?{hashText:async value=>hash(value)}:name.startsWith('.')?load(path.join(path.dirname(filename),name+'.ts')):nativeRequire(name),crypto,Date,Intl,TextEncoder,URL,Request,Response,AbortController,AbortSignal,Error,Set,Map,JSON,console,fetch:()=>{throw Error('NO EXTERNAL I/O');}});
 return exports;
}
const workspace=load('lib/article-workspace.ts'),route=load('app/api/articles/workspace/route.ts');
const ownerScope=who=>hash('article-data-owner:'+who);
function seed(who,count,extra={}){
 return Array.from({length:count},(_,index)=>{
  const id=crypto.randomUUID(),title=`OFFLINE ${who} ${index+1}`;
  sql.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state,claim_token,claim_expires) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,who,title,'offline.txt',`articles/${id}/source`,'["ORIGINAL BODY RETAINED"]',new Date(Date.parse('2030-01-01T00:00:00Z')+index*1000).toISOString(),extra.state||'uploaded',extra.claim_token||null,extra.claim_token?'2000-01-01T00:00:00Z':null);
  return {id,title,state:extra.state||'uploaded',list_section:'work',notification_state:null,word_progress_unavailable:false};
 });
}
const archivedCount=who=>sql.prepare('SELECT count(*) n FROM article_workspace_archives WHERE owner=?').get(who).n;
const requestCount=who=>sql.prepare('SELECT count(*) n FROM article_workspace_requests WHERE owner=?').get(who).n;
const apiRequest=(url,who,body)=>new Request('https://offline.test'+url,{method:body?'POST':'GET',headers:{'x-offline-owner':who||'',Origin:'https://offline.test','X-Article-Workspace':'1','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const apiGet=(url,who)=>route.GET(apiRequest(url,who));
const apiPost=(body,who)=>route.POST(apiRequest('/api/articles/workspace',who,body));
const children=node=>Array.isArray(node?.props?.children)?node.props.children:[node?.props?.children];
function elements(node,predicate,result=[]){if(Array.isArray(node)){node.forEach(child=>elements(child,predicate,result));return result;}if(!node||typeof node!=='object')return result;if(predicate(node))result.push(node);children(node).forEach(child=>elements(child,predicate,result));return result;}
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
const ActionMarker=()=>null;
function mount(filename,fetcher,initialProps={}){
 const slots=[];let cursor=0,dirty=true,effects=[],tree,props=initialProps,alive=true,timerId=0;
 const timers=new Map(),storage=new Map();
 const hooks={...React,
  useState(initial){const at=cursor++;if(!(at in slots))slots[at]=typeof initial==='function'?initial():initial;return [slots[at],value=>{assert.ok(alive,'unmounted component must not update');const next=typeof value==='function'?value(slots[at]):value;if(!Object.is(next,slots[at])){slots[at]=next;dirty=true;}}];},
  useRef(initial){const at=cursor++;return slots[at]??={current:initial};},
  useCallback(fn,deps){const at=cursor++;if(!slots[at]||!same(slots[at].deps,deps))slots[at]={fn,deps};return slots[at].fn;},
  useMemo(fn,deps){const at=cursor++;if(!slots[at]||!same(slots[at].deps,deps))slots[at]={value:fn(),deps};return slots[at].value;},
  useEffect(fn,deps){const at=cursor++,prior=slots[at];if(!prior||!same(prior.deps,deps)){const next={deps,cleanup:prior?.cleanup,effect:true};slots[at]=next;effects.push(()=>{prior?.cleanup?.();next.cleanup=fn();});}}
 };
 const exports={},window={sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay,repeat:false});return id;},clearTimeout:id=>timers.delete(id),setInterval:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay,repeat:true});return id;},clearInterval:id=>timers.delete(id),addEventListener:()=>{},removeEventListener:()=>{}};
 vm.runInNewContext(compile(filename),{exports,require:name=>name==='react'?hooks:name.endsWith('/article-workspace-action')?{default:ActionMarker}:name.endsWith('/studio-nav')||name.endsWith('/article-metrics-observation')?{default:()=>null}:name.startsWith('.')?load(path.join(path.dirname(filename),name+(name.endsWith('word-stage-progress')?'.tsx':'.ts'))):nativeRequire(name),crypto,Date,Intl,URL,AbortController,AbortSignal,Response,Error,Set,Map,JSON,window,navigator:{onLine:true},fetch:fetcher});
 function render(){let turns=0;do{assert.ok(++turns<20,'render effects must settle');cursor=0;dirty=false;tree=exports.default(props);effects.splice(0).forEach(fn=>fn());}while(dirty||effects.length);return tree;}
 async function settle(){for(let turn=0;turn<30;turn++){if(dirty||effects.length)render();await new Promise(resolve=>setImmediate(resolve));}return tree;}
 return {render,settle,get tree(){return tree;},async start(){render();for(const [id,timer]of timers){if(!timer.repeat&&timer.delay===0){timers.delete(id);timer.fn();}}return settle();},async click(label){const button=elements(tree,node=>node.type==='button'&&(typeof label==='string'?text(node)===label:label.test(text(node))))[0];assert.ok(button,`actual ${filename} button ${label}`);assert.equal(!!button.props.disabled,false,'button must be enabled');button.props.onClick();return settle();},async update(value){props=value;dirty=true;return settle();},unmount(){slots.forEach(slot=>{if(slot?.effect)slot.cleanup?.();});alive=false;},slots};
}
let checks=0;
async function check(label,fn){await fn();checks++;console.log('PASS '+label);}
function transport(who){
 const posts=[],reads=[];let activeOwner=who,failPost=0,failMode='after',corruptPost=0,ownerAfterRead=0,readCount=0;
 const fetcher=async(url,options={})=>{
  assert.match(url,/^\/api\/articles\/workspace(?:\?(?:limit=1|offset=\d+&limit=100))?$/,'only workspace API in offline transport');
  if(options.method==='POST'){
   const body=JSON.parse(options.body);posts.push(body);assert.ok(body.article_ids.length<=100,'actual component batch bound');
   if(posts.length===failPost&&failMode==='before')throw Error('OFFLINE LOST CONNECTION');
   const response=await apiPost(body,activeOwner);
   if(posts.length===failPost){if(failMode==='opaque400')return Response.json({error:'同一次操作不能更改文章范围'},{status:400});throw Error('OFFLINE LOST RESPONSE AFTER COMMIT');}
   if(posts.length===corruptPost){const receipt=await response.json();return Response.json({...receipt,changed:[...receipt.changed,crypto.randomUUID()]});}
   return response;
  }
  reads.push(url);readCount++;
  const response=await apiGet(url,activeOwner);if(readCount===ownerAfterRead)activeOwner=who+'-B';return response;
 };
 return {posts,reads,fetcher,setOwner(value){activeOwner=value;},fail(index,mode='after'){failPost=index;failMode=mode;},corrupt(index){corruptPost=index;},switchAfterRead(index){ownerAfterRead=index;}};
}
const component=(rows,wire,extra={})=>mount('components/article-workspace-action.tsx',wire.fetcher,{ids:rows.map(row=>row.id),titles:Object.fromEntries(rows.map(row=>[row.id,row.title])),...extra});

await check('real backend accepts 100 IDs and refuses 101 before mutation',async()=>{
 const who='OFFLINE-BOUND',rows=seed(who,101);
 await assert.rejects(workspace.changeWorkspace(who,{action:'archive',request_key:crypto.randomUUID(),article_ids:rows.map(row=>row.id)}),/操作信息无效/);
 assert.equal(archivedCount(who),0);assert.equal(requestCount(who),0);
 assert.equal((await workspace.changeWorkspace(who,{action:'archive',request_key:crypto.randomUUID(),article_ids:rows.slice(0,100).map(row=>row.id)})).changed.length,100);
});
let homeRows;
await check('actual Home five 25-row pages yields a frozen, confirmed 125-ID 100+25 operation',async()=>{
 const who='OFFLINE-HOME';homeRows=seed(who,125);let reads=0;
 const home=mount('app/page.tsx',async url=>{assert.match(url,/^\/api\/articles(?:\?pending_offset=\d+)?$/);reads++;const offset=Number(new URL('https://offline.test'+url).searchParams.get('pending_offset')||0);return Response.json({owner_scope:ownerScope(who),items:homeRows.slice(offset,offset+25),connected:true,pending_total:125,next_offset:offset+25<125?offset+25:null});});
 await home.start();for(let page=1;page<5;page++)await home.click('加载更多待处理文章');
 const bulk=elements(home.tree,node=>node.type===ActionMarker&&node.props.label==='一键清空当前列表')[0];
 assert.equal(bulk.props.ids.length,125);assert.equal(bulk.props.disabled,false);assert.equal(reads,15);
 const wire=transport(who),changed=[],action=mount('components/article-workspace-action.tsx',wire.fetcher,{...bulk.props,onChanged:ids=>changed.push(...ids)});
 await action.start();await action.click('一键清空当前列表');assert.equal(wire.posts.length,0,'preview is read only');
 assert.equal(elements(action.tree,node=>node.type==='li').length,125,'actual confirmation lists frozen scope');
 await action.click('确认收起本次 125 篇');assert.deepEqual(wire.posts.map(post=>post.article_ids.length),[100,25]);
 assert.notEqual(wire.posts[0].request_key,wire.posts[1].request_key);assert.equal(new Set(changed).size,125);assert.equal(archivedCount(who),125);
});
for(const count of [100,101])await check(`actual component ${count} boundary batches and explicit confirmation`,async()=>{
 const who='OFFLINE-COMP-'+count,rows=seed(who,count),wire=transport(who),action=component(rows,wire);
 await action.start();await action.click('删除当前文章');assert.equal(wire.posts.length,0);await action.click(`确认收起本次 ${count} 篇`);
 assert.deepEqual(wire.posts.map(post=>post.article_ids.length),count===100?[100]:[100,1]);assert.equal(archivedCount(who),count);
});
await check('unknown second batch recovers same nonce, confirmed partial results remain, later added rows stay visible',async()=>{
 const who='OFFLINE-UNKNOWN',rows=seed(who,125),later=seed(who,3),wire=transport(who),confirmed=[];wire.fail(2);
 const action=component(rows,wire,{onChanged:ids=>confirmed.push(...ids)});await action.start();await action.click('删除当前文章');await action.click('确认收起本次 125 篇');
 assert.equal(confirmed.length,100);assert.equal(archivedCount(who),125,'second commit was real but response was lost');assert.equal(requestCount(who),2);
 assert.match(text(action.tree),/已确认收起 100 篇/);assert.equal(wire.posts.length,2);
 await action.update({ids:[...rows.slice(100),...later].map(row=>row.id),onChanged:ids=>confirmed.push(...ids)});
 await action.click('重试原确认的 125 篇');assert.equal(wire.posts.length,3);assert.equal(wire.posts[2].request_key,wire.posts[1].request_key);assert.deepEqual(wire.posts[2].article_ids,wire.posts[1].article_ids);
 assert.equal(confirmed.length,125);assert.equal(requestCount(who),2);assert.equal(archivedCount(who),125);
 assert.equal(sql.prepare('SELECT count(*) n FROM articles WHERE owner=? AND '+workspace.workspaceVisibleSql()).get(who).n,3,'later additions never enter the old confirmed range');
});
await check('failed uncommitted batch keeps original key and only unfinished scope',async()=>{
 const who='OFFLINE-PARTIAL',rows=seed(who,125),wire=transport(who),confirmed=[];wire.fail(2,'before');
 const action=component(rows,wire,{onChanged:ids=>confirmed.push(...ids)});await action.start();await action.click('删除当前文章');await action.click('确认收起本次 125 篇');
 assert.equal(archivedCount(who),100);assert.equal(confirmed.length,100);await action.click('重试原确认的 125 篇');
 assert.equal(archivedCount(who),125);assert.equal(confirmed.length,125);assert.equal(wire.posts[2].request_key,wire.posts[1].request_key);assert.deepEqual(wire.posts[2].article_ids,rows.slice(100).map(row=>row.id));
});
await check('malformed receipt retains same original batch key and cannot enlarge changed scope',async()=>{
 const who='OFFLINE-MALFORMED',rows=seed(who,2),wire=transport(who),confirmed=[];wire.corrupt(1);
 const action=component(rows,wire,{onChanged:ids=>confirmed.push(...ids)});await action.start();await action.click('删除当前文章');await action.click('确认收起本次 2 篇');assert.equal(confirmed.length,0);
 await action.click('重试原确认的 2 篇');assert.equal(wire.posts[1].request_key,wire.posts[0].request_key);assert.equal(confirmed.length,2);assert.equal(requestCount(who),1);
});
await check('opaque HTTP 400 after a saved receipt retains the exact original key and confirmation',async()=>{
 const who='OFFLINE-OPAQUE-400',rows=seed(who,2),wire=transport(who),confirmed=[];wire.fail(1,'opaque400');
 const action=component(rows,wire,{onChanged:ids=>confirmed.push(...ids)});await action.start();await action.click('删除当前文章');await action.click('确认收起本次 2 篇');
 assert.equal(confirmed.length,0);assert.equal(archivedCount(who),2);assert.equal(requestCount(who),1);assert.equal(elements(action.tree,node=>node.type==='button'&&text(node)==='取消').length,0);
 await action.click('重试原确认的 2 篇');assert.equal(wire.posts[1].request_key,wire.posts[0].request_key);assert.deepEqual(wire.posts[1].article_ids,wire.posts[0].article_ids);assert.equal(confirmed.length,2);assert.equal(requestCount(who),1);
});
await check('scope changed before confirmation requires a new precise preview and never writes old or added rows',async()=>{
 const who='OFFLINE-PREVIEW',rows=seed(who,2),later=seed(who,1),wire=transport(who),action=component(rows,wire);
 await action.start();await action.click('删除当前文章');await action.update({ids:[...rows,...later].map(row=>row.id)});await action.click('确认收起本次 2 篇');
 assert.equal(wire.posts.length,0);assert.match(text(action.tree),/范围已变化/);await action.click('删除当前文章');assert.equal(elements(action.tree,node=>node.type==='li').length,3);assert.equal(wire.posts.length,0);
 await action.click('取消');assert.equal(archivedCount(who),0);
});
await check('invalid or duplicate selected IDs cannot create an intent and can be replaced by a fresh confirmation',async()=>{
 const who='OFFLINE-BAD-SELECTION',rows=seed(who,1);
 for(const ids of [[rows[0].id,rows[0].id],['invalid-article-id']]){
  const wire=transport(who),action=mount('components/article-workspace-action.tsx',wire.fetcher,{ids});await action.start();await action.click('删除当前文章');
  assert.equal(wire.reads.length,0);assert.equal(wire.posts.length,0);assert.match(text(action.tree),/文章范围无效/);assert.equal(elements(action.tree,node=>node.type==='li').length,0);
  await action.update({ids:[rows[0].id]});await action.click('删除当前文章');assert.equal(wire.posts.length,0);assert.equal(elements(action.tree,node=>node.type==='li').length,1);await action.click('取消');
 }
 assert.equal(archivedCount(who),0);assert.equal(requestCount(who),0);
});
await check('expired unended holder and active tasks remain blocked without takeover',async()=>{
 const who='OFFLINE-PROTECTED',normal=seed(who,1),expired=seed(who,1,{state:'failed',claim_token:crypto.randomUUID()}),running=seed(who,1,{state:'processing'}),wire=transport(who),changed=[];
 const before=JSON.stringify(sql.prepare('SELECT * FROM articles WHERE owner=? ORDER BY id').all(who));
 const action=component([...normal,...expired,...running],wire,{onChanged:ids=>changed.push(...ids)});await action.start();await action.click('删除当前文章');await action.click('确认收起本次 3 篇');
 assert.deepEqual(changed,normal.map(row=>row.id));assert.equal(archivedCount(who),1);assert.match(text(action.tree),/2 篇未收起/);assert.equal(JSON.stringify(sql.prepare('SELECT * FROM articles WHERE owner=? ORDER BY id').all(who)),before,'claims/states/original body untouched');
});
await check('expired platform and Word holders remain protected and their execution records are unchanged',async()=>{
 const who='OFFLINE-EXTERNAL-HOLDERS',rows=seed(who,3),wire=transport(who),stamp='2000-01-01T00:00:00Z',digest='a'.repeat(64);
 sql.prepare('INSERT INTO article_deliveries(id,owner,article_id,platform,state,claim_token,claim_expires,updated) VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),who,rows[0].id,'zhihu','failed',crypto.randomUUID(),stamp,stamp);
 sql.prepare("INSERT INTO word_serial_slots(owner,target_kind,target_id,input_sha256,attempt_id,claim_hash,execution_id,grant_request_key,token_hash,epoch,state,version,held_at,updated) VALUES(?,'article',?,?,?,?,?,?,?,1,'held',1,?,?)").run(who,rows[1].id,digest,crypto.randomUUID(),digest,'OFFLINE ENDED UNKNOWN',crypto.randomUUID(),digest,stamp,stamp);
 sql.prepare("INSERT INTO word_recovery(owner,target_kind,target_id,input_sha256,claim_hash,version,epoch,desired,token_hash,lease_until,status,reason,retry_count,updated) VALUES(?,'article',?,?,?,1,1,'run',?,?,'running','none',0,?)").run(who,rows[2].id,digest,digest,digest,stamp,stamp);
 const tables=['article_deliveries','word_serial_slots','word_recovery'],before=tables.map(table=>JSON.stringify(sql.prepare('SELECT * FROM '+table+' WHERE owner=?').all(who)));
 const action=component(rows,wire);await action.start();await action.click('删除当前文章');await action.click('确认收起本次 3 篇');
 assert.equal(archivedCount(who),0);assert.match(text(action.tree),/3 篇未收起/);assert.deepEqual(tables.map(table=>JSON.stringify(sql.prepare('SELECT * FROM '+table+' WHERE owner=?').all(who))),before);
});
await check('owner switch during write preflight is fenced by real POST before mutation',async()=>{
 const who='OFFLINE-OWNER-WRITE',rows=seed(who,2),wire=transport(who);wire.switchAfterRead(2);let invalid=0;
 const action=component(rows,wire,{ownerScope:ownerScope(who),onScopeInvalid:()=>invalid++});await action.start();await action.click('删除当前文章');await action.click('确认收起本次 2 篇');
 assert.equal(wire.posts.length,1);assert.equal(archivedCount(who),0);assert.equal(archivedCount(who+'-B'),0);assert.equal(requestCount(who+'-B'),0);assert.equal(invalid,1);assert.match(text(action.tree),/登录账号已变化/);
});
await check('owner change between batches preserves first result and stops before next write',async()=>{
 const who='OFFLINE-OWNER-BATCH',rows=seed(who,125),wire=transport(who);let changed=0,invalid=0;
 const action=component(rows,wire,{ownerScope:ownerScope(who),onScopeInvalid:()=>invalid++,onChanged:ids=>{changed+=ids.length;wire.setOwner(who+'-B');}});await action.start();await action.click('删除当前文章');await action.click('确认收起本次 125 篇');
 assert.equal(wire.posts.length,1);assert.equal(changed,100);assert.equal(archivedCount(who),100);assert.equal(invalid,1);assert.equal(requestCount(who+'-B'),0);
 await action.update({ids:[],ownerScope:ownerScope(who+'-B')});assert.equal(elements(action.tree,node=>node.type==='li').length,0,'old owner confirmation hidden');
});
await check('strict owner inventory limit/offset API, no mutation from pagination',async()=>{
 const who='OFFLINE-QUERY',rows=seed(who,125),before=requestCount(who);
 for(const query of ['?limit=0','?limit=101','?limit=-1','?limit=1.5','?offset=-1','?offset=1000001','?offset=1.1','?offset=0&offset=1','?limit=1&limit=2','?unknown=1'])assert.equal((await apiGet('/api/articles/workspace'+query,who)).status,400,query);
 assert.equal((await apiGet('/api/articles/workspace?limit=100',null)).status,401);
 for(const [offset,limit,count,next]of [[0,100,100,100],[100,100,25,null],[124,1,1,null],[125,100,0,null]]){
  const response=await apiGet(`/api/articles/workspace?offset=${offset}&limit=${limit}`,who);assert.equal(response.status,200);const body=await response.json();assert.equal(body.items.length,count);assert.equal(body.next_offset,next);assert.equal(body.owner_scope,ownerScope(who));assert.equal(body.total,125);
 }
 await assert.rejects(workspace.workspaceInventory(who,NaN,100),/无效/);await assert.rejects(workspace.workspaceInventory(who,0,Infinity),/无效/);assert.equal(requestCount(who),before);assert.equal(archivedCount(who),0);assert.equal(rows.length,125);
});

const record=(who,offset)=>({history_key:who+'-'+offset,title:'OFFLINE HISTORY '+offset,topic_label:'OFFLINE',mode:'manual_word_only',status:'word_delivered',completed_at:'2026-10-13T12:00:00Z',completed_at_precision:'second',platforms:{toutiao:{draft_url:null,status:'not_requested'},zhihu:{draft_url:null,status:'not_requested'}},observations:[]});
function pageTransport(who){let phase='normal';const calls=[];return {calls,setPhase(value){phase=value;},async fetcher(url){calls.push(url);assert.match(url,/^\/api\/(?:article-data\?offset=\d+|articles\/workspace\?offset=\d+&limit=100)$/);const offset=Number(new URL('https://offline.test'+url).searchParams.get('offset'));
 if(url.includes('/workspace')){
  if(offset===100&&phase==='unauthorized')return new Response('',{status:401});if(offset===100&&phase==='forbidden')return new Response('',{status:403});
  const response=await apiGet(url,who),body=await response.json();if(offset===100&&phase==='owner-switch')body.owner_scope=ownerScope(who+'-B');if(offset===100&&phase==='wrong-offset')body.offset=0;return Response.json(body);
 }
 return Response.json({owner_scope:ownerScope(who),items:[record(who,offset)],total:26,next_offset:offset===0?25:null,summary:{processed:26,private_drafts:0,full_auto:0,semi_auto:26},notice:'OFFLINE HISTORICAL METRICS UNCHANGED'});
 }};}
await check('actual recovery page reaches older 125th archived row; inventory and history pagination stay independent',async()=>{
 const who='OFFLINE-RECOVERY',rows=seed(who,125),old=rows[0].id;
 await workspace.changeWorkspace(who,{action:'archive',request_key:crypto.randomUUID(),article_ids:[old]});
 const first=await workspace.workspaceInventory(who);assert.equal(first.items.some(row=>row.id===old),false);assert.equal(first.next_offset,100);
 const wire=pageTransport(who),page=mount('app/article-data/page.tsx',wire.fetcher);await page.start();
 assert.equal(elements(page.tree,node=>node.type===ActionMarker&&node.props.restore).length,0);
 const initialSummary=text(elements(page.tree,node=>node.props?.['aria-label']==='已处理文章统计')[0]);
 wire.calls.length=0;await page.click('加载更多可收起与恢复文章');
 assert.deepEqual(wire.calls,['/api/article-data?offset=0','/api/articles/workspace?offset=0&limit=100','/api/articles/workspace?offset=100&limit=100']);
 const restored=elements(page.tree,node=>node.type===ActionMarker&&node.props.restore)[0];assert.deepEqual(Array.from(restored.props.ids),[old]);assert.equal(restored.props.ownerScope,ownerScope(who));assert.equal(text(elements(page.tree,node=>node.props?.['aria-label']==='已处理文章统计')[0]),initialSummary);
 wire.calls.length=0;await page.click('加载更多历史');assert.equal(wire.calls.filter(url=>url.includes('article-data')).length,2);assert.equal(wire.calls.filter(url=>url.includes('workspace')).length,2);assert.equal(text(elements(page.tree,node=>node.props?.['aria-label']==='已处理文章统计')[0]),initialSummary);
 const restoreWire=transport(who),action=mount('components/article-workspace-action.tsx',restoreWire.fetcher,{...restored.props,onChanged:()=>{}});await action.start();await action.click('恢复文章');await action.click('确认恢复本次 1 篇');assert.equal(archivedCount(who),0);assert.equal(sql.prepare('SELECT paragraphs FROM articles WHERE id=?').get(old).paragraphs,'["ORIGINAL BODY RETAINED"]');
});
for(const phase of ['owner-switch','unauthorized','forbidden','wrong-offset'])await check(`actual inventory pagination ${phase} refuses mixed page and clears owner/auth controls`,async()=>{
 const who='OFFLINE-PAGE-'+phase,rows=seed(who,125);await workspace.changeWorkspace(who,{action:'archive',request_key:crypto.randomUUID(),article_ids:[rows[124].id]});
 const wire=pageTransport(who),page=mount('app/article-data/page.tsx',wire.fetcher);await page.start();assert.equal(elements(page.tree,node=>node.type===ActionMarker&&node.props.restore).length,1);
 wire.setPhase(phase);await page.click('加载更多可收起与恢复文章');
 if(phase==='wrong-offset'){assert.match(text(page.tree),/返回不完整/);assert.ok(elements(page.tree,node=>node.type===ActionMarker).every(node=>node.props.disabled),'retained correct previous page is disabled after malformed paging');}
 else {assert.equal(elements(page.tree,node=>node.type===ActionMarker).length,0);assert.equal(elements(page.tree,node=>node.props?.['aria-label']==='已处理文章统计').length,0);}
 wire.setPhase('normal');wire.calls.length=0;await page.click('刷新数据');assert.deepEqual(wire.calls,['/api/article-data?offset=0','/api/articles/workspace?offset=0&limit=100'],'failed paging is not appended');
});
await check('late inventory page cannot resurrect old owner controls after an action scope reset',async()=>{
 const who='OFFLINE-LATE-PAGE';seed(who,125);const wire=pageTransport(who);let resolve;
 const page=mount('app/article-data/page.tsx',async url=>url.includes('workspace?offset=100')?new Promise(done=>{resolve=done;}):wire.fetcher(url));await page.start();
 const oldControl=elements(page.tree,node=>node.type===ActionMarker)[0];await page.click('加载更多可收起与恢复文章');assert.ok(resolve);
 oldControl.props.onScopeInvalid();await page.settle();assert.equal(elements(page.tree,node=>node.type===ActionMarker).length,0);
 resolve(Response.json(await workspace.workspaceInventory(who,100,100)));await page.settle();assert.equal(elements(page.tree,node=>node.type===ActionMarker).length,0);assert.equal(elements(page.tree,node=>node.props?.['aria-label']==='已处理文章统计').length,0);
 wire.calls.length=0;await page.click('刷新数据');assert.deepEqual(wire.calls,['/api/article-data?offset=0','/api/articles/workspace?offset=0&limit=100']);
});
await check('unmounted action ignores a late preflight response and creates no new operation',async()=>{
 const who='OFFLINE-UNMOUNT',rows=seed(who,1);let resolve,posts=0;
 const action=mount('components/article-workspace-action.tsx',async(url,options={})=>{if(options.method==='POST'){posts++;throw Error('UNEXPECTED WRITE');}return new Promise(done=>{resolve=done;});},{ids:rows.map(row=>row.id)});
 await action.start();await action.click('删除当前文章');action.unmount();resolve(Response.json({owner_scope:ownerScope(who)}));await action.settle();assert.equal(posts,0);assert.equal(requestCount(who),0);
});
assert.equal(sql.prepare('SELECT count(*) n FROM article_deletions').get().n,0);
assert.equal(sql.prepare('SELECT count(*) n FROM article_history').get().n,0);
assert.equal(sql.prepare('SELECT count(*) n FROM article_metrics_observations').get().n,0);
assert.equal(sql.prepare('SELECT count(*) n FROM event_subscriptions').get().n,0);
assert.equal(sql.prepare('SELECT count(*) n FROM article_upload_attempts').get().n,0);
sql.close();console.log(`PASS ${checks} dedicated workspace cases; all ${migrations.length} original migrations in synthetic SQLite; actual Home/Action/DataPage/API source; ZERO production/external/browser/model/platform calls.`);
