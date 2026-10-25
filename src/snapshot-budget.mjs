import {digest,fail,stable} from './security.mjs';

// maxRows/maxBytes cover materialized projection pages (including link rows).
// Auth/scope reads have separate bounded result sizes and also count toward
// maxQueries and the receipt-based maxRowsRead limit.
export const SNAPSHOT_LIMITS=Object.freeze({maxQueries:45,maxRows:4000,maxBytes:1048576,
  maxDates:1000,maxHashBytes:8388608,maxResponseBytes:1048576,maxRowsRead:100000});
const exceeded=()=>fail(413,'SNAPSHOT_LIMIT','完整快照超过读取预算，未返回部分数据');
export function snapshotBudget(overrides={}) {
  const limits={...SNAPSHOT_LIMITS,...overrides};
  for(const [key,value]of Object.entries(limits))
    if(!Object.hasOwn(SNAPSHOT_LIMITS,key)||!Number.isSafeInteger(value)||value<1)throw new TypeError('Invalid snapshot budget');
  const used={queries:0,rows:0,bytes:0,hashBytes:0,rowsRead:0};
  return {limits,used,
    query() {if(++used.queries>limits.maxQueries)exceeded();},
    receipt(result) {
      const count=result?.meta?.rows_read;
      if(!Number.isSafeInteger(count)||count<0)fail(503,'SNAPSHOT_BUDGET','无法核实快照读取预算');
      used.rowsRead+=count;if(used.rowsRead>limits.maxRowsRead)exceeded();
    },
    addRows(rows) {
      used.rows+=rows.length;used.bytes+=Buffer.byteLength(JSON.stringify(rows));
      if(used.rows>limits.maxRows||used.bytes>limits.maxBytes)exceeded();
    },
    hash(value) {
      const text=JSON.stringify(stable(value));used.hashBytes+=Buffer.byteLength(text);
      if(used.hashBytes>limits.maxHashBytes)exceeded();
      return digest(text);
    },
    serialize(value) {
      const text=JSON.stringify({data:value});
      if(Buffer.byteLength(text)>limits.maxResponseBytes)exceeded();
      return text;
    }
  };
}

// Every SQL call, including revision bookends, authentication and retries, is
// counted. rows_read is observed after execution; it is not a pre-scan CPU cap.
export function snapshotDatabase(db,budget) {
  function wrap(statement) {
    async function all() {
      budget.query();const result=await statement.all();budget.receipt(result);return result;
    }
    return {bind:(...values)=>wrap(statement.bind(...values)),all,
      async first(column) {const row=(await all()).results[0]??null;return column===undefined?row:row?.[column]??null;}};
  }
  return {prepare(sql) {
    if(!/^\s*SELECT\b/i.test(sql))throw new Error('Snapshot database is read-only');
    return wrap(db.prepare(sql));
  }};
}
