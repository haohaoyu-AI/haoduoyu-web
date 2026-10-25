import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {phase7Baseline,phase7Manifest,projectPhase7Frontend,verifyPhase7FrontendBoundary} from './article-pipeline-ui-projection.mjs';

test('the bounded Phase7 declaration manifest preserves the full historical frontend and protected source bytes',async()=>{
  await verifyPhase7FrontendBoundary();
  const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  assert.equal(await projectPhase7Frontend('public/app.js',source),phase7Baseline('public/app.js'));
});
test('Phase7 projection refuses edits to approved nodes, unrelated properties and new declarations',async()=>{
  const file='web/core/constants.mjs',source=await readFile(new URL('../'+file,import.meta.url),'utf8');
  for(const mutation of [source.replace('今日头条','未授权平台名'),source.replace('draft_saved: "草稿已存"','draft_saved: "未授权状态名"'),
    source+'\nconst unapprovedPhase7Declaration = true;\n']) {
    assert.notEqual(mutation,source,'mutation fixture must change the source');
    await assert.rejects(projectPhase7Frontend(file,mutation),/exact approved Phase7 AST changes|exact memo additions retain every released article frontend AST node|approved workbench delta/);
  }
  const delta=await phase7Manifest();
  assert.ok(delta.sources['web/core/state.mjs'].some(row=>row.key==='variable:state.articleOverviewMode'));
  assert.equal(delta.sources['web/core/state.mjs'].some(row=>row.key==='variable:state.todoDate'),false);
  assert.equal(Object.hasOwn(delta.sources,'web/pages/dashboard.mjs'),false);
  assert.equal(Object.keys(delta.sources).some(file=>/todo|daily-notes/.test(file)),false);
});
