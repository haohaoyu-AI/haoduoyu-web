import {fail} from './lib/errors.mjs';
import {snapshotDate} from './business-snapshot.mjs';
import {beijingDate,shiftDay} from './lib/time.mjs';
import {ARTICLE_PIPELINE_FIELDS,validateArticlePipelineFields} from './article-pipeline-fields.mjs';
import {decodePipelineArticle} from './article-pipeline-io.mjs';

const timezone='Asia/Shanghai',pageSize=200;
const dataError=()=>fail(503,'SNAPSHOT_DATA','业务数据无法完整投影，未返回不完整快照');
const limitError=()=>fail(413,'SNAPSHOT_LIMIT','快照超过完整读取预算，未返回不完整内容');
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const articleColumns=['id','account_id','title','url','platform_article_id','published_at','started_at',
  'production_mode','summary','notes','version','created_at','updated_at',...ARTICLE_PIPELINE_FIELDS];

function businessDate(value) {
  try{return snapshotDate(value);}catch{dataError();}
}
function timestampDate(value) {
  if(typeof value!=='string')dataError();
  const parts=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if(!parts||Number(parts[2])>23||Number(parts[3])>59||Number(parts[4]||0)>59)dataError();
  businessDate(parts[1]);
  if(parts[5]!=='Z'&&(Number(parts[5].slice(1,3))>23||Number(parts[5].slice(4))>59))dataError();
  return businessDate(beijingDate(value));
}

// Only entity collections are sorted. Nested business arrays retain their order.
// Bound decoded JSON before recursive canonicalization, including numbers JSON
// accepts as Infinity but JSON.stringify would silently replace with null.
function canonical(value) {
  let nodes=0;
  function visit(entry,depth) {
    if(++nodes>65536||depth>64)dataError();
    if(entry===null||typeof entry==='string'||typeof entry==='boolean')return entry;
    if(typeof entry==='number') {if(!Number.isFinite(entry))dataError();return entry;}
    if(Array.isArray(entry))return entry.map(item=>visit(item,depth+1));
    if(!object(entry))dataError();
    return Object.fromEntries(Object.keys(entry).sort().map(key=>[key,visit(entry[key],depth+1)]));
  }
  return visit(value,0);
}
function entities(rows) {
  return rows.map(row=>{const value=canonical(row);return {value,key:JSON.stringify(value)};})
    .sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0).map(row=>row.value);
}
function decodeMetrics({metrics_json,...row}) {
  let metrics;try{metrics=JSON.parse(metrics_json);}catch{dataError();}
  if(typeof metrics_json!=='string'||!object(metrics))dataError();
  return canonical({...row,metrics});
}
function decodeArticle(row) {
  try {validateArticlePipelineFields(row);return canonical(decodePipelineArticle(row));}
  catch{dataError();}
}

// Strip fractional seconds before SQLite's date conversion: date membership
// never depends on subsecond precision. A NULL SQLite result is also fetched,
// so supported ISO offsets outside SQLite's parser range can be grouped by JS,
// and malformed timestamps cannot be silently discarded by that SQL filter.
function sqlDay(column) {
  return `date(CASE WHEN instr(${column},'.')>0 THEN substr(${column},1,instr(${column},'.')-1)||CASE WHEN substr(${column},-1)='Z' THEN 'Z' ELSE substr(${column},-6) END ELSE ${column} END,'+8 hours')`;
}
function sqlOnDay(column) {const day=sqlDay(column);return `(${day}=? OR ${day} IS NULL)`;}

// The caller owns ONE consistentRead around authentication, scope resolution,
// these reads, projection and hashing. It also budgets every store SQL call.
export async function readSnapshotData(store,{ownerId,accountIds,notesOwnerId},budget,{date=null}={}) {
  if(date!==null)snapshotDate(date);
  const scope=JSON.stringify(accountIds),inScope=' IN (SELECT value FROM json_each(?))';
  async function all(sql,args=[],order='id') {
    const result=[];
    for(let offset=0;;offset+=pageSize) {
      const page=await store.all(sql+' ORDER BY '+order+' LIMIT 200 OFFSET ?',...args,offset);
      budget.addRows(page);result.push(...page);
      if(page.length<pageSize)return result;
    }
  }
  const windowStart=date===null?null:shiftDay(date,-29);
  const todos=await all('SELECT id,date,text,completed,version,created_at,updated_at FROM matrix_todos WHERE user_id=? AND deleted_at IS NULL'+
    (date===null?'':' AND date>=? AND date<=?'),date===null?[ownerId]:[ownerId,windowStart,date]);
  const templates=await all('SELECT id,text,version,created_at,updated_at FROM matrix_todo_templates WHERE user_id=? AND deleted_at IS NULL',[ownerId]);
  const links=await all('SELECT l.todo_id,l.template_id FROM matrix_todo_template_links l JOIN matrix_todos d ON d.user_id=l.user_id AND d.id=l.todo_id JOIN matrix_todo_templates t ON t.user_id=l.user_id AND t.id=l.template_id WHERE l.user_id=? AND d.deleted_at IS NULL AND t.deleted_at IS NULL'+
    (date===null?'':' AND d.date>=? AND d.date<=?'),date===null?[ownerId]:[ownerId,windowStart,date],'l.todo_id');
  const notes=await all('SELECT date,text,version,created_at,updated_at FROM matrix_daily_notes WHERE user_id=? AND deleted_at IS NULL'+
    (date===null?'':' AND date=?'),date===null?[notesOwnerId]:[notesOwnerId,date],'date');
  const accounts=await all('SELECT id,platform,name,active,created_at FROM matrix_accounts WHERE id'+inScope,[scope]);
  if(accounts.length!==accountIds.length||new Set(accounts.map(row=>row.id)).size!==accountIds.length)dataError();
  const observations=(await all('SELECT o.id,o.article_id,o.as_of,o.collected_at,o.kind,o.metrics_json,o.source,o.note,o.created_at FROM matrix_observations o JOIN matrix_articles a ON a.id=o.article_id WHERE a.account_id'+inScope+
    (date===null?'':' AND '+sqlOnDay('o.as_of')),date===null?[scope]:[scope,date],'o.id')).map(decodeMetrics);
  const daily_metrics=(await all('SELECT id,account_id,article_id,date,metrics_json,source,updated_at FROM matrix_daily_metrics WHERE account_id'+inScope+
    (date===null?'':' AND date=?'),date===null?[scope]:[scope,date])).map(decodeMetrics);
  const articleFilter=date===null?'':` AND (a.run_date=? OR (a.published_at IS NOT NULL AND ${sqlOnDay('a.published_at')}) OR EXISTS(SELECT 1 FROM matrix_observations o WHERE o.article_id=a.id AND ${sqlOnDay('o.as_of')}) OR EXISTS(SELECT 1 FROM matrix_daily_metrics d WHERE d.article_id=a.id AND d.account_id${inScope} AND d.date=?))`;
  const articles=(await all('SELECT '+articleColumns.map(column=>'a.'+column).join(',')+' FROM matrix_articles a WHERE a.account_id'+inScope+articleFilter,
    date===null?[scope]:[scope,date,date,date,scope,date],'a.id')).map(decodeArticle);
  return groupData({todos,templates,links,notes,accounts,articles,observations,daily_metrics},date,budget);
}

function groupData(data,loadedDate,budget) {
  const byDate=new Map(),articlesById=new Map(data.articles.map(row=>[row.id,row]));
  const templates=entities(data.templates),templateById=new Map(templates.map(row=>[row.id,row]));
  const links=new Map(data.links.map(row=>[row.todo_id,row.template_id])),completionSets=new Map();
  const bucket=date=>{
    businessDate(date);
    if(!byDate.has(date)) {
      if(loadedDate===null&&byDate.size>=(budget.limits?.maxDates??budget.maxDates??1000))limitError();
      byDate.set(date,{todos:[],notes:[],articleIds:new Set(),observations:[],daily_metrics:[]});
    }
    return byDate.get(date);
  };
  for(const row of data.todos) {
    if(row.completed!==0&&row.completed!==1)dataError();
    const templateId=links.get(row.id),template=templateById.get(templateId);
    if(templateId!==undefined&&!template)dataError();
    bucket(row.date).todos.push({...row,...(template?{template_id:template.id,template_version:template.version,template_active:true}:{})});
    if(template&&row.completed===1) {
      if(!completionSets.has(template.id))completionSets.set(template.id,new Set());
      completionSets.get(template.id).add(row.date);
    }
  }
  for(const row of data.notes)bucket(row.date).notes.push(row);
  for(const row of data.articles) {
    if(row.run_date!==null)bucket(row.run_date).articleIds.add(row.id);
    if(row.published_at!==null)bucket(timestampDate(row.published_at)).articleIds.add(row.id);
  }
  for(const row of data.observations) {
    if(!articlesById.has(row.article_id))dataError();
    const day=bucket(timestampDate(row.as_of));day.observations.push(row);day.articleIds.add(row.article_id);
  }
  for(const row of data.daily_metrics) {
    const day=bucket(row.date);day.daily_metrics.push(row);
    if(row.article_id!==null) {
      const article=articlesById.get(row.article_id);
      if(!article||article.account_id!==row.account_id)dataError();
      day.articleIds.add(row.article_id);
    }
  }
  for(const day of byDate.values()) {
    for(const name of ['todos','notes','observations','daily_metrics'])day[name]=entities(day[name]);
    // Reuse each already-decoded article across its dates. Re-canonicalizing it
    // per reference could amplify a large article before the hash budget runs.
    day.articles=[...day.articleIds].sort().map(id=>articlesById.get(id));delete day.articleIds;
  }
  return {loadedDate,byDate,templates,accounts:entities(data.accounts),
    completionDays:new Map([...completionSets].map(([id,days])=>[id,[...days].sort()]))};
}
function lowerBound(values,date,inclusive=false) {
  let from=0,to=values.length;
  while(from<to) {const mid=Math.floor((from+to)/2);if(values[mid]<date||inclusive&&values[mid]===date)from=mid+1;else to=mid;}
  return from;
}
function habit30days(data,date) {
  const window_start=shiftDay(date,-29);
  return {window_start,window_end:date,threshold:21,templates:entities(data.templates.map(template=>{
    const dates=data.completionDays.get(template.id)||[],completed_days=lowerBound(dates,date,true)-lowerBound(dates,window_start);
    return {template_id:template.id,completed_days,habit_status:completed_days>=21?'habit':'todo'};
  }))};
}

export function snapshotForDate(data,date,{scope_id,generated_at},budget) {
  snapshotDate(date);
  if(data.loadedDate!==null&&data.loadedDate!==date)dataError();
  const day=data.byDate.get(date)||{todos:[],notes:[],articles:[],observations:[],daily_metrics:[]};
  const snapshot={snapshot_format:'haoduoyu-daily-snapshot-v1',projection:'current',date,scope_id,timezone,
    data:{todos:day.todos,templates:data.templates,notes:day.notes,accounts:data.accounts,articles:day.articles,
      observations:day.observations,daily_metrics:day.daily_metrics,habit30days:habit30days(data,date)}};
  const content_hash=budget.hash(snapshot);
  return {...snapshot,generated_at,content_hash};
}

export function snapshotIndex(data,{scope_id,generated_at},budget) {
  if(data.loadedDate!==null)dataError();
  const dates=[...data.byDate.keys()].sort();
  if(dates.length>(budget.limits?.maxDates??budget.maxDates??1000))limitError();
  const snapshot={snapshot_format:'haoduoyu-daily-snapshot-index-v1',projection:'current',scope_id,timezone,complete:true,
    dates:dates.map(date=>({date,content_hash:snapshotForDate(data,date,{scope_id,generated_at},budget).content_hash}))};
  const index_hash=budget.hash(snapshot);
  return {...snapshot,generated_at,index_hash};
}
