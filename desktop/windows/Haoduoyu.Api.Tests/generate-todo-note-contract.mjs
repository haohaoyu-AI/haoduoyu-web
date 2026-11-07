// Exact reviewed candidate -> official harness + temporary synthetic D1 only.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const sourceCommit='34bff302e128c92f46f00e76d59f9b44b9b7242e';
const [sourceDirectory,outputPath,mode]=process.argv.slice(2);
if(!sourceDirectory||!outputPath)throw new Error('Usage: node generate-todo-note-contract.mjs <exact-source-worktree> <output.json>');
const root=resolve(sourceDirectory),sha=value=>createHash('sha256').update(value).digest('hex');
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceCommit);
assert.equal(execFileSync('git',['diff','--name-only'],{cwd:root,encoding:'utf8'}).trim(),'','tracked source must remain unchanged');
const {fixture,PASSWORD}=await import(pathToFileURL(resolve(root,'tests/harness.mjs')));
const {default:worker}=await import(pathToFileURL(resolve(root,'dist/server/index.js')));
const app=await fixture(),originalFetch=globalThis.fetch;let externalFetchAttempts=0,publicRequests=0;
globalThis.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){externalFetchAttempts++;throw new Error('External fetch disabled in synthetic todo note contract');}
  return originalFetch(input,options);
};
try {
  const ownerSession=await app.login(),owner=(await app.request('/api/v1/auth/me',{session:ownerSession})).data.id;
  if(mode==='--append-completion-replay') {
    const prior=JSON.parse(await readFile(resolve(outputPath),'utf8'));
    assert.equal(prior.source_commit,sourceCommit);assert.equal(prior.samples.length,80);assert.equal(prior.external_fetch_attempts,0);
    for(const [name,hash] of Object.entries(prior.source_hashes))assert.equal(sha(await readFile(resolve(root,name))),hash,'original source hash changed: '+name);
    const extra=await completionReplay(app,worker,ownerSession,owner,prior.date,'appended-isolated-runtime');
    prior.samples.push(...extra.samples);prior.checks.push(...extra.checks);prior.ids.concurrent_completion_todo=extra.id;
    prior.additional_runtimes=[{id:'appended-isolated-runtime',owner,date:prior.date,synthetic_only:true,normal_session_login:true,direct_setup:'One independent todo at version 1 with an already matching note; no permissions/constraints/limiter/clock changes.'}];
    prior.appended_at=new Date().toISOString();assert.equal(externalFetchAttempts,0);
    await writeFile(resolve(outputPath),JSON.stringify(prior,null,2)+'\n');
    console.log('Preserved all original 80 sample values; appended 2 actual exact-source session requests in a separately identified temporary D1 runtime.');
  } else {
  const other=randomUUID(),username='synthetic-note-other-'+other;
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,created_at FROM matrix_users WHERE id=?').bind(other,username,owner).run();
  const otherLogin=await app.request('/api/v1/auth/login',{method:'POST',body:{username,password:PASSWORD}});assert.equal(otherLogin.status,200);
  const otherSession={cookie:otherLogin.headers.get('set-cookie').split(';')[0],csrfToken:otherLogin.data.csrfToken};
  const key=await app.request('/api/v1/api-keys',{method:'POST',session:ownerSession,body:{name:'synthetic note permission denial',account_ids:['toutiao-haoduoyu'],permissions:['read','write']}});
  assert.equal(key.status,201);const token=key.data.token;
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'["toutiao-haoduoyu"]',DAILY_NOTES_OWNER_ID:owner,MEMOS_OWNER_ID:owner};
  const ids={todo:randomUUID(),template:randomUUID(),other_todo:randomUUID(),deleted_todo:randomUUID()};
  const base='/api/v1/todos',notePath=base+'/'+ids.todo+'/note',samples=[],checks=[];
  async function counters(){
    const value={revision:(await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision};
    for(const name of ['audit','idempotency'])value[name]=(await app.db.prepare('SELECT count(*) AS n FROM matrix_'+name).first()).n;
    for(const name of ['todos','todo_templates','todo_template_links'])value[name+'_sha256']=sha(JSON.stringify((await app.db.prepare('SELECT * FROM matrix_'+name+' ORDER BY rowid').all()).results));
    return value;
  }
  async function call(name,method,path,body,{status=200,auth='owner',csrf=true,origin=app.origin,mode='1',unchanged=false,deliveryLoss=false,concurrent=false}={}){
    const headers=new Headers({Origin:origin});const session=auth==='owner'?ownerSession:auth==='other'?otherSession:null;
    if(session){headers.set('Cookie',session.cookie);if(csrf)headers.set('X-CSRF-Token',session.csrfToken);}
    if(auth==='key'||auth==='key-and-owner')headers.set('Authorization','Bearer '+token);
    if(auth==='key-and-owner'){headers.set('Cookie',ownerSession.cookie);headers.set('X-CSRF-Token',ownerSession.csrfToken);}
    if(auth==='expired')headers.set('Cookie','matrix_session='+'0'.repeat(64));
    if(auth==='malformed')headers.set('Cookie','matrix_session=invalid-synthetic-cookie');
    if(auth==='public'){headers.set('X-Public-Business','1');publicRequests++;assert.ok(publicRequests<20,'normal public limiter must remain unchanged');}
    const bodyJson=body===undefined?undefined:JSON.stringify(body);if(body!==undefined)headers.set('Content-Type','application/json');
    const before=await counters();
    const response=await worker.fetch(new Request(app.origin+path,{method,headers,body:bodyJson}),{...env,PUBLIC_BUSINESS_MODE:mode});
    const responseJson=await response.text(),after=await counters();const expected=Array.isArray(status)?status:[status];
    assert.ok(expected.includes(response.status),name+' returned '+response.status+' '+responseJson.slice(0,400));
    if(!concurrent&&(method==='GET'||response.status>=400||unchanged))assert.deepEqual(after,before,name+' changed recorded business/control/audit/receipt state');
    samples.push({name,method,path,auth_kind:auth,public_mode:mode,...(body===undefined?{}:{body_json:bodyJson}),status:response.status,response_json:responseJson,before,after,
      expected_no_change:!concurrent&&(method==='GET'||response.status>=400||unchanged),...(concurrent?{concurrent:true}:{}),...(deliveryLoss?{simulated_response_not_delivered_to_caller:true}:{})});
    return {status:response.status,data:JSON.parse(responseJson).data};
  }
  const verify=(condition,name)=>{assert.ok(condition,name);checks.push(name);};
  const first=await call('owner-empty-get','GET',base);const date=first.data.today;
  await call('owner-create-template','POST','/api/v1/todo-templates',{id:ids.template,text:'合成备注关联模板'},{status:201});
  const created=(await call('owner-create-linked-todo','POST',base,{id:ids.todo,date,text:'备注不能覆盖的原事项',template_id:ids.template},{status:201})).data;
  await call('owner-baseline-get','GET',base+'?date='+date);
  const exact='  合成未完成原因\r\n组合 e\u0301 🐟\t尾空白 \r ';
  const saved=(await call('owner-save-v1','PATCH',notePath,{note:exact,version:1})).data;
  verify(saved.note===exact&&saved.version===2&&saved.date===created.date&&saved.text===created.text&&saved.completed===false&&saved.template_id===ids.template,'normal session preserves exact CRLF whitespace decomposed Unicode and original todo/link fields');
  await call('owner-after-save-get','GET',base+'?date='+date);
  await call('owner-replay-v1','PATCH',notePath,{note:exact,version:1},{unchanged:true});
  const same=(await call('owner-same-text-current-v2','PATCH',notePath,{note:exact,version:2})).data;
  verify(same.version===3,'same text at current version still increments exactly once');
  await call('owner-stale-version-v1-same-text','PATCH',notePath,{note:exact,version:1},{status:409});
  await call('owner-old-version-different-text','PATCH',notePath,{note:'不可覆盖',version:2},{status:409});
  const clear=(await call('owner-clear-v3','PATCH',notePath,{note:'',version:3})).data;
  verify(clear.version===4&&!Object.hasOwn(clear,'note'),'clear response omits note rather than returning null or retaining previous text');
  await call('owner-clear-replay-v3','PATCH',notePath,{note:'',version:3},{unchanged:true});
  await call('owner-after-clear-get','GET',base+'?date='+date);
  const whitespace=(await call('owner-whitespace-v4','PATCH',notePath,{note:' \t\r\n ',version:4})).data;
  verify(whitespace.note===' \t\r\n ','whitespace-only note remains exact and present');
  await call('owner-after-whitespace-get','GET',base+'?date='+date);
  const boundary='中'.repeat(2000)+'🐟'.repeat(1000);
  const limit=(await call('owner-limit4000-v5','PATCH',notePath,{note:boundary,version:5})).data;
  verify(boundary.length===4000&&Buffer.byteLength(boundary)>4000&&limit.note===boundary&&limit.version===6,'4000 UTF16 boundary is not a 4000-byte or 4000-rune limit');
  await call('owner-short-before-concurrent-v6','PATCH',notePath,{note:'合成并发起点',version:6});
  const differentBefore=await counters();
  const different=await Promise.all([call('concurrent-different-a','PATCH',notePath,{note:'并发正文 A',version:7},{status:[200,409],concurrent:true}),call('concurrent-different-b','PATCH',notePath,{note:'并发正文 B',version:7},{status:[200,409],concurrent:true})]);
  const differentAfter=await counters();
  verify(different.filter(row=>row.status===200).length===1&&different.filter(row=>row.status===409).length===1&&differentAfter.revision===differentBefore.revision+1,'concurrent different notes permit one CAS commit and reject the other');
  await call('owner-after-different-concurrent-get','GET',base+'?date='+date);
  const sameBefore=await counters();
  const identical=await Promise.all([call('concurrent-identical-a','PATCH',notePath,{note:'合成同文并发',version:8}),call('concurrent-identical-b','PATCH',notePath,{note:'合成同文并发',version:8})]);
  const sameAfter=await counters();
  verify(identical.every(row=>row.data.version===9&&row.data.note==='合成同文并发')&&sameAfter.revision===sameBefore.revision+1,'concurrent identical notes commit once and replay the same version-plus-one result');
  await call('owner-complete-v9','PATCH',base+'/'+ids.todo,{version:9,completed:true});
  await call('owner-history-after-complete','GET',base+'?date='+date);
  await call('owner-note-after-complete-v10','PATCH',notePath,{note:'已完成后备注仍保留原日期',version:10});
  await call('owner-archive-linked-template','POST','/api/v1/todo-templates/'+ids.template+'/archive',{version:1});
  const afterArchive=(await call('owner-note-after-template-archive-v11','PATCH',notePath,{note:'模板归档不丢原关联',version:11})).data;
  verify(afterArchive.template_id===ids.template&&afterArchive.template_version===2&&afterArchive.template_active===false&&afterArchive.completed===true,'note preserves association while linkedItem legitimately reflects separately archived template state');
  const unknownOperation={operation_id:randomUUID(),method:'PATCH',path:notePath,body_json:JSON.stringify({note:'合成丢失回执备注',version:12}),status:'Unknown',retries:0,
    explanation:'Successful source response is captured but deliberately withheld from a simulated caller. This is not a real network failure or an original-operation receipt.'};
  await call('unknown-before-get','GET',base+'?date='+date);
  await call('unknown-note-v12-simulated-response-loss','PATCH',notePath,JSON.parse(unknownOperation.body_json),{deliveryLoss:true});
  const unknown=(await call('unknown-current-get','GET',base+'?date='+date)).data.items.find(row=>row.id===ids.todo);
  verify(unknown.note==='合成丢失回执备注'&&unknown.version===13&&unknownOperation.status==='Unknown'&&unknownOperation.retries===0,'matching current GET is not a save receipt and does not confirm or resend Unknown');
  for(const [name,note] of [
    ['4001-units','中'.repeat(4001)],['2001-astral','🐟'.repeat(2001)],['lone-high','\ud800'],['lone-low','\udc00'],
    ['nul','\0'],['soh','\u0001'],['backspace','\b'],['vertical-tab','\v'],['form-feed','\f'],['shift-out','\u000e'],['unit-separator','\u001f'],['delete','\u007f'],
    ['null',null],['number',7],['boolean',false],['array',[]],['object',{}]])
    await call('invalid-note-'+name,'PATCH',notePath,{note,version:13},{status:400});
  for(const [name,version] of [['zero',0],['negative',-1],['fraction',1.5],['string','13'],['null',null],['max-safe',Number.MAX_SAFE_INTEGER],['unsafe',Number.MAX_SAFE_INTEGER+1]])
    await call('invalid-version-'+name,'PATCH',notePath,{note:'无效版本',version},{status:400});
  for(const [name,body] of [['missing-note',{version:13}],['missing-version',{note:''}],['extra-date',{note:'',version:13,date}],['extra-save-id',{note:'',version:13,save_id:randomUUID()}],['extra-text',{note:'',version:13,text:'不能改事项'}]])
    await call('invalid-body-'+name,'PATCH',notePath,body,{status:400});
  await call('max-safe-minus-one-valid-but-stale','PATCH',notePath,{note:'合法数值但旧版本',version:Number.MAX_SAFE_INTEGER-1},{status:409});
  await call('invalid-query','PATCH',notePath+'?date='+date,{note:'',version:13},{status:400});
  await call('invalid-uuid','PATCH',base+'/00000000-0000-0000-0000-000000000000/note',{note:'',version:13},{status:400});
  await call('wrong-method-post','POST',notePath,{note:'',version:13},{status:404});
  await call('wrong-method-get','GET',notePath,undefined,{status:404});
  await call('other-create-own-todo','POST',base,{id:ids.other_todo,date,text:'仅另一个私有账号可见'},{auth:'other',status:201});
  await call('other-cannot-note-owner','PATCH',notePath,{note:'不应越权',version:13},{auth:'other',status:404});
  await call('owner-cannot-note-other','PATCH',base+'/'+ids.other_todo+'/note',{note:'不应越权',version:1},{status:404});
  await call('owner-create-deleted-todo','POST',base,{id:ids.deleted_todo,date,text:'合成软删事项'},{status:201});
  await call('owner-delete-todo','DELETE',base+'/'+ids.deleted_todo,{date,version:1});
  await call('deleted-todo-note-denied','PATCH',base+'/'+ids.deleted_todo+'/note',{note:'不应恢复',version:2},{status:404});
  for(const [name,options] of [
    ['owner-missing-csrf',{csrf:false,status:403}],['owner-foreign-origin',{origin:'https://foreign.invalid',status:403}],
    ['key-denied',{auth:'key',status:403}],['key-with-session-denied',{auth:'key-and-owner',status:403}],
    ['expired-session-no-public-fallback',{auth:'expired',status:401}],['malformed-session-no-public-fallback',{auth:'malformed',status:401}],
    ['public-note-not-allowlisted',{auth:'public',status:401}],['public-mode-disabled-note-denied',{auth:'public',mode:'0',status:401}]])
    await call(name,'PATCH',notePath,{note:'权限拒绝不得保存',version:13},options);
  const publicRead=(await call('public-can-read-existing-note','GET',base+'?date='+date,undefined,{auth:'public'})).data.items.find(row=>row.id===ids.todo);
  verify(publicRead.note===unknown.note&&publicRead.version===unknown.version,'public GET may read existing note while private PATCH remains denied');
  await call('final-owner-history','GET',base+'?date='+date);
  const extra=await completionReplay(app,worker,ownerSession,owner,date,'same-runtime-tail');
  samples.push(...extra.samples);checks.push(...extra.checks);ids.concurrent_completion_todo=extra.id;
  verify(externalFetchAttempts===0,'zero non-loopback fetch attempts');
  const sourceHashes={};
  for(const name of ['src/todos.mjs','src/business-access.mjs','src/public-business.mjs','src/security.mjs','src/storage.mjs','src/business-snapshot.mjs','src/snapshot-projection.mjs','drizzle/0019_todo_notes_archives.sql','package-lock.json','dist/server/index.js'])sourceHashes[name]=sha(await readFile(resolve(root,name)));
  await mkdir(dirname(resolve(outputPath)),{recursive:true});
  await writeFile(resolve(outputPath),JSON.stringify({source_commit:sourceCommit,synthetic_only:true,production_business_requests:0,external_fetch_attempts:0,generated_at:new Date().toISOString(),
    source_hashes:sourceHashes,users:{owner,other},ids,date,samples,checks,unknown_operation:unknownOperation,public_requests:publicRequests,
    concurrency:{different:{before:differentBefore,after:differentAfter,successes:1,conflicts:1},identical:{before:sameBefore,after:sameAfter,successes:2,commits:1}},
    fixture:'Exact candidate compiled Worker.fetch, official bootstrap and real synthetic logins/key issuance, temporary Miniflare D1 disposed. No credentials captured; permissions/constraints/limiter/clock/source unchanged. Unknown delivery loss is explicit simulation; current GET is not exact-operation confirmation.'},null,2)+'\n');
  console.log(`Generated ${samples.length} actual Worker requests, ${checks.length} semantic assertions; temporary synthetic D1 only, no external fetch attempts, private-session note contract.`);
  }
} finally {globalThis.fetch=originalFetch;await app.mf.dispose();}

async function completionReplay(app,worker,session,owner,date,runtimeId) {
  const id=randomUUID(),stamp=new Date().toISOString(),note='完成动作前后逐字相同的合成备注',samples=[],checks=[];
  await app.db.prepare('INSERT INTO matrix_todos(user_id,id,date,text,completed,version,created_at,updated_at,note) VALUES(?,?,?,?,0,1,?,?,?)').bind(owner,id,date,'独立条件重放事项',stamp,stamp,note).run();
  async function state(){
    const value={revision:(await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision};
    for(const name of ['audit','idempotency'])value[name]=(await app.db.prepare('SELECT count(*) AS n FROM matrix_'+name).first()).n;
    for(const name of ['todos','todo_templates','todo_template_links'])value[name+'_sha256']=sha(JSON.stringify((await app.db.prepare('SELECT * FROM matrix_'+name+' ORDER BY rowid').all()).results));
    return value;
  }
  async function request(name,path,body,unchanged){
    const before=await state(),bodyJson=JSON.stringify(body);
    const response=await worker.fetch(new Request(app.origin+path,{method:'PATCH',headers:{Origin:app.origin,Cookie:session.cookie,'X-CSRF-Token':session.csrfToken,'Content-Type':'application/json'},body:bodyJson}),{DB:app.db,SITE_ORIGIN:app.origin});
    const responseJson=await response.text(),after=await state();assert.equal(response.status,200,name+' '+responseJson);
    if(unchanged)assert.deepEqual(after,before);
    samples.push({name,method:'PATCH',path,auth_kind:'owner',public_mode:'0',source_runtime_id:runtimeId,body_json:bodyJson,status:200,response_json:responseJson,before,after,expected_no_change:unchanged});
    return JSON.parse(responseJson).data;
  }
  const completed=await request('concurrent-completion-before-note-replay','/api/v1/todos/'+id,{version:1,completed:true},false);
  assert.equal(completed.version,2);assert.equal(completed.note,note);assert.equal(completed.completed,true);
  checks.push('independent same-resource completion advances version while preserving an already matching note');
  const replay=await request('note-replay-after-other-write','/api/v1/todos/'+id+'/note',{note,version:1},true);
  assert.deepEqual(replay,completed);
  checks.push('real conditional note replay may return completion changed by another valid write, without another commit');
  return {id,samples,checks};
}
