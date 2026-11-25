import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {patternNamesWholeRelease,reviewAiNamesRelease,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

const env=()=>({GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  TARGET_COMMIT:patternNamesWholeRelease.commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:patternNamesWholeRelease.baseline});

test('pattern names whole release pins exact source, tree, Worker artifact and current production baseline',async()=>{
  assert.equal(patternNamesWholeRelease.commit,'3584b78760770487feb8bf65ad2cbaee79d93aae');
  assert.equal(patternNamesWholeRelease.tree,'da512b191174c47353104d87c11a685f683bab8d');
  assert.equal(patternNamesWholeRelease.bytes,3058658);
  assert.equal(patternNamesWholeRelease.sha256,'8fceb6512bfbe89cfe7acc357cffdd1726a2d869c0cdda0a5833483dd8beaeac');
  assert.equal(patternNamesWholeRelease.baseline,'50b3d721-0549-4660-b58d-256543b9a406','the version the names release uploaded');
  assert.equal(reviewAiNamesRelease.commit,'3528ad571af87b243f479611d4a049cb83ee1fa7');
  assert.equal(reviewAiNamesRelease.bytes,3058658);
  assert.throws(()=>validateRequest({...env(),EXPECTED_CURRENT_VERSION:reviewAiNamesRelease.baseline}));
  assert.throws(()=>validateRequest({...env(),TARGET_COMMIT:'faa86f862f032f8a896d813ea4ac2f7d3eb13b96'}));
  assert.equal(validateRequest(env()),patternNamesWholeRelease);
  assert.equal(validateRequest({...env(),TARGET_COMMIT:reviewAiNamesRelease.commit,
    EXPECTED_CURRENT_VERSION:reviewAiNamesRelease.baseline}),reviewAiNamesRelease);
  for(const [key,value] of Object.entries({TARGET_COMMIT:'main',LOCAL_UPLOAD_STOPPED:'false',GITHUB_REF:'refs/heads/other',
    GITHUB_EVENT_NAME:'push',EXPECTED_CURRENT_VERSION:'a9efcff1-4876-40ff-b4c3-b23cf5846543'})) {
    assert.throws(()=>validateRequest({...env(),[key]:value}));
  }
  const good={sha:patternNamesWholeRelease.commit,tree:{sha:patternNamesWholeRelease.tree}};
  assert.equal(await verifyEligibility(patternNamesWholeRelease.commit,{request:async()=>Response.json(good)}),patternNamesWholeRelease);
  await assert.rejects(verifyEligibility(patternNamesWholeRelease.commit,{request:async()=>Response.json({...good,tree:{sha:'0'.repeat(40)}})}));
  await assert.rejects(verifyEligibility(patternNamesWholeRelease.commit,{request:async()=>Response.json({...good,sha:'0'.repeat(40)})}));
  await assert.rejects(verifyEligibility(patternNamesWholeRelease.commit,{request:async()=>new Response('',{status:403})}));
  assert.throws(()=>verifyWorker(Buffer.alloc(patternNamesWholeRelease.bytes),patternNamesWholeRelease.commit));
  const yaml=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  const options=yaml.split('        options:\n')[1].split('      run_regression_tests:')[0];
  assert.ok(options.includes('          - '+patternNamesWholeRelease.commit+'\n'));
  assert.ok(options.includes('          - '+reviewAiNamesRelease.commit+'\n'));
  assert.match(yaml,/group: haoduoyu-cloudflare-production/);assert.match(yaml,/cancel-in-progress: false/);
  assert.match(yaml,/environment: cloudflare-production/);assert.doesNotMatch(yaml,/contents: write|wrangler secret|migrations apply/);
});
