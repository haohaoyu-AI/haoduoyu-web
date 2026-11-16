// Claude 连接器 (Claude 修改 2026-11-16): a remote MCP server so Claude can read and write 碎碎念 and 待办 from any device.
// Sign-in is OAuth with PKCE. The owner approves once on a page of this site while logged in; the access token is an
// ordinary api_keys row whose only permission is "mcp", so it opens /mcp and nothing else, and it can be revoked there.
// Every tool call is passed on to the site's own /api/v1 routes, so the same checks and limits apply.
import {randomUUID,createHash,randomBytes} from 'node:crypto';
import {authenticate,csrfFor,digest,fail,now,requireAdmin} from './security.mjs';
import {storeFor} from './storage.mjs';
import {beijingDay} from './lib/time.mjs';
import {periodChoices} from '../shared/todo-period.mjs';

export const MCP_PATHS=['/mcp','/oauth/register','/oauth/authorize','/oauth/token',
  '/.well-known/oauth-authorization-server','/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'];
const REDIRECTS=['https://claude.ai/api/mcp/auth_callback','https://claude.com/api/mcp/auth_callback'];
const CODE_MINUTES=10,PENDING='mcp-pending';
const hex=bytes=>randomBytes(bytes).toString('hex');
const b64url=buffer=>buffer.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const oauthError=(error,description,status=400)=>Response.json({error,error_description:description},{status});

export async function handleMcp(request,env,{origin,db,dispatch}) {
  const path=new URL(request.url).pathname,method=request.method;
  if(path==='/.well-known/oauth-protected-resource'||path==='/.well-known/oauth-protected-resource/mcp')
    return Response.json({resource:origin+'/mcp',authorization_servers:[origin],scopes_supported:['mcp'],resource_name:'好多鱼工作台'});
  if(path==='/.well-known/oauth-authorization-server')
    return Response.json({issuer:origin,authorization_endpoint:origin+'/oauth/authorize',token_endpoint:origin+'/oauth/token',
      registration_endpoint:origin+'/oauth/register',response_types_supported:['code'],grant_types_supported:['authorization_code'],
      code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],scopes_supported:['mcp']});
  if(path==='/oauth/register'&&method==='POST')return register(request);
  if(path==='/oauth/authorize'&&method==='GET')return consent(new URL(request.url).searchParams,origin);
  if(path==='/oauth/authorize'&&method==='POST')return approve(request,db,origin);
  if(path==='/oauth/token'&&method==='POST')return token(request,db);
  if(path==='/mcp')return mcp(request,db,origin,dispatch,env);
  throw fail(405,'METHOD_NOT_ALLOWED','不支持的请求方法');
}

// Dynamic client registration: any client may register, but only Claude's own callback addresses are accepted.
async function register(request) {
  let input;try {input=await request.json();} catch {return oauthError('invalid_client_metadata','JSON 格式无效');}
  const uris=Array.isArray(input?.redirect_uris)?input.redirect_uris:[];
  if(!uris.length||uris.some(uri=>!REDIRECTS.includes(uri)))return oauthError('invalid_redirect_uri','只接受 Claude 的回调地址');
  return Response.json({client_id:'claude-'+hex(8),client_id_issued_at:Math.floor(Date.now()/1000),client_name:String(input.client_name||'Claude').slice(0,80),
    redirect_uris:uris,grant_types:['authorization_code'],response_types:['code'],token_endpoint_auth_method:'none'},{status:201});
}
function authorizeParams(params) {
  const value=name=>params.get(name)||'';
  const out={client_id:value('client_id'),redirect_uri:value('redirect_uri'),state:value('state'),code_challenge:value('code_challenge'),
    code_challenge_method:value('code_challenge_method'),response_type:value('response_type')};
  if(!REDIRECTS.includes(out.redirect_uri))throw fail(400,'VALIDATION_ERROR','回调地址不是 Claude 的');
  if(out.response_type!=='code'||out.code_challenge_method!=='S256'||!/^[A-Za-z0-9_-]{43,128}$/.test(out.code_challenge)||
    !out.client_id||out.client_id.length>100||out.state.length>500)throw fail(400,'VALIDATION_ERROR','授权参数不完整');
  return out;
}
const page=(origin,body)=>new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="same-origin"><title>连接 Claude · 好多鱼工作台</title><style>body{font-family:system-ui,sans-serif;max-width:420px;margin:12vh auto;padding:0 20px;line-height:1.6;color:#2a2a2a}
h1{font-size:20px}ul{padding-left:20px}button{font-size:16px;padding:10px 22px;border-radius:999px;border:0;background:#a34a34;color:#fff}
.muted{color:#777;font-size:13px}a{color:#a34a34}</style></head><body>${body}</body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8',
  // The approve form ends in a redirect to Claude, which form-action has to allow.
  'Content-Security-Policy':`default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${REDIRECTS.map(uri=>new URL(uri).origin).join(' ')}; frame-ancestors 'none'; base-uri 'none'`}});
function consent(params,origin) {
  const input=authorizeParams(params);
  const hidden=Object.entries(input).map(([name,value])=>`<input type="hidden" name="${name}" value="${esc(value)}">`).join('');
  return page(origin,`<h1>让 Claude 连接好多鱼工作台？</h1><p>同意后，Claude 可以：</p><ul><li>读和写碎碎念</li><li>读和写待办（今日、未来待办）</li></ul>
<p class="muted">不能改密码、文章数据和设置。以后可以在网站的 API 凭证里撤销「Claude 连接器」。</p>
<form method="post" action="/oauth/authorize">${hidden}<button type="submit">同意并连接</button></form>
<p class="muted">需要先在这个浏览器里登录好多鱼工作台。</p>`);
}
async function approve(request,db,origin) {
  // The site sends Referrer-Policy: no-referrer, under which a browser may send "Origin: null" for its own form;
  // Sec-Fetch-Site, which a page cannot forge, then shows that the form was submitted from this site.
  const from=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');
  if(from!==origin&&!((from===null||from==='null')&&site==='same-origin'))throw fail(403,'CSRF','请从授权页面提交');
  const form=new URLSearchParams(await request.text()),input=authorizeParams(form);
  let actor=null;try {actor=await authenticate(storeFor(db),request);requireAdmin(actor);} catch {actor=null;}
  if(!actor)return page(origin,`<h1>请先登录</h1><p>在这个浏览器里<a href="/" target="_blank" rel="noopener">打开好多鱼工作台并登录</a>，再回到这一页点「同意并连接」。</p>
<form method="post" action="/oauth/authorize">${Object.entries(input).map(([n,v])=>`<input type="hidden" name="${n}" value="${esc(v)}">`).join('')}<button>我已登录，继续</button></form>`);
  const code=hex(32),stamp=now(),expires=new Date(Date.now()+CODE_MINUTES*60000).toISOString();
  await db.batch([
    db.prepare("DELETE FROM matrix_api_keys WHERE permissions_json LIKE ? AND created_at<?").bind(`["${PENDING}"%`,new Date(Date.now()-3600000).toISOString()),
    db.prepare('INSERT INTO matrix_api_keys(id,name,token_hash,account_ids_json,permissions_json,created_at) VALUES(?,?,?,?,?,?)')
      .bind(randomUUID(),'Claude 连接器（等待确认）',digest(code),'[]',JSON.stringify([PENDING,input.code_challenge,input.redirect_uri,expires,actor.id]),stamp),
  ]);
  const target=new URL(input.redirect_uri);target.searchParams.set('code',code);if(input.state)target.searchParams.set('state',input.state);
  return new Response(null,{status:302,headers:{Location:target.toString()}});
}
async function token(request,db) {
  const form=new URLSearchParams(await request.text()),code=form.get('code')||'',verifier=form.get('code_verifier')||'';
  if(form.get('grant_type')!=='authorization_code')return oauthError('unsupported_grant_type','只支持授权码');
  if(!/^[a-f0-9]{64}$/.test(code)||!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier))return oauthError('invalid_grant','授权码无效');
  const row=await db.prepare('SELECT id,token_hash,permissions_json FROM matrix_api_keys WHERE token_hash=? AND revoked_at IS NULL').bind(digest(code)).first();
  let pending=null;try {pending=JSON.parse(row?.permissions_json||'null');} catch {}
  if(!Array.isArray(pending)||pending[0]!==PENDING)return oauthError('invalid_grant','授权码无效或已使用');
  const [,challenge,redirect,expires,owner]=pending;
  if(Date.parse(expires)<Date.now())return oauthError('invalid_grant','授权码已过期，请重新连接');
  if(form.get('redirect_uri')&&form.get('redirect_uri')!==redirect)return oauthError('invalid_grant','回调地址不一致');
  if(b64url(createHash('sha256').update(verifier).digest())!==challenge)return oauthError('invalid_grant','PKCE 校验失败');
  const access='hdy_'+hex(32);
  // The code is single use: the row is turned into the real token in one guarded update.
  // The approving owner is kept with the token, so api_request can act as that owner and no one else.
  const result=await db.prepare("UPDATE matrix_api_keys SET token_hash=?,name='Claude 连接器',permissions_json=? WHERE id=? AND token_hash=?")
    .bind(digest(access),JSON.stringify(['mcp',...(typeof owner==='string'?['owner:'+owner]:[])]),row.id,row.token_hash).run();
  if(result.meta?.changes!==1)return oauthError('invalid_grant','授权码已使用');
  return Response.json({access_token:access,token_type:'Bearer',scope:'mcp'},{headers:{'Cache-Control':'no-store'}});
}

const TOOLS=[
  {name:'add_note',description:'写一条今天的碎碎念。category 为 life（生活，默认）或 work（工作）；labels 是已存在的自定义标签名。',
    inputSchema:{type:'object',properties:{text:{type:'string'},category:{type:'string',enum:['life','work']},labels:{type:'array',items:{type:'string'}}},required:['text']}},
  {name:'list_notes',description:'读某天的碎碎念（默认今天，北京时间）。',
    inputSchema:{type:'object',properties:{date:{type:'string',description:'YYYY-MM-DD'},category:{type:'string',enum:['life','work']}}}},
  {name:'add_todo',description:'加一条某天的待办（默认今天）。',
    inputSchema:{type:'object',properties:{text:{type:'string'},date:{type:'string',description:'YYYY-MM-DD'}},required:['text']}},
  {name:'list_todos',description:'读某天的待办（默认今天）。',inputSchema:{type:'object',properties:{date:{type:'string'}}}},
  {name:'complete_todo',description:'把某天的一条待办标为完成或未完成。',
    inputSchema:{type:'object',properties:{id:{type:'string'},date:{type:'string'},completed:{type:'boolean'}},required:['id']}},
  {name:'add_future_todo',description:'加一条未来待办：when 为大概时间或重复（this_week/next_week/this_month/next_month/every_week/every_month/none），due_date 为截止日。',
    inputSchema:{type:'object',properties:{text:{type:'string'},when:{type:'string',enum:['this_week','next_week','this_month','next_month','every_week','every_month','none']},
      due_date:{type:'string',description:'YYYY-MM-DD'}},required:['text']}},
  {name:'list_future_todos',description:'读全部未来待办（含大概时间、重复和截止日）。',inputSchema:{type:'object',properties:{}}},
  {name:'api_request',description:['以网站主人的身份调用网站自己的 /api/v1 接口，能读写网站上的所有内容。path 写 /api/v1 之后的部分。',
    '常用：/todos?date= · /unscheduled-todos · /note-entries?date=&category=（写入用 PUT /note-entries/{新uuid}，头 X-Note-Labels-Version: 3）·',
    '/daily-scores/{date} · /ai-reports · /work-reminders?date= · /review/articles · /review/playbooks · /review/notes · /review/ai ·',
    '/articles · /accounts · /observations · /daily-metrics。不开放：登录、密码、API 凭证、备份恢复、初始化。写之前先读一次，带上 version。'].join(''),
    inputSchema:{type:'object',properties:{method:{type:'string',enum:['GET','POST','PUT','PATCH','DELETE']},path:{type:'string'},
      body:{type:'object'},headers:{type:'object',description:'只接受 X-Note-Labels-Version、X-Note-Labels-Archive、Idempotency-Key'}},required:['method','path']}},
  {name:'delete_future_todo',description:'删除一条未来待办（可在网站上恢复）。',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id']}},
];
const text=(value,isError=false)=>({content:[{type:'text',text:typeof value==='string'?value:JSON.stringify(value,null,1)}],...(isError?{isError:true}:{})});

async function mcp(request,db,origin,dispatch,env) {
  const challenge={'WWW-Authenticate':`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`};
  if(!request.headers.get('authorization'))return Response.json({error:'unauthorized'},{status:401,headers:challenge});
  let key;try {key=await authenticate(storeFor(db),request,'mcp');}
  catch {return Response.json({error:'invalid_token'},{status:401,headers:challenge});}
  // Tokens from before owners were recorded act for the site's notes owner.
  const owner=key.permissions.find(value=>value.startsWith('owner:'))?.slice(6)||env.DAILY_NOTES_OWNER_ID||null;
  dispatch.owner=ownerDispatch(db,origin,dispatch.handle,owner);
  if(request.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST'}});
  let message;try {message=await request.json();} catch {return Response.json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}},{status:400});}
  const many=Array.isArray(message),replies=[];
  if(many&&message.length>20)return Response.json({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Too many requests in one batch'}},{status:400});
  for(const item of many?message:[message]) {const reply=await rpc(item,origin,dispatch);if(reply)replies.push(reply);}
  if(!replies.length)return new Response(null,{status:202});
  return Response.json(many?replies:replies[0]);
}
async function rpc(item,origin,dispatch) {
  const id=item?.id,ok=result=>({jsonrpc:'2.0',id,result});
  if(id===undefined||id===null)return null; // notifications need no reply
  if(item.method==='initialize')return ok({protocolVersion:item.params?.protocolVersion||'2025-06-18',capabilities:{tools:{}},
    serverInfo:{name:'haoduoyu',version:'1.0.0'},instructions:'好多鱼工作台：读写碎碎念和待办。日期都按北京时间。'});
  if(item.method==='ping')return ok({});
  if(item.method==='tools/list')return ok({tools:TOOLS});
  if(item.method==='tools/call') {
    try {return ok(text(await callTool(item.params?.name,item.params?.arguments||{},dispatch)));}
    catch(error) {return ok(text(error?.message||'操作失败',true));}
  }
  return {jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}};
}
async function callTool(name,args,dispatch) {
  const today=beijingDay(Date.now()),day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:today;
  const str=value=>{if(typeof value!=='string'||!value.trim())throw new Error('需要 text');return value.trim();};
  if(name==='add_note') {
    const category=args.category==='work'?'work':'life',body={category,date:today,text:str(args.text),version:0,save_id:randomUUID()};
    if(Array.isArray(args.labels)&&args.labels.length)body.labels=args.labels.map(String);
    return dispatch('/note-entries/'+randomUUID(),'PUT',body,{'X-Note-Labels-Version':'3'});
  }
  if(name==='list_notes')return dispatch(`/note-entries?date=${day(args.date)}&category=${args.category==='work'?'work':'life'}`,'GET',null,{'X-Note-Labels-Version':'3'});
  if(name==='add_todo')return dispatch('/todos','POST',{id:randomUUID(),date:day(args.date),text:str(args.text)});
  if(name==='list_todos')return dispatch('/todos?date='+day(args.date),'GET');
  if(name==='complete_todo') {
    const list=await dispatch('/todos?date='+day(args.date),'GET'),row=(list.items||[]).find(item=>item.id===args.id);
    if(!row)throw new Error('那天没有这条待办，请先用 list_todos 找到 id 和日期');
    return dispatch('/todos/'+encodeURIComponent(row.id),'PATCH',{completed:args.completed!==false,version:row.version});
  }
  if(name==='add_future_todo') {
    const choices=periodChoices(today),when=args.when||'none';
    const period={this_week:choices.week,next_week:choices.next_week,this_month:choices.month,next_month:choices.next_month,
      every_week:choices.week,every_month:choices.month}[when]||null;
    const change={period};if(when==='every_week'||when==='every_month')change.recurrence=when.slice(6);
    if(args.due_date)change.due_date=day(args.due_date);
    const row=await dispatch('/unscheduled-todos','POST',{id:randomUUID(),text:str(args.text)});
    if(!period&&!change.due_date)return row;
    return dispatch(`/unscheduled-todos/${row.id}/period`,'PATCH',{...change,version:row.version});
  }
  if(name==='list_future_todos')return dispatch('/unscheduled-todos','GET');
  if(name==='api_request') {
    const method=String(args.method||'GET').toUpperCase(),path=String(args.path||'');
    if(!['GET','POST','PUT','PATCH','DELETE'].includes(method))throw new Error('method 不支持');
    if(!/^\/[A-Za-z0-9/_.~%-]*(\?[^#\s]*)?$/.test(path)||path.includes('..'))throw new Error('path 需要以 / 开头，例如 /todos?date=2026-11-16');
    if(BLOCKED.test(path))throw new Error('这个接口不对连接器开放：'+path.split('?')[0]);
    const extra=Object.fromEntries(Object.entries(args.headers||{}).filter(([name])=>HEADERS.includes(name.toLowerCase())).map(([n,v])=>[n,String(v)]));
    if(!dispatch.owner)throw new Error('还不知道网站主人是谁，请重新连接一次');
    return dispatch.owner(path,method,method==='GET'||method==='DELETE'&&!args.body?null:args.body||{},extra);
  }
  if(name==='delete_future_todo') {
    const row=await dispatch('/unscheduled-todos/'+encodeURIComponent(String(args.id)),'GET');
    return dispatch('/unscheduled-todos/'+encodeURIComponent(row.id),'DELETE',{version:row.version});
  }
  throw new Error('没有这个工具：'+name);
}
const BLOCKED=/^\/(auth|api-keys|backup|bootstrap|restore|import|snapshot|workbench-snapshot|integrations)(\/|\?|$)/;
const HEADERS=['x-note-labels-version','x-note-labels-archive','idempotency-key'];
/** api_request acts as the owner through a session that lives only for this one call. */
function ownerDispatch(db,origin,handle,owner) {
  if(!owner)return null;
  return async(path,method,body,extra)=>{
    const token=hex(32),hash=digest(token);
    await db.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) SELECT ?,id,? FROM matrix_users WHERE id=?')
      .bind(hash,new Date(Date.now()+120000).toISOString(),owner).run();
    try {
      const headers={Origin:origin,Cookie:'matrix_session='+token,'X-CSRF-Token':csrfFor(token),...extra,...(body?{'Content-Type':'application/json'}:{})};
      return await read(await handle(new Request(origin+'/api/v1'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})})));
    } finally {await db.prepare('DELETE FROM matrix_sessions WHERE token_hash=?').bind(hash).run();}
  };
}
async function read(response) {
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error?.message||`请求失败（${response.status}）`);
  return data.data??data;
}
/** Tool calls go through the site's own /api/v1 routes as a same-origin public-business request. */
export function internalDispatch(origin,handle) {
  const dispatch=async(path,method,body=null,extra={})=>{
    const headers={Origin:origin,'X-Public-Business':'1',...extra,...(body?{'Content-Type':'application/json'}:{})};
    const response=await handle(new Request(origin+'/api/v1'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})}));
    return read(response);
  };
  dispatch.handle=handle;
  return dispatch;
}
