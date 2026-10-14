// Actual Action component/hooks and Chromium DOM/CSS, synthetic owner reads and
// receipts only. No server is started; no backend, production or platform call.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {chromium} from 'playwright-core';
const nativeRequire=createRequire(import.meta.url),folder=process.env.WORKSPACE_ID_QA_DIR;
if(folder)fs.mkdirSync(folder,{recursive:true});
const sourceFile='components/article-workspace-action.tsx',source=fs.readFileSync(sourceFile,'utf8'),css=fs.readFileSync('app/globals.css','utf8');
const compile=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const uuid=index=>`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
const ids=Array.from({length:125},(_,index)=>uuid(index+1)),title='同名文章',owner='a'.repeat(64);
const children=node=>Array.isArray(node?.props?.children)?node.props.children:[node?.props?.children];
function elements(node,predicate,result=[]){if(Array.isArray(node)){node.forEach(child=>elements(child,predicate,result));return result;}if(!node||typeof node!=='object')return result;if(predicate(node))result.push(node);children(node).forEach(child=>elements(child,predicate,result));return result;}
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
function mount(initialProps){
 const slots=[],posts=[];let cursor=0,dirty=true,effects=[],tree,props=initialProps;
 const hooks={...React,useState(initial){const at=cursor++;if(!(at in slots))slots[at]=typeof initial==='function'?initial():initial;return [slots[at],value=>{slots[at]=typeof value==='function'?value(slots[at]):value;dirty=true;}];},useRef(initial){const at=cursor++;return slots[at]??={current:initial};},useEffect(fn,deps){const at=cursor++,prior=slots[at];if(!prior||!same(prior.deps,deps)){const next={deps,cleanup:prior?.cleanup};slots[at]=next;effects.push(()=>{prior?.cleanup?.();next.cleanup=fn();});}}};
 const exports={};vm.runInNewContext(compile,{exports,require:name=>name==='react'?hooks:nativeRequire(name),crypto,AbortSignal,AbortController,Response,Error,Set,Map,JSON,fetch:async(url,options={})=>{if(options.method!=='POST'){assert.equal(url,'/api/articles/workspace?limit=1');return Response.json({owner_scope:owner});}assert.equal(url,'/api/articles/workspace');const body=JSON.parse(options.body);posts.push(body);if(posts.length===2)throw Error('OFFLINE LOST SECOND RESPONSE');return Response.json({action:body.action,changed:body.article_ids,blocked:[]});}});
 function render(){let turns=0;do{assert.ok(++turns<20);cursor=0;dirty=false;tree=exports.default(props);effects.splice(0).forEach(fn=>fn());}while(dirty||effects.length);return tree;}
 async function settle(){for(let turn=0;turn<20;turn++){if(dirty||effects.length)render();await new Promise(resolve=>setImmediate(resolve));}}
 return {posts,get tree(){return tree;},markup(){return renderToStaticMarkup(tree);},async start(){render();await settle();},async update(next){props=next;dirty=true;await settle();},async click(label){const button=elements(tree,node=>node.type==='button'&&text(node)===label)[0];assert.ok(button,label);assert.equal(!!button.props.disabled,false);button.props.onClick();await settle();}};
}
function verifyList(action,expectedIds,expectedTitle){
 const listed=elements(action.tree,node=>node.type==='li');assert.equal(listed.length,expectedIds.length);
 listed.forEach((item,index)=>{assert.ok(text(item).includes(expectedIds[index]),`complete UUID must be visible text for entry ${index+1}, not only a hover attribute`);if(expectedTitle)assert.ok(text(item).includes(expectedTitle),'frozen title must remain visible');});
 assert.equal(new Set(listed.map(text)).size,expectedIds.length,'same titles must be distinguishable by visible exact IDs');
 return listed;
}
let browser;const result={status:'RUNNING',source_sha256:createHash('sha256').update(source).digest('hex'),cases:[],page_errors:[],blocked_requests:[],post_scope_tested:false};
try{
 const props={ids,titles:Object.fromEntries(ids.map(id=>[id,title])),ownerScope:owner},action=mount(props);await action.start();await action.click('删除当前文章');
 if(folder)fs.writeFileSync(path.join(folder,'actual-confirmation.html'),action.markup());
 verifyList(action,ids,title);assert.equal(action.posts.length,0);result.cases.push('125 same-title exact visible IDs and read-only preview');console.log('PASS actual component:125 same-title entries expose every complete UUID/title in visible text; preview0POST');
 const frozenMarkup=action.markup();await action.click('确认收起本次 125 篇');assert.deepEqual(action.posts.map(post=>post.article_ids.length),[100,25]);
 await action.update({...props,ids:[...ids.slice(100),uuid(126)],titles:Object.fromEntries([...ids,uuid(126)].map(id=>[id,'后来标题']))});verifyList(action,ids,title);assert.equal(text(action.tree).includes('后来标题'),false);assert.equal(text(action.tree).includes(uuid(126)),false);
 await action.click('重试原确认的 125 篇');assert.equal(action.posts[2].request_key,action.posts[1].request_key);assert.deepEqual(action.posts[2].article_ids,action.posts[1].article_ids);result.post_scope_tested=true;result.cases.push('unknown partial retry keeps frozen title/ID display and original25 nonce');console.log('PASS unchanged range semantics: frozen titles/IDs persist through partial unknown and changed props; same25 key on retry');
 const fallback=mount({ids:[uuid(200)],restore:true,ownerScope:owner});await fallback.start();await fallback.click('恢复文章');verifyList(fallback,[uuid(200)]);assert.equal(fallback.posts.length,0);result.cases.push('missing title still exposes complete restore ID');
 const longTitle='LONG_UNBROKEN_TITLE_'.repeat(40),longAction=mount({ids:[uuid(201)],titles:{[uuid(201)]:longTitle},ownerScope:owner});await longAction.start();await longAction.click('删除当前文章');verifyList(longAction,[uuid(201)],longTitle);
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true});result.browser_version=browser.version();
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',error=>result.page_errors.push(error.message));await context.route('**/*',route=>{result.blocked_requests.push(route.request().url());return route.abort();});await context.routeWebSocket('**/*',socket=>{result.blocked_requests.push(socket.url());return socket.close();});
  try{
   await page.setContent(`<style>${css}</style><main class="studio-main article-data-page"><div class="history-restore"><span>${title}</span>${frozenMarkup}</div></main>`);await page.locator('summary').click();const listed=page.locator('li');assert.equal(await listed.count(),125);
   for(let index=0;index<125;index++){assert.ok((await listed.nth(index).innerText()).includes(ids[index]));assert.equal(await listed.nth(index).isVisible(),true);}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${viewport.width} viewport must not overflow`);if(folder)await page.screenshot({path:path.join(folder,`actual-component-${viewport.width}-125.png`),fullPage:true});
   await page.setContent(`<style>${css}</style><main class="studio-main article-data-page"><div class="history-restore"><span>${title}</span>${longAction.markup()}</div></main>`);await page.locator('summary').click();assert.ok((await page.locator('li').innerText()).includes(uuid(201)));assert.ok((await page.locator('li').innerText()).includes(longTitle));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'long title/UUID may wrap without clipping or overflow');
   if(folder)await page.screenshot({path:path.join(folder,`actual-component-${viewport.width}-long-title.png`),fullPage:true});result.cases.push(`${viewport.width} real DOM/CSS full125 IDs and long-title no overflow`);console.log(`PASS actual component markup + real CSS/Chromium at${viewport.width}:125 visible distinct IDs and unbroken long title, no overflow`);
  }finally{await context.close();}
 }
 assert.deepEqual(result.page_errors,[]);assert.deepEqual(result.blocked_requests,[]);assert.equal(createHash('sha256').update(fs.readFileSync(sourceFile,'utf8')).digest('hex'),result.source_sha256);result.status='PASS';console.log('PASS5 exact-ID presentation cases; no server started,0real business/backend/production/platform/network calls');
}catch(error){result.status='FAIL';result.error=String(error.stack||error);throw error;}finally{if(browser)await browser.close();if(folder)fs.writeFileSync(path.join(folder,'result.json'),JSON.stringify(result,null,2));}
