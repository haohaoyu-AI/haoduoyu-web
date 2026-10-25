import {fail} from './lib/errors.mjs';
import {ARTICLE_PIPELINE_ENUMS,validatePipelineJson} from './article-pipeline-fields.mjs';
import {requestedArticleStatus,validateArticleInputComplexity} from './article-pipeline-io.mjs';

export const ARTICLE_PIPELINE_QUERY_KEYS=Object.freeze([
  'status','slot','writer','has_warnings','has_pending_verify','series_no_min','series_no_max',
]);
export const ARTICLE_WARNING_CODES=Object.freeze({
  title:'TOUTIAO_TITLE_TOO_LONG',characters:'CHAR_COUNT_OUT_OF_RANGE',
  subheadings:'SUBHEADING_COUNT_OUT_OF_RANGE',images:'ENTERTAINMENT_IMAGES_TOO_FEW',
  credential:'DRAFT_CREDENTIAL_MISSING',
});
const valueFor=(query,key)=>typeof query?.get==='function'?query.get(key):query?.[key];
const supplied=(query,key)=>typeof query?.has==='function'?query.has(key):Object.hasOwn(query||{},key);
const invalid=message=>fail(400,'VALIDATION_ERROR',message);

// Call before URLSearchParams is converted to an object, so duplicate filters
// cannot silently select whichever value happened to appear last.
export function validateArticlePipelineQueryMultiplicity(query) {
  if(typeof query?.getAll!=='function')return;
  for(const key of ARTICLE_PIPELINE_QUERY_KEYS)if(query.getAll(key).length>1)invalid(key+' 只能提供一次');
}
function integer(value,key) {
  if(typeof value!=='string'||!/^\d+$/.test(value))invalid(key+' 须为正安全整数');
  const result=Number(value);
  if(!Number.isSafeInteger(result)||result<1)invalid(key+' 须为正安全整数');
  return result;
}
export function articlePipelineQuery(query={}) {
  validateArticlePipelineQueryMultiplicity(query);
  const result={status:requestedArticleStatus(query),filters:{},hasDerived:false};
  for(const key of ['slot','writer'])if(supplied(query,key)) {
    const value=valueFor(query,key);
    if(!ARTICLE_PIPELINE_ENUMS[key].includes(value))invalid('文章'+(key==='slot'?'槽位':'写作者')+'无效');
    result.filters[key]=value;
  }
  for(const key of ['series_no_min','series_no_max'])if(supplied(query,key))result.filters[key]=integer(valueFor(query,key),key);
  if(result.filters.series_no_min>result.filters.series_no_max)invalid('series_no_min 不能大于 series_no_max');
  for(const key of ['has_warnings','has_pending_verify'])if(supplied(query,key)) {
    const value=valueFor(query,key);
    if(!['true','false'].includes(value))invalid(key+' 仅支持 true 或 false');
    result[key]=value==='true';result.hasDerived=true;
  }
  return result;
}

// First-party fixed SQL only. Authorize the account before adding these scalar
// clauses; apply derived filters to the complete scoped set before pagination.
export function articlePipelineSqlFilters(parsed) {
  const clauses=[],params=[];
  for(const key of ['slot','writer'])if(Object.hasOwn(parsed.filters,key)) {
    clauses.push('a.'+key+'=?');params.push(parsed.filters[key]);
  }
  for(const [key,operator] of [['series_no_min','>='],['series_no_max','<=']])if(Object.hasOwn(parsed.filters,key)) {
    clauses.push('a.series_no'+operator+'?');params.push(parsed.filters[key]);
  }
  return {clauses,params};
}

const entertainmentSlots=new Set(['zh1','zh2','zh3','tt1','tt2','tt3']);
const knownCount=value=>Number.isSafeInteger(value)&&value>=0;
function pipelineJson(row,name) {
  if(Object.hasOwn(row||{},name)) {
    const value=row[name];
    if(value===null||value===undefined)return null;
    validateArticleInputComplexity({[name]:value});
    let raw;try{raw=JSON.stringify(value);}catch{invalid('文章JSON格式无效');}
    validatePipelineJson(raw,name+'_json');return value;
  }
  const raw=row?.[name+'_json'];
  if(raw===null||raw===undefined)return null;
  validatePipelineJson(raw,name+'_json');return JSON.parse(raw);
}
function platformFor(row) {
  if(row?.platform!=null)return row.platform;
  if(['tt1','tt2','tt3'].includes(row?.slot))return 'toutiao';
  if(['zh1','zh2','zh3'].includes(row?.slot))return 'zhihu';
  return row?.slot==='gzh'?'wechat':'other';
}
function editorURL(value) {
  // Only URL syntax is checked. No network request, host allowlist, existence
  // assertion, inferred draft type or remote edit-permission assertion.
  if(typeof value!=='string'||!/^https?:\/\//i.test(value)||/[\s\u0000-\u001f\u007f]/u.test(value))return false;
  let url;try{url=new URL(value);}catch{return false;}
  return ['http:','https:'].includes(url.protocol)&&!!url.hostname&&!url.username&&!url.password;
}
function draftCredentialPresent(row) {
  const reference=pipelineJson(row,'draft_ref');
  if(reference===null)return false;
  const platform=platformFor(row);
  const key=platform==='toutiao'?'pgc_id':platform==='wechat'?'appmsgid':'editor_url';
  if(!Object.hasOwn(reference,key))return false;
  return key==='editor_url'?editorURL(reference[key]):typeof reference[key]==='string'&&reference[key].trim().length>0;
}
export function articleWarnings(row) {
  const warnings=[];
  const toutiao=row?.platform==='toutiao'||row?.platform==null&&['tt1','tt2','tt3'].includes(row?.slot);
  if(toutiao&&typeof row.title==='string'&&Array.from(row.title).length>30)warnings.push(ARTICLE_WARNING_CODES.title);
  if(knownCount(row?.char_count)&&(row.char_count<2000||row.char_count>2300))warnings.push(ARTICLE_WARNING_CODES.characters);
  if(knownCount(row?.subheading_count)&&(row.subheading_count<5||row.subheading_count>7))warnings.push(ARTICLE_WARNING_CODES.subheadings);
  if(entertainmentSlots.has(row?.slot)&&knownCount(row.image_count)&&row.image_count<25)warnings.push(ARTICLE_WARNING_CODES.images);
  if(row?.status==='draft_saved'&&!draftCredentialPresent(row))warnings.push(ARTICLE_WARNING_CODES.credential);
  return warnings;
}

export function verificationState(row) {
  const items=pipelineJson(row,'verify_items');
  if(items===null)return {has_pending_verify:null,verify_state:'unknown'};
  if(items.some(item=>Object.hasOwn(item,'done')&&item.done===false))return {has_pending_verify:true,verify_state:'pending'};
  if(items.some(item=>!Object.hasOwn(item,'done')||item.done!==true))return {has_pending_verify:null,verify_state:'unknown'};
  return {has_pending_verify:false,verify_state:'complete'};
}

export function matchesArticlePipelineDerivedFilters(row,parsed) {
  if(Object.hasOwn(parsed,'has_warnings')&&(articleWarnings(row).length>0)!==parsed.has_warnings)return false;
  // Unknown is neither true nor false, so a false filter cannot silently mark
  // incomplete legacy/unknown metadata as explicitly completed.
  if(Object.hasOwn(parsed,'has_pending_verify')&&verificationState(row).has_pending_verify!==parsed.has_pending_verify)return false;
  return true;
}
