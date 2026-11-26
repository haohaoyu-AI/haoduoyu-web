import {projectReconciliation} from './reconciliation-ui-projection.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {historicalTree} from './historical-tree.mjs';
import {quietSyncBaseline} from './oct28-small-fix-projection.mjs';
import {projectWorkbenchFrontend,workbenchAddedModules} from './workbench-ui-projection.mjs';
const archived=historicalTree(quietSyncBaseline);

test('archived workbench acceptance pins exact authorized UI edits and rejects unrelated changes',async()=>{
  for(const file of [...workbenchAddedModules,'web/controller.mjs','web/core/memos-state.mjs','web/pages/todos.mjs']) {
    const source=projectReconciliation(file,archived.read(file));
    await projectWorkbenchFrontend(file,source);
    await assert.rejects(projectWorkbenchFrontend(file,source+'\nconst unauthorizedWorkbenchChange=true;\n'),/approved workbench delta/);
  }
});
