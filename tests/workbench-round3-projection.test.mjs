import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {projectWorkbenchRound3,round3DocumentSpec} from './workbench-round3-projection.mjs';
test('round-three code and additive migration are pinned exactly; unrelated changes remain rejected',async()=>{
  const delta=JSON.parse(await readFile(new URL('./workbench-round3-delta.json',import.meta.url),'utf8'));
  for(const file of Object.keys(delta.files)) {
    const source=await readFile(new URL('../'+file,import.meta.url),'utf8');
    assert.notEqual(projectWorkbenchRound3(file,source),source);
    assert.throws(()=>projectWorkbenchRound3(file,source+'\n/* unauthorized change */\n'),/approved workbench delta/);
  }
  const spec=JSON.parse(await readFile(new URL('../public/openapi.json',import.meta.url),'utf8'));
  assert.ok(!round3DocumentSpec(spec).paths['/api/v1/daily-notes']);
  spec.paths['/api/v1/daily-notes'].get.summary='unapproved';
  assert.throws(()=>round3DocumentSpec(spec),/exact approved article contract/);
});
