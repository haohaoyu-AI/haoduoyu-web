import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {claudeRobotsRelease,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

const env=()=>({GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  TARGET_COMMIT:claudeRobotsRelease.commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:claudeRobotsRelease.baseline});

test('Claude robots release pins exact current source, tree, artifact and production baseline',async()=>{
  assert.equal(claudeRobotsRelease.commit,'52f5f32f29526b302e0f58bf3272f2d636f782a4');
  assert.equal(claudeRobotsRelease.tree,'1f6a81efb262487d0051258179e643ea1ebb6393');
  assert.equal(claudeRobotsRelease.bytes,2844394);
  assert.equal(claudeRobotsRelease.sha256,'76650eec2aa59bc5ab5d4ccb7d5c1681718859b4b8118d02886abafa790e10b4');
  assert.equal(validateRequest(env()),claudeRobotsRelease);
  for(const [key,value] of Object.entries({TARGET_COMMIT:'main',LOCAL_UPLOAD_STOPPED:'false',GITHUB_REF:'refs/heads/other',
    GITHUB_EVENT_NAME:'push',EXPECTED_CURRENT_VERSION:'4d874ca9-ede5-4e03-a7e5-ef3c1bc0babd'})) {
    assert.throws(()=>validateRequest({...env(),[key]:value}));
  }
  const good={sha:claudeRobotsRelease.commit,tree:{sha:claudeRobotsRelease.tree}};
  assert.equal(await verifyEligibility(claudeRobotsRelease.commit,{request:async()=>Response.json(good)}),claudeRobotsRelease);
  await assert.rejects(verifyEligibility(claudeRobotsRelease.commit,{request:async()=>Response.json({...good,tree:{sha:'0'.repeat(40)}})}));
  assert.throws(()=>verifyWorker(Buffer.from('wrong artifact'),claudeRobotsRelease.commit));
  const yaml=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(yaml.includes('          - '+claudeRobotsRelease.commit));
  assert.equal(yaml.split("inputs.target_commit == '"+claudeRobotsRelease.commit+"'").length-1,11);
  assert.ok(yaml.includes('node --test tests/claude-robots.test.mjs tests/static-etags.test.mjs tests/public-business.test.mjs'));
  assert.ok(yaml.includes('tests/cloudflare-claude-robots-release.test.mjs'));
  assert.match(yaml,/group: haoduoyu-cloudflare-production/);assert.match(yaml,/cancel-in-progress: false/);
  assert.match(yaml,/environment: cloudflare-production/);assert.doesNotMatch(yaml,/contents: write|wrangler secret|migrations apply/);
});
