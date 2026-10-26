import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import worker from '../dist/server/index.js';
import {assets} from '../src/assets.generated.mjs';
import {frontendBundle} from '../scripts/frontend-build.mjs';
import {projectUnifyStage1,projectedChangedFiles} from './unify-stage1-projection.mjs';
import {unifyStage2Baseline,unifyStage2Paths,unifyStage2Before,unifyStage2Manifest,validateUnifyStage2Delta,
  projectUnifyStage2,projectUnifyStage2History,stage2Hash} from './unify-stage2-projection.mjs';
import {projectUnifySw,projectUnifySwModules} from './unify-sw-projection.mjs';

const root=new URL('../',import.meta.url),read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const delta=unifyStage2Manifest();

test('stage two pins exactly ten mobile presentation paths without adding any application modules',async()=>{
  for(const file of unifyStage2Paths) {
    const current=projectUnifySw(file,read(file)),before=unifyStage2Before(file);
    assert.equal(stage2Hash(current),delta.files[file].after,'current source remains exact: '+file);
    assert.equal(projectUnifyStage2(file,current),before,file);
    assert.equal(projectUnifyStage2(file,before),before,'exact stage-one input: '+file);
  }
  const roots=['public','web','src','shared','db','drizzle','scripts','.ci','.github','runtime.json','package.json','package-lock.json'];
  assert.deepEqual(projectedChangedFiles(unifyStage2Baseline,roots,projectUnifyStage2),[],
    'business stores, APIs, schemas, backups, sync and deployment files are unchanged');
  const released=git('ls-tree','-r','--name-only',unifyStage2Baseline,'web').trim().split('\n').filter(file=>file.endsWith('.mjs')).sort();
  const current=readdirSync(new URL('../web/',import.meta.url),{recursive:true}).filter(file=>file.endsWith('.mjs')).map(file=>'web/'+file).sort();
  assert.equal(current.length,57);assert.deepEqual(projectUnifySwModules(current),released,
    'complete mobile module inventory stays fixed after the exact later SW client projects to absence');
  assert.equal(Buffer.from(await frontendBundle(fileURLToPath(root))).toString('utf8'),read('public/app.js'),
    'the pinned bundle is generated from the real current modules exercised by mobile behavior tests');
});

test('mobile inverse refuses edits to current or old inputs, added routes and arbitrary asset changes',()=>{
  for(const file of unifyStage2Paths) {
    assert.throws(()=>projectUnifyStage2(file,read(file)+'\n/* unauthorized */\n'),/approved workbench delta/,file);
    assert.throws(()=>projectUnifyStage2(file,unifyStage2Before(file)+'\n/* unauthorized */\n'),/approved workbench delta/,file+' old input');
  }
  const variants=[
    ['web/core/router.mjs',read('web/core/router.mjs').replace('window.innerWidth < 768','window.innerWidth < 1200')],
    ['public/index.html',read('public/index.html').replace('interactive-widget=resizes-content','user-scalable=no')],
    ['scripts/build.mjs',read('scripts/build.mjs').replace("'mobile.css'","'mobile.css','unapproved.js'")],
    ['.ci/public-assets.json',read('.ci/public-assets.json').replace('legacy-source-pins-and-worker-embedding','unapproved-mode')]
  ];
  for(const [file,source]of variants) {
    assert.notEqual(source,read(file),'negative fixture changes source: '+file);
    assert.throws(()=>projectUnifyStage2(file,source),/approved workbench delta/);
  }
  const unrelated=read('web/core/todos-state.mjs')+'\n/* unauthorized */\n';
  assert.equal(projectUnifyStage2('web/core/todos-state.mjs',unrelated),unrelated,'business edits remain visible');
  assert.equal(projectUnifyStage2('web/core/../core/router.mjs','unapproved'),'unapproved','path aliases never normalize');
});

test('stage-two manifest cannot authorize another baseline, digest, module, asset or expanded scope',()=>{
  const variants=[];
  for(const field of ['before','after']) {
    const candidate=structuredClone(delta);candidate.files['public/app.js'][field]='0'.repeat(64);variants.push(candidate);
  }
  const expanded=structuredClone(delta);expanded.files['web/offline/sync.mjs']={before:null,after:'0'.repeat(64)};variants.push(expanded);
  const missing=structuredClone(delta);delete missing.files['public/mobile.css'];variants.push(missing);
  const moved=structuredClone(delta);moved.baseline='6e2e445e8a3e9f7a4af055f4cf75046cf6e5cd6c';variants.push(moved);
  for(const candidate of variants)assert.throws(()=>validateUnifyStage2Delta(candidate),/approved workbench delta/);
});

test('stage two composes through exact stage-one and historical manifests instead of replacing their contracts',()=>{
  const manifests=git('ls-tree','-r','--name-only',unifyStage2Baseline,'tests').trim().split('\n').filter(file=>file.endsWith('-delta.json'));
  for(const file of manifests)assert.equal(read(file),git('show',unifyStage2Baseline+':'+file),'historical manifest unchanged: '+file);
  assert.equal(read('.github/scripts/release-policy.mjs'),git('show',unifyStage2Baseline+':.github/scripts/release-policy.mjs'),
    'mobile UI never expands the production Worker allowlist');
  for(const file of unifyStage2Paths.filter(file=>file!=='public/mobile.css')) {
    assert.equal(projectUnifyStage1(file,read(file)),git('show','6e2e445e8a3e9f7a4af055f4cf75046cf6e5cd6c:'+file),
      'both reviewed layers restore the original source: '+file);
  }
  const file='web/core/router.mjs',old=git('show','947bc782ea70e7808f6e7de523e5977818b292df:'+file);
  assert.equal(projectUnifyStage2History(file,old),old);
  assert.throws(()=>projectUnifyStage2History(file,old+'\n/* unauthorized */\n'),/approved workbench delta/);
});

test('mobile stylesheet is embedded and served by unchanged static GET and HEAD behavior',async()=>{
  const bytes=Buffer.from(read('public/mobile.css'));
  assert.equal(assets['mobile.css'].content,bytes.toString());assert.equal(assets['mobile.css'].length,bytes.length);
  assert.equal(assets['mobile.css'].etag,'"'+stage2Hash(bytes)+'"');
  const control=await worker.fetch(new Request('http://localhost/glass.css'),{});
  for(const method of ['GET','HEAD']) {
    const response=await worker.fetch(new Request('http://localhost/mobile.css',{method,headers:{'If-None-Match':'*'}}),{});
    assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'text/css; charset=utf-8');
    assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.has('ETag'),false);
    assert.equal(response.headers.has('Set-Cookie'),false);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),method==='HEAD'?Buffer.alloc(0):bytes);
    for(const name of ['Content-Security-Policy','X-Content-Type-Options','Referrer-Policy','Permissions-Policy'])
      assert.equal(response.headers.get(name),control.headers.get(name),name);
  }
  assert.equal((await worker.fetch(new Request('http://localhost/mobile.css',{method:'POST'}),{})).status,404);
});
