import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {todoCountNoteRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('todo count-note release pins exact source, artifact and the deployed 797289c baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'b478432def7d3188c5dd5c4560c076144d96f026',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'fbce687a-1226-4b54-90ad-df8ea18e276b'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'7010e01501369a02d727e33ebf38f2e1c25b6294');
  assert.equal(release.bytes,3171797);
  assert.equal(release.sha256,'8b40303a2aa02f7ea91f7d49e018ef2dd0a64784de12aa4a7acc2a759c992ce8');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
