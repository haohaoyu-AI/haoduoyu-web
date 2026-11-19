import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  repository, reviewBatchTwoRelease as release, validateRequest, verifyEligibility, verifyWorker,
} from '../.github/scripts/release-policy.mjs';

test('review batch two is registered as an exact first upload on the deployed batch one', async () => {
  const env = {
    GITHUB_REPOSITORY: repository,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    TARGET_COMMIT: '9619425c364ad12f0df9eaec66ffbd7778a6ca11',
    EXPECTED_CURRENT_VERSION: '0785c8d6-1d7a-416a-b01a-840ae68b798a',
    LOCAL_UPLOAD_STOPPED: 'true',
  };
  assert.equal(validateRequest(env), release);
  assert.equal(release.tree, 'ef3b0c643c21e4bc3f4702b716c6f322a0834eff');
  assert.equal(release.bytes, 3567972);
  assert.equal(release.sha256, 'b936ec8713f2176b51d2e83401ee2701f052795b042ec413a82a022e70983a25');
  assert.throws(() => validateRequest({...env, UPLOADED_VERSION: env.EXPECTED_CURRENT_VERSION}), /already-uploaded/);
  assert.throws(() => validateRequest({...env, EXPECTED_CURRENT_VERSION: '00000000-0000-4000-8000-000000000001'}), /baseline/);

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
