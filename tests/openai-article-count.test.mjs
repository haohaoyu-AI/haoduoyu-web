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

import {ARTICLE_COUNT_TASK,ARTICLE_COUNT_INSTRUCTIONS,articleCountProfile} from '../src/openai-article-count.mjs';
import {createOpenAiRunner} from '../web/core/openai-review-runner.mjs';
import {renderOpenAiReviewPanel,renderOpenAiRun} from '../web/pages/openai-review.mjs';

const providerResponse=(report='本次报告',summary='累计历史结论',extra={})=>Response.json({id:'resp_synthetic',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({report_markdown:report,cumulative_summary:summary,pending_verification:['internal-only-pending-canary']})}]}],...extra});
const countResponse=input=>Response.json({id:'resp_synthetic_count',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({article_count:typeof input==='number'?input:JSON.parse(input).article_count})}]}]});
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
  let provider=async(_url,init)=>countResponse(JSON.parse(init.body).input[0].content);const requests=[];
  const request=async(url,init)=>{requests.push({url,init,body:JSON.parse(init.body)});return provider(url,init);};
  async function call(path,method='GET',data,headers=auth,settings=env,dependencies={}) {
    const h=new Headers(headers);if(data!==undefined)h.set('Content-Type','application/json');
    const req=new Request(origin+'/api/v1/openai-review/'+path,{method,headers:h,body:data===undefined?undefined:JSON.stringify(data)});
    try {const res=await handleOpenaiReview(db,req,new URL(req.url).pathname.slice('/api/v1'.length),settings,origin,undefined,{request,clock:()=>at,...dependencies});return {status:res.status,...await res.json()};}
    catch(error){if(!error.status)throw error;return {status:error.status,error:{code:error.code,message:error.message}};}
  }
  const article=(title='Article',account='V字',uid=owner)=>{const id=randomUUID();sql.prepare('INSERT INTO matrix_review_articles(user_id,id,account,title,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(uid,id,account,title,'2026-11-07',new Date(at).toISOString(),new Date(at).toISOString());return id;};
  const snapshot=(article_id,reads=100,age_hours=24)=>{const id=randomUUID();sql.prepare('INSERT INTO matrix_review_snapshots(user_id,id,article_id,snapshot_date,reads,age_hours) VALUES(?,?,?,?,?,?)').run(owner,id,article_id,'2026-11-07',reads,age_hours);return id;};
  return {sql,db,owner,env,auth,secret,call,article,snapshot,requests,provider:fn=>{provider=fn;},advance:ms=>{at+=ms;},conflict:()=>{conflict=true;}};
}
const start=(app,id=randomUUID())=>app.call('runs','POST',{run_id:id,mode:'full',task:ARTICLE_COUNT_TASK});

test('count profile uses owner-scoped unique article rows only, one minimal provider call and no full source or old instructions',async t=>{
  const app=fixture(t),a=app.article('PRIVATE_TITLE_CANARY');app.article('PRIVATE_TITLE_CANARY','好多鱼');const firstSnapshot=app.snapshot(a);app.sql.prepare('UPDATE matrix_review_snapshots SET snapshot_date=? WHERE id=?').run('2026-11-06',firstSnapshot);app.snapshot(a,200);
  const other=randomUUID();app.sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(other,'foreign','x',new Date().toISOString());app.article('foreign','V字',other);
  await app.call('config','PATCH',{instructions:'COMPLEX_SAVED_PROMPT_CANARY',version:0});
  const result=await start(app);assert.equal(result.data.status,'succeeded');assert.equal(result.data.task,ARTICLE_COUNT_TASK);
  assert.match(result.data.report_markdown,/共有 2 篇/);assert.match(result.data.report_markdown,/数据库负责计数/);
  assert.equal(app.requests.length,1);const {body,init}=app.requests[0];
  assert.equal(body.instructions,ARTICLE_COUNT_INSTRUCTIONS);assert.equal(body.max_output_tokens,1024);assert.equal(body.store,false);
  assert.equal(init.redirect,'manual');assert.equal(body.tools,undefined);assert.equal(body.include,undefined);assert.equal(body.input.length,1);
  assert.equal(JSON.parse(body.input[0].content).article_count,2);assert.ok(Buffer.byteLength(JSON.stringify(body))<2048);
  assert.doesNotMatch(JSON.stringify(body),/PRIVATE_TITLE_CANARY|COMPLEX_SAVED_PROMPT_CANARY|cumulative_summary|pending_verification|source_chat/);
  const row=app.sql.prepare('SELECT * FROM matrix_openai_review_runs').get();assert.equal(row.instructions,ARTICLE_COUNT_INSTRUCTIONS);assert.equal(row.instruction_version,1);
  assert.deepEqual(JSON.parse(row.summary_json),{task:ARTICLE_COUNT_TASK,article_count:2});assert.equal(row.baseline_run_id,null);
  assert.equal((await app.call('config')).data.instructions,'COMPLEX_SAVED_PROMPT_CANARY');
  const html=renderOpenAiRun(result.data);assert.match(html,/文章数量链路测试/);assert.match(html,/共有 2 篇/);
});
test('empty library is a valid zero count; replay preserves captured count and task idempotency',async t=>{
  const app=fixture(t),id=randomUUID(),zero=await start(app,id);assert.equal(zero.data.status,'succeeded');assert.match(zero.data.report_markdown,/共有 0 篇/);
  app.article();const replay=await start(app,id);assert.deepEqual(replay.data,zero.data);assert.equal(app.requests.length,1);
  assert.deepEqual((await app.call('runs','POST',{run_id:id,mode:'full'})).data,zero.data);
  assert.equal((await app.call('runs','POST',{run_id:randomUUID(),mode:'full',task:'unknown'})).status,400);
});
test('count result is validated against pinned count; wrong count, extra fields and tools fail without another call',async t=>{
  for(const response of [countResponse(9),Response.json({status:'completed',output:[{type:'function_call',name:'lookup_review_evidence',call_id:'x',arguments:'{}'}]}),
    Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"article_count":1,"extra":true}'}]}]})]) {
    const app=fixture(t);app.article();app.provider(async()=>response);
    const result=await start(app);assert.equal(result.data.status,'failed');assert.equal(result.data.report_markdown,'');assert.equal(app.requests.length,1);
    assert.equal(app.sql.prepare('SELECT summary_json FROM matrix_openai_review_runs').get().summary_json,null);
  }
});
test('count mode shares the old unresolved lock; uncertain count also fences old analysis and never auto-retries',async t=>{
  const app=fixture(t);app.article();app.provider(async()=>{throw Error('synthetic lost response');});
  const old=await app.call('runs','POST',{run_id:randomUUID(),mode:'full'},app.auth,app.env,{legacyAnalysisForTests:true});assert.equal(old.data.status,'uncertain');
  app.advance(60000);const blocked=await start(app);assert.equal(blocked.error.run_id,old.data.id);assert.equal(app.requests.length,1);
  assert.equal((await app.call('runs/'+old.data.id)).data.status,'uncertain');assert.equal(app.requests.length,1);
  // A separate fixture establishes the reverse direction without releasing any lock.
  const count=fixture(t);count.article();count.provider(async()=>{throw Error('synthetic lost response');});
  const unknown=await start(count);count.advance(60000);
  assert.equal((await count.call('runs','POST',{run_id:randomUUID(),mode:'full'})).error.run_id,unknown.data.id);assert.equal(count.requests.length,1);
});
test('successful count never becomes the cumulative review checkpoint or overwrites an earlier full summary',async t=>{
  const app=fixture(t);app.article();app.provider(async()=>providerResponse('original','retained summary'));
  const original=await app.call('runs','POST',{run_id:randomUUID(),mode:'full'},app.auth,app.env,{legacyAnalysisForTests:true});app.advance(31000);
  app.provider(async()=>countResponse(1));const count=await start(app);assert.equal(count.data.status,'succeeded');app.advance(31000);
  app.provider(async()=>providerResponse('later','later summary'));
  const later=await app.call('runs','POST',{run_id:randomUUID(),mode:'incremental'},app.auth,app.env,{legacyAnalysisForTests:true});
  assert.equal(later.data.baseline_run_id,original.data.id);assert.notEqual(later.data.baseline_run_id,count.data.id);
  const input=JSON.parse(app.requests[2].body.input[1].content);assert.equal(input.cumulative_summary.cumulative_summary,'retained summary');
});
test('button runner to real handler to report rendering retains one request on repeated clicks and GET-only recovery',async t=>{
  const app=fixture(t);app.article();app.article('second','Other');
  const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const calls=[];const runner=createOpenAiRunner({storage,key:'same-existing-run-key',request:async(path,options={})=>{
    calls.push({path,...options});const res=await app.call(path.replace('/openai-review/',''),options.method||'GET',options.body);
    if(res.error)throw Object.assign(new Error(res.error.message),res.error,{status:res.status});return res.data;
  }});
  const config=(await app.call('config')).data;assert.deepEqual(config.test_task,articleCountProfile());
  assert.match(renderOpenAiReviewPanel({owner:true,config}),/只统计文章数量/);
  const first=runner.start('full','gpt-test-model',config.test_task.id);await runner.start('full','gpt-test-model',config.test_task.id);await first;
  assert.equal(calls.filter(call=>call.method==='POST').length,1);assert.equal(app.requests.length,1);
  assert.equal(runner.state.pendingId,'');assert.equal(runner.state.run.status,'succeeded');assert.match(renderOpenAiRun(runner.state.run),/共有 2 篇/);
});

test('old client without task creates only a count test; existing old UUID replays without dispatch or task conversion',async t=>{
  const app=fixture(t);app.article();
  const legacy=await app.call('runs','POST',{run_id:randomUUID(),mode:'incremental'});assert.equal(legacy.data.task,ARTICLE_COUNT_TASK);assert.equal(app.requests.length,1);
  const other=fixture(t);other.article();other.provider(async()=>providerResponse());
  const id=randomUUID(),old=await other.call('runs','POST',{run_id:id,mode:'incremental'},other.auth,other.env,{legacyAnalysisForTests:true});
  assert.deepEqual((await other.call('runs','POST',{run_id:id,mode:'incremental'})).data,old.data);
  assert.equal((await other.call('runs','POST',{run_id:id,mode:'incremental',task:ARTICLE_COUNT_TASK})).error.code,'IDEMPOTENCY_CONFLICT');
  assert.equal(other.requests.length,1);
});

test('historical report tool excludes count-test reports after cumulative analysis is restored',async t=>{
  const app=fixture(t);app.article();await start(app);app.advance(31000);let round=0;
  app.provider(async()=>++round===1?Response.json({status:'completed',output:[{type:'function_call',name:'lookup_review_evidence',call_id:'call_history',arguments:JSON.stringify({source_run_id:null,kind:'runs',ids:[],query:'文章',reason:'verify prior reports',limit:5})}]}):providerResponse());
  const result=await app.call('runs','POST',{run_id:randomUUID(),mode:'full'},app.auth,app.env,{legacyAnalysisForTests:true});
  assert.equal(result.data.status,'succeeded');const tool=JSON.parse(app.requests[2].body.input.find(item=>item.type==='function_call_output').output);
  assert.deepEqual(tool.items,[]);assert.equal(tool.matched_count,0);
});
