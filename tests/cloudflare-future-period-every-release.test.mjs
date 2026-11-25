import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {futurePeriodEveryRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('future-period-every release pins exact source, artifact and the deployed aba444b baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'84fe7c66b1b0977d8761851559c7c60fbcec6b1a',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'b6f9d335-ad95-4a42-b73b-141357d05362'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'135504ef7eff03898ece29ea906cc04a26fbe750');
  assert.equal(release.bytes,3217246);
  assert.equal(release.sha256,'64593348f28142986e71b473dd7a5917dd2ed961a87810df1c680bf97631e802');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
