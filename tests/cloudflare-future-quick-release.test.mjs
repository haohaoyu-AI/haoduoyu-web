import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {futureQuickRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('future quick-move release pins exact source, artifact and the deployed cf4a798 baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'9e7e48c9852f3455f29bf6cb755ae18debf69c2a',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'07842567-6f01-47ec-bd85-85f75ba8f51d'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'35e883a87eba97bfdf2240ee30114ebb5099b235');
  assert.equal(release.bytes,3174938);
  assert.equal(release.sha256,'be1440ac44fdb32ebce88df16fbd3bd996c3c2f76bff1857511a3bf052d46b06');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
