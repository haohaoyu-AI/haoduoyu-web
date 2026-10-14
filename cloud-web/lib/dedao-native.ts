import {db} from './test-store';
import {hashText} from './writing-input';
import {DedaoError} from './dedao-contract';

export type DedaoRuntime='native_codex'|'cli_cdp';
export class DedaoNativeAuthError extends DedaoError{}
export type NativeContext={owner:string;executor_id:string;thread_id:string;session_id:string;turn_id:string|null;browser_session:string;credential_hash:string};
export type NativeSession={owner:string;executor_id:string;thread_id:string;session_id:string;turn_id:string|null;state:string;credential_hash:string;credential_expires:string;hooks_ready:number;wake_ready:number;wake_id:string|null;hooks_config_sha256:string|null;lifecycle_source:string|null;observation_ref:string|null;last_observed_at:string;updated:string};
export type BatchRuntime={batch_id:string;owner:string;runtime:DedaoRuntime;dispatch_mode:'fixed'|'dynamic';thread_id:string|null;session_id:string|null;claimed_turn_id:string|null;safe_boundary:number;boundary_reason:string|null;updated:string};
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const digest=/^[a-f0-9]{64}$/;
const stamp=()=>new Date().toISOString();
const expiry=()=>new Date(Date.now()+30*60*1000).toISOString();
function need(value:unknown,message:string):asserts value{if(!value)throw new DedaoError(message);}
export function nativeThread(executor:unknown):string|null{if(typeof executor!=='string'||!executor.startsWith('native-codex:'))return null;const id=executor.slice(13);return uuid.test(id)?id:null;}
export async function batchRuntime(owner:string,batchId:string):Promise<BatchRuntime|null>{return db().prepare('SELECT * FROM dedao_batch_runtime WHERE owner=? AND batch_id=?').bind(owner,batchId).first<BatchRuntime>();}
export async function nativeSession(owner:string,executorId:string){return db().prepare('SELECT * FROM dedao_native_sessions WHERE owner=? AND executor_id=?').bind(owner,executorId).first<NativeSession>();}
export function nativeLifecycleReady(session:NativeSession){return session.lifecycle_source==='hook'?session.hooks_ready===1:session.lifecycle_source==='codex_app_tools'&&typeof session.observation_ref==='string'&&session.observation_ref.length>0;}
export async function registerNativeSession(owner:string,executorId:string){
 const threadId=nativeThread(executorId);need(threadId,'原生 Codex 对话身份无效');
 const credential='dn_'+crypto.randomUUID().replace(/-/g,'')+crypto.randomUUID().replace(/-/g,'');
 const tokenHash=await hashText(credential),expires=expiry(),time=stamp();
 await db().prepare(`INSERT INTO dedao_native_sessions(owner,executor_id,thread_id,session_id,state,credential_hash,credential_expires,hooks_ready,wake_ready,last_observed_at,updated)
 VALUES(?,?,?,?,'pending',?,?,0,0,?,?) ON CONFLICT(owner,executor_id) DO UPDATE SET credential_hash=excluded.credential_hash,credential_expires=excluded.credential_expires,updated=excluded.updated`).bind(owner,executorId,threadId,threadId,tokenHash,expires,time,time).run();
 return {credential,expires_at:expires,thread_id:threadId,session_id:threadId,executor_id:executorId};
}
export async function authenticateDedaoNative(authorization:string|null):Promise<NativeContext>{
 if(typeof authorization!=='string'||!/^Bearer dn_[a-f0-9]{64}$/.test(authorization))throw new DedaoNativeAuthError('需要本机受保护的原生执行凭据');
 const tokenHash=await hashText(authorization.slice(7));
 const row=await db().prepare(`SELECT s.*,e.browser_session FROM dedao_native_sessions s JOIN dedao_executors e ON e.owner=s.owner AND e.id=s.executor_id WHERE s.credential_hash=? AND s.credential_expires>?`).bind(tokenHash,stamp()).first<NativeSession&{browser_session:string}>();
 if(!row)throw new DedaoNativeAuthError('原生执行凭据已失效，请通过本人网站授权重新连接；不要重启已有批次');
 return {owner:row.owner,executor_id:row.executor_id,thread_id:row.thread_id,session_id:row.session_id,turn_id:row.turn_id,browser_session:row.browser_session,credential_hash:tokenHash};
}
function bindIdentity(context:NativeContext,a:Record<string,unknown>,requireTurn=true){
 need(a.thread_id===context.thread_id&&a.session_id===context.session_id,'实际 Codex 对话或会话与本机凭据不匹配');
 if(requireTurn)need(typeof a.turn_id==='string'&&uuid.test(a.turn_id),'需要实际原生 Codex 回合编号');
}
export async function assertNativeActive(owner:string,executorId:string,executionId:string){
 const row=await nativeSession(owner,executorId);
 need(row&&row.state==='active'&&nativeLifecycleReady(row)&&row.wake_ready===1&&row.credential_expires>stamp()&&row.turn_id&&executionId==='native-turn:'+row.turn_id,'原生执行回合未连接或已停止；只读原批次，不继续浏览器、文件或状态写入');
 return row;
}
export async function bindDedaoNative(context:NativeContext,a:Record<string,unknown>){
 bindIdentity(context,a);
 const appObservation=a.lifecycle_source==='codex_app_tools',hookConfigured=a.hook_trust_confirmed===true&&typeof a.hooks_config_sha256==='string'&&digest.test(a.hooks_config_sha256);
 need((appObservation||hookConfigured)&&typeof a.wake_id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(a.wake_id)&&a.wake_state==='ACTIVE','需要受支持的原生生命周期观察入口及有效网站唤醒配置');
 const row=await nativeSession(context.owner,context.executor_id);need(row,'原生会话不存在');
 const executor=await db().prepare('SELECT capabilities_json,heartbeat FROM dedao_executors WHERE owner=? AND id=?').bind(context.owner,context.executor_id).first<{capabilities_json:string;heartbeat:string}>();
 const capabilities=executor?JSON.parse(executor.capabilities_json):null;need(capabilities&&capabilities.codex_available&&capabilities.browser_connected&&capabilities.logged_in&&capabilities.download_readable&&Date.parse(executor!.heartbeat)>Date.now()-90000,'先核实此电脑的真实浏览器登录及可读下载目录');
 // Binding the same stopped turn is never a substitute for a real new turn.
 need(row.turn_id!==a.turn_id||['pending','active'].includes(row.state),'此原生回合已停止，等待实际新回合再连接');
 const expires=expiry(),time=stamp();
 const observed=row.turn_id===a.turn_id&&nativeLifecycleReady(row)&&(appObservation?row.lifecycle_source==='codex_app_tools':row.hooks_config_sha256===a.hooks_config_sha256);
 await db().prepare(`UPDATE dedao_native_sessions SET turn_id=?,state='active',hooks_ready=?,wake_ready=1,wake_id=?,hooks_config_sha256=?,lifecycle_source=?,observation_ref=?,credential_expires=?,last_observed_at=?,updated=? WHERE owner=? AND executor_id=? AND credential_hash=?`).bind(a.turn_id,!appObservation&&observed?1:0,a.wake_id,hookConfigured?a.hooks_config_sha256:null,appObservation?'codex_app_tools':'hook',appObservation&&observed?row.observation_ref:null,expires,time,time,context.owner,context.executor_id,context.credential_hash).run();
 await db().prepare('UPDATE dedao_executors SET ready=?,heartbeat=? WHERE owner=? AND id=?').bind(observed?1:0,time,context.owner,context.executor_id).run();
 return {bound:true,expires_at:expires,thread_id:context.thread_id,session_id:context.session_id,turn_id:a.turn_id,execution_id:'native-turn:'+a.turn_id,turn_state:'active',lifecycle_connected:observed};
}
export async function refreshDedaoNative(context:NativeContext,a:Record<string,unknown>){
 bindIdentity(context,a);const row=await nativeSession(context.owner,context.executor_id);need(row&&row.turn_id===a.turn_id,'只可续接当前实际原生回合');
 const expires=expiry();await db().prepare('UPDATE dedao_native_sessions SET credential_expires=?,updated=? WHERE owner=? AND executor_id=? AND credential_hash=?').bind(expires,stamp(),context.owner,context.executor_id,context.credential_hash).run();
 return {refreshed:true,expires_at:expires,thread_id:context.thread_id,session_id:context.session_id,turn_id:row.turn_id,turn_state:row.state};
}
export async function safeBoundaryDedaoNative(context:NativeContext,a:Record<string,unknown>,reason='safe_boundary'){
 bindIdentity(context,a);need(a.turn_id===context.turn_id&&typeof a.batch_id==='string'&&uuid.test(a.batch_id),'需要此回合正在执行的原批次');
 const runtime=await batchRuntime(context.owner,a.batch_id);need(runtime?.runtime==='native_codex'&&runtime.thread_id===context.thread_id&&runtime.session_id===context.session_id&&runtime.claimed_turn_id===a.turn_id,'批次未绑定此真实原生回合');
 await db().batch([
  db().prepare(`UPDATE dedao_batches SET state=CASE WHEN state IN ('running','launching') THEN 'paused' ELSE state END,claim_hash=NULL,lease_until=NULL,failure=CASE WHEN state IN ('running','launching') THEN ? ELSE failure END,updated=? WHERE id=? AND owner=? AND executor_id=? AND execution_id=? AND EXISTS(SELECT 1 FROM dedao_batch_runtime n WHERE n.batch_id=dedao_batches.id AND n.runtime='native_codex' AND n.claimed_turn_id=?)`).bind('原生执行已停止本批次所有动作，文章和步骤保留',stamp(),a.batch_id,context.owner,context.executor_id,'native-turn:'+a.turn_id,a.turn_id),
  db().prepare(`UPDATE dedao_batch_runtime SET safe_boundary=1,boundary_reason=?,updated=? WHERE owner=? AND batch_id=? AND runtime='native_codex' AND claimed_turn_id=? AND EXISTS(SELECT 1 FROM dedao_batches b WHERE b.id=dedao_batch_runtime.batch_id AND b.claim_hash IS NULL)`).bind(reason,stamp(),context.owner,a.batch_id,a.turn_id),
 ]);
 return {safe_boundary:true,batch_id:a.batch_id,semantics:'当前原生执行者已停止本批次所有浏览器、文件和状态动作；不代表聊天或 CLI 进程退出'};
}
export async function lifecycleDedaoNative(context:NativeContext,a:Record<string,unknown>){
 bindIdentity(context,a);need(a.source==='hook'&&['Stop','Interrupt','SessionEnd','UserPromptSubmit'].includes(String(a.event))&&typeof a.event_id==='string'&&uuid.test(a.event_id),'需要真实原生生命周期钩子事件');
 need(typeof a.observed_at==='string'&&Number.isFinite(Date.parse(a.observed_at))&&Date.parse(a.observed_at)<=Date.now()+90000,'需要真实生命周期事件时间');
 a={...a,observed_at:new Date(a.observed_at).toISOString()};
 const payload=JSON.stringify({source:'hook',event:a.event,event_id:a.event_id,thread_id:a.thread_id,session_id:a.session_id,turn_id:a.turn_id,observed_at:a.observed_at}),payloadHash=await hashText(payload);
 const prior=await db().prepare('SELECT payload_sha256 FROM dedao_native_lifecycle WHERE owner=? AND event_id=?').bind(context.owner,a.event_id).first<{payload_sha256:string}>();
 if(prior){need(prior.payload_sha256===payloadHash,'同一生命周期事件不能改写');return {recorded:true,duplicate:true};}
 const row=await nativeSession(context.owner,context.executor_id);need(row&&row.hooks_config_sha256,'原生生命周期钩子尚未安装并获信任');
 const event=String(a.event),time=stamp();
 // A late Stop/Interrupt must not stop a newer turn. A new turn fences the prior grant.
 const targetTurn=event==='UserPromptSubmit'?String(a.turn_id):row.turn_id;
 const apply=String(a.observed_at)>=row.last_observed_at&&(event==='UserPromptSubmit'||row.turn_id===a.turn_id);
 const nextState=event==='UserPromptSubmit'?'active':event==='SessionEnd'?'ended':event==='Interrupt'?'interrupted':'idle';
 const ops=[db().prepare('INSERT OR IGNORE INTO dedao_native_lifecycle(owner,event_id,executor_id,session_id,turn_id,event,payload_sha256,observed_at,created) VALUES(?,?,?,?,?,?,?,?,?)').bind(context.owner,a.event_id,context.executor_id,context.session_id,a.turn_id,event,payloadHash,a.observed_at,time)];
 if(apply){
  ops.push(db().prepare(`UPDATE dedao_batches SET state=CASE WHEN state IN ('running','launching') THEN 'paused' ELSE state END,claim_hash=NULL,lease_until=NULL,failure=CASE WHEN state IN ('running','launching') THEN ? ELSE failure END,updated=? WHERE owner=? AND executor_id=? AND EXISTS(SELECT 1 FROM dedao_batch_runtime n WHERE n.batch_id=dedao_batches.id AND n.runtime='native_codex' AND n.safe_boundary=0 AND ${event==='UserPromptSubmit'?'n.claimed_turn_id<>?':'n.claimed_turn_id=?'}) AND EXISTS(SELECT 1 FROM dedao_native_sessions s WHERE s.owner=dedao_batches.owner AND s.executor_id=? AND s.last_observed_at<=?)`).bind('原生回合已停止或切换；已确认文章和步骤保留',time,context.owner,context.executor_id,a.turn_id,context.executor_id,a.observed_at));
  ops.push(db().prepare(`UPDATE dedao_batch_runtime SET safe_boundary=1,boundary_reason=?,updated=? WHERE owner=? AND runtime='native_codex' AND thread_id=? AND safe_boundary=0 AND ${event==='UserPromptSubmit'?'claimed_turn_id<>?':'claimed_turn_id=?'} AND EXISTS(SELECT 1 FROM dedao_batches b WHERE b.id=dedao_batch_runtime.batch_id AND b.claim_hash IS NULL) AND EXISTS(SELECT 1 FROM dedao_native_sessions s WHERE s.owner=dedao_batch_runtime.owner AND s.executor_id=? AND s.last_observed_at<=?)`).bind(event,time,context.owner,context.thread_id,a.turn_id,context.executor_id,a.observed_at));
  ops.push(db().prepare("UPDATE dedao_native_sessions SET turn_id=?,state=?,hooks_ready=1,lifecycle_source='hook',last_observed_at=?,updated=? WHERE owner=? AND executor_id=? AND last_observed_at<=?").bind(targetTurn,nextState,a.observed_at,time,context.owner,context.executor_id,a.observed_at));
  ops.push(db().prepare('UPDATE dedao_executors SET ready=? WHERE owner=? AND id=? AND EXISTS(SELECT 1 FROM dedao_native_sessions s WHERE s.owner=dedao_executors.owner AND s.executor_id=dedao_executors.id AND s.last_observed_at=?)').bind(nextState==='ended'?0:1,context.owner,context.executor_id,a.observed_at));
 }
 await db().batch(ops);
 return {recorded:true,duplicate:false,applied:apply,thread_id:context.thread_id,session_id:context.session_id,turn_id:targetTurn,turn_state:apply?nextState:row.state};
}
// Protected local observations from supported Codex tools are attestations, not
// server-side signatures. Keep their exact references separate from hook events.
export async function observeDedaoNative(context:NativeContext,a:Record<string,unknown>){
 bindIdentity(context,a);need(a.source==='codex_app_tools'&&typeof a.event_id==='string'&&uuid.test(a.event_id)&&['active','completed','interrupted','idle','ended'].includes(String(a.state)),'需要受支持 Codex 工具的真实生命周期观察');
 function observation(value:Record<string,unknown>){need(typeof value.observed_at==='string'&&Number.isFinite(Date.parse(value.observed_at))&&Date.parse(value.observed_at)<=Date.now()+90000&&typeof value.observation_ref==='string'&&value.observation_ref.length>0&&value.observation_ref.length<=1000,'需要实际 Codex 工具观察时间及引用');}
 observation(a);const previous=a.previous_turn as Record<string,unknown>|undefined;
 if(previous){need(typeof previous.turn_id==='string'&&uuid.test(previous.turn_id)&&['completed','interrupted'].includes(String(previous.state)),'旧回合只能以实际完成或中断记录核对');observation(previous);}
 a={...a,observed_at:new Date(String(a.observed_at)).toISOString()};
 const payload=JSON.stringify({source:a.source,thread_id:a.thread_id,session_id:a.session_id,turn_id:a.turn_id,state:a.state,observed_at:a.observed_at,observation_ref:a.observation_ref,...(previous?{previous_turn:previous}:{})}),hash=await hashText(payload);
 const prior=await db().prepare('SELECT payload_sha256 FROM dedao_native_observations WHERE owner=? AND event_id=?').bind(context.owner,a.event_id).first<{payload_sha256:string}>();if(prior){need(prior.payload_sha256===hash,'同一原生观察记录不能改写');return {recorded:true,duplicate:true};}
 const row=await nativeSession(context.owner,context.executor_id);need(row&&row.lifecycle_source==='codex_app_tools'&&row.wake_ready===1,'先绑定实际原生生命周期工具及唤醒入口');
 const time=stamp(),apply=String(a.observed_at)>=row.last_observed_at,nextState=a.state==='completed'?'idle':String(a.state);
 const ops=[db().prepare('INSERT OR IGNORE INTO dedao_native_observations(owner,event_id,executor_id,session_id,turn_id,state,payload_sha256,observation_ref,observed_at,created) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(context.owner,a.event_id,context.executor_id,context.session_id,a.turn_id,a.state,hash,a.observation_ref,a.observed_at,time)];
 const endedTurn=a.state==='active'?previous?.turn_id:['completed','interrupted','ended'].includes(String(a.state))?a.turn_id:undefined;
 if(apply&&a.state==='active'&&!previous){
  // A new turn with no exact prior completion record freezes writes but keeps
  // the old global lock. It is not evidence permitting a second execution.
  ops.push(db().prepare(`UPDATE dedao_batches SET state='paused',failure=?,updated=? WHERE owner=? AND executor_id=? AND state='running' AND EXISTS(SELECT 1 FROM dedao_batch_runtime n WHERE n.batch_id=dedao_batches.id AND n.runtime='native_codex' AND n.safe_boundary=0 AND n.claimed_turn_id<>?) AND EXISTS(SELECT 1 FROM dedao_native_sessions s WHERE s.owner=dedao_batches.owner AND s.executor_id=? AND s.last_observed_at<=?)`).bind('实际原生回合已变化，但原执行结束尚未核实；冻结原步骤等待核对',time,context.owner,context.executor_id,a.turn_id,context.executor_id,a.observed_at));
 }
 if(apply&&a.state==='idle')ops.push(db().prepare(`UPDATE dedao_batches SET state='paused',failure=?,updated=? WHERE owner=? AND executor_id=? AND execution_id=? AND state='running' AND EXISTS(SELECT 1 FROM dedao_native_sessions s WHERE s.owner=dedao_batches.owner AND s.executor_id=? AND s.last_observed_at<=?)`).bind('原生回合当前空闲，停止继续动作；尚未核实安全暂停点',time,context.owner,context.executor_id,'native-turn:'+a.turn_id,context.executor_id,a.observed_at));
 if(apply&&endedTurn){
  ops.push(db().prepare(`UPDATE dedao_batches SET state=CASE WHEN state IN ('running','launching') THEN 'paused' ELSE state END,claim_hash=NULL,lease_until=NULL,failure=CASE WHEN state IN ('running','launching') THEN ? ELSE failure END,updated=? WHERE owner=? AND executor_id=? AND execution_id=? AND EXISTS(SELECT 1 FROM dedao_batch_runtime n WHERE n.batch_id=dedao_batches.id AND n.runtime='native_codex' AND n.safe_boundary=0 AND n.claimed_turn_id=?) AND EXISTS(SELECT 1 FROM dedao_native_sessions s WHERE s.owner=dedao_batches.owner AND s.executor_id=? AND s.last_observed_at<=?)`).bind('实际 Codex 工具已核实原生回合完成或中断；本批次动作已冻结',time,context.owner,context.executor_id,'native-turn:'+endedTurn,endedTurn,context.executor_id,a.observed_at));
  ops.push(db().prepare(`UPDATE dedao_batch_runtime SET safe_boundary=1,boundary_reason='codex_app_tools_observed',updated=? WHERE owner=? AND thread_id=? AND runtime='native_codex' AND claimed_turn_id=? AND EXISTS(SELECT 1 FROM dedao_batches b WHERE b.id=dedao_batch_runtime.batch_id AND b.claim_hash IS NULL) AND EXISTS(SELECT 1 FROM dedao_native_sessions s WHERE s.owner=dedao_batch_runtime.owner AND s.executor_id=? AND s.last_observed_at<=?)`).bind(time,context.owner,context.thread_id,endedTurn,context.executor_id,a.observed_at));
 }
 if(apply){
  ops.push(db().prepare('UPDATE dedao_native_sessions SET turn_id=?,state=?,observation_ref=?,last_observed_at=?,updated=? WHERE owner=? AND executor_id=? AND lifecycle_source=\'codex_app_tools\' AND last_observed_at<=?').bind(a.turn_id,nextState,a.observation_ref,a.observed_at,time,context.owner,context.executor_id,a.observed_at));
  ops.push(db().prepare('UPDATE dedao_executors SET ready=? WHERE owner=? AND id=? AND EXISTS(SELECT 1 FROM dedao_native_sessions s WHERE s.owner=dedao_executors.owner AND s.executor_id=dedao_executors.id AND s.last_observed_at=?)').bind(nextState==='ended'?0:1,context.owner,context.executor_id,a.observed_at));
 }
 await db().batch(ops);return {recorded:true,duplicate:false,applied:apply,lifecycle_source:'codex_app_tools',turn_id:a.turn_id,turn_state:apply?nextState:row.state};
}
