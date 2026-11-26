import {authenticate,bodyFor,digest,fail,requireCsrf,stable} from './security.mjs';
import {consistentRead,mutate,storeFor} from './storage.mjs';
import {snapshotDate} from './business-snapshot.mjs';
import {dailyNotesOwner} from './daily-notes.mjs';
import {beijingDay} from './lib/time.mjs';

const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const CACHE_CONTROL='private, no-store';
const json=data=>Response.json({data},{headers:{'Cache-Control':CACHE_CONTROL}});
const read=(store,owner,date)=>store.get('SELECT title,version,updated_at FROM matrix_diary_titles WHERE user_id=? AND date=?',owner,date);
const view=(date,row)=>({date,title:row?.title??'',version:row?.version??0,updated_at:row?.updated_at??null});
const SIG_INPUT=/^diary=(\("@method" "@target-uri"\);created=(\d{1,12});expires=(\d{1,12});nonce="([A-Za-z0-9_-]{22})";keyid="([A-Za-z0-9._-]{1,64})";alg="ed25519";tag="diary-title-read-v1")$/;
const SIG_VALUE=/^diary=:([A-Za-z0-9+/]{86}==):$/;
const ARCHIVE_ED25519_PUBLIC=Object.freeze({
  'haoduoyu-archive-vm-20261126':new Uint8Array([
    75,58,246,146,227,110,17,130,18,67,96,170,66,32,121,233,
    193,198,112,24,155,201,25,1,116,125,199,19,145,193,74,180,
  ]),
});
function decodeB64(value) {
  try {
    return Uint8Array.from(atob(value),c=>c.charCodeAt(0));
  } catch {
    return null;
  }
}
function archivePublicKey(env,keyid) {
  if(typeof env?.DIARY_TITLE_ARCHIVE_KEYS==='string') {
    let parsed=null;
    try {parsed=JSON.parse(env.DIARY_TITLE_ARCHIVE_KEYS);} catch {return null;}
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||!Object.hasOwn(parsed,keyid))return null;
    if(typeof parsed[keyid]!=='string')return null;
    const raw=decodeB64(parsed[keyid]);
    return raw&&raw.length===32?raw:null;
  }
  return Object.hasOwn(ARCHIVE_ED25519_PUBLIC,keyid)?ARCHIVE_ED25519_PUBLIC[keyid]:null;
}
function signedError(error) {
  const status=error?.status||500;
  const code=error?.status?error.code:'INTERNAL_ERROR';
  const message=error?.status?error.message:'服务暂时不可用';
  return Response.json({error:{code,message}},{status,headers:{'Cache-Control':CACHE_CONTROL,
    ...(status===503?{'Retry-After':'1'}:{})}});
}
async function signedDiaryTitleRead(db,request,route,env,origin,revision) {
  try {
    if(request.method!=='GET')throw fail(403,'FORBIDDEN','归档服务仅允许 GET 读取日记小标题');
    const match=/^\/diary-titles\/(\d{4}-\d{2}-\d{2})$/.exec(route);
    if(!match)throw fail(404,'NOT_FOUND','日记小标题接口不存在');
    const owner=dailyNotesOwner(env),date=snapshotDate(match[1]),nowMs=Date.now(),nowSec=Math.floor(nowMs/1000);
    const parsedUrl=new URL(request.url);
    const cl=request.headers.get('content-length');
    if(parsedUrl.search||(cl!==null&&cl!=='0')||request.body!==null||date>beijingDay(nowMs))
      throw fail(400,'VALIDATION_ERROR','请选择有效的日记日期和请求格式');
    if(parsedUrl.origin!==origin)throw fail(401,'UNAUTHORIZED','请求来源与签名目标不一致');
    const sigInputMatch=SIG_INPUT.exec(request.headers.get('signature-input')||'');
    const sigMatch=SIG_VALUE.exec(request.headers.get('signature')||'');
    if(!sigInputMatch||!sigMatch)throw fail(401,'UNAUTHORIZED','签名头格式无效');
    const [,sigParams,createdRaw,expiresRaw,nonce,keyid]=sigInputMatch,sigBytes=decodeB64(sigMatch[1]);
    const created=Number(createdRaw),expires=Number(expiresRaw);
    if(!Number.isSafeInteger(created)||!Number.isSafeInteger(expires)||created>nowSec+5||expires<=nowSec||
      expires<created||expires-created>60)throw fail(401,'UNAUTHORIZED','签名时间窗无效或已过期');
    const pubBytes=archivePublicKey(env,keyid);
    if(!pubBytes||!sigBytes||sigBytes.length!==64)throw fail(401,'UNAUTHORIZED','未知或已撤销的归档服务密钥');
    const targetUri=`${origin}/api/v1/diary-titles/${date}`;
    const base=`"@method": GET\n"@target-uri": ${targetUri}\n"@signature-params": ${sigParams}`;
    let valid=false;
    try {
      const key=await crypto.subtle.importKey('raw',pubBytes,{name:'Ed25519'},false,['verify']);
      valid=await crypto.subtle.verify('Ed25519',key,sigBytes,new TextEncoder().encode(base));
    } catch {valid=false;}
    if(!valid)throw fail(401,'UNAUTHORIZED','签名验真失败');
    const yesterday=beijingDay(nowMs-86_400_000);
    if(date!==yesterday)throw fail(403,'FORBIDDEN','归档服务身份仅允许读取上一已结束日期');
    const bucket=`diary_nonce:${keyid}:${nonce}`,windowEndMs=(expires+5)*1000;
    let batchResults;
    try {
      batchResults=await db.batch([
        db.prepare("DELETE FROM matrix_login_attempts WHERE bucket LIKE 'diary_nonce:%' AND window_start<?").bind(nowMs),
        db.prepare('INSERT INTO matrix_login_attempts(bucket,attempts,window_start) VALUES(?,1,?) ON CONFLICT(bucket) DO NOTHING').bind(bucket,windowEndMs),
      ]);
    } catch {
      throw fail(503,'REPLAY_STORE_UNAVAILABLE','鉴权防重放状态暂时不可用');
    }
    if(batchResults?.[1]?.meta?.changes!==1)throw fail(409,'REPLAY_DETECTED','请求签名已使用，请生成新 nonce 重试');
    try {
      return await consistentRead(db,async store=>json(view(date,await read(store,owner,date))),revision);
    } catch(error) {
      if(error?.status)throw error;
      throw fail(503,'SERVICE_UNAVAILABLE','日记小标题数据暂时无法核验');
    }
  } catch(error) {
    return signedError(error);
  }
}
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
  if(request.headers.has('signature-input')||request.headers.has('signature'))
    return signedDiaryTitleRead(db,request,route,env,origin,revision);
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
