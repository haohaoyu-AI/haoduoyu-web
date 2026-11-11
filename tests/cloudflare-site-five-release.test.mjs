import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reviewRulesPromptsRelease,siteFiveUpgradesRelease,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

const env=()=>({GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  TARGET_COMMIT:siteFiveUpgradesRelease.commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:siteFiveUpgradesRelease.baseline});

test('site upgrade release pins exact source, tree, Worker artifact and current production baseline',async()=>{
  assert.equal(siteFiveUpgradesRelease.commit,'58ac4a201e5a3a0e9107d077c3642997b09ece07');
  assert.equal(siteFiveUpgradesRelease.tree,'b9aec25fd79d9bc195f1c2eaee02134976a54fe4');
  assert.equal(siteFiveUpgradesRelease.bytes,2946480);
  assert.equal(siteFiveUpgradesRelease.sha256,'31e52a9001f33e0d13fa78eddac4202cb6cab4c46e71e4a9f6a6ce8c9730106d');
  assert.equal(siteFiveUpgradesRelease.baseline,'a9efcff1-4876-40ff-b4c3-b23cf5846543');
  assert.equal(reviewRulesPromptsRelease.commit,'d715770a7753ea70931b330ce297fd566af6f0dd');
  assert.equal(reviewRulesPromptsRelease.bytes,2919290);
  assert.throws(()=>validateRequest({...env(),EXPECTED_CURRENT_VERSION:reviewRulesPromptsRelease.baseline}));
  assert.throws(()=>validateRequest({...env(),TARGET_COMMIT:'faa86f862f032f8a896d813ea4ac2f7d3eb13b96'}));
  assert.equal(validateRequest(env()),siteFiveUpgradesRelease);
  assert.equal(validateRequest({...env(),TARGET_COMMIT:reviewRulesPromptsRelease.commit,
    EXPECTED_CURRENT_VERSION:reviewRulesPromptsRelease.baseline}),reviewRulesPromptsRelease);
  for(const [key,value] of Object.entries({TARGET_COMMIT:'main',LOCAL_UPLOAD_STOPPED:'false',GITHUB_REF:'refs/heads/other',
    GITHUB_EVENT_NAME:'push',EXPECTED_CURRENT_VERSION:'1a68c912-b532-4719-b4ec-e06afbe7e46a'})) {
    assert.throws(()=>validateRequest({...env(),[key]:value}));
  }
  const good={sha:siteFiveUpgradesRelease.commit,tree:{sha:siteFiveUpgradesRelease.tree}};
  assert.equal(await verifyEligibility(siteFiveUpgradesRelease.commit,{request:async()=>Response.json(good)}),siteFiveUpgradesRelease);
  await assert.rejects(verifyEligibility(siteFiveUpgradesRelease.commit,{request:async()=>Response.json({...good,tree:{sha:'0'.repeat(40)}})}));
  assert.throws(()=>verifyWorker(Buffer.alloc(siteFiveUpgradesRelease.bytes),siteFiveUpgradesRelease.commit));
  const yaml=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  const options=yaml.split('        options:\n')[1].split('      run_regression_tests:')[0];
  assert.ok(options.startsWith('          # Exact source and Worker bytes verified before registration.\n          - '+siteFiveUpgradesRelease.commit+'\n'));
  assert.ok(options.includes('          - '+reviewRulesPromptsRelease.commit+'\n'));
  assert.match(yaml,/group: haoduoyu-cloudflare-production/);assert.match(yaml,/cancel-in-progress: false/);
  assert.match(yaml,/environment: cloudflare-production/);assert.doesNotMatch(yaml,/contents: write|wrangler secret|migrations apply/);
});
