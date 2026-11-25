import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decisionsRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('decisions release pins exact source, artifact and the deployed 9e7e48c baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'154bd73596ab4eeb238880bc7012a01dddc4c8c3',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'f59a64b1-bbe4-4b71-bf85-eb3f79596a3c'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'aab2ee69bf1e483d9f1fa62dfe8b74405c4cc5f9');
  assert.equal(release.bytes,3182962);
  assert.equal(release.sha256,'3b5bbea13b955f4505e7f086c95055812e28cdc9d570055cebc7b4009c597d5a');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
