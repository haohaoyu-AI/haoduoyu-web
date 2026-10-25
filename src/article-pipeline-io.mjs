import {fail} from './lib/errors.mjs';
import {ARTICLE_PIPELINE_FIELDS,ARTICLE_PIPELINE_ENUMS,ARTICLE_PIPELINE_DEFAULTS,PIPELINE_JSON_MAX_DEPTH,PIPELINE_JSON_MAX_NODES,
  PIPELINE_JSON_FIELDS,validateArticlePipelineFields,validatePipelineJson} from './article-pipeline-fields.mjs';
import {isPublishedArticle} from './article-lifecycle.mjs';

export const jsonColumns=Object.keys(PIPELINE_JSON_FIELDS);
export const jsonNames=Object.fromEntries(jsonColumns.map(column=>[column,column.slice(0,-5)]));
const own=(object,key)=>Object.hasOwn(object,key);
const invalid=message=>fail(400,'VALIDATION_ERROR',message);
function boundedValue(value,maxDepth,maxNodes) {
  const queue=[[value,0]];let nodes=0;
  while(queue.length) {
    const [entry,parentDepth]=queue.pop();
    if(++nodes>maxNodes)invalid('文章JSON节点数量超限');
    if(typeof entry==='number'&&!Number.isFinite(entry))invalid('文章JSON数值必须为有限数');
    if(entry===null||typeof entry!=='object')continue;
    const depth=parentDepth+1;
    if(depth>maxDepth)invalid('文章JSON嵌套层级超限');
    for(const key of Object.keys(entry)) {
      if(['__proto__','constructor','prototype'].includes(key))invalid('文章JSON包含不安全键');
      queue.push([entry[key],depth]);
    }
  }
}
// Bound parsed input before stable() or JSON.stringify can recurse. The whole
// request guard also covers ignored/unknown top-level fields used in receipts.
export function validateArticleInputComplexity(body) {
  boundedValue(body,64,32768);
  for(const name of Object.values(jsonNames))if(own(body,name))boundedValue(body[name],PIPELINE_JSON_MAX_DEPTH,PIPELINE_JSON_MAX_NODES);
}
export function requestedArticleStatus(query) {
  const value=typeof query?.get==='function'?query.get('status'):query?.status;
  if(value===undefined||value===null)return 'published';
  if(!ARTICLE_PIPELINE_ENUMS.status.includes(value))invalid('文章状态无效');
  return value;
}
export function validateArticleStatusQuery(query) {
  if(query.getAll('status').length>1)invalid('status 只能提供一次');
}
export function pipelineKeyConflict() {
  fail(409,'ARTICLE_PIPELINE_KEY_CONFLICT','流水线目录或时段日期已经登记');
}
export function rethrowArticlePipelineConflict(error) {
  if(error?.status===undefined&&typeof error?.message==='string'&&
    /^(?:D1_ERROR: )?UNIQUE constraint failed: (?:matrix_articles\.run_dir|matrix_articles\.slot, matrix_articles\.run_date)(?:: SQLITE_CONSTRAINT(?: \(extended: SQLITE_CONSTRAINT_UNIQUE\))?)?$/.test(error.message))pipelineKeyConflict();
  throw error;
}
export function seriesFromTitle(title) {
  const match=/【保险200篇·第(\d+)篇】/.exec(title||'');
  if(!match)return null;
  const number=Number(match[1]);return Number.isSafeInteger(number)&&number>0?number:null;
}
export function pipelineInput(body,old,title) {
  for(const column of jsonColumns)if(own(body,column))invalid('JSON字段请使用对象字段 '+jsonNames[column]+'，不接受原始 *_json');
  const explicit=ARTICLE_PIPELINE_FIELDS.some(key=>own(body,key))||Object.values(jsonNames).some(key=>own(body,key));
  const status=own(body,'status')?body.status:old?(own(old,'status')?old.status:'published'):explicit?'draft_saved':'published';
  if(!ARTICLE_PIPELINE_ENUMS.status.includes(status))invalid('请明确提供有效的文章状态，不能为null');
  const value={...ARTICLE_PIPELINE_DEFAULTS,...Object.fromEntries(ARTICLE_PIPELINE_FIELDS.filter(key=>own(old||{},key)).map(key=>[key,old[key]])),status};
  for(const key of ARTICLE_PIPELINE_FIELDS)if(key!=='status'&&!jsonColumns.includes(key)&&own(body,key))value[key]=body[key];
  if(value.cover_desc!==null&&(typeof value.cover_desc!=='string'||value.cover_desc.length>10000||
    !value.cover_desc.isWellFormed()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value.cover_desc)))invalid('封面描述格式或长度无效');
  for(const column of jsonColumns) {
    const name=jsonNames[column];if(!own(body,name))continue;
    if(body[name]===null){value[column]=null;continue;}
    boundedValue(body[name],PIPELINE_JSON_MAX_DEPTH,PIPELINE_JSON_MAX_NODES);
    let encoded;try{encoded=JSON.stringify(body[name]);}catch{invalid('文章JSON格式无效');}
    validatePipelineJson(encoded,column);
    const parsed=JSON.parse(encoded);
    if(column==='timings_json'&&typeof parsed.finished_at==='string')parsed.finished_at=new Date(parsed.finished_at).toISOString();
    value[column]=JSON.stringify(parsed);
  }
  if(value.series_no===null&&!own(body,'series_no'))value.series_no=seriesFromTitle(title);
  validateArticlePipelineFields(value);return value;
}
export function requireDraftPublicationNull(status,url,published) {
  if(status!=='published'&&(url!==null&&url!==undefined||published!==null&&published!==undefined))
    invalid('未发布文章的url和published_at必须为null，公共链接在发布时再填写');
}
export function decodePipelineArticle(row) {
  const value={...row};
  for(const column of jsonColumns)if(own(value,column)) {
    validatePipelineJson(value[column],column);
    value[jsonNames[column]]=value[column]===null?null:JSON.parse(value[column]);delete value[column];
  }
  return value;
}
export function durationForArticle(row) {
  if(!isPublishedArticle(row)||row.published_at===null||!row.started_at)return null;
  return Math.round((Date.parse(row.published_at)-Date.parse(row.started_at))/1000);
}
export function compareArticlePublication(a,b) {
  if(a.published_at===null&&b.published_at!==null)return 1;
  if(b.published_at===null&&a.published_at!==null)return -1;
  return String(b.published_at??'').localeCompare(String(a.published_at??''))||a.id.localeCompare(b.id);
}
export function requirePublishedMetrics(row) {
  if(!isPublishedArticle(row)||row.published_at===null)fail(409,'ARTICLE_NOT_PUBLISHED','未发布文章不能录入文章级指标');
}
export function requireNoDraftMetrics(value,observation,firstDaily) {
  if(value.status!=='published'&&(observation?.earliest||firstDaily?.earliest))
    fail(409,'ARTICLE_HAS_METRICS','已有文章级指标的已发布文章不能改为草稿');
}
