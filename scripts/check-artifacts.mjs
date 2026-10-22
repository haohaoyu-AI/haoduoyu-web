import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const pins = JSON.parse(await readFile(new URL('.ci/public-assets.json', root), 'utf8'));
let moduleSource = false;
try { await access(new URL('web/main.mjs', root)); moduleSource = true; } catch {}
assert.equal(moduleSource, false,
  'ES module source detected: phase 4 must replace legacy pins with reproducible frontend bundle comparison');
const { assets } = await import(new URL('src/assets.generated.mjs', root));
const { default: worker } = await import(new URL('dist/server/index.js', root));
for (const [name, expected] of Object.entries(pins.files)) {
  const content = await readFile(new URL('public/' + name, root));
  assert.equal(createHash('sha256').update(content).digest('hex'), expected, name + ': reviewed source pin differs');
  const key = name === 'api-docs.html' ? 'api-docs' : name;
  assert.equal(assets[key].content, content.toString('utf8'), name + ': generated asset differs');
  const route = name === 'index.html' ? '/' : '/' + key;
  const response = await worker.fetch(new Request('http://artifact.invalid' + route), {});
  assert.equal(response.status, 200, name + ': built Worker asset response failed');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), content, name + ': Worker bytes differ');
}
console.log(`Verified ${Object.keys(pins.files).length} public source pins and generated/built Worker assets.`);
console.log('Phase 1 scope: public/app.js remains source; web/ build equality is not yet applicable.');
