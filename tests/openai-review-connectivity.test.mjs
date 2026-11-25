import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleOpenAiConnectivity} from '../src/openai-review-connectivity.mjs';
import {handleOpenaiReview} from '../src/openai-review.mjs';

function fixture(t) {
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  for(const {tag} of journal.entries)for(const statement of readFileSync(new URL('../drizzle/'+tag+'.sql',import.meta.url),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))sql.exec(statement);
  const owner=randomUUID();sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'owner','synthetic',new Date().toISOString());sql.exec('INSERT INTO matrix_control(id,initialized) VALUES(1,1)');
  const queries=[],requests=[];let tail=Promise.resolve(),at=Date.parse('2026-11-09T08:00:00Z');
  const db={prepare(text){queries.push(text);let values=[];return {bind(...args){values=args;return this;},async first(){return sql.prepare(text).get(...values)||null;},async all(){return {results:sql.prepare(text).all(...values)};},async run(){const result=sql.prepare(text).run(...values);return {meta:{changes:Number(result.changes)}};}};},async batch(statements){const pending=tail.then(async()=>{sql.exec('BEGIN');try{for(const statement of statements)await statement.run();sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}});tail=pending.catch(()=>{});return pending;}};
  let provider=async()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'OK'}]}]});
  const settings={key:'synthetic-private-connectivity-secret',model:'gpt-6.1-terra'};
  async function call(path='',method='GET',body,overrides={}) {
    const route='/openai-review/connectivity'+path,request=new Request('https://example.invalid/api/v1'+route,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    try {const response=await handleOpenAiConnectivity({db,request,route,owner,settings,models:['gpt-6.1-terra','gpt-6.1-sol'],authorize:async()=>({id:owner,kind:'public'}),clock:()=>at,providerRequest:async(url,init)=>{requests.push({url,init,body:JSON.parse(init.body)});return provider(url,init);},...overrides});return {status:response.status,...await response.json()};}
    catch(error){if(!error.status)throw error;return {status:error.status,error:{code:error.code,message:error.message}};}
  }
  return {sql,db,owner,settings,requests,queries,call,advance:ms=>{at+=ms;},provider:fn=>{provider=fn;}};
}
const start=(app,id=randomUUID(),model='gpt-6.1-terra')=>app.call('','POST',{test_id:id,model});

test('minimal test sends fixed tiny input once and never reads articles or advances report memory',async t=>{
  const app=fixture(t),id=randomUUID();assert.equal((await app.call()).data,null);
  const result=await start(app,id);assert.equal(result.status,201);assert.equal(result.data.status,'succeeded');assert.equal(result.data.response,'OK');assert.equal(result.data.http_status,200);
  assert.equal(app.requests.length,1);const {url,init,body}=app.requests[0];
  assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(init.redirect,'manual');assert.equal(body.store,false);assert.equal(body.input,'Reply with exactly OK.');assert.equal(body.max_output_tokens,256);assert.deepEqual(body.reasoning,{effort:'low'});assert.equal(Object.hasOwn(body,'tools'),false);
  assert.ok(app.queries.every(query=>!query.includes('matrix_review_')&&!query.includes('matrix_openai_review_')));
  assert.equal((await start(app,id)).data.status,'succeeded');assert.equal((await app.call('/'+id)).data.status,'succeeded');assert.equal((await app.call()).data.id,id);assert.equal(app.requests.length,1);
  assert.equal((await start(app,id,'gpt-6.1-sol')).error.code,'IDEMPOTENCY_CONFLICT');
  const audit=app.sql.prepare('SELECT * FROM matrix_audit').all();assert.equal(audit.length,2);assert.ok(!JSON.stringify({result,audit}).includes(app.settings.key));assert.ok(!JSON.stringify(audit).includes('Reply with'));
  assert.equal(app.sql.prepare('SELECT count(*) AS n FROM matrix_openai_review_runs').get().n,0);assert.equal(app.sql.prepare('SELECT count(*) AS n FROM matrix_openai_review_config').get().n,0);
});

test('pending, concurrent and interrupted tests retain idempotency without new provider calls',async t=>{
  const app=fixture(t),id=randomUUID();let entered,unblock;const began=new Promise(resolve=>{entered=resolve;});const hold=new Promise(resolve=>{unblock=resolve;});
  app.provider(async()=>{entered();await hold;return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'OK'}]}]});});
  const original=start(app,id);await began;assert.equal((await start(app,id)).status,202);
  app.advance(31000);const concurrent=await start(app);assert.equal(concurrent.status,409);assert.equal(concurrent.error.test_id,id);assert.equal(app.requests.length,1);
  app.advance(149000);assert.equal((await app.call('/'+id)).data.status,'uncertain');assert.equal((await start(app,id)).data.status,'uncertain');assert.equal(app.requests.length,1);
  unblock();assert.equal((await original).data.status,'succeeded');assert.equal(app.requests.length,1);
});

test('owner, model, body and configuration checks reject before dispatch',async t=>{
  const app=fixture(t),id=randomUUID();
  assert.equal((await app.call('','POST',{test_id:id,model:'not-supported'})).status,400);
  assert.equal((await app.call('','POST',{test_id:id,model:'gpt-6.1-terra',prompt:'untrusted'})).status,400);
  assert.equal((await app.call('','POST',{test_id:id,model:'gpt-6.1-terra'},{settings:{key:null,model:'gpt-6.1-terra'}})).status,503);
  assert.equal((await app.call('','POST',{test_id:id,model:'gpt-6.1-terra'},{authorize:async()=>({id:randomUUID(),kind:'public'})})).status,403);
  assert.equal(app.requests.length,0);await start(app,id);
  const other=randomUUID();const foreign={owner:other,authorize:async()=>({id:other,kind:'public'})};
  assert.equal((await app.call('/'+id,'GET',undefined,foreign)).status,404);assert.equal((await app.call('','GET',undefined,foreign)).data,null);
});

test('HTTP rejection and malformed output expose only fixed safe messages and never retry',async t=>{
  const app=fixture(t);
  for(const [status,expected] of [[401,'failed'],[429,'failed'],[503,'uncertain'],[408,'uncertain'],[302,'failed']]) {
    app.provider(async()=>new Response(app.settings.key+' private failure details',{status,headers:{Location:'https://other.invalid'}}));
    const result=await start(app);assert.equal(result.data.status,expected);assert.equal(result.data.http_status,status);assert.ok(!JSON.stringify(result).includes(app.settings.key));app.advance(31000);
  }
  app.provider(async()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:app.settings.key}]}]}));
  const invalid=await start(app);assert.equal(invalid.data.error_code,'OPENAI_CONNECTIVITY_INVALID_OUTPUT');assert.ok(!JSON.stringify(invalid).includes(app.settings.key));assert.equal(app.requests.length,6);
  assert.ok(!JSON.stringify(app.sql.prepare('SELECT detail_json FROM matrix_audit').all()).includes(app.settings.key));
});

test('120 second provider deadline records uncertainty and same-id replay remains read-only',async t=>{
  const app=fixture(t),id=randomUUID(),delays=[];
  t.mock.method(globalThis,'setTimeout',(callback,delay)=>{delays.push(delay);queueMicrotask(callback);return 0;});
  app.provider(async(_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('private transport detail')),{once:true})));
  const result=await start(app,id);assert.deepEqual(delays,[120000]);assert.equal(result.data.status,'uncertain');assert.equal(result.data.error_code,'OPENAI_CONNECTIVITY_TIMEOUT');
  assert.equal((await start(app,id)).data.status,'uncertain');assert.equal((await app.call('/'+id)).data.status,'uncertain');assert.equal(app.requests.length,1);
});

test('independent durable test quota limits attempts to 20 per Beijing day and 30 second spacing',async t=>{
  const app=fixture(t);await start(app);assert.equal((await start(app)).error.code,'OPENAI_CONNECTIVITY_TEST_LIMIT');
  for(let i=1;i<20;i++){app.advance(31000);assert.equal((await start(app)).data.status,'succeeded');}
  app.advance(31000);assert.equal((await start(app)).error.code,'OPENAI_CONNECTIVITY_TEST_LIMIT');assert.equal(app.requests.length,20);
  app.advance(24*60*60*1000);assert.equal((await start(app)).data.status,'succeeded');assert.equal(app.requests.length,21);
});

test('production review route enforces public same-origin authorization and keeps a successful tiny test out of reports',async t=>{
  const app=fixture(t),origin='https://example.invalid',id=randomUUID(),requests=[];
  const env={DAILY_NOTES_OWNER_ID:app.owner,PUBLIC_BUSINESS_MODE:'1',OPENAI_API_KEY:app.settings.key,OPENAI_REVIEW_MODEL:'gpt-6.1-terra'};
  const body={test_id:id,model:'gpt-6.1-terra'},publicHeaders={Origin:origin,'X-Public-Business':'1'};
  async function routeCall(path,method='GET',input,headers={},settings=env) {
    const route='/openai-review/'+path,request=new Request(origin+'/api/v1'+route,{method,headers:{'Content-Type':'application/json',...headers},body:input===undefined?undefined:JSON.stringify(input)});
    try {
      const response=await handleOpenaiReview(app.db,request,route,settings,origin,undefined,{clock:()=>Date.parse('2026-11-09T08:00:00Z'),request:async(url,init)=>{
        requests.push({url,init,body:JSON.parse(init.body)});
        return Response.json({status:'completed',output:[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text:'OK'}]}]});
      }});
      return {status:response.status,...await response.json()};
    } catch(error) {if(!error.status)throw error;return {status:error.status,error:{code:error.code}};}
  }
  assert.equal((await routeCall('connectivity','POST',body,{Origin:origin})).status,403);
  assert.equal((await routeCall('connectivity','POST',body,{...publicHeaders,Origin:'https://foreign.invalid'})).status,403);
  assert.equal((await routeCall('connectivity','POST',body,{...publicHeaders,Authorization:'Bearer synthetic'})).status,403);
  assert.equal((await routeCall('connectivity','GET',undefined,{Authorization:'Bearer synthetic'})).status,403);
  assert.equal(requests.length,0);
  const result=await routeCall('connectivity','POST',body,publicHeaders);assert.equal(result.status,201);assert.equal(result.data.status,'succeeded');assert.equal(result.data.response,'OK');
  assert.equal(requests.length,1);assert.equal(requests[0].body.input,'Reply with exactly OK.');assert.equal(requests[0].body.max_output_tokens,256);assert.equal(requests[0].init.redirect,'manual');
  assert.equal((await routeCall('connectivity/'+id)).data.status,'succeeded');assert.equal((await routeCall('connectivity')).data.id,id);
  assert.equal((await routeCall('connectivity','POST',body,publicHeaders)).data.status,'succeeded');assert.equal(requests.length,1);
  assert.deepEqual((await routeCall('runs')).data.items,[]);assert.equal((await routeCall('config')).data.last_success_at,null);
  // A later configuration change must not erase the historical test readback.
  assert.equal((await routeCall('connectivity/'+id,'GET',undefined,{}, {...env,OPENAI_API_KEY:undefined})).data.status,'succeeded');
  assert.ok(!JSON.stringify(result).includes(app.settings.key));
});
