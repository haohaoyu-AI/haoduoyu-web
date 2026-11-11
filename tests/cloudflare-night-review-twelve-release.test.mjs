import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nightReviewTwelveRelease,siteFiveUpgradesRelease,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

const env=()=>({GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  TARGET_COMMIT:nightReviewTwelveRelease.commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:nightReviewTwelveRelease.baseline});

test('night review twelve release pins exact source, tree, Worker artifact and current production baseline',async()=>{
  assert.equal(nightReviewTwelveRelease.commit,'3f4789dbe1994508ed89d15e472613e91b94fb87');
  assert.equal(nightReviewTwelveRelease.tree,'bb54dc9ec7ea995060ee4bd055c5bbf96e7890e0');
  assert.equal(nightReviewTwelveRelease.bytes,2943560);
  assert.equal(nightReviewTwelveRelease.sha256,'2a98bb9300978b6219756009aa44a1ec3c4af323b157649fc2ec0417340a3462');
  assert.equal(nightReviewTwelveRelease.baseline,'fd2185c8-4114-45a4-bd32-f1e71119dfbd');
  assert.equal(siteFiveUpgradesRelease.commit,'58ac4a201e5a3a0e9107d077c3642997b09ece07');
  assert.equal(siteFiveUpgradesRelease.bytes,2946480);
  assert.throws(()=>validateRequest({...env(),EXPECTED_CURRENT_VERSION:siteFiveUpgradesRelease.baseline}));
  assert.throws(()=>validateRequest({...env(),TARGET_COMMIT:'faa86f862f032f8a896d813ea4ac2f7d3eb13b96'}));
  assert.equal(validateRequest(env()),nightReviewTwelveRelease);
  assert.equal(validateRequest({...env(),TARGET_COMMIT:siteFiveUpgradesRelease.commit,
    EXPECTED_CURRENT_VERSION:siteFiveUpgradesRelease.baseline}),siteFiveUpgradesRelease);
  for(const [key,value] of Object.entries({TARGET_COMMIT:'main',LOCAL_UPLOAD_STOPPED:'false',GITHUB_REF:'refs/heads/other',
    GITHUB_EVENT_NAME:'push',EXPECTED_CURRENT_VERSION:'a9efcff1-4876-40ff-b4c3-b23cf5846543'})) {
    assert.throws(()=>validateRequest({...env(),[key]:value}));
  }
  const good={sha:nightReviewTwelveRelease.commit,tree:{sha:nightReviewTwelveRelease.tree}};
  assert.equal(await verifyEligibility(nightReviewTwelveRelease.commit,{request:async()=>Response.json(good)}),nightReviewTwelveRelease);
  await assert.rejects(verifyEligibility(nightReviewTwelveRelease.commit,{request:async()=>Response.json({...good,tree:{sha:'0'.repeat(40)}})}));
  assert.throws(()=>verifyWorker(Buffer.alloc(nightReviewTwelveRelease.bytes),nightReviewTwelveRelease.commit));
  const yaml=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  const options=yaml.split('        options:\n')[1].split('      run_regression_tests:')[0];
  assert.ok(options.startsWith('          # Exact source and Worker bytes verified before registration.\n          - '+nightReviewTwelveRelease.commit+'\n'));
  assert.ok(options.includes('          - '+siteFiveUpgradesRelease.commit+'\n'));
  assert.match(yaml,/group: haoduoyu-cloudflare-production/);assert.match(yaml,/cancel-in-progress: false/);
  assert.match(yaml,/environment: cloudflare-production/);assert.doesNotMatch(yaml,/contents: write|wrangler secret|migrations apply/);
});
