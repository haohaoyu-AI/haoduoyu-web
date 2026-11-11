import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {claudeNotesDraftsRelease,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

const env=()=>({GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  TARGET_COMMIT:claudeNotesDraftsRelease.commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:claudeNotesDraftsRelease.baseline});

test('Claude notes drafts release pins the exact retained-draft source, tree, artifact and current production baseline',async()=>{
  assert.equal(claudeNotesDraftsRelease.commit,'bc8449887e6b88f11b05ccbed13613f2f34e9b57');
  assert.equal(claudeNotesDraftsRelease.tree,'7c7f9bd1345db9cfa8b6e47e218c5f0390389d69');
  assert.equal(claudeNotesDraftsRelease.bytes,2857206);
  assert.equal(claudeNotesDraftsRelease.sha256,'62994011a7d233ce396248ca9a610f0b1eaa6a374aef9c3d56c157df0cfac2fb');
  assert.equal(claudeNotesDraftsRelease.baseline,'b0d087c9-0713-45b0-bbed-2cde9e100c16','the deployed PR46 version');
  assert.equal(validateRequest(env()),claudeNotesDraftsRelease);
  for(const [key,value] of Object.entries({TARGET_COMMIT:'main',LOCAL_UPLOAD_STOPPED:'false',GITHUB_REF:'refs/heads/other',
    GITHUB_EVENT_NAME:'push',EXPECTED_CURRENT_VERSION:'4d874ca9-ede5-4e03-a7e5-ef3c1bc0babd'})) {
    assert.throws(()=>validateRequest({...env(),[key]:value}));
  }
  const good={sha:claudeNotesDraftsRelease.commit,tree:{sha:claudeNotesDraftsRelease.tree}};
  assert.equal(await verifyEligibility(claudeNotesDraftsRelease.commit,{request:async()=>Response.json(good)}),claudeNotesDraftsRelease);
  await assert.rejects(verifyEligibility(claudeNotesDraftsRelease.commit,{request:async()=>Response.json({...good,tree:{sha:'0'.repeat(40)}})}));
  assert.throws(()=>verifyWorker(Buffer.from('wrong artifact'),claudeNotesDraftsRelease.commit));
  const yaml=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(yaml.includes('          - '+claudeNotesDraftsRelease.commit));
  assert.equal(yaml.split("inputs.target_commit == '"+claudeNotesDraftsRelease.commit+"'").length-1,11);
  assert.ok(yaml.includes('node --test tests/claude-robots.test.mjs tests/static-etags.test.mjs tests/public-business.test.mjs'));
  assert.ok(yaml.includes('tests/cloudflare-claude-trends-release.test.mjs'));
  assert.match(yaml,/group: haoduoyu-cloudflare-production/);assert.match(yaml,/cancel-in-progress: false/);
  assert.match(yaml,/environment: cloudflare-production/);assert.doesNotMatch(yaml,/contents: write|wrangler secret|migrations apply/);
});
