import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {historicalTree} from './historical-tree.mjs';
import {quietSyncBaseline} from './oct28-small-fix-projection.mjs';
import {projectWorkbenchRound2} from './workbench-round2-projection.mjs';
const archived=historicalTree(quietSyncBaseline);

test('archived round-two UI changes are exact and unrelated added code is rejected',async()=>{
  const manifest=JSON.parse(await readFile(new URL('./workbench-round2-delta.json',import.meta.url),'utf8'));
  for(const file of Object.keys(manifest.files)) {
    const source=archived.read(file);
    const baseline=historicalTree(manifest.baseline).read(file);
    assert.equal(projectWorkbenchRound2(file,source),baseline,'exact round-two baseline remains protected: '+file);
    assert.throws(()=>projectWorkbenchRound2(file,source+'\nconst unauthorizedRound2Change=true;\n'),/approved workbench delta/);
  }
});
