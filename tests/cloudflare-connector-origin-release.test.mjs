import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {connectorOriginRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('connector-origin release pins exact source, artifact and the deployed b0afcfa baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'0ab490e73942f84523b03287377ea4f0edc8e859',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'e78bd453-fda3-4a77-addb-9c4b962c2313'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'a3ccf0e45420a96e89d20629e7a10973e134c94d');
  assert.equal(release.bytes,3257128);
  assert.equal(release.sha256,'0ab9f0bb90a865ca4a8f489098c645be3dbc6bc22ac46a19d5d849e6a38766d2');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
