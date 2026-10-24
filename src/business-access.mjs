// A public actor is attached only after the explicit business-route allowlist.
// Private authentication/admin checks never consult this request-local context.
import {authenticate, requireAdmin, requireCsrf, requireOrigin, fail} from './security.mjs';

const requests=new WeakMap(),actors=new WeakSet();
export function registerPublicBusiness(request,actor) {requests.set(request,actor);actors.add(actor);}
export async function authenticateBusiness(store,request,permission='read') {
  const actor=requests.get(request);
  if(!actor) return authenticate(store,request,permission);
  if(!actor.permissions.includes(permission)) throw fail(403,'FORBIDDEN','此操作需要业务权限');
  return actor;
}
export function requireBusinessUser(actor) {if(!actors.has(actor)) requireAdmin(actor);}
export function requireBusinessCsrf(request,actor,origin) {
  if(!actors.has(actor)) return requireCsrf(request,actor,origin);
  requireOrigin(request,origin);
  if(request.headers.get('X-Public-Business')!=='1') throw fail(403,'CSRF','公开写入需要同源业务请求');
}
