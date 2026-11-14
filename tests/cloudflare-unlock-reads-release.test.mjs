import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unlockReadsRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('unlocked reads pin exact source, artifact and the deployed 8fa6cc7 baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'d0b13d839449b8a9e62559b69e37abd012906d1a',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'bdabea90-101b-4950-a90d-6aeb07c6763b'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'32fc4f05bdcd05d31d6de918beb71fced262c687');
  assert.equal(release.bytes,3129221);
  assert.equal(release.sha256,'d6046a064ab87cd24206cc12621a238f0c536825c989cb6fd9bec322d1ece527');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'ab1beb48-453c-4d06-84b8-62d3c5fad69b'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
