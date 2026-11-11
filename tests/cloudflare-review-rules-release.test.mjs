import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reviewRulesPromptsRelease,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

const env=()=>({GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  TARGET_COMMIT:reviewRulesPromptsRelease.commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:reviewRulesPromptsRelease.baseline});

test('Rules/prompts release pins exact current source, tree, artifact and production baseline',async()=>{
  assert.equal(reviewRulesPromptsRelease.commit,'faa86f862f032f8a896d813ea4ac2f7d3eb13b96');
  assert.equal(reviewRulesPromptsRelease.tree,'e0cc5c64960373bd9f80f9b545e7a77ba477c9a4');
  assert.equal(reviewRulesPromptsRelease.bytes,2914201);
  assert.equal(reviewRulesPromptsRelease.sha256,'41027cf065db8247b42d30d42438ade5aab4a695673328aedcee382f94c3be98');
  assert.equal(validateRequest(env()),reviewRulesPromptsRelease);
  for(const [key,value] of Object.entries({TARGET_COMMIT:'main',LOCAL_UPLOAD_STOPPED:'false',GITHUB_REF:'refs/heads/other',
    GITHUB_EVENT_NAME:'push',EXPECTED_CURRENT_VERSION:'4d874ca9-ede5-4e03-a7e5-ef3c1bc0babd'})) {
    assert.throws(()=>validateRequest({...env(),[key]:value}));
  }
  const good={sha:reviewRulesPromptsRelease.commit,tree:{sha:reviewRulesPromptsRelease.tree}};
  assert.equal(await verifyEligibility(reviewRulesPromptsRelease.commit,{request:async()=>Response.json(good)}),reviewRulesPromptsRelease);
  await assert.rejects(verifyEligibility(reviewRulesPromptsRelease.commit,{request:async()=>Response.json({...good,tree:{sha:'0'.repeat(40)}})}));
  assert.throws(()=>verifyWorker(Buffer.from('wrong artifact'),reviewRulesPromptsRelease.commit));
  const yaml=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(yaml.includes('          - '+reviewRulesPromptsRelease.commit));
  assert.equal(yaml.split("inputs.target_commit == '"+reviewRulesPromptsRelease.commit+"'").length-1,12);
  assert.ok(yaml.includes('node --test tests/claude-robots.test.mjs tests/static-etags.test.mjs tests/public-business.test.mjs'));
  assert.ok(yaml.includes('tests/cloudflare-review-rules-release.test.mjs'));
  assert.ok(yaml.includes('tests/content-review*.test.mjs tests/review-*.test.mjs'));
  assert.match(yaml,/group: haoduoyu-cloudflare-production/);assert.match(yaml,/cancel-in-progress: false/);
  assert.match(yaml,/environment: cloudflare-production/);assert.doesNotMatch(yaml,/contents: write|wrangler secret|migrations apply/);
});
