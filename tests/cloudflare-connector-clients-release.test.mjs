import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {connectorClientsRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('connector-clients release pins exact source, artifact and the deployed 80a0b72 baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'f8420b3787f083109986685a64cd9edd4c29278c',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'cc0ba62d-6a20-4645-86ef-01da4be789da'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'399b4832bbf2ccd8800a6df49abad96b78785519');
  assert.equal(release.bytes,3262292);
  assert.equal(release.sha256,'a1acc8d241ae3e9ae25bf5a58be374b9f999b66b9053e1e82fc792e8b2149594');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
