import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {uiPass1Release as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('ui-pass-1 release pins exact source, artifact and the deployed 4f8e73d baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'f8c2e2f4c670496513b842454e1487fb5f38822c',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'8e03d93c-982d-486a-a827-98393e9ae8ba'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'8a8b92b6891ec82a32ad0073e1465962ead0eaa4');
  assert.equal(release.bytes,3192687);
  assert.equal(release.sha256,'95c3bfd1a03d8261fa468310913ea702ad6fec366cf071ff35672c7567b838cc');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
