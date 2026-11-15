import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {uiPass2Release as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('ui-pass-2 release pins exact source, artifact and the deployed f8c2e2f baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'951f4f98b193a537de060e392eb4388671d79da0',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'2085bc42-07b9-434f-a5a6-0f722c6a2180'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'bc6aee6500ef0178c7d282fbfa14f57086ad0619');
  assert.equal(release.bytes,3194113);
  assert.equal(release.sha256,'d9e2ee20c7fb858f05df65fec384e10219c9e58e96b1413a66c152b5d01a18ca');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
