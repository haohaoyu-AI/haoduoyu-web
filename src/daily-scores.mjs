import {bodyFor,digest,stable,fail} from './security.mjs';
import {storeFor,consistentRead,mutate} from './storage.mjs';
import {snapshotDate} from './business-snapshot.mjs';
import {noteEditor,limitNoteWrites} from './public-note-access.mjs';
import {dailyNotesOwner} from './daily-notes.mjs';
import {beijingDay} from './lib/time.mjs';

const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const json=value=>Response.json({data:value});
function view(row,date,canEdit) {
  if(!row) return {date,score:null,version:0,updated_at:null,can_edit:canEdit};
  return {date,score:row.score,version:row.version,updated_at:row.updated_at,can_edit:canEdit};
}
function queryKeys(query,allowed) {
  if([...query.keys()].some(key=>!allowed.includes(key)||query.getAll(key).length!==1))
    throw fail(400,'VALIDATION_ERROR','打分查询参数无效');
}
function scoreMonth(value) {
  if(typeof value!=='string'||!/^(?!0000)\d{4}-\d{2}$/.test(value))
    throw fail(400,'VALIDATION_ERROR','请明确提供有效的 YYYY-MM');
  snapshotDate(value+'-01');
  return value;
}
function inputFor(input) {
  if(JSON.stringify(Object.keys(input).sort())!==JSON.stringify(['save_id','score','version'])||
    !Number.isSafeInteger(input.score)||input.score<1||input.score>10||
    !Number.isSafeInteger(input.version)||input.version<0||input.version>=Number.MAX_SAFE_INTEGER||
    typeof input.save_id!=='string'||!uuid.test(input.save_id))
    throw fail(400,'VALIDATION_ERROR','分数须为 1 到 10 的整数，并带上版本');
  return input;
}

export async function handleDailyScores(db,request,route,env,origin,initialRevision) {
  const owner=dailyNotesOwner(env),method=request.method,url=new URL(request.url);
  if(method==='GET'&&route==='/daily-scores') {
    return consistentRead(db,async store=>{
      if(!await store.get('SELECT id FROM users WHERE id=?',owner))throw fail(503,'NOTES_CONFIG','打分归属尚未核实');
      const canEdit=Boolean(await noteEditor(store,request,owner,env,'scores',origin));
      if(url.searchParams.has('month')) {
        queryKeys(url.searchParams,['month']);
        const month=scoreMonth(url.searchParams.get('month'));
        const rows=await store.all('SELECT date,score,version,updated_at FROM matrix_daily_scores WHERE user_id=? AND date>=? AND date<? ORDER BY date',
          owner,month+'-01',month+'-32');
        return json({month,items:rows.map(row=>({date:row.date,score:row.score,version:row.version,updated_at:row.updated_at}))});
      }
      queryKeys(url.searchParams,['date']);
      const date=url.searchParams.has('date')?snapshotDate(url.searchParams.get('date')):beijingDay(Date.now());
      const row=await store.get('SELECT date,score,version,updated_at FROM matrix_daily_scores WHERE user_id=? AND date=?',owner,date);
      return json(view(row,date,canEdit));
    },initialRevision);
  }
  const match=/^\/daily-scores\/(\d{4}-\d{2}-\d{2})$/.exec(route);
  if(!match||method!=='PUT')throw fail(404,'NOT_FOUND','打分接口不存在');
  const date=snapshotDate(match[1]);
  await noteEditor(storeFor(db),request,owner,env,'scores',origin,{write:true});
  limitNoteWrites(owner,'notes');
  const input=inputFor(await bodyFor(request));
  const key='daily-scores:'+input.save_id.toLowerCase();
  const hash=digest(JSON.stringify(stable({method,date,score:input.score,version:input.version,save_id:input.save_id})));
  return (await mutate(db,async store=>{
    const actor=await noteEditor(store,request,owner,env,'scores',origin,{write:true});
    const row=await store.get('SELECT date,score,version,created_at,updated_at FROM matrix_daily_scores WHERE user_id=? AND date=?',owner,date);
    const saved=await store.get('SELECT request_hash,response_json FROM idempotency WHERE actor=? AND key=?',actor.actor,key);
    if(saved) {
      if(saved.request_hash!==hash)throw fail(409,'IDEMPOTENCY_CONFLICT','保存标识已用于不同内容');
      const receipt=JSON.parse(saved.response_json),current=view(row,date,true);
      if(current.version!==receipt.version||current.score!==receipt.score)
        throw fail(409,'VERSION_CONFLICT','这一天的分数已更新，请重新读取');
      return {replayed:true,response:json(current)};
    }
    if((row?.version||0)!==input.version)throw fail(409,'VERSION_CONFLICT','这一天的分数已在其他位置更新');
    if(row&&row.score===input.score)return {replayed:true,response:json(view(row,date,true))};
    const time=new Date().toISOString(),version=input.version+1;
    if(row)store.queue('UPDATE matrix_daily_scores SET score=?,version=?,updated_at=? WHERE user_id=? AND date=? AND version=?',input.score,version,time,owner,date,input.version);
    else store.queue('INSERT INTO matrix_daily_scores(user_id,date,score,version,created_at,updated_at) VALUES(?,?,?,?,?,?)',owner,date,input.score,version,time,time);
    store.expectChange();
    const result=view({score:input.score,version,updated_at:time},date,true);
    store.queue('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,200,?)',actor.actor,key,hash,
      JSON.stringify({date,version,score:input.score}),time);
    return {actor,response:json(result)};
  })).response;
}
