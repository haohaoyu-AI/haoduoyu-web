import {db} from './test-store';
import {hashText} from './writing-input';
import {dispatchDedao} from './events';
import {DedaoError} from './dedao-contract';
import {batchRuntime} from './dedao-native';

const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const identity=/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const now=()=>new Date().toISOString();
function need(value:unknown,message:string):asserts value{if(!value)throw new DedaoError(message);}
type Queue={id:string;owner:string;state:string;queue_revision:string;claim_hash:string|null};
type Dispatch={owner:string;batch_id:string;queue_revision:string;dispatch_key:string;dispatcher_id:string;target_environment:string;selection_sha256:string;selection_ref:string;state:string;thread_id:string|null;session_id:string|null;turn_id:string|null;previous_thread_id:string|null;previous_session_id:string|null;previous_turn_id:string|null;creation_json:string|null;unknown_json:string|null;stop_json:string|null;not_created_json:string|null;created:string;updated:string};
async function queue(owner:string,id:unknown){need(typeof id==='string'&&uuid.test(id),'批次编号无效');const row=await db().prepare('SELECT id,owner,state,queue_revision,claim_hash FROM dedao_batches WHERE owner=? AND id=?').bind(owner,id).first<Queue>();need(row,'没有找到此批次');return row;}
const currentSourceSql=`EXISTS(SELECT 1 FROM dedao_items i WHERE i.owner=b.owner AND i.batch_id=b.id AND i.ordinal=b.current_ordinal
 AND NOT EXISTS(SELECT 1 FROM article_content_fences f WHERE f.owner=i.owner AND (f.entity_kind='dedao_items.batch_ordinal' AND f.entity_key=json_array(i.batch_id,i.ordinal) OR f.entity_kind='dedao_items' AND f.entity_key=i.id OR f.entity_kind='articles' AND f.entity_key=i.article_id))
 AND NOT EXISTS(SELECT 1 FROM article_deletions d WHERE d.owner=i.owner AND d.id=i.article_id)
 AND NOT EXISTS(SELECT 1 FROM articles a WHERE a.owner=i.owner AND a.id=i.article_id AND a.state='deleting'))`;
async function currentSource(owner:string,id:string){return db().prepare(`SELECT i.id,i.article_id,i.download_json FROM dedao_batches b JOIN dedao_items i ON i.owner=b.owner AND i.batch_id=b.id AND i.ordinal=b.current_ordinal WHERE b.owner=? AND b.id=? AND ${currentSourceSql}`).bind(owner,id).first<{id:string;article_id:string|null;download_json:string|null}>();}
function evidence(a:Record<string,unknown>){need(typeof a.observed_at==='string'&&Number.isFinite(Date.parse(a.observed_at))&&Date.parse(a.observed_at)<=Date.now()+90000&&typeof a.observation_ref==='string'&&a.observation_ref.length>0&&a.observation_ref.length<=1000,'需要本次受支持工具的真实时间和引用');return {observed_at:new Date(a.observed_at).toISOString(),observation_ref:a.observation_ref};}
export function dedaoWakeStatement(owner:string,id:string,revision:string,time:string){return db().prepare(`INSERT OR IGNORE INTO dedao_wake_outbox(owner,batch_id,queue_revision,event_id,state,created,updated) SELECT owner,id,? ,?,'pending',?,? FROM dedao_batches b WHERE owner=? AND id=? AND state='queued' AND queue_revision=? AND ${currentSourceSql}`).bind(revision,'dedao_evt_'+id+'_'+revision,time,time,owner,id,revision);}
// One durable send attempt. An unknown callback stays unknown, never implies
// that the parent did not create a task. Recovery is by the same dispatch row.
export async function dispatchDedaoWake(owner:string,id:string,revision:string){
 const time=now(),changed=await db().prepare(`UPDATE dedao_wake_outbox SET state='sending',updated=? WHERE owner=? AND batch_id=? AND queue_revision=? AND state='pending' AND EXISTS(SELECT 1 FROM dedao_batches b WHERE b.owner=dedao_wake_outbox.owner AND b.id=dedao_wake_outbox.batch_id AND b.state='queued' AND b.queue_revision=dedao_wake_outbox.queue_revision AND ${currentSourceSql})`).bind(time,owner,id,revision).run();
 if(!changed.meta.changes)return;
 const row=await db().prepare('SELECT created FROM dedao_wake_outbox WHERE owner=? AND batch_id=? AND queue_revision=?').bind(owner,id,revision).first<{created:string}>();
 let accepted=false;try{accepted=await dispatchDedao(owner,id,row!.created,revision);}catch{/* retain an explicit unknown outcome */}
 await db().batch([
  db().prepare("UPDATE dedao_wake_outbox SET state=?,updated=? WHERE owner=? AND batch_id=? AND queue_revision=? AND state='sending'").bind(accepted?'accepted':'unknown',now(),owner,id,revision),
  db().prepare('UPDATE dedao_batches SET dispatch_state=? WHERE owner=? AND id=? AND queue_revision=?').bind(accepted?'event_accepted':'event_unknown',owner,id,revision),
 ]);
}
export async function dedaoDispatchAllowsRequeue(owner:string,id:string,revision:string){
 if(!await currentSource(owner,id))return false;
 const row=await db().prepare('SELECT state FROM dedao_dispatches WHERE owner=? AND batch_id=? AND queue_revision=?').bind(owner,id,revision).first<{state:string}>();
 if(!row||['not_created','stopped'].includes(row.state))return true;
 const runtime=await batchRuntime(owner,id);
 return row.state==='created'&&runtime?.safe_boundary===1&&!!runtime.claimed_turn_id;
}
export async function readDedaoDispatch(owner:string,id:string,revision?:string){
 const b=await queue(owner,id),selected=revision||b.queue_revision;need(uuid.test(selected),'需要确切排队版本');
 const wake=await db().prepare('SELECT event_id,state,created,updated FROM dedao_wake_outbox WHERE owner=? AND batch_id=? AND queue_revision=?').bind(owner,id,selected).first();
 const dispatch=await db().prepare('SELECT * FROM dedao_dispatches WHERE owner=? AND batch_id=? AND queue_revision=?').bind(owner,id,selected).first<Dispatch>();
 return {batch_id:id,queue_revision:selected,wake,dispatch,may_create:false,can_requeue:await dedaoDispatchAllowsRequeue(owner,id,selected),evidence_semantics:'Owner-authorized dispatcher reports supported tool results; these references do not establish native readiness or independently certify platform state.'};
}
export async function reserveDedaoDispatch(owner:string,a:Record<string,unknown>){
 const b=await queue(owner,a.batch_id),runtime=await batchRuntime(owner,b.id);
 need(typeof a.queue_revision==='string'&&uuid.test(a.queue_revision)&&typeof a.dispatch_key==='string'&&uuid.test(a.dispatch_key),'需要固定派送键和确切排队版本');
 need(identity.test(String(a.dispatcher_id||''))&&identity.test(String(a.target_environment||''))&&typeof a.selection_ref==='string'&&a.selection_ref.length>0&&a.selection_ref.length<=1000,'需要当前授权电脑选择的真实工具引用');
 need(typeof a.observed_at==='string'&&Number.isFinite(Date.parse(a.observed_at)),'需要本次当前授权电脑的实际观察时间');
 const selection=JSON.stringify({dispatcher_id:a.dispatcher_id,target_environment:a.target_environment,selection_ref:a.selection_ref,observed_at:new Date(a.observed_at).toISOString()}),selectionHash=await hashText(selection);
 const prior=await db().prepare('SELECT * FROM dedao_dispatches WHERE owner=? AND batch_id=? AND queue_revision=?').bind(owner,b.id,a.queue_revision).first<Dispatch>();
 if(prior){if(prior.dispatch_key===a.dispatch_key)need(prior.selection_sha256===selectionHash,'同一派送键不能改写电脑选择');return {...await readDedaoDispatch(owner,b.id,a.queue_revision),reserved:prior.dispatch_key===a.dispatch_key,duplicate:true,may_create:false};}
 const source=await currentSource(owner,b.id);need(source,'本篇本站内容已移除或进入永久清理保护；不能创建新执行任务');
 need(Math.abs(Date.parse(String(a.observed_at))-Date.now())<90000,'需要本次当前授权电脑的实际观察时间');
 need(b.state==='queued'&&b.queue_revision===a.queue_revision&&!b.claim_hash&&(!runtime||runtime.runtime==='native_codex'&&runtime.dispatch_mode==='dynamic'&&runtime.safe_boundary===1),'原批次不在可派送的安全排队版本；先读取同一批次');
 const time=now(),result=await db().prepare(`INSERT OR IGNORE INTO dedao_dispatches(owner,batch_id,queue_revision,dispatch_key,dispatcher_id,target_environment,selection_sha256,selection_ref,state,previous_thread_id,previous_session_id,previous_turn_id,created,updated)
 SELECT b.owner,b.id,b.queue_revision,?,?,?,?,?,'reserved',n.thread_id,n.session_id,n.claimed_turn_id,?,? FROM dedao_batches b LEFT JOIN dedao_batch_runtime n ON n.batch_id=b.id AND n.owner=b.owner WHERE b.owner=? AND b.id=? AND b.state='queued' AND b.queue_revision=? AND b.claim_hash IS NULL AND EXISTS(SELECT 1 FROM dedao_wake_outbox w WHERE w.owner=b.owner AND w.batch_id=b.id AND w.queue_revision=b.queue_revision) AND (n.batch_id IS NULL OR n.runtime='native_codex' AND n.dispatch_mode='dynamic' AND n.safe_boundary=1) AND ${currentSourceSql} AND EXISTS(SELECT 1 FROM dedao_items i WHERE i.owner=b.owner AND i.batch_id=b.id AND i.ordinal=b.current_ordinal AND i.id=? AND i.article_id IS ? AND i.download_json IS ?)`).bind(a.dispatch_key,a.dispatcher_id,a.target_environment,selectionHash,a.selection_ref,time,time,owner,b.id,a.queue_revision,source.id,source.article_id,source.download_json).run();
 const view=await readDedaoDispatch(owner,b.id,a.queue_revision);
 if(view.dispatch?.dispatch_key===a.dispatch_key)need(view.dispatch.selection_sha256===selectionHash,'同一派送键不能改写电脑选择');
 const current=await currentSource(owner,b.id),mayCreate=!!result.meta.changes&&current?.id===source.id&&current.article_id===source.article_id&&current.download_json===source.download_json;
 return {...view,reserved:view.dispatch?.dispatch_key===a.dispatch_key,duplicate:!result.meta.changes,may_create:mayCreate};
}
export async function recordDedaoDispatch(owner:string,a:Record<string,unknown>){
 const b=await queue(owner,a.batch_id);need(typeof a.queue_revision==='string'&&uuid.test(a.queue_revision)&&typeof a.dispatch_key==='string'&&uuid.test(a.dispatch_key),'需要原派送键和排队版本');
 const row=await db().prepare('SELECT * FROM dedao_dispatches WHERE owner=? AND batch_id=? AND queue_revision=? AND dispatch_key=?').bind(owner,b.id,a.queue_revision,a.dispatch_key).first<Dispatch>();need(row,'没有此原子派送记录');
 const proof=evidence(a),outcome=String(a.outcome);need(['created','unknown','not_created','stopped'].includes(outcome),'派送结果无效');
 let receipt:Record<string,unknown>={outcome,...proof};
 if(outcome==='created'||outcome==='stopped'){
  need(typeof a.thread_id==='string'&&uuid.test(a.thread_id)&&typeof a.session_id==='string'&&uuid.test(a.session_id)&&typeof a.turn_id==='string'&&uuid.test(a.turn_id),'需要实际创建或读取的 thread/session/turn');
  receipt={...receipt,thread_id:a.thread_id,session_id:a.session_id,turn_id:a.turn_id};
 }
 if(outcome==='not_created'){need(['request_not_sent','definitive_tool_rejection'].includes(String(a.certainty))&&!(row.state==='unknown'&&a.certainty==='request_not_sent'),'未知创建或超时不能降级为未发送；需要官方明确未创建回执');receipt.certainty=a.certainty;}
 if(outcome==='stopped'){need(Date.parse(proof.observed_at)<=Date.now(),'终止观察不能来自未来');need(a.source==='codex_app_tools'&&['completed','interrupted','ended'].includes(String(a.turn_state)),'需官方 Codex 工具确切回合完成、中断或结束；空闲和超时不足');receipt.source=a.source;receipt.turn_state=a.turn_state;need(row.thread_id===a.thread_id&&row.session_id===a.session_id&&row.turn_id===a.turn_id,'终止证据不属于原创建的确切任务');}
 const json=JSON.stringify(receipt),column=outcome==='created'?'creation_json':outcome==='unknown'?'unknown_json':outcome==='stopped'?'stop_json':'not_created_json',prior=row[column];
 if(prior){need(prior===json,'同一派送回执不能改写');return {...await readDedaoDispatch(owner,b.id,a.queue_revision),recorded:true,duplicate:true,may_create:false};}
 need(b.queue_revision===a.queue_revision,'旧排队版本只能读取，不能绑定当前执行');
 need(outcome==='unknown'?row.state==='reserved':outcome==='stopped'?row.state==='created':['reserved','unknown'].includes(row.state),'派送状态不允许此回执');
 if(outcome==='created'){
  const runtime=await batchRuntime(owner,b.id);need(['queued','paused'].includes(b.state)&&!b.claim_hash&&(!runtime||runtime.runtime==='native_codex'&&runtime.dispatch_mode==='dynamic'&&runtime.safe_boundary===1),'原执行未确认停止或当前批次已领取，不可换绑');
  await db().batch([
   db().prepare(`UPDATE dedao_dispatches SET state='created',creation_json=?,thread_id=?,session_id=?,turn_id=?,updated=? WHERE owner=? AND batch_id=? AND queue_revision=? AND dispatch_key=? AND state IN ('reserved','unknown') AND EXISTS(SELECT 1 FROM dedao_batches b LEFT JOIN dedao_batch_runtime n ON n.batch_id=b.id AND n.owner=b.owner WHERE b.owner=dedao_dispatches.owner AND b.id=dedao_dispatches.batch_id AND b.queue_revision=dedao_dispatches.queue_revision AND b.state IN ('queued','paused') AND b.claim_hash IS NULL AND (n.batch_id IS NULL OR n.runtime='native_codex' AND n.dispatch_mode='dynamic' AND n.safe_boundary=1))`).bind(json,a.thread_id,a.session_id,a.turn_id,now(),owner,b.id,a.queue_revision,a.dispatch_key),
   db().prepare(`INSERT OR IGNORE INTO dedao_batch_runtime(batch_id,owner,runtime,dispatch_mode,thread_id,session_id,safe_boundary,updated) SELECT b.id,b.owner,'native_codex','dynamic',d.thread_id,d.session_id,1,? FROM dedao_batches b JOIN dedao_dispatches d ON d.batch_id=b.id AND d.owner=b.owner AND d.queue_revision=b.queue_revision WHERE b.owner=? AND b.id=? AND b.state IN ('queued','paused') AND b.claim_hash IS NULL AND d.dispatch_key=? AND d.state='created' AND d.creation_json=?`).bind(now(),owner,b.id,a.dispatch_key,json),
   db().prepare(`UPDATE dedao_batch_runtime SET thread_id=?,session_id=?,claimed_turn_id=NULL,updated=? WHERE owner=? AND batch_id=? AND dispatch_mode='dynamic' AND safe_boundary=1 AND EXISTS(SELECT 1 FROM dedao_batches b JOIN dedao_dispatches d ON d.batch_id=b.id AND d.owner=b.owner AND d.queue_revision=b.queue_revision WHERE b.owner=dedao_batch_runtime.owner AND b.id=dedao_batch_runtime.batch_id AND b.state IN ('queued','paused') AND b.claim_hash IS NULL AND d.dispatch_key=? AND d.state='created' AND d.creation_json=?)`).bind(a.thread_id,a.session_id,now(),owner,b.id,a.dispatch_key,json),
  ]);
 }else if(outcome==='stopped'){
  const runtime=await batchRuntime(owner,b.id),creation=row.creation_json?JSON.parse(row.creation_json):null;
  need(runtime?.runtime==='native_codex'&&runtime.thread_id===row.thread_id&&runtime.session_id===row.session_id&&(!runtime.claimed_turn_id||runtime.claimed_turn_id===row.turn_id)&&creation&&proof.observed_at>=creation.observed_at&&proof.observed_at>=runtime.updated,'终止观察早于真实创建或当前领取绑定，或不属于原执行；先重新读取确切任务');
  // An owner attests an actual supported read_thread result. Fence only this
  // exact batch grant; never mutate the native session or its newer active turn.
  await db().batch([
   db().prepare(`UPDATE dedao_dispatches SET state='stopped',stop_json=?,updated=? WHERE owner=? AND batch_id=? AND queue_revision=? AND dispatch_key=? AND state='created' AND stop_json IS NULL AND EXISTS(SELECT 1 FROM dedao_batches b JOIN dedao_batch_runtime n ON n.batch_id=b.id AND n.owner=b.owner WHERE b.owner=dedao_dispatches.owner AND b.id=dedao_dispatches.batch_id AND b.queue_revision=dedao_dispatches.queue_revision AND n.runtime='native_codex' AND n.thread_id=dedao_dispatches.thread_id AND n.session_id=dedao_dispatches.session_id AND (n.claimed_turn_id IS NULL OR n.claimed_turn_id=dedao_dispatches.turn_id) AND n.updated<=?)`).bind(json,now(),owner,b.id,a.queue_revision,a.dispatch_key,proof.observed_at),
   db().prepare(`UPDATE dedao_batches SET state=CASE WHEN state='completed' THEN state ELSE 'paused' END,claim_hash=NULL,lease_until=NULL,failure=CASE WHEN state='completed' THEN failure ELSE '官方 Codex 工具观察已报告原确切任务回合结束；原文章和步骤保留' END,updated=? WHERE owner=? AND id=? AND queue_revision=? AND EXISTS(SELECT 1 FROM dedao_dispatches d JOIN dedao_batch_runtime n ON n.batch_id=d.batch_id AND n.owner=d.owner WHERE d.owner=dedao_batches.owner AND d.batch_id=dedao_batches.id AND d.queue_revision=dedao_batches.queue_revision AND d.dispatch_key=? AND d.state='stopped' AND d.stop_json=? AND n.thread_id=d.thread_id AND n.session_id=d.session_id AND n.updated<=? AND (n.claimed_turn_id IS NULL AND dedao_batches.execution_id IS NULL OR n.claimed_turn_id=d.turn_id AND dedao_batches.execution_id='native-turn:'||d.turn_id AND dedao_batches.executor_id='native-codex:'||d.thread_id))`).bind(now(),owner,b.id,a.queue_revision,a.dispatch_key,json,proof.observed_at),
   db().prepare(`UPDATE dedao_batch_runtime SET safe_boundary=1,boundary_reason='codex_dispatch_tool_observed',updated=? WHERE owner=? AND batch_id=? AND runtime='native_codex' AND updated<=? AND EXISTS(SELECT 1 FROM dedao_batches b JOIN dedao_dispatches d ON d.batch_id=b.id AND d.owner=b.owner AND d.queue_revision=b.queue_revision WHERE b.owner=dedao_batch_runtime.owner AND b.id=dedao_batch_runtime.batch_id AND b.queue_revision=? AND b.claim_hash IS NULL AND b.state IN ('paused','completed') AND d.dispatch_key=? AND d.state='stopped' AND d.stop_json=? AND dedao_batch_runtime.thread_id=d.thread_id AND dedao_batch_runtime.session_id=d.session_id AND (dedao_batch_runtime.claimed_turn_id IS NULL OR dedao_batch_runtime.claimed_turn_id=d.turn_id))`).bind(now(),owner,b.id,proof.observed_at,a.queue_revision,a.dispatch_key,json),
  ]);
 }else{
  await db().prepare(`UPDATE dedao_dispatches SET state=?,${column}=?,updated=? WHERE owner=? AND batch_id=? AND queue_revision=? AND dispatch_key=? AND state=? AND ${column} IS NULL`).bind(outcome,json,now(),owner,b.id,a.queue_revision,a.dispatch_key,row.state).run();
 }
 const view=await readDedaoDispatch(owner,b.id,a.queue_revision);need(view.dispatch?.[column]===json,'派送回执遇到并发变化；读取原记录，不重建任务');
 return {...view,recorded:true,duplicate:false,may_create:false};
}
