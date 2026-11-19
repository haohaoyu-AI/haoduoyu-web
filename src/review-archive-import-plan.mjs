import {digest, stable} from './security.mjs';
import {archiveUuid,checkArchiveSnapshotTime,normalizeArchiveItem,normalizeArchiveReference,normalizeArchiveSnapshot} from './review-archive-model.mjs';
import {archiveItems,archiveLegacyReference,archiveRawItem,queueArchiveItem,queueArchiveReference,queueArchiveSnapshot,
  verifyArchiveLegacy,verifyArchiveSample} from './review-archive-store.mjs';
import {matchArchiveItem} from './review-archive-match.mjs';
import {readReviewReceipt} from './review-publication-receipts.mjs';
import {archiveWasPublished} from './review-archive-read.mjs';

const object = value => value!==null && typeof value==='object' && !Array.isArray(value);
const hash = value => digest(JSON.stringify(stable(value)));
const equal = (a,b) => a===undefined || b===undefined ? a===b : hash(a)===hash(b);
const refKey = ref => ref.kind+':'+ref.platform_id;
const shape = (value,fields) => object(value) && Object.keys(value).every(key=>fields.includes(key));

function derivedId(...parts) {
  const text = hash(parts);
  return text.slice(0,8)+'-'+text.slice(8,12)+'-4'+text.slice(13,16)+'-a'+text.slice(17,20)+'-'+text.slice(20,32);
}

function rowKey(value,index) {
  if (typeof value!=='string'||!value||value.length>120||!value.isWellFormed()||
    value!==value.trim()||/[\x00-\x1f\x7f]/u.test(value)) return {key:'第 '+(index+1)+' 行',valid:false};
  return {key:value,valid:true};
}

function result(key,action,code,{itemId=null,observed=[],reconciliation=null,match=null,status=null,coverageUnverified=false}={}) {
  const view = {key,action,code,item_id:itemId,observed,
    ...(reconciliation?{reconciliation}:{}),
    ...(status?{observed_status:status}:{}),
    ...(coverageUnverified?{coverage_unverified:true}:{}),
    ...(match?{match:{kind:match.kind,confidence:match.confidence,evidence:match.evidence,
      ...(match.candidates?{candidates:match.candidates}:{})}}:{})};
  return {view};
}

function snapshotFor(value,input,owner) {
  if (input.source==='legacy_review_date'||!shape(value,['id','source_key','observed_at','metrics'])||
    typeof value.observed_at!=='string') return null;
  const normalized = normalizeArchiveSnapshot({...value,source:input.source,
    id:value.id??derivedId('archive-snapshot',owner,input.source,value.source_key)});
  return normalized.observed_at>input.scope.collected_at?null:normalized;
}

function normalizedRow(raw,index,input,owner) {
  const {key,valid} = rowKey(raw?.key,index);
  if (!valid||!shape(raw,['key','record','refs','snapshot','item_id'])||
    raw.record!==undefined&&!object(raw.record)||raw.refs!==undefined&&!Array.isArray(raw.refs)) {
    return result(key,'unrecognized','ARCHIVE_IMPORT_ROW_INPUT');
  }
  const observed = [];
  try {
    const refs = (raw.refs??[]).map(ref=>{
      if (!object(ref)||ref.state&&ref.state!=='active') throw new Error('invalid import reference');
      const normalized = normalizeArchiveReference({...ref,id:ref.id??
        derivedId('archive-ref',owner,ref.kind,ref.platform_id)});
      observed.push({kind:normalized.kind,platform_id:normalized.platform_id});
      return normalized;
    });
    if (raw.item_id!==undefined) archiveUuid(raw.item_id);
    const record = normalizeArchiveItem(raw.record??{},{patch:true});
    if (record.kind && record.kind!==input.scope.kind) return result(key,'conflict','ARCHIVE_IMPORT_WRONG_CONTENT_KIND',{observed});
    const snapshot = raw.snapshot===undefined?null:snapshotFor(raw.snapshot,input,owner);
    if (raw.snapshot!==undefined&&!snapshot || input.kind==='metrics'&&!snapshot)
      return result(key,'unrecognized','ARCHIVE_IMPORT_OBSERVATION_INVALID',{observed});
    if (!raw.item_id&&!record.legacy_id&&!record.original_title&&!record.published_title&&!refs.length)
      return result(key,'unrecognized','ARCHIVE_IMPORT_IDENTITY_MISSING',{observed});
    return {key,record,refs,observed,snapshot,itemId:raw.item_id??null,
      id:derivedId('archive-item',owner,input.kind,input.source,input.source_key,key)};
  } catch {
    return result(key,'unrecognized','ARCHIVE_IMPORT_ROW_INPUT',{observed});
  }
}

function candidatesFor(row,items,input) {
  const activeItems = items.map(item=>({...item,account:'V字',platform:'toutiao',refs:item.refs.filter(ref=>ref.state!=='disputed')}));
  const match = matchArchiveItem(activeItems,{...row.record,account:'V字',platform:'toutiao',kind:input.scope.kind,
    ref_kind:input.kind==='drafts'?'draft':'publication',refs:row.refs});
  if (['conflict','ambiguous'].includes(match.kind)) return {match};
  const disputed = items.some(item=>item.refs.some(ref=>ref.state==='disputed'&&row.refs.some(next=>ref.platform_id===next.platform_id)));
  if (disputed) return {match:{kind:'conflict',confidence:'pending',evidence:{reason:'disputed_reference'}}};
  const reusedId = items.some(item=>item.refs.some(ref=>row.refs.some(next=>ref.id===next.id&&refKey(ref)!==refKey(next))));
  if (reusedId) return {match:{kind:'conflict',confidence:'pending',evidence:{reason:'reference_uuid'}}};
  const explicit = row.itemId?items.find(item=>item.id===row.itemId):null;
  if (row.itemId&&!explicit) return {missing:true,match};
  const legacy = row.record.legacy_id?items.find(item=>item.legacy_ids?.includes(row.record.legacy_id) || item.legacy_id===row.record.legacy_id):null;
  const replay = items.find(item=>item.id===row.id);
  const candidates = [explicit,legacy,replay,match.item].filter(Boolean);
  const identity = candidates[0];
  if (candidates.some(item=>item.id!==identity.id || item.kind!==input.scope.kind)) {
    return {match:{kind:'conflict',confidence:'pending',evidence:{reason:'archive_identity'}}};
  }
  return {before:items.find(item=>item.id===identity?.id)??null,match};
}

function archiveMatchDoesLink(input,match) {
  return input.kind==='directory'&&(match.kind==='corroborated'||match.kind==='id'&&match.evidence.draft_reference);
}

function standalonePublication(row,input,match) {
  // Weak draft association does not erase a genuine separately identified
  // publication. Colliding platform identities still require a manual decision.
  return input.kind==='directory'&&!row.itemId&&!row.record.legacy_id&&
    ['published','deleted'].includes(row.record.publication_status)&&match.kind==='ambiguous'&&
    match.evidence.reason==='article_evidence'&&row.refs.filter(ref=>ref.kind==='publication').length===1;
}

function knownField(before,key) {
  return before.verified?.includes(key)||['none','not_applicable'].includes(before.field_states?.[key]);
}

function mergeObject(before,key,value,current) {
  const merged = {...current};
  for (const [part,datum] of Object.entries(value)) {
    if (datum===null||equal(merged[part],datum)) continue;
    if (merged[part]!=null||knownField(before,key+'.'+part)||knownField(before,key)) return null;
    merged[part] = datum;
  }
  return merged;
}

function statusCanAdvance(key,current,value,links) {
  if (current==='unknown') return true;
  if (key==='association_status') return links&&value==='matched'&&['pending','not_needed'].includes(current);
  if (key==='publication_status') return links&&value==='published'&&['unpublished','pending','scheduled'].includes(current) ||
    current==='published'&&value==='deleted';
  return false;
}

function mergeFields(before,incoming,links) {
  const patch = {};
  const conflicts = [];
  if (links&&incoming.association_status===undefined&&['pending','not_needed'].includes(before.association_status))
    incoming = {...incoming,association_status:'matched'};
  for (const [key,value] of Object.entries(incoming)) {
    const current = before[key];
    if (value===null||equal(current,value)) continue;
    if (knownField(before,key)) { conflicts.push(key); continue; }
    if (['cover','images','field_states'].includes(key)&&object(value)&&object(current)) {
      const next = mergeObject(before,key,value,current);
      if (!next) conflicts.push(key);
      else if (!equal(current,next)) patch[key] = next;
    } else if (current==null||statusCanAdvance(key,current,value,links)) patch[key] = value;
    else conflicts.push(key);
  }
  return {patch,conflicts};
}

function refsToAdd(before,refs) {
  const existing = before?.refs??[];
  const map = new Map();
  const observedId = new Set();
  for (const ref of refs) {
    const key = refKey(ref);
    if (map.has(key)&&!equal(map.get(key),ref) || observedId.has(ref.id)&&!map.has(key)) return null;
    const prior = existing.find(item=>refKey(item)===key);
    if (prior&&['title','url','saved_at'].some(field=>prior[field]!=null&&ref[field]!=null&&!equal(prior[field],ref[field]))) return null;
    map.set(key,ref);
    observedId.add(ref.id);
  }
  const toAdd = [...map.values()].filter(ref=>!existing.some(item=>refKey(item)===refKey(ref)));
  if (toAdd.some(ref=>existing.some(item=>item.id===ref.id))) return null;
  const active = [...existing.filter(ref=>ref.state!=='disputed'),...toAdd];
  if (active.filter(ref=>ref.kind==='draft'&&ref.role==='primary').length>1 ||
    new Set(active.filter(ref=>ref.kind==='publication').map(ref=>ref.platform_id)).size>1) return null;
  return toAdd;
}

async function checkSnapshot(store,owner,itemId,snapshot,before) {
  if (!snapshot) return {snapshot:null};
  const matches = await store.all(`SELECT s.id,s.item_id,s.observed_at,s.source,s.source_key,s.metrics_json
    FROM matrix_review_archive_snapshots s JOIN matrix_review_archive_items a ON a.user_id=s.user_id AND a.id=s.item_id
    WHERE s.user_id=? AND (s.id=? OR (s.source=? AND s.source_key=?) OR
      ((a.id=? OR a.merged_into=?) AND s.source=? AND s.observed_at=?)) ORDER BY s.id LIMIT 50`,
    owner,snapshot.id,snapshot.source,snapshot.source_key,itemId,itemId,snapshot.source,snapshot.observed_at);
  if (!matches.length) return {snapshot};
  const familyIds = new Set([itemId,...(before?.variants??[]).map(item=>item.id)]);
  const same = matches.length<50&&matches.every(row=>familyIds.has(row.item_id)&&row.observed_at===snapshot.observed_at&&
    row.source===snapshot.source&&equal(JSON.parse(row.metrics_json),snapshot.metrics));
  return {snapshot:null,conflict:!same,snapshotId:matches[0].id};
}

function businessDay(value) {
  if (!value) return null;
  return value.length===10?value:new Date(Date.parse(value)+8*3600000).toISOString().slice(0,10);
}

function captureDay(input,row,before) {
  if (input.kind==='metrics') return businessDay(row.snapshot?.observed_at);
  if (input.kind==='drafts') return businessDay(row.record.draft_saved_at??row.refs.find(ref=>ref.kind==='draft')?.saved_at??before?.draft_saved_at);
  return businessDay(row.record.published_at??before?.published_at);
}

function knownLegacyPublication(legacy) {
  return Boolean(legacy&&legacy.publish_status!=='pending'&&
    (legacy.published_at||['published','unmatched'].includes(legacy.publish_status)));
}

async function linkedSourceRecord(store,owner,row,before) {
  let {record} = row;
  const legacy = row.legacy??null;
  let legacyMatch = false;
  try {
    if (legacy) {
      const receipt = await readReviewReceipt(store,owner,legacy.id);
      const supplied = row.refs.filter(ref=>ref.kind==='publication');
      legacyMatch = Boolean(receipt.original_draft_title&&(!supplied.length||supplied.some(ref=>ref.platform_id===legacy.platform_article_id)));
      if (legacyMatch && record.original_title!=null && record.original_title!==receipt.original_draft_title) return null;
      if (legacyMatch && record.original_title==null) record = {...record,original_title:receipt.original_draft_title};
      if (row.snapshot&&record.publication_status===undefined&&(before?.publication_status??'unknown')==='unknown'&&knownLegacyPublication(legacy)) {
        record = {...record,publication_status:'published',published_at:record.published_at??before?.published_at??legacy.published_at};
      }
    }
    const sampleId = record.sample_reference_id;
    if (sampleId&&sampleId!==before?.sample_reference_id) {
      try {
        const sample = await verifyArchiveSample(store,owner,sampleId);
        record = {...record,sample_title:record.sample_title??sample.title,sample_url:record.sample_url??sample.url,
          sample_published_at:record.sample_published_at??sample.published_at};
      } catch (error) {
        // An old association remains archival evidence even if the sample was
        // subsequently removed. A newly proposed association needs an active sample.
        if (error?.code!=='ARCHIVE_SAMPLE_NOT_FOUND'||legacy?.reference_article_id!==sampleId) throw error;
      }
    }
    return {record,legacyMatch};
  } catch (error) {
    if (error?.code==='ARCHIVE_SAMPLE_NOT_FOUND') return null;
    throw error;
  }
}

async function prepareLegacyRow(store,owner,row) {
  if (row.view||!row.record.legacy_id) return row;
  const {key,observed} = row;
  let legacy;
  try { legacy = await verifyArchiveLegacy(store,owner,row.record.legacy_id); }
  catch (error) {
    if (error?.code==='ARCHIVE_LEGACY_NOT_FOUND')
      return result(key,'conflict','ARCHIVE_IMPORT_REFERENCE_SCOPE',{observed});
    throw error;
  }
  const ref = archiveLegacyReference(legacy);
  if (!ref||row.refs.some(other=>refKey(other)===refKey(ref))) return {...row,legacy};
  if (ref.kind==='publication'&&row.refs.some(other=>other.kind==='publication'))
    return result(key,'conflict','ARCHIVE_IMPORT_LEGACY_ID_CONFLICT',{observed,reconciliation:'suspected_duplicate'});
  try {
    const normalized = normalizeArchiveReference({...ref,id:derivedId('archive-ref',owner,ref.kind,ref.platform_id)});
    return {...row,legacy,refs:[...row.refs,normalized]};
  } catch {
    return result(key,'conflict','ARCHIVE_IMPORT_LEGACY_REF_INVALID',{observed,reconciliation:'suspected_duplicate'});
  }
}

async function planOne(store,owner,row,items,input) {
  if (row.view) return row;
  const {key,refs,observed} = row;
  const {before,match:candidate,missing} = candidatesFor(row,items,input);
  let match = candidate;
  const itemId = before?.id??row.id;
  const status = row.record.publication_status??null;
  const independent = standalonePublication(row,input,match);
  if (missing) return result(key,'unrecognized','ARCHIVE_IMPORT_ARTICLE_NOT_FOUND',{itemId:row.itemId,observed,status});
  if (['conflict','ambiguous'].includes(match.kind)&&!independent)
    return result(key,'conflict','ARCHIVE_IMPORT_MATCH_UNRESOLVED',{observed,reconciliation:'suspected_duplicate',match,status});
  if (input.kind==='metrics'&&!before)
    return result(key,'unrecognized','ARCHIVE_IMPORT_ARTICLE_NOT_FOUND',{observed,reconciliation:'platform_only',match,status});
  const linked = await linkedSourceRecord(store,owner,row,before);
  if (!linked) return result(key,'conflict','ARCHIVE_IMPORT_REFERENCE_SCOPE',{observed,itemId:before?.id,match,status});
  const {legacyMatch} = linked;
  const record = independent?{...linked.record,association_status:'ambiguous'}:linked.record;
  if (legacyMatch&&match.kind==='none') match = {kind:'id',confidence:'exact',evidence:{legacy_reference:true,draft_reference:true}};
  const date = captureDay(input,row,before);
  if (date&&(input.scope.from&&date<input.scope.from||input.scope.to&&date>input.scope.to))
    return result(key,'conflict','ARCHIVE_IMPORT_OUTSIDE_WINDOW',{itemId,observed,match,status});
  const links = archiveMatchDoesLink(input,match)||legacyMatch;
  if (record.association_status==='matched'&&!links&&before?.association_status!=='matched')
    return result(key,'conflict','ARCHIVE_IMPORT_MATCH_NOT_ESTABLISHED',{observed,itemId:before?.id,match,status});
  const {patch,conflicts} = before?mergeFields(before,record,links):{patch:record,conflicts:[]};
  if (conflicts.length) return result(key,'conflict','ARCHIVE_IMPORT_EXISTING_VALUE',{itemId,observed,match,
    reconciliation:conflicts.some(key=>key.endsWith('_status'))?'status_conflict':null,status});
  const newRefs = refsToAdd(before,refs);
  if (!newRefs) return result(key,'conflict','ARCHIVE_IMPORT_REF_CONFLICT',{itemId,observed,match,reconciliation:'suspected_duplicate',status});
  const effective = {...before,...patch,refs:[...(before?.refs??[]),...newRefs]};
  if (row.snapshot&&(!archiveWasPublished(effective)||input.kind==='metrics'&&
    !archiveWasPublished(before??{})&&!knownLegacyPublication(row.legacy)))
    return result(key,'conflict','ARCHIVE_IMPORT_SNAPSHOT_NOT_PUBLISHED',{itemId,observed,match,status});
  try { checkArchiveSnapshotTime(effective,row.snapshot); }
  catch { return result(key,'conflict','ARCHIVE_IMPORT_EARLY_OBSERVATION',{itemId,observed,match,status}); }
  const checked = await checkSnapshot(store,owner,itemId,row.snapshot,before);
  if (checked.conflict) return result(key,'conflict','ARCHIVE_IMPORT_SNAPSHOT_CONFLICT',{itemId,observed,match,status});
  const changes = before?patch:normalizeArchiveItem({...patch,kind:input.scope.kind,id:itemId,
    ...(legacyMatch&&patch.association_status===undefined?{association_status:'matched'}:{})});
  const action = !before?'new':Object.keys(changes).length||newRefs.length||checked.snapshot?'update':'unchanged';
  const code = independent?'ARCHIVE_IMPORT_LINK_PENDING':action==='unchanged'?'ARCHIVE_IMPORT_ALREADY_PRESENT':'ARCHIVE_IMPORT_READY';
  const coverageUnverified = Boolean(!date&&(input.scope.from||input.scope.to));
  return {...result(key,action,code,{itemId,observed,match,status,coverageUnverified,
    reconciliation:independent?'suspected_duplicate':null}),beforeVersion:before?.version??null,
    before,changes,refs:newRefs,snapshot:checked.snapshot,snapshotId:checked.snapshotId??null};
}

function fingerprints(row) {
  const refs = row.refs??[];
  return [...refs.map(ref=>['ref-id',ref.id]),...refs.map(ref=>['platform-id',ref.platform_id]),
    ...(row.snapshot?[['snapshot-id',row.snapshot.id],['snapshot-source',row.snapshot.source_key]]:[])].map(value=>value.join(':'));
}

function duplicateRows(rows,input,pages) {
  const previous = new Set(pages.flatMap(page=>page.rows).map(row=>row.key));
  const indexes = new Map();
  const collided = new Set();
  for (const [index,row] of rows.entries()) {
    const key = row.key??row.view.key;
    if (previous.has(key)) collided.add(index);
    const identities = input.kind==='metrics'?fingerprints(row).filter(key=>key.startsWith('snapshot-')):fingerprints(row);
    for (const identity of ['row-key:'+key,...new Set(identities)]) {
      if (indexes.has(identity)) { collided.add(indexes.get(identity)); collided.add(index); }
      else indexes.set(identity,index);
    }
  }
  return collided;
}

function protectConcurrentRows(plans) {
  const groups = new Map();
  const snapshots = new Map();
  for (const [index,plan] of plans.entries()) {
    if (!['new','update'].includes(plan.view.action)||!plan.view.item_id) continue;
    const list = groups.get(plan.view.item_id)??[];
    list.push(index);
    groups.set(plan.view.item_id,list);
    if (plan.snapshot) {
      const key = JSON.stringify([plan.view.item_id,plan.snapshot.source,plan.snapshot.observed_at]);
      const previous = snapshots.get(key)??[];
      previous.push(index);
      snapshots.set(key,previous);
    }
  }
  const conflicting = [...groups.values()].filter(list=>list.length>1&&list.some(index=>Object.keys(plans[index].changes).length||plans[index].refs.length));
  for (const indexes of snapshots.values()) if (indexes.length>1) conflicting.push(indexes);
  for (const index of new Set(conflicting.flat())) {
    const {key,item_id,observed} = plans[index].view;
    plans[index] = result(key,'conflict','ARCHIVE_IMPORT_PARALLEL_ITEM',{itemId:item_id,observed,reconciliation:'suspected_duplicate'});
  }
}

export async function planImportRows(store,owner,input,pages) {
  const rows = [];
  for (const [index,row] of input.rows.entries()) rows.push(await prepareLegacyRow(store,owner,normalizedRow(row,index,input,owner)));
  const duplicates = duplicateRows(rows,input,pages);
  const items = await archiveItems(store,owner);
  const plans = [];
  for (const [index,row] of rows.entries()) {
    if (!duplicates.has(index)) plans.push(await planOne(store,owner,row,items,input));
    else plans.push(result(row.key??row.view.key,'conflict','ARCHIVE_IMPORT_DUPLICATE_ROW',
      {observed:row.observed??row.view?.observed,reconciliation:'suspected_duplicate'}));
  }
  protectConcurrentRows(plans);
  return plans;
}

export async function applyImportPlans(store,owner,actor,plans) {
  const outcomes = [];
  const changesByItem = new Map();
  for (const plan of plans) {
    const {action,item_id} = plan.view;
    if (action!=='new'&&action!=='update') continue;
    const group = changesByItem.get(item_id)??[];
    group.push(plan);
    changesByItem.set(item_id,group);
  }
  for (const plan of plans) {
    const {action,item_id:itemId} = plan.view;
    const status = action==='conflict'?'failure':action==='unrecognized'?'omission':'success';
    if (action==='new'||action==='update') {
      const group = changesByItem.get(itemId);
      if (group) {
        changesByItem.delete(itemId);
        const before = plan.before?await archiveRawItem(store,owner,itemId):null;
        queueArchiveItem(store,owner,plan.changes,actor,{before,action:'import',details:{match:plan.view.match,
          reference_ids:group.flatMap(row=>row.refs.map(ref=>ref.id)),snapshot_ids:group.flatMap(row=>row.snapshot?[row.snapshot.id]:[])}});
      }
      for (const ref of plan.refs) queueArchiveReference(store,owner,itemId,ref);
      if (plan.snapshot) await queueArchiveSnapshot(store,owner,itemId,plan.snapshot);
    }
    outcomes.push({...plan.view,status});
  }
  return outcomes;
}
