import {randomUUID} from 'node:crypto';
import {fail,stable} from './security.mjs';
import {reviewDate,reviewSpecs,reviewUuid} from './content-review-validation.mjs';
import {beijingDay} from './lib/time.mjs';
import {isCoverFingerprint} from '../shared/review-cover-fingerprint.mjs';

export const archiveAccount='V字';
export const archivePlatform='toutiao';
export const archiveKinds=['article','micro'];
export const productionStatuses=['unfinished','complete','unknown'];
export const publicationStatuses=['unpublished','pending','scheduled','published','deleted','unknown'];
export const associationStatuses=['not_needed','pending','matched','ambiguous'];
export const absentStates=['not_filled','none','unverified','not_applicable'];
const invalid=(message='复盘档案字段无效')=>{throw fail(400,'VALIDATION_ERROR',message);};
export function archiveObject(value,fields) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!fields.includes(key)))invalid();
  return value;
}
export function archiveUuid(value) {
  if(typeof value!=='string'||!reviewUuid.test(value))invalid('标识须为小写 UUID');
  return value;
}
export function archiveVersion(value) {
  if(!Number.isSafeInteger(value)||value<1)invalid('需要有效的记录版本');
  return value;
}
const enumOf=values=>value=>{if(!values.includes(value))invalid();return value;};
function string(value,bytes,multiline=false) {
  if(typeof value!=='string'||!value.isWellFormed()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))invalid();
  const clean=value.replace(/\r\n?/gu,'\n').trim();
  if(!clean||Buffer.byteLength(clean)>bytes||!multiline&&/[\n\t]/u.test(clean))invalid();
  return clean;
}
const optional=validator=>value=>value===null?null:validator(value);
const line=bytes=>optional(value=>string(value,bytes));
const date=reviewSpecs.articles.fields.published_at;
const link=reviewSpecs.articles.fields.url;
const count=reviewSpecs.articles.fields.image_count;
const states=Object.freeze({kind:enumOf(archiveKinds),production_status:enumOf(productionStatuses),
  publication_status:enumOf(publicationStatuses),association_status:enumOf(associationStatuses)});
const businessDates=['creative_started_at','draft_saved_at','scheduled_at','published_at','deleted_at',
  'imitation_started_at','imitation_completed_at','sample_published_at'];
function array(value,max,map) {
  if(!Array.isArray(value)||value.length>max)invalid('档案列表超过支持范围');
  return value.map(map);
}
const strings=(max,bytes)=>optional(value=>[...new Set(array(value,max,item=>string(item,bytes)))]);
function source(entry) {
  archiveObject(entry,['title','url']);
  const result={title:line(1500)(entry.title??null),url:link(entry.url??null)};
  if(!result.title&&!result.url)invalid('来源需要真实标题或链接');
  return result;
}
function fingerprint(value) {
  if(!isCoverFingerprint(value))invalid('封面指纹格式无效');
  return value;
}
function cover(value) {
  archiveObject(value,['url','alt','fingerprint']);
  const normalized={url:link(value.url??null),alt:line(2000)(value.alt??null),fingerprint:optional(fingerprint)(value.fingerprint??null)};
  if(!Object.values(normalized).some(Boolean))invalid('封面资料为空');
  return normalized;
}
function images(value) {
  archiveObject(value,['total','real','ai','assets']);
  const result=Object.fromEntries(['total','real','ai'].map(key=>[key,count(value[key]??null)]));
  if(result.total!==null&&(result.real??0)+(result.ai??0)>result.total)invalid('真实图与 AI 图不能超过总图数');
  if(value.assets!==undefined)result.assets=optional(list=>array(list,80,item=>{
    archiveObject(item,['url','alt','kind']);
    return {url:link(item.url),alt:line(1000)(item.alt??null),kind:enumOf(['real','ai','unknown'])(item.kind??'unknown')};
  }))(value.assets);
  return result;
}
const payload={original_title:line(2500),published_title:line(2500),platform_url:link,
  original_body:optional(value=>string(value,80000,true)),published_body:optional(value=>string(value,80000,true)),
  alternate_titles:strings(16,2000),sample_title:line(2500),sample_url:link,sample_reference_id:optional(archiveUuid),
  sources:optional(value=>array(value,64,source)),cover:optional(cover),images:optional(images),
  source_note:optional(value=>string(value,6000,true)),tags:strings(40,200),
  ...Object.fromEntries(businessDates.map(key=>[key,date]))};
export const archivePayloadFields=Object.freeze([...Object.keys(payload),'field_states']);
const typedFieldNames=Object.freeze([...Object.keys(payload),'images.total','images.real','images.ai']);
function fieldStates(value) {
  archiveObject(value,typedFieldNames);
  return Object.fromEntries(Object.entries(value).map(([key,state])=>[key,enumOf(absentStates)(state)]));
}
const itemFields={id:archiveUuid,legacy_id:optional(archiveUuid),...states,...payload,field_states:fieldStates};
export function archiveVerified(value) {
  return [...new Set(array(value,typedFieldNames.length,item=>{
    if(!typedFieldNames.includes(item))invalid('核验字段无效');
    return item;
  }))].sort();
}
export function normalizeArchiveItem(input,{patch=false}={}) {
  archiveObject(input,Object.keys(itemFields));
  if(patch&&Object.hasOwn(input,'id'))invalid('档案标识不能改变');
  const result=patch?{}:{id:input.id??randomUUID(),legacy_id:null,kind:'article',production_status:'unknown',
    publication_status:'unknown',association_status:'pending',...Object.fromEntries(Object.keys(payload).map(key=>[key,null])),field_states:{}};
  for(const [key,value] of Object.entries(input))result[key]=itemFields[key](value);
  return result;
}
export function normalizeArchiveReference(input) {
  archiveObject(input,['id','kind','platform_id','role','title','url','saved_at','state']);
  return {id:archiveUuid(input.id??randomUUID()),kind:enumOf(['draft','publication'])(input.kind),
    platform_id:string(input.platform_id,240),role:enumOf(['primary','duplicate','other'])(input.role??'other'),
    title:line(2500)(input.title??null),url:link(input.url??null),saved_at:date(input.saved_at??null),
    state:enumOf(['active','disputed'])(input.state??'active')};
}
export function archiveDay(value) {return value===null?null:reviewDate(value);}
export function archiveInstant(value) {
  const normalized=date(value);
  if(normalized===null||normalized.length===10)invalid('采集时刻需要带时区的完整时间');
  return normalized;
}
function metricValue(key,value) {
  if(value===null)return null;
  if(key==='traffic_sources'||key==='completion_curve'||key==='audience') {
    return reviewSpecs.snapshots.fields[key](value);
  }
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER||
    ['ctr','completion_rate','interaction_rate'].includes(key)&&value>100)
    invalid('指标须是有效非负数，未知请留空');
  return value;
}
export function normalizeArchiveSnapshot(input) {
  archiveObject(input,['id','source','source_key','observed_at','metrics']);
  if(!input.metrics||Array.isArray(input.metrics)||typeof input.metrics!=='object')invalid('缺少实际指标');
  const entries=Object.entries(input.metrics);
  if(!entries.length||entries.length>40||entries.some(([key])=>!(/^[a-z][a-z0-9_]{0,63}$/u.test(key))))invalid('指标字段无效');
  const metrics=Object.fromEntries(entries.map(([key,value])=>[key,metricValue(key,value)]));
  const source=string(input.source,100);
  const observed_at=input.observed_at===null&&source==='legacy_review_date'?null:archiveInstant(input.observed_at);
  if(!Object.values(metrics).some(value=>value!==null))invalid('没有可保存的实际指标');
  return {id:archiveUuid(input.id??randomUUID()),source,source_key:string(input.source_key,300),observed_at,metrics:stable(metrics)};
}
export function checkArchiveSnapshotTime(item,snapshot) {
  const publication=item?.published_at,observed=snapshot?.observed_at;
  if(!publication||!observed)return;
  const early=publication.length===10?beijingDay(Date.parse(observed))<publication:observed<publication;
  if(early)invalid('采集时刻早于已知发布时间');
}
export function sortArchiveTime(item) {
  const indexed={deleted:['deleted_at'],published:['published_at'],scheduled:['scheduled_at','draft_saved_at'],
    pending:['draft_saved_at','imitation_completed_at','creative_started_at'],
    unpublished:['imitation_completed_at','creative_started_at'],unknown:['creative_started_at']};
  return (indexed[item.publication_status]??[]).map(key=>item[key]).find(Boolean)??null;
}
export const archiveTitle=item=>item.published_title??item.original_title??null;
export function archiveFieldState(item,key) {
  const value=key.startsWith('images.')?item.images?.[key.slice(7)]:item[key];
  if(value!==undefined&&value!==null)return 'present';
  return item.field_states?.[key]??'not_filled';
}
