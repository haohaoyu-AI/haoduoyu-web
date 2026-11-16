import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcp} from '../src/mcp.mjs';

const origin='https://site.test',call=(path,init)=>handleMcp(new Request(origin+path,init),{},{origin,db:null,dispatch:null});
test('the Claude connector publishes its OAuth metadata and only registers Claude callbacks',async()=>{
  const meta=await (await call('/.well-known/oauth-authorization-server')).json();
  assert.equal(meta.authorization_endpoint,origin+'/oauth/authorize');assert.deepEqual(meta.code_challenge_methods_supported,['S256']);
  assert.equal((await (await call('/.well-known/oauth-protected-resource')).json()).resource,origin+'/mcp');
  const register=uris=>call('/oauth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({redirect_uris:uris})});
  assert.equal((await register(['https://evil.test/callback'])).status,400);
  const ok=await register(['https://claude.ai/api/mcp/auth_callback']);assert.equal(ok.status,201);assert.match((await ok.json()).client_id,/^claude-/);
});
test('the approval page needs PKCE and a Claude callback, and allows its form to return to Claude',async()=>{
  const query=extra=>new URLSearchParams({response_type:'code',client_id:'claude-1',redirect_uri:'https://claude.ai/api/mcp/auth_callback',
    code_challenge:'a'.repeat(43),code_challenge_method:'S256',state:'s',...extra});
  const page=await call('/oauth/authorize?'+query());
  assert.equal(page.status,200);assert.match(await page.text(),/同意并连接/);assert.match(page.headers.get('content-security-policy'),/form-action 'self' https:\/\/claude\.ai/);
  await assert.rejects(call('/oauth/authorize?'+query({redirect_uri:'https://evil.test/cb'})),error=>error.status===400);
  await assert.rejects(call('/oauth/authorize?'+query({code_challenge_method:'plain'})),error=>error.status===400);
});

test('approving checks that the form came from this site, also when the browser sends Origin: null',async()=>{
  const body=new URLSearchParams({response_type:'code',client_id:'claude-1',redirect_uri:'https://claude.ai/api/mcp/auth_callback',
    code_challenge:'a'.repeat(43),code_challenge_method:'S256'}).toString();
  const post=headers=>call('/oauth/authorize',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...headers},body});
  await assert.rejects(post({Origin:'https://evil.test'}),error=>error.code==='CSRF');
  await assert.rejects(post({Origin:'null','Sec-Fetch-Site':'cross-site'}),error=>error.code==='CSRF');
  // Past the origin check, without a logged-in owner (no database here) the page asks to log in first.
  assert.match(await (await post({Origin:'null','Sec-Fetch-Site':'same-origin'})).text(),/需要管理员登录/);
});
