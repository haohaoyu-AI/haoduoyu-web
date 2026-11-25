import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {futurePeriodRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('future-period release pins exact source, artifact and the deployed c900549 baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'5de12fdd815428f5eb71831bd98889affead05d0',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'df2e1360-7787-4627-8837-1570cb7c3628'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'ed82ce93861f424f56daff0826ad432ade37d1b2');
  assert.equal(release.bytes,3211306);
  assert.equal(release.sha256,'d0efc6728afda335f34f576e230a3992284fa93d4eef09156d9ebb7c15a44b89');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
