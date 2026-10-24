// Internal preparation only: no HTTP route, scheduler, credential creation or remote configuration.
import {randomUUID} from 'node:crypto';
import {digest,stable,fail,now} from './security.mjs';
import {mutate,consistentRead} from './storage.mjs';
import {snapshotDate} from './business-snapshot.mjs';
import {pushNotionNote} from './notion-transport.mjs';

const uuid=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const codes=new Set(['NOTION_RATE_LIMIT','NOTION_UNAVAILABLE','NOTION_UNKNOWN','NOTION_INCOMPLETE','NOTION_INVALID_SNAPSHOT',
  'NOTION_TOO_LARGE','NOTION_BUDGET','NOTION_RESPONSE_LIMIT','NOTION_LEGACY_CONFLICT']);
const initial={change_seq:0,date:''};
const stateError=()=>fail(503,'NOTION_NOTES_STATE','碎碎念同步状态需要私下核对');
function decode(row) {
  try {const value=JSON.parse(row.response_json);if(!value||typeof value!=='object')throw Error();return value;}
  catch {throw stateError();}
}
function cursorOf(value) {
  const cursor=value?.cursor||initial;
  if(!Number.isSafeInteger(cursor.change_seq)||cursor.change_seq<0||typeof cursor.date!=='string'||
    (cursor.change_seq===0?cursor.date!=='':snapshotDate(cursor.date)!==cursor.date))throw stateError();
  return {change_seq:cursor.change_seq,date:cursor.date};
}
function previousOf(row) {
  if(!row)return;
  const saved=decode(row);
  const source=saved.previous_delivery||(row.status===200?saved:null);
  if(!source)return;
  if(!/^[a-f\d]{32}$/i.test(source.page_id)||!Number.isSafeInteger(source.version)||source.version<1||source.version>999999||
    !/^[a-f\d]{64}$/.test(source.content_hash))throw stateError();
  return {page_id:source.page_id,version:source.version,content_hash:source.content_hash};
}
function noteSnapshot(note) {
  snapshotDate(note.date);
  if(typeof note.text!=='string'||Buffer.byteLength(note.text)>65536||!Number.isSafeInteger(note.change_seq)||note.change_seq<1)
    throw fail(503,'NOTION_NOTES_DATA','碎碎念内容无法完整推送');
  const state=note.deleted_at!==null?'deleted':note.text===''?'cleared':'active';
  const snapshot={snapshot_format:'haoduoyu-daily-notes-v1',date:note.date,timezone:'Asia/Shanghai',
    notes:[{date:note.date,text:state==='active'?note.text:'',state}]};
  snapshot.content_hash=digest(JSON.stringify(stable(snapshot)));
  return {...snapshot,generated_at:now()};
}

async function start(db,actor,ownerId,parentId) {
  const receiptActor='notion-notes:'+digest(ownerId+':'+parentId),runId=randomUUID();
  let cursor,highWater;
  await mutate(db,async store=>{
    const row=await store.get("SELECT c.revision AS high_water,i.status,i.response_json FROM matrix_control c JOIN users u ON u.id=? LEFT JOIN idempotency i ON i.actor=? AND i.key='cursor' WHERE c.id=1",ownerId,receiptActor);
    if(!row)throw fail(503,'NOTION_CONFIG','碎碎念归属尚未核实');
    if([102,202].includes(row.status))throw fail(409,'NOTION_PENDING','碎碎念同步仍在执行或结果未确认，不会自动重发');
    cursor=row.status!==null?cursorOf(decode(row)):{...initial};
    highWater=row.high_water;
    if(!Number.isSafeInteger(highWater)||highWater<cursor.change_seq)throw stateError();
    store.queue('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,102,?) ON CONFLICT(actor,key) DO UPDATE SET request_hash=excluded.request_hash,response_json=excluded.response_json,status=excluded.status,created_at=excluded.created_at',
      receiptActor,'cursor',digest(runId),JSON.stringify({run_id:runId,cursor,high_water:highWater}),now());
    return {actor};
  });
  return {receiptActor,runId,cursor,highWater};
}
async function runState(store,run) {
  const row=await store.get('SELECT status,response_json FROM idempotency WHERE actor=? AND key=?',run.receiptActor,'cursor');
  if(row?.status!==102||decode(row).run_id!==run.runId)throw stateError();
  return decode(row);
}
async function claimDate(db,actor,run,note,snapshot) {
  let previousDelivery;
  await mutate(db,async store=>{
    const saved=await runState(store,run);
    const old=await store.get('SELECT status,response_json FROM idempotency WHERE actor=? AND key=?',run.receiptActor,'date:'+note.date);
    if(old&&[102,202].includes(old.status))throw fail(409,'NOTION_PENDING','该日碎碎念结果未确认，不会自动重发');
    previousDelivery=previousOf(old);
    const item={run_id:run.runId,change_seq:note.change_seq,previous_delivery:previousDelivery};
    store.queue('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,102,?) ON CONFLICT(actor,key) DO UPDATE SET request_hash=excluded.request_hash,response_json=excluded.response_json,status=excluded.status,created_at=excluded.created_at',
      run.receiptActor,'date:'+note.date,snapshot.content_hash,JSON.stringify(item),now());
    store.queue('UPDATE idempotency SET response_json=? WHERE actor=? AND key=?',
      JSON.stringify({...saved,pending_date:note.date}),run.receiptActor,'cursor');
    return {actor};
  });
  return {previousDelivery};
}
async function complete(db,actor,run,note,delivery) {
  await mutate(db,async store=>{
    const saved=await runState(store,run);
    if(saved.pending_date!==note.date)throw stateError();
    const cursor={change_seq:note.change_seq,date:note.date};
    store.queue('UPDATE idempotency SET status=200,response_json=? WHERE actor=? AND key=?',
      JSON.stringify({...delivery,date:note.date,change_seq:note.change_seq}),run.receiptActor,'date:'+note.date);
    store.queue('UPDATE idempotency SET response_json=? WHERE actor=? AND key=?',
      JSON.stringify({run_id:run.runId,cursor,high_water:run.highWater}),run.receiptActor,'cursor');
    return {actor};
  });
}
async function release(db,actor,run,{failure,note,previousDelivery}={}) {
  await mutate(db,async store=>{
    const saved=await runState(store,run),uncertain=failure?.uncertainWrite!==false&&!!failure;
    if(note)store.queue('UPDATE idempotency SET status=?,response_json=? WHERE actor=? AND key=?',
      uncertain?202:503,JSON.stringify({code:failure.code,previous_delivery:previousDelivery}),run.receiptActor,'date:'+note.date);
    store.queue('UPDATE idempotency SET status=?,response_json=? WHERE actor=? AND key=?',
      uncertain?202:200,JSON.stringify({cursor:cursorOf(saved),high_water:run.highWater,...(failure?{code:failure.code}:{}),
        ...(uncertain?{pending_date:note.date}:{})}),run.receiptActor,'cursor');
    return {actor};
  });
}

async function syncNotes(db,{ownerId,parentId,token},{push=pushNotionNote,actor,pageSize=2,maxNotes=2,fetchImpl=fetch}={}) {
  if(!actor||actor.kind!=='session'||actor.id!==ownerId)throw fail(403,'FORBIDDEN','碎碎念同步仅限明确归属的管理员会话');
  if(typeof ownerId!=='string'||!uuid.test(ownerId)||typeof parentId!=='string'||
    !/^([a-f\d]{32}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.test(parentId)||
    typeof token!=='string'||token.length<20||token.length>512||/[\x00-\x20\x7f]/.test(token)||
    !Number.isSafeInteger(pageSize)||pageSize<1||pageSize>2||!Number.isSafeInteger(maxNotes)||maxNotes<1||maxNotes>2)
    throw fail(503,'NOTION_CONFIG','碎碎念同步尚未完成私有配置');
  parentId=parentId.replaceAll('-','').toLowerCase();
  const run=await start(db,actor,ownerId,parentId),budget={remaining:40},synced=[];
  let cursor=run.cursor,hasMore=false,requests=0;
  const sharedFetch=async(...args)=>{
    if(requests>=40)throw Object.assign(new Error('Notion request budget exhausted.'),{code:'NOTION_BUDGET',uncertainWrite:true});
    requests++;budget.remaining=40-requests;
    return fetchImpl(...args);
  };
  const summary=status=>({status,synced,cursor,high_water:run.highWater,has_more:hasMore,requests});
  for(;;) {
    let page;
    try {
      page=await consistentRead(db,store=>store.all('SELECT date,text,version,change_seq,created_at,updated_at,deleted_at FROM matrix_daily_notes WHERE user_id=? AND (change_seq>? OR (change_seq=? AND date>?)) AND change_seq<=? ORDER BY change_seq,date LIMIT ?',
        ownerId,cursor.change_seq,cursor.change_seq,cursor.date,run.highWater,Math.min(pageSize,maxNotes-synced.length)+1));
    }catch {
      await release(db,actor,run);
      throw fail(503,'NOTION_NOTES_READ','碎碎念完整读取未完成，未跳过未同步内容');
    }
    if(!page.length){hasMore=false;break;}
    const count=Math.min(pageSize,maxNotes-synced.length);
    hasMore=page.length>count;
    for(const note of page.slice(0,count)) {
      let snapshot;
      try {snapshot=noteSnapshot(note);}catch {
        await release(db,actor,run);throw fail(503,'NOTION_NOTES_DATA','碎碎念内容无法完整推送');
      }
      const claimed=await claimDate(db,actor,run,note,snapshot);
      let delivered;
      try {
        delivered=await push({token,parentId,snapshot,previousDelivery:claimed.previousDelivery,fetchImpl:sharedFetch,requestBudget:budget});
        if(delivered?.verified!==true||delivered.content_hash!==snapshot.content_hash||!['created','versioned','skipped'].includes(delivered.status)||
          !/^[a-f\d]{32}$/i.test(delivered.page_id)||!Number.isSafeInteger(delivered.version)||delivered.version<1||delivered.version>999999)
          throw Object.assign(new Error(),{code:'NOTION_UNKNOWN',uncertainWrite:true});
      }catch(error) {
        const failure={code:codes.has(error?.code)?error.code:'NOTION_UNAVAILABLE',uncertainWrite:error?.uncertainWrite!==false};
        await release(db,actor,run,{failure,note,previousDelivery:claimed.previousDelivery});
        hasMore=true;
        if(failure.code==='NOTION_BUDGET'&&!failure.uncertainWrite)return summary('partial');
        const e=Object.assign(new Error('碎碎念同步已停止，未跳过未确认内容'),{
          status:failure.code==='NOTION_RATE_LIMIT'?429:503,code:failure.code,uncertainWrite:failure.uncertainWrite});
        if(failure.code==='NOTION_RATE_LIMIT')e.notionRetryAfter=Math.max(1,Math.min(86400,Number(error.retryAfter)||60));
        throw e;
      }
      // Persist only delivery metadata, never note text, token, snapshot or upstream response.
      const delivery={status:delivered.status,page_id:delivered.page_id,version:delivered.version,verified:true,content_hash:snapshot.content_hash};
      await complete(db,actor,run,note,delivery);
      cursor={change_seq:note.change_seq,date:note.date};
      synced.push({date:note.date,change_seq:note.change_seq,...delivery});
    }
    if(synced.length>=maxNotes||!hasMore)break;
  }
  await release(db,actor,run);
  return summary(hasMore?'partial':synced.length?'synced':'empty');
}

export async function syncUpdatedNotes(...args) {
  try {return await syncNotes(...args);}
  catch(error) {
    const safe=new Set([...codes,'NOTION_CONFIG','NOTION_PENDING','NOTION_NOTES_STATE','NOTION_NOTES_DATA','NOTION_NOTES_READ',
      'FORBIDDEN','UNAUTHORIZED','BUSY']);
    if(safe.has(error?.code)&&Number.isInteger(error.status))throw error;
    // An unknown D1 receipt outcome must not trigger another external write.
    throw Object.assign(new Error('碎碎念同步回执未确认，请私下核对；不会自动重发'),{
      code:'NOTION_PENDING',status:503,uncertainWrite:true});
  }
}
