// Import transport only. The CLI decides whether an apply run is explicitly
// enabled. This module never reads credentials/files, logs bodies or retries a
// write; tests inject a simulated fetch service.
import {createHash} from 'node:crypto';
import {ARTICLE_PIPELINE_FIELDS,ARTICLE_PIPELINE_ENUMS} from '../../src/article-pipeline-fields.mjs';
import {jsonColumns,jsonNames,pipelineInput,validateArticleInputComplexity} from '../../src/article-pipeline-io.mjs';

const own=(value,key)=>Object.hasOwn(value,key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const objects=new Set(['sample','draft_ref','timings','reruns']);
const writable=new Set(['account_id','title','url','platform_article_id','published_at','started_at','production_mode','summary','notes',
  ...ARTICLE_PIPELINE_FIELDS.map(name=>jsonNames[name]||name)]);
const identityFields=['account_id','run_dir','slot','run_date'];
const articleId=value=>typeof value==='string'&&value.length>0&&value.length<=300&&value.isWellFormed()&&!/[\u0000-\u001f\u007f]/u.test(value);
const safeName=value=>typeof value==='string'&&/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(value)&&value.length<=512;
const canonical=value=>Array.isArray(value)?value.map(canonical):object(value)?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

export class ImportApplyError extends Error {
  constructor(code,{halt=false}={}) {super(code);this.name='ImportApplyError';this.code=code;this.halt=halt;}
}
const fail=(code,options)=>{throw new ImportApplyError(code,options);};

export function validateImportOrigin(value,{allowLoopbackHttp=false}={}) {
  if(typeof value!=='string'||value.length>2048||/[\s\u0000-\u001f\u007f]/u.test(value))fail('INVALID_ORIGIN');
  let url;try{url=new URL(value);}catch{fail('INVALID_ORIGIN');}
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.username||url.password||url.origin!==value||url.search||url.hash||url.pathname!=='/'||
    url.protocol!=='https:'&&!(allowLoopbackHttp&&loopback&&url.protocol==='http:'))fail('INVALID_ORIGIN');
  return url.origin;
}

const defaults=Object.freeze({maxEntries:100,maxRequests:1000,maxRows:5000,maxPagesPerCohort:25,
  maxResponseBytes:2*1024*1024,maxPatchBytes:262144,timeoutMs:10000,pageSize:200});
function limitsFor(input={}) {
  if(!object(input)||Object.keys(input).some(key=>!own(defaults,key)))fail('INVALID_LIMITS');
  const result={...defaults,...input};
  for(const [key,value]of Object.entries(result))if(!Number.isSafeInteger(value)||value<1||value>defaults[key])fail('INVALID_LIMITS');
  return result;
}

function plainJson(value,{maxDepth=64,maxNodes=32768}={}) {
  const queue=[[value,0]];let nodes=0;
  while(queue.length) {
    const [item,depth]=queue.pop();
    if(++nodes>maxNodes)fail('INVALID_JSON');
    if(item===null||['string','boolean'].includes(typeof item))continue;
    if(typeof item==='number') {if(!Number.isFinite(item))fail('INVALID_JSON');continue;}
    if(typeof item!=='object'||depth>=maxDepth||!Array.isArray(item)&&
      ![Object.prototype,null].includes(Object.getPrototypeOf(item)))fail('INVALID_JSON');
    for(const key of Object.keys(item)) {
      if(['__proto__','constructor','prototype'].includes(key))fail('INVALID_JSON');
      const property=Object.getOwnPropertyDescriptor(item,key);
      if(!property||!own(property,'value'))fail('INVALID_JSON');
      queue.push([property.value,depth+1]);
    }
  }
}

function validateRecord(record) {
  if(!object(record))fail('INVALID_PROPOSAL');
  plainJson(record);
  if(Object.keys(record).some(key=>!writable.has(key)))fail('INVALID_PROPOSAL');
  if(typeof record.account_id!=='string'||!record.account_id||record.account_id.length>100||/[\u0000-\u001f\u007f]/u.test(record.account_id))fail('INVALID_ACCOUNT');
  const dir=own(record,'run_dir')&&record.run_dir!==null;
  const hasSlot=own(record,'slot'),hasDate=own(record,'run_date');
  if(dir&&!safeName(record.run_dir)||hasSlot!==hasDate||hasSlot&&(record.slot===null)!==(record.run_date===null))fail('INVALID_IDENTITY');
  if(!dir&&!(hasSlot&&record.slot!==null&&record.run_date!==null))fail('INVALID_IDENTITY');
  try{validateArticleInputComplexity(record);pipelineInput(record,null,typeof record.title==='string'?record.title:'');}
  catch{fail('INVALID_PROPOSAL');}
  for(const [key,max]of [['title',300],['summary',10000],['notes',20000]])if(own(record,key)&&
    (typeof record[key]!=='string'||record[key].length>max||!record[key].isWellFormed()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(record[key])))fail('INVALID_PROPOSAL');
  if(own(record,'title')&&!record.title.trim())fail('INVALID_PROPOSAL');
  return structuredClone(record);
}

function validateExpected(expected) {
  if(expected===undefined)return undefined;
  if(!object(expected)||Object.keys(expected).sort().join(',')!=='fields,id,version'||!articleId(expected.id)||
    !Number.isSafeInteger(expected.version)||expected.version<1||!object(expected.fields))fail('INVALID_EXPECTED');
  plainJson(expected);
  if(Object.keys(expected.fields).some(key=>!writable.has(key)))fail('INVALID_EXPECTED');
  return structuredClone(expected);
}

function mergeObject(previous,incoming) {
  const result=Object.fromEntries(Object.entries(object(previous)?previous:{}));
  for(const [key,value]of Object.entries(incoming))result[key]=object(value)?mergeObject(result[key],value):structuredClone(value);
  return result;
}
function intendedFields(current,record) {
  const result=Object.fromEntries(Object.entries(record).map(([key,value])=>[key,
    objects.has(key)&&object(value)?mergeObject(current?.[key],value):structuredClone(value)]));
  const stored=current?{...current,...Object.fromEntries(jsonColumns.map(column=>{
    const value=current[jsonNames[column]];return [column,value===undefined||value===null?null:JSON.stringify(value)];
  }))}:null;
  let normalized;
  try{normalized=pipelineInput(result,stored,result.title||current?.title||'');}catch{fail('INVALID_PROPOSAL');}
  for(const column of ARTICLE_PIPELINE_FIELDS) {
    const name=jsonNames[column]||column;
    if(own(result,name))result[name]=jsonNames[column]&&normalized[column]!==null?JSON.parse(normalized[column]):normalized[column];
  }
  for(const name of ['title','summary','notes'])if(typeof result[name]==='string')result[name]=result[name].trim();
  if(own(result,'platform_article_id'))result.platform_article_id=result.platform_article_id===null||result.platform_article_id===''?null:
    typeof result.platform_article_id==='string'?result.platform_article_id.trim():result.platform_article_id;
  for(const name of ['started_at','published_at'])if(own(result,name)&&result[name]!==null) {
    if(name==='started_at'&&result[name]===''){result[name]=null;continue;}
    if(typeof result[name]!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(result[name])||!/(?:Z|[+-]\d{2}:\d{2})$/.test(result[name])||!Number.isFinite(Date.parse(result[name])))fail('INVALID_PROPOSAL');
    result[name]=new Date(result[name]).toISOString();
  }
  if(own(result,'url')&&result.url!==null) {
    let url;try{url=new URL(result.url);}catch{fail('INVALID_PROPOSAL');}
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)fail('INVALID_PROPOSAL');
    result.url=url.href;
  }
  return result;
}
function fieldsMatch(row,intent) {return Object.entries(intent).every(([key,value])=>own(row,key)&&equal(row[key],value));}
function selectorsFor(record) {
  return [record.run_dir!==null&&record.run_dir!==undefined?'dir:'+record.run_dir:null,
    record.slot!==null&&record.slot!==undefined&&record.run_date!==null&&record.run_date!==undefined?
      'pair:'+record.slot+':'+record.run_date:null].filter(Boolean);
}
function selectArticle(rows,record) {
  const byDir=record.run_dir!=null?rows.filter(row=>row.run_dir===record.run_dir):[];
  const byPair=record.slot!=null&&record.run_date!=null?rows.filter(row=>row.slot===record.slot&&row.run_date===record.run_date):[];
  if(byDir.length>1||byPair.length>1||byDir.length&&byPair.length&&byDir[0].id!==byPair[0].id)fail('IDENTITY_CONFLICT');
  const row=byDir[0]||byPair[0]||null;
  if(row&&(row.account_id!==record.account_id||identityFields.some(key=>key!=='account_id'&&own(record,key)&&row[key]!==null&&row[key]!==record[key])))fail('IDENTITY_CONFLICT');
  return row;
}
function checkedRow(row,{account,status,id}={}) {
  if(!object(row)||!articleId(row.id)||typeof row.account_id!=='string'||!Number.isSafeInteger(row.version)||row.version<1||
    !ARTICLE_PIPELINE_ENUMS.status.includes(row.status)||account!==undefined&&row.account_id!==account||
    status!==undefined&&row.status!==status||id!==undefined&&row.id!==id)fail('INVALID_REMOTE_DATA',{halt:true});
  return row;
}

export function importIdempotencyKey(origin,record,{id=null,version=0}={}) {
  return 'hdy-import-'+digest({origin,account_id:record.account_id,identity:identityFields.filter(key=>own(record,key)).map(key=>[key,record[key]]),
    intent:record,expected:{id,version}});
}

function transportFor({origin,token,fetchImpl,limits,signal}) {
  let requests=0,writes=0;
  async function request(path,{method='GET',body,key}={}) {
    if(signal?.aborted)fail('ABORTED',{halt:true});
    if(++requests>limits.maxRequests)fail('REQUEST_LIMIT',{halt:true});
    if(method==='PATCH')writes++;
    const controller=new AbortController();
    const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,limits.timeoutMs);timer.unref?.();
    try {
      const headers={Accept:'application/json',Authorization:'Bearer '+token};
      if(body!==undefined)headers['Content-Type']='application/json';
      if(key)headers['Idempotency-Key']=key;
      let response;
      try{response=await fetchImpl(origin+path,{method,headers,redirect:'manual',signal:controller.signal,
        ...(body!==undefined?{body:JSON.stringify(body)}:{})});}
      catch{fail(method==='PATCH'?'SUBMISSION_UNKNOWN':'READ_FAILED',{halt:method!=='PATCH'});}
      if(!response||!Number.isInteger(response.status)||!response.headers||response.redirected||response.status>=300&&response.status<400)fail('REDIRECT_REJECTED',{halt:true});
      const status=response.status;
      if(status===401||status===403){await response.body?.cancel().catch(()=>{});fail('AUTH_DENIED',{halt:true});}
      if(status===429){await response.body?.cancel().catch(()=>{});fail('REMOTE_RATE_LIMIT',{halt:true});}
      if(status>=500){await response.body?.cancel().catch(()=>{});fail(method==='PATCH'?'SUBMISSION_UNKNOWN':'READ_FAILED',{halt:method!=='PATCH'});}
      if(status<200||status>=300) {await response.body?.cancel().catch(()=>{});return {status,json:null};}
      let json;
      try {
        if(!/application\/json/i.test(response.headers.get('content-type')||''))fail('INVALID_RESPONSE');
        const declared=response.headers.get('content-length');
        if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>limits.maxResponseBytes))fail('RESPONSE_LIMIT');
        const chunks=[];let bytes=0;const reader=response.body?.getReader();
        if(!reader)fail('INVALID_RESPONSE');
        try {
          for(;;) {const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
            if(bytes>limits.maxResponseBytes){await reader.cancel();fail('RESPONSE_LIMIT');}chunks.push(Buffer.from(value));}
        } finally {reader.releaseLock();}
        json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
        plainJson(json,{maxDepth:20,maxNodes:250000});
      } catch(error) {
        if(method==='PATCH')fail('SUBMISSION_UNKNOWN');
        fail(error instanceof ImportApplyError?error.code:'INVALID_RESPONSE',{halt:true});
      }
      return {status,json};
    } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  return {request,counts:()=>({requests,writes})};
}

async function readInventory(transport,record,limits) {
  const rows=[],ids=new Set();
  for(const status of ARTICLE_PIPELINE_ENUMS.status) {
    let total;
    for(let page=1;;page++) {
      if(page>limits.maxPagesPerCohort)fail('PAGE_LIMIT',{halt:true});
      const query=new URLSearchParams({account_id:record.account_id,status,page:String(page),page_size:String(limits.pageSize)});
      const response=await transport.request('/api/v1/articles?'+query);
      if(response.status!==200)fail('READ_REJECTED',{halt:true});
      const data=response.json?.data,meta=response.json?.meta,offset=(page-1)*limits.pageSize;
      if(!Array.isArray(data)||!object(meta)||!Number.isSafeInteger(meta.total)||meta.total<0||
        meta.total>limits.maxRows||data.length>limits.pageSize||meta.page!==page||meta.page_size!==limits.pageSize||
        meta.offset!==offset||typeof meta.has_more!=='boolean'||total!==undefined&&total!==meta.total)fail('INCOMPLETE_READ',{halt:true});
      total=meta.total;
      if(meta.has_more!==(offset+data.length<total)||data.length!==Math.min(limits.pageSize,Math.max(0,total-offset)))fail('INCOMPLETE_READ',{halt:true});
      for(const value of data) {
        const row=checkedRow(value,{account:record.account_id,status});
        if(ids.has(row.id)||rows.length>=limits.maxRows)fail('INCOMPLETE_READ',{halt:true});
        ids.add(row.id);rows.push(row);
      }
      if(!meta.has_more)break;
    }
  }
  return rows;
}
async function detailFor(transport,row,record) {
  const response=await transport.request('/api/v1/articles/'+encodeURIComponent(row.id));
  if(response.status!==200)fail('CURRENT_READ_REJECTED',{halt:true});
  const current=checkedRow(response.json?.data,{account:record.account_id,id:row.id});
  if(selectArticle([current],record)!==current)fail('IDENTITY_CONFLICT');
  return current;
}
async function currentFor(transport,record,limits) {
  const found=selectArticle(await readInventory(transport,record,limits),record);
  return found?detailFor(transport,found,record):null;
}

function checkBaseline(current,expected,intent) {
  if(!expected)fail('EXISTING_DIFFERENCE');
  if(expected.id!==current.id||expected.version!==current.version)fail('BASELINE_CHANGED');
  for(const [key,value]of Object.entries(expected.fields))if(!own(current,key)||!equal(current[key],value))fail('BASELINE_CHANGED');
  for(const [key,value]of Object.entries(intent))if(!own(current,key)||!equal(current[key],value)) {
    if(!own(expected.fields,key)||!equal(expected.fields[key],current[key]))fail('BASELINE_INCOMPLETE');
  }
}
function patchBody(record,current,limits) {
  if(!current&&(!own(record,'title')||!record.title.trim()))fail('MISSING_TITLE');
  const body={...record,...(current?{id:current.id}:{}),version:current?.version||0};
  // Suppress the API's title-based default for an unparsed series number.
  // This is a transport guard, not claimed parser provenance. Never clear a
  // non-NULL current value; the read version CAS protects the NULL bookend.
  if(!own(record,'series_no')&&(!current||current.series_no===null))body.series_no=null;
  const final=intendedFields(current,record);
  try{validateArticleInputComplexity(final);pipelineInput(final,null,final.title||current?.title||'');}catch{fail('INVALID_PROPOSAL');}
  if(Buffer.byteLength(JSON.stringify(body),'utf8')>limits.maxPatchBytes)fail('PATCH_LIMIT');
  return body;
}
function rowResult(row,action,code,extra={}) {return {entry_id:row.entry_id,action,code,...extra};}
function safeRemote(row) {return {remote_id:row.id,version:row.version};}

async function verifyUnknown(transport,proposal,before,intent,limits) {
  try {
    const current=await currentFor(transport,proposal.record,limits);
    if(current&&(!before||current.id===before.id&&current.version>before.version)&&fieldsMatch(current,intent))
      return rowResult(proposal,'verified_unknown','OUTCOME_STATE_MATCHED',{...safeRemote(current),verification:'business_state_matches',delivery:'unconfirmed'});
  } catch(error) {
    return rowResult(proposal,'pending','OUTCOME_UNCONFIRMED',{verification:'unconfirmed',halt:error instanceof ImportApplyError&&error.halt});
  }
  return rowResult(proposal,'pending','OUTCOME_UNCONFIRMED',{verification:'unconfirmed',halt:true});
}

async function applyOne(transport,proposal,limits) {
  const {record,expected}=proposal;
  let before;
  try{before=await currentFor(transport,record,limits);}catch(error){throw error;}
  const intent=intendedFields(before,record);
  if(before&&fieldsMatch(before,intent))return rowResult(proposal,'skipped','ALREADY_MATCHES',safeRemote(before));
  if(before)checkBaseline(before,expected,intent);
  else if(expected)fail('BASELINE_MISSING');
  const body=patchBody(record,before,limits);
  if(own(body,'series_no')&&!own(record,'series_no'))intent.series_no=body.series_no;
  const sentRecord=Object.fromEntries(Object.entries(body).filter(([name])=>!['id','version'].includes(name)));
  const key=importIdempotencyKey(transport.origin||'',sentRecord,{id:before?.id||null,version:body.version});
  let response;
  try {response=await transport.request('/api/v1/articles',{method:'PATCH',body,key});}
  catch(error) {
    if(error instanceof ImportApplyError&&error.code==='SUBMISSION_UNKNOWN')return verifyUnknown(transport,proposal,before,intent,limits);
    throw error;
  }
  if(response.status===409)return rowResult(proposal,'conflict','REMOTE_CONFLICT');
  if(![200,201].includes(response.status))fail('WRITE_REJECTED');
  let result;
  try {
    result=checkedRow(response.json?.data,{account:record.account_id,...(before?{id:before.id}:{})});
    const action=result.upsert_action;
    if(!['created','updated','unchanged'].includes(action)||response.status!==(action==='created'?201:200)||
      action==='created'&&(before!==null||result.version!==1)||action==='updated'&&(!before||result.version!==before.version+1)||
      action==='unchanged'&&(!before||result.version!==before.version)||!fieldsMatch(result,intent)||selectArticle([result],record)!==result)fail('INVALID_WRITE_RESPONSE');
  } catch {return verifyUnknown(transport,proposal,before,intent,limits);}
  return rowResult(proposal,result.upsert_action==='unchanged'?'skipped':result.upsert_action,'APPLIED',safeRemote(result));
}

function safeReport(value,token) {
  if(typeof value==='string')return value.includes(token)?value.split(token).join('[REDACTED]'):value;
  if(Array.isArray(value))return value.map(item=>safeReport(item,token));
  if(object(value))return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,safeReport(item,token)]));
  return value;
}

export async function applyImportBatch({origin,token,proposals,fetchImpl=globalThis.fetch,limits:inputLimits={},signal,allowLoopbackHttp=false}={}) {
  origin=validateImportOrigin(origin,{allowLoopbackHttp});
  if(typeof token!=='string'||!token||token.length>4096||/[\s\u0000-\u001f\u007f]/u.test(token))fail('INVALID_TOKEN');
  if(typeof fetchImpl!=='function'||!Array.isArray(proposals))fail('INVALID_CONFIGURATION');
  const limits=limitsFor(inputLimits);
  if(proposals.length>limits.maxEntries)fail('ENTRY_LIMIT');
  const results=new Array(proposals.length),prepared=new Array(proposals.length),identities=new Map(),duplicates=new Map();
  for(const [index,proposal]of proposals.entries()) {
    const entry_id=safeName(proposal?.entry_id)?proposal.entry_id:'entry-'+(index+1);
    try {
      if(!object(proposal)||!safeName(proposal.entry_id))fail('INVALID_ENTRY');
      const record=validateRecord(proposal.record),expected=validateExpected(proposal.expected),item={entry_id,record,expected};
      prepared[index]=item;
      for(const identity of selectorsFor(record)) {
        // Both article identity indexes are global, including across accounts.
        const name=identity,prior=identities.get(name);
        if(prior!==undefined) {
          if(equal(prepared[prior].record,record))duplicates.set(index,prior);
          else {results[prior]=rowResult(prepared[prior],'conflict','DUPLICATE_INPUT_CONFLICT');results[index]=rowResult(item,'conflict','DUPLICATE_INPUT_CONFLICT');}
        } else identities.set(name,index);
      }
    } catch(error) {results[index]={entry_id,action:'failed',code:error instanceof ImportApplyError?error.code:'INVALID_PROPOSAL'};}
  }
  const transport=transportFor({origin,token,fetchImpl,limits,signal});transport.origin=origin;
  let halted=false;
  for(let index=0;index<prepared.length;index++) {
    const proposal=prepared[index];if(results[index])continue;
    if(halted){results[index]=rowResult(proposal,'not_attempted','BATCH_STOPPED');continue;}
    const prior=duplicates.get(index);
    if(prior!==undefined) {
      const successful=['created','updated','skipped','verified_unknown'].includes(results[prior]?.action);
      results[index]=rowResult(proposal,successful?'skipped':'not_attempted',successful?'DUPLICATE_INPUT':'DUPLICATE_OF_FAILED');continue;
    }
    try {
      results[index]=await applyOne(transport,proposal,limits);
      if(results[index].halt||results[index].action==='pending')halted=true;
      delete results[index].halt;
    } catch(error) {
      const code=error instanceof ImportApplyError?error.code:'APPLY_FAILED';
      const conflict=['IDENTITY_CONFLICT','EXISTING_DIFFERENCE','BASELINE_CHANGED','BASELINE_INCOMPLETE','BASELINE_MISSING'].includes(code);
      results[index]=rowResult(proposal,conflict?'conflict':'failed',code);
      if(error instanceof ImportApplyError&&error.halt)halted=true;
    }
  }
  const actions=['created','updated','skipped','failed','conflict','pending','verified_unknown','not_attempted'];
  return safeReport({mode:'apply',consistency:'paged_not_atomic',results,
    summary:Object.fromEntries(actions.map(action=>[action,results.filter(row=>row.action===action).length])),...transport.counts()},token);
}
