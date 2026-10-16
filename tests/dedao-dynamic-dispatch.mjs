// Isolated real Miniflare/D1/R2 regression checks. Every owner, article, file,
// browser, thread, turn, wake and tool observation below is synthetic. No
// production data, remote I/O, Codex creation, browser action or subscription.
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {Miniflare} from 'miniflare';

const require=createRequire(import.meta.url),uuid=()=>webcrypto.randomUUID();
const hash=value=>createHash('sha256').update(value).digest('hex');
const mf=new Miniflare({cf:false,modules:true,script:'export default {fetch(){return new Response("SYNTHETIC ONLY")}}',compatibilityDate:'2026-05-22',d1Databases:{DB:'dedao-dynamic-synthetic'},r2Buckets:['BUCKET']});
let clock=Date.now(),checks=0;
class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
const time=()=>new Date(clock).toISOString();
const check=(value,label)=>{assert.ok(value,label);checks++;};
const reject=async action=>{await assert.rejects(action);checks++;};
const denied=async(action,field,label)=>{let result;try{result=await action();}catch{checks++;return;}check(!result?.[field],label);};

try{
 const d1=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
 const migrations=fs.readdirSync('drizzle').filter(name=>/^\d{4}_.*\.sql$/.test(name)).sort();
 const apply=async name=>{for(const statement of fs.readFileSync('drizzle/'+name,'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean)){try{await d1.prepare(statement).run();}catch(error){throw new Error(`Synthetic migration ${name} failed at ${statement.slice(0,100)}`,{cause:error});}}};
 // V139 already includes 0000–0047. Populate a completed legacy batch before
 // the new 0048 permanent pair guards to prove preservation of actual records.
 for(const name of migrations.filter(name=>Number(name.slice(0,4))<=47))await apply(name);
 const legacyOwner='SYNTHETIC-LEGACY-COMPLETED',legacyId=uuid(),legacyThread=uuid(),legacyTurn=uuid(),legacyStamp=time();
 await d1.prepare("INSERT INTO dedao_batches(id,owner,request_key,queue_revision,total,state,current_ordinal,created,updated,finished,executor_id,execution_id,executor_ended,dispatch_state) VALUES(?,?,?,?,3,'completed',3,?,?,?, ?,?,0,'native_wake_pending')").bind(legacyId,legacyOwner,uuid(),uuid(),legacyStamp,legacyStamp,legacyStamp,'native-codex:'+legacyThread,'native-turn:'+legacyTurn).run();
 await d1.prepare("INSERT INTO dedao_batch_runtime(batch_id,owner,runtime,thread_id,session_id,claimed_turn_id,safe_boundary,boundary_reason,updated) VALUES(?,?,'native_codex',?,?,?,1,'synthetic-original-safe-boundary',?)").bind(legacyId,legacyOwner,legacyThread,legacyThread,legacyTurn,legacyStamp).run();
 for(let ordinal=1;ordinal<=3;ordinal++){
  const bytes=Uint8Array.from([80,75,3,4,ordinal,0,31,255]),key=`synthetic-legacy/${legacyId}/${ordinal}`,download=JSON.stringify({filename:`legacy-${ordinal}.docx`,path:`C:\\synthetic-original\\legacy-${ordinal}.docx`,size:bytes.length,sha256:hash(bytes),title:`Synthetic legacy ${ordinal}`,final_version_ref:`synthetic-final-${ordinal}`,browser_session:'synthetic-original-computer'});
  await bucket.put(key,bytes);
  await d1.prepare("INSERT INTO dedao_items(batch_id,owner,ordinal,id,title,stage,version,final_ref,download_json,article_id,upload_state,submitted_handoff_id,submitted,created,updated) VALUES(?,?,?,?,?,11,9,?,?,?,'uploaded',?,?,?,?)").bind(legacyId,legacyOwner,ordinal,uuid(),`Synthetic legacy ${ordinal}`,`synthetic-final-${ordinal}`,download,uuid(),uuid(),legacyStamp,legacyStamp,legacyStamp).run();
  await d1.prepare("INSERT INTO dedao_actions(batch_id,ordinal,action,action_id,state,observation_json,created,updated) VALUES(?,?,'finalize',?,'confirmed',?,?,?)").bind(legacyId,ordinal,uuid(),JSON.stringify({response_ref:`synthetic-original-response-${ordinal}`}),legacyStamp,legacyStamp).run();
  await d1.prepare('INSERT INTO dedao_chunks(batch_id,ordinal,offset,size,sha256,object_key) VALUES(?,?,0,?,?,?)').bind(legacyId,ordinal,bytes.length,hash(bytes),key).run();
 }
 const legacySnapshot=async()=>({
  batch:await d1.prepare('SELECT * FROM dedao_batches WHERE id=?').bind(legacyId).first(),
  items:(await d1.prepare('SELECT * FROM dedao_items WHERE batch_id=? ORDER BY ordinal').bind(legacyId).all()).results,
  actions:(await d1.prepare('SELECT * FROM dedao_actions WHERE batch_id=? ORDER BY ordinal,action').bind(legacyId).all()).results,
  chunks:(await d1.prepare('SELECT * FROM dedao_chunks WHERE batch_id=? ORDER BY ordinal,offset').bind(legacyId).all()).results,
  bytes:await Promise.all([1,2,3].map(async ordinal=>hash(new Uint8Array(await (await bucket.get(`synthetic-legacy/${legacyId}/${ordinal}`)).arrayBuffer())))),
 });
 const originalLegacy=await legacySnapshot(),originalRuntime=await d1.prepare('SELECT * FROM dedao_batch_runtime WHERE batch_id=?').bind(legacyId).first();
 const originalGuards=(await d1.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all()).results;
 const newMigrations=migrations.filter(name=>Number(name.slice(0,4))>47);
 for(const name of newMigrations)await apply(name);
 assert.deepEqual(await legacySnapshot(),originalLegacy);checks++;
 const guards=(await d1.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all()).results;
 assert.deepEqual(guards.filter(g=>originalGuards.some(old=>old.name===g.name)),originalGuards);checks++;
 const addedGuardNames=newMigrations.flatMap(name=>[...fs.readFileSync('drizzle/'+name,'utf8').matchAll(/CREATE TRIGGER\s+([A-Za-z0-9_]+)/g)].map(match=>match[1])).sort();
 assert.deepEqual(guards.filter(g=>!originalGuards.some(old=>old.name===g.name)).map(g=>g.name).sort(),addedGuardNames);checks++;
 const migratedRuntime=await d1.prepare('SELECT * FROM dedao_batch_runtime WHERE batch_id=?').bind(legacyId).first();
 for(const [key,value] of Object.entries(originalRuntime))assert.equal(migratedRuntime[key],value,`legacy runtime ${key} preserved`);
 check(migratedRuntime.dispatch_mode==='fixed','legacy completed batch retains fixed compatibility binding');

 let cache={},wakeAccepted=true;
 const wakeCalls=[],subscription={dedao:true,downstream:true};
 const mocks={
  './test-store':{db:()=>d1},'./writing-input':{hashText:async value=>hash(value)},
  './articles':{bucket:()=>bucket,createArticle:()=>{throw Error('No manuscript uploads in dynamic dispatch tests');}},
  './events':{readiness:async(_owner,name)=>({connected:name==='dedao.writing_requested'?subscription.dedao:subscription.downstream}),dispatchDedao:async(...args)=>{wakeCalls.push(args);return wakeAccepted;}},
  './article-handoff':{notifyArticle:()=>{throw Error('No small-fish dispatch in dynamic tests');},reconcileArticleHandoff:()=>{throw Error('No small-fish dispatch in dynamic tests');}},
 };
 function load(name){if(cache[name])return cache[name];const out={};cache[name]=out;vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:out,require:name=>mocks[name]||(name.startsWith('./')?load(name.slice(2)):require(name)),crypto:webcrypto,Date:ClockDate,Error,Set,Map,Uint8Array,TextEncoder,TextDecoder,File,atob,btoa,fetch:()=>{throw Error('NO REMOTE I/O');}});return out;}
 let api=load('dedao'),dispatch=load('dedao-dispatch'),native=load('dedao-native');
 const contract=load('dedao-contract'),owner='SYNTHETIC-DYNAMIC';
 const runtime=id=>native.batchRuntime(owner,id);
 const capabilities=()=>({conversation_url:contract.DEDAO_URL,checked_at:time(),codex_available:true,browser_connected:true,logged_in:true,download_readable:true});
 const reserveArgs=(batch,key=uuid(),target='synthetic-authorized-computer-A')=>({batch_id:batch.id,queue_revision:batch.queue_revision,dispatch_key:key,dispatcher_id:'synthetic-parent-dispatcher',target_environment:target,selection_ref:'synthetic-connected-environment-observation',observed_at:time()});
 const observation=(reservation,outcome,extra={})=>({batch_id:reservation.batch_id,queue_revision:reservation.queue_revision,dispatch_key:reservation.dispatch_key,outcome,observed_at:time(),observation_ref:'synthetic-supported-tool-receipt-'+outcome,...(outcome==='stopped'?{source:'codex_app_tools'}:{}),...extra});
 async function prepareNative(thread,turn,browser='synthetic-computer-A-Edge',executionOwner=owner){
  const executor='native-codex:'+thread,registration=await api.registerDedaoExecutor(executionOwner,{executor_id:executor,browser_session:browser,capabilities:capabilities()}),token=registration.native_bridge.credential;
  const context=()=>native.authenticateDedaoNative('Bearer '+token),call=async(operation,args)=>api.dedaoNativeBridgeCall(await context(),operation,args);
  await call('bind',{thread_id:thread,session_id:thread,turn_id:turn,lifecycle_source:'codex_app_tools',wake_id:'synthetic-existing-single-subscription',wake_state:'ACTIVE'});
  return {executor,token,call,identity:{thread_id:thread,session_id:thread,turn_id:turn},observe:async()=>{clock++;return call('native_lifecycle_observation',{thread_id:thread,session_id:thread,turn_id:turn,source:'codex_app_tools',event_id:uuid(),state:'active',observed_at:time(),observation_ref:'synthetic-actual-thread-and-turn-tool-read'});}};
 }

 subscription.dedao=false;await reject(()=>api.startDedao(owner,{total:3,request_key:uuid()}));
 subscription.dedao=true;subscription.downstream=false;await reject(()=>api.startDedao(owner,{total:3,request_key:uuid()}));subscription.downstream=true;
 const keys=Array.from({length:8},uuid),starts=await Promise.all(keys.map(request_key=>api.startDedao(owner,{total:3,request_key}))),batch=starts[0].batch;
 check(starts.every(result=>result.batch.id===batch.id),'8 start events share one persisted active batch');
 check(wakeCalls.length===1&&wakeCalls[0][1]===batch.id,'native batch emits one real dispatch call after persistence');
 let currentRuntime=await runtime(batch.id);
 check(currentRuntime===null&&batch.runtime==='native_codex'&&batch.native.thread_id===null,'queue retains native identity without freezing an unrelated fixed computer or thread');
 check(!starts[0].connection.executor_connected,'queue acceptance does not invent executor readiness');
 await api.registerDedaoExecutor(owner,{executor_id:'synthetic-unbound-legacy-cli',browser_session:'synthetic-unrelated-cli-browser',capabilities:capabilities()});
 const cliArgs={batch_id:batch.id,queue_revision:batch.queue_revision,executor_id:'synthetic-unbound-legacy-cli',launcher_id:'synthetic-unbound-cli-launcher',execution_id:'synthetic-unbound-cli-execution',claim_token:uuid()};
 await reject(()=>api.reserveDedaoLaunch(owner,cliArgs));
 await reject(()=>api.claimDedao(owner,cliArgs));
 await reject(()=>api.endDedaoExecution(owner,{...cliArgs,execution_id:cliArgs.launcher_id,process_exited:true}));
 check((await api.readDedao(owner,batch.id)).batch.state==='queued'&&(await runtime(batch.id))===null,'CLI cannot convert or release unbound native queue');
 const wakeCount=wakeCalls.length;await api.startDedao(owner,{total:3,request_key:keys[0]});check(wakeCalls.length===wakeCount,'duplicate start reads existing batch without another wake');
 const reservations=Array.from({length:8},()=>reserveArgs(batch)),results=await Promise.all(reservations.map(args=>dispatch.reserveDedaoDispatch(owner,args)));
 check(results.filter(result=>result.may_create).length===1,'8 dispatch races grant exactly one Codex creation');
 const reservation=reservations[results.findIndex(result=>result.may_create)];
 check(!(await dispatch.reserveDedaoDispatch(owner,reservation)).may_create,'unknown reservation response cannot grant creation twice');
 await reject(()=>dispatch.reserveDedaoDispatch(owner,{...reservation,target_environment:'synthetic-other-computer'}));
 await reject(()=>dispatch.readDedaoDispatch('SYNTHETIC-OTHER-OWNER',batch.id,batch.queue_revision));
 await denied(()=>dispatch.reserveDedaoDispatch(owner,{...reservation,dispatch_key:uuid(),queue_revision:uuid()}),'may_create','wrong queue revision cannot dispatch');
 const receipt=await dispatch.readDedaoDispatch(owner,batch.id,batch.queue_revision);
 check(receipt.dispatch.dispatch_key===reservation.dispatch_key&&receipt.dispatch.state==='reserved'&&receipt.may_create===false,'read preserves exact winning reservation without a new grant');
 clock+=31*60*1000;
 check(!(await dispatch.reserveDedaoDispatch(owner,reservation)).may_create,'time passing does not recover another create permission');
 check(!(await dispatch.reserveDedaoDispatch(owner,reserveArgs(batch))).may_create,'new key cannot take an ambiguous old reservation');
 await api.requestDedaoPause(owner,batch.id);await reject(()=>api.resumeDedao(owner,batch.id));
 const unknown=observation(reservation,'unknown');await dispatch.recordDedaoDispatch(owner,unknown);
 check((await dispatch.readDedaoDispatch(owner,batch.id,batch.queue_revision)).dispatch.state==='unknown','unknown creation is explicit durable state');
 await dispatch.recordDedaoDispatch(owner,unknown);
 await reject(()=>dispatch.recordDedaoDispatch(owner,observation(reservation,'not_created')));
 await reject(()=>dispatch.recordDedaoDispatch(owner,observation(reservation,'not_created',{certainty:'request_not_sent'})));
 await reject(()=>dispatch.recordDedaoDispatch(owner,observation(reservation,'stopped',{turn_state:'completed'})));
 await reject(()=>api.resumeDedao(owner,batch.id));
 // A paused unknown launch remains fenced. A grounded exact create receipt can
 // resolve its identity, but cannot silently start browser execution.
 const firstThread=uuid(),firstTurn=uuid(),created=observation(reservation,'created',{thread_id:firstThread,session_id:firstThread,turn_id:firstTurn});
 await dispatch.recordDedaoDispatch(owner,created);await dispatch.recordDedaoDispatch(owner,created);
 check((await dispatch.readDedaoDispatch(owner,batch.id,batch.queue_revision)).dispatch.state==='created','same immutable create receipt can reconcile a lost response');
 await reject(()=>dispatch.recordDedaoDispatch(owner,{...created,thread_id:uuid()}));
 await reject(()=>api.resumeDedao(owner,batch.id));
 clock++;
 const terminal1=observation(reservation,'stopped',{thread_id:firstThread,session_id:firstThread,turn_id:firstTurn,turn_state:'interrupted'});
 await reject(()=>dispatch.recordDedaoDispatch(owner,{...terminal1,source:'manual'}));
 await reject(()=>dispatch.recordDedaoDispatch(owner,{...terminal1,turn_id:uuid()}));
 await reject(()=>dispatch.recordDedaoDispatch(owner,{...terminal1,queue_revision:uuid()}));
 await reject(()=>dispatch.recordDedaoDispatch(owner,{...terminal1,turn_state:'idle'}));
 await reject(()=>dispatch.recordDedaoDispatch(owner,{...terminal1,observed_at:new Date(clock+1).toISOString()}));
 await reject(()=>dispatch.recordDedaoDispatch(owner,{...terminal1,observed_at:new Date(Date.parse(created.observed_at)-1).toISOString()}));
 await dispatch.recordDedaoDispatch(owner,terminal1);
 check((await dispatch.recordDedaoDispatch(owner,terminal1)).duplicate,'exact stopped receipt is idempotent after a lost result');
 const resumed=await api.resumeDedao(owner,batch.id),revision2=resumed.batch.queue_revision;
 check(revision2!==batch.queue_revision&&resumed.batch.id===batch.id,'exact unclaimed thread interruption permits same batch new generation');
 check(wakeCalls.length===wakeCount+1,'resume emits a new generation wake without another batch');
 const secondReservation=reserveArgs(resumed.batch,uuid(),'synthetic-authorized-computer-B');check((await dispatch.reserveDedaoDispatch(owner,secondReservation)).may_create,'new verified queue generation may select a different authorized computer');
 const beforeLateRuntime=await runtime(batch.id);
 await dispatch.recordDedaoDispatch(owner,created);
 assert.deepEqual(await runtime(batch.id),beforeLateRuntime);checks++;
 await reject(()=>dispatch.recordDedaoDispatch(owner,{...created,thread_id:uuid(),observed_at:time()}));
 await reject(()=>dispatch.recordDedaoDispatch(owner,{...terminal1,observed_at:time(),observation_ref:'synthetic-delayed-old-generation-stop'}));
 await denied(()=>dispatch.reserveDedaoDispatch(owner,reservation),'may_create','late old event cannot grant another launch');
 const thread2=uuid(),turn2=uuid(),created2=observation(secondReservation,'created',{thread_id:thread2,session_id:thread2,turn_id:turn2});
 await reject(()=>dispatch.recordDedaoDispatch(owner,{...created2,thread_id:undefined}));
 await dispatch.recordDedaoDispatch(owner,created2);
 currentRuntime=await runtime(batch.id);check(currentRuntime.thread_id===thread2&&currentRuntime.session_id===thread2,'created receipt binds selected actual thread without granting native readiness');
 const grant={batch_id:batch.id,queue_revision:revision2,claim_token:uuid()};
 const mismatchedTurn=await prepareNative(thread2,uuid(),'synthetic-computer-B-Edge');await mismatchedTurn.observe();
 await reject(()=>mismatchedTurn.call('claim',grant));
 const second=await prepareNative(thread2,turn2,'synthetic-computer-B-Edge');
 await reject(()=>second.call('claim',grant));
 await second.observe();
 const browserCheck=await d1.prepare('SELECT heartbeat FROM dedao_executors WHERE owner=? AND id=?').bind(owner,second.executor).first();
 await d1.prepare('UPDATE dedao_executors SET heartbeat=? WHERE owner=? AND id=?').bind(new Date(clock-91000).toISOString(),owner,second.executor).run();
 await reject(()=>second.call('claim',grant));
 await d1.prepare('UPDATE dedao_executors SET heartbeat=? WHERE owner=? AND id=?').bind(browserCheck.heartbeat,owner,second.executor).run();
 const wrongThread=uuid(),wrongTurn=uuid(),other=await prepareNative(wrongThread,wrongTurn,'synthetic-other-browser');await other.observe();
 await reject(()=>other.call('claim',{...grant,claim_token:uuid()}));
 const raceGrants=Array.from({length:8},()=>({...grant,claim_token:uuid()})),claimResults=await Promise.all(raceGrants.map(args=>second.call('claim',args)));
 check(claimResults.filter(result=>result.claimed).length===1,'8 actual-turn claim races permit only one execution');
 const liveGrant=raceGrants[claimResults.findIndex(result=>result.claimed)];
 check((await second.call('claim',liveGrant)).duplicate,'lost claim response reconciles same actual turn and private token');
 // A deliberately contradictory persisted fixture tests projection only:
 // another ready active thread must never stand in for this batch's exact turn.
 const projectionGrantBefore=await d1.prepare('SELECT * FROM dedao_batches WHERE owner=? AND id=?').bind(owner,batch.id).first(),projectionRuntimeBefore=await runtime(batch.id),projectionSessionBefore=await native.nativeSession(owner,second.executor);
 const otherBrowserCheck=await d1.prepare('SELECT heartbeat FROM dedao_executors WHERE owner=? AND id=?').bind(owner,other.executor).first();
 check((await api.readDedao(owner,batch.id)).batch.execution_continuing,'exact fresh claimed thread and active turn support execution-continuing projection');
 await d1.prepare('UPDATE dedao_executors SET heartbeat=? WHERE owner=? AND id=?').bind(time(),owner,second.executor).run();
 await d1.prepare('UPDATE dedao_executors SET heartbeat=? WHERE owner=? AND id=?').bind(new Date(clock-1).toISOString(),owner,other.executor).run();
 await d1.prepare("UPDATE dedao_native_sessions SET state='idle' WHERE owner=? AND executor_id=?").bind(owner,second.executor).run();
 const idleProjection=await api.readDedao(owner,batch.id),globalActive=await api.dedaoConnection(owner);
 check(globalActive.native.thread_id===wrongThread&&globalActive.native.turn_active&&!idleProjection.batch.execution_continuing,'another global ready active thread cannot prove this batch continues when its exact session is idle');
 await d1.prepare("UPDATE dedao_native_sessions SET state='active',turn_id=? WHERE owner=? AND executor_id=?").bind(uuid(),owner,second.executor).run();
 check(!(await api.readDedao(owner,batch.id)).batch.execution_continuing,'new active turn on exact thread also cannot prove old claimed turn continues');
 await d1.prepare('UPDATE dedao_native_sessions SET state=?,turn_id=? WHERE owner=? AND executor_id=?').bind(projectionSessionBefore.state,projectionSessionBefore.turn_id,owner,second.executor).run();
 await d1.prepare('UPDATE dedao_executors SET heartbeat=? WHERE owner=? AND id=?').bind(browserCheck.heartbeat,owner,second.executor).run();
 await d1.prepare('UPDATE dedao_executors SET heartbeat=? WHERE owner=? AND id=?').bind(otherBrowserCheck.heartbeat,owner,other.executor).run();
 assert.deepEqual({batch:await d1.prepare('SELECT * FROM dedao_batches WHERE owner=? AND id=?').bind(owner,batch.id).first(),runtime:await runtime(batch.id)},{batch:projectionGrantBefore,runtime:projectionRuntimeBefore});checks++;
 const action=await second.call('begin_dedao_action',{...liveGrant,ordinal:1,action:'recommend'});
 check(action.execute_action,'one confirmed executor receives first message permission');
 await second.call('confirm_dedao_action',{...liveGrant,ordinal:1,action:'recommend',action_id:action.action.action_id,observation:{conversation_url:contract.DEDAO_URL,result:'response_completed',response_ref:'synthetic-original-message-on-computer-B',observed_at:time()}});
 await denied(()=>dispatch.reserveDedaoDispatch(owner,reserveArgs(resumed.batch)),'may_create','active runtime cannot dispatch a competing computer');
 await reject(()=>dispatch.recordDedaoDispatch(owner,{...created2,thread_id:wrongThread,session_id:wrongThread,turn_id:wrongTurn}));
 clock+=181000;await api.requestDedaoPause(owner,batch.id);await reject(()=>api.resumeDedao(owner,batch.id));
 check(!(await runtime(batch.id)).safe_boundary,'expired heartbeat and manual pause do not prove old executor stopped');
 await reject(()=>dispatch.recordDedaoDispatch(owner,observation(secondReservation,'unknown')));
 // A new active turn is observed on the old thread without a previous-turn
 // terminal receipt. It cannot release the old batch. The owner then reads
 // that exact original turn through official tools and records only its stop.
 const newerSecondTurn=uuid();clock++;
 await second.call('native_lifecycle_observation',{thread_id:thread2,session_id:thread2,turn_id:newerSecondTurn,source:'codex_app_tools',event_id:uuid(),state:'active',observed_at:time(),observation_ref:'synthetic-new-active-turn-without-old-terminal-proof'});
 check(!(await runtime(batch.id)).safe_boundary,'another active turn cannot prove original claimed turn stopped');
 await reject(()=>api.resumeDedao(owner,batch.id));
 const beforeOfficialStopRuntime=await runtime(batch.id),sessionBeforeStop=await native.nativeSession(owner,second.executor),executorBeforeStop=await d1.prepare('SELECT * FROM dedao_executors WHERE owner=? AND id=?').bind(owner,second.executor).first();
 clock++;
 const terminal2=observation(secondReservation,'stopped',{thread_id:thread2,session_id:thread2,turn_id:turn2,turn_state:'completed',observation_ref:'synthetic-official-read_thread-exact-original-turn-completed'});
 await reject(()=>dispatch.recordDedaoDispatch(owner,{...terminal2,observed_at:new Date(Date.parse(beforeOfficialStopRuntime.updated)-1).toISOString()}));
 await reject(()=>dispatch.recordDedaoDispatch(owner,{...terminal2,turn_id:newerSecondTurn}));
 await reject(()=>dispatch.recordDedaoDispatch(owner,{...terminal2,source:undefined}));
 await dispatch.recordDedaoDispatch(owner,terminal2);
 const stoppedBatch=await d1.prepare('SELECT state,claim_hash,lease_until FROM dedao_batches WHERE owner=? AND id=?').bind(owner,batch.id).first();
 check(stoppedBatch.state==='paused'&&stoppedBatch.claim_hash===null&&stoppedBatch.lease_until===null&&(await runtime(batch.id)).safe_boundary===1,'official exact claimed-turn terminal proof atomically fences only its original batch grant');
 assert.deepEqual(await native.nativeSession(owner,second.executor),sessionBeforeStop);checks++;
 assert.deepEqual(await d1.prepare('SELECT * FROM dedao_executors WHERE owner=? AND id=?').bind(owner,second.executor).first(),executorBeforeStop);checks++;
 check((await native.nativeSession(owner,second.executor)).turn_id===newerSecondTurn&&(await native.nativeSession(owner,second.executor)).state==='active','new native active turn stays active after stopping original batch');
 await reject(()=>api.heartbeatDedao(owner,{...liveGrant,execution_id:'native-turn:'+turn2}));
 const actionBefore=(await api.readDedao(owner,batch.id)).batch.actions[0];
 const nextGeneration=await api.resumeDedao(owner,batch.id),thirdReservation=reserveArgs(nextGeneration.batch,uuid(),'synthetic-authorized-computer-C');
 check((await dispatch.reserveDedaoDispatch(owner,thirdReservation)).may_create,'exact official old terminal evidence permits a new computer after resume');
 const thread3=uuid(),turn3=uuid();await dispatch.recordDedaoDispatch(owner,observation(thirdReservation,'created',{thread_id:thread3,session_id:thread3,turn_id:turn3}));
 const third=await prepareNative(thread3,turn3,'synthetic-computer-C-Edge');await third.observe();
 const thirdGrant={batch_id:batch.id,queue_revision:nextGeneration.batch.queue_revision,claim_token:uuid()};check((await third.call('claim',thirdGrant)).claimed,'new computer claims exactly the resumed existing batch');
 check(!(await third.call('begin_dedao_action',{...thirdGrant,ordinal:1,action:'recommend'})).execute_action,'confirmed original message is never resent on another computer');
 check((await api.readDedao(owner,batch.id)).batch.actions[0].action_id===actionBefore.action_id,'cross-machine recovery preserves original action identity');
 await reject(()=>second.call('heartbeat',liveGrant));
 await reject(()=>second.call('safe_boundary',{...second.identity,batch_id:batch.id}));
 await reject(()=>dispatch.recordDedaoDispatch(owner,{...terminal2,observed_at:time(),observation_ref:'synthetic-late-old-stop-after-new-computer-claim'}));
 check(!(await runtime(batch.id)).safe_boundary,'late old computer cannot release new execution');
 cache={};api=load('dedao');dispatch=load('dedao-dispatch');native=load('dedao-native');
 check(!(await dispatch.reserveDedaoDispatch(owner,thirdReservation)).may_create,'process restart cannot repeat created Codex launch');
 check(!(await third.call('begin_dedao_action',{...thirdGrant,ordinal:1,action:'recommend'})).execute_action,'persistent restart retains confirmed message');
 const publicView=JSON.stringify(await api.readDedao(owner,batch.id));check(!publicView.includes(second.token)&&!publicView.includes(third.token)&&!publicView.includes('credential_hash')&&!publicView.includes(thirdGrant.claim_token),'public progress includes no executor credentials');

 // Component-level completed fixture tests only final-state fencing. It is not
 // evidence that writing, downloads or uploads happened in this test.
 await d1.prepare("UPDATE dedao_batches SET state='completed',finished=? WHERE owner=? AND id=?").bind(time(),owner,batch.id).run();
 check((await api.startDedao(owner,{total:1,request_key:uuid()})).batch.id===batch.id,'completed batch with active writer still blocks a new independent batch');
 await reject(()=>third.call('begin_dedao_action',{...thirdGrant,ordinal:1,action:'adopt'}));
 await third.call('safe_boundary',{...third.identity,batch_id:batch.id});
 const beforeIndependentWake=wakeCalls.length,independent=await api.startDedao(owner,{total:1,request_key:uuid()});
 check(independent.batch.id!==batch.id&&independent.batch.total===1,'after exact final boundary a new independently keyed batch is queued');
 check(wakeCalls.length===beforeIndependentWake+1,'new independent batch has its own single event dispatch');
 check((await runtime(independent.batch.id))===null&&independent.batch.native.thread_id===null,'independent batch does not inherit previous computer binding');

 // Definite non-creation also needs an explicit queue generation transition.
 const noCreateOwner='SYNTHETIC-DEFINITE-NOT-CREATED',noCreate=await api.startDedao(noCreateOwner,{total:1,request_key:uuid()}),noCreateReservation=reserveArgs(noCreate.batch);
 check((await dispatch.reserveDedaoDispatch(noCreateOwner,noCreateReservation)).may_create,'independent owner batch has independent dispatch right');
 await reject(()=>dispatch.recordDedaoDispatch(noCreateOwner,observation(noCreateReservation,'not_created',{certainty:'timeout'})));
 await dispatch.recordDedaoDispatch(noCreateOwner,observation(noCreateReservation,'not_created',{certainty:'definitive_tool_rejection'}));
 check(!(await dispatch.reserveDedaoDispatch(noCreateOwner,reserveArgs(noCreate.batch))).may_create,'definite rejection still cannot create a second intent in the same generation');
 await api.requestDedaoPause(noCreateOwner,noCreate.batch.id);const requeued=await api.resumeDedao(noCreateOwner,noCreate.batch.id);
 check((await dispatch.reserveDedaoDispatch(noCreateOwner,reserveArgs(requeued.batch))).may_create,'explicit pause/resume allows a new definite-no-create generation');

 // A wake failure is durable queued work; repeated clicks cannot silently resend.
 wakeAccepted=false;const failedWakeOwner='SYNTHETIC-UNKNOWN-WAKE',beforeFailedWake=wakeCalls.length,failedWake=await api.startDedao(failedWakeOwner,{total:1,request_key:uuid()});
 check(failedWake.batch.state==='queued','unknown callback keeps durable batch queued');
 check((await dispatch.readDedaoDispatch(failedWakeOwner,failedWake.batch.id,failedWake.batch.queue_revision)).wake.state==='unknown','callback non-acceptance is recorded separately from execution');
 await api.startDedao(failedWakeOwner,{total:1,request_key:failedWake.batch.request_key});check(wakeCalls.length===beforeFailedWake+1,'duplicate unknown startup never repeats webhook dispatch');

 // An existing fixed native queue continues under its actual original binding;
 // deployment does not retroactively demand a new dynamic launch receipt.
 const compatOwner='SYNTHETIC-FIXED-COMPAT',compatId=uuid(),compatRevision=uuid(),compatThread=uuid(),compatTurn=uuid();
 await d1.prepare("INSERT INTO dedao_batches(id,owner,request_key,queue_revision,total,state,created,updated) VALUES(?,?,?,?,1,'queued',?,?)").bind(compatId,compatOwner,uuid(),compatRevision,time(),time()).run();
 await d1.prepare("INSERT INTO dedao_batch_runtime(batch_id,owner,runtime,thread_id,session_id,safe_boundary,updated) VALUES(?,?,'native_codex',?,?,1,?)").bind(compatId,compatOwner,compatThread,compatThread,time()).run();
 await d1.prepare('INSERT INTO dedao_items(batch_id,owner,ordinal,id,created,updated) VALUES(?,?,1,?,?,?)').bind(compatId,compatOwner,uuid(),time(),time()).run();
 const compat=await prepareNative(compatThread,compatTurn,'synthetic-fixed-original-browser',compatOwner);await compat.observe();
 const compatGrant={batch_id:compatId,queue_revision:compatRevision,claim_token:uuid()};
 check((await compat.call('claim',compatGrant)).claimed,'existing fixed native batch claims original actual turn without new launch receipt');
 check((await compat.call('begin_dedao_action',{...compatGrant,ordinal:1,action:'recommend'})).execute_action,'fixed compatibility retains original protected action protocol');
 await compat.call('safe_boundary',{...compat.identity,batch_id:compatId});
 assert.deepEqual(await legacySnapshot(),originalLegacy);checks++;
 check((await api.readDedao(legacyOwner,legacyId)).batch.completed===3,'completed 3/3 legacy batch remains readable with original files and handoffs');
 console.log(`PASS ${checks} isolated dynamic dispatch checks: legacy migration and bytes preserved; native queue without fixed executor; 8-way start/reserve/claim races; same-generation launch at most once; honest unknown/create/stop receipts; owner/revision fences; actual native readiness; exact prior boundary before cross-machine resume; original message retained; stale old computer rejected; persistent restart; distinct wake and execution states. Synthetic only: no real button, computer, Codex, subscription, manuscript or remote acceptance.`);
}finally{await mf.dispose();}
