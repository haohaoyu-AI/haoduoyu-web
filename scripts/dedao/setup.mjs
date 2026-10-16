import path from 'node:path';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareConfiguration} from './configuration.mjs';
import {connectMcp} from './oauth.mjs';
import {lockExecutor} from './runtime.mjs';
import {runAcceptance} from './acceptance.mjs';
import fs from 'node:fs/promises';
const dir=path.dirname(fileURLToPath(import.meta.url)),acceptance=process.argv.includes('--acceptance');
let child,release;
try{
 const root=process.env.DEDAO_WORK_DIR||path.join((await import('node:os')).homedir(),'.haoduoyu-dedao');await fs.mkdir(path.join(root,'launcher'),{recursive:true});release=await lockExecutor(path.join(root,'launcher'));
 console.log('好多鱼得到大脑连接助手。配置保存在本机；不会复制浏览器 Cookie，也不会把授权令牌交给网页或 Codex 提示词。');
 const {workDir}=await prepareConfiguration();
 const authorization=await connectMcp({url:process.env.DEDAO_MCP_URL,workDir});await authorization.call('read_dedao_batch');await authorization.close();console.log('网站本人授权已确认，正在启动真实本机执行端。');
 child=fork(path.join(dir,'executor.mjs'),[],{env:{...process.env,DEDAO_ACCEPTANCE_MODE:acceptance?'1_then_3':''},stdio:['inherit','inherit','inherit','ipc']});
 const exited=new Promise(resolve=>{child.once('exit',(code,signal)=>resolve({code,signal}));child.once('error',()=>resolve({code:1}));});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child?.kill());
 const ready=await Promise.race([new Promise(resolve=>child.once('message',resolve)),exited.then(()=>{throw Error('本机执行端未能启动，请查看窗口中的连接原因');})]);
 if(ready?.type!=='dedao-ready')throw Error('执行端连接回执无效');
 const call=async(operation,args={})=>{const r=await fetch(ready.control_url,{method:'POST',headers:{'Content-Type':'application/json','X-Dedao-Control':ready.nonce,'X-Dedao-Acceptance':ready.acceptance_nonce},body:JSON.stringify({operation,args}),signal:AbortSignal.timeout(operation==='acceptance_start'?16*60*1000:40000)});const v=await r.json();if(!r.ok)throw Error(v.error||'执行端回执未确认');return v;};
 let last='';while(child.exitCode===null){const v=await call('monitor_state');if(v.connection.connected)break;const message=v.connection.missing.join('；');if(message!==last){console.log('等待真实连接：'+message);last=message;}await new Promise(r=>setTimeout(r,5000));}
 if(child.exitCode!==null)throw Error('连接程序已经停止');console.log('执行端已真实连接。保留这个窗口；网页刷新或关闭不会停止已启动的批次。');
 if(acceptance){let previous='';while(child.exitCode===null){try{await runAcceptance({workDir,call});break;}catch(error){const message=error.message;if(message!==previous){console.log(message);console.log('验收尚未通过。此窗口持续等待；解决登录或连接问题后，在网站恢复当前批次即可继续。');previous=message;}await new Promise(r=>setTimeout(r,5000));}}}
 else console.log('启动文章：网站填写生成篇数，再点击“求助成文”。暂停：点击“暂停当前批次”。恢复：等待原执行停止，再点击“恢复当前批次”。');
 console.log('停止本机连接可在此窗口按 Ctrl+C；浏览器保持原样。');await exited;
}catch(error){console.error('连接尚未完成：'+(error?.name&&error.name!=='Error'?error.name+'。':'')+(error?.message||'请检查本机窗口'));child?.kill();process.exitCode=1;}
finally{if(release)await release().catch(()=>{});}
