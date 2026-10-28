// Immutable inverse of the reviewed 2026-10-28 workbench candidate.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isSmallFixProduct,projectSmallFix,projectQuietSync} from './oct28-small-fix-projection.mjs';

const root=new URL('../',import.meta.url);
export const oct28Baseline='b242cd573ab05c2fae2d5af779d7275ca45c20ad';
export const oct28Product='5f354ad52d76c3aff429f917a887c9f9cd14595b';
const baseline=oct28Baseline,product=oct28Product;
const approvedManifestSha256='f3ab401fb7a2881ba34a7cae2306042268cd38e0a2bc0494d3388cf4eff916af';
export const approvedPaths=Object.freeze([
  ".ci/public-assets.json",
  "db/schema.ts",
  "drizzle/0009_unscheduled_todos.sql",
  "drizzle/0010_note_labels.sql",
  "drizzle/meta/0009_snapshot.json",
  "drizzle/meta/0010_snapshot.json",
  "drizzle/meta/_journal.json",
  "public/app.js",
  "public/index.html",
  "public/sw.js",
  "public/tokens.css",
  "public/workbench.css",
  "scripts/build.mjs",
  "scripts/migration-contract.mjs",
  "scripts/migration-inventory.mjs",
  "src/account-profiles.mjs",
  "src/backup.mjs",
  "src/note-entries.mjs",
  "src/note-entry-validation.mjs",
  "src/note-labels.mjs",
  "src/note-month.mjs",
  "src/public-business.mjs",
  "src/unscheduled-todos.mjs",
  "src/workbench-snapshot.mjs",
  "src/worker.mjs",
  "web/actions.mjs",
  "web/core/note-entries-state.mjs",
  "web/core/notes-history.mjs",
  "web/core/notes-month.mjs",
  "web/core/router.mjs",
  "web/daily-notes-controller.mjs",
  "web/events.mjs",
  "web/forms.mjs",
  "web/memos-controller.mjs",
  "web/offline/cache.mjs",
  "web/offline/conflict-decisions.mjs",
  "web/offline/conflict-plan.mjs",
  "web/offline/conflict-transport.mjs",
  "web/offline/drafts.mjs",
  "web/offline/note-mutations.mjs",
  "web/offline/notes.mjs",
  "web/offline/outbox.mjs",
  "web/offline/resolution-ledger.mjs",
  "web/offline/runtime.mjs",
  "web/offline/sync.mjs",
  "web/offline/ui.mjs",
  "web/pages/daily-notes.mjs",
  "web/pages/memos.mjs",
  "web/pages/todos.mjs",
  "web/pages/unscheduled-todos.mjs",
  "web/ui/components.mjs",
  "web/ui/workbench.mjs"
]);
export const addedModules=Object.freeze([
  "web/core/notes-history.mjs",
  "web/core/notes-month.mjs",
  "web/pages/unscheduled-todos.mjs"
]);
const label='exact approved workbench delta (2026-10-28)';
const hash=value=>createHash('sha256').update(value).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const oldBlobs=new Map();
const before=file=>{
  if(!oldBlobs.has(file)) {
    const exists=git('ls-tree','--name-only',baseline,'--',file).trim();
    oldBlobs.set(file,exists?git('show',baseline+':'+file):'');
  }
  return oldBlobs.get(file);
};
let accepted;
export function reviewedOct28Manifest() {
  if(accepted)return accepted;
  assert.match(product,/^[a-f0-9]{40}$/,label+' reviewed immutable commit required');
  assert.match(approvedManifestSha256,/^[a-f0-9]{64}$/,label+' independent manifest digest required');
  const delta=JSON.parse(read('tests/oct28-delta.json'));
  validateOct28Manifest(delta);
  return accepted=delta;
}
export function validateOct28Manifest(delta) {
  assert.equal(delta.baseline,baseline,label+' exact baseline');
  assert.equal(delta.patch_commit,product,label+' exact product');
  assert.deepEqual(Object.keys(delta.files).sort(),[...approvedPaths],label+' independently reviewed path scope');
  assert.deepEqual(delta.added_modules,[...addedModules],label+' independently reviewed added modules');
  assert.equal(hash(JSON.stringify(delta)),approvedManifestSha256,label+' independently pinned manifest');
  for(const file of approvedPaths) {
    const old=before(file),exists=!!git('ls-tree','--name-only',baseline,'--',file).trim();
    assert.equal(delta.files[file].before,exists?hash(old):null,label+' fixed old bytes: '+file);
    assert.equal(delta.files[file].after,hash(git('show',product+':'+file)),label+' fixed new bytes: '+file);
  }
  return delta;
}

// Strict *current* inverse. The separate historical adapter should only pass
// inputs drawn from the finite prior checkpoint set already used by E. Unknown
// content is never silently projected. Byte inventory tests must independently
// assert that every new file exists on disk, including each added module.
export function projectOct28(file,source) {
  if(!approvedPaths.includes(file))return source;
  const delta=reviewedOct28Manifest(),old=before(file);
  if(source===old)return source;
  assert.equal(hash(source),delta.files[file].after,label+' current bytes: '+file);
  if(file==='.ci/public-assets.json') {
    const expected=JSON.parse(old);
    for(const asset of Object.keys(expected.files)) {
      const change=delta.files['public/'+asset];
      if(change)expected.files[asset]=change.after;
    }
    assert.deepEqual(JSON.parse(source),expected,label+' corresponding public asset hashes only');
  }
  return old;
}

const historicalDigests=new Map();
let historicalCommits;
const approvedScanAppend='\n# Approved exact historical public tokens.css checksum findings, 2026-10-28.\n' +
  '5f354ad52d76c3aff429f917a887c9f9cd14595b:.ci/public-assets.json:generic-api-key:16\n' +
  'bcb0dc48ae67797023b5c53162e3d4bbf44ac2d2:.ci/public-assets.json:generic-api-key:16\n' +
  '46dabbf8f62fa7c2ee3965d0f059ab41b62986fd:tests/oct28-small-fix-projection.mjs:generic-api-key:13\n';
export function projectApprovedScanAppend(file,source) {
  if(file!=='.gitleaksignore')return source;
  const prior=git('show',baseline+':'+file);
  if(source===prior)return prior;
  assert.equal(source,prior+approvedScanAppend,'exact approved scan exception append');
  return prior;
}
function historicalHashes(file) {
  if(!historicalDigests.has(file)) {
    historicalCommits??=[...new Set(['cc98a9786576d17b2eb33f8a1f94d78e36ae7b4b',...git('ls-tree','-r','--name-only',baseline,'tests').trim().split('\n').filter(name=>name.endsWith('-delta.json')).flatMap(name=>{
      const d=JSON.parse(git('show',baseline+':'+name));return [d.baseline,d.patch_commit].filter(Boolean);
    })])];
    const digests=new Set();
    for(const commit of historicalCommits) {
      const exists=git('ls-tree','--name-only',commit,'--',file).trim();
      digests.add(hash(exists?git('show',commit+':'+file):''));
    }
    historicalDigests.set(file,digests);
  }
  return historicalDigests.get(file);
}
export function projectOct28History(file,source) {
  source=projectApprovedScanAppend(file,source);
  source=projectQuietSync(file,source);
  if(isSmallFixProduct(file,source))source=projectSmallFix(file,source);
  if(!approvedPaths.includes(file))return source;
  const delta=reviewedOct28Manifest(),digest=hash(source);
  if(source===before(file)||digest===delta.files[file].after)return projectOct28(file,source);
  assert.ok(historicalHashes(file).has(digest),label+' exact historical input: '+file);
  return source;
}

export function projectOct28Modules(files,readSource=read) {
  for(const file of files.filter(file=>addedModules.includes(file))) {
    const source=readSource(file);
    assert.equal(hash(source),reviewedOct28Manifest().files[file].after,label+' added module: '+file);
    assert.equal(projectOct28(file,source),'',label+' added module projects to absence: '+file);
  }
  return files.filter(file=>!addedModules.includes(file));
}
