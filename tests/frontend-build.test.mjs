import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {frontendBundle, checkFrontend} from '../scripts/frontend-build.mjs';

test('frontend equality rejects a modified artifact before regeneration and detects source changes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'synthetic-frontend-equality-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(join(root, 'web'));await mkdir(join(root, 'public'));
  await writeFile(join(root, 'web/main.mjs'), "globalThis.syntheticValue = 'Synthetic original';\n");
  const original = await frontendBundle(root);
  await writeFile(join(root, 'public/app.js'), original);
  await checkFrontend(root);
  await writeFile(join(root, 'public/app.js'), Buffer.concat([original, Buffer.from('\n// Synthetic manual artifact edit\n')]));
  await assert.rejects(checkFrontend(root), /public\/app.js differs/);
  await writeFile(join(root, 'public/app.js'), original);
  await writeFile(join(root, 'web/main.mjs'), "globalThis.syntheticValue = 'Synthetic changed';\n");
  await assert.rejects(checkFrontend(root), /public\/app.js differs/);
  assert.deepEqual(await readFile(join(root, 'public/app.js')), Buffer.from(original),
    'the check never silently repairs the committed artifact');
});
