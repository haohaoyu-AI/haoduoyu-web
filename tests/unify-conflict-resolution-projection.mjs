import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url);
export const unifyConflictResolutionBaseline='ec96f40c464dbb985f8d3f6d0f321335cb9ecda5';
export const unifyConflictResolutionPatch='73e53150246b32052b7cbb42adccb6759d53fcfc';
export const unifyConflictResolutionPaths=Object.freeze(['.ci/public-assets.json','public/app.js','public/index.html','public/sw.js',
  'web/daily-notes-controller.mjs','web/memos-controller.mjs','web/offline/conflict-decisions.mjs',
  'web/offline/conflict-draft-guards.mjs','web/offline/conflict-plan.mjs','web/offline/conflict-transport.mjs',
  'web/offline/conflict.mjs','web/offline/outbox.mjs','web/offline/resolution-ledger.mjs','web/offline/runtime.mjs','web/offline/ui.mjs']);
export const unifyConflictResolutionAddedModules=Object.freeze(['web/offline/conflict-decisions.mjs',
  'web/offline/conflict-draft-guards.mjs','web/offline/conflict-plan.mjs','web/offline/conflict-transport.mjs',
  'web/offline/resolution-ledger.mjs']);
const added=new Set(unifyConflictResolutionAddedModules);
const acceptedDeltaSha256='9ff87a73f8020c38214132c2e83a74851829aa9d24fd6b7f2b9bac6bb53abc36';
const label='exact approved workbench delta (unify conflict resolution)';
export const conflictResolutionHash=value=>createHash('sha256').update(value).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const baselineCache=new Map();
export function unifyConflictResolutionBefore(file) {
  assert.ok(unifyConflictResolutionPaths.includes(file),label+' scope: '+file);
  if(!baselineCache.has(file))baselineCache.set(file,added.has(file)?'':git('show',unifyConflictResolutionBaseline+':'+file));
  return baselineCache.get(file);
}
export function validateUnifyConflictResolutionDelta(delta) {
  assert.equal(delta.baseline,unifyConflictResolutionBaseline,label+' fixed final memo-offline baseline');
  assert.equal(delta.patch_commit,unifyConflictResolutionPatch,label+' fixed reviewed patch');
  assert.deepEqual(Object.keys(delta.files).sort(),[...unifyConflictResolutionPaths],label+' exact conflict-resolution scope');
  assert.deepEqual(delta.added_modules,[...unifyConflictResolutionAddedModules],label+' exact five added modules');
  assert.equal(conflictResolutionHash(JSON.stringify(delta)),acceptedDeltaSha256,label+' independently pinned manifest');
  for(const file of unifyConflictResolutionPaths) {
    assert.equal(delta.files[file].before,added.has(file)?null:conflictResolutionHash(unifyConflictResolutionBefore(file)),label+' baseline: '+file);
    assert.equal(delta.files[file].after,conflictResolutionHash(git('show',unifyConflictResolutionPatch+':'+file)),label+' frozen patch: '+file);
  }
  return delta;
}
let reviewed;
export function unifyConflictResolutionManifest() {
  return reviewed??=validateUnifyConflictResolutionDelta(JSON.parse(read('tests/unify-conflict-resolution-delta.json')));
}

// Only an exact frozen E blob may restore the fixed final D source. Later
// editor, API, UI or shell changes cannot authorize themselves via this layer.
export function projectUnifyConflictResolution(file,source) {
  if(!unifyConflictResolutionPaths.includes(file))return source;
  const before=unifyConflictResolutionBefore(file),entry=unifyConflictResolutionManifest().files[file];
  if(source===before)return source;
  assert.equal(conflictResolutionHash(source),entry.after,label+': '+file);
  if(file==='.ci/public-assets.json') {
    const expected=JSON.parse(before);
    for(const asset of ['app.js','index.html','sw.js'])
      expected.files[asset]=unifyConflictResolutionManifest().files['public/'+asset].after;
    assert.deepEqual(JSON.parse(source),expected,label+' corresponding conflict-resolution asset pins only');
  }
  return before;
}

const historicalManifests=['article-pipeline-ui-delta.json','public-note-ui-delta.json','workbench-ui-delta.json',
  'reconciliation-ui-delta.json','workbench-round2-delta.json','workbench-round3-delta.json','workbench-round4-delta.json',
  'workbench-round5-delta.json','workbench-round6-delta.json','workbench-round6-badge-delta.json',
  'unify-stage1-delta.json','unify-stage2-delta.json','unify-sw-delta.json','unify-todos-offline-delta.json',
  'unify-notes-offline-delta.json','unify-memos-offline-delta.json'];
let historicalCommits;
const historicalDigests=new Map();
function historicalHashes(file) {
  if(!historicalDigests.has(file)) {
    // D retains this exact superseded source as a historical inverse.
    historicalCommits??=[...new Set(['cc98a9786576d17b2eb33f8a1f94d78e36ae7b4b',...historicalManifests.flatMap(name=>{
      const manifest=JSON.parse(git('show',unifyConflictResolutionBaseline+':tests/'+name));
      return [manifest.baseline,manifest.patch_commit].filter(Boolean);
    })])];
    const digests=new Set();
    for(const commit of historicalCommits) {
      const exists=git('ls-tree','--name-only',commit,'--',file).trim();
      digests.add(conflictResolutionHash(exists?git('show',commit+':'+file):''));
    }
    historicalDigests.set(file,digests);
  }
  return historicalDigests.get(file);
}
export function projectUnifyConflictResolutionHistory(file,source) {
  if(!unifyConflictResolutionPaths.includes(file))return source;
  const entry=unifyConflictResolutionManifest().files[file],digest=conflictResolutionHash(source);
  if(digest===entry.after||source===unifyConflictResolutionBefore(file))return projectUnifyConflictResolution(file,source);
  assert.ok(historicalHashes(file).has(digest),label+' exact historical input: '+file);
  return source;
}

export function projectUnifyConflictResolutionModules(files,readSource=read) {
  for(const file of files.filter(file=>unifyConflictResolutionAddedModules.includes(file))) {
    const source=readSource(file);
    assert.equal(conflictResolutionHash(source),unifyConflictResolutionManifest().files[file].after,label+' exact current added module: '+file);
    assert.equal(projectUnifyConflictResolution(file,source),'',label+' added module projects to absence: '+file);
  }
  return files.filter(file=>!unifyConflictResolutionAddedModules.includes(file));
}
