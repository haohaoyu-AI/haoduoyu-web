import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {futurePeriodWordsRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('future-period-words release pins exact source, artifact and the deployed 5de12fd baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'aba444bea818f398c6f35099a4c356215867c3b6',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'02e252ec-485a-41e5-b6b1-d04668503ebb'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'39b5b4fb8ee9d2f8095e1700dc5f23ad0c471596');
  assert.equal(release.bytes,3215695);
  assert.equal(release.sha256,'01a8cbfa9f27d5cb0443d1584f5ff9099e9adeb85f2c2418ff2f6f1fd84a7781');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
