import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {connectorAllRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('connector-all release pins exact source, artifact and the deployed 0ab490e baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'0630f4302603b574577563d8ecad2b81391b63a0',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'5563d93b-c2e1-4c3e-8bb1-f6f1f2196855'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'eef6fe9c735e06578dab06116daa3c8a1a01dfee');
  assert.equal(release.bytes,3261122);
  assert.equal(release.sha256,'9d6e9c03cc4a9d51861cf81e64c2172eb00c1bcee4ae4a5abebd73124449a987');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
