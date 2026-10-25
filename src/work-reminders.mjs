import {bodyFor,digest,stable,fail} from './security.mjs';
import {storeFor,consistentRead,mutate,statement} from './storage.mjs';
import {dailyNotesOwner} from './daily-notes.mjs';
import {snapshotDate} from './business-snapshot.mjs';
import {noteEditor,limitNoteWrites} from './public-note-access.mjs';
import {beijingDay} from './lib/time.mjs';

export const WORK_REMINDER_LIMITS=Object.freeze({per_day:100,summary:16384,source_key:100});
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const fields='id,date,source_key,summary,version,change_seq,created_at,updated_at,deleted_at';
const json=value=>Response.json({data:value});

export function workReminderId(value) {
  if(typeof value!=='string'||value.length!==36||!uuid.test(value))throw fail(400,'VALIDATION_ERROR','工作提醒标识无效');
  return value.toLowerCase();
}
export function workReminderSourceKey(value) {
  if(typeof value!=='string'||!value.length||value.length>WORK_REMINDER_LIMITS.source_key||/[^A-Za-z0-9_.:-]/.test(value))
    throw fail(400,'VALIDATION_ERROR','工作提醒来源标识需要 1–100 个英文字母、数字或 _ . : -');
  return value;
}
export function workReminderSummary(value) {
  if(typeof value!=='string'||!value.isWellFormed()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
    throw fail(400,'VALIDATION_ERROR','工作提醒摘要必须为纯文字');
  const summary=value.replace(/\r\n?/g,'\n');
  if(Buffer.byteLength(summary,'utf8')>WORK_REMINDER_LIMITS.summary)
    throw fail(413,'WORK_REMINDERS_TOO_LARGE','工作提醒摘要最多 16KiB');
  return summary;
}
function queryFor(query,allowed) {
  if([...query.keys()].some(key=>!allowed.includes(key)||query.getAll(key).length!==1))
    throw fail(400,'VALIDATION_ERROR','工作提醒查询参数无效');
}
function inputFor(input,method) {
  const expected=method==='PUT'?['date','source_key','summary','version','save_id']:['version','save_id'];
  if(Object.keys(input).sort().join(',')!==expected.sort().join(',')||
    !Number.isSafeInteger(input.version)||input.version<(method==='PUT'?0:1)||input.version>=Number.MAX_SAFE_INTEGER)
    throw fail(400,'VALIDATION_ERROR','工作提醒字段或版本无效');
  return {...input,save_id:workReminderId(input.save_id),...(method==='PUT'?{
    date:snapshotDate(input.date),source_key:workReminderSourceKey(input.source_key),summary:workReminderSummary(input.summary),
  }:{})};
}
function contentHash(row) {
  return digest(JSON.stringify(stable(Object.fromEntries(fields.split(',').map(field=>[field,row[field]])))));
}
function view(row,canEdit) {
  return {...row,deleted:row.deleted_at!==null,can_edit:canEdit,content_hash:contentHash(row)};
}
async function ownerExists(store,owner) {
  if(!await store.get('SELECT id FROM users WHERE id=?',owner))throw fail(503,'NOTES_CONFIG','工作提醒归属尚未核实');
}
async function rowFor(store,owner,id) {
  return store.get('SELECT '+fields+' FROM matrix_work_reminders WHERE user_id=? AND id=?',owner,id);
}
function receiptFor(row) {
  return {id:row.id,date:row.date,source_key:row.source_key,version:row.version,deleted_at:row.deleted_at,
    change_seq:row.change_seq,content_hash:contentHash(row)};
}
function checkReceipt(saved,hash,row) {
  if(saved.request_hash!==hash)throw fail(409,'IDEMPOTENCY_CONFLICT','保存标识已用于不同内容');
  const receipt=JSON.parse(saved.response_json);
  if(!row||row.version!==receipt.version||contentHash(row)!==receipt.content_hash)
    throw fail(409,'VERSION_CONFLICT','工作提醒已有更新，请核对最新内容');
}
async function ensureDaySpace(store,owner,date) {
  const count=await store.get('SELECT count(*) AS n FROM matrix_work_reminders WHERE user_id=? AND date=? AND deleted_at IS NULL',owner,date);
  if(count.n>=WORK_REMINDER_LIMITS.per_day)throw fail(413,'WORK_REMINDERS_TOO_LARGE','该日工作提醒已达 100 条，请先核对已有内容');
}
async function saveUnchangedReceipt(db,store,actor,key,hash,row) {
  // A no-op still reserves its save ID. Only receipt metadata changes here;
  // the selected entity and the global content revision remain unchanged.
  const revision=(await store.get('SELECT revision FROM matrix_control WHERE id=1')).revision;
  await db.batch([statement(db,
    'INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) SELECT ?,?,?,?,200,? FROM matrix_control WHERE id=1 AND revision=? ON CONFLICT(actor,key) DO NOTHING',
    actor.actor,key,hash,JSON.stringify(receiptFor(row)),new Date().toISOString(),revision)]);
  const saved=await store.get('SELECT request_hash,response_json FROM idempotency WHERE actor=? AND key=?',actor.actor,key);
  if(saved)checkReceipt(saved,hash,row);
  // mutate also verifies the original revision before returning this replay.
  return {replayed:true,response:json(view(row,true))};
}

export async function handleWorkReminders(db,request,route,env,origin,initialRevision) {
  const owner=dailyNotesOwner(env),method=request.method,query=new URL(request.url).searchParams;
  if(method==='GET') {
    if(route!=='/work-reminders')throw fail(404,'NOT_FOUND','工作提醒接口不存在');
    queryFor(query,['date']);
    const date=query.has('date')?snapshotDate(query.get('date')):beijingDay(Date.now());
    return consistentRead(db,async store=>{
      await ownerExists(store,owner);
      const canEdit=Boolean(await noteEditor(store,request,owner,env,'notes',origin));
      const rows=await store.all('SELECT '+fields+' FROM matrix_work_reminders WHERE user_id=? AND date=? AND deleted_at IS NULL ORDER BY created_at,id LIMIT ?',
        owner,date,WORK_REMINDER_LIMITS.per_day+1);
      if(rows.length>WORK_REMINDER_LIMITS.per_day)
        throw fail(413,'WORK_REMINDERS_TOO_LARGE','该日工作提醒超过完整读取上限，请先核对已有内容');
      return json({date,items:rows.map(row=>view(row,canEdit)),can_edit:canEdit});
    },initialRevision);
  }
  const match=/^\/work-reminders\/([^/]+)(\/restore)?$/.exec(route);
  if(!match||!['PUT','DELETE','POST'].includes(method)||Boolean(match[2])!==(method==='POST'))
    throw fail(404,'NOT_FOUND','工作提醒接口不存在');
  queryFor(query,[]);
  const id=workReminderId(match[1]);
  await noteEditor(storeFor(db),request,owner,env,'notes',origin,{write:true});
  limitNoteWrites(owner,'notes');
  const input=inputFor(await bodyFor(request),method),key='work-reminder:'+input.save_id;
  const hash=digest(JSON.stringify(stable({method,id,...input})));
  return (await mutate(db,async store=>{
    await ownerExists(store,owner);
    const actor=await noteEditor(store,request,owner,env,'notes',origin,{write:true}),row=await rowFor(store,owner,id);
    const saved=await store.get('SELECT request_hash,response_json FROM idempotency WHERE actor=? AND key=?',actor.actor,key);
    if(saved) {
      checkReceipt(saved,hash,row);
      return {replayed:true,response:json(view(row,true))};
    }
    if((row?.version||0)!==input.version)throw fail(409,'VERSION_CONFLICT','工作提醒已在其他位置更新');
    if(method!=='PUT'&&!row)throw fail(404,'NOT_FOUND','工作提醒不存在');
    if(method==='PUT') {
      if(row&&(row.date!==input.date||row.source_key!==input.source_key))
        throw fail(400,'VALIDATION_ERROR','已有工作提醒的日期和来源标识不可更改');
      if(row?.deleted_at)throw fail(409,'WORK_REMINDER_DELETED','请先恢复已删除的工作提醒');
      if(row&&row.summary===input.summary)return saveUnchangedReceipt(db,store,actor,key,hash,row);
      if(!row) {
        const duplicate=await store.get('SELECT id FROM matrix_work_reminders WHERE user_id=? AND date=? AND source_key=?',owner,input.date,input.source_key);
        if(duplicate)throw fail(409,'WORK_REMINDER_EXISTS','该日该来源的提醒已存在，请读取后使用原标识更新');
        await ensureDaySpace(store,owner,input.date);
      }
    }
    if(method==='DELETE'&&row.deleted_at!==null)return saveUnchangedReceipt(db,store,actor,key,hash,row);
    if(method==='POST') {
      if(row.deleted_at===null)return saveUnchangedReceipt(db,store,actor,key,hash,row);
      await ensureDaySpace(store,owner,row.date);
    }
    const changeSeq=(await store.get('SELECT revision FROM matrix_control WHERE id=1')).revision+1;
    if(!Number.isSafeInteger(changeSeq)||changeSeq<1)throw fail(503,'WORK_REMINDERS_REVISION','工作提醒版本需要核对，尚未保存');
    const time=new Date().toISOString(),value={id,date:row?.date||input.date,source_key:row?.source_key||input.source_key,
      summary:method==='PUT'?input.summary:row.summary,version:input.version+1,change_seq:changeSeq,
      created_at:row?.created_at||time,updated_at:time,deleted_at:method==='DELETE'?time:null};
    if(row)store.queue('UPDATE matrix_work_reminders SET summary=?,version=?,change_seq=?,updated_at=?,deleted_at=? WHERE user_id=? AND id=? AND version=?',
      value.summary,value.version,changeSeq,time,value.deleted_at,owner,id,input.version);
    else store.queue('INSERT INTO matrix_work_reminders(user_id,id,date,source_key,summary,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      owner,id,value.date,value.source_key,value.summary,value.version,changeSeq,time,time,null);
    store.expectChange();
    store.queue('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,200,?)',
      actor.actor,key,hash,JSON.stringify(receiptFor(value)),time);
    return {actor,response:json(view(value,true))};
  })).response;
}
