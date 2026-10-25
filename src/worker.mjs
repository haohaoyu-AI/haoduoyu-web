import { randomUUID,randomBytes } from 'node:crypto';
import { hashPassword,verifyPassword } from '../shared/auth.mjs';
import { createRecords } from './records.mjs';
import { ensureControl,storeFor,mutate,consistentRead,statement } from './storage.mjs';
import { fail,digest,csrfFor,now,originFor,bodyFor,authenticate,requireAdmin,requireOrigin,requireCsrf,equalSecret,sessionCookie,throttleLogin,recordLoginFailure,stable } from './security.mjs';
import { assets } from './assets.generated.mjs';
import { exportBackup } from './backup.mjs';
import { matchesIfNoneMatch } from './lib/http.mjs';
import { overviewCache } from './overview-cache.mjs';
import { requestTrace,traceRoute,withRequestId,logServerFailure } from './lib/request-trace.mjs';
import {loginRetryAfter} from './lib/login-backoff.mjs';
import {handleTodos} from './todos.mjs';
import {handleTodoTemplates} from './todo-templates.mjs';
import {handleTodoPreferences} from './todo-preferences.mjs';
import {publicBusinessAccess,publicArticle,requirePublicAccount,publicBusinessResult} from './public-business.mjs';
import {requireBusinessCsrf} from './business-access.mjs';
import {deletePublicBusiness} from './public-business-delete.mjs';
import {publicBusinessDocs} from './public-business-docs.mjs';
import {handleNotionSnapshot} from './notion-snapshot.mjs';
import {handleDailyNotes} from './daily-notes.mjs';
import {handleMemos} from './memos.mjs';
import {validateArticleStatusQuery,validateArticleInputComplexity,rethrowArticlePipelineConflict} from './article-pipeline-io.mjs';
import {upsertArticle,authorizeArticleUpsert} from './article-upsert.mjs';
import {validateArticlePipelineQueryMultiplicity} from './article-pipeline-query.mjs';

const prefix='/api/v1';
const revalidatedStatic=new Set(['/app.js','/style.css','/memos.css','/favicon.svg','/openapi.json']);
const writing=new Set(['POST','PUT','PATCH','DELETE']);
const articleWriting=(method,route)=>(method==='POST'||method==='PATCH')&&route==='/articles'||method==='PUT'&&/^\/articles\/[^/]+$/.test(route);
const dummyHash='scrypt$32768$8$1$00112233445566778899aabbccddeeff$'+'00'.repeat(64);
const json=(data,status=200,headers={})=>Response.json({data},{status,headers});
const csv=value=>{let text=value==null?'':String(value);if(/^[\s]*[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};

async function bootstrap(db,request,env,origin) {
  const secret=env.MATRIX_BOOTSTRAP_SECRET;
  if(typeof secret!=='string'||secret.length<32) throw fail(404,'NOT_FOUND','接口不存在');
  requireOrigin(request,origin);
  const received=request.headers.get('authorization')?.replace(/^Bearer /,'');
  if(!equalSecret(received,secret)) throw fail(401,'UNAUTHORIZED','初始化授权无效');
  const input=await bodyFor(request);
  if(typeof input.username!=='string'||!/^[a-zA-Z0-9_.@-]{3,80}$/.test(input.username)) throw fail(400,'INVALID_USERNAME','账号需要 3 至 80 个字母、数字或 . _ @ -');
  const passwordHash=await hashPassword(input.password),id=randomUUID(),stamp=now();
  return (await mutate(db,async store=>{
    const control=await store.get('SELECT initialized FROM matrix_control WHERE id=1');
    if(control.initialized||(await store.get('SELECT count(*) AS n FROM users')).n) throw fail(409,'SETUP_COMPLETE','初始化已完成');
    store.queue('UPDATE matrix_control SET setup_guard=CASE WHEN initialized=0 AND NOT EXISTS(SELECT 1 FROM users) THEN 1 ELSE 0 END WHERE id=1');
    store.queue('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)',id,input.username,passwordHash,stamp);
    for(const [accountId,platform,name] of [['toutiao-haoduoyu','toutiao','好多鱼'],['zhihu-haoduoyu','zhihu','好多鱼'],['wechat-xiaoyuer','wechat','小鱼儿真保鲜']])
      store.queue('INSERT INTO accounts(id,platform,name,active,created_at) VALUES(?,?,?,1,?)',accountId,platform,name,stamp);
    store.queue('UPDATE matrix_control SET initialized=1 WHERE id=1');
    store.audit('user:'+id,'auth.bootstrap',id);
    return {response:json({initialized:true,username:input.username},201)};
  })).response;
}

async function login(db,request,env,origin) {
  requireOrigin(request,origin);
  const input=await bodyFor(request);
  if(typeof input.username!=='string'||input.username.length>80||typeof input.password!=='string'||input.password.length>256) throw fail(401,'INVALID_CREDENTIALS','账号或密码错误');
  const bucket=await throttleLogin(db,input.username,request,env);
  const user=await storeFor(db).get('SELECT * FROM users WHERE username=?',input.username);
  const valid=await verifyPassword(input.password,user?.password_hash||dummyHash);
  if(!user||!valid) {
    await recordLoginFailure(db,bucket);
    throw fail(401,'INVALID_CREDENTIALS','账号或密码错误');
  }
  const token=randomBytes(32).toString('hex'),tokenHash=digest(token);
  return (await mutate(db,async store=>{
    const current=await store.get('SELECT password_hash FROM users WHERE id=?',user.id);
    if(current?.password_hash!==user.password_hash) throw fail(401,'INVALID_CREDENTIALS','账号或密码错误');
    store.queue('UPDATE matrix_control SET auth_guard=CASE WHEN EXISTS(SELECT 1 FROM users WHERE id=? AND password_hash=?) THEN 1 ELSE 0 END WHERE id=1',user.id,user.password_hash);
    store.queue('DELETE FROM sessions WHERE expires_at<=?',now());
    store.queue('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',tokenHash,user.id,new Date(Date.now()+604800000).toISOString());
    store.queue('DELETE FROM login_attempts WHERE bucket=?',bucket);
    store.audit('user:'+user.id,'auth.login');
    return {response:json({username:user.username,csrfToken:csrfFor(token)},200,{'Set-Cookie':sessionCookie(token,origin)})};
  })).response;
}

async function protectedRead(db,request,route,query,initialRevision,publicActor=null) {
  let readActor,attemptTicket=null,attemptResponse=null;
  const abandon=async()=>{
    if(attemptTicket) await attemptTicket.abort();
    if(attemptResponse?.body) await attemptResponse.body.cancel().catch(()=>{});
    attemptTicket=null;attemptResponse=null;
  };
  try {
  const response=await consistentRead(db,async (store,before)=>{
    if(attemptTicket||attemptResponse) await abandon();
    const actor=publicActor||await authenticate(store,request),records=createRecords(store);
    readActor=actor;
    const articleMatch=/^\/articles\/([^/]+)$/.exec(route);
    if(route==='/auth/me') {requireAdmin(actor);return json({id:actor.id,username:actor.username,csrfToken:csrfFor(actor.token)});}
    if(route==='/accounts') return json(await records.listAccounts(actor.scope));
    if(route==='/articles') return Response.json(await records.articlePage(query,actor.scope));
    if(articleMatch) {
      const value=await records.getArticle(articleMatch[1],actor.scope);
      return json(publicActor?publicArticle(value):value);
    }
    if(route==='/due-reviews') return json(await records.dueReviews(query,actor.scope));
    if(route==='/observations') return json(await records.listObservations(query,actor.scope));
    if(route==='/daily-metrics') return json(await records.listDaily(query,actor.scope));
    if(route==='/dashboard') return json(await records.dashboard(query.account_id||null,actor.scope),200,{Deprecation:'true'});
    if(route==='/overview') {
      // Match the original records.overview default-time evaluation point.
      const at=Date.now(),key=overviewCache.key(db,before,query,actor);
      if(key) attemptTicket=overviewCache.get(key,at);
      if(attemptTicket) return null;
      let until;
      const value=await records.overview(query,actor.scope,at,deadline=>{until=deadline;});
      const text=JSON.stringify({data:value});
      if(key) attemptTicket=overviewCache.reserve(key,at,until,text);
      if(attemptTicket) return null;
      attemptResponse=new Response(text,{headers:{'Content-Type':'application/json'}});
      return attemptResponse;
    }
    if(route==='/api-keys') {
      requireAdmin(actor);
      return json((await store.all('SELECT id,name,account_ids_json,permissions_json,created_at,revoked_at,last_used_at FROM api_keys ORDER BY created_at DESC')).map(({account_ids_json,permissions_json,...row})=>({...row,account_ids:JSON.parse(account_ids_json),permissions:JSON.parse(permissions_json)})));
    }
    if(route==='/audit') {requireAdmin(actor);return json((await store.all("SELECT log.*,article.title AS entity_label FROM audit AS log LEFT JOIN articles AS article ON article.id=log.entity_id AND (log.action IN ('POST /articles','PATCH /articles','article.create','article.update') OR log.action='PUT /articles/'||article.id) ORDER BY log.created_at DESC,log.rowid DESC LIMIT 200")).map(({detail_json,...row})=>({...row,detail:JSON.parse(detail_json)})));}
    if(route==='/backup') {
      requireAdmin(actor);
      const backup=await exportBackup(db,{todoUserId:actor.id});
      return json(backup,200,{'Content-Disposition':'attachment; filename="haoduoyu-matrix-backup.json"'});
    }
    if(route==='/export') {
      if(!publicActor) requireAdmin(actor);
      const rows=await records.listArticles({},publicActor?actor.scope:null),cols=['id','account_name','platform','title','url','published_at','started_at','duration_seconds','production_mode','summary','notes'];
      return new Response('\uFEFF'+[cols.map(csv).join(','),...rows.map(row=>cols.map(col=>csv(row[col])).join(','))].join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="haoduoyu-articles.csv"'}});
    }
    throw fail(404,'NOT_FOUND','接口不存在');
  },initialRevision);
  // Informational usage metadata only. It changes no permission or business fact.
  const usedAt=now(),cutoff=new Date(Date.parse(usedAt)-300000).toISOString();
  if(readActor.kind==='key'&&(readActor.lastUsedAt===null||Date.parse(readActor.lastUsedAt)<Date.parse(cutoff)))
    await statement(db,'UPDATE api_keys SET last_used_at=? WHERE id=? AND token_hash=? AND revoked_at IS NULL AND (last_used_at IS NULL OR last_used_at<?)',usedAt,readActor.id,readActor.tokenHash,cutoff).run();
  if(attemptTicket) {
    const result=attemptTicket.response();
    attemptTicket.publish(Date.now());attemptTicket=null;attemptResponse=null;
    return result;
  }
  attemptResponse=null;
  return response;
  } catch(error) {await abandon();throw error;}
}

async function protectedWrite(db,request,route,env,origin,trace,publicActor=null) {
  // Authorize before reading a possibly large body or performing a slow KDF.
  const first=publicActor||await authenticate(storeFor(db),request,'write');
  requireBusinessCsrf(request,first,origin);
  if(route==='/auth/logout'&&request.method==='POST') return (await mutate(db,async store=>{
    const actor=await authenticate(store,request,'write');requireAdmin(actor);requireCsrf(request,actor,origin);
    store.queue('DELETE FROM sessions WHERE token_hash=?',actor.tokenHash);store.audit(actor.actor,'auth.logout');
    return {actor,response:json({logged_out:true},200,{'Set-Cookie':sessionCookie('',origin)})};
  })).response;
  const input=request.method==='DELETE'&&/^\/api-keys\/[^/]+$/.test(route)?{}:await bodyFor(request);
  if(articleWriting(request.method,route))validateArticleInputComplexity(input);
  let passwordProof,newHash;
  if(route==='/auth/password'&&request.method==='PUT') {
    requireAdmin(first);
    passwordProof=(await storeFor(db).get('SELECT password_hash FROM users WHERE id=?',first.id))?.password_hash;
    if(!await verifyPassword(input.currentPassword,passwordProof)) throw fail(403,'INVALID_CREDENTIALS','当前密码错误');
    newHash=await hashPassword(input.newPassword);
  }
  const key=request.headers.get('idempotency-key');
  if(key!==null&&!/^[A-Za-z0-9_.:-]{1,160}$/.test(key)) throw fail(400,'VALIDATION','Idempotency-Key 格式无效');
  const requestHash=digest(request.method+':'+prefix+route+':'+JSON.stringify(stable(input)));
  const result=await mutate(db,async store=>{
    const actor=publicActor||await authenticate(store,request,'write');requireBusinessCsrf(request,actor,origin);
    const records=createRecords(store),method=request.method;
    const articleMatch=/^\/articles\/([^/]+)$/.exec(route),accountMatch=/^\/accounts\/([^/]+)$/.exec(route),keyMatch=/^\/api-keys\/([^/]+)$/.exec(route);
    if(route==='/auth/password'&&method==='PUT') {
      requireAdmin(actor);
      const current=await store.get('SELECT password_hash FROM users WHERE id=?',actor.id);
      if(current?.password_hash!==passwordProof) throw fail(409,'CONFLICT','密码已修改，请重新登录');
      store.queue('UPDATE users SET password_hash=? WHERE id=? AND password_hash=?',newHash,actor.id,passwordProof);store.expectChange();
      store.queue('DELETE FROM sessions WHERE user_id=?',actor.id);store.audit(actor.actor,'auth.password_changed');
      return {actor,response:json({changed:true,login_required:true},200,{'Set-Cookie':sessionCookie('',origin)})};
    }
    if(route==='/api-keys'&&method==='POST') {
      requireAdmin(actor);
      if(typeof input.name!=='string'||!input.name.trim()||input.name.length>80||!Array.isArray(input.account_ids)||input.account_ids.length<1||input.account_ids.length>100||!Array.isArray(input.permissions)||!input.permissions.length||input.permissions.some(p=>!['read','write'].includes(p))) throw fail(400,'VALIDATION','请填写凭证名称、运营账号与读写权限');
      const ids=[...new Set(input.account_ids)],permissions=[...new Set(input.permissions)];
      if(ids.some(id=>typeof id!=='string')||(await store.all('SELECT id FROM accounts WHERE id IN (SELECT value FROM json_each(?))',JSON.stringify(ids))).length!==ids.length) throw fail(400,'VALIDATION','授权账号不存在');
      const id=randomUUID(),token='hdy_'+randomBytes(32).toString('hex'),created=now();
      store.queue('INSERT INTO api_keys(id,name,token_hash,account_ids_json,permissions_json,created_at) VALUES(?,?,?,?,?,?)',id,input.name.trim(),digest(token),JSON.stringify(ids),JSON.stringify(permissions),created);
      store.audit(actor.actor,'api_key.created',id,{account_ids:ids,permissions});
      return {actor,response:json({id,name:input.name.trim(),token,account_ids:ids,permissions,created_at:created},201)};
    }
    if(keyMatch&&method==='DELETE') {
      requireAdmin(actor);
      if(!await store.get('SELECT id FROM api_keys WHERE id=? AND revoked_at IS NULL',keyMatch[1])) throw fail(404,'NOT_FOUND','凭证不存在或已撤销');
      store.queue('UPDATE api_keys SET revoked_at=? WHERE id=? AND revoked_at IS NULL',now(),keyMatch[1]);store.expectChange();
      store.audit(actor.actor,'api_key.revoked',keyMatch[1]);return {actor,response:json({revoked:true})};
    }
    let action;
    if(method==='POST'&&route==='/accounts') {
      if(!publicActor) requireAdmin(actor);
      else requirePublicAccount(actor);
      action=b=>records.createAccount(b);
    }
    if(method==='PUT'&&accountMatch) {
      if(!publicActor) requireAdmin(actor);
      else requirePublicAccount(actor,accountMatch[1]);
      action=b=>records.updateAccount(accountMatch[1],b);
    }
    if(method==='POST'&&route==='/articles') action=b=>records.createArticle(b,actor.scope);
    if(method==='PUT'&&articleMatch) action=b=>records.updateArticle(articleMatch[1],b,actor.scope);
    const pipelineUpsert=method==='PATCH'&&route==='/articles';
    if(pipelineUpsert) {
      await authorizeArticleUpsert(records,input,actor.scope);
      action=b=>upsertArticle(store,records,b,actor.scope);
    }
    if(method==='POST'&&route==='/observations') action=b=>records.createObservation(b,actor.scope);
    if(method==='POST'&&route==='/daily-metrics') action=b=>records.upsertDaily(b,actor.scope);
    if(!action) throw fail(404,'NOT_FOUND','接口不存在');
    if(key) {
      const saved=await store.get('SELECT * FROM idempotency WHERE actor=? AND key=?',actor.actor,key);
      if(saved) {
        if(saved.request_hash!==requestHash) throw fail(409,'IDEMPOTENCY_CONFLICT','同一幂等键已经用于不同内容');
        const payload={data:JSON.parse(saved.response_json)};
        if(saved.status>=400) payload.request_id=trace.rid;
        return {replayed:true,response:Response.json(payload,{status:saved.status})};
      }
    }
    const planned=await action(input);
    const value=pipelineUpsert?{...planned.value,upsert_action:planned.unchanged?'unchanged':planned.created?'created':'updated'}:planned;
    const status=method==='POST'||pipelineUpsert&&planned.created?201:200;
    if(pipelineUpsert&&planned.unchanged&&!key)return {replayed:true,response:json(value,status)};
    if(!pipelineUpsert||!planned.unchanged)store.audit(actor.actor,method+' '+route,value?.id||null,{fields:Object.keys(input)});
    if(key) store.queue('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,?,?)',actor.actor,key,requestHash,JSON.stringify(value),status,now());
    if(actor.kind==='key') store.queue('UPDATE api_keys SET last_used_at=? WHERE id=?',now(),actor.id);
    return {actor,response:json(value,status)};
  }).catch(error=>{
    if(articleWriting(request.method,route))rethrowArticlePipelineConflict(error);
    throw error;
  });
  return result.response;
}

async function handle(request,env,trace) {
  const url=new URL(request.url),path=url.pathname,method=request.method;
  trace.route=traceRoute(path);
  if(path==='/health'&&method==='GET') return json({status:'ok',application:'haoduoyu-matrix'});
  // No app handlers are registered for dispatch-owned sign-in/callback routes.
  if(path.startsWith(prefix+'/')) {
    if(!env.DB) throw fail(503,'CONFIGURATION','D1 绑定未配置');
    const origin=originFor(env),db=env.DB,route=path.slice(prefix.length);
    if(route==='/bootstrap'&&method==='POST') {await ensureControl(db);return bootstrap(db,request,env,origin);}
    const access=await publicBusinessAccess(db,request,route,env,origin);
    const state=await db.prepare('SELECT initialized,revision FROM matrix_control WHERE id=1').first();
    if(state?.initialized!==1) throw fail(503,'SETUP_REQUIRED',state?.initialized===2?'数据库恢复未完成，服务保持隔离':'请先完成管理员初始化');
    if(route==='/daily-notes'||route.startsWith('/daily-notes/'))
      return handleDailyNotes(db,request,route,env,origin,state.revision);
    if(route==='/memos'||route.startsWith('/memos/'))
      return handleMemos(db,request,route,env,origin,state.revision);
    if(route==='/integrations/notion/snapshot'&&method==='POST')
      return json(await handleNotionSnapshot(db,request,env,origin));
    if(method==='GET'&&route==='/overview' && url.searchParams.getAll('period').length>1) throw fail(400,'VALIDATION_ERROR','period 只能提供一次');
    if(method==='GET'&&route==='/articles') {
      validateArticleStatusQuery(url.searchParams);
      validateArticlePipelineQueryMultiplicity(url.searchParams);
    }
    if(access) {
      request=access.request;
      if(route==='/auth/me') return json({id:'public-business',username:'公开编辑',publicBusiness:true});
      if(route==='/todos'||route.startsWith('/todos/')) return handleTodos(db,request,route,origin,state.revision);
      if(route==='/todo-templates'||route.startsWith('/todo-templates/')) return handleTodoTemplates(db,request,route,origin,state.revision);
      if(route==='/todo-preferences') return handleTodoPreferences(db,request,origin,state.revision);
      if(method==='DELETE') return deletePublicBusiness(db,request,route,access.actor);
      if(method==='GET') return publicBusinessResult(protectedRead(db,request,route,Object.fromEntries(url.searchParams),state.revision,access.actor));
      return publicBusinessResult(protectedWrite(db,request,route,env,origin,trace,access.actor));
    }
    if(route==='/auth/login'&&method==='POST') return login(db,request,env,origin);
    if(route==='/todos'||route.startsWith('/todos/')) return handleTodos(db,request,route,origin,state.revision);
    if(route==='/todo-templates'||route.startsWith('/todo-templates/')) return handleTodoTemplates(db,request,route,origin,state.revision);
    if(route==='/todo-preferences') return handleTodoPreferences(db,request,origin,state.revision);
    if(method==='GET') {
      return protectedRead(db,request,route,Object.fromEntries(url.searchParams),state.revision);
    }
    if(writing.has(method)) return protectedWrite(db,request,route,env,origin,trace);
    await authenticate(storeFor(db),request);
    throw fail(404,'NOT_FOUND','接口不存在');
  }
  if(!['GET','HEAD'].includes(method)) throw fail(404,'NOT_FOUND','页面不存在');
  let decoded;try {decoded=decodeURIComponent(path);} catch {throw fail(400,'VALIDATION','地址格式无效');}
  if(decoded.includes('\0')||decoded.includes('\\')||decoded.split('/').some(p=>p.startsWith('.'))) throw fail(404,'NOT_FOUND','文件不存在');
  const name=decoded==='/'?'index.html':decoded.slice(1),asset=Object.hasOwn(assets,name)?assets[name]:null;
  if(!asset) throw fail(404,'NOT_FOUND','文件不存在');
  const headers={'Content-Type':asset.type};
  if(revalidatedStatic.has(path)) {
    headers['Cache-Control']='no-cache';headers.ETag=asset.etag;
    if(matchesIfNoneMatch(request.headers.get('If-None-Match'),asset.etag))
      return new Response(null,{status:304,headers:{'Cache-Control':'no-cache',ETag:asset.etag}});
    headers['Content-Length']=String(asset.length);
  }
  const content=name==='api-docs'&&env.PUBLIC_BUSINESS_MODE==='1'?publicBusinessDocs(asset.content):asset.content;
  return new Response(method==='HEAD'?null:content,{headers});
}
export default {
  async fetch(request,env) {
    const trace=requestTrace(request.method);
    let response,caughtError,didThrow=false;
    try {response=await handle(request,env,trace);} catch(error) {
      caughtError=error;didThrow=true;
      try {
        const duplicate=/UNIQUE constraint failed/.test(String(error));
        const status=error.status||(duplicate?409:500),code=error.status?error.code:duplicate?'DUPLICATE':'INTERNAL_ERROR';
        const message=error.status?error.message:duplicate?'记录已存在，请检索后更新原记录':'服务暂时不可用';
        response=Response.json({error:{code,message},request_id:trace.rid},{status});
        if(status===429) response.headers.set('Retry-After',String(error.code==='NOTION_RATE_LIMIT'?error.notionRetryAfter:error.code==='NOTES_RATE_LIMIT'?60:loginRetryAfter(error)));
        if(status===503) response.headers.set('Retry-After','1');
      } catch {
        // Only the old error renderer failed; never inspect the secondary error.
        response=Response.json({error:{code:'INTERNAL_ERROR',message:'服务暂时不可用'},request_id:trace.rid},{status:500});
      }
    }
    response=withRequestId(response,trace);
    if(!response.headers.has('Cache-Control')) response.headers.set('Cache-Control','no-store');
    for(const [key,value] of Object.entries({
      'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
    })) response.headers.set(key,value);
    if(response.status===500) logServerFailure(trace,caughtError,!didThrow);
    return response;
  },
};
