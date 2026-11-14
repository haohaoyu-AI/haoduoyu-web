import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {timelineOnlyRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('timeline only pin exact source, artifact and the deployed 001cfa5 baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'9fb3aaf0a0c09e3f52473282d6ebe2dbcd965c49',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'74a81fbe-be68-4a27-9d7f-c681ee063707'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'134490cbd3588bc1993efe64897e1f1befd72f9e');
  assert.equal(release.bytes,3137890);
  assert.equal(release.sha256,'6daa2105f6d175082d6f67e0f99fa59d8407597595d8ddcc63a07aa53098e48f');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'ab1beb48-453c-4d06-84b8-62d3c5fad69b'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
