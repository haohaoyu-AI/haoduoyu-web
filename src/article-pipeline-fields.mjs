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
const objectJson=new Set(['sample_json','draft_ref_json','timings_json','reruns_json']);
const arrayJson=new Set(['blockers_json','verify_items_json']);
const nonnegativeIntegers=new Set(['char_count','subheading_count','image_count']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const invalid=name=>{throw fail(400,'VALIDATION_ERROR',`文章流水线字段 ${name} 无效`);};

// Validate stored field values without coercion, trimming, JSON reserialization,
// or removal of unknown nested keys. Other article columns are left untouched.
export function validateArticlePipelineFields(row) {
  if(!object(row))invalid('record');
  for(const name of ARTICLE_PIPELINE_FIELDS) {
    if(!Object.hasOwn(row,name)||row[name]===null)continue;
    const value=row[name];
    if(Object.hasOwn(ARTICLE_PIPELINE_ENUMS,name)) {
      if(!ARTICLE_PIPELINE_ENUMS[name].includes(value))invalid(name);
    } else if(name==='series_no'||nonnegativeIntegers.has(name)) {
      if(!Number.isSafeInteger(value)||value<(name==='series_no'?1:0))invalid(name);
    } else if(name==='run_date') {
      if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))invalid(name);
      const parsed=new Date(value+'T00:00:00.000Z');
      if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)invalid(name);
    } else if(name==='run_dir') {
      if(typeof value!=='string'||value.split('/').some(segment=>!segment||/[^A-Za-z0-9_-]/.test(segment)))invalid(name);
    } else if(objectJson.has(name)||arrayJson.has(name)) {
      if(typeof value!=='string')invalid(name);
      let parsed;
      try{parsed=JSON.parse(value);}catch{invalid(name);}
      if(objectJson.has(name)?!object(parsed):!Array.isArray(parsed)||parsed.some(item=>!object(item)))invalid(name);
    } else if(typeof value!=='string')invalid(name);
  }
  return row;
}
