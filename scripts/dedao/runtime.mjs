import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export function processPresent(pid){
 if(!Number.isInteger(pid)||pid<1)return false;
 try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw Error('Original process presence is unknown; do not start another executor');}
}
export async function saveExecution(file,data){
 const temporary=file+'.'+randomUUID()+'.tmp',stream=await fs.open(temporary,'wx',0o600);
 try{await stream.writeFile(JSON.stringify(data));await stream.sync();}finally{await stream.close();}
 await fs.rename(temporary,file);
}
export async function readExecution(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw Error('Execution record is unreadable; inspect it before recovery, do not overwrite');}}
export async function lockExecutor(folder){
 const file=path.join(folder,'worker.lock');
 for(let n=0;n<2;n++){
  try{const handle=await fs.open(file,'wx',0o600);await handle.writeFile(JSON.stringify({pid:process.pid,started:new Date().toISOString()}));await handle.sync();await handle.close();return async()=>{const held=JSON.parse(await fs.readFile(file,'utf8'));if(held.pid===process.pid)await fs.unlink(file);};}
  catch(e){
   if(e.code!=='EEXIST')throw e;
   const recovery=path.join(folder,'worker-lock-recovery');
   try{await fs.mkdir(recovery);}catch{throw Error('Worker lock recovery is already in progress; inspect the original executor');}
   try{const old=JSON.parse(await fs.readFile(file,'utf8'));if(processPresent(old.pid))throw Error('A worker is already present in this directory; keep the original executor');await fs.unlink(file);}catch(error){if(error.code!=='ENOENT')throw error;}finally{await fs.rmdir(recovery);}
  }
 }
 throw Error('Worker lock could not be acquired');
}
export async function acknowledgeExited(record,file,call){
 if(!record||record.server_end_acknowledged)return true;
 if(!record.process_exited){if(processPresent(record.pid))throw Error('Original Codex process is still present; do not start another task');record={...record,process_exited:true};await saveExecution(file,record);}
 const view=await call('read_dedao_batch',{batch_id:record.batch_id}),b=view.batch;
 const original=b.executor_id===record.executor_id&&(b.execution_id===record.execution_id||['launching','paused'].includes(b.state)&&b.execution_id===record.launcher_id);
 if(original||b.state==='queued'&&b.queue_revision===record.queue_revision)await call('end_dedao_execution',{batch_id:record.batch_id,execution_id:record.execution_id,launcher_id:record.launcher_id,executor_id:record.executor_id,queue_revision:record.queue_revision,process_exited:true});
 else if(b.execution_id===record.execution_id||b.execution_id===record.launcher_id)throw Error('Executor end identity is unclear; inspect the same batch');
 await saveExecution(file,{...record,server_end_acknowledged:true});return true;
}
