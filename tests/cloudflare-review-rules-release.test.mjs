import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reviewRulesPromptsRelease,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

const env=()=>({GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  TARGET_COMMIT:reviewRulesPromptsRelease.commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:reviewRulesPromptsRelease.baseline});

test('Rules/prompts release pins exact current source, tree, artifact and production baseline',async()=>{
  assert.equal(reviewRulesPromptsRelease.commit,'d715770a7753ea70931b330ce297fd566af6f0dd');
  assert.equal(reviewRulesPromptsRelease.tree,'4281cb471b94c392f823ac595b8f88c805a279a1');
  assert.equal(reviewRulesPromptsRelease.bytes,2919290);
  assert.equal(reviewRulesPromptsRelease.sha256,'a2649c03a40db81773545f2d131ace8bf58ac80b2681b033f331836cb889e436');
  assert.equal(reviewRulesPromptsRelease.baseline,'1a68c912-b532-4719-b4ec-e06afbe7e46a');
  assert.throws(()=>validateRequest({...env(),EXPECTED_CURRENT_VERSION:'b0d087c9-0713-45b0-bbed-2cde9e100c16'}));
  assert.throws(()=>validateRequest({...env(),TARGET_COMMIT:'faa86f862f032f8a896d813ea4ac2f7d3eb13b96'}));
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
