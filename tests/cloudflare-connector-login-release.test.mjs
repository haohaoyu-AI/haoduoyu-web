import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {connectorLoginRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('connector-login release pins exact source, artifact and the deployed 0630f43 baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'80a0b72315b3169e4a1f10ee16316dc4f2a0f9be',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'056137f2-2d8e-40ee-8d1d-93fa8849f764'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'4f144bbfc17307c2a89d9a59390821de202ff0ba');
  assert.equal(release.bytes,3261612);
  assert.equal(release.sha256,'396aa6d990a29ffc8580e32fc1491bc9dd8afe6743e404a3019d7d7f48fd2efc');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
