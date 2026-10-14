import {db} from './test-store';
import {hashText} from './writing-input';
import {safeDraftLink} from '../components/publish-focus';
import {assertWordCredentialFree} from './word-credentials';
export const historyStart='2026-10-11T16:00:00.000Z';
type Platform='toutiao'|'zhihu';
type Draft={account_id:string;draft_id:string|null;draft_url:string|null;status:string;last_verified_at:string|null;current_existence_rechecked:boolean};
export type HistoryRecord={history_key:string;website_article_id:string|null;mode:string;title:string|null;topic_label:string;completed_at:string;completed_at_precision:string;status:string;word:{sha256:string;image_count:number|null;size_bytes:number|null};platforms:Record<Platform,Draft>;timing?:Record<string,unknown>;evidence:{level:string};public_publication:{status:string;published_at:string|null;published_url:string|null;metrics_24h:null}};
type TimeSource={source:'creator_work_management'|'article_page'|'explicit_platform_state';raw_text:string;timezone:string|null;normalized_at:string|null};
export type PublicationEvidence={article_id:string;status:'published'|'scheduled'|'not_published'|'unknown';status_source:'creator_work_management'|'explicit_platform_state'|'article_page_visibility'|'profile_visibility'|'unknown';status_text:string;time_status:'verified'|'time_conflict'|'unknown';time_sources:TimeSource[]};
export type MetricsObservation={platform:Platform;publication:PublicationEvidence;published_at:string|null;published_url:string;observed_at:string;platform_data_through:string|null;window_start:string|null;window_end:string|null;exposures:number|null;reads:number|null;comments:number|null;likes:number|null;unavailable_reason:string|null;evidence_reference:string};
export type MetricsSnapshot={state:string;due_at:string|null;label:string;public_verified:boolean;read_at?:string};
export class HistoryError extends Error {}
const iso=(value:unknown):value is string=>typeof value==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value));
const hash=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const uuid=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const key=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(value);
function need(value:unknown,message='历史证据格式无效'):asserts value{if(!value)throw new HistoryError(message);}
function draft(raw:unknown,platform:Platform):Draft {
 const value=raw as Draft;need(value&&typeof value==='object');
 need(value.account_id===(platform==='toutiao'?'61556093362':'ren-zhe-ai-chi-yu-52'),'历史账号与本人账号不符');
 need(value.draft_id===null||typeof value.draft_id==='string'&&/^\d{1,24}$/.test(value.draft_id),'草稿编号必须保留为字符串');
 need(['verified_private_draft','not_requested','needs_verification','unknown'].includes(value.status));
 const url=value.draft_url===null?null:safeDraftLink(value.draft_url,platform);need(value.draft_url===null||url);
 if(url)need(url===(platform==='toutiao'?`https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=${value.draft_id}`:`https://zhuanlan.zhihu.com/p/${value.draft_id}/edit`));
 need(value.last_verified_at===null||iso(value.last_verified_at));
 if(value.status==='verified_private_draft')need(url&&iso(value.last_verified_at));
 return {account_id:value.account_id,draft_id:value.draft_id,draft_url:url,status:value.status,last_verified_at:value.last_verified_at,current_existence_rechecked:value.current_existence_rechecked===true};
}
export function normalizeHistory(raw:unknown):HistoryRecord {
 const v=raw as HistoryRecord;need(v&&typeof v==='object'&&key(v.history_key)&&iso(v.completed_at)&&Date.parse(v.completed_at)>=Date.parse(historyStart));
 need(v.website_article_id===null||uuid(v.website_article_id));
 need(['scheduled_biji','manual_trigger_biji','manual_article','manual_word_and_drafts','manual_word_only','website_full_auto','website_semi_auto'].includes(v.mode));
 need(v.title===null||typeof v.title==='string'&&v.title.length>0&&v.title.length<=300);
 need(typeof v.topic_label==='string'&&v.topic_label.length<=300&&['second','minute','unknown'].includes(v.completed_at_precision));
 need(['private_drafts_verified','word_delivered'].includes(v.status));
 need(v.word&&hash(v.word.sha256)&&typeof v.word.image_count==='number'&&Number.isSafeInteger(v.word.image_count)&&v.word.image_count>=0&&typeof v.word.size_bytes==='number'&&Number.isSafeInteger(v.word.size_bytes)&&v.word.size_bytes>0);
 need(v.evidence&&['parent_executed_verified_handoff','local_status_and_submission_ledger_rechecked','site_receipt'].includes(v.evidence.level));
 const platforms={toutiao:draft(v.platforms?.toutiao,'toutiao'),zhihu:draft(v.platforms?.zhihu,'zhihu')};
 if(v.status==='private_drafts_verified')need(Object.values(platforms).every(p=>p.status==='verified_private_draft'));
 // History is a separate attested record, never a business article or grant.
 // Public publication and metrics require their own fresh observation.
 const timing:Record<string,unknown>={};
 for(const field of ['elapsed_seconds','scheduled_to_completion_seconds','writing_to_completion_seconds','request_to_completion_seconds'])if(v.timing?.[field]!==undefined){const n=v.timing[field];need(typeof n==='number'&&Number.isSafeInteger(n)&&n>=0);timing[field]=n;}
 if(v.timing?.writing_to_completion_seconds_range){const range=v.timing.writing_to_completion_seconds_range;need(Array.isArray(range)&&range.length===2&&range.every(n=>Number.isSafeInteger(n)&&n>=0)&&range[0]<=range[1]);timing.writing_to_completion_seconds_range=range;}
 for(const field of ['precision','basis'])if(typeof v.timing?.[field]==='string')timing[field]=String(v.timing[field]).slice(0,100);
 return {history_key:v.history_key,website_article_id:v.website_article_id,mode:v.mode,title:v.title,topic_label:v.topic_label,completed_at:v.completed_at,completed_at_precision:v.completed_at_precision,status:v.status,word:{sha256:v.word.sha256,image_count:v.word.image_count,size_bytes:v.word.size_bytes},platforms,timing,evidence:{level:v.evidence.level},public_publication:{status:'not_observed',published_at:null,published_url:null,metrics_24h:null}};
}
export async function importHistory(owner:string,args:Record<string,unknown>) {
 need(hash(args.evidence_sha256)&&Array.isArray(args.records)&&args.records.length>0&&args.records.length<=25);
 const records=args.records.map(normalizeHistory),stamp=new Date().toISOString();need(new Set(records.map(r=>r.history_key)).size===records.length);
 await assertWordCredentialFree(owner,records);
 // Refuse conflicting evidence instead of silently replacing an old audit.
 for(const record of records){const old=await db().prepare('SELECT record_json,evidence_sha256 FROM article_history WHERE owner=? AND history_key=?').bind(owner,record.history_key).first<{record_json:string;evidence_sha256:string}>();if(old)need(old.record_json===JSON.stringify(record)&&old.evidence_sha256===args.evidence_sha256,'已有历史证据不同，请保留原记录并核对');}
 await db().batch(records.map(record=>db().prepare('INSERT OR IGNORE INTO article_history(owner,history_key,article_id,record_json,evidence_sha256,completed_at,created) VALUES(?,?,?,?,?,?,?)').bind(owner,record.history_key,record.website_article_id,JSON.stringify(record),args.evidence_sha256,new Date(record.completed_at).toISOString(),stamp)));
 for(const record of records){const saved=await db().prepare('SELECT record_json,evidence_sha256 FROM article_history WHERE owner=? AND history_key=?').bind(owner,record.history_key).first<{record_json:string;evidence_sha256:string}>();need(saved?.record_json===JSON.stringify(record)&&saved.evidence_sha256===args.evidence_sha256,'历史保存结果未确认，请读取原记录');}
 return {saved:records.map(r=>r.history_key),business_articles_created:0,platform_actions:0};
}
function publicationURL(value:unknown,platform:Platform) {
 if(typeof value!=='string')return false;
 return platform==='toutiao'?/^https:\/\/www\.toutiao\.com\/article\/\d{10,24}\/?$/.test(value):/^https:\/\/zhuanlan\.zhihu\.com\/p\/\d{1,24}\/?$/.test(value);
}
export function normalizeMetrics(raw:unknown):MetricsObservation {
 const v=raw as MetricsObservation;need(v&&['toutiao','zhihu'].includes(v.platform)&&iso(v.observed_at));
 need(Date.parse(v.observed_at)<=Date.now()+60000,'采集时间不能在未来');need(publicationURL(v.published_url,v.platform),'需要精确文章链接；链接可读不代表已发布');
 const p=v.publication;need(p&&typeof p==='object','需要明确的平台发布状态；登录态主页和文章页面可读不代表已发布');
 need(typeof p.article_id==='string'&&/^\d{1,24}$/.test(p.article_id)&&v.published_url.match(/\/(\d+)\/?$/)?.[1]===p.article_id,'平台状态必须对应精确文章ID');
 need(['published','scheduled','not_published','unknown'].includes(p.status)&&['creator_work_management','explicit_platform_state','article_page_visibility','profile_visibility','unknown'].includes(p.status_source));
 need(typeof p.status_text==='string'&&p.status_text.length<=300&&['verified','time_conflict','unknown'].includes(p.time_status)&&Array.isArray(p.time_sources)&&p.time_sources.length<=5);
 const explicit=['creator_work_management','explicit_platform_state'].includes(p.status_source);
 if(p.status!=='unknown')need(explicit&&p.status_text.trim(),'需要平台明确状态；页面可读或主页出现仅能记录未核验');
 if(p.status==='published')need(/已发布|已推送|发布成功|\bpublished\b/i.test(p.status_text)&&!/定时|待发布|未发布|发布中|预览|私人|草稿|仅自己|审核|撤回|下架|删除|scheduled|preview|private|draft|not\s+published/i.test(p.status_text),'定时发布中、私人草稿或预览不能记为已发布');
 const timeSources=p.time_sources.map(t=>{
  need(t&&['creator_work_management','article_page','explicit_platform_state'].includes(t.source)&&typeof t.raw_text==='string'&&t.raw_text.trim()&&t.raw_text.length<=300);
  need(t.timezone===null||typeof t.timezone==='string'&&t.timezone.length<=80);if(t.timezone!==null){try{new Intl.DateTimeFormat('zh-CN',{timeZone:t.timezone});}catch{need(false,'时间来源时区无效');}}
  need(t.normalized_at===null||iso(t.normalized_at)&&Date.parse(t.normalized_at)<=Date.parse(v.observed_at));
  return {source:t.source,raw_text:t.raw_text,timezone:t.timezone,normalized_at:t.normalized_at};
 });
 if(p.time_status==='verified'){
  need(p.status==='published'&&iso(v.published_at)&&Date.parse(v.published_at)<=Date.parse(v.observed_at),'只有明确已发布且发布时间核验后才可计算24小时');
  need(timeSources.length>0&&timeSources.every(t=>t.timezone!==null&&iso(t.normalized_at)&&Date.parse(t.normalized_at)===Date.parse(v.published_at!)),'发布时间来源或时区存在冲突，必须标记time_conflict或unknown');
 }else{
  need(v.published_at===null&&v.window_start===null&&v.window_end===null,'时间未核验或time_conflict时不得指定发布时间或24小时区间');
  if(p.time_status==='time_conflict')need(timeSources.length>=2,'时间冲突需保留至少两个原始来源');
 }
 for(const field of ['platform_data_through','window_start','window_end'] as const)need(v[field]===null||iso(v[field]));
 if(v.platform_data_through)need(Date.parse(v.platform_data_through)<=Date.parse(v.observed_at));
 need((v.window_start===null)===(v.window_end===null));if(v.window_start&&v.window_end)need(Date.parse(v.window_start)<=Date.parse(v.window_end)&&Date.parse(v.window_end)<=Date.parse(v.observed_at));
 const counters:Record<string,number|null>={};for(const field of ['exposures','reads','comments','likes'] as const){need(v[field]===null||Number.isSafeInteger(v[field])&&v[field]!>=0);counters[field]=v[field];}
 if(p.status!=='published')need(Object.values(counters).every(n=>n===null),'尚未明确公开发布，不记录公开表现指标');
 need(v.unavailable_reason===null||typeof v.unavailable_reason==='string'&&v.unavailable_reason.length<=300);
 need(typeof v.evidence_reference==='string'&&/^[A-Za-z0-9_.:/-]{1,240}$/.test(v.evidence_reference),'需要不含凭据的真实证据引用');
 return {platform:v.platform,publication:{article_id:p.article_id,status:p.status,status_source:p.status_source,status_text:p.status_text,time_status:p.time_status,time_sources:timeSources},published_at:v.published_at,published_url:v.published_url,observed_at:v.observed_at,platform_data_through:v.platform_data_through,window_start:v.window_start,window_end:v.window_end,...counters,unavailable_reason:v.unavailable_reason,evidence_reference:v.evidence_reference} as MetricsObservation;
}
export function metricsSnapshotKind(raw:MetricsObservation,clock=Date.now()):MetricsSnapshot {
 let v:MetricsObservation;try{v=normalizeMetrics(raw);}catch{return {state:'publication_unverified',due_at:null,label:'平台发布状态或时间证据未核验',public_verified:false};}
 const p=v.publication;
 if(p.status!=='published')return {state:p.status==='scheduled'?'scheduled':p.status==='not_published'?'not_published':'publication_unverified',due_at:null,label:p.status==='scheduled'?'定时发布中 · 尚未公开发布':p.status==='not_published'?'尚未公开发布':'公开发布状态未核验',public_verified:false};
 if(p.time_status!=='verified'||!v.published_at)return {state:p.time_status==='time_conflict'?'time_conflict':'publication_time_unknown',due_at:null,label:p.time_status==='time_conflict'?'已发布 · 时间来源冲突，暂不计算24小时':'已发布 · 发布时间未核验，暂不计算24小时',public_verified:true};
 const due=Date.parse(v.published_at)+86400000,at=Date.parse(v.observed_at);
 if(at<due)return {state:'before_24h',due_at:new Date(due).toISOString(),label:'发布未满24小时',public_verified:true};
 if([v.exposures,v.reads,v.comments,v.likes].every(n=>n===null))return {state:'unavailable',due_at:new Date(due).toISOString(),label:'不可获取',public_verified:true};
 const exactWindow=v.window_start!==null&&v.window_end!==null&&Date.parse(v.window_start)===Date.parse(v.published_at)&&Date.parse(v.window_end)===due&&v.platform_data_through!==null&&Date.parse(v.platform_data_through)>=due;
 return {state:exactWindow?'exact_24h':at>due?'late_cumulative':'cumulative',due_at:new Date(due).toISOString(),label:exactWindow?'平台明确24小时区间':at>due?'迟到采集 · 当时累计':'当时累计',read_at:new Date(Math.min(clock,at)).toISOString(),public_verified:true};
}
export async function recordMetrics(owner:string,args:Record<string,unknown>) {
 need(key(args.history_key)&&uuid(args.request_key));const value=normalizeMetrics(args.observation),payload=JSON.stringify({history_key:args.history_key,observation:value});
 await assertWordCredentialFree(owner,value);
 const history=await db().prepare('SELECT record_json FROM article_history WHERE owner=? AND history_key=?').bind(owner,args.history_key).first<{record_json:string}>();
 need(history,'未找到本人精确历史文章，不能关联指标');
 const source=JSON.parse(history.record_json) as HistoryRecord,expected=source.platforms[value.platform].draft_id;
 need(expected&&value.published_url.match(/\/(\d+)\/?$/)?.[1]===expected,'公开文章ID与原私人草稿不符，不能按近似标题关联');
 const old=await db().prepare('SELECT payload FROM article_metrics_observations WHERE owner=? AND request_key=?').bind(owner,args.request_key).first<{payload:string}>();if(old)need(old.payload===payload,'同一次指标采集不能更改内容');
 await db().prepare('INSERT OR IGNORE INTO article_metrics_observations(owner,request_key,history_key,platform,published_at,observed_at,payload,created) VALUES(?,?,?,?,?,?,?,?)').bind(owner,args.request_key,args.history_key,value.platform,value.published_at,value.observed_at,payload,new Date().toISOString()).run();
 const saved=await db().prepare('SELECT payload FROM article_metrics_observations WHERE owner=? AND request_key=?').bind(owner,args.request_key).first<{payload:string}>();need(saved?.payload===payload,'指标记录结果未确认，请读取同一记录');return {recorded:true,...metricsSnapshotKind(value),platform_actions:0};
}
export async function readArticleHistory(owner:string,offset=0) {
 need(Number.isSafeInteger(offset)&&offset>=0&&offset<=10000,'列表位置无效');
 const total=(await db().prepare('SELECT count(*) AS n FROM article_history WHERE owner=? AND completed_at>=?').bind(owner,historyStart).first<{n:number}>())?.n||0;
 const rows=(await db().prepare('SELECT history_key,record_json FROM article_history WHERE owner=? AND completed_at>=? ORDER BY completed_at DESC,history_key DESC LIMIT 25 OFFSET ?').bind(owner,historyStart,offset).all<{history_key:string;record_json:string}>()).results;
 const summary=(await db().prepare("SELECT count(*) AS total,sum(CASE WHEN json_extract(record_json,'$.status')='private_drafts_verified' THEN 1 ELSE 0 END) AS private_drafts,sum(CASE WHEN json_extract(record_json,'$.mode') IN ('scheduled_biji','manual_trigger_biji','website_full_auto') THEN 1 ELSE 0 END) AS full_auto FROM article_history WHERE owner=? AND completed_at>=?").bind(owner,historyStart).first<{total:number;private_drafts:number;full_auto:number}>())!;
 const items=await Promise.all(rows.map(async row=>{
  const observations=(await db().prepare('SELECT payload FROM article_metrics_observations WHERE owner=? AND history_key=? ORDER BY observed_at,request_key').bind(owner,row.history_key).all<{payload:string}>()).results.map(r=>JSON.parse(r.payload).observation as MetricsObservation);
  return {...JSON.parse(row.record_json) as HistoryRecord,observations:observations.map(v=>({...v,snapshot:metricsSnapshotKind(v)}))};
 }));
 return {owner_scope:await hashText('article-data-owner:'+owner),items,total,next_offset:offset+rows.length<total?offset+rows.length:null,summary:{processed:summary.total||0,private_drafts:summary.private_drafts||0,full_auto:summary.full_auto||0,semi_auto:(summary.total||0)-(summary.full_auto||0)},start_at:historyStart,notice:'统计仅覆盖已入库且有证据的文章；私人草稿不等于公开发布，今天是否仍存在未重新核对。公开文章或统计区间未核验时，指标保持缺项。'};
}
