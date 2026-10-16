import {normalizeWritingOutline} from './writing-fixed-references';
import {assertNoCredentialText} from './writing-input';
import {db} from './test-store';
import {effectiveWritingPrompt,effectiveWritingStyleVersion} from './writing-supplement';
import {providerSystemPrompt} from './claude-prompt';

// A single user-requested pair. No date loop, caller-selected slot, or new-slot API.
export const manualAuthorizationKey='2026-10-05-web-topics-manual-pair';
export const manualAuthorizationLabel='2026-10-05 网页选题双作者手动请求';
export const manualKind=(runId:string)=>`manual:${runId}`;
export const manualAttemptId=(owner:string,runId:string)=>`manual:${owner}:${runId}:claude`;
export const manualAliases:Record<string,string>={claim_manual_writing:'claim_writing_run',save_manual_writing_article:'save_writing_article',submit_manual_writing_article:'submit_writing_article'};
export type ManualSource={title:string;url:string;published:string};
export type ManualTopic={topic:string;materials:string;outline?:string;sources:ManualSource[];writing_prompt:string;prompt_version:string;prompt_sha256:string};
export type ManualSnapshot={writers:{xiaoyu:ManualTopic;claude:ManualTopic};model:string;expected_model:string;system_prompt:string;system_prompt_sha256:string;max_output_tokens:14000;timeout_ms:300000;max_requests:1};
export type ManualBatch={id:string;owner:string;day:string;input_hash:string;authorization_key:string;snapshot:ManualSnapshot;created:string};
export async function manualHash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export function assertManualKeys(value:unknown,keys:string[]):asserts value is Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw Error('手动批次参数无效');}
export function normalizeManualSources(value:unknown):ManualSource[]{
 if(!Array.isArray(value)||value.length<2||value.length>12)throw Error('来源数量需为2–12条');
 return value.map(source=>{if(!source||typeof source!=='object'||typeof source.url!=='string'||typeof source.title!=='string'||!source.title.trim()||source.title.length>300||typeof source.published!=='string'||!source.published.trim()||source.published.length>100)throw Error('来源格式无效');const u=new URL(source.url);if(u.protocol!=='https:'||u.username||u.password||u.href.length>2048)throw Error('来源格式无效');return {title:source.title,url:u.href,published:source.published};});
}
export async function getManualBatch(owner:string,runId:unknown):Promise<ManualBatch>{
 if(typeof runId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId))throw Error('手动批次编号无效');
 const row=await db().prepare('SELECT * FROM manual_writing_batches WHERE id=? AND owner=? AND authorization_key=?').bind(runId,owner,manualAuthorizationKey).first< Omit<ManualBatch,'snapshot'>&{snapshot:string}>();
 if(!row)throw Error('没有找到本人的本次手动批次');return {...row,snapshot:JSON.parse(row.snapshot)};
}
export async function readManualBatch(owner:string,runId?:unknown){
 if(runId===undefined){const row=await db().prepare('SELECT id FROM manual_writing_batches WHERE owner=? AND authorization_key=?').bind(owner,manualAuthorizationKey).first<{id:string}>();if(!row)return {state:'not_created',authorization:manualAuthorizationLabel,max_batches:1,max_articles_per_writer:1,max_claude_requests:1};runId=row.id;}
 const batch=await getManualBatch(owner,runId);
 const writers=(await db().prepare('SELECT writer,state,article_id,error FROM writing_runs WHERE owner=? AND day=? AND run_kind=? ORDER BY writer').bind(owner,batch.day,manualKind(batch.id)).all()).results;
 return {run_id:batch.id,day:batch.day,authorization:manualAuthorizationLabel,input_hash:batch.input_hash,snapshot:batch.snapshot,writers,created_at:batch.created,max_batches:1,max_articles_per_writer:1,max_claude_requests:1,automatic_retry:false};
}
export async function createManualBatch(owner:string,value:unknown){
 assertManualKeys(value,['confirm','xiaoyu','claude','expected_model','expected_prompt_version']);
 if(value.confirm!==true)throw Error('需明确确认本次小鱼和Claude各一篇；Claude最多调用一次，不重试，仅私人草稿');
 for(const writer of ['xiaoyu','claude']){const topic=value[writer];assertManualKeys(topic,['topic','materials','sources','outline']);if(typeof topic.topic!=='string'||!topic.topic.trim()||topic.topic.length>300||typeof topic.materials!=='string'||topic.materials.length<100||topic.materials.length>18000)throw Error('需先核验并完整填写两位作者各自的选题和资料，再创建本次批次');}
 const xiaoyu=value.xiaoyu as {topic:string;materials:string;sources:unknown;outline?:unknown},claude=value.claude as {topic:string;materials:string;sources:unknown;outline?:unknown};
 const xiaoyuOutline=normalizeWritingOutline(xiaoyu.outline,true),claudeOutline=normalizeWritingOutline(claude.outline,true);
 assertNoCredentialText(xiaoyuOutline||'');assertNoCredentialText(claudeOutline||'');
 if(xiaoyu.topic.trim()===claude.topic.trim())throw Error('双作者需分别冻结不同选题');
 if(value.expected_prompt_version!==effectiveWritingStyleVersion)throw Error('写作提示词已变化，请重新读取完整写作要求');
 const configured=await db().prepare('SELECT model,enabled FROM claude_settings WHERE owner=?').bind(owner).first<{model:string;enabled:string}>();
 if(!configured||configured.enabled!=='1'||configured.model!==value.expected_model)throw Error('Claude配置未启用或模型不一致；不会更换模型或密钥');
 const system_prompt=providerSystemPrompt(effectiveWritingPrompt);
 const prompt={writing_prompt:effectiveWritingPrompt,prompt_version:effectiveWritingStyleVersion,prompt_sha256:await manualHash(effectiveWritingPrompt)};
 const snapshot:ManualSnapshot={writers:{xiaoyu:{topic:xiaoyu.topic,materials:xiaoyu.materials,outline:xiaoyuOutline,sources:normalizeManualSources(xiaoyu.sources),...prompt},claude:{topic:claude.topic,materials:claude.materials,outline:claudeOutline,sources:normalizeManualSources(claude.sources),...prompt}},model:configured.model,expected_model:configured.model,system_prompt,system_prompt_sha256:await manualHash(system_prompt),max_output_tokens:14000,timeout_ms:300000,max_requests:1};
 const inputHash=await manualHash(JSON.stringify(snapshot));
 const runId=crypto.randomUUID(),now=new Date().toISOString(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const inserted=await db().prepare('INSERT OR IGNORE INTO manual_writing_batches(id,owner,authorization_key,day,input_hash,snapshot,created) VALUES(?,?,?,?,?,?,?)').bind(runId,owner,manualAuthorizationKey,day,inputHash,JSON.stringify(snapshot),now).run();
 const stored=await db().prepare('SELECT id,input_hash FROM manual_writing_batches WHERE owner=? AND authorization_key=?').bind(owner,manualAuthorizationKey).first<{id:string;input_hash:string}>();
 if(!stored||stored.input_hash!==inputHash)throw Error('本次唯一手动批次已冻结；不能换资料、换编号或再建批次');
 return {created:!!inserted.meta.changes,cached:!inserted.meta.changes,...await readManualBatch(owner,stored.id)};
}
