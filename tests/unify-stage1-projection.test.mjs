import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cp,mkdtemp,readFile,rm,symlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import worker from '../dist/server/index.js';
import {assets} from '../src/assets.generated.mjs';
import {unifyStage1Baseline,unifyStage1Paths,unifyStage1Styles,unifyStage1Before,unifyStage1Manifest,
  validateUnifyStage1Delta,projectUnifyStage1,projectUnifyStage1History,projectedChangedFiles,expandStage1Css,stage1Hash} from './unify-stage1-projection.mjs';
import {projectUnifyStage2} from './unify-stage2-projection.mjs';
import {projectOct28History} from './oct28-projection.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=file=>readFileSync(join(root,file),'utf8');
const stage1Read=file=>projectUnifyStage2(file,read(file));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const delta=unifyStage1Manifest();

test('stage one pins only constant extraction and its asset wiring over the fixed released source',()=>{
  for(const file of unifyStage1Paths) {
    const source=stage1Read(file);
    assert.equal(stage1Hash(source),delta.files[file].after,'current source must be the reviewed after bytes: '+file);
    assert.equal(projectUnifyStage1(file,source),unifyStage1Before(file),file);
    assert.equal(projectUnifyStage1(file,unifyStage1Before(file)),unifyStage1Before(file),'exact released input remains valid');
  }
  for(const file of unifyStage1Styles)assert.equal(expandStage1Css(projectOct28History(file,read(file))),unifyStage1Before(file),file+' complete CSS bytes');
  const roots=['public','web','src','shared','db','drizzle','scripts','.ci','.github','runtime.json','package.json','package-lock.json'];
  assert.deepEqual(projectedChangedFiles(unifyStage1Baseline,roots),[],
    'no application, API, store, schema, policy, deployment or extra asset change is concealed');
  assert.equal(stage1Read('public/app.js'),git('show',unifyStage1Baseline+':public/app.js'),
    'the reviewed stage-two inverse restores the unchanged stage-one JavaScript');
});

test('stage-one manifest cannot authorize a new path, token, digest or baseline',()=>{
  const variants=[];
  for(const field of ['before','after']) {
    const candidate=structuredClone(delta);candidate.files['public/style.css'][field]='0'.repeat(64);variants.push(candidate);
  }
  const expanded=structuredClone(delta);expanded.files['src/worker.mjs']={...expanded.files['scripts/build.mjs']};variants.push(expanded);
  const missing=structuredClone(delta);delete missing.files['public/tokens.css'];variants.push(missing);
  const moved=structuredClone(delta);moved.baseline='947bc782ea70e7808f6e7de523e5977818b292df';variants.push(moved);
  const selfAuthorized=structuredClone(delta);selfAuthorized.files['public/tokens.css'].after=stage1Hash(read('public/tokens.css')+'\n');variants.push(selfAuthorized);
  for(const candidate of variants)assert.throws(()=>validateUnifyStage1Delta(candidate),/approved workbench delta/);
});

test('strict current inverse rejects extra CSS, changed tokens, duplicate links and expanded asset wiring',()=>{
  for(const file of unifyStage1Paths)assert.throws(()=>projectUnifyStage1(file,stage1Read(file)+'\n'),/approved workbench delta/,file);
  const mutations=[
    ['public/style.css',read('public/style.css').replace('var(--color-base-background)','var(--color-primary)')],
    ['public/tokens.css',read('public/tokens.css').replace('--color-primary:#a44e38','--color-primary:#000000')],
    ['public/index.html',stage1Read('public/index.html').replace('href="/tokens.css">','href="/tokens.css">\n    <link rel="stylesheet" href="/tokens.css">')],
    ['scripts/build.mjs',stage1Read('scripts/build.mjs').replace("'tokens.css'","'tokens.css','unapproved.css'")],
    ['.ci/public-assets.json',stage1Read('.ci/public-assets.json').replace('legacy-source-pins-and-worker-embedding','unapproved-mode')]
  ];
  for(const [file,source]of mutations) {
    assert.notEqual(source,stage1Read(file),'negative fixture changes source: '+file);
    assert.throws(()=>projectUnifyStage1(file,source),/approved workbench delta/);
  }
  const unrelated=read('src/worker.mjs')+'\n/* unapproved */\n';
  assert.throws(()=>projectUnifyStage1('src/worker.mjs',unrelated),/approved workbench delta/,
    'the later narrow SW inverse rejects any unreviewed Worker bytes before historical projection');
  const business=read('src/records.mjs')+'\n/* unapproved */\n';
  assert.equal(projectUnifyStage1('src/records.mjs',business),business,'unapproved business edits remain visible to inventory checks');
  assert.equal(projectUnifyStage1('public/../public/style.css','unapproved'),'unapproved','aliases never receive a normalization');
});

test('history adapter accepts only fixed checkpoint blobs and never arbitrary legacy CSS',()=>{
  const file='public/style.css',old=git('show','37a1e4f2618e1fea6ded05911b2a73572968442a:'+file);
  assert.equal(projectUnifyStage1History(file,old),old);
  assert.throws(()=>projectUnifyStage1History(file,old+'\n/* changed old CSS */\n'),/approved workbench delta/);
  assert.equal(projectUnifyStage1History(file,read(file)),unifyStage1Before(file));
  const historical=git('ls-tree','-r','--name-only',unifyStage1Baseline,'tests').trim().split('\n').filter(file=>file.endsWith('-delta.json'));
  for(const manifest of historical)assert.equal(read(manifest),git('show',unifyStage1Baseline+':'+manifest),'historical manifest unchanged: '+manifest);
  assert.equal(read('.github/scripts/release-policy.mjs'),git('show',unifyStage1Baseline+':.github/scripts/release-policy.mjs'),'production release allowlist unchanged');
});

test('new token asset uses the existing static GET and HEAD path without changing cache or security policy',async()=>{
  const bytes=Buffer.from(read('public/tokens.css'));
  assert.equal(assets['tokens.css'].content,bytes.toString());
  assert.equal(assets['tokens.css'].etag,'"'+stage1Hash(bytes)+'"');assert.equal(assets['tokens.css'].length,bytes.length);
  const control=await worker.fetch(new Request('http://localhost/glass.css'),{});
  for(const method of ['GET','HEAD']) {
    const response=await worker.fetch(new Request('http://localhost/tokens.css',{method,headers:{'If-None-Match':'*'}}),{});
    assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'text/css; charset=utf-8');
    assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.has('ETag'),false);
    assert.equal(response.headers.has('Set-Cookie'),false);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),method==='HEAD'?Buffer.alloc(0):bytes);
    for(const name of ['Content-Security-Policy','X-Content-Type-Options','Referrer-Policy','Permissions-Policy'])
      assert.equal(response.headers.get(name),control.headers.get(name),name);
  }
  const rejected=await worker.fetch(new Request('http://localhost/tokens.css',{method:'POST'}),{});
  assert.equal(rejected.status,404);
});

test('current reviewed Worker matches a fresh isolated deterministic build independently of old stage artifacts',async t=>{
  const copy=await mkdtemp(join(tmpdir(),'haoduoyu-stage1-build-'));
  t.after(()=>rm(copy,{recursive:true,force:true}));
  for(const path of ['scripts','src','shared','public','web','drizzle','.openai','runtime.json','package.json'])
    await cp(join(root,path),join(copy,path),{recursive:true});
  await symlink(join(root,'node_modules'),join(copy,'node_modules'),'dir');
  execFileSync(process.execPath,['scripts/build.mjs'],{cwd:copy,timeout:60000,env:{PATH:process.env.PATH},stdio:'pipe'});
  assert.deepEqual(await readFile(join(copy,'dist/server/index.js')),await readFile(join(root,'dist/server/index.js')),
    'the current artifact is checked independently from all historical release pins');
  assert.equal(await readFile(join(copy,'public/app.js'),'utf8'),read('public/app.js'),'independent build matches the actual reviewed JavaScript bundle');
});
