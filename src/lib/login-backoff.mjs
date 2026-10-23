import {isIP} from 'node:net';
import {fail} from './errors.mjs';

export const LOGIN_WINDOW_MS=900000;
export const LOGIN_FAILURE_PREFIX='login-failure:';
const retrySeconds=new WeakMap();

export function trustedLoginPeer(request,env) {
  if(env.TRUST_CF_CONNECTING_IP!=='1') return null;
  const candidate=request.headers.get('cf-connecting-ip'),kind=isIP(candidate||'');
  if(kind===4) return candidate;
  if(kind===6) {
    try {return new URL('http://['+candidate+']/').hostname.slice(1,-1);}
    catch {return null;}
  }
  return null;
}
export function loginFailureDelay(attempts) {
  if(!Number.isSafeInteger(attempts)||attempts<0) return 900;
  return attempts<5?0:Math.min(900,2**Math.min(10,attempts-4));
}
export function loginRemainingWait(row,time) {
  if(!row) return 0;
  if(!Number.isSafeInteger(time)||!Number.isSafeInteger(row.window_start)||row.window_start<0) return 900;
  if(row.window_start<=time-LOGIN_WINDOW_MS) return 0;
  const seconds=loginFailureDelay(row.attempts);
  return seconds?Math.min(900,Math.max(0,Math.ceil((row.window_start+seconds*1000-time)/1000))):0;
}
export function loginWindowWait(start,time) {
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(time)) return 900;
  return Math.min(900,Math.max(1,Math.ceil((start+LOGIN_WINDOW_MS-time)/1000)));
}
export function rejectLogin(seconds) {
  const delay=Number.isInteger(seconds)&&seconds>=1&&seconds<=900?seconds:900;
  // Decorate only the canonical fresh Error, without changing its JSON contract
  // or trusting properties on an arbitrary thrown value. Weak keys cannot leak
  // one request's header metadata into another request or retain old Errors.
  try {fail(429,'RATE_LIMITED','尝试次数过多，请稍后再试');}
  catch(error) {retrySeconds.set(error,delay);throw error;}
}
export const loginRetryAfter=error=>retrySeconds.get(error)??900;
