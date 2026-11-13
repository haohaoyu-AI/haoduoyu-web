import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {removeAnalysisRelease as release,aiReportModelOptionsRelease,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('analysis-layer removal pins exact source, artifact and the current production baseline',async()=>{
  assert.equal(release.commit,'9ec99b201ae1438684b5b79e5caa9b13fc2988f9');
  assert.equal(release.tree,'494d6707df005f1dd1efa928e0c303526be9d421');
  assert.equal(release.bytes,3045533);
  assert.equal(release.sha256,'4340a7525ab703475063b0215331d9eb255af061f6768bd43be1df2fbf84cf9d');
  assert.equal(release.baseline,'c7a663ad-c502-4ede-b068-bffda6d2d617','the version run 43268792694 uploaded');
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:release.commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:release.baseline};
  assert.equal(validateRequest(env),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:aiReportModelOptionsRelease.baseline},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])
    assert.throws(()=>validateRequest({...env,...change}));
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  await assert.rejects(verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:'0'.repeat(40)}})}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const yaml=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(yaml.includes('          - '+release.commit+'\n'));
  assert.ok(yaml.includes("if: inputs.target_commit == '"+release.commit+"'"),'the committed frontend is checked before regeneration');
  assert.doesNotMatch(yaml,/contents: write|wrangler secret|migrations apply/);
});
