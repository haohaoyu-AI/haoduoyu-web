import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {speedUpRelease as release,todoCountFixesRelease as previous,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('speed-up pin exact source, artifact and the current production baseline',async()=>{
  assert.equal(release.commit,'e7499bd4d1b1f537636b2fb00b0dcf1199ab70cc');
  assert.equal(release.tree,'f5f9f53c1706d6e4ef3daa1b0a4ca57539d52127');
  assert.equal(release.bytes,3058520);
  assert.equal(release.sha256,'f44da1a42999d3e16a54ae6ddf3bcfe56422c9f17f1e4340ef06b682a5a55faf');
  assert.equal(release.baseline,'73703900-9614-4349-822b-cae862287fef','the version run 43382705028 uploaded');
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
