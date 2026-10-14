import {db} from './test-store';
import {accountInput,accountLimit,scanBenchmarkAccounts} from './hot-article-discovery';
import type {BenchmarkAccount,DiscoveryResult} from './hot-article-discovery';
import {captureResponseDiagnostic,cleanupResponseDiagnostics,checkDiagnosticBudget} from './hot-response-diagnostics';

type ScanRow={id:string;request_key:string;state:string;accounts_json:string;result_json:string|null;created:string;expires:string;has_successor:number};
export type DiscoveryView={owner_scope:string;accounts:BenchmarkAccount[];scan:{id:string;request_key:string;state:string;created:string;pool_changed:boolean;result:DiscoveryResult|null}|null;account_change?:{action:'add'|'remove';changed:boolean}};
export class DiscoveryBusyError extends Error{constructor(public readonly view:DiscoveryView){super('已有扫描正在进行，本次刷新未接纳');}}
async function accounts(owner:string):Promise<BenchmarkAccount[]>{return (await db().prepare('SELECT id,name,url,created FROM hot_benchmark_accounts WHERE owner=? ORDER BY created,id').bind(owner).all()).results as BenchmarkAccount[];}
function present(row:ScanRow|null,pool:BenchmarkAccount[]):DiscoveryView['scan']{
 if(!row)return null;
 const snapshot=JSON.parse(row.accounts_json) as BenchmarkAccount[];
 const state=row.state==='collecting'?(row.expires<=new Date().toISOString()?'interrupted':row.has_successor?'superseded':row.state):row.state;
 return {id:row.id,request_key:row.request_key,state,created:row.created,pool_changed:JSON.stringify(snapshot.map(a=>a.id).sort())!==JSON.stringify(pool.map(a=>a.id).sort()),result:row.result_json?JSON.parse(row.result_json):null};
}
export async function readDiscovery(owner:string,requestKey?:string):Promise<DiscoveryView>{
 const pool=await accounts(owner);
 const select='SELECT scan.*,EXISTS(SELECT 1 FROM hot_benchmark_scans newer WHERE newer.owner=scan.owner AND newer.rowid>scan.rowid) AS has_successor FROM hot_benchmark_scans scan';
 const row=await (requestKey?db().prepare(select+' WHERE scan.owner=? AND scan.request_key=?').bind(owner,requestKey):db().prepare(select+' WHERE scan.owner=? ORDER BY scan.created DESC,scan.rowid DESC LIMIT 1').bind(owner)).first<ScanRow>();
 const owner_scope=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('hot-benchmark-owner:'+owner)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 return {owner_scope,accounts:pool,scan:present(row,pool)};
}
export async function addBenchmark(owner:string,value:unknown){
 const input=accountInput(value),stamp=new Date().toISOString();
 const inserted=await db().prepare('INSERT INTO hot_benchmark_accounts(id,owner,name,url,created) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM hot_benchmark_accounts WHERE owner=?)<? ON CONFLICT(owner,url) DO NOTHING').bind(crypto.randomUUID(),owner,input.name,input.url,stamp,owner,accountLimit).run();
 const saved=await db().prepare('SELECT id FROM hot_benchmark_accounts WHERE owner=? AND url=?').bind(owner,input.url).first();
 if(!saved)throw Error(`账号池最多保存${accountLimit}个账号，请先移除不用的账号`);
 return {...await readDiscovery(owner),account_change:{action:'add' as const,changed:inserted.meta.changes>0}};
}
export async function removeBenchmark(owner:string,id:unknown){
 if(typeof id!=='string'||!/^[-a-z0-9]{36}$/.test(id))throw Error('账号标识无效');
 const removed=await db().prepare('DELETE FROM hot_benchmark_accounts WHERE owner=? AND id=?').bind(owner,id).run();return {...await readDiscovery(owner),account_change:{action:'remove' as const,changed:removed.meta.changes>0}};
}
export function discoveryRequestKey(value:unknown):string{
 if(typeof value!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value))throw Error('刷新标识无效');return value;
}
export async function refreshDiscovery(owner:string,value:unknown,fetcher:typeof fetch=fetch):Promise<DiscoveryView>{
 const key=discoveryRequestKey(value),prior=await readDiscovery(owner,key);if(prior.scan)return prior;
 const pool=prior.accounts;if(!pool.length)throw Error('请先添加一个文娱对标账号');
 const stamp=new Date().toISOString(),id=crypto.randomUUID(),expires=new Date(Date.parse(stamp)+60000).toISOString();
 const inserted=await db().prepare("INSERT INTO hot_benchmark_scans(id,owner,request_key,state,accounts_json,created,expires,updated) SELECT ?,?,?,'collecting',?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM hot_benchmark_scans WHERE owner=? AND state='collecting' AND expires>?) ON CONFLICT(owner,request_key) DO NOTHING").bind(id,owner,key,JSON.stringify(pool),stamp,expires,stamp,owner,stamp).run();
 if(!inserted.meta.changes){const same=await readDiscovery(owner,key);if(same.scan)return same;throw new DiscoveryBusyError(await readDiscovery(owner));}
 // No event dispatch, authority lookup, article creation or model invocation.
 const samples:{account:BenchmarkAccount;html:string;status:number}[]=[];
 const result=await scanBenchmarkAccounts(pool,fetcher,stamp,(account,html,status)=>{samples.push({account,html,status});});
 for(const sample of samples){const observation=result.observations.find(o=>o.account_id===sample.account.id);if(observation)observation.response_diagnostic={state:'unavailable',derived:true,can_verify_metrics:false};}
 // The database clock is evaluated when the statement executes, not when JS
 // binds it. A delayed commit cannot revive an expired or superseded scan.
 const committed=await db().prepare("UPDATE hot_benchmark_scans AS scan SET state=?,result_json=?,updated=? WHERE owner=? AND id=? AND state='collecting' AND expires>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND NOT EXISTS (SELECT 1 FROM hot_benchmark_scans AS newer WHERE newer.owner=scan.owner AND newer.rowid>scan.rowid)").bind(result.status,JSON.stringify(result),new Date().toISOString(),owner,id).run();
 if(!committed.meta.changes)return readDiscovery(owner,key);
 const view=await readDiscovery(owner,key);
 // Optional I/O starts only after the primary result is durable. A single
 // 200ms wall-clock budget includes cleanup, capture and metadata persistence.
 const controller=new AbortController(),budget={signal:controller.signal,deadline:Date.now()+200};let timer:ReturnType<typeof setTimeout>|undefined;
 const timeout=new Promise<DiscoveryView>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(view);},200);});
 const diagnostic=async()=>{
  await cleanupResponseDiagnostics(owner,budget);checkDiagnosticBudget(budget);
  if(!samples.length)return view;
  const enriched=JSON.parse(JSON.stringify(result)) as DiscoveryResult;
  await Promise.all(samples.map(async sample=>{const summary=await captureResponseDiagnostic(owner,id,sample.account,sample.html,sample.status,stamp,budget);const observation=enriched.observations.find(o=>o.account_id===sample.account.id);if(observation)observation.response_diagnostic=summary;}));checkDiagnosticBudget(budget);
  const updated=await db().prepare("UPDATE hot_benchmark_scans SET result_json=? WHERE owner=? AND id=? AND result_json=? AND strftime('%Y-%m-%dT%H:%M:%fZ','now')<?").bind(JSON.stringify(enriched),owner,id,JSON.stringify(result),new Date(budget.deadline).toISOString()).run();checkDiagnosticBudget(budget);
  if(updated.meta.changes&&view.scan)view.scan.result=enriched;return view;
 };
 try{return await Promise.race([diagnostic().catch(()=>view),timeout]);}finally{if(timer)clearTimeout(timer);controller.abort();}
}
