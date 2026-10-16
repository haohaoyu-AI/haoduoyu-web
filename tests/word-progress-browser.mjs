// Actual built local Worker + D1 and Chromium. No route mocks or production URL.
// The private fixture is generated outside the deliverable and never logged.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');
const base='http://127.0.0.1:8787',fixture=JSON.parse(fs.readFileSync(process.argv[2]||'/workspace/scratch/visual-private-fixture.json','utf8'));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),context=await browser.newContext({viewport:{width:1440,height:1080},extraHTTPHeaders:{'oai-authenticated-user-id':fixture.owner}});
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));let writes=0;context.on('request',r=>{if(r.method()==='POST')writes++;});
fs.mkdirSync('evidence/word-progress',{recursive:true});
async function call(name,args){const response=await context.request.post(base+'/mcp',{headers:{origin:base},data:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}}});assert.equal(response.status(),200);const payload=await response.json();assert.equal(payload.result?.isError,undefined,JSON.stringify(payload));return payload.result.structuredContent||JSON.parse(payload.result.content[0].text);}
async function report(stage,state,observation){const read=await call('read_word_progress',{target_kind:'article',target_id:fixture.id});return call('record_word_progress',{target_kind:'article',target_id:fixture.id,claim_token:fixture.token,input_sha256:fixture.input,expected_version:read.word_progress.version,event_id:randomUUID(),stage,state,observation});}
try{
 await report('read_source','completed',{action:'read_frozen_source',reason:'none'});
 await report('collect_images','completed',{action:'search_public_images',reason:'none',candidate_urls:['https://images.example.org/synthetic-one','https://images.example.org/synthetic-two']});
 const imageReport=Array.from({length:18},(_,i)=>({sha256:(i+1).toString(16).padStart(64,'0'),width:1200,height:800,after_paragraph:1}));
 const live=await report('confirm_images','running',{action:'check_pixels',reason:'none',inspected_images:imageReport,images_total:22});
 fs.writeFileSync('evidence/word-progress/v1-partial-fixture.json',JSON.stringify(live.word_progress,null,2)+'\n');
 await page.goto(base,{waitUntil:'networkidle'});
 const progress=page.locator('.word-stage-progress').first();await progress.waitFor();await progress.locator('summary').click();
 assert.ok((await progress.innerText()).includes('已确定 18/22 张'));assert.equal(await progress.locator('li').count(),6);
 await page.screenshot({path:'evidence/word-progress/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'evidence/word-progress/mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile horizontal overflow');
 // Root font-size alone does not enlarge this page's fixed-px text; retain that
 // screenshot only as an explicitly labelled prior check, not as zoom evidence.
 await page.evaluate(()=>document.documentElement.style.fontSize='200%');await page.screenshot({path:'evidence/word-progress/mobile-root-font-only.png',fullPage:true});await page.evaluate(()=>document.documentElement.style.fontSize='');
 // Enlarge actual progress text by 200% in-browser without modifying CSS source.
 const enlarged=await progress.evaluate(root=>{const nodes=[root,...root.querySelectorAll('*')];const sizes=nodes.map(node=>parseFloat(getComputedStyle(node).fontSize));nodes.forEach((node,i)=>{node.dataset.visualOriginalFont=node.style.fontSize;node.style.fontSize=(sizes[i]*2)+'px';});return parseFloat(getComputedStyle(root).fontSize);});
 assert.equal(enlarged,28,'progress text must actually double from 14px');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'200% actual progress text overflow');await page.screenshot({path:'evidence/word-progress/mobile-200pct.png',fullPage:true});await progress.evaluate(root=>{for(const node of [root,...root.querySelectorAll('*')]){node.style.fontSize=node.dataset.visualOriginalFont||'';delete node.dataset.visualOriginalFont;}});
 await context.setOffline(true);await page.waitForTimeout(300);assert.ok((await progress.innerText()).includes('网页网络已断开'));assert.ok(!(await progress.innerText()).includes('后台已停止'));await page.screenshot({path:'evidence/word-progress/offline.png',fullPage:true});
 await context.setOffline(false);const before=writes;await page.reload({waitUntil:'networkidle'});assert.ok((await page.locator('.word-stage-progress').first().innerText()).includes('已确定 18/22 张'));assert.equal(writes,before,'reload must not write/claim/dispatch');
 const restored=await call('read_word_progress',{target_kind:'article',target_id:fixture.id});assert.equal(restored.word_progress.version,live.word_progress.version);assert.equal(restored.word_progress.steps[2].counts.completed,18);assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS actual Chromium desktop 1440x1080/mobile 390x844/actual progress text 200% (14px to 28px, not browser zoom)/offline/refresh rendering against built local Worker + real isolated D1; zero route mocks, zero production/desktop access. The separately labelled root-font-only screenshot is not font-enlargement evidence. Synthetic executor observations are fixture data, not real image research or end-to-end production acceptance.');
}finally{await browser.close();}
