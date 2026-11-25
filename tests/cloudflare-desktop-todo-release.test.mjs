import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {desktopTodoSyncRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('desktop todo release pins the product source, generated interface, Worker and previous deployment',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'565b6a2b0659d902256a21620068daf7f78e0d7c',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'290218aa-39f9-4b52-81c5-ad5be6b0fbeb'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'7723d305f9cdb021038388ad299f720a13d41612');
  assert.equal(release.bytes,3298442);
  assert.equal(release.sha256,'2ced1f8e25b5323e1b6e9097fcfda6fbf450ed5ee9bb23264e8449bf3ac07205');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
