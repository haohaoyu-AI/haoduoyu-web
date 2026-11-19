import {randomUUID} from 'node:crypto';
import {fail,stable} from './security.mjs';
import {reviewView} from './content-review-validation.mjs';
import {reviewReceipt,reviewReceiptColumns,reviewReceiptJoin,reviewCanonicalWhere} from './review-publication-receipts.mjs';
import {archiveAccount,archivePlatform,archivePayloadFields,archiveTitle,sortArchiveTime} from './review-archive-model.mjs';
import {beijingDay} from './lib/time.mjs';
import {platformArticleId} from '../shared/review-draft-match.mjs';

export const archiveTables=Object.freeze({items:'matrix_review_archive_items',refs:'matrix_review_archive_refs',
  snapshots:'matrix_review_archive_snapshots',events:'matrix_review_archive_events',imports:'matrix_review_archive_imports',
  pages:'matrix_review_archive_import_pages'});
export async function archiveReady(store) {
  const tables=Object.values(archiveTables);
  const row=await store.get(`SELECT count(*) AS found FROM sqlite_schema WHERE type='table'
    AND name IN (${tables.map(()=>'?').join(',')})`,...tables);
  return row?.found===tables.length;
}
const stringify=value=>JSON.stringify(stable(value));
const itemColumns=['id','kind','production_status','publication_status','association_status','legacy_id','merged_into',
  'version','created_at','updated_at'];
const fullColumns=itemColumns.join(',')+',payload_json,verified_json';
const summaries=itemColumns.join(',')+`,json_remove(payload_json,'$.original_body','$.published_body','$.alternate_titles',
  '$.sources','$.cover','$.images','$.source_note','$.tags') AS payload_json,verified_json`;
const familyWhere='user_id=? AND (id=? OR merged_into=?)';

export function decodeArchiveItem(raw) {
  if(!raw)return null;
  const verification=JSON.parse(raw.verified_json);
  return {...JSON.parse(raw.payload_json),...Object.fromEntries(itemColumns.map(key=>[key,raw[key]])),
    account:archiveAccount,platform:archivePlatform,verified:Object.keys(verification).filter(key=>verification[key])};
}

export function archiveSummary(row) {
  const {id,kind,production_status,publication_status,association_status,original_title,published_title,published_at,version,legacy_id,merged_into}=row;
  return {id,kind,production_status,publication_status,association_status,original_title,published_title,published_at,version,legacy_id,merged_into,
    title:archiveTitle(row),sort_at:sortArchiveTime(row)};
}

export function archiveRawItem(store,owner,id) {
  return store.get(`SELECT user_id,${fullColumns} FROM ${archiveTables.items} WHERE user_id=? AND id=?`,owner,id);
}

export function decodeArchiveReference(row) {
  const {id,item_id,kind,platform_id,role,created_at,updated_at}=row;
  return {...JSON.parse(row.payload_json),id,item_id,kind,platform_id,role,created_at,updated_at};
}

function familyItems(rows,refRows) {
  const items=rows.map(decodeArchiveItem), refs=new Map(), variants=new Map();
  for(const row of refRows) {
    if(!refs.has(row.item_id))refs.set(row.item_id,[]);
    refs.get(row.item_id).push(decodeArchiveReference(row));
  }
  for(const item of items) {
    if(!item.merged_into)continue;
    if(!variants.has(item.merged_into))variants.set(item.merged_into,[]);
    variants.get(item.merged_into).push(item);
  }
  return items.map(item=>{
    const included=variants.get(item.id)??[];
    return {...item,refs:[item,...included].flatMap(member=>refs.get(member.id)??[]),variants:included.map(archiveSummary),
      legacy_ids:[...new Set([item,...included].map(member=>member.legacy_id).filter(Boolean))]};
  });
}

export async function archiveItems(store,owner,{project=false,includeRefs=!project}={}) {
  const rows=await store.all(`SELECT ${project?summaries:fullColumns} FROM ${archiveTables.items} WHERE user_id=? ORDER BY id`,owner);
  const refs=includeRefs?await store.all(`SELECT * FROM ${archiveTables.refs} WHERE user_id=? ORDER BY item_id,kind,id`,owner):[];
  return familyItems(rows,refs).filter(item=>!item.merged_into);
}

export async function archiveItem(store,owner,id) {
  const rows=await store.all(`SELECT ${fullColumns} FROM ${archiveTables.items} WHERE ${familyWhere} ORDER BY id`,owner,id,id);
  if(!rows.some(row=>row.id===id))return null;
  const refs=await store.all(`SELECT * FROM ${archiveTables.refs} WHERE user_id=? AND item_id IN
    (SELECT id FROM ${archiveTables.items} WHERE ${familyWhere}) ORDER BY item_id,kind,id`,owner,owner,id,id);
  return familyItems(rows,refs).find(item=>item.id===id)??null;
}

export function archiveRefPayload(ref) {
  return stringify({title:ref.title??null,url:ref.url??null,saved_at:ref.saved_at??null,state:ref.state??'active'});
}

export function queueArchiveReference(store,owner,itemId,ref,before=null) {
  const time=new Date().toISOString(),payload=archiveRefPayload(ref);
  if(ref.role==='primary')store.queue(`UPDATE ${archiveTables.refs} SET role='duplicate',updated_at=?
    WHERE user_id=? AND item_id=? AND kind=? AND role='primary' AND id<>?`,time,owner,itemId,ref.kind,ref.id);
  if(before) {
    store.queue(`UPDATE ${archiveTables.refs} SET role=?,payload_json=?,updated_at=?
      WHERE user_id=? AND item_id=? AND id=? AND kind=? AND platform_id=?`,
      ref.role,payload,time,owner,itemId,ref.id,ref.kind,ref.platform_id);
    store.expectChange();
  } else {
    store.queue(`INSERT INTO ${archiveTables.refs}(user_id,id,item_id,kind,platform_id,role,payload_json,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?)`,owner,ref.id,itemId,ref.kind,ref.platform_id,ref.role,payload,time,time);
  }
}

export async function archiveEvents(store,owner,typeOrItem,explicitId) {
  const type=explicitId===undefined?'item':typeOrItem;
  const id=explicitId??(typeof typeOrItem==='string'?typeOrItem:typeOrItem.id);
  const rows=await store.all(`SELECT id,entity_type,entity_id,version,action,details_json,created_at FROM ${archiveTables.events}
    WHERE user_id=? AND entity_type=? AND entity_id=? ORDER BY version DESC,created_at DESC,id`,owner,type,id);
  return rows.map(({details_json,...row})=>({...row,details:JSON.parse(details_json)}));
}

export function queueArchiveEvent(store,owner,type,id,version,action,details={},actor=null) {
  const payload=actor?.actor?{...details,actor:actor.actor}:details;
  store.queue(`INSERT INTO ${archiveTables.events}(user_id,id,entity_type,entity_id,version,action,details_json,created_at)
    VALUES(?,?,?,?,?,?,?,?)`,owner,randomUUID(),type,id,version,action,stringify(payload),new Date().toISOString());
}

export function queueArchiveItem(store,owner,changes,actor,{before=null,verified,action=before?'update':'create',details={}}={}) {
  const prior=before&&Object.hasOwn(before,'payload_json')?decodeArchiveItem(before):before,time=new Date().toISOString();
  const row={...prior,...changes,account:archiveAccount,platform:archivePlatform,id:prior?.id??changes.id,
    merged_into:Object.hasOwn(changes,'merged_into')?changes.merged_into:prior?.merged_into??null,
    verified:verified??prior?.verified??[],version:(prior?.version??0)+1,
    created_at:prior?.created_at??time,updated_at:time};
  const payload=stringify(Object.fromEntries(archivePayloadFields.map(key=>[key,row[key]??(key==='field_states'?{}:null)])));
  const verification=stringify(Object.fromEntries(row.verified.map(key=>[key,true])));
  if(prior) {
    store.queue(`UPDATE ${archiveTables.items} SET kind=?,production_status=?,publication_status=?,association_status=?,
      payload_json=?,verified_json=?,legacy_id=?,merged_into=?,version=?,updated_at=? WHERE user_id=? AND id=? AND version=?`,
      row.kind,row.production_status,row.publication_status,row.association_status,payload,verification,row.legacy_id,
      row.merged_into,row.version,time,owner,row.id,prior.version);
    store.expectChange();
  } else {
    store.queue(`INSERT INTO ${archiveTables.items}(user_id,id,kind,production_status,publication_status,association_status,
      payload_json,verified_json,legacy_id,merged_into,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      owner,row.id,row.kind,row.production_status,row.publication_status,row.association_status,payload,verification,
      row.legacy_id,row.merged_into,row.version,time,time);
  }
  const changed=Object.keys(changes).filter(key=>key!=='id'&&stringify(changes[key])!==stringify(prior?.[key])).sort();
  const titles=Object.fromEntries(changed.filter(key=>['original_title','published_title'].includes(key))
    .map(key=>[key,{before:prior?.[key]??null,after:row[key]??null}]));
  queueArchiveEvent(store,owner,'item',row.id,row.version,action,{fields:changed,...(Object.keys(titles).length?{titles}:{}),...details},actor);
  return row;
}

export function decodeArchiveSnapshot(raw) {
  const {id,item_id,observed_at,source,source_key,created_at}=raw;
  return {id,item_id,observed_at,source,source_key,metrics:JSON.parse(raw.metrics_json),created_at};
}

function decodeLegacySnapshot(raw) {
  const {id,article_id,snapshot_date,source,age_hours,content_hash:ignored,...metrics}=reviewView('snapshots',raw);
  return {id,item_id:raw.item_id,article_id,observed_at:null,observed_date:snapshot_date,source:'legacy_review_date',
    source_key:id,legacy_source:source,age_hours,metrics,created_at:null};
}

function snapshotDay(row) {
  return row.observed_date??(row.observed_at?beijingDay(Date.parse(row.observed_at)):'');
}

function latestFirst(a,b) {
  return snapshotDay(b).localeCompare(snapshotDay(a))||
    (b.observed_at??'').localeCompare(a.observed_at??'')||a.id.localeCompare(b.id);
}

export async function readArchiveMetricHeads(store,owner) {
  const native=await store.all(`SELECT s.*,COALESCE(a.merged_into,a.id) AS canonical_id FROM ${archiveTables.snapshots} s
    JOIN ${archiveTables.items} a ON a.user_id=s.user_id AND a.id=s.item_id WHERE s.user_id=?`,owner);
  const legacy=await store.all(`SELECT s.*,a.id AS item_id,COALESCE(a.merged_into,a.id) AS canonical_id FROM matrix_review_snapshots s
    JOIN ${archiveTables.items} a ON a.user_id=s.user_id AND a.legacy_id=s.article_id WHERE s.user_id=?`,owner);
  const groups=new Map();
  function append(rows,decode) {
    for(const row of rows) {
      if(!groups.has(row.canonical_id))groups.set(row.canonical_id,[]);
      groups.get(row.canonical_id).push(decode(row));
    }
  }
  append(native,decodeArchiveSnapshot);
  append(legacy,decodeLegacySnapshot);
  for(const rows of groups.values())rows.sort(latestFirst);
  return groups;
}

export async function readArchiveSnapshots(store,owner,item) {
  const id=typeof item==='string'?item:item.id;
  const native=await store.all(`SELECT s.* FROM ${archiveTables.snapshots} s JOIN ${archiveTables.items} a
    ON a.user_id=s.user_id AND a.id=s.item_id WHERE s.user_id=? AND (a.id=? OR a.merged_into=?)`,owner,id,id);
  const legacy=await store.all(`SELECT s.*,a.id AS item_id FROM matrix_review_snapshots s JOIN ${archiveTables.items} a
    ON a.user_id=s.user_id AND a.legacy_id=s.article_id WHERE s.user_id=? AND (a.id=? OR a.merged_into=?)`,owner,id,id);
  return [...native.map(decodeArchiveSnapshot),...legacy.map(decodeLegacySnapshot)].sort(latestFirst);
}

export async function queueArchiveSnapshot(store,owner,itemId,snapshot) {
  const {id,source,source_key,observed_at,metrics}=snapshot;
  const rows=await store.all(`SELECT s.*,COALESCE(a.merged_into,a.id) AS canonical_id FROM ${archiveTables.snapshots} s
    JOIN ${archiveTables.items} a ON a.user_id=s.user_id AND a.id=s.item_id
    WHERE s.user_id=? AND (s.id=? OR (s.source=? AND s.source_key=?) OR
      ((a.id=? OR a.merged_into=?) AND s.source=? AND s.observed_at IS ?)) ORDER BY s.id LIMIT 50`,
    owner,id,source,source_key,itemId,itemId,source,observed_at);
  const payload=stringify(metrics);
  if(rows.length) {
    const same=rows.length<50&&rows.every(row=>(row.item_id===itemId||row.canonical_id===itemId)&&row.source===source&&
      row.observed_at===observed_at&&stringify(JSON.parse(row.metrics_json))===payload);
    if(!same)throw fail(409,'ARCHIVE_SNAPSHOT_CONFLICT','已采集指标与此请求冲突，原快照已保留');
    return {created:false,snapshot:decodeArchiveSnapshot(rows[0])};
  }
  const time=new Date().toISOString();
  store.queue(`INSERT INTO ${archiveTables.snapshots}(user_id,id,item_id,observed_at,source,source_key,metrics_json,created_at)
    VALUES(?,?,?,?,?,?,?,?)`,owner,id,itemId,observed_at,source,source_key,payload,time);
  return {created:true,snapshot:{id,item_id:itemId,observed_at,source,source_key,metrics,created_at:time}};
}

const legacySelect=`SELECT a.*,${reviewReceiptColumns} FROM matrix_review_articles a ${reviewReceiptJoin}
  WHERE a.user_id=? AND a.account=? AND a.platform=? AND ${reviewCanonicalWhere}`;

function decodeLegacyArticle(row) {
  const receipt=reviewReceipt(row),article=reviewView('articles',row);
  return {...article,original_draft_title:receipt.original_draft_title??null,draft_ref:receipt.draft_ref??null};
}

export async function verifyArchiveLegacy(store,owner,id) {
  const row=await store.get(legacySelect+' AND a.id=?',owner,archiveAccount,archivePlatform,id);
  if(!row)throw fail(404,'ARCHIVE_LEGACY_NOT_FOUND','V字复盘记录不存在');
  return decodeLegacyArticle(row);
}

export async function verifyArchiveSample(store,owner,id) {
  const row=await store.get(`SELECT s.id,s.title,s.url,s.published_at FROM matrix_review_benchmark_articles s
    JOIN matrix_review_benchmark_accounts a ON a.user_id=s.user_id AND a.id=s.benchmark_account_id
    WHERE s.user_id=? AND s.id=? AND a.account=? AND s.deleted_at IS NULL AND a.deleted_at IS NULL`,owner,id,archiveAccount);
  if(!row)throw fail(404,'ARCHIVE_SAMPLE_NOT_FOUND','V字对标样本不存在');
  return row;
}

function legacyPublicationStatus(legacy) {
  if(legacy.publish_status==='pending')return 'pending';
  return legacy.published_at||['published','unmatched'].includes(legacy.publish_status)?'published':'unknown';
}

export function archiveLegacyReference(legacy) {
  const platform_id=platformArticleId(legacy),status=legacyPublicationStatus(legacy);
  if(!platform_id||status==='unknown')return null;
  const draft=status==='pending';
  return {kind:draft?'draft':'publication',platform_id,role:'primary',title:legacy.title,url:legacy.url,
    saved_at:draft?legacy.draft_saved_at:null,state:'active'};
}

function legacySummary(article) {
  const publication_status=legacyPublicationStatus(article),draft=publication_status==='pending';
  return {id:article.id,legacy_id:article.id,kind:null,title:article.title,production_status:'unknown',publication_status,
    association_status:article.original_draft_title?'matched':'pending',original_title:draft?article.title:article.original_draft_title,
    published_title:draft?null:article.title,published_at:article.published_at,draft_saved_at:article.draft_saved_at,platform_url:article.url,
    platform_article_id:article.platform_article_id,sample_reference_id:article.reference_article_id,sample_title:article.sample_title,
    sample_url:article.sample_url,images:article.image_count===null?null:{total:article.image_count,real:null,ai:null}};
}

export async function listArchiveLegacy(store,owner) {
  const rows=await store.all(legacySelect+` AND NOT EXISTS (SELECT 1 FROM ${archiveTables.items} i WHERE i.user_id=a.user_id AND i.legacy_id=a.id)
    ORDER BY COALESCE(a.published_at,a.draft_saved_at) DESC,a.id`,owner,archiveAccount,archivePlatform);
  return rows.map(row=>legacySummary(decodeLegacyArticle(row)));
}
