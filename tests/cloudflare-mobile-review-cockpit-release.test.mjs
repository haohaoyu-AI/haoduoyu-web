import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  repository, mobileReviewCockpitRelease as release, validateRequest, verifyEligibility, verifyWorker,
} from '../.github/scripts/release-policy.mjs';

test('mobile cockpit release pins the exact frontend Worker and its live baseline', async () => {
  const env = {
    GITHUB_REPOSITORY: repository,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    TARGET_COMMIT: '7867cbfe2f0bce06b969be001410ba2a847a2086',
    EXPECTED_CURRENT_VERSION: '30ae2725-d45c-499d-b3f0-3601b4830145',
    LOCAL_UPLOAD_STOPPED: 'true',
  };
  assert.equal(validateRequest(env), release);
  assert.equal(release.tree, '0b97f0aac4544c1a283e8bdbd6f568afeceed384');
  assert.equal(release.bytes, 3617305);
  assert.equal(release.sha256, 'cac27c5136d12025bcca244bf66d156e329ab17b94f7d0e71cadf26371d4f566');
  assert.throws(() => validateRequest({...env, EXPECTED_CURRENT_VERSION: '00000000-0000-4000-8000-000000000001'}), /baseline/);
  assert.throws(() => validateRequest({...env, UPLOADED_VERSION: env.EXPECTED_CURRENT_VERSION}), /already-uploaded/);

  const request = async url => {
    assert.equal(url, `https://api.github.com/repos/${repository}/git/commits/${release.commit}`);
    return Response.json({sha: release.commit, tree: {sha: release.tree}});
  };
  assert.equal(await verifyEligibility(release.commit, {request}), release);
  await assert.rejects(verifyEligibility(release.commit, {
    request: async () => Response.json({sha: release.commit, tree: {sha: '0'.repeat(40)}}),
  }), /source commit and tree/);
  assert.throws(() => verifyWorker(Buffer.alloc(release.bytes), release.commit), /SHA-256/);
  const workflow = readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml', import.meta.url), 'utf8');
  assert.equal(workflow.split('\n').filter(line => line === `          - ${release.commit}`).length, 1);
  const frontendCheck = workflow.split('\n      - name: Verify committed data trends frontend before regeneration\n')[1];
  assert.ok(frontendCheck?.split('\n')[0].includes(`inputs.target_commit == '${release.commit}'`));
});
