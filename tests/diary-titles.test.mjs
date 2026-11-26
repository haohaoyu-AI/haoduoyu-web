import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes,randomUUID,sign} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';
import {exportBackup,restoreIntoEmptyDatabase} from '../src/backup.mjs';

test('private diary title is date scoped, owner-only, manually editable and backed up',async t=>{
  const app=await fixture(t), session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'[]'};
  const path='/api/v1/diary-titles/2026-10-23';
  async function call({route=path,signed=true,body,origin=app.origin,headers={}}={}){
    const h={...(signed?{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken}:{}),...headers};
    if(body!==undefined)Object.assign(h,{'Content-Type':'application/json',Origin:origin,'X-Public-Business':'1'});
    const r=await worker.fetch(new Request(app.origin+route,{method:body===undefined?'GET':'PUT',headers:h,body:body===undefined?undefined:JSON.stringify(body)}),env);
    return {status:r.status,cache:r.headers.get('Cache-Control'),...await r.json()};
  }
  assert.equal((await call({signed:false})).status,401);
  assert.equal((await call({route:path+'?extra=1'})).status,400);
  assert.equal((await call({route:'/api/v1/diary-titles/2026-02-30'})).status,400);
  assert.equal((await call({route:'/api/v1/diary-titles/2999-01-01'})).status,400);
  assert.deepEqual((await call()).data,{date:'2026-10-23',title:'',version:0,updated_at:null});
  const body={title:'窗边听雨',version:0,save_id:randomUUID()};
  assert.equal((await call({signed:false,body})).status,401);
  assert.equal((await call({origin:'https://other.example',body})).status,403);
  assert.equal((await call({body:{...body,title:'不/安全'}})).status,400);
  assert.equal((await call({body:{...body,title:'长'.repeat(41)}})).status,400);
  const blank=await call({body:{...body,title:''}});
  assert.equal(blank.data.version,0);
  const saved=await call({body});
  assert.equal(saved.status,200);assert.equal(saved.cache,'private, no-store');assert.equal(saved.data.version,1);
  assert.deepEqual((await call({body})).data,saved.data);
  assert.equal((await call({body:{...body,title:'冲突标题',save_id:randomUUID()}})).status,409);
  const other=await call({route:'/api/v1/diary-titles/2026-10-24'});assert.equal(other.data.title,'');
  assert.equal((await call()).data.title,'窗边听雨');
  const backup=await exportBackup(app.db,{todoUserId:owner});assert.equal(backup.data.format,'haoduoyu-matrix-d1-v20');
  assert.equal(backup.data.tables.diary_titles[0].title,'窗边听雨');
  assert.deepEqual((await exportBackup(app.db,{todoUserId:randomUUID()})).data.tables.diary_titles,[]);
  const target=await fixture(t,{bootstrap:false});
  await restoreIntoEmptyDatabase(target.db,backup,{allowEmptyRestore:true});
  assert.equal((await target.db.prepare('SELECT title FROM matrix_diary_titles').first()).title,'窗边听雨');
  const clear=await call({body:{title:'',version:1,save_id:randomUUID()}});
  assert.equal(clear.data.title,'');assert.equal(clear.data.version,2);
});

function ed25519Keypair() {
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const spki=publicKey.export({type:'spki',format:'der'});
  return {privateKey,pubB64:spki.subarray(-32).toString('base64')};
}
function signTitleRequest({privateKey,keyid='synthetic-archive',origin,path,method='GET',created,expires,nonce=randomBytes(16).toString('base64url'),sigOrigin=origin,sigPath=path}) {
  const now=Math.floor(Date.now()/1000);
  const c=created??now,e=expires??(c+60);
  const sigParams=`("@method" "@target-uri");created=${c};expires=${e};nonce="${nonce}";keyid="${keyid}";alg="ed25519";tag="diary-title-read-v1"`;
  const base=`"@method": ${method}\n"@target-uri": ${sigOrigin}${sigPath}\n"@signature-params": ${sigParams}`;
  const sigB64=sign(null,Buffer.from(base,'utf8'),privateKey).toString('base64');
  return {
    'Signature-Input':`diary=${sigParams}`,
    'Signature':`diary=:${sigB64}:`,
  };
}
test('signed archive reader enforces RFC 9421 Ed25519, date scope, anti-replay and private no-store cache',async t=>{
  const app=await fixture(t),session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const kp=ed25519Keypair(),otherKp=ed25519Keypair();
  const keysJson=JSON.stringify({'synthetic-archive':kp.pubB64});
  const env={DB:app.db,SITE_ORIGIN:app.origin,DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'[]',DIARY_TITLE_ARCHIVE_KEYS:keysJson};
  const beijingDay=ms=>new Date(ms+8*3600_000).toISOString().slice(0,10);
  const today=beijingDay(Date.now()),yesterday=beijingDay(Date.now()-86_400_000),twoDaysAgo=beijingDay(Date.now()-2*86_400_000);
  const yPath=`/api/v1/diary-titles/${yesterday}`;
  async function ownerPut(title,version) {
    const r=await worker.fetch(new Request(app.origin+yPath,{method:'PUT',
      headers:{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken,'Content-Type':'application/json',Origin:app.origin,'X-Public-Business':'1'},
      body:JSON.stringify({title,version,save_id:randomUUID()})}),env);
    assert.equal(r.status,200);
    return (await r.json()).data;
  }
  async function signedCall({url=app.origin+yPath,method='GET',body,headers,envOverride}={}) {
    const h=headers??signTitleRequest({privateKey:kp.privateKey,origin:app.origin,path:yPath,method});
    const r=await worker.fetch(new Request(url,{method,headers:h,...(body!==undefined?{body}:{})}),envOverride?{...env,...envOverride}:env);
    return {status:r.status,cache:r.headers.get('Cache-Control'),json:await r.json()};
  }

  // 1. Version 0 (never entered), named, and cleared states.
  const v0=await signedCall();
  assert.equal(v0.status,200);assert.equal(v0.cache,'private, no-store');
  assert.deepEqual(v0.json.data,{date:yesterday,title:'',version:0,updated_at:null});

  await ownerPut('窗边听雨',0);
  const v1=await signedCall();
  assert.equal(v1.status,200);assert.equal(v1.cache,'private, no-store');
  assert.equal(v1.json.data.title,'窗边听雨');assert.equal(v1.json.data.version,1);

  await ownerPut('',1);
  const v2=await signedCall();
  assert.equal(v2.status,200);assert.equal(v2.json.data.title,'');assert.equal(v2.json.data.version,2);assert.ok(v2.json.data.updated_at);

  // 2. Method, origin, path, query, body, signature, key revocation, expiry, and date-scope rejections.
  const badMethod=await signedCall({method:'PUT',body:JSON.stringify({title:'改写',version:2,save_id:randomUUID()})});
  assert.equal(badMethod.status,403);assert.equal(badMethod.cache,'private, no-store');
  assert.equal((await signedCall({url:app.origin+yPath+'?a=1',headers:signTitleRequest({privateKey:kp.privateKey,origin:app.origin,path:yPath})})).status,400);
  assert.equal((await signedCall({headers:signTitleRequest({privateKey:kp.privateKey,origin:app.origin,path:yPath,sigOrigin:'https://evil.example'})})).status,401);
  assert.equal((await signedCall({headers:signTitleRequest({privateKey:kp.privateKey,origin:app.origin,path:yPath,sigPath:`/api/v1/diary-titles/${twoDaysAgo}`})})).status,401);
  assert.equal((await signedCall({headers:signTitleRequest({privateKey:otherKp.privateKey,origin:app.origin,path:yPath})})).status,401);
  assert.equal((await signedCall({headers:signTitleRequest({privateKey:kp.privateKey,keyid:'unknown-key',origin:app.origin,path:yPath})})).status,401);
  assert.equal((await signedCall({envOverride:{DIARY_TITLE_ARCHIVE_KEYS:'{}'}})).status,401);
  const now=Math.floor(Date.now()/1000);
  assert.equal((await signedCall({headers:signTitleRequest({privateKey:kp.privateKey,origin:app.origin,path:yPath,created:now-120,expires:now-60})})).status,401);
  assert.equal((await signedCall({headers:signTitleRequest({privateKey:kp.privateKey,origin:app.origin,path:yPath,created:now,expires:now+61})})).status,401);
  assert.equal((await signedCall({url:app.origin+`/api/v1/diary-titles/${twoDaysAgo}`,headers:signTitleRequest({privateKey:kp.privateKey,origin:app.origin,path:`/api/v1/diary-titles/${twoDaysAgo}`})})).status,403);
  assert.equal((await signedCall({url:app.origin+`/api/v1/diary-titles/${today}`,headers:signTitleRequest({privateKey:kp.privateKey,origin:app.origin,path:`/api/v1/diary-titles/${today}`})})).status,403);
  assert.equal((await signedCall({url:app.origin+'/api/v1/diary-titles/2999-01-01',headers:signTitleRequest({privateKey:kp.privateKey,origin:app.origin,path:'/api/v1/diary-titles/2999-01-01'})})).status,400);

  // 3. Parallel replay protection: one 200, one 409; fresh nonce works; replay store outage returns 503.
  const replayHeaders=signTitleRequest({privateKey:kp.privateKey,origin:app.origin,path:yPath});
  const [p1,p2]=await Promise.all([signedCall({headers:replayHeaders}),signedCall({headers:replayHeaders})]);
  assert.deepEqual([p1.status,p2.status].sort((a,b)=>a-b),[200,409]);
  assert.equal(p1.cache,'private, no-store');assert.equal(p2.cache,'private, no-store');
  assert.equal((await signedCall()).status,200);
  const brokenDb={prepare:sql=>app.db.prepare(sql),batch:async()=>{throw new Error('d1 down');}};
  const err503=await signedCall({envOverride:{DB:brokenDb}});
  assert.equal(err503.status,503);assert.equal(err503.cache,'private, no-store');
  const brokenReadDb={
    prepare:sql=>sql.includes('matrix_diary_titles')?{bind:()=>({first:async()=>{throw new Error('d1 read down');}})}:app.db.prepare(sql),
    batch:stmts=>app.db.batch(stmts),
  };
  const readErr503=await signedCall({envOverride:{DB:brokenReadDb}});
  assert.equal(readErr503.status,503);assert.equal(readErr503.cache,'private, no-store');
  assert.equal((await signedCall({
    headers:signTitleRequest({privateKey:kp.privateKey,keyid:'haoduoyu-archive-vm-20261126',origin:app.origin,path:yPath}),
    envOverride:{DIARY_TITLE_ARCHIVE_KEYS:undefined},
  })).status,401);

  // 4. Signed headers do not grant access to any other API route.
  const otherRoute=await worker.fetch(new Request(app.origin+'/api/v1/auth/me',{headers:signTitleRequest({privateKey:kp.privateKey,origin:app.origin,path:'/api/v1/auth/me'})}),
    {...env,PUBLIC_BUSINESS_MODE:'0'});
  assert.equal(otherRoute.status,401);
});
