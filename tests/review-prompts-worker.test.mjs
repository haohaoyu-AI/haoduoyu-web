import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Miniflare} from 'miniflare';
import {applyFixtureMigrations} from './harness.mjs';

test('built Worker synthetic D1 exposes prompts, protects history and keeps account scope isolation',async t=>{
  const owner=randomUUID(),origin='http://localhost';
  const runtime=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
  const mf=new Miniflare({modules:true,cf:false,scriptPath:fileURLToPath(new URL('../dist/server/index.js',import.meta.url)),compatibilityDate:runtime.compatibility_date,compatibilityFlags:runtime.compatibility_flags,d1Databases:['DB'],bindings:{SITE_ORIGIN:origin,DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1'},host:'127.0.0.1',port:0,outboundService:()=>new Response('External requests disabled',{status:502})});
  t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');await applyFixtureMigrations(db);
  await db.prepare('INSERT INTO matrix_users VALUES(?,?,?,?)').bind(owner,'synthetic-owner','synthetic-only',new Date().toISOString()).run();
  await db.prepare('INSERT INTO matrix_control(id,initialized) VALUES(1,1)').run();
  async function call(path,method='GET',body,headers={}) {
    const response=await mf.dispatchFetch(origin+'/api/v1/review/'+path,{method,headers:{Origin:origin,'X-Public-Business':'1',...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
    return {status:response.status,...await response.json()};
  }
  const body={prompt_key:'longform_write',scope:'vzi',version:1,status:'active',title:'Synthetic',content_md:'**Original**'};
  const first=randomUUID(),second=randomUUID();
  const one=await call('prompts/'+first,'PUT',body);assert.equal(one.status,201);
  assert.equal((await call('prompts/'+first,'PUT',body)).status,200);
  const two=await call('prompts/'+second,'PUT',{...body,version:2,status:'draft',content_md:'Second'});
  assert.equal((await call('prompts/'+second,'PATCH',{expected_hash:two.data.content_hash,status:'active'})).status,200);
  const old=(await call('prompts/'+first)).data;assert.equal(old.status,'archived');assert.equal(old.content_md,body.content_md);
  assert.equal((await call('prompts/'+second,'PATCH',{expected_hash:two.data.content_hash,title:'stale'})).status,409);
  assert.deepEqual((await call('prompts/current?account=vzi')).data.items.map(x=>x.id),[second]);
  assert.deepEqual((await call('prompts/current?account=yujian')).data.items,[]);
  await call('prompts/'+randomUUID(),'PUT',{...body,scope:'global'});
  await call('prompts/'+randomUUID(),'PUT',{...body,scope:'wechat'});
  for(const account of ['wechat','公众号'])assert.deepEqual((await call('prompts/current?account='+encodeURIComponent(account))).data.items.map(x=>x.scope),['wechat']);
  assert.equal((await call('prompts','GET',undefined,{Authorization:'Bearer invalid'})).status,401);
  assert.equal((await call('prompts/'+randomUUID(),'PUT',body,{Origin:'https://wrong.invalid'})).status,403);
  assert.equal((await call('prompts/'+first,'DELETE',{expected_hash:old.content_hash})).status,404);
});

test('OpenAPI preserves prompt contracts, PATCH omission semantics and optional legacy rule scope',async()=>{
  const api=JSON.parse(await readFile(new URL('../public/openapi.json',import.meta.url),'utf8'));
  const schemas=api.components.schemas,create=schemas.ReviewPromptCreate,patch=schemas.ReviewPromptPatch;
  assert.ok(new RegExp(create.properties.prompt_key.pattern).test('weitoutiao_write'));
  assert.equal(patch.properties.status.default,undefined);assert.equal(patch.properties.changelog_md.default,undefined);
  assert.deepEqual(patch.required,['expected_hash']);assert.equal(patch.minProperties,2);
  assert.deepEqual(schemas.ReviewRule.properties.scope.enum,['global','toutiao','vzi','yujian','wechat']);
  assert.ok(!schemas.ReviewRule.required.includes('scope'));
  for(const path of ['/api/v1/review/prompts','/api/v1/review/prompts/current'])assert.match(api.paths[path].get.parameters.find(x=>x.name==='account').description,/公众号仅wechat/);
  assert.equal(api.paths['/api/v1/review/prompts/{id}'].delete,undefined);
});
