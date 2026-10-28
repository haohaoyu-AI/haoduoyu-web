import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {projectUnifyMemosOffline,projectUnifyMemosOfflineModules} from './unify-memos-offline-projection.mjs';
import {projectUnifyConflictResolution as projectPriorE} from './unify-conflict-resolution-projection.mjs';
import {projectUnifyStage1,projectedChangedFiles} from './unify-stage1-projection.mjs';
import {projectUnifyStage2} from './unify-stage2-projection.mjs';
import {projectUnifySw,projectUnifySwModules} from './unify-sw-projection.mjs';
import {projectUnifyTodosOffline,projectUnifyTodosOfflineModules} from './unify-todos-offline-projection.mjs';
import {unifyNotesOfflineBaseline,unifyNotesOfflinePatch,unifyNotesOfflinePaths,unifyNotesOfflineAddedModules,
  unifyNotesOfflineBefore,unifyNotesOfflineManifest,validateUnifyNotesOfflineDelta,projectUnifyNotesOffline,
  projectUnifyNotesOfflineHistory,projectUnifyNotesOfflineModules,notesOfflineHash} from './unify-notes-offline-projection.mjs';

import {projectOct28History} from './oct28-projection.mjs';

const root=new URL('../',import.meta.url),read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const projectUnifyConflictResolution=(file,source)=>projectPriorE(file,projectOct28History(file,source));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const delta=unifyNotesOfflineManifest();
const roots=['public','web','src','shared','db','drizzle','migration-candidates','scripts','.ci','.github','.openai',
  '.gitattributes','.gitignore','.gitleaks.toml','.gitleaksignore','drizzle.config.ts','runtime.json','package.json','package-lock.json'];

test('note-offline pins final B and the fixed C source with exactly seventeen production paths and five modules',()=>{
  assert.equal(unifyNotesOfflinePaths.length,17);assert.equal(unifyNotesOfflineAddedModules.length,5);
  assert.deepEqual(git('diff','--name-only',unifyNotesOfflineBaseline,unifyNotesOfflinePatch,'--',...roots).trim().split('\n'),
    [...unifyNotesOfflinePaths],'the C source itself cannot contain an extra production path');
  for(const file of unifyNotesOfflinePaths) {
    const source=projectUnifyMemosOffline(file,projectUnifyConflictResolution(file,read(file))),before=unifyNotesOfflineBefore(file);
    assert.equal(source,git('show',unifyNotesOfflinePatch+':'+file),'exact frozen C source: '+file);
    assert.equal(notesOfflineHash(source),delta.files[file].after,'exact current C digest: '+file);
    assert.equal(projectUnifyNotesOffline(file,source),before,file);
    assert.equal(projectUnifyNotesOffline(file,before),before,'fixed final B input remains valid: '+file);
  }
  assert.ok(unifyNotesOfflinePaths.includes('web/offline/sw-client.mjs'),'the draft persistence update barrier has its own C pin');
  assert.equal(read('web/core/api.mjs'),git('show',unifyNotesOfflineBaseline+':web/core/api.mjs'),
    'the final B identity/preflight implementation cannot change as part of C');
});

test('note-offline preserves every one of the 64 B modules and adds exactly five reviewed modules',()=>{
  const released=git('ls-tree','-r','--name-only',unifyNotesOfflineBaseline,'web').trim().split('\n').filter(file=>file.endsWith('.mjs')).sort();
  const current=projectUnifyMemosOfflineModules(readdirSync(new URL('../web/',import.meta.url),{recursive:true})
    .filter(file=>file.endsWith('.mjs')).map(file=>'web/'+file).sort());
  assert.equal(released.length,64);assert.equal(current.length,69);
  assert.deepEqual(current,[...released,...unifyNotesOfflineAddedModules].sort());
  assert.deepEqual(projectUnifyNotesOfflineModules(current),released,'all original module paths remain exact');
  assert.equal(projectUnifyTodosOfflineModules(current).length,57,'C and the independent seven-module B inverse compose');
  assert.equal(projectUnifySwModules(current).length,56,'the fixed A/B/C module inverses compose');
  const unknown='web/offline/unapproved-memo-editor.mjs';
  assert.deepEqual(projectUnifyNotesOfflineModules([...unifyNotesOfflineAddedModules,unknown]),[unknown]);
  for(const file of unifyNotesOfflineAddedModules)
    for(const source of ['', 'unapproved', read(file)+'\n'])
      assert.throws(()=>projectUnifyNotesOfflineModules([file],()=>source),/approved workbench delta/,file);
});

test('note-offline rejects changed current and old bytes and leaves every unauthorized path visible',()=>{
  for(const file of unifyNotesOfflinePaths) {
    assert.throws(()=>projectUnifyNotesOffline(file,read(file)+'\n/* unauthorized */\n'),/approved workbench delta/,file);
    assert.throws(()=>projectUnifyNotesOffline(file,unifyNotesOfflineBefore(file)+'\n/* unauthorized */\n'),/approved workbench delta/,file+' before');
    assert.throws(()=>projectUnifyNotesOfflineHistory(file,read(file)+'\n/* unauthorized */\n'),/approved workbench delta/,file+' historical');
  }
  for(const file of ['web/core/api.mjs','web/core/todos-state.mjs','web/core/state.mjs','web/offline/memos.mjs',
    'web/offline/editors.mjs','src/worker.mjs','runtime.json'])
    assert.equal(projectUnifyNotesOffline(file,'unapproved bytes'),'unapproved bytes',file+' remains visible');
  assert.equal(projectUnifyNotesOffline('web/offline/../offline/notes.mjs','unapproved'),'unapproved','path aliases never normalize');
  assert.throws(()=>projectUnifySw('web/offline/notes.mjs','unapproved'),/approved workbench delta/,
    'an older guard must reject changed C additions');
  assert.throws(()=>projectUnifySwModules(['web/offline/sw-client.mjs'],()=>read('web/offline/sw-client.mjs')+'\n'),
    /approved workbench delta/,'changed update-barrier bytes cannot disappear through the old SW module inverse');
});

test('note-offline manifest rejects moved commits, changed digests, extra modules and self-authorized scope',()=>{
  const variants=[];
  for(const field of ['baseline','patch_commit']) {
    const candidate=structuredClone(delta);candidate[field]='6e2e445e8a3e9f7a4af055f4cf75046cf6e5cd6c';variants.push(candidate);
  }
  for(const field of ['before','after']) {
    const candidate=structuredClone(delta);candidate.files['web/offline/cache.mjs'][field]='0'.repeat(64);variants.push(candidate);
  }
  const expanded=structuredClone(delta);expanded.files['web/core/api.mjs']={before:'0'.repeat(64),after:'0'.repeat(64)};variants.push(expanded);
  const missing=structuredClone(delta);delete missing.files['web/offline/notes.mjs'];variants.push(missing);
  const modules=structuredClone(delta);modules.added_modules.push('web/offline/memos.mjs');variants.push(modules);
  const selfAuthorized=structuredClone(delta);selfAuthorized.files['web/offline/runtime.mjs'].after=notesOfflineHash(read('web/offline/runtime.mjs')+'\n');
  variants.push(selfAuthorized);
  for(const candidate of variants)assert.throws(()=>validateUnifyNotesOfflineDelta(candidate),/approved workbench delta/);
});

test('note-offline composes through the fixed earlier layers while retaining every original manifest byte and old input',()=>{
  const manifests=git('ls-tree','-r','--name-only',unifyNotesOfflineBaseline,'tests').trim().split('\n').filter(file=>file.endsWith('-delta.json'));
  for(const file of manifests)assert.equal(read(file),git('show',unifyNotesOfflineBaseline+':'+file),'old manifest byte lock: '+file);
  for(const file of unifyNotesOfflinePaths) {
    const source=projectUnifyMemosOffline(file,projectUnifyConflictResolution(file,read(file))),before=unifyNotesOfflineBefore(file);
    assert.equal(projectUnifyTodosOffline(file,projectUnifyNotesOffline(file,source)),projectUnifyTodosOffline(file,before),
      'C inverse restores the unchanged strict B input: '+file);
    for(const project of [projectUnifySw,projectUnifyStage2,projectUnifyStage1])
      assert.equal(project(file,source),project(file,before),'fixed C inverse composes: '+file);
  }
  const file='public/app.js',old=git('show','37a1e4f2618e1fea6ded05911b2a73572968442a:'+file);
  assert.equal(projectUnifyNotesOfflineHistory(file,old),old,'an exact previously recorded checkpoint remains valid');
  assert.throws(()=>projectUnifyNotesOfflineHistory(file,old+'\n/* unauthorized */\n'),/approved workbench delta/);
});

test('note-offline leaves backend, API routes, schema, permissions, runtime and release configuration unchanged',()=>{
  assert.deepEqual(projectedChangedFiles(unifyNotesOfflineBaseline,roots,
    (file,source)=>projectUnifyNotesOffline(file,projectUnifyMemosOffline(file,projectUnifyConflictResolution(file,source)))),[],
    'all extra production edits, untracked paths and deletions remain visible');
  for(const path of ['runtime.json','package.json','package-lock.json','.github/scripts/release-policy.mjs',
    '.github/workflows/ci.yml','.github/workflows/cloudflare-manual-release.yml','.github/scripts/cloudflare-publish.mjs',
    '.openai/hosting.json','drizzle.config.ts','public/openapi.json','public/api-docs.html','public/llms.txt','src/worker.mjs','web/core/api.mjs'])
    assert.equal(projectOct28History(path,read(path)),git('show',unifyNotesOfflineBaseline+':'+path),path+' remains unchanged');
});
