// Synthetic UI QA only. ALL /api/* requests fulfilled/aborted locally.
// All non-loopback HTTP and WebSocket requests are rejected. No API reaches a backend.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright-core';
const origin='http://127.0.0.1:5173';
const folder='/tmp/haoduoyu-browser-qa';fs.mkdirSync(folder,{recursive:true});
const owner='a'.repeat(64),otherOwner='b'.repeat(64),aid='11111111-1111-4111-8111-111111111111';
const stamp=new Date().toISOString();
const log=[],results=[],pageErrors=[],consoleErrors=[],blocked=[],unexpected=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--disable-background-networking','--disable-component-update','--no-first-run']});
let context;
const fulfill=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
const account=(id,name,url)=>({id,name,url,created:stamp});
const oldAccount=account(aid,'合成电影账号甲','https://example.invalid/synthetic/movie-a');
const newAccount=account('22222222-2222-4222-8222-222222222222','合成电影账号乙','https://example.invalid/synthetic/movie-b');
const draft=()=>({account_id:'synthetic',draft_id:null,draft_url:null,status:'not_requested',last_verified_at:null,current_existence_rechecked:false});
const timings=[
 ['合成上传原稿计时',{elapsed_seconds:65,basis:'source_upload_to_verified_drafts',request_to_completion_seconds:3600},'1分5秒（上传原稿至草稿验收）'],
 ['合成执行者计时',{elapsed_seconds:130,basis:'executor_report',request_to_completion_seconds:999},'2分10秒（执行者记录）'],
 ['合成写作计时',{writing_to_completion_seconds:185,request_to_completion_seconds:500},'3分5秒（写作至完成）'],
 ['合成请求计时',{request_to_completion_seconds:245},'4分5秒（请求至完成，含等待）'],
 ['合成计划计时',{scheduled_to_completion_seconds:305},'5分5秒（计划至完成，含等待）'],
 ['合成范围计时',{writing_to_completion_seconds_range:[181,359]},'3–6分钟（写作至完成）'],
 ['合成缺失计时',{},'未记录'],
];
const historyItems=timings.map(([title,timing],i)=>({history_key:`synthetic-${i}`,website_article_id:null,mode:i%2?'manual_article':'website_full_auto',title,topic_label:'合成电影',completed_at:stamp,completed_at_precision:'second',status:'word_delivered',word:{sha256:'c'.repeat(64),image_count:0,size_bytes:1},platforms:{toutiao:draft(),zhihu:draft()},timing,evidence:{level:'site_receipt'},public_publication:{status:'not_observed',published_at:null,published_url:null,metrics_24h:null},observations:[]}));
const historyView=()=>({owner_scope:owner,items:historyItems,total:7,next_offset:null,summary:{processed:7,private_drafts:0,full_auto:4,semi_auto:3},notice:'本页是合成测试数据；私人草稿不等于公开发布。'});
const workspace=()=>({owner_scope:owner,items:[],total:0,offset:0,limit:100,next_offset:null,truncated:false,notice:'合成空恢复列表。'});
const article=()=>({id:aid,title:'合成通知防重文章',state:'uploaded',created:stamp,generated:false,has_result:false,output_mode:null,notification_state:null,list_section:'work',recovery:{unfinished:false,can_notify:true,can_retry:false,lease_expires:null}});
let state;
function resetState(){state={discovery:{owner_scope:owner,accounts:[oldAccount],scan:null},discoveryAuth:false,writeFlavor:'normal',holdWrite:null,releaseWrite:null,writeStarted:false,posts:[],home:{owner_scope:owner,items:[article()],connected:true,pending_total:1,next_offset:null},homeAuth:false,submitFlavor:'abort',submits:0,historyFlavor:'normal',holdHistory:null,releaseHistory:null,historyStarted:false,historyReads:0,dedaoAuth:false,dedaoReady:false,dedaoTask:null};}
resetState();
async function installRoutes(ctx){
 await ctx.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(!['127.0.0.1','localhost','::1','[::1]'].includes(url.hostname)){blocked.push({url:req.url(),type:req.resourceType()});await route.abort('blockedbyclient');return;}
  if(!url.pathname.startsWith('/api/')){await route.continue();return;}
  log.push({at:new Date().toISOString(),path:url.pathname+url.search,method:req.method(),synthetic:true});
  try{
   if(url.pathname==='/api/imitation/discovery'){
    if(state.discoveryAuth)return fulfill(route,{error:'synthetic unauthenticated'},401);
    if(req.method()==='GET')return fulfill(route,state.discovery);
    const body=req.postDataJSON();state.posts.push(body);state.writeStarted=true;
    const view=structuredClone(state.discovery),flavor=state.writeFlavor;
    if(body.action==='add'){
     const exists=view.accounts.some(a=>a.url===body.url),changed=!exists;
     if(changed)view.accounts.push(account(newAccount.id,body.name,body.url));
     if(flavor!=='legacy')view.account_change={action:'add',changed};
    }else if(body.action==='remove'){
     const changed=flavor==='already_absent'?false:view.accounts.some(a=>a.id===body.id);
     view.accounts=view.accounts.filter(a=>a.id!==body.id);
     if(flavor!=='legacy')view.account_change={action:'remove',changed};
    }else if(body.action==='refresh')view.scan={id:aid,request_key:body.request_key,state:'completed',created:stamp,pool_changed:false,result:{status:'completed',articles:[],observations:[]}};
    else {unexpected.push({path:url.pathname,method:req.method()});return fulfill(route,{error:'unsupported synthetic action'},400);}
    if(flavor==='held'){
     state.holdWrite=new Promise(resolve=>{state.releaseWrite=resolve;});
     await state.holdWrite;return fulfill(route,view);
    }
    state.discovery=view;return fulfill(route,view);
   }
   if(url.pathname==='/api/articles'){
    if(req.method()!=='GET'){unexpected.push({path:url.pathname,method:req.method()});return fulfill(route,{error:'synthetic unexpected upload denied'},403);}
    return state.homeAuth?fulfill(route,{error:'synthetic unauthenticated'},401):fulfill(route,state.home);
   }
   if(url.pathname===`/api/articles/${aid}/submit`){
    assert.equal(req.method(),'POST');state.submits++;
    if(state.submitFlavor==='abort')return route.abort('failed');
    if(state.submitFlavor==='malformed_success')return fulfill(route,{});
    if(state.submitFlavor==='auth')return fulfill(route,{error:'synthetic unauthenticated'},401);
    return fulfill(route,{id:aid,state:'queued',notification:{state:'unknown'}});
   }
   if(url.pathname===`/api/articles/${aid}/word-progress`)return fulfill(route,{article_id:aid,output_mode:null,word_progress:null,word_progress_unavailable:false});
   if(url.pathname==='/api/article-data'){
    if(req.method()!=='GET'){unexpected.push({path:url.pathname,method:req.method()});return fulfill(route,{error:'synthetic write denied'},403);}
    state.historyReads++;state.historyStarted=true;
    if(state.historyFlavor==='held'){
     state.holdHistory=new Promise(resolve=>{state.releaseHistory=resolve;});await state.holdHistory;
    }
    if(state.historyFlavor==='auth')return fulfill(route,{error:'synthetic unauthenticated'},401);
    if(state.historyFlavor==='failure')return fulfill(route,{error:'synthetic failure'},503);
    return fulfill(route,historyView());
   }
   if(url.pathname==='/api/articles/workspace'){
    if(req.method()!=='GET'){unexpected.push({path:url.pathname,method:req.method()});return fulfill(route,{error:'synthetic workspace mutation denied'},403);}
    return fulfill(route,workspace());
   }
   if(url.pathname==='/api/dedao/cloud'){
    if(req.method()!=='GET'){unexpected.push({path:url.pathname,method:req.method()});return fulfill(route,{error:'synthetic writing denied'},403);}
    return state.dedaoAuth?fulfill(route,{error:'synthetic unauthenticated'},401):fulfill(route,{owner_scope:owner,connection:{ready:state.dedaoReady,notice:'合成环境：未启用真实云端写作连接。'},task:state.dedaoTask,instructions:{conversation_url:'https://example.invalid/synthetic/no-platform',stages:['合成写作','合成私人草稿']}});
   }
   if(url.pathname==='/api/topics/research')return fulfill(route,{owner_scope:owner,current:null,connected:false});
   if(url.pathname==='/api/topics'){
    if(url.searchParams.get('view')==='history')return fulfill(route,{version:'haoduoyu-topic-history-1',history:{status:'ok',scope:'synthetic',count:0,oldest_created:null,checked_at:stamp,window_days:14,window_complete:true,unselected_current_runs:0,unfinished_topic_runs:0,notice:'合成近期对照'},entries:[]});
    const p=url.searchParams.get('platform');return fulfill(route,{version:'haoduoyu-topic-board-1',platform:{platform:p,label:p==='toutiao'?'今日头条':'微博',provider:'synthetic',status:'empty',fetched_at:stamp,attempted_at:stamp,upstream_updated_at:null,cache_hit:false,item_count:0,error:null,provider_attempts:[],source_count:0,returned_count:0,invalid_count:0,truncated:false,next_refresh_at:null},rows:[],candidates:[],checked_at:stamp});
   }
   unexpected.push({path:url.pathname,method:req.method()});return fulfill(route,{error:'unknown synthetic endpoint denied'},404);
  }catch(e){unexpected.push({path:url.pathname,message:e.message});try{await route.abort('failed');}catch{}}
 });
 await ctx.routeWebSocket('**/*',ws=>{const url=new URL(ws.url());if(['127.0.0.1','localhost','::1','[::1]'].includes(url.hostname))ws.connectToServer();else{blocked.push({url:ws.url(),type:'websocket'});ws.close();}});
}
async function newContext(){if(context)await context.close();context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});await installRoutes(context);const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});return page;}
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log(`PASS ${name}`);}catch(e){results.push({name,status:'FAIL',message:e.message});console.log(`FAIL ${name}: ${e.message}`);throw e;}}
async function poll(test,label){for(let i=0;i<100;i++){if(await test())return;await sleep(50);}throw new Error('timed out '+label);}
async function shot(page,name){await page.screenshot({path:`${folder}/${name}.png`,fullPage:true});}
async function noOverflow(page,name){const m=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth}));assert.ok(m.scrollWidth<=m.innerWidth&&m.bodyWidth<=m.innerWidth,`${name} overflow: ${JSON.stringify(m)}`);return m;}
let page;
try{
 page=await newContext();
 await check('loopback app rendered with synthetic discovery',async()=>{await page.goto(origin+'/imitation');await page.getByRole('link',{name:oldAccount.name,exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'写作台',exact:true}).count(),0);});
 await check('add new account + double click issues one synthetic POST',async()=>{await page.getByRole('button',{name:'添加账号',exact:true}).click();await page.getByLabel('账号名称').fill(newAccount.name);await page.getByLabel('公开主页链接').fill(newAccount.url);await page.getByRole('button',{name:'保存账号',exact:true}).dblclick();await page.getByText('账号已保存。',{exact:true}).waitFor();assert.equal(state.posts.length,1);assert.equal(await page.getByRole('link',{name:newAccount.name,exact:true}).count(),1);});
 await check('duplicate add gives explicit unchanged feedback',async()=>{await page.getByRole('button',{name:'添加账号',exact:true}).click();await page.getByLabel('账号名称').fill(newAccount.name);await page.getByLabel('公开主页链接').fill(newAccount.url);await page.getByRole('button',{name:'保存账号',exact:true}).click();await page.getByText('该账号已在列表中，未重复添加。',{exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:newAccount.name,exact:true}).count(),1);});
 await check('remove success gives changed feedback',async()=>{await page.getByRole('button',{name:'移除账号：'+newAccount.name,exact:true}).click();await page.getByText('账号已移除。',{exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:newAccount.name,exact:true}).count(),0);});
 await check('remove already absent gives unchanged feedback',async()=>{state.writeFlavor='already_absent';await page.getByRole('button',{name:'移除账号：'+oldAccount.name,exact:true}).click();await page.getByText('该账号已不在列表中。',{exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:oldAccount.name,exact:true}).count(),0);});
 await check('legacy response does not falsely claim changed result',async()=>{state.writeFlavor='legacy';await page.getByRole('button',{name:'添加账号',exact:true}).click();await page.getByLabel('账号名称').fill(oldAccount.name);await page.getByLabel('公开主页链接').fill(oldAccount.url);await page.getByRole('button',{name:'保存账号',exact:true}).click();await page.getByText('账号池已确认。',{exact:true}).waitFor();});
 await shot(page,'imitation-desktop');await check('imitation desktop and mobile no horizontal overflow',async()=>{await noOverflow(page,'desktop imitation');await page.setViewportSize({width:390,height:844});await noOverflow(page,'mobile imitation');await shot(page,'imitation-mobile');});
 await check('old POST after foreground identity change stays fenced',async()=>{await page.setViewportSize({width:1440,height:1000});state.writeFlavor='held';state.writeStarted=false;await page.getByRole('button',{name:'添加账号',exact:true}).click();await page.getByLabel('账号名称').fill('合成旧身份写入');await page.getByLabel('公开主页链接').fill('https://example.invalid/synthetic/stale');await page.getByRole('button',{name:'保存账号',exact:true}).click();await poll(()=>state.releaseWrite,'held account write');state.discovery={owner_scope:otherOwner,accounts:[newAccount],scan:null};await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('link',{name:newAccount.name,exact:true}).waitFor();state.releaseWrite();await page.getByRole('button',{name:'添加账号',exact:true}).waitFor();await sleep(150);assert.equal(await page.getByRole('link',{name:'合成旧身份写入',exact:true}).count(),0);assert.equal(await page.getByRole('link',{name:oldAccount.name,exact:true}).count(),0);});
 await check('imitation 401 clears private account view',async()=>{state.discoveryAuth=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByText(/请重新使用本人ChatGPT账号登录/).waitFor();assert.equal(await page.locator('.imitation-accounts li').count(),0);assert.equal(await page.locator('.imitation-add input').count(),0);});
 resetState();page=await newContext();
 await check('home synthetic initial notification enabled',async()=>{await page.goto(origin+'/');await page.getByRole('button',{name:'求助小鱼',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'求助小鱼',exact:true}).isEnabled(),true);});
 await check('unknown submit abort fences current session',async()=>{await page.getByRole('button',{name:'求助小鱼',exact:true}).dblclick();await page.getByText('本次提交回执尚未核对；请刷新读取同一任务，暂不重复求助。',{exact:true}).waitFor();assert.equal(state.submits,1);assert.equal(await page.getByRole('button',{name:'求助小鱼',exact:true}).isDisabled(),true);const v=await page.evaluate(owner=>sessionStorage.getItem('haoduoyu-unconfirmed-article-submit-v1:'+owner),owner);assert.deepEqual(JSON.parse(v),[{id:aid,refused:false}]);});
 await check('reload retains unknown submit fence even uploaded projection',async()=>{await page.reload();await page.getByRole('button',{name:'求助小鱼',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'求助小鱼',exact:true}).isDisabled(),true);assert.equal(state.submits,1);});
 await check('first restored GET cannot release explicit retry projection',async()=>{state.home.items=[{...article(),notification_state:'unknown',recovery:{unfinished:true,can_notify:true,can_retry:true,lease_expires:null}}];await page.reload();await page.getByRole('button',{name:'重试求助',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'重试求助',exact:true}).isDisabled(),true);assert.equal(state.submits,1);});
 await shot(page,'publish-notification-fenced-desktop');
 await check('later exact recovery GET releases retry fence',async()=>{await page.getByRole('button',{name:'刷新',exact:true}).click();await poll(()=>page.getByRole('button',{name:'重试求助',exact:true}).isEnabled(),'explicit retry released');assert.equal(state.submits,1);assert.equal(await page.evaluate(owner=>sessionStorage.getItem('haoduoyu-unconfirmed-article-submit-v1:'+owner),owner),null);});
 await check('home only exact current card and mobile no overflow',async()=>{assert.equal(await page.locator('article').filter({hasText:'合成通知防重文章'}).count(),1);await noOverflow(page,'desktop home');await page.setViewportSize({width:390,height:844});await noOverflow(page,'mobile home');await shot(page,'publish-mobile');});
 await check('home 401 clears articles and disables upload',async()=>{state.homeAuth=true;await page.getByRole('button',{name:'刷新',exact:true}).click();await page.getByText('请使用本人 ChatGPT 账号登录',{exact:true}).waitFor();assert.equal(await page.getByText('合成通知防重文章',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'上传文章',exact:true}).isDisabled(),true);});
 resetState();page=await newContext();
 await check('article data initial loading feedback',async()=>{state.historyFlavor='held';await page.goto(origin+'/article-data');await page.getByText('正在读取文章历史…',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'读取中…',exact:true}).isDisabled(),true);await poll(()=>state.releaseHistory,'held history read');state.historyFlavor='normal';state.releaseHistory();await page.getByRole('table').waitFor();});
 await check('actual duration source labels and missing value',async()=>{assert.equal(await page.locator('.history-table tbody tr').count(),7);for(const [title,,expected] of timings){const row=page.locator('.history-table tbody tr').filter({hasText:title});assert.equal(await row.locator('td[data-label="耗时"]').innerText(),expected);}assert.equal(await page.getByText('24小时数据未采集',{exact:true}).count(),7);assert.equal(await page.getByRole('link',{name:'打开私人草稿',exact:true}).count(),0);});
 await check('article data refresh loading preserves rows, failure explicit',async()=>{state.historyFlavor='held';state.releaseHistory=null;await page.getByRole('button',{name:'刷新数据',exact:true}).click();await page.getByRole('button',{name:'读取中…',exact:true}).waitFor();assert.equal(await page.locator('.history-table tbody tr').count(),7);await poll(()=>state.releaseHistory,'held history refresh');state.historyFlavor='failure';state.releaseHistory();await page.getByText(/历史统计读取失败，请重试/).waitFor();assert.equal(await page.locator('.history-table tbody tr').count(),7);state.historyFlavor='normal';await page.getByRole('button',{name:'刷新数据',exact:true}).click();await poll(()=>page.getByRole('alert').count().then(n=>n===0),'history recovered');});
 await shot(page,'article-data-desktop');await check('article data mobile no overflow',async()=>{await noOverflow(page,'desktop history');await page.setViewportSize({width:390,height:844});await noOverflow(page,'mobile history');await shot(page,'article-data-mobile');});
 await check('article data 401 clears history and recovery inventory',async()=>{state.historyFlavor='auth';await page.getByRole('button',{name:'刷新数据',exact:true}).click();await page.getByText('请使用本人账号登录',{exact:false}).first().waitFor();assert.equal(await page.locator('.history-table tbody tr').count(),0);assert.equal(await page.locator('.history-summary').count(),0);assert.equal(await page.locator('.history-restore').count(),0);});
 resetState();page=await newContext();
 await check('dedao single write action, blocked real connection',async()=>{await page.goto(origin+'/dedao');await page.getByText('合成环境：未启用真实云端写作连接。',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'一键成文',exact:true}).count(),1);assert.equal(await page.getByRole('button').count(),1);assert.equal(await page.getByRole('button',{name:'一键成文',exact:true}).isDisabled(),true);assert.equal(await page.locator('input[type=number]').count(),0);assert.equal(await page.getByRole('link',{name:'写作台',exact:true}).count(),0);await noOverflow(page,'desktop dedao');await shot(page,'dedao-desktop');await page.setViewportSize({width:390,height:844});await noOverflow(page,'mobile dedao');await shot(page,'dedao-mobile');});
 await check('dedao 401 clears task and identity',async()=>{state.dedaoTask={id:aid,request_key:aid,state:'processing',article_id:aid,updated:stamp,dispatch_state:'accepted',private_drafts_complete:false,writer_ended:false,downstream_status:'unavailable'};await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByText('平台处理状态暂未读取',{exact:true}).waitFor();state.dedaoAuth=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByText('请使用本人账号登录',{exact:false}).first().waitFor();assert.equal(await page.locator('.dedao-batch').count(),0);assert.equal(await page.getByRole('button',{name:'一键成文',exact:true}).isDisabled(),true);});
 resetState();page=await newContext();
 await check('topics loopback synthetic board, five navigation tabs and overflow',async()=>{await page.goto(origin+'/topics');await page.getByText('本次可用文娱线索 0 条，未满 5 条；不使用旧缓存、无关热点或私生活传闻补位。',{exact:true}).waitFor();assert.equal(await page.getByRole('navigation',{name:'主要页面'}).getByRole('link').count(),5);assert.equal(await page.getByRole('link',{name:'写作台',exact:true}).count(),0);await noOverflow(page,'desktop topics');await shot(page,'topics-desktop');await page.setViewportSize({width:390,height:844});await noOverflow(page,'mobile topics');await shot(page,'topics-mobile');});
 await check('removed writing route redirects to article data',async()=>{await page.goto(origin+'/writing');await page.waitForURL(origin+'/article-data');await page.getByRole('table').waitFor();});
 await check('all business requests synthetic, no external requests or page exceptions',async()=>{assert.deepEqual(unexpected,[]);assert.deepEqual(pageErrors,[]);assert.deepEqual(blocked,[]);assert.ok(log.length>30);});
}catch(e){if(page)await shot(page,'failure').catch(()=>{});process.exitCode=1;}
finally{
 if(state?.releaseWrite)state.releaseWrite();if(state?.releaseHistory)state.releaseHistory();
 await context?.close();await browser.close();
 const summary={status:results.some(r=>r.status==='FAIL')?'FAIL':'PASS',scope:'Local Chromium UI + fully synthetic intercepted business APIs. Not production acceptance. No real API mutation, article upload, dispatch, platform access or existing evidence overwrite.',desktop:{width:1440,height:1000},mobile:{width:390,height:844},results,synthetic_api_requests:log.length,pageErrors,consoleErrors,blockedNonLoopback:blocked,unexpectedApi:unexpected};
 fs.writeFileSync(folder+'/summary.json',JSON.stringify(summary,null,2));fs.writeFileSync(folder+'/requests.json',JSON.stringify(log,null,2));console.log(JSON.stringify({status:summary.status,checks:results.length,synthetic_api_requests:log.length,folder}));
}
