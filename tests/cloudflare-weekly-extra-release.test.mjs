import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  repository, weeklyExtraRelease as release, validateRequest, verifyEligibility, verifyWorker,
} from '../.github/scripts/release-policy.mjs';

test('weekly-extra registers the exact commit on the deployed weekly-count baseline', async () => {
  const env = {
    GITHUB_REPOSITORY: repository,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    TARGET_COMMIT: '1b56ac7084ffc1ad56ddb228c04446093bce0d08',
    EXPECTED_CURRENT_VERSION: '362d0a9b-cd6c-4b4a-aed6-8db3d000554b',
    LOCAL_UPLOAD_STOPPED: 'true',
  };
  assert.equal(validateRequest(env), release);
  assert.equal(release.tree, '15d719436946399046488b585fc8141a5098d359');
  assert.equal(release.bytes, 3317685);
  assert.equal(release.sha256, 'b4a8e1edf9f45a09b7bc21f721b705ddf879f5b4941eb9268879b9bddf0334be');
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
