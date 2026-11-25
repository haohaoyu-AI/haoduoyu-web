import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedOfflineRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('bounded offline release pins the reviewed source/tree/Worker and exact latest production baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'8fa6cc781f5765deb01da12b47f53b00b302d6ce',LOCAL_UPLOAD_STOPPED:'true',
    EXPECTED_CURRENT_VERSION:'9637f764-633c-4a89-89e8-7a3296477d21',UPLOADED_VERSION:''};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'cfa43720bbcd724c347792ea276e410b79d042e0');
  assert.equal(release.bytes,3128436);
  assert.equal(release.sha256,'56ba0df89bbbd5b1509e7c0f6439035179f6e59564e6a0c69da62d6fd1bc7136');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const patch of [{EXPECTED_CURRENT_VERSION:'c3b18ec2-ca4f-474c-9e23-829e33e55d56'},
    {LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/feature'},
    {UPLOADED_VERSION:'a9c883c8-8f35-4dd1-afeb-f129422d33e4'}])assert.throws(()=>validateRequest({...env,...patch}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
});
