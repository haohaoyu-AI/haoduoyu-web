// Collection PATCH planning only. The caller owns mutate(), authentication,
// audit and idempotency receipts; this module never commits or retries a write.
import {fail} from './lib/errors.mjs';
import {stable} from './security.mjs';
import {ARTICLE_PIPELINE_FIELDS} from './article-pipeline-fields.mjs';
import {jsonColumns,jsonNames,pipelineInput,validateArticleInputComplexity,pipelineKeyConflict} from './article-pipeline-io.mjs';

const baseFields=['account_id','title','url','platform_article_id','published_at','started_at','production_mode','summary','notes'];
const logicalFields=ARTICLE_PIPELINE_FIELDS.map(name=>jsonNames[name]||name);
const writable=new Set([...baseFields,...logicalFields]);
const accepted=new Set([...writable,'id','version']);
const jsonObjects=new Set(['sample','draft_ref','timings','reruns']);
const details=new Set(['recorded_by','last_modified_by','observations','nodes','timeline']);
const own=(value,key)=>Object.hasOwn(value,key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const invalid=message=>fail(400,'VALIDATION_ERROR',message);
const versionConflict=()=>fail(409,'VERSION_CONFLICT','文章已存在或版本已变化，请回读后重试');
const equivalent=(left,right)=>JSON.stringify(stable(left))===JSON.stringify(stable(right));

function validateBody(body) {
  if(!object(body))invalid('请求必须是对象');
  validateArticleInputComplexity(body);
  for(const key of Object.keys(body))if(!accepted.has(key)||body[key]===undefined)invalid('PATCH包含不支持的文章字段');
  // JSON.parse accepts an overflowing exponent as Infinity, but stringify would
  // replace it with null. Reject it rather than inventing a different value.
  const pending=[body];
  while(pending.length) {
    const value=pending.pop();
    if(typeof value==='number'&&!Number.isFinite(value))invalid('JSON数值必须有限');
    if(value!==null&&typeof value==='object')pending.push(...Object.values(value));
  }
  if(own(body,'id')&&(typeof body.id!=='string'||!body.id||body.id.length>300))invalid('文章标识无效');
  if(own(body,'version')&&(!Number.isSafeInteger(body.version)||body.version<0))invalid('版本号须为非负安全整数');
}

// Run before a receipt lookup too: a previously issued receipt never grants an
// API key its former account scope after that scope is narrowed or revoked.
export async function authorizeArticleUpsert(records,body,scope=null) {
  if(!object(body)||typeof body.account_id!=='string'||!body.account_id)invalid('请选择运营账号');
  if(scope!==null&&(!Array.isArray(scope)||scope.some(id=>typeof id!=='string')))fail(403,'FORBIDDEN','账号授权无效');
  if(scope!==null&&!scope.includes(body.account_id))fail(403,'FORBIDDEN','无权访问该运营账号');
  const accounts=await records.listAccounts(scope);
  if(!accounts.some(row=>row.id===body.account_id))fail(404,'NOT_FOUND','运营账号不存在');
}

function selectors(body) {
  const dir=own(body,'run_dir')&&body.run_dir!==null;
  const hasSlot=own(body,'slot'),hasDate=own(body,'run_date');
  if(hasSlot!==hasDate)invalid('slot与run_date必须一起提供');
  if(hasSlot&&(body.slot===null)!==(body.run_date===null))invalid('slot与run_date须同时非空或同时为空');
  const pair=hasSlot&&body.slot!==null&&body.run_date!==null;
  if(!dir&&!pair)invalid('PATCH需要run_dir或完整slot与run_date');
  // Use the same exact enum/date/path/type contract as POST and PUT before any
  // key query. These defaults only validate; creation is handled separately.
  pipelineInput(body,null,typeof body.title==='string'?body.title:'');
  return {dir,pair};
}

function mergeObject(previous,incoming) {
  const result=Object.fromEntries(Object.entries(object(previous)?previous:{}));
  for(const [key,value] of Object.entries(incoming)) {
    result[key]=object(value)?mergeObject(result[key],value):structuredClone(value);
  }
  return result;
}

function mergedInput(body,old) {
  const result=Object.fromEntries(Object.entries(body).filter(([key])=>writable.has(key)));
  for(const name of jsonObjects)if(own(body,name)&&object(body[name]))result[name]=mergeObject(old[name],body[name]);
  return result;
}

function storedPipeline(row) {
  return Object.fromEntries(ARTICLE_PIPELINE_FIELDS.map(name=>[name,jsonNames[name]?
    row[jsonNames[name]]===null?null:JSON.stringify(row[jsonNames[name]]):row[name]]));
}

function unchanged(body,merged,old) {
  const pipeline=pipelineInput(merged,storedPipeline(old),own(merged,'title')?merged.title:old.title);
  for(const name of baseFields)if(own(body,name)&&!equivalent(body[name],old[name]))return false;
  for(const name of ARTICLE_PIPELINE_FIELDS) {
    if(jsonColumns.includes(name)) {
      const value=pipeline[name]===null?null:JSON.parse(pipeline[name]);
      if(!equivalent(value,old[jsonNames[name]]))return false;
    } else if(!Object.is(pipeline[name],old[name]))return false;
  }
  return true;
}

function assertIdentity(body,row) {
  if(row.account_id!==body.account_id||own(body,'id')&&body.id!==row.id)pipelineKeyConflict();
  for(const name of ['run_dir','slot','run_date']) {
    if(own(body,name)&&row[name]!==null&&body[name]!==row[name])pipelineKeyConflict();
  }
}

export async function upsertArticle(store,records,body,scope=null) {
  await authorizeArticleUpsert(records,body,scope);
  validateBody(body);
  const keys=selectors(body);
  const byDir=keys.dir?await store.get('SELECT id,account_id,run_dir,slot,run_date FROM articles WHERE run_dir=?',body.run_dir):null;
  const byPair=keys.pair?await store.get('SELECT id,account_id,run_dir,slot,run_date FROM articles WHERE slot=? AND run_date=?',body.slot,body.run_date):null;
  if(byDir&&byPair&&byDir.id!==byPair.id)pipelineKeyConflict();
  const match=byDir||byPair;
  if(!match) {
    if(own(body,'id'))pipelineKeyConflict();
    if(own(body,'version')&&body.version!==0)versionConflict();
    const input=Object.fromEntries(Object.entries(body).filter(([name])=>writable.has(name)));
    if(!own(input,'status'))input.status='draft_saved';
    return {value:await records.createArticle(input,scope),created:true,unchanged:false};
  }
  assertIdentity(body,match);
  const old=await records.getArticle(match.id,scope);
  if(own(body,'version')&&body.version===0)versionConflict();
  if(!Number.isSafeInteger(body.version)||body.version<1)invalid('更新文章需要当前版本号');
  if(body.version!==old.version)versionConflict();
  const merged=mergedInput(body,old);
  if(unchanged(body,merged,old)) {
    // A no-op still follows the ordinary PUT validation, including restored
    // URL/date inconsistencies and existing metric constraints; no SQL queues.
    await records.validateArticleUpdate(old.id,{...merged,version:body.version},scope);
    return {value:Object.fromEntries(Object.entries(old).filter(([name])=>!details.has(name))),created:false,unchanged:true};
  }
  return {value:await records.updateArticle(old.id,{...merged,version:body.version},scope),created:false,unchanged:false};
}
