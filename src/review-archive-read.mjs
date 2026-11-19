import {fail} from './security.mjs';
import {beijingDay} from './lib/time.mjs';
import {
  archiveDay,archiveFieldState,archiveKinds,archiveTitle,associationStatuses,productionStatuses,publicationStatuses,sortArchiveTime,
} from './review-archive-model.mjs';
import {archiveSummary} from './review-archive-store.mjs';

const pageSize=50;
const filterValues={kind:archiveKinds,production_status:productionStatuses,publication_status:publicationStatuses,
  association_status:associationStatuses};
const pageKeys=['offset','read_revision'];
export const privateArchiveHeaders={'Cache-Control':'private, no-store',Vary:'Cookie, Authorization'};
export const archiveJson=(data,status=200)=>Response.json({data},{status,headers:privateArchiveHeaders});
export const archiveNotFound=()=>fail(404,'NOT_FOUND','找不到档案或不在当前账号范围内');

export function archiveQueryKeys(query,allowed) {
  if([...query.keys()].some(key=>!allowed.includes(key)||query.getAll(key).length!==1))
    fail(400,'VALIDATION_ERROR','档案查询参数无效');
}

export function archivePageQuery(query,{filters=false}={}) {
  archiveQueryKeys(query,filters?[...pageKeys,...Object.keys(filterValues),'from','to']:pageKeys);
  const parsed={offset:0,read_revision:null};
  for(const key of pageKeys)if(query.has(key)) {
    const value=query.get(key);
    if(!/^(?:0|[1-9]\d*)$/u.test(value)||!Number.isSafeInteger(Number(value)))
      fail(400,'VALIDATION_ERROR','档案分页参数无效');
    parsed[key]=Number(value);
  }
  for(const [key,values] of Object.entries(filterValues))if(query.has(key)) {
    const value=query.get(key);
    if(!values.includes(value))fail(400,'VALIDATION_ERROR','档案状态筛选无效');
    parsed[key]=value;
  }
  parsed.from=archiveDay(query.get('from'));
  parsed.to=archiveDay(query.get('to'));
  if(parsed.from&&parsed.to&&parsed.from>parsed.to)fail(400,'VALIDATION_ERROR','档案筛选起始日不能晚于结束日');
  return parsed;
}

function businessDay(value) {
  if(!value)return null;
  return value.length===10?value:beijingDay(Date.parse(value));
}

function selected(item,filters) {
  if(Object.keys(filterValues).some(key=>filters[key]&&filters[key]!==item[key]))return false;
  const day=businessDay(sortArchiveTime(item));
  return !day||(!filters.from||day>=filters.from)&&(!filters.to||day<=filters.to);
}

export function archivePage(items,filters,revision,{legacy=false}={}) {
  if(filters.read_revision!==null&&filters.read_revision!==revision)
    fail(409,'READ_REVISION_CHANGED','档案列表已更新，请从第一页读取');
  const candidates=legacy?items:items.filter(item=>!item.merged_into&&selected(item,filters))
    .map(item=>({...archiveSummary(item),sort_at:sortArchiveTime(item)}))
    .sort((a,b)=>(b.sort_at??'').localeCompare(a.sort_at??'')||a.id.localeCompare(b.id));
  const rows=candidates.slice(filters.offset,filters.offset+pageSize);
  const has_more=filters.offset+pageSize<candidates.length;
  return archiveJson({items:rows,has_more,next_offset:has_more?filters.offset+pageSize:null,read_revision:revision});
}

export function archiveWasPublished(item) {
  return item.publication_status==='published'||item.publication_status==='deleted'&&Boolean(item.published_at||
    item.refs?.some(ref=>ref.kind==='publication'&&ref.state!=='disputed'))||
    Boolean(item.variants?.some(archiveWasPublished));
}

function metricTotals(rows,key) {
  const known=rows.map(row=>row?.metrics?.[key]).filter(value=>typeof value==='number');
  const sum=known.reduce((total,value)=>total+value,0);
  return {value:known.length?(key==='ctr'?sum/known.length:sum):null,known:known.length,unknown:rows.length-known.length};
}

export function archiveOverview(items,snapshots) {
  const visible=items.filter(item=>!item.merged_into);
  const published=visible.filter(archiveWasPublished);
  const observations=published.map(item=>snapshots.get(item.id)??null);
  const metricFields=['reads','impressions','ctr','likes','comments','shares','favorites','reposts','interactions'];
  const eligible=published.filter(item=>item.association_status==='matched'&&Boolean(item.sample_reference_id||item.sample_url)).length;
  return archiveJson({counts:{published:published.length,micro:visible.filter(item=>item.kind==='micro').length,
    pending:visible.filter(item=>item.publication_status==='pending').length,
    scheduled:visible.filter(item=>item.publication_status==='scheduled').length,
    deleted:visible.filter(item=>item.publication_status==='deleted').length,
    association_pending:published.filter(item=>['pending','ambiguous'].includes(item.association_status)).length,
    undated:visible.filter(item=>!sortArchiveTime(item)).length},
  metrics:Object.fromEntries(metricFields.map(key=>[key,metricTotals(observations,key)])),
  attribution:{eligible,excluded:published.length-eligible}});
}

const completenessFields=['original_title','published_title','original_body','published_body','creative_started_at','draft_saved_at',
  'scheduled_at','published_at','deleted_at','sources','cover','images.total','images.real','images.ai','sample_title',
  'sample_url','sample_published_at','sample_reference_id','imitation_started_at','imitation_completed_at','source_note','tags'];

function statusForField(item,field) {
  const state=archiveFieldState(item,field);
  if(state!=='not_filled'||Object.hasOwn(item.field_states??{},field))return state;
  if(field==='scheduled_at'&&item.publication_status!=='scheduled')return 'not_applicable';
  if(field==='deleted_at'&&item.publication_status!=='deleted')return 'not_applicable';
  if(['published_at','published_title','published_body'].includes(field)&&!archiveWasPublished(item))return 'not_applicable';
  return state;
}

export function archiveCompleteness(items) {
  const visible=items.filter(item=>!item.merged_into);
  const fields=completenessFields.map(field=>{
    const missing=[];
    const states={not_filled:0,none:0,unverified:0,not_applicable:0};
    for(const item of visible) {
      const state=statusForField(item,field);
      if(state==='present')continue;
      states[state]++;
      if(state!=='not_applicable')missing.push({id:item.id,title:archiveTitle(item),state});
    }
    return {field,states,missing:missing.length,items:missing};
  });
  return archiveJson({total:visible.length,fields,unsupported:['image_binary_storage','automatic_platform_collection']});
}
