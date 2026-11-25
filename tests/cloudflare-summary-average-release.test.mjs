import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summaryAverageRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('weekly summary averages pin exact source, artifact and the deployed c776a88 baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'c0df37d8a691820a1598e1a55a72af2a932ae9a3',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'c3b18ec2-ca4f-474c-9e23-829e33e55d56'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'7146c491abf54ba2586f42396a1aed85438e8b26');
  assert.equal(release.bytes,3099366);
  assert.equal(release.sha256,'5b131c4334e2a55d43b9b2aa7b84bdcf28f07486ae3560f10634661ccb5386f7');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'ab1beb48-453c-4d06-84b8-62d3c5fad69b'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
