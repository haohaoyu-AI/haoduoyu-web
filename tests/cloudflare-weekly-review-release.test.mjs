import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {weeklyReviewRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('weekly review release pins exact source, artifact and the deployed 700e458 baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'e8f182992d1f91cf42a91985572b30f12dbb554a',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'5915933f-95e6-4a5c-94a1-0ffc721f8628'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'7fb809eaa4a21cab19d719be58cf6c90f18bf4bf');
  assert.equal(release.bytes,3190963);
  assert.equal(release.sha256,'c9883acbbd3cfaf2bc87f718b5cfbd35b023507041941964f04137a46623f74a');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
