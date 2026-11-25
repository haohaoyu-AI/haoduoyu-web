import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {uiPass4Release as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('ui-pass-4 release pins exact source, artifact and the deployed 5a3085c baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'c900549313ba36f009a57cd60d4b7c55f579ed66',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'e586a086-1b88-4a6c-a4c5-c8819efe1000'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'3497596375f99d083a18326ece935b4c4ca8cb0f');
  assert.equal(release.bytes,3197417);
  assert.equal(release.sha256,'d08541579f8b99d217b14e4db84d6f10523908860367db1bda0c15879e8f5229');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
