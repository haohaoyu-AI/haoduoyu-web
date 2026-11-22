import {handleReviewAi,isReviewAiRoute} from './review-ai.mjs';
import {handleArticleDiagnosis,isArticleDiagnosisRoute} from './article-diagnosis.mjs';
import {handleReviewPrompts,isReviewPromptRoute} from './review-prompts.mjs';
import {bodyFor,authenticate,digest,stable,fail} from './security.mjs';
import {randomUUID} from 'node:crypto';
import {noteEditor,limitNoteWrites} from './public-note-access.mjs';
import {storeFor,consistentRead,mutate} from './storage.mjs';
import {dailyNotesOwner} from './daily-notes.mjs';
import {reviewUuid,reviewHash,reviewSpecs,reviewDate,reviewInput,reviewView,reviewEqual,reviewContentHash,reviewRuleChanges} from './content-review-validation.mjs';
import {handleReviewResources,isReviewResourceRoute} from './review-resources.mjs';
import {activityArticles,enrichArticles,enrichArticle,buildOverview} from '../shared/review-analytics.mjs';
import {matchPublishedDraft,platformArticleId} from '../shared/review-draft-match.mjs';
import {readReviewReceipt,queueReviewReceipt,reviewReceipt,reviewReceiptJoin,reviewReceiptColumns,reviewCanonicalWhere,reviewReceiptFields,validatedMatchEvidence,validatedDraftRef,mergeMatchEvidence,publicationKeys,publicationReplayKey} from './review-publication-receipts.mjs';

const tombstoneActor=owner=>'review-tombstones:'+owner;
const tombstoneKey=(kind,id)=>'review-deleted:'+kind+':'+id;
const json=(data,status=200)=>Response.json({data},{status});
const errorWith=(status,code,message,extra={})=>{throw Object.assign(new Error(message),{status,code,...extra});};
const errorBody=error=>({code:error.code,message:error.message,...(error.existing_id?{existing_id:error.existing_id}:{}),...(error.snapshot_count!==undefined?{snapshot_count:error.snapshot_count}:{})});
const columnsFor=kind=>Object.keys(reviewSpecs[kind].fields);
const columnFor=(spec,key)=>spec.json?.includes(key)?key+'_json':key;
const valueFor=(spec,key,row)=>spec.json?.includes(key)&&row[key]!==null?JSON.stringify(stable(row[key])):row[key];
const articleSelect='SELECT a.*, '+reviewReceiptColumns+' FROM matrix_review_articles a '+reviewReceiptJoin+' WHERE a.user_id=?';
const visibleArticles=articleSelect+' AND '+reviewCanonicalWhere;
const articleOrder=' ORDER BY a.published_at DESC,a.created_at DESC,a.id DESC';
const readArticleRecord=(store,owner,id)=>store.get(articleSelect+' AND a.id=?',owner,id);
const articleView=row=>({...reviewView('articles',row),...reviewReceiptFields(reviewReceipt(row))});
const internalArticle=row=>({...reviewView('articles',row),...reviewReceipt(row)});
const publicationView=(row,receipt)=>({...row,...reviewReceiptFields(receipt)});
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
// 最后更新 for playbooks: the newest edit in place (the playbook itself or one of its rules) as the audit log
// records it, else the creation time. Read-only: no column, no migration, and the content hash is unchanged.
const PLAYBOOK_EDITS=['review.playbooks.update','review.rules.update'];
async function withPlaybookTimes(store,rows) {
  const times=new Map();
  for(let i=0;i<rows.length;i+=80) {
    const ids=rows.slice(i,i+80).map(row=>row.id);
    if(!ids.length)continue;
    const found=await store.all('SELECT entity_id,MAX(created_at) AS at FROM audit WHERE entity_id IN ('+ids.map(()=>'?').join(',')+') AND action IN (?,?) GROUP BY entity_id',...ids,...PLAYBOOK_EDITS);
    for(const row of found)times.set(row.entity_id,row.at);
  }
  return rows.map(row=>{
    const edited=times.get(row.id),created=row.created_at??null;
    return {...row,updated_at:edited&&(!created||edited>created)?edited:created};
  });
}
const writeView=(kind,row)=>kind==='playbooks'?{...row,status:row.status??(row.id==='8f553af0-302a-45fb-9fde-16d6d537c888'&&row.account==='V字'?'draft':'active')}:row;
const publicView=(kind,row)=>kind==='playbooks'?{...writeView(kind,row),rules:row.rules.map(rule=>({...rule,status:rule.status??'candidate'}))}:row;
async function accountData(store,owner,account=null) {
  const data={};
  for(const kind of ['articles','snapshots','reports','playbooks']) {
    if(kind==='articles') {
      data.articles=(await store.all(visibleArticles+(account===null?'':' AND a.account=?')+articleOrder,owner,...(account===null?[]:[account]))).map(articleView);
      continue;
    }
    const accountWhere=account===null?'':kind==='snapshots'?' AND article_id IN (SELECT id FROM matrix_review_articles WHERE user_id=? AND account=?)':' AND account=?';
    const args=account===null?[]:kind==='snapshots'?[owner,account]:[account];
    data[kind]=(await store.all('SELECT * FROM '+reviewSpecs[kind].table+' WHERE user_id=?'+accountWhere+' ORDER BY '+reviewSpecs[kind].order,owner,...args)).map(row=>reviewView(kind,row));
  }
  return data;
}
async function readRow(store,kind,owner,id) {
  return reviewView(kind,await store.get('SELECT * FROM '+reviewSpecs[kind].table+' WHERE user_id=? AND id=?',owner,id));
}
async function reviewArchiveItemsExist(store) {
  return Boolean(await store.get("SELECT 1 AS ready FROM sqlite_schema WHERE type='table' AND name='matrix_review_archive_items'"));
}
async function protectArchiveSource(store,owner,articleId) {
  if(!await reviewArchiveItemsExist(store))return;
  const adopted=await store.get('SELECT 1 AS adopted FROM matrix_review_archive_items WHERE user_id=? AND legacy_id=?',owner,articleId);
  if(adopted)throw fail(409,'REVIEW_ARCHIVE_SOURCE_PROTECTED','该记录已纳入档案，请保留原始文章和历史快照');
}
async function checkRelations(store,kind,owner,id,row,previous=null,replacing=null) {
  let existing;
  if(kind==='articles'&&row.reference_article_id!==null&&(!previous||row.reference_article_id!==previous.reference_article_id||row.account!==previous.account)) {
    const ref=await store.get('SELECT ba.id FROM matrix_review_benchmark_articles ba JOIN matrix_review_benchmark_accounts b ON b.user_id=ba.user_id AND b.id=ba.benchmark_account_id WHERE ba.user_id=? AND ba.id=? AND ba.deleted_at IS NULL AND b.deleted_at IS NULL AND b.account=?',owner,row.reference_article_id,row.account);
    if(!ref)throw fail(404,'REFERENCE_NOT_FOUND','参考爆文不存在或不属于该账号');
  }
  if(kind==='articles'&&row.platform_article_id!==null)existing=await store.get('SELECT id FROM matrix_review_articles WHERE user_id=? AND account=? AND platform_article_id=? AND id<>? AND id<>?',owner,row.account,row.platform_article_id,id,replacing??id);
  if(kind==='snapshots') {
    const article=await readArticleRecord(store,owner,row.article_id);
    if(!article)throw fail(404,'ARTICLE_NOT_FOUND','快照所属文章不存在');
    const canonical=reviewReceipt(article).canonical_id;
    if(canonical)errorWith(409,'REVIEW_ALREADY_LINKED','请将快照写入已关联的原稿记录',{existing_id:canonical});
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
const DRAFT_ACCOUNTS=new Set(['V字','Z极客']);
function draftAccount(value) {
  const account=reviewSpecs.articles.fields.account(value);
  if(!DRAFT_ACCOUNTS.has(account))throw fail(400,'VALIDATION_ERROR','草稿和发布回写只接受 V字 或 Z极客。好多鱼已停更，不写入。');
  return account;
}
function intendsPublication(values) {
  if(values.publish_status==='pending'||values.publish_status==='unmatched')return false;
  return values.publish_status==='published'||values.published_at!=null;
}
const articlePeers=async(store,owner,account)=>(await store.all(visibleArticles+' AND a.account=?',owner,account)).map(internalArticle);
const proofFor=input=>({match_evidence:validatedMatchEvidence(input.match_evidence),draft_ref:validatedDraftRef(input.draft_ref)});
const rowData=row=>Object.fromEntries(['id',...columnsFor('articles'),...reviewSpecs.articles.timestamps,'content_hash'].map(key=>[key,row[key]]));
function syncDecision(peers,values,proof,requestedId) {
  const incoming={...values,...proof};
  const key=publicationReplayKey(values,proof);
  const existing=peers.find(row=>row.publish_status!=='pending'&&(
    row.id===requestedId||requestedId&&row.matched_put?.id===requestedId||row.publication_keys?.includes(key)));
  const sameImport=matchPublishedDraft(peers.filter(row=>row.publish_status==='unmatched'),incoming);
  const imported=sameImport.kind==='unmatched-repeat'?sameImport.row:existing?.publish_status==='unmatched'?existing:null;
  const match=matchPublishedDraft(peers,incoming);
  if(['id','corroborated'].includes(match.kind))return {match,imported,key};
  if(imported)return {match:{kind:'unmatched-repeat',row:imported},imported,key};
  if(existing&&match.kind==='none'&&!platformArticleId(incoming))return {match:{kind:'id',row:existing},imported,key};
  return {match,imported,key};
}
async function preparePublicationAlias(store,owner,draft,prior,actor,apply) {
  if(!prior||prior.id===draft.id)return false;
  await protectArchiveSource(store,owner,prior.id);
  const collision=await store.get('SELECT s.id FROM matrix_review_snapshots s JOIN matrix_review_snapshots d ON d.user_id=s.user_id AND d.snapshot_date=s.snapshot_date WHERE s.user_id=? AND s.article_id=? AND d.article_id=? LIMIT 1',owner,prior.id,draft.id);
  if(collision)throw fail(409,'REVIEW_SNAPSHOT_CONFLICT','两条记录含有同日快照，已保留原值，需核对后关联');
  if(!apply)return true;
  const receipt=await readReviewReceipt(store,owner,prior.id);
  queueReviewReceipt(store,owner,prior.id,{...receipt,canonical_id:draft.id,platform_article_id:prior.platform_article_id},receipt);
  store.queue('UPDATE matrix_review_articles SET platform_article_id=NULL WHERE user_id=? AND id=? AND publish_status=?',owner,prior.id,'unmatched');
  store.expectChange();
  store.queue('UPDATE matrix_review_snapshots SET article_id=? WHERE user_id=? AND article_id=?',draft.id,owner,prior.id);
  store.audit(actor.actor,'review.articles.link_publication',prior.id,{canonical_id:draft.id});
  return true;
}
async function publishMatched(store,owner,current,values,proof,actor,{imported=null,key=null,putId=null}={}) {
  const alias=await preparePublicationAlias(store,owner,current,imported,actor,true);
  const prior=await readReviewReceipt(store,owner,current.id);
  const importedReceipt=alias?await readReviewReceipt(store,owner,imported.id):{};
  const draft=current.publish_status==='pending';
  const publication=alias?{...values,...Object.fromEntries(
    ['title','url','platform_article_id','published_at','sample_title','sample_url','reference_article_id','image_count','source_chat','alternate_titles']
      .filter(field=>imported[field]!=null).map(field=>[field,imported[field]])
  )}:values;
  const updated=await writePublicationRow(store,owner,rowData(current),publication,actor,'published',{replacing:alias?imported.id:null});
  const receipt={...prior,
    ...(draft?{original_draft_title:current.title,draft_evidence:prior.match_evidence,draft_platform_article_id:platformArticleId(current)||undefined}:{}),
    ...(putId?{matched_put:{id:putId,key}}:{}),
    match_evidence:mergeMatchEvidence(draft?importedReceipt.match_evidence:prior.match_evidence,proof.match_evidence),
    publication_keys:publicationKeys(importedReceipt.publication_keys?.reduce((all,item)=>publicationKeys(all,item),prior.publication_keys)??prior.publication_keys,key)};
  queueReviewReceipt(store,owner,current.id,receipt,prior);
  return {article:publicationView(updated,receipt),previousArticleId:alias?imported.id:null};
}
async function writePublicationRow(store,owner,current,values,actor,publish_status,{replacing=null}={}) {
  const spec=reviewSpecs.articles;
  const merged=reviewInput('articles',{...Object.fromEntries(columnsFor('articles').map(key=>[key,current[key]])),
    title:values.title,url:values.url??current.url,published_at:values.published_at??current.published_at,
    platform_article_id:values.platform_article_id??current.platform_article_id,
    sample_title:current.sample_title??values.sample_title,sample_url:current.sample_url??values.sample_url,
    reference_article_id:current.reference_article_id??values.reference_article_id,
    alternate_titles:current.alternate_titles??values.alternate_titles,
    draft_saved_at:current.draft_saved_at??values.draft_saved_at,
    image_count:current.image_count??values.image_count,source_chat:current.source_chat??values.source_chat,publish_status});
  await checkRelations(store,'articles',owner,current.id,merged,current,replacing);
  if(reviewEqual('articles',current,merged))return current;
  const row={...current,...merged,updated_at:new Date().toISOString()};
  delete row.content_hash;
  const keys=[...columnsFor('articles'),'updated_at'];
  store.queue('UPDATE '+spec.table+' SET '+keys.map(key=>columnFor(spec,key)+'=?').join(',')+' WHERE user_id=? AND id=?',...keys.map(key=>valueFor(spec,key,row)),owner,current.id);
  store.expectChange();store.audit(actor.actor,'review.articles.publish',current.id,{match:current.id,publish_status});
  return {...row,content_hash:reviewContentHash(row)};
}
async function put(db,request,kind,owner,id,input,env,origin) {
  const proof=kind==='articles'?proofFor(input):{};
  if(kind==='articles') {
    const {match_evidence:ignoredEvidence,draft_ref:ignoredRef,...fields}=input;
    input=fields;
  }
  if(kind==='playbooks'&&Object.hasOwn(input,'status')&&input.status===null)throw fail(400,'VALIDATION_ERROR','Invalid playbook status');
  const values=reviewInput(kind,input,{validateDaily:false}),spec=reviewSpecs[kind];
  return (await mutate(db,async store=>{
    const actor=await actorFor(store,request,owner,env,origin,true);
    if(await store.get('SELECT key FROM idempotency WHERE actor=? AND key=?',tombstoneActor(owner),tombstoneKey(kind,id)))throw fail(409,'REVIEW_DELETED','此标识已永久删除，请为新记录生成新 UUID');
    const receipt=kind==='articles'?await readReviewReceipt(store,owner,id):{};
    if(receipt.canonical_id&&intendsPublication(values)) {
      const canonical=await readArticleRecord(store,owner,receipt.canonical_id);
      if(!canonical||canonical.account!==values.account||platformArticleId(values)&&platformArticleId(canonical)!==platformArticleId(values))throw fail(409,'IDEMPOTENCY_CONFLICT','发布标识已关联，请先读取原记录');
      return {replayed:true,response:json({...articleView(canonical),matched:true,requested_id:id})};
    }
    if(receipt.canonical_id)throw fail(409,'REVIEW_ALREADY_LINKED','请使用已关联的原稿记录');
    const current=await readRow(store,kind,owner,id);
    if(current) {
      if(kind==='playbooks'&&current.status===null&&values.status===publicView(kind,current).status)values.status=null;
      if(!reviewEqual(kind,current,values))throw fail(409,'IDEMPOTENCY_CONFLICT','该 UUID 已用于不同内容；修改请使用 PATCH 和最新哈希');
      const saved=kind==='articles'&&queueReviewReceipt(store,owner,id,{...receipt,
        match_evidence:mergeMatchEvidence(receipt.match_evidence,proof.match_evidence),draft_ref:proof.draft_ref??receipt.draft_ref},receipt);
      return {actor,replayed:!saved,response:json(writeView(kind,publicationView(current,receipt)))};
    }
    reviewInput(kind,input);
    if(kind==='reports'&&values.period_type==='three_day')throw fail(400,'VALIDATION_ERROR','New three_day reports are retired');
    if(kind==='articles'&&intendsPublication(values)) {
      const peers=await articlePeers(store,owner,values.account);
      const {match,imported,key}=syncDecision(peers,values,proof,id);
      if((match.kind==='id'||match.kind==='corroborated')&&match.row.publish_status==='pending') {
        const {article}=await publishMatched(store,owner,match.row,values,proof,actor,{imported,key,putId:id});
        return {actor,replayed:!store.pending.length,response:json({...article,matched:true,match:match.kind,requested_id:id})};
      }
      if(match.kind==='id'||match.kind==='unmatched-repeat') {
        const prior=match.row.matched_put;
        if(prior?.id===id) {
          if(prior.key!==key)throw fail(409,'IDEMPOTENCY_CONFLICT','该 UUID 已用于不同的发布内容');
          return {replayed:true,response:json({...publicationView(rowData(match.row),match.row),matched:true,match:'id',requested_id:id})};
        }
        if(platformArticleId({...values,...proof}))errorWith(409,'REVIEW_UNIQUE_CONFLICT','同一业务记录已存在',{existing_id:match.row.id});
      }
      if(peers.some(row=>row.publish_status==='pending')&&(match.kind==='none'||match.kind==='ambiguous'))values.publish_status='unmatched';
    }
    await checkRelations(store,kind,owner,id,values);
    const time=new Date().toISOString(),row={id,...values,...Object.fromEntries(spec.timestamps.map(key=>[key,time]))};
    const keys=[...columnsFor(kind),...spec.timestamps],columns=['user_id','id',...keys.map(key=>columnFor(spec,key))];
    store.queue('INSERT INTO '+spec.table+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')',owner,id,...keys.map(key=>valueFor(spec,key,row)));
    if(kind==='articles')queueReviewReceipt(store,owner,id,{...proof,publication_keys:intendsPublication(values)?[publicationReplayKey(values,proof)]:undefined},{});
    store.audit(actor.actor,'review.'+kind+'.create',id);
    const created=writeView(kind,{...row,content_hash:reviewContentHash(row)});
    return {actor,response:json(kind==='articles'&&values.publish_status==='unmatched'?{...created,matched:false,match:'unmatched'}:created,201)};
  })).response;
}
async function patch(db,request,kind,owner,id,input,env,origin) {
  const {expected_hash,...changes}=input;
  if(typeof expected_hash!=='string'||!reviewHash.test(expected_hash))throw fail(400,'VALIDATION_ERROR','修改需要有效的 expected_hash');
  if(kind==='playbooks'&&Object.hasOwn(changes,'status')&&changes.status===null)throw fail(400,'VALIDATION_ERROR','Invalid playbook status');
  const partial=reviewInput(kind,changes,{patch:true}),spec=reviewSpecs[kind];
  return (await mutate(db,async store=>{
    const actor=await actorFor(store,request,owner,env,origin,true),current=await readRow(store,kind,owner,id);
    if(!current)throw fail(404,'NOT_FOUND','记录不存在');
    if(kind==='articles'&&(await readReviewReceipt(store,owner,id)).canonical_id)throw fail(409,'REVIEW_ALREADY_LINKED','请修改已关联的原稿记录');
    if(current.content_hash!==expected_hash)throw fail(409,'VERSION_CONFLICT','记录已改变，请读取最新内容再修改');
    // Compare an echoed default against the account after this PATCH. The
    // designated legacy draft is only a draft while it belongs to V字.
    if(kind==='playbooks'&&current.status===null&&partial.status===writeView(kind,{...current,...partial,status:null}).status)delete partial.status;
    if(kind==='reports'&&partial.period_type==='three_day'&&current.period_type!=='three_day')throw fail(400,'VALIDATION_ERROR','New three_day reports are retired');
    const values=reviewInput(kind,{...Object.fromEntries(columnsFor(kind).map(key=>[key,current[key]])),...partial},{validateDaily:Object.hasOwn(partial,'summary_md')||Object.hasOwn(partial,'period_type')});
    await checkRelations(store,kind,owner,id,values,current);
    if(reviewEqual(kind,current,values))return {replayed:true,response:json(writeView(kind,current))};
    if(kind==='snapshots')await protectArchiveSource(store,owner,current.article_id);
    const {content_hash,...previous}=current,row={...previous,...values};
    if(spec.timestamps.includes('updated_at'))row.updated_at=new Date().toISOString();
    const keys=[...columnsFor(kind),...(spec.timestamps.includes('updated_at')?['updated_at']:[])];
    store.queue('UPDATE '+spec.table+' SET '+keys.map(key=>columnFor(spec,key)+'=?').join(',')+' WHERE user_id=? AND id=?',...keys.map(key=>valueFor(spec,key,row)),owner,id);
    store.expectChange();store.audit(actor.actor,'review.'+kind+'.update',id);
    return {actor,response:json(writeView(kind,{...row,content_hash:reviewContentHash(row)}))};
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
    if(kind==='articles'&&(await readReviewReceipt(store,owner,id)).canonical_id)throw fail(409,'REVIEW_ALREADY_LINKED','这条发布记录已关联原稿');
    if(current.content_hash!==input.expected_hash)throw fail(409,'VERSION_CONFLICT','记录已改变，请读取最新内容再删除');
    if(kind==='articles'||kind==='snapshots')await protectArchiveSource(store,owner,kind==='articles'?id:current.article_id);
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
const DRAFT_FIELDS=new Set(['id','account','platform_article_id','title','alternate_titles','sample_title','sample_url','reference_article_id','draft_saved_at','image_count','match_evidence','draft_ref']);
const PUBLICATION_FIELDS=new Set([...DRAFT_FIELDS,'url','published_at','snapshot']);
function rejectUnknown(input,allowed) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.has(key)))throw fail(400,'VALIDATION_ERROR','存在未知字段或请求体无效');
}
async function linkedBenchmark(store,owner,account,sampleUrl,referenceId) {
  if(referenceId)return referenceId;
  if(!sampleUrl)return null;
  const rows=await store.all('SELECT ba.id FROM matrix_review_benchmark_articles ba JOIN matrix_review_benchmark_accounts b ON b.user_id=ba.user_id AND b.id=ba.benchmark_account_id WHERE ba.user_id=? AND ba.url=? AND ba.deleted_at IS NULL AND b.deleted_at IS NULL AND b.account=?',owner,sampleUrl,account);
  return rows.length===1?rows[0].id:null;
}
async function queueSnapshot(store,owner,articleId,snapshot,actor,{knownArticle=false,previousArticleId=null}={}) {
  if(snapshot==null)return null;
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))throw fail(400,'VALIDATION_ERROR','snapshot 须为对象');
  const {id:snapId=randomUUID(),article_id:ignored,...body}=snapshot;
  if(!reviewUuid.test(snapId||''))throw fail(400,'VALIDATION_ERROR','snapshot.id 须为 UUID');
  const values=reviewInput('snapshots',{...body,article_id:articleId});
  const existing=await readRow(store,'snapshots',owner,snapId);
  if(existing) {
    const current=existing.article_id===previousArticleId?{...existing,article_id:articleId}:existing;
    if(!reviewEqual('snapshots',current,values))throw fail(409,'IDEMPOTENCY_CONFLICT','快照 UUID 已用于不同内容');
    return {...current,content_hash:reviewContentHash(current)};
  }
  const duplicate=await store.get('SELECT * FROM matrix_review_snapshots WHERE user_id=? AND article_id IN (?,?) AND snapshot_date=? AND id<>?',owner,articleId,previousArticleId,values.snapshot_date,snapId);
  if(duplicate) {
    const prior=reviewView('snapshots',{...duplicate,article_id:articleId});
    if(reviewEqual('snapshots',prior,values))return prior;
    errorWith(409,'REVIEW_UNIQUE_CONFLICT','同一业务记录已存在',{existing_id:duplicate.id});
  }
  if(!knownArticle)await checkRelations(store,'snapshots',owner,snapId,values);
  const spec=reviewSpecs.snapshots,keys=columnsFor('snapshots'),row={id:snapId,...values};
  store.queue('INSERT INTO '+spec.table+' (user_id,id,'+keys.map(key=>columnFor(spec,key)).join(',')+') VALUES ('+Array(keys.length+2).fill('?').join(',')+')',owner,snapId,...keys.map(key=>valueFor(spec,key,row)));
  store.audit(actor.actor,'review.snapshots.create',snapId);
  return {...row,content_hash:reviewContentHash({...row})};
}
function articleInsert(store,owner,id,values,actor,time) {
  const spec=reviewSpecs.articles,row={id,...values,created_at:time,updated_at:time};
  const keys=[...columnsFor('articles'),...spec.timestamps];
  store.queue('INSERT INTO '+spec.table+' (user_id,id,'+keys.map(key=>columnFor(spec,key)).join(',')+') VALUES ('+Array(keys.length+2).fill('?').join(',')+')',owner,id,...keys.map(key=>valueFor(spec,key,row)));
  store.audit(actor.actor,'review.articles.create',id);
  return {...row,content_hash:reviewContentHash(row)};
}
async function saveDraft(db,request,owner,input,env,origin) {
  rejectUnknown(input,DRAFT_FIELDS);
  const account=draftAccount(input.account);
  const proof=proofFor(input);
  const suppliedId=reviewSpecs.articles.fields.platform_article_id(input.platform_article_id??null);
  const platform_article_id=platformArticleId({platform_article_id:suppliedId,draft_ref:proof.draft_ref})||null;
  const title=reviewSpecs.articles.fields.title(input.title);
  const alternate_titles=reviewSpecs.articles.fields.alternate_titles(input.alternate_titles??null);
  if(!alternate_titles)throw fail(400,'VALIDATION_ERROR','草稿必须带 4 条备选标题 alternate_titles');
  const sample_title=reviewSpecs.articles.fields.sample_title(input.sample_title??null);
  const sample_url=reviewSpecs.articles.fields.sample_url(input.sample_url??null);
  if(!sample_title||!sample_url)throw fail(400,'VALIDATION_ERROR','草稿必须带对标原文标题 sample_title 和链接 sample_url');
  const reference_article_id=input.reference_article_id==null?null:reviewSpecs.articles.fields.reference_article_id(input.reference_article_id);
  const suppliedSavedAt=input.draft_saved_at==null?null:reviewSpecs.articles.fields.draft_saved_at(input.draft_saved_at);
  const requestedId=input.id==null?null:input.id;
  const imageCount=reviewSpecs.articles.fields.image_count(input.image_count??null);
  if(requestedId!=null&&!reviewUuid.test(requestedId))throw fail(400,'VALIDATION_ERROR','id 须为 UUID');
  if(!requestedId&&!platform_article_id)throw fail(400,'VALIDATION_ERROR','没有平台文章编号时，草稿必须带稳定的 UUID id');
  return (await mutate(db,async store=>{
    const actor=await actorFor(store,request,owner,env,origin,true);
    const byPlatform=platform_article_id?await store.get('SELECT * FROM matrix_review_articles WHERE user_id=? AND account=? AND platform_article_id=?',owner,account,platform_article_id):null;
    const byUuid=requestedId?await readArticleRecord(store,owner,requestedId):null;
    if(byUuid&&(byUuid.account!==account||reviewReceipt(byUuid).canonical_id||platform_article_id&&byUuid.platform_article_id&&platform_article_id!==byUuid.platform_article_id))
      throw fail(409,'IDEMPOTENCY_CONFLICT','该 UUID 已用于不同文章');
    const platformRow=reviewView('articles',byPlatform??byUuid);
    if(platformRow&&platformRow.publish_status!=='pending') {
      const receipt=await readReviewReceipt(store,owner,platformRow.id);
      if(platformRow.publish_status!=='unmatched'||!platform_article_id||byUuid&&byUuid.id!==platformRow.id) {
        return {replayed:true,response:json({...publicationView(platformRow,receipt),matched:platformRow.publish_status!=='unmatched',kept:true})};
      }
      const reference=await linkedBenchmark(store,owner,account,platformRow.sample_url??sample_url,
        platformRow.reference_article_id??(platformRow.sample_url&&platformRow.sample_url!==sample_url?null:reference_article_id));
      const updated=await writePublicationRow(store,owner,platformRow,{...platformRow,sample_title,sample_url,reference_article_id:reference,
        draft_saved_at:suppliedSavedAt,alternate_titles,image_count:imageCount},actor,'published');
      const merged={...receipt,original_draft_title:title,draft_platform_article_id:platform_article_id,
        draft_evidence:proof.match_evidence,draft_ref:proof.draft_ref,draft_sample:{title:sample_title,url:sample_url}};
      queueReviewReceipt(store,owner,platformRow.id,merged,receipt);
      return {actor,response:json({...publicationView(updated,merged),matched:true,match:'id'})};
    }
    if(requestedId&&platformRow&&requestedId!==platformRow.id)errorWith(409,'REVIEW_UNIQUE_CONFLICT','该平台文章编号已对应另一篇草稿',{existing_id:platformRow.id});
    const reference=await linkedBenchmark(store,owner,account,sample_url,reference_article_id);
    const time=new Date().toISOString();
    const id=platformRow?.id||requestedId||randomUUID();
    const values=reviewInput('articles',{...(platformRow?Object.fromEntries(columnsFor('articles').map(key=>[key,platformRow[key]])):{}),
      account,platform:'toutiao',platform_article_id:platform_article_id??platformRow?.platform_article_id??null,title,alternate_titles,sample_title,sample_url,reference_article_id:reference,
      draft_saved_at:suppliedSavedAt||platformRow?.draft_saved_at||time,publish_status:'pending',published_at:null,url:null,image_count:imageCount??platformRow?.image_count??null});
    await checkRelations(store,'articles',owner,id,values,platformRow);
    const receipt=platformRow?await readReviewReceipt(store,owner,id):{};
    queueReviewReceipt(store,owner,id,{...receipt,match_evidence:mergeMatchEvidence(receipt.match_evidence,proof.match_evidence),draft_ref:proof.draft_ref??receipt.draft_ref},receipt);
    if(platformRow&&reviewEqual('articles',platformRow,values))return {actor,replayed:!store.pending.length,response:json({...platformRow,matched:true,match:'id'})};
    if(platformRow) {
      const row={...platformRow,...values,updated_at:time};
      delete row.content_hash;
      const keys=[...columnsFor('articles'),'updated_at'];
      store.queue('UPDATE matrix_review_articles SET '+keys.map(key=>columnFor(reviewSpecs.articles,key)+'=?').join(',')+' WHERE user_id=? AND id=?',...keys.map(key=>valueFor(reviewSpecs.articles,key,row)),owner,id);
      store.expectChange();store.audit(actor.actor,'review.articles.draft',id);
      const saved={...row,content_hash:reviewContentHash(row)};
      return {actor,response:json({...writeView('articles',saved),matched:true,match:'id'})};
    }
    const created=articleInsert(store,owner,id,values,actor,time);
    return {actor,response:json({...writeView('articles',created),matched:false,match:'created'},201)};
  })).response;
}
async function savePublication(db,request,owner,input,env,origin) {
  rejectUnknown(input,PUBLICATION_FIELDS);
  const account=draftAccount(input.account);
  const values=reviewInput('articles',{account,title:input.title,platform_article_id:input.platform_article_id??null,url:input.url??null,published_at:input.published_at,sample_title:input.sample_title??null,sample_url:input.sample_url??null,reference_article_id:input.reference_article_id??null,alternate_titles:input.alternate_titles??null,image_count:input.image_count??null,publish_status:'published'});
  const proof=proofFor(input);
  if(!values.published_at)throw fail(400,'VALIDATION_ERROR','发布回写必须带 published_at');
  const requestedId=input.id==null?null:input.id;
  if(requestedId!=null&&!reviewUuid.test(requestedId))throw fail(400,'VALIDATION_ERROR','id 须为 UUID');
  return (await mutate(db,async store=>{
    const actor=await actorFor(store,request,owner,env,origin,true);
    const peers=await articlePeers(store,owner,account);
    const {match,imported,key}=syncDecision(peers,values,proof,requestedId);
    let article,matched=false,matchKind=match.kind,created=false,previousArticleId=null;
    const draftHit=(match.kind==='id'||match.kind==='corroborated')&&match.row.publish_status==='pending';
    const publishedHit=match.kind==='id'&&match.row.publish_status!=='pending'&&match.row.publish_status!=='unmatched';
    if(draftHit||publishedHit) {
      ({article,previousArticleId}=await publishMatched(store,owner,match.row,values,proof,actor,{imported:draftHit?imported:null,key}));
      matched=true;
    } else if(match.kind==='unmatched-repeat') {
      article=await writePublicationRow(store,owner,rowData(match.row),values,actor,'unmatched');
      const receipt=await readReviewReceipt(store,owner,article.id);
      queueReviewReceipt(store,owner,article.id,{...receipt,match_evidence:mergeMatchEvidence(receipt.match_evidence,proof.match_evidence),
        draft_ref:proof.draft_ref??receipt.draft_ref,publication_keys:publicationKeys(receipt.publication_keys,key)},receipt);
      matched=false;matchKind='unmatched';
    } else {
      created=true;
      const pending=peers.some(row=>row.publish_status==='pending');
      const status=pending&&(match.kind==='none'||match.kind==='ambiguous')?'unmatched':'published';
      const id=requestedId||randomUUID();
      if(await readRow(store,'articles',owner,id))throw fail(409,'IDEMPOTENCY_CONFLICT','该 UUID 已用于不同内容');
      const time=new Date().toISOString();
      const createdValues={...values,publish_status:status==='published'? 'published':status};
      await checkRelations(store,'articles',owner,id,createdValues);
      article=articleInsert(store,owner,id,createdValues,actor,time);
      queueReviewReceipt(store,owner,id,{...proof,publication_keys:[key]},{});
      matched=false;matchKind=status==='unmatched'?match.kind:'created';
    }
    const snapshot=await queueSnapshot(store,owner,article.id,input.snapshot,actor,{knownArticle:created,previousArticleId});
    return {actor,replayed:!store.pending.length,response:json({...article,matched,match:matchKind,...(snapshot?{snapshot}:{})},created?201:200)};
  })).response;
}
async function reconcilePublication(db,request,owner,input,env,origin) {
  rejectUnknown(input,new Set(['article_id','expected_hash','draft_id','draft','apply']));
  const {article_id:id,expected_hash:expected,draft_id:draftId,draft:draftInput,apply=false}=input;
  if(!reviewUuid.test(id??'')||!reviewHash.test(expected??'')||typeof apply!=='boolean'||
    Boolean(draftId)===Boolean(draftInput)||draftId&&(!reviewUuid.test(draftId)||draftId===id))
    throw fail(400,'VALIDATION_ERROR','核对需要文章 UUID、expected_hash 和一条原稿依据');
  let verifiedDraft;
  if(draftInput) {
    rejectUnknown(draftInput,new Set(['platform_article_id','title','sample_url']));
    const fields=reviewSpecs.articles.fields;
    verifiedDraft={platform_article_id:fields.platform_article_id(draftInput.platform_article_id??null),
      title:fields.title(draftInput.title),sample_url:fields.sample_url(draftInput.sample_url??null)};
    if(!verifiedDraft.platform_article_id||!verifiedDraft.sample_url)throw fail(400,'VALIDATION_ERROR','原稿依据须带平台文章编号和样本链接');
  }
  const verification=digest(JSON.stringify(stable({id,expected,draftId,verifiedDraft})));
  return (await mutate(db,async store=>{
    const actor=await actorFor(store,request,owner,env,origin,true);
    if(actor.kind!=='session')throw fail(403,'FORBIDDEN','仅工作区主人可核对历史发布');
    const raw=await readArticleRecord(store,owner,id);
    if(!raw)throw fail(404,'NOT_FOUND','发布记录不存在');
    const current=reviewView('articles',raw),prior=reviewReceipt(raw);
    if(prior.reconciliation===verification&&current.publish_status!=='pending') {
      const canonical=prior.canonical_id?await readArticleRecord(store,owner,prior.canonical_id):raw;
      if(!canonical)throw fail(409,'REVIEW_ALREADY_LINKED','原稿记录已改变，请重新核对');
      return {replayed:true,response:json({...articleView(canonical),matched:true,preview:!apply})};
    }
    if(current.content_hash!==expected)throw fail(409,'VERSION_CONFLICT','发布记录已改变，请读取最新内容再核对');
    if(prior.canonical_id||current.publish_status!=='unmatched'||!current.published_at)
      throw fail(409,'REVIEW_NOT_UNMATCHED','该记录不再是待核对的发布记录');
    if(draftId) {
      const peers=await articlePeers(store,owner,current.account);
      const match=matchPublishedDraft(peers,{...current,...prior});
      if(!['id','corroborated'].includes(match.kind)||match.row.id!==draftId||match.row.publish_status!=='pending')
        throw fail(409,'REVIEW_EVIDENCE_MISMATCH','现有证据未唯一对应此原稿');
      if(!apply) {
        await preparePublicationAlias(store,owner,match.row,current,actor,false);
        return {replayed:true,response:json({...articleView(raw),canonical_id:draftId,original_draft_title:match.row.title,matched:true,preview:true})};
      }
      const {article}=await publishMatched(store,owner,match.row,current,proofFor(prior),actor,{imported:current});
      queueReviewReceipt(store,owner,id,{...prior,canonical_id:draftId,platform_article_id:current.platform_article_id,reconciliation:verification},prior);
      return {actor,response:json({...article,matched:true,preview:false})};
    }
    const publishedId=platformArticleId(current);
    if(verifiedDraft.platform_article_id!==publishedId||verifiedDraft.sample_url!==current.sample_url||!current.sample_title||verifiedDraft.title===current.title)
      throw fail(409,'REVIEW_EVIDENCE_MISMATCH','核对的原稿编号、标题和样本与发布记录不一致');
    const peers=await articlePeers(store,owner,current.account);
    const candidate=matchPublishedDraft(peers,{...current,...prior});
    if(candidate.kind!=='unmatched-repeat'||candidate.row.id!==id)
      throw fail(409,'REVIEW_EVIDENCE_MISMATCH','存在其他原稿候选，请先核对候选记录');
    if(!apply)return {replayed:true,response:json({...articleView(raw),original_draft_title:verifiedDraft.title,matched:true,preview:true})};
    const reference=await linkedBenchmark(store,owner,current.account,current.sample_url,current.reference_article_id);
    const updated=await writePublicationRow(store,owner,current,{...current,reference_article_id:reference},actor,'published');
    const receipt={...prior,original_draft_title:verifiedDraft.title,draft_platform_article_id:publishedId,reconciliation:verification};
    queueReviewReceipt(store,owner,id,receipt,prior);
    return {actor,response:json({...publicationView(updated,receipt),matched:true,preview:false})};
  })).response;
}
async function handle(db,request,route,env,origin,initialRevision) {
  const owner=dailyNotesOwner(env),url=new URL(request.url),method=request.method;
  if(isReviewAiRoute(route))return handleReviewAi({db,request,route,env,origin,owner,actorFor,writeLimit,accountData,account:reviewSpecs.articles.fields.account});
  if(isArticleDiagnosisRoute(route))return handleArticleDiagnosis({db,request,route,env,origin,owner,actorFor,writeLimit});
  if(isReviewPromptRoute(route))return handleReviewPrompts(db,request,route,env,origin,initialRevision,{owner,actorFor,writeLimit});
  if(route==='/review/publications/reconcile') {
    if(method!=='POST'||url.search)throw fail(404,'NOT_FOUND','内容复盘接口不存在');
    return reconcilePublication(db,request,owner,await bodyFor(request),env,origin);
  }
  if(route==='/review/drafts'||route==='/review/publications') {
    if(method!=='POST'||url.search)throw fail(404,'NOT_FOUND','内容复盘接口不存在');
    const actor=await actorFor(storeFor(db),request,owner,env,origin,true);writeLimit(actor,owner);
    const input=await bodyFor(request);
    return route==='/review/drafts'?saveDraft(db,request,owner,input,env,origin):savePublication(db,request,owner,input,env,origin);
  }
  if(isReviewResourceRoute(route))return handleReviewResources(db,request,route,env,origin,initialRevision);
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
      if(kind==='articles') {
        const requested=await readArticleRecord(store,owner,id);
        const canonical=reviewReceipt(requested).canonical_id;
        const raw=canonical?await readArticleRecord(store,owner,canonical):requested;
        if(!raw)throw fail(404,'NOT_FOUND','记录不存在');
        const row=articleView(raw);
        const data=await accountData(store,owner,row.account);
        const snapshots=data.snapshots.filter(item=>item.article_id===row.id).sort((a,b)=>a.snapshot_date.localeCompare(b.snapshot_date)||a.id.localeCompare(b.id));
        return json({...enrichArticle(row,data.snapshots,data.playbooks,data.reports,data.articles),snapshots});
      }
      const row=await readRow(store,kind,owner,id);if(!row)throw fail(404,'NOT_FOUND','记录不存在');
      if(kind==='playbooks')return json(publicView(kind,(await withPlaybookTimes(store,[row]))[0]));
      return json(publicView(kind,row));
    }
    if(kind==='articles') {
      const rows=await store.all(visibleArticles+filters.where.map(sql=>' AND '+sql).join('')+articleOrder,owner,...filters.args);
      const data=await accountData(store,owner,url.searchParams.has('account')?reviewSpecs.articles.fields.account(url.searchParams.get('account')):null);
      const enriched=new Map(enrichArticles(data,{}).map(row=>[row.id,row]));
      const all=rows.map(row=>enriched.get(row.id)).filter(row=>!filters.verdict||(filters.verdict==='pending'?row.verdict===null:row.verdict===filters.verdict)).sort(activityArticles);
      const items=all.slice(filters.offset,filters.offset+100);
      return json({items,has_more:all.length>filters.offset+100,read_revision:before,...(filters.page!==null?{page:filters.page,page_size:100,total:all.length}:{})});
    }
    const rows=await store.all('SELECT * FROM '+reviewSpecs[kind].table+' WHERE user_id=?'+filters.where.map(sql=>' AND '+sql).join('')+' ORDER BY '+reviewSpecs[kind].order+' LIMIT 101 OFFSET ?',owner,...filters.args,filters.offset);
    const views=rows.slice(0,100).map(row=>reviewView(kind,row));
    const items=(kind==='playbooks'?await withPlaybookTimes(store,views):views).map(row=>publicView(kind,row));
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
