// Exact-source synthetic receipts. No production business or remote provider requests.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

const sourceCommit='c30a8a956715b6ea809db4b87c0f4fcddf8f61de';
const [fixtureDirectory,outputPath]=process.argv.slice(2);
if(!fixtureDirectory||!outputPath)throw new Error('Usage: node generate-unicode-receipt-contract.mjs <isolated-c30-worktree> <output.json>');
const root=resolve(fixtureDirectory);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceCommit);
const {fixture}=await import(pathToFileURL(resolve(root,'tests/harness.mjs')));
const {default:worker}=await import(pathToFileURL(resolve(root,'dist/server/index.js')));
const app=await fixture(),originalFetch=globalThis.fetch;let externalFetchAttempts=0;
globalThis.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){externalFetchAttempts++;throw new Error('External fetch disabled in Unicode receipt contract');}
  return originalFetch(input,options);
};
try {
  const session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'1',DAILY_NOTES_OWNER_ID:owner,MEMOS_OWNER_ID:owner,
    PUBLIC_BUSINESS_USER_ID:owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'["toutiao-haoduoyu"]'};
  const samples=[],reconciliations=[];
  async function call(name,method,path,body) {
    const headers=new Headers({Origin:app.origin,'X-Public-Business':'1','X-Note-Labels-Version':'3'});
    if(body!==undefined)headers.set('Content-Type','application/json');
    const response=await worker.fetch(new Request(app.origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);
    const responseJson=await response.text();assert.equal(response.status,200,name+' unexpected status');
    samples.push({name,method,path,...(body===undefined?{}:{body_json:JSON.stringify(body)}),status:response.status,response_json:responseJson});
    return JSON.parse(responseJson).data;
  }
  async function saveAndCapture(name,path,body,kind) {
    const saved=await call(name+'-save','PUT',path,body);
    const receipt=await call(name+'-receipt','GET','/api/v1/'+(kind==='note'?'note-entries':'memos')+'/operations/'+body.save_id);
    const data=await call(name+'-entity','GET',kind==='group'?'/api/v1/memos':path);
    const entity=kind==='group'?data.groups.find(row=>row.id===saved.id):data;
    assert.ok(entity);assert.equal(entity.version,1);assert.equal(receipt.version,1);
    reconciliations.push({name,method:'PUT',path,body_json:JSON.stringify(body),receipt_json:JSON.stringify({data:receipt}),entity_json:JSON.stringify({data:entity})});
  }
  const date=(await call('server-beijing-today','GET','/api/v1/todos')).today;
  const marker=()=>({version:0,save_id:randomUUID()});
  const unicode='合成🐟👩‍💻é " \\ <>&\u2028\u2029';
  await saveAndCapture('note-literal-emoji-and-line-controls','/api/v1/note-entries/'+randomUUID(),{...marker(),category:'life',date,text:unicode+'\n第二行\t制表符'},'note');
  const groupId=randomUUID();
  await saveAndCapture('memo-group-literal-emoji','/api/v1/memos/groups/'+groupId,{...marker(),title:unicode,position:0},'group');
  await saveAndCapture('memo-note-literal-emoji-and-line-controls','/api/v1/memos/notes/'+randomUUID(),{...marker(),group_id:groupId,title:unicode,body:unicode+'\n第二行\t制表符',position:0},'memo');
  assert.equal(externalFetchAttempts,0);assert.equal(samples.length,10);
  await mkdir(dirname(resolve(outputPath)),{recursive:true});
  await writeFile(resolve(outputPath),JSON.stringify({source_commit:sourceCommit,synthetic_only:true,external_fetch_attempts:externalFetchAttempts,
    generated_at:new Date().toISOString(),fixture:'Exact compiled c30 Worker.fetch + existing harness temporary Miniflare D1; outbound denied; no production records',samples,reconciliations},null,2)+'\n');
  console.log('Generated 10 actual Unicode Worker requests and 3 receipt/entity pairs; zero external fetch attempts.');
} finally {globalThis.fetch=originalFetch;await app.mf.dispose();}
