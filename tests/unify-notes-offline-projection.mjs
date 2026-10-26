import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {projectUnifyMemosOfflineHistory,projectUnifyMemosOfflineModules} from './unify-memos-offline-projection.mjs';

const root=new URL('../',import.meta.url);
export const unifyNotesOfflineBaseline='77513b0823030dc2e8af53e9d76d23fd5b3fa14e';
export const unifyNotesOfflinePatch='0d3de57578b8c26c1b38e0cc5d2f2de6f3be1d48';
export const unifyNotesOfflinePaths=Object.freeze(['.ci/public-assets.json','public/app.js','public/index.html','public/sw.js',
  'web/core/note-entries-state.mjs','web/core/notes-editor-view.mjs','web/daily-notes-controller.mjs',
  'web/offline/cache.mjs','web/offline/document.mjs','web/offline/drafts.mjs','web/offline/note-mutations.mjs',
  'web/offline/notes.mjs','web/offline/outbox.mjs','web/offline/read-only.mjs','web/offline/runtime.mjs',
  'web/offline/sw-client.mjs','web/pages/daily-notes.mjs']);
export const unifyNotesOfflineAddedModules=Object.freeze(['web/offline/document.mjs','web/offline/drafts.mjs',
  'web/offline/note-mutations.mjs','web/offline/notes.mjs','web/offline/read-only.mjs']);
const added=new Set(unifyNotesOfflineAddedModules);
const acceptedDeltaSha256='5eea56d387f1f2cbdb3c13cb926f64d54fa7c2a61eec304284b3e58a95bdee30';
const label='exact approved workbench delta (unify notes offline)';
export const notesOfflineHash=value=>createHash('sha256').update(value).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const baselineCache=new Map();
export function unifyNotesOfflineBefore(file) {
  assert.ok(unifyNotesOfflinePaths.includes(file),label+' scope: '+file);
  if(!baselineCache.has(file))baselineCache.set(file,added.has(file)?'':git('show',unifyNotesOfflineBaseline+':'+file));
  return baselineCache.get(file);
}
export function validateUnifyNotesOfflineDelta(delta) {
  assert.equal(delta.baseline,unifyNotesOfflineBaseline,label+' fixed final todo-offline baseline');
  assert.equal(delta.patch_commit,unifyNotesOfflinePatch,label+' fixed reviewed patch');
  assert.deepEqual(Object.keys(delta.files).sort(),[...unifyNotesOfflinePaths],label+' exact notes-only scope');
  assert.deepEqual(delta.added_modules,[...unifyNotesOfflineAddedModules],label+' exact five added modules');
  assert.equal(notesOfflineHash(JSON.stringify(delta)),acceptedDeltaSha256,label+' independently pinned manifest');
  for(const file of unifyNotesOfflinePaths) {
    assert.equal(delta.files[file].before,added.has(file)?null:notesOfflineHash(unifyNotesOfflineBefore(file)),label+' baseline: '+file);
    assert.equal(delta.files[file].after,notesOfflineHash(git('show',unifyNotesOfflinePatch+':'+file)),label+' frozen patch: '+file);
  }
  return delta;
}
let reviewed;
export function unifyNotesOfflineManifest() {
  return reviewed??=validateUnifyNotesOfflineDelta(JSON.parse(read('tests/unify-notes-offline-delta.json')));
}

// Only an exact frozen C blob may restore the fixed final B source. Later
// editor, memo, API, UI or shell changes cannot authorize themselves via this layer.
export function projectUnifyNotesOffline(file,source) {
  if(!unifyNotesOfflinePaths.includes(file))return source;
  const before=unifyNotesOfflineBefore(file),entry=unifyNotesOfflineManifest().files[file];
  if(source===before)return source;
  assert.equal(notesOfflineHash(source),entry.after,label+': '+file);
  if(file==='.ci/public-assets.json') {
    const expected=JSON.parse(before);
    for(const asset of ['app.js','index.html','sw.js'])
      expected.files[asset]=unifyNotesOfflineManifest().files['public/'+asset].after;
    assert.deepEqual(JSON.parse(source),expected,label+' corresponding note-offline asset pins only');
  }
  return before;
}

const historicalManifests=['article-pipeline-ui-delta.json','public-note-ui-delta.json','workbench-ui-delta.json',
  'reconciliation-ui-delta.json','workbench-round2-delta.json','workbench-round3-delta.json','workbench-round4-delta.json',
  'workbench-round5-delta.json','workbench-round6-delta.json','workbench-round6-badge-delta.json',
  'unify-stage1-delta.json','unify-stage2-delta.json','unify-sw-delta.json','unify-todos-offline-delta.json'];
let historicalCommits;
const historicalDigests=new Map();
function historicalHashes(file) {
  if(!historicalDigests.has(file)) {
    historicalCommits??=[...new Set(historicalManifests.flatMap(name=>{
      const manifest=JSON.parse(git('show',unifyNotesOfflineBaseline+':tests/'+name));
      return [manifest.baseline,manifest.patch_commit].filter(Boolean);
    }))];
    const digests=new Set();
    for(const commit of historicalCommits) {
      const exists=git('ls-tree','--name-only',commit,'--',file).trim();
      digests.add(notesOfflineHash(exists?git('show',commit+':'+file):''));
    }
    historicalDigests.set(file,digests);
  }
  return historicalDigests.get(file);
}
export function projectUnifyNotesOfflineHistory(file,source) {
  source=projectUnifyMemosOfflineHistory(file,source);
  if(!unifyNotesOfflinePaths.includes(file))return source;
  const entry=unifyNotesOfflineManifest().files[file],digest=notesOfflineHash(source);
  if(digest===entry.after||source===unifyNotesOfflineBefore(file))return projectUnifyNotesOffline(file,source);
  assert.ok(historicalHashes(file).has(digest),label+' exact historical input: '+file);
  return source;
}

export function projectUnifyNotesOfflineModules(files,readSource=read) {
  files=projectUnifyMemosOfflineModules(files,readSource);
  for(const file of files.filter(file=>unifyNotesOfflineAddedModules.includes(file))) {
    const source=readSource(file);
    assert.equal(notesOfflineHash(source),unifyNotesOfflineManifest().files[file].after,label+' exact current added module: '+file);
    assert.equal(projectUnifyNotesOffline(file,source),'',label+' added module projects to absence: '+file);
  }
  return files.filter(file=>!unifyNotesOfflineAddedModules.includes(file));
}
