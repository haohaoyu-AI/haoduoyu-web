// Offline V68 regression matrix. All DB/provider/bucket/event operations are local mocks.
// No actual credentials, model request, network, production DB, push or deployment.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {createRequire} from 'node:module';import ts from 'typescript';
const native=createRequire(import.meta.url),sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
let batches=Promise.resolve(),calls=0,dispatches=0,puts=0,connected=true,response=null,providerState='completed',actualModel='claude-mock',hold=null;
let beforeRun=null,beforeBatch=null,throwDispatch=false,dispatchHook=null; const db={prepare(query){const bound=args=>({first:async()=>sql.prepare(query).get(...args)||null,all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>{if(beforeRun)await beforeRun(query,args);return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}});return{bind:(...args)=>bound(args)};},batch(statements){const task=batches.then(async()=>{if(beforeBatch)await beforeBatch(statements);sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}});batches=task.catch(()=>{});return task;}};
const model='claude-mock',secret='sk-synthetic-only-do-not-send-abcdefghijklmnop';
const claude={protectPreparedArticleForOwner:async(o,v)=>({hit:JSON.stringify(v).includes(secret)}),protectStepwiseOutputForOwner:async(o,v,tokens=[])=>({hit:JSON.stringify(v).includes(secret)||tokens.some(t=>JSON.stringify(v).includes(t))}),readClaudeOutputCapability:async()=>({max_output_tokens:32768,relay_limit_verified:true}),requestOutlineClaudeOnce:async(owner,input)=>{calls++;if(hold)await hold;return providerState==='completed'?{state:'completed',text:JSON.stringify(response),requested_model:input.model,returned_model:actualModel,usage:{input_tokens:30,output_tokens:2000},diagnostic:{http_status:200,stop_reason:'end_turn'}}:{state:'failed',error:'mock technical 524',diagnostic:{http_status:524,code:'upstream_http_error'}};}};
const globals={crypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Date,Error,URL,Request,Response,File,ReadableStream,AbortSignal,setInterval,clearInterval};const modules={};function load(name){if(modules[name])return modules[name];const ex={};modules[name]=ex;vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{...globals,exports:ex,require:x=>x==='cloudflare:workers'?{env:{DB:db}}:x==='./test-store'?{db:()=>db,owner:r=>r.headers.get('oai-authenticated-user-id')}:x==='./claude'?claude:x==='./articles'?{bucket:()=>({put:async()=>{puts++;}})}:x==='./events'?{readiness:async()=>({connected}),dispatch:async()=>{dispatches++;if(dispatchHook)await dispatchHook();if(throwDispatch)throw Error('Injected dispatch transport failure');return '事件已送达';}}:x.startsWith('./')?load(x.slice(2)):native(x),fetch:()=>{throw Error('Real network forbidden');}});return ex;}
const flow=load('editorial-flow'),prompt=load('writing-supplement'),hash=load('writing-input').hashText;
const day='2026-10-06',sources=[1,2].map(n=>({id:'S'+n,title:'Synthetic '+n,url:'https://example.com/'+n,published:day,event_date:day,accessed:day,context:'Synthetic observable source context on '+day})),facts=[{id:'E1',text:'合成公开材料，影片采用黑白画面。',source_ids:['S1'],context:'只用于离线测试'}];
const article={title:'合成测试标题',paragraphs:Array.from({length:30},(_,i)=>`第${i+1}段，`+'影片采用黑白画面，故事围绕日常生活展开，人物通过具体行动表达态度，作品呈现可见的场景。'.repeat(2))};
const outline={title:article.title,core_argument:'合成测试核心判断',opening:'合成公开画面',sections:[{heading:'第一节',target_chars:1000,fact_ids:['E1'],source_ids:['S1'],argument:'从公开画面推进判断'},{heading:'第二节',target_chars:1000,fact_ids:['E1'],source_ids:['S1'],argument:'用作品具体行动推进'}],turn:'合成测试转弯',ending:'落在作品画面',target_chars:2500,source_ids:['S1','S2'],fact_gaps:{blocked:false,items:[]}};
function args(owner){sql.prepare('INSERT OR IGNORE INTO claude_settings(owner,model,secret,enabled,updated) VALUES(?,?,?,?,?)').run(owner,model,'encrypted.mock','1',day);return{authorization_key:'v2-one',expected_model:model,expected_prompt_version:prompt.effectiveWritingStyleVersion,topic:'合成测试选题',angle:'观察作品如何呈现日常生活',style_requirements:'口语，幽默，保留观点力度',materials:'合成公开素材'.repeat(35),sources,facts,participants:Object.fromEntries(['writer','outline_reviewer','structure_reviewer','fact_checker','verifier'].map(name=>[name,{actor_id:crypto.randomUUID(),model:name==='writer'?model:'independent-'+name}])),confirm:true};}
async function create(owner){return flow.createEditorialFlow(owner,args(owner));}
async function read(owner,r){return flow.readEditorialFlow(owner,{run_id:r.run_id});}
async function claim(owner,r,stage){return flow.claimEditorialStage(owner,{run_id:r.run_id,stage,expected_snapshot_sha256:r.snapshot_sha256,confirm:true});}
async function write(owner,r,stage,value){response=value;const lease=await claim(owner,r,stage);const prepared=await flow.prepareEditorialStage(owner,{run_id:r.run_id,stage,token:lease.token,expected_model:model,expected_input_sha256:lease.input_sha256,confirm:true});const result=await flow.executeEditorialStage(prepared);if(!result.saved)await flow.recoverEditorialStage(owner,{run_id:r.run_id,stage,confirm:true});assert.equal(result.saved,true,JSON.stringify(result));return read(owner,r);}
function reviewer(r,stage){const role={outline_review:'outline_reviewer',structure_review:'structure_reviewer',fact_check:'fact_checker',final_verify:'verifier'}[stage];return r.snapshot.participants[role];}
async function review(owner,r,stage,report,lease){lease||=await claim(owner,r,stage);const actor=reviewer(r,stage);return flow.saveEditorialReview(owner,{run_id:r.run_id,stage,expected_snapshot_sha256:r.snapshot_sha256,expected_input_sha256:lease.input_sha256,actor_id:actor.actor_id,execution_id:crypto.randomUUID(),model:actor.model,raw_result:JSON.stringify(report),confirm:true});}
const pass={status:'completed',decision:'pass',reason:'完整核验合成输入与推进',issues:[]};
function factReport(a,passed=true,issues=[]){return{status:'completed',passed,coverage:[a.title,...a.paragraphs].map((quote,paragraph)=>({paragraph,quote,classification:paragraph?'fact':'opinion',verdict:paragraph?'confirmed':'not_applicable',source_ids:paragraph?['S1']:[],source_dates:paragraph?[day]:[],context:paragraph?'核对原文与事件日期 '+day:'作者观点'})),issues,unconfirmed:[],checks:{paragraphs:true,names:true,numbers:true,metaphors:true,quote_time_context:true}};}
const issue=(a,id,paragraph)=>({id,paragraph,quote:a.paragraphs[paragraph-1].slice(0,8),type:'logic',severity:'medium',basis:'合成测试论据不足',revision_goal:'依据公开材料补足具体画面'});
const legacyRows=()=>JSON.stringify(sql.prepare("SELECT * FROM writing_runs WHERE run_kind='daily'").all());sql.prepare('INSERT INTO writing_runs(id,owner,day,writer,run_kind,state,article_id,created,updated,input_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?)').run('legacy','legacy',day,'claude','daily','failed',crypto.randomUUID(),day,day,'{"legacy":true}');const beforeLegacy=legacyRows();
const failures=[];
async function check(name,fn){try{await fn();console.log('PASS '+name);}catch(error){failures.push({name,error});console.error('FAIL '+name+': '+error.message);}finally{beforeRun=null;beforeBatch=null;throwDispatch=false;dispatchHook=null;hold=null;providerState='completed';}}
function pause(owner,run_id){sql.prepare("INSERT INTO workflow_controls(owner,scope,run_id,state,reason,created,updated) VALUES(?,'editorial_v2',?,'paused','Offline concurrent pause',?,?)").run(owner,run_id,day,day);}
async function preparedOutline(owner){const r=await create(owner),l=await claim(owner,r,'outline');return {r,l,p:await flow.prepareEditorialStage(owner,{run_id:r.run_id,stage:'outline',token:l.token,expected_model:model,expected_input_sha256:l.input_sha256,confirm:true})};}
async function complete(owner){const r=await create(owner);await write(owner,r,'outline',outline);await review(owner,r,'outline_review',pass);await write(owner,r,'body',article);await review(owner,r,'structure_review',pass);for(const stage of ['structure_revision','fact_revision']){if(stage==='fact_revision')await review(owner,r,'fact_check',factReport(article));const l=await claim(owner,r,stage);await flow.skipEditorialRevision(owner,{run_id:r.run_id,stage,expected_snapshot_sha256:r.snapshot_sha256,expected_input_sha256:l.input_sha256,confirm:true});}await review(owner,r,'final_verify',factReport(article));return {r,freezeArgs:{run_id:r.run_id,expected_final_sha256:await hash(JSON.stringify(article)),confirm:true}};}

await check('artifact+phase storage failure rolls back together; same receipt recovers without provider retry',async()=>{
 const owner='v68-save-advance',{r,p}=await preparedOutline(owner),before=calls;response=outline;let injected=false;
 beforeRun=async(q,args)=>{if(!injected&&q.startsWith('UPDATE editorial_flows SET state=?')&&args[0]==='outline_review'){injected=true;throw Error('Offline failure before phase advance');}};
 const result=await flow.executeEditorialStage(p);beforeRun=null;assert.equal(injected,true);assert.equal(result.saved,false);
 const value=await read(owner,r);assert.equal(value.state,'outline');assert.equal(value.stages.outline.state,'requested');assert.equal(value.artifacts.outline,undefined);assert.equal(value.stages.outline.receipt_state,'completed');assert.equal(calls,before+1);
 await flow.recoverEditorialStage(owner,{run_id:r.run_id,stage:'outline',confirm:true});assert.equal((await read(owner,r)).state,'outline_review');assert.equal(calls,before+1);
});
await check('reservation+requested failure leaves no orphan; same unexecuted token can make one request',async()=>{
 const owner='v68-reserve-requested',{r,p}=await preparedOutline(owner),before=calls;let injected=false;
 beforeRun=async(q)=>{if(!injected&&q.startsWith("UPDATE editorial_stages SET state='requested'")){injected=true;throw Error('Offline requested-state persistence failure');}};
 await assert.rejects(flow.executeEditorialStage(p));beforeRun=null;assert.equal(injected,true);assert.equal(sql.prepare('SELECT count(*) n FROM claude_attempts WHERE id=?').get('editorial_v2:'+owner+':'+r.run_id+':outline').n,0);assert.equal((await read(owner,r)).stages.outline.state,'claimed');assert.equal(calls,before);
 response=outline;const result=await flow.executeEditorialStage(p);assert.equal(result.saved,true);assert.equal(calls,before+1);await flow.executeEditorialStage(p);assert.equal(calls,before+1);
});
await check('pause before artifact batch prevents both artifact save and phase advance',async()=>{
 const owner='v68-save-pause',r=await create(owner);await write(owner,r,'outline',outline);const l=await claim(owner,r,'outline_review');let injected=false;
 beforeBatch=async()=>{if(!injected){injected=true;pause(owner,r.run_id);}};
 await assert.rejects(review(owner,r,'outline_review',pass,l));beforeBatch=null;const value=await read(owner,r);assert.equal(value.control_state,'paused');assert.equal(value.state,'outline_review');assert.equal(value.stages.outline_review.state,'claimed');assert.equal(value.artifacts.outline_review,undefined);
});
await check('blocked outline review retains content_blocked instead of being relabeled revise',async()=>{
 const owner='v68-blocked',r=await create(owner);await write(owner,r,'outline',outline);const a={title:outline.title,paragraphs:[JSON.stringify(outline)]},i=issue(a,'gap1',1);
 assert.equal((await review(owner,r,'outline_review',{...pass,decision:'blocked',issues:[i]})).state,'content_blocked');await assert.rejects(claim(owner,r,'body'));
});
await check('eight genuine outline revision issues remain stopped, never fake pass or extra grant',async()=>{
 const owner='v68-outline-revise',input=args(owner),requests=load('editorial-request');
 const start=await requests.startEditorialRequest(owner,{request_key:crypto.randomUUID(),expected_model:model,expected_prompt_version:prompt.effectiveWritingStyleVersion,expected_max_output_tokens:32768,confirm:true}),request_id=start.current.request_id,job=await requests.claimEditorialRequest(owner,{request_id});
 assert.equal(job.input.authorization.max_provider_requests,4);assert.deepEqual(Array.from(job.input.authorization.allowed_writer_stages),['outline','body','structure_revision','fact_revision']);
 await requests.recordEditorialRequestProgress(owner,{request_id,claim_token:job.claim_token,phase:'research',state:'completed',note:'Offline synthetic fixed research pack',actor_id:crypto.randomUUID(),execution_id:crypto.randomUUID(),model:'mock-research',fact_pack:{sources,facts}});
 const r=await flow.createEditorialFlow(owner,{...input,authorization_key:'editorial-request:'+request_id,request_id,request_token:job.claim_token}),snapshot={...r.snapshot};delete snapshot.artifact_validation_version;delete snapshot.stage_instructions;
 const raw=JSON.stringify(snapshot),snapshotHash=await hash(raw);sql.prepare('UPDATE editorial_flows SET snapshot=?,snapshot_sha256=? WHERE id=?').run(raw,snapshotHash,r.run_id);r.snapshot=snapshot;r.snapshot_sha256=snapshotHash;
 const originalGrant=sql.prepare('SELECT input_json,input_sha256 FROM editorial_requests WHERE id=?').get(request_id);await write(owner,r,'outline',outline);const a={title:outline.title,paragraphs:[JSON.stringify(outline)]},issues=Array.from({length:8},(_,i)=>issue(a,'outline-'+i,1)),before=calls;
 const value=await review(owner,r,'outline_review',{...pass,decision:'revise',issues});assert.equal(value.state,'outline_needs_revision');assert.equal(value.artifacts.outline_review.artifact.issues.length,8);await assert.rejects(claim(owner,r,'body'));await assert.rejects(claim(owner,r,'outline_revision'));assert.equal(calls,before);
 const savedGrant=sql.prepare('SELECT input_json,input_sha256 FROM editorial_requests WHERE id=?').get(request_id);assert.equal(savedGrant.input_json,originalGrant.input_json);assert.equal(savedGrant.input_sha256,originalGrant.input_sha256);assert.equal(sql.prepare('SELECT count(*) n FROM editorial_requests WHERE owner=?').get(owner).n,1);
});
await check('expired standalone verified flow cannot put/freeze or dispatch',async()=>{
 const owner='v68-expired',c=await complete(owner);sql.prepare('UPDATE editorial_flows SET expires=? WHERE id=?').run('2000-01-01T00:00:00.000Z',c.r.run_id);const beforeP=puts,beforeD=dispatches;
 await assert.rejects(flow.freezeEditorialFlow(owner,c.freezeArgs));assert.equal(puts,beforeP);assert.equal(sql.prepare('SELECT count(*) n FROM articles WHERE id=?').get(c.r.article_id).n,0);assert.equal((await read(owner,c.r)).state,'verified');await assert.rejects(flow.dispatchEditorialFlow(owner,c.freezeArgs));assert.equal(dispatches,beforeD);
});
await check('expired frozen flow remains readable/idempotently frozen but cannot send new event',async()=>{
 const owner='v68-expired-frozen',c=await complete(owner);await flow.freezeEditorialFlow(owner,c.freezeArgs);sql.prepare('UPDATE editorial_flows SET expires=? WHERE id=?').run('2000-01-01T00:00:00.000Z',c.r.run_id);const before=dispatches;
 assert.equal((await flow.freezeEditorialFlow(owner,c.freezeArgs)).already_frozen,true);await assert.rejects(flow.dispatchEditorialFlow(owner,c.freezeArgs));assert.equal(dispatches,before);
});
await check('thrown external dispatch becomes durable unknown and cannot resend',async()=>{
 const owner='v68-dispatch-throw',c=await complete(owner);await flow.freezeEditorialFlow(owner,c.freezeArgs);const before=dispatches;throwDispatch=true;
 const value=await flow.dispatchEditorialFlow(owner,c.freezeArgs);throwDispatch=false;assert.equal(value.state,'dispatch_unknown');assert.equal(value.read_only,true);assert.equal((await read(owner,c.r)).state,'dispatch_unknown');const after=dispatches;assert.equal(after,before+1);
 const retry=await flow.dispatchEditorialFlow(owner,c.freezeArgs);assert.equal(retry.read_only,true);assert.equal(retry.state,'dispatch_unknown');assert.equal(dispatches,after);
});
await check('pause before local dispatch reservation commits prevents queue and external event',async()=>{
 const owner='v68-dispatch-pause',c=await complete(owner);await flow.freezeEditorialFlow(owner,c.freezeArgs);const before=dispatches;let injected=false;
 beforeBatch=async()=>{if(!injected){injected=true;pause(owner,c.r.run_id);}};
 const blocked=await flow.dispatchEditorialFlow(owner,c.freezeArgs);beforeBatch=null;assert.equal(blocked.read_only,true);assert.equal(blocked.state,'frozen');assert.equal(injected,true);assert.equal(dispatches,before);assert.equal((await read(owner,c.r)).state,'frozen');assert.equal(sql.prepare('SELECT state FROM articles WHERE id=?').get(c.r.article_id).state,'uploaded');
});
await check('current and legacy frozen stage instructions survive instruction-only deployment',async()=>{
 const contract=load('editorial-contract'),original=contract.editorialStageInstruction;
 try{
  const owner='v68-frozen-instruction',r=await create(owner);await write(owner,r,'outline',outline);assert.equal(r.snapshot.artifact_validation_version,3);assert.ok(r.snapshot.stage_instructions.outline);
  contract.editorialStageInstruction=stage=>original(stage)+'\nOffline future instruction change';assert.equal((await read(owner,r)).state,'outline_review');
  // This local fixture models a V67 frozen snapshot, never mutates a live record.
  contract.editorialStageInstruction=original;const oldOwner='v68-legacy-instruction',old=await create(oldOwner),snapshot={...old.snapshot};delete snapshot.artifact_validation_version;delete snapshot.stage_instructions;
  const raw=JSON.stringify(snapshot),snapshotHash=await hash(raw);sql.prepare('UPDATE editorial_flows SET snapshot=?,snapshot_sha256=? WHERE id=?').run(raw,snapshotHash,old.run_id);old.snapshot=snapshot;old.snapshot_sha256=snapshotHash;await write(oldOwner,old,'outline',outline);
  contract.editorialStageInstruction=stage=>original(stage)+'\nAnother future instruction change';assert.equal((await read(oldOwner,old)).state,'outline_review');
 }finally{contract.editorialStageInstruction=original;}
});
await check('receipt response state/stage contradictions reject before artifact/phase mutation',async()=>{
 for(const patch of [{state:'failed'},{stage:'body'}]){
  const owner='v68-receipt-'+Object.keys(patch)[0],{r,l}=await preparedOutline(owner),id='editorial_v2:'+owner+':'+r.run_id+':outline';
  const packet={state:'completed',stage:'outline',text:JSON.stringify(outline),input_sha256:l.input_sha256,snapshot_sha256:r.snapshot_sha256,requested_model:model,returned_model:model,...patch};
  sql.prepare("INSERT INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,'completed',?,?)").run(id,owner,day,JSON.stringify(packet),day);sql.prepare("UPDATE editorial_stages SET state='requested',receipt_id=? WHERE run_id=? AND owner=?").run(id,r.run_id,owner);
  const before=calls;await assert.rejects(flow.recoverEditorialStage(owner,{run_id:r.run_id,stage:'outline',confirm:true}));const value=await read(owner,r);assert.equal(value.artifacts.outline,undefined);assert.equal(value.state,'outline');assert.equal(value.stages.outline.author_receipt_status,'binding_mismatch');assert.equal(calls,before);
 }
});
await check('repeated/concurrent archive preserves a previous pause through restore',async()=>{
 const owner='v68-repeat-archive',r=await create(owner),base={run_id:r.run_id,reason:'Offline control regression',confirm:true};await flow.setEditorialControl(owner,base,'paused');await flow.setEditorialControl(owner,base,'archived');await Promise.all([flow.setEditorialControl(owner,base,'archived'),flow.setEditorialControl(owner,base,'archived')]);
 assert.equal((await flow.setEditorialControl(owner,base,'active')).control_state,'paused');await assert.rejects(claim(owner,r,'outline'));
});

await check('dispatch+article queue rollback together before external side effects',async()=>{
 const owner='v68-dispatch-queue-failure',c=await complete(owner);await flow.freezeEditorialFlow(owner,c.freezeArgs);const before=dispatches;let injected=false;
 beforeRun=async(q)=>{if(!injected&&q.startsWith("UPDATE articles SET state='queued'")){injected=true;throw Error('Offline queue persistence failure');}};
 await assert.rejects(flow.dispatchEditorialFlow(owner,c.freezeArgs));beforeRun=null;assert.equal(injected,true);assert.equal(dispatches,before);assert.equal((await read(owner,c.r)).state,'frozen');assert.equal(sql.prepare('SELECT state FROM articles WHERE id=?').get(c.r.article_id).state,'uploaded');
});
await check('once external dispatch begins, a later pause cannot recall its accepted result',async()=>{
 const owner='v68-dispatch-committed',c=await complete(owner);await flow.freezeEditorialFlow(owner,c.freezeArgs);const before=dispatches;
 dispatchHook=async()=>pause(owner,c.r.run_id);const accepted=await flow.dispatchEditorialFlow(owner,c.freezeArgs);dispatchHook=null;assert.equal(accepted.state,'submitted');assert.equal(dispatches,before+1);assert.equal((await read(owner,c.r)).control_state,'paused');
 await assert.rejects(flow.dispatchEditorialFlow(owner,c.freezeArgs));assert.equal(dispatches,before+1);
});
await check('accepted external dispatch with lost terminal DB write never sends again',async()=>{
 const owner='v68-dispatch-final-write',c=await complete(owner);await flow.freezeEditorialFlow(owner,c.freezeArgs);const before=dispatches;let injected=false;
 beforeRun=async(q,args)=>{if(!injected&&q.startsWith('UPDATE editorial_flows SET state=?')&&args[0]==='submitted'){injected=true;throw Error('Offline DB unavailable after external acceptance');}};
 await assert.rejects(flow.dispatchEditorialFlow(owner,c.freezeArgs));beforeRun=null;assert.equal(injected,true);assert.equal(dispatches,before+1);assert.equal((await read(owner,c.r)).state,'dispatching');
 const retry=await flow.dispatchEditorialFlow(owner,c.freezeArgs);assert.equal(retry.read_only,true);assert.equal(retry.state,'dispatching');assert.equal(dispatches,before+1);
});


await check('technical failure classification cannot split terminal stage from flow phase',async()=>{
 const owner='v68-technical-terminal',{r,p}=await preparedOutline(owner),before=calls;providerState='failed';let injected=false;
 beforeRun=async(q,args)=>{if(!injected&&q.startsWith('UPDATE editorial_flows SET state=')&&(args[0]==='technical_failed'||q.includes("state='technical_failed'"))){injected=true;throw Error('Offline failure during technical terminal classification');}};
 try{await flow.executeEditorialStage(p);}catch{}beforeRun=null;providerState='completed';const value=await read(owner,r);assert.equal(injected,true);assert.equal(value.stages.outline.receipt_state,'failed');assert.equal(calls,before+1);
 assert.equal(value.stages.outline.state==='technical_failed',value.state==='technical_failed','terminal stage and flow must commit together');const receiptBefore=JSON.stringify(sql.prepare('SELECT * FROM claude_attempts WHERE id=?').get('editorial_v2:'+owner+':'+r.run_id+':outline'));await flow.executeEditorialStage(p);assert.equal(calls,before+1);const reconciled=await flow.recoverEditorialStage(owner,{run_id:r.run_id,stage:'outline',confirm:true});assert.equal(reconciled.terminal_reconciled,true);assert.equal(reconciled.state,'technical_failed');assert.equal(reconciled.stages.outline.state,'technical_failed');assert.equal(JSON.stringify(sql.prepare('SELECT * FROM claude_attempts WHERE id=?').get('editorial_v2:'+owner+':'+r.run_id+':outline')),receiptBefore);await flow.executeEditorialStage(p);assert.equal(calls,before+1);
});
await check('content-invalid classification rolls back together and can reconcile the same receipt',async()=>{
 const owner='v68-invalid-terminal',{r,p}=await preparedOutline(owner),before=calls;response={...outline,opening:{invalid:'Offline shape error'}};let injected=false;
 beforeRun=async(q,args)=>{if(!injected&&q.startsWith('UPDATE editorial_flows SET state=')&&(args[0]==='content_invalid'||q.includes("state='content_invalid'"))){injected=true;throw Error('Offline failure during content-invalid classification');}};
 await flow.executeEditorialStage(p);beforeRun=null;const value=await read(owner,r);assert.equal(injected,true);assert.equal(value.stages.outline.receipt_state,'completed');assert.equal(calls,before+1);
 assert.equal(value.stages.outline.state==='content_invalid',value.state==='content_invalid','content-invalid stage and flow must commit together');const receiptBefore=JSON.stringify(sql.prepare('SELECT * FROM claude_attempts WHERE id=?').get('editorial_v2:'+owner+':'+r.run_id+':outline'));
 await assert.rejects(flow.recoverEditorialStage(owner,{run_id:r.run_id,stage:'outline',confirm:true}));const reconciled=await read(owner,r);assert.equal(reconciled.state,'content_invalid');assert.equal(reconciled.stages.outline.state,'content_invalid');assert.equal(calls,before+1);assert.equal(JSON.stringify(sql.prepare('SELECT * FROM claude_attempts WHERE id=?').get('editorial_v2:'+owner+':'+r.run_id+':outline')),receiptBefore);
});
await check('request expiry ticking between batch statements cannot split artifact from phase',async()=>{
 const owner='v68-expiry-tick',input=args(owner),requests=load('editorial-request');const start=await requests.startEditorialRequest(owner,{request_key:crypto.randomUUID(),expected_model:model,expected_prompt_version:prompt.effectiveWritingStyleVersion,expected_max_output_tokens:32768,confirm:true}),request_id=start.current.request_id,job=await requests.claimEditorialRequest(owner,{request_id});
 await requests.recordEditorialRequestProgress(owner,{request_id,claim_token:job.claim_token,phase:'research',state:'completed',note:'Offline expiry tick fixture',actor_id:crypto.randomUUID(),execution_id:crypto.randomUUID(),model:'mock-research',fact_pack:{sources,facts}});
 const r=await flow.createEditorialFlow(owner,{...input,authorization_key:'editorial-request:'+request_id,request_id,request_token:job.claim_token}),l=await claim(owner,r,'outline'),id='editorial_v2:'+owner+':'+r.run_id+':outline';
 const packet={state:'completed',stage:'outline',text:JSON.stringify(outline),input_sha256:l.input_sha256,snapshot_sha256:r.snapshot_sha256,requested_model:model,returned_model:model};sql.prepare("INSERT INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,'completed',?,?)").run(id,owner,day,JSON.stringify(packet),day);sql.prepare("UPDATE editorial_stages SET state='requested',receipt_id=? WHERE run_id=?").run(id,r.run_id);
 // Deterministic DB clock advances between statements, without modifying grant/data.
 // This avoids wall-clock scheduling flakes while modeling the reproduced expiry tick.
 let sqlNow=new Date().toISOString();const expires=new Date(Date.now()+300000).toISOString();
 sql.function('strftime',(format,value)=>{assert.equal(format,'%Y-%m-%dT%H:%M:%fZ');assert.equal(value,'now');return sqlNow;});
 sql.prepare('UPDATE editorial_requests SET expires=? WHERE id=?').run(expires,request_id);sql.prepare('UPDATE editorial_flows SET expires=? WHERE id=?').run(expires,r.run_id);let injected=false;
 beforeRun=async(q,args)=>{if(!injected&&q.startsWith('UPDATE editorial_flows SET state=?')&&args[0]==='outline_review'){injected=true;assert.equal(sql.prepare('SELECT state FROM editorial_stages WHERE run_id=?').get(r.run_id).state,'completed');sqlNow=new Date(Date.parse(expires)+1).toISOString();}};
 try{await flow.recoverEditorialStage(owner,{run_id:r.run_id,stage:'outline',confirm:true});}catch{}beforeRun=null;assert.equal(injected,true);const value=await read(owner,r);
 assert.equal(value.stages.outline.state==='completed',value.state==='outline_review','phase and artifact must have the same expiry linearization outcome');
});
assert.equal(legacyRows(),beforeLegacy,'Legacy daily rows are immutable throughout the new-flow fault suite');
if(failures.length){console.error(failures.length+' V68 fault regressions failed');process.exitCode=1;}else console.log('PASS V68 fault regressions: local-only SQLite/provider/event/bucket mocks; no paid retry or legacy mutation');
