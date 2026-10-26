import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {frontendBundle} from '../scripts/frontend-build.mjs';
import {buildServiceWorkerAssets,shellAssetPaths} from '../scripts/service-worker-build.mjs';
import {projectUnifyStage1,projectedChangedFiles} from './unify-stage1-projection.mjs';
import {projectUnifyStage2} from './unify-stage2-projection.mjs';
import {unifySwBaseline,unifySwPaths,unifySwAddedModules,unifySwBefore,unifySwManifest,
  validateUnifySwDelta,projectUnifySw,projectUnifySwHistory,projectUnifySwModules,swHash} from './unify-sw-projection.mjs';
import {projectUnifyTodosOffline,projectUnifyTodosOfflineModules} from './unify-todos-offline-projection.mjs';
import {projectUnifyNotesOffline,projectUnifyNotesOfflineModules} from './unify-notes-offline-projection.mjs';
import {projectUnifyMemosOffline} from './unify-memos-offline-projection.mjs';
import {projectUnifyConflictResolution} from './unify-conflict-resolution-projection.mjs';

const root=new URL('../',import.meta.url),read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const delta=unifySwManifest();

test('SW shell pins eleven exact paths and one new module over the fixed final mobile baseline',async()=>{
  assert.equal(unifySwPaths.length,11);assert.deepEqual(unifySwAddedModules,['web/offline/sw-client.mjs']);
  for(const file of unifySwPaths) {
    const source=projectUnifyTodosOffline(file,projectUnifyNotesOffline(file,projectUnifyMemosOffline(file,projectUnifyConflictResolution(file,read(file))))),before=unifySwBefore(file);
    assert.equal(swHash(source),delta.files[file].after,'current source remains exact: '+file);
    assert.equal(projectUnifySw(file,source),before,file);
    assert.equal(projectUnifySw(file,before),before,'exact stage-two bytes remain accepted: '+file);
  }
  const released=git('ls-tree','-r','--name-only',unifySwBaseline,'web').trim().split('\n').filter(file=>file.endsWith('.mjs')).sort();
  const current=projectUnifyNotesOfflineModules(readdirSync(new URL('../web/',import.meta.url),{recursive:true})
    .filter(file=>file.endsWith('.mjs')).map(file=>'web/'+file).sort());
  assert.equal(current.length,64);assert.deepEqual(projectUnifyTodosOfflineModules(current),[...released,...unifySwAddedModules].sort());
  assert.deepEqual(projectUnifySwModules(current),released,'only the exact reviewed SW client projects to absence');
  assert.equal(Buffer.from(await frontendBundle(fileURLToPath(root))).toString('utf8'),read('public/app.js'),
    'the actual current frontend, including registration, reproduces the pinned bundle');
});

test('SW inverse rejects changed after or before bytes and preserves all unapproved offline additions',()=>{
  for(const file of unifySwPaths) {
    assert.throws(()=>projectUnifySw(file,read(file)+'\n/* unauthorized */\n'),/approved workbench delta/,file);
    assert.throws(()=>projectUnifySw(file,unifySwBefore(file)+'\n/* unauthorized */\n'),/approved workbench delta/,file+' old input');
  }
  for(const file of ['web/offline/core.mjs','src/permissions.mjs'])
    assert.equal(projectUnifySw(file,'unapproved bytes'),'unapproved bytes',file+' remains visible');
  for(const file of ['web/offline/runtime.mjs','public/offline.css'])
    assert.throws(()=>projectUnifySw(file,'unapproved bytes'),/approved workbench delta/,file+' cannot hide unreviewed later bytes');
  assert.equal(projectUnifySw('web/offline/../offline/sw-client.mjs','unapproved'),'unapproved');
  assert.deepEqual(projectUnifySwModules(['web/main.mjs',...unifySwAddedModules,'web/offline/core.mjs']),
    ['web/main.mjs','web/offline/core.mjs']);
  assert.throws(()=>projectUnifySwModules([...unifySwAddedModules],file=>read(file)+'\n'),/approved workbench delta/);
  assert.throws(()=>projectUnifySwModules([...unifySwAddedModules],()=>''),/approved workbench delta/,
    'an empty replacement file cannot masquerade as a reviewed new module');
});

test('SW manifest cannot authorize a new baseline, changed digest, business module or wider scope',()=>{
  const variants=[];
  for(const field of ['before','after']) {
    const candidate=structuredClone(delta);candidate.files['public/app.js'][field]='0'.repeat(64);variants.push(candidate);
  }
  const expanded=structuredClone(delta);expanded.files['web/offline/runtime.mjs']={before:null,after:'0'.repeat(64)};variants.push(expanded);
  const missing=structuredClone(delta);delete missing.files['public/sw.js'];variants.push(missing);
  const module=structuredClone(delta);module.added_modules.push('web/offline/runtime.mjs');variants.push(module);
  const moved=structuredClone(delta);moved.baseline='72d26abb94d316e08b63cf12924c157f1bc8e3cd';variants.push(moved);
  const selfAuthorized=structuredClone(delta);selfAuthorized.files['web/offline/sw-client.mjs'].after=swHash(read('web/offline/sw-client.mjs')+'\n');
  variants.push(selfAuthorized);
  for(const candidate of variants)assert.throws(()=>validateUnifySwDelta(candidate),/approved workbench delta/);
});

test('SW composes through unchanged historical manifests and rejects mutated historical inputs',()=>{
  const manifests=git('ls-tree','-r','--name-only',unifySwBaseline,'tests').trim().split('\n').filter(file=>file.endsWith('-delta.json'));
  for(const file of manifests)assert.equal(read(file),git('show',unifySwBaseline+':'+file),'historical manifest byte lock: '+file);
  for(const file of unifySwPaths) {
    const current=read(file),before=unifySwBefore(file);
    assert.equal(projectUnifyStage2(file,current),projectUnifyStage2(file,before),'SW then mobile inverse: '+file);
    assert.equal(projectUnifyStage1(file,current),projectUnifyStage1(file,before),'SW then tokens inverse: '+file);
  }
  const file='src/worker.mjs',old=git('show','4aefa4d4d596ad540324bc78898ae208121647b4:'+file);
  assert.equal(projectUnifySwHistory(file,old),old);
  assert.throws(()=>projectUnifySwHistory(file,old+'\n/* unauthorized */\n'),/approved workbench delta/);
});

test('SW projection preserves API, permissions, configuration, schema and every unrelated production byte',()=>{
  const roots=['public','web','src','shared','db','drizzle','scripts','.ci','.github','runtime.json','package.json','package-lock.json'];
  assert.deepEqual(projectedChangedFiles(unifySwBaseline,roots,projectUnifySw),[],
    'only exact SW shell bytes and the independently reviewed CI timeout are normalized');
  for(const path of ['runtime.json','package.json','package-lock.json','.github/scripts/release-policy.mjs',
    'public/openapi.json','public/api-docs.html','public/llms.txt'])
    assert.equal(read(path),git('show',unifySwBaseline+':'+path),path+' remains unchanged');
});

test('the exact SW build is deterministic and its complete shell generation excludes all API and auth URLs',()=>{
  const beforeB=(file)=>projectUnifyTodosOffline(file,projectUnifyNotesOffline(file,projectUnifyMemosOffline(file,projectUnifyConflictResolution(file,read(file)))));
  const indexHtml=beforeB('public/index.html');
  const swSource=beforeB('public/sw.js');
  const assets=Object.fromEntries(shellAssetPaths.filter(path=>path!=='/').map(path=>[path,beforeB('public'+path)]));
  const first=buildServiceWorkerAssets({indexHtml,swSource,assets});
  const again=buildServiceWorkerAssets({indexHtml:first.indexHtml,swSource:first.swSource,assets});
  assert.equal(first.indexHtml,indexHtml);assert.equal(first.swSource,swSource);assert.deepEqual(again,first);
  assert.ok(!first.config.assets.some(asset=>asset.url==='/offline.css'));
  for(const asset of first.config.assets) {
    assert.ok(!/^\/(?:api|auth|health|login|logout)(?:\/|$)/.test(asset.url));assert.notEqual(asset.url,'/sw.js');
    assert.equal(swHash(asset.url==='/'?indexHtml:assets[asset.url]),asset.sha256,asset.url);
  }
  for(const path of ['/api/v1/notes','/health','/auth/login','/sw.js'])
    assert.throws(()=>buildServiceWorkerAssets({indexHtml,swSource,assets:{...assets,[path]:'unapproved'}}));
});

test('every API method and auth/health request uses the original network request and never touches CacheStorage',async()=>{
  const callbacks=new Map(),calls=[];let offline=false;
  const self={location:{origin:'https://shell.invalid'},addEventListener:(event,callback)=>callbacks.set(event,callback)};
  const caches=new Proxy({},{get(){assert.fail('API request must never access CacheStorage');}});
  const fetch=async(request,options)=>{
    calls.push({request,options});if(offline)throw Error('synthetic offline');return new Response('network-only');
  };
  vm.runInNewContext(read('public/sw.js'),{self,caches,fetch,URL,Request,Response});
  for(const path of ['/api/v1','/api/v1/notes?date=2026-10-26','/api/v1/auth/me','/health','/auth/login','/login','/logout'])
    for(const method of ['GET','HEAD','OPTIONS','POST','PUT','PATCH','DELETE']) {
      const request=new Request('https://shell.invalid'+path,{method,headers:{'X-Synthetic-Test':'preserved'}});
      let promise;callbacks.get('fetch')({request,respondWith:value=>{promise=value;},waitUntil(){assert.fail('API background cache work');}});
      assert.equal(await (await promise).text(),'network-only');assert.equal(calls.at(-1).request,request);
      assert.equal(calls.at(-1).options.cache,'no-store');
    }
  offline=true;let promise;
  callbacks.get('fetch')({request:new Request('https://shell.invalid/api/v1/notes'),respondWith:value=>{promise=value;}});
  await assert.rejects(promise,/synthetic offline/,'a failed API request never falls back to the application shell');
});
