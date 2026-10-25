import {bodyFor,digest,stable,fail} from './security.mjs';
import {storeFor,consistentRead,mutate} from './storage.mjs';
import {snapshotDate} from './business-snapshot.mjs';
import {noteEditor,limitNoteWrites} from './public-note-access.mjs';
import {beijingDay} from './lib/time.mjs';

const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const json=value=>Response.json({data:value});
export function dailyNotesOwner(env) {
  const id=env.DAILY_NOTES_OWNER_ID;
  if(typeof id!=='string'||!uuid.test(id))throw fail(503,'NOTES_CONFIG','碎碎念尚未配置明确归属');
  return id.toLowerCase();
}
function noteCategory(query) {
  const category=query.has('category')?query.get('category'):'life';
  if(!['life','work'].includes(category))throw fail(400,'VALIDATION_ERROR','碎碎念分类无效');
  return category;
}
function view(row,date,canEdit) {
  if(!row||row.deleted_at!==null&&!canEdit)
    return {date,text:'',version:0,updated_at:null,deleted:false,can_edit:canEdit};
  return {date,text:row.deleted_at===null?row.text:'',version:row.version,
    updated_at:row.updated_at,deleted:row.deleted_at!==null,can_edit:canEdit};
}
function queryKeys(query,allowed) {
  if([...query.keys()].some(key=>!allowed.includes(key)||query.getAll(key).length!==1))
    throw fail(400,'VALIDATION_ERROR','碎碎念查询参数无效');
}
function inputFor(input,method) {
  const expected=(method==='PUT'?['text','version','save_id']:['version','save_id']).sort();
  if(JSON.stringify(Object.keys(input).sort())!==JSON.stringify(expected)||
    !Number.isSafeInteger(input.version)||input.version<(method==='PUT'?0:1)||input.version>=Number.MAX_SAFE_INTEGER||
    typeof input.save_id!=='string'||!uuid.test(input.save_id))throw fail(400,'VALIDATION_ERROR','保存字段或版本无效');
  if(method==='PUT') {
    if(typeof input.text!=='string'||!input.text.isWellFormed()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.text))
      throw fail(400,'VALIDATION_ERROR','正文必须为纯文字');
    input.text=input.text.replace(/\r\n?/g,'\n');
    if(Buffer.byteLength(input.text,'utf8')>65536)throw fail(413,'NOTES_TOO_LARGE','正文最多 64KiB，请保留未保存草稿');
  }
  return input;
}

export async function handleDailyNotes(db,request,route,env,origin,initialRevision) {
  const owner=dailyNotesOwner(env),method=request.method,url=new URL(request.url),category=noteCategory(url.searchParams);
  const table=category==='work'?'matrix_daily_work_notes':'matrix_daily_notes';
  if(method==='GET'&&(route==='/daily-notes'||route==='/daily-notes/dates')) {
    return consistentRead(db,async store=>{
      if(!await store.get('SELECT id FROM users WHERE id=?',owner))throw fail(503,'NOTES_CONFIG','碎碎念归属尚未核实');
      if(route.endsWith('/dates')) {
        queryKeys(url.searchParams,['before','page_size','category']);
        const before=url.searchParams.has('before')?snapshotDate(url.searchParams.get('before')):null;
        const raw=url.searchParams.get('page_size')||'30';
        if(!/^[1-9]\d*$/.test(raw)||Number(raw)>100)throw fail(400,'VALIDATION_ERROR','日期列表每页最多100项');
        const count=Number(raw),rows=await store.all('SELECT date FROM '+table+' WHERE user_id=? AND deleted_at IS NULL AND text<>?'+(before?' AND date<?':'')+' ORDER BY date DESC LIMIT ?',owner,'',...(before?[before]:[]),count+1);
        const dates=rows.slice(0,count).map(row=>row.date),has_more=rows.length>count;
        return json({dates,has_more,next_before:has_more?dates.at(-1):null});
      }
      queryKeys(url.searchParams,['date','category']);
      const date=url.searchParams.has('date')?snapshotDate(url.searchParams.get('date')):beijingDay(Date.now());
      const canEdit=Boolean(await noteEditor(store,request,owner,env,'notes',origin));
      const row=await store.get('SELECT date,text,version,updated_at,deleted_at FROM '+table+' WHERE user_id=? AND date=?',owner,date);
      return json(view(row,date,canEdit));
    },initialRevision);
  }
  const match=/^\/daily-notes\/(\d{4}-\d{2}-\d{2})(\/restore)?$/.exec(route);
  if(!match||!['PUT','DELETE','POST'].includes(method)||Boolean(match[2])!==(method==='POST'))throw fail(404,'NOT_FOUND','碎碎念接口不存在');
  queryKeys(url.searchParams,['category']);
  const date=snapshotDate(match[1]);
  await noteEditor(storeFor(db),request,owner,env,'notes',origin,{write:true});
  limitNoteWrites(owner,'notes');
  const input=inputFor(await bodyFor(request),method);
  const key='daily-notes:'+(category==='work'?'work:':'')+input.save_id.toLowerCase();
  const hash=digest(JSON.stringify(stable({method,date,...(category==='work'?{category}:{}),...input})));
  return (await mutate(db,async store=>{
    const actor=await noteEditor(store,request,owner,env,'notes',origin,{write:true});
    const row=await store.get('SELECT date,text,version,created_at,updated_at,deleted_at FROM '+table+' WHERE user_id=? AND date=?',owner,date);
    const saved=await store.get('SELECT request_hash,response_json FROM idempotency WHERE actor=? AND key=?',actor.actor,key);
    if(saved) {
      if(saved.request_hash!==hash)throw fail(409,'IDEMPOTENCY_CONFLICT','保存标识已用于不同内容，请保留草稿');
      const receipt=JSON.parse(saved.response_json),current=view(row,date,true);
      if(current.version!==receipt.version||current.deleted!==receipt.deleted||digest(current.text)!==receipt.text_hash)
        throw fail(409,'VERSION_CONFLICT','该页已有更新，请保留草稿并核对');
      return {replayed:true,response:json(current)};
    }
    if((row?.version||0)!==input.version)throw fail(409,'VERSION_CONFLICT','该页已在其他位置更新，请保留草稿');
    if(method!=='PUT'&&!row)throw fail(404,'NOT_FOUND','该日没有记录');
    if(method==='PUT'&&(!row&&input.text===''||row?.deleted_at===null&&row.text===input.text)||method==='DELETE'&&row?.deleted_at!==null)
      return {replayed:true,response:json(view(row,date,true))};
    if(method==='POST'&&row.deleted_at===null)throw fail(409,'VERSION_CONFLICT','记录已恢复，请重新读取');
    const time=new Date().toISOString(),version=input.version+1,deleted=method==='DELETE';
    const changeSeq=(await store.get('SELECT revision FROM matrix_control WHERE id=1')).revision+1;
    if(!Number.isSafeInteger(changeSeq)||changeSeq<1)throw fail(503,'NOTES_REVISION','碎碎念版本需要私下核对，草稿尚未保存');
    const value={date,text:method==='PUT'?input.text:row.text,version,created_at:row?.created_at||time,updated_at:time,deleted_at:deleted?time:null};
    if(row)store.queue('UPDATE '+table+' SET text=?,version=?,change_seq=?,updated_at=?,deleted_at=? WHERE user_id=? AND date=? AND version=?',value.text,version,changeSeq,time,value.deleted_at,owner,date,input.version);
    else store.queue('INSERT INTO '+table+'(user_id,date,text,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?)',owner,date,value.text,version,changeSeq,time,time,null);
    store.expectChange();
    const result=view(value,date,true);
    store.queue('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,200,?)',actor.actor,key,hash,
      JSON.stringify({date,version,deleted,text_hash:digest(result.text)}),time);
    return {actor,response:json(result)};
  })).response;
}
