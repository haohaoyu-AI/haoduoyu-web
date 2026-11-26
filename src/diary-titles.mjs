import {authenticate,bodyFor,digest,fail,requireCsrf,stable} from './security.mjs';
import {consistentRead,mutate,storeFor} from './storage.mjs';
import {snapshotDate} from './business-snapshot.mjs';
import {dailyNotesOwner} from './daily-notes.mjs';
import {beijingDay} from './lib/time.mjs';

const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const json=data=>Response.json({data},{headers:{'Cache-Control':'private, no-store'}});
const read=(store,owner,date)=>store.get('SELECT title,version,updated_at FROM matrix_diary_titles WHERE user_id=? AND date=?',owner,date);
const view=(date,row)=>({date,title:row?.title??'',version:row?.version??0,updated_at:row?.updated_at??null});
export function diaryTitleText(value) {
  if(typeof value!=='string'||!value.isWellFormed()||/[\p{Cc}\p{Cf}\u2028\u2029<>:"/\\|?*]/u.test(value)||[...value.trim()].length>40)
    throw fail(400,'VALIDATION_ERROR','小标题最多 40 个字，不能包含换行或文件名不支持的符号');
  return value.trim();
}
async function titleActor(store,request,owner,origin,write) {
  // Anonymous public-workspace identity and generic API keys never expose journal titles.
  const actor=await authenticate(store,request,write?'write':'read');
  if(actor.kind!=='session'||actor.id!==owner)throw fail(403,'FORBIDDEN','日记小标题仅网站所有者可用');
  if(write) {
    if(request.headers.has('authorization'))throw fail(403,'FORBIDDEN','请从网站保存小标题');
    requireCsrf(request,actor,origin);
  }
  return actor;
}
export async function handleDiaryTitles(db,request,route,env,origin,revision) {
  const match=/^\/diary-titles\/(\d{4}-\d{2}-\d{2})$/.exec(route);
  if(!match||!['GET','PUT'].includes(request.method))throw fail(404,'NOT_FOUND','日记小标题接口不存在');
  const owner=dailyNotesOwner(env),date=snapshotDate(match[1]);
  if(new URL(request.url).search||date>beijingDay(Date.now()))throw fail(400,'VALIDATION_ERROR','请选择有效的日记日期');
  if(request.method==='GET')return consistentRead(db,async store=>{
    await titleActor(store,request,owner,origin,false);
    return json(view(date,await read(store,owner,date)));
  },revision);
  await titleActor(storeFor(db),request,owner,origin,true);
  const input=await bodyFor(request);
  if(Object.keys(input).sort().join(',')!=='save_id,title,version'||typeof input.save_id!=='string'||!uuid.test(input.save_id)||
    !Number.isSafeInteger(input.version)||input.version<0||input.version>=Number.MAX_SAFE_INTEGER)
    throw fail(400,'VALIDATION_ERROR','请提供有效的保存标识和版本');
  const title=diaryTitleText(input.title),key='diary-title:'+input.save_id.toLowerCase();
  const hash=digest(JSON.stringify(stable({date,title,version:input.version})));
  return (await mutate(db,async store=>{
    const actor=await titleActor(store,request,owner,origin,true);
    const row=await read(store,owner,date),current=view(date,row);
    const saved=await store.get('SELECT request_hash,response_json FROM idempotency WHERE actor=? AND key=?',actor.actor,key);
    if(saved) {
      if(saved.request_hash!==hash)throw fail(409,'IDEMPOTENCY_CONFLICT','保存标识已用于其他内容');
      if(JSON.parse(saved.response_json).version!==current.version)throw fail(409,'VERSION_CONFLICT','小标题已更新，请重新核对');
      return {replayed:true,response:json(current)};
    }
    if(current.version!==input.version)throw fail(409,'VERSION_CONFLICT','小标题已在别处更新，请重新核对');
    if(current.title===title)return {replayed:true,response:json(current)};
    const time=new Date().toISOString(),version=current.version+1;
    if(row)store.queue('UPDATE matrix_diary_titles SET title=?,version=?,updated_at=? WHERE user_id=? AND date=? AND version=?',
      title,version,time,owner,date,input.version);
    else store.queue('INSERT INTO matrix_diary_titles(user_id,date,title,version,created_at,updated_at) VALUES(?,?,?,?,?,?)',owner,date,title,version,time,time);
    store.expectChange();
    store.queue('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,200,?)',
      actor.actor,key,hash,JSON.stringify({version}),time);
    return {actor,response:json(view(date,{title,version,updated_at:time}))};
  })).response;
}
