// Closed inverse for the reviewed cockpit chart restoration. Production files stay untouched.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

export const cockpitRestoreBaseline="3f4789dbe1994508ed89d15e472613e91b94fb87";
export const cockpitRestoreAssets=Object.freeze([
  "public/app.js",
  "public/index.html",
  "public/sw.js",
  ".ci/public-assets.json"
]);
export const cockpitRestoreSources=Object.freeze([
  "web/pages/content-review.mjs",
  "web/pages/review-trends.mjs"
]);
export const cockpitRestoreHashes=Object.freeze({
  "public/app.js": "2e06f7582876d465e25833181eb664f008a48a6e2034e817358b583133ca77c0",
  "public/index.html": "de82cff7c6a6a3fa1bdbab1d4c33577e5ea37a9acd71703c879094187d6461eb",
  "public/sw.js": "88141fa2b246f21f80117dd210fdd8430ded419be9d6c1a58587bb7e2f1b6b88",
  ".ci/public-assets.json": "96abc1174f6e590f01abbb0dbf5583a74c4ecbd1f90bfc22ab0882957ef92621",
  "web/pages/content-review.mjs": "c3816641bfbb699fb5b08f7bd785d2da2ca0d38db2229b64c6d4449d96362b94",
  "web/pages/review-trends.mjs": "8df0fd1972efa8742b8e31f0110f00a61c3456e119c198f76902b06b317a911d"
});
const root=new URL('../',import.meta.url),cache=new Map();
const hash=source=>createHash('sha256').update(source).digest('hex');
export function cockpitRestoreBefore(file) {
  assert.ok(Object.hasOwn(cockpitRestoreHashes,file),'bounded cockpit restoration path');
  if(!cache.has(file))cache.set(file,execFileSync('git',['show',cockpitRestoreBaseline+':'+file],
    {cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}));
  return cache.get(file);
}
export function verifyCockpitRestoreSources(read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8')) {
  for(const file of cockpitRestoreSources) assert.equal(hash(read(file)),cockpitRestoreHashes[file],
    'exact approved cockpit restoration source: '+file);
}
// Historical intermediates and unrecognized bytes pass through, never normalized away.
// The older strict projection layers remain responsible for rejecting unknown assets.
export function projectCockpitRestore(file,source) {
  if(!cockpitRestoreAssets.includes(file)||hash(source)!==cockpitRestoreHashes[file])return source;
  verifyCockpitRestoreSources();
  return cockpitRestoreBefore(file);
}
