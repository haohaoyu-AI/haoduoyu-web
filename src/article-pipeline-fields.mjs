import {fail} from '../shared/auth.mjs';

export const ARTICLE_PIPELINE_FIELDS=Object.freeze([
  'status','slot','run_dir','run_date','series_no','writer','illustrator','sample_json',
  'char_count','subheading_count','image_count','cover_desc','draft_ref_json','timings_json',
  'reruns_json','blockers_json','verify_items_json',
]);
export const ARTICLE_PIPELINE_ENUMS=Object.freeze({
  status:Object.freeze(['drafting','illustrated','draft_saved','published','failed']),
  slot:Object.freeze(['zh1','zh2','tt1','tt2','zh3','tt3','gzh']),
  writer:Object.freeze(['dedao','gemini_web','human','other']),
  illustrator:Object.freeze(['codex','pil','human']),
});
export const ARTICLE_PIPELINE_DEFAULTS=Object.freeze(Object.fromEntries(ARTICLE_PIPELINE_FIELDS.map(name=>[name,null])));
export const LEGACY_ARTICLE_PIPELINE_DEFAULTS=Object.freeze({...ARTICLE_PIPELINE_DEFAULTS,status:'published'});
export const PIPELINE_JSON_FIELDS=Object.freeze({
  sample_json:'object',draft_ref_json:'object',timings_json:'object',reruns_json:'object',
  blockers_json:'array',verify_items_json:'array',
});
export const PIPELINE_JSON_MAX_BYTES=65536;
export const PIPELINE_JSON_MAX_DEPTH=12;
export const PIPELINE_JSON_MAX_NODES=4096;
const nonnegativeIntegers=new Set(['char_count','subheading_count','image_count']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const invalid=name=>{throw fail(400,'VALIDATION_ERROR',`文章流水线字段 ${name} 无效`);};
const bytes=value=>new TextEncoder().encode(value).byteLength;
const dangerousKeys=new Set(['__proto__','constructor','prototype']);
function validDate(value) {
  if(typeof value!=='string'||value.length!==10||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const parsed=new Date(value+'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
function validTimestamp(value) {
  if(typeof value!=='string'||value.length>40||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||
    /[\r\n\u2028\u2029]/.test(value)||!validDate(value.slice(0,10)))return false;
  const clock=/T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value),offset=/[+-](\d{2}):(\d{2})$/.exec(value);
  return Number(clock[1])<=23&&Number(clock[2])<=59&&Number(clock[3]||0)<=59&&
    (!offset||Number(offset[1])<=23&&Number(offset[2])<=59)&&Number.isFinite(Date.parse(value));
}
function nullableKnown(value,key,predicate,name) {
  if(Object.hasOwn(value,key)&&value[key]!==null&&!predicate(value[key]))invalid(name);
}
function inspectJsonText(value,name) {
  // Inspect every original member, including values hidden by a later duplicate
  // key. JSON.parse alone only exposes the final member for a duplicate name.
  let depth=0,nodes=0;
  for(let i=0;i<value.length;) {
    const char=value[i];
    if(/[\t\n\r ,:]/.test(char)){i++;continue;}
    if(char==='{'||char==='[') {
      if(++depth>PIPELINE_JSON_MAX_DEPTH||++nodes>PIPELINE_JSON_MAX_NODES)invalid(name);
      i++;continue;
    }
    if(char==='}'||char===']'){depth--;i++;continue;}
    if(char==='"') {
      const start=i++;
      while(i<value.length) {
        if(value[i]==='\\'){i+=2;continue;}
        if(value[i++]==='"')break;
      }
      let next=i;while(/[\t\n\r ]/.test(value[next]??'x'))next++;
      if(value[next]===':') {
        if(dangerousKeys.has(JSON.parse(value.slice(start,i))))invalid(name);
      } else if(++nodes>PIPELINE_JSON_MAX_NODES)invalid(name);
      continue;
    }
    if(++nodes>PIPELINE_JSON_MAX_NODES)invalid(name);
    while(i<value.length&&!/[\t\n\r ,\]}]/.test(value[i]))i++;
  }
}

// Storage-facing contract: SQL NULL or raw JSON text only. JSON is inspected
// without replacement, merging, timestamp conversion or serialization.
export function validatePipelineJson(value,name) {
  if(!Object.hasOwn(PIPELINE_JSON_FIELDS,name))invalid('json_field');
  if(value===null)return value;
  if(typeof value!=='string'||bytes(value)>PIPELINE_JSON_MAX_BYTES)invalid(name);
  let parsed;
  try{parsed=JSON.parse(value);}catch{invalid(name);}
  if(PIPELINE_JSON_FIELDS[name]==='object'?!object(parsed):!Array.isArray(parsed)||parsed.some(item=>!object(item)))invalid(name);
  inspectJsonText(value,name);
  if(name==='draft_ref_json')for(const key of ['pgc_id','appmsgid'])nullableKnown(parsed,key,item=>typeof item==='string',name);
  if(name==='timings_json')nullableKnown(parsed,'finished_at',validTimestamp,name);
  if(name==='reruns_json')nullableKnown(parsed,'watchdog',item=>Number.isSafeInteger(item)&&item>=0,name);
  if(name==='blockers_json')for(const item of parsed)nullableKnown(item,'type',entry=>typeof entry==='string',name);
  return value;
}

// Validate stored field values without coercion, trimming, JSON reserialization,
// or removal of unknown nested keys. Other article columns are left untouched.
export function validateArticlePipelineFields(row) {
  if(!object(row))invalid('record');
  let jsonBytes=0;
  for(const name of ARTICLE_PIPELINE_FIELDS) {
    if(!Object.hasOwn(row,name)||row[name]===null)continue;
    const value=row[name];
    if(Object.hasOwn(ARTICLE_PIPELINE_ENUMS,name)) {
      if(!ARTICLE_PIPELINE_ENUMS[name].includes(value))invalid(name);
    } else if(name==='series_no'||nonnegativeIntegers.has(name)) {
      if(!Number.isSafeInteger(value)||value<(name==='series_no'?1:0))invalid(name);
    } else if(name==='run_date') {
      if(!validDate(value))invalid(name);
    } else if(name==='run_dir') {
      if(typeof value!=='string'||value.split('/').some(segment=>!segment||/[^A-Za-z0-9_-]/.test(segment)))invalid(name);
    } else if(Object.hasOwn(PIPELINE_JSON_FIELDS,name)) {
      validatePipelineJson(value,name);jsonBytes+=bytes(value);
      if(jsonBytes>PIPELINE_JSON_MAX_BYTES)invalid('json_total');
    } else if(typeof value!=='string')invalid(name);
  }
  return row;
}
