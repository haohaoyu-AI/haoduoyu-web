import {testOutline,invalidOutlines} from './fixtures/writing-outline.mjs';
import ts from 'typescript';import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {DatabaseSync} from 'node:sqlite';import {zipSync,strToU8} from 'fflate';import {createHash} from 'node:crypto';const nativeRequire=createRequire(import.meta.url);
const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
const db={batch:async stmts=>{sql.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}},prepare:s=>({bind:(...v)=>({first:async()=>sql.prepare(s).get(...v)||null,all:async()=>({results:sql.prepare(s).all(...v)}),run:async()=>({meta:{changes:Number(sql.prepare(s).run(...v).changes)}})})})};
const objects=new Map();const bucket={async list({prefix}){return {truncated:false,objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key,size:objects.get(key).length}))};},async put(k,b){objects.set(k,new Uint8Array(b));},async delete(k){objects.delete(k)},async head(k){return objects.has(k)?{size:objects.get(k).length}:null},async get(k,opts){if(!objects.has(k))return null;const b=objects.get(k);const cut=opts?.range?b.slice(opts.range.offset,opts.range.offset+opts.range.length):b;return {arrayBuffer:async()=>cut.buffer.slice(cut.byteOffset,cut.byteOffset+cut.byteLength),body:new ReadableStream({start(c){c.enqueue(cut);c.close()}})};}};
let dispatches=0;let dispatchState='事件已送达';let providerRequestStarted=()=>{};let lastRequest=null;let lastSystem="";let lastMaxTokens=0;let calls=0;let fail=false;let fakeLatency=0;let partialFailure=false;let partialRawText='';let responseText='{"title":"标题","paragraphs":["正文"]}';const fetch=async(url,opts)=>{if(url==='https://app.yylx.io/v1/models')return new Response(JSON.stringify({data:[{id:'claude-test'}]}));calls++;providerRequestStarted();if(fakeLatency)await new Promise(resolve=>setTimeout(resolve,fakeLatency));assert.equal(url,'https://app.yylx.io/v1/messages');assert.equal(opts.redirect,'manual');const request=JSON.parse(opts.body);lastRequest=request;lastMaxTokens=request.max_tokens;lastSystem=request.system;if(request.max_tokens===32){assert.equal(request.messages[0].content,'请只回复：连接成功');}else{assert.equal(request.system.startsWith(load('writing-rewrite-v2').rewritePrompt)||request.system.startsWith(load('writing-supplement').effectiveWritingPrompt),true);assert.equal(request.messages[0].content.startsWith('写作日期（北京时间）：'),true);}assert.equal(opts.headers.authorization,'Bearer test-api-key-12345');if(partialFailure){partialRawText='{"model":"claude-test","stop_reason":"max_tokens","usage":{"input_tokens":17,"output_tokens":14000,"output_tokens_details":{"thinking_tokens":9}},"content":[{"type":"text","text":"第一段"},{"type":"text","text":"第二段未完';const bytes=new TextEncoder().encode(partialRawText);const chunks=[bytes.slice(0,37),bytes.slice(37)];return new Response(new ReadableStream({pull(controller){if(chunks.length)controller.enqueue(chunks.shift());else controller.error(Error('mock downstream cut'));}},{highWaterMark:0}),{status:200,headers:{'content-type':'application/json'}});}return new Response(fail?'failed':JSON.stringify({model:'claude-test',stop_reason:'end_turn',usage:{input_tokens:100,output_tokens:200},content:[{type:'text',text:request.max_tokens===32?'连接成功':responseText}]}),{status:fail?500:200});};const modules={};function load(name){if(modules[name])return modules[name];const ex={};modules[name]=ex;const src=fs.readFileSync('lib/'+name+'.ts','utf8');const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(js,{exports:ex,require:n=>n==='cloudflare:workers'?{env:{DB:db,BUCKET:bucket,CLAUDE_CONFIG_KEY:btoa('01234567890123456789012345678901')}}:n==='./events'?({readiness:async()=>({connected:true}),dispatch:async()=>{dispatches++;return dispatchState;}}):n.startsWith('./')?load(n.slice(2)):nativeRequire(n),crypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Set,Error,URL,btoa,atob,Date,File,ReadableStream,Response,AbortSignal,fetch});return ex;}


// Legacy protocol fixtures retain the original save -> automatic delivery contract.
// New daily editorial defaults are covered independently in daily-editorial.mjs.
const rawWriting=load('writing');
const w={...rawWriting,writingCall:async(owner,name,args)=>{const result=await rawWriting.writingCall(owner,name,args);if(name==='claim_writing_run'&&result.claimed){const row=sql.prepare('SELECT run_kind,input_snapshot FROM writing_runs WHERE article_id=?').get(result.article_id);if(row.run_kind==='daily'&&row.input_snapshot){const snapshot=JSON.parse(row.input_snapshot);delete snapshot.editorial_contract_version;sql.prepare('UPDATE writing_runs SET input_snapshot=? WHERE article_id=?').run(JSON.stringify(snapshot),result.article_id);}}return result;}};
const cl=load('claude');const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
assert.equal((await cl.claudeStatus('a')).configured,false);
await assert.rejects(cl.configureClaude('a',{model:'claude-test',api_key:'test-api-key-12345',enabled:true}));
await cl.configureClaude('a',{model:'claude-test',api_key:'test-api-key-12345',enabled:true,consent:true});
assert.equal((await cl.claudeStatus('a')).enabled,true);assert.equal((await cl.claudeStatus('a')).max_output_tokens,14000);assert.equal(JSON.stringify(await cl.claudeStatus('a')).includes('test-api-key'),false);
assert.equal(sql.prepare('SELECT secret FROM claude_settings').get().secret.includes('test-api-key'),false);
const c=await w.writingCall('a','claim_writing_run',{day,writer:'claude'});const x=await w.writingCall('a','claim_writing_run',{day,writer:'xiaoyu'});assert.equal(c.claimed,true);assert.equal(x.claimed,true);assert.notEqual(c.article_id,x.article_id);
const args={outline:testOutline,day,token:c.token,article_id:c.article_id,expected_model:'claude-test',topic:'电影行业',materials:'经过核实的公开事实资料。'.repeat(20),sources:[{title:'来源一',url:'https://example.com/one',published:day},{title:'来源二',url:'https://example.com/two',published:day}]};
await assert.rejects(cl.claudeCall('a','generate_claude_article',args));assert.equal(calls,0,'legacy native daily tool must not call the model');
await assert.rejects(cl.prepareClaudeDailyRun('b',args));
for(const outline of invalidOutlines)await assert.rejects(cl.prepareClaudeDailyRun('a',{...args,outline}),/框架/);
assert.equal(calls,0);assert.equal(JSON.parse(sql.prepare('SELECT input_snapshot FROM writing_runs WHERE article_id=?').get(c.article_id).input_snapshot).state,'awaiting_materials');
const prepared=await cl.prepareClaudeDailyRun('a',args);
const frozenBefore=sql.prepare('SELECT input_snapshot FROM writing_runs WHERE article_id=?').get(c.article_id).input_snapshot;
const changedOutline=testOutline.replace('观众留下的那张票','影院留下的那张票');
await assert.rejects(cl.prepareClaudeDailyRun('a',{...args,outline:changedOutline}),/冻结/);
await assert.rejects(cl.executeClaudeDailyRun({...prepared,input:{...prepared.input,outline:changedOutline}}),/冻结/);
assert.equal(sql.prepare('SELECT input_snapshot FROM writing_runs WHERE article_id=?').get(c.article_id).input_snapshot,frozenBefore);assert.equal(calls,0);
assert.equal(prepared.snapshot.system_prompt.includes('title是唯一标题字段'),true);assert.equal(prepared.snapshot.system_prompt.includes('paragraphs仅包含正文段落'),true);assert.equal(prepared.snapshot.system_prompt.includes('w:pStyle=Heading1'),true);assert.equal(prepared.snapshot.system_prompt.includes('有余'),false);
const result=await cl.executeClaudeDailyRun(prepared);assert.equal(result.state,'completed');assert.equal(result.saved,false,'short mock article remains a recoverable completed result');assert.equal(lastMaxTokens,14000);assert.equal(calls,1);assert.equal(result.requested_model,'claude-test');
assert.equal(lastRequest.system,load('claude-prompt').providerSystemPrompt(load('writing-supplement').effectiveWritingPrompt));
assert.equal(lastRequest.system.includes(load('writing-fixed-references').fixedWritingReferences),true);
assert.equal(lastRequest.system.includes(load('writing-fixed-references').proseReference),true);
assert.equal(lastRequest.messages[0].content,prepared.snapshot.user_prompt);assert.equal(lastRequest.messages[0].content.includes(testOutline),true);

const repeat=await cl.executeClaudeDailyRun(prepared);assert.equal(repeat.state,'completed');assert.equal(repeat.cached,true);assert.equal(repeat.saved,false);assert.equal(calls,1);assert.equal(sql.prepare('SELECT state FROM articles WHERE id=?').get(c.article_id),undefined,'cached completed results are not auto-saved by a repeated generation request');
const dailyRead=await cl.claudeCall('a','read_claude_daily_result',{day});assert.equal(dailyRead.state,'completed');assert.equal(dailyRead.text,responseText);assert.equal(dailyRead.partial_text,null);assert.equal(dailyRead.snapshot.article_id,c.article_id);assert.equal(dailyRead.snapshot.max_output_tokens,14000);assert.equal(dailyRead.snapshot.system_prompt_sha256.length,64);assert.equal(JSON.stringify(dailyRead).includes(c.token),false);assert.equal((await cl.claudeCall('b','read_claude_daily_result',{day})).state,'not_found');
await assert.rejects(cl.executeClaudeDailyRun({...prepared,input:{...prepared.input,token:'00000000-0000-4000-8000-000000000000'}}));assert.equal(calls,1);
const shortArticle={title:'标题',paragraphs:['正文']};
await assert.rejects(w.writingCall('a','save_writing_article',{day,writer:'claude',run_kind:'daily',token:c.token,...shortArticle,topic:'伪造选题',sources:args.sources}),/绑定的选题|资料已冻结/);
await assert.rejects(w.writingCall('a','save_writing_article',{day,writer:'claude',run_kind:'daily',token:c.token,...shortArticle,topic:args.topic,sources:[{...args.sources[0],title:'伪造来源'},args.sources[1]]}),/绑定的选题|资料已冻结/);
const canonicalSources=args.sources.map(source=>({...source,url:source.url.replace('https://example.com','https://example.com:443')}));
await assert.rejects(w.writingCall('a','save_writing_article',{day,writer:'claude',run_kind:'daily',token:c.token,...shortArticle,topic:args.topic,sources:canonicalSources}),/正文目标2000–3000字/,'equivalent normalized URLs must pass provenance binding');
await assert.rejects(w.writingCall('a','save_writing_article',{day,writer:'claude',run_kind:'daily',token:c.token,title:'伪造标题',paragraphs:shortArticle.paragraphs,topic:args.topic,sources:args.sources}),/实际生成结果/);
await cl.configureClaude('c',{model:'claude-test',api_key:'test-api-key-12345',enabled:true,consent:true});const cc=await w.writingCall('c','claim_writing_run',{day,writer:'claude'});fail=true;
const failedPrepared=await cl.prepareClaudeDailyRun('c',{...args,article_id:cc.article_id,token:cc.token});
const failedDaily=await cl.executeClaudeDailyRun(failedPrepared);assert.equal(failedDaily.state,'failed');assert.equal(lastMaxTokens,14000);assert.equal(calls,2);
assert.equal((await cl.executeClaudeDailyRun(failedPrepared)).state,'failed');assert.equal(calls,2);
assert.equal((await cl.claudeStatus('a')).max_output_tokens,14000);
console.log('Claude: encrypted credentials, explicit consent, owner isolation, per-author dedup, fixed destination, cached success and failed-request no retry passed');
const beforeConfig=await cl.claudeStatus('a');
assert.deepEqual(Array.from((await cl.listClaudeModels('a')).models),['claude-test']);
assert.deepEqual(Array.from((await cl.listClaudeModels('unused','another-test-key-6789')).models),['claude-test']);
assert.equal((await cl.claudeStatus('unused')).configured,false);
assert.deepEqual(await cl.claudeStatus('a'),beforeConfig);
await assert.rejects(cl.listClaudeModels('unused'));
await assert.rejects(cl.listClaudeModels('unused','bad key'));
console.log('Model picker: saved/unsaved key lookup, no config persistence, owner isolation and input validation passed');

fail=false;const dailyBefore=JSON.stringify(sql.prepare("SELECT * FROM claude_attempts WHERE id=?").get('a:'+day));
await assert.rejects(cl.testClaudeConnection('a',false));assert.equal(calls,2);
const probe=await cl.testClaudeConnection('a',true);assert.equal(probe.state,'completed');assert.equal(probe.exact_match,true);assert.equal(lastMaxTokens,32);assert.equal(calls,3);
const probeAgain=await cl.testClaudeConnection('a',true);assert.equal(probeAgain.cached,true);assert.equal(calls,3);assert.equal((await cl.claudeStatus('a')).connection_test.exact_match,true);
assert.equal(JSON.stringify(sql.prepare("SELECT * FROM claude_attempts WHERE id=?").get('a:'+day)),dailyBefore);
console.log('One-off minimal probe explicit consent, cached replay, safe readback and daily quota isolation passed');
const formalBefore=JSON.stringify(sql.prepare("SELECT * FROM claude_attempts WHERE id=?").get('a:'+day));
await assert.rejects(w.writingCall('a','claim_writing_run',{day,writer:'claude',run_kind:'workflow_test'}));
const workflowClaim=await w.writingCall('a','claim_writing_run',{day,writer:'claude',run_kind:'workflow_test',confirm_test:true});assert.equal(workflowClaim.claimed,true);
await assert.rejects(cl.claudeCall('a','generate_claude_article',{...args,token:workflowClaim.token,run_kind:'workflow_test'}));
const testArticle=await cl.claudeCall('a','generate_claude_article',{...args,token:workflowClaim.token,run_kind:'workflow_test',confirm_test:true});assert.equal(testArticle.state,'completed');assert.equal(lastMaxTokens,7000);assert.equal(calls,4);
assert.equal((await cl.claudeCall('a','generate_claude_article',{...args,token:workflowClaim.token,run_kind:'workflow_test',confirm_test:true})).already_attempted,true);assert.equal(calls,4);
assert.equal(JSON.stringify(sql.prepare("SELECT * FROM claude_attempts WHERE id=?").get('a:'+day)),formalBefore);
console.log('Separately authorized full-workflow test preserves formal daily and minimal-probe namespaces, with no extra retry');

await assert.rejects(w.writingCall('alias-user','claim_workflow_test',{day,writer:'xiaoyu'}));const aliasClaim=await w.writingCall('alias-user','claim_workflow_test',{day,writer:'xiaoyu',confirm:true});assert.equal(aliasClaim.claimed,true);assert.equal(sql.prepare("SELECT run_kind FROM writing_runs WHERE owner='alias-user'").get().run_kind,'workflow_test');assert.equal(sql.prepare("SELECT count(*) n FROM writing_runs WHERE owner='alias-user' AND run_kind='daily'").get().n,0);console.log('Dedicated test claim alias cannot consume a daily slot');
// Explicitly requested single retry: separate immutable attempt and exact test identity.
await cl.configureClaude('retry-user',{model:'claude-test',api_key:'test-api-key-12345',enabled:true,consent:true});
const rc=await w.writingCall('retry-user','claim_workflow_test',{day,writer:'claude',confirm:true});
const ra={...args,token:rc.token,article_id:rc.article_id,confirm:true};
const beforeRetry=calls;
await assert.rejects(cl.claudeCall('retry-user','retry_claude_test_article_once',ra));assert.equal(calls,beforeRetry);
fail=true;await assert.rejects(cl.claudeCall('retry-user','generate_claude_test_article',ra));
const originalFailed=JSON.stringify(sql.prepare('SELECT * FROM claude_attempts WHERE id=?').get('workflow-test:retry-user:'+day));
const safeStatus=await cl.claudeStatus('retry-user');assert.equal(safeStatus.writing_attempts.workflow_test.diagnostic.http_status,500);assert.equal(safeStatus.writing_attempts.workflow_test.diagnostic.code,'upstream_http_error');assert.equal(safeStatus.writing_attempts.daily,null);
await assert.rejects(cl.claudeCall('retry-user','retry_claude_test_article_once',{...ra,confirm:false}));
await assert.rejects(cl.claudeCall('retry-user','retry_claude_test_article_once',{...ra,article_id:'wrong'}));
await assert.rejects(cl.claudeCall('retry-user','retry_claude_test_article_once',{...ra,token:'wrong'}));
await assert.rejects(cl.claudeCall('other-owner','retry_claude_test_article_once',ra));assert.equal(calls,beforeRetry+1);
fail=false;
const retries=await Promise.all([cl.claudeCall('retry-user','retry_claude_test_article_once',ra),cl.claudeCall('retry-user','retry_claude_test_article_once',ra)]);
assert.equal(retries.filter(x=>x.state==='completed').length,1);assert.equal(calls,beforeRetry+2);
assert.equal((await cl.claudeCall('retry-user','retry_claude_test_article_once',ra)).already_attempted,true);assert.equal(calls,beforeRetry+2);
assert.equal(JSON.stringify(sql.prepare('SELECT * FROM claude_attempts WHERE id=?').get('workflow-test:retry-user:'+day)),originalFailed);
assert.equal(sql.prepare('SELECT count(*) n FROM claude_attempts WHERE id=?').get('retry-user:'+day).n,0);
assert.equal(cl.wordDeliveryInstructions.includes('不要伪造文件'),true);
assert.equal(JSON.stringify(await cl.claudeStatus('retry-user')).includes('test-api-key'),false);
console.log('Explicit retry: confirmed failed test only, exact article, owner and lease checks, concurrency dedup, old attempt immutable, no daily quota, safe diagnostics passed');

// A separately approved higher-output retry requires an actual truncated preceding retry.
await cl.configureClaude('extended-user',{model:'claude-test',api_key:'test-api-key-12345',enabled:true,consent:true});
const ec=await w.writingCall('extended-user','claim_workflow_test',{day,writer:'claude',confirm:true});
const ea={...args,token:ec.token,article_id:ec.article_id,confirm:true};
await assert.rejects(cl.claudeCall('extended-user','retry_claude_test_article_14000',ea));
sql.prepare('INSERT INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,?,?,?)').run('workflow-test-retry:extended-user:'+day,'extended-user',day,'failed',JSON.stringify({diagnostic:{code:'timeout'}}),new Date().toISOString());
await assert.rejects(cl.claudeCall('extended-user','retry_claude_test_article_14000',ea));
sql.prepare('UPDATE claude_attempts SET response=? WHERE id=?').run(JSON.stringify({diagnostic:{code:'output_truncated'}}),'workflow-test-retry:extended-user:'+day);
await assert.rejects(cl.claudeCall('extended-user','retry_claude_test_article_14000',{...ea,confirm:false}));
const extendedBefore=calls;const er=await cl.claudeCall('extended-user','retry_claude_test_article_14000',ea);assert.equal(er.state,'completed');assert.equal(lastMaxTokens,14000);assert.equal(calls,extendedBefore+1);
assert.equal((await cl.claudeCall('extended-user','retry_claude_test_article_14000',ea)).already_attempted,true);assert.equal(calls,extendedBefore+1);assert.equal(sql.prepare('SELECT count(*) n FROM claude_attempts WHERE id=?').get('extended-user:'+day).n,0);
console.log('14000-token retry is explicit, truncated-only, single-call and daily-isolated');
const retryRoute={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/claude/retry-test/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:retryRoute,require:n=>n.endsWith('/test-store')?{db:()=>db,owner:r=>r.headers.get('test-owner')}:n.endsWith('/claude')?cl:n.endsWith('/legacy-generation')?load('legacy-generation'):null,Response,URL});
const recoveryRequest=(owner,origin,body)=>new Request('https://example.com/api/claude/retry-test',{method:'POST',headers:{'content-type':'application/json','test-owner':owner||'','origin':origin,'x-xiaoyu-retry':'1'},body:JSON.stringify(body)});
assert.equal((await retryRoute.POST(recoveryRequest('','https://example.com',ea))).status,401);
assert.equal((await retryRoute.POST(recoveryRequest('extended-user','https://evil.test',ea))).status,403);
assert.equal((await retryRoute.POST(recoveryRequest('wrong-owner','https://example.com',ea))).status,410);
assert.equal((await retryRoute.POST(recoveryRequest('extended-user','https://example.com',{...ea,confirm:false}))).status,410);
const beforeRoute=calls;const routeResponse=await retryRoute.POST(recoveryRequest('extended-user','https://example.com',ea));assert.equal(routeResponse.status,410);assert.equal((await routeResponse.json()).model_request_sent,false);assert.equal(calls,beforeRoute);
console.log('Retired recovery UI route: owner, same-origin and zero provider requests passed');

// Approved V2 rewrite is a distinct once-only call, preserving prior test and daily.
const v2before=JSON.stringify(sql.prepare("SELECT * FROM claude_attempts WHERE owner='a'").all());
await assert.rejects(w.writingCall('a','claim_claude_rewrite_v2',{day}));
const v2c=await w.writingCall('a','claim_claude_rewrite_v2',{day,confirm:true});assert.equal(v2c.claimed,true);assert.notEqual(v2c.article_id,workflowClaim.article_id);
const v2sources=[{title:'事实来源一',url:'https://example.com/1',published:day},{title:'事实来源二',url:'https://example.com/2',published:day}];const v2a={...args,token:v2c.token,confirm:true,expected_model:'claude-test',sources:v2sources};
const v2calls=calls;
await assert.rejects(cl.claudeCall('a','generate_claude_rewrite_v2',{...v2a,confirm:false}));
await assert.rejects(cl.claudeCall('a','generate_claude_rewrite_v2',{...v2a,expected_model:'wrong'}));
await assert.rejects(cl.claudeCall('a','generate_claude_rewrite_v2',{...v2a,token:'wrong'}));
await assert.rejects(cl.claudeCall('wrong-owner','generate_claude_rewrite_v2',v2a));assert.equal(calls,v2calls);
const v2results=await Promise.all([cl.claudeCall('a','generate_claude_rewrite_v2',v2a),cl.claudeCall('a','generate_claude_rewrite_v2',v2a)]);
assert.equal(calls,v2calls+1);assert.equal(lastMaxTokens,14000);assert.equal(lastSystem.startsWith(load('writing-rewrite-v2').rewritePrompt),true);assert.equal(lastSystem.includes('title是唯一标题字段'),true);assert.equal(lastSystem.includes('w:pStyle=Heading1'),true);assert.equal(lastSystem.includes('有余'),false);assert.equal(lastSystem.includes('正文2500–3500'),false);assert.equal(lastSystem.includes('每段不超过120'),false);
assert.equal((await cl.claudeCall('a','generate_claude_rewrite_v2',v2a)).already_attempted,true);assert.equal(calls,v2calls+1);
assert.equal(JSON.stringify(sql.prepare("SELECT * FROM claude_attempts WHERE owner='a' AND id NOT LIKE 'workflow-rewrite-v2:%'").all()),v2before);
await assert.rejects(cl.claudeCall('a','generate_claude_rewrite_v2',{...v2a,topic:'不同选题'}));assert.equal(calls,v2calls+1);
const v2body=Array(25).fill('文'.repeat(100)),v2generated={title:'新的测试标题',paragraphs:['新的测试标题',...v2body]};
sql.prepare('UPDATE claude_attempts SET response=? WHERE id=?').run(JSON.stringify({text:JSON.stringify(v2generated),request:{topic:'电影行业',sources:v2sources}}),'workflow-rewrite-v2:a:'+day);
const v2save={day,token:v2c.token,topic:'电影行业',...v2generated,sources:[{title:'事实来源一',url:'https://example.com/1',published:day},{title:'事实来源二',url:'https://example.com/2',published:day}]};
await assert.rejects(w.writingCall('a','save_claude_rewrite_v2',{...v2save,title:'被改写了'}));
v2save.sources=v2sources.map(s=>({url:s.url,published:s.published,title:s.title}));
const v2dispatch=dispatches;assert.equal((await w.writingCall('a','save_claude_rewrite_v2',v2save)).saved,true);assert.equal(dispatches,v2dispatch);const savedV2Paragraphs=JSON.parse(sql.prepare('SELECT paragraphs FROM articles WHERE id=?').get(v2c.article_id).paragraphs);assert.deepEqual(savedV2Paragraphs,[v2generated.title,...v2body]);assert.equal(savedV2Paragraphs.filter(p=>p===v2generated.title).length,1);
assert.equal((await w.writingCall('a','save_claude_rewrite_v2',v2save)).already_saved,true);assert.equal(dispatches,v2dispatch);
console.log('V2 independent rewrite: full exact prompt, configured-model guard, explicit one-shot14000, provenance, immutable old tests, unchanged daily quota and automatic dispatch passed');
// Explicit user retry after confirmed cancellation uses a distinct immutable attempt.
await cl.configureClaude('v2-canceled',{model:'claude-test',api_key:'test-api-key-12345',enabled:true,consent:true});
const cancelClaim=await w.writingCall('v2-canceled','claim_claude_rewrite_v2',{day,confirm:true});
sql.prepare('INSERT INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,?,?,?)').run('workflow-rewrite-v2:v2-canceled:'+day,'v2-canceled',day,'requested','{}',new Date(Date.now()-130000).toISOString());
const canceledBefore=JSON.stringify(sql.prepare('SELECT * FROM claude_attempts WHERE id=?').get('workflow-rewrite-v2:v2-canceled:'+day));
const canceledArgs={...v2a,token:cancelClaim.token,article_id:cancelClaim.article_id};const callsBeforeCanceled=calls;
await assert.rejects(cl.claudeCall('v2-canceled','retry_claude_rewrite_v2',{...canceledArgs,confirm:false}));
await assert.rejects(cl.claudeCall('v2-canceled','retry_claude_rewrite_v2',{...canceledArgs,article_id:'wrong'}));assert.equal(calls,callsBeforeCanceled);
assert.equal((await cl.claudeCall('v2-canceled','retry_claude_rewrite_v2',canceledArgs)).state,'completed');assert.equal(calls,callsBeforeCanceled+1);
assert.equal((await cl.claudeCall('v2-canceled','retry_claude_rewrite_v2',canceledArgs)).already_attempted,true);assert.equal(calls,callsBeforeCanceled+1);
assert.equal(JSON.stringify(sql.prepare('SELECT * FROM claude_attempts WHERE id=?').get('workflow-rewrite-v2:v2-canceled:'+day)),canceledBefore);
console.log('Explicit canceled V2 retry: prior identity and record preserved, exact article guard, one charge, cached recovery passed');

const parser=load('claude-article-parser');const rawExample='{"title":"原题","paragraphs":["原文带}和]仍保留","有余"}';const parsedExample=parser.parseClaudeArticle(rawExample);assert.equal(parsedExample.repair,'missing_final_paragraphs_array_bracket');assert.deepEqual(Array.from(parsedExample.article.paragraphs),['原文带}和]仍保留','有余']);const duplicateTitle=parser.parseClaudeArticle(JSON.stringify({title:'正式标题',paragraphs:['正式标题','正文自然提到正式标题','后续正文']}));assert.equal(duplicateTitle.removedTitleDuplicate,true);assert.deepEqual(Array.from(duplicateTitle.article.paragraphs),['正文自然提到正式标题','后续正文']);const similarTitle=parser.parseClaudeArticle(JSON.stringify({title:'正式标题',paragraphs:['正式标题，正文继续','正文里还会提到正式标题']}));assert.equal(similarTitle.removedTitleDuplicate,false);assert.deepEqual(Array.from(similarTitle.article.paragraphs),['正式标题，正文继续','正文里还会提到正式标题']);
assert.throws(()=>parser.parseClaudeArticle('{"title":"题","paragraphs":["文",}'));assert.throws(()=>parser.parseClaudeArticle('正文还没完'));assert.equal(parser.parseClaudeArticle('{"title":"题","paragraphs":["文"]}').repair,null);
console.log('Claude deterministic structural repair preserves every title/paragraph character and rejects other malformed output');

// Owner-only streamed daily route: all assertions use an in-memory DB and the fake provider above.
const dailyRouteModule={};
const dailyRouteJs=ts.transpileModule(fs.readFileSync('app/api/claude/daily-run/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(dailyRouteJs,{exports:dailyRouteModule,require:n=>n.endsWith('/test-store')?{db:()=>db,owner:r=>r.headers.get('test-owner')||null}:n.endsWith('/claude')?cl:n.endsWith('/workflow-errors')?load('workflow-errors'):nativeRequire(n),Request,Response,TextEncoder,TextDecoder,Uint8Array,ReadableStream,URL,Date,setInterval,clearInterval,AbortSignal});
const makeDailyRequest=(owner,body,origin='https://example.com',header='1')=>new Request('https://example.com/api/claude/daily-run',{method:'POST',headers:{origin,'x-xiaoyu-daily-run':header,'test-owner':owner||''},body:typeof body==='string'?body:JSON.stringify(body)});
responseText=JSON.stringify({title:'日更本地测试标题',paragraphs:Array.from({length:20},()=> '文'.repeat(100))});
await cl.configureClaude('route-owner',{model:'claude-test',api_key:'test-api-key-12345',enabled:true,consent:true});
const routeClaim=await w.writingCall('route-owner','claim_writing_run',{day,writer:'claude'});assert.equal(routeClaim.claimed,true);
const dailyBody={...args,article_id:routeClaim.article_id,token:routeClaim.token};
const beforeDailyRouteCalls=calls;
assert.equal((await dailyRouteModule.POST(makeDailyRequest('',dailyBody))).status,401);
assert.equal((await dailyRouteModule.POST(makeDailyRequest('route-owner',dailyBody,'https://not-example.com'))).status,403);
assert.equal((await dailyRouteModule.POST(makeDailyRequest('route-owner',dailyBody,'https://example.com',''))).status,403);
assert.equal((await dailyRouteModule.POST(makeDailyRequest('route-owner','{bad json'))).status,400);
assert.equal((await dailyRouteModule.POST(makeDailyRequest('route-owner',{...dailyBody,run_kind:'workflow_test'}))).status,400);
assert.equal((await dailyRouteModule.POST(makeDailyRequest('route-owner',{...dailyBody,day:'1999-01-01'}))).status,400);
assert.equal((await dailyRouteModule.POST(makeDailyRequest('route-owner',{...dailyBody,article_id:'00000000-0000-4000-8000-000000000000'}))).status,400);
assert.equal((await dailyRouteModule.POST(makeDailyRequest('route-owner',{...dailyBody,token:'00000000-0000-4000-8000-000000000000'}))).status,400);
assert.equal((await dailyRouteModule.POST(makeDailyRequest('route-owner',{...dailyBody,expected_model:'claude-other'}))).status,400);
assert.equal((await dailyRouteModule.POST(makeDailyRequest('route-owner',{...dailyBody,materials:'too short'}))).status,400);
assert.equal((await dailyRouteModule.POST(makeDailyRequest('route-owner',{...dailyBody,sources:[{title:'x',url:'http://example.com',published:day},{title:'y',url:'https://example.com',published:day}]}))).status,400);
assert.equal((await dailyRouteModule.POST(makeDailyRequest('route-owner',{...dailyBody,materials:'x'.repeat(120500)}))).status,413);
assert.equal(sql.prepare('SELECT response FROM claude_attempts WHERE id=?').get('route-owner:'+day),undefined,'invalid requests reserve no attempt');
await cl.configureClaude('route-owner',{model:'claude-test',api_key:'test-api-key-12345',enabled:false,consent:true});
assert.equal((await dailyRouteModule.POST(makeDailyRequest('route-owner',dailyBody))).status,400,'disabled Claude is rejected before reservation');
await cl.configureClaude('route-owner',{model:'claude-test',api_key:'test-api-key-12345',enabled:true,consent:true});
sql.prepare('UPDATE writing_runs SET expires=? WHERE owner=? AND day=? AND writer=? AND run_kind=?').run(new Date(Date.now()-1000).toISOString(),'route-owner',day,'claude','daily');
assert.equal((await dailyRouteModule.POST(makeDailyRequest('route-owner',dailyBody))).status,400,'expired lease is rejected before reservation');
sql.prepare('UPDATE writing_runs SET expires=? WHERE owner=? AND day=? AND writer=? AND run_kind=?').run(new Date(Date.now()+3600000).toISOString(),'route-owner',day,'claude','daily');
assert.equal(calls,beforeDailyRouteCalls,'invalid daily form attempts never call the provider');
const beforeRouteDispatch=dispatches;
const streamed=await dailyRouteModule.POST(makeDailyRequest('route-owner',dailyBody));assert.equal(streamed.status,200);assert.match(streamed.headers.get('content-type'),/application\/x-ndjson/);
const streamedText=await streamed.text();const dailyEvents=streamedText.trim().split('\n').map(line=>JSON.parse(line));assert.equal(dailyEvents[0].type,'running');assert.equal(dailyEvents.at(-1).terminal,true);assert.equal(dailyEvents.at(-1).success,true);assert.equal(streamedText.includes(routeClaim.token),false);
assert.equal(calls,beforeDailyRouteCalls+1);assert.equal(lastMaxTokens,14000);assert.equal(dispatches,beforeRouteDispatch);
const storedDaily=sql.prepare('SELECT state,response FROM claude_attempts WHERE id=?').get('route-owner:'+day);const storedDailyData=JSON.parse(storedDaily.response);assert.equal(storedDaily.state,'completed');assert.equal(storedDailyData.saved,true);assert.equal(storedDailyData.snapshot.article_id,routeClaim.article_id);assert.equal(storedDailyData.snapshot.max_output_tokens,14000);assert.equal(JSON.stringify(storedDailyData).includes(routeClaim.token),false);
const queuedDaily=sql.prepare('SELECT state FROM articles WHERE id=?').get(routeClaim.article_id);assert.equal(queuedDaily.state,'text_saved');assert.equal(sql.prepare("SELECT state FROM writing_runs WHERE owner='route-owner' AND day=? AND writer='claude' AND run_kind='daily'").get(day).state,'text_saved');
const routeReadBefore=sql.prepare('SELECT state,response FROM claude_attempts WHERE id=?').get('route-owner:'+day);const routeRead=await cl.claudeCall('route-owner','read_claude_daily_result',{day});assert.equal(routeRead.state,'completed');assert.equal(routeRead.text,responseText);assert.equal(routeRead.saved,true);assert.equal(JSON.stringify(routeRead).includes(routeClaim.token),false);await cl.claudeCall('route-owner','read_claude_daily_result',{day});assert.deepEqual(sql.prepare('SELECT state,response FROM claude_attempts WHERE id=?').get('route-owner:'+day),routeReadBefore,'daily result reader is read-only');
assert.equal(calls,beforeDailyRouteCalls+1);assert.equal(dispatches,beforeRouteDispatch);
await cl.configureClaude('route-failure-owner',{model:'claude-test',api_key:'test-api-key-12345',enabled:true,consent:true});const deliveryFailClaim=await w.writingCall('route-failure-owner','claim_writing_run',{day,writer:'claude'});const deliveryFailArgs={...dailyBody,article_id:deliveryFailClaim.article_id,token:deliveryFailClaim.token};dispatchState='知乎连接失败';const beforeDeliveryFailureDispatch=dispatches;
const deliveryFailureResponse=await dailyRouteModule.POST(makeDailyRequest('route-failure-owner',deliveryFailArgs));const deliveryFailureEvents=(await deliveryFailureResponse.text()).trim().split('\n').map(line=>JSON.parse(line));assert.equal(deliveryFailureEvents.at(-1).success,true,'article persistence succeeded');assert.equal(deliveryFailureEvents.at(-1).state,'文字稿已在网站保存，已完成');assert.equal(deliveryFailureEvents.at(-1).state.includes('交给小鱼'),false,'notification failure must not claim handoff');assert.equal(dispatches,beforeDeliveryFailureDispatch);assert.equal(sql.prepare("SELECT state FROM writing_runs WHERE owner='route-failure-owner' AND day=? AND writer='claude' AND run_kind='daily'").get(day).state,'text_saved');dispatchState='事件已送达';
await cl.configureClaude('partial-owner',{model:'claude-test',api_key:'test-api-key-12345',enabled:true,consent:true});const partialClaim=await w.writingCall('partial-owner','claim_writing_run',{day,writer:'claude'});const partialArgs={...dailyBody,article_id:partialClaim.article_id,token:partialClaim.token};const beforePartialCalls=calls;partialFailure=true;
const partialPrepared=await cl.prepareClaudeDailyRun('partial-owner',partialArgs);const partialResult=await cl.executeClaudeDailyRun(partialPrepared);partialFailure=false;assert.equal(partialResult.state,'failed');assert.equal(partialResult.error,'模型响应读取中断');assert.equal(partialResult.partial_text,'第一段\n第二段未完');assert.equal(partialResult.usage.output_tokens,14000);assert.equal(calls,beforePartialCalls+1);
const partialRead=await cl.claudeCall('partial-owner','read_claude_daily_result',{day});assert.equal(partialRead.state,'failed');assert.equal(partialRead.incomplete,true);assert.equal(partialRead.text,null);assert.equal(partialRead.partial_text,'第一段\n第二段未完');assert.equal(partialRead.raw_partial_response,partialRawText,'every received provider response character survives the interruption');assert.equal(partialRead.usage.input_tokens,17);assert.equal(partialRead.usage.output_tokens_details,undefined);assert.equal(partialRead.usage.thinking_tokens,9);assert.equal(partialRead.diagnostic.stop_reason,'max_tokens');assert.equal(JSON.stringify(partialRead).includes(partialClaim.token),false);
assert.equal((await cl.executeClaudeDailyRun(partialPrepared)).state,'failed');assert.equal(calls,beforePartialCalls+1,'failed partial response is never retried');
responseText='{"title":"标题","paragraphs":["正文"]}';await cl.configureClaude('save-error-owner',{model:'claude-test',api_key:'test-api-key-12345',enabled:true,consent:true});const saveErrorClaim=await w.writingCall('save-error-owner','claim_writing_run',{day,writer:'claude'});const saveErrorPrepared=await cl.prepareClaudeDailyRun('save-error-owner',{...dailyBody,article_id:saveErrorClaim.article_id,token:saveErrorClaim.token});
const originalPrepare=db.prepare;db.prepare=function(statement){const prepared=originalPrepare(statement);if(statement==='UPDATE claude_attempts SET state=?,response=? WHERE id=? AND owner=?')return {bind:(...values)=>{let next;try{next=JSON.parse(values[1]);}catch{}if(values[0]==='completed'&&next?.save_error)return {run:async()=>{throw Error('mock save_error write failure');}};return prepared.bind(...values);}};return prepared;};
const beforeSaveErrorCalls=calls;let saveErrorOutcome;try{saveErrorOutcome=await cl.executeClaudeDailyRun(saveErrorPrepared);}finally{db.prepare=originalPrepare;}assert.equal(saveErrorOutcome.state,'completed');assert.equal(saveErrorOutcome.saved,false);assert.equal(calls,beforeSaveErrorCalls+1);
const stillCompleted=await cl.claudeCall('save-error-owner','read_claude_daily_result',{day});assert.equal(stillCompleted.state,'completed','save-error persistence failure cannot downgrade a durable generation result');assert.equal(stillCompleted.text,responseText);assert.equal(stillCompleted.snapshot.article_id,saveErrorClaim.article_id);assert.equal(JSON.stringify(stillCompleted).includes(saveErrorClaim.token),false);
responseText=JSON.stringify({title:'并发日更测试标题',paragraphs:Array.from({length:20},()=> '文'.repeat(100))});await cl.configureClaude('race-owner',{model:'claude-test',api_key:'test-api-key-12345',enabled:true,consent:true});const raceClaim=await w.writingCall('race-owner','claim_writing_run',{day,writer:'claude'});const raceBody={...dailyBody,article_id:raceClaim.article_id,token:raceClaim.token};fakeLatency=100;const beforeRaceCalls=calls,beforeRaceDispatches=dispatches;
const providerStarted=new Promise(resolve=>{providerRequestStarted=resolve;});
const raceResponses=await Promise.all([dailyRouteModule.POST(makeDailyRequest('race-owner',raceBody)),dailyRouteModule.POST(makeDailyRequest('race-owner',raceBody))]);const raceTextPromises=raceResponses.map(response=>response.text());await Promise.race([providerStarted,...raceTextPromises.map(p=>p.then(()=>{throw Error('race route ended before provider reservation');}))]);const pendingRow=sql.prepare('SELECT state,response FROM claude_attempts WHERE id=?').get('race-owner:'+day);assert.equal(pendingRow.state,'requested');const raceReadBefore=JSON.stringify(pendingRow);const pendingRaceRead=await cl.claudeCall('race-owner','read_claude_daily_result',{day});assert.equal(pendingRaceRead.state,'requested');assert.equal(pendingRaceRead.text,null);assert.equal(JSON.stringify(pendingRaceRead).includes(raceClaim.token),false);assert.equal(JSON.stringify(sql.prepare('SELECT state,response FROM claude_attempts WHERE id=?').get('race-owner:'+day)),raceReadBefore,'reading a requested attempt does not mutate it');
const raceEvents=(await Promise.all(raceTextPromises)).map(raw=>raw.trim().split('\n').map(line=>JSON.parse(line))).flat();assert.equal(calls,beforeRaceCalls+1,'concurrent same-input POSTs reserve and charge once');assert.equal(dispatches,beforeRaceDispatches,'concurrent daily posts queue once');assert.equal(raceEvents.filter(event=>event.terminal&&event.success).length,1);fakeLatency=0;
responseText='{"title":"标题","paragraphs":["正文"]}';
console.log('Daily helper route: owner/origin/header/body/claim/config/lease validation, daily 14k, concurrent atomic reservation, pending/partial read-only results, NDJSON terminal, immutable save/queue once, D1 save-error protection, notification failure never claims delivery, no token exposure passed');
// A credential echoed by a hostile provider is never exposed through the daily reader.
await cl.configureClaude('echo-owner',{model:'claude-test',api_key:'test-api-key-12345',enabled:true,consent:true});const echoClaim=await w.writingCall('echo-owner','claim_writing_run',{day,writer:'claude'});const echoArgs={...dailyBody,article_id:echoClaim.article_id,token:echoClaim.token};
const beforeEcho=calls;await assert.rejects(cl.prepareClaudeDailyRun('echo-owner',{...echoArgs,materials:echoArgs.materials+' '+echoClaim.token}),/密钥/);assert.equal(calls,beforeEcho);
responseText=JSON.stringify({title:'拒绝泄漏',paragraphs:['test-api-key-12345',echoClaim.token]});const echoPrepared=await cl.prepareClaudeDailyRun('echo-owner',echoArgs);assert.equal((await cl.executeClaudeDailyRun(echoPrepared)).state,'failed');const echoRead=await cl.readClaudeDailyResult('echo-owner',day);assert.equal(JSON.stringify(echoRead).includes('test-api-key-12345'),false);assert.equal(JSON.stringify(echoRead).includes(echoClaim.token),false);await cl.executeClaudeDailyRun(echoPrepared);assert.equal(calls,beforeEcho+1);
// Expiry at the atomic reserve boundary must prevent even the first provider request.
await cl.configureClaude('reserve-expiry-owner',{model:'claude-test',api_key:'test-api-key-12345',enabled:true,consent:true});const expiryClaim=await w.writingCall('reserve-expiry-owner','claim_writing_run',{day,writer:'claude'});const expiryPrepared=await cl.prepareClaudeDailyRun('reserve-expiry-owner',{...dailyBody,article_id:expiryClaim.article_id,token:expiryClaim.token});
const beforeExpiry=calls,basePrepare=db.prepare;db.prepare=statement=>{const result=basePrepare(statement);if(statement.startsWith('INSERT OR IGNORE INTO claude_attempts')&&statement.includes('SELECT'))return {bind:(...args)=>{sql.prepare('UPDATE writing_runs SET expires=? WHERE owner=?').run('2000-01-01T00:00:00.000Z','reserve-expiry-owner');return result.bind(...args);}};return result;};try{await assert.rejects(cl.executeClaudeDailyRun(expiryPrepared));}finally{db.prepare=basePrepare;}assert.equal(calls,beforeExpiry);assert.equal(sql.prepare('SELECT count(*) n FROM claude_attempts WHERE owner=?').get('reserve-expiry-owner').n,0);
console.log('Daily secret echo redaction, material-token rejection, failed-result no retry and expiry-at-reservation race passed');

// Frozen V2 input is authoritative even after the global fixed reference bundle changes.
const oldPrompt=load('writing-rewrite-v2').rewritePrompt,oldVersion=load('writing-rewrite-v2').rewriteVersion;
const oldSystem=load('claude-prompt').providerSystemPrompt(oldPrompt),hash=value=>createHash('sha256').update(value).digest('hex');
const beforeLegacyCalls=calls;
await cl.configureClaude('legacy-snapshot-owner',{model:'claude-test',api_key:'test-api-key-12345',enabled:true,consent:true});
const legacyClaim=await w.writingCall('legacy-snapshot-owner','claim_writing_run',{day,writer:'claude'});
const oldSkeleton={contract_version:1,state:'awaiting_materials',day,writer:'claude',writing_prompt:oldPrompt,prompt_version:oldVersion,prompt_sha256:hash(oldPrompt),system_prompt:oldSystem,system_prompt_sha256:hash(oldSystem)};
sql.prepare('UPDATE writing_runs SET input_snapshot=?,style_version=? WHERE article_id=?').run(JSON.stringify(oldSkeleton),oldVersion,legacyClaim.article_id);
const legacyArgs={...args,article_id:legacyClaim.article_id,token:legacyClaim.token};delete legacyArgs.outline;
const legacyPrepared=await cl.prepareClaudeDailyRun('legacy-snapshot-owner',legacyArgs);
assert.equal(legacyPrepared.snapshot.prompt_version,oldVersion);assert.equal(legacyPrepared.snapshot.prompt_sha256,hash(oldPrompt));assert.equal(legacyPrepared.snapshot.system_prompt,oldSystem);assert.equal(legacyPrepared.snapshot.outline,undefined);
assert.equal((await cl.prepareClaudeDailyRun('legacy-snapshot-owner',legacyArgs)).fingerprint,legacyPrepared.fingerprint);
responseText='{"title":"旧快照","paragraphs":["正文"]}';
await cl.executeClaudeDailyRun(legacyPrepared);assert.equal(calls,beforeLegacyCalls+1);assert.equal(lastRequest.system,oldSystem);assert.equal(lastRequest.system.includes(load('writing-fixed-references').fixedWritingReferences),false);
const oldFrozen=sql.prepare('SELECT input_snapshot FROM writing_runs WHERE article_id=?').get(legacyClaim.article_id).input_snapshot;
const oldAttempt=JSON.stringify(sql.prepare('SELECT * FROM claude_attempts WHERE id=?').get('legacy-snapshot-owner:'+day));
assert.equal((await cl.executeClaudeDailyRun(legacyPrepared)).cached,true);assert.equal(calls,beforeLegacyCalls+1);assert.equal(JSON.stringify(sql.prepare('SELECT * FROM claude_attempts WHERE id=?').get('legacy-snapshot-owner:'+day)),oldAttempt);assert.equal(sql.prepare('SELECT input_snapshot FROM writing_runs WHERE article_id=?').get(legacyClaim.article_id).input_snapshot,oldFrozen);

// No-snapshot claims cannot charge. Existing exact responses and fingerprints remain untouched.
for(const cached of [false,true]){
 const legacyOwner='legacy-empty-'+cached;await cl.configureClaude(legacyOwner,{model:'claude-test',api_key:'test-api-key-12345',enabled:true,consent:true});
 const claim=await w.writingCall(legacyOwner,'claim_writing_run',{day,writer:'claude'});sql.prepare('UPDATE writing_runs SET input_snapshot=NULL,style_version=? WHERE article_id=?').run(oldVersion,claim.article_id);
 if(cached)sql.prepare('INSERT INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,?,?,?)').run(legacyOwner+':'+day,legacyOwner,day,'completed',JSON.stringify({fingerprint:'original-legacy-fingerprint',snapshot:{...legacyPrepared.snapshot,article_id:claim.article_id},text:'原有完整结果',saved:false}),new Date().toISOString());
 const runsBefore=JSON.stringify(sql.prepare('SELECT * FROM writing_runs WHERE owner=?').all(legacyOwner)),attemptsBefore=JSON.stringify(sql.prepare('SELECT * FROM claude_attempts WHERE owner=?').all(legacyOwner)),callsBefore=calls;
 const input={...args,article_id:claim.article_id,token:claim.token};delete input.outline;
 await assert.rejects(cl.prepareClaudeDailyRun(legacyOwner,input),/旧日更任务缺少冻结输入/);await assert.rejects(cl.executeClaudeDailyRun({owner:legacyOwner,input,snapshot:legacyPrepared.snapshot,fingerprint:'forged'}),/旧日更任务缺少冻结输入/);
 const read=await cl.readClaudeDailyResult(legacyOwner,day);assert.equal(read.state,cached?'completed':'not_found');if(cached){assert.equal(read.text,'原有完整结果');assert.equal(read.snapshot.prompt_version,oldVersion);}
 assert.equal(calls,callsBefore);assert.equal(JSON.stringify(sql.prepare('SELECT * FROM writing_runs WHERE owner=?').all(legacyOwner)),runsBefore);assert.equal(JSON.stringify(sql.prepare('SELECT * FROM claude_attempts WHERE owner=?').all(legacyOwner)),attemptsBefore);
}

// Parser, preparation storage, NDJSON catch and returned-result errors all use fixed public messages.
function isolatedDailyRoute(implementation){const ex={};vm.runInNewContext(dailyRouteJs,{exports:ex,require:n=>n.endsWith('/test-store')?{owner:r=>r.headers.get('test-owner')||null}:n.endsWith('/claude')?implementation:n.endsWith('/workflow-errors')?load('workflow-errors'):nativeRequire(n),Request,Response,TextEncoder,TextDecoder,Uint8Array,ReadableStream,URL,Date,setInterval,clearInterval,AbortSignal});return ex;}
const leakSentinel='PRIVATE_JSON_SQL_SENTINEL';let isolatedExecutions=0;
const safeRoute=isolatedDailyRoute({prepareClaudeDailyRun:async()=>({}),executeClaudeDailyRun:async()=>{isolatedExecutions++;throw Error('SQLITE_ERROR table=private '+leakSentinel);}});
const parserResponse=await safeRoute.POST(makeDailyRequest('a','{"private":"'+leakSentinel+'"BROKEN'));
assert.equal(parserResponse.status,400);const parserBody=await parserResponse.text();assert.equal(parserBody.includes(leakSentinel),false);assert.equal(JSON.parse(parserBody).error,'日更资料未通过核验');assert.equal(isolatedExecutions,0);
const invalidUtf8=new Request('https://example.com/api/claude/daily-run',{method:'POST',headers:{origin:'https://example.com','x-xiaoyu-daily-run':'1','test-owner':'a'},body:Uint8Array.of(0xff)});
const invalidUtf8Response=await safeRoute.POST(invalidUtf8);assert.equal((await invalidUtf8Response.json()).error,'日更资料未通过核验');assert.equal(isolatedExecutions,0);
const storagePrepRoute=isolatedDailyRoute({prepareClaudeDailyRun:async()=>{throw Error('database SELECT secret '+leakSentinel);}});
const prepFailure=await storagePrepRoute.POST(makeDailyRequest('a',{}));assert.equal(prepFailure.status,400);assert.equal((await prepFailure.json()).error,'日更资料未通过核验');
const executionFailure=await safeRoute.POST(makeDailyRequest('a',{}));const executionEvents=(await executionFailure.text()).trim().split('\n').map(JSON.parse);assert.equal(executionEvents.at(-1).error,'结果尚未确认；不会自动再次调用');assert.equal(JSON.stringify(executionEvents).includes(leakSentinel),false);
const returnedErrorRoute=isolatedDailyRoute({prepareClaudeDailyRun:async()=>({}),executeClaudeDailyRun:async()=>({state:'failed',error:'database '+leakSentinel})});const returnedEvents=(await (await returnedErrorRoute.POST(makeDailyRequest('a',{}))).text()).trim().split('\n').map(JSON.parse);assert.equal(returnedEvents.at(-1).error,'结果尚未确认；不会自动再次调用');assert.equal(JSON.stringify(returnedEvents).includes(leakSentinel),false);
const fixedErrorRoute=isolatedDailyRoute({prepareClaudeDailyRun:async()=>{throw Error('提交资料过长');}});assert.equal((await fixedErrorRoute.POST(makeDailyRequest('a',{}))).status,413);
console.log('New daily complete fixed-reference/outline request, missing/incomplete/oversize/changed-outline zero-charge gates; frozen V2 prompt/hash/fingerprint compatibility; no-snapshot read-only recovery; daily JSON/UTF-8/preparation/NDJSON/returned-result error redaction passed');
