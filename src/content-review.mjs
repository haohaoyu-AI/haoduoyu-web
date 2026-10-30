import {bodyFor,authenticate,digest,stable,fail} from './security.mjs';
import {randomUUID} from 'node:crypto';
import {noteEditor,limitNoteWrites} from './public-note-access.mjs';
import {storeFor,consistentRead,mutate} from './storage.mjs';
import {dailyNotesOwner} from './daily-notes.mjs';
import {reviewUuid,reviewHash,reviewSpecs,reviewDate,reviewInput,reviewView,reviewEqual} from './content-review-validation.mjs';

const tombstoneActor=owner=>'review-tombstones:'+owner;
const tombstoneKey=(kind,id)=>'review-deleted:'+kind+':'+id;
const json=(data,status=200)=>Response.json({data},{status});
const errorWith=(status,code,message,extra={})=>{throw Object.assign(new Error(message),{status,code,...extra});};
const errorBody=error=>({code:error.code,message:error.message,...(error.existing_id?{existing_id:error.existing_id}:{}),...(error.snapshot_count!==undefined?{snapshot_count:error.snapshot_count}:{})});
const columnsFor=kind=>Object.keys(reviewSpecs[kind].fields);
const columnFor=(spec,key)=>spec.json?.includes(key)?key+'_json':key;
const valueFor=(spec,key,row)=>spec.json?.includes(key)&&row[key]!==null?JSON.stringify(stable(row[key])):row[key];
// Date-only values stay business dates. Instants are converted to Asia/Shanghai
// before LIMIT/OFFSET: UTC Z shifts by +8 hours, and an explicit offset is applied
// to the clock time. +08:00 therefore keeps its own calendar day.
const articlePublishedDaySql=`CASE
  WHEN length(published_at)=10
    AND published_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(published_at,'+0 days')=published_at THEN published_at
  WHEN substr(published_at,11,1)='T'
    AND substr(published_at,12,8) GLOB '[0-9][0-9]:[0-9][0-9]:[0-9][0-9]'
    AND date(substr(published_at,1,10),'+0 days')=substr(published_at,1,10)
    AND (substr(published_at,-1)='Z' OR
      (substr(published_at,-6,1) IN ('+','-') AND substr(published_at,-5) GLOB '[0-9][0-9]:[0-9][0-9]'))
    THEN date(substr(published_at,1,19),printf('%+d minutes',480-CASE
      WHEN substr(published_at,-1)='Z' THEN 0
      ELSE (CASE substr(published_at,-6,1) WHEN '-' THEN -1 ELSE 1 END)
        *(CAST(substr(published_at,-5,2) AS INTEGER)*60+CAST(substr(published_at,-2) AS INTEGER))
    END))
  ELSE NULL END`;
async function actorFor(store,request,owner,env,origin,write=false) {
  const explicit=request.headers.has('authorization')||/(?:^|;\s*)matrix_session(?:\s*=|\s*(?:;|$))/.test(request.headers.get('cookie')||'');
  if(request.headers.has('authorization')&&!request.headers.get('authorization'))throw fail(401,'UNAUTHORIZED','授权凭据无效');
  // An explicitly supplied invalid session or key never becomes an anonymous write.
  if(explicit)await authenticate(store,request,write?'write':'read');
  const actor=await noteEditor(store,request,owner,env,'content-review',origin,{write});
  if(!actor)throw fail(explicit?403:401,explicit?'FORBIDDEN':'UNAUTHORIZED','无权访问内容复盘');
  if(!await store.get('SELECT id FROM users WHERE id=?',owner))throw fail(503,'REVIEW_CONFIG','内容复盘所有者尚未配置');
  return actor;
}
function writeLimit(actor,owner) {
  if(actor.kind!=='public')return;
  try{limitNoteWrites(owner,'content-review');}catch(error){if(error.status===429)error.code='REVIEW_RATE_LIMIT';throw error;}
}
function validateQuery(query,kind,list) {
  const filters={articles:['account','from','to'],snapshots:['account','article_id'],reports:['account','period_type','from','to'],playbooks:['account']}[kind];
  const allowed=list?['offset','read_revision',...filters]:[];
  if([...query.keys()].some(key=>!allowed.includes(key)||query.getAll(key).length!==1))throw fail(400,'VALIDATION_ERROR','查询参数无效');
  for(const key of ['offset','read_revision'])if(query.has(key)&&(!/^(0|[1-9]\d*)$/.test(query.get(key))||!Number.isSafeInteger(Number(query.get(key)))))throw fail(400,'VALIDATION_ERROR','分页参数须为非负安全整数');
  const where=[],args=[];
  for(const key of filters)if(query.has(key)) {
    const value=query.get(key);
    if(key==='from'||key==='to') {
      reviewDate(value);
      const column=kind==='articles'?articlePublishedDaySql:'period_start';
      where.push(column+(key==='from'?'>=?':'<=?'));args.push(value);
    }else if(kind==='snapshots'&&key==='account') {
      const normalized=reviewSpecs.articles.fields.account(value);
      where.push('article_id IN (SELECT a.id FROM matrix_review_articles a WHERE a.user_id=matrix_review_snapshots.user_id AND a.account=?)');args.push(normalized);
    }else{
      const validator=reviewSpecs[kind].fields[key];
      const normalized=validator(value);where.push(key+'=?');args.push(normalized);
    }
  }
  if(query.has('from')&&query.has('to')&&query.get('from')>query.get('to'))throw fail(400,'VALIDATION_ERROR','日期范围无效');
  return {where,args,offset:Number(query.get('offset')||0),expected:query.has('read_revision')?Number(query.get('read_revision')):null};
}
async function readRow(store,kind,owner,id) {
  return reviewView(kind,await store.get('SELECT * FROM '+reviewSpecs[kind].table+' WHERE user_id=? AND id=?',owner,id));
}
async function checkRelations(store,kind,owner,id,row) {
  let existing;
  if(kind==='articles'&&row.platform_article_id!==null)existing=await store.get('SELECT id FROM matrix_review_articles WHERE user_id=? AND account=? AND platform_article_id=? AND id<>?',owner,row.account,row.platform_article_id,id);
  if(kind==='snapshots') {
    if(!await store.get('SELECT id FROM matrix_review_articles WHERE user_id=? AND id=?',owner,row.article_id))throw fail(404,'ARTICLE_NOT_FOUND','快照所属文章不存在');
    existing=await store.get('SELECT id FROM matrix_review_snapshots WHERE user_id=? AND article_id=? AND snapshot_date=? AND id<>?',owner,row.article_id,row.snapshot_date,id);
  }
  if(kind==='reports')existing=await store.get('SELECT id FROM matrix_review_reports WHERE user_id=? AND account=? AND period_type=? AND period_start=? AND id<>?',owner,row.account,row.period_type,row.period_start,id);
  if(kind==='playbooks')existing=await store.get('SELECT id FROM matrix_review_playbooks WHERE user_id=? AND account=? AND version=? AND id<>?',owner,row.account,row.version,id);
  if(existing)errorWith(409,'REVIEW_UNIQUE_CONFLICT','同一业务记录已存在',{existing_id:existing.id});
}
function queueTombstone(store,owner,kind,row,time) {
  const receipt=JSON.stringify({deleted:true,id:row.id});
  store.queue('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,200,?) ON CONFLICT(actor,key) DO UPDATE SET request_hash=excluded.request_hash,response_json=excluded.response_json,created_at=excluded.created_at',tombstoneActor(owner),tombstoneKey(kind,row.id),row.content_hash,receipt,time);
}
async function put(db,request,kind,owner,id,input,env,origin) {
  const values=reviewInput(kind,input),spec=reviewSpecs[kind];
  return (await mutate(db,async store=>{
    const actor=await actorFor(store,request,owner,env,origin,true);
    if(await store.get('SELECT key FROM idempotency WHERE actor=? AND key=?',tombstoneActor(owner),tombstoneKey(kind,id)))throw fail(409,'REVIEW_DELETED','此标识已永久删除，请为新记录生成新 UUID');
    const current=await readRow(store,kind,owner,id);
    if(current) {
      if(!reviewEqual(kind,current,values))throw fail(409,'IDEMPOTENCY_CONFLICT','该 UUID 已用于不同内容；修改请使用 PATCH 和最新哈希');
      return {replayed:true,response:json(current)};
    }
    await checkRelations(store,kind,owner,id,values);
    const time=new Date().toISOString(),row={id,...values,...Object.fromEntries(spec.timestamps.map(key=>[key,time]))};
    const keys=[...columnsFor(kind),...spec.timestamps],columns=['user_id','id',...keys.map(key=>columnFor(spec,key))];
    store.queue('INSERT INTO '+spec.table+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')',owner,id,...keys.map(key=>valueFor(spec,key,row)));
    store.audit(actor.actor,'review.'+kind+'.create',id);
    return {actor,response:json({...row,content_hash:digest(JSON.stringify(stable(row)))},201)};
  })).response;
}
async function patch(db,request,kind,owner,id,input,env,origin) {
  const {expected_hash,...changes}=input;
  if(typeof expected_hash!=='string'||!reviewHash.test(expected_hash))throw fail(400,'VALIDATION_ERROR','修改需要有效的 expected_hash');
  const partial=reviewInput(kind,changes,{patch:true}),spec=reviewSpecs[kind];
  return (await mutate(db,async store=>{
    const actor=await actorFor(store,request,owner,env,origin,true),current=await readRow(store,kind,owner,id);
    if(!current)throw fail(404,'NOT_FOUND','记录不存在');
    if(current.content_hash!==expected_hash)throw fail(409,'VERSION_CONFLICT','记录已改变，请读取最新内容再修改');
    const values=reviewInput(kind,{...Object.fromEntries(columnsFor(kind).map(key=>[key,current[key]])),...partial});
    await checkRelations(store,kind,owner,id,values);
    if(reviewEqual(kind,current,values))return {replayed:true,response:json(current)};
    const {content_hash,...previous}=current,row={...previous,...values};
    if(spec.timestamps.includes('updated_at'))row.updated_at=new Date().toISOString();
    const keys=[...columnsFor(kind),...(spec.timestamps.includes('updated_at')?['updated_at']:[])];
    store.queue('UPDATE '+spec.table+' SET '+keys.map(key=>columnFor(spec,key)+'=?').join(',')+' WHERE user_id=? AND id=?',...keys.map(key=>valueFor(spec,key,row)),owner,id);
    store.expectChange();store.audit(actor.actor,'review.'+kind+'.update',id);
    return {actor,response:json({...row,content_hash:digest(JSON.stringify(stable(row)))})};
  })).response;
}
async function remove(db,request,kind,owner,id,input,env,origin) {
  const allowed=kind==='articles'?['expected_hash','save_id','cascade_snapshots']:['expected_hash','save_id'];
  if(Object.keys(input).some(key=>!allowed.includes(key))||typeof input.expected_hash!=='string'||!reviewHash.test(input.expected_hash)||typeof input.save_id!=='string'||!reviewUuid.test(input.save_id)||Object.hasOwn(input,'cascade_snapshots')&&typeof input.cascade_snapshots!=='boolean')throw fail(400,'VALIDATION_ERROR','删除需要 expected_hash 和 UUID save_id');
  const key='review-delete:'+input.save_id,requestHash=digest(JSON.stringify(stable({kind,id,...input})));
  return (await mutate(db,async store=>{
    const actor=await actorFor(store,request,owner,env,origin,true);
    const saved=await store.get('SELECT request_hash,response_json FROM idempotency WHERE actor=? AND key=?',actor.actor,key);
    const current=await readRow(store,kind,owner,id);
    if(saved) {
      if(saved.request_hash!==requestHash)throw fail(409,'IDEMPOTENCY_CONFLICT','save_id 已用于不同的删除请求');
      if(current)throw fail(409,'VERSION_CONFLICT','该标识出现新记录，请重新读取后核对');
      return {replayed:true,response:json(JSON.parse(saved.response_json))};
    }
    if(!current)throw fail(404,'NOT_FOUND','记录不存在');
    if(current.content_hash!==input.expected_hash)throw fail(409,'VERSION_CONFLICT','记录已改变，请读取最新内容再删除');
    const time=new Date().toISOString();let children=[];
    if(kind==='articles') {
      children=await store.all('SELECT * FROM matrix_review_snapshots WHERE user_id=? AND article_id=?',owner,id);
      if(children.length&&input.cascade_snapshots!==true)errorWith(409,'ARTICLE_HAS_SNAPSHOTS','文章仍有关联快照；请确认 cascade_snapshots:true 后删除',{snapshot_count:children.length});
      for(const child of children)queueTombstone(store,owner,'snapshots',reviewView('snapshots',child),time);
      // Explicit deletion also supports databases with foreign-key enforcement disabled.
      store.queue('DELETE FROM matrix_review_snapshots WHERE user_id=? AND article_id=?',owner,id);
    }
    store.queue('DELETE FROM '+reviewSpecs[kind].table+' WHERE user_id=? AND id=?',owner,id);store.expectChange();
    const result={deleted:true,id,...(kind==='articles'?{deleted_snapshots:children.length}:{})};
    queueTombstone(store,owner,kind,current,time);
    store.queue('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,200,?)',actor.actor,key,requestHash,JSON.stringify(result),time);
    store.audit(actor.actor,'review.'+kind+'.delete',id,kind==='articles'?{deleted_snapshots:children.length}:{});
    return {actor,response:json(result)};
  })).response;
}
async function handle(db,request,route,env,origin,initialRevision) {
  const owner=dailyNotesOwner(env),url=new URL(request.url),method=request.method;
  const batch=route==='/review/snapshots:batch';
  const match=/^\/review\/(articles|snapshots|reports|playbooks)(?:\/([a-f0-9-]+))?$/.exec(route);
  if(!batch&&(!match||match[2]&&!reviewUuid.test(match[2])))throw fail(404,'NOT_FOUND','内容复盘接口不存在');
  const kind=batch?'snapshots':match[1],id=match?.[2],list=!batch&&!id&&method==='GET';
  if(batch&&method!=='PUT'||!batch&&!['GET',...(id?['PUT','PATCH','DELETE']:[])].includes(method))throw fail(404,'NOT_FOUND','内容复盘接口不存在');
  const filters=validateQuery(url.searchParams,kind,list);
  if(method==='GET')return consistentRead(db,async(store,before)=>{
    await actorFor(store,request,owner,env,origin);
    if(filters.expected!==null&&filters.expected!==before)throw fail(409,'READ_REVISION_CHANGED','数据已更新，请从第一页重新读取');
    if(id) {const row=await readRow(store,kind,owner,id);if(!row)throw fail(404,'NOT_FOUND','记录不存在');return json(row);}
    const rows=await store.all('SELECT * FROM '+reviewSpecs[kind].table+' WHERE user_id=?'+filters.where.map(sql=>' AND '+sql).join('')+' ORDER BY '+reviewSpecs[kind].order+' LIMIT 101 OFFSET ?',owner,...filters.args,filters.offset);
    const items=rows.slice(0,100).map(row=>reviewView(kind,row));
    return json({items,has_more:rows.length>100,read_revision:before});
  },initialRevision);
  const actor=await actorFor(storeFor(db),request,owner,env,origin,true);writeLimit(actor,owner);
  const input=await bodyFor(request);
  if(batch) {
    if(Object.keys(input).join(',')!=='items'||!Array.isArray(input.items)||input.items.length<1||input.items.length>200)throw fail(400,'VALIDATION_ERROR','批量快照需要 1–200 条 items');
    const items=[];
    for(const item of input.items) {
      let itemId=item?.id;
      try {
        if(!item||typeof item!=='object'||Array.isArray(item)||typeof itemId!=='string'||!reviewUuid.test(itemId))throw fail(400,'VALIDATION_ERROR','每条快照需要有效 UUID id');
        const {id:ignored,...body}=item,response=await put(db,request,kind,owner,itemId,body,env,origin);
        items.push({id:itemId,status:response.status,...await response.json()});
      }catch(error) {
        // Never guess whether an unknown storage/network failure committed.
        if(!error.status)throw error;
        items.push({id:typeof itemId==='string'?itemId:null,status:error.status,error:errorBody(error)});
      }
    }
    return json({items});
  }
  if(method==='PUT')return put(db,request,kind,owner,id,input,env,origin);
  if(method==='PATCH')return patch(db,request,kind,owner,id,input,env,origin);
  return remove(db,request,kind,owner,id,input,env,origin);
}
export async function handleContentReview(...args) {
  try{return await handle(...args);}catch(error){
    if(error.existing_id||error.snapshot_count!==undefined)return Response.json({error:errorBody(error),request_id:args[6]?.rid||randomUUID()},{status:error.status});
    throw error;
  }
}
