import { createHash } from 'node:crypto';

export const OVERVIEW_CACHE_LIMITS=Object.freeze({bytes:16*1024*1024,itemBytes:15*1024*1024,entries:50,chunkBytes:64*1024});
export function createOverviewCache(limits=OVERVIEW_CACHE_LIMITS,readChunk=(blob,start,end)=>blob.slice(start,end).arrayBuffer()) {
  const policy={...OVERVIEW_CACHE_LIMITS,...limits},dbIds=new WeakMap(),lru=new Map(),allocated=new Set();
  let nextDb=0,bytes=0;
  const events={hits:0,misses:0,servedHits:0,stored:0,expired:0,oversized:0,budgetRejected:0,evicted:0,aborted:0};
  function collect(entry) {
    if(entry.retired&&entry.refs===0&&entry.reads===0&&allocated.delete(entry)) {
      bytes-=entry.charge;entry.blob=null;
    }
  }
  function retire(entry) {
    if(lru.get(entry.key)===entry) lru.delete(entry.key);
    entry.pending=false;entry.retired=true;collect(entry);
  }
  const leaseCharge=policy.chunkBytes*2+512;
  function room(charge,adding=true,keep=null) {
    for(const entry of lru.values()) {
      if(bytes+charge<=policy.bytes&&(!adding||allocated.size<policy.entries)) break;
      if(entry!==keep&&entry.refs===0&&entry.reads===0) {events.evicted++;retire(entry);}
    }
    return bytes+charge<=policy.bytes&&(!adding||allocated.size<policy.entries);
  }
  function ticket(entry,hit,reserved=false) {
    if(!reserved) {
      if(!room(leaseCharge,false,entry)) {events.budgetRejected++;return null;}
      bytes+=leaseCharge;
    }
    entry.refs++;
    let response=null,released=false,leaseFreed=false,activeReads=0;
    const freeLease=()=>{if(released&&activeReads===0&&!leaseFreed) {leaseFreed=true;bytes-=leaseCharge;collect(entry);}};
    const release=()=>{if(!released) {released=true;entry.refs--;freeLease();collect(entry);}};
    return {
      response() {
        if(response||released) throw new Error('Overview cache lease already consumed');
        let offset=0,ended=false;
        const finish=()=>{if(!ended) {ended=true;release();}};
        const stream=new ReadableStream({
          async pull(controller) {
            if(ended) return;
            entry.reads++;activeReads++;
            try {
              const end=Math.min(offset+policy.chunkBytes,entry.blob.size);
              const chunk=await readChunk(entry.blob,offset,end);
              if(ended) return;
              offset=end;controller.enqueue(new Uint8Array(chunk));
              if(offset===entry.blob.size) {controller.close();finish();}
            } catch(error) {
              if(!ended) {retire(entry);try {controller.error(error);} finally {finish();}}
            } finally {entry.reads--;activeReads--;freeLease();collect(entry);}
          },
          cancel() {finish();},
        },{highWaterMark:0});
        try {response=new Response(stream,{headers:{'Content-Type':'application/json'}});}
        catch(error) {finish();throw error;}
        return response;
      },
      publish(at) {
        if(hit) {events.servedHits++;return;}
        if(entry.retired||!entry.pending) return;
        if(at<entry.createdAt||at>=entry.until) {retire(entry);return;}
        const previous=lru.get(entry.key);
        if(previous) retire(previous);
        entry.pending=false;lru.set(entry.key,entry);events.stored++;
      },
      async abort() {
        events.aborted++;
        if(entry.pending) retire(entry);
        if(response) await response.body.cancel().catch(()=>{});else release();
      },
    };
  }
  return {
    key(db,revision,query,actor) {
      const get=name=>typeof query?.get==='function'?query.get(name):query?.[name];
      const period=get('period')??'yesterday',top=Number(get('top_n')??5),platform=get('top_platform')??'',account=get('account_id')||'';
      if(!['yesterday','7d','30d'].includes(period)||!Number.isInteger(top)||top<1||top>100||
        platform&&!['toutiao','zhihu','wechat','other'].includes(platform)||typeof account!=='string') return null;
      if(actor.scope!==null&&(!Array.isArray(actor.scope)||actor.scope.some(id=>typeof id!=='string'))) return null;
      if(!Array.isArray(actor.permissions)||actor.permissions.some(value=>typeof value!=='string')) return null;
      const scope=actor.scope===null?null:[...new Set(actor.scope)].sort();
      const identity=[actor.kind,actor.id,scope,[...new Set(actor.permissions)].sort()];
      const normalized=[period,account,top,platform,identity];
      if(!dbIds.has(db)) dbIds.set(db,++nextDb);
      return dbIds.get(db)+':'+revision+':'+createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    },
    get(key,at) {
      const entry=lru.get(key);
      if(!entry||at<entry.createdAt||at>=entry.until) {
        events.misses++;
        if(entry&&at>=entry.until) {events.expired++;retire(entry);}
        return null;
      }
      lru.delete(key);lru.set(key,entry);events.hits++;return ticket(entry,true);
    },
    reserve(key,at,until,text) {
      const size=Buffer.byteLength(text,'utf8'),charge=size+key.length*2+1024;
      if(size>policy.itemBytes||charge>policy.bytes) {events.oversized++;return null;}
      if(!Number.isFinite(at)||!Number.isFinite(until)||until<=at) return null;
      if(!room(charge+leaseCharge)) {events.budgetRejected++;return null;}
      const entry={key,charge,createdAt:at,until,pending:true,retired:false,refs:0,reads:0,blob:null};
      allocated.add(entry);bytes+=charge+leaseCharge;
      try {entry.blob=new Blob([text]);return ticket(entry,false,true);}
      catch(error) {bytes-=leaseCharge;retire(entry);throw error;}
    },
    stats() {
      return {...events,bytes,entries:allocated.size,resident:lru.size,
        pending:[...allocated].filter(x=>x.pending).length,
        leases:[...allocated].reduce((n,x)=>n+x.refs,0),reads:[...allocated].reduce((n,x)=>n+x.reads,0),policy:{...policy}};
    },
    clear() {for(const entry of allocated) retire(entry);},
  };
}
export const overviewCache=createOverviewCache();
