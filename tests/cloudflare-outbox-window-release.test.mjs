import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {outboxWindowRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('outbox-window release pins exact source, artifact and the deployed f8420b3 baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'6e13a0a1587f87bd32c3cd0f791ee203f7c105f9',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'1b769736-62ba-4096-afe7-8adfa1d08e96'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'ad1a2985c4961c399fd9b5da8bf82b3c63ee267b');
  assert.equal(release.bytes,3262507);
  assert.equal(release.sha256,'e9f99dae1471f217cb6cd178ba231005b760c892c718faf7bf2e77e70b7ad4b4');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
