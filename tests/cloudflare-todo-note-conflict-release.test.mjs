import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  repository, todoNoteConflictRelease as release, validateRequest, verifyEligibility, verifyWorker,
} from '../.github/scripts/release-policy.mjs';

test('todo-note-conflict is registered as an exact first upload on the deployed baseline', async () => {
  const env = {
    GITHUB_REPOSITORY: repository,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    TARGET_COMMIT: '771ef8d76fbd260cf94014f615a5a07bc6f53379',
    EXPECTED_CURRENT_VERSION: 'd59cae9f-7ae1-46b8-9f0a-50ab27171e46',
    LOCAL_UPLOAD_STOPPED: 'true',
  };
  assert.equal(validateRequest(env), release);
  assert.equal(release.tree, 'bd4ad575e8ca8b7d6d9794b8c12e71fc824bda1c');
  assert.equal(release.bytes, 3602277);
  assert.equal(release.sha256, '48c2bb975a65d06890dcbebee5d5a6792e5332c503bbbba184222b45991606b0');
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
