// Real local Chromium and application page/CSS; all transport is synthetic.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
const root=process.cwd(),out=await fs.mkdtemp(path.join(os.tmpdir(),'haoduoyu-dedao-cleared-ui-'));
const evidence=path.join(root,'test-results/dedao-content-clear-browser');await fs.mkdir(evidence,{recursive:true});
const entry="import React from 'react';import {createRoot} from 'react-dom/client';import Page from './app/dedao/page';import './app/globals.css';createRoot(document.getElementById('root')).render(<Page/>);";
await build({stdin:{contents:entry,resolveDir:root,loader:'tsx',sourcefile:'isolated-dedao-cleared.tsx'},bundle:true,platform:'browser',jsx:'automatic',outdir:out,entryNames:'app',define:{'process.env.NODE_ENV':'\"development\"'},logLevel:'silent'});
await fs.writeFile(path.join(out,'index.html'),'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
const server=http.createServer(async(req,res)=>{try{const name=req.url==='/'?'index.html':req.url.slice(1);if(!['index.html','app.js','app.css'].includes(name)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(out,name)));}catch{res.writeHead(500);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const connection={connected:false,accept_queue_ready:false,event_subscription:false,executor_connected:false,xiaoyu_connected:false,last_heartbeat:null,missing:[],required_configuration:[],execution_mode:'native_codex',native:null};
const batch={id:'00000000-0000-4000-8000-000000000001',request_key:'00000000-0000-4000-8000-000000000002',state:'completed',total:3,completed:0,current_ordinal:3,elapsed_seconds:90,execution_message:'本篇本站条目已永久移除；文件清理结果以原清理操作回读为准，外部执行结束仍以真实回执为准。',execution_continuing:false,failure:null,can_resume:false,current:null,current_record_deleted:true,items:[],items_truncated:false,execution_id:null,runtime:'native_codex',native:{safe_boundary:false},executor_ended:0};
let browser;const cases=[],errors=[];
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport});let state={connection,batch},reads=0,posts=0;page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());assert.equal(url.origin,origin,'no external requests');if(url.pathname!=='/api/dedao'){await route.continue();return;}if(req.method()==='GET')reads++;else posts++;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(state)});});
  await page.goto(origin);await page.getByRole('heading',{name:'本篇关联的本站条目已永久移除',exact:true}).waitFor();assert.equal(await page.getByRole('progressbar').count(),0);assert.equal(await page.getByRole('button',{name:'求助成文',exact:true}).isDisabled(),true);assert.equal(await page.getByText('外部执行结束仍以真实回执为准。',{exact:false}).count(),1);assert.equal(await page.getByText('等待得到大脑推荐',{exact:false}).count(),0);assert.equal(await page.getByText('全部已提交小鱼',{exact:false}).count(),0);assert.equal(posts,0);assert.ok(reads>=1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.screenshot({path:path.join(evidence,`deleted-${viewport.width}.png`),fullPage:true});
  const current={id:'00000000-0000-4000-8000-000000000003',ordinal:1,title:null,stage:0,stage_name:'等待推荐',submitted:false,submitted_at:null,article_id:null,submitted_handoff_id:null,download:null};
  state={connection,batch:{...batch,state:'queued',total:1,current_ordinal:1,current,current_record_deleted:false,items:[current],execution_message:'等待原生执行者领取',native:{safe_boundary:true},executor_ended:1}};await page.reload();await page.getByRole('heading',{name:'已完成0/1篇，第1篇等待领取：等待推荐。',exact:true}).waitFor();assert.equal(await page.getByRole('progressbar').count(),1);assert.equal(await page.getByRole('heading',{name:'本篇关联的本站条目已永久移除',exact:true}).count(),0);assert.equal(posts,0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.screenshot({path:path.join(evidence,`unbound-${viewport.width}.png`),fullPage:true});cases.push({viewport,deleted_current_readable:true,unbound_item_preserved:true,posts,external_requests:0});await page.close();
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(evidence,'receipt.json'),JSON.stringify({passed:true,cases,errors,verification:'Real local Chromium, application Dedao page/React/CSS; synthetic localhost transport, not production acceptance'},null,2));console.log('PASS real local Chromium 1280/390px: deleted nullable current renders honestly, unbound input remains readable, no write or external requests. Synthetic transport, not production acceptance.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));await fs.rm(out,{recursive:true,force:true});}
