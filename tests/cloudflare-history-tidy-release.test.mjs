import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {historyTidyRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('history tidy pin exact source, artifact and the deployed d0b13d8 baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'24d9380eef7fc387c416d603efa30d3cd593f212',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'dd3ddf89-4e4f-47a8-b8dd-003ac6cbf1ca'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'d26c0f310d25ae957a846025a03d5136847a56b1');
  assert.equal(release.bytes,3133678);
  assert.equal(release.sha256,'25bdd64efe85355cc32218dddb190e5525383ac37736693d55f556569ff90757');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'ab1beb48-453c-4d06-84b8-62d3c5fad69b'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
