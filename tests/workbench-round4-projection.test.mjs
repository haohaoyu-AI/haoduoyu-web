import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {projectWorkbenchRound4,round4AddedModules,round4DocumentSpec,round4DocumentDocs} from './workbench-round4-projection.mjs';
import {projectWorkbenchRound5} from './workbench-round5-projection.mjs';
import {projectedChangedFiles} from './unify-stage1-projection.mjs';

const root=new URL('../',import.meta.url),hash=value=>createHash('sha256').update(value).digest('hex');
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
const delta=JSON.parse(await read('tests/workbench-round4-delta.json'));
const before=file=>execFileSync('git',['show',delta.baseline+':'+file],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});

test('round-four production files and three new frontend modules are pinned; unrelated changes remain rejected',async()=>{
  assert.equal(delta.baseline,'4aefa4d4d596ad540324bc78898ae208121647b4');
  const newFrontend=Object.entries(delta.files).filter(([file,entry])=>file.startsWith('web/')&&entry.before===null).map(([file])=>file).sort();
  assert.deepEqual(newFrontend,[...round4AddedModules].sort());
  for(const [file,entry]of Object.entries(delta.files)) {
    const current=await read(file),source=projectWorkbenchRound5(file,current);
    assert.equal(hash(source),entry.after,'on-disk round-four source stays exact: '+file);
    assert.equal(projectWorkbenchRound4(file,source),entry.before===null?'':before(file),file);
    assert.throws(()=>projectWorkbenchRound4(file,current+'\n/* unauthorized change */\n'),/approved workbench delta/);
  }
  const roots=['db','drizzle','public','scripts','src','web'];
  const inventory=projectedChangedFiles(delta.baseline,roots,projectWorkbenchRound5);
  assert.deepEqual(inventory,Object.keys(delta.files).sort(),'only explicitly pinned production changes are accepted');
});

test('round-four API projection restores exact earlier contracts and leaves unrelated edits visible',async()=>{
  const spec=JSON.parse(await read('public/openapi.json'));
  assert.deepEqual(round4DocumentSpec(spec),JSON.parse(before('public/openapi.json')));
  const unrelated=structuredClone(spec);unrelated.info['x-unapproved-test']='visible';
  assert.equal(round4DocumentSpec(unrelated).info['x-unapproved-test'],'visible');
  for(const change of delta.spec_changes.filter(change=>change.now)) {
    const changed=structuredClone(spec);let parent=changed;
    for(const name of change.path.slice(0,-1))parent=parent[name];
    parent[change.path.at(-1)]='unapproved';
    assert.throws(()=>round4DocumentSpec(changed),/round-four API|exact approved article contract/);
  }
});

test('round-four docs strip only the approved appended section and preserve other documentation edits',async()=>{
  const html=await read('public/api-docs.html');
  assert.equal(round4DocumentDocs(html),before('public/api-docs.html'));
  assert.equal(round4DocumentDocs(html+'\n<!-- unrelated-test -->'),before('public/api-docs.html')+'\n<!-- unrelated-test -->');
  if(delta.docs_section) {
    const changed=html.replace(delta.docs_section.start,delta.docs_section.start+'unapproved');
    assert.throws(()=>round4DocumentDocs(changed),/approved workbench delta/);
  }
});
