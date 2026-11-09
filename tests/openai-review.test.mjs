import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleOpenaiReview,openaiReviewSettings} from '../src/openai-review.mjs';
import {runReviewProvider} from '../src/openai-review-provider.mjs';
import {safeReviewDiagnostics} from '../src/openai-review-diagnostics.mjs';
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

test('explicit identities stay strict: other owners, bearer headers and invalid CSRF never fall back to public access',async t=>{
  const app=fixture(t),a=app.article();app.snapshot(a);
  for(const headers of [{...app.auth,Authorization:''},{...app.auth,Authorization:'Bearer hdy_'+randomBytes(32).toString('hex')}]){
    assert.ok([401,403].includes((await app.call('config','GET',undefined,headers)).status));
    assert.ok([401,403].includes((await app.call('runs','POST',{run_id:randomUUID(),mode:'incremental'},headers)).status));
  }
  assert.equal((await app.call('runs','POST',{run_id:randomUUID(),mode:'full'},{...app.auth,'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await app.call('runs','POST',{run_id:randomUUID(),mode:'full'},{...app.auth,Origin:'https://wrong.invalid'})).status,403);
  const other=randomUUID(),token=randomBytes(32).toString('hex');app.sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(other,'other','x',new Date().toISOString());app.sql.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(token),other,new Date(Date.now()+60000).toISOString());
  assert.equal((await app.call('config','GET',undefined,{Cookie:'matrix_session='+token})).status,403);
  const foreignHeaders={Origin:'http://localhost','X-Public-Business':'1',Cookie:'matrix_session='+token,'X-CSRF-Token':csrfFor(token)};
  assert.equal((await app.call('config','PATCH',{instructions:'x',version:0},foreignHeaders)).status,403);
  assert.equal((await app.call('runs','POST',{run_id:randomUUID(),mode:'full'},foreignHeaders)).status,403);
  assert.equal((await app.call('runs/'+randomUUID()+'/release','POST',{acknowledgement:'provider_outcome_unknown_no_automatic_retry'},foreignHeaders)).status,403);
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
  assert.equal(app.requests[0].url,'https://api.openai.com/v1/responses');assert.equal(app.requests[0].body.store,false);assert.equal(app.requests[0].init.redirect,'manual');
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
  app.advance(540000);assert.equal((await app.call('runs/'+id)).data.status,'running');
  assert.equal((await app.call('runs/'+id+'/release','POST',{acknowledgement:'provider_outcome_unknown_no_automatic_retry'})).status,409);
  app.advance(59999);assert.equal((await app.call('runs/'+id)).data.status,'running');
  app.advance(1);assert.equal((await app.call('runs/'+id)).data.status,'uncertain');assert.equal(app.requests.length,1);
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
  for(const [response,code] of [[Response.json({status:'incomplete',output:[]}),'OPENAI_REVIEW_PROVIDER_INCOMPLETE'],[providerResponse('secret-key-for-test'),'OPENAI_REVIEW_INVALID_OUTPUT'],[Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'not json'}]}]}),'OPENAI_REVIEW_INVALID_OUTPUT']]) {
    await assert.rejects(runReviewProvider({key:'secret-key-for-test',model:'gpt-test',instructions:'x',input:{},beforeCall:async()=>{},lookup:async()=>{},request:async()=>response}),error=>error.reviewCode===code&&error.uncertain===false);
  }
  let calls=0,lookups=0;const choices=[];
  await assert.rejects(runReviewProvider({key:'x',model:'gpt-test',instructions:'x',input:{},beforeCall:async()=>{},lookup:async()=>{lookups++;return {items:[]};},request:async(_url,init)=>{
    calls++;choices.push(JSON.parse(init.body).tool_choice??'auto');
    // A provider ignoring tool_choice still cannot cause a fourth lookup or a fifth call.
    return Response.json({status:'completed',output:[{type:'function_call',name:'lookup_review_evidence',call_id:'x',arguments:JSON.stringify({source_run_id:null,kind:'articles',ids:[],query:'x',reason:'x',limit:1})}]});
  }}),error=>error.reviewCode==='OPENAI_REVIEW_BUDGET');
  assert.equal(calls,4);assert.equal(lookups,3);assert.deepEqual(choices,['auto','auto','auto','none']);
});

test('three evidence lookups reserve the fourth provider call for a persisted report without increasing limits',async t=>{
  const app=fixture(t),article=app.article('Pinned evidence');app.snapshot(article);
  const runId=randomUUID(),reasoning=[];
  app.provider(async(_url,init)=>{
    const body=JSON.parse(init.body),round=app.requests.length;
    // Model each response taking almost the full per-call allowance. All four
    // rounds must stay live, including the last dispatch after six minutes.
    app.advance(119000);assert.equal((await app.call('runs/'+runId)).data.status,'running');
    assert.equal(body.store,false);assert.equal(body.max_output_tokens,6000);assert.equal(body.parallel_tool_calls,false);
    if(body.tool_choice==='none') {
      assert.equal(round,4);
      assert.match(body.instructions,/final response round/i);
      assert.match(body.instructions,/not claim.*retrieved|not.*claim.*inspected/i);
      assert.deepEqual(body.input.filter(item=>item.type==='reasoning'),reasoning);
      const evidence=body.input.filter(item=>item.type==='function_call_output');
      assert.equal(evidence.length,3);
      for(let i=0;i<evidence.length;i++) {
        assert.equal(evidence[i].call_id,'call_evidence_'+(i+1));
        assert.equal(JSON.parse(evidence[i].output).items[0].id,article);
      }
      return providerResponse('基于已取得的证据；未核查材料保留待验证。','保留既有结论与本次证据');
    }
    const thought={type:'reasoning',id:'rs_evidence_'+round,summary:[],encrypted_content:'synthetic_'+round};
    reasoning.push(thought);
    return Response.json({id:'resp_evidence_'+round,status:'completed',output:[thought,{type:'function_call',name:'lookup_review_evidence',call_id:'call_evidence_'+round,
      arguments:JSON.stringify({source_run_id:null,kind:'articles',ids:[article],query:'',reason:'Check pinned evidence',limit:1})}]});
  });
  const result=await start(app,runId);
  assert.equal(result.data.status,'succeeded');assert.equal(result.data.provider_calls,4);assert.equal(app.requests.length,4);
  assert.deepEqual(result.data.progress.map(event=>[event.stage,event.round??null]),[
    ['source_ready',null],['provider_started',1],['provider_responded',1],['evidence_lookup',1],
    ['provider_started',2],['provider_responded',2],['evidence_lookup',2],
    ['provider_started',3],['provider_responded',3],['evidence_lookup',3],
    ['synthesizing',4],['provider_started',4],['provider_responded',4],['saving_report',null],['completed',null]
  ]);
  assert.equal(result.data.progress[0].article_count,1);assert.equal(result.data.progress[0].record_count,2);
  assert.equal(result.data.progress.at(-1).elapsed_ms,476000);
  assert.deepEqual(app.requests.map(item=>item.body.tool_choice??'auto'),['auto','auto','auto','none']);
  const saved=app.sql.prepare('SELECT report_markdown,summary_json,provider_calls FROM matrix_openai_review_runs WHERE id=?').get(runId);
  assert.equal(saved.report_markdown,result.data.report_markdown);assert.equal(saved.provider_calls,4);
  assert.equal(JSON.parse(saved.summary_json).cumulative_summary,'保留既有结论与本次证据');
  assert.equal((await start(app,runId)).data.status,'succeeded');assert.equal(app.requests.length,4,'idempotent replay never repeats paid calls');
});

test('live progress is read-only, owner/run scoped, redacted and retained on failure',async t=>{
  const app=fixture(t),id=randomUUID();app.article();let entered,unblock;
  const began=new Promise(resolve=>{entered=resolve;}),blocked=new Promise(resolve=>{unblock=resolve;});
  app.provider(async()=>{entered();await blocked;return providerResponse();});
  const pending=start(app,id);await began;
  const live=(await app.call('runs/'+id)).data;
  assert.deepEqual(live.progress.map(event=>event.stage),['source_ready','provider_started']);
  assert.equal(live.progress[1].round,1);assert.equal(app.requests.length,1);
  const source=app.sql.prepare("SELECT id,detail_json FROM matrix_audit WHERE entity_id=? AND action='openai-review.progress' ORDER BY rowid LIMIT 1").get(id);
  app.sql.prepare('UPDATE matrix_audit SET detail_json=? WHERE id=?').run(JSON.stringify({...JSON.parse(source.detail_json),secret:app.secret,prompt:'private-prompt',reasoning:'private-reasoning',article_count:-1}),source.id);
  const put=(actor,entity,detail)=>app.sql.prepare('INSERT INTO matrix_audit(id,actor,action,entity_id,detail_json,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),actor,'openai-review.progress',entity,JSON.stringify(detail),new Date().toISOString());
  const stamp={stage:'completed',at:live.created_at};
  put('openai-review-progress:'+randomUUID(),id,stamp);
  put('openai-review-progress:'+app.owner,randomUUID(),stamp);
  put('openai-review-progress:'+app.owner,id,{stage:'untrusted-'+app.secret,at:live.created_at});
  const safe=(await app.call('runs/'+id)).data.progress;
  assert.deepEqual(safe.map(event=>event.stage),['source_ready','provider_started']);
  assert.equal(Object.hasOwn(safe[0],'article_count'),false);
  for(const canary of [app.secret,'private-prompt','private-reasoning'])assert.ok(!JSON.stringify(safe).includes(canary));
  assert.deepEqual((await app.call('runs')).data.items[0].progress,safe);assert.equal(app.requests.length,1);
  unblock();const done=await pending;assert.equal(done.data.status,'succeeded');assert.equal(done.data.progress.at(-1).stage,'completed');
  app.advance(31000);app.provider(async()=>{throw Error('synthetic transport failure');});
  const failed=await start(app);assert.equal(failed.data.status,'uncertain');
  assert.deepEqual(failed.data.progress.map(event=>event.stage),['source_ready','provider_started']);
  assert.deepEqual((await app.call('runs/'+failed.data.id)).data.progress,failed.data.progress);
  assert.equal(app.requests.length,2);
});

test('progress write failures cannot repeat provider dispatch or discard a valid response',async()=>{
  let calls=0,events=0;
  const output=await runReviewProvider({key:'synthetic-progress-key',model:'gpt-test',instructions:'synthetic',input:{},beforeCall:async()=>{},lookup:async()=>{},
    onProgress:async()=>{events++;throw Error('synthetic progress database failure');},request:async()=>{calls++;return providerResponse();}});
  assert.equal(output.report_markdown,'本次报告');assert.equal(calls,1);assert.equal(events,1);
});

test('a completed-progress read failure still commits the report and summary once',async t=>{
  const app=fixture(t),id=randomUUID();app.article();let failures=0;
  const prepare=app.db.prepare;
  app.db.prepare=text=>{
    const statement=prepare(text);
    if(text.startsWith('SELECT entity_id,detail_json FROM matrix_audit')) {
      const all=statement.all;
      statement.all=async()=>{
        const saving=app.sql.prepare("SELECT count(*) n FROM matrix_audit WHERE entity_id=? AND action='openai-review.progress' AND json_extract(detail_json,'$.stage')='saving_report'").get(id).n;
        const running=app.sql.prepare("SELECT count(*) n FROM matrix_openai_review_runs WHERE id=? AND status='running'").get(id).n;
        if(!failures&&saving&&running){failures++;throw Error('synthetic optional progress read failure');}
        return all();
      };
    }
    return statement;
  };
  const result=await start(app,id);assert.equal(failures,1);assert.equal(result.data.status,'succeeded');
  const saved=app.sql.prepare('SELECT report_markdown,summary_json FROM matrix_openai_review_runs WHERE id=?').get(id);
  assert.equal(saved.report_markdown,'本次报告');assert.equal(JSON.parse(saved.summary_json).cumulative_summary,'累计历史结论');
  assert.equal(app.sql.prepare("SELECT count(*) n FROM matrix_audit WHERE entity_id=? AND action='openai-review.finished'").get(id).n,1);
  assert.equal(result.data.progress.at(-1).stage,'saving_report','a missing observational event is not fabricated');
  assert.equal((await start(app,id)).data.status,'succeeded');assert.equal(app.requests.length,1);
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

test('HTTP routing opens only the requested OpenAI module and never elevates public requests to administration',async t=>{
  const app=fixture(t),worker=(await import('../src/worker.mjs')).default;
  for(const method of ['GET','PATCH']) {
    const request=new Request('http://localhost/api/v1/openai-review/config',{method,headers:{Origin:'http://localhost','Content-Type':'application/json','X-Public-Business':'1'},body:method==='PATCH'?JSON.stringify({instructions:'unauthorized',version:0}):undefined});
    const response=await worker.fetch(request,{...app.env,SITE_ORIGIN:'http://localhost',DB:app.db});assert.equal(response.status,200);assert.ok(response.headers.get('X-Request-Id'));
  }
  for(const [path,method,body] of [['api-keys','GET'],['backup','GET'],['auth/password','PUT',{currentPassword:'x',newPassword:'y'}]]) {
    const request=new Request('http://localhost/api/v1/'+path,{method,headers:{Origin:'http://localhost','Content-Type':'application/json','X-Public-Business':'1'},body:body?JSON.stringify(body):undefined});
    assert.equal((await worker.fetch(request,{...app.env,SITE_ORIGIN:'http://localhost',DB:app.db})).status,401);
  }
  assert.equal(app.requests.length,0);
});


const publicHeaders={Origin:'http://localhost','X-Public-Business':'1'};
const publicStart=(app,id=randomUUID(),mode='incremental',settings=app.env)=>app.call('runs','POST',{run_id:id,mode},publicHeaders,settings);
const releaseAck={acknowledgement:'provider_outcome_unknown_no_automatic_retry'};

test('public mode supports full prompt edit, paid-run mock and safe diary while private mode rejects anonymous access',async t=>{
  const app=fixture(t);app.article('Public authorized V article');app.article('Other account canary','Other');
  const config=await app.call('config','GET',undefined,{});assert.equal(config.status,200);assert.equal(config.data.account,'V字');
  const saved=await app.call('config','PATCH',{instructions:'公开编辑的新完整指令',version:0},publicHeaders);assert.equal(saved.status,200);assert.equal(saved.data.version,1);
  assert.equal((await app.call('config','PATCH',{instructions:'过期版本',version:0},publicHeaders)).error.code,'VERSION_CONFLICT');
  const run=await publicStart(app);assert.equal(run.data.status,'succeeded');assert.equal(run.data.instruction_version,1);assert.equal(app.requests.length,1);
  const list=await app.call('runs','GET',undefined,{}),detail=await app.call('runs/'+run.data.id,'GET',undefined,{});assert.equal(list.data.items.length,1);assert.deepEqual(detail.data,run.data);
  for(const raw of ['source_manifest_json','source_data_json','input_json','summary_json','cumulative_summary','internal-only-pending-canary',app.secret,'Other account canary'])assert.ok(!JSON.stringify(list).includes(raw));
  const evidence=JSON.parse(app.requests[0].body.input[1].content);assert.equal(evidence.changes.articles.upserted.length,1);assert.equal(evidence.changes.articles.upserted[0].title,'Public authorized V article');
  const audits=app.sql.prepare("SELECT actor,action FROM matrix_audit WHERE action LIKE 'openai-review.%'").all();assert.ok(audits.length>=3);
  assert.ok(audits.every(row=>row.actor===(row.action==='openai-review.progress'?'openai-review-progress:':'public-openai-review:')+app.owner));
  const privateEnv={...app.env,PUBLIC_BUSINESS_MODE:'0'};
  for(const path of ['config','runs','runs/'+run.data.id])assert.equal((await app.call(path,'GET',undefined,{},privateEnv)).status,401);
  assert.equal((await app.call('config','PATCH',{instructions:'unauthorized',version:1},publicHeaders,privateEnv)).status,401);
  assert.equal((await publicStart(app,randomUUID(),'incremental',privateEnv)).status,401);
  assert.equal((await app.call('runs/'+randomUUID()+'/release','POST',releaseAck,publicHeaders,privateEnv)).status,401);
  assert.equal((await app.call('config','GET',undefined,app.auth,privateEnv)).status,200);
});

test('every public write requires exact same origin and explicit public header, and missing config never calls provider',async t=>{
  const app=fixture(t);app.article();
  for(const headers of [{},{Origin:'http://localhost'},{'X-Public-Business':'1'},{...publicHeaders,Origin:'https://wrong.invalid'},{...publicHeaders,Origin:'null'},{...publicHeaders,'X-Public-Business':'0'}]) {
    for(const [path,method,body] of [['config','PATCH',{instructions:'x',version:0}],['runs','POST',{run_id:randomUUID(),mode:'full'}],['runs/'+randomUUID()+'/release','POST',releaseAck]])assert.equal((await app.call(path,method,body,headers)).status,403);
  }
  for(const field of ['OPENAI_API_KEY','OPENAI_REVIEW_MODEL']) {
    const env={...app.env,[field]:undefined};assert.equal((await app.call('config','GET',undefined,{},env)).data.configured,false);
    assert.equal((await publicStart(app,randomUUID(),'full',env)).error.code,'OPENAI_REVIEW_NOT_CONFIGURED');
  }
  const key='hdy_'+randomBytes(32).toString('hex');app.sql.prepare('INSERT INTO matrix_api_keys(id,name,token_hash,account_ids_json,permissions_json,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),'business key',digest(key),'[]','["read","write"]',new Date().toISOString());
  for(const path of ['config','runs'])assert.equal((await app.call(path,'GET',undefined,{Authorization:'Bearer '+key})).status,403);
  assert.equal((await app.call('config','PATCH',{instructions:'x',version:0},{...publicHeaders,Authorization:'Bearer '+key})).status,403);
  assert.equal(app.requests.length,0);assert.equal(app.sql.prepare('SELECT count(*) n FROM matrix_openai_review_runs').get().n,0);
});

test('public cancellation has durable daily and interval bounds, idempotent replay, and fences late originals',async t=>{
  const app=fixture(t);app.article();app.advance(3600000);const ids=[];
  for(let i=0;i<20;i++) {
    const id=randomUUID();ids.push(id);const cancelled=await app.call('runs/'+id+'/release','POST',releaseAck,publicHeaders);assert.equal(cancelled.status,200);assert.ok(cancelled.data.released_at);
    assert.deepEqual((await app.call('runs/'+id+'/release','POST',releaseAck,publicHeaders)).data,cancelled.data);
    assert.deepEqual((await publicStart(app,id,'full')).data,cancelled.data);
    if(i===0)assert.equal((await app.call('runs/'+randomUUID()+'/release','POST',releaseAck,publicHeaders)).error.code,'OPENAI_REVIEW_RECOVERY_RATE_LIMIT');
    app.advance(31000);
  }
  const extra=await app.call('runs/'+randomUUID()+'/release','POST',releaseAck,publicHeaders);assert.equal(extra.status,429);assert.equal(extra.error.code,'OPENAI_REVIEW_RECOVERY_RATE_LIMIT');
  assert.equal(app.sql.prepare('SELECT count(*) n FROM matrix_openai_review_runs').get().n,20);assert.equal(app.requests.length,0);
  assert.equal((await publicStart(app)).data.status,'succeeded','unstarted cancellation quota is separate from paid quota');
  assert.equal(app.requests.length,1);
});

test('public release cannot kill an active or successful run; uncertain release and duplicate retries never double-charge',async t=>{
  const app=fixture(t);app.article();let unblock,entered;const began=new Promise(resolve=>{entered=resolve;});const blocked=new Promise(resolve=>{unblock=resolve;});app.provider(async()=>{entered();await blocked;return providerResponse();});
  const id=randomUUID(),pending=publicStart(app,id);await began;
  assert.equal((await app.call('runs/'+id+'/release','POST',releaseAck,publicHeaders)).error.code,'OPENAI_REVIEW_NOT_RELEASABLE');
  assert.equal((await app.call('runs/'+randomUUID()+'/release','POST',releaseAck,publicHeaders)).data.status,'failed');
  assert.equal((await app.call('runs/'+id,'GET',undefined,{})).data.status,'running','cancelling an unrelated unknown UUID never releases another run');
  assert.equal((await publicStart(app,id)).status,202);assert.equal((await publicStart(app)).error.run_id,id);unblock();const complete=await pending;assert.equal(complete.data.status,'succeeded');
  assert.equal((await app.call('runs/'+id+'/release','POST',releaseAck,publicHeaders)).status,409);assert.equal(app.requests.length,1);
  app.advance(31000);app.provider(async()=>{throw Error('lost response');});const unknown=await publicStart(app);assert.equal(unknown.data.status,'uncertain');
  const count=app.requests.length;assert.equal((await app.call('runs/'+unknown.data.id+'/release','POST',releaseAck,publicHeaders)).data.status,'uncertain');
  assert.equal((await publicStart(app,unknown.data.id)).data.status,'uncertain');assert.equal(app.requests.length,count);
});

test('stale run cannot dispatch another provider round even without an explicit release',async t=>{
  const app=fixture(t),id=app.article();app.provider(async()=>{app.advance(600001);return Response.json({status:'completed',output:[{type:'function_call',name:'lookup_review_evidence',call_id:'stale_call',arguments:JSON.stringify({source_run_id:null,kind:'articles',ids:[id],query:'',reason:'history check',limit:1})}]});});
  const run=await publicStart(app);assert.equal(run.data.status,'uncertain');assert.equal(app.requests.length,1);
  assert.equal((await publicStart(app)).error.run_id,run.data.id);
});

test('public paid requests retain persistent twenty-per-day and thirty-second shared quota',async t=>{
  const app=fixture(t);app.article();app.advance(3600000);
  for(let i=0;i<20;i++) {
    const run=await publicStart(app);assert.equal(run.data.status,'succeeded');
    if(i===0)assert.equal((await publicStart(app)).error.code,'OPENAI_REVIEW_RATE_LIMIT');
    app.advance(31000);
  }
  assert.equal((await publicStart(app)).error.code,'OPENAI_REVIEW_RATE_LIMIT');assert.equal(app.requests.length,20);
});


test('expired or malformed cookies recover as anonymous only in public mode, without treating valid foreign identity as anonymous',async t=>{
  const app=fixture(t);app.article();
  const expired=randomBytes(32).toString('hex');app.sql.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(expired),app.owner,'2000-01-01T00:00:00.000Z');
  for(const cookie of ['matrix_session=invalid','matrix_session='+expired]) {
    const headers={...publicHeaders,Cookie:cookie};
    assert.equal((await app.call('config','GET',undefined,headers)).status,200);
    assert.equal((await app.call('runs','POST',{run_id:randomUUID(),mode:'full'},{Cookie:cookie,Origin:'http://localhost'})).status,403);
    assert.equal((await app.call('config','GET',undefined,headers,{...app.env,PUBLIC_BUSINESS_MODE:'0'})).status,401);
  }
  const result=await app.call('runs','POST',{run_id:randomUUID(),mode:'incremental'},{...publicHeaders,Cookie:'matrix_session='+expired});assert.equal(result.data.status,'succeeded');
  const validOwnerWithoutCsrf={...publicHeaders,Cookie:app.auth.Cookie};
  assert.equal((await app.call('config','PATCH',{instructions:'x',version:1},validOwnerWithoutCsrf)).status,403,'valid owner session still needs actual session CSRF, not the public header');
  for(const extra of [{model:'not-allowed'},{api_key:'not-allowed'}])assert.equal((await app.call('config','PATCH',{instructions:'x',version:1,...extra},publicHeaders)).status,400);
});

test('public cancellation atomically fences an original POST still waiting for its request body',async t=>{
  const app=fixture(t);app.article();const id=randomUUID();let controller,calls=0;
  const stream=new ReadableStream({start(value){controller=value;}});
  const req=new Request('http://localhost/api/v1/openai-review/runs',{method:'POST',headers:{...publicHeaders,'Content-Type':'application/json'},body:stream,duplex:'half'});
  const pending=handleOpenaiReview(app.db,req,'/openai-review/runs',app.env,'http://localhost',undefined,{clock:()=>Date.parse('2026-11-07T15:59:00.000Z'),request:async()=>{calls++;return providerResponse();}});
  await new Promise(resolve=>setTimeout(resolve,0));
  const cancelled=await app.call('runs/'+id+'/release','POST',releaseAck,publicHeaders);assert.equal(cancelled.data.status,'failed');
  controller.enqueue(new TextEncoder().encode(JSON.stringify({run_id:id,mode:'full'})));controller.close();
  const result=await (await pending).json();assert.deepEqual(result.data,cancelled.data);assert.equal(calls,0);assert.equal(app.requests.length,0);
});

test('provider diagnostics distinguish preparation, dispatch, transport, body reads and timeouts without raw errors',async()=>{
  const base={key:'synthetic-key',model:'gpt-test',instructions:'x',input:{},lookup:async()=>({}),beforeCall:async()=>{}};
  const canary='RAW_EXCEPTION_MUST_NOT_PERSIST';
  const cases=[
    [{...base,key:'synthetic-key-鱼'},'OPENAI_REVIEW_LOCAL_PREPARATION','prepare_request',false],
    [{...base,beforeCall:async()=>{throw new Error(canary);}},'OPENAI_REVIEW_DISPATCH_UNCONFIRMED','before_dispatch',true],
    [{...base,request:async()=>{throw new TypeError(canary);}},'OPENAI_REVIEW_PROVIDER_CONNECTION','fetch',true],
    [{...base,request:async()=>({ok:true,status:200,headers:new Headers({'x-request-id':'req_body'}),body:{getReader(){return {read:async()=>{throw new Error(canary);},releaseLock(){}};}}})},'OPENAI_REVIEW_PROVIDER_READ','read_body',true],
    [{...base,timeoutMs:5,request:async(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException(canary,'AbortError'))))},'OPENAI_REVIEW_PROVIDER_TIMEOUT','fetch',true],
  ];
  for(const [config,code,phase,uncertain] of cases) {
    let requests=0;
    const request=config.request;
    await assert.rejects(runReviewProvider({...config,request:async(...args)=>{requests++;if(!request)assert.fail('must fail before fetch');return request(...args);}}),error=>{
      assert.equal(error.reviewCode,code);assert.equal(error.uncertain,uncertain);
      assert.equal(error.provider_diagnostics[0].phase,phase);
      assert.ok(!JSON.stringify(error).includes(canary));
      return true;
    });
    assert.equal(requests,['prepare_request','before_dispatch'].includes(phase)?0:1);
  }
});

test('invalid private key characters fail configuration before reservation and are never trimmed or disclosed',async t=>{
  const app=fixture(t);app.article();
  for(const suffix of ['\n','\r',' ','\t','\u0000','\u007f','\u0080','鱼']) {
    const env={...app.env,OPENAI_API_KEY:app.secret+suffix};
    assert.equal(openaiReviewSettings(env).key,null);
    const result=await app.call('runs','POST',{run_id:randomUUID(),mode:'full'},app.auth,env);
    assert.equal(result.error.code,'OPENAI_REVIEW_INVALID_KEY_FORMAT');
    const config=(await app.call('config','GET',undefined,app.auth,env)).data;
    assert.equal(config.configuration_error,'OPENAI_REVIEW_INVALID_KEY_FORMAT');assert.match(config.configuration_error_message,/格式无效/);
    assert.ok(!JSON.stringify([result,config]).includes(app.secret));
  }
  assert.equal(app.requests.length,0);assert.equal(app.sql.prepare('SELECT count(*) n FROM matrix_openai_review_runs').get().n,0);
});

test('failure metadata and received response ID survive incomplete output without advancing checkpoint or leaking to public views',async t=>{
  const app=fixture(t);app.article();
  const usage={input_tokens:123,output_tokens:6000,total_tokens:6123,input_tokens_details:{cached_tokens:12},output_tokens_details:{reasoning_tokens:5900},unapproved:'NEVER_SAVE'};
  app.provider(async()=>Response.json({id:'resp_incomplete',status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage,output:[],secret:'NEVER_SAVE'},
    {headers:{'x-request-id':'req_incomplete','x-private-header':'NEVER_SAVE'}}));
  const result=await start(app),id=result.data.id;
  assert.equal(result.data.status,'failed');assert.equal(result.data.error_code,'OPENAI_REVIEW_PROVIDER_INCOMPLETE');
  assert.match(result.data.error_message,/未完成.*HTTP 200/);
  const row=app.sql.prepare('SELECT * FROM matrix_openai_review_runs WHERE id=?').get(id);
  assert.equal(row.provider_response_id,'resp_incomplete');assert.equal(row.summary_json,null);assert.equal(row.report_markdown,'');
  const audit=JSON.parse(app.sql.prepare("SELECT detail_json FROM matrix_audit WHERE action='openai-review.finished' AND entity_id=?").get(id).detail_json);
  assert.deepEqual(audit.provider_diagnostics,[{round:1,phase:'response_status',timeout:false,http_status:200,request_id:'req_incomplete',response_id:'resp_incomplete',response_status:'incomplete',incomplete_reason:'max_output_tokens',usage:{input_tokens:123,output_tokens:6000,total_tokens:6123,input_tokens_details:{cached_tokens:12},output_tokens_details:{reasoning_tokens:5900}}}]);
  assert.ok(!JSON.stringify(audit).includes('NEVER_SAVE'));
  for(const view of [result,await app.call('runs/'+id),await app.call('runs')]) {
    assert.doesNotMatch(JSON.stringify(view),/req_incomplete|resp_incomplete|provider_diagnostics|reasoning_tokens|NEVER_SAVE/);
  }
  assert.equal(app.requests.length,1);
});

test('later transport failure preserves earlier response metadata and locks the original run without another dispatch',async t=>{
  const app=fixture(t),id=app.article();let rounds=0;
  app.provider(async()=>{
    if(++rounds===2)throw Error('PRIVATE_TRANSPORT_ERROR');
    return Response.json({id:'resp_first_round',status:'completed',usage:{input_tokens:20,output_tokens:40,total_tokens:60},output:[{type:'function_call',name:'lookup_review_evidence',call_id:'call_first',arguments:JSON.stringify({source_run_id:null,kind:'articles',ids:[id],query:'',reason:'Verify',limit:1})}]},{headers:{'x-request-id':'req_first_round'}});
  });
  const result=await start(app),run=result.data;
  assert.equal(run.status,'uncertain');assert.equal(run.error_code,'OPENAI_REVIEW_PROVIDER_CONNECTION');
  assert.match(run.error_message,/连接阶段异常/);
  assert.equal(app.sql.prepare('SELECT provider_response_id FROM matrix_openai_review_runs WHERE id=?').get(run.id).provider_response_id,'resp_first_round');
  const audit=JSON.parse(app.sql.prepare("SELECT detail_json FROM matrix_audit WHERE action='openai-review.finished' AND entity_id=?").get(run.id).detail_json);
  assert.equal(audit.provider_diagnostics.length,2);assert.equal(audit.provider_diagnostics[0].response_id,'resp_first_round');
  assert.equal(audit.provider_diagnostics[1].phase,'fetch');assert.ok(!JSON.stringify(audit).includes('PRIVATE_TRANSPORT_ERROR'));
  assert.equal((await start(app)).error.run_id,run.id);
  assert.equal((await app.call('runs/'+run.id)).data.status,'uncertain');assert.equal(app.requests.length,2);
});

test('diagnostic allowlist rejects secret-shaped IDs, unknown fields, unsafe usage and excess rounds',()=>{
  const value={round:1,phase:'fetch',timeout:false,http_status:200,request_id:'req_synthetic-private-key',response_id:'resp_sk-test',response_status:'untrusted_status',incomplete_reason:'untrusted_reason',message:'NEVER_SAVE',headers:{Authorization:'NEVER_SAVE'},usage:{input_tokens:-1,output_tokens:Infinity,total_tokens:1.5,input_tokens_details:{cached_tokens:3,secret:'NEVER_SAVE'},output_tokens_details:{reasoning_tokens:1000000001}}};
  const safe=safeReviewDiagnostics([value,...Array.from({length:8},(_,i)=>({...value,round:i+2}))],'synthetic-private-key');
  assert.equal(safe.length,4);assert.deepEqual(safe[0],{round:1,phase:'fetch',timeout:false,http_status:200,usage:{input_tokens_details:{cached_tokens:3}}});
  assert.ok(!JSON.stringify(safe).includes('NEVER_SAVE'));assert.equal(safeReviewDiagnostics([{round:1,phase:'unknown'}]).length,0);
});
