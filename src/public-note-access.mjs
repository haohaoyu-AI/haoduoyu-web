import {authenticate,requireAdmin,requireCsrf,requireOrigin,digest,fail} from './security.mjs';

const buckets=new Map();
// This actor is never registered as an admin or as general public-business access.
export async function noteEditor(store,request,owner,env,module,origin,{write=false}={}) {
  let actor;
  if(request.headers.has('authorization')||/(?:^|;\s*)matrix_session=/.test(request.headers.get('cookie')||'')) {
    try {actor=await authenticate(store,request,write?'write':'read');}
    catch(error) {
      if(![401,403].includes(error.status))throw error;
      if(request.headers.has('authorization')) {if(write)throw error;return null;}
    }
  }
  if(actor) {
    if(actor.kind!=='session'||actor.id!==owner) {
      if(write)throw fail(403,'FORBIDDEN','此登录身份无权修改该公开工作区');
      return null;
    }
    requireAdmin(actor);
    if(write)requireCsrf(request,actor,origin);
    return actor;
  }
  if(env.PUBLIC_BUSINESS_MODE!=='1') {
    if(write)throw fail(401,'UNAUTHORIZED','请先登录');
    return null;
  }
  if(write) {
    requireOrigin(request,origin);
    if(request.headers.get('X-Public-Business')!=='1')throw fail(403,'CSRF','公开写入需要同源业务请求');
  }
  return Object.freeze({id:owner,actor:'public-'+module+':'+owner,kind:'public',scope:Object.freeze([]),
    permissions:Object.freeze(['read','write'])});
}
export function noteDraftScope(owner) {
  const value=digest('public-memo-drafts:'+owner);
  return value.slice(0,8)+'-'+value.slice(8,12)+'-'+value.slice(12,16)+'-'+value.slice(16,20)+'-'+value.slice(20,32);
}
export function limitNoteWrites(owner,module,time=Date.now()) {
  const key=module+':'+owner,day=Math.floor(time/86400000),minute=Math.floor(time/60000);
  let bucket=buckets.get(key);
  if(!bucket||bucket.day!==day)bucket={day,minute,count:0,daily:0};
  if(bucket.minute!==minute){bucket.minute=minute;bucket.count=0;}
  if(bucket.count>=60||bucket.daily>=2000)throw fail(429,module==='notes'?'NOTES_RATE_LIMIT':module==='ai-reports'?'AI_REPORTS_RATE_LIMIT':'MEMOS_RATE_LIMIT','保存过于频繁，请保留草稿后稍后再试');
  bucket.count++;bucket.daily++;buckets.delete(key);buckets.set(key,bucket);
  while(buckets.size>64)buckets.delete(buckets.keys().next().value);
}
