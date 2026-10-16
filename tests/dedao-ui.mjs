// Isolated Chromium UI QA. All task APIs are synthetic, never production.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const context=await browser.newContext(),page=await context.newPage();
 const native={thread_id:'11111111-1111-4111-8111-111111111111',turn_id:'22222222-2222-4222-8222-222222222222',turn_state:'active',safe_boundary:false,bridge_connected:true,last_observed_at:'2026-10-09T12:00:00.000Z',missing:[],lifecycle_source:'codex_app_tools',lifecycle_connected:true,wake_id:'SYNTHETIC-WAKE'};
 const connection={connected:true,accept_queue_ready:true,event_subscription:true,executor_connected:true,xiaoyu_connected:true,last_heartbeat:null,missing:[],required_configuration:[],execution_mode:'native_codex',native};
 let state={connection,batch:null},posts=0,readFails=false;
 const current={id:'synthetic-item',ordinal:1,title:'合成界面检查',stage:5,stage_name:'团队审稿',submitted:false,submitted_at:null,article_id:null,submitted_handoff_id:null,download:null};
 await context.route('**/api/dedao',async route=>{
  if(route.request().method()==='POST'){
   posts++;const input=route.request().postDataJSON();
   if(input.action==='resume')state.batch={...state.batch,state:'running',can_resume:false,failure:null};
   else if(input.action==='pause')state.batch={...state.batch,state:'paused',can_resume:false,failure:'你已请求暂停',execution_continuing:false,execution_message:'已请求暂停，等待执行端确认停止'};
   else {assert.equal(input.total,3);assert.match(input.request_key,/^[0-9a-f-]{36}$/);state.batch={id:'synthetic-batch',request_key:input.request_key,state:'running',total:3,completed:0,current_ordinal:1,elapsed_seconds:65,execution_message:'合成执行状态',execution_continuing:true,failure:null,can_resume:false,current,items:[current],items_truncated:false,execution_id:'native-turn:'+native.turn_id,runtime:'native_codex',native:{safe_boundary:false}};}
   await new Promise(r=>setTimeout(r,250));
  }
  await route.fulfill({status:readFails?503:200,contentType:'application/json',body:JSON.stringify(readFails?{error:'合成断线检查'}:state)});
 });
 await page.goto('http://127.0.0.1:5173/dedao');
 const input=page.getByLabel('生成篇数'),button=page.getByRole('button',{name:'求助成文',exact:true});await button.waitFor();
 await page.waitForFunction(()=>!document.querySelector('button[aria-label="求助成文"]').disabled);assert.equal(await input.inputValue(),'1');const nav=await page.getByRole('navigation',{name:'主要页面'}).getByRole('link').allTextContents();assert.equal(nav[nav.indexOf('得到大脑')+1],'写作台');
 for(const value of ['0','-1','1.5','1e2','']){await input.fill(value);await page.waitForFunction(()=>document.getElementById('dedao-count').getAttribute('aria-invalid')==='true');assert.equal(await button.isDisabled(),true);}
 await input.fill('3');assert.equal(await button.isEnabled(),true);
 await button.evaluate(e=>{e.click();e.click();e.click();});await page.getByRole('heading',{name:'已完成0/3篇，正在处理第1篇：团队审稿。',exact:true}).waitFor();assert.equal(posts,1);assert.equal(await button.isDisabled(),true);
 await page.reload();await page.getByText('合成界面检查',{exact:true}).first().waitFor();assert.equal(posts,1);assert.equal(await button.isDisabled(),true);
 const other=await context.newPage();await other.goto('http://127.0.0.1:5173/dedao');await other.getByRole('button',{name:'求助成文',exact:true}).waitFor();assert.equal(await other.getByRole('button',{name:'求助成文',exact:true}).isDisabled(),true);assert.equal(posts,1);
 await page.getByRole('button',{name:'暂停当前批次'}).click();await page.getByText('已请求暂停，等待执行端确认停止',{exact:true}).waitFor();assert.equal(posts,2);assert.equal(await page.getByRole('button',{name:'恢复当前批次'}).isDisabled(),true);
 state.batch={...state.batch,state:'paused',failure:'得到大脑登录失效，请在执行机浏览器重新登录',can_resume:false};await page.reload();const resume=page.getByRole('button',{name:'恢复当前批次'});await resume.waitFor();assert.equal(await resume.isDisabled(),true);await page.getByRole('alert').filter({hasText:'登录失效'}).waitFor();
 state.batch={...state.batch,can_resume:true,native:{safe_boundary:true}};await page.reload();await page.getByRole('button',{name:'恢复当前批次'}).click();await page.getByText('同一批次已恢复排队，将先核查已确认步骤和文件。').waitFor();assert.equal(posts,3);
 readFails=true;await page.getByRole('alert').filter({hasText:'尚未确认执行是否仍在继续'}).waitFor({timeout:7000});assert.equal(await button.isDisabled(),true);
 readFails=false;state={connection:{...connection,connected:false,executor_connected:false,native:{...native,bridge_connected:false,lifecycle_connected:false,missing:['原生生命周期尚未通过本对话工具验证']},missing:['原生生命周期尚未通过本对话工具验证'],required_configuration:['通过本对话实际工具验证原生生命周期']},batch:null};await page.reload();await page.getByRole('heading',{name:'事件已连接，等待电脑领取'}).waitFor();assert.equal(await button.isEnabled(),true);await page.getByText('缺少的连接配置',{exact:true}).click();await page.getByText('通过本对话实际工具验证原生生命周期',{exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'下载本机执行程序'}).count(),0);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/workspace/scratch/dedao-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'mobile has no horizontal overflow');
 console.log('PASS isolated Chromium UI: default 1, invalid number rejection, navigation position, consecutive-click lock, reload and second-page recovery, login pause and resume gate, read-failure honesty, disconnected configuration and mobile layout. APIs synthetic; no real batch created.');
}finally{await browser.close();}
