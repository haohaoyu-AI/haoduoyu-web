import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {projectWorkbenchRound2} from './workbench-round2-projection.mjs';
test('round-two UI changes are exact and unrelated added code is rejected',async()=>{
  const manifest=JSON.parse(await readFile(new URL('./workbench-round2-delta.json',import.meta.url),'utf8'));
  for(const file of Object.keys(manifest.files)) {
    const source=await readFile(new URL('../'+file,import.meta.url),'utf8');
    const baseline=execFileSync('git',['show',manifest.baseline+':'+file],{cwd:new URL('../',import.meta.url),encoding:'utf8',maxBuffer:2*1024*1024});
    assert.equal(projectWorkbenchRound2(file,source),baseline,'exact round-two baseline remains protected: '+file);
    assert.throws(()=>projectWorkbenchRound2(file,source+'\nconst unauthorizedRound2Change=true;\n'),/approved workbench delta/);
  }
});
