// Actual final built Worker, isolated local D1 and installed Chromium. This
// exercises the normal HTTP list -> per-card GET -> hydrated DOM read chain.
// Only synthetic persisted fixtures; no route mocks, production, real accounts,
// API claims/grants/POSTs, browser installation, Word creation or publication.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';

const root=process.cwd(),args=process.argv.slice(2);
function option(name,fallback){const at=args.indexOf(name);if(at<0)return fallback;assert.ok(args[at+1],`${name} requires a path`);return path.resolve(args[at+1]);}
const config=path.join(root,'dist/server/wrangler.json');
const captureFile=option('--source-capture',path.join(root,'evidence/dedao-serial/build-runtime-source-hashes.json'));
const evidence=option('--evidence',path.join(root,'evidence/word-progress-read/browser'));
assert.ok(fs.existsSync(config),'Build the final frozen runtime before running this local browser QA');
assert.ok(fs.existsSync('/usr/bin/chromium'),'An installed Chromium is required; this test never installs a browser');
const sha=value=>createHash('sha256').update(value).digest('hex');
const sourceFiles=['app/page.tsx','components/word-stage-progress.tsx','lib/articles.ts','app/api/articles/route.ts','app/api/articles/[id]/word-progress/route.ts','lib/word-progress.ts','lib/word-progress-contract.ts','lib/word-attempts.ts','lib/word-recovery.ts'];
const sourceHash=()=>Object.fromEntries(sourceFiles.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
function buildHashes(directory=path.join(root,'dist')){const hashes={};for(const item of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const full=path.join(directory,item.name);if(item.isDirectory())Object.assign(hashes,buildHashes(full));else if(item.isFile())hashes[path.relative(root,full)]=sha(fs.readFileSync(full));}return hashes;}
const capture=JSON.parse(fs.readFileSync(captureFile,'utf8')),captured=capture.source_file_sha256||capture.files;
assert.ok(captured&&typeof captured==='object','The final build needs a runtime source SHA256 capture');
const sourceBefore=sourceHash(),buildBefore=buildHashes(),buildConfig=JSON.parse(fs.readFileSync(config,'utf8'));
const workerHash=sha(fs.readFileSync(path.resolve(path.dirname(config),buildConfig.main)));
function verifyCapture(){for(const [file,digest] of Object.entries(captured))assert.equal(sha(fs.readFileSync(path.join(root,file))),digest,'Final build source capture changed: '+file);}
assert.deepEqual(Object.fromEntries(sourceFiles.map(file=>[file,captured[file]])),sourceBefore,'Final build capture must include current Home, new normal GET and actual progress code');verifyCapture();
fs.mkdirSync(evidence,{recursive:true});
const scratch=fs.mkdtempSync('/tmp/haoduoyu-word-progress-read-browser-'),persist=path.join(scratch,'state');
const testEnv={...process.env,XDG_CONFIG_HOME:path.join(scratch,'xdg'),WRANGLER_SEND_METRICS:'false'};
delete testEnv.CLOUDFLARE_API_TOKEN;delete testEnv.CLOUDFLARE_API_KEY;
const cli=['--import',path.join(root,'scripts/sites-env.mjs'),path.join(root,'node_modules/wrangler/bin/wrangler.js')];
const wrangler=values=>spawnSync(process.execPath,[...cli,...values],{cwd:root,env:testEnv,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
function sqlFile(sql){const file=path.join(scratch,'fixture-'+randomUUID()+'.sql');fs.writeFileSync(file,sql);try{const result=wrangler(['d1','execute','DB','--local','--persist-to',persist,'--config',config,'--file',file,'--json']);assert.equal(result.status,0,'Isolated local D1 command failed: '+result.stderr.slice(-1500));return JSON.parse(result.stdout);}finally{fs.rmSync(file,{force:true});}}
const literal=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
const insert=(table,values)=>`INSERT INTO ${table}(${Object.keys(values).join(',')}) VALUES(${Object.values(values).map(literal).join(',')});`;
const owner='synthetic-read-browser-'+randomUUID(),articles=[];
const labels=['读取原文','搜集图片','确定配图','生成 Word','逐页检查','保存成品'];
const stageIds=['read_source','collect_images','confirm_images','generate_word','inspect_pages','save_final'];
const candidateCounts=[3,3,1,20,8]; // Synthetic shape only; never a production-data read.
const now=Date.now(),updated=new Date(now-60000).toISOString(),expires=new Date(now+3600000).toISOString();
function seed(){
 const statements=[];
 for(let index=0;index<30;index++){
  const article={id:randomUUID(),title:`合成读取链 · ${String(index+1).padStart(2,'0')}`,state:index<7?'processing':index<16?'queued':index<25?'failed':'uploaded',section:index<25?'work':'recent',count:index<5?candidateCounts[index]:null,claim:index<25?randomUUID():null};
  articles.push(article);
  const paragraphs=JSON.stringify([article.title,'本地隔离的合成冻结原文；不是真实稿件。']);
  statements.push(insert('articles',{id:article.id,owner,title:article.title,filename:'synthetic-read-chain.txt',source_key:`articles/${article.id}/source`,paragraphs,state:article.state,claim_token:article.claim,claim_expires:article.claim?expires:null,created:new Date(now-index*1000).toISOString()}));
  if(article.count===null)continue;
  const steps=stageIds.map((id,i)=>({id,label:labels[i],state:i===0?'completed':i===1?'current':'pending',action:i===0?'已读取冻结原文':i===1?'正在搜集公开图片':null,counts:i===1?{completed:article.count,total:null,unit:'candidates'}:null,evidence:i<2?'executor_report':null}));
  const snapshot={steps,stage:'collect_images',state:'waiting',reason:'waiting_for_images',observations:{},output_sha256:null,started_at:updated,updated_at:updated,executor_updated_at:updated};
  statements.push(insert('word_progress_events',{owner,target_kind:'article',target_id:article.id,attempt_id:null,version:2,event_id:randomUUID(),input_sha256:sha(paragraphs),payload_sha256:sha(JSON.stringify(snapshot)),snapshot_json:JSON.stringify(snapshot),created:updated}));
 }
 sqlFile(statements.join('\n'));
}
function databaseSnapshot(){
 const tableNames=sqlFile("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND substr(lower(name),1,4)<>'_cf_' ORDER BY name;")[0].results.map(row=>row.name);
 const data=sqlFile(tableNames.map(table=>`SELECT * FROM "${table.replaceAll('"','""')}" ORDER BY rowid;`).join('\n'));
 return sha(JSON.stringify(data.map((result,index)=>({table:tableNames[index],rows:result.results}))));
}
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
let server,browser,context,page,base,serverLog='',offline=false,result;
const pageErrors=[],consoleErrors=[],requests=[],statuses=[],activeReads=new Set(),checks=[];
let maxReads=0,apiWrites=0;
const progressUrl=url=>/^\/api\/articles\/[^/]+\/word-progress$/.test(new URL(url).pathname);
const perCardCalls=article=>requests.filter(request=>progressUrl(request.url)&&new URL(request.url).pathname.split('/')[3]===article.id);
async function ready(){const end=Date.now()+60000;while(Date.now()<end){if(server.exitCode!==null)throw Error('Owned local Worker exited before ready: '+serverLog.slice(-2000));try{if((await fetch(base)).ok)return;}catch{}await delay(250);}throw Error('Owned local Worker readiness timeout: '+serverLog.slice(-2000));}
async function waitFor(condition,message){const end=Date.now()+15000;while(Date.now()<end){if(await condition())return;await delay(100);}throw Error(message);}
const card=article=>page.locator('article').filter({has:page.getByRole('heading',{name:article.title,exact:true})});
const panel=article=>card(article).locator('.word-stage-progress');
async function openPanel(article){const element=panel(article);await element.waitFor();if(!await element.evaluate(node=>node.open))await element.locator('summary').click();await element.locator('li').nth(5).waitFor();assert.equal(await element.locator('li').count(),6);return element;}
async function assertStages(article){const element=panel(article);const names=await element.locator('.word-stage-title').allInnerTexts();assert.deepEqual(names,labels,'actual DOM retains the six Word stages in exact order');const value=await element.innerText();assert.doesNotMatch(value,/\d+%|排队中|本次配图已用 \d|成品已保存/,'these fixtures have no attempt grant or saved output');if(article.count===null){const expected=['uploaded','queued'].includes(article.state)?'pending':'unrecorded';assert.deepEqual(await element.locator('li').evaluateAll(nodes=>nodes.map(node=>node.dataset.state)),Array(6).fill(expected),'queued/uploaded with no snapshot stay pending; old processing/failed history stays unrecorded');assert.doesNotMatch(value,/已找到候选|已确定 \d|已检查 \d/,'records without observations cannot invent historical counts');}else assert.match(value,new RegExp(`已找到候选 ${article.count} 张`));}
async function screenshot(name){await page.screenshot({path:path.join(evidence,name+'.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' has horizontal overflow');}
try{
 const migrations=fs.readdirSync(path.join(root,'drizzle')).filter(file=>/^\d+.*\.sql$/.test(file)).sort();sqlFile(migrations.map(file=>fs.readFileSync(path.join(root,'drizzle',file),'utf8')).join('\n'));seed();
 const dbBefore=databaseSnapshot();
 const port=await new Promise(resolve=>{const socket=net.createServer();socket.listen(0,'127.0.0.1',()=>{const available=socket.address().port;socket.close(()=>resolve(available));});});base=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,[...cli,'dev','--config',config,'--local','--persist-to',persist,'--ip','127.0.0.1','--port',String(port),'--inspector-port','0'],{cwd:root,env:testEnv,detached:true,stdio:['ignore','pipe','pipe']});server.stdout.on('data',chunk=>{serverLog+=chunk;});server.stderr.on('data',chunk=>{serverLog+=chunk;});await ready();
 console.log('Actual frozen local Worker ready; synthetic 25 pending + 5 recent read-chain browser QA begins.');
 const {chromium}=await import('/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 context=await browser.newContext({viewport:{width:1440,height:1080},extraHTTPHeaders:{'oai-authenticated-user-id':owner}});page=await context.newPage();
 page.on('pageerror',error=>pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')consoleErrors.push({offline,message:message.text()});});
 page.on('request',request=>{const url=request.url(),pathname=new URL(url).pathname;if(pathname.startsWith('/api/')&&!['GET','HEAD'].includes(request.method()))apiWrites++;requests.push({url,method:request.method()});if(progressUrl(url)){activeReads.add(request);maxReads=Math.max(maxReads,activeReads.size);}});
 page.on('requestfinished',request=>activeReads.delete(request));page.on('requestfailed',request=>activeReads.delete(request));
 page.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/api/'))statuses.push({path:new URL(response.url()).pathname,status:response.status()});});
 const listResponse=await context.request.get(base+'/api/articles');assert.equal(listResponse.status(),200);const listed=await listResponse.json();assert.equal(listed.pending_total,25);assert.equal(listed.items.length,30);assert.equal(listed.items.filter(item=>item.list_section==='work').length,25);assert.equal(listed.items.filter(item=>item.list_section==='recent').length,5);assert.ok(listed.items.every(item=>item.word_progress===null&&item.word_progress_deferred===true&&item.word_progress_unavailable===false));checks.push('normal_HTTP_list_25_pending_5_recent_all_deferred_not_failed');
 await page.goto(base,{waitUntil:'networkidle'});await waitFor(async()=>await page.locator('article').count()===30,'Actual Home did not render all 30 synthetic cards');
 const processing=articles.slice(0,7);for(const article of processing){await panel(article).locator('li').nth(5).waitFor({state:'attached'});assert.equal(perCardCalls(article).length,1,'processing needs exactly one automatic normal GET after list defer');}
 assert.equal(requests.filter(request=>progressUrl(request.url)).length,7,'nonprocessing cards must stay lazy on initial load');assert.ok(maxReads<=2,'actual browser per-card HTTP read concurrency exceeds two');assert.equal(maxReads,2,'the seven-card queue exercises both read slots');
 for(const article of articles.slice(7)){assert.equal(await panel(article).locator('li').count(),0);assert.equal(perCardCalls(article).length,0);}
 assert.equal(await page.locator('.publish-work .article-card').count(),25);assert.equal(await page.locator('.publish-history .article-card').count(),5);assert.match(await page.locator('.publish-work').innerText(),/25 篇待处理/);checks.push('hydrated_actual_Home_initial_seven_GETs_only','actual_HTTP_max_two_concurrent_reads','work_recent_separation_25_plus_5');
 for(const article of processing){await openPanel(article);await assertStages(article);}
 checks.push('actual_DOM_exact_six_stages','five_persisted_synthetic_candidate_counts','two_legacy_records_no_historical_counts_or_attempt_clock');
 for(const article of [articles[7],articles[16]]){const before=requests.filter(request=>progressUrl(request.url)).length;await openPanel(article);await assertStages(article);assert.equal(perCardCalls(article).length,1);assert.equal(requests.filter(request=>progressUrl(request.url)).length,before+1,'one expanded nonprocessing work card reads only itself');}
 await page.locator('.publish-history>summary').click();const recent=articles[25];await openPanel(recent);await assertStages(recent);assert.equal(perCardCalls(recent).length,1);assert.ok(articles.slice(26).every(article=>perCardCalls(article).length===0));checks.push('queued_failed_and_recent_details_normal_GET_lazy','other_recent_cards_remain_unread');
 await screenshot('desktop-read-chain');await card(processing[0]).screenshot({path:path.join(evidence,'desktop-first-progress-card.png')});await page.setViewportSize({width:390,height:844});await screenshot('mobile-read-chain');await card(processing[0]).screenshot({path:path.join(evidence,'mobile-first-progress-card.png')});checks.push('desktop_mobile_actual_screenshots_no_horizontal_overflow');
 offline=true;await context.setOffline(true);const active=panel(processing[0]);await active.getByText('网页网络已断开',{exact:false}).waitFor();assert.match(await active.innerText(),/后台执行情况未确认/);assert.match(await active.innerText(),/已找到候选 3 张/);assert.doesNotMatch(await active.innerText(),/执行者已结束|后台停止/);const time=await active.locator('.word-stage-time').innerText();await delay(1200);assert.equal(await active.locator('.word-stage-time').innerText(),time,'offline shows the recorded timer, never elapsed-time progress');await screenshot('mobile-offline');checks.push('offline_is_not_executor_end','offline_keeps_existing_counts_and_historical_clock');
 await context.setOffline(false);offline=false;await panel(processing[0]).getByText('网页网络已断开',{exact:false}).waitFor({state:'hidden'});await page.waitForLoadState('networkidle');await waitFor(()=>activeReads.size===0,'Online cached reads did not settle before explicit refresh');await page.reload({waitUntil:'networkidle'});for(const article of processing){await openPanel(article);await assertStages(article);}assert.equal(apiWrites,0,'page load/refresh/offline/detail reads must not claim, grant, submit, pause or restart');checks.push('refresh_recovers_same_persisted_progress_without_business_POSTs');
 await page.setViewportSize({width:1440,height:1080});await screenshot('desktop-refreshed');assert.ok(maxReads<=2,'refresh retains the actual two-read bound');
 for(const article of articles){if(article.claim)assert.ok(!(await page.locator('main').innerText()).includes(article.claim),'synthetic claim is not rendered');}
 assert.equal(pageErrors.length,0,pageErrors.join('\n'));assert.equal(consoleErrors.filter(entry=>!entry.message.includes('net::ERR_INTERNET_DISCONNECTED')).length,0,'Unexpected actual Chromium console errors');assert.ok(statuses.every(entry=>entry.status===200),'Normal real HTTP GET returned an unexpected status');assert.equal(databaseSnapshot(),dbBefore,'read-only browser chain must not change any application D1 table');checks.push('all_application_D1_tables_identical_before_after','zero_API_business_writes','zero_page_errors_unexpected_console_errors');
 assert.deepEqual(sourceHash(),sourceBefore,'Runtime source changed during actual browser QA');assert.deepEqual(buildHashes(),buildBefore,'Built assets changed during actual browser QA');verifyCapture();
 result={status:'PASS',synthetic_only:true,actual_built_worker:true,actual_isolated_local_d1:true,actual_chromium_dom:true,normal_HTTP_list_and_per_card_GET:true,route_mocks:false,production_tested:false,real_image_research_tested:false,real_word_created:false,desktop_save_tested:false,api_claims_or_execution_grants:0,api_business_writes:apiWrites,fixture:{pending:25,recent:5,processing:7,queued:9,failed:9,persisted_count_records:5,processing_legacy_without_events:2,seed_method:'direct isolated synthetic D1 fixture; no API claims/grants'},max_concurrent_word_GETs:maxReads,checks,page_errors:pageErrors,console_errors:consoleErrors,baseline:capture.baseline||capture.baseline_commit,build_source_capture_at:capture.captured_at,build_source_capture_sha256:sha(fs.readFileSync(captureFile)),worker_bundle_sha256:workerHash,build_artifact_sha256:sha(JSON.stringify(buildBefore)),built_files_sha256:buildBefore,source_sha256:sourceBefore,database_before_after_sha256:dbBefore,viewports:[{width:1440,height:1080},{width:390,height:844}],screenshots:fs.readdirSync(evidence).filter(file=>file.endsWith('.png'))};
}finally{
 if(context)await context.close();if(browser)await browser.close();
 if(server&&server.exitCode===null&&server.signalCode===null){try{process.kill(-server.pid,'SIGTERM');}catch{}await Promise.race([new Promise(resolve=>server.once('exit',resolve)),delay(5000)]);if(server.exitCode===null&&server.signalCode===null){try{process.kill(-server.pid,'SIGKILL');}catch{}await Promise.race([new Promise(resolve=>server.once('exit',resolve)),delay(5000)]);}}
 if(server)assert.ok(server.exitCode!==null||server.signalCode!==null,'Owned local Worker must exit before teardown is claimed');fs.rmSync(scratch,{recursive:true,force:true});
 if(result){result.owned_server_teardown='owned child exited and isolated scratch removed';fs.writeFileSync(path.join(evidence,'browser-result.json'),JSON.stringify(result,null,2)+'\n');console.log('PASS actual built-local Chromium/D1 normal read chain: 25 pending + 5 recent, seven processing fallback GETs at max two, lazy other cards, real six-stage DOM and legacy counts, offline/refresh, no D1/API writes, desktop/mobile overflow and console. Synthetic local browser QA; no production or real Word/desktop-save acceptance.');}
}
