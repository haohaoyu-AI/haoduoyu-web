import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {ciBudgetBaseline,ciBudgetPath,ciBudgetBefore,ciBudgetAfter,projectUnifyCIBudget} from './unify-ci-budget-projection.mjs';
import {projectUnifyStage1,projectUnifyStage1History,projectedChangedFiles} from './unify-stage1-projection.mjs';

const root=new URL('../',import.meta.url),read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});

test('CI budget changes only the existing build-test timeout from fifteen to thirty minutes',()=>{
  const before=ciBudgetBefore(),after=ciBudgetAfter(),current=read(ciBudgetPath);
  assert.equal(before,git('show',ciBudgetBaseline+':'+ciBudgetPath),'complete original workflow comes from the fixed accepted tree');
  assert.equal(current,after,'current workflow is exactly the reviewed budget change');
  const oldLines=before.split('\n'),newLines=after.split('\n');
  assert.equal(newLines.length,oldLines.length);
  assert.deepEqual(newLines.flatMap((line,index)=>line===oldLines[index]?[]:[[oldLines[index],line]]),
    [['    timeout-minutes: 15','    timeout-minutes: 30']]);
  assert.equal(JSON.parse(read('package.json')).scripts.test,
    'node scripts/build.mjs && node --test --test-concurrency=1 tests/*.test.mjs',
    'the complete serial test command stays enabled');
  assert.equal(projectUnifyCIBudget(ciBudgetPath,after),before);
  assert.equal(projectUnifyCIBudget(ciBudgetPath,before),before);
});

test('CI budget rejects changed runners, skipped tests, permissions, triggers and unrelated timeout edits',()=>{
  const after=ciBudgetAfter();
  const variants=[after+'\n',after.replace('timeout-minutes: 30','timeout-minutes: 60'),
    after.replace('timeout-minutes: 10','timeout-minutes: 30'),after.replace('runs-on: ubuntu-24.04','runs-on: paid-runner'),
    after.replace('      - run: npm test\n',''),after.replace('npm test','npm test -- --test-skip-pattern=.*'),
    after.replace('contents: read','contents: write'),after.replace("[main, 'opt/**']",'[main]'),
    after.replace('      - run: npm run check:previews\n','')];
  for(const variant of variants) {
    assert.notEqual(variant,after,'negative fixture changes workflow');
    assert.throws(()=>projectUnifyCIBudget(ciBudgetPath,variant),/approved workbench delta/);
  }
  assert.throws(()=>projectUnifyCIBudget(ciBudgetPath,ciBudgetBefore()+'\n'),/approved workbench delta/);
});

test('CI budget composes through stage one without changing any historical manifest or production release workflow',()=>{
  assert.equal(projectUnifyStage1(ciBudgetPath,read(ciBudgetPath)),ciBudgetBefore());
  assert.equal(projectUnifyStage1History(ciBudgetPath,read(ciBudgetPath)),ciBudgetBefore());
  assert.deepEqual(projectedChangedFiles(ciBudgetBaseline,['.github']),[],
    'only the exact CI timeout inverse is accepted; the rest of .github is still frozen');
  for(const file of ['tests/unify-stage1-delta.json','.github/workflows/cloudflare-manual-release.yml',
    '.github/scripts/release-policy.mjs']) {
    assert.equal(read(file),git('show','72d26abb94d316e08b63cf12924c157f1bc8e3cd:'+file),file+' remains byte-identical');
  }
  const unrelated='unapproved source';
  for(const file of ['.github/workflows/other.yml','.github/workflows/../workflows/ci.yml',
    '/'+ciBudgetPath,'src/worker.mjs'])assert.equal(projectUnifyCIBudget(file,unrelated),unrelated,
      'unrelated edits and aliases are never normalized: '+file);
});
