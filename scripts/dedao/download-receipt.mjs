import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {saveExecution,readExecution} from './runtime.mjs';
export async function verifyWord(d,{downloadDir,batchId,ordinal,executorId}){
 if(!d||d.executor_id!==executorId)throw Error('原 Word 属于其他执行机，不能替换下载来源');
 const folder=await fs.realpath(path.join(downloadDir,batchId,String(ordinal))),file=await fs.realpath(d.path);if(!file.startsWith(folder+path.sep))throw Error('原 Word 不在本批次篇次目录');const bytes=await fs.readFile(file);
 if(path.basename(file)!==d.filename||bytes.length!==d.size||createHash('sha256').update(bytes).digest('hex')!==d.sha256)throw Error('原 Word 字节或文件名已变化；保留现场，不能重写来源');return bytes;
}
export async function saveReceipt(workDir,batchId,ordinal,receipt){const dir=path.join(workDir,'receipts');await fs.mkdir(dir,{recursive:true});await saveExecution(path.join(dir,`${batchId}-${ordinal}.json`),receipt);}
export async function recoverReceipt(workDir,batchId,current,scope){const r=await readExecution(path.join(workDir,'receipts',`${batchId}-${current.ordinal}.json`));if(!r)return null;if(r.title!==current.title||r.final_version_ref!==current.final_ref)throw Error('原下载回执与本篇定稿版本不同');await verifyWord(r,{...scope,batchId,ordinal:current.ordinal});return r;}
