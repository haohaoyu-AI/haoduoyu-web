import {projectReconciliation} from './reconciliation-ui-projection.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {projectWorkbenchFrontend,workbenchAddedModules} from './workbench-ui-projection.mjs';
test('workbench acceptance pins exact authorized UI edits and rejects unrelated changes',async()=>{
  for(const file of [...workbenchAddedModules,'web/controller.mjs','web/core/memos-state.mjs','web/pages/todos.mjs']) {
    const source=projectReconciliation(file,await readFile(new URL('../'+file,import.meta.url),'utf8'));
    await projectWorkbenchFrontend(file,source);
    await assert.rejects(projectWorkbenchFrontend(file,source+'\nconst unauthorizedWorkbenchChange=true;\n'),/approved workbench delta/);
  }
});
