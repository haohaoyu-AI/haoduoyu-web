import {entityKey} from './db.mjs';

const FORMAT='haoduoyu-workbench-snapshot-v1';
const collections=['todos','life_notes','work_notes','work_reminders','memo_groups','memos'];
const types=new Set(['todo','life_note','work_note','work_reminder','memo_group','memo_note']);
const recordKeys=new Set(['entity_id','entity_type','source','source_id','date','category','version','change_seq',
  'created_at','updated_at','deleted_at','content_hash','text','completed','summary','source_key','title','position','body','group_id']);
const hashPattern=/^[a-f0-9]{64}$/;
const datePattern=/^(?!0000)\d{4}-\d{2}-\d{2}$/;
const supportedId=/^(?:todo|legacy-life|legacy-work|note-entry|work-reminder|memo-group|memo-note):/;
export const SNAPSHOT_PULL_LIMITS=Object.freeze({maxEntities:4000,maxDates:1000,maxResponseBytes:1048576,
  maxBatchBytes:8388608,maxHashBytes:8388608,maxRequests:128});
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const canonical=value=>JSON.stringify(stable(value));
const equal=(a,b)=>canonical(a)===canonical(b);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function fail(code,message,status) {throw Object.assign(new Error(message),{code,...(status?{status}:{})});}
function requireValue(condition,message='工作台快照内容不完整，未覆盖本地数据。') {
  if(!condition)fail('OFFLINE_SNAPSHOT_INVALID',message);
}
function day(value) {
  requireValue(typeof value==='string'&&datePattern.test(value));
  const parsed=new Date(value+'T00:00:00Z');
  requireValue(Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value);
  return value;
}
function stamp(value,nullable=false) {
  if(value===null&&nullable)return;
  const parts=typeof value==='string'&&/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  requireValue(parts&&Number(parts[2])<24&&Number(parts[3])<60&&Number(parts[4])<60&&Number.isFinite(Date.parse(value))&&
    (parts[5]==='Z'||Number(parts[5].slice(1,3))<24&&Number(parts[5].slice(4))<60));
  day(parts[1]);
}
function identity(scope,getScope) {
  if(getScope()!==scope)fail('OFFLINE_SCOPE_CHANGED','当前身份范围已变化，请重新核实；原本地内容已保留。');
}
function budget(limits,crypto) {
  let bytes=0,hashBytes=0,requests=0;
  const encoder=new TextEncoder();
  return {
    response(value) {
      let text;try{text=JSON.stringify(value);}catch{fail('OFFLINE_SNAPSHOT_INVALID','工作台快照无法解析。');}
      requireValue(typeof text==='string');const size=encoder.encode(text).byteLength;bytes+=size;
      if(size>limits.maxResponseBytes||bytes>limits.maxBatchBytes)fail('OFFLINE_SNAPSHOT_LIMIT','本次完整快照超过本机读取预算，未覆盖本地数据。',413);
    },
    request(){if(++requests>limits.maxRequests)fail('OFFLINE_SNAPSHOT_LIMIT','本次完整快照请求数超过预算，未覆盖本地数据。',413);},
    async hash(value) {
      const input=encoder.encode(canonical(value));hashBytes+=input.byteLength;
      if(hashBytes>limits.maxHashBytes)fail('OFFLINE_SNAPSHOT_LIMIT','本次完整快照哈希预算不足，未覆盖本地数据。',413);
      if(!crypto?.subtle)fail('OFFLINE_CRYPTO_UNAVAILABLE','无法核实快照哈希，未覆盖本地数据。');
      const digest=await crypto.subtle.digest('SHA-256',input);
      return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
    },
  };
}
function metadata(row) {
  return {entity_id:row.entity_id,entity_type:row.entity_type,date:row.date,
    updated_at:row.updated_at,deleted_at:row.deleted_at,content_hash:row.content_hash};
}
function envelope(value,scope,limits) {
  if(object(value)&&value.scope_id!==scope)fail('OFFLINE_SCOPE_CHANGED','快照身份范围与已核实范围不同，原本地内容已保留。');
  requireValue(object(value)&&value.snapshot_format===FORMAT&&value.projection==='current'&&value.complete===true&&
    value.scope_id===scope&&value.timezone==='Asia/Shanghai'&&hashPattern.test(value.manifest_hash)&&
    hashPattern.test(value.global_content_hash)&&Array.isArray(value.entities)&&value.entities.length<=limits.maxEntities);
  stamp(value.generated_at);
  const seen=new Set();let previous='';
  for(const row of value.entities) {
    requireValue(object(row)&&Object.keys(row).sort().join(',')==='content_hash,date,deleted_at,entity_id,entity_type,updated_at'&&
      typeof row.entity_id==='string'&&row.entity_id.length>0&&row.entity_id.length<=256&&!seen.has(row.entity_id)&&
      row.entity_id>previous&&types.has(row.entity_type)&&hashPattern.test(row.content_hash));
    if(row.date!==null)day(row.date);stamp(row.updated_at);stamp(row.deleted_at,true);
    seen.add(row.entity_id);previous=row.entity_id;
  }
  return value;
}
async function indexFor(value,scope,limits,readBudget) {
  envelope(value,scope,limits);
  requireValue(Array.isArray(value.dates)&&value.dates.length<=limits.maxDates&&value.index_hash===value.manifest_hash);
  const represented=new Set(value.entities.filter(row=>row.date!==null).map(row=>row.date));let previous='';
  for(const row of value.dates) {
    requireValue(object(row)&&Object.keys(row).sort().join(',')==='content_hash,date'&&
      day(row.date)>previous&&hashPattern.test(row.content_hash)&&represented.has(row.date));
    previous=row.date;represented.delete(row.date);
    requireValue(row.content_hash===await readBudget.hash({scope_id:scope,entities:value.entities.filter(entity=>entity.date===row.date)}));
  }
  requireValue(represented.size===0);
  requireValue(value.manifest_hash===await readBudget.hash({snapshot_format:FORMAT,scope_id:scope,entities:value.entities}));
  requireValue(value.global_content_hash===await readBudget.hash({scope_id:scope,entities:value.entities.filter(row=>row.date===null)}));
  return value;
}
function sameIndex(a,b) {
  return a.scope_id===b.scope_id&&a.manifest_hash===b.manifest_hash&&a.global_content_hash===b.global_content_hash&&
    equal(a.entities,b.entities)&&equal(a.dates,b.dates);
}
async function detailFor(value,date,index,limits,readBudget) {
  envelope(value,index.scope_id,limits);
  requireValue(value.date===date&&value.manifest_hash===index.manifest_hash&&value.global_content_hash===index.global_content_hash&&
    equal(value.entities,index.entities)&&object(value.data)&&Object.keys(value.data).sort().join(',')===[...collections].sort().join(',')&&
    hashPattern.test(value.content_hash)&&hashPattern.test(value.date_content_hash));
  const expected=new Map(index.entities.filter(row=>row.date===null||row.date===date).map(row=>[row.entity_id,row])),records=[];
  for(const name of collections) {
    const rows=value.data[name];requireValue(Array.isArray(rows));let previous='';
    for(const row of rows) {
      requireValue(object(row)&&Object.keys(row).every(key=>recordKeys.has(key))&&row.entity_id>previous&&
        expected.has(row.entity_id)&&equal(metadata(row),expected.get(row.entity_id))&&
        typeof row.source==='string'&&typeof row.source_id==='string'&&Number.isSafeInteger(row.version)&&row.version>=1);
      stamp(row.created_at,true);
      if(row.change_seq!==undefined)requireValue(Number.isSafeInteger(row.change_seq)&&row.change_seq>=0);
      const {content_hash,...content}=row;
      requireValue(content_hash===await readBudget.hash(content));
      previous=row.entity_id;expected.delete(row.entity_id);records.push(row);
    }
  }
  requireValue(expected.size===0);
  const dateEntities=index.entities.filter(row=>row.date===date);
  requireValue(value.date_content_hash===await readBudget.hash({scope_id:index.scope_id,entities:dateEntities}));
  requireValue(value.content_hash===await readBudget.hash({snapshot_format:FORMAT,scope_id:index.scope_id,date,timezone:'Asia/Shanghai',data:value.data}));
  return records;
}

async function applySnapshot({db,getScope,scope,key,index,initial,cached,records,now}) {
  await db.transaction(['entities','meta'],'readwrite',async tx=>{
    identity(scope,getScope);
    const current=await tx.get('meta',key);
    if(!equal(current??null,initial.meta??null))fail('OFFLINE_SNAPSHOT_CHANGED','其他页面已更新本地快照，请重新核对。');
    const all=(await tx.getAll('entities')).filter(row=>row.scope===scope),manifest=new Set(index.entities.map(row=>row.entity_id));
    for(const record of records.values()) {
      const storageKey=entityKey(scope,record.entity_id),old=await tx.get('entities',storageKey);
      if(old?.server?.version>record.version)fail('OFFLINE_SNAPSHOT_CHANGED','本地已确认较新版本，未覆盖该版本。');
      const server={...record,id:record.source_id},sameVersion=old?.server?.version===record.version;
      if(record.entity_type==='todo'&&sameVersion) {
        for(const field of ['template_id','template_version','template_active']) {
          if(Object.hasOwn(old.server,field))server[field]=old.server[field];
        }
      }
      await tx.put('entities',{...old,key:storageKey,scope,entity_id:record.entity_id,
        server,snapshot_hash:record.content_hash,remote_missing:false,synced_at:now(),
        ...(record.entity_type==='todo'?{needs_api_refresh:!sameVersion||old?.needs_api_refresh===true}:{})});
    }
    for(const row of all)if(row.server&&supportedId.test(row.entity_id)&&!manifest.has(row.entity_id)) {
      if(!equal(row.server,cached.get(row.entity_id)?.server??null))
        fail('OFFLINE_SNAPSHOT_CHANGED','其他页面刚确认了记录，未把它判为线上缺失。');
      await tx.put('entities',{...row,server:null,snapshot_hash:null,remote_missing:true,synced_at:now()});
    }
    identity(scope,getScope);
    await tx.put('meta',{key,value:{index,verified_at:now()}});
  });
}

// request is the existing unwrapped-data GET transport. getScope must return
// a previously verified scope_id; snapshots never rebind an old queue or grant
// editing capability. All network work precedes the one local write transaction.
export function createSnapshotSync({db,request,getScope,now=Date.now,crypto=globalThis.crypto,limits={}}) {
  if(!db?.transaction||typeof request!=='function'||typeof getScope!=='function')throw new TypeError('Snapshot sync dependencies required');
  limits={...SNAPSHOT_PULL_LIMITS,...limits};
  for(const [key,value]of Object.entries(limits)) {
    if(!Object.hasOwn(SNAPSHOT_PULL_LIMITS,key)||!Number.isSafeInteger(value)||value<1)
      throw new TypeError('Invalid snapshot pull limit');
  }
  const state={status:'idle',last_success:null,error:null};let inFlight=null;
  async function run({date:probeDate}={}) {
    const scope=getScope();
    if(typeof scope!=='string'||!hashPattern.test(scope))fail('OFFLINE_SCOPE_REQUIRED','请先联网核实当前身份范围。');
    const key=JSON.stringify([scope,'snapshot']),readBudget=budget(limits,crypto);
    const initial=await db.transaction(['entities','meta'],'readonly',async tx=>({
      meta:await tx.get('meta',key),entities:(await tx.getAll('entities')).filter(row=>row.scope===scope),
    }));
    identity(scope,getScope);
    async function get(path) {
      identity(scope,getScope);readBudget.request();const value=await request(path);
      identity(scope,getScope);readBudget.response(value);return value;
    }
    const index=await indexFor(await get('/workbench-snapshot/index'),scope,limits,readBudget);
    const previous=initial.meta?.value?.index;
    const oldDates=new Map(previous?.scope_id===scope?previous.dates.map(row=>[row.date,row.content_hash]):[]);
    const dates=new Map(index.dates.map(row=>[row.date,row.content_hash]));
    const changed=new Set([...new Set([...oldDates.keys(),...dates.keys()])].filter(date=>oldDates.get(date)!==dates.get(date)));
    const cached=new Map(initial.entities.map(row=>[row.entity_id,row]));let needGlobal=!previous||previous.global_content_hash!==index.global_content_hash;
    for(const entity of index.entities) {
      const row=cached.get(entity.entity_id);
      if(!row?.server||row.snapshot_hash!==entity.content_hash) {
        if(entity.date===null)needGlobal=true;else changed.add(entity.date);
      }
    }
    if(!changed.size&&needGlobal&&index.entities.some(row=>row.date===null))
      changed.add(probeDate===undefined?new Date(now()+8*3600000).toISOString().slice(0,10):day(probeDate));
    if(changed.size+2>limits.maxRequests)fail('OFFLINE_SNAPSHOT_LIMIT','变化日期过多，未返回部分同步结果。',413);
    const records=new Map();
    for(const date of [...changed].sort()) {
      const rows=await detailFor(await get('/workbench-snapshot?date='+encodeURIComponent(date)),date,index,limits,readBudget);
      for(const row of rows) {
        if(records.has(row.entity_id))requireValue(equal(records.get(row.entity_id),row));
        records.set(row.entity_id,row);
      }
    }
    const verified=await indexFor(await get('/workbench-snapshot/index'),scope,limits,readBudget);
    if(!sameIndex(index,verified))fail('OFFLINE_SNAPSHOT_CHANGED','读取期间线上内容已变化，请稍后重新核对；本地内容已保留。');
    identity(scope,getScope);
    await applySnapshot({db,getScope,scope,key,index,initial,cached,records,now});
    state.last_success=now();return {status:'synced',scope,changed_dates:[...changed].sort(),entities:index.entities.length};
  }
  function pull(options) {
    if(inFlight)return inFlight;
    state.status='pulling';state.error=null;
    inFlight=run(options).then(result=>{state.status='synced';return result;},error=>{
      state.status=error.code==='OFFLINE_SCOPE_CHANGED'?'scope-changed':'error';
      state.error={code:error.code||'OFFLINE_SNAPSHOT_NETWORK',status:error.status||null,message:error.message};throw error;
    }).finally(()=>{inFlight=null;});
    return inFlight;
  }
  let stopTriggers=()=>{};
  function start({window=globalThis.window,document=globalThis.document,setInterval=globalThis.setInterval,
    clearInterval=globalThis.clearInterval}={}) {
    stopTriggers();
    const refresh=()=>{if(!document||document.visibilityState!=='hidden')pull().catch(()=>{});};
    window?.addEventListener?.('online',refresh);document?.addEventListener?.('visibilitychange',refresh);
    const timer=setInterval(refresh,300000);
    stopTriggers=()=>{
      window?.removeEventListener?.('online',refresh);document?.removeEventListener?.('visibilitychange',refresh);
      clearInterval(timer);
    };
    refresh();return stopTriggers;
  }
  return {pull,state,start,stop:()=>stopTriggers()};
}
