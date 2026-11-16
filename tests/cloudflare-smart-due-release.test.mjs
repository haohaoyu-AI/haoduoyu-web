import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {smartDueRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('smart-due release pins exact source, artifact and the deployed fad9f98 baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'a6c257cae5726f479d48a8f168d877ca801ee124',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'a0ca3bd4-fb32-4dc6-9c03-a1a6d9425ba2'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'bc887badf0e66c97f726b4e1c53af49f210163db');
  assert.equal(release.bytes,3238020);
  assert.equal(release.sha256,'f717e76a19473774ea8ad49bdafd152770e0ef3d6b79f916d855f41cb24951bf');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
