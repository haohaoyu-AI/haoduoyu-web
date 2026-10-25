import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {handleNotionSnapshot} from '../src/notion-snapshot.mjs';
import {cloudflareConfig} from '../scripts/cloudflare-config.mjs';

async function setup(t,{todo=true}={}) {
  const app=await fixture(t),session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,NOTION_SNAPSHOT_OWNER_ID:owner,
    NOTION_SNAPSHOT_PARENT_ID:'00000000-0000-4000-8000-000000000002',NOTION_SNAPSHOT_ACCOUNT_IDS:'[]',
    NOTION_SNAPSHOT_TOKEN:'synthetic-NOTION-SECRET-NEVER-PERSIST'};
  const date='2026-10-24';
  if(todo)await app.request('/api/v1/todos',{session,method:'POST',body:{id:randomUUID(),date,text:'合成日期待办'}});
  const request=(headers={},body={date})=>new Request(app.origin+'/api/v1/integrations/notion/snapshot',{
    method:'POST',headers:{Origin:app.origin,'Content-Type':'application/json',Cookie:session.cookie,
      'X-CSRF-Token':session.csrfToken,...headers},body:JSON.stringify(body)});
  return {...app,env,date,session,owner,trigger:request};
}
const delivered=(snapshot,status='created')=>({status,page_id:'b'.repeat(32),version:1,verified:true,content_hash:snapshot.content_hash});

test('manual route rejects anonymous/Bearer/other owner/bad origin-CSRF and safely reports missing config',async t=>{
  const app=await setup(t);let calls=0;
  const push=async({snapshot})=>{calls++;return delivered(snapshot);};
  const publicEnv={...app.env,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:app.owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'[]'};
  const anonymous=new Request(app.origin+'/api/v1/integrations/notion/snapshot',{method:'POST',
    headers:{Origin:app.origin,'Content-Type':'application/json','X-Public-Business':'1'},body:JSON.stringify({date:app.date})});
  assert.equal((await worker.fetch(anonymous,publicEnv)).status,401);
  for(const headers of [{Origin:'https://foreign.invalid'},{'X-CSRF-Token':'wrong'}])
    await assert.rejects(handleNotionSnapshot(app.db,app.trigger(headers),app.env,app.origin,{push}),e=>e.status===403);
  await assert.rejects(handleNotionSnapshot(app.db,app.trigger(),{...app.env,NOTION_SNAPSHOT_OWNER_ID:randomUUID()},app.origin,{push}),e=>e.status===403);
  const issued=await app.request('/api/v1/api-keys',{session:app.session,method:'POST',body:{name:'synthetic-key',account_ids:['toutiao-haoduoyu'],permissions:['read','write']}});
  await assert.rejects(handleNotionSnapshot(app.db,app.trigger({Authorization:'Bearer '+issued.data.token}),app.env,app.origin,{push}),e=>e.status===403);
  const missing=await worker.fetch(app.trigger(),{...app.env,NOTION_SNAPSHOT_TOKEN:undefined});
  assert.equal(missing.status,503);assert.equal((await missing.json()).error.code,'NOTION_CONFIG');
  assert.equal(calls,0);
});

test('empty dates skip without external calls; date is explicit and public todo writes retain behavior',async t=>{
  const app=await setup(t,{todo:false});let calls=0;
  const push=async()=>{calls++;throw Error('MUST NOT CALL');};
  const empty=await handleNotionSnapshot(app.db,app.trigger(),app.env,app.origin,{push});
  assert.equal(empty.status,'skipped_empty');assert.equal(empty.verified,false);assert.equal(calls,0);
  for(const body of [{},{date:'2026-02-30'},{date:app.date,owner_id:app.owner}])
    await assert.rejects(handleNotionSnapshot(app.db,app.trigger({},body),app.env,app.origin,{push}),e=>e.status===400);
  const env={...app.env,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:app.owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'[]'};
  const response=await worker.fetch(new Request(app.origin+'/api/v1/todos',{method:'POST',headers:{Origin:app.origin,
    'Content-Type':'application/json','X-Public-Business':'1'},body:JSON.stringify({id:randomUUID(),date:app.date,text:'公开写入仍可用'})}),env);
  assert.equal(response.status,201);
});

test('durable claim prevents concurrent pushes; verified page evidence survives later read failures',async t=>{
  const app=await setup(t);let entered,release,calls=0;
  const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
  const push=async({snapshot})=>{calls++;entered();await gate;return delivered(snapshot);};
  const first=handleNotionSnapshot(app.db,app.trigger(),app.env,app.origin,{push});
  await started;
  await assert.rejects(handleNotionSnapshot(app.db,app.trigger(),app.env,app.origin,{push}),e=>e.code==='NOTION_PENDING');
  release();assert.equal((await first).verified,true);assert.equal(calls,1);
  let previous;
  const failRead=async({previousDelivery})=>{previous=previousDelivery;throw Object.assign(Error('private-upstream-body'),{code:'NOTION_RATE_LIMIT',uncertainWrite:false});};
  await assert.rejects(handleNotionSnapshot(app.db,app.trigger(),app.env,app.origin,{push:failRead}),e=>e.status===429&&!e.message.includes('private-upstream-body'));
  assert.equal(previous.page_id,'b'.repeat(32));
  const next=await handleNotionSnapshot(app.db,app.trigger(),app.env,app.origin,{push:async({snapshot,previousDelivery})=>{
    assert.deepEqual(previousDelivery,previous);return delivered(snapshot,'skipped');
  }});
  assert.equal(next.status,'skipped');
  const receipts=await app.db.prepare("SELECT response_json FROM matrix_idempotency WHERE actor LIKE 'notion-snapshot:%'").all();
  assert.ok(!JSON.stringify(receipts).includes(app.env.NOTION_SNAPSHOT_TOKEN));
});

test('unknown external outcomes remain pending and cannot trigger a blind repeated write',async t=>{
  const app=await setup(t);let calls=0;
  const push=async()=>{calls++;throw Object.assign(Error('secret raw upstream'),{code:'NOTION_UNKNOWN',uncertainWrite:true});};
  await assert.rejects(handleNotionSnapshot(app.db,app.trigger(),app.env,app.origin,{push}),e=>e.status===503&&!e.message.includes('secret raw upstream'));
  await assert.rejects(handleNotionSnapshot(app.db,app.trigger(),app.env,app.origin,{push}),e=>e.code==='NOTION_PENDING');
  assert.equal(calls,1);
  assert.equal((await app.db.prepare("SELECT status FROM matrix_idempotency WHERE actor LIKE 'notion-snapshot:%'").first()).status,202);
});

test('an unknown receipt commit after verified Notion delivery never retries the external write',async t=>{
  const app=await setup(t);let pushed=false,calls=0;
  const db={prepare:app.db.prepare.bind(app.db),batch(statements){
    if(pushed)throw Error('synthetic receipt network outcome unknown');
    return app.db.batch(statements);
  }};
  const push=async({snapshot})=>{calls++;pushed=true;return delivered(snapshot);};
  await assert.rejects(handleNotionSnapshot(db,app.trigger(),app.env,app.origin,{push}));
  assert.equal(calls,1);
  assert.equal((await app.db.prepare("SELECT status FROM matrix_idempotency WHERE actor LIKE 'notion-snapshot:%'").first()).status,102);
  pushed=false;
  await assert.rejects(handleNotionSnapshot(db,app.trigger(),app.env,app.origin,{push}),e=>e.code==='NOTION_PENDING');
  assert.equal(calls,1);
});

test('configuration emits only explicit non-secret fields and never creates a cron or plaintext token',()=>{
  const values={NOTION_SNAPSHOT_OWNER_ID:randomUUID(),NOTION_SNAPSHOT_PARENT_ID:randomUUID(),NOTION_SNAPSHOT_ACCOUNT_IDS:'[]',NOTION_SNAPSHOT_TOKEN:'NEVER-IN-CONFIG'};
  const cfg=cloudflareConfig({compatibility_date:'2026-07-30'},values).config;
  assert.equal(cfg.vars.NOTION_SNAPSHOT_OWNER_ID,values.NOTION_SNAPSHOT_OWNER_ID);
  assert.ok(!JSON.stringify(cfg).includes(values.NOTION_SNAPSHOT_TOKEN));assert.equal(cfg.triggers,undefined);
  assert.throws(()=>cloudflareConfig({compatibility_date:'2026-07-30'},{NOTION_SNAPSHOT_ACCOUNT_IDS:'[]'}));
});

test('Notion rate-limit delay survives the shared Worker error renderer',async t=>{
  const app=await setup(t),originalFetch=globalThis.fetch;
  t.after(()=>{globalThis.fetch=originalFetch;});
  globalThis.fetch=async(input,options)=>{
    if(new URL(String(input)).origin!=='https://api.notion.com')return originalFetch(input,options);
    return Response.json({message:'synthetic limit'},{status:429,headers:{'Retry-After':'17'}});
  };
  const response=await worker.fetch(app.trigger(),app.env);
  assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'17');
  assert.equal((await response.json()).error.code,'NOTION_RATE_LIMIT');
});

test('built Worker completes local D1 to simulated Notion readback and preserves the source tables',async t=>{
  const app=await setup(t),originalFetch=globalThis.fetch,pages=new Map();let posts=0;
  t.after(()=>{globalThis.fetch=originalFetch;});
  const parent=app.env.NOTION_SNAPSHOT_PARENT_ID.replaceAll('-','');
  globalThis.fetch=async(input,options)=>{
    const url=new URL(String(input));
    if(url.origin!=='https://api.notion.com')return originalFetch(input,options);
    const path=url.pathname,method=options?.method||'GET';
    assert.equal(options.headers.Authorization,'Bearer '+app.env.NOTION_SNAPSHOT_TOKEN);
    if(method==='POST'&&path==='/v1/pages') {
      posts++;const data=JSON.parse(options.body),id=posts.toString(16).padStart(32,'0');
      pages.set(id,{title:data.properties.title.title[0].text.content,children:data.children});
      return Response.json({id});
    }
    const match=/^\/v1\/blocks\/([a-f0-9]+)\/children$/.exec(path);assert.ok(match);
    const pageId=match[1];
    if(method==='PATCH') {pages.get(pageId).children.push(...JSON.parse(options.body).children);return Response.json({results:[]});}
    const rows=pageId===parent?[...pages].map(([id,p])=>({id,type:'child_page',child_page:{title:p.title}})):pages.get(pageId).children;
    return Response.json({object:'list',results:rows,has_more:false,next_cursor:null});
  };
  const before=await app.db.prepare('SELECT * FROM matrix_todos ORDER BY id').all();
  const first=await worker.fetch(app.trigger(),app.env);assert.equal(first.status,200);
  assert.equal((await first.json()).data.verified,true);
  const again=await worker.fetch(app.trigger(),app.env);assert.equal((await again.json()).data.status,'skipped');
  assert.equal(posts,1);
  assert.deepEqual((await app.db.prepare('SELECT * FROM matrix_todos ORDER BY id').all()).results,before.results);
});
