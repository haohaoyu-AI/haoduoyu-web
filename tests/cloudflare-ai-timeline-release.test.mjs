import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {aiTimelineRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('ai timeline pin exact source, artifact and the deployed 9fb3aaf baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'3b6fadfbe1795c5134eccdcc6a31e03565f591f8',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'a5c493db-c68a-441e-9e92-12066455ac71'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'40769a9c6b399d0d3f1ac103723846747c0febfc');
  assert.equal(release.bytes,3142860);
  assert.equal(release.sha256,'9f7c8bee6e64b6ea4c77415a0a15c4e3e4c8fd6c4c16a62ee2ef3f3e5a8162de');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'ab1beb48-453c-4d06-84b8-62d3c5fad69b'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
