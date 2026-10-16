// Actual Chromium against the actual built local Worker and isolated D1.
// Every subscription, owner, thread and attestation is synthetic QA data.
// No route mocks, production subscription, real Codex creation, 得到 navigation
// or callback guard bypass. Localhost callbacks are deliberately refused.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
const {chromium,request}=await import('/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');
const root=process.cwd(),out='evidence/dedao-dynamic',scratch=fs.mkdtempSync(path.join(os.tmpdir(),'dedao-dynamic-browser-'));
// Never attach to an existing preview. Allocate a fresh local port and verify
// the unique synthetic owner's D1 fixture before accepting Worker readiness.
const portProbe=createServer();await new Promise(resolve=>portProbe.listen(0,'127.0.0.1',resolve));
const port=portProbe.address().port;await new Promise(resolve=>portProbe.close(resolve));
const base=`http://127.0.0.1:${port}`;
const persistence=path.join(scratch,'state'),who=`synthetic-dedao-browser-${randomUUID()}`,readyWho=`synthetic-dedao-ready-${randomUUID()}`;
const hash=value=>createHash('sha256').update(value).digest('hex'),sql=value=>`'${String(value).replaceAll("'","''")}'`;
const env={...process.env,SITES_RUNTIME_ROOT:path.join(scratch,'runtime'),XDG_CONFIG_HOME:path.join(scratch,'xdg'),
 WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false',CLOUDFLARE_CF_FETCH_ENABLED:'false'};
const wrangler=['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js'];
const cfg=['--local','--persist-to',persistence,'--config','dist/server/wrangler.json'];
fs.mkdirSync(out,{recursive:true});
const checks=[],pageErrors=[],externalRequests=[],uiPosts=[],readyPosts=[];let callbackRequests=0,identityConfirmed=false;
const sourceFiles=['app/dedao/page.tsx','app/api/dedao/route.ts','app/api/dedao/native/route.ts','app/mcp/route.ts',
 'lib/dedao.ts','lib/dedao-dispatch.ts','lib/dedao-native.ts','lib/dedao-tools.ts','lib/dedao-contract.ts','lib/events.ts','db/schema.ts',
 'drizzle/0044_dedao_dynamic_dispatch.sql'];
const sourceHashes=Object.fromEntries(sourceFiles.map(file=>[file,hash(fs.readFileSync(file))]));
const callback=createServer((req,res)=>{callbackRequests++;res.writeHead(202);res.end();});
const pass=name=>{checks.push(name);console.log(`PASS ${name}`);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function execute(source,query=false){
 const file=path.join(scratch,`sql-${randomUUID()}.sql`);fs.writeFileSync(file,source,{mode:0o600});
 try{const r=spawnSync(process.execPath,[...wrangler,'d1','execute','DB',...cfg,'--file',file,...(query?['--json']:[])],{cwd:root,env,encoding:'utf8',timeout:60000});
  assert.equal(r.status,0,'isolated local D1 command failed');return query?JSON.parse(r.stdout):null;
 }finally{fs.rmSync(file,{force:true});}
}
let server,browser,context,page,readyContext,nativeRequest;
async function rpc(c,method,params){const r=await c.request.post(base+'/mcp',{headers:{origin:base},data:{jsonrpc:'2.0',id:randomUUID(),method,params}});
 assert.equal(r.status(),200);return r.json();}
async function call(c,name,args){const body=await rpc(c,'tools/call',{name,arguments:args});assert.ok(!body.error&&!body.result?.isError,`native MCP tool rejected: ${name}`);
 return body.result.structuredContent||JSON.parse(body.result.content[0].text);}
async function get(c=context){const r=await c.request.get(base+'/api/dedao');assert.equal(r.status(),200);return r.json();}
async function native(operation,args){const r=await nativeRequest.post(base+'/api/dedao/native',{data:{operation,args}});
 assert.equal(r.status(),200,`synthetic native bridge operation rejected: ${operation}`);return r.json();}
function fixtureSubscriptions(owner,callbackURL){const future=new Date(Date.now()+3600000).toISOString(),secret='whsec_'+randomBytes(32).toString('base64');
 return ['dedao.writing_requested','article.submitted'].map(name=>`INSERT INTO event_subscriptions(id,owner,callback,secret,expires,active,generation,event_name) VALUES(${[`synthetic_${randomUUID()}`,owner,callbackURL,secret,future,'active',randomUUID(),name].map(sql).join(',')});`).join('\n');}
const button=()=>page.getByRole('button',{name:'求助成文',exact:true});
async function assertQueuedLabels(p){
 const label=await p.getByRole('button',{name:'求助成文',exact:true}).innerText();
 const heading=await p.locator('.dedao-batch h3').innerText();
 assert.equal(label,'求助成文 · 等待领取');
 assert.ok(heading.includes('第1篇等待领取'),'queued batch heading must show waiting for claim');
 assert.ok(!/运行中|正在处理/.test(label+'\n'+heading),'unclaimed batch must not be labelled running');
}
try{
 assert.ok(fs.existsSync('dist/server/wrangler.json'),'build before actual browser QA');
 await new Promise(resolve=>callback.listen(0,'127.0.0.1',resolve));
 const callbackURL=`http://127.0.0.1:${callback.address().port}/synthetic-callback`;
 execute(fs.readdirSync('drizzle').filter(name=>/^\d{4}_.+\.sql$/.test(name)).sort().map(name=>fs.readFileSync(path.join('drizzle',name),'utf8')).join('\n'));
 execute(fixtureSubscriptions(who,callbackURL)+'\n'+fixtureSubscriptions(readyWho,callbackURL));
 server=spawn(process.execPath,[...wrangler,'dev',...cfg,'--ip','127.0.0.1','--port',String(port),'--inspector-port','0'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 let serverOutput='';for(const s of [server.stdout,server.stderr])s.on('data',value=>{serverOutput=(serverOutput+value.toString()).slice(-16000);});
 for(let attempt=0;attempt<90;attempt++){
  if(server.exitCode!==null)throw Error('local built Worker exited before readiness');
  try{const r=await fetch(base+'/api/dedao',{headers:{'oai-authenticated-user-id':who}});if(r.status===200){
   const identity=await r.json();if(identity.batch===null&&identity.connection.event_subscription===true&&identity.connection.accept_queue_ready===true){identityConfirmed=true;break;}
  }}catch{}
  if(attempt===89)throw Error('local Worker readiness deadline');await sleep(500);
 }
 assert.equal(identityConfirmed,true,'fresh Worker did not read this unique owner fixture from its isolated D1');
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 context=await browser.newContext({viewport:{width:1440,height:1000},extraHTTPHeaders:{'oai-authenticated-user-id':who}});
 page=await context.newPage();page.on('pageerror',e=>pageErrors.push(e.message));page.on('request',r=>{
  if(!r.url().startsWith(base+'/'))externalRequests.push(new URL(r.url()).origin);
  else if(r.method()==='POST')uiPosts.push({path:new URL(r.url()).pathname,action:JSON.parse(r.postData()||'{}').action||'start'});
 });
 const catalog=await rpc(context,'tools/list',{}),names=new Set(catalog.result.tools.map(tool=>tool.name));
 assert.ok(['read_dedao_dispatch','reserve_dedao_dispatch','record_dedao_dispatch'].every(name=>names.has(name)));
 pass('three dynamic dispatch tools appear in actual built Worker MCP tools/list');
 const empty=await get();assert.equal(empty.batch,null);assert.equal(empty.connection.accept_queue_ready,true);
 assert.equal(empty.connection.event_subscription,true);assert.equal(empty.connection.executor_connected,false);assert.equal(empty.connection.connected,false);
 await page.goto(base+'/dedao',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'事件已连接，等待电脑领取',exact:true}).waitFor();
 assert.equal(await button().isEnabled(),true);assert.equal(await page.getByLabel('生成篇数').inputValue(),'1');
 assert.equal(await page.getByRole('heading',{name:'Codex 原生电脑插件已连接',exact:true}).count(),0);
 await page.getByLabel('生成篇数').fill('3');
 await page.screenshot({path:path.join(out,'browser-desktop-1440-event-only.png'),fullPage:true});
 pass('event/subscription readiness enables one queue button without inventing native executor readiness');
 await button().evaluate(el=>{el.click();el.click();el.click();});
 await page.getByText('任务已保存并请求唤醒，等待选择当前授权电脑；创建任务后仍需实际核验再领取。',{exact:true}).waitFor();
 const queued=await get();assert.equal(queued.batch.state,'queued');assert.equal(queued.batch.total,3);assert.equal(queued.batch.completed,0);
 assert.equal(queued.batch.runtime,'native_codex');assert.equal(queued.batch.native.thread_id,null);assert.equal(queued.batch.executor_id,null);
 assert.equal(queued.batch.dispatch_state,'event_unknown');assert.equal(uiPosts.length,1);assert.equal(await button().isDisabled(),true);
 await assertQueuedLabels(page);
 const batch=queued.batch,dispatch=await call(context,'read_dedao_dispatch',{batch_id:batch.id,queue_revision:batch.queue_revision});
 assert.equal(dispatch.wake.state,'unknown');assert.equal(dispatch.may_create,false);assert.equal(dispatch.dispatch,null);
 assert.equal(callbackRequests,0,'production callback guard must reject localhost before sending');
 const dbCount=execute(`SELECT (SELECT COUNT(*) FROM dedao_batches WHERE owner=${sql(who)}) batches,(SELECT COUNT(*) FROM dedao_wake_outbox WHERE owner=${sql(who)}) wakes,(SELECT COUNT(*) FROM dedao_dispatches WHERE owner=${sql(who)}) dispatches;`,true)[0].results[0];
 assert.deepEqual(dbCount,{batches:1,wakes:1,dispatches:0});
 assert.ok(!(/事件已送达|任务已创建|电脑已领取|正在自动执行/.test(await page.locator('.dedao-page').innerText())));
 pass('three consecutive real clicks make one POST, one persisted batch/outbox; localhost guard yields honest durable unknown without callback I/O');
 const postsBeforeRefresh=uiPosts.length;
 await page.reload({waitUntil:'networkidle'});await page.getByRole('region',{name:'批次真实进度'}).waitFor();
 assert.equal(uiPosts.length,postsBeforeRefresh);assert.equal((await get()).batch.id,batch.id);assert.equal(callbackRequests,0);
 await page.waitForTimeout(4300);assert.equal(uiPosts.length,postsBeforeRefresh);
 const duplicateStart=await context.request.post(base+'/api/dedao',{headers:{origin:base,'x-xiaoyu-upload':'1'},data:{total:3,request_key:batch.request_key}});
 assert.equal(duplicateStart.status(),200);const same=await duplicateStart.json();assert.equal(same.batch.id,batch.id);
 assert.equal((await call(context,'read_dedao_dispatch',{batch_id:batch.id})).wake.updated,dispatch.wake.updated);
 pass('reload and existing read refresh write nothing, preserve exact batch/revision and never resend unknown wake');
 const reservation={batch_id:batch.id,queue_revision:batch.queue_revision,dispatch_key:randomUUID(),dispatcher_id:'synthetic-browser-parent',
  target_environment:'synthetic-authorized-computer',selection_ref:'synthetic-current-environment-observation',observed_at:new Date().toISOString()};
 const firstReservation=await call(context,'reserve_dedao_dispatch',reservation);assert.equal(firstReservation.may_create,true);
 const duplicate=await call(context,'reserve_dedao_dispatch',reservation);assert.equal(duplicate.may_create,false);
 const unknown={batch_id:batch.id,queue_revision:batch.queue_revision,dispatch_key:reservation.dispatch_key,outcome:'unknown',
  observed_at:new Date().toISOString(),observation_ref:'synthetic-supported-create-result-unknown'};
 await call(context,'record_dedao_dispatch',unknown);await call(context,'record_dedao_dispatch',unknown);
 assert.equal((await call(context,'reserve_dedao_dispatch',{...reservation,dispatch_key:randomUUID()})).may_create,false);
 assert.equal((await call(context,'read_dedao_dispatch',{batch_id:batch.id})).dispatch.state,'unknown');
 pass('actual dispatch reservation grants create once; unknown and duplicate events never grant a second create');
 await page.getByRole('button',{name:'暂停当前批次',exact:true}).click();
 await page.getByRole('button',{name:'恢复当前批次',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'恢复当前批次',exact:true}).isDisabled(),true);
 const paused=await get();assert.equal(paused.batch.state,'paused');assert.equal(paused.batch.can_resume,false);assert.equal(paused.batch.id,batch.id);
 const pausedPost=uiPosts.length;await page.getByRole('button',{name:'恢复当前批次',exact:true}).evaluate(el=>el.click());assert.equal(uiPosts.length,pausedPost);
 const deniedResume=await context.request.post(base+'/api/dedao',{headers:{origin:base,'x-xiaoyu-upload':'1'},data:{action:'resume',batch_id:batch.id}});
 assert.equal(deniedResume.status(),409);assert.equal((await get()).batch.queue_revision,batch.queue_revision);
 await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'恢复当前批次',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'恢复当前批次',exact:true}).isDisabled(),true);
 assert.ok((await page.locator('.dedao-batch').innerText()).includes('创建结果未知时先核对同一派送记录'));
 await page.screenshot({path:path.join(out,'browser-desktop-1440-paused-unknown.png'),fullPage:true});
 pass('paused unknown creation remains disabled across refresh and actual server rejects resume without changing revision');
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'390px document overflow');
 await page.screenshot({path:path.join(out,'browser-mobile-390-paused-unknown.png'),fullPage:true});
 // Synthetic capability/turn attestations only. They test the real readiness
 // projection and browser label, never a real computer/plugin or Codex tool.
 readyContext=await browser.newContext({viewport:{width:1440,height:1000},extraHTTPHeaders:{'oai-authenticated-user-id':readyWho}});
 const thread=randomUUID(),turn=randomUUID(),executor='native-codex:'+thread;
 const readyPage=await readyContext.newPage();readyPage.on('pageerror',e=>pageErrors.push(e.message));readyPage.on('request',r=>{
  if(!r.url().startsWith(base+'/'))externalRequests.push(new URL(r.url()).origin);
  else if(r.method()==='POST')readyPosts.push({path:new URL(r.url()).pathname,action:JSON.parse(r.postData()||'{}').action||'start'});
 });
 await readyPage.goto(base+'/dedao',{waitUntil:'networkidle'});
 await readyPage.getByRole('button',{name:'求助成文',exact:true}).click();
 await readyPage.getByRole('region',{name:'批次真实进度'}).waitFor();
 const readyQueued=await get(readyContext),readyBatch=readyQueued.batch;
 assert.equal(readyQueued.connection.connected,false);assert.equal(readyBatch.state,'queued');
 await assertQueuedLabels(readyPage);
 const readyReservation={batch_id:readyBatch.id,queue_revision:readyBatch.queue_revision,dispatch_key:randomUUID(),dispatcher_id:'synthetic-browser-parent',
  target_environment:'synthetic-ready-computer',selection_ref:'synthetic-current-authorized-computer-check',observed_at:new Date().toISOString()};
 assert.equal((await call(readyContext,'reserve_dedao_dispatch',readyReservation)).may_create,true);
 const createdReceipt={batch_id:readyBatch.id,queue_revision:readyBatch.queue_revision,dispatch_key:readyReservation.dispatch_key,outcome:'created',
  observed_at:new Date().toISOString(),observation_ref:'synthetic-creation-receipt-not-real-Codex-computer',thread_id:thread,session_id:thread,turn_id:turn};
 await call(readyContext,'record_dedao_dispatch',createdReceipt);
 const createdOnly=await get(readyContext);
 assert.equal(createdOnly.batch.state,'queued');assert.equal(createdOnly.batch.executor_id,null);assert.equal(createdOnly.batch.execution_id,null);
 assert.equal(createdOnly.batch.execution_continuing,false);assert.equal(createdOnly.connection.connected,false);
 assert.equal(createdOnly.batch.native.thread_id,thread);assert.equal(createdOnly.batch.dispatch.dispatch.state,'created');
 await readyPage.reload({waitUntil:'networkidle'});
 await readyPage.getByText('已记录实际新任务，等待该电脑核验并领取',{exact:true}).waitFor();
 await assertQueuedLabels(readyPage);
 await readyPage.screenshot({path:path.join(out,'browser-desktop-1440-synthetic-created-not-ready.png'),fullPage:true});
 pass('synthetic created receipt binds the exact thread/turn but actual browser and server remain queued and native-unready without a claim');
 const conversation=(fs.readFileSync('lib/dedao-contract.ts','utf8').match(/DEDAO_URL='([^']+)'/)||[])[1];assert.ok(conversation);
 const registration=await call(readyContext,'register_dedao_executor',{executor_id:executor,browser_session:'synthetic-browser-ready',capabilities:{
  conversation_url:conversation,checked_at:new Date().toISOString(),codex_available:true,browser_connected:true,logged_in:true,download_readable:true}});
 const credential=registration.native_bridge.credential;
 nativeRequest=await request.newContext({extraHTTPHeaders:{Authorization:'Bearer '+credential}});
 await native('bind',{thread_id:thread,session_id:thread,turn_id:turn,lifecycle_source:'codex_app_tools',wake_id:'synthetic-existing-wake',wake_state:'ACTIVE'});
 await sleep(20);
 await native('native_lifecycle_observation',{thread_id:thread,session_id:thread,turn_id:turn,source:'codex_app_tools',event_id:randomUUID(),state:'active',
  observed_at:new Date().toISOString(),observation_ref:'synthetic-Codex-turn-observation-not-real-computer'});
 const nativeView=await get(readyContext);assert.equal(nativeView.connection.executor_connected,true);assert.equal(nativeView.connection.connected,true);
 assert.equal(nativeView.connection.native.bridge_connected,true);assert.equal(nativeView.connection.event_subscription,true);
 assert.equal(nativeView.batch.id,readyBatch.id);assert.equal(nativeView.batch.state,'queued');assert.equal(nativeView.batch.execution_id,null);
 assert.equal(nativeView.batch.execution_continuing,false);assert.equal(nativeView.batch.completed,0);
 await readyPage.reload({waitUntil:'networkidle'});
 await readyPage.getByRole('heading',{name:'Codex 原生电脑插件已连接',exact:true}).waitFor();
 await assertQueuedLabels(readyPage);
 assert.equal(await readyPage.getByRole('button',{name:'求助成文',exact:true}).isDisabled(),true);
 assert.equal(await readyPage.getByRole('heading',{name:'事件已连接，等待电脑领取',exact:true}).count(),0);
 const html=await readyPage.content();assert.ok(!html.includes(credential));
 await readyPage.screenshot({path:path.join(out,'browser-desktop-1440-synthetic-native-ready.png'),fullPage:true});
 await readyPage.setViewportSize({width:390,height:844});assert.ok(await readyPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'390px ready document overflow');
 await readyPage.screenshot({path:path.join(out,'browser-mobile-390-synthetic-native-ready.png'),fullPage:true});
 pass('actual native registration/bind/read projection distinguishes synthetic readiness; even created plus native-ready remains queued until exact claim and exposes no credential');
 await page.setViewportSize({width:1440,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'1440px document overflow');
 assert.equal(pageErrors.length,0,pageErrors.join('\n'));assert.equal(externalRequests.length,0,'external browser request');assert.equal(callbackRequests,0);
 assert.deepEqual(uiPosts,[{path:'/api/dedao',action:'start'},{path:'/api/dedao',action:'pause'}]);
 assert.deepEqual(readyPosts,[{path:'/api/dedao',action:'start'}]);
 const finalCounts=execute(`SELECT (SELECT COUNT(*) FROM dedao_batches WHERE owner=${sql(who)}) batches,(SELECT COUNT(*) FROM dedao_wake_outbox WHERE owner=${sql(who)}) wakes,(SELECT COUNT(*) FROM dedao_dispatches WHERE owner=${sql(who)}) dispatches,(SELECT COUNT(*) FROM dedao_batches WHERE owner=${sql(readyWho)}) ready_owner_batches;`,true)[0].results[0];
 assert.deepEqual(finalCounts,{batches:1,wakes:1,dispatches:1,ready_owner_batches:1});
 pass('actual 1440/390 layouts have no overflow/page exceptions, no external browsing, and retain one batch/wake/dispatch');
 fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify({passed:true,checks,actual_built_worker:true,actual_local_d1:true,actual_chromium:true,
  route_mocks:false,synthetic_only:true,subscription_fixture:'active rows inserted into isolated local D1; no subscribe tool called',
  callback_transport:'real production validator rejected localhost before fetch; zero local callback requests; acceptance and signed HMAC not tested here',
  native_readiness_fixture:'synthetic capability/turn attestations through actual localhost register/bind/observe endpoints; not actual Codex computer evidence',
  ui_unknown_wording:'任务已保存并请求唤醒; describes attempted request, does not say event accepted or task created',
  page_errors:pageErrors,external_browser_requests:externalRequests,ui_posts:uiPosts,ready_fixture_ui_posts:readyPosts,counts:finalCounts,production_tested:false,
  real_subscription_created:false,real_computer_or_codex_task_created:false,real_dedao_button_download_claim_tested:false,
  real_computer_end_to_end:'unverified: parent reported local file execution/setup errors; real button/create/download/claim chain not accepted',
  real_word_seven_complete:false,viewports:[{width:1440,height:1000},{width:390,height:844}],source_sha256:sourceHashes,
  unclaimed_ui_labels:'Actual DOM assertions in queued, created-but-unready and created-plus-native-ready fixtures: button 等待领取, batch heading 第1篇等待领取, neither says 运行中 or 正在处理',
  fresh_ephemeral_port:true,isolated_instance_identity_confirmed:identityConfirmed,build_worker_sha256:hash(fs.readFileSync('dist/server/index.js'))},null,2)+'\n');
 console.log(`PASS ${checks.length} actual Chromium + built local Worker/D1 groups; synthetic only, real computer E2E untested`);
}catch(error){
 fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify({passed:false,checks,error:error.message,actual_built_worker:true,actual_local_d1:true,
  route_mocks:false,synthetic_only:true,page_errors:pageErrors,production_tested:false,real_computer_end_to_end_tested:false},null,2)+'\n');throw error;
}finally{
 if(nativeRequest)await nativeRequest.dispose();if(readyContext)await readyContext.close();if(context)await context.close();if(browser)await browser.close();
 if(server){server.kill('SIGTERM');await Promise.race([new Promise(resolve=>server.once('exit',resolve)),sleep(5000)]);if(server.exitCode===null)server.kill('SIGKILL');}
 await new Promise(resolve=>callback.close(resolve));fs.rmSync(scratch,{recursive:true,force:true});
 fs.writeFileSync(path.join(out,'browser-cleanup.json'),JSON.stringify({only_spawned_server_signalled:true,
  spawned_server_exit_observed:!server||server.exitCode!==null||server.signalCode!==null,
  temporary_state_removed:!fs.existsSync(scratch),callback_server_closed:!callback.listening,
  unknown_old_server_touched:false},null,2)+'\n');
}
