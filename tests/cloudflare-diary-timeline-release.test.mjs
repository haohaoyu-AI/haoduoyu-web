import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diaryTimelineRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('diary timeline pin exact source, artifact and the deployed 86d36dd baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'001cfa5edaa7a1373e78ed08e2f46cad636f1250',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'1e584819-9f44-4479-b04a-63d56289a4d8'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'cb6991f0e6cde025ee86b9118cd614aace0d17ae');
  assert.equal(release.bytes,3140293);
  assert.equal(release.sha256,'6fc8ab9eabda6c61e0d9f88733ffe60ac3124eb5f33a3c0df4efee685b876ecb');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'ab1beb48-453c-4d06-84b8-62d3c5fad69b'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
