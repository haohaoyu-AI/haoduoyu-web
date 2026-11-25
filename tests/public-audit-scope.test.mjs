import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './harness.mjs';
import {countingDb} from './counting-d1.mjs';
import {deletedAccountIds,publicAccountHistory} from '../src/public-audit-scope.mjs';

// The query public requests ran before 2026-11-26. Kept here as the reference result.
const OLD="SELECT action,entity_id FROM matrix_audit WHERE actor=? AND (action='POST /accounts' OR action LIKE 'DELETE /accounts/%')";

async function insertAudit(db,rows) {
  for(let start=0;start<rows.length;start+=50)
    await db.batch(rows.slice(start,start+50).map(([actor,action,entity])=>db.prepare(
      'INSERT INTO matrix_audit(id,actor,action,entity_id,detail_json,created_at) VALUES(?,?,?,?,?,?)')
      .bind(randomUUID(),actor,action,entity,'{}',new Date().toISOString())));
}
const noise=(count,offset=0)=>Array.from({length:count},(_,index)=>
  [index%3?'owner':'public:other','POST /todos','todo-'+(offset+index)]);
const runner=db=>async (sql,...values)=>(await db.prepare(sql).bind(...values).all()).results;
const rowsRead=entries=>entries.reduce((sum,entry)=>sum+(entry.rows_read||0),0);

test('incremental public account history matches the full scan and reads only new audit rows',async t=>{
  const app=await fixture(t),actor='public:'+randomUUID(),key={};
  await insertAudit(app.db,[...noise(1500),[actor,'POST /accounts','acct-a'],[actor,'POST /accounts','acct-b'],
    [actor,'DELETE /accounts/acct-a','acct-a'],[actor,'DELETE /accounts/other','acct-b'],...noise(500,1500)]);
  const expected=async ()=>(await app.db.prepare(OLD).bind(actor).all()).results.map(({action,entity_id})=>({action,entity_id}));

  const cold=countingDb(app.db);
  assert.deepEqual(await publicAccountHistory(runner(cold),actor,{cacheKey:key}),await expected());
  assert.deepEqual([...deletedAccountIds(await expected())],['acct-a']);
  assert.ok(rowsRead(cold.entries)>=2000,'a cold isolate still does one full scan');

  const warm=countingDb(app.db);
  assert.deepEqual(await publicAccountHistory(runner(warm),actor,{cacheKey:key}),await expected());
  assert.ok(rowsRead(warm.entries)<=5,`unchanged table should cost a few rows, got ${rowsRead(warm.entries)}`);

  await insertAudit(app.db,[...noise(30,5000),[actor,'POST /accounts','acct-c'],[actor,'DELETE /accounts/acct-b','acct-b']]);
  const grown=countingDb(app.db);
  assert.deepEqual(await publicAccountHistory(runner(grown),actor,{cacheKey:key}),await expected());
  assert.ok(rowsRead(grown.entries)<=50,`only the 32 new rows should be read, got ${rowsRead(grown.entries)}`);
  assert.deepEqual([...deletedAccountIds(await expected())].sort(),['acct-a','acct-b']);
  t.diagnostic(`rows_read cold=${rowsRead(cold.entries)} warm=${rowsRead(warm.entries)} grown=${rowsRead(grown.entries)}`);
});

test('history falls back to a full scan without a cache key, for other actors, and after the hourly refresh',async t=>{
  const app=await fixture(t),actor='public:'+randomUUID(),key={};
  await insertAudit(app.db,[...noise(300),[actor,'POST /accounts','acct-a']]);
  const plain=countingDb(app.db);
  assert.deepEqual(await publicAccountHistory(runner(plain),actor),[{action:'POST /accounts',entity_id:'acct-a'}]);
  assert.ok(rowsRead(plain.entries)>=300);

  let clock=0;
  await publicAccountHistory(runner(app.db),actor,{cacheKey:key,now:()=>clock});
  assert.deepEqual(await publicAccountHistory(runner(app.db),'public:nobody',{cacheKey:key,now:()=>clock}),[]);
  clock+=61*60*1000;
  const refreshed=countingDb(app.db);
  assert.deepEqual(await publicAccountHistory(runner(refreshed),actor,{cacheKey:key,now:()=>clock}),
    [{action:'POST /accounts',entity_id:'acct-a'}]);
  assert.ok(rowsRead(refreshed.entries)>=300,'stale entry is rebuilt from scratch');
});
