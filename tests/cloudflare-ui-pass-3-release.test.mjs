import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {uiPass3Release as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('ui-pass-3 release pins exact source, artifact and the deployed 951f4f9 baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'5a3085ccee7a0d1b56c98420dfbd486bd2d50839',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'8c77f66c-d2ec-446b-8797-4d2b53b1b1f2'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'f7ee2925418a547462e28a1d84184a0b148fecf0');
  assert.equal(release.bytes,3195712);
  assert.equal(release.sha256,'0098bfdd066624af330280911c6fa86d21b7bea4baca344ab28bda63b85470ee');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
