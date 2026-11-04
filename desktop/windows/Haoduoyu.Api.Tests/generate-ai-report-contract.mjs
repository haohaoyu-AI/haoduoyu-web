// Append-only user-supplied work reports against exact isolated source, never a paid provider.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

const sourceCommit='c30a8a956715b6ea809db4b87c0f4fcddf8f61de';
const [fixtureDirectory,outputPath]=process.argv.slice(2);
if(!fixtureDirectory||!outputPath)throw new Error('Usage: node generate-ai-report-contract.mjs <isolated-c30-worktree> <output.json>');
const root=resolve(fixtureDirectory);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceCommit);
const {fixture}=await import(pathToFileURL(resolve(root,'tests/harness.mjs')));
const {default:worker}=await import(pathToFileURL(resolve(root,'dist/server/index.js')));
const app=await fixture();const originalFetch=globalThis.fetch;let externalFetchAttempts=0;
globalThis.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){externalFetchAttempts++;throw new Error('External/provider fetch disabled in AI report contract');}
  return originalFetch(input,options);
};
try {
  const session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'1',DAILY_NOTES_OWNER_ID:owner,MEMOS_OWNER_ID:owner,
    PUBLIC_BUSINESS_USER_ID:owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'["toutiao-haoduoyu"]'};
  const samples=[];
  async function call(name,method,path,body,expected=200) {
    const headers=new Headers({Origin:app.origin,'X-Public-Business':'1'});if(body!==undefined)headers.set('Content-Type','application/json');
    const response=await worker.fetch(new Request(app.origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);
    const json=await response.text();assert.equal(response.status,expected,name+' returned '+json);
    samples.push({name,method,path,...(body===undefined?{}:{body}),status:response.status,response_json:json});return JSON.parse(json).data;
  }
  const empty=await call('initial-complete-empty-page','GET','/api/v1/ai-reports?offset=0');assert.deepEqual(empty.items,[]);assert.equal(empty.has_more,false);
  const id=randomUUID(),body={author:'  本次临时合成验证署名  ',content:'  2026-11-04\r\n本次工作：验证已有汇报的保存与重放，不调用任何写作模型。  '};
  const saved=await call('create-user-supplied-immutable-report','PUT','/api/v1/ai-reports/'+id,body,201);
  assert.equal(saved.author,body.author.trim());assert.equal(saved.content,body.content.replace(/\r\n?/g,'\n').trim());assert.ok(!Object.hasOwn(saved,'content_hash'));
  const replay=await call('same-uuid-same-body-idempotent-replay','PUT','/api/v1/ai-reports/'+id,body);assert.deepEqual(replay,saved);
  await call('same-uuid-different-content-rejected','PUT','/api/v1/ai-reports/'+id,{...body,content:'不同合成内容，不应覆盖原件'},409);
  const listed=await call('full-list-retains-original-content-and-hash','GET','/api/v1/ai-reports?offset=0');
  assert.equal(listed.items.length,1);assert.equal(listed.items[0].content,saved.content);assert.equal(listed.items[0].created_at,saved.created_at);assert.match(listed.items[0].content_hash,/^[a-f0-9]{64}$/);
  const later=await call('later-complete-empty-page','GET','/api/v1/ai-reports?offset=100');assert.deepEqual(later.items,[]);assert.equal(later.has_more,false);
  assert.equal(externalFetchAttempts,0);await mkdir(dirname(resolve(outputPath)),{recursive:true});
  await writeFile(resolve(outputPath),JSON.stringify({source_commit:sourceCommit,synthetic_only:true,append_only:true,paid_provider_calls:0,external_fetch_attempts:externalFetchAttempts,
    generated_at:new Date().toISOString(),fixture:'Existing harness temporary Miniflare D1 + exact compiled Worker.fetch; no production records, deletion or provider calls',samples},null,2)+'\n');
  console.log('Generated 6 actual immutable AI report Worker samples; create/replay/conflict + full page reads; no provider calls or external fetch attempts.');
} finally {globalThis.fetch=originalFetch;await app.mf.dispose();}
