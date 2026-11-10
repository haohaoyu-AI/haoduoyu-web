import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {claudeTrendsRelease,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

const env=()=>({GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  TARGET_COMMIT:claudeTrendsRelease.commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:claudeTrendsRelease.baseline});

test('Claude trends release pins exact current source, tree, artifact and production baseline',async()=>{
  assert.equal(claudeTrendsRelease.commit,'e993885c752e97532214ef14a2fcf32b324bc08c');
  assert.equal(claudeTrendsRelease.tree,'c1cde2cf59de1dddc28cc9e5a3401b72bea2871f');
  assert.equal(claudeTrendsRelease.bytes,2852117);
  assert.equal(claudeTrendsRelease.sha256,'e2d26a1967a346c9a6d78f088945467359fee3dddede6f48027a307470de2651');
  assert.equal(validateRequest(env()),claudeTrendsRelease);
  for(const [key,value] of Object.entries({TARGET_COMMIT:'main',LOCAL_UPLOAD_STOPPED:'false',GITHUB_REF:'refs/heads/other',
    GITHUB_EVENT_NAME:'push',EXPECTED_CURRENT_VERSION:'4d874ca9-ede5-4e03-a7e5-ef3c1bc0babd'})) {
    assert.throws(()=>validateRequest({...env(),[key]:value}));
  }
  const good={sha:claudeTrendsRelease.commit,tree:{sha:claudeTrendsRelease.tree}};
  assert.equal(await verifyEligibility(claudeTrendsRelease.commit,{request:async()=>Response.json(good)}),claudeTrendsRelease);
  await assert.rejects(verifyEligibility(claudeTrendsRelease.commit,{request:async()=>Response.json({...good,tree:{sha:'0'.repeat(40)}})}));
  assert.throws(()=>verifyWorker(Buffer.from('wrong artifact'),claudeTrendsRelease.commit));
  const yaml=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(yaml.includes('          - '+claudeTrendsRelease.commit));
  assert.equal(yaml.split("inputs.target_commit == '"+claudeTrendsRelease.commit+"'").length-1,11);
  assert.ok(yaml.includes('node --test tests/claude-robots.test.mjs tests/static-etags.test.mjs tests/public-business.test.mjs'));
  assert.ok(yaml.includes('tests/cloudflare-claude-trends-release.test.mjs'));
  assert.match(yaml,/group: haoduoyu-cloudflare-production/);assert.match(yaml,/cancel-in-progress: false/);
  assert.match(yaml,/environment: cloudflare-production/);assert.doesNotMatch(yaml,/contents: write|wrangler secret|migrations apply/);
});
