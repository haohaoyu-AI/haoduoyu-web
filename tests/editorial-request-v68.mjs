// Offline V68 orchestration regression: only in-memory SQLite and mock providers/events/storage.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {createRequire} from 'node:module';import ts from 'typescript';
const native=createRequire(import.meta.url),sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
let batches=Promise.resolve(),calls=0,dispatches=0,puts=0,connected=true,response=null,providerState='completed',actualModel='claude-mock',hold=null,wakes=0,wakeAccepted=false,runHook=null,batchHook=null,wakeHold=null;
const db={prepare(query){const bound=args=>({first:async()=>sql.prepare(query).get(...args)||null,all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>{if(runHook)await runHook(query,args);return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}});return{bind:(...args)=>bound(args)};},batch(statements){const task=batches.then(async()=>{if(batchHook){const hook=batchHook;batchHook=null;await hook();}sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}});batches=task.catch(()=>{});return task;}};
const model='claude-mock',secret='sk-synthetic-only-do-not-send-abcdefghijklmnop';
const claude={protectPreparedArticleForOwner:async(o,v)=>({hit:JSON.stringify(v).includes(secret)}),protectStepwiseOutputForOwner:async(o,v,tokens=[])=>({hit:JSON.stringify(v).includes(secret)||tokens.some(t=>JSON.stringify(v).includes(t))}),readClaudeOutputCapability:async()=>({max_output_tokens:32768,relay_limit_verified:true}),requestOutlineClaudeOnce:async(owner,input)=>{calls++;if(hold)await hold;return providerState==='completed'?{state:'completed',text:JSON.stringify(response),requested_model:input.model,returned_model:actualModel,usage:{input_tokens:30,output_tokens:2000},diagnostic:{http_status:200,stop_reason:'end_turn'}}:{state:'failed',error:'mock technical 524',diagnostic:{http_status:524,code:'upstream_http_error'}};}};
const globals={crypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Date,Error,URL,Request,Response,File,ReadableStream,AbortSignal,setInterval,clearInterval};const modules={};function load(name){if(modules[name])return modules[name];const ex={};modules[name]=ex;vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{...globals,exports:ex,require:x=>x==='cloudflare:workers'?{env:{DB:db}}:x==='./test-store'?{db:()=>db,owner:r=>r.headers.get('oai-authenticated-user-id')}:x==='./claude'?claude:x==='./articles'?{bucket:()=>({put:async()=>{puts++;}})}:x==='./events'?{readiness:async()=>({connected}),dispatchEditorialRequest:async()=>{wakes++;if(wakeHold)await wakeHold;return wakeAccepted;},dispatch:async()=>{dispatches++;return '事件已送达';}}:x.startsWith('./')?load(x.slice(2)):native(x),fetch:()=>{throw Error('Real network forbidden');}});return ex;}
const flow=load('editorial-flow'),prompt=load('writing-supplement'),hash=load('writing-input').hashText;
const day='2026-10-06',sources=[1,2].map(n=>({id:'S'+n,title:'Synthetic '+n,url:'https://example.com/'+n,published:day,event_date:day,accessed:day,context:'Synthetic observable source context on '+day})),facts=[{id:'E1',text:'合成公开材料，影片采用黑白画面。',source_ids:['S1'],context:'只用于离线测试'}];
const article={title:'合成测试标题',paragraphs:Array.from({length:30},(_,i)=>`第${i+1}段，`+'影片采用黑白画面，故事围绕日常生活展开，人物通过具体行动表达态度，作品呈现可见的场景。'.repeat(2))};
const outline={title:article.title,core_argument:'合成测试核心判断',opening:'合成公开画面',sections:[{heading:'第一节',target_chars:1000,fact_ids:['E1'],source_ids:['S1'],argument:'从公开画面推进判断'},{heading:'第二节',target_chars:1000,fact_ids:['E1'],source_ids:['S1'],argument:'用作品具体行动推进'}],turn:'合成测试转弯',ending:'落在作品画面',target_chars:2500,source_ids:['S1','S2'],fact_gaps:{blocked:false,items:[]}};
function args(owner){sql.prepare('INSERT OR IGNORE INTO claude_settings(owner,model,secret,enabled,updated) VALUES(?,?,?,?,?)').run(owner,model,'encrypted.mock','1',day);return{authorization_key:'v2-one',expected_model:model,expected_prompt_version:prompt.effectiveWritingStyleVersion,topic:'合成测试选题',angle:'观察作品如何呈现日常生活',style_requirements:'口语，幽默，保留观点力度',materials:'合成公开素材'.repeat(35),sources,facts,participants:Object.fromEntries(['writer','outline_reviewer','structure_reviewer','fact_checker','verifier'].map(name=>[name,{actor_id:crypto.randomUUID(),model:name==='writer'?model:'independent-'+name}])),confirm:true};}
async function read(owner,r){return flow.readEditorialFlow(owner,{run_id:r.run_id});}
async function claim(owner,r,stage){return flow.claimEditorialStage(owner,{run_id:r.run_id,stage,expected_snapshot_sha256:r.snapshot_sha256,confirm:true});}
async function write(owner,r,stage,value){response=value;const lease=await claim(owner,r,stage);const prepared=await flow.prepareEditorialStage(owner,{run_id:r.run_id,stage,token:lease.token,expected_model:model,expected_input_sha256:lease.input_sha256,confirm:true});const result=await flow.executeEditorialStage(prepared);if(!result.saved)await flow.recoverEditorialStage(owner,{run_id:r.run_id,stage,confirm:true});assert.equal(result.saved,true,JSON.stringify(result));return read(owner,r);}
function reviewer(r,stage){const role={outline_review:'outline_reviewer',structure_review:'structure_reviewer',fact_check:'fact_checker',final_verify:'verifier'}[stage];return r.snapshot.participants[role];}
async function review(owner,r,stage,report,lease){lease||=await claim(owner,r,stage);const actor=reviewer(r,stage);return flow.saveEditorialReview(owner,{run_id:r.run_id,stage,expected_snapshot_sha256:r.snapshot_sha256,expected_input_sha256:lease.input_sha256,actor_id:actor.actor_id,execution_id:crypto.randomUUID(),model:actor.model,raw_result:JSON.stringify(report),confirm:true});}
const pass={status:'completed',decision:'pass',reason:'完整核验合成输入与推进',issues:[]};
function factReport(a,passed=true,issues=[]){return{status:'completed',passed,coverage:[a.title,...a.paragraphs].map((quote,paragraph)=>({paragraph,quote,classification:paragraph?'fact':'opinion',verdict:paragraph?'confirmed':'not_applicable',source_ids:paragraph?['S1']:[],source_dates:paragraph?[day]:[],context:paragraph?'核对原文与事件日期 '+day:'作者观点'})),issues,unconfirmed:[],checks:{paragraphs:true,names:true,numbers:true,metaphors:true,quote_time_context:true}};}
const issue=(a,id,paragraph)=>({id,paragraph,quote:a.paragraphs[paragraph-1].slice(0,8),type:'logic',severity:'medium',basis:'合成测试论据不足',revision_goal:'依据公开材料补足具体画面'});
const legacyRows=()=>JSON.stringify(sql.prepare("SELECT * FROM writing_runs WHERE run_kind='daily'").all());sql.prepare('INSERT INTO writing_runs(id,owner,day,writer,run_kind,state,article_id,created,updated,input_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?)').run('legacy','legacy',day,'claude','daily','failed',crypto.randomUUID(),day,day,'{"legacy":true}');const beforeLegacy=legacyRows();
const req=load('editorial-request');
const start=(key=crypto.randomUUID())=>({request_key:key,expected_model:model,expected_prompt_version:prompt.effectiveWritingStyleVersion,expected_max_output_tokens:32768,confirm:true});
const progress=claim=>({request_id:claim.request_id,claim_token:claim.claim_token,phase:'research',state:'completed',note:'离线合成研究执行结果',actor_id:crypto.randomUUID(),execution_id:crypto.randomUUID(),model:'mock-researcher',fact_pack:{sources,facts}});
async function request(owner){args(owner);const result=await req.startEditorialRequest(owner,start());const lease=await req.claimEditorialRequest(owner,{request_id:result.current.request_id});await req.recordEditorialRequestProgress(owner,progress(lease));return lease;}
async function bound(owner){const lease=await request(owner),run=await flow.createEditorialFlow(owner,{...args(owner),authorization_key:'editorial-request:'+lease.request_id,request_id:lease.request_id,request_token:lease.claim_token});return {lease,run};}
function fence(run){return sql.prepare('SELECT count(*) n FROM editorial_flows e WHERE e.id=? AND '+req.editorialRequestFlowFence('e')).get(run.run_id).n;}
const oldParent=crypto.randomUUID(),oldChild=crypto.randomUUID();
for(const [id,parent]of [[oldParent,null],[oldChild,oldParent]]){sql.prepare('INSERT INTO outline_flows(id,owner,parent_run_id,authorization_key,snapshot,snapshot_sha256,state,article_id,expires,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,'legacy',parent,'legacy:'+id,'{}','original','outline_needs_revision',crypto.randomUUID(),day,day,day);sql.prepare("INSERT INTO workflow_controls(owner,scope,run_id,state,reason,created,updated) VALUES(?,?,?,?,?,?,?)").run('legacy','outline',id,'archived','original archived control',day,day);}
const beforeLegacyOutline=JSON.stringify(sql.prepare('SELECT * FROM outline_flows ORDER BY id').all()),beforeLegacyControls=JSON.stringify(sql.prepare("SELECT * FROM workflow_controls WHERE owner='legacy' ORDER BY run_id").all());

// A declared automated binding is fail-closed; legacy flows remain independent.
{
 const owner='fence-owner',{lease,run}=await bound(owner);assert.equal(fence(run),1);
 const original=sql.prepare('SELECT snapshot,snapshot_sha256 FROM editorial_flows WHERE id=?').get(run.run_id);
 for(const foreign of [crypto.randomUUID(),null,0,'',[]]){const altered={...JSON.parse(original.snapshot),automated_request_id:foreign};sql.prepare('UPDATE editorial_flows SET snapshot=? WHERE id=?').run(JSON.stringify(altered),run.run_id);assert.equal(fence(run),0,'missing/malformed delegation cannot pass the mutation fence');}
 sql.prepare('UPDATE editorial_flows SET snapshot=? WHERE id=?').run(original.snapshot,run.run_id);
 sql.prepare('UPDATE editorial_requests SET flow_id=NULL WHERE id=?').run(lease.request_id);assert.equal(fence(run),0,'unbound delegation is blocked');
 await req.bindEditorialRequest(owner,lease.request_id,lease.claim_token,run.run_id);assert.equal(fence(run),1);
 sql.prepare("UPDATE editorial_requests SET owner='foreign-owner' WHERE id=?").run(lease.request_id);assert.equal(fence(run),0,'other owner cannot grant mutations');
 sql.prepare('UPDATE editorial_requests SET owner=? WHERE id=?').run(owner,lease.request_id);
 const expiry=sql.prepare('SELECT expires FROM editorial_requests WHERE id=?').get(lease.request_id).expires;for(const stoppedExpiry of ['2000-01-01T00:00:00.000Z','not-a-date']){sql.prepare('UPDATE editorial_requests SET expires=? WHERE id=?').run(stoppedExpiry,lease.request_id);assert.equal(fence(run),0);}sql.prepare('UPDATE editorial_requests SET expires=? WHERE id=?').run(expiry,lease.request_id);
 const fixedExpiry='2026-10-06T09:00:00.000Z';sql.prepare('UPDATE editorial_requests SET expires=? WHERE id=?').run(fixedExpiry,lease.request_id);
 const at=time=>sql.prepare('SELECT count(*) n FROM editorial_flows e WHERE e.id=? AND '+req.editorialRequestFlowFence('e',time)).get(run.run_id).n;
 assert.equal(at('2026-10-06T08:59:59.999Z'),1);assert.equal(at(fixedExpiry),0);for(const invalidTime of ['not-date',"2026-10-06T09:00:00.000Z' OR 1=1",'2026-02-30T09:00:00.000Z'])assert.throws(()=>req.editorialRequestFlowFence('e',invalidTime));sql.prepare('UPDATE editorial_requests SET expires=? WHERE id=?').run(expiry,lease.request_id);
 const legacy=await flow.createEditorialFlow('standalone-owner',args('standalone-owner'));assert.equal(fence(legacy),1);
 await assert.rejects(req.bindEditorialRequest('another-owner',lease.request_id,lease.claim_token,run.run_id));
 console.log('PASS missing/foreign/null/unbound delegation is fail-closed; owner-isolated legacy flow remains unchanged');
}

// Frozen four-stage permissions are checked in full, never inferred from a request id.
{
 const owner='frozen-grant',{lease,run}=await bound(owner),row=sql.prepare('SELECT input_json,input_sha256 FROM editorial_requests WHERE id=?').get(lease.request_id);
 const original=JSON.parse(row.input_json);assert.equal(original.authorization.max_provider_requests,4);assert.deepEqual(original.authorization.allowed_writer_stages,['outline','body','structure_revision','fact_revision']);
 for(const [field,value]of [['allowed_writer_stages',['outline','body','outline_revision','fact_revision']],['skip_zero_issues',false],['automatic_paid_retry',true],['public_materials_only',false],['private_drafts_only',false],['destination','https://untrusted.test']]){const altered=structuredClone(original);altered.authorization[field]=value;const raw=JSON.stringify(altered);sql.prepare('UPDATE editorial_requests SET input_json=?,input_sha256=? WHERE id=?').run(raw,await hash(raw),lease.request_id);await assert.rejects(req.assertEditorialRequestGrant(owner,lease.request_id,run.run_id,'outline'));}
 sql.prepare('UPDATE editorial_requests SET input_json=?,input_sha256=? WHERE id=?').run(row.input_json,row.input_sha256,lease.request_id);
 assert.equal(original.artifact_validation_version,3);assert.deepEqual(Object.keys(original.stage_instructions),JSON.parse(JSON.stringify(load('editorial-contract').editorialStages)));assert.deepEqual(JSON.parse(JSON.stringify(run.snapshot.stage_instructions)),original.stage_instructions);
 const legacyInput=structuredClone(original);delete legacyInput.artifact_validation_version;delete legacyInput.stage_instructions;const legacyRaw=JSON.stringify(legacyInput);sql.prepare('UPDATE editorial_requests SET input_json=?,input_sha256=? WHERE id=?').run(legacyRaw,await hash(legacyRaw),lease.request_id);
 for(const stage of ['outline','body','structure_revision','fact_revision'])assert.equal((await req.assertEditorialRequestGrant(owner,lease.request_id,run.run_id,stage)).authorization.max_provider_requests,4);assert.equal(sql.prepare('SELECT input_json FROM editorial_requests WHERE id=?').get(lease.request_id).input_json,legacyRaw);
 sql.prepare('UPDATE editorial_requests SET input_json=?,input_sha256=? WHERE id=?').run(row.input_json,row.input_sha256,lease.request_id);
 await assert.rejects(req.assertEditorialRequestGrant(owner,lease.request_id,run.run_id,'outline_revision'));
 assert.equal(calls,0);console.log('PASS exact frozen four stages/zero-issue/private/public/no-retry grant; fifth outline revision is not authorized');
}

// Pausing/archiving is reported honestly. Cancellation archives exactly once and
// a visibility restore cannot resurrect request permission or erase prior pause.
{
 const owner='paused-cancel',{lease,run}=await bound(owner);
 await flow.setEditorialControl(owner,{run_id:run.run_id,reason:'合成暂停原因',confirm:true},'paused');
 assert.equal((await req.readEditorialRequest(owner,{request_id:lease.request_id})).current.state,'paused');await assert.rejects(claim(owner,run,'outline'));
 await req.stopEditorialRequest(owner,{request_id:lease.request_id,confirm:true});
 const control=sql.prepare("SELECT * FROM workflow_controls WHERE owner=? AND scope='editorial_v2' AND run_id=?").get(owner,run.run_id);assert.equal(JSON.parse(control.reason).previous_state,'paused');
 await Promise.all([req.stopEditorialRequest(owner,{request_id:lease.request_id,confirm:true}),req.stopEditorialRequest(owner,{request_id:lease.request_id,confirm:true})]);
 assert.deepEqual(sql.prepare("SELECT * FROM workflow_controls WHERE owner=? AND scope='editorial_v2' AND run_id=?").get(owner,run.run_id),control);
 await flow.setEditorialControl(owner,{run_id:run.run_id,reason:'恢复可见',confirm:true},'active');assert.equal((await read(owner,run)).control_state,'paused');assert.equal(fence(run),0);assert.equal((await req.readEditorialRequest(owner,{request_id:lease.request_id})).current.state,'cancelled');
 const archived=await bound('archived-view');await flow.setEditorialControl('archived-view',{run_id:archived.run.run_id,reason:'合成归档原因',confirm:true},'archived');assert.equal((await req.readEditorialRequest('archived-view',{request_id:archived.lease.request_id})).current.state,'archived');
 console.log('PASS paused/archive visibility is distinct; repeated cancellation preserves pause restoration and receipts/grant cannot restart');
}

// Cancellation observes a binding committed after its initial read and before
// its transaction, preventing the stale flow_id window.
{
 const owner='cancel-bind-race',{lease,run}=await bound(owner);sql.prepare('UPDATE editorial_requests SET flow_id=NULL WHERE id=?').run(lease.request_id);
 batchHook=()=>req.bindEditorialRequest(owner,lease.request_id,lease.claim_token,run.run_id);
 await req.stopEditorialRequest(owner,{request_id:lease.request_id,confirm:true});
 assert.equal((await read(owner,run)).control_state,'archived');assert.equal(fence(run),0);assert.equal((await req.readEditorialRequest(owner,{request_id:lease.request_id})).current.state,'cancelled');
 const orphan=await bound('cancel-before-bind');sql.prepare('UPDATE editorial_requests SET flow_id=NULL WHERE id=?').run(orphan.lease.request_id);await req.stopEditorialRequest('cancel-before-bind',{request_id:orphan.lease.request_id,confirm:true});assert.equal((await read('cancel-before-bind',orphan.run)).control_state,'archived');await assert.rejects(req.bindEditorialRequest('cancel-before-bind',orphan.lease.request_id,orphan.lease.claim_token,orphan.run.run_id));
 console.log('PASS cancel/bind and insert-before-bind races archive exact delegated new flows atomically');
}

// Eight-hour claim expiry must be checked at actual progress/bind/failure write,
// while an already-bound immutable grant retains its original 24-hour lifetime.
{
 const owner='expiry-progress',lease=await request(owner),before=sql.prepare('SELECT progress_json FROM editorial_requests WHERE id=?').get(lease.request_id).progress_json;
 runHook=(query)=>{if(query.startsWith('UPDATE editorial_requests SET progress_json=')){runHook=null;sql.prepare('UPDATE editorial_requests SET claim_expires=? WHERE id=?').run('2000-01-01T00:00:00.000Z',lease.request_id);}};
 await assert.rejects(req.recordEditorialRequestProgress(owner,{...progress(lease),phase:'coordination',fact_pack:undefined}));assert.equal(sql.prepare('SELECT progress_json FROM editorial_requests WHERE id=?').get(lease.request_id).progress_json,before);
 const binding=await bound('expiry-bind');sql.prepare('UPDATE editorial_requests SET flow_id=NULL WHERE id=?').run(binding.lease.request_id);
 runHook=query=>{if(query.startsWith('UPDATE editorial_requests SET flow_id=')){runHook=null;sql.prepare('UPDATE editorial_requests SET claim_expires=? WHERE id=?').run('2000-01-01T00:00:00.000Z',binding.lease.request_id);}};
 await assert.rejects(req.bindEditorialRequest('expiry-bind',binding.lease.request_id,binding.lease.claim_token,binding.run.run_id));assert.equal(sql.prepare('SELECT flow_id FROM editorial_requests WHERE id=?').get(binding.lease.request_id).flow_id,null);
 const failed=await request('expiry-failure');runHook=query=>{if(query.startsWith('UPDATE editorial_requests SET state=')){runHook=null;sql.prepare('UPDATE editorial_requests SET claim_expires=? WHERE id=?').run('2000-01-01T00:00:00.000Z',failed.request_id);}};
 await assert.rejects(req.stopEditorialRequest('expiry-failure',{request_id:failed.request_id,claim_token:failed.claim_token,message:'合成真正阻塞'},true));assert.equal(sql.prepare('SELECT state FROM editorial_requests WHERE id=?').get(failed.request_id).state,'claimed');
 const preserved=await bound('existing-24h-grant');sql.prepare('UPDATE editorial_requests SET claim_expires=? WHERE id=?').run('2000-01-01T00:00:00.000Z',preserved.lease.request_id);assert.equal((await req.assertEditorialRequestGrant('existing-24h-grant',preserved.lease.request_id,preserved.run.run_id,'outline')).authorization.max_provider_requests,4);
 console.log('PASS progress/bind/failure expiry-at-write guards; previously bound 24-hour grant remains unchanged');
}

// Research cannot overwrite frozen flow evidence; coordination remains recordable.
{
 const owner='frozen-research',{lease,run}=await bound(owner),before=sql.prepare('SELECT progress_json FROM editorial_requests WHERE id=?').get(lease.request_id).progress_json;
 await assert.rejects(req.recordEditorialRequestProgress(owner,progress(lease)));assert.equal(sql.prepare('SELECT progress_json FROM editorial_requests WHERE id=?').get(lease.request_id).progress_json,before);
 await req.recordEditorialRequestProgress(owner,{...progress(lease),phase:'coordination',fact_pack:undefined});assert.equal(fence(run),1);
 console.log('PASS flow-bound research cannot mutate frozen evidence; genuine coordination is still recordable');
}

// Concurrent duplicate keys and claims stay owner-isolated; cancel during a wake
// cannot change the durable terminal state when that wake returns accepted.
{
 const owner='dedup-owner';args(owner);const key=crypto.randomUUID(),results=await Promise.all(Array.from({length:6},()=>req.startEditorialRequest(owner,start(key))));assert.equal(results.filter(r=>r.created).length,1);const id=results[0].current.request_id;
 const claims=await Promise.all(Array.from({length:6},()=>req.claimEditorialRequest(owner,{request_id:id})));assert.equal(claims.filter(c=>c.claimed).length,1);
 args('dedup-other');const other=await req.startEditorialRequest('dedup-other',start(key));assert.notEqual(other.current.request_id,id);await assert.rejects(req.stopEditorialRequest('dedup-other',{request_id:id,confirm:true}));
 const wakeOwner='wake-cancel';args(wakeOwner);const pending=await req.startEditorialRequest(wakeOwner,start()),wakeId=pending.current.request_id;
 sql.prepare('UPDATE editorial_request_outbox SET next_attempt=? WHERE request_id=?').run('2000-01-01T00:00:00.000Z',wakeId);
 let release;wakeHold=new Promise(resolve=>{release=resolve;});wakeAccepted=true;const before=wakes,dispatch=req.dispatchEditorialWake(wakeOwner,{request_id:wakeId});while(wakes===before)await new Promise(resolve=>setImmediate(resolve));
 await req.stopEditorialRequest(wakeOwner,{request_id:wakeId,confirm:true});release();const dispatchResult=await dispatch;wakeHold=null;assert.equal(dispatchResult.state,'cancelled');assert.equal(dispatchResult.read_only,true);
 const view=await req.readEditorialRequest(wakeOwner,{request_id:wakeId});assert.equal(view.current.state,'cancelled');assert.equal(view.current.dispatch_state,'cancelled');assert.equal(sql.prepare('SELECT state FROM editorial_request_outbox WHERE request_id=?').get(wakeId).state,'cancelled');
 console.log('PASS concurrent same-key/claim dedup, cross-owner isolation, in-flight wake cannot revive cancellation');
}

// In-flight cancellation retains the actual paid receipt but cannot save an
// artifact, advance the flow, recover permission, or make another paid request.
{
 const owner='cancel-provider',{lease,run}=await bound(owner),stage=await claim(owner,run,'outline');response=outline;
 const prepared=await flow.prepareEditorialStage(owner,{run_id:run.run_id,stage:'outline',token:stage.token,expected_model:model,expected_input_sha256:stage.input_sha256,confirm:true});
 let release;hold=new Promise(resolve=>{release=resolve;});const before=calls,execution=flow.executeEditorialStage(prepared);while(calls===before)await new Promise(resolve=>setImmediate(resolve));
 await req.stopEditorialRequest(owner,{request_id:lease.request_id,confirm:true});release();await execution;hold=null;
 const receipt=sql.prepare('SELECT * FROM claude_attempts WHERE owner=?').get(owner);assert.equal(receipt.state,'completed');assert.equal(JSON.parse(receipt.response).text,JSON.stringify(outline));
 const stopped=await read(owner,run);assert.equal(stopped.state,'outline');assert.equal(stopped.artifacts.outline,undefined);assert.equal(stopped.control_state,'archived');
 await flow.setEditorialControl(owner,{run_id:run.run_id,reason:'恢复历史可见',confirm:true},'active');await assert.rejects(flow.recoverEditorialStage(owner,{run_id:run.run_id,stage:'outline',confirm:true}));assert.equal((await flow.executeEditorialStage(prepared)).cached,true);assert.equal(calls-before,1);assert.deepEqual(sql.prepare('SELECT * FROM claude_attempts WHERE owner=?').get(owner),receipt);
 console.log('PASS cancellation during provider return preserves actual receipt; no artifact advancement/recovery/retry after restore');
}

// The original frozen-four grant runs each stage once and skips both zero-issue
// revisions with identical text/hash. Technical failure never grants a paid retry.
{
 const owner='zero-issue',{lease,run}=await bound(owner),before=calls;await write(owner,run,'outline',outline);await review(owner,run,'outline_review',pass);await write(owner,run,'body',article);await review(owner,run,'structure_review',pass);
 await assert.rejects(flow.prepareEditorialStage(owner,{run_id:run.run_id,stage:'structure_revision',token:crypto.randomUUID(),expected_model:model,expected_input_sha256:'a'.repeat(64),confirm:true}));
 const structuralSkip=await claim(owner,run,'structure_revision');await flow.skipEditorialRevision(owner,{run_id:run.run_id,stage:'structure_revision',expected_snapshot_sha256:run.snapshot_sha256,expected_input_sha256:structuralSkip.input_sha256,confirm:true});await review(owner,run,'fact_check',factReport(article));const factualSkip=await claim(owner,run,'fact_revision');await flow.skipEditorialRevision(owner,{run_id:run.run_id,stage:'fact_revision',expected_snapshot_sha256:run.snapshot_sha256,expected_input_sha256:factualSkip.input_sha256,confirm:true});await review(owner,run,'final_verify',factReport(article));
 const final=await read(owner,run);assert.equal(calls-before,2);assert.equal(final.current_version.version,1);assert.equal(final.current_version.sha256,await hash(JSON.stringify(article)));for(const stage of ['structure_revision','fact_revision'])assert.equal(final.artifacts[stage].provenance,'retained_writer_version');
 assert.equal((await req.readEditorialRequest(owner,{request_id:lease.request_id})).current.progress.filter(p=>p.state==='skipped').length,2);
 const failed=await bound('failed-no-retry');providerState='failed';const first=await claim('failed-no-retry',failed.run,'outline'),prepared=await flow.prepareEditorialStage('failed-no-retry',{run_id:failed.run.run_id,stage:'outline',token:first.token,expected_model:model,expected_input_sha256:first.input_sha256,confirm:true});const count=calls;await flow.executeEditorialStage(prepared);await flow.executeEditorialStage(prepared);assert.equal(calls-count,1);await assert.rejects(flow.recoverEditorialStage('failed-no-retry',{run_id:failed.run.run_id,stage:'outline',confirm:true}));providerState='completed';
 console.log('PASS two zero-issue skips retain exact hash/version; failed writer stage remains one-charge without paid retry');
}

// No outline correction stage is in the frozen grant. A rejected outline stays
// blocked at outline_needs_revision, preserving its actual review and sole fee.
{
 const owner='outline-needs-revision',{lease,run}=await bound(owner),before=calls;await write(owner,run,'outline',outline);const outlineArticle={title:outline.title,paragraphs:[JSON.stringify(outline)]},outlineIssue=issue(outlineArticle,'outline-defect',1);await review(owner,run,'outline_review',{...pass,decision:'revise',issues:[outlineIssue]});
 assert.equal((await read(owner,run)).state,'outline_needs_revision');const blocked=(await req.readEditorialRequest(owner,{request_id:lease.request_id})).current;assert.match(blocked.blocked_reason,/冻结授权不包含同作者框架修订/);assert.equal(blocked.error,blocked.blocked_reason);await assert.rejects(claim(owner,run,'body'));await assert.rejects(req.assertEditorialRequestGrant(owner,lease.request_id,run.run_id,'outline_revision'));assert.equal(calls-before,1);assert.equal((await read(owner,run)).artifacts.outline_review.artifact.decision,'revise');
 console.log('PASS outline_needs_revision is a real blocked result without fabricated pass or additional paid path');
}
assert.equal(legacyRows(),beforeLegacy);assert.equal(JSON.stringify(sql.prepare('SELECT * FROM outline_flows ORDER BY id').all()),beforeLegacyOutline);assert.equal(JSON.stringify(sql.prepare("SELECT * FROM workflow_controls WHERE owner='legacy' ORDER BY run_id").all()),beforeLegacyControls);assert.equal(dispatches,0);assert.equal(puts,0);
console.log('PASS legacy daily quota/old archived tests remain byte-identical; no real provider/network/event/storage/08 schedule change');
