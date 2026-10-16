import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {UnauthorizedError,auth} from '@modelcontextprotocol/sdk/client/auth.js';
import {saveExecution} from './runtime.mjs';

function publicOAuthError(error){
 const kind=String(error?.name||'');
 if(/dynamic client registration|registration_endpoint/i.test(String(error?.message||'')))return Error('网站未提供可用的本机 OAuth 客户端注册；请检查现有 Sites 连接授权配置');
 if(['InvalidClientError','InvalidClientMetadataError','UnauthorizedClientError'].includes(kind))return Error('网站 OAuth 客户端授权未被接受，请检查现有 Sites 连接授权配置');
 if(['AccessDeniedError','InvalidGrantError','UnauthorizedError'].includes(kind))return Error('网站授权未确认或已失效，请在打开的授权页重新登录并同意');
 return Error('网站 OAuth 连接未完成，请检查本机网络、本人授权和网站连接配置');
}

// Neither browser pages nor child Codex processes receive bearer/refresh tokens.
function powershell(script,input){return new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',()=>{});child.on('error',()=>reject(Error('本机凭据保护不可用')));child.on('exit',code=>code===0?resolve(output.trim()):reject(Error('本机凭据保护失败')));child.stdin.on('error',()=>{});child.stdin.end(input);});}
export async function openBrowser(url){
 const value=new URL(url);if(!['https:','http:','chrome:'].includes(value.protocol))throw Error('浏览器地址无效');
 if(process.platform==='win32')return powershell('$url=[Console]::In.ReadToEnd();Start-Process -FilePath $url',value.href);
 const child=spawn(process.platform==='darwin'?'open':'xdg-open',[value.href],{stdio:'ignore'});child.on('error',()=>{});child.unref();
}
export async function readVault(file){
 let record;try{record=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw Error('本机授权记录不可读，请保留文件并重新授权');}
 if(process.platform==='win32'){
  if(record.format!=='dpapi-current-user')throw Error('授权记录不属于本机 Windows 账户');
  const decoded=await powershell('Add-Type -AssemblyName System.Security;$bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd());$plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Write([Text.Encoding]::UTF8.GetString($plain))',record.ciphertext);try{return JSON.parse(decoded);}catch{throw Error('本机授权记录不可读，请保留文件并重新授权');}
 }
 if(record.format!=='owner-file')throw Error('授权记录保护方式与执行机不一致');
 const mode=(await fs.stat(file)).mode&0o777;if(mode&0o077)throw Error('本机授权文件权限过宽，需仅当前用户可读');return record.data;
}
export async function writeVault(file,data){
 let record;if(process.platform==='win32'){const ciphertext=await powershell('Add-Type -AssemblyName System.Security;$bytes=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd());$protected=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Write([Convert]::ToBase64String($protected))',JSON.stringify(data));record={format:'dpapi-current-user',ciphertext};}else record={format:'owner-file',data};
 await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await saveExecution(file,record);
}
export class LocalOAuthProvider{
 constructor({url,file,notify=console.log,open=openBrowser,load=readVault,save=writeVault,interactive=true}){this.url=url;this.file=file;this.notify=notify;this.open=open;this.load=load;this.save=save;this.interactive=interactive;this.data={};this.pendingSave=Promise.resolve();}
 async initialize(){this.data=await this.load(this.file);if(this.data.resource&&this.data.resource!==this.url)throw Error('本机授权属于另一网站，请使用原 MCP 地址');this.data.resource=this.url;}
 get redirectUrl(){return this.callbackURL||this.data.redirect_uri;}
 get clientMetadata(){return {client_name:'好多鱼得到大脑本机执行端',redirect_uris:[String(this.redirectUrl)],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none',scope:'openid resource.invoke email offline_access'};}
 async persist(){this.pendingSave=this.pendingSave.then(()=>this.save(this.file,this.data));return this.pendingSave;}
 async clientInformation(){return this.data.client;}
 async saveClientInformation(value){this.data.client=value;await this.persist();}
 async tokens(){return this.data.tokens;}
 async saveTokens(value){this.data.tokens=value;this.data.expires_at=value.expires_in?Date.now()+value.expires_in*1000:null;await this.persist();}
 async saveCodeVerifier(value){this.verifier=value;}
 async codeVerifier(){if(!this.verifier)throw Error('本次授权校验已结束，请重新开始授权');return this.verifier;}
 async validateResourceURL(server,resource){if(String(server)!==this.url||resource&&resource!==this.url)throw Error('网站授权资源与当前网站不一致');return new URL(this.url);}
 async invalidateCredentials(scope){if(['all','client'].includes(scope))delete this.data.client;if(['all','tokens'].includes(scope)){delete this.data.tokens;delete this.data.expires_at;}if(['all','verifier'].includes(scope))this.verifier=null;await this.persist();}
 async state(){await this.ensureCallback();return this.expectedState;}
 async ensureCallback(){
  if(this.server)return;if(!this.interactive)throw Error('网站需要重新授权，请运行 Start-Dedao.cmd 完成本人登录');
  this.expectedState=randomBytes(32).toString('base64url');this.codePromise=new Promise((resolve,reject)=>{this.resolveCode=resolve;this.rejectCode=reject;});this.codePromise.catch(()=>{});
  this.server=createServer((req,res)=>{const u=new URL(req.url,'http://127.0.0.1');const got=Buffer.from(u.searchParams.get('state')||''),expected=Buffer.from(this.expectedState);
   if(u.pathname!=='/callback'||got.length!==expected.length||!timingSafeEqual(got,expected)){res.writeHead(403);res.end('Invalid authorization state');return;}
   if(u.searchParams.has('error')){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});res.end('你没有完成授权。请返回执行程序重试。');this.rejectCode(Error('网站授权未同意'));return;}
   const code=u.searchParams.get('code');if(!code||code.length>4096){res.writeHead(400);res.end();return;}
   res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('网站授权已接收。请返回执行程序；只有服务器确认后才会显示连接成功。');this.resolveCode(code);
  });
  // Keep the registered redirect stable across restarts; no public inbound port.
  let port=0;if(this.data.redirect_uri){const old=new URL(this.data.redirect_uri);if(old.hostname!=='127.0.0.1'||old.pathname!=='/callback')throw Error('本机授权回调记录无效');port=Number(old.port);}
  await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(port,'127.0.0.1',resolve);});this.callbackURL=`http://127.0.0.1:${this.server.address().port}/callback`;this.data.redirect_uri=this.callbackURL;await this.persist();
  this.timer=setTimeout(()=>this.rejectCode(Error('网站授权等待超时，请重新启动连接程序')),15*60*1000);this.timer.unref();
 }
 async redirectToAuthorization(url){await this.ensureCallback();this.notify('需要你确认：请在打开的网站授权页用本人账号登录并点击同意。无需复制令牌。');await this.open(url.href);}
 async complete(transport){try{const code=await this.codePromise;await transport.finishAuth(code);}finally{await this.closeCallback();this.verifier=null;this.codePromise=null;this.expectedState=null;}}
 async closeCallback(){clearTimeout(this.timer);if(this.server){const s=this.server;this.server=null;await new Promise(r=>s.close(r));}}
}
export async function connectMcp({url,workDir,interactive=true,notify=console.log,allowLocalForTests=false,fetch:fetchOverride,provider:provided}={}){
 const u=new URL(url);if(u.protocol!=='https:'&&!(allowLocalForTests&&u.hostname==='127.0.0.1'))throw Error('网站 MCP 连接必须使用 HTTPS');
 const token=process.env.DEDAO_MCP_ACCESS_TOKEN;const provider=token?null:provided||new LocalOAuthProvider({url:u.href,file:path.join(workDir,'oauth-vault.json'),interactive,notify});if(provider)await provider.initialize();
 let client,transport;
 async function open(){
  if(provider&&!provider.redirectUrl)await provider.ensureCallback();
  client=new Client({name:'haoduoyu-dedao-executor',version:'1.1.2'});
  transport=new StreamableHTTPClientTransport(u,{authProvider:provider||undefined,requestInit:token?{headers:{Authorization:'Bearer '+token}}:undefined,fetch:fetchOverride});
  try{await client.connect(transport);}catch(error){if(!(error instanceof UnauthorizedError)||!provider)throw error;await provider.complete(transport);await client.close().catch(()=>{});return open();}
  await provider?.closeCallback();
 }
 try{await open();}catch(error){await provider?.closeCallback();await client?.close().catch(()=>{});throw publicOAuthError(error);}
 let pending=Promise.resolve();
 async function invoke(name,args){
  // Serial auth refresh also avoids sharing one-use rotating refresh tokens.
  if(provider?.data.expires_at&&provider.data.expires_at<Date.now()+60000){const result=await auth(provider,{serverUrl:u,fetchFn:fetchOverride});if(result==='REDIRECT'){await provider.complete(transport);} }
  let result;try{result=await client.callTool({name,arguments:args},undefined,{timeout:30000});}catch(error){if(!(error instanceof UnauthorizedError)||!provider)throw error;await provider.complete(transport);await client.close().catch(()=>{});await open();result=await client.callTool({name,arguments:args},undefined,{timeout:30000});}
  if(result.isError){const error=Error(result.content?.find(c=>c.type==='text')?.text||'网站未确认此操作');error.dedaoPublic=true;throw error;}return result.structuredContent||JSON.parse(result.content.find(c=>c.type==='text').text);
 }
 return {call(name,args={}){const task=pending.then(()=>invoke(name,args)).catch(error=>{throw error.dedaoPublic?error:publicOAuthError(error);});pending=task.catch(()=>{});return task;},async close(){await pending;await provider?.closeCallback();await client?.close();}};
}
