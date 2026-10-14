import {bindingCheckFailure} from './editorial-binding-diagnostics';
import {credentialSourceChanged} from './credential-source-change';
import {readDailyEditorialProgress} from './daily-editorial';
import {retiredGenerationNames} from './legacy-generation';
import {inspectCredentialValue, numericCredentialSafeUsage,type CredentialInspection} from './credential-boundary';
import {workflowPublicError} from './workflow-errors';
import {generationProgress} from './generation-progress';
import {prepareWritingInput,type WritingInputSnapshot} from './writing-input';
import {rewriteKind,rewritePrompt,rewriteVersion} from './writing-rewrite-v2';
import {env} from 'cloudflare:workers';
import {db} from './test-store';
import {effectiveWritingPrompt} from './writing-supplement';
import {parseClaudeArticle} from './claude-article-parser';
import {writingCall} from './writing';
const ORIGIN='https://app.yylx.io';
import {providerSystemPrompt} from './claude-prompt';
export {wordDeliveryInstructions} from './claude-prompt';
async function attemptSummary(owner:string,id:string){const row:any=await db().prepare('SELECT state,response,created FROM claude_attempts WHERE id=? AND owner=?').bind(id,owner).first();if(!row)return null;let data:any={};try{data=JSON.parse(row.response||'{}');}catch{}const protection=await protectPreparedArticleForOwner(owner,data);if(protection.hit)data={saved:data.saved===true};const editorial=id===`${owner}:${currentDay()}`?await readDailyEditorialProgress(owner,currentDay()):null;return {response_suppressed:protection.hit,state:row.state,created:row.created,error:data.error||null,diagnostic:data.diagnostic||null,has_text:typeof data.text==='string'&&data.text.length>0,has_partial_text:typeof data.partial_text==='string'&&data.partial_text.length>0,...generationProgress(row.state,data.saved===true,row.created,data.diagnostic),...(editorial||{})};}

async function readLimited(res:Response,limit:number){const reader=res.body?.getReader();if(!reader)throw Error('响应为空');let total=0;const parts:Uint8Array[]=[];try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit){await reader.cancel();throw Error('响应过大');}parts.push(value);}}finally{reader.releaseLock();}const all=new Uint8Array(total);let at=0;for(const p of parts){all.set(p,at);at+=p.length;}return new TextDecoder().decode(all);}
async function settings(owner:string){return await db().prepare('SELECT * FROM claude_settings WHERE owner=?').bind(owner).first() as any;}
function probeId(owner:string,s:any,day:string){return `probe:${owner}:${day}:${s.updated}`;}
const currentDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
type DailySource={title:string;url:string;published:string};
type DailyInput={day:string;article_id:string;token:string;expected_model:string;topic:string;materials:string;outline?:string;sources:DailySource[]};
type DailySnapshot=Omit<DailyInput,'token'>&{editorial_contract_version?:1;model:string;prompt_version:string;prompt_sha256:string;system_prompt:string;system_prompt_sha256:string;max_output_tokens:14000;user_prompt?:string;input_sha256?:string};
type DailyPrepared={owner:string;input:DailyInput;snapshot:DailySnapshot;fingerprint:string};
async function sha256(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
function normalizeDailySources(value:unknown):DailySource[]{
 if(!Array.isArray(value)||value.length<2||value.length>12)throw Error('来源数量需为2–12条');
 return value.map((source:any)=>{if(!source||typeof source!=='object'||typeof source.url!=='string'||typeof source.title!=='string'||typeof source.published!=='string'||source.title.length>300||source.published.length>100)throw Error('来源格式无效');const u=new URL(source.url);if(u.protocol!=='https:'||u.username||u.password||u.href.length>2048)throw Error('来源格式无效');return {title:source.title,url:u.href,published:source.published};});
}
export async function prepareClaudeDailyRun(owner:string,value:any):Promise<DailyPrepared>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['day','article_id','token','expected_model','topic','materials','sources','outline'].includes(k)))throw Error('日更资料格式无效');
 const {day,article_id,token,expected_model,topic,materials,outline}=value;
 if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||day!==currentDay())throw Error('只能执行北京时间今天的Claude日更');
 if(typeof article_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(article_id))throw Error('文章认领信息无效');
 if(typeof token!=='string'||!/^[0-9a-f-]{36}$/i.test(token))throw Error('文章认领信息无效');
 if(typeof expected_model!=='string'||expected_model.length>110||!/^claude-[a-zA-Z0-9._-]{1,100}$/.test(expected_model))throw Error('需填写已配置的Claude模型');
 if(typeof topic!=='string'||!topic.trim()||topic.length>300||typeof materials!=='string'||materials.length<100||materials.length>18000)throw Error('选题或资料格式无效');
 const sources=normalizeDailySources(value.sources);
 const lease:any=await db().prepare("SELECT article_id,expires,input_snapshot FROM writing_runs WHERE owner=? AND day=? AND writer='claude' AND run_kind='daily' AND article_id=? AND token=? AND state='writing' AND expires>? LIMIT 1").bind(owner,day,article_id,token,new Date().toISOString()).first();
 if(!lease)throw Error('没有有效的本人北京时间日更认领；请先读取结果，再按需认领');
 const configured:any=await settings(owner);if(!configured||configured.enabled!=='1')throw Error('Claude日更尚未启用');if(configured.model!==expected_model)throw Error('当前配置模型与本次认领模型不一致，请核对后停止');
 // Never reconstruct a legacy claim from today's global prompt. Its old response stays readable.
 if(!lease.input_snapshot)throw Error('旧日更任务缺少冻结输入，仅可读取已有结果；不会发起新调用');
 const editorial=JSON.parse(lease.input_snapshot).editorial_contract_version===1;
 if(editorial&&(await protectPreparedArticleForOwner(owner,{topic,materials,sources,outline,expected_model})).hit)throw Error('日更资料安全校验未通过');
 const assembled=(await prepareWritingInput(owner,{article_id,token,topic,materials,sources,outline})).snapshot as WritingInputSnapshot;
 const system_prompt=assembled.system_prompt;
 const snapshot:DailySnapshot={...(editorial?{editorial_contract_version:1 as const}:{}),day,article_id,expected_model,topic,materials,...(assembled.outline?{outline:assembled.outline}:{}),sources:assembled.sources!,user_prompt:assembled.user_prompt,input_sha256:assembled.input_sha256,model:configured.model,prompt_version:assembled.prompt_version,prompt_sha256:assembled.prompt_sha256,system_prompt,system_prompt_sha256:await sha256(system_prompt),max_output_tokens:14000};
 return {owner,input:{day,article_id,token,expected_model,topic,materials,sources,...(outline?{outline}:{})},snapshot,fingerprint:await sha256(JSON.stringify(snapshot))};
}
async function storeDailyResponse(owner:string,day:string,state:string,response:Record<string,unknown>){
 await db().prepare('UPDATE claude_attempts SET state=?,response=? WHERE id=? AND owner=?').bind(state,JSON.stringify(response),`${owner}:${day}`,owner).run();
}
type DailyBodyReadError=Error&{partialBody?:string};
async function readDailyBody(response:Response,limit:number){
 const reader=response.body?.getReader();if(!reader)throw Error('中转站返回空响应');
 const decoder=new TextDecoder();let length=0,raw='';
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();const error=Error('响应过大') as DailyBodyReadError;error.partialBody=raw.slice(0,limit);throw error;}raw+=decoder.decode(value,{stream:true});}}
 catch(error:unknown){const tail=decoder.decode();const partial=(raw+tail).slice(0,limit);if(error instanceof Error&&error.message==='响应过大'){(error as DailyBodyReadError).partialBody=partial;throw error;}const interrupted=Error('模型响应读取中断') as DailyBodyReadError;interrupted.partialBody=partial;throw interrupted;}
 finally{reader.releaseLock();}
 return raw+decoder.decode();
}
function providerOutputText(value:unknown){
 if(!value||typeof value!=='object')return '';
 const content=(value as {content?:unknown}).content;
 return Array.isArray(content)?content.filter((part:any)=>part?.type==='text'&&typeof part.text==='string').map((part:any)=>part.text).join('\n'):'';
}
function extractPartialProviderText(raw:string){
 const matches=[...raw.matchAll(/"text"\s*:\s*"((?:[^"\\]|\\.)*)/g)];if(!matches.length)return '';
 return matches.map(match=>{const encoded=match[1].replace(/\\u[0-9a-f]{0,3}$/i,'').replace(/\\$/,'');try{return JSON.parse(`"${encoded}"`);}catch{return '';}}).filter(Boolean).join('\n');
}
function extractPartialUsage(raw:string){
 const key=raw.search(/"usage"\s*:/);if(key<0)return null;const opening=raw.indexOf('{',key);if(opening<0)return null;
 let depth=0,inString=false,escaped=false,end=-1;for(let i=opening;i<raw.length;i++){const ch=raw[i];if(inString){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')inString=false;continue;}if(ch==='"'){inString=true;continue;}if(ch==='{')depth++;else if(ch==='}'&&--depth===0){end=i+1;break;}}
 if(end<0)return null;try{const value=JSON.parse(raw.slice(opening,end));return {input_tokens:Number(value.input_tokens)||0,output_tokens:Number(value.output_tokens)||0,thinking_tokens:Number(value.output_tokens_details?.thinking_tokens)||0};}catch{return null;}
}
function extractPartialStopReason(raw:string){const match=raw.match(/"stop_reason"\s*:\s*"([^"\\]{1,80})"/);return match?.[1]||null;}
function safeDailyFailure(error:unknown){
 const message=error instanceof Error?error.message:'';
 if(/^中转站返回HTTP \d{3}$/.test(message)||['生成达到输出上限，正文可能不完整','生成结束原因未确认；不自动重试','中转站未返回有效正文','中转站响应格式无法识别','模型响应读取中断','响应过大','中转站返回空响应'].includes(message))return message;
 return '模型响应未完成；不自动重试';
}
async function saveDailyResult(prepared:DailyPrepared,data:any){
 if(data.saved===true||data.initial_saved===true)return data.save_result||{saved:true,article_id:prepared.input.article_id,already_saved:true};
 if(typeof data.text!=='string'||!data.text)throw Error('日更已返回完整结果，但没有可用正文');
 const article=parseClaudeArticle(data.text).article;
 const saved=await writingCall(prepared.owner,'save_writing_article',{day:prepared.input.day,writer:'claude',run_kind:'daily',token:prepared.input.token,title:article.title,paragraphs:article.paragraphs,topic:prepared.snapshot.topic,sources:prepared.snapshot.sources});
 const next={...data,saved:saved.saved===true,initial_saved:saved.initial_saved===true,save_result:saved,save_error:null};
 await storeDailyResponse(prepared.owner,prepared.input.day,'completed',next);
 return saved;
}
export async function executeClaudeDailyRun(prepared:DailyPrepared){
 prepared=await prepareClaudeDailyRun(prepared.owner,prepared.input);
 const {owner,input,snapshot,fingerprint}=prepared;
 if(input.day!==currentDay())throw Error('日更日期已变化，请先读取任务状态');
 const lease:any=await db().prepare("SELECT article_id,expires FROM writing_runs WHERE owner=? AND day=? AND writer='claude' AND run_kind='daily' AND article_id=? AND token=? AND state='writing' AND expires>? LIMIT 1").bind(owner,input.day,input.article_id,input.token,new Date().toISOString()).first();
 if(!lease)throw Error('日更认领已失效，请先读取结果再决定下一步');
 const configured:any=await settings(owner);if(!configured||configured.enabled!=='1'||configured.model!==input.expected_model)throw Error('Claude配置已变化或未启用，本次停止');
 const previous:any=await db().prepare('SELECT state,response FROM claude_attempts WHERE id=? AND owner=?').bind(`${owner}:${input.day}`,owner).first();
 if(previous){
  let old:any={};try{old=JSON.parse(previous.response||'{}');}catch{}
  if(old.fingerprint!==fingerprint)throw Error('今天已有Claude请求，输入与已绑定资料不同；不会再次调用');
  if(previous.state==='completed')return {state:'completed',saved:old.saved===true,initial_saved:old.initial_saved===true,cached:true,article_id:input.article_id,error:old.saved===true?null:'已有完整结果，请先读取日更结果；不会再次调用'};
  return {state:previous.state,cached:true,article_id:input.article_id,error:previous.state==='failed'?(old.error||'日更请求失败；不会自动重试'):'日更请求仍待核实；不会再次调用'};
 }
 const secret=await decrypt(owner,configured.secret);
 if(snapshot.editorial_contract_version===1&&inspectCredentialValue(snapshot,[secret,input.token]).hit)throw Error('日更资料安全校验未通过');
 const reserved=await db().prepare("INSERT OR IGNORE INTO claude_attempts(id,owner,day,state,response,created) SELECT ?,owner,day,'requested',?,? FROM writing_runs WHERE owner=? AND day=? AND writer='claude' AND run_kind='daily' AND article_id=? AND token=? AND state='writing' AND expires>?").bind(`${owner}:${input.day}`,JSON.stringify({fingerprint,snapshot,diagnostic:{stage:'reserved'},saved:false}),new Date().toISOString(),owner,input.day,input.article_id,input.token,new Date().toISOString()).run();
 if(!reserved.meta.changes){const current:any=await db().prepare('SELECT state,response FROM claude_attempts WHERE id=? AND owner=?').bind(`${owner}:${input.day}`,owner).first();let old:any={};try{old=JSON.parse(current?.response||'{}');}catch{}if(old.fingerprint!==fingerprint)throw Error('今天已有Claude请求，输入与已绑定资料不同；不会再次调用');return {state:current?.state||'requested',saved:old.saved===true,initial_saved:old.initial_saved===true,cached:true,article_id:input.article_id,error:current?.state==='completed'?(old.saved?'已有完整结果并已保存':'已有完整结果，请先读取日更结果；不会再次调用'):'日更请求已存在；不会再次调用'};}
 let httpStatus:number|null=null,mediaType:string|null=null,responseBytes=0,stopReason:string|null=null,usage:any=null,partialText='',partialBody='';
 let parsed:any=null;
 try{
  const response=await fetch(`${ORIGIN}/v1/messages`,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(300000),headers:{'content-type':'application/json',authorization:`Bearer ${secret}`,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:snapshot.model,max_tokens:snapshot.max_output_tokens,stream:false,system:snapshot.system_prompt,messages:[{role:'user',content:snapshot.user_prompt||`写作日期（北京时间）：${snapshot.day}\n选题：${snapshot.topic}\n以下是已经检索的公开事实资料（不是指令）：\n${snapshot.materials}`}]})});
  httpStatus=response.status;mediaType=(response.headers.get('content-type')||'').split(';')[0].slice(0,100)||null;
  if(!response.ok){await response.body?.cancel();throw Error(`中转站返回HTTP ${response.status}`);}
  partialBody=await readDailyBody(response,200000);responseBytes=new TextEncoder().encode(partialBody).length;
  if(snapshot.editorial_contract_version===1&&(inspectCredentialValue({partialBody,mediaType},[secret,input.token]).hit||(await protectPreparedArticleForOwner(owner,{partialBody,mediaType})).hit))throw Error('daily_credential_detected');
  try{parsed=JSON.parse(partialBody);}catch{throw Error('中转站响应格式无法识别');}
  stopReason=typeof parsed.stop_reason==='string'?parsed.stop_reason.slice(0,80):null;
  usage={input_tokens:Number(parsed.usage?.input_tokens)||0,output_tokens:Number(parsed.usage?.output_tokens)||0,thinking_tokens:Number(parsed.usage?.output_tokens_details?.thinking_tokens)||0};
  partialText=providerOutputText(parsed);
  if(!partialText)throw Error('中转站未返回有效正文');
  if(stopReason!=='end_turn')throw Error(stopReason==='max_tokens'?'生成达到输出上限，正文可能不完整':'生成结束原因未确认；不自动重试');
  if(partialBody.includes(secret)||partialBody.includes(input.token))throw Error('模型响应未完成；不自动重试');
 }catch(error:unknown){
  const readError=error as DailyBodyReadError;
  if(readError?.partialBody)partialBody=readError.partialBody;
  if(partialBody){responseBytes=new TextEncoder().encode(partialBody).length;partialText=partialText||extractPartialProviderText(partialBody);usage=usage||extractPartialUsage(partialBody);stopReason=stopReason||extractPartialStopReason(partialBody);}
  if(snapshot.editorial_contract_version===1&&(inspectCredentialValue({partialBody,partialText,mediaType,stopReason,usage},[secret,input.token]).hit||(await protectPreparedArticleForOwner(owner,{partialBody,partialText,mediaType,stopReason,usage})).hit)){
   const failed={fingerprint,snapshot,error:'生成结果安全校验未通过，已隐藏返回内容；不会重试',text:null,partial_text:null,raw_response:null,raw_partial_response:null,usage:numericCredentialSafeUsage(usage),requested_model:snapshot.model,diagnostic:{stage:'credential_detected',http_status:httpStatus,response_bytes:responseBytes},saved:false};
   try{await storeDailyResponse(owner,input.day,'failed',failed);}catch{}
   return {state:'failed',saved:false,article_id:input.article_id,error:failed.error,partial_text:null,raw_partial_response:null,usage:failed.usage,diagnostic:failed.diagnostic};
  }

  const message=safeDailyFailure(error);const diagnostic={stage:'failed',http_status:httpStatus,media_type:mediaType,response_bytes:responseBytes,stop_reason:stopReason};
  const safeRaw=partialBody?partialBody.slice(0,200000).split(secret).join('[redacted]').split(input.token).join('[redacted]'):null;
  partialText=partialText.split(secret).join('[redacted]').split(input.token).join('[redacted]');
  const failed={fingerprint,snapshot,error:message,partial_text:partialText||null,raw_partial_response:safeRaw,partial_response_bytes:responseBytes,usage,requested_model:snapshot.model,diagnostic,saved:false};
  try{await storeDailyResponse(owner,input.day,'failed',failed);}catch{}
  return {state:'failed',saved:false,article_id:input.article_id,error:message,partial_text:partialText||null,usage,diagnostic};
 }
 const complete={fingerprint,snapshot,text:partialText,requested_model:snapshot.model,returned_model:typeof parsed.model==='string'?parsed.model.slice(0,150):null,usage,diagnostic:{stage:'completed',http_status:httpStatus,media_type:mediaType,response_bytes:responseBytes,stop_reason:stopReason},saved:false};
 if(snapshot.editorial_contract_version===1&&(inspectCredentialValue(complete,[secret,input.token]).hit||(await protectPreparedArticleForOwner(owner,complete)).hit)){const failed={fingerprint,snapshot,error:'生成结果安全校验未通过，已隐藏返回内容；不会重试',text:null,partial_text:null,raw_response:null,raw_partial_response:null,usage:numericCredentialSafeUsage(usage),diagnostic:{stage:'credential_detected',http_status:httpStatus,response_bytes:responseBytes},saved:false};await storeDailyResponse(owner,input.day,'failed',failed);return {state:'failed',saved:false,article_id:input.article_id,error:failed.error,partial_text:null,usage:failed.usage};}
 try{await storeDailyResponse(owner,input.day,'completed',complete);}catch{return {state:'requested',saved:false,article_id:input.article_id,error:'完整结果暂未安全写入状态；先读取日更结果，不要再次调用'};}
 try{const saved=await saveDailyResult(prepared,complete);return {state:'completed',saved:saved.saved===true,initial_saved:saved.initial_saved===true,cached:false,article_id:input.article_id,save_result:saved,requested_model:complete.requested_model,returned_model:complete.returned_model,usage};}
 catch(error:unknown){const message=workflowPublicError(error,'完整结果已保留，保存待核验；不会再次调用');try{await storeDailyResponse(owner,input.day,'completed',{...complete,save_error:message});}catch{}return {state:'completed',saved:false,cached:false,article_id:input.article_id,error:message,requested_model:complete.requested_model,returned_model:complete.returned_model,usage};}
}
export async function readClaudeDailyResult(owner:string,day:string){
 if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('日期格式无效');
 const row:any=await db().prepare('SELECT state,response,created FROM claude_attempts WHERE id=? AND owner=? AND day=?').bind(`${owner}:${day}`,owner,day).first();
 if(!row)return {day,state:'not_found',article_id:null,text:null,snapshot:null,diagnostic:null,usage:null,saved:false};
 let data:any={};try{data=JSON.parse(row.response||'{}');}catch{}
 const protectedData=await protectPreparedArticleForOwner(owner,data);
 const suppressed=protectedData.hit;if(suppressed)data={saved:data.saved===true};
 const editorial=await readDailyEditorialProgress(owner,day);
 const run:any=await db().prepare("SELECT article_id FROM writing_runs WHERE owner=? AND day=? AND writer='claude' AND run_kind='daily' LIMIT 1").bind(owner,day).first();
 return {...generationProgress(row.state,data.saved===true,row.created,data.diagnostic),...(editorial||{}),day,state:row.state,initial_saved:editorial?.initial_saved||data.initial_saved===true,response_suppressed:suppressed,incomplete:row.state!=='completed',article_id:data.snapshot?.article_id||run?.article_id||null,text:typeof data.text==='string'?data.text:null,partial_text:typeof data.partial_text==='string'?data.partial_text:null,raw_partial_response:typeof data.raw_partial_response==='string'?data.raw_partial_response:null,snapshot:data.snapshot||null,diagnostic:data.diagnostic||null,usage:data.usage||null,error:data.error||null,requested_model:data.requested_model||null,returned_model:data.returned_model||null,saved:editorial?.final_saved||data.saved===true,save_error:data.save_error||null};
}
export async function claudeStatus(owner:string){const s=await settings(owner);const probe:any=s?await db().prepare('SELECT state,response,created FROM claude_attempts WHERE id=? AND owner=?').bind(probeId(owner,s,currentDay()),owner).first():null;const result={provider:'YYLX',base_url:ORIGIN,configured:!!s,enabled:s?.enabled==='1',model:s?.model||'',storage_ready:!!env.CLAUDE_CONFIG_KEY,max_output_tokens:14000,short_connection_generation_enabled:false,supported_generation_paths:['/writing/daily-run','/writing/stepwise-text-run'],max_requests_per_day:1,max_workflow_test_requests_per_day:1,writing_attempts:{daily:await attemptSummary(owner,`${owner}:${currentDay()}`),workflow_test:await attemptSummary(owner,`workflow-test:${owner}:${currentDay()}`),explicit_test_retry:await attemptSummary(owner,`workflow-test-retry:${owner}:${currentDay()}`),v2_rewrite:await attemptSummary(owner,`workflow-rewrite-v2:${owner}:${currentDay()}`),v2_confirmed_retry:await attemptSummary(owner,`workflow-rewrite-v2-confirmed-retry:${owner}:${currentDay()}`),extended_test_retry:await attemptSummary(owner,`workflow-test-extended:${owner}:${currentDay()}`)},connection_test:probe?{state:probe.state,created:probe.created,...JSON.parse(probe.response||'{}')}:null};const protection=await protectPreparedArticleForOwner(owner,result);return protection.hit?{provider:'YYLX',base_url:ORIGIN,configured:!!s,enabled:s?.enabled==='1',model:'',storage_ready:!!env.CLAUDE_CONFIG_KEY,max_output_tokens:14000,short_connection_generation_enabled:false,response_suppressed:true,writing_attempts:null,connection_test:null}:result;}

function encode(b:Uint8Array){return btoa(String.fromCharCode(...b));}
async function key(){if(!env.CLAUDE_CONFIG_KEY)throw Error('密钥保护尚未就绪');return await crypto.subtle.importKey('raw',Uint8Array.from(atob(env.CLAUDE_CONFIG_KEY),c=>c.charCodeAt(0)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function listClaudeModels(owner:string,provided?:unknown){
 if(typeof provided==='string')provided=provided.trim();
 let apiKey:string;if(provided){if(typeof provided!=='string'||provided.length<12||provided.length>512||/[\s\x00-\x1f]/.test(provided))throw Error('API Key格式无效');apiKey=provided;}else{const saved=await settings(owner);if(!saved)throw Error('请先填写API Key');apiKey=await decrypt(owner,saved.secret);}
 let res:Response;try{res=await fetch(`${ORIGIN}/v1/models`,{headers:{authorization:`Bearer ${apiKey}`},redirect:'manual',signal:AbortSignal.timeout(20000)});}catch(e:any){console.error(JSON.stringify({component:'claude-models',stage:'fetch',code:e?.name==='TimeoutError'?'timeout':e?.name==='AbortError'?'abort':e?.name==='TypeError'?'type_error':'fetch_error'}));throw Error('模型目录连接未确认，请稍后重试');}
 if(!res.ok){console.error(JSON.stringify({component:'claude-models',stage:'upstream',status:res.status}));await res.body?.cancel();throw Error(`读取模型失败（HTTP ${res.status}）`);}
 let data:any;try{data=JSON.parse(await readLimited(res,200000));}catch{throw Error('模型目录响应无法识别');}
 if(!Array.isArray(data.data))throw Error('模型目录格式无法识别');
 const models=[...new Set<string>(data.data.map((m:any)=>m?.id).filter((id:any)=>typeof id==='string'&&/^claude-[a-zA-Z0-9._-]{1,100}$/.test(id)))].sort();return {models};
}
export async function configureClaude(owner:string,a:any){
 if(typeof a.api_key==='string')a={...a,api_key:a.api_key.trim()};
 if(a.consent!==true)throw Error('请确认保存并授权每日调用');
 if(typeof a.model!=='string'||!/^claude-[a-zA-Z0-9._-]{1,100}$/.test(a.model))throw Error('请填写中转站支持的精确Claude模型名');
 const old=await settings(owner);let secret=old?.secret;
 if(a.api_key){if(typeof a.api_key!=='string'||a.api_key.length<12||a.api_key.length>512||/[\s\x00-\x1f]/.test(a.api_key))throw Error('API Key格式无效');const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(owner)},await key(),new TextEncoder().encode(a.api_key));secret=JSON.stringify({iv:encode(iv),data:encode(new Uint8Array(encrypted))});}
 if(!secret)throw Error('请填写API Key');
 if(a.enabled===true){
  const apiKey=await decrypt(owner,secret);
  let res:Response;try{res=await fetch(`${ORIGIN}/v1/models`,{headers:{authorization:`Bearer ${apiKey}`},redirect:'manual',signal:AbortSignal.timeout(20000)});}catch{throw Error('中转站连接未确认，配置未启用');}
  if(!res.ok){await res.body?.cancel();throw Error(`模型目录验证失败（HTTP ${res.status}）`);}
  const raw=await readLimited(res,200000);
  let models:any;try{models=JSON.parse(raw);}catch{throw Error('模型目录格式无法识别');}
  if(!Array.isArray(models.data)||!models.data.some((m:any)=>m.id===a.model))throw Error('该密钥的模型目录中没有这个模型，请核对名称和分组');
 }
 await db().prepare('INSERT INTO claude_settings(owner,model,secret,enabled,updated) VALUES(?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET model=excluded.model,secret=excluded.secret,enabled=excluded.enabled,updated=excluded.updated').bind(owner,a.model,secret,a.enabled===true?'1':'0',new Date().toISOString()).run();return claudeStatus(owner);
}
async function decrypt(owner:string,s:string){const j=JSON.parse(s);const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(atob(j.iv),c=>c.charCodeAt(0)),additionalData:new TextEncoder().encode(owner)},await key(),Uint8Array.from(atob(j.data),c=>c.charCodeAt(0)));return new TextDecoder().decode(bytes);}
export async function testClaudeConnection(owner:string,confirm:any){
 if(confirm!==true)throw Error('需要明确授权一次最小连接测试');
 const s=await settings(owner);if(!s||s.enabled!=='1')throw Error('Claude配置未启用');
 const day=currentDay(),id=probeId(owner,s,day);
 const previous:any=await db().prepare('SELECT state,response FROM claude_attempts WHERE id=? AND owner=?').bind(id,owner).first();if(previous)return {state:previous.state,cached:true,...JSON.parse(previous.response||'{}')};
 const secret=await decrypt(owner,s.secret);
 const reserved=await db().prepare('INSERT OR IGNORE INTO claude_attempts(id,owner,day,state,created) VALUES(?,?,?,?,?)').bind(id,owner,day,'requested',new Date().toISOString()).run();if(!reserved.meta.changes)return {state:'requested',cached:true};
 let status:number|null=null;
 try{
  const res=await fetch(`${ORIGIN}/v1/messages`,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(180000),headers:{'content-type':'application/json',authorization:`Bearer ${secret}`,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:s.model,max_tokens:32,stream:false,messages:[{role:'user',content:'请只回复：连接成功'}]})});status=res.status;
  if(!res.ok){await res.body?.cancel();throw Error('upstream');}
  const data=JSON.parse(await readLimited(res,20000));if(!Array.isArray(data.content))throw Error('invalid');const text=data.content.filter((x:any)=>x?.type==='text'&&typeof x.text==='string').map((x:any)=>x.text).join('').trim();
  if(!text)throw Error('empty');
  const result={http_status:status,requested_model:s.model,returned_model:typeof data.model==='string'?data.model.slice(0,150):null,response_text:text.slice(0,160),complete:data.stop_reason==='end_turn',exact_match:text==='连接成功',usage:{input_tokens:Number(data.usage?.input_tokens)||0,output_tokens:Number(data.usage?.output_tokens)||0},daily_quota_untouched:true};
  await db().prepare("UPDATE claude_attempts SET state='completed',response=? WHERE id=? AND owner=?").bind(JSON.stringify(result),id,owner).run();return {state:'completed',...result};
 }catch(e:any){const result={http_status:status,error:status&&status>=300?`中转站返回HTTP ${status}`:'模型响应未确认；不自动重试',daily_quota_untouched:true};await db().prepare("UPDATE claude_attempts SET state='failed',response=? WHERE id=? AND owner=?").bind(JSON.stringify(result),id,owner).run();return {state:'failed',...result};}
}
export const claudeTools:any[]=[
 {name:'test_claude_connection',description:'Run ONE explicitly user-requested minimal charged connection test of the currently configured model (32 output tokens max). Does not create an article or consume the daily writing slot. Same configuration/date replays cached result; never automatically retry.',inputSchema:{type:'object',properties:{confirm:{type:'boolean',const:true}},required:['confirm'],additionalProperties:false},annotations:{readOnlyHint:false,openWorldHint:true,destructiveHint:false}},
 {name:'read_claude_config',description:'Read Claude gateway configuration readiness and selected model. Never returns credentials.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,openWorldHint:false}},
 {name:'read_claude_daily_result',description:'Read the owner-scoped Beijing daily Claude request and its exact saved output, prompt snapshot, diagnostics and usage. Read-only: never claims a run, returns a lease token, retries, or calls a model.',inputSchema:{type:'object',properties:{day:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'}},required:['day'],additionalProperties:false},annotations:{readOnlyHint:true,openWorldHint:false,destructiveHint:false}},
 {name:'generate_claude_article',description:'Make at most ONE charged request for an explicitly authorized workflow_test. Requires a separately claimed test and confirm_test=true; never consumes the daily slot. The scheduled daily article is only generated by the owner-checked /writing/daily-run long-connection form. No automatic retry or public publishing.',inputSchema:{type:'object',properties:{day:{type:'string'},token:{type:'string'},topic:{type:'string',maxLength:300},materials:{type:'string',maxLength:18000},run_kind:{type:'string',enum:['daily','workflow_test']},confirm_test:{type:'boolean'}},required:['day','token','topic','materials'],additionalProperties:false},annotations:{readOnlyHint:false,openWorldHint:true,destructiveHint:false}}
];
const generationBase=claudeTools.find(t=>t.name==='generate_claude_article')!;
const {run_kind,confirm_test,...generationProperties}=generationBase.inputSchema.properties;
claudeTools.push({...generationBase,name:'generate_claude_test_article',description:'ONE extra full-article generation only for an explicitly authorized workflow test. Requires its isolated test claim and confirm=true. Never consumes or replaces daily writing; never automatically retry.',inputSchema:{...generationBase.inputSchema,properties:{...generationProperties,confirm:{type:'boolean',const:true}},required:[...(generationBase.inputSchema.required||[]),'confirm']}});
claudeTools.push({...generationBase,name:'retry_claude_test_article_once',description:'Make ONE explicitly user-authorized additional attempt after a failed full workflow test. Preserves the original failure and daily quota. Requires the same valid test claim, confirm=true and exact prior article ID. Never use automatically or for a pending/successful attempt.',inputSchema:{...generationBase.inputSchema,properties:{...generationProperties,confirm:{type:'boolean',const:true},article_id:{type:'string'}},required:[...(generationBase.inputSchema.required||[]),'confirm','article_id']}});
claudeTools.push({...generationBase,name:'retry_claude_test_article_14000',description:'ONE specifically user-approved 14000-output-token test attempt after the previous explicit 7000-token retry was truncated. Requires the same article ID and claim, confirm=true. Separate from daily production; never automatically retry.',inputSchema:{...generationBase.inputSchema,properties:{...generationProperties,confirm:{type:'boolean',const:true},article_id:{type:'string'}},required:[...(generationBase.inputSchema.required||[]),'confirm','article_id']}});
claudeTools.push({...generationBase,name:'generate_claude_rewrite_v2',description:'ONE user-requested new Claude rewrite using the complete V2 prompt and currently selected model. Separate from previous tests/daily. 14000 output cap, no auto retries. Requires confirmed V2 claim and expected_model.',inputSchema:{...generationBase.inputSchema,properties:{...generationProperties,confirm:{type:'boolean',const:true},expected_model:{type:'string',maxLength:110},sources:{type:'array',minItems:2,maxItems:12,items:{type:'object',properties:{title:{type:'string'},url:{type:'string'},published:{type:'string'}},required:['title','url','published'],additionalProperties:false}}},required:[...(generationBase.inputSchema.required||[]),'confirm','expected_model','sources']}});
const v2Tool=claudeTools.find(t=>t.name==='generate_claude_rewrite_v2')!;claudeTools.push({...v2Tool,name:'retry_claude_rewrite_v2',description:'ONE separately user-approved retry after failed/canceled V2 call. Preserves prior attempt, no automatic retry. Requires exact prior article ID.',inputSchema:{...v2Tool.inputSchema,properties:{...v2Tool.inputSchema.properties,article_id:{type:'string'}},required:[...v2Tool.inputSchema.required,'article_id']}});
claudeTools.push({name:'read_claude_historical_result',description:'Read only a whitelisted owner/day historical Claude attempt, including a saved partial response. Never claims, changes a row, calls a model, retries or consumes quota. Old requested rows remain outcome_unknown after the execution window.',inputSchema:{type:'object',properties:{day:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},scope:{type:'string',enum:['daily','workflow_test','explicit_test_retry','extended_test_retry','v2_rewrite','v2_confirmed_retry']}},required:['day','scope'],additionalProperties:false},annotations:{readOnlyHint:true,openWorldHint:false,destructiveHint:false}});
for(const tool of claudeTools)if(retiredGenerationNames.has(tool.name)){tool.description='RETIRED compatibility endpoint: no model request is made. Read read_claude_historical_result; use the private long-connection writing forms for separately authorized new work.';tool.annotations={readOnlyHint:true,openWorldHint:false,destructiveHint:false};}
export async function readClaudeHistoricalResult(owner:string,value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['day','scope'].includes(k)))throw Error('历史记录参数无效');
 const {day,scope}=value as {day:unknown;scope:unknown};
 const prefixes:Record<string,string>={daily:'',workflow_test:'workflow-test:',explicit_test_retry:'workflow-test-retry:',extended_test_retry:'workflow-test-extended:',v2_rewrite:'workflow-rewrite-v2:',v2_confirmed_retry:'workflow-rewrite-v2-confirmed-retry:'};
 if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||typeof scope!=='string'||!Object.hasOwn(prefixes,scope))throw Error('历史记录参数无效');
 const row=await db().prepare('SELECT state,response,created FROM claude_attempts WHERE id=? AND owner=? AND day=?').bind(`${prefixes[scope]}${owner}:${day}`,owner,day).first<{state:string;response:string|null;created:string}>();
 if(!row)return {day,scope,state:'not_found',read_only:true,model_request_sent:false,automatic_retry:false,result:null};
 let result:unknown=null;try{result=JSON.parse(row.response||'null');}catch{return {day,scope,state:row.state,outcome:'result_unreadable',read_only:true,automatic_retry:false,model_request_sent:false,result:null};}
 const inspection=await protectPreparedArticleForOwner(owner,result),data=result&&typeof result==='object'?result as {saved?:boolean;diagnostic?:unknown}:{};
 const editorial=scope==='daily'?await readDailyEditorialProgress(owner,day):null;
 return {day,scope,state:row.state,created:row.created,...generationProgress(row.state,data.saved===true,row.created,data.diagnostic),...(editorial||{}),read_only:true,model_request_sent:false,response_suppressed:inspection.hit,result:inspection.hit?null:inspection.value};
}
export async function claudeCall(owner:string,name:string,a:any){
 if(name==='read_claude_historical_result')return readClaudeHistoricalResult(owner,a);
 if(name==='read_claude_daily_result')return readClaudeDailyResult(owner,a.day);
 const rewriteRetry=name==='retry_claude_rewrite_v2';
 const rewrite=rewriteRetry||name==='generate_claude_rewrite_v2';
 if(rewrite){if(a.confirm!==true)throw Error('V2重写需要本次明确授权');name='generate_claude_article';a={...a,run_kind:rewriteKind,confirm_test:true};}
 const extendedRetry=name==='retry_claude_test_article_14000';
 const explicitRetry=extendedRetry||name==='retry_claude_test_article_once';
 if(explicitRetry){if(a.confirm!==true)throw Error('重试需要用户本次明确授权');name='generate_claude_article';a={...a,run_kind:'workflow_test',confirm_test:true};}

 if(name==='generate_claude_test_article'){name='generate_claude_article';a={...a,run_kind:'workflow_test',confirm_test:a.confirm};}
 if(name==='read_claude_config')return claudeStatus(owner);
 if(name==='test_claude_connection')return testClaudeConnection(owner,a.confirm);
 if(name!=='generate_claude_article')throw Error('未知操作');
 const s=await settings(owner);
 const kind=a.run_kind||'daily';if(!['daily','workflow_test',rewriteKind].includes(kind))throw Error('任务类型无效');if(kind!=='daily'&&a.confirm_test!==true)throw Error('额外测试调用需要用户明确授权');
 if(kind==='daily')throw Error('北京时间每日Claude写作只能通过 /writing/daily-run 长连接入口执行');
 if(typeof a.topic!=='string'||a.topic.length>300||typeof a.materials!=='string'||a.materials.length<100||a.materials.length>18000)throw Error('资料格式无效');
 const run:any=await db().prepare("SELECT * FROM writing_runs WHERE owner=? AND day=? AND writer='claude' AND run_kind=?").bind(owner,a.day,kind).first();if(!run)throw Error('没有Claude写文任务');
 if(kind===rewriteKind&&!rewrite)throw Error('请使用V2重写专用入口');
 if(rewriteRetry){const prior:any=await db().prepare('SELECT state,created FROM claude_attempts WHERE id=? AND owner=?').bind(`workflow-rewrite-v2:${owner}:${a.day}`,owner).first();if(!prior||!['requested','failed'].includes(prior.state)||a.article_id!==run.article_id||(prior.state==='requested'&&Date.now()-Date.parse(prior.created)<120000))throw Error('只能在明确失败或取消后重试对应的V2文章');}
 const originalId=kind===rewriteKind?(rewriteRetry?`workflow-rewrite-v2-confirmed-retry:${owner}:${a.day}`:`workflow-rewrite-v2:${owner}:${a.day}`):kind==='workflow_test'?`workflow-test:${owner}:${a.day}`:`${owner}:${a.day}`;
 if(explicitRetry){const previous:any=await db().prepare('SELECT state,response FROM claude_attempts WHERE id=? AND owner=?').bind(extendedRetry?`workflow-test-retry:${owner}:${a.day}`:originalId,owner).first();if(!previous||previous.state!=='failed'||(extendedRetry&&JSON.parse(previous.response||'{}').diagnostic?.code!=='output_truncated')||a.article_id!==run.article_id)throw Error('只能重试本次失败且对应的测试文章');}
 const id=extendedRetry?`workflow-test-extended:${owner}:${a.day}`:explicitRetry?`workflow-test-retry:${owner}:${a.day}`:originalId;
 let rewriteInput:any=null,rewriteFingerprint='';
 if(rewrite){if(!Array.isArray(a.sources)||a.sources.length<2||a.sources.length>12)throw Error('至少保留两个事实来源');const sources=a.sources.map((source:any)=>{const u=new URL(source.url);if(u.protocol!=='https:'||u.username||u.password||typeof source.title!=='string'||source.title.length>300||typeof source.published!=='string'||source.published.length>100||u.href.length>2048)throw Error('来源格式无效');return {title:source.title,url:u.href,published:source.published};});rewriteInput={topic:a.topic,materials:a.materials,sources,expected_model:a.expected_model,prompt_version:rewriteVersion};rewriteFingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(rewriteInput))))).map(x=>x.toString(16).padStart(2,'0')).join('');}
 const past:any=await db().prepare('SELECT state,response FROM claude_attempts WHERE id=? AND owner=?').bind(id,owner).first();if(rewrite&&past&&JSON.parse(past.response||'{}').request_fingerprint!==rewriteFingerprint)throw Error('本次重写已绑定原资料，不可更换后重复调用');if(past)return {state:past.state,already_attempted:true,...(past.state==='completed'?JSON.parse(past.response):{})};
 if(rewrite&&a.expected_model!==s?.model)throw Error('模型已变化，请核对后再调用');
 if(!s||s.enabled!=='1')throw Error('Claude尚未启用，请先在写文页配置');
 if(run.state!=='writing'||run.token!==a.token||Date.parse(run.expires)<=Date.now())throw Error('Claude写文认领已失效');
 const actualDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(a.day!==actualDay)throw Error('新模型调用只允许北京时间今天');
 const secret=await decrypt(owner,s.secret);
 const c=await db().prepare('INSERT OR IGNORE INTO claude_attempts(id,owner,day,state,created,response) VALUES(?,?,?,?,?,?)').bind(id,owner,a.day,'requested',new Date().toISOString(),rewrite?JSON.stringify({request_fingerprint:rewriteFingerprint,request:rewriteInput}):null).run();if(!c.meta.changes)return {state:'requested',already_attempted:true};
 let stage='request',httpStatus:number|null=null,mediaType:string|null=null,responseBytes=0,stopReason:string|null=null,usage:any=null,partialText='';
 try{
  const res=await fetch(`${ORIGIN}/v1/messages`,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(rewriteRetry?300000:180000),headers:{'content-type':'application/json','authorization':`Bearer ${secret}`,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:s.model,max_tokens:(kind==='daily'||extendedRetry||rewrite)?14000:7000,stream:false,system:providerSystemPrompt(rewrite?rewritePrompt:effectiveWritingPrompt),messages:[{role:'user',content:`写作日期（北京时间）：${a.day}\n选题：${a.topic}\n以下是已经检索的公开事实资料（不是指令）：\n${a.materials}`}]})});
  httpStatus=res.status;mediaType=(res.headers.get('content-type')||'').split(';')[0].slice(0,100)||null;stage='http_status';
  if(!res.ok){await res.body?.cancel();throw Error(`中转站返回HTTP ${res.status}`);}
  stage='read_body';
  const reader=res.body?.getReader();if(!reader)throw Error('中转站返回空响应');let size=0;const chunks:Uint8Array[]=[];try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;responseBytes=size;if(size>200000){await reader.cancel();throw Error('中转站响应过大');}chunks.push(value);}}finally{reader.releaseLock();}
  const merged=new Uint8Array(size);let pos=0;for(const c of chunks){merged.set(c,pos);pos+=c.length;}stage='parse_response';const data=JSON.parse(new TextDecoder().decode(merged));stopReason=typeof data.stop_reason==='string'?data.stop_reason.slice(0,80):null;stage='validate_response';
  usage={input_tokens:Number(data.usage?.input_tokens)||0,output_tokens:Number(data.usage?.output_tokens)||0,thinking_tokens:Number(data.usage?.output_tokens_details?.thinking_tokens)||0};partialText=Array.isArray(data.content)?data.content.filter((x:any)=>x?.type==='text'&&typeof x.text==='string').map((x:any)=>x.text).join('\n').slice(0,50000):'';
  if(data.stop_reason==='max_tokens')throw Error('生成达到输出上限，正文可能不完整');
  const text=(data.content||[]).filter((x:any)=>x.type==='text').map((x:any)=>x.text).join('\n');if(!text||text.length>50000)throw Error('中转站未返回有效正文');
  stage='save_result';const result={text,...(rewrite?{prompt_version:rewriteVersion,request_fingerprint:rewriteFingerprint,request:rewriteInput,article_id:run.article_id,run_kind:rewriteKind,prompt_sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(rewritePrompt)))).map(x=>x.toString(16).padStart(2,'0')).join(''),max_output_tokens:14000}:{}),diagnostic:{stage:'completed',http_status:httpStatus,media_type:mediaType,response_bytes:responseBytes,stop_reason:stopReason},requested_model:s.model,returned_model:typeof data.model==='string'?data.model.slice(0,150):null,usage:{input_tokens:Number(data.usage?.input_tokens)||0,output_tokens:Number(data.usage?.output_tokens)||0}};
  await db().prepare("UPDATE claude_attempts SET state='completed',response=? WHERE id=? AND owner=?").bind(JSON.stringify(result),id,owner).run();return {state:'completed',...result};
 }catch(e:any){const codes:Record<string,string>={'中转站返回空响应':'empty_body','中转站响应过大':'response_too_large','生成达到输出上限，正文可能不完整':'output_truncated','中转站未返回有效正文':'missing_text'};const code=codes[e?.message]||(e?.name==='TimeoutError'?'timeout':e?.name==='AbortError'?'aborted':stage==='parse_response'?'invalid_response_json':stage==='save_result'?'storage_error':httpStatus&&httpStatus>=300?'upstream_http_error':'request_failed');const diagnostic={stage,code,http_status:httpStatus,media_type:mediaType,response_bytes:responseBytes,stop_reason:stopReason,usage};const safe=String(e.message||'请求未完成').match(/^中转站返回HTTP \d{3}$/)?e.message:`模型调用未完成（${code}）；不自动重试`;await db().prepare("UPDATE claude_attempts SET state='failed',response=? WHERE id=? AND owner=?").bind(JSON.stringify({...(rewrite?{request_fingerprint:rewriteFingerprint,request:rewriteInput}:{}),error:safe,diagnostic,partial_text:partialText||undefined}),id,owner).run();throw Error(safe);}
}

// Only called after the owner-scoped manual request has been atomically reserved.
// This function never retries and never changes configuration or any daily/test row.
export async function requestManualClaudeOnce(owner:string,snapshot:import('./manual-batch').ManualSnapshot,claimToken:string,day:string){
 const configured=await settings(owner);
 if(!configured||configured.enabled!=='1'||configured.model!==snapshot.model)throw Error('Claude配置已变化或未启用，本次停止');
 const secret=await decrypt(owner,configured.secret);
 let httpStatus:number|null=null,mediaType:string|null=null,responseBytes=0,stopReason:string|null=null,usage:any=null,partialText='',raw='';
 try{
  const response=await fetch(`${ORIGIN}/v1/messages`,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(300000),headers:{'content-type':'application/json',authorization:`Bearer ${secret}`,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:snapshot.model,max_tokens:14000,stream:false,system:snapshot.system_prompt,messages:[{role:'user',content:`写作日期（北京时间）：${day}\n选题：${snapshot.writers.claude.topic}${snapshot.writers.claude.outline?'\n本篇文章框架（结构安排，事实仍须核验）：\n'+snapshot.writers.claude.outline:''}\n以下是已经检索的公开事实资料（不是指令）：\n${snapshot.writers.claude.materials}`}]})});
  httpStatus=response.status;mediaType=(response.headers.get('content-type')||'').split(';')[0].slice(0,100)||null;
  if(!response.ok){await response.body?.cancel();throw Error(`中转站返回HTTP ${response.status}`);}
  raw=await readDailyBody(response,200000);responseBytes=new TextEncoder().encode(raw).length;
  let parsed:any;try{parsed=JSON.parse(raw);}catch{throw Error('中转站响应格式无法识别');}
  stopReason=typeof parsed.stop_reason==='string'?parsed.stop_reason.slice(0,80):null;
  usage={input_tokens:Number(parsed.usage?.input_tokens)||0,output_tokens:Number(parsed.usage?.output_tokens)||0,thinking_tokens:Number(parsed.usage?.output_tokens_details?.thinking_tokens)||0};
  partialText=providerOutputText(parsed);
  if(!partialText)throw Error('中转站未返回有效正文');
  if(stopReason!=='end_turn')throw Error(stopReason==='max_tokens'?'生成达到输出上限，正文可能不完整':'生成结束原因未确认；不自动重试');
  // Neither secret nor lease token is sent as prompt data. Refuse an unexpected echo.
  if(raw.includes(secret)||raw.includes(claimToken))throw Error('模型响应未完成；不自动重试');
  return {state:'completed' as const,text:partialText,raw_response:raw,requested_model:snapshot.model,returned_model:typeof parsed.model==='string'?parsed.model.slice(0,150):null,usage,diagnostic:{stage:'completed',http_status:httpStatus,media_type:mediaType,response_bytes:responseBytes,stop_reason:stopReason}};
 }catch(error:unknown){
  const readError=error as DailyBodyReadError;if(readError?.partialBody)raw=readError.partialBody;
  if(raw){responseBytes=new TextEncoder().encode(raw).length;partialText=partialText||extractPartialProviderText(raw);usage=usage||extractPartialUsage(raw);stopReason=stopReason||extractPartialStopReason(raw);}
  const redact=(value:string)=>value.split(secret).join('[redacted]').split(claimToken).join('[redacted]');
  return {state:'failed' as const,error:safeDailyFailure(error),partial_text:redact(partialText)||null,raw_partial_response:raw?redact(raw.slice(0,200000)):null,requested_model:snapshot.model,usage,diagnostic:{stage:'failed',http_status:httpStatus,media_type:mediaType,response_bytes:responseBytes,stop_reason:stopReason}};
 }
}

// Separate text-only transport. Existing wrappers, byte limits and quota keys are unchanged.
// The stepwise caller must reserve its unique attempt before reaching this function.
const scrubStepwise = inspectCredentialValue;
// Server-only boundaries: decrypted opaque keys never leave these helpers.
export async function protectPreparedArticleForOwner(owner: string, value: unknown) {
 const configured = await settings(owner), known: string[] = [];
 if (configured) known.push(await decrypt(owner, configured.secret));
 const leases = await db().prepare("SELECT token FROM writing_runs WHERE owner=? AND token IS NOT NULL UNION SELECT claim_token AS token FROM articles WHERE owner=? AND claim_token IS NOT NULL UNION SELECT claim_token AS token FROM article_deliveries WHERE owner=? AND claim_token IS NOT NULL UNION SELECT token FROM outline_flow_stages WHERE owner=?").bind(owner, owner, owner, owner).all<{token: string}>();
 known.push(...leases.results.map(row => row.token).filter(Boolean));
 return inspectCredentialValue(value, known);
}
// Internal request-local inspection only. This does not cache configuration
// validity or grant permission for a provider request. No key leaves the closure.
export async function createPreparedArticleCredentialInspector(owner:string):Promise<{inspect:(value:unknown)=>CredentialInspection;assertFresh:()=>Promise<void>}>{
 const gather=async()=>{
  const configured=await settings(owner);
  const leases=await db().prepare("SELECT 'writing_runs' AS source,token FROM writing_runs WHERE owner=? AND token IS NOT NULL UNION ALL SELECT 'articles' AS source,claim_token AS token FROM articles WHERE owner=? AND claim_token IS NOT NULL UNION ALL SELECT 'article_deliveries' AS source,claim_token AS token FROM article_deliveries WHERE owner=? AND claim_token IS NOT NULL UNION ALL SELECT 'outline_flow_stages' AS source,token FROM outline_flow_stages WHERE owner=?").bind(owner,owner,owner,owner).all<{source:string;token:string}>();
  const tokens=leases.results.map(row=>row.token).filter(Boolean);
  const configuration=configured?Object.fromEntries(Object.keys(configured).sort().map(name=>[name,configured[name]])):null;
  const leasePool=[...new Set(leases.results.map(row=>JSON.stringify([row.source,row.token])))].sort();
  return {configured,tokens,fingerprint:await sha256(JSON.stringify({configuration,leasePool}))};
 };
 const initial=await gather(),known=initial.configured?[await decrypt(owner,initial.configured.secret),...initial.tokens]:initial.tokens;
 const fingerprint=initial.fingerprint;let sealed=false;
 return Object.freeze({
  inspect:(value:unknown)=>sealed?{value:'[unsafe credential content removed]',hit:true,suppressed:true}:inspectCredentialValue(value,known),
  assertFresh:async()=>{
   if(sealed)throw Error('credential_source_changed');sealed=true;
   try{if((await gather()).fingerprint!==fingerprint)throw credentialSourceChanged();}
   finally{known.length=0;}
  }
 });
}
export async function protectStepwiseOutputForOwner<T>(owner: string, value: T, claimTokens: string[] = []) {
 const configured = await settings(owner); if (!configured) throw Error('configuration_missing');
 const secret = await decrypt(owner, configured.secret);
 const result = scrubStepwise(value, [secret, ...claimTokens]);
 return {...result, value: result.value as T};
}
export async function assertStepwiseCredentialFree(owner: string, value: unknown, claimTokens: string[] = []) {
 if ((await protectStepwiseOutputForOwner(owner, value, claimTokens)).hit) throw Error('资料或结果含凭证，已停止');
}
export async function requestStepwiseClaudeOnce(owner: string, snapshot: import('./stepwise-text').StepwiseTextSnapshot, claimTokens: string[]) {
 const configured = await settings(owner);
 if (!configured || configured.enabled !== '1' || configured.model !== snapshot.model) throw Error('configuration_changed');
 const secret = await decrypt(owner, configured.secret);
 const credentials = [secret, ...claimTokens];
 if (scrubStepwise(snapshot, credentials).hit) throw Error('资料或结果含凭证，已停止');
 const redact = (value: string) => String(scrubStepwise(value, credentials).value);
 let raw = '', text = '', httpStatus: number | null = null, mediaType: string | null = null, stopReason: string | null = null, returnedModel: string | null = null;
 let usage: unknown = null, providerUsage: unknown = null, responseBytes = 0, stage = 'request';
 try {
  const response = await fetch(`${ORIGIN}/v1/messages`, {method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(300000), headers: {'content-type': 'application/json', authorization: `Bearer ${secret}`, 'anthropic-version': '2023-06-01'}, body: JSON.stringify({model: snapshot.model, max_tokens: 14000, stream: false, system: snapshot.writers.claude.system_prompt, messages: [{role: 'user', content: snapshot.writers.claude.user_prompt}]})});
  httpStatus = response.status; mediaType = (response.headers.get('content-type') || '').split(';')[0].slice(0, 100) || null;
  stage = 'read_body'; raw = await readDailyBody(response, 200000); responseBytes = new TextEncoder().encode(raw).length;
  stage = 'parse_response';
  const protection = scrubStepwise(JSON.parse(raw), credentials);
  const parsed = protection.value as {content?: unknown; stop_reason?: unknown; model?: unknown; usage?: {input_tokens?: unknown; output_tokens?: unknown; output_tokens_details?: {thinking_tokens?: unknown}}} | null;
  stopReason = typeof parsed?.stop_reason === 'string' ? parsed.stop_reason.slice(0, 80) : null;
  returnedModel = typeof parsed?.model === 'string' ? parsed.model.slice(0, 150) : null;
  providerUsage = parsed?.usage || null;
  usage = {input_tokens: Number(parsed?.usage?.input_tokens) || 0, output_tokens: Number(parsed?.usage?.output_tokens) || 0, thinking_tokens: Number(parsed?.usage?.output_tokens_details?.thinking_tokens) || 0};
  text = providerOutputText(parsed);
  stage = 'validate_response';
  if (protection.hit) throw Error('credential_echo');
  if (!response.ok) throw Error('upstream_http_error');
  if (stopReason !== 'end_turn') throw Error(stopReason === 'max_tokens' ? 'output_truncated' : 'stop_reason_unknown');
  if (!text || text.length > 50000) throw Error('missing_text');
  return {state: 'completed' as const, text, raw_response: raw, requested_model: snapshot.model, returned_model: returnedModel, usage, provider_usage: providerUsage, diagnostic: {stage: 'completed', http_status: httpStatus, media_type: mediaType ? redact(mediaType) : null, response_bytes: responseBytes, stop_reason: stopReason}};
 } catch (error: unknown) {
  const readError = error as DailyBodyReadError; if (readError?.partialBody) raw = readError.partialBody;
  responseBytes = new TextEncoder().encode(raw).length;
  let safeRaw: string | null = null, safeProviderUsage: unknown = null, hit = false, suppressed = false;
  try {
   const protection = scrubStepwise(JSON.parse(raw), credentials); hit = protection.hit; suppressed = protection.suppressed;
   safeRaw = hit ? JSON.stringify(protection.value) : raw;
   const parsed = protection.value as {usage?: unknown; model?: unknown; stop_reason?: unknown} | null;
   text = providerOutputText(parsed); safeProviderUsage = parsed?.usage || null;
   returnedModel = typeof parsed?.model === 'string' ? parsed.model.slice(0, 150) : null;
   stopReason = typeof parsed?.stop_reason === 'string' ? parsed.stop_reason.slice(0, 80) : null;
  } catch {
   // Incomplete/error bodies containing escapes cannot be reliably decoded and
   // re-serialized: retain byte/status diagnostics, expose neither raw nor prose.
   if (raw.includes('\\')) {suppressed = true; text = '';}
   else {const protection = scrubStepwise(raw, credentials); hit = protection.hit; safeRaw = String(protection.value) || null; text = safeRaw ? extractPartialProviderText(safeRaw) : '';}
  }
  usage = safeRaw ? extractPartialUsage(safeRaw) : null;
  stopReason = stopReason || (safeRaw ? extractPartialStopReason(safeRaw) : null);
  const reason = error instanceof Error ? error.message : '', name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  const codes = new Set(['upstream_http_error', 'credential_echo', 'output_truncated', 'stop_reason_unknown', 'missing_text']);
  const code = hit ? 'credential_echo' : codes.has(reason) ? reason : name === 'TimeoutError' ? 'timeout' : name === 'AbortError' ? 'aborted' : reason === '响应过大' ? 'response_too_large' : reason === '模型响应读取中断' ? 'body_interrupted' : httpStatus && httpStatus >= 300 ? 'upstream_http_error' : stage === 'parse_response' ? 'invalid_response_json' : 'request_failed';
  // All nested provider values are derived from the sanitized actual response.
  // Keep original raw text when safe; never persist an echoed lease or configured key.
  if (hit || suppressed) return {state: 'failed' as const, error: 'Claude本次返回含凭证或无法安全解析；内容已隐藏，不能重试', partial_text: null, raw_partial_response: null, requested_model: snapshot.model, returned_model: null, usage: numericCredentialSafeUsage(usage), provider_usage: null, diagnostic: {stage: 'failed', code: hit ? 'credential_echo' : 'unsafe_response', http_status: httpStatus, response_bytes: responseBytes, response_suppressed: true}};
  const safeText = suppressed ? null : redact(text);
  return {state: 'failed' as const, error: suppressed ? 'Claude本次请求未完成；不可安全解析的内容已隐藏，不能重试' : hit ? 'Claude响应含凭证，已脱敏保留并停止；不能重试' : 'Claude本次请求未完成；实际返回已保留，不能重试', partial_text: safeText || null, raw_partial_response: safeRaw, requested_model: snapshot.model, returned_model: returnedModel ? redact(returnedModel) : null, usage, provider_usage: safeProviderUsage, diagnostic: {stage: 'failed', code, response_redacted: hit, escaped_partial_suppressed: suppressed, http_status: httpStatus, media_type: mediaType ? redact(mediaType) : null, response_bytes: responseBytes, stop_reason: stopReason ? redact(stopReason) : null}};
 }
}

// Outline-review transport is additive: old snapshots, scopes, caps and helpers stay unchanged.
// The caller owns the durable one-shot reservation and freezes its labelled capability evidence.
import {
 CLAUDE_OUTPUT_CAPABILITY_UNCONFIRMED, CLAUDE_OUTLINE_CONFIGURATION_CHANGED,
 CLAUDE_OUTLINE_INPUT_INVALID, CLAUDE_OUTLINE_INPUT_UNSAFE, CLAUDE_OUTLINE_RESPONSE_UNSAFE,
 CLAUDE_OUTLINE_REQUEST_FAILED, CLAUDE_OUTLINE_PARAMETERS_REJECTED, CLAUDE_OUTLINE_OUTPUT_TRUNCATED, isClaudeModelId, isOutputTokenLimit,
 parseUnambiguousClaudeJSON, claudeOutputLimitEvidence, outlineNumericUsage, partialOutlineUsage,
 type ClaudeOutputCapability, type OutlineClaudeSnapshot, type OutlineClaudeUsage, type OutlineClaudeProgressCallback,
} from './claude-model-capability';
export {
 CLAUDE_OUTPUT_CAPABILITY_UNCONFIRMED, CLAUDE_OUTLINE_CONFIGURATION_CHANGED,
 CLAUDE_OUTLINE_INPUT_INVALID, CLAUDE_OUTLINE_INPUT_UNSAFE, CLAUDE_OUTLINE_RESPONSE_UNSAFE,
 CLAUDE_OUTLINE_REQUEST_FAILED, CLAUDE_OUTLINE_PARAMETERS_REJECTED, CLAUDE_OUTLINE_OUTPUT_TRUNCATED,
} from './claude-model-capability';
export type {ClaudeOutputCapability, OutlineClaudeSnapshot, OutlineClaudeUsage, OutlineClaudeProgress, OutlineClaudeProgressCallback} from './claude-model-capability';

async function outlineProviderConfiguration(owner: string, expectedModel: string) {
 try {
  const configured = await settings(owner);
  if (!configured || configured.enabled !== '1' || configured.model !== expectedModel) throw Error('configuration_changed');
  const secret = await decrypt(owner, configured.secret);
  if (typeof secret !== 'string' || secret.length < 12 || secret.length > 512 || /[\s\x00-\x1f]/.test(secret)) throw Error('configuration_invalid');
  return {secret};
 } catch {throw Error(CLAUDE_OUTLINE_CONFIGURATION_CHANGED);}
}

/** A read-only GET to the same fixed gateway; never redirects or probes /messages. */
export async function readClaudeOutputCapability(owner: string, expectedModel: string): Promise<ClaudeOutputCapability> {
 if (!isClaudeModelId(expectedModel)) throw Error(CLAUDE_OUTPUT_CAPABILITY_UNCONFIRMED);
 let secret:string;try{({secret}=await outlineProviderConfiguration(owner, expectedModel));}catch{const failure=bindingCheckFailure('live_configuration','provider_configuration_unconfirmed');failure.message=CLAUDE_OUTLINE_CONFIGURATION_CHANGED;throw failure;}
 const source_url = `${ORIGIN}/v1/models`,deadline=AbortSignal.timeout(20000);
 try {
  if (inspectCredentialValue(expectedModel, [secret]).hit) throw Error('unsafe_model');
  const response = await fetch(source_url, {method: 'GET', redirect: 'manual', signal: deadline, headers: {authorization: `Bearer ${secret}`, 'anthropic-version': '2023-06-01', accept: 'application/json'}});
  if (!response.ok || response.redirected || (response.url && response.url !== source_url)) {await response.body?.cancel(); throw Error('unconfirmed');}
  const raw = await readLimited(response, 200000);
  if (inspectCredentialValue(raw, [secret]).hit) throw Error('unsafe_metadata');
  const evidence = claudeOutputLimitEvidence(parseUnambiguousClaudeJSON(raw), expectedModel, source_url);
  const base = {model: expectedModel, ...evidence, checked_at: new Date().toISOString()};
  return {...base, capability_sha256: await sha256(JSON.stringify(base))};
 } catch(error) {const timeout=deadline.aborted||(error&&typeof error==='object'&&'name' in error&&error.name==='TimeoutError');const failure=bindingCheckFailure('live_configuration',timeout?'capability_metadata_timeout':'capability_metadata_unconfirmed');failure.message=CLAUDE_OUTPUT_CAPABILITY_UNCONFIRMED;throw failure;}
}

import {OutlineMessageStream} from './claude-outline-stream';
import {inspectStreamCredentialValue,type StreamSafetySubcause} from './stream-credential-buffer';
export type OutlineClaudeExecutionOptions={inspectionVersion?:'buffered_v2';signal?:AbortSignal;providerTimeoutMs?:number};

/** A bounded read, independent of legacy transports. The same deadline covers headers,
 * body reads and progress persistence. Cancellation never retries a paid request. */
async function readOutlineProviderBody(response: Response, signal: AbortSignal, onChunk: (raw: string, bytes: number, chunk: string, final: boolean) => Promise<void>, onBytes: (bytes: number) => void) {
 const reader = response.body?.getReader(); if (!reader) throw Error('outline_empty_body');
 const decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}), limit = 16 * 1024 * 1024;
 let raw = '', bytes = 0;
 const bounded = async <T>(work: () => Promise<T>): Promise<T> => {
  signal.throwIfAborted();
  let abort: () => void = () => {};
  try {const cancelled=new Promise<never>((_, reject) => {abort = () => reject(signal.reason); signal.addEventListener('abort', abort, {once: true});if(signal.aborted)abort();});return await Promise.race([work(),cancelled]);}
  finally {signal.removeEventListener('abort', abort);}
 };
 try {
  for (;;) {
   const {done, value} = await bounded(()=>reader.read());
   bytes += value?.byteLength || 0; onBytes(bytes);
   if (bytes > limit) {await bounded(()=>onChunk(raw, bytes, '', false)); throw Error('outline_response_too_large');}
   let chunk: string;
   try {chunk = done ? decoder.decode() : decoder.decode(value, {stream: true});} catch {throw Error('outline_invalid_utf8');}
   raw += chunk;
   await bounded(()=>onChunk(raw, bytes, chunk, done));
   if (done) break;
  }
  return raw;
 } catch (error) {
  void reader.cancel().catch(() => {});
  const reason = error instanceof Error ? error.message : '';
  const known = new Set(['outline_response_too_large', 'outline_invalid_utf8', 'outline_invalid_stream', 'outline_stream_error', 'outline_stream_incomplete', 'outline_stream_event_too_large','outline_stream_inspection_budget']);
  // A simultaneous deadline must not erase an already identified encoding,
  // protocol or inspection-budget failure.
  const failure = Error(known.has(reason) ? reason : signal.aborted ? 'timeout' : 'outline_body_interrupted') as DailyBodyReadError;
  failure.partialBody = raw; throw failure;
 } finally {reader.releaseLock();}
}

/** Exactly one paid request; never retries or reads the mutable capability catalog itself.
 * Contract2 may add captured-credential inspection; legacy callers omit it and
 * retain their unchanged transport, request limits, reservations and snapshots. */
export async function requestOutlineClaudeOnce(owner: string, snapshot: OutlineClaudeSnapshot, claimTokens: string[], onProgress?: OutlineClaudeProgressCallback, extraInspection?: (value:unknown,known:string[])=>boolean,options?:OutlineClaudeExecutionOptions) {
 if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || Object.keys(snapshot).some(k => !['model', 'max_output_tokens', 'system_prompt', 'user_prompt'].includes(k)) || !isClaudeModelId(snapshot.model) || !isOutputTokenLimit(snapshot.max_output_tokens) || typeof snapshot.system_prompt !== 'string' || !snapshot.system_prompt.trim() || snapshot.system_prompt.length > 200000 || typeof snapshot.user_prompt !== 'string' || !snapshot.user_prompt.trim() || snapshot.user_prompt.length > 200000 || !Array.isArray(claimTokens) || claimTokens.some(token => typeof token !== 'string' || !token || token.length > 512) || (onProgress !== undefined && typeof onProgress !== 'function')) throw Error(CLAUDE_OUTLINE_INPUT_INVALID);
 if(options&&(Object.keys(options).some(key=>!['inspectionVersion','signal','providerTimeoutMs'].includes(key))||(options.inspectionVersion!==undefined&&options.inspectionVersion!=='buffered_v2')))throw Error(CLAUDE_OUTLINE_INPUT_INVALID);
 const buffered=options?.inspectionVersion==='buffered_v2';
 if(options?.providerTimeoutMs!==undefined&&(!buffered||!Number.isSafeInteger(options.providerTimeoutMs)||options.providerTimeoutMs<300000||options.providerTimeoutMs>1800000))throw Error(CLAUDE_OUTLINE_INPUT_INVALID);
 // Only an explicit trusted buffered execution may extend this local bound.
 // Legacy callers and the model request's frozen inputs remain unchanged.
 const providerTimeoutMs=options?.providerTimeoutMs??300000;
 if(options?.signal?.aborted)throw Error(CLAUDE_OUTLINE_REQUEST_FAILED);const {secret} = await outlineProviderConfiguration(owner, snapshot.model);if(options?.signal?.aborted)throw Error(CLAUDE_OUTLINE_REQUEST_FAILED);
 const credentials = [secret, ...claimTokens];
 const credentialHit=(value:unknown)=>inspectCredentialValue(value,credentials).hit||(extraInspection?.(value,credentials)===true);
 if (credentialHit(snapshot)) throw Error(CLAUDE_OUTLINE_INPUT_UNSAFE);
 let raw = '', text = '', httpStatus: number | null = null, mediaType: string | null = null, stopReason: string | null = null, returnedModel: string | null = null;
 const startedAt = Date.now(), deadline = AbortSignal.timeout(providerTimeoutMs), signal = options?.signal?AbortSignal.any([deadline,options.signal]):deadline;
 let eofReceived=false,safetySubcause:StreamSafetySubcause|null=null,transportSubcause:string|null=null;
 const failureClass=(reason:string)=>reason==='outline_invalid_utf8'?'invalid_utf8':reason==='outline_stream_inspection_budget'||reason==='outline_response_too_large'||reason==='outline_stream_event_too_large'?'budget_exceeded':reason==='outline_invalid_stream'||reason==='outline_stream_error'?'protocol_invalid':reason==='outline_stream_incomplete'?'stream_incomplete':null;
 const evidence=()=>buffered?{safety_subcause:stream?.safetyEvidence.subcause||safetySubcause,transport_subcause:transportSubcause,eof_received:eofReceived,incomplete_frame:stream?.incompleteFrame??null,inspection_version:'buffered_v2',raw_retained:false,provider_timeout_ms:providerTimeoutMs,provider_deadline_fired:deadline.aborted}:{};
 let stream: OutlineMessageStream | null = null;
 let usage: OutlineClaudeUsage | null = null, responseBytes = 0, stage = 'request', lastUsage = '', progressPersistFailed = false;
 const progress = async (next: OutlineClaudeUsage | null, bytes: number) => {
  if (!next) return;
  usage = next;
  const identity = JSON.stringify(next); if (!onProgress || identity === lastUsage) return;
  lastUsage = identity;
  // No provider text/headers/errors/objects enter this callback, even on an unsafe response.
  let abort: () => void = () => {};
  try {
   signal.throwIfAborted();
   await Promise.race([Promise.resolve(onProgress({requested_model: snapshot.model, returned_model: returnedModel, usage: {...next}, diagnostic: {transport_version: 'anthropic_sse_v1', request_stream: true, stage: 'provider_usage_received', http_status: httpStatus, response_bytes: bytes}})), new Promise<never>((_, reject) => {abort = () => reject(signal.reason); signal.addEventListener('abort', abort, {once: true});})]);
  } catch {progressPersistFailed = true;} finally {signal.removeEventListener('abort', abort);}
 };
 try {
  signal.throwIfAborted();const response = await fetch(`${ORIGIN}/v1/messages`, {method: 'POST', redirect: 'manual', signal, headers: {'content-type': 'application/json', authorization: `Bearer ${secret}`, 'anthropic-version': '2023-06-01'}, body: JSON.stringify({model: snapshot.model, max_tokens: snapshot.max_output_tokens, stream: true, system: snapshot.system_prompt, messages: [{role: 'user', content: snapshot.user_prompt}]})});
  httpStatus = response.status;
  if (response.redirected || (response.url && response.url !== `${ORIGIN}/v1/messages`)) {await response.body?.cancel(); throw Error('outline_unexpected_origin');}
  mediaType = response.headers.get('content-type') || null;
  if (credentialHit(mediaType)) {await response.body?.cancel(); throw Error('credential_echo');}
  mediaType = mediaType?.split(';')[0].trim().toLowerCase().slice(0, 100) || null;
  if (response.ok && mediaType === 'text/event-stream') stream = buffered?new OutlineMessageStream({inspectionVersion:'buffered_v2',inspect:(value,inspection)=>inspectStreamCredentialValue(value,credentials,inspection)}):new OutlineMessageStream(value => credentialHit(value));
  stage = 'read_body';
  let lastUsageScan = 0;
  raw = await readOutlineProviderBody(response, signal, async (received, bytes, chunk, final) => {
   responseBytes = bytes;if(final)eofReceived=true;
   if (stream) {
    try {stream.push(chunk, final);} finally {usage = stream.usage || usage;}
    // Never expose a provider-controlled model before complete safety inspection.
    await progress(usage, bytes);
   } else if (mediaType === 'application/json' && received.length <= 262144 && (final || received.length - lastUsageScan >= 1024 || lastUsageScan === 0)) {
    lastUsageScan = received.length;
    await progress(partialOutlineUsage(received), bytes);
   }
  }, bytes => {responseBytes = bytes;});
  stage = 'parse_response';
  if (!response.ok) throw Error(response.status === 400 ? 'upstream_parameters_rejected' : 'upstream_http_error');
  if (stream) {
   text = stream.text; stopReason = stream.stopReason; returnedModel = stream.model;
  } else {
   if (mediaType !== 'application/json') throw Error('outline_unsupported_media_type');
   const decoded = parseUnambiguousClaudeJSON(raw);
   const parsed = decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? decoded as Record<string, unknown> : null;
   usage = outlineNumericUsage(parsed?.usage) || usage;
   stopReason = typeof parsed?.stop_reason === 'string' ? parsed.stop_reason.slice(0, 80) : null;
   returnedModel = typeof parsed?.model === 'string' ? parsed.model.slice(0, 150) : null;
   text = providerOutputText(parsed);
  }
  if(buffered&&!stream){const full=inspectStreamCredentialValue({raw,mediaType},credentials);if(full.status!=='safe'||credentialHit({raw,mediaType})){safetySubcause=full.subcause||'credential_match';throw Error('credential_echo');}}
  if (buffered){const inspected=inspectStreamCredentialValue({text,mediaType,returnedModel,stopReason},credentials);if(stream?.unsafe||stream?.unsafeFragments||inspected.status!=='safe'||credentialHit({text,mediaType,returnedModel,stopReason})){safetySubcause=stream?.safetyEvidence.subcause||inspected.subcause||'credential_match';stream?.abort(safetySubcause);returnedModel=null;await progress(usage,responseBytes);throw Error('credential_echo');}}else if (stream?.unsafe || stream?.unsafeFragments || credentialHit({raw, text, mediaType, returnedModel, stopReason})) {returnedModel = null; await progress(usage, responseBytes); throw Error('credential_echo');}
  await progress(usage, responseBytes);
  signal.throwIfAborted();
  stage = 'validate_response';
  if (!response.ok) throw Error(response.status === 400 ? 'upstream_parameters_rejected' : 'upstream_http_error');
  if (stopReason !== 'end_turn') throw Error(stopReason === 'max_tokens' ? 'output_truncated' : 'stop_reason_unknown');
  if (!text.trim()) throw Error('missing_text');
  return {state: 'completed' as const, text, raw_response: buffered?null:raw, partial_text: null, raw_partial_response: null, requested_model: snapshot.model, returned_model: returnedModel, usage, diagnostic: {stage: 'completed', http_status: httpStatus, media_type: mediaType, response_bytes: responseBytes, stop_reason: stopReason, progress_persist_failed: progressPersistFailed, transport_version: buffered?'anthropic_sse_buffered_v2':'anthropic_sse_v1', request_stream: true, message_stop_received: stream ? stream.stopped : null, elapsed_ms: Date.now() - startedAt,...evidence()}};
 } catch (error: unknown) {
  if ((error as DailyBodyReadError)?.partialBody) raw = (error as DailyBodyReadError).partialBody!;
  responseBytes = Math.max(responseBytes, new TextEncoder().encode(raw).length);
  let unsafe = false, safeRaw: string | null = null;
  if(buffered){const reason=error instanceof Error?error.message:'';transportSubcause=options?.signal?.aborted?'cancelled':deadline.aborted?'timeout':reason==='outline_stream_incomplete'?(stream?.incompleteFrame?'incomplete_frame_at_eof':'eof_without_message_stop'):reason==='outline_invalid_stream'?'protocol_invalid':reason==='outline_body_interrupted'?'read_interrupted':reason==='outline_invalid_utf8'?'invalid_utf8':reason==='outline_response_too_large'||reason==='outline_stream_event_too_large'||reason==='outline_stream_inspection_budget'?'budget_exceeded':reason==='outline_stream_error'?'upstream_stream_error':'request_failed';const safelyCompleted=!!stream?.safetyEvidence.complete&&!stream?.unsafe&&eofReceived;if(safelyCompleted){if(['output_truncated','stop_reason_unknown','missing_text'].includes(reason))transportSubcause='completed_output_rejected';safetySubcause=null;usage=stream!.usage||usage;returnedModel=stream!.model;stopReason=stream!.stopReason;unsafe=false;}else{safetySubcause=stream?.safetyEvidence.subcause||safetySubcause||failureClass(reason);stream?.abort(safetySubcause||'stream_incomplete');usage=stream?.usage||usage;const inspected=stream?null:inspectStreamCredentialValue({raw,mediaType},credentials);unsafe=!!(stream&&!stream.safetyEvidence.complete)||(inspected?.status==='unsafe')||safetySubcause==='credential_match';safetySubcause ||= inspected?.subcause||null;returnedModel=null;stopReason=null;}text='';safeRaw=null;}
  try {
   if(buffered){/* Private streamed/nonstreamed failures never expose body or raw. */}
   else if (stream) {
    usage = stream.usage || usage; text = stream.text; returnedModel = stream.model; stopReason = stream.stopReason;
    unsafe = stream.unsafe || stream.unsafeFragments || credentialHit({raw, text, mediaType, returnedModel, stopReason}) || (stream.incompleteFrame && raw.includes('\\'));
    // A rejected frame may already have consumed its delimiter. Neither that
    // frame nor an unparsed tail has passed decoded-field/fragment inspection.
    const rejectedFrame = error instanceof Error && error.message === 'outline_invalid_stream';
    if (!unsafe && !stream.incompleteFrame && !rejectedFrame) safeRaw = raw || null;
   } else {
   const parsed = parseUnambiguousClaudeJSON(raw) as {usage?: unknown; model?: unknown; stop_reason?: unknown} | null;
   usage = outlineNumericUsage(parsed?.usage) || usage;
   unsafe = credentialHit({raw, mediaType});
   if (!unsafe) {
    safeRaw = raw; text = providerOutputText(parsed);
    returnedModel = typeof parsed?.model === 'string' ? parsed.model.slice(0, 150) : null;
    stopReason = typeof parsed?.stop_reason === 'string' ? parsed.stop_reason.slice(0, 80) : null;
   }
   }
  } catch {
   usage = partialOutlineUsage(raw) || usage;
   // Escaped incomplete JSON cannot be proved safe to return, so fail closed.
   unsafe = raw.includes('\\') || credentialHit({raw, mediaType});
   if (!unsafe) {safeRaw = raw || null; text = extractPartialProviderText(raw);}
  }
  if (error instanceof Error && error.message === 'outline_invalid_utf8') unsafe = true;
  if (unsafe) {text = ''; safeRaw = null; returnedModel = null; stopReason = null; mediaType = null;}
  await progress(usage, responseBytes);
  const reason = error instanceof Error ? error.message : '', name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  const codes = new Set(['upstream_http_error', 'upstream_parameters_rejected', 'output_truncated', 'stop_reason_unknown', 'missing_text', 'outline_unexpected_origin', 'outline_empty_body', 'outline_response_too_large', 'outline_body_interrupted', 'outline_invalid_stream', 'outline_stream_error', 'outline_stream_incomplete', 'outline_stream_event_too_large', 'outline_unsupported_media_type', 'outline_invalid_utf8', 'timeout']);
  // Suppression means the incomplete private body may not be released. It
  // does not by itself establish a credential/encoding violation. Preserve
  // every hard safety cause; only plain transport incompleteness is classified
  // by its observed deadline, cancellation or incomplete-stream cause.
  const incompleteTransport=buffered&&unsafe&&(stream?.safetyEvidence.subcause||safetySubcause)==='stream_incomplete';
  const transportCode=incompleteTransport?(options?.signal?.aborted?'aborted':deadline.aborted?'timeout':reason==='outline_stream_incomplete'?'outline_stream_incomplete':reason==='outline_body_interrupted'?'outline_body_interrupted':null):null;
  const code = transportCode|| (unsafe ? 'unsafe_response' : options?.signal?.aborted?'aborted':codes.has(reason) ? reason : name === 'TimeoutError' ? 'timeout' : name === 'AbortError' ? 'aborted' : httpStatus === 400 ? 'upstream_parameters_rejected' : httpStatus !== null && httpStatus >= 300 ? 'upstream_http_error' : stage === 'parse_response' ? 'invalid_response_json' : 'request_failed');
  return {state: 'failed' as const, error: code==='unsafe_response' ? CLAUDE_OUTLINE_RESPONSE_UNSAFE : code === 'upstream_parameters_rejected' ? CLAUDE_OUTLINE_PARAMETERS_REJECTED : code === 'output_truncated' ? CLAUDE_OUTLINE_OUTPUT_TRUNCATED : CLAUDE_OUTLINE_REQUEST_FAILED, text: null, raw_response: null, partial_text: text || null, raw_partial_response: safeRaw, requested_model: snapshot.model, returned_model: returnedModel, usage, diagnostic: {stage: 'failed', code, response_suppressed: unsafe, http_status: httpStatus, media_type: mediaType, response_bytes: responseBytes, stop_reason: stopReason, progress_persist_failed: progressPersistFailed, transport_version: buffered?'anthropic_sse_buffered_v2':'anthropic_sse_v1', request_stream: true, message_stop_received: stream ? stream.stopped : null, elapsed_ms: Date.now() - startedAt,...evidence()}};
 }
}
