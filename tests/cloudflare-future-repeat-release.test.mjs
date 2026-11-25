import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {futureRepeatRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('future-repeat release pins exact source, artifact and the deployed 84fe7c6 baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'fad9f98ae1ab95087d47fced89fda2b22865192b',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'2fbe403d-820c-4d9e-9990-2337c2653fce'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'8e787070c1d9bb1bd488b6f4062319ef2d718753');
  assert.equal(release.bytes,3223486);
  assert.equal(release.sha256,'eb51f65f1ace10b96e703fbe39245e0216706ea14638b010356e1ac2c4c78c6f');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
