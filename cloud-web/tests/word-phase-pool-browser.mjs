// Actual built local Worker/D1 and Chromium. Synthetic owner/articles only.
// No production calls, real manuscripts, image network, renderer, or route mocks.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
const {chromium}=await import('/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');
const root=process.cwd(),out='evidence/word-phase-pool',scratch=fs.mkdtempSync(path.join(os.tmpdir(),'word-phase-pool-browser-'));
const port=Number(process.env.WORD_PHASE_POOL_BROWSER_PORT||8791),base=`http://127.0.0.1:${port}`;
const persistence=path.join(scratch,'state'),runtime=path.join(scratch,'runtime');
const who=`synthetic-phase-pool-browser-${randomUUID()}`,hash=value=>createHash('sha256').update(value).digest('hex');
const sql=value=>`'${String(value).replaceAll("'","''")}'`;
const raw=JSON.stringify(['合成浏览器测试标题','合成浏览器测试正文，仅用于本地验证。']);
const jobs=Array.from({length:8},(_,i)=>({target_kind:'article',target_id:randomUUID(),title:`合成并发验证 ${i+1}`,claim_token:randomUUID(),
 input_sha256:hash(raw),execution_token:randomUUID(),execution_id:randomUUID(),request_key:randomUUID()}));
const recent={id:randomUUID(),title:'合成最近文章，仅用于验证清空区域'};
const env={...process.env,SITES_RUNTIME_ROOT:runtime,XDG_CONFIG_HOME:path.join(scratch,'xdg'),WRANGLER_SEND_METRICS:'false',
 WRANGLER_WRITE_LOGS:'false',CLOUDFLARE_CF_FETCH_ENABLED:'false'};
const wrangler=['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js'];
const cfg=['--local','--persist-to',persistence,'--config','dist/server/wrangler.json'];
fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[],externalRequests=[],uiWrites=[];
const pass=name=>{checks.push(name);console.log(`PASS ${name}`);};
const target=job=>({target_kind:job.target_kind,target_id:job.target_id});
const execute=source=>{
 const file=path.join(scratch,`sql-${randomUUID()}.sql`);fs.writeFileSync(file,source,{mode:0o600});
 try{const result=spawnSync(process.execPath,[...wrangler,'d1','execute','DB',...cfg,'--file',file],{cwd:root,env,encoding:'utf8',timeout:60000});
  assert.equal(result.status,0,'isolated synthetic local D1 command failed');
 }finally{fs.rmSync(file,{force:true});}
};
let server,browser,context,page;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function rpc(method,params){
 const response=await context.request.post(base+'/mcp',{headers:{origin:base},data:{jsonrpc:'2.0',id:randomUUID(),method,params}});
 assert.equal(response.status(),200,'native MCP HTTP status');return response.json();
}
async function call(name,args){
 const body=await rpc('tools/call',{name,arguments:args});assert.ok(!body.error&&!body.result?.isError,`native tool rejected: ${name}`);
 return body.result.structuredContent||JSON.parse(body.result.content[0].text);
}
async function rejected(name,args){const body=await rpc('tools/call',{name,arguments:args});assert.ok(body.error||body.result?.isError,`expected native rejection: ${name}`);}
const read=job=>call('read_word_progress',target(job));
const recovery=job=>call('read_word_recovery',target(job));
const acquire=(job,scope='prepare')=>call('acquire_word_execution',{...job,title:undefined,execution_scope:scope});
async function record(job,stage,state,observation){const p=(await read(job)).word_progress;return call('record_word_progress',{
 ...target(job),claim_token:job.claim_token,input_sha256:job.input_sha256,execution_token:job.execution_token,
 expected_version:p.version,event_id:randomUUID(),stage,state,observation});}
async function transitionArgs(job,scope){const r=(await recovery(job)).recovery;return {...target(job),claim_token:job.claim_token,input_sha256:job.input_sha256,
 execution_token:job.execution_token,execution_id:job.execution_id,request_key:randomUUID(),epoch:r.epoch,expected_version:r.version,
 next_execution_token:randomUUID(),execution_scope:scope};}
const adopt=(job,args)=>{job.execution_token=args.next_execution_token;job.request_key=args.request_key;};
function card(job){return page.locator('.publish-work .article-card').filter({has:page.getByRole('heading',{name:job.title,exact:true})});}
const panel=job=>card(job).locator('.word-stage-progress');
async function refresh(){await page.getByRole('button',{name:'刷新',exact:true}).click();await page.getByText('已刷新',{exact:true}).waitFor();}
async function expanded(job){const p=panel(job);if(!await p.evaluate(el=>el.open))await p.locator('summary').click();return p;}
async function activeCount(){const states=await Promise.all(jobs.map(recovery));const live=states.map(x=>x.recovery).filter(x=>x?.status==='running');
 return {total:live.length,heavy:live.filter(x=>x.resource_class==='heavy').length};}
try{
 assert.ok(fs.existsSync('dist/server/wrangler.json'),'build before actual browser test');
 execute(fs.readdirSync('drizzle').filter(name=>/^\d{4}_.+\.sql$/.test(name)).sort().map(name=>fs.readFileSync(path.join('drizzle',name),'utf8')).join('\n'));
 const stamp=new Date().toISOString(),expires=new Date(Date.now()+3600000).toISOString();
 execute(jobs.map((job,index)=>`INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state,claim_token,claim_expires) VALUES(${[job.target_id,who,job.title,'synthetic.docx',`synthetic/${job.target_id}/source`,raw,new Date(Date.now()+index).toISOString(),'processing',job.claim_token,expires].map(sql).join(',')});`).join('\n')+
  `\nINSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state) VALUES(${[recent.id,who,recent.title,'synthetic-recent.docx',`synthetic/${recent.id}/source`,raw,stamp,'uploaded'].map(sql).join(',')});`);
 server=spawn(process.execPath,[...wrangler,'dev',...cfg,'--ip','127.0.0.1','--port',String(port),'--inspector-port','0'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 let serverOutput='';for(const stream of [server.stdout,server.stderr])stream.on('data',data=>{serverOutput=(serverOutput+data.toString()).slice(-12000);});
 for(let attempt=0;attempt<90;attempt++){
  if(server.exitCode!==null)throw Error('local Worker exited before readiness');
  try{const response=await fetch(base+'/api/articles',{headers:{'oai-authenticated-user-id':who}});if(response.status===200)break;}catch{}
  if(attempt===89)throw Error('local Worker readiness deadline');await sleep(500);
 }
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 context=await browser.newContext({viewport:{width:1440,height:1000},extraHTTPHeaders:{'oai-authenticated-user-id':who}});
 page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{
  if(!request.url().startsWith(base+'/'))externalRequests.push(new URL(request.url()).origin);
  else if(request.method()!=='GET')uiWrites.push(new URL(request.url()).pathname);
 });
 const catalog=await rpc('tools/list',{}),names=new Set(catalog.result.tools.map(tool=>tool.name));
 const expected=['read_word_recovery','read_word_execution_receipt','read_word_checkpoint_chunk','read_word_output_chunk','begin_word_checkpoint',
  'put_word_checkpoint_chunk','finalize_word_checkpoint','acquire_word_execution','transition_word_execution','heartbeat_word_execution',
  'record_word_image_result','declare_word_image_floor','set_word_intent','report_word_interruption'];
 assert.ok(expected.every(name=>names.has(name)));pass('all 14 recovery tools registered through actual built Worker MCP tools/list');
 const readSources=await Promise.all(jobs.map(job=>call('read_article',{article_id:job.target_id})));
 assert.ok(readSources.every(source=>hash(JSON.stringify(source.paragraphs))===hash(raw)));
 pass('eight synthetic frozen source identities read through native tools before execution');
 const initial=await Promise.all(jobs.map(job=>acquire(job)));
 assert.equal(initial.filter(result=>result.acquired).length,7);
 const winners=jobs.filter((_,index)=>initial[index].acquired),waiting=jobs.find((_,index)=>!initial[index].acquired);
 assert.deepEqual(await activeCount(),{total:7,heavy:0});
 const queuedReceipt=await call('read_word_execution_receipt',{...target(waiting),request_key:waiting.request_key});
 assert.equal(queuedReceipt.queued,true);assert.equal(queuedReceipt.applicable,false);assert.equal(queuedReceipt.new_execution_grant,false);
 assert.equal((await recovery(waiting)).recovery.queue_reason,'total_capacity');
 pass('actual concurrent native MCP preparation acquisitions grant seven and durably queue eighth without grant');
 await Promise.all(winners.map(job=>record(job,'read_source','completed',{action:'read_frozen_source',reason:'none'})));
 const conversionArgs=await Promise.all(winners.map(job=>transitionArgs(job,'heavy')));
 const conversions=await Promise.all(winners.map((job,index)=>call('transition_word_execution',conversionArgs[index])));
 assert.equal(conversions.filter(result=>result.acquired).length,2);assert.equal(conversions.filter(result=>!result.acquired&&result.queued).length,5);
 const heavy=[];let preparing;
 conversions.forEach((result,index)=>{if(result.acquired){heavy.push(winners[index]);adopt(winners[index],conversionArgs[index]);}else preparing??=winners[index];});
 assert.deepEqual(await activeCount(),{total:7,heavy:2});
 await record(preparing,'collect_images','running',{action:'search_public_images',reason:'none',candidate_urls:[
  'https://images.example.org/synthetic-one.png','https://images.example.org/synthetic-two.png','https://images.example.org/synthetic-three.png']});
 const preserved=(await read(preparing)).word_progress;
 assert.equal(preserved.steps[0].state,'completed');assert.equal(preserved.steps[1].counts.completed,3);
 pass('two native conversions grant heavy; other five retain prepare rights and queue; confirmed source/candidate count persist');
 await page.goto(base,{waitUntil:'networkidle'});
 assert.equal(await page.locator('.publish-work .article-card').count(),8);
 assert.equal(await page.locator('.publish-history .article-card').count(),1);
 assert.ok((await page.locator('.publish-work').innerText()).includes('此区不参与清空'));
 await page.locator('.publish-history > summary').click();
 assert.equal(await page.locator('.publish-history').getByRole('button',{name:'一键清空最近文章',exact:true}).count(),1);
 assert.ok(!(await page.locator('.publish-history').innerText()).includes(preparing.title));
 pass('execution and recent articles remain separate; existing clear control stays only in recent region');
 const prepPanel=await expanded(preparing),waitPanel=await expanded(waiting),heavyPanel=await expanded(heavy[0]);
 assert.equal(await prepPanel.locator('li').count(),6);
 assert.ok((await prepPanel.locator('summary').innerText()).includes('配图准备 · 等待 Word 处理位'));
 assert.ok((await prepPanel.innerText()).includes('配图准备仍可继续'));
 assert.ok((await prepPanel.innerText()).includes('已找到候选 3 张'));
 assert.ok((await prepPanel.locator('li').first().innerText()).includes('已完成'));
 assert.ok((await waitPanel.locator('summary').innerText()).includes('等待处理位'));
 assert.ok((await heavyPanel.locator('summary').innerText()).includes('Word 处理'));
 assert.ok(!(/\d+%|排队第|自动开始|即将|后台已停止/.test(await prepPanel.innerText())));
 for(const job of jobs)assert.ok(!(await page.content()).includes(job.claim_token)&&!(await page.content()).includes(job.execution_token));
 await page.screenshot({path:path.join(out,'browser-desktop-1440-pools.png'),fullPage:true});
 pass('actual mounted six-step UI displays real prepare/heavy/queue labels and count, without tokens or fabricated progress');
 const writesBeforeReload=uiWrites.length;
 await page.reload({waitUntil:'networkidle'});await expanded(preparing);await expanded(waiting);
 assert.ok((await panel(preparing).innerText()).includes('已找到候选 3 张'));
 assert.ok((await panel(waiting).locator('summary').innerText()).includes('等待处理位'));
 assert.equal((await read(preparing)).word_progress.target_id,preserved.target_id);
 assert.equal((await read(preparing)).word_progress.input_sha256,preserved.input_sha256);
 assert.equal((await read(preparing)).word_progress.version,preserved.version);
 assert.equal(uiWrites.length,writesBeforeReload,'browser reload must not claim, remake or redispatch');
 pass('full refresh reads same article/source/progress/count and durable queue without acquiring or remaking');
 const originalWaitingRequest=waiting.request_key,originalWaitingToken=waiting.execution_token,originalWaitingExecution=waiting.execution_id;
 await panel(waiting).getByRole('button',{name:'暂停',exact:true}).click();
 await panel(waiting).getByText('暂停已保存',{exact:false}).waitFor();
 await page.reload({waitUntil:'networkidle'});await expanded(waiting);
 assert.ok((await panel(waiting).locator('summary').innerText()).includes('已暂停'));
 assert.equal((await call('read_word_execution_receipt',{...target(waiting),request_key:originalWaitingRequest})).applicable,false);
 // Deterministic transport scheduling only: original native fetch and actual
 // Worker response remain unchanged; hold its delivery while a newer real queue
 // state is read. No request/response fabrication or Playwright route mocking.
 await page.evaluate(id=>{
  const original=window.fetch.bind(window);window.__wordPhaseDelay={captured:null,release:null,restore:()=>{window.fetch=original;}};
  window.fetch=async(...args)=>{
   const response=await original(...args);
   if(String(args[0])==='/api/word-recovery'&&args[1]?.method==='POST'){
    const intent=JSON.parse(args[1].body);
    if(intent.intent==='run'&&intent.target_id===id){
     window.__wordPhaseDelay.captured=(await response.clone().json()).recovery;
     await new Promise(resolve=>{window.__wordPhaseDelay.release=resolve;});
    }
   }
   return response;
  };
 },waiting.target_id);
 await panel(waiting).getByRole('button',{name:'继续',exact:true}).click();
 await page.waitForFunction(()=>window.__wordPhaseDelay?.captured!==null);
 const delayedRecovery=await page.evaluate(()=>window.__wordPhaseDelay.captured);
 waiting.request_key=randomUUID();waiting.execution_token=randomUUID();waiting.execution_id=randomUUID();
 const freshQueue=await acquire(waiting);assert.equal(freshQueue.acquired,false);assert.equal(freshQueue.queued,true);
 const newQueue=(await recovery(waiting)).recovery;
 assert.equal(newQueue.version,delayedRecovery.version);assert.ok(newQueue.queue_revision>delayedRecovery.queue_revision);
 await refresh();assert.ok((await panel(waiting).locator('summary').innerText()).includes('等待处理位'));
 await page.evaluate(()=>{window.__wordPhaseDelay.release();window.__wordPhaseDelay.restore();});
 await panel(waiting).getByText('已收到先前操作回执',{exact:false}).waitFor();
 assert.ok((await panel(waiting).locator('summary').innerText()).includes('等待处理位'));
 const queueAfterLate=(await recovery(waiting)).recovery;
 assert.equal(queueAfterLate.queue_revision,newQueue.queue_revision);
 await rejected('acquire_word_execution',{...target(waiting),claim_token:waiting.claim_token,input_sha256:waiting.input_sha256,
  execution_token:originalWaitingToken,execution_id:originalWaitingExecution,request_key:originalWaitingRequest,execution_scope:'prepare'});
 pass('real delayed continue response at same version/lower queue_revision cannot replace newer native queued read; ended request cannot revive');
 const pausedHeavy=heavy[0],oldHeavyToken=pausedHeavy.execution_token;
 await expanded(pausedHeavy);await panel(pausedHeavy).getByRole('button',{name:'暂停',exact:true}).click();
 await panel(pausedHeavy).getByText('暂停已保存',{exact:false}).waitFor();
 await rejected('record_word_progress',{...target(pausedHeavy),claim_token:pausedHeavy.claim_token,input_sha256:pausedHeavy.input_sha256,
  execution_token:oldHeavyToken,expected_version:(await read(pausedHeavy)).word_progress.version,event_id:randomUUID(),stage:'collect_images',state:'running',
  observation:{action:'search_public_images',reason:'none'}});
 const preparingIndex=winners.indexOf(preparing),oldPrepareToken=preparing.execution_token;
 const resumed=await call('transition_word_execution',conversionArgs[preparingIndex]);assert.equal(resumed.acquired,true);
 adopt(preparing,conversionArgs[preparingIndex]);
 await rejected('record_word_progress',{...target(preparing),claim_token:preparing.claim_token,input_sha256:preparing.input_sha256,
  execution_token:oldPrepareToken,expected_version:(await read(preparing)).word_progress.version,event_id:randomUUID(),stage:'collect_images',state:'running',
  observation:{action:'search_public_images',reason:'none'}});
 const afterTransition=(await read(preparing)).word_progress;
 assert.equal(afterTransition.version,preserved.version);assert.equal(afterTransition.steps[0].state,'completed');
 assert.equal(afterTransition.steps[1].counts.completed,3);assert.equal(afterTransition.input_sha256,preserved.input_sha256);
 assert.equal((await activeCount()).heavy,2);
 const freshGrant=await acquire(waiting);assert.equal(freshGrant.acquired,true);assert.equal(freshGrant.new_execution_grant,true);
 assert.deepEqual(await activeCount(),{total:7,heavy:2});
 await refresh();await expanded(preparing);await expanded(pausedHeavy);
 assert.ok((await panel(preparing).locator('summary').innerText()).includes('Word 处理'));
 assert.ok((await panel(preparing).innerText()).includes('已找到候选 3 张'));
 assert.ok((await panel(pausedHeavy).locator('summary').innerText()).includes('已暂停'));
 pass('actual UI pause fences old token; same queued conversion resumes once after release, keeps counts and two-heavy limit');
 await panel(pausedHeavy).getByRole('button',{name:'继续',exact:true}).click();
 await panel(pausedHeavy).getByText('继续意图已保存',{exact:false}).waitFor();
 await page.reload({waitUntil:'networkidle'});await expanded(pausedHeavy);await expanded(preparing);
 assert.ok((await panel(pausedHeavy).locator('summary').innerText()).includes('待执行器'));
 assert.equal((await recovery(pausedHeavy)).recovery.status,'await_executor');
 assert.equal((await read(pausedHeavy)).word_progress.steps[0].state,'completed');
 await rejected('record_word_progress',{...target(pausedHeavy),claim_token:pausedHeavy.claim_token,input_sha256:pausedHeavy.input_sha256,
  execution_token:oldHeavyToken,expected_version:(await read(pausedHeavy)).word_progress.version,event_id:randomUUID(),stage:'collect_images',state:'running',
  observation:{action:'search_public_images',reason:'none'}});
 pass('UI continue survives refresh as awaiting executor, preserves confirmed source and never reactivates old token');
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'390px document overflow');
 await page.screenshot({path:path.join(out,'browser-mobile-390-resumed.png'),fullPage:true});
 await context.setOffline(true);await page.waitForTimeout(350);
 assert.ok((await panel(preparing).innerText()).includes('网页网络已断开'));
 assert.ok((await panel(preparing).innerText()).includes('后台执行情况未确认'));
 assert.ok(!(await panel(preparing).innerText()).includes('后台已停止'));
 assert.equal(await panel(preparing).getByRole('button',{name:'暂停',exact:true}).count(),0);
 await page.screenshot({path:path.join(out,'browser-mobile-390-offline.png'),fullPage:true});
 await context.setOffline(false);await page.reload({waitUntil:'networkidle'});await expanded(preparing);
 assert.ok((await panel(preparing).innerText()).includes('已找到候选 3 张'));
 assert.ok((await panel(preparing).locator('summary').innerText()).includes('Word 处理'));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'390px reconnect document overflow');
 pass('390px actual browser offline reports unconfirmed connection and retains records; reconnect rereads actual job');
 await page.setViewportSize({width:1440,height:1000});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'1440px document overflow');
 await expanded(pausedHeavy);await page.screenshot({path:path.join(out,'browser-desktop-1440-after-resume.png'),fullPage:true});
 assert.equal(errors.length,0,errors.join('\n'));assert.equal(externalRequests.length,0,'unexpected external browser request');
 assert.ok(uiWrites.every(route=>route==='/api/word-recovery'),'unexpected browser claim/upload/dispatch/deletion mutation');
 for(const job of jobs){const p=(await read(job)).word_progress;assert.equal(p.output,null);assert.equal(p.save.cloud_ready,false);}
 pass('actual desktop/mobile layout has no horizontal overflow or page exceptions; no production/image/Word success inferred');
 fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify({synthetic_only:true,actual_built_worker:true,actual_local_d1:true,chromium:true,
  route_mocks:false,transport_delay:'one unchanged real native fetch response delayed for same-version queue_revision regression',
  checks,page_errors:errors,external_browser_requests:externalRequests,ui_mutation_routes:uiWrites,production_tested:false,real_image_download_tested:false,
  real_word_renderer_tested:false,production_seven_word_parallel_verified:false,passed:true,
  viewports:[{width:1440,height:1000},{width:390,height:844}],queue_revision_proof:{version:newQueue.version,
   older:delayedRecovery.queue_revision,newer:newQueue.queue_revision}},null,2)+'\n');
 console.log(`PASS ${checks.length} actual Chromium + built local Worker/D1 groups; synthetic only, no production acceptance`);
}catch(error){
 fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify({synthetic_only:true,actual_built_worker:true,actual_local_d1:true,chromium:!!browser,
  route_mocks:false,checks,page_errors:errors,production_tested:false,real_image_download_tested:false,real_word_renderer_tested:false,
  passed:false,error:error.message},null,2)+'\n');throw error;
}finally{
 if(context)await context.close();if(browser)await browser.close();
 if(server){server.kill('SIGTERM');await Promise.race([new Promise(resolve=>server.once('exit',resolve)),sleep(5000)]);if(server.exitCode===null)server.kill('SIGKILL');}
 fs.rmSync(scratch,{recursive:true,force:true});
}
