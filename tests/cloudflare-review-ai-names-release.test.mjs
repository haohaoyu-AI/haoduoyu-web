import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reviewAiNamesRelease,sixUpgradesRelease,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

const env=()=>({GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  TARGET_COMMIT:reviewAiNamesRelease.commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:reviewAiNamesRelease.baseline});

test('review AI names release pins exact source, tree, Worker artifact and current production baseline',async()=>{
  assert.equal(reviewAiNamesRelease.commit,'3528ad571af87b243f479611d4a049cb83ee1fa7');
  assert.equal(reviewAiNamesRelease.tree,'0da628fa632d2ac4b20fc5aac0a59111c9b45386');
  assert.equal(reviewAiNamesRelease.bytes,3058658);
  assert.equal(reviewAiNamesRelease.sha256,'d853f3c10213f4c2428204f0aafdb232a09df1a5565d156166c956dcd7496dfe');
  assert.equal(reviewAiNamesRelease.baseline,'f5dc58f5-30f5-46af-86d0-6dcc70e3a2ff','the version the six-upgrades release uploaded');
  assert.equal(sixUpgradesRelease.commit,'75e2db9a05fd04cb873c1f41046a9ad14dfbf01e');
  assert.equal(sixUpgradesRelease.bytes,3054674);
  assert.throws(()=>validateRequest({...env(),EXPECTED_CURRENT_VERSION:sixUpgradesRelease.baseline}));
  assert.throws(()=>validateRequest({...env(),TARGET_COMMIT:'faa86f862f032f8a896d813ea4ac2f7d3eb13b96'}));
  assert.equal(validateRequest(env()),reviewAiNamesRelease);
  assert.equal(validateRequest({...env(),TARGET_COMMIT:sixUpgradesRelease.commit,
    EXPECTED_CURRENT_VERSION:sixUpgradesRelease.baseline}),sixUpgradesRelease);
  for(const [key,value] of Object.entries({TARGET_COMMIT:'main',LOCAL_UPLOAD_STOPPED:'false',GITHUB_REF:'refs/heads/other',
    GITHUB_EVENT_NAME:'push',EXPECTED_CURRENT_VERSION:'a9efcff1-4876-40ff-b4c3-b23cf5846543'})) {
    assert.throws(()=>validateRequest({...env(),[key]:value}));
  }
  const good={sha:reviewAiNamesRelease.commit,tree:{sha:reviewAiNamesRelease.tree}};
  assert.equal(await verifyEligibility(reviewAiNamesRelease.commit,{request:async()=>Response.json(good)}),reviewAiNamesRelease);
  await assert.rejects(verifyEligibility(reviewAiNamesRelease.commit,{request:async()=>Response.json({...good,tree:{sha:'0'.repeat(40)}})}));
  await assert.rejects(verifyEligibility(reviewAiNamesRelease.commit,{request:async()=>Response.json({...good,sha:'0'.repeat(40)})}));
  await assert.rejects(verifyEligibility(reviewAiNamesRelease.commit,{request:async()=>new Response('',{status:403})}));
  assert.throws(()=>verifyWorker(Buffer.alloc(reviewAiNamesRelease.bytes),reviewAiNamesRelease.commit));
  const yaml=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  const options=yaml.split('        options:\n')[1].split('      run_regression_tests:')[0];
  assert.ok(options.includes('          - '+reviewAiNamesRelease.commit+'\n'));
  assert.ok(options.includes('          - '+sixUpgradesRelease.commit+'\n'));
  assert.match(yaml,/group: haoduoyu-cloudflare-production/);assert.match(yaml,/cancel-in-progress: false/);
  assert.match(yaml,/environment: cloudflare-production/);assert.doesNotMatch(yaml,/contents: write|wrangler secret|migrations apply/);
});
