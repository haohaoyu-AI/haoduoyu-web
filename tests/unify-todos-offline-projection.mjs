import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url);
export const unifyTodosOfflineBaseline='f952ad75de6c9a7fc3d832859998da75213d7f27';
export const unifyTodosOfflinePatch='5b03836c8c1fea3f9d84918c2f8f8fb358b8f56a';
export const unifyTodosOfflinePaths=Object.freeze(['.ci/public-assets.json','public/app.js','public/index.html',
  'public/offline.css','public/sw.js','scripts/build.mjs','web/core/api.mjs','web/main.mjs',
  'web/offline/cache.mjs','web/offline/conflict.mjs','web/offline/db.mjs','web/offline/outbox.mjs',
  'web/offline/runtime.mjs','web/offline/sync.mjs','web/offline/ui.mjs']);
export const unifyTodosOfflineAddedModules=Object.freeze(['web/offline/cache.mjs','web/offline/conflict.mjs',
  'web/offline/db.mjs','web/offline/outbox.mjs','web/offline/runtime.mjs','web/offline/sync.mjs','web/offline/ui.mjs']);
const added=new Set(['public/offline.css',...unifyTodosOfflineAddedModules]);
const acceptedDeltaSha256='9cf6016401b0e3517475b824fdc4a92adccedf6d9afc2ed5e040d62ab7ef94d7';
const label='exact approved workbench delta (unify todos offline)';
export const todosOfflineHash=value=>createHash('sha256').update(value).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const baselineCache=new Map();
export function unifyTodosOfflineBefore(file) {
  assert.ok(unifyTodosOfflinePaths.includes(file),label+' scope: '+file);
  if(!baselineCache.has(file))baselineCache.set(file,added.has(file)?'':git('show',unifyTodosOfflineBaseline+':'+file));
  return baselineCache.get(file);
}
export function validateUnifyTodosOfflineDelta(delta) {
  assert.equal(delta.baseline,unifyTodosOfflineBaseline,label+' fixed SW-only baseline');
  assert.equal(delta.patch_commit,unifyTodosOfflinePatch,label+' fixed reviewed patch');
  assert.deepEqual(Object.keys(delta.files).sort(),[...unifyTodosOfflinePaths],label+' exact todos-only scope');
  assert.deepEqual(delta.added_modules,[...unifyTodosOfflineAddedModules],label+' exact seven added modules');
  assert.equal(todosOfflineHash(JSON.stringify(delta)),acceptedDeltaSha256,label+' independently pinned manifest');
  for(const file of unifyTodosOfflinePaths) {
    assert.equal(delta.files[file].before,added.has(file)?null:todosOfflineHash(unifyTodosOfflineBefore(file)),label+' baseline: '+file);
    assert.equal(delta.files[file].after,todosOfflineHash(git('show',unifyTodosOfflinePatch+':'+file)),label+' frozen patch: '+file);
  }
  return delta;
}
let reviewed;
export function unifyTodosOfflineManifest() {
  return reviewed??=validateUnifyTodosOfflineDelta(JSON.parse(read('tests/unify-todos-offline-delta.json')));
}

// Only an exact frozen B blob may restore the fixed SW-only source. A later
// editor, cache, API, UI or shell change cannot authorize itself via this layer.
export function projectUnifyTodosOffline(file,source) {
  if(!unifyTodosOfflinePaths.includes(file))return source;
  const before=unifyTodosOfflineBefore(file),entry=unifyTodosOfflineManifest().files[file];
  if(source===before)return source;
  assert.equal(todosOfflineHash(source),entry.after,label+': '+file);
  if(file==='.ci/public-assets.json') {
    const expected=JSON.parse(before);
    for(const asset of ['app.js','index.html','offline.css','sw.js'])
      expected.files[asset]=unifyTodosOfflineManifest().files['public/'+asset].after;
    assert.deepEqual(JSON.parse(source),expected,label+' corresponding todo-offline asset pins only');
  }
  return before;
}

const historicalManifests=['article-pipeline-ui-delta.json','public-note-ui-delta.json','workbench-ui-delta.json',
  'reconciliation-ui-delta.json','workbench-round2-delta.json','workbench-round3-delta.json','workbench-round4-delta.json',
  'workbench-round5-delta.json','workbench-round6-delta.json','workbench-round6-badge-delta.json',
  'unify-stage1-delta.json','unify-stage2-delta.json','unify-sw-delta.json'];
let historicalCommits;
const historicalDigests=new Map();
function historicalHashes(file) {
  if(!historicalDigests.has(file)) {
    historicalCommits??=[...new Set(historicalManifests.flatMap(name=>{
      const manifest=JSON.parse(git('show',unifyTodosOfflineBaseline+':tests/'+name));
      return [manifest.baseline,manifest.patch_commit].filter(Boolean);
    }))];
    const digests=new Set();
    for(const commit of historicalCommits) {
      const exists=git('ls-tree','--name-only',commit,'--',file).trim();
      digests.add(todosOfflineHash(exists?git('show',commit+':'+file):''));
    }
    historicalDigests.set(file,digests);
  }
  return historicalDigests.get(file);
}
export function projectUnifyTodosOfflineHistory(file,source) {
  if(!unifyTodosOfflinePaths.includes(file))return source;
  const entry=unifyTodosOfflineManifest().files[file],digest=todosOfflineHash(source);
  if(digest===entry.after||source===unifyTodosOfflineBefore(file))return projectUnifyTodosOffline(file,source);
  assert.ok(historicalHashes(file).has(digest),label+' exact historical input: '+file);
  return source;
}

export function projectUnifyTodosOfflineModules(files,readSource=read) {
  for(const file of files.filter(file=>unifyTodosOfflineAddedModules.includes(file))) {
    const source=readSource(file);
    assert.equal(todosOfflineHash(source),unifyTodosOfflineManifest().files[file].after,label+' exact current added module: '+file);
    assert.equal(projectUnifyTodosOffline(file,source),'',label+' added module projects to absence: '+file);
  }
  return files.filter(file=>!unifyTodosOfflineAddedModules.includes(file));
}
