import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sixUpgradesRelease,chartRestoreRelease,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

const env=()=>({GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  TARGET_COMMIT:sixUpgradesRelease.commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:sixUpgradesRelease.baseline});

test('six upgrades release pins exact source, tree, Worker artifact and current production baseline',async()=>{
  assert.equal(sixUpgradesRelease.commit,'75e2db9a05fd04cb873c1f41046a9ad14dfbf01e');
  assert.equal(sixUpgradesRelease.tree,'218aaab30fe8e43306cf9e08ee25127baba649a1');
  assert.equal(sixUpgradesRelease.bytes,3054674);
  assert.equal(sixUpgradesRelease.sha256,'013bceaae5a2bd85381fba1e8d63d3dfc0361e76605474aeef4f4d700a2728c0');
  assert.equal(sixUpgradesRelease.baseline,'afb86c5e-6a63-448c-b1ac-9e6470d68e3a','the version the chart-restore release uploaded');
  assert.equal(chartRestoreRelease.commit,'ae90dc9148ce7d579714ad245f26d6829f1a556b');
  assert.equal(chartRestoreRelease.bytes,2966551);
  assert.throws(()=>validateRequest({...env(),EXPECTED_CURRENT_VERSION:chartRestoreRelease.baseline}));
  assert.throws(()=>validateRequest({...env(),TARGET_COMMIT:'faa86f862f032f8a896d813ea4ac2f7d3eb13b96'}));
  assert.equal(validateRequest(env()),sixUpgradesRelease);
  assert.equal(validateRequest({...env(),TARGET_COMMIT:chartRestoreRelease.commit,
    EXPECTED_CURRENT_VERSION:chartRestoreRelease.baseline}),chartRestoreRelease);
  for(const [key,value] of Object.entries({TARGET_COMMIT:'main',LOCAL_UPLOAD_STOPPED:'false',GITHUB_REF:'refs/heads/other',
    GITHUB_EVENT_NAME:'push',EXPECTED_CURRENT_VERSION:'a9efcff1-4876-40ff-b4c3-b23cf5846543'})) {
    assert.throws(()=>validateRequest({...env(),[key]:value}));
  }
  const good={sha:sixUpgradesRelease.commit,tree:{sha:sixUpgradesRelease.tree}};
  assert.equal(await verifyEligibility(sixUpgradesRelease.commit,{request:async()=>Response.json(good)}),sixUpgradesRelease);
  await assert.rejects(verifyEligibility(sixUpgradesRelease.commit,{request:async()=>Response.json({...good,tree:{sha:'0'.repeat(40)}})}));
  await assert.rejects(verifyEligibility(sixUpgradesRelease.commit,{request:async()=>Response.json({...good,sha:'0'.repeat(40)})}));
  await assert.rejects(verifyEligibility(sixUpgradesRelease.commit,{request:async()=>new Response('',{status:403})}));
  assert.throws(()=>verifyWorker(Buffer.alloc(sixUpgradesRelease.bytes),sixUpgradesRelease.commit));
  const yaml=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  const options=yaml.split('        options:\n')[1].split('      run_regression_tests:')[0];
  assert.ok(options.includes('          - '+sixUpgradesRelease.commit+'\n'));
  assert.ok(options.includes('          - '+chartRestoreRelease.commit+'\n'));
  assert.match(yaml,/group: haoduoyu-cloudflare-production/);assert.match(yaml,/cancel-in-progress: false/);
  assert.match(yaml,/environment: cloudflare-production/);assert.doesNotMatch(yaml,/contents: write|wrangler secret|migrations apply/);
});
