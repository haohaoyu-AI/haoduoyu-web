import {fail,requireOrigin} from './security.mjs';
import {registerPublicBusiness} from './business-access.mjs';

const buckets=new Map();
const reads=new Set(['/auth/me','/accounts','/articles','/observations','/daily-metrics','/dashboard','/overview','/due-reviews',
  '/todos','/todo-templates','/todo-preferences','/export']);
export function publicBusinessRoute(route,method) {
  if(method==='GET') return reads.has(route)||/^\/articles\/[^/]+$/.test(route);
  if(method==='POST') return ['/accounts','/articles','/observations','/daily-metrics','/todos','/todo-templates'].includes(route)||
    /^\/todos\/[^/]+\/(restore|template)$/.test(route);
  if(method==='PUT') return /^\/(accounts|articles)\/[^/]+$/.test(route);
  if(method==='PATCH') return route==='/todo-preferences'||/^\/(todos|todo-templates)\/[^/]+$/.test(route);
  return method==='DELETE'&&/^\/(todos|todo-templates|accounts|articles|observations|daily-metrics)\/[^/]+$/.test(route);
}

// Bounded, best-effort per-isolate protection before any D1 access. Cloudflare's
// Free hard limits remain authoritative; this is not a global distributed quota.
export function limitPublicBusiness(key,write,time=Date.now()) {
  let bucket=buckets.get(key);
  const day=Math.floor(time/86400000),minute=Math.floor(time/60000);
  if(!bucket||bucket.day!==day) bucket={day,minute,dayCount:0,count:0,writes:0};
  if(bucket.minute!==minute) {bucket.minute=minute;bucket.count=0;bucket.writes=0;}
  if(bucket.dayCount>=1000||bucket.count>=60||write&&bucket.writes>=20)
    throw fail(429,'RATE_LIMITED','公开操作较多，请稍后重试');
  bucket.dayCount++;bucket.count++;if(write) bucket.writes++;
  buckets.delete(key);buckets.set(key,bucket);
  while(buckets.size>32) buckets.delete(buckets.keys().next().value);
}

async function boundedRequest(request) {
  const reader=request.body?.getReader();let length=0;const chunks=[];
  if(reader) try {
    for(;;) {
      const {done,value}=await reader.read();if(done) break;
      length+=value.byteLength;
      if(length>16384) {await reader.cancel();throw fail(413,'BODY_TOO_LARGE','公开写入内容超过 16KB');}
      chunks.push(value);
    }
  } finally {reader?.releaseLock();}
  return new Request(request,{body:Buffer.concat(chunks),duplex:'half'});
}

export async function publicBusinessAccess(db,request,route,env,origin) {
  if(env.PUBLIC_BUSINESS_MODE!=='1'||!publicBusinessRoute(route,request.method)) return null;
  const id=env.PUBLIC_BUSINESS_USER_ID;
  let scope;
  try {scope=JSON.parse(env.PUBLIC_BUSINESS_ACCOUNT_IDS);} catch {}
  if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)||!Array.isArray(scope)||scope.length>50||
    scope.some(value=>typeof value!=='string'||!value||value.length>100)||new Set(scope).size!==scope.length)
    throw fail(503,'CONFIGURATION','公开业务的数据归属尚未确认');
  const write=request.method!=='GET';
  if(write) {
    requireOrigin(request,origin);
    if(request.headers.get('X-Public-Business')!=='1') throw fail(403,'CSRF','公开写入需要同源业务请求');
  }
  limitPublicBusiness(origin+':'+id,write);
  if(write) request=await boundedRequest(request);
  if(!await db.prepare('SELECT id FROM matrix_users WHERE id=?').bind(id).first())
    throw fail(503,'CONFIGURATION','公开业务的数据归属尚未确认');
  const actorName='public:'+id;
  // New public-created accounts remain in this explicit public workspace. Existing
  // accounts are never added merely because they happen to be present in the DB.
  const history=(await db.prepare("SELECT action,entity_id FROM matrix_audit WHERE actor=? AND (action='POST /accounts' OR action LIKE 'DELETE /accounts/%')").bind(actorName).all()).results;
  const deleted=new Set(history.filter(row=>row.action==='DELETE /accounts/'+row.entity_id).map(row=>row.entity_id));
  scope=[...new Set([...scope,...history.filter(row=>row.action==='POST /accounts').map(row=>row.entity_id)])].filter(id=>!deleted.has(id));
  if(scope.length>50) throw fail(503,'CONFIGURATION','公开业务账号数量需要重新确认');
  if(scope.length) {
    const found=(await db.prepare('SELECT id FROM matrix_accounts WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(scope)).all()).results;
    if(found.length!==scope.length) throw fail(503,'CONFIGURATION','公开业务账号范围尚未确认');
  }
  const actor=Object.freeze({id,actor:actorName,kind:'public',scope:Object.freeze(scope),permissions:Object.freeze(['read','write'])});
  registerPublicBusiness(request,actor);
  return {request,actor};
}

export function publicArticle(value) {
  const redact=event=>event?{actor:'public',label:'公开业务编辑',at:event.at}:null;
  return {...value,recorded_by:redact(value.recorded_by),last_modified_by:redact(value.last_modified_by)};
}

export function requirePublicAccount(actor,id) {
  if(id!==undefined) {
    if(!actor.scope.includes(id)) throw fail(404,'NOT_FOUND','账号不存在');
  } else if(actor.scope.length>=50) throw fail(409,'VALIDATION_ERROR','公开业务账号已达到上限');
}

export async function publicBusinessResult(operation) {
  try {return await operation;}
  catch(error) {
    if(error.status===403&&error.code==='FORBIDDEN') throw fail(404,'NOT_FOUND','记录不存在');
    throw error;
  }
}
