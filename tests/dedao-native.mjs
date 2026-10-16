// Isolated synthetic D1 tests. No real browser, user article, native turn or wake.
import ts from 'typescript';import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {createHash,webcrypto} from 'node:crypto';import {createRequire} from 'node:module';import {Miniflare} from 'miniflare';import {drizzle} from 'drizzle-orm/d1';import {migrate} from 'drizzle-orm/d1/migrator';
const require=createRequire(import.meta.url),uuid=()=>webcrypto.randomUUID(),hash=value=>createHash('sha256').update(value).digest('hex');
const mf=new Miniflare({cf:false,modules:true,script:'export default {fetch(){return new Response("SYNTHETIC ONLY")}}',compatibilityDate:'2026-05-22',d1Databases:{DB:'native-synthetic'},r2Buckets:['BUCKET']});
let clock=Date.now(),checks=0;class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
const time=()=>new Date(clock).toISOString(),check=(value,label)=>{assert.ok(value,label);checks++;},reject=async action=>{await assert.rejects(action);checks++;};
try{
 const d1=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');await migrate(drizzle(d1),{migrationsFolder:'drizzle'});
 const cache={},mocks={'./test-store':{db:()=>d1},'./writing-input':{hashText:async value=>hash(value)},'./articles':{bucket:()=>bucket,createArticle:()=>{throw Error('No manuscript uploads in lifecycle tests');}},'./events':{readiness:async()=>({connected:true}),dispatchDedao:async()=>false},'./article-handoff':{notifyArticle:()=>{throw Error('No small-fish dispatch in lifecycle tests');},reconcileArticleHandoff:()=>{throw Error('No small-fish dispatch in lifecycle tests');}}};
 function load(name){if(cache[name])return cache[name];const out={};cache[name]=out;vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:out,require:name=>mocks[name]||(name.startsWith('./')?load(name.slice(2)):require(name)),crypto:webcrypto,Date:ClockDate,Error,Set,Map,Uint8Array,TextEncoder,TextDecoder,File,atob,btoa});return out;}
 const api=load('dedao'),native=load('dedao-native'),contract=load('dedao-contract'),owner='SYNTHETIC-NATIVE',thread=uuid(),turn=uuid(),executor='native-codex:'+thread;
 async function created(view,who,actualThread,actualTurn){
  const dispatch=load('dedao-dispatch'),a={batch_id:view.batch.id,queue_revision:view.batch.queue_revision,dispatch_key:uuid(),dispatcher_id:'SYNTHETIC-PARENT',target_environment:'SYNTHETIC-COMPUTER',selection_ref:'synthetic-supported-current-authorization',observed_at:time()};
  assert.equal((await dispatch.reserveDedaoDispatch(who,a)).may_create,true);
  await dispatch.recordDedaoDispatch(who,{...a,outcome:'created',thread_id:actualThread,session_id:actualThread,turn_id:actualTurn,observation_ref:'synthetic-supported-created-task-and-request-meta'});
  return api.readDedao(who,view.batch.id);
 }
 const capabilities=()=>({conversation_url:contract.DEDAO_URL,checked_at:time(),codex_available:true,browser_connected:true,logged_in:true,download_readable:true});
 let registration=await api.registerDedaoExecutor(owner,{executor_id:executor,browser_session:'synthetic-real-Edge-7',capabilities:capabilities()}),token=registration.native_bridge.credential;
 const context=()=>native.authenticateDedaoNative('Bearer '+token),identity=()=>({thread_id:thread,session_id:thread,turn_id:turn}),call=async(operation,args)=>api.dedaoNativeBridgeCall(await context(),operation,args);
 check(!registration.connected&&!registration.ready,'registration alone cannot assert native lifecycle or wake readiness');
 check(registration.native_bridge.thread_id===thread,'private credential binds actual thread identity');
 await reject(()=>native.authenticateDedaoNative('Bearer dn_'+'0'.repeat(64)));
 check((await api.dedaoConnection(owner)).accept_queue_ready,'event intake is independent of unvalidated execution readiness');
 const publicBefore=JSON.stringify(await api.readDedao(owner));check(!publicBefore.includes(token)&&!publicBefore.includes('credential_hash'),'ordinary read contains no bridge secret or credential hash');
 await reject(()=>call('bind',{...identity(),thread_id:uuid(),lifecycle_source:'codex_app_tools',wake_id:'synthetic-wake',wake_state:'ACTIVE'}));
 await reject(()=>call('bind',{...identity(),hooks_ready:true,wake_ready:true}));
 await call('bind',{...identity(),lifecycle_source:'codex_app_tools',wake_id:'synthetic-wake',wake_state:'ACTIVE'});
 check(!(await api.dedaoConnection(owner)).connected,'configured flags cannot replace real supported lifecycle observation');
 await reject(()=>call('native_lifecycle_observation',{...identity(),source:'codex_app_tools',event_id:uuid(),state:'active',observed_at:time()}));
 clock++;
 const observe={...identity(),source:'codex_app_tools',event_id:uuid(),state:'active',observed_at:time(),observation_ref:'synthetic-supported-requestMeta-and-read_thread'};
 const recorded=await call('native_lifecycle_observation',observe);check(recorded.applied,'supported native observation establishes actual active turn');
 check((await call('native_lifecycle_observation',observe)).duplicate,'unknown observation response recovers the same immutable event');
 await reject(()=>call('native_lifecycle_observation',{...observe,state:'completed'}));
 check((await api.dedaoConnection(owner)).connected,'actual lifecycle receipt and active wake permit queueing');
 const honestLifecycle=(await api.dedaoConnection(owner)).native;check(honestLifecycle.lifecycle_connected&&honestLifecycle.hooks_ready===false,'official observation connects lifecycle without claiming optional hooks installed or ready');
 const first=await created(await api.startDedao(owner,{total:1,request_key:uuid()}),owner,thread,turn),id=first.batch.id;
 check(first.batch.runtime==='native_codex'&&first.batch.native.thread_id===thread,'new website batch freezes native mode and actual thread');
 await api.registerDedaoExecutor(owner,{executor_id:'synthetic-old-CLI',browser_session:'synthetic-office-CDP',capabilities:capabilities()});
 await reject(()=>api.reserveDedaoLaunch(owner,{batch_id:id,executor_id:'synthetic-old-CLI',launcher_id:'synthetic-launch',queue_revision:first.batch.queue_revision,claim_token:uuid()}));
 await reject(()=>api.claimDedao(owner,{batch_id:id,executor_id:'synthetic-old-CLI',execution_id:'synthetic-cli-execution',queue_revision:first.batch.queue_revision,claim_token:uuid()}));
 const grant={batch_id:id,queue_revision:first.batch.queue_revision,claim_token:uuid()},claimed=await call('claim',grant);
 check(claimed.claimed&&claimed.batch.execution_id==='native-turn:'+turn,'claim records actual native turn');
 await reject(()=>api.endDedaoExecution(owner,{...grant,executor_id:executor,execution_id:'native-turn:'+turn,process_exited:true}));
 await reject(()=>call('heartbeat',{...grant,execution_id:'native-turn:'+uuid()}));
 const action=await call('begin_dedao_action',{...grant,ordinal:1,action:'recommend'});check(action.execute_action,'first actual message has one permission');
 check(!(await call('begin_dedao_action',{...grant,ordinal:1,action:'recommend'})).execute_action,'ambiguous message response cannot permit another send');
 await call('confirm_dedao_action',{...grant,ordinal:1,action:'recommend',action_id:action.action.action_id,observation:{conversation_url:contract.DEDAO_URL,result:'response_completed',response_ref:'synthetic-response',observed_at:time()}});
 clock+=181000;const lost=await api.readDedao(owner,id);check(!lost.batch.execution_continuing&&!lost.batch.native.safe_boundary,'expired heartbeat does not assert native exit or safe boundary');
 await reject(()=>api.resumeDedao(owner,id));
 await reject(()=>call('heartbeat',grant));
 await api.requestDedaoPause(owner,id);check(!(await api.readDedao(owner,id)).batch.can_resume,'pause request cannot release unknown running writer');
 const boundary=await call('safe_boundary',{...identity(),batch_id:id});check(boundary.batch.native.safe_boundary&&boundary.batch.executor_ended===0,'safe boundary stops batch writes without claiming CLI exit');
 await reject(()=>call('begin_dedao_action',{...grant,ordinal:1,action:'adopt'}));
 const retained=await api.readDedao(owner,id);check(retained.batch.id===id&&retained.batch.actions[0].action_id===action.action.action_id,'paused original batch and confirmed action remain');
 // Idle is not termination evidence and does not manufacture a second batch.
 clock++;await call('native_lifecycle_observation',{...identity(),source:'codex_app_tools',event_id:uuid(),state:'idle',observed_at:time(),observation_ref:'synthetic-idle-observation'});
 check((await api.dedaoConnection(owner)).connected,'verified idle connection can accept a website queue for native wake');
 await reject(()=>call('claim',{...grant,claim_token:uuid()}));
 const turn2=uuid();clock++;await call('native_lifecycle_observation',{...identity(),turn_id:turn2,source:'codex_app_tools',event_id:uuid(),state:'active',observed_at:time(),observation_ref:'synthetic-new-real-turn'});
 registration=await api.registerDedaoExecutor(owner,{executor_id:executor,browser_session:'synthetic-real-Edge-7',capabilities:capabilities()});const oldToken=token;token=registration.native_bridge.credential;
 await reject(()=>native.authenticateDedaoNative('Bearer '+oldToken));
 await api.resumeDedao(owner,id);const resumed=await created(await api.readDedao(owner,id),owner,thread,turn2),grant2={batch_id:id,queue_revision:resumed.batch.queue_revision,claim_token:uuid()};
 check((await call('claim',grant2)).claimed,'same actual native thread resumes original batch in new turn');
 check(!(await call('begin_dedao_action',{...grant2,ordinal:1,action:'recommend'})).execute_action,'confirmed original message is read only after resume');
 await reject(()=>call('heartbeat',grant));
 // A delayed completion from an old turn cannot release the current turn.
 const oldObservation={...identity(),source:'codex_app_tools',event_id:uuid(),state:'completed',observed_at:observe.observed_at,observation_ref:'synthetic-delayed-old-completion'};
 check(!(await call('native_lifecycle_observation',oldObservation)).applied,'stale official observation cannot stop new turn');
 check(!(await api.readDedao(owner,id)).batch.native.safe_boundary,'new grant retains global execution lock');
 // Observing a new active turn alone never declares a prior active writer stopped.
 const turn3=uuid();clock++;await call('native_lifecycle_observation',{...identity(),turn_id:turn3,source:'codex_app_tools',event_id:uuid(),state:'active',observed_at:time(),observation_ref:'synthetic-new-turn-with-unknown-prior'});
 check(!(await api.readDedao(owner,id)).batch.native.safe_boundary,'new active metadata does not invent old execution completion');
 check((await api.readDedao(owner,id)).batch.state==='paused','unknown previous turn freezes writes while retaining its global lock');
 await reject(()=>api.resumeDedao(owner,id));
 clock++;await call('native_lifecycle_observation',{...identity(),turn_id:turn3,source:'codex_app_tools',event_id:uuid(),state:'active',observed_at:time(),observation_ref:'synthetic-current-turn-read',previous_turn:{turn_id:turn2,state:'interrupted',observed_at:time(),observation_ref:'synthetic-read_thread-exact-prior-interruption'}});
 check((await api.readDedao(owner,id)).batch.native.safe_boundary,'exact supported tool record of previous interruption freezes only its own batch');
 await api.resumeDedao(owner,id);const revision3=(await created(await api.readDedao(owner,id),owner,thread,turn3)).batch.queue_revision,grant3={batch_id:id,queue_revision:revision3,claim_token:uuid()};check((await call('claim',grant3)).claimed,'verified recovery preserves original batch');
 // Synthetic completed fixture tests post-submission fencing, not acceptance.
 await d1.prepare("UPDATE dedao_items SET submitted=?,stage=11 WHERE batch_id=? AND ordinal=1").bind(time(),id).run();await d1.prepare("UPDATE dedao_batches SET state='completed',finished=? WHERE id=?").bind(time(),id).run();
 await reject(()=>call('begin_dedao_action',{...grant3,ordinal:1,action:'recommend'}));
 await reject(()=>call('submit_dedao_item',{...grant3,ordinal:1}));
 check((await api.startDedao(owner,{total:3,request_key:uuid()})).batch.id===id,'completed batch without boundary blocks a second execution');
 await call('safe_boundary',{thread_id:thread,session_id:thread,turn_id:turn3,batch_id:id});
 const next=await created(await api.startDedao(owner,{total:3,request_key:uuid()}),owner,thread,turn3);check(next.batch.id!==id&&next.batch.total===3,'after real boundary next acceptance batch can be created once');
 check(!(JSON.stringify(await api.readDedao(owner))).includes(token),'public final view still omits protected token');
 await reject(()=>call('safe_boundary',{thread_id:thread,session_id:uuid(),turn_id:turn3,batch_id:next.batch.id}));
 const turn4=uuid();await call('bind',{thread_id:thread,session_id:thread,turn_id:turn4,lifecycle_source:'codex_app_tools',wake_id:'synthetic-wake',wake_state:'ACTIVE'});
 check(!(await api.dedaoConnection(owner)).native.lifecycle_connected,'binding another turn clears prior turn observation instead of reusing old evidence');
 await reject(()=>call('claim',{batch_id:next.batch.id,queue_revision:next.batch.queue_revision,claim_token:uuid()}));
 const cliOwner='SYNTHETIC-CLI-ONLY';await api.registerDedaoExecutor(cliOwner,{executor_id:'synthetic-legacy-only',browser_session:'synthetic-other-browser',capabilities:capabilities()});
 check((await api.startDedao('SYNTHETIC-NATIVE-INTAKE-NO-EXECUTOR',{total:1,request_key:uuid()})).batch.runtime==='native_codex','subscribed native intake does not demand an old fixed thread');
 check((await api.startDedao(cliOwner,{execution_mode:'cli_cdp',total:1,request_key:uuid()})).batch.runtime==='cli_cdp','only explicit compatibility API may start a CLI batch');
 // Optional real-hook transport uses a separate immutable audit vocabulary.
 const hookOwner='SYNTHETIC-HOOK',hookThread=uuid(),hookTurn=uuid(),hookExecutor='native-codex:'+hookThread;
 const hookRegistration=await api.registerDedaoExecutor(hookOwner,{executor_id:hookExecutor,browser_session:'synthetic-hook-Edge',capabilities:capabilities()}),hookToken=hookRegistration.native_bridge.credential;
 const hookCall=async(operation,args)=>api.dedaoNativeBridgeCall(await native.authenticateDedaoNative('Bearer '+hookToken),operation,args),hookIdentity={thread_id:hookThread,session_id:hookThread,turn_id:hookTurn};
 await hookCall('bind',{...hookIdentity,hook_trust_confirmed:true,hooks_config_sha256:'a'.repeat(64),wake_id:'synthetic-hook-wake',wake_state:'ACTIVE'});
 check(!(await api.dedaoConnection(hookOwner)).connected,'trusted hook config alone does not assert a real hook ran');
 clock++;const hookPrompt={...hookIdentity,source:'hook',event:'UserPromptSubmit',event_id:uuid(),observed_at:time()};
 await reject(()=>hookCall('lifecycle',{...hookPrompt,source:'manual'}));
 await reject(()=>hookCall('lifecycle',{...hookPrompt,session_id:uuid()}));
 await hookCall('lifecycle',hookPrompt);check((await api.dedaoConnection(hookOwner)).native.lifecycle_source==='hook','actual hook transport is distinguished from official tool observations');
 const hookBatch=await created(await api.startDedao(hookOwner,{total:1,request_key:uuid()}),hookOwner,hookThread,hookTurn),hookGrant={batch_id:hookBatch.batch.id,queue_revision:hookBatch.batch.queue_revision,claim_token:uuid()};check((await hookCall('claim',hookGrant)).claimed,'actual active hook turn can claim');
 clock++;const hookStop={...hookIdentity,source:'hook',event:'Stop',event_id:uuid(),observed_at:time()};await hookCall('lifecycle',hookStop);
 check((await hookCall('lifecycle',hookStop)).duplicate,'same hook event is idempotent after uncertain response');
 const hookPaused=await api.readDedao(hookOwner,hookBatch.batch.id);check(hookPaused.batch.native.safe_boundary&&hookPaused.batch.executor_ended===0&&hookPaused.connection.connected,'Stop freezes batch without pretending CLI exit or disconnecting queue intake');
 await reject(()=>hookCall('heartbeat',hookGrant));
 clock++;const hookTurn2=uuid();await hookCall('lifecycle',{...hookIdentity,turn_id:hookTurn2,source:'hook',event:'UserPromptSubmit',event_id:uuid(),observed_at:time()});
 await api.resumeDedao(hookOwner,hookBatch.batch.id);const hookGrant2={batch_id:hookBatch.batch.id,queue_revision:(await created(await api.readDedao(hookOwner,hookBatch.batch.id),hookOwner,hookThread,hookTurn2)).batch.queue_revision,claim_token:uuid()};check((await hookCall('claim',hookGrant2)).claimed,'new actual hook turn resumes same batch');
 const delayedStop={...hookStop,event_id:uuid()};check(!(await hookCall('lifecycle',delayedStop)).applied,'delayed old Stop cannot freeze new hook turn');
 check(!(await api.readDedao(hookOwner,hookBatch.batch.id)).batch.native.safe_boundary,'new hook claim remains fenced');
 clock++;await hookCall('lifecycle',{...hookIdentity,turn_id:hookTurn2,source:'hook',event:'Interrupt',event_id:uuid(),observed_at:time()});check((await api.readDedao(hookOwner,hookBatch.batch.id)).batch.native.safe_boundary,'actual Interrupt freezes original grant');
 clock++;await hookCall('lifecycle',{...hookIdentity,turn_id:hookTurn2,source:'hook',event:'SessionEnd',event_id:uuid(),observed_at:time()});check(!(await api.dedaoConnection(hookOwner)).connected,'actual SessionEnd distinguishes closed session from idle');
 console.log(`PASS ${checks} isolated native checks: protected token and session binding, missing lifecycle/wake, supported tool observations, CLI isolation, no process-exit impersonation, pause/boundary fencing, expired heartbeat ambiguity, same-batch recovery, stale prior turns and completed-item replay. No real acceptance execution.`);
}finally{await mf.dispose();}
