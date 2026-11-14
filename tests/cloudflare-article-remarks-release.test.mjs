import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {articleRemarksRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('article remarks release pins exact source, artifact and the deployed 805e14b baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'700e45863c78400d77fec3f628807f245b3623f7',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'89f52b59-f950-4fa5-ad41-8099a172eef9'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'4e019c8168d926581d19ba186b9a9e70c496da04');
  assert.equal(release.bytes,3187038);
  assert.equal(release.sha256,'15d39b1af797c9508b95b46370d9eeed3c54d5f455f95e1cc00099837ea73a87');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
