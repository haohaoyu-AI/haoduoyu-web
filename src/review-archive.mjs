import {randomUUID} from 'node:crypto';
import {dailyNotesOwner} from './daily-notes.mjs';
import {authenticate,bodyFor,digest,fail,requireCsrf,stable} from './security.mjs';
import {consistentRead,mutate} from './storage.mjs';
import {handleArchiveImport} from './review-archive-import.mjs';
import {handleArchiveReports,isArchiveReportRoute} from './review-archive-reports.mjs';
import {archiveObject,archiveUuid,archiveVerified,archiveVersion,associationStatuses,checkArchiveSnapshotTime,
  normalizeArchiveItem,normalizeArchiveReference,normalizeArchiveSnapshot} from './review-archive-model.mjs';
import {archiveEvents,archiveItem,archiveItems,archiveLegacyReference,archiveRawItem,archiveReady,decodeArchiveItem,listArchiveLegacy,
  queueArchiveItem,queueArchiveReference,queueArchiveSnapshot,readArchiveMetricHeads,readArchiveSnapshots,
  verifyArchiveLegacy,verifyArchiveSample} from './review-archive-store.mjs';
import {archiveCompleteness,archiveJson,archiveNotFound,archiveOverview,archivePage,archivePageQuery,archiveQueryKeys,
  archiveWasPublished,privateArchiveHeaders} from './review-archive-read.mjs';

const base='/review/archive';
const itemRoute=/^\/review\/archive\/items\/([^/]+)(?:\/(references|association|merge|snapshots))?$/u;
const invalid=message=>fail(400,'VALIDATION_ERROR',message??'档案参数无效');
const conflict=message=>fail(409,'ARCHIVE_CONFLICT',message??'档案关联冲突，请读取最新档案后再操作');
const stale=()=>fail(409,'VERSION_CONFLICT','档案已经更新，请读取最新版本后再操作');
const fingerprint=value=>digest(JSON.stringify(stable(value)));

export function isReviewArchiveRoute(route) {
  return route===base||route.startsWith(base+'/');
}

async function archiveActor(store,request,owner,origin,writing) {
  const actor=await authenticate(store,request,writing?'write':'read');
  if(actor.kind!=='session'||actor.id!==owner)fail(403,'FORBIDDEN','V 字档案仅供其已登录的所有者访问');
  if(request.method!=='GET')requireCsrf(request,actor,origin);
  return actor;
}

function textReason(value,required=false) {
  if(value==null&&!required)return null;
  if(typeof value!=='string'||!value.isWellFormed()||!value.trim()||Buffer.byteLength(value)>4000||
    /[\u0000-\u001f\u007f]/u.test(value))invalid('请输入有效的人工核对说明');
  return value.trim();
}

async function currentRaw(store,owner,id,{version,allowAlias=false}={}) {
  const row=await archiveRawItem(store,owner,id);
  if(!row)archiveNotFound();
  if(version!==undefined&&row.version!==archiveVersion(version))stale();
  if(!allowAlias&&row.merged_into)conflict('请在主要档案操作；可先撤销合并');
  return row;
}

async function sampleFor(store,owner,id,{historical=false}={}) {
  if(!id)return null;
  try{return await verifyArchiveSample(store,owner,id);}
  catch(error) {
    if(historical&&error.code==='ARCHIVE_SAMPLE_NOT_FOUND')return null;
    throw error;
  }
}

function sampleFields(sample) {
  return {sample_title:sample?.title??null,sample_url:sample?.url??null,sample_published_at:sample?.published_at??null};
}

async function archiveDetail(store,owner,id) {
  const item=await archiveItem(store,owner,id);
  if(!item)archiveNotFound();
  const [snapshots,history,sample]=await Promise.all([
    readArchiveSnapshots(store,owner,item),archiveEvents(store,owner,item),sampleFor(store,owner,item.sample_reference_id,{historical:true}),
  ]);
  return archiveJson({...item,snapshots,history,sample});
}

function fills(target,values) {
  return {...target,...Object.fromEntries(Object.entries(values).filter(([key,value])=>target[key]==null&&value!=null))};
}

function legacyFields(legacy) {
  const isPublished=legacy.publish_status!=='pending'&&Boolean(legacy.published_at||['published','unmatched'].includes(legacy.publish_status));
  return {original_title:legacy.original_draft_title??(isPublished?null:legacy.title),published_title:isPublished?legacy.title:null,
    platform_url:legacy.url,published_at:legacy.published_at,draft_saved_at:legacy.draft_saved_at,
    sample_reference_id:legacy.reference_article_id,sample_title:legacy.sample_title,sample_url:legacy.sample_url,
    images:legacy.image_count==null?null:{total:legacy.image_count,real:null,ai:null},alternate_titles:legacy.alternate_titles};
}

async function readyNewItem(store,owner,data,explicit) {
  let legacy=null;
  if(data.legacy_id) {
    legacy=await verifyArchiveLegacy(store,owner,data.legacy_id);
    if(await store.get('SELECT id FROM matrix_review_archive_items WHERE user_id=? AND legacy_id=?',owner,data.legacy_id))
      conflict('该复盘记录已归档');
    data=fills(data,legacyFields(legacy));
    if(!Object.hasOwn(explicit,'publication_status'))data.publication_status=legacy.publish_status==='pending'?'pending':
      legacy.published_at||['published','unmatched'].includes(legacy.publish_status)?'published':'unknown';
    if(!Object.hasOwn(explicit,'association_status')&&legacy.original_draft_title)data.association_status='matched';
  }
  if(data.association_status==='matched'&&!legacy?.original_draft_title)
    invalid('请先保存档案，再通过人工纠错入口确认关联');
  const sample=await sampleFor(store,owner,data.sample_reference_id,{historical:Boolean(legacy?.reference_article_id&&
    legacy.reference_article_id===data.sample_reference_id)});
  return {data:fills(data,sampleFields(sample)),legacy};
}

async function requireReferenceFamily(store,owner,id,platformId) {
  const elsewhere=await store.get(`SELECT r.id FROM matrix_review_archive_refs r
    JOIN matrix_review_archive_items i ON i.user_id=r.user_id AND i.id=r.item_id
    WHERE r.user_id=? AND r.platform_id=? AND coalesce(i.merged_into,i.id)<>? LIMIT 1`,owner,platformId,id);
  if(elsewhere)conflict('此平台标识已属于另一条档案，请先核对和归并');
}

async function addItem(store,owner,actor,input,data) {
  const requestHash=fingerprint(Object.fromEntries(Object.entries(data).filter(([key])=>key!=='id')));
  if(await archiveRawItem(store,owner,data.id)) {
    const prior=await store.get(`SELECT details_json FROM matrix_review_archive_events
      WHERE user_id=? AND entity_type='item' AND entity_id=? AND version=1 AND action='create' LIMIT 1`,owner,data.id);
    if(prior&&JSON.parse(prior.details_json).request_hash===requestHash)
      return {replayed:true,response:await archiveDetail(store,owner,data.id)};
    conflict('档案标识已用于另一条记录');
  }
  const ready=await readyNewItem(store,owner,data,input);
  const ref=ready.legacy?archiveLegacyReference(ready.legacy):null;
  if(ref)await requireReferenceFamily(store,owner,data.id,ref.platform_id);
  const item=queueArchiveItem(store,owner,ready.data,actor,{action:'create',details:{request_hash:requestHash}});
  if(ref)queueArchiveReference(store,owner,item.id,normalizeArchiveReference(ref));
  return {response:archiveJson(item,201)};
}

const titleDifferences=(before,next)=>Object.fromEntries(['original_title','published_title']
  .filter(key=>Object.hasOwn(next,key)&&before[key]!==next[key]).map(key=>[key,{before:before[key]??null,after:next[key]}]));

async function updateItem(store,owner,actor,id,input) {
  archiveObject(input,['expected_version','changes','verify']);
  const raw=await currentRaw(store,owner,id,{version:archiveVersion(input.expected_version)});
  const before=decodeArchiveItem(raw);
  const changes=normalizeArchiveItem(input.changes,{patch:true});
  if(Object.hasOwn(changes,'legacy_id')&&changes.legacy_id!==before.legacy_id)invalid('既有复盘标识不能被替换');
  if(Object.hasOwn(changes,'association_status')&&changes.association_status!==before.association_status)
    invalid('关联状态须通过人工纠错入口变更');
  if(changes.kind&&changes.kind!==before.kind&&await store.get(
    'SELECT id FROM matrix_review_archive_items WHERE user_id=? AND merged_into=? LIMIT 1',owner,id))
    conflict('包含合并版本的档案不能更改内容类型');
  if(changes.sample_reference_id&&changes.sample_reference_id!==before.sample_reference_id)
    Object.assign(changes,fills(changes,sampleFields(await sampleFor(store,owner,changes.sample_reference_id))));
  if(Object.hasOwn(changes,'published_at')&&changes.published_at!==before.published_at) {
    for(const snapshot of await readArchiveSnapshots(store,owner,id))checkArchiveSnapshotTime({...before,...changes},snapshot);
  }
  const verify=input.verify===undefined?[]:archiveVerified(input.verify);
  const verified=[...new Set([...(before.verified??[]),...verify])].sort();
  const changed=Object.entries(changes).some(([key,value])=>fingerprint(value)!==fingerprint(before[key]??null));
  if(!changed&&verified.length===(before.verified??[]).length)return {replayed:true,response:await archiveDetail(store,owner,id)};
  return {response:archiveJson(queueArchiveItem(store,owner,changes,actor,{before:raw,action:'update',verified,
    details:{fields:Object.keys(changes),titles:titleDifferences(before,changes)}}))};
}

async function associate(store,owner,actor,id,input) {
  archiveObject(input,['expected_version','status','reason']);
  const raw=await currentRaw(store,owner,id,{version:archiveVersion(input.expected_version)});
  if(!associationStatuses.includes(input.status))invalid('关联状态无效');
  const reason=textReason(input.reason,true);
  const item=queueArchiveItem(store,owner,{association_status:input.status},actor,{before:raw,
    action:'association',details:{prior:raw.association_status,result:input.status,reason,confidence:'manual'}});
  return {response:archiveJson(item)};
}

async function mergeItems(store,owner,actor,id,input) {
  archiveObject(input,['expected_version','other_id','other_version','action','reason']);
  const otherId=archiveUuid(input.other_id);
  if(id===otherId||!['merge','unmerge'].includes(input.action))invalid('请选择不同档案及有效合并操作');
  const reason=textReason(input.reason,true);
  const primary=await currentRaw(store,owner,id,{version:archiveVersion(input.expected_version)});
  const other=await currentRaw(store,owner,otherId,{version:archiveVersion(input.other_version),allowAlias:true});
  if(primary.kind!==other.kind)conflict('只能合并同一内容类型');
  const merging=input.action==='merge';
  if(merging?Boolean(other.merged_into)||Boolean(await store.get(
    'SELECT id FROM matrix_review_archive_items WHERE user_id=? AND merged_into=? LIMIT 1',owner,otherId)):other.merged_into!==id)
    conflict('请核对现有合并关系，避免重复或嵌套合并');
  if(merging) {
    const numbers=await store.all(`SELECT DISTINCT platform_id FROM matrix_review_archive_refs r
      JOIN matrix_review_archive_items i ON i.user_id=r.user_id AND i.id=r.item_id
      WHERE r.user_id=? AND (i.id IN (?,?) OR i.merged_into=?) AND r.kind='publication'
      AND coalesce(json_extract(r.payload_json,'$.state'),'active')='active' LIMIT 2`,owner,id,otherId,id);
    if(numbers.length>1)conflict('两条档案各有有效的发布编号，请先核对并标记错误编号再归并');
  }
  queueArchiveItem(store,owner,{merged_into:merging?id:null},actor,{before:other,action:input.action,
    details:{related_id:id,reason}});
  const item=queueArchiveItem(store,owner,{},actor,{before:primary,action:input.action,details:{related_id:otherId,reason}});
  return {response:archiveJson(item)};
}

async function addSnapshot(store,owner,actor,id,snapshot) {
  const raw=await currentRaw(store,owner,id);
  const before=await archiveItem(store,owner,id);
  if(!archiveWasPublished(before))invalid('历史指标只登记实际发布过的档案');
  checkArchiveSnapshotTime(before,snapshot);
  const saved=await queueArchiveSnapshot(store,owner,id,snapshot);
  if(saved.created)queueArchiveItem(store,owner,{},actor,{before:raw,action:'snapshot_added',details:{snapshot_id:saved.snapshot.id}});
  return {replayed:!saved.created,response:archiveJson(saved.snapshot,saved.created?201:200)};
}

async function registerReference(store,owner,actor,id,input) {
  archiveObject(input,['expected_version','ref','reason']);
  const item=await currentRaw(store,owner,id,{version:archiveVersion(input.expected_version)});
  const ref=normalizeArchiveReference(input.ref);
  const existing=input.ref?.id?await store.get('SELECT * FROM matrix_review_archive_refs WHERE user_id=? AND id=?',owner,ref.id):null;
  const anchored=existing?.item_id!==id&&existing?await archiveRawItem(store,owner,existing.item_id):null;
  if(existing&&existing.item_id!==id&&anchored?.merged_into!==id)archiveNotFound();
  const displaced=existing&&(existing.platform_id!==ref.platform_id||existing.kind!==ref.kind);
  const reason=textReason(input.reason,Boolean(displaced));
  const target=existing?.item_id??id;
  await requireReferenceFamily(store,owner,id,ref.platform_id);
  const occupied=await store.get('SELECT id FROM matrix_review_archive_refs WHERE user_id=? AND kind=? AND platform_id=?',
    owner,ref.kind,ref.platform_id);
  if(occupied&&occupied.id!==existing?.id)conflict('此平台标识已保存，请核对实际档案');
  const family=await archiveItem(store,owner,id);
  if(ref.kind==='publication'&&ref.state==='active'&&!existing&&family.refs.some(value=>
    value.kind==='publication'&&value.state==='active'&&value.platform_id!==ref.platform_id))
    conflict('档案已有有效发布标识，请从已有标识的纠错入口操作');
  if(displaced) {
    queueArchiveReference(store,owner,target,{...normalizeArchiveReference({...JSON.parse(existing.payload_json),id:existing.id,
      kind:existing.kind,platform_id:existing.platform_id,role:'other',state:'disputed'})},existing);
    ref.id=randomUUID();
  }
  queueArchiveReference(store,owner,target,ref,displaced?null:existing);
  const action=existing?'reference_corrected':'reference_added';
  const details={reference_id:ref.id,reason,...(displaced?{previous_reference_id:existing.id}: {})};
  if(anchored)queueArchiveItem(store,owner,{},actor,{before:anchored,action,details});
  const updated=queueArchiveItem(store,owner,{},actor,{before:item,action,details});
  return {response:archiveJson(updated)};
}

async function getOverview(store,owner) {
  const items=await archiveItems(store,owner,{project:true,includeRefs:true});
  const history=await readArchiveMetricHeads(store,owner);
  const heads=new Map([...history].map(([id,rows])=>[id,rows[0]]));
  return archiveOverview(items,heads);
}

async function handleItems(request,route,url,owner,read,write) {
  const {method}=request,query=url.searchParams;
  if(route===base+'/items') {
    if(method==='GET') {
      const filters=archivePageQuery(query,{filters:true});
      return read(async(store,revision)=>archivePage(await archiveItems(store,owner,{project:true}),filters,revision));
    }
    if(method==='POST') {
      archiveQueryKeys(query,[]);
      const input=await bodyFor(request),data=normalizeArchiveItem(input);
      return write((store,actor)=>addItem(store,owner,actor,input,data));
    }
  }
  if(method==='GET'&&route===base+'/legacy') {
    const filters=archivePageQuery(query);
    return read(async(store,revision)=>archivePage(await listArchiveLegacy(store,owner),filters,revision,{legacy:true}));
  }
  if(method==='GET'&&[base+'/overview',base+'/completeness'].includes(route)) {
    archiveQueryKeys(query,[]);
    return read(async store=>route.endsWith('/overview')?getOverview(store,owner):archiveCompleteness(await archiveItems(store,owner)));
  }
  const match=itemRoute.exec(route);
  if(!match)archiveNotFound();
  const id=archiveUuid(match[1]),action=match[2];
  archiveQueryKeys(query,[]);
  if(method==='GET'&&!action)return read(store=>archiveDetail(store,owner,id));
  if(method==='PATCH'&&!action) {
    const input=await bodyFor(request);
    return write((store,actor)=>updateItem(store,owner,actor,id,input));
  }
  if(method!=='POST'||!action)archiveNotFound();
  const input=await bodyFor(request);
  if(action==='snapshots') {
    const snapshot=normalizeArchiveSnapshot(input);
    if(snapshot.source==='legacy_review_date')invalid('旧复盘日期由只读历史保留');
    return write((store,actor)=>addSnapshot(store,owner,actor,id,snapshot));
  }
  const operation={references:registerReference,association:associate,merge:mergeItems}[action];
  return write((store,actor)=>operation(store,owner,actor,id,input));
}

export async function handleReviewArchive(db,request,route,env,origin,initialRevision) {
  const owner=dailyNotesOwner(env),url=new URL(request.url);
  const read=operation=>consistentRead(db,async(store,revision)=>{
    await archiveActor(store,request,owner,origin,false);
    return operation(store,revision);
  },initialRevision);
  const write=async operation=>(await mutate(db,async store=>{
    const actor=await archiveActor(store,request,owner,origin,true);
    return {...await operation(store,actor),actor};
  })).response;
  // Gate before parsing a body or looking up an identifier, including absent routes.
  await read(async store=>{
    if(!await archiveReady(store))fail(503,'ARCHIVE_NOT_READY','V 字档案尚未启用');
  });
  const args={request,route,url,owner,read,write};
  const response=isArchiveReportRoute(route)?await handleArchiveReports(args):
    route===base+'/imports'||route.startsWith(base+'/imports/')?await handleArchiveImport(args):
      await handleItems(request,route,url,owner,read,write);
  for(const [key,value] of Object.entries(privateArchiveHeaders))response.headers.set(key,value);
  return response;
}
