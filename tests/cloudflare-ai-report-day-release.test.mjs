import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {aiReportDayRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('AI report day release pins exact source, artifact and the deployed b478432 baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'cf4a79871aee70f0aa4217c58d39db30cd9cfb94',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'c3a93f28-e124-489b-b7de-a23e8c37ff3b'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'0e90276b12742097644d2bf47c670819ca834e1d');
  assert.equal(release.bytes,3172522);
  assert.equal(release.sha256,'6fc7267cc444a369f166e3d5a13177fa74e3b66b7759d09db952ba3ea23d18ee');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
