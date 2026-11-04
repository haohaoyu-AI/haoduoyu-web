// Actual shared native verification+article builder -> exact c30 Worker -> temporary D1.
// The only external-looking URLs below are inert article data, never fetch targets.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const sourceCommit='c30a8a956715b6ea809db4b87c0f4fcddf8f61de';
const [fixtureDirectory,outputPath,formAssembly,dotnet='dotnet']=process.argv.slice(2);
if(!fixtureDirectory||!outputPath||!formAssembly)throw new Error('Usage: node generate-article-verification-contract.mjs <isolated-source-worktree> <output.json> <Haoduoyu.Api.Tests.dll> [dotnet]');
const root=resolve(fixtureDirectory),assembly=resolve(formAssembly);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceCommit);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const logicFiles={pipeline:fileURLToPath(new URL('../Haoduoyu.Windows/ArticlePipelineFormLogic.cs',import.meta.url)),
  verification:fileURLToPath(new URL('../Haoduoyu.Windows/ArticleVerificationFormLogic.cs',import.meta.url))};
const logicHashes=Object.fromEntries(await Promise.all(Object.entries(logicFiles).map(async([name,path])=>[name,sha(await readFile(path))])));
const assemblyHash=sha(await readFile(assembly));
function form(original,changes={},selections=[]) {
  return JSON.parse(execFileSync(dotnet,[assembly,'--article-verification-form-command'],{encoding:'utf8',input:JSON.stringify({original,changes,selections}),maxBuffer:2*1024*1024}));
}
const {fixture}=await import(pathToFileURL(resolve(root,'tests/harness.mjs')));
const {default:worker}=await import(pathToFileURL(resolve(root,'dist/server/index.js')));
const app=await fixture();
const originalFetch=globalThis.fetch;let externalFetchAttempts=0;
globalThis.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){externalFetchAttempts++;throw new Error('External fetch disabled in synthetic verification capture');}
  return originalFetch(input,options);
};
const samples=[],invalidForms=[];
try {
  const session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,
    PUBLIC_BUSINESS_ACCOUNT_IDS:'["toutiao-haoduoyu"]',DAILY_NOTES_OWNER_ID:owner,MEMOS_OWNER_ID:owner};
  async function issue(name,accountIds,permissions) {
    const result=await app.request('/api/v1/api-keys',{session,method:'POST',body:{name,account_ids:accountIds,permissions}});
    assert.equal(result.status,201,'Synthetic scoped key setup failed');return result.data.token;
  }
  // Real authorization setup through the existing harness; credentials stay in memory and are never captured.
  const readToken=await issue('synthetic-read-only-verification',['toutiao-haoduoyu'],['read']);
  const foreignToken=await issue('synthetic-foreign-write-verification',['zhihu-haoduoyu'],['read','write']);
  await app.db.prepare('INSERT INTO matrix_articles(id,account_id,title,status,verify_items_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .bind('synthetic-verification-private','zhihu-haoduoyu','SYNTHETIC-PRIVATE-VERIFICATION','draft_saved','[{"done":false}]','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z').run();
  async function counters() {
    const revision=(await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision;
    const counts={};for(const table of ['audit','idempotency'])counts[table]=(await app.db.prepare('SELECT count(*) AS n FROM matrix_'+table).first()).n;
    return {revision,...counts};
  }
  async function call(name,method,path,body,{expected=200,vector,key,auth='public',origin=app.origin,csrf=true,publicHeader=true,bodyMode='full'}={}) {
    const headers=new Headers({Origin:origin});
    if(auth==='public'&&publicHeader)headers.set('X-Public-Business','1');
    if(auth==='session'){headers.set('Cookie',session.cookie);if(csrf)headers.set('X-CSRF-Token',session.csrfToken);}
    if(auth==='read-token')headers.set('Authorization','Bearer '+readToken);
    if(auth==='foreign-token')headers.set('Authorization','Bearer '+foreignToken);
    if(body!==undefined){headers.set('Content-Type','application/json');headers.set('Idempotency-Key',key??randomUUID());}
    const before=await counters();
    const response=await worker.fetch(new Request(app.origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);
    const responseJson=await response.text(),after=await counters();
    assert.equal(response.status,expected,name+' returned '+responseJson);
    samples.push({name,method,path,auth_kind:auth,...(body===undefined?{}:{body,idempotency_key:headers.get('Idempotency-Key')}),
      ...(vector?{form:{original:vector.original,changes:vector.changes,selections:vector.selections,values:vector.values},body_mode:bodyMode}:{}),
      status:response.status,response_json:responseJson,before,after});
    return JSON.parse(responseJson).data;
  }
  function build(original,changes={},selections=[]) {const vector=form(original,changes,selections);assert.equal(vector.ok,true,vector.error);return vector;}
  function bodyFor(vector,bodyMode='full') {return bodyMode==='verification-only'?{version:vector.body.version,verify_items:vector.body.verify_items}:vector.body;}
  async function send(name,vector,options={}) {const mode=options.bodyMode??'full';return call(name,vector.method,vector.path,bodyFor(vector,mode),{...options,vector});}
  await call('verification-current-complete-scope','GET','/api/v1/workbench-snapshot/index?version=2');
  const original={id:randomUUID(),version:0,title:'',account_id:'toutiao-haoduoyu',status:'drafting',production_mode:'unknown',
    sample:{synthetic_future:{keep:'中文 🐟',nullable:null,zero:0}},reruns:{watchdog:0,future:{keep:true}},
    blockers:[{type:'synthetic',future:{keep:true}}],draft_ref:{future:{keep:true}},timings:{future:{keep:true}},
    verify_items:[{description:'合成第一项',done:false,id:'synthetic-v0',future:{keep:['中文 🐟',0,null]}},
      {description:'历史缺失状态',future:{keep:'missing done'}},{description:'历史非布尔状态',done:'legacy-value',future:{keep:'not coerced'}}]};
  const createdVector=build(original,{title:'合成待核原稿',status:'draft_saved',production_mode:'mixed',writer:'dedao',summary:'合成概况',notes:'合成原备注'});
  const created=await send('verification-native-create-with-metadata',createdVector,{expected:201});
  const path='/api/v1/articles/'+created.id;
  const loaded=await call('verification-load-full-detail','GET',path);
  const merged=build(loaded,{title:'合成同稿标题修改',notes:'合成同稿备注修改',writer:'human'},[{index:0,done:true}]);
  const firstKey=randomUUID();
  const saved=await send('verification-native-merged-scalar-save',merged,{key:firstKey});
  assert.equal(saved.version,2);assert.equal(saved.title,'合成同稿标题修改');assert.equal(saved.notes,'合成同稿备注修改');
  assert.equal(saved.verify_state,'unknown');assert.equal(saved.has_pending_verify,null);
  const expectedItems=structuredClone(original.verify_items);expectedItems[0].done=true;
  assert.deepEqual(saved.verify_items,expectedItems);
  for(const field of ['sample','reruns','blockers','draft_ref','timings'])assert.deepEqual(saved[field],created[field],field+' was overwritten');
  const afterFirst=await call('verification-read-committed-same-content-not-a-receipt','GET',path);
  const replay=await send('verification-original-key-body-replay',merged,{key:firstKey});assert.deepEqual(replay,saved);
  const replaySample=samples.at(-1);assert.deepEqual(replaySample.before,replaySample.after,'Idempotency replay rewrote revision/audit/receipt');
  const changed=build(loaded,{notes:'同键不同内容不得写入'},[{index:0,done:true}]);
  await send('verification-same-key-different-body-rejected',changed,{key:firstKey,expected:409});
  assert.equal(JSON.parse(samples.at(-1).response_json).error.code,'IDEMPOTENCY_CONFLICT');
  await send('verification-stale-cas-rejected',merged,{expected:409});
  assert.equal(JSON.parse(samples.at(-1).response_json).error.code,'VERSION_CONFLICT');
  const afterConflicts=await call('verification-after-conflicts-preserves-committed-detail','GET',path);assert.deepEqual(afterConflicts,afterFirst);
  // Exercise the documented minimal formal API body, derived from the actual shared builder rather than a hand-written array.
  const partial=build(afterConflicts,{},[{index:1,done:false}]);
  const partialSaved=await send('verification-only-body-preserves-omitted-scalars',partial,{bodyMode:'verification-only'});
  assert.equal(partialSaved.version,3);assert.equal(partialSaved.title,saved.title);assert.equal(partialSaved.notes,saved.notes);
  assert.equal(partialSaved.has_pending_verify,true);
  const beforeSession=await call('verification-read-after-minimal-body','GET',path);
  const sessionForm=build(beforeSession,{},[{index:1,done:true},{index:2,done:true}]);
  const sessionSaved=await send('verification-session-csrf-save',sessionForm,{auth:'session'});
  assert.equal(sessionSaved.version,4);assert.equal(sessionSaved.verify_state,'complete');assert.equal(sessionSaved.has_pending_verify,false);
  const beforeDenied=await call('verification-read-before-permission-rejections','GET',path);
  const denied=build(beforeDenied,{},[{index:0,done:false}]);
  for(const [name,options] of [
    ['verification-read-only-token-cannot-write',{auth:'read-token',expected:403}],
    ['verification-write-token-outside-account-cannot-write',{auth:'foreign-token',expected:403}],
    ['verification-session-missing-csrf-cannot-write',{auth:'session',csrf:false,expected:403}],
    ['verification-public-header-required',{publicHeader:false,expected:403}],
    ['verification-public-foreign-origin-rejected',{origin:'https://foreign.invalid',expected:403}],
  ])await send(name,denied,options);
  const foreignVector=build({...beforeDenied,id:'synthetic-verification-private',account_id:'zhihu-haoduoyu',version:1}, {},[{index:0,done:false}]);
  await send('verification-public-foreign-record-hidden',foreignVector,{expected:404});
  const oversized=build(beforeDenied,{notes:'x'.repeat(17000)},[{index:0,done:false}]);
  await send('verification-public-body-budget-rejected',oversized,{expected:413});
  const afterDenied=await call('verification-denials-preserve-original-detail','GET',path);assert.deepEqual(afterDenied,beforeDenied);
  for(const sample of samples.filter(x=>x.status>=400))assert.deepEqual(sample.after,sample.before,sample.name+' mutated revision/audit/idempotency');
  function invalid(name,source,changes,selections) {const result=form(source,changes,selections);assert.equal(result.ok,false,name+' was accepted');invalidForms.push({name,original:source,changes,selections});}
  invalid('verification-negative-index',beforeDenied,{},[{index:-1,done:true}]);
  invalid('verification-out-of-range-index',beforeDenied,{},[{index:9999,done:true}]);
  invalid('verification-null-array-is-not-an-empty-checklist',{...beforeDenied,verify_items:null},{},[{index:0,done:true}]);
  invalid('verification-empty-array-does-not-invent-items',{...beforeDenied,verify_items:[]},{},[{index:0,done:true}]);
  invalid('verification-malformed-array-preserved-not-dropped',{...beforeDenied,verify_items:[null]},{},[{index:0,done:true}]);
  invalid('verification-metadata-edit-rejected',beforeDenied,{verify_items:beforeDenied.verify_items.map((item,index)=>index===0?{...item,description:'changed metadata'}:item)},[]);
  invalid('verification-item-order-rejected',beforeDenied,{verify_items:[...beforeDenied.verify_items].reverse()},[]);
  invalid('verification-unknown-done-not-coerced',loaded,{verify_items:loaded.verify_items.map((item,index)=>index===2?{...item,done:1}:item)},[]);
  invalid('verification-unpaired-surrogate-in-retained-evidence',{...beforeDenied,verify_items:[{description:'bad UTF-16',future:'\ud800'}]},{},[{index:0,done:true}]);
  assert.equal(externalFetchAttempts,0);
  for(const [name,file] of Object.entries(logicFiles))assert.equal(sha(await readFile(file)),logicHashes[name],name+' source changed during capture; rebuild and recapture');
  await mkdir(dirname(resolve(outputPath)),{recursive:true});
  await writeFile(resolve(outputPath),JSON.stringify({source_commit:sourceCommit,synthetic_only:true,external_fetch_attempts:0,production_business_requests:0,
    generated_at:new Date().toISOString(),commands_from:'Actual shared native ArticleVerificationFormLogic.SetDone and ArticlePipelineFormLogic.FormValues/Build',
    form_logic_sha256:logicHashes,form_builder_assembly_sha256:assemblyHash,
    setup:'Existing synthetic harness bootstrap/login and two API-issued in-memory scoped keys; synthetic foreign article direct-D1 fixture only. No credentials captured.',
    fixture:'Exact compiled c30 Worker.fetch + temporary Miniflare D1; unchanged auth, constraints, permissions and limiters; all runtimes disposed; no external fetch',
    limitations:['No exact GET article operation receipt exists; matching current content never confirms the original unknown request.',
      'Idempotency replay reauthenticates actor/write/CSRF then returns actor+key historical response before current article-account authorization; no atomic expected-scope contract added.'],
    samples,invalid_forms:invalidForms},null,2)+'\n');
  console.log(`Generated ${samples.length} real article verification Worker responses and ${invalidForms.length} actual shared-form rejections; no external fetch or production data.`);
} finally {globalThis.fetch=originalFetch;await app.mf.dispose();}
