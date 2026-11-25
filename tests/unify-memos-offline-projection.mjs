import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {projectUnifyConflictResolutionHistory,projectUnifyConflictResolutionModules} from './unify-conflict-resolution-projection.mjs';

const root=new URL('../',import.meta.url);
export const unifyMemosOfflineBaseline='3193568bb7275ad7b8cdf752ea0a6ef197d8a6a8';
export const unifyMemosOfflinePatch='2dc4e054c37151947faac8b544aad3cfe432740c';
export const unifyMemosOfflinePaths=Object.freeze(['.ci/public-assets.json','public/app.js','public/index.html','public/sw.js',
  'web/core/memos-local.mjs','web/core/memos-state.mjs','web/memos-controller.mjs','web/offline/memos.mjs',
  'web/offline/outbox.mjs','web/offline/runtime.mjs','web/pages/memos.mjs']);
export const unifyMemosOfflineAddedModules=Object.freeze(['web/core/memos-local.mjs','web/offline/memos.mjs']);
const added=new Set(unifyMemosOfflineAddedModules);
const acceptedDeltaSha256='c8a159c0a15964e2411f33199bb13e9a0269d3e348423e03d9152728a2239cee';
const label='exact approved workbench delta (unify memos offline)';
export const memosOfflineHash=value=>createHash('sha256').update(value).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const baselineCache=new Map();
export function unifyMemosOfflineBefore(file) {
  assert.ok(unifyMemosOfflinePaths.includes(file),label+' scope: '+file);
  if(!baselineCache.has(file))baselineCache.set(file,added.has(file)?'':git('show',unifyMemosOfflineBaseline+':'+file));
  return baselineCache.get(file);
}
export function validateUnifyMemosOfflineDelta(delta) {
  assert.equal(delta.baseline,unifyMemosOfflineBaseline,label+' fixed final note-offline baseline');
  assert.equal(delta.patch_commit,unifyMemosOfflinePatch,label+' fixed reviewed patch');
  assert.deepEqual(Object.keys(delta.files).sort(),[...unifyMemosOfflinePaths],label+' exact memos-only scope');
  assert.deepEqual(delta.added_modules,[...unifyMemosOfflineAddedModules],label+' exact two added modules');
  assert.equal(memosOfflineHash(JSON.stringify(delta)),acceptedDeltaSha256,label+' independently pinned manifest');
  for(const file of unifyMemosOfflinePaths) {
    assert.equal(delta.files[file].before,added.has(file)?null:memosOfflineHash(unifyMemosOfflineBefore(file)),label+' baseline: '+file);
    assert.equal(delta.files[file].after,memosOfflineHash(git('show',unifyMemosOfflinePatch+':'+file)),label+' frozen patch: '+file);
  }
  return delta;
}
let reviewed;
export function unifyMemosOfflineManifest() {
  return reviewed??=validateUnifyMemosOfflineDelta(JSON.parse(read('tests/unify-memos-offline-delta.json')));
}

// Only an exact frozen D blob may restore the fixed final C source. Later
// editor, grouping, API, UI or shell changes cannot authorize themselves via this layer.
export function projectUnifyMemosOffline(file,source) {
  if(!unifyMemosOfflinePaths.includes(file))return source;
  const before=unifyMemosOfflineBefore(file),entry=unifyMemosOfflineManifest().files[file];
  if(source===before)return source;
  assert.equal(memosOfflineHash(source),entry.after,label+': '+file);
  if(file==='.ci/public-assets.json') {
    const expected=JSON.parse(before);
    for(const asset of ['app.js','index.html','sw.js'])
      expected.files[asset]=unifyMemosOfflineManifest().files['public/'+asset].after;
    assert.deepEqual(JSON.parse(source),expected,label+' corresponding memo-offline asset pins only');
  }
  return before;
}

const historicalManifests=['article-pipeline-ui-delta.json','public-note-ui-delta.json','workbench-ui-delta.json',
  'reconciliation-ui-delta.json','workbench-round2-delta.json','workbench-round3-delta.json','workbench-round4-delta.json',
  'workbench-round5-delta.json','workbench-round6-delta.json','workbench-round6-badge-delta.json',
  'unify-stage1-delta.json','unify-stage2-delta.json','unify-sw-delta.json','unify-todos-offline-delta.json',
  'unify-notes-offline-delta.json'];
const supersededMemosOfflinePatch='cc98a9786576d17b2eb33f8a1f94d78e36ae7b4b';
const supersededDigests=new Map();
function supersededMemosOfflineHash(file) {
  if(!supersededDigests.has(file))supersededDigests.set(file,memosOfflineHash(git('show',supersededMemosOfflinePatch+':'+file)));
  return supersededDigests.get(file);
}
let historicalCommits;
const historicalDigests=new Map();
function historicalHashes(file) {
  if(!historicalDigests.has(file)) {
    historicalCommits??=[...new Set(historicalManifests.flatMap(name=>{
      const manifest=JSON.parse(git('show',unifyMemosOfflineBaseline+':tests/'+name));
      return [manifest.baseline,manifest.patch_commit].filter(Boolean);
    }))];
    const digests=new Set();
    for(const commit of historicalCommits) {
      const exists=git('ls-tree','--name-only',commit,'--',file).trim();
      digests.add(memosOfflineHash(exists?git('show',commit+':'+file):''));
    }
    historicalDigests.set(file,digests);
  }
  return historicalDigests.get(file);
}
export function projectUnifyMemosOfflineHistory(file,source) {
  source=projectUnifyConflictResolutionHistory(file,source);
  if(!unifyMemosOfflinePaths.includes(file))return source;
  const entry=unifyMemosOfflineManifest().files[file],digest=memosOfflineHash(source);
  if(digest===entry.after||source===unifyMemosOfflineBefore(file))return projectUnifyMemosOffline(file,source);
  // The previous reviewed D source remains a fixed historical inverse only;
  // its repaired bytes cannot pass the strict current-source entry above.
  if(digest===supersededMemosOfflineHash(file))return unifyMemosOfflineBefore(file);
  assert.ok(historicalHashes(file).has(digest),label+' exact historical input: '+file);
  return source;
}

export function projectUnifyMemosOfflineModules(files,readSource=read) {
  files=projectUnifyConflictResolutionModules(files,readSource);
  for(const file of files.filter(file=>unifyMemosOfflineAddedModules.includes(file))) {
    const source=projectUnifyConflictResolutionHistory(file,readSource(file));
    assert.equal(memosOfflineHash(source),unifyMemosOfflineManifest().files[file].after,label+' exact current added module: '+file);
    assert.equal(projectUnifyMemosOffline(file,source),'',label+' added module projects to absence: '+file);
  }
  return files.filter(file=>!unifyMemosOfflineAddedModules.includes(file));
}
