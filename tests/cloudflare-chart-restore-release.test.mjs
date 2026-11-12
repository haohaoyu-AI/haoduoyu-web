import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chartRestoreRelease,nightReviewTwelveRelease,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

const env=()=>({GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  TARGET_COMMIT:chartRestoreRelease.commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:chartRestoreRelease.baseline});

test('chart restoration release pins exact source, tree, Worker artifact and current production baseline',async()=>{
  assert.equal(chartRestoreRelease.commit,'ae90dc9148ce7d579714ad245f26d6829f1a556b');
  assert.equal(chartRestoreRelease.tree,'b498bbd131b1e59fd03fcc34786009b8a1169312');
  assert.equal(chartRestoreRelease.bytes,2966551);
  assert.equal(chartRestoreRelease.sha256,'f340427433c45bcb0a0dcd0ee31bccc434524c2149e152c8e59b3cf8c034799a');
  assert.equal(chartRestoreRelease.baseline,'b1a7f54e-41cc-416e-b027-c54cdcd41621');
  assert.equal(nightReviewTwelveRelease.commit,'3f4789dbe1994508ed89d15e472613e91b94fb87');
  assert.equal(nightReviewTwelveRelease.bytes,2943560);
  assert.throws(()=>validateRequest({...env(),EXPECTED_CURRENT_VERSION:nightReviewTwelveRelease.baseline}));
  assert.throws(()=>validateRequest({...env(),TARGET_COMMIT:'faa86f862f032f8a896d813ea4ac2f7d3eb13b96'}));
  assert.equal(validateRequest(env()),chartRestoreRelease);
  assert.equal(validateRequest({...env(),TARGET_COMMIT:nightReviewTwelveRelease.commit,
    EXPECTED_CURRENT_VERSION:nightReviewTwelveRelease.baseline}),nightReviewTwelveRelease);
  for(const [key,value] of Object.entries({TARGET_COMMIT:'main',LOCAL_UPLOAD_STOPPED:'false',GITHUB_REF:'refs/heads/other',
    GITHUB_EVENT_NAME:'push',EXPECTED_CURRENT_VERSION:'a9efcff1-4876-40ff-b4c3-b23cf5846543'})) {
    assert.throws(()=>validateRequest({...env(),[key]:value}));
  }
  const good={sha:chartRestoreRelease.commit,tree:{sha:chartRestoreRelease.tree}};
  assert.equal(await verifyEligibility(chartRestoreRelease.commit,{request:async()=>Response.json(good)}),chartRestoreRelease);
  await assert.rejects(verifyEligibility(chartRestoreRelease.commit,{request:async()=>Response.json({...good,tree:{sha:'0'.repeat(40)}})}));
  await assert.rejects(verifyEligibility(chartRestoreRelease.commit,{request:async()=>Response.json({...good,sha:'0'.repeat(40)})}));
  await assert.rejects(verifyEligibility(chartRestoreRelease.commit,{request:async()=>new Response('',{status:403})}));
  assert.throws(()=>verifyWorker(Buffer.alloc(chartRestoreRelease.bytes),chartRestoreRelease.commit));
  const yaml=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  const options=yaml.split('        options:\n')[1].split('      run_regression_tests:')[0];
  assert.ok(options.includes('          - '+chartRestoreRelease.commit+'\n'));
  assert.ok(options.includes('          - '+nightReviewTwelveRelease.commit+'\n'));
  assert.match(yaml,/group: haoduoyu-cloudflare-production/);assert.match(yaml,/cancel-in-progress: false/);
  assert.match(yaml,/environment: cloudflare-production/);assert.doesNotMatch(yaml,/contents: write|wrangler secret|migrations apply/);
});
