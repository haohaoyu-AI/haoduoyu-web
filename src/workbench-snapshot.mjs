import {fail} from './security.mjs';
import {consistentRead} from './storage.mjs';
import {snapshotDate} from './business-snapshot.mjs';
import {snapshotAccess} from './snapshot-access.mjs';
import {snapshotBudget,snapshotDatabase} from './snapshot-budget.mjs';
import {memosOwner} from './memos-validation.mjs';
import {labelsFor} from './note-entries.mjs';
import {workbenchWindow,cachedWorkbenchWindow,consistentWindowRead,windowLimitResponse} from './workbench-snapshot-window.mjs';

const format='haoduoyu-workbench-snapshot-v1',timezone='Asia/Shanghai';
const invalid=()=>fail(503,'SNAPSHOT_DATA','工作台数据无法完整投影，未返回部分内容');
const compare=(a,b)=>a.entity_id<b.entity_id?-1:a.entity_id>b.entity_id?1:0;
const collections=['todos','life_notes','work_notes','work_reminders','memo_groups','memos'];
const v2Collections=[...collections,'unscheduled_todos','note_labels'];

function day(value) {
  try {return snapshotDate(value);}catch {invalid();}
}
function stamp(value,{nullable=false}={}) {
  if(value===null&&nullable)return null;
  const parts=typeof value==='string'&&/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if(!parts||Number(parts[2])>23||Number(parts[3])>59||Number(parts[4])>59||!Number.isFinite(Date.parse(value))||
    parts[5]!=='Z'&&(Number(parts[5].slice(1,3))>23||Number(parts[5].slice(4))>59))invalid();
  day(value.slice(0,10));
  return value;
}
function latest(a,b) {return b!==null&&Date.parse(b)>Date.parse(a)?b:a;}

// IDs are stable within a scope. In particular, legacy date records and new
// independently identified note entries never overwrite or deduplicate each
// other. Source record timestamps are preserved; no event time is invented.
function record(row,{prefix,type,source,category=null,date=row.date??null,deletedAt=row.deleted_at,
  updatedAt=row.updated_at,content={}},budget) {
  const sourceId=row.id??row.date;
  if(typeof sourceId!=='string'||!sourceId||!Number.isSafeInteger(row.version)||row.version<1)invalid();
  if(row.change_seq!==undefined&&(!Number.isSafeInteger(row.change_seq)||row.change_seq<0))invalid();
  const value={entity_id:prefix+':'+sourceId,entity_type:type,source,source_id:sourceId,
    date:date===null?null:day(date),...(category?{category}:{}),version:row.version,
    ...(row.change_seq===undefined?{}:{change_seq:row.change_seq}),
    created_at:stamp(row.created_at,{nullable:true}),updated_at:stamp(updatedAt),
    deleted_at:stamp(deletedAt,{nullable:true})};
  if(value.deleted_at===null)Object.assign(value,content);
  value.content_hash=budget.hash(value);
  return value;
}

// Pure callers retain the full historical projection by default. Network
// windows restrict dated sources in SQL, while globals remain complete.
// A budget failure is an error, never a silently truncated projection.
export async function readWorkbenchSnapshotData(store,{ownerId,notesOwnerId,memosOwnerId},budget,{version=1,coverage=null}={}) {
  async function all(sql,args,order='id') {
    if(coverage) {
      // A window is one bounded materialization, not OFFSET scans of its prefix.
      const rows=await store.all(sql+' ORDER BY '+order+' LIMIT ?',...args,budget.limits.maxRows-budget.used.rows+1);
      budget.addRows(rows);return rows;
    }
    const rows=[];
    for(let offset=0;;offset+=200) {
      const page=await store.all(sql+' ORDER BY '+order+' LIMIT 200 OFFSET ?',...args,offset);
      budget.addRows(page);rows.push(...page);
      if(page.length<200)return rows;
    }
  }
  const range=coverage?' AND date BETWEEN ? AND ?':'',args=owner=>coverage?[owner,coverage.from,coverage.to]:[owner];
  const dated='date,text,version,change_seq,created_at,updated_at,deleted_at';
  const todos=await all('SELECT id,date,text,completed,version,created_at,updated_at,deleted_at,note FROM matrix_todos WHERE user_id=?'+range,args(ownerId),coverage?'date,created_at':'id');
  const life=await all('SELECT '+dated+' FROM matrix_daily_notes WHERE user_id=?'+range,args(notesOwnerId),'date');
  const work=await all('SELECT '+dated+' FROM matrix_daily_work_notes WHERE user_id=?'+range,args(notesOwnerId),'date');
  // The existing entry index begins user/category/date. Both explicit categories
  // keep the date predicate usable without a schema or index migration.
  const entries=await all('SELECT id,category,'+dated+' FROM matrix_note_entries WHERE user_id=?'+
    (coverage?" AND category IN ('life','work')":'')+range,args(notesOwnerId),coverage?'category,date,created_at,id':'id');
  const reminders=await all('SELECT id,date,source_key,summary,version,change_seq,created_at,updated_at,deleted_at FROM matrix_work_reminders WHERE user_id=?'+range,args(notesOwnerId),coverage?'date,source_key':'id');
  const memoFields='id,title,position,version,change_seq,created_at,updated_at,deleted_at';
  const groups=await all('SELECT '+memoFields+' FROM matrix_memo_groups WHERE user_id=?',[memosOwnerId]);
  const memos=await all('SELECT '+memoFields+',group_id,body FROM matrix_memo_notes WHERE user_id=?',[memosOwnerId]);
  const undated=version===2?await all('SELECT id,text,completed,version,created_at,updated_at,deleted_at FROM matrix_unscheduled_todos WHERE user_id=?',[ownerId]):[];
  const labels=version===2?await all('SELECT name,created_at FROM matrix_note_labels WHERE user_id=?',[notesOwnerId],'name'):[];
  const labelStore=coverage?{all:async(sql,...args)=>{const rows=await store.all(sql,...args);budget.addRows(rows);return rows;}}:store;
  const entryLabels=version===2?await labelsFor(labelStore,notesOwnerId,entries):new Map();
  const data=Object.fromEntries((version===2?v2Collections:collections).map(key=>[key,[]]));
  for(const row of todos) {
    if(row.completed!==0&&row.completed!==1||typeof row.text!=='string')invalid();
    data.todos.push(record(row,{prefix:'todo',type:'todo',source:'todo',content:{text:row.text,completed:row.completed,...(row.note?{note:row.note}:{})}},budget));
  }
  for(const [category,rows]of [['life',life],['work',work]])for(const row of rows) {
    if(typeof row.text!=='string')invalid();
    data[category+'_notes'].push(record(row,{prefix:'legacy-'+category,type:category+'_note',source:'legacy_daily_note',
      category,content:{text:row.text}},budget));
  }
  for(const row of entries) {
    if(!['life','work'].includes(row.category)||typeof row.text!=='string')invalid();
    const labels=entryLabels.get(row.id);
    if(labels!==undefined&&row.category!=='life')invalid();
    entryLabels.delete(row.id);
    data[row.category+'_notes'].push(record(row,{prefix:'note-entry',type:row.category+'_note',source:'note_entry',
      category:row.category,content:{text:row.text,...(labels===undefined?{}:{label:labels[0]})}},budget));
  }
  if(entryLabels.size)invalid();
  for(const row of undated) {
    if(row.completed!==0&&row.completed!==1||typeof row.text!=='string')invalid();
    data.unscheduled_todos.push(record(row,{prefix:'unscheduled_todo',type:'unscheduled_todo',source:'unscheduled_todo',date:null,
      content:{text:row.text,completed:row.completed}},budget));
  }
  for(const row of labels) {
    if(typeof row.name!=='string'||!row.name.isWellFormed()||!row.name||[...row.name].length>32||
      /[\u0000-\u001f\u007f]/.test(row.name)||['生活','工作'].includes(row.name)||
      row.name!==row.name.trim().normalize('NFC'))invalid();
    data.note_labels.push(record({id:encodeURIComponent(row.name),version:1,created_at:row.created_at,updated_at:row.created_at,deleted_at:null},
      {prefix:'note-label',type:'note_label',source:'note_label',date:null,content:{name:row.name}},budget));
  }
  for(const row of reminders) {
    if(typeof row.summary!=='string'||typeof row.source_key!=='string')invalid();
    data.work_reminders.push(record(row,{prefix:'work-reminder',type:'work_reminder',source:'work_reminder',
      content:{summary:row.summary,source_key:row.source_key}},budget));
  }
  const parents=new Map(groups.map(row=>[row.id,row]));
  for(const row of groups) {
    if(typeof row.title!=='string'||!Number.isSafeInteger(row.position))invalid();
    data.memo_groups.push(record(row,{prefix:'memo-group',type:'memo_group',source:'memo_group',date:null,
      content:{title:row.title,position:row.position}},budget));
  }
  for(const row of memos) {
    const parent=parents.get(row.group_id);
    if(!parent||typeof row.title!=='string'||typeof row.body!=='string'||!Number.isSafeInteger(row.position))invalid();
    stamp(parent.deleted_at,{nullable:true});stamp(row.updated_at);
    const value=record(row,{prefix:'memo-note',type:'memo_note',source:'memo_note',date:null,
      deletedAt:row.deleted_at??parent.deleted_at,updatedAt:latest(row.updated_at,parent.deleted_at),
      content:{title:row.title,body:row.body,position:row.position,group_id:row.group_id}},budget);
    // Parent identity survives the effective tombstone without disclosing the
    // deleted note body. Restoring a group restores its active note projection.
    if(value.deleted_at!==null) {
      value.group_id=row.group_id;
      value.content_hash=budget.hash(Object.fromEntries(Object.entries(value).filter(([key])=>key!=='content_hash')));
    }
    data.memos.push(value);
  }
  for(const rows of Object.values(data))rows.sort(compare);
  return data;
}

export function projectWorkbenchSnapshot(data,{scope_id,generated_at,date=null,version=1},budget) {
  const selected=version===2?v2Collections:collections,snapshotFormat=version===2?'haoduoyu-workbench-snapshot-v2':format;
  const all=selected.flatMap(name=>data[name]).sort(compare),ids=new Set();
  const entities=all.map(row=>{
    if(ids.has(row.entity_id))invalid();ids.add(row.entity_id);
    return {entity_id:row.entity_id,entity_type:row.entity_type,date:row.date,
      updated_at:row.updated_at,deleted_at:row.deleted_at,content_hash:row.content_hash};
  });
  const byDate=new Map(),global=[];
  for(const row of entities) {
    if(row.date===null)global.push(row);
    else {
      if(!byDate.has(row.date))byDate.set(row.date,[]);
      byDate.get(row.date).push(row);
    }
  }
  if(byDate.size>budget.limits.maxDates)fail(413,'SNAPSHOT_LIMIT','工作台日期超过完整读取预算，未返回部分内容');
  const global_content_hash=budget.hash({scope_id,entities:global});
  const manifest_hash=budget.hash({snapshot_format:snapshotFormat,scope_id,entities});
  const value={snapshot_format:snapshotFormat,projection:'current',complete:true,scope_id,timezone,generated_at,
    manifest_hash,global_content_hash,entities};
  if(date===null) {
    value.dates=[...byDate.keys()].sort().map(date=>({date,content_hash:budget.hash({scope_id,entities:byDate.get(date)})}));
    value.index_hash=manifest_hash;
  }else {
    day(date);value.date=date;
    value.date_content_hash=budget.hash({scope_id,entities:byDate.get(date)??[]});
    value.data=Object.fromEntries(selected.map(name=>[name,data[name].filter(row=>row.date===null||row.date===date)]));
    value.content_hash=budget.hash({snapshot_format:snapshotFormat,scope_id,date,timezone,data:value.data});
  }
  return value;
}

// Bounded workbench windows leave /snapshot v1/v2 and Notion unchanged.
// Existing snapshot auth supplies business/account scope. Notes and memos retain
// their explicit owners; every response has a fresh consistent identity proof.
export async function handleWorkbenchSnapshot(db,request,route,env,{limits={},now=Date.now}={}) {
  if(route==='/workbench-snapshot/scope')return workbenchScope(db,request,env,limits);
  if(!['/workbench-snapshot','/workbench-snapshot/index'].includes(route)||request.method!=='GET')
    fail(404,'NOT_FOUND','工作台快照只提供明确的只读接口');
  // Old bundles otherwise keep re-reading all history in the background. Retire
  // that network protocol before auth, revision checks or any other D1 access.
  if(route==='/workbench-snapshot/index'||!new URL(request.url).searchParams.has('window'))
    fail(426,'SNAPSHOT_UPGRADE_REQUIRED','离线同步已升级为最近60天，请更新页面；历史日期可按需读取');
  const coverage=workbenchWindow(new URL(request.url).searchParams,now());
  const access=snapshotAccess(request,env),memosOwnerId=memosOwner(env);
  // Retries share a budget and the per-scope cold-build allowance. Cache hits
  // still resolve access and pass both revision bookends on every request.
  const budget=snapshotBudget({maxQueries:135,...limits}),database=snapshotDatabase(db,budget);
  let text;
  try {text=await consistentWindowRead(database,async (store,revision)=>{
    const control=await store.get('SELECT initialized FROM matrix_control WHERE id=1');
    if(control?.initialized!==1)fail(503,'SETUP_REQUIRED','数据库尚未就绪，工作台快照未读取');
    const scope=await access.resolve(store);
    if(!await store.get('SELECT id FROM matrix_users WHERE id=?',memosOwnerId))
      fail(503,'SNAPSHOT_CONFIG','备忘录数据归属无法核实');
    // Scope is an identity boundary shared with durable queues and drafts;
    // upgrading projection formats must never move existing local data.
    const scope_id=budget.hash(['haoduoyu-workbench-scope-v1',scope.scope_id,memosOwnerId]);
    const serialized=await cachedWorkbenchWindow(db,{scope_id,version:2,coverage,revision},budget,now,async()=>{
      const data=await readWorkbenchSnapshotData(store,{...scope,memosOwnerId},budget,{version:2,coverage});
      const index=projectWorkbenchSnapshot(data,{scope_id,generated_at:new Date(now()).toISOString(),version:2},budget);
      return {text:budget.serialize({batch_format:'haoduoyu-workbench-window-v1',coverage,index,data}),dates:index.dates.length};
    });
    await access.recheck(store);
    return serialized;
  });}catch(error) {if(error.code==='SNAPSHOT_RATE_LIMIT')return windowLimitResponse(error);throw error;}
  return new Response(text,{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Cookie, Authorization'}});
}

// The client checks its offline scope before reads and writes. It needs only the scope identity, which the index
// derives from the same access rules; this answers that without reading or projecting any workbench data.
async function workbenchScope(db,request,env,limits) {
  if(request.method!=='GET')fail(404,'NOT_FOUND','工作台快照只提供明确的只读接口');
  if([...new URL(request.url).searchParams.keys()].length)fail(400,'VALIDATION_ERROR','身份范围接口不接受查询参数');
  const access=snapshotAccess(request,env),memosOwnerId=memosOwner(env);
  const budget=snapshotBudget({maxQueries:20,...limits}),database=snapshotDatabase(db,budget);
  const text=await consistentRead(database,async store=>{
    const control=await store.get('SELECT initialized FROM matrix_control WHERE id=1');
    if(control?.initialized!==1)fail(503,'SETUP_REQUIRED','数据库尚未就绪，工作台快照未读取');
    const scope=await access.resolve(store);
    if(!await store.get('SELECT id FROM matrix_users WHERE id=?',memosOwnerId))
      fail(503,'SNAPSHOT_CONFIG','备忘录数据归属无法核实');
    const scope_id=budget.hash(['haoduoyu-workbench-scope-v1',scope.scope_id,memosOwnerId]);
    await access.recheck(store);
    return budget.serialize({projection:'current',scope_id,complete:true,scope_only:true,generated_at:new Date().toISOString()});
  });
  return new Response(text,{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Cookie, Authorization'}});
}
