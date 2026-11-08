import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const frontend = path.join(root,'frontend');
const evidence = path.join(root,'evidence/public-20261108');
const manifest = JSON.parse(await fs.readFile(path.join(evidence,'manifest.json'),'utf8'));
for (const asset of manifest.assets) {
  assert.ok(!asset.error,asset.path);
  const captured = await fs.readFile(path.join(evidence,asset.path.slice(1)));
  const source = await fs.readFile(path.join(frontend,'public',asset.path.slice(1)));
  assert.equal(captured.length,asset.bytes);
  assert.equal(crypto.createHash('sha256').update(captured).digest('hex'),asset.sha256);
  assert.deepEqual(source,captured,asset.path+' source differs from actual public asset');
}
assert.deepEqual(await fs.readFile(path.join(frontend,'public/index.html')),await fs.readFile(path.join(evidence,'index.html')));
const module = process.env.ESBUILD_MODULE ? pathToFileURL(process.env.ESBUILD_MODULE).href : 'esbuild';
const {build, version} = await import(module);
if (version !== '0.28.2') throw new Error('Source provenance requires the pinned esbuild 0.28.2');
const result = await build({absWorkingDir:frontend,entryPoints:['web/main.mjs'],bundle:true,
  format:'esm',minify:false,treeShaking:false,charset:'utf8',write:false});
assert.deepEqual(Buffer.from(result.outputFiles[0].contents),await fs.readFile(path.join(evidence,'app.js')),
  'Readable web source does not reproduce actual original deployed app.js');
console.log('PASS: readable frontend rebuild exactly matches current public app.js; index and 13 assets match.');
