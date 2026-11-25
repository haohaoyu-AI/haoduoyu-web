import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {claudeConnectorRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('claude-connector release pins exact source, artifact and the deployed a6c257c baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'b0afcfa9efbb11952d42308aec83ececd4c19620',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'3637f13d-7fc6-4fb1-bede-08b2fb805cbd'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'a95ee7ccf462d0d878c455c5ebba11692355927d');
  assert.equal(release.bytes,3256950);
  assert.equal(release.sha256,'fc2d3abb0d23915bd272737dff710082ce7c66b67adc5b0e617e6ad8683f1340');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'d18f5913-49e8-4e65-89f9-23a2d7b149f6'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
