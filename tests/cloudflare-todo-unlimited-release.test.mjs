import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {todoUnlimitedRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('todo unlimited-count release pins exact source, artifact and the deployed 3c8f550 baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'797289c9981d8f2a2d6e1c21c5880c26969851f2',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'2b87a67c-529a-4172-bff6-6b8f536c03d4'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'20ccd24bf8eabb081345aefced61d17ece8877fa');
  assert.equal(release.bytes,3169629);
  assert.equal(release.sha256,'ca5d308f3cec84a19c5d590af8c8929a18f4a691b18457e0e6c0bdfb2dc4feee');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
