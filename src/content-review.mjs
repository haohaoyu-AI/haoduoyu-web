import {bodyFor,authenticate,digest,stable,fail} from './security.mjs';
import {randomUUID} from 'node:crypto';
import {noteEditor,limitNoteWrites} from './public-note-access.mjs';
import {storeFor,consistentRead,mutate} from './storage.mjs';
import {dailyNotesOwner} from './daily-notes.mjs';
import {reviewUuid,reviewHash,reviewSpecs,reviewDate,reviewInput,reviewView,reviewEqual,reviewContentHash,reviewRuleChanges} from './content-review-validation.mjs';
import {enrichArticles,enrichArticle,buildOverview} from '../shared/review-analytics.mjs';

const tombstoneActor=owner=>'review-tombstones:'+owner;
const tombstoneKey=(kind,id)=>'review-deleted:'+kind+':'+id;
const json=(data,status=200)=>Response.json({data},{status});
const errorWith=(status,code,message,extra={})=>{throw Object.assign(new Error(message),{status,code,...extra});};
const errorBody=error=>({code:error.code,message:error.message,...(error.existing_id?{existing_id:error.existing_id}:{}),...(error.snapshot_count!==undefined?{snapshot_count:error.snapshot_count}:{})});
const columnsFor=kind=>Object.keys(reviewSpecs[kind].fields);
const columnFor=(spec,key)=>spec.json?.includes(key)?key+'_json':key;
const valueFor=(spec,key,row)=>spec.json?.includes(key)&&row[key]!==null?JSON.stringify(stable(row[key])):row[key];
// Date-only values are business dates. Timestamp dates are always Beijing dates,
// including filtering before LIMIT/OFFSET; no host-local timezone is consulted.
const articlePublishedDaySql=`CASE
  WHEN length(published_at)=10
    AND published_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(published_at,'+0 days')=published_at THEN published_at
  WHEN substr(published_at,11,1)='T'
    AND substr(published_at,12,8) GLOB '[0-9][0-9]:[0-9][0-9]:[0-9][0-9]'
    AND date(substr(published_at,1,10),'+0 days')=substr(published_at,1,10)
    AND (substr(published_at,-1)='Z' OR
      (substr(published_at,-6,1) IN ('+','-') AND substr(published_at,-5) GLOB '[0-9][0-9]:[0-9][0-9]'))
    THEN date(published_at,'+8 hours')
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
  const allowed=list?['offset','read_revision',...(kind==='articles'?['page','verdict']:[]),...filters]:[];
  if([...query.keys()].some(key=>!allowed.includes(key)||query.getAll(key).length!==1))throw fail(400,'VALIDATION_ERROR','查询参数无效');
  for(const key of ['offset','read_revision'])if(query.has(key)&&(!/^(0|[1-9]\d*)$/.test(query.get(key))||!Number.isSafeInteger(Number(query.get(key)))))throw fail(400,'VALIDATION_ERROR','分页参数须为非负安全整数');
  const where=[],args=[];
  if(query.has('page')&&(!/^[1-9]\d*$/.test(query.get('page'))||!Number.isSafeInteger(Number(query.get('page')))||query.has('offset')))throw fail(400,'VALIDATION_ERROR','Invalid page');
  if(query.has('verdict')&&!['爆','中','扑','pending'].includes(query.get('verdict')))throw fail(400,'VALIDATION_ERROR','Invalid verdict');
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
  const offset=query.has('page')?(Number(query.get('page'))-1)*100:Number(query.get('offset')||0);
  if(!Number.isSafeInteger(offset))throw fail(400,'VALIDATION_ERROR','Invalid page');
  return {where,args,offset,expected:query.has('read_revision')?Number(query.get('read_revision')):null,verdict:query.get('verdict'),page:query.has('page')?Number(query.get('page')):null};
}
const publicView=(kind,row)=>kind==='playbooks'?{...row,rules:row.rules.map(rule=>({...rule,status:rule.status??'candidate'}))}:row;
async function accountData(store,owner,account=null) {
  const data={};
  for(const kind of ['articles','snapshots','reports','playbooks']) {
    const accountWhere=account===null?'':kind==='snapshots'?' AND article_id IN (SELECT id FROM matrix_review_articles WHERE user_id=? AND account=?)':' AND account=?';
    const args=account===null?[]:kind==='snapshots'?[owner,account]:[account];
    data[kind]=(await store.all('SELECT * FROM '+reviewSpecs[kind].table+' WHERE user_id=?'+accountWhere+' ORDER BY '+reviewSpecs[kind].order,owner,...args)).map(row=>reviewView(kind,row));
  }
  return data;
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
  const values=reviewInput(kind,input,{validateDaily:false}),spec=reviewSpecs[kind];
  return (await mutate(db,async store=>{
    const actor=await actorFor(store,request,owner,env,origin,true);
    if(await store.get('SELECT key FROM idempotency WHERE actor=? AND key=?',tombstoneActor(owner),tombstoneKey(kind,id)))throw fail(409,'REVIEW_DELETED','此标识已永久删除，请为新记录生成新 UUID');
    const current=await readRow(store,kind,owner,id);
    if(current) {
      if(!reviewEqual(kind,current,values))throw fail(409,'IDEMPOTENCY_CONFLICT','该 UUID 已用于不同内容；修改请使用 PATCH 和最新哈希');
      return {replayed:true,response:json(current)};
    }
    reviewInput(kind,input);
    if(kind==='reports'&&values.period_type==='three_day')throw fail(400,'VALIDATION_ERROR','New three_day reports are retired');
    await checkRelations(store,kind,owner,id,values);
    const time=new Date().toISOString(),row={id,...values,...Object.fromEntries(spec.timestamps.map(key=>[key,time]))};
    const keys=[...columnsFor(kind),...spec.timestamps],columns=['user_id','id',...keys.map(key=>columnFor(spec,key))];
    store.queue('INSERT INTO '+spec.table+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')',owner,id,...keys.map(key=>valueFor(spec,key,row)));
    store.audit(actor.actor,'review.'+kind+'.create',id);
    return {actor,response:json({...row,content_hash:reviewContentHash(row)},201)};
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
    if(kind==='reports'&&partial.period_type==='three_day'&&current.period_type!=='three_day')throw fail(400,'VALIDATION_ERROR','New three_day reports are retired');
    const values=reviewInput(kind,{...Object.fromEntries(columnsFor(kind).map(key=>[key,current[key]])),...partial},{validateDaily:Object.hasOwn(partial,'summary_md')||Object.hasOwn(partial,'period_type')});
    await checkRelations(store,kind,owner,id,values);
    if(reviewEqual(kind,current,values))return {replayed:true,response:json(current)};
    const {content_hash,...previous}=current,row={...previous,...values};
    if(spec.timestamps.includes('updated_at'))row.updated_at=new Date().toISOString();
    const keys=[...columnsFor(kind),...(spec.timestamps.includes('updated_at')?['updated_at']:[])];
    store.queue('UPDATE '+spec.table+' SET '+keys.map(key=>columnFor(spec,key)+'=?').join(',')+' WHERE user_id=? AND id=?',...keys.map(key=>valueFor(spec,key,row)),owner,id);
    store.expectChange();store.audit(actor.actor,'review.'+kind+'.update',id);
    return {actor,response:json({...row,content_hash:reviewContentHash(row)})};
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
async function patchRule(db,request,owner,ruleId,input,env,origin) {
  const {account,playbook_id,expected_hash,save_id,...changes}=input;
  const normalizedAccount=reviewSpecs.playbooks.fields.account(account);
  if(!reviewUuid.test(playbook_id||'')||!reviewUuid.test(save_id||'')||!reviewHash.test(expected_hash||''))throw fail(400,'VALIDATION_ERROR','Rule update requires account, playbook_id, expected_hash and UUID save_id');
  const partial=reviewRuleChanges(changes),key='review-rule:'+save_id;
  const requestHash=digest(JSON.stringify(stable({rule_id:ruleId,account:normalizedAccount,playbook_id,expected_hash,changes:partial})));
  return (await mutate(db,async store=>{
    const actor=await actorFor(store,request,owner,env,origin,true);
    const receipt=await store.get('SELECT request_hash,response_json FROM idempotency WHERE actor=? AND key=?',actor.actor,key);
    if(receipt) {
      if(receipt.request_hash!==requestHash)throw fail(409,'IDEMPOTENCY_CONFLICT','save_id already identifies a different rule update');
      return {replayed:true,response:json(JSON.parse(receipt.response_json))};
    }
    const current=await readRow(store,'playbooks',owner,playbook_id);
    if(!current||current.account!==normalizedAccount)throw fail(404,'NOT_FOUND','Playbook not found');
    if(current.content_hash!==expected_hash)throw fail(409,'VERSION_CONFLICT','Playbook changed; read it again');
    const matches=current.rules.filter(rule=>rule.rule_id===ruleId);
    if(matches.length!==1)throw fail(matches.length?409:404,matches.length?'REVIEW_RULE_AMBIGUOUS':'NOT_FOUND','Rule must identify exactly one rule in the selected playbook');
    const rules=current.rules.map(rule=>rule.rule_id===ruleId?{...rule,...partial}:rule);
    const {content_hash:ignored,...previous}=current,row={...previous,rules};
    const result={...row,content_hash:reviewContentHash(row)},time=new Date().toISOString();
    if(JSON.stringify(stable(rules))!==JSON.stringify(stable(current.rules))) {
      store.queue('UPDATE matrix_review_playbooks SET rules_json=? WHERE user_id=? AND id=?',JSON.stringify(stable(rules)),owner,playbook_id);
      store.expectChange();
    }
    store.queue('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,200,?)',actor.actor,key,requestHash,JSON.stringify(publicView('playbooks',result)),time);
    store.audit(actor.actor,'review.rules.update',playbook_id,{rule_id:ruleId});
    return {actor,response:json(publicView('playbooks',result))};
  })).response;
}
async function handle(db,request,route,env,origin,initialRevision) {
  const owner=dailyNotesOwner(env),url=new URL(request.url),method=request.method;
  const batch=route==='/review/snapshots:batch';
  if(route==='/review/overview') {
    const query=url.searchParams;
    if(method!=='GET')throw fail(404,'NOT_FOUND','Review endpoint not found');
    if([...query.keys()].some(key=>!['account','range','week'].includes(key)||query.getAll(key).length!==1)||!query.has('account')||query.has('range')&&!['7d','30d'].includes(query.get('range'))||query.has('week')&&!['this','last'].includes(query.get('week')))throw fail(400,'VALIDATION_ERROR','Invalid overview query');
    const account=reviewSpecs.articles.fields.account(query.get('account'));
    return consistentRead(db,async(store,before)=>{
      await actorFor(store,request,owner,env,origin);
      const data=await accountData(store,owner,account);
      const overview=buildOverview(data,{account,range:query.get('range')||'7d',week:query.get('week')||'this'}),cards={each_prev_delta:{}};
      for(const field of ['count','hit_rate','miss_rate','ctr_median']) {
        cards[field]=overview.current[field];cards[field+'_prev_delta']=overview.changes[field].delta;
        cards.each_prev_delta[field]=overview.changes[field].delta;
      }
      return json({...overview,cards,read_revision:before});
    },initialRevision);
  }
  const ruleMatch=/^\/review\/rules\/([^/]+)$/.exec(route);
  if(ruleMatch) {
    if(method!=='PATCH'||url.search)throw fail(404,'NOT_FOUND','Review endpoint not found');
    let ruleId;try{ruleId=decodeURIComponent(ruleMatch[1]);}catch{throw fail(400,'VALIDATION_ERROR','Invalid rule id');}
    if(!ruleId||Buffer.byteLength(ruleId,'utf8')>120||/[\u0000-\u001f\u007f]/u.test(ruleId))throw fail(400,'VALIDATION_ERROR','Invalid rule id');
    const actor=await actorFor(storeFor(db),request,owner,env,origin,true);writeLimit(actor,owner);
    return patchRule(db,request,owner,ruleId,await bodyFor(request),env,origin);
  }
  const versionMatch=/^\/review\/playbooks\/([1-9]\d*)$/.exec(route);
  if(versionMatch&&method==='PUT') {
    if(url.search||!Number.isSafeInteger(Number(versionMatch[1])))throw fail(400,'VALIDATION_ERROR','Invalid playbook version');
    const actor=await actorFor(storeFor(db),request,owner,env,origin,true);writeLimit(actor,owner);
    const {id,...input}=await bodyFor(request);
    if(!reviewUuid.test(id||'')||input.version!==Number(versionMatch[1]))throw fail(400,'VALIDATION_ERROR','Numeric version PUT requires UUID id and matching version');
    return put(db,request,'playbooks',owner,id,input,env,origin);
  }
  const match=/^\/review\/(articles|snapshots|reports|playbooks)(?:\/([a-f0-9-]+))?$/.exec(route);
  if(!batch&&(!match||match[2]&&!reviewUuid.test(match[2])))throw fail(404,'NOT_FOUND','内容复盘接口不存在');
  const kind=batch?'snapshots':match[1],id=match?.[2],list=!batch&&!id&&method==='GET';
  if(batch&&method!=='PUT'||!batch&&!['GET',...(id?['PUT','PATCH','DELETE']:kind==='articles'?['POST']:[])].includes(method))throw fail(404,'NOT_FOUND','内容复盘接口不存在');
  const filters=validateQuery(url.searchParams,kind,list);
  if(method==='GET')return consistentRead(db,async(store,before)=>{
    await actorFor(store,request,owner,env,origin);
    if(filters.expected!==null&&filters.expected!==before)throw fail(409,'READ_REVISION_CHANGED','数据已更新，请从第一页重新读取');
    if(id) {
      const row=await readRow(store,kind,owner,id);if(!row)throw fail(404,'NOT_FOUND','记录不存在');
      if(kind==='articles') {
        const data=await accountData(store,owner,row.account);
        const snapshots=data.snapshots.filter(item=>item.article_id===id).sort((a,b)=>a.snapshot_date.localeCompare(b.snapshot_date)||a.id.localeCompare(b.id));
        return json({...enrichArticle(row,data.snapshots,data.playbooks,data.reports,data.articles),snapshots});
      }
      return json(publicView(kind,row));
    }
    if(kind==='articles') {
      const rows=await store.all('SELECT * FROM '+reviewSpecs[kind].table+' WHERE user_id=?'+filters.where.map(sql=>' AND '+sql).join('')+' ORDER BY '+reviewSpecs[kind].order,owner,...filters.args);
      const data=await accountData(store,owner,url.searchParams.has('account')?reviewSpecs.articles.fields.account(url.searchParams.get('account')):null);
      const enriched=new Map(enrichArticles(data,{}).map(row=>[row.id,row]));
      const all=rows.map(row=>enriched.get(row.id)).filter(row=>!filters.verdict||(filters.verdict==='pending'?row.verdict===null:row.verdict===filters.verdict));
      const items=all.slice(filters.offset,filters.offset+100);
      return json({items,has_more:all.length>filters.offset+100,read_revision:before,...(filters.page!==null?{page:filters.page,page_size:100,total:all.length}:{})});
    }
    const rows=await store.all('SELECT * FROM '+reviewSpecs[kind].table+' WHERE user_id=?'+filters.where.map(sql=>' AND '+sql).join('')+' ORDER BY '+reviewSpecs[kind].order+' LIMIT 101 OFFSET ?',owner,...filters.args,filters.offset);
    const items=rows.slice(0,100).map(row=>publicView(kind,reviewView(kind,row)));
    return json({items,has_more:rows.length>100,read_revision:before});
  },initialRevision);
  const actor=await actorFor(storeFor(db),request,owner,env,origin,true);writeLimit(actor,owner);
  const input=await bodyFor(request);
  if(method==='POST') {
    const {id,...values}=input;
    if(!reviewUuid.test(id||''))throw fail(400,'VALIDATION_ERROR','Article POST requires stable UUID id');
    return put(db,request,'articles',owner,id,values,env,origin);
  }
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
