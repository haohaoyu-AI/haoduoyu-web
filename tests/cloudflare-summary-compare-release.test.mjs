import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summaryCompareRelease as release,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

test('summary compare pin exact source, artifact and the deployed 24d9380 baseline',async()=>{
  const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    TARGET_COMMIT:'cb90b5dbd864d44a056a27217e412bfd391ab697',LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'6c9bcf79-c638-44d7-8530-6f426ebf5c70'};
  assert.equal(validateRequest(env),release);
  assert.equal(release.tree,'91b49629172a2b34323b671a43bccbc28102aca5');
  assert.equal(release.bytes,3135140);
  assert.equal(release.sha256,'fcca07252ff3599c4ec4f700cee86f5600b86c07628c2270acbf0e82c977dcaa');
  assert.equal(await verifyEligibility(release.commit,{request:async()=>Response.json({sha:release.commit,tree:{sha:release.tree}})}),release);
  for(const change of [{EXPECTED_CURRENT_VERSION:'ab1beb48-453c-4d06-84b8-62d3c5fad69b'},{UPLOADED_VERSION:'11111111-1111-4111-8111-111111111111'},
    {TARGET_COMMIT:'main'},{LOCAL_UPLOAD_STOPPED:'false'},{GITHUB_REF:'refs/heads/other'}])assert.throws(()=>validateRequest({...env,...change}));
  assert.throws(()=>verifyWorker(Buffer.alloc(release.bytes),release.commit));
  const workflow=readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('          - '+release.commit));
  assert.ok(workflow.includes("inputs.target_commit == '"+release.commit+"'"));
});
