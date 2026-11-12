import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {patternExamplesRelease,patternNamesWholeRelease,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

const env=()=>({GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  TARGET_COMMIT:patternExamplesRelease.commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:patternExamplesRelease.baseline});

test('pattern examples release pins exact source, tree, Worker artifact and current production baseline',async()=>{
  assert.equal(patternExamplesRelease.commit,'3fad099ae38fd2043ad398bedf9b0041af9ba082');
  assert.equal(patternExamplesRelease.tree,'46ed2c7141c8f7a6714fa3648c91366ad2f8b8f5');
  assert.equal(patternExamplesRelease.bytes,3062847);
  assert.equal(patternExamplesRelease.sha256,'85a1f4bfafec05ff8d39b7fa6391aff79c57c8049f56b555fc1af15da79e978c');
  assert.equal(patternExamplesRelease.baseline,'be38aa14-16a7-4942-beb3-d2a1108e31ff','the version the truncation fix uploaded');
  assert.equal(patternNamesWholeRelease.commit,'3584b78760770487feb8bf65ad2cbaee79d93aae');
  assert.equal(patternNamesWholeRelease.bytes,3058658);
  assert.throws(()=>validateRequest({...env(),EXPECTED_CURRENT_VERSION:patternNamesWholeRelease.baseline}));
  assert.throws(()=>validateRequest({...env(),TARGET_COMMIT:'faa86f862f032f8a896d813ea4ac2f7d3eb13b96'}));
  assert.equal(validateRequest(env()),patternExamplesRelease);
  assert.equal(validateRequest({...env(),TARGET_COMMIT:patternNamesWholeRelease.commit,
    EXPECTED_CURRENT_VERSION:patternNamesWholeRelease.baseline}),patternNamesWholeRelease);
  for(const [key,value] of Object.entries({TARGET_COMMIT:'main',LOCAL_UPLOAD_STOPPED:'false',GITHUB_REF:'refs/heads/other',
    GITHUB_EVENT_NAME:'push',EXPECTED_CURRENT_VERSION:'a9efcff1-4876-40ff-b4c3-b23cf5846543'})) {
    assert.throws(()=>validateRequest({...env(),[key]:value}));
  }
  const good={sha:patternExamplesRelease.commit,tree:{sha:patternExamplesRelease.tree}};
  assert.equal(await verifyEligibility(patternExamplesRelease.commit,{request:async()=>Response.json(good)}),patternExamplesRelease);
  await assert.rejects(verifyEligibility(patternExamplesRelease.commit,{request:async()=>Response.json({...good,tree:{sha:'0'.repeat(40)}})}));
  await assert.rejects(verifyEligibility(patternExamplesRelease.commit,{request:async()=>Response.json({...good,sha:'0'.repeat(40)})}));
  await assert.rejects(verifyEligibility(patternExamplesRelease.commit,{request:async()=>new Response('',{status:403})}));
  assert.throws(()=>verifyWorker(Buffer.alloc(patternExamplesRelease.bytes),patternExamplesRelease.commit));
  const yaml=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  const options=yaml.split('        options:\n')[1].split('      run_regression_tests:')[0];
  assert.ok(options.includes('          - '+patternExamplesRelease.commit+'\n'));
  assert.ok(options.includes('          - '+patternNamesWholeRelease.commit+'\n'));
  assert.match(yaml,/group: haoduoyu-cloudflare-production/);assert.match(yaml,/cancel-in-progress: false/);
  assert.match(yaml,/environment: cloudflare-production/);assert.doesNotMatch(yaml,/contents: write|wrangler secret|migrations apply/);
});
