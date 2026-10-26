import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {projectWorkbenchRound5,round5AddedModules} from './workbench-round5-projection.mjs';
import {projectWorkbenchRound6} from './workbench-round6-projection.mjs';
import {projectedChangedFiles} from './unify-stage1-projection.mjs';

const root=new URL('../',import.meta.url),hash=value=>createHash('sha256').update(value).digest('hex');
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
const delta=JSON.parse(await read('tests/workbench-round5-delta.json'));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});

test('round-five presentation files and explicit new module are pinned over the released frontend',async()=>{
  assert.equal(delta.baseline,'ae1fafe292755ba01df5a8a639b74245eec72752');
  assert.deepEqual(delta.added_modules,round5AddedModules);
  const added=Object.entries(delta.files).filter(([file,entry])=>file.startsWith('web/')&&entry.before===null).map(([file])=>file).sort();
  assert.deepEqual(added,[...round5AddedModules].sort());
  for(const [file,entry]of Object.entries(delta.files)) {
    assert.ok(file.startsWith('web/')||['public/app.js','public/workbench.css'].includes(file),'frontend-only pin: '+file);
    const current=await read(file),source=projectWorkbenchRound6(file,current);
    assert.equal(hash(source),entry.after,'on-disk round-five source stays exact: '+file);
    assert.equal(projectWorkbenchRound5(file,source),entry.before===null?'':git('show',delta.baseline+':'+file));
    assert.throws(()=>projectWorkbenchRound5(file,current+'\n/* unauthorized change */\n'),/approved workbench delta/);
  }
  const roots=['web','public','src','shared','db','drizzle','scripts'];
  const inventory=projectedChangedFiles(delta.baseline,roots,projectWorkbenchRound6);
  assert.deepEqual(inventory,Object.keys(delta.files).sort(),'only explicitly pinned presentation changes are accepted');
  const released=git('ls-tree','-r','--name-only',delta.baseline,'web').trim().split('\n').filter(file=>file.endsWith('.mjs'));
  const modules=(await readdir(new URL('../web/',import.meta.url),{recursive:true})).filter(file=>file.endsWith('.mjs')).map(file=>'web/'+file).sort();
  assert.deepEqual(modules,[...released,...round5AddedModules].sort(),'complete released module inventory plus exact new view helper');
});

test('round-five leaves every backend, schema, snapshot, backup and public API documentation byte unchanged',()=>{
  const immutable=['src','shared','db','drizzle','scripts','runtime.json','package.json','package-lock.json',
    'public/openapi.json','public/api-docs.html','public/llms.txt'];
  assert.deepEqual(projectedChangedFiles(delta.baseline,immutable),[],
    'only the exact stage-one static asset registration is reversed; server and contract bytes remain unchanged');
});
