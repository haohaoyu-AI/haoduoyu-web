import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {weeklyFoldRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('weekly fold release pins exact source, artifact and the deployed e8f1829 baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'4f8e73d4b630c9190889bb55264b248dc8a9d592',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'5ae01eb8-cb10-4e3a-87e2-a0c34f3838f8'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'4e25066deb3b3d2bdeedab1d709ccdd46d80faa5');
  assert.equal(release.bytes,3191226);
  assert.equal(release.sha256,'e7e90936313fcd567cbee84bab29644471f6f8aaf19078fc09c4581c702d82ed');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
