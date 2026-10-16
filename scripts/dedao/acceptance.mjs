import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {saveExecution,readExecution} from './runtime.mjs';
export async function startSiteBatch(context,{total,requestKey,siteURL='https://haoduoyu.xyz/dedao',notify=console.log,timeout=15*60*1000,beforeClick=async()=>{}}){
 if(![1,3].includes(total)||!/^[0-9a-f-]{36}$/.test(requestKey))throw Error('验收只允许已授权的 1 篇和 3 篇');
 const target=new URL(siteURL);if(target.protocol!=='https:'||!['haoduoyu.xyz','xiaoyu-event-test.haohaoyu202409.chatgpt.site'].includes(target.hostname)||target.pathname!=='/dedao')throw Error('验收网站地址无效');
 const p=await context.newPage();await p.goto(target.href,{waitUntil:'domcontentloaded'});notify('正在打开真实“得到大脑”页面。若网站要求登录，请用本人账号完成登录；程序会等待按钮可用。');
 await p.waitForFunction(()=>{const n=document.getElementById('dedao-count'),b=document.querySelector('button[aria-label="求助成文"]');return n&&!n.disabled&&b&&!b.disabled;},{},{timeout});
 await p.evaluate(key=>sessionStorage.setItem('dedao-start-key',key),requestKey);await p.getByLabel('生成篇数').fill(String(total));
 await beforeClick();const [r]=await Promise.all([p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/dedao',{timeout:60000}),p.getByRole('button',{name:'求助成文',exact:true}).click()]);const v=await r.json();
 if(!r.ok()||v.batch?.request_key!==requestKey||v.batch?.total!==total)throw Error('真实按钮启动结果尚未确认；保留启动键，先查询同一批次');return {batch_id:v.batch.id,request_key:v.batch.request_key,total:v.batch.total,started_via:'actual_site_button',observed_at:new Date().toISOString()};
}
export async function runAcceptance({workDir,call,notify=console.log}){
 const file=path.join(workDir,'acceptance-1-3.json');let report=await readExecution(file);
 if(!report){report={kind:'real_site_acceptance_1_then_3',created:new Date().toISOString(),completed:false,phases:[1,3].map(total=>({total,request_key:randomUUID(),batch_id:null,clicked:false,completed:false}))};await saveExecution(file,report);}
 if(report.kind!=='real_site_acceptance_1_then_3'||report.phases.map(p=>p.total).join(',')!=='1,3')throw Error('验收记录格式不匹配，不覆盖原记录');
 if(report.completed){notify('这次 1 篇再 3 篇验收已完成，保留原结果，不会再次生成。');return report;}
 for(const phase of report.phases){
  if(phase.completed)continue;let current=await call('monitor_state',phase.batch_id?{batch_id:phase.batch_id}:{});
  if(!phase.batch_id&&current.batch?.request_key===phase.request_key){phase.batch_id=current.batch.id;await saveExecution(file,report);}
  if(!phase.batch_id){
   if(phase.clicked)throw Error('前次真实按钮启动结果不明，请先核查同一启动键；程序不会盲目重按');
   if(current.batch&&current.batch.state!=='completed')throw Error('网站还有其他活动批次，先处理或恢复原批次，不能另建验收');
   const started=await call('acceptance_start',{total:phase.total,request_key:phase.request_key});phase.clicked=true;phase.batch_id=started.batch_id;phase.button_receipt=started;await saveExecution(file,report);
  }
  let previous='';
  for(;;){
   current=await call('monitor_state',{batch_id:phase.batch_id});const b=current.batch;if(!b||b.request_key!==phase.request_key||b.total!==phase.total)throw Error('验收批次身份与原记录不一致');
   const progress=`已完成${b.completed}/${b.total}篇；第${b.current_ordinal}篇：${b.current.stage_name}`;if(progress!==previous){notify(progress);previous=progress;}phase.last_observed={state:b.state,completed:b.completed,current_ordinal:b.current_ordinal,stage:b.current.stage_name,observed_at:new Date().toISOString()};await saveExecution(file,report);
   if(b.state==='paused')throw Error(`真实验收已暂停：${b.failure||'请核查当前任务'}。原批次保留；在网站恢复后，此窗口会继续核验和后续批次。`);
   if(b.state==='completed'){
    if(b.completed!==phase.total||b.items.length!==phase.total||b.items.some(i=>!i.submitted||!i.submitted_handoff_id||!i.article_id||!i.download||!i.title))throw Error('没有完整的真实稿件、文件和小鱼提交记录，不能判为通过');
    const evidence=[];for(const i of b.items){const verified=await call('acceptance_file',{batch_id:b.id,ordinal:i.ordinal});if(!verified.verified||verified.sha256!==i.download.sha256)throw Error('本机真实 Word 验证失败');evidence.push({ordinal:i.ordinal,title:i.title,article_id:i.article_id,handoff_id:i.submitted_handoff_id,submitted_at:i.submitted_at,created:i.created,filename:i.download.filename,path:i.download.path,sha256:i.download.sha256,final_version_ref:i.final_ref});}
    for(let n=1;n<evidence.length;n++)if(Date.parse(evidence[n].created)<Date.parse(evidence[n-1].submitted_at))throw Error('后一篇开始早于前篇提交，串行验收失败');
    // A completed server batch is not proof that the actual Codex process exited.
    if(current.local_execution?.batch_id!==b.id||current.local_execution.execution_id!==b.execution_id)throw Error('无法核对原 Codex 的退出记录；保留验收结果，先检查本机原执行');
    if(!current.local_execution.process_exited||!current.local_execution.server_end_acknowledged){await new Promise(r=>setTimeout(r,3000));continue;}
    phase.completed=true;phase.evidence=evidence;phase.execution_id=b.execution_id;phase.finished=b.finished;await saveExecution(file,report);notify(`${phase.total} 篇真实验收已确认提交，Word 与小鱼记录已保存。`);break;
   }
   await new Promise(r=>setTimeout(r,5000));
  }
 }
 const articles=report.phases.flatMap(p=>p.evidence.map(i=>i.article_id));if(new Set(articles).size!==4)throw Error('四篇文章的上传身份不独立');report.completed=true;report.finished=new Date().toISOString();await saveExecution(file,report);notify('真实验收完成：先 1 篇，再连续 3 篇；共 4 篇均已提交小鱼。');return report;
}
