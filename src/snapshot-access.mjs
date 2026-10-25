import {authenticate,digest,fail} from './security.mjs';
import {limitPublicBusiness} from './public-business.mjs';

const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function configuredOwner(value) {
  if(typeof value!=='string'||!uuid.test(value))fail(503,'SNAPSHOT_CONFIG','快照的明确数据归属尚未配置');
  return value.toLowerCase();
}
async function publicAccounts(store,env,ownerId) {
  let configured;
  try {configured=JSON.parse(env.PUBLIC_BUSINESS_ACCOUNT_IDS);}catch {}
  if(!Array.isArray(configured)||configured.length>50||new Set(configured).size!==configured.length||
    configured.some(id=>typeof id!=='string'||!id||id.length>100))fail(503,'SNAPSHOT_CONFIG','快照账号范围尚未配置');
  const actor='public:'+ownerId;
  const removed=await store.all("SELECT DISTINCT entity_id AS id FROM matrix_audit WHERE actor=? AND action='DELETE /accounts/'||entity_id AND entity_id IN (SELECT value FROM json_each(?)) LIMIT 51",actor,JSON.stringify(configured));
  const added=await store.all("SELECT DISTINCT c.entity_id AS id FROM matrix_audit c WHERE c.actor=? AND c.action='POST /accounts' AND NOT EXISTS(SELECT 1 FROM matrix_audit d WHERE d.actor=c.actor AND d.entity_id=c.entity_id AND d.action='DELETE /accounts/'||c.entity_id) LIMIT 51",actor);
  const deleted=new Set(removed.map(row=>row.id));
  const ids=[...new Set([...configured.filter(id=>!deleted.has(id)),...added.map(row=>row.id)])].sort();
  if(ids.length>50)fail(413,'SNAPSHOT_LIMIT','快照账号范围超过完整读取预算');
  const found=await store.all('SELECT id FROM matrix_accounts WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id LIMIT 51',JSON.stringify(ids));
  if(found.length!==ids.length)fail(503,'SNAPSHOT_CONFIG','快照账号范围无法完整核实');
  return ids;
}
export function snapshotAccess(request,env) {
  if(request.headers.has('authorization'))fail(403,'SNAPSHOT_SESSION_REQUIRED','组合快照不接受 API key，请使用既有公开入口或所有者登录');
  const ownerId=configuredOwner(env.PUBLIC_BUSINESS_USER_ID),notesOwnerId=configuredOwner(env.DAILY_NOTES_OWNER_ID);
  let authenticated=false,limited=false,firstScope=null;
  if(env.PUBLIC_BUSINESS_MODE==='1'&&!/(?:^|;\s*)matrix_session=/.test(request.headers.get('cookie')||'')) {
    limitPublicBusiness(env.SITE_ORIGIN+':'+ownerId,false);limited=true;
  }
  async function resolve(store) {
    let actor;
    try {actor=await authenticate(store,request);}catch(error) {
      if(error.status!==401||authenticated||env.PUBLIC_BUSINESS_MODE!=='1')throw error;
    }
    if(actor) {
      if(actor.kind!=='session'||actor.id!==ownerId)fail(403,'FORBIDDEN','组合快照仅接受明确所有者的真实登录');
      authenticated=true;
    }else if(!limited) {
      limitPublicBusiness(env.SITE_ORIGIN+':'+ownerId,false);limited=true;
    }
    const required=[...new Set([ownerId,notesOwnerId])];
    const owners=await store.all('SELECT id FROM matrix_users WHERE id IN (SELECT value FROM json_each(?))',JSON.stringify(required));
    if(owners.length!==required.length)fail(503,'SNAPSHOT_CONFIG','快照数据归属无法核实');
    const accountIds=actor?(await store.all('SELECT id FROM matrix_accounts ORDER BY id LIMIT 51')).map(row=>row.id):
      await publicAccounts(store,env,ownerId);
    if(accountIds.length>50)fail(413,'SNAPSHOT_LIMIT','快照账号范围超过完整读取预算');
    const mode=actor?'owner_session':'public';
    const scope_id=digest(JSON.stringify(['haoduoyu-snapshot-scope-v1',mode,ownerId,notesOwnerId,accountIds]));
    if(firstScope!==null&&firstScope!==scope_id)fail(409,'SNAPSHOT_SCOPE_CHANGED','读取期间数据范围发生变化，请重新建立日期清单，不要按删除处理');
    firstScope=scope_id;
    return {ownerId,notesOwnerId,accountIds,mode,scope_id};
  }
  async function recheck(store) {
    if(authenticated) {
      const actor=await authenticate(store,request);
      if(actor.kind!=='session'||actor.id!==ownerId)fail(403,'FORBIDDEN','快照登录范围已变化');
    }
  }
  return {resolve,recheck};
}
