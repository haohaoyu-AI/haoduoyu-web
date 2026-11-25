import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcp} from '../src/mcp.mjs';
import {digest} from '../src/security.mjs';

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
test('ChatGPT and Codex on this computer may connect too; other callbacks may not',async()=>{
  const register=uri=>call('/oauth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({redirect_uris:[uri]})});
  for(const uri of ['http://localhost:1455/callback','http://127.0.0.1:5555/callback','https://chatgpt.com/connector_platform_oauth_redirect'])
    assert.equal((await register(uri)).status,201,uri);
  for(const uri of ['http://evil.test/callback','https://chatgpt.com.evil.test/connector','http://localhost.evil.test/cb'])
    assert.equal((await register(uri)).status,400,uri);
  const page=await call('/oauth/authorize?'+new URLSearchParams({response_type:'code',client_id:'c',redirect_uri:'http://localhost:1455/callback',
    code_challenge:'a'.repeat(43),code_challenge_method:'S256'}));
  assert.match(await page.text(),/让 Codex（本机） 连接/);assert.match(page.headers.get('content-security-policy'),/http:\/\/localhost:1455/);
});

test('an owner MCP token cannot dispatch archive calls but can still dispatch legacy review', async () => {
  const token = 'hdy_' + 'a'.repeat(64);
  const owner = 'synthetic-owner';
  const statements = [];
  const dispatched = [];
  const db = {
    prepare(sql) {
      statements.push(sql);
      return {bind(...args) {
        return {
          async first() {
            assert.deepEqual(args, [digest(token)]);
            return {id: 'synthetic-key', account_ids_json: '[]', permissions_json: JSON.stringify(['mcp', 'owner:' + owner])};
          },
          async run() {},
        };
      }};
    },
  };
  const dispatch = {handle: async request => {
    dispatched.push(new URL(request.url).pathname);
    return Response.json({data: {items: []}});
  }};
  async function request(method, path) {
    const response = await handleMcp(new Request(origin + '/mcp', {
      method: 'POST', headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
        name: 'api_request', arguments: {method, path},
      }}),
    }), {}, {origin, db, dispatch});
    assert.equal(response.status, 200);
    return (await response.json()).result;
  }
  for (const [method, path] of [
    ['GET', '/review/archive'], ['GET', '/review/archive/items?kind=article'],
    ['POST', '/review/archive/imports/apply'], ['GET', '/%2e/review/archive/items'],
  ]) {
    const result = await request(method, path);
    assert.equal(result.isError, true, path);
    assert.match(result.content[0].text, /这个接口不对连接器开放/);
  }
  assert.deepEqual(dispatched, []);
  assert.equal(statements.length, 4);
  assert.ok(statements.every(sql => /^SELECT .*matrix_api_keys/.test(sql)));
  const allowed = await request('GET', '/review/articles?account=V%E5%AD%97');
  assert.equal(allowed.isError, undefined);
  assert.deepEqual(JSON.parse(allowed.content[0].text), {items: []});
  assert.deepEqual(dispatched, ['/api/v1/review/articles']);
});
