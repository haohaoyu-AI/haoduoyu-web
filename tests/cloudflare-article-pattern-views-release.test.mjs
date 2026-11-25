import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {articlePatternViewsRelease as release,todoCountFixesRelease as previous,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('article pattern views pin exact source, artifact and the current production baseline',async()=>{
  assert.equal(release.commit,'003f01e77fe7572a1b38161e59503ac7c9d477d0');
  assert.equal(release.tree,'fa50c4f20079e8b69e1de9869d024afbdbce884d');
  assert.equal(release.bytes,3055102);
  assert.equal(release.sha256,'d2efe52da19576e3d3b07d7b3a59ca7caff4b126fc631ec0ac9564e757547c47');
  assert.equal(release.baseline,'fb1090ac-0dd6-41a7-826a-0470d7088f51','the version run 43380718316 uploaded');
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:release.commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:release.baseline};
  assert.equal(validateRequest(env),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:previous.baseline},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])
    assert.throws(()=>validateRequest({...env,...change}));
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  await assert.rejects(verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:'0'.repeat(40)}})}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const yaml=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(yaml.includes('          - '+release.commit+'\n'));
  assert.ok(yaml.includes("inputs.target_commit == '"+release.commit+"'"),'the committed frontend is checked before regeneration');
  assert.doesNotMatch(yaml,/contents: write|wrangler secret|migrations apply/);
});
