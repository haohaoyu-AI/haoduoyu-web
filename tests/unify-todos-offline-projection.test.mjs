import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {frontendBundle} from '../scripts/frontend-build.mjs';
import {buildServiceWorkerAssets} from '../scripts/service-worker-build.mjs';
import {projectUnifyStage1,projectedChangedFiles} from './unify-stage1-projection.mjs';
import {projectUnifyStage2} from './unify-stage2-projection.mjs';
import {projectUnifySw,projectUnifySwModules} from './unify-sw-projection.mjs';
import {projectUnifyNotesOffline,projectUnifyNotesOfflineModules} from './unify-notes-offline-projection.mjs';
import {projectUnifyMemosOffline} from './unify-memos-offline-projection.mjs';
import {projectUnifyConflictResolution} from './unify-conflict-resolution-projection.mjs';
import {unifyTodosOfflineBaseline,unifyTodosOfflinePatch,unifyTodosOfflinePaths,unifyTodosOfflineAddedModules,
  unifyTodosOfflineBefore,unifyTodosOfflineManifest,validateUnifyTodosOfflineDelta,projectUnifyTodosOffline,
  projectUnifyTodosOfflineHistory,projectUnifyTodosOfflineModules,todosOfflineHash} from './unify-todos-offline-projection.mjs';

const root=new URL('../',import.meta.url),read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const delta=unifyTodosOfflineManifest();
const roots=['public','web','src','shared','db','drizzle','scripts','.ci','.github','runtime.json','package.json','package-lock.json'];

test('todo-offline pins the fixed source and patch with exactly fifteen production paths and seven modules',async()=>{
  assert.equal(unifyTodosOfflinePaths.length,15);assert.equal(unifyTodosOfflineAddedModules.length,7);
  assert.deepEqual(git('diff','--name-only',unifyTodosOfflineBaseline,unifyTodosOfflinePatch,'--',...roots).trim().split('\n'),
    [...unifyTodosOfflinePaths],'the reviewed commit itself cannot contain an extra production path');
  for(const file of unifyTodosOfflinePaths) {
    const source=projectUnifyNotesOffline(file,projectUnifyMemosOffline(file,projectUnifyConflictResolution(file,read(file)))),before=unifyTodosOfflineBefore(file);
    assert.equal(source,git('show',unifyTodosOfflinePatch+':'+file),'exact frozen patch bytes: '+file);
    assert.equal(todosOfflineHash(source),delta.files[file].after,'exact current source hash: '+file);
    assert.equal(projectUnifyTodosOffline(file,source),before,file);
    assert.equal(projectUnifyTodosOffline(file,before),before,'fixed SW-only input remains valid: '+file);
  }
  assert.equal(Buffer.from(await frontendBundle(fileURLToPath(root))).toString('utf8'),read('public/app.js'),
    'the complete actual offline frontend, rather than a projected fixture, builds to the pinned bundle');
});

test('todo-offline keeps the complete 57-module baseline and authorizes exactly seven reviewed additions',()=>{
  const released=git('ls-tree','-r','--name-only',unifyTodosOfflineBaseline,'web').trim().split('\n').filter(file=>file.endsWith('.mjs')).sort();
  const current=projectUnifyNotesOfflineModules(readdirSync(new URL('../web/',import.meta.url),{recursive:true})
    .filter(file=>file.endsWith('.mjs')).map(file=>'web/'+file).sort());
  assert.equal(released.length,57);assert.equal(current.length,64);
  assert.deepEqual(current,[...released,...unifyTodosOfflineAddedModules].sort());
  assert.deepEqual(projectUnifyTodosOfflineModules(current),released,'every original module remains in the inventory');
  assert.equal(projectUnifySwModules(current).length,56,'the independent A and B exact module inverses compose');
  const unknown='web/offline/unapproved-editor.mjs';
  assert.deepEqual(projectUnifyTodosOfflineModules([...unifyTodosOfflineAddedModules,unknown]),[unknown]);
  for(const source of ['', 'unapproved', read('web/offline/runtime.mjs')+'\n'])
    assert.throws(()=>projectUnifyTodosOfflineModules(['web/offline/runtime.mjs'],()=>source),/approved workbench delta/);
});

test('todo-offline rejects changed current and historical bytes and never hides later editor or state additions',()=>{
  for(const file of unifyTodosOfflinePaths) {
    assert.throws(()=>projectUnifyTodosOffline(file,read(file)+'\n/* unauthorized */\n'),/approved workbench delta/,file);
    assert.throws(()=>projectUnifyTodosOffline(file,unifyTodosOfflineBefore(file)+'\n/* unauthorized */\n'),/approved workbench delta/,file+' before');
  }
  for(const file of ['web/core/todos-state.mjs','web/core/state.mjs','web/offline/editors.mjs','src/worker.mjs','runtime.json'])
    assert.equal(projectUnifyTodosOffline(file,'unapproved bytes'),'unapproved bytes',file+' remains visible');
  assert.equal(projectUnifyTodosOffline('web/offline/../offline/runtime.mjs','unapproved'),'unapproved','aliases never normalize');
  assert.throws(()=>projectUnifySw('web/offline/runtime.mjs','unapproved'),/approved workbench delta/,
    'an old guard cannot silently discard a changed new module');
});

test('the fixed compatibility repairs cannot reuse any superseded B source hash set',()=>{
  for(const [superseded,expected]of [
    ['f5784375b94e398a24875cb2b86678dbd963533a',['.ci/public-assets.json','public/app.js','public/index.html','public/sw.js',
      'web/core/api.mjs','web/offline/cache.mjs','web/offline/conflict.mjs','web/offline/outbox.mjs','web/offline/runtime.mjs','web/offline/ui.mjs']],
    ['0e614ea1d08d250189c5711e972a0e5208f4f66b',['.ci/public-assets.json','public/app.js','public/index.html','public/sw.js',
      'web/offline/cache.mjs','web/offline/conflict.mjs','web/offline/outbox.mjs','web/offline/runtime.mjs','web/offline/ui.mjs']],
    ['21389041755439cf80b42458ec7d938b63565816',['.ci/public-assets.json','public/app.js','public/index.html','public/sw.js',
      'web/offline/cache.mjs','web/offline/conflict.mjs','web/offline/outbox.mjs','web/offline/runtime.mjs']],
    ['5b03836c8c1fea3f9d84918c2f8f8fb358b8f56a',['.ci/public-assets.json','public/app.js','public/index.html','public/sw.js',
      'web/offline/cache.mjs','web/offline/runtime.mjs']],
    ['918b43b442efa83886fd59ce6993884f4cc212c6',['.ci/public-assets.json','public/app.js','public/index.html','public/sw.js',
      'web/offline/cache.mjs']]
  ]) {
    const repaired=git('diff','--name-only',superseded,unifyTodosOfflinePatch,'--',...roots).trim().split('\n');
    assert.deepEqual(repaired,expected,'only the exact preflight and cross-generation repairs are authorized');
    for(const file of repaired) {
      const old=git('show',superseded+':'+file);
      assert.notEqual(todosOfflineHash(old),delta.files[file].after,'the repaired bytes must have a fresh after hash: '+file);
      assert.throws(()=>projectUnifyTodosOffline(file,old),/approved workbench delta/,'an unsafe earlier source cannot impersonate final B: '+file);
    }
  }
});

test('todo-offline manifest rejects moved commits, altered hashes, extra modules and self-authorized scope',()=>{
  const variants=[];
  for(const field of ['baseline','patch_commit']) {
    const candidate=structuredClone(delta);candidate[field]='6e2e445e8a3e9f7a4af055f4cf75046cf6e5cd6c';variants.push(candidate);
  }
  for(const field of ['before','after']) {
    const candidate=structuredClone(delta);candidate.files['web/core/api.mjs'][field]='0'.repeat(64);variants.push(candidate);
  }
  const expanded=structuredClone(delta);expanded.files['web/core/todos-state.mjs']={before:'0'.repeat(64),after:'0'.repeat(64)};variants.push(expanded);
  const missing=structuredClone(delta);delete missing.files['web/offline/db.mjs'];variants.push(missing);
  const modules=structuredClone(delta);modules.added_modules.push('web/offline/editors.mjs');variants.push(modules);
  const selfAuthorized=structuredClone(delta);selfAuthorized.files['web/offline/runtime.mjs'].after=todosOfflineHash(read('web/offline/runtime.mjs')+'\n');
  variants.push(selfAuthorized);
  for(const candidate of variants)assert.throws(()=>validateUnifyTodosOfflineDelta(candidate),/approved workbench delta/);
});

test('todo-offline composes through every fixed earlier layer without changing historical manifests or accepting forged old blobs',()=>{
  const manifests=git('ls-tree','-r','--name-only',unifyTodosOfflineBaseline,'tests').trim().split('\n').filter(file=>file.endsWith('-delta.json'));
  for(const file of manifests)assert.equal(read(file),git('show',unifyTodosOfflineBaseline+':'+file),'old manifest byte lock: '+file);
  for(const file of unifyTodosOfflinePaths) {
    const source=read(file),before=unifyTodosOfflineBefore(file);
    for(const project of [projectUnifySw,projectUnifyStage2,projectUnifyStage1])
      assert.equal(project(file,source),project(file,before),'fixed B inverse composes: '+file);
  }
  const file='web/core/api.mjs',old=git('show','37a1e4f2618e1fea6ded05911b2a73572968442a:'+file);
  assert.equal(projectUnifyTodosOfflineHistory(file,old),old);
  assert.throws(()=>projectUnifyTodosOfflineHistory(file,old+'\n/* unauthorized */\n'),/approved workbench delta/);
});

test('todo-offline leaves backend, API routes, permissions, schema, runtime and release configuration unchanged',()=>{
  assert.deepEqual(projectedChangedFiles(unifyTodosOfflineBaseline,roots,
    (file,source)=>projectUnifyTodosOffline(file,projectUnifyNotesOffline(file,projectUnifyMemosOffline(file,projectUnifyConflictResolution(file,source))))),[],
    'all extra production edits, untracked files and deletions remain visible');
  for(const path of ['runtime.json','package.json','package-lock.json','.github/scripts/release-policy.mjs',
    '.github/workflows/ci.yml','public/openapi.json','public/api-docs.html','public/llms.txt','src/worker.mjs'])
    assert.equal(read(path),git('show',unifyTodosOfflineBaseline+':'+path),path+' remains unchanged');
});

test('the actual B shell remains deterministic, includes offline CSS exactly once and contains no API response cache',()=>{
  const indexHtml=read('public/index.html'),swSource=read('public/sw.js');
  const names=readdirSync(new URL('../public/',import.meta.url)).filter(name=>name.endsWith('.css')||['app.js','favicon.svg','manifest.webmanifest'].includes(name));
  const assets=Object.fromEntries(names.map(name=>['/'+name,read('public/'+name)]));
  const first=buildServiceWorkerAssets({indexHtml,swSource,assets});
  assert.equal(first.indexHtml,indexHtml);assert.equal(first.swSource,swSource);
  assert.deepEqual(buildServiceWorkerAssets({indexHtml:first.indexHtml,swSource:first.swSource,assets}),first);
  assert.equal(first.config.assets.filter(asset=>asset.url==='/offline.css').length,1);
  for(const asset of first.config.assets) {
    assert.ok(!/^\/(?:api|auth|health|login|logout)(?:\/|$)/.test(asset.url));assert.notEqual(asset.url,'/sw.js');
    assert.equal(todosOfflineHash(asset.url==='/'?indexHtml:assets[asset.url]),asset.sha256,asset.url);
  }
});
