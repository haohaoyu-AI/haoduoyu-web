import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decisionsTimelineRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('decisions timeline release pins exact source, artifact and the deployed 154bd73 baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'805e14b8037a2e221ba2823f395689d78f21a399',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'46848449-3ad1-4a04-ab35-82fbb7dd731d'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'72aa62ca298f4ea309a558766596e2243d6d3a26');
  assert.equal(release.bytes,3185021);
  assert.equal(release.sha256,'611cc17503b03258bde18765c134c7d15fc6a8ff92a152ba8f1062fd24e174e2');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
