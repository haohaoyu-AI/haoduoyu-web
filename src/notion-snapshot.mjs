import {randomUUID} from 'node:crypto';
import {authenticate,requireAdmin,requireCsrf,bodyFor,fail,now,digest} from './security.mjs';
import {storeFor,mutate} from './storage.mjs';
import {readBusinessSnapshot,snapshotDate,snapshotCounts,emptySnapshot} from './business-snapshot.mjs';
import {pushNotionSnapshot} from './notion-transport.mjs';

const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export function notionSnapshotConfig(env) {
  let accountIds;
  try {accountIds=JSON.parse(env.NOTION_SNAPSHOT_ACCOUNT_IDS);} catch {}
  const token=env.NOTION_SNAPSHOT_TOKEN,parentId=env.NOTION_SNAPSHOT_PARENT_ID,ownerId=env.NOTION_SNAPSHOT_OWNER_ID;
  if(typeof token!=='string'||token.length<20||token.length>512||/[\x00-\x20\x7f]/.test(token)||
    typeof parentId!=='string'||!uuid.test(parentId)||typeof ownerId!=='string'||!uuid.test(ownerId)||
    !Array.isArray(accountIds)||accountIds.length>50||new Set(accountIds).size!==accountIds.length||
    accountIds.some(id=>typeof id!=='string'||!id||id.length>100))
    throw fail(503,'NOTION_CONFIG','Notion 手动快照尚未完成私有配置');
  return {token,parentId:parentId.toLowerCase(),ownerId:ownerId.toLowerCase(),accountIds};
}

async function claim(db,actor,parentId,date,contentHash) {
  const receiptActor='notion-snapshot:'+digest(parentId),key=date,runId=randomUUID();
  let previousDelivery;
  await mutate(db,async store=>{
    const old=await store.get('SELECT status,response_json FROM idempotency WHERE actor=? AND key=?',receiptActor,key);
    if(old&&[102,202].includes(old.status))
      throw fail(409,'NOTION_PENDING','该日推送仍在执行或结果未确认，请先私下核对 Notion；不会自动重发');
    const saved=old?JSON.parse(old.response_json):null;
    previousDelivery=saved?.previous_delivery||(old?.status===200?{
      page_id:saved.page_id,version:saved.version,content_hash:saved.content_hash,
    }:undefined);
    store.queue('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,102,?) ON CONFLICT(actor,key) DO UPDATE SET request_hash=excluded.request_hash,response_json=excluded.response_json,status=excluded.status,created_at=excluded.created_at',
      receiptActor,key,contentHash,JSON.stringify({run_id:runId,previous_delivery:previousDelivery}),now());
    return {actor};
  });
  return {receiptActor,key,runId,previousDelivery};
}

async function finish(db,actor,receipt,status,result) {
  await mutate(db,async store=>{
    const row=await store.get('SELECT status,response_json FROM idempotency WHERE actor=? AND key=?',receipt.receiptActor,receipt.key);
    if(row?.status!==102||JSON.parse(row.response_json).run_id!==receipt.runId)
      throw fail(409,'NOTION_PENDING','推送回执状态需要私下核对');
    store.queue('UPDATE idempotency SET response_json=?,status=? WHERE actor=? AND key=?',
      JSON.stringify(result),status,receipt.receiptActor,receipt.key);
    return {actor};
  });
}

// Private management operation. It is intentionally absent from the anonymous
// business allowlist and grants no API key or public caller a Notion capability.
export async function handleNotionSnapshot(db,request,env,origin,{push=pushNotionSnapshot}={}) {
  const actor=await authenticate(storeFor(db),request,'write');
  requireAdmin(actor);requireCsrf(request,actor,origin);
  const config=notionSnapshotConfig(env);
  if(actor.id!==config.ownerId)throw fail(403,'FORBIDDEN','此推送仅限明确配置的管理用户');
  const input=await bodyFor(request);
  if(Object.keys(input).length!==1||!Object.hasOwn(input,'date'))
    throw fail(400,'VALIDATION_ERROR','手动快照只接受明确的 date');
  const date=snapshotDate(input.date);
  const snapshot=await readBusinessSnapshot(db,{date,ownerId:config.ownerId,accountIds:config.accountIds});
  const counts=snapshotCounts(snapshot);
  if(emptySnapshot(snapshot))return {status:'skipped_empty',date,counts,verified:false,notion_written:false};
  const receipt=await claim(db,actor,config.parentId,date,snapshot.content_hash);
  let result;
  try {
    result=await push({token:config.token,parentId:config.parentId,snapshot,previousDelivery:receipt.previousDelivery});
    if(result?.verified!==true||result.content_hash!==snapshot.content_hash||!['created','versioned','skipped'].includes(result.status))
      throw Object.assign(new Error('Invalid delivery result'),{uncertainWrite:true});
  } catch(error) {
    const uncertain=error?.uncertainWrite!==false;
    const codes=new Set(['NOTION_RATE_LIMIT','NOTION_UNAVAILABLE','NOTION_UNKNOWN','NOTION_INCOMPLETE',
      'NOTION_INVALID_SNAPSHOT','NOTION_TOO_LARGE','NOTION_BUDGET','NOTION_RESPONSE_LIMIT','NOTION_LEGACY_CONFLICT']);
    const code=codes.has(error?.code)?error.code:'NOTION_UNAVAILABLE';
    // No token, raw response, snapshot body or private error is persisted/logged.
    await finish(db,actor,receipt,uncertain?202:503,{code,pending:uncertain,previous_delivery:receipt.previousDelivery});
    const failure=fail(code==='NOTION_RATE_LIMIT'?429:503,code,uncertain?
      'Notion 结果未确认，已停止；请先回读核对，不会自动重发':'Notion 暂不可用，未创建快照');
    if(code==='NOTION_RATE_LIMIT')failure.notionRetryAfter=Math.max(1,Math.min(86400,Number(error.retryAfter)||60));
    throw failure;
  }
  const output={...result,date,content_hash:snapshot.content_hash,counts,notion_written:result.status!=='skipped'};
  // If recording a verified delivery fails or its result is unknown, leave the
  // durable claim blocked. Never retry the external write to repair a DB receipt.
  await finish(db,actor,receipt,200,output);
  return output;
}
