import {entityKey} from './db.mjs';
import {SNAPSHOT_PULL_LIMITS,snapshotIndex,snapshotReadBudget,snapshotRecords} from './sync.mjs';

export const WINDOW_REFRESH_MS=15*60*1000;
const RETRY_MS=5*60*1000,LEASE_MS=120000;
const legacy=['snapshot','snapshot-v2','snapshot-progress','snapshot-v2-progress'];
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const error=(code,message)=>Object.assign(new Error(message),{code});
const check=(condition,message='近期离线快照不完整，原本机内容已保留。')=>{
  if(!condition)throw error('OFFLINE_SNAPSHOT_INVALID',message);
};
const date=value=>typeof value==='string'&&/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)&&
  Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const inside=(value,coverage)=>typeof value==='string'&&value>=coverage.from&&value<=coverage.to;
function active(context,scope,generation) {
  if(context.getScope()!==scope||context.getGeneration()!==generation)
    throw error('OFFLINE_SCOPE_CHANGED','身份范围已变化，原本机内容和待提交内容已保留。');
}
async function acquire(context,scope,generation,historyDate) {
  return context.db.transaction(['meta','entities'],'readwrite',async tx=>{
    active(context,scope,generation);
    const key=entityKey(scope,'snapshot-window-gate'),old=(await tx.get('meta',key))?.value||{},time=context.now();
    if(old.retry_at>time||old.lease_until>time||!historyDate&&old.next_auto_at>time)return null;
    const token=context.uuid(),gate={...old,lease_token:token,lease_until:time+LEASE_MS,
      ...(!historyDate?{next_auto_at:time+WINDOW_REFRESH_MS}:{})};
    await tx.put('meta',{key,value:gate});
    const rows=(await tx.getAll('entities')).filter(row=>row.scope===scope);
    const proofs=await Promise.all(legacy.map(name=>tx.get('meta',entityKey(scope,name))));
    return {key,token,gate,rows,proofs};
  });
}
async function verifiedBatch(context,value,scope,historyDate) {
  const budget=snapshotReadBudget(SNAPSHOT_PULL_LIMITS,context.crypto);budget.request();budget.response(value);
  check(value?.batch_format==='haoduoyu-workbench-window-v1');
  const coverage=value.coverage;
  check(coverage&&Object.keys(coverage).sort().join(',')==='from,to'&&date(coverage.from)&&date(coverage.to));
  if(historyDate)check(coverage.from===historyDate&&coverage.to===historyDate);
  else {
    const today=new Date(Date.parse(value.index?.generated_at)+8*3600000).toISOString().slice(0,10);
    const from=new Date(Date.parse(today+'T00:00:00Z')-59*86400000).toISOString().slice(0,10);
    check(coverage.to===today&&coverage.from===from);
  }
  const index=await snapshotIndex(value.index,scope,SNAPSHOT_PULL_LIMITS,budget,2);
  check(index.entities.every(row=>row.date===null||inside(row.date,coverage)));
  const records=await snapshotRecords(value.data,index.entities,budget,2);
  return {index,coverage,records};
}
function serverRow(old,record,time) {
  if(old?.server?.version>record.version)throw error('OFFLINE_SNAPSHOT_CHANGED','本机已有较新版本，稍后重试。');
  const server={...record,id:record.source_id},sameVersion=old?.server?.version===record.version;
  let labelEvidence=old?.label_evidence;
  if(record.source==='note_entry'&&record.deleted_at===null) {
    labelEvidence={version:record.version,category:record.category,date:record.date,
      created_at:record.created_at,label:record.label??null};
    if(old?.label_evidence&&(old.label_evidence.version>record.version||
      old.label_evidence.version===record.version&&!same(old.label_evidence,labelEvidence)))
      throw error('OFFLINE_SNAPSHOT_CHANGED','标签证据已变化，本机内容已保留。');
    server.labels_version=1;server.label=labelEvidence.label;
  }
  if(record.entity_type==='unscheduled_todo') {delete server.date;server.completed=Boolean(server.completed);}
  if(record.entity_type==='todo'&&sameVersion)for(const field of ['template_id','template_version','template_active'])
    if(Object.hasOwn(old.server,field))server[field]=old.server[field];
  return {...old,server,...(labelEvidence?{label_evidence:labelEvidence}:{}),window_exclusion:null,
    snapshot_hash:record.content_hash,remote_missing:false,synced_at:time,
    ...(record.entity_type==='todo'?{needs_api_refresh:!sameVersion||old?.needs_api_refresh===true}:{})};
}
async function archiveProofs(tx,scope,initial) {
  for(const [i,name]of legacy.entries()) {
    const key=entityKey(scope,name),current=await tx.get('meta',key);
    if(!same(current,initial.proofs[i]))throw error('OFFLINE_SNAPSHOT_CHANGED','其他页面已更新快照，请稍后重试。');
    if(current) {
      const archive=entityKey(scope,name+'-archive'),previous=await tx.get('meta',archive);
      if((current.value?.verified_at||0)>=(previous?.value?.verified_at||0))await tx.put('meta',{...current,key:archive});
      await tx.delete('meta',key);
    }
  }
}
async function applyBatch(context,scope,generation,initial,batch,historyDate) {
  await context.db.transaction(['entities','meta'],'readwrite',async tx=>{
    active(context,scope,generation);
    const gate=await tx.get('meta',initial.key);
    if(gate?.value?.lease_token!==initial.token)throw error('OFFLINE_SNAPSHOT_CHANGED','另一个页面已接手同步，请稍后重试。');
    const {index,coverage,records}=batch,ids=new Set(index.entities.map(row=>row.entity_id));
    const cached=new Map(initial.rows.map(row=>[row.entity_id,row])),time=context.now();
    for(const record of records) {
      const key=entityKey(scope,record.entity_id),old=await tx.get('entities',key);
      await tx.put('entities',{...serverRow(old,record,time),key,scope,entity_id:record.entity_id});
    }
    const rows=(await tx.getAll('entities')).filter(row=>row.scope===scope);
    for(const row of rows)if(row.server&&inside(row.server.date,coverage)&&!ids.has(row.entity_id)) {
      if(!same(row.server,cached.get(row.entity_id)?.server))
        throw error('OFFLINE_SNAPSHOT_CHANGED','线上读取期间本机已收到更新，原内容已保留。');
      // Absence in a window may be a move to another date: preserve the record.
      await tx.put('entities',{...row,window_exclusion:{manifest_hash:index.manifest_hash,version:row.server.version,
        updated_at:row.server.updated_at,date:row.server.date,snapshot_hash:row.snapshot_hash??null}});
    }
    await archiveProofs(tx,scope,initial);
    active(context,scope,generation);
    const key=entityKey(scope,historyDate?'snapshot-v2-date:'+historyDate:'snapshot-v2-window');
    await tx.put('meta',{key,value:{index,coverage,verified_at:time,partial:true}});
    await tx.put('meta',{key:initial.key,value:{...gate.value,lease_token:null,lease_until:0,retry_at:0,failures:0}});
  });
}
async function failedAttempt(context,scope,generation,initial,failure) {
  if(context.getScope()!==scope||context.getGeneration()!==generation)return;
  await context.db.transaction(['meta'],'readwrite',async tx=>{
    active(context,scope,generation);
    const row=await tx.get('meta',initial.key);
    if(row?.value?.lease_token!==initial.token)return;
    const failures=Math.min(5,(row.value.failures||0)+1),delay=Math.max(RETRY_MS*2**(failures-1),failure.retryAfterMs||0);
    await tx.put('meta',{key:initial.key,value:{...row.value,lease_token:null,lease_until:0,failures,
      retry_at:Math.max(context.now()+Math.min(delay,3600000),failure.rateLimitedUntil||0)}});
  });
}
async function pullWindow(context,{historyDate}={}) {
  if(historyDate!==undefined)check(date(historyDate),'请选择有效的历史日期。');
  const scope=context.getScope(),generation=context.getGeneration();
  if(!/^[a-f0-9]{64}$/.test(scope||''))throw error('OFFLINE_SCOPE_REQUIRED','请先联网核实身份。');
  const initial=await acquire(context,scope,generation,historyDate);
  if(!initial)return {status:'throttled',scope,remaining_dates:0,history_incomplete:true};
  try {
    const path='/workbench-snapshot?window='+(historyDate?'date&date='+historyDate:'recent')+'&version=2';
    const value=await context.request(path);active(context,scope,generation);
    const batch=await verifiedBatch(context,value,scope,historyDate);active(context,scope,generation);
    await applyBatch(context,scope,generation,initial,batch,historyDate);
    return {status:'synced',scope,remaining_dates:0,history_incomplete:true,coverage:batch.coverage};
  }catch(failure) {
    await failedAttempt(context,scope,generation,initial,failure).catch(()=>{});throw failure;
  }
}
export function createWindowSnapshotSync({db,request,getScope,getGeneration=()=>0,now=Date.now,
  crypto=globalThis.crypto,uuid=()=>globalThis.crypto.randomUUID()}) {
  const context={db,request,getScope,getGeneration,now,crypto,uuid};let flight=null,selectedDate;
  return {pull(options) {
    if(flight&&options?.historyDate!==selectedDate)
      return Promise.reject(error('OFFLINE_SYNC_BUSY','正在保存另一份快照，请稍后选择历史日期。'));
    selectedDate=options?.historyDate;
    if(!flight)flight=pullWindow(context,options).finally(()=>{flight=null;});
    return flight;
  }};
}
