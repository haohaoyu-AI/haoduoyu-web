import test from 'node:test';
import assert from 'node:assert/strict';
import {progressiveOfflineRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('recent-first offline sync pins exact source, artifact and confirmed production baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'b05613792693d88a1b081e511eaf95cca08d5459',LOCAL_UPLOAD_STOPPED:'true',
    EXPECTED_CURRENT_VERSION:'ba1d5743-9c09-42c8-9528-39000830d365'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'1b0924e5deaf7d89ca7ba6f449d560d817e159fb');
  assert.equal(release.bytes,3068718);
  assert.equal(release.sha256,'bdb24edc4e53f0cf3437e75f0b6b3cef652fb0ca5a4cbe48166f95a86f3b7864');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'73703900-9614-4349-822b-cae862287fef'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
});
