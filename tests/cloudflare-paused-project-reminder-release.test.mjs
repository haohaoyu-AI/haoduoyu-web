import test from 'node:test';
import assert from 'node:assert/strict';
import {pausedProjectReminderRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('paused project reminder UI pins the exact source and newest production baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'86d36dda4f80f528da5cf089f018299a0bcb5e53',LOCAL_UPLOAD_STOPPED:'true',
    EXPECTED_CURRENT_VERSION:'fd3ea4cc-0ab5-4656-94dc-418e8dffef5f'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'1bfa784163175243848978fd6dd03806945a56fd');
  assert.equal(release.bytes,3135349);
  assert.equal(release.sha256,'d4981257ca951628e3fd5ae2cc4f947d94a3e6934fecc545285283c098fd15da');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const patch of [{EXPECTED_CURRENT_VERSION:'6c9bcf79-c638-44d7-8530-6f426ebf5c70'},
    {LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/feature'},
    {UPLOADED_VERSION:'a9c883c8-8f35-4dd1-afeb-f129422d33e4'}])assert.throws(()=>validateRequest({...env,...patch}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
});
