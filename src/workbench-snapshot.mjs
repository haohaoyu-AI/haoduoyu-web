import {fail} from './security.mjs';
import {consistentRead} from './storage.mjs';
import {snapshotDate} from './business-snapshot.mjs';
import {snapshotAccess} from './snapshot-access.mjs';
import {snapshotBudget,snapshotDatabase} from './snapshot-budget.mjs';
import {memosOwner} from './memos-validation.mjs';

const format='haoduoyu-workbench-snapshot-v1',timezone='Asia/Shanghai';
const invalid=()=>fail(503,'SNAPSHOT_DATA','工作台数据无法完整投影，未返回部分内容');
const compare=(a,b)=>a.entity_id<b.entity_id?-1:a.entity_id>b.entity_id?1:0;
const collections=['todos','life_notes','work_notes','work_reminders','memo_groups','memos'];

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

// Every source is loaded completely even for a selected date. This permits an
// identical full manifest on both endpoints, including old edits, date moves,
// and tombstones. A budget failure is an error, never a partial success.
export async function readWorkbenchSnapshotData(store,{ownerId,notesOwnerId,memosOwnerId},budget) {
  async function all(sql,args,order='id') {
    const rows=[];
    for(let offset=0;;offset+=200) {
      const page=await store.all(sql+' ORDER BY '+order+' LIMIT 200 OFFSET ?',...args,offset);
      budget.addRows(page);rows.push(...page);
      if(page.length<200)return rows;
    }
  }
  const dated='date,text,version,change_seq,created_at,updated_at,deleted_at';
  const todos=await all('SELECT id,date,text,completed,version,created_at,updated_at,deleted_at FROM matrix_todos WHERE user_id=?',[ownerId]);
  const life=await all('SELECT '+dated+' FROM matrix_daily_notes WHERE user_id=?',[notesOwnerId],'date');
  const work=await all('SELECT '+dated+' FROM matrix_daily_work_notes WHERE user_id=?',[notesOwnerId],'date');
  const entries=await all('SELECT id,category,'+dated+' FROM matrix_note_entries WHERE user_id=?',[notesOwnerId]);
  const reminders=await all('SELECT id,date,source_key,summary,version,change_seq,created_at,updated_at,deleted_at FROM matrix_work_reminders WHERE user_id=?',[notesOwnerId]);
  const memoFields='id,title,position,version,change_seq,created_at,updated_at,deleted_at';
  const groups=await all('SELECT '+memoFields+' FROM matrix_memo_groups WHERE user_id=?',[memosOwnerId]);
  const memos=await all('SELECT '+memoFields+',group_id,body FROM matrix_memo_notes WHERE user_id=?',[memosOwnerId]);
  const data=Object.fromEntries(collections.map(key=>[key,[]]));
  for(const row of todos) {
    if(row.completed!==0&&row.completed!==1||typeof row.text!=='string')invalid();
    data.todos.push(record(row,{prefix:'todo',type:'todo',source:'todo',content:{text:row.text,completed:row.completed}},budget));
  }
  for(const [category,rows]of [['life',life],['work',work]])for(const row of rows) {
    if(typeof row.text!=='string')invalid();
    data[category+'_notes'].push(record(row,{prefix:'legacy-'+category,type:category+'_note',source:'legacy_daily_note',
      category,content:{text:row.text}},budget));
  }
  for(const row of entries) {
    if(!['life','work'].includes(row.category)||typeof row.text!=='string')invalid();
    data[row.category+'_notes'].push(record(row,{prefix:'note-entry',type:row.category+'_note',source:'note_entry',
      category:row.category,content:{text:row.text}},budget));
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

export function projectWorkbenchSnapshot(data,{scope_id,generated_at,date=null},budget) {
  const all=collections.flatMap(name=>data[name]).sort(compare),ids=new Set();
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
  const manifest_hash=budget.hash({snapshot_format:format,scope_id,entities});
  const value={snapshot_format:format,projection:'current',complete:true,scope_id,timezone,generated_at,
    manifest_hash,global_content_hash,entities};
  if(date===null) {
    value.dates=[...byDate.keys()].sort().map(date=>({date,content_hash:budget.hash({scope_id,entities:byDate.get(date)})}));
    value.index_hash=manifest_hash;
  }else {
    day(date);value.date=date;
    value.date_content_hash=budget.hash({scope_id,entities:byDate.get(date)??[]});
    value.data=Object.fromEntries(collections.map(name=>[name,data[name].filter(row=>row.date===null||row.date===date)]));
    value.content_hash=budget.hash({snapshot_format:format,scope_id,date,timezone,data:value.data});
  }
  return value;
}

// Additive opt-in API: this never changes /snapshot v1/v2 or sends to Notion.
// Existing snapshot auth supplies business/account scope. Notes and memos retain
// their own explicit owners, and all owner checks share the consistent read.
export async function handleWorkbenchSnapshot(db,request,route,env,{limits={}}={}) {
  if(!['/workbench-snapshot','/workbench-snapshot/index'].includes(route)||request.method!=='GET')
    fail(404,'NOT_FOUND','工作台快照只提供明确的只读接口');
  const query=new URL(request.url).searchParams,index=route==='/workbench-snapshot/index';
  if(index?[...query].length!==0:query.size!==1||query.getAll('date').length!==1)
    fail(400,'VALIDATION_ERROR','工作台快照只接受一个明确日期，完整索引不接受查询参数');
  const date=index?null:snapshotDate(query.get('date'));
  const access=snapshotAccess(request,env),memosOwnerId=memosOwner(env);
  const budget=snapshotBudget(limits),database=snapshotDatabase(db,budget),generated_at=new Date().toISOString();
  const text=await consistentRead(database,async store=>{
    const control=await store.get('SELECT initialized FROM matrix_control WHERE id=1');
    if(control?.initialized!==1)fail(503,'SETUP_REQUIRED','数据库尚未就绪，工作台快照未读取');
    const scope=await access.resolve(store);
    if(!await store.get('SELECT id FROM matrix_users WHERE id=?',memosOwnerId))
      fail(503,'SNAPSHOT_CONFIG','备忘录数据归属无法核实');
    const scope_id=budget.hash(['haoduoyu-workbench-scope-v1',scope.scope_id,memosOwnerId]);
    const data=await readWorkbenchSnapshotData(store,{...scope,memosOwnerId},budget);
    const value=projectWorkbenchSnapshot(data,{scope_id,generated_at,date},budget);
    const serialized=budget.serialize(value);
    await access.recheck(store);
    return serialized;
  });
  return new Response(text,{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Cookie, Authorization'}});
}
