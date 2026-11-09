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

test('catalog lists documented model IDs, preserves server default and never claims account entitlement',async t=>{
  const app=fixture(t),config=(await app.call('config')).data;
  assert.equal(config.default_model,'gpt-test-model');assert.equal(config.model,config.default_model);
  assert.deepEqual(config.supported_models.map(item=>item.id),['gpt-6.1-sol','gpt-6.1-terra','gpt-6-astra','gpt-test-model']);
  assert.ok(config.supported_models.every(item=>item.access==='unverified'));
  assert.equal(config.model_access,'unverified');assert.equal(config.connectivity,'untested');assert.equal(app.requests.length,0);
  const env={...app.env,OPENAI_REVIEW_MODEL:'gpt-6.1-terra'};
  const deduped=(await app.call('config','GET',undefined,app.auth,env)).data;
  assert.equal(deduped.supported_models.length,3);assert.equal(deduped.default_model,'gpt-6.1-terra');
});

test('explicit allowed selection pins every provider round and replay; switching model with same UUID conflicts',async t=>{
  const app=fixture(t),article=app.article();let round=0;
  app.provider(async()=>++round===1?Response.json({status:'completed',output:[{type:'function_call',name:'lookup_review_evidence',call_id:'call_model',arguments:JSON.stringify({source_run_id:null,kind:'articles',ids:[article],query:'',reason:'Verify evidence',limit:1})}]}):providerResponse());
  const id=randomUUID(),body={run_id:id,mode:'full',model:'gpt-6-astra'};
  const result=await app.call('runs','POST',body);assert.equal(result.status,201);assert.equal(result.data.model,body.model);
  assert.equal(app.requests.length,2);assert.ok(app.requests.every(item=>item.body.model===body.model));
  assert.equal(app.sql.prepare('SELECT model FROM matrix_openai_review_runs WHERE id=?').get(id).model,body.model);
  const replay=await app.call('runs','POST',body);assert.deepEqual(replay.data,result.data);
  assert.equal((await app.call('runs','POST',{...body,model:'gpt-6.1-sol'})).error.code,'IDEMPOTENCY_CONFLICT');
  assert.equal((await app.call('runs','POST',{run_id:id,mode:'full'},app.auth,{...app.env,OPENAI_REVIEW_MODEL:'changed-server-default'})).data.model,body.model);
  assert.equal(app.requests.length,2);
});

test('model rejects unknown identifiers, URL, nonstrings, extra configuration and retains missing-config protection',async t=>{
  const app=fixture(t);app.article();
  for(const model of ['gpt-6.1-astra','gpt-unknown','https://evil.invalid',null,{},123,'']) {
    assert.equal((await app.call('runs','POST',{run_id:randomUUID(),mode:'full',model})).status,400);
  }
  for(const extra of [{api_key:'x'},{endpoint:'https://evil.invalid'}])assert.equal((await app.call('runs','POST',{run_id:randomUUID(),mode:'full',model:'gpt-6.1-sol',...extra})).status,400);
  assert.equal((await app.call('runs','POST',{run_id:randomUUID(),mode:'full',model:'gpt-6.1-sol'},app.auth,{...app.env,OPENAI_REVIEW_MODEL:undefined})).error.code,'OPENAI_REVIEW_NOT_CONFIGURED');
  assert.equal(app.requests.length,0);assert.equal(app.sql.prepare('SELECT count(*) n FROM matrix_openai_review_runs').get().n,0);
  const fallback=await start(app);assert.equal(fallback.data.model,app.env.OPENAI_REVIEW_MODEL);
});

test('durable dispatch and completion drive stage and elapsed; detail and list never invoke provider',async t=>{
  const app=fixture(t);app.article();let entered,unblock;
  const began=new Promise(resolve=>{entered=resolve;}),blocked=new Promise(resolve=>{unblock=resolve;});
  app.provider(async()=>{entered();await blocked;return providerResponse();});
  const id=randomUUID(),pending=app.call('runs','POST',{run_id:id,mode:'full',model:'gpt-6.1-sol'});await began;
  app.advance(1234);const active=(await app.call('runs/'+id)).data;
  assert.equal(active.stage,'awaiting_provider');assert.equal(active.provider_calls,1);assert.equal(active.elapsed_ms,1234);
  assert.equal((await app.call('runs')).data.items[0].elapsed_ms,1234);assert.equal(app.requests.length,1);
  unblock();const complete=(await pending).data;assert.equal(complete.stage,'succeeded');assert.equal(complete.elapsed_ms,1234);
  app.advance(9000);assert.deepEqual((await app.call('runs/'+id)).data,complete);
  // Synthetic historical row only: an interrupted pre-dispatch reservation is observable.
  app.sql.prepare("UPDATE matrix_openai_review_runs SET status='running',completed_at=NULL,provider_calls=0 WHERE id=?").run(id);
  assert.equal((await app.call('runs/'+id)).data.stage,'preparing');
  app.advance(600000);assert.equal((await app.call('runs/'+id)).data.stage,'uncertain');assert.equal(app.requests.length,1);
});

test('model selection cannot bypass the unresolved claim; cancelled IDs remain fenced for all selections',async t=>{
  const app=fixture(t);app.article();app.provider(async()=>{throw Error('synthetic lost response');});
  const unknown=(await app.call('runs','POST',{run_id:randomUUID(),mode:'full',model:'gpt-6.1-terra'})).data;
  assert.equal(unknown.stage,'uncertain');app.advance(60000);
  assert.equal((await app.call('runs','POST',{run_id:randomUUID(),mode:'full',model:'gpt-6-astra'})).error.run_id,unknown.id);
  const id=randomUUID(),cancelled=(await app.call('runs/'+id+'/release','POST',{acknowledgement:'provider_outcome_unknown_no_automatic_retry'})).data;
  assert.deepEqual((await app.call('runs','POST',{run_id:id,mode:'full',model:'gpt-6-astra'})).data,cancelled);
  assert.equal(app.requests.length,1);
});

test('HTTP classification survives response body cancellation failure without exposing raw errors',async()=>{
  for(const [status,code,uncertain] of [[401,'OPENAI_REVIEW_PROVIDER_AUTH',false],[403,'OPENAI_REVIEW_PROVIDER_AUTH',false],[429,'OPENAI_REVIEW_PROVIDER_RATE_LIMIT',false],[400,'OPENAI_REVIEW_PROVIDER_REJECTED',false],[500,'OPENAI_REVIEW_PROVIDER_REJECTED',true],[408,'OPENAI_REVIEW_PROVIDER_REJECTED',true]]) {
    let calls=0;
    await assert.rejects(runReviewProvider({key:'synthetic-key',model:'gpt-6.1-sol',instructions:'x',input:{},beforeCall:async()=>{},lookup:async()=>{},request:async()=>{calls++;return {ok:false,status,body:{cancel:async()=>{throw Error('synthetic cleanup detail');}}};}}),error=>error.reviewCode===code&&error.uncertain===uncertain&&!error.message.includes('cleanup detail'));
    assert.equal(calls,1);
  }
});
