import {generationProgress} from './generation-progress';
import {manualPublicError} from './manual-errors';
import {db} from './test-store';
import {getManualBatch,manualKind,manualAttemptId,assertManualKeys,manualHash,type ManualBatch} from './manual-batch';
import {requestManualClaudeOnce,protectPreparedArticleForOwner} from './claude';
import {parseClaudeArticle} from './claude-article-parser';
import {writingCall} from './writing';

type ManualInput={run_id:string;article_id:string;token:string;expected_model:string;confirm:true};
type Lease={state:string;token:string;article_id:string;expires:string};
type Prepared={owner:string;input:ManualInput;batch:ManualBatch;snapshot:ManualBatch['snapshot']&{run_id:string;day:string;article_id:string;input_hash:string};fingerprint:string};
type Stored={snapshot?:Prepared['snapshot'];fingerprint?:string;text?:string;raw_response?:string;partial_text?:string|null;raw_partial_response?:string|null;usage?:unknown;diagnostic?:unknown;requested_model?:string;returned_model?:string;error?:string;saved?:boolean;save_error?:string|null;save_result?:{saved:boolean;article_id:string;pipeline?:unknown};[key:string]:unknown};
async function attempt(owner:string,runId:string){return db().prepare('SELECT state,response,created FROM claude_attempts WHERE id=? AND owner=?').bind(manualAttemptId(owner,runId),owner).first<{state:string;response:string;created:string}>();}
function dataOf(row:{response:string}|null):Stored{try{return JSON.parse(row?.response||'{}');}catch{return {};}}
async function persist(owner:string,runId:string,state:string,data:Stored){await db().prepare('UPDATE claude_attempts SET state=?,response=? WHERE id=? AND owner=?').bind(state,JSON.stringify(data),manualAttemptId(owner,runId),owner).run();}
async function leaseFor(owner:string,batch:ManualBatch){return db().prepare("SELECT state,token,article_id,expires FROM writing_runs WHERE owner=? AND day=? AND writer='claude' AND run_kind=?").bind(owner,batch.day,manualKind(batch.id)).first<Lease>();}
export async function prepareClaudeManualRun(owner:string,value:unknown):Promise<Prepared>{
 assertManualKeys(value,['run_id','article_id','token','expected_model','confirm']);
 if(value.confirm!==true)throw Error('需确认仅本批次Claude一次YYLX调用，14000输出、300秒、不重试，仅私人草稿');
 const batch=await getManualBatch(owner,value.run_id);
 if(typeof value.token!=='string'||!/^[0-9a-f-]{36}$/i.test(value.token)||typeof value.article_id!=='string')throw Error('文章认领信息无效');
 if(value.expected_model!==batch.snapshot.model)throw Error('模型与本批次冻结配置不一致');
 const lease=await leaseFor(owner,batch);
 if(!lease||lease.article_id!==value.article_id||lease.token!==value.token)throw Error('没有本批次的有效本人Claude认领');
 if(Date.parse(lease.expires)<=Date.now())throw Error('手动Claude认领已过期，不能发起模型调用');
 const past=await attempt(owner,batch.id);
 if(!past){
  if(lease.state!=='writing')throw Error('手动Claude认领已过期，不能发起模型调用');
  const configured=await db().prepare('SELECT model,enabled FROM claude_settings WHERE owner=?').bind(owner).first<{model:string;enabled:string}>();
  if(!configured||configured.enabled!=='1'||configured.model!==batch.snapshot.model)throw Error('Claude配置已变化或未启用，本次停止');
 }
 const snapshot={...batch.snapshot,run_id:batch.id,day:batch.day,article_id:lease.article_id,input_hash:batch.input_hash};
 return {owner,input:value as ManualInput,batch,snapshot,fingerprint:await manualHash(JSON.stringify(snapshot))};
}
function cachedResult(prepared:Prepared,row:{state:string;response:string}){
 const data=dataOf(row);if(data.fingerprint!==prepared.fingerprint)throw Error('已有请求与本批次冻结资料不一致，不会再次调用');
 return {state:row.state,saved:data.saved===true,cached:true,article_id:prepared.input.article_id,save_result:data.save_result||null,error:row.state==='completed'?(data.saved?null:'已有完整结果，请读取后仅保存；不会重新调用'):(data.error||'请求已存在，先读取结果，不会重试')};
}
export async function saveCompletedManualClaude(owner:string,value:unknown){
 assertManualKeys(value,['run_id','article_id','token']);
 const batch=await getManualBatch(owner,value.run_id),lease=await leaseFor(owner,batch);
 if(!lease||lease.token!==value.token||lease.article_id!==value.article_id)throw Error('手动Claude文章认领不一致');
 const row=await attempt(owner,batch.id),data=dataOf(row);
 if(row?.state!=='completed'||!data.text)throw Error('仅能保存本批次已完成的真实Claude结果，不会重新调用');
 if(data.snapshot?.run_id!==batch.id||data.snapshot.article_id!==lease.article_id||data.snapshot.input_hash!==batch.input_hash)throw Error('已完成结果与本批次不一致');
 if(data.saved)return data.save_result||{saved:true,article_id:lease.article_id,already_saved:true};
 if(lease.state!=='writing'||Date.parse(lease.expires)<=Date.now())throw Error('写文认领已失效');
 const article=parseClaudeArticle(data.text).article;
 const result=await writingCall(owner,'save_manual_writing_article',{run_id:batch.id,writer:'claude',article_id:lease.article_id,token:value.token,title:article.title,paragraphs:article.paragraphs,topic:batch.snapshot.writers.claude.topic,sources:batch.snapshot.writers.claude.sources});
 await persist(owner,batch.id,'completed',{...data,saved:true,save_result:result,save_error:null});
 return result;
}
export async function executeClaudeManualRun(prepared:Prepared){
 // Re-read the server snapshot instead of trusting an old or caller-mutated prepared object.
 prepared=await prepareClaudeManualRun(prepared.owner,prepared.input);
 const {owner,input,batch,snapshot,fingerprint}=prepared;
 const previous=await attempt(owner,batch.id);if(previous)return cachedResult(prepared,previous);
 const reserved=await db().prepare("INSERT OR IGNORE INTO claude_attempts(id,owner,day,state,response,created) SELECT ?,owner,day,'requested',?,? FROM writing_runs WHERE owner=? AND day=? AND writer='claude' AND run_kind=? AND article_id=? AND token=? AND state='writing' AND expires>?").bind(manualAttemptId(owner,batch.id),JSON.stringify({fingerprint,snapshot,diagnostic:{stage:'reserved'},saved:false}),new Date().toISOString(),owner,batch.day,manualKind(batch.id),input.article_id,input.token,new Date().toISOString()).run();
 if(!reserved.meta.changes){const current=await attempt(owner,batch.id);if(!current)throw Error('请求状态待核验，不会再次调用');return cachedResult(prepared,current);}
 let result:Awaited<ReturnType<typeof requestManualClaudeOnce>>;
 try{result=await requestManualClaudeOnce(owner,batch.snapshot,input.token,batch.day);}
 catch{const failed={fingerprint,snapshot,error:'Claude配置或密钥状态未确认；本批次已停止，不会重试',saved:false,diagnostic:{stage:'configuration_failed'}};await persist(owner,batch.id,'failed',failed);return {state:'failed',saved:false,article_id:input.article_id,error:failed.error};}
 const durable:Stored={...result,fingerprint,snapshot,saved:false};
 try{await persist(owner,batch.id,result.state,durable);}catch{return {state:'requested',saved:false,article_id:input.article_id,error:'生成结果未确认写入；请只读取状态，不要重新调用'};}
 if(result.state!=='completed')return {state:'failed',saved:false,article_id:input.article_id,error:result.error};
 try{const saved=await saveCompletedManualClaude(owner,{run_id:batch.id,article_id:input.article_id,token:input.token});return {state:'completed',saved:true,cached:false,article_id:input.article_id,save_result:saved};}
 catch(error:unknown){const message=manualPublicError(error,'完整结果已保留，保存未确认；请读取后仅恢复保存');try{await persist(owner,batch.id,'completed',{...durable,save_error:message});}catch{}return {state:'completed',saved:false,article_id:input.article_id,error:message};}
}
export async function readClaudeManualResult(owner:string,runId:unknown){
 const batch=await getManualBatch(owner,runId),row=await attempt(owner,batch.id),original=dataOf(row),lease=await leaseFor(owner,batch);
 const inspection=await protectPreparedArticleForOwner(owner,original);
 const data:Stored=inspection.hit?{saved:original.saved===true}:original;
 return {...generationProgress(row?.state,data.saved===true,row?.created,data.diagnostic),run_id:batch.id,response_suppressed:inspection.hit,state:row?.state||'not_requested',article_id:lease?.article_id||null,incomplete:row?.state!=='completed',snapshot:data.snapshot||null,text:data.text||null,raw_response:data.raw_response||null,partial_text:data.partial_text||null,raw_partial_response:data.raw_partial_response||null,usage:data.usage||null,diagnostic:data.diagnostic||null,requested_model:data.requested_model||null,returned_model:data.returned_model||null,error:data.error||null,saved:data.saved===true,save_error:data.save_error||null,automatic_retry:false};
}
export async function renewCompletedManualClaudeClaim(owner:string,value:unknown){
 assertManualKeys(value,['run_id','article_id','token']);
 const batch=await getManualBatch(owner,value.run_id),lease=await leaseFor(owner,batch);
 if(!lease||lease.article_id!==value.article_id||lease.token!==value.token)throw Error('手动Claude文章认领不一致');
 const row=await attempt(owner,batch.id),data=dataOf(row);
 if(row?.state!=='completed'||!data.text||data.snapshot?.article_id!==lease.article_id||data.snapshot.run_id!==batch.id||data.snapshot.input_hash!==batch.input_hash)throw Error('仅能续认领本批次已完成的Claude原文，不能再次生成');
 if(!['writing','ready'].includes(lease.state))return {renewed:false,article_id:lease.article_id,state:lease.state};
 const now=new Date().toISOString();if(Date.parse(lease.expires)>Date.now())return {renewed:false,article_id:lease.article_id,state:'active'};
 const token=crypto.randomUUID(),expires=new Date(Date.now()+2*3600000).toISOString();
 const updated=await db().prepare("UPDATE writing_runs SET token=?,expires=?,updated=? WHERE owner=? AND day=? AND writer='claude' AND run_kind=? AND article_id=? AND token=? AND state IN ('writing','ready') AND expires<=? AND EXISTS(SELECT 1 FROM claude_attempts WHERE id=? AND owner=? AND state='completed')").bind(token,expires,now,owner,batch.day,manualKind(batch.id),lease.article_id,lease.token,now,manualAttemptId(owner,batch.id),owner).run();
 return updated.meta.changes?{renewed:true,run_id:batch.id,article_id:lease.article_id,token,expires,save_only:true}:{renewed:false,article_id:lease.article_id,state:'changed'};
}
export const manualClaudeTools=[
 {name:'renew_completed_manual_claude_claim',description:'Atomically renew an expired claim ONLY for this same already-completed Claude article so its exact cached output can be saved or its already-authorized queue handoff resumed. Requires original owner, article and old token. Never creates a writer/run, calls a model or retries; old token is invalidated.',inputSchema:{type:'object',properties:{run_id:{type:'string'},article_id:{type:'string'},token:{type:'string'}},required:['run_id','article_id','token'],additionalProperties:false},annotations:{readOnlyHint:false,openWorldHint:false,destructiveHint:false}},
 {name:'read_claude_manual_result',description:'Read the exact real output, snapshot, usage and diagnostics of the owner-only one-off manual pair. No claim, model call, retry or token exposure.',inputSchema:{type:'object',properties:{run_id:{type:'string'}},required:['run_id'],additionalProperties:false},annotations:{readOnlyHint:true,openWorldHint:false,destructiveHint:false}},
 {name:'save_completed_manual_claude',description:'Save ONLY the already-completed original Claude output for this manual pair and enqueue the authorized private-draft preparation. Requires exact original claim. Never generates, rewrites, retries or publicly publishes.',inputSchema:{type:'object',properties:{run_id:{type:'string'},article_id:{type:'string'},token:{type:'string'}},required:['run_id','article_id','token'],additionalProperties:false},annotations:{readOnlyHint:false,openWorldHint:true,destructiveHint:false}}
];
export async function manualClaudeCall(owner:string,name:string,input:unknown){
 if(name==='read_claude_manual_result'){assertManualKeys(input,['run_id']);return readClaudeManualResult(owner,input.run_id);}
 if(name==='renew_completed_manual_claude_claim')return renewCompletedManualClaudeClaim(owner,input);
 if(name==='save_completed_manual_claude')return saveCompletedManualClaude(owner,input);
 throw Error('未知手动Claude操作');
}
