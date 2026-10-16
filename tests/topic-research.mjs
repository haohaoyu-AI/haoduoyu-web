import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const requireNative=createRequire(import.meta.url), sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json','utf8'));
assert.equal(journal.entries[14].tag,'0014_topic_research');
assert.ok(JSON.parse(fs.readFileSync('drizzle/meta/0014_snapshot.json','utf8')).tables.topic_research_runs);
let time=Date.now(),dispatches=0,reads=0,accepted=true,writes=0,injectedHistory=null;
class Clock extends Date {constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}}
const db={prepare:q=>({bind:(...values)=>{const runSync=()=>{writes++;return {meta:{changes:Number(sql.prepare(q).run(...values).changes)}};};return {runSync,run:async()=>runSync(),first:async()=>sql.prepare(q).get(...values)||null,all:async()=>({results:sql.prepare(q).all(...values)})};}}),batch:async statements=>{sql.exec('BEGIN');try{const result=statements.map(s=>s.runSync());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
const globals={crypto,Date:Clock,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,URL,Request,Response,console,btoa,atob,Set,fetch:()=>{throw Error('No network allowed');}};
const cache={};
function load(name){if(cache[name])return cache[name];const exports={};cache[name]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{...globals,exports,require:n=>n==='cloudflare:workers'?{env:{DB:db,CLAUDE_CONFIG_KEY:btoa('01234567890123456789012345678901')}}:n==='./test-store'?{db:()=>db,owner:r=>r.headers.get('oai-authenticated-user-id')}:n==='./events'?{readiness:async()=>({connected:true}),dispatchTopicResearch:async()=>{dispatches++;return accepted;}}:n==='./topic-candidates'?{getTopicBoard:async platform=>{reads++;return {platform:{platform,status:'ok',fetched_at:new Clock().toISOString()},candidates:[{id:platform+'-1',title:platform+'合成公开活动',signals:[{url:'https://example.com/'+platform}]}]};},getTopicHistory:async()=>({entries:injectedHistory?[{title:injectedHistory}]:[],history:{status:'ok'}})}:n.startsWith('./')?load(n.slice(2)):requireNative(n)});return exports;}
const research=load('topic-research');
const create=(owner,key=crypto.randomUUID())=>research.createTopicResearch(owner,{request_key:key});
const key=crypto.randomUUID();const first=await create('owner-a',key);assert.equal(first.run.state,'queued');assert.equal(first.run.generation,1);assert.equal(first.run.claimable,true);assert.equal(first.run.dispatch_state,'accepted');assert.equal(dispatches,1);
assert.equal(JSON.stringify(first.run.input.boards.map(b=>b.platform.platform)),JSON.stringify(['toutiao','weibo']));
const oldWrites=writes;await research.readTopicResearch('owner-a');await research.readTopicResearch('owner-a',first.run.id);assert.equal(writes,oldWrites,'GET reads do not dispatch or mutate');
assert.equal((await create('owner-a',key)).run.id,first.run.id);assert.equal(reads,2);assert.equal(dispatches,1);
await assert.rejects(create('owner-a'),/一分钟/);
await assert.rejects(research.readTopicResearch('owner-b',first.run.id),/本人/);
assert.equal((await research.readTopicResearch('owner-b')).current,null);assert.notEqual((await research.readTopicResearch('owner-b')).owner_scope,first.owner_scope);assert.equal(first.owner_scope.length,64);
const claims=await Promise.all([research.claimTopicResearch('owner-a',{research_id:first.run.id}),research.claimTopicResearch('owner-a',{research_id:first.run.id})]);
assert.equal(claims.filter(c=>c.claimed).length,1);const claim=claims.find(c=>c.claimed);assert.ok(claim.claim_token);assert.equal(claims.find(c=>!c.claimed).claim_token,null);
assert.ok(!JSON.stringify((await research.readTopicResearch('owner-a',first.run.id))).includes(claim.claim_token));
assert.ok(!JSON.stringify(sql.prepare('SELECT * FROM topic_research_runs').all()).includes(claim.claim_token));
const result={featured:[{event_key:'synthetic-only',title:'离线测试，非真实新闻',event_time:'合成事件时间',summary:'合成摘要，仅测试数据。',analysis:'合成分析，仅测试数据。',angle:'合成角度，仅测试数据。',candidate_ids:['toutiao-1'],facts:[{text:'合成事实，不代表真实事件。',source_ids:['source-1']}],sources:[{id:'source-1',url:'https://example.com/synthetic-only',title:'离线合成来源',published_at:null,accessed_at:new Clock().toISOString()}]}],additional:[{title:'weibo合成公开活动',url:'https://example.com/weibo',note:'榜单线索，未核验'}],coverage:{notice:'所有内容是离线合成测试，绝非真实新闻。',checked_at:new Clock().toISOString()},shortfall:'合成测试只有一个候选。'};
const save={research_id:first.run.id,claim_token:claim.claim_token,input_hash:first.run.input_hash,result};
await assert.rejects(research.saveTopicResearch('owner-b',save),/本人/);
await assert.rejects(research.saveTopicResearch('owner-a',{...save,input_hash:'wrong'}),/快照/);
await assert.rejects(research.saveTopicResearch('owner-a',{...save,claim_token:'wrong'}),/凭证/);
const invalid=mutator=>{const changed=structuredClone(result);mutator(changed);assert.throws(()=>research.validateResearchResult(first.run.input,changed,time));};
invalid(r=>r.featured[0].facts[0].source_ids=['missing']);invalid(r=>r.featured[0].candidate_ids=['not-in-batch']);invalid(r=>r.featured[0].sources[0].url='javascript:alert(1)');invalid(r=>r.featured[0].sources[0].url='https://127.0.0.1/private');invalid(r=>r.featured[0].sources[0].accessed_at='2099-01-01T00:00:00Z');invalid(r=>r.featured.push(structuredClone(r.featured[0])));invalid(r=>r.additional[0].title='not a frozen lead');invalid(r=>r.shortfall='');invalid(r=>r.featured[0].sources[0].url='https://localhost./admin');invalid(r=>r.featured[0].sources[0].url='https://internal./admin');
const staleInput=structuredClone(first.run.input);staleInput.boards[0].platform.status='stale';assert.throws(()=>research.validateResearchResult(staleInput,result,time),/本批次/);
await assert.rejects(research.saveTopicResearch('owner-a',{...save,result:{...result,shortfall:claim.claim_token}}),/安全校验/);
// An older completion cannot move the current pointer after a newer generation exists.
time+=61000;const second=await create('owner-a');assert.equal(second.run.generation,2);
const saved=await research.saveTopicResearch('owner-a',save);assert.equal(saved.run.state,'completed');assert.equal((await research.readTopicResearch('owner-a')).current.id,second.run.id);
assert.equal((await research.saveTopicResearch('owner-a',save)).duplicate,true);
const restoreTime=time;time+=25*60*60000;assert.equal((await research.saveTopicResearch('owner-a',save)).duplicate,true,'completed same-hash saves remain idempotent after freshness window');time=restoreTime;
await assert.rejects(research.saveTopicResearch('owner-a',{...save,result:{...result,shortfall:'Changed'}}),/不可覆盖/);
assert.equal((await research.claimTopicResearch('owner-a',{research_id:first.run.id})).claimed,false);
// An expired claim is recoverable, while the old token can no longer save.
const secondClaim=await research.claimTopicResearch('owner-a',{research_id:second.run.id});assert.equal(secondClaim.run.claimable,false);assert.ok(secondClaim.run.claim_expires);time+=31*60000;
const beforeExpiredRead=writes;const expiredRead=await research.readTopicResearch('owner-a',second.run.id);assert.equal(expiredRead.run.claimable,true);assert.equal(writes,beforeExpiredRead,'expired read reports eligibility without lease mutation');
const reclaimed=await research.claimTopicResearch('owner-a',{research_id:second.run.id});assert.equal(reclaimed.claimed,true);assert.notEqual(reclaimed.claim_token,secondClaim.claim_token);
await assert.rejects(research.failTopicResearch('owner-a',{research_id:second.run.id,claim_token:secondClaim.claim_token,message:'old'}),/凭证/);
assert.equal((await research.failTopicResearch('owner-a',{research_id:second.run.id,claim_token:reclaimed.claim_token,message:'公开正文无法读取，未核验'})).run.state,'failed');
// Pending outbox survives transient delivery failure and is retried with the same batch.
accepted=false;const pendingKey=crypto.randomUUID(),pending=await create('owner-c',pendingKey);assert.equal(pending.run.dispatch_state,'pending');const sent=dispatches;await create('owner-c',pendingKey);assert.equal(dispatches,sent);time+=61000;accepted=true;const retry=await create('owner-c',pendingKey);assert.equal(retry.run.id,pending.run.id);assert.equal(retry.run.dispatch_state,'accepted');assert.equal(dispatches,sent+1);assert.equal(sql.prepare('SELECT count(*) n FROM topic_research_runs WHERE owner=?').get('owner-c').n,1);
// Concurrent distinct refreshes create only one owner generation in a cooldown window.
const concurrent=await Promise.allSettled([create('owner-d'),create('owner-d')]);assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);assert.equal(sql.prepare('SELECT count(*) n FROM topic_research_runs WHERE owner=?').get('owner-d').n,1);
for(const table of ['articles','writing_runs','claude_attempts','article_deliveries','event_subscriptions'])assert.equal(sql.prepare('SELECT count(*) n FROM '+table).get().n,0,'research must not mutate '+table);
// Actual HTTP routes retain owner auth and POST CSRF fence; GET never creates.
const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/topics/research/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{...globals,exports,require:n=>n.endsWith('/test-store')?{owner:r=>r.headers.get('oai-authenticated-user-id')}:load(n.split('/').at(-1))});
assert.equal((await exports.GET(new Request('https://site.example/api/topics/research'))).status,401);
assert.equal((await exports.POST(new Request('https://site.example/api/topics/research',{method:'POST',headers:{'oai-authenticated-user-id':'owner-a'},body:'{}'}))).status,403);
const before=writes;const readResponse=await exports.GET(new Request('https://site.example/api/topics/research',{headers:{'oai-authenticated-user-id':'owner-a'}}));assert.equal(readResponse.status,200);assert.equal(writes,before);assert.match(readResponse.headers.get('cache-control'),/private, no-store/);
console.log('topic research: migrations, frozen inputs, owner isolation, CSRF, GET purity, concurrency, claims, expiry, evidence validation, old-generation fencing, idempotent save, durable retry, no article/provider effects passed');

// Credential boundary uses the real configured-key decryptor and all legacy owner leases.
const secureOwner='owner-security',opaque='opaque.SyntheticOwnerSecret.19Xq';
const keyBytes=new TextEncoder().encode('01234567890123456789012345678901');
const aes=await crypto.subtle.importKey('raw',keyBytes,{name:'AES-GCM'},false,['encrypt']);
const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(secureOwner)},aes,new TextEncoder().encode(opaque));
sql.prepare('INSERT INTO claude_settings(owner,model,secret,enabled,updated) VALUES(?,?,?,?,?)').run(secureOwner,'offline-only',JSON.stringify({iv:Buffer.from(iv).toString('base64'),data:Buffer.from(cipher).toString('base64')}),'0',new Clock().toISOString());
const oldTokens=['old.article.SyntheticToken19','old.delivery.SyntheticToken28','old.outline.SyntheticToken37','old.writing.SyntheticToken46'];
sql.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state,claim_token) VALUES(?,?,?,?,?,?,?,?,?)').run('old-article',secureOwner,'合成旧文章','synthetic.txt','synthetic','[]',new Clock().toISOString(),'failed',oldTokens[0]);
sql.prepare('INSERT INTO article_deliveries(id,owner,article_id,platform,state,claim_token,updated) VALUES(?,?,?,?,?,?,?)').run('old-delivery',secureOwner,'old-article','toutiao','failed',oldTokens[1],new Clock().toISOString());
sql.prepare('INSERT INTO outline_flow_stages(id,owner,run_id,stage,token,expires,input_json,input_sha256,state,created) VALUES(?,?,?,?,?,?,?,?,?,?)').run('old-outline',secureOwner,'synthetic-run','outline',oldTokens[2],'2020-01-01T00:00:00Z','{}','synthetic','failed',new Clock().toISOString());
sql.prepare('INSERT INTO writing_runs(id,owner,day,state,token,article_id,created,updated) VALUES(?,?,?,?,?,?,?,?)').run('old-writing',secureOwner,'2020-01-01','failed',oldTokens[3],'old-article',new Clock().toISOString(),new Clock().toISOString());
const secure=await create(secureOwner),secureClaim=await research.claimTopicResearch(secureOwner,{research_id:secure.run.id});
const secureResult=structuredClone(result);secureResult.featured[0].sources[0].accessed_at=new Clock().toISOString();secureResult.coverage.checked_at=new Clock().toISOString();
const secureArgs={research_id:secure.run.id,input_hash:secure.run.input_hash,claim_token:secureClaim.claim_token,result:secureResult};
time+=61000;const otherResearch=await create(secureOwner),otherClaim=await research.claimTopicResearch(secureOwner,{research_id:otherResearch.run.id});
const outboxToken=crypto.randomUUID();sql.prepare('UPDATE topic_research_outbox SET lease_token=? WHERE research_id=?').run(outboxToken,secure.run.id);
const percent=value=>Array.from(new TextEncoder().encode(value),n=>'%'+n.toString(16).padStart(2,'0')).join('');
const unicode=value=>[...value].map(c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
for(const secret of [opaque,...oldTokens,secureClaim.claim_token,otherClaim.claim_token,outboxToken]) {
 for(const variant of [secret,percent(secret),percent(percent(secret)),unicode(secret)]) {
  for(const position of ['summary','query','path','additional']) {
   const unsafe=structuredClone(secureResult);
   if(position==='summary')unsafe.featured[0].summary=variant;
   if(position==='query')unsafe.featured[0].sources[0].url='https://example.com/source?anything='+variant;
   if(position==='path')unsafe.featured[0].sources[0].url='https://example.com/'+variant;
   if(position==='additional')unsafe.additional[0].url='https://example.com/?data='+variant;
   const before=writes;await assert.rejects(research.saveTopicResearch(secureOwner,{...secureArgs,result:unsafe}),/安全校验|结构/);assert.equal(writes,before,'unsafe content rejected before persistence');
  }
  const before=writes;await assert.rejects(research.failTopicResearch(secureOwner,{research_id:secure.run.id,claim_token:secureClaim.claim_token,message:variant}),/安全校验|原因/);assert.equal(writes,before);
 }
}
for(const value of [{[unicode('api_key')]:opaque},JSON.stringify({[opaque]:'value'}),JSON.stringify({nested:JSON.stringify({password:opaque})})]){
 const unsafe=structuredClone(secureResult);unsafe.featured[0].summary=JSON.stringify(value);await assert.rejects(research.saveTopicResearch(secureOwner,{...secureArgs,result:unsafe}),/安全校验/);
}
const initialInput=sql.prepare('SELECT input_json FROM topic_research_runs WHERE id=?').get(secure.run.id).input_json;
for(const column of ['input_json','result_json','error']){
 const value=column==='error'?percent(opaque):JSON.stringify({nested:'https://example.com/?random='+percent(percent(oldTokens[0]))});
 sql.prepare('UPDATE topic_research_runs SET '+column+'=? WHERE id=?').run(value,secure.run.id);
 const before=writes;await assert.rejects(research.readTopicResearch(secureOwner,secure.run.id),/已隐藏/);assert.equal(writes,before,'contaminated read is suppressed without rewriting original');
 sql.prepare('UPDATE topic_research_runs SET '+column+'=? WHERE id=?').run(column==='input_json'?initialInput:null,secure.run.id);
}
// Frozen input is checked before a batch, outbox or event is created.
time+=61000;injectedHistory=percent(opaque);const beforeInput=writes,beforeEvent=dispatches;
await assert.rejects(create(secureOwner),/输入安全校验/);assert.equal(writes,beforeInput);assert.equal(dispatches,beforeEvent);injectedHistory=null;
assert.equal((await research.saveTopicResearch(secureOwner,secureArgs)).run.state,'completed');
assert.equal(sql.prepare('SELECT count(*) n FROM claude_attempts').get().n,0);
console.log('topic credential boundary: actual disabled opaque key decrypt, old article/delivery/outline/writing leases, current token, nested JSON keys, percent-encoded URL path/query, snapshot/save/error rejection and read suppression passed; zero provider calls');
