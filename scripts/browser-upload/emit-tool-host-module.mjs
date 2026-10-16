import {readFile} from 'node:fs/promises';
// Print complete independent authenticated-host definitions. No tool action or
// credentials; source transport and a passing byte budget are not host approval.
const contract=await readFile(new URL('../../lib/article-upload-runtime.ts',import.meta.url),'utf8');
const version=/export const articleUploadRuntimeVersion='([^']+)';/.exec(contract)?.[1];
if(!version)throw Error('Runtime version missing');
const sources=await Promise.all(['public-errors.mjs','tool-host.mjs','bridge.mjs'].map(file=>readFile(new URL('./'+file,import.meta.url),'utf8')));
const complete=sources.map(source=>source.replace(/^import .*;\r?\n/gm,'').replace(/^export (?=(?:async )?(?:function|const))/gm,'')).join('\n')+'\n'+
 ['createUploadToolCall','createArticleUploadHost','createArticleUploadBridge'].map(name=>`Object.defineProperty(${name},'runtimeVersion',{value:${JSON.stringify(version)}});`).join('\n')+'\n';
if(Buffer.byteLength(complete)>61000||Buffer.byteLength(JSON.stringify(complete))>62000)throw Error('Complete definition exceeds project budget; do not load');
process.stdout.write(complete);
