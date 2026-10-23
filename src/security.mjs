import { timingSafeEqual } from 'node:crypto';
import { fail,digest,csrfFor,checkCsrf,checkOrigin } from '../shared/auth.mjs';
import { statement } from './storage.mjs';
import {LOGIN_WINDOW_MS,LOGIN_FAILURE_PREFIX,trustedLoginPeer,loginRemainingWait,loginWindowWait,rejectLogin} from './lib/login-backoff.mjs';
export {fail,digest,csrfFor};
export const now=()=>new Date().toISOString();
export const reqHeaders=request=>({headers:Object.fromEntries(request.headers)});
export const requireOrigin=(request,origin)=>checkOrigin(reqHeaders(request),origin);
export const requireCsrf=(request,actor,origin)=>checkCsrf(reqHeaders(request),actor,origin);
export function requireAdmin(actor) { if(actor.kind!=='session') throw fail(403,'FORBIDDEN','此操作仅限网站管理员'); }
export function equalSecret(a,b) {
  if(typeof a!=='string'||typeof b!=='string') return false;
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length&&timingSafeEqual(x,y);
}
export function originFor(env) {
  let url;
  try { url=new URL(env.SITE_ORIGIN); } catch { throw fail(503,'CONFIGURATION','需要设置 SITE_ORIGIN'); }
  if(url.origin!==env.SITE_ORIGIN||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))
    throw fail(503,'CONFIGURATION','SITE_ORIGIN 需要精确的 HTTPS 来源地址');
  return url.origin;
}
export async function bodyFor(request) {
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||'')) throw fail(415,'CONTENT_TYPE','请使用 application/json');
  const reader=request.body?.getReader();
  let size=0;const chunks=[];
  if(reader) try {
    for(;;) {
      const {done,value}=await reader.read();if(done) break;
      size+=value.byteLength;
      if(size>262144) {await reader.cancel();throw fail(413,'BODY_TOO_LARGE','提交内容超过 256KB');}
      chunks.push(Buffer.from(value));
    }
  } finally {reader.releaseLock();}
  let input;
  try {input=JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {throw fail(400,'INVALID_JSON','JSON 格式无效');}
  if(!input||typeof input!=='object'||Array.isArray(input)) throw fail(400,'INVALID_JSON','请求内容应为 JSON 对象');
  return input;
}
export async function authenticate(store,request,permission='read') {
  const authorization=request.headers.get('authorization');
  let actor;
  if(authorization) {
    const match=/^Bearer (hdy_[a-f0-9]{64})$/.exec(authorization);
    if(!match) throw fail(401,'UNAUTHORIZED','授权凭证无效');
    const tokenHash=digest(match[1]);
    const row=await store.get('SELECT * FROM api_keys WHERE token_hash=? AND revoked_at IS NULL',tokenHash);
    if(!row) throw fail(401,'UNAUTHORIZED','授权凭证无效或已撤销');
    actor={id:row.id,actor:'key:'+row.id,kind:'key',tokenHash,lastUsedAt:row.last_used_at,scope:JSON.parse(row.account_ids_json),permissions:JSON.parse(row.permissions_json),scopeJson:row.account_ids_json,permissionsJson:row.permissions_json};
  } else {
    const token=/(?:^|;\s*)matrix_session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('cookie')||'')?.[1];
    if(token) {
      const tokenHash=digest(token);
      const row=await store.get('SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',tokenHash,now());
      if(row) actor={...row,actor:'user:'+row.id,kind:'session',scope:null,permissions:['read','write'],token,tokenHash};
    }
  }
  if(!actor) throw fail(401,'UNAUTHORIZED','请先登录');
  if(!actor.permissions.includes(permission)) throw fail(403,'FORBIDDEN','此凭证没有所需的读写权限');
  return actor;
}
export function sessionCookie(token,origin) {
  return 'matrix_session='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+(token?'604800':'0')+(origin.startsWith('https:')?'; Secure':'');
}
export async function throttleLogin(db,username,request,env) {
  // Sites dispatch's forwarding contract is not yet confirmed. Default to a
  // shared aggregate bucket and username bucket; spoofed headers never grant
  // extra attempts. Opt-in requires a separately verified edge contract.
  const trustedPeer=trustedLoginPeer(request,env);
  if(trustedPeer) return throttleTrustedLogin(db,username,trustedPeer);
  const peer='shared-unverified-edge';
  const buckets=['ip:'+digest(peer),digest(peer+':'+username)],time=Date.now(),start=time-900000;
  const statements=[];
  for(const bucket of buckets) statements.push(statement(db,
    'INSERT INTO login_attempts(bucket,attempts,window_start) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END',bucket,time,start,start));
  statements.push(statement(db,'SELECT bucket,attempts FROM login_attempts WHERE bucket IN (?,?)',...buckets));
  statements.push(statement(db,'DELETE FROM login_attempts WHERE window_start<?',start));
  const results=await db.batch(statements),rows=results[2].results;
  if(rows.some(row=>row.attempts>(row.bucket===buckets[0]?100:10))) throw fail(429,'RATE_LIMITED','尝试次数过多，请稍后再试');
  return buckets[1];
}
async function throttleTrustedLogin(db,username,peer) {
  const time=Date.now(),start=time-LOGIN_WINDOW_MS,ipBucket='ip:'+digest(peer);
  const failureBucket=LOGIN_FAILURE_PREFIX+digest(peer+':'+username);
  const results=await db.batch([
    statement(db,'INSERT INTO login_attempts(bucket,attempts,window_start) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END',ipBucket,time,start,start),
    statement(db,'SELECT bucket,attempts,window_start FROM login_attempts WHERE bucket IN (?,?)',ipBucket,failureBucket),
    statement(db,'DELETE FROM login_attempts WHERE window_start<?',start),
  ]);
  const rows=results[1].results,ip=rows.find(row=>row.bucket===ipBucket);
  if(!ip||ip.attempts>100) rejectLogin(loginWindowWait(ip?.window_start,time));
  const wait=loginRemainingWait(rows.find(row=>row.bucket===failureBucket),time);
  if(wait) rejectLogin(wait);
  return failureBucket;
}
export async function recordLoginFailure(db,bucket) {
  // The legacy unverified path already counted this attempt before hashing.
  if(!bucket.startsWith(LOGIN_FAILURE_PREFIX)) return;
  const time=Date.now(),start=time-LOGIN_WINDOW_MS;
  const row=await statement(db,
    'INSERT INTO login_attempts(bucket,attempts,window_start) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN window_start<=? THEN 1 ELSE attempts+1 END,window_start=excluded.window_start RETURNING attempts,window_start',bucket,time,start).first();
  const wait=loginRemainingWait(row,time);
  if(wait) rejectLogin(wait);
}
export function stable(v) {return Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;}
