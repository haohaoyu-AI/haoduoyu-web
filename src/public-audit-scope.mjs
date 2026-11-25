// Public workspace account history, read incrementally from matrix_audit.
//
// Every public request has to know which accounts the public workspace created
// or deleted. That answer lives in matrix_audit, which has no index on actor, so
// asking for it directly scans the whole (append-only, ever-growing) table on
// every request. On 2026-11-25 these scans alone read ~5.2M rows and used up the
// D1 Free daily read quota.
//
// Here each isolate remembers the rows it already saw plus the highest rowid it
// covered. A request then reads MAX(rowid) (one row) and only the audit rows
// added since. The result is exactly what a full scan returns. A cold isolate,
// a shrinking table, or an entry older than FULL_RESCAN_MS does a full scan again.
// Callers that pass no cache key keep the old full-scan behaviour.

const ACCOUNT_ACTIONS="(action='POST /accounts' OR action LIKE 'DELETE /accounts/%')";
const FULL_RESCAN_MS=60*60*1000;
const caches=new WeakMap();

export async function publicAccountHistory(all,actor,{cacheKey,now=Date.now}={}) {
  if(cacheKey===undefined||cacheKey===null||typeof cacheKey!=='object')
    return (await all(`SELECT action,entity_id FROM matrix_audit WHERE actor=? AND ${ACCOUNT_ACTIONS} ORDER BY rowid`,actor))
      .map(row=>({action:row.action,entity_id:row.entity_id}));
  let byActor=caches.get(cacheKey);
  if(!byActor) {byActor=new Map();caches.set(cacheKey,byActor);}
  const top=Number((await all('SELECT MAX(rowid) AS top FROM matrix_audit'))[0]?.top??0);
  const time=now();
  let entry=byActor.get(actor);
  if(!entry||top<entry.last||time-entry.built>FULL_RESCAN_MS)entry={last:0,rows:[],built:time};
  if(top>entry.last) {
    const fresh=await all(`SELECT action,entity_id FROM matrix_audit WHERE rowid>? AND rowid<=? AND actor=? AND ${ACCOUNT_ACTIONS} ORDER BY rowid`,
      entry.last,top,actor);
    entry={last:top,built:entry.built,rows:[...entry.rows,...fresh.map(row=>({action:row.action,entity_id:row.entity_id}))]};
  }
  byActor.set(actor,entry);
  return entry.rows;
}

export function deletedAccountIds(history) {
  return new Set(history.filter(row=>row.action==='DELETE /accounts/'+row.entity_id).map(row=>row.entity_id));
}
