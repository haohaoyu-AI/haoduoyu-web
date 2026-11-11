import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {projectWorkbenchRound6Badge,round6BadgePaths,validateWorkbenchRound6BadgeDelta} from './workbench-round6-badge-projection.mjs';
import {projectWorkbenchRound6} from './workbench-round6-projection.mjs';
import {projectUnifyStage1} from './unify-stage1-projection.mjs';

const root=new URL('../',import.meta.url),hash=value=>createHash('sha256').update(value).digest('hex');
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});
const delta=JSON.parse(read('tests/workbench-round6-badge-delta.json'));
const historical=JSON.parse(read('tests/workbench-round6-delta.json'));
const before=file=>git('show',delta.baseline+':'+file),after=file=>git('show',delta.patch_commit+':'+file);
const notes='web/pages/daily-notes.mjs',bundle='public/app.js',assets='.ci/public-assets.json';

test('badge manifest pins the exact reviewed three-file patch, released workers and unchanged historical delta',()=>{
  assert.equal(delta.baseline,'947bc782ea70e7808f6e7de523e5977818b292df');
  assert.equal(delta.patch_commit,'3a87479d30ac4cf2b9bc484a51106713fa4c510f');
  assert.deepEqual(round6BadgePaths,[notes,bundle,assets]);
  assert.deepEqual(git('diff','--name-only',delta.baseline,delta.patch_commit).trim().split('\n').sort(),[notes,bundle,assets].sort());
  assert.equal(validateWorkbenchRound6BadgeDelta(delta),delta);
  assert.equal(read('tests/workbench-round6-delta.json'),git('show',delta.baseline+':tests/workbench-round6-delta.json'),
    'the prior reviewed round-six manifest is never rewritten');
  assert.equal(delta.files[notes].before,historical.files[notes].after);
  assert.equal(delta.files[bundle].before,historical.files[bundle].after);
});

test('badge inverse accepts only released 947 or reviewed patch bytes and restores all three files exactly',()=>{
  for(const file of round6BadgePaths) {
    const original=before(file),patched=after(file),current=read(file);
    assert.equal(hash(original),delta.files[file].before);assert.equal(hash(patched),delta.files[file].after);
    assert.equal(projectWorkbenchRound6Badge(file,original),original,file);
    assert.equal(projectWorkbenchRound6Badge(file,patched),original,file);
    assert.equal(projectWorkbenchRound6Badge(file,projectUnifyStage1(file,current)),original,
      'on-disk badge scope stays exact after the independently verified stage-one inverse: '+file);
    assert.throws(()=>projectWorkbenchRound6Badge(file,patched+'\n'),/approved workbench delta/,file+' extra newline');
    assert.throws(()=>projectWorkbenchRound6Badge(file,original+'\n/* unreviewed */\n'),/approved workbench delta/,file+' base mutation');
  }
});

test('badge inverse rejects edited, relocated or duplicated data-phase lines rather than deleting arbitrary matching text',()=>{
  for(const [file,line]of [[notes,"  node.querySelector('.note-entry-status').dataset.phase = legacy.phase;\n"],
    [bundle,'  node.querySelector(".note-entry-status").dataset.phase = legacy.phase;\n']]) {
    const original=before(file),patched=after(file);
    assert.equal(patched.replace(line,''),original,'the audited source or generated bundle edit is exactly one line');
    const variants=[patched.replace('dataset.phase = legacy.phase','dataset.phase = "saved"'),
      patched.replace(line,line.replace('  node','   node')),original+line,patched+line,patched+'\0'];
    for(const variant of variants) {
      assert.notEqual(variant,patched);assert.notEqual(variant,original);
      assert.throws(()=>projectWorkbenchRound6Badge(file,variant),/approved workbench delta/);
      assert.throws(()=>projectWorkbenchRound6(file,variant),/approved workbench delta/,'old round-six entry cannot bypass the strict inverse');
    }
  }
});

test('badge inverse rejects asset manifest edits beyond the single approved generated-bundle digest',()=>{
  const patched=after(assets),parsed=JSON.parse(patched);
  const variants=[patched.replace('legacy-source-pins-and-worker-embedding','unreviewed-mode'),
    patched.replace(parsed.files['style.css'],'0'.repeat(64)),patched.replace(parsed.baseline,delta.baseline),
    JSON.stringify(parsed,null,4)+'\n'];
  for(const variant of variants) assert.throws(()=>projectWorkbenchRound6Badge(assets,variant),/approved workbench delta/);
});

test('badge scope rejects business files, path aliases and manifests that expand or replace the reviewed file set',()=>{
  for(const file of ['src/worker.mjs','web/core/daily-notes-state.mjs','web/pages/../pages/daily-notes.mjs','/'+notes,notes+'.bak']) {
    assert.throws(()=>projectWorkbenchRound6Badge(file,after(notes)),/approved workbench delta.*scope/);
  }
  const expanded=structuredClone(delta);expanded.files['src/worker.mjs']={...expanded.files[notes]};
  assert.throws(()=>validateWorkbenchRound6BadgeDelta(expanded),/approved workbench delta.*scope/);
  const replaced=structuredClone(delta);replaced.files['web/core/daily-notes-state.mjs']=replaced.files[notes];delete replaced.files[notes];
  assert.throws(()=>validateWorkbenchRound6BadgeDelta(replaced),/approved workbench delta.*scope/);
  const missing=structuredClone(delta);delete missing.files[assets];
  assert.throws(()=>validateWorkbenchRound6BadgeDelta(missing),/approved workbench delta.*scope/);
});

test('badge manifest cannot self-authorize a new hash, commit or worker artifact',()=>{
  const variants=[];
  for(const field of ['baseline','patch_commit']) {const changed=structuredClone(delta);changed[field]=historical.baseline;variants.push(changed);}
  for(const field of ['before','after']) {
    const changed=structuredClone(delta);changed.files[notes][field]=hash(after(notes)+'\n/* unapproved */\n');variants.push(changed);
  }
  for(const field of ['base_worker','worker']) {
    const changed=structuredClone(delta);changed[field].bytes++;variants.push(changed);
    const digest=structuredClone(delta);digest[field].sha256='0'.repeat(64);variants.push(digest);
  }
  for(const variant of variants) assert.throws(()=>validateWorkbenchRound6BadgeDelta(variant),/approved workbench delta/);
});

test('the original round-six before hashes remain valid and arbitrary old-baseline changes still fail',()=>{
  for(const [file,entry]of Object.entries(historical.files)) {
    const original=git('show',historical.baseline+':'+file);
    assert.equal(hash(original),entry.before);assert.equal(projectWorkbenchRound6(file,original),original,file);
    assert.throws(()=>projectWorkbenchRound6(file,original+'\n/* unauthorized historical change */\n'),/approved workbench delta/);
  }
});

test('reviewed badge bytes compose through the unchanged round-six hashes rather than replacing them',()=>{
  for(const file of [notes,bundle]) {
    const roundSix=before(file),original=git('show',historical.baseline+':'+file);
    assert.equal(hash(roundSix),historical.files[file].after);
    assert.equal(projectWorkbenchRound6(file,roundSix),original,file+' prior release');
    assert.equal(projectWorkbenchRound6(file,after(file)),original,file+' reviewed badge patch');
  }
  assert.equal(projectWorkbenchRound6(assets,after(assets)),before(assets));
});
