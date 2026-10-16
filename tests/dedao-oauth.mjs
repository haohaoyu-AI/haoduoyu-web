// Official MCP SDK and real loopback callback, synthetic fetch only. No external
// authentication, device, credentials or user browser is accessed.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {LocalOAuthProvider,connectMcp,writeVault,readVault} from '../scripts/dedao/oauth.mjs';
const folder=await fs.mkdtemp(path.join(os.tmpdir(),'dedao-oauth-synthetic-')),site='https://site.synthetic.example/mcp',issuer='https://auth.synthetic.example';let cached={},challenge,refreshes=0,registrations=0,authorized=false,wrongStateRejected=false,opens=0;
const json=(v,status=200,headers={})=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json',...headers}});
const fakeFetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url),method=init.method||input.method||'GET';
 if(url.hostname==='site.synthetic.example'&&url.pathname.includes('oauth-protected-resource'))return json({resource:site,authorization_servers:[issuer],scopes_supported:['openid','resource.invoke','email','offline_access']});
 if(url.hostname==='auth.synthetic.example'&&url.pathname.includes('.well-known'))return json({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',registration_endpoint:issuer+'/register',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],token_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256']});
 if(url.href===issuer+'/register'){registrations++;const metadata=JSON.parse(init.body);assert.equal(metadata.token_endpoint_auth_method,'none');assert.equal(new URL(metadata.redirect_uris[0]).hostname,'127.0.0.1');return json({...metadata,client_id:'SYNTHETIC_CLIENT'});}
 if(url.href===issuer+'/token'){
  const body=new URLSearchParams(init.body);assert.equal(body.get('resource'),site);
  if(body.get('grant_type')==='authorization_code'){assert.equal(body.get('code'),'SYNTHETIC_CODE');assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'),challenge);authorized=true;}
  else {assert.equal(body.get('grant_type'),'refresh_token');assert.equal(body.get('refresh_token'),'SYNTHETIC_REFRESH');refreshes++;}
  return json({access_token:'SYNTHETIC_ACCESS_'+refreshes,refresh_token:'SYNTHETIC_REFRESH',token_type:'Bearer',expires_in:3600,scope:'openid resource.invoke email offline_access'});
 }
 if(url.href===site){
  if(method==='GET')return new Response(null,{status:405});if(method==='DELETE')return new Response(null,{status:200});
  const headers=new Headers(init.headers);if(!authorized||headers.get('Authorization')!=='Bearer SYNTHETIC_ACCESS_'+refreshes)return new Response('Unauthorized',{status:401,headers:{'WWW-Authenticate':`Bearer resource_metadata="https://site.synthetic.example/.well-known/oauth-protected-resource/mcp", scope="openid resource.invoke email offline_access"`}});
  const q=JSON.parse(init.body);if(q.method==='notifications/initialized')return new Response(null,{status:202});
  const result=q.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'synthetic-only',version:'1'}}:{content:[{type:'text',text:'{"synthetic":true}'}],structuredContent:{synthetic:true,name:q.params.name}};return json({jsonrpc:'2.0',id:q.id,result});
 }
 throw Error('Test forbids unexpected external request: '+url.origin);
};
let connection;
try{
 const retryProvider=new LocalOAuthProvider({url:site,file:'SYNTHETIC_RETRY',notify:()=>{},load:async()=>({}),save:async()=>{}});await retryProvider.initialize();
 for(const rejected of ['denied','timeout']){
  const oldState=await retryProvider.state(),callback=new URL(retryProvider.redirectUrl);
  if(rejected==='denied'){callback.searchParams.set('state',oldState);callback.searchParams.set('error','access_denied');await fetch(callback);}else retryProvider.rejectCode(Error('Synthetic authorization timeout'));
  await assert.rejects(()=>retryProvider.complete({finishAuth:async()=>{throw Error('A rejected authorization cannot exchange a code');}}));assert.equal(retryProvider.server,null);assert.equal(retryProvider.codePromise,null);const nextState=await retryProvider.state();assert.notEqual(nextState,oldState);
  const next=new URL(retryProvider.redirectUrl);next.searchParams.set('state',nextState);next.searchParams.set('code','SYNTHETIC_RETRY_CODE');await fetch(next);let exchanged=false;await retryProvider.complete({finishAuth:async code=>{assert.equal(code,'SYNTHETIC_RETRY_CODE');exchanged=true;}});assert.equal(exchanged,true);
 }
 const provider=new LocalOAuthProvider({url:site,file:'SYNTHETIC',notify:()=>{},load:async()=>structuredClone(cached),save:async(_f,v)=>{cached=structuredClone(v);},open:async value=>{
  opens++;const u=new URL(value);assert.equal(u.origin,issuer);assert.equal(u.searchParams.get('code_challenge_method'),'S256');challenge=u.searchParams.get('code_challenge');assert.ok(u.searchParams.get('state').length>=40);
  const callback=new URL(u.searchParams.get('redirect_uri'));callback.searchParams.set('code','SYNTHETIC_CODE');callback.searchParams.set('state','SYNTHETIC_WRONG');wrongStateRejected=(await fetch(callback)).status===403;callback.searchParams.set('state',u.searchParams.get('state'));assert.equal((await fetch(callback)).status,200);
 }});
 connection=await connectMcp({url:site,workDir:folder,provider,fetch:fakeFetch});assert.equal((await connection.call('read_dedao_batch')).synthetic,true);assert.equal(wrongStateRejected,true);assert.equal(opens,1);assert.equal(registrations,1);assert.equal(cached.tokens.issuer,issuer);
 provider.data.expires_at=Date.now()-1;await Promise.all(Array.from({length:4},()=>connection.call('read_dedao_batch')));assert.equal(refreshes,1,'concurrent calls share serialized refresh');await connection.close();
 const resumed=new LocalOAuthProvider({url:site,file:'SYNTHETIC',notify:()=>{},load:async()=>structuredClone(cached),save:async(_f,v)=>{cached=structuredClone(v);},open:async()=>{throw Error('Cached same-resource authorization must not open login');}});connection=await connectMcp({url:site,workDir:folder,provider:resumed,fetch:fakeFetch});await connection.call('read_dedao_batch');assert.equal(registrations,1);assert.equal(opens,1);await assert.rejects(()=>resumed.validateResourceURL(site,'https://other.synthetic.example/mcp'));
 const file=path.join(folder,'vault.json');await writeVault(file,{tokens:{access_token:'SYNTHETIC_ONLY'}});assert.equal((await readVault(file)).tokens.access_token,'SYNTHETIC_ONLY');if(process.platform!=='win32'){assert.equal((await fs.stat(file)).mode&0o077,0);await fs.chmod(file,0o644);await assert.rejects(()=>readVault(file),/权限/);}
 console.log('PASS synthetic official-SDK OAuth: actual loopback state rejection, PKCE code verification, dynamic registration, exact resource/issuer retention, serialized refresh, restart without new login and owner-only vault. Windows DPAPI code is present but requires the real Windows device test. No real authorization or remote requests.');
}finally{await connection?.close().catch(()=>{});await fs.rm(folder,{recursive:true,force:true});}
