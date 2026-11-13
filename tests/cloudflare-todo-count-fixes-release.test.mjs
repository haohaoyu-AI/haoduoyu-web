import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {todoCountFixesRelease as release,removeAnalysisRelease as previous,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('to-do counter fixes pin exact source, artifact and the current production baseline',async()=>{
  assert.equal(release.commit,'e407cabf98f8b3e5ad1215fc7c8d915204443b10');
  assert.equal(release.tree,'bbaf06721b573c94387b8054a24248a650d4eba8');
  assert.equal(release.bytes,3046801);
  assert.equal(release.sha256,'6ef13de15ca585f52187d02255fab4fbf91de960fd969c94ee4aadcfe8a23fda');
  assert.equal(release.baseline,'b8d744ce-94c5-4d14-8330-6ee45abeb52b','the version run 43379262582 uploaded');
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
