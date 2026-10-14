import {dedaoWakeStatement,dispatchDedaoWake,readDedaoDispatch,reserveDedaoDispatch,recordDedaoDispatch,dedaoDispatchAllowsRequeue} from './dedao-dispatch';
import {db} from './test-store';
import {bucket,createArticle} from './articles';
import {readiness,dispatchDedao} from './events';
import {notifyArticle,reconcileArticleHandoff} from './article-handoff';
import {hashText} from './writing-input';
import {DEDAO_URL,DEDAO_ACTIONS,DEDAO_MESSAGES,DEDAO_STAGES,DedaoError,positiveCount,dedaoInstructions,type DedaoAction} from './dedao-contract';
import {nativeThread,nativeSession,nativeLifecycleReady,batchRuntime,registerNativeSession,assertNativeActive,bindDedaoNative,refreshDedaoNative,safeBoundaryDedaoNative,lifecycleDedaoNative,observeDedaoNative,type NativeContext,type DedaoRuntime} from './dedao-native';

const now=()=>new Date().toISOString(),until=(ms:number)=>new Date(Date.now()+ms).toISOString();
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const identity=/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const sha=/^[0-9a-f]{64}$/;
function need(ok:unknown,message:string):asserts ok{if(!ok)throw new DedaoError(message);}
type Batch={id:string;owner:string;request_key:string;queue_revision:string;total:number;state:string;current_ordinal:number;created:string;updated:string;started:string|null;finished:string|null;executor_id:string|null;execution_id:string|null;claim_hash:string|null;lease_until:string|null;heartbeat:string|null;executor_ended:number;failure:string|null;dispatch_state:string};
type Item={batch_id:string;owner:string;ordinal:number;id:string;title:string|null;stage:number;version:number;final_ref:string|null;download_json:string|null;article_id:string|null;upload_state:string|null;submitted_handoff_id:string|null;submitted:string|null;created:string;updated:string};
type Executor={owner:string;id:string;browser_session:string;capabilities_json:string;heartbeat:string;ready:number};
type Action={action:DedaoAction;action_id:string;state:string;observation_json:string|null};
async function batch(owner:string,id:string){need(uuid.test(id),'批次编号无效');const b=await db().prepare('SELECT * FROM dedao_batches WHERE owner=? AND id=?').bind(owner,id).first<Batch>();need(b,'没有找到此批次');return b;}
async function item(b:Batch,ordinal=b.current_ordinal){const i=await db().prepare('SELECT * FROM dedao_items WHERE batch_id=? AND owner=? AND ordinal=?').bind(b.id,b.owner,ordinal).first<Item>();need(i,'没有找到此篇记录');return i;}
// The article purge owns this exact pair. Read-only batch metadata remains
// available; only writers are fenced. Children have no owner column, so every
// write binds through the original owner/item/batch rather than the prefix alone.
const dedaoItemWritableSql=`NOT EXISTS(SELECT 1 FROM article_content_fences f WHERE f.owner=i.owner AND (f.entity_kind='dedao_items.batch_ordinal' AND f.entity_key=json_array(i.batch_id,i.ordinal) OR f.entity_kind='dedao_items' AND f.entity_key=i.id OR f.entity_kind='articles' AND f.entity_key=i.article_id))
 AND NOT EXISTS(SELECT 1 FROM article_deletions d WHERE d.owner=i.owner AND d.id=i.article_id)
 AND NOT EXISTS(SELECT 1 FROM articles a WHERE a.owner=i.owner AND a.id=i.article_id AND a.state='deleting')`;
const dedaoCurrentGrantSql=`EXISTS(SELECT 1 FROM dedao_items i WHERE i.owner=dedao_batches.owner AND i.batch_id=dedao_batches.id AND i.ordinal=dedao_batches.current_ordinal AND i.id=? AND i.article_id IS ? AND i.download_json IS ? AND ${dedaoItemWritableSql})`;
async function assertDedaoItemWritable(b:Batch,i:Item){
 const current=await db().prepare(`SELECT 1 FROM dedao_items i JOIN dedao_batches b ON b.id=i.batch_id AND b.owner=i.owner WHERE i.owner=? AND i.batch_id=? AND i.ordinal=? AND i.id=? AND i.article_id IS ? AND i.download_json IS ? AND ${dedaoItemWritableSql}`).bind(b.owner,b.id,i.ordinal,i.id,i.article_id,i.download_json).first();
 need(current,'本篇内容已删除或原文件绑定已变化；停止写入并读取原批次');
}
async function writableItem(b:Batch){const i=await item(b);await assertDedaoItemWritable(b,i);return i;}
async function dedaoItemContentDeleted(b:Batch,i:Item){
 return !!await db().prepare(`SELECT 1 WHERE EXISTS(SELECT 1 FROM article_content_fences f WHERE f.owner=? AND (f.entity_kind='dedao_items.batch_ordinal' AND f.entity_key=? OR f.entity_kind='dedao_items' AND f.entity_key=? OR f.entity_kind='articles' AND f.entity_key=?))
 OR EXISTS(SELECT 1 FROM article_deletions d WHERE d.owner=? AND d.id=?)
 OR EXISTS(SELECT 1 FROM articles a WHERE a.owner=? AND a.id=? AND a.state='deleting')
 OR NOT EXISTS(SELECT 1 FROM dedao_items WHERE owner=? AND batch_id=? AND ordinal=?)`).bind(b.owner,JSON.stringify([b.id,i.ordinal]),i.id,i.article_id,b.owner,i.article_id,b.owner,i.article_id,b.owner,b.id,i.ordinal).first();
}
async function actions(b:Batch,i:Item){return (await db().prepare('SELECT action,action_id,state,observation_json FROM dedao_actions WHERE batch_id=? AND ordinal=? ORDER BY created').bind(b.id,i.ordinal).all<Action>()).results;}
async function live(owner:string,a:Record<string,unknown>){const b=await batch(owner,String(a.batch_id||''));need(typeof a.claim_token==='string'&&uuid.test(a.claim_token)&&identity.test(String(a.execution_id||'')),'需要当前执行凭据');need(b.state==='running'&&b.execution_id===a.execution_id&&b.claim_hash===await hashText(a.claim_token)&&!!b.lease_until&&b.lease_until>now(),'执行租约已失效；停止动作并读取同一批次');const runtime=await batchRuntime(owner,b.id);if(runtime?.runtime==='native_codex'){need(runtime.safe_boundary===0,'本批次原生执行已经到安全暂停点，不再允许动作');await assertNativeActive(owner,b.executor_id!,String(a.execution_id));}need(a.ordinal===undefined||a.ordinal===b.current_ordinal,'前篇已提交或篇次不匹配，不得重复处理');return b;}
function publicItem(i:Item){return {...i,download:i.download_json?JSON.parse(i.download_json):null,download_json:undefined,stage_name:DEDAO_STAGES[i.stage],submitted:!!i.submitted,submitted_at:i.submitted};}
export async function dedaoConnection(owner:string,runtime:DedaoRuntime='native_codex'){
 const rows=(await db().prepare('SELECT * FROM dedao_executors WHERE owner=? ORDER BY heartbeat DESC').bind(owner).all<Executor>()).results;
 const usable:Executor[]=[];let native:Record<string,unknown>|null=null;const nativeMissing:string[]=[];
 for(const e of rows){const threadId=nativeThread(e.id);if(runtime==='cli_cdp'){if(!threadId&&e.ready===1&&Date.parse(e.heartbeat)>Date.now()-90000)usable.push(e);continue;}if(!threadId)continue;const s=await nativeSession(owner,e.id);if(!s)continue;const missing:string[]=[];if(!s.turn_id)missing.push('尚未绑定实际原生 Codex 回合');if(!nativeLifecycleReady(s))missing.push('原生生命周期尚未通过本对话工具或可选钩子的实际回执验证');if(!s.wake_ready||!s.wake_id)missing.push('尚未连接有效的网站队列原生对话唤醒入口');if(['pending','ended'].includes(s.state))missing.push('原生 Codex 会话尚未连接或已结束，需要由实际新回合重新连接');if(e.ready!==1||Date.parse(e.heartbeat)<=Date.now()-2*60*60*1000)missing.push('本机浏览器、登录及下载目录的上次实际检查已过期');if(s.credential_expires<=now())missing.push('本机原生桥凭据已到期，需要通过本人网站授权续接');const connected=missing.length===0;if(connected)usable.push(e);if(!native||connected){native={thread_id:s.thread_id,session_id:s.session_id,turn_id:s.turn_id,turn_state:s.state,turn_active:s.state==='active',lifecycle_source:s.lifecycle_source,lifecycle_connected:nativeLifecycleReady(s),hooks_ready:s.hooks_ready===1,wake_id:s.wake_id,safe_boundary:null,bridge_connected:connected,last_observed_at:s.last_observed_at,browser_checked_at:e.heartbeat,missing};nativeMissing.splice(0,nativeMissing.length,...missing);}}
 const downstream=await readiness(owner,'article.submitted'),subscription=await readiness(owner,'dedao.writing_requested');
 const missing:string[]=[];
 if(!usable.length)missing.push(...(runtime==='native_codex'?(native?nativeMissing:['尚未连接本机原生 Codex 对话、电脑插件、实际生命周期验证和网站唤醒入口']):['旧 CLI/CDP 执行端未连接，需核对原执行包与浏览器']));
 if(!downstream.connected)missing.push('恢复现有 article.submitted 小鱼订阅，供上传完成后的“求助小鱼”使用。');
 return {connected:!!usable.length&&downstream.connected,accept_queue_ready:runtime==='native_codex'?subscription.connected&&downstream.connected:!!usable.length&&downstream.connected,executor_connected:!!usable.length,xiaoyu_connected:downstream.connected,event_subscription:subscription.connected,execution_mode:runtime,native,executor_id:usable[0]?.id||null,transport:runtime==='native_codex'?'本人 Sites OAuth/MCP + 原生 Codex 对话 + Computer Use + 私有本机桥':'旧 CLI/CDP 执行包',missing,required_configuration:runtime==='native_codex'?['本机 Codex 当前对话启用电脑插件并核实已登录 Edge','通过本人网站 MCP 授权建立受保护的短期本机桥凭据','由受支持 Codex 工具核实实际回合生命周期，连接原生队列唤醒；钩子可选','核实浏览器真实 Word 下载目录']:['核对旧执行包、本人授权及浏览器 CDP 连接'],last_heartbeat:rows[0]?.heartbeat||null,capability_evidence:'执行端上次实际检查回传，原生接收排队有效期2小时；领取前必须90秒内再次实际检查。服务器不独立认证浏览器登录或原生工具观察回执'};
}
export async function readDedao(owner:string,id?:string){
 const b=id?await batch(owner,id):await db().prepare("SELECT * FROM dedao_batches WHERE owner=? ORDER BY CASE WHEN state='completed' THEN 1 ELSE 0 END,created DESC LIMIT 1").bind(owner).first<Batch>();
 const runtime=b?await batchRuntime(owner,b.id):null,wake=b?await db().prepare('SELECT batch_id FROM dedao_wake_outbox WHERE owner=? AND batch_id=? AND queue_revision=?').bind(owner,b.id,b.queue_revision).first():null,mode:DedaoRuntime=runtime?.runtime||(wake?'native_codex':'cli_cdp'),dynamic=runtime?.dispatch_mode==='dynamic'||!runtime&&!!wake,connection=await dedaoConnection(owner,b&&b.state!=='completed'?mode:'native_codex');
 if(!b)return {connection,batch:null,instructions:dedaoInstructions()};
 const current=await db().prepare('SELECT * FROM dedao_items WHERE batch_id=? AND owner=? AND ordinal=?').bind(b.id,owner,b.current_ordinal).first<Item>();
 // A missing row alone says nothing about deletion. The immutable exact pair
 // and its real article tombstone are the only content-free read projection.
 const currentContentDeleted=!current&&!!await db().prepare("SELECT 1 FROM article_content_fences f JOIN article_deletions d ON d.owner=f.owner AND d.id=f.article_id WHERE f.owner=? AND f.entity_kind='dedao_items.batch_ordinal' AND f.entity_key=?").bind(owner,JSON.stringify([b.id,b.current_ordinal])).first();
 need(current||currentContentDeleted,'没有找到此篇记录');
 const submittedCount=(await db().prepare('SELECT count(*) AS n FROM dedao_items WHERE owner=? AND batch_id=? AND submitted IS NOT NULL').bind(owner,b.id).first<{n:number}>())?.n||0;
 const completed=b.state==='completed'&&b.finished?b.total:submittedCount;
 const rows=(await db().prepare('SELECT * FROM dedao_items WHERE batch_id=? AND owner=? ORDER BY ordinal DESC LIMIT 50').bind(b.id,owner).all<Item>()).results.reverse();
 const nativeMode=mode==='native_codex',boundary=nativeMode?!runtime||runtime.safe_boundary===1:b.executor_ended===1;
 if(nativeMode&&connection.native)connection.native.safe_boundary=runtime?.claimed_turn_id&&connection.native.thread_id===runtime.thread_id&&connection.native.session_id===runtime.session_id&&connection.native.turn_id===runtime.claimed_turn_id?boundary:null;
 const executionSession=nativeMode&&b.executor_id?await nativeSession(owner,b.executor_id):null;
 const executionExecutor=b.executor_id?await db().prepare('SELECT ready,heartbeat FROM dedao_executors WHERE owner=? AND id=?').bind(owner,b.executor_id).first<{ready:number;heartbeat:string}>():null;
 const exactExecutorConnected=executionExecutor?.ready===1&&Date.parse(executionExecutor.heartbeat)>Date.now()-(nativeMode?2*60*60*1000:90000);
 const exactNativeActive=!nativeMode||!!runtime&&!!executionSession&&executionSession.thread_id===runtime.thread_id&&executionSession.session_id===runtime.session_id&&executionSession.turn_id===runtime.claimed_turn_id&&b.execution_id==='native-turn:'+runtime.claimed_turn_id&&b.executor_id==='native-codex:'+runtime.thread_id&&executionSession.state==='active'&&nativeLifecycleReady(executionSession)&&executionSession.wake_ready===1&&executionSession.credential_expires>now();
 const heartbeatLive=b.state==='running'&&!boundary&&exactExecutorConnected&&exactNativeActive&&!!b.heartbeat&&Date.parse(b.heartbeat)>Date.now()-90000&&!!b.lease_until&&b.lease_until>now();
 const dispatch=nativeMode&&dynamic?await readDedaoDispatch(owner,b.id):null;
 const queueMessage=dispatch?.dispatch?.state==='unknown'?'创建结果尚未确认；保留原派送，先核对同一任务，不重复创建':dispatch?.dispatch?.state==='reserved'?'父任务已预留一次创建，等待实际新任务回执':dispatch?.dispatch?.state==='created'?'已记录实际新任务，等待该电脑核验并领取':dispatch?.dispatch?.state==='not_created'?'正常工具已明确未创建任务；暂停后可恢复同一批次':dispatch?.wake?.state==='unknown'||dispatch?.wake?.state==='sending'?'唤醒发送结果尚未确认；任务已保存，先核对同一派送记录':dispatch?.wake?.state==='accepted'?'事件回调已接受，等待父任务选择当前授权电脑；尚未创建或领取':'任务已保存，等待发送唤醒事件';
 const execution=nativeMode?(b.state==='completed'?(boundary?'本批次全部已提交，原生执行已停止本批次动作':'本批次全部已提交，等待原生执行到安全暂停点'):b.state==='paused'?(boundary?(dynamic&&!dispatch?.can_requeue?'已暂停；'+queueMessage:'已暂停；已完成文章保留，事件就绪后可恢复同一批次'):'已请求暂停，等待原确切执行确认停止所有动作'):heartbeatLive?'原生 Codex 回合正在继续；刷新网页保留进度':b.state==='running'?'原生执行状态尚未确认，保留原批次；心跳中断不代表执行退出':(dynamic?queueMessage:'等待原生 Codex 回合领取原批次')):(heartbeatLive?'旧 CLI 执行端正在继续；关闭或刷新网页不会停止任务':b.state==='completed'?(boundary?'本批次全部已提交，CLI 进程已确认退出':'本批次全部已提交，等待执行端确认结束（真实 CLI 进程退出回执）'):b.state==='paused'?(boundary?'已暂停；已完成文章保留，恢复时先核对当前对话与文件':'已请求暂停，等待旧 CLI 执行端确认停止'):b.state==='running'?'执行端心跳中断，尚未确认仍在继续；不要另建批次':'等待执行端领取；网页关闭后任务记录仍保留');
 return {connection,batch:{...b,claim_hash:undefined,lease_until:undefined,runtime:mode,native:nativeMode?{thread_id:runtime?.thread_id||null,session_id:runtime?.session_id||null,turn_id:runtime?.claimed_turn_id||null,safe_boundary:boundary,boundary_reason:runtime?.boundary_reason||null}:null,completed,elapsed_seconds:Math.max(0,Math.floor((Date.parse(b.finished||now())-Date.parse(b.created))/1000)),execution_continuing:heartbeatLive,execution_message:currentContentDeleted?'本篇本站条目已永久移除；文件清理结果以原清理操作回读为准，外部执行结束仍以真实回执为准。':execution,can_resume:!currentContentDeleted&&b.state==='paused'&&boundary&&(nativeMode?connection.accept_queue_ready&&await dedaoDispatchAllowsRequeue(owner,b.id,b.queue_revision):connection.connected),dispatch,current:current?publicItem(current):null,current_record_deleted:currentContentDeleted,actions:current?await actions(b,current):[],items:rows.map(publicItem),items_truncated:completed+1>50},instructions:dedaoInstructions()};
}
async function insertItem(b:Batch,ordinal:number){await db().prepare('INSERT OR IGNORE INTO dedao_items(batch_id,owner,ordinal,id,created,updated) VALUES(?,?,?,?,?,?)').bind(b.id,b.owner,ordinal,crypto.randomUUID(),now(),now()).run();}
export async function startDedao(owner:string,input:Record<string,unknown>){
 const count=positiveCount(input.total);need(typeof input.request_key==='string'&&uuid.test(input.request_key),'需要固定的启动键');
 const prior=await db().prepare('SELECT id,total FROM dedao_batches WHERE owner=? AND request_key=?').bind(owner,input.request_key).first<{id:string;total:number}>();
 if(prior){need(prior.total===count,'同一启动键的生成篇数不能修改');return readDedao(owner,prior.id);}
 const active=await db().prepare("SELECT id FROM dedao_batches WHERE owner=? AND state<>'completed'").bind(owner).first<{id:string}>();if(active)return {...await readDedao(owner,active.id),already_active:true};
 const unreleased=await db().prepare(`SELECT b.id FROM dedao_batches b LEFT JOIN dedao_batch_runtime n ON n.batch_id=b.id WHERE b.owner=? AND b.state='completed' AND CASE WHEN n.runtime='native_codex' THEN n.safe_boundary=0 ELSE b.executor_ended=0 END LIMIT 1`).bind(owner).first<{id:string}>();if(unreleased)return {...await readDedao(owner,unreleased.id),already_active:true};
 const runtime:DedaoRuntime=input.execution_mode==='cli_cdp'?'cli_cdp':'native_codex',connection=await dedaoConnection(owner,runtime);need(runtime==='native_codex'?connection.accept_queue_ready:connection.connected,runtime==='native_codex'?'网站事件或小鱼订阅尚未连接；批次尚未启动':'执行端未连接，请补充页面列出的执行端配置');
 const id=crypto.randomUUID(),revision=crypto.randomUUID(),stamp=now();
 await db().batch([
  db().prepare("INSERT OR IGNORE INTO dedao_batches(id,owner,request_key,queue_revision,total,state,created,updated) VALUES(?,?,?,?,?,'queued',?,?)").bind(id,owner,input.request_key,revision,count,stamp,stamp),
  db().prepare('INSERT OR IGNORE INTO dedao_items(batch_id,owner,ordinal,id,created,updated) SELECT id,owner,1,?,?,? FROM dedao_batches WHERE id=? AND owner=?').bind(crypto.randomUUID(),stamp,stamp,id,owner),
  ...(runtime==='native_codex'?[dedaoWakeStatement(owner,id,revision,stamp)]:[db().prepare("INSERT OR IGNORE INTO dedao_batch_runtime(batch_id,owner,runtime,dispatch_mode,safe_boundary,updated) SELECT id,owner,'cli_cdp','fixed',1,? FROM dedao_batches WHERE id=? AND owner=?").bind(stamp,id,owner)]),
 ]);
 const chosen=await db().prepare("SELECT * FROM dedao_batches WHERE owner=? AND (request_key=? OR state<>'completed') ORDER BY created DESC LIMIT 1").bind(owner,input.request_key).first<Batch>();need(chosen,'批次创建未确认');
 if(chosen.id===id){if(runtime==='native_codex')await dispatchDedaoWake(owner,id,revision);else{const sent=await dispatchDedao(owner,id,stamp);await db().prepare('UPDATE dedao_batches SET dispatch_state=? WHERE id=?').bind(sent?'accepted':'polling',id).run();}}
 return readDedao(owner,chosen.id);
}
export async function registerDedaoExecutor(owner:string,a:Record<string,unknown>){
 const c=a.capabilities as Record<string,unknown>;need(identity.test(String(a.executor_id||''))&&identity.test(String(a.browser_session||''))&&c&&typeof c==='object','执行端身份或能力记录无效');
 need(c.conversation_url===DEDAO_URL&&typeof c.checked_at==='string'&&Math.abs(Date.parse(c.checked_at)-Date.now())<90000,'需要本次得到浏览器检查记录');
 const ready=c.codex_available===true&&c.browser_connected===true&&c.logged_in===true&&c.download_readable===true;
 const safe={conversation_url:DEDAO_URL,checked_at:c.checked_at,codex_available:c.codex_available===true,browser_connected:c.browser_connected===true,logged_in:c.logged_in===true,download_readable:c.download_readable===true};
 const threadId=nativeThread(a.executor_id);need(!String(a.executor_id).startsWith('native-codex:')||threadId,'实际原生 Codex 对话编号无效');
 const session=threadId?await nativeSession(owner,String(a.executor_id)):null,nativeReady=!!session&&nativeLifecycleReady(session)&&session.wake_ready===1&&!['pending','ended'].includes(session.state);
 await db().prepare('INSERT INTO dedao_executors(owner,id,browser_session,capabilities_json,heartbeat,ready) VALUES(?,?,?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET browser_session=excluded.browser_session,capabilities_json=excluded.capabilities_json,heartbeat=excluded.heartbeat,ready=excluded.ready').bind(owner,a.executor_id,a.browser_session,JSON.stringify(safe),now(),ready&&(!threadId||nativeReady)?1:0).run();
 const nativeBridge=threadId?await registerNativeSession(owner,String(a.executor_id)):null;
 return {registered:true,ready:ready&&(!threadId||nativeReady),check_semantics:'executor_observed',...await dedaoConnection(owner,threadId?'native_codex':'cli_cdp'),...(nativeBridge?{native_bridge:nativeBridge}:{})};
}
export async function reserveDedaoLaunch(owner:string,a:Record<string,unknown>){
 need(identity.test(String(a.executor_id||''))&&identity.test(String(a.launcher_id||''))&&typeof a.claim_token==='string'&&uuid.test(a.claim_token),'需要执行机与当前启动进程身份');
 const b=await batch(owner,String(a.batch_id||'')),h=await hashText(a.claim_token);need(typeof a.queue_revision==='string','需要本次排队版本');
 need(!nativeThread(a.executor_id)&&(await batchRuntime(owner,b.id))?.runtime==='cli_cdp','原生 Codex 批次不能通过 CLI 启动或领取');
 const i=await writableItem(b);
 const e=await db().prepare('SELECT * FROM dedao_executors WHERE owner=? AND id=? AND ready=1 AND heartbeat>?').bind(owner,a.executor_id,until(-90000)).first<Executor>();need(e,'执行端未连接');
 if(b.state==='launching'&&b.execution_id===a.launcher_id&&b.claim_hash===h){await assertDedaoItemWritable(b,i);return {reserved:true,duplicate:true};}
 const r=await db().prepare(`UPDATE dedao_batches SET state='launching',executor_id=?,execution_id=?,claim_hash=?,executor_ended=0,lease_until=?,heartbeat=?,updated=? WHERE id=? AND owner=? AND state='queued' AND claim_hash IS NULL AND queue_revision=?
 AND NOT EXISTS(SELECT 1 FROM dedao_batches other JOIN dedao_executors x ON x.id=other.executor_id AND x.owner=other.owner LEFT JOIN dedao_batch_runtime n ON n.batch_id=other.id WHERE other.state IN ('launching','running','paused','completed') AND CASE WHEN n.runtime='native_codex' THEN n.safe_boundary=0 ELSE other.executor_ended=0 END AND (other.owner=? OR x.browser_session=?) AND other.id<>?) AND ${dedaoCurrentGrantSql}`).bind(a.executor_id,a.launcher_id,h,until(180000),now(),now(),b.id,owner,a.queue_revision,owner,e.browser_session,b.id,i.id,i.article_id,i.download_json).run();
 return {reserved:!!r.meta.changes,duplicate:false};
}
export async function claimDedao(owner:string,a:Record<string,unknown>){
 need(identity.test(String(a.executor_id||''))&&identity.test(String(a.execution_id||''))&&typeof a.claim_token==='string'&&uuid.test(a.claim_token),'需要真实 Codex 执行编号与本执行私有令牌');
 const b=await batch(owner,String(a.batch_id||'')),tokenHash=await hashText(a.claim_token);
 const i=await writableItem(b);
 const runtime=await batchRuntime(owner,b.id),threadId=nativeThread(a.executor_id);need(runtime,'原批次尚未取得真实任务绑定，不能领取');need((runtime?.runtime==='native_codex')===!!threadId,'执行类型与批次不匹配；CLI 不能领取原生 Codex 批次');
 const session=threadId?await assertNativeActive(owner,String(a.executor_id),String(a.execution_id)):null;
 if(session){need(runtime?.thread_id===session.thread_id&&runtime.session_id===session.session_id,'此批次尚未派送到本真实原生 Codex 对话');if(runtime.dispatch_mode==='dynamic'){const dispatch=(await readDedaoDispatch(owner,b.id)).dispatch;need(dispatch?.state==='created'&&dispatch.thread_id===session.thread_id&&dispatch.session_id===session.session_id&&dispatch.turn_id===session.turn_id,'当前排队版本尚未取得此真实任务的创建回执');}}
 const e=await db().prepare('SELECT * FROM dedao_executors WHERE owner=? AND id=? AND ready=1 AND heartbeat>?').bind(owner,a.executor_id,until(-90000)).first<Executor>();need(e,'执行端未连接或浏览器登录检查已过期');
 if(b.state==='running'&&b.execution_id===a.execution_id&&b.claim_hash===tokenHash){await assertDedaoItemWritable(b,i);return {claimed:true,duplicate:true,...await readDedao(owner,b.id)};}
 const changes=await db().batch([
 db().prepare(`UPDATE dedao_batches SET state='running',executor_id=?,execution_id=?,claim_hash=?,lease_until=?,heartbeat=?,executor_ended=0,started=COALESCE(started,?),updated=?,failure=NULL WHERE owner=? AND id=? AND (state='queued' AND claim_hash IS NULL AND queue_revision=? OR state='launching' AND executor_id=? AND claim_hash=? AND execution_id=? AND lease_until>?)
 AND (? IS NULL OR EXISTS(SELECT 1 FROM dedao_native_sessions s WHERE s.owner=dedao_batches.owner AND s.executor_id=? AND s.turn_id=? AND s.state='active' AND ((s.lifecycle_source='hook' AND s.hooks_ready=1) OR (s.lifecycle_source='codex_app_tools' AND s.observation_ref IS NOT NULL AND length(s.observation_ref)>0)) AND s.wake_ready=1 AND s.credential_expires>?))
 AND (?=0 OR EXISTS(SELECT 1 FROM dedao_dispatches d JOIN dedao_batch_runtime n ON n.batch_id=d.batch_id AND n.owner=d.owner WHERE d.owner=dedao_batches.owner AND d.batch_id=dedao_batches.id AND d.queue_revision=dedao_batches.queue_revision AND d.state='created' AND d.thread_id=? AND d.session_id=? AND d.turn_id=? AND n.dispatch_mode='dynamic' AND n.thread_id=d.thread_id AND n.session_id=d.session_id AND n.safe_boundary=1))
 AND NOT EXISTS(SELECT 1 FROM dedao_batches other JOIN dedao_executors x ON x.id=other.executor_id AND x.owner=other.owner LEFT JOIN dedao_batch_runtime n ON n.batch_id=other.id WHERE other.state IN ('running','launching','paused','completed') AND CASE WHEN n.runtime='native_codex' THEN n.safe_boundary=0 ELSE other.executor_ended=0 END AND (other.owner=? OR x.browser_session=?) AND other.id<>?) AND ${dedaoCurrentGrantSql}`).bind(a.executor_id,a.execution_id,tokenHash,until(180000),now(),now(),now(),owner,b.id,String(a.queue_revision||''),a.executor_id,tokenHash,String(a.launcher_id||''),now(),session?.turn_id||null,a.executor_id,session?.turn_id||null,now(),runtime?.dispatch_mode==='dynamic'?1:0,session?.thread_id||null,session?.session_id||null,session?.turn_id||null,owner,e.browser_session,b.id,i.id,i.article_id,i.download_json),
 db().prepare(`UPDATE dedao_batch_runtime SET claimed_turn_id=?,safe_boundary=0,boundary_reason=NULL,updated=? WHERE batch_id=? AND owner=? AND runtime='native_codex' AND EXISTS(SELECT 1 FROM dedao_batches WHERE id=dedao_batch_runtime.batch_id AND execution_id=? AND claim_hash=? AND state='running' AND ${dedaoCurrentGrantSql})`).bind(session?.turn_id||null,now(),b.id,owner,a.execution_id,tokenHash,i.id,i.article_id,i.download_json),
 ]);const r=changes[0];
 return {claimed:!!r.meta.changes,duplicate:false,...await readDedao(owner,b.id)};
}
export async function heartbeatDedao(owner:string,a:Record<string,unknown>){
 const b=await live(owner,a);await db().prepare("UPDATE dedao_batches SET heartbeat=?,lease_until=?,updated=? WHERE id=? AND claim_hash=? AND state='running'").bind(now(),until(180000),now(),b.id,b.claim_hash).run();return {renewed:true};
}
export async function beginDedaoAction(owner:string,a:Record<string,unknown>){
 const b=await live(owner,a),i=await writableItem(b),action=a.action as DedaoAction,idx=DEDAO_ACTIONS.indexOf(action);need(idx>=0,'动作无效');
 need(!i.submitted,'此篇已提交，不得重复处理');
 const prior=await actions(b,i);for(const previous of DEDAO_ACTIONS.slice(0,idx))need(prior.some(p=>p.action===previous&&p.state==='confirmed'),'先核对前一步的真实回应');
 const id=crypto.randomUUID(),stamp=now();
 const r=await db().prepare("INSERT OR IGNORE INTO dedao_actions(batch_id,ordinal,action,action_id,state,created,updated) SELECT ?,?,?,?,'reserved',?,? WHERE EXISTS(SELECT 1 FROM dedao_batches WHERE id=? AND claim_hash=? AND state='running' AND current_ordinal=?)").bind(b.id,i.ordinal,action,id,stamp,stamp,b.id,b.claim_hash,i.ordinal).run();
 if(r.meta.changes)await db().prepare("UPDATE dedao_items SET stage=MAX(stage,?),updated=? WHERE batch_id=? AND ordinal=?").bind([1,2,3,7,8][idx],now(),b.id,i.ordinal).run();
 const row=await db().prepare('SELECT * FROM dedao_actions WHERE batch_id=? AND ordinal=? AND action=?').bind(b.id,i.ordinal,action).first<Action>();need(row,'动作记录未确认');
 return {action:row,execute_action:!!r.meta.changes,message:idx<4?DEDAO_MESSAGES[idx]:null,conversation_url:DEDAO_URL,recovery:'execute_action=false 时先查原对话/已有下载；保留同一动作编号，不重复发送'};
}
export async function confirmDedaoAction(owner:string,a:Record<string,unknown>){
 const b=await live(owner,a),i=await writableItem(b),action=a.action as DedaoAction,idx=DEDAO_ACTIONS.indexOf(action);need(idx>=0&&idx<4,'确认动作无效');
 const o=a.observation as Record<string,unknown>;need(o&&o.conversation_url===DEDAO_URL&&['response_completed','auto_advanced'].includes(String(o.result))&&typeof o.response_ref==='string'&&o.response_ref.length>0&&o.response_ref.length<=1000&&typeof o.observed_at==='string'&&Number.isFinite(Date.parse(o.observed_at)),'需要真实回应完成或主动推进的观察记录');
 need(typeof a.action_id==='string'&&uuid.test(a.action_id),'动作编号无效');
 const safe={conversation_url:DEDAO_URL,result:o.result,response_ref:o.response_ref,observed_at:o.observed_at};
 const stages=[2,3,4,8];
 let title=i.title,finalRef=i.final_ref;
 if(idx===3){need(typeof o.title==='string'&&o.title.trim().length>0&&o.title.length<=1000&&typeof o.final_version_ref==='string'&&o.final_version_ref.length>0&&o.final_version_ref.length<=1000,'定稿必须记录原标题和最新正文版本');title=o.title.trim();finalRef=o.final_version_ref;}
 const records=await actions(b,i);const existing=records.find(p=>p.action===action);need(existing?.action_id===a.action_id,'动作与本篇不匹配');
 if(existing.state==='confirmed'){const saved=JSON.parse(existing.observation_json!);need(saved.result===o.result&&saved.response_ref===o.response_ref&&(idx!==3||(saved.title===title&&saved.final_version_ref===finalRef)),'已确认动作不能改写');return readDedao(owner,b.id);}
 for(const previous of DEDAO_ACTIONS.slice(0,idx))need(records.some(p=>p.action===previous&&p.state==='confirmed'),'前一步尚未确认');
 const observation=JSON.stringify({...safe,...(idx===3?{title,final_version_ref:finalRef}:{})});
 await db().batch([
  db().prepare("UPDATE dedao_actions SET state='confirmed',observation_json=?,updated=? WHERE batch_id=? AND ordinal=? AND action=? AND action_id=? AND state='reserved' AND EXISTS(SELECT 1 FROM dedao_batches WHERE id=? AND claim_hash=? AND state='running' AND current_ordinal=?)").bind(observation,now(),b.id,i.ordinal,action,a.action_id,b.id,b.claim_hash,i.ordinal),
  db().prepare("UPDATE dedao_items SET stage=MAX(stage,?),version=version+1,title=?,final_ref=?,updated=? WHERE batch_id=? AND ordinal=? AND stage<? AND EXISTS(SELECT 1 FROM dedao_actions WHERE batch_id=? AND ordinal=? AND action=? AND action_id=? AND state='confirmed' AND observation_json=?) AND EXISTS(SELECT 1 FROM dedao_batches WHERE id=? AND claim_hash=? AND state='running')").bind(stages[idx],title,finalRef,now(),b.id,i.ordinal,stages[idx],b.id,i.ordinal,action,a.action_id,observation,b.id,b.claim_hash),
 ]);const winner=await db().prepare('SELECT observation_json FROM dedao_actions WHERE batch_id=? AND ordinal=? AND action=?').bind(b.id,i.ordinal,action).first<{observation_json:string}>();need(winner?.observation_json===observation,'已有另一份已确认回应，请读取同一动作');return readDedao(owner,b.id);
}
export async function progressDedao(owner:string,a:Record<string,unknown>){
 const b=await live(owner,a),i=await writableItem(b);need(Number.isInteger(a.stage)&&Number(a.stage)>=1&&Number(a.stage)<=7,'步骤无效');need(Number(a.stage)>=i.stage&&i.stage<8,'不能回退或越过已确认步骤');
 const confirmed=await actions(b,i);if(Number(a.stage)>=4)need(confirmed.some(p=>p.action==='framework'&&p.state==='confirmed'),'开始正文前先确认框架或主动推进记录');
 need(typeof a.response_ref==='string'&&a.response_ref.length>0&&a.response_ref.length<=1000,'需要当前步骤的真实页面观察引用');
 await db().batch([db().prepare("INSERT INTO dedao_actions(batch_id,ordinal,action,action_id,state,observation_json,created,updated) SELECT ?,?,?,?,'observed',?,?,? WHERE EXISTS(SELECT 1 FROM dedao_batches WHERE id=? AND state='running' AND claim_hash=?) ON CONFLICT(batch_id,ordinal,action) DO UPDATE SET observation_json=excluded.observation_json,updated=excluded.updated").bind(b.id,i.ordinal,'stage_'+a.stage,crypto.randomUUID(),JSON.stringify({response_ref:a.response_ref,observed_at:now()}),now(),now(),b.id,b.claim_hash),db().prepare("UPDATE dedao_items SET stage=?,version=version+1,updated=? WHERE batch_id=? AND ordinal=? AND version=? AND EXISTS(SELECT 1 FROM dedao_batches WHERE id=? AND state='running' AND claim_hash=?)").bind(a.stage,now(),b.id,i.ordinal,i.version,b.id,b.claim_hash)]);return readDedao(owner,b.id);
}
export async function recordDedaoDownload(owner:string,a:Record<string,unknown>){
 const b=await live(owner,a),i=await writableItem(b),d=a.download as Record<string,unknown>;
 need(d&&typeof d.filename==='string'&&d.filename.length<=180&&/^.+\.docx$/i.test(d.filename)&&!/[\u0000-\u001f<>:"/\\|?*]/.test(d.filename),'需要实际 Word 文件名');
 need(typeof d.path==='string'&&d.path.length<=2000&&(/^(?:\/|[A-Za-z]:[\\/])/.test(d.path))&&typeof d.sha256==='string'&&sha.test(d.sha256)&&Number.isSafeInteger(d.size)&&Number(d.size)>0&&Number(d.size)<=20000000,'需要真实下载路径、字节数和 SHA256');
 need(d.title===i.title&&d.final_version_ref===i.final_ref&&typeof d.browser_session==='string'&&identity.test(d.browser_session),'下载必须与本篇原标题及最新正文版本一致');
 const executor=await db().prepare('SELECT browser_session FROM dedao_executors WHERE owner=? AND id=?').bind(owner,b.executor_id).first<{browser_session:string}>();need(executor?.browser_session===d.browser_session,'下载浏览器必须是本批次实际绑定的原浏览器');
 const records=await actions(b,i);need(records.some(p=>p.action==='finalize'&&p.state==='confirmed')&&records.some(p=>p.action==='download'&&p.action_id===a.action_id),'先确认定稿与下载动作');
 const encoded=JSON.stringify({filename:d.filename,path:d.path,sha256:d.sha256,size:d.size,title:d.title,final_version_ref:d.final_version_ref,browser_session:d.browser_session,executor_id:b.executor_id});
 if(i.download_json){need(i.download_json===encoded,'已确认的下载文件不能替换');await assertDedaoItemWritable(b,i);return readDedao(owner,b.id);}
 await db().batch([
  db().prepare('UPDATE dedao_items SET download_json=?,article_id=?,stage=9,version=version+1,updated=? WHERE batch_id=? AND ordinal=? AND download_json IS NULL AND EXISTS(SELECT 1 FROM dedao_batches WHERE id=? AND claim_hash=? AND state=\'running\')').bind(encoded,crypto.randomUUID(),now(),b.id,i.ordinal,b.id,b.claim_hash),
  db().prepare("UPDATE dedao_actions SET state='confirmed',observation_json=?,updated=? WHERE batch_id=? AND ordinal=? AND action='download' AND action_id=? AND EXISTS(SELECT 1 FROM dedao_items WHERE batch_id=? AND ordinal=? AND download_json=?)").bind(encoded,now(),b.id,i.ordinal,a.action_id,b.id,i.ordinal,encoded),
 ]);const saved=await item(b);need(saved.download_json===encoded,'已有另一份确认下载，请读取本篇固定文件记录');return readDedao(owner,b.id);
}
export async function uploadDedaoChunk(owner:string,a:Record<string,unknown>){
 const b=await live(owner,a),i=await writableItem(b);need(i.download_json&&!i.submitted,'先确认本篇下载');const d=JSON.parse(i.download_json);
 need(typeof a.base64==='string'&&a.base64.length<=64000&&/^[A-Za-z0-9+/]*={0,2}$/.test(a.base64)&&Number.isSafeInteger(a.offset)&&Number(a.offset)>=0,'文件分块无效');
 const bytes=Uint8Array.from(atob(a.base64),c=>c.charCodeAt(0));need(bytes.length>0&&bytes.length<=48000&&Number(a.offset)+bytes.length<=d.size,'文件分块越界');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
 const existing=await db().prepare('SELECT sha256,size FROM dedao_chunks WHERE batch_id=? AND ordinal=? AND offset=?').bind(b.id,i.ordinal,a.offset).first<{sha256:string;size:number}>();
 if(existing){need(existing.sha256===digest&&existing.size===bytes.length,'相同位置的文件字节不同');await assertDedaoItemWritable(b,i);return {stored:true,duplicate:true};}
 const key=`dedao/${b.id}/${i.ordinal}/chunk-${a.offset}-${digest}`;
 const compensateDeleted=async()=>{if(await dedaoItemContentDeleted(b,i)){await bucket().delete(key);throw new DedaoError('本篇内容已永久删除，迟到分块已清除；不重新上传');}};
 // Recheck after asynchronous digest/lookup and immediately before R2. A put
 // response can be lost after bytes were stored, so compensate on that path too.
 await assertDedaoItemWritable(b,i);
 try{
  await bucket().put(key,bytes);
  await db().prepare(`INSERT OR IGNORE INTO dedao_chunks(batch_id,ordinal,offset,size,sha256,object_key) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM dedao_items i JOIN dedao_batches b ON b.id=i.batch_id AND b.owner=i.owner WHERE i.owner=? AND i.batch_id=? AND i.ordinal=? AND i.id=? AND i.article_id IS ? AND i.download_json=? AND i.submitted IS NULL AND b.claim_hash=? AND b.execution_id=? AND b.state='running' AND b.lease_until>? AND ${dedaoItemWritableSql})`).bind(b.id,i.ordinal,a.offset,bytes.length,digest,key,owner,b.id,i.ordinal,i.id,i.article_id,i.download_json,b.claim_hash,b.execution_id,now()).run();
  const saved=await db().prepare('SELECT sha256,size,object_key FROM dedao_chunks WHERE batch_id=? AND ordinal=? AND offset=?').bind(b.id,i.ordinal,a.offset).first<{sha256:string;size:number;object_key:string}>();
  await assertDedaoItemWritable(b,i);
  need(saved?.sha256===digest&&saved?.size===bytes.length&&saved.object_key===key,'分块存储未确认或已有不同字节，请回读原传输记录');
 }catch(error){
  // A real deletion fence (or removed original pair) makes cleanup safe. An
  // ordinary unknown D1/put outcome without that evidence must retain bytes;
  // another valid writer may already reference this same canonical chunk key.
  await compensateDeleted();throw error;
 }
 return {stored:true,duplicate:false};
}
export async function finalizeDedaoUpload(owner:string,a:Record<string,unknown>){
 const b=await live(owner,a),i=await writableItem(b);need(i.download_json&&i.article_id,'先确认下载文件');const d=JSON.parse(i.download_json);
 const rows=(await db().prepare('SELECT * FROM dedao_chunks WHERE batch_id=? AND ordinal=? ORDER BY offset').bind(b.id,i.ordinal).all<{offset:number;size:number;sha256:string;object_key:string}>()).results;
 const bytes=new Uint8Array(d.size);let position=0;
 for(const r of rows){need(r.offset===position,'文件尚未完整传输或分块重叠');const object=await bucket().get(r.object_key);need(object,'文件分块缺失，先核查传输');const chunk=new Uint8Array(await object.arrayBuffer());need(chunk.length===r.size,'文件分块大小不同');bytes.set(chunk,position);position+=chunk.length;}
 need(position===d.size,'文件尚未完整传输');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');need(digest===d.sha256,'Word 文件校验失败；不上传或改写正文');
 await assertDedaoItemWritable(b,i);
 await createArticle(owner,new File([bytes],d.filename,{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),{id:i.article_id,sha256:d.sha256,title:d.title});
 const saved=await db().prepare(`UPDATE dedao_items AS i SET upload_state='uploaded',stage=10,version=version+1,updated=? WHERE owner=? AND batch_id=? AND ordinal=? AND id=? AND article_id=? AND download_json=? AND submitted IS NULL AND ${dedaoItemWritableSql} AND EXISTS(SELECT 1 FROM dedao_batches b WHERE b.id=i.batch_id AND b.owner=i.owner AND b.claim_hash=? AND b.execution_id=? AND b.state='running' AND b.lease_until>?)`).bind(now(),owner,b.id,i.ordinal,i.id,i.article_id,i.download_json,b.claim_hash,b.execution_id,now()).run();
 need(saved.meta.changes,'本篇上传绑定已删除或执行状态变化；停止写入并核对原记录');await assertDedaoItemWritable(b,i);return readDedao(owner,b.id);
}
const submissionArticleFence="a.state<>'deleting' AND NOT EXISTS(SELECT 1 FROM article_deletions d WHERE d.id=a.id AND d.owner=a.owner)";
async function submittedEvidence(owner:string,id:string){
 const h=await db().prepare(`SELECT h.id,h.state FROM article_handoffs h JOIN articles a ON a.id=h.article_id AND a.owner=h.owner WHERE h.owner=? AND h.article_id=? AND h.state='delivered' AND ${submissionArticleFence} ORDER BY h.rowid DESC LIMIT 1`).bind(owner,id).first<{id:string;state:string}>();
 if(h)return h;
 // A real claim from this exact persisted handoff also proves it reached the queue.
 return db().prepare(`SELECT h.id,'claimed' AS state FROM article_handoffs h JOIN articles a ON a.id=h.article_id AND a.owner=h.owner WHERE h.owner=? AND h.article_id=? AND a.claim_token IS NOT NULL AND ${submissionArticleFence} ORDER BY h.rowid DESC LIMIT 1`).bind(owner,id).first<{id:string;state:string}>();
}
export async function submitDedaoItem(owner:string,a:Record<string,unknown>){
 const b=await live(owner,a),i=await writableItem(b);need(i.article_id&&i.upload_state==='uploaded','先确认本篇 Word 上传成功');
 let evidence=await submittedEvidence(owner,i.article_id);
 if(!evidence){const prior=await db().prepare('SELECT id,state FROM article_handoffs WHERE owner=? AND article_id=? ORDER BY rowid DESC LIMIT 1').bind(owner,i.article_id).first<{id:string;state:string}>();
  if(prior)await reconcileArticleHandoff(owner,i.article_id,prior.id);else await notifyArticle(owner,i.article_id);
  evidence=await submittedEvidence(owner,i.article_id);
 }
 if(!evidence){await pauseDedao(owner,{...a,reason:'handoff_unknown'});throw new DedaoError('小鱼提交结果尚未确认，已暂停；文章和下载文件均已保留');}
 await db().batch([
  db().prepare(`UPDATE dedao_items SET submitted=?,submitted_handoff_id=?,stage=11,version=version+1,updated=? WHERE batch_id=? AND ordinal=? AND submitted IS NULL AND EXISTS(SELECT 1 FROM dedao_batches WHERE id=? AND state='running' AND claim_hash=? AND current_ordinal=?) AND EXISTS(SELECT 1 FROM article_handoffs h JOIN articles a ON a.id=h.article_id AND a.owner=h.owner WHERE h.id=? AND h.owner=? AND a.id=? AND (h.state='delivered' OR a.claim_token IS NOT NULL) AND ${submissionArticleFence})`).bind(now(),evidence.id,now(),b.id,i.ordinal,b.id,b.claim_hash,i.ordinal,evidence.id,owner,i.article_id),
  db().prepare(`UPDATE dedao_batches SET current_ordinal=CASE WHEN current_ordinal<total THEN current_ordinal+1 ELSE current_ordinal END,state=CASE WHEN current_ordinal=total THEN 'completed' ELSE state END,finished=CASE WHEN current_ordinal=total THEN ? ELSE finished END,updated=? WHERE id=? AND owner=? AND current_ordinal=? AND claim_hash=? AND state='running' AND EXISTS(SELECT 1 FROM dedao_items WHERE batch_id=? AND ordinal=? AND submitted IS NOT NULL)`).bind(now(),now(),b.id,owner,i.ordinal,b.claim_hash,b.id,i.ordinal),
  db().prepare('INSERT OR IGNORE INTO dedao_items(batch_id,owner,ordinal,id,created,updated) SELECT id,owner,current_ordinal,?,?,? FROM dedao_batches WHERE id=? AND state=\'running\' AND current_ordinal>?').bind(crypto.randomUUID(),now(),now(),b.id,i.ordinal),
 ]);const submitted=await db().prepare('SELECT submitted FROM dedao_items WHERE batch_id=? AND ordinal=?').bind(b.id,i.ordinal).first<{submitted:string|null}>();need(submitted?.submitted,'本篇提交证据已变化，请核查原文章及删除状态');return {message:'已提交，等待小鱼接手。无需再次点击。',...await readDedao(owner,b.id)};
}
const reasons:Record<string,string>={login_expired:'得到大脑登录失效，请在执行机浏览器重新登录',browser_unavailable:'得到浏览器连接中断，请恢复同一浏览器',download_unknown:'下载结果未确认，先检查已有 Word 文件',handoff_unknown:'小鱼提交结果未确认，先核查同一文章的通知记录',file_invalid:'Word 不符合现有上传要求，保留得到最终稿等待人工处理',execution_failed:'Codex 执行异常，已保留当前步骤',manual_required:'得到大脑需要人工处理，请检查原对话',connection_lost:'执行端连接中断，请核查原执行是否已经停止'};
export async function pauseDedao(owner:string,a:Record<string,unknown>){const b=await live(owner,a);need(Object.hasOwn(reasons,String(a.reason)),'暂停原因无效');await db().prepare("UPDATE dedao_batches SET state='paused',failure=?,updated=? WHERE id=? AND claim_hash=? AND state='running'").bind(reasons[String(a.reason)],now(),b.id,b.claim_hash).run();return readDedao(owner,b.id);}
export async function requestDedaoPause(owner:string,id:string){
 const b=await batch(owner,id);need(b.state!=='completed','此批次已全部提交，无需暂停');
 await db().prepare("UPDATE dedao_batches SET state='paused',failure=?,executor_ended=CASE WHEN state='queued' AND execution_id IS NULL THEN 1 ELSE executor_ended END,updated=? WHERE id=? AND owner=? AND state IN ('queued','launching','running')").bind('你已请求暂停；已确认的文章和步骤均保留',now(),id,owner).run();return readDedao(owner,id);
}
export async function endDedaoExecution(owner:string,a:Record<string,unknown>){
 let b=await batch(owner,String(a.batch_id));need(a.process_exited===true,'需实际 Codex 进程已退出的回执');
 need((await batchRuntime(owner,b.id))?.runtime==='cli_cdp'&&!nativeThread(a.executor_id),'原生 Codex 回合不能伪装 CLI 进程退出；使用实际生命周期钩子或安全暂停点');
 // Closing an uncertain prelaunch request atomically fences its delayed reserve.
 if(b.state==='queued'){
  need(a.execution_id===a.launcher_id&&identity.test(String(a.executor_id||''))&&typeof a.queue_revision==='string','需要原启动进程与排队版本');
  await db().prepare("UPDATE dedao_batches SET state='paused',executor_id=?,execution_id=?,executor_ended=1,failure=?,updated=? WHERE id=? AND owner=? AND state='queued' AND claim_hash IS NULL AND queue_revision=?").bind(a.executor_id,a.launcher_id,reasons.execution_failed,now(),b.id,owner,a.queue_revision).run();b=await batch(owner,b.id);
 }
 need((b.execution_id===a.execution_id||(['launching','paused'].includes(b.state)&&b.execution_id===a.launcher_id))&&((typeof a.claim_token==='string'&&b.claim_hash===await hashText(a.claim_token))||(a.executor_id===b.executor_id&&typeof a.executor_id==='string')),'原执行身份不匹配');
 await db().prepare("UPDATE dedao_batches SET executor_ended=1,state=CASE WHEN state IN ('running','launching') THEN 'paused' ELSE state END,failure=CASE WHEN state IN ('running','launching') THEN ? ELSE failure END,updated=? WHERE id=? AND execution_id=? AND executor_id=?").bind(reasons.execution_failed,now(),b.id,b.execution_id,b.executor_id).run();return readDedao(owner,b.id);
}
export async function resumeDedao(owner:string,id:string){
 const b=await batch(owner,id),runtime=await batchRuntime(owner,id),wake=await db().prepare('SELECT batch_id FROM dedao_wake_outbox WHERE owner=? AND batch_id=? AND queue_revision=?').bind(owner,id,b.queue_revision).first(),nativeMode=runtime?.runtime==='native_codex'||!runtime&&!!wake;need(b.state==='paused'&&(nativeMode?!runtime||runtime.safe_boundary===1:b.executor_ended===1),'原执行尚未确认停止，暂不能启动第二个执行');
 const i=await writableItem(b);
 const connection=await dedaoConnection(owner,nativeMode?'native_codex':'cli_cdp');need(nativeMode?connection.accept_queue_ready:connection.connected,'事件或执行连接尚未就绪，请先恢复对应连接');if(nativeMode)need(await dedaoDispatchAllowsRequeue(owner,id,b.queue_revision),'原创建结果仍未知或原任务尚未确认停止；先读取同一派送回执，不另建任务');
 // Preserve actions, original conversation, downloads, chunks and upload/handoff
 // identities. Only a verified safe boundary permits a new queue generation.
 const revision=crypto.randomUUID(),time=now();
 const changes=await db().batch([
  db().prepare(`UPDATE dedao_batches SET state='queued',claim_hash=NULL,execution_id=NULL,executor_id=NULL,lease_until=NULL,heartbeat=NULL,failure=NULL,queue_revision=?,dispatch_state='pending',updated=? WHERE id=? AND owner=? AND state='paused' AND queue_revision=? AND ${nativeMode?"NOT EXISTS(SELECT 1 FROM dedao_batch_runtime n WHERE n.batch_id=dedao_batches.id AND (n.safe_boundary<>1 OR n.runtime<>'native_codex')) AND NOT EXISTS(SELECT 1 FROM dedao_dispatches d WHERE d.owner=dedao_batches.owner AND d.batch_id=dedao_batches.id AND d.queue_revision=dedao_batches.queue_revision AND (d.state IN ('reserved','unknown') OR (d.state='created' AND NOT EXISTS(SELECT 1 FROM dedao_batch_runtime n WHERE n.batch_id=d.batch_id AND n.owner=d.owner AND n.claimed_turn_id IS NOT NULL AND n.safe_boundary=1))))":'executor_ended=1'} AND ${dedaoCurrentGrantSql}`).bind(revision,time,id,owner,b.queue_revision,i.id,i.article_id,i.download_json),
  ...(nativeMode?[
   db().prepare(`UPDATE dedao_batch_runtime SET dispatch_mode='dynamic',updated=? WHERE owner=? AND batch_id=? AND safe_boundary=1 AND EXISTS(SELECT 1 FROM dedao_batches b WHERE b.id=dedao_batch_runtime.batch_id AND b.owner=dedao_batch_runtime.owner AND b.queue_revision=? AND b.state='queued')`).bind(time,owner,id,revision),
   dedaoWakeStatement(owner,id,revision,time),
  ]:[]),
 ]);
 need(changes[0].meta.changes,'本篇记录或原执行绑定已变化，未恢复或发送新唤醒；请读取原批次');
 await assertDedaoItemWritable(b,i);
 if(nativeMode)await dispatchDedaoWake(owner,id,revision);
 await insertItem(b,b.current_ordinal);return readDedao(owner,id);
}
export async function dedaoNativeBridgeCall(context:NativeContext,operation:string,a:Record<string,unknown>){
 if(operation==='bind')return bindDedaoNative(context,a);
 if(operation==='refresh')return refreshDedaoNative(context,a);
 if(operation==='lifecycle')return lifecycleDedaoNative(context,a);
 if(operation==='native_lifecycle_observation')return observeDedaoNative(context,a);
 if(operation==='read')return readDedao(context.owner,typeof a.batch_id==='string'?a.batch_id:undefined);
 if(operation==='safe_boundary'){const result=await safeBoundaryDedaoNative(context,a);return {...result,...await readDedao(context.owner,String(a.batch_id))};}
 need(context.turn_id,'尚未绑定实际原生 Codex 回合');await assertNativeActive(context.owner,context.executor_id,'native-turn:'+context.turn_id);
 need(a.executor_id===undefined||a.executor_id===context.executor_id,'执行机身份与本机凭据不匹配');need(a.execution_id===undefined||a.execution_id==='native-turn:'+context.turn_id,'回合身份与本机凭据不匹配');
 const args={...a,executor_id:context.executor_id,execution_id:'native-turn:'+context.turn_id};
 if(operation==='claim')return claimDedao(context.owner,args);
 if(operation==='heartbeat')return heartbeatDedao(context.owner,args);
 need(['begin_dedao_action','confirm_dedao_action','record_dedao_progress','record_dedao_download','upload_dedao_word_chunk','finalize_dedao_word_upload','submit_dedao_item','pause_dedao_batch'].includes(operation),'原生执行操作无效');
 return dedaoCall(context.owner,operation,args);
}
export async function dedaoCall(owner:string,name:string,a:Record<string,unknown>){
 switch(name){
 case 'read_dedao_batch':return readDedao(owner,typeof a.batch_id==='string'?a.batch_id:undefined);
 case 'read_dedao_dispatch':return readDedaoDispatch(owner,String(a.batch_id||''),typeof a.queue_revision==='string'?a.queue_revision:undefined);
 case 'reserve_dedao_dispatch':return reserveDedaoDispatch(owner,a);
 case 'record_dedao_dispatch':return recordDedaoDispatch(owner,a);
 case 'register_dedao_executor':return registerDedaoExecutor(owner,a);
 case 'reserve_dedao_launch':return reserveDedaoLaunch(owner,a);
 case 'claim_dedao_batch':return claimDedao(owner,a);
 case 'heartbeat_dedao_batch':return heartbeatDedao(owner,a);
 case 'begin_dedao_action':return beginDedaoAction(owner,a);
 case 'confirm_dedao_action':return confirmDedaoAction(owner,a);
 case 'record_dedao_progress':return progressDedao(owner,a);
 case 'record_dedao_download':return recordDedaoDownload(owner,a);
 case 'upload_dedao_word_chunk':return uploadDedaoChunk(owner,a);
 case 'finalize_dedao_word_upload':return finalizeDedaoUpload(owner,a);
 case 'submit_dedao_item':return submitDedaoItem(owner,a);
 case 'pause_dedao_batch':return pauseDedao(owner,a);
 case 'end_dedao_execution':return endDedaoExecution(owner,a);
 default:throw new DedaoError('得到大脑操作无效');
 }
}
