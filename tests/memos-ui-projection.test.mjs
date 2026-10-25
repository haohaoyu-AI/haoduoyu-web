import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {memoAddedModules, projectMemoFrontend, verifyMemoFrontendBoundary} from './memos-ui-projection.mjs';

test('combined frontend boundary pins each memo module and every released article source',async()=>{
  await verifyMemoFrontendBoundary();
  for(const file of memoAddedModules) {
    const source=await readFile(new URL('../'+file,import.meta.url),'utf8');
    assert.equal(await projectMemoFrontend(file,source),'');
    await assert.rejects(projectMemoFrontend(file,source+'\nconst unapprovedMemoDeclaration=true;\n'),/exact accepted memo module bytes|approved workbench delta/);
  }
});
test('memo projection cannot authorize edits to released article functions or unrelated state',async()=>{
  const file='web/controller.mjs',source=await readFile(new URL('../'+file,import.meta.url),'utf8');
  const mutation=source.replace('await loadArticleOverview(version, context)','await loadMemos(version, context)');
  assert.notEqual(mutation,source);
  await assert.rejects(projectMemoFrontend(file,mutation),/exact memo additions retain every released article frontend AST node|approved workbench delta/);
});
