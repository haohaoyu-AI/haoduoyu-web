import {readFile} from 'node:fs/promises';
// Print one complete independent definition artifact. Transport is not host approval.
// No browser/network action runs; never split or encode this program for execution.
const contract=await readFile(new URL('../../lib/article-upload-runtime.ts',import.meta.url),'utf8');
const version=/export const articleUploadRuntimeVersion='([^']+)';/.exec(contract)?.[1];
if(!version)throw Error('Runtime version missing');
const source=await readFile(new URL('./private-draft-executor.mjs',import.meta.url),'utf8');
const complete=source.replace(/^export (?=(?:async )?(?:function|const))/gm,'')+'\n'+
 ['createPrivateDraftExecutor','createZhihuAccountReader'].map(name=>`Object.defineProperty(${name},'runtimeVersion',{value:${JSON.stringify(version)}});`).join('\n')+'\n';
if(Buffer.byteLength(complete)>61000||Buffer.byteLength(JSON.stringify(complete))>62000)throw Error('Complete definition exceeds project budget; do not load');
process.stdout.write(complete);
