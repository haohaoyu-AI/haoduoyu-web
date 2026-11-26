import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {historicalTree} from './historical-tree.mjs';
import {quietSyncBaseline} from './oct28-small-fix-projection.mjs';
import {projectWorkbenchRound3,round3DocumentSpec} from './workbench-round3-projection.mjs';
const archived=historicalTree(quietSyncBaseline);

test('archived round-three code and additive migration are pinned exactly; unrelated changes remain rejected',async()=>{
  const delta=JSON.parse(await readFile(new URL('./workbench-round3-delta.json',import.meta.url),'utf8'));
  for(const file of Object.keys(delta.files)) {
    const source=archived.read(file);
    assert.notEqual(projectWorkbenchRound3(file,source),source);
    assert.throws(()=>projectWorkbenchRound3(file,source+'\n/* unauthorized change */\n'),/approved workbench delta/);
  }
  const spec=JSON.parse(archived.read('public/openapi.json'));
  assert.ok(!round3DocumentSpec(spec).paths['/api/v1/daily-notes']);
  spec.paths['/api/v1/daily-notes'].get.summary='unapproved';
  assert.throws(()=>round3DocumentSpec(spec),/exact approved article contract/);
});
