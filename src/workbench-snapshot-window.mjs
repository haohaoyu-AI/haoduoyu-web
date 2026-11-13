import {fail} from './security.mjs';
import {snapshotDate} from './business-snapshot.mjs';
import {beijingDay,shiftDay} from './lib/time.mjs';
import {revision,storeFor} from './storage.mjs';

const caches=new WeakMap(),TTL=60000,MAX_ENTRIES=4,MAX_BYTES=8*1024*1024;
const responseHeaders={'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Cookie, Authorization'};
export function workbenchWindow(query,time) {
  const mode=query.get('window');
  if(query.getAll('window').length!==1||!['recent','date'].includes(mode)||
    query.getAll('version').length!==1||query.get('version')!=='2'||
    [...query.keys()].some(key=>!['window','version','date'].includes(key))||
    (mode==='recent'?query.has('date'):query.getAll('date').length!==1))
    fail(400,'VALIDATION_ERROR','离线读取只接受 version=2 的 recent 窗口或一个明确日期');
  const to=mode==='date'?snapshotDate(query.get('date')):beijingDay(time);
  return {from:mode==='recent'?shiftDay(to,-59):to,to};
}
// The same revision proof as consistentRead, with at most two window reads.
// A busy workspace must back off instead of repeatedly projecting the sources.
export async function consistentWindowRead(db,operation) {
  for(let attempt=0;attempt<2;attempt++) {
    const before=await revision(db);
    try {
      const value=await operation(storeFor(db),before);
      if(await revision(db)===before)return value;
    }catch(error) {if(await revision(db)===before)throw error;}
  }
  fail(503,'BUSY','数据正在更新，请稍后重试');
}
function limited(retryAfter=60) {
  const error=Object.assign(new Error('离线窗口读取较多，请稍后重试'),
    {status:429,code:'SNAPSHOT_RATE_LIMIT',retryAfter});
  throw error;
}
export function windowLimitResponse(error) {
  return Response.json({error:{code:error.code,message:error.message}},
    {status:429,headers:{...responseHeaders,'Retry-After':String(error.retryAfter)}});
}
function forget(cache,key) {
  const entry=cache.entries.get(key);
  if(entry?.bytes)cache.bytes-=entry.bytes;
  cache.entries.delete(key);
}
function cacheFor(db,time) {
  let cache=caches.get(db);
  if(!cache) {cache={entries:new Map(),builds:new Map(),bytes:0};caches.set(db,cache);}
  for(const [key,entry]of cache.entries)if(entry.expires!==null&&entry.expires<=time)forget(cache,key);
  for(const [key,times]of cache.builds)if(times.every(stamp=>stamp<=time-TTL))cache.builds.delete(key);
  return cache;
}
function admit(cache,scope,time) {
  const times=(cache.builds.get(scope)??[]).filter(stamp=>stamp>time-TTL);
  if(times.length>=3)limited(Math.max(1,Math.ceil((times[0]+TTL-time)/1000)));
  while(cache.entries.size>=MAX_ENTRIES) {
    const ready=[...cache.entries].find(([,entry])=>entry.expires!==null);
    if(!ready)limited();
    forget(cache,ready[0]);
  }
  cache.builds.delete(scope);cache.builds.set(scope,[...times,time]);
  while(cache.builds.size>32)cache.builds.delete(cache.builds.keys().next().value);
}
function charge(budget,result) {
  for(const [used,limit]of [['rows','maxRows'],['bytes','maxBytes'],['hashBytes','maxHashBytes']]) {
    budget.used[used]+=result.cost[used];
    if(budget.used[used]>budget.limits[limit])fail(413,'SNAPSHOT_LIMIT','完整窗口超过读取预算，未返回部分数据');
  }
  if(result.dates>budget.limits.maxDates||result.bytes>budget.limits.maxResponseBytes)
    fail(413,'SNAPSHOT_LIMIT','完整窗口超过读取预算，未返回部分数据');
}

// Best-effort per-isolate cache, never a distributed quota or an auth proof.
// The outer consistentRead checks revision and per-request access after awaiting
// this promise; a build spanning any mutation cannot authorize a response.
export async function cachedWorkbenchWindow(db,identity,budget,now,load) {
  const cache=cacheFor(db,now()),key=JSON.stringify(identity);
  let entry=cache.entries.get(key),created=false;
  if(!entry) {
    admit(cache,identity.scope_id,now());created=true;
    entry={expires:null,bytes:0};cache.entries.set(key,entry);
    const before={...budget.used};
    entry.promise=Promise.resolve().then(load).then(result=>{
      result.bytes=Buffer.byteLength(result.text);
      result.cost=Object.fromEntries(['rows','bytes','hashBytes'].map(key=>[key,budget.used[key]-before[key]]));
      if(result.bytes>MAX_BYTES)forget(cache,key);
      else {
        while(cache.bytes+result.bytes>MAX_BYTES) {
          const ready=[...cache.entries].find(([other,value])=>other!==key&&value.expires!==null);
          if(!ready)break;
          forget(cache,ready[0]);
        }
        entry.bytes=result.bytes;entry.expires=now()+TTL;cache.bytes+=entry.bytes;
      }
      return result;
    }).catch(error=>{forget(cache,key);throw error;});
  }else {cache.entries.delete(key);cache.entries.set(key,entry);}
  const result=await entry.promise;
  if(!created)charge(budget,result);
  return result.text;
}
