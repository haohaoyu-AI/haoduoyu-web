import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const CACHE_BASELINE = '60c896d11e0e755785589f83cb1bd2522fc548c3';
export async function referenceWorker(t, baseline = CACHE_BASELINE) {
  assert.match(baseline, /^[a-f0-9]{40}$/, 'fixed first-party commit required');
  const root = resolve(import.meta.dirname, '..');
  const directory = await mkdtemp(join(tmpdir(), 'synthetic-overview-reference-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const archive = execFileSync('git', ['archive', '--format=tar', baseline], {cwd: root, maxBuffer: 10 * 1024 * 1024});
  execFileSync('tar', ['-x', '-C', directory], {input: archive});
  // No new historical build code or dependencies are executed here.
  for (const file of ['package-lock.json', 'scripts/build.mjs'])
    assert.deepEqual(await readFile(join(directory, file)), await readFile(join(root, file)));
  await symlink(join(root, 'node_modules'), join(directory, 'node_modules'), 'dir');
  execFileSync(process.execPath, ['scripts/build.mjs'], {cwd: directory, maxBuffer: 1024 * 1024});
  return (await import(pathToFileURL(join(directory, 'dist/server/index.js')).href)).default;
}
