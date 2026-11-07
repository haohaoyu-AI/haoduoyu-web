// Exact reviewed candidate Worker -> temporary D1; no production or desktop product writes.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const sourceCommit='34bff302e128c92f46f00e76d59f9b44b9b7242e';
const [fixtureDirectory,outputPath]=process.argv.slice(2);
if(!fixtureDirectory||!outputPath)throw new Error('Usage: node generate-template-archive-contract.mjs <isolated-candidate-worktree> <output.json>');
const root=resolve(fixtureDirectory),sha=value=>createHash('sha256').update(value).digest('hex');
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceCommit);
assert.equal(execFileSync('git',['diff','--name-only'],{cwd:root,encoding:'utf8'}).trim(),'','candidate tracked source must remain unchanged');
const {fixture,PASSWORD}=await import(pathToFileURL(resolve(root,'tests/harness.mjs')));
const {default:worker}=await import(pathToFileURL(resolve(root,'dist/server/index.js')));
const app=await fixture(),originalFetch=globalThis.fetch;let externalFetchAttempts=0,publicRequests=0,publicWrites=0;
globalThis.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){externalFetchAttempts++;throw new Error('External fetch disabled in synthetic template archive contract');}
  return originalFetch(input,options);
};
try {
  const ownerSession=await app.login(),owner=(await app.request('/api/v1/auth/me',{session:ownerSession})).data.id;
  // Same normal synthetic-user setup used by official tests, then a real login;
  // no fabricated cookie, authentication override or modified permission logic.
  const other=randomUUID(),otherUsername='synthetic-other-'+other;
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) SELECT ?,?,password_hash,created_at FROM matrix_users WHERE id=?')
    .bind(other,otherUsername,owner).run();
  const otherLogin=await app.request('/api/v1/auth/login',{method:'POST',body:{username:otherUsername,password:PASSWORD}});
  assert.equal(otherLogin.status,200);
  const otherSession={cookie:otherLogin.headers.get('set-cookie').split(';')[0],csrfToken:otherLogin.data.csrfToken};
  const key=await app.request('/api/v1/api-keys',{method:'POST',session:ownerSession,
    body:{name:'synthetic template archive denial',account_ids:['toutiao-haoduoyu'],permissions:['read','write']}});
  assert.equal(key.status,201);const keyToken=key.data.token;
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,
    PUBLIC_BUSINESS_ACCOUNT_IDS:'["toutiao-haoduoyu"]',DAILY_NOTES_OWNER_ID:owner,MEMOS_OWNER_ID:owner};
  const ids={template:randomUUID(),keep_active:randomUUID(),todo:randomUUID(),public_template:randomUUID(),deleted_template:randomUUID(),other_template:randomUUID()};
  const base='/api/v1/todo-templates',samples=[],checks=[];
  async function counters() {
    const state={revision:(await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision};
    for(const name of ['audit','idempotency'])state[name]=(await app.db.prepare('SELECT count(*) AS n FROM matrix_'+name).first()).n;
    for(const name of ['todo_templates','todos','todo_template_links'])state[name+'_sha256']=sha(JSON.stringify((await app.db.prepare('SELECT * FROM matrix_'+name+' ORDER BY rowid').all()).results));
    return state;
  }
  async function call(name,method,path,body,{status=200,auth='owner',csrf=true,origin=app.origin,publicHeader=true,mode='1',unchanged=false,deliveryLoss=false}={}) {
    const headers=new Headers({Origin:origin});
    const session=auth==='owner'?ownerSession:auth==='other'?otherSession:null;
    if(session){headers.set('Cookie',session.cookie);if(csrf)headers.set('X-CSRF-Token',session.csrfToken);}
    if(auth==='key'||auth==='key-and-owner')headers.set('Authorization','Bearer '+keyToken);
    if(auth==='key-and-owner'){headers.set('Cookie',ownerSession.cookie);headers.set('X-CSRF-Token',ownerSession.csrfToken);}
    if(auth==='public'){
      publicRequests++;if(method!=='GET')publicWrites++;
      assert.ok(publicRequests<60&&publicWrites<20,'do not alter or exhaust the normal public limiter');
      if(publicHeader)headers.set('X-Public-Business','1');
    }
    const bodyJson=body===undefined?undefined:JSON.stringify(body);
    if(body!==undefined)headers.set('Content-Type','application/json');
    const before=await counters();
    const response=await worker.fetch(new Request(app.origin+path,{method,headers,body:bodyJson}),{...env,PUBLIC_BUSINESS_MODE:mode});
    const responseJson=await response.text(),after=await counters();
    assert.equal(response.status,status,name+' returned '+responseJson.slice(0,400));
    if(unchanged||status>=400||method==='GET')assert.deepEqual(after,before,name+' unexpectedly changed synthetic revision/audit/receipt/business rows');
    samples.push({name,method,path,auth_kind:auth,public_mode:mode,...(body===undefined?{}:{body_json:bodyJson}),status:response.status,response_json:responseJson,
      before,after,expected_no_change:unchanged||status>=400||method==='GET',...(deliveryLoss?{simulated_response_not_delivered_to_caller:true}:{})});
    return JSON.parse(responseJson).data;
  }
  const verify=(condition,name)=>{assert.ok(condition,name);checks.push(name);};
  const initial=await call('owner-empty-active','GET',base);const date=initial.today;
  await call('owner-archived-before','GET',base+'?archived=1');
  await call('owner-create-template','POST',base,{id:ids.template,text:'合成归档模板 🐟'},{status:201});
  await call('owner-create-keep-active','POST',base,{id:ids.keep_active,text:'合成保留活动模板'},{status:201});
  const todo=await call('owner-create-linked-history','POST','/api/v1/todos',{id:ids.todo,date,text:'必须保留的合成历史正文',template_id:ids.template},{status:201});
  await call('owner-complete-linked-history','PATCH','/api/v1/todos/'+ids.todo,{version:1,completed:true});
  const originalHistory=await app.db.prepare('SELECT * FROM matrix_todos WHERE user_id=? AND id=?').bind(owner,ids.todo).first();
  await call('owner-active-before','GET',base);
  const archived=await call('owner-archive-v1','POST',base+'/'+ids.template+'/archive',{version:1});
  verify(archived.version===2&&typeof archived.archived_at==='string'&&!Object.hasOwn(archived,'deleted_at'),'archive returns full version+1 and explicit archived stamp, no deleted_at');
  await call('owner-archive-noop-old-v1','POST',base+'/'+ids.template+'/archive',{version:1},{unchanged:true});
  await call('owner-archive-noop-current-v2','POST',base+'/'+ids.template+'/archive',{version:2},{unchanged:true});
  const active=await call('owner-active-after-archive','GET',base),archiveList=await call('owner-archived-after-archive','GET',base+'?archived=1');
  verify(!active.items.some(row=>row.id===ids.template)&&archiveList.items.some(row=>row.id===ids.template),'active and archive lists are separate complete memberships');
  await call('owner-paired-active','GET',base);await call('owner-paired-archived','GET',base+'?archived=1');
  const history=await call('owner-history-after-archive','GET','/api/v1/todos?date='+date);
  verify(history.items.find(row=>row.id===ids.todo).template_active===false&&history.items.find(row=>row.id===ids.todo).text===todo.text,'archived link remains readable as inactive history');
  assert.deepEqual(await app.db.prepare('SELECT * FROM matrix_todos WHERE user_id=? AND id=?').bind(owner,ids.todo).first(),originalHistory);
  verify((await app.db.prepare('SELECT count(*) AS n FROM matrix_todo_template_links WHERE user_id=? AND todo_id=?').bind(owner,ids.todo).first()).n===1,'archive preserves original history row and database link');
  const snapshot=await call('owner-daily-snapshot-excludes-archive','GET','/api/v1/snapshot?notes=all&date='+date);
  verify(!snapshot.data.templates.some(row=>row.id===ids.template)&&snapshot.data.templates.some(row=>row.id===ids.keep_active)&&snapshot.data.todos.some(row=>row.id===ids.todo),'ordinary daily snapshot excludes archived template while retaining active template and history');
  verify((await app.db.prepare('SELECT deleted_at FROM matrix_todo_templates WHERE user_id=? AND id=?').bind(owner,ids.template).first()).deleted_at===null,'snapshot absence and archive are not deletion');
  await call('archived-forbids-new-linked-todo','POST','/api/v1/todos',{id:randomUUID(),date,text:'不应创建',template_id:ids.template},{status:404});
  await call('archived-forbids-existing-link-readd','POST','/api/v1/todos/'+ids.todo+'/template',{date,version:2,template_id:ids.template,template_version:2},{status:409});
  await call('opposite-state-stale-restore-v1','POST',base+'/'+ids.template+'/restore',{version:1},{status:409});
  const restored=await call('owner-restore-v2','POST',base+'/'+ids.template+'/restore',{version:2});
  verify(restored.version===3&&restored.archived_at===null&&!Object.hasOwn(restored,'deleted_at'),'restore returns version+1 and explicit archived_at null, no deleted_at');
  await call('owner-restore-noop-old-v2','POST',base+'/'+ids.template+'/restore',{version:2},{unchanged:true});
  await call('owner-restore-noop-current-v3','POST',base+'/'+ids.template+'/restore',{version:3},{unchanged:true});
  await call('owner-active-after-restore','GET',base);
  await call('owner-archived-after-restore','GET',base+'?archived=1');
  await call('owner-stale-archive-v1','POST',base+'/'+ids.template+'/archive',{version:1},{status:409});
  await call('same-state-more-than-one-version-old','POST',base+'/'+ids.template+'/restore',{version:1},{status:409});
  await call('restored-template-allows-new-linked-todo','POST','/api/v1/todos',{id:randomUUID(),date,text:'恢复后允许新建',template_id:ids.template},{status:201});
  const unknownOperation={operation_id:randomUUID(),method:'POST',path:base+'/'+ids.template+'/archive',body_json:'{"version":3}',status:'Unknown',retries:0,
    explanation:'Harness captures a successful response but deliberately withholds it from a simulated caller. This is a delivery-loss simulation, not a real network failure or a source receipt.'};
  await call('unknown-archive-v3-simulated-response-loss','POST',unknownOperation.path,{version:3},{deliveryLoss:true});
  const unknownActive=await call('unknown-active','GET',base),unknownArchived=await call('unknown-archived','GET',base+'?archived=1');
  verify(!unknownActive.items.some(row=>row.id===ids.template)&&unknownArchived.items.some(row=>row.id===ids.template&&row.version===4),'Unknown read-only investigation needs both active and archived lists; active absence cannot mean deletion');
  verify(unknownOperation.status==='Unknown'&&unknownOperation.retries===0&&unknownOperation.body_json==='{"version":3}','matching current state is not an exact-operation receipt and does not confirm or resend Unknown');
  await call('owner-restore-after-unknown-investigation','POST',base+'/'+ids.template+'/restore',{version:4});
  for(const action of ['archive','restore']) {
    for(const [label,value] of [['zero',0],['negative',-1],['fraction',1.5],['string','5'],['null',null],['max-safe',Number.MAX_SAFE_INTEGER],['unsafe',Number.MAX_SAFE_INTEGER+1]])
      await call(action+'-invalid-version-'+label,'POST',base+'/'+ids.template+'/'+action,{version:value},{status:400});
    for(const [label,body] of [['missing',{}],['extra-save-id',{version:5,save_id:randomUUID()}],['extra-text',{version:5,text:'不应接受'}]])
      await call(action+'-invalid-body-'+label,'POST',base+'/'+ids.template+'/'+action,body,{status:400});
  }
  await call('version-max-safe-minus-one-is-valid-but-stale','POST',base+'/'+ids.template+'/archive',{version:Number.MAX_SAFE_INTEGER-1},{status:409});
  for(const [name,path] of [['archived-zero',base+'?archived=0'],['archived-true',base+'?archived=true'],['archived-duplicate',base+'?archived=1&archived=1'],['query-extra-owner',base+'?archived=1&user_id=other']])
    await call(name,'GET',path,undefined,{status:400});
  await call('archive-query-forbidden','POST',base+'/'+ids.template+'/archive?archived=1',{version:5},{status:400});
  await call('archive-invalid-uuid','POST',base+'/00000000-0000-0000-0000-000000000000/archive',{version:5},{status:400});
  await call('owner-create-deleted-template','POST',base,{id:ids.deleted_template,text:'合成软删模板'},{status:201});
  await call('owner-soft-delete-retains-legacy-meaning','DELETE',base+'/'+ids.deleted_template,{version:1});
  await call('deleted-template-cannot-archive-restore','POST',base+'/'+ids.deleted_template+'/restore',{version:2},{status:404});
  const concurrentBefore=await counters();
  const raced=await Promise.all([call('concurrent-archive-a','POST',base+'/'+ids.template+'/archive',{version:5}),call('concurrent-archive-b','POST',base+'/'+ids.template+'/archive',{version:5})]);
  const concurrentAfter=await counters();
  verify(raced.every(row=>row.version===6&&row.archived_at===raced[0].archived_at)&&concurrentAfter.revision===concurrentBefore.revision+1,'concurrent identical archives commit exactly once then return same-status replay');
  await call('concurrent-final-active','GET',base);await call('concurrent-final-archived','GET',base+'?archived=1');
  await call('other-private-active-does-not-leak-owner','GET',base,undefined,{auth:'other'});
  await call('other-private-archived-does-not-leak-owner','GET',base+'?archived=1',undefined,{auth:'other'});
  for(const action of ['archive','restore'])await call('other-private-cannot-'+action+'-owner','POST',base+'/'+ids.template+'/'+action,{version:6},{auth:'other',status:404});
  await call('other-private-cannot-link-owner-template','POST','/api/v1/todos',{id:randomUUID(),date,text:'跨用户不得关联',template_id:ids.keep_active},{auth:'other',status:404});
  await call('other-create-private-template','POST',base,{id:ids.other_template,text:'SYNTHETIC-OTHER-PRIVATE-TEMPLATE'},{auth:'other',status:201});
  for(const [name,auth,csrf,origin] of [['owner-missing-csrf','owner',false,app.origin],['owner-foreign-origin','owner',true,'https://foreign.invalid'],['key-not-admin','key',true,app.origin],['key-with-session-not-admin','key-and-owner',true,app.origin]])
    await call(name,'POST',base+'/'+ids.template+'/restore',{version:6},{auth,csrf,origin,status:403});
  await call('key-cannot-list-private-archive','GET',base+'?archived=1',undefined,{auth:'key',status:403});
  await call('anonymous-private-mode-cannot-write','POST',base+'/'+ids.template+'/restore',{version:6},{auth:'anonymous',mode:'0',status:401});
  await call('public-cannot-archive-private-other-owner','POST',base+'/'+ids.other_template+'/archive',{version:1},{auth:'public',status:404});
  await call('public-create-template','POST',base,{id:ids.public_template,text:'合成公开模板'},{auth:'public',status:201});
  await call('public-exact-origin-required','POST',base+'/'+ids.public_template+'/archive',{version:1},{auth:'public',origin:'https://foreign.invalid',status:403});
  await call('public-explicit-header-required','POST',base+'/'+ids.public_template+'/archive',{version:1},{auth:'public',publicHeader:false,status:403});
  await call('public-archive-v1','POST',base+'/'+ids.public_template+'/archive',{version:1},{auth:'public'});
  const publicActive=await call('public-active-membership','GET',base,undefined,{auth:'public'}),publicArchived=await call('public-archived-membership','GET',base+'?archived=1',undefined,{auth:'public'});
  verify(![...publicActive.items,...publicArchived.items].some(row=>row.id===ids.other_template),'public list membership does not disclose another private owner');
  await call('public-restore-v2','POST',base+'/'+ids.public_template+'/restore',{version:2},{auth:'public'});
  await call('public-stale-version-conflict','POST',base+'/'+ids.public_template+'/archive',{version:1},{auth:'public',status:409});
  await call('public-disabled-mode-does-not-grant-write','POST',base+'/'+ids.public_template+'/archive',{version:3},{auth:'public',mode:'0',status:401});
  const finalActive=await call('final-owner-active','GET',base),finalArchived=await call('final-owner-archived','GET',base+'?archived=1');
  verify(finalActive.items.some(row=>row.id===ids.keep_active)&&finalArchived.items.some(row=>row.id===ids.template),'simultaneous final active and archived collections retain distinct UUIDs');
  assert.deepEqual(await app.db.prepare('SELECT * FROM matrix_todos WHERE user_id=? AND id=?').bind(owner,ids.todo).first(),originalHistory);
  verify(externalFetchAttempts===0,'all synthetic runtimes made zero external fetch attempts');
  const sourceHashes={};
  for(const name of ['src/todo-templates.mjs','src/todos.mjs','src/business-access.mjs','src/public-business.mjs','src/storage.mjs','src/business-snapshot.mjs','src/snapshot-projection.mjs','drizzle/0019_todo_notes_archives.sql','public/openapi.json','package-lock.json','dist/server/index.js'])
    sourceHashes[name]=sha(await readFile(resolve(root,name)));
  await mkdir(dirname(resolve(outputPath)),{recursive:true});
  await writeFile(resolve(outputPath),JSON.stringify({source_commit:sourceCommit,synthetic_only:true,production_business_requests:0,external_fetch_attempts:0,
    generated_at:new Date().toISOString(),source_hashes:sourceHashes,ids,date,samples,checks,unknown_operation:unknownOperation,
    concurrent_archive:{before:concurrentBefore,after:concurrentAfter,responses:2,commits:1},public_requests:publicRequests,public_write_attempts:publicWrites,
    fixture:'Exact reviewed candidate compiled Worker.fetch and temporary Miniflare D1 via official harness. Synthetic user setup plus normal logins/key issuance; credentials never captured. Existing permissions/constraints/limiter/clock unchanged; no production requests or resource deployment. Counters record source state changes, replays and denials; both membership reads are independent GET observations, not an exact-operation receipt. Runtime disposed.'},null,2)+'\n');
  console.log(`Generated ${samples.length} exact candidate Worker requests, ${checks.length} source semantic checks; archive/restore no-op+CAS, membership/history/snapshot, private/public permission denials, zero external fetch attempts; temporary D1 only.`);
} finally {globalThis.fetch=originalFetch;await app.mf.dispose();}
