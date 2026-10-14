import {db} from './test-store';
import {readiness,dispatchCloudDedao} from './events';
import {hashText} from './writing-input';
import {editorialCredentialInspection} from './editorial-credential-text';
import {unsettledArticleSql} from './article-workspace';
import {bucket} from './articles';
import {rememberArticleClaimHashes} from './article-claim-credentials';
import {assertWordCredentialFree,redactWordCredentialText,WORD_CREDENTIAL_REDACTED} from './word-credentials';
export const cloudConversation='https://www.biji.com/writing/6acda9b50be38d7d4c8b1d41';
type Task={id:string;owner:string;request_key:string;state:string;conversation_url:string;article_id:string|null;execution_id:string|null;claim_hash:string|null;claim_expires:string|null;dispatch_state:string;created:string;updated:string;end_reference:string|null};
export class CloudDedaoError extends Error {}
type Downstream={article_state:string|null;article_error:string|null;deliveries:{platform:string;state:string;message:string|null}[];downstream_status:'not_bound'|'available'|'unavailable'};
const downstreamStates=new Set(['uploaded','queued','processing','text_saved','word_ready','toutiao_saving','completed','deleting','pending','saving','saved','failed','needs_login','needs_verification']);
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
function need(v:unknown,message:string):asserts v{if(!v)throw new CloudDedaoError(message);}
const instructions={conversation_url:cloudConversation,article_count:1,private_drafts_only:true,stages:['得到团队选题与写作','审稿、核查与定稿','配图排版并核对成品','头条私人草稿','知乎私人草稿'],executor:'已核实的云端小鱼执行者；不依赖用户电脑或旧本机桥',contract:'实际执行者先认领这一任务。每条得到消息与下载须由执行者的持久动作记录防重；未知结果先核对同一对话。只有真实定稿与文件才能通过网站正常上传成为文章，绑定后使用既有 article.submitted、claim/reserve/consume、断点和真实回读门禁。Word 上传或通知送达均不是全流程完成。不得公开或定时发布。'};
const actions=['recommend','adopt','framework','finalize','download'] as const;
const messages=['继续下一篇，请按我们已有的写作约定推荐选题，并告诉我你最推荐哪一个。','就用你最推荐的选题，标题也用你推荐的。按我们已有的节奏继续推进。','框架就按你的方案，开始写。','请完成团队审稿、事实核查和必要修正；按最新确认版本定稿，完成写作进程。这次先停在这一篇。',null];
async function row(owner:string,id:unknown){need(uuid(id),'任务编号无效');const r=await db().prepare('SELECT * FROM dedao_cloud_requests WHERE owner=? AND id=?').bind(owner,id).first<Task>();need(r,'没有找到本人云端任务');return r;}
async function completion(owner:string,id:string|null){
 if(!id)return false;
 return !!await db().prepare(`SELECT 1 FROM articles a WHERE a.owner=? AND a.id=? AND a.state='completed' AND a.result_key IS NOT NULL AND a.draft_url IS NOT NULL AND a.draft_readback IS NOT NULL
 AND json_valid(a.result_meta) AND length(json_extract(a.result_meta,'$.sha256'))=64 AND json_extract(a.result_meta,'$.verification') IS NOT NULL
 AND json_valid(a.draft_readback) AND json_extract(a.draft_readback,'$.word_sha256')=json_extract(a.result_meta,'$.sha256') AND julianday(json_extract(a.draft_readback,'$.read_at')) IS NOT NULL
 AND EXISTS(SELECT 1 FROM article_deliveries d WHERE d.owner=a.owner AND d.article_id=a.id AND d.platform='zhihu' AND d.state='saved' AND d.draft_url IS NOT NULL AND json_valid(d.readback) AND json_extract(d.readback,'$.word_sha256')=json_extract(a.result_meta,'$.sha256') AND julianday(json_extract(d.readback,'$.read_at')) IS NOT NULL)
 AND EXISTS(SELECT 1 FROM article_upload_attempts u JOIN article_upload_executor_ends e ON e.owner=u.owner AND e.attempt_id=u.id AND e.article_id=u.article_id AND e.platform=u.platform WHERE u.owner=a.owner AND u.article_id=a.id AND u.platform='toutiao' AND u.state='verified' AND u.target_account='61556093362' AND u.word_sha256=json_extract(a.result_meta,'$.sha256') AND u.readback=a.draft_readback AND e.claim_sha256=u.claim_hash AND length(trim(e.execution_end_reference))>0)
 AND EXISTS(SELECT 1 FROM article_upload_attempts u JOIN article_upload_executor_ends e ON e.owner=u.owner AND e.attempt_id=u.id AND e.article_id=u.article_id AND e.platform=u.platform JOIN article_deliveries d ON d.owner=u.owner AND d.article_id=u.article_id AND d.platform=u.platform WHERE u.owner=a.owner AND u.article_id=a.id AND u.platform='zhihu' AND u.state='verified' AND u.target_account='ren-zhe-ai-chi-yu-52' AND u.word_sha256=json_extract(a.result_meta,'$.sha256') AND u.readback=d.readback AND e.claim_sha256=u.claim_hash AND length(trim(e.execution_end_reference))>0)
 AND NOT ${unsettledArticleSql('a')}`).bind(owner,id).first();
}
async function readDownstream(owner:string,id:string|null):Promise<Downstream>{
 const empty={article_state:null,article_error:null,deliveries:[]};
 if(!id)return {...empty,downstream_status:'not_bound'};
 try{
  const article=await db().prepare('SELECT state,error,claim_token FROM articles WHERE owner=? AND id=?').bind(owner,id).first<{state:string;error:string|null;claim_token:string|null}>();
  if(!article)return {...empty,downstream_status:'unavailable'};
  const deliveries=(await db().prepare(`SELECT d.platform,d.state,d.message,d.claim_token FROM article_deliveries d WHERE d.owner=? AND d.article_id=? AND d.platform IN ('toutiao','zhihu')
   AND d.id=(SELECT x.id FROM article_deliveries x WHERE x.owner=d.owner AND x.article_id=d.article_id AND x.platform=d.platform ORDER BY x.updated DESC,x.id DESC LIMIT 1) ORDER BY d.platform LIMIT 2`).bind(owner,id).all<{platform:string;state:string;message:string|null;claim_token:string|null}>()).results;
  const message=(value:string|null)=>value===null?null:value.length>600?'详细状态请查看原文章任务':editorialCredentialInspection(value,[])?WORD_CREDENTIAL_REDACTED:value;
  const clean=await redactWordCredentialText(owner,{error:message(article.error),messages:deliveries.map(d=>message(d.message))},[article.claim_token,...deliveries.map(d=>d.claim_token)]);
  return {downstream_status:'available',article_state:downstreamStates.has(article.state)?article.state:'unknown',article_error:clean?.error??(article.error===null?null:WORD_CREDENTIAL_REDACTED),
   deliveries:deliveries.map((d,index)=>({platform:d.platform,state:downstreamStates.has(d.state)?d.state:'unknown',message:clean?.messages?.[index]??(d.message===null?null:WORD_CREDENTIAL_REDACTED)}))};
 }catch{return {...empty,downstream_status:'unavailable'};}
}
export async function readCloudDedao(owner:string,id?:unknown){
 const r=id?await row(owner,id):await db().prepare("SELECT * FROM dedao_cloud_requests WHERE owner=? ORDER BY CASE WHEN state='completed' THEN 1 ELSE 0 END,created DESC LIMIT 1").bind(owner).first<Task>();
 const [cloud,downstream]=await Promise.all([readiness(owner,'dedao.cloud_requested'),readiness(owner,'article.submitted')]);
 const complete=r?await completion(owner,r.article_id):false;
 const progress=r?await readDownstream(owner,r.article_id):null;
 const recorded=r?(await db().prepare('SELECT action,action_id,state,confirmed_at FROM dedao_cloud_actions WHERE owner=? AND task_id=? ORDER BY created').bind(owner,r.id).all()).results:[];
 return {owner_scope:await hashText('dedao-cloud-owner:'+owner),connection:{ready:cloud.connected&&downstream.connected,cloud_event:cloud.connected,article_event:downstream.connected,notice:cloud.connected&&downstream.connected?'云端事件连接已核验；实际执行与草稿完成以回执为准':'云端自动成文尚未连接，请让小鱼核对正式连接。'},task:r?{id:r.id,request_key:r.request_key,state:r.state,article_id:r.article_id,created:r.created,updated:r.updated,dispatch_state:r.dispatch_state,writing_executor_registered:!!r.execution_id,writer_ended:!!r.end_reference,private_drafts_complete:complete,conversation_url:r.conversation_url,actions:recorded,...progress}:null,instructions};
}
async function notify(owner:string,r:Task){
 const stamp=new Date().toISOString();
 const granted=await db().prepare("UPDATE dedao_cloud_requests SET dispatch_state='sending',updated=? WHERE owner=? AND id=? AND state='queued' AND claim_hash IS NULL AND dispatch_state='pending'").bind(stamp,owner,r.id).run();if(!granted.meta.changes)return;
 let result=false;try{result=await dispatchCloudDedao(owner,r.id,r.created);}catch{/* unknown never permits a fresh controller identity */}
 await db().prepare("UPDATE dedao_cloud_requests SET dispatch_state=?,updated=? WHERE owner=? AND id=? AND dispatch_state='sending'").bind(result?'accepted':'unknown',new Date().toISOString(),owner,r.id).run();
}
async function notifyPendingRetry(owner:string,r:Task){
 if(r.state!=='queued'||r.claim_hash!==null||r.dispatch_state!=='pending')return;
 // An insert/read failure can leave an unsent task. Keep the original request
 // and normal connection gate; only notify's existing CAS may dispatch it.
 const [cloud,downstream]=await Promise.all([readiness(owner,'dedao.cloud_requested'),readiness(owner,'article.submitted')]);
 need(cloud.connected&&downstream.connected,'云端自动成文尚未连接，原任务保留待派发；请让小鱼核对正式连接');
 await notify(owner,r);
}
export async function startCloudDedao(owner:string,a:Record<string,unknown>){
 need(Object.keys(a).every(key=>key==='request_key')&&uuid(a.request_key),'需要同一次成文请求编号；一次只生成一篇');
 const prior=await db().prepare('SELECT * FROM dedao_cloud_requests WHERE owner=? AND request_key=?').bind(owner,a.request_key).first<Task>();if(prior){await notifyPendingRetry(owner,prior);return readCloudDedao(owner,prior.id);}
 const active=await db().prepare("SELECT * FROM dedao_cloud_requests WHERE owner=? AND state<>'completed' LIMIT 1").bind(owner).first<Task>();if(active){await notifyPendingRetry(owner,active);return {...await readCloudDedao(owner,active.id),reused:true};}
 const view=await readCloudDedao(owner);need(view.connection.ready,'云端自动成文尚未连接，任务未启动；请让小鱼核对正式连接');
 const id=crypto.randomUUID(),stamp=new Date().toISOString();
 await db().prepare("INSERT OR IGNORE INTO dedao_cloud_requests(id,owner,request_key,state,conversation_url,dispatch_state,created,updated) VALUES(?,?,?,'queued',?,'pending',?,?)").bind(id,owner,a.request_key,cloudConversation,stamp,stamp).run();
 const chosen=await db().prepare("SELECT * FROM dedao_cloud_requests WHERE owner=? AND (request_key=? OR state<>'completed') ORDER BY created DESC LIMIT 1").bind(owner,a.request_key).first<Task>();need(chosen,'启动结果未确认，请读取同一次请求');
 await notify(owner,chosen);return readCloudDedao(owner,chosen.id);
}
async function held(owner:string,a:Record<string,unknown>){const r=await row(owner,a.task_id);need(uuid(a.claim_token)&&typeof a.execution_id==='string'&&r.execution_id===a.execution_id&&r.claim_hash===await hashText(String(a.claim_token))&&!!r.claim_expires&&r.claim_expires>new Date().toISOString()&&['writing','processing'].includes(r.state),'当前云端认领无效，停止动作并读取同一任务；到期不允许强抢');return r;}
export async function claimCloudDedao(owner:string,a:Record<string,unknown>){
 const r=await row(owner,a.task_id);need(uuid(a.claim_token)&&typeof a.execution_id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(a.execution_id),'需要实际云端执行身份与内存凭据');const hash=await hashText(String(a.claim_token)),stamp=new Date().toISOString();
 need(a.claim_token!==r.id&&a.claim_token!==r.request_key,'执行凭据不能使用公开任务编号');await assertWordCredentialFree(owner,{execution_id:a.execution_id},[a.claim_token]);await rememberArticleClaimHashes(owner,String(a.claim_token));
 const changed=await db().prepare("UPDATE dedao_cloud_requests SET state='writing',execution_id=?,claim_hash=?,claim_expires=?,updated=? WHERE owner=? AND id=? AND state='queued' AND claim_hash IS NULL").bind(a.execution_id,hash,new Date(Date.now()+3600000).toISOString(),stamp,owner,r.id).run();
 const same=await row(owner,r.id);return {claimed:!!changed.meta.changes||same.state==='writing'&&same.execution_id===a.execution_id&&same.claim_hash===hash&&!!same.claim_expires&&same.claim_expires>stamp,...await readCloudDedao(owner,r.id)};
}
export async function bindCloudArticle(owner:string,a:Record<string,unknown>){
 const r=await held(owner,a);need(uuid(a.article_id),'需要正常网站上传的真实文章编号');
 need(await db().prepare("SELECT 1 FROM articles WHERE owner=? AND id=? AND source_key='articles/'||id||'/source' AND state<>'deleting' AND created>=?").bind(owner,a.article_id,r.created).first(),'需要同一请求之后本人正常上传的真实原稿；不得伪造历史文章ID');
 need(r.article_id===null||r.article_id===a.article_id,'任务已绑定另一文章，不能另建稿或替换');
 const download=await db().prepare("SELECT observation_json FROM dedao_cloud_actions WHERE owner=? AND task_id=? AND action='download' AND state='confirmed'").bind(owner,r.id).first<{observation_json:string}>();need(download,'尚未确认得到定稿下载文件，不能绑定任意文章');
 const expected=JSON.parse(download.observation_json) as {sha256:string;size:number;title:string;filename:string};
 const source=await db().prepare('SELECT source_key,title,filename FROM articles WHERE owner=? AND id=?').bind(owner,a.article_id).first<{source_key:string;title:string;filename:string}>();
 need(source?.title===expected.title.slice(0,120)&&source.filename===expected.filename,'上传原稿的标题或文件名与得到最终 Word 不同');
 const object=await bucket().get(source.source_key);need(object&&object.size===expected.size,'正常上传的原稿字节缺失或大小不符');
 const bytes=await object.arrayBuffer(),sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');need(sha===expected.sha256,'正常上传的原稿与得到下载 Word 字节不同');
 const result=await db().prepare("UPDATE dedao_cloud_requests SET article_id=?,state='processing',updated=? WHERE owner=? AND id=? AND claim_hash=? AND execution_id=? AND claim_expires>? AND state IN ('writing','processing') AND (article_id IS NULL OR article_id=?)").bind(a.article_id,new Date().toISOString(),owner,r.id,r.claim_hash,r.execution_id,new Date().toISOString(),a.article_id).run();need(result.meta.changes,'绑定结果未确认，请读取同一任务');return readCloudDedao(owner,r.id);
}
export async function beginCloudAction(owner:string,a:Record<string,unknown>){
 const r=await held(owner,a),index=actions.indexOf(a.action as typeof actions[number]);need(r.state==='writing'&&index>=0,'当前不是写作阶段或动作无效');
 if(index>0)need(await db().prepare("SELECT 1 FROM dedao_cloud_actions WHERE owner=? AND task_id=? AND action=? AND state='confirmed'").bind(owner,r.id,actions[index-1]).first(),'先核实前一步真实完成；不重复或跳过得到动作');
 const stamp=new Date().toISOString(),actionId=crypto.randomUUID();
 const inserted=await db().prepare("INSERT OR IGNORE INTO dedao_cloud_actions(owner,task_id,action,action_id,state,message,created) SELECT ?,?,?,?,'reserved',?,? WHERE EXISTS(SELECT 1 FROM dedao_cloud_requests WHERE owner=? AND id=? AND state='writing' AND execution_id=? AND claim_hash=? AND claim_expires>?)").bind(owner,r.id,a.action,actionId,messages[index],stamp,owner,r.id,r.execution_id,r.claim_hash,stamp).run();
 const saved=await db().prepare('SELECT action_id,state,message FROM dedao_cloud_actions WHERE owner=? AND task_id=? AND action=?').bind(owner,r.id,a.action).first<{action_id:string;state:string;message:string|null}>();need(saved,'动作预留结果未确认');
 return {execute_action:!!inserted.meta.changes,action_id:saved.action_id,state:saved.state,message:saved.message,conversation_url:r.conversation_url,unknown_rule:'execute_action=false 时只读核对同一对话/下载，不再次发送或下载。'};
}
export async function confirmCloudAction(owner:string,a:Record<string,unknown>){
 const r=await held(owner,a),index=actions.indexOf(a.action as typeof actions[number]),o=a.observation as Record<string,unknown>;need(r.state==='writing'&&index>=0&&uuid(a.action_id)&&o&&o.conversation_url===r.conversation_url&&typeof o.observed_at==='string'&&Number.isFinite(Date.parse(o.observed_at))&&Math.abs(Date.parse(o.observed_at)-Date.now())<=15*60000&&typeof o.response_reference==='string'&&/^[A-Za-z0-9_.:/-]{1,240}$/.test(o.response_reference),'需要本次同对话的实际观察证据');
 const observation:Record<string,unknown>={conversation_url:r.conversation_url,observed_at:o.observed_at,response_reference:o.response_reference};
 if(index>=3){need(typeof o.title==='string'&&o.title.trim().length>0&&o.title.length<=300&&typeof o.final_version_reference==='string'&&/^[A-Za-z0-9_.:/-]{1,240}$/.test(o.final_version_reference),'需要最新最终稿实际标题与版本');observation.title=o.title;observation.final_version_reference=o.final_version_reference;}
 if(index===3)need(o.team_review_completed===true&&o.fact_check_completed===true,'审稿与事实核查仍未实际完成');
 if(index===3){observation.team_review_completed=true;observation.fact_check_completed=true;}
 if(index===4){need(typeof o.sha256==='string'&&/^[0-9a-f]{64}$/.test(o.sha256)&&typeof o.size==='number'&&Number.isSafeInteger(o.size)&&o.size>0&&o.size<=20000000&&typeof o.filename==='string'&&o.filename.length<=180&&/\.docx$/i.test(o.filename)&&!/[\/\\\u0000-\u001f]/.test(o.filename),'需要真实具名 Word 文件及字节校验');const final=await db().prepare("SELECT observation_json FROM dedao_cloud_actions WHERE owner=? AND task_id=? AND action='finalize' AND state='confirmed'").bind(owner,r.id).first<{observation_json:string}>();need(final,'先核对最终稿');const frozen=JSON.parse(final.observation_json);need(frozen.title===o.title&&frozen.final_version_reference===o.final_version_reference,'下载文件必须属于同一最新最终稿');Object.assign(observation,{filename:o.filename,size:o.size,sha256:o.sha256});}
 const json=JSON.stringify(observation),prior=await db().prepare('SELECT state,observation_json FROM dedao_cloud_actions WHERE owner=? AND task_id=? AND action=? AND action_id=?').bind(owner,r.id,a.action,a.action_id).first<{state:string;observation_json:string|null}>();need(prior,'没有找到原动作意图');if(prior.state==='confirmed'){need(prior.observation_json===json,'原动作证据已冻结，不更换稿件');return readCloudDedao(owner,r.id);}
 await assertWordCredentialFree(owner,observation,[a.claim_token]);
 await db().prepare("UPDATE dedao_cloud_actions SET state='confirmed',observation_json=?,confirmed_at=? WHERE owner=? AND task_id=? AND action=? AND action_id=? AND state='reserved' AND EXISTS(SELECT 1 FROM dedao_cloud_requests WHERE owner=? AND id=? AND execution_id=? AND claim_hash=? AND claim_expires>? AND state='writing')").bind(json,new Date().toISOString(),owner,r.id,a.action,a.action_id,owner,r.id,r.execution_id,r.claim_hash,new Date().toISOString()).run();
 const saved=await db().prepare('SELECT observation_json FROM dedao_cloud_actions WHERE owner=? AND task_id=? AND action=? AND action_id=?').bind(owner,r.id,a.action,a.action_id).first<{observation_json:string}>();need(saved?.observation_json===json,'观察保存结果未确认，请读取原动作');return readCloudDedao(owner,r.id);
}
export async function renewCloudDedao(owner:string,a:Record<string,unknown>){const r=await held(owner,a);await db().prepare("UPDATE dedao_cloud_requests SET claim_expires=? WHERE owner=? AND id=? AND claim_hash=? AND execution_id=? AND claim_expires>? AND state IN ('writing','processing')").bind(new Date(Date.now()+3600000).toISOString(),owner,r.id,r.claim_hash,r.execution_id,new Date().toISOString()).run();return readCloudDedao(owner,r.id);}
export async function finishCloudDedao(owner:string,a:Record<string,unknown>){
 const r=await row(owner,a.task_id);need(uuid(a.claim_token)&&r.claim_hash===await hashText(String(a.claim_token))&&r.execution_id===a.execution_id&&a.all_writer_actions_settled===true&&typeof a.end_reference==='string'&&/^[A-Za-z0-9_.:/-]{1,240}$/.test(a.end_reference),'只能由原云端执行者记录真实结束与动作结清证据');
 await assertWordCredentialFree(owner,a.end_reference,[a.claim_token]);
 need(await completion(owner,r.article_id),'配图或两平台私人草稿仍未完成并结清，不计全流程完成');
 await db().prepare("UPDATE dedao_cloud_requests SET state='completed',end_reference=?,claim_expires=NULL,updated=? WHERE owner=? AND id=? AND claim_hash=? AND execution_id=? AND state='processing'").bind(a.end_reference,new Date().toISOString(),owner,r.id,r.claim_hash,r.execution_id).run();return readCloudDedao(owner,r.id);
}
export async function cloudDedaoCall(owner:string,name:string,a:Record<string,unknown>){
 if(name==='read_dedao_cloud')return readCloudDedao(owner,a.task_id);
 if(name==='start_dedao_cloud')return startCloudDedao(owner,a);
 if(name==='claim_dedao_cloud')return claimCloudDedao(owner,a);
 if(name==='bind_dedao_cloud_article')return bindCloudArticle(owner,a);
 if(name==='begin_dedao_cloud_action')return beginCloudAction(owner,a);
 if(name==='confirm_dedao_cloud_action')return confirmCloudAction(owner,a);
 if(name==='renew_dedao_cloud')return renewCloudDedao(owner,a);
 if(name==='finish_dedao_cloud')return finishCloudDedao(owner,a);
 throw new CloudDedaoError('云端操作无效');
}
