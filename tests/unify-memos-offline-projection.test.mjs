import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {projectUnifyStage1,projectedChangedFiles} from './unify-stage1-projection.mjs';
import {projectUnifyStage2} from './unify-stage2-projection.mjs';
import {projectUnifySw,projectUnifySwModules} from './unify-sw-projection.mjs';
import {projectUnifyTodosOfflineModules} from './unify-todos-offline-projection.mjs';
import {unifyNotesOfflinePaths,projectUnifyNotesOffline,projectUnifyNotesOfflineModules} from './unify-notes-offline-projection.mjs';
import {unifyMemosOfflineBaseline,unifyMemosOfflinePatch,unifyMemosOfflinePaths,unifyMemosOfflineAddedModules,
  unifyMemosOfflineBefore,unifyMemosOfflineManifest,validateUnifyMemosOfflineDelta,projectUnifyMemosOffline,
  projectUnifyMemosOfflineHistory,projectUnifyMemosOfflineModules,memosOfflineHash} from './unify-memos-offline-projection.mjs';

const root=new URL('../',import.meta.url),read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const delta=unifyMemosOfflineManifest();
const roots=['public','web','src','shared','db','drizzle','migration-candidates','scripts','.ci','.github','.openai',
  '.gitattributes','.gitignore','.gitleaks.toml','.gitleaksignore','drizzle.config.ts','runtime.json','package.json','package-lock.json'];

test('memo-offline pins final C and the fixed D source with exactly eleven production paths and two modules',()=>{
  assert.equal(unifyMemosOfflinePaths.length,11);assert.equal(unifyMemosOfflineAddedModules.length,2);
  assert.deepEqual(git('diff','--name-only',unifyMemosOfflineBaseline,unifyMemosOfflinePatch,'--',...roots).trim().split('\n'),
    [...unifyMemosOfflinePaths],'the D source itself cannot contain an extra production path');
  for(const file of unifyMemosOfflinePaths) {
    const source=read(file),before=unifyMemosOfflineBefore(file);
    assert.equal(source,git('show',unifyMemosOfflinePatch+':'+file),'exact frozen D source: '+file);
    assert.equal(memosOfflineHash(source),delta.files[file].after,'exact current D digest: '+file);
    assert.equal(projectUnifyMemosOffline(file,source),before,file);
    assert.equal(projectUnifyMemosOffline(file,before),before,'fixed final C input remains valid: '+file);
  }
  for(const file of ['web/core/api.mjs',...unifyNotesOfflinePaths.filter(file=>!unifyMemosOfflinePaths.includes(file))])
    assert.equal(read(file),git('show',unifyMemosOfflineBaseline+':'+file),'the complete fixed C/B implementation remains unchanged: '+file);
});

test('memo-offline preserves every one of the 69 C modules and adds exactly two reviewed modules',()=>{
  const released=git('ls-tree','-r','--name-only',unifyMemosOfflineBaseline,'web').trim().split('\n').filter(file=>file.endsWith('.mjs')).sort();
  const current=readdirSync(new URL('../web/',import.meta.url),{recursive:true}).filter(file=>file.endsWith('.mjs')).map(file=>'web/'+file).sort();
  assert.equal(released.length,69);assert.equal(current.length,71);
  assert.deepEqual(current,[...released,...unifyMemosOfflineAddedModules].sort());
  assert.deepEqual(projectUnifyMemosOfflineModules(current),released,'all original module paths remain exact');
  assert.equal(projectUnifyNotesOfflineModules(current).length,64,'D and the independent five-module C inverse compose');
  assert.equal(projectUnifyTodosOfflineModules(current).length,57,'D/C and the independent seven-module B inverse compose');
  assert.equal(projectUnifySwModules(current).length,56,'the fixed A/B/C/D module inverses compose');
  const unknown='web/core/unapproved-memo-groups.mjs';
  assert.deepEqual(projectUnifyMemosOfflineModules([...unifyMemosOfflineAddedModules,unknown]),[unknown]);
  for(const file of unifyMemosOfflineAddedModules)
    for(const source of ['', 'unapproved', read(file)+'\n'])
      assert.throws(()=>projectUnifyMemosOfflineModules([file],()=>source),/approved workbench delta/,file);
});

test('memo-offline rejects changed current and old bytes and leaves every unauthorized path visible',()=>{
  for(const file of unifyMemosOfflinePaths) {
    assert.throws(()=>projectUnifyMemosOffline(file,read(file)+'\n/* unauthorized */\n'),/approved workbench delta/,file);
    assert.throws(()=>projectUnifyMemosOffline(file,unifyMemosOfflineBefore(file)+'\n/* unauthorized */\n'),/approved workbench delta/,file+' before');
    assert.throws(()=>projectUnifyMemosOfflineHistory(file,read(file)+'\n/* unauthorized */\n'),/approved workbench delta/,file+' historical');
  }
  for(const file of ['web/core/api.mjs','web/offline/cache.mjs','web/offline/sw-client.mjs','web/offline/notes.mjs',
    'web/offline/memo-groups.mjs','web/core/state.mjs','src/worker.mjs','runtime.json'])
    assert.equal(projectUnifyMemosOffline(file,'unapproved bytes'),'unapproved bytes',file+' remains visible');
  assert.equal(projectUnifyMemosOffline('web/offline/../offline/memos.mjs','unapproved'),'unapproved','path aliases never normalize');
  assert.throws(()=>projectUnifySw('web/offline/memos.mjs','unapproved'),/approved workbench delta/,
    'an older guard must reject changed D additions');
  assert.throws(()=>projectUnifySwModules(['web/core/memos-local.mjs'],()=>read('web/core/memos-local.mjs')+'\n'),
    /approved workbench delta/,'an added core module cannot disappear without its exact D digest');
});

test('memo-offline requires repaired current bytes and retains only the exact superseded D historical inverse',()=>{
  const superseded='cc98a9786576d17b2eb33f8a1f94d78e36ae7b4b';
  const repaired=git('diff','--name-only',superseded,unifyMemosOfflinePatch,'--',...roots).trim().split('\n');
  assert.deepEqual(repaired,['.ci/public-assets.json','public/app.js','public/index.html','public/sw.js','web/memos-controller.mjs'],
    'only the foreground-load repair and its complete corresponding shell may change');
  for(const file of repaired) {
    const source=git('show',superseded+':'+file),before=unifyMemosOfflineBefore(file);
    assert.notEqual(memosOfflineHash(source),delta.files[file].after,'the repaired source needs a fresh pin: '+file);
    assert.throws(()=>projectUnifyMemosOffline(file,source),/approved workbench delta/,'superseded bytes cannot impersonate current D: '+file);
    assert.equal(projectUnifyMemosOfflineHistory(file,source),before,'the exact frozen D checkpoint retains its historical inverse: '+file);
    assert.throws(()=>projectUnifyMemosOfflineHistory(file,source+'\n/* unauthorized */\n'),/approved workbench delta/,file+' forged history');
    for(const project of [projectUnifySw,projectUnifyStage2,projectUnifyStage1])
      assert.equal(project(file,source),project(file,before),'the fixed old D checkpoint still composes: '+file);
  }
});

test('memo-offline manifest rejects moved commits, changed digests, extra modules and self-authorized scope',()=>{
  const variants=[];
  for(const field of ['baseline','patch_commit']) {
    const candidate=structuredClone(delta);candidate[field]='6e2e445e8a3e9f7a4af055f4cf75046cf6e5cd6c';variants.push(candidate);
  }
  for(const field of ['before','after']) {
    const candidate=structuredClone(delta);candidate.files['web/offline/outbox.mjs'][field]='0'.repeat(64);variants.push(candidate);
  }
  const expanded=structuredClone(delta);expanded.files['web/offline/sw-client.mjs']={before:'0'.repeat(64),after:'0'.repeat(64)};variants.push(expanded);
  const missing=structuredClone(delta);delete missing.files['web/offline/memos.mjs'];variants.push(missing);
  const modules=structuredClone(delta);modules.added_modules.push('web/offline/memo-groups.mjs');variants.push(modules);
  const selfAuthorized=structuredClone(delta);selfAuthorized.files['web/offline/runtime.mjs'].after=memosOfflineHash(read('web/offline/runtime.mjs')+'\n');
  variants.push(selfAuthorized);
  for(const candidate of variants)assert.throws(()=>validateUnifyMemosOfflineDelta(candidate),/approved workbench delta/);
});

test('memo-offline composes through fixed earlier layers while retaining every original manifest byte and old input',()=>{
  const manifests=git('ls-tree','-r','--name-only',unifyMemosOfflineBaseline,'tests').trim().split('\n').filter(file=>file.endsWith('-delta.json'));
  for(const file of manifests)assert.equal(read(file),git('show',unifyMemosOfflineBaseline+':'+file),'old manifest byte lock: '+file);
  for(const file of unifyMemosOfflinePaths) {
    const source=read(file),before=unifyMemosOfflineBefore(file);
    assert.equal(projectUnifyNotesOffline(file,projectUnifyMemosOffline(file,source)),projectUnifyNotesOffline(file,before),
      'D inverse restores the unchanged strict C input: '+file);
    for(const project of [projectUnifySw,projectUnifyStage2,projectUnifyStage1])
      assert.equal(project(file,source),project(file,before),'fixed D inverse composes: '+file);
  }
  const file='public/app.js',old=git('show','37a1e4f2618e1fea6ded05911b2a73572968442a:'+file);
  assert.equal(projectUnifyMemosOfflineHistory(file,old),old,'an exact previously recorded checkpoint remains valid');
  assert.throws(()=>projectUnifyMemosOfflineHistory(file,old+'\n/* unauthorized */\n'),/approved workbench delta/);
});

test('memo-offline leaves backend, API routes, schema, permissions, runtime and release configuration unchanged',()=>{
  assert.deepEqual(projectedChangedFiles(unifyMemosOfflineBaseline,roots,projectUnifyMemosOffline),[],
    'all extra production edits, untracked paths and deletions remain visible');
  for(const path of ['runtime.json','package.json','package-lock.json','.github/scripts/release-policy.mjs',
    '.github/workflows/ci.yml','.github/workflows/cloudflare-manual-release.yml','.github/scripts/cloudflare-publish.mjs',
    '.openai/hosting.json','drizzle.config.ts','public/openapi.json','public/api-docs.html','public/llms.txt','src/worker.mjs',
    'web/core/api.mjs','web/offline/cache.mjs','web/offline/sw-client.mjs'])
    assert.equal(read(path),git('show',unifyMemosOfflineBaseline+':'+path),path+' remains unchanged');
});
