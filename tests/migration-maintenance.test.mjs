import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {cloudflareConfig} from '../scripts/cloudflare-config.mjs';

test('maintenance rejects every route and credential before touching DB, origin or request bodies',async()=>{
  let touched=0;
  const env={MIGRATION_MAINTENANCE:'1',PUBLIC_BUSINESS_MODE:'1'};
  for(const key of ['DB','SITE_ORIGIN','MATRIX_BOOTSTRAP_SECRET','PUBLIC_BUSINESS_USER_ID'])
    Object.defineProperty(env,key,{get(){touched++;throw new Error('MUST NOT TOUCH DB OR AUTH CONFIG');}});
  for(const path of ['/','/health','/app.js','/api/v1/auth/me','/api/v1/auth/login','/api/v1/bootstrap',
    '/api/v1/todos','/api/v1/backup','/api/v1/api-keys','/api/v1/unknown']) {
    for(const method of ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']) {
      const request=new Request('https://example.invalid'+path,{method,headers:{
        Authorization:'Bearer synthetic-must-not-authenticate',Cookie:'matrix_session=synthetic',
        Origin:'https://other.invalid','X-Public-Business':'1',
      },...(!['GET','HEAD'].includes(method)?{body:'not JSON'}:{})});
      const response=await worker.fetch(request,env);
      assert.equal(response.status,503,path+' '+method);
      assert.equal(response.headers.get('Retry-After'),'60');
      assert.equal(response.headers.get('Cache-Control'),'no-store');
      assert.equal(response.headers.get('Set-Cookie'),null);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
      assert.match(response.headers.get('X-Request-Id'),/^[a-f0-9-]{36}$/);
      if(method==='HEAD') assert.equal(await response.text(),'');
      else {
        const body=await response.json();
        assert.equal(body.error.code,'MAINTENANCE');
        assert.equal(body.request_id,response.headers.get('X-Request-Id'));
      }
      assert.equal(request.bodyUsed,false);
    }
  }
  assert.equal(touched,0);
});

test('maintenance is explicit, disabled by default, and normal responses resume when switched off',async()=>{
  for(const value of [undefined,'0',true,1,'true']) {
    const response=await worker.fetch(new Request('https://example.invalid/health'),{MIGRATION_MAINTENANCE:value});
    assert.equal(response.status,200);
    assert.equal((await response.json()).data.application,'haoduoyu-matrix');
  }
  const runtime={compatibility_date:'2026-07-30'};
  assert.equal(cloudflareConfig(runtime).config.vars.MIGRATION_MAINTENANCE,undefined);
  assert.equal(cloudflareConfig(runtime,{MIGRATION_MAINTENANCE:'1'}).config.vars.MIGRATION_MAINTENANCE,'1');
  assert.equal(cloudflareConfig(runtime,{MIGRATION_MAINTENANCE:'0'}).config.vars.MIGRATION_MAINTENANCE,'0');
  assert.throws(()=>cloudflareConfig(runtime,{MIGRATION_MAINTENANCE:'true'}));
});
