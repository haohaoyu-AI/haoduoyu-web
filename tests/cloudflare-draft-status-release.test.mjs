import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {draftStatusRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('draft-status release pins exact source, artifact and the deployed outbox baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'855f65c75840dfaa0963f5e984e9128f528f90a4',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'ee2e5363-8bd0-46e0-89ce-a565d672f996'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'0d7f1a0f46502042a66c56c7abb3ab89cc8c4e70');
  assert.equal(release.bytes,3292856);
  assert.equal(release.sha256,'75ab1fbda984d9ededdca1ab669a4531fc66f313a5874c8171b31633624360e9');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
