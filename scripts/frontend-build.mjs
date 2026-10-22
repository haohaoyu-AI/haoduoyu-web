import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

export async function frontendBundle(root = fileURLToPath(new URL('../', import.meta.url))) {
  const result = await build({
    absWorkingDir: root, entryPoints: ['web/main.mjs'], bundle: true,
    format: 'esm', minify: false, treeShaking: false, charset: 'utf8', write: false,
  });
  return result.outputFiles[0].contents;
}
export async function checkFrontend(root) {
  const actual = await readFile(resolve(root, 'public/app.js'));
  assert.deepEqual(actual, Buffer.from(await frontendBundle(root)),
    'public/app.js differs from the readable web/main.mjs build; regenerate and commit it');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  if (process.argv.includes('--check')) {
    await checkFrontend(root);
    console.log('Verified committed frontend bundle matches web/ before regeneration.');
  } else {
    const bytes = await frontendBundle(root);
    await writeFile(resolve(root, 'public/app.js'), bytes);
    console.log(`Built readable frontend ESM: ${bytes.length} bytes (unminified).`);
  }
}
