import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {projectUnifyStage1,projectedChangedFiles} from './unify-stage1-projection.mjs';
import {projectUnifyStage2} from './unify-stage2-projection.mjs';
import {projectUnifySw,projectUnifySwModules} from './unify-sw-projection.mjs';
import {projectUnifyTodosOfflineModules} from './unify-todos-offline-projection.mjs';
import {unifyNotesOfflinePaths,projectUnifyNotesOfflineModules} from './unify-notes-offline-projection.mjs';
import {unifyMemosOfflinePaths,projectUnifyMemosOffline,projectUnifyMemosOfflineModules} from './unify-memos-offline-projection.mjs';
import {unifyConflictResolutionBaseline,unifyConflictResolutionPatch,unifyConflictResolutionPaths,unifyConflictResolutionAddedModules,
  unifyConflictResolutionBefore,unifyConflictResolutionManifest,validateUnifyConflictResolutionDelta,projectUnifyConflictResolution,
  projectUnifyConflictResolutionHistory,projectUnifyConflictResolutionModules,conflictResolutionHash} from './unify-conflict-resolution-projection.mjs';
import {projectOct28History,projectOct28Modules} from './oct28-projection.mjs';

const root=new URL('../',import.meta.url),read=file=>projectOct28History(file,readFileSync(new URL('../'+file,import.meta.url),'utf8'));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const delta=unifyConflictResolutionManifest();
const roots=['public','web','src','shared','db','drizzle','migration-candidates','scripts','.ci','.github','.openai',
  '.gitattributes','.gitignore','.gitleaks.toml','.gitleaksignore','drizzle.config.ts','runtime.json','package.json','package-lock.json'];

test('conflict-resolution pins final D and the fixed E source with exactly fifteen production paths and five modules',()=>{
  assert.equal(unifyConflictResolutionPaths.length,15);assert.equal(unifyConflictResolutionAddedModules.length,5);
  assert.deepEqual(git('diff','--name-only',unifyConflictResolutionBaseline,unifyConflictResolutionPatch,'--',...roots).trim().split('\n'),
    [...unifyConflictResolutionPaths],'the E source itself cannot contain an extra production path');
  for(const file of unifyConflictResolutionPaths) {
    const source=read(file),before=unifyConflictResolutionBefore(file);
    assert.equal(source,git('show',unifyConflictResolutionPatch+':'+file),'exact frozen E source: '+file);
    assert.equal(conflictResolutionHash(source),delta.files[file].after,'exact current E digest: '+file);
    assert.equal(projectUnifyConflictResolution(file,source),before,file);
    assert.equal(projectUnifyConflictResolution(file,before),before,'fixed final D input remains valid: '+file);
  }
  for(const file of ['web/core/api.mjs',...new Set([...unifyNotesOfflinePaths,...unifyMemosOfflinePaths].filter(file=>!unifyConflictResolutionPaths.includes(file)))])
    assert.equal(read(file),git('show',unifyConflictResolutionBaseline+':'+file),'the complete fixed D/C/B implementation remains unchanged: '+file);
});

test('conflict-resolution preserves every one of the 71 D modules and adds exactly five reviewed modules',()=>{
  const released=git('ls-tree','-r','--name-only',unifyConflictResolutionBaseline,'web').trim().split('\n').filter(file=>file.endsWith('.mjs')).sort();
  const current=projectOct28Modules(readdirSync(new URL('../web/',import.meta.url),{recursive:true}).filter(file=>file.endsWith('.mjs')).map(file=>'web/'+file).sort());
  assert.equal(released.length,71);assert.equal(current.length,76);
  assert.deepEqual(current,[...released,...unifyConflictResolutionAddedModules].sort());
  assert.deepEqual(projectUnifyConflictResolutionModules(current),released,'all original module paths remain exact');
  assert.equal(projectUnifyMemosOfflineModules(current).length,69,'E and the independent two-module D inverse compose');
  assert.equal(projectUnifyNotesOfflineModules(current).length,64,'E/D and the independent five-module C inverse compose');
  assert.equal(projectUnifyTodosOfflineModules(current).length,57,'E/D/C and the independent seven-module B inverse compose');
  assert.equal(projectUnifySwModules(current).length,56,'the fixed A/B/C/D/E module inverses compose');
  const unknown='web/core/unapproved-memo-groups.mjs';
  assert.deepEqual(projectUnifyConflictResolutionModules([...unifyConflictResolutionAddedModules,unknown]),[unknown]);
  for(const file of unifyConflictResolutionAddedModules)
    for(const source of ['', 'unapproved', read(file)+'\n'])
      assert.throws(()=>projectUnifyConflictResolutionModules([file],()=>source),/approved workbench delta/,file);
});

test('conflict-resolution rejects changed current and old bytes and leaves every unauthorized path visible',()=>{
  for(const file of unifyConflictResolutionPaths) {
    assert.throws(()=>projectUnifyConflictResolution(file,read(file)+'\n/* unauthorized */\n'),/approved workbench delta/,file);
    assert.throws(()=>projectUnifyConflictResolution(file,unifyConflictResolutionBefore(file)+'\n/* unauthorized */\n'),/approved workbench delta/,file+' before');
    assert.throws(()=>projectUnifyConflictResolutionHistory(file,read(file)+'\n/* unauthorized */\n'),/approved workbench delta/,file+' historical');
  }
  for(const file of ['web/core/api.mjs','web/offline/cache.mjs','web/offline/sw-client.mjs','web/offline/notes.mjs',
    'web/offline/memo-groups.mjs','web/core/state.mjs','src/worker.mjs','runtime.json'])
    assert.equal(projectUnifyConflictResolution(file,'unapproved bytes'),'unapproved bytes',file+' remains visible');
  assert.equal(projectUnifyConflictResolution('web/offline/../offline/conflict-plan.mjs','unapproved'),'unapproved','path aliases never normalize');
  assert.throws(()=>projectUnifySw('web/offline/conflict-plan.mjs','unapproved'),/approved workbench delta/,
    'an older guard must reject changed E additions');
  assert.throws(()=>projectUnifySwModules(['web/offline/resolution-ledger.mjs'],()=>read('web/offline/resolution-ledger.mjs')+'\n'),
    /approved workbench delta/,'an added resolution module cannot disappear without its exact E digest');
});

test('conflict-resolution manifest rejects moved commits, changed digests, extra modules and self-authorized scope',()=>{
  const variants=[];
  for(const field of ['baseline','patch_commit']) {
    const candidate=structuredClone(delta);candidate[field]='6e2e445e8a3e9f7a4af055f4cf75046cf6e5cd6c';variants.push(candidate);
  }
  for(const field of ['before','after']) {
    const candidate=structuredClone(delta);candidate.files['web/offline/outbox.mjs'][field]='0'.repeat(64);variants.push(candidate);
  }
  const expanded=structuredClone(delta);expanded.files['web/offline/sw-client.mjs']={before:'0'.repeat(64),after:'0'.repeat(64)};variants.push(expanded);
  const missing=structuredClone(delta);delete missing.files['web/offline/conflict-plan.mjs'];variants.push(missing);
  const modules=structuredClone(delta);modules.added_modules.push('web/offline/memo-groups.mjs');variants.push(modules);
  const selfAuthorized=structuredClone(delta);selfAuthorized.files['web/offline/runtime.mjs'].after=conflictResolutionHash(read('web/offline/runtime.mjs')+'\n');
  variants.push(selfAuthorized);
  for(const candidate of variants)assert.throws(()=>validateUnifyConflictResolutionDelta(candidate),/approved workbench delta/);
});

test('conflict-resolution composes through fixed earlier layers while retaining every original manifest byte and old input',()=>{
  const manifests=git('ls-tree','-r','--name-only',unifyConflictResolutionBaseline,'tests').trim().split('\n').filter(file=>file.endsWith('-delta.json'));
  for(const file of manifests)assert.equal(read(file),git('show',unifyConflictResolutionBaseline+':'+file),'old manifest byte lock: '+file);
  for(const file of unifyConflictResolutionPaths) {
    const source=read(file),before=unifyConflictResolutionBefore(file);
    assert.equal(projectUnifyMemosOffline(file,projectUnifyConflictResolution(file,source)),projectUnifyMemosOffline(file,before),
      'E inverse restores the unchanged strict D input: '+file);
    for(const project of [projectUnifySw,projectUnifyStage2,projectUnifyStage1])
      assert.equal(project(file,source),project(file,before),'fixed E inverse composes: '+file);
  }
  const file='public/app.js',old=git('show','37a1e4f2618e1fea6ded05911b2a73572968442a:'+file);
  assert.equal(projectUnifyConflictResolutionHistory(file,old),old,'an exact previously recorded checkpoint remains valid');
  assert.throws(()=>projectUnifyConflictResolutionHistory(file,old+'\n/* unauthorized */\n'),/approved workbench delta/);
});

test('conflict-resolution leaves backend, API routes, schema, permissions, runtime and release configuration unchanged',()=>{
  assert.deepEqual(projectedChangedFiles(unifyConflictResolutionBaseline,roots,
    (file,source)=>projectUnifyConflictResolution(file,projectOct28History(file,source))),[],
    'all extra production edits, untracked paths and deletions remain visible');
  for(const path of ['runtime.json','package.json','package-lock.json','.github/scripts/release-policy.mjs',
    '.github/workflows/ci.yml','.github/workflows/cloudflare-manual-release.yml','.github/scripts/cloudflare-publish.mjs',
    '.openai/hosting.json','drizzle.config.ts','public/openapi.json','public/api-docs.html','public/llms.txt','src/worker.mjs',
    'web/core/api.mjs','web/offline/cache.mjs','web/offline/sw-client.mjs'])
    assert.equal(read(path),git('show',unifyConflictResolutionBaseline+':'+path),path+' remains unchanged');
});
