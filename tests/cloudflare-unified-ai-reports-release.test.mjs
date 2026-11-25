import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {aiReportModelOptionsRelease,unifiedAiReportsRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('unified AI reports pins the approved source, artifact and current production baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'9835ad1308b75656c29d234a82fb046d61934817',LOCAL_UPLOAD_STOPPED:'true',
    EXPECTED_CURRENT_VERSION:'7f460fad-6aad-4550-bf32-3f8821dc32e4'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'644a97f21ed732387b42fb59f44ca3768596d143');
  assert.equal(release.bytes,3055215);
  assert.equal(release.sha256,'2344f363b04e83de2072b7c3ebca6bb61e628a4873b9421c0f02aa1a9697d960');
  for(const change of [{EXPECTED_CURRENT_VERSION:'be38aa14-16a7-4942-beb3-d2a1108e31ff'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'},{GITHUB_EVENT_NAME:'push'}])
    assert.throws(()=>validateRequest({...env,...change}));
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  await assert.rejects(verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:'0'.repeat(40)}})}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const yaml=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(yaml.includes('          - '+release.commit+'\n'));
  assert.match(yaml,/group: haoduoyu-cloudflare-production/);assert.match(yaml,/cancel-in-progress: false/);
  assert.doesNotMatch(yaml,/contents: write|wrangler secret|migrations apply/);
});

test('model selector fix pins exact source and its independently confirmed production baseline',async()=>{
  const fix=aiReportModelOptionsRelease;
  assert.equal(fix.commit,'b6f8af9dfeac65f34e40388c356a850a226a2a51');
  assert.equal(fix.tree,'dc9a71a0789724359c124fa46b767675186559a4');
  assert.equal(fix.bytes,3055386);
  assert.equal(fix.sha256,'f3cd419d69aa87a8166f6ffe0f3917efefd73b0eaa3cc1ebc9803bba776bbb49');
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:fix.commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'25c4c7ae-6e9e-4646-9896-74d5b47cfa30'};
  assert.equal(validateRequest(env),fix);
  assert.throws(()=>validateRequest({...env,EXPECTED_CURRENT_VERSION:release.baseline}));
  assert.equal(await verifyEligibility(fix.commit,{request:async()=>Response.json({sha:fix.commit,tree:{sha:fix.tree}})}),fix);
  assert.throws(()=>verifyWorker(Buffer.alloc(fix.bytes),fix.commit));
});
