// Actual local app and Chromium with explicit deterministic API responses for
// publication UI/owner races. This is frontend QA, NOT production connectivity
// or a platform-state observation. No private ledger or real user screenshots.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const origin=process.env.PUBLICATION_PREVIEW_ORIGIN||'http://127.0.0.1:5184';
const folder=process.env.PUBLICATION_QA_DIR||'/tmp';fs.mkdirSync(folder,{recursive:true});
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'loopback preview only');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));let phase='metrics',platformVisits=0,unexpectedApis=0;
await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin){platformVisits++;return route.abort();}if(u.pathname.startsWith('/api/')){unexpectedApis++;return route.abort();}return route.continue();});
const make=(title,observations=[])=>({history_key:title,title,topic_label:title,mode:'manual_word_only',completed_at:'2026-10-13T12:00:00Z',completed_at_precision:'second',status:'word_delivered',platforms:{toutiao:{draft_url:null,status:'not_requested'},zhihu:{draft_url:null,status:'not_requested'}},observations});
const observed='2026-10-13T18:26:47.418Z',base={platform:'toutiao',published_at:null,published_url:'https://www.toutiao.com/article/1234567890123456789/',observed_at:observed,platform_data_through:null,exposures:null,reads:null,comments:null,likes:null,unavailable_reason:null};
const scheduled={...base,publication:{status:'scheduled',status_text:'定时发布中',time_sources:[]},snapshot:{state:'scheduled',due_at:null,label:'定时发布中 · 尚未公开发布',public_verified:false}};
const conflict={...base,exposures:6258,reads:26,comments:0,likes:0,publication:{status:'published',status_text:'已发布 已推送',time_sources:[{source:'creator_work_management',raw_text:'10-12 23:46',timezone:null},{source:'article_page',raw_text:'2026-10-13 14:46',timezone:null}]},snapshot:{state:'time_conflict',due_at:null,label:'已发布 · 时间来源冲突，暂不计算24小时',public_verified:true}};
const summary={processed:5,full_auto:0,semi_auto:5,private_drafts:0};
await page.route('**/api/article-data?*',route=>{const offset=new URL(route.request().url()).searchParams.get('offset');let owner='A',items=[make('OFFLINE owner A record')],next=25;if(phase==='metrics'){items=[...Array.from({length:4},(_,i)=>make('OFFLINE 定时示例 '+(i+1),[scheduled])),make('OFFLINE 时间冲突示例',[conflict])];next=null;}if(phase==='switch'&&offset==='25'){owner='B';items=[make('OFFLINE owner B record')];next=null;}if(phase==='recovered'){owner='B';items=[make('OFFLINE owner B record')];next=null;}return route.fulfill({json:{owner_scope:owner,items,next_offset:next,total:next===null?items.length:26,summary,notice:'OFFLINE frontend fixture'}});});
await page.route('**/api/articles/workspace?*',route=>{assert.equal(route.request().method(),'GET','publication QA must not mutate workspace');const params=new URL(route.request().url()).searchParams;return route.fulfill({json:{owner_scope:['switch','recovered'].includes(phase)?'B':'A',items:[],total:0,offset:Number(params.get('offset')||0),limit:Number(params.get('limit')||100),next_offset:null,truncated:false,notice:'OFFLINE'}});});
try{
 await page.goto(origin+'/article-data');await page.getByRole('table').waitFor();
 assert.equal(await page.getByRole('link',{name:'头条定时预览页面',exact:true}).count(),4);
 assert.equal(await page.getByRole('link',{name:'头条公开文章',exact:true}).count(),1);
 const conflictRow=page.locator('tr').filter({hasText:'OFFLINE 时间冲突示例'});assert.match(await conflictRow.innerText(),/当时累计：展现 6258 \/ 阅读 26/);assert.match(await conflictRow.innerText(),/时间来源冲突/);assert.match(await conflictRow.innerText(),/时区未核验/);assert.doesNotMatch(await conflictRow.innerText(),/24小时区间：/);
 await conflictRow.screenshot({path:path.join(folder,'haoduoyu-publication-desktop-fixture.png')});
 await page.setViewportSize({width:390,height:844});await conflictRow.screenshot({path:path.join(folder,'haoduoyu-publication-mobile-fixture.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 phase='initial';await page.reload();await page.getByText('OFFLINE owner A record',{exact:true}).waitFor();phase='switch';await page.getByRole('button',{name:'加载更多历史'}).click();await page.getByRole('alert').filter({hasText:'登录账号已变化'}).waitFor();assert.equal(await page.getByRole('table').count(),0);assert.equal(await page.getByText('OFFLINE owner A record',{exact:true}).count(),0);assert.equal(await page.getByText('OFFLINE owner B record',{exact:true}).count(),0);
 phase='recovered';await page.getByRole('button',{name:'刷新数据',exact:true}).click();await page.getByText('OFFLINE owner B record',{exact:true}).waitFor();assert.equal(await page.getByText('OFFLINE owner A record',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);assert.equal(platformVisits,0);assert.equal(unexpectedApis,0);
 console.log('PASS actual Chromium/app frontend with controlled API fixtures: four scheduled previews vs one explicit published/time-conflict cumulative; desktop/mobile; owner switch between pages clears whole view then fresh owner-B reload. No production/backend/platform writes or real user screenshots.');
}finally{await context.close();await browser.close();}
