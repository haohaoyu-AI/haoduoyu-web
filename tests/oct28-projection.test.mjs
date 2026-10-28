import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {oct28Baseline,oct28Product,approvedPaths,addedModules,reviewedOct28Manifest,validateOct28Manifest,
  projectOct28,projectOct28History,projectOct28Modules} from './oct28-projection.mjs';
import {projectUnifyConflictResolution} from './unify-conflict-resolution-projection.mjs';
import {projectedChangedFiles} from './unify-stage1-projection.mjs';

const root=new URL('../',import.meta.url);
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
const hash=value=>createHash('sha256').update(value).digest('hex');
const roots=['public','web','src','shared','db','drizzle','migration-candidates','scripts','.ci','.github','.openai',
  '.gitattributes','.gitignore','.gitleaks.toml','.gitleaksignore','drizzle.config.ts','runtime.json','package.json','package-lock.json'];
const old=file=>git('ls-tree','--name-only',oct28Baseline,'--',file).trim()?git('show',oct28Baseline+':'+file):'';

test('October candidate is exactly the reviewed 52-path change over the fixed production baseline',()=>{
  const delta=reviewedOct28Manifest();
  assert.equal(approvedPaths.length,52);
  assert.deepEqual(git('diff','--name-only',oct28Baseline,oct28Product,'--',...roots).trim().split('\n'),[...approvedPaths]);
  for(const file of approvedPaths) {
    const source=read(file);
    assert.equal(hash(source),delta.files[file].after,'actual current bytes: '+file);
    assert.equal(projectOct28(file,source),old(file),'exact b242 inverse: '+file);
    assert.equal(projectOct28(file,old(file)),old(file),'exact baseline remains valid: '+file);
  }
  assert.deepEqual(projectedChangedFiles(oct28Baseline,roots,projectOct28),[],
    'other changed, untracked or deleted production paths remain visible');
});

test('only the three exact reviewed web additions can project to absence',()=>{
  const previous=git('ls-tree','-r','--name-only',oct28Baseline,'web').trim().split('\n').filter(x=>x.endsWith('.mjs')).sort();
  const current=readdirSync(new URL('../web/',import.meta.url),{recursive:true}).filter(x=>x.endsWith('.mjs')).map(x=>'web/'+x).sort();
  assert.deepEqual(addedModules,['web/core/notes-history.mjs','web/core/notes-month.mjs','web/pages/unscheduled-todos.mjs']);
  assert.deepEqual(current,[...previous,...addedModules].sort());
  assert.deepEqual(projectOct28Modules(current),previous);
  for(const file of addedModules) {
    assert.throws(()=>projectOct28Modules([file],()=>''),/approved workbench delta/,'missing '+file);
    assert.throws(()=>projectOct28Modules([file],()=>read(file)+'\n'),/approved workbench delta/,'changed '+file);
  }
  assert.deepEqual(projectOct28Modules(['web/core/unapproved.mjs']),['web/core/unapproved.mjs']);
});

test('manifest cannot authorize moved commits, unknown paths, changed hashes, modules or its own tampering',()=>{
  const delta=reviewedOct28Manifest(),variants=[];
  for(const key of ['baseline','patch_commit']) {const d=structuredClone(delta);d[key]='0'.repeat(40);variants.push(d);}
  for(const key of ['before','after']) {const d=structuredClone(delta);d.files['src/worker.mjs'][key]='0'.repeat(64);variants.push(d);}
  const extra=structuredClone(delta);extra.files['runtime.json']={before:'0'.repeat(64),after:'0'.repeat(64)};variants.push(extra);
  const missing=structuredClone(delta);delete missing.files['src/worker.mjs'];variants.push(missing);
  const modules=structuredClone(delta);modules.added_modules.push('web/core/api.mjs');variants.push(modules);
  const self=structuredClone(delta);self.files['src/worker.mjs'].after=hash(read('src/worker.mjs')+'\n');variants.push(self);
  for(const d of variants)assert.throws(()=>validateOct28Manifest(d),/approved workbench delta/);
});

test('current and historical inverses reject forged bytes without extending the previous E layer',()=>{
  for(const file of approvedPaths) {
    assert.throws(()=>projectOct28(file,read(file)+'\n/* unapproved */\n'),/approved workbench delta/,file);
    assert.throws(()=>projectOct28History(file,read(file)+'\n/* unapproved */\n'),/approved workbench delta/,file);
    const oldValue=old(file);
    assert.throws(()=>projectOct28(file,oldValue+'\n/* unapproved */\n'),/approved workbench delta/,file+' old');
  }
  assert.equal(projectOct28('public/../public/app.js','forged'),'forged');
  assert.equal(projectOct28('runtime.json','forged'),'forged');
  assert.equal(projectUnifyConflictResolution('src/worker.mjs','forged'),'forged',
    'E retains its original unrelated-path behavior');
});

test('old manifests and release configuration are byte-for-byte unchanged',()=>{
  const manifests=git('ls-tree','-r','--name-only',oct28Baseline,'tests').trim().split('\n').filter(file=>file.endsWith('-delta.json'));
  for(const file of manifests)assert.equal(read(file),git('show',oct28Baseline+':'+file),file);
  for(const file of ['runtime.json','package.json','package-lock.json','.github/scripts/release-policy.mjs',
    '.github/workflows/ci.yml','.github/workflows/cloudflare-manual-release.yml','.github/scripts/cloudflare-publish.mjs','.openai/hosting.json'])
    assert.equal(read(file),git('show',oct28Baseline+':'+file),file);
});
