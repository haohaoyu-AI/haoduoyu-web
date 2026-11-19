import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {archiveFixture} from './review-archive-fixture.mjs';

const archiveItems='review/archive/items';

test('archive capability and reads are available only to the authenticated workspace owner',async t=>{
  const app=await archiveFixture(t);
  const identity=await app.request('auth/me');
  assert.equal(identity.status,200);
  assert.equal(identity.data.reviewArchive,true);
  assert.equal((await app.request(archiveItems)).status,200);

  const nonOwnerEnv={...app.env,DAILY_NOTES_OWNER_ID:randomUUID()};
  const nonOwner=await app.request('auth/me',{environment:nonOwnerEnv});
  assert.equal(nonOwner.status,200);
  assert.equal(Object.hasOwn(nonOwner.data,'reviewArchive'),false);
  assert.equal((await app.request(archiveItems,{environment:nonOwnerEnv})).status,403);

  const publicEnv={...app.env,PUBLIC_BUSINESS_USER_ID:app.owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'[]'};
  const publicIdentity=await app.request('auth/me',{auth:false,environment:publicEnv});
  assert.equal(publicIdentity.status,200);
  assert.equal(publicIdentity.data.publicBusiness,true);
  assert.equal(Object.hasOwn(publicIdentity.data,'reviewArchive'),false);
  assert.ok([401,403].includes((await app.request(archiveItems,{auth:false,environment:publicEnv})).status));

  const missingCsrf=await app.request(archiveItems,{method:'POST',auth:false,headers:{Cookie:app.session.cookie},
    environment:publicEnv,body:{kind:'article',original_title:'合成权限检查'}});
  assert.equal(missingCsrf.status,403);
  assert.equal(missingCsrf.error.code,'CSRF');
});

test('pre-archive migration keeps the old login identity and legacy review reads',async t=>{
  const app=await archiveFixture(t,{migrationCount:29});
  const identity=await app.request('auth/me');
  assert.equal(identity.status,200);
  assert.equal(Object.hasOwn(identity.data,'reviewArchive'),false);
  const legacy=await app.request('review/articles?account=V%E5%AD%97');
  assert.equal(legacy.status,200);
  assert.deepEqual(legacy.data.items,[]);
});
