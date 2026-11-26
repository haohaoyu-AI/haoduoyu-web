import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {historicalTree} from './historical-tree.mjs';
import {createHash} from 'node:crypto';
import {projectWorkbenchRound5,round5AddedModules} from './workbench-round5-projection.mjs';
import {projectWorkbenchRound6} from './workbench-round6-projection.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
const delta=JSON.parse(await read('tests/workbench-round5-delta.json'));
const before=historicalTree(delta.baseline);
const archived=historicalTree('16ff80ef2d857676d81b7c219110c820de5af72b');

test('archived round-five presentation files and explicit new module are pinned over the preceding release',()=>{
  assert.equal(delta.baseline,'ae1fafe292755ba01df5a8a639b74245eec72752');
  assert.deepEqual(delta.added_modules,round5AddedModules);
  const added=Object.entries(delta.files).filter(([file,entry])=>file.startsWith('web/')&&entry.before===null).map(([file])=>file).sort();
  assert.deepEqual(added,[...round5AddedModules].sort());
  for(const [file,entry]of Object.entries(delta.files)) {
    assert.ok(file.startsWith('web/')||['public/app.js','public/workbench.css'].includes(file),'frontend-only pin: '+file);
    const current=archived.read(file),source=projectWorkbenchRound6(file,current);
    assert.equal(hash(source),entry.after,'released round-five source stays exact: '+file);
    assert.equal(projectWorkbenchRound5(file,source),entry.before===null?'':before.read(file));
    assert.throws(()=>projectWorkbenchRound5(file,current+'\n/* unauthorized change */\n'),/approved workbench delta/);
  }
  const roots=['web','public','src','shared','db','drizzle','scripts'];
  const inventory=archived.changedSince(delta.baseline,...roots).sort();
  assert.deepEqual(inventory,Object.keys(delta.files).sort(),'only explicitly pinned presentation changes are accepted');
  const released=before.files('web').filter(file=>file.endsWith('.mjs'));
  const modules=archived.files('web').filter(file=>file.endsWith('.mjs')).sort();
  assert.deepEqual(modules,[...released,...round5AddedModules].sort(),'complete released module inventory plus exact new view helper');
});

test('archived round five preserves every backend, schema, snapshot, backup and public API documentation byte',()=>{
  const immutable=['src','shared','db','drizzle','scripts','runtime.json','package.json','package-lock.json',
    'public/openapi.json','public/api-docs.html','public/llms.txt'];
  assert.deepEqual(archived.changedSince(delta.baseline,...immutable),[]);
});
