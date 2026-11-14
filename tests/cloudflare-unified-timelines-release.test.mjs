import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unifiedTimelinesRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('unified timelines pin exact source, artifact and the deployed 3b6fadf baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'c61cb41fafc7180e73325e5d27b4212c0348d825',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'005bd44b-2262-4ab2-81d2-cac8391e1156'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'80893167b3707597f71ba041cb142bcd8fbbf059');
  assert.equal(release.bytes,3149490);
  assert.equal(release.sha256,'d87a77e47864b72cc8655869d976587c18c586377373b9254a3975d810968c41');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'ab1beb48-453c-4d06-84b8-62d3c5fad69b'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
