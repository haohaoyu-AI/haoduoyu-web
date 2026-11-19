import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  repository, reviewArchiveRelease as release, validateRequest, verifyEligibility, verifyWorker,
} from '../.github/scripts/release-policy.mjs';

test('review archive is registered as an exact first upload on the verified baseline', async () => {
  const env = {
    GITHUB_REPOSITORY: repository,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    TARGET_COMMIT: '03021ba20adca80fdc35b86515523fc0fc6595f1',
    EXPECTED_CURRENT_VERSION: '4af9e71f-5d70-4cde-a80a-3d78ae7bcc13',
    LOCAL_UPLOAD_STOPPED: 'true',
  };
  assert.equal(validateRequest(env), release);
  assert.equal(release.tree, '16fec9a415dcadc8e32d66b45661f47abe29c558');
  assert.equal(release.bytes, 3507870);
  assert.equal(release.sha256, '1aca85b7b31915a77443c3e191fbe8b9df61587ff0e28c090cba423932078cd2');
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
