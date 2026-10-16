// Actual isolated Chromium button and local receipts; all articles and server
// feedback are synthetic. Never creates a production batch or calls 得到.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {startSiteBatch,runAcceptance} from '../scripts/dedao/acceptance.mjs';
import {readExecution,saveExecution} from '../scripts/dedao/runtime.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']}),folder=await fs.mkdtemp(path.join(os.tmpdir(),'dedao-acceptance-synthetic-'));
try{
 const context=await browser.newContext();let clicked=0,intents=0;
 await context.route('https://haoduoyu.xyz/dedao',r=>r.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><label for="dedao-count">生成篇数</label><input id="dedao-count" type="number"><button aria-label="求助成文">求助成文</button><script>document.querySelector('button').onclick=()=>fetch('/api/dedao',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({total:Number(document.getElementById('dedao-count').value),request_key:sessionStorage.getItem('dedao-start-key')})});</script>`}));
 await context.route('https://haoduoyu.xyz/api/dedao',r=>{clicked++;assert.equal(intents,clicked,'persisted click intent precedes the actual button request');const q=r.request().postDataJSON();assert.ok([1,3].includes(q.total));return r.fulfill({contentType:'application/json',body:JSON.stringify({batch:{id:'SYNTHETIC_BUTTON_'+clicked,...q}})});});
 for(const total of [1,3]){const requestKey=randomUUID(),receipt=await startSiteBatch(context,{total,requestKey,notify:()=>{},beforeClick:async()=>{intents++;}});assert.equal(receipt.request_key,requestKey);assert.equal(receipt.total,total);assert.equal(receipt.started_via,'actual_site_button');}assert.equal(clicked,2);
 const file=path.join(folder,'acceptance-1-3.json');let batch=null,starts=[],paused=false,verified=0;
 const makeBatch=(q)=>{const execution_id='SYNTHETIC_EXEC_'+q.total,items=Array.from({length:q.total},(_,n)=>({ordinal:n+1,title:'SYNTHETIC_TITLE_'+q.total+'_'+n,article_id:'SYNTHETIC_ARTICLE_'+q.total+'_'+n,submitted:true,submitted_handoff_id:'SYNTHETIC_HANDOFF_'+q.total+'_'+n,submitted_at:new Date(20000+n*2000).toISOString(),created:new Date(19000+n*2000).toISOString(),final_ref:'SYNTHETIC_VERSION',download:{sha256:'SYNTHETIC_SHA',filename:'synthetic.docx',path:'/SYNTHETIC/'+q.total+'/'+n+'.docx'}}));return {id:'SYNTHETIC_BATCH_'+q.total,request_key:q.request_key,total:q.total,state:'completed',completed:q.total,current_ordinal:q.total,current:{stage_name:'已提交'},items,execution_id,finished:new Date().toISOString()};};
 const call=async(name,q={})=>{
  if(name==='monitor_state')return {batch:batch?{...batch,state:paused?'paused':batch.state,failure:paused?'SYNTHETIC_LOGIN_PAUSE':null}:null,local_execution:batch?{batch_id:batch.id,execution_id:batch.execution_id,process_exited:true,server_end_acknowledged:true}:null};
  if(name==='acceptance_start'){starts.push(q.total);batch=makeBatch(q);const report=await readExecution(file),p=report.phases.find(p=>p.request_key===q.request_key);p.clicked=true;await saveExecution(file,report);return {batch_id:batch.id,request_key:q.request_key,total:q.total,started_via:'actual_site_button'};}
  if(name==='acceptance_file'){verified++;return {verified:true,sha256:'SYNTHETIC_SHA'};}throw Error('Unexpected synthetic operation');
 };
 paused=true;await assert.rejects(()=>runAcceptance({workDir:folder,call,notify:()=>{}}),/已暂停/);assert.deepEqual(starts,[1]);paused=false;
 const report=await runAcceptance({workDir:folder,call,notify:()=>{}});assert.deepEqual(starts,[1,3]);assert.equal(report.completed,true);assert.equal(verified,4);assert.equal(report.phases.flatMap(p=>p.evidence).length,4);
 await runAcceptance({workDir:folder,call,notify:()=>{}});assert.deepEqual(starts,[1,3],'completed acceptance never generates another four articles');
 const uncertain=path.join(folder,'uncertain');await fs.mkdir(uncertain);await saveExecution(path.join(uncertain,'acceptance-1-3.json'),{kind:'real_site_acceptance_1_then_3',completed:false,phases:[{total:1,request_key:randomUUID(),clicked:true},{total:3,request_key:randomUUID(),clicked:false}]});let uncertainStarts=0;await assert.rejects(()=>runAcceptance({workDir:uncertain,call:async(name)=>{if(name==='acceptance_start')uncertainStarts++;return {batch:null};},notify:()=>{}}),/不明/);assert.equal(uncertainStarts,0);
 console.log('PASS synthetic acceptance: actual Chromium DOM button emits 1/3 requests after durable intent; same-batch pause/restart continues 1 then 3; four independent submissions/files, serial timestamps, terminal record prevents extra generation and uncertain click is never retried. No real article, login, Codex or small-fish activity.');
}finally{await browser.close();await fs.rm(folder,{recursive:true,force:true});}
