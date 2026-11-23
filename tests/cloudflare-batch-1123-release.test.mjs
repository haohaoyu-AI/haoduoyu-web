import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  repository, batch1123Release as release, validateRequest, verifyEligibility, verifyWorker,
} from '../.github/scripts/release-policy.mjs';

test('batch-1123 resumes the exact upload of run 45132257072 on the deployed baseline', async () => {
  const env = {
    GITHUB_REPOSITORY: repository,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    TARGET_COMMIT: 'a6ffdd499305679f87a60e0a2361a373ce9fe6c4',
    EXPECTED_CURRENT_VERSION: '15bb1795-ee68-499c-ab7b-f186a530fdd8',
    LOCAL_UPLOAD_STOPPED: 'true',
    UPLOADED_VERSION: '41bbea72-bfcf-4622-99a7-47bec99ab3ec',
  };
  assert.equal(validateRequest(env), release);
  assert.equal(release.tree, '0249acf9da328c88af7d5a246469805533012cb7');
  assert.equal(release.bytes, 3296375);
  assert.equal(release.sha256, '4acfd60481ace444080cf4e14d548f5c64f176230a5a65545fa89bdf46759cd2');
  assert.throws(() => validateRequest({...env, UPLOADED_VERSION: env.EXPECTED_CURRENT_VERSION}));
  assert.throws(() => validateRequest({...env, UPLOADED_VERSION: ''}));
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
