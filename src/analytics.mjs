import { fail } from './lib/errors.mjs';
// Derived views only: never write inferred topics, dates or metrics to records.
export const METRIC_KEYS = ['reads','impressions','likes','comments','favorites','shares','approvals','reading_users'];
export const METRIC_NOTE = '各平台阅读为平台原字段相加，口径可能不同；likes 保留为点赞（知乎口径待核实），approvals 单独为赞同，互不替代。累计值为各篇最近快照之和，截至时间可能不同。';
export const validStamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export const beijingDate = value => validStamp(value) ? new Date(Date.parse(value)+8*3600000).toISOString().slice(0,10) : null;
export const known = value => typeof value === 'number' && Number.isFinite(value);
export const newestFirst = (a,b) => (Date.parse(b.as_of)||0)-(Date.parse(a.as_of)||0) || (Date.parse(b.collected_at)||0)-(Date.parse(a.collected_at)||0) || String(b.id).localeCompare(String(a.id));
const latestStamp = values => values.filter(validStamp).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1) ?? null;
const firstStamp = values => values.filter(validStamp).sort((a,b)=>Date.parse(a)-Date.parse(b))[0] ?? null;
export function articleFacts(article) {
  const accountName = article.account_name ?? '';
  const topic = article.platform === 'wechat' && (accountName === '小鱼儿真保鲜' || article.account_id === 'wechat-xiaoyuer') ? 'insurance'
    : ['toutiao','zhihu'].includes(article.platform) && (accountName === '好多鱼' || ['toutiao-haoduoyu','zhihu-haoduoyu'].includes(article.account_id)) ? 'entertainment' : 'unknown';
  const pending = !validStamp(article.published_at) || /(?:日期|发布日期|发布时间|发布日|时间)待(?:核实|确认)|\[date-unverified\]/i.test(article.notes ?? '');
  return { ...article, topic, topic_source: topic === 'unknown' ? 'unknown' : 'inferred', date_status: pending ? 'unverified' : 'recorded',
    snapshot_status: article.latest_metrics == null ? 'not_collected' : 'collected',
    missing_metrics: METRIC_KEYS.filter(key => !known(article.latest_metrics?.[key])) };
}
export function summarizeArticles(rows) {
  const observed = rows.filter(a=>a.latest_metrics != null), readRows = rows.filter(a=>known(a.latest_metrics?.reads));
  const values = readRows.map(a=>a.latest_metrics.reads).sort((a,b)=>a-b), middle = Math.floor(values.length/2);
  const totals = {}, metricCoverage = {};
  for (const key of METRIC_KEYS) {
    const vals = rows.map(a=>a.latest_metrics?.[key]).filter(known);
    const total = vals.reduce((sum,n)=>sum+n,0);
    if (!Number.isSafeInteger(total)) throw Object.assign(new Error('指标汇总超出安全整数范围'),{status:422,code:'METRIC_OVERFLOW'});
    totals[key] = vals.length ? total : null;
    metricCoverage[key] = { recorded: vals.length, missing: rows.length-vals.length };
  }
  return { article_count:rows.length, snapshot_count:observed.length, data_article_count:readRows.length,
    no_snapshot_count:rows.length-observed.length, missing_reads_count:rows.length-readRows.length,
    coverage:rows.length ? readRows.length/rows.length : null, totals, metric_coverage:metricCoverage,
    mean_reads:values.length ? totals.reads/values.length : null,
    median_reads:values.length ? values.length%2 ? values[middle] : (values[middle-1]+values[middle])/2 : null,
    as_of:latestStamp(observed.map(a=>a.latest_as_of)), earliest_as_of:firstStamp(observed.map(a=>a.latest_as_of)),
    collected_at:latestStamp(observed.map(a=>a.latest_collected_at)),
    unverified_date_count:rows.filter(a=>a.date_status==='unverified').length,
    best_article:[...readRows].sort((a,b)=>b.latest_metrics.reads-a.latest_metrics.reads || String(b.published_at).localeCompare(String(a.published_at)) || a.id.localeCompare(b.id))[0] ?? null };
}
export function cumulativeOverview(articles, {topN=5,topPlatform='',now=Date.now(),accounts=[]}={}) {
  const rows=articles.map(articleFacts), summary=summarizeArticles(rows);
  const platformRows=[...new Set([...accounts.map(a=>a.platform),...rows.map(a=>a.platform)])].map(platform=>({platform,...summarizeArticles(rows.filter(a=>a.platform===platform))}));
  const top=rows.filter(a=>(!topPlatform || a.platform===topPlatform)&&known(a.latest_metrics?.reads))
    .sort((a,b)=>b.latest_metrics.reads-a.latest_metrics.reads || String(b.published_at).localeCompare(String(a.published_at)) || a.id.localeCompare(b.id)).slice(0,topN);
  const seriesRows=rows.filter(a=>a.platform==='wechat' && a.topic==='insurance' && a.date_status==='recorded' && Date.parse(a.published_at)<=now)
    .map(a=>({article:a,number:Number(/^【保险200篇·第(\d+)篇】/.exec(a.title)?.[1])})).filter(a=>a.number>=1&&a.number<=200);
  return {cumulative:{...summary,metric_note:METRIC_NOTE},platform_comparison:platformRows,top_articles:top,
    top:{limit:topN,platform:topPlatform||null},series:{name:'保险200篇',planned:200,highest_recorded:seriesRows.length?Math.max(...seriesRows.map(a=>a.number)):null,
      recorded_count:seriesRows.length,numbers:[...new Set(seriesRows.map(a=>a.number))].sort((a,b)=>a-b)},
    missing_articles:rows.filter(a=>a.snapshot_status==='not_collected'||['reads','likes','comments'].some(key=>!known(a.latest_metrics?.[key]))||a.date_status==='unverified')};
}
export function snapshotTimeline(observations,publishedAt,now=Date.now()) {
  const rows=[...observations].sort((a,b)=>-newestFirst(a,b));
  const timeline=rows.map((row,i)=>{
    const prev=rows[i-1];
    return {...row,previous_id:prev?.id??null,changes:prev?Object.fromEntries(METRIC_KEYS.map(key=>{
      const current=row.metrics?.[key],previous=prev.metrics?.[key];
      let reason=!known(current)||!known(previous)?'指标未取得':!validStamp(row.as_of)||!validStamp(prev.as_of)||Date.parse(row.as_of)<=Date.parse(prev.as_of)?'截至时间未形成先后两期':null;
      return [key,{delta:reason?null:current-previous,percent:reason||previous===0?null:(current-previous)/previous*100,
        comparable:!reason,reason:reason||(previous===0?'前期为真实零，增幅无定义':'相邻快照差值，非每日新增')}];
    })):null};
  });
  const nodes=['d1','d3','d7','latest'].map(kind=>{
    const snapshot=[...observations].filter(o=>o.kind===kind).sort(newestFirst)[0]??null;
    const due=kind==='latest'||!validStamp(publishedAt)?null:new Date(Date.parse(publishedAt)+Number(kind.slice(1))*86400000).toISOString();
    return {kind,snapshot,due_at:due,status:snapshot?due&&Date.parse(snapshot.as_of)<Date.parse(due)?'before_due':'recorded':due&&Date.parse(due)>now?'not_due':'not_collected'};
  });
  return {nodes,timeline};
}
// Opt-in pagination preserves the legacy {data: Article[]} response. Metadata is
// additive at envelope.meta; internal aggregates always use the unpaged rows.
export function paginate(rows,query={},unfilteredTotal=rows.length) {
  const get=key=>query instanceof URLSearchParams?query.get(key):query[key];
  const pageMode=get('page')!=null||get('page_size')!=null, offsetMode=get('limit')!=null||get('offset')!=null;
  const integer=(v,fallback,max)=>{if(v==null)return fallback;if(!/^\d+$/.test(String(v))||!Number.isSafeInteger(Number(v))||Number(v)>max)fail(400,'VALIDATION_ERROR','分页参数须为范围内的非负整数');return Number(v);};
  if(pageMode&&offsetMode)fail(400,'VALIDATION_ERROR','page/page_size 与 limit/offset 不能混用');
  const size=integer(pageMode?get('page_size'):get('limit'),pageMode||offsetMode?20:rows.length||20,200);
  const page=integer(get('page'),1,Number.MAX_SAFE_INTEGER);
  const offset=pageMode?(page-1)*size:integer(get('offset'),0,Number.MAX_SAFE_INTEGER);
  if(!size||!page||!Number.isSafeInteger(offset))fail(400,'VALIDATION_ERROR','页码与每页数量须大于零，偏移须为安全整数');
  const paged=pageMode||offsetMode;
  return {data:paged?rows.slice(offset,offset+size):rows,
    meta:{total:rows.length,unfiltered_total:unfilteredTotal,page:paged?Math.floor(offset/size)+1:1,page_size:paged?size:null,offset:paged?offset:0,
      has_more:paged&&offset+size<rows.length,pagination:paged?'offset':'legacy'}};
}
