import {randomUUID} from 'node:crypto';
import {bodyFor,digest,fail,stable} from './security.mjs';
import {reportText} from './ai-reports.mjs';
import {reviewHash,reviewInput,reviewSpecs,reviewUuid,reviewView} from './content-review-validation.mjs';
import {archiveAccount,archiveObject} from './review-archive-model.mjs';

const base='/review/archive/reports';
const detailPattern=/^\/review\/archive\/reports\/(review|ai)\/([^/]+)$/u;
const entityTypes={review:'review_report',ai:'ai_report'};
const reviews=Object.keys(reviewSpecs.reports.fields).filter(key=>key!=='account');
const pageSize=50, historySize=10;
const eventColumns='version,action,details_json,created_at';
const eventWhere='user_id=? AND entity_type=? AND entity_id=?';
const json=data=>Response.json({data},{headers:{'Cache-Control':'private, no-store'}});
const hash=value=>digest(JSON.stringify(stable(value)));
const notFound=()=>fail(404,'NOT_FOUND','汇报记录不存在');
const invalid=()=>fail(400,'VALIDATION_ERROR','汇报查询或修正字段无效');
const stale=()=>fail(409,'VERSION_CONFLICT','汇报已经更新，请读取最新版本再修正');

export function isArchiveReportRoute(route) {
  return route===base||route.startsWith(base+'/');
}

function checkQuery(query,allowed) {
  if([...query.keys()].some(key=>!allowed.includes(key)||query.getAll(key).length!==1))throw invalid();
}
function queryInteger(query,key) {
  if(!query.has(key))return null;
  const value=query.get(key);
  if(!/^(?:0|[1-9]\d*)$/u.test(value)||!Number.isSafeInteger(Number(value)))throw invalid();
  return Number(value);
}
function checkRevision(expected,actual) {
  if(expected!==null&&expected!==actual)throw fail(409,'READ_REVISION_CHANGED','汇报列表已更新，请从第一页读取');
}

function originalReport(type,row) {
  if(type==='ai')return row;
  const {content_hash:ignored,...report}=reviewView('reports',row);
  return report;
}

function eventVersion(row) {
  const {report,request_hash}=JSON.parse(row.details_json);
  return {report,request_hash,version:row.version,action:row.action,saved_at:row.created_at};
}

async function currentReport(store,owner,type,id,allowUnbound=false) {
  const latest=await store.get(`SELECT ${eventColumns} FROM matrix_review_archive_events WHERE ${eventWhere} ORDER BY version DESC,id LIMIT 1`,
    owner,entityTypes[type],id);
  if(latest)return {...eventVersion(latest),persisted:true,bound:true};
  if(type==='ai'&&!allowUnbound)throw notFound();
  const raw=type==='review'?
    await store.get('SELECT * FROM matrix_review_reports WHERE user_id=? AND account=? AND id=?',owner,archiveAccount,id):
    await store.get('SELECT id,author,content,created_at FROM matrix_ai_reports WHERE user_id=? AND id=?',owner,id);
  if(!raw)throw notFound();
  return {report:originalReport(type,raw),version:1,action:'original',saved_at:raw.created_at,persisted:false,bound:type==='review'};
}

function reportHash(type,current) {
  return hash({type,bound:current.bound,version:current.version,report:current.report});
}

function publicVersion(entry) {
  return {version:entry.version,action:entry.action,saved_at:entry.saved_at,report:entry.report};
}

async function reportDetail(store,owner,type,current,{offset=0,revision,queued=[]}={}) {
  const savedOffset=Math.max(0,offset-queued.length);
  const queuedPage=queued.slice(offset,offset+historySize+1);
  const saved=current.persisted&&queuedPage.length<=historySize?await store.all(
    `SELECT ${eventColumns} FROM matrix_review_archive_events WHERE ${eventWhere} ORDER BY version DESC,id LIMIT ? OFFSET ?`,
    owner,entityTypes[type],current.report.id,historySize+1-queuedPage.length,savedOffset):[];
  const original=!current.persisted&&!queued.length&&offset===0?[current]:[];
  const versions=[...queuedPage,...saved.map(eventVersion),...original];
  const history_has_more=versions.length>historySize;
  const head=queued[0]??current;
  return {...head.report,type,account:head.bound?archiveAccount:null,version:head.version,
    content_hash:reportHash(type,head),updated_at:current.persisted||queued.length?head.saved_at:null,
    requires_v_account_confirmation:!head.bound,history:versions.slice(0,historySize).map(publicVersion),history_has_more,
    next_history_offset:history_has_more?offset+historySize:null,...(revision===undefined?{}:{read_revision:revision})};
}

const latest=`WITH ranked AS (
  SELECT user_id,id AS event_id,entity_id,version,created_at AS updated_at,
    row_number() OVER (PARTITION BY entity_id ORDER BY version DESC,id) AS ordinal
  FROM matrix_review_archive_events WHERE user_id=? AND entity_type=?
), latest AS (
  SELECT ranked.entity_id AS id,ranked.version,event.details_json,ranked.updated_at
  FROM ranked JOIN matrix_review_archive_events event ON event.user_id=ranked.user_id AND event.id=ranked.event_id
  WHERE ranked.ordinal=1
)`;
const extract=key=>`json_extract(details_json,'$.report.${key}') AS ${key}`;
const reviewFields=['period_type','period_start','period_end','created_at'];
const reviewProjection=latest+`, report_index AS (
  SELECT r.id,${reviewFields.map(key=>'r.'+key).join(',')},1 AS version,NULL AS updated_at
  FROM matrix_review_reports r WHERE r.user_id=? AND r.account=? AND NOT EXISTS (SELECT 1 FROM latest WHERE id=r.id)
  UNION ALL SELECT id,${reviewFields.map(extract).join(',')},version,updated_at FROM latest
)`;
const reviewQueryArgs=owner=>[owner,entityTypes.review,owner,archiveAccount];

async function listReports(store,owner,type,offset,read_revision) {
  const rows=type==='review'?await store.all(reviewProjection+
    ' SELECT * FROM report_index ORDER BY period_start DESC,created_at DESC,id LIMIT ? OFFSET ?',
    ...reviewQueryArgs(owner),pageSize+1,offset):await store.all(latest+
    ` SELECT id,${extract('author')},${extract('created_at')},version,updated_at FROM latest ORDER BY created_at DESC,id LIMIT ? OFFSET ?`,
    owner,entityTypes.ai,pageSize+1,offset);
  const has_more=rows.length>pageSize;
  return json({items:rows.slice(0,pageSize).map(row=>({...row,type,account:archiveAccount})),has_more,
    next_offset:has_more?offset+pageSize:null,read_revision});
}

function validatedChange(type,changes) {
  archiveObject(changes,type==='review'?reviews:['author','content']);
  if(!Object.keys(changes).length)return {};
  if(type==='review')return reviewInput('reports',changes,{patch:true});
  return Object.fromEntries(Object.entries(changes).map(([key,value])=>[key,reportText(value,key)]));
}

async function correctedReport(store,owner,type,current,changes) {
  if(type==='ai'||!Object.keys(changes).length)return {...current.report,...changes};
  const prior=current.report;
  const fields=Object.fromEntries(Object.keys(reviewSpecs.reports.fields).map(key=>[key,prior[key]]));
  const merged=reviewInput('reports',{...fields,...changes},{validateDaily:Object.hasOwn(changes,'summary_md')||Object.hasOwn(changes,'period_type')});
  if(merged.period_type==='three_day'&&prior.period_type!=='three_day')throw invalid();
  if(merged.period_type!==prior.period_type||merged.period_start!==prior.period_start) {
    const duplicate=await store.get(reviewProjection+
      ' SELECT id FROM report_index WHERE id<>? AND period_type=? AND period_start=? LIMIT 1',
      ...reviewQueryArgs(owner),prior.id,merged.period_type,merged.period_start);
    if(duplicate)throw fail(409,'REVIEW_UNIQUE_CONFLICT','此周期已有另一条复盘汇报');
  }
  return {...prior,...merged};
}

function queueVersion(store,owner,type,entry) {
  const {report,request_hash,version,action,saved_at}=entry;
  store.queue('INSERT INTO matrix_review_archive_events(user_id,id,entity_type,entity_id,version,action,details_json,created_at) VALUES(?,?,?,?,?,?,?,?)',
    owner,randomUUID(),entityTypes[type],report.id,version,action,JSON.stringify(stable({report,request_hash})),saved_at);
}

async function correct(store,owner,type,id,{expected_hash,changes,confirmation}) {
  const current=await currentReport(store,owner,type,id,confirmation);
  const request_hash=hash({expected_hash,changes,confirmation});
  if(current.request_hash===request_hash)return {replayed:true,response:json(await reportDetail(store,owner,type,current))};
  if(reportHash(type,current)!==expected_hash)throw stale();
  const report=await correctedReport(store,owner,type,current,changes);
  const changed=hash(report)!==hash(current.report);
  if(!changed&&current.bound)return {replayed:true,response:json(await reportDetail(store,owner,type,current))};

  const saved_at=new Date().toISOString();
  const queued=[];
  if(!current.persisted) {
    const baseline={...current,bound:true,action:type==='ai'?'confirmed_v_account':'original',saved_at,
      ...(changed?{}:{request_hash})};
    queueVersion(store,owner,type,baseline);
    queued.unshift(baseline);
  }
  if(changed) {
    const correction={report,bound:true,version:current.version+1,action:'corrected',saved_at,request_hash};
    queueVersion(store,owner,type,correction);
    queued.unshift(correction);
  }
  return {response:json(await reportDetail(store,owner,type,current,{queued}))};
}

export async function handleArchiveReports({request,route,url,owner,read,write}) {
  const query=url.searchParams;
  if(route===base&&request.method==='GET') {
    checkQuery(query,['type','offset','read_revision']);
    const type=query.get('type');
    if(!Object.hasOwn(entityTypes,type))throw invalid();
    return read((store,revision)=>{
      checkRevision(queryInteger(query,'read_revision'),revision);
      return listReports(store,owner,type,queryInteger(query,'offset')??0,revision);
    });
  }
  const match=detailPattern.exec(route);
  if(!match||!reviewUuid.test(match[2])||!['GET','PATCH'].includes(request.method))throw notFound();
  const [,type,id]=match;
  if(request.method==='GET') {
    checkQuery(query,['history_offset','read_revision',...(type==='ai'?['confirm_v_account']:[])]);
    if(query.has('confirm_v_account')&&query.get('confirm_v_account')!=='1')throw invalid();
    return read(async(store,revision)=>{
      checkRevision(queryInteger(query,'read_revision'),revision);
      const current=await currentReport(store,owner,type,id,query.has('confirm_v_account'));
      return json(await reportDetail(store,owner,type,current,{offset:queryInteger(query,'history_offset')??0,revision}));
    });
  }
  checkQuery(query,[]);
  const input=archiveObject(await bodyFor(request),['expected_hash','changes',...(type==='ai'?['confirm_v_account']:[])]);
  if(typeof input.expected_hash!=='string'||!reviewHash.test(input.expected_hash)||
    Object.hasOwn(input,'confirm_v_account')&&typeof input.confirm_v_account!=='boolean')throw invalid();
  const changes=validatedChange(type,input.changes);
  return write(store=>correct(store,owner,type,id,{expected_hash:input.expected_hash,changes,confirmation:input.confirm_v_account===true}));
}
