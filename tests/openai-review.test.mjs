import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleOpenaiReview} from '../src/openai-review.mjs';
import {runReviewProvider} from '../src/openai-review-provider.mjs';
import {captureReviewSources,buildReviewInput,evidenceFromCapture} from '../src/openai-review-data.mjs';
import {storeFor} from '../src/storage.mjs';
import {digest,csrfFor} from '../src/security.mjs';

const providerResponse=(report='本次报告',summary='累计历史结论',extra={})=>Response.json({id:'resp_synthetic',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({report_markdown:report,cumulative_summary:summary,pending_verification:['internal-only-pending-canary']})}]}],...extra});
function fixture(t) {
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');t.after(()=>sql.close());
  const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  for(const {tag} of journal.entries)for(const statement of readFileSync(new URL('../drizzle/'+tag+'.sql',import.meta.url),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))sql.exec(statement);
  let tail=Promise.resolve(),conflict=false;
  const db={prepare(text){let values=[];return {bind(...args){values=args;return this;},async first(){return sql.prepare(text).get(...values)||null;},async all(){return {results:sql.prepare(text).all(...values)};},async run(){const result=sql.prepare(text).run(...values);return {meta:{changes:Number(result.changes)}};}};},async batch(statements){const run=tail.then(async()=>{if(conflict){conflict=false;sql.exec('UPDATE matrix_control SET revision=revision+1');}sql.exec('BEGIN');try{for(const s of statements)await s.run();sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}});tail=run.catch(()=>{});return run;}};
  const owner=randomUUID(),token=randomBytes(32).toString('hex'),origin='http://localhost';let at=Date.parse('2026-11-07T15:59:00.000Z');
  sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'owner','synthetic',new Date().toISOString());
  sql.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(token),owner,new Date(Date.now()+3600000).toISOString());sql.exec('INSERT INTO matrix_control(id,initialized) VALUES(1,1)');
  const secret='synthetic-private-provider-secret-value',env={DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1',OPENAI_API_KEY:secret,OPENAI_REVIEW_MODEL:'gpt-test-model'},auth={Origin:origin,Cookie:'matrix_session='+token,'X-CSRF-Token':csrfFor(token)};
  let provider=async()=>providerResponse();const requests=[];
  const request=async(url,init)=>{requests.push({url,init,body:JSON.parse(init.body)});return provider(url,init);};
  async function call(path,method='GET',data,headers=auth,settings=env) {
    const h=new Headers(headers);if(data!==undefined)h.set('Content-Type','application/json');
    const req=new Request(origin+'/api/v1/openai-review/'+path,{method,headers:h,body:data===undefined?undefined:JSON.stringify(data)});
    try {const res=await handleOpenaiReview(db,req,new URL(req.url).pathname.slice('/api/v1'.length),settings,origin,undefined,{request,clock:()=>at});return {status:res.status,...await res.json()};}
    catch(error){if(!error.status)throw error;return {status:error.status,error:{code:error.code,message:error.message}};}
  }
  const article=(title='Article',account='V字',uid=owner)=>{const id=randomUUID();sql.prepare('INSERT INTO matrix_review_articles(user_id,id,account,title,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(uid,id,account,title,'2026-11-07',new Date(at).toISOString(),new Date(at).toISOString());return id;};
  const snapshot=(article_id,reads=100,age_hours=24)=>{const id=randomUUID();sql.prepare('INSERT INTO matrix_review_snapshots(user_id,id,article_id,snapshot_date,reads,age_hours) VALUES(?,?,?,?,?,?)').run(owner,id,article_id,'2026-11-07',reads,age_hours);return id;};
  return {sql,db,owner,env,auth,secret,call,article,snapshot,requests,provider:fn=>{provider=fn;},advance:ms=>{at+=ms;},conflict:()=>{conflict=true;}};
}
const start=(app,id=randomUUID(),mode='incremental')=>app.call('runs','POST',{run_id:id,mode});

test('owner session only: public mode, other owners, explicit auth headers and CSRF cannot grant paid access',async t=>{
  const app=fixture(t),a=app.article();app.snapshot(a);
  for(const headers of [{},{Origin:'http://localhost','X-Public-Business':'1'},{Cookie:'matrix_session=invalid'}, {...app.auth,Authorization:''},{...app.auth,Authorization:'Bearer hdy_'+randomBytes(32).toString('hex')}]){
    assert.ok([401,403].includes((await app.call('config','GET',undefined,headers)).status));
    assert.ok([401,403].includes((await app.call('runs','POST',{run_id:randomUUID(),mode:'incremental'},headers)).status));
  }
  assert.equal((await app.call('runs','POST',{run_id:randomUUID(),mode:'full'},{...app.auth,'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await app.call('runs','POST',{run_id:randomUUID(),mode:'full'},{...app.auth,Origin:'https://wrong.invalid'})).status,403);
  const other=randomUUID(),token=randomBytes(32).toString('hex');app.sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(other,'other','x',new Date().toISOString());app.sql.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(token),other,new Date(Date.now()+60000).toISOString());
  assert.equal((await app.call('config','GET',undefined,{Cookie:'matrix_session='+token})).status,403);
  assert.equal(app.requests.length,0);
});

test('editable complete prompt optimistic version and honest readiness; exact saved text/version pinned',async t=>{
  const app=fixture(t);app.article();
  const initial=(await app.call('config')).data;assert.equal(initial.version,0);assert.equal(initial.configured,true);assert.equal(initial.connectivity,'untested');assert.equal(initial.last_success_at,null);assert.match(initial.instructions,/全文/);
  for(const env of [{...app.env,OPENAI_API_KEY:undefined},{...app.env,OPENAI_REVIEW_MODEL:undefined}])assert.equal((await app.call('config','GET',undefined,app.auth,env)).data.configured,false);
  assert.equal((await app.call('config','PATCH',{instructions:app.secret,version:0})).status,400);
  assert.equal((await app.call('config','PATCH',{instructions:'x'.repeat(32769),version:0})).status,400);
  const saved=await app.call('config','PATCH',{instructions:'完整自定义指令\n保留历史判断',version:0});assert.equal(saved.data.version,1);
  assert.equal((await app.call('config','PATCH',{instructions:'stale',version:0})).status,409);
  const result=await start(app);assert.equal(result.data.status,'succeeded');
  const row=app.sql.prepare('SELECT * FROM matrix_openai_review_runs').get();assert.equal(row.instructions,saved.data.instructions);assert.equal(row.instruction_version,1);assert.equal(app.requests[0].body.input[0].content,saved.data.instructions);
  const config=(await app.call('config')).data;assert.equal(config.connectivity,'untested');assert.ok(config.last_success_at);
  assert.ok(!JSON.stringify(result).includes('pending'));assert.ok(!JSON.stringify(result).includes('cumulative_summary'));assert.ok(!JSON.stringify(row).includes(app.secret));
  assert.equal(app.requests[0].url,'https://api.openai.com/v1/responses');assert.equal(app.requests[0].body.store,false);assert.equal(app.requests[0].init.redirect,'error');
});

test('baseline includes every scoped article/snapshot; increment uses cumulative summary plus changed/deleted rows',async t=>{
  const app=fixture(t),first=app.article('First title'),second=app.article('Second title'),s1=app.snapshot(first,100),s2=app.snapshot(second,200);app.article('Foreign account canary','Other');
  app.sql.exec('ALTER TABLE matrix_review_articles ADD credential_metadata text');app.sql.prepare('UPDATE matrix_review_articles SET source_chat=?,credential_metadata=? WHERE id=?').run('source-chat-private-canary','extra-column-private-canary',first);
  app.conflict();const one=await start(app);assert.equal(one.status,201);assert.equal(one.data.mode,'full');assert.equal(one.data.baseline_run_id,null);assert.equal(app.requests.length,1);
  const initial=JSON.parse(app.requests[0].body.input[1].content);assert.equal(initial.changes.articles.upserted.length,2);assert.equal(initial.changes.snapshots.upserted.length,2);assert.equal(initial.whole_history.source_counts.articles,2);assert.equal(initial.whole_history.latest_snapshot_totals.reads.sum,300);assert.equal(initial.whole_history.definitions.full_text_available,false);
  for(const canary of ['Foreign account canary','source-chat-private-canary','extra-column-private-canary'])assert.ok(!JSON.stringify(initial).includes(canary));
  app.advance(31000);app.sql.prepare('UPDATE matrix_review_snapshots SET reads=150 WHERE id=?').run(s1);app.sql.prepare('DELETE FROM matrix_review_snapshots WHERE id=?').run(s2);const added=app.article('Third title');
  const two=await start(app);assert.equal(two.data.status,'succeeded');assert.equal(two.data.mode,'incremental');assert.equal(two.data.baseline_run_id,one.data.id);
  const delta=JSON.parse(app.requests[1].body.input[1].content);assert.equal(delta.cumulative_summary.cumulative_summary,'累计历史结论');assert.deepEqual(delta.changes.articles.upserted.map(a=>a.id),[added]);assert.equal(delta.changes.snapshots.upserted[0].reads,150);assert.deepEqual(delta.changes.snapshots.deleted,[s2]);assert.equal(delta.snapshot_article_context[0].id,first);assert.equal(delta.whole_history.source_counts.articles,3);
  app.advance(31000);app.sql.prepare('DELETE FROM matrix_review_articles WHERE id=?').run(second);const third=await start(app);assert.equal(third.data.status,'succeeded');assert.deepEqual(JSON.parse(app.requests[2].body.input[1].content).changes.articles.deleted,[second]);
  app.advance(31000);const full=await start(app,randomUUID(),'full');assert.equal(full.data.mode,'full');assert.equal(JSON.parse(app.requests[3].body.input[1].content).changes.articles.upserted.length,2);
});

test('duplicate run IDs and simultaneous clicks never call provider twice; exact conflict includes active ID',async t=>{
  const app=fixture(t);app.article();let unblock,entered;const began=new Promise(resolve=>{entered=resolve;});const blocked=new Promise(resolve=>{unblock=resolve;});app.provider(async()=>{entered();await blocked;return providerResponse();});
  const id=randomUUID(),first=start(app,id);await began;
  const same=await start(app,id);assert.equal(same.status,202);assert.equal(same.data.id,id);
  const other=await start(app);assert.equal(other.status,409);assert.equal(other.error.run_id,id);
  assert.equal((await start(app,id,'full')).error.code,'IDEMPOTENCY_CONFLICT');unblock();await first;
  assert.equal((await start(app,id)).data.status,'succeeded');assert.equal(app.requests.length,1);assert.equal(app.sql.prepare('SELECT count(*) n FROM matrix_openai_review_runs').get().n,1);
});

test('provider failure never advances checkpoint; timeouts stay locked and explicit release does not retry',async t=>{
  const app=fixture(t);app.article();const first=await start(app);app.advance(31000);
  app.provider(async()=>new Response('provider detail must not be exposed '+app.secret,{status:401}));const failed=await start(app);assert.equal(failed.data.status,'failed');assert.ok(!JSON.stringify(failed).includes(app.secret));app.advance(31000);
  app.provider(async()=>{throw new Error('timeout '+app.secret);});const uncertain=await start(app);assert.equal(uncertain.data.status,'uncertain');assert.equal((await start(app)).error.run_id,uncertain.data.id);
  const count=app.requests.length;assert.equal((await app.call('runs/'+uncertain.data.id)).data.status,'uncertain');assert.equal(app.requests.length,count);
  assert.equal((await app.call('runs/'+uncertain.data.id+'/release','POST',{})).status,400);
  const released=await app.call('runs/'+uncertain.data.id+'/release','POST',{acknowledgement:'provider_outcome_unknown_no_automatic_retry'});assert.ok(released.data.released_at);assert.equal(released.data.status,'uncertain');assert.equal(app.requests.length,count);
  app.advance(31000);app.provider(async()=>providerResponse());const next=await start(app);assert.equal(next.data.status,'succeeded');assert.equal(JSON.parse(app.requests.at(-1).body.input[1].content).baseline_run_id,first.data.id);
  assert.equal((await app.call('runs/'+first.data.id+'/release','POST',{acknowledgement:'provider_outcome_unknown_no_automatic_retry'})).status,409);
});

test('stale interrupted run recovers by read only, release fences late output and allows explicit new click',async t=>{
  const app=fixture(t);app.article();let unblock,entered;const began=new Promise(resolve=>{entered=resolve;});const blocked=new Promise(resolve=>{unblock=resolve;});app.provider(async()=>{entered();await blocked;return providerResponse();});const id=randomUUID(),pending=start(app,id);await began;
  app.advance(300001);assert.equal((await app.call('runs/'+id)).data.status,'uncertain');assert.equal(app.requests.length,1);
  const release=await app.call('runs/'+id+'/release','POST',{acknowledgement:'provider_outcome_unknown_no_automatic_retry'});assert.equal(release.data.status,'uncertain');unblock();const late=await pending;assert.equal(late.data.status,'uncertain');assert.equal(late.data.report_markdown,'');assert.equal(app.sql.prepare('SELECT count(*) n FROM matrix_openai_review_runs WHERE status=\'succeeded\'').get().n,0);
});

test('Beijing days retain multiple append-only runs; pagination and malformed parameters are bounded',async t=>{
  const app=fixture(t);app.article();await start(app);app.advance(31000);await start(app);app.advance(31000);await start(app);
  assert.equal((await app.call('runs?date=2026-11-07')).data.items.length,2);assert.equal((await app.call('runs?date=2026-11-08')).data.items.length,1);assert.equal((await app.call('runs?offset=1')).data.items.length,2);
  for(const query of ['date=2026-02-30','date=2026-11-07&date=2026-11-08','offset=-1','offset=0&offset=1','account=Other'])assert.equal((await app.call('runs?'+query)).status,400);
  assert.equal((await app.call('runs/'+randomUUID())).status,404);
});

test('no-data, missing env, rate and oversized capture/input reject before provider; all-deletion delta is allowed',async t=>{
  const app=fixture(t);assert.equal((await start(app)).error.code,'OPENAI_REVIEW_NO_DATA');
  const a=app.article();assert.equal((await app.call('runs','POST',{run_id:randomUUID(),mode:'full'},app.auth,{...app.env,OPENAI_REVIEW_MODEL:undefined})).error.code,'OPENAI_REVIEW_NOT_CONFIGURED');assert.equal(app.requests.length,0);
  await start(app);assert.equal((await start(app)).error.code,'OPENAI_REVIEW_RATE_LIMIT');app.advance(31000);app.sql.prepare('DELETE FROM matrix_review_articles WHERE id=?').run(a);const removed=await start(app);assert.equal(removed.data.status,'succeeded');assert.deepEqual(JSON.parse(app.requests.at(-1).body.input[1].content).changes.articles.deleted,[a]);
  app.advance(31000);app.article('x'.repeat(700000));const count=app.requests.length;assert.equal((await start(app)).error.code,'OPENAI_REVIEW_INPUT_LIMIT');assert.equal(app.requests.length,count);
});

test('bounded historical tools replay complete output, scope IDs, and keep historical source evidence available',async t=>{
  const app=fixture(t),id=app.article('History title');app.snapshot(id);await start(app);app.advance(31000);let round=0;
  const reasoning={type:'reasoning',id:'rs_synthetic',summary:[],encrypted_content:'synthetic'};
  app.provider(async()=>++round===1?Response.json({id:'resp_tool',status:'completed',output:[reasoning,{type:'function_call',name:'lookup_review_evidence',call_id:'call_synthetic',arguments:JSON.stringify({source_run_id:null,kind:'articles',ids:[id],query:'',reason:'Verify unchanged evidence',limit:1})}]}):providerResponse('Evidence-backed report','Preserved cumulative summary'));
  const result=await start(app);assert.equal(result.data.status,'succeeded');assert.equal(round,2);const request=app.requests.at(-1).body;
  assert.deepEqual(request.input.find(item=>item.type==='reasoning'),reasoning);const toolOutput=JSON.parse(request.input.find(item=>item.type==='function_call_output').output);assert.equal(toolOutput.items[0].title,'History title');assert.equal(toolOutput.items[0].id,id);
  assert.equal(app.sql.prepare('SELECT provider_calls FROM matrix_openai_review_runs WHERE id=?').get(result.data.id).provider_calls,2);
  const source=await captureReviewSources(storeFor(app.db),app.owner);assert.equal(evidenceFromCapture(source,[],{source_run_id:null,kind:'articles',ids:[randomUUID()],query:'',reason:'lookup',limit:5}).items.length,0);assert.ok(evidenceFromCapture(source,[],{source_run_id:null,kind:'sql',ids:[],query:'SELECT *',reason:'x',limit:100}).error);
});

test('provider output validation fails closed on incomplete JSON, secret echo and unbounded tool calls',async()=>{
  for(const response of [Response.json({status:'incomplete',output:[]}),providerResponse('secret-key-for-test'),Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'not json'}]}]})]) {
    await assert.rejects(runReviewProvider({key:'secret-key-for-test',model:'gpt-test',instructions:'x',input:{},beforeCall:async()=>{},lookup:async()=>{},request:async()=>response}),error=>error.reviewCode==='OPENAI_REVIEW_INVALID_OUTPUT'&&error.uncertain===false);
  }
  let calls=0;await assert.rejects(runReviewProvider({key:'x',model:'gpt-test',instructions:'x',input:{},beforeCall:async()=>{},lookup:async()=>({items:[]}),request:async()=>{calls++;return Response.json({status:'completed',output:[{type:'function_call',name:'lookup_review_evidence',call_id:'x',arguments:JSON.stringify({source_run_id:null,kind:'articles',ids:[],query:'x',reason:'x',limit:1})}]});}}),error=>error.reviewCode==='OPENAI_REVIEW_BUDGET');assert.equal(calls,4);
});


test('unknown UUID cancellation is durable, idempotent and fences delayed original POST without provider calls',async t=>{
  const app=fixture(t);app.article();const id=randomUUID();
  assert.equal((await app.call('runs/'+id)).status,404);
  const ack={acknowledgement:'provider_outcome_unknown_no_automatic_retry'};
  const first=await app.call('runs/'+id+'/release','POST',ack);assert.equal(first.data.status,'failed');assert.ok(first.data.released_at);
  assert.deepEqual((await app.call('runs/'+id+'/release','POST',ack)).data,first.data);
  assert.deepEqual((await start(app,id,'full')).data,first.data);assert.deepEqual((await start(app,id,'incremental')).data,first.data);
  assert.equal(app.requests.length,0);assert.equal((await app.call('runs/'+id)).data.status,'failed');
});


test('historical capture retrieval recovers deleted evidence by explicit successful run id without crossing accounts',async t=>{
  const app=fixture(t),id=app.article('Deleted historical evidence');app.snapshot(id);const baseline=await start(app);app.advance(31000);
  app.sql.prepare('DELETE FROM matrix_review_articles WHERE id=?').run(id);app.article('New live article');let round=0;
  app.provider(async()=>++round===1?Response.json({status:'completed',output:[{type:'function_call',name:'lookup_review_evidence',call_id:'call_history',arguments:JSON.stringify({source_run_id:baseline.data.id,kind:'articles',ids:[id],query:'',reason:'Check deleted historical evidence',limit:1})}]}):providerResponse());
  const result=await start(app);assert.equal(result.data.status,'succeeded');
  const evidence=JSON.parse(app.requests.at(-1).body.input.find(item=>item.type==='function_call_output').output);assert.equal(evidence.source_run_id,baseline.data.id);assert.equal(evidence.items[0].title,'Deleted historical evidence');
  app.advance(31000);round=0;app.provider(async()=>++round===1?Response.json({status:'completed',output:[{type:'function_call',name:'lookup_review_evidence',call_id:'call_foreign',arguments:JSON.stringify({source_run_id:randomUUID(),kind:'articles',ids:[id],query:'',reason:'Check another capture',limit:1})}]}):providerResponse());
  await start(app);assert.ok(JSON.parse(app.requests.at(-1).body.input.find(item=>item.type==='function_call_output').output).error);
});

test('HTTP routing does not expose OpenAI configuration through public-business mode',async t=>{
  const app=fixture(t),worker=(await import('../src/worker.mjs')).default;
  for(const method of ['GET','PATCH']) {
    const request=new Request('http://localhost/api/v1/openai-review/config',{method,headers:{Origin:'http://localhost','Content-Type':'application/json','X-Public-Business':'1'},body:method==='PATCH'?JSON.stringify({instructions:'unauthorized',version:0}):undefined});
    const response=await worker.fetch(request,{...app.env,SITE_ORIGIN:'http://localhost',DB:app.db});assert.equal(response.status,401);assert.ok(response.headers.get('X-Request-Id'));
  }
  assert.equal(app.requests.length,0);
});
